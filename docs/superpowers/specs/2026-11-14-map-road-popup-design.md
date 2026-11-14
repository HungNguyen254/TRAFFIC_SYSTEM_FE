# Thiết kế: Chuyển bảng chi tiết đoạn đường sang Leaflet Popup trên bản đồ

## 1. Mục tiêu (Intent & Goals)
- **Mục tiêu:** Khi người dùng click vào một tuyến đường trên bản đồ giao thông (hoặc chọn từ kết quả tìm kiếm), hiển thị bảng thông tin chi tiết (popup card) ngay cạnh vị trí tuyến đường đó trên bản đồ thay vì hiển thị ở khối `#detail` phía dưới khu vực tra cứu ở sidebar bên phải.
- **Lợi ích:**
  - Tăng tính trực quan: Người dùng tương tác trực tiếp trên bản đồ và nhận phản hồi ngay tại vị trí tuyến đường đang quan sát.
  - Tối ưu không gian sidebar: Thanh điều khiển bên phải không bị kéo dài bất tiện, giữ cho chức năng chỉ đường và tra cứu luôn tập trung, gọn gàng.

## 2. Non-goals & Anti-goals
- **Non-goals:** Không thay đổi logic tính toán khoảng cách/vận tốc, OSRM routing, hay cấu trúc API backend.
- **Anti-goals:** 
  - Tránh để popup quá lớn gây che lấp bản đồ trên thiết bị di động (cần giới hạn kích thước tối đa và hỗ trợ cuộn).
  - Không phá vỡ chức năng xem biểu đồ phân đoạn tốc độ hiện có.

## 3. Các phương án đã xem xét & Lựa chọn
- **Phương án 1 (Đã chọn): Leaflet Custom Popup neo trực tiếp vào tuyến đường.**
  - Ưu điểm: Tự động di chuyển theo bản đồ khi zoom/pan, mũi tên trỏ chính xác vào vị trí click, đóng mở tự nhiên theo chuẩn Leaflet.
- **Phương án 2: Floating Card ở góc bản đồ.**
  - Nhược điểm: Không gắn kết trực tiếp với đoạn đường vừa click, dễ che khuất các nút điều khiển bản đồ.

## 4. Chi tiết kỹ thuật (Implementation Details)

### 4.1. Giao diện & CSS (`src/css/map.css`)
- Tùy biến `.leaflet-road-popup` (ghi đè style mặc định của Leaflet popup):
  - `.leaflet-popup-content-wrapper`: Bo góc mềm mại (`12px`), nền `#ffffff`, viền nhẹ `1px solid var(--border)`, bóng đổ `box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)`.
  - `.leaflet-popup-tip`: Đồng bộ màu nền và viền.
  - `.leaflet-popup-content`: Padding hợp lý, chữ sắc nét, font chữ hệ thống đồng bộ.
  - Nút đóng `.leaflet-popup-close-button` được tinh chỉnh gọn gàng, tương phản tốt.
  - Vùng danh sách các phân đoạn: Giới hạn chiều cao tối đa (`max-height: 160px`), cuộn mượt mà (`overflow-y: auto`).

### 4.2. Cấu trúc HTML Popup
Nội dung HTML sinh ra cho Popup gồm:
- **Tiêu đề:** Tên trục đường kèm huy hiệu (badge) tốc độ trung bình và trạng thái giao thông.
- **Thông số chính:** Vận tốc trung bình (km/h), Tổng chiều dài (km), Tốc độ tối đa cho phép (nếu có).
- **Danh sách phân đoạn:** Hiển thị tối đa các đoạn con với chấm tròn màu theo mức độ ùn tắc, tên đường, chiều dài và tốc độ từng đoạn.
- **Nút hành động:** Nút "Xem biểu đồ tốc độ" mở trực tiếp modal biểu đồ Chart.js phân đoạn.

### 4.3. Logic JavaScript (`src/js/pages/mapPage.js` & `src/js/views/mapView.js`)
- Trong `src/js/views/mapView.js`: Xóa bỏ thẻ `<div class="detail" id="detail" hidden></div>` khỏi aside panel.
- Trong `src/js/pages/mapPage.js`:
  - Khởi tạo và quản lý một instance `activeRoadPopup`.
  - Cập nhật `bindCorridorEvents(entry)`: Lắng nghe sự kiện `click` nhận `event` (`e.latlng`) để gọi `openCorridorPopup(entry, e.latlng)`.
  - Trong sự kiện click của danh sách tìm kiếm `roadSearchForm`: Gọi `openCorridorPopup(item, bounds.getCenter())` sau khi `map.fitBounds()`.
  - Bắt sự kiện click vào nút "Xem biểu đồ" bên trong popup để mở modal `showChartPage()`.
