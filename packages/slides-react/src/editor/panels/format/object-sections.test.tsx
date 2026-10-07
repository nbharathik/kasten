import type { Element } from "@kasten-slides/wasm";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { image, shape, table, textBox } from "../../factory.ts";
import { edit, enter, hasSection, held, mount, section } from "./test-kit.tsx";

afterEach(cleanup);

type Image = Extract<Element, { type: "image" }>;
type Table = Extract<Element, { type: "table" }>;

const picture = (extra: Partial<Image> = {}, at = { x: 100, y: 100, w: 240, h: 160 }): Element => ({ ...image("assets/x.png", at), ...extra }) as Element;
const imageOf = (kit: Awaited<ReturnType<typeof mount>>, id: string) => held(kit, id) as Image;
const tableOf = (kit: Awaited<ReturnType<typeof mount>>, id: string) => held(kit, id) as Table;
const crop = (name: string) => within(section("image")).getByLabelText(name) as HTMLInputElement;
const masked = (name: string) => screen.getByRole("radio", { name }).getAttribute("aria-checked") === "true";

describe("Image", () => {
  it("chooses the shape a picture shows through", async () => {
    const kit = await mount({ elements: [picture()] });
    const [id] = kit.ids as [string];
    expect(masked("No mask")).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Oval" }));
    expect(imageOf(kit, id).mask).toBe("ellipse");
    expect(masked("Oval")).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: "Rounded rectangle" }));
    expect(imageOf(kit, id).mask).toBe("roundRect");
    fireEvent.click(screen.getByRole("radio", { name: "No mask" }));
    expect(imageOf(kit, id).mask).toBeUndefined();
    expect(kit.errors).toEqual([]);
  });

  it("sets the corner radius of a rounded picture, from the usual one", async () => {
    const kit = await mount({ elements: [picture({ mask: "roundRect" })] });
    const [id] = kit.ids as [string];
    const radius = within(section("image")).getByLabelText("Corner radius") as HTMLInputElement;
    expect(radius.value).toBe("12");
    enter(radius, "30");
    expect(imageOf(kit, id).style?.radius).toBe(30);
  });

  it("has no corner radius for a picture with another mask", async () => {
    await mount({ elements: [picture({ mask: "ellipse" })] });
    expect(within(section("image")).queryByLabelText("Corner radius")).toBeNull();
  });

  it("crops each edge as a share of the picture", async () => {
    const kit = await mount({ elements: [picture()] });
    const [id] = kit.ids as [string];
    expect(["Crop left", "Crop top", "Crop right", "Crop bottom"].map((n) => crop(n).value)).toEqual(["0", "0", "0", "0"]);
    enter(crop("Crop left"), "10");
    enter(crop("Crop bottom"), "25.5");
    expect(imageOf(kit, id).crop).toEqual({ left: 0.1, top: 0, right: 0, bottom: 0.255 });
    expect(crop("Crop left").value).toBe("10");
  });

  it("never lets opposite edges cut it all away", async () => {
    const kit = await mount({ elements: [picture({ crop: { left: 0.5, top: 0, right: 0, bottom: 0 } })] });
    const [id] = kit.ids as [string];
    enter(crop("Crop right"), "90");
    expect(imageOf(kit, id).crop?.right).toBe(0.45);
  });

  it("resets the crop, and drops it when every edge is zero", async () => {
    const kit = await mount({ elements: [picture({ crop: { left: 0.1, top: 0.2, right: 0, bottom: 0 } })] });
    const [id] = kit.ids as [string];
    const reset = screen.getByRole("button", { name: "Reset crop" });
    expect(reset.hasAttribute("disabled")).toBe(false);
    fireEvent.click(reset);
    expect(imageOf(kit, id).crop).toBeUndefined();
    expect(screen.getByRole("button", { name: "Reset crop" }).hasAttribute("disabled")).toBe(true);
    enter(crop("Crop top"), "5");
    enter(crop("Crop top"), "0");
    expect(imageOf(kit, id).crop).toBeUndefined();
  });

  it("shows mixed for pictures cropped differently, and sets them all", async () => {
    const kit = await mount({ elements: [picture({ crop: { left: 0.1, top: 0, right: 0, bottom: 0 } }), picture({ mask: "ellipse" }, { x: 400, y: 100, w: 100, h: 100 })] });
    const [a, b] = kit.ids as [string, string];
    expect(crop("Crop left").value).toBe("");
    expect(crop("Crop left").placeholder).toBe("—");
    expect(crop("Crop top").value).toBe("0");
    expect(["No mask", "Rectangle", "Rounded rectangle", "Oval"].some(masked)).toBe(false);
    enter(crop("Crop left"), "20");
    expect([a, b].map((id) => imageOf(kit, id).crop?.left)).toEqual([0.2, 0.2]);
    fireEvent.click(screen.getByRole("radio", { name: "Rectangle" }));
    expect([a, b].map((id) => imageOf(kit, id).mask)).toEqual(["rect", "rect"]);
  });

  it("has the alt text of the picture, where a person looks for it, and not again further down", async () => {
    const kit = await mount({ elements: [picture()] });
    const [id] = kit.ids as [string];
    const alt = within(section("image")).getByLabelText("Alt text") as HTMLTextAreaElement;
    fireEvent.change(alt, { target: { value: "A cat on a sofa" } });
    fireEvent.blur(alt);
    expect(imageOf(kit, id).alt).toBe("A cat on a sofa");
    expect(screen.getAllByLabelText("Alt text")).toHaveLength(1);
    expect(within(section("access")).queryByLabelText("Alt text")).toBeNull();
  });

  it("leaves the alt text of the shapes among a selection to the section for all elements", async () => {
    const kit = await mount({ elements: [picture(), shape("rect", { x: 300, y: 300, w: 50, h: 50 })] });
    const [a, b] = kit.ids as [string, string];
    // The picture's box changes only the pictures; the other, every element.
    const fromImage = within(section("image")).getByLabelText("Alt text");
    fireEvent.change(fromImage, { target: { value: "Just the picture" } });
    fireEvent.blur(fromImage);
    expect([a, b].map((id) => held(kit, id).alt)).toEqual(["Just the picture", undefined]);
    fireEvent.click(screen.getByRole("button", { name: "Accessibility and layers" }));
    const fromAll = within(section("access")).getByLabelText("Alt text");
    fireEvent.change(fromAll, { target: { value: "Both" } });
    fireEvent.blur(fromAll);
    expect([a, b].map((id) => held(kit, id).alt)).toEqual(["Both", "Both"]);
  });

  it("is only for pictures", async () => {
    await mount({ elements: [shape("rect", { x: 0, y: 0, w: 50, h: 50 })] });
    expect(hasSection("image")).toBe(false);
  });
});

