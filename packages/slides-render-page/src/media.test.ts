import { describe, expect, it } from "vitest";

import { MEDIA_ROOT, mediaUrl } from "./media.ts";

describe("where the page loads a picture from", () => {
  it("asks for a deck's path on the page's own address, encoded", () => {
    expect(mediaUrl("assets/figure.png")).toBe(`${MEDIA_ROOT}assets/figure.png`);
    expect(mediaUrl("assets/two words.png")).toBe(`${MEDIA_ROOT}assets/two%20words.png`);
    expect(mediaUrl("./assets//café.png")).toBe(`${MEDIA_ROOT}assets/caf%C3%A9.png`);
  });

  it("does not load anything from the network or outside the folder", () => {
    for (const path of ["https://example.com/a.png", "http://localhost:9/a.png", "file:///etc/passwd", "//example.com/a.png", "ftp://x/y", "../secret.png", "a/../../b.png", "a\\b.png", "", "  ", "."]) {
      expect(mediaUrl(path), path).toBeUndefined();
    }
  });

  it("passes on pictures that are in the deck itself", () => {
    expect(mediaUrl("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(mediaUrl("blob:abc")).toBe("blob:abc");
  });
});
