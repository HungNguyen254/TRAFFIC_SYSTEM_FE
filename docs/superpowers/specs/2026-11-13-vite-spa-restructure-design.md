# Thiết kế: Tái cấu trúc dự án FE theo chuẩn Vite SPA (Single Page Application)

## 1. Mục tiêu (Intent & Goals)
- Chuyển đổi toàn bộ cấu trúc dự án từ MPA (Multi-Page App) cũ sang Vite SPA chuẩn:
  - Chỉ duy nhất 1 file `index.html` tại thư mục gốc đóng vai trò app shell.
  - Xóa bỏ các file HTML riêng lẻ (`html/*.html`).
  - Toàn bộ giao diện và logic của từng trang được chuyển thành các Pure JS Views/Pages (`homePage.js`, `mapPage.js`, `loginPage.js`, `adminPage.js`).
  - Giao diện được render động qua `innerHTML` vào `#app`.
  - Điều hướng bằng Client-Side Router thuần JS (`router.js`) mượt mà, hỗ trợ đường dẫn sạch `/`, `/map`, `/login`, `/admin`.
  - Tách các component dùng chung (`header.js`, `footer.js`).
  - Chuẩn hóa đặt tên chữ thường kebab/camelCase (`map.css`, `map.js`).
  - Đưa toàn bộ mã nguồn vào `src/` (`src/css/`, `src/js/`), tạo `public/`.
  - Tinh giản `vite.config.js` về chuẩn SPA mặc định.

## 2. Non-goals & Anti-goals
- Không sửa đổi logic nghiệp vụ API, thuật toán dự báo hay Leaflet map/Chart.js.
- Không làm gãy giao diện hoặc class/id CSS hiện tại.

## 3. Kiến trúc thư mục mới
```text
FE/
├── index.html
├── public/
├── src/
│   ├── css/
│   │   ├── main.css
│   │   └── map.css
│   └── js/
│       ├── api.js
│       ├── router.js
│       ├── components/
│       │   ├── header.js
│       │   └── footer.js
│       ├── views/
│       │   ├── homeView.js
│       │   ├── mapView.js
│       │   ├── loginView.js
│       │   └── adminView.js
│       ├── pages/
│       │   ├── homePage.js
│       │   ├── mapPage.js
│       │   ├── loginPage.js
│       │   └── adminPage.js
│       └── main.js
├── package.json
└── vite.config.js
```
