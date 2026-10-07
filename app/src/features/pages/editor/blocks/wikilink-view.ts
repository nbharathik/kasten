// A `[[link]]` as Notion shows a page mention: the page's icon and title,
// underlined, without brackets. A click opens the page; a link to a page
// that does not exist yet shows greyed and creates it; a link whose title
// several pages share, with nothing to pick one, asks which. A
// link alone on its line, as /page makes for a sub-page, is a page block: a
// full-width row with a hint of the page's text. An embed on a line of its
// own (`![[Title]]`) shows the page itself (embed-view.ts).

import type { Ctx } from "@milkdown/kit/ctx";
import type { Node } from "@milkdown/kit/prose/model";
import { Plugin } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView, type NodeView } from "@milkdown/kit/prose/view";
import { $prose, $view } from "@milkdown/kit/utils";

import { findLink, foundPage, isBoardTarget, isDatabaseTarget, linksOf, parseWikiTarget, retarget, type PageLink } from "../links";
import type { Popover } from "../ui/popover";
import { el, withGlyph } from "../ui/dom";
import { BoardEmbed } from "./board-embed";
import { DatabaseEmbed } from "./database-embed";
import { EmbedCard } from "./embed-view";
import { chooseLink } from "./link-chooser";
import { attachPeek, hidePeekOf } from "./mention-preview";
import { wikiLinkSchema } from "../wikilink";

/** Live mentions, so they can show pages created after they were drawn. */
const views = new Set<WikiLinkView>();

/** Page blocks' hints by title, read once and kept until pages change. */
const hints = new Map<string, string>();

/** Redraws every mention, e.g. after pages were created, renamed or trashed. */
export function refreshMentions(): void {
  hints.clear();
  for (const view of views) view.refresh();
}

/** Links alone on their line, marked so their views draw them as blocks.
 * A mark that comes or goes redraws the view: ProseMirror keeps the view of
 * an unchanged node without asking it, even when text joins it on its line. */
function aloneMarks(doc: Node): DecorationSet {
  const marks: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const only = node.childCount === 1 ? node.firstChild : null;
    if (node.type.name === "paragraph" && only?.type.name === "wiki_link") marks.push(Decoration.node(pos + 1, pos + 1 + only.nodeSize, {}, { alone: true }));
    return false;
  });
  return DecorationSet.create(doc, marks);
}

export const aloneLinks = $prose(
  () =>
    new Plugin({
      state: {
        init: (_, state) => aloneMarks(state.doc),
        apply: (tr, marks) => (tr.docChanged ? aloneMarks(tr.doc) : marks),
      },
      props: {
        decorations(state) {
          return this.getState(state);
        },
      },
    }),
);

const isAlone = (decorations: readonly Decoration[]) => decorations.some((d) => (d.spec as { alone?: boolean }).alone);

/** Whether an event came from an embedded page's header. */
const inHead = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest(".kasten-embed-head"));

class WikiLinkView implements NodeView {
  readonly dom: HTMLElement;
  private card: EmbedCard | null = null;
  private board: BoardEmbed | null = null;
  private database: DatabaseEmbed | null = null;
  private chooser: Popover | null = null;

  constructor(
    private node: Node,
    private readonly ctx: Ctx,
    private aloneOnLine: boolean,
    private readonly view?: EditorView,
    private readonly getPos?: () => number | undefined,
  ) {
    this.dom = el("span", "kasten-mention", { contentEditable: "false" });
    this.dom.addEventListener("mousedown", (event) => {
      // An embedded whiteboard or database takes its own clicks.
      if (this.board?.owns(event.target) || this.database?.owns(event.target)) return;
      // The middle button opens a new tab, as in a browser.
      if (event.button !== 0 && event.button !== 1) return;
      // A page shown in place acts on a click (below): pressing it to select
      // its text or to drag its block opens nothing.
      if (this.card) {
        if (inHead(event.target)) event.preventDefault();
        return;
      }
      event.preventDefault();
      this.follow(event);
    });
    // A page shown in place opens from its header; one not written yet is
    // made from a click anywhere on it, as it says.
    const clicked = (event: MouseEvent) => {
      if (!this.card || (event.button !== 0 && event.button !== 1)) return;
      if (!inHead(event.target) && !this.missing()) return;
      event.preventDefault();
      this.follow(event);
    };
    this.dom.addEventListener("click", clicked);
    this.dom.addEventListener("auxclick", clicked);
    attachPeek(
      this.dom,
      () => parseWikiTarget(String(this.node.attrs.value)).title,
      () => linksOf(this.ctx),
    );
    this.render();
    views.add(this);
  }

  refresh(): void {
    this.render();
  }

  destroy(): void {
    views.delete(this);
    hidePeekOf(this.dom);
    this.chooser?.close();
    this.board?.destroy();
    this.database?.destroy();
  }

