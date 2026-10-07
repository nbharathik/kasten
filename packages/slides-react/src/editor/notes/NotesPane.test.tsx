import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { idsOf, openDeck } from "../filmstrip/test-support.ts";
import { MAX_HEIGHT, MIN_HEIGHT } from "./height.ts";
import { NotesPane, WRITE_DELAY } from "./NotesPane.tsx";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function setup(slides = 3) {
  const made = await openDeck({ slides });
  vi.useFakeTimers();
  const view = render(
    <div className="ks-editor">
      <div className="ks-stage" tabIndex={0} />
      <NotesPane session={made.session} ui={made.ui} />
    </div>,
  );
  return { ...made, ...view, ids: idsOf(made.session) };
}

const field = () => screen.getByRole("textbox", { name: "Speaker notes for this slide" }) as HTMLTextAreaElement;
const type = (text: string) => fireEvent.change(field(), { target: { value: text } });
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const notesOf = (session: { deck: { slides: { id: string; notes?: string }[] } }, id: string) => session.deck.slides.find((slide) => slide.id === id)?.notes;

describe("what it shows", () => {
  it("asks for notes on a slide that has none", async () => {
    await setup();
    expect(field().value).toBe("");
    expect(field().placeholder).toBe("Click to add speaker notes");
  });

  it("shows the notes of the shown slide, and follows it", async () => {
    const { session, ids } = await setup();
    act(() => session.slides.setNotes("Say **hello**.\n\n- then this", ids[1]));
    expect(field().value).toBe("");
    act(() => session.goTo(ids[1]!));
    // As stored, Markdown and all.
    expect(field().value).toBe("Say **hello**.\n\n- then this");
    act(() => session.goTo(ids[0]!));
    expect(field().value).toBe("");
  });
});

describe("writing", () => {
  it("keeps what is typed to itself until a moment after the last key, then writes it as one step", async () => {
    const { session, ids } = await setup();
    const before = session.deck;
    type("Open with a question");
    expect(field().value).toBe("Open with a question");
    wait(WRITE_DELAY - 1);
    expect(session.deck).toBe(before);
    wait(1);
    expect(notesOf(session, ids[0]!)).toBe("Open with a question");
    // One undo step for it.
    expect(session.state.undoLabel).toBeDefined();
    act(() => session.undo());
    expect(notesOf(session, ids[0]!) ?? "").toBe("");
  });

  it("waits for a pause: every key starts the wait again", async () => {
    const { session, ids } = await setup();
    type("a");
    wait(400);
    type("ab");
    wait(400);
    expect(notesOf(session, ids[0]!)).toBeUndefined();
    type("abc");
    wait(WRITE_DELAY);
    expect(notesOf(session, ids[0]!)).toBe("abc");
    // Three keys, one write: one undo takes back all of it.
    act(() => session.undo());
    expect(notesOf(session, ids[0]!) ?? "").toBe("");
  });

  it("writes at once when the focus leaves", async () => {
    const { session, ids } = await setup();
    field().focus();
    type("Do not forget the demo");
    fireEvent.blur(field());
    expect(notesOf(session, ids[0]!)).toBe("Do not forget the demo");
    // And nothing more when the wait ends.
    const written = session.deck;
    wait(WRITE_DELAY * 2);
    expect(session.deck).toBe(written);
  });

  it("keeps the focus in the box while it writes", async () => {
    const { session, ids } = await setup();
    field().focus();
    type("one");
    wait(WRITE_DELAY);
    expect(notesOf(session, ids[0]!)).toBe("one");
    expect(document.activeElement).toBe(field());
    type("one two");
    expect(field().value).toBe("one two");
  });

  it("clears the notes when the box is emptied", async () => {
    const { session, ids } = await setup();
    act(() => session.slides.setNotes("Something", ids[0]!));
    expect(field().value).toBe("Something");
    type("");
    wait(WRITE_DELAY);
    expect(notesOf(session, ids[0]!) ?? "").toBe("");
  });

  it("writes nothing when the words are the ones the slide has", async () => {
    const { session, ids } = await setup();
    act(() => session.slides.setNotes("Same", ids[0]!));
    const before = session.deck;
    type("Same");
    wait(WRITE_DELAY);
    expect(session.deck).toBe(before);
  });

  it("goes back to the escape route: Escape writes and returns the focus to the slide", async () => {
    const { session, ids } = await setup();
    field().focus();
    type("Wrap up");
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(notesOf(session, ids[0]!)).toBe("Wrap up");
    expect(document.activeElement?.className).toBe("ks-stage");
  });
});

