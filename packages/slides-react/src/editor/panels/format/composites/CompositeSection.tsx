import { type ReactNode, useRef } from "react";

import { useFieldFocus } from "../../../field-focus.ts";
import type { EditorUi } from "../../../ui-state.ts";
import { PanelSection } from "../PanelSection.tsx";
import "./composites.css";

interface CompositeSectionProps {
  /** Names the section, for its folded state and the tests: `code`, `formula` ... */
  id: string;
  title: string;
  ui: EditorUi;
  /** The elements it is for: a double click on one of them comes here. */
  ids: readonly string[];
  children: ReactNode;
}

/**
 * A section of the format options for a kind of composite. It is a section like
 * any other, and answers the double click on its element: it opens if it was
 * folded, comes into view, and gives the focus to the field marked `data-primary`.
 */
export function CompositeSection({ id, title, ui, ids, children }: CompositeSectionProps) {
  const root = useRef<HTMLDivElement>(null);
  useFieldFocus(ui, ids, () => {
    const box = root.current;
    if (!box) return;
    // A section the person folded away is opened first; its field is not there to focus until it is drawn.
    box.querySelector<HTMLElement>('.ks-sp-section-toggle[aria-expanded="false"]')?.click();
    requestAnimationFrame(() => {
      box.scrollIntoView?.({ block: "start" });
      const primary = box.querySelector<HTMLElement>("[data-primary]");
      // The mark is on the field, or on the box that holds it.
      const field = primary?.matches("input, textarea, select, button") ? primary : primary?.querySelector<HTMLElement>("input, textarea, select, button");
      field?.focus({ preventScroll: true });
    });
  });
  return (
    <div ref={root} className="ks-cs">
      <PanelSection id={id} title={title}>
        {children}
      </PanelSection>
    </div>
  );
}
