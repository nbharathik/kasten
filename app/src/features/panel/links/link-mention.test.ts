import { describe, expect, it } from "vitest";

import { linkMention, protectedRanges } from "./link-mention";

describe("linking an unlinked mention", () => {
  it("links the first plain mention, keeping the text as written when the case differs", () => {
    expect(linkMention("See Related work notes here.\n", "Related work notes")).toBe("See [[Related work notes]] here.\n");
    expect(linkMention("see related Work notes.\n", "Related work notes")).toBe("see [[Related work notes|related Work notes]].\n");
    expect(linkMention("Kasten, then Kasten again.\n", "Kasten")).toBe("[[Kasten]], then Kasten again.\n");
  });

  it("matches whole words only", () => {
    expect(linkMention("Kastenbox and MyKasten\n", "Kasten")).toBeNull();
    expect(linkMention("Kasten_notes, then Kasten's list\n", "Kasten")).toBe("Kasten_notes, then [[Kasten]]'s list\n");
    expect(linkMention("Über uns und über\n", "über")).toBe("[[über|Über]] uns und über\n");
    expect(linkMention("Learn C++ today\n", "C++")).toBe("Learn [[C++]] today\n");
  });

  it("leaves links, code, URLs, math and markup alone", () => {
    const title = "Kasten";
    expect(linkMention("[[Kasten]] and [[Other|Kasten]] and ![[Kasten]]; Kasten\n", title)).toBe("[[Kasten]] and [[Other|Kasten]] and ![[Kasten]]; [[Kasten]]\n");
    expect(linkMention("`Kasten` and ``a ` Kasten`` then Kasten\n", title)).toBe("`Kasten` and ``a ` Kasten`` then [[Kasten]]\n");
    expect(linkMention("```\nKasten\n```\n~~~md\nKasten\n~~~\nKasten\n", title)).toBe("```\nKasten\n```\n~~~md\nKasten\n~~~\n[[Kasten]]\n");
    expect(linkMention("https://example.com/Kasten www.kasten.de <https://x.io/Kasten> Kasten\n", title)).toBe(
      "https://example.com/Kasten www.kasten.de <https://x.io/Kasten> [[Kasten]]\n",
    );
    expect(linkMention("[Kasten](https://k.io) ![Kasten](a.png) [Kasten][ref] Kasten\n", title)).toBe(
      "[Kasten](https://k.io) ![Kasten](a.png) [Kasten][ref] [[Kasten]]\n",
    );
    expect(linkMention("$Kasten$ and $$\nKasten\n$$ and <span title=\"Kasten\">Kasten</span>\n", title)).toBe(
      "$Kasten$ and $$\nKasten\n$$ and <span title=\"Kasten\">[[Kasten]]</span>\n",
    );
  });

  it("returns null when every mention is protected or there is none", () => {
    expect(linkMention("Only `Kasten` and [[Kasten]] here\n", "Kasten")).toBeNull();
    expect(linkMention("Nothing to see\n", "Kasten")).toBeNull();
    expect(linkMention("Kasten\n", "  ")).toBeNull();
    // A fence that never closes protects the rest of the note.
    expect(linkMention("```\nKasten\n", "Kasten")).toBeNull();
  });

  it("follows a title across a wrapped line and keeps line endings", () => {
    expect(linkMention("Read the Related work\nnotes first.\n", "Related work notes")).toBe("Read the [[Related work notes]] first.\n");
    expect(linkMention("Intro\r\nsee the report draft: how people find old notes\r\nend\r\n", "Report draft: How people find old notes")).toBe(
      "Intro\r\nsee the [[Report draft: How people find old notes|report draft: how people find old notes]]\r\nend\r\n",
    );
    // A blank line ends a paragraph, so the title does not run across it.
    expect(linkMention("Related work\n\nnotes\n", "Related work notes")).toBeNull();
  });

  it("uses the plain title in table rows, where an alias's | would split the cell", () => {
    expect(linkMention("| a | kasten |\n| --- | --- |\n", "Kasten")).toBe("| a | [[Kasten]] |\n| --- | --- |\n");
  });

  it("marks inline code only within a paragraph", () => {
    const body = "A `stray tick\n\nKasten and `code`\n";
    const ranges = protectedRanges(body);
    expect(ranges.map(([a, b]) => body.slice(a, b))).toEqual(["`code`"]);
    expect(linkMention(body, "Kasten")).toBe("A `stray tick\n\n[[Kasten]] and `code`\n");
  });
});
