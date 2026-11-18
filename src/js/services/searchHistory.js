const SEARCH_HISTORY_KEY_PREFIX = "traffic_search_history:";
export const MAX_SEARCH_HISTORY_ITEMS = 50;

const VEHICLE_TYPES = new Set(["car", "motorcycle", "bicycle", "bus"]);

function getStorageKey(userId) {
  if (typeof userId !== "string" || !userId.trim()) {
    throw new TypeError("Cần có mã người dùng để truy cập lịch sử tìm kiếm.");
  }
  return `${SEARCH_HISTORY_KEY_PREFIX}${encodeURIComponent(userId.trim())}`;
}

function hasValidEntryData(entry) {
  if (entry?.type === "place") {
    return (
      typeof entry.query === "string" &&
      entry.query.trim().length > 0 &&
      entry.query.length <= 200
    );
  }
  if (entry?.type === "route") {
    return (
      typeof entry.origin === "string" &&
      entry.origin.trim().length >= 3 &&
      entry.origin.length <= 200 &&
      typeof entry.destination === "string" &&
      entry.destination.trim().length >= 3 &&
      entry.destination.length <= 200 &&
      VEHICLE_TYPES.has(entry.vehicle)
    );
  }
  return false;
}

function isValidStoredEntry(entry) {
  return (
    entry !== null &&
    typeof entry === "object" &&
    typeof entry.id === "string" &&
    hasValidEntryData(entry) &&
    typeof entry.createdAt === "string" &&
    Number.isFinite(Date.parse(entry.createdAt))
  );
}

export function loadSearchHistory(userId, storage = localStorage) {
  const raw = storage.getItem(getStorageKey(userId));
  if (raw === null) return [];

  let entries;
  try {
    entries = JSON.parse(raw);
  } catch {
    throw new Error("Dữ liệu lịch sử tìm kiếm không hợp lệ.");
  }

  if (!Array.isArray(entries) || !entries.every(isValidStoredEntry)) {
    throw new Error("Dữ liệu lịch sử tìm kiếm không hợp lệ.");
  }
  return entries.slice(0, MAX_SEARCH_HISTORY_ITEMS);
}

export function addSearchHistoryEntry(userId, entry, storage = localStorage) {
  if (!hasValidEntryData(entry)) {
    throw new TypeError("Thông tin tìm kiếm không hợp lệ.");
  }

  const history = loadSearchHistory(userId, storage);
  const newEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  const updatedHistory = [newEntry, ...history].slice(
    0,
    MAX_SEARCH_HISTORY_ITEMS,
  );
  storage.setItem(getStorageKey(userId), JSON.stringify(updatedHistory));
  return updatedHistory;
}
