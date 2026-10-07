// @vitest-environment node
import { describe, expect, it } from "vitest";

import { fileNameOf } from "./exporting.ts";

describe("the name of an exported file", () => {
  it("is the deck's title with the extension", () => {
    expect(fileNameOf("Tool use in language models", "pptx")).toBe("Tool use in language models.pptx");
  });

  it("takes out what a file system refuses, and control characters", () => {
    expect(fileNameOf('a/b\\c:d*e?f"g<h>i|j', "pptx")).toBe("a b c d e f g h i j.pptx");
    expect(fileNameOf("line\none\ttwo", "md")).toBe("line one two.md");
  });

  it("does not start with a dot, is never empty and is not too long", () => {
    expect(fileNameOf("..hidden", "pptx")).toBe("hidden.pptx");
    expect(fileNameOf("   ", "pptx")).toBe("Untitled deck.pptx");
    expect(fileNameOf("x".repeat(300), "pptx").length).toBeLessThanOrEqual(85);
  });
});
