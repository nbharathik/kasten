// What every view of a tag database gets from the database around it.

import type { NoteMeta, TagSchema, TagView } from "../../../lib/vault/types";

export interface ViewProps {
  /** The tag, as its schema or its notes write it. */
  tag: string;
  /** Its schema, or null for a tag without one. */
  schema: TagSchema | null;
  /** The view shown, as saved. */
  view: TagView;
  /** The notes it shows: the tag's, filtered and sorted by the view. */
  notes: NoteMeta[];
  /** Saves a change to this view (its group, its columns...) into the tag's YAML. */
  onChange(next: TagView): void;
  /** Where "+ New" makes a note: this project folder, else the library. */
  project?: string | null;
  /** Leaves out the view's own bar, for a view inside a dashboard. */
  bare?: boolean;
}
