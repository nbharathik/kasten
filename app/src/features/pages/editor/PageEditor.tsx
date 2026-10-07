import "./styles/crepe.css";
import "@milkdown/crepe/theme/frame.css";
import "./styles/tokens.css";
import "./styles/notion.css";
import "./styles/mentions.css";
import "./styles/blocks.css";
import "./styles/menus.css";
import "./styles/agent.css";

import type { Crepe } from "@milkdown/crepe";
import { editorViewCtx, parserCtx, serializerCtx } from "@milkdown/kit/core";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { Selection, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { AgentMark } from "../../../lib/vault/types";
import { closeAi, onAiOpen, type AiOpen } from "./ai/ai";
import { AiPanel } from "./ai/AiPanel";
import { setAgentMarks, type AgentActions } from "./blocks/agent-marks";
import { createKastenCrepe } from "./crepe";
import type { FileProvider } from "./files";
import { findMatches } from "./find/find";
import { FindBar, useFindKeys, type FindOpen } from "./find/FindBar";
import { findLink, type LinkProvider } from "./links";
import { openNote, type OpenNote } from "./session";

export interface PageEditorHandle {
  /** Puts the caret at the start of the page, as Enter in the title does. */
  focusStart(): void;
  /** Puts the caret at the end, as a click below the last block does. */
  focusEnd(): void;
  /** Where the caret is, when the editor has focus. */
  caret(): number | null;
  /** Puts the caret back near `pos` after a reload, without scrolling. */
  placeCaret(pos: number): void;
  /** Scrolls to the heading with this text and puts the caret in it;
   * false when the page has none. */
  showHeading(text: string): boolean;
  /** Opens the find bar on the first of `queries` the page holds, marking
   * every place it occurs. */
  find(queries: readonly string[]): void;
  /** Hands the latest typing to `onChange` now. Changes reach it after a
   * 200 ms pause otherwise, and the pause is dropped with the editor. */
  flush(): void;
}

export interface PageEditorProps {
  /** The note body: Markdown without its frontmatter. */
  body: string;
  /** Receives the body to write after every change. Blocks the user did not
   * touch keep their exact bytes. */
  onChange?: (body: string) => void;
  /** Receives a handle once the editor is ready, and null when it goes. */
  onReady?: (handle: PageEditorHandle | null) => void;
  /** The pages `[[links]]` point at. Read when a link is drawn or typed. */
  links?: LinkProvider;
  /** Where pasted and dropped files are kept, and pictures shown from. */
  files?: FileProvider;
  /** The lines of the body an agent wrote that the person has not edited or
   * accepted: their blocks get a margin, and each mark a badge. */
  marks?: readonly AgentMark[];
  /** What the badge on an agent's writing can do. */
  agent?: AgentActions;
  /** The page's title, which AI is told along with the page. */
  title?: string;
  /** Opens the template gallery to fill the page: "Template…" in the slash
   * menu while the page is empty. Read when the editor is made. */
  onTemplate?: () => void;
}

/** Where the heading reading `text` starts, ignoring case, if one does. */
function headingAt(doc: ProseNode, text: string): number | null {
  const wanted = text.trim().toLowerCase();
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name === "heading" && node.textContent.trim().toLowerCase() === wanted) found = pos;
    return node.isBlock && !node.isTextblock;
  });
  return found;
}

function handleFor(crepe: Crepe, flush: () => void, openFind: (query: string) => void): PageEditorHandle {
  const focus = (at: "start" | "end") => {
    const view = crepe.editor.ctx.get(editorViewCtx);
    const selection = at === "start" ? Selection.atStart(view.state.doc) : Selection.atEnd(view.state.doc);
    view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
    view.focus();
  };
  const view = () => crepe.editor.ctx.get(editorViewCtx);
  return {
    focusStart: () => focus("start"),
    focusEnd: () => focus("end"),
    caret: () => (view().hasFocus() ? view().state.selection.head : null),
    placeCaret: (pos) => {
      const { state } = view();
      const at = Math.max(0, Math.min(pos, state.doc.content.size));
      view().dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(at))));
      view().focus();
    },
    showHeading: (text) => {
      const at = headingAt(view().state.doc, text);
      if (at === null) return false;
      const { state } = view();
      view().dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(at + 1))));
      (view().nodeDOM(at) as HTMLElement | null)?.scrollIntoView?.({ block: "start" });
      view().focus();
      return true;
    },
    find: (queries) => {
      const doc = view().state.doc;
      const query = queries.find((q) => findMatches(doc, q).length > 0);
      if (query) openFind(query);
    },
    flush,
  };
}

