// A page's files: what is pasted or dropped into it is kept in the vault's
// assets/ folder by the core and linked relative to the page; the pictures
// it links to are shown through the asset protocol.

import { keepFile, relativeLink, resolveLink } from "../../../lib/vault/assets";
import { fileUrl } from "../../../lib/vault/file-url";
import type { VaultClient } from "../../../lib/vault/types";
import type { FileProvider } from "../../pages/editor/files";
import { useWorkspace } from "../store";

/** Files for the page at `notePath()`, read each time: a rename moves it. */
export function pageFiles(client: VaultClient, notePath: () => string, now: () => Date = () => new Date()): FileProvider {
  return {
    async save(file) {
      try {
        const path = await keepFile(client, file, now());
        return relativeLink(notePath(), path);
      } catch (err) {
        useWorkspace.getState().toast(err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
    url(src) {
      const path = resolveLink(notePath(), src);
      return (path && fileUrl(path)) || src;
    },
  };
}
