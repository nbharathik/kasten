// Writes latest.json, the manifest the desktop app's updater reads, from
// a folder of release files: each installer the updater can install, with
// the signature the build made for it (`<file>.sig`). The release workflow
// publishes it beside the installers, so the app finds it at
// releases/latest/download/latest.json once the release is published.
//
// Usage: node scripts/updater-manifest.mjs <folder> <tag> <owner/repo>
// It writes <folder>/latest.json, and fails if any platform is missing an
// installer or its signature, or a signature is bound to another version.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** What each updater key installs: the file that fits, by its name. Linux
 * has no bare key on purpose: an install of unknown kind (built from source)
 * then finds nothing, instead of turning into an AppImage. */
export const PLATFORMS = {
  "darwin-aarch64": (name) => name.endsWith(".app.tar.gz") && /aarch64|arm64/.test(name),
  "darwin-x86_64": (name) => name.endsWith(".app.tar.gz") && /x64|x86_64/.test(name),
  "windows-x86_64": (name) => name.endsWith("-setup.exe") && /x64|x86_64/.test(name),
  "windows-x86_64-nsis": (name) => name.endsWith("-setup.exe") && /x64|x86_64/.test(name),
  "windows-x86_64-msi": (name) => name.endsWith(".msi") && /x64|x86_64/.test(name),
  "linux-x86_64-appimage": (name) => name.endsWith(".AppImage") && /amd64|x86_64/.test(name),
  "linux-x86_64-deb": (name) => name.endsWith(".deb") && /amd64|x86_64/.test(name),
  "linux-x86_64-rpm": (name) => name.endsWith(".rpm") && /x86_64|amd64/.test(name),
};

/** Keys a release may leave out: Kasten ships .deb and .rpm for Linux, and
 * an AppImage only if one is ever built. */
export const OPTIONAL = new Set(["linux-x86_64-appimage"]);

/** The version a signature (a .sig file's base64 text) is bound to. */
export function signatureVersion(sig) {
  const trusted = Buffer.from(sig.trim(), "base64")
    .toString("utf8")
    .split(/\r?\n/)
    .find((line) => line.startsWith("trusted comment: "));
  return (
    trusted
      ?.slice("trusted comment: ".length)
      .split("\t")
      .find((field) => field.startsWith("version:"))
      ?.slice("version:".length) ?? null
  );
}

/** The manifest for the files named in `names`, whose signatures `read`
 * gives. Throws, naming each problem, if a platform has no installer, has
 * two, or has no signature. */
export function manifest({ names, read, tag, repo, now = new Date() }) {
  const version = /^v(\d+\.\d+\.\d+)$/.exec(tag)?.[1];
  if (!version) throw new Error(`${tag} is not a release tag like v1.2.3`);
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`${repo} is not an owner/repo`);
  const problems = [];
  const platforms = {};
  for (const [key, fits] of Object.entries(PLATFORMS)) {
    const found = names.filter((name) => fits(name));
    if (!found.length && OPTIONAL.has(key)) continue;
    if (found.length !== 1) {
      problems.push(`${key}: ${found.length ? `several installers (${found.join(", ")})` : "no installer"}`);
      continue;
    }
    const [file] = found;
    if (!names.includes(`${file}.sig`)) {
      problems.push(`${key}: ${file} has no signature (${file}.sig)`);
      continue;
    }
    const signature = read(`${file}.sig`).trim();
    // The app refuses a signature bound to another version, or to none.
    const bound = signatureVersion(signature);
    if (bound !== version) {
      problems.push(`${key}: ${file} is signed for ${bound ? `version ${bound}` : "no version"}, not ${version}`);
      continue;
    }
    platforms[key] = {
      url: `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(file)}`,
      signature,
    };
  }
  if (problems.length) throw new Error(`The release is not ready for the updater:\n- ${problems.join("\n- ")}`);
  return {
    version,
    notes: `What's new: https://github.com/${repo}/releases/tag/${tag}`,
    pub_date: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    platforms,
  };
}

function main() {
  const [folder, tag, repo] = process.argv.slice(2);
  if (!folder || !tag || !repo) {
    console.error("usage: updater-manifest.mjs <folder> <tag> <owner/repo>");
    process.exit(2);
  }
  try {
    const result = manifest({
      names: readdirSync(folder),
      read: (name) => readFileSync(join(folder, name), "utf8"),
      tag,
      repo,
    });
    writeFileSync(join(folder, "latest.json"), `${JSON.stringify(result, null, 2)}\n`);
    console.log(`latest.json: ${result.version}, ${Object.keys(result.platforms).join(", ")}`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
