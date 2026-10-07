import type { Paragraph, Run, Text, Theme } from "@kasten-slides/wasm";
import { cleanup, fireEvent } from "@testing-library/react";
import type { EditorView } from "prosemirror-view";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { hasWords, parseHtml, parseText } from "./paste-html.ts";
import { installDomShims, themeNamed } from "./test-support.ts";
import { type Mounted, mount, selectRange } from "./test-editor.tsx";

let light: Theme;

beforeAll(async () => {
  light = await themeNamed("Light");
  installDomShims();
});

afterEach(cleanup);

const p = (...runs: Paragraph["runs"]): Paragraph => ({ runs });
const text = (...paragraphs: Paragraph[]): Text => ({ paragraphs });

/** A paste of these clipboard contents into the editor; true when the editor took it over. */
function paste(view: EditorView, data: { html?: string; text?: string }): boolean {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  const contents: Record<string, string> = { "text/html": data.html ?? "", "text/plain": data.text ?? "" };
  Object.defineProperty(event, "clipboardData", { value: { getData: (type: string) => contents[type] ?? "", types: Object.keys(contents).filter((type) => contents[type]) } });
  view.dom.dispatchEvent(event);
  return event.defaultPrevented;
}

const paragraphsOf = (editor: Mounted): Paragraph[] => editor.handle.getText().paragraphs;

/** What parseHtml finds, without the flags that are false, and neighbouring words that look alike as one (the editor joins them). */
function shape(html: string): unknown[] {
  return parseHtml(html).map((paragraph) => {
    const runs: Record<string, unknown>[] = [];
    for (const run of paragraph.runs) {
      const found = { ...(run.bold ? { b: true } : {}), ...(run.italic ? { i: true } : {}), ...(run.underline ? { u: true } : {}), ...(run.strike ? { s: true } : {}), ...(run.link ? { link: run.link } : {}) };
      const last = runs[runs.length - 1];
      const { t, ...look } = last ?? { t: "" };
      if (last && !run.lineBreak && last.t !== "\n" && JSON.stringify(look) === JSON.stringify(found)) last.t = `${t as string}${run.text}`;
      else runs.push({ t: run.text, ...found });
    }
    return { ...(paragraph.list ? { list: paragraph.list, level: paragraph.level } : {}), runs };
  });
}

describe("plain text", () => {
  it("is a paragraph for each line", () => {
    expect(parseText("one\ntwo\r\nthree\rfour").map((q) => q.runs.map((run) => run.text).join(""))).toEqual(["one", "two", "three", "four"]);
    expect(parseText("a\n\nb").map((q) => q.runs.length)).toEqual([1, 0, 1]);
    expect(parseText("").map((q) => q.runs.length)).toEqual([0]);
  });
});

