import { type JSX, useEffect, useRef } from "react";

import { Icon } from "../ui/Icon.tsx";

/**
 * The name of a section while it is being changed, in the place of its header.
 * Enter (or leaving the box) keeps what was typed, and Escape keeps the old name;
 * `done` is told which, once.
 */
export function SectionName({ title, done }: { title: string; done(value: string | null): void }): JSX.Element {
  const box = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  useEffect(() => {
    box.current?.focus();
    box.current?.select();
  }, []);
  const finish = (value: string | null) => {
    if (finished.current) return;
    finished.current = true;
    done(value);
  };
  return (
    <div className="ks-fs-section is-renaming" role="presentation">
      <Icon name="chevron-down" size={14} />
      <input
        ref={box}
        className="ks-input ks-fs-section-input"
        aria-label="Section name"
        defaultValue={title}
        spellCheck={false}
        autoComplete="off"
        // The list is a listbox with keys of its own (Delete removes a slide, the arrows move); the words typed here are not for it.
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            finish(event.currentTarget.value);
          } else if (event.key === "Escape") {
            event.preventDefault();
            finish(null);
          }
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onBlur={(event) => finish(event.currentTarget.value)}
      />
    </div>
  );
}
