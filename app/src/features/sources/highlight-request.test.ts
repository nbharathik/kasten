import { describe, expect, it } from "vitest";

import { spotOfLink } from "./highlight-request";

describe("source links", () => {
  it("find the spot a highlight card links to, from wherever the card is", () => {
    expect(spotOfLink("../sources/primer.pdf#page=2&highlight=01K5", "inbox/idea.md")).toEqual({ source: "sources/primer.pdf", page: 2, highlight: "01K5" });
    expect(spotOfLink("../../../sources/a%20b.pdf#page=3", "projects/p/cards/x.md")).toEqual({ source: "sources/a b.pdf", page: 3 });
    expect(spotOfLink("../sources/primer.pdf", "inbox/idea.md")).toEqual({ source: "sources/primer.pdf" });
  });

  it("decode what the core encodes, and take a stray % as it is", () => {
    const odd = "../sources/My%20paper%20%28v2%29,%20draft%20%7Bfinal%7D%20%233.pdf#page=3&highlight=01K5";
    expect(spotOfLink(odd, "inbox/idea.md")).toEqual({ source: "sources/My paper (v2), draft {final} #3.pdf", page: 3, highlight: "01K5" });
    expect(spotOfLink("../sources/100% sure.pdf#page=1", "inbox/idea.md")).toEqual({ source: "sources/100% sure.pdf", page: 1 });
  });

  it("leave other links alone", () => {
    expect(spotOfLink("https://example.com/paper.pdf", "inbox/idea.md")).toBeNull();
    expect(spotOfLink("../assets/map.png", "inbox/idea.md")).toBeNull();
    expect(spotOfLink("../library/paper.pdf#page=2", "inbox/idea.md")).toBeNull();
  });
});
