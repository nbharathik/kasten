import { useState } from "react";

import { useWorkspace } from "../workspace/store";
import { projects } from "../workspace/tree";
import { useBoards } from "./store";

/** Title and project for a new whiteboard; it opens once made. */
export function NewBoard() {
  const notes = useWorkspace((s) => s.notes);
  const [title, setTitle] = useState("");
  const [project, setProject] = useState(() => useBoards.getState().draftProject ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => useBoards.setState({ creating: false, draftProject: null });

  const create = async () => {
    const client = useWorkspace.getState().client;
    const name = title.trim();
    if (!client || !name || busy) return;
    setBusy(true);
    try {
      const path = await client.createBoard(name, project || null);
      await useBoards.getState().load();
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
      aria-label="New whiteboard"
      onSubmit={(e) => {
        e.preventDefault();
        void create();
      }}
      className="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-canvas p-3 shadow-card"
    >
      <input
        autoFocus
        aria-label="Title"
        placeholder="Name it, e.g. Trip ideas"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && close()}
        className="h-9 min-w-[200px] flex-1 rounded-lg border border-line bg-canvas px-3 text-14 outline-none focus:border-accent/60 focus:ring-[3px] focus:ring-accent/15"
      />
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
