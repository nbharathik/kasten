import { type DragEvent, type JSX, useRef } from "react";

import type { HostImage, SlidesHost } from "../host.ts";
import { Icon } from "../ui/Icon.tsx";
import { startImageDrag } from "./drag.ts";
import { fromAgent, fromPaper } from "./model.ts";
import { useThumb } from "./useThumb.ts";

/** One image in the grid: its small copy and its name. It can be dragged onto the slide. */
export function Tile({
  host,
  image,
  id,
  selected,
  onPick,
  onAdd,
}: {
  host: SlidesHost;
  image: HostImage;
  id: string;
  selected: boolean;
  onPick(): void;
  onAdd(): void;
}): JSX.Element {
  const url = useThumb(host, image.path, 256);
  const picture = useRef<HTMLSpanElement>(null);
  // The name a screen reader gives the tile starts with the name it shows (what a person says to voice control), then what the picture is.
  const caption = image.caption?.split("\n")[0]?.trim();
  const label = caption ? `${image.name}, ${caption}` : image.name;
  const badge = fromPaper(image) ? ("book-open" as const) : fromAgent(image) ? ("bot" as const) : null;
  return (
    <div
      role="option"
      id={id}
      aria-selected={selected}
      aria-label={label}
      className={`ks-gal-tile${selected ? " is-selected" : ""}`}
      title={image.path}
      draggable
      data-path={image.path}
      onClick={onPick}
      onDoubleClick={onAdd}
      onDragStart={(event: DragEvent<HTMLDivElement>) => {
        onPick();
        startImageDrag(event, image, picture.current);
      }}
    >
      <span ref={picture} className="ks-gal-thumb" aria-hidden="true">
        {url ? <img src={url} alt="" draggable={false} decoding="async" loading="lazy" /> : null}
      </span>
      <span className="ks-gal-name" aria-hidden="true">
        {image.name}
      </span>
      {badge ? (
        <span className="ks-gal-badge" aria-hidden="true">
          <Icon name={badge} size={12} />
        </span>
      ) : null}
    </div>
  );
}
