import assert from "node:assert/strict";
import test from "node:test";

import { summarizeMapForecast } from "../src/js/services/mapForecastSummary.js";

test("summarizes the dominant forecast and reports ensemble agreement separately from risk", () => {
  const summary = summarizeMapForecast({
    target_time: "2026-11-21T08:30:00+07:00",
    prediction_source: "machine_learning",
    edges: [
      { congestion_level: 3, predicted_speed: 18, description: "Đông đúc", ensemble_agreement: 0.8 },
      { congestion_level: 3, predicted_speed: 20, description: "Đông đúc", ensemble_agreement: 0.9 },
      { congestion_level: 1, predicted_speed: 42, description: "Thông thoáng", ensemble_agreement: 0.7 },
    ],
  });

  assert.equal(summary.congestionLabel, "Ùn tắc nghiêm trọng");
  assert.equal(summary.affectedRoadCount, 2);
  assert.equal(summary.totalRoadCount, 3);
  assert.equal(summary.description, "Đông đúc");
  assert.equal(summary.ensembleAgreement, 0.8);
  assert.equal(summary.recommendation, "Cân nhắc tuyến thay thế hoặc khởi hành lệch giờ cao điểm.");
});

test("leaves ensemble agreement unavailable when the forecast uses heuristic fallback", () => {
  const summary = summarizeMapForecast({
    target_time: "2026-11-21T08:30:00+07:00",
    prediction_source: "heuristic",
    edges: [{ congestion_level: 2, predicted_speed: 30, ensemble_agreement: null }],
  });

  assert.equal(summary.ensembleAgreement, null);
  assert.equal(summary.predictionSource, "heuristic");
});

test("rejects empty or invalid map forecasts", () => {
  assert.throws(
    () => summarizeMapForecast({ edges: [], target_time: "2026-11-21T08:30:00Z" }),
    /Chưa có dữ liệu đoạn đường/,
  );
  assert.throws(
    () => summarizeMapForecast({
      edges: [{ congestion_level: 0, predicted_speed: 10 }],
      target_time: "2026-11-21T08:30:00Z",
    }),
    /không hợp lệ/,
  );
});
