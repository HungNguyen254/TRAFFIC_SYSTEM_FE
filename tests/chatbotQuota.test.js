import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAT_DAILY_LIMIT,
  CHAT_WINDOW_MS,
  formatRemainingTime,
  getDailyChatUsage,
  getTimeUntilNextChatSlot,
  incrementDailyChatUsage,
  isChatQuotaExceeded,
} from "../src/js/components/chatbot.js";

function createMemoryStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

test("starts with 0 daily chat usage", () => {
  const storage = createMemoryStorage();
  const user = { email: "user@test.com", plan: "standard" };
  assert.equal(getDailyChatUsage(user, storage), 0);
  assert.equal(isChatQuotaExceeded(user, storage, false), false);
});

test("increments chat usage with timestamps correctly", () => {
  const storage = createMemoryStorage();
  const user = { email: "user@test.com", plan: "standard" };
  const baseTime = 1700000000000;

  for (let i = 1; i <= 5; i++) {
    const count = incrementDailyChatUsage(user, storage, baseTime + i * 1000);
    assert.equal(count, i);
  }

  assert.equal(getDailyChatUsage(user, storage, baseTime + 10000), 5);
  assert.equal(isChatQuotaExceeded(user, storage, false, baseTime + 10000), false);
});

test("exceeds quota after 10 messages within 24 hours for standard plan", () => {
  const storage = createMemoryStorage();
  const user = { email: "user@test.com", plan: "standard" };
  const baseTime = 1700000000000;

  for (let i = 1; i <= CHAT_DAILY_LIMIT; i++) {
    incrementDailyChatUsage(user, storage, baseTime + i * 60000);
  }

  assert.equal(getDailyChatUsage(user, storage, baseTime + 11 * 60000), 10);
  assert.equal(isChatQuotaExceeded(user, storage, false, baseTime + 11 * 60000), true);

  // Time until next slot opens is based on the oldest (i = 1) message
  const waitMs = getTimeUntilNextChatSlot(user, storage, baseTime + 11 * 60000);
  assert.ok(waitMs > 0);
  assert.equal(waitMs, baseTime + 60000 + CHAT_WINDOW_MS - (baseTime + 11 * 60000));
});

test("premium plan is never quota-exceeded even after 10 messages", () => {
  const storage = createMemoryStorage();
  const user = { email: "user@test.com", plan: "premium" };
  const baseTime = 1700000000000;

  for (let i = 1; i <= 15; i++) {
    incrementDailyChatUsage(user, storage, baseTime + i * 1000);
  }

  assert.equal(getDailyChatUsage(user, storage, baseTime + 20000), 15);
  assert.equal(isChatQuotaExceeded(user, storage, true, baseTime + 20000), false);
});

test("quota rolls over after 24 hours from the oldest message", () => {
  const storage = createMemoryStorage();
  const user = { email: "user@test.com", plan: "standard" };
  const baseTime = 1700000000000;

  // Send 10 messages
  for (let i = 1; i <= 10; i++) {
    incrementDailyChatUsage(user, storage, baseTime + i * 1000);
  }

  // At 24h + 1.5s after baseTime, only message 1 (sent at baseTime + 1000) has expired (age 24h + 500ms)
  // Message 2 (sent at baseTime + 2000) has age 24h - 500ms, so it is still valid
  const checkTime = baseTime + CHAT_WINDOW_MS + 1500;
  assert.equal(getDailyChatUsage(user, storage, checkTime), 9);
  assert.equal(isChatQuotaExceeded(user, storage, false, checkTime), false);

  // After 24h + 20s, all 10 messages have expired
  const allExpiredTime = baseTime + CHAT_WINDOW_MS + 20000;
  assert.equal(getDailyChatUsage(user, storage, allExpiredTime), 0);
  assert.equal(isChatQuotaExceeded(user, storage, false, allExpiredTime), false);
});

test("formatRemainingTime formats hours and minutes nicely", () => {
  assert.equal(formatRemainingTime(0), "ít phút");
  assert.equal(formatRemainingTime(5 * 60 * 1000), "5 phút");
  assert.equal(formatRemainingTime(60 * 60 * 1000), "1 giờ");
  assert.equal(formatRemainingTime((2 * 60 + 30) * 60 * 1000), "2 giờ 30 phút");
});
