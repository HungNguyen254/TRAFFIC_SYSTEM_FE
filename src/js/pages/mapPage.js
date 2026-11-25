// File: src/js/pages/mapPage.js
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Chart from "chart.js/auto";
import { renderHeader } from "../components/header.js";
import { renderFooter } from "../components/footer.js";
import { showToast } from "../components/toast.js";
import { renderMapView } from "../views/mapView.js";
import { buildHourlySpeedSeries } from "../services/segmentSpeedChart.js";
import { summarizeMapForecast } from "../services/mapForecastSummary.js";
import {
  addSearchHistoryEntry,
  loadSearchHistory,
} from "../services/searchHistory.js";
import {
  API_BASE_URL,
  fetchEdges,
  fetchEdgeHistory,
  fetchMapForecast,
  getUser,
  isLoggedIn,
  isPremium,
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

function showFatalMapError(container, error) {
  const overlay = container.querySelector("#status-overlay");
  const spinner = container.querySelector("#spinner");
  const text = container.querySelector("#status-text");
  const retryButton = container.querySelector("#retry-btn");
  const trafficStatus = container.querySelector("#traffic-time-status");
  const trafficMessage = container.querySelector("#traffic-time-message");
  const trafficSpinner = container.querySelector("#traffic-time-spinner");
  const trafficRetryButton = container.querySelector("#traffic-time-retry");
  if (!overlay || !text || !retryButton) return;

  overlay.hidden = false;
  overlay.dataset.state = "error";
  overlay.classList.remove("is-loading", "is-empty");
  overlay.classList.add("is-error");
  overlay.setAttribute("role", "alert");
  overlay.setAttribute("aria-busy", "false");
  if (spinner) spinner.hidden = true;
  text.textContent =
    error instanceof Error ? error.message : "Không thể khởi tạo bản đồ.";
  retryButton.hidden = false;
  retryButton.addEventListener(
    "click",
    () => window.location.reload(),
    { once: true },
  );
  if (trafficStatus) {
    if (trafficMessage) trafficMessage.textContent = "Không thể khởi tạo dữ liệu bản đồ.";
    trafficStatus.classList.add("error");
    trafficStatus.setAttribute("role", "alert");
    trafficStatus.setAttribute("aria-busy", "false");
  }
  if (trafficSpinner) trafficSpinner.hidden = true;
  if (trafficRetryButton) {
    trafficRetryButton.hidden = false;
    trafficRetryButton.addEventListener(
      "click",
      () => window.location.reload(),
      { once: true },
    );
  }
}

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
  const statusText = document.getElementById("status-text");
  const statusSpinner = document.getElementById("spinner");
  const retryButton = document.getElementById("retry-btn");
  const tileWarning = document.getElementById("tile-warning");
  const tileRetryButton = document.getElementById("tile-retry-btn");
  const trafficTimeSlider = document.getElementById("traffic-time-slider");
  const trafficTimeValue = document.getElementById("traffic-time-value");
  const trafficTimePrevious = document.getElementById("traffic-time-previous");
  const trafficTimeNext = document.getElementById("traffic-time-next");
  const trafficForecastButtons = document.querySelectorAll(
    ".traffic-forecast-option",
  );
  const trafficTimeStatus = document.getElementById("traffic-time-status");
  const trafficTimeMessage = document.getElementById("traffic-time-message");
  const trafficTimeSpinner = document.getElementById("traffic-time-spinner");
  const trafficTimeRetryButton = document.getElementById("traffic-time-retry");
  const forecastResultPanel = document.getElementById("map-forecast-result");
  const forecastResultOffset = document.getElementById("map-forecast-result-offset");
  const forecastResultStatus = document.getElementById("map-forecast-result-status");
  const forecastResultContent = document.getElementById("map-forecast-result-content");
  const forecastResultLevel = document.getElementById("map-forecast-result-level");
  const forecastResultTime = document.getElementById("map-forecast-result-time");
  const forecastResultAgreement = document.getElementById("map-forecast-result-agreement");
  const forecastResultAgreementNote = document.getElementById("map-forecast-result-agreement-note");
  const forecastResultComment = document.getElementById("map-forecast-result-comment");
  const forecastResultRecommendation = document.getElementById("map-forecast-result-recommendation");
  const forecastResultSource = document.getElementById("map-forecast-result-source");
  const roadSearchForm = document.getElementById("road-search");
  const roadQueryInput = document.getElementById("road-query");
  const searchStatus = document.getElementById("search-status");
  const searchResultsUl = document.getElementById("search-results");
  const routeForm = document.getElementById("route-form");
  const routeOriginInput = document.getElementById("route-origin");
  const routeDestinationInput = document.getElementById("route-destination");
  const routeVehicleSelect = document.getElementById("route-vehicle");
  const routeSubmitButton = document.getElementById("route-submit");
  const routeCancelButton = document.getElementById("route-cancel");
  const routeStatus = document.getElementById("route-status");
  const routeStatusMessage = document.getElementById("route-status-message");
  const routeStatusSpinner = document.getElementById("route-status-spinner");
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
  const panelCollapseButton = document.getElementById("panel-collapse-btn");

  function setMapStatus(state, message = "") {
    if (!statusOverlay) return;
    statusOverlay.dataset.state = state;
    statusOverlay.hidden = state === "ready";
    statusOverlay.classList.toggle("is-loading", state === "loading");
    statusOverlay.classList.toggle("is-empty", state === "empty");
    statusOverlay.classList.toggle("is-error", state === "error");
    statusOverlay.setAttribute("role", state === "error" ? "alert" : "status");
    statusOverlay.setAttribute("aria-busy", String(state === "loading"));
    if (statusText) statusText.textContent = message;
    if (statusSpinner) statusSpinner.hidden = state !== "loading";
    if (retryButton) retryButton.hidden = state !== "error" && state !== "empty";
  }

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
    }, 260);
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
    setTimeout(() => {
      if (activeMap) activeMap.invalidateSize();
    }, 260);
  }

  if (tabShowMap && tabShowPanel) {
    tabShowMap.addEventListener("click", switchToMapView);
    tabShowPanel.addEventListener("click", switchToPanelView);
  }
  panelCollapseButton?.addEventListener("click", switchToMapView);

  // ============================================================
  // Khởi tạo bản đồ với chế độ render Canvas tối ưu
  // ============================================================
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const map = L.map("map-canvas", {
    preferCanvas: true, // Render Canvas thay vì SVG DOM riêng lẻ để tối ưu hiệu năng
    renderer: L.canvas({ padding: 0.5, tolerance: coarsePointer ? 16 : 8 }),
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
  let tileLoadHadError = false;
  tileLayer.on("loading", () => {
    tileLoadHadError = false;
    if (tileWarning) tileWarning.hidden = true;
  });
  tileLayer.on("tileerror", () => {
    tileLoadHadError = true;
  });
  tileLayer.on("load", () => {
    if (tileWarning) tileWarning.hidden = !tileLoadHadError;
    if (tileRetryButton) tileRetryButton.disabled = false;
  });
  tileRetryButton?.addEventListener("click", () => {
    tileRetryButton.disabled = true;
    tileLayer.redraw();
  });
  tileLayer.addTo(map);

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
    const isLoading = !isError && message.startsWith("Đang ");
    if (routeStatusMessage) routeStatusMessage.textContent = message;
    else routeStatus.textContent = message;
    routeStatus.classList.toggle("error", isError);
    routeStatus.classList.toggle("is-loading", isLoading);
    routeStatus.setAttribute("aria-busy", String(isLoading));
    routeStatus.setAttribute("role", isError ? "alert" : "status");
    if (routeStatusSpinner) routeStatusSpinner.hidden = !isLoading;
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
      setRouteStatus("Không tìm thấy gợi ý phù hợp tại Hà Nội.");
      return;
    }
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    setRouteStatus(`Tìm thấy ${results.length} gợi ý. Chọn một địa điểm.`);
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
    weight: coarsePointer ? 10 : 7,
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
  let trafficRetryMode = null;
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
        e.geometry || [
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
        entry.segmentLayers.forEach((l) =>
          l.setStyle({ weight: coarsePointer ? 13 : 11, opacity: 1.0 }),
        );
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

  function setTrafficTimeStatus(message, isError = false, isLoading = false) {
    if (!trafficTimeStatus) return;
    if (trafficTimeMessage) trafficTimeMessage.textContent = message;
    else trafficTimeStatus.textContent = message;
    trafficTimeStatus.classList.toggle("error", isError);
    trafficTimeStatus.classList.toggle("is-loading", isLoading);
    trafficTimeStatus.setAttribute("aria-busy", String(isLoading));
    trafficTimeStatus.setAttribute("role", isError ? "alert" : "status");
    if (trafficTimeSpinner) trafficTimeSpinner.hidden = !isLoading;
  }

  function setForecastResultState(minutesAhead, message, isError = false, isLoading = false) {
    if (!forecastResultPanel || !forecastResultStatus) return;
    forecastResultPanel.hidden = false;
    if (forecastResultOffset) forecastResultOffset.textContent = `+${minutesAhead} phút`;
    forecastResultStatus.textContent = message;
    forecastResultStatus.classList.toggle("error", isError);
    forecastResultStatus.classList.toggle("is-loading", isLoading);
    forecastResultStatus.setAttribute("role", isError ? "alert" : "status");
    forecastResultStatus.setAttribute("aria-busy", String(isLoading));
    if (forecastResultContent) forecastResultContent.hidden = true;
  }

  function renderForecastResult(forecast) {
    const summary = summarizeMapForecast(forecast);
    const levelInfo = CONGESTION_LEVELS[summary.congestionLevel];
    if (forecastResultPanel) forecastResultPanel.hidden = false;
    if (forecastResultOffset) {
      forecastResultOffset.textContent = `+${forecast.minutes_ahead} phút`;
    }
    if (forecastResultStatus) {
      forecastResultStatus.textContent = "";
      forecastResultStatus.classList.remove("error", "is-loading");
      forecastResultStatus.setAttribute("aria-busy", "false");
      forecastResultStatus.setAttribute("role", "status");
    }
    if (forecastResultLevel) {
      forecastResultLevel.textContent =
        `${summary.congestionLabel} · ${summary.affectedRoadCount}/${summary.totalRoadCount} đoạn`;
      forecastResultLevel.dataset.level = String(summary.congestionLevel);
    }
    if (forecastResultTime) {
      forecastResultTime.textContent = summary.targetTime.toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    if (forecastResultAgreement) {
      forecastResultAgreement.textContent =
        summary.ensembleAgreement === null
          ? "Không khả dụng"
          : `${Math.round(summary.ensembleAgreement * 100)}%`;
    }
    if (forecastResultAgreementNote) {
      forecastResultAgreementNote.textContent =
        summary.ensembleAgreement === null
          ? summary.predictionSource === "heuristic"
            ? "Không có mô hình học máy đang hoạt động để tính đồng thuận."
            : "Mô hình hiện tại không cung cấp đủ dữ liệu để tính đồng thuận."
          : `Ước tính trên ${summary.agreementRoadCount}/${summary.totalRoadCount} đoạn; không phải xác suất dự báo đúng.`;
    }
    if (forecastResultComment) forecastResultComment.textContent = summary.description;
    if (forecastResultRecommendation) {
      forecastResultRecommendation.textContent = summary.recommendation;
    }
    if (forecastResultSource) {
      forecastResultSource.textContent =
        summary.predictionSource === "machine_learning"
          ? "Nguồn: mô hình học máy."
          : "Nguồn: quy tắc ước tính dự phòng; chưa có mô hình học máy hoạt động.";
    }
    if (forecastResultContent) forecastResultContent.hidden = false;
    if (forecastResultLevel) {
      forecastResultLevel.style.color = levelInfo.color;
    }
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
    const isForecastRequest = mode.startsWith("forecast:");
    const forecastMinutes = isForecastRequest
      ? Number(mode.slice("forecast:".length))
      : null;
    if (forecastResultPanel && !isForecastRequest) forecastResultPanel.hidden = true;
    if (isForecastRequest) {
      setForecastResultState(
        forecastMinutes,
        "Đang tính toán tình trạng giao thông dự kiến...",
        false,
        true,
      );
    }
    trafficTimeSlider.disabled = true;
    if (trafficTimePrevious) trafficTimePrevious.disabled = true;
    if (trafficTimeNext) trafficTimeNext.disabled = true;
    trafficForecastButtons.forEach((button) => {
      button.disabled = true;
    });
    if (trafficTimeRetryButton) {
      trafficTimeRetryButton.hidden = true;
      trafficTimeRetryButton.disabled = true;
    }
    setTrafficTimeStatus("Đang tải dữ liệu giao thông...", false, true);

    try {
      let updatedEdges;
      let statusMessage;
      let mapForecast;

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
        mapForecast = await fetchMapForecast({ minutes_ahead: minutesAhead });
        if (!Array.isArray(mapForecast.edges) || mapForecast.edges.length === 0) {
          throw new Error("Chưa có dữ liệu đoạn đường để tạo dự báo.");
        }
        updatedEdges = mapForecast.edges.map((edge) => {
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
            updated_at: mapForecast.target_time,
          };
        });
        const targetTime = new Date(mapForecast.target_time).toLocaleTimeString(
          "vi-VN",
          { hour: "2-digit", minute: "2-digit" },
        );
        statusMessage = `Dự báo sau ${minutesAhead} phút · khoảng ${targetTime}`;
      } else {
        throw new Error("Mốc thời gian được chọn không được hỗ trợ.");
      }

      if (requestId !== trafficRequestId || isDestroyed) return;
      applyTrafficEdges(updatedEdges);
      if (mapForecast) renderForecastResult(mapForecast);
      if (!mode.startsWith("forecast:")) {
        displayedTrafficIndex =
          mode === "current" ? 0 : Number(mode.slice("hour:".length)) + 1;
        updateTrafficSlider(displayedTrafficIndex);
      }
      setActiveTrafficMode(mode);
      trafficRetryMode = null;
      setTrafficTimeStatus(statusMessage);
    } catch (error) {
      if (requestId !== trafficRequestId || isDestroyed) return;
      updateTrafficSlider(displayedTrafficIndex);
      setActiveTrafficMode(displayedTrafficMode);
      trafficRetryMode = mode;
      if (isForecastRequest) {
        setForecastResultState(
          forecastMinutes,
          `Dự báo không khả dụng. ${error instanceof Error ? error.message : "Vui lòng thử lại."}`,
          true,
        );
      }
      setTrafficTimeStatus(
        error instanceof Error
          ? `Không thể tải dữ liệu: ${error.message}`
          : "Không thể tải dữ liệu giao thông.",
        true,
      );
      if (trafficTimeRetryButton) trafficTimeRetryButton.hidden = false;
    } finally {
      if (requestId === trafficRequestId && !isDestroyed) {
        trafficTimeSlider.disabled = false;
        if (trafficTimeRetryButton) trafficTimeRetryButton.disabled = false;
        trafficForecastButtons.forEach((button) => {
          button.disabled = false;
        });
        updateTrafficSlider(trafficTimeSlider.value);
      }
    }
  }

  trafficTimeRetryButton?.addEventListener("click", () => {
    loadTrafficTime(trafficRetryMode || "current");
  });

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
    // Thanh trượt khung giờ (dự báo theo khoảng thời gian): chỉ dành cho Premium
    const nextIndex = Number(trafficTimeSlider.value);
    if (!isPremium() && nextIndex !== 0) {
      setTrafficTimeStatus("Dự báo theo khung giờ chỉ dành cho tài khoản Premium. Đang chuyển đến trang nâng cấp...", true);
      updateTrafficSlider(0); // quay về "Hiện tại"
      setTimeout(() => { window.location.href = "/premium"; }, 1200);
      return;
    }
    loadTrafficTime(getTrafficMode(nextIndex));
  });

  function moveTrafficSlider(direction) {
    if (!trafficTimeSlider || trafficTimeSlider.disabled) return;
    const nextIndex = Math.max(
      0,
      Math.min(24, Number(trafficTimeSlider.value) + direction),
    );
    if (nextIndex === Number(trafficTimeSlider.value)) return;
    // Giới hạn Premium: Standard chỉ xem được "Hiện tại" (index 0)
    if (!isPremium() && direction > 0) {
      setTrafficTimeStatus("Dự báo theo khung giờ chỉ dành cho tài khoản Premium. Đang chuyển đến trang nâng cấp...", true);
      setTimeout(() => { window.location.href = "/premium"; }, 1200);
      return;
    }
    trafficTimeSlider.value = String(nextIndex);
    updateTrafficSlider(nextIndex);
    loadTrafficTime(getTrafficMode(nextIndex));
  }

  trafficTimePrevious?.addEventListener("click", () => moveTrafficSlider(-1));
  trafficTimeNext?.addEventListener("click", () => moveTrafficSlider(1));
  trafficForecastButtons.forEach((button) => {
    button.addEventListener("click", () => {
      // Tính năng dự báo theo khoảng thời gian: chỉ dành cho Premium
      if (!isPremium()) {
        setTrafficTimeStatus("Dự báo theo khoảng thời gian chỉ dành cho tài khoản Premium. Đang chuyển đến trang nâng cấp...", true);
        setTimeout(() => { window.location.href = "/premium"; }, 1200);
        return;
      }
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

  let initialRoadRequestId = 0;

  async function loadInitialRoads() {
    const requestId = ++initialRoadRequestId;
    setMapStatus("loading", "Đang tải dữ liệu đường giao thông...");
    setTrafficSliderEnabled(false);
    setTrafficTimeStatus("Đang tải tình trạng giao thông...", false, true);
    if (retryButton) retryButton.disabled = true;
    if (searchStatus) {
      searchStatus.textContent = "Đang tải dữ liệu tuyến đường...";
      searchStatus.classList.remove("error", "is-empty");
      searchStatus.setAttribute("aria-busy", "true");
    }

    try {
      const edges = await fetchEdges();
      if (requestId !== initialRoadRequestId || isDestroyed || !activeMap) return;

      if (!edges || edges.length === 0) {
        trafficLayerGroup.clearLayers();
        mapPolylines.length = 0;
        corridorEntries = [];
        setMapStatus("empty", "Chưa có dữ liệu đoạn đường để hiển thị trên bản đồ.");
        setTrafficTimeStatus("Chưa có dữ liệu giao thông để tải.");
        if (searchStatus) {
          searchStatus.textContent = "Chưa có dữ liệu tuyến đường để tra cứu.";
          searchStatus.classList.add("is-empty");
          searchStatus.setAttribute("aria-busy", "false");
        }
        searchResultsUl?.replaceChildren();
        return;
      }

      trafficLayerGroup.clearLayers();
      mapPolylines.length = 0;
      corridorEntries = [];
      const corridors = groupByCorridor(edges);
      corridorEntries = corridors.map((corridor) => drawCorridorImmediate(corridor));
      setMapStatus("ready");
      if (searchStatus) {
        searchStatus.textContent = "Nhập tên đường để tìm và chọn một vị trí.";
        searchStatus.classList.remove("error", "is-empty");
        searchStatus.setAttribute("aria-busy", "false");
      }
      searchResultsUl?.replaceChildren();

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
              corridor.edges.map((e) =>
                // Geometry chỉ có 2 điểm là đường thẳng nối 2 nút -> vẫn căn lại theo OSRM
                e.geometry?.length > 2
                  ? {
                      pts: e.geometry,
                      distance: polylineLength(e.geometry),
                    }
                  : snapEdgeGeometry(e.from, e.to, abortSignal),
              ),
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
      if (requestId !== initialRoadRequestId || isDestroyed) return;
      const message = err instanceof Error ? err.message : "Lỗi không xác định.";
      setMapStatus("error", `Không thể tải dữ liệu bản đồ: ${message}`);
      setTrafficTimeStatus("Không thể tải dữ liệu giao thông.", true);
      if (searchStatus) {
        searchStatus.textContent = "Không thể tải tuyến đường. Hãy thử tải lại bản đồ.";
        searchStatus.classList.add("error");
        searchStatus.classList.remove("is-empty");
        searchStatus.setAttribute("aria-busy", "false");
        searchStatus.setAttribute("role", "alert");
      }
    } finally {
      if (requestId === initialRoadRequestId && !isDestroyed && retryButton) {
        retryButton.disabled = false;
      }
    }
  }

  retryButton?.addEventListener("click", loadInitialRoads);
  loadInitialRoads();

  // ============================================================
  // Tìm kiếm theo tên trục / tên đường
  // ============================================================
  // ============================================================
  // ĐỊA ĐIỂM YÊU THÍCH (Favorites)
  // ============================================================
  const FAVORITES_STORAGE_KEY = "traffic_favorite_places";

  function findMatchingCorridors(query) {
    const normalizedQuery = query.trim().toLocaleLowerCase("vi");
    if (!normalizedQuery) return [];

    return mapPolylines.filter(
      ({ corridor }) =>
        corridor.corridor_name.toLocaleLowerCase("vi").includes(normalizedQuery) ||
        corridor.edges.some((edge) =>
          edge.street_name?.toLocaleLowerCase("vi").includes(normalizedQuery),
        ),
    );
  }

  function loadFavoritePlaces() {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("Dữ liệu yêu thích trong trình duyệt không hợp lệ.");
    }
    return parsed;
  }

  function saveFavoritePlaces(list) {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(list));
  }

  const searchHistoryUserId = isLoggedIn() ? getUser()?.user_id : null;
  const searchHistoryToggleBtn = document.getElementById("search-history-toggle");
  const searchHistoryOverlay = document.getElementById("search-history-overlay");
  const searchHistoryCloseBtn = document.getElementById("search-history-close");
  const searchHistoryList = document.getElementById("search-history-list");
  const searchHistoryStatus = document.getElementById("search-history-status");
  if (searchHistoryToggleBtn) {
    searchHistoryToggleBtn.hidden = !searchHistoryUserId;
  }

  function setSearchHistoryStatus(message, isError = false) {
    if (!searchHistoryStatus) return;
    searchHistoryStatus.textContent = message;
    searchHistoryStatus.classList.toggle("error", isError);
  }

  function closeSearchHistoryPopup() {
    if (searchHistoryOverlay) searchHistoryOverlay.hidden = true;
  }

  function repeatSearch(entry) {
    closeSearchHistoryPopup();
    if (entry.type === "route") {
      routeOriginInput.value = entry.origin;
      routeDestinationInput.value = entry.destination;
      routeVehicleSelect.value = entry.vehicle;
      routeForm.requestSubmit();
      return;
    }

    roadQueryInput.value = entry.query;
    roadSearchForm.requestSubmit();
  }

  function renderSearchHistory() {
    if (!searchHistoryUserId || !searchHistoryList) return;
    const history = loadSearchHistory(searchHistoryUserId);
    searchHistoryList.replaceChildren();

    if (!history.length) {
      const empty = document.createElement("li");
      empty.className = "favorites-empty";
      empty.textContent = "Bạn chưa có lịch sử tìm kiếm nào.";
      searchHistoryList.append(empty);
      return;
    }

    history.forEach((entry) => {
      const item = document.createElement("li");
      item.className = "favorites-item";

      const info = document.createElement("div");
      info.className = "search-history-info";
      const title = document.createElement("strong");
      title.textContent =
        entry.type === "route"
          ? `${entry.origin} → ${entry.destination}`
          : entry.query;
      const details = document.createElement("small");
      const typeLabel = entry.type === "route" ? "Tuyến đường" : "Địa điểm";
      details.textContent = `${typeLabel} · ${new Date(entry.createdAt).toLocaleString("vi-VN")}`;
      info.append(title, details);

      const repeatButton = document.createElement("button");
      repeatButton.className = "favorites-goto";
      repeatButton.type = "button";
      repeatButton.textContent = "Tìm lại";
      repeatButton.addEventListener("click", () => repeatSearch(entry));

      item.append(info, repeatButton);
      searchHistoryList.append(item);
    });
  }

  function recordSearchHistory(entry) {
    if (!searchHistoryUserId) return;
    try {
      addSearchHistoryEntry(searchHistoryUserId, entry);
      if (searchHistoryOverlay && !searchHistoryOverlay.hidden) {
        renderSearchHistory();
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Không thể lưu lịch sử tìm kiếm.";
      const message = `Không thể lưu lịch sử tìm kiếm: ${errorMessage}`;
      setSearchHistoryStatus(message, true);
      showToast(message, "error");
      if (entry.type === "route") {
        setRouteStatus(message, true);
      } else if (searchStatus) {
        searchStatus.textContent = message;
        searchStatus.classList.add("error");
        searchStatus.setAttribute("role", "alert");
      }
    }
  }

  function openSearchHistoryPopup() {
    if (!searchHistoryOverlay) return;
    searchHistoryOverlay.hidden = false;
    setSearchHistoryStatus("");
    try {
      renderSearchHistory();
    } catch (error) {
      setSearchHistoryStatus(
        error instanceof Error ? error.message : "Không thể tải lịch sử tìm kiếm.",
        true,
      );
    }
  }

  if (searchHistoryToggleBtn) {
    searchHistoryToggleBtn.addEventListener("click", openSearchHistoryPopup);
  }
  if (searchHistoryCloseBtn) {
    searchHistoryCloseBtn.addEventListener("click", closeSearchHistoryPopup);
  }
  if (searchHistoryOverlay) {
    searchHistoryOverlay.addEventListener("click", (event) => {
      if (event.target === searchHistoryOverlay) closeSearchHistoryPopup();
    });
  }

  const favoritesOverlay = document.getElementById("favorites-overlay");
  const favoritesToggleBtn = document.getElementById("favorites-toggle-btn");
  const favoritesCloseBtn = document.getElementById("favorites-close");
  const favoriteSaveBtn = document.getElementById("favorite-save-btn");
  const roadQueryFavInput = document.getElementById("road-query");
  const favoritesListUl = document.getElementById("favorites-list");
  const favoritesStatus = document.getElementById("favorites-status");

  function setFavoritesStatus(message, isError = false) {
    if (!favoritesStatus) return;
    favoritesStatus.textContent = message;
    favoritesStatus.classList.toggle("error", isError);
  }

  function renderFavoritePlaces() {
    if (!favoritesListUl) return;
    favoritesListUl.replaceChildren();
    let places;
    try {
      places = loadFavoritePlaces();
    } catch (error) {
      const item = document.createElement("li");
      item.className = "favorites-error";
      item.textContent =
        error instanceof Error
          ? `Không thể tải danh sách yêu thích: ${error.message}`
          : "Không thể tải danh sách yêu thích.";
      favoritesListUl.append(item);
      setFavoritesStatus("Có lỗi khi đọc danh sách yêu thích.", true);
      return;
    }
    setFavoritesStatus("");

    if (!places.length) {
      const empty = document.createElement("li");
      empty.className = "favorites-empty";
      empty.textContent = "Chưa có tuyến đường hoặc địa điểm yêu thích nào.";
      favoritesListUl.append(empty);
      return;
    }

    places.forEach((place) => {
      const li = document.createElement("li");
      li.className = "favorites-item";

      const info = document.createElement("div");
      info.className = "favorites-item-info";
      const name = document.createElement("strong");
      name.textContent = place.name;
      const addr = document.createElement("small");
      addr.textContent = place.display_name || place.corridor_name;
      info.append(name, addr);

      const gotoBtn = document.createElement("button");
      gotoBtn.className = "favorites-goto";
      gotoBtn.type = "button";
      gotoBtn.textContent = "Xem trên bản đồ";
      gotoBtn.addEventListener("click", () => {
        if (window.innerWidth <= 920) switchToMapView();
        if (place.type === "corridor") {
          const entry = mapPolylines.find(
            (item) =>
              item.corridor.corridor_name === place.corridor_name,
          );
          if (!entry || !entry.segmentLayers.length) {
            setFavoritesStatus(
              `Không tìm thấy tuyến "${place.corridor_name}" trên bản đồ.`,
              true,
            );
            return;
          }
          const bounds = L.featureGroup(entry.segmentLayers).getBounds();
          if (!bounds.isValid()) {
            setFavoritesStatus(
              `Không thể xác định vị trí tuyến "${place.corridor_name}".`,
              true,
            );
            return;
          }
          map.fitBounds(bounds, { padding: [40, 40] });
          openCorridorPopup(entry, bounds.getCenter());
          closeFavoritesPopup();
          return;
        }

        map.setView([place.lat, place.lng], 16);
        L.circleMarker([place.lat, place.lng], {
          radius: 10,
          color: "#ffffff",
          weight: 3,
          fillColor: "#e11d48",
          fillOpacity: 1,
        })
          .bindTooltip(place.name, { direction: "top", offset: [0, -8] })
          .addTo(map);
        closeFavoritesPopup();
      });

      const removeBtn = document.createElement("button");
      removeBtn.className = "favorites-remove";
      removeBtn.type = "button";
      removeBtn.textContent = "Xóa";
      removeBtn.setAttribute("aria-label", `Xóa ${place.name}`);
      removeBtn.addEventListener("click", () => {
        try {
          saveFavoritePlaces(
            loadFavoritePlaces().filter((p) => p.id !== place.id),
          );
          renderFavoritePlaces();
          setFavoritesStatus(`Đã xóa "${place.name}" khỏi danh sách yêu thích.`);
        } catch (err) {
          setFavoritesStatus(
            err?.message || "Không thể xóa mục yêu thích.",
            true,
          );
        }
      });

      li.append(info, gotoBtn, removeBtn);
      favoritesListUl.append(li);
    });
  }

  function openFavoritesPopup() {
    if (!favoritesOverlay) return;
    if (!isLoggedIn()) {
      favoritesToggleBtn?.setAttribute("hidden", "");
      closeFavoritesPopup();
      return;
    }
    favoritesOverlay.hidden = false;
    renderFavoritePlaces();
  }

  function closeFavoritesPopup() {
    if (favoritesOverlay) favoritesOverlay.hidden = true;
  }

  if (favoritesToggleBtn) {
    favoritesToggleBtn.hidden = !isLoggedIn();
    favoritesToggleBtn.addEventListener("click", openFavoritesPopup);
  }
  if (favoritesCloseBtn)
    favoritesCloseBtn.addEventListener("click", closeFavoritesPopup);
  if (favoritesOverlay) {
    favoritesOverlay.addEventListener("click", (e) => {
      if (e.target === favoritesOverlay) closeFavoritesPopup();
    });
  }

  if (favoriteSaveBtn) {
    favoriteSaveBtn.hidden = !isLoggedIn();
    favoriteSaveBtn.addEventListener("click", async () => {
      const query = roadQueryFavInput?.value.trim();
      if (!query) {
        setRouteStatus(
          "Hãy nhập tên đường hoặc địa điểm trước khi thêm vào yêu thích.",
          true,
        );
        return;
      }

      favoriteSaveBtn.disabled = true;
      favoriteSaveBtn.setAttribute("aria-pressed", "false");
      try {
        const corridorEntry = findMatchingCorridors(query)[0];
        if (corridorEntry) {
          const corridorName = corridorEntry.corridor.corridor_name;
          const list = loadFavoritePlaces();
          if (
            list.some(
              (item) =>
                item.type === "corridor" &&
                item.corridor_name.toLocaleLowerCase("vi") ===
                  corridorName.toLocaleLowerCase("vi"),
            )
          ) {
            favoriteSaveBtn.setAttribute("aria-pressed", "true");
            setRouteStatus(`Tuyến "${corridorName}" đã có trong yêu thích.`);
            return;
          }

          const streetNames = [
            ...new Set(
              corridorEntry.corridor.edges
                .map((edge) => edge.street_name)
                .filter(Boolean),
            ),
          ];
          list.push({
            id: `fav_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            type: "corridor",
            name: corridorName,
            corridor_name: corridorName,
            display_name: streetNames.join(", ") || "Tuyến đường",
          });
          saveFavoritePlaces(list);
          favoriteSaveBtn.setAttribute("aria-pressed", "true");
          setRouteStatus(`Đã thêm tuyến "${corridorName}" vào yêu thích.`);
          setFavoritesStatus(`Đã thêm tuyến "${corridorName}" vào yêu thích.`);
          renderFavoritePlaces();
          return;
        }

        const place = await geocodeAddress(query);
        const list = loadFavoritePlaces();
        if (
          list.some(
            (p) =>
              Math.abs(p.lat - place.lat) < 1e-6 &&
              Math.abs(p.lng - place.lng) < 1e-6,
          )
        ) {
          setRouteStatus("Địa điểm này đã có trong danh sách yêu thích.", true);
          return;
        }
        list.push({
          id: `fav_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: query.slice(0, 80),
          display_name: place.display_name,
          lat: place.lat,
          lng: place.lng,
        });
        saveFavoritePlaces(list);
        favoriteSaveBtn.setAttribute("aria-pressed", "true");
        setRouteStatus(`Đã thêm "${query}" vào địa điểm yêu thích.`);
        setFavoritesStatus(`Đã thêm "${query}" vào địa điểm yêu thích.`);
        renderFavoritePlaces();
      } catch (err) {
        setRouteStatus(
          err?.message || "Không thể thêm địa điểm. Vui lòng thử lại.",
          true,
        );
      } finally {
        favoriteSaveBtn.disabled = false;
      }
    });
  }

  if (roadQueryFavInput) {
    roadQueryFavInput.addEventListener("input", () => {
      favoriteSaveBtn?.setAttribute("aria-pressed", "false");
    });
  }

  // ============================================================
  if (roadSearchForm) {
    function setSearchStatus(message, state = "idle") {
      if (!searchStatus) return;
      searchStatus.textContent = message;
      searchStatus.classList.toggle("error", state === "error");
      searchStatus.classList.toggle("is-empty", state === "empty");
      searchStatus.setAttribute("aria-busy", String(state === "loading"));
      searchStatus.setAttribute("role", state === "error" ? "alert" : "status");
    }

    roadSearchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const query = roadQueryInput.value.trim();
      if (!query) {
        setSearchStatus("Nhập tên đường cần tra cứu.", "error");
        return;
      }

      recordSearchHistory({ type: "place", query });
      searchResultsUl.replaceChildren();
      if (!corridorEntries.length) {
        setSearchStatus("Dữ liệu tuyến đường chưa sẵn sàng. Hãy tải lại bản đồ.", "error");
        return;
      }
      const matched = findMatchingCorridors(query);

      if (matched.length === 0) {
        setSearchStatus(`Không tìm thấy tuyến đường phù hợp với “${query}”.`, "empty");
        return;
      }

      matched.forEach((item) => {
        const li = document.createElement("li");
        const resultButton = document.createElement("button");
        resultButton.className = "list-item";
        resultButton.type = "button";
        const corridorName = document.createElement("strong");
        corridorName.textContent = item.corridor.corridor_name;
        resultButton.append(corridorName);
        if (item.avgSpeed) {
          const speed = document.createElement("small");
          speed.className = "item-value";
          speed.textContent = `${fmt(item.avgSpeed)} km/h`;
          resultButton.append(speed);
        }

        resultButton.addEventListener("click", () => {
          if (window.innerWidth <= 920) switchToMapView();
          const bounds = L.featureGroup(item.segmentLayers).getBounds();
          map.fitBounds(bounds, { padding: [40, 40] });
          openCorridorPopup(item, bounds.getCenter());
        });

        li.append(resultButton);
        searchResultsUl.appendChild(li);
      });
      setSearchStatus(`Tìm thấy ${matched.length} tuyến đường. Chọn tuyến để xem trên bản đồ.`);

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
      if (query.length < 3) {
        setRouteStatus(
          query ? "Nhập ít nhất 3 ký tự để tìm gợi ý." : "Nhập điểm đi và điểm đến tại Hà Nội để tính lộ trình tối ưu.",
        );
        return;
      }

      setRouteStatus("Đang tìm gợi ý địa điểm...");
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

      recordSearchHistory({
        type: "route",
        origin: originQuery,
        destination: destQuery,
        vehicle,
      });

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

  const chatRouteParams = new URLSearchParams(window.location.search);
  const chatOrigin = chatRouteParams.get("origin")?.trim();
  const chatDestination = chatRouteParams.get("destination")?.trim();
  if (
    routeForm &&
    chatRouteParams.get("chat_route") === "1" &&
    chatOrigin &&
    chatDestination &&
    chatOrigin.length <= 200 &&
    chatDestination.length <= 200
  ) {
    routeOriginInput.value = chatOrigin;
    routeDestinationInput.value = chatDestination;
    routeForm.requestSubmit();
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
  const popupChartStatusMessage = document.getElementById("popup-chart-status-message");
  const popupChartSpinner = document.getElementById("popup-chart-spinner");
  const popupChartRetryBtn = document.getElementById("popup-chart-retry");
  const popupChartWrap = document.getElementById("popup-chart-wrap");

  let currentPopupData = null;
  let chartRequestId = 0;

  function setPopupChartStatus(message, state = "ready") {
    if (!popupChartStatus) return;
    popupChartStatus.hidden = !message;
    popupChartStatus.classList.toggle("is-error", state === "error");
    popupChartStatus.classList.toggle("is-empty", state === "empty");
    popupChartStatus.setAttribute("role", state === "error" ? "alert" : "status");
    popupChartStatus.setAttribute("aria-busy", String(state === "loading"));
    if (popupChartStatusMessage) popupChartStatusMessage.textContent = message;
    else popupChartStatus.textContent = message;
    if (popupChartSpinner) popupChartSpinner.hidden = state !== "loading";
  }

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
        const history = await fetchEdgeHistory(edge.edge_id, {
          start,
          end,
          signal: abortSignal,
        });
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
    setPopupChartStatus("Đang tải dữ liệu tốc độ theo giờ...", "loading");
    if (popupChartRetryBtn) popupChartRetryBtn.hidden = true;

    try {
      const { series } = await fetchCorridorHourlyHistory(entry);
      if (requestId !== chartRequestId || currentPopupData !== entry) return;

      const hasData = [...series.today, ...series.average].some(
        (speed) => speed !== null,
      );
      if (!hasData) {
        setPopupChartStatus(
          "Chưa có dữ liệu tốc độ theo giờ cho đoạn đường này.",
          "empty",
        );
        return;
      }

      const hasGaps = [...series.today, ...series.average].some(
        (speed) => speed === null,
      );
      setPopupChartStatus(
        hasGaps
          ? "Một số khung giờ chưa có dữ liệu và được để trống trên biểu đồ."
          : "",
        hasGaps ? "empty" : "ready",
      );

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
      setPopupChartStatus(
        `Không thể tải dữ liệu biểu đồ: ${error instanceof Error ? error.message : "Lỗi không xác định."}`,
        "error",
      );
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
    try {
      initMapPage();
    } catch (error) {
      showFatalMapError(container, error);
    }
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
