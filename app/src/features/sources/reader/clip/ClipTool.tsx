// The reader's clip tool. While it is on, a layer over the pages takes the
// pointer: a press and drag draws a box around a figure (text is not selected),
// the box can be moved and resized by its handles, and a form under it asks for
// the paper's citation key and a caption. "Save to gallery" cuts the box out of
// the page at 300 dpi and keeps it in the vault with where it came from.
// Escape puts the box away, and once more leaves the tool.

import type { PDFDocumentProxy } from "pdfjs-dist";
import { type PointerEvent as ReactPointer, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { freeKey, inFocusedPane } from "../../../../lib/keys";
import type { PdfRect } from "../../../../lib/vault/types";
import { useWorkspace } from "../../../workspace/store";
import { type Box, pdfRects, type Transform, viewBox } from "../../pdf/geometry";
import { useSourceTitle } from "../../store";
import { ClipBox } from "./ClipBox";
import { saveClip } from "./clip-file";
import { ClipForm } from "./ClipForm";
import { cropPage, pixelsOf, problemAt } from "./crop";
import { follow, type Pointer } from "./follow";
import { dragBox, type Handle, MIN_SIDE, moveBox, type Point, resizeBox, type Size } from "./region";
import { useClipContext } from "./use-clip-context";

import "./clip.css";

/** The form's width, for keeping it inside the pages' scroll area. */
const FORM_WIDTH = 320;

interface Props {
  doc: PDFDocumentProxy;
  /** The PDF's path in sources/. */
  path: string;
  scale: number;
  /** The reader's transform of a page: PDF points to CSS pixels of the page. */
  transformOf(page: number): Transform;
  /** Leaves the tool. */
  onStop(): void;
}

/** The box, kept in PDF points so it stays on its figure when the pages are zoomed. */
interface Clip {
  page: number;
  /** The page's element: the box is drawn inside it. */
  el: HTMLElement;
  rect: PdfRect;
}

type Kind = "draw" | "move" | "resize";

/** Where a pointer is on a page and how big the page is, in the page's own CSS pixels (the window may be zoomed by CSS). */
function onPage(el: HTMLElement, event: { clientX: number; clientY: number }): { at: Point; size: Size } {
  const r = el.getBoundingClientRect();
  const k = el.offsetWidth > 0 && r.width > 0 ? r.width / el.offsetWidth : 1;
  return { at: { x: (event.clientX - r.left) / k, y: (event.clientY - r.top) / k }, size: { width: r.width / k, height: r.height / k } };
}

export function ClipTool({ doc, path, scale, transformOf, onStop }: Props) {
  const client = useWorkspace((s) => s.client);
  const title = useSourceTitle(path);
  const context = useClipContext(client, path, title);
  const layer = useRef<HTMLDivElement>(null);
  const boxEl = useRef<HTMLDivElement>(null);
  const drag = useRef<{ stop(): void } | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  // The key is what was typed, else what the vault suggests for this paper (which may arrive after the box is drawn).
  const [typedKey, setTypedKey] = useState<string | null>(null);
  const keyText = typedKey ?? context.suggested;
  const [caption, setCaption] = useState("");
  const [tick, redraw] = useState(0);

  // The pages report their transforms after they are drawn at a new scale: the box is drawn again from them.
  useEffect(() => void redraw((n) => n + 1), [scale]);
  useEffect(() => () => drag.current?.stop(), []);

  const cancel = () => {
    drag.current?.stop();
    setClip(null);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || saving || !freeKey(event) || !inFocusedPane(layer.current)) return;
      event.preventDefault();
      if (drag.current || clip) cancel();
      else onStop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // The form sits under the box, inside the pages' area.
  useLayoutEffect(() => {
    const sheet = layer.current?.parentElement;
    const box = boxEl.current;
    if (!clip || dragging || !sheet || !box) return setAt(null);
    const s = sheet.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const half = FORM_WIDTH / 2 + 8;
    setAt({ left: Math.min(Math.max(b.left - s.left + b.width / 2, half), Math.max(s.width - half, half)), top: b.bottom - s.top + 10 });
  }, [clip, dragging, scale, tick]);

  /** The page under a point of the window, if there is one. */
  const pageAt = (x: number, y: number) =>
    [...(layer.current?.parentElement?.querySelectorAll<HTMLElement>(":scope > .kasten-pdf-page") ?? [])].find((page) => {
      const r = page.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });

  /** A press on the layer (draw), on the box (move) or on a handle (resize) starts a drag, which is followed to its end. */
  const begin = (event: ReactPointer, kind: Kind, handle: Handle | null = null) => {
    if (event.button !== 0 || saving) return;
    event.preventDefault();
    event.stopPropagation();
    drag.current?.stop();
    const target = kind === "draw" ? pageAt(event.clientX, event.clientY) : clip?.el;
    if (!target) return setClip(null);
    const page = Number(target.dataset.page);
    const transform = transformOf(page);
    const start = onPage(target, event);
    const from = kind === "draw" || !clip ? null : viewBox(transform, clip.rect);
    let last: Box | null = null;
    if (kind === "draw") {
      // A new box starts a new form.
      setClip(null);
      setTypedKey(null);
      setCaption("");
    }
    setAt(null);
    setDragging(true);

    const place = (pointer: Pointer) => {
      const now = onPage(target, pointer);
      const [dx, dy] = [now.at.x - start.at.x, now.at.y - start.at.y];
      const box = !from ? dragBox(start.at, now.at, now.size) : handle ? resizeBox(from, handle, dx, dy, now.size) : moveBox(from, dx, dy, now.size);
      last = box;
      if (box.width > 0 && box.height > 0) setClip({ page, el: target, rect: pdfRects(transform, [box])[0]! });
    };
    const following = follow(target.closest<HTMLElement>(".kasten-reader-pages"), event, place, () => {
      drag.current = null;
      setDragging(false);
      // A press that hardly moved is a click, which puts a box away and draws none.
      if (!from && (!last || last.width < MIN_SIDE || last.height < MIN_SIDE)) setClip(null);
    });
    drag.current = {
      stop() {
        following.stop();
        drag.current = null;
        setDragging(false);
      },
    };
  };

  const save = async () => {
    if (!clip || !client || saving) return;
    setSaving(true);
    const { toast } = useWorkspace.getState();
    try {
      const { bytes } = await cropPage(await doc.getPage(clip.page), clip.rect);
      const added = await saveClip(client, { pdf: path, page: clip.page, rect: clip.rect, png: bytes, key: keyText, caption });
      toast(added.created ? `Clipped to the gallery: ${added.path}` : `That figure is already in the gallery: ${added.path}`);
      setClip(null);
      void context.reload();
    } catch (err) {
      toast(`The figure could not be saved: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const shown = clip ? viewBox(transformOf(clip.page), clip.rect) : null;
  return (
    <>
      <div ref={layer} className="kasten-clip-layer" role="group" aria-label="Clip a figure" onPointerDown={(event) => begin(event, "draw")} onPointerUp={(event) => event.stopPropagation()}>
        {!clip && (
          <p className="kasten-clip-hint" role="status">
            Drag a box around a figure. Esc stops clipping.
          </p>
        )}
      </div>
      {clip && shown && createPortal(<ClipBox ref={boxEl} box={shown} onPress={(event, handle) => begin(event, handle ? "resize" : "move", handle)} />, clip.el)}
      {clip && shown && !dragging && at && (
        <ClipForm
          at={at}
          paper={title}
          page={clip.page}
          pixels={pixelsOf(shown, scale)}
          problem={problemAt(shown, scale)}
          works={context.works}
          keyText={keyText}
          onKey={setTypedKey}
          caption={caption}
          onCaption={setCaption}
          saving={saving}
          onSave={() => void save()}
          onCancel={cancel}
        />
      )}
    </>
  );
}
