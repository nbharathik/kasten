// Files pasted or dropped into a page live in the vault's assets/ folder and
// are linked relative to the page.

import { IMAGE_FILE } from "./file-url";
import type { VaultClient } from "./types";

/** The largest file a page takes, as in the core. */
export const MAX_ASSET_BYTES = 50 * 1024 * 1024;

const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "image/avif": "avif" };

/** Whether the page can show the file as a picture. */
export function isImageFile(file: { name: string; type: string }): boolean {
  return IMAGE_FILE.test(file.name) || file.type in IMAGE_TYPES;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The name to keep a file under. Pasted screenshots arrive nameless or
 * all called `image.png`, so they are named after when they were pasted. */
export function keptName(file: { name: string; type: string }, now: Date): string {
  const name = file.name.trim();
  if (name && !/^image\.\w+$/i.test(name)) return name;
  const ext = /\.(\w+)$/.exec(name)?.[1] ?? IMAGE_TYPES[file.type] ?? "bin";
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `Pasted image ${stamp}.${ext}`;
}

/** Keeps a pasted or dropped file in the vault's assets/ folder through the
 * core; resolves to its vault path. */
export async function keepFile(client: Pick<VaultClient, "saveAsset">, file: File, now: Date = new Date()): Promise<string> {
  const name = keptName(file, now);
  if (file.size > MAX_ASSET_BYTES) throw new Error(`“${name}” is over ${MAX_ASSET_BYTES / 1024 / 1024} MB; keep big files outside the vault and link to them`);
  return client.saveAsset(name, new Uint8Array(await file.arrayBuffer()));
}

/** The link from the note at `from` to the vault file `to`, relative to the
 * note's folder: `../assets/x.png` from `projects/plan.md`. */
export function relativeLink(from: string, to: string): string {
  const base = from.split("/").slice(0, -1);
  const target = to.split("/");
  let common = 0;
  while (common < base.length && common < target.length - 1 && base[common] === target[common]) common++;
  return [...base.slice(common).map(() => ".."), ...target.slice(common)].join("/");
}

/** The vault path a link in the note at `from` points at, or null for web
 * links and links that leave the vault. A leading `/` starts at the vault. */
export function resolveLink(from: string, src: string): string | null {
  const link = src.trim();
  if (!link || /^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith("//") || link.startsWith("#")) return null;
  let path = link.replace(/[?#].*$/, "");
  try {
    path = decodeURI(path);
  } catch {
    // Kept as written.
  }
  const parts = path.startsWith("/") ? [] : from.split("/").slice(0, -1);
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part !== "..") parts.push(part);
    else if (!parts.pop()) return null;
  }
  return parts.length ? parts.join("/") : null;
}
