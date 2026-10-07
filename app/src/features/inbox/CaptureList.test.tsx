import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoryVault } from "../workspace/preview/memory-vault";
import { derive } from "../workspace/store-layout";
import { useWorkspace } from "../workspace/store";
import { initialLayout } from "../workspace/tabs";
import { inboxCards } from "../workspace/tree";
import { Inbox } from "./Inbox";
import { Triage } from "./Triage";

const card = (title: string, body: string, at: string) => `---\ntitle: ${title}\ntype: card\ncreated: ${at}\n---\n${body}\n`;

const SEED = {
  "projects/pottery/_project.md": "---\ntitle: Pottery\ntype: project\n---\nThe studio.\n",
  "inbox/one.md": card("First thought", "One.", "2026-09-20T09:03:00Z"),
  "inbox/two.md": card("Second thought", "Two.", "2026-09-20T09:02:00Z"),
  "inbox/three.md": card("Third thought", "Three.", "2026-09-20T09:01:00Z"),
};

let vault: MemoryVault;

async function start() {
  vault = new MemoryVault(SEED);
  useWorkspace.setState({ client: vault, ready: true, notes: await vault.list(), ...derive(initialLayout()), stack: [], recent: [], toasts: [] });
  return render(<Inbox />);
}

const row = (title: string) => screen.getByRole("button", { name: new RegExp(`^${title}`) });

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("the Inbox list from the keyboard", () => {
  it("moves with arrow keys and marks the focused card done", async () => {
    await start();
    row("First thought").focus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(row("Second thought"));
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(row("Third thought"));
    fireEvent.keyDown(document.activeElement!, { key: "k" });
    expect(document.activeElement).toBe(row("Second thought"));
    await act(async () => fireEvent.keyDown(document.activeElement!, { key: "d" }));
    await waitFor(() => expect(screen.queryByText("Second thought")).toBeNull());
    expect((await vault.list()).some((n) => n.path === "inbox/two.md")).toBe(false);
    // The card below takes the focus.
    await waitFor(() => expect(document.activeElement).toBe(row("Third thought")));
  });

  it("opens the tag picker with T", async () => {
    await start();
    row("First thought").focus();
    fireEvent.keyDown(document.activeElement!, { key: "t" });
    expect(await screen.findByRole("dialog", { name: "Add tag" })).toBeTruthy();
  });
});

describe("picking several captures", () => {
  it("acts on every picked card at once", async () => {
    await start();
    fireEvent.click(screen.getByRole("checkbox", { name: "Pick First thought" }));
    row("Third thought").focus();
    fireEvent.keyDown(document.activeElement!, { key: "x" });
    const bar = screen.getByRole("toolbar", { name: "Picked cards" });
    expect(bar.textContent).toContain("2 cards picked");
    fireEvent.click(within(bar).getByRole("button", { name: "Move to a project" }));
    await act(async () => fireEvent.click(await screen.findByRole("option", { name: /Pottery/ })));
    await waitFor(() => expect(screen.queryByRole("toolbar", { name: "Picked cards" })).toBeNull());
    const moved = (await vault.list()).filter((n) => n.project === "pottery" && n.kind === "card").map((n) => n.title);
    expect(moved.sort()).toEqual(["First thought", "Third thought"]);
    expect(screen.getByText("Second thought")).toBeTruthy();
  });

  it("Escape stops picking", async () => {
    await start();
    fireEvent.click(screen.getByRole("checkbox", { name: "Pick First thought" }));
    expect(screen.getByRole("toolbar", { name: "Picked cards" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("toolbar", { name: "Picked cards" })).toBeNull();
  });
});

describe("triage", () => {
  it("shows the whole capture, not only its start", async () => {
    const long = Array.from({ length: 80 }, (_, i) => `Line ${i + 1} of a long thought.`).join("\n\n");
    vault = new MemoryVault({ "inbox/long.md": card("A long thought", long, "2026-09-20T09:00:00Z") });
    useWorkspace.setState({ client: vault, ready: true, notes: await vault.list(), ...derive(initialLayout()), stack: [], recent: [], toasts: [] });
    render(<Triage cards={inboxCards(await vault.list())} onExit={() => {}} />);
    await waitFor(() => expect(screen.getByRole("region", { name: "The whole card" }).textContent).toContain("Line 80 of a long thought."));
  });
});
