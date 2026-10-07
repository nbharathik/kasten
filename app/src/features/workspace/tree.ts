// The sidebar's view of the vault: projects with their pages, loose pages,
// sub-pages under their parent, notes in other folders by folder, and
// lookups by title.
//
// Every answer comes from one index per notes array, built once and cached,
// so a sidebar of thousands of rows asks in constant time. Lists that did
// not change keep their identity from the previous index, so rows can skip
// re-rendering when one note is saved.

import type { NoteMeta } from "../../lib/vault/types";
import { HOLDS_PAGES } from "./page/new-page-home";

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
const byTitle = (a: NoteMeta, b: NoteMeta) => collator.compare(a.title, b.title);
/** Shared and frozen: callers copy before sorting. */
const EMPTY = Object.freeze([]) as unknown as NoteMeta[];

/** Kasten's own top-level folders. Notes in any
 * other folder, as in an Obsidian vault opened as it is, keep their folders
 * in the sidebar. */
export const KASTEN_FOLDERS = new Set(["inbox", "journal", "projects", "library", "sources", "chats", "templates", "tags", "assets"]);

/** Whether a note sits in a folder that is not one of Kasten's own. */
export function inOtherFolder(path: string): boolean {
  const slash = path.indexOf("/");
  return slash > 0 && !path.startsWith(".") && !KASTEN_FOLDERS.has(path.slice(0, slash));
}

/** A folder of notes outside Kasten's own folders. */
export interface FolderNode {
  name: string;
  /** Its vault path, such as `Areas/Health`; "" for the vault itself. */
  path: string;
  folders: FolderNode[];
  notes: NoteMeta[];
  /** Notes in it and in its folders. */
  count: number;
}

export interface TreeIndex {
  byPath: Map<string, NoteMeta>;
  byId: Map<string, NoteMeta>;
  /** Sub-pages by their parent's id, by title. */
  children: Map<string, NoteMeta[]>;
  /** A project's own top-level pages, then cards, by project folder. */
  projectPages: Map<string, NoteMeta[]>;
  /** Project notes by folder. */
  projectNote: Map<string, NoteMeta>;
  projects: NoteMeta[];
  loose: NoteMeta[];
  /** Notes in other folders, by folder. */
  folders: FolderNode;
  inbox: NoteMeta[];
  journal: NoteMeta[];
  templates: NoteMeta[];
  openable: NoteMeta[];
  /** Openable notes by lower-case title, the first by path winning. */
  titles: Map<string, NoteMeta>;
}

const cache = new WeakMap<readonly NoteMeta[], TreeIndex>();
let last: TreeIndex | null = null;
let lastNotes: readonly NoteMeta[] | null = null;
/** More changed notes than this rebuild the index instead of patching it. */
const MAX_PATCH = 32;

/** `next`, or `prev` when it holds the very same notes in the same order. */
function share(prev: NoteMeta[] | undefined, next: NoteMeta[]): NoteMeta[] {
  if (next.length === 0) return EMPTY;
  if (!prev || prev.length !== next.length) return next;
  for (let i = 0; i < next.length; i++) if (prev[i] !== next[i]) return next;
  return prev;
}

function shareMap(prev: Map<string, NoteMeta[]> | undefined, next: Map<string, NoteMeta[]>): Map<string, NoteMeta[]> {
  for (const [key, list] of next) next.set(key, share(prev?.get(key), list));
  return next;
}

/** Notes (in other folders) as the folders they sit in, each sorted. */
function folderTree(notes: readonly NoteMeta[]): FolderNode {
  const root: FolderNode = { name: "", path: "", folders: [], notes: [], count: 0 };
  const byPath = new Map<string, FolderNode>([["", root]]);
  const nodeFor = (dir: string): FolderNode => {
    let node = byPath.get(dir);
    if (node) return node;
    const at = dir.lastIndexOf("/");
    const parent = nodeFor(at < 0 ? "" : dir.slice(0, at));
    node = { name: dir.slice(at + 1), path: dir, folders: [], notes: [], count: 0 };
    parent.folders.push(node);
    byPath.set(dir, node);
    return node;
  };
  for (const note of notes) nodeFor(note.path.slice(0, note.path.lastIndexOf("/"))).notes.push(note);
  const finish = (node: FolderNode): number => {
    node.folders.sort((a, b) => collator.compare(a.name, b.name));
    node.notes.sort(byTitle);
    node.count = node.notes.length + node.folders.reduce((sum, folder) => sum + finish(folder), 0);
    return node.count;
  };
  finish(root);
  return root;
}

