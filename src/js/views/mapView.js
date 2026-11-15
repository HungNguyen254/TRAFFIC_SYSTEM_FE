// File: src/js/views/mapView.js

/**
 * Template HTML Trang Bản đồ giao thông phong cách tối giản, phi biểu tượng (No-Icon Swiss/Modern GIS)
 * @returns {string} HTML string
 */
export function renderMapView() {
  return `
    <div class="layout">
      <!-- ===== KHU BẢN ĐỒ ===== -->
      <section class="map-area" aria-label="Bản đồ giao thông thời gian thực">
        <div id="map-canvas"></div>

        <!-- Lớp phủ hiển thị trạng thái đang tải / lỗi -->
        <div
          id="status-overlay"
          class="status-overlay"
          role="status"
          aria-live="polite"
        >
          <div class="spinner" id="spinner"></div>
          <p id="status-text">Đang kết nối và tải bản đồ giao thông Hà Nội…</p>
          <button class="btn-secondary" id="retry-btn" type="button" hidden>
            Thử tải lại
          </button>
        </div>

        <!-- Cảnh báo nhỏ khi ảnh bản đồ không tải được -->
        <div id="tile-warning" class="tile-warning" role="alert" hidden>
          Lỗi kết nối ảnh nền bản đồ. Hãy kiểm tra kết nối mạng của bạn.
        </div>
      </section>

      <!-- ===== PANEL THÔNG TIN ===== -->
      <aside class="panel" aria-label="Bảng điều khiển giao thông">
        <div class="panel-header">
          <div class="section-eyebrow">ĐIỀU HƯỚNG GIS</div>
          <h1>Bản đồ & Lộ trình</h1>
        </div>

        <!-- FORM CHỈ ĐƯỜNG THÔNG MINH -->
        <form class="route-form" id="route-form">
          <div class="route-form-title">TÌM ĐƯỜNG THEO VẬN TỐC</div>

          <div class="route-inputs-container">
            <label class="time-label" for="route-origin">Điểm khởi hành</label>
            <input
              id="route-origin"
              name="origin"
              type="search"
              placeholder="Ví dụ: Bến xe Mỹ Đình, Cầu Giấy..."
              required
            />

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
              <label class="time-label" for="route-destination" style="margin: 0;">Điểm đến</label>
              <button
                class="route-swap-text"
                id="route-swap"
                type="button"
                aria-label="Đổi điểm đi và điểm đến"
                title="Đổi điểm đi và điểm đến"
              >
                Đổi chiều
              </button>
            </div>

            <div class="route-destination-controls">
              <input
                id="route-destination"
                name="destination"
                type="search"
                placeholder="Ví dụ: Hồ Hoàn Kiếm, Ngã Tư Sở..."
                required
              />
            </div>
          </div>

          <label class="time-label" for="route-vehicle">Phương tiện di chuyển</label>
          <select id="route-vehicle" name="vehicle">
            <option value="car">Ô tô</option>
            <option value="motorcycle">Xe máy</option>
            <option value="bicycle">Xe đạp</option>
            <option value="bus">Xe buýt</option>
          </select>

          <div class="route-actions">
            <button
              class="btn-secondary route-submit"
              id="route-submit"
              type="submit"
            >
              Vẽ tuyến đường
            </button>
            <button class="route-cancel" id="route-cancel" type="button" hidden>
              Hủy tuyến
            </button>
          </div>

          <p
            class="route-status"
            id="route-status"
            role="status"
            aria-live="polite"
          >
            Nhập điểm đi và điểm đến tại Hà Nội để tính lộ trình tối ưu.
          </p>

          <div
            class="route-summary"
            id="route-summary"
            aria-live="polite"
            hidden
          >
            <p>
              <span>Quãng đường:</span>
              <strong id="route-distance">--</strong>
            </p>
            <p>
              <span>Thời gian ước tính:</span>
              <strong id="route-duration">--</strong>
            </p>
            <small id="route-estimate-note">
              Thời gian tính theo độ dài chia vận tốc thực tế từng đoạn; tốc độ được cân chỉnh theo loại phương tiện.
            </small>
          </div>
        </form>

        <!-- TRA CỨU ĐOẠN ĐƯỜNG TRÊN BẢN ĐỒ -->
        <form class="road-search" id="road-search">
          <label class="time-label" for="road-query">Tra cứu tuyến đường hoặc địa danh</label>
          <div class="road-search-controls">
            <input
              id="road-query"
              name="query"
              type="search"
              placeholder="Ví dụ: Nguyễn Trãi, Tây Sơn, Láng..."
              required
            />
            <button class="btn-secondary" id="search-btn" type="submit">
              Tìm kiếm
            </button>
          </div>
        </form>

        <!-- CHÚ GIẢI MỨC ĐỘ GIAO THÔNG -->
        <section class="traffic-legend" aria-labelledby="traffic-legend-title">
          <h2 id="traffic-legend-title">Mức độ lưu thông theo màu</h2>
          <ul>
            <li>
              <span class="traffic-color green"></span>
              <span>Thông thoáng <small>(từ 35 km/h)</small></span>
            </li>
            <li>
              <span class="traffic-color yellow"></span>
              <span>Di chuyển chậm <small>(25–35 km/h)</small></span>
            </li>
            <li>
              <span class="traffic-color red"></span>
              <span>Ùn tắc nghiêm trọng <small>(15–25 km/h)</small></span>
            </li>
            <li>
              <span class="traffic-color darkred"></span>
              <span>Kẹt xe hoàn toàn <small>(dưới 5 km/h)</small></span>
            </li>
            <li>
              <span class="traffic-color no-data"></span>
              <span>Không có dữ liệu</span>
            </li>
          </ul>
        </section>

        <p class="search-attribution">
          Bản đồ: OpenStreetMap contributors · Định tuyến: OSRM
        </p>

        <p
          class="search-status"
          id="search-status"
          role="status"
          aria-live="polite"
        >
          Nhập tên đường để tìm và chọn một vị trí.
        </p>

        <ul
          class="search-results"
          id="search-results"
          aria-label="Kết quả tìm kiếm"
        ></ul>

        <div class="detail" id="detail" hidden></div>
      </aside>
    </div>

    <!-- ===== NÚT BẬT POPUP THÔNG TIN ĐƯỜNG ===== -->
    <button
      class="popup-toggle-btn"
      id="popup-toggle-btn"
      type="button"
      title="Xem chi tiết & biểu đồ vận tốc"
    >
      Dữ liệu & Biểu đồ tốc độ
    </button>

    <!-- ===== ROAD INFO POPUP MODAL ===== -->
    <div class="popup-overlay" id="popup-overlay" hidden>
      <div class="popup-box" id="popup-box">
        <!-- Close button -->
        <button
          class="popup-close-text"
          id="popup-close"
          type="button"
          title="Đóng cửa sổ"
          aria-label="Đóng"
        >
          Đóng
        </button>

        <!-- PAGE 1: Road information -->
        <div class="popup-page" id="popup-info-page">
          <div class="section-eyebrow">DỮ LIỆU ĐOẠN ĐƯỜNG</div>
          <h2 class="popup-title" id="popup-road-name">
            -- Chọn một tuyến đường trên bản đồ --
          </h2>
          <div class="popup-row">
            <span class="popup-label">Tốc độ trung bình:</span>
            <span class="popup-value" id="popup-avg-speed">-- km/h</span>
          </div>
          <div class="popup-row">
            <span class="popup-label">Mức độ lưu thông:</span>
            <span class="popup-value" id="popup-congestion-level">--</span>
          </div>
          <div class="popup-row">
            <span class="popup-label">Thời gian cập nhật:</span>
            <span class="popup-value" id="popup-update-time">--</span>
          </div>
          <button
            class="popup-chart-btn"
            id="popup-show-chart-btn"
            type="button"
          >
            Xem biểu đồ vận tốc phân đoạn
          </button>
        </div>

        <!-- PAGE 2: Chart.js chart -->
        <div class="popup-page" id="popup-chart-page" hidden>
          <button class="popup-back-btn" id="popup-back-btn" type="button">
            Quay lại thông tin
          </button>
          <h2 class="popup-title" id="popup-chart-title">Biểu đồ vận tốc theo từng đoạn</h2>
          <div class="popup-chart-wrap">
            <canvas id="popup-chart-canvas"></canvas>
          </div>
        </div>
      </div>
    </div>
  `;
}
