// One version of the note: its text, read-only, or its changes up to the
// current text; and "Restore this version", which writes it as a new
// version, so nothing is lost.

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import type { CommitInfo } from "../../../lib/vault/types";
import { splitFrontmatter } from "../../pages/markdown/frontmatter";
import { pageView } from "../../workspace/page/open-page";
import { useWorkspace } from "../../workspace/store";
import { errorText, type PanelPage } from "../page-edit";
import { diffCounts, lineDiff } from "./line-diff";
import { ReadableText } from "./ReadableText";
import { authorOf, versionTime } from "./versions";

interface VersionViewProps {
  version: CommitInfo;
  path: string;
  /** The page's text now, as the editor has it. */
  current: string;
  /** Version texts read so far, by id, so scrubbing back is instant. */
  texts: Map<string, string | null>;
  showChanges: boolean;
  onShowChanges(show: boolean): void;
  page: PanelPage;
}

export function VersionView({ version, path, current, texts, showChanges, onShowChanges, page }: VersionViewProps) {
  // undefined while loading; null when the version has no copy of this file.
  const [text, setText] = useState<string | null | undefined>(() => texts.get(version.id));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (texts.has(version.id)) return;
    let live = true;
    // A short wait, so scrubbing past versions does not read each one.
    const timer = setTimeout(() => {
      page.client.version(version.id, path).then(
        (found) => {
          texts.set(version.id, found);
          if (live) setText(found);
        },
        (err: unknown) => {
          if (!live) return;
          setText(null);
          useWorkspace.getState().toast(errorText(err));
        },
      );
    }, 80);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [page.client, version.id, path, texts]);

  const body = text == null ? null : splitFrontmatter(text).body;
  // Typing on the page should not wait for the diff.
  const now = useDeferredValue(current);
  const diff = useMemo(() => (showChanges && body !== null ? lineDiff(body, now) : null), [showChanges, body, now]);
  const counts = diff ? diffCounts(diff) : null;

  // Turning on "Show changes" brings the first change into view, once, so
  // typing on the page meanwhile does not move the preview.
  const textBox = useRef<HTMLDivElement>(null);
  const jumped = useRef(false);
  useEffect(() => {
    if (!diff) {
      jumped.current = false;
      return;
    }
    const box = textBox.current;
    const first = box?.querySelector<HTMLElement>(":scope > del, :scope > ins");
    if (jumped.current || !box || !first) return;
    jumped.current = true;
    box.scrollTop = Math.max(0, first.offsetTop - box.clientHeight / 3);
  }, [diff]);

  const restore = async () => {
    const { client, session, onReload } = page;
    setBusy(true);
    try {
      // Typing waiting to be saved goes first, so it stays in the history too.
      await session.flush();
      const restored = await client.restoreVersion(path, version.id);
      useWorkspace.getState().noteChanged(restored.meta);
      onReload(restored, pageView(session));
      useWorkspace.getState().toast(`Restored the version from ${versionTime(version.time)}`);
    } catch (err) {
      useWorkspace.getState().toast(errorText(err));
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <section className="kasten-version" aria-label="Chosen version">
      <div className="kasten-version-head">
        <div className="kasten-version-title">
          <strong>{versionTime(version.time)}</strong>
          <span>
            {version.agent ? "Agent " : ""}
            {authorOf(version)}
          </span>
        </div>
        <label className="kasten-switch">
          <input type="checkbox" role="switch" checked={showChanges} onChange={(e) => onShowChanges(e.target.checked)} />
          <span>Show changes</span>
        </label>
      </div>
      {confirming ? (
        <div className="kasten-restore" role="group" aria-label="Restore this version?">
          <p>Put the page back to this version? Its current text stays in the history.</p>
          <div>
            <button type="button" className="kasten-panel-button is-primary" disabled={busy} onClick={() => void restore()}>
              {busy ? "Restoring…" : "Restore"}
            </button>
            <button type="button" className="kasten-panel-button" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="kasten-panel-button is-primary kasten-restore-button" disabled={body === null} onClick={() => setConfirming(true)}>
          Restore this version
        </button>
      )}
      {counts && (
        <p className="kasten-diff-legend">
          {counts.removed + counts.added === 0 ? (
            "Same as the page now."
          ) : (
            <>
              Since this version: <del>{counts.removed} removed</del> <ins>{counts.added} added</ins>
            </>
          )}
        </p>
      )}
      <div ref={textBox} className={`kasten-version-text${diff ? " is-diff" : ""}`} aria-label="Text of this version" tabIndex={0}>
        {text === undefined ? (
          <span className="kasten-panel-empty">Reading this version…</span>
        ) : body === null ? (
          <span className="kasten-panel-empty">This version has no copy of the page.</span>
        ) : diff ? (
          diff.map((line, i) =>
            line.kind === "removed" ? (
              <del key={i}>{line.text || " "}</del>
            ) : line.kind === "added" ? (
              <ins key={i}>{line.text || " "}</ins>
            ) : (
              <span key={i}>{line.text || " "}</span>
            ),
          )
        ) : (
          <ReadableText markdown={body} />
        )}
      </div>
    </section>
  );
}
