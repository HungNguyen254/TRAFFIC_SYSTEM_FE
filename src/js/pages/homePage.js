// File: src/js/pages/homePage.js
import { renderHeader } from "../components/header.js";
import { renderFooter } from "../components/footer.js";
import { renderHomeView } from "../views/homeView.js";
import { fetchEdges, fetchForecast, CONGESTION_LEVELS, parseSpeedKmh } from "../api.js";

const LEVEL_CLASS_MAP = {
  1: { textClass: "text-green", label: "Thông thoáng" },
  2: { textClass: "text-yellow", label: "Di chuyển chậm" },
  3: { textClass: "text-red", label: "Ùn tắc nghiêm trọng" },
  4: { textClass: "text-darkred", label: "Kẹt xe hoàn toàn" },
};

async function initTrafficData() {
  const status = document.getElementById("hotspot-status");
  if (!status) return;

  try {
    const edges = await fetchEdges();
    initStreetAutocomplete(edges);
    renderHotspots(edges);
    initHeroStats(edges);
  } catch (err) {
    status.textContent = `Không tải được dữ liệu giao thông: ${err.message}`;
    status.style.color = "#dc2626";
  }
}

function initStreetAutocomplete(edges) {
  const datalist = document.getElementById("street-list");
  if (!datalist) return;
  const names = [...new Set(edges.map((edge) => edge.street_name).filter(Boolean))];
  datalist.replaceChildren(
    ...names.map((name) => {
      const option = document.createElement("option");
      option.value = name;
      return option;
    }),
  );
}

function renderHotspots(edges) {
  const grid = document.getElementById("hotspot-grid");
  const status = document.getElementById("hotspot-status");
  if (!grid || !status) return;

  const hotspots = edges
    .filter((edge) => edge.congestion_level !== null && edge.congestion_level >= 2)
    .sort((a, b) => {
      if (a.congestion_level !== b.congestion_level) return b.congestion_level - a.congestion_level;
      return (
        (parseSpeedKmh(a.speed) ?? Number.POSITIVE_INFINITY) -
        (parseSpeedKmh(b.speed) ?? Number.POSITIVE_INFINITY)
      );
    })
    .slice(0, 6);

  grid.replaceChildren();
  if (!hotspots.length) {
    status.textContent = "Hiện chưa ghi nhận đoạn đường di chuyển chậm hoặc ùn tắc.";
    status.style.color = "";
    return;
  }

  status.textContent = `Đang hiển thị ${hotspots.length} đoạn đường có mật độ cao nhất theo dữ liệu giám sát.`;
  status.style.color = "";

  hotspots.forEach((edge) => {
    const levelInfo = LEVEL_CLASS_MAP[edge.congestion_level] || LEVEL_CLASS_MAP[2];
    const card = document.createElement("article");
    card.className = "card hotspot-card";

    const title = document.createElement("h3");
    title.textContent = edge.corridor_name || edge.street_name || "Tuyến đường";
    card.appendChild(title);

    if (edge.from?.node_name || edge.to?.node_name) {
      const segment = document.createElement("p");
      segment.className = "hotspot-segment";
      segment.textContent = [edge.from?.node_name, edge.to?.node_name]
        .filter(Boolean)
        .join(" → ");
      card.appendChild(segment);
    }

    const levelLabel = document.createElement("p");
    levelLabel.className = `level-label hotspot-index ${levelInfo.textClass}`;
    levelLabel.textContent = levelInfo.label;
    card.appendChild(levelLabel);

    const speed = parseSpeedKmh(edge.speed);
    if (speed !== null) {
      const speedLabel = document.createElement("p");
      speedLabel.className = "hotspot-speed";
      speedLabel.textContent = `${new Intl.NumberFormat("vi-VN", {
        maximumFractionDigits: 1,
      }).format(speed)} km/h`;
      card.appendChild(speedLabel);
    }

    grid.appendChild(card);
  });
}

