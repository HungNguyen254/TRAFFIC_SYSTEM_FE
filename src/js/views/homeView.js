// File: src/js/views/homeView.js

/**
 * Template HTML nội dung Trang chủ
 * @returns {string} HTML string
 */
export function renderHomeView() {
  return `
    <main>
      <!-- ===== GIỚI THIỆU ===== -->
      <section class="hero" id="home">
        <div class="hero-stats">
          <div class="stat">
            <strong id="stat-edges">--</strong><span>Trục đường theo dõi</span>
          </div>
          <div class="stat">
            <strong id="stat-congested">--</strong><span>Tuyến đang ùn tắc</span>
          </div>
          <div class="stat">
            <strong id="stat-avg">--</strong><span>Tốc độ trung bình</span>
          </div>
        </div>
        <h1>Biết trước đường nào tắc, chọn giờ đi hợp lý hơn</h1>
        <p>
          Hệ thống AI phân tích dữ liệu giao thông các tuyến đường chính ở Hà
          Nội: dự báo mức độ ùn tắc theo khung giờ, tra cứu bản đồ và tìm lộ
          trình nhanh nhất.
        </p>
        <div class="hero-actions">
          <a class="btn" href="#forecast">Xem dự báo ngay</a>
          <a class="btn btn-outline" href="/map">Mở bản đồ</a>
        </div>
      </section>

      <!-- ===== TRA CỨU DỰ BÁO (gọi API /predictions/forecast thật) ===== -->
      <section class="section" id="forecast">
        <h2>Dự báo AI theo tuyến đường</h2>
        <p class="section-desc">
          Chọn tuyến đường, thời tiết và mốc thời gian tới — hệ thống gọi API dự
          báo của Backend và trả về tốc độ, mức ùn tắc dự kiến.
        </p>

        <form class="forecast-form card" id="forecast-form">
          <div class="form-grid">
            <div class="form-field">
              <label for="fc-street">Tên tuyến đường</label>
              <input
                id="fc-street"
                name="street_name"
                type="text"
                placeholder="Ví dụ: Nguyễn Trãi"
                list="street-list"
                autocomplete="off"
                required
              />
              <datalist id="street-list"></datalist>
            </div>
            <div class="form-field">
              <label for="fc-weather">Thời tiết</label>
              <select id="fc-weather" name="weather">
                <option value="sunny">Nắng</option>
                <option value="rain">Mưa</option>
                <option value="heavy_rain">Mưa lớn</option>
              </select>
            </div>
            <div class="form-field">
              <label for="fc-minutes">Dự báo trước (phút)</label>
              <select id="fc-minutes" name="minutes">
                <option value="30">30 phút</option>
                <option value="60">60 phút</option>
                <option value="120">120 phút</option>
              </select>
            </div>
            <div class="form-field form-field-submit">
              <button class="btn" id="fc-submit" type="submit">Dự báo</button>
            </div>
          </div>
          <p
            class="forecast-status"
            id="fc-status"
            role="status"
            aria-live="polite"
          >
            Nhập tên tuyến đường để xem dự báo.
          </p>
        </form>

        <div class="forecast-result" id="fc-result" hidden>
          <div class="fc-head">
            <h3 id="fc-street-title">--</h3>
            <span class="badge" id="fc-max-speed">--</span>
          </div>
          <ol class="timeline" id="fc-timeline"></ol>
        </div>
      </section>

      <!-- ===== ĐIỂM NÓNG ===== -->
      <section class="section section-gray" id="hotspots">
        <h2>Điểm nóng ùn tắc hiện tại</h2>
        <p class="section-desc">
          Các đoạn ùn tắc nhất được lấy từ cùng dữ liệu và mức màu đang hiển thị
          trên <a href="/map">trang Bản đồ</a>.
        </p>

        <p id="hotspot-status" class="hotspot-status" role="status" aria-live="polite">
          Đang tải dữ liệu giao thông...
        </p>
        <div class="grid" id="hotspot-grid"></div>
      </section>

      <!-- ===== CÁCH HOẠT ĐỘNG ===== -->
      <section class="section" id="how-it-works">
        <h2>AI dự báo như thế nào?</h2>
        <p class="section-desc">
          Ba bước từ dữ liệu thô đến lời khuyên cho chuyến đi của bạn.
        </p>

        <ol class="steps">
          <li>
            <h3>Thu thập dữ liệu</h3>
            <p>
              Hệ thống tổng hợp tốc độ xe, mật độ phương tiện, thời tiết và lịch
              sự kiện trên từng tuyến.
            </p>
          </li>
          <li>
            <h3>Mô hình AI phân tích</h3>
            <p>
              Mô hình học từ quy luật lặp lại theo giờ, theo ngày trong tuần và
              theo mùa để dự đoán mức ùn tắc.
            </p>
          </li>
          <li>
            <h3>Đưa ra gợi ý</h3>
            <p>
              Kết quả được đổi thành mức màu dễ hiểu cùng khuyến nghị giờ đi và
              tuyến thay thế.
            </p>
          </li>
        </ol>
      </section>

      <!-- ===== TRẠNG THÁI HỆ THỐNG ===== -->
      <section class="section" id="connect">
        <h2>Trạng thái kết nối hệ thống</h2>
        <p class="section-desc">
          Kiểm tra Backend và Database đang chạy trên máy của bạn.
        </p>

        <button class="btn" id="fetch-btn" type="button">
          Kiểm tra kết nối Backend
        </button>
        <p class="result" id="output" aria-live="polite"></p>
      </section>
    </main>
  `;
}
