// File: src/js/main.js
import { initRouter } from "./router.js";
import { homePage } from "./pages/homePage.js";
import { mapPage } from "./pages/mapPage.js";
import { loginPage } from "./pages/loginPage.js";
import { adminPage } from "./pages/adminPage.js";

const routes = {
  "/": homePage,
  "/map": mapPage,
  "/login": loginPage,
  "/admin": adminPage,
};

document.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("app");
  if (app) {
    initRouter(routes, app);
  }
});
