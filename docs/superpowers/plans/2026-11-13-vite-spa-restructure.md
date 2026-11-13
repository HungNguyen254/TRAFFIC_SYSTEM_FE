# Kế hoạch Tái cấu trúc FE – Chuẩn Vite Single Page Application (SPA)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển đổi toàn bộ giao diện và cấu trúc thư mục của dự án sang Vite SPA chuẩn với duy nhất 1 file `index.html` ở thư mục gốc, toàn bộ các trang chuyển thành pure JavaScript views render động bằng `innerHTML`, điều hướng bằng Client-Side Router.

**Architecture:** Sử dụng kiến trúc Single Page Application thuần (Vanilla JS SPA). File `index.html` làm application shell chứa `<div id="app"></div>`. Một router nhẹ (`router.js`) phụ trách quản lý đường dẫn (`/`, `/map`, `/login`, `/admin`), render các view component tương ứng (`homePage`, `mapPage`, `loginPage`, `adminPage`) và vòng đời `mount` / `unmount` (giải phóng instance Leaflet khi chuyển trang).

**Tech Stack:** Vite 8, Vanilla JavaScript (ES Modules), Leaflet 1.9.4, Chart.js 4.4.4, CSS3.

**Spec:** [docs/superpowers/specs/2026-11-13-vite-spa-restructure-design.md](file:///home/PageNguyen/Projects/FE/docs/superpowers/specs/2026-11-13-vite-spa-restructure-design.md)

## Global Constraints
- Duy nhất 1 file `index.html` tại thư mục gốc của dự án.
- Không giữ lại thư mục `html/` cũ sau khi hoàn thành.
- Tất cả các file mã nguồn phải nằm trong `src/` (`src/css/`, `src/js/`).
- Đặt tên file thống nhất bằng chữ thường (ví dụ: `map.css`, `map.js` thay vì `Map.*`).
- Đảm bảo giữ nguyên các `id` và `class` DOM để CSS và các script logic chạy chính xác.
- Khử lỗi cảnh báo Vite 8 `__dirname` bằng `import.meta.dirname` hoặc lược bỏ nếu không cần rollupOptions phức tạp.
- Lệnh `npm run build` phải build ra bản phân phối `dist/` thành công không có lỗi.

## Review Focus
1. **Lỗi Leaflet Map container is already initialized**: Khi người dùng vào `/map` rồi chuyển sang `/` và quay lại `/map`, nếu không gọi `map.remove()` trong `unmount()`, Leaflet sẽ ném ngoại lệ.
2. **Xử lý URL chuyển trang trong JS**: Các lệnh `window.location.replace("main.html")` trong `login.js` và `admin.js` phải được thay thế bằng lệnh điều hướng của router `navigateTo('/')`.
3. **Đồng bộ trạng thái đăng nhập trên Header**: Header phải cập nhật lại liên kết "Đăng nhập" / "Tài khoản" và nút "Quản trị" tương ứng với trạng thái đăng nhập của người dùng mà không cần reload trang.
4. **Deep-linking & Query parameter trên trang Bản đồ**: `/map?q=<tên đường>` phải tiếp tục hoạt động chính xác khi mount `mapPage`.
5. **Cập nhật lịch sử duyệt web (Browser Back/Forward)**: Sự kiện `popstate` phải kích hoạt re-render đúng trang tương ứng với `window.location.pathname`.

---

### Task 1: Dọn dẹp cấu trúc thư mục, tạo `index.html` duy nhất và cập nhật `vite.config.js`

**Files:**
- Create: `index.html`
- Create: `public/.gitkeep`
- Move & Rename: `css/main.css` -> `src/css/main.css`
- Move & Rename: `css/Map.css` -> `src/css/map.css`
- Modify: `vite.config.js`

**Interfaces:**
- Consumes: Static fonts, CDN Leaflet CSS/JS, CDN Chart.js
- Produces: Thẻ gốc `<div id="app"></div>` và nạp module `/src/js/main.js`

- [ ] **Step 1: Tạo thư mục `public/` và chuyển CSS vào `src/css/`**
  - Chuyển `css/main.css` vào `src/css/main.css`.
  - Chuyển và đổi tên `css/Map.css` thành `src/css/map.css`.
  - Xóa thư mục `css/` rỗng.
  - Tạo thư mục `public/` kèm file `.gitkeep`.

- [ ] **Step 2: Viết file `index.html` duy nhất tại thư mục gốc**
  - Thêm đầy đủ meta tags, title `Dự báo tắc đường thông minh – Hà Nội`.
  - Nạp Google Fonts `Be Vietnam Pro`.
  - Nạp Leaflet CSS từ CDN (`unpkg.com/leaflet@1.9.4`).
  - Nạp `/src/css/main.css` và `/src/css/map.css`.
  - Nạp CDN Chart.js và Leaflet JS.
  - Thêm thẻ `<div id="app"></div>`.
  - Nạp script module `<script type="module" src="/src/js/main.js"></script>`.

- [ ] **Step 3: Cập nhật `vite.config.js` sang chuẩn SPA**
  - Đặt `appType: 'spa'`.
  - Cấu hình server port `5173`, `open: true`.
  - Xóa bỏ `rollupOptions.input` đa file cũ.

- [ ] **Step 4: Tạo file tạm `src/js/main.js` và kiểm tra `npm run build`**
  - Viết `src/js/main.js` tạm thời in `console.log("Vite SPA loaded")`.
  - Chạy `npm run build` để kiểm tra Vite đóng gói `index.html` thành công.

---

### Task 2: Chuyển dịch `api.js` và xây dựng Shared Components (`header.js`, `footer.js`)

**Files:**
- Move: `js/api.js` -> `src/js/api.js`
- Create: `src/js/components/header.js`
- Create: `src/js/components/footer.js`

**Interfaces:**
- Consumes: `isLoggedIn()`, `isAdmin()`, `getUser()` từ `src/js/api.js`
- Produces:
  - `renderHeader(activeRoute)`: Trả về chuỗi HTML của thanh header kèm highlight menu và trạng thái auth.
  - `bindHeaderEvents(container, navigateTo)`: Bắt sự kiện click các menu điều hướng để chuyển trang qua router.
  - `renderFooter()`: Trả về chuỗi HTML của footer.

- [ ] **Step 1: Chuyển `js/api.js` vào `src/js/api.js`**
  - Di chuyển `js/api.js` vào `src/js/api.js`.
  - Đảm bảo các hàm `request`, `checkHealth`, `getToken`, `getUser`, `saveSession`, `clearSession`, `isLoggedIn`, `isAdmin` giữ nguyên signature.

- [ ] **Step 2: Tạo component `src/js/components/header.js`**
  - Xuất hàm `renderHeader(currentPath)`:
    - Hiển thị logo `Tắc Đường AI` trỏ về `/`.
    - Các menu: Trang chủ (`/`), Bản đồ (`/map`), Đăng nhập/Tài khoản (`/login`), Quản trị (`/admin` nếu là admin).
    - Tự động gắn thuộc tính `aria-current="page"` vào link tương ứng với `currentPath`.
  - Xuất hàm `bindHeaderEvents(container, navigateTo)`:
    - Bắt sự kiện click vào các thẻ `<a>` bên trong header để gọi `navigateTo(href)`.

- [ ] **Step 3: Tạo component `src/js/components/footer.js`**
  - Xuất hàm `renderFooter()` trả về footer chuẩn của dự án:
    ```html
    <footer class="site-footer">
      <p>Tắc Đường AI – Bài tập thực tập.</p>
    </footer>
    ```

- [ ] **Step 4: Kiểm tra cú pháp và build thử nghiệm**
  - Chạy `npm run build` để xác nhận không có lỗi cú pháp trong `src/js/components/`.

---

### Task 3: Xây dựng Client-Side Router (`src/js/router.js`) và nạp ứng dụng trong `src/js/main.js`

**Files:**
- Create: `src/js/router.js`
- Modify: `src/js/main.js`

**Interfaces:**
- Consumes: Các page controllers (`homePage`, `mapPage`, `loginPage`, `adminPage`)
- Produces:
  - `initRouter(routes, appContainer)`: Khởi tạo router, lắng nghe `popstate` và intercept thẻ `<a data-link>` hoặc `<a href="^/...">`.
  - `navigateTo(path)`: Hàm chuyển trang lập trình sẵn sàng export cho các page/component gọi.

- [ ] **Step 1: Viết module `src/js/router.js`**
  - Lưu trạng thái: `routes` (map giữa path và page controller), `currentController`, `container`.
  - Hàm `resolveRoute(path)`: Chuẩn hóa path (ví dụ: `/index.html` -> `/`, bỏ trailing slash).
  - Hàm `navigateTo(path, push = true)`:
    - Nếu `currentController?.unmount` tồn tại, gọi `currentController.unmount()`.
    - Nếu `push === true`, gọi `window.history.pushState(null, "", path)`.
    - Tìm controller phù hợp; nếu không thấy, fallback về route `/`.
    - Gọi `controller.mount(container, navigateTo)`.
    - Cập nhật header active link.
    - Cuộn trang về đầu (`window.scrollTo(0, 0)`).
  - Lắng nghe sự kiện `popstate`: gọi `navigateTo(window.location.pathname + window.location.search, false)`.
  - Lắng nghe `click` toàn cục trên `document`: nếu click vào thẻ `<a href="...">` có link nội bộ (bắt đầu bằng `/` hoặc không có giao thức `http`), gọi `e.preventDefault()` và `navigateTo(url)`.

- [ ] **Step 2: Cập nhật `src/js/main.js`**
  - Import `initRouter` và các page controller.
  - Đăng ký các route:
    - `'/'`: HomePage
    - `'/map'`: MapPage
    - `'/login'`: LoginPage
    - `'/admin'`: AdminPage
  - Khởi tạo router gắn với phần tử `#app`.

- [ ] **Step 3: Kiểm tra router hoạt động với stub controllers**
  - Chạy `npm run build` xác nhận build thành công.

---

### Task 4: Chuyển đổi Trang chủ (`homeView.js` & `homePage.js`)

**Files:**
- Create: `src/js/views/homeView.js`
- Create: `src/js/pages/homePage.js`

**Interfaces:**
- Consumes: `renderHeader`, `renderFooter`, `request`, `checkHealth`
- Produces: `homePage = { mount(container, navigateTo), unmount() }`

- [ ] **Step 1: Trích xuất HTML của Trang chủ sang `src/js/views/homeView.js`**
  - Chuyển toàn bộ thẻ `<main>` của `html/main.html` vào hàm `renderHomeView()`.
  - Đổi các link tĩnh cũ: `href="Map.html"` -> `href="/map"`, `href="login.html"` -> `href="/login"`, `href="admin.html"` -> `href="/admin"`.

- [ ] **Step 2: Viết controller `src/js/pages/homePage.js`**
  - Chuyển toàn bộ logic từ `js/main.js` sang `homePage.js`:
    - `mount(container, navigateTo)`:
      - Gán `container.innerHTML = renderHeader('/') + renderHomeView() + renderFooter()`.
      - Gắn kết `bindHeaderEvents(container, navigateTo)`.
      - Khởi tạo logic: `updateNav()`, `initBackendConnection()`, `initForecastForm()`, `initTrafficData()`.
    - `unmount()`: Dọn dẹp event listeners nếu cần.

- [ ] **Step 3: Kiểm tra Trang chủ hiển thị và hoạt động**
  - Chạy `npm run build` để xác minh không có lỗi đóng gói.

---

### Task 5: Chuyển đổi Trang Đăng nhập / Tài khoản (`loginView.js` & `loginPage.js`)

**Files:**
- Create: `src/js/views/loginView.js`
- Create: `src/js/pages/loginPage.js`

**Interfaces:**
- Consumes: `renderHeader`, `renderFooter`, `request`, `saveSession`, `clearSession`, `getUser`, `isLoggedIn`
- Produces: `loginPage = { mount(container, navigateTo), unmount() }`

- [ ] **Step 1: Trích xuất HTML Đăng nhập sang `src/js/views/loginView.js`**
  - Chuyển cấu trúc `<main class="auth-main">` từ `html/login.html` sang hàm `renderLoginView()`.
  - Cập nhật link sang `/admin`, `/map`, `/`.

- [ ] **Step 2: Viết controller `src/js/pages/loginPage.js`**
  - Chuyển logic từ `js/login.js` vào `loginPage.js`:
    - Thay thế các lệnh `window.location.replace("main.html")` và `window.location.href = "main.html"` bằng `navigateTo('/')`.
    - `mount(container, navigateTo)`:
      - Gán `container.innerHTML = renderHeader('/login') + renderLoginView() + renderFooter()`.
      - Gắn kết `bindHeaderEvents(container, navigateTo)`.
      - Khởi tạo tab đăng nhập/đăng ký, form submit handlers, load thông tin `me-panel` nếu đã đăng nhập, xử lý nút đăng xuất.
    - `unmount()`.

- [ ] **Step 3: Kiểm tra Trang Đăng nhập**
  - Chạy `npm run build` để kiểm tra.

---

### Task 6: Chuyển đổi Trang Quản trị (`adminView.js` & `adminPage.js`)

**Files:**
- Create: `src/js/views/adminView.js`
- Create: `src/js/pages/adminPage.js`

**Interfaces:**
- Consumes: `renderHeader`, `renderFooter`, `isAdmin`, `isLoggedIn`, `clearSession`, `request`
- Produces: `adminPage = { mount(container, navigateTo), unmount() }`

- [ ] **Step 1: Trích xuất HTML Quản trị sang `src/js/views/adminView.js`**
  - Chuyển nội dung `<main class="admin-main">` từ `html/admin.html` sang `renderAdminView()`.
  - Cập nhật các liên kết trỏ về `/` và `/login`.

- [ ] **Step 2: Viết controller `src/js/pages/adminPage.js`**
  - Chuyển logic từ `js/admin.js` vào `adminPage.js`:
    - Kiểm tra quyền `isAdmin()`: nếu chưa đăng nhập hoặc không phải admin, hiển thị thông báo yêu cầu đăng nhập kèm link chuyển sang `/login`.
    - Thay thế `window.location.replace("main.html")` bằng `navigateTo('/')`.
    - `mount(container, navigateTo)`:
      - Gán `container.innerHTML = renderHeader('/admin') + renderAdminView() + renderFooter()`.
      - Gắn kết `bindHeaderEvents(container, navigateTo)`.
      - Bắt sự kiện nút Huấn luyện lại model và nút Đăng xuất.
    - `unmount()`.

- [ ] **Step 3: Kiểm tra Trang Quản trị**
  - Chạy `npm run build` để kiểm tra.

---

### Task 7: Chuyển đổi Trang Bản đồ (`mapView.js` & `mapPage.js`), dọn dẹp file cũ và kiểm thử toàn diện

**Files:**
- Create: `src/js/views/mapView.js`
- Create: `src/js/pages/mapPage.js`
- Delete: `html/main.html`, `html/Map.html`, `html/login.html`, `html/admin.html`
- Delete: `js/main.js`, `js/Map.js`, `js/login.js`, `js/admin.js`

**Interfaces:**
- Consumes: `renderHeader`, Leaflet `L`, Chart.js `Chart`, API client
- Produces: `mapPage = { mount(container, navigateTo), unmount() }`

- [ ] **Step 1: Trích xuất HTML Bản đồ sang `src/js/views/mapView.js`**
  - Chuyển toàn bộ layout của `html/Map.html` (`.layout`, `#map-canvas`, `#status-overlay`, `#tile-warning`, `.panel`, popup elements) sang `renderMapView()`.

- [ ] **Step 2: Viết controller `src/js/pages/mapPage.js`**
  - Đóng gói toàn bộ logic từ `js/Map.js` vào `mapPage.js`:
    - `mount(container, navigateTo)`:
      - Render header, map layout và popup vào `container`.
      - Khởi tạo Leaflet `L.map('map-canvas')`.
      - Nạp dữ liệu các trục đường, OSRM routing, search autocomplete, popup chart.
      - Xử lý deep-link query parameter `?q=...` từ URL.
      - Lưu instance `map` vào biến module để quản lý.
    - `unmount()`:
      - Gọi `map.remove()` để hủy instance Leaflet và xóa canvas listeners, tránh lỗi "Map container is already initialized" khi người dùng quay lại trang.

- [ ] **Step 3: Xóa bỏ các thư mục và file HTML/JS cũ**
  - Xóa toàn bộ thư mục `html/`.
  - Xóa toàn bộ thư mục `js/` cũ.

- [ ] **Step 4: Kiểm tra Build và chạy thử nghiệm toàn bộ hệ thống**
  - Chạy `npm run build` để đảm bảo output chỉ gồm `dist/index.html` và các assets liên quan.
  - Kiểm tra các liên kết và chuyển trang mượt mà giữa `/`, `/map`, `/login`, `/admin`.
