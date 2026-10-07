// A new page's first input makes it: typing only a body, only a title or
// only an icon makes exactly one page, in one create; a draft left alone
// makes nothing; closing a draft that was typed in writes it; and the page
// keeps its editor as the draft becomes its file.

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isDraft } from "../drafts";
import { MemoryVault } from "../preview/memory-vault";
import { useWorkspace } from "../store";
import { derive } from "../store-layout";
import { initialLayout } from "../tabs";
import { useNoteSession } from "./use-note-session";

const SEED = { "library/a.md": "---\ntitle: A\n---\nHello.\n" };

let vault: MemoryVault;
let create: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  localStorage.clear();
  vault = new MemoryVault(SEED);
  create = vi.spyOn(vault, "create");
  useWorkspace.setState({ ...derive(initialLayout()), notes: [], recent: [], toasts: [] });
  await useWorkspace.getState().connect({ client: vault });
});
afterEach(cleanup);

/** Opens a new page and its session, as its tab does. */
function openDraft() {
  act(() => useWorkspace.getState().newPage());
  const draft = useWorkspace.getState().place.path!;
  expect(isDraft(draft)).toBe(true);
  const client = useWorkspace.getState().client!;
  const hook = renderHook(({ path }) => useNoteSession(client, path), { initialProps: { path: draft } });
  return { draft, ...hook };
}

const count = async () => (await vault.list()).length;

describe("a new page", () => {
  it("left untouched makes nothing, and says New page nowhere else", async () => {
    const before = await count();
    const { result, unmount } = openDraft();
    await waitFor(() => expect(result.current.loaded?.body).toBe(""));
    unmount();
    await act(async () => void (await new Promise((r) => setTimeout(r, 20))));
    expect(create).not.toHaveBeenCalled();
    expect(await count()).toBe(before);
    expect(useWorkspace.getState().recent.some((p) => isDraft(p))).toBe(false);
  });

  it("typed in and closed is written, as one page made with its text", async () => {
    const before = await count();
    const { result, unmount } = openDraft();
    await waitFor(() => expect(result.current.session.current).toBeTruthy());
    act(() => result.current.session.current!.editBody("Typed before closing\n"));
    unmount();
    await waitFor(async () => expect(await count()).toBe(before + 1));
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0]).toMatchObject({ body: "Typed before closing\n" });
  });

  it("keeps its editor as the draft becomes its page, and the tab follows", async () => {
    const { draft, result, rerender } = openDraft();
    await waitFor(() => expect(result.current.loaded).toBeTruthy());
    const version = result.current.loaded!.version;
    act(() => result.current.session.current!.editBody("First line\n"));
    await act(() => result.current.session.current!.flush());
    const page = useWorkspace.getState().place.path!;
    expect(page).not.toBe(draft);
    expect(page).toMatch(/^library\//);
    expect(result.current.session.current!.path).toBe(page);
    rerender({ path: page });
    await act(async () => void (await new Promise((r) => setTimeout(r, 20))));
    expect(result.current.loaded!.version).toBe(version);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("given only a title or only an icon, is made once with it", async () => {
    const before = await count();
    const titled = openDraft();
    await waitFor(() => expect(titled.result.current.session.current).toBeTruthy());
    act(() => titled.result.current.session.current!.rename("Garden plans"));
    await act(() => titled.result.current.session.current!.flush());
    titled.unmount();

    const iconed = openDraft();
    await waitFor(() => expect(iconed.result.current.session.current).toBeTruthy());
    act(() => iconed.result.current.session.current!.editHeader("icon", "🌱"));
    await act(() => iconed.result.current.session.current!.flush());
    iconed.unmount();

    await waitFor(async () => expect(await count()).toBe(before + 2));
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls.map((c: unknown[]) => c[0])).toMatchObject([{ title: "Garden plans" }, { icon: "🌱" }]);
  });
});
