// "Links from this page": each page this one links to, one click away, and
// each link that finds no page, marked, with Create to make it.

import { useEffect, useMemo, useState } from "react";

import type { NoteMeta, VaultClient } from "../../../lib/vault/types";
import { splitFrontmatter } from "../../pages/markdown/frontmatter";
import { dragNotes } from "../../workspace/drag";
import { placeOf } from "../../workspace/links";
import { iconOf, titleOf } from "../../workspace/names";
import { howFrom, useWorkspace } from "../../workspace/store";
import { IconOrEmoji } from "../../../ui/IconOrEmoji";
import { Icon } from "../../../ui/Icon";
import { linksOut, type LinkOut } from "./links-out";

export function LinksOut({ client, note }: { client: VaultClient; note: NoteMeta }) {
  const notes = useWorkspace((s) => s.notes);
  const [body, setBody] = useState<string | null>(null);

  // Read again when this page is saved.
  useEffect(() => {
    let live = true;
    client.read(note.path).then(
      (file) => live && setBody(splitFrontmatter(file.text).body),
      () => live && setBody(null),
    );
    return () => {
      live = false;
    };
  }, [client, note.path, note.modified]);

  const links = useMemo(() => (body === null ? null : linksOut(body, notes, placeOf(note))), [body, notes, note]);
  if (!links?.length) return null;
  const broken = links.filter((l) => l.kind === "missing").length;

  return (
    <section className="kasten-panel-section" aria-label="Links from this page">
      <h3 className="kasten-panel-label">
        <span>
          Links from this page <span className="kasten-panel-count">{links.length}</span>
          {broken > 0 && <span className="kasten-link-broken-count"> · {broken} to no page</span>}
        </span>
      </h3>
      <ul className="kasten-links">
        {links.map((link) => (
          <OutRow key={link.target.toLowerCase()} link={link} />
        ))}
      </ul>
    </section>
  );
}

function OutRow({ link }: { link: LinkOut }) {
  const { openPath, openJournal, create } = useWorkspace.getState();
  if (link.kind === "missing") {
    return (
      <li className="kasten-link is-broken">
        <span className="kasten-link-open">
          <span className="kasten-link-title">
            <Icon name="alert" className="inline size-3.5 align-[-2px] text-danger" /> {link.target}
          </span>
          <span className="kasten-link-snippet">No page has this name yet</span>
        </span>
        <button type="button" className="kasten-panel-button kasten-link-it" aria-label={`Create ${link.target}`} onClick={() => void create({ kind: "page", title: link.target }, false)}>
          Create
        </button>
      </li>
    );
  }
  if (link.kind === "day") {
    return (
      <li className="kasten-link">
        <button type="button" className="kasten-link-open" title={`Open the journal on ${link.target}`} onClick={(e) => void openJournal(link.target, howFrom(e))}>
          <span className="kasten-link-title">
            <Icon name="journal" className="inline size-3.5 align-[-2px]" /> {link.note ? titleOf(link.note) : link.target}
          </span>
        </button>
      </li>
    );
  }
  const { note, shared } = link;
  return (
    <li className="kasten-link" draggable onDragStart={(e) => dragNotes(e, [note.path])}>
      <button type="button" className="kasten-link-open" title={`Open ${titleOf(note)} (Ctrl+click: new tab)`} onClick={(e) => openPath(note.path, howFrom(e))}>
        <span className="kasten-link-title">
          <IconOrEmoji icon={iconOf(note)} /> {titleOf(note)}
        </span>
        {shared > 1 && <span className="kasten-link-snippet">{shared} pages share this name; this one is nearest</span>}
      </button>
    </li>
  );
}
