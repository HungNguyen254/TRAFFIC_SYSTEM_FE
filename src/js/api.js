// File: src/js/api.js
// Client API và Chuẩn hoá dữ liệu kết nối trực tiếp với Backend FastAPI

import { CONGESTION_LEVELS, NO_DATA_COLOR } from "./constants/traffic.js";

const ENV =
  typeof import.meta !== "undefined" && import.meta.env
    ? import.meta.env
    : typeof process !== "undefined"
      ? process.env
      : {};

function requireEnv(name) {
  const value = ENV[name];
  if (!value) {
    throw new Error(
      `Thiếu cấu hình ${name} trong file .env của FE. Hãy copy .env.example thành .env và điền giá trị.`,
    );
  }
  return value;
}

export const API_BASE_URL = requireEnv("VITE_API_BASE_URL");
export const API_HEALTH_URL = requireEnv("VITE_API_HEALTH_URL");

const TOKEN_KEY = "traffic_token";
const USER_KEY = "traffic_user";

function getStorage() {
  if (typeof localStorage !== "undefined") return localStorage;
  if (typeof globalThis !== "undefined" && globalThis.localStorage) return globalThis.localStorage;
  return null;
}

export function getToken() {
  return getStorage()?.getItem(TOKEN_KEY) || "";
}

