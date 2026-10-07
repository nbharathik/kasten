// Sources and their highlights, for the reader and the Highlights view:
// read when first needed, changed through the vault client (so kasten-core
// writes every change as a commit), and read again when changed on disk.

import { create } from "zustand";

import { isoDay } from "../../lib/dates";
import type { Highlight, HighlightEdit, NewHighlight, NoteFile, SourceInfo } from "../../lib/vault/types";
import { useWorkspace } from "../workspace/store";

interface SourcesState {
  /** Every PDF in sources/, by title; null until read. */
  list: SourceInfo[] | null;
  /** Highlights by source path, in the order they were made, once read. */
  highlights: Record<string, Highlight[]>;
  loadList(): Promise<void>;
  load(source: string): Promise<void>;
  /** Every source and its highlights, in one read. */
  loadAll(): Promise<void>;
  add(source: string, highlight: NewHighlight): Promise<Highlight | null>;
  edit(source: string, id: string, edit: HighlightEdit): Promise<Highlight | null>;
  remove(source: string, id: string): Promise<boolean>;
  /** The highlight's card, made on first asking. */
  card(source: string, id: string): Promise<NoteFile | null>;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** A source's title: its sidecar's, else its file's name. */
export function sourceTitle(list: readonly SourceInfo[] | null | undefined, path: string): string {
  return list?.find((s) => s.path === path)?.title ?? path.split("/").pop()!.replace(/\.pdf$/i, "");
}

/** Runs `op` on the open vault; a failure becomes a toast and null. */
async function attempt<T>(what: string, op: (client: NonNullable<ReturnType<typeof useWorkspace.getState>["client"]>) => Promise<T>): Promise<T | null> {
  const { client, toast } = useWorkspace.getState();
  if (!client) return null;
  try {
    return await op(client);
  } catch (err) {
    toast(`${what}: ${message(err)}`);
    return null;
  }
}

export const useSources = create<SourcesState>()((set, get) => {
  const put = (source: string, change: (list: Highlight[]) => Highlight[]) =>
    set((s) => ({ highlights: { ...s.highlights, [source]: change(s.highlights[source] ?? []) } }));
  const count = (source: string, highlights: number) => set((s) => ({ list: s.list?.map((x) => (x.path === source ? { ...x, highlights } : x)) ?? null }));

  return {
    list: null,
    highlights: {},

    async loadList() {
      const list = await attempt("The sources could not be read", (c) => c.sources());
      if (list) set({ list });
    },

    async load(source) {
      const list = await attempt("The highlights could not be read", (c) => c.highlights(source));
      if (list) put(source, () => list);
    },

    async loadAll() {
      const all = await attempt("The highlights could not be read", (c) => c.allHighlights());
      if (all) set((s) => ({ list: all.map((a) => a.source), highlights: { ...s.highlights, ...Object.fromEntries(all.map((a) => [a.source.path, a.highlights])) } }));
    },

    async add(source, highlight) {
      const added = await attempt("The highlight was not kept", (c) => c.addHighlight(source, highlight));
      if (added) {
        put(source, (list) => [...list, added]);
        count(source, get().highlights[source]!.length);
      }
      return added;
    },

    async edit(source, id, edit) {
      const edited = await attempt("The highlight was not changed", (c) => c.editHighlight(source, id, edit));
      if (edited) put(source, (list) => list.map((h) => (h.id === id ? edited : h)));
      return edited;
    },

    async remove(source, id) {
      const done = await attempt("The highlight was not removed", async (c) => (await c.removeHighlight(source, id), true));
      if (done) {
        put(source, (list) => list.filter((h) => h.id !== id));
        count(source, get().highlights[source]!.length);
      }
      return Boolean(done);
    },

    async card(source, id) {
      const note = await attempt("The card was not made", (c) => c.highlightCard(source, id, isoDay(new Date())));
      if (note) {
        useWorkspace.getState().noteChanged(note.meta);
        put(source, (list) => list.map((h) => (h.id === id ? { ...h, cardId: note.meta.id, card: note.meta.path } : h)));
      }
      return note;
    },
  };
});

/** The title of the source at `path`, kept up to date. */
export function useSourceTitle(path: string): string {
  return useSources((s) => sourceTitle(s.list, path));
}
