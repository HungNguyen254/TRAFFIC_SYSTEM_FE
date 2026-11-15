// File: src/js/api.js
// Client API & Chuẩn hoá dữ liệu kết nối trực tiếp với Backend FastAPI

import { CONGESTION_LEVELS, NO_DATA_COLOR } from "./constants/traffic.js";

const ENV = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env : (typeof process !== "undefined" ? process.env : {});

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

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

export function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isLoggedIn() {
  return Boolean(getToken());
}

export function isAdmin() {
  return getUser()?.role === "admin";
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
  if (speedKmh === null) return null;
  if (speedKmh >= 35) return 1; // Thông thoáng
  if (speedKmh >= 25) return 2; // Di chuyển chậm
  if (speedKmh >= 15) return 3; // Ùn tắc nghiêm trọng
  return 4;                     // Kẹt xe hoàn toàn
}

/**
 * Chuẩn hóa danh sách edges từ API backend về cấu trúc đồng nhất
 * @param {any} raw 
 * @returns {Array<object>}
 */
export function normalizeEdges(raw) {
  if (!raw) return [];
  const nodesById = {};
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
    const from = e.from || nodesById[e.from_node_id] || e.from_node || {};
    const to = e.to || nodesById[e.to_node_id] || e.to_node || {};
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
      corridor_name: String(e.corridor_name || e.street_name || e.name || "Trục đường"),
      max_speed_limit: Number(e.max_speed_limit) || 50,
      from: {
        node_code: String(from.node_code || from.id || ""),
        node_name: String(from.node_name || from.name || "Điểm nút"),
        lat: Number(from.lat ?? from.latitude) || 0,
        lng: Number(from.lng ?? from.longitude) || 0,
      },
      to: {
        node_code: String(to.node_code || to.id || ""),
        node_name: String(to.node_name || to.name || "Điểm nút"),
        lat: Number(to.lat ?? to.latitude) || 0,
        lng: Number(to.lng ?? to.longitude) || 0,
      },
      congestion_level: level,
      color_code: level && CONGESTION_LEVELS[level] ? CONGESTION_LEVELS[level].color : NO_DATA_COLOR,
      speed: speedKmh ? `${speedKmh} km/h` : (speed ? String(speed) : null),
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
  { method = "GET", body, auth = false } = {},
) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (auth && token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    /* body rỗng hoặc text */
  }

  if (!res.ok) {
    const message = payload?.message || payload?.detail || `HTTP ${res.status}`;
    if (res.status === 401 && auth) clearSession();
    throw new Error(message);
  }
  return payload?.data ?? payload;
}

/**
 * Lấy dữ liệu trực tiếp từ Backend API (không dùng mock fallback)
 * @param {object} [options]
 * @param {number} [options.hour]
 * @param {number} [options.day_of_week]
 * @param {string} [options.district]
 * @param {string} [options.bbox]
 * @returns {Promise<Array<object>>}
 */
export async function fetchEdges(options = {}) {
  const params = new URLSearchParams();
  if (options.hour !== undefined) params.set("hour", options.hour);
  if (options.day_of_week !== undefined) params.set("day_of_week", options.day_of_week);
  if (options.district) params.set("district", options.district);
  if (options.bbox) params.set("bbox", options.bbox);

  const query = params.toString() ? `?${params.toString()}` : "";
  const data = await request(`/edges${query}`);
  return normalizeEdges(data);
}

/**
 * Lấy tình trạng đoạn đường từ endpoint /edges/status
 */
export async function fetchEdgesStatus(options = {}) {
  const params = new URLSearchParams();
  if (options.bbox) params.set("bbox", options.bbox);
  if (options.district) params.set("district", options.district);
  if (options.hour !== undefined) params.set("hour", options.hour);
  if (options.day_of_week !== undefined) params.set("day_of_week", options.day_of_week);

  const query = params.toString() ? `?${params.toString()}` : "";
  return request(`/edges/status${query}`);
}

/**
 * Gửi yêu cầu dự báo giao thông AI và chuẩn hóa kết quả trả về
 */
export async function fetchForecast({ street_name, edge_id, weather = "sunny", minutes_ahead = [30, 60, 120] }) {
  const body = {
    weather,
    minutes_ahead: Array.isArray(minutes_ahead) ? minutes_ahead : [minutes_ahead],
  };
  if (edge_id) body.edge_id = edge_id;
  if (street_name) body.street_name = street_name;

  const data = await request("/predictions/forecast", {
    method: "POST",
    body,
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

/**
 * Tìm lộ trình qua Backend API
 */
export async function fetchDirections({ origin_node_id, destination_node_id, weight_mode = "distance" }) {
  const params = new URLSearchParams({
    origin_node_id,
    destination_node_id,
    weight_mode,
  });
  return request(`/directions?${params.toString()}`);
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
