// File: src/js/components/header.js
import { isAdmin, isLoggedIn } from "../api.js";

/**
 * Render thanh header tối giản, phi biểu tượng kèm hàng rào trạng thái phân quyền
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

      <nav class="menu" aria-label="Điều hướng chính">
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
}
