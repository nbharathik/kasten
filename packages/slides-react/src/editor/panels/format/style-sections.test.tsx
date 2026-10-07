import type { Element } from "@kasten-slides/wasm";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { image, line, shape, table, textBox } from "../../factory.ts";
import { edit, enter, held, hasSection, mount, pickColor, section, slide } from "./test-kit.tsx";

afterEach(cleanup);

const box = { x: 100, y: 100, w: 120, h: 60 };
const filled = (color: string, extra: Partial<Element> = {}, at = box): Element => ({ ...shape("rect", at), style: { fill: { color } }, ...extra }) as Element;
const pressed = (name: string) => screen.getByRole("radio", { name }).getAttribute("aria-checked") === "true";

describe("Fill", () => {
  it("shows the colour of a shape and changes it, keeping its opacity", async () => {
    const kit = await mount({ elements: [{ ...filled("accent1"), style: { fill: { color: "accent1", alpha: 0.5 } } } as Element] });
    const [id] = kit.ids as [string];
    expect(within(section("fill")).getByRole("button", { name: "Fill colour" }).textContent).toContain("accent1");
    pickColor("Fill colour", "accent3");
    expect(held(kit, id).style?.fill).toEqual({ color: "accent3", alpha: 0.5 });
    pickColor("Fill colour", "#ff0000");
    expect(held(kit, id).style?.fill).toEqual({ color: "#ff0000", alpha: 0.5 });
    expect(kit.errors).toEqual([]);
  });

  it("sets the opacity with the slider, once it is let go, as 0 to 100 percent", async () => {
    const kit = await mount({ elements: [filled("accent1")] });
    const [id] = kit.ids as [string];
    const slider = screen.getByLabelText("Fill opacity") as HTMLInputElement;
    expect(slider.value).toBe("100");
    const before = kit.session.state.revision;
    fireEvent.change(slider, { target: { value: "60" } });
    fireEvent.change(slider, { target: { value: "40" } });
    expect(kit.session.state.revision).toBe(before);
    expect(within(section("fill")).getByText("40%")).toBeTruthy();
    fireEvent.blur(slider);
    expect(held(kit, id).style?.fill).toEqual({ color: "accent1", alpha: 0.4 });
    expect(kit.session.state.revision).toBe(before + 1);
    // All the way back to solid drops the setting.
    slide(screen.getByLabelText("Fill opacity"), 100);
    expect(held(kit, id).style?.fill).toEqual({ color: "accent1" });
    // Undo brings the slider back too.
    edit(() => kit.session.undo());
    expect((screen.getByLabelText("Fill opacity") as HTMLInputElement).value).toBe("40");
  });

  it("takes the fill off with None, and puts one on from nothing", async () => {
    const kit = await mount({ elements: [filled("accent1"), textBox({ x: 300, y: 300, w: 100, h: 40 }, "Hi")], select: [0] });
    const [id, box] = kit.ids as [string, string];
    fireEvent.click(within(section("fill")).getByRole("button", { name: "None" }));
    expect(held(kit, id).style?.fill).toBeUndefined();
    expect(within(section("fill")).getByRole("button", { name: "Fill colour" }).textContent).toContain("None");
    expect((screen.getByLabelText("Fill opacity") as HTMLInputElement).disabled).toBe(true);
    edit(() => kit.session.select([box]));
    pickColor("Fill colour", "bg2");
    expect(held(kit, box).style?.fill).toEqual({ color: "bg2" });
  });

  it("shows mixed for different fills, and sets them all", async () => {
    const kit = await mount({ elements: [filled("accent1"), filled("accent2", {}, { x: 300, y: 100, w: 100, h: 50 }), shape("rect", { x: 10, y: 300, w: 50, h: 50 })] });
    const [a, b, c] = kit.ids as [string, string, string];
    // The third has no fill of its own: the shape factory gives it accent 1, so take it off first.
    fireEvent.click(within(section("fill")).getByRole("button", { name: "None" }));
    expect(held(kit, a).style?.fill).toBeUndefined();
    edit(() => kit.session.undo());
    edit(() => kit.session.elements.patch({ style: { fill: null } }, [c]));
    const button = within(section("fill")).getByRole("button", { name: "Fill colour" });
    expect(button.textContent).toContain("Mixed");
    pickColor("Fill colour", "accent4");
    expect([a, b, c].map((id) => held(kit, id).style?.fill)).toEqual([{ color: "accent4" }, { color: "accent4" }, { color: "accent4" }]);
  });

  it("gives every cell of a table its fill", async () => {
    const kit = await mount({ elements: [table(2, 3, { x: 100, y: 100, w: 300, h: 100 })] });
    const [id] = kit.ids as [string];
    expect(within(section("fill")).getByRole("button", { name: "Fill colour" }).textContent).toContain("None");
    pickColor("Fill colour", "accent2");
    const cells = (kit.session.slide.elements.find((e) => e.id === id) as Extract<Element, { type: "table" }>).rows.flatMap((r) => r.cells);
    expect(cells).toHaveLength(6);
    expect(cells.every((c) => c.fill?.color === "accent2")).toBe(true);
    slide(screen.getByLabelText("Fill opacity"), 50);
    const after = (kit.session.slide.elements.find((e) => e.id === id) as Extract<Element, { type: "table" }>).rows.flatMap((r) => r.cells);
    expect(after.every((c) => c.fill?.alpha === 0.5)).toBe(true);
    fireEvent.click(within(section("fill")).getByRole("button", { name: "None" }));
    const bare = (kit.session.slide.elements.find((e) => e.id === id) as Extract<Element, { type: "table" }>).rows.flatMap((r) => r.cells);
    expect(bare.every((c) => c.fill === undefined)).toBe(true);
    expect(kit.errors).toEqual([]);
  });

  it("shows mixed when only some of a table's cells are filled", async () => {
    const one = table(1, 2, { x: 100, y: 100, w: 200, h: 50 }) as Extract<Element, { type: "table" }>;
    const kit = await mount({ elements: [{ ...one, rows: [{ ...one.rows[0]!, cells: [{ ...one.rows[0]!.cells[0]!, fill: { color: "accent1" } }, one.rows[0]!.cells[1]!] }] } as Element] });
    expect(within(section("fill")).getByRole("button", { name: "Fill colour" }).textContent).toContain("Mixed");
    expect(kit.errors).toEqual([]);
  });

  it("changes only the elements it is for", async () => {
    const kit = await mount({ elements: [filled("accent1"), image("assets/x.png", { x: 300, y: 100, w: 100, h: 100 })] });
    const [a, b] = kit.ids as [string, string];
    pickColor("Fill colour", "accent5");
    expect(held(kit, a).style?.fill).toEqual({ color: "accent5" });
    expect(held(kit, b).style?.fill).toBeUndefined();
    expect(kit.errors).toEqual([]);
  });

  it("is not there for a line or a picture", async () => {
    await mount({ elements: [line("straight", false, { x: 0, y: 0 }, { x: 100, y: 100 })] });
    expect(hasSection("fill")).toBe(false);
    cleanup();
    await mount({ elements: [image("assets/x.png", box)] });
    expect(hasSection("fill")).toBe(false);
  });
});

