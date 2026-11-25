// File: src/js/components/header.js
import {
  clearSession,
  getToken,
  getUser,
  isAdmin,
  isLoggedIn,
  isPremium,
  request,
  saveSession,
} from "../api.js";
import { syncChatbotVisibility } from "./chatbot.js";
import { showToast } from "./toast.js";
import { fetchAvatarObjectUrl } from "../services/avatar.js";

let headerEventsInitialized = false;
let profileSyncInProgress = false;
let avatarObjectUrl = null;
let avatarLoadedForToken = "";
let avatarRequestToken = "";
let avatarRequestId = 0;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function getAccountName(user) {
  return (
    user?.full_name ||
    user?.name ||
    user?.email?.split("@")[0] ||
    (user?.role === "admin" ? "Quản trị viên" : "Người dùng")
  );
}

function getAccountInitials(user) {
  const name = getAccountName(user).trim();
  const words = name.split(/\s+/).filter(Boolean);
  const initials =
    words.length > 1
      ? `${Array.from(words[0])[0]}${Array.from(words[words.length - 1])[0]}`
      : Array.from(words[0] || "U").slice(0, 2).join("");
  return initials.toLocaleUpperCase("vi-VN");
}

function renderAvatarContent(initials) {
  return avatarObjectUrl
    ? `<img class="account-avatar-image" src="${escapeHtml(avatarObjectUrl)}" alt="" />`
    : initials;
}

function renderAuthControl() {
  if (!isLoggedIn()) {
    return `<a href="/login" id="nav-auth" data-link>Đăng nhập</a>`;
  }

  const user = getUser() || {};
  const name = escapeHtml(getAccountName(user));
  const email = escapeHtml(user.email || "");
  const initials = escapeHtml(getAccountInitials(user));
  const premium = isPremium();
  const planLabel = premium ? "Premium" : "Standard";
  const planClass = premium ? "premium" : "standard";
  const accountLabel =
    user.role === "admin" ? "Mở menu quản trị" : "Mở menu tài khoản";
  const avatarContent = renderAvatarContent(initials);

  return `
    <div class="account-menu" id="account-menu">
      <button
        class="account-avatar-trigger"
        id="nav-account-trigger"
        type="button"
        aria-label="${accountLabel}"
        aria-haspopup="dialog"
        aria-expanded="false"
      >
        <span class="account-avatar account-avatar-small" aria-hidden="true">${avatarContent}</span>
      </button>
      <section
        class="account-dropdown"
        id="account-dropdown"
        role="dialog"
        aria-label="Thông tin tài khoản"
      >
        <div class="account-dropdown-cover" aria-hidden="true"></div>
        <a class="account-profile-link" href="/login" data-link>
          <span class="account-avatar account-avatar-large" aria-hidden="true">${avatarContent}</span>
          <strong class="account-profile-name">${name}</strong>
          <span class="account-profile-email">${email}</span>
        </a>
        <div class="account-dropdown-section">
          <span class="account-dropdown-label">GÓI TÀI KHOẢN</span>
          <div class="account-plan-row">
            <span>Gói hiện tại</span>
            <span class="account-plan-pill ${planClass}">${planLabel}</span>
          </div>
        </div>
        <div class="account-dropdown-section">
          <span class="account-dropdown-label">TRUY CẬP NHANH</span>
          <a class="account-dropdown-link" href="/login" data-link>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="8" r="3.5" />
              <path d="M5 20a7 7 0 0 1 14 0" />
            </svg>
            Trang tài khoản
          </a>
          <a class="account-dropdown-link" href="/map" data-link>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            Bản đồ giao thông
          </a>
        </div>
        <div class="account-dropdown-footer">
          <button class="account-signout" id="nav-account-logout" type="button">
            <span>Đăng xuất</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 17l5-5-5-5M15 12H3m9-7h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-7" />
            </svg>
          </button>
        </div>
      </section>
    </div>
  `;
}

function syncAccountAvatar(force = false) {
  if (!isLoggedIn()) {
    avatarRequestId += 1;
    avatarRequestToken = "";
    avatarLoadedForToken = "";
    if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl);
    avatarObjectUrl = null;
    return;
  }

  const token = getToken();
  if (!token || (!force && (avatarLoadedForToken === token || avatarRequestToken === token))) {
    return;
  }

  if (avatarLoadedForToken && avatarLoadedForToken !== token) {
    if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl);
    avatarObjectUrl = null;
    const authSlot = document.getElementById("nav-auth-slot");
    if (authSlot) authSlot.innerHTML = renderAuthControl();
  }

  const requestId = ++avatarRequestId;
  avatarRequestToken = token;
  avatarLoadedForToken = token;
  fetchAvatarObjectUrl()
    .then((url) => {
      if (requestId !== avatarRequestId || getToken() !== token) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      if (avatarObjectUrl && avatarObjectUrl !== url) {
        URL.revokeObjectURL(avatarObjectUrl);
      }
      avatarObjectUrl = url;
      const authSlot = document.getElementById("nav-auth-slot");
      if (authSlot) authSlot.innerHTML = renderAuthControl();
    })
    .catch((error) => {
      if (requestId === avatarRequestId) {
        console.warn("Could not load the account avatar for the header.", error);
      }
    })
    .finally(() => {
      if (requestId === avatarRequestId) avatarRequestToken = "";
    });
}

