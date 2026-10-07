// Starter kits in the browser preview, from the same files the core ships
// (crates/kasten-core/defaults/kits) and added the way the core adds them
// (engine/kits.rs): refused when the kit's home page exists, `{{id:name}}`
// made fresh ids, the person's own files kept, and a starter file still
// exactly as shipped replaced. The preview keeps no history, so there is
// no commit to undo. Saving a page as a template is here too
// (templated.rs `template_from`).

import type { AddedKit, KitInfo, NoteFile } from "../../../lib/vault/types";
import { splitFrontmatter } from "../../pages/markdown/frontmatter";
import { isOldJournalTemplate } from "./journal-template";
import { MemorySources } from "./memory-sources";
import { eolOf } from "./memory-notes";
import { keyBlocks, newId, slugify } from "./vault-text";

const ROOT = "../../../../../crates/kasten-core/defaults/";
const FILES = import.meta.glob<string>("../../../../../crates/kasten-core/defaults/kits/*/**/*", { query: "?raw", import: "default", eager: true });
const MANIFESTS = import.meta.glob<string>("../../../../../crates/kasten-core/defaults/kits/*/kit.json", { query: "?raw", import: "default", eager: true });
const STOCK = import.meta.glob<string>(["../../../../../crates/kasten-core/defaults/templates/*.md", "../../../../../crates/kasten-core/defaults/tags/*.yaml"], {
  query: "?raw",
  import: "default",
  eager: true,
});

/** The order the core offers them in (`KITS`). */
export const KIT_ORDER = ["daily-planner", "second-brain", "zettelkasten", "gtd", "student", "research"];

const vaultPath = (key: string) => key.slice(ROOT.length);

/** Each kit's files by vault path. */
function filesOf(id: string): Record<string, string> {
  const prefix = `${ROOT}kits/${id}/`;
  return Object.fromEntries(
    Object.entries(FILES)
      .filter(([key]) => key.startsWith(prefix) && key !== `${prefix}kit.json`)
      .map(([key, text]) => [key.slice(prefix.length), text]),
  );
}

/** Every starter kit, as the core lists them. */
export function starterKits(): KitInfo[] {
  return KIT_ORDER.flatMap((id) => {
    const raw = MANIFESTS[`${ROOT}kits/${id}/kit.json`];
    if (!raw) return [];
    const m = JSON.parse(raw) as { icon: string; name: string; summary: string; home: string; recommended?: boolean };
    return [{ id, icon: m.icon, name: m.name, summary: m.summary, home: m.home, recommended: Boolean(m.recommended), files: Object.keys(filesOf(id)).sort() }];
  });
}

const stock = (path: string, text: string) =>
  Object.entries(STOCK).some(([key, shipped]) => vaultPath(key) === path && shipped === text) || (path === "templates/journal.md" && isOldJournalTemplate(text));

/** Where a kit's files are read and written in the preview. */
export interface KitStore {
  read(path: string): string | undefined;
  write(path: string, text: string): void;
}

export function addKitTo(id: string, store: KitStore, now: () => number): AddedKit {
  const kit = starterKits().find((k) => k.id === id);
  if (!kit) throw new Error(`There is no starter kit “${id}”`);
  if (store.read(kit.home) !== undefined) throw new Error(`${kit.name} is already in this vault: its page is ${kit.home}`);
  const ids = new Map<string, string>();
  const written: string[] = [];
  const kept: string[] = [];
  for (const [path, raw] of Object.entries(filesOf(id))) {
    const text = raw.replace(/\{\{id:([^}]+)\}\}/g, (_, name: string) => ids.get(name) ?? ids.set(name, newId(now())).get(name)!);
    const current = store.read(path);
    if (current === text) continue;
    if (current === undefined || stock(path, current)) {
      store.write(path, text);
      written.push(path);
    } else kept.push(path);
  }
  return { home: kit.home, written, kept: kept.sort(), commit: null };
}

/** Keys a template keeps from the page it is saved from. */
const KEPT_KEYS = ["icon", "tags", "props"];

/** The template `name` from a page's text, and where it goes. */
export function templateFrom(text: string, name: string, taken: (path: string) => boolean): { path: string; text: string } {
  const trimmed = name.trim();
  if (!trimmed || /[/\\\p{Cc}]/u.test(trimmed)) throw new Error("A template needs a name, without slashes");
  const slug = slugify(trimmed);
  if (!slug) throw new Error(`“${trimmed}” can't name a file`);
  const path = `templates/${slug}.md`;
  if (taken(path)) throw new Error(`A template called “${trimmed}” is already in this vault`);
  const { prefix, body } = splitFrontmatter(text);
  const eol = eolOf(text);
  const kept = keyBlocks(prefix)
    .filter(([key]) => KEPT_KEYS.includes(key))
    .map(([, block]) => (block.endsWith("\n") ? block : block + eol))
    .join("");
  return { path, text: `---${eol}title: "{{title}}"${eol}type: page${eol}${kept}---${eol}${body}` };
}

export class MemoryKits extends MemorySources {
  async kits(): Promise<KitInfo[]> {
    return starterKits();
  }

  async addKit(id: string): Promise<AddedKit> {
    const data = this.data;
    const where = (path: string) => (path.endsWith(".canvas") ? "boards" : path.endsWith(".yaml") ? "tags" : null);
    const added = addKitTo(
      id,
      {
        read: (path) => {
          const map = where(path);
          return map ? data[map]?.[path] : data.files[path]?.text;
        },
        write: (path, text) => {
          const map = where(path);
          if (map) (data[map] ??= {})[path] = text;
          else this.put(path, text);
        },
      },
      this.now,
    );
    this.persist();
    return added;
  }

  async saveAsTemplate(path: string, name: string): Promise<NoteFile> {
    const made = templateFrom(this.get(path).text, name, (p) => Boolean(this.data.files[p]));
    return this.put(made.path, made.text);
  }
}
