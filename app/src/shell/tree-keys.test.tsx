// The sidebar's page tree from the keyboard: arrows move between rows,
// Right opens a row and steps in, Left closes it and steps out.

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoryVault } from "../features/workspace/preview/memory-vault";
import { useWorkspace } from "../features/workspace/store";
import { derive } from "../features/workspace/store-layout";
import { initialLayout } from "../features/workspace/tabs";
import { AppShell } from "./AppShell";

const SEED = {
  "library/alpha.md": "---\nid: 01K5Y2WE1C0MEPAGE00000000A\ntitle: Alpha\n---\nA.\n",
  "library/alpha-child.md": "---\ntitle: Alpha child\nparent: 01K5Y2WE1C0MEPAGE00000000A\n---\nInside.\n",
  "library/beta.md": "---\ntitle: Beta\n---\nB.\n",
};

let vault: MemoryVault;

beforeEach(() => {
  localStorage.clear();
  vault = new MemoryVault(SEED);
  useWorkspace.setState({ ...derive(initialLayout()), stack: [], stackOpen: false, recent: [], toasts: [] });
});
afterEach(cleanup);

const row = (nav: HTMLElement, title: string) => within(nav).getAllByRole("button", { name: new RegExp(`^${title}$`) }).find((b) => b.hasAttribute("data-row-title"))!;

describe("the page tree from the keyboard", () => {
  it("moves between rows and opens and closes them with the arrows", async () => {
    render(<AppShell connect={async () => ({ client: vault })} />);
    const nav = await screen.findByRole("navigation", { name: "Sidebar" });
    await within(nav).findByRole("button", { name: "More for Alpha" });
    const alpha = row(nav, "Alpha");
    expect(alpha.getAttribute("aria-expanded")).toBe("false");
    expect(row(nav, "Beta").hasAttribute("aria-expanded")).toBe(false);

    alpha.focus();
    fireEvent.keyDown(alpha, { key: "ArrowRight" });
    expect(row(nav, "Alpha").getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(row(nav, "Alpha"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(row(nav, "Alpha child"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(row(nav, "Beta"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(row(nav, "Alpha"));
    await act(async () => fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" }));
    expect(row(nav, "Alpha").getAttribute("aria-expanded")).toBe("false");
    expect(within(nav).queryByRole("button", { name: /^Alpha child$/ })).toBeNull();
  });
});
