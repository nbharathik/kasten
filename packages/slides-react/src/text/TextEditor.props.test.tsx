import type { Text, Theme } from "@kasten-slides/wasm";
import { cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { viewOfHandle } from "./handle.ts";
import { installDomShims, themeNamed } from "./test-support.ts";
import { hello, mount, p, selectRange, styleOf, text, words } from "./test-editor.tsx";

let light: Theme;

beforeAll(async () => {
  light = await themeNamed("Light");
  installDomShims();
});

afterEach(cleanup);

describe("text from outside", () => {
  it("is taken up when nobody is in the box", () => {
    const editor = mount(light, hello);
    editor.rerender({ text: text(p({ t: "Other" })) });
    expect(words(editor)).toEqual(["Other"]);
    expect(editor.view.dom.textContent).toBe("Other");
  });

  it("is ignored while the box has focus", () => {
    const editor = mount(light, hello, { autoFocus: "end" });
    editor.handle.insertText("!");
    editor.rerender({ text: text(p({ t: "Other" })) });
    expect(words(editor)).toEqual(["Hello world!"]);
  });

  it("is ignored while an input method is composing, and the view is not made again", () => {
    const editor = mount(light, hello);
    const dom = editor.view.dom;
    fireEvent.compositionStart(dom);
    expect(editor.view.composing).toBe(true);
    editor.rerender({ text: text(p({ t: "Other" })) });
    expect(words(editor)).toEqual(["Hello world"]);
    expect(editor.view.dom).toBe(dom);
    fireEvent.compositionEnd(dom);
  });

  it("does nothing when it is the text the box holds already", () => {
    const editor = mount(light, hello, { autoFocus: "end" });
    editor.handle.insertText("!");
    const echoed = editor.changes.at(-1)!;
    const before = editor.view.state;
    editor.view.dom.blur();
    editor.rerender({ text: JSON.parse(JSON.stringify(echoed)) as Text });
    expect(editor.view.state).toBe(before);
  });

  it("keeps the view when the theme's text is unchanged, and makes it again for another theme", async () => {
    const dark = await themeNamed("Dark");
    const editor = mount(light, hello, { autoFocus: "end" });
    editor.handle.insertText("!");
    const dom = editor.view.dom;
    editor.rerender({ width: 700 });
    expect(editor.view.dom).toBe(dom);
    editor.rerender({ theme: dark });
    expect(words(editor)).toEqual(["Hello world!"]);
    expect(editor.handle.getText().paragraphs[0]?.runs[0]?.t).toBe("Hello world!");
  });

  it("does not make the view again for a theme that is the same in everything it draws", () => {
    const editor = mount(light, hello, { autoFocus: "end" });
    const dom = editor.view.dom;
    editor.rerender({ theme: JSON.parse(JSON.stringify(light)) as Theme });
    editor.rerender({ theme: { ...light, name: "Renamed", layouts: [] } });
    expect(viewOfHandle(editor.handle)?.dom).toBe(dom);
  });

  it("makes the view again for another theme, with the selection and focus where they were", async () => {
    const dark = await themeNamed("Dark");
    const editor = mount(light, hello, { autoFocus: "start" });
    selectRange(editor.view, 3, 8);
    editor.rerender({ theme: dark });
    const view = viewOfHandle(editor.handle)!;
    expect(view.dom).not.toBe(editor.view.dom);
    expect([view.state.selection.from, view.state.selection.to]).toEqual([3, 8]);
    expect(view.hasFocus()).toBe(true);
    expect(styleOf(view.dom.querySelector(".ks-p")!)["color"]).toBe("rgb(241, 243, 244)");
  });

  it("waits for an input method to finish before making the view again", async () => {
    const dark = await themeNamed("Dark");
    const editor = mount(light, hello, { autoFocus: "end" });
    const dom = editor.view.dom;
    fireEvent.compositionStart(dom);
    editor.rerender({ theme: dark });
    expect(viewOfHandle(editor.handle)?.dom).toBe(dom);
    fireEvent.compositionEnd(dom);
    expect(viewOfHandle(editor.handle)?.dom).not.toBe(dom);
    expect(words(editor)).toEqual(["Hello world"]);
  });
});
