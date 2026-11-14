# Map Road Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hiển thị thông tin chi tiết đoạn đường bằng Leaflet Custom Popup ngay cạnh tuyến đường trên bản đồ khi click hoặc tìm kiếm, thay thế khối chi tiết tĩnh dưới form tra cứu ở thanh bên phải.

**Architecture:** Sử dụng `L.popup` của Leaflet neo vào vị trí click (`e.latlng`) hoặc tâm tuyến đường (`bounds.getCenter()`). Tùy biến toàn bộ CSS của popup theo phong cách modern UI (border-radius, shadow, badge màu trạng thái, segment list cuộn mượt). Xóa khối `#detail` dư thừa trong thanh bên để tối ưu không gian hiển thị.

**Tech Stack:** JavaScript (ES6+ Modules), Leaflet.js 1.9.4, Chart.js, CSS3 Custom Properties, Vite 8

**Spec:** `docs/superpowers/specs/2026-11-14-map-road-popup-design.md`

## Global Constraints
- Không làm ảnh hưởng đến các chức năng định tuyến OSRM, tính vận tốc, hoặc biểu đồ Chart.js.
- Kích thước popup: `min-width: 280px`, `max-width: 360px`, danh sách phân đoạn giới hạn `max-height: 160px` có thanh cuộn.
- Đảm bảo dọn dẹp popup (`activeRoadPopup.remove()`) khi unmount trang để tránh memory leak.
- Chạy `npm run build` thành công không phát sinh cảnh báo hay lỗi cú pháp.

## Review Focus
- Click trên polyline tuyến đường mở popup chính xác tại tọa độ `e.latlng`.
- Chọn kết quả tìm kiếm tuyến đường mở popup tại tâm `bounds.getCenter()` của tuyến đường.
- Nút "Xem biểu đồ tốc độ" trong popup mở đúng modal biểu đồ phân đoạn Chart.js hiện tại.
- Đóng popup và unmount component an toàn, không có lỗi runtime.
- Không còn khối `#detail` chiếm diện tích ở sidebar bên phải.

---

### Task 1: Thiết kế CSS cho Leaflet Custom Road Popup

**Files:**
- Modify: `src/css/map.css:520-560`

**Interfaces:**
- Consumes: CSS variables trong `src/css/map.css` (`--primary`, `--border`, `--text`, `--text-muted`, `--surface-subtle`, `--radius-md`, `--shadow-lg`).
- Produces: Class `.leaflet-road-popup` cùng các class con (`.road-popup-header`, `.road-popup-badge`, `.road-popup-stats`, `.road-popup-segments`, `.road-popup-chart-btn`).

- [ ] **Step 1: Viết quy tắc CSS cho `.leaflet-road-popup` trong `src/css/map.css`**
  - Ghi đè `.leaflet-road-popup .leaflet-popup-content-wrapper` với bo góc `12px`, padding `14px`, viền `1px solid var(--border)`, shadow nổi bật.
  - Ghi đè `.leaflet-road-popup .leaflet-popup-content` với `margin: 0; width: 100% !important`.
  - Ghi đè `.leaflet-road-popup .leaflet-popup-tip` đồng bộ viền và nền.
  - Thêm style cho header: Tên đường cỡ 15px bold, badge trạng thái bo tròn với màu tương ứng.
  - Thêm style cho thống kê: Grid 2 cột nền xám nhẹ `#f8fafc`, hiển thị Vận tốc trung bình và Chiều dài.
  - Thêm style cho danh sách phân đoạn: Danh sách các đoạn có chấm tròn màu, tên đoạn, khoảng cách, tốc độ, có `max-height: 150px` và `overflow-y: auto`.
  - Thêm style cho nút "Xem biểu đồ tốc độ" full width, màu primary, hover mượt.
  - Thêm style cho nút đóng popup `.leaflet-popup-close-button`.

- [ ] **Step 2: Kiểm tra cú pháp CSS bằng lệnh build**
  Run: `npm run build`
  Expected: PASS

- [ ] **Step 3: Commit Task 1**
  ```bash
  git add src/css/map.css
  git commit -m "style: add custom styling for leaflet road popup"
  ```

---

### Task 2: Dọn dẹp View Template

**Files:**
- Modify: `src/js/views/mapView.js:185-195`

**Interfaces:**
- Consumes: Template HTML từ `renderMapView()`.
- Produces: Chuỗi HTML sạch không còn thẻ `<div class="detail" id="detail" hidden></div>`.

- [ ] **Step 1: Xóa khối `#detail` khỏi `src/js/views/mapView.js`**
  - Mở `src/js/views/mapView.js`, xóa dòng `<div class="detail" id="detail" hidden></div>`.

