// ===== CẤU HÌNH =====
const HANOI_CENTER = [21.0285, 105.8542];

// ===== LẤY CÁC PHẦN TỬ TRÊN TRANG =====
const statusEl = document.getElementById("status-overlay");
const statusTextEl = document.getElementById("status-text");
const retryBtn = document.getElementById("retry-btn");
const tileWarningEl = document.getElementById("tile-warning");
const searchForm = document.getElementById("road-search");
const roadQueryEl = document.getElementById("road-query");
const searchButton = document.getElementById("search-btn");
const searchStatusEl = document.getElementById("search-status");
const searchResultsEl = document.getElementById("search-results");
const detailEl = document.getElementById("detail");

// ===== TRẠNG THÁI CỦA TRANG =====
let map = null;
let pointsLayer = null;
let lastSearchAt = 0;

// ===== HIỂN THỊ TRẠNG THÁI TẢI / LỖI =====
function showLoading(text) {
  statusEl.hidden = false;
  statusEl.classList.remove("error");
  statusTextEl.textContent = text;
  retryBtn.hidden = true;
}

function showError(text) {
  statusEl.hidden = false;
  statusEl.classList.add("error");
  statusTextEl.textContent = text;
  retryBtn.hidden = false;
}

function hideStatus() {
  statusEl.hidden = true;
}

// ===== KHỞI TẠO BẢN ĐỒ =====
function initMap() {
  map = L.map("map-canvas").setView(HANOI_CENTER, 12);
  pointsLayer = L.layerGroup().addTo(map);

  const baseLayer = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  // Theo dõi việc tải ảnh nền: nếu không có ảnh nào tải được thì báo lỗi
  let hasTileLoaded = false;
  let tileErrorCount = 0;

  baseLayer.on("tileload", () => {
    hasTileLoaded = true;
    tileWarningEl.hidden = true;
  });

  baseLayer.on("tileerror", () => {
    tileErrorCount++;
  });

  baseLayer.on("load", () => {
    if (!hasTileLoaded && tileErrorCount > 0) {
      tileWarningEl.hidden = false;
    }
  });
}

function showSearchStatus(message, isError = false) {
  searchStatusEl.textContent = message;
  searchStatusEl.classList.toggle("error", isError);
}

function selectRoad(result) {
  const lat = Number(result.lat);
  const lng = Number(result.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    showSearchStatus("Kết quả tìm kiếm không có tọa độ hợp lệ.", true);
    return;
  }

  pointsLayer.clearLayers();
  const name = result.name || result.display_name;
  const marker = L.marker([lat, lng], {
    title: name,
    alt: `${name}: chưa có dữ liệu tốc độ`
  }).addTo(pointsLayer);
  const popup = document.createElement("div");
  const popupTitle = document.createElement("strong");
  popupTitle.textContent = name;
  const popupInfo = document.createElement("p");
  popupInfo.textContent = "Chưa có dữ liệu tốc độ giao thông cho tuyến này.";
  popupInfo.style.margin = "4px 0 0";
  popup.append(popupTitle, popupInfo);
  marker.bindPopup(popup).openPopup();

  detailEl.hidden = false;
  detailEl.textContent = "";
  const title = document.createElement("h2");
  title.textContent = name;
  const address = document.createElement("p");
  address.textContent = result.display_name || name;
  const speedInfo = document.createElement("p");
  speedInfo.textContent = "Chưa có dữ liệu tốc độ giao thông cho tuyến này.";
  detailEl.append(title, address, speedInfo);

  map.flyTo([lat, lng], 15, { duration: 0.8 });
  showSearchStatus("Đã chọn vị trí. Hãy tìm tên đường khác để thay thế.");
}

async function searchRoad(query) {
  const elapsed = Date.now() - lastSearchAt;
  if (elapsed < 1100) {
    await new Promise((resolve) => setTimeout(resolve, 1100 - elapsed));
  }
  lastSearchAt = Date.now();

  const params = new URLSearchParams({
    q: `${query}, Hà Nội, Việt Nam`,
    format: "jsonv2",
    countrycodes: "vn",
    viewbox: "105.3,21.4,106.1,20.5",
    bounded: "1",
    limit: "5",
    "accept-language": "vi"
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
  if (!response.ok) {
    throw new Error(`Dịch vụ tìm kiếm trả về mã lỗi ${response.status}.`);
  }

  const results = await response.json();
  if (!Array.isArray(results)) {
    throw new Error("Dữ liệu tìm kiếm không đúng định dạng.");
  }
  return results;
}

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = roadQueryEl.value.trim();
  if (!query) return;

  searchButton.disabled = true;
  searchResultsEl.textContent = "";
  pointsLayer.clearLayers();
  detailEl.hidden = true;
  showSearchStatus("Đang tìm đường…");

  try {
    const results = await searchRoad(query);
    if (results.length === 0) {
      showSearchStatus("Không tìm thấy đường hoặc địa điểm phù hợp tại Hà Nội.");
      return;
    }

    showSearchStatus(`Tìm thấy ${results.length} kết quả. Chọn một vị trí để xem trên bản đồ.`);
    results.forEach((result) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "list-item";
      button.textContent = result.display_name || result.name || "Địa điểm không tên";
      button.addEventListener("click", () => selectRoad(result));
      li.append(button);
      searchResultsEl.append(li);
    });
  } catch (error) {
    console.error("Lỗi khi tìm đường:", error);
    showSearchStatus(error instanceof Error ? error.message : "Không thể tìm đường lúc này.", true);
  } finally {
    searchButton.disabled = false;
  }
});

// ===== CHẠY TRANG =====
if (typeof L === "undefined") {
  // Thư viện Leaflet không tải được (mất mạng hoặc CDN bị chặn)
  showError("Không tải được thư viện bản đồ Leaflet. Hãy kiểm tra kết nối mạng rồi tải lại trang.");
  retryBtn.addEventListener("click", () => location.reload());
} else {
  retryBtn.addEventListener("click", () => location.reload());
  initMap();
  hideStatus();
}