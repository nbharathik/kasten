// The preview's copy of kasten-core's rules for files kept in assets/
// (engine/assets.rs): the same names, refusals and limit.

import { MAX_ASSET_BYTES } from "../../../lib/vault/assets";
import { slugify } from "./vault-text";

/** The kinds of file a page keeps: pictures, documents, data, sound, video and archives (KEPT in
 * engine/assets.rs). Nothing that runs when opened and nothing a browser opens as a page (HTML or
 * XML) is kept, whatever else it claims to be. */
const KEPT = new Set([
  ...["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "tif", "tiff", "heic", "heif", "ico", "svg", "psd", "ai", "sketch", "fig", "excalidraw", "drawio"],
  ...["pdf", "txt", "md", "rtf", "doc", "docx", "odt", "pages", "epub", "tex", "bib", "xls", "xlsx", "ods", "numbers", "ppt", "pptx", "odp", "key"],
  ...["csv", "tsv", "json", "yaml", "yml", "ics", "vcf", "gpx", "kml", "srt", "vtt"],
  ...["mp3", "m4a", "wav", "ogg", "oga", "opus", "flac", "aac", "mp4", "m4v", "mov", "webm", "mkv", "avi", "zip", "gz", "tgz", "tar", "7z"],
]);

/** The pictures a slide or page shows (read_asset's PICTURES): the gallery lists these. */
const PICTURES = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp"]);

/** Whether the file at `path` is a picture, by its extension in any case. */
export function isPicture(path: string): boolean {
  const name = path.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 && PICTURES.has(name.slice(dot + 1).toLowerCase());
}

/** The file name `name` is kept under, as `{ stem, ext }`, or an error
 * saying why it cannot be kept. */
export function assetName(name: string, size: number): { stem: string; ext: string } {
  const shown = name.trim();
  if (size === 0) throw new Error(`“${shown}” is empty`);
  if (size > MAX_ASSET_BYTES) throw new Error(`“${shown}” is over ${MAX_ASSET_BYTES / 1024 / 1024} MB; keep big files outside the vault and link to them`);
  const base = shown.split(/[/\\]/).pop()!.trim();
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : "";
  const ext = dot > 0 ? base.slice(dot + 1) : "";
  if (!stem.trim() || !/^[A-Za-z0-9]{1,12}$/.test(ext)) throw new Error(`Cannot keep “${shown}”: a file needs a name and an extension such as .png`);
  if (!KEPT.has(ext.toLowerCase())) throw new Error(`Cannot keep “${shown}”: a page keeps pictures, documents, sound, video, data and archives, not files that run or open as web pages`);
  return { stem: slugify(stem), ext: ext.toLowerCase() };
}

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", avif: "image/avif", pdf: "application/pdf" };

/** The media type the preview serves a kept file with. */
export const typeOf = (path: string) => TYPES[path.slice(path.lastIndexOf(".") + 1)] ?? "application/octet-stream";

export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}
