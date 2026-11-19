// File: src/js/pages/mapPage.js
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Chart from "chart.js/auto";
import { renderHeader } from "../components/header.js";
import { renderFooter } from "../components/footer.js";
import { renderMapView } from "../views/mapView.js";
import { buildHourlySpeedSeries } from "../services/segmentSpeedChart.js";
import {
  API_BASE_URL,
  fetchEdges,
  fetchMapForecast,
  parseSpeedKmh,
  request,
  CONGESTION_LEVELS,
  NO_DATA_COLOR,
} from "../api.js";

let activeMap = null;
let activeChart = null;
let activeRoadPopup = null;
let activeRoadPopupEntry = null;
let isDestroyed = false;
let backgroundAbortController = null;

// Bộ nhớ đệm OSRM geometry dùng chung để không bao giờ phải gọi lại cùng một cung đường
const osrmGeometryCache = new Map();
const geocodeCache = new Map();

function initMapPage() {
  const ENV = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env : {};

  function requireEnv(name) {
    const value = ENV[name];
    if (!value) {
      throw new Error(`Thiếu cấu hình ${name} trong file .env.`);
    }
    return value;
  }

  const ROUTING_BASE_URL = requireEnv("VITE_ROUTING_URL");
  const TILE_URL = requireEnv("VITE_TILE_URL");
  const TILE_ATTRIBUTION = ENV.VITE_TILE_ATTRIBUTION || "";
  const SEARCH_VIEWBOX = requireEnv("VITE_SEARCH_VIEWBOX");
  const SEARCH_BOUNDS = SEARCH_VIEWBOX.split(",").map(Number);

  backgroundAbortController = new AbortController();
  const abortSignal = backgroundAbortController.signal;

  // ============================================================
  // DOM Elements
  // ============================================================
  const statusOverlay = document.getElementById("status-overlay");
  const trafficTimeSlider = document.getElementById("traffic-time-slider");
  const trafficTimeValue = document.getElementById("traffic-time-value");
  const trafficTimePrevious = document.getElementById("traffic-time-previous");
  const trafficTimeNext = document.getElementById("traffic-time-next");
  const trafficForecastButtons = document.querySelectorAll(
    ".traffic-forecast-option",
  );
  const trafficTimeStatus = document.getElementById("traffic-time-status");
  const roadSearchForm = document.getElementById("road-search");
  const roadQueryInput = document.getElementById("road-query");
  const searchResultsUl = document.getElementById("search-results");
  const routeForm = document.getElementById("route-form");
  const routeOriginInput = document.getElementById("route-origin");
  const routeDestinationInput = document.getElementById("route-destination");
  const routeVehicleSelect = document.getElementById("route-vehicle");
  const routeSubmitButton = document.getElementById("route-submit");
  const routeCancelButton = document.getElementById("route-cancel");
  const routeStatus = document.getElementById("route-status");
  const routeSummary = document.getElementById("route-summary");
  const routeDistance = document.getElementById("route-distance");
  const routeDuration = document.getElementById("route-duration");
  const routeInputs = {
    origin: routeOriginInput,
    destination: routeDestinationInput,
  };
  const routeSuggestionLists = {
    origin: document.getElementById("route-origin-suggestions"),
    destination: document.getElementById("route-destination-suggestions"),
  };
  const routePickButtons = document.querySelectorAll(".route-pick");

  // ============================================================
  // Mobile Tab Switching (<= 920px)
  // ============================================================
  const mapLayout = document.getElementById("map-layout");
  const tabShowMap = document.getElementById("tab-show-map");
  const tabShowPanel = document.getElementById("tab-show-panel");

  function switchToMapView() {
    if (mapLayout) {
      mapLayout.classList.remove("view-panel");
      mapLayout.classList.add("view-map");
    }
    if (tabShowMap && tabShowPanel) {
      tabShowMap.classList.add("active");
      tabShowMap.setAttribute("aria-selected", "true");
      tabShowPanel.classList.remove("active");
      tabShowPanel.setAttribute("aria-selected", "false");
    }
    setTimeout(() => {
      if (activeMap) activeMap.invalidateSize();
    }, 60);
  }

  function switchToPanelView() {
    if (mapLayout) {
      mapLayout.classList.remove("view-map");
      mapLayout.classList.add("view-panel");
    }
    if (tabShowMap && tabShowPanel) {
      tabShowPanel.classList.add("active");
      tabShowPanel.setAttribute("aria-selected", "true");
      tabShowMap.classList.remove("active");
      tabShowMap.setAttribute("aria-selected", "false");
    }
  }

  if (tabShowMap && tabShowPanel) {
    tabShowMap.addEventListener("click", switchToMapView);
    tabShowPanel.addEventListener("click", switchToPanelView);
  }

  // ============================================================
  // Khởi tạo bản đồ với chế độ render Canvas tối ưu
  // ============================================================
  const map = L.map("map-canvas", {
    preferCanvas: true, // Render Canvas thay vì SVG DOM riêng lẻ để tối ưu hiệu năng
    updateWhenZooming: false,
    updateWhenIdle: true,
    zoomAnimation: true,
    fadeAnimation: true,
    markerZoomAnimation: true,
  }).setView([21.018, 105.815], 13);

  activeMap = map;
  map.createPane("routePane");
  map.getPane("routePane").style.zIndex = "650";
  map.createPane("routeMarkerPane");
  map.getPane("routeMarkerPane").style.zIndex = "660";

  const tileLayer = L.tileLayer(TILE_URL, {
    maxZoom: 19,
    attribution: TILE_ATTRIBUTION,
  });
  tileLayer.addTo(map);

  tileLayer.on("load", () => {
    if (statusOverlay) statusOverlay.style.display = "none";
  });

  // Tự động căn chỉnh kích thước sau khi mount
  setTimeout(() => {
    if (!isDestroyed && activeMap) activeMap.invalidateSize();
  }, 100);
  setTimeout(() => {
    if (!isDestroyed && activeMap) activeMap.invalidateSize();
  }, 300);

  let activeRoute = null;
  let activeRoutePoints = null;
  let activeRouteEstimate = null;
  let routeActive = false;
  let routeRequestId = 0;
  let lastGeocodeRequestAt = 0;
  const routePlaces = { origin: null, destination: null };
  const routePointMarkers = { origin: null, destination: null };
  const routeSuggestionRequestIds = { origin: 0, destination: 0 };
  const routeSuggestionTimers = { origin: null, destination: null };
  let activeMapPickTarget = null;
  let mapPickRequestId = 0;
  let geocodeRequestQueue = Promise.resolve();

  function setRouteStatus(message, isError = false) {
    if (!routeStatus) return;
    routeStatus.textContent = message;
    routeStatus.classList.toggle("error", isError);
  }

  async function fetchWithTimeout(url, timeoutMs = 12000, signal = null) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const abortFromParent = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", abortFromParent, { once: true });
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abortFromParent);
    }
  }

  function waitForGeocodeSlot() {
    const request = geocodeRequestQueue.then(async () => {
      const delay = Math.max(0, 1100 - (Date.now() - lastGeocodeRequestAt));
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      lastGeocodeRequestAt = Date.now();
    });
    geocodeRequestQueue = request.catch(() => {});
    return request;
  }

  function isWithinSearchArea(lat, lng) {
    if (
      SEARCH_BOUNDS.length !== 4 ||
      SEARCH_BOUNDS.some((bound) => !Number.isFinite(bound))
    ) {
      throw new Error("Khung tìm kiếm địa điểm chưa được cấu hình hợp lệ.");
    }
    const [west, north, east, south] = SEARCH_BOUNDS;
    return lng >= west && lng <= east && lat >= south && lat <= north;
  }

  async function fetchGeocodingData(endpoint, params, isCurrent = () => true) {
    await waitForGeocodeSlot();
    if (!isCurrent() || isDestroyed) return null;

    const response = await fetchWithTimeout(
      `${API_BASE_URL}/geocode/${endpoint}?${params}`,
      12000,
      abortSignal,
    );
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Dịch vụ tìm địa điểm trả về dữ liệu không hợp lệ.");
    }
    if (!response.ok) {
      throw new Error(
        payload?.message ||
          payload?.detail ||
          `Dịch vụ tìm địa điểm trả về HTTP ${response.status}.`,
      );
    }
    return payload?.data ?? payload;
  }

  function makeRoutePlace(result) {
    const lat = Number(result?.lat);
    const lng = Number(result?.lon ?? result?.lng);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      throw new Error("Tọa độ địa điểm không hợp lệ.");
    }
    if (!isWithinSearchArea(lat, lng)) {
      throw new Error("Địa điểm phải nằm trong phạm vi tìm kiếm tại Hà Nội.");
    }
    const displayName =
      typeof result.display_name === "string" && result.display_name.trim()
        ? result.display_name.trim()
        : `(${lat.toFixed(5)}, ${lng.toFixed(5)})`;
    return { lat, lng, display_name: displayName.slice(0, 200) };
  }

  function createPointTooltip(kind, displayName) {
    const tooltip = document.createElement("span");
    tooltip.textContent = `${kind === "origin" ? "Điểm đi" : "Điểm đến"}: ${displayName}`;
    return tooltip;
  }

  function setRoutePlace(kind, place) {
    const input = routeInputs[kind];
    if (!input) return;
    routePlaces[kind] = place;
    input.value = place.display_name;

    const color = kind === "origin" ? "#16a34a" : "#dc2626";
    const tooltip = createPointTooltip(kind, place.display_name);
    if (routePointMarkers[kind]) {
      routePointMarkers[kind].setLatLng([place.lat, place.lng]);
      routePointMarkers[kind].setStyle({ fillColor: color });
      routePointMarkers[kind].setTooltipContent(tooltip);
    } else {
      routePointMarkers[kind] = L.circleMarker([place.lat, place.lng], {
        pane: "routeMarkerPane",
        radius: 9,
        color: "#ffffff",
        weight: 3,
        fillColor: color,
        fillOpacity: 1,
      })
        .bindTooltip(tooltip, { direction: "top", offset: [0, -8] })
        .addTo(map);
    }
  }

  function clearRoutePlace(kind) {
    routePlaces[kind] = null;
    if (routePointMarkers[kind]) {
      map.removeLayer(routePointMarkers[kind]);
      routePointMarkers[kind] = null;
    }
  }

  function invalidateRouteForPointChange() {
    routeRequestId += 1;
    if (activeRoute) map.removeLayer(activeRoute);
    activeRoute = null;
    activeRouteEstimate = null;
    routeActive = false;
    mapPolylines.forEach((item) => {
      item.segmentLayers.forEach((layer) =>
        layer.setStyle({ weight: 7, opacity: 0.88 }),
      );
    });
    if (routeSummary) routeSummary.hidden = true;
    if (routeCancelButton) routeCancelButton.hidden = true;
    if (routeSubmitButton) routeSubmitButton.disabled = false;
  }

  function hideRouteSuggestions(kind) {
    const list = routeSuggestionLists[kind];
    const input = routeInputs[kind];
    if (!list || !input) return;
    list.hidden = true;
    list.replaceChildren();
    input.setAttribute("aria-expanded", "false");
  }

  async function searchRoutePlaces(query, kind, requestId) {
    const params = new URLSearchParams({
      q: query,
      limit: "5",
      viewbox: SEARCH_VIEWBOX,
    });
    const results = await fetchGeocodingData(
      "search",
      params,
      () => routeSuggestionRequestIds[kind] === requestId,
    );
    if (!results) return;
    if (!Array.isArray(results)) {
      throw new Error("Dịch vụ tìm địa điểm trả về danh sách không hợp lệ.");
    }

    const list = routeSuggestionLists[kind];
    const input = routeInputs[kind];
    if (!list || !input || routeSuggestionRequestIds[kind] !== requestId)
      return;
    list.replaceChildren();
    results.forEach((result) => {
      const place = makeRoutePlace(result);
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.className = "route-suggestion";
      button.type = "button";
      button.setAttribute("role", "option");
      button.textContent = place.display_name;
      button.addEventListener("click", () => {
        setMapPickTarget(null);
        mapPickRequestId += 1;
        invalidateRouteForPointChange();
        routeSuggestionRequestIds[kind] += 1;
        if (routeSuggestionTimers[kind])
          clearTimeout(routeSuggestionTimers[kind]);
        setRoutePlace(kind, place);
        hideRouteSuggestions(kind);
        setRouteStatus(
          `${kind === "origin" ? "Điểm đi" : "Điểm đến"} đã được chọn.`,
        );
      });
      item.append(button);
      list.append(item);
    });
    if (!list.childElementCount) {
      hideRouteSuggestions(kind);
      setRouteStatus("Không tìm thấy gợi ý phù hợp tại Hà Nội.", true);
      return;
    }
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  async function geocodeAddress(query) {
    const cacheKey = query.trim().toLocaleLowerCase("vi");
    if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);

    const params = new URLSearchParams({
      limit: "5",
      viewbox: SEARCH_VIEWBOX,
      q: query,
    });

    const results = await fetchGeocodingData("search", params);
    if (!Array.isArray(results) || !results.length) {
      throw new Error(`Không tìm thấy địa điểm "${query}" tại Hà Nội.`);
    }

    const place = makeRoutePlace(results[0]);
    geocodeCache.set(cacheKey, place);
    return place;
  }

  function formatDuration(seconds) {
    const totalMinutes = Math.max(1, Math.round(seconds / 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours ? `${hours} giờ ${minutes} phút` : `${minutes} phút`;
  }

  const VEHICLE_SPEED_PROFILES = {
    car: { factor: 1.0, defaultFreeSpeed: 38, maxSpeedCap: 60, minSpeedFloor: 3 },
    motorcycle: { factor: 1.08, defaultFreeSpeed: 36, maxSpeedCap: 50, minSpeedFloor: 6 },
    bicycle: { factor: 0.55, defaultFreeSpeed: 15, maxSpeedCap: 20, minSpeedFloor: 6 },
    bus: { factor: 0.72, defaultFreeSpeed: 24, maxSpeedCap: 40, minSpeedFloor: 4 },
  };

  function haversine(a, b) {
    const R = 6371000;
    const rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad;
    const dLng = (b[1] - a[1]) * rad;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function distToSegment(p, a, b) {
    const R = 6371000;
    const rad = Math.PI / 180;
    const metersPerDegree = R * rad;
    const cosLat = Math.cos(((a[0] + b[0] + p[0]) / 3) * rad);
    const ax = a[1] * metersPerDegree * cosLat;
    const ay = a[0] * metersPerDegree;
    const bx = b[1] * metersPerDegree * cosLat;
    const by = b[0] * metersPerDegree;
    const px = p[1] * metersPerDegree * cosLat;
    const py = p[0] * metersPerDegree;
    const dx = bx - ax,
      dy = by - ay;
    if (dx === 0 && dy === 0) return haversine(p, a);
    const t = Math.max(
      0,
      Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)),
    );
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function polylineLength(pts) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      total += haversine(pts[i - 1], pts[i]);
    }
    return total;
  }

  /**
   * Gọi OSRM để snap cặp node from/to của 1 edge về đúng lòng đường thực tế với bộ nhớ đệm
   */
  async function snapEdgeGeometry(from, to, signal = null) {
    const coordStr = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    if (osrmGeometryCache.has(coordStr)) {
      return osrmGeometryCache.get(coordStr);
    }

    const url = `${ROUTING_BASE_URL}/${coordStr}?overview=full&geometries=geojson&steps=false`;
    try {
      const res = await fetch(url, { signal: signal || undefined });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.code !== "Ok" || !data.routes || !data.routes.length) return null;

      const route = data.routes[0];
      const coordinates = route.geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

      const result = {
        pts: coordinates.map(([lng, lat]) => [lat, lng]),
        distance: route.distance,
      };
      osrmGeometryCache.set(coordStr, result);
      return result;
    } catch {
      return null;
    }
  }

  function computeCorridorStats(corridor, distances) {
    let totalTime = 0,
      totalDist = 0;
    corridor.edges.forEach((e, i) => {
      const d = distances
        ? distances[i]
        : haversine([e.from.lat, e.from.lng], [e.to.lat, e.to.lng]);
      const speedNum =
        parseSpeedKmh(e.speed) ??
        CONGESTION_LEVELS[e.congestion_level]?.speed ??
        30;
      totalTime += d / speedNum;
      totalDist += d;
    });
    if (!totalDist) return null;
    return { avgSpeed: totalDist / totalTime, totalKm: totalDist / 1000 };
  }

  const LINE_STYLE = {
    weight: 7,
    opacity: 0.88,
    smoothFactor: 1.0,
    lineCap: "round",
    lineJoin: "round",
  };

  const mapPolylines = [];
  let corridorEntries = [];
  let trafficRequestId = 0;
  let displayedTrafficIndex = 0;
  let displayedTrafficMode = "current";
  const trafficLayerGroup = L.featureGroup().addTo(map);
  const ROUTE_TRAFFIC_MATCH_DISTANCE_METERS = 35;

  function getRouteTrafficColor(point, trafficSegments) {
    let closestDistance = Infinity;
    let closestColor = NO_DATA_COLOR;

    trafficSegments.forEach((segment) => {
      for (let i = 1; i < segment.points.length; i++) {
        const distance = distToSegment(
          point,
          segment.points[i - 1],
          segment.points[i],
        );
        if (distance < closestDistance) {
          closestDistance = distance;
          closestColor = segment.color;
        }
      }
    });

    return closestDistance <= ROUTE_TRAFFIC_MATCH_DISTANCE_METERS
      ? closestColor
      : NO_DATA_COLOR;
  }

  function createTrafficColoredRoute(routePoints) {
    const trafficSegments = mapPolylines.flatMap((entry) =>
      entry.corridor.edges.map((edge, index) => {
        const line = entry.segmentLayers[index];
        const latLngs = line?.getLatLngs() || [];
        const points =
          latLngs.length > 1
            ? latLngs.map(({ lat, lng }) => [lat, lng])
            : [
                [edge.from.lat, edge.from.lng],
                [edge.to.lat, edge.to.lng],
              ];
        const level = CONGESTION_LEVELS[edge.congestion_level];
        return {
          points,
          color: level
            ? edge.color_code || level.color
            : NO_DATA_COLOR,
        };
      }),
    );

    const layers = [];
    let activeColor = null;
    let activePoints = [];

    function flushSegment() {
      if (activePoints.length < 2) return;
      layers.push(
        L.polyline(activePoints, {
          pane: "routePane",
          color: activeColor,
          weight: 7,
          opacity: 0.98,
          lineCap: "round",
          lineJoin: "round",
          interactive: false,
        }),
      );
    }

    for (let i = 1; i < routePoints.length; i++) {
      const start = routePoints[i - 1];
      const end = routePoints[i];
      const midpoint = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
      const color = getRouteTrafficColor(midpoint, trafficSegments);

      if (color !== activeColor) {
        flushSegment();
        activeColor = color;
        activePoints = [start, end];
      } else {
        activePoints.push(end);
      }
    }
    flushSegment();

    return L.featureGroup(layers);
  }

  /**
   * Gom các edges thành từng corridor
   */
  function groupByCorridor(edges) {
    const mapByCorridor = new Map();
    edges.forEach((e) => {
      const name = e.corridor_name || e.street_name || "Tuyến đường";
      if (!mapByCorridor.has(name)) {
        mapByCorridor.set(name, { corridor_name: name, edges: [] });
      }
      mapByCorridor.get(name).edges.push(e);
    });
    return Array.from(mapByCorridor.values());
  }

  /**
   * Vẽ 1 corridor: render đường thẳng tức thời, sau đó làm mịn dần ngầm qua cache
   */
  function drawCorridorImmediate(corridor) {
    const entry = {
      corridor,
      segmentLayers: [],
      distances: null,
      totalKm: null,
      avgSpeed: null,
      maxSpeedLimit: Math.max(...corridor.edges.map((e) => e.max_speed_limit || 0)) || null,
    };
    mapPolylines.push(entry);

    // Vẽ ngay bản toạ độ thẳng from -> to để map có hiển thị trong 10ms
    corridor.edges.forEach((e) => {
      const style = CONGESTION_LEVELS[e.congestion_level] || { color: NO_DATA_COLOR };
      const segLine = L.polyline(
        [
          [e.from.lat, e.from.lng],
          [e.to.lat, e.to.lng],
        ],
        {
          ...LINE_STYLE,
          color: style.color,
          weight: routeActive ? 4 : LINE_STYLE.weight,
          opacity: routeActive ? 0.12 : LINE_STYLE.opacity,
        },
      );
      trafficLayerGroup.addLayer(segLine);
      entry.segmentLayers.push(segLine);
    });

    bindCorridorEvents(entry);
    return entry;
  }

  function bindCorridorEvents(entry) {
    const group = L.featureGroup(entry.segmentLayers);
    group.on("click", (e) => {
      const clickPoint = e?.latlng || group.getBounds().getCenter();
      openCorridorPopup(entry, clickPoint);
    });
    group.on("mouseover", () => {
      if (!routeActive) {
        entry.segmentLayers.forEach((l) => l.setStyle({ weight: 11, opacity: 1.0 }));
      }
    });
    group.on("mouseout", () => {
      entry.segmentLayers.forEach((l) =>
        l.setStyle({
          weight: routeActive ? 4 : 7,
          opacity: routeActive ? 0.12 : 0.88,
        }),
      );
    });
  }

  function fmt(n, digits = 1) {
    return Number(n).toLocaleString("vi-VN", { maximumFractionDigits: digits });
  }

  function renderCorridorPopupContent(entry) {
    const corridor = entry.corridor;
    const dominantLvl = corridor.edges[0]?.congestion_level;
    const lvlInfo = CONGESTION_LEVELS[dominantLvl] || { label: "Thông thoáng", color: "#10b981" };
    const badgeColor = corridor.edges[0]?.color_code || lvlInfo.color || NO_DATA_COLOR;
    const badgeLabel = lvlInfo.label || "Bình thường";

    const BADGE_THEMES = {
      1: { bg: "#ecfdf5", text: "#047857", border: "#a7f3d0" },
      2: { bg: "#fffbeb", text: "#b45309", border: "#fde68a" },
      3: { bg: "#fef2f2", text: "#b91c1c", border: "#fecaca" },
      4: { bg: "#fff1f2", text: "#881337", border: "#fecdd3" },
    };
    const badgeTheme = BADGE_THEMES[dominantLvl] || BADGE_THEMES[1];

    const rows = corridor.edges
      .map((e, i) => {
        const lvl = CONGESTION_LEVELS[e.congestion_level];
        const distM = entry.distances
          ? entry.distances[i]
          : haversine([e.from.lat, e.from.lng], [e.to.lat, e.to.lng]);
        const speedTxt = e.speed
          ? `${e.speed}`
          : lvl
            ? `~${lvl.speed} km/h`
            : "Không có dữ liệu";
        const dotColor = e.color_code || lvl?.color || NO_DATA_COLOR;
        const streetName = e.street_name || corridor.corridor_name || "Phân đoạn";
        return `
          <li class="road-popup-segment-item">
            <span class="road-popup-dot" style="background: ${dotColor};"></span>
            <div class="road-popup-segment-info">
              <div class="road-popup-segment-name">${streetName}</div>
              <div class="road-popup-segment-nodes">${e.from.node_name} → ${e.to.node_name} (${fmt(distM / 1000)} km)</div>
            </div>
            <span class="road-popup-segment-speed">${speedTxt}</span>
          </li>
        `;
      })
      .join("");

    return `
      <div class="road-popup-card">
        <div class="road-popup-header">
          <div class="road-popup-eyebrow">DỮ LIỆU ĐOẠN ĐƯỜNG</div>
          <div class="road-popup-title-row">
            <h3 class="road-popup-title">${corridor.corridor_name}</h3>
            <span class="road-popup-badge" style="background: ${badgeTheme.bg}; color: ${badgeTheme.text}; border: 1px solid ${badgeTheme.border};">
              <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:${badgeColor};"></span>
              ${badgeLabel}
            </span>
          </div>
        </div>

        <div class="road-popup-stats">
          <div class="road-popup-stat-box">
            <div class="road-popup-stat-label">Vận tốc TB</div>
            <div class="road-popup-stat-value">${entry.avgSpeed ? fmt(entry.avgSpeed) + " km/h" : "Đang tính..."}</div>
          </div>
          <div class="road-popup-stat-box">
            <div class="road-popup-stat-label">Tổng chiều dài</div>
            <div class="road-popup-stat-value">${entry.totalKm ? fmt(entry.totalKm) + " km" : "--"}</div>
          </div>
        </div>

        ${entry.maxSpeedLimit ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: -4px;">Tốc độ tối đa cho phép: <strong>${entry.maxSpeedLimit} km/h</strong></div>` : ""}

        <div>
          <div class="road-popup-segments-label">Trạng thái ${corridor.edges.length} phân đoạn:</div>
          <ul class="road-popup-segments">${rows}</ul>
        </div>

        <button type="button" class="road-popup-chart-btn" id="popup-chart-trigger">
          Xem biểu đồ phân đoạn
        </button>
      </div>
    `;
  }

  function openCorridorPopup(entry, latlng) {
    if (!map || !entry || !latlng) return;

    if (activeRoadPopup) {
      activeRoadPopup.remove();
      activeRoadPopup = null;
    }

    const popupHtml = renderCorridorPopupContent(entry);
    activeRoadPopup = L.popup({
      className: "leaflet-road-popup",
      maxWidth: 360,
      minWidth: 280,
      autoPan: true,
      autoPanPadding: [20, 20],
      closeButton: true,
    })
      .setLatLng(latlng)
      .setContent(popupHtml)
      .openOn(map);
    activeRoadPopupEntry = entry;

    activeRoadPopup.on("remove", () => {
      activeRoadPopup = null;
      activeRoadPopupEntry = null;
    });

    updatePopupContent(entry);

    bindCorridorPopupChartButton(entry);
  }

  function bindCorridorPopupChartButton(entry) {
    const chartBtn = activeRoadPopup
      ?.getElement()
      ?.querySelector(".road-popup-chart-btn");
    if (!chartBtn) return;
    chartBtn.addEventListener("click", () => {
      updatePopupContent(entry);
      if (popupOverlay) popupOverlay.hidden = false;
      showChartPage();
    });
  }

  function setTrafficTimeStatus(message, isError = false) {
    if (!trafficTimeStatus) return;
    trafficTimeStatus.textContent = message;
    trafficTimeStatus.classList.toggle("error", isError);
  }

  function getTrafficMode(index) {
    if (index === 0) return "current";
    return `hour:${index - 1}`;
  }

  function getTrafficTimeLabel(index) {
    if (index === 0) return "Hiện tại";
    return `${String(index - 1).padStart(2, "0")}:00`;
  }

  function setActiveTrafficMode(mode) {
    displayedTrafficMode = mode;
    const isForecast = mode.startsWith("forecast:");
    trafficForecastButtons.forEach((button) => {
      const active =
        isForecast &&
        Number(button.dataset.forecastMinutes) ===
          Number(mode.slice("forecast:".length));
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (trafficTimeValue) {
      trafficTimeValue.textContent = isForecast
        ? `Dự báo +${mode.slice("forecast:".length)} phút`
        : getTrafficTimeLabel(displayedTrafficIndex);
    }
  }

  function updateTrafficSlider(index) {
    if (!trafficTimeSlider) return;
    const boundedIndex = Math.max(0, Math.min(24, Number(index)));
    trafficTimeSlider.value = String(boundedIndex);
    trafficTimeSlider.setAttribute("aria-valuetext", getTrafficTimeLabel(boundedIndex));
    if (trafficTimeValue) {
      trafficTimeValue.textContent = getTrafficTimeLabel(boundedIndex);
    }
    if (trafficTimePrevious) trafficTimePrevious.disabled = boundedIndex === 0;
    if (trafficTimeNext) trafficTimeNext.disabled = boundedIndex === 24;
  }

  function applyTrafficEdges(updatedEdges) {
    const edgesById = new Map(
      updatedEdges.map((edge) => [String(edge.edge_id), edge]),
    );
    let updatedCount = 0;

    corridorEntries.forEach((entry) => {
      entry.corridor.edges.forEach((edge, index) => {
        const updated = edgesById.get(String(edge.edge_id));
        if (!updated) return;

        edge.congestion_level = updated.congestion_level;
        edge.color_code = updated.color_code;
        edge.speed = updated.speed;
        edge.speed_num = updated.speed_num;
        edge.updated_at = updated.updated_at;
        entry.segmentLayers[index].setStyle({
          color: edge.color_code || NO_DATA_COLOR,
          weight: routeActive ? 4 : LINE_STYLE.weight,
          opacity: routeActive ? 0.12 : LINE_STYLE.opacity,
        });
        updatedCount += 1;
      });

      const stats = computeCorridorStats(entry.corridor, entry.distances);
      entry.totalKm = stats ? stats.totalKm : null;
      entry.avgSpeed = stats ? stats.avgSpeed : null;
    });

    if (!updatedCount) {
      throw new Error("Không có đoạn đường nào khớp với dữ liệu được tải.");
    }

    if (activeRoadPopup && activeRoadPopupEntry) {
      activeRoadPopup.setContent(renderCorridorPopupContent(activeRoadPopupEntry));
      updatePopupContent(activeRoadPopupEntry);
      bindCorridorPopupChartButton(activeRoadPopupEntry);
    }

    if (activeRoute && activeRoutePoints) {
      map.removeLayer(activeRoute);
      activeRoute = createTrafficColoredRoute(activeRoutePoints).addTo(map);
    }
  }

  async function loadTrafficTime(mode) {
    if (!trafficTimeSlider) return;
    const requestId = ++trafficRequestId;
    trafficTimeSlider.disabled = true;
    if (trafficTimePrevious) trafficTimePrevious.disabled = true;
    if (trafficTimeNext) trafficTimeNext.disabled = true;
    trafficForecastButtons.forEach((button) => {
      button.disabled = true;
    });
    setTrafficTimeStatus("Đang tải dữ liệu giao thông...");

    try {
      let updatedEdges;
      let statusMessage;

      if (mode === "current") {
        updatedEdges = await fetchEdges();
        statusMessage = `Tình trạng hiện tại · ${new Date().toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        })}`;
      } else if (mode.startsWith("hour:")) {
        const hour = Number(mode.slice("hour:".length));
        if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
          throw new Error("Khung giờ được chọn không hợp lệ.");
        }
        updatedEdges = await fetchEdges({ hour });
        statusMessage = `Tình trạng theo khung giờ ${String(hour).padStart(2, "0")}:00`;
      } else if (mode.startsWith("forecast:")) {
        const minutesAhead = Number(mode.slice("forecast:".length));
        const forecast = await fetchMapForecast({ minutes_ahead: minutesAhead });
        updatedEdges = forecast.edges.map((edge) => {
          const level = Number(edge.congestion_level);
          const levelInfo = CONGESTION_LEVELS[level];
          if (!levelInfo || !Number.isFinite(Number(edge.predicted_speed))) {
            throw new Error("Dữ liệu dự báo cho một đoạn đường không hợp lệ.");
          }
          const speed = Number(edge.predicted_speed);
          return {
            edge_id: String(edge.edge_id),
            congestion_level: level,
            color_code: levelInfo.color,
            speed: `${speed} km/h`,
            speed_num: speed,
            updated_at: forecast.target_time,
          };
        });
        const targetTime = new Date(forecast.target_time).toLocaleTimeString(
          "vi-VN",
          { hour: "2-digit", minute: "2-digit" },
        );
        statusMessage = `Dự báo sau ${minutesAhead} phút · khoảng ${targetTime}`;
      } else {
        throw new Error("Mốc thời gian được chọn không được hỗ trợ.");
      }

      if (requestId !== trafficRequestId || isDestroyed) return;
      applyTrafficEdges(updatedEdges);
      if (!mode.startsWith("forecast:")) {
        displayedTrafficIndex =
          mode === "current" ? 0 : Number(mode.slice("hour:".length)) + 1;
        updateTrafficSlider(displayedTrafficIndex);
      }
      setActiveTrafficMode(mode);
      setTrafficTimeStatus(statusMessage);
    } catch (error) {
      if (requestId !== trafficRequestId || isDestroyed) return;
      updateTrafficSlider(displayedTrafficIndex);
      setActiveTrafficMode(displayedTrafficMode);
      setTrafficTimeStatus(
        error instanceof Error
          ? `Không thể tải dữ liệu: ${error.message}`
          : "Không thể tải dữ liệu giao thông.",
        true,
      );
    } finally {
      if (requestId === trafficRequestId && !isDestroyed) {
        trafficTimeSlider.disabled = false;
        trafficForecastButtons.forEach((button) => {
          button.disabled = false;
        });
        updateTrafficSlider(trafficTimeSlider.value);
      }
    }
  }

  trafficTimeSlider?.addEventListener("input", () => {
    updateTrafficSlider(trafficTimeSlider.value);
    if (displayedTrafficMode.startsWith("forecast:")) {
      trafficForecastButtons.forEach((button) => {
        button.classList.remove("active");
        button.setAttribute("aria-pressed", "false");
      });
    }
  });
  trafficTimeSlider?.addEventListener("change", () => {
    loadTrafficTime(getTrafficMode(Number(trafficTimeSlider.value)));
  });

  function moveTrafficSlider(direction) {
    if (!trafficTimeSlider || trafficTimeSlider.disabled) return;
    const nextIndex = Math.max(
      0,
      Math.min(24, Number(trafficTimeSlider.value) + direction),
    );
    if (nextIndex === Number(trafficTimeSlider.value)) return;
    trafficTimeSlider.value = String(nextIndex);
    updateTrafficSlider(nextIndex);
    loadTrafficTime(getTrafficMode(nextIndex));
  }

  trafficTimePrevious?.addEventListener("click", () => moveTrafficSlider(-1));
  trafficTimeNext?.addEventListener("click", () => moveTrafficSlider(1));
  trafficForecastButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const minutes = Number(button.dataset.forecastMinutes);
      if (minutes !== 30 && minutes !== 60) {
        setTrafficTimeStatus("Mốc dự báo không hợp lệ.", true);
        return;
      }
      loadTrafficTime(`forecast:${minutes}`);
    });
  });

  function setTrafficSliderEnabled(enabled) {
    if (trafficTimeSlider) trafficTimeSlider.disabled = !enabled;
    trafficForecastButtons.forEach((button) => {
      button.disabled = !enabled;
    });
    updateTrafficSlider(trafficTimeSlider?.value ?? displayedTrafficIndex);
    if (!enabled) {
      if (trafficTimePrevious) trafficTimePrevious.disabled = true;
      if (trafficTimeNext) trafficTimeNext.disabled = true;
    }
  }

  updateTrafficSlider(0);

  // Keep the map time control unavailable until its initial road data is ready.
  setTrafficSliderEnabled(false);

  function setInitialTrafficTime() {
    displayedTrafficIndex = 0;
    updateTrafficSlider(displayedTrafficIndex);
    setActiveTrafficMode("current");
    setTrafficSliderEnabled(true);
    setTrafficTimeStatus(`Tình trạng hiện tại · ${new Date().toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    })}`);
  }

  // Khởi động nạp dữ liệu và vẽ bản đồ tối ưu
  (async () => {
    try {
      const edges = await fetchEdges();
      if (isDestroyed || !activeMap) return;

      if (!edges || edges.length === 0) {
        if (statusOverlay) {
          statusOverlay.textContent = "Không tìm thấy dữ liệu đoạn đường nào từ hệ thống.";
          statusOverlay.style.display = "block";
        }
        return;
      }

      const corridors = groupByCorridor(edges);
      corridorEntries = corridors.map((corridor) => drawCorridorImmediate(corridor));

      // Tự động căn chỉnh bản đồ theo các tuyến đường thực tế
      const allLayers = corridorEntries.flatMap((c) => c.segmentLayers);
      setInitialTrafficTime();
      if (allLayers.length > 0) {
        try {
          const group = L.featureGroup(allLayers);
          const bounds = group.getBounds();
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [30, 30] });
          }
        } catch {
          // Giữ khung nhìn mặc định
        }
      }

      // Làm mịn geometry ngầm theo hàng đợi
      (async () => {
        for (let i = 0; i < corridorEntries.length; i++) {
          if (isDestroyed || !activeMap) break;
          const entry = corridorEntries[i];
          const corridor = entry.corridor;
          const distances = [];

          try {
            const snappedList = await Promise.all(
              corridor.edges.map((e) => snapEdgeGeometry(e.from, e.to, abortSignal)),
            );
            if (isDestroyed || !activeMap) break;

            snappedList.forEach((snapped, idx) => {
              const e = corridor.edges[idx];
              if (snapped && snapped.pts.length > 1) {
                entry.segmentLayers[idx].setLatLngs(snapped.pts);
                distances.push(snapped.distance || polylineLength(snapped.pts));
              } else {
                distances.push(haversine([e.from.lat, e.from.lng], [e.to.lat, e.to.lng]));
              }
            });

            entry.distances = distances;
            const stats = computeCorridorStats(corridor, distances);
            entry.totalKm = stats ? stats.totalKm : null;
            entry.avgSpeed = stats ? stats.avgSpeed : null;
          } catch {
            // Bỏ qua lỗi ngầm
          }
        }
      })();

      // Deep link query ?q=...
      const qParam = new URLSearchParams(window.location.search).get("q");
      if (qParam && roadSearchForm && roadQueryInput) {
        roadQueryInput.value = qParam;
        roadSearchForm.requestSubmit();
      }
    } catch (err) {
      if (statusOverlay) {
        statusOverlay.textContent = `Không thể kết nối đến máy chủ giao thông: ${err.message}`;
        statusOverlay.style.display = "block";
        statusOverlay.style.color = "#dc2626";
      }
    }
  })();

  // ============================================================
  // Tìm kiếm theo tên trục / tên đường
  // ============================================================
  if (roadSearchForm) {
    roadSearchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const query = roadQueryInput.value.trim().toLowerCase();
      if (!query) return;

      searchResultsUl.innerHTML = "";
      const matched = mapPolylines.filter(
        (item) =>
          item.corridor.corridor_name.toLowerCase().includes(query) ||
          item.corridor.edges.some((e) => e.street_name.toLowerCase().includes(query)),
      );

      if (matched.length === 0) {
        searchResultsUl.innerHTML = `<li style="padding: 10px; color: var(--text-muted); font-size: 13px;">Không tìm thấy tuyến đường phù hợp.</li>`;
        return;
      }

      matched.forEach((item) => {
        const speedTxt = item.avgSpeed
          ? ` - <small style="color:var(--text-muted)">${fmt(item.avgSpeed)} km/h</small>`
          : "";
        const li = document.createElement("li");
        li.className = "list-item";
        li.innerHTML = `<strong>${item.corridor.corridor_name}</strong>${speedTxt}`;

        li.addEventListener("click", () => {
          if (window.innerWidth <= 920) switchToMapView();
          const bounds = L.featureGroup(item.segmentLayers).getBounds();
          map.fitBounds(bounds, { padding: [40, 40] });
          openCorridorPopup(item, bounds.getCenter());
        });

        searchResultsUl.appendChild(li);
      });

      if (window.innerWidth <= 920) {
        switchToMapView();
      }
      setTimeout(() => {
        if (activeMap && matched.length) {
          activeMap.invalidateSize();
          const bounds = L.featureGroup(matched[0].segmentLayers).getBounds();
          activeMap.fitBounds(bounds, { padding: [40, 40] });
          openCorridorPopup(matched[0], bounds.getCenter());
        }
      }, 80);
    });
  }

  function setMapPickTarget(kind) {
    activeMapPickTarget = kind;
    map.getContainer().classList.toggle("route-pick-mode", Boolean(kind));
    routePickButtons.forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.routePoint === kind),
      );
    });
    if (kind && window.innerWidth <= 920) switchToMapView();
    setRouteStatus(
      kind
        ? `Nhấp vào bản đồ để chọn ${kind === "origin" ? "điểm khởi hành" : "điểm đến"}.`
        : "Đã hủy chọn điểm trên bản đồ.",
    );
  }

  Object.entries(routeInputs).forEach(([kind, input]) => {
    if (!input) return;
    input.addEventListener("input", () => {
      if (activeMapPickTarget) setMapPickTarget(null);
      mapPickRequestId += 1;
      invalidateRouteForPointChange();
      const query = input.value.trim();
      if (routePlaces[kind]?.display_name !== query) clearRoutePlace(kind);

      routeSuggestionRequestIds[kind] += 1;
      const requestId = routeSuggestionRequestIds[kind];
      if (routeSuggestionTimers[kind])
        clearTimeout(routeSuggestionTimers[kind]);
      hideRouteSuggestions(kind);
      if (query.length < 3) return;

      routeSuggestionTimers[kind] = setTimeout(() => {
        searchRoutePlaces(query, kind, requestId).catch((error) => {
          if (routeSuggestionRequestIds[kind] !== requestId) return;
          hideRouteSuggestions(kind);
          setRouteStatus(
            error instanceof Error
              ? error.message
              : "Không thể tải gợi ý địa điểm.",
            true,
          );
        });
      }, 700);
    });

    input.addEventListener("keydown", (event) => {
      const list = routeSuggestionLists[kind];
      if (event.key === "ArrowDown" && list && !list.hidden) {
        event.preventDefault();
        list.querySelector(".route-suggestion")?.focus();
      } else if (event.key === "Escape") {
        routeSuggestionRequestIds[kind] += 1;
        if (routeSuggestionTimers[kind])
          clearTimeout(routeSuggestionTimers[kind]);
        hideRouteSuggestions(kind);
      }
    });

    input.addEventListener("invalid", () => {
      setRouteStatus(
        input.validity.valueMissing
          ? "Nhập cả điểm khởi hành và điểm đến."
          : "Tên địa điểm cần từ 3 đến 200 ký tự.",
        true,
      );
    });
  });

  routePickButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const kind = button.dataset.routePoint;
      if (kind !== "origin" && kind !== "destination") return;
      Object.keys(routeSuggestionLists).forEach(hideRouteSuggestions);
      setMapPickTarget(activeMapPickTarget === kind ? null : kind);
    });
  });

  document.addEventListener("click", (event) => {
    Object.entries(routeSuggestionLists).forEach(([kind, list]) => {
      const field = list?.closest(".route-place-field");
      if (field && !field.contains(event.target)) hideRouteSuggestions(kind);
    });
  });

  map.on("click", async (event) => {
    const kind = activeMapPickTarget;
    if (!kind || isDestroyed) return;
    const { lat, lng } = event.latlng;
    if (!isWithinSearchArea(lat, lng)) {
      setRouteStatus(
        "Chỉ chọn được vị trí trong phạm vi tìm kiếm tại Hà Nội.",
        true,
      );
      return;
    }

    setMapPickTarget(null);
    invalidateRouteForPointChange();
    const selectionId = ++mapPickRequestId;
    setRoutePlace(kind, makeRoutePlace({ lat, lon: lng }));
    setRouteStatus("Đang tra cứu tên địa điểm tại vị trí vừa chọn...");

    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
    });
    try {
      const result = await fetchGeocodingData("reverse", params);
      if (selectionId !== mapPickRequestId || isDestroyed) return;
      if (!result || typeof result !== "object") {
        throw new Error("Dịch vụ tra cứu địa điểm trả về dữ liệu không hợp lệ.");
      }
      const place = makeRoutePlace(result);
      setRoutePlace(kind, { ...place, lat, lng });
      setRouteStatus(
        `${kind === "origin" ? "Điểm khởi hành" : "Điểm đến"} đã được đặt trên bản đồ.`,
      );
    } catch (error) {
      if (selectionId !== mapPickRequestId || isDestroyed) return;
      setRouteStatus(
        error instanceof Error
          ? `Đã đặt điểm theo tọa độ; không lấy được tên địa điểm. Bạn vẫn có thể vẽ tuyến bằng tọa độ này. ${error.message}`
          : "Đã đặt điểm theo tọa độ; không lấy được tên địa điểm. Bạn vẫn có thể vẽ tuyến bằng tọa độ này.",
        true,
      );
    }
  });

  // ============================================================
  // Đổi chiều lộ trình
  // ============================================================
  const routeSwapBtn = document.getElementById("route-swap");
  if (routeSwapBtn && routeOriginInput && routeDestinationInput) {
    routeSwapBtn.addEventListener("click", () => {
      setMapPickTarget(null);
      invalidateRouteForPointChange();
      const originValue = routeOriginInput.value;
      const originPlace = routePlaces.origin;
      const originMarker = routePointMarkers.origin;
      routeOriginInput.value = routeDestinationInput.value;
      routeDestinationInput.value = originValue;
      routePlaces.origin = routePlaces.destination;
      routePlaces.destination = originPlace;
      routePointMarkers.origin = routePointMarkers.destination;
      routePointMarkers.destination = originMarker;
      if (routePlaces.origin && routePointMarkers.origin) {
        routePointMarkers.origin.setStyle({ fillColor: "#16a34a" });
        routePointMarkers.origin.setTooltipContent(
          createPointTooltip("origin", routePlaces.origin.display_name),
        );
      }
      if (routePlaces.destination && routePointMarkers.destination) {
        routePointMarkers.destination.setStyle({ fillColor: "#dc2626" });
        routePointMarkers.destination.setTooltipContent(
          createPointTooltip(
            "destination",
            routePlaces.destination.display_name,
          ),
        );
      }
      Object.keys(routeSuggestionLists).forEach((kind) => {
        routeSuggestionRequestIds[kind] += 1;
        if (routeSuggestionTimers[kind])
          clearTimeout(routeSuggestionTimers[kind]);
        hideRouteSuggestions(kind);
      });
    });
  }

  // ============================================================
  // Route form logic (OSRM routing)
  // ============================================================
  function clearRoute() {
    if (activeRoute) {
      map.removeLayer(activeRoute);
      activeRoute = null;
    }
    activeRoutePoints = null;
    activeRouteEstimate = null;
    routeActive = false;
    mapPolylines.forEach((item) => {
      item.segmentLayers.forEach((l) => l.setStyle({ weight: 7, opacity: 0.88 }));
    });
    if (routeSummary) routeSummary.hidden = true;
    if (routeCancelButton) routeCancelButton.hidden = true;
  }

  if (routeCancelButton) {
    routeCancelButton.addEventListener("click", () => {
      routeRequestId += 1;
      clearRoute();
      routeSubmitButton.disabled = false;
      setRouteStatus("Đã hủy tuyến đường hiển thị.");
    });
  }

  if (routeForm) {
    routeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      setMapPickTarget(null);
      const originQuery = routeOriginInput.value.trim();
      const destQuery = routeDestinationInput.value.trim();
      const vehicle = routeVehicleSelect.value || "car";
      if (
        originQuery.length < 3 ||
        originQuery.length > 200 ||
        destQuery.length < 3 ||
        destQuery.length > 200
      ) {
        setRouteStatus("Tên mỗi địa điểm cần từ 3 đến 200 ký tự.", true);
        return;
      }

      const currentId = ++routeRequestId;
      routeSubmitButton.disabled = true;
      setRouteStatus("Đang định vị địa điểm và tính lộ trình tối ưu...");

      try {
        const origin =
          routePlaces.origin?.display_name === originQuery
            ? routePlaces.origin
            : await geocodeAddress(originQuery);
        if (currentId !== routeRequestId || isDestroyed) return;
        const dest =
          routePlaces.destination?.display_name === destQuery
            ? routePlaces.destination
            : await geocodeAddress(destQuery);

        if (currentId !== routeRequestId || isDestroyed || !activeMap) return;
        if (origin.lat === dest.lat && origin.lng === dest.lng) {
          throw new Error("Điểm khởi hành và điểm đến phải là hai vị trí khác nhau.");
        }

        const coordStr = `${origin.lng},${origin.lat};${dest.lng},${dest.lat}`;
        const routeRes = await fetchWithTimeout(
          `${ROUTING_BASE_URL}/${coordStr}?overview=full&geometries=geojson&steps=false`,
          15000,
        );

        if (!routeRes.ok) throw new Error("Dịch vụ tìm đường OSRM không khả dụng.");
        const routeData = await routeRes.json();
        if (routeData.code !== "Ok" || !routeData.routes || !routeData.routes.length) {
          throw new Error("Không thể tính lộ trình giữa hai địa điểm này.");
        }

        const route = routeData.routes[0];
        const coordinates = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);

        clearRoute();
        routeActive = true;
        if (routePlaces.origin !== origin) setRoutePlace("origin", origin);
        if (routePlaces.destination !== dest)
          setRoutePlace("destination", dest);

        // Làm mờ các tuyến corridor xung quanh để lộ trình hiển thị nổi bật
        mapPolylines.forEach((item) => {
          item.segmentLayers.forEach((l) => l.setStyle({ weight: 4, opacity: 0.18 }));
        });

        activeRoutePoints = coordinates;
        activeRoute = createTrafficColoredRoute(activeRoutePoints).addTo(map);
        if (window.innerWidth <= 920) {
          switchToMapView();
        }
        setTimeout(() => {
          if (activeMap && activeRoute) {
            activeMap.invalidateSize();
            activeMap.fitBounds(activeRoute.getBounds(), { padding: [50, 50] });
          }
        }, 80);

        const profile = VEHICLE_SPEED_PROFILES[vehicle] || VEHICLE_SPEED_PROFILES.car;
        const estDuration = (route.duration / profile.factor);

        if (routeDistance) routeDistance.textContent = `${(route.distance / 1000).toFixed(1)} km`;
        if (routeDuration) routeDuration.textContent = formatDuration(estDuration);
        if (routeSummary) routeSummary.hidden = false;
        if (routeCancelButton) routeCancelButton.hidden = false;
        setRouteStatus("Đã vẽ lộ trình di chuyển tối ưu.");
      } catch (err) {
        if (currentId !== routeRequestId || isDestroyed) return;
        setRouteStatus(
          `Lỗi: ${err instanceof Error ? err.message : "Không thể tìm tuyến đường."}`,
          true,
        );
      } finally {
        if (currentId === routeRequestId) routeSubmitButton.disabled = false;
      }
    });
  }

  // ============================================================
  // Popup chi tiết & Chart.js
  // ============================================================
  const popupOverlay = document.getElementById("popup-overlay");
  const popupBox = document.getElementById("popup-box");
  const popupToggleBtn = document.getElementById("popup-toggle-btn");
  const popupCloseBtn = document.getElementById("popup-close");
  const popupInfoPage = document.getElementById("popup-info-page");
  const popupChartPage = document.getElementById("popup-chart-page");
  const popupRoadName = document.getElementById("popup-road-name");
  const popupAvgSpeed = document.getElementById("popup-avg-speed");
  const popupCongestionLevel = document.getElementById("popup-congestion-level");
  const popupUpdateTime = document.getElementById("popup-update-time");
  const popupShowChartBtn = document.getElementById("popup-show-chart-btn");
  const popupBackBtn = document.getElementById("popup-back-btn");
  const popupCanvas = document.getElementById("popup-chart-canvas");
  const popupChartRoadName = document.getElementById("popup-chart-road-name");
  const popupChartStatus = document.getElementById("popup-chart-status");
  const popupChartRetryBtn = document.getElementById("popup-chart-retry");
  const popupChartWrap = document.getElementById("popup-chart-wrap");

  let currentPopupData = null;
  let chartRequestId = 0;

  function openPopup() {
    if (popupOverlay) popupOverlay.hidden = false;
    showInfoPage();
  }

  function closePopup() {
    chartRequestId += 1;
    if (popupOverlay) popupOverlay.hidden = true;
  }

  function showInfoPage() {
    if (popupInfoPage) popupInfoPage.hidden = false;
    if (popupChartPage) popupChartPage.hidden = true;
    if (popupBox) popupBox.classList.remove("is-chart");
    chartRequestId += 1;
  }

  function showChartPage() {
    if (popupInfoPage) popupInfoPage.hidden = true;
    if (popupChartPage) popupChartPage.hidden = false;
    if (popupBox) popupBox.classList.add("is-chart");
    if (currentPopupData) drawChart(currentPopupData);
  }

  function updatePopupContent(entry) {
    if (!entry) return;
    currentPopupData = entry;
    const corridor = entry.corridor;

    if (popupRoadName) popupRoadName.textContent = corridor.corridor_name;
    if (popupChartRoadName) popupChartRoadName.textContent = corridor.corridor_name;
    if (popupAvgSpeed) popupAvgSpeed.textContent = entry.avgSpeed ? `${fmt(entry.avgSpeed)} km/h` : "--";
    if (popupShowChartBtn) popupShowChartBtn.disabled = false;

    if (popupCongestionLevel) {
      const dominant = corridor.edges[0]?.congestion_level;
      const lvl = CONGESTION_LEVELS[dominant];
      popupCongestionLevel.textContent = lvl ? lvl.label : "Bình thường";
    }

    if (popupUpdateTime) {
      popupUpdateTime.textContent = new Date().toLocaleTimeString("vi-VN");
    }
  }

  async function fetchCorridorHourlyHistory(entry) {
    const dateParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .reduce((parts, part) => {
        if (part.type !== "literal") parts[part.type] = part.value;
        return parts;
      }, {});
    const startDate = new Date(
      Date.UTC(
        Number(dateParts.year),
        Number(dateParts.month) - 1,
        Number(dateParts.day),
      ),
    );
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + 7);
    const start = `${startDate.toISOString().slice(0, 10)}T00:00:00`;
    const end = `${endDate.toISOString().slice(0, 10)}T00:00:00`;
    const todayWeekday = (startDate.getUTCDay() + 6) % 7;

    const histories = await Promise.all(
      entry.corridor.edges.map(async (edge) => {
        if (!edge.edge_id) {
          throw new Error("Thiếu mã đoạn đường để tải dữ liệu lịch sử.");
        }
        const params = new URLSearchParams({ start, end });
        const history = await request(
          `/edges/${encodeURIComponent(edge.edge_id)}/history?${params}`,
        );
        if (!Array.isArray(history?.buckets)) {
          throw new Error("Dữ liệu lịch sử trả về không đúng định dạng.");
        }
        return history;
      }),
    );

    const distancesKm = entry.corridor.edges.map((edge, index) => {
      const snappedDistance = entry.distances?.[index];
      return Number.isFinite(snappedDistance) && snappedDistance > 0
        ? snappedDistance / 1000
        : edge.length_km;
    });

    return {
      todayWeekday,
      series: buildHourlySpeedSeries(
        entry.corridor.edges,
        histories,
        distancesKm,
        todayWeekday,
      ),
    };
  }

  async function drawChart(entry) {
    if (!popupCanvas || !entry) return;
    const requestId = ++chartRequestId;
    if (activeChart) {
      activeChart.destroy();
      activeChart = null;
    }
    if (popupChartWrap) popupChartWrap.hidden = true;
    if (popupChartStatus) {
      popupChartStatus.hidden = false;
      popupChartStatus.classList.remove("is-error");
      popupChartStatus.textContent = "Đang tải dữ liệu tốc độ theo giờ...";
    }
    if (popupChartRetryBtn) popupChartRetryBtn.hidden = true;

    try {
      const { series } = await fetchCorridorHourlyHistory(entry);
      if (requestId !== chartRequestId || currentPopupData !== entry) return;

      const hasData = [...series.today, ...series.average].some(
        (speed) => speed !== null,
      );
      if (!hasData) {
        if (popupChartStatus) {
          popupChartStatus.textContent =
            "Chưa có dữ liệu tốc độ theo giờ cho đoạn đường này.";
        }
        return;
      }

      const hasGaps = [...series.today, ...series.average].some(
        (speed) => speed === null,
      );
      if (popupChartStatus) {
        popupChartStatus.hidden = !hasGaps;
        popupChartStatus.textContent = hasGaps
          ? "Một số khung giờ chưa có dữ liệu và được để trống trên biểu đồ."
          : "";
      }

      const labels = Array.from({ length: 24 }, (_, hour) =>
        `${String(hour).padStart(2, "0")}:00`,
      );
      const ctx = popupCanvas.getContext("2d");
      activeChart = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Hôm nay",
              data: series.today,
              borderColor: "#2563eb",
              backgroundColor: "rgba(37, 99, 235, 0.12)",
              pointBackgroundColor: "#2563eb",
              pointRadius: 2,
              pointHoverRadius: 5,
              borderWidth: 3,
              tension: 0.3,
              spanGaps: false,
            },
            {
              label: "Trung bình tuần",
              data: series.average,
              borderColor: "#f59e0b",
              backgroundColor: "rgba(245, 158, 11, 0.08)",
              pointBackgroundColor: "#f59e0b",
              pointRadius: 1.5,
              pointHoverRadius: 5,
              borderWidth: 2,
              borderDash: [6, 4],
              tension: 0.3,
              spanGaps: false,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { intersect: false, mode: "index" },
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              callbacks: {
                label(context) {
                  const speed = context.parsed.y;
                  return speed === null
                    ? `${context.dataset.label}: Không có dữ liệu`
                    : `${context.dataset.label}: ${fmt(speed)} km/h`;
                },
              },
            },
          },
          scales: {
            x: {
              title: { display: true, text: "Giờ trong ngày" },
              grid: { display: false },
              ticks: { maxTicksLimit: 12, maxRotation: 0 },
            },
            y: {
              beginAtZero: true,
              title: { display: true, text: "Tốc độ trung bình (km/h)" },
              ticks: { callback: (value) => `${value} km/h` },
            },
          },
        },
      });
      if (popupChartWrap) popupChartWrap.hidden = false;
    } catch (error) {
      if (requestId !== chartRequestId) return;
      if (popupChartStatus) {
        popupChartStatus.hidden = false;
        popupChartStatus.classList.add("is-error");
        popupChartStatus.textContent = `Không thể tải dữ liệu biểu đồ: ${error.message}`;
      }
      if (popupChartRetryBtn) popupChartRetryBtn.hidden = false;
    }
  }

  if (popupToggleBtn) popupToggleBtn.addEventListener("click", openPopup);
  if (popupCloseBtn) popupCloseBtn.addEventListener("click", closePopup);
  if (popupOverlay) {
    popupOverlay.addEventListener("click", (e) => {
      if (e.target === popupOverlay) closePopup();
    });
  }
  if (popupShowChartBtn) popupShowChartBtn.addEventListener("click", showChartPage);
  if (popupBackBtn) popupBackBtn.addEventListener("click", showInfoPage);
  if (popupChartRetryBtn) {
    popupChartRetryBtn.addEventListener("click", () => {
      if (currentPopupData) drawChart(currentPopupData);
    });
  }
}

export const mapPage = {
  mount(container) {
    isDestroyed = false;
    container.innerHTML = `
      ${renderHeader("/map")}
      ${renderMapView()}
    `;
    initMapPage();
  },

  unmount() {
    isDestroyed = true;
    if (backgroundAbortController) {
      backgroundAbortController.abort();
      backgroundAbortController = null;
    }
    if (activeRoadPopup) {
      try {
        activeRoadPopup.remove();
      } catch {}
      activeRoadPopup = null;
      activeRoadPopupEntry = null;
    }
    if (activeChart) {
      try {
        activeChart.destroy();
      } catch {}
      activeChart = null;
    }
    if (activeMap) {
      try {
        activeMap.remove();
      } catch {}
      activeMap = null;
    }
  },
};
