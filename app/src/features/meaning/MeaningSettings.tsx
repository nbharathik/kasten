// Settings → Search by meaning: which OpenAI-compatible provider and model
// make notes' vectors (kept in the vault's config, ai.embeddings), and
// making them, with how far it got. The vectors stay on this computer in
// .kasten/cache; each note's text goes to the provider chosen to make one.

import { useEffect, useState } from "react";

import { useChat } from "../chat/store";
import { Group, Row } from "../workspace/views/settings/parts";
import { useWorkspace } from "../workspace/store";
import { meaningApi, type MeaningApi, type MeaningStatus } from "./client";

/** OpenAI's small embedding model: cheap, and good at notes. */
export const DEFAULT_MODEL = "text-embedding-3-small";
const BUTTON = "ui-btn";
const FIELD = "rounded-md bg-canvas px-2 py-1 text-13 ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-accent/40";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function MeaningSettings({ api = meaningApi }: { api?: MeaningApi }) {
  const client = useWorkspace((s) => s.client);
  const providers = useChat((s) => s.providers);
  const [status, setStatus] = useState<MeaningStatus | null>(null);
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [problem, setProblem] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const available = api.available();

  useEffect(() => {
    if (!available) return;
    if (providers === null) void useChat.getState().loadProviders();
    api.status().then(
      (found) => {
        setStatus(found);
        if (found.provider) setProvider(found.provider);
        if (found.model) setModel(found.model);
      },
      (err: unknown) => setProblem(message(err)),
    );
    return api.onProgress(setProgress);
  }, [api, available, providers]);

  if (!available) {
    return (
      <Group title="Search by meaning">
        <Row label="Search by meaning works in the desktop app" detail="It asks an embedding model, with a key kept in your system keychain">
          {null}
        </Row>
      </Group>
    );
  }

  const makers = (providers ?? []).filter((p) => p.kind === "openai");
  const save = async () => {
    if (!client) return;
    setProblem(null);
    try {
      const config = await client.getConfig();
      const embeddings = provider ? { provider, model: model.trim() || DEFAULT_MODEL } : null;
      await client.setConfig({ ...config, ai: { ...config.ai, embeddings } });
      setStatus(await api.status());
    } catch (err) {
      setProblem(message(err));
    }
  };
  const make = async () => {
    setProblem(null);
    setStatus((s) => (s ? { ...s, running: true } : s));
    try {
      setStatus(await api.make());
    } catch (err) {
      setProblem(message(err));
      setStatus(await api.status().catch(() => null));
    } finally {
      setProgress(null);
    }
  };

  const chosen = status?.provider && status.model;
  const shown = progress ?? status;
  return (
    <Group
      title="Search by meaning"
      detail="Finds notes about what you ask, not just the words you type: Ctrl+K, then “by meaning”. Each note's text goes to the provider below to make its vector; the vectors stay on this computer. Notes written later get theirs when you next search."
    >
      <Row label="Provider" detail={makers.length ? "An OpenAI-compatible one: OpenAI, or a local server such as vLLM or Ollama" : "Add an OpenAI-compatible provider under AI providers first"}>
        <select aria-label="Provider for search by meaning" className={FIELD} value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="">None</option>
          {makers.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Embedding model" detail="OpenAI's text-embedding-3-small, or the embedding model your server runs">
        <div className="flex gap-2">
          <input aria-label="Embedding model" className={`${FIELD} w-56`} value={model} onChange={(e) => setModel(e.target.value)} spellCheck={false} />
          <button type="button" className={BUTTON} onClick={() => void save()}>
            Save
          </button>
        </div>
      </Row>
      {chosen && shown && (
        <Row label="Vectors" detail={`${shown.done} of ${shown.total} notes have vectors`}>
          {status?.running ? (
            <button type="button" className={BUTTON} onClick={() => void api.stop()}>
              Stop
            </button>
          ) : (
            <button type="button" className={BUTTON} disabled={shown.done === shown.total} onClick={() => void make()}>
              Make vectors
            </button>
          )}
        </Row>
      )}
      {problem && (
        <Row label="Search by meaning could not go on" detail={problem}>
          {null}
        </Row>
      )}
    </Group>
  );
}
