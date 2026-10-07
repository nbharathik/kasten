// Draws a line diff side by side or unified, in monospace: removed lines
// red, added lines green, changed words marked, and long unchanged runs
// folded behind a "Show N unchanged lines" row.

import { useMemo, useState, type ReactNode } from "react";

import { changedSpan, countChanges, foldUnchanged, pairRows, partners, rowChanged, type Cell, type DiffLine, type Piece } from "./diff";
import { count } from "./words";
import { Icon } from "../../ui/Icon";

export type DiffMode = "split" | "unified";

interface DiffViewProps {
  lines: DiffLine[];
  mode: DiffMode;
  /** The table's name for screen readers. */
  label: string;
  /** Unchanged lines kept around each change. */
  context?: number;
  /** Most rows drawn before a "Show all" row, so huge rewrites stay quick. */
  limit?: number;
}

const SIGN = { same: "", del: "−", add: "+" } as const;

export function DiffView({ lines, mode, label, context = 3, limit = 400 }: DiffViewProps) {
  if (!lines.some((l) => l.kind !== "same")) return <p className="px-3 py-2 text-13 text-muted">The text is the same.</p>;
  // Folds open by row index, which differs between the layouts: each keeps its own.
  return mode === "split" ? <Split key="split" lines={lines} label={label} context={context} limit={limit} /> : <Unified key="unified" lines={lines} label={label} context={context} limit={limit} />;
}

type Props = Required<Omit<DiffViewProps, "mode">>;

/** Folds and the "show all" switch, shared by both layouts. */
function useFolds<T>(items: readonly T[], changed: (item: T) => boolean, context: number, limit: number) {
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set());
  const [all, setAll] = useState(false);
  const pieces = useMemo(() => {
    const folded = foldUnchanged(items, changed, context);
    return folded.flatMap((p): Piece<T>[] => ("fold" in p && open.has(p.start) ? items.slice(p.start, p.start + p.count).map((item, k) => ({ item, index: p.start + k })) : [p]));
  }, [items, changed, context, open]);
  const shown = all ? pieces : pieces.slice(0, limit);
  return {
    shown,
    hidden: pieces.length - shown.length,
    openFold: (start: number) => setOpen((s) => new Set(s).add(start)),
    showAll: () => setAll(true),
  };
}

function Split({ lines, label, context, limit }: Props) {
  const rows = useMemo(() => pairRows(lines), [lines]);
  const { shown, hidden, openFold, showAll } = useFolds(rows, rowChanged, context, limit);
  return (
    <table className="kr-diff font-mono" aria-label={label}>
      <colgroup>
        <col className="w-11" />
        <col className="w-5" />
        <col />
        <col className="w-11" />
        <col className="w-5" />
        <col />
      </colgroup>
      <tbody>
        {shown.map((piece) =>
          "fold" in piece ? (
            <FoldRow key={`fold-${piece.start}`} columns={6} onOpen={() => openFold(piece.start)}>
              Show {count(piece.count, "unchanged line")}
            </FoldRow>
          ) : (
            <SplitRow key={piece.index} left={piece.item.left} right={piece.item.right} />
          ),
        )}
        {hidden > 0 && (
          <FoldRow columns={6} onOpen={showAll}>
            Show {count(hidden, "more row")}
          </FoldRow>
        )}
      </tbody>
    </table>
  );
}

function SplitRow({ left, right }: { left: Cell | null; right: Cell | null }) {
  const span = left?.kind === "del" && right?.kind === "add" ? changedSpan(left.text, right.text) : null;
  return (
    <tr>
      <Side cell={left} start={span?.start} end={span?.endA} />
      <Side cell={right} start={span?.start} end={span?.endB} />
    </tr>
  );
}

function Side({ cell, start, end }: { cell: Cell | null; start?: number; end?: number }) {
  if (!cell) {
    return (
      <>
        <td className="kr-num kr-none" />
        <td className="kr-sign kr-none" />
        <td className="kr-none" />
      </>
    );
  }
  const tone = cell.kind === "same" ? "" : `kr-${cell.kind}`;
  return (
    <>
      <td className={`kr-num ${tone}`}>{cell.line}</td>
      <td className={`kr-sign ${tone}`}>{SIGN[cell.kind]}</td>
      <td className={tone}>
        <Marked text={cell.text} start={start} end={end} />
      </td>
    </>
  );
}

const changedLine = (line: DiffLine) => line.kind !== "same";

function Unified({ lines, label, context, limit }: Props) {
  const pair = useMemo(() => partners(lines), [lines]);
  const { shown, hidden, openFold, showAll } = useFolds(lines, changedLine, context, limit);
  return (
    <table className="kr-diff font-mono" aria-label={label}>
      <colgroup>
        <col className="w-11" />
        <col className="w-11" />
        <col className="w-5" />
        <col />
      </colgroup>
      <tbody>
        {shown.map((piece) => {
          if ("fold" in piece) {
            return (
              <FoldRow key={`fold-${piece.start}`} columns={4} onOpen={() => openFold(piece.start)}>
                Show {count(piece.count, "unchanged line")}
              </FoldRow>
            );
          }
          const other = pair[piece.index];
          return <UnifiedRow key={piece.index} line={piece.item} partner={other === null || other === undefined ? null : lines[other]!} />;
        })}
        {hidden > 0 && (
          <FoldRow columns={4} onOpen={showAll}>
            Show {count(hidden, "more line")}
          </FoldRow>
        )}
      </tbody>
    </table>
  );
}

function UnifiedRow({ line, partner }: { line: DiffLine; partner: DiffLine | null }) {
  const tone = line.kind === "same" ? "" : `kr-${line.kind}`;
  const span = partner ? (line.kind === "del" ? changedSpan(line.text, partner.text) : changedSpan(partner.text, line.text)) : null;
  return (
    <tr>
      <td className={`kr-num ${tone}`}>{line.a ?? ""}</td>
      <td className={`kr-num ${tone}`}>{line.b ?? ""}</td>
      <td className={`kr-sign ${tone}`}>{SIGN[line.kind]}</td>
      <td className={tone}>
        <Marked text={line.text} start={span?.start} end={span ? (line.kind === "del" ? span.endA : span.endB) : undefined} />
      </td>
    </tr>
  );
}

/** A line with its changed words marked. */
function Marked({ text, start, end }: { text: string; start?: number; end?: number }) {
  if (start === undefined || end === undefined || end <= start) return <>{text}</>;
  return (
    <>
      {text.slice(0, start)}
      <mark>{text.slice(start, end)}</mark>
      {text.slice(end)}
    </>
  );
}

function FoldRow({ columns, onOpen, children }: { columns: number; onOpen(): void; children: ReactNode }) {
  return (
    <tr className="kr-fold">
      <td colSpan={columns}>
        <button type="button" onClick={onOpen} className="flex w-full items-center gap-2 px-3 py-0.5 text-left font-sans text-12 text-muted transition-colors hover:text-ink">
          <Icon name="more" className="size-3.5" />
          {children}
        </button>
      </td>
    </tr>
  );
}

/** "+12 −3", coloured. */
export function DiffStats({ lines }: { lines: DiffLine[] }) {
  const { added, removed } = countChanges(lines);
  return (
    <span className="shrink-0 font-mono text-12" aria-label={`${count(added, "line")} added, ${count(removed, "line")} removed`}>
      <span className="text-(--kr-add)">+{added}</span> <span className="text-(--kr-del)">−{removed}</span>
    </span>
  );
}
