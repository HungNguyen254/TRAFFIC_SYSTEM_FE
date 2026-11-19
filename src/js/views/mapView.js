// File: src/js/views/mapView.js

/**
 * Template HTML Trang Bản đồ giao thông phong cách tối giản, phi biểu tượng (No-Icon Swiss/Modern GIS)
 * @returns {string} HTML string
 */
export function renderMapView() {
  return `
    <!-- Thanh chuyển đổi chế độ xem trên di động (Mobile Tab Switcher) -->
    <div class="map-mobile-tabs" id="map-mobile-tabs" role="tablist" aria-label="Chuyển chế độ xem di động">
      <button class="map-mobile-tab active" id="tab-show-map" role="tab" aria-selected="true" type="button">
        Bản đồ giao thông
      </button>
      <button class="map-mobile-tab" id="tab-show-panel" role="tab" aria-selected="false" type="button">
        Chỉ đường & Tra cứu
      </button>
    </div>

    <div class="layout view-map" id="map-layout">
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
            <div class="route-point-group">
              <label class="time-label" for="route-origin">Điểm khởi hành</label>
              <div class="route-place-field">
                <div class="route-place-controls">
                  <input
                    id="route-origin"
                    name="origin"
                    type="search"
                    placeholder="Ví dụ: Bến xe Mỹ Đình, Cầu Giấy..."
                    autocomplete="off"
                    minlength="3"
                    maxlength="200"
                    aria-autocomplete="list"
                    aria-expanded="false"
                    aria-controls="route-origin-suggestions"
                    required
                  />
                  <button
                    class="route-pick"
                    type="button"
                    data-route-point="origin"
                    aria-pressed="false"
                    aria-label="Chọn điểm đi trên bản đồ"
                    title="Chọn điểm đi trực tiếp trên bản đồ"
                  >
                    <span class="route-pick-icon" aria-hidden="true">A</span>
                  </button>
                </div>
                <ul
                  class="route-suggestions"
                  id="route-origin-suggestions"
                  role="listbox"
                  aria-label="Gợi ý điểm đi"
                  hidden
                ></ul>
              </div>
            </div>

            <button
              class="route-pick route-swap-text"
              id="route-swap"
              type="button"
              aria-label="Đổi điểm đi và điểm đến"
              title="Đổi điểm đi và điểm đến"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="22"
                height="22"
                fill="none"
                stroke="currentColor"
                stroke-width="2.25"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M8 17V5m-4 4 4-4 4 4M16 7v12m-4-4 4 4 4-4" />
              </svg>
            </button>

            <div class="route-point-group">
              <label class="time-label" for="route-destination">Điểm đến</label>
              <div class="route-place-field">
                <div class="route-place-controls">
                  <input
                    id="route-destination"
                    name="destination"
                    type="search"
                    placeholder="Ví dụ: Hồ Hoàn Kiếm, Ngã Tư Sở..."
                    autocomplete="off"
                    minlength="3"
                    maxlength="200"
                    aria-autocomplete="list"
                    aria-expanded="false"
                    aria-controls="route-destination-suggestions"
                    required
                  />
                  <button
                    class="route-pick"
                    type="button"
                    data-route-point="destination"
                    aria-pressed="false"
                    aria-label="Chọn điểm đến trên bản đồ"
                    title="Chọn điểm đến trực tiếp trên bản đồ"
                  >
                    <span class="route-pick-icon" aria-hidden="true">B</span>
                  </button>
                </div>
                <ul
                  class="route-suggestions"
                  id="route-destination-suggestions"
                  role="listbox"
                  aria-label="Gợi ý điểm đến"
                  hidden
                ></ul>
              </div>
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

        <section class="traffic-time-controls" aria-labelledby="traffic-time-title">
          <div class="traffic-time-heading">
            <h2 id="traffic-time-title">Tình trạng giao thông</h2>
            <span class="traffic-time-value" id="traffic-time-value">Hiện tại</span>
          </div>
          <div class="traffic-time-section-label">Theo giờ trong ngày</div>
          <div class="traffic-timeline">
            <button
              class="traffic-timeline-arrow"
              id="traffic-time-previous"
              type="button"
              aria-label="Lùi về mốc trước"
              disabled
            >&#8249;</button>
            <div class="traffic-timeline-slider">
              <input
                id="traffic-time-slider"
                type="range"
                min="0"
                max="24"
                step="1"
                value="0"
                aria-label="Chọn mốc thời gian giao thông"
                aria-valuetext="Hiện tại"
                disabled
              />
              <div class="traffic-timeline-endpoints" aria-hidden="true">
                <span>Hiện tại</span>
                <span>23:00</span>
              </div>
            </div>
            <button
              class="traffic-timeline-arrow"
              id="traffic-time-next"
              type="button"
              aria-label="Tiến tới mốc tiếp theo"
              disabled
            >&#8250;</button>
          </div>
          <div class="traffic-forecast">
            <div class="traffic-time-section-label">Dự báo nhanh</div>
            <div class="traffic-forecast-options" role="group" aria-label="Chọn thời gian dự báo">
              <button
                class="traffic-forecast-option"
                type="button"
                data-forecast-minutes="30"
                aria-pressed="false"
                disabled
              >
                <span class="traffic-forecast-offset">+30</span>
                <span class="traffic-forecast-unit">phút</span>
              </button>
              <button
                class="traffic-forecast-option"
                type="button"
                data-forecast-minutes="60"
                aria-pressed="false"
                disabled
              >
                <span class="traffic-forecast-offset">+60</span>
                <span class="traffic-forecast-unit">phút</span>
              </button>
            </div>
          </div>
          <p class="traffic-time-status" id="traffic-time-status" role="status" aria-live="polite">
            Đang tải tình trạng giao thông...
          </p>
        </section>

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
            disabled
          >
            Xem tốc độ theo giờ hôm nay
          </button>
        </div>

        <!-- PAGE 2: Chart.js chart -->
        <div class="popup-page" id="popup-chart-page" hidden>
          <button class="popup-back-btn" id="popup-back-btn" type="button">
            Quay lại thông tin
          </button>
          <div class="section-eyebrow">SO SÁNH VẬN TỐC</div>
          <h2 class="popup-title" id="popup-chart-title">Tốc độ trung bình theo giờ</h2>
          <p class="popup-chart-road" id="popup-chart-road-name">--</p>
          <p class="popup-chart-source">
            “Hôm nay” được ước tính từ hồ sơ lịch sử của cùng thứ; đường trung bình tổng hợp dữ liệu các thứ có sẵn trong tuần.
            Đây chưa phải số đo thực tế trong ngày.
          </p>
          <p class="popup-chart-status" id="popup-chart-status" role="status" aria-live="polite"></p>
          <button class="popup-chart-retry" id="popup-chart-retry" type="button" hidden>
            Thử tải lại
          </button>
          <div class="popup-chart-legend" role="list" aria-label="Chú giải biểu đồ">
            <span class="popup-chart-legend-item" role="listitem">
              <span class="popup-chart-legend-dot today" aria-hidden="true"></span>
              Hôm nay
            </span>
            <span class="popup-chart-legend-item" role="listitem">
              <span class="popup-chart-legend-dot average" aria-hidden="true"></span>
              Trung bình tuần
            </span>
          </div>
          <div class="popup-chart-wrap" id="popup-chart-wrap" hidden>
            <canvas id="popup-chart-canvas"></canvas>
          </div>
        </div>
      </div>
    </div>
  `;
}