describe("Table", () => {
  const grid = (rows: number, columns: number, at = { x: 100, y: 100, w: 300, h: 120 }): Element => table(rows, columns, at);

  it("counts rows and columns and adds them at the end, growing the table", async () => {
    const kit = await mount({ elements: [grid(3, 3)] });
    const [id] = kit.ids as [string];
    const count = (name: string) => within(section("table")).getByLabelText(name).textContent;
    expect([count("Rows in the table"), count("Columns in the table")]).toEqual(["3", "3"]);
    fireEvent.click(screen.getByRole("button", { name: "Add row" }));
    expect(tableOf(kit, id).rows).toHaveLength(4);
    expect(tableOf(kit, id).rows[3]?.cells).toHaveLength(3);
    expect(tableOf(kit, id).h).toBe(160);
    expect(tableOf(kit, id).rows.map((r) => r.height)).toEqual([40, 40, 40, 40]);
    fireEvent.click(screen.getByRole("button", { name: "Add column" }));
    expect(tableOf(kit, id).columns).toEqual([100, 100, 100, 100]);
    expect(tableOf(kit, id).rows.every((r) => r.cells.length === 4)).toBe(true);
    expect(tableOf(kit, id).w).toBe(400);
    expect([count("Rows in the table"), count("Columns in the table")]).toEqual(["4", "4"]);
    expect(kit.errors).toEqual([]);
  });

  it("keeps the words of the cells it does not touch", async () => {
    const one = grid(2, 2) as Table;
    const kit = await mount({ elements: [{ ...one, rows: one.rows.map((row, r) => ({ ...row, cells: row.cells.map((cell, c) => ({ ...cell, text: { paragraphs: [{ runs: [{ t: `r${r}c${c}`, b: true }] }] } })) })) } as Element] });
    const [id] = kit.ids as [string];
    fireEvent.click(screen.getByRole("button", { name: "Add row" }));
    fireEvent.click(screen.getByRole("button", { name: "Add column" }));
    const words = tableOf(kit, id).rows.map((row) => row.cells.map((cell) => cell.text.paragraphs[0]?.runs[0]?.t));
    expect(words).toEqual([["r0c0", "r0c1", ""], ["r1c0", "r1c1", ""], ["", "", ""]]);
    expect(tableOf(kit, id).rows[0]?.cells[0]?.text.paragraphs[0]?.runs[0]?.b).toBe(true);
  });

  it("takes the last row or column away, and the table gets smaller by it", async () => {
    const kit = await mount({ elements: [grid(3, 4, { x: 100, y: 100, w: 400, h: 150 })] });
    const [id] = kit.ids as [string];
    fireEvent.click(screen.getByRole("button", { name: "Remove row" }));
    expect(tableOf(kit, id).rows).toHaveLength(2);
    expect(tableOf(kit, id).h).toBe(100);
    fireEvent.click(screen.getByRole("button", { name: "Remove column" }));
    expect(tableOf(kit, id).columns).toEqual([100, 100, 100]);
    expect(tableOf(kit, id).w).toBe(300);
    expect(tableOf(kit, id).rows.every((r) => r.cells.length === 3)).toBe(true);
    edit(() => kit.session.undo());
    expect(tableOf(kit, id).columns).toHaveLength(4);
    expect(kit.errors).toEqual([]);
  });

  it("keeps at least one row and one column", async () => {
    await mount({ elements: [grid(1, 1)] });
    expect(screen.getByRole("button", { name: "Remove row" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Remove column" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Add row" }).hasAttribute("disabled")).toBe(false);
  });

  it("does not grow past the edge of the slide", async () => {
    const kit = await mount({ elements: [grid(2, 2, { x: 100, y: 470, w: 300, h: 60 })] });
    const [id] = kit.ids as [string];
    fireEvent.click(screen.getByRole("button", { name: "Add row" }));
    expect(tableOf(kit, id).rows).toHaveLength(3);
    expect(tableOf(kit, id).h).toBe(70);
  });

  it("turns the header row on and off", async () => {
    const kit = await mount({ elements: [grid(2, 2)] });
    const [id] = kit.ids as [string];
    const header = screen.getByLabelText("Header row") as HTMLInputElement;
    expect(header.checked).toBe(true);
    fireEvent.click(header);
    expect(tableOf(kit, id).headerRow).toBeFalsy();
    fireEvent.click(screen.getByLabelText("Header row"));
    expect(tableOf(kit, id).headerRow).toBe(true);
  });

  it("shows mixed for tables of different sizes, and adds to each", async () => {
    const kit = await mount({ elements: [grid(2, 2), { ...grid(3, 2), y: 300 } as Element] });
    const [a, b] = kit.ids as [string, string];
    expect(within(section("table")).getByLabelText("Rows in the table").textContent).toBe("—");
    expect(within(section("table")).getByLabelText("Columns in the table").textContent).toBe("2");
    fireEvent.click(screen.getByRole("button", { name: "Add row" }));
    expect([a, b].map((id) => tableOf(kit, id).rows.length)).toEqual([3, 4]);
  });

  it("shows the header switch mixed for tables that differ", async () => {
    const kit = await mount({ elements: [grid(2, 2), { ...grid(2, 2), y: 300, headerRow: false } as Element] });
    const header = screen.getByLabelText("Header row") as HTMLInputElement;
    expect(header.indeterminate).toBe(true);
    fireEvent.click(header);
    expect(kit.ids.map((id) => tableOf(kit, id).headerRow)).toEqual([true, true]);
  });
});

