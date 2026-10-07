import { type JSX, type KeyboardEvent, type RefObject, type WheelEvent, useLayoutEffect, useRef, useState } from "react";

import type { EditorSession } from "../session/session.ts";
import type { EditorUi } from "../ui-state.ts";
import { Divider } from "../ui/Button.tsx";
import { useEditor } from "../useEditor.ts";
import { useElementSize } from "../useElementSize.ts";
import { HistoryTools, ZoomTool } from "./HistoryTools.tsx";
import { InsertTools } from "./InsertTools.tsx";
import { usePaintBrush } from "./paint.ts";
import { ShapeTools, hasShapeTools } from "./ShapeTools.tsx";
import { SlideTools } from "./SlideTools.tsx";
import { TextTools } from "./TextTools.tsx";
import { TipView, useTips } from "./Tips.tsx";
import "./toolbar.css";

/** Buttons and fields the arrow keys can go between: the ones in the bar itself, not in a menu opened from it. */
function stops(bar: HTMLElement): HTMLElement[] {
  return [...bar.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)")].filter((el) => !el.closest(".ks-popover"));
}

/**
 * Whether the buttons at the right have to go without their words: when the
 * row with all the words is wider than the window. The width the words need is
 * learned whenever they are shown, and they come back once the window is that wide.
 */
function useCompact(bar: RefObject<HTMLDivElement | null>, width: number, shapes: boolean): boolean {
  const [compact, setCompact] = useState(false);
  const needs = useRef(0);
  useLayoutEffect(() => {
    const element = bar.current;
    if (!element || width === 0) return;
    if (!compact) {
      needs.current = element.scrollWidth;
      if (element.scrollWidth > element.clientWidth + 1) setCompact(true);
    } else if (needs.current > 0 && element.clientWidth >= needs.current) setCompact(false);
  }, [bar, width, shapes, compact]);
  return compact;
}

/**
 * The row of tools under the menus: history, paint format, zoom, what to put
 * on the slide, the text controls, the shape controls (only when the selection
 * has a shape, line or text box), and the slide's own at the far right. It is
 * one row, 40 px high, and scrolls sideways when the window is narrow. Nothing
 * in it takes the focus from a text box that is being edited.
 */
export function Toolbar({ session, ui }: { session: EditorSession; ui: EditorUi }): JSX.Element {
  useEditor(session);
  const bar = useRef<HTMLDivElement>(null);
  const { w } = useElementSize(bar);
  const { tip, handlers } = useTips();
  usePaintBrush(session, ui);
  const compact = useCompact(bar, w, hasShapeTools(session));

  // A wheel that only turns up and down scrolls the row sideways.
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    const element = bar.current;
    if (!element || event.deltaX !== 0 || element.scrollWidth <= element.clientWidth) return;
    if (event.target instanceof Element && event.target.closest(".ks-popover")) return;
    element.scrollLeft += event.deltaY;
  };

  // Left and Right go from button to button.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    handlers.onKeyDown();
    const element = bar.current;
    const target = event.target;
    if (!element || !(target instanceof HTMLElement) || target.closest(".ks-popover") || target instanceof HTMLInputElement) return;
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    const all = stops(element);
    const to = all[all.indexOf(target) + step];
    if (!to) return;
    event.preventDefault();
    to.focus();
  };

  return (
    <div
      ref={bar}
      className={`ks-toolbar${compact ? " is-compact" : ""}`}
      role="toolbar"
      aria-label="Toolbar"
      onWheel={onWheel}
      onKeyDown={onKeyDown}
      onMouseOver={handlers.onMouseOver}
      onMouseLeave={handlers.onMouseLeave}
      onMouseDown={handlers.onMouseDown}
      onFocus={handlers.onFocus}
      onBlur={handlers.onBlur}
    >
      <HistoryTools session={session} ui={ui} />
      <Divider />
      <ZoomTool session={session} ui={ui} />
      <Divider />
      <InsertTools session={session} ui={ui} />
      <Divider />
      <TextTools session={session} ui={ui} />
      <ShapeTools session={session} ui={ui} />
      <span className="ks-tb-spacer" />
      <Divider />
      <SlideTools session={session} ui={ui} />
      {tip ? <TipView tip={tip} /> : null}
    </div>
  );
}
