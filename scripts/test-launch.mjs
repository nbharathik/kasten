// The desktop app on test content: a fresh copy of fixtures/dev-vault for
// every launch, so testing never touches the fixture or your own vault and
// always starts from the same sample workspace. A normal launch (no
// KASTEN_VAULT) opens your own vault, which starts blank.
//
//   pnpm -C app tauri:test            the copy is removed when the app quits
//   pnpm -C app tauri:test --keep     the copy stays, to look at its files

import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const keep = process.argv.includes("--keep");
const vault = mkdtempSync(join(tmpdir(), "kasten-test-vault-"));
// The fixture's own history and index are left behind: the copy starts its own.
const skipped = [`${sep}.git`, `${sep}.kasten${sep}cache`];
cpSync(join(root, "fixtures", "dev-vault"), vault, { recursive: true, filter: (src) => !skipped.some((part) => src.includes(part)) });
console.log(`Test vault: ${vault}${keep ? " (kept after the app quits)" : ""}`);

const app = spawn("pnpm", ["-C", join(root, "app"), "tauri", "dev"], {
  stdio: "inherit",
  env: { ...process.env, KASTEN_VAULT: vault },
  // On Windows pnpm is a .cmd shim, which Node starts only through a shell.
  shell: process.platform === "win32",
});
const done = (code) => {
  if (!keep) rmSync(vault, { recursive: true, force: true });
  process.exit(code ?? 0);
};
app.on("exit", done);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => app.kill(signal));
