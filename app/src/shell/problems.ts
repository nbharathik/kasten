// Problems nothing else caught: an error thrown in an event
// handler, or a promise that failed with no one listening. Each is logged
// and said once in a toast, so a failure is never silent; the window
// carries on. Render errors are the root ViewBoundary's (main.tsx).

import { useWorkspace } from "../features/workspace/store";

/** The same problem is said at most once in this long. */
export const QUIET_MS = 10_000;

/** Browsers report these, but nothing is wrong. */
const HARMLESS = [/ResizeObserver loop/i, /^Script error\.?$/];

/** What went wrong, in words: an Error's message, or the value itself. */
export function describeProblem(reason: unknown): string {
  if (reason instanceof Error) return reason.message || reason.name;
  if (typeof reason === "string") return reason;
  try {
    return JSON.stringify(reason) ?? String(reason);
  } catch {
    return String(reason);
  }
}

/** Starts listening on `target`; returns how to stop. */
export function watchProblems(target: Window = window, now: () => number = Date.now): () => void {
  const said = new Map<string, number>();
  const tell = (reason: unknown) => {
    const text = describeProblem(reason).trim();
    if (!text || HARMLESS.some((pattern) => pattern.test(text))) return;
    console.error("Kasten: a problem nothing else caught:", reason);
    const at = now();
    const last = said.get(text);
    if (last !== undefined && at - last < QUIET_MS) return;
    said.set(text, at);
    if (said.size > 50) said.delete(said.keys().next().value!);
    useWorkspace.getState().toast(`Something went wrong: ${text.length > 160 ? `${text.slice(0, 157)}…` : text}`);
  };
  const onError = (event: ErrorEvent) => tell(event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent) => tell(event.reason);
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}
