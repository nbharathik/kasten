// The provider and model used last, which new chats start with. A
// preference of this window, kept in the browser's storage like the panel's
// tab; stored values are checked, since anything may be there.

import type { ChatProvider } from "./types";

const KEY = "kasten.chat.model";

export interface ModelChoice {
  provider: string;
  model: string;
}

export function lastModel(): ModelChoice | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!saved || typeof saved !== "object") return null;
    const { provider, model } = saved as Record<string, unknown>;
    return typeof provider === "string" && provider && typeof model === "string" ? { provider, model } : null;
  } catch {
    return null;
  }
}

export function keepModel(choice: ModelChoice): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(choice));
  } catch {
    // New chats start with the first provider instead.
  }
}

/** The provider and model a thread uses: its own choice while that provider
 * exists, else the last one used, else the first provider's; null when no
 * provider is set up. An empty model means the provider's own. */
export function modelFor(thread: { provider: string | null; model: string | null }, providers: readonly ChatProvider[] | null, last: ModelChoice | null = lastModel()): ModelChoice | null {
  if (!providers || providers.length === 0) return null;
  const pick = (name: string | null | undefined) => (name ? providers.find((p) => p.name === name) : undefined);
  const own = pick(thread.provider);
  if (own) return { provider: own.name, model: thread.model?.trim() || own.model };
  const kept = pick(last?.provider);
  if (kept) return { provider: kept.name, model: last!.model.trim() || kept.model };
  return { provider: providers[0]!.name, model: providers[0]!.model };
}
