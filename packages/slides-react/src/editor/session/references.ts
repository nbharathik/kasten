// The bibliography a session follows: the host's `.bib` text, given to the page once the session
// opens and again whenever the host says it changed, so citations are drawn and lint checks keys
// against what is there now.

import { setReferences } from "@kasten-slides/wasm";

import type { SlidesHost } from "../host.ts";

/**
 * Gives the page the host's bibliography now and after each change the host reports. Returns how to stop following.
 * An answer that arrives after a newer question was asked is dropped, so a slow read never puts back an older text.
 * A host that cannot read it leaves what the page has.
 */
export function followReferences(host: SlidesHost, onError?: (message: string) => void): () => void {
  if (!host.references) return () => {};
  let stopped = false;
  let asked = 0;
  const load = (): void => {
    const mine = ++asked;
    host
      .references?.()
      .then((text) => {
        if (!stopped && mine === asked) setReferences(text);
      })
      .catch((error: unknown) => {
        if (!stopped && mine === asked) onError?.(`The references could not be read: ${error instanceof Error ? error.message : String(error)}`);
      });
  };
  load();
  const stopWatching = host.watchReferences?.(load);
  return () => {
    stopped = true;
    stopWatching?.();
  };
}
