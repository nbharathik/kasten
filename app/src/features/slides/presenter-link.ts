// The two windows of a talk in the desktop app, joined. Each says where it is whenever that changes, and the app's core
// (src-tauri/src/presenter.rs) passes what one says to the other, without reading it. The presenter's view is a window of its own,
// made by the core.

import { type PresentMessage, type PresentSync, readMessage } from "@kasten-slides/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** The event the core passes a message on as. */
const EVENT = "kasten://present";

/** The link of this window to the other one. */
export async function tauriLink(): Promise<PresentSync> {
  const listeners = new Set<(message: PresentMessage) => void>();
  const stop = await listen<unknown>(EVENT, (event) => {
    const message = readMessage(event.payload);
    if (message) for (const listener of [...listeners]) listener(message);
  });
  return {
    post: (message) => void invoke("presenter_post", { message }).catch(() => {}),
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    close: stop,
  };
}

/** Opens the presenter's window for the deck at `path` and returns the link to it; null if it would not open. */
export async function openTauriPresenter(path: string): Promise<PresentSync | null> {
  let link: PresentSync | null = null;
  try {
    // Listening comes first, so that nothing the new window says is missed.
    link = await tauriLink();
    await invoke("open_presenter", { deckPath: path });
    return link;
  } catch {
    link?.close();
    return null;
  }
}

/** Lets the frames of a presentation load the pages the deck embeds (the core refuses every other address); an empty list ends it. */
export async function allowEmbeds(urls: string[]): Promise<void> {
  await invoke("allow_embeds", { urls }).catch(() => {});
}

/** The addresses of the pages a deck embeds, at any depth. */
export function embeddedPages(value: unknown): string[] {
  const found = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
    } else if (node !== null && typeof node === "object") {
      const record = node as Record<string, unknown>;
      if (record.type === "embed" && typeof record.url === "string") found.add(record.url);
      for (const inner of Object.values(record)) walk(inner);
    }
  };
  walk(value);
  return [...found];
}
