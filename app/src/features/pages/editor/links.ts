// What the editor knows about the pages around it: titles and icons for
// `[[links]]`, and how to open or create one. The page view provides it; the
// editor alone (and its tests) gets an empty workspace.

import type { Ctx } from "@milkdown/kit/ctx";
import { $ctx } from "@milkdown/kit/utils";

import type { TagViewKind } from "../../../lib/vault/types";

export interface PageLink {
  title: string;
  icon?: string;
  /** Its vault path, which a link names when other pages share its title. */
  path?: string;
  /** Where it lives, set when other pages share its title. */
  where?: string;
}

/** Where a followed link opens: here, a new tab, a split, the side stack,
 * or a peek. The editor asks for the first four, from the click's keys; a
 * page shown in a peek or a quick-glance card sends a plain click on. */
export type LinkHow = "here" | "tab" | "split" | "stack" | "peek";

/** Where a link goes: a page, pages to choose from, or none. */
export type LinkFound = { page: PageLink } | { choices: PageLink[] } | null;

export interface LinkProvider {
  /** Every page a link can point at, in the order the menu offers them. */
  pages(): PageLink[];
  /** Where a link to `target` (a title or a path) goes from this page.
   * Without it, the first page with that title. */
  find?(target: string): LinkFound;
  /** A link's text for `page` from this page: its title, or `path|Title`
   * when the title alone would not find it. */
  linkText?(page: PageLink): string;
  /** Follows a link to `target` (a title or a path); `how` says where (a
   * new tab, a split, the side stack), from the click's modifier keys;
   * with `heading`, to that heading. An empty target is this page. */
  open(target: string, how?: LinkHow, heading?: string): void;
  /** The headings of `page`, for `[[Title#`: null while they are read,
   * and `then` is called once they are. */
  headings?(page: PageLink, then: () => void): readonly string[] | null;
  /** Creates a page called `title`, and opens it when `open` is set;
   * resolves to the page, or null when it was not made. */
  create?(title: string, open?: boolean): Promise<PageLink | null> | void;
  /** The start of a page, for the card shown while hovering a link. */
  preview?(target: string): Promise<PagePreview | null>;
  /** Follows a Markdown link to a vault file, such as a PDF at a page
   * (`../sources/x.pdf#page=3`), `href` as written in the page; false when
   * it is no file the workspace opens. */
  openFile?(href: string, how?: LinkHow): boolean;
  /** A page to show inside this one (`![[Title]]`): null when there is none.
   * `stamp` changes when the page does, so an embed reloads only then. */
  embed?(target: string): EmbedSource | null;
  /** Whiteboards a page can show (`![[path/board.canvas]]`), newest first. */
  boards?(): BoardLink[];
  /** Makes a whiteboard called `title` beside this page (in its project);
   * resolves to its path, or null when it was refused. */
  createBoard?(title: string): Promise<string | null>;
  /** Draws the whiteboard at `path` into `host`, live, and returns how to
   * take it away again. */
  mountBoard?(host: HTMLElement, path: string): () => void;
  /** Opens the whiteboard at `path`. */
  openBoard?(path: string, how?: LinkHow): void;
  /** Tag databases a page can show (`![[tags/paper.yaml]]`). */
  databases?(): DatabaseLink[];
  /** Draws the tag database `tag` into `host`, on its view called `view`
   * (else its first), live; returns how to take it away. */
  mountDatabase?(host: HTMLElement, tag: string, view: string): () => void;
  /** Opens the tag database `tag`. */
  openDatabase?(tag: string, how?: LinkHow): void;
  /** Makes a tag database from a typed name, its first view a `view`;
   * resolves to its YAML path and that view's name, or null. */
  createDatabase?(name: string, view: TagViewKind): Promise<{ path: string; view: string } | null>;
  /** The name of `tag`'s first view of kind `view`, one added when it has
   * none; null when that was refused. */
  viewOf?(tag: string, view: TagViewKind): Promise<string | null>;
}

export interface DatabaseLink {
  /** The tag, as its schema names it. */
  tag: string;
  /** Its YAML file, such as `tags/paper.yaml`. */
  path: string;
  /** How many notes carry it. */
  count: number;
}

/** A tag from a database's typed name: "Reading list" is `reading-list`. */
export function tagFrom(name: string): string | null {
  const tag = name
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_\-/]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return tag || null;
}

