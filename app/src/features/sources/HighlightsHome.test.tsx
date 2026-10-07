import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HIGHLIGHT_DRAG } from "../workspace/drag";
import { MemoryVault } from "../workspace/preview/memory-vault";
import { useWorkspace } from "../workspace/store";
import { HighlightsHome } from "./HighlightsHome";
import { useSources } from "./store";
import { FIRST, PRIMER, sampleVault, SECOND, transfer } from "./test-kit";

async function open() {
  const vault = await sampleVault();
  useWorkspace.setState({ place: { view: "highlights" } });
  render(<HighlightsHome />);
  const source = await screen.findByRole("region", { name: "A Zettelkasten primer" });
  return { vault, source, rows: () => within(source).queryAllByRole("listitem") };
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("the Highlights view", () => {
  it("lists each source's highlights in reading order", async () => {
    const { source, rows } = await open();
    expect(screen.getByText("3 highlights in 1 PDF")).toBeTruthy();
    expect(within(source).getByText("3 highlights")).toBeTruthy();
    expect(rows().map((r) => r.textContent)).toEqual([
      expect.stringMatching(/^A note should hold one idea.*The rule the rest follows from\.Page 1/),
      expect.stringMatching(/^Structure is the result of the work.*Page 1/),
      expect.stringMatching(/^Keep the reference to the source.*Exactly what a highlight card does\.Page 2/),
    ]);
  });

  it("filters by colour and by words, in the text or the comment", async () => {
    const { source, rows } = await open();
    const purple = screen.getByRole("button", { name: "Purple" });
    fireEvent.click(purple);
    expect(purple.getAttribute("aria-pressed")).toBe("true");
    expect(rows()).toHaveLength(1);
    expect(within(source).getByText("1 of 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Green" }));
    expect(rows()).toHaveLength(2);
    fireEvent.click(purple);
    fireEvent.click(screen.getByRole("button", { name: "Green" }));
    const find = screen.getByRole("searchbox", { name: "Find in highlights" });
    fireEvent.change(find, { target: { value: "REFERENCE" } });
    expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining("Keep the reference")]);
    fireEvent.change(find, { target: { value: "follows from" } });
    expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining("one idea")]);
    // Nothing matches: the source goes too.
    fireEvent.change(find, { target: { value: "no such words" } });
    expect(screen.queryByRole("region", { name: "A Zettelkasten primer" })).toBeNull();
  });

  it("makes a highlight's card, which it then opens, and filters by the card's tags", async () => {
    const { vault, rows } = await open();
    await act(async () => fireEvent.click(within(rows()[0]!).getByRole("button", { name: "Make card" })));
    const card = useSources.getState().highlights[PRIMER]!.find((h) => h.id === FIRST)!.card!;
    expect(card).toMatch(/^inbox\/.+\.md$/);
    await act(async () => useWorkspace.getState().noteChanged((await vault.setTags(card, ["method"], [])).meta));
    fireEvent.click(await within(rows()[0]!).findByRole("button", { name: "Open card" }));
    expect(useWorkspace.getState().place).toEqual({ view: "page", path: card });
    expect(within(rows()[0]!).getByText("#method")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Tag" }), { target: { value: "method" } });
    expect(rows()).toHaveLength(1);
  });

  it("opens the reader at a highlight's spot", async () => {
    const { rows } = await open();
    fireEvent.click(within(rows()[2]!).getByRole("button", { name: /^Keep the reference/ }));
    expect(useWorkspace.getState().place).toEqual({ view: "highlights", path: PRIMER });
  });

  it("drags a highlight, to become its card where it lands", async () => {
    const { rows } = await open();
    const data = transfer();
    fireEvent.dragStart(rows()[1]!.firstElementChild!, { dataTransfer: data });
    expect(JSON.parse(data.getData(HIGHLIGHT_DRAG))).toEqual([{ source: PRIMER, id: SECOND }]);
    expect(data.getData("text/plain")).toBe(`${PRIMER}#${SECOND}`);
  });

  it("invites a first PDF when there are none", async () => {
    useSources.setState({ list: null, highlights: {} });
    await useWorkspace.getState().connect({ client: new MemoryVault({}) });
    render(<HighlightsHome />);
    expect(await screen.findByRole("heading", { name: "Read and highlight PDFs" })).toBeTruthy();
    expect(screen.getByText("0 highlights in 0 PDFs")).toBeTruthy();
  });

  it("shows the PDFs as a library, hides carded highlights on asking, and lists the newest first", async () => {
    const { rows } = await open();
    const library = screen.getByRole("region", { name: "PDFs" });
    expect(within(library).getByRole("button", { name: /A Zettelkasten primer/ }).textContent).toContain("3 highlights");
    await act(async () => fireEvent.click(within(rows()[0]!).getByRole("button", { name: "Make card" })));
    await expect.poll(() => within(library).getByRole("button", { name: /A Zettelkasten primer/ }).textContent).toContain("1 card");
    fireEvent.click(screen.getByRole("button", { name: "No card yet" }));
    expect(rows()).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "No card yet" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Show" })).getByRole("button", { name: "Newest" }));
    const newest = screen.getByRole("region", { name: "Newest highlights" });
    expect(within(newest).getAllByRole("listitem")).toHaveLength(3);
    expect(within(newest).getAllByText("A Zettelkasten primer")).toHaveLength(3);
  });
});
