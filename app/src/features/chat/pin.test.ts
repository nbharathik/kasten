// Pinning an answer makes a card in the Inbox. When its text then fails to
// save, the notice says the card is there and leads to it.

import { beforeEach, describe, expect, it } from "vitest";

import { MemoryVault } from "../workspace/preview/memory-vault";
import { useWorkspace } from "../workspace/store";
import { pinAnswer } from "./actions";
import type { Answer } from "./thread";

const answer: Answer = { id: "a1", role: "assistant", turn: null, provider: "Claude", model: "m", parts: [{ kind: "text", text: "Pack light\n\nOne bag." }], status: "done", error: null, pinned: null };

beforeEach(() => {
  localStorage.clear();
  useWorkspace.setState({ toasts: [] });
});

describe("pinning an answer", () => {
  it("leads to the card when its text could not be saved", async () => {
    const vault = new MemoryVault({});
    vault.saveBody = async () => {
      throw new Error("The disk is full");
    };
    await useWorkspace.getState().connect({ client: vault });
    expect(await pinAnswer("t1", answer)).toBeNull();
    const notice = useWorkspace.getState().toasts.at(-1)!;
    expect(notice.text).toBe("The card “Pack light” is in the Inbox, but its text was not saved: The disk is full");
    expect(notice.action?.label).toBe("Open");
    const card = (await vault.list()).find((n) => n.title === "Pack light")!;
    notice.action!.run();
    expect(useWorkspace.getState().place.path).toBe(card.path);
  });
});
