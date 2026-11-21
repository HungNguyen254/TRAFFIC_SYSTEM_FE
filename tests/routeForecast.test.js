import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEdges } from "../src/js/api.js";
import { forecastRoute } from "../src/js/services/routeForecast.js";

test("forecastRoute sends all ordered steps in one forecast request", async () => {
  const route = {
    steps: [
      {
        edge_id: "edge-1",
        street_name: "Đường thứ nhất",
        length_km: 5,
        travel_min: 10,
      },
      {
        edge_id: "edge-2",
        street_name: "Đường thứ hai",
        length_km: 10,
        travel_min: 10,
      },
    ],
  };

  const result = await forecastRoute(
    route,
    "2026-11-22T00:00:00.000Z",
    "rain",
    async (request) => {
      assert.deepEqual(request, {
        base_time: "2026-11-22T00:00:00.000Z",
        weather: "rain",
        steps: [
          { edge_id: "edge-1", baseline_travel_min: 10 },
          { edge_id: "edge-2", baseline_travel_min: 10 },
        ],
      });
      return {
        predicted_duration_min: 30,
        steps: [
          {
            edge_id: "edge-1",
            predicted_speed: 30,
            predicted_minutes: 10,
            congestion_level: 2,
            target_time: "2026-11-22T00:05:00.000Z",
          },
          {
            edge_id: "edge-2",
            predicted_speed: 30,
            predicted_minutes: 20,
            congestion_level: 2,
            target_time: "2026-11-22T00:15:00.000Z",
          },
        ],
      };
    },
  );

  assert.equal(result.predictedDuration, 30);
  assert.deepEqual(
    result.stepDetails.map(({ predicted_speed, predicted_min, target_time }) => ({
      predicted_speed,
      predicted_min,
      target_time,
    })),
    [
      {
        predicted_speed: 30,
        predicted_min: 10,
        target_time: "2026-11-22T00:05:00.000Z",
      },
      {
        predicted_speed: 30,
        predicted_min: 20,
        target_time: "2026-11-22T00:15:00.000Z",
      },
    ],
  );
});

test("forecastRoute rejects missing predictions instead of inventing an ETA", async () => {
  await assert.rejects(
    forecastRoute(
      {
        steps: [
          {
            edge_id: "edge-1",
            street_name: "Đường",
            length_km: 1,
            travel_min: 5,
          },
        ],
      },
      "2026-11-22T00:00:00.000Z",
      "sunny",
      async () => ({
        predicted_duration_min: 5,
        steps: [],
      }),
    ),
    /Không nhận được kết quả dự báo hợp lệ/,
  );
});

test("normalizeEdges resolves endpoint IDs from the nodes collection", () => {
  const [edge] = normalizeEdges({
    nodes: [
      {
        node_id: "11111111-1111-4111-8111-111111111111",
        node_code: "NODE-A",
        node_name: "Điểm A",
        latitude: 21,
        longitude: 105,
      },
      {
        node_id: "22222222-2222-4222-8222-222222222222",
        node_code: "NODE-B",
        node_name: "Điểm B",
        latitude: 21.1,
        longitude: 105.1,
      },
    ],
    edges: [
      {
        edge_id: "edge-1",
        from: { node_code: "NODE-A", node_name: "Điểm A", lat: 21, lng: 105 },
        to: { node_code: "NODE-B", node_name: "Điểm B", lat: 21.1, lng: 105.1 },
      },
    ],
  });

  assert.equal(edge.from.node_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(edge.to.node_id, "22222222-2222-4222-8222-222222222222");
});
