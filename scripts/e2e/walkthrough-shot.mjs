import { chromium } from "playwright";
const BASE = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await (await browser.newContext({ viewport: { width: 1000, height: 720 } })).newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
await page.goto(`${BASE}/walkthrough-demo`, { waitUntil: "domcontentloaded" });

// Wait for the layout (real Claude call) → viewer mounts a <canvas>.
const canvas = page.locator("canvas");
await canvas.first().waitFor({ timeout: 45000 }).catch(() => {});
const hasCanvas = (await canvas.count()) > 0;
const box = hasCanvas ? await canvas.first().boundingBox() : null;
const footer = await page.getByText(/Layout is approximate/i).innerText().catch(() => "(layout not done)");

await page.waitForTimeout(1200); // let a few frames render
await page.screenshot({ path: "scripts/e2e/walkthrough.png" });

console.log("canvas present:", hasCanvas, "| size:", box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "none");
console.log("footer:", footer);
console.log("page errors:", errs.length, errs[0]?.slice(0, 200) || "");
await browser.close();
process.exit(0);
