// The vault's tag schemas, for the Tag Database and the databases in pages.
// A saved view shows at once, then as the core wrote it; saved properties
// show once the core took them. A refusal is toasted and the schemas are
// read again.

import { create } from "zustand";

import type { PropDef, TagSchema, TagView } from "../../lib/vault/types";
import { forgetSchemas, schemaOf } from "../panel/properties/schemas";
import { useWorkspace } from "../workspace/store";

interface TagsState {
  /** Every schema, or null until they load. */
  schemas: TagSchema[] | null;
  load(): Promise<void>;
  saveViews(tag: string, views: TagView[]): Promise<void>;
  /** Whether the core took them. */
  saveProperties(tag: string, properties: PropDef[]): Promise<boolean>;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Loads cross: the newest one's answer wins. */
let latest = 0;

export const useTags = create<TagsState>()((set, get) => {
  const replace = (schema: TagSchema) => {
    const list = get().schemas ?? [];
    const at = list.findIndex((s) => s.path === schema.path || s.name.toLowerCase() === schema.name.toLowerCase());
    set({ schemas: at < 0 ? [...list, schema] : list.map((s, i) => (i === at ? schema : s)) });
    forgetSchemas();
  };
  const refused = async (err: unknown) => {
    useWorkspace.getState().toast(message(err));
    await get().load();
  };
  return {
    schemas: null,
    async load() {
      const client = useWorkspace.getState().client;
      if (!client) return;
      const mine = ++latest;
      const schemas = await client.tagSchemas().catch(() => null);
      if (mine === latest && schemas) set({ schemas });
    },
    async saveViews(tag, views) {
      const client = useWorkspace.getState().client;
      if (!client) return;
      const current = schemaOf(get().schemas, tag);
      if (current) replace({ ...current, views });
      try {
        replace(await client.setTagViews(tag, views));
      } catch (err) {
        await refused(err);
      }
    },
    async saveProperties(tag, properties) {
      const client = useWorkspace.getState().client;
      if (!client) return false;
      try {
        replace(await client.setTagProperties(tag, properties));
        return true;
      } catch (err) {
        await refused(err);
        return false;
      }
    },
  };
});
