// The options of a select or multi-select, beside its cell: the chosen ones
// as chips, a search, and the options in their colours. A select picks one
// and closes; a multi-select toggles and stays open. With no options in the
// schema, what is typed can be used as a value.

import { useId, useMemo, useState, type RefObject } from "react";

import { chipStyle, optionSwatch } from "../../../../panel/properties/schemas";
import type { Move } from "../context";
import { Floating } from "../Floating";
import { sameText } from "../format";
import { Glyph } from "../icons";
import { usePickerKeys } from "./usePickerKeys";

interface OptionMenuProps {
  anchor: RefObject<HTMLElement | null>;
  label: string;
  options: string[];
  chosen: string[];
  multi: boolean;
  seed: string | null;
  /** A select's pick, a multi-select's toggle. */
  onPick(option: string): void;
  onRemove(option: string): void;
  onClose(move?: Move, refocus?: boolean): void;
}

interface Item {
  value: string;
  /** A value typed that no option has yet. */
  fresh: boolean;
}

/** The options matching `query`, then values set that the schema lacks, then
 * the typed text when the schema lists no options. */
export function optionItems(options: readonly string[], chosen: readonly string[], query: string): Item[] {
  const all = [...options, ...chosen.filter((c) => !options.some((o) => sameText(o, c)))];
  const q = query.trim().toLowerCase();
  const found = all.filter((o) => o.toLowerCase().includes(q)).map((value) => ({ value, fresh: false }));
  const typed = query.trim();
  if (options.length === 0 && typed && !all.some((o) => sameText(o, typed))) found.push({ value: typed, fresh: true });
  return found;
}

export function Chip({ text, options }: { text: string; options: readonly string[] }) {
  return (
    <span className="kasten-table-chip" style={chipStyle(optionSwatch(text, [...options]))}>
      {text}
    </span>
  );
}

export function OptionMenu({ anchor, label, options, chosen, multi, seed, onPick, onRemove, onClose }: OptionMenuProps) {
  const [query, setQuery] = useState(seed ?? "");
  const items = useMemo(() => optionItems(options, chosen, query), [options, chosen, query]);
  const list = useId();
  const isChosen = (value: string) => chosen.some((c) => sameText(c, value));
  const pick = (item: Item) => {
    onPick(item.value);
    if (multi) setQuery("");
  };
  // Backspace in an empty search takes off the last value, as in Notion.
  const keys = usePickerKeys(items.length, (i) => pick(items[i]!), onClose, (e) => {
    if (e.key !== "Backspace" || !multi || query !== "" || chosen.length === 0) return false;
    onRemove(chosen[chosen.length - 1]!);
    return true;
  });
  const at = keys.at;

  return (
    <Floating anchor={anchor} label={label} onClose={() => onClose(null, false)} className="kasten-table-options">
      {chosen.length > 0 && (
        <div className="kasten-table-pop-chips">
          {chosen.map((value) => (
            <span key={value} className="kasten-table-chip" style={chipStyle(optionSwatch(value, options))}>
              {value}
              <button type="button" aria-label={`Remove ${value}`} onMouseDown={(e) => e.preventDefault()} onClick={() => onRemove(value)}>
                <Glyph name="close" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        autoFocus
        className="kasten-table-pop-search"
        aria-label={`Find an option for ${label}`}
        aria-controls={list}
        aria-activedescendant={at >= 0 ? `${list}-${at}` : undefined}
        placeholder={options.length > 0 ? "Find an option…" : "Type a value…"}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          keys.setActive(0);
        }}
        onKeyDown={keys.onKeyDown}
      />
      {items.length === 0 ? (
        <p className="kasten-table-pop-empty">{options.length > 0 ? "No option matches" : `Type a value, then Enter`}</p>
      ) : (
        <ul id={list} role="listbox" aria-label="Options" aria-multiselectable={multi || undefined} className="kasten-table-pop-list">
          {items.map((item, i) => (
            <li
              key={`${item.fresh ? "+" : ""}${item.value}`}
              id={`${list}-${i}`}
              role="option"
              aria-selected={isChosen(item.value)}
              data-active={i === at || undefined}
              onMouseEnter={() => keys.setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(item)}
            >
              {item.fresh && <span className="kasten-table-pop-note">{multi ? "Add" : "Use"}</span>}
              <Chip text={item.value} options={options} />
              <span className="flex-1" />
              {isChosen(item.value) && <Glyph name="tick" className="is-tick" />}
            </li>
          ))}
        </ul>
      )}
    </Floating>
  );
}
