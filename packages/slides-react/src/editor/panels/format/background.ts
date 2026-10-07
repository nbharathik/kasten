import type { Background, Theme } from "@kasten-slides/wasm";
import type { CSSProperties } from "react";

import { colorOf } from "../../../theme/index.ts";
import { pickFiles, readImage } from "../../files.ts";
import type { EditorSession } from "../../session/session.ts";

/**
 * Asks for a picture, keeps it with the host and resolves to its path; null
 * when none was chosen, or when it could not be kept (the person is told).
 */
export async function chooseImage(session: EditorSession): Promise<string | null> {
  try {
    const [file] = await pickFiles("image/*");
    if (!file) return null;
    const read = await readImage(file);
    return await session.host.addImage(read.name, read.bytes);
  } catch (thrown) {
    session.host.notify?.(thrown instanceof Error && thrown.message !== "" ? `The picture could not be added: ${thrown.message}` : "The picture could not be added.");
    return null;
  }
}

/** A background that is a colour (a theme colour or `#rrggbb`), replacing a picture; null for the theme's own. */
export const colorBackground = (color: string | null): Background | null => (color === null ? null : { color });

/** How a slide's background looks in a little preview: its picture, else its colour, else the theme's paper. */
export function backgroundStyle(session: EditorSession, theme: Theme, background: Background | null | undefined): CSSProperties {
  const url = background?.image ? session.host.imageUrl(background.image) : undefined;
  if (url) return { backgroundColor: colorOf(theme, "bg1"), backgroundImage: `url("${url}")`, backgroundSize: "cover", backgroundPosition: "center" };
  return { backgroundColor: colorOf(theme, background?.color ?? "bg1") };
}
