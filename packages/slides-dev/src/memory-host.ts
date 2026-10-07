import { MemoryHost } from "@kasten-slides/react";

import { download } from "./download.ts";

/** A host for the page without a folder: files delivered are downloaded, and saves stay in the browser's memory. */
export function pageHost(): MemoryHost {
  return new MemoryHost(download);
}
