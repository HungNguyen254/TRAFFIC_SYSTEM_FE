// File: src/js/views/loginView.js

/**
 * Template HTML Trang Đăng nhập / Tài khoản
 * @returns {string} HTML string
 */
export function renderLoginView() {
  return `
    <main class="auth-main">
      <div class="auth-card card">
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
            <label for="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              autocomplete="email"
              placeholder="you@example.com"
              required
            />
          </div>
          <div class="form-field">
            <label for="login-password">Mật khẩu</label>
            <input
              id="login-password"
              type="password"
              autocomplete="current-password"
              placeholder="••••••••"
              required
            />
          </div>
          <button class="btn auth-submit" type="submit">Đăng nhập</button>
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
              placeholder="Nguyễn Văn A"
              required
            />
          </div>
          <div class="form-field">
            <label for="reg-email">Email</label>
            <input
              id="reg-email"
              type="email"
              autocomplete="email"
              placeholder="you@example.com"
              required
            />
          </div>
          <div class="form-field">
            <label for="reg-password">Mật khẩu</label>
            <input
              id="reg-password"
              type="password"
              autocomplete="new-password"
              placeholder="••••••••"
              minlength="6"
              required
            />
            <small class="password-hint">
              Ít nhất 6 ký tự, gồm 1 chữ hoa, 1 chữ số và 1 ký tự đặc biệt.
            </small>
          </div>
          <button class="btn auth-submit" type="submit">Tạo tài khoản</button>
          <p
            class="form-message"
            id="register-message"
            role="status"
            aria-live="polite"
          ></p>
        </form>

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
            <label for="confirm-password">Nhập lại mật khẩu mới</label>
            <input
              id="confirm-password"
              type="password"
              autocomplete="new-password"
              placeholder="Nhập lại mật khẩu mới"
              minlength="6"
              required
            />
          </div>
          <button class="btn auth-submit" type="submit">Cập nhật mật khẩu</button>
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
            Xin chào, <span id="me-name">--</span> 👋
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
              hidden
              >Vào trang quản trị</a
            >
          </div>
        </div>
        <button class="btn-danger auth-logout" id="logout-btn" type="button" hidden>
          Đăng xuất
        </button>
      </div>
    </main>
  `;
}
