// Measures the window's speed on a synthetic vault in the browser preview:
// time to a usable sidebar, palette keystrokes, opening pages,
// and long tasks while typing. Run a preview build first:
//
//   pnpm -C app build && pnpm -C app preview --port 4173
//   node scripts/perf-preview.mjs [notes=10000] [url=http://localhost:4173]
//
// Needs Playwright with Chromium (`npm install -g playwright`, then
// `npx playwright install chromium`); it is not an app dependency.

const notes = Number(process.argv[2] ?? 10000);
const base = process.argv[3] ?? "http://localhost:4173";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright is not installed: npm install -g playwright && npx playwright install chromium");
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 880 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.addInitScript(() => {
  // A returning user on Home, so the first-run guide does not open.
  if (!sessionStorage.getItem("perf")) {
    sessionStorage.setItem("perf", "1");
    localStorage.clear();
    localStorage.setItem("kasten.recent", JSON.stringify(["projects/p3/pages/n3.md"]));
  }
  window.__long = [];
  new PerformanceObserver((list) => window.__long.push(...list.getEntries().map((e) => e.duration))).observe({ type: "longtask", buffered: true });
});

const out = {};
await page.goto(`${base}/?big=${notes}`);
const sidebar = page.getByRole("navigation", { name: "Sidebar" });
await sidebar.getByRole("button", { name: "Project 0", exact: true }).waitFor({ timeout: 120000 });
out.sidebarMs = Math.round(await page.evaluate(() => performance.now()));
out.marks = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType("mark").map((m) => [m.name, Math.round(m.startTime)])));
await page.waitForTimeout(3000);

await page.keyboard.press("Control+k");
await page.getByRole("dialog", { name: "Search and commands" }).waitFor();
out.paletteMs = await page.evaluate(async () => {
  const input = document.querySelector('input[aria-label="Search"]');
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  const times = [];
  let value = "";
  for (const ch of "layout plan 12") {
    value += ch;
    const t = performance.now();
    setValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.body.offsetHeight;
    times.push(Math.round(performance.now() - t));
    await new Promise((r) => setTimeout(r, 40));
  }
  return times;
});
await page.keyboard.press("Escape");

const open = (name) =>
  page.evaluate(async (name) => {
    const button = [...document.querySelectorAll('nav[aria-label="Sidebar"] button')].find((b) => b.textContent.trim().endsWith(name));
    if (!button) return null;
    const t = performance.now();
    button.click();
    for (;;) {
      await new Promise((r) => requestAnimationFrame(r));
      const title = document.querySelector('textarea[aria-label="Page title"]');
      if (title && title.value.endsWith(name.split(" ").pop())) return Math.round(performance.now() - t);
      if (performance.now() - t > 5000) return "timeout";
    }
  }, name);
out.openMs = [await open("Project 0"), await open("Project 1"), await open("Project 2")];

await page.evaluate(() => (window.__long = []));
await page.locator(".ProseMirror").first().click();
await page.keyboard.press("Control+End");
await page.keyboard.type(" the quick brown fox jumps over the lazy dog", { delay: 40 });
await page.waitForTimeout(1500);
out.typingLongTasksMs = await page.evaluate(() => window.__long.map(Math.round));
out.heapMB = await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1e6));

console.log(JSON.stringify(out, null, 2));
if (errors.length) console.log("page errors:", errors.join("\n"));
await browser.close();
