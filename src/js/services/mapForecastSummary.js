import { CONGESTION_LEVELS } from "../constants/traffic.js";

const RECOMMENDATIONS = {
  1: "Có thể di chuyển bình thường; theo dõi cập nhật trước khi khởi hành.",
  2: "Nên dự phòng thêm thời gian và theo dõi tình hình trước chuyến đi.",
  3: "Cân nhắc tuyến thay thế hoặc khởi hành lệch giờ cao điểm.",
  4: "Nên tránh khu vực ùn tắc và chọn lộ trình thay thế.",
};

export function summarizeMapForecast(forecast) {
  if (!Array.isArray(forecast?.edges) || forecast.edges.length === 0) {
    throw new Error("Chưa có dữ liệu đoạn đường để tạo dự báo.");
  }

  const counts = new Map();
  const descriptions = new Map();
  const agreements = [];

  forecast.edges.forEach((edge) => {
    const level = Number(edge.congestion_level);
    if (!CONGESTION_LEVELS[level] || !Number.isFinite(Number(edge.predicted_speed))) {
      throw new Error("Dữ liệu dự báo cho một đoạn đường không hợp lệ.");
    }

    counts.set(level, (counts.get(level) || 0) + 1);
    if (edge.description && !descriptions.has(level)) {
      descriptions.set(level, edge.description);
    }

    if (edge.ensemble_agreement !== null && edge.ensemble_agreement !== undefined) {
      const agreement = Number(edge.ensemble_agreement);
      if (Number.isFinite(agreement) && agreement >= 0 && agreement <= 1) {
        agreements.push(agreement);
      }
    }
  });

  const [dominantLevel, dominantCount] = [...counts.entries()].sort(
    ([levelA, countA], [levelB, countB]) =>
      countB - countA || levelB - levelA,
  )[0];
  const targetTime = new Date(forecast.target_time);
  if (!Number.isFinite(targetTime.getTime())) {
    throw new Error("Thời điểm dự báo không hợp lệ.");
  }

  return {
    congestionLevel: dominantLevel,
    congestionLabel: CONGESTION_LEVELS[dominantLevel].label,
    affectedRoadCount: dominantCount,
    totalRoadCount: forecast.edges.length,
    description:
      descriptions.get(dominantLevel) ||
      `Mức độ ùn tắc phổ biến dự kiến: ${CONGESTION_LEVELS[dominantLevel].label.toLowerCase()}.`,
    recommendation: RECOMMENDATIONS[dominantLevel],
    targetTime,
    ensembleAgreement:
      agreements.length > 0
        ? Number(
            (agreements.reduce((total, value) => total + value, 0) / agreements.length).toFixed(3),
          )
        : null,
    agreementRoadCount: agreements.length,
    predictionSource: forecast.prediction_source,
  };
}
