// Search by meaning's calls into the desktop app (app/src-tauri/src/meaning):
// notes' vectors come from the embedding model chosen in Settings, and a
// question finds the notes nearest it. The browser preview has none.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { inTauri } from "../../lib/api";

/** How far search by meaning covers the vault. */
export interface MeaningStatus {
  provider: string | null;
  model: string | null;
  done: number;
  total: number;
  running: boolean;
}

/** A note near a question. */
export interface NearNote {
  path: string;
  title: string;
  icon: string | null;
  excerpt: string;
  /** Cosine similarity, 1 the nearest. */
  score: number;
}

export interface MeaningApi {
  /** False in the browser preview. */
  available(): boolean;
  status(): Promise<MeaningStatus>;
  /** Makes the vectors notes need; resolves when done or stopped. */
  make(): Promise<MeaningStatus>;
  stop(): Promise<void>;
  search(query: string, limit?: number): Promise<NearNote[]>;
  /** Progress while vectors are made; returns how to stop listening. */
  onProgress(listener: (progress: { done: number; total: number }) => void): () => void;
}

export const meaningApi: MeaningApi = {
  available: () => inTauri(),
  status: () => invoke<MeaningStatus>("meaning_status"),
  make: () => invoke<MeaningStatus>("make_vectors"),
  stop: () => invoke<void>("stop_vectors"),
  search: (query, limit = 20) => invoke<NearNote[]>("search_meaning", { query, limit }),
  onProgress(listener) {
    const stop = listen<{ done: number; total: number }>("meaning-progress", (e) => listener(e.payload));
    return () => void stop.then((off) => off(), () => {});
  },
};
