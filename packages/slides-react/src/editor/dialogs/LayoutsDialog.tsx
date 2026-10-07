import type { JSX } from "react";

import { Wireframe } from "../panels/format/Wireframe.tsx";
import { applyLayout } from "../panels/format/layout.ts";
import { stopAt, walkOptions } from "../panels/format/roving.ts";
import { TextButton } from "../ui/Button.tsx";
import { Dialog } from "../ui/Dialog.tsx";
import { Icon } from "../ui/Icon.tsx";
import { useEditor } from "../useEditor.ts";
import type { DialogProps } from "./types.ts";
import "./dialogs.css";

/** The layouts of the theme, drawn as boxes with their names: pick one for the slide. */
export function LayoutsDialog({ session, onClose }: DialogProps): JSX.Element {
  const { deck, slideId } = useEditor(session);
  const current = deck.slides.find((slide) => slide.id === slideId)?.layout;
  return (
    <Dialog
      title="Layouts"
      width={700}
      onClose={onClose}
      footer={
        <TextButton onClick={onClose}>Close</TextButton>
      }
    >
      <div className="ks-dg-layouts" role="listbox" aria-label="Layouts" onKeyDown={(event) => walkOptions(event, 3)}>
        {deck.theme.layouts.map((layout, i) => {
          const on = layout.name === current;
          return (
            <button
              key={layout.name}
              type="button"
              role="option"
              aria-selected={on}
              tabIndex={stopAt(i, deck.theme.layouts.findIndex((l) => l.name === current))}
              className={`ks-btn ks-dg-layout${on ? " is-on" : ""}`}
              {...(on ? { "data-autofocus": "" } : {})}
              onClick={() => {
                applyLayout(session, layout.name);
                onClose();
              }}
            >
              <span className="ks-dg-thumb">
                <Wireframe layout={layout} size={deck.size} />
                {on ? (
                  <span className="ks-dg-mark" aria-hidden="true">
                    <Icon name="check" size={12} />
                  </span>
                ) : null}
              </span>
              <span className="ks-dg-layout-name">{layout.label}</span>
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
