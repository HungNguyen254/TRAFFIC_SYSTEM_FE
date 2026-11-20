// File: src/js/views/adminView.js

export function renderAdminView() {
  return `
    <main class="admin-main">
      <section class="admin-section">
        <header class="admin-page-header">
          <div>
            <div class="section-eyebrow">TRUNG TÂM ĐIỀU HÀNH</div>
            <h1>Bảng điều khiển Quản trị</h1>
            <p class="section-desc">
              Quản lý mạng lưới đường, khu vực và theo dõi tình trạng giao thông.
            </p>
          </div>
          <div class="system-status-pill">
            <span class="pulse-dot"></span>
            QUẢN TRỊ VIÊN
          </div>
        </header>

        <p class="admin-feedback" id="admin-dashboard-status" role="status" aria-live="polite"></p>

        <div class="admin-metrics" aria-label="Thống kê hệ thống">
          <article class="admin-metric-card">
            <span>Số đoạn đường</span>
            <strong id="admin-total-edges">--</strong>
          </article>
          <article class="admin-metric-card">
            <span>Bản ghi giao thông</span>
            <strong id="admin-total-records">--</strong>
          </article>
          <article class="admin-metric-card">
            <span>Lượt dự báo</span>
            <strong id="admin-forecast-count">--</strong>
          </article>
          <article class="admin-metric-card">
            <span>Khu vực ùn tắc cao nhất</span>
            <strong id="admin-top-area">--</strong>
          </article>
        </div>

        <div class="admin-overview-grid">
          <article class="admin-card">
            <div class="section-eyebrow">TOÀN THỜI GIAN</div>
            <h2>Top khu vực ùn tắc</h2>
            <p class="admin-card-description">
              Xếp theo số bản ghi có mức ùn tắc nghiêm trọng hoặc kẹt xe.
            </p>
            <ol class="admin-area-list" id="admin-top-areas">
              <li class="admin-empty">Đang tải thống kê...</li>
            </ol>
          </article>

          <article class="admin-card admin-session-card">
            <div>
              <div class="section-eyebrow">PHIÊN LÀM VIỆC</div>
              <h2>Xác thực quản trị</h2>
              <dl class="me-list">
                <dt>Tài khoản</dt>
                <dd id="st-email">--</dd>
                <dt>Phân quyền</dt>
                <dd id="st-role">--</dd>
              </dl>
            </div>
            <div class="admin-session-actions">
              <button class="btn btn-outline" id="retrain-btn" type="button">
                Huấn luyện lại mô hình
              </button>
              <button class="btn-danger" id="logout-btn" type="button">
                Đăng xuất
              </button>
            </div>
            <p class="form-message" id="retrain-message" role="status" aria-live="polite"></p>
          </article>
        </div>

        <section class="admin-card admin-user-section" aria-labelledby="admin-user-title">
          <div class="admin-section-heading">
            <div>
              <div class="section-eyebrow">TÀI KHOẢN NGƯỜI DÙNG</div>
              <h2 id="admin-user-title">Quản lý người dùng</h2>
              <p class="admin-card-description">
                Tìm theo email hoặc tên người dùng, sau đó sửa hoặc xóa tài khoản.
              </p>
            </div>
          </div>
          <form class="admin-user-search" id="admin-user-search-form">
            <input
              id="admin-user-search-input"
              name="query"
              type="search"
              placeholder="Nhập email hoặc tên người dùng..."
              autocomplete="off"
            />
            <button class="btn" type="submit">Tìm kiếm</button>
            <button class="btn-secondary" id="admin-user-reset" type="button">Xem tất cả</button>
          </form>
          <p class="form-message" id="admin-user-status" role="status" aria-live="polite"></p>
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
        </section>

        <section class="admin-card admin-road-section" aria-labelledby="admin-road-title">
          <div class="admin-section-heading">
            <div>
              <div class="section-eyebrow">MẠNG LƯỚI GIAO THÔNG</div>
              <h2 id="admin-road-title">Quản lý đoạn đường</h2>
              <p class="admin-card-description">
                Vẽ tuyến bằng cách chọn ít nhất hai điểm trên bản đồ; khu vực và chiều dài được lưu cùng đoạn đường.
              </p>
            </div>
            <button class="btn" id="admin-road-new" type="button">Vẽ đoạn đường mới</button>
          </div>

          <div class="admin-road-editor">
            <form class="admin-road-form" id="admin-road-form">
              <div class="form-field">
                <label for="admin-road-code">Mã đoạn đường</label>
                <input id="admin-road-code" name="edge_code" maxlength="20" required />
              </div>
              <div class="form-field">
                <label for="admin-road-name">Tên đường</label>
                <input id="admin-road-name" name="street_name" maxlength="100" required />
              </div>
              <div class="form-field">
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
              <div class="form-field">
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
              <p
                class="form-message admin-road-status"
                id="admin-road-status"
                role="status"
                aria-live="polite"
              >
                Chọn “Vẽ đoạn đường mới” hoặc sửa một đoạn trong danh sách.
              </p>
            </form>

            <div class="admin-map-column">
              <p class="admin-map-hint" id="admin-map-hint">
                Bản đồ chỉnh sửa đoạn đường
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
          <p class="admin-feedback" id="admin-road-list-status" role="status" aria-live="polite"></p>
        </section>
      </section>
    </main>
  `;
}

export function renderAdminUnauthorizedView() {
  return `
    <main class="admin-main">
      <section class="section admin-unauthorized">
        <div class="card admin-card">
          <div class="section-eyebrow">BẢO MẬT & PHÂN QUYỀN</div>
          <h2>Từ chối quyền truy cập</h2>
          <p>
            Khu vực quản trị chỉ dành riêng cho tài khoản quản trị viên (Admin).
          </p>
          <div class="admin-unauthorized-actions">
            <a class="btn" href="/login" data-link>Đổi tài khoản đăng nhập</a>
            <a class="btn btn-outline" href="/" data-link>Về Trang chủ</a>
          </div>
        </div>
      </section>
    </main>
  `;
}
