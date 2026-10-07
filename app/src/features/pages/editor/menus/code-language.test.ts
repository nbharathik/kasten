import { describe, expect, it } from "vitest";

import { fenceName, rankLanguages, type Language } from "./code-language";

const ALL: Language[] = [
  { name: "C", alias: [] },
  { name: "C++", alias: ["cpp"] },
  { name: "C#", alias: ["csharp", "cs"] },
  { name: "JavaScript", alias: ["ecmascript", "js", "node"] },
  { name: "Rust", alias: ["rs"] },
  { name: "TypeScript", alias: ["ts"] },
  { name: "Shell", alias: ["bash", "sh"] },
];

describe("the code block's language picker", () => {
  it("finds the language already chosen, and by alias", () => {
    // Crepe's own list found nothing when the query named the current language.
    expect(rankLanguages(ALL, "rust").map((l) => l.name)).toEqual(["Rust"]);
    expect(rankLanguages(ALL, "RS")[0]!.name).toBe("Rust");
    expect(rankLanguages(ALL, "bash")[0]!.name).toBe("Shell");
    expect(rankLanguages(ALL, "script").map((l) => l.name)).toEqual(["JavaScript", "TypeScript"]);
  });

  it("puts an exact name first, then names that start with the query", () => {
    expect(rankLanguages(ALL, "c").map((l) => l.name).slice(0, 3)).toEqual(["C", "C#", "C++"]);
    expect(rankLanguages(ALL, "ts")[0]!.name).toBe("TypeScript");
    expect(rankLanguages(ALL, "").length).toBe(ALL.length);
    expect(rankLanguages(ALL, "cobol")).toEqual([]);
  });

  it("stores the short name a fence keeps", () => {
    expect(fenceName(ALL[4]!)).toBe("rust");
    expect(fenceName(ALL[1]!)).toBe("cpp");
    expect(fenceName(ALL[2]!)).toBe("csharp");
    expect(fenceName(ALL[3]!)).toBe("javascript");
  });
});
