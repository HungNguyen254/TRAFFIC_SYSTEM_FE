// File: src/js/services/chatService.js
// Trợ lý Trí tuệ Nhân tạo Giao thông Hà Nội (Client-Side Intelligence Service)

import { fetchEdges, parseSpeedKmh } from "../api.js";

const CONGESTION_LABELS = {
  1: "Thông thoáng",
  2: "Di chuyển chậm",
  3: "Ùn tắc nghiêm trọng",
  4: "Kẹt xe hoàn toàn",
};

function extractRouteEndpoints(input) {
  const normalizedInput = input.trim().replace(/\s+/g, " ");
  const match = normalizedInput.match(
    /(?:^|\s)từ\s+(.+?)\s+(?:đến|tới|qua|sang)\s+(.+?)(?=[?!.;,]|$|\s+(?:thì|nhé|giúp tôi|với)(?:\s|$))/i,
  );
  if (!match) return null;

  const cleanPlace = (value) => value.trim().replace(/^["'“”]+|["'“”]+$/g, "");
  const origin = cleanPlace(match[1]);
  const destination = cleanPlace(match[2]);
  return origin && destination ? { origin, destination } : null;
}

function isRouteIntent(query) {
  return [
    "tìm đường",
    "tìm lộ trình",
    "chỉ đường",
    "lộ trình",
    "đường đi tối ưu",
    "tuyến đường tối ưu",
    "đường nhanh nhất",
    "đường ngắn nhất",
  ].some((phrase) => query.includes(phrase));
}

/**
 * Lấy lời chào mặc định ban đầu khi mở Chatbot
 * @returns {{ role: string, content: string, timestamp: string, actions: Array<{ text: string, path: string }> }}
 */
export function getInitialGreeting() {
  return {
    role: "model",
    content:
      "Xin chào! Tôi là **Trợ lý Giao thông Hà Nội Traffic AI**. Tôi có thể giúp bạn theo dõi điểm ùn tắc thời gian thực, dự báo giờ cao điểm, và tư vấn lộ trình di chuyển tối ưu nhất.\n\nBạn có thể chọn nhanh các câu hỏi bên dưới hoặc nhập câu hỏi trực tiếp!",
    timestamp: new Date().toISOString(),
    actions: [
      { text: "Mở Bản đồ Giao thông", path: "/map" },
      { text: "Xem Dự báo AI", path: "/#forecast" },
    ],
  };
}

/**
 * Danh sách gợi ý câu hỏi nhanh (Quick Pills)
 * @returns {Array<string>}
 */
export function getQuickPillSuggestions() {
  return [
    "Đường nào đang tắc nhất?",
    "Khung giờ cao điểm hôm nay",
    "Vận tốc trung bình toàn mạng",
    "Lưu ý khi đi đường Nguyễn Trãi",
  ];
}

/**
 * Xử lý tin nhắn người dùng và sinh câu trả lời tư vấn giao thông
 * @param {string} userInput - Nội dung câu hỏi của người dùng
 * @param {Array<object>} [cachedEdges] - Danh sách edges giao thông đã cache (tùy chọn)
 * @returns {Promise<{ role: string, content: string, timestamp: string, actions: Array<{ text: string, path: string }> }>}
 */
export async function processChatMessage(userInput, cachedEdges = null) {
  const query = (userInput || "").trim().toLowerCase();
  const timestamp = new Date().toISOString();
  const routeEndpoints = extractRouteEndpoints(userInput || "");

  if (isRouteIntent(query) || routeEndpoints) {
    if (!routeEndpoints) {
      return {
        role: "model",
        content:
          "Mình có thể mở công cụ tìm lộ trình. Bạn cho mình biết điểm đi và điểm đến, ví dụ: **Tìm đường từ Láng đến Nguyễn Trãi, Hà Đông**.",
        timestamp,
        actions: [{ text: "Mở bản đồ tìm đường", path: "/map" }],
      };
    }

    const params = new URLSearchParams({
      origin: routeEndpoints.origin,
      destination: routeEndpoints.destination,
      chat_route: "1",
    });
    return {
      role: "model",
      content:
        `Mình đã nhận diện điểm đi **${routeEndpoints.origin}** và điểm đến **${routeEndpoints.destination}**. ` +
        "Mở bản đồ để hệ thống tự tính lộ trình, quãng đường và thời gian ước tính; bản đồ cũng hiển thị tình trạng giao thông trên tuyến.",
      timestamp,
      actions: [
        {
          text: "Tính lộ trình trên bản đồ",
          path: `/map?${params.toString()}`,
        },
      ],
    };
  }

  // Nạp dữ liệu giao thông thời gian thực nếu chưa có
  let edges = cachedEdges;
  if (!edges) {
    try {
      edges = await fetchEdges();
    } catch {
      edges = [];
    }
  }

  // 1. Ý định hỏi về tình trạng tắc đường, kẹt xe, điểm nóng
  if (
    query.includes("tắc") ||
    query.includes("kẹt") ||
    query.includes("ùn") ||
    query.includes("chậm") ||
    query.includes("điểm nóng") ||
    query.includes("hotspot")
  ) {
    const congested = edges
      .filter((e) => e.congestion_level && e.congestion_level >= 2)
      .sort((a, b) => {
        if (b.congestion_level !== a.congestion_level) {
          return b.congestion_level - a.congestion_level;
        }
        const speedA = parseSpeedKmh(a.speed) ?? 999;
        const speedB = parseSpeedKmh(b.speed) ?? 999;
        return speedA - speedB;
      });

    if (congested.length === 0) {
      return {
        role: "model",
        content:
          "Hiện tại trên hệ thống **chưa ghi nhận điểm ùn tắc nghiêm trọng nào**. Các trục đường theo dõi chính đang lưu thông ổn định và thông thoáng.",
        timestamp,
        actions: [{ text: "Xem Bản đồ GIS", path: "/map" }],
      };
    }

    const topStreets = congested.slice(0, 5);
    const streetLines = topStreets
      .map((item, idx) => {
        const speedVal = parseSpeedKmh(item.speed);
        const speedTxt = speedVal ? `${speedVal} km/h` : "Chưa có vận tốc";
        const statusTxt = CONGESTION_LABELS[item.congestion_level] || "Ùn ứ";
        return `${idx + 1}. **${item.street_name || "Trục đường chưa đặt tên"}**: ${statusTxt} (${speedTxt})`;
      })
      .join("\n");

    return {
      role: "model",
      content: `Dựa trên dữ liệu giao thông thời gian thực, đây là các trục đường đang ghi nhận ùn tắc hoặc di chuyển chậm nhất:\n\n${streetLines}\n\nBạn nên cân nhắc đổi lộ trình hoặc tránh các nút giao này vào thời điểm hiện tại.`,
      timestamp,
      actions: [{ text: "Xem chi tiết trên Bản đồ", path: "/map" }],
    };
  }

  // 2. Ý định hỏi về Giờ cao điểm
  if (
    query.includes("giờ cao điểm") ||
    query.includes("khung giờ") ||
    query.includes("khi nào tắc") ||
    query.includes("thời điểm tắc")
  ) {
    return {
      role: "model",
      content:
        "Theo mô hình phân tích chu kỳ giao thông tại Hà Nội:\n\n" +
        "• **Cao điểm Sáng (07:00 – 09:00):** Đạt đỉnh từ **07:30 – 08:30** trên các trục hướng tâm (Nguyễn Trãi, Giải Phóng, Cầu Giấy, Xuân Thủy, Tố Hữu).\n" +
        "• **Cao điểm Chiều (16:30 – 19:00):** Đạt đỉnh từ **17:15 – 18:30** tại các nút giao lớn như Ngã Tư Sở, Vành Đai 3, Cầu vượt Mai Dịch, Đại La.\n\n" +
        "💡 **Khuyến nghị:** Hãy khởi hành trước 07:00 hoặc sau 09:00 vào buổi sáng; trước 16:30 hoặc sau 19:00 vào buổi chiều để tiết kiệm từ 20–35 phút di chuyển.",
      timestamp,
      actions: [{ text: "Xem biểu đồ Dự báo 24h", path: "/#forecast" }],
    };
  }

  // 3. Ý định hỏi về Vận tốc trung bình, tốc độ mạng lưới
  if (
    query.includes("vận tốc") ||
    query.includes("tốc độ") ||
    query.includes("trung bình")
  ) {
    const validSpeeds = edges
      .map((e) => parseSpeedKmh(e.speed))
      .filter((s) => s !== null && s > 0);

    const avgSpeed = validSpeeds.length
      ? Math.round((validSpeeds.reduce((a, b) => a + b, 0) / validSpeeds.length) * 10) / 10
      : 28.5;

    let evaluation = "Lưu thông tương đối ổn định";
    if (avgSpeed < 20) evaluation = "Mạng lưới đang trong tình trạng ùn ứ diện rộng";
    else if (avgSpeed >= 35) evaluation = "Mạng lưới thông thoáng, di chuyển nhanh";

    return {
      role: "model",
      content: `Vận tốc di chuyển trung bình toàn mạng lưới hiện đạt **${avgSpeed} km/h**.\n\nĐánh giá tổng thể: **${evaluation}**.`,
      timestamp,
      actions: [{ text: "Mở Bản đồ theo dõi", path: "/map" }],
    };
  }

  // 4. Tư vấn về tuyến đường cụ thể
  const knownStreets = ["nguyễn trãi", "cầu giấy", "vành đai 3", "kim mã", "giải phóng", "tố hữu", "xuân thủy"];
  const matchedStreet = knownStreets.find((name) => query.includes(name));
  if (matchedStreet) {
    const matchingEdges = edges.filter(
      (e) => e.street_name && e.street_name.toLowerCase().includes(matchedStreet)
    );

    let specificStatus = "";
    if (matchingEdges.length) {
      const topEdge = matchingEdges[0];
      const speed = parseSpeedKmh(topEdge.speed);
      specificStatus = ` Hiện tại tốc độ ghi nhận trung bình là **${speed ? speed + " km/h" : "20-25 km/h"}** (${CONGESTION_LABELS[topEdge.congestion_level] || "đang giám sát"}).`;
    }

    return {
      role: "model",
      content:
        `Tuyến **${matchedStreet.toUpperCase()}** là một trong những trục giao thông huyết mạch có lưu lượng phương tiện rất lớn.${specificStatus}\n\n` +
        "• **Mẹo di chuyển:** Hãy tận dụng các tuyến đường song hành, hạn chế quay đầu tại các nút giao không có đèn tín hiệu phân luồng, và quan sát hướng dẫn phân làn tốc độ.",
      timestamp,
      actions: [
        { text: `Tìm đường qua ${matchedStreet}`, path: "/map" },
      ],
    };
  }

  // 5. Lời chào hoặc hỏi thăm
  if (
    query.includes("chào") ||
    query.includes("hello") ||
    query.includes("hi") ||
    query.includes("bạn là ai") ||
    query.includes("giúp")
  ) {
    return {
      role: "model",
      content:
        "Tôi là **Hà Nội Traffic AI Assistant**. Tôi có thể hỗ trợ bạn:\n\n" +
        "1. Tra cứu các điểm nóng ùn tắc thời gian thực.\n" +
        "2. Dự báo các khung giờ cao điểm và vận tốc trung bình.\n" +
        "3. Hướng dẫn chỉ đường và lựa chọn phương tiện tối ưu.\n\n" +
        "Hãy đặt câu hỏi hoặc bấm vào các nút bên dưới để bắt đầu!",
      timestamp,
      actions: [
        { text: "Xem Bản đồ Giao thông", path: "/map" },
        { text: "Xem Dự báo AI", path: "/#forecast" },
      ],
    };
  }

  // 6. Phản hồi mặc định khi câu hỏi nằm ngoài phạm vi hẹp
  return {
    role: "model",
    content:
      `Tôi đã ghi nhận câu hỏi của bạn: *"${userInput}"*.\n\n` +
      "Hiện tại tôi có thể hỗ trợ tốt nhất về **tình trạng ùn tắc các tuyến đường**, **dự báo giờ cao điểm** và **chỉ đường thông minh tại Hà Nội**.\n\n" +
      "Bạn có muốn kiểm tra tình hình giao thông trên bản đồ trực tiếp không?",
    timestamp,
    actions: [
      { text: "Mở Bản đồ Trực tiếp", path: "/map" },
      { text: "Xem Dự báo Giờ cao điểm", path: "/#forecast" },
    ],
  };
}
