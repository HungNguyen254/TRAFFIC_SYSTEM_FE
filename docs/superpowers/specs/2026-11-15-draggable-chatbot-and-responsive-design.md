# Thiết kế Kỹ thuật: Floating Draggable AI Chatbot & Tối ưu Responsive Toàn diện Đa Thiết bị

## 1. Tổng quan & Mục đích (Intent & Why)
- **Mục đích:**
  1. Cung cấp một trợ lý ảo thông minh (AI Chatbot) trực quan dưới dạng biểu tượng nổi (Floating Action Button - FAB) có khả năng **kéo thả tự do trên toàn bộ màn hình** và mở ra giao diện hội thoại tương tác thời gian thực về tình trạng giao thông Hà Nội.
  2. Tối ưu hóa giao diện **Responsive toàn diện** cho toàn bộ website (Trang chủ, Bản đồ GIS, Đăng nhập, Quản trị) trên mọi kích thước thiết bị: Điện thoại thông minh (Mobile), Máy tính bảng (Tablet) và Màn hình máy tính (Desktop/Laptop).
  3. Cấu trúc mô hình dữ liệu Chatbot ở Frontend tương thích với đặc tả Backend FastAPI (`/home/PageNguyen/Projects/BE`), chuẩn hóa schema payload `{"content": "...", "timestamp": "..."}` và sẵn sàng cho việc tích hợp Backend E2E API khi cần.
- **Tại sao cần làm:**
  - Người tham gia giao thông thường xuyên truy cập hệ thống qua điện thoại di động khi đang di chuyển. Website cần thao tác cảm ứng dễ dàng, không bị tràn ngang hoặc vỡ bố cục.
  - Chatbot nổi kéo thả cho phép người dùng tự do di chuyển icon đến vị trí không che khuất bản đồ hay nội dung quan sát, đồng thời tra cứu nhanh chóng mọi lúc mọi nơi.

---

## 2. Mục tiêu, Phi mục tiêu & Ranh giới (Goals, Non-Goals, Anti-Goals)

### Mục tiêu (Goals):
- **Floating Draggable Chatbot Widget:**
  - Biểu tượng nổi hỗ trợ kéo thả tự do (Pointer Events: chuột, cảm ứng touch di động, bút stylus).
  - Phân biệt chính xác giữa hành vi **kéo (drag)** và **nhấn (click)**: di chuyển > 6px sẽ coi là kéo thả và không kích hoạt mở cửa sổ chat.
  - Tự động giới hạn tọa độ trong phạm vi màn hình hiển thị (`window.innerWidth`, `window.innerHeight`), không để nút bị lọt ra ngoài.
  - Lưu vị trí kéo thả cuối cùng vào `localStorage` (`traffic_chatbot_pos`) để duy trì vị trí khi người dùng chuyển trang hoặc tải lại trang.
  - Cửa sổ chat tương tác đầy đủ: bong bóng chat, gợi ý câu hỏi nhanh (Quick pills), hiệu ứng gõ phím (typing indicator), xóa lịch sử trò chuyện.
  - **Trợ lý AI Client-Side thông minh tích hợp dữ liệu thời gian thực (Phương án 1):**
    - Trả lời trực tiếp về các điểm ùn tắc theo thời gian thực dựa trên `fetchEdges()` (phân tích mức độ 3 & 4: Nguyễn Trãi, Vành Đai 3, Cầu Giấy, Kim Mã, v.v.).
    - Dự báo giờ cao điểm (sáng 7h00 - 9h00, chiều 16h30 - 19h00), vận tốc trung bình toàn mạng, mẹo chọn khung giờ khởi hành.
    - Tư vấn lộ trình bằng văn bản kèm các **Nút hành động nhanh (Action Buttons)**: bấm vào tự động điều hướng đến Trang Bản đồ (`/map`) hoặc bộ lọc tương ứng.
    - Chuẩn hóa cấu trúc tin nhắn theo chuẩn của Backend (`{ content: string, timestamp: string, role: "user" | "model" }`).
  - Đặt ở cấp độ toàn cục (`src/js/main.js`), hoạt động xuyên suốt mọi route (`/`, `/map`, `/login`, `/admin`).
- **Responsive Toàn diện Đa Thiết bị (Mobile / Tablet / Desktop):**
  - **Header:** Bổ sung Mobile Hamburger Menu & Drawer navigation trượt mở mượt mà khi màn hình < 768px.
  - **Trang chủ (`/`):** Tối ưu Hero section, lưới thống kê, danh sách điểm nóng, và biểu đồ Chart.js tự động co giãn 100% không tràn màn hình.
  - **Trang Bản đồ (`/map`):** Tối ưu bố cục trên di động: hỗ trợ thanh điều hướng chuyển đổi linh hoạt (Tab Bar / Toggle) giữa Bản đồ và Bảng lộ trình, popup chi tiết tuyến đường thân thiện với cảm ứng.
  - **Trang Đăng nhập (`/login`) & Quản trị (`/admin`):** Căn chỉnh touch target tối thiểu 44px, lưới card tự chuyển về 1 cột trên màn hình nhỏ.
  - Chống tràn ngang toàn trang (`overflow-x: hidden`).

