import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Emptied } from "../../../lib/vault/types";
import { MemoryVault } from "../preview/memory-vault";
import { useWorkspace } from "../store";
import { Trash } from "./Trash";

/** The preview vault with the desktop's Empty trash. */
class DesktopVault extends MemoryVault {
  emptyTrash = vi.fn(async (): Promise<Emptied> => {
    this.data.trash = {};
    return { removed: 1, kept: [], commit: "c0ffee" };
  });
  override undoCommit = vi.fn(async (_commit: string) => ({ reverted: ["c0ffee"], conflict: null }));
}

afterEach(cleanup);

describe("the trash", () => {
  it("is emptied only after asking, and Undo is offered", async () => {
    const vault = new DesktopVault({ "library/old.md": "---\ntitle: Old\n---\nOld\n" });
    await useWorkspace.getState().connect({ client: vault });
    await useWorkspace.getState().trash("library/old.md");
    render(<Trash />);
    fireEvent.click(await screen.findByRole("button", { name: "Empty trash" }));
    const dialog = await screen.findByRole("dialog", { name: "Empty the trash?" });
    expect(dialog.textContent).toContain("1 item leave the trash");
    expect(vault.emptyTrash).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getAllByRole("button", { name: "Empty trash" }).at(-1)!));
    expect(vault.emptyTrash).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText("The trash is empty.")).toBeTruthy());
    const toast = useWorkspace.getState().toasts.at(-1)!;
    expect(toast.text).toBe("Emptied the trash");
    await act(async () => toast.action!.run());
    expect(vault.undoCommit).toHaveBeenCalledWith("c0ffee");
  });

  it("offers no Empty trash where there is no history to keep it", async () => {
    const vault = new MemoryVault({ "library/old.md": "---\ntitle: Old\n---\nOld\n" });
    await useWorkspace.getState().connect({ client: vault });
    await useWorkspace.getState().trash("library/old.md");
    render(<Trash />);
    await screen.findByText("Old");
    expect(screen.queryByRole("button", { name: "Empty trash" })).toBeNull();
  });
});

describe("finding, picking and reading in the trash", () => {
  const files = {
    "library/trip.md": "---\ntitle: Trip plans\n---\nTrain to Lyon on Friday.\n",
    "library/books.md": "---\ntitle: Books\n---\nRead more.\n",
    "library/garden.md": "---\ntitle: Garden\n---\nTomatoes.\n",
  };

  it("narrows the list as you type", async () => {
    const vault = new MemoryVault(files);
    await useWorkspace.getState().connect({ client: vault });
    for (const path of Object.keys(files)) await useWorkspace.getState().trash(path);
    render(<Trash />);
    await screen.findByText("Trip plans");
    fireEvent.change(screen.getByRole("searchbox", { name: "Find in the trash" }), { target: { value: "gard" } });
    expect(screen.getByText("Garden")).toBeTruthy();
    expect(screen.queryByText("Trip plans")).toBeNull();
    fireEvent.change(screen.getByRole("searchbox", { name: "Find in the trash" }), { target: { value: "zebra" } });
    expect(screen.getByText("Nothing in the trash matches.")).toBeTruthy();
  });

  it("brings several back at once, with one notice", async () => {
    const vault = new MemoryVault(files);
    await useWorkspace.getState().connect({ client: vault });
    for (const path of Object.keys(files)) await useWorkspace.getState().trash(path);
    render(<Trash />);
    fireEvent.click(await screen.findByRole("checkbox", { name: "Pick Trip plans" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Pick Garden" }));
    useWorkspace.setState({ toasts: [] });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Restore 2 items" })));
    await waitFor(() => expect(screen.queryByText("Trip plans")).toBeNull());
    expect(screen.queryByText("Garden")).toBeNull();
    expect(screen.getByText("Books")).toBeTruthy();
    const paths = useWorkspace.getState().notes.map((n) => n.path);
    expect(paths).toEqual(expect.arrayContaining(["library/trip.md", "library/garden.md"]));
    const toasts = useWorkspace.getState().toasts;
    expect(toasts.map((t) => t.text)).toEqual(["Restored 2 items"]);
    expect(screen.queryByRole("button", { name: /^Restore \d/ })).toBeNull();
  });

  it("shows a page's text before it comes back", async () => {
    const vault = new MemoryVault(files);
    await useWorkspace.getState().connect({ client: vault });
    await useWorkspace.getState().trash("library/trip.md");
    render(<Trash />);
    await screen.findByText("Trip plans");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Read" })));
    const region = await screen.findByRole("region", { name: "Trip plans, in the trash" });
    expect(region.textContent).toBe("Train to Lyon on Friday.");
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByRole("region", { name: "Trip plans, in the trash" })).toBeNull();
  });
});
