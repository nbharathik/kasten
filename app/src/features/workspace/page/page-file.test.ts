import { describe, expect, it } from "vitest";

import { markdownToCopy } from "./page-file";

describe("copying a page as Markdown", () => {
  it("leads with the title and leaves Kasten's frontmatter out", () => {
    const text = "---\nid: 01J\ntitle: Trip plans\ntags: [travel]\n---\n\nTrain to Lyon.\n\n- [ ] Book seats\n";
    expect(markdownToCopy("Trip plans", text)).toBe("# Trip plans\n\nTrain to Lyon.\n\n- [ ] Book seats\n");
  });

  it("keeps a heading the page already starts with", () => {
    expect(markdownToCopy("Trip", "---\ntitle: Trip\n---\n# Trip to Lyon\nBy train.\n")).toBe("# Trip to Lyon\nBy train.\n");
  });

  it("copies a page with no body as its title", () => {
    expect(markdownToCopy("Empty", "---\ntitle: Empty\n---\n")).toBe("# Empty\n");
  });
});
