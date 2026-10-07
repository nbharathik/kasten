import type { Deck, Element, Slide } from "@kasten-slides/wasm";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { shape, textBox } from "../factory.ts";
import { runCommand } from "../commands/index.ts";
import { ContextMenus } from "../menus/ContextMenus.tsx";
import { MenuBar } from "../menus/MenuBar.tsx";
import { openEditor } from "../menus/testing.ts";
import { AgentBadges } from "./AgentBadges.tsx";
import { SlideMark } from "./SlideMark.tsx";

afterEach(cleanup);

/** An editor on a slide of three boxes, of which the first two are an assistant's work. */
async function setup() {
  const editor = await openEditor();
  let ids: string[] = [];
  act(() => {
    editor.session.slides.add({ layout: "blank" });
    ids = editor.session.elements.insert([textBox({ x: 60, y: 100, w: 200, h: 60 }, "One"), shape("rect", { x: 300, y: 100, w: 160, h: 60 }), textBox({ x: 500, y: 100, w: 200, h: 60 }, "Three")]);
  });
  const made = JSON.parse(editor.session.core.save());
  made.slides[1]["x-agent"] = [{ at: Date.now() - 3 * 60_000, by: "claude-code", ids: [ids[0], ids[1]], session: "s1" }];
  act(() => editor.session.load(JSON.stringify(made)));
  return { ...editor, ids };
}

const slideOf = (deck: Deck, i: number): Slide => deck.slides[i]!;

describe("the badge on an element an assistant made", () => {
  it("is drawn for each marked element, at its top right corner, with words for a screen reader", async () => {
    const { session, ids } = await setup();
    const boxes = new Map<string, { x: number; y: number; w: number; h: number }>([
      [ids[0]!, { x: 60, y: 100, w: 200, h: 60 }],
      [ids[1]!, { x: 300, y: 100, w: 160, h: 60 }],
    ]);
    const { container } = render(<AgentBadges slide={slideOf(session.deck, 1)} boxes={boxes} zoom={0.5} />);
    const badges = [...container.querySelectorAll<HTMLElement>("[data-agent-badge]")];
    expect(badges.map((b) => b.dataset.agentBadge)).toEqual([ids[0], ids[1]]);
    expect(badges[0]!.style.left).toBe("126px");
    expect(badges[0]!.style.top).toBe("54px");
    expect(badges[0]!.getAttribute("role")).toBe("img");
    expect(badges[0]!.getAttribute("aria-label")).toBe("Made by claude-code, 3 minutes ago. Not accepted yet.");
  });

  it("is not drawn for a slide with nothing marked", async () => {
    const { session } = await setup();
    const { container } = render(<AgentBadges slide={slideOf(session.deck, 0)} boxes={new Map()} zoom={1} />);
    expect(container.querySelector("[data-agent-badge]")).toBeNull();
  });
});

describe("the mark on a slide in the filmstrip", () => {
  it("counts the marked elements in its words, and is not there for a slide with none", async () => {
    const { session } = await setup();
    const marked = render(<SlideMark slide={slideOf(session.deck, 1)} />);
    const mark = marked.getByRole("img");
    expect(mark.getAttribute("aria-label")).toBe("2 elements made by claude-code, not accepted yet");
    cleanup();
    const none = render(<SlideMark slide={slideOf(session.deck, 0)} />);
    expect(none.container.firstChild).toBeNull();
  });
});

describe("accepting", () => {
  it("takes the mark off the selected elements and off all of them, each one step of undo", async () => {
    const { session, ui, ids } = await setup();
    act(() => session.select([ids[0]!, ids[2]!]));
    expect(session.marks.selected).toEqual([ids[0]]);
    await act(async () => runCommand("agent.accept", { session, ui }));
    expect(session.marks.pending).toBe(1);
    expect(session.state.undoLabel).toBe("accept_marks");
    await act(async () => runCommand("agent.accept-all", { session, ui }));
    expect(session.marks.pending).toBe(0);
    // Nothing left to accept: nothing is done and nothing is added to undo.
    await act(async () => runCommand("agent.accept-all", { session, ui }));
    act(() => session.undo());
    expect(session.marks.pending).toBe(1);
    act(() => session.undo());
    expect(session.marks.pending).toBe(2);
  });

  it("is what the element's right-click menu and the Tools menu offer, and only while there is something to accept", async () => {
    const { session, ui, ids } = await setup();
    render(<ContextMenus session={session} ui={ui} />);
    act(() => session.select([ids[0]!]));
    act(() => ui.openContextMenu({ kind: "element", x: 100, y: 100 }));
    const labels = () => screen.getAllByRole("menuitem").map((r) => r.textContent);
    expect(labels().slice(0, 2)).toEqual(["Accept", "Accept all changes by the assistant"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Accept" }));
    expect(session.marks.pending).toBe(1);
    act(() => session.select([ids[2]!]));
    act(() => ui.openContextMenu({ kind: "element", x: 100, y: 100 }));
    expect(labels()).not.toContain("Accept");
    expect(labels()[0]).toBe("Accept all changes by the assistant");
    act(() => ui.openContextMenu(null));
    act(() => session.marks.acceptAll());
    act(() => ui.openContextMenu({ kind: "canvas", x: 10, y: 10 }));
    expect(labels().join("|")).not.toContain("Accept");
  });

  it("is in the Tools menu", async () => {
    const { session, ui } = await setup();
    render(<MenuBar session={session} ui={ui} />);
    fireEvent.click(screen.getByRole("menuitem", { name: "Tools" }));
    const item = screen.getByRole("menuitem", { name: "Accept all changes by the assistant" });
    expect(item.hasAttribute("disabled") || item.getAttribute("aria-disabled") === "true").toBe(false);
    fireEvent.click(item);
    expect(session.marks.pending).toBe(0);
  });
});

it("keeps the selection when the deck is taken again from the file, where the elements are still there", async () => {
  const { session, ids } = await setup();
  act(() => session.select([ids[0]!, ids[1]!]));
  const text = session.core.save();
  act(() => session.load(text));
  expect(session.state.selection).toEqual([ids[0], ids[1]]);
  const without = JSON.parse(text);
  without.slides[1].elements = without.slides[1].elements.filter((e: Element) => e.id !== ids[1]);
  act(() => session.load(JSON.stringify(without)));
  expect(session.state.selection).toEqual([ids[0]]);
});