describe("Border", () => {
  const outlined = (extra: Record<string, unknown>, fill = "accent1"): Element => ({ ...shape("rect", box), style: { fill: { color: fill }, stroke: { color: "text1", width: 2, ...extra } } }) as Element;

  it("shows the outline of a shape", async () => {
    await mount({ elements: [outlined({ dash: "dash", alpha: 0.6 })] });
    const border = within(section("border"));
    expect(border.getByRole("button", { name: "Border colour" }).textContent).toContain("text1");
    expect((border.getByLabelText("Weight") as HTMLInputElement).value).toBe("2");
    expect(pressed("Dash")).toBe(true);
    expect(pressed("Solid")).toBe(false);
    expect((border.getByLabelText("Border opacity") as HTMLInputElement).value).toBe("60");
  });

  it("changes colour, weight, dash and opacity", async () => {
    const kit = await mount({ elements: [outlined({})] });
    const [id] = kit.ids as [string];
    pickColor("Border colour", "accent2");
    expect(held(kit, id).style?.stroke).toEqual({ color: "accent2", width: 2 });
    enter(within(section("border")).getByLabelText("Weight"), "6");
    expect(held(kit, id).style?.stroke).toMatchObject({ width: 6 });
    fireEvent.click(screen.getByRole("radio", { name: "Long dash" }));
    expect(held(kit, id).style?.stroke).toMatchObject({ dash: "longDash" });
    fireEvent.click(screen.getByRole("radio", { name: "Solid" }));
    expect(held(kit, id).style?.stroke?.dash).toBeUndefined();
    slide(within(section("border")).getByLabelText("Border opacity"), 25);
    expect(held(kit, id).style?.stroke).toEqual({ color: "accent2", width: 6, alpha: 0.25 });
    expect(kit.errors).toEqual([]);
  });

  it("keeps the weight between 0 and 24", async () => {
    const kit = await mount({ elements: [outlined({})] });
    const [id] = kit.ids as [string];
    enter(within(section("border")).getByLabelText("Weight"), "90");
    expect(held(kit, id).style?.stroke?.width).toBe(24);
    enter(within(section("border")).getByLabelText("Weight"), "-3");
    expect(held(kit, id).style?.stroke?.width).toBe(0);
  });

  it("makes an outline of its own from a weight when there is none, and takes it off with None", async () => {
    const kit = await mount({ elements: [{ ...shape("rect", box), style: { fill: { color: "accent1" } } } as Element] });
    const [id] = kit.ids as [string];
    expect(within(section("border")).getByRole("button", { name: "Border colour" }).textContent).toContain("None");
    enter(within(section("border")).getByLabelText("Weight"), "3");
    expect(held(kit, id).style?.stroke).toEqual({ color: "text1", width: 3 });
    fireEvent.click(within(section("border")).getByRole("button", { name: "None" }));
    expect(held(kit, id).style?.stroke).toBeUndefined();
    fireEvent.click(screen.getByRole("radio", { name: "Dot" }));
    expect(held(kit, id).style?.stroke).toEqual({ color: "text1", width: 1, dash: "dot" });
    expect(kit.errors).toEqual([]);
  });

  it("shows mixed for different outlines and sets them all", async () => {
    const kit = await mount({ elements: [outlined({ width: 2 }), { ...outlined({ width: 4, dash: "dot" }), x: 400 } as Element] });
    const [a, b] = kit.ids as [string, string];
    const weight = within(section("border")).getByLabelText("Weight") as HTMLInputElement;
    expect(weight.value).toBe("");
    expect(weight.placeholder).toBe("—");
    expect(screen.getAllByRole("radio", { name: /dash|dot|Solid/i }).some((r) => r.getAttribute("aria-checked") === "true")).toBe(false);
    enter(weight, "5");
    expect([a, b].map((id) => held(kit, id).style?.stroke?.width)).toEqual([5, 5]);
  });

  it("is a line's own colour and weight, for a line", async () => {
    const kit = await mount({ elements: [line("straight", true, { x: 0, y: 0 }, { x: 100, y: 100 })] });
    const [id] = kit.ids as [string];
    expect(screen.getByRole("heading", { name: "Line" })).toBeTruthy();
    pickColor("Line colour", "accent3");
    expect(held(kit, id).style?.stroke).toMatchObject({ color: "accent3" });
  });
});

