// Builds the installers for one target without the updater's key. The
// bundler makes the files apps update from (a Mac's .app.tar.gz) only
// when it has a signing key, so it gets one made for this build, whose
// signatures are then deleted: the release's signing job signs the files
// with the real key, which never meets a build. Until the owner adds the
// updater's public key to the app, a dry run builds with the throwaway
// key's public half in its place.
//
// Usage: node scripts/build-installers.mjs <target triple>

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** The `tauri build` arguments for `target`: the release config, and the
 * throwaway public key when the app has none of its own yet. */
export function buildArgs({ target, pubkey, throwawayPub }) {
  const args = ["build", "--target", target, "--config", "src-tauri/tauri.release.conf.json"];
  if (!pubkey.trim()) args.push("--config", JSON.stringify({ plugins: { updater: { pubkey: throwawayPub } } }));
  return args;
}

/** Every signature file under `dir`. */
function signatures(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return signatures(path);
    return name.endsWith(".sig") ? [path] : [];
  });
}

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: build-installers.mjs <target triple>");
    process.exit(2);
  }
  const cli = resolve("app/node_modules/@tauri-apps/cli/tauri.js");
  const tauri = (args, env = {}, stdio = "inherit") => execFileSync(process.execPath, [cli, ...args], { cwd: "app", stdio, env: { ...process.env, ...env } });
  const scratch = mkdtempSync(join(process.env.RUNNER_TEMP || tmpdir(), "kasten-build-key-"));
  const key = join(scratch, "throwaway.key");
  try {
    tauri(["signer", "generate", "--ci", "--password", "", "--write-keys", key], {}, ["ignore", "ignore", "inherit"]);
    const pubkey = JSON.parse(readFileSync("app/src-tauri/tauri.conf.json", "utf8")).plugins?.updater?.pubkey ?? "";
    tauri(buildArgs({ target, pubkey, throwawayPub: readFileSync(`${key}.pub`, "utf8").trim() }), {
      TAURI_SIGNING_PRIVATE_KEY: readFileSync(key, "utf8"),
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "",
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  // The throwaway key's signatures go with it.
  for (const sig of signatures(join("target", target, "release", "bundle"))) rmSync(sig);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
