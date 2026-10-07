import { setReferences } from "@kasten-slides/wasm";
import type { Element } from "@kasten-slides/wasm";
import { cleanup, fireEvent, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { edit, enter, held, mount, section } from "../test-kit.tsx";

afterEach(() => {
  cleanup();
  setReferences(null);
});

type Of<K extends Element["type"]> = Extract<Element, { type: K }>;
const at = { x: 64, y: 480, w: 600, h: 30 };
const cite = (keys: string[], extra: Partial<Of<"citation">> = {}): Element => ({ type: "citation", id: "", keys, ...at, ...extra }) as Element;
const the = (kit: Awaited<ReturnType<typeof mount>>, n = 0) => held(kit, kit.ids[n] as string) as Of<"citation">;

const BIB = `
@inproceedings{vaswani2017attention, title={Attention is all you need}, author={Vaswani, Ashish and Shazeer, Noam}, booktitle={Advances in Neural Information Processing Systems}, year={2017}}
@article{lecun2015deep, title={Deep learning}, author={LeCun, Yann and Bengio, Yoshua}, journal={Nature}, year={2015}}
`;

const inSection = () => within(section("citation"));
/** The works listed, apart from the options of the format menu. */
const works = () => within(inSection().getByRole("listbox", { name: "References" }));

const notes = () => inSection().queryByRole("list", { name: "Keys that are not in the bibliography" });
const keysField = () => inSection().getByLabelText("Citation keys") as HTMLInputElement;

describe("Citation keys that the bibliography does not have", () => {
  it("are not pointed out on a citation that is only selected, whatever the bibliography says", async () => {
    await mount({ elements: [cite(["vaswani2017", "zzz1999"])] });
    edit(() => setReferences(BIB));
    expect(notes()).toBeNull();
  });

  it("are pointed out after the person types them, with the key it was probably meant to be, and use it in one step of undo", async () => {
    const kit = await mount({ elements: [cite(["lecun2015deep"])] });
    edit(() => setReferences(BIB));
    edit(() => enter(keysField(), "vaswani2017, lecun2015deep"));
    const list = notes()!;
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(list.textContent).toContain("vaswani2017 is not in the bibliography");
    expect(list.textContent).toContain("Did you mean vaswani2017attention?");
    fireEvent.click(within(list).getByRole("button", { name: "Use it" }));
    expect(the(kit).keys).toEqual(["vaswani2017attention", "lecun2015deep"]);
    expect(notes()).toBeNull();
    edit(() => kit.session.undo());
    expect(the(kit).keys).toEqual(["vaswani2017", "lecun2015deep"]);
  });

  it("go away when another element is selected", async () => {
    const kit = await mount({ elements: [cite(["lecun2015deep"]), cite(["lecun2015deep"])] });
    edit(() => setReferences(BIB));
    edit(() => enter(keysField(), "vaswani2017"));
    expect(notes()).not.toBeNull();
    edit(() => kit.session.select([kit.ids[1] as string]));
    expect(notes()).toBeNull();
  });

  it("offer no guess when nothing is near, and say nothing at all without a bibliography", async () => {
    await mount({ elements: [cite([])] });
    edit(() => enter(keysField(), "zzz1999"));
    expect(notes()).toBeNull();
    edit(() => setReferences(BIB));
    const list = notes()!;
    expect(list.textContent).toContain("zzz1999 is not in the bibliography");
    expect(within(list).queryByRole("button", { name: "Use it" })).toBeNull();
    edit(() => setReferences(null));
    expect(notes()).toBeNull();
  });

  it("leave the swap out when the right key is already there", async () => {
    const kit = await mount({ elements: [cite(["vaswani2017attention"])] });
    edit(() => setReferences(BIB));
    edit(() => enter(keysField(), "vaswani2017, vaswani2017attention"));
    fireEvent.click(inSection().getByRole("button", { name: "Use it" }));
    expect(the(kit).keys).toEqual(["vaswani2017attention"]);
  });
});

describe("Finding a reference for a citation", () => {
  it("is offered only when there are works to find", async () => {
    await mount({ elements: [cite([])] });
    expect(inSection().queryByRole("button", { name: "Find a reference…" })).toBeNull();
    edit(() => setReferences("@comment{nothing}"));
    expect(inSection().queryByRole("button", { name: "Find a reference…" })).toBeNull();
    edit(() => setReferences(BIB));
    expect(inSection().getByRole("button", { name: "Find a reference…" })).toBeTruthy();
  });

  it("adds the key of a work clicked and takes it away when it is clicked again, each one step of undo", async () => {
    const kit = await mount({ elements: [cite(["own2020"])] });
    edit(() => setReferences(BIB));
    fireEvent.click(inSection().getByRole("button", { name: "Find a reference…" }));
    const lecun = () => works().getByRole("option", { name: /LeCun/ });
    expect(lecun().getAttribute("aria-selected")).toBe("false");
    fireEvent.click(lecun());
    expect(the(kit).keys).toEqual(["own2020", "lecun2015deep"]);
    expect(lecun().getAttribute("aria-selected")).toBe("true");
    fireEvent.click(lecun());
    expect(the(kit).keys).toEqual(["own2020"]);
    edit(() => kit.session.undo());
    expect(the(kit).keys).toEqual(["own2020", "lecun2015deep"]);
  });

  it("finds works by what is typed", async () => {
    await mount({ elements: [cite([])] });
    edit(() => setReferences(BIB));
    fireEvent.click(inSection().getByRole("button", { name: "Find a reference…" }));
    fireEvent.change(inSection().getByRole("combobox", { name: /Search/ }), { target: { value: "attention" } });
    expect(works().getAllByRole("option")).toHaveLength(1);
    fireEvent.click(inSection().getByRole("button", { name: "Hide the references" }));
    expect(inSection().queryByRole("combobox", { name: /Search/ })).toBeNull();
  });

  it("marks a work as held only when every selected citation has it, and adds it to all of them", async () => {
    const kit = await mount({ elements: [cite(["lecun2015deep"]), cite(["lecun2015deep", "vaswani2017attention"], { y: 440 })] });
    edit(() => setReferences(BIB));
    fireEvent.click(inSection().getByRole("button", { name: "Find a reference…" }));
    expect(works().getByRole("option", { name: /LeCun/ }).getAttribute("aria-selected")).toBe("true");
    expect(works().getByRole("option", { name: /Vaswani/ }).getAttribute("aria-selected")).toBe("false");
    fireEvent.click(works().getByRole("option", { name: /Vaswani/ }));
    expect(the(kit, 0).keys).toEqual(["lecun2015deep", "vaswani2017attention"]);
    expect(the(kit, 1).keys).toEqual(["lecun2015deep", "vaswani2017attention"]);
  });
});
