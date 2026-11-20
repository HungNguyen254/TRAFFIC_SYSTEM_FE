import { renderHeader } from "../components/header.js";
import { renderFooter } from "../components/footer.js";
import { renderCompareView } from "../views/compareView.js";
import {
  fetchDirections,
  fetchEdges,
  fetchForecast,
} from "../api.js";

let comparePageActive = false;

function formatDuration(minutes) {
  const rounded = Math.max(1, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (!hours) return `${rest} phút`;
  return rest ? `${hours} giờ ${rest} phút` : `${hours} giờ`;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function defaultDeparture() {
  const now = new Date();
  now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export const comparePage = {
  mount(container) {
    comparePageActive = true;
    container.innerHTML = `
      ${renderHeader("/compare")}
      ${renderCompareView()}
      ${renderFooter()}
    `;

    const form = document.getElementById("compare-form");
    const originSelect = document.getElementById("compare-origin");
    const destinationSelect = document.getElementById("compare-destination");
    const departureInput = document.getElementById("compare-departure");
    const weatherSelect = document.getElementById("compare-weather");
    const submitButton = document.getElementById("compare-submit");
    const statusElement = document.getElementById("compare-status");
    const summaryElement = document.getElementById("compare-summary");
    const resultsElement = document.getElementById("compare-results");
    departureInput.value = defaultDeparture();

    let nodes = [];

    function setStatus(message, isError = false) {
      statusElement.textContent = message;
      statusElement.classList.toggle("error", isError);
    }

    function loadNodeOptions() {
      const seen = new Map();
      nodes.forEach((edge) => {
        const fromId = edge.from?.node_id || edge.from?.node_code;
        const toId = edge.to?.node_id || edge.to?.node_code;
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(fromId || "") && edge.from?.node_name) {
          seen.set(fromId, edge.from);
        }
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(toId || "") && edge.to?.node_name) {
          seen.set(toId, edge.to);
        }
      });

      const choices = [...seen.entries()].map(([nodeId, node]) => ({
        id: nodeId,
        name: node.node_name,
      }));

      originSelect.replaceChildren();
      destinationSelect.replaceChildren();
      if (choices.length < 2) {
        setStatus("Không đủ nút giao hợp lệ để so sánh tuyến.", true);
        submitButton.disabled = true;
        return;
      }
      submitButton.disabled = false;
      choices.forEach((node, index) => {
        const originOption = document.createElement("option");
        originOption.value = node.id;
        originOption.textContent = node.name;
        originSelect.append(originOption);

        const destinationOption = originOption.cloneNode(true);
        destinationSelect.append(destinationOption);

        if (index === 0) originOption.selected = true;
        if (index === 1) destinationOption.selected = true;
      });
    }

    async function forecastRoute(route, baseTime, weather) {
      let elapsed = 0;
      let predictedDuration = 0;
      const stepDetails = [];

      for (const step of route.steps || []) {
        elapsed += step.travel_min;
        const offsetMinutes = Math.max(1, Math.ceil(elapsed));
        const forecast = await fetchForecast({
          edge_id: step.edge_id,
          weather,
          minutes_ahead: [offsetMinutes],
          base_time: baseTime,
        });
        const item = forecast.timeline?.[0];
        const predictedSpeed = item?.predicted_speed || step.speed_kmh;
        const adjustedMin =
          predictedSpeed > 0
            ? (step.length_km / predictedSpeed) * 60
            : step.travel_min;
        predictedDuration += adjustedMin;
        stepDetails.push({
          ...step,
          predicted_speed: predictedSpeed,
          predicted_min: adjustedMin,
          congestion_level: item?.congestion_level || 1,
          target_time: item?.target_time,
        });
      }

      return {
        predictedDuration: predictedDuration || route.total_duration_min,
        stepDetails,
      };
    }

    async function loadEdges() {
      try {
        const edges = await fetchEdges();
        nodes = edges;
        loadNodeOptions();
        setStatus(
          edges.length
            ? `Đã tải ${edges.length} đoạn đường để lập phương án.`
            : "Chưa có dữ liệu đoạn đường.",
          !edges.length,
        );
      } catch (error) {
        setStatus(error.message || "Không thể tải danh sách tuyến.", true);
      }
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (originSelect.value === destinationSelect.value) {
        setStatus("Điểm xuất phát và điểm đến phải khác nhau.", true);
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = "Đang so sánh...";
      setStatus("Đang tính toán hai phương án tuyến...");
      resultsElement.replaceChildren();
      summaryElement.replaceChildren();

      try {
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

        const baseTime = new Date(departureInput.value).toISOString();
        const weather = weatherSelect.value;
        const alternatives = await Promise.all([
          forecastRoute(distanceRoute, baseTime, weather).then((forecast) => ({
            name: "Tuyến ngắn nhất",
            mode: "distance",
            route: distanceRoute,
            ...forecast,
          })),
          forecastRoute(durationRoute, baseTime, weather).then((forecast) => ({
            name: "Tuyến nhanh nhất",
            mode: "duration",
            route: durationRoute,
            ...forecast,
          })),
        ]);

        const fastest = alternatives.reduce((best, item) =>
          item.predictedDuration < best.predictedDuration ? item : best,
        );
        const originName = originSelect.options[originSelect.selectedIndex].textContent;
        const destinationName =
          destinationSelect.options[destinationSelect.selectedIndex].textContent;
        summaryElement.innerHTML = `
          <article class="compare-winner">
            <span>Phương án khuyến nghị</span>
            <strong>${fastest.name}</strong>
            <p>
              Dự kiến ${formatDuration(fastest.predictedDuration)} từ
              ${originName} đến ${destinationName}
            </p>
          </article>
        `;

        alternatives.forEach((alternative) => {
          const departure = new Date(departureInput.value);
          const arrival = new Date(
            departure.getTime() + alternative.predictedDuration * 60000,
          );
          const card = document.createElement("article");
          card.className =
            "compare-route-card" +
            (alternative.mode === fastest.mode ? " is-recommended" : "");

          const highestLevel = Math.max(
            ...alternative.stepDetails.map((step) => step.congestion_level || 1),
            1,
          );
          const levelNames = ["", "Thoáng", "Di chuyển chậm", "Ùn tắc", "Kẹt xe"];
          card.innerHTML = `
            <header class="compare-route-header">
              <div>
                ${alternative.mode === fastest.mode ? '<span class="compare-badge">NHANH HƠN</span>' : ""}
                <h2>${alternative.name}</h2>
              </div>
              <strong>${formatDuration(alternative.predictedDuration)}</strong>
            </header>
            <dl class="compare-route-metrics">
              <div><dt>Quãng đường</dt><dd>${alternative.route.total_distance_km.toFixed(2)} km</dd></div>
              <div><dt>Khởi hành</dt><dd>${formatTime(departure)}</dd></div>
              <div><dt>Đến dự kiến</dt><dd>${formatTime(arrival)}</dd></div>
              <div><dt>Tình trạng cao nhất</dt><dd>${levelNames[highestLevel] || "Thoáng"}</dd></div>
            </dl>
            <ol class="compare-step-list"></ol>
          `;

          const stepList = card.querySelector(".compare-step-list");
          alternative.stepDetails.forEach((step) => {
            const item = document.createElement("li");
            item.innerHTML = `
              <strong>${step.street_name}</strong>
              <span>${step.length_km.toFixed(2)} km · ${formatDuration(step.predicted_min)} · ${Math.round(step.predicted_speed)} km/h</span>
            `;
            stepList.append(item);
          });
          resultsElement.append(card);
        });

        setStatus("Đã hoàn tất so sánh theo giờ khởi hành đã chọn.");
      } catch (error) {
        setStatus(error.message || "Không thể so sánh tuyến.", true);
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = "So sánh tuyến";
      }
    });

    loadEdges();
  },

  unmount() {
    comparePageActive = false;
  },
};
