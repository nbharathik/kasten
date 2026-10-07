import type { DeckEngine } from "@kasten-slides/wasm";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { newDeck } from "../../test/engine.ts";
import { mountDialogs } from "./test-kit.tsx";

afterEach(cleanup);

/** A real PNG, 3 by 2 pixels. */
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x02, 0x08, 0x02, 0x00, 0x00, 0x00, 0x12, 0x16, 0xf1, 0x4d, 0x00, 0x00, 0x00, 0x15, 0x49, 0x44, 0x41,
  0x54, 0x78, 0xda, 0x63, 0x94, 0xab, 0x38, 0xc1, 0xc0, 0xc0, 0xc0, 0xc0, 0xc0, 0xc0, 0xc4, 0x00, 0x03, 0x00, 0x18, 0x2e, 0x01, 0x62, 0x87, 0x96, 0x3e, 0xbf, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

const TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

const fileOf = (bytes: Uint8Array, name = "Lecture 4.pptx"): File => new File([bytes as BlobPart], name, { type: TYPE });

/** A PowerPoint file of a talk with two slides, one with a picture. */
async function talk(): Promise<File> {
  const engine = await newDeck("Lecture 4", "Serif");
  engine.apply("add_slide", { layout: "title-body", content: { title: "Results", body: "- one\n- two" } });
  const slide = engine.apply("add_slide", { layout: "blank" }).output.slide;
  engine.apply("add_elements", { slide, elements: [{ type: "image", id: "e-pic", x: 100, y: 100, w: 300, h: 200, src: "assets/pic.png", alt: "A picture" }] });
  return fileOf(engine.exportPptx(new Map([["assets/pic.png", PNG]])).bytes);
}

/** A file of a talk with a build: one slide copied three times, a box changing each time. */
async function build(): Promise<File> {
  const engine = await newDeck("Builds", "Light");
  for (const word of ["a", "b", "c"]) {
    const slide = engine.apply("add_slide", { layout: "title-only", content: { title: "Same title" } }).output.slide;
    const boxes = [0, 1, 2, 3, 4].map((i) => ({
      type: "text" as const,
      id: `e-box${i}`,
      x: 40 + i * 120,
      y: 200,
      w: 100,
      h: 40,
      text: { paragraphs: [{ runs: [{ t: i === 1 ? `changes ${word}` : `box ${i}` }] }] },
    }));
    engine.apply("add_elements", { slide, elements: boxes });
  }
  return fileOf(engine.exportPptx().bytes, "Builds.pptx");
}

const chooser = (): HTMLInputElement => screen.getByLabelText("PowerPoint file") as HTMLInputElement;
const button = (name: string) => screen.getByRole("button", { name });

async function choose(file: File): Promise<void> {
  fireEvent.change(chooser(), { target: { files: [file] } });
  await screen.findByLabelText("What is in the file");
}

