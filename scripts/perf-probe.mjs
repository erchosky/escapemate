// Measures a running EscapeMate (e.g. `npm run demo` in another terminal) with real Chromium:
// page weight and LCP per route, client-side navigation timings, and RSC prefetch traffic.
// Usage: npm run perf [-- http://localhost:3000]
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3000";
const browser = await chromium.launch();

console.log(`\n# Page weight (${base})`);
for (const path of ["/", "/swipe", "/matches", "/raid-now", "/quest-help"]) {
  const page = await browser.newPage();
  const items = [];
  page.on("response", async (res) => {
    if (!res.url().startsWith(base)) return;
    try {
      items.push({ type: res.request().resourceType(), bytes: (await res.body()).length });
    } catch {
      // Redirects and aborted requests have no body.
    }
  });
  const started = Date.now();
  await page.goto(base + path, { waitUntil: "networkidle" });
  const lcp = await page.evaluate(
    () =>
      new Promise((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          resolve(Math.round(entries[entries.length - 1]?.startTime ?? 0));
        }).observe({ type: "largest-contentful-paint", buffered: true });
        setTimeout(() => resolve(0), 2000);
      }),
  );
  const kb = (type) => Math.round(items.filter((item) => item.type === type).reduce((sum, item) => sum + item.bytes, 0) / 1024);
  console.log(`${path.padEnd(12)} networkidle ${String(Date.now() - started).padStart(5)} ms · LCP ${String(lcp).padStart(4)} ms · JS ${kb("script")} KB · HTML ${kb("document")} KB`);
  await page.close();
}

console.log("\n# Navigation between tabs");
const page = await browser.newPage();
const rsc = [];
page.on("request", (req) => {
  const headers = req.headers();
  if (headers.rsc === "1") rsc.push(headers["next-router-prefetch"] ? "prefetch" : "navigation");
});
await page.goto(`${base}/swipe`, { waitUntil: "networkidle" });
console.log(`RSC requests while opening /swipe: ${rsc.length} (${rsc.filter((kind) => kind === "prefetch").length} prefetches)`);
await page.evaluate(() => {
  window.__probe = true;
});
for (const href of ["/matches", "/raid-now", "/quest-help", "/settings", "/swipe"]) {
  const started = Date.now();
  await page.locator(`nav a[href="${href}"]`).first().click();
  await page.waitForURL(`**${href}`);
  await page.locator(`nav a[href="${href}"][aria-current="page"]`).first().waitFor();
  const clientSide = await page.evaluate(() => window.__probe === true);
  console.log(`${href.padEnd(12)} ${String(Date.now() - started).padStart(5)} ms ${clientSide ? "client-side" : "FULL RELOAD"}`);
}

await browser.close();
