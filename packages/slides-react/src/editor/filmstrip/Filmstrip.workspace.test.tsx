// The filmstrip inside the whole editor: a key it takes must not be taken again by the editor around it.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { GridView } from "../grid/GridView.tsx";
import { Workspace } from "../SlidesEditor.tsx";
import { EditorUi } from "../ui-state.ts";
import { Filmstrip } from "./Filmstrip.tsx";
import { idsOf, openDeck } from "./test-support.ts";

afterEach(cleanup);

// What an editor around a list sees of a key: React's own flag on the event, which is a copy of the browser's made when the key came in.
// A list that runs a command for a key has to say so on that copy too, or the editor runs the command a second time.
describe("a key the list has used is marked as used on React's event", () => {
  const lists = [
    ["filmstrip", Filmstrip],
    ["grid", GridView],
  ] as const;
  for (const [name, List] of lists) {
    it(`in the ${name}`, async () => {
      const { session } = await openDeck({ slides: 3 });
      const ui = new EditorUi();
      const passed: string[] = [];
      render(
        <div onKeyDown={(event) => void (event.defaultPrevented || passed.push(event.key))}>
          <List session={session} ui={ui} />
        </div>,
      );
      const list = screen.getByRole("listbox", { name: "Slides" });
      list.focus();
      fireEvent.keyDown(list, { key: "m", ctrlKey: true }); // A command for the whole editor.
      fireEvent.keyDown(list, { key: "ArrowDown" }); // The list's own.
      fireEvent.keyDown(list, { key: "q" }); // Nothing at all.
      expect(passed).toEqual(["q"]);
    });
  }
});

describe("keys in the filmstrip, inside the editor", () => {
  it("runs a command for the whole editor once, not twice", async () => {
    const { session, ui } = await openDeck({ slides: 3 });
    render(<Workspace session={session} ui={ui} />);
    const list = screen.getByRole("listbox", { name: "Slides" });
    list.focus();
    // Ctrl+M is New slide.
    expect(fireEvent.keyDown(list, { key: "m", ctrlKey: true })).toBe(false);
    expect(session.deck.slides).toHaveLength(4);
  });

  it("undoes one change with one Ctrl+Z", async () => {
    const { session, ui } = await openDeck({ slides: 3 });
    render(<Workspace session={session} ui={ui} />);
    const list = screen.getByRole("listbox", { name: "Slides" });
    const first = idsOf(session);
    session.slides.setNotes("one", first[0]!);
    session.goTo(first[1]!);
    session.slides.setNotes("two", first[1]!);
    list.focus();
    fireEvent.keyDown(list, { key: "z", ctrlKey: true });
    // One undo takes back the second note and not the first.
    expect(session.deck.slides[1]!.notes ?? "").toBe("");
    expect(session.deck.slides[0]!.notes).toBe("one");
  });

  it("runs a command of the filmstrip's own once", async () => {
    const { session, ui } = await openDeck({ slides: 3 });
    render(<Workspace session={session} ui={ui} />);
    const list = screen.getByRole("listbox", { name: "Slides" });
    list.focus();
    fireEvent.keyDown(list, { key: "d", ctrlKey: true });
    expect(session.deck.slides).toHaveLength(4);
  });
});

describe("keys in the grid, inside the editor", () => {
  it("runs a command for the whole editor once, and undoes one change with one Ctrl+Z", async () => {
    const { session, ui } = await openDeck({ slides: 3 });
    ui.setView("grid");
    render(<Workspace session={session} ui={ui} />);
    const grid = screen.getByRole("listbox", { name: "Slides" });
    grid.focus();
    fireEvent.keyDown(grid, { key: "m", ctrlKey: true });
    expect(session.deck.slides).toHaveLength(4);
    // One undo takes back the new slide; a second would take back one the deck was made with.
    fireEvent.keyDown(grid, { key: "z", ctrlKey: true });
    expect(session.deck.slides).toHaveLength(3);
  });
});
