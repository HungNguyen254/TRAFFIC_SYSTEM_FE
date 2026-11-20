// File: src/js/components/toast.js
// Component Toast thông báo toàn cục (success / error / info)

const CONTAINER_ID = "app-toast-container";
const TOAST_DURATION = 3500; // ms

const ICONS = {
  success: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-1.2 14.4l-4-4 1.4-1.4 2.6 2.6 5.6-5.6 1.4 1.4-7 7z"/></svg>`,
  error: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`,
  info: `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>`,
};

/**
 * Đảm bảo container toast tồn tại (gắn vào body)
 * @returns {HTMLElement}
 */
function ensureContainer() {
  let container = document.getElementById(CONTAINER_ID);
  if (!container) {
    container = document.createElement("div");
    container.id = CONTAINER_ID;
    container.className = "toast-container";
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Hiển thị một toast thông báo
 * @param {string} message - Nội dung thông báo
 * @param {"success"|"error"|"info"} type - Loại toast
 * @param {number} [duration] - Thời gian hiển thị (ms)
 */
export function showToast(message, type = "info", duration = TOAST_DURATION) {
  if (!message) return;

  const container = ensureContainer();

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.innerHTML = ICONS[type] || ICONS.info;
  toast.appendChild(icon);

  const text = document.createElement("span");
  text.className = "toast-text";
  text.textContent = message;
  toast.appendChild(text);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "toast-close";
  closeBtn.setAttribute("aria-label", "Đóng thông báo");
  closeBtn.innerHTML = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
  closeBtn.addEventListener("click", () => dismiss());
  toast.appendChild(closeBtn);

  container.appendChild(toast);

  // Kích hoạt animation trượt vào ở frame kế tiếp
  requestAnimationFrame(() => toast.classList.add("toast-show"));

  let dismissed = false;
  let hideTimer = null;

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    if (hideTimer) clearTimeout(hideTimer);
    toast.classList.remove("toast-show");
    toast.classList.add("toast-hide");
    setTimeout(() => toast.remove(), 300);
  }

  hideTimer = setTimeout(dismiss, duration);
}