describe("changing slides", () => {
  it("writes the words to the slide they were typed for, before the next slide is shown", async () => {
    const { session, ids } = await setup();
    type("For the first slide");
    // Not yet written; the wait has not ended.
    expect(notesOf(session, ids[0]!)).toBeUndefined();
    act(() => session.goTo(ids[1]!));
    expect(notesOf(session, ids[0]!)).toBe("For the first slide");
    expect(notesOf(session, ids[1]!)).toBeUndefined();
    expect(field().value).toBe("");
    // The old wait ends with nothing to do.
    const settled = session.deck;
    wait(WRITE_DELAY * 2);
    expect(session.deck).toBe(settled);
  });

  it("keeps the words of the two slides apart when a person types on and moves on", async () => {
    const { session, ids } = await setup(4);
    type("first");
    act(() => session.goTo(ids[1]!));
    type("second");
    act(() => session.goTo(ids[2]!));
    type("third");
    wait(WRITE_DELAY);
    expect(ids.slice(0, 3).map((id) => notesOf(session, id))).toEqual(["first", "second", "third"]);
    expect(notesOf(session, ids[3]!)).toBeUndefined();
    act(() => session.goTo(ids[0]!));
    expect(field().value).toBe("first");
  });

  it("writes the words when the pane goes away", async () => {
    const { session, ids, unmount } = await setup();
    type("Last words");
    unmount();
    expect(notesOf(session, ids[0]!)).toBe("Last words");
  });

  it("writes nothing for a slide that has been deleted, and does not complain", async () => {
    const { session, ids, errors } = await setup();
    type("Lost");
    act(() => session.slides.remove([ids[0]!]));
    wait(WRITE_DELAY);
    expect(errors).toEqual([]);
    expect(session.deck.slides.map((slide) => slide.notes)).toEqual([undefined, undefined]);
  });
});

