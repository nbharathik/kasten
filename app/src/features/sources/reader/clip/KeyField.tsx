// The citation key of a clip: a field to type it in, with the works of the
// vault's bibliography to choose from as you type. A key that is not in any
// `.bib` file is still kept (the bibliography may come later); the note under
// the field says which it is.

import { type Ref, useId, useState } from "react";

import { cite, matchWorks, type Work } from "./bib";
import { keyProblem } from "./clip-file";

/** The most works offered at once. */
const MOST = 6;

/** What is said under the field about the key that is typed in it. */
function noteOn(key: string, works: readonly Work[], problem: string | null): string {
  if (problem) return problem;
  const known = works.find((w) => w.key === key);
  if (known) return [cite(known), known.title].filter(Boolean).join(" · ");
  if (works.length === 0) return "No .bib file in the vault yet. Type the key the paper will have.";
  return key ? "Not in the vault's .bib files yet. The key is kept with the figure." : "";
}

interface Props {
  works: readonly Work[];
  value: string;
  onChange(value: string): void;
  inputRef?: Ref<HTMLInputElement>;
}

export function KeyField({ works, value, onChange, inputRef }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const typed = value.trim();
  const known = works.find((w) => w.key === typed);
  // A key that is a work's is settled: the list is for finding one.
  const offered = open && !known ? matchWorks(works, typed).slice(0, MOST) : [];
  const problem = keyProblem(value);

  const pick = (work: Work) => {
    onChange(work.key);
    setOpen(false);
    setActive(-1);
  };

  const note = noteOn(typed, works, problem);

  return (
    <div className="kasten-clip-key">
      <input
        ref={inputRef}
        role="combobox"
        aria-label="Citation key"
        aria-expanded={offered.length > 0}
        aria-controls={`${id}-list`}
        aria-activedescendant={active >= 0 && active < offered.length ? `${id}-${active}` : undefined}
        aria-autocomplete="list"
        aria-invalid={problem !== null}
        autoComplete="off"
        spellCheck={false}
        placeholder="e.g. vaswani2017attention"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(!known)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            const shown = matchWorks(works, typed).slice(0, MOST).length;
            if (shown > 0) setActive((now) => (event.key === "ArrowDown" ? (now + 1) % shown : (now <= 0 ? shown : now) - 1));
          } else if (event.key === "Enter" && offered[active]) {
            event.preventDefault();
            pick(offered[active]);
          } else if (event.key === "Escape" && offered.length > 0) {
            // The list closes; the form stays.
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {offered.length > 0 && (
        <ul id={`${id}-list`} role="listbox" aria-label="Works in the bibliography" className="kasten-clip-works" onMouseDown={(event) => event.preventDefault()}>
          {offered.map((work, i) => (
            <li key={work.key} id={`${id}-${i}`} role="option" aria-selected={i === active} className={i === active ? "is-active" : undefined} onClick={() => pick(work)}>
              <span className="kasten-clip-work-key">{work.key}</span>
              <span className="kasten-clip-work-line">{[cite(work), work.title].filter(Boolean).join(" · ")}</span>
            </li>
          ))}
        </ul>
      )}
      {note && (
        <p className={`kasten-clip-note${problem ? " is-problem" : ""}`} role={problem ? "alert" : undefined}>
          {note}
        </p>
      )}
    </div>
  );
}
