import { describe, expect, it } from "vitest";

import { sectionOf } from "./sections";

const NOTE = ["Intro line.", "", "## Plan", "", "Book the guesthouse.", "", "### Day one", "", "The old temple.", "", "```sh", "# not a heading", "```", "", "## Budget", "", "About 1200.", ""].join("\n");

describe("sections", () => {
  it("takes a heading down to the next one at its level or above", () => {
    expect(sectionOf(NOTE, "plan")).toBe(["## Plan", "", "Book the guesthouse.", "", "### Day one", "", "The old temple.", "", "```sh", "# not a heading", "```"].join("\n"));
    expect(sectionOf(NOTE, "Day one")).toBe(["### Day one", "", "The old temple.", "", "```sh", "# not a heading", "```"].join("\n"));
    expect(sectionOf(NOTE, "Budget")).toBe("## Budget\n\nAbout 1200.");
  });

  it("finds nothing for a missing heading or one inside code", () => {
    expect(sectionOf(NOTE, "Hotels")).toBeNull();
    expect(sectionOf(NOTE, "not a heading")).toBeNull();
  });

  it("reads closing hashes and CRLF files", () => {
    expect(sectionOf("# Title ##\r\nText\r\n", "title")).toBe("# Title ##\nText");
  });
});
