// Properties no tag schema names, edited as text, and "Add property".

import { useState, type FormEvent } from "react";

import { useWorkspace } from "../../workspace/store";
import { InlineInput } from "./fields";
import { asText, editableAsText, fromText, validKey } from "./values";

interface OtherPropertiesProps {
  keys: string[];
  props: Record<string, unknown>;
  onSave(key: string, value: unknown): void;
}

export function OtherProperties({ keys, props, onSave }: OtherPropertiesProps) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="kasten-panel-section" aria-label="Other properties">
      <h3 className="kasten-panel-label">Other properties</h3>
      {keys.length > 0 && (
        <dl className="kasten-props">
          <OtherRows keys={keys} props={props} onSave={onSave} />
        </dl>
      )}
      {adding ? (
        <NewProperty
          taken={Object.keys(props)}
          onCancel={() => setAdding(false)}
          onAdd={(key, value) => {
            setAdding(false);
            onSave(key, value);
          }}
        />
      ) : (
        <button type="button" className="kasten-panel-add" onClick={() => setAdding(true)}>
          + Add property
        </button>
      )}
    </section>
  );
}

/** One row per property, in a `<dl className="kasten-props">`. */
export function OtherRows({ keys, props, onSave }: OtherPropertiesProps) {
  return keys.map((key) => (
    <div key={key} className="kasten-prop">
      <dt title={key}>{key}</dt>
      <dd>
        {editableAsText(props[key]) ? (
          <InlineInput value={asText(props[key])} label={key} onCommit={(text) => onSave(key, fromText(text, props[key]))} />
        ) : (
          <code className="kasten-prop-raw" title="Edit this value in the Markdown file">
            {asText(props[key])}
          </code>
        )}
        <button type="button" className="kasten-prop-remove" aria-label={`Remove ${key}`} title={`Remove ${key}`} onClick={() => onSave(key, null)}>
          ×
        </button>
      </dd>
    </div>
  ));
}

export function NewProperty({ taken, onAdd, onCancel }: { taken: string[]; onAdd(key: string, value: string): void; onCancel(): void }) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = key.trim();
    const { toast } = useWorkspace.getState();
    if (!validKey(name)) return toast("A property name has letters, digits, - and _, and starts with a letter");
    if (taken.includes(name)) return toast(`This page already has “${name}”`);
    onAdd(name, value.trim());
  };
  return (
    <form className="kasten-prop-new" aria-label="New property" onSubmit={submit} onKeyDown={(e) => e.key === "Escape" && onCancel()}>
      <input className="kasten-prop-input" aria-label="Property name" placeholder="Name" autoFocus value={key} onChange={(e) => setKey(e.target.value)} />
      <input className="kasten-prop-input" aria-label="Property value" placeholder="Value" value={value} onChange={(e) => setValue(e.target.value)} />
      <div className="kasten-prop-new-actions">
        <button type="submit" className="kasten-panel-button is-primary">
          Add
        </button>
        <button type="button" className="kasten-panel-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
