// File: TRAFFIC_SYSTEM_FE/js/api.js
// Client API chung cho cả ứng dụng.
// Backend trả envelope chuẩn: { status_code, message, error, data, path, timestamp }
// => mọi hàm đều trả về phần `data`.

// Cấu hình từ file .env (Vite tự nạp qua dotenv, expose biến có prefix VITE_)
// KHÔNG hardcode URL ở đây để tránh lộ thông tin cấu hình trong source.
const ENV = import.meta.env;

function requireEnv(name) {
  const value = ENV[name];
  if (!value) {
    throw new Error(
      `Thiếu cấu hình ${name} trong file .env của FE. ` +
        `Hãy copy .env.example thành .env và điền giá trị.`,
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
 * fetch wrapper: luôn gửi Accept json, tự gắn Authorization nếu có token,
 * bóc envelope và ném Error(message) khi status != 2xx.
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
    /* body rỗng hoặc không phải JSON */
  }

  if (!res.ok) {
    const message = payload?.message || payload?.detail || `HTTP ${res.status}`;
    if (res.status === 401 && auth) clearSession();
    throw new Error(message);
  }
  return payload?.data ?? payload;
}

/** Health check nằm ngoài prefix /v1 */
export async function checkHealth() {
  const healthUrl = API_HEALTH_URL;
  const res = await fetch(healthUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const envelope = await res.json();
  const db = envelope?.data?.database;
  if (db !== "connected") {
    throw new Error(
      `Database chưa kết nối được (${db || "không rõ trạng thái"})`,
    );
  }
  return envelope.data;
}
