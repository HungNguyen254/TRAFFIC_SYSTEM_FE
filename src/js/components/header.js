// File: src/js/components/header.js
import { isAdmin, isLoggedIn } from "../api.js";

/**
 * Render thanh header dùng chung kèm theo highlight trang hiện tại và trạng thái auth.
 * @param {string} currentPath - Đường dẫn hiện tại (ví dụ: '/', '/map', '/login', '/admin')
 * @returns {string} HTML string
 */
export function renderHeader(currentPath = "/") {
  const normPath = currentPath.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  const logged = isLoggedIn();
  const admin = isAdmin();

  return `
    <header class="site-header">
      <a class="logo" href="/" data-link>Tắc Đường <span>AI</span></a>
      <nav class="menu">
        <a href="/" data-link ${normPath === "/" ? 'aria-current="page"' : ""}>Trang chủ</a>
        <a href="/#forecast" data-link>Dự báo</a>
        <a href="/map" data-link ${normPath === "/map" ? 'aria-current="page"' : ""}>Bản đồ</a>
        <a href="/login" id="nav-auth" data-link ${normPath === "/login" ? 'aria-current="page"' : ""}>
          ${logged ? "Tài khoản" : "Đăng nhập"}
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
  if (authLink) {
    authLink.textContent = isLoggedIn() ? "Tài khoản" : "Đăng nhập";
  }
  if (adminLink) {
    adminLink.hidden = !isAdmin();
  }
}
