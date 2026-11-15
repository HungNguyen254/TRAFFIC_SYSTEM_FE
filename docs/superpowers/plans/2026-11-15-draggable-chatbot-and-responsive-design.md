# Draggable AI Chatbot & Full-Site Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng Floating Draggable AI Chatbot có thể kéo thả tự do trên toàn bộ màn hình, tích hợp dữ liệu giao thông thời gian thực và tối ưu hóa Responsive toàn diện cho toàn bộ website (Header Drawer, Bản đồ, Trang chủ, Đăng nhập, Quản trị) hoạt động mượt mà trên Mobile, Tablet và Desktop.

**Architecture:** Sử dụng tiêu chuẩn Pointer Events (`setPointerCapture`) để thực hiện cơ chế kéo thả không phụ thuộc thư viện, tự động giới hạn trong viewport và lưu tọa độ `localStorage`. Chatbot Engine (`chatService.js`) hoạt động client-side thông minh, nạp trực tiếp danh sách điểm ùn tắc từ `fetchEdges()`, phản hồi theo cấu trúc chuẩn của Backend FastAPI (`content`, `timestamp`, `role`) và trả về các nút hành động (Action Buttons). Header được nâng cấp với Mobile Drawer Menu, và các trang được chuẩn hóa với hệ thống media queries, mobile tab switching trên bản đồ và chống tràn ngang.

**Tech Stack:** JavaScript (ES6+ Modules), HTML5 Pointer Events, CSS3 Custom Properties & Media Queries, Leaflet.js 1.9.4, Chart.js, Node.js Test Runner (`node:test`).

**Spec:** `docs/superpowers/specs/2026-11-15-draggable-chatbot-and-responsive-design.md`

## Global Constraints
- Phân biệt rõ ràng giữa click và drag (> 6px coi là kéo thả, không kích hoạt mở/đóng cửa sổ chat).
- Icon chatbot luôn được giới hạn trong khung hình `[12px, window.innerWidth - width - 12px]` và `[12px, window.innerHeight - height - 12px]`.
- Toàn bộ website không có thanh cuộn ngang ngoài ý muốn (`overflow-x: hidden`).
- Các nút bấm và vùng chạm tương tác trên thiết bị cảm ứng di động đạt kích thước tối thiểu 44px x 44px.
- Bản build production `npm run build` phải thành công tuyệt đối không phát sinh lỗi cú pháp hay thiếu import.

## Review Focus
1. **Phân biệt Click vs Drag:** Thao tác kéo thả icon đi một khoảng xa và nhấc ngón tay/chuột lên không được mở cửa sổ chat.
2. **Giới hạn màn hình khi resize/xoay ngang màn hình di động:** Icon không bị chìm hoặc trôi ra ngoài rìa màn hình khi thay đổi kích thước viewport.
3. **Mạng lỗi hoặc không có dữ liệu giao thông:** Khi `fetchEdges()` gặp lỗi hoặc backend offline, Chatbot vẫn phản hồi mượt mà với dữ liệu suy luận ngoại tuyến, không báo lỗi runtime.
4. **Mobile Navigation Drawer:** Khi mở menu trên mobile, nhấp vào liên kết bất kỳ hoặc nhấp vào vùng mờ bên ngoài phải tự động đóng drawer và điều hướng chính xác.
5. **Mobile Map View Toggle:** Trên màn hình di động (< 920px), người dùng có thể chuyển đổi mượt mà giữa xem toàn màn hình Bản đồ Leaflet và xem Bảng tìm đường mà không bị vỡ kích thước bản đồ (`map.invalidateSize()`).

---

### Task 1: Traffic AI Intelligence Service (`src/js/services/chatService.js`)

**Files:**
- Create: `src/js/services/chatService.js`
- Test: `tests/chatService.test.js`
- Modify: `package.json:6-10` (bổ sung script test: `"test": "node --test tests/*.test.js"`)

