import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  processChatMessage,
  getQuickPillSuggestions,
  getInitialGreeting,
} from "../src/js/services/chatService.js";

const mockEdges = [
  {
    street_name: "Đường Nguyễn Trãi",
    speed: 12.5,
    congestion_level: 4,
    length: 3.2,
  },
  {
    street_name: "Đường Cầu Giấy",
    speed: 18.0,
    congestion_level: 3,
    length: 2.5,
  },
  {
    street_name: "Đường Kim Mã",
    speed: 28.0,
    congestion_level: 2,
    length: 1.8,
  },
  {
    street_name: "Đường Hoàng Quốc Việt",
    speed: 42.0,
    congestion_level: 1,
    length: 2.9,
  },
];

describe("Traffic AI Intelligence Service", () => {
  test("getInitialGreeting trả về lời chào khởi tạo chuẩn cấu trúc", () => {
    const greeting = getInitialGreeting();
    assert.equal(greeting.role, "model");
    assert.ok(typeof greeting.content === "string");
    assert.ok(greeting.content.includes("Hà Nội Traffic AI"));
    assert.ok(greeting.timestamp);
    assert.ok(Array.isArray(greeting.actions));
  });

  test("getQuickPillSuggestions trả về danh sách câu hỏi gợi ý", () => {
    const pills = getQuickPillSuggestions();
    assert.ok(Array.isArray(pills));
    assert.ok(pills.length >= 3);
    assert.ok(pills.some((p) => p.includes("tắc") || p.includes("kẹt")));
  });

  test("processChatMessage xử lý câu hỏi về tắc đường / điểm nóng", async () => {
    const res = await processChatMessage("Tuyến đường nào đang tắc nhất hiện nay?", mockEdges);
    assert.equal(res.role, "model");
    assert.ok(res.content.includes("Nguyễn Trãi"));
    assert.ok(res.content.includes("Cầu Giấy"));
    assert.ok(Array.isArray(res.actions));
    assert.ok(res.actions.some((a) => a.path === "/map"));
  });

  test("processChatMessage xử lý câu hỏi về giờ cao điểm", async () => {
    const res = await processChatMessage("Khung giờ cao điểm ở Hà Nội là lúc nào?", mockEdges);
    assert.equal(res.role, "model");
    assert.ok(res.content.includes("07:00") || res.content.includes("7h"));
    assert.ok(res.content.includes("17:00") || res.content.includes("16:30"));
  });

  test("processChatMessage tính toán và thông báo vận tốc trung bình", async () => {
    const res = await processChatMessage("Vận tốc trung bình của toàn mạng lưới là bao nhiêu?", mockEdges);
    assert.equal(res.role, "model");
    assert.ok(res.content.includes("km/h"));
  });

  test("processChatMessage đưa ra tư vấn tuyến đường cụ thể", async () => {
    const res = await processChatMessage("Tôi muốn đi qua đường Nguyễn Trãi thì cần lưu ý gì?", mockEdges);
    assert.equal(res.role, "model");
    assert.ok(res.content.toLowerCase().includes("nguyễn trãi"));
  });

  test("processChatMessage routes an origin-to-destination question to the map planner", async () => {
    const res = await processChatMessage(
      "Tìm đường đi tối ưu từ Láng qua Nguyễn Trãi Hà Đông",
      mockEdges,
    );
    const action = res.actions.find((item) => item.text === "Tính lộ trình trên bản đồ");
    const routeUrl = new URL(action.path, "https://traffic.test");

    assert.ok(res.content.includes("Láng"));
    assert.ok(res.content.includes("Nguyễn Trãi Hà Đông"));
    assert.equal(routeUrl.pathname, "/map");
    assert.equal(routeUrl.searchParams.get("origin"), "Láng");
    assert.equal(routeUrl.searchParams.get("destination"), "Nguyễn Trãi Hà Đông");
    assert.equal(routeUrl.searchParams.get("chat_route"), "1");
  });

  test("processChatMessage asks for both places when a route request has no endpoints", async () => {
    const res = await processChatMessage("Tìm đường tối ưu giúp tôi", mockEdges);

    assert.ok(res.content.includes("điểm đi"));
    assert.ok(res.actions.some((item) => item.path === "/map"));
  });

  test("processChatMessage phản hồi thân thiện và hữu ích khi gặp câu hỏi chưa nhận diện", async () => {
    const res = await processChatMessage("Thời tiết ngày mai thế nào?", mockEdges);
    assert.equal(res.role, "model");
    assert.ok(res.content.length > 20);
    assert.ok(Array.isArray(res.actions));
  });
});
