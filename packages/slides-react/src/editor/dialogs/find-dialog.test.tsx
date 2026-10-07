import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { findAll } from "./find.ts";
import { click, find, open, replaceField, shown, status, type } from "./find-kit.tsx";
import { edit } from "./test-kit.tsx";

afterEach(cleanup);

describe("Find and replace", () => {
  it("is a card over the slide, not a window that shuts the slide out", async () => {
    await open();
    const card = screen.getByRole("dialog", { name: "Find and replace" });
    expect(card.classList.contains("ks-find")).toBe(true);
    expect(card.getAttribute("aria-modal")).toBeNull();
    expect(document.querySelector(".ks-scrim")).toBeNull();
    expect(document.activeElement).toBe(find());
  });

  it("has the two fields, three options and four buttons", async () => {
    await open();
    expect(find().placeholder).toBe("Find");
    expect(replaceField().placeholder).toBe("Replace with");
    expect((screen.getByLabelText("Match case") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("Whole word") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText("Also search notes") as HTMLInputElement).checked).toBe(true);
    for (const name of ["Find previous", "Find next", "Replace", "Replace all"]) expect(screen.getByRole("button", { name })).toBeTruthy();
  });

  it("has nothing to do with nothing to find", async () => {
    await open();
    expect(status()).toBe("");
    for (const name of ["Find previous", "Find next", "Replace", "Replace all"]) expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
    type("zebra");
    expect(status()).toBe("No matches");
    expect(screen.getByRole("button", { name: "Replace all" }).hasAttribute("disabled")).toBe(true);
  });

  it("counts the matches as they are typed", async () => {
    await open();
    type("cat");
    // Title, subtitle and notes of the first slide; title and three in the body ("Concat" too) of the second; the table cell and two in the group.
    expect(status()).toBe("10 matches");
    type("dog");
    expect(status()).toBe("2 matches");
    type("behaviour");
    expect(status()).toBe("1 match");
  });

  it("goes to each match in turn, on its slide, selecting its box, and says which of how many", async () => {
    const kit = await open();
    type("cat");
    fireEvent.keyDown(find(), { key: "Enter" });
    expect(status()).toBe("1 of 10");
    expect(shown(kit).slide).toBe(0);
    const title = kit.session.slide.elements.find((e) => e.placeholder === "title");
    expect(shown(kit).selected).toEqual([title?.id]);
    fireEvent.keyDown(find(), { key: "Enter" });
    expect(status()).toBe("2 of 10");
    expect(shown(kit).selected).toEqual([kit.session.slide.elements.find((e) => e.placeholder === "subtitle")?.id]);
    fireEvent.keyDown(find(), { key: "Enter" });
    // The notes are next: their slide is shown, with nothing selected.
    expect(status()).toBe("3 of 10");
    expect(shown(kit)).toEqual({ slide: 0, selected: [] });
    fireEvent.keyDown(find(), { key: "Enter" });
    expect(status()).toBe("4 of 10");
    expect(shown(kit).slide).toBe(1);
    click("Find next");
    expect(status()).toBe("5 of 10");
  });

  it("goes back with Shift+Enter and the previous button, and round from either end", async () => {
    const kit = await open();
    type("cat");
    // With none shown yet, back is the last match of the slide that is shown: its notes.
    fireEvent.keyDown(find(), { key: "Enter", shiftKey: true });
    expect(status()).toBe("3 of 10");
    fireEvent.keyDown(find(), { key: "Enter", shiftKey: true });
    expect(status()).toBe("2 of 10");
    click("Find previous");
    expect(status()).toBe("1 of 10");
    // Before the first is the last: a word in the group on the third slide.
    click("Find previous");
    expect(status()).toBe("10 of 10");
    expect(shown(kit).slide).toBe(2);
    fireEvent.keyDown(find(), { key: "Enter" });
    expect(status()).toBe("1 of 10");
    expect(shown(kit).slide).toBe(0);
  });

  it("starts from the slide that is shown", async () => {
    const kit = await open();
    edit(() => kit.session.goTo(kit.session.deck.slides[1]!.id));
    type("cat");
    fireEvent.keyDown(find(), { key: "Enter" });
    expect(status()).toBe("4 of 10");
    expect(shown(kit).slide).toBe(1);
  });

  it("selects the group when the words are in one of its children", async () => {
    const kit = await open();
    type("too");
    fireEvent.keyDown(find(), { key: "Enter" });
    const group = kit.session.deck.slides[2]!.elements.find((e) => e.type === "group");
    expect(shown(kit)).toEqual({ slide: 2, selected: [group?.id] });
  });

  it("shows the notes if they are hidden when a match is in them", async () => {
    const kit = await open();
    edit(() => kit.ui.toggleNotes());
    expect(kit.ui.state.notesOpen).toBe(false);
    type("story");
    fireEvent.keyDown(find(), { key: "Enter" });
    expect(kit.ui.state.notesOpen).toBe(true);
  });

  it("narrows the matches by case, whole word and notes, and starts again when they change", async () => {
    const kit = await open();
    type("cat");
    fireEvent.keyDown(find(), { key: "Enter" });
    expect(status()).toBe("1 of 10");
    fireEvent.click(screen.getByLabelText("Match case"));
    // "Cats" has a capital, so it is not "cat" now.
    expect(status()).toBe("9 matches");
    type("Cat");
    expect(status()).toBe("1 match");
    type("cat");
    fireEvent.click(screen.getByLabelText("Match case"));
    fireEvent.click(screen.getByLabelText("Whole word"));
    // Not "Cats", "cats" or "Concat".
    expect(status()).toBe("7 matches");
    fireEvent.click(screen.getByLabelText("Also search notes"));
    expect(status()).toBe("6 matches");
    expect(kit.errors).toEqual([]);
  });

  it("agrees with the engine about how many there are", async () => {
    const kit = await open();
    type("cat");
    const shownCount = Number(/\d+/.exec(status() ?? "")?.[0]);
    expect(shownCount).toBe(findAll(kit.session.deck, "cat").length);
    click("Replace all");
    expect(status()).toBe(`Replaced ${shownCount}`);
  });
});

describe("Closing and coming back", () => {
  it("closes with Escape and with its button", async () => {
    const kit = await open();
    fireEvent.keyDown(find(), { key: "Escape" });
    expect(kit.ui.state.dialog).toBeNull();
    edit(() => kit.ui.openDialog("find"));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(kit.ui.state.dialog).toBeNull();
  });

  it("remembers what was looked for", async () => {
    const kit = await open();
    type("dog");
    fireEvent.change(replaceField(), { target: { value: "wolf" } });
    fireEvent.click(screen.getByLabelText("Match case"));
    edit(() => kit.ui.openDialog(null));
    expect(screen.queryByRole("dialog")).toBeNull();
    edit(() => kit.ui.openDialog("find"));
    expect(find().value).toBe("dog");
    expect(replaceField().value).toBe("wolf");
    expect((screen.getByLabelText("Match case") as HTMLInputElement).checked).toBe(true);
    expect(document.activeElement).toBe(find());
  });

  it("takes Ctrl+F back to its own box instead of the browser's", async () => {
    await open();
    replaceField().focus();
    const event = new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(find());
  });
});

