import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseBlocks } from "./blocks";
import { parseInline, safeHref, unsaidDestination } from "./inline";
import { Markdown } from "./Markdown";

afterEach(cleanup);

const show = (text: string, open = vi.fn()) => ({ open, ...render(<Markdown text={text} onOpenTitle={open} />) });
const types = (text: string) => parseBlocks(text).map((b) => b.type);

describe("answer Markdown", () => {
  it("reads paragraphs, headings, lists, code, quotes, rules and tables", () => {
    const text = [
      "# Plan",
      "First line",
      "second line.",
      "",
      "- one",
      "- [x] two",
      "  - nested",
      "",
      "3. three",
      "4. four",
      "",
      "```ts",
      "const a = 1;",
      "```",
      "> quoted",
      "",
      "---",
      "| Day | Place |",
      "|:----|------:|",
      "| Mon | Hilltown |",
    ].join("\n");
    expect(types(text)).toEqual(["heading", "paragraph", "list", "list", "code", "quote", "rule", "table"]);
    const { container } = show(text);
    expect(screen.getByRole("heading", { level: 3, name: "Plan" })).toBeTruthy();
    expect(container.querySelector("p")!.innerHTML).toBe("First line<br>second line.");
    const bullets = container.querySelector("ul")!;
    expect(within(bullets).getAllByRole("listitem")).toHaveLength(3);
    expect((within(bullets).getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
    expect(bullets.querySelector("li li")!.textContent).toBe("nested");
    expect(container.querySelector("ol")!.getAttribute("start")).toBe("3");
    expect(container.querySelector("pre code")!.textContent).toBe("const a = 1;");
    expect(container.querySelector(".kasten-md-code-bar")!.textContent).toContain("ts");
    expect(container.querySelector("blockquote")!.textContent).toBe("quoted");
    expect(container.querySelector("hr")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Place" }).style.textAlign).toBe("right");
    expect(screen.getByRole("cell", { name: "Hilltown" })).toBeTruthy();
  });

  it("marks up bold, italic, code, strikethrough and links", () => {
    const { container } = show("**bold** and *it* and _it_ and `a*b*` and ~~gone~~, ***both***, snake_case_name, 2 * 3 * 4, [site](https://example.com) and https://kasten.app/docs.");
    expect(container.querySelector("strong")!.textContent).toBe("bold");
    expect([...container.querySelectorAll("em")].map((e) => e.textContent)).toEqual(["it", "it", "both"]);
    expect(container.querySelector("code")!.textContent).toBe("a*b*");
    expect(container.querySelector("del")!.textContent).toBe("gone");
    expect(container.textContent).toContain("snake_case_name, 2 * 3 * 4");
    const links = screen.getAllByRole("link");
    expect(links.map((a) => [a.textContent, a.getAttribute("href"), a.getAttribute("target")])).toEqual([
      ["site", "https://example.com", "_blank"],
      ["https://kasten.app/docs", "https://kasten.app/docs", "_blank"],
    ]);
  });

  it("opens [[wiki links]] as pages", () => {
    const { open } = show("See [[Seaside trip]], [[Paper draft#Method|the method]] and ![[Sketch]].");
    const link = screen.getByRole("link", { name: "Seaside trip" });
    fireEvent.click(link);
    expect(open).toHaveBeenLastCalledWith("Seaside trip", "here");
    fireEvent.click(screen.getByRole("link", { name: "the method" }), { ctrlKey: true });
    expect(open).toHaveBeenLastCalledWith("Paper draft", "tab");
    fireEvent.click(screen.getByRole("link", { name: "Sketch" }), { shiftKey: true });
    expect(open).toHaveBeenLastCalledWith("Sketch", "stack");
    expect(parseInline("[[Title#Part]]")).toEqual([{ type: "wiki", title: "Title", label: "Title › Part" }]);
  });

  it("shows the site a link goes to when its words name another or none", () => {
    const { container } = show(
      "[your bank](https://bank.example.net/login), [paypal.com](https://paypal.com.evil.example/), [Kasten](https://kasten.app/docs), [kasten.app](https://Kasten.app), https://kasten.app/x, https://bank.example@evil.example/ and [write](mailto:ada@example.com).",
    );
    const where = [...container.querySelectorAll(".kasten-md-where")].map((s) => s.textContent);
    expect(where).toEqual([" (bank.example.net)", " (paypal.com.evil.example)", " (kasten.app)", " (evil.example)", " (ada@example.com)"]);
    expect(screen.getByRole("link", { name: "your bank" }).getAttribute("title")).toBe("https://bank.example.net/login");
    // A look-alike letter shows as the address the browser really visits.
    expect(unsaidDestination("https://b\u0430nk.example/", [{ type: "text", text: "b\u0430nk.example" }])).toMatch(/^xn--/);
  });

  it("keeps HTML and unsafe links as text", () => {
    const { container } = show('<script>alert("x")</script>\n\n<img src=x onerror="alert(1)"> and [click](javascript:alert(1)) and ![pic](data:image/png;base64,AAA) and <b>bold</b>');
    expect(container.querySelector("script, img, b, iframe")).toBeNull();
    expect(container.textContent).toContain('<script>alert("x")</script>');
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(container.textContent).toContain("click");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(safeHref("JavaScript:alert(1)")).toBeNull();
    expect(safeHref("java\tscript:alert(1)")).toBeNull();
    expect(safeHref("mailto:ada@example.com")).toBe("mailto:ada@example.com");
    expect(safeHref("/etc/passwd")).toBeNull();
  });

  it("shows half-streamed text as it stands", () => {
    expect(types("```py\nprint(1)")).toEqual(["code"]);
    expect(parseInline("some **bold")).toEqual([{ type: "text", text: "some **bold" }]);
    expect(parseInline("a [link](/docs")).toEqual([{ type: "text", text: "a [link](/docs" }]);
    expect(parseInline("see [[Lis")).toEqual([{ type: "text", text: "see [[Lis" }]);
    // A year at the start of a line does not start a list inside a paragraph.
    expect(types("It came out in\n1984. Orwell wrote it.")).toEqual(["paragraph"]);
    expect(types("Steps:\n1. Pack\n2. Go")).toEqual(["paragraph", "list"]);
  });

  it("draws deep or runaway marks as text, fast, instead of failing", () => {
    // A looping model can send one line of thousands of list or quote marks.
    for (const line of ["- ".repeat(3000) + "deep", ">".repeat(9000) + " deep"]) {
      expect(() => parseBlocks(line)).not.toThrow();
      cleanup();
      expect(show(line).container.textContent).toContain("deep");
    }
    expect(() => parseInline("*_".repeat(4000) + "x" + "_*".repeat(4000))).not.toThrow();
    const started = performance.now();
    parseInline("*a ".repeat(5000));
    parseInline("_a ".repeat(5000));
    expect(performance.now() - started).toBeLessThan(250);
  });
});

