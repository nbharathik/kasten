// A page that moves takes its sub-pages along, and everything that pointed
// at them follows: tabs, the side stack and favourites.

import { beforeEach, describe, expect, it } from "vitest";

import { MemoryVault } from "./preview/memory-vault";
import { usePrefs } from "./prefs";
import { derive } from "./store-layout";
import { useWorkspace } from "./store";
import { initialLayout } from "./tabs";

const VAULT = {
  "projects/beta/_project.md": "---\ntitle: Beta\ntype: project\n---\n",
  "library/trip.md": "---\nid: T\ntitle: Trip\n---\n",
  "library/packing.md": "---\ntitle: Packing\nparent: T\n---\nSocks.\n",
};

beforeEach(async () => {
  localStorage.clear();
  useWorkspace.setState({ client: null, ready: false, notes: [], ...derive(initialLayout()), stack: [], stackOpen: false, recent: [], toasts: [] });
  usePrefs.setState({ favourites: [] });
  await useWorkspace.getState().connect({ client: new MemoryVault(VAULT) });
});

describe("moving a page with sub-pages", () => {
  it("re-points the sub-page's tab, stack card and favourite", async () => {
    const ws = useWorkspace.getState();
    ws.openPath("library/packing.md");
    ws.openInStack("library/packing.md");
    usePrefs.getState().toggleFavourite("library/packing.md");
    await ws.move("library/trip.md", "beta");
    const after = useWorkspace.getState();
    expect(after.place.path).toBe("projects/beta/pages/packing.md");
    expect(after.stack).toEqual(["projects/beta/pages/packing.md"]);
    expect(usePrefs.getState().favourites).toEqual(["projects/beta/pages/packing.md"]);
  });
});
