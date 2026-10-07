import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ContextMenus } from "../menus/ContextMenus.tsx";
import { isDisabled, row } from "../menus/testing.ts";
import { Filmstrip } from "./Filmstrip.tsx";
import { rows } from "./list-support.tsx";
import { type DeckOptions, idsOf, openDeck } from "./test-support.ts";

afterEach(cleanup);

async function setup(options: DeckOptions) {
  const made = await openDeck(options);
  render(
    <>
      <Filmstrip session={made.session} ui={made.ui} />
      <ContextMenus session={made.session} ui={made.ui} />
    </>,
  );
  return { ...made, ids: idsOf(made.session) };
}

const box = () => screen.getByRole("textbox", { name: "Section name" }) as HTMLInputElement;
const sectionsOf = (session: { deck: { sections?: { title: string; startsAt: string }[] } }) => session.deck.sections ?? [];
const titles = (session: { deck: { sections?: { title: string; startsAt: string }[] } }) => sectionsOf(session).map((section) => section.title);

describe("making and naming a section in the filmstrip", () => {
  it("adds a section from the menu of a slide and asks for its name in the header, ready to be typed over", async () => {
    const { session, ids } = await setup({ slides: 4 });
    fireEvent.contextMenu(rows()[2]!);
    fireEvent.click(row(/^Add section here/));
    expect(sectionsOf(session)).toEqual([{ title: "Untitled section", startsAt: ids[2] }]);
    const input = box();
    expect(input.value).toBe("Untitled section");
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, input.value.length]);
    fireEvent.change(input, { target: { value: "Results" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.queryByRole("textbox", { name: "Section name" })).toBeNull();
    expect(screen.getByRole("button", { name: "Collapse section Results" })).toBeTruthy();
    expect(titles(session)).toEqual(["Results"]);
  });

  it("keeps the old name on Escape, and the typed one when the box is left", async () => {
    const { session } = await setup({ slides: 4 });
    fireEvent.contextMenu(rows()[1]!);
    fireEvent.click(row(/^Add section here/));
    fireEvent.change(box(), { target: { value: "Never mind" } });
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(titles(session)).toEqual(["Untitled section"]);
    expect(screen.queryByRole("textbox", { name: "Section name" })).toBeNull();

    fireEvent.contextMenu(rows()[1]!);
    fireEvent.click(row(/^Rename section/));
    fireEvent.change(box(), { target: { value: "Method" } });
    fireEvent.blur(box());
    expect(titles(session)).toEqual(["Method"]);
  });

  it("renames the section a slide is in from the menu, with its name in the box", async () => {
    const { session } = await setup({ slides: 5, sections: [{ title: "Method", at: 1 }] });
    fireEvent.contextMenu(rows()[3]!);
    fireEvent.click(row(/^Rename section/));
    expect(box().value).toBe("Method");
    fireEvent.change(box(), { target: { value: "  Results  " } });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(titles(session)).toEqual(["Results"]);
    // An empty name is not a name: the section keeps the one it has.
    fireEvent.contextMenu(rows()[3]!);
    fireEvent.click(row(/^Rename section/));
    fireEvent.change(box(), { target: { value: "   " } });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(titles(session)).toEqual(["Results"]);
  });

  it("removes a section from the menu and keeps its slides", async () => {
    const { session, ids } = await setup({ slides: 4, sections: [{ title: "Method", at: 1 }] });
    fireEvent.contextMenu(rows()[2]!);
    fireEvent.click(row(/^Remove section/));
    expect(sectionsOf(session)).toEqual([]);
    expect(idsOf(session)).toEqual(ids);
    expect(screen.queryByRole("button", { name: /section Method/ })).toBeNull();
    expect(rows()).toHaveLength(4);
  });

  it("does not offer to rename or remove where no section is, or to add one where one starts", async () => {
    const { session } = await setup({ slides: 4, sections: [{ title: "Method", at: 2 }] });
    fireEvent.contextMenu(rows()[0]!);
    expect(isDisabled(row(/^Add section here/))).toBe(false);
    expect(isDisabled(row(/^Rename section/))).toBe(true);
    expect(isDisabled(row(/^Remove section/))).toBe(true);
    fireEvent.pointerDown(document.body);
    fireEvent.contextMenu(rows()[2]!);
    expect(isDisabled(row(/^Add section here/))).toBe(true);
    expect(isDisabled(row(/^Rename section/))).toBe(false);
    expect(sectionsOf(session)).toHaveLength(1);
  });

  it("opens the menu of the slide a section starts at when the header is right-clicked", async () => {
    const { session, ids } = await setup({ slides: 4, sections: [{ title: "Method", at: 1 }] });
    fireEvent.contextMenu(screen.getByRole("button", { name: "Collapse section Method" }));
    expect(session.state.slideSelection).toEqual([ids[1]]);
    expect(isDisabled(row(/^Add section here/))).toBe(true);
    expect(isDisabled(row(/^Rename section/))).toBe(false);
    expect(isDisabled(row(/^Remove section/))).toBe(false);
  });

  it("does not let the keys typed in the name reach the list: Delete and Backspace leave the slides alone", async () => {
    const { session, ids } = await setup({ slides: 4, sections: [{ title: "Method", at: 1 }] });
    fireEvent.contextMenu(rows()[1]!);
    fireEvent.click(row(/^Rename section/));
    for (const key of ["Delete", "Backspace", "ArrowDown", "Home"]) fireEvent.keyDown(box(), { key });
    fireEvent.keyDown(box(), { key: "a", ctrlKey: true });
    expect(idsOf(session)).toEqual(ids);
    expect(session.state.slideSelection).toEqual([ids[1]]);
  });
});