describe("Import slides from PowerPoint", () => {
  it("shows what is in a file, and adds its slides at the end in the deck's own look", async () => {
    const kit = await mountDialogs({ dialog: "import", blank: false });
    expect(button("Import").hasAttribute("disabled")).toBe(true);
    await choose(await talk());
    expect(screen.getByText("Lecture 4.pptx")).toBeTruthy();
    expect(screen.getByText(/3 slides, 1 picture/)).toBeTruthy();
    expect((screen.getByRole("radio", { name: /Add to this deck/ }) as HTMLInputElement).checked).toBe(true);

    const before = kit.engine.save();
    await act(async () => void fireEvent.click(button("Import")));
    await waitFor(() => expect(kit.ui.state.dialog).toBeNull());
    expect(kit.engine.deck.slides.map((s) => s.layout)).toEqual(["title", "title", "title-body", "blank"]);
    expect(kit.engine.deck.theme.name).toBe("Light");
    // The picture went to the host, which remembers where it came from, and the slide names it as the host does.
    const [stored] = await kit.host.images();
    expect(stored).toMatchObject({ source: "pptx-import", deck: "Dialogs" });
    const image = kit.engine.deck.slides[3]?.elements.find((e) => e.type === "image");
    expect(image?.type === "image" && image.src).toBe(stored?.path);
    // The first slide that came is on the canvas, and one undo takes the whole import back.
    expect(kit.session.state.slideId).toBe(kit.engine.deck.slides[1]?.id);
    act(() => void kit.session.undo());
    expect(kit.engine.save()).toBe(before);
    expect(kit.engine.canUndo).toBe(false);
  });

  it("replaces the deck with the file's when asked", async () => {
    const kit = await mountDialogs({ dialog: "import", blank: false });
    await choose(await talk());
    fireEvent.click(screen.getByRole("radio", { name: /Replace this deck/ }));
    await act(async () => void fireEvent.click(button("Import")));
    await waitFor(() => expect(kit.ui.state.dialog).toBeNull());
    expect(kit.engine.deck.theme.name).toBe("Serif");
    expect(kit.engine.deck.slides).toHaveLength(3);
    act(() => void kit.session.undo());
    expect(kit.engine.deck.theme.name).toBe("Light");
    expect(kit.engine.deck.slides).toHaveLength(1);
  });

  it("brings a deck that was sent to PowerPoint back as a new version of itself, ids kept", async () => {
    const kit = await mountDialogs({
      dialog: "import",
      blank: false,
      prepare: (engine: DeckEngine) => void engine.apply("add_slide", { layout: "title-body", content: { title: "Results", body: "- one\n- two" } }),
    });
    const ids = kit.engine.deck.slides.map((s) => [s.id, s.elements.map((e) => e.id)]);
    await choose(fileOf(kit.engine.exportPptx().bytes, "Mine.pptx"));
    fireEvent.click(screen.getByRole("radio", { name: /Import as a new version/ }));
    await waitFor(() => expect((screen.getByRole("radio", { name: /Import as a new version/ }) as HTMLInputElement).checked).toBe(true));
    await act(async () => void fireEvent.click(button("Import")));
    await waitFor(() => expect(kit.ui.state.dialog).toBeNull());
    expect(kit.engine.deck.slides.map((s) => [s.id, s.elements.map((e) => e.id)])).toEqual(ids);
  });

  it("offers to collapse slides that repeat each other, and does so only when the offer is taken", async () => {
    const kit = await mountDialogs({ dialog: "import", blank: false });
    await choose(await build());
    const offer = await screen.findByRole("checkbox", { name: /Collapse 3 similar slides into steps/ });
    expect((offer as HTMLInputElement).checked).toBe(false);
    // Left alone, every slide comes in as it is.
    fireEvent.click(offer);
    expect((offer as HTMLInputElement).checked).toBe(true);
    fireEvent.click(offer);
    await act(async () => void fireEvent.click(button("Import")));
    await waitFor(() => expect(kit.ui.state.dialog).toBeNull());
    expect(kit.engine.deck.slides).toHaveLength(5);

    cleanup();
    const other = await mountDialogs({ dialog: "import", blank: false });
    await choose(await build());
    fireEvent.click(await screen.findByRole("checkbox", { name: /Collapse 3 similar slides into steps/ }));
    await act(async () => void fireEvent.click(button("Import")));
    await waitFor(() => expect(other.ui.state.dialog).toBeNull());
    expect(other.engine.deck.slides).toHaveLength(3);
    expect(other.engine.deck.slides[2]?.steps).toBe(2);
    act(() => void other.session.undo());
    expect(other.engine.deck.slides).toHaveLength(1);
  });

  it("says why a file that is not a presentation cannot be imported", async () => {
    const kit = await mountDialogs({ dialog: "import", blank: false });
    fireEvent.change(chooser(), { target: { files: [fileOf(new TextEncoder().encode("just words"), "notes.pptx")] } });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent?.length).toBeGreaterThan(10);
    expect(button("Import").hasAttribute("disabled")).toBe(true);
    expect(kit.engine.deck.slides).toHaveLength(1);
  });

  it("changes nothing when it is cancelled", async () => {
    const kit = await mountDialogs({ dialog: "import", blank: false });
    const before = kit.engine.save();
    await choose(await talk());
    fireEvent.click(button("Cancel"));
    expect(kit.ui.state.dialog).toBeNull();
    expect(kit.engine.save()).toBe(before);
    expect((await kit.host.images()).length).toBe(0);
  });

  it("takes a file that is dropped on it", async () => {
    await mountDialogs({ dialog: "import", blank: false });
    const zone = chooser().closest("label") as HTMLElement;
    fireEvent.drop(zone, { dataTransfer: { files: [await talk()] } });
    await screen.findByLabelText("What is in the file");
    expect(screen.getByText(/3 slides/)).toBeTruthy();
  });
});