/** Whether a link names a tag database: a YAML file under `tags/`. */
export const isDatabaseTarget = (target: string) => /^tags\/[^/]+\.ya?ml$/i.test(target.trim());

/** The database a link names, by its file (or its tag, from the file's name). */
export function findDatabase(databases: readonly DatabaseLink[], target: string): DatabaseLink | undefined {
  const wanted = target.trim().toLowerCase();
  const stem = wanted.replace(/^tags\//, "").replace(/\.ya?ml$/, "");
  return databases.find((d) => d.path.toLowerCase() === wanted) ?? databases.find((d) => d.tag.toLowerCase() === stem);
}

export interface BoardLink {
  path: string;
  title: string;
  /** Where it lives, such as its project. */
  hint?: string;
}

/** Whether a link names a whiteboard: its target is a `.canvas` file. */
export const isBoardTarget = (target: string) => /\.canvas$/i.test(target.trim());

/** The board a link names: by its path, else its file name, else its title. */
export function findBoard(boards: readonly BoardLink[], target: string): BoardLink | undefined {
  const wanted = target.trim();
  const lower = wanted.toLowerCase();
  const title = lower.replace(/\.canvas$/, "");
  return (
    boards.find((b) => b.path === wanted) ??
    boards.find((b) => b.path.toLowerCase().endsWith(`/${lower}`) || b.path.toLowerCase() === lower) ??
    boards.find((b) => b.title.toLowerCase() === title)
  );
}

export interface EmbedSource {
  stamp: string;
  load(): Promise<EmbeddedPage>;
}

export interface EmbeddedPage {
  title: string;
  icon?: string;
  /** The page's body: Markdown without its frontmatter. */
  markdown: string;
  /** Where the window loads a picture the page links to, as written in it. */
  url(src: string): string;
}

export interface PagePreview {
  title: string;
  icon?: string;
  /** A few lines of the page as plain text. */
  text: string;
}

export const NO_LINKS: LinkProvider = { pages: () => [], open: () => {} };

export const linkProviderCtx = $ctx<LinkProvider, "kastenLinks">(NO_LINKS, "kastenLinks");

/** The editor's link provider; none while the editor is being torn down. */
export function linksOf(ctx: Ctx): LinkProvider {
  try {
    return ctx.get(linkProviderCtx.key);
  } catch {
    return NO_LINKS;
  }
}

export interface WikiTarget {
  /** The page title the link points at. */
  title: string;
  heading: string;
  alias: string;
}

/** Splits `Title#Heading|alias` into its parts. */
export function parseWikiTarget(value: string): WikiTarget {
  const bar = value.indexOf("|");
  const target = bar < 0 ? value : value.slice(0, bar);
  const alias = bar < 0 ? "" : value.slice(bar + 1);
  const hash = target.indexOf("#");
  return {
    title: (hash < 0 ? target : target.slice(0, hash)).trim(),
    heading: hash < 0 ? "" : target.slice(hash + 1).trim(),
    alias: alias.trim(),
  };
}

/** The page a title names, ignoring case, or undefined. */
export function findPage(pages: PageLink[], title: string): PageLink | undefined {
  const wanted = title.trim().toLowerCase();
  return pages.find((page) => page.title.trim().toLowerCase() === wanted);
}

/** Where a link to `target` goes, as the provider says, else the first
 * page with that title. */
export function findLink(links: LinkProvider, target: string): LinkFound {
  if (links.find) return links.find(target);
  const page = findPage(links.pages(), target);
  return page ? { page } : null;
}

/** The one page a link goes to, if it goes to one. */
export const foundPage = (found: LinkFound): PageLink | undefined => (found && "page" in found ? found.page : undefined);

/** A link's value with its target made `text` (`Title` or `path|Title`),
 * keeping its heading, and its alias unless that only repeated a title. */
export function retarget(value: string, text: string, oldTitle?: string): string {
  const was = parseWikiTarget(value);
  const bar = text.indexOf("|");
  const target = bar < 0 ? text : text.slice(0, bar);
  const shown = bar < 0 ? "" : text.slice(bar + 1);
  const ownAlias = was.alias && was.alias.toLowerCase() !== (oldTitle ?? was.title).trim().toLowerCase() ? was.alias : "";
  const alias = ownAlias || shown;
  return `${target}${was.heading ? `#${was.heading}` : ""}${alias ? `|${alias}` : ""}`;
}