**Interfaces:**
- Consumes: `fetchEdges()`, `parseSpeedKmh()`, `trafficLevelFromSpeed()` từ `src/js/api.js`.
- Produces: 
  - `processChatMessage(userInput: string, cachedEdges?: Array<object>) -> Promise<{ content: string, timestamp: string, role: string, actions?: Array<{ text: string, path: string }> }>`
  - `getQuickPillSuggestions() -> Array<string>`
  - `getInitialGreeting() -> { content: string, timestamp: string, role: string, actions?: Array<{ text: string, path: string }> }`

- [ ] **Step 1: Cập nhật `package.json` bổ sung script test**
  - Thêm `"test": "node --test tests/*.test.js"` vào `scripts` trong `package.json`.

- [ ] **Step 2: Viết failing test trong `tests/chatService.test.js`**
  - Test phát hiện ý định tắc đường: trả về danh sách các tuyến đường ùn tắc (Level 3/4) và kèm action button dẫn đến `/map`.
  - Test phát hiện ý định hỏi giờ cao điểm: trả về khung giờ sáng 7h-9h và chiều 16h30-19h.
  - Test phát hiện ý định hỏi tốc độ trung bình: tính toán đúng tốc độ từ danh sách edges.
  - Test xử lý câu hỏi không xác định: trả về hướng dẫn trợ giúp thân thiện và danh sách gợi ý.
  - Test cấu trúc trả về chuẩn `{ content, timestamp, role, actions }`.

- [ ] **Step 3: Chạy test để xác nhận test thất bại**
  - Run: `npm test`
  - Expected: FAIL do `src/js/services/chatService.js` chưa tồn tại.

- [ ] **Step 4: Hiện thực hóa `src/js/services/chatService.js`**
  - Xây dựng các regex nhận diện intent: `CONGESTION_REGEX`, `PEAK_HOURS_REGEX`, `SPEED_REGEX`, `ROUTE_ADVICE_REGEX`, `GREETING_REGEX`.
  - Hàm phân tích dữ liệu edges: lọc các điểm ùn tắc từ `edges` được truyền vào hoặc tự động gọi `fetchEdges()`.
  - Trả về tin nhắn định dạng markdown đơn giản (in đậm, danh sách gạch đầu dòng) kèm mảng `actions`.

- [ ] **Step 5: Chạy test để xác nhận test vượt qua**
  - Run: `npm test`
  - Expected: PASS toàn bộ các bài kiểm thử.

- [ ] **Step 6: Commit Task 1**
  ```bash
  git add package.json src/js/services/chatService.js tests/chatService.test.js
  git commit -m "feat(chat): implement traffic AI intelligence service"
  ```

---

### Task 2: Giao diện & Định kiểu Chatbot Widget (`src/css/chatbot.css`)

**Files:**
- Create: `src/css/chatbot.css`
- Modify: `index.html:18-21` (nhúng `src/css/chatbot.css`)

**Interfaces:**
- Consumes: Biến màu và bo góc CSS từ `src/css/main.css` (`--primary`, `--primary-hover`, `--border`, `--text`, `--text-muted`, `--surface-card`, `--shadow-xl`, `--radius-lg`).
- Produces: Các lớp CSS cho Chatbot Widget:
  - `.chatbot-fab`: Nút icon nổi, bo tròn 56px, fixed z-index 9999, hiệu ứng pulse và shadow.
  - `.chatbot-fab.dragging`: Cursor grabbing, phóng nhẹ scale 1.05, loại bỏ transition giật cục khi kéo.
  - `.chatbot-window`: Cửa sổ chat kích thước 380px x 540px, bo góc 16px, shadow nổi bật.
  - `.chatbot-window.hidden`: Ẩn cửa sổ mượt mà.
  - `.chatbot-header`, `.chatbot-messages`, `.chatbot-input-container`: Bố cục phân tầng rõ nét.
  - `.chat-bubble.user`, `.chat-bubble.bot`: Bong bóng tin nhắn với màu sắc tương phản cao.
  - `.chat-actions`: Các nút bấm hành động mini bên trong tin nhắn bot.
  - `.quick-pills`: Dải nút gợi ý câu hỏi nhanh có thể cuộn ngang.
  - `.typing-indicator`: Hiệu ứng 3 chấm nảy sinh động.
  - Responsive Mobile: `@media (max-width: 640px)` biến cửa sổ thành bottom-sheet modal 85vh / full width.

