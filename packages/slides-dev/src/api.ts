// The requests the page makes of `slides dev`. Every call is a plain fetch to
// the server that served the page.

/** A deck in the folder, as listed. */
export interface DeckEntry {
  path: string;
  title: string;
  slides: number;
  modified: number;
  size: number;
  /** Why the file is not a deck, if it is not. */
  problem: string | null;
}

/** A deck file with the hash a save must bring back. */
export interface DeckFile {
  path: string;
  text: string;
  hash: string;
  modified: number;
}

export type Saved =
  | { status: "written" | "unchanged"; deck: DeckFile }
  /** The file moved on; the text sent is kept in `copy`. */
  | { status: "conflict"; copy: string; deck: DeckFile };

/** A picture of the folder: what the file says, and what its sidecar remembers. */
export interface AssetEntry {
  path: string;
  /** The name it came with. */
  name: string;
  bytes: number;
  /** When it came in, in milliseconds. */
  added: number;
  width?: number;
  height?: number;
  id?: string;
  sha256?: string;
  /** `pasted` or `file`. */
  source?: string;
  createdBy?: string;
  tags: string[];
  caption?: string;
  citationKey?: string;
  clip?: { pdf: string; page: number; rect: [number, number, number, number] };
  deck?: string;
}

/** What a person changes about a picture: tags replaced, a caption or citation key set (empty clears it). */
export interface AssetEdit {
  tags?: string[];
  caption?: string;
  citationKey?: string;
}

/** Where each picture is used: the slides of the folder's decks. */
export interface AssetUse {
  notes: { path: string; title: string }[];
  boards: { path: string; title: string }[];
  decks: { path: string; title: string; slides: { number: number; id: string }[]; theme: boolean }[];
}

export interface FolderInfo {
  name: string;
  version: string;
  themes: string[];
}

/** What the server says changed on disk. */
export interface FolderEvent {
  kind: "deck" | "asset" | "references";
  change: "added" | "changed" | "removed";
  path: string;
  hash?: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * FNV-1a over the UTF-8 bytes, as 16 hex digits: the hash the server gives a
 * file's text, so the page can tell what it holds is what the server has.
 */
export function contentHash(text: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

/** The header only this page sends: a browser will not add it to a request from another site without asking the server first. */
const OURS = { "X-Slides": "1" };

async function answer<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  throw new ApiError(response.status, body?.error ?? response.statusText);
}

export class FolderApi {
  constructor(
    private readonly root = "",
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}

  private url(endpoint: string, params: Record<string, string> = {}): string {
    const query = new URLSearchParams(params).toString();
    return `${this.root}/api/${endpoint}${query ? `?${query}` : ""}`;
  }

  info(): Promise<FolderInfo> {
    return this.fetcher(this.url("info")).then((r) => answer<FolderInfo>(r));
  }

  decks(): Promise<DeckEntry[]> {
    return this.fetcher(this.url("decks")).then((r) => answer<DeckEntry[]>(r));
  }

  deck(path: string): Promise<DeckFile> {
    return this.fetcher(this.url("deck", { path })).then((r) => answer<DeckFile>(r));
  }

  create(title: string, theme: string): Promise<DeckFile> {
    return this.fetcher(this.url("decks", { title, theme }), { method: "POST", headers: OURS }).then((r) => answer<DeckFile>(r));
  }

  /** Writes the deck if the file still has `base`; otherwise the text is kept as a copy and the answer says so. */
  save(path: string, text: string, base: string): Promise<Saved> {
    return this.fetcher(this.url("deck", { path, base }), {
      method: "PUT",
      headers: { ...OURS, "Content-Type": "application/json" },
      body: text,
    }).then((r) => answer<Saved>(r));
  }

  /** Moves the deck into the folder's `.trash/`; resolves to where it went. */
  trash(path: string): Promise<string> {
    return this.fetcher(this.url("trash", { path }), { method: "POST", headers: OURS })
      .then((r) => answer<{ trashed: string }>(r))
      .then((r) => r.trashed);
  }

  assets(): Promise<AssetEntry[]> {
    return this.fetcher(this.url("assets")).then((r) => answer<AssetEntry[]>(r));
  }

  /**
   * Keeps a picture; resolves to the path a deck stores. The same bytes kept before, under any name, are the same
   * picture and come back as the path they have. `source` says whether it was pasted or chosen.
   */
  addAsset(name: string, bytes: Uint8Array, source: "pasted" | "file" = "file"): Promise<string> {
    return this.fetcher(this.url("asset", { name, source }), {
      method: "POST",
      headers: { ...OURS, "Content-Type": "application/octet-stream" },
      body: bytes as BodyInit,
    })
      .then((r) => answer<{ path: string }>(r))
      .then((r) => r.path);
  }

  /** Changes a picture's tags, caption or citation key; resolves to the picture as it is now. */
  setAssetMeta(path: string, edit: AssetEdit): Promise<AssetEntry> {
    return this.fetcher(this.url("asset-meta", { path }), {
      method: "PUT",
      headers: { ...OURS, "Content-Type": "application/json" },
      body: JSON.stringify(edit),
    }).then((r) => answer<AssetEntry>(r));
  }

  /** Where each used picture is used, by path. */
  usage(): Promise<Record<string, AssetUse>> {
    return this.fetcher(this.url("usage")).then((r) => answer<Record<string, AssetUse>>(r));
  }

  /** A small WebP copy of a picture, 256 or 1024 pixels: a picture that has none (a vector picture) is not found. */
  thumbUrl(path: string, size: 256 | 1024): string {
    return this.url("thumb", { path, size: String(size) });
  }

  assetUrl(path: string): string {
    return this.url("asset", { path });
  }

  /** The `.bib` files beside the decks, one after another; empty when there are none. */
  references(): Promise<string> {
    return this.fetcher(this.url("references"))
      .then((r) => answer<{ text: string }>(r))
      .then((r) => r.text);
  }

  /** Calls `onEvent` for each change on disk until the returned function is called. The browser reconnects by itself. */
  events(onEvent: (event: FolderEvent) => void): () => void {
    const source = new EventSource(this.url("events"));
    source.onmessage = (message) => {
      try {
        onEvent(JSON.parse(message.data as string) as FolderEvent);
      } catch {
        // A line that is not an event is not worth stopping for.
      }
    };
    return () => source.close();
  }
}
