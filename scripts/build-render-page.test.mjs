import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { pageBuildCommand } from "./build-render-page.mjs";

test("the render page launches Vite directly without a platform shell shim", () => {
  const { command, args } = pageBuildCommand();
  assert.equal(command, process.execPath);
  assert.equal(args[1], "build");
  assert.ok(existsSync(args[0]));
  assert.match(args[0], /[\\/]vite[\\/]bin[\\/]vite\.js$/);
});