describe("pasted HTML", () => {
  it("makes a paragraph of each block", () => {
    expect(shape("<p>one</p><p>two</p><div>three</div>")).toEqual([{ runs: [{ t: "one" }] }, { runs: [{ t: "two" }] }, { runs: [{ t: "three" }] }]);
    expect(shape("<div><div>deep</div><p>and</p></div>")).toEqual([{ runs: [{ t: "deep" }] }, { runs: [{ t: "and" }] }]);
    expect(shape("<h1>Head</h1><blockquote>quote</blockquote>")).toEqual([{ runs: [{ t: "Head" }] }, { runs: [{ t: "quote" }] }]);
    expect(shape("just text")).toEqual([{ runs: [{ t: "just text" }] }]);
  });

  it("keeps bold, italic, underline, strike and links", () => {
    expect(shape('<p>a <b>b</b> <strong>c</strong> <i>d</i> <em>e</em> <u>f</u> <s>g</s> <del>h</del> <a href="https://x.y/z">i</a></p>')).toEqual([
      {
        runs: [{ t: "a " }, { t: "b", b: true }, { t: " " }, { t: "c", b: true }, { t: " " }, { t: "d", i: true }, { t: " " }, { t: "e", i: true }, { t: " " }, { t: "f", u: true }, { t: " " }, { t: "g", s: true }, { t: " " }, { t: "h", s: true }, { t: " " }, { t: "i", link: "https://x.y/z" }],
      },
    ]);
  });

  it("combines them and reads them from styles too", () => {
    expect(shape('<p><b><i>both</i></b> <span style="font-weight: 700; text-decoration: underline line-through">styled</span> <span style="font-style: italic">slant</span></p>')).toEqual([
      { runs: [{ t: "both", b: true, i: true }, { t: " " }, { t: "styled", b: true, u: true, s: true }, { t: " " }, { t: "slant", i: true }] },
    ]);
  });

  it("does not take a bold that Google Docs puts around what it copies and then switches off", () => {
    const docs = `<meta charset='utf-8'><b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr" style="line-height:1.38;margin-top:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;font-weight:700;">Hello</span><span style="font-size:11pt;font-family:Arial;color:#ff0000;font-weight:400;"> world</span></p></b>`;
    expect(shape(docs)).toEqual([{ runs: [{ t: "Hello", b: true }, { t: " world" }] }]);
  });

  it("leaves fonts, colours and sizes behind", () => {
    const html = '<p style="font-size: 30px; color: red"><span style="font-family: Comic Sans MS; color: #f00; font-size: 8pt">x</span><font color="blue" size="7" face="Papyrus">y</font></p>';
    expect(shape(html)).toEqual([{ runs: [{ t: "xy" }] }]);
  });

  it("drops a link that must not be followed", () => {
    expect(shape('<a href="javascript:alert(1)">bad</a> <a href="data:text/html,x">data</a> <a href="/relative">rel</a> <a href="mailto:a@b.c">mail</a> <a href="slide:s-1">slide</a> <a>none</a>')).toEqual([
      { runs: [{ t: "bad data rel " }, { t: "mail", link: "mailto:a@b.c" }, { t: " " }, { t: "slide", link: "slide:s-1" }, { t: " none" }] },
    ]);
  });

  it("makes list items of list items, with their kind and level", () => {
    const html = "<ul><li>one</li><li>two<ol><li>a</li><li>b<ul><li>deep</li></ul></li></ol></li><li>three</li></ul><p>after</p>";
    expect(shape(html)).toEqual([
      { list: "bullet", level: 0, runs: [{ t: "one" }] },
      { list: "bullet", level: 0, runs: [{ t: "two" }] },
      { list: "number", level: 1, runs: [{ t: "a" }] },
      { list: "number", level: 1, runs: [{ t: "b" }] },
      { list: "bullet", level: 2, runs: [{ t: "deep" }] },
      { list: "bullet", level: 0, runs: [{ t: "three" }] },
      { runs: [{ t: "after" }] },
    ]);
    expect(shape("<ul><li><p>in a paragraph</p></li></ul>")).toEqual([{ list: "bullet", level: 0, runs: [{ t: "in a paragraph" }] }]);
    expect(shape("<li>loose</li>")).toEqual([{ list: "bullet", level: 0, runs: [{ t: "loose" }] }]);
  });

  it("collapses white space as a page does, and turns a non-breaking space into a space", () => {
    expect(shape("<p>  one \n\t two   <b> three </b>  four  </p>")).toEqual([{ runs: [{ t: "one two " }, { t: "three ", b: true }, { t: "four" }] }]);
    expect(shape("<p>a&nbsp;&nbsp;b</p>")).toEqual([{ runs: [{ t: "a  b" }] }]);
    expect(shape("<p>a</p>\n  \n<p>b</p>")).toEqual([{ runs: [{ t: "a" }] }, { runs: [{ t: "b" }] }]);
  });

  it("keeps a line break inside a paragraph, but not the one at its end, and an empty line is an empty paragraph", () => {
    expect(shape("<p>one<br>two<br></p>")).toEqual([{ runs: [{ t: "one" }, { t: "\n" }, { t: "two" }] }]);
    expect(shape("<div>a</div><div><br></div><div>b</div>")).toEqual([{ runs: [{ t: "a" }] }, { runs: [] }, { runs: [{ t: "b" }] }]);
    expect(shape("<p>&nbsp;</p>")).toEqual([{ runs: [] }]);
  });

  it("makes a paragraph of each line of preformatted text, keeping its spaces", () => {
    expect(shape("<pre>if (a) {\n  b();\n\n}\n</pre>")).toEqual([{ runs: [{ t: "if (a) {" }] }, { runs: [{ t: "  b();" }] }, { runs: [] }, { runs: [{ t: "}" }] }]);
    expect(shape('<div style="white-space: pre-wrap">x  y\nz</div>')).toEqual([{ runs: [{ t: "x  y" }] }, { runs: [{ t: "z" }] }]);
    expect(shape("<pre><b>bold</b>\nplain</pre>")).toEqual([{ runs: [{ t: "bold", b: true }] }, { runs: [{ t: "plain" }] }]);
  });

  it("puts the cells of a table row on a line, with tabs", () => {
    expect(shape("<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>")).toEqual([{ runs: [{ t: "a\tb" }] }, { runs: [{ t: "c\td" }] }]);
  });

  it("leaves out scripts, styles, pictures and the like", () => {
    const html = '<style>p{color:red}</style><script>alert(1)</script><p>text<img src="x.png"><svg><text>svg</text></svg><iframe>frame</iframe></p><noscript>no</noscript><!-- comment -->';
    expect(shape(html)).toEqual([{ runs: [{ t: "text" }] }]);
    expect(hasWords(parseHtml("<img src=x>"))).toBe(false);
    expect(hasWords(parseHtml("<p> </p>"))).toBe(false);
    expect(hasWords(parseHtml("<p>x</p>"))).toBe(true);
  });
});

