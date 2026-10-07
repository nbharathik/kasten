import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type JSX, useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { HostImage } from "../host.ts";
import type { EditorSession } from "../session/session.ts";
import { IMAGE_MIME, droppedImage, startImageDrag } from "./drag.ts";
import { useImageDrops } from "./drops.ts";
import { coverCrop } from "./place.ts";
import { dragAt, mountGallery, transfer } from "./test-kit.tsx";

afterEach(cleanup);

const wide: HostImage = { path: "assets/attention.png", name: "Attention.png", width: 640, height: 160, caption: "Scaled dot-product attention" };

/** The slide's page as the canvas has it: drawn at the scale asked for, with the stage's drop handlers on it. */
function Page({ session, zoom = 1 }: { session: EditorSession; zoom?: number }): JSX.Element {
  const page = useRef<HTMLDivElement>(null);
  const scale = useRef(zoom);
  const drops = useImageDrops(session, page, scale);
  return (
    <div ref={page} data-testid="page" className="ks-page" {...drops}>
      {session.slide.elements.map((element) => (
        <div key={element.id} data-el={element.id} />
      ))}
    </div>
  );
}

const carried = (image: HostImage) => transfer({ [IMAGE_MIME]: JSON.stringify(image) });
const imagesOf = (session: EditorSession) => session.slide.elements.filter((e) => e.type === "image") as (Extract<(typeof session.slide.elements)[number], { type: "image" }>)[];

describe("dragging out of the drawer", () => {
  it("carries the image's path and shape, as a copy", async () => {
    await mountGallery({ images: [wide] });
    const tile = screen.getByRole("option", { name: "Attention.png, Scaled dot-product attention" });
    const data = transfer();
    fireEvent.dragStart(tile, { dataTransfer: data });
    expect(JSON.parse(data.getData(IMAGE_MIME))).toMatchObject({ path: "assets/attention.png", width: 640, height: 160 });
    expect(data.effectAllowed).toBe("copy");
    expect(data.getData("text/plain")).toBe("Attention.png");
    expect(tile.getAttribute("aria-selected")).toBe("true");
    expect(typeof startImageDrag).toBe("function");
  });
});

