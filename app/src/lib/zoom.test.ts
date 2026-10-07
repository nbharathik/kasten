import { beforeEach, describe, expect, it } from "vitest";

import { stepZoom, zoomBy, zoomLevel } from "./zoom";

beforeEach(() => localStorage.clear());

describe("window zoom", () => {
  it("steps through the levels and stops at the ends", () => {
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1, -1)).toBe(0.9);
    expect(stepZoom(2, 1)).toBe(2);
    expect(stepZoom(0.67, -1)).toBe(0.67);
    expect(stepZoom(1.5, 0)).toBe(1);
  });

  it("keeps the level for next time and scales the preview's page", async () => {
    expect(zoomLevel()).toBe(1);
    expect(await zoomBy(1)).toBe(1.1);
    expect(await zoomBy(1)).toBe(1.25);
    expect(zoomLevel()).toBe(1.25);
    expect(document.documentElement.style.getPropertyValue("zoom")).toBe("1.25");
    expect(await zoomBy(0)).toBe(1);
    expect(document.documentElement.style.getPropertyValue("zoom")).toBe("");
    localStorage.setItem("kasten.zoom", "7");
    expect(zoomLevel()).toBe(1);
  });
});
