import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryVault } from "../../workspace/preview/memory-vault";
import { openWithPanel, toasts } from "../test-page";

const PATH = "library/notes.md";
const SEED = { [PATH]: "---\ntitle: Notes\n---\nStart\n", "library/fresh.md": "---\ntitle: Fresh\n---\nNothing yet\n" };

let vault: MemoryVault;
let clock: number;
const text = async () => (await vault.read(PATH)).text;

/** Saves `body` a minute after the last save, so the preview keeps it as its own version. */
async function saveVersion(body: string) {
  clock += 60_000;
  await vault.saveBody(PATH, body, (await vault.read(PATH)).hash);
}

beforeEach(async () => {
  localStorage.clear();
  clock = Date.UTC(2026, 8, 24, 8, 0, 0);
  vault = new MemoryVault(SEED, undefined, () => clock);
  await saveVersion("First draft\nShared line\n");
  await saveVersion("Second draft\nShared line\n");
});
afterEach(cleanup);

describe("History tab", () => {
  it("lists versions newest first and scrubs to an older one", async () => {
    await openWithPanel(vault, PATH, "history");
    const timeline = await screen.findByRole("list", { name: "Versions" });
    const entries = within(timeline).getAllByRole("button");
    expect(entries).toHaveLength(2);
    expect(entries[0]!.getAttribute("aria-current")).toBe("true");
    // What each version did, without the page's own title.
    expect(entries[0]!.textContent).toContain("Edited");
    expect(entries[0]!.textContent).not.toContain("Notes");
    const preview = screen.getByLabelText("Text of this version");
    await expect.poll(() => preview.textContent).toContain("Second draft");

    fireEvent.change(screen.getByRole("slider", { name: "Scrub through versions" }), { target: { value: "0" } });
    await expect.poll(() => screen.getByLabelText("Text of this version").textContent).toContain("First draft");
    expect(within(timeline).getAllByRole("button")[1]!.getAttribute("aria-current")).toBe("true");
  });

  it("steps from version to version, however the engine scrolls", async () => {
    // Newer engines return a Promise from scrollIntoView; the tab once gave
    // it to React as a cleanup, and the page failed with "destroy is not a
    // function" on the second pick (test/dom-shims.ts).
    await saveVersion("Third draft\nShared line\n");
    await openWithPanel(vault, PATH, "history");
    const timeline = await screen.findByRole("list", { name: "Versions" });
    for (const pick of [1, 2, 0, 1]) {
      fireEvent.click(within(timeline).getAllByRole("button")[pick]!);
      await expect.poll(() => within(timeline).getAllByRole("button")[pick]!.getAttribute("aria-current")).toBe("true");
    }
    expect(screen.queryByText("This view ran into a problem")).toBeNull();
    await expect.poll(() => screen.getByLabelText("Text of this version").textContent).toContain("Second draft");
  });

  it("shows the changes from a version to the current text", async () => {
    await openWithPanel(vault, PATH, "history");
    const timeline = await screen.findByRole("list", { name: "Versions" });
    fireEvent.click(within(timeline).getAllByRole("button")[1]!);
    await expect.poll(() => screen.getByLabelText("Text of this version").textContent).toContain("First draft");
    fireEvent.click(screen.getByRole("switch", { name: "Show changes" }));
    const preview = screen.getByLabelText("Text of this version");
    await expect.poll(() => preview.querySelector("del")?.textContent).toBe("First draft");
    expect(preview.querySelector("ins")?.textContent).toBe("Second draft");
    expect(screen.getByText(/1 removed/)).toBeTruthy();
  });

  it("restores an older version as a new one and reloads the page", async () => {
    await openWithPanel(vault, PATH, "history");
    const timeline = await screen.findByRole("list", { name: "Versions" });
    fireEvent.click(within(timeline).getAllByRole("button")[1]!);
    const restore = await screen.findByRole("button", { name: "Restore this version" });
    await expect.poll(() => (restore as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(restore);
    await act(async () => fireEvent.click(within(screen.getByRole("group", { name: "Restore this version?" })).getByRole("button", { name: "Restore" })));

    await expect.poll(text).toContain("---\nFirst draft\nShared line\n");
    await expect.poll(toasts).toEqual(expect.arrayContaining([expect.stringMatching(/^Restored the version from /)]));
    // The page shows the restored text, and the restore is a version of its own.
    await expect.poll(() => screen.getByTestId("page-editor").textContent, { timeout: 20_000 }).toContain("First draft");
    const after = await screen.findByRole("list", { name: "Versions" });
    await expect.poll(() => within(after).getAllByRole("button").length).toBe(3);
    expect(within(after).getAllByRole("button")[0]!.textContent).toContain("Restored");
  });

  it("marks versions an agent made, with its client's name", async () => {
    const mine = await vault.history(PATH);
    const agent = {
      id: "a9f3c1d",
      summary: "section: Notes § Plan",
      message: "section: Notes § Plan\n\nKasten-Session: s1\nKasten-Op: replace_section",
      author: "agent:claude-code",
      time: clock,
      agent: true,
      session: "s1",
      op: "replace_section",
      approvedBy: null,
      undoes: null,
    };
    vi.spyOn(vault, "history").mockResolvedValue([agent, ...mine]);
    await openWithPanel(vault, PATH, "history");
    const timeline = await screen.findByRole("list", { name: "Versions" });
    const newest = within(timeline).getAllByRole("button")[0]!;
    expect(newest.textContent).toContain("Agent");
    expect(newest.textContent).toContain("claude-code");
    expect(newest.textContent).toContain("Rewrote a section § Plan");
    expect(within(timeline).getAllByRole("button")[1]!.textContent).not.toContain("Agent");
  });

  it("says when a page has no versions yet", async () => {
    await openWithPanel(vault, "library/fresh.md", "history");
    expect(await screen.findByText(/No versions yet/)).toBeTruthy();
  });
});
