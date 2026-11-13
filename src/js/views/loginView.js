// File: src/js/views/loginView.js

/**
 * Template HTML Trang Đăng nhập / Tài khoản người dùng (No-Icon Swiss/Modern Design)
 * @returns {string} HTML string
 */
export function renderLoginView() {
  return `
    <main class="auth-main">
      <div class="auth-card card">
        <div class="auth-card-header">
          <div class="section-eyebrow">XÁC THỰC NGƯỜI DÙNG</div>
          <h2>Hà Nội Traffic AI</h2>
          <p>Cổng thông tin & quản trị giao thông thông minh</p>
        </div>

        <!-- Tab đăng nhập/đăng ký, hoặc tài khoản/đổi mật khẩu khi đã đăng nhập -->
        <div class="auth-tabs">
          <button type="button" class="auth-tab active" id="tab-login">
            Đăng nhập
          </button>
          <button type="button" class="auth-tab" id="tab-register">
            Đăng ký
          </button>
        </div>

        <!-- ===== FORM ĐĂNG NHẬP ===== -->
        <form id="login-form" novalidate>
          <div class="form-field">
            <label for="login-email">Địa chỉ Email</label>
            <input
              id="login-email"
              type="email"
              autocomplete="email"
              placeholder="you@domain.com"
              required
            />
          </div>

          <div class="form-field">
            <label for="login-password">Mật khẩu</label>
            <input
              id="login-password"
              type="password"
              autocomplete="current-password"
              placeholder="Nhập mật khẩu của bạn"
              required
            />
          </div>

          <button class="btn auth-submit" type="submit">
            Đăng nhập hệ thống
          </button>

          <p
            class="form-message"
            id="login-message"
            role="status"
            aria-live="polite"
          ></p>
        </form>

        <!-- ===== FORM ĐĂNG KÝ ===== -->
        <form id="register-form" hidden novalidate>
          <div class="form-field">
            <label for="reg-fullname">Họ và tên</label>
            <input
              id="reg-fullname"
              type="text"
              autocomplete="name"
              placeholder="Ví dụ: Nguyễn Văn A"
              required
            />
          </div>

          <div class="form-field">
            <label for="reg-email">Địa chỉ Email</label>
            <input
              id="reg-email"
              type="email"
              autocomplete="email"
              placeholder="you@domain.com"
              required
            />
          </div>

          <div class="form-field">
            <label for="reg-password">Mật khẩu mới</label>
            <input
              id="reg-password"
              type="password"
              autocomplete="new-password"
              placeholder="Tối thiểu 6 ký tự"
              minlength="6"
              required
            />
            <small class="password-hint">
              Ít nhất 6 ký tự, gồm 1 chữ hoa, 1 chữ số và 1 ký tự đặc biệt.
            </small>
          </div>

          <button class="btn auth-submit" type="submit">
            Tạo tài khoản mới
          </button>

          <p
            class="form-message"
            id="register-message"
            role="status"
            aria-live="polite"
          ></p>
        </form>

        <!-- ===== FORM ĐỔI MẬT KHẨU ===== -->
        <form id="change-password-form" hidden novalidate>
          <div class="form-field">
            <label for="current-password">Mật khẩu hiện tại</label>
            <input
              id="current-password"
              type="password"
              autocomplete="current-password"
              placeholder="Nhập mật khẩu hiện tại"
              required
            />
          </div>

          <div class="form-field">
            <label for="new-password">Mật khẩu mới</label>
            <input
              id="new-password"
              type="password"
              autocomplete="new-password"
              placeholder="Nhập mật khẩu mới"
              minlength="6"
              required
            />
            <small class="password-hint">
              Ít nhất 6 ký tự, gồm 1 chữ hoa, 1 chữ số và 1 ký tự đặc biệt.
            </small>
          </div>

          <div class="form-field">
            <label for="confirm-password">Xác nhận mật khẩu mới</label>
            <input
              id="confirm-password"
              type="password"
              autocomplete="new-password"
              placeholder="Nhập lại mật khẩu mới"
              minlength="6"
              required
            />
          </div>

          <button class="btn auth-submit" type="submit">
            Cập nhật mật khẩu
          </button>

          <p
            class="form-message"
            id="change-password-message"
            role="status"
            aria-live="polite"
          ></p>
        </form>

        <!-- ===== THÔNG TIN TÀI KHOẢN ĐÃ ĐĂNG NHẬP ===== -->
        <div id="me-panel" hidden>
          <h2 class="auth-welcome">
            Tài khoản: <span id="me-name">--</span>
          </h2>

          <dl class="me-list">
            <dt>Email</dt>
            <dd id="me-email">--</dd>

            <dt>Vai trò</dt>
            <dd id="me-role">--</dd>

            <dt>Ngày tạo</dt>
            <dd id="me-created">--</dd>
          </dl>

          <div class="auth-actions">
            <a
              class="btn btn-outline auth-admin-link"
              href="/admin"
              id="me-admin-link"
              data-link
              hidden
            >
              Truy cập trang Quản trị
            </a>
          </div>
        </div>

        <button class="btn-danger auth-logout" id="logout-btn" type="button" hidden>
          Đăng xuất tài khoản
        </button>
      </div>
    </main>
  `;
}
