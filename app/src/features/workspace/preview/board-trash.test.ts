import { describe, expect, it } from "vitest";

import { MemoryVault } from "./memory-vault";

const BOARD = "projects/trip/boards/route.canvas";
const TEXT = JSON.stringify({ nodes: [], edges: [], "x-kasten": { title: "Route ideas" } });

describe("boards in the preview's trash", () => {
  it("trashes a board, lists it by title and puts it back", async () => {
    const vault = new MemoryVault({ [BOARD]: TEXT });
    const trashed = await vault.trash(BOARD);
    expect(await vault.boards()).toEqual([]);
    expect(await vault.listTrash()).toEqual([{ trashed, original: BOARD, title: "Route ideas", when: expect.any(String), inside: 0 }]);
    await expect(vault.restore(trashed)).rejects.toThrow();
    expect(await vault.restoreBoard(trashed)).toBe(BOARD);
    expect((await vault.boards()).map((b) => b.title)).toEqual(["Route ideas"]);
    expect(await vault.listTrash()).toEqual([]);
  });

  it("puts a board back beside one that took its place", async () => {
    const vault = new MemoryVault({ [BOARD]: TEXT });
    const trashed = await vault.trash(BOARD);
    await vault.createBoard("Route", "trip");
    expect(await vault.restoreBoard(trashed)).toBe("projects/trip/boards/route-2.canvas");
  });
});
