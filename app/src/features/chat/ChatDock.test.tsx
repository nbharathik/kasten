import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useShell } from "../../lib/store";
import { AppShell } from "../../shell/AppShell";
import { MemoryVault } from "../workspace/preview/memory-vault";
import { derive } from "../workspace/store-layout";
import { useWorkspace } from "../workspace/store";
import { initialLayout } from "../workspace/tabs";
import { resetChat, scriptedChat } from "./test-kit";

const SEED = {
  "library/plan.md": "---\ntitle: Plan\n---\nThe plan.\n",
  "library/notes.md": "---\ntitle: Notes\n---\nSome notes.\n",
};

beforeEach(() => {
  localStorage.clear();
  useWorkspace.setState({ ...derive(initialLayout()), notes: [], recent: [], stack: [], stackOpen: false });
  useShell.setState({ chatOpen: false });
});
afterEach(cleanup);

describe("the chat dock", () => {
  it("opens from the top right and talks about every page open", async () => {
    const chat = scriptedChat();
    resetChat(chat);
    render(<AppShell connect={async () => ({ client: new MemoryVault(SEED) })} />);
    await screen.findByRole("navigation", { name: "Sidebar" });
    await act(async () => useWorkspace.getState().openPath("library/plan.md"));
    await act(async () => useWorkspace.getState().openPath("library/notes.md", "split"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Chat" })));
    const dock = await screen.findByRole("complementary", { name: "Chat dock" }, { timeout: 10_000 });
    const context = await within(dock).findByRole("group", { name: "Context" });
    await expect.poll(() => context.textContent).toContain("2 open pages");
    const box = within(dock).getByRole("textbox", { name: "Message" });
    fireEvent.change(box, { target: { value: "How do these fit together?" } });
    await act(async () => fireEvent.keyDown(box, { key: "Enter" }));
    expect(chat.requests[0]!.context).toEqual([{ kind: "cards", label: "2 open pages", ref: ["library/notes.md", "library/plan.md"] }]);
    // Closing a page updates the context.
    await act(async () => useWorkspace.getState().closePane(useWorkspace.getState().layout.focus));
    await expect.poll(() => context.textContent).toContain("Plan");
    await act(async () => fireEvent.click(within(dock).getByRole("button", { name: "Close the chat" })));
    expect(screen.queryByRole("complementary", { name: "Chat dock" })).toBeNull();
  });

  it("leaves the open pages out once removed, until other pages open", async () => {
    resetChat(scriptedChat());
    const vault = new MemoryVault(SEED);
    render(<AppShell connect={async () => ({ client: vault })} />);
    await screen.findByRole("navigation", { name: "Sidebar" });
    await act(async () => useWorkspace.getState().openPath("library/plan.md"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Chat" })));
    const dock = await screen.findByRole("complementary", { name: "Chat dock" }, { timeout: 10_000 });
    const context = await within(dock).findByRole("group", { name: "Context" });
    await expect.poll(() => context.textContent).toContain("Plan");
    await act(async () => fireEvent.click(within(context).getByRole("button", { name: "Remove Plan" })));
    expect(context.textContent).not.toContain("Plan");
    // The page is saved: the list of notes changes, the open pages do not.
    const saved = await vault.saveBody("library/plan.md", "The plan, longer.\n", (await vault.read("library/plan.md")).hash);
    await act(async () => useWorkspace.getState().noteChanged(saved.note.meta));
    await act(async () => new Promise((done) => setTimeout(done, 50)));
    expect(within(dock).queryByRole("button", { name: "Remove Plan" })).toBeNull();
    // Another page opens: the chip follows what is open again.
    await act(async () => useWorkspace.getState().openPath("library/notes.md", "split"));
    await expect.poll(() => within(dock).queryByRole("button", { name: "Remove 2 open pages" })).not.toBeNull();
  });
});
