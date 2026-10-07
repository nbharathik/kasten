import { describe, expect, it } from "vitest";

import { answerText, applyEvent, endTurn, newThread, startTurn, threadTitle, turnStarted, type Answer, type Chip, type Thread } from "./thread";
import type { ChatEvent } from "./types";

const ev = (event: Partial<ChatEvent> & Pick<ChatEvent, "kind">): ChatEvent => ({ chat: "c1", turn: "t1", ...event });
const answer = (thread: Thread) => thread.messages[thread.messages.length - 1] as Answer;
// A chip as threads saved it when chips carried a count: sent without it.
const asked = (text = "Plan the trip") => startTurn(newThread({ context: [{ kind: "note", label: "Seaside trip", ref: ["library/seaside-trip.md"], chars: 1200 } as Chip] }), text, "Claude", "model-small");

describe("chat threads", () => {
  it("sends a question with its context and waits for the answer", () => {
    const thread = asked();
    expect(thread.streaming).toBe(true);
    expect(thread.messages[0]).toMatchObject({ role: "user", text: "Plan the trip", context: [{ kind: "note", label: "Seaside trip", ref: ["library/seaside-trip.md"] }] });
    expect(thread.messages[0]).not.toHaveProperty("context.0.chars");
    expect(answer(thread)).toMatchObject({ role: "assistant", turn: null, status: "streaming", provider: "Claude", model: "model-small" });
    expect(threadTitle(thread)).toBe("Plan the trip");
    expect(threadTitle(newThread())).toBe("New chat");
  });

  it("builds text and tool rows in the order they stream", () => {
    let thread = asked();
    for (const text of ["I'll ", "make ", "it."]) thread = applyEvent(thread, ev({ kind: "text", text }));
    thread = applyEvent(thread, ev({ kind: "tool", tool: { id: "k1", name: "create_note", input: { title: "Hotel ideas" } } }));
    thread = applyEvent(thread, ev({ kind: "text", text: "Done." }));
    expect(answer(thread).turn).toBe("t1");
    expect(answer(thread).parts).toEqual([
      { kind: "text", text: "I'll make it." },
      { kind: "tool", call: { id: "k1", name: "create_note", input: { title: "Hotel ideas" } }, result: null },
      { kind: "text", text: "Done." },
    ]);
    expect(thread.changed).toBe(false);
    thread = applyEvent(thread, ev({ kind: "toolResult", result: { id: "k1", ok: true, summary: "Created card “Hotel ideas”", paths: ["inbox/hotel-ideas.md"] } }));
    expect(answer(thread).parts[1]).toMatchObject({ kind: "tool", result: { ok: true, paths: ["inbox/hotel-ideas.md"] } });
    expect(thread.changed).toBe(true);
    thread = applyEvent(thread, ev({ kind: "done" }));
    expect(answer(thread).status).toBe("done");
    expect(thread.streaming).toBe(false);
    expect(answerText(answer(thread))).toBe("I'll make it.\n\nDone.");
  });

  it("takes the turn from chat_send or from an event that came first", () => {
    const early = applyEvent(asked(), ev({ kind: "text", text: "Hi" }));
    expect(turnStarted(early, { chat: "c1", session: "s1", turn: "t1" })).toMatchObject({ session: "s1" });
    const late = turnStarted(asked(), { chat: "c1", session: "s1", turn: "t9" });
    expect(answer(late).turn).toBe("t9");
    // Events of another turn find no answer.
    expect(applyEvent(late, ev({ kind: "text", text: "stale" }))).toBe(late);
  });

  it("ends on stop and on error, and ignores what comes after", () => {
    let stopped = applyEvent(asked(), ev({ kind: "text", text: "Half" }));
    stopped = applyEvent(stopped, ev({ kind: "done", stopped: true }));
    expect(answer(stopped)).toMatchObject({ status: "stopped", parts: [{ kind: "text", text: "Half" }] });
    expect(applyEvent(stopped, ev({ kind: "text", text: " more" }))).toBe(stopped);

    const failed = applyEvent(asked(), ev({ kind: "error", error: "The provider refused the key" }));
    expect(answer(failed)).toMatchObject({ status: "error", error: "The provider refused the key" });
    expect(failed.streaming).toBe(false);
    expect(answer(applyEvent(asked(), ev({ kind: "error" }))).error).toBe("The answer stopped with an error.");

    const unsent = endTurn(asked(), "error", "No AI provider called “Claude”");
    expect(answer(unsent)).toMatchObject({ status: "error", error: "No AI provider called “Claude”" });
  });

  it("marks a failed tool without counting it as a change", () => {
    let thread = applyEvent(asked(), ev({ kind: "tool", tool: { id: "k1", name: "trash_note", input: {} } }));
    thread = applyEvent(thread, ev({ kind: "toolResult", result: { id: "k1", ok: false, summary: "The note is locked", paths: ["library/plan.md"] } }));
    expect(thread.changed).toBe(false);
    // A result for a call that never came still shows.
    thread = applyEvent(thread, ev({ kind: "toolResult", result: { id: "k2", ok: true, summary: "Searched", paths: [] } }));
    expect(answer(thread).parts).toHaveLength(2);
    expect(thread.changed).toBe(false);
  });
});
