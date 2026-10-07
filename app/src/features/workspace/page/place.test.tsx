// A new, empty page in a project says where it is and offers to move it (a
// loose one has "Add to project" in the top bar); a new page made from a page
// in a project lands in that project.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useShell } from "../../../lib/store";
import { newPageHere } from "../overlays/commands";
import { MemoryVault } from "../preview/memory-vault";
import { useWorkspace } from "../store";
import { NotePage } from "./NotePage";

const SEED = {
  "projects/trip/_project.md": "---\ntitle: Seaside trip\ntype: project\n---\nPlans.\n",
  "projects/trip/pages/plan.md": "---\ntitle: Plan\n---\nDay one.\n",
  "library/blank.md": "---\ntitle: Blank\n---\n",
  "projects/trip/pages/empty.md": "---\ntitle: Empty\n---\n",
};

let vault: MemoryVault;
beforeEach(async () => {
  localStorage.clear();
  vault = new MemoryVault(SEED);
  useShell.setState({ moving: null, panels: [] });
  useWorkspace.setState({ place: { view: "home" }, back: [], forward: [], toasts: [] });
  await useWorkspace.getState().connect({ client: vault });
});
afterEach(cleanup);

describe("placing pages", () => {
  it("shows where an empty page is and opens Move from there", async () => {
    render(<NotePage client={vault} path="projects/trip/pages/empty.md" />);
    const chip = await screen.findByRole("button", { name: /In Seaside trip · Move/ }, { timeout: 20_000 });
    fireEvent.click(chip);
    expect(useShell.getState().moving).toBe("projects/trip/pages/empty.md");
  });

  it("leaves a loose page's move to the top bar", async () => {
    render(<NotePage client={vault} path="library/blank.md" />);
    await screen.findByRole("button", { name: /Add icon/ }, { timeout: 20_000 });
    expect(screen.queryByRole("button", { name: /· Move/ })).toBeNull();
  });

  it("makes a new page in the project of the page open", async () => {
    await act(async () => useWorkspace.getState().openPath("projects/trip/pages/plan.md"));
    await act(async () => newPageHere());
    // A draft until its first input, which makes it in that project.
    const draft = useWorkspace.getState().place.path!;
    expect(draft).toMatch(/^draft:/);
    await act(async () => void (await useWorkspace.getState().client!.rename(draft, "Packing list")));
    await expect.poll(() => useWorkspace.getState().place.path ?? "").toMatch(/^projects\/trip\/pages\//);
  });
});
