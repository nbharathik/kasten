// Fails unless a release tag such as v0.2.0 names the version every package
// carries: the Cargo workspace (which the app, CLI and MCP server inherit),
// the app's package.json and, if it ever sets one, tauri.conf.json.
// Usage: node scripts/check-version.mjs v0.2.0
//        node scripts/check-version.mjs --print   (the workspace's version)

import { readFileSync } from "node:fs";

const cargo = readFileSync("Cargo.toml", "utf8");
const workspace = /^\[workspace\.package\][^[]*?^version\s*=\s*"([^"]*)"/m.exec(cargo)?.[1];

const tag = process.argv[2];
if (tag === "--print") {
  if (!workspace) process.exit(1);
  console.log(workspace);
  process.exit(0);
}
if (!tag) {
  console.error("usage: check-version.mjs <tag> | --print");
  process.exit(2);
}
// Plain x.y.z: Windows installers (MSI) refuse pre-release versions.
const match = /^v(\d+\.\d+\.\d+)$/.exec(tag);
if (!match) {
  console.error(`${tag} is not a release tag like v1.2.3`);
  process.exit(1);
}
const wanted = match[1];

const found = {
  "Cargo.toml [workspace.package]": workspace,
  "app/package.json": JSON.parse(readFileSync("app/package.json", "utf8")).version,
};
const tauri = JSON.parse(readFileSync("app/src-tauri/tauri.conf.json", "utf8")).version;
if (tauri !== undefined) found["app/src-tauri/tauri.conf.json"] = tauri;

let ok = true;
for (const [file, version] of Object.entries(found)) {
  const same = version === wanted;
  ok &&= same;
  console.log(`${same ? "ok  " : "FAIL"} ${file}: ${version ?? "no version"}`);
}
if (!ok) console.error(`The tag says ${wanted}; set that version in each of these first.`);
process.exit(ok ? 0 : 1);
