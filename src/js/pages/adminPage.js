// File: src/js/pages/adminPage.js
import { renderHeader, updateHeaderAuth } from "../components/header.js";
import { renderFooter } from "../components/footer.js";
import { renderAdminUnauthorizedView, renderAdminView } from "../views/adminView.js";
import { clearSession, getToken, getUser, isAdmin, request, uploadTrafficCsv } from "../api.js";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("vi-VN");
}

function renderStat(label, value, tone = "") {
  return `
    <div class="csv-import-stat ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${formatNumber(value)}</strong>
    </div>
  `;
}

/**
 * Dựng HTML báo cáo kết quả import CSV: thống kê + bảng dòng lỗi + bảng dòng trùng
 */
export function renderImportReport(report) {
  const duplicateTotal = (report.duplicate_in_file_rows || 0) + (report.duplicate_in_db_rows || 0);
  const errors = Array.isArray(report.errors) ? report.errors : [];
  const duplicates = Array.isArray(report.duplicates) ? report.duplicates : [];

  const stats = `
    <div class="csv-import-stats">
      ${renderStat("Tổng số dòng", report.total_rows)}
      ${renderStat("Đã ghi vào DB", report.inserted_rows)}
      ${renderStat("Dòng lỗi", report.invalid_rows, report.invalid_rows ? "is-error" : "")}
      ${renderStat("Dòng trùng bị bỏ", duplicateTotal, duplicateTotal ? "is-warn" : "")}
    </div>
  `;

  const errorTable = errors.length
    ? `
      <div class="csv-import-report-title">Chi tiết dòng lỗi</div>
      <div class="admin-table-container">
        <table class="admin-table">
          <thead>
            <tr>
              <th style="width: 80px;">Dòng</th>
              <th style="width: 160px;">Mã đoạn đường</th>
              <th>Lỗi</th>
            </tr>
          </thead>
          <tbody>
            ${errors
              .map(
                (item) => `
                  <tr>
                    <td>${formatNumber(item.line)}</td>
                    <td class="csv-cell-code">${escapeHtml(item.edge_code || "--")}</td>
                    <td>
                      <ul class="csv-error-list">
                        ${(item.errors || []).map((msg) => `<li>${escapeHtml(msg)}</li>`).join("")}
                      </ul>
                    </td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `
    : "";

  const duplicateTable = duplicates.length
    ? `
      <div class="csv-import-report-title">Bản ghi trùng đã bỏ qua</div>
      <div class="admin-table-container">
        <table class="admin-table">
          <thead>
            <tr>
              <th style="width: 80px;">Dòng</th>
              <th style="width: 160px;">Mã đoạn đường</th>
              <th style="width: 90px;">Giờ</th>
              <th style="width: 110px;">Thứ</th>
              <th>Lý do</th>
            </tr>
          </thead>
          <tbody>
            ${duplicates
              .map(
                (item) => `
                  <tr>
                    <td>${formatNumber(item.line)}</td>
                    <td class="csv-cell-code">${escapeHtml(item.edge_code)}</td>
                    <td>${formatNumber(item.hour_of_day)}</td>
                    <td>${formatNumber(item.day_of_week)}</td>
                    <td>${escapeHtml(item.reason)}</td>
                  </tr>
                `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `
    : "";

  const truncatedNote = report.errors_truncated
    ? `<p class="csv-import-hint" style="margin-top: 10px;">Danh sách lỗi đã được rút gọn để giới hạn kích thước phản hồi. Toàn bộ lỗi chi tiết được ghi trong log máy chủ.</p>`
    : "";

  return `
    ${stats}
    ${report.truncated ? `<p class="csv-import-hint">Đã xoá toàn bộ dữ liệu cũ trước khi import.</p>` : ""}
    ${errorTable}
    ${duplicateTable}
    ${truncatedNote}
  `;
}

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

    // Gắn sự kiện upload CSV dữ liệu giao thông
    const csvForm = document.getElementById("csv-upload-form");
    const csvInput = document.getElementById("csv-file-input");
    const csvTruncate = document.getElementById("csv-truncate-input");
    const csvBtn = document.getElementById("csv-upload-btn");
    const csvMessage = document.getElementById("csv-upload-message");
    const csvReport = document.getElementById("csv-import-report");

    if (csvForm && csvInput && csvBtn && csvMessage && csvReport) {
      csvForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const file = csvInput.files && csvInput.files[0];
        csvMessage.style.color = "";
        csvReport.hidden = true;
        csvReport.innerHTML = "";

        if (!file) {
          csvMessage.style.color = "#dc2626";
          csvMessage.textContent = "Vui lòng chọn file CSV trước khi tải lên.";
          return;
        }
        if (!file.name.toLowerCase().endsWith(".csv")) {
          csvMessage.style.color = "#dc2626";
          csvMessage.textContent = "Chỉ chấp nhận file định dạng .csv.";
          return;
        }

        csvBtn.disabled = true;
        csvBtn.textContent = "Đang kiểm tra & import...";
        csvMessage.textContent = "";

        try {
          const report = await uploadTrafficCsv(file, {
            truncate: Boolean(csvTruncate && csvTruncate.checked),
          });
          const hasIssue = (report.invalid_rows || 0) > 0;
          csvMessage.style.color = hasIssue ? "#b45309" : "#16a34a";
          csvMessage.textContent = `Hoàn tất: ghi ${formatNumber(report.inserted_rows)}/${formatNumber(
            report.total_rows,
          )} dòng, bỏ qua ${formatNumber(report.skipped_rows)} dòng.`;
          csvReport.innerHTML = renderImportReport(report);
          csvReport.hidden = false;
          csvForm.reset();
        } catch (err) {
          csvMessage.style.color = "#dc2626";
          csvMessage.textContent = `Lỗi: ${err.message}`;
        } finally {
          csvBtn.disabled = false;
          csvBtn.textContent = "Tải lên & kiểm tra dữ liệu";
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
