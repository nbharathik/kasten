// "Import PowerPoint…" in the Slides view: choosing a file makes a deck and opens it.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { DeckEngine, loadSlides } from "@kasten-slides/wasm";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { VaultClient } from "../../lib/vault/types";
import { useWorkspace } from "../workspace/store";
import { ImportButton } from "./ImportButton";

beforeAll(async () => {
  await loadSlides(await readFile(join(import.meta.dirname, "../../../../packages/slides-wasm/pkg/slides_wasm_bg.wasm")));
});

afterEach(() => {
  cleanup();
  useWorkspace.setState({ client: null });
});

function pptx(): File {
  const engine = DeckEngine.create("Lecture", "Light", 3);
  engine.apply("add_slide", { layout: "title-body", content: { title: "Results" } });
  return new File([engine.exportPptx().bytes as BlobPart], "Lecture.pptx");
}

function fakeVault() {
  return {
    addAsset: vi.fn(async () => ({ path: "assets/x.png" })),
    createDeck: vi.fn(async () => "library/lecture.deck"),
    decks: vi.fn(async () => []),
  } as unknown as VaultClient;
}

describe("Import PowerPoint…", () => {
  it("makes a deck of the chosen file, opens it and says what came", async () => {
    const client = fakeVault();
    const openPath = vi.fn();
    const toast = vi.fn();
    useWorkspace.setState({ client, openPath, toast });
    render(<ImportButton project="projects/talks">Import PowerPoint…</ImportButton>);
    fireEvent.change(screen.getByLabelText("PowerPoint file"), { target: { files: [pptx()] } });
    await waitFor(() => expect(openPath).toHaveBeenCalledWith("library/lecture.deck"));
    expect(client.createDeck).toHaveBeenCalledWith("Lecture", "projects/talks", expect.stringContaining('"format"'));
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("2 slides"));
  });

  it("tells why a file could not be imported and makes nothing", async () => {
    const client = fakeVault();
    const toast = vi.fn();
    useWorkspace.setState({ client, toast });
    const failed = vi.fn();
    render(
      <ImportButton project={null} onFailed={failed}>
        Import PowerPoint…
      </ImportButton>,
    );
    fireEvent.change(screen.getByLabelText("PowerPoint file"), { target: { files: [new File(["words"], "notes.pptx")] } });
    await waitFor(() => expect(failed).toHaveBeenCalled());
    expect(String(failed.mock.calls[0]?.[0]).length).toBeGreaterThan(10);
    expect(client.createDeck).not.toHaveBeenCalled();
    // The button is usable again.
    await act(async () => {});
    expect(screen.getByRole("button", { name: "Import PowerPoint…" }).hasAttribute("disabled")).toBe(false);
  });
});
