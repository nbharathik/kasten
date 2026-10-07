import type { NoteMeta } from "../../../lib/vault/types";
import { setArchived } from "../project-actions";

/** A slim line atop an archived project's page, with the way back.
 * The page itself opens and edits as usual. */
export function ArchivedBanner({ note }: { note: NoteMeta }) {
  return (
    <div className="kasten-note-banner is-archived" role="note" aria-label="Archived project">
      <span>This project is archived</span>
      <button type="button" onClick={() => void setArchived(note, false)}>
        Unarchive
      </button>
    </div>
  );
}
