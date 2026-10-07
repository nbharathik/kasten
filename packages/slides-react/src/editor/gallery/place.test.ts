import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { textBox } from "../factory.ts";
import type { HostImage } from "../host.ts";
import { insertAt, insertInFreeArea, spotFor } from "./place.ts";
import { mountGallery } from "./test-kit.tsx";

afterEach(cleanup);

const image = (over: Partial<HostImage> = {}): HostImage => ({ path: "assets/x.png", name: "x.png", width: 640, height: 400, ...over });
const box = (session: { slide: { elements: unknown[] } }) => session.slide.elements.at(-1) as { x: number; y: number; w: number; h: number; src: string; alt: string };
const crosses = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

describe("where a gallery image lands", () => {
  it("goes into the largest free place at its own shape", async () => {
    const { session } = await mountGallery({ elements: [textBox({ x: 40, y: 40, w: 880, h: 120 }, "Title")] });
    await insertInFreeArea(session, image());
    const placed = box(session);
    expect(placed.src).toBe("assets/x.png");
    expect(placed.w / placed.h).toBeCloseTo(1.6, 1);
    expect(crosses(placed, { x: 40, y: 40, w: 880, h: 120 })).toBe(false);
  });

  it("goes smaller into the free place that is left, rather than over what is there", async () => {
    const title = { x: 40, y: 40, w: 880, h: 330 };
    const { session } = await mountGallery({ elements: [textBox(title, "Title")] });
    await insertInFreeArea(session, image());
    const placed = box(session);
    expect(crosses(placed, title)).toBe(false);
    expect(placed.y + placed.h).toBeLessThanOrEqual(540);
    expect(placed.w / placed.h).toBeCloseTo(1.6, 1);
    expect(placed.h).toBeLessThan(200);
  });

  it("goes over the middle only when nothing is free at any size", async () => {
    const everything = { x: 10, y: 10, w: 940, h: 520 };
    const { session } = await mountGallery({ elements: [textBox(everything, "Full")] });
    const spot = spotFor(session, { w: 320, h: 200 });
    expect(spot).toMatchObject({ w: 320, h: 200 });
    await insertInFreeArea(session, image({ width: 320, height: 200 }));
    expect(box(session)).toMatchObject({ w: 320, h: 200 });
  });

  it("shows a tiny picture large enough to see, and never past the slide", async () => {
    const { session } = await mountGallery();
    await insertInFreeArea(session, image({ width: 4, height: 3 }));
    const dot = box(session);
    expect(Math.max(dot.w, dot.h)).toBe(96);
    expect(dot.w / dot.h).toBeCloseTo(4 / 3, 1);
    await insertAt(session, image({ width: 4000, height: 3000 }), { x: 5000, y: -300 });
    const far = box(session);
    expect(far.x + far.w).toBeLessThanOrEqual(960);
    expect(far.y).toBeGreaterThanOrEqual(0);
  });
});

describe("citing the paper of a placed figure", () => {
  const figure = (over: Partial<HostImage> = {}) => image({ path: "assets/fig.png", citationKey: "vaswani2017attention", ...over });
  const citations = (session: { slide: { elements: unknown[] } }) => (session.slide.elements as { type: string; keys?: string[] }[]).filter((e) => e.type === "citation");

  it("cites the paper after the figure is put in the free place or where it is dropped, once for each paper", async () => {
    const { session, errors } = await mountGallery();
    await insertInFreeArea(session, figure());
    expect(citations(session).map((c) => c.keys)).toEqual([["vaswani2017attention"]]);
    await insertAt(session, figure({ path: "assets/fig-2.png" }), { x: 200, y: 200 });
    expect(citations(session).map((c) => c.keys)).toEqual([["vaswani2017attention"]]);
    await insertAt(session, figure({ path: "assets/bert.png", citationKey: "devlin2019bert" }), { x: 600, y: 300 });
    expect(citations(session).map((c) => c.keys)).toEqual([["vaswani2017attention", "devlin2019bert"]]);
    expect(errors).toEqual([]);
  });

  it("cites nothing for a picture with no key", async () => {
    const { session } = await mountGallery();
    await insertInFreeArea(session, image());
    await insertAt(session, image({ citationKey: "  " }), { x: 300, y: 300 });
    expect(citations(session)).toEqual([]);
  });

  it("leaves the picture where it is and says why when the key cannot be cited", async () => {
    const { session, errors } = await mountGallery();
    await insertInFreeArea(session, figure({ citationKey: "two words" }));
    expect(box(session).src).toBe("assets/fig.png");
    expect(citations(session)).toEqual([]);
    expect(errors).toHaveLength(1);
  });
});
