// Checks, before the release builds start, that a release has what the
// builds need:
//
// - the updater's public key in app/src-tauri/tauri.conf.json;
// - the client id of the GitHub app behind "Sign in with GitHub", as a
//   variable of the repository.
//
// A tag build fails without them; a dry run only warns. The private key
// never reaches a build: the signing job, which alone holds it, checks it.
//
// Usage: KASTEN_GITHUB_CLIENT_ID=… node scripts/check-release-inputs.mjs [--tag]

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** What a release is missing, in words, given the environment and the
 * app's Tauri config. */
export function missingInputs({ env, config }) {
  const missing = [];
  const pubkey = config?.plugins?.updater?.pubkey?.trim() ?? "";
  if (!pubkey) {
    missing.push("plugins.updater.pubkey in app/src-tauri/tauri.conf.json: the key's public half");
  } else if (!Buffer.from(pubkey, "base64").toString("utf8").includes("minisign public key")) {
    missing.push("plugins.updater.pubkey in app/src-tauri/tauri.conf.json is not a public key made by `tauri signer generate`");
  }
  if (!env.KASTEN_GITHUB_CLIENT_ID?.trim()) {
    missing.push("KASTEN_GITHUB_CLIENT_ID: the GitHub app's client id, as a variable of the repository");
  }
  return missing;
}

function main() {
  const tag = process.argv.includes("--tag");
  const config = JSON.parse(readFileSync("app/src-tauri/tauri.conf.json", "utf8"));
  const missing = missingInputs({ env: process.env, config });
  if (!missing.length) {
    console.log("The release builds have everything they need.");
    return;
  }
  const list = missing.map((item) => `- ${item}`).join("\n");
  if (tag) {
    console.error(`A release needs these first:\n${list}`);
    process.exit(1);
  }
  console.log(`A dry run goes on without these:\n${list}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
