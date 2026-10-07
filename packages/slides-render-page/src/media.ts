// The deck's pictures. The page never reaches the network: a picture the deck names by a path is asked for at
// `media/<path>` on the page's own address, and the driver answers from the deck's folder. Anything with a scheme
// of its own (`https:`, `file:`) is not loaded at all.

export const MEDIA_ROOT = "media/";

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Where the page loads the picture a deck names by `path` from; undefined for one it will not load. */
export function mediaUrl(path: string): string | undefined {
  if (path.trim() === "") return undefined;
  if (/^(?:data|blob):/i.test(path)) return path;
  if (SCHEME.test(path) || path.startsWith("//") || path.includes("\\")) return undefined;
  const parts = path.split("/").filter((part) => part !== "" && part !== ".");
  if (parts.length === 0 || parts.includes("..")) return undefined;
  return MEDIA_ROOT + parts.map(encodeURIComponent).join("/");
}

/** The bytes of a picture, as the driver holds them; undefined when it has none. */
export async function readMedia(path: string): Promise<Uint8Array | undefined> {
  const url = mediaUrl(path);
  if (url === undefined) return undefined;
  if (url.startsWith("data:") || url.startsWith("blob:")) {
    const response = await fetch(url);
    return new Uint8Array(await response.arrayBuffer());
  }
  try {
    const response = await fetch(url, { cache: "no-store" });
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : undefined;
  } catch {
    return undefined;
  }
}
