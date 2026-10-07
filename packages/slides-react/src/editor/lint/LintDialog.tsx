import type { Issue, Severity, Slide } from "@kasten-slides/wasm";
import { type JSX, useEffect, useMemo, useState } from "react";

import { slideTitle } from "../dialogs/slide-title.ts";
import type { DialogProps } from "../dialogs/types.ts";
import { TextButton } from "../ui/Button.tsx";
import { Dialog } from "../ui/Dialog.tsx";
import { Icon, type IconName } from "../ui/Icon.tsx";
import { useEditorValue } from "../useEditor.ts";
import { SEVERITY_LABEL } from "./LintBadge.tsx";
import { lintOf } from "./service.ts";
import { useLintSnapshot } from "./use-lint.ts";
import "./lint.css";

const LEVELS: readonly Severity[] = ["error", "warning", "info"];
const ICONS: Readonly<Record<Severity, IconName>> = { error: "circle-x", warning: "triangle-alert", info: "info" };

interface Group {
  slide: Slide;
  /** From 1. */
  number: number;
  issues: readonly Issue[];
}

/** The problems by slide, in the order of the deck, of the severities that are switched on. */
export function groupIssues(slides: readonly Slide[], issues: ReadonlyMap<string, readonly Issue[]>, shown: ReadonlySet<Severity>): Group[] {
  const groups: Group[] = [];
  slides.forEach((slide, i) => {
    const here = (issues.get(slide.id) ?? []).filter((issue) => shown.has(issue.severity));
    if (here.length > 0) groups.push({ slide, number: i + 1, issues: here });
  });
  return groups;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** Every problem lint found in the deck, by slide. Pressing one goes to the slide and selects the element. */
export function LintDialog({ session, onClose }: DialogProps): JSX.Element {
  const lint = useMemo(() => lintOf(session), [session]);
  const snapshot = useLintSnapshot(lint);
  const slides = useEditorValue(session, (state) => state.deck.slides);
  const [shown, setShown] = useState<ReadonlySet<Severity>>(() => new Set(LEVELS));
  // Opened, the dialog looks again at every slide, so what it lists is the deck as it is.
  const [asked, setAsked] = useState(true);

  const recheck = (): void => {
    setAsked(true);
    void lint.checkAll().then(() => setAsked(false));
  };
  useEffect(() => {
    let open = true;
    void lint.checkAll().then(() => open && setAsked(false));
    return () => {
      open = false;
    };
  }, [lint]);

  const counts = useMemo(() => {
    const total: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
    for (const list of snapshot.issues.values()) for (const issue of list) total[issue.severity] += 1;
    return total;
  }, [snapshot.issues]);
  const all = counts.error + counts.warning + counts.info;
  const groups = useMemo(() => groupIssues(slides, snapshot.issues, shown), [slides, snapshot.issues, shown]);
  const checking = asked || snapshot.checking;
  // What limits this check, said in the footer: rules that could not run, and text sizes that are a guess.
  const notes = [
    snapshot.skipped.length > 0 ? `Not checked: ${snapshot.skipped.map((s) => `${s.rule} (${s.reason.replace(/\.$/, "").toLowerCase()})`).join("; ")}.` : "",
    snapshot.estimated ? "Text sizes are estimated: this page could not load what measures them." : "",
  ].filter(Boolean);

  const toggle = (level: Severity): void =>
    setShown((now) => {
      const next = new Set(now);
      if (!next.delete(level)) next.add(level);
      return next;
    });

  const jump = (slide: Slide, issue?: Issue): void => {
    session.goTo(slide.id);
    if (issue?.element) session.select([issue.element]);
    onClose();
  };

  let body: JSX.Element;
  if (all === 0) {
    body = checking ? <p className="ks-lint-note">Checking the slides…</p> : <p className="ks-lint-empty">No problems found.</p>;
  } else if (groups.length === 0) {
    body = <p className="ks-lint-note">Nothing to show with these filters.</p>;
  } else {
    body = (
      <div className="ks-lint-list">
        {groups.map(({ slide, number, issues }) => (
          <section key={slide.id} className="ks-lint-slide" aria-label={`Slide ${number}`}>
            <button type="button" className="ks-btn ks-lint-slide-head" onClick={() => jump(slide)}>
              <span className="ks-lint-slide-num">Slide {number}</span>
              <span className="ks-lint-slide-title">{slideTitle(slide)}</span>
              <span className="ks-lint-slide-count">{plural(issues.length, "problem", "problems")}</span>
            </button>
            <ul>
              {issues.map((issue, i) => (
                <li key={`${issue.rule}-${issue.element ?? ""}-${i}`}>
                  {/* The words of a problem are text to select and copy, so the row is not a button; going to the problem is the button in it. */}
                  <div className={`ks-lint-issue is-${issue.severity}`}>
                    <span className="ks-lint-sev" aria-label={SEVERITY_LABEL[issue.severity]}>
                      <Icon name={ICONS[issue.severity]} size={14} />
                    </span>
                    <span className="ks-lint-what">
                      <span className="ks-lint-message">{issue.message}</span>
                      {issue.hint ? <span className="ks-lint-hint">{issue.hint}</span> : null}
                    </span>
                    <span className="ks-lint-rule">{issue.rule}</span>
                    <button type="button" className="ks-btn ks-lint-go" aria-label={`Show on slide ${number}: ${issue.message}`} onClick={() => jump(slide, issue)}>
                      Show
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }

  return (
    <Dialog
      title="Lint"
      width={680}
      onClose={onClose}
      footer={
        <>
          {notes.length > 0 ? <p className="ks-lint-skipped">{notes.join(" ")}</p> : null}
          <TextButton onClick={onClose}>Close</TextButton>
        </>
      }
    >
      <div className="ks-lint-bar">
        <div className="ks-lint-filters" role="group" aria-label="Show">
          {LEVELS.map((level) => (
            <button key={level} type="button" className={`ks-btn ks-lint-filter is-${level}`} aria-pressed={shown.has(level)} onClick={() => toggle(level)}>
              <Icon name={ICONS[level]} size={14} />
              <span>{SEVERITY_LABEL[level] === "Info" ? "Info" : `${SEVERITY_LABEL[level]}s`}</span>
              <span className="ks-lint-filter-count">{counts[level]}</span>
            </button>
          ))}
        </div>
        <TextButton onClick={recheck} disabled={checking} data-autofocus="">
          <Icon name="rotate-cw" size={14} /> {checking ? "Checking…" : "Re-check"}
        </TextButton>
      </div>
      {body}
    </Dialog>
  );
}
