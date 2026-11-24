import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeEdges,
  request,
  fetchEdges,
  fetchEdgeById,
  fetchEdgeHistory,
  fetchDirections,
  fetchRouteAlternatives,
  searchGeocode,
  reverseGeocode,
  fetchAdminUsers,
  updateAdminUser,
  deleteAdminUser,
  fetchAdminRoads,
  createAdminRoad,
  updateAdminRoad,
  deleteAdminRoad,
  triggerRetrainModel,
  saveSession,
  clearSession,
  getToken,
  getUser,
} from "../src/js/api.js";

test("normalizeEdges standardizes BE data with all edge and node fields", () => {
  const bePayload = {
    nodes: [
      {
        node_id: "node-1-uuid",
        node_code: "NODE_NTS",
        node_name: "Ngã tư Sở",
        district: "Đống Đa",
        lat: 21.0025,
        lng: 105.8198,
      },
      {
        node_id: "node-2-uuid",
        node_code: "NODE_CG",
        node_name: "Nút giao Cầu Giấy",
        district: "Cầu Giấy",
        lat: 21.0332,
        lng: 105.7985,
      },
    ],
    edges: [
      {
        edge_id: "edge-1-uuid",
        edge_code: "EDGE_LANG_UP",
        street_name: "Đường Láng",
        from_node_id: "node-1-uuid",
        to_node_id: "node-2-uuid",
        length_km: 4.1,
        max_speed_limit: 50,
        geom: JSON.stringify({
          type: "LineString",
          coordinates: [
            [105.8198, 21.0025],
            [105.7985, 21.0332],
          ],
        }),
        from: {
          node_code: "NODE_NTS",
          node_name: "Ngã tư Sở",
          lat: 21.0025,
          lng: 105.8198,
        },
        to: {
          node_code: "NODE_CG",
          node_name: "Nút giao Cầu Giấy",
          lat: 21.0332,
          lng: 105.7985,
        },
        congestion_level: 1,
        speed: 39.0,
        updated_at: "2026-11-23T05:00:00Z",
      },
    ],
  };

  const normalized = normalizeEdges(bePayload);
  assert.equal(normalized.length, 1);
  const edge = normalized[0];

  assert.equal(edge.edge_id, "edge-1-uuid");
  assert.equal(edge.edge_code, "EDGE_LANG_UP");
  assert.equal(edge.street_name, "Đường Láng");
  assert.equal(edge.from_node_id, "node-1-uuid");
  assert.equal(edge.to_node_id, "node-2-uuid");
  assert.equal(edge.length_km, 4.1);
  assert.equal(edge.max_speed_limit, 50);
  assert.equal(edge.congestion_level, 1);
  assert.equal(edge.speed_num, 39);
  assert.equal(edge.speed, "39 km/h");

  // Endpoint nodes should inherit node_id and district from the nodes array
  assert.equal(edge.from.node_id, "node-1-uuid");
  assert.equal(edge.from.node_code, "NODE_NTS");
  assert.equal(edge.from.district, "Đống Đa");
  assert.equal(edge.from.lat, 21.0025);
  assert.equal(edge.from.lng, 105.8198);

  assert.equal(edge.to.node_id, "node-2-uuid");
  assert.equal(edge.to.node_code, "NODE_CG");
  assert.equal(edge.to.district, "Cầu Giấy");

  // Geometry should parse to Leaflet [lat, lng] array
  assert.deepEqual(edge.geometry, [
    [21.0025, 105.8198],
    [21.0332, 105.7985],
  ]);
});

test("request unwraps StandardResponse envelope correctly including null data", async () => {
  const originalFetch = globalThis.fetch;

  // Test 1: data is null (e.g. DELETE endpoints or change-password)
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      status_code: 200,
      message: "Thao tác thành công",
      error: null,
      data: null,
      path: "/test",
      timestamp: "2026-11-23T00:00:00Z",
    }),
  });

  const resNull = await request("/test");
  assert.equal(resNull, null, "data: null must unwrap to null, not the envelope object");

  // Test 2: data is an object
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      status_code: 200,
      message: "Thành công",
      data: { user_id: "abc", email: "test@example.com" },
    }),
  });

  const resObj = await request("/test");
  assert.deepEqual(resObj, { user_id: "abc", email: "test@example.com" });

  globalThis.fetch = originalFetch;
});

test("request extracts Pydantic validation error details on HTTP 422", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: false,
    status: 422,
    json: async () => ({
      status_code: 422,
      message: "Dữ liệu đầu vào không hợp lệ!",
      error: [
        {
          loc: ["body", "password"],
          msg: "Mật khẩu phải có ít nhất 1 chữ số.",
          type: "value_error",
        },
      ],
    }),
  });

  await assert.rejects(
    request("/auth/register", { method: "POST" }),
    /Mật khẩu phải có ít nhất 1 chữ số/,
  );

  globalThis.fetch = originalFetch;
});

test("API helper functions format correct query parameters and paths", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, opts) => {
    calls.push({ url, method: opts.method, body: opts.body });
    return {
      ok: true,
      status: 200,
      json: async () => ({ status_code: 200, data: {} }),
    };
  };

  await fetchEdgeById("edge-123");
  assert.ok(calls[0].url.includes("/edges/edge-123"));

  await fetchEdgeHistory("edge-123", { start: "2026-11-20T00:00:00", end: "2026-11-23T00:00:00" });
  assert.ok(calls[1].url.includes("/edges/edge-123/history?start=2026-11-20T00%3A00%3A00&end=2026-11-23T00%3A00%3A00"));

  await fetchDirections({ origin_node_id: "node-1", destination_node_id: "node-2", weight_mode: "duration" });
  assert.ok(calls[2].url.includes("/directions?origin_node_id=node-1&destination_node_id=node-2&weight_mode=duration&speed_source=current"));

  await fetchRouteAlternatives({ origin_node_id: "node-1", destination_node_id: "node-2" });
  assert.ok(calls[3].url.includes("/directions/alternatives?origin_node_id=node-1&destination_node_id=node-2&speed_source=current"));

  await searchGeocode({ q: "Cầu Giấy", limit: 5 });
  assert.ok(calls[4].url.includes("/geocode/search?q=C%E1%BA%A7u+Gi%E1%BA%A5y&limit=5"));

  await reverseGeocode({ lat: 21.03, lon: 105.8 });
  assert.ok(calls[5].url.includes("/geocode/reverse?lat=21.03&lon=105.8&zoom=18"));

  await fetchAdminUsers("alice");
  assert.ok(calls[6].url.includes("/admin/users?query=alice"));

  await deleteAdminUser("user-999");
  assert.equal(calls[7].method, "DELETE");
  assert.ok(calls[7].url.includes("/admin/users/user-999"));

  await deleteAdminRoad("road-888");
  assert.equal(calls[8].method, "DELETE");
  assert.ok(calls[8].url.includes("/admin/roads/road-888"));

  await triggerRetrainModel();
  assert.equal(calls[9].method, "POST");
  assert.ok(calls[9].url.includes("/admin/retrain-model"));

  globalThis.fetch = originalFetch;
});
