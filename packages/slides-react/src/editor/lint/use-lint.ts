import type { Issue } from "@kasten-slides/wasm";
import { useSyncExternalStore } from "react";

import type { LintService, LintSnapshot } from "./service.ts";

/** Everything lint has found, and a re-render when it changes. */
export function useLintSnapshot(lint: LintService): LintSnapshot {
  return useSyncExternalStore(lint.subscribe, lint.getSnapshot, lint.getSnapshot);
}

/** The problems of one slide; the view is drawn again only when that slide's problems change. */
export function useSlideIssues(lint: LintService, slideId: string): readonly Issue[] {
  return useSyncExternalStore(
    lint.subscribe,
    () => lint.issuesOf(slideId),
    () => lint.issuesOf(slideId),
  );
}
