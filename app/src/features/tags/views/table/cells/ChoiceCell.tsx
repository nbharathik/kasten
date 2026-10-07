// Select and multi-select cells: the values as coloured chips; editing
// opens the options beside the cell.

import { asList, asText } from "../../../../panel/properties/values";
import { listOrNull, sameText } from "../format";
import { Chip, OptionMenu } from "./OptionMenu";
import type { TypeCellProps } from "./types";

export function SelectCell({ value, def, editing, seed, label, anchor, save, finish }: TypeCellProps) {
  const current = asText(value);
  return (
    <>
      {current && <Chip text={current} options={def.options} />}
      {editing && (
        <OptionMenu
          anchor={anchor}
          label={label}
          options={def.options}
          chosen={current ? [current] : []}
          multi={false}
          seed={seed}
          onPick={(option) => {
            save(option);
            finish(null, true);
          }}
          onRemove={() => save(null)}
          onClose={finish}
        />
      )}
    </>
  );
}

export function MultiCell({ value, def, editing, seed, label, anchor, save, finish }: TypeCellProps) {
  const items = asList(value);
  const has = (option: string) => items.some((i) => sameText(i, option));
  return (
    <>
      <span className="kasten-table-chips" title={items.join(", ") || undefined}>
        {items.map((item) => (
          <Chip key={item} text={item} options={def.options} />
        ))}
      </span>
      {editing && (
        <OptionMenu
          anchor={anchor}
          label={label}
          options={def.options}
          chosen={items}
          multi
          seed={seed}
          onPick={(option) => save(listOrNull(has(option) ? items.filter((i) => !sameText(i, option)) : [...items, option]))}
          onRemove={(option) => save(listOrNull(items.filter((i) => i !== option)))}
          onClose={finish}
        />
      )}
    </>
  );
}
