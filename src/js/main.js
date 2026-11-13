// File: src/js/main.js
import { initRouter } from "./router.js";
import { renderHeader } from "./components/header.js";
import { renderFooter } from "./components/footer.js";
import { homePage } from "./pages/homePage.js";

// Stub controllers trước khi các tasks sau hoàn thiện từng trang
const stubController = (title, path) => ({
  mount(container) {
    container.innerHTML = `
      ${renderHeader(path)}
      <main style="padding: 40px 20px; min-height: 60vh;">
        <h1>${title}</h1>
        <p>Đang tải dữ liệu trang...</p>
      </main>
      ${renderFooter()}
    `;
  },
  unmount() {},
});

const routes = {
  "/": homePage,
  "/map": stubController("Bản đồ", "/map"),
  "/login": stubController("Đăng nhập", "/login"),
  "/admin": stubController("Quản trị", "/admin"),
};

document.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("app");
  if (app) {
    initRouter(routes, app);
  }
});