export function getUser() {
  try {
    return JSON.parse(getStorage()?.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

export function saveSession(token, user) {
  const storage = getStorage();
  if (storage) {
    storage.setItem(TOKEN_KEY, token);
    storage.setItem(USER_KEY, JSON.stringify(user));
  }
}

export function clearSession() {
  const storage = getStorage();
  if (storage) {
    storage.removeItem(TOKEN_KEY);
    storage.removeItem(USER_KEY);
  }
}

export function isLoggedIn() {
  return Boolean(getToken());
}

export function isAdmin() {
  return getUser()?.role === "admin";
}

/** Gói người dùng: "standard" hoặc "premium" */
export function getPlan() {
  return getUser()?.plan || "standard";
}

export function isPremium() {
  return getPlan() === "premium";
}

/** Cập nhật plan trong localStorage sau khi nâng cấp */
export function setPlan(plan) {
  const user = getUser();
  if (user) {
    user.plan = plan;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

/**
 * Gọi API tự động nâng cấp lên Premium (demo, chưa cần thanh toán)
 * @returns {Promise<object>} UpgradePlanResponse
 */
export async function upgradeToPremium() {
  const data = await request("/auth/upgrade-plan", {
    method: "POST",
    auth: true,
  });
  setPlan(data.plan);
  return data;
}

/**
 * Hủy gói Premium, quay về Standard
 * @returns {Promise<object>} UpgradePlanResponse
 */
export async function cancelPremium() {
  const data = await request("/auth/cancel-premium", {
    method: "POST",
    auth: true,
  });
  setPlan(data.plan);
  return data;
}

/** Đồng bộ plan mới nhất từ server (gọi khi load app) */
export async function refreshPlan() {
  if (!isLoggedIn()) return;
  try {
    const data = await request("/auth/me", { auth: true });
    setPlan(data.plan);
  } catch {
    /* bỏ qua */
  }
}

/**
 * Trích xuất vận tốc dạng số km/h an toàn từ chuỗi hoặc số
 * @param {string|number} value
 * @returns {number|null}
 */
export function parseSpeedKmh(value) {
  if (value === null || value === undefined) return null;
  const speed =
    typeof value === "number"
      ? value
      : Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(speed) && speed > 0 ? speed : null;
}

/**
 * Tính mức độ ùn tắc (1..4) tương ứng theo dải vận tốc chuẩn
 * @param {number|null} speedKmh
 * @returns {number|null}
 */
export function trafficLevelFromSpeed(speedKmh) {
  if (speedKmh === null || !Number.isFinite(speedKmh) || speedKmh <= 0)
    return null;
  if (speedKmh >= 35) return 1; // Thông thoáng
  if (speedKmh >= 25) return 2; // Di chuyển chậm
  if (speedKmh >= 15) return 3; // Ùn tắc nghiêm trọng
  return 4; // Kẹt xe hoàn toàn
}

function normalizeEdgeGeometry(geometryValue) {
  if (!geometryValue) return null;
  try {
    const geometry =
      typeof geometryValue === "string"
        ? JSON.parse(geometryValue)
        : geometryValue;
    if (
      geometry?.type !== "LineString" ||
      !Array.isArray(geometry.coordinates)
    ) {
      return null;
    }

    const coordinates = geometry.coordinates.map((point) => {
      if (!Array.isArray(point) || point.length < 2) return null;
      const lng = Number(point[0]);
      const lat = Number(point[1]);
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        return null;
      }
      return [lat, lng];
    });
    return coordinates.length >= 2 && coordinates.every(Boolean)
      ? coordinates
      : null;
  } catch {
    return null;
  }
}

/**
 * Chuẩn hóa danh sách edges từ API backend về cấu trúc đồng nhất
 * @param {any} raw
 * @returns {Array<object>}
 */
export function normalizeEdges(raw) {
  if (!raw) return [];
  const nodesById = Object.create(null);
  if (Array.isArray(raw.nodes)) {
    raw.nodes.forEach((n) => {
      if (n.node_id) nodesById[n.node_id] = n;
      if (n.node_code) nodesById[n.node_code] = n;
      if (n.id) nodesById[n.id] = n;
    });
  }

  const list = Array.isArray(raw.edges)
    ? raw.edges
    : Array.isArray(raw)
      ? raw
      : [];

  return list.map((e) => {
    const rawFrom = e.from || e.from_node || {};
    const rawTo = e.to || e.to_node || {};
    const from =
      nodesById[e.from_node_id] ||
      nodesById[rawFrom.node_id] ||
      nodesById[rawFrom.node_code] ||
      rawFrom;
    const to =
      nodesById[e.to_node_id] ||
      nodesById[rawTo.node_id] ||
      nodesById[rawTo.node_code] ||
      rawTo;
    const rec = e.latest_traffic || e.traffic_record || {};
    const speed =
      rec.speed ??
      rec.current_speed ??
      rec.speed_kmh ??
      rec.predicted_speed ??
      e.speed ??
      e.current_speed ??
      e.speed_kmh ??
      e.predicted_speed ??
      null;
    const speedKmh = parseSpeedKmh(speed);
    const declaredLevel = Number(rec.congestion_level ?? e.congestion_level);
    const level = CONGESTION_LEVELS[declaredLevel]
      ? declaredLevel
      : trafficLevelFromSpeed(speedKmh);

    return {
      edge_id: String(e.edge_id || e.id || ""),
      edge_code: String(e.edge_code || e.id || ""),
      street_name: String(e.street_name || e.name || "Tuyến đường"),
      corridor_name: String(
        e.corridor_name || e.street_name || e.name || "Trục đường",
      ),
      from_node_id: String(from.node_id || from.id || e.from_node_id || ""),
      to_node_id: String(to.node_id || to.id || e.to_node_id || ""),
      max_speed_limit: Number(e.max_speed_limit) || 50,
      geometry: normalizeEdgeGeometry(e.geom),
      from: {
        node_id: String(from.node_id || from.id || e.from_node_id || ""),
        node_code: String(from.node_code || from.id || ""),
        node_name: String(from.node_name || from.name || "Điểm nút"),
        district: from.district || null,
        lat: Number(from.lat ?? from.latitude) || 0,
        lng: Number(from.lng ?? from.longitude) || 0,
      },
      to: {
        node_id: String(to.node_id || to.id || e.to_node_id || ""),
        node_code: String(to.node_code || to.id || ""),
        node_name: String(to.node_name || to.name || "Điểm nút"),
        district: to.district || null,
        lat: Number(to.lat ?? to.latitude) || 0,
        lng: Number(to.lng ?? to.longitude) || 0,
      },
      congestion_level: level,
      color_code:
        level && CONGESTION_LEVELS[level]
          ? CONGESTION_LEVELS[level].color
          : NO_DATA_COLOR,
      speed: speedKmh ? `${speedKmh} km/h` : speed ? String(speed) : null,
      speed_num: speedKmh,
      length_km: Number(e.length_km) || 1,
      updated_at: e.updated_at || null,
    };
  });
}

/**
 * Fetch wrapper an toàn, xử lý envelope StandardResponse, gắn JWT và tự động bắt lỗi 401
 */
export async function request(
  path,
  { method = "GET", body, auth = false, signal } = {},
) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (auth && token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    /* body rỗng hoặc text */
  }

  if (!res.ok) {
    let message = payload?.message || payload?.detail;
    // Bóc tách thông điệp chi tiết từ mảng lỗi validation Pydantic (HTTP 422) nếu có
    if (Array.isArray(payload?.error) && payload.error.length > 0 && payload.error[0]?.msg) {
      const detailMsg = payload.error[0].msg;
      message = message ? `${message} (${detailMsg})` : detailMsg;
    }
    if (!message) message = `HTTP ${res.status}`;
    if (res.status === 401 && auth) clearSession();
    throw new Error(message);
  }

  // Chuẩn hóa bóc tách envelope StandardResponse[T]:
  // Nếu payload có thuộc tính "data", trả về payload.data (kể cả khi null)
  if (payload && typeof payload === "object" && "data" in payload && payload.data !== undefined) {
    return payload.data;
  }
  return payload;
}

/**
 * Lấy dữ liệu trực tiếp từ Backend API (không dùng mock fallback)
 * @param {object} [options]
 * @param {number} [options.hour]
 * @param {number} [options.day_of_week]
 * @param {string} [options.district]
 * @param {string} [options.area]
 * @param {string} [options.bbox]
 * @param {number} [options.min_lat]
 * @param {number} [options.min_lng]
 * @param {number} [options.max_lat]
 * @param {number} [options.max_lng]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<Array<object>>}
 */
export async function fetchEdges(options = {}) {
  const params = new URLSearchParams();
  if (options.hour !== undefined) params.set("hour", options.hour);
  if (options.day_of_week !== undefined)
    params.set("day_of_week", options.day_of_week);
  if (options.district) params.set("district", options.district);
  if (options.area) params.set("area", options.area);
  if (options.bbox) params.set("bbox", options.bbox);
  if (options.min_lat !== undefined) params.set("min_lat", options.min_lat);
  if (options.min_lng !== undefined) params.set("min_lng", options.min_lng);
  if (options.max_lat !== undefined) params.set("max_lat", options.max_lat);
  if (options.max_lng !== undefined) params.set("max_lng", options.max_lng);

  const query = params.toString() ? `?${params.toString()}` : "";
  const data = await request(`/edges${query}`, { auth: true, signal: options.signal });
  return normalizeEdges(data);
}

/**
 * Lấy chi tiết một đoạn đường từ Backend
 * @param {string} edgeId
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function fetchEdgeById(edgeId, options = {}) {
  return request(`/edges/${encodeURIComponent(edgeId)}`, {
    auth: true,
    signal: options.signal,
  });
}

/**
 * Lấy lịch sử tình trạng một đoạn đường theo giờ
 * @param {string} edgeId
 * @param {object} [options]
 * @param {string} [options.start]
 * @param {string} [options.end]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<object>} EdgeHourlyHistoryResponse
 */
export async function fetchEdgeHistory(edgeId, { start, end, signal } = {}) {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  const query = params.toString() ? `?${params.toString()}` : "";
  return request(`/edges/${encodeURIComponent(edgeId)}/history${query}`, {
    auth: true,
    signal,
  });
}

/**
 * Lấy tình trạng đoạn đường từ endpoint /edges/status
 */
export async function fetchEdgesStatus(options = {}) {
  const params = new URLSearchParams();
  if (options.bbox) params.set("bbox", options.bbox);
  if (options.district) params.set("district", options.district);
  if (options.area) params.set("area", options.area);
  if (options.hour !== undefined) params.set("hour", options.hour);
  if (options.day_of_week !== undefined)
    params.set("day_of_week", options.day_of_week);
  if (options.min_lat !== undefined) params.set("min_lat", options.min_lat);
  if (options.min_lng !== undefined) params.set("min_lng", options.min_lng);
  if (options.max_lat !== undefined) params.set("max_lat", options.max_lat);
  if (options.max_lng !== undefined) params.set("max_lng", options.max_lng);

  const query = params.toString() ? `?${params.toString()}` : "";
  return request(`/edges/status${query}`, { auth: true, signal: options.signal });
}

/**
 * Gửi yêu cầu dự báo giao thông AI và chuẩn hóa kết quả trả về
 */
export async function fetchForecast({
  street_name,
  edge_id,
  weather = "sunny",
  minutes_ahead = [30, 60, 120],
  base_time,
  signal,
}) {
  const body = {
    weather,
    minutes_ahead: Array.isArray(minutes_ahead)
      ? minutes_ahead
      : [minutes_ahead],
  };
  if (edge_id) body.edge_id = edge_id;
  if (street_name) body.street_name = street_name;
  if (base_time) body.base_time = base_time;

  const data = await request("/predictions/forecast", {
    method: "POST",
    body,
    auth: true,
    signal,
  });

  const timeline = Array.isArray(data?.timeline)
    ? data.timeline.map((item) => {
        const lvl = Number(item.congestion_level) || 2;
        const speed = parseSpeedKmh(item.predicted_speed) || 20;
        const risk = Number(item.risk_factor) || 0.3;
        return {
          minutes_ahead: Number(item.minutes_ahead) || 30,
          target_time: item.target_time || new Date().toISOString(),
          predicted_speed: speed,
          congestion_level: lvl,
          risk_factor: Math.min(1, Math.max(0, risk)),
          description: item.description || "Dự báo lưu lượng giao thông",
        };
      })
    : [];

  return {
    edge_id: data?.edge_id || edge_id || "",
    street_name: data?.street_name || street_name || "Tuyến đường",
    max_speed_limit: Number(data?.max_speed_limit) || 50,
    base_time: data?.base_time || new Date().toISOString(),
    weather: data?.weather || weather,
    timeline,
  };
}

export async function fetchMapForecast({ minutes_ahead, weather = "sunny", signal }) {
  const data = await request("/predictions/forecast/map", {
    method: "POST",
    body: { minutes_ahead, weather },
    auth: true,
    signal,
  });

  if (!Array.isArray(data?.edges)) {
    throw new Error("API dự báo bản đồ trả về dữ liệu không hợp lệ.");
  }

  return data;
}

export async function fetchRouteForecast({ base_time, weather, steps, signal }) {
  return request("/predictions/forecast/route", {
    method: "POST",
    body: { base_time, weather, steps },
    auth: true,
    signal,
  });
}

/**
 * Tìm lộ trình qua Backend API
 */
export async function fetchDirections({
  origin_node_id,
  destination_node_id,
  weight_mode = "distance",
  speed_source = "current",
  signal,
}) {
  const params = new URLSearchParams({
    origin_node_id,
    destination_node_id,
    weight_mode,
    speed_source,
  });
  return request(`/directions?${params.toString()}`, { signal });
}

/**
 * Đề xuất 2-3 tuyến thay thế qua Backend API
 */
export async function fetchRouteAlternatives({
  origin_node_id,
  destination_node_id,
  speed_source = "current",
  signal,
}) {
  const params = new URLSearchParams({
    origin_node_id,
    destination_node_id,
    speed_source,
  });
  return request(`/directions/alternatives?${params.toString()}`, { signal });
}

/**
 * Tìm kiếm địa điểm qua Backend Geocoding Proxy (Nominatim)
 */
export async function searchGeocode({ q, limit = 5, viewbox, signal } = {}) {
  const params = new URLSearchParams({
    q: q || "",
    limit: String(limit),
  });
  if (viewbox) params.set("viewbox", viewbox);
  return request(`/geocode/search?${params.toString()}`, { signal });
}

/**
 * Tra cứu ngược tọa độ ra địa điểm qua Backend Geocoding Proxy (Nominatim)
 */
export async function reverseGeocode({ lat, lon, zoom = 18, signal } = {}) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    zoom: String(zoom),
  });
  return request(`/geocode/reverse?${params.toString()}`, { signal });
}

