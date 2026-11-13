// File: src/js/pages/mapPage.js
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Chart from "chart.js/auto";
import { renderHeader } from "../components/header.js";
import { renderFooter } from "../components/footer.js";
import { renderMapView } from "../views/mapView.js";
import { fetchEdges, parseSpeedKmh, CONGESTION_LEVELS, NO_DATA_COLOR } from "../api.js";

let activeMap = null;
let activeChart = null;
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
  const GEOCODER_URL = requireEnv("VITE_GEOCODER_URL");
  const SEARCH_VIEWBOX = requireEnv("VITE_SEARCH_VIEWBOX");

  backgroundAbortController = new AbortController();
  const abortSignal = backgroundAbortController.signal;

  // ============================================================
  // DOM Elements
  // ============================================================
  const statusOverlay = document.getElementById("status-overlay");
  const roadSearchForm = document.getElementById("road-search");
  const roadQueryInput = document.getElementById("road-query");
  const searchResultsUl = document.getElementById("search-results");
  const detailDiv = document.getElementById("detail");
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
  let activeRouteEstimate = null;
  let routeActive = false;
  let routeRequestId = 0;
  let lastGeocodeRequestAt = 0;

  function setRouteStatus(message, isError = false) {
    if (!routeStatus) return;
    routeStatus.textContent = message;
    routeStatus.classList.toggle("error", isError);
  }

  async function fetchWithTimeout(url, timeoutMs = 12000, signal = null) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { signal: signal || controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function geocodeAddress(query) {
    const cacheKey = query.trim().toLocaleLowerCase("vi");
    if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);

    const delay = Math.max(0, 800 - (Date.now() - lastGeocodeRequestAt));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));

    const params = new URLSearchParams({
      format: "jsonv2",
      limit: "1",
      countrycodes: "vn",
      bounded: "1",
      viewbox: SEARCH_VIEWBOX,
      q: `${query}, Hà Nội, Việt Nam`,
    });

    const response = await fetchWithTimeout(`${GEOCODER_URL}?${params}`, 10000);
    lastGeocodeRequestAt = Date.now();
    if (!response.ok) {
      throw new Error(`Dịch vụ tìm kiếm trả về mã lỗi HTTP ${response.status}.`);
    }

    const results = await response.json();
    if (!results.length) {
      throw new Error(`Không tìm thấy địa điểm "${query}" tại Hà Nội.`);
    }

    const location = {
      lat: Number(results[0].lat),
      lng: Number(results[0].lon),
    };
    geocodeCache.set(cacheKey, location);
    return location;
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
  const trafficLayerGroup = L.featureGroup().addTo(map);

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
    group.on("click", () => showCorridorDetail(entry));
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

  function showCorridorDetail(entry) {
    const corridor = entry.corridor;
    if (!detailDiv) return;

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
        return `
        <li style="display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom: 1px solid var(--border);">
          <span style="width:8px; height:8px; border-radius:50%; background:${e.color_code || lvl?.color || NO_DATA_COLOR}; flex-shrink:0;"></span>
          <span style="flex:1; font-size: 13px;">
            <strong>${e.street_name}</strong>
            <div style="color:var(--text-muted); font-size: 12px;">${e.from.node_name} → ${e.to.node_name}</div>
          </span>
          <span style="font-size: 13px; font-weight: 700; color:var(--text); white-space:nowrap;">${speedTxt}</span>
          <span style="color:var(--text-muted); font-size: 12px;">${fmt(distM / 1000)} km</span>
        </li>`;
      })
      .join("");

    detailDiv.hidden = false;
    detailDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
        <div>
          <span style="font-size: 11px; font-weight: 800; color: var(--primary); text-transform: uppercase; letter-spacing: 0.04em;">Chi tiết trục đường</span>
          <h2 style="font-size: 17px; font-weight: 800; margin: 2px 0 0;">${corridor.corridor_name}</h2>
        </div>
        <button type="button" id="detail-close-btn" style="background: var(--surface-subtle); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 2px 8px; font-size: 12px; font-weight: 600; cursor: pointer; color: var(--text-muted);" title="Đóng chi tiết">Đóng</button>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; font-size: 13px;">
        <div style="background: #ffffff; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px;">
          <div style="font-size: 11px; color: var(--text-muted);">Vận tốc trung bình</div>
          <strong style="color: var(--primary); font-size: 14px;">${entry.avgSpeed ? fmt(entry.avgSpeed) + " km/h" : "Đang tính..."}</strong>
        </div>
        <div style="background: #ffffff; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px;">
          <div style="font-size: 11px; color: var(--text-muted);">Tổng chiều dài</div>
          <strong style="font-size: 14px;">${entry.totalKm ? fmt(entry.totalKm) + " km" : "--"}</strong>
        </div>
      </div>

      ${entry.maxSpeedLimit ? `<p style="margin: 0 0 10px; font-size: 12px; color: var(--text-muted);">Tốc độ tối đa cho phép: <strong>${entry.maxSpeedLimit} km/h</strong></p>` : ""}
      <p style="margin: 0 0 4px; font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em;">Trạng thái ${corridor.edges.length} phân đoạn:</p>
      <ul style="list-style:none; padding:0; margin:0 0 4px 0;">${rows}</ul>
    `;

    const closeBtn = document.getElementById("detail-close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        detailDiv.hidden = true;
      });
    }

    updatePopupContent(entry);
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
      const corridorEntries = corridors.map((corridor) => drawCorridorImmediate(corridor));

      // Tự động căn chỉnh bản đồ theo các tuyến đường thực tế
      const allLayers = corridorEntries.flatMap((c) => c.segmentLayers);
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
          const bounds = L.featureGroup(item.segmentLayers).getBounds();
          map.fitBounds(bounds, { padding: [40, 40] });
          showCorridorDetail(item);
        });

        searchResultsUl.appendChild(li);
      });

      const bounds = L.featureGroup(matched[0].segmentLayers).getBounds();
      map.fitBounds(bounds, { padding: [40, 40] });
      showCorridorDetail(matched[0]);
    });
  }

  // ============================================================
  // Đổi chiều lộ trình
  // ============================================================
  const routeSwapBtn = document.getElementById("route-swap");
  if (routeSwapBtn && routeOriginInput && routeDestinationInput) {
    routeSwapBtn.addEventListener("click", () => {
      const temp = routeOriginInput.value;
      routeOriginInput.value = routeDestinationInput.value;
      routeDestinationInput.value = temp;
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
    routeActive = false;
    mapPolylines.forEach((item) => {
      item.segmentLayers.forEach((l) => l.setStyle({ weight: 7, opacity: 0.88 }));
    });
    if (routeSummary) routeSummary.hidden = true;
    if (routeCancelButton) routeCancelButton.hidden = true;
  }

  if (routeCancelButton) {
    routeCancelButton.addEventListener("click", () => {
      clearRoute();
      setRouteStatus("Đã hủy tuyến đường hiển thị.");
    });
  }

  if (routeForm) {
    routeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const originQuery = routeOriginInput.value.trim();
      const destQuery = routeDestinationInput.value.trim();
      const vehicle = routeVehicleSelect.value || "car";
      if (!originQuery || !destQuery) return;

      const currentId = ++routeRequestId;
      routeSubmitButton.disabled = true;
      setRouteStatus("Đang định vị địa điểm và tính lộ trình tối ưu...");

      try {
        const [origin, dest] = await Promise.all([
          geocodeAddress(originQuery),
          geocodeAddress(destQuery),
        ]);

        if (currentId !== routeRequestId || isDestroyed || !activeMap) return;

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

        // Làm mờ các tuyến corridor xung quanh để lộ trình hiển thị nổi bật
        mapPolylines.forEach((item) => {
          item.segmentLayers.forEach((l) => l.setStyle({ weight: 4, opacity: 0.18 }));
        });

        const routeLine = L.polyline(coordinates, {
          pane: "routePane",
          color: "#2563eb",
          weight: 6,
          opacity: 0.95,
        });

        const startMarker = L.circleMarker([origin.lat, origin.lng], {
          pane: "routeMarkerPane",
          radius: 7,
          color: "#ffffff",
          weight: 2,
          fillColor: "#10b981",
          fillOpacity: 1,
        });

        const endMarker = L.circleMarker([dest.lat, dest.lng], {
          pane: "routeMarkerPane",
          radius: 7,
          color: "#ffffff",
          weight: 2,
          fillColor: "#ef4444",
          fillOpacity: 1,
        });

        activeRoute = L.featureGroup([routeLine, startMarker, endMarker]).addTo(map);
        map.fitBounds(activeRoute.getBounds(), { padding: [50, 50] });

        const profile = VEHICLE_SPEED_PROFILES[vehicle] || VEHICLE_SPEED_PROFILES.car;
        const estDuration = (route.duration / profile.factor);

        if (routeDistance) routeDistance.textContent = `${(route.distance / 1000).toFixed(1)} km`;
        if (routeDuration) routeDuration.textContent = formatDuration(estDuration);
        if (routeSummary) routeSummary.hidden = false;
        if (routeCancelButton) routeCancelButton.hidden = false;
        setRouteStatus("Đã vẽ lộ trình di chuyển tối ưu.");
      } catch (err) {
        setRouteStatus(`Lỗi: ${err.message}`, true);
      } finally {
        routeSubmitButton.disabled = false;
      }
    });
  }

  // ============================================================
  // Popup chi tiết & Chart.js
  // ============================================================
  const popupOverlay = document.getElementById("popup-overlay");
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

  let currentPopupData = null;

  function openPopup() {
    if (popupOverlay) popupOverlay.hidden = false;
    showInfoPage();
  }

  function closePopup() {
    if (popupOverlay) popupOverlay.hidden = true;
  }

  function showInfoPage() {
    if (popupInfoPage) popupInfoPage.hidden = false;
    if (popupChartPage) popupChartPage.hidden = true;
  }

  function showChartPage() {
    if (popupInfoPage) popupInfoPage.hidden = true;
    if (popupChartPage) popupChartPage.hidden = false;
    if (currentPopupData) drawChart(currentPopupData);
  }

  function updatePopupContent(entry) {
    if (!entry) return;
    currentPopupData = entry;
    const corridor = entry.corridor;

    if (popupRoadName) popupRoadName.textContent = corridor.corridor_name;
    if (popupAvgSpeed) popupAvgSpeed.textContent = entry.avgSpeed ? `${fmt(entry.avgSpeed)} km/h` : "--";

    if (popupCongestionLevel) {
      const dominant = corridor.edges[0]?.congestion_level;
      const lvl = CONGESTION_LEVELS[dominant];
      popupCongestionLevel.textContent = lvl ? lvl.label : "Bình thường";
    }

    if (popupUpdateTime) {
      popupUpdateTime.textContent = new Date().toLocaleTimeString("vi-VN");
    }
  }

  function drawChart(entry) {
    if (!popupCanvas || !entry) return;
    if (activeChart) {
      activeChart.destroy();
      activeChart = null;
    }

    const corridor = entry.corridor;
    const labels = [];
    const speeds = [];
    const colors = [];

    corridor.edges.forEach((e) => {
      labels.push(e.street_name || e.from.node_name);
      const spd = parseSpeedKmh(e.speed) || (CONGESTION_LEVELS[e.congestion_level]?.speed || 25);
      speeds.push(spd);
      colors.push(e.color_code || CONGESTION_LEVELS[e.congestion_level]?.color || NO_DATA_COLOR);
    });

    const ctx = popupCanvas.getContext("2d");
    activeChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Tốc độ (km/h)",
            data: speeds,
            backgroundColor: colors,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: "Vận tốc (km/h)" },
          },
        },
      },
    });
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
}

export const mapPage = {
  mount(container) {
    isDestroyed = false;
    container.innerHTML = `
      ${renderHeader("/map")}
      ${renderMapView()}
      ${renderFooter()}
    `;
    initMapPage();
  },

  unmount() {
    isDestroyed = true;
    if (backgroundAbortController) {
      backgroundAbortController.abort();
      backgroundAbortController = null;
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