describe("undo and redo from the keyboard", () => {
  it("undoes and redoes the last change to the deck once what was typed has been written", async () => {
    const { session, ids } = await setup();
    field().focus();
    type("A note");
    wait(WRITE_DELAY);
    expect(notesOf(session, ids[0]!)).toBe("A note");
    expect(fireEvent.keyDown(field(), { key: "z", ctrlKey: true })).toBe(false);
    expect(notesOf(session, ids[0]!) ?? "").toBe("");
    expect(field().value).toBe("");
    expect(fireEvent.keyDown(field(), { key: "z", ctrlKey: true, shiftKey: true })).toBe(false);
    expect(field().value).toBe("A note");
    fireEvent.keyDown(field(), { key: "z", metaKey: true });
    expect(field().value).toBe("");
    fireEvent.keyDown(field(), { key: "y", ctrlKey: true });
    expect(field().value).toBe("A note");
  });

  it("leaves Ctrl+Z to the box while there are words typed that are not written yet", async () => {
    const { session, ids } = await setup();
    field().focus();
    type("Not written");
    expect(fireEvent.keyDown(field(), { key: "z", ctrlKey: true })).toBe(true);
    expect(session.state.canRedo).toBe(false);
    expect(notesOf(session, ids[0]!)).toBeUndefined();
    expect(field().value).toBe("Not written");
  });

  it("does not take other keys with Ctrl, or Z with Alt", async () => {
    await setup();
    expect(fireEvent.keyDown(field(), { key: "b", ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(field(), { key: "z", ctrlKey: true, altKey: true })).toBe(true);
    expect(fireEvent.keyDown(field(), { key: "z" })).toBe(true);
  });
});

describe("changes from outside", () => {
  it("shows notes that change under it: undo, or another window", async () => {
    const { session, ids } = await setup();
    act(() => session.slides.setNotes("From a person", ids[0]!));
    expect(field().value).toBe("From a person");
    act(() => session.slides.setNotes("From another window", ids[0]!));
    expect(field().value).toBe("From another window");
    act(() => session.undo());
    expect(field().value).toBe("From a person");
  });

  it("does not take the words from a person who is typing", async () => {
    const { session, ids } = await setup();
    type("mine");
    act(() => session.slides.setNotes("theirs", ids[0]!));
    expect(field().value).toBe("mine");
    wait(WRITE_DELAY);
    expect(notesOf(session, ids[0]!)).toBe("mine");
    expect(field().value).toBe("mine");
  });
});

describe("the height", () => {
  const grip = () => screen.getByRole("separator", { name: "Resize speaker notes" });
  const heightOf = () => (screen.getByLabelText("Speaker notes", { selector: "section" }) as HTMLElement).style.height;

  it("starts at the usual height and can be dragged from the top edge, up for taller", async () => {
    await setup();
    expect(heightOf()).toBe("112px");
    fireEvent.pointerDown(grip(), { button: 0, pointerId: 1, clientY: 500 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 440 });
    expect(heightOf()).toBe("172px");
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 560 });
    expect(heightOf()).toBe("60px");
    fireEvent.pointerUp(window, { pointerId: 1, clientY: 560 });
    // Once let go it no longer follows.
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 100 });
    expect(heightOf()).toBe("60px");
  });

  it("holds between 60 and 320 pixels", async () => {
    await setup();
    fireEvent.pointerDown(grip(), { button: 0, pointerId: 1, clientY: 800 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 0 });
    expect(heightOf()).toBe(`${MAX_HEIGHT}px`);
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 2000 });
    expect(heightOf()).toBe(`${MIN_HEIGHT}px`);
    fireEvent.pointerUp(window, { pointerId: 1, clientY: 2000 });
    expect(grip().getAttribute("aria-valuemin")).toBe("60");
    expect(grip().getAttribute("aria-valuemax")).toBe("320");
    expect(grip().getAttribute("aria-valuenow")).toBe("60");
  });

  it("remembers the height", async () => {
    const first = await setup();
    fireEvent.pointerDown(grip(), { button: 0, pointerId: 1, clientY: 500 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 420 });
    fireEvent.pointerUp(window, { pointerId: 1, clientY: 420 });
    expect(localStorage.getItem("ks-notes-height")).toBe("192");
    first.unmount();
    render(<NotesPane session={first.session} ui={first.ui} />);
    expect(heightOf()).toBe("192px");
  });

  it("can be set from the keyboard", async () => {
    await setup();
    grip().focus();
    fireEvent.keyDown(grip(), { key: "ArrowUp" });
    expect(heightOf()).toBe("128px");
    fireEvent.keyDown(grip(), { key: "ArrowDown", shiftKey: true });
    expect(heightOf()).toBe("80px");
    fireEvent.keyDown(grip(), { key: "End" });
    expect(heightOf()).toBe("320px");
    fireEvent.keyDown(grip(), { key: "Home" });
    expect(heightOf()).toBe("60px");
    expect(localStorage.getItem("ks-notes-height")).toBe("60");
  });

  it("works when browser storage is not to be had", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await setup();
    expect(heightOf()).toBe("112px");
    fireEvent.keyDown(grip(), { key: "ArrowUp" });
    expect(heightOf()).toBe("128px");
  });

  it("ignores a stored height that makes no sense", async () => {
    localStorage.setItem("ks-notes-height", "banana");
    await setup();
    expect(heightOf()).toBe("112px");
    cleanup();
    localStorage.setItem("ks-notes-height", "9000");
    await setup();
    expect(heightOf()).toBe("320px");
  });
});