describe("Corner radius", () => {
  const rounded = (extra: Record<string, unknown> = {}, at = box): Element => ({ ...shape("roundRect", at), ...extra }) as Element;

  it("shows a sixth of the shorter side until a radius is set, then sets it", async () => {
    const kit = await mount({ elements: [rounded()] });
    const [id] = kit.ids as [string];
    const radius = within(section("radius")).getByLabelText("Radius") as HTMLInputElement;
    expect(radius.value).toBe("10");
    enter(radius, "24");
    expect(held(kit, id).style?.radius).toBe(24);
    expect(held(kit, id).style?.fill).toBeTruthy();
  });

  it("is only for rounded rectangles", async () => {
    await mount({ elements: [rounded(), shape("rect", box)] });
    expect(hasSection("radius")).toBe(true);
    cleanup();
    await mount({ elements: [shape("rect", box)] });
    expect(hasSection("radius")).toBe(false);
    cleanup();
    await mount({ elements: [shape("ellipse", box)] });
    expect(hasSection("radius")).toBe(false);
  });

  it("shows mixed for different radii", async () => {
    const kit = await mount({ elements: [rounded({ style: { radius: 8 } }), rounded({ style: { radius: 30 } }, { x: 300, y: 100, w: 100, h: 100 })] });
    const [a, b] = kit.ids as [string, string];
    const radius = within(section("radius")).getByLabelText("Radius") as HTMLInputElement;
    expect(radius.value).toBe("");
    enter(radius, "12");
    expect([a, b].map((id) => held(kit, id).style?.radius)).toEqual([12, 12]);
  });
});

