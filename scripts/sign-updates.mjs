// Signs each file installed apps update from, with the Tauri CLI, bound to
// the release's version. It runs in the release's signing job, the one job
// that holds the updater's key: no build, cache or outside action runs
// there, and the key reaches only this step and the CLI it starts.
//
// Usage: TAURI_SIGNING_PRIVATE_KEY=… [TAURI_SIGNING_PRIVATE_KEY_PASSWORD=…] \
//        node scripts/sign-updates.mjs <folder> <version>

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { isUpdateFile } from "./update-files.mjs";

/** The files in `names` to sign, or why there is nothing to sign. */
export function toSign(names) {
  const files = names.filter(isUpdateFile).sort();
  if (!files.length) throw new Error("No files installed apps update from were found");
  return files;
}

function main() {
  const [folder, version] = process.argv.slice(2);
  if (!folder || !/^\d+\.\d+\.\d+$/.test(version ?? "")) {
    console.error("usage: sign-updates.mjs <folder> <version, like 1.2.3>");
    process.exit(2);
  }
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY?.trim()) {
    console.error("TAURI_SIGNING_PRIVATE_KEY is not set: add it to the `release` environment's secrets.");
    process.exit(1);
  }
  const cli = resolve("app/node_modules/@tauri-apps/cli/tauri.js");
  try {
    for (const file of toSign(readdirSync(folder))) {
      execFileSync(process.execPath, [cli, "signer", "sign", "--app-version", version, resolve(join(folder, file))], {
        stdio: ["ignore", "ignore", "inherit"],
        env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? "" },
      });
      console.log(`signed ${file}`);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