  update(node: Node, decorations: readonly Decoration[]): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.aloneOnLine = isAlone(decorations);
    this.render();
    return true;
  }

  stopEvent(event: Event): boolean {
    if (this.board?.owns(event.target) || this.database?.owns(event.target)) return true;
    return event.type === "mousedown" || event.type === "click";
  }

  ignoreMutation(): boolean {
    return true;
  }

  /** Opens the linked page: Ctrl or Cmd for a new tab, Shift for the side
   * stack, Alt for a split. */
  private follow(event: MouseEvent): void {
    const links = linksOf(this.ctx);
    const { title, heading } = parseWikiTarget(String(this.node.attrs.value));
    const how = event.button === 1 || event.ctrlKey || event.metaKey ? "tab" : event.shiftKey ? "stack" : event.altKey ? "split" : "here";
    // `[[#Heading]]` goes to a heading on this page.
    if (!title && heading) return links.open("", how, heading);
    const go = (target: string) => (heading ? links.open(target, how, heading) : links.open(target, how));
    const found = findLink(links, title);
    if (found && "choices" in found) {
      this.chooser?.close();
      const relink = links.linkText && this.view ? (page: PageLink) => this.relink(page) : null;
      this.chooser = chooseLink(this.dom, found.choices, (page) => go(page.path ?? page.title), relink);
      return;
    }
    const page = foundPage(found);
    if (page || !links.create) go(page?.path ?? title);
    else void links.create(title, true);
  }

  /** Whether the link goes to no page yet. */
  private missing(): boolean {
    return findLink(linksOf(this.ctx), parseWikiTarget(String(this.node.attrs.value)).title) === null;
  }

  /** Makes the link name `page`, so it no longer asks. */
  private relink(page: PageLink): void {
    const text = linksOf(this.ctx).linkText?.(page);
    const pos = this.getPos?.();
    if (!text || pos === undefined || !this.view) return;
    const value = retarget(String(this.node.attrs.value), text, page.title);
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, value }));
  }

  /** Whether the link is alone on its line, where an embed shows the page
   * and a plain link is a page block (from `aloneLinks`). */
  private alone(): boolean {
    return this.aloneOnLine;
  }

  /** What the link shows: a whiteboard, a database or a page in place, or a mention. */
  private kind(value: string, embed: boolean): "board" | "database" | "page" | "mention" {
    if (!embed || !this.alone()) return "mention";
    const target = parseWikiTarget(value).title;
    return isBoardTarget(target) ? "board" : isDatabaseTarget(target) ? "database" : "page";
  }

  private render(): void {
    const value = String(this.node.attrs.value);
    const embed = Boolean(this.node.attrs.embed);
    const kind = this.kind(value, embed);
    // Whatever drew the link before goes away when it now shows another way.
    if (kind !== "board" && this.board) {
      this.board.destroy();
      this.board = null;
    }
    if (kind !== "database" && this.database) {
      this.database.destroy();
      this.database = null;
    }
    if (kind !== "page" && this.card) {
      this.card.reset();
      this.card = null;
    }
    if (kind !== "mention") {
      this.dom.className = kind === "board" ? "kasten-embed kasten-board-embed" : kind === "database" ? "kasten-embed kasten-db-embed" : "kasten-embed";
      this.dom.title = "";
      this.dom.dataset.wikiLink = value;
    }
    if (kind === "board") {
      this.board ??= new BoardEmbed(this.dom, this.ctx);
      return this.board.render(value);
    }
    if (kind === "database") {
      this.database ??= new DatabaseEmbed(this.dom, this.ctx);
      return this.database.render(value);
    }
    if (kind === "page") {
      this.card ??= new EmbedCard(this.dom, this.ctx);
      return this.card.render(value);
    }
    const target = parseWikiTarget(value);
    const found = findLink(linksOf(this.ctx), target.title);
    const page = foundPage(found);
    const choices = found && "choices" in found ? found.choices : null;
    const shown = page?.title ?? choices?.[0]?.title ?? target.title;
    const label = target.alias || (target.heading ? `${shown} › ${target.heading}` : shown);
    const block = !embed && this.alone();
    this.dom.className = `kasten-mention${block ? " is-block" : ""}${found ? "" : " is-missing"}${choices ? " is-ambiguous" : ""}${embed ? " is-embed" : ""}`;
    this.dom.title = page ? `Open ${shown}` : choices ? `${choices.length} pages are called ${shown}: click to choose one` : `Create ${target.title}`;
    this.dom.dataset.wikiLink = value;
    const icon = withGlyph(el("span", "kasten-mention-icon"), embed ? "↪" : (page?.icon ?? "icon:page"), block ? 18 : 15);
    const title = el("span", "kasten-mention-title", { textContent: label });
    if (!block) return void this.dom.replaceChildren(icon, title);
    const hint = el("span", "kasten-page-block-hint", { textContent: found ? "" : "A new page. Click to start it" });
    if (page) this.hint(page.path ?? target.title, hint);
    this.dom.replaceChildren(icon, title, hint, withGlyph(el("span", "kasten-page-block-open"), "icon:arrow-up-right", 15));
  }

  /** The start of the page's text, beside its title in a page block. */
  private hint(title: string, into: HTMLElement): void {
    const known = hints.get(title);
    if (known !== undefined) return void (into.textContent = known);
    void linksOf(this.ctx)
      .preview?.(title)
      .then((preview) => {
        const text = (preview?.text ?? "").replace(/\s+/g, " ").trim();
        hints.set(title, text);
        if (into.isConnected) into.textContent = text;
      })
      .catch(() => {});
  }
}

export const wikiLinkView = $view(
  wikiLinkSchema.node,
  (ctx) => (node, view, getPos, decorations) => new WikiLinkView(node, ctx, isAlone(decorations), view, getPos),
);
