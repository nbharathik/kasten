import type { Element } from "@kasten-slides/wasm";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { textBox } from "../factory.ts";
import { button, click, fakeTextBox, isDisabled, openEditor, row } from "../menus/testing.ts";
import { Toolbar } from "./Toolbar.tsx";

afterEach(cleanup);

async function setup() {
  const editor = await openEditor();
  render(<Toolbar session={editor.session} ui={editor.ui} />);
  return editor;
}

/** The runs of the first paragraph of a text box or shape. */
const runsOf = (element: Element | undefined) => {
  const text = element && (element.type === "text" || element.type === "shape") ? element.text : undefined;
  return text?.paragraphs[0]?.runs ?? [];
};
const paragraphOf = (element: Element | undefined) => (element && (element.type === "text" || element.type === "shape") ? element.text?.paragraphs[0] : undefined);

/** A text box saying "Hello world" on the slide, selected. */
async function withBox() {
  const editor = await setup();
  const [id] = editor.session.elements.insert([textBox({ x: 40, y: 40, w: 400, h: 80 }, "Hello world")]) as [string];
  const now = () => editor.session.elements.find([id])[0];
  return { ...editor, id, now };
}

describe("the text controls", () => {
  it("are off with nothing to format, and on with a box selected", async () => {
    const { session } = await setup();
    act(() => session.select([]));
    for (const name of ["Bold", "Italic", "Underline", "Strikethrough", "Text colour", "Insert link", "Align", "Line spacing", "Bulleted list", "Numbered list", "Decrease indent", "Increase indent", "Clear formatting", "Font", "Increase font size"]) {
      expect(isDisabled(button(name)), name).toBe(true);
    }
    expect((screen.getByRole("textbox", { name: "Font size" }) as HTMLInputElement).disabled).toBe(true);
    act(() => void session.elements.insert([textBox({ x: 40, y: 40, w: 400, h: 80 }, "Hello")]));
    for (const name of ["Bold", "Text colour", "Align", "Font", "Increase font size"]) expect(isDisabled(button(name)), name).toBe(false);
  });

  it("bolds all the words of a selected box, shows it, and takes it off again", async () => {
    const { now } = await withBox();
    expect(button("Bold").getAttribute("aria-pressed")).toBe("false");
    click(button("Bold"));
    expect(runsOf(now()).every((r) => r.b)).toBe(true);
    expect(button("Bold").getAttribute("aria-pressed")).toBe("true");
    click(button("Bold"));
    expect(runsOf(now()).some((r) => r.b)).toBe(false);
    for (const [name, key] of [["Italic", "i"], ["Underline", "u"], ["Strikethrough", "s"]] as const) {
      click(button(name));
      expect(runsOf(now()).every((r) => r[key]), name).toBe(true);
      expect(button(name).getAttribute("aria-pressed"), name).toBe("true");
    }
  });

  it("shows a mark that only some of the words have as not on, and still applies it to all", async () => {
    const { session, id, now } = await withBox();
    act(() => session.elements.setText(id, { paragraphs: [{ runs: [{ t: "Hello ", b: true }, { t: "world" }] }] }));
    expect(button("Bold").getAttribute("aria-pressed")).toBe("false");
    click(button("Bold"));
    expect(runsOf(now()).every((r) => r.b)).toBe(true);
  });

  it("counts the weight the text style gives, so the title of a slide shows Bold on", async () => {
    const { session } = await setup();
    const title = session.slide.elements.find((e) => e.placeholder === "title");
    const subtitle = session.slide.elements.find((e) => e.placeholder === "subtitle");
    expect(title && subtitle).toBeTruthy();
    act(() => session.select([title!.id]));
    // No word in it is marked bold; the title style is.
    expect(runsOf(title).some((r) => r.b)).toBe(false);
    expect(button("Bold").getAttribute("aria-pressed")).toBe("true");
    act(() => session.select([subtitle!.id]));
    expect(button("Bold").getAttribute("aria-pressed")).toBe("false");
  });

  it("steps the size along the usual sizes from the text style's own", async () => {
    const { now } = await withBox();
    const box = screen.getByRole("textbox", { name: "Font size" }) as HTMLInputElement;
    // A text box is set in the body style, 22 points.
    expect(box.value).toBe("22");
    click(button("Increase font size"));
    expect(runsOf(now()).every((r) => r.size === 24)).toBe(true);
    expect(box.value).toBe("24");
    click(button("Increase font size"));
    click(button("Increase font size"));
    expect(box.value).toBe("32");
    click(button("Decrease font size"));
    expect(runsOf(now()).every((r) => r.size === 28)).toBe(true);
  });

  it("sets the size typed in the box on Enter, and on leaving it, and puts the old one back on Escape", async () => {
    const { now } = await withBox();
    const box = screen.getByRole("textbox", { name: "Font size" }) as HTMLInputElement;
    fireEvent.change(box, { target: { value: "30" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(runsOf(now()).every((r) => r.size === 30)).toBe(true);
    fireEvent.change(box, { target: { value: "17" } });
    fireEvent.blur(box);
    expect(runsOf(now()).every((r) => r.size === 17)).toBe(true);
    fireEvent.change(box, { target: { value: "50" } });
    fireEvent.keyDown(box, { key: "Escape" });
    expect(box.value).toBe("17");
    fireEvent.keyDown(box, { key: "ArrowUp" });
    expect(runsOf(now()).every((r) => r.size === 18)).toBe(true);
  });

  it("shows nothing in the size box where the words disagree, and steps from the text style's size", async () => {
    const { session, id, now } = await withBox();
    act(() => session.elements.setText(id, { paragraphs: [{ runs: [{ t: "Big", size: 40 }, { t: " small", size: 12 }] }] }));
    const box = screen.getByRole("textbox", { name: "Font size" }) as HTMLInputElement;
    expect(box.value).toBe("");
    expect(box.placeholder).toBe("—");
    click(button("Increase font size"));
    expect(runsOf(now()).every((r) => r.size === 24)).toBe(true);
  });

  it("picks the text colour from the palette, with Automatic putting the style's back", async () => {
    const { now } = await withBox();
    click(button("Text colour"));
    expect(within(screen.getByRole("dialog", { name: "Text colour" })).getByRole("button", { name: "Automatic" })).toBeTruthy();
    click(screen.getByRole("button", { name: "accent3" }));
    expect(runsOf(now()).every((r) => r.color === "accent3")).toBe(true);
    expect(screen.queryByRole("dialog", { name: "Text colour" })).toBeNull();
    // The bar under the A is the colour in use.
    expect((button("Text colour").querySelector(".ks-tb-bar") as HTMLElement).style.background).toMatch(/rgb|#/);
    click(button("Text colour"));
    click(screen.getByRole("button", { name: "Automatic" }));
    expect(runsOf(now()).some((r) => r.color)).toBe(false);
  });

  it("sets the font, theme fonts first, and checks the one in use", async () => {
    const { now } = await withBox();
    expect(button("Font").textContent).toBe("Inter");
    click(button("Font"));
    expect(row(/^Heading font/).textContent).toContain("Inter");
    expect(row(/^Code font/).textContent).toContain("Roboto Mono");
    expect(row(/^Body font/).getAttribute("aria-checked")).toBe("true");
    click(row("Georgia"));
    expect(runsOf(now()).every((r) => r.font === "Georgia")).toBe(true);
    expect(button("Font").textContent).toBe("Georgia");
    click(button("Font"));
    expect(row("Georgia").getAttribute("aria-checked")).toBe("true");
    click(row(/^Code font/));
    expect(runsOf(now()).every((r) => r.font === "code")).toBe(true);
    expect(button("Font").textContent).toBe("Roboto Mono");
  });

  it("aligns, spaces lines, and makes lists and indents", async () => {
    const { now } = await withBox();
    click(button("Align"));
    expect(row(/^Left/).getAttribute("aria-checked")).toBe("true");
    click(row(/^Centre/));
    expect(paragraphOf(now())?.align).toBe("center");
    expect(button("Align").querySelector("svg")).toBeTruthy();

    click(button("Line spacing"));
    click(row("1.5"));
    expect(paragraphOf(now())?.lineSpacing).toBe(1.5);
    click(button("Line spacing"));
    expect(row("1.5").getAttribute("aria-checked")).toBe("true");
    click(row("Default"));
    expect(paragraphOf(now())?.lineSpacing).toBeUndefined();

    click(button("Bulleted list"));
    expect(paragraphOf(now())?.list).toBe("bullet");
    expect(button("Bulleted list").getAttribute("aria-pressed")).toBe("true");
    click(button("Numbered list"));
    expect(paragraphOf(now())?.list).toBe("number");
    click(button("Increase indent"));
    expect(paragraphOf(now())?.level).toBe(1);
    click(button("Decrease indent"));
    expect(paragraphOf(now())?.level).toBe(0);
  });

  it("clears formatting and opens the link dialog", async () => {
    const { session, ui, id, now } = await withBox();
    act(() => session.elements.setText(id, { paragraphs: [{ runs: [{ t: "Hello", b: true, color: "accent2", size: 30 }] }] }));
    click(button("Clear formatting"));
    expect(runsOf(now())).toEqual([{ t: "Hello" }]);
    click(button("Insert link"));
    expect(ui.state.dialog).toBe("link");
  });
});

describe("with a text box open", () => {
  it("sends the change to the box, shows how its words look, and follows the caret", async () => {
    const { session, ui, id, now } = await withBox();
    const before = JSON.stringify(now());
    session.startEditing(id);
    const editor = fakeTextBox({ bold: true, size: 40, font: "Georgia", align: "right", list: "number" });
    act(() => ui.setText(editor));
    expect(button("Bold").getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByRole("textbox", { name: "Font size" }) as HTMLInputElement).value).toBe("40");
    expect(button("Font").textContent).toBe("Georgia");
    expect(button("Numbered list").getAttribute("aria-pressed")).toBe("true");

    click(button("Italic"));
    expect(editor.toggleItalic).toHaveBeenCalledTimes(1);
    click(button("Increase font size"));
    expect(editor.stepSize).toHaveBeenCalledWith(1);
    fireEvent.change(screen.getByRole("textbox", { name: "Font size" }), { target: { value: "12" } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Font size" }), { key: "Enter" });
    expect(editor.setSize).toHaveBeenCalledWith(12);
    click(button("Text colour"));
    click(screen.getByRole("button", { name: "accent4" }));
    expect(editor.setColor).toHaveBeenCalledWith("accent4");
    // The deck itself is untouched: the box writes its words when it is done.
    expect(JSON.stringify(now())).toBe(before);

    // The caret moves into plain words.
    editor.current = { ...editor.current, bold: false, size: null };
    await act(async () => {
      document.dispatchEvent(new Event("selectionchange"));
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    expect(button("Bold").getAttribute("aria-pressed")).toBe("false");
    expect((screen.getByRole("textbox", { name: "Font size" }) as HTMLInputElement).value).toBe("22");
  });
});
