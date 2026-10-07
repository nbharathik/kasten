// The editor's assistant tab: Kasten's chat, in a thread of its own for this deck, told which slide and which
// elements are selected. What the assistant changes is marked in the deck until the person accepts it or changes it.

import "../pages/editor/styles/tokens.css";
import "../chat/chat.css";
import "../chat/threads.css";
import "../chat/messages.css";
import "../chat/composer.css";
import "../chat/menus.css";
import "./ai-tab.css";

import type { AiPanelProps } from "@kasten-slides/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "../../ui/Icon";
import { useChat } from "../chat/store";
import { threadTitle } from "../chat/thread";
import { Composer } from "../chat/view/Composer";
import { useChatSetup } from "../chat/view/Conversation";
import { NoProvider } from "../chat/view/Empty";
import { LinksContext, linksFor } from "../chat/view/links";
import { MessageList } from "../chat/view/MessageList";
import { followSlide, leaveSlide, slideChip, threadOfDeck } from "./ai-thread";

const ASKS = ["Tighten the words on this slide", "Suggest a diagram that shows this", "Check the deck and fix what lint reports"];

/** What an empty thread says: what the assistant can do here, and a few things to ask. */
function Welcome({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="kasten-chat-empty">
      <h2>Ask for a change to the deck</h2>
      <p>The assistant sees the slide you are on and the elements you select. What it changes is marked with a star until you accept it or change it yourself; “Undo this chat’s changes” takes it all back.</p>
      <div className="kasten-chat-suggestions" role="group" aria-label="Start with">
        {ASKS.map((text) => (
          <button key={text} type="button" onClick={() => onPick(text)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The assistant tab of the Slides editor. */
export function AiTab(props: AiPanelProps) {
  useChatSetup();
  const [thread, setThread] = useState<string | null>(null);
  const shown = useRef<{ thread: string; key: string } | null>(null);
  const deck = props.deckPath ?? "";
  const chip = useMemo(
    () => slideChip(props),
    // The chip is made again when the slide or the selection changes, not on every edit of the deck.
    [props.deckPath, props.slideId, props.slideNumber, props.slideTitle, props.elementIds.join("\u0000")],
  );
  const providers = useChat((s) => s.providers);
  const problem = useChat((s) => s.providersError);
  const active = useChat((s) => (thread ? s.threads[thread] : undefined));
  const composer = useRef<{ fill(text: string): void }>(null);

  useEffect(() => {
    setThread(deck ? threadOfDeck(deck) : null);
  }, [deck]);

  useEffect(() => {
    if (!thread) return;
    const before = shown.current;
    shown.current = { thread, key: followSlide(thread, chip, before && before.thread === thread ? before.key : null) };
  }, [thread, chip]);

  useEffect(
    () => () => {
      const last = shown.current;
      if (last) leaveSlide(last.thread, last.key);
      shown.current = null;
    },
    [],
  );

  if (!deck) return <p className="ks-ai-note">The assistant works on decks kept in the vault.</p>;
  if (!thread || !active) return null;
  const none = providers !== null && providers.length === 0;
  return (
    <LinksContext.Provider value={linksFor("dock")}>
      <section className="kasten-chat ks-ai" data-variant="dock" aria-label="Assistant">
        <header className="kasten-chat-head">
          <span className="kasten-chat-title" title={threadTitle(active)}>
            {active.messages.length ? threadTitle(active) : "Assistant"}
          </span>
          <button
            type="button"
            className="kasten-chat-icon-button"
            aria-label="New chat"
            title="New chat"
            disabled={active.messages.length === 0 || active.streaming}
            onClick={() => {
              void useChat.getState().discard(thread);
              setThread(threadOfDeck(deck));
            }}
          >
            <Icon name="compose" className="size-4" />
          </button>
        </header>
        <MessageList thread={active} empty={none ? <NoProvider problem={problem} /> : <Welcome onPick={(text) => composer.current?.fill(text)} />} />
        {props.pending > 0 && (
          <div className="ks-ai-review" role="status">
            <Icon name="agent" className="size-4" />
            <span>
              {props.pending} {props.pending === 1 ? "element is" : "elements are"} the assistant’s, not accepted yet
            </span>
            <button type="button" onClick={props.acceptAll}>
              Accept all
            </button>
          </div>
        )}
        <div className="kasten-chat-foot">
          <Composer key={active.id} ref={composer} thread={active} page={null} ask="Ask for a change to the deck…" />
        </div>
      </section>
    </LinksContext.Provider>
  );
}
