// A chat thread as the window keeps it: the messages, each answer's text and
// tool rows in the order they streamed, and the agent session the thread
// runs in. Pure functions from one thread to the next, so the store stays
// small and the rules are easy to test.

import type { ChatEvent, ChatTurn, ContextChip, ToolCall, ToolResult } from "./types";

/** A context chip on a thread. Threads saved before chips were counted no
 * more may still carry a `chars` estimate; `bare` leaves it out. */
export type Chip = ContextChip;

export type Part = { kind: "text"; text: string } | { kind: "tool"; call: ToolCall; result: ToolResult | null };

export interface UserMessage {
  id: string;
  role: "user";
  text: string;
  /** What the thread was grounded in when it was sent. */
  context: ContextChip[];
}

export type AnswerStatus = "streaming" | "done" | "stopped" | "error";

export interface Answer {
  id: string;
  role: "assistant";
  /** The turn it answers; null until `chat_send` or its first event names it. */
  turn: string | null;
  provider: string;
  model: string;
  parts: Part[];
  status: AnswerStatus;
  error: string | null;
  /** The card it was pinned as. */
  pinned: string | null;
}

export type Message = UserMessage | Answer;

export interface Thread {
  id: string;
  created: number;
  /** Chosen for this thread; null takes the last one used. */
  provider: string | null;
  model: string | null;
  context: Chip[];
  messages: Message[];
  /** Its agent session, once the first turn has started. */
  session: string | null;
  streaming: boolean;
  /** Stop was pressed; the turn's done has not come yet. */
  stopping: boolean;
  /** A tool of its session wrote to the vault. */
  changed: boolean;
  /** Its session's changes were undone. */
  undone: boolean;
}

let seq = 0;

/** An id this window has not used: time, a counter and some randomness. */
export function newId(prefix: string): string {
  const random = [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(36).padStart(2, "0")).join("");
  return `${prefix}-${Date.now().toString(36)}${(++seq).toString(36)}${random}`;
}

export function newThread(options: { context?: Chip[]; provider?: string | null; model?: string | null } = {}): Thread {
  return {
    id: newId("chat"),
    created: Date.now(),
    provider: options.provider ?? null,
    model: options.model ?? null,
    context: options.context ?? [],
    messages: [],
    session: null,
    streaming: false,
    stopping: false,
    changed: false,
    undone: false,
  };
}

/** The first thing asked, as the thread's name. */
export function threadTitle(thread: Thread): string {
  const first = thread.messages.find((m): m is UserMessage => m.role === "user");
  const text = first?.text.replace(/\s+/g, " ").trim() ?? "";
  if (!text) return "New chat";
  return text.length > 60 ? `${text.slice(0, 57).trimEnd()}…` : text;
}

/** A chip's identity: two chips naming the same thing are one. */
export const chipKey = (chip: ContextChip) => `${chip.kind}:${chip.ref.join("\u0000")}`;

/** A chip as the request sends it. */
export const bare = ({ kind, label, ref }: ContextChip): ContextChip => ({ kind, label, ref: [...ref] });

/** A message sent: the question, and an answer waiting for its turn. */
export function startTurn(thread: Thread, text: string, provider: string, model: string): Thread {
  const question: UserMessage = { id: newId("m"), role: "user", text, context: thread.context.map(bare) };
  const answer: Answer = { id: newId("m"), role: "assistant", turn: null, provider, model, parts: [], status: "streaming", error: null, pinned: null };
  return { ...thread, provider, model, messages: [...thread.messages, question, answer], streaming: true, stopping: false };
}

/** Where the answer to `turn` is: its own, else the one still waiting for a turn. */
function answerAt(thread: Thread, turn: string): number {
  for (let i = thread.messages.length - 1; i >= 0; i--) {
    const m = thread.messages[i]!;
    if (m.role === "assistant" && m.turn === turn) return i;
  }
  const last = thread.messages.length - 1;
  const waiting = thread.messages[last];
  return waiting?.role === "assistant" && waiting.turn === null && waiting.status === "streaming" ? last : -1;
}