function initForecastForm() {
  const form = document.getElementById("forecast-form");
  if (!form) return;

  const statusEl = document.getElementById("fc-status");
  const resultBox = document.getElementById("fc-result");
  const submitBtn = document.getElementById("fc-submit");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const streetName = document.getElementById("fc-street").value.trim();
    const weather = document.getElementById("fc-weather").value;
    const minutes = Number(document.getElementById("fc-minutes").value);
    if (!streetName) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Đang dự báo...";
    statusEl.textContent = "Hệ thống AI đang tính toán, vui lòng chờ...";

    try {
      const data = await fetchForecast({
        street_name: streetName,
        weather,
        minutes_ahead: [minutes],
      });
      renderForecast(data);
      statusEl.style.color = "";
      statusEl.textContent = `Dự báo thành công cho tuyến "${data.street_name}".`;
    } catch (err) {
      resultBox.hidden = true;
      statusEl.textContent = `Lỗi: ${err.message}`;
      statusEl.style.color = "#dc2626";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Phân tích & Dự báo";
    }
  });
}

function renderForecast(data) {
  const resultBox = document.getElementById("fc-result");
  const titleEl = document.getElementById("fc-street-title");
  const maxSpeedEl = document.getElementById("fc-max-speed");
  const timelineEl = document.getElementById("fc-timeline");
  const statusEl = document.getElementById("fc-status");

  if (!resultBox || !titleEl || !maxSpeedEl || !timelineEl || !statusEl) return;

  titleEl.textContent = data.street_name;
  maxSpeedEl.textContent = `Giới hạn tốc độ: ${data.max_speed_limit} km/h`;

  timelineEl.innerHTML = (data.timeline || []).map((item) => {
    const lvl = LEVEL_CLASS_MAP[item.congestion_level] || LEVEL_CLASS_MAP[2];
    const percent = Math.round(item.risk_factor * 100);
    const targetTime = new Date(item.target_time).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `
      <li class="timeline-item">
        <div class="timeline-time">
          <strong>+${item.minutes_ahead} phút</strong>
          <small>${targetTime}</small>
        </div>
        <div class="timeline-body">
          <div class="timeline-speed ${lvl.textClass}">
            ${item.predicted_speed} km/h
            <small>(${lvl.label})</small>
          </div>
          <div class="risk-track" title="Hệ số rủi ro">
            <div class="risk-bar" style="width: ${percent}%;"></div>
          </div>
          <p class="timeline-desc">${item.description}</p>
        </div>
      </li>
    `;
  }).join("");

  statusEl.style.color = "";
  resultBox.hidden = false;
}

function initHeroStats(edges) {
  const corridors = new Map();
  let totalDistance = 0;
  let totalTravelTime = 0;

  edges.forEach((edge) => {
    const corridorName = edge.corridor_name || edge.street_name || edge.edge_code;
    const level = edge.congestion_level;
    const corridorLevel = corridors.get(corridorName) ?? 0;
    corridors.set(
      corridorName,
      level === null ? corridorLevel : Math.max(corridorLevel, level),
    );

    const speed = parseSpeedKmh(edge.speed) ??
      (level === null ? null : (CONGESTION_LEVELS[level]?.speed || 30));
    if (speed === null) return;
    const distance = Number(edge.length_km) || 1;
    totalDistance += distance;
    totalTravelTime += distance / speed;
  });

  const corridorCount = document.getElementById("stat-edges");
  const congested = document.getElementById("stat-congested");
  const average = document.getElementById("stat-avg");
  if (corridorCount) corridorCount.textContent = String(corridors.size);
  if (congested) {
    congested.textContent = String(
      [...corridors.values()].filter((level) => level >= 3).length,
    );
  }
  if (average) {
    average.textContent = totalTravelTime
      ? `${Math.round(totalDistance / totalTravelTime)} km/h`
      : "--";
  }
}

export const homePage = {
  mount(container) {
    container.innerHTML = `
      ${renderHeader("/")}
      ${renderHomeView()}
      ${renderFooter()}
    `;

    initForecastForm();
    initTrafficData();
  },

  unmount() {},
};
