import type { Theme } from "@kasten-slides/wasm";

import type { Patch } from "../session/elements.ts";
import type { EditorSession } from "../session/session.ts";

/** The id slides-core gives the deck's logo among the theme's master elements. */
const LOGO_ID = "master-logo";

/** A change to the deck's own theme (a merge patch), as one step of undo. */
export function editTheme(session: EditorSession, patch: Patch): void {
  session.run(() => session.core.apply("edit_theme", { patch }));
}

/** The picture of the deck's logo, if it has one. */
export function logoOf(theme: Theme): string | null {
  const logo = theme.master?.find((element) => element.id === LOGO_ID && element.type === "image");
  return logo?.type === "image" && logo.src !== "" ? logo.src : null;
}

/** Sets the logo; an empty path takes it away. Only ever asked to take away a logo that is there, since asking otherwise would add an empty one. */
export function setLogo(session: EditorSession, src: string): void {
  session.run(() => session.core.apply("set_logo", { src }));
}
