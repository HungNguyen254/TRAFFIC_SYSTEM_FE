// Kiểm tra hành vi vào /map bằng URL trực tiếp (full page load), chưa đăng nhập
export default async function run(page, ui) {
  const events = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame())
      events.push({ type: "NAV", url: frame.url() });
  });
  await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.removeItem("traffic_token");
    localStorage.removeItem("traffic_user");
  });
  // Full page load trực tiếp tới /map
  await page.goto("http://localhost:5173/map", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(2500);
  events.push({
    type: "FINAL",
    url: await page.evaluate(
      () => location.pathname + decodeURIComponent(location.search),
    ),
    hasLoginForm: await page.evaluate(
      () => !!document.getElementById("login-form"),
    ),
    hasMapCanvas: await page.evaluate(
      () => !!document.querySelector("#map-canvas"),
    ),
    notice: await page.evaluate(
      () => document.getElementById("auth-notice")?.textContent || "",
    ),
    noticeHidden: await page.evaluate(
      () => document.getElementById("auth-notice")?.hidden,
    ),
    overlay: await page.evaluate(
      () => document.getElementById("status-overlay")?.dataset.state || null,
    ),
  });
  return events;
}
