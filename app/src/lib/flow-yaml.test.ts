import { describe, expect, it } from "vitest";

import { readFlow, writeFlow } from "./flow-yaml";

describe("one-line YAML", () => {
  it("quotes what would end a plain value inside a flow list or map", () => {
    const values = ["travel", "a, b", "[x]", "{y}", "c]", "d: e", "#f", "plain words", "sources/My paper (v2), draft {final} #3.pdf"];
    expect(writeFlow(values)).toBe('[travel, "a, b", "[x]", "{y}", "c]", "d: e", "#f", plain words, "sources/My paper (v2), draft {final} #3.pdf"]');
    expect(readFlow(writeFlow(values))).toEqual(values);
    expect(readFlow(writeFlow({ file: values.at(-1), page: 3 }))).toEqual({ file: values.at(-1), page: 3 });
  });

  it("reads quotes with escapes, single or double", () => {
    expect(readFlow(`{file: "a \\"b\\", c.pdf", note: 'it''s, here'}`)).toEqual({ file: 'a "b", c.pdf', note: "it's, here" });
  });
});
