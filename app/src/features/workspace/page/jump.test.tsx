// A page opened at a spot: a heading a link names, or the words a search
// found, which the find bar marks.

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoryVault } from "../preview/memory-vault";
import { useWorkspace } from "../store";
import { searchedWords, usePageJump } from "./jump";
import { NotePage } from "./NotePage";
import { pageLinks } from "./page-links";

const PATH = "library/trip.md";
const BODY = "Intro line.\n\n## Packing\n\nBring the tent.\n\n## Route\n\nTake the coast road past the lighthouse.\n";

let vault: MemoryVault;

async function open(jump: { heading?: string; find?: string[] }) {
  await useWorkspace.getState().connect({ client: vault });
  useWorkspace.getState().openPath(PATH);
  usePageJump.setState({ jump: { path: PATH, ...jump, at: Date.now() } });
  render(<NotePage client={vault} path={PATH} />);
  const editor = await screen.findByTestId("page-editor", {}, { timeout: 20_000 });
  await expect.poll(() => editor.querySelector(".ProseMirror") !== null, { timeout: 20_000 }).toBe(true);
  return editor;
}

beforeEach(() => {
  localStorage.clear();
  vault = new MemoryVault({ [PATH]: `---\ntitle: Trip\n---\n${BODY}` });
});
afterEach(cleanup);

describe("opening a page at a spot", () => {
  it("puts the caret in the heading a link names", async () => {
    await open({ heading: "route" });
    await expect.poll(() => window.getSelection()?.anchorNode?.parentElement?.closest("h2")?.textContent).toBe("Route");
    expect(usePageJump.getState().jump).toBeNull();
  });

  it("marks the searched words with the find bar", async () => {
    await open({ find: ["coast lighthouse", "lighthouse", "coast"] });
    const field = await screen.findByRole("textbox", { name: "Find in page" });
    expect((field as HTMLInputElement).value).toBe("lighthouse");
    await act(async () => {});
    expect(screen.getByText("1 of 1")).toBeTruthy();
  });
});

describe("a link to a heading", () => {
  it("opens its page and asks for the heading, on another page or this one", async () => {
    await useWorkspace.getState().connect({ client: vault });
    pageLinks(() => "library/other.md").open("Trip", "here", "Route");
    expect(usePageJump.getState().jump).toMatchObject({ path: PATH, heading: "Route" });
    expect(useWorkspace.getState().place.path).toBe(PATH);
    pageLinks(() => PATH).open("", "here", "Packing");
    expect(usePageJump.getState().jump).toMatchObject({ path: PATH, heading: "Packing" });
  });
});

describe("the words a search asked for", () => {
  it("drops filters and tries the phrase, then each word, longest first", () => {
    expect(searchedWords('coast road tag:travel -draft "lighthouse"')).toEqual(["coast road lighthouse", "lighthouse", "coast", "road"]);
    expect(searchedWords("  ")).toEqual([]);
  });
});
