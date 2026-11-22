// File: src/js/theme.js
// Quản lý giao diện Sáng / Tối / Hệ thống + chống chớp trắng khi reload (FOUC)

const THEME_KEY = "traffic_theme"; // "light" | "dark" | "system"

/**
 * Xác định theme thực tế cần áp dụng
 * @param {"light"|"dark"|"system"} preference
 * @returns {"light"|"dark"}
 */
function resolveTheme(preference) {
  if (preference === "dark") return "dark";
  if (preference === "light") return "light";
  // system
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/**
 * Áp theme vào <html data-theme="..."> — được gọi sớm trong <head> để tránh chớp trắng
 */
function applyTheme(preference) {
  const resolved = resolveTheme(preference);
  document.documentElement.setAttribute("data-theme", resolved);
  document.documentElement.style.colorScheme = resolved;
}

/**
 * Script inline chèn vào <head> chạy TRƯỚC khi render CSS — chống chớp trắng
 */
export function getThemeBootstrapScript() {
  return `(function(){try{var p=localStorage.getItem("${THEME_KEY}")||"system";var d=p==="dark"||(p!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.setAttribute("data-theme",d?"dark":"light");e.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
}

/**
 * Khởi tạo theme manager: đọc preference, áp dụng, lắng nghe thay đổi của hệ thống
 * @returns {{ get: () => string, set: (p: string) => void }}
 */
export function initTheme() {
  const preference = localStorage.getItem(THEME_KEY) || "system";
  applyTheme(preference);

  // Theo dõi khi hệ điều hành đổi theme (chỉ khi chế độ "system")
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  media?.addEventListener?.("change", () => {
    if ((localStorage.getItem(THEME_KEY) || "system") === "system") {
      applyTheme("system");
    }
  });

  return {
    get: () => localStorage.getItem(THEME_KEY) || "system",
    set(preference) {
      localStorage.setItem(THEME_KEY, preference);
      applyTheme(preference);
    },
  };
}

export { THEME_KEY };