- [ ] **Step 1: Tạo tệp `src/css/chatbot.css` và viết toàn bộ quy tắc giao diện**
  - Tạo styling hoàn chỉnh theo chuẩn Modern UI, sắc nét, tương thích theme hiện có.
  - Thiết lập responsive bottom-sheet cho mobile screens <= 640px.

- [ ] **Step 2: Nhúng `chatbot.css` vào `index.html`**
  - Thêm thẻ `<link rel="stylesheet" href="/src/css/chatbot.css" />` vào thẻ `<head>` của `index.html`.

- [ ] **Step 3: Kiểm tra build CSS**
  - Run: `npm run build`
  - Expected: PASS

- [ ] **Step 4: Commit Task 2**
  ```bash
  git add src/css/chatbot.css index.html
  git commit -m "style(chat): add modern responsive styling for draggable chatbot widget"
  ```

---

### Task 3: Hiện thực hóa Component Chatbot Kéo Thả (`src/js/components/chatbot.js`)

**Files:**
- Create: `src/js/components/chatbot.js`
- Modify: `src/js/main.js:1-38` (gọi `initChatbot()`)

**Interfaces:**
- Consumes:
  - `processChatMessage`, `getQuickPillSuggestions`, `getInitialGreeting` từ `src/js/services/chatService.js`.
  - `navigateTo` từ `src/js/router.js`.
- Produces:
  - `initChatbot() -> void`: Khởi tạo FAB, cửa sổ chat, gắn vào `document.body`, thiết lập Pointer Events kéo thả và quản lý luồng hội thoại.

- [ ] **Step 1: Viết logic Kéo thả tự do bằng Pointer Events trong `src/js/components/chatbot.js`**
  - Thiết lập `pointerdown`, `pointermove`, `pointerup`, `pointercancel` với `setPointerCapture`.
  - Đo độ dịch chuyển `Math.hypot(dx, dy) > 6` để phân biệt drag và click.
  - Kẹp tọa độ an toàn: `clamp(val, min, max)` theo kích thước `window.innerWidth` và `window.innerHeight`.
  - Lưu và nạp vị trí từ `localStorage.getItem("traffic_chatbot_pos")`.
  - Tự động căn chỉnh lại tọa độ khi sự kiện `window.addEventListener("resize")` kích hoạt.

- [ ] **Step 2: Viết logic Cửa sổ Trò chuyện & Hội thoại**
  - Render HTML cho cửa sổ chat gồm: Header (tiêu đề, nút dọn dẹp lịch sử, nút đóng), Danh sách tin nhắn, Dải Quick Pills, Khung soạn thảo và Nút gửi.
  - Lắng nghe sự kiện click nút gửi, gõ phím Enter (không kèm Shift).
  - Tích hợp hiệu ứng typing indicator khi chờ bot phản hồi.
  - Xử lý click vào Quick Pills: tự động gửi câu hỏi.
  - Xử lý click vào nút Action bên trong tin nhắn bot: gọi `navigateTo(action.path)` và đóng chat nếu đang ở mobile.
  - Lưu trữ lịch sử tin nhắn trong `localStorage.getItem("traffic_chatbot_history")`.

- [ ] **Step 3: Tích hợp `initChatbot()` vào `src/js/main.js`**
  - Import `initChatbot` trong `src/js/main.js` và gọi hàm khi `DOMContentLoaded`.

- [ ] **Step 4: Kiểm tra build production**
  - Run: `npm run build`
  - Expected: PASS

- [ ] **Step 5: Commit Task 3**
  ```bash
  git add src/js/components/chatbot.js src/js/main.js
  git commit -m "feat(chat): implement draggable floating chatbot widget with real-time AI assistant"
  ```

