// The AI panel in a page, below the text it is about. "Ask AI" takes what
// to do, typed or picked; "Continue writing" and "Summarize page" start at
// once. The answer streams into a preview and the page stays as it is
// until Replace or Insert, one change that Mod+Z takes back, saved as the
// person's own edit. Escape or Discard leaves the page untouched.

import "./ai.css";

import type { Node } from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "../../../../ui/Button";
import { Icon } from "../../../../ui/Icon";
import { openProviders } from "../../../chat/actions";
import { Markdown } from "../../../chat/markdown/Markdown";
import { modelFor } from "../../../chat/prefs";
import { useChat } from "../../../chat/store";
import type { WriteAction } from "../../../chat/types";
import { aiRange, closingAi, type AiOpen } from "./ai";
import { cleanAnswer, pageText, placeAnswer, type Placing } from "./place";

interface Props {
  view: EditorView;
  open: AiOpen;
  /** The page's title, sent with it. */
  title: string;
  /** Markdown to the editor's content, and back. */
  parse(markdown: string): Node | null;
  serialize(doc: Node): string;
  onClose(): void;
}

type Phase = "asking" | "writing" | "done" | "failed" | "setup";

const TITLES: Record<WriteAction, string> = { ask: "Ask AI", continue: "Continue writing", summarize: "Summarize page" };
const ON_TEXT = ["Improve the writing", "Make it shorter", "Fix spelling and grammar", "Turn it into a list"];
const AT_CARET = ["Brainstorm ideas", "Draft an outline", "Write a to-do list"];

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const noLinks = () => {};
let runs = 0;

