// Small pieces the review queue and the history view share: badges,
// callouts, buttons and an in-place confirmation (browser dialogs differ
// between webviews, and a question in place keeps its context).

import type { CSSProperties, KeyboardEvent, ReactNode } from "react";

import { Icon, type IconName } from "../../ui/Icon";
import { clientHue } from "./words";

export const BUTTON = "ui-btn";
export const PRIMARY = "ui-btn is-primary";
export const QUIET = "ui-btn is-quiet";

/** An agent client, such as `claude-code`, as a badge in its own colour. */
export function ClientBadge({ client }: { client: string }) {
  return (
    <span
      className="kr-client inline-flex max-w-[16rem] shrink-0 items-center gap-1 rounded px-1.5 text-12 font-medium leading-5"
      style={{ "--kr-hue": clientHue(client) } as CSSProperties}
      title={`Agent: ${client}`}
    >
      <Icon name="agent" className="size-3" />
      <span className="truncate">{client}</span>
    </span>
  );
}

const PILLS = {
  plain: "bg-line/70 text-muted",
  ok: "bg-(--kr-ok-bg) text-(--kr-ok-ink)",
  warn: "bg-(--kr-warn-bg) text-(--kr-warn-ink)",
} as const;

export function Pill({ tone = "plain", title, children }: { tone?: keyof typeof PILLS; title?: string; children: ReactNode }) {
  return (
    <span title={title} className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 text-12 font-medium leading-5 ${PILLS[tone]}`}>
      {children}
    </span>
  );
}

const CALLOUTS = {
  warn: "border-(--kr-warn-line) bg-(--kr-warn-bg) text-(--kr-warn-ink)",
  bad: "border-(--kr-bad-line) bg-(--kr-bad-bg) text-(--kr-bad-ink)",
  ok: "border-(--kr-ok-line) bg-(--kr-ok-bg) text-(--kr-ok-ink)",
} as const;

export function Callout({ tone, icon, role, children }: { tone: keyof typeof CALLOUTS; icon?: IconName; role?: "alert" | "status"; children: ReactNode }) {
  return (
    <div role={role} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-13 leading-snug ${CALLOUTS[tone]}`}>
      {icon && <Icon name={icon} className="mt-px size-4" />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** A key hint beside a button's label; buttons name their key with `aria-keyshortcuts`. */
export function Kbd({ children, onAccent = false }: { children: ReactNode; onAccent?: boolean }) {
  return (
    <kbd aria-hidden="true" className={`rounded px-1 font-sans text-11 leading-4 ${onAccent ? "bg-on-accent/20 text-on-accent" : "bg-line/80 text-muted"}`}>
      {children}
    </kbd>
  );
}

interface ConfirmProps {
  title: string;
  detail?: ReactNode;
  confirm: string;
  onConfirm(): void;
  onCancel(): void;
}

/** A yes-or-no question in place. Escape says no. */
export function ConfirmBar({ title, detail, confirm, onConfirm, onCancel }: ConfirmProps) {
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    onCancel();
  };
  return (
    <div role="alertdialog" aria-label={title} onKeyDown={onKey} className="rounded-lg border border-line bg-panel px-3.5 py-3 shadow-(--kr-shadow)">
      <p className="text-13 font-medium">{title}</p>
      {detail && <div className="mt-1 text-13 leading-snug text-muted">{detail}</div>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={BUTTON}>
          Cancel
        </button>
        <button type="button" autoFocus onClick={onConfirm} className={PRIMARY}>
          {confirm}
        </button>
      </div>
    </div>
  );
}

/** A few choices in one control, such as the diff layout or the tabs' sibling filters. */
/** A calm empty state: an icon, a line and a hint. */
export function Empty({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-panel text-muted" aria-hidden="true">
        <Icon name={icon} className="size-6" />
      </span>
      <h2 className="mt-4 text-16 font-semibold">{title}</h2>
      {children && <div className="mt-1.5 max-w-md text-13 leading-relaxed text-muted">{children}</div>}
    </div>
  );
}
