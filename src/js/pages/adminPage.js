// File: src/js/pages/adminPage.js
import { renderHeader, updateHeaderAuth } from "../components/header.js";
import { renderFooter } from "../components/footer.js";
import { renderAdminUnauthorizedView, renderAdminView } from "../views/adminView.js";
import { clearSession, getToken, getUser, isAdmin, request } from "../api.js";

export const adminPage = {
  mount(container, navigateTo) {
    // Chưa đăng nhập hoặc không phải admin -> hiển thị màn hình từ chối truy cập
    if (!getToken() || !isAdmin()) {
      container.innerHTML = `
        ${renderHeader("/admin")}
        ${renderAdminUnauthorizedView()}
        ${renderFooter()}
      `;
      return;
    }

    // Đã là admin -> hiển thị giao diện quản trị đầy đủ
    container.innerHTML = `
      ${renderHeader("/admin")}
      ${renderAdminView()}
      ${renderFooter()}
    `;

    // Cập nhật trạng thái session
    const user = getUser();
    const loggedEl = document.getElementById("st-logged");
    const emailEl = document.getElementById("st-email");
    const roleEl = document.getElementById("st-role");
    if (loggedEl) loggedEl.textContent = user ? "Có" : "Không";
    if (emailEl) emailEl.textContent = user?.user_id || user?.email || "--";
    if (roleEl) roleEl.textContent = user?.role === "admin" ? "Quản trị viên" : user?.role || "--";

    // Gắn sự kiện nút Huấn luyện lại model
    const retrainBtn = document.getElementById("retrain-btn");
    const retrainMessage = document.getElementById("retrain-message");

    if (retrainBtn && retrainMessage) {
      retrainBtn.addEventListener("click", async () => {
        retrainBtn.disabled = true;
        retrainBtn.textContent = "Đang gửi yêu cầu...";
        retrainMessage.textContent = "";
        retrainMessage.style.color = "";

        try {
          const data = await request("/admin/retrain-model", {
            method: "POST",
            auth: true,
          });
          retrainMessage.style.color = "#16a34a";
          retrainMessage.textContent = `${data.message || "Backend đã tiếp nhận yêu cầu huấn luyện trong tiến trình ngầm."}`;
        } catch (err) {
          retrainMessage.style.color = "#dc2626";
          retrainMessage.textContent = `Lỗi: ${err.message}`;
        } finally {
          retrainBtn.disabled = false;
          retrainBtn.textContent = "Huấn luyện lại mô hình";
        }
      });
    }

    // Gắn sự kiện nút Đăng xuất
    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        clearSession();
        updateHeaderAuth();
        navigateTo("/");
      });
    }
  },

  unmount() { },
};
