export function renderCompareView() {
  return `
    <main class="compare-main">
      <section class="compare-section">
        <header class="compare-header">
          <div>
            <div class="section-eyebrow">LẬP KẾ HOẠCH DI CHUYỂN</div>
            <h1>So sánh tuyến đường</h1>
            <p class="section-desc">
              Chọn điểm đi, điểm đến và giờ khởi hành để xem thời gian dự kiến của từng phương án.
            </p>
          </div>
        </header>

        <form class="compare-form card" id="compare-form">
          <div class="compare-field">
            <label for="compare-origin">Điểm xuất phát</label>
            <select id="compare-origin" required>
              <option value="">Đang tải nút giao...</option>
            </select>
          </div>
          <div class="compare-field">
            <label for="compare-destination">Điểm đến</label>
            <select id="compare-destination" required>
              <option value="">Đang tải nút giao...</option>
            </select>
          </div>
          <div class="compare-field">
            <label for="compare-departure">Giờ khởi hành</label>
            <input id="compare-departure" type="datetime-local" required />
          </div>
          <div class="compare-field">
            <label for="compare-weather">Thời tiết</label>
            <select id="compare-weather">
              <option value="sunny">Trời quang</option>
              <option value="rain">Mưa</option>
              <option value="heavy_rain">Mưa lớn</option>
            </select>
          </div>
          <button class="btn" id="compare-submit" type="submit">So sánh tuyến</button>
        </form>

        <p class="compare-status" id="compare-status" role="status" aria-live="polite"></p>
        <div class="compare-summary" id="compare-summary" aria-live="polite"></div>
        <div class="compare-results" id="compare-results"></div>
      </section>
    </main>
  `;
}