/** The tree with `old` swapped for `next`, which sits at the same path. */
function withNote(node: FolderNode, old: NoteMeta, next: NoteMeta): FolderNode {
  if (node.notes.includes(old)) return { ...node, notes: replaced(node.notes, old, next) };
  const dir = old.path.slice(0, old.path.lastIndexOf("/"));
  const child = node.folders.find((f) => dir === f.path || dir.startsWith(`${f.path}/`));
  if (!child) return node;
  const swapped = withNote(child, old, next);
  return swapped === child ? node : { ...node, folders: node.folders.map((f) => (f === child ? swapped : f)) };
}

/** A fresh index (exported for tests; callers use `treeOf`). */
export function build(notes: readonly NoteMeta[]): TreeIndex {
  const byPath = new Map<string, NoteMeta>();
  const byId = new Map<string, NoteMeta>();
  const titles = new Map<string, NoteMeta>();
  const children = new Map<string, NoteMeta[]>();
  const grouped = new Map<string, NoteMeta[]>();
  const projectNote = new Map<string, NoteMeta>();
  const projectList: NoteMeta[] = [];
  const looseAll: NoteMeta[] = [];
  const elsewhere: NoteMeta[] = [];
  const inbox: NoteMeta[] = [];
  const journal: NoteMeta[] = [];
  const templateList: NoteMeta[] = [];
  const openableList: NoteMeta[] = [];

  for (const n of notes) {
    byPath.set(n.path, n);
    if (n.id && !byId.has(n.id)) byId.set(n.id, n);
  }
  for (const n of notes) {
    if (n.kind === "template") {
      if (n.path.startsWith("templates/")) templateList.push(n);
      continue;
    }
    openableList.push(n);
    const lower = n.title.toLowerCase();
    if (!titles.has(lower)) titles.set(lower, n);
    // Only pages and projects hold sub-pages; a page under anything else (a
    // journal day, a card) shows on its own (page/new-page-home.ts).
    const parent = n.parent ? byId.get(n.parent) : undefined;
    const held = parent !== undefined && parent.path !== n.path && HOLDS_PAGES.has(parent.kind);
    if (held) {
      const list = children.get(n.parent!);
      if (list) list.push(n);
      else children.set(n.parent!, [n]);
    }
    if (n.kind === "project") {
      projectList.push(n);
      if (n.project && !projectNote.has(n.project)) projectNote.set(n.project, n);
    }
    if (n.kind === "journal") journal.push(n);
    if (n.path.startsWith("inbox/")) inbox.push(n);
    // Top level: no parent, or one that is not in the vault or holds no pages.
    const top = !held;
    if (top && (n.kind === "page" || n.kind === "card") && n.project) {
      const list = grouped.get(n.project);
      if (list) list.push(n);
      else grouped.set(n.project, [n]);
    }
    if (top && inOtherFolder(n.path)) elsewhere.push(n);
    else if (top && n.kind === "page" && !n.project && !n.path.startsWith("inbox/")) looseAll.push(n);
  }
  for (const list of children.values()) list.sort(byTitle);
  const projectPages = new Map<string, NoteMeta[]>();
  for (const [project, list] of grouped) {
    const own = list.filter((n) => n.path !== projectNote.get(project)?.path).sort(byTitle);
    projectPages.set(project, [...own.filter((n) => n.kind === "page"), ...own.filter((n) => n.kind === "card")]);
  }

  const prev = last;
  return {
    byPath,
    byId,
    titles,
    children: shareMap(prev?.children, children),
    projectPages: shareMap(prev?.projectPages, projectPages),
    projectNote,
    projects: share(prev?.projects, projectList.sort(byTitle)),
    loose: share(prev?.loose, looseAll.sort(byTitle)),
    folders: elsewhere.length === 0 && prev?.folders.count === 0 ? prev.folders : folderTree(elsewhere),
    inbox: share(prev?.inbox, inbox.sort((a, b) => b.modified - a.modified)),
    journal: share(prev?.journal, journal.sort((a, b) => (a.path < b.path ? 1 : a.path > b.path ? -1 : 0))),
    templates: share(prev?.templates, templateList),
    openable: share(prev?.openable, openableList),
  };
}

/** Whether `next` sits where `old` did in every list (only text, icon or
 * dates changed), so the index can be patched instead of rebuilt. */
