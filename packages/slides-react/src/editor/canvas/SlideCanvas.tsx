import { cycle } from "@kasten-slides/canvas";
import type { Element, Slide, Theme } from "@kasten-slides/wasm";
import { type JSX, type KeyboardEvent, type PointerEvent, type WheelEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { SlideView } from "../../render/index.ts";
import { dispatchKey } from "../commands/index.ts";
import type { Placement } from "../session/elements.ts";
import type { EditorSession } from "../session/session.ts";
import type { EditorUi } from "../ui-state.ts";
import { useEditor } from "../useEditor.ts";
import { useElementSize } from "../useElementSize.ts";
import { useUiState } from "../useUi.ts";
import { AgentBadges } from "../agent/AgentBadges.tsx";
import { markedOn } from "../agent/marks.ts";
import { useImageDrops } from "../gallery/drops.ts";
import { StepChip } from "../panels/steps/StepChip.tsx";
import "./canvas.css";
import { CanvasController, type PointerInfo, type Target } from "./controller.ts";
import { withFollowing } from "./follow.ts";
import { hitAt, itemsOf } from "./geometry.ts";
import { BIG_NUDGE, NUDGE } from "./nudge.ts";
import { pointerOf } from "./pointer.ts";
import { splitMoves } from "./preview-moves.ts";
import { Overlay } from "./Overlay.tsx";
import { TextLayer } from "./TextLayer.tsx";

/**
 * The slide with the elements a gesture is dragging drawn where the pointer has
 * taken them. `applied` are the ones to change in the slide; `all` (default the
 * same) are every box the drag gives, for the connectors that follow them.
 * Untouched elements stay the same objects, so they are not drawn again.
 */
export function withOverrides(slide: Slide, applied: ReadonlyMap<string, Placement>, theme?: Theme, all: ReadonlyMap<string, Placement> = applied): Slide {
  if (all.size === 0) return slide;
  const moved: Slide =
    applied.size === 0
      ? slide
      : {
          ...slide,
          elements: slide.elements.map((element): Element => {
            const box = applied.get(element.id);
            return box ? ({ ...element, ...box } as Element) : element;
          }),
        };
  // Connectors stay attached to what is being dragged.
  return theme ? withFollowing(moved, theme, all) : moved;
}

const NO_BOXES: ReadonlyMap<string, { x: number; y: number; w: number; h: number }> = new Map();
const PADDING = 48;

const targetOf = (element: EventTarget | null): Target => {
  if (!(element instanceof Element)) return { kind: "surface" };
  const handle = element.closest<HTMLElement>("[data-handle]")?.dataset.handle;
  if (handle) return { kind: "handle", handle: handle as never };
  if (element.closest("[data-rotate]")) return { kind: "rotate" };
  const end = element.closest<HTMLElement>("[data-end]")?.dataset.end;
  if (end === "start" || end === "end") return { kind: "end", end };
  // The move handle: of the block whose id it carries, or of the selection when it carries none.
  const move = element.closest<HTMLElement>("[data-move]");
  if (move) return { kind: "move", id: move.dataset.move || null };
  return { kind: "surface" };
};

/** The slide on its stage: drawn by the renderer, with the selection, handles and guides over it, and the text editor when a box is open. */
export function SlideCanvas({ session, ui }: { session: EditorSession; ui: EditorUi }): JSX.Element {
  const state = useEditor(session);
  const view = useUiState(ui);
  const stage = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const size = useElementSize(stage);
  const { w: slideW, h: slideH } = state.deck.size;
  const fit = Math.max(0.05, Math.min((size.w - PADDING) / slideW, (size.h - PADDING) / slideH));
  const zoom = view.zoom === "fit" ? fit : view.zoom;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const drops = useImageDrops(session, page, zoomRef);
  const controller = useMemo(() => new CanvasController(session, ui, () => zoomRef.current), [session, ui]);
  const preview = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [hover, setHover] = useState<string | null>(null);
  // Where the pointer is over the slide, for the keys that add something at it. Written on every move, so it holds no state.
  const track = pointerOf(ui);
  useEffect(
    () =>
      track.attach((clientX, clientY) => {
        const rect = page.current?.getBoundingClientRect();
        if (!rect) return null;
        const x = (clientX - rect.left) / zoomRef.current;
        const y = (clientY - rect.top) / zoomRef.current;
        const { w, h } = session.deck.size;
        return x >= 0 && y >= 0 && x <= w && y <= h ? { x, y } : null;
      }),
    [track, session],
  );

  const slide = session.slide;
  // The step the Steps panel or the step keys show, never past the last one the slide has.
  const previewed = view.previewStep === null ? undefined : Math.min(view.previewStep, slide.steps ?? 0);
  // A step shown belongs to the slide it was picked on.
  useEffect(() => {
    ui.setPreviewStep(null);
  }, [ui, state.slideId]);
  // A plain move is shown by sliding the elements on the page, not by drawing them again.
  const { moves, rest } = useMemo(() => splitMoves(slide, state.deck.theme, preview.overrides), [slide, state.deck.theme, preview.overrides]);
  const shown = useMemo(() => withOverrides(slide, rest, state.deck.theme, preview.overrides), [slide, rest, state.deck.theme, preview.overrides]);
  const scaled = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = scaled.current;
    if (!root || moves.size === 0) return;
    const nodes = new Map<string, HTMLElement>();
    for (const node of root.querySelectorAll<HTMLElement>("[data-el]")) nodes.set(node.dataset.el ?? "", node);
    // A box being edited is drawn by the text editor over the slide, not by the slide: it goes with its shape.
    const editor = root.querySelector<HTMLElement>("[data-editing]");
    const touched: HTMLElement[] = [];
    for (const [id, { dx, dy }] of moves) {
      for (const node of [nodes.get(id), editor?.dataset.editing === id ? editor : undefined]) {
        if (!node) continue;
        node.style.translate = `${dx}px ${dy}px`;
        node.style.willChange = "translate";
        touched.push(node);
      }
    }
    return () => {
      for (const node of touched) {
        node.style.translate = "";
        node.style.willChange = "";
      }
    };
  }, [moves]);
  const index = state.deck.slides.findIndex((s) => s.id === slide.id);
  const imageUrl = useCallback((path: string) => session.host.imageUrl(path), [session]);

  // When a text box closes, its editor takes the focus with it; the keys go back to the slide, unless the person has moved on to another control.
  const wasEditing = useRef(false);
  useEffect(() => {
    if (wasEditing.current && state.editing === null && (document.activeElement === null || document.activeElement === document.body)) {
      stage.current?.focus({ preventScroll: true });
    }
    wasEditing.current = state.editing !== null;
  }, [state.editing]);

  // A fixed zoom is what the person asked for; "fit" is only what fits, so the toolbar can say what it is.
  useEffect(() => {
    ui.setFitZoom(fit);
  }, [ui, fit]);

  const toInfo = (event: PointerEvent): PointerInfo => {
    const rect = page.current?.getBoundingClientRect();
    const z = zoomRef.current;
    return {
      x: rect ? (event.clientX - rect.left) / z : 0,
      y: rect ? (event.clientY - rect.top) / z : 0,
      shift: event.shiftKey,
      alt: event.altKey,
      mod: event.ctrlKey || event.metaKey,
      button: event.button,
      detail: event.detail,
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // A press inside the text being edited belongs to the text: the caret, a drag, a double and a triple click are the editor's.
    // The slide must neither take the focus (which ends the edit) nor start a gesture of its own.
    if (state.editing !== null && event.target instanceof HTMLElement && event.target.closest(".ks-text-layer")) return;
    // A press on a move handle starts a move. The handle is not text, so the box being edited keeps the focus, its caret and its
    // edit; the handle of another block is a press elsewhere, which ends the edit like one.
    const grab = targetOf(event.target);
    if (grab.kind === "move") {
      if (event.button !== 0) return;
      if (state.editing === null || (grab.id !== null && grab.id !== state.editing)) stage.current?.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
      controller.down(toInfo(event), grab);
      return;
    }
    stage.current?.focus({ preventScroll: true });
    if (event.button !== 0 || state.editing !== null) {
      // Anywhere else a press ends the edit.
      if (state.editing !== null) session.stopEditing();
      if (state.editing !== null) return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    controller.down(toInfo(event), targetOf(event.target));
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    track.moved(event.clientX, event.clientY);
    if (controller.busy) return controller.move(toInfo(event));
    const at = toInfo(event);
    // On the way from a block to its lighter move handle, which stands out beyond its corner, the pointer is over the handle: the block stays hovered.
    const onHandle = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-move]")?.dataset.move : undefined;
    setHover(session.state.tool !== "select" ? null : onHandle || hitAt(itemsOf(session), at, zoomRef.current));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    controller.up(toInfo(event));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const editing = state.editing !== null;
    if (event.key === "Escape") {
      // Each step cancels one thing and says it took the key. When there is nothing left to cancel the key goes on, and in full screen
      // it is what leaves it (full-screen.ts).
      const took = (cancel: () => void): void => {
        cancel();
        event.preventDefault();
      };
      if (controller.cancel()) return event.preventDefault();
      if (editing) return took(() => session.stopEditing());
      if (view.previewStep !== null) return took(() => ui.setPreviewStep(null));
      if (state.tool !== "select") return took(() => session.setTool("select"));
      if (state.selection.length > 0) return took(() => session.select([]));
      return;
    }
    if (editing) {
      dispatchKey(event.nativeEvent, { session, ui }, "text");
      return;
    }
    if (dispatchKey(event.nativeEvent, { session, ui }, "stage")) return;
    const step = event.shiftKey ? BIG_NUDGE : NUDGE;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const arrow = arrows[event.key];
    if (arrow && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (state.selection.length > 0) session.elements.nudge(arrow[0], arrow[1]);
      else session.goBy(arrow[0] + arrow[1] > 0 ? 1 : -1);
    } else if (event.key === "Enter" && state.selection.length === 1) {
      event.preventDefault();
      const only = session.slide.elements.find((e) => e.id === state.selection[0]);
      if (only && (only.type === "text" || only.type === "shape")) session.startEditing(only.id);
    } else if (event.key === "Tab") {
      event.preventDefault();
      const order = session.slide.elements.filter((e) => !e.locked).map((e) => e.id);
      const next = cycle(order, state.selection[0] ?? null, event.shiftKey);
      if (next) session.select([next]);
    }
  };

  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    ui.stepZoom(event.deltaY < 0 ? 1 : -1, zoomRef.current);
  };

  const selected = controller.selectedItems().map((item) => {
    const box = preview.overrides.get(item.id);
    const element = slide.elements.find((e) => e.id === item.id) as Element;
    return { item: box ? { ...item, ...box } : item, element };
  });
  const group = selected.length > 1 ? boundsOfAll(selected.map((s) => s.item)) : null;
  // Where an assistant's work is badged: on its element, wherever a drag has taken it.
  const badgeBoxes = markedOn(slide) === 0 ? NO_BOXES : new Map(itemsOf(session).map((item) => [item.id, { ...item, ...preview.overrides.get(item.id) }]));
  const hovered = hover && state.tool === "select" ? (itemsOf(session).find((i) => i.id === hover) ?? null) : null;

  return (
    <div ref={stage} className="ks-stage" tabIndex={0} role="application" aria-label="Slide" onKeyDown={onKeyDown} onWheel={onWheel}>
      <div className="ks-page-wrap">
        <div
          ref={page}
          className="ks-page"
          data-tool={state.tool}
          style={{ width: slideW * zoom, height: slideH * zoom, cursor: state.tool !== "select" ? "crosshair" : preview.gesture === "grab" ? "grabbing" : undefined }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          {...drops}
          onPointerCancel={() => controller.cancel()}
          onPointerLeave={() => {
            track.left();
            setHover(null);
          }}
          onDoubleClick={(event) => controller.doubleClick({ ...toInfo(event as never), detail: 2 })}
          onContextMenu={(event) => {
            event.preventDefault();
            if (controller.busy) return;
            const at = toInfo(event as never);
            // On a move handle it is the block's (or the selection's) menu.
            const onHandle = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-move]") : null;
            const id = onHandle ? onHandle.dataset.move || (session.state.selection[0] ?? null) : hitAt(itemsOf(session), at, zoomRef.current);
            // A right click on an element that is not selected selects it first, as in every editor.
            if (id !== null && !session.state.selection.includes(id)) session.select([id]);
            if (id === null) session.select([]);
            ui.openContextMenu({ kind: id === null ? "canvas" : "element", x: event.clientX, y: event.clientY });
          }}
        >
          <div ref={scaled} className="ks-page-scale" style={{ width: slideW, height: slideH, transform: `scale(${zoom})` }}>
            <SlideView deck={state.deck} slide={shown} number={index + 1} count={state.deck.slides.length} mode="edit" step={previewed} imageUrl={imageUrl} hideTextOf={state.editing} />
            {state.editing ? <TextLayer session={session} ui={ui} id={state.editing} /> : null}
          </div>
          <Overlay zoom={zoom} selected={selected} group={group} hovered={hovered} preview={preview} active={state.tool === "select"} />
          <AgentBadges slide={slide} boxes={badgeBoxes} zoom={zoom} />
          {previewed !== undefined ? <StepChip step={previewed} steps={slide.steps ?? 0} /> : null}
        </div>
      </div>
    </div>
  );
}

function boundsOfAll(items: readonly { x: number; y: number; w: number; h: number; rotation?: number }[]) {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const item of items) {
    const turn = ((item.rotation ?? 0) * Math.PI) / 180;
    const cx = item.x + item.w / 2;
    const cy = item.y + item.h / 2;
    const hw = (Math.abs(Math.cos(turn)) * item.w + Math.abs(Math.sin(turn)) * item.h) / 2;
    const hh = (Math.abs(Math.sin(turn)) * item.w + Math.abs(Math.cos(turn)) * item.h) / 2;
    left = Math.min(left, cx - hw);
    right = Math.max(right, cx + hw);
    top = Math.min(top, cy - hh);
    bottom = Math.max(bottom, cy + hh);
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}
