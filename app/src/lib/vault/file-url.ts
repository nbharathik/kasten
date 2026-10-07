// Vault files the page can show directly, such as images on a board or in a
// page, through Tauri's asset protocol (the app allows the open vault's
// folder, minus .git, .kasten and .trash).

import { convertFileSrc } from "@tauri-apps/api/core";

let root: string | null = null;
/** Files the browser preview was given this session, as object URLs. */
const kept = new Map<string, string>();

/** Where the open vault is on disk; null in the browser preview. */
export function setFileRoot(folder: string | null): void {
  root = folder;
}

/** A URL the window can load the vault file at `path` from, or null where
 * files cannot be shown (the browser preview, or a path outside the vault). */
export function fileUrl(path: string): string | null {
  const known = kept.get(path);
  if (known) return known;
  if (!root || !path || path.startsWith("/") || path.split("/").some((part) => part === "" || part === "." || part === "..")) return null;
  const windows = root.includes("\\");
  const full = windows ? `${root.replace(/\\+$/, "")}\\${path.replaceAll("/", "\\")}` : `${root.replace(/\/+$/, "")}/${path}`;
  return convertFileSrc(full);
}

/** Where the browser preview shows a file it keeps in memory. */
export function keepFileUrl(path: string, url: string): void {
  kept.set(path, url);
}

/** Image files a board shows as pictures. */
export const IMAGE_FILE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
