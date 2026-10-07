// The acceptance run for Kasten Slides: builds the standalone page and the `slides`
// program, serves a temporary folder of decks with `slides dev`, and drives a real
// Chromium through the editor the way a person would. Results are printed; the exit
// code is 1 when a check fails. Screenshots and decks stay in a temporary folder
// whose name is printed.
//
//   node scripts/slides-e2e.mjs                 every scenario
//   node scripts/slides-e2e.mjs --only editor   some scenarios (editor, perf, kasten, present, presenter, html)
//   node scripts/slides-e2e.mjs --no-build      use the program and page as they are
//   node scripts/slides-e2e.mjs --headed        show the browser
//
// Needs Playwright with Chromium (`npm install -g playwright`, `npx playwright install
// chromium`) and a Rust toolchain; it is not a project dependency.

import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { checks, chromiumPath, loadPlaywright, root, startPreview, startServer, workspace } from "./slides-e2e/lib.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

/** In the order they run. Each module exports `run(context)`. */
const SCENARIOS = {
  editor: () => import("./slides-e2e/editor.mjs"),
  perf: () => import("./slides-e2e/perf.mjs"),
  present: () => import("./slides-e2e/present.mjs"),
  presenter: () => import("./slides-e2e/presenter.mjs"),
  html: () => import("./slides-e2e/html-export.mjs"),
  kasten: () => import("./slides-e2e/kasten.mjs"),
};

const chosen = value("--only") ? value("--only").split(",") : Object.keys(SCENARIOS);
for (const name of chosen) {
  if (!SCENARIOS[name]) {
    console.error(`There is no scenario called ${name}; the scenarios are ${Object.keys(SCENARIOS).join(", ")}.`);
    process.exit(2);
  }
}

const playwright = await loadPlaywright();
if (!playwright) {
  console.error("Playwright is not installed: npm install -g playwright && npx playwright install chromium");
  process.exit(2);
}

if (!flag("--no-build")) {
  console.log("Building the program and the page …");
  const run = (command, commandArgs) => execFileSync(command, commandArgs, { cwd: root, stdio: "inherit" });
  run("cargo", ["build", "-p", "slides-cli"]);
  run("node", ["scripts/build-wasm.mjs", "--if-stale"]);
  run("pnpm", ["--filter", "@kasten-slides/dev", "build"]);
  if (chosen.includes("kasten")) run("pnpm", ["-C", "app", "build"]);
}

const space = workspace();
console.log(`Decks and screenshots go to ${space.dir}`);
const server = await startServer({ decks: space.decks, page: join(root, "packages/slides-dev/dist") });
const browser = await playwright.chromium.launch({
  headless: !flag("--headed"),
  executablePath: chromiumPath(),
  // A clip in the talk plays without anyone having clicked in the page.
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const { check, results, failed } = checks();
/** The browser preview of Kasten, started the first time a scenario asks for it. */
let preview = null;
const previewBase = async () => (preview ??= await startPreview()).base;

try {
  for (const name of chosen) {
    console.log(`\n${name}`);
    const scenario = await SCENARIOS[name]();
    try {
      await scenario.run({ browser, base: server.base, previewBase, decks: space.decks, shots: space.shots, check });
    } catch (error) {
      check(`${name} ran to the end`, false, error instanceof Error ? error.message.split("\n")[0] : String(error));
    }
  }
} finally {
  await browser.close();
  server.stop();
  preview?.stop();
}

const bad = failed();
console.log(`\n${results.length - bad.length} of ${results.length} checks held.`);
for (const r of bad) console.log(`  FAILED: ${r.name}${r.detail ? ` (${r.detail})` : ""}`);
process.exit(bad.length === 0 ? 0 : 1);
