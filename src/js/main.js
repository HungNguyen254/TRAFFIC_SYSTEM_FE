// File: src/js/main.js
import { initRouter } from "./router.js";
import { homePage } from "./pages/homePage.js";
import { mapPage } from "./pages/mapPage.js";
import { loginPage } from "./pages/loginPage.js";
import { adminPage } from "./pages/adminPage.js";

/**
 * Định nghĩa hệ thống Routes và hàng rào phân quyền (Route Guards)
 * - public: Người dùng chưa đăng nhập (khách) được truy cập
 * - requiresAuth: Bắt buộc đăng nhập mới được truy cập
 * - role: Yêu cầu quyền quản trị viên (Admin)
 */
const routes = {
  "/": {
    page: homePage,
    meta: { public: true, title: "Trang chủ" },
  },
  "/map": {
    page: mapPage,
    meta: { public: true, title: "Bản đồ giao thông" },
  },
  "/login": {
    page: loginPage,
    meta: { public: true, title: "Đăng nhập & Tài khoản" },
  },
  "/admin": {
    page: adminPage,
    meta: { requiresAuth: true, role: "admin", title: "Quản trị hệ thống" },
  },
};

document.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("app");
  if (app) {
    initRouter(routes, app);
  }
});
