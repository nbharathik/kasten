import type { Deck, Slide } from "@kasten-slides/wasm";
import { type JSX, type MouseEvent, type PointerEvent, memo } from "react";

import type { ImageUrl } from "../../render/index.ts";
import { SlideThumb } from "../filmstrip/SlideThumb.tsx";
import { Icon } from "../ui/Icon.tsx";
import { TILE_W } from "./layout.ts";

/** What a tile does with the pointer. One object for the whole grid, so tiles are not drawn again for it. */
export interface TileHandlers {
  down(event: PointerEvent, id: string): void;
  click(event: MouseEvent, id: string): void;
  open(id: string): void;
  menu(event: MouseEvent, id: string): void;
}

export interface TileProps {
  slide: Slide;
  /** From 0. */
  index: number;
  count: number;
  backup: boolean;
  /** The deck as thumbnails are drawn with it. */
  deck: Deck;
  shown: boolean;
  selected: boolean;
  dragging: boolean;
  /** Draw the slide; otherwise a quiet box, since the tile is far from the window. */
  thumb: boolean;
  imageUrl: ImageUrl;
  domId: string;
  handlers: TileHandlers;
}

/** One slide in the grid: the slide, and its number under it. Its sizes are the stylesheet's, from variables the grid sets once. */
export const Tile = memo(function Tile({ slide, index, count, backup, deck, shown, selected, dragging, thumb, imageUrl, domId, handlers }: TileProps): JSX.Element {
  const classes = ["ks-gv-tile", shown && "is-shown", selected && "is-selected", slide.hidden && "is-skipped", backup && "is-backup", dragging && "is-dragging"];
  return (
    <div
      id={domId}
      role="option"
      aria-selected={selected}
      aria-current={shown ? "true" : undefined}
      aria-label={`Slide ${index + 1}${slide.hidden ? ", skipped when presenting" : ""}${backup ? ", backup" : ""}`}
      className={classes.filter(Boolean).join(" ")}
      data-slide={slide.id}
      onPointerDown={(event) => handlers.down(event, slide.id)}
      onClick={(event) => handlers.click(event, slide.id)}
      onDoubleClick={() => handlers.open(slide.id)}
      onContextMenu={(event) => handlers.menu(event, slide.id)}
    >
      <div className={`ks-gv-frame${thumb ? "" : " is-far"}`}>{thumb ? <SlideThumb deck={deck} slide={slide} number={index + 1} count={count} width={TILE_W} imageUrl={imageUrl} /> : null}</div>
      <div className="ks-gv-label">
        <span className="ks-gv-num">{index + 1}</span>
        {backup ? <span className="ks-gv-flag is-word">Backup</span> : null}
        {slide.hidden ? (
          <span className="ks-gv-flag" title="Skipped when presenting">
            <Icon name="eye-off" size={14} />
          </span>
        ) : null}
      </div>
    </div>
  );
});
