import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addSearchHistoryEntry,
  loadSearchHistory,
  MAX_SEARCH_HISTORY_ITEMS,
} from "../src/js/services/searchHistory.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

test("keeps search history isolated by user", () => {
  const storage = createMemoryStorage();
  addSearchHistoryEntry("user-1", { type: "place", query: "Nguyễn Trãi" }, storage);

  assert.equal(loadSearchHistory("user-1", storage).length, 1);
  assert.deepEqual(loadSearchHistory("user-2", storage), []);
});

test("keeps the newest 50 searches", () => {
  const storage = createMemoryStorage();
  for (let index = 0; index < MAX_SEARCH_HISTORY_ITEMS + 1; index += 1) {
    addSearchHistoryEntry(
      "user-1",
      { type: "place", query: `Đường ${index}` },
      storage,
    );
  }

  const history = loadSearchHistory("user-1", storage);
  assert.equal(history.length, MAX_SEARCH_HISTORY_ITEMS);
  assert.equal(history[0].query, `Đường ${MAX_SEARCH_HISTORY_ITEMS}`);
  assert.equal(history.at(-1).query, "Đường 1");
});

test("reports corrupt history instead of silently replacing it", () => {
  const storage = createMemoryStorage();
  storage.setItem("traffic_search_history:user-1", "{invalid");

  assert.throws(
    () => loadSearchHistory("user-1", storage),
    /Dữ liệu lịch sử tìm kiếm không hợp lệ/,
  );
});
