import type { Element } from "@kasten-slides/wasm";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { requestFieldFocus } from "../../../field-focus.ts";
import { edit, enter, held, mount, section } from "../test-kit.tsx";
import { frames } from "./frames.ts";

afterEach(cleanup);

type Code = Extract<Element, { type: "code" }>;

const block = (extra: Partial<Code> = {}): Element => ({ type: "code", id: "", language: "python", code: "a = 1\nb = 2\nc = 3\nd = 4", x: 64, y: 148, w: 600, h: 260, ...extra }) as Element;
type Kit = Awaited<ReturnType<typeof mount>>;
const codeOf = (kit: Kit, at = 0) => held(kit, kit.ids[at] as string) as Code;
const area = () => within(section("code")).getByLabelText("Code") as HTMLTextAreaElement;
const language = () => within(section("code")).getByRole("combobox", { name: "Language" }) as HTMLInputElement;
const type = (box: HTMLElement, value: string) => fireEvent.change(box, { target: { value } });
const commit = (box: HTMLElement) => fireEvent.blur(box);
const steps = () => within(section("code")).queryAllByRole("listitem").filter((g) => /^Step \d+$/.test(g.getAttribute("aria-label") ?? ""));
const entryBox = (n: number) => within(section("code")).getByLabelText(`Lines in focus at step ${n}`) as HTMLInputElement;

describe("Code: the code itself", () => {
  it("is the first thing in the panel, in a box for code, and the field a double click puts the caret in", async () => {
    await mount({ elements: [block()] });
    expect(area().value).toBe("a = 1\nb = 2\nc = 3\nd = 4");
    expect(area().hasAttribute("data-primary")).toBe(true);
    expect(area().className).toContain("is-code");
    const first = document.querySelector("[data-section]");
    expect(first?.getAttribute("data-section")).toBe("code");
    expect(screen.getByText("Code block")).toBeTruthy();
  });

  it("goes into the deck when the box is left, as one step of undo, and the panel follows undo and redo", async () => {
    const kit = await mount({ elements: [block()] });
    type(area(), "print('hi')");
    // Nothing has changed until the box is left.
    expect(codeOf(kit).code).toBe("a = 1\nb = 2\nc = 3\nd = 4");
    commit(area());
    expect(codeOf(kit).code).toBe("print('hi')");
    expect(kit.session.state.undoLabel).toBe("patch_elements");
    edit(() => kit.session.undo());
    expect(codeOf(kit).code).toBe("a = 1\nb = 2\nc = 3\nd = 4");
    expect(area().value).toBe("a = 1\nb = 2\nc = 3\nd = 4");
    edit(() => kit.session.redo());
    expect(area().value).toBe("print('hi')");
    expect(kit.errors).toEqual([]);
  });

  it("does not touch the deck when nothing was changed", async () => {
    const kit = await mount({ elements: [block()] });
    const before = kit.session.state.undoLabel;
    commit(area());
    expect(kit.session.state.undoLabel).toBe(before);
  });

  it("puts a tab in the code when Tab is pressed, and keeps it byte for byte", async () => {
    const kit = await mount({ elements: [block({ code: "if x:\nreturn 1" })] });
    area().focus();
    area().setSelectionRange(6, 6);
    fireEvent.keyDown(area(), { key: "Tab" });
    expect(area().value).toBe("if x:\n\treturn 1");
    commit(area());
    expect(codeOf(kit).code).toBe("if x:\n\treturn 1");
  });

  it("lets Tab move on after Escape, and Shift+Tab always, so the keyboard is never trapped", async () => {
    await mount({ elements: [block({ code: "x" })] });
    area().focus();
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    area().dispatchEvent(escape);
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    area().dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(area().value).toBe("x");
    const back = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    area().dispatchEvent(back);
    expect(back.defaultPrevented).toBe(false);
  });

  it("commits on Ctrl+Enter, and puts back what was there on Escape", async () => {
    const kit = await mount({ elements: [block()] });
    type(area(), "one");
    fireEvent.keyDown(area(), { key: "Enter", ctrlKey: true });
    expect(codeOf(kit).code).toBe("one");
    type(area(), "two");
    fireEvent.keyDown(area(), { key: "Escape" });
    expect(area().value).toBe("one");
    commit(area());
    expect(codeOf(kit).code).toBe("one");
  });

  it("shows Mixed for blocks with different code, and sets them all", async () => {
    const kit = await mount({ elements: [block({ code: "one" }), block({ code: "two", y: 20 })] });
    expect(area().value).toBe("");
    expect(area().placeholder).toBe("Mixed");
    type(area(), "same");
    commit(area());
    expect(kit.ids.map((id) => (held(kit, id) as Code).code)).toEqual(["same", "same"]);
  });
});

