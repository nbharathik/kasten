// Where the editor keeps the files pasted or dropped into a page, and where
// it shows the pictures a page links to. The page view provides it; the
// editor alone (and its tests) keeps no files.

import type { Ctx } from "@milkdown/kit/ctx";
import { $ctx } from "@milkdown/kit/utils";

export interface FileProvider {
  /** Keeps `file` with the vault and resolves to the link to write into
   * the page, relative to it. Rejects, having said why, when it cannot. */
  save(file: File): Promise<string>;
  /** The URL the window loads the picture at `src`, a link as the page has
   * it, from. */
  url(src: string): string;
}

export const fileProviderCtx = $ctx<FileProvider | null, "kastenFiles">(null, "kastenFiles");

/** The editor's file provider; null when it keeps no files. */
export function filesOf(ctx: Ctx): FileProvider | null {
  try {
    return ctx.get(fileProviderCtx.key);
  } catch {
    return null;
  }
}
