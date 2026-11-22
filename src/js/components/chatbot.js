// File: src/js/components/chatbot.js
// Component Floating Draggable AI Chatbot & Responsive Chat Window

import {
  getInitialGreeting,
  getQuickPillSuggestions,
  processChatMessage,
} from "../services/chatService.js";
import { navigateTo } from "../router.js";
import { getUser, isLoggedIn, isPremium } from "../api.js";

const POS_STORAGE_KEY = "traffic_chatbot_pos";
const MOBILE_POS_STORAGE_KEY = "traffic_chatbot_pos_mobile";
const HISTORY_STORAGE_KEY = "traffic_chatbot_history";
const DAILY_USAGE_KEY = "traffic_chatbot_daily_usage";
const BTN_SIZE = 58;
const VIEWPORT_MARGIN = 12;
const MOBILE_BREAKPOINT = 640;
export const CHAT_DAILY_LIMIT = 10;
export const CHAT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 giờ

export function getValidChatTimestamps(
  user = typeof getUser === "function" ? getUser() : null,
  storage = typeof localStorage !== "undefined" ? localStorage : null,
  now = Date.now()
) {
  if (!storage) return [];
  try {
    const userId = user?.id || user?.user_id || user?.email || "anonymous";
    const raw = storage.getItem(`${DAILY_USAGE_KEY}_${userId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.timestamps)
          ? parsed.timestamps
          : [];
      return list
        .map((ts) => Number(ts))
        .filter((ts) => Number.isFinite(ts) && ts > 0 && now - ts < CHAT_WINDOW_MS)
        .sort((a, b) => a - b);
    }
  } catch {
    // fallback
  }
  return [];
}

export function getDailyChatUsage(
  user = typeof getUser === "function" ? getUser() : null,
  storage = typeof localStorage !== "undefined" ? localStorage : null,
  now = Date.now()
) {
  return getValidChatTimestamps(user, storage, now).length;
}

export function incrementDailyChatUsage(
  user = typeof getUser === "function" ? getUser() : null,
  storage = typeof localStorage !== "undefined" ? localStorage : null,
  now = Date.now()
) {
  if (!storage) return 1;
  try {
    const userId = user?.id || user?.user_id || user?.email || "anonymous";
    const valid = getValidChatTimestamps(user, storage, now);
    valid.push(now);
    storage.setItem(
      `${DAILY_USAGE_KEY}_${userId}`,
      JSON.stringify({ timestamps: valid })
    );
    return valid.length;
  } catch {
    return 1;
  }
}

export function getTimeUntilNextChatSlot(
  user = typeof getUser === "function" ? getUser() : null,
  storage = typeof localStorage !== "undefined" ? localStorage : null,
  now = Date.now()
) {
  const valid = getValidChatTimestamps(user, storage, now);
  if (valid.length < CHAT_DAILY_LIMIT) return 0;
  const oldest = valid[0];
  return Math.max(0, oldest + CHAT_WINDOW_MS - now);
}

export function formatRemainingTime(ms) {
  if (ms <= 0) return "ít phút";
  const totalMinutes = Math.ceil(ms / (60 * 1000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) {
    return `${hours} giờ ${minutes} phút`;
  }
  if (hours > 0) {
    return `${hours} giờ`;
  }
  return `${minutes} phút`;
}

export function isChatQuotaExceeded(
  user = typeof getUser === "function" ? getUser() : null,
  storage = typeof localStorage !== "undefined" ? localStorage : null,
  premium = typeof isPremium === "function" ? isPremium() : false,
  now = Date.now()
) {
  if (premium) return false;
  return getDailyChatUsage(user, storage, now) >= CHAT_DAILY_LIMIT;
}

function updateChatInputState() {
  if (!inputEl || !sendBtn) return;
  const isLimited = isChatQuotaExceeded();
  if (isLimited) {
    const waitMs = getTimeUntilNextChatSlot();
    const waitText = formatRemainingTime(waitMs);
    inputEl.disabled = true;
    inputEl.placeholder = `Đã đạt giới hạn 10 tin nhắn/24h (Mở lại sau ${waitText})`;
    sendBtn.disabled = true;
  } else {
    inputEl.disabled = false;
    inputEl.placeholder = "Hỏi về tắc đường, giờ cao điểm, lộ trình...";
    sendBtn.disabled = false;
  }
}

let fabEl = null;
let windowEl = null;
let messagesContainer = null;
let inputEl = null;
let sendBtn = null;
let isChatOpen = false;
let isChatInitialized = false;
let fabResizeHandler = null;

export function clampFabPosition(
  left,
  top,
  viewportWidth,
  viewportHeight,
  width = BTN_SIZE,
  height = BTN_SIZE,
) {
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN);
  const maxTop = Math.max(VIEWPORT_MARGIN, viewportHeight - height - VIEWPORT_MARGIN);
  return {
    left: Math.min(Math.max(VIEWPORT_MARGIN, left), maxLeft),
    top: Math.min(Math.max(VIEWPORT_MARGIN, top), maxTop),
  };
}

export function getResponsiveFabPosition({
  desktopPosition,
  mobilePosition,
  isMobile,
  viewportWidth,
  viewportHeight,
  width,
  height,
}) {
  const savedPosition = isMobile ? mobilePosition : desktopPosition;
  const position =
    savedPosition &&
    Number.isFinite(savedPosition.left) &&
    Number.isFinite(savedPosition.top)
      ? savedPosition
      : {
          left: viewportWidth - width - 24,
          top: viewportHeight - height - 24,
        };
  return clampFabPosition(
    position.left,
    position.top,
    viewportWidth,
    viewportHeight,
    width,
    height,
  );
}

/**
 * Định dạng văn bản đơn giản (Markdown escape + in đậm + gạch đầu dòng + xuống dòng)
 * @param {string} text
 * @returns {string}
 */
function formatMessageContent(text) {
  if (!text) return "";
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br/>");
}

/**
 * Định dạng thời gian hiển thị (HH:mm)
 * @param {string} isoString
 * @returns {string}
 */
function formatTime(isoString) {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/**
 * Lấy lịch sử tin nhắn từ LocalStorage
 * @returns {Array<object>}
 */
function loadMessageHistory() {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // fallback nếu lỗi parse
  }
  return [getInitialGreeting()];
}

/**
 * Lưu lịch sử tin nhắn vào LocalStorage
 * @param {Array<object>} history
 */
function saveMessageHistory(history) {
  try {
    // Giữ tối đa 40 tin nhắn gần nhất để tiết kiệm bộ nhớ
    const toSave = history.slice(-40);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(toSave));
  } catch {
    // Bỏ qua lỗi hạn mức quota storage
  }
}

/**
 * Tạo bong bóng tin nhắn HTML
 * @param {object} msg
 * @returns {HTMLElement}
 */
function createMessageBubble(msg) {
  const row = document.createElement("div");
  row.className = `chat-bubble-row ${msg.role === "user" ? "user" : "bot"}`;

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";

  const contentDiv = document.createElement("div");
  contentDiv.innerHTML = formatMessageContent(msg.content);
  bubble.appendChild(contentDiv);

  // Render Action Buttons nếu có trong tin nhắn của bot
  if (
    msg.role === "model" &&
    Array.isArray(msg.actions) &&
    msg.actions.length > 0
  ) {
    const actionsContainer = document.createElement("div");
    actionsContainer.className = "chat-actions";

    msg.actions.forEach((act) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chat-action-btn";
      btn.textContent = act.text;
      btn.addEventListener("click", () => {
        navigateTo(act.path);
        if (window.innerWidth <= 640) {
          setChatOpen(false);
        }
      });
      actionsContainer.appendChild(btn);
    });

    bubble.appendChild(actionsContainer);
  }

  const timeEl = document.createElement("span");
  timeEl.className = "chat-time";
  timeEl.textContent = formatTime(msg.timestamp);
  bubble.appendChild(timeEl);

  row.appendChild(bubble);
  return row;
}

/**
 * Cuộn vùng tin nhắn xuống dưới cùng
 */
function scrollToBottom() {
  if (messagesContainer) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

/**
 * Bật/tắt trạng thái mở cửa sổ chat
 * @param {boolean} open
 */
function setChatOpen(open) {
  isChatOpen = open;
  if (!windowEl) return;

  if (open) {
    windowEl.classList.remove("hidden");
    positionWindowNearFab();
    scrollToBottom();
    updateChatInputState();
    if (window.innerWidth > 640 && inputEl && !inputEl.disabled) {
      setTimeout(() => inputEl.focus(), 100);
    }
  } else {
    windowEl.classList.add("hidden");
  }
}

/**
 * Định vị cửa sổ chat gần với FAB trên màn hình máy tính
 */
function positionWindowNearFab() {
  if (!fabEl || !windowEl || window.innerWidth <= 640) return;

  const rect = fabEl.getBoundingClientRect();
  const winWidth = 380;
  const winHeight = Math.min(560, window.innerHeight - 100);

  // Tính toán trục ngang (X)
  let left = rect.left - winWidth + BTN_SIZE;
  if (left < VIEWPORT_MARGIN) {
    left = Math.min(rect.left, window.innerWidth - winWidth - VIEWPORT_MARGIN);
  }
  if (left + winWidth > window.innerWidth - VIEWPORT_MARGIN) {
    left = window.innerWidth - winWidth - VIEWPORT_MARGIN;
  }
  left = Math.max(VIEWPORT_MARGIN, left);

  // Tính toán trục dọc (Y)
  let top = rect.top - winHeight - 12;
  if (top < VIEWPORT_MARGIN) {
    top = rect.bottom + 12;
  }
  if (top + winHeight > window.innerHeight - VIEWPORT_MARGIN) {
    top = window.innerHeight - winHeight - VIEWPORT_MARGIN;
  }
  top = Math.max(VIEWPORT_MARGIN, top);

  windowEl.style.left = `${left}px`;
  windowEl.style.top = `${top}px`;
}

/**
 * Hiển thị hiệu ứng 3 chấm nảy đang nhập
 * @returns {HTMLElement}
 */
function showTypingIndicator() {
  const row = document.createElement("div");
  row.className = "chat-bubble-row bot";
  row.id = "chat-typing-row";

  const typing = document.createElement("div");
  typing.className = "typing-indicator";
  typing.innerHTML = `
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
  `;

  row.appendChild(typing);
  messagesContainer.appendChild(row);
  scrollToBottom();
  return row;
}

/**
 * Ẩn hiệu ứng đang nhập
 */
function hideTypingIndicator() {
  const el = document.getElementById("chat-typing-row");
  if (el) el.remove();
}

/**
 * Gửi câu hỏi của người dùng và nhận câu trả lời
 * @param {string} text
 */
async function sendUserMessage(text) {
  const clean = (text || "").trim();
  if (!clean) return;

  if (isChatQuotaExceeded()) {
    updateChatInputState();
    const waitMs = getTimeUntilNextChatSlot();
    const waitText = formatRemainingTime(waitMs);
    const errorMsg = {
      role: "model",
      content: `⚠️ Tài khoản Standard chỉ được gửi tối đa ${CHAT_DAILY_LIMIT} tin nhắn trong vòng 24 giờ (Lượt tiếp theo sẽ mở lại sau <strong>${waitText}</strong>).<br/>Nâng cấp lên Premium để trò chuyện không giới hạn.<br/><a href="/premium" data-link style="color:#d97706;font-weight:700;">Nâng cấp Premium →</a>`,
      timestamp: new Date().toISOString(),
    };
    messagesContainer.appendChild(createMessageBubble(errorMsg));
    scrollToBottom();
    return;
  }

  if (inputEl) inputEl.value = "";
  if (sendBtn) sendBtn.disabled = true;

  const userMsg = {
    role: "user",
    content: clean,
    timestamp: new Date().toISOString(),
  };

  const history = loadMessageHistory();
  history.push(userMsg);
  messagesContainer.appendChild(createMessageBubble(userMsg));
  scrollToBottom();

  const typingRow = showTypingIndicator();

  try {
    const botResponse = await processChatMessage(clean);
    hideTypingIndicator();

    if (!isPremium()) {
      incrementDailyChatUsage();
    }

    history.push(botResponse);
    saveMessageHistory(history);

    messagesContainer.appendChild(createMessageBubble(botResponse));
    scrollToBottom();
  } catch (err) {
    hideTypingIndicator();
    const rawMessage = err instanceof Error ? err.message : String(err);
    // Thông báo riêng khi vượt giới hạn 10 tin/ngày của gói Standard (429)
    const isLimit = rawMessage.includes("10 tin nhắn") || rawMessage.includes("Premium") || rawMessage.includes("429");
    const errorMsg = {
      role: "model",
      content: isLimit
        ? `⚠️ ${rawMessage}<br/><a href="/premium" data-link style="color:#d97706;font-weight:700;">Nâng cấp Premium →</a>`
        : "Xin lỗi, hiện tại hệ thống gặp trục trặc khi kết nối dữ liệu. Vui lòng thử lại sau.",
      timestamp: new Date().toISOString(),
    };
    messagesContainer.appendChild(createMessageBubble(errorMsg));
    scrollToBottom();
  } finally {
    updateChatInputState();
    if (inputEl && window.innerWidth > 640 && !inputEl.disabled) inputEl.focus();
  }
}

/**
 * Khởi tạo hành vi Kéo Thả (Pointer Events) cho FAB
 */
function initDraggableFab() {
  if (!fabEl) return;

  let startX = 0;
  let startY = 0;
  let initialLeft = 0;
  let initialTop = 0;
  let isPointerDown = false;
  let hasDragged = false;

  function getPositionStorageKey() {
    return window.innerWidth <= MOBILE_BREAKPOINT
      ? MOBILE_POS_STORAGE_KEY
      : POS_STORAGE_KEY;
  }

  function readSavedPosition(storageKey) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (
        saved &&
        Number.isFinite(saved.left) &&
        Number.isFinite(saved.top)
      ) {
        return saved;
      }
    } catch {
      return null;
    }
    return null;
  }

  function getSafePosition(left, top) {
    const rect = fabEl.getBoundingClientRect();
    return clampFabPosition(
      left,
      top,
      window.innerWidth,
      window.innerHeight,
      rect.width || BTN_SIZE,
      rect.height || BTN_SIZE,
    );
  }

  function applyPosition(position) {
    fabEl.style.left = `${position.left}px`;
    fabEl.style.top = `${position.top}px`;
  }

  function getPositionForViewport() {
    const rect = fabEl.getBoundingClientRect();
    return getResponsiveFabPosition({
      desktopPosition: readSavedPosition(POS_STORAGE_KEY),
      mobilePosition: readSavedPosition(MOBILE_POS_STORAGE_KEY),
      isMobile: window.innerWidth <= MOBILE_BREAKPOINT,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      width: rect.width || BTN_SIZE,
      height: rect.height || BTN_SIZE,
    });
  }

  let positionStorageKey = getPositionStorageKey();
  applyPosition(getPositionForViewport());

  fabEl.addEventListener("pointerdown", (e) => {
    // Chỉ nhận click chuột trái hoặc chạm cảm ứng
    if (e.button !== 0 && e.pointerType === "mouse") return;

    try {
      fabEl.setPointerCapture(e.pointerId);
    } catch {}

    isPointerDown = true;
    hasDragged = false;
    startX = e.clientX;
    startY = e.clientY;

    const rect = fabEl.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
  });

  fabEl.addEventListener("pointermove", (e) => {
    if (!isPointerDown) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!hasDragged && Math.hypot(dx, dy) > 6) {
      hasDragged = true;
      fabEl.classList.add("dragging");
    }

    if (hasDragged) {
      applyPosition(getSafePosition(initialLeft + dx, initialTop + dy));
    }
  });

  const onPointerEnd = (e) => {
    if (!isPointerDown) return;
    isPointerDown = false;

    try {
      fabEl.releasePointerCapture(e.pointerId);
    } catch {}

    fabEl.classList.remove("dragging");

    if (hasDragged) {
      const rect = fabEl.getBoundingClientRect();
      try {
        localStorage.setItem(
          positionStorageKey,
          JSON.stringify({ left: rect.left, top: rect.top }),
        );
      } catch {}
    } else {
      // Nhấn tại chỗ -> Toggle mở/đóng chat
      setChatOpen(!isChatOpen);
    }
  };

  fabEl.addEventListener("pointerup", onPointerEnd);
  fabEl.addEventListener("pointercancel", onPointerEnd);

  // Hỗ trợ truy cập bằng bàn phím (Phím Enter / Space)
  fabEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setChatOpen(!isChatOpen);
    }
  });

  // Tự động căn chỉnh khi resize màn hình
  if (fabResizeHandler) {
    window.removeEventListener("resize", fabResizeHandler);
  }
  fabResizeHandler = () => {
    if (!fabEl) return;
    const rect = fabEl.getBoundingClientRect();
    const nextStorageKey = getPositionStorageKey();
    if (nextStorageKey !== positionStorageKey) {
      positionStorageKey = nextStorageKey;
      applyPosition(getPositionForViewport());
    } else {
      applyPosition(getSafePosition(rect.left, rect.top));
    }

    if (isChatOpen) {
      positionWindowNearFab();
    }
  };
  window.addEventListener("resize", fabResizeHandler);
}

/**
 * Khởi tạo DOM Chatbot Widget và gắn vào trang web
 */
export function initChatbot() {
  syncChatbotVisibility();
}

/**
 * Đồng bộ hiển thị chatbot theo trạng thái đăng nhập.
 * Được gọi lại sau mỗi lần đăng nhập / đăng xuất (qua updateHeaderAuth).
 */
export function syncChatbotVisibility() {
  if (isLoggedIn()) {
    if (!isChatInitialized) {
      createChatbotWidget();
      isChatInitialized = true;
    } else {
      updateChatInputState();
    }
  } else if (isChatInitialized) {
    // Đăng xuất: gỡ bỏ widget và đóng trạng thái mở
    if (fabResizeHandler) {
      window.removeEventListener("resize", fabResizeHandler);
      fabResizeHandler = null;
    }
    if (fabEl) fabEl.remove();
    if (windowEl) windowEl.remove();
    fabEl = null;
    windowEl = null;
    messagesContainer = null;
    inputEl = null;
    sendBtn = null;
    isChatOpen = false;
    isChatInitialized = false;
  }
}

/**
 * Tạo DOM Chatbot Widget và gắn vào trang web
 */
function createChatbotWidget() {
  if (document.getElementById("chatbot-fab")) return;

  // 1. Tạo Floating Action Button (FAB)
  fabEl = document.createElement("button");
  fabEl.id = "chatbot-fab";
  fabEl.className = "chatbot-fab";
  fabEl.type = "button";
  fabEl.setAttribute("aria-label", "Mở Trợ lý Giao thông AI");
  fabEl.innerHTML = `
    <span class="chatbot-fab-dot" title="Trực tuyến"></span>
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2M7.5 13A1.5 1.5 0 0 0 6 14.5 1.5 1.5 0 0 0 7.5 16 1.5 1.5 0 0 0 9 14.5 1.5 1.5 0 0 0 7.5 13m9 0a1.5 1.5 0 0 0-1.5 1.5 1.5 1.5 0 0 0 1.5 1.5 1.5 1.5 0 0 0 1.5-1.5 1.5 1.5 0 0 0-1.5-1.5M12 17c-1.5 0-2.73.74-3.32 1.83a.5.5 0 0 0 .44.75h5.76a.5.5 0 0 0 .44-.75C14.73 17.74 13.5 17 12 17z"/>
    </svg>
  `;

  // 2. Tạo Cửa sổ Chat (Chat Window)
  windowEl = document.createElement("div");
  windowEl.id = "chatbot-window";
  windowEl.className = "chatbot-window hidden";
  windowEl.setAttribute("role", "dialog");
  windowEl.setAttribute("aria-label", "Cửa sổ Trợ lý Giao thông AI");

  windowEl.innerHTML = `
    <!-- Header -->
    <div class="chatbot-header">
      <div class="chatbot-header-info">
        <div class="chatbot-avatar" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/></svg>
        </div>
        <div class="chatbot-header-text">
          <h3>Trợ lý Giao thông AI</h3>
          <span><span class="chatbot-status-dot"></span> Trực tuyến • Hà Nội Live</span>
        </div>
      </div>
      <div class="chatbot-header-actions">
        <button type="button" class="chatbot-icon-btn" id="chat-clear-btn" title="Xóa lịch sử trò chuyện" aria-label="Xóa lịch sử">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
        <button type="button" class="chatbot-icon-btn" id="chat-close-btn" title="Thu nhỏ cửa sổ" aria-label="Đóng cửa sổ">
          <svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
    </div>

    <!-- Messages Container -->
    <div class="chatbot-messages" id="chatbot-messages"></div>

    <!-- Quick Pills -->
    <div class="quick-pills" id="chatbot-quick-pills"></div>

    <!-- Input Container -->
    <form class="chatbot-input-container" id="chatbot-form">
      <input
        type="text"
        class="chatbot-input"
        id="chatbot-input"
        placeholder="Hỏi về tắc đường, giờ cao điểm, lộ trình..."
        autocomplete="off"
        required
      />
      <button type="submit" class="chatbot-send-btn" id="chatbot-send" aria-label="Gửi tin nhắn">
        <svg viewBox="0 0 24 24"><path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      </button>
    </form>
  `;

  document.body.appendChild(fabEl);
  document.body.appendChild(windowEl);

  messagesContainer = document.getElementById("chatbot-messages");
  inputEl = document.getElementById("chatbot-input");
  sendBtn = document.getElementById("chatbot-send");

  // Load tin nhắn ban đầu
  const history = loadMessageHistory();
  history.forEach((msg) => {
    messagesContainer.appendChild(createMessageBubble(msg));
  });

  // Render Quick Pills
  const pillsContainer = document.getElementById("chatbot-quick-pills");
  getQuickPillSuggestions().forEach((suggestion) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "quick-pill";
    pill.textContent = suggestion;
    pill.addEventListener("click", () => {
      sendUserMessage(suggestion);
    });
    pillsContainer.appendChild(pill);
  });

  // Bắt sự kiện form submit
  const form = document.getElementById("chatbot-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    sendUserMessage(inputEl.value);
  });

  // Bắt sự kiện nút Clear
  document.getElementById("chat-clear-btn").addEventListener("click", () => {
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {}
    messagesContainer.innerHTML = "";
    const greeting = getInitialGreeting();
    messagesContainer.appendChild(createMessageBubble(greeting));
  });

  // Bắt sự kiện nút Close
  document.getElementById("chat-close-btn").addEventListener("click", () => {
    setChatOpen(false);
  });

  // Kích hoạt cơ chế kéo thả
  initDraggableFab();

  updateChatInputState();
}