const sameShape = (old: NoteMeta, next: NoteMeta) =>
  old.path === next.path && old.title === next.title && old.parent === next.parent && old.project === next.project && old.kind === next.kind && old.id === next.id;

function replaced(list: NoteMeta[], old: NoteMeta, next: NoteMeta): NoteMeta[] {
  const at = list.indexOf(old);
  if (at < 0) return list;
  const copy = list.slice();
  copy[at] = next;
  return copy;
}

function replacedIn(map: Map<string, NoteMeta[]>, key: string | null, old: NoteMeta, next: NoteMeta): Map<string, NoteMeta[]> {
  const list = key ? map.get(key) : undefined;
  if (!list || !list.includes(old)) return map;
  return new Map(map).set(key!, replaced(list, old, next));
}

/** The previous index with a few notes swapped for their new versions. A
 * save while typing changes one note; this keeps that under a millisecond
 * where a rebuild sorts every list again. */
function patch(prev: TreeIndex, before: readonly NoteMeta[], notes: readonly NoteMeta[]): TreeIndex | null {
  if (before.length !== notes.length) return null;
  const changed: [NoteMeta, NoteMeta][] = [];
  for (let i = 0; i < notes.length; i++) {
    if (before[i] === notes[i]) continue;
    if (changed.length === MAX_PATCH || !sameShape(before[i]!, notes[i]!)) return null;
    changed.push([before[i]!, notes[i]!]);
  }
  const index = { ...prev, byPath: new Map(prev.byPath) };
  let inboxMoved = false;
  for (const [old, next] of changed) {
    index.byPath.set(next.path, next);
    if (next.id && index.byId.get(next.id) === old) index.byId = new Map(index.byId).set(next.id, next);
    const lower = next.title.toLowerCase();
    if (index.titles.get(lower) === old) index.titles = new Map(index.titles).set(lower, next);
    if (next.project && index.projectNote.get(next.project) === old) index.projectNote = new Map(index.projectNote).set(next.project, next);
    index.children = replacedIn(index.children, next.parent, old, next);
    index.projectPages = replacedIn(index.projectPages, next.project, old, next);
    index.projects = replaced(index.projects, old, next);
    index.loose = replaced(index.loose, old, next);
    if (inOtherFolder(old.path)) index.folders = withNote(index.folders, old, next);
    index.journal = replaced(index.journal, old, next);
    index.templates = replaced(index.templates, old, next);
    index.openable = replaced(index.openable, old, next);
    const inbox = replaced(index.inbox, old, next);
    if (inbox !== index.inbox) {
      index.inbox = inbox;
      inboxMoved ||= old.modified !== next.modified;
    }
  }
  if (inboxMoved) index.inbox = index.inbox.slice().sort((a, b) => b.modified - a.modified);
  return index;
}

/** The index for this notes array, built on first use. */
export function treeOf(notes: readonly NoteMeta[]): TreeIndex {
  let index = cache.get(notes);
  if (!index) {
    index = (last && lastNotes && patch(last, lastNotes, notes)) || build(notes);
    cache.set(notes, index);
    last = index;
    lastNotes = notes;
  }
  return index;
}

export const noteAt = (notes: readonly NoteMeta[], path: string): NoteMeta | undefined => treeOf(notes).byPath.get(path);

/** Notes a person opens: everything but templates. */
export const openable = (notes: readonly NoteMeta[]) => treeOf(notes).openable;

export const templates = (notes: readonly NoteMeta[]) => treeOf(notes).templates;

/** A template's name for the core: its file name without `.md`. */
export const templateName = (note: NoteMeta) => note.path.slice("templates/".length, -".md".length);

export const projects = (notes: readonly NoteMeta[]) => treeOf(notes).projects;

/** Sub-pages of `note`, by the id in their `parent` key. */
export function childrenOf(notes: readonly NoteMeta[], note: NoteMeta): NoteMeta[] {
  if (!note.id) return EMPTY;
  const index = treeOf(notes);
  // Only the note that owns the id has children (ids are unique).
  if (index.byId.get(note.id)?.path !== note.path) return EMPTY;
  return index.children.get(note.id) ?? EMPTY;
}

/** The note at `path` and every sub-page below it, parents first: what
 * goes to the trash with it. */
