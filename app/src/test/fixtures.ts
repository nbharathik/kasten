// Reads the byte-exact test inputs in the repository's fixtures/ folder.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export interface Fixture {
  /** Path relative to fixtures/, with forward slashes. */
  name: string;
  text: string;
}

export const FIXTURES_DIR = resolve(import.meta.dirname, "../../../fixtures");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** Every Markdown note in fixtures/roundtrip and fixtures/dev-vault. Fixtures
 * are valid UTF-8 and Node keeps a leading BOM, so string equality is byte
 * equality on disk. */
export function markdownFixtures(): Fixture[] {
  return ["roundtrip", "dev-vault"]
    .flatMap((dir) => walk(join(FIXTURES_DIR, dir)))
    .filter((path) => path.endsWith(".md"))
    .sort()
    .map((path) => ({ name: relative(FIXTURES_DIR, path).split("\\").join("/"), text: readFileSync(path, "utf8") }));
}
