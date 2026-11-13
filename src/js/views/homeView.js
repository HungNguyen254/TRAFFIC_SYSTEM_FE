// File: src/js/views/homeView.js

/**
 * Template HTML Trang chủ phong cách tối giản, phi biểu tượng (No-Icon Swiss/Modern Design)
 * Tập trung vào phân cấp thị giác bằng kiểu chữ, độ tương phản và bố cục dữ liệu.
 * @returns {string} HTML string
 */
export function renderHomeView() {
  return `
    <main>
      <!-- ===== GIỚI THIỆU (HERO) ===== -->
      <section class="hero" id="home">
        <div class="hero-pill">
          <span class="hero-pill-badge">PHIÊN BẢN 2.0</span>
          <span>Hệ thống Giám sát & Dự báo Giao thông Thông minh Hà Nội</span>
        </div>

        <h1>
          Biết trước đường nào tắc, <br/>
          <span class="gradient-text">chọn giờ khởi hành tối ưu hơn</span>
        </h1>

        <p>
          Hệ thống AI phân tích dữ liệu giao thông thời gian thực trên các trục đường huyết mạch tại Hà Nội:
          dự báo chỉ số ùn tắc theo khung giờ, mô phỏng tuyến đường và tìm lộ trình di chuyển thông minh nhất.
        </p>

        <div class="hero-actions">
          <a class="btn" href="#forecast">Xem dự báo AI</a>
          <a class="btn btn-outline" href="/map" data-link>Mở bản đồ trực tiếp</a>
        </div>

        <div class="hero-stats">
          <div class="stat">
            <div class="stat-header">
              <span class="stat-tag primary">MẠNG LƯỚI</span>
            </div>
            <div class="stat-content">
              <strong id="stat-edges">--</strong>
              <span>Trục đường theo dõi</span>
            </div>
          </div>

          <div class="stat">
            <div class="stat-header">
              <span class="stat-tag amber">CẢNH BÁO</span>
            </div>
            <div class="stat-content">
              <strong id="stat-congested">--</strong>
              <span>Tuyến đang ùn tắc</span>
            </div>
          </div>

          <div class="stat">
            <div class="stat-header">
              <span class="stat-tag emerald">VẬN TỐC</span>
            </div>
            <div class="stat-content">
              <strong id="stat-avg">--</strong>
              <span>Tốc độ trung bình mạng</span>
            </div>
          </div>
        </div>
      </section>

      <!-- ===== TRA CỨU DỰ BÁO AI ===== -->
      <section class="section" id="forecast">
        <div class="section-header">
          <div class="section-eyebrow">MÔ HÌNH HỌC SÂU</div>
          <h2>Dự báo AI theo tuyến đường</h2>
          <p class="section-desc">
            Chọn tuyến đường, điều kiện thời tiết và khoảng thời gian dự báo tới — mô hình Deep Learning của Backend sẽ dự đoán tốc độ, mức độ ùn tắc và gợi ý lộ trình phù hợp.
          </p>
        </div>

        <form class="forecast-form card" id="forecast-form">
          <div class="form-grid">
            <div class="form-field">
              <label for="fc-street">Tên tuyến đường</label>
              <input
                id="fc-street"
                name="street_name"
                type="text"
                placeholder="Ví dụ: Nguyễn Trãi, Tây Sơn, Cầu Giấy..."
                list="street-list"
                autocomplete="off"
                required
              />
              <datalist id="street-list"></datalist>
            </div>

            <div class="form-field">
              <label for="fc-weather">Điều kiện thời tiết</label>
              <select id="fc-weather" name="weather">
                <option value="sunny">Nắng ráo</option>
                <option value="rain">Mưa vừa</option>
                <option value="heavy_rain">Mưa lớn / Giông</option>
              </select>
            </div>

            <div class="form-field">
              <label for="fc-minutes">Thời điểm dự báo</label>
              <select id="fc-minutes" name="minutes">
                <option value="30">Sau 30 phút</option>
                <option value="60">Sau 60 phút (1 giờ)</option>
                <option value="120">Sau 120 phút (2 giờ)</option>
              </select>
            </div>

            <div class="form-field form-field-submit">
              <button class="btn" id="fc-submit" type="submit">Phân tích & Dự báo</button>
            </div>
          </div>

          <p
            class="forecast-status"
            id="fc-status"
            role="status"
            aria-live="polite"
          >
            Nhập tên tuyến đường hoặc chọn từ danh sách gợi ý để xem dự báo.
          </p>
        </form>

        <div class="forecast-result" id="fc-result" hidden>
          <div class="fc-head">
            <div>
              <span class="fc-meta-label">KẾT QUẢ PHÂN TÍCH TUYẾN</span>
              <h3 id="fc-street-title">--</h3>
            </div>
            <span class="badge" id="fc-max-speed">--</span>
          </div>
          <ol class="timeline" id="fc-timeline"></ol>
        </div>
      </section>

      <!-- ===== ĐIỂM NÓNG GIAO THÔNG ===== -->
      <section class="section section-gray" id="hotspots">
        <div class="section-header">
          <div class="section-eyebrow">GIÁM SÁT THỜI GIAN THỰC</div>
          <h2>Điểm nóng ùn tắc hiện tại</h2>
          <p class="section-desc">
            Các đoạn đường có mật độ phương tiện cao nhất tại Hà Nội, đồng bộ trực tiếp với <a href="/map" data-link style="color: var(--primary); font-weight: 600; text-decoration: underline;">Bản đồ thời gian thực</a>.
          </p>
        </div>

        <p id="hotspot-status" class="hotspot-status" role="status" aria-live="polite">
          Đang tải dữ liệu giao thông...
        </p>

        <div class="grid" id="hotspot-grid"></div>
      </section>

      <!-- ===== CÁCH HOẠT ĐỘNG ===== -->
      <section class="section" id="how-it-works">
        <div class="section-header">
          <div class="section-eyebrow">KIẾN TRÚC MÔ HÌNH</div>
          <h2>Quy trình AI dự báo giao thông</h2>
          <p class="section-desc">
            Quy trình khép kín từ cảm biến thu thập đa nguồn đến khuyến nghị điều hướng cá nhân hóa.
          </p>
        </div>

        <ol class="steps">
          <li>
            <h3>Thu thập dữ liệu đa nguồn</h3>
            <p>
              Hệ thống liên tục tổng hợp vận tốc phương tiện, lưu lượng xe, thời tiết và các sự kiện đô thị trên từng nút giao và cung đường.
            </p>
          </li>
          <li>
            <h3>Mô hình AI học chuỗi thời gian</h3>
            <p>
              Thuật toán phân tích chu kỳ lặp lại theo giờ cao điểm, ngày trong tuần, điều kiện thời tiết để dự đoán trước điểm nghẽn giao thông.
            </p>
          </li>
          <li>
            <h3>Khuyến nghị lộ trình tối ưu</h3>
            <p>
              Kết quả được trực quan hóa trên bản đồ GIS theo mức màu chuẩn quốc tế, giúp người tham gia giao thông chủ động đổi hướng đi phù hợp.
            </p>
          </li>
        </ol>
      </section>

      <!-- ===== TRẠNG THÁI HỆ THỐNG ===== -->
      <section class="section" id="connect">
        <div class="section-header">
          <div class="section-eyebrow">HẠ TẦNG KẾT NỐI</div>
          <h2>Trạng thái vận hành hệ thống</h2>
          <p class="section-desc">
            Kiểm tra tình trạng kết nối tới Backend API và cơ sở dữ liệu giao thông Hà Nội.
          </p>
        </div>

        <div class="connect-card">
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px;">
            <div>
              <div style="font-weight: 700; font-size: 15px;">API Gateway & Dịch vụ Dự báo</div>
              <div style="font-size: 13px; color: var(--text-muted); margin-top: 2px;">Endpoint kiểm tra: <code id="api-base-display">/api/health</code></div>
            </div>
            <button class="btn btn-outline" id="fetch-btn" type="button">Kiểm tra kết nối</button>
          </div>
          <p class="result" id="output" aria-live="polite"></p>
        </div>
      </section>
    </main>
  `;
}
