import { DeckEngine, builtInThemes, loadSlides } from "@kasten-slides/wasm";
import { useEffect, useState } from "react";

import { useWorkspace } from "../workspace/store";
import { projects } from "../workspace/tree";
import { ImportButton } from "./ImportButton";
import { useDecks } from "./store";

/** Title, project and theme for a new deck; it opens once made. */
export function NewDeck() {
  const notes = useWorkspace((s) => s.notes);
  const [title, setTitle] = useState("");
  const [project, setProject] = useState(() => useDecks.getState().draftProject ?? "");
  const [theme, setTheme] = useState("Light");
  const [themes, setThemes] = useState<string[]>(["Light", "Dark", "Serif", "Lecture"]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => useDecks.setState({ creating: false, draftProject: null });

  // The theme names come from the engine, so a new built-in theme shows up here on its own.
  useEffect(() => {
    let live = true;
    void loadSlides().then(() => live && setThemes(builtInThemes()));
    return () => {
      live = false;
    };
  }, []);

  const create = async () => {
    const client = useWorkspace.getState().client;
    const name = title.trim();
    if (!client || !name || busy) return;
    setBusy(true);
    try {
      await loadSlides();
      const engine = DeckEngine.create(name, theme);
      const text = engine.save();
      engine.dispose();
      const path = await client.createDeck(name, project || null, text);
      await useDecks.getState().load();
      close();
      useWorkspace.getState().openPath(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      aria-label="New deck"
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
      className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-canvas p-3 shadow-card"
    >
      <input
        autoFocus
        aria-label="Title"
        placeholder="Name it, e.g. Quarterly review"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && close()}
        className="h-9 min-w-[200px] flex-1 rounded-lg border border-line bg-canvas px-3 text-14 outline-none focus:border-accent/60 focus:ring-[3px] focus:ring-accent/15"
      />
      <select aria-label="Theme" value={theme} onChange={(e) => setTheme(e.target.value)} className="h-9 rounded-lg border border-line bg-canvas px-2 text-13 outline-none focus:border-accent/60">
        {themes.map((name) => (
          <option key={name} value={name}>
            {name} theme
          </option>
        ))}
      </select>
      <select aria-label="Project" value={project} onChange={(e) => setProject(e.target.value)} className="h-9 rounded-lg border border-line bg-canvas px-2 text-13 outline-none focus:border-accent/60">
        <option value="">No project</option>
        {projects(notes).map((p) => (
          <option key={p.path} value={p.project ?? ""}>
            {p.title}
          </option>
        ))}
      </select>
      <button type="submit" disabled={!title.trim() || busy} className="h-9 rounded-lg bg-accent px-4 text-13 font-medium text-on-accent shadow-card transition hover:brightness-110 disabled:opacity-50">
        Create
      </button>
      <ImportButton project={project || null} title={title} onFailed={setError} className="h-9 rounded-lg border border-line bg-canvas px-3 text-13 text-ink transition hover:bg-hover disabled:opacity-50">
        Import PowerPoint…
      </ImportButton>
      <button type="button" onClick={close} className="h-9 rounded-lg px-3 text-13 text-muted hover:bg-hover hover:text-ink">
        Cancel
      </button>
      {error && (
        <p role="alert" className="w-full text-13 text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
