import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { blocksOf, ReadableText } from "./ReadableText";

afterEach(cleanup);

const NOTE = `# Weekend plan

Saturday starts **early**, with *coffee* and \`tea\`.
See [[Packing list|the list]] and [the forecast](https://example.com).

> [!tip] Remember
> Charge the camera.

- [ ] Book the ferry
- [x] Pack a jumper
  - Wool, not cotton
1. First stop

\`\`\`
a <b> code </b> line
\`\`\`

| Day | Plan |
|---|---|
| Sat | Walk |

<span style="color: red">Red text</span> and <script>alert(1)</script> stay text.
`;

describe("a version's text for reading", () => {
  it("draws Markdown as text, without its marks", () => {
    const { container } = render(<ReadableText markdown={NOTE} />);
    expect(screen.getByRole("heading", { name: "Weekend plan" })).toBeTruthy();
    expect(container.querySelector("strong")!.textContent).toBe("early");
    expect(container.querySelector("em")!.textContent).toBe("coffee");
    expect(container.textContent).toContain("See the list and the forecast.");
    expect(container.textContent).not.toMatch(/\*\*|\[\[|\]\(|^#/);
    const callout = container.querySelector("blockquote.is-callout")!;
    expect(callout.querySelector("strong")!.textContent).toBe("Remember");
    expect(callout.textContent).toContain("Charge the camera.");
    const items = [...container.querySelectorAll(".kasten-readable-item")].map((i) => i.textContent);
    expect(items).toEqual(["☐Book the ferry", "☑Pack a jumper", "•Wool, not cotton", "1.First stop"]);
    expect(container.querySelector("pre")!.textContent).toBe("a <b> code </b> line");
    expect([...container.querySelectorAll("th, td")].map((c) => c.textContent)).toEqual(["Day", "Plan", "Sat", "Walk"]);
  });

  it("reads underscores around words as italics, and inside a word as text", () => {
    const { container } = render(<ReadableText markdown={"An _autonomous_ note, (_quiet_) and snake_case_name stay.\n"} />);
    expect([...container.querySelectorAll("em")].map((e) => e.textContent)).toEqual(["autonomous", "quiet"]);
    expect(container.textContent).toBe("An autonomous note, (quiet) and snake_case_name stay.");
  });

  it("keeps HTML as its text, never as markup", () => {
    const { container } = render(<ReadableText markdown={"<span style=\"color: red\">Red</span> <img src=x onerror=alert(1)> <script>alert(1)</script>"} />);
    expect(container.querySelector("span[style], img, script")).toBeNull();
    expect(container.textContent).toContain("Red");
  });

  it("flows a paragraph's lines, as Markdown does, and keeps its hard breaks", () => {
    const { container } = render(<ReadableText markdown={"One line\nwraps on.\nEnds here  \nAfter a break"} />);
    const para = container.querySelector("p")!;
    expect(para.textContent).toBe("One line wraps on. Ends hereAfter a break");
    expect(para.querySelectorAll("br")).toHaveLength(1);
  });

  it("reads toggles, rules and nested items", () => {
    expect(blocksOf("<details>\n<summary>More</summary>\n\nInside\n\n</details>\n---\n    - deep").map((b) => b.kind)).toEqual(["heading", "paragraph", "rule", "item"]);
    expect(blocksOf("    - deep")[0]).toMatchObject({ depth: 2 });
  });
});
