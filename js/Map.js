// ===== CẤU HÌNH =====
const BACKEND_URL = "http://127.0.0.1:8000";
const USE_SAMPLE = true; // true: dùng dữ liệu mẫu | false: lấy từ Backend (/api/hotspots)
const HANOI_CENTER = [21.0285, 105.8542];

// Dữ liệu mẫu. level = [sáng, trưa, chiều, tối] (đơn vị %). Tọa độ chỉ gần đúng.
const SAMPLE_DATA = [
  { name: "Ngã Tư Sở",         lat: 21.0067, lng: 105.8198, level: [74, 42, 90, 28] },
  { name: "Nút giao Mai Dịch", lat: 21.0375, lng: 105.7747, level: [90, 55, 94, 40] },
  { name: "Ngã tư Cầu Giấy",   lat: 21.0333, lng: 105.7940, level: [82, 38, 85, 30] },
  { name: "Ngã Tư Vọng",       lat: 20.9980, lng: 105.8412, level: [78, 45, 88, 32] },
  { name: "Đường Phạm Hùng",   lat: 21.0140, lng: 105.7830, level: [48, 30, 62, 20] }
];

// ===== LẤY CÁC PHẦN TỬ TRÊN TRANG =====
const statusEl = document.getElementById("status-overlay");
const statusTextEl = document.getElementById("status-text");
const retryBtn = document.getElementById("retry-btn");
const tileWarningEl = document.getElementById("tile-warning");
const timeSelect = document.getElementById("time-select");
const summaryEl = document.getElementById("summary");
const listEl = document.getElementById("list");
const detailEl = document.getElementById("detail");

// ===== TRẠNG THÁI CỦA TRANG =====
let map = null;
let pointsLayer = null;
let hotspots = [];
let timeSlot = 0;
let selectedIndex = -1;
let markers = [];

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

// ===== PHÂN LOẠI MỨC ĐỘ ÙN TẮC =====
function getLevelInfo(level) {
  if (level >= 70) return { label: "Tắc nghẽn", cssClass: "red", color: "#d8402f" };
  if (level >= 40) return { label: "Đông", cssClass: "yellow", color: "#e7a416" };
  return { label: "Thông thoáng", cssClass: "green", color: "#1e9e6a" };
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

// ===== TẢI DỮ LIỆU =====
async function fetchData() {
  if (USE_SAMPLE) {
    // Giả lập độ trễ mạng để thấy trạng thái "đang tải"
    await new Promise((resolve) => setTimeout(resolve, 600));
    return SAMPLE_DATA;
  }

  const response = await fetch(`${BACKEND_URL}/api/hotspots`);
  if (!response.ok) {
    throw new Error(`Backend trả về mã lỗi ${response.status}`);
  }
  return response.json();
}

function validateData(list) {
  if (!Array.isArray(list)) return false;
  return list.every((item) =>
    typeof item.name === "string" &&
    Number.isFinite(item.lat) && Number.isFinite(item.lng) &&
    Array.isArray(item.level) && item.level.length === 4
  );
}

async function loadData() {
  showLoading("Đang tải dữ liệu giao thông…");
  try {
    const list = await fetchData();
    if (!validateData(list)) {
      throw new Error("Dữ liệu nhận về không đúng định dạng.");
    }
    hotspots = list;
    selectedIndex = -1;
    renderAll();
    hideStatus();
  } catch (error) {
    console.error("Lỗi khi tải dữ liệu:", error);
    const message = USE_SAMPLE
      ? "Không đọc được dữ liệu mẫu."
      : "Không thể kết nối tới Backend. Hãy kiểm tra server đã chạy ở " + BACKEND_URL + " chưa.";
    showError(message);
  }
}

// ===== VẼ ĐIỂM TRÊN BẢN ĐỒ VÀ PANEL =====
function renderAll() {
  pointsLayer.clearLayers();
  markers = [];
  listEl.textContent = "";

  let congestedCount = 0;

  hotspots.forEach((spot, i) => {
    const level = spot.level[timeSlot];
    const info = getLevelInfo(level);
    if (level >= 70) congestedCount++;

    // Điểm trên bản đồ
    const marker = L.circleMarker([spot.lat, spot.lng], {
      radius: 12,
      color: info.color,
      fillColor: info.color,
      fillOpacity: 0.6,
      weight: 2
    }).addTo(pointsLayer);

    marker.on("click", () => selectPoint(i, false));
    markers.push(marker);

    // Dòng trong danh sách (dùng textContent để tránh chèn HTML từ dữ liệu)
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "list-item";
    button.dataset.index = i;

    const nameEl = document.createElement("span");
    nameEl.className = "item-name";
    const dot = document.createElement("span");
    dot.className = "list-dot " + info.cssClass;
    nameEl.append(dot, spot.name);

    const valueEl = document.createElement("span");
    valueEl.className = "item-value";
    valueEl.textContent = level + "%";

    button.append(nameEl, valueEl);
    button.addEventListener("click", () => selectPoint(i, true));
    li.append(button);
    listEl.append(li);
  });

  summaryEl.textContent = hotspots.length === 0
    ? "Không có điểm nóng nào."
    : `${hotspots.length} điểm theo dõi, ${congestedCount} điểm đang tắc nghẽn.`;

  if (selectedIndex >= 0) {
    selectPoint(selectedIndex, false);
  } else {
    detailEl.innerHTML = "<p>Chọn một điểm trên bản đồ hoặc trong danh sách để xem chi tiết.</p>";
  }
}

// ===== CHỌN MỘT ĐIỂM =====
function selectPoint(index, flyToPoint) {
  const spot = hotspots[index];
  if (!spot) return;
  selectedIndex = index;

  // Đánh dấu dòng đang chọn
  document.querySelectorAll(".list-item").forEach((button) => {
    button.classList.toggle("selected", Number(button.dataset.index) === index);
  });

  if (flyToPoint) {
    map.flyTo([spot.lat, spot.lng], 14, { duration: 0.8 });
  }

  const level = spot.level[timeSlot];
  const info = getLevelInfo(level);

  // Panel chi tiết
  detailEl.textContent = "";
  const title = document.createElement("h2");
  title.textContent = spot.name;

  const levelLine = document.createElement("p");
  levelLine.textContent = `Mức ùn tắc: ${level}% · ${info.label}`;

  const barBox = document.createElement("div");
  barBox.className = "bar-track";
  const bar = document.createElement("div");
  bar.className = "bar";
  bar.style.width = level + "%";
  bar.style.background = info.color;
  barBox.append(bar);

  const slotName = timeSelect.options[timeSlot].text;
  const slotLine = document.createElement("p");
  slotLine.textContent = `Khung giờ: ${slotName}`;

  detailEl.append(title, levelLine, barBox, slotLine);

  // Popup trên bản đồ
  markers[index].bindPopup(`${spot.name}: ${level}%`).openPopup();
}

// ===== SỰ KIỆN =====
timeSelect.addEventListener("change", () => {
  timeSlot = Number(timeSelect.value);
  renderAll();
});

// ===== CHẠY TRANG =====
if (typeof L === "undefined") {
  // Thư viện Leaflet không tải được (mất mạng hoặc CDN bị chặn)
  showError("Không tải được thư viện bản đồ Leaflet. Hãy kiểm tra kết nối mạng rồi tải lại trang.");
  retryBtn.addEventListener("click", () => location.reload());
} else {
  retryBtn.addEventListener("click", loadData);
  initMap();
  loadData();
}