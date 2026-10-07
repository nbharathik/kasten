import type { Slide } from "@kasten-slides/wasm";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChangedFile, CommitInfo, VaultClient } from "../../lib/vault/types";

// The slides code is large and needs a browser to draw: the thumbnails and the engine are stand-ins here.
vi.mock("./deck/SlideThumb", () => ({
  SlideThumb: ({ label, number }: { label: string; number: number }) => <div data-testid="thumb" data-number={number} aria-label={label} />,
}));
vi.mock("@kasten-slides/wasm", () => ({
  loadSlides: async () => undefined,
  DeckEngine: { open: (text: string) => ({ deck: JSON.parse(text) }) },
}));

import { useWorkspace } from "../workspace/store";
import { CommitRow } from "./CommitRow";

afterEach(cleanup);

const slide = (id: string, title: string): Slide =>
  ({ id, layout: "title-body", elements: [{ id: `e-${id}`, type: "text", placeholder: "title", text: { paragraphs: [{ runs: [{ t: title }] }] } }] }) as unknown as Slide;

/** A deck of slides, each an id and the words of its title. */
const deck = (slides: [string, string][]): string =>
  JSON.stringify({ format: "kasten-deck", formatVersion: 1, id: "d-1", title: "Talk", size: { w: 960, h: 540 }, slides: slides.map(([id, title]) => slide(id, title)) });

const commit: CommitInfo = {
  id: "c1",
  summary: "deck: edit Talk § update elements",
  message: "",
  author: "agent:claude-code",
  time: Date.now(),
  agent: true,
  session: "S1",
  op: "update_elements",
  approvedBy: null,
  undoes: null,
  merge: false,
};

function open(files: ChangedFile[]) {
  const client = { kind: "preview", commitChanges: async () => files } as unknown as VaultClient;
  useWorkspace.setState({ client, notes: [] });
  render(
    <ul>
      <CommitRow commit={commit} undone={false} />
    </ul>,
  );
  fireEvent.click(screen.getByRole("button", { expanded: false }));
}

beforeEach(() => {
  useWorkspace.setState({ client: null, notes: [] });
});

describe("a deck in a commit", () => {
  it("is drawn as the slides that changed, before and after, in place of the JSON", async () => {
    open([
      {
        path: "library/talk.deck",
        before: deck([["s-a", "Intro"], ["s-b", "Method"], ["s-d", "Thanks"]]),
        after: deck([["s-a", "Intro"], ["s-b", "Method, reworded"], ["s-c", "Extra"], ["s-d", "Thanks"]]),
      },
      { path: "library/notes.md", before: "a\n", after: "b\n" },
    ]);
    const list = await screen.findByRole("list", { name: "Slides that change" });
    const [changed, added] = within(list).getAllByRole("listitem");
    expect(within(changed!).getByLabelText("Before: slide 2, Method, reworded")).toBeTruthy();
    expect(within(changed!).getByLabelText("After: slide 2, Method, reworded")).toBeTruthy();
    expect(within(added!).getByText("Not in the deck yet")).toBeTruthy();
    expect(within(added!).getByLabelText("After: slide 3, Extra")).toBeTruthy();
    expect(screen.getByText("1 slide added, 1 slide changed")).toBeTruthy();
    // No lines of JSON, and no count of them; the note beside it is still a diff.
    expect(screen.queryByText(/formatVersion/)).toBeNull();
    expect(screen.getByText("library/notes.md")).toBeTruthy();
  });

  it("is drawn as its first slides when the commit made it or took it away", async () => {
    open([{ path: "library/talk.deck", before: null, after: deck([["s-a", "Intro"], ["s-b", "Method"]]) }]);
    expect(await screen.findByText("The new deck · 2 slides")).toBeTruthy();
    expect(screen.getAllByTestId("thumb")).toHaveLength(2);
    expect(screen.getByText("added")).toBeTruthy();
    cleanup();
    open([{ path: "library/talk.deck", before: deck([["s-a", "Only"]]), after: null }]);
    expect(await screen.findByText("The deck that was removed · 1 slide")).toBeTruthy();
  });

  it("says so when the slides cannot be read", async () => {
    open([{ path: "library/talk.deck", before: "not json", after: deck([["s-a", "Intro"]]) }]);
    expect(await screen.findByText(/could not be drawn here/)).toBeTruthy();
    expect(screen.queryAllByTestId("thumb")).toHaveLength(0);
  });
});
