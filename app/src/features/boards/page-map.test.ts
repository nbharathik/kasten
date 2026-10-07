import { describe, expect, it } from "vitest";

import { MemoryVault } from "../workspace/preview/memory-vault";
import { mapFromPage, outlineTree } from "./page-map";

const TRIP = `A week by the sea.

## Where to stay
- The old town, near the castle
- Baixa
  - close to the trams

## What to eat
1. **Pastéis** de nata
2. Bacalhau, see [[Recipes|the recipe]]

Some notes that are not part of the map.

### Before we go
- [ ] Flights
- [x] Insurance

\`\`\`
- not a list, code
\`\`\`
`;

describe("a page's outline as a tree", () => {
  it("takes headings and list items, nested as written, in plain words", () => {
    const tree = outlineTree(TRIP);
    const flat = (nodes: ReturnType<typeof outlineTree>, depth = 0): string[] => nodes.flatMap((n) => [`${"  ".repeat(depth)}${n.text}`, ...flat(n.children, depth + 1)]);
    expect(flat(tree)).toEqual([
      "Where to stay",
      "  The old town, near the castle",
      "  Baixa",
      "    close to the trams",
      "What to eat",
      "  Pastéis de nata",
      "  Bacalhau, see the recipe",
      "  Before we go",
      "    ☐ Flights",
      "    ☑ Insurance",
    ]);
  });

  it("keeps big pages to a size a board can show", () => {
    const long = Array.from({ length: 200 }, (_, i) => `- item ${i}`).join("\n");
    expect(outlineTree(long, 50)).toHaveLength(50);
    expect(outlineTree("Just a paragraph.\n")).toEqual([]);
  });
});

describe("a mind map from a page", () => {
  it("makes a board with the page at the root and its outline as branches", async () => {
    const vault = new MemoryVault({ "projects/trip/_project.md": "---\ntitle: Trip\ntype: project\n---\n", "projects/trip/pages/seaside.md": `---\ntitle: Seaside trip\n---\n${TRIP}` });
    const note = (await vault.list()).find((n) => n.title === "Seaside trip")!;
    const path = await mapFromPage(vault, note);
    expect(path.startsWith("projects/trip/boards/")).toBe(true);
    const board = await vault.board(path);
    expect(board.title).toBe("Seaside trip map");
    const root = board.nodes.find((n) => n.file === note.path)!;
    const texts = board.nodes.filter((n) => n.kind === "text").map((n) => n.text);
    expect(texts).toContain("Where to stay");
    expect(texts).toContain("close to the trams");
    expect(board.edges).toHaveLength(texts.length);
    // Laid out as a tree from the left: every branch right of the root.
    const byText = (t: string) => board.nodes.find((n) => n.text === t)!;
    expect(byText("Where to stay").x).toBeGreaterThan(root.x);
    expect(byText("Baixa").x).toBeGreaterThan(byText("Where to stay").x);
    expect(byText("What to eat").y).toBeGreaterThan(byText("Where to stay").y);
    expect(board.edges.every((e) => e.fromSide === "right" && e.toSide === "left")).toBe(true);
  });

  it("says so when a page has nothing to map", async () => {
    const vault = new MemoryVault({ "library/plain.md": "---\ntitle: Plain\n---\nJust words.\n" });
    const note = (await vault.list())[0]!;
    await expect(mapFromPage(vault, note)).rejects.toThrow(/headings or lists/);
  });
});
