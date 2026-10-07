// Motion comes from three lengths and one easing (styles.css), so the
// motion setting can turn all of it off at once. Nothing that shows typing
// ever animates: a keystroke must land at once.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/** The app's sources; the tests run from `app/`. */
const SRC = [join(process.cwd(), "src"), join(process.cwd(), "app", "src")].find((dir) => existsSync(join(dir, "main.tsx")))!;

function files(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, pattern);
    return pattern.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const STYLES = files(SRC, /\.css$/);
const SCRIPTS = files(SRC, /\.tsx$/);
const where = (path: string, text: string, index: number) => `${relative(SRC, path).replaceAll("\\", "/")}:${text.slice(0, index).split("\n").length}`;

/** Rules as written: the selector just before a block and the block's own declarations. */
function rules(text: string): { selector: string; body: string; index: number }[] {
  // Comments become spaces, keeping every index where it was.
  const bare = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
  return [...bare.matchAll(/([^{};]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1]!.trim(), body: m[2]!, index: m.index! }));
}

describe("motion tokens", () => {
  it("time every short transition and animation with the motion tokens", () => {
    const literal = STYLES.flatMap((path) => {
      const text = readFileSync(path, "utf8");
      return [...text.matchAll(/(?<![\w-])(?:transition|animation)(?:-duration)?\s*:([^;{}]+);/g)]
        .filter((m) =>
          // Under a millisecond is the off switch itself.
          [...m[1]!.matchAll(/(?<![\w.-])(\d+(?:\.\d+)?)(ms|s)\b/g)].some(([, n, unit]) => {
            const ms = unit === "s" ? Number(n) * 1000 : Number(n);
            return ms >= 1 && ms <= 300;
          }),
        )
        .map((m) => `${where(path, text, m.index!)} ${m[0].replace(/\s+/g, " ")}`);
    });
    expect(literal).toEqual([]);
  });

  it("drop every length to nothing when motion is off", () => {
    const styles = readFileSync(join(SRC, "styles.css"), "utf8");
    const off = rules(styles).find((r) => r.selector === ':root[data-motion="off"]');
    expect(off?.body).toMatch(/--motion-fast:\s*0ms/);
    expect(off?.body).toMatch(/--motion-base:\s*0ms/);
    expect(off?.body).toMatch(/--motion-slow:\s*0ms/);
    expect(styles).toMatch(/:root\[data-motion="off"\] \*[^{]*\{[^}]*transition-duration:\s*0\.01ms !important/);
  });

  it("never animate text as it is typed", () => {
    // The editor's text, the page title and the capture boxes.
    const typing = /\.ProseMirror(?:\s+(?:p|h[1-6]|li|ul|ol|blockquote|pre|code|span|strong|em|a)\b[^,]*)?\s*(?:,|$)|\.kasten-page-title\b|\.kasten-capture-text\b/;
    const moving = STYLES.flatMap((path) => {
      const text = readFileSync(path, "utf8");
      return rules(text)
        .filter((r) => typing.test(r.selector) && /(?:^|;|\s)(?:transition|animation)\s*:/.test(r.body))
        .map((r) => `${where(path, text, r.index)} ${r.selector}`);
    });
    expect(moving).toEqual([]);

    // Text fields in the views: no transition or animation classes.
    const fields = SCRIPTS.flatMap((path) => {
      const text = readFileSync(path, "utf8");
      return [...text.matchAll(/<(?:textarea|input)\b(?:(?!<)[\s\S]){0,800}?className=(?:"([^"]*)"|\{`([^`]*)`\})/g)]
        .filter((m) => /(?:^|\s)(?:transition(?:-[\w[\],-]+)?|animate-[\w-]+)(?=\s|$)/.test(m[1] ?? m[2] ?? ""))
        .map((m) => where(path, text, m.index!));
    });
    expect(fields).toEqual([]);
  });
});
