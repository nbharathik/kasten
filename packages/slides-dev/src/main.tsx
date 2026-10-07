import { DeckEngine, loadSlides } from "@kasten-slides/wasm";
import { PresenterWindow, SlidesEditor, broadcastSync, presenterOf } from "@kasten-slides/react";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import { type FolderInfo, FolderApi } from "./api.ts";
import { buildDemo } from "./demo.ts";
import { EditorPage } from "./EditorPage.tsx";
import { Home } from "./Home.tsx";
import { pageHost } from "./memory-host.ts";
import { useDeckRoute } from "./route.ts";

/**
 * A sample deck kept in the browser's memory: `?deck=demo` (the default) or
 * `?deck=empty`; `?theme=Dark|Serif|Lecture` picks its theme.
 */
function Sample({ params, ui }: { params: URLSearchParams; ui?: "light" | "dark" | undefined }) {
  const host = useMemo(() => pageHost(), []);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    void loadSlides().then(() => {
      const engine = DeckEngine.create(params.get("deck") === "empty" ? "Untitled deck" : "Demo", params.get("theme") ?? "Light");
      if (params.get("deck") !== "empty") buildDemo(engine);
      setText(engine.save());
      engine.dispose();
    });
  }, [params]);

  if (text === null) return <p style={{ font: "13px system-ui", padding: 16 }}>Loading…</p>;
  return (
    <SlidesEditor
      text={text}
      host={host}
      theme={ui}
      onError={(message) => console.warn(message)}
      // Checks and scripts reach the editor through this.
      onSession={(session, editorUi) => Object.assign(window, { __ks: session ? { session, ui: editorUi, host } : undefined })}
    />
  );
}

type Server = { api: FolderApi; info: FolderInfo } | "none" | "looking";

/**
 * With `slides dev` behind the page the decks of its folder are listed and
 * edited; without it (a plain dev server, or `?deck=` in the address) the page
 * shows a sample deck.
 */
function Page() {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const route = useDeckRoute();
  const [server, setServer] = useState<Server>(params.has("deck") ? "none" : "looking");
  const ui = params.get("ui") === "dark" || params.get("ui") === "light" ? (params.get("ui") as "dark" | "light") : undefined;

  useEffect(() => {
    if (server !== "looking") return;
    const api = new FolderApi();
    api
      .info()
      .then((info) => setServer({ api, info }))
      .catch(() => setServer("none"));
  }, [server]);

  if (server === "looking") return <p style={{ font: "13px system-ui", padding: 16 }}>Loading…</p>;
  if (server === "none") return <Sample params={params} ui={ui} />;
  return route === null ? <Home api={server.api} info={server.info} /> : <EditorPage api={server.api} path={route} ui={ui} />;
}

// A window opened by "Presenter view" is the same page with `?presenter=<name>`: it shows the presenter's view of the talk in the other window.
const presenter = presenterOf(location.search);
const presenterLink = presenter ? broadcastSync(presenter) : null;

createRoot(document.getElementById("root")!).render(
  <StrictMode>{presenterLink ? <PresenterWindow sync={presenterLink} onClose={() => window.close()} /> : <Page />}</StrictMode>,
);
