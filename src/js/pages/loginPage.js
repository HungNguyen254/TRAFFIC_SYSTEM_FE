// File: src/js/pages/loginPage.js
import { renderHeader, updateHeaderAuth } from "../components/header.js";
import { renderFooter } from "../components/footer.js";
import { renderLoginView } from "../views/loginView.js";
import {
  clearSession,
  isLoggedIn,
  request,
  saveSession,
  cancelPremium,
} from "../api.js";
import { refreshPlan } from "../api.js";
import { showToast } from "../components/toast.js";
import { initTheme } from "../theme.js";

function getPasswordValidationMessage(password) {
  if (password.length < 6) return "Mật khẩu phải có ít nhất 6 ký tự.";
  if (!/\p{Lu}/u.test(password)) {
    return "Mật khẩu phải có ít nhất 1 ký tự viết hoa.";
  }
  if (!/\p{Nd}/u.test(password)) {
    return "Mật khẩu phải có ít nhất 1 chữ số.";
  }
  if (!/[^\p{L}\p{N}]/u.test(password)) {
    return "Mật khẩu phải có ít nhất 1 ký tự đặc biệt.";
  }
  return "";
}

export const loginPage = {
  mount(container, navigateTo) {
    container.innerHTML = `
      ${renderHeader("/login")}
      ${renderLoginView()}
      ${renderFooter()}
    `;

    const tabLogin = document.getElementById("tab-login");
    const tabRegister = document.getElementById("tab-register");
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");
    const changePasswordForm = document.getElementById("change-password-form");
    const mePanel = document.getElementById("me-panel");
    const logoutButton = document.getElementById("logout-btn");
    const tabContainer = tabLogin?.parentElement;
    const noticeEl = document.getElementById("auth-notice");

    if (
      !tabLogin ||
      !tabRegister ||
      !loginForm ||
      !registerForm ||
      !logoutButton
    )
      return;

    const queryParams = new URLSearchParams(window.location.search);
    const redirectTarget = queryParams.get("redirect");
    const authReason = queryParams.get("reason");

    if (noticeEl && redirectTarget && !isLoggedIn()) {
      noticeEl.hidden = false;
      if (authReason === "admin_required" || redirectTarget.includes("admin")) {
        noticeEl.textContent =
          "Khu vực Quản trị yêu cầu bạn phải đăng nhập tài khoản có quyền Quản trị viên (Admin).";
      } else {
        noticeEl.textContent =
          "Vui lòng đăng nhập tài khoản để tiếp tục truy cập.";
      }
    }

    logoutButton.addEventListener("click", () => {
      clearSession();
      updateHeaderAuth();
      showToast("Đăng xuất thành công.", "info");
      navigateTo("/");
    });

    function switchAccountTab(showAccount) {
      [tabLogin, tabRegister, tabTheme].forEach((t) =>
        t.classList.remove("active"),
      );
      tabLogin.classList.toggle("active", showAccount);
      tabRegister.classList.toggle("active", !showAccount);
      mePanel.hidden = !showAccount;
      changePasswordForm.hidden = showAccount;
      themePanel.hidden = true;
      logoutButton.hidden = !showAccount;
    }

    function switchTab(showLogin) {
      [tabLogin, tabRegister, tabTheme].forEach((t) =>
        t.classList.remove("active"),
      );
      tabLogin.classList.toggle("active", showLogin);
      tabRegister.classList.toggle("active", !showLogin);
      loginForm.hidden = !showLogin;
      registerForm.hidden = showLogin;
      changePasswordForm.hidden = true;
      mePanel.hidden = true;
      themePanel.hidden = true;
      logoutButton.hidden = true;
    }

    // ---- Hủy gói Premium ----
    function openCancelConfirmModal() {
      const overlay = document.createElement("div");
      overlay.className = "modal-overlay";
      overlay.innerHTML = `
        <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div class="modal-icon">⚠️</div>
          <h3 id="modal-title">Hủy gói Premium?</h3>
          <p>
            Bạn sẽ mất quyền dùng <strong>dự báo theo khoảng thời gian</strong>,
            <strong>dự báo đoạn đường</strong>, <strong>so sánh 2 tuyến đường</strong>
            và chatbot sẽ giới hạn <strong>10 tin nhắn/ngày</strong>.
          </p>
          <div class="modal-actions">
            <button class="btn btn-outline" data-action="keep">Giữ gói Premium</button>
            <button class="btn-danger" data-action="cancel">Xác nhận hủy</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const close = () => overlay.remove();
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close();
      });
      document.addEventListener("keydown", function onEsc(e) {
        if (e.key === "Escape") {
          close();
          document.removeEventListener("keydown", onEsc);
        }
      });

      const doCancel = async () => {
        const confirmBtn = overlay.querySelector('[data-action="cancel"]');
        confirmBtn.disabled = true;
        confirmBtn.textContent = "Đang xử lý...";
        try {
          await cancelPremium();
          updateHeaderAuth();
          showToast("Đã hủy gói Premium. Tài khoản quay về Standard.", "info");
          navigateTo("/");
        } catch (err) {
          showToast(`Lỗi: ${err.message}`, "error");
        } finally {
          close();
        }
      };

      overlay
        .querySelector('[data-action="keep"]')
        .addEventListener("click", close);
      overlay
        .querySelector('[data-action="cancel"]')
        .addEventListener("click", doCancel);
    }

    function initCancelPremium() {
      const cancelBtn = document.getElementById("cancel-premium-btn");
      cancelBtn?.addEventListener("click", openCancelConfirmModal);
    }

    // ---- Lấy thông tin tài khoản (GET /auth/me) ----
    async function loadMe() {
      try {
        const user = await request("/auth/me", { auth: true });
        const nameEl = document.getElementById("me-name");
        const emailEl = document.getElementById("me-email");
        const roleEl = document.getElementById("me-role");
        const planEl = document.getElementById("me-plan");
        const createdEl = document.getElementById("me-created");
        const adminLink = document.getElementById("me-admin-link");
        const premiumCancelBox = document.getElementById("premium-cancel-box");

        if (nameEl) nameEl.textContent = user.full_name || user.email;
        if (emailEl) emailEl.textContent = user.email;
        if (roleEl)
          roleEl.textContent =
            user.role === "admin" ? "Quản trị viên" : "Người dùng";
        if (planEl) {
          const isPremiumUser = user.plan === "premium";
          planEl.textContent = isPremiumUser ? "Premium" : "Standard";
          planEl.style.fontWeight = "700";
          planEl.style.color = isPremiumUser ? "#d97706" : "";
        }
        if (premiumCancelBox) premiumCancelBox.hidden = user.plan !== "premium";
        if (createdEl) {
          createdEl.textContent = new Date(user.created_at).toLocaleDateString(
            "vi-VN",
          );
        }
        if (adminLink) adminLink.hidden = user.role !== "admin";
      } catch {
        // Token hết hạn -> về form đăng nhập
        clearSession();
        updateHeaderAuth();
        navigateTo("/login");
      }
    }

    function initChangePassword() {
      changePasswordForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const message = document.getElementById("change-password-message");
        const currentPassword =
          document.getElementById("current-password").value;
        const newPassword = document.getElementById("new-password").value;
        const confirmPassword =
          document.getElementById("confirm-password").value;
        const submitButton = changePasswordForm.querySelector(
          'button[type="submit"]',
        );

        const passwordError = getPasswordValidationMessage(newPassword);
        if (passwordError) {
          showToast(`Lỗi: ${passwordError}`, "error");
          return;
        }

        if (newPassword !== confirmPassword) {
          showToast("Lỗi: Mật khẩu nhập lại không khớp.", "error");
          return;
        }

        submitButton.disabled = true;
        message.style.color = "";
        message.textContent = "Đang cập nhật mật khẩu...";
        try {
          await request("/auth/change-password", {
            method: "POST",
            body: {
              current_password: currentPassword,
              new_password: newPassword,
            },
            auth: true,
          });
          changePasswordForm.reset();
          showToast("Đổi mật khẩu thành công.", "success");
        } catch (err) {
          showToast(`Lỗi: ${err.message}`, "error");
        } finally {
          submitButton.disabled = false;
        }
      });
    }

    // ---- Tab Giao diện (hiện cả khi đã đăng nhập lẫn chưa) ----
    const tabTheme = document.getElementById("tab-theme");
    const themePanel = document.getElementById("theme-panel");
    const themeManager = initTheme();
    tabTheme.hidden = false;

    function hideAllPanels() {
      loginForm.hidden = true;
      registerForm.hidden = true;
      changePasswordForm.hidden = true;
      mePanel.hidden = true;
      themePanel.hidden = true;
      logoutButton.hidden = true;
      [tabLogin, tabRegister, tabTheme].forEach((t) =>
        t.classList.remove("active"),
      );
    }

    function switchThemeTab() {
      hideAllPanels();
      tabTheme.classList.add("active");
      themePanel.hidden = false;
      // Đánh dấu lựa chọn hiện tại
      const current = themeManager.get();
      themePanel.querySelectorAll(".theme-option").forEach((opt) => {
        opt.classList.toggle("selected", opt.dataset.themeChoice === current);
        opt.setAttribute(
          "aria-checked",
          String(opt.dataset.themeChoice === current),
        );
      });
    }

    tabTheme.addEventListener("click", switchThemeTab);

    themePanel?.querySelectorAll(".theme-option").forEach((opt) => {
      opt.addEventListener("click", () => {
        const choice = opt.dataset.themeChoice;
        themeManager.set(choice);
        themePanel.querySelectorAll(".theme-option").forEach((o) => {
          o.classList.toggle("selected", o.dataset.themeChoice === choice);
          o.setAttribute(
            "aria-checked",
            String(o.dataset.themeChoice === choice),
          );
        });
        const msg = document.getElementById("theme-message");
        if (msg) {
          msg.style.color = "";
          msg.textContent = `Đã chuyển sang giao diện ${
            choice === "light"
              ? "Sáng"
              : choice === "dark"
                ? "Tối"
                : "theo Hệ thống"
          }.`;
        }
        showToast(
          `Đã chuyển sang giao diện ${
            choice === "light"
              ? "Sáng"
              : choice === "dark"
                ? "Tối"
                : "theo Hệ thống"
          }.`,
          "success",
        );
      });
    });

    // Đã đăng nhập -> hiện panel "tài khoản của tôi"
    if (isLoggedIn()) {
      tabLogin.textContent = "Tài khoản";
      tabRegister.textContent = "Đổi mật khẩu";
      if (tabContainer) tabContainer.hidden = false;
      loginForm.hidden = true;
      registerForm.hidden = true;
      // Ghi đè tab handlers để có theme tab
      tabLogin.addEventListener("click", () => switchAccountTab(true));
      tabRegister.addEventListener("click", () => switchAccountTab(false));
      switchAccountTab(true);
      initChangePassword();
      initCancelPremium();
      loadMe();
      return;
    }

    // ---- Chuyển tab ----
    tabLogin.addEventListener("click", () => switchTab(true));
    tabRegister.addEventListener("click", () => switchTab(false));

    // ---- Đăng nhập ----
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const message = document.getElementById("login-message");
      const email = document.getElementById("login-email").value.trim();
      const password = document.getElementById("login-password").value;
      message.textContent = "Đang xử lý...";
      message.style.color = "";

      try {
        const tokenRes = await request("/auth/login", {
          method: "POST",
          body: { email, password },
        });
        saveSession(tokenRes.access_token, {
          user_id: tokenRes.user_id,
          role: tokenRes.role,
          plan: tokenRes.plan || "standard",
        });
        // Đồng bộ plan (và các thông tin mới nhất) từ server ngay sau khi đăng nhập
        await refreshPlan();
        updateHeaderAuth();
        showToast("Đăng nhập thành công!", "success");
        const target =
          redirectTarget && redirectTarget.startsWith("/")
            ? decodeURIComponent(redirectTarget)
            : "/";
        setTimeout(() => navigateTo(target), 400);
      } catch (err) {
        showToast(`Lỗi: ${err.message}`, "error");
      }
    });

    // ---- Đăng ký ----
    registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const message = document.getElementById("register-message");
      const fullName = document.getElementById("reg-fullname").value.trim();
      const email = document.getElementById("reg-email").value.trim();
      const password = document.getElementById("reg-password").value;
      const confirmPassword = document.getElementById(
        "reg-confirm-password",
      ).value;
      const passwordError = getPasswordValidationMessage(password);
      if (passwordError) {
        showToast(`Lỗi: ${passwordError}`, "error");
        return;
      }
      if (password !== confirmPassword) {
        showToast("Lỗi: Mật khẩu xác nhận không khớp.", "error");
        return;
      }
      message.textContent = "Đang xử lý...";
      message.style.color = "";

      try {
        await request("/auth/register", {
          method: "POST",
          body: {
            email,
            password,
            confirm_password: confirmPassword,
            full_name: fullName,
          },
        });
        showToast("Tạo tài khoản thành công! Hãy đăng nhập.", "success");
        registerForm.reset();
        setTimeout(() => switchTab(true), 800);
      } catch (err) {
        showToast(`Lỗi: ${err.message}`, "error");
      }
    });
  },

  unmount() {},
};