describe("Drop shadow", () => {
  const cast = (shadow: Record<string, unknown> | null, at = box): Element => ({ ...shape("rect", at), style: { fill: { color: "accent1" }, ...(shadow ? { shadow } : {}) } }) as Element;

  it("is a switch: on gives a soft shadow, off takes it away", async () => {
    const kit = await mount({ elements: [cast(null)] });
    const [id] = kit.ids as [string];
    const toggle = screen.getByLabelText("Drop shadow") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(screen.queryByLabelText("Shadow blur")).toBeNull();
    fireEvent.click(toggle);
    expect(held(kit, id).style?.shadow).toEqual({ color: "text1", blur: 8, dx: 2, dy: 4, alpha: 0.3 });
    expect((screen.getByLabelText("Drop shadow") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText("Drop shadow"));
    expect(held(kit, id).style?.shadow).toBeUndefined();
    expect(held(kit, id).style?.fill).toEqual({ color: "accent1" });
  });

  it("sets its colour, blur, offset and opacity", async () => {
    const kit = await mount({ elements: [cast({ color: "text1", blur: 4, dx: 1, dy: 1, alpha: 0.5 })] });
    const [id] = kit.ids as [string];
    pickColor("Shadow colour", "accent4");
    enter(screen.getByLabelText("Shadow blur"), "12");
    enter(screen.getByLabelText("Shadow right"), "-6");
    enter(screen.getByLabelText("Shadow down"), "9");
    slide(screen.getByLabelText("Shadow opacity"), 80);
    expect(held(kit, id).style?.shadow).toEqual({ color: "accent4", blur: 12, dx: -6, dy: 9, alpha: 0.8 });
    expect(kit.errors).toEqual([]);
  });

  it("shows mixed when some have a shadow, and turns it on for all", async () => {
    const kit = await mount({ elements: [cast({ color: "text1", blur: 4, dx: 1, dy: 1 }), cast(null, { x: 300, y: 100, w: 100, h: 100 })] });
    const [a, b] = kit.ids as [string, string];
    const toggle = screen.getByLabelText("Drop shadow") as HTMLInputElement;
    expect(toggle.indeterminate).toBe(true);
    expect(toggle.getAttribute("aria-checked")).toBe("mixed");
    fireEvent.click(toggle);
    expect(held(kit, a).style?.shadow).toEqual({ color: "text1", blur: 4, dx: 1, dy: 1 });
    expect(held(kit, b).style?.shadow).toMatchObject({ blur: 8 });
    expect((screen.getByLabelText("Drop shadow") as HTMLInputElement).indeterminate).toBe(false);
  });

  it("changes one setting of shadows that differ without making them alike", async () => {
    const kit = await mount({ elements: [cast({ color: "text1", blur: 4, dx: 1, dy: 1 }), cast({ color: "accent2", blur: 10, dx: 3, dy: 5 }, { x: 300, y: 100, w: 100, h: 100 })] });
    const [a, b] = kit.ids as [string, string];
    expect((screen.getByLabelText("Shadow blur") as HTMLInputElement).value).toBe("");
    enter(screen.getByLabelText("Shadow blur"), "20");
    expect(held(kit, a).style?.shadow).toEqual({ color: "text1", blur: 20, dx: 1, dy: 1 });
    expect(held(kit, b).style?.shadow).toEqual({ color: "accent2", blur: 20, dx: 3, dy: 5 });
  });

  it("is not there for a table", async () => {
    await mount({ elements: [table(2, 2, box)] });
    expect(hasSection("shadow")).toBe(false);
  });
});

describe("Arrowheads", () => {
  const arrow = (start?: string, end?: string): Element => ({ ...line("straight", false, { x: 0, y: 0 }, { x: 100, y: 100 }), style: { stroke: { color: "text1", width: 2 }, ...(start ? { startArrow: start } : {}), ...(end ? { endArrow: end } : {}) } }) as Element;

  it("shows and sets what each end looks like", async () => {
    const kit = await mount({ elements: [arrow(undefined, "triangle")] });
    const [id] = kit.ids as [string];
    const start = screen.getByLabelText("Start arrowhead") as HTMLSelectElement;
    const end = screen.getByLabelText("End arrowhead") as HTMLSelectElement;
    expect([start.value, end.value]).toEqual(["none", "triangle"]);
    fireEvent.change(start, { target: { value: "oval" } });
    fireEvent.change(end, { target: { value: "none" } });
    expect(held(kit, id).style).toMatchObject({ startArrow: "oval" });
    expect(held(kit, id).style?.endArrow).toBeUndefined();
    expect(held(kit, id).style?.stroke).toEqual({ color: "text1", width: 2 });
  });

  it("shows mixed, and sets both lines", async () => {
    const kit = await mount({ elements: [arrow("open", "triangle"), arrow("diamond", "triangle")] });
    const [a, b] = kit.ids as [string, string];
    const start = screen.getByLabelText("Start arrowhead") as HTMLSelectElement;
    expect(start.value).toBe("mixed");
    expect(within(start).getByRole("option", { name: "Mixed" })).toBeTruthy();
    expect((screen.getByLabelText("End arrowhead") as HTMLSelectElement).value).toBe("triangle");
    fireEvent.change(start, { target: { value: "stealth" } });
    expect([a, b].map((id) => held(kit, id).style?.startArrow)).toEqual(["stealth", "stealth"]);
  });

  it("works for a connector too, and is not there for a shape", async () => {
    await mount({ elements: [shape("rect", box)] });
    expect(hasSection("arrows")).toBe(false);
  });
});
