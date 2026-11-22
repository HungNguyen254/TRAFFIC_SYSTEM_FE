import { API_BASE_URL, getToken } from "../api.js";

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const ACCEPTED_AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];

function getAuthHeaders(contentType) {
  const token = getToken();
  if (!token) throw new Error("Vui lòng đăng nhập để cập nhật ảnh đại diện.");

  const headers = { Authorization: `Bearer ${token}` };
  if (contentType) headers["Content-Type"] = contentType;
  return headers;
}

async function throwResponseError(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Error responses may not include a JSON body.
  }
  throw new Error(
    payload?.message || payload?.detail || `Không thể cập nhật ảnh (HTTP ${response.status}).`,
  );
}

export function validateAvatarFile(file) {
  if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) {
    return "Chỉ hỗ trợ ảnh PNG, JPEG hoặc WebP.";
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return "Ảnh đại diện không được vượt quá 2 MB.";
  }
  return "";
}

export async function fetchAvatarObjectUrl() {
  const response = await fetch(`${API_BASE_URL}/auth/me/avatar`, {
    headers: getAuthHeaders(),
  });
  if (response.status === 404) return null;
  if (!response.ok) await throwResponseError(response);

  const image = await response.blob();
  return URL.createObjectURL(image);
}

export async function uploadAvatar(file) {
  const validationMessage = validateAvatarFile(file);
  if (validationMessage) throw new Error(validationMessage);

  const response = await fetch(`${API_BASE_URL}/auth/me/avatar`, {
    method: "PUT",
    headers: getAuthHeaders(file.type),
    body: file,
  });
  if (!response.ok) await throwResponseError(response);
}

export async function deleteAvatar() {
  const response = await fetch(`${API_BASE_URL}/auth/me/avatar`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!response.ok) await throwResponseError(response);
}
