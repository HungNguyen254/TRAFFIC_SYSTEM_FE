// File: src/js/views/adminView.js

/**
 * Template HTML Trang Quản trị phong cách tối giản, phi biểu tượng (No-Icon Swiss/Enterprise Console)
 * @returns {string} HTML string
 */
export function renderAdminView() {
  return `
    <main class="admin-main">
      <section class="section" style="padding-top: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 24px;">
          <div>
            <div class="section-eyebrow">TRUNG TÂM ĐIỀU HÀNH</div>
            <h1>Bảng điều khiển Quản trị Hệ thống</h1>
            <p class="section-desc">
              Giám sát mô hình trí tuệ nhân tạo, điều hành phân tích dữ liệu và quản trị phân quyền.
            </p>
          </div>
          <div class="system-status-pill">
            <span class="pulse-dot"></span>
            HỆ THỐNG HOẠT ĐỘNG BÌNH THƯỜNG
          </div>
        </div>

        <nav class="admin-tabs" id="admin-tabs" aria-label="Phân mục quản trị">
          <button class="admin-tab-btn" type="button" data-tab="overview" aria-current="true">Tổng quan</button>
          <button class="admin-tab-btn" type="button" data-tab="users">Quản lý người dùng</button>
          <button class="admin-tab-btn" type="button" data-tab="roads">Quản lý đoạn đường</button>
        </nav>

        <div class="admin-panel" id="admin-panel-overview">
        <div class="admin-metric-row">
          <div class="admin-metric-card">
            <div class="metric-label">Tài khoản người dùng</div>
            <div class="metric-value" id="metric-users">--</div>
            <div class="metric-sub" id="metric-users-sub">Đang tải...</div>
          </div>
          <div class="admin-metric-card">
            <div class="metric-label">Đoạn đường</div>
            <div class="metric-value" id="metric-roads">--</div>
            <div class="metric-sub" id="metric-roads-sub">Đang tải...</div>
          </div>
          <div class="admin-metric-card">
            <div class="metric-label">Mô hình AI</div>
            <div class="metric-value">Neural</div>
            <div class="metric-sub">Dự báo theo chuỗi thời gian & thời tiết</div>
          </div>
        </div>
        <div class="admin-grid">
          <!-- HUẤN LUYỆN LẠI MÔ HÌNH -->
          <article class="card admin-card">
            <div class="section-eyebrow">MÔ HÌNH DỰ BÁO</div>
            <h2>Huấn luyện lại mô hình AI</h2>
            <p>
              Kích hoạt tác vụ huấn luyện lại mạng neural trên máy chủ trong tiến trình ngầm, tự động đồng bộ trọng số mới sau khi hoàn tất.
            </p>
            <button class="btn" id="retrain-btn" type="button" style="width: 100%; margin-top: 8px;">
              Khởi động huấn luyện lại
            </button>
            <p
              class="form-message"
              id="retrain-message"
              role="status"
              aria-live="polite"
            ></p>
          </article>

          <!-- TRẠNG THÁI PHIÊN -->
          <article class="card admin-card">
            <div class="section-eyebrow">PHIÊN LÀM VIỆC</div>
            <h2>Xác thực Quản trị viên</h2>
            <dl class="me-list" style="margin-bottom: 16px;">
              <dt>Đã xác thực</dt>
              <dd id="st-logged">--</dd>
              <dt>Tài khoản</dt>
              <dd id="st-email">--</dd>
              <dt>Phân quyền</dt>
              <dd id="st-role">--</dd>
            </dl>
            <button class="btn-danger" id="logout-btn" type="button" style="width: 100%;">
              Đăng xuất phiên Admin
            </button>
          </article>
        </div>
        </div>

        <div class="admin-panel" id="admin-panel-users" hidden>
        <section class="admin-card admin-user-section" aria-labelledby="admin-user-title">
          <div class="admin-road-heading">
            <div>
              <div class="section-eyebrow">TÀI KHOẢN NGƯỜI DÙNG</div>
              <h2 id="admin-user-title">Quản lý người dùng</h2>
              <p>Tìm theo email hoặc tên, cập nhật thông tin và vai trò, hoặc xóa tài khoản.</p>
            </div>
          </div>
          <form class="admin-user-search" id="admin-user-search-form">
            <input
              id="admin-user-search-input"
              name="query"
              type="search"
              placeholder="Nhập email hoặc tên người dùng..."
              autocomplete="off"
              maxlength="100"
            />
            <button class="btn" type="submit">Tìm kiếm</button>
            <button class="btn-secondary" id="admin-user-reset" type="button">Xem tất cả</button>
          </form>
          <p class="form-message admin-user-status" id="admin-user-status" role="status" aria-live="polite"></p>
          <div class="admin-metric-row" style="margin-bottom: 12px;">
            <div class="admin-metric-card">
              <div class="metric-label">Tổng số tài khoản</div>
              <div class="metric-value" id="metric-users-inline">--</div>
            </div>
            <div class="admin-metric-card">
              <div class="metric-label">Quản trị viên</div>
              <div class="metric-value" id="metric-admins-inline">--</div>
            </div>
          </div>
          <div class="admin-table-container">
            <table class="admin-table admin-user-table">
              <thead>
                <tr>
                  <th>Tên người dùng</th>
                  <th>Email</th>
                  <th>Vai trò</th>
                  <th>Ngày tạo</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody id="admin-user-rows">
                <tr><td colspan="5" class="admin-empty">Đang tải danh sách tài khoản...</td></tr>
              </tbody>
            </table>
          </div>
          <nav class="admin-pagination" id="admin-user-pagination" aria-label="Phân trang người dùng" hidden></nav>
        </section>
        </div>

        <div class="admin-panel" id="admin-panel-roads" hidden>
        <section class="admin-card admin-road-section" aria-labelledby="admin-road-title">
          <div class="admin-road-heading">
            <div>
              <div class="section-eyebrow">MẠNG LƯỚI GIAO THÔNG</div>
              <h2 id="admin-road-title">Quản lý đoạn đường</h2>
              <p>Vẽ đoạn đường trên bản đồ, cập nhật thông tin hoặc xóa tuyến không còn sử dụng.</p>
            </div>
            <button class="btn" id="admin-road-new" type="button">Vẽ đoạn đường mới</button>
          </div>

          <div class="admin-road-editor" id="admin-road-editor" hidden>
            <form class="admin-road-form" id="admin-road-form">
              <div class="admin-road-field">
                <label for="admin-road-code">Mã đoạn đường</label>
                <input id="admin-road-code" name="edge_code" maxlength="20" required />
              </div>
              <div class="admin-road-field">
                <label for="admin-road-name">Tên đường</label>
                <input id="admin-road-name" name="street_name" maxlength="100" required />
              </div>
              <div class="admin-road-field">
                <label for="admin-road-district">Khu vực / quận</label>
                <input
                  id="admin-road-district"
                  name="district"
                  list="admin-road-district-options"
                  maxlength="50"
                  required
                />
                <datalist id="admin-road-district-options"></datalist>
              </div>
              <div class="admin-road-field">
                <label for="admin-road-speed">Tốc độ tối đa (km/h)</label>
                <input
                  id="admin-road-speed"
                  name="max_speed_limit"
                  type="number"
                  min="1"
                  max="200"
                  value="50"
                  required
                />
              </div>
              <p class="admin-road-length" id="admin-road-length">Chiều dài: --</p>
              <div class="admin-road-form-actions">
                <button class="btn-secondary" id="admin-road-draw" type="button">
                  Vẽ / vẽ lại tuyến
                </button>
                <button class="btn-secondary" id="admin-road-finish" type="button" hidden disabled>
                  Hoàn tất vẽ
                </button>
                <button class="btn" id="admin-road-save" type="submit" disabled>
                  Lưu đoạn đường
                </button>
                <button class="btn-danger" id="admin-road-cancel" type="button" hidden>
                  Hủy
                </button>
              </div>
              <p class="form-message admin-road-status" id="admin-road-status" role="status" aria-live="polite">
                Chọn “Vẽ đoạn đường mới” hoặc sửa một đoạn trong danh sách.
              </p>
            </form>

            <div class="admin-map-column">
              <p class="admin-map-hint" id="admin-map-hint">
                Chọn các điểm dọc tuyến; hệ thống sẽ căn đường theo lộ trình thực tế khi hoàn tất.
              </p>
              <div id="admin-road-map" aria-label="Bản đồ để vẽ đoạn đường"></div>
            </div>
          </div>

          <div class="admin-table-container">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Mã</th>
                  <th>Tên đường</th>
                  <th>Khu vực</th>
                  <th>Chiều dài</th>
                  <th>Tốc độ tối đa</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody id="admin-road-rows">
                <tr><td colspan="6" class="admin-empty">Đang tải dữ liệu đoạn đường...</td></tr>
              </tbody>
            </table>
          </div>
          <nav class="admin-pagination" id="admin-road-pagination" aria-label="Phân trang đoạn đường" hidden></nav>
          <p class="admin-feedback" id="admin-road-list-status" role="status" aria-live="polite"></p>
        </section>
        </div>

        <!-- THÔNG SỐ VẬN HÀNH HỆ THỐNG -->
        <article class="card admin-card" style="margin-top: 24px;">
          <div class="section-eyebrow">GIÁM SÁT HẠ TẦNG</div>
          <h2>Thông số vận hành mạng lưới giao thông</h2>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-top: 14px;">
            <div style="background: var(--surface-subtle); padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border);">
              <span style="font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Mô hình học máy</span>
              <div style="font-size: 16px; font-weight: 800; margin-top: 4px; color: var(--text);">Neural Sequence Model</div>
              <small style="color: var(--text-muted);">Học chuỗi thời gian & thời tiết</small>
            </div>

            <div style="background: var(--surface-subtle); padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border);">
              <span style="font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Chu kỳ làm mới dữ liệu</span>
              <div style="font-size: 16px; font-weight: 800; margin-top: 4px; color: var(--text);">Thời gian thực</div>
              <small style="color: var(--text-muted);">Đồng bộ qua API Gateway</small>
            </div>

            <div style="background: var(--surface-subtle); padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border);">
              <span style="font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Cơ chế phân quyền</span>
              <div style="font-size: 16px; font-weight: 800; margin-top: 4px; color: var(--text);">JWT Bearer + RBAC</div>
              <small style="color: var(--text-muted);">Bảo vệ tuyến đường quản trị</small>
            </div>
          </div>
        </article>
      </section>
    </main>
  `;
}

/**
 * Template khi người dùng chưa đăng nhập hoặc không có quyền admin
 */
export function renderAdminUnauthorizedView() {
  return `
    <main class="admin-main">
      <section class="section" style="max-width: 520px; text-align: center; padding: 60px 24px;">
        <div class="card admin-card" style="padding: 40px 32px;">
          <div class="section-eyebrow" style="color: var(--danger);">BẢO MẬT & PHÂN QUYỀN</div>
          <h2>Từ chối quyền truy cập</h2>
          <p style="margin-bottom: 24px; color: var(--text-muted); font-size: 14px;">
            Khu vực quản trị chỉ dành riêng cho tài khoản quản trị viên (Admin). Bạn không có đủ đặc quyền để xem nội dung này.
          </p>
          <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
            <a class="btn" href="/login" data-link>
              Đổi tài khoản đăng nhập
            </a>
            <a class="btn btn-outline" href="/" data-link>
              Về Trang chủ
            </a>
          </div>
        </div>
      </section>
    </main>
  `;
}
