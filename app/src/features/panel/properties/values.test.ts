import { describe, expect, it } from "vitest";

import { propOf } from "./values";

describe("reading a note's property", () => {
  it("reads what the note sets, and never what every object has", () => {
    const props = JSON.parse('{"status": "Done", "points": 0, "none": null}') as Record<string, unknown>;
    expect(propOf(props, "status")).toBe("Done");
    expect(propOf(props, "points")).toBe(0);
    expect(propOf(props, "none")).toBeNull();
    for (const key of ["constructor", "toString", "hasOwnProperty", "__proto__"]) expect(propOf(props, key)).toBeUndefined();
  });
});
