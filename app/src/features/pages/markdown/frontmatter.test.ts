import { describe, expect, it } from "vitest";

import { bodyUnder, splitFrontmatter } from "./frontmatter";

describe("splitFrontmatter", () => {
  it("splits a normal note after the closing fence line", () => {
    const text = "---\ntitle: A\n---\nBody\n";
    expect(splitFrontmatter(text)).toEqual({ prefix: "---\ntitle: A\n---\n", body: "Body\n" });
  });

  it("keeps CRLF line endings inside the prefix", () => {
    const text = "---\r\ntitle: A\r\n---\r\nBody\r\n";
    expect(splitFrontmatter(text)).toEqual({ prefix: "---\r\ntitle: A\r\n---\r\n", body: "Body\r\n" });
  });

  it("keeps a byte order mark in the prefix", () => {
    const text = "﻿---\nt: 1\n---\nB";
    expect(splitFrontmatter(text)).toEqual({ prefix: "﻿---\nt: 1\n---\n", body: "B" });
    expect(splitFrontmatter("﻿No frontmatter")).toEqual({ prefix: "﻿", body: "No frontmatter" });
  });

  it("ignores indented fences inside block scalars", () => {
    const text = "---\nnotes: |\n  ---\n  still yaml\n---\nBody";
    expect(splitFrontmatter(text).body).toBe("Body");
  });

  it("treats an unterminated block as body", () => {
    const text = "---\ntitle: never closed\n\nText\n";
    expect(splitFrontmatter(text)).toEqual({ prefix: "", body: text });
  });

  it("handles a closing fence at end of file and an empty body", () => {
    expect(splitFrontmatter("---\nt: 1\n---")).toEqual({ prefix: "---\nt: 1\n---", body: "" });
    expect(splitFrontmatter("---\n---\n")).toEqual({ prefix: "---\n---\n", body: "" });
  });

  it("only recognises frontmatter at the very top", () => {
    const text = "Intro\n\n---\ntitle: x\n---\n";
    expect(splitFrontmatter(text)).toEqual({ prefix: "", body: text });
  });

  it("never loses or reorders bytes", () => {
    for (const text of ["", "---", "---\n", "---\nx\n---\n---\n", "﻿", "a\r\n---\r\n"]) {
      const { prefix, body } = splitFrontmatter(text);
      expect(prefix + body).toBe(text);
    }
  });
});

describe("bodyUnder", () => {
  it("writes a rule that would open frontmatter as ***, as kasten-core does", () => {
    const body = "---\nIntro\n\n---\nMore\n";
    expect(bodyUnder("", body)).toBe("***\nIntro\n\n---\nMore\n");
    expect(bodyUnder("\uFEFF", "--- \r\nA\r\n---\r\n")).toBe("*** \r\nA\r\n---\r\n");
    expect(splitFrontmatter(bodyUnder("", body)).prefix).toBe("");
  });

  it("leaves a lone rule, other rules and bodies under frontmatter as they are", () => {
    expect(bodyUnder("", "---\nIntro\n")).toBe("---\nIntro\n");
    expect(bodyUnder("", "----\nA\n---\n")).toBe("----\nA\n---\n");
    expect(bodyUnder("", "\uFEFFA\n---\n")).toBe("\uFEFFA\n---\n");
    expect(bodyUnder("---\ntitle: T\n---\n", "---\nA\n---\n")).toBe("---\nA\n---\n");
  });
});
