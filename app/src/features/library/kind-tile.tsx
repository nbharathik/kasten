// Each kind of note has a colour from the highlight palette. In
// the Card Library a note's icon sits on a tile of it, so cards, pages,
// projects and journal days tell apart at a glance, in light and dark.

import type { NoteKind } from "../../lib/vault/types";
import { IconOrEmoji } from "../../ui/IconOrEmoji";

export const KIND_COLORS: Record<NoteKind, string> = { card: "yellow", page: "blue", project: "purple", journal: "green", highlight: "orange", chat: "pink" };

/** A kind's highlight colour; gray for a kind the app does not know. */
export const kindColor = (kind: string): string => KIND_COLORS[kind as NoteKind] ?? "gray";

/** A note's icon on a tile of its kind's colour. */
export function KindTile({ kind, icon, small = false }: { kind: string; icon: string; small?: boolean }) {
  const color = kindColor(kind);
  return (
    <span
      aria-hidden="true"
      data-kind-color={color}
      className={`grid shrink-0 place-items-center text-ink/80 ${small ? "size-[22px] rounded-[5px] text-13" : "size-[26px] rounded-md text-14"}`}
      style={{ background: `var(--color-highlight-${color})` }}
    >
      <IconOrEmoji icon={icon} />
    </span>
  );
}
