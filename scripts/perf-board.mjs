// Measures the whiteboard's frame times on a synthetic board in the
// browser preview, against a budget of 60 fps at 500 nodes: panning,
// zooming, dragging a card and dragging a section, with every node in view
// and zoomed in. Run a preview build first:
//
//   pnpm -C app build && pnpm -C app preview --port 4173
//   node scripts/perf-board.mjs [nodes=500] [url=http://localhost:4173]
//
// Needs Playwright with Chromium; a global install works too.

import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const nodes = Number(process.argv[2] ?? 500);
const base = process.argv[3] ?? "http://localhost:4173";

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    const root = execSync("npm root -g").toString().trim();
    return createRequire(`${root}/`)("playwright");
  }
}

let chromium;
try {
  ({ chromium } = await loadPlaywright());
} catch {
  console.error("Playwright is not installed: npm install -g playwright && npx playwright install chromium");
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.addInitScript(() => {
  if (!sessionStorage.getItem("perf")) {
    sessionStorage.setItem("perf", "1");
    localStorage.clear();
    localStorage.setItem("kasten.recent", JSON.stringify(["library/perf-board.canvas"]));
  }
  window.__long = [];
  new PerformanceObserver((list) => window.__long.push(...list.getEntries().map((e) => e.duration))).observe({ type: "longtask", buffered: true });
  // Frame times, from one animation frame to the next, while recording.
  window.__frames = {
    start() {
      this.times = [];
      this.on = true;
      // Each recording has its own loop; an earlier one stops at its next frame.
      const round = (this.round = (this.round ?? 0) + 1);
      let last = performance.now();
      const tick = (now) => {
        if (round !== this.round) return;
        this.times.push(now - last);
        last = now;
        if (this.on) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      window.__long = [];
    },
    stop() {
      this.on = false;
      return { times: this.times.slice(1), long: window.__long.slice() };
    },
  };
});

await page.goto(`${base}/?board=${nodes}`);
await page.getByRole("navigation", { name: "Sidebar" }).getByRole("button", { name: "Whiteboards" }).click({ timeout: 120000 });
const opened = Date.now();
await page.getByRole("button", { name: /Perf board/ }).first().click({ timeout: 60000 });
await page.waitForFunction((n) => document.querySelectorAll(".react-flow__node").length >= n, nodes, { timeout: 60000 });
const openMs = Date.now() - opened;
await page.waitForTimeout(2500);

const box = await page.locator(".kasten-board").boundingBox();
const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

function summary(name, { times, long }) {
  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / Math.max(1, times.length);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  return {
    name,
    frames: times.length,
    fps: Math.round((1000 / mean) * 10) / 10,
    p95ms: Math.round(p95 * 10) / 10,
    maxMs: Math.round((sorted[sorted.length - 1] ?? 0) * 10) / 10,
    over20ms: times.filter((t) => t > 20).length,
    longTasks: long.length,
  };
}

async function measure(name, run) {
  await page.evaluate(() => window.__frames.start());
  await run();
  const result = await page.evaluate(() => window.__frames.stop());
  return summary(name, result);
}

/** Wheel events at about 60 a second for `ms`. */
async function wheel(ms, dx, dy, zoom = false) {
  await page.mouse.move(centre.x, centre.y);
  if (zoom) await page.keyboard.down("Control");
  const end = Date.now() + ms;
  for (let i = 0; Date.now() < end; i++) {
    const flip = zoom && Math.floor(i / 40) % 2 === 1 ? -1 : 1;
    await page.mouse.wheel(dx * flip, dy * flip);
    await page.waitForTimeout(14);
  }
  if (zoom) await page.keyboard.up("Control");
}

/** Drags whatever is at `from` in a slow circle-ish path for `ms`. */
async function drag(from, ms) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const end = Date.now() + ms;
  for (let i = 0; Date.now() < end; i++) {
    const a = i / 12;
    await page.mouse.move(from.x + Math.sin(a) * 160 + i * 0.5, from.y + Math.cos(a) * 90 - 90, { steps: 1 });
    await page.waitForTimeout(14);
  }
  await page.mouse.up();
  await page.waitForTimeout(600);
}

const results = [];
const zoom = async () => page.evaluate(() => document.querySelector(".kasten-zoom-value")?.textContent);

// Everything in view: the worst case for painting.
await page.keyboard.press("Shift+Digit1");
await page.locator(".kasten-board").focus();
await page.keyboard.press("Shift+Digit1");
await page.waitForTimeout(800);
results.push({ ...(await measure("idle, all in view", () => page.waitForTimeout(1500))), zoom: await zoom() });
results.push({ ...(await measure("pan, all in view", () => wheel(3000, 14, 9))), zoom: await zoom() });
results.push({ ...(await measure("zoom in and out, all in view", () => wheel(3000, 0, -25, true))), zoom: await zoom() });

// Zooming in and out across the zoom where cards change to titles only.
await page.keyboard.press("Shift+Digit0");
await page.waitForTimeout(800);
for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Zoom out" }).click();
await page.waitForTimeout(800);
results.push({ ...(await measure("zoom across titles-only, 40-70%", () => wheel(4000, 0, -40, true))), zoom: await zoom() });

// At 100 %, as when working in one part of the board.
await page.keyboard.press("Shift+Digit1");
await page.waitForTimeout(500);
await page.keyboard.press("Shift+Digit0");
await page.waitForTimeout(1200);
results.push({ ...(await measure("pan at 100%", () => wheel(3000, 14, 9))), zoom: await zoom() });

/** The centre of a node of this kind nearest the middle of the view. */
async function nodeNearCentre(selector) {
  return page.evaluate(
    ([selector, centre]) => {
      let best = null;
      for (const el of document.querySelectorAll(selector)) {
        const r = el.getBoundingClientRect();
        const d = Math.hypot(r.x + r.width / 2 - centre.x, r.y + r.height / 2 - centre.y);
        if (r.width > 40 && (!best || d < best.d)) best = { d, x: r.x + r.width / 2, y: r.y + Math.min(20, r.height / 2) };
      }
      return best;
    },
    [selector, centre],
  );
}

const card = await nodeNearCentre(".react-flow__node-card:not(.selected)");
if (card) results.push({ ...(await measure("drag a card at 100%", () => drag(card, 3000))), zoom: await zoom() });
await page.keyboard.press("Escape");
const bar = await nodeNearCentre(".kasten-section-bar");
if (bar) results.push({ ...(await measure("drag a section and its 12 nodes at 100%", () => drag(bar, 3000))), zoom: await zoom() });

const heap = await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null));
console.log(JSON.stringify({ nodes, openMs, heapMb: heap, results, errors }, null, 2));
await browser.close();
