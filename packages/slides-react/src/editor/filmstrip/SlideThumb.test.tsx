import type { Slide } from "@kasten-slides/wasm";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type CSSProperties } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Filmstrip } from "./Filmstrip.tsx";
import { SlideThumb } from "./SlideThumb.tsx";
import { idsOf, openDeck } from "./test-support.ts";

// The renderer is stood in for by a box that counts the times it is asked to draw a slide.
const drawn = vi.hoisted(() => [] as string[]);
vi.mock("../../render/index.ts", () => ({
  SlideView: (props: { slide: Slide; number?: number; count?: number; mode?: string; imageUrl?: unknown; style?: CSSProperties }) => {
    drawn.push(props.slide.id);
    return <div data-testid="slide" data-id={props.slide.id} data-number={props.number} data-count={props.count} data-mode={props.mode} style={props.style} />;
  },
}));

beforeEach(() => {
  drawn.length = 0;
});
afterEach(cleanup);

describe("SlideThumb", () => {
  it("draws the slide as a thumbnail, scaled from the top left into a box of the width asked for", async () => {
    const { session } = await openDeck({ slides: 2 });
    const imageUrl = (path: string) => `blob:${path}`;
    render(<SlideThumb deck={session.deck} slide={session.deck.slides[1]!} number={2} count={2} width={200} imageUrl={imageUrl} />);
    const slide = screen.getByTestId("slide");
    expect(slide.dataset).toMatchObject({ mode: "thumbnail", number: "2", count: "2", id: session.deck.slides[1]!.id });
    expect(slide.style.transform).toBe("scale(0.20833333333333334)");
    expect(slide.style.transformOrigin).toMatch(/^0(px)? 0(px)?$/);
    const box = slide.parentElement!;
    expect(box.style.width).toBe("200px");
    expect(box.style.height).toBe("113px");
  });

  it("keeps the shape of a four by three deck", async () => {
    const { session } = await openDeck({ slides: 1 });
    const deck = { ...session.deck, size: { w: 720, h: 540 } };
    render(<SlideThumb deck={deck} slide={deck.slides[0]!} number={1} count={1} width={160} imageUrl={() => undefined} />);
    expect(screen.getByTestId("slide").parentElement!.style.height).toBe("120px");
  });

  it("is not drawn again for a deck that is a new object with the same slide, theme and size", async () => {
    const { session } = await openDeck({ slides: 1 });
    const imageUrl = () => undefined;
    const props = { slide: session.deck.slides[0]!, number: 1, count: 1, width: 160, imageUrl };
    const view = render(<SlideThumb deck={session.deck} {...props} />);
    expect(drawn).toHaveLength(1);
    view.rerender(<SlideThumb deck={{ ...session.deck, title: "Another" }} {...props} />);
    view.rerender(<SlideThumb deck={{ ...session.deck, size: { ...session.deck.size }, present: { ...session.deck.present } }} {...props} />);
    expect(drawn).toHaveLength(1);
    // But a slide that is another object, or a new number, is.
    view.rerender(<SlideThumb deck={session.deck} {...props} slide={{ ...props.slide }} />);
    expect(drawn).toHaveLength(2);
    view.rerender(<SlideThumb deck={session.deck} {...props} slide={props.slide} number={2} />);
    expect(drawn).toHaveLength(3);
    view.rerender(<SlideThumb deck={session.deck} {...props} slide={props.slide} number={2} count={5} />);
    expect(drawn).toHaveLength(4);
    view.rerender(<SlideThumb deck={session.deck} {...props} slide={props.slide} number={2} count={5} width={200} />);
    expect(drawn).toHaveLength(5);
    view.rerender(<SlideThumb deck={{ ...session.deck, present: { ...session.deck.present, slideNumbers: !session.deck.present.slideNumbers } }} {...props} slide={props.slide} number={2} count={5} width={200} />);
    expect(drawn).toHaveLength(6);
  });
});

describe("the thumbnails of the filmstrip", () => {
  async function setup() {
    const made = await openDeck({ slides: 4 });
    render(<Filmstrip session={made.session} ui={made.ui} />);
    const ids = idsOf(made.session);
    expect(drawn.sort()).toEqual([...ids].sort());
    drawn.length = 0;
    return { ...made, ids };
  }

  it("draws again only the slide an edit changed", async () => {
    const { session, ids } = await setup();
    act(() => session.slides.setNotes("Something to say", ids[1]));
    expect(drawn).toEqual([ids[1]]);
    drawn.length = 0;
    const text = session.deck.slides[2]!.elements[0]!;
    act(() => void session.core.apply("set_text", { slide: ids[2]!, id: text.id, markdown: "A new title" }));
    expect(drawn).toEqual([ids[2]]);
  });

  it("draws nothing again for a selection, or for showing another slide", async () => {
    const { session, ids } = await setup();
    fireEvent.click(screen.getAllByRole("option")[2]!);
    fireEvent.click(screen.getAllByRole("option")[0]!, { ctrlKey: true });
    act(() => session.goTo(ids[3]!));
    act(() => session.select([]));
    expect(drawn).toEqual([]);
  });

  it("draws nothing again for the deck's name, or the state of saving", async () => {
    const { session } = await setup();
    act(() => session.slides.setTitle("A new name for the deck"));
    expect(drawn).toEqual([]);
    await act(() => session.flush());
    expect(drawn).toEqual([]);
  });

  it("draws every slide again for a new theme", async () => {
    const { session, ids } = await setup();
    act(() => session.slides.applyTheme("Dark"));
    expect([...drawn].sort()).toEqual([...ids].sort());
  });

  it("draws a new slide, and the others again since the count of slides changed", async () => {
    const { session, ids } = await setup();
    act(() => void session.slides.add());
    expect(new Set(drawn).size).toBe(5);
    expect(drawn).toHaveLength(5);
    expect(new Set(drawn)).toEqual(new Set(idsOf(session)));
    expect(ids).toHaveLength(4);
  });

  it("draws only the slides that moved when slides are reordered", async () => {
    const { session, ids } = await setup();
    act(() => session.slides.move([ids[3]!], 2));
    // The moved slide and the one it passed have new numbers; the others are as they were.
    expect(new Set(drawn)).toEqual(new Set([ids[2], ids[3]]));
  });
});
