import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MeaningApi, NearNote } from "../../meaning/client";
import { MemoryVault } from "../preview/memory-vault";
import { derive } from "../store-layout";
import { useWorkspace } from "../store";
import { initialLayout } from "../tabs";
import { Palette } from "./Palette";

const near: NearNote[] = [
  { path: "library/kiln.md", title: "Kiln firing", icon: "🔥", excerpt: "Stoneware to cone six.", score: 0.83 },
  { path: "library/glaze.md", title: "Glaze recipes", icon: null, excerpt: "", score: 0.61 },
];

function api(search: MeaningApi["search"], available = true): MeaningApi {
  return {
    available: () => available,
    status: vi.fn(),
    make: vi.fn(),
    stop: vi.fn(),
    search: vi.fn(search),
    onProgress: () => () => {},
  };
}

beforeEach(async () => {
  localStorage.clear();
  const vault = new MemoryVault({
    "library/kiln.md": "---\ntitle: Kiln firing\n---\nStoneware to cone six.\n",
    "library/glaze.md": "---\ntitle: Glaze recipes\n---\nA stoneware glaze.\n",
  });
  useWorkspace.setState({ client: vault, ready: true, notes: await vault.list(), ...derive(initialLayout()), stack: [], recent: [], toasts: [] });
});
afterEach(cleanup);

const type = (text: string) => fireEvent.change(screen.getByRole("textbox", { name: "Search" }), { target: { value: text } });

describe("the palette's search by meaning", () => {
  it("finds notes about a question when asked, and opens one", async () => {
    const meaning = api(async () => near);
    render(<Palette meaning={meaning} />);
    type("pottery at high heat");
    const ask = await screen.findByRole("option", { name: /Find notes about “pottery at high heat” by meaning/ });
    await act(async () => fireEvent.click(ask));
    expect(meaning.search).toHaveBeenCalledWith("pottery at high heat", 12);
    const kiln = await screen.findByRole("option", { name: /Kiln firing/ });
    expect(kiln.textContent).toContain("83% alike");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    fireEvent.click(kiln);
    expect(useWorkspace.getState().place.path).toBe("library/kiln.md");
  });

  it("says why when it cannot, and goes back to typing", async () => {
    render(<Palette meaning={api(async () => Promise.reject(new Error("Choose a provider and model for search by meaning in Settings, AI")))} />);
    type("pottery");
    await act(async () => fireEvent.click(await screen.findByRole("option", { name: /by meaning/ })));
    expect((await screen.findByRole("option", { name: /Search by meaning did not work/ })).textContent).toContain("Choose a provider");
    type("potter");
    expect(await screen.findByRole("option", { name: /by meaning/ })).toBeTruthy();
  });

  it("is not offered in the browser preview or for short words", async () => {
    render(<Palette meaning={api(async () => near, false)} />);
    type("pottery");
    await screen.findAllByRole("option");
    expect(screen.queryByRole("option", { name: /by meaning/ })).toBeNull();
    cleanup();
    render(<Palette meaning={api(async () => near)} />);
    type("po");
    await screen.findAllByRole("option");
    expect(screen.queryByRole("option", { name: /by meaning/ })).toBeNull();
  });
});
