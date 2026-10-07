import type { Issue, Severity } from "@kasten-slides/wasm";
import type { JSX } from "react";

import { Icon } from "../ui/Icon.tsx";
import type { LintService } from "./service.ts";
import { useSlideIssues } from "./use-lint.ts";
import "./lint.css";

/** How many problems the tooltip lists. */
const LISTED = 3;
/** The longest message the tooltip writes out before it cuts it. */
const LONGEST = 120;

export const SEVERITY_LABEL: Readonly<Record<Severity, string>> = { error: "Error", warning: "Warning", info: "Info" };

const short = (text: string): string => (text.length > LONGEST ? `${text.slice(0, LONGEST - 1).trimEnd()}…` : text);

/** What the badge says when pointed at: how many problems, the first three, and how many are left. */
export function badgeTitle(issues: readonly Issue[]): string {
  const lines = [`${issues.length} ${issues.length === 1 ? "problem" : "problems"} on this slide`];
  for (const issue of issues.slice(0, LISTED)) lines.push(`${SEVERITY_LABEL[issue.severity]}: ${short(issue.message)}`);
  if (issues.length > LISTED) lines.push(`and ${issues.length - LISTED} more`);
  return lines.join("\n");
}

/**
 * The mark on a slide in the filmstrip that has problems: how many, in the colour of
 * the worst. Only errors and warnings show; what is merely worth a look (info) is in the Lint dialog.
 */
export function LintBadge({ lint, slideId }: { lint: LintService; slideId: string }): JSX.Element | null {
  const found = useSlideIssues(lint, slideId);
  const issues = found.filter((issue) => issue.severity !== "info");
  if (issues.length === 0) return null;
  const worst = issues.some((issue) => issue.severity === "error") ? "error" : "warning";
  const title = badgeTitle(issues);
  return (
    <span className={`ks-lint-badge is-${worst}`} title={title} role="img" aria-label={title.replaceAll("\n", ". ")}>
      <Icon name={worst === "error" ? "circle-x" : "triangle-alert"} size={12} />
      <span className="ks-lint-count" aria-hidden="true">
        {issues.length}
      </span>
    </span>
  );
}
