const BACKEND_URL = "http://127.0.0.1:8000";

    document.getElementById("fetch-btn").addEventListener("click", async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/data`);

        if (!response.ok) {
          throw new Error(`Lỗi kết nối mạng: ${response.status}`);
        }

        const data = await response.json();
        document.getElementById("output").innerText = data.message;
        console.log("Dữ liệu nhận được:", data);
      } catch (error) {
        console.error("Lỗi khi gọi API:", error);
        document.getElementById("output").innerText = "Không thể kết nối tới Backend!";
      }
    });