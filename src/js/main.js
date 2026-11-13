// File: src/js/main.js
import { initRouter } from "./router.js";
import { renderHeader } from "./components/header.js";
import { renderFooter } from "./components/footer.js";
import { homePage } from "./pages/homePage.js";
import { loginPage } from "./pages/loginPage.js";
import { adminPage } from "./pages/adminPage.js";

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
  "/login": loginPage,
  "/admin": adminPage,
};

document.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("app");
  if (app) {
    initRouter(routes, app);
  }
});
