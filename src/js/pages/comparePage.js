import { renderHeader } from "../components/header.js";
import { renderFooter } from "../components/footer.js";
import { fetchDirections, fetchEdges, fetchRouteForecast, isPremium } from "../api.js";
import { forecastRoute } from "../services/routeForecast.js";
import { renderCompareView } from "../views/compareView.js";

let comparePageActive = false;

function formatDuration(minutes) {
  const rounded = Math.max(1, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const remainingMinutes = rounded % 60;
  if (!hours) return `${remainingMinutes} phút`;
  return remainingMinutes ? `${hours} giờ ${remainingMinutes} phút` : `${hours} giờ`;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLocalDateTimeValue(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function defaultDeparture() {
  const now = new Date();
  now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
  return toLocalDateTimeValue(now);
}

function setOptions(select, choices, placeholder) {
  select.replaceChildren();
  const initialOption = document.createElement("option");
  initialOption.value = "";
  initialOption.textContent = placeholder;
  select.append(initialOption);

  choices.forEach((choice) => {
    const option = document.createElement("option");
    option.value = choice.id;
    option.textContent = choice.label;
    select.append(option);
  });
}

function createRouteCard(alternative, recommended, departureTime) {
  const arrivalTime = new Date(
    departureTime.getTime() + alternative.predictedDuration * 60000,
  );
  const highestCongestion = Math.max(
    ...alternative.stepDetails.map((step) => Number(step.congestion_level) || 1),
    1,
  );
  const congestionLabels = ["", "Thông thoáng", "Di chuyển chậm", "Ùn tắc", "Kẹt xe"];
  const card = document.createElement("article");
  card.className = `compare-route-card${recommended ? " is-recommended" : ""}`;

  const header = document.createElement("header");
  header.className = "compare-route-header";
  const titleGroup = document.createElement("div");
  if (recommended) {
    const badge = document.createElement("span");
    badge.className = "compare-badge";
    badge.textContent = "NHANH NHẤT THEO DỰ BÁO";
    titleGroup.append(badge);
  }
  const title = document.createElement("h2");
  title.textContent = alternative.name;
  titleGroup.append(title);
  const duration = document.createElement("strong");
  duration.textContent = formatDuration(alternative.predictedDuration);
  header.append(titleGroup, duration);

  const metrics = document.createElement("dl");
  metrics.className = "compare-route-metrics";
  [
    ["Quãng đường", `${Number(alternative.route.total_distance_km).toFixed(2)} km`],
    ["Khởi hành", formatTime(departureTime)],
    ["Đến dự kiến", formatTime(arrivalTime)],
    ["Ùn tắc cao nhất", congestionLabels[highestCongestion] || "Không rõ"],
  ].forEach(([label, value]) => {
    const group = document.createElement("div");
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = value;
    group.append(term, detail);
    metrics.append(group);
  });

  const steps = document.createElement("ol");
  steps.className = "compare-step-list";
  alternative.stepDetails.forEach((step) => {
    const item = document.createElement("li");
    const street = document.createElement("strong");
    street.textContent = step.street_name || "Đoạn đường";
    const detail = document.createElement("span");
    detail.textContent =
      `${Number(step.length_km).toFixed(2)} km · ` +
      `${formatDuration(step.predicted_min)} · ` +
      `${Math.round(step.predicted_speed)} km/h dự kiến`;
    item.append(street, detail);
    steps.append(item);
  });

  if (alternative.route?.risk_warning) {
    const warning = document.createElement("div");
    warning.className = "compare-route-warning";
    warning.style.color = "#dc2626";
    warning.style.fontSize = "0.875rem";
    warning.style.marginTop = "0.5rem";
    warning.style.fontWeight = "600";
    warning.textContent = `⚠️ ${alternative.route.risk_warning}`;
    metrics.after(warning);
  }

  card.append(header, metrics, steps);
  return card;
}

export const comparePage = {
  mount(container) {
    comparePageActive = true;
    container.innerHTML = `
      ${renderHeader("/compare")}
      ${renderCompareView()}
      ${renderFooter()}
    `;

    // Chức năng so sánh 2 tuyến đường: chỉ dành cho Premium
    if (!isPremium()) {
      const form = document.getElementById("compare-form");
      const formElements = form?.querySelectorAll("input, select, button") || [];
      formElements.forEach((el) => (el.disabled = true));
      if (form) {
        const lock = document.createElement("div");
        lock.className = "premium-lock-overlay card";
        lock.innerHTML = `
          <h3>🔒 Tính năng Premium</h3>
          <p>Chức năng <strong>so sánh 2 tuyến đường</strong> chỉ dành cho tài khoản <strong>Premium</strong>.</p>
          <a href="/premium" class="btn" data-link>Nâng cấp Premium ngay</a>
        `;
        form.parentElement.insertBefore(lock, form);
        form.style.display = "none";
      }
      const status = document.getElementById("compare-status");
      if (status) status.textContent = "";
      return;
    }

    const form = document.getElementById("compare-form");
    const originSelect = document.getElementById("compare-origin");
    const destinationSelect = document.getElementById("compare-destination");
    const departureInput = document.getElementById("compare-departure");
    const weatherSelect = document.getElementById("compare-weather");
    const submitButton = document.getElementById("compare-submit");
    const statusElement = document.getElementById("compare-status");
    const summaryElement = document.getElementById("compare-summary");
    const resultsElement = document.getElementById("compare-results");
    if (
      !form ||
      !originSelect ||
      !destinationSelect ||
      !departureInput ||
      !weatherSelect ||
      !submitButton ||
      !statusElement ||
      !summaryElement ||
      !resultsElement
    ) {
      throw new Error("Không thể khởi tạo giao diện so sánh tuyến.");
    }

    departureInput.value = defaultDeparture();
    const now = new Date();
    departureInput.min = toLocalDateTimeValue(now);
    departureInput.max = toLocalDateTimeValue(
      new Date(now.getTime() + 24 * 60 * 60 * 1000),
    );
    const nodeNamesById = new Map();

    function setStatus(message, isError = false) {
      statusElement.textContent = message;
      statusElement.classList.toggle("error", isError);
      statusElement.setAttribute("role", isError ? "alert" : "status");
    }

    async function loadNodeOptions() {
      try {
        const edges = await fetchEdges();
        if (!comparePageActive) return;
        const nodesById = new Map();
        edges.forEach((edge) => {
          [edge.from, edge.to].forEach((node) => {
            if (node?.node_id && node.node_name) {
              nodesById.set(node.node_id, node);
              nodeNamesById.set(node.node_id, node.node_name);
            }
          });
        });
        const choices = [...nodesById.entries()]
          .map(([id, node]) => ({
            id,
            label: node.node_code
              ? `${node.node_name} (${node.node_code})`
              : node.node_name,
          }))
          .sort((left, right) => left.label.localeCompare(right.label, "vi"));
        setOptions(
          originSelect,
          choices,
          choices.length ? "Chọn điểm xuất phát" : "Không có nút giao",
        );
        setOptions(
          destinationSelect,
          choices,
          choices.length ? "Chọn điểm đến" : "Không có nút giao",
        );
        if (choices.length >= 2) {
          originSelect.value = choices[0].id;
          destinationSelect.value = choices[1].id;
          submitButton.disabled = false;
          setStatus(`Đã tải ${choices.length} nút giao để lập phương án.`);
        } else {
          submitButton.disabled = true;
          setStatus("Cần ít nhất hai nút giao hợp lệ để so sánh tuyến.", true);
        }
      } catch (error) {
        if (!comparePageActive) return;
        setOptions(originSelect, [], "Không thể tải nút giao");
        setOptions(destinationSelect, [], "Không thể tải nút giao");
        submitButton.disabled = true;
        setStatus(
          error instanceof Error ? error.message : "Không thể tải danh sách nút giao.",
          true,
        );
      }
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const departureTime = new Date(departureInput.value);
      if (!Number.isFinite(departureTime.getTime())) {
        setStatus("Vui lòng chọn giờ khởi hành hợp lệ.", true);
        return;
      }
      if (departureTime.getTime() < Date.now()) {
        setStatus("Giờ khởi hành không được ở trong quá khứ.", true);
        return;
      }
      if (departureTime.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
        setStatus("Giờ khởi hành chỉ hỗ trợ dự báo trong 24 giờ tới.", true);
        return;
      }
      if (originSelect.value === destinationSelect.value) {
        setStatus("Điểm xuất phát và điểm đến phải khác nhau.", true);
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = "Đang so sánh...";
      setStatus("Đang tính tuyến và lấy dự báo theo giờ khởi hành...");
      summaryElement.replaceChildren();
      summaryElement.hidden = true;
      resultsElement.replaceChildren();

      try {
        const departureIso = departureTime.toISOString();
        const weather = weatherSelect.value;
        const [distanceRoute, durationRoute] = await Promise.all([
          fetchDirections({
            origin_node_id: originSelect.value,
            destination_node_id: destinationSelect.value,
            weight_mode: "distance",
          }),
          fetchDirections({
            origin_node_id: originSelect.value,
            destination_node_id: destinationSelect.value,
            weight_mode: "duration",
          }),
        ]);
        if (!comparePageActive) return;

        const alternatives = await Promise.all([
          forecastRoute(distanceRoute, departureIso, weather, fetchRouteForecast).then(
            (forecast) => ({
              name: "Tuyến ngắn nhất",
              route: distanceRoute,
              ...forecast,
            }),
          ),
          forecastRoute(durationRoute, departureIso, weather, fetchRouteForecast).then(
            (forecast) => ({
              name: "Tuyến ưu tiên thời gian",
              route: durationRoute,
              ...forecast,
            }),
          ),
        ]);
        if (!comparePageActive) return;

        const fastest = alternatives.reduce((best, item) =>
          item.predictedDuration < best.predictedDuration ? item : best,
        );
        const originName = nodeNamesById.get(originSelect.value) || "điểm đi";
        const destinationName =
          nodeNamesById.get(destinationSelect.value) || "điểm đến";
        const summary = document.createElement("article");
        summary.className = "compare-winner";
        const label = document.createElement("span");
        label.textContent = "Phương án nhanh nhất theo dự báo";
        const winner = document.createElement("strong");
        winner.textContent = fastest.name;
        const description = document.createElement("p");
        description.textContent =
          `Dự kiến ${formatDuration(fastest.predictedDuration)} từ ${originName} đến ${destinationName}.`;
        summary.append(label, winner, description);
        summaryElement.append(summary);
        summaryElement.hidden = false;

        alternatives.forEach((alternative) => {
          resultsElement.append(
            createRouteCard(
              alternative,
              alternative === fastest,
              departureTime,
            ),
          );
        });
        setStatus("Đã hoàn tất so sánh theo giờ khởi hành đã chọn.");
      } catch (error) {
        if (!comparePageActive) return;
        setStatus(
          error instanceof Error ? error.message : "Không thể so sánh tuyến.",
          true,
        );
      } finally {
        if (comparePageActive) {
          submitButton.disabled = false;
          submitButton.textContent = "So sánh tuyến";
        }
      }
    });

    loadNodeOptions();
  },

  unmount() {
    comparePageActive = false;
  },
};
