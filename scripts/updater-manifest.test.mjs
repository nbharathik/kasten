import assert from "node:assert/strict";
import { test } from "node:test";

import { OPTIONAL, PLATFORMS, manifest, signatureVersion } from "./updater-manifest.mjs";

/** The files a v0.3.0 release carries, as the workflow names them. */
const INSTALLERS = [
  "Kasten_0.3.0_aarch64.app.tar.gz",
  "Kasten_0.3.0_x64.app.tar.gz",
  "Kasten_0.3.0_x64-setup.exe",
  "Kasten_0.3.0_x64_en-US.msi",
  "Kasten_0.3.0_amd64.deb",
  "Kasten-0.3.0-1.x86_64.rpm",
];
const OTHERS = [
  "Kasten_0.3.0_aarch64.dmg",
  "Kasten_0.3.0_x64.dmg",
  "kasten-cli-v0.3.0-linux-x64.tar.gz",
  "kasten-cli-v0.3.0-macos-arm64.tar.gz",
  "kasten-cli-v0.3.0-windows-x64.zip",
];
const signed = (files) => files.flatMap((name) => [name, `${name}.sig`]);
/** A signature as the Tauri CLI writes it: base64 of minisign's text. */
const sigFor = (name, version = "0.3.0") =>
  Buffer.from(`untrusted comment: signature from tauri secret key\nRUQ=\ntrusted comment: timestamp:1790000000\tfile:${name}\tversion:${version}\nR0xP\n`).toString("base64");
const read = (name) => `${sigFor(name.replace(/\.sig$/, ""))}\n`;
const at = new Date("2026-10-01T09:00:00.123Z");

test("lists every platform with its installer and signature", () => {
  const out = manifest({ names: [...signed(INSTALLERS), ...OTHERS], read, tag: "v0.3.0", repo: "example/kasten", now: at });
  assert.equal(out.version, "0.3.0");
  assert.equal(out.pub_date, "2026-10-01T09:00:00Z");
  assert.match(out.notes, /releases\/tag\/v0\.3\.0$/);
  assert.deepEqual(
    Object.keys(out.platforms).sort(),
    Object.keys(PLATFORMS)
      .filter((key) => !OPTIONAL.has(key))
      .sort(),
  );
  assert.deepEqual(out.platforms["darwin-aarch64"], {
    url: "https://github.com/example/kasten/releases/download/v0.3.0/Kasten_0.3.0_aarch64.app.tar.gz",
    signature: sigFor("Kasten_0.3.0_aarch64.app.tar.gz"),
  });
  assert.equal(out.platforms["darwin-x86_64"].url.split("/").pop(), "Kasten_0.3.0_x64.app.tar.gz");
  assert.equal(out.platforms["windows-x86_64"].url, out.platforms["windows-x86_64-nsis"].url);
  assert.equal(out.platforms["windows-x86_64-msi"].url.split("/").pop(), "Kasten_0.3.0_x64_en-US.msi");
  assert.equal(out.platforms["linux-x86_64-rpm"].url.split("/").pop(), "Kasten-0.3.0-1.x86_64.rpm");
});

test("has no bare Linux key, so an install of unknown kind finds nothing", () => {
  const out = manifest({ names: signed(INSTALLERS), read, tag: "v0.3.0", repo: "example/kasten", now: at });
  assert.equal(out.platforms["linux-x86_64"], undefined);
});

test("fails, naming each problem, when an installer or signature is missing", () => {
  const names = signed(INSTALLERS)
    .filter((name) => name !== "Kasten_0.3.0_amd64.deb.sig")
    .filter((name) => !name.includes(".msi"));
  assert.throws(
    () => manifest({ names, read, tag: "v0.3.0", repo: "example/kasten" }),
    (err) => /windows-x86_64-msi: no installer/.test(err.message) && /linux-x86_64-deb: .*has no signature/.test(err.message),
  );
});

test("fails on two installers for one platform, and on a tag that is not a release", () => {
  const names = signed([...INSTALLERS, "Kasten_0.2.9_amd64.deb"]);
  assert.throws(() => manifest({ names, read, tag: "v0.3.0", repo: "example/kasten" }), /several installers/);
  assert.throws(() => manifest({ names: signed(INSTALLERS), read, tag: "v0.3.0-beta.1", repo: "example/kasten" }), /not a release tag/);
  assert.throws(() => manifest({ names: signed(INSTALLERS), read, tag: "v0.3.0", repo: "not a repo" }), /owner\/repo/);
});

test("lists an AppImage only when the release has one", () => {
  const out = manifest({ names: signed([...INSTALLERS, "Kasten_0.3.0_amd64.AppImage"]), read, tag: "v0.3.0", repo: "example/kasten", now: at });
  assert.equal(out.platforms["linux-x86_64-appimage"].url.split("/").pop(), "Kasten_0.3.0_amd64.AppImage");
  assert.equal(manifest({ names: signed(INSTALLERS), read, tag: "v0.3.0", repo: "example/kasten" }).platforms["linux-x86_64-appimage"], undefined);
});

test("fails on a signature bound to another version, or to none", () => {
  assert.equal(signatureVersion(sigFor("a.deb", "1.2.3")), "1.2.3");
  const stale = (name) => (name === "Kasten_0.3.0_amd64.deb.sig" ? sigFor("Kasten_0.3.0_amd64.deb", "0.2.9") : read(name));
  assert.throws(() => manifest({ names: signed(INSTALLERS), read: stale, tag: "v0.3.0", repo: "example/kasten" }), /linux-x86_64-deb: .* signed for version 0\.2\.9, not 0\.3\.0/);
  const unbound = Buffer.from("untrusted comment: x\nRUQ=\ntrusted comment: timestamp:1\tfile:a.msi\nR0xP\n").toString("base64");
  assert.equal(signatureVersion(unbound), null);
  const none = (name) => (name.endsWith(".msi.sig") ? unbound : read(name));
  assert.throws(() => manifest({ names: signed(INSTALLERS), read: none, tag: "v0.3.0", repo: "example/kasten" }), /signed for no version/);
});
