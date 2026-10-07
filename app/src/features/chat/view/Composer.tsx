// Where a message is written: the thread's context chips, a box that grows
// with the text, the model, and Send, or Stop while an answer streams. Enter
// sends and Shift+Enter starts a new line. Typing @ or [[ picks a page to
// add as context. Without a provider the box says why it is off.

import { useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";

import type { NoteMeta } from "../../../lib/vault/types";
import { useWorkspace } from "../../workspace/store";
import { noteChip } from "../context";
import { modelFor } from "../prefs";
import { useChat } from "../store";
import type { Thread } from "../thread";
import { NotePick } from "./AddContext";
import { ContextChips } from "./ContextChips";
import { ModelPicker } from "./ModelPicker";

/** What a thread's box held when you left it, by thread. */
const drafts = new Map<string, string>();

/** The tallest the box grows before it scrolls. */
const MAX_HEIGHT = 220;

export interface ComposerHandle {
  /** Puts `text` in the box, ready to send or change. */
  fill(text: string): void;
}

interface Props {
  thread: Thread;
  /** The page "This page" adds. */
  page: NoteMeta | null;
  autoFocus?: boolean;
  /** What the empty box of a new chat says. */
  ask?: string;
  ref?: Ref<ComposerHandle>;
}

export function Composer({ thread, page, autoFocus = false, ask = "Ask about your notes…", ref }: Props) {
  const providers = useChat((s) => s.providers);
  const [text, setText] = useState(() => drafts.get(thread.id) ?? "");
  const box = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const notes = useWorkspace((s) => s.notes);
  // Where an @ or [[ was typed, while its page picker is open.
  const [mention, setMention] = useState<{ at: number; length: number } | null>(null);
  const choice = modelFor(thread, providers);
  const off = choice ? null : providers === null ? "Reading your AI providers…" : "Add an AI provider in Settings to chat";
  const ready = Boolean(text.trim()) && !thread.streaming && !off;

  const change = (next: string) => {
    setText(next);
    if (next) drafts.set(thread.id, next);
    else drafts.delete(thread.id);
  };

  useImperativeHandle(ref, () => ({
    fill(next) {
      change(next);
      requestAnimationFrame(() => {
        box.current?.focus();
        box.current?.setSelectionRange(next.length, next.length);
      });
    },
  }));

  // Grows with the text up to MAX_HEIGHT, then scrolls.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [text]);

  /** Opens the page picker when what was just typed is @ or [[. */
  const typed = (next: string, caret: number) => {
    const before = next.slice(0, caret);
    if (next.length <= text.length) return;
    if (/(^|\s)@$/.test(before)) setMention({ at: caret - 1, length: 1 });
    else if (before.endsWith("[[")) setMention({ at: caret - 2, length: 2 });
  };
  const closeMention = (picked: NoteMeta | null) => {
    const at = mention?.at ?? text.length;
    if (picked && mention) {
      useChat.getState().addChip(thread.id, noteChip(picked));
      change(text.slice(0, mention.at) + text.slice(mention.at + mention.length));
    }
    setMention(null);
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(at, at);
    });
  };

  const send = async () => {
    if (!ready) return;
    const words = text;
    change("");
    if (!(await useChat.getState().send(thread.id, words))) change(words);
  };

  return (
    <form
      ref={form}
      className="kasten-chat-composer"
      aria-label="Write a message"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <ContextChips thread={thread} page={page} />
      <textarea
        ref={box}
        rows={1}
        value={text}
        autoFocus={autoFocus}
        disabled={Boolean(off)}
        aria-label="Message"
        placeholder={off ?? (thread.messages.length ? "Reply…" : ask)}
        onChange={(event) => {
          typed(event.target.value, event.target.selectionStart ?? event.target.value.length);
          change(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey || event.altKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          void send();
        }}
      />
      {mention && (
        <div className="kasten-chat-mention">
          <NotePick notes={notes} within={form} onClose={() => closeMention(null)} onPick={(note) => closeMention(note)} />
        </div>
      )}
      <div className="kasten-chat-composer-bar">
        <ModelPicker thread={thread} />
        <span className="kasten-chat-grow" />
        {thread.streaming ? (
          <button type="button" className="kasten-chat-stop" disabled={thread.stopping} onClick={() => void useChat.getState().stop(thread.id)}>
            <span className="kasten-chat-stop-mark" aria-hidden="true" />
            {thread.stopping ? "Stopping…" : "Stop"}
          </button>
        ) : (
          <button type="submit" className="kasten-chat-send" disabled={!ready} aria-label="Send" title="Send (Enter)">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M6 11l6-6 6 6" />
            </svg>
          </button>
        )}
      </div>
    </form>
  );
}