describe("Code: language", () => {
  it("shows the language by its name", async () => {
    await mount({ elements: [block({ language: "python" })] });
    expect(language().value).toBe("Python");
  });

  it("opens a list, narrows it as words are typed and picks with the keyboard", async () => {
    const kit = await mount({ elements: [block()] });
    fireEvent.focus(language());
    expect(screen.getAllByRole("option").length).toBeGreaterThan(30);
    type(language(), "ts");
    expect(screen.getAllByRole("option").map((o) => o.textContent)[0]).toMatch(/^TypeScript/);
    fireEvent.keyDown(language(), { key: "Enter" });
    expect(codeOf(kit).language).toBe("typescript");
    expect(language().value).toBe("TypeScript");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("picks with the mouse, and walks the list with the arrow keys", async () => {
    const kit = await mount({ elements: [block()] });
    fireEvent.focus(language());
    type(language(), "r");
    fireEvent.keyDown(language(), { key: "ArrowDown" });
    const options = screen.getAllByRole("option");
    expect(options.filter((o) => o.getAttribute("aria-selected") === "true")).toHaveLength(1);
    fireEvent.click(screen.getByRole("option", { name: /^Rust/ }));
    expect(codeOf(kit).language).toBe("rust");
  });

  it("keeps a name that is not on the list, since the colouring may know it", async () => {
    const kit = await mount({ elements: [block()] });
    fireEvent.focus(language());
    type(language(), "Zig");
    const use = screen.getByRole("option", { name: /Use “Zig”/ });
    fireEvent.click(use);
    expect(codeOf(kit).language).toBe("zig");
    expect(language().value).toBe("zig");
  });

  it("puts back the language shown when it is left without a choice", async () => {
    const kit = await mount({ elements: [block()] });
    fireEvent.focus(language());
    type(language(), "ru");
    fireEvent.blur(language());
    expect(language().value).toBe("Python");
    expect(codeOf(kit).language).toBe("python");
  });

  it("shows Mixed for blocks in different languages", async () => {
    await mount({ elements: [block({ language: "python" }), block({ language: "rust", y: 20 })] });
    expect(language().placeholder).toBe("Mixed");
    expect(language().value).toBe("");
  });
});

describe("Code: looks", () => {
  it("chooses dark or light colours", async () => {
    const kit = await mount({ elements: [block()] });
    expect(within(section("code")).getByRole("radio", { name: "Dark code colours" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(section("code")).getByRole("radio", { name: "Light code colours" }));
    expect(codeOf(kit).theme).toBe("light");
    edit(() => kit.session.undo());
    expect(within(section("code")).getByRole("radio", { name: "Dark code colours" }).getAttribute("aria-checked")).toBe("true");
  });

  it("turns line numbers on, and sets the number the first line has", async () => {
    const kit = await mount({ elements: [block()] });
    fireEvent.click(within(section("code")).getByLabelText("Line numbers"));
    expect(codeOf(kit).lineNumbers).toBe(true);
    enter(within(section("code")).getByLabelText("First line number"), "41");
    expect(codeOf(kit).firstLine).toBe(41);
    enter(within(section("code")).getByLabelText("First line number"), "1");
    expect(codeOf(kit).firstLine).toBeUndefined();
    fireEvent.click(within(section("code")).getByLabelText("Line numbers"));
    expect(codeOf(kit).lineNumbers).toBeUndefined();
  });

  it("sets the type size, and goes back to the theme's", async () => {
    const kit = await mount({ elements: [block()] });
    const reset = within(section("code")).getByRole("button", { name: "Use the theme's code size" });
    expect(reset.hasAttribute("disabled")).toBe(true);
    enter(within(section("code")).getByLabelText("Code size"), "18");
    expect(codeOf(kit).fontSize).toBe(18);
    expect(within(section("code")).getByRole("button", { name: "Use the theme's code size" }).hasAttribute("disabled")).toBe(false);
    fireEvent.click(within(section("code")).getByRole("button", { name: "Use the theme's code size" }));
    expect(codeOf(kit).fontSize).toBeUndefined();
  });

  it("shows Mixed for blocks that are set differently, and sets them all", async () => {
    const kit = await mount({ elements: [block({ theme: "light" }), block({ y: 20 })] });
    expect(within(section("code")).getAllByRole("radio").every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
    fireEvent.click(within(section("code")).getByRole("radio", { name: "Dark code colours" }));
    expect(kit.ids.map((id) => (held(kit, id) as Code).theme)).toEqual(["dark", "dark"]);
  });
});

describe("Code: focus steps", () => {
  it("lists the entries, one to a step", async () => {
    await mount({ elements: [block({ focus: ["1", "2-3"] })] });
    expect(steps()).toHaveLength(2);
    expect(entryBox(1).value).toBe("1");
    expect(entryBox(2).value).toBe("2-3");
  });

  it("adds a step for the line after the last one looked at, and gives the slide the steps it needs", async () => {
    const kit = await mount({ elements: [block({ focus: ["1-2"] })] });
    fireEvent.click(within(section("code")).getByRole("button", { name: "Add step" }));
    expect(codeOf(kit).focus).toEqual(["1-2", "3"]);
    expect(kit.session.slide.steps).toBeGreaterThanOrEqual(2);
    expect(entryBox(2).value).toBe("3");
    edit(() => kit.session.undo());
    expect(codeOf(kit).focus).toEqual(["1-2"]);
    expect(steps()).toHaveLength(1);
  });

  it("writes an entry the way the deck keeps it", async () => {
    const kit = await mount({ elements: [block({ focus: ["1"] })] });
    enter(entryBox(1), " 2 - 3 , 05 ");
    expect(codeOf(kit).focus).toEqual(["2-3,5"]);
    expect(entryBox(1).value).toBe("2-3,5");
  });

  it("marks an entry that is not lines and ranges, and leaves the deck as it was", async () => {
    const kit = await mount({ elements: [block({ focus: ["1"] })] });
    enter(entryBox(1), "one to three");
    expect(entryBox(1).getAttribute("aria-invalid")).toBe("true");
    expect(codeOf(kit).focus).toEqual(["1"]);
    enter(entryBox(1), "3-2");
    expect(entryBox(1).getAttribute("aria-invalid")).toBe("true");
    enter(entryBox(1), "2-3");
    expect(entryBox(1).getAttribute("aria-invalid")).toBeNull();
    expect(codeOf(kit).focus).toEqual(["2-3"]);
  });

  it("says when an entry names a line the code does not have", async () => {
    await mount({ elements: [block({ focus: ["1", "3-9"] })] });
    expect(screen.getByRole("status").textContent).toMatch(/Step 2 names line 9, and the code has 4/);
  });

  it("takes an entry away, and the last one takes the setting away", async () => {
    const kit = await mount({ elements: [block({ focus: ["1", "2"] })] });
    fireEvent.click(within(section("code")).getByRole("button", { name: "Remove step 1" }));
    expect(codeOf(kit).focus).toEqual(["2"]);
    fireEvent.click(within(section("code")).getByRole("button", { name: "Remove step 1" }));
    expect(codeOf(kit).focus).toBeUndefined();
    expect(steps()).toHaveLength(0);
  });

  it("moves an entry up and down, and the buttons at the ends are off", async () => {
    const kit = await mount({ elements: [block({ focus: ["1", "2", "3"] })] });
    expect(within(section("code")).getByRole("button", { name: "Move step 1 up" }).hasAttribute("disabled")).toBe(true);
    expect(within(section("code")).getByRole("button", { name: "Move step 3 down" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(within(section("code")).getByRole("button", { name: "Move step 3 up" }));
    expect(codeOf(kit).focus).toEqual(["1", "3", "2"]);
    fireEvent.click(within(section("code")).getByRole("button", { name: "Move step 1 down" }));
    expect(codeOf(kit).focus).toEqual(["3", "1", "2"]);
  });

  it("does not offer to edit steps that differ between blocks, and says so", async () => {
    await mount({ elements: [block({ focus: ["1"] }), block({ focus: ["2"], y: 20 })] });
    expect(steps()).toHaveLength(0);
    expect(within(section("code")).getByText(/Mixed: the selected items have different steps in focus/)).toBeTruthy();
    expect(within(section("code")).queryByRole("button", { name: "Add step" })).toBeNull();
  });

  it("edits the steps of several blocks that agree", async () => {
    const kit = await mount({ elements: [block({ focus: ["1"] }), block({ focus: ["1"], y: 20 })] });
    fireEvent.click(within(section("code")).getByRole("button", { name: "Add step" }));
    expect(kit.ids.map((id) => (held(kit, id) as Code).focus)).toEqual([["1", "2"], ["1", "2"]]);
    edit(() => kit.session.undo());
    expect(kit.ids.map((id) => (held(kit, id) as Code).focus)).toEqual([["1"], ["1"]]);
  });
});

describe("Code: the keyboard in the list of steps", () => {
  it("puts the focus in the new step when one is added", async () => {
    await mount({ elements: [block({ focus: ["1"] })] });
    fireEvent.click(within(section("code")).getByRole("button", { name: "Add step" }));
    await frames();
    expect(document.activeElement).toBe(entryBox(2));
  });

  it("keeps the focus on the step that is moved, so that a key can press again", async () => {
    await mount({ elements: [block({ focus: ["1", "2", "3"] })] });
    within(section("code")).getByRole("button", { name: "Move step 3 up" }).focus();
    fireEvent.click(within(section("code")).getByRole("button", { name: "Move step 3 up" }));
    await frames();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Move step 2 up");
    fireEvent.click(document.activeElement as HTMLElement);
    await frames();
    // The step is at the top now: its up button is off, so the focus is on its down button.
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Move step 1 down");
  });

  it("puts the focus on the step that takes the place of one that goes, and on Add step when none is left", async () => {
    await mount({ elements: [block({ focus: ["1", "2"] })] });
    fireEvent.click(within(section("code")).getByRole("button", { name: "Remove step 1" }));
    await frames();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Remove step 1");
    fireEvent.click(document.activeElement as HTMLElement);
    await frames();
    expect((document.activeElement as HTMLElement | null)?.textContent).toBe("Add step");
  });
});

describe("Code: a double click on the block", () => {
  it("gives the code box the focus, in the panel that was already open", async () => {
    const kit = await mount({ elements: [block()] });
    act(() => requestFieldFocus(kit.ui, kit.ids[0] as string));
    await frames();
    expect(document.activeElement).toBe(area());
  });

  it("opens a folded section first", async () => {
    const kit = await mount({ elements: [block()] });
    fireEvent.click(within(section("code")).getByRole("button", { name: "Code" }));
    expect(within(section("code")).getByRole("button", { name: "Code" }).getAttribute("aria-expanded")).toBe("false");
    act(() => requestFieldFocus(kit.ui, kit.ids[0] as string));
    await frames(2);
    expect(within(section("code")).getByRole("button", { name: "Code" }).getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(area());
  });

  it("is not answered by another element's section, or long after it was asked", async () => {
    const kit = await mount({ elements: [block()] });
    act(() => requestFieldFocus(kit.ui, "some-other-element"));
    await frames();
    expect(document.activeElement).not.toBe(area());
  });
});
