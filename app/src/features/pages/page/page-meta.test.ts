import { describe, expect, it } from "vitest";

import { readPageMeta, setPageMeta, yamlScalar } from "./page-meta";

describe("readPageMeta", () => {
  it("reads plain, quoted and commented values", () => {
    const prefix = [
      "---",
      "id: 01J8Z3K6Q2M4X7V9B1C5D8E0F2",
      'title: "Diff metric: a \\"study\\""',
      "icon: bulb        # name from the icon set",
      "cover: 'it''s blue'",
      "props:",
      "  title: nested, not the page title",
      "---",
      "",
    ].join("\n");
    expect(readPageMeta(prefix)).toEqual({ title: 'Diff metric: a "study"', icon: "bulb", cover: "it's blue" });
  });

  it("reads CRLF frontmatter and misses nothing when it is absent", () => {
    expect(readPageMeta("---\r\ntitle: Hello\r\n---\r\n").title).toBe("Hello");
    expect(readPageMeta("")).toEqual({ title: "", icon: "", cover: "" });
  });
});

describe("setPageMeta", () => {
  const prefix = "---\nid: 1\ntitle: Old  title\nicon: bulb        # name from the icon set\nunknown:   {kept: exactly}\n---\n";

  it("rewrites only the changed key's line", () => {
    expect(setPageMeta(prefix, "title", "New title")).toBe(prefix.replace("title: Old  title", "title: New title"));
  });

  it("keeps a trailing comment on the line", () => {
    expect(setPageMeta(prefix, "icon", "💡")).toBe(prefix.replace("icon: bulb ", "icon: 💡 "));
  });

  it("adds a missing key before the closing fence, and removes one", () => {
    const added = setPageMeta(prefix, "cover", "gradient-dawn");
    expect(added).toBe(prefix.replace("{kept: exactly}\n---", "{kept: exactly}\ncover: gradient-dawn\n---"));
    expect(setPageMeta(added, "cover", null)).toBe(prefix);
  });

  it("creates frontmatter when the note has none, after a byte order mark", () => {
    expect(setPageMeta("", "title", "Hi")).toBe("---\ntitle: Hi\n---\n");
    expect(setPageMeta("﻿", "icon", "📝", "\r\n")).toBe("﻿---\r\nicon: 📝\r\n---\r\n");
    expect(setPageMeta("", "icon", null)).toBe("");
  });

  it("keeps CRLF line endings", () => {
    expect(setPageMeta("---\r\ntitle: A\r\n---\r\n", "title", "B")).toBe("---\r\ntitle: B\r\n---\r\n");
  });

  it("replaces a block scalar with all its lines", () => {
    const block = "---\ntitle: |\n  Two\n  lines\nid: 2\n---\n";
    expect(setPageMeta(block, "title", "One")).toBe("---\ntitle: One\nid: 2\n---\n");
  });

  it("writes values that read back the same", () => {
    for (const value of ["plain", "a: b", " lead", "#hash", "true", "💡", 'say "hi"', "back\\slash", "- dash", "it's", "1.5"]) {
      expect(readPageMeta(setPageMeta("", "title", value)).title).toBe(value);
    }
  });
});

describe("yamlScalar", () => {
  it("quotes only when YAML would read the text differently", () => {
    expect(yamlScalar("Welcome to Kasten")).toBe("Welcome to Kasten");
    expect(yamlScalar("💡")).toBe("💡");
    expect(yamlScalar("a: b")).toBe('"a: b"');
    expect(yamlScalar("null")).toBe('"null"');
    expect(yamlScalar("")).toBe('""');
  });

  it("quotes what YAML 1.1 reads as a boolean or a number, as kasten-core does", () => {
    for (const value of ["y", "N", "0x1F", "0o7", "0b1", "1_000", "+.inf", ".NaN"]) expect(yamlScalar(value), value).toBe(JSON.stringify(value));
  });

  it("escapes the characters YAML does not allow as they are", () => {
    expect(yamlScalar("a\u0001b")).toBe('"a\\u0001b"');
    expect(yamlScalar("a\u007fb")).toBe('"a\\u007fb"');
    expect(yamlScalar("a\u009fb")).toBe('"a\\u009fb"');
    expect(yamlScalar("\ufeffx")).toBe('"\\ufeffx"');
    expect(yamlScalar("x\ufffe")).toBe('"x\\ufffe"');
    // Other letters stay as they are.
    expect(yamlScalar("Café · 日本語")).toBe("Café · 日本語");
  });
});
