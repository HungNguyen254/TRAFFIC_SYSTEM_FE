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