function syncAccountProfile() {
  const user = getUser();
  if (
    !isLoggedIn() ||
    profileSyncInProgress ||
    (user?.full_name && user?.email)
  ) {
    return;
  }

  profileSyncInProgress = true;
  const token = getToken();
  request("/auth/me", { auth: true })
    .then((profile) => {
      const currentUser = getUser();
      if (!currentUser || !isLoggedIn() || getToken() !== token) return;
      saveSession(token, {
        ...currentUser,
        email: profile.email || currentUser.email,
        full_name: profile.full_name || currentUser.full_name,
        role: profile.role || currentUser.role,
        plan: profile.plan || currentUser.plan,
      });
      const authSlot = document.getElementById("nav-auth-slot");
      if (authSlot) authSlot.innerHTML = renderAuthControl();
    })
    .catch((error) => {
      if (!isLoggedIn()) updateHeaderAuth();
      else console.warn("Could not load the account profile for the header.", error);
    })
    .finally(() => {
      profileSyncInProgress = false;
    });
}

/**
 * Render thanh header tối giản kèm nút điều hướng di động (Hamburger)
 * @param {string} currentPath - Đường dẫn hiện tại (ví dụ: '/', '/map', '/login', '/admin')
 * @returns {string} HTML string
 */
export function renderHeader(currentPath = "/") {
  const normPath = currentPath.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  const logged = isLoggedIn();
  const admin = isAdmin();
  syncAccountProfile();
  syncAccountAvatar();

  // Nút nâng cấp: chỉ hiện với user Standard; Premium hiển thị badge
  const planBadge = logged
    ? (isPremium()
        ? `<span class="plan-badge premium">PREMIUM</span>`
        : `<span class="plan-badge standard">STANDARD</span>`)
    : "";
  const upgradeBtn = logged && !isPremium()
    ? `<a href="/premium" class="nav-upgrade-btn" data-link>Nâng cấp Premium</a>`
    : "";

  return `
    <header class="site-header">
      <a class="logo" href="/" data-link title="Hà Nội Traffic AI">
        <span class="logo-title">Hà Nội Traffic <span class="logo-accent">AI</span></span>
        <span class="logo-badge">
          <span class="pulse-dot"></span>
          TRỰC TIẾP
        </span>
        ${planBadge}
      </a>

      <!-- Nút Hamburger Menu cho Mobile -->
      <button
        class="nav-toggle"
        id="nav-toggle"
        type="button"
        aria-label="Mở menu điều hướng"
        aria-expanded="false"
      >
        <span class="nav-toggle-bar"></span>
        <span class="nav-toggle-bar"></span>
        <span class="nav-toggle-bar"></span>
      </button>

      <!-- Lớp nền mờ khi mở Menu trên Mobile -->
      <div class="nav-backdrop" id="nav-backdrop"></div>

      <!-- Menu Điều hướng -->
      <nav class="menu" id="site-menu" aria-label="Điều hướng chính">
        <a href="/" data-link ${normPath === "/" ? 'aria-current="page"' : ""} ${logged ? "" : "hidden"}>Trang chủ</a>
        <a href="/#forecast" data-link ${logged ? "" : "hidden"}>Dự báo</a>
        <a href="/map" data-link ${normPath === "/map" ? 'aria-current="page"' : ""}>Bản đồ</a>
        <a href="/compare" data-link ${normPath === "/compare" ? 'aria-current="page"' : ""} ${logged ? "" : "hidden"}>So sánh tuyến</a>
        ${upgradeBtn}
        <span class="nav-auth-slot" id="nav-auth-slot">
          ${renderAuthControl()}
        </span>
        <a href="/admin" id="nav-admin" data-link ${normPath === "/admin" ? 'aria-current="page"' : ""} ${admin ? "" : "hidden"}>
          Quản trị
        </a>
        ${logged ? '<button class="nav-mobile-logout" id="nav-mobile-logout" type="button">Đăng xuất</button>' : ""}
      </nav>
    </header>
  `;
}

/**
 * Đóng Mobile Menu
 */
export function closeMobileMenu() {
  const menu = document.getElementById("site-menu");
  const btn = document.getElementById("nav-toggle");
  const bd = document.getElementById("nav-backdrop");
  if (menu) menu.classList.remove("mobile-open");
  if (btn) {
    btn.classList.remove("active");
    btn.setAttribute("aria-expanded", "false");
  }
  if (bd) bd.classList.remove("active");
  closeAccountMenu();
}

/**
 * Mở Mobile Menu
 */
export function openMobileMenu() {
  const menu = document.getElementById("site-menu");
  const btn = document.getElementById("nav-toggle");
  const bd = document.getElementById("nav-backdrop");
  if (bd && bd.parentElement !== document.body) {
    document.body.appendChild(bd);
  }
  if (menu) menu.classList.add("mobile-open");
  if (btn) {
    btn.classList.add("active");
    btn.setAttribute("aria-expanded", "true");
  }
  if (bd) bd.classList.add("active");
}

