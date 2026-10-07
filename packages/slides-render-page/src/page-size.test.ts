import { describe, expect, it } from "vitest";

import { base64, stepProblem } from "./api.tsx";
import { pageSizeOf } from "./print.ts";

describe("the print layout's page size", () => {
  it("is read from its @page rule", () => {
    expect(pageSizeOf("\n    @page { size: 960px 540px; margin: 0; }\n    @media print { body { margin: 0 } }")).toEqual({ width: 960, height: 540 });
    expect(pageSizeOf("@page { size: 794px 1123px; margin: 0; }")).toEqual({ width: 794, height: 1123 });
    expect(pageSizeOf("body { color: red }")).toBeNull();
  });
});

describe("steps", () => {
  it("are checked against what the slide has, in words that say what is possible", () => {
    expect(stepProblem(2, 4, undefined)).toBeNull();
    expect(stepProblem(2, 4, null)).toBeNull();
    expect(stepProblem(2, 4, 0)).toBeNull();
    expect(stepProblem(2, 4, 4)).toBeNull();
    expect(stepProblem(2, 4, 5)).toBe("Slide 3 has steps 0 to 4; there is no step 5.");
    expect(stepProblem(0, 0, 0)).toBeNull();
    expect(stepProblem(0, 0, 2)).toContain("has no steps");
    expect(stepProblem(0, 3, -1)).toContain("whole number");
    expect(stepProblem(0, 3, 1.5)).toContain("whole number");
  });
});

describe("base64", () => {
  it("encodes bytes as text, in pieces a long list of arguments could not take", () => {
    expect(base64(new Uint8Array([104, 105]))).toBe("aGk=");
    const long = new Uint8Array(100_000).fill(65);
    expect(atob(base64(long)).length).toBe(100_000);
  });
});
