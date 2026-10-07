import { setReferences } from "@kasten-slides/wasm";
import type { Element } from "@kasten-slides/wasm";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { edit, mountDialogs } from "./test-kit.tsx";

afterEach(() => {
  cleanup();
  setReferences(null);
});

const BIB = `
@inproceedings{vaswani2017attention, title={Attention is all you need}, author={Vaswani, Ashish and Shazeer, Noam and Parmar, Niki}, booktitle={Advances in Neural Information Processing Systems}, year={2017}}
@inproceedings{devlin2019bert, title={{BERT}: Pre-training of Deep Bidirectional Transformers}, author={Devlin, Jacob and Chang, Ming-Wei and Lee, Kenton and Toutanova, Kristina}, booktitle={NAACL}, year={2019}}
@article{lecun2015deep, title={Deep learning}, author={LeCun, Yann and Bengio, Yoshua and Hinton, Geoffrey}, journal={Nature}, year={2015}}
`;

type Kit = Awaited<ReturnType<typeof mountDialogs>>;
type Cite = Extract<Element, { type: "citation" }>;

const citations = (kit: Kit): Cite[] => kit.session.slide.elements.filter((e): e is Cite => e.type === "citation");
const button = (name: string) => screen.getByRole("button", { name });
const option = (text: RegExp | string) => screen.getByRole("option", { name: text });

async function open(bibliography: string | null = BIB): Promise<Kit> {
  const kit = await mountDialogs({ dialog: "citation" });
  edit(() => setReferences(bibliography));
  return kit;
}

describe("Insert citation", () => {
  it("lists the works of the bibliography and narrows them as you type", async () => {
    await open();
    expect(screen.getAllByRole("option")).toHaveLength(3);
    fireEvent.change(screen.getByRole("combobox", { name: /Search/ }), { target: { value: "bengio" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(within(option(/LeCun/)).getByText("lecun2015deep")).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: /Search/ }), { target: { value: "nobody" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText(/Nothing matches/)).toBeTruthy();
  });

  it("puts the works chosen in the slide's footer, once, in one step of undo", async () => {
    const kit = await open();
    fireEvent.click(option(/Vaswani/));
    fireEvent.click(option(/Devlin/));
    expect(option(/Vaswani/).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText(/2 works chosen: vaswani2017attention, devlin2019bert/)).toBeTruthy();
    fireEvent.click(button("Add to the slide"));
    const [footer] = citations(kit);
    expect(citations(kit)).toHaveLength(1);
    expect(footer?.keys).toEqual(["vaswani2017attention", "devlin2019bert"]);
    expect(footer?.name).toBe("citations");
    expect(kit.ui.state.dialog).toBeNull();
    expect(kit.session.state.selection).toEqual([footer?.id]);
    edit(() => kit.session.undo());
    expect(citations(kit)).toHaveLength(0);
    expect(kit.errors).toEqual([]);
  });

  it("takes a choice back with a second click, and keys that are typed as well", async () => {
    const kit = await open();
    fireEvent.click(option(/LeCun/));
    fireEvent.click(option(/LeCun/));
    expect(option(/LeCun/).getAttribute("aria-selected")).toBe("false");
    expect((button("Add to the slide") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(option(/Devlin/));
    fireEvent.change(screen.getByLabelText(/More keys/), { target: { value: "own2020, devlin2019bert" } });
    fireEvent.click(button("Add to the slide"));
    expect(citations(kit)[0]?.keys).toEqual(["devlin2019bert", "own2020"]);
  });

  it("chooses with the keyboard: arrows to walk, Enter to choose", async () => {
    const kit = await open();
    const search = screen.getByRole("combobox", { name: /Search/ });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(option(/Devlin/).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(button("Add to the slide"));
    expect(citations(kit)[0]?.keys).toEqual(["devlin2019bert"]);
  });

  it("gives the footer a style only when one is chosen", async () => {
    const kit = await open();
    kit.engine.apply("add_citation", { slide: kit.session.state.slideId, keys: ["lecun2015deep"], format: "numbered" });
    edit(() => kit.session.select([]));
    fireEvent.click(option(/Vaswani/));
    fireEvent.click(button("Add to the slide"));
    expect(citations(kit)[0]).toMatchObject({ keys: ["lecun2015deep", "vaswani2017attention"], format: "numbered" });

    const again = await open();
    fireEvent.click(option(/Vaswani/));
    fireEvent.click(screen.getByRole("radio", { name: /The whole reference/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "Add to the slide" }).at(-1) as HTMLElement);
    expect(citations(again)[0]).toMatchObject({ format: "full" });
  });

  it("adds a list of every work the deck cites, for a references slide, away from the footer", async () => {
    const kit = await open();
    fireEvent.click(option(/Vaswani/));
    fireEvent.click(button("Add as a list"));
    const [list] = citations(kit);
    expect(list).toMatchObject({ format: "list", keys: ["vaswani2017attention"], name: "references" });
    const box = kit.session.elements.boxOf(list as Element);
    expect(box && box.y + box.h).toBeLessThan(490);
    expect(kit.ui.state.dialog).toBeNull();
  });

  it("a list needs no choice: it prints what the deck cites", async () => {
    const kit = await open();
    fireEvent.click(button("Add as a list"));
    expect(citations(kit)[0]).toMatchObject({ format: "list", keys: [] });
  });

  it("without a bibliography says so and still takes typed keys", async () => {
    const kit = await open(null);
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText(/no bibliography/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Keys/), { target: { value: "a2020; b2021" } });
    fireEvent.click(button("Add to the slide"));
    expect(citations(kit)[0]?.keys).toEqual(["a2020", "b2021"]);
  });

  it("an empty bibliography says what to add", async () => {
    await open("");
    expect(screen.getByText(/no works in it yet/)).toBeTruthy();
  });

  it("follows the bibliography when the host gives a new one", async () => {
    await open();
    expect(screen.getAllByRole("option")).toHaveLength(3);
    edit(() => setReferences("@book{only, title={One}, author={Solo, Sam}, year={2000}}"));
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });
});
