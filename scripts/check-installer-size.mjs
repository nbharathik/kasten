// Fails if any installer under <bundle dir> exceeds <limit> megabytes
// (Kasten's budget is 30 MB).
// Usage: node scripts/check-installer-size.mjs target/release/bundle 30

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const [dir, limitArg] = process.argv.slice(2);
if (!dir || !limitArg) {
  console.error("usage: check-installer-size.mjs <bundle dir> <limit in MB>");
  process.exit(2);
}
const limit = Number(limitArg) * 1024 * 1024;
const installers = /\.(deb|rpm|msi|exe|dmg|AppImage)$/;

function walk(path) {
  return readdirSync(path).flatMap((entry) => {
    const full = join(path, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const found = walk(dir).filter((f) => installers.test(f));
if (found.length === 0) {
  console.error(`no installers under ${dir}`);
  process.exit(1);
}
let ok = true;
for (const file of found) {
  const size = statSync(file).size;
  const mb = (size / 1024 / 1024).toFixed(1);
  const within = size <= limit;
  ok &&= within;
  console.log(`${within ? "ok  " : "FAIL"} ${mb} MB  ${file}`);
}
process.exit(ok ? 0 : 1);