---

### Task 4: Nâng cấp Header với Mobile Drawer Navigation (`src/js/components/header.js` & `src/css/main.css`)

**Files:**
- Modify: `src/js/components/header.js:1-60`
- Modify: `src/css/main.css:139-250` và phần `@media (max-width: 860px)`

**Interfaces:**
- Consumes: `isLoggedIn()`, `isAdmin()` từ `src/js/api.js`.
- Produces:
  - Header với nút Hamburger button `.nav-toggle` có animation chuyển thành chữ X.
  - Mobile Drawer Navigation trượt mở êm ái khi click Hamburger, tự động đóng khi chọn link hoặc click ra ngoài.
  - `updateHeaderAuth()` hỗ trợ cập nhật nhãn tài khoản trên cả desktop và mobile drawer.

- [ ] **Step 1: Cập nhật `src/js/components/header.js` thêm nút Hamburger và cơ chế Toggle**
  - Bổ sung `<button class="nav-toggle" id="nav-toggle" aria-label="Mở menu điều hướng" aria-expanded="false"><span></span><span></span><span></span></button>`.
  - Thêm thẻ backdrop phủ mờ `.nav-backdrop`.
  - Thêm hàm `initHeaderEvents()` để bắt sự kiện click Hamburger, click backdrop, và click link điều hướng (tự đóng menu).

- [ ] **Step 2: Bổ sung CSS cho Mobile Drawer trong `src/css/main.css`**
  - Viết CSS cho `.nav-toggle` (ẩn trên desktop, hiện trên mobile <= 768px).
  - Viết CSS cho `.site-header .menu` trên mobile: vị trí fixed/absolute, slide-down, viền kính mờ hiện đại, các link căn lề thoải mái cho ngón tay.
  - Viết CSS cho `.nav-backdrop` làm tối nền phía sau khi menu mở.

- [ ] **Step 3: Cập nhật hàm gọi `initHeaderEvents()` trong các trang hoặc router**
  - Đảm bảo khi header render, sự kiện toggle được khởi tạo trơn tru.

- [ ] **Step 4: Kiểm tra build production**
  - Run: `npm run build`
  - Expected: PASS

- [ ] **Step 5: Commit Task 4**
  ```bash
  git add src/js/components/header.js src/css/main.css
  git commit -m "feat(nav): add responsive mobile drawer navigation and hamburger menu"
  ```

---

### Task 5: Tối ưu Responsive Trang chủ, Đăng nhập và Quản trị (`src/css/main.css`)

**Files:**
- Modify: `src/css/main.css:1210-1265`

**Interfaces:**
- Consumes: Bố cục HTML của `renderHomeView()`, `renderLoginView()`, `renderAdminView()`.
- Produces: Bộ quy tắc Media Queries toàn diện chống tràn ngang, co giãn linh hoạt từ 320px trở lên.

- [ ] **Step 1: Thêm quy tắc chống tràn ngang toàn cục vào `src/css/main.css`**
  ```css
  html, body {
    max-width: 100%;
    overflow-x: hidden;
  }
  ```

- [ ] **Step 2: Cải thiện Media Queries cho Trang chủ (`/`)**
  - Màn hình <= 860px và <= 480px:
    - Hero title: `font-size: clamp(26px, 5.5vw, 40px);`.
    - Hero actions: nút bấm full width, xếp dọc trên màn hình nhỏ.
    - Hero stats: 1 cột trên điện thoại (< 640px), 3 cột trên tablet.
    - Hotspot grid: hiển thị dạng 1 cột đều đặn, không tràn lề.
    - Form tra cứu lộ trình: input và nút bấm tự co giãn 100%.
    - Forecast Chart canvas: thiết lập `min-height: 260px; width: 100%;`.

