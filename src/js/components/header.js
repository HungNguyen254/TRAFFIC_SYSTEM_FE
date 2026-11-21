// File: src/js/components/header.js
import { isAdmin, isLoggedIn } from "../api.js";
import { syncChatbotVisibility } from "./chatbot.js";

let headerEventsInitialized = false;

/**
 * Render thanh header tối giản kèm nút điều hướng di động (Hamburger)
 * @param {string} currentPath - Đường dẫn hiện tại (ví dụ: '/', '/map', '/login', '/admin')
 * @returns {string} HTML string
 */
export function renderHeader(currentPath = "/") {
  const normPath = currentPath.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  const logged = isLoggedIn();
  const admin = isAdmin();

  const authLabel = logged
    ? (admin ? "Tài khoản (Admin)" : "Tài khoản")
    : "Đăng nhập";

  return `
    <header class="site-header">
      <a class="logo" href="/" data-link title="Hà Nội Traffic AI">
        <span class="logo-title">Hà Nội Traffic <span class="logo-accent">AI</span></span>
        <span class="logo-badge">
          <span class="pulse-dot"></span>
          TRỰC TIẾP
        </span>
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
        <a href="/" data-link ${normPath === "/" ? 'aria-current="page"' : ""}>Trang chủ</a>
        <a href="/#forecast" data-link>Dự báo</a>
        <a href="/map" data-link ${normPath === "/map" ? 'aria-current="page"' : ""}>Bản đồ</a>
        <a href="/login" id="nav-auth" data-link ${normPath === "/login" ? 'aria-current="page"' : ""}>
          ${authLabel}
        </a>
        <a href="/admin" id="nav-admin" data-link ${normPath === "/admin" ? 'aria-current="page"' : ""} ${admin ? "" : "hidden"}>
          Quản trị
        </a>
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
export function initHeaderEvents() {
  if (headerEventsInitialized) return;
  headerEventsInitialized = true;

  // Đảm bảo backdrop được gắn vào body để không bị giam trong Containing Block của header có backdrop-filter
  let backdropEl = document.getElementById("nav-backdrop");
  if (backdropEl && backdropEl.parentElement !== document.body) {
    document.body.appendChild(backdropEl);
  }

  document.addEventListener("click", (e) => {
    const toggleBtn = e.target.closest("#nav-toggle");
    const backdrop = e.target.closest("#nav-backdrop");
    const menuLink = e.target.closest(".menu a");
    const menu = document.getElementById("site-menu");
    const isOpen = menu?.classList.contains("mobile-open");

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
  });

  window.addEventListener("resize", () => {
    // Đồng bộ ngưỡng đóng drawer theo breakpoint CSS là 860px
    if (window.innerWidth > 860) {
      closeMobileMenu();
    }
  });
}

/**
 * Cập nhật động trạng thái hiển thị của các menu auth/admin mà không cần re-render cả header
 */
export function updateHeaderAuth() {
  const authLink = document.getElementById("nav-auth");
  const adminLink = document.getElementById("nav-admin");
  const logged = isLoggedIn();
  const admin = isAdmin();

  if (authLink) {
    authLink.textContent = logged
      ? (admin ? "Tài khoản (Admin)" : "Tài khoản")
      : "Đăng nhập";
  }
  if (adminLink) {
    adminLink.hidden = !admin;
  }

  // Đồng bộ chatbot theo trạng thái đăng nhập (không cần F5)
  syncChatbotVisibility();
}
