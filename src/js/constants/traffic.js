// File: src/js/constants/traffic.js
// Định nghĩa các hằng số màu sắc và cấp độ ùn tắc giao thông chuẩn

export const CONGESTION_LEVELS = {
  1: { key: "green", color: "#10b981", label: "Thông thoáng", speed: 45 },
  2: { key: "yellow", color: "#f59e0b", label: "Di chuyển chậm", speed: 22 },
  3: { key: "red", color: "#ef4444", label: "Ùn tắc nghiêm trọng", speed: 11 },
  4: { key: "darkred", color: "#991b1b", label: "Kẹt xe hoàn toàn", speed: 4 },
};

export const NO_DATA_COLOR = "#94a3b8";
