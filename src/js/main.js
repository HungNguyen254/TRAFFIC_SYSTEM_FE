import { renderHeader } from "./components/header.js";
import { renderFooter } from "./components/footer.js";
import { isLoggedIn } from "./api.js";

console.log("Vite SPA loaded, loggedIn:", isLoggedIn());
console.log("Header check:", typeof renderHeader, typeof renderFooter);
