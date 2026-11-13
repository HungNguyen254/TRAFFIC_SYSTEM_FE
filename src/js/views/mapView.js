// File: src/js/views/mapView.js

/**
 * Template HTML Trang Bản đồ giao thông
 * @returns {string} HTML string
 */
export function renderMapView() {
  return `
    <div class="layout">
      <!-- ===== KHU BẢN ĐỒ ===== -->
      <section class="map-area" aria-label="Bản đồ giao thông">
        <div id="map-canvas"></div>

        <!-- Lớp phủ hiển thị trạng thái đang tải / lỗi -->
        <div
          id="status-overlay"
          class="status-overlay"
          role="status"
          aria-live="polite"
        >
          <div class="spinner" id="spinner"></div>
          <p id="status-text">Đang tải bản đồ…</p>
          <button class="btn-secondary" id="retry-btn" type="button" hidden>
            Thử lại
          </button>
        </div>

        <!-- Cảnh báo nhỏ khi ảnh bản đồ không tải được -->
        <div id="tile-warning" class="tile-warning" role="alert" hidden>
          Không tải được ảnh nền bản đồ. Hãy kiểm tra kết nối mạng, và mở trang
          qua máy chủ cục bộ thay vì file://.
        </div>
      </section>

      <!-- ===== PANEL THÔNG TIN ===== -->
      <aside class="panel" aria-label="Thông tin điểm nóng">
        <h1>Tìm đường trên bản đồ</h1>
        <form class="route-form" id="route-form">
          <h2>Chỉ đường</h2>
          <label class="time-label" for="route-origin">Điểm đi</label>
          <input
            id="route-origin"
            name="origin"
            type="search"
            placeholder="Ví dụ: Bến xe Mỹ Đình"
            required
          />
          <label class="time-label" for="route-destination">Điểm đến</label>
          <div class="route-destination-controls">
            <input
              id="route-destination"
              name="destination"
              type="search"
              placeholder="Ví dụ: Hồ Hoàn Kiếm"
              required
            />
            <button
              class="btn-secondary route-swap"
              id="route-swap"
              type="button"
              aria-label="Đổi điểm đi và điểm đến"
              title="Đổi điểm đi và điểm đến"
            >
              ⇅
            </button>
          </div>
          <label class="time-label" for="route-vehicle">Phương tiện</label>
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
              Hủy
            </button>
          </div>
          <p
            class="route-status"
            id="route-status"
            role="status"
            aria-live="polite"
          >
            Nhập điểm đi và điểm đến tại Hà Nội.
          </p>
          <div
            class="route-summary"
            id="route-summary"
            aria-live="polite"
            hidden
          >
            <p>Quãng đường <strong id="route-distance"></strong></p>
            <p>Thời gian dự kiến <strong id="route-duration"></strong></p>
            <small id="route-estimate-note"
              >Thời gian tính theo quãng đường chia vận tốc hiện tại của từng
              đoạn; nếu thiếu vận tốc thì dùng mức tốc độ đại diện theo màu giao
              thông. Tốc độ được điều chỉnh theo phương tiện và chỉ là ước tính,
              không phải dữ liệu thời gian thực. Tuyến dùng mạng đường ô tô; xe
              buýt chưa có dữ liệu tuyến/lịch chạy riêng.</small
            >
          </div>
        </form>

        <form class="road-search" id="road-search">
          <label class="time-label" for="road-query"
            >Tên đường hoặc địa điểm tại Hà Nội</label
          >
          <div class="road-search-controls">
            <input
              id="road-query"
              name="query"
              type="search"
              placeholder="Ví dụ: Đường Láng"
              required
            />
            <button class="btn-secondary" id="search-btn" type="submit">
              Tìm
            </button>
          </div>
        </form>
        <section class="traffic-legend" aria-labelledby="traffic-legend-title">
          <h2 id="traffic-legend-title">Mức độ giao thông</h2>
          <ul>
            <li>
              <span class="traffic-color green"></span
              ><span>Thông thoáng <small>(từ 35 km/h)</small></span>
            </li>
            <li>
              <span class="traffic-color yellow"></span
              ><span>Di chuyển chậm <small>(25–35 km/h)</small></span>
            </li>
            <li>
              <span class="traffic-color red"></span
              ><span>Ùn tắc nghiêm trọng <small>(15–dưới 25 km/h)</small></span>
            </li>
            <li>
              <span class="traffic-color darkred"></span
              ><span>Kẹt xe hoàn toàn <small>(dưới 5 km/h)</small></span>
            </li>
            <li>
              <span class="traffic-color no-data"></span
              ><span>Không có dữ liệu</span>
            </li>
          </ul>
        </section>
        <p class="search-attribution">
          Tìm kiếm © OpenStreetMap contributors · Định tuyến bởi OSRM
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
          class="list search-results"
          id="search-results"
          aria-label="Kết quả tìm kiếm"
        ></ul>
        <div class="detail" id="detail" hidden></div>
      </aside>
    </div>

    <!-- ===== TOGGLE POPUP BUTTON ===== -->
    <button
      class="popup-toggle-btn"
      id="popup-toggle-btn"
      type="button"
      title="View road info"
    >
      Thông tin đường
    </button>

    <!-- ===== ROAD INFO POPUP ===== -->
    <div class="popup-overlay" id="popup-overlay" hidden>
      <div class="popup-box" id="popup-box">
        <!-- Close button -->
        <button
          class="popup-close"
          id="popup-close"
          type="button"
          title="Close"
        >
          ✕
        </button>

        <!-- PAGE 1: Road information -->
        <div class="popup-page" id="popup-info-page">
          <h2 class="popup-title" id="popup-road-name">
            -- Chọn một tuyến đường --
          </h2>
          <div class="popup-row">
            <span class="popup-label">Tốc độ trung bình:</span>
            <span class="popup-value" id="popup-avg-speed">-- km/h</span>
          </div>
          <div class="popup-row">
            <span class="popup-label">Mức độ:</span>
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
            Xem biểu đồ
          </button>
        </div>

        <!-- PAGE 2: Chart.js chart -->
        <div class="popup-page" id="popup-chart-page" hidden>
          <button class="popup-back-btn" id="popup-back-btn" type="button">
            ← Quay lại
          </button>
          <h2 class="popup-title" id="popup-chart-title">Biểu đồ tốc độ</h2>
          <div class="popup-chart-wrap">
            <canvas id="popup-chart-canvas"></canvas>
          </div>
        </div>
      </div>
    </div>
  `;
}
