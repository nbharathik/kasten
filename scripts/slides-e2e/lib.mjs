// What the Kasten Slides acceptance scenarios share: a browser, the `slides dev`
// server on a temporary folder, and a list of checks with their results.
// Nothing here writes outside a temporary folder, and nothing deletes.

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const root = resolve(import.meta.dirname, "../..");

/** Playwright, from the project or a global install; null when there is none. */
export async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    try {
      const global = execFileSync("npm", ["root", "-g"]).toString().trim();
      return createRequire(`${global}/`)("playwright");
    } catch {
      return null;
    }
  }
}

/** The Chromium to launch: $CHROMIUM_PATH, else the one Playwright installed, else undefined (Playwright's own). */
export function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!existsSync(base)) return undefined;
  const found = readdirSync(base).filter((n) => /^chromium-\d+$/.test(n)).sort().pop();
  const path = found && join(base, found, "chrome-linux", "chrome");
  return path && existsSync(path) ? path : undefined;
}

/** A temporary folder for one run: the decks the server serves and the screenshots. */
export function workspace() {
  const dir = mkdtempSync(join(tmpdir(), "slides-e2e-"));
  const decks = join(dir, "decks");
  const shots = join(dir, "shots");
  mkdirSync(decks);
  mkdirSync(shots);
  return { dir, decks, shots };
}

/** Starts `slides dev` on a folder with the built page; resolves to its address and a way to stop it. */
export function startServer({ decks, page, binary = join(root, "target/debug/slides") }) {
  return new Promise((resolveStart, reject) => {
    const child = spawn(binary, ["dev", decks, "--port", "0", "--ui", page], { stdio: ["ignore", "pipe", "inherit"] });
    let text = "";
    const timer = setTimeout(() => reject(new Error(`slides dev did not say where it listens:\n${text}`)), 20000);
    child.stdout.on("data", (chunk) => {
      text += chunk;
      const match = /http:\/\/127\.0\.0\.1:(\d+)\//.exec(text);
      if (match) {
        clearTimeout(timer);
        resolveStart({ base: `http://127.0.0.1:${match[1]}`, stop: () => child.kill() });
      }
    });
    child.on("error", reject);
    child.on("exit", (code) => code && reject(new Error(`slides dev exited with ${code}`)));
  });
}

/** Collects checks; `report()` prints them and says whether all held. */
export function checks() {
  const results = [];
  const check = (name, held, detail = "") => {
    results.push({ name, held: Boolean(held), detail: String(detail) });
    console.log(`${held ? "  PASS" : "  FAIL"}  ${name}${detail === "" ? "" : `  (${detail})`}`);
    return Boolean(held);
  };
  return {
    check,
    results,
    failed: () => results.filter((r) => !r.held),
  };
}

/** Screen position of a point in slide units, and the scale from units to pixels. */
export async function pageGeometry(page) {
  return page.evaluate(() => {
    const box = document.querySelector(".ks-stage .ks-page").getBoundingClientRect();
    return { x: box.x, y: box.y, scale: box.width / 960 };
  });
}

/** The screen box of the element with this id. */
export async function boxOf(page, id) {
  const box = await page.locator(`.ks-stage [data-el="${id}"]`).first().boundingBox();
  if (!box) throw new Error(`element ${id} is not on the screen`);
  return box;
}

/** Waits until the editor has written its last change to the file. */
export async function saved(page) {
  await page.waitForFunction(() => window.__ks?.session.state.saving.status === "saved", null, { timeout: 15000 });
}

/** A free port on the loopback address. */
export function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

/** Serves the built app (the browser preview of Kasten) and resolves to its address and a way to stop it. */
export async function startPreview() {
  const port = await freePort();
  const child = spawn("pnpm", ["-C", "app", "exec", "vite", "preview", "--port", String(port), "--strictPort", "--host", "127.0.0.1"], { cwd: root, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  for (let tries = 0; tries < 100; tries++) {
    try {
      if ((await fetch(base)).ok) return { base, stop: () => child.kill() };
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  child.kill();
  throw new Error("the preview of the app did not start");
}
