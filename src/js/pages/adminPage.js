// File: src/js/pages/adminPage.js
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { renderHeader, updateHeaderAuth } from "../components/header.js";
import { renderFooter } from "../components/footer.js";
import { renderAdminUnauthorizedView, renderAdminView } from "../views/adminView.js";
import { clearSession, getToken, getUser, request, saveSession } from "../api.js";

let activeAdminMap = null;
let adminPageActive = false;

function formatNumber(value) {
  return Number(value || 0).toLocaleString("vi-VN");
}

function formatLength(value) {
  return `${Number(value || 0).toLocaleString("vi-VN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  })} km`;
}

function describeError(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}

export const adminPage = {
  mount(container, navigateTo) {
    adminPageActive = true;
    if (!getToken()) {
      container.innerHTML = `
        ${renderHeader("/admin")}
        ${renderAdminUnauthorizedView()}
        ${renderFooter()}
      `;
      return;
    }

    container.innerHTML = `
      ${renderHeader("/admin")}
      ${renderAdminView()}
      ${renderFooter()}
    `;

    const user = getUser();
    const emailEl = document.getElementById("st-email");
    const roleEl = document.getElementById("st-role");
    const dashboardStatus = document.getElementById("admin-dashboard-status");
    const roadListStatus = document.getElementById("admin-road-list-status");
    const roadStatus = document.getElementById("admin-road-status");
    const mapHint = document.getElementById("admin-map-hint");
    const roadForm = document.getElementById("admin-road-form");
    const roadRows = document.getElementById("admin-road-rows");
    const districtOptions = document.getElementById("admin-road-district-options");
    const roadCodeInput = document.getElementById("admin-road-code");
    const roadNameInput = document.getElementById("admin-road-name");
    const roadDistrictInput = document.getElementById("admin-road-district");
    const roadSpeedInput = document.getElementById("admin-road-speed");
    const roadLength = document.getElementById("admin-road-length");
    const newRoadButton = document.getElementById("admin-road-new");
    const drawButton = document.getElementById("admin-road-draw");
    const finishDrawButton = document.getElementById("admin-road-finish");
    const saveRoadButton = document.getElementById("admin-road-save");
    const cancelRoadButton = document.getElementById("admin-road-cancel");
    const retrainButton = document.getElementById("retrain-btn");
    const retrainMessage = document.getElementById("retrain-message");
    const userSearchForm = document.getElementById("admin-user-search-form");
    const userSearchInput = document.getElementById("admin-user-search-input");
    const userResetButton = document.getElementById("admin-user-reset");
    const userStatus = document.getElementById("admin-user-status");
    const userRows = document.getElementById("admin-user-rows");

    if (emailEl) emailEl.textContent = user?.email || user?.user_id || "--";
    if (roleEl) roleEl.textContent = user?.role === "admin" ? "Quản trị viên" : user?.role || "--";

    let roads = [];
    let districts = [];
    let editingEdgeId = null;
    let coordinates = [];
    let drawing = false;
    let saving = false;
    let roadLayer = null;
    let draftLayer = null;
    let users = [];
    let editingUserId = null;

    function setMessage(element, message, isError = false) {
      if (!element) return;
      element.textContent = message;
      element.classList.toggle("error", isError);
    }

    function setUnauthorizedView() {
      if (!adminPageActive) return;
      if (activeAdminMap) {
        activeAdminMap.remove();
        activeAdminMap = null;
      }
      container.innerHTML = `
        ${renderHeader("/admin")}
        ${renderAdminUnauthorizedView()}
        ${renderFooter()}
      `;
    }

    function handleRequestError(element, error, fallback) {
      if (!adminPageActive) return;
      const message = describeError(error, fallback);
      if (!getToken()) {
        updateHeaderAuth();
        navigateTo("/login?redirect=%2Fadmin&reason=admin_required");
        return;
      }
      if (/403|quyền|quản trị viên/i.test(message)) {
        setUnauthorizedView();
        return;
      }
      setMessage(element, message, true);
    }

    function updateDrawingControls() {
      if (drawButton) drawButton.disabled = drawing || !activeAdminMap;
      if (finishDrawButton) {
        finishDrawButton.hidden = !drawing;
        finishDrawButton.disabled = coordinates.length < 2;
      }
      if (saveRoadButton) {
        saveRoadButton.disabled = drawing || coordinates.length < 2 || saving;
      }
      if (cancelRoadButton) {
        cancelRoadButton.hidden =
          !editingEdgeId && !drawing && coordinates.length === 0;
      }
    }

    function calculateLengthKm(points) {
      const radiusKm = 6371;
      let total = 0;
      for (let index = 1; index < points.length; index += 1) {
        const start = points[index - 1];
        const end = points[index];
        const lat1 = (start.lat * Math.PI) / 180;
        const lat2 = (end.lat * Math.PI) / 180;
        const deltaLat = lat2 - lat1;
        const deltaLng = ((end.lng - start.lng) * Math.PI) / 180;
        const a =
          Math.sin(deltaLat / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
        total += 2 * radiusKm * Math.asin(Math.sqrt(a));
      }
      return total;
    }

    function renderDraftGeometry() {
      if (!draftLayer) return;
      draftLayer.clearLayers();
      const latLngs = coordinates.map(({ lat, lng }) => [lat, lng]);
      if (latLngs.length >= 2) {
        L.polyline(latLngs, {
          color: "#2563eb",
          weight: 5,
          opacity: 0.9,
        }).addTo(draftLayer);
      }
      coordinates.forEach((point, index) => {
        L.circleMarker([point.lat, point.lng], {
          radius: index === 0 || index === coordinates.length - 1 ? 7 : 5,
          color: "#ffffff",
          weight: 2,
          fillColor: index === 0 ? "#16a34a" : index === coordinates.length - 1 ? "#dc2626" : "#2563eb",
          fillOpacity: 1,
          bubblingMouseEvents: false,
        })
          .bindTooltip(`Điểm ${index + 1}`)
          .addTo(draftLayer);
      });

      const length = calculateLengthKm(coordinates);
      if (roadLength) {
        roadLength.textContent =
          coordinates.length >= 2
            ? `Chiều dài ước tính: ${formatLength(length)} · ${coordinates.length} điểm`
            : `Đã chọn ${coordinates.length} điểm · cần ít nhất 2 điểm`;
      }
      updateDrawingControls();
    }

    function renderRoadMap() {
      if (!roadLayer) return;
      roadLayer.clearLayers();
      roads.forEach((road) => {
        if (!Array.isArray(road.coordinates) || road.coordinates.length < 2) return;
        const isSelected = road.edge_id === editingEdgeId;
        L.polyline(
          road.coordinates.map(({ lat, lng }) => [lat, lng]),
          {
            color: isSelected ? "#2563eb" : "#64748b",
            weight: isSelected ? 6 : 4,
            opacity: isSelected ? 0.95 : 0.65,
          },
        )
          .bindTooltip(`${road.edge_code} · ${road.street_name}`)
          .addTo(roadLayer);
      });
    }

    function renderRoadRows() {
      if (!roadRows) return;
      roadRows.replaceChildren();
      if (!roads.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 6;
        cell.className = "admin-empty";
        cell.textContent = "Chưa có đoạn đường nào.";
        row.append(cell);
        roadRows.append(row);
        return;
      }

      roads.forEach((road) => {
        const row = document.createElement("tr");
        [
          road.edge_code,
          road.street_name,
          road.district || "Chưa gán",
          formatLength(road.length_km),
          `${formatNumber(road.max_speed_limit)} km/h`,
        ].forEach((value) => {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.append(cell);
        });

        const actions = document.createElement("td");
        actions.className = "admin-road-actions";
        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "admin-row-action";
        editButton.textContent = "Sửa";
        editButton.addEventListener("click", () => beginEditingRoad(road));

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "admin-row-action admin-row-delete";
        deleteButton.textContent = "Xóa";
        deleteButton.addEventListener("click", () => deleteRoad(road));
        actions.append(editButton, deleteButton);
        row.append(actions);
        roadRows.append(row);
      });
    }

    function renderDistrictOptions() {
      if (!districtOptions) return;
      districtOptions.replaceChildren();
      districts.forEach((district) => {
        const option = document.createElement("option");
        option.value = district;
        districtOptions.append(option);
      });
    }

    function renderDashboard(data) {
      const metrics = [
        ["admin-total-edges", data.total_edges],
        ["admin-total-records", data.total_traffic_records],
        ["admin-forecast-count", data.forecast_requests],
      ];
      metrics.forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = formatNumber(value);
      });

      const topAreas = Array.isArray(data.top_congested_areas)
        ? data.top_congested_areas
        : [];
      const topArea = document.getElementById("admin-top-area");
      if (topArea) topArea.textContent = topAreas[0]?.district || "Chưa có dữ liệu";

      const list = document.getElementById("admin-top-areas");
      if (!list) return;
      list.replaceChildren();
      if (!topAreas.length) {
        const empty = document.createElement("li");
        empty.className = "admin-empty";
        empty.textContent = "Chưa có bản ghi ùn tắc nghiêm trọng.";
        list.append(empty);
        return;
      }

      const maxCount = Math.max(...topAreas.map((area) => area.congested_records), 1);
      topAreas.forEach((area) => {
        const item = document.createElement("li");
        const heading = document.createElement("div");
        heading.className = "admin-area-heading";
        const district = document.createElement("strong");
        district.textContent = area.district;
        const count = document.createElement("span");
        count.textContent = formatNumber(area.congested_records);
        heading.append(district, count);
        const track = document.createElement("div");
        track.className = "admin-area-track";
        const bar = document.createElement("span");
        bar.style.width = `${Math.max(4, (area.congested_records / maxCount) * 100)}%`;
        track.append(bar);
        item.append(heading, track);
        list.append(item);
      });
    }

    async function loadDashboard() {
      try {
        const data = await request("/admin/dashboard", { auth: true });
        if (!adminPageActive) return;
        renderDashboard(data);
        setMessage(dashboardStatus, "");
      } catch (error) {
        handleRequestError(
          dashboardStatus,
          error,
          "Không thể tải thống kê quản trị.",
        );
      }
    }

    async function loadRoads() {
      try {
        const data = await request("/admin/roads", { auth: true });
        if (!adminPageActive) return;
        roads = Array.isArray(data.roads) ? data.roads : [];
        districts = Array.isArray(data.districts) ? data.districts : [];
        renderDistrictOptions();
        renderRoadRows();
        renderRoadMap();
        setMessage(roadListStatus, "");
      } catch (error) {
        handleRequestError(
          roadListStatus,
          error,
          "Không thể tải danh sách đoạn đường.",
        );
      }
    }

    function renderUserRows() {
      if (!userRows) return;
      userRows.replaceChildren();
      if (!users.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 5;
        cell.className = "admin-empty";
        cell.textContent = "Không tìm thấy tài khoản phù hợp.";
        row.append(cell);
        userRows.append(row);
        return;
      }

      users.forEach((user) => {
        const row = document.createElement("tr");
        const editing = editingUserId === user.user_id;

        const nameCell = document.createElement("td");
        if (editing) {
          const input = document.createElement("input");
          input.id = `user-name-${user.user_id}`;
          input.value = user.full_name;
          nameCell.append(input);
        } else {
          nameCell.textContent = user.full_name;
        }

        const emailCell = document.createElement("td");
        if (editing) {
          const input = document.createElement("input");
          input.id = `user-email-${user.user_id}`;
          input.type = "email";
          input.value = user.email;
          emailCell.append(input);
        } else {
          emailCell.textContent = user.email;
        }

        const roleCell = document.createElement("td");
        if (editing) {
          const select = document.createElement("select");
          select.id = `user-role-${user.user_id}`;
          ["user", "admin"].forEach((role) => {
            const option = document.createElement("option");
            option.value = role;
            option.textContent = role === "admin" ? "Quản trị viên" : "Người dùng";
            option.selected = role === user.role;
            select.append(option);
          });
          roleCell.append(select);
        } else {
          roleCell.textContent = user.role === "admin" ? "Quản trị viên" : "Người dùng";
        }

        const createdCell = document.createElement("td");
        createdCell.textContent = user.created_at
          ? new Date(user.created_at).toLocaleDateString("vi-VN")
          : "--";

        const actions = document.createElement("td");
        actions.className = "admin-road-actions";
        if (editing) {
          const saveButton = document.createElement("button");
          saveButton.type = "button";
          saveButton.className = "admin-row-action";
          saveButton.textContent = "Lưu";
          saveButton.addEventListener("click", () => saveUser(user));

          const cancelButton = document.createElement("button");
          cancelButton.type = "button";
          cancelButton.className = "admin-row-action";
          cancelButton.textContent = "Hủy";
          cancelButton.addEventListener("click", () => {
            editingUserId = null;
            renderUserRows();
          });
          actions.append(saveButton, cancelButton);
        } else {
          const editButton = document.createElement("button");
          editButton.type = "button";
          editButton.className = "admin-row-action";
          editButton.textContent = "Sửa";
          editButton.addEventListener("click", () => {
            editingUserId = user.user_id;
            renderUserRows();
          });

          const deleteButton = document.createElement("button");
          deleteButton.type = "button";
          deleteButton.className = "admin-row-action admin-row-delete";
          deleteButton.textContent = "Xóa";
          deleteButton.addEventListener("click", () => deleteUser(user));
          actions.append(editButton, deleteButton);
        }

        row.append(nameCell, emailCell, roleCell, createdCell, actions);
        userRows.append(row);
      });
    }

    async function loadUsers(query = "") {
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("query", query.trim());
        const data = await request(
          `/admin/users${params.size ? `?${params}` : ""}`,
          { auth: true },
        );
        if (!adminPageActive) return;
        users = Array.isArray(data.users) ? data.users : [];
        editingUserId = null;
        renderUserRows();
        setMessage(
          userStatus,
          query.trim()
            ? `Tìm thấy ${users.length} tài khoản phù hợp.`
            : `Có ${users.length} tài khoản trong hệ thống.`,
        );
      } catch (error) {
        handleRequestError(userStatus, error, "Không thể tải danh sách người dùng.");
      }
    }

    async function saveUser(user) {
      const nameInput = document.getElementById(`user-name-${user.user_id}`);
      const emailInput = document.getElementById(`user-email-${user.user_id}`);
      const roleSelect = document.getElementById(`user-role-${user.user_id}`);
      const payload = {
        full_name: nameInput?.value.trim() || "",
        email: emailInput?.value.trim() || "",
        role: roleSelect?.value || "user",
      };
      if (!payload.full_name || !payload.email) {
        setMessage(userStatus, "Tên và email không được để trống.", true);
        return;
      }
      try {
        await request(`/admin/users/${encodeURIComponent(user.user_id)}`, {
          method: "PUT",
          body: payload,
          auth: true,
        });
        setMessage(userStatus, `Đã cập nhật tài khoản ${payload.email}.`);
        await loadUsers(userSearchInput?.value || "");
      } catch (error) {
        handleRequestError(userStatus, error, "Không thể cập nhật tài khoản.");
      }
    }

    async function deleteUser(user) {
      if (!window.confirm(`Xóa tài khoản "${user.full_name}" (${user.email})?`)) return;
      try {
        await request(`/admin/users/${encodeURIComponent(user.user_id)}`, {
          method: "DELETE",
          auth: true,
        });
        setMessage(userStatus, `Đã xóa tài khoản ${user.email}.`);
        await loadUsers(userSearchInput?.value || "");
      } catch (error) {
        handleRequestError(userStatus, error, "Không thể xóa tài khoản.");
      }
    }

    userSearchForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      loadUsers(userSearchInput?.value || "");
    });

    userResetButton?.addEventListener("click", () => {
      if (userSearchInput) userSearchInput.value = "";
      loadUsers("");
    });

    function resetRoadEditor() {
      editingEdgeId = null;
      drawing = false;
      coordinates = [];
      roadForm?.reset();
      if (roadSpeedInput) roadSpeedInput.value = "50";
      if (roadLength) roadLength.textContent = "Chiều dài: --";
      if (drawButton) drawButton.textContent = "Vẽ / vẽ lại tuyến";
      setMessage(roadStatus, "Chọn “Vẽ đoạn đường mới” hoặc sửa một đoạn trong danh sách.");
      renderRoadMap();
      renderDraftGeometry();
      updateDrawingControls();
    }

    function beginDrawing() {
      if (!activeAdminMap || !draftLayer) {
        setMessage(roadStatus, "Bản đồ chưa sẵn sàng để vẽ.", true);
        return;
      }
      drawing = true;
      coordinates = [];
      draftLayer.clearLayers();
      if (drawButton) drawButton.textContent = "Đang vẽ...";
      if (mapHint) {
        mapHint.textContent = "Nhấp lên bản đồ để thêm điểm; cần ít nhất hai điểm.";
      }
      setMessage(roadStatus, "Nhấp ít nhất hai điểm trên bản đồ, sau đó chọn “Hoàn tất vẽ”.");
      renderDraftGeometry();
    }

    function beginEditingRoad(road) {
      editingEdgeId = road.edge_id;
      drawing = false;
      coordinates = road.coordinates.map(({ lat, lng }) => ({ lat, lng }));
      if (roadCodeInput) roadCodeInput.value = road.edge_code;
      if (roadNameInput) roadNameInput.value = road.street_name;
      if (roadDistrictInput) roadDistrictInput.value = road.district || "";
      if (roadSpeedInput) roadSpeedInput.value = String(road.max_speed_limit);
      if (drawButton) drawButton.textContent = "Vẽ lại tuyến";
      if (mapHint) mapHint.textContent = "Đoạn đang sửa được tô màu xanh.";
      setMessage(roadStatus, `Đang sửa ${road.edge_code}. Có thể cập nhật thông tin hoặc vẽ lại tuyến.`);
      renderRoadMap();
      renderDraftGeometry();
      updateDrawingControls();
      if (activeAdminMap && coordinates.length >= 2) {
        activeAdminMap.fitBounds(
          L.latLngBounds(coordinates.map(({ lat, lng }) => [lat, lng])),
          { padding: [30, 30], maxZoom: 16 },
        );
      }
    }

    async function deleteRoad(road) {
      if (!window.confirm(`Xóa đoạn đường "${road.street_name}" (${road.edge_code})?`)) {
        return;
      }
      try {
        await request(`/admin/roads/${encodeURIComponent(road.edge_id)}`, {
          method: "DELETE",
          auth: true,
        });
        setMessage(roadListStatus, `Đã xóa đoạn đường ${road.edge_code}.`);
        if (editingEdgeId === road.edge_id) resetRoadEditor();
        await Promise.all([loadRoads(), loadDashboard()]);
      } catch (error) {
        handleRequestError(roadListStatus, error, "Không thể xóa đoạn đường.");
      }
    }

    try {
      const env = import.meta.env || {};
      if (!env.VITE_TILE_URL) {
        throw new Error("Thiếu cấu hình VITE_TILE_URL để hiển thị bản đồ quản trị.");
      }
      activeAdminMap = L.map("admin-road-map", {
        preferCanvas: true,
        scrollWheelZoom: true,
      }).setView([21.018, 105.815], 12);
      L.tileLayer(env.VITE_TILE_URL, {
        maxZoom: 19,
        attribution: env.VITE_TILE_ATTRIBUTION || "",
      }).addTo(activeAdminMap);
      roadLayer = L.featureGroup().addTo(activeAdminMap);
      draftLayer = L.featureGroup().addTo(activeAdminMap);
      activeAdminMap.on("click", (event) => {
        if (!drawing) return;
        coordinates.push({
          lat: Number(event.latlng.lat.toFixed(6)),
          lng: Number(event.latlng.lng.toFixed(6)),
        });
        renderDraftGeometry();
      });
      setTimeout(() => {
        if (adminPageActive && activeAdminMap) activeAdminMap.invalidateSize();
      }, 100);
    } catch (error) {
      setMessage(roadStatus, describeError(error, "Không thể khởi tạo bản đồ."), true);
      if (mapHint) mapHint.textContent = "Không thể tải bản đồ.";
    }

    newRoadButton?.addEventListener("click", () => {
      resetRoadEditor();
      beginDrawing();
      roadCodeInput?.focus();
    });

    drawButton?.addEventListener("click", beginDrawing);

    finishDrawButton?.addEventListener("click", () => {
      if (coordinates.length < 2) {
        setMessage(roadStatus, "Cần chọn ít nhất hai điểm để hoàn tất đoạn đường.", true);
        return;
      }
      drawing = false;
      if (drawButton) drawButton.textContent = "Vẽ lại tuyến";
      if (mapHint) mapHint.textContent = "Tuyến đã vẽ; chọn thêm điểm để vẽ lại nếu cần.";
      setMessage(roadStatus, `Đã vẽ tuyến qua ${coordinates.length} điểm.`);
      updateDrawingControls();
    });

    cancelRoadButton?.addEventListener("click", resetRoadEditor);

    roadForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (drawing || coordinates.length < 2) {
        setMessage(roadStatus, "Hãy hoàn tất đường vẽ với ít nhất hai điểm trước khi lưu.", true);
        return;
      }
      if (!roadForm.reportValidity()) return;

      const payload = {
        edge_code: roadCodeInput.value.trim(),
        street_name: roadNameInput.value.trim(),
        district: roadDistrictInput.value.trim(),
        max_speed_limit: Number(roadSpeedInput.value),
        coordinates,
      };
      saving = true;
      updateDrawingControls();
      try {
        const path = editingEdgeId
          ? `/admin/roads/${encodeURIComponent(editingEdgeId)}`
          : "/admin/roads";
        const result = await request(path, {
          method: editingEdgeId ? "PUT" : "POST",
          body: payload,
          auth: true,
        });
        if (!adminPageActive) return;
        const successMessage = `${editingEdgeId ? "Đã cập nhật" : "Đã tạo"} đoạn đường ${result.edge_code}.`;
        resetRoadEditor();
        setMessage(roadStatus, successMessage);
        await Promise.all([loadRoads(), loadDashboard()]);
      } catch (error) {
        handleRequestError(roadStatus, error, "Không thể lưu đoạn đường.");
      } finally {
        saving = false;
        updateDrawingControls();
      }
    });

    document.getElementById("logout-btn")?.addEventListener("click", () => {
      clearSession();
      updateHeaderAuth();
      navigateTo("/");
    });

    retrainButton?.addEventListener("click", async () => {
      if (!retrainButton || !retrainMessage) return;
      retrainButton.disabled = true;
      retrainButton.textContent = "Đang gửi yêu cầu...";
      setMessage(retrainMessage, "");
      try {
        const data = await request("/admin/retrain-model", {
          method: "POST",
          auth: true,
        });
        setMessage(
          retrainMessage,
          data.message || "Backend đã tiếp nhận yêu cầu huấn luyện.",
        );
      } catch (error) {
        handleRequestError(retrainMessage, error, "Không thể yêu cầu huấn luyện lại.");
      } finally {
        retrainButton.disabled = false;
        retrainButton.textContent = "Huấn luyện lại mô hình";
      }
    });

    async function verifyAdminAndLoad() {
      try {
        const currentUser = await request("/auth/me", { auth: true });
        if (!adminPageActive) return;
        saveSession(getToken(), {
          user_id: currentUser.user_id,
          email: currentUser.email,
          role: currentUser.role,
        });
        updateHeaderAuth();
        if (currentUser.role !== "admin") {
          setUnauthorizedView();
          return;
        }
        await Promise.all([loadDashboard(), loadRoads(), loadUsers()]);
      } catch (error) {
        handleRequestError(
          dashboardStatus,
          error,
          "Không thể xác thực quyền quản trị.",
        );
      }
    }

    verifyAdminAndLoad();
  },

  unmount() {
    adminPageActive = false;
    if (activeAdminMap) {
      activeAdminMap.remove();
      activeAdminMap = null;
    }
  },
};
