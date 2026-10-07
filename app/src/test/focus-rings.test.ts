// Keyboard focus is always visible: the app's one focus ring (styles.css)
// covers buttons, links, selects, checkboxes and radios, and no select or
// checkbox turns its outline off without a ring of its own.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = [join(process.cwd(), "src"), join(process.cwd(), "app", "src")].find((dir) => existsSync(join(dir, "main.tsx")))!;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

describe("focus rings", () => {
  it("are drawn for selects, checkboxes and radios as for buttons", () => {
    const css = readFileSync(join(SRC, "styles.css"), "utf8");
    const rule = /:where\(([^)]*)\):focus-visible\s*\{\s*outline: 2px solid/.exec(css);
    expect(rule?.[1]).toBeDefined();
    for (const part of ["button", "select", 'input[type="checkbox"]', 'input[type="radio"]']) expect(rule![1]).toContain(part);
  });

  it("are not turned off on a select or checkbox without a ring in their place", () => {
    const hidden = files(SRC).flatMap((path) => {
      const text = readFileSync(path, "utf8");
      // A tag's attributes run to the next "<", past any "=>" inside them.
      return [...text.matchAll(/<(select|input)\b([^<]*)/g)]
        .filter(([, tag, attrs]) => tag === "select" || /type="(?:checkbox|radio)"/.test(attrs!))
        .filter(([, , attrs]) => {
          const classes = /className="([^"]*)"/.exec(attrs!)?.[1] ?? "";
          return /\boutline-none\b/.test(classes) && !/\bfocus(?:-visible)?:(?:ring|outline|border)/.test(classes);
        })
        .map((m) => `${relative(SRC, path)}:${text.slice(0, m.index).split("\n").length}`);
    });
    expect(hidden).toEqual([]);
  });
});
