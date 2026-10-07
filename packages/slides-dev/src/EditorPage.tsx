import { type EditorSession, SlidesEditor } from "@kasten-slides/react";
import { type JSX, useEffect, useMemo, useRef, useState } from "react";

import { type DeckFile, type FolderApi } from "./api.ts";
import { download } from "./download.ts";
import { FolderHost } from "./folder-host.ts";
import { go } from "./route.ts";

/** One deck of the folder in the editor, kept in step with the file: a change made elsewhere reaches the editor as it happens. */
export function EditorPage({ api, path, ui }: { api: FolderApi; path: string; ui?: "light" | "dark" | undefined }): JSX.Element {
  const [deck, setDeck] = useState<DeckFile | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const session = useRef<EditorSession | null>(null);

  useEffect(() => {
    setDeck(null);
    setProblem(null);
    let current = true;
    api
      .deck(path)
      .then((d) => current && setDeck(d))
      .catch((e: unknown) => current && setProblem(e instanceof Error ? e.message : String(e)));
    return () => {
      current = false;
    };
  }, [api, path]);

  const host = useMemo(() => (deck ? new FolderHost(api, path, deck.hash, download) : null), [api, path, deck]);

  useEffect(
    () =>
      api.events((event) => {
        if (event.kind !== "deck" || event.path !== path || event.change === "removed") return;
        // The editor's own save comes back as an event too: it is the version the host already holds.
        if (event.hash && event.hash === host?.base) return;
        void api.deck(path).then((latest) => session.current?.receive(latest.text));
      }),
    [api, path, host],
  );

  if (problem)
    return (
      <p style={{ font: "14px system-ui", padding: 24 }} role="alert">
        This deck could not be opened: {problem}. <a href="#/">Back to the decks</a>
      </p>
    );
  if (!deck || !host) return <p style={{ font: "14px system-ui", padding: 24 }}>Opening…</p>;
  return (
    <SlidesEditor
      key={`${path}:${deck.hash}`}
      text={deck.text}
      host={host}
      theme={ui}
      actions={{ close: () => go(null) }}
      onError={(message) => console.warn(message)}
      onSession={(made, editorUi) => {
        session.current = made;
        Object.assign(window, { __ks: made ? { session: made, ui: editorUi, host } : undefined });
      }}
    />
  );
}
