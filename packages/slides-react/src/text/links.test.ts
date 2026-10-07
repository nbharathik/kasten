// @vitest-environment node

import { describe, expect, it } from "vitest";

import { linkFromInput, safeLink } from "./links.ts";

describe("safeLink", () => {
  it("keeps web, mail, phone and slide addresses", () => {
    for (const address of ["https://example.com", "http://example.com/a?b=1#c", "mailto:a@b.co", "tel:+4912345", "slide:s-1a2b3c4d", "HTTPS://EXAMPLE.COM"]) {
      expect(safeLink(address), address).toBe(address);
    }
    expect(safeLink("  https://example.com  ")).toBe("https://example.com");
  });

  it("refuses anything else", () => {
    for (const address of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "vbscript:x", "file:///etc/passwd", "ppaction://hlinksldjump", "/relative", "#anchor", "example.com", "", "   ", null, undefined, "https://a.b/\u0000", "java\nscript:alert(1)"]) {
      expect(safeLink(address), String(address)).toBeNull();
    }
  });
});

describe("linkFromInput", () => {
  it("takes an address as it is, or makes a bare one a web address", () => {
    expect(linkFromInput("https://example.com/x")).toBe("https://example.com/x");
    expect(linkFromInput("  example.com/page ")).toBe("https://example.com/page");
    expect(linkFromInput("www.example.com")).toBe("https://www.example.com");
    expect(linkFromInput("example.com:8080/x")).toBe("https://example.com:8080/x");
    expect(linkFromInput("localhost:3000/x")).toBe("https://localhost:3000/x");
    expect(linkFromInput("mailto:a@b.co")).toBe("mailto:a@b.co");
    expect(linkFromInput("slide:s-1")).toBe("slide:s-1");
  });

  it("gives nothing for what is no address or must not be followed", () => {
    for (const input of ["", "   ", "hello", "two words.com", "javascript:alert(1)", "data:text/html,x", "file:///x", null, undefined]) {
      expect(linkFromInput(input), String(input)).toBeNull();
    }
  });
});
