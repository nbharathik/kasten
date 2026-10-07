// A page's properties in the right panel: tags, then each schema tag's
// properties with a typed editor, then the note's other properties. Every
// edit sends just its key and shows at once; when the core refuses it, it
// rolls back.

import "./chips.css";
import "./properties.css";

import { memo } from "react";

import type { NoteMeta } from "../../../lib/vault/types";
import { tagPlace } from "../../tags/place";
import { howFrom, useWorkspace } from "../../workspace/store";
import type { PanelPage } from "../page-edit";
import { PropField } from "./fields";
import { OtherProperties } from "./OtherProperties";
import { chipStyle, swatch } from "./schemas";
import { TagEditor } from "./TagEditor";
import { usePropertyEdits } from "./use-property-edits";
import { propOf } from "./values";

export const PropertiesTab = memo(function PropertiesTab({ note, page }: { note: NoteMeta; page: PanelPage }) {
  const { schemas, tags, props, groups, otherKeys, saveProp, changeTags } = usePropertyEdits(note, page);

  return (
    <>
      <section className="kasten-panel-section" aria-label="Tags">
        <h3 className="kasten-panel-label">Tags</h3>
        <TagEditor tags={tags} schemas={schemas} onAdd={(tag) => void changeTags([tag], [])} onRemove={(tag) => void changeTags([], [tag])} />
      </section>
      {groups.map(({ tag, schema }) => (
        <section key={tag} className="kasten-panel-section" aria-label={`#${tag} properties`}>
          <h3 className="kasten-panel-group" style={chipStyle(swatch(schema.color))}>
            <span className="kasten-tag-dot" aria-hidden="true" />
            <button type="button" className="kasten-panel-group-link" title={`Open #${tag} as a database`} onClick={(e) => useWorkspace.getState().go(tagPlace(tag), howFrom(e))}>
              #{tag}
            </button>
          </h3>
          <dl className="kasten-props">
            {schema.properties.map((def) => (
              <div key={def.key} className="kasten-prop">
                <dt title={`${def.key}: ${def.type.replace("_", " ")}`}>{def.key}</dt>
                <dd>
                  <PropField def={def} value={propOf(props, def.key)} label={def.key} self={note.path} onSave={(value) => void saveProp(def.key, value)} />
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      {/* Until the schemas are in, no property knows its group. */}
      {schemas !== null && groups.length === 0 && (
        <p className="kasten-panel-hint">Tags with a schema, such as {schemas[0] ? `#${schemas[0].name}` : "#paper"}, bring their properties here.</p>
      )}
      {schemas !== null && <OtherProperties keys={otherKeys} props={props} onSave={(key, value) => void saveProp(key, value)} />}
    </>
  );
});
