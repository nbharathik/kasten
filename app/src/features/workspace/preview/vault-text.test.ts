import { describe, expect, it } from "vitest";

import { bodyFacts, newId, newestFirst, readableLine } from "./vault-text";

describe("preview excerpts", () => {
  it("match the core's: no tables or equations, no emphasis marks", () => {
    // The same body as extract_tests.rs, "leaves_tables_and_equations_out_of_excerpts".
    const body = "Intro line.\n\n| Phase | Goal |\n| --- | --- |\n| 1 | Parse |\n\n$$\nE = mc^2\n$$\n\n$$ x^2 $$\n\nSome _italic_ and *more* text, snake_case kept and 2*3 too.\n";
    expect(bodyFacts(body).excerpt).toBe("Intro line. Some italic and more text, snake_case kept and 2*3 too.");
  });

  it("read inline math as its TeX, as the core does (extract_tests.rs)", () => {
    const cases: [string, string][] = [
      ["Where $D$ is the set of duplicate pairs.", "Where D is the set of duplicate pairs."],
      ["- [ ] Prove $x > 0$ first", "Prove x > 0 first"],
      ["a $$x^2$$ b", "a x^2 b"],
      ["costs $5$", "costs 5"],
      ["Pay $5 and $10 today", "Pay $5 and $10 today"],
      ["from $5 to $ 6", "from $5 to $ 6"],
      ["an $ unclosed one", "an $ unclosed one"],
      ["empty $$ here", "empty $$ here"],
      [String.raw`$\frac{*a*}{[[b]]}$`, String.raw`\frac{*a*}{[[b]]}`],
      // Only punctuation is escaped: TeX and Windows paths keep their backslashes.
      [String.raw`Area $\pi r^2$ in C:\Users, not \$5 or \*this\*`, String.raw`Area \pi r^2 in C:\Users, not $5 or *this*`],
    ];
    for (const [line, read] of cases) expect(readableLine(line)).toBe(read);
  });
});

describe("preview ids", () => {
  it("rise within a millisecond, so the newest sorts first", () => {
    const at = Date.UTC(2026, 8, 24, 8, 0, 0);
    const ids = Array.from({ length: 50 }, () => newId(at));
    expect(ids.every((id) => /^[0-9A-HJKMNP-TV-Z]{26}$/.test(id))).toBe(true);
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(50);
    const later = newId(at + 1);
    expect(later > ids[49]!).toBe(true);
    const versions = [...ids, later].map((id, i) => ({ id, time: i === 50 ? at + 1 : at }));
    expect([...versions].reverse().sort(newestFirst).map((v) => v.id)).toEqual([later, ...[...ids].reverse()]);
  });

  it("reads a code fence as closed only by a plain line of at least its length", () => {
    const body = "Before.\n````\ncode\n```\nstill code\n```` \nAfter the code.\n";
    expect(bodyFacts(body).excerpt).toBe("Before. After the code.");
  });
});
