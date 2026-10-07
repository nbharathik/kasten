// Cards follow their notes: a rename or move points every board at the
// new path, as the core's `relink_boards` does (engine/ops.rs).

import { describe, expect, it } from "vitest";

import { MemoryVault } from "./memory-vault";

const BOARD = JSON.stringify({
  nodes: [
    { id: "n1", type: "file", file: "projects/demo/cards/untitled.md", x: 0, y: 0, width: 320, height: 180 },
    { id: "n2", type: "text", text: "Loose", x: 400, y: 0, width: 260, height: 120 },
  ],
  edges: [],
});

const vault = () =>
  new MemoryVault({
    "projects/demo/_project.md": "---\ntitle: Demo\ntype: project\n---\n",
    "projects/demo/cards/untitled.md": "---\ntitle: untitled\ntype: card\n---\nBody\n",
    "projects/demo/boards/plan.canvas": BOARD,
    "library/other.canvas": BOARD,
  });

describe("boards follow notes that move", () => {
  it("points every board's card at a renamed note", async () => {
    const client = vault();
    const { note } = await client.rename("projects/demo/cards/untitled.md", "Hello board");
    expect(note.meta.path).toBe("projects/demo/cards/hello-board.md");
    for (const board of ["projects/demo/boards/plan.canvas", "library/other.canvas"]) {
      const view = await client.board(board);
      expect(view.nodes[0]).toMatchObject({ file: "projects/demo/cards/hello-board.md", title: "Hello board" });
      expect(view.nodes[0]!.missing).toBeUndefined();
    }
  });

  it("points cards at notes moved to another folder", async () => {
    const client = vault();
    const moved = await client.move("projects/demo/cards/untitled.md", null);
    expect(moved.meta.path).toBe("library/untitled.md");
    expect((await client.board("library/other.canvas")).nodes[0]).toMatchObject({ file: "library/untitled.md" });
  });
});
