import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoryVault } from "../workspace/preview/memory-vault";
import { derive } from "../workspace/store-layout";
import { useWorkspace } from "../workspace/store";
import { initialLayout } from "../workspace/tabs";
import { Triage } from "./Triage";

let vault: MemoryVault;

const SEED = {
  "projects/pottery/_project.md": "---\ntitle: Pottery\ntype: project\n---\nThe studio.\n",
  "projects/pottery/cards/kiln.md": "---\ntitle: Kiln firing\ntype: card\ntags: [studio]\n---\nStoneware glaze needs a slow kiln firing to cone six.\n",
  "projects/pottery/cards/glaze.md": "---\ntitle: Glaze recipes\ntype: card\ntags: [studio]\n---\nA stoneware glaze for the kiln, cone six.\n",
  "library/music.md": "---\ntitle: Music\n---\nScales and chords.\n",
  "library/books.md": "---\ntitle: Books\n---\nNovels to read.\n",
  "inbox/test-kiln.md": "---\ntitle: Test the new kiln\ntype: card\n---\nFire a stoneware glaze test at cone six.\n",
};

async function start() {
  vault = new MemoryVault(SEED);
  useWorkspace.setState({ client: vault, ready: true, notes: await vault.list(), ...derive(initialLayout()), stack: [], recent: [], toasts: [] });
  const cards = (await vault.list()).filter((n) => n.path.startsWith("inbox/"));
  return render(<Triage cards={cards} onExit={() => {}} />);
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("triage's suggested home", () => {
  it("offers the project and tags its similar notes share, and S moves it there", async () => {
    await start();
    const home = await screen.findByLabelText("Suggested home");
    expect(home.textContent).toContain("Pottery");
    expect(home.textContent).toContain("#studio");
    await act(async () => fireEvent.click(within(home).getByRole("button", { name: /#studio/ })));
    await waitFor(async () => expect((await vault.read("inbox/test-kiln.md")).meta.tags).toContain("studio"));
    await act(async () => fireEvent.keyDown(window, { key: "s" }));
    await waitFor(async () => expect((await vault.list()).find((n) => n.title === "Test the new kiln")?.project).toBe("pottery"));
  });

  it("offers nothing when its notes do not agree", async () => {
    // Only one note is like it: one is not enough to go on.
    vault = new MemoryVault({ ...SEED, "projects/pottery/cards/glaze.md": "---\ntitle: Studio rent\ntype: card\n---\nPay by the first.\n" });
    useWorkspace.setState({ client: vault, ready: true, notes: await vault.list(), ...derive(initialLayout()), stack: [], recent: [], toasts: [] });
    const cards = (await vault.list()).filter((n) => n.path.startsWith("inbox/"));
    render(<Triage cards={cards} onExit={() => {}} />);
    await screen.findByRole("region", { name: "Triage" });
    // Give the similar notes time to come back.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByLabelText("Suggested home")).toBeNull();
  });
});

describe("triage's keys", () => {
  it("leaves keys for another pane, and keys something else took", async () => {
    // Triage in one pane, another pane focused beside it.
    const view = await start();
    const panes = document.createElement("div");
    panes.innerHTML = '<div class="kasten-pane"></div><div class="kasten-pane is-focused"></div>';
    document.body.append(panes);
    panes.firstElementChild!.append(view.container);
    await act(async () => fireEvent.keyDown(window, { key: "d" }));
    expect((await vault.list()).some((n) => n.path === "inbox/test-kiln.md")).toBe(true);
    // In the focused pane, a key another handler took is left alone too.
    panes.firstElementChild!.classList.add("is-focused");
    panes.lastElementChild!.classList.remove("is-focused");
    const taken = new KeyboardEvent("keydown", { key: "d", cancelable: true });
    taken.preventDefault();
    await act(async () => void window.dispatchEvent(taken));
    expect((await vault.list()).some((n) => n.path === "inbox/test-kiln.md")).toBe(true);
    // A free key in its own pane is triage's.
    await act(async () => fireEvent.keyDown(window, { key: "d" }));
    await waitFor(async () => expect((await vault.list()).some((n) => n.path === "inbox/test-kiln.md")).toBe(false));
    panes.remove();
  });
});
