import { type KeyboardEvent, useId, useMemo, useRef, useState } from "react";

import { Popover, usePopover } from "../../../ui/Popover.tsx";
import type { Mixed } from "../values.ts";
import { findLanguages, languageOf, nameOfLanguage } from "./languages.ts";
import "./composites.css";

interface LanguageSelectProps {
  /** The language the code is in, or "mixed". */
  value: string | Mixed;
  onPick(language: string): void;
}

/**
 * A box that shows the language and opens a list of them as it is typed in: a
 * select that can be searched. A name that is not on the list can be used as it
 * is, since the colouring may know it.
 */
export function LanguageSelect({ value, onPick }: LanguageSelectProps) {
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const menu = usePopover();
  const input = useRef<HTMLInputElement>(null);
  const uid = useId();
  const typed = query?.trim() ?? "";
  const rows = useMemo(() => {
    const found = findLanguages(typed).map((language) => ({ id: language.id, label: language.label, hint: language.id === language.label.toLowerCase() ? "" : language.id }));
    // Something that is not on the list can still be what the person means.
    return typed !== "" && !languageOf(typed) ? [...found, { id: typed.toLowerCase(), label: `Use “${typed}”`, hint: "" }] : found;
  }, [typed]);
  const at = Math.min(active, Math.max(rows.length - 1, 0));

  const open = () => {
    if (input.current) menu.openFrom(input.current);
  };
  const close = () => {
    menu.close();
    setQuery(null);
  };
  const pick = (id: string | undefined) => {
    if (id === undefined) return;
    close();
    onPick(id);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!menu.anchor) open();
      else setActive((at + (event.key === "ArrowDown" ? 1 : rows.length - 1)) % Math.max(rows.length, 1));
    } else if (event.key === "Enter" && menu.anchor) {
      event.preventDefault();
      pick(rows[at]?.id);
    }
  };

  return (
    <>
      <input
        ref={input}
        className="ks-input ks-cs-language"
        role="combobox"
        aria-label="Language"
        aria-expanded={menu.anchor !== null}
        aria-controls={`${uid}-list`}
        aria-autocomplete="list"
        aria-activedescendant={menu.anchor && rows[at] ? `${uid}-${at}` : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder={value === "mixed" ? "Mixed" : "Search languages"}
        value={query ?? (value === "mixed" ? "" : nameOfLanguage(value))}
        onFocus={(event) => {
          event.currentTarget.select();
          open();
        }}
        onClick={() => {
          if (!menu.anchor) open();
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          if (!menu.anchor) open();
        }}
        onBlur={close}
        onKeyDown={onKeyDown}
      />
      {menu.anchor ? (
        <Popover anchor={menu.anchor} onClose={close} keepFocus label="Languages">
          <ul id={`${uid}-list`} role="listbox" aria-label="Languages" className="ks-cs-options" style={{ minWidth: menu.anchor.right - menu.anchor.left }}>
            {rows.map((row, i) => (
              <li key={row.id} id={`${uid}-${i}`} role="option" aria-selected={i === at} className={`ks-cs-option${i === at ? " is-active" : ""}`} onMouseMove={() => setActive(i)} onClick={() => pick(row.id)}>
                <span>{row.label}</span>
                {row.hint ? <span className="ks-cs-option-hint">{row.hint}</span> : null}
              </li>
            ))}
            {rows.length === 0 ? <li className="ks-cs-option-none">No language has that name.</li> : null}
          </ul>
        </Popover>
      ) : null}
    </>
  );
}
