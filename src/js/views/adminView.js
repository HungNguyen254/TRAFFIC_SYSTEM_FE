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
              Trung tâm giám sát mô hình trí tuệ nhân tạo, điều hành phân tích dữ liệu và quản trị API.
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
              Kích hoạt tác vụ <code>train_model()</code> trên Backend trong tiến trình ngầm (background worker), tự động nạp trọng số mới sau khi hoàn tất.
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

        <!-- DANH SÁCH API ENDPOINTS -->
        <article class="card admin-card" style="margin-top: 24px;">
          <div class="section-eyebrow">CỔNG DỊCH VỤ</div>
          <h2>Hạ tầng API & Endpoints Dịch vụ</h2>
          <p>Danh sách các dịch vụ RESTful cung cấp dữ liệu cho Frontend và các đối tác tích hợp:</p>

          <div class="admin-table-container">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Phương thức</th>
                  <th>Endpoint</th>
                  <th>Chức năng & Mô tả</th>
                  <th>Yêu cầu quyền</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span class="method-badge method-post">POST</span></td>
                  <td><code>/api/v1/predictions/forecast</code></td>
                  <td>Dự báo tắc đường theo timeline (30 / 60 / 120 phút)</td>
                  <td><span class="badge" style="background:#f1f5f9; color:#475569; border-color:#cbd5e1;">Công khai</span></td>
                </tr>
                <tr>
                  <td><span class="method-badge method-get">GET</span></td>
                  <td><code>/api/v1/edges</code></td>
                  <td>Toàn bộ trục đường, nút giao và trạng thái giao thông mới nhất</td>
                  <td><span class="badge" style="background:#f1f5f9; color:#475569; border-color:#cbd5e1;">Công khai</span></td>
                </tr>
                <tr>
                  <td><span class="method-badge method-get">GET</span></td>
                  <td><code>/api/v1/directions</code></td>
                  <td>Định tuyến tìm đường thông minh giữa 2 nút giao</td>
                  <td><span class="badge" style="background:#f1f5f9; color:#475569; border-color:#cbd5e1;">Công khai</span></td>
                </tr>
                <tr>
                  <td><span class="method-badge method-post">POST</span></td>
                  <td><code>/api/v1/auth/register</code></td>
                  <td>Đăng ký tài khoản người dùng mới</td>
                  <td><span class="badge" style="background:#f1f5f9; color:#475569; border-color:#cbd5e1;">Công khai</span></td>
                </tr>
                <tr>
                  <td><span class="method-badge method-post">POST</span></td>
                  <td><code>/api/v1/auth/login</code></td>
                  <td>Đăng nhập hệ thống & cấp phát JWT token</td>
                  <td><span class="badge" style="background:#f1f5f9; color:#475569; border-color:#cbd5e1;">Công khai</span></td>
                </tr>
                <tr>
                  <td><span class="method-badge method-get">GET</span></td>
                  <td><code>/api/v1/auth/me</code></td>
                  <td>Tra cứu hồ sơ tài khoản hiện tại</td>
                  <td><span class="badge" style="background:#eff6ff; color:#2563eb; border-color:#bfdbfe;">Người dùng</span></td>
                </tr>
                <tr>
                  <td><span class="method-badge method-post">POST</span></td>
                  <td><code>/api/v1/admin/retrain-model</code></td>
                  <td>Kích hoạt huấn luyện lại mạng neural AI trong background</td>
                  <td><span class="badge" style="background:#fdf2f8; color:#db2777; border-color:#fbcfe8;">Admin</span></td>
                </tr>
                <tr>
                  <td><span class="method-badge method-get">GET</span></td>
                  <td><code>/api/health</code></td>
                  <td>Kiểm tra tình trạng sống (Healthcheck) Backend & Database</td>
                  <td><span class="badge" style="background:#f1f5f9; color:#475569; border-color:#cbd5e1;">Công khai</span></td>
                </tr>
              </tbody>
            </table>
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
          <p style="margin-bottom: 24px;">Khu vực quản trị chỉ dành riêng cho tài khoản quản trị viên (Admin). Vui lòng đăng nhập bằng tài khoản có đặc quyền để tiếp tục.</p>
          <a class="btn" href="/login" data-link style="width: 100%;">
            Đăng nhập tài khoản Quản trị
          </a>
        </div>
      </section>
    </main>
  `;
}
