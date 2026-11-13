// File: src/js/views/adminView.js

/**
 * Template HTML Trang Quản trị
 * @returns {string} HTML string
 */
export function renderAdminView() {
  return `
    <main class="admin-main">
      <section class="section">
        <h1>Bảng điều khiển quản trị</h1>
        <p class="section-desc">
          Các tác vụ yêu cầu quyền quản trị viên (JWT). Người dùng thường không
          thể truy cập.
        </p>

        <div class="admin-grid">
          <!-- HUẤN LUYỆN LẠI MÔ HÌNH -->
          <article class="card admin-card">
            <h2>Huấn luyện lại mô hình AI</h2>
            <p>
              Kích hoạt việc chạy lại <code>train_model()</code> trên Backend
              trong tiến trình ngầm, sau đó tự nạp lại mô hình mới.
            </p>
            <button class="btn" id="retrain-btn" type="button">
              Huấn luyện lại mô hình
            </button>
            <p
              class="form-message"
              id="retrain-message"
              role="status"
              aria-live="polite"
            ></p>
          </article>

          <!-- TRẠNG THÁI -->
          <article class="card admin-card">
            <h2>Trạng thái phiên đăng nhập</h2>
            <dl class="me-list">
              <dt>Đã đăng nhập</dt>
              <dd id="st-logged">--</dd>
              <dt>Email</dt>
              <dd id="st-email">--</dd>
              <dt>Vai trò</dt>
              <dd id="st-role">--</dd>
            </dl>
            <button class="btn-danger" id="logout-btn" type="button">
              Đăng xuất
            </button>
          </article>
        </div>

        <!-- GHI CHÚ ENDPOINT CÓ SẴN -->
        <article class="card admin-card" style="margin-top: 24px">
          <h2>Danh sách API Backend đang có</h2>
          <table class="admin-table">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Phương thức</th>
                <th>Mô tả</th>
                <th>Quyền</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>/api/v1/predictions/forecast</td>
                <td>POST</td>
                <td>Dự báo tắc đường theo timeline (30/60/120 phút)</td>
                <td>Công khai</td>
              </tr>
              <tr>
                <td>/api/v1/directions</td>
                <td>GET</td>
                <td>Tìm tuyến giữa 2 nút giao (distance / duration)</td>
                <td>Công khai</td>
              </tr>
              <tr>
                <td>/api/v1/auth/register</td>
                <td>POST</td>
                <td>Đăng ký tài khoản</td>
                <td>Công khai</td>
              </tr>
              <tr>
                <td>/api/v1/auth/login</td>
                <td>POST</td>
                <td>Đăng nhập, nhận JWT</td>
                <td>Công khai</td>
              </tr>
              <tr>
                <td>/api/v1/auth/me</td>
                <td>GET</td>
                <td>Thông tin tài khoản hiện tại</td>
                <td>Người dùng</td>
              </tr>
              <tr>
                <td>/api/v1/admin/retrain-model</td>
                <td>POST</td>
                <td>Huấn luyện lại mô hình AI (background)</td>
                <td>Admin</td>
              </tr>
              <tr>
                <td>/api/health</td>
                <td>GET</td>
                <td>Kiểm tra sức khỏe Backend + Database</td>
                <td>Công khai</td>
              </tr>
            </tbody>
          </table>
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
      <section class="section">
        <div class="card admin-card">
          <h2>⛔ Không có quyền truy cập</h2>
          <p>Trang này chỉ dành cho quản trị viên. Hãy <a href="/login" data-link>đăng nhập</a> bằng tài khoản admin.</p>
        </div>
      </section>
    </main>
  `;
}