describe("pasting", () => {
  it("puts plain text in at the caret, a paragraph for each line, running into the words around", () => {
    const editor = mount(light, text(p({ t: "Hello world" })), { autoFocus: "start" });
    selectRange(editor.view, 6);
    expect(paste(editor.view, { text: "a\nb\nc" })).toBe(true);
    expect(paragraphsOf(editor).map((q) => q.runs.map((run) => run.t).join(""))).toEqual(["Helloa", "b", "c world"]);
    expect(editor.changes).toHaveLength(1);
  });

  it("puts one line in as words, keeping the paragraph and the formatting at the caret", () => {
    const editor = mount(light, text({ runs: [{ t: "bold", b: true, color: "accent2" }], list: "bullet", align: "center" }), { autoFocus: "start" });
    selectRange(editor.view, 5);
    paste(editor.view, { text: " more" });
    expect(paragraphsOf(editor)).toEqual([{ runs: [{ t: "bold more", b: true, color: "accent2" }], list: "bullet", align: "center" }]);
  });

  it("replaces the selection", () => {
    const editor = mount(light, text(p({ t: "Hello world" })), { autoFocus: "start" });
    selectRange(editor.view, 1, 6);
    paste(editor.view, { text: "Bye" });
    expect(paragraphsOf(editor)).toEqual([p({ t: "Bye world" })]);
  });

  it("carries a list on when lines are pasted into a list item", () => {
    const editor = mount(light, text({ runs: [{ t: "one" }], list: "bullet", level: 1 }), { autoFocus: "start" });
    selectRange(editor.view, 4);
    paste(editor.view, { text: "\ntwo\nthree" });
    expect(paragraphsOf(editor)).toEqual([
      { runs: [{ t: "one" }], list: "bullet", level: 1 },
      { runs: [{ t: "two" }], list: "bullet", level: 1 },
      { runs: [{ t: "three" }], list: "bullet", level: 1 },
    ]);
  });

  it("keeps the bold, italic, underline, strike, links and lists of pasted HTML", () => {
    const editor = mount(light, text(p({ t: "" })), { autoFocus: "start" });
    paste(editor.view, { html: '<p>Some <b>bold</b> and <a href="https://x.y">link</a></p><ul><li>item <i>one</i></li><li>item two</li></ul>', text: "Some bold and link\nitem one\nitem two" });
    expect(paragraphsOf(editor)).toEqual([
      { runs: [{ t: "Some " }, { t: "bold", b: true }, { t: " and " }, { t: "link", link: "https://x.y" }] },
      { runs: [{ t: "item " }, { t: "one", i: true }], list: "bullet" },
      { runs: [{ t: "item two" }], list: "bullet" },
    ]);
  });

  it("takes the font, colour and size of where it lands, not of where it came from", () => {
    const editor = mount(light, text(p({ t: "Target", color: "accent2", size: 30, font: "Georgia", b: true })), { autoFocus: "start" });
    selectRange(editor.view, 7);
    paste(editor.view, { html: '<span style="color: red; font-size: 8pt; font-family: Papyrus; font-weight: bold; font-style: italic">Pasted</span>', text: "Pasted" });
    expect(paragraphsOf(editor)[0]?.runs).toEqual([{ t: "Target", color: "accent2", size: 30, font: "Georgia", b: true }, { t: "Pasted", color: "accent2", size: 30, font: "Georgia", b: true, i: true }]);
  });

  it("does not take the bold of the caret for HTML that is not bold, but does for plain text", () => {
    const html = mount(light, text(p({ t: "Target", b: true })), { autoFocus: "start" });
    selectRange(html.view, 7);
    paste(html.view, { html: "<p>html</p>", text: "html" });
    expect(paragraphsOf(html)[0]?.runs).toEqual([{ t: "Target", b: true }, { t: "html" }]);
    const plain = mount(light, text(p({ t: "Target", b: true })), { autoFocus: "start" });
    selectRange(plain.view, 7);
    paste(plain.view, { text: " plain" });
    expect(paragraphsOf(plain)[0]?.runs).toEqual([{ t: "Target plain", b: true }]);
  });

  it("puts several paragraphs into an empty one, with the lists they hold", () => {
    const editor = mount(light, text(p({ t: "before" }), p({ t: "" })), { autoFocus: "end" });
    paste(editor.view, { html: "<ol><li>first</li><li>second</li></ol>", text: "first\nsecond" });
    expect(paragraphsOf(editor)).toEqual([p({ t: "before" }), { runs: [{ t: "first" }], list: "number" }, { runs: [{ t: "second" }], list: "number" }]);
  });

  it("pastes plain text with Mod-Shift-v even when there is HTML", () => {
    const editor = mount(light, text(p({ t: "" })), { autoFocus: "start" });
    fireEvent.keyDown(editor.view.dom, { key: "V", ctrlKey: true, shiftKey: true, keyCode: 86 });
    paste(editor.view, { html: "<p><b>styled</b></p>", text: "plain" });
    expect(paragraphsOf(editor)).toEqual([p({ t: "plain" })]);
    paste(editor.view, { html: "<p><b>styled</b></p>", text: "plain" });
    expect(paragraphsOf(editor)[0]?.runs).toEqual([{ t: "plain" }, { t: "styled", b: true }]);
  });

  it("leaves a paste with nothing in it to the editor, and one with only an image", () => {
    const editor = mount(light, text(p({ t: "x" })), { autoFocus: "start" });
    expect(paste(editor.view, {})).toBe(false);
    paste(editor.view, { html: '<img src="x.png">' });
    expect(paragraphsOf(editor)).toEqual([p({ t: "x" })]);
  });

  it("puts back what was copied from a box of the editor, colours and sizes and all", () => {
    const original = text(p({ t: "pl" }, { t: "ain", b: true, color: "accent2", size: 30, link: "https://x.y", lang: "en" } as Run), { runs: [{ t: "item" }], list: "number", level: 1, align: "center" });
    const source = mount(light, original, { autoFocus: "start" });
    selectRange(source.view, 1, source.view.state.doc.content.size - 1);
    const slice = source.view.state.selection.content();
    const { dom, text: plain } = source.view.serializeForClipboard(slice);
    expect(plain).toBe("plain\nitem");
    const holder = document.createElement("div");
    holder.appendChild(dom);
    const html = holder.innerHTML;
    expect(html).toContain("data-pm-slice");
    expect(html).toContain('href="https://x.y"');
    const target = mount(light, text(p({ t: "" })), { autoFocus: "start" });
    expect(paste(target.view, { html, text: plain })).toBe(true);
    expect(paragraphsOf(target).map((q) => ({ ...q, runs: q.runs.map((run) => ({ ...run })) }))).toEqual([
      { runs: [{ t: "pl" }, { t: "ain", b: true, color: "accent2", size: 30, link: "https://x.y", lang: "en" } as Run] },
      { runs: [{ t: "item" }], list: "number", level: 1, align: "center" },
    ]);
  });
});
