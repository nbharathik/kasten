// A titled toggle that keeps details out of the way until asked: backlinks,
// "edited today", who made a page. Whether it is open is remembered per
// `id` in this browser, as a convenience only.

import { useId, useState, type ReactNode } from "react";

import { Icon } from "./Icon";

const KEY = "kasten.disclosure.";

function remembered(id: string | undefined, fallback: boolean): boolean {
  if (!id) return fallback;
  try {
    const value = localStorage.getItem(KEY + id);
    return value === null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}

interface DisclosureProps {
  /** Remembers whether it is open under this name. */
  id?: string;
  title: ReactNode;
  /** Quiet words after the title, such as a count. */
  meta?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}

export function Disclosure({ id, title, meta, defaultOpen = false, className = "", children }: DisclosureProps) {
  const [open, setOpen] = useState(() => remembered(id, defaultOpen));
  const body = useId();
  const toggle = () => {
    setOpen((was) => {
      if (id) {
        try {
          localStorage.setItem(KEY + id, was ? "0" : "1");
        } catch {
          // Private windows may refuse: it stays as it is until a reload.
        }
      }
      return !was;
    });
  };
  return (
    <div className={className}>
      <button type="button" className="ui-disclosure-head" aria-expanded={open} aria-controls={body} onClick={toggle}>
        <Icon name="chevron" className="ui-disclosure-chevron size-3.5" />
        <span className="min-w-0 truncate">{title}</span>
        {meta !== undefined && <span className="shrink-0 text-faint">{meta}</span>}
      </button>
      {open && (
        <div id={body} className="ui-disclosure-body">
          {children}
        </div>
      )}
    </div>
  );
}
