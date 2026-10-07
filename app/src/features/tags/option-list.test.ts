import { describe, expect, it } from "vitest";

import { joinOptions, splitOptions } from "./option-list";

describe("a select's options on one line", () => {
  it("keeps an option that holds a comma or a quote", () => {
    const options = ["Todo", "Done, verified", 'Say "hi"', "Later"];
    const line = joinOptions(options);
    expect(line).toBe('Todo, "Done, verified", "Say ""hi""", Later');
    expect(splitOptions(line)).toEqual(options);
  });

  it("reads options typed by hand: trimmed, each once, empty ones dropped", () => {
    expect(splitOptions(" Todo ,Doing,, Done,Todo ")).toEqual(["Todo", "Doing", "Done"]);
    expect(splitOptions('"In review, legal" , Shipped')).toEqual(["In review, legal", "Shipped"]);
    expect(splitOptions("")).toEqual([]);
  });

  it("reads an unclosed quote to the end of the line", () => {
    expect(splitOptions('Todo, "Done, verified')).toEqual(["Todo", "Done, verified"]);
  });
});
