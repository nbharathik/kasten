import type { Deck, Slide } from "@kasten-slides/wasm";
import { type JSX, type MouseEvent, type PointerEvent, memo, useState } from "react";

import type { ImageUrl } from "../../render/index.ts";
import { SlideMark } from "../agent/SlideMark.tsx";
import { sectionField, useFieldFocus } from "../field-focus.ts";
import { LintBadge } from "../lint/LintBadge.tsx";
import type { LintService } from "../lint/service.ts";
import { Icon } from "../ui/Icon.tsx";
import type { EditorUi } from "../ui-state.ts";
import { BACKUP_W, THUMB_W } from "./model.ts";
import { SectionName } from "./SectionName.tsx";
import { SlideThumb } from "./SlideThumb.tsx";

/** What a row does with the pointer. One object for the whole list, so rows are not drawn again for it. */
export interface RowHandlers {
  down(event: PointerEvent, id: string): void;
  click(event: MouseEvent, id: string): void;
  menu(event: MouseEvent, id: string): void;
}

export interface SlideRowProps {
  slide: Slide;
  /** From 0. */
  index: number;
  count: number;
  /** Stacked under the slide above it. */
  backup: boolean;
  /** The deck as thumbnails are drawn with it. */
  deck: Deck;
  shown: boolean;
  selected: boolean;
  dragging: boolean;
  /** Draw the slide; otherwise a quiet box, since the row is far from the window. */
  thumb: boolean;
  imageUrl: ImageUrl;
  domId: string;
  handlers: RowHandlers;
  /** What lint found, for the badge on the slide; none while the badges are off. */
  lint: LintService | null;
}

const words = (index: number, slide: Slide, backup: boolean): string =>
  `Slide ${index + 1}${slide.hidden ? ", skipped when presenting" : ""}${backup ? ", backup" : ""}`;

/**
 * One slide in the filmstrip: its number and its thumbnail. The sizes are the
 * stylesheet's, from variables the list sets once, so a row costs little to
 * make; a row far from the window has no thumbnail, only its empty frame.
 */
export const SlideRow = memo(function SlideRow({ slide, index, count, backup, deck, shown, selected, dragging, thumb, imageUrl, domId, handlers, lint }: SlideRowProps): JSX.Element {
  const frame = (
    <div className={`ks-fs-frame${thumb ? "" : " is-far"}`}>
      {thumb ? <SlideThumb deck={deck} slide={slide} number={index + 1} count={count} width={backup ? BACKUP_W : THUMB_W} imageUrl={imageUrl} /> : null}
      {backup ? <span className="ks-fs-tag">Backup</span> : null}
      {lint ? <LintBadge lint={lint} slideId={slide.id} /> : null}
      <SlideMark slide={slide} />
      {slide.hidden ? (
        <span className="ks-fs-skipped" title="Skipped when presenting">
          <Icon name="eye-off" size={12} />
        </span>
      ) : null}
    </div>
  );
  return (
    <div
      id={domId}
      role="option"
      aria-selected={selected}
      aria-current={shown ? "true" : undefined}
      aria-label={words(index, slide, backup)}
      className={`ks-fs-row${shown ? " is-shown" : ""}${selected ? " is-selected" : ""}${slide.hidden ? " is-skipped" : ""}${backup ? " is-backup" : ""}${dragging ? " is-dragging" : ""}`}
      data-slide={slide.id}
      onPointerDown={(event) => handlers.down(event, slide.id)}
      onClick={(event) => handlers.click(event, slide.id)}
      onContextMenu={(event) => handlers.menu(event, slide.id)}
    >
      <span className="ks-fs-num" aria-hidden="true">
        {index + 1}
      </span>
      {backup ? (
        <div className="ks-fs-slot">
          <span className="ks-fs-stack" />
          {frame}
        </div>
      ) : (
        frame
      )}
    </div>
  );
});

export interface SectionHeaderProps {
  title: string;
  count: number;
  collapsed: boolean;
  /** Which section, for the handler. */
  name: string;
  toggle(name: string): void;
  /** Where a request to change the name of the section comes from. */
  ui: EditorUi;
  /** Gives the section another name. */
  rename(name: string, title: string): void;
  /** A right click on the header, which is the menu of the slide the section starts at. */
  menu(event: MouseEvent, name: string): void;
}

/**
 * The title over the slides of a section. It folds the section away, and shows how many slides are in it while it is folded.
 * Its name can be changed in place: the menu asks for that, and the box takes the place of the header until it is done.
 */
export const SectionHeader = memo(function SectionHeader({ title, count, collapsed, name, toggle, ui, rename, menu }: SectionHeaderProps): JSX.Element {
  const [renaming, setRenaming] = useState(false);
  useFieldFocus(ui, [sectionField(name)], () => setRenaming(true));
  if (renaming) {
    return (
      <SectionName
        title={title}
        done={(value) => {
          setRenaming(false);
          if (value !== null) rename(name, value);
        }}
      />
    );
  }
  return (
    <div className="ks-fs-section" role="presentation" onContextMenu={(event) => menu(event, name)}>
      <button
        type="button"
        className="ks-btn ks-fs-fold"
        tabIndex={-1}
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "Expand" : "Collapse"} section ${title}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => toggle(name)}
      >
        <Icon name={collapsed ? "chevron-right" : "chevron-down"} size={14} />
        <span className="ks-fs-section-title">{title}</span>
        {collapsed ? <span className="ks-fs-section-count">{count}</span> : null}
      </button>
    </div>
  );
});
