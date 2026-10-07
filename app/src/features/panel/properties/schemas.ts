// Tag schemas for the right panel's properties, fetched once per open page,
// and the colours tags and options are drawn in.

import { useEffect, useState, type CSSProperties } from "react";

import type { TagSchema, VaultClient } from "../../../lib/vault/types";

let cache: { client: VaultClient; path: string; schemas: Promise<TagSchema[]> } | null = null;

/** The vault's tag schemas, fetched again only when another page opens. */
export function schemasFor(client: VaultClient, path: string): Promise<TagSchema[]> {
  if (!cache || cache.client !== client || cache.path !== path) {
    cache = { client, path, schemas: client.tagSchemas().catch(() => []) };
  }
  return cache.schemas;
}

/** Drops the cached schemas, after a tag's schema changed. */
export function forgetSchemas(): void {
  cache = null;
}

/** The schemas, or null while they load. */
export function useSchemas(client: VaultClient, path: string): TagSchema[] | null {
  const [schemas, setSchemas] = useState<TagSchema[] | null>(null);
  useEffect(() => {
    let live = true;
    void schemasFor(client, path).then((found) => live && setSchemas(found));
    return () => {
      live = false;
    };
  }, [client, path]);
  return schemas;
}

/** The schema of `tag`, matched without regard to case as the core does. */
export function schemaOf(schemas: TagSchema[] | null, tag: string): TagSchema | undefined {
  const wanted = tag.toLowerCase();
  return schemas?.find((s) => s.name.toLowerCase() === wanted);
}

/** Colour names the page palette has (tokens.css). */
const PALETTE = new Set(["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red", "teal"]);
const ALIASES: Record<string, string> = { grey: "gray", violet: "purple", cyan: "teal", turquoise: "teal" };
/** Colours for options, in order: calm ones first. */
const OPTION_COLORS = ["blue", "purple", "orange", "green", "pink", "yellow", "teal", "red", "brown"];

export interface Swatch {
  fg: string;
  bg: string;
}

/** Text and background for a schema's colour name (or #hex), or null for none. */
export function swatch(color: string | null | undefined): Swatch | null {
  const raw = color?.trim().toLowerCase();
  if (!raw) return null;
  if (/^#[0-9a-f]{3,8}$/.test(raw)) return { fg: raw, bg: `color-mix(in srgb, ${raw} 16%, transparent)` };
  const name = ALIASES[raw] ?? raw;
  if (PALETTE.has(name)) return { fg: `var(--notion-${name})`, bg: `var(--notion-${name}-bg)` };
  return null;
}

function hash(text: string): number {
  let h = 0;
  for (const c of text) h = (h * 31 + c.codePointAt(0)!) >>> 0;
  return h;
}

/** An option's colour: by its place in the schema, or by its text when it has none. */
export function optionSwatch(value: string, options: string[]): Swatch {
  const at = options.findIndex((o) => o.toLowerCase() === value.toLowerCase());
  const name = OPTION_COLORS[(at >= 0 ? at : hash(value)) % OPTION_COLORS.length]!;
  return swatch(name)!;
}

/** CSS variables a chip reads its colours from. */
export const chipStyle = (s: Swatch | null): CSSProperties | undefined =>
  s ? ({ "--chip-fg": s.fg, "--chip-bg": s.bg } as CSSProperties) : undefined;
