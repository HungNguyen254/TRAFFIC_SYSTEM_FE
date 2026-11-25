// File: src/js/pages/adminPage.js
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { renderHeader, updateHeaderAuth } from "../components/header.js";
import { renderFooter } from "../components/footer.js";
import { renderAdminUnauthorizedView, renderAdminView } from "../views/adminView.js";
import { clearSession, getToken, getUser, isAdmin, request } from "../api.js";

let activeAdminMap = null;
let adminPageActive = false;

function formatRoadLength(value) {
  return `${Number(value || 0).toLocaleString("vi-VN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  })} km`;
}

export const adminPage = {
  mount(container, navigateTo) {
    adminPageActive = true;
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
    const userSearchForm = document.getElementById("admin-user-search-form");
    const userSearchInput = document.getElementById("admin-user-search-input");
    const userResetButton = document.getElementById("admin-user-reset");
    const userStatus = document.getElementById("admin-user-status");
    const userRows = document.getElementById("admin-user-rows");
    const userPagination = document.getElementById("admin-user-pagination");
    const roadPagination = document.getElementById("admin-road-pagination");

    // ==== Chuyển tab phân mục quản trị ==== 
    const tabButtons = document.querySelectorAll("#admin-tabs .admin-tab-btn");
    function activateAdminTab(name) {
      tabButtons.forEach((button) => {
        const active = button.dataset.tab === name;
        button.classList.toggle("active", active);
        if (active) button.setAttribute("aria-current", "true");
        else button.removeAttribute("aria-current");
      });
      ["overview", "users", "roads"].forEach((panelName) => {
        const panel = document.getElementById(`admin-panel-${panelName}`);
        if (panel) panel.hidden = panelName !== name;
      });
    }
    tabButtons.forEach((button) => {
      button.addEventListener("click", () => activateAdminTab(button.dataset.tab));
    });
    activateAdminTab("overview");

    // ==== Ẩn/hiện trình sửa tuyến (form + bản đồ) trong tab đoạn đường ====
    const roadEditorWrap = document.getElementById("admin-road-editor");
    function setRoadEditorVisible(visible) {
      if (roadEditorWrap) roadEditorWrap.hidden = !visible;
      if (visible && activeAdminMap) {
        setTimeout(() => activeAdminMap?.invalidateSize(), 50);
      }
    }
    setRoadEditorVisible(false);
    // Tự mở trình sửa khi cần vẽ mới hoặc sửa hình học tuyến
    const openRoadEditor = () => setRoadEditorVisible(true);

    let roads = [];
    let districts = [];
    let users = [];
    const PAGE_SIZE = 8;
    let userPage = 1;
    let roadPage = 1;
    let editingUserId = null;
    let editingEdgeId = null;
    let inlineEditingEdgeId = null;
    let coordinates = [];
    let drawingPoints = [];
    let drawing = false;
    let snapping = false;
    let drawingRequestId = 0;
    let roadRenderId = 0;
    let geometryReady = false;
    let saving = false;
    let roadLayer = null;
    let draftLayer = null;
    const roadGeometryCache = new Map();

    function setMessage(element, message, isError = false) {
      if (!element) return;
      element.textContent = message;
      element.classList.toggle("error", isError);
    }

    function renderPagination(nav, totalItems, currentPage, onPageChange) {
      if (!nav) return;
      nav.replaceChildren();
      const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
      if (totalPages <= 1) {
        nav.hidden = true;
        return;
      }
      nav.hidden = false;

      const createButton = (label, page, disabled = false, isCurrent = false) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "admin-pagination-btn";
        button.textContent = label;
        button.disabled = disabled;
        if (isCurrent) button.classList.add("current");
        button.addEventListener("click", () => onPageChange(page));
        return button;
      };

      nav.append(createButton("‹ Trước", currentPage - 1, currentPage <= 1));

      const windowSize = 5;
      let start = Math.max(1, currentPage - Math.floor(windowSize / 2));
      const end = Math.min(totalPages, start + windowSize - 1);
      start = Math.max(1, end - windowSize + 1);
      for (let page = start; page <= end; page += 1) {
        nav.append(createButton(String(page), page, false, page === currentPage));
      }

      nav.append(createButton("Sau ›", currentPage + 1, currentPage >= totalPages));

      const info = document.createElement("span");
      info.className = "admin-pagination-info";
      info.textContent = `Trang ${currentPage}/${totalPages} · ${totalItems} mục`;
      nav.append(info);
    }

    function changeUserPage(page) {
      userPage = page;
      editingUserId = null;
      renderUserRows();
    }

    function changeRoadPage(page) {
      roadPage = page;
      renderRoadRows();
      renderRoadMap();
    }

    function clampPage(totalItems, page) {
      return Math.min(Math.max(1, page), Math.max(1, Math.ceil(totalItems / PAGE_SIZE)));
    }

    function updateMetrics() {
      const totalUsers = users.length;
      const totalAdmins = users.filter((user) => user.role === "admin").length;
      const totalRoads = roads.length;
      const totalLengthKm = roads.reduce(
        (sum, road) => sum + Number(road.length_km || 0),
        0,
      );
      const setText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      };
      setText("metric-users", totalUsers.toLocaleString("vi-VN"));
      setText("metric-users-sub", `${totalAdmins} quản trị viên · ${totalUsers - totalAdmins} người dùng`);
      setText("metric-roads", totalRoads.toLocaleString("vi-VN"));
      setText("metric-roads-sub", `Tổng chiều dài ${formatRoadLength(totalLengthKm)}`);
      setText("metric-users-inline", totalUsers.toLocaleString("vi-VN"));
      setText("metric-admins-inline", totalAdmins.toLocaleString("vi-VN"));
    }

    function renderUserRows() {
      if (!userRows) return;
      userRows.replaceChildren();
      renderPagination(userPagination, users.length, clampPage(users.length, userPage), changeUserPage);
      const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
      if (userPage > totalPages) userPage = totalPages;
      const startIndex = (userPage - 1) * PAGE_SIZE;
      const pageUsers = users.slice(startIndex, startIndex + PAGE_SIZE);
      if (!pageUsers.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 5;
        cell.className = "admin-empty";
        cell.textContent = "Không tìm thấy tài khoản phù hợp.";
        row.append(cell);
        userRows.append(row);
        return;
      }

      pageUsers.forEach((user) => {
        const row = document.createElement("tr");
        const editing = editingUserId === user.user_id;
        const nameCell = document.createElement("td");
        const emailCell = document.createElement("td");
        const roleCell = document.createElement("td");

        if (editing) {
          const input = document.createElement("input");
          input.id = `admin-user-name-${user.user_id}`;
          input.maxLength = 100;
          input.value = user.full_name;
          nameCell.append(input);

          const emailInput = document.createElement("input");
          emailInput.id = `admin-user-email-${user.user_id}`;
          emailInput.type = "email";
          emailInput.maxLength = 100;
          emailInput.value = user.email;
          emailCell.append(emailInput);

          const roleSelect = document.createElement("select");
          roleSelect.id = `admin-user-role-${user.user_id}`;
          ["user", "admin"].forEach((role) => {
            const option = document.createElement("option");
            option.value = role;
            option.textContent = role === "admin" ? "Quản trị viên" : "Người dùng";
            option.selected = role === user.role;
            roleSelect.append(option);
          });
          roleCell.append(roleSelect);
        } else {
          nameCell.textContent = user.full_name;
          emailCell.textContent = user.email;
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
          cancelButton.className = "admin-row-action admin-row-delete";
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

    async function loadUsers(query = "", resetPage = false) {
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("query", query.trim());
        const suffix = params.toString() ? `?${params.toString()}` : "";
        const data = await request(`/admin/users${suffix}`, { auth: true });
        if (!adminPageActive) return;
        users = Array.isArray(data.users) ? data.users : [];
        editingUserId = null;
        if (resetPage) userPage = 1;
        renderUserRows();
        updateMetrics();
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
      const nameInput = document.getElementById(`admin-user-name-${user.user_id}`);
      const emailInput = document.getElementById(`admin-user-email-${user.user_id}`);
      const roleSelect = document.getElementById(`admin-user-role-${user.user_id}`);
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
    loadUsers(userSearchInput?.value || "", true);
    });

    userResetButton?.addEventListener("click", () => {
    if (userSearchInput) userSearchInput.value = "";
    loadUsers("", true);
    });

    function updateDrawingControls() {
      if (drawButton) drawButton.disabled = drawing || snapping || !activeAdminMap;
      if (finishDrawButton) {
        finishDrawButton.hidden = !drawing;
        finishDrawButton.disabled = drawingPoints.length < 2 || snapping;
      }
      if (saveRoadButton) {
        saveRoadButton.disabled =
          drawing ||
          snapping ||
          !geometryReady ||
          coordinates.length < 2 ||
          saving;
      }
      if (cancelRoadButton) {
        cancelRoadButton.hidden =
          !editingEdgeId &&
          !drawing &&
          !snapping &&
          coordinates.length === 0;
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
        const haversine =
          Math.sin(deltaLat / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
        total += 2 * radiusKm * Math.asin(Math.sqrt(Math.min(1, haversine)));
      }
      return total;
    }

    function renderRoadMap() {
      if (!roadLayer) return;
      const renderId = ++roadRenderId;
      const pendingGeometry = [];
      roadLayer.clearLayers();
      roads.forEach((road) => {
        if (!Array.isArray(road.coordinates) || road.coordinates.length < 2) return;
        const isSelected = road.edge_id === editingEdgeId;
        const line = L.polyline(
          road.coordinates.map(({ lat, lng }) => [lat, lng]),
          {
            color: isSelected ? "#2563eb" : "#64748b",
            weight: isSelected ? 6 : 4,
            opacity: isSelected ? 0.95 : 0.65,
            lineCap: "round",
            lineJoin: "round",
          },
        )
          .bindTooltip(`${road.edge_code} · ${road.street_name}`)
          .addTo(roadLayer);
        if (!road.has_geometry) {
          pendingGeometry.push(
            getRoadGeometry(road.coordinates).then((routedPoints) => {
              if (!adminPageActive || renderId !== roadRenderId) return;
              line.setLatLngs(
                routedPoints.map(({ lat, lng }) => [lat, lng]),
              );
            }),
          );
        }
      });
      Promise.allSettled(pendingGeometry).then((results) => {
        if (!adminPageActive || renderId !== roadRenderId) return;
        const failedRoutes = results.filter(
          (result) => result.status === "rejected",
        ).length;
        if (failedRoutes) {
          setMessage(
            roadListStatus,
            `Không thể căn ${failedRoutes} đoạn đường theo đường thực tế; đang hiển thị tọa độ gốc.`,
            true,
          );
        }
      });
    }

    function renderDraftGeometry() {
      if (!draftLayer) return;
      draftLayer.clearLayers();
      const latLngs = coordinates.map(({ lat, lng }) => [lat, lng]);
      if (latLngs.length >= 2) {
        L.polyline(latLngs, {
          color: "#2563eb",
          weight: 7,
          opacity: 0.88,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(draftLayer);
      }
      const markerPoints = drawingPoints.length
        ? drawingPoints
        : coordinates.length > 1
          ? [coordinates[0], coordinates[coordinates.length - 1]]
          : coordinates;
      markerPoints.forEach((point, index) => {
        L.circleMarker([point.lat, point.lng], {
          radius:
            index === 0 || index === markerPoints.length - 1 ? 7 : 5,
          color: "#ffffff",
          weight: 2,
          fillColor:
            index === 0
              ? "#16a34a"
              : index === markerPoints.length - 1
                ? "#dc2626"
                : "#2563eb",
          fillOpacity: 1,
          bubblingMouseEvents: false,
        })
          .bindTooltip(`Điểm ${index + 1}`)
          .addTo(draftLayer);
      });

      if (roadLength) {
        const pointCount = drawingPoints.length || coordinates.length;
        roadLength.textContent =
          coordinates.length >= 2
            ? `Chiều dài ước tính: ${formatRoadLength(calculateLengthKm(coordinates))} · ${pointCount} điểm`
            : `Đã chọn ${pointCount} điểm · cần ít nhất 2 điểm`;
      }
      updateDrawingControls();
    }

    async function routeDrawingPoints(points) {
      const routingUrl = import.meta.env?.VITE_ROUTING_URL;
      if (!routingUrl) {
        throw new Error("Thiếu cấu hình VITE_ROUTING_URL để căn tuyến theo đường thực tế.");
      }

      const routeCoordinates = points
        .map(({ lat, lng }) => `${lng},${lat}`)
        .join(";");
      const response = await fetch(
        `${routingUrl}/${routeCoordinates}?overview=full&geometries=geojson&steps=false`,
      );
      if (!response.ok) {
        throw new Error(`Dịch vụ định tuyến trả về HTTP ${response.status}.`);
      }

      const data = await response.json();
      const geometryCoordinates = data.routes?.[0]?.geometry?.coordinates;
      if (data.code !== "Ok" || !Array.isArray(geometryCoordinates)) {
        throw new Error("Không tìm thấy tuyến đường phù hợp với các điểm đã chọn.");
      }

      const routedPoints = geometryCoordinates.map(([lng, lat]) => ({
        lat: Number(lat),
        lng: Number(lng),
      }));
      if (routedPoints.length > 2000) {
        throw new Error("Tuyến vượt quá giới hạn 2.000 điểm tọa độ.");
      }
      if (
        routedPoints.length < 2 ||
        routedPoints.some(
          ({ lat, lng }) =>
            !Number.isFinite(lat) ||
            !Number.isFinite(lng) ||
            lat < -90 ||
            lat > 90 ||
            lng < -180 ||
            lng > 180,
        )
      ) {
        throw new Error("Dịch vụ định tuyến trả về hình học không hợp lệ.");
      }

      return routedPoints;
    }

    function getRoadGeometry(points) {
      const cacheKey = points
        .map(({ lat, lng }) => `${lat},${lng}`)
        .join(";");
      if (!roadGeometryCache.has(cacheKey)) {
        const request = routeDrawingPoints(points).catch((error) => {
          roadGeometryCache.delete(cacheKey);
          throw error;
        });
        roadGeometryCache.set(cacheKey, request);
      }
      return roadGeometryCache.get(cacheKey);
    }

    function renderRoadRows() {
      if (!roadRows) return;
      roadRows.replaceChildren();
      renderPagination(roadPagination, roads.length, clampPage(roads.length, roadPage), changeRoadPage);
      const totalPages = Math.max(1, Math.ceil(roads.length / PAGE_SIZE));
      if (roadPage > totalPages) roadPage = totalPages;
      const startIndex = (roadPage - 1) * PAGE_SIZE;
      const pageRoads = roads.slice(startIndex, startIndex + PAGE_SIZE);
      if (!pageRoads.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 6;
        cell.className = "admin-empty";
        cell.textContent = "Chưa có đoạn đường nào.";
        row.append(cell);
        roadRows.append(row);
        return;
      }

      pageRoads.forEach((road) => {
        const row = document.createElement("tr");
        row.dataset.edgeId = road.edge_id;
        const editingRow = inlineEditingEdgeId === road.edge_id;

        if (editingRow) {
          row.classList.add("admin-row-editing");
          const codeCell = document.createElement("td");
          const codeInput = document.createElement("input");
          codeInput.className = "admin-inline-input";
          codeInput.maxLength = 20;
          codeInput.value = road.edge_code;
          codeCell.append(codeInput);

          const nameCell = document.createElement("td");
          const nameInput = document.createElement("input");
          nameInput.className = "admin-inline-input";
          nameInput.maxLength = 100;
          nameInput.value = road.street_name;
          nameCell.append(nameInput);

          const districtCell = document.createElement("td");
          const districtInput = document.createElement("input");
          districtInput.className = "admin-inline-input";
          districtInput.setAttribute("list", "admin-road-district-options");
          districtInput.maxLength = 50;
          districtInput.value = road.district || "";
          districtCell.append(districtInput);

          const lengthCell = document.createElement("td");
          lengthCell.textContent = formatRoadLength(road.length_km);

          const speedCell = document.createElement("td");
          const speedInput = document.createElement("input");
          speedInput.className = "admin-inline-input admin-inline-speed";
          speedInput.type = "number";
          speedInput.min = "1";
          speedInput.max = "200";
          speedInput.value = String(road.max_speed_limit);
          speedCell.append(speedInput);

          const actions = document.createElement("td");
          actions.className = "admin-road-actions";
          const saveButton = document.createElement("button");
          saveButton.type = "button";
          saveButton.className = "admin-row-action";
          saveButton.textContent = "Lưu";
          saveButton.addEventListener("click", () => {
            saveRoadInline(road, {
              edge_code: codeInput.value.trim(),
              street_name: nameInput.value.trim(),
              district: districtInput.value.trim(),
              max_speed_limit: Number(speedInput.value),
            });
          });
          const cancelButton = document.createElement("button");
          cancelButton.type = "button";
          cancelButton.className = "admin-row-action admin-row-delete";
          cancelButton.textContent = "Hủy";
          cancelButton.addEventListener("click", () => {
            inlineEditingEdgeId = null;
            renderRoadRows();
          });
          actions.append(saveButton, cancelButton);

          row.append(codeCell, nameCell, districtCell, lengthCell, speedCell, actions);
          roadRows.append(row);
          return;
        }

        [
          road.edge_code,
          road.street_name,
          road.district || "Chưa gán",
          formatRoadLength(road.length_km),
          `${Number(road.max_speed_limit).toLocaleString("vi-VN")} km/h`,
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
        editButton.addEventListener("click", () => {
          inlineEditingEdgeId = road.edge_id;
          renderRoadRows();
        });

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

    async function saveRoadInline(road, payload) {
      if (!payload.edge_code || !payload.street_name || !payload.district) {
        setMessage(roadListStatus, "Mã, tên đường và khu vực không được để trống.", true);
        return;
      }
      if (!Number.isFinite(payload.max_speed_limit) || payload.max_speed_limit < 1 || payload.max_speed_limit > 200) {
        setMessage(roadListStatus, "Tốc độ tối đa phải trong khoảng 1–200 km/h.", true);
        return;
      }
      try {
        await request(`/admin/roads/${encodeURIComponent(road.edge_id)}`, {
          method: "PUT",
          body: {
            edge_code: payload.edge_code,
            street_name: payload.street_name,
            district: payload.district,
            max_speed_limit: payload.max_speed_limit,
            coordinates: road.coordinates.map(({ lat, lng }) => ({ lat, lng })),
          },
          auth: true,
        });
        setMessage(roadListStatus, `Đã cập nhật đoạn đường ${payload.edge_code}.`);
        inlineEditingEdgeId = null;
        await loadRoads();
      } catch (error) {
        setMessage(
          roadListStatus,
          error instanceof Error ? error.message : "Không thể cập nhật đoạn đường.",
          true,
        );
      }
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

    async function loadRoads() {
      try {
        const data = await request("/admin/roads", { auth: true });
        if (!adminPageActive) return;
        roads = Array.isArray(data.roads) ? data.roads : [];
        districts = Array.isArray(data.districts) ? data.districts : [];
        renderDistrictOptions();
        roadPage = clampPage(roads.length, roadPage);
        inlineEditingEdgeId = null;
        renderRoadRows();
        updateMetrics();
        renderRoadMap();
        setMessage(roadListStatus, "");
      } catch (error) {
        if (!adminPageActive) return;
        const message = error instanceof Error ? error.message : "Không thể tải danh sách đoạn đường.";
        setMessage(roadListStatus, message, true);
        if (!getToken()) {
          updateHeaderAuth();
          navigateTo("/login?redirect=%2Fadmin&reason=admin_required");
        }
      }
    }

    function resetRoadEditor() {
      drawingRequestId += 1;
      editingEdgeId = null;
      drawing = false;
      snapping = false;
      geometryReady = false;
      drawingPoints = [];
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
      drawingRequestId += 1;
      drawing = true;
      snapping = false;
      geometryReady = false;
      drawingPoints = [];
      coordinates = [];
      draftLayer.clearLayers();
      if (drawButton) drawButton.textContent = "Đang vẽ...";
      if (mapHint) {
        mapHint.textContent = "Nhấp dọc theo tuyến đường để thêm điểm; cần ít nhất hai điểm.";
      }
      setMessage(roadStatus, "Nhấp ít nhất hai điểm trên bản đồ, sau đó chọn “Hoàn tất vẽ”.");
      renderDraftGeometry();
    }

    async function beginEditingRoad(road) {
      drawingRequestId += 1;
      editingEdgeId = road.edge_id;
      drawing = false;
      snapping = false;
      geometryReady = Boolean(road.has_geometry);
      drawingPoints = [];
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
      if (!road.has_geometry) {
        try {
          const routedPoints = await getRoadGeometry(road.coordinates);
          if (
            !adminPageActive ||
            editingEdgeId !== road.edge_id ||
            drawing
          ) {
            return;
          }
          coordinates = routedPoints;
          geometryReady = true;
          renderDraftGeometry();
          activeAdminMap?.fitBounds(
            L.latLngBounds(routedPoints.map(({ lat, lng }) => [lat, lng])),
            { padding: [30, 30], maxZoom: 16 },
          );
          setMessage(
            roadStatus,
            `Đã căn ${road.edge_code} theo đường giao thông thực tế. Có thể cập nhật thông tin hoặc vẽ lại tuyến.`,
          );
        } catch (error) {
          if (
            !adminPageActive ||
            editingEdgeId !== road.edge_id ||
            drawing
          ) {
            return;
          }
          setMessage(
            roadStatus,
            error instanceof Error
              ? `Không thể căn tuyến: ${error.message}`
              : "Không thể căn tuyến theo đường thực tế.",
            true,
          );
        }
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
        await loadRoads();
      } catch (error) {
        setMessage(
          roadListStatus,
          error instanceof Error ? error.message : "Không thể xóa đoạn đường.",
          true,
        );
      }
    }

    try {
      const tileUrl = import.meta.env?.VITE_TILE_URL;
      if (!tileUrl) {
        throw new Error("Thiếu cấu hình VITE_TILE_URL để hiển thị bản đồ quản trị.");
      }
      activeAdminMap = L.map("admin-road-map", {
        preferCanvas: true,
        scrollWheelZoom: true,
      }).setView([21.018, 105.815], 12);
      L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution: import.meta.env.VITE_TILE_ATTRIBUTION || "",
      }).addTo(activeAdminMap);
      roadLayer = L.featureGroup().addTo(activeAdminMap);
      draftLayer = L.featureGroup().addTo(activeAdminMap);
      activeAdminMap.on("click", (event) => {
        if (!drawing || snapping) return;
        const point = {
          lat: Number(event.latlng.lat.toFixed(6)),
          lng: Number(event.latlng.lng.toFixed(6)),
        };
        drawingPoints.push(point);
        coordinates = drawingPoints.map(({ lat, lng }) => ({ lat, lng }));
        renderDraftGeometry();
      });
      setTimeout(() => {
        if (adminPageActive && activeAdminMap) activeAdminMap.invalidateSize();
      }, 100);
    } catch (error) {
      setMessage(
        roadStatus,
        error instanceof Error ? error.message : "Không thể khởi tạo bản đồ.",
        true,
      );
      if (mapHint) mapHint.textContent = "Không thể tải bản đồ.";
    }

    newRoadButton?.addEventListener("click", () => {
      resetRoadEditor();
      openRoadEditor();
      beginDrawing();
      roadCodeInput?.focus();
    });

    drawButton?.addEventListener("click", beginDrawing);

    finishDrawButton?.addEventListener("click", async () => {
      if (drawingPoints.length < 2) {
        setMessage(roadStatus, "Cần chọn ít nhất hai điểm để hoàn tất đoạn đường.", true);
        return;
      }
      const requestId = ++drawingRequestId;
      snapping = true;
      if (mapHint) mapHint.textContent = "Đang căn các điểm đã chọn theo đường giao thông thực tế...";
      setMessage(roadStatus, "Đang căn tuyến theo đường giao thông thực tế...");
      updateDrawingControls();
      try {
        const routedPoints = await routeDrawingPoints(drawingPoints);
        if (
          !adminPageActive ||
          !activeAdminMap ||
          requestId !== drawingRequestId
        ) {
          return;
        }
        coordinates = routedPoints;
        drawing = false;
        geometryReady = true;
        if (drawButton) drawButton.textContent = "Vẽ lại tuyến";
        if (mapHint) {
          mapHint.textContent = "Tuyến đã được căn theo đường thực tế; chọn vẽ lại nếu cần thay đổi.";
        }
        setMessage(
          roadStatus,
          `Đã căn tuyến theo đường thực tế qua ${drawingPoints.length} điểm.`,
        );
        renderDraftGeometry();
      } catch (error) {
        if (!adminPageActive || requestId !== drawingRequestId) return;
        geometryReady = false;
        setMessage(
          roadStatus,
          error instanceof Error
            ? `Không thể căn tuyến: ${error.message}`
            : "Không thể căn tuyến theo đường thực tế.",
          true,
        );
        if (mapHint) {
          mapHint.textContent = "Kiểm tra các điểm đã chọn rồi chọn “Hoàn tất vẽ” để thử lại.";
        }
      } finally {
        if (requestId === drawingRequestId) {
          snapping = false;
          updateDrawingControls();
        }
      }
    });

    cancelRoadButton?.addEventListener("click", resetRoadEditor);

    roadForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (drawing || coordinates.length < 2) {
        setMessage(roadStatus, "Hãy hoàn tất đường vẽ với ít nhất hai điểm trước khi lưu.", true);
        return;
      }
      if (!geometryReady) {
        setMessage(roadStatus, "Hãy căn tuyến theo đường thực tế trước khi lưu.", true);
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
        const result = await request(
          editingEdgeId
            ? `/admin/roads/${encodeURIComponent(editingEdgeId)}`
            : "/admin/roads",
          {
            method: editingEdgeId ? "PUT" : "POST",
            body: payload,
            auth: true,
          },
        );
        if (!adminPageActive) return;
        const successMessage = `${editingEdgeId ? "Đã cập nhật" : "Đã tạo"} đoạn đường ${result.edge_code}.`;
        resetRoadEditor();
        setMessage(roadStatus, successMessage);
        await loadRoads();
      } catch (error) {
        setMessage(
          roadStatus,
          error instanceof Error ? error.message : "Không thể lưu đoạn đường.",
          true,
        );
      } finally {
        saving = false;
        updateDrawingControls();
      }
    });

    loadRoads();
    loadUsers();

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

  unmount() {
    adminPageActive = false;
    if (activeAdminMap) {
      activeAdminMap.remove();
      activeAdminMap = null;
    }
  },
};