describe("dropping on the slide", () => {
  it("puts the image where it is let go, in its own shape, as one step of undo", async () => {
    const kit = await mountGallery({ images: [wide] });
    render(<Page session={kit.session} />);
    const page = screen.getByTestId("page");
    dragAt("drop", page, carried(wide), 480, 270);
    await waitFor(() => expect(imagesOf(kit.session)).toHaveLength(1));
    const [placed] = imagesOf(kit.session);
    expect(placed).toMatchObject({ src: "assets/attention.png", alt: "Scaled dot-product attention", w: 480, h: 120, x: 240, y: 210 });
    act(() => void kit.session.undo());
    expect(imagesOf(kit.session)).toHaveLength(0);
  });

  it("keeps a drop near the edge on the slide", async () => {
    const kit = await mountGallery({ images: [wide] });
    render(<Page session={kit.session} />);
    dragAt("drop", screen.getByTestId("page"), carried(wide), 950, 530);
    await waitFor(() => expect(imagesOf(kit.session)).toHaveLength(1));
    const [placed] = imagesOf(kit.session);
    expect((placed!.x ?? 0) + (placed!.w ?? 0)).toBeLessThanOrEqual(960);
    expect((placed!.y ?? 0) + (placed!.h ?? 0)).toBeLessThanOrEqual(540);
  });

  it("scales the drop point by the zoom", async () => {
    const kit = await mountGallery({ images: [wide] });
    render(<Page session={kit.session} zoom={0.5} />);
    dragAt("drop", screen.getByTestId("page"), carried(wide), 240, 135);
    await waitFor(() => expect(imagesOf(kit.session)).toHaveLength(1));
    expect(imagesOf(kit.session)[0]).toMatchObject({ x: 240, y: 210 });
  });

  it("fills an empty image slot of the layout, cropped to cover it, without moving it", async () => {
    const kit = await mountGallery({ images: [wide], layout: "image-caption" });
    render(<Page session={kit.session} />);
    const slot = imagesOf(kit.session).find((e) => e.src === "");
    expect(slot, "the layout has an empty image slot").toBeTruthy();
    const frame = kit.session.elements.boxOf(slot!)!;
    dragAt("drop", screen.getByTestId("page"), carried(wide), frame.x + frame.w / 2, frame.y + frame.h / 2);
    await waitFor(() => expect(imagesOf(kit.session).find((e) => e.id === slot!.id)?.src).toBe("assets/attention.png"));
    const filled = imagesOf(kit.session).find((e) => e.id === slot!.id)!;
    expect(imagesOf(kit.session)).toHaveLength(imagesOf(kit.session).length);
    expect(filled.placeholder).toBe(slot!.placeholder);
    expect(filled.alt).toBe("Scaled dot-product attention");
    expect(filled.crop).toEqual(coverCrop({ w: 640, h: 160 }, frame));
    expect(kit.session.elements.boxOf(filled)).toEqual(frame);
  });

  it("shows where the drop would go while dragging, and stops when it leaves", async () => {
    const kit = await mountGallery({ images: [wide], layout: "image-caption" });
    render(<Page session={kit.session} />);
    const page = screen.getByTestId("page");
    const slot = imagesOf(kit.session).find((e) => e.src === "")!;
    const frame = kit.session.elements.boxOf(slot)!;
    expect(dragAt("dragOver", page, carried(wide), frame.x + 5, frame.y + 5)).toBe(false);
    expect(page.querySelector(`[data-el="${slot.id}"]`)?.classList.contains("ks-drop-hot")).toBe(true);
    dragAt("dragOver", page, carried(wide), 2, 2);
    expect(page.classList.contains("ks-drop-hot")).toBe(true);
    expect(page.querySelector(`[data-el="${slot.id}"]`)?.classList.contains("ks-drop-hot")).toBe(false);
    fireEvent.dragLeave(page, { relatedTarget: document.body });
    expect(page.classList.contains("ks-drop-hot")).toBe(false);
  });

  it("ignores what is not an image: text dragged over, and drops that carry nothing", async () => {
    const kit = await mountGallery({ images: [wide] });
    render(<Page session={kit.session} />);
    const page = screen.getByTestId("page");
    expect(dragAt("dragOver", page, transfer({ "text/plain": "words" }))).toBe(true);
    expect(dragAt("drop", page, transfer({ "text/plain": "words" }), 10, 10)).toBe(true);
    expect(imagesOf(kit.session)).toHaveLength(0);
  });

  it("keeps pictures dragged in from the computer, and puts them where they are let go", async () => {
    const kit = await mountGallery({ images: [] });
    render(<Page session={kit.session} />);
    const file = new File([new Uint8Array([137, 80, 78, 71, 9])], "Logo.png", { type: "image/png" });
    const text = new File(["x"], "notes.txt", { type: "text/plain" });
    dragAt("drop", screen.getByTestId("page"), transfer({}, [file, text]), 300, 200);
    await waitFor(() => expect(imagesOf(kit.session)).toHaveLength(1));
    const [placed] = imagesOf(kit.session);
    expect(placed!.src).toBe("assets/Logo.png");
    const centre = { x: (placed!.x ?? 0) + (placed!.w ?? 0) / 2, y: (placed!.y ?? 0) + (placed!.h ?? 0) / 2 };
    expect(Math.abs(centre.x - 300)).toBeLessThanOrEqual(2);
    expect(Math.abs(centre.y - 200)).toBeLessThanOrEqual(2);
    expect((await kit.host.assetInfo("assets/Logo.png"))?.source).toBe("file");
  });
});

