import { type ReactNode, createContext, useContext, useId, useState } from "react";

import { Icon } from "../../ui/Icon.tsx";
import "./format.css";

/** Which sections the person folded away. Kept above the sections, so a section that leaves and comes back finds itself as it was. */
export interface Folds {
  closed: ReadonlySet<string>;
  toggle(id: string): void;
}

const FoldsContext = createContext<Folds | null>(null);

/** The state for a group of sections: the ones named start folded away. */
export function useFolds(startClosed: readonly string[] = []): Folds {
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set(startClosed));
  return {
    closed,
    toggle: (id) =>
      setClosed((now) => {
        const next = new Set(now);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
  };
}

export function FoldsProvider({ folds, children }: { folds: Folds; children: ReactNode }) {
  return <FoldsContext value={folds}>{children}</FoldsContext>;
}

interface PanelSectionProps {
  /** Names the section for its folded state. */
  id: string;
  title: string;
  children: ReactNode;
}

/** A group of controls under a title with a chevron: pressing the title folds it away. */
export function PanelSection({ id, title, children }: PanelSectionProps) {
  const folds = useContext(FoldsContext);
  const [alone, setAlone] = useState(true);
  const open = folds ? !folds.closed.has(id) : alone;
  const body = useId();
  return (
    <section className="ks-sp-section" data-section={id}>
      <h3 className="ks-sp-section-title">
        <button
          type="button"
          className="ks-sp-section-toggle"
          aria-expanded={open}
          aria-controls={body}
          onClick={() => (folds ? folds.toggle(id) : setAlone(!open))}
        >
          <span>{title}</span>
          <Icon name={open ? "chevron-up" : "chevron-down"} size={14} />
        </button>
      </h3>
      <div id={body} className="ks-sp-section-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
