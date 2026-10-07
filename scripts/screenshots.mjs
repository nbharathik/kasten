// Screenshots of every view in the browser preview, in light and dark, to
// compare the look before and after a change. Run a preview build first:
//
//   pnpm -C app build && pnpm -C app preview --port 4173
//   node scripts/screenshots.mjs <folder> [url=http://localhost:4173] [only=view,view]
//
// Each view opens on the dev vault's samples (`?samples=dev`) in a fresh
// window at 1440×900, and is saved as <folder>/<view>-<theme>.png.
// Needs Playwright with Chromium; a global install works too, and
// CHROMIUM_PATH picks a browser already on the computer.

import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const [folder, base = "http://localhost:4173", only] = process.argv.slice(2);
if (!folder) {
  console.error("Usage: node scripts/screenshots.mjs <folder> [url] [only=view,view]");
  process.exit(2);
}

/** Every view, and a few overlays, by the name its file gets. */
const SHOTS = [
  { name: "home", place: { view: "home" } },
  { name: "page", place: { view: "page", path: "library/zettelkasten-method.md" } },
  { name: "project", place: { view: "page", path: "projects/photo-organiser/_project.md" } },
  { name: "inbox", place: { view: "inbox" } },
  { name: "journal", place: { view: "journal" } },
  { name: "calendar", place: { view: "calendar" } },
  { name: "library", place: { view: "library" } },
  { name: "tasks", place: { view: "tasks" } },
  { name: "boards", place: { view: "boards" } },
  { name: "board", place: { view: "boards", path: "projects/photo-organiser/boards/brainstorm.canvas" } },
  { name: "tags", place: { view: "tags" } },
  { name: "highlights", place: { view: "highlights" } },
  { name: "chat", place: { view: "chat" } },
  { name: "history", place: { view: "history" } },
  { name: "review", place: { view: "review" } },
  { name: "import", place: { view: "import" } },
  { name: "trash", place: { view: "trash" } },
  { name: "settings", place: { view: "settings" } },
  { name: "palette", place: { view: "home" }, then: (page) => page.keyboard.press("Control+k").then(() => page.getByRole("dialog", { name: "Search and commands" }).waitFor()) },
];

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

let chromium;
try {
  ({ chromium } = await loadPlaywright());
} catch {
  console.error("Playwright is not installed: npm install -g playwright && npx playwright install chromium");
  process.exit(2);
}

const layout = (place) => ({
  layout: { panes: [{ id: "p1", tabs: [{ id: "t1", place, back: [], forward: [], pinned: false }], active: "t1" }], focus: "p1", closed: [] },
  stack: [],
  stackOpen: false,
});

const out = resolve(folder);
mkdirSync(out, { recursive: true });
const wanted = only ? new Set(only.split(",")) : null;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];

for (const shot of SHOTS.filter((s) => !wanted || wanted.has(s.name))) {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", (e) => problems.push(`${shot.name} ${theme}: ${e}`));
    await page.addInitScript(
      ([saved, theme, recent]) => {
        if (sessionStorage.getItem("shot")) return;
        sessionStorage.setItem("shot", "1");
        localStorage.clear();
        localStorage.setItem("kasten.layout", JSON.stringify(saved));
        localStorage.setItem("kasten.theme", theme);
        localStorage.setItem("kasten.recent", JSON.stringify(recent));
      },
      [layout(shot.place), theme, ["library/zettelkasten-method.md"]],
    );
    await page.goto(`${base}/?samples=dev`);
    await page.getByRole("navigation", { name: "Sidebar" }).waitFor({ timeout: 30000 });
    await page.waitForLoadState("networkidle");
    if (shot.then) await shot.then(page);
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(out, `${shot.name}-${theme}.png`) });
    await context.close();
  }
  console.log(shot.name);
}

await browser.close();
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
