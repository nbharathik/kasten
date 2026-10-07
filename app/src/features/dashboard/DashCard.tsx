// One section of a dashboard: a titled card with an optional count and
// action, and the grid that lays sections out two to a row (wide ones
// take a row of their own).

import { useLayoutEffect, useRef, type ReactNode } from "react";

import { Icon, type IconName } from "../../ui/Icon";
import { alone } from "./sections";

interface DashCardProps {
  title: string;
  icon: IconName;
  count?: number | string;
  /** Buttons at the right of the title. */
  actions?: ReactNode;
  children: ReactNode;
  /** A card with no frame, for a section that is one field. */
  plain?: boolean;
}

export function DashCard({ title, icon, count, actions, children, plain = false }: DashCardProps) {
  return (
    <section className={`kasten-dash-card${plain ? " is-plain" : ""}`} aria-label={title}>
      <header className="kasten-dash-head">
        <Icon name={icon} className="size-[15px] text-faint" />
        <h3>{title}</h3>
        {count !== undefined && count !== 0 && <span className="kasten-dash-count">{count}</span>}
        <span className="flex-1" />
        {actions}
      </header>
      {children}
    </section>
  );
}

/** Sections in their order; `wide` ones take a whole row, and so does one
 * that would sit alone beside a hole. Sections fill in as their data
 * loads, so the grid looks again whenever one does. */
export function DashGrid({ items }: { items: { id: string; wide: boolean; node: ReactNode }[] }) {
  const grid = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = grid.current;
    if (!root) return;
    const mark = () => {
      const cells = [...root.children] as HTMLElement[];
      const lonely = alone(cells.map((cell) => ({ wide: cell.classList.contains("is-wide"), shown: cell.childNodes.length > 0 })));
      cells.forEach((cell, i) => cell.toggleAttribute("data-alone", lonely[i]));
    };
    mark();
    const watch = new MutationObserver(mark);
    for (const cell of root.children) watch.observe(cell, { childList: true });
    return () => watch.disconnect();
  }, [items]);
  return (
    <div ref={grid} className="kasten-dash-grid">
      {items.map((item) => (
        <div key={item.id} className={`kasten-dash-cell${item.wide ? " is-wide" : ""}`} data-section={item.id}>
          {item.node}
        </div>
      ))}
    </div>
  );
}

/** A line saying a section has nothing yet, with what would fill it. */
export function DashEmpty({ children }: { children: ReactNode }) {
  return <p className="kasten-dash-empty">{children}</p>;
}

/** "Show all 14" / "Show fewer" under a list cut short. */
export function MoreToggle({ total, shown, open, onToggle }: { total: number; shown: number; open: boolean; onToggle(): void }) {
  if (total <= shown && !open) return null;
  return (
    <button type="button" className="kasten-dash-more" onClick={onToggle}>
      {open ? "Show fewer" : `Show all ${total}`}
    </button>
  );
}
