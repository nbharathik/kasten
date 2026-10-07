// A whiteboard shown inside a page: `![[path/board.canvas]]` on a line of
// its own, as Obsidian embeds a canvas. The board is live: after
// a click on it, it pans, zooms and edits as it does in its own tab; a
// click outside hands the page its scrolling and keys back. The window
// draws the board (LinkProvider.mountBoard); the Markdown stays the link.

import "./board-embed.css";

import type { Ctx } from "@milkdown/kit/ctx";

import { findBoard, linksOf, parseWikiTarget } from "../links";
import { el, withGlyph } from "../ui/dom";
import { freshHost } from "./embed-host";

export class BoardEmbed {
  private readonly body: HTMLElement;
  private readonly cover: HTMLElement;
  private readonly title: HTMLElement;
  private mounted: { path: string; unmount: () => void } | null = null;
  private path: string | null = null;
  private readonly outside = (event: PointerEvent) => {
    if (!this.dom.contains(event.target as Node)) this.setActive(false);
  };

  constructor(
    private readonly dom: HTMLElement,
    private readonly ctx: Ctx,
  ) {
    this.title = el("span", "kasten-embed-title");
    const open = el("button", "kasten-board-embed-open", { type: "button", textContent: "Open ↗", title: "Open the whiteboard (Ctrl+click for a new tab)" });
    open.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.path) linksOf(this.ctx).openBoard?.(this.path, event.ctrlKey || event.metaKey || event.button === 1 ? "tab" : event.shiftKey ? "stack" : "here");
    });
    const head = el("span", "kasten-embed-head");
    head.append(withGlyph(el("span", "kasten-embed-icon"), "icon:board", 16), this.title, open);
    this.body = el("div", "kasten-board-embed-body");
    this.cover = el("button", "kasten-board-embed-cover", { type: "button", textContent: "Click to work on the whiteboard" });
    this.cover.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.setActive(true);
    });
    this.dom.replaceChildren(head, this.body, this.cover);
  }

  /** Whether an event belongs to the board, so the page leaves it alone. */
  owns(target: EventTarget | null): boolean {
    return target instanceof Node && (this.body.contains(target) || this.cover.contains(target) || this.dom.querySelector(".kasten-board-embed-open")?.contains(target) === true);
  }

  render(value: string): void {
    const target = parseWikiTarget(value).title;
    const links = linksOf(this.ctx);
    const board = findBoard(links.boards?.() ?? [], target);
    this.title.textContent = board?.title ?? target.replace(/^.*\//, "").replace(/\.canvas$/i, "");
    this.path = board?.path ?? null;
    if (!board || !links.mountBoard) {
      this.unmount();
      this.body.replaceChildren(el("p", "kasten-embed-note", { textContent: board ? "Whiteboards show here in the app." : `No whiteboard “${target}”.` }));
      this.cover.hidden = true;
      return;
    }
    this.cover.hidden = this.dom.dataset.active === "true";
    if (this.mounted?.path === board.path) return;
    this.unmount();
    this.mounted = { path: board.path, unmount: links.mountBoard(freshHost(this.body), board.path) };
  }

  destroy(): void {
    this.setActive(false);
    this.unmount();
  }

  private setActive(active: boolean): void {
    if (active) {
      this.dom.dataset.active = "true";
      this.cover.hidden = true;
      document.addEventListener("pointerdown", this.outside, true);
    } else {
      delete this.dom.dataset.active;
      this.cover.hidden = !this.mounted;
      document.removeEventListener("pointerdown", this.outside, true);
    }
  }

  private unmount(): void {
    const mounted = this.mounted;
    this.mounted = null;
    // The page may be going away inside React's own update: let it finish.
    if (mounted) queueMicrotask(mounted.unmount);
  }
}
