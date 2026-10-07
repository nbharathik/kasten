import assert from "node:assert/strict";
import { test } from "node:test";

import { buildArgs } from "./build-installers.mjs";
import { toSign } from "./sign-updates.mjs";

test("builds with the release config, and the throwaway public key only when the app has none", () => {
  const own = buildArgs({ target: "x86_64-pc-windows-msvc", pubkey: "UkVBTCBLRVk=", throwawayPub: "VEhST1dBV0FZ" });
  assert.deepEqual(own, ["build", "--target", "x86_64-pc-windows-msvc", "--config", "src-tauri/tauri.release.conf.json"]);
  const none = buildArgs({ target: "aarch64-apple-darwin", pubkey: " ", throwawayPub: "VEhST1dBV0FZ" });
  assert.equal(none.at(-2), "--config");
  assert.deepEqual(JSON.parse(none.at(-1)), { plugins: { updater: { pubkey: "VEhST1dBV0FZ" } } });
});

test("signs only the files apps update from", () => {
  const names = [
    "Kasten_0.1.0_x64.dmg",
    "Kasten_0.1.0_aarch64.app.tar.gz",
    "Kasten_0.1.0_x64-setup.exe",
    "Kasten_0.1.0_x64_en-US.msi",
    "Kasten_0.1.0_amd64.deb",
    "Kasten-0.1.0-1.x86_64.rpm",
    "kasten-cli-v0.1.0-linux-x64.tar.gz",
    "kasten-cli-v0.1.0-windows-x64.zip",
  ];
  assert.deepEqual(toSign(names), [
    "Kasten-0.1.0-1.x86_64.rpm",
    "Kasten_0.1.0_aarch64.app.tar.gz",
    "Kasten_0.1.0_amd64.deb",
    "Kasten_0.1.0_x64-setup.exe",
    "Kasten_0.1.0_x64_en-US.msi",
  ]);
  assert.throws(() => toSign(["Kasten_0.1.0_x64.dmg"]), /No files installed apps update from/);
});