/** The Milkdown page editor. Reloads when `body` changes identity. */
export function PageEditor({ body, onChange, onReady, links, files, marks, agent, title = "", onTemplate }: PageEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  const onReadyRef = useRef(onReady);
  const linksRef = useRef(links);
  const filesRef = useRef(files);
  const marksRef = useRef(marks);
  const agentRef = useRef(agent);
  const templateRef = useRef(onTemplate);
  const crepeRef = useRef<Crepe | null>(null);
  const [view, setView] = useState<EditorView | null>(null);
  const [find, setFind] = useState<FindOpen | null>(null);
  useFindKeys(rootRef, crepeRef, setFind);
  const [ai, setAi] = useState<AiOpen | null>(null);
  useEffect(() => {
    onChangeRef.current = onChange;
    onReadyRef.current = onReady;
    linksRef.current = links;
    filesRef.current = files;
    agentRef.current = agent;
    templateRef.current = onTemplate;
  }, [onChange, onReady, links, files, agent, onTemplate]);

  // New marks reach the open editor without rebuilding it.
  useEffect(() => {
    marksRef.current = marks;
    const crepe = crepeRef.current;
    if (crepe) setAgentMarks(crepe.editor.ctx.get(editorViewCtx), { marks: marks ?? [] });
  }, [marks]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let disposed = false;
    let crepe: Crepe | undefined;
    let note: OpenNote | undefined;
    let stopAi: (() => void) | undefined;
    /** The document last handed to onChange. */
    let sent: ProseNode | null = null;
    const send = (doc: ProseNode) => {
      if (!note || doc === sent) return;
      sent = doc;
      onChangeRef.current?.(note.save());
    };
    const flush = () => {
      if (crepe && !disposed) send(crepe.editor.ctx.get(editorViewCtx).state.doc);
    };
    void createKastenCrepe(root, {
      onUpdate: (_ctx, doc) => send(doc),
      // Always the latest pages and handlers, without rebuilding the editor.
      links: {
        pages: () => linksRef.current?.pages() ?? [],
        find: (target) => (linksRef.current ? findLink(linksRef.current, target) : null),
        linkText: (page) => linksRef.current?.linkText?.(page) ?? page.title,
        open: (title, how) => linksRef.current?.open(title, how),
        create: (title, open) => linksRef.current?.create?.(title, open),
        preview: (title) => linksRef.current?.preview?.(title) ?? Promise.resolve(null),
        openFile: (href, how) => linksRef.current?.openFile?.(href, how) ?? false,
        embed: (title) => linksRef.current?.embed?.(title) ?? null,
        boards: () => linksRef.current?.boards?.() ?? [],
        createBoard: (title) => linksRef.current?.createBoard?.(title) ?? Promise.resolve(null),
        mountBoard: (host, path) => linksRef.current?.mountBoard?.(host, path) ?? (() => {}),
        openBoard: (path, how) => linksRef.current?.openBoard?.(path, how),
        databases: () => linksRef.current?.databases?.() ?? [],
        mountDatabase: (host, tag, view) => linksRef.current?.mountDatabase?.(host, tag, view) ?? (() => {}),
        openDatabase: (tag, how) => linksRef.current?.openDatabase?.(tag, how),
        createDatabase: (name, view) => linksRef.current?.createDatabase?.(name, view) ?? Promise.resolve(null),
        viewOf: (tag, view) => linksRef.current?.viewOf?.(tag, view) ?? Promise.resolve(null),
      },
      files: filesRef.current && {
        save: (file) => filesRef.current?.save(file) ?? Promise.reject(new Error("This page keeps no files")),
        url: (src) => filesRef.current?.url(src) ?? src,
      },
      agent: {
        accept: () => agentRef.current?.accept() ?? Promise.resolve(),
        undo: (session) => agentRef.current?.undo(session) ?? Promise.resolve(),
        history: (session) => agentRef.current?.history(session),
      },
      onTemplate: templateRef.current && (() => templateRef.current?.()),
    }).then((created) => {
      if (disposed) {
        void created.destroy();
        return;
      }
      crepe = created;
      note = openNote(created, body);
      setAgentMarks(created.editor.ctx.get(editorViewCtx), { blocks: note.blocks, marks: marksRef.current ?? [] });
      crepeRef.current = created;
      // Heard from the moment the editor is there, so no opening is missed.
      stopAi = onAiOpen(created.editor.ctx.get(editorViewCtx), setAi);
      setView(created.editor.ctx.get(editorViewCtx));
      send(created.editor.ctx.get(editorViewCtx).state.doc);
      const openFind = (seed: string) => setFind((was) => ({ replace: false, seed, opened: (was?.opened ?? 0) + 1 }));
      onReadyRef.current?.(handleFor(created, flush, openFind));
    });
    return () => {
      // Typing still inside the 200 ms pause is handed on, not dropped.
      flush();
      disposed = true;
      crepeRef.current = null;
      setView(null);
      setFind(null);
      stopAi?.();
      setAi(null);
      if (crepe) onReadyRef.current?.(null);
      void crepe?.destroy();
    };
  }, [body]);

  return (
    <>
      {find && view && (
        <div className="kasten-find-dock">
          <FindBar view={view} find={find} onClose={() => setFind(null)} />
        </div>
      )}
      <div ref={rootRef} className="kasten-page-editor" data-testid="page-editor" />
      {ai &&
        view &&
        createPortal(
          <AiPanel
            key={ai.opened}
            view={view}
            open={ai}
            title={title}
            parse={(markdown) => crepeRef.current?.editor.ctx.get(parserCtx)(markdown) ?? null}
            serialize={(doc) => crepeRef.current?.editor.ctx.get(serializerCtx)(doc) ?? ""}
            onClose={() => {
              closeAi(view);
              setAi(null);
            }}
          />,
          ai.host,
        )}
    </>
  );
}
