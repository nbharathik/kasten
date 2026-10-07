// A thread's messages, the latest at the bottom. While an answer streams the
// list keeps to the bottom, unless you scrolled up to read.

import { useLayoutEffect, useRef, type ReactNode } from "react";

import { chipKey, type Message, type Thread } from "../thread";
import { MessageRow } from "./Message";
import { SessionBar } from "./SessionBar";

/** Within this many pixels of the bottom counts as at the bottom. */
const NEAR = 48;

const contextOf = (m: Message) => (m.role === "user" ? m.context.map(chipKey).join("\u0001") : null);

export function MessageList({ thread, empty }: { thread: Thread; empty: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  /** The list's height when it last told; a bar coming or going beside it changes that, and is not the person scrolling. */
  const seen = useRef(0);

  useLayoutEffect(() => {
    stick.current = true;
  }, [thread.id]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [thread.id, thread.messages, thread.changed]);

  // While it keeps to the bottom, it keeps to it when something beside the list makes it taller or shorter.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    seen.current = el.clientHeight;
    const watch = new ResizeObserver(() => {
      seen.current = el.clientHeight;
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  // A question shows its context where it starts or changes.
  let before: string | null = "";
  return (
    <div
      ref={scroller}
      className="kasten-chat-scroll"
      onScroll={(e) => {
        const el = e.currentTarget;
        if (el.clientHeight !== seen.current) return;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR;
      }}
    >
      <div className="kasten-chat-column">
        {thread.messages.length === 0 ? (
          empty
        ) : (
          <div role="log" aria-label="Messages" className="kasten-chat-log">
            {thread.messages.map((message) => {
              const context = contextOf(message);
              const shown = context !== null && context !== before;
              if (context !== null) before = context;
              return <MessageRow key={message.id} message={message} thread={thread.id} contextShown={shown} />;
            })}
          </div>
        )}
        <SessionBar thread={thread} />
      </div>
    </div>
  );
}
