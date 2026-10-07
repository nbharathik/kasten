// The services the provider form starts from. Each fills in the kind and
// the address; "Custom" leaves both to you. Local servers speak the
// OpenAI-compatible API on their usual port.

import type { ProviderKind } from "../../../../chat/types";

export type PresetId = "anthropic" | "openai" | "openrouter" | "ollama" | "lmstudio" | "vllm" | "custom";

export interface Preset {
  id: PresetId;
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  /** Where the key comes from, or that a local server needs none. */
  keyHint: string;
  /** A server on this computer. */
  local?: boolean;
}

export const PRESETS: readonly Preset[] = [
  { id: "anthropic", label: "Anthropic", kind: "anthropic", baseUrl: "https://api.anthropic.com", keyHint: "Make one at console.anthropic.com, under API keys." },
  { id: "openai", label: "OpenAI", kind: "openai", baseUrl: "https://api.openai.com/v1", keyHint: "Make one at platform.openai.com, under API keys." },
  { id: "openrouter", label: "OpenRouter", kind: "openai", baseUrl: "https://openrouter.ai/api/v1", keyHint: "Make one at openrouter.ai, under Keys." },
  { id: "ollama", label: "Ollama", kind: "openai", baseUrl: "http://localhost:11434/v1", keyHint: "Ollama on this computer needs no key.", local: true },
  { id: "lmstudio", label: "LM Studio", kind: "openai", baseUrl: "http://localhost:1234/v1", keyHint: "LM Studio's server needs no key unless you turned one on.", local: true },
  { id: "vllm", label: "vLLM", kind: "openai", baseUrl: "http://localhost:8000/v1", keyHint: "vLLM needs a key only if it was started with one.", local: true },
  { id: "custom", label: "Custom", kind: "openai", baseUrl: "", keyHint: "A local server may need none." },
];

export const presetById = (id: PresetId): Preset => PRESETS.find((p) => p.id === id)!;

const bare = (url: string) => url.trim().replace(/\/+$/, "").toLowerCase();

/** The preset a provider matches by kind and address, else Custom. */
export function presetOf(kind: ProviderKind, baseUrl: string): Preset {
  const url = bare(baseUrl);
  return PRESETS.find((p) => p.id !== "custom" && p.kind === kind && bare(p.baseUrl) === url) ?? presetById("custom");
}

/** The preset's name, or the first free "Name 2", "Name 3"… */
export function freeName(label: string, taken: readonly string[]): string {
  const used = new Set(taken.map((t) => t.trim().toLowerCase()));
  if (!used.has(label.toLowerCase())) return label;
  for (let n = 2; ; n++) if (!used.has(`${label} ${n}`.toLowerCase())) return `${label} ${n}`;
}