export function withSubPages(notes: readonly NoteMeta[], path: string): string[] {
  const root = notes.find((n) => n.path === path);
  if (!root) return [path];
  const out = [root];
  for (let i = 0; i < out.length; i++) {
    for (const child of childrenOf(notes, out[i]!)) if (!out.includes(child)) out.push(child);
  }
  return out.map((n) => n.path);
}

/** A project's own pages and cards, sub-pages left to their parents. */
export function projectNotes(notes: readonly NoteMeta[], project: NoteMeta): NoteMeta[] {
  if (!project.project) return EMPTY;
  const list = treeOf(notes).projectPages.get(project.project) ?? EMPTY;
  return list.some((n) => n.path === project.path) ? list.filter((n) => n.path !== project.path) : list;
}

const joined = new WeakMap<NoteMeta[], { extra: NoteMeta[]; rows: NoteMeta[] }>();

/** What nests under a row in the sidebar: a project's pages and cards, or
 * a page's sub-pages. The same array while those lists do not change. */
export function rowsUnder(notes: readonly NoteMeta[], note: NoteMeta): NoteMeta[] {
  const subPages = childrenOf(notes, note);
  if (note.kind !== "project") return subPages;
  const own = projectNotes(notes, note);
  if (subPages.length === 0) return own;
  if (own.length === 0) return subPages;
  const known = joined.get(own);
  if (known?.extra === subPages) return known.rows;
  const rows = [...own, ...subPages];
  joined.set(own, { extra: subPages, rows });
  return rows;
}

/** Pages outside projects, the journal and the inbox. */
export const loosePages = (notes: readonly NoteMeta[]) => treeOf(notes).loose;

/** Notes in folders that are not Kasten's own, by folder. */
export const noteFolders = (notes: readonly NoteMeta[]) => treeOf(notes).folders;

export const inboxCards = (notes: readonly NoteMeta[]) => treeOf(notes).inbox;

export const journalDays = (notes: readonly NoteMeta[]) => treeOf(notes).journal;

export function findByTitle(notes: readonly NoteMeta[], title: string): NoteMeta | undefined {
  return treeOf(notes).titles.get(title.trim().toLowerCase());
}

/** The chain of parents above `note`, outermost first. */
export function ancestors(notes: readonly NoteMeta[], note: NoteMeta): NoteMeta[] {
  const { byId } = treeOf(notes);
  const out: NoteMeta[] = [];
  const seen = new Set<string>([note.path]);
  let current = note;
  while (current.parent) {
    const parent = byId.get(current.parent);
    if (!parent || seen.has(parent.path)) break;
    seen.add(parent.path);
    out.unshift(parent);
    current = parent;
  }
  return out;
}

/** Whether `path` is `root` or sits below it in the sub-page tree. */
export function isWithin(notes: readonly NoteMeta[], path: string, root: NoteMeta): boolean {
  const note = treeOf(notes).byPath.get(path);
  if (!note) return false;
  return note.path === root.path || ancestors(notes, note).some((a) => a.path === root.path);
}

let held: { notes: readonly NoteMeta[]; current: string | undefined; paths: Set<string> } | null = null;

/** Rows that contain the open page and so stay expanded: its parents and
 * its project. Cached for the last notes and page asked about. */
export function holders(notes: readonly NoteMeta[], current: string | undefined): Set<string> {
  if (held && held.notes === notes && held.current === current) return held.paths;
  const paths = new Set<string>();
  const note = current ? treeOf(notes).byPath.get(current) : undefined;
  if (note) {
    for (const a of ancestors(notes, note)) paths.add(a.path);
    const project = note.project ? treeOf(notes).projectNote.get(note.project) : undefined;
    if (project && project.path !== note.path) paths.add(project.path);
  }
  held = { notes, current, paths };
  return paths;
}

const tagCache = new WeakMap<readonly NoteMeta[], { tag: string; count: number }[]>();

/** Every tag in use, most used first, with how many notes carry it. */
export function tagCounts(notes: readonly NoteMeta[]): { tag: string; count: number }[] {
  let counts = tagCache.get(notes);
  if (!counts) {
    const byTag = new Map<string, number>();
    for (const n of notes) if (n.kind !== "template") for (const t of n.tags) byTag.set(t, (byTag.get(t) ?? 0) + 1);
    counts = [...byTag].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    tagCache.set(notes, counts);
  }
  return counts;
}

/** Journal days, projects and templates stay where they are. */
export const movable = (note: NoteMeta) => note.kind === "page" || note.kind === "card";
