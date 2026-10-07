// The window's chats: every thread this session, the one the Chat view and
// the dock show, and the AI providers.
// Events from the backend fold into threads (thread.ts); streamed text
// waits for the next frame (stream.ts). Threads live in memory: a chat
// worth keeping is saved to chats/.

import { create } from "zustand";

import { boardFilesChanged } from "../boards/events";
import { deckFilesChanged } from "../slides/events";
import { useWorkspace } from "../workspace/store";
import { connectChat, type ChatClient } from "./client";
import { keepModel, modelFor } from "./prefs";
import { FrameQueue } from "./stream";
import { applyEvent, bare, chipKey, endTurn, newThread, startTurn, turnStarted, type Answer, type Chip, type Thread } from "./thread";
import type { ChatEvent, ChatProvider, ProviderDraft } from "./types";

export interface ChatState {
  client: ChatClient | null;
  /** Null until read. */
  providers: ChatProvider[] | null;
  /** Why they could not be read. */
  providersError: string | null;
  threads: Record<string, Thread>;
  /** Thread ids, the latest used first. */
  order: string[];
  /** The thread the Chat view and the dock show. */
  active: string | null;

  /** The backend, connected on first use. */
  ensure(): ChatClient;
  connect(client: ChatClient | null): void;
  loadProviders(): Promise<void>;
  /** Rejects with the backend's reason. */
  saveProvider(provider: ProviderDraft, key: string | null): Promise<void>;
  removeProvider(name: string): Promise<void>;
  confirmProvider(name: string): Promise<void>;
  /** A new thread, shown at once with `open`. */
  start(options?: { context?: Chip[]; open?: boolean }): string;
  open(id: string): void;
  /** Whether the message went: not while answering, nor without a provider. */
  send(id: string, text: string): Promise<boolean>;
  stop(id: string): Promise<void>;
  /** Forgets a thread here and on the backend. */
  discard(id: string): Promise<void>;
  choose(id: string, provider: string, model: string | null): void;
  addChip(id: string, chip: Chip): void;
  removeChip(id: string, key: string): void;
  pinned(id: string, message: string, path: string): void;
  undone(id: string): void;
  receive(event: ChatEvent): void;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** How long a stopped turn may take to say so before the window ends it. */
const STOP_GRACE_MS = 8000;

let unlisten: (() => void) | null = null;
/** Provider reads cross: the newest one's answer wins. */
let reads = 0;
let queue: FrameQueue<ChatEvent> | null = null;

/** Hands streamed text waiting for the next frame to the store now. */
export const flushStream = () => queue?.flush();

const lastId = (thread: Thread) => thread.messages[thread.messages.length - 1]?.id;

/** Notes and boards a tool wrote, so lists and open boards show them. */
function touched(paths: string[]): void {
  const notes = paths.filter((p) => p.endsWith(".md"));
  if (notes.length > 0) void useWorkspace.getState().filesChanged(notes);
  boardFilesChanged(paths);
  // An open deck takes in what a tool changed in it.
  deckFilesChanged(paths);
}

export const useChat = create<ChatState>()((set, get) => {
  const update = (id: string, change: (thread: Thread) => Thread) =>
    set((s) => {
      const thread = s.threads[id];
      const next = thread && change(thread);
      return next && next !== thread ? { threads: { ...s.threads, [id]: next } } : s;
    });

  const fold = (events: ChatEvent[]) =>
    set((s) => {
      let threads = s.threads;
      for (const event of events) {
        const thread = threads[event.chat];
        const next = thread && applyEvent(thread, event);
        if (!next || next === thread) continue;
        if (threads === s.threads) threads = { ...threads };
        threads[event.chat] = next;
      }
      return threads === s.threads ? s : { threads };
    });
  queue = new FrameQueue(fold);

  const toFront = (id: string) => set((s) => (s.order[0] === id ? s : { order: [id, ...s.order.filter((o) => o !== id)] }));

  return {
    client: null,
    providers: null,
    providersError: null,
    threads: {},
    order: [],
    active: null,

    ensure() {
      const { client } = get();
      if (client) return client;
      const connected = connectChat();
      get().connect(connected);
      return connected;
    },

    connect(client) {
      unlisten?.();
      unlisten = client ? client.onEvent((event) => get().receive(event)) : null;
      set({ client, providers: null, providersError: null });
    },

    async loadProviders() {
      const client = get().ensure();
      const read = ++reads;
      try {
        const providers = await client.providers();
        if (read === reads) set({ providers, providersError: null });
      } catch (err) {
        if (read === reads) set((s) => ({ providers: s.providers ?? [], providersError: message(err) }));
      }
    },

    async saveProvider(provider, key) {
      const providers = await get().ensure().saveProvider(provider, key);
      reads++;
      set({ providers, providersError: null });
    },

    async removeProvider(name) {
      const providers = await get().ensure().removeProvider(name);
      reads++;
      set({ providers, providersError: null });
    },

    async confirmProvider(name) {
      const providers = await get().ensure().confirmProvider(name);
      reads++;
      set({ providers, providersError: null });
    },

    start({ context = [], open = false } = {}) {
      const thread = newThread({ context });
      set((s) => ({
        threads: { ...s.threads, [thread.id]: thread },
        order: [thread.id, ...s.order],
        ...(open ? { active: thread.id } : {}),
      }));
      return thread.id;
    },

    open(id) {
      if (get().threads[id]) set({ active: id });
    },

    async send(id, text) {
      const client = get().ensure();
      const thread = get().threads[id];
      const words = text.trim();
      if (!thread || thread.streaming || !words) return false;
      const choice = modelFor(thread, get().providers);
      if (!choice) return false;
      update(id, (t) => startTurn(t, words, choice.provider, choice.model));
      keepModel(choice);
      toFront(id);
      try {
        const turn = await client.send({ chat: id, provider: choice.provider, model: choice.model, text: words, context: thread.context.map(bare) });
        update(id, (t) => turnStarted(t, turn));
        // Stop pressed before the turn began reached nothing: ask again now.
        if (get().threads[id]?.stopping) await client.stop(id).catch(() => {});
      } catch (err) {
        queue?.flush();
        update(id, (t) => endTurn(t, "error", message(err)));
      }
      return true;
    },

    async stop(id) {
      const thread = get().threads[id];
      if (!thread?.streaming) return;
      update(id, (t) => ({ ...t, stopping: true }));
      const answer = lastId(thread);
      const end = () => {
        queue?.flush();
        update(id, (t) => (t.stopping && lastId(t) === answer ? endTurn(t, "stopped") : t));
      };
      try {
        await get().ensure().stop(id);
        setTimeout(end, STOP_GRACE_MS);
      } catch {
        end();
      }
    },

    async discard(id) {
      if (!get().threads[id]) return;
      set((s) => {
        const threads = { ...s.threads };
        delete threads[id];
        return { threads, order: s.order.filter((o) => o !== id), active: s.active === id ? null : s.active };
      });
      await get()
        .ensure()
        .reset(id)
        .catch(() => {});
    },

    choose(id, provider, model) {
      const clean = model?.trim() || null;
      update(id, (t) => (t.provider === provider && t.model === clean ? t : { ...t, provider, model: clean }));
      const known = get().providers?.find((p) => p.name === provider);
      if (known) keepModel({ provider, model: clean ?? known.model });
    },

    addChip(id, chip) {
      const key = chipKey(chip);
      update(id, (t) => (t.context.some((c) => chipKey(c) === key) ? t : { ...t, context: [...t.context, chip] }));
    },

    removeChip(id, key) {
      update(id, (t) => ({ ...t, context: t.context.filter((c) => chipKey(c) !== key) }));
    },

    pinned(id, messageId, path) {
      update(id, (t) => ({ ...t, messages: t.messages.map((m) => (m.id === messageId && m.role === "assistant" ? ({ ...m, pinned: path } satisfies Answer) : m)) }));
    },

    undone(id) {
      update(id, (t) => ({ ...t, undone: true }));
    },

    receive(raw) {
      if (!get().threads[raw.chat]) return;
      // A result without its paths touched none.
      const event = raw.kind === "toolResult" && raw.result && !Array.isArray(raw.result.paths) ? { ...raw, result: { ...raw.result, paths: [] } } : raw;
      if (event.kind === "text") return queue?.push(event);
      // Text that came first goes in first.
      queue?.flush();
      fold([event]);
      if (event.kind === "toolResult" && event.result?.ok && event.result.paths.length) touched(event.result.paths);
    },
  };
});