### Phi mục tiêu (Non-Goals):
- Thay đổi cấu trúc cơ sở dữ liệu backend hoặc thuật toán định tuyến OSRM.
- Bắt buộc thực hiện ngay handshake mật mã E2E phức tạp (X25519/PBKDF2) ở đợt này; thay vào đó thiết kế tầng adapter sẵn sàng để plug-in khi Backend hoàn tất đồng bộ khóa.

### Ranh giới nghiêm ngặt (Anti-Goals):
- Tuyệt đối không để icon chatbot che lấp các nút điều khiển quan trọng của bản đồ mà không thể di chuyển đi nơi khác.
- Không để xảy ra tình trạng cuộn ngang ngoài ý muốn (horizontal scrollbar) trên bất kỳ kích thước màn hình nào từ 320px trở lên.
- Không làm gãy giao diện bản đồ Leaflet hay làm vỡ tỷ lệ biểu đồ Chart.js khi xoay màn hình (orientation change).

---

## 3. Kiến trúc Backend Chatbot API đối chiếu từ `@BE`

Từ khảo sát mã nguồn `/home/PageNguyen/Projects/BE/app/api/v1/endpoints/chat.py` và `app/schemas/chat.py`:
- Backend triển khai các endpoint:
  1. `GET /api/v1/chat/user-salt`: Cấp `encryption_salt` và `server_public_key` (X25519).
  2. `POST /api/v1/chat/handshake`: Bắt tay trao đổi khóa ECDH tạo phiên `session_id`.
  3. `POST /api/v1/chat/message`: Gửi tin nhắn mã hóa (AES-256-GCM), server gọi Google Gemini (`gemini-2.5-flash`) và phản hồi ciphertext.
  4. `GET /api/v1/chat/sessions`: Danh sách các phiên trò chuyện.
  5. `GET /api/v1/chat/sessions/{session_id}/messages`: Lịch sử tin nhắn theo phiên.
  6. `DELETE /api/v1/chat/sessions/{session_id}`: Xóa phiên chat.
- Chuẩn định dạng tin nhắn nội bộ (Inner Decrypted Payload):
  ```json
  {
    "content": "Nội dung câu hỏi hoặc phản hồi từ trợ lý",
    "timestamp": "2026-11-15T10:30:00Z"
  }
  ```
- **Quyết định thiết kế FE:** Frontend tuân thủ cấu trúc dữ liệu trên (`content`, `timestamp`, `role`), lưu trữ lịch sử hội thoại cục bộ vào `localStorage` (`traffic_chatbot_history`), và cấu trúc module `chatService.js` theo dạng Strategy/Adapter để khi bật backend, chỉ cần cắm hàm gọi API mà không cần sửa giao diện.

---

## 4. Chi tiết Thiết kế Kỹ thuật (Implementation Details)

### 4.1. Cấu trúc Tệp tin Mới & Sửa đổi
1. **Tạo mới:**
   - `src/js/services/chatService.js`: Bộ não trí tuệ nhân tạo giao thông (Traffic Intelligence Service): nạp dữ liệu từ `fetchEdges()`, xử lý ngôn ngữ tự nhiên cơ bản, nhận diện ý định (intent detection: tắc đường, giờ cao điểm, lộ trình, quy định, tốc độ mạng), sinh câu trả lời giàu thông tin và trả về các action buttons.
   - `src/js/components/chatbot.js`: Component quản lý DOM, xử lý sự kiện kéo thả (Pointer Events), hiển thị bong bóng tin nhắn, quick pills, auto-scroll và mobile modal.
   - `src/css/chatbot.css`: Định kiểu CSS cho FAB icon, animation pulse, hiệu ứng drag, cửa sổ chat, scrollbar, quick pills, và responsive bottom-sheet.
2. **Sửa đổi:**
   - `src/js/main.js`: Nhập và khởi tạo `initChatbot()` sau khi DOM sẵn sàng.
   - `src/js/components/header.js`: Bổ sung nút bấm Hamburger button và hỗ trợ toggle mobile navigation.
   - `src/css/main.css`: Bổ sung CSS cho Mobile Header Drawer, tối ưu media queries cho Hero, Stats, Grid, Footer, Login và Admin.
   - `src/css/map.css`: Bổ sung CSS cho Mobile Map View (Tab toggle, responsive layout cho bản đồ và aside panel).
   - `src/js/views/mapView.js` & `src/js/pages/mapPage.js`: Bổ sung thanh chuyển đổi giao diện di động (Mobile Tab Bar) giữa "Bản đồ" và "Lộ trình" khi màn hình < 920px.

