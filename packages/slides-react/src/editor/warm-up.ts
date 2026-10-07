// The first slide with a code block a person opens has to wait for the engine to load the
// syntax definitions it colours with: a good part of a second on a slow machine. The editor
// gets that out of the way once it has painted and the page is idle, so the wait is never on
// a slide.

import { warmUp } from "@kasten-slides/wasm";
import { useEffect } from "react";

/** How long, in milliseconds, the browser has to find a quiet moment before the work is done anyway. */
const PATIENCE = 3000;
/** Where there is no idle callback, how long after the editor has painted the work is done. */
const LATER = 600;

interface Idle {
  requestIdleCallback?(run: () => void, options: { timeout: number }): number;
  cancelIdleCallback?(id: number): void;
}

let warmed = false;

function run(): void {
  if (warmed) return;
  warmed = true;
  try {
    warmUp();
  } catch {
    // An engine that is not loaded has nothing to get ready, and nothing here is worth a person's attention.
  }
}

/**
 * Asks for the engine's first-use work to be done when the page is idle. It is a callback and not
 * a wait, so it never holds anything up, and it is done once for the page, however often it is asked.
 * Gives what takes the request back.
 */
export function warmUpWhenIdle(): () => void {
  if (warmed) return () => {};
  const idle = globalThis as unknown as Idle;
  if (idle.requestIdleCallback) {
    const id = idle.requestIdleCallback(run, { timeout: PATIENCE });
    return () => idle.cancelIdleCallback?.(id);
  }
  const timer = setTimeout(run, LATER);
  return () => clearTimeout(timer);
}

/** Gets the engine ready when the editor is: after it has painted, once the page is idle. */
export function useWarmUp(ready: boolean): void {
  useEffect(() => (ready ? warmUpWhenIdle() : undefined), [ready]);
}
