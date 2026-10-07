// A real deck, session and the images drawer for their tests, on a host whose
// images the test chooses.

import type { DeckEngine, Element } from "@kasten-slides/wasm";
import { type RenderResult, act, createEvent, fireEvent, render } from "@testing-library/react";

import { newDeck } from "../../test/engine.ts";
import type { HostImage, ImageUse, SlidesHost } from "../host.ts";
import { MemoryHost } from "../memory-host.ts";
import { EditorSession } from "../session/session.ts";
import { EditorUi } from "../ui-state.ts";
import { GalleryDrawer } from "./GalleryDrawer.tsx";

/** A host with a list of images chosen by the test, and small copies it can be told about. */
export class ListedHost extends MemoryHost {
  listed: HostImage[] = [];
  /** How the host makes small copies, if it does: a test sets it. */
  thumbnailUrl?: SlidesHost["thumbnailUrl"];
  edits: { path: string; edit: unknown }[] = [];
  opened: string[] = [];
  override imageUrl(path: string): string | undefined {
    return `memory:${path}`;
  }
  override async images(): Promise<HostImage[]> {
    return this.listed;
  }
  override async setImageMeta(path: string, edit: Parameters<MemoryHost["setImageMeta"]>[1]) {
    this.edits.push({ path, edit });
    const held = this.listed.find((image) => image.path === path);
    if (!held) return undefined;
    Object.assign(held, { ...(edit.tags ? { tags: edit.tags } : {}), ...(edit.caption !== undefined ? { caption: edit.caption } : {}), ...(edit.citationKey !== undefined ? { citationKey: edit.citationKey } : {}) });
    return { ...held };
  }
  openPath(path: string): void {
    this.opened.push(path);
  }
}

export interface GalleryKit {
  engine: DeckEngine;
  session: EditorSession;
  ui: EditorUi;
  host: ListedHost;
  errors: string[];
  view: RenderResult;
}

interface Options {
  images?: HostImage[];
  usage?: Record<string, ImageUse>;
  elements?: Element[];
  layout?: string;
  /** Set the host up before the drawer is drawn. */
  setup?: (host: ListedHost) => void;
}

/** Opens the drawer on a blank slide (or `layout`), with `elements` on it. */
export async function mountGallery({ images = [], usage = {}, elements = [], layout = "blank", setup }: Options = {}): Promise<GalleryKit> {
  const engine = await newDeck("Gallery", "Light");
  const host = new ListedHost();
  host.listed = images;
  host.usage = usage;
  setup?.(host);
  const errors: string[] = [];
  const session = new EditorSession(engine, host, { saveDelay: 60_000, onError: (message) => errors.push(message) });
  const ui = new EditorUi();
  act(() => {
    session.slides.add({ layout });
    if (elements.length > 0) session.elements.insert(elements);
    ui.toggleGallery(true);
  });
  const view = render(<GalleryDrawer session={session} ui={ui} />);
  await settle();
  return { engine, session, ui, host, errors, view };
}

/** Lets the host's answers arrive and React draw them. */
export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** A stand-in for the browser's DataTransfer, which jsdom does not have. */
export function transfer(data: Record<string, string> = {}, files: File[] = []) {
  const held = new Map(Object.entries(data));
  return {
    held,
    files,
    get types() {
      return [...held.keys(), ...(files.length > 0 ? ["Files"] : [])];
    },
    setData: (type: string, value: string) => void held.set(type, value),
    getData: (type: string) => held.get(type) ?? "",
    effectAllowed: "",
    dropEffect: "",
  };
}

/** Fires a drag event of `kind` at `target` with the pointer at (x, y). */
export function dragAt(kind: "dragOver" | "drop" | "dragLeave", target: HTMLElement, dataTransfer: ReturnType<typeof transfer>, x = 0, y = 0): boolean {
  const event = createEvent[kind](target, { dataTransfer });
  Object.defineProperty(event, "clientX", { value: x });
  Object.defineProperty(event, "clientY", { value: y });
  return fireEvent(target, event);
}