### 4.2. Chi tiết Cơ chế Kéo thả (Draggable Mechanics)
- Tọa độ lưu trữ: `x` (left), `y` (top).
- `pointerdown`:
  - Lưu `startX = e.clientX`, `startY = e.clientY`.
  - Ghi nhận `initialLeft`, `initialTop` từ `getBoundingClientRect()`.
  - Gọi `e.target.setPointerCapture(e.pointerId)`.
  - Đặt cờ `isPointerDown = true`, `hasDragged = false`.
- `pointermove`:
  - Nếu `!isPointerDown` return.
  - Tính độ dời `dx = e.clientX - startX`, `dy = e.clientY - startY`.
  - Nếu `Math.hypot(dx, dy) > 6`, xác nhận `hasDragged = true`.
  - Thêm class `dragging` (tăng bóng đổ, đổi cursor `grabbing`).
  - Tính tọa độ mới:
    - `nextLeft = clamp(initialLeft + dx, 12, window.innerWidth - btnWidth - 12)`
    - `nextTop = clamp(initialTop + dy, 12, window.innerHeight - btnHeight - 12)`
  - Cập nhật trực tiếp `fab.style.left = nextLeft + 'px'`, `fab.style.top = nextTop + 'px'`.
- `pointerup` & `pointercancel`:
  - Hủy capture: `e.target.releasePointerCapture(e.pointerId)`.
  - Xóa class `dragging`.
  - Nếu `hasDragged`: lưu `{ left: nextLeft, top: nextTop }` vào `localStorage`, không kích hoạt mở cửa sổ chat.
  - Nếu `!hasDragged`: đảo ngược trạng thái hiển thị của Chat Window (`open = !open`).

### 4.3. Cửa sổ Hội thoại Chatbot & Xử lý Thông minh
- **Header:**
  - Tiêu đề: "Trợ lý Giao thông AI Hà Nội"
  - Trạng thái: "Trực tuyến • Dữ liệu thời gian thực" kèm chấm xanh pulse.
  - Nút Xóa lịch sử (Clear) và Nút Đóng (Minimize/Close).
- **Quick Pills (Gợi ý câu hỏi nhanh):**
  - "Tuyến đường nào đang tắc nhất?"
  - "Dự báo giờ cao điểm hôm nay"
  - "Tốc độ trung bình toàn mạng"
  - "Mẹo di chuyển đường Nguyễn Trãi"
- **Tin nhắn & Nút Hành động (Action Buttons):**
  - Phân tích câu hỏi: Nếu hỏi về tắc đường, gọi `fetchEdges()` để lọc danh sách các đoạn đường có mức độ ùn tắc >= 2 và >= 3.
  - Đính kèm nút hành động `[ Xem bản đồ trực tiếp ]` -> Khi người dùng click, tự động gọi `navigateTo('/map')` và đóng cửa sổ chat trên mobile.

### 4.4. Tối ưu Responsive Toàn bộ Website
1. **Mobile Header & Drawer (< 768px):**
   - Hamburger button 3 gạch chuyển động mềm mại thành chữ X.
   - Menu drawer trượt xuống từ header với nền kính mờ `rgba(255, 255, 255, 0.98)` và viền dưới tinh tế.
   - Tự động đóng menu khi click vào bất kỳ liên kết nào hoặc click ra ngoài.
2. **Trang Bản đồ trên Mobile (< 920px):**
   - Bổ sung Mobile Tab Selector phía trên: `[ 🗺️ Bản đồ ]` và `[ 🧭 Lộ trình & Tìm kiếm ]`.
   - Giúp người dùng chuyển đổi toàn màn hình giữa Bản đồ và Bảng tìm đường thay vì bị chia đôi 50vh gò bó.
   - Popup chi tiết đường Leaflet giới hạn `max-width: calc(100vw - 32px)` và có thể cuộn danh sách phân đoạn tốc độ.
3. **Trang chủ, Đăng nhập & Quản trị (< 860px và < 640px):**
   - Hero title sử dụng `font-size: clamp(24px, 5vw, 42px)`.
   - Hero buttons xếp dọc đầy đủ chiều ngang trên mobile.
   - Hero stats chuyển sang hiển thị lưới 1 cột trên mobile nhỏ, 3 cột trên tablet.
   - Form inputs và buttons có chiều cao tối thiểu 44px - 48px đảm bảo chuẩn công thái học ngón tay.
   - Thêm quy tắc chống tràn ngang toàn trang:
     ```css
     html, body {
       max-width: 100%;
       overflow-x: hidden;
     }
     ```

---

## 5. Phân công cho Builder (What's Left to the Builder)
- Tự thiết kế bộ icon SVG nội tuyến (Robot AI, Hamburger, Close, Send, Trash, Map Pin) để giao diện độc lập hoàn toàn, không phụ thuộc font bên ngoài.
- Kiểm tra toàn diện trên các kích thước màn hình tiêu chuẩn: Mobile 375px/390px/412px, Tablet 768px/820px, Desktop >= 1024px.
- Đảm bảo bản build production `npm run build` thành công 100%.