function withAnswer(thread: Thread, at: number, answer: Answer, rest: Partial<Thread> = {}): Thread {
  const messages = thread.messages.slice();
  messages[at] = answer;
  return { ...thread, ...rest, messages };
}

/** `chat_send` answered: the waiting answer takes its turn, the thread its session. */
export function turnStarted(thread: Thread, started: ChatTurn): Thread {
  const at = answerAt(thread, started.turn);
  const session = thread.session === started.session ? {} : { session: started.session };
  if (at < 0) return { ...thread, ...session };
  const answer = thread.messages[at] as Answer;
  return answer.turn === started.turn ? { ...thread, ...session } : withAnswer(thread, at, { ...answer, turn: started.turn }, session);
}

/** Ends the answer under way from this side: `chat_send` failed, or a
 * stopped turn's done never came. */
export function endTurn(thread: Thread, status: "stopped" | "error", error: string | null = null): Thread {
  const at = thread.messages.length - 1;
  const answer = thread.messages[at];
  const done = { streaming: false, stopping: false };
  if (answer?.role !== "assistant" || answer.status !== "streaming") return { ...thread, ...done };
  return withAnswer(thread, at, { ...answer, status, error }, done);
}

/** The answer's parts with `text` added to the text streaming now. */
function appendText(parts: Part[], text: string): Part[] {
  const last = parts[parts.length - 1];
  if (last?.kind === "text") return [...parts.slice(0, -1), { kind: "text", text: last.text + text }];
  return [...parts, { kind: "text", text }];
}

function withResult(parts: Part[], result: ToolResult): Part[] {
  const at = parts.findIndex((p) => p.kind === "tool" && p.call.id === result.id);
  if (at < 0) return [...parts, { kind: "tool", call: { id: result.id, name: "", input: null }, result }];
  const next = parts.slice();
  next[at] = { ...(parts[at] as Extract<Part, { kind: "tool" }>), result };
  return next;
}

/** One streamed event taken into the thread. Events for a turn that has
 * ended, or that the thread never started, change nothing. */
export function applyEvent(thread: Thread, event: ChatEvent): Thread {
  const at = answerAt(thread, event.turn);
  if (at < 0) return thread;
  const found = thread.messages[at] as Answer;
  if (found.status !== "streaming") return thread;
  const answer: Answer = found.turn === event.turn ? found : { ...found, turn: event.turn };
  switch (event.kind) {
    case "text":
      return event.text ? withAnswer(thread, at, { ...answer, parts: appendText(answer.parts, event.text) }) : withAnswer(thread, at, answer);
    case "tool":
      if (!event.tool) return withAnswer(thread, at, answer);
      return withAnswer(thread, at, { ...answer, parts: [...answer.parts, { kind: "tool", call: event.tool, result: null }] });
    case "toolResult": {
      if (!event.result) return withAnswer(thread, at, answer);
      const wrote = event.result.ok && event.result.paths.length > 0;
      return withAnswer(thread, at, { ...answer, parts: withResult(answer.parts, event.result) }, wrote ? { changed: true, undone: false } : {});
    }
    case "done":
      return withAnswer(thread, at, { ...answer, status: event.stopped ? "stopped" : "done" }, { streaming: false, stopping: false });
    case "error":
      return withAnswer(thread, at, { ...answer, status: "error", error: event.error?.trim() || "The answer stopped with an error." }, { streaming: false, stopping: false });
    default:
      return thread;
  }
}

/** The answer's text, its tool rows left out: the text around each tool
 * call as paragraphs of their own. */
export const answerText = (answer: Answer) =>
  answer.parts
    .flatMap((p) => (p.kind === "text" && p.text.trim() ? [p.text.trim()] : []))
    .join("\n\n");