describe("a figure of a paper", () => {
  const figure: HostImage = { ...wide, citationKey: "vaswani2017attention" };
  const other: HostImage = { path: "assets/bert.png", name: "bert.png", width: 400, height: 300, citationKey: "devlin2019bert" };
  const citationsOf = (session: EditorSession) => session.slide.elements.filter((e) => e.type === "citation") as { keys: string[] }[];

  it("carries the paper's key with the drag, and reads it back from the drop", async () => {
    await mountGallery({ images: [figure] });
    const data = transfer();
    fireEvent.dragStart(screen.getByRole("option", { name: "Attention.png, Scaled dot-product attention" }), { dataTransfer: data });
    expect(JSON.parse(data.getData(IMAGE_MIME))).toMatchObject({ path: "assets/attention.png", citationKey: "vaswani2017attention" });
    expect(droppedImage({ dataTransfer: data } as unknown as Parameters<typeof droppedImage>[0])).toMatchObject({ citationKey: "vaswani2017attention", caption: "Scaled dot-product attention" });
  });

  it("cites the paper once when the figure is dropped on the slide, and adds the next paper's key to that citation", async () => {
    const kit = await mountGallery({ images: [figure, other] });
    render(<Page session={kit.session} />);
    const page = screen.getByTestId("page");
    dragAt("drop", page, carried(figure), 300, 200);
    await waitFor(() => expect(citationsOf(kit.session)).toHaveLength(1));
    expect(citationsOf(kit.session)[0]!.keys).toEqual(["vaswani2017attention"]);
    dragAt("drop", page, carried(figure), 700, 300);
    await waitFor(() => expect(imagesOf(kit.session)).toHaveLength(2));
    expect(citationsOf(kit.session).map((c) => c.keys)).toEqual([["vaswani2017attention"]]);
    dragAt("drop", page, carried(other), 500, 400);
    await waitFor(() => expect(imagesOf(kit.session)).toHaveLength(3));
    expect(citationsOf(kit.session).map((c) => c.keys)).toEqual([["vaswani2017attention", "devlin2019bert"]]);
    expect(kit.errors).toEqual([]);
  });

  it("cites the paper when the figure fills an empty image slot", async () => {
    const kit = await mountGallery({ images: [figure], layout: "image-caption" });
    render(<Page session={kit.session} />);
    const slot = imagesOf(kit.session).find((e) => e.src === "")!;
    const frame = kit.session.elements.boxOf(slot)!;
    dragAt("drop", screen.getByTestId("page"), carried(figure), frame.x + frame.w / 2, frame.y + frame.h / 2);
    await waitFor(() => expect(citationsOf(kit.session)).toHaveLength(1));
    expect(imagesOf(kit.session).find((e) => e.id === slot.id)?.src).toBe("assets/attention.png");
    expect(citationsOf(kit.session)[0]!.keys).toEqual(["vaswani2017attention"]);
  });

  it("takes from a drag only what has the right kind of value", () => {
    const read = (payload: unknown) => droppedImage({ dataTransfer: transfer({ [IMAGE_MIME]: JSON.stringify(payload) }) } as unknown as Parameters<typeof droppedImage>[0]);
    expect(read({ path: "assets/a.png", name: "A", width: 10, height: 5, caption: "c", citationKey: "k" })).toEqual({ path: "assets/a.png", name: "A", width: 10, height: 5, caption: "c", citationKey: "k" });
    expect(read({ path: "assets/a.png", width: "wide", height: -3, caption: ["x"], citationKey: 7 })).toEqual({ path: "assets/a.png", name: "assets/a.png" });
    expect(read({ name: "no path" })).toBeNull();
    expect(read({ path: "" })).toBeNull();
    expect(read(null)).toBeNull();
    expect(read(7)).toBeNull();
  });
});

describe("filling a slot", () => {
  it("crops the picture to the slot's shape, centred, and leaves a picture of that shape whole", () => {
    expect(coverCrop({ w: 800, h: 400 }, { w: 200, h: 200 })).toEqual({ left: 0.25, right: 0.25, top: 0, bottom: 0 });
    expect(coverCrop({ w: 400, h: 800 }, { w: 200, h: 200 })).toEqual({ left: 0, right: 0, top: 0.25, bottom: 0.25 });
    expect(coverCrop({ w: 400, h: 200 }, { w: 200, h: 100 })).toBeNull();
    expect(coverCrop({ w: 400, h: 200 }, { w: 201, h: 100 })).toBeNull();
    expect(coverCrop({ w: 0, h: 200 }, { w: 200, h: 100 })).toBeNull();
  });
});