/**
 * Khởi tạo sự kiện ủy quyền toàn cục cho Header (Hamburger, Backdrop, Links)
 */
export function initHeaderEvents(navigateTo) {
  if (headerEventsInitialized) return;
  headerEventsInitialized = true;
  document.addEventListener("account-avatar-updated", () => {
    avatarLoadedForToken = "";
    syncAccountAvatar(true);
  });

  // Đảm bảo backdrop được gắn vào body để không bị giam trong Containing Block của header có backdrop-filter
  let backdropEl = document.getElementById("nav-backdrop");
  if (backdropEl && backdropEl.parentElement !== document.body) {
    document.body.appendChild(backdropEl);
  }

  document.addEventListener("click", (e) => {
    const accountTrigger = e.target.closest("#nav-account-trigger");
    const accountLogout = e.target.closest("#nav-account-logout");
    const toggleBtn = e.target.closest("#nav-toggle");
    const backdrop = e.target.closest("#nav-backdrop");
    const menuLink = e.target.closest(".menu a");
    const menu = document.getElementById("site-menu");
    const isOpen = menu?.classList.contains("mobile-open");

    if (accountTrigger) {
      const accountMenu = accountTrigger.closest(".account-menu");
      const pointerHover =
        window.matchMedia("(hover: hover)").matches &&
        accountMenu.matches(":hover");
      setAccountMenuOpen(
        accountMenu,
        pointerHover ||
          e.detail === 0 ||
          accountTrigger.getAttribute("aria-expanded") !== "true",
      );
      return;
    }

    if (accountLogout || e.target.closest("#nav-mobile-logout")) {
      clearSession();
      updateHeaderAuth();
      showToast("Đăng xuất thành công.", "info");
      closeMobileMenu();
      navigateTo?.("/");
      return;
    }

    if (toggleBtn) {
      if (isOpen) {
        closeMobileMenu();
      } else {
        openMobileMenu();
      }
      return;
    }

    // Đóng khi click vào backdrop, click link, hoặc click bất kỳ đâu bên ngoài menu
    if (isOpen) {
      if (backdrop || menuLink || !e.target.closest("#site-menu")) {
        closeMobileMenu();
      }
    }
    if (!e.target.closest(".account-menu")) closeAccountMenu();
  });

  document.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse") return;
    const accountMenu = e.target.closest(".account-menu");
    if (accountMenu) setAccountMenuOpen(accountMenu, true);
  });

  document.addEventListener("pointerout", (e) => {
    if (e.pointerType !== "mouse") return;
    const accountMenu = e.target.closest(".account-menu");
    if (accountMenu && !accountMenu.contains(e.relatedTarget)) {
      setAccountMenuOpen(accountMenu, false);
    }
  });

  document.addEventListener("focusin", (e) => {
    const accountMenu = e.target.closest(".account-menu");
    if (accountMenu) setAccountMenuOpen(accountMenu, true);
  });

  document.addEventListener("focusout", (e) => {
    const accountMenu = e.target.closest(".account-menu");
    if (accountMenu && !accountMenu.contains(e.relatedTarget)) {
      setAccountMenuOpen(accountMenu, false);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const accountMenu = document.querySelector(".account-menu.is-open");
    if (!accountMenu) return;
    closeAccountMenu();
    accountMenu.querySelector("#nav-account-trigger")?.blur();
  });

  window.addEventListener("resize", () => {
    // Đồng bộ ngưỡng đóng drawer theo breakpoint CSS là 860px
    if (window.innerWidth > 860) {
      closeMobileMenu();
    }
  });
}

function setAccountMenuOpen(accountMenu, open) {
  if (!accountMenu) return;
  accountMenu.classList.toggle("is-open", open);
  accountMenu
    .querySelector("#nav-account-trigger")
    ?.setAttribute("aria-expanded", String(open));
}

function closeAccountMenu() {
  document.querySelectorAll(".account-menu.is-open").forEach((accountMenu) => {
    setAccountMenuOpen(accountMenu, false);
  });
}

/**
 * Cập nhật động trạng thái hiển thị của các menu auth/admin mà không cần re-render cả header
 */
export function updateHeaderAuth() {
  const authSlot = document.getElementById("nav-auth-slot");
  const adminLink = document.getElementById("nav-admin");
  const admin = isAdmin();
  const logged = isLoggedIn();

  if (authSlot) authSlot.innerHTML = renderAuthControl();
  if (adminLink) {
    adminLink.hidden = !admin;
  }

  // Đồng bộ ẩn/hiện các menu chỉ dành cho người đã đăng nhập
  document.querySelectorAll("#site-menu a[data-link]").forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (href === "/map" || href.startsWith("/login")) return;
    link.hidden = !logged;
  });

  syncAccountProfile();
  syncAccountAvatar();

  // Đồng bộ chatbot theo trạng thái đăng nhập (không cần F5)
  syncChatbotVisibility();
}