/** Opens the Accessibility and layers section, which starts folded away. */
const unfold = () => fireEvent.click(screen.getByRole("button", { name: "Accessibility and layers" }));

describe("Accessibility and layers", () => {
  const shapeAt = (extra: Record<string, unknown> = {}): Element => ({ ...shape("rect", { x: 100, y: 100, w: 100, h: 100 }), ...extra }) as Element;

  it("starts folded away, and opens with its title", async () => {
    await mount({ elements: [shapeAt()] });
    const title = screen.getByRole("button", { name: "Accessibility and layers" });
    expect(title.getAttribute("aria-expanded")).toBe("false");
    expect(section("access").querySelector(".ks-sp-section-body")?.hasAttribute("hidden")).toBe(true);
    fireEvent.click(title);
    expect(screen.getByRole("button", { name: "Accessibility and layers" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByLabelText("Alt text")).toBeTruthy();
  });

  it("writes alt text, a layer name and a link when they are left, and takes them off when emptied", async () => {
    const kit = await mount({ elements: [shapeAt()] });
    const [id] = kit.ids as [string];
    unfold();
    const alt = screen.getByLabelText("Alt text") as HTMLTextAreaElement;
    const before = kit.session.state.revision;
    fireEvent.change(alt, { target: { value: "A blue box" } });
    expect(kit.session.state.revision).toBe(before);
    fireEvent.blur(alt);
    expect(held(kit, id).alt).toBe("A blue box");
    enter(screen.getByLabelText("Layer name"), "Blue box");
    expect(held(kit, id).name).toBe("Blue box");
    enter(screen.getByLabelText("Link"), "https://example.com/page");
    expect(held(kit, id).link).toBe("https://example.com/page");
    fireEvent.change(screen.getByLabelText("Alt text"), { target: { value: "  " } });
    fireEvent.blur(screen.getByLabelText("Alt text"));
    expect(held(kit, id).alt).toBeUndefined();
    enter(screen.getByLabelText("Link"), "");
    expect(held(kit, id).link).toBeUndefined();
    expect(kit.errors).toEqual([]);
  });

  it("commits alt text with Ctrl+Enter and puts it back with Escape", async () => {
    const kit = await mount({ elements: [shapeAt({ alt: "Old" })] });
    const [id] = kit.ids as [string];
    unfold();
    const alt = screen.getByLabelText("Alt text") as HTMLTextAreaElement;
    fireEvent.change(alt, { target: { value: "Discarded" } });
    fireEvent.keyDown(alt, { key: "Escape" });
    expect(alt.value).toBe("Old");
    fireEvent.change(alt, { target: { value: "New" } });
    fireEvent.keyDown(alt, { key: "Enter", ctrlKey: true });
    expect(held(kit, id).alt).toBe("New");
  });

  it("makes a bare address a web address, and refuses one that must not be followed", async () => {
    const kit = await mount({ elements: [shapeAt()] });
    const [id] = kit.ids as [string];
    unfold();
    enter(screen.getByLabelText("Link"), "example.com/docs");
    expect(held(kit, id).link).toBe("https://example.com/docs");
    enter(screen.getByLabelText("Link"), "javascript:alert(1)");
    expect(held(kit, id).link).toBe("https://example.com/docs");
    expect(screen.getByRole("alert").textContent).toContain("web address");
    expect(screen.getByLabelText("Link").getAttribute("aria-invalid")).toBe("true");
    enter(screen.getByLabelText("Link"), "slide:s-abc");
    expect(held(kit, id).link).toBe("slide:s-abc");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(kit.errors).toEqual([]);
  });

  it("locks and unlocks", async () => {
    const kit = await mount({ elements: [shapeAt(), shapeAt({ locked: true })] });
    const [a, b] = kit.ids as [string, string];
    unfold();
    const locked = screen.getByLabelText("Locked") as HTMLInputElement;
    expect(locked.indeterminate).toBe(true);
    fireEvent.click(locked);
    expect([a, b].map((id) => held(kit, id).locked)).toEqual([true, true]);
    fireEvent.click(screen.getByLabelText("Locked"));
    expect([a, b].map((id) => Boolean(held(kit, id).locked))).toEqual([false, false]);
  });

  it("shows mixed text for elements that differ", async () => {
    const kit = await mount({ elements: [shapeAt({ alt: "One", name: "A" }), shapeAt({ alt: "Two", name: "A" })] });
    const [a, b] = kit.ids as [string, string];
    unfold();
    const alt = screen.getByLabelText("Alt text") as HTMLTextAreaElement;
    expect(alt.value).toBe("");
    expect(alt.placeholder).toBe("Mixed");
    expect((screen.getByLabelText("Layer name") as HTMLInputElement).value).toBe("A");
    fireEvent.change(alt, { target: { value: "Both" } });
    fireEvent.blur(alt);
    expect([a, b].map((id) => held(kit, id).alt)).toEqual(["Both", "Both"]);
  });

  it("is there for every kind of element", async () => {
    for (const element of [picture(), textBox({ x: 0, y: 0, w: 50, h: 50 }, "Hi"), table(2, 2, { x: 0, y: 0, w: 50, h: 50 })]) {
      await mount({ elements: [element] });
      expect(hasSection("access")).toBe(true);
      cleanup();
    }
  });
});