- [ ] **Step 3: Cải thiện Media Queries cho Trang Đăng nhập (`/login`) & Quản trị (`/admin`)**
  - Auth card: padding co giãn trên màn hình nhỏ (padding 20px 16px thay vì cố định lớn).
  - Form inputs & buttons: touch target tối thiểu 44px - 48px.
  - Admin cards: xếp 1 cột trên màn hình di động, bảng dữ liệu hỗ trợ cuộn ngang an toàn nếu có nội dung rộng.

- [ ] **Step 4: Kiểm tra build production**
  - Run: `npm run build`
  - Expected: PASS

- [ ] **Step 5: Commit Task 5**
  ```bash
  git add src/css/main.css
  git commit -m "style(responsive): optimize home, login, and admin views for mobile and tablet"
  ```

---

### Task 6: Tối ưu Responsive Trang Bản đồ GIS (`src/js/views/mapView.js`, `src/js/pages/mapPage.js`, `src/css/map.css`)

**Files:**
- Modify: `src/js/views/mapView.js:8-40`
- Modify: `src/js/pages/mapPage.js:20-60`
- Modify: `src/css/map.css:940-975`

**Interfaces:**
- Consumes: Bản đồ Leaflet instance `map`, aside `.panel`.
- Produces:
  - Thanh chuyển đổi tab di động `.map-mobile-tabs` (Tab "Bản đồ" vs Tab "Lộ trình & Tra cứu") chỉ hiển thị khi màn hình <= 920px.
  - Hàm chuyển tab kích hoạt `map.invalidateSize()` để vẽ lại bản đồ Leaflet trơn tru không bị trắng khung hình.
  - Leaflet custom road popup co giãn tối đa `max-width: calc(100vw - 32px)` trên màn hình nhỏ.

- [ ] **Step 1: Bổ sung thanh Mobile Tabs vào `src/js/views/mapView.js`**
  - Thêm thẻ `<div class="map-mobile-tabs" role="tablist">...</div>` với 2 nút: "Bản đồ giao thông" và "Chỉ đường & Lớp phủ".

- [ ] **Step 2: Viết CSS cho Mobile Tabs và Layout trong `src/css/map.css`**
  - Ẩn `.map-mobile-tabs` trên màn hình desktop (> 920px).
  - Trên màn hình di động (<= 920px): cố định thanh tab trên cùng hoặc dưới cùng, thiết lập ẩn/hiện `.map-area` và `.panel` tương ứng theo tab đang chọn, hoặc mở rộng chiều cao toàn màn hình cho bản đồ (`height: calc(100vh - 110px)`).
  - Điều chỉnh `.leaflet-road-popup` giới hạn chiều ngang vừa khít màn hình điện thoại.

- [ ] **Step 3: Bổ sung logic lắng nghe click Mobile Tabs trong `src/js/pages/mapPage.js`**
  - Lắng nghe click chuyển tab: thêm class `active` cho tab, chuyển view giữa bản đồ và panel, gọi `setTimeout(() => map.invalidateSize(), 100)`.

- [ ] **Step 4: Kiểm tra build production**
  - Run: `npm run build`
  - Expected: PASS

- [ ] **Step 5: Commit Task 6**
  ```bash
  git add src/js/views/mapView.js src/js/pages/mapPage.js src/css/map.css
  git commit -m "feat(map): add mobile tab switcher and optimize leaflet layout for small screens"
  ```

---

### Task 7: Kiểm thử Tổng thể & Xác minh Hoạt động

**Files:**
- All modified and created files.

- [ ] **Step 1: Chạy toàn bộ Unit Tests**
  - Run: `npm test`
  - Expected: PASS 100% tests.

- [ ] **Step 2: Chạy Production Build**
  - Run: `npm run build`
  - Expected: PASS không có cảnh báo hay lỗi.

- [ ] **Step 3: Kiểm tra tích hợp qua kiểm tra cú pháp và liên kết**
  - Kiểm tra các import giữa các module, đảm bảo không có circular dependencies hoặc biến undefined.

- [ ] **Step 4: Commit hoàn tất**
  ```bash
  git commit --allow-empty -m "chore: complete draggable chatbot and responsive design verification"
  ```
