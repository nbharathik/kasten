// Property writes to one note reach the vault in the order they were made.

import { afterEach, describe, expect, it, vi } from "vitest";

import type { NoteFile } from "../../lib/vault/types";
import { MemoryVault } from "../workspace/preview/memory-vault";
import { useWorkspace } from "../workspace/store";
import { setValue } from "./actions";

const TASK = "name: task\nproperties:\n  - {key: status, type: select, options: [Todo, Doing, Done]}\n";

afterEach(() => vi.restoreAllMocks());

describe("setting a note's properties", () => {
  it("writes one note's changes one after another, in order", async () => {
    const vault = new MemoryVault({ "tags/task.yaml": TASK, "library/a.md": "---\ntitle: A\ntags: [task]\n---\nA\n" });
    await useWorkspace.getState().connect({ client: vault });
    const real = vault.updateProps.bind(vault);
    const order: string[] = [];
    // The first write is slow; the second must still land after it.
    vi.spyOn(vault, "updateProps").mockImplementation(async (path: string, props: Record<string, unknown>): Promise<NoteFile> => {
      const status = String(props.status);
      if (status === "Doing") await new Promise((done) => setTimeout(done, 30));
      order.push(status);
      return real(path, props);
    });
    const first = setValue("library/a.md", "status", "Doing");
    const second = setValue("library/a.md", "status", "Done");
    await Promise.all([first, second]);
    expect(order).toEqual(["Doing", "Done"]);
    expect((await vault.read("library/a.md")).meta.props.status).toBe("Done");
  });
});
