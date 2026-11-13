// File: src/js/router.js

let routes = {};
let currentController = null;
let appContainer = null;

/**
 * Chuẩn hóa path URL (xử lý đuôi .html, query params, hash)
 * @param {string} fullPath 
 * @returns {{ path: string, search: string, hash: string }}
 */
export function parseRoute(fullPath) {
  let [withoutHash, hash = ""] = fullPath.split("#");
  let [rawPath, search = ""] = withoutHash.split("?");

  let path = rawPath.trim();
  if (!path.startsWith("/")) path = `/${path}`;

  // Chuẩn hóa tương thích ngược các file .html cũ
  if (path === "/index.html" || path === "/main.html") {
    path = "/";
  } else if (path.toLowerCase() === "/map.html" || path.toLowerCase() === "/map") {
    path = "/map";
  } else if (path.toLowerCase() === "/login.html" || path.toLowerCase() === "/login") {
    path = "/login";
  } else if (path.toLowerCase() === "/admin.html" || path.toLowerCase() === "/admin") {
    path = "/admin";
  } else if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }

  return {
    path,
    search: search ? `?${search}` : "",
    hash: hash ? `#${hash}` : "",
  };
}

/**
 * Điều hướng người dùng đến path chỉ định
 * @param {string} toPath - Đường dẫn cần chuyển đến
 * @param {boolean} push - Có ghi vào browser history không
 */
export function navigateTo(toPath, push = true) {
  const { path, search, hash } = parseRoute(toPath);
  const targetUrl = `${path}${search}${hash}`;
  const currentParsed = parseRoute(window.location.pathname + window.location.search + window.location.hash);

  // Nếu đã ở đúng route và chỉ khác hash (ví dụ bấm /#forecast khi đang ở /)
  if (currentController && currentParsed.path === path && (hash || window.location.hash)) {
    if (push && window.location.pathname + window.location.search + window.location.hash !== targetUrl) {
      window.history.pushState(null, "", targetUrl);
    }
    if (hash) {
      const el = document.querySelector(hash);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        return;
      }
    }
    return;
  }

  if (push && window.location.pathname + window.location.search + window.location.hash !== targetUrl) {
    window.history.pushState(null, "", targetUrl);
  }

  // 1. Dọn dẹp trang trước nếu có hàm unmount
  if (currentController && typeof currentController.unmount === "function") {
    try {
      currentController.unmount();
    } catch (err) {
      console.error("Lỗi khi unmount trang:", err);
    }
  }

  // 2. Tìm controller tương ứng
  let controller = routes[path];
  if (!controller) {
    console.warn(`Không tìm thấy route: ${path}, chuyển về '/'`);
    controller = routes["/"];
  }

  currentController = controller;

  // 3. Mount trang mới
  if (controller && typeof controller.mount === "function" && appContainer) {
    controller.mount(appContainer, navigateTo);
  }

  // 4. Xử lý cuộn trang: nếu có hash thì scroll tới element đó, nếu không thì lên đầu trang
  if (hash) {
    const el = document.querySelector(hash);
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 50);
      return;
    }
  }
  window.scrollTo(0, 0);
}

/**
 * Khởi tạo Router với danh sách routes và container root
 * @param {Record<string, { mount: Function, unmount?: Function }>} routeMap 
 * @param {HTMLElement} container 
 */
export function initRouter(routeMap, container) {
  routes = routeMap;
  appContainer = container;

  // Lắng nghe sự kiện browser Back / Forward
  window.addEventListener("popstate", () => {
    navigateTo(window.location.pathname + window.location.search + window.location.hash, false);
  });

  // Ủy quyền sự kiện click cho các liên kết nội bộ
  document.addEventListener("click", (e) => {
    // Không chặn khi người dùng giữ phím bổ trợ để mở tab mới hoặc nhấn chuột giữa
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }

    const link = e.target.closest("a");
    if (!link) return;

    const href = link.getAttribute("href");
    const target = link.getAttribute("target");

    // Bỏ qua external links, mailto, tel, hoặc target blank
    if (!href || target === "_blank" || href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      return;
    }

    // Nếu chỉ là hash trên cùng trang chủ
    if (href.startsWith("#")) {
      const current = parseRoute(window.location.pathname);
      if (current.path === "/") {
        return; // Cho phép trình duyệt scroll tự nhiên
      } else {
        e.preventDefault();
        navigateTo(`/${href}`);
        return;
      }
    }

    e.preventDefault();
    navigateTo(href);
  });

  // Điều hướng tới URL hiện tại ngay khi khởi động
  navigateTo(window.location.pathname + window.location.search + window.location.hash, false);
}
