// A tag's properties: add, rename, retype,
// reorder and remove them, and list a select's options. Saved into the tag's
// YAML in one commit; notes keep the values they have.

import { useState } from "react";

import type { PropDef, TagSchema } from "../../lib/vault/types";
import { Modal } from "../../ui/Modal";
import { validKey } from "../panel/properties/values";
import { joinOptions, splitOptions } from "./option-list";
import { useTags } from "./store";

const TYPES: { type: string; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "number", label: "Number" },
  { type: "select", label: "Select" },
  { type: "multi_select", label: "Multi-select" },
  { type: "date", label: "Date" },
  { type: "checkbox", label: "Checkbox" },
  { type: "url", label: "Link" },
  { type: "relation", label: "Relation" },
];

const hasOptions = (type: string) => type === "select" || type === "multi_select";

interface Draft {
  key: string;
  type: string;
  /** Options as typed: separated by commas, one holding a comma in quotes. */
  options: string;
}

const draftOf = (def: PropDef): Draft => ({ key: def.key, type: def.type, options: joinOptions(def.options) });

/** What is wrong with the drafts, if anything. */
function problem(drafts: Draft[]): string | null {
  const keys = drafts.map((d) => d.key.trim());
  for (const key of keys) {
    if (!key) return "Every property needs a name.";
    if (!validKey(key)) return `“${key}” can hold letters, digits, - and _, starting with a letter.`;
  }
  const twice = keys.find((k, i) => keys.indexOf(k) !== i);
  return twice ? `Two properties are called “${twice}”.` : null;
}

export function SchemaEditor({ tag, schema, onClose }: { tag: string; schema: TagSchema | null; onClose: () => void }) {
  const [drafts, setDrafts] = useState<Draft[]>(() => (schema?.properties ?? []).map(draftOf));
  const [saving, setSaving] = useState(false);
  const wrong = problem(drafts);
  const edit = (i: number, patch: Partial<Draft>) => setDrafts(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...drafts];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    setDrafts(next);
  };
  const save = async () => {
    if (wrong) return;
    setSaving(true);
    const properties: PropDef[] = drafts.map((d) => ({
      key: d.key.trim(),
      type: d.type,
      options: hasOptions(d.type) ? splitOptions(d.options) : [],
    }));
    const done = await useTags.getState().saveProperties(tag, properties);
    setSaving(false);
    if (done) onClose();
  };

  return (
    <Modal plain label={`Properties of #${tag}`} onClose={onClose} className="kasten-schema">
      <h2>Properties of #{tag}</h2>
      <p className="kasten-schema-note">Notes tagged #{tag} show these in their Properties panel. Renaming one leaves values already set under the old name.</p>
      <ol className="kasten-schema-list">
        {drafts.map((d, i) => (
          <li key={i}>
            <input aria-label="Property name" placeholder="name" value={d.key} onChange={(e) => edit(i, { key: e.target.value })} autoFocus={i === drafts.length - 1 && !d.key} />
            <select aria-label={`Type of ${d.key || "the new property"}`} value={d.type} onChange={(e) => edit(i, { type: e.target.value })}>
              {TYPES.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
            </select>
            {hasOptions(d.type) ? (
              <input aria-label={`Options of ${d.key || "the new property"}`} placeholder="Options, separated by commas" title={'Separate options with commas; put one holding a comma in "double quotes"'} value={d.options} onChange={(e) => edit(i, { options: e.target.value })} />
            ) : (
              <span />
            )}
            <span className="kasten-schema-tools">
              <button type="button" aria-label={`Move ${d.key || "property"} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                ↑
              </button>
              <button type="button" aria-label={`Move ${d.key || "property"} down`} disabled={i === drafts.length - 1} onClick={() => move(i, 1)}>
                ↓
              </button>
              <button type="button" aria-label={`Remove ${d.key || "property"}`} onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}>
                ×
              </button>
            </span>
          </li>
        ))}
      </ol>
      <button type="button" className="kasten-tagdb-add" onClick={() => setDrafts([...drafts, { key: "", type: "text", options: "" }])}>
        + Add a property
      </button>
      {wrong && <p className="kasten-schema-problem">{wrong}</p>}
      <div className="kasten-schema-actions">
        <button type="button" className="kasten-tagdb-button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="kasten-tagdb-button is-primary" disabled={Boolean(wrong) || saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}