- [ ] **Step 2: Kiểm tra build**
  Run: `npm run build`
  Expected: PASS

- [ ] **Step 3: Commit Task 2**
  ```bash
  git add src/js/views/mapView.js
  git commit -m "refactor: remove static detail container from map sidebar view"
  ```

---

### Task 3: Triển khai Popup Logic trên Bản đồ

**Files:**
- Modify: `src/js/pages/mapPage.js`

**Interfaces:**
- Consumes: `entry` (corridor data), `e.latlng` từ Leaflet click event.
- Produces: Hàm `openCorridorPopup(entry, latlng)`, sự kiện click polyline, sự kiện click kết quả tìm kiếm.

- [ ] **Step 1: Thêm biến quản lý `activeRoadPopup` và hàm `renderCorridorPopupContent(entry)`**
  - Khởi tạo `let activeRoadPopup = null;` ở đầu scope `initMapPage()`.
  - Viết hàm `renderCorridorPopupContent(entry)` trả về chuỗi HTML chuẩn:
    - Tiêu đề trục đường.
    - Huy hiệu mức độ lưu thông + màu.
    - Thống kê vận tốc trung bình và tổng chiều dài.
    - Danh sách phân đoạn rút gọn với dot màu và vận tốc từng đoạn.
    - Nút bấm `<button type="button" class="road-popup-chart-btn" id="popup-chart-trigger">Xem biểu đồ vận tốc</button>`.

- [ ] **Step 2: Viết hàm `openCorridorPopup(entry, latlng)`**
  - Đóng popup cũ nếu có: `if (activeRoadPopup) { activeRoadPopup.remove(); activeRoadPopup = null; }`.
  - Tạo `activeRoadPopup = L.popup({ className: "leaflet-road-popup", maxWidth: 360, minWidth: 280, autoPan: true, autoPanPadding: [20, 20] })`.
  - Gán vị trí `activeRoadPopup.setLatLng(latlng)`.
  - Gán nội dung `activeRoadPopup.setContent(renderCorridorPopupContent(entry))`.
  - Mở trên bản đồ `activeRoadPopup.openOn(map)`.
  - Lắng nghe sự kiện click trên nút `#popup-chart-trigger`: khi click sẽ gọi `updatePopupContent(entry)` và `showChartPage()`, sau đó mở modal popup (`popupOverlay.hidden = false`).
  - Đồng bộ `updatePopupContent(entry)`.

- [ ] **Step 3: Cập nhật sự kiện click polyline trong `bindCorridorEvents(entry)`**
  - Thay đổi `group.on("click", () => showCorridorDetail(entry))` thành `group.on("click", (e) => openCorridorPopup(entry, e.latlng))`.

- [ ] **Step 4: Cập nhật sự kiện tìm kiếm tuyến đường**
  - Khi người dùng click vào một item trong `searchResultsUl`:
    ```javascript
    const bounds = L.featureGroup(item.segmentLayers).getBounds();
    map.fitBounds(bounds, { padding: [40, 40] });
    openCorridorPopup(item, bounds.getCenter());
    ```
  - Cập nhật cả trường hợp auto-select kết quả đầu tiên của tìm kiếm (`openCorridorPopup(matched[0], bounds.getCenter())`).

- [ ] **Step 5: Dọn dẹp popup khi unmount trong `mapPage.unmount()`**
  - Thêm `if (activeRoadPopup) { try { activeRoadPopup.remove(); } catch {} activeRoadPopup = null; }`.
  - Dọn dẹp/xóa bỏ hàm cũ `showCorridorDetail()` không còn dùng đến.

- [ ] **Step 6: Kiểm tra build**
  Run: `npm run build`
  Expected: PASS

- [ ] **Step 7: Commit Task 3**
  ```bash
  git add src/js/pages/mapPage.js
  git commit -m "feat: implement leaflet road popup on line click and search selection"
  ```

---

### Task 4: Kiểm thử toàn diện & Hoàn thiện

**Files:**
- Verify: `src/js/pages/mapPage.js`, `src/js/views/mapView.js`, `src/css/map.css`

- [ ] **Step 1: Chạy Vite build kiểm tra bundle cuối cùng**
  Run: `npm run build`
  Expected: 0 errors, build thành công bundle.

- [ ] **Step 2: Kiểm tra git status & diff**
  Run: `git status` và `git diff`
  Expected: Mã nguồn gọn gàng, không có code thừa hay biến chưa dùng.

- [ ] **Step 3: Commit hoàn tất nếu có thay đổi bổ sung**
