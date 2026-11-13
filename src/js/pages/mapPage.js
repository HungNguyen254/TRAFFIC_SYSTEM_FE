// File: src/js/pages/mapPage.js
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Chart from "chart.js/auto";
import { renderHeader } from "../components/header.js";
import { renderFooter } from "../components/footer.js";
import { renderMapView } from "../views/mapView.js";

let activeMap = null;
let activeChart = null;
let isDestroyed = false;

function initMapPage() {

  // ============================================================
  // 1. Mapping congestion_level (1..4) <-> màu / nhãn / tốc độ
  //    Khớp TrafficRecords.congestion_level + color_code trong ERD
  // ============================================================
  const CONGESTION_LEVELS = {
    1: { key: "green", color: "#22c55e", label: "Thông thoáng", speed: 45 }, // > 30 km/h
    2: { key: "yellow", color: "#eab308", label: "Di chuyển chậm", speed: 22 }, // 15-30 km/h
    3: {
      key: "red",
      color: "#ef4444",
      label: "Ùn tắc nghiêm trọng",
      speed: 11,
    }, // 5-15 km/h
    4: {
      key: "darkred",
      color: "#991b1b",
      label: "Kẹt xe hoàn toàn",
      speed: 4,
    }, // < 5 km/h
  };
  const NO_DATA_COLOR = "#94a3b8";

  // ============================================================
  // 2. Cấu hình API - đọc toàn bộ từ .env (biến có prefix VITE_)
  //    KHÔNG hardcode bất kỳ URL nào ở đây để tránh lộ cấu hình.
  // ============================================================
  const ENV = import.meta.env;

  function requireEnv(name) {
    const value = ENV[name];
    if (!value) {
      throw new Error(
        `Thiếu cấu hình ${name} trong file .env của FE. ` +
        `Hãy copy .env.example thành .env và điền giá trị.`,
      );
    }
    return value;
  }

  const API_BASE_URL = requireEnv("VITE_API_BASE_URL");
  const ROUTING_BASE_URL = requireEnv("VITE_ROUTING_URL");
  const TILE_URL = requireEnv("VITE_TILE_URL");
  const TILE_ATTRIBUTION = ENV.VITE_TILE_ATTRIBUTION || "";
  const GEOCODER_URL = requireEnv("VITE_GEOCODER_URL");
  const SEARCH_VIEWBOX = requireEnv("VITE_SEARCH_VIEWBOX");

  /**
   * Lớp Client gọi API theo ERD.
   * Mọi hàm đều trả về shape chuẩn, mock ở dưới cùng làm fallback offline.
   */
  const ApiClient = {
    /**
     * GET /edges (kèm traffic record mới nhất của từng edge)
     * Trả về: [{ edge_code, street_name, corridor_name, max_speed_limit,
     *            from: {node_code, node_name, lat, lng},
     *            to:   {node_code, node_name, lat, lng},
     *            congestion_level, color_code, speed }]
     */
    async fetchEdges() {
      try {
        const res = await fetch(`${API_BASE_URL}/edges`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const envelope = await res.json();
        // Backend trả envelope chuẩn {status_code, message, data} -> bóc data
        const data = envelope?.data ?? envelope;
        return normalizeEdges(data);
      } catch (err) {
        console.warn(
          "API /edges không khả dụng, dùng dữ liệu mock:",
          err.message,
        );
        return normalizeEdges(MOCK_EDGES);
      }
    },
  };

  function parseSpeedKmh(value) {
    const speed =
      typeof value === "number"
        ? value
        : Number.parseFloat(String(value ?? "").replace(",", "."));
    return Number.isFinite(speed) && speed > 0 ? speed : null;
  }

  // Ngưỡng khớp 100% với dataset CSV (_speed_to_congestion_level bên BE)
  function trafficLevelFromSpeed(speedKmh) {
    if (speedKmh === null) return null;
    if (speedKmh >= 35) return 1;
    if (speedKmh >= 25) return 2;
    if (speedKmh >= 15) return 3;
    return 4;
  }

  /**
   * Chuẩn hóa dữ liệu edge từ API về shape nội bộ của map.
   * Chấp nhận cả 2 dạng: edge lồng sẵn from/to, hoặc from_node_id/to_node_id
   * kèm danh sách nodes riêng.
   */
  function normalizeEdges(raw) {
    const nodesById = {};
    if (Array.isArray(raw.nodes)) {
      raw.nodes.forEach((n) => {
        nodesById[n.id ?? n.node_code] = n;
      });
    }
    const list = Array.isArray(raw.edges) ? raw.edges : raw;

    return list.map((e) => {
      const from = e.from || nodesById[e.from_node_id] || e.from_node || {};
      const to = e.to || nodesById[e.to_node_id] || e.to_node || {};
      const rec = e.latest_traffic || e.traffic_record || {};
      const speed =
        rec.speed ??
        rec.current_speed ??
        rec.speed_kmh ??
        rec.predicted_speed ??
        e.speed ??
        e.current_speed ??
        e.speed_kmh ??
        e.predicted_speed ??
        null;
      const speedKmh = parseSpeedKmh(speed);
      const declaredLevel = Number(rec.congestion_level ?? e.congestion_level);
      // Ưu tiên congestion_level do BE tính từ CSV; tốc độ chỉ dùng khi thiếu level
      const level = CONGESTION_LEVELS[declaredLevel]
        ? declaredLevel
        : trafficLevelFromSpeed(speedKmh);
      return {
        edge_code: e.edge_code || e.id,
        street_name: e.street_name || e.name || "",
        corridor_name: e.corridor_name || e.street_name || e.name || "",
        max_speed_limit: e.max_speed_limit || null,
        from: {
          node_code: from.node_code,
          node_name: from.node_name,
          lat: from.lat,
          lng: from.lng,
        },
        to: {
          node_code: to.node_code,
          node_name: to.node_name,
          lat: to.lat,
          lng: to.lng,
        },
        congestion_level: level,
        color_code: level ? CONGESTION_LEVELS[level].color : NO_DATA_COLOR,
        speed,
      };
    });
  }

  // ============================================================
  // 3. MOCK DATA (fallback) - dạng EDGE khớp ERD
  //    corridor_name = trục đường (như "tuyến" trước đây)
  //    1 edge = 1 cung giữa 2 node; corridor được nhóm từ nhiều edge
  // ============================================================
  function node(code, name, lat, lng) {
    return { node_code: code, node_name: name, lat, lng };
  }

  // Các Node theo ERD (nút giao trọng điểm Hà Nội)
  const MOCK_NODES = [
    node("N01", "Nút giao Khuất Duy Tiến - Nguyễn Trãi", 20.9942, 105.8075),
    node("N02", "Nguyễn Trãi (Vũ Trọng Phụng)", 20.9961, 105.8101),
    node("N03", "Nguyễn Trãi (Thượng Đình)", 20.9978, 105.8124),
    node("N04", "Nút giao Ngã Tư Sở", 20.9997, 105.8148),
    node("N05", "Tây Sơn (ĐH Thủy Lợi)", 21.0028, 105.8183),
    node("N06", "Tây Sơn (Chùa Bộc)", 21.0062, 105.8217),
    node("N07", "Tây Sơn (Ngã tư Thái Hà)", 21.009, 105.8235),
    node("N08", "Ngã sáu Ô Chợ Dừa", 21.0135, 105.827),
    node("N09", "Tôn Đức Thắng", 21.018, 105.83),
    node("N10", "Nút giao Cầu Giấy - Láng", 21.033, 105.801),
    node("N11", "Láng (Chùa Láng)", 21.0285, 105.8032),
    node("N12", "Láng (Nguyễn Chí Thanh)", 21.022, 105.8055),
    node("N13", "Láng (Lê Văn Lương)", 21.0175, 105.808),
    node("N14", "Láng (Yên Lãng)", 21.0095, 105.8115),
    node("N15", "Bến xe Mỹ Đình", 21.0282, 105.7818),
    node("N16", "Phạm Hùng (Mễ Trì)", 21.023, 105.784),
    node("N17", "Keangnam / Landmark 72", 21.0165, 105.7878),
    node("N18", "Nút giao Trần Duy Hưng", 21.0085, 105.7945),
    node("N19", "Khuất Duy Tiến (Lê Văn Lương)", 21.0015, 105.801),
    node("N20", "Nguyễn Xiển (ĐH Thăng Long)", 20.988, 105.813),
    node("N21", "Nút giao Linh Đàm", 20.98, 105.8205),
    node("N22", "Trường Chinh (Tôn Thất Tùng)", 21.0012, 105.821),
    node("N23", "Trường Chinh (Lê Trọng Tấn)", 21.0028, 105.8285),
    node("N24", "Ngã tư Vọng (Giải Phóng)", 21.0035, 105.834),
    node("N25", "Đại La", 21.002, 105.84),
    node("N26", "Minh Khai (Chân cầu Vĩnh Tuy)", 21.0008, 105.8475),
    node("N27", "Cầu Vĩnh Tuy", 21.0, 105.862),
    node("N28", "Cầu vượt TDH - Nguyễn Chí Thanh", 21.015, 105.8),
    node("N29", "Nguyễn Chí Thanh (Huỳnh Thúc Kháng)", 21.022, 105.8055),
    node("N30", "Nguyễn Chí Thanh (ĐH Luật)", 21.026, 105.811),
    node("N31", "Liễu Giai (Lotte Center)", 21.0312, 105.818),
    node("N32", "Tố Hữu (Vạn Phúc - Hà Đông)", 20.981, 105.76),
    node("N33", "Tố Hữu (Trung Văn)", 20.99, 105.777),
    node("N34", "Lê Văn Lương (Hoàng Đạo Thúy)", 21.005, 105.8045),
    node("N35", "Xã Đàn (Phạm Ngọc Thạch)", 21.012, 105.834),
    node("N36", "Hầm chui Kim Liên", 21.011, 105.84),
    node("N37", "Đại Cồ Việt (Tạ Quang Bửu)", 21.0105, 105.846),
    node("N38", "Trần Khát Chân (Phố Huế)", 21.01, 105.855),
    node("N39", "Trần Khát Chân (Nguyễn Khoái)", 21.009, 105.863),
    node("N40", "Bến xe Nước Ngầm", 20.975, 105.8435),
    node("N41", "Bến xe Giáp Bát", 20.985, 105.843),
    node("N42", "Ga Hà Nội (Lê Duẩn)", 21.0225, 105.841),
    node("N43", "Chợ Bưởi", 21.05, 105.805),
    node("N44", "Võ Chí Công (Hoàng Quốc Việt)", 21.059, 105.808),
    node("N45", "Võ Chí Công (Xuân La)", 21.068, 105.8105),
    node("N46", "Võ Chí Công (Cầu Gương)", 21.079, 105.814),
    node("N47", "Cầu Nhật Tân", 21.092, 105.818),
    node("N48", "Ngã tư Xuân Thủy - Phạm Văn Đồng", 21.036, 105.782),
    node("N49", "Phạm Văn Đồng (Hoàng Quốc Việt)", 21.048, 105.7825),
    node("N50", "Cổ Nhuế", 21.062, 105.783),
    node("N51", "Công viên Hòa Bình", 21.078, 105.786),
    node("N52", "Cầu Thăng Long", 21.098, 105.789),
    node("N53", "Đường Cầu Giấy", 21.036, 105.79),
    node("N54", "Cầu Giấy (Trần Thái Tông)", 21.0345, 105.796),
    node("N55", "Kim Mã (Đền Voi Phục)", 21.0322, 105.81),
    node("N56", "Kim Mã (Giảng Võ)", 21.03, 105.826),
    node("N57", "Nguyễn Thái Học", 21.029, 105.832),
    node("N58", "Thái Hà", 21.008, 105.828),
    node("N59", "Huỳnh Thúc Kháng", 21.015, 105.818),
  ];

  const N = Object.fromEntries(MOCK_NODES.map((n) => [n.node_code, n]));

  /**
   * Tạo 1 edge: edge_code, street_name, corridor_name, from, to,
   * max_speed_limit, congestion_level (khớp TrafficRecords)
   */
  function edge(
    code,
    street,
    corridor,
    fromCode,
    toCode,
    maxSpeed,
    level,
    speed,
  ) {
    return {
      edge_code: code,
      street_name: street,
      corridor_name: corridor,
      max_speed_limit: maxSpeed,
      from: N[fromCode],
      to: N[toCode],
      congestion_level: level,
      color_code: CONGESTION_LEVELS[level].color,
      speed: speed ? `${speed} km/h` : null,
    };
  }

  const MOCK_EDGES = [
    // ---- R01: Trục Nguyễn Trãi - Ngã Tư Sở - Tây Sơn ----
    edge(
      "E0101",
      "Nguyễn Trãi",
      "Nguyễn Trãi - Tây Sơn",
      "N01",
      "N02",
      50,
      4,
      4,
    ),
    edge(
      "E0102",
      "Nguyễn Trãi",
      "Nguyễn Trãi - Tây Sơn",
      "N02",
      "N03",
      50,
      4,
      4,
    ),
    edge(
      "E0103",
      "Nguyễn Trãi",
      "Nguyễn Trãi - Tây Sơn",
      "N03",
      "N04",
      50,
      3,
      10,
    ),
    edge("E0104", "Tây Sơn", "Nguyễn Trãi - Tây Sơn", "N04", "N05", 50, 3, 12),
    edge("E0105", "Tây Sơn", "Nguyễn Trãi - Tây Sơn", "N05", "N06", 50, 2, 20),
    edge("E0106", "Tây Sơn", "Nguyễn Trãi - Tây Sơn", "N06", "N07", 50, 2, 22),
    edge("E0107", "Tây Sơn", "Nguyễn Trãi - Tây Sơn", "N07", "N08", 50, 1, 38),
    edge(
      "E0108",
      "Tôn Đức Thắng",
      "Nguyễn Trãi - Tây Sơn",
      "N08",
      "N09",
      50,
      1,
      40,
    ),
    // ---- R02: Đường Láng ----
    edge("E0201", "Đường Láng", "Đường Láng", "N10", "N11", 60, 3, 12),
    edge("E0202", "Đường Láng", "Đường Láng", "N11", "N12", 60, 3, 10),
    edge("E0203", "Đường Láng", "Đường Láng", "N12", "N13", 60, 2, 18),
    edge("E0204", "Đường Láng", "Đường Láng", "N13", "N14", 60, 2, 20),
    edge("E0205", "Đường Láng", "Đường Láng", "N14", "N04", 60, 1, 35),
    // ---- R03: Vành Đai 3 ----
    edge("E0301", "Phạm Hùng", "Vành Đai 3", "N15", "N16", 80, 1, 55),
    edge("E0302", "Phạm Hùng", "Vành Đai 3", "N16", "N17", 80, 1, 50),
    edge("E0303", "Phạm Hùng", "Vành Đai 3", "N17", "N18", 80, 3, 12),
    edge("E0304", "Khuất Duy Tiến", "Vành Đai 3", "N18", "N19", 80, 4, 3),
    edge("E0305", "Khuất Duy Tiến", "Vành Đai 3", "N19", "N01", 80, 4, 3),
    edge("E0306", "Nguyễn Xiển", "Vành Đai 3", "N01", "N20", 80, 2, 20),
    edge("E0307", "Nguyễn Xiển", "Vành Đai 3", "N20", "N21", 80, 1, 45),
    // ---- R04: Trường Chinh - Đại La - Minh Khai ----
    edge(
      "E0401",
      "Trường Chinh",
      "Trường Chinh - Minh Khai",
      "N04",
      "N22",
      60,
      2,
      20,
    ),
    edge(
      "E0402",
      "Trường Chinh",
      "Trường Chinh - Minh Khai",
      "N22",
      "N23",
      60,
      3,
      12,
    ),
    edge(
      "E0403",
      "Trường Chinh",
      "Trường Chinh - Minh Khai",
      "N23",
      "N24",
      60,
      3,
      10,
    ),
    edge(
      "E0404",
      "Đại La",
      "Trường Chinh - Minh Khai",
      "N24",
      "N25",
      60,
      2,
      18,
    ),
    edge(
      "E0405",
      "Minh Khai",
      "Trường Chinh - Minh Khai",
      "N25",
      "N26",
      60,
      1,
      40,
    ),
    edge(
      "E0406",
      "Minh Khai",
      "Trường Chinh - Minh Khai",
      "N26",
      "N27",
      60,
      1,
      42,
    ),
    // ---- R05: Trần Duy Hưng - Nguyễn Chí Thanh ----
    edge(
      "E0501",
      "Trần Duy Hưng",
      "Trần Duy Hưng - Liễu Giai",
      "N18",
      "N28",
      60,
      1,
      42,
    ),
    edge(
      "E0502",
      "Nguyễn Chí Thanh",
      "Trần Duy Hưng - Liễu Giai",
      "N28",
      "N29",
      60,
      2,
      22,
    ),
    edge(
      "E0503",
      "Nguyễn Chí Thanh",
      "Trần Duy Hưng - Liễu Giai",
      "N29",
      "N30",
      60,
      3,
      10,
    ),
    edge(
      "E0504",
      "Liễu Giai",
      "Trần Duy Hưng - Liễu Giai",
      "N30",
      "N31",
      60,
      2,
      24,
    ),
    // ---- R06: Lê Văn Lương - Tố Hữu ----
    edge("E0601", "Tố Hữu", "Lê Văn Lương - Tố Hữu", "N32", "N33", 60, 4, 4),
    edge("E0602", "Tố Hữu", "Lê Văn Lương - Tố Hữu", "N33", "N19", 60, 4, 4),
    edge(
      "E0603",
      "Lê Văn Lương",
      "Lê Văn Lương - Tố Hữu",
      "N19",
      "N34",
      60,
      3,
      12,
    ),
    edge(
      "E0604",
      "Lê Văn Lương",
      "Lê Văn Lương - Tố Hữu",
      "N34",
      "N13",
      60,
      1,
      45,
    ),
    // ---- R07: Vành Đai 1 (Xã Đàn - Trần Khát Chân) ----
    edge("E0701", "Xã Đàn", "Vành Đai 1", "N08", "N35", 60, 2, 20),
    edge("E0702", "Xã Đàn", "Vành Đai 1", "N35", "N36", 60, 1, 40),
    edge("E0703", "Đại Cồ Việt", "Vành Đai 1", "N36", "N37", 60, 1, 42),
    edge("E0704", "Trần Khát Chân", "Vành Đai 1", "N37", "N38", 60, 2, 20),
    edge("E0705", "Trần Khát Chân", "Vành Đai 1", "N38", "N39", 60, 2, 22),
    // ---- R08: Giải Phóng - Lê Duẩn ----
    edge(
      "E0801",
      "Giải Phóng",
      "Giải Phóng - Lê Duẩn",
      "N40",
      "N41",
      70,
      2,
      20,
    ),
    edge(
      "E0802",
      "Giải Phóng",
      "Giải Phóng - Lê Duẩn",
      "N41",
      "N24",
      70,
      2,
      24,
    ),
    edge(
      "E0803",
      "Giải Phóng",
      "Giải Phóng - Lê Duẩn",
      "N24",
      "N36",
      70,
      1,
      45,
    ),
    edge("E0804", "Lê Duẩn", "Giải Phóng - Lê Duẩn", "N36", "N42", 70, 1, 48),
    // ---- R09: Võ Chí Công - Cầu Nhật Tân ----
    edge(
      "E0901",
      "Võ Chí Công",
      "Võ Chí Công - Nhật Tân",
      "N43",
      "N44",
      80,
      1,
      55,
    ),
    edge(
      "E0902",
      "Võ Chí Công",
      "Võ Chí Công - Nhật Tân",
      "N44",
      "N45",
      80,
      1,
      55,
    ),
    edge(
      "E0903",
      "Võ Chí Công",
      "Võ Chí Công - Nhật Tân",
      "N45",
      "N46",
      80,
      1,
      55,
    ),
    edge(
      "E0904",
      "Võ Chí Công",
      "Võ Chí Công - Nhật Tân",
      "N46",
      "N47",
      80,
      1,
      55,
    ),
    // ---- R10: Phạm Văn Đồng ----
    edge(
      "E1001",
      "Phạm Văn Đồng",
      "Phạm Văn Đồng - Cầu Thăng Long",
      "N48",
      "N49",
      70,
      1,
      48,
    ),
    edge(
      "E1002",
      "Phạm Văn Đồng",
      "Phạm Văn Đồng - Cầu Thăng Long",
      "N49",
      "N50",
      70,
      1,
      48,
    ),
    edge(
      "E1003",
      "Phạm Văn Đồng",
      "Phạm Văn Đồng - Cầu Thăng Long",
      "N50",
      "N51",
      70,
      1,
      48,
    ),
    edge(
      "E1004",
      "Phạm Văn Đồng",
      "Phạm Văn Đồng - Cầu Thăng Long",
      "N51",
      "N52",
      70,
      1,
      48,
    ),
    // ---- R11: Cầu Giấy - Kim Mã ----
    edge("E1101", "Cầu Giấy", "Cầu Giấy - Kim Mã", "N53", "N54", 60, 3, 10),
    edge("E1102", "Cầu Giấy", "Cầu Giấy - Kim Mã", "N54", "N10", 60, 3, 12),
    edge("E1103", "Kim Mã", "Cầu Giấy - Kim Mã", "N10", "N55", 60, 3, 12),
    edge("E1104", "Kim Mã", "Cầu Giấy - Kim Mã", "N55", "N31", 60, 2, 20),
    edge("E1105", "Kim Mã", "Cầu Giấy - Kim Mã", "N31", "N56", 60, 2, 22),
    edge(
      "E1106",
      "Nguyễn Thái Học",
      "Cầu Giấy - Kim Mã",
      "N56",
      "N57",
      60,
      1,
      35,
    ),
    // ---- R12: Chùa Bộc - Thái Hà ----
    edge("E1201", "Chùa Bộc", "Chùa Bộc - Thái Hà", "N06", "N58", 50, 3, 10),
    edge("E1202", "Thái Hà", "Chùa Bộc - Thái Hà", "N58", "N07", 50, 1, 38),
    edge("E1203", "Thái Hà", "Chùa Bộc - Thái Hà", "N07", "N59", 50, 2, 20),
    edge(
      "E1204",
      "Huỳnh Thúc Kháng",
      "Chùa Bộc - Thái Hà",
      "N59",
      "N29",
      50,
      3,
      10,
    ),
  ];

  // ============================================================
  // 4. DOM Elements & khởi tạo map
  // ============================================================
  const statusOverlay = document.getElementById("status-overlay");
  const roadSearchForm = document.getElementById("road-search");
  const roadQueryInput = document.getElementById("road-query");
  const searchResultsUl = document.getElementById("search-results");
  const detailDiv = document.getElementById("detail");
  const routeForm = document.getElementById("route-form");
  const routeOriginInput = document.getElementById("route-origin");
  const routeDestinationInput = document.getElementById("route-destination");
  const routeVehicleSelect = document.getElementById("route-vehicle");
  const routeSubmitButton = document.getElementById("route-submit");
  const routeCancelButton = document.getElementById("route-cancel");
  const routeStatus = document.getElementById("route-status");
  const routeSummary = document.getElementById("route-summary");
  const routeDistance = document.getElementById("route-distance");
  const routeDuration = document.getElementById("route-duration");

  const map = L.map("map-canvas").setView([21.018, 105.815], 13);
  activeMap = map;
  map.createPane("routePane");
  map.getPane("routePane").style.zIndex = "650";
  map.createPane("routeMarkerPane");
  map.getPane("routeMarkerPane").style.zIndex = "660";

  const tileLayer = L.tileLayer(TILE_URL, {
    maxZoom: 19,
    attribution: TILE_ATTRIBUTION,
  });
  tileLayer.addTo(map);

  tileLayer.on("load", () => {
    if (statusOverlay) statusOverlay.style.display = "none";
  });

  let activeRoute = null;
  let activeRouteEstimate = null;
  let routeActive = false;
  let routeRequestId = 0;
  let lastGeocodeRequestAt = 0;
  const geocodeCache = new Map();

  function setRouteStatus(message, isError = false) {
    if (!routeStatus) return;
    routeStatus.textContent = message;
    routeStatus.classList.toggle("error", isError);
  }

  async function fetchWithTimeout(url, timeoutMs = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function geocodeAddress(query) {
    const cacheKey = query.trim().toLocaleLowerCase("vi");
    if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);

    const delay = Math.max(0, 1000 - (Date.now() - lastGeocodeRequestAt));
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));

    const geocoderUrl = GEOCODER_URL;
    const params = new URLSearchParams({
      format: "jsonv2",
      limit: "1",
      countrycodes: "vn",
      bounded: "1",
      viewbox: SEARCH_VIEWBOX,
      q: `${query}, Hà Nội, Việt Nam`,
    });
    const response = await fetchWithTimeout(`${geocoderUrl}?${params}`);
    lastGeocodeRequestAt = Date.now();
    if (!response.ok)
      throw new Error(`Dịch vụ tìm địa điểm trả về HTTP ${response.status}.`);

    const results = await response.json();
    if (!results.length)
      throw new Error(`Không tìm thấy địa điểm "${query}" tại Hà Nội.`);

    const location = {
      lat: Number(results[0].lat),
      lng: Number(results[0].lon),
    };
    geocodeCache.set(cacheKey, location);
    return location;
  }

  function formatDuration(seconds) {
    const totalMinutes = Math.max(1, Math.round(seconds / 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours ? `${hours} giờ ${minutes} phút` : `${minutes} phút`;
  }

  const VEHICLE_SPEED_PROFILES = {
    car: { speedFactor: 1, maxSpeedKmh: 60, fallbackSpeedKmh: 30 },
    motorcycle: { speedFactor: 1.1, maxSpeedKmh: 50, fallbackSpeedKmh: 33 },
    bicycle: { speedFactor: 0.55, maxSpeedKmh: 18, fallbackSpeedKmh: 16 },
    bus: { speedFactor: 0.85, maxSpeedKmh: 40, fallbackSpeedKmh: 26 },
  };

  function estimateRouteDuration(routeSegments, vehicleType) {
    const profile =
      VEHICLE_SPEED_PROFILES[vehicleType] || VEHICLE_SPEED_PROFILES.car;
    return routeSegments.reduce((totalSeconds, segment) => {
      const currentSpeedKmh =
        segment.speedKmh ||
        CONGESTION_LEVELS[segment.level]?.speed ||
        profile.fallbackSpeedKmh;
      const speedKmh = Math.min(
        currentSpeedKmh * profile.speedFactor,
        profile.maxSpeedKmh,
      );
      return totalSeconds + segment.distanceMeters / ((speedKmh * 1000) / 3600);
    }, 0);
  }

  function updateRouteDuration() {
    if (!activeRouteEstimate || !routeDuration) return;
    const vehicleType = routeVehicleSelect?.value || "car";
    routeDuration.textContent = formatDuration(
      estimateRouteDuration(activeRouteEstimate.segments, vehicleType),
    );
  }

  if (
    routeForm &&
    routeOriginInput &&
    routeDestinationInput &&
    routeSubmitButton
  ) {
    routeForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const originName = routeOriginInput.value.trim();
      const destinationName = routeDestinationInput.value.trim();
      if (!originName || !destinationName) return;

      const requestId = ++routeRequestId;
      if (routeCancelButton) routeCancelButton.hidden = false;
      routeSubmitButton.disabled = true;
      routeSubmitButton.textContent = "Đang tìm tuyến...";
      setRouteStatus(
        "Đang xác định hai địa điểm..." +
        (routeActive
          ? " Tuyến hiện tại vẫn được giữ đến khi tìm xong tuyến mới."
          : ""),
      );

      try {
        const origin = await geocodeAddress(originName);
        const destination = await geocodeAddress(destinationName);
        if (requestId !== routeRequestId) return;
        const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
        const routeUrl = `${ROUTING_BASE_URL}/${coordinates}?overview=full&geometries=geojson&steps=false`;
        const response = await fetchWithTimeout(routeUrl);
        if (!response.ok)
          throw new Error(`Dịch vụ tìm đường trả về HTTP ${response.status}.`);

        const result = await response.json();
        const route = result.code === "Ok" ? result.routes?.[0] : null;
        if (
          !route ||
          !Array.isArray(route.geometry?.coordinates) ||
          route.geometry.coordinates.length < 2 ||
          !Number.isFinite(route.distance) ||
          !Number.isFinite(route.duration)
        ) {
          throw new Error("Không tìm được tuyến đường ô tô giữa hai địa điểm.");
        }
        if (requestId !== routeRequestId) return;

        const routePoints = route.geometry.coordinates.map(([lng, lat]) => [
          lat,
          lng,
        ]);
        const trafficSegments = buildTrafficColoredRoute(
          routePoints,
          route.distance,
        );
        const routeLines = L.featureGroup(
          trafficSegments.map((segment) =>
            createRouteSegment(segment.points, segment.level),
          ),
        );
        const startMarker = L.circleMarker([origin.lat, origin.lng], {
          pane: "routeMarkerPane",
          radius: 8,
          color: "#ffffff",
          weight: 3,
          fillColor: "#16a34a",
          fillOpacity: 1,
        });
        const endMarker = L.circleMarker([destination.lat, destination.lng], {
          pane: "routeMarkerPane",
          radius: 8,
          color: "#ffffff",
          weight: 3,
          fillColor: "#dc2626",
          fillOpacity: 1,
        });
        const nextRoute = L.featureGroup([
          routeLines,
          startMarker,
          endMarker,
        ]).addTo(map);
        if (activeRoute) map.removeLayer(activeRoute);
        activeRoute = nextRoute;
        activeRouteEstimate = { segments: trafficSegments };
        routeActive = true;
        setBaseRoadsDimmed(true);
        if (routeCancelButton) routeCancelButton.hidden = false;

        map.fitBounds(routeLines.getBounds(), {
          padding: [48, 48],
          maxZoom: 16,
        });
        if (routeDistance)
          routeDistance.textContent = `${fmt(route.distance / 1000, 2)} km`;
        updateRouteDuration();
        if (routeSummary) routeSummary.hidden = false;
        if (detailDiv) detailDiv.hidden = true;
        setRouteStatus(`${originName} → ${destinationName}`);
      } catch (error) {
        if (requestId !== routeRequestId) return;
        const message =
          error instanceof Error && error.name === "AbortError"
            ? "Dịch vụ tìm địa điểm hoặc tuyến đường hết thời gian chờ. Vui lòng thử lại."
            : error instanceof Error
              ? error.message
              : "Không thể tìm tuyến đường.";
        setRouteStatus(message, true);
        if (!routeActive && routeCancelButton) routeCancelButton.hidden = true;
      } finally {
        if (requestId === routeRequestId) {
          routeSubmitButton.disabled = false;
          routeSubmitButton.textContent = "Vẽ tuyến đường";
        }
      }
    });

    document.getElementById("route-swap")?.addEventListener("click", () => {
      const origin = routeOriginInput.value;
      routeOriginInput.value = routeDestinationInput.value;
      routeDestinationInput.value = origin;
      routeOriginInput.focus();
    });

    routeVehicleSelect?.addEventListener("change", updateRouteDuration);

    routeCancelButton?.addEventListener("click", () => {
      routeRequestId += 1;
      if (activeRoute) {
        map.removeLayer(activeRoute);
        activeRoute = null;
      }
      activeRouteEstimate = null;
      routeActive = false;
      setBaseRoadsDimmed(false);
      routeSubmitButton.disabled = false;
      routeSubmitButton.textContent = "Vẽ tuyến đường";
      if (routeCancelButton) routeCancelButton.hidden = true;
      if (routeSummary) routeSummary.hidden = true;
      if (detailDiv) detailDiv.hidden = true;
      setRouteStatus("Đã hủy tuyến. Bản đồ đã trở lại chế độ xem bình thường.");
    });
  }

  function createRouteSegment(points, trafficLevel) {
    const color =
      trafficLevel && CONGESTION_LEVELS[trafficLevel]
        ? CONGESTION_LEVELS[trafficLevel].color
        : "#64748b";
    return L.polyline(points, {
      pane: "routePane",
      color,
      weight: 8,
      opacity: 1,
      lineCap: "round",
      lineJoin: "round",
      interactive: false,
    });
  }

  // ============================================================
  // 5. Nhóm edge theo corridor (giống "tuyến" trên UI)
  //    -> groupEdges[corridor_name] = [edge, edge, ...]
  // ============================================================
  function groupByCorridor(edges) {
    const groups = new Map();
    edges.forEach((e) => {
      const key = e.corridor_name || e.street_name;
      if (!groups.has(key)) {
        groups.set(key, {
          corridor_name: key,
          edges: [],
        });
      }
      groups.get(key).edges.push(e);
    });
    // Sắp edge trong corridor theo thứ tự nối (from -> to cạnh nhau)
    groups.forEach((g) => {
      g.edges.sort((a, b) => {
        const idxA = a.from ? a.from.lat + a.from.lng : 0;
        const idxB = b.from ? b.from.lat + b.from.lng : 0;
        return idxA - idxB;
      });
    });
    return Array.from(groups.values());
  }

  // ============================================================
  // 6. Logic vẽ map
  // ============================================================
  const mapPolylines = []; // { corridor, segmentLayers, distances, totalKm, avgSpeed, maxSpeedLimit }

  function setBaseRoadsDimmed(dimmed) {
    mapPolylines.forEach((entry) => {
      entry.segmentLayers.forEach((layer) => {
        layer.setStyle({
          weight: dimmed ? 4 : 7,
          opacity: dimmed ? 0.12 : 0.88,
        });
      });
    });
  }

  function findNearbyTraffic(point) {
    let nearest = null;

    mapPolylines.forEach((entry) => {
      entry.corridor.edges.forEach((edge, index) => {
        const speedKmh = parseSpeedKmh(edge.speed);
        const level =
          trafficLevelFromSpeed(speedKmh) ?? Number(edge.congestion_level);
        const roadPoints = entry.segmentLayers[index].getLatLngs();
        if (!CONGESTION_LEVELS[level] || roadPoints.length < 2) return;

        for (let pointIndex = 1; pointIndex < roadPoints.length; pointIndex++) {
          const distance = distToSegment(
            point,
            [roadPoints[pointIndex - 1].lat, roadPoints[pointIndex - 1].lng],
            [roadPoints[pointIndex].lat, roadPoints[pointIndex].lng],
          );
          if (!nearest || distance < nearest.distance) {
            nearest = {
              distance,
              level,
              speedKmh,
            };
          }
        }
      });
    });

    return nearest &&
      nearest.distance <= 150 &&
      CONGESTION_LEVELS[nearest.level]
      ? nearest
      : { level: null, speedKmh: null };
  }

  function buildTrafficColoredRoute(points, routeDistanceMeters) {
    const sampleLengthMeters = 60;
    const segments = [];
    let geometryDistanceMeters = 0;

    for (let index = 1; index < points.length; index++) {
      const start = points[index - 1];
      const end = points[index];
      const legDistanceMeters = haversine(start, end);
      const sampleCount = Math.max(
        1,
        Math.ceil(legDistanceMeters / sampleLengthMeters),
      );
      const sampleDistanceMeters = legDistanceMeters / sampleCount;

      for (let sample = 0; sample < sampleCount; sample++) {
        const startRatio = sample / sampleCount;
        const endRatio = (sample + 1) / sampleCount;
        const sampleStart = [
          start[0] + (end[0] - start[0]) * startRatio,
          start[1] + (end[1] - start[1]) * startRatio,
        ];
        const sampleEnd = [
          start[0] + (end[0] - start[0]) * endRatio,
          start[1] + (end[1] - start[1]) * endRatio,
        ];
        const midpoint = [
          (sampleStart[0] + sampleEnd[0]) / 2,
          (sampleStart[1] + sampleEnd[1]) / 2,
        ];
        const traffic = findNearbyTraffic(midpoint);
        const currentSegment = segments[segments.length - 1];

        if (currentSegment && currentSegment.level === traffic.level) {
          currentSegment.points.push(sampleEnd);
          currentSegment.distanceMeters += sampleDistanceMeters;
          if (traffic.speedKmh) {
            const previousDistance = currentSegment.speedDistanceMeters || 0;
            currentSegment.speedKmh =
              ((currentSegment.speedKmh || 0) * previousDistance +
                traffic.speedKmh * sampleDistanceMeters) /
              (previousDistance + sampleDistanceMeters);
            currentSegment.speedDistanceMeters =
              previousDistance + sampleDistanceMeters;
          }
        } else {
          segments.push({
            level: traffic.level,
            speedKmh: traffic.speedKmh,
            speedDistanceMeters: traffic.speedKmh ? sampleDistanceMeters : 0,
            points: [sampleStart, sampleEnd],
            distanceMeters: sampleDistanceMeters,
          });
        }
        geometryDistanceMeters += sampleDistanceMeters;
      }
    }

    if (geometryDistanceMeters > 0 && Number.isFinite(routeDistanceMeters)) {
      const distanceScale = routeDistanceMeters / geometryDistanceMeters;
      segments.forEach((segment) => {
        segment.distanceMeters *= distanceScale;
      });
    }
    return mergeShortTrafficSegments(segments, 120);
  }

  function mergeShortTrafficSegments(segments, minLengthMeters) {
    const merged = segments.map((segment) => ({
      ...segment,
      points: [...segment.points],
    }));
    let index = 0;
    while (index < merged.length - 1) {
      const source = merged[index];
      if (source.distanceMeters >= minLengthMeters) {
        index += 1;
        continue;
      }

      const mergeIntoPrevious = index > 0;
      const targetIndex = mergeIntoPrevious ? index - 1 : index + 1;
      const target = merged[targetIndex];
      const totalDistance = target.distanceMeters + source.distanceMeters;
      if (target.speedKmh && source.speedKmh) {
        target.speedKmh =
          (target.speedKmh * target.distanceMeters +
            source.speedKmh * source.distanceMeters) /
          totalDistance;
      } else {
        target.speedKmh = target.speedKmh || source.speedKmh;
      }
      target.points = mergeIntoPrevious
        ? [...target.points, ...source.points.slice(1)]
        : [...source.points.slice(0, -1), ...target.points];
      target.distanceMeters = totalDistance;
      merged.splice(index, 1);
      if (mergeIntoPrevious) index = Math.max(0, index - 1);
    }

    return merged.reduce((result, segment) => {
      const previous = result[result.length - 1];
      if (!previous || previous.level !== segment.level) {
        result.push(segment);
        return result;
      }

      const totalDistance = previous.distanceMeters + segment.distanceMeters;
      if (previous.speedKmh && segment.speedKmh) {
        previous.speedKmh =
          (previous.speedKmh * previous.distanceMeters +
            segment.speedKmh * segment.distanceMeters) /
          totalDistance;
      } else {
        previous.speedKmh = previous.speedKmh || segment.speedKmh;
      }
      previous.points.push(...segment.points.slice(1));
      previous.distanceMeters = totalDistance;
      return result;
    }, []);
  }

  function haversine(a, b) {
    const R = 6371000;
    const rad = Math.PI / 180;
    const dLat = (b[0] - a[0]) * rad;
    const dLng = (b[1] - a[1]) * rad;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /** Khoảng cách từ điểm P tới đoạn thẳng AB (mét) */
  function distToSegment(p, a, b) {
    const R = 6371000;
    const rad = Math.PI / 180;
    const metersPerDegree = R * rad;
    const cosLat = Math.cos(((a[0] + b[0] + p[0]) / 3) * rad);
    const ax = a[1] * metersPerDegree * cosLat;
    const ay = a[0] * metersPerDegree;
    const bx = b[1] * metersPerDegree * cosLat;
    const by = b[0] * metersPerDegree;
    const px = p[1] * metersPerDegree * cosLat;
    const py = p[0] * metersPerDegree;
    const dx = bx - ax,
      dy = by - ay;
    if (dx === 0 && dy === 0) return haversine(p, a);
    const t = Math.max(
      0,
      Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)),
    );
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  /** Tổng chiều dài polyline (mét) */
  function polylineLength(pts) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      total += haversine(pts[i - 1], pts[i]);
    }
    return total;
  }

  /**
   * Gọi OSRM để snap cặp node from/to của 1 edge về đúng lòng đường thực tế.
   * 1 edge = 1 cung -> route chỉ có 1 leg.
   */
  async function snapEdgeGeometry(from, to) {
    const coordStr = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    const url = `${ROUTING_BASE_URL}/${coordStr}?overview=full&geometries=geojson&steps=false`;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      if (data.code !== "Ok" || !data.routes || !data.routes.length)
        return null;

      const route = data.routes[0];
      const coordinates = route.geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
      return {
        pts: coordinates.map(([lng, lat]) => [lat, lng]),
        distance: route.distance,
      };
    } catch (err) {
      console.warn("OSRM snap thất bại:", err);
      return null;
    }
  }

  /**
   * Vận tốc trung bình corridor = trung bình điều hòa theo quãng đường từng edge:
   * avg = totalDist / Σ(dist_i / v_i)
   * Mỗi edge dùng speed thật từ TrafficRecords nếu có, ngược lại dùng
   * tốc độ đại diện của congestion_level.
   */
  function computeCorridorStats(corridor, distances) {
    let totalTime = 0,
      totalDist = 0;
    corridor.edges.forEach((e, i) => {
      const d = distances
        ? distances[i]
        : haversine([e.from.lat, e.from.lng], [e.to.lat, e.to.lng]);
      const speedNum =
        parseSpeedKmh(e.speed) ??
        CONGESTION_LEVELS[e.congestion_level]?.speed ??
        30;
      totalTime += d / speedNum;
      totalDist += d;
    });
    if (!totalDist) return null;
    return { avgSpeed: totalDist / totalTime, totalKm: totalDist / 1000 };
  }

  const LINE_STYLE = {
    weight: 7,
    opacity: 0.88,
    smoothFactor: 1.0,
    lineCap: "round",
    lineJoin: "round",
  };

  /**
   * Vẽ 1 corridor: mỗi edge 1 polyline, màu theo congestion_level của edge.
   */
  async function drawCorridor(corridor) {
    if (isDestroyed || !activeMap) return;
    const entry = {
      corridor,
      segmentLayers: [],
      distances: null,
      totalKm: null,
      avgSpeed: null,
      maxSpeedLimit:
        Math.max(...corridor.edges.map((e) => e.max_speed_limit || 0)) || null,
    };
    mapPolylines.push(entry);

    // Vẽ ngay bản dự phòng từng edge (nối from -> to)
    corridor.edges.forEach((e) => {
      const style = CONGESTION_LEVELS[e.congestion_level] || {
        color: NO_DATA_COLOR,
      };
      const segLine = L.polyline(
        [
          [e.from.lat, e.from.lng],
          [e.to.lat, e.to.lng],
        ],
        {
          ...LINE_STYLE,
          color: style.color,
          weight: routeActive ? 4 : LINE_STYLE.weight,
          opacity: routeActive ? 0.12 : LINE_STYLE.opacity,
        },
      ).addTo(map);
      entry.segmentLayers.push(segLine);
    });

    bindCorridorEvents(entry);

    // Giữ nguyên geometry OSRM đầy đủ để các edge không bị cắt rời thành chấm.
    const distances = [];
    const snappedList = await Promise.all(
      corridor.edges.map((e) => snapEdgeGeometry(e.from, e.to)),
    );
    if (isDestroyed || !activeMap) return;

    snappedList.forEach((snapped, i) => {
      const e = corridor.edges[i];
      if (snapped && snapped.pts.length > 1) {
        entry.segmentLayers[i].setLatLngs(snapped.pts);
        distances.push(snapped.distance || polylineLength(snapped.pts));
      } else {
        distances.push(
          haversine([e.from.lat, e.from.lng], [e.to.lat, e.to.lng]),
        );
      }
    });

    entry.distances = distances;
    const stats = computeCorridorStats(corridor, distances);
    entry.totalKm = stats ? stats.totalKm : null;
    entry.avgSpeed = stats ? stats.avgSpeed : null;
  }

  function bindCorridorEvents(entry) {
    const group = L.featureGroup(entry.segmentLayers);

    group.on("click", () => showCorridorDetail(entry));

    group.on("mouseover", () => {
      if (!routeActive) {
        entry.segmentLayers.forEach((l) =>
          l.setStyle({ weight: 11, opacity: 1.0 }),
        );
      }
    });
    group.on("mouseout", () => {
      entry.segmentLayers.forEach((l) =>
        l.setStyle({
          weight: routeActive ? 4 : 7,
          opacity: routeActive ? 0.12 : 0.88,
        }),
      );
    });
  }

  function fmt(n, digits = 1) {
    return Number(n).toLocaleString("vi-VN", { maximumFractionDigits: digits });
  }

  function showCorridorDetail(entry) {
    const corridor = entry.corridor;
    if (!detailDiv) return;

    const rows = corridor.edges
      .map((e, i) => {
        const lvl = CONGESTION_LEVELS[e.congestion_level];
        const distM = entry.distances
          ? entry.distances[i]
          : haversine([e.from.lat, e.from.lng], [e.to.lat, e.to.lng]);
        const speedTxt = e.speed
          ? `${e.speed}`
          : lvl
            ? `~${lvl.speed} km/h`
            : "Không có dữ liệu";
        return `
        <li style="display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom: 1px solid var(--border);">
          <span style="width:10px; height:10px; border-radius:50%; background:${e.color_code || lvl?.color || NO_DATA_COLOR}; flex-shrink:0;"></span>
          <span style="flex:1; font-size: 13px;">
            <strong>${e.street_name}</strong>
            <div style="color:var(--text-muted); font-size: 12px;">${e.from.node_name} → ${e.to.node_name}</div>
          </span>
          <span style="font-size: 13px; font-weight: 700; color:var(--text); white-space:nowrap;">${speedTxt}</span>
          <span style="color:var(--text-muted); font-size: 12px;">${fmt(distM / 1000)} km</span>
        </li>`;
      })
      .join("");

    detailDiv.hidden = false;
    detailDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
        <div>
          <span style="font-size: 11px; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 0.04em;">Chi tiết trục đường</span>
          <h2 style="font-size: 17px; font-weight: 800; margin: 2px 0 0;">${corridor.corridor_name}</h2>
        </div>
        <button type="button" id="detail-close-btn" style="background: var(--surface-subtle); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 2px 8px; font-size: 12px; font-weight: 600; cursor: pointer; color: var(--text-muted);" title="Đóng chi tiết">Đóng</button>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; font-size: 13px;">
        <div style="background: #ffffff; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px;">
          <div style="font-size: 11px; color: var(--text-muted);">Vận tốc trung bình</div>
          <strong style="color: var(--primary); font-size: 14px;">${entry.avgSpeed ? fmt(entry.avgSpeed) + " km/h" : "Đang cập nhật..."}</strong>
        </div>
        <div style="background: #ffffff; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px;">
          <div style="font-size: 11px; color: var(--text-muted);">Tổng chiều dài</div>
          <strong style="font-size: 14px;">${entry.totalKm ? fmt(entry.totalKm) + " km" : "--"}</strong>
        </div>
      </div>

      ${entry.maxSpeedLimit ? `<p style="margin: 0 0 10px; font-size: 12px; color: var(--text-muted);">Tốc độ tối đa cho phép: <strong>${entry.maxSpeedLimit} km/h</strong></p>` : ""}
      <p style="margin: 0 0 4px; font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.03em;">Trạng thái ${corridor.edges.length} phân đoạn:</p>
      <ul style="list-style:none; padding:0; margin:0 0 4px 0;">${rows}</ul>
    `;

    const closeBtn = document.getElementById("detail-close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        detailDiv.hidden = true;
      });
    }
  }

  // ============================================================
  // 7. Khởi động: fetch edges từ API (hoặc mock) -> nhóm -> vẽ
  // ============================================================
  (async () => {
    const edges = await ApiClient.fetchEdges();
    if (isDestroyed || !activeMap) return;
    const corridors = groupByCorridor(edges);

    for (const corridor of corridors) {
      if (isDestroyed || !activeMap) return;
      await drawCorridor(corridor);
    }

    if (isDestroyed || !activeMap) return;

    // Hỗ trợ deep-link từ main.html: Map.html?q=<tên trục>
    // -> tự điền ô search, đi search và focus vào tuyến luôn
    const qParam = new URLSearchParams(window.location.search).get("q");
    if (qParam && roadSearchForm && roadQueryInput) {
      roadQueryInput.value = qParam;
      roadSearchForm.requestSubmit();
    }
  })();

  // ============================================================
  // 8. Tìm kiếm theo tên trục / tên đường (client-side trên dữ liệu đã load)
  // ============================================================
  if (roadSearchForm) {
    roadSearchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const query = roadQueryInput.value.trim().toLowerCase();
      if (!query) return;

      searchResultsUl.innerHTML = "";
      const matched = mapPolylines.filter(
        (item) =>
          item.corridor.corridor_name.toLowerCase().includes(query) ||
          item.corridor.edges.some((e) =>
            e.street_name.toLowerCase().includes(query),
          ),
      );

      if (matched.length === 0) {
        searchResultsUl.innerHTML = `<li style="padding: 8px; color: #64748b;">Không tìm thấy tuyến đường phù hợp.</li>`;
        return;
      }

      matched.forEach((item) => {
        const speedTxt = item.avgSpeed
          ? ` - <small style="color:#475569">${fmt(item.avgSpeed)} km/h TB</small>`
          : "";
        const li = document.createElement("li");
        li.style.cursor = "pointer";
        li.style.padding = "8px 12px";
        li.style.borderBottom = "1px solid #e2e8f0";
        li.innerHTML = `<strong>${item.corridor.corridor_name}</strong>${speedTxt}`;

        li.addEventListener("click", () => {
          const bounds = L.featureGroup(item.segmentLayers).getBounds();
          map.fitBounds(bounds);
          showCorridorDetail(item);
        });

        searchResultsUl.appendChild(li);
      });

      // Chỉ có 1 kết quả -> chọn ngay luôn, khỏi cần click thêm lần nữa.
      // Nhiều kết quả -> chọn cái đầu tiên (khớp nhất) nhưng vẫn giữ danh sách
      // để user có thể đổi sang kết quả khác.
      const bounds = L.featureGroup(matched[0].segmentLayers).getBounds();
      map.fitBounds(bounds, { padding: [40, 40] });
      showCorridorDetail(matched[0]);
    });
  }

  // ============================================================
  // 9. POPUP thông tin đường + biểu đồ Chart.js
  // ============================================================

  // --- Get popup DOM elements ---
  const popupOverlay = document.getElementById("popup-overlay");
  const popupToggleBtn = document.getElementById("popup-toggle-btn");
  const popupCloseBtn = document.getElementById("popup-close");
  const popupInfoPage = document.getElementById("popup-info-page");
  const popupChartPage = document.getElementById("popup-chart-page");
  const popupRoadName = document.getElementById("popup-road-name");
  const popupAvgSpeed = document.getElementById("popup-avg-speed");
  const popupCongestionLevel = document.getElementById(
    "popup-congestion-level",
  );
  const popupUpdateTime = document.getElementById("popup-update-time");
  const popupShowChartBtn = document.getElementById("popup-show-chart-btn");
  const popupBackBtn = document.getElementById("popup-back-btn");
  const popupChartTitle = document.getElementById("popup-chart-title");
  const popupCanvas = document.getElementById("popup-chart-canvas");

  // Store current corridor data for chart
  let currentPopupData = null;
  // Store Chart.js instance (to destroy before redraw)
  let currentChart = null;

  // --- Open popup ---
  function openPopup() {
    if (popupOverlay) popupOverlay.hidden = false;
  }

  // --- Close popup ---
  function closePopup() {
    if (popupOverlay) popupOverlay.hidden = true;
    // Reset to info page when closing
    showInfoPage();
  }

  // --- Show info page, hide chart ---
  function showInfoPage() {
    if (popupInfoPage) popupInfoPage.hidden = false;
    if (popupChartPage) popupChartPage.hidden = true;
  }

  // --- Show chart page, hide info ---
  function showChartPage() {
    if (popupInfoPage) popupInfoPage.hidden = true;
    if (popupChartPage) popupChartPage.hidden = false;
    // Draw chart if data is available
    if (currentPopupData) {
      drawChart(currentPopupData);
    }
  }

  // --- Get current time as "HH:MM:SS DD/MM/YYYY" ---
  function getCurrentTime() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return (
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ` +
      `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`
    );
  }

  // --- Get worst congestion level of a corridor ---
  function getCorridorLevel(corridor) {
    let worstLevel = 1;
    corridor.edges.forEach((e) => {
      const lvl = e.congestion_level || 1;
      if (lvl > worstLevel) worstLevel = lvl;
    });
    return CONGESTION_LEVELS[worstLevel] || CONGESTION_LEVELS[1];
  }

  // --- Update popup content with corridor data ---
  function updatePopupContent(entry) {
    const corridor = entry.corridor;
    const levelInfo = getCorridorLevel(corridor);
    const avgSpeedText = entry.avgSpeed
      ? fmt(entry.avgSpeed) + " km/h"
      : "Đang cập nhật...";

    // Save data for chart
    currentPopupData = {
      name: corridor.corridor_name,
      edges: corridor.edges,
      distances: entry.distances,
      avgSpeed: entry.avgSpeed,
    };

    // Update popup elements
    if (popupRoadName) popupRoadName.textContent = corridor.corridor_name;
    if (popupAvgSpeed) popupAvgSpeed.textContent = avgSpeedText;
    if (popupCongestionLevel) {
      popupCongestionLevel.textContent = levelInfo.label;
      popupCongestionLevel.style.color = levelInfo.color;
    }
    if (popupUpdateTime) popupUpdateTime.textContent = getCurrentTime();
    if (popupChartTitle)
      popupChartTitle.textContent = "Biểu đồ: " + corridor.corridor_name;
  }

  // --- Draw chart with Chart.js ---
  function drawChart(data) {
    // Destroy old chart if exists
    if (currentChart) {
      currentChart.destroy();
      currentChart = null;
    }

    // Prepare data: each edge = 1 bar
    const labels = []; // Road name (X axis)
    const speeds = []; // Speed (Y axis)
    const colors = []; // Bar color by congestion level

    data.edges.forEach((e) => {
      // Short name: "Nguyễn Trãi (N01→N02)"
      const shortName =
        e.street_name + " (" + e.from.node_code + "→" + e.to.node_code + ")";
      labels.push(shortName);

      // Speed
      const speedKmh = parseSpeedKmh(e.speed);
      speeds.push(
        speedKmh || CONGESTION_LEVELS[e.congestion_level]?.speed || 0,
      );

      // Color by congestion level
      const lvl = CONGESTION_LEVELS[e.congestion_level];
      colors.push(lvl ? lvl.color : NO_DATA_COLOR);
    });

    // Create bar chart
    const ctx = popupCanvas.getContext("2d");
    currentChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Tốc độ (km/h)",
            data: speeds,
            backgroundColor: colors,
            borderColor: colors.map((c) => c),
            borderWidth: 1,
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => context.parsed.y + " km/h",
            },
          },
        },
        scales: {
          x: {
            ticks: {
              maxRotation: 45,
              font: { size: 11 },
            },
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: "km/h",
              font: { weight: "bold" },
            },
          },
        },
      },
    });
    activeChart = currentChart;
  }

  // --- Bind events: toggle, close, show chart, back ---
  if (popupToggleBtn) {
    popupToggleBtn.addEventListener("click", () => {
      // If popup is hidden -> open, if visible -> close
      if (popupOverlay.hidden) {
        openPopup();
      } else {
        closePopup();
      }
    });
  }

  if (popupCloseBtn) {
    popupCloseBtn.addEventListener("click", closePopup);
  }

  // Click on overlay (outside popup box) -> close
  if (popupOverlay) {
    popupOverlay.addEventListener("click", (e) => {
      if (e.target === popupOverlay) closePopup();
    });
  }

  if (popupShowChartBtn) {
    popupShowChartBtn.addEventListener("click", showChartPage);
  }

  if (popupBackBtn) {
    popupBackBtn.addEventListener("click", showInfoPage);
  }

  // --- Override showCorridorDetail to auto-update popup ---
  const _originalShowCorridorDetail = showCorridorDetail;
  showCorridorDetail = function (entry) {
    _originalShowCorridorDetail(entry);
    updatePopupContent(entry);
  };

}

export const mapPage = {
  mount(container) {
    isDestroyed = false;
    container.innerHTML = `
      ${renderHeader("/map")}
      ${renderMapView()}
      ${renderFooter()}
    `;
    initMapPage();
  },

  unmount() {
    isDestroyed = true;
    if (activeChart) {
      try {
        activeChart.destroy();
      } catch (err) {
        console.error("Lỗi khi destroy chart:", err);
      }
      activeChart = null;
    }
    if (activeMap) {
      try {
        activeMap.remove();
      } catch (err) {
        console.error("Lỗi khi remove map:", err);
      }
      activeMap = null;
    }
  },
};
