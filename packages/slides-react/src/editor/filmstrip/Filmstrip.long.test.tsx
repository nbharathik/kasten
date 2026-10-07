import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Filmstrip } from "./Filmstrip.tsx";
import { ROW, rows } from "./list-support.tsx";
import { openDeck } from "./test-support.ts";

afterEach(cleanup);

describe("long decks", () => {
  it("draws 300 slides quickly, with thumbnails only near the window", async () => {
    const made = await openDeck({ slides: 300 });
    const started = performance.now();
    const { container } = render(<Filmstrip session={made.session} ui={made.ui} />);
    const took = performance.now() - started;
    expect(rows()).toHaveLength(300);
    const drawn = container.querySelectorAll(".ks-fs-frame .ks-thumb").length;
    const quiet = container.querySelectorAll(".ks-fs-frame.is-far").length;
    expect(drawn).toBeGreaterThan(5);
    expect(drawn).toBeLessThan(40);
    expect(drawn + quiet).toBe(300);
    expect(took).toBeLessThan(1000);
  });

  it("draws the thumbnails that come near the window as it scrolls, and lets the others go", async () => {
    const made = await openDeck({ slides: 300 });
    const { container } = render(<Filmstrip session={made.session} ui={made.ui} />);
    const scroller = container.querySelector(".ks-filmstrip") as HTMLElement;
    const drawn = () => [...container.querySelectorAll(".ks-fs-row")].flatMap((row, i) => (row.querySelector(".ks-fs-frame.is-far") ? [] : [i]));
    expect(drawn()[0]).toBe(0);
    scroller.scrollTop = 200 * ROW;
    fireEvent.scroll(scroller);
    await waitFor(() => expect(drawn()[0]).toBeGreaterThan(150));
    expect(drawn().includes(0)).toBe(false);
    expect(drawn().includes(200)).toBe(true);
    expect(drawn().length).toBeLessThan(40);
  });
});
