// File: src/js/views/premiumView.js

/**
 * Template HTML trang Nâng cấp gói Premium (pricing style)
 * @param {string} currentPlan - "standard" hoặc "premium"
 * @returns {string} HTML string
 */
export function renderPremiumView(currentPlan = "standard") {
  const isPremium = currentPlan === "premium";

  return `
    <main class="premium-page">
      <section class="premium-hero">
        <div class="hero-pill">
          <span class="hero-pill-badge premium-badge">PREMIUM</span>
          <span>Mở khóa toàn bộ tính năng dự báo giao thông</span>
        </div>
        <h1>Chọn gói phù hợp <span class="gradient-text">với bạn</span></h1>
        <p class="section-desc">
          Nâng cấp lên Premium để sử dụng đầy đủ các tính năng dự báo nâng cao, so sánh tuyến đường
          và trò chuyện với trợ lý AI không giới hạn.
        </p>
      </section>

      <section class="pricing-grid">
        <!-- Gói STANDARD -->
        <article class="pricing-card ${isPremium ? "" : "is-current"}">
          <div class="pricing-head">
            <h2>Standard</h2>
            <p class="pricing-desc">Dành cho người dùng mới bắt đầu</p>
          </div>
          <div class="pricing-price">
            <strong>0đ</strong><span>/tháng</span>
          </div>
          <ul class="pricing-features">
            <li class="disabled">✗ Dự báo theo khoảng thời gian (Bản đồ)</li>
            <li class="disabled">✗ Dự báo đoạn đường theo thời tiết</li>
            <li class="disabled">✗ So sánh 2 tuyến đường</li>
            <li>✓ Xem bản đồ giao thông thời gian thực</li>
            <li>✓ Chatbot AI giới hạn <strong>10 lần/ngày</strong></li>
          </ul>
          ${
            isPremium
              ? `<button class="btn btn-outline" disabled>Bạn đang dùng gói cao hơn</button>`
              : `<button class="btn btn-outline" disabled>Gói hiện tại của bạn</button>`
          }
        </article>

        <!-- Gói PREMIUM -->
        <article class="pricing-card premium ${isPremium ? "is-current" : ""}">
          <div class="pricing-flag">PHỔ BIẾN NHẤT</div>
          <div class="pricing-head">
            <h2>Premium</h2>
            <p class="pricing-desc">Toàn quyền trải nghiệm hệ thống</p>
          </div>
          <div class="pricing-price">
            <strong>99.000đ</strong><span>/tháng</span>
          </div>
          <ul class="pricing-features">
            <li>✓ Dự báo theo khoảng thời gian (Bản đồ)</li>
            <li>✓ Dự báo đoạn đường theo thời tiết</li>
            <li>✓ So sánh 2 tuyến đường</li>
            <li>✓ Bản đồ giao thông thời gian thực</li>
            <li>✓ Chatbot AI <strong>không giới hạn</strong></li>
          </ul>
          ${
            isPremium
              ? `<button class="btn" id="premium-upgrade-btn" disabled>Bạn đang là thành viên Premium ✓</button>`
              : `<button class="btn" id="premium-upgrade-btn">Nâng cấp Premium ngay</button>`
          }
          <p class="pricing-note">Demo: chưa tích hợp cổng thanh toán — nhấn là nâng cấp ngay.</p>
        </article>
      </section>
    </main>
  `;
}
