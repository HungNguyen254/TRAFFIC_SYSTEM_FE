// File: src/js/components/footer.js

/**
 * Render footer dùng chung cho các trang (phong cách phi biểu tượng)
 * @returns {string} HTML string
 */
export function renderFooter() {
  return `
    <footer class="site-footer">
      <div class="footer-content">
        <div class="footer-brand">
          <span style="font-weight: 800; letter-spacing: -0.02em;">HÀ NỘI TRAFFIC AI</span>
          <span style="color: var(--text-muted); font-size: 13px; margin-left: 8px;">| Hệ thống Giám sát & Dự báo Giao thông Thông minh</span>
        </div>

        <div class="footer-links">
          <a href="/" data-link>Trang chủ</a>
          <a href="/#forecast" data-link>Dự báo tuyến</a>
          <a href="/map" data-link>Bản đồ trực tiếp</a>
          <a href="/login" data-link>Cổng thông tin</a>
        </div>

        <div class="footer-copyright">
          © ${new Date().getFullYear()} Traffic System AI. All rights reserved.
        </div>
      </div>
    </footer>
  `;
}
