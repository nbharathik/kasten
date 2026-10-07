// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Notes, inline } from "./notes.tsx";

const html = (markdown: string): string => renderToStaticMarkup(<Notes markdown={markdown} />);
const line = (text: string): string => renderToStaticMarkup(<>{inline(text)}</>);

describe("speaker notes", () => {
  it("are paragraphs, and a line break in one stays a line break", () => {
    expect(html("First line\nsecond line\n\nAnother paragraph")).toBe('<div class="ks-show-notes"><p>First line<br/>second line</p><p>Another paragraph</p></div>');
  });

  it("have bold, italic, struck and code words", () => {
    expect(line("a **b** _c_ *d* ~~e~~ `f`")).toBe("a <strong>b</strong> <em>c</em> <em>d</em> <s>e</s> <code>f</code>");
    expect(line("snake_case_word and 2*3*4")).toBe("snake_case_word and 2<em>3</em>4");
  });

  it("have lists, numbered lists, headings, quotes, code and rules", () => {
    expect(html("- one\n- two")).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(html("1. one\n2) two")).toContain("<ol><li>one</li><li>two</li></ol>");
    expect(html("# Title\n## Sub")).toContain("<h3>Title</h3><h4>Sub</h4>");
    expect(html("> quoted\n> more")).toContain("<blockquote>quoted<br/>more</blockquote>");
    expect(html("```\nlet a = 1;\n```")).toContain("<pre><code>let a = 1;</code></pre>");
    expect(html("above\n\n---\n\nbelow")).toContain("<hr/>");
  });

  it("link only to web and mail addresses, and open them apart from the talk", () => {
    expect(line("[docs](https://example.com/a?b=1)")).toBe('<a href="https://example.com/a?b=1" target="_blank" rel="noopener noreferrer">docs</a>');
    expect(line("[mail](mailto:a@b.c)")).toContain('href="mailto:a@b.c"');
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "//evil.example", "vbscript:x"]) {
      expect(line(`[x](${bad})`), bad).not.toContain("<a ");
    }
  });

  it("never turn words into markup", () => {
    expect(html("<script>alert(1)</script> & <b>x</b>")).toBe('<div class="ks-show-notes"><p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;b&gt;x&lt;/b&gt;</p></div>');
  });

  it("are empty markup when empty", () => {
    expect(html("")).toBe('<div class="ks-show-notes"></div>');
    expect(html("\n\n  \n")).toBe('<div class="ks-show-notes"></div>');
  });
});
