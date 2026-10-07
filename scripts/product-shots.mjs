// The product pictures on the website (site/img) and in the README
// (docs/screenshots), from the browser preview on the dev vault's samples,
// at twice the size, in light and dark. Run a preview build first, then
// turn each PNG into WebP:
//
//   pnpm -C app build && pnpm -C app preview --port 4173
//   node scripts/product-shots.mjs <folder> [url=http://localhost:4173] [only=name,name]
//   convert <folder>/page.png -quality 82 -define webp:method=6 site/img/page.webp
//
// page, inbox, library and present go to site/img; home, project and
// whiteboard to docs/screenshots. Needs Playwright with Chromium; a global
// install works too, and CHROMIUM_PATH picks a browser already on the
// computer.

import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const [out, base = "http://localhost:4173", onlyArg] = process.argv.slice(2);
if (!out) {
  console.error("Usage: node scripts/product-shots.mjs <folder> [url] [only=name,name]");
  process.exit(2);
}
const only = onlyArg ? new Set(onlyArg.split(",")) : null;
mkdirSync(out, { recursive: true });

async function loadPlaywright() {
  for (const name of ["playwright", "playwright-core"]) {
    try {
      return await import(name);
    } catch {
      try {
        const root = execSync("npm root -g").toString().trim();
        return createRequire(`${root}/`)(name);
      } catch {
        // Try the next name.
      }
    }
  }
  throw new Error("no playwright");
}

const { chromium } = await loadPlaywright();

const layout = (place) => ({
  layout: { panes: [{ id: "p1", tabs: [{ id: "t1", place, back: [], forward: [], pinned: false }], active: "t1" }], focus: "p1", closed: [] },
  stack: [], stackOpen: false,
});
const SITE = { width: 1200, height: 750 };
const DOCS = { width: 1440, height: 900 };
const SHOTS = [
  { name: "page", size: SITE, place: { view: "page", path: "library/seaside-trip.md" } },
  { name: "inbox", size: SITE, place: { view: "inbox" } },
  { name: "library", size: SITE, place: { view: "library" } },
  { name: "present", size: SITE, place: { view: "boards", path: "projects/photo-organiser/boards/brainstorm.canvas" }, then: async (p) => { await p.locator(".react-flow").waitFor(); await p.waitForTimeout(800); await p.getByRole("button", { name: "Present" }).click(); await p.waitForTimeout(1200); } },
  { name: "home", size: DOCS, place: { view: "home" } },
  { name: "project", size: DOCS, place: { view: "page", path: "projects/photo-organiser/_project.md" } },
  { name: "whiteboard", size: DOCS, place: { view: "boards", path: "projects/photo-organiser/boards/brainstorm.canvas" }, then: async (p) => { await p.locator(".react-flow").waitFor(); await p.waitForTimeout(1000); } },
];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
for (const shot of SHOTS.filter((s) => !only || only.has(s.name))) {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: shot.size, deviceScaleFactor: 2, colorScheme: theme, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", (e) => problems.push(`${shot.name} ${theme}: ${e}`));
    await page.addInitScript(([saved, theme]) => {
      if (sessionStorage.getItem("shot")) return;
      sessionStorage.setItem("shot", "1");
      localStorage.clear();
      localStorage.setItem("kasten.layout", JSON.stringify(saved));
      localStorage.setItem("kasten.theme", theme);
      localStorage.setItem("kasten.recent", JSON.stringify(["library/seaside-trip.md", "library/zettelkasten-method.md"]));
    }, [layout(shot.place), theme]);
    await page.goto(`${base}/?samples=dev`);
    await page.getByRole("navigation", { name: "Sidebar" }).waitFor({ timeout: 30000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    if (shot.then) await shot.then(page);
    await page.waitForTimeout(700);
    await page.mouse.move(2, shot.size.height - 2);
    await page.screenshot({ path: `${out}/${shot.name}${theme === "dark" ? "-dark" : ""}.png` });
    await context.close();
  }
  console.log(shot.name);
}
await browser.close();
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
