import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHourlySpeedSeries } from "../src/js/services/segmentSpeedChart.js";

function makeHistory(valuesByDay) {
  return {
    buckets: valuesByDay.flatMap((values, day) =>
      values.map((speed, hour) => ({
        day_of_week: day,
        hour_of_day: hour,
        average_speed: speed,
        sample_count: speed === null ? 0 : 1,
      })),
    ),
  };
}

test("builds today's hourly corridor speed and weekly average", () => {
  const edges = [{ edge_id: "edge-1" }, { edge_id: "edge-2" }];
  const histories = [
    makeHistory([[20], [30]]),
    makeHistory([[40], [50]]),
  ];

  const { today, average } = buildHourlySpeedSeries(edges, histories, [1, 1], 0);

  assert.ok(Math.abs(today[0] - 26.6667) < 0.001);
  assert.ok(Math.abs(average[0] - 32.0833) < 0.001);
  assert.equal(today.length, 24);
  assert.equal(today[1], null);
});

test("leaves hours without samples blank instead of inventing speeds", () => {
  const series = buildHourlySpeedSeries(
    [{ edge_id: "edge-1" }],
    [makeHistory([[null]])],
    [1],
    0,
  );

  assert.equal(series.today[0], null);
  assert.equal(series.average[0], null);
});