export function AiPanel({ view, open, title, parse, serialize, onClose }: Props) {
  const providers = useChat((s) => s.providers);
  const [phase, setPhase] = useState<Phase>(open.action === "ask" ? "asking" : "writing");
  const [instruction, setInstruction] = useState("");
  const [asked, setAsked] = useState("");
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useRef<{ id: string; live: boolean } | null>(null);
  const buffer = useRef("");
  const frame = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const [chosen] = useState(() => {
    const range = aiRange(view.state);
    return Boolean(range && range.to > range.from);
  });
  const choice = modelFor({ provider: null, model: null }, providers);
  const client = () => useChat.getState().ensure();

  /** Stops the answer under way, keeping what came. */
  const stop = () => {
    const current = run.current;
    if (current?.live) void client().stopWrite(current.id);
  };
  /** Stops it and forgets it. */
  const abandon = () => {
    stop();
    run.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
  };

  const start = async (asking: string) => {
    const range = aiRange(view.state);
    if (!range) return onClose();
    const pick = modelFor({ provider: null, model: null }, useChat.getState().providers);
    if (!pick) return setPhase("setup");
    abandon();
    const mine = { id: `write-${Date.now().toString(36)}-${++runs}`, live: true };
    run.current = mine;
    buffer.current = "";
    setText("");
    setNote(null);
    setError(null);
    setAsked(asking);
    setPhase("writing");
    const onText = (piece: string) => {
      if (run.current !== mine) return;
      buffer.current += piece;
      if (!frame.current) {
        frame.current = requestAnimationFrame(() => {
          frame.current = 0;
          if (run.current === mine) setText(buffer.current);
        });
      }
    };
    try {
      const page = pageText(view.state.doc, open.action, range, serialize);
      const written = await client().write({ id: mine.id, provider: pick.provider, model: pick.model, action: open.action, instruction: asking, title, ...page }, onText);
      if (run.current !== mine) return;
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      setText(written.text);
      if (!written.text.trim()) {
        setError(written.stopped ? "Stopped before anything was written." : "The model wrote nothing. Try again, or ask another way.");
        setPhase("failed");
      } else {
        setNote(written.note ?? (written.stopped ? "Stopped: take what was written, or try again." : null));
        setPhase("done");
      }
    } catch (err) {
      if (run.current !== mine) return;
      setError(message(err));
      setPhase("failed");
    } finally {
      mine.live = false;
    }
  };

  useEffect(() => {
    let gone = false;
    void (async () => {
      if (useChat.getState().providers === null) await useChat.getState().loadProviders();
      if (gone) return;
      if (open.action !== "ask") void start("");
      else if (!modelFor({ provider: null, model: null }, useChat.getState().providers)) setPhase("setup");
      else input.current?.focus();
    })();
    return () => {
      gone = true;
      abandon();
    };
    // Once per opening: the panel is keyed by it.
  }, []);

  const accept = (how: Placing) => {
    const range = aiRange(view.state);
    const doc = parse(cleanAnswer(text));
    if (!range || !doc || doc.childCount === 0) return setError("This answer could not be put in the page.");
    view.dispatch(closingAi(placeAnswer(view.state, doc.content, range, how)));
    view.focus();
    onClose();
  };
  const discard = () => {
    abandon();
    onClose();
    view.focus();
  };
  const ask = (what: string) => {
    const wanted = what.trim();
    if (wanted) void start(wanted);
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      discard();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && phase === "done") {
      event.preventDefault();
      accept(chosen ? "replace" : "below");
    }
  };

  const answered = phase === "done" || phase === "failed";
  const preview = client().kind === "preview";
  return (
    <div className="kasten-ai" role="dialog" aria-label={TITLES[open.action]} onKeyDown={onKey}>
      <div className="kasten-ai-head">
        <Icon name="sparkle" className="kasten-ai-mark" />
        {open.action === "ask" ? (
          <form
            className="min-w-0 flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              ask(instruction);
            }}
          >
            <input
              ref={input}
              className="kasten-ai-input"
              value={instruction}
              aria-label="Ask AI"
              placeholder={chosen ? "Tell AI what to do with the selection…" : "Ask AI to write…"}
              readOnly={phase === "writing"}
              onChange={(e) => setInstruction(e.target.value)}
            />
          </form>
        ) : (
          <span className="kasten-ai-title">{TITLES[open.action]}</span>
        )}
        {phase === "writing" && (
          <Button size="sm" icon="stop" onClick={stop}>
            Stop
          </Button>
        )}
      </div>
      {phase === "asking" && !instruction && (
        <div className="kasten-ai-quick">
          {(chosen ? ON_TEXT : AT_CARET).map((quick) => (
            <button
              key={quick}
              type="button"
              className="kasten-ai-chip"
              onClick={() => {
                setInstruction(quick);
                ask(quick);
              }}
            >
              {quick}
            </button>
          ))}
        </div>
      )}
      {(phase === "writing" || text) && (
        <div className="kasten-ai-preview" aria-label="AI's answer" aria-busy={phase === "writing"}>
          {text ? <Markdown text={cleanAnswer(text)} onOpenTitle={noLinks} /> : <span className="text-muted">Writing…</span>}
        </div>
      )}
      {note && <p className="kasten-ai-note">{note}</p>}
      {error && (
        <p role="alert" className="kasten-ai-error">
          {error}
        </p>
      )}
      {phase === "setup" && (
        <div className="kasten-ai-quick items-center">
          <span className="text-13 text-muted">Add an AI provider in Settings to write with AI.</span>
          <Button size="sm" onClick={() => openProviders()}>
            Set up AI
          </Button>
        </div>
      )}
      <div className="kasten-ai-foot">
        <span className="kasten-ai-via" title={preview ? "The browser preview writes canned text" : undefined}>
          {choice && `${choice.provider} · ${choice.model}`}
        </span>
        {phase === "done" &&
          (chosen ? (
            <>
              <Button size="sm" tone="primary" onClick={() => accept("replace")}>
                Replace selection
              </Button>
              <Button size="sm" onClick={() => accept("below")}>
                Insert below
              </Button>
            </>
          ) : (
            <Button size="sm" tone="primary" onClick={() => accept("below")}>
              Insert
            </Button>
          ))}
        {answered && (
          <Button size="sm" onClick={() => void start(open.action === "ask" ? instruction.trim() || asked : "")}>
            Try again
          </Button>
        )}
        <Button size="sm" tone="quiet" onClick={discard}>
          Discard
        </Button>
      </div>
    </div>
  );
}
