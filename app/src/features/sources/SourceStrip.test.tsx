// A highlight card leads back to its spot in the PDF: from the strip under
// its title, and from its link with Ctrl or Cmd and a click.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { NotePage } from "../workspace/page/NotePage";
import { useWorkspace } from "../workspace/store";
import { useSpotRequests, type Spot } from "./highlight-request";
import { useSources } from "./store";
import { FIRST, PRIMER, sampleVault, THIRD } from "./test-kit";

/** A reader of the primer, as far as spots go. */
function Reader({ spots }: { spots: Spot[] }) {
  useSpotRequests(PRIMER, (spot) => spots.push(spot));
  return null;
}

async function openCard(id: string) {
  const vault = await sampleVault();
  const card = (await useSources.getState().card(PRIMER, id))!;
  useWorkspace.getState().openPath(card.meta.path);
  render(<NotePage client={vault} path={card.meta.path} />);
  const editor = await screen.findByTestId("page-editor", {}, { timeout: 20_000 });
  return { card, editor };
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("a highlight card", () => {
  it("says where its quote came from, and opens the PDF at the spot", async () => {
    await openCard(THIRD);
    expect((await screen.findByText(/^From/)).textContent).toBe("From A Zettelkasten primer, page 2");
    fireEvent.click(screen.getByRole("button", { name: "Open at the highlight" }));
    expect(useWorkspace.getState().place).toEqual({ view: "highlights", path: PRIMER });
    // The reader, opening, takes the spot.
    const spots: Spot[] = [];
    render(<Reader spots={spots} />);
    expect(spots).toEqual([{ source: PRIMER, page: 2, highlight: THIRD }]);
  });

  it("follows its link back with Ctrl and a click, not a plain click", async () => {
    const { card, editor } = await openCard(FIRST);
    const link = await screen.findByRole("link", { name: "A Zettelkasten primer, page 1" });
    expect(link.getAttribute("href")).toBe(`../sources/zettelkasten-primer.pdf#page=1&highlight=${FIRST}`);
    const spots: Spot[] = [];
    render(<Reader spots={spots} />);
    fireEvent.click(link);
    expect(useWorkspace.getState().place).toEqual({ view: "page", path: card.meta.path });
    await act(async () => fireEvent.click(link, { ctrlKey: true }));
    expect(useWorkspace.getState().place).toEqual({ view: "highlights", path: PRIMER });
    expect(spots).toEqual([{ source: PRIMER, page: 1, highlight: FIRST }]);
    expect(editor.isConnected).toBe(true);
  });
});
