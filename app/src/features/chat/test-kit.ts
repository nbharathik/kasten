// For the chat's tests: a backend whose answers the test writes event by
// event, and a store emptied between tests.

import type { NoteFile } from "../../lib/vault/types";
import type { ChatClient } from "./client";
import { useChat } from "./store";
import type { BrainstormRequest, ChatEvent, ChatProvider, ChatRequest, ProviderDraft, WriteRequest } from "./types";

export const CLAUDE: ChatProvider = { name: "Claude", kind: "anthropic", baseUrl: "https://api.anthropic.com", model: "model-small", hasKey: true, confirmed: true };
export const LOCAL: ChatProvider = { name: "Local server", kind: "openai", baseUrl: "http://local-server:8000/v1", model: "local-model", hasKey: false, confirmed: true };

export interface Scripted extends ChatClient {
  requests: ChatRequest[];
  brainstorms: BrainstormRequest[];
  saved: { provider: ProviderDraft; key: string | null }[];
  /** What model lists and draft tests were asked with. */
  drafts: { provider: ProviderDraft; key: string | null }[];
  /** The models every provider offers. */
  models: string[];
  /** What the editor asked AI to write. */
  writes: WriteRequest[];
  /** The answer every write gives, streamed in two pieces. */
  answer: string;
  /** Holds the next write open until stopped, after its first piece. */
  holdNext(): void;
  stops: string[];
  resets: string[];
  /** Sends an event as the backend would. */
  emit(event: ChatEvent): void;
  /** Makes the next send, brainstorm, model list or test fail with this message. */
  failNext(message: string): void;
}

export function scriptedChat(providers: ChatProvider[] = [CLAUDE]): Scripted {
  const listeners = new Set<(event: ChatEvent) => void>();
  let list = [...providers];
  let failure: string | null = null;
  let turns = 0;
  let hold = false;
  const stopped = new Set<string>();
  const client: Scripted = {
    kind: "app",
    requests: [],
    brainstorms: [],
    saved: [],
    drafts: [],
    models: ["model-large", "model-small"],
    writes: [],
    answer: "A clearer sentence.",
    holdNext: () => void (hold = true),
    stops: [],
    resets: [],
    emit: (event) => listeners.forEach((listener) => listener(event)),
    failNext: (message) => void (failure = message),
    providers: async () => list,
    async saveProvider(provider, key) {
      client.saved.push({ provider, key });
      const known = list.find((p) => p.name === provider.name);
      const next = { ...provider, hasKey: key === null ? Boolean(known?.hasKey) : key !== "", confirmed: true };
      list = known ? list.map((p) => (p === known ? next : p)) : [...list, next];
      return list;
    },
    async removeProvider(name) {
      list = list.filter((p) => p.name !== name);
      return list;
    },
    async confirmProvider(name) {
      list = list.map((p) => (p.name === name ? { ...p, confirmed: true } : p));
      return list;
    },
    async testProvider(name, model) {
      const provider = list.find((p) => p.name === name);
      if (failure) {
        const reason = failure;
        failure = null;
        return { ok: false, model: model || provider?.model || "", millis: 12, reply: "", message: reason };
      }
      return { ok: true, model: model || provider?.model || "", millis: 1234, reply: "OK", message: `${name} answered in 1.2 s` };
    },
    async listProviderModels(provider, key) {
      client.drafts.push({ provider, key });
      if (failure) {
        const reason = failure;
        failure = null;
        throw new Error(reason);
      }
      return client.models;
    },
    async testProviderDraft(provider, key) {
      client.drafts.push({ provider, key });
      return client.testProvider(provider.name, provider.model);
    },
    async send(request) {
      if (failure) {
        const reason = failure;
        failure = null;
        throw new Error(reason);
      }
      client.requests.push(request);
      return { chat: request.chat, session: `session-${request.chat}`, turn: `turn-${++turns}` };
    },
    async write(request, onText) {
      client.writes.push(request);
      if (failure) {
        const reason = failure;
        failure = null;
        throw new Error(reason);
      }
      const half = Math.ceil(client.answer.length / 2);
      onText(client.answer.slice(0, half));
      if (hold) {
        hold = false;
        while (!stopped.has(request.id)) await new Promise((done) => setTimeout(done, 5));
        return { text: client.answer.slice(0, half), stopped: true, note: null };
      }
      onText(client.answer.slice(half));
      return { text: client.answer, stopped: false, note: null };
    },
    async stopWrite(id) {
      stopped.add(id);
    },
    async stop(chat) {
      client.stops.push(chat);
    },
    async reset(chat) {
      client.resets.push(chat);
    },
    async save(): Promise<NoteFile> {
      throw new Error("Not in this test");
    },
    async brainstorm(request) {
      if (failure) {
        const reason = failure;
        failure = null;
        throw new Error(reason);
      }
      client.brainstorms.push(request);
      const cards = Array.from({ length: request.count }, (_, i) => `inbox/idea-${i + 1}.md`);
      return { session: `brainstorm-${client.brainstorms.length}`, cards, section: "section-1" };
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  return client;
}

/** An empty chat store on `client`. */
export function resetChat(client: ChatClient): void {
  useChat.setState({ threads: {}, order: [], active: null });
  useChat.getState().connect(client);
}
