// Every page action is in the palette: trash, lock, favourite, copy its
// link, pin its tab and a new project, acting on the focused pane's page.

import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useShell } from "../../../lib/store";
import { usePrefs } from "../prefs";
import { MemoryVault } from "../preview/memory-vault";
import { useWorkspace } from "../store";
import { activeTab, focusedPane } from "../tabs";
import { COMMANDS } from "./commands";

const PATH = "library/trip.md";
const run = (id: string) => COMMANDS.find((c) => c.id === id)!.run();
const writeText = vi.fn(async (_text: string) => {});

beforeEach(async () => {
  localStorage.clear();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  await useWorkspace.getState().connect({ client: new MemoryVault({ [PATH]: "---\ntitle: Trip\n---\nPack.\n" }) });
  useWorkspace.getState().openPath(PATH);
});

describe("page commands in the palette", () => {
  it("favourites, copies a link to, pins and trashes the open page", async () => {
    run("favourite-page");
    expect(usePrefs.getState().favourites).toContain(PATH);
    run("favourite-page");
    expect(usePrefs.getState().favourites).not.toContain(PATH);

    await act(async () => run("copy-link"));
    expect(writeText).toHaveBeenCalledWith("[[Trip]]");

    await act(async () => run("copy-markdown"));
    await expect.poll(() => writeText.mock.calls.at(-1)?.[0]).toBe("# Trip\n\nPack.\n");

    run("pin-tab");
    expect(activeTab(focusedPane(useWorkspace.getState().layout)).pinned).toBe(true);

    await act(async () => run("trash-page"));
    await expect.poll(() => useWorkspace.getState().notes.some((n) => n.path === PATH)).toBe(false);
  });

  it("locks the open page for agents, and Undo unlocks it", async () => {
    const vault = useWorkspace.getState().client!;
    await act(async () => run("lock-page"));
    await expect.poll(async () => (await vault.read(PATH)).text).toContain("\nlocked: true\n");
    expect(useWorkspace.getState().notes.find((n) => n.path === PATH)?.locked).toBe(true);
    const notice = useWorkspace.getState().toasts.at(-1)!;
    expect(notice.text).toBe("Locked: agents can read this page but not change it");
    await act(async () => notice.action!.run());
    await expect.poll(async () => (await vault.read(PATH)).text).not.toContain("locked");
    expect(useWorkspace.getState().notes.find((n) => n.path === PATH)?.locked).toBe(false);
  });

  it("offers the file manager only in the desktop app", () => {
    const reveal = COMMANDS.find((c) => c.id === "reveal-page")!;
    expect(reveal.when?.()).toBe(false);
  });

  it("starts naming a new project in the sidebar", () => {
    useShell.setState({ sidebarOpen: false, namingProject: false });
    run("new-project");
    expect(useShell.getState()).toMatchObject({ sidebarOpen: true, namingProject: true });
  });
});
