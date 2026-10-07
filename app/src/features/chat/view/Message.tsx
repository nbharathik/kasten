// A message in a thread: the question as you typed it, or an answer with its
// text as Markdown and its tool calls as rows, in the order they streamed.
// Rows are memoised on the message, which the store replaces only while it
// streams, so a long thread does not redraw per token.

import { memo, useState, type MouseEvent } from "react";

import { Working } from "../../../ui/BrandMark";

import { howFrom, useWorkspace } from "../../workspace/store";
import { noteAt } from "../../workspace/tree";
import { pinAnswer } from "../actions";
import { Markdown } from "../markdown/Markdown";
import { answerText, type Answer, type Message, type UserMessage } from "../thread";
import { ToolRow } from "./ToolRow";
import { useChatLinks } from "./links";

export const MessageRow = memo(function MessageRow({ message, thread, contextShown }: { message: Message; thread: string; contextShown: boolean }) {
  return message.role === "user" ? <Question message={message} contextShown={contextShown} /> : <AnswerView answer={message} thread={thread} />;
});

function Question({ message, contextShown }: { message: UserMessage; contextShown: boolean }) {
  return (
    <div className="kasten-chat-question">
      <p className="kasten-chat-bubble">{message.text}</p>
      {contextShown && message.context.length > 0 && (
        <p className="kasten-chat-question-context" title="What this message was grounded in">
          {message.context.map((chip) => chip.label).join(" · ")}
        </p>
      )}
    </div>
  );
}

function AnswerView({ answer, thread }: { answer: Answer; thread: string }) {
  const links = useChatLinks();
  const streaming = answer.status === "streaming";
  return (
    <article className="kasten-chat-answer" aria-label="Answer" aria-busy={streaming}>
      {answer.parts.map((part, i) =>
        part.kind === "text" ? <Markdown key={i} text={part.text} onOpenTitle={links.openTitle} /> : <ToolRow key={part.call.id || i} part={part} live={streaming} />,
      )}
      {streaming && answer.parts.length === 0 && (
        <p className="kasten-chat-thinking">
          <Working>Thinking</Working>
        </p>
      )}
      {streaming && answer.parts.length > 0 && <span className="kasten-chat-caret" aria-hidden="true" />}
      {answer.status === "stopped" && <p className="kasten-chat-status">Stopped</p>}
      {answer.status === "error" && (
        <p className="kasten-chat-error" role="alert">
          {answer.error}
        </p>
      )}
      {!streaming && <AnswerActions answer={answer} thread={thread} />}
    </article>
  );
}

function AnswerActions({ answer, thread }: { answer: Answer; thread: string }) {
  const links = useChatLinks();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const pinned = useWorkspace((s) => (answer.pinned ? noteAt(s.notes, answer.pinned) : undefined));
  const text = answerText(answer);
  const pin = async () => {
    setBusy(true);
    await pinAnswer(thread, answer, "here");
    setBusy(false);
  };
  return (
    <div className="kasten-chat-actions">
      <span className="kasten-chat-model-used" title={`${answer.provider} · ${answer.model}`}>
        {answer.model}
      </span>
      {text && (
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      )}
      {pinned ? (
        <button type="button" onClick={(event: MouseEvent) => links.openPath(pinned.path, howFrom(event))} title={`Open “${pinned.title}”`}>
          Pinned · Open card
        </button>
      ) : (
        text && (
          <button type="button" disabled={busy} onClick={() => void pin()}>
            {busy ? "Pinning…" : "Pin as card"}
          </button>
        )
      )}
    </div>
  );
}