/**
 * Quản trị viên: Lấy danh sách tài khoản
 */
export async function fetchAdminUsers(query = "", { signal } = {}) {
  const params = new URLSearchParams();
  if (query.trim()) params.set("query", query.trim());
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request(`/admin/users${suffix}`, { auth: true, signal });
}

/**
 * Quản trị viên: Cập nhật tài khoản
 */
export async function updateAdminUser(userId, payload) {
  return request(`/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    body: payload,
    auth: true,
  });
}

/**
 * Quản trị viên: Xóa tài khoản
 */
export async function deleteAdminUser(userId) {
  return request(`/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    auth: true,
  });
}

/**
 * Quản trị viên: Lấy danh sách đoạn đường
 */
export async function fetchAdminRoads({ signal } = {}) {
  return request("/admin/roads", { auth: true, signal });
}

/**
 * Quản trị viên: Tạo đoạn đường mới từ tuyến được vẽ
 */
export async function createAdminRoad(payload) {
  return request("/admin/roads", {
    method: "POST",
    body: payload,
    auth: true,
  });
}

/**
 * Quản trị viên: Cập nhật đoạn đường
 */
export async function updateAdminRoad(edgeId, payload) {
  return request(`/admin/roads/${encodeURIComponent(edgeId)}`, {
    method: "PUT",
    body: payload,
    auth: true,
  });
}

/**
 * Quản trị viên: Xóa đoạn đường
 */
export async function deleteAdminRoad(edgeId) {
  return request(`/admin/roads/${encodeURIComponent(edgeId)}`, {
    method: "DELETE",
    auth: true,
  });
}

/**
 * Quản trị viên: Kích hoạt huấn luyện lại mô hình AI dự báo
 */
export async function triggerRetrainModel() {
  return request("/admin/retrain-model", {
    method: "POST",
    auth: true,
  });
}

/**
 * Kiểm tra kết nối Backend
 */
export async function checkHealth() {
  const res = await fetch(API_HEALTH_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const envelope = await res.json();
  const db = envelope?.data?.database;
  if (db !== "connected") {
    throw new Error(`Database chưa kết nối (${db || "không rõ trạng thái"})`);
  }
  return envelope.data;
}

export { CONGESTION_LEVELS, NO_DATA_COLOR };
