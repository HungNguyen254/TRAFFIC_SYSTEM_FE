// File: src/js/pages/premiumPage.js
import { renderHeader } from "../components/header.js";
import { renderFooter } from "../components/footer.js";
import { showToast } from "../components/toast.js";
import { renderPremiumView } from "../views/premiumView.js";
import { getPlan, isLoggedIn, upgradeToPremium, refreshPlan } from "../api.js";

export const premiumPage = {
  mount(container, navigateTo) {
    const currentPlan = getPlan();
    container.innerHTML = `
      ${renderHeader("/premium")}
      ${renderPremiumView(currentPlan)}
      ${renderFooter()}
    `;

    if (!isLoggedIn()) {
      // Chưa đăng nhập: chuyển đến trang đăng nhập
      showToast("Vui lòng đăng nhập để nâng cấp gói Premium.", "info");
      setTimeout(() => navigateTo("/login?redirect=/premium"), 800);
      return;
    }

    const upgradeBtn = document.getElementById("premium-upgrade-btn");
    upgradeBtn?.addEventListener("click", async () => {
      upgradeBtn.disabled = true;
      upgradeBtn.textContent = "Đang nâng cấp...";
      try {
        await upgradeToPremium();
        await refreshPlan();
        showToast(
          "🎉 Nâng cấp Premium thành công! Tất cả tính năng đã được mở khóa.",
          "success",
        );
        setTimeout(() => navigateTo("/"), 1200);
      } catch (err) {
        showToast(`Nâng cấp thất bại: ${err.message}`, "error");
        upgradeBtn.disabled = false;
        upgradeBtn.textContent = "Thử nâng cấp lại";
      }
    });
  },

  unmount() {},
};
