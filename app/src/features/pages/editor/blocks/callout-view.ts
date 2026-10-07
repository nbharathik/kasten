// The callout as Notion shows it: an icon that picks the kind, an optional
// title, and the editable body.

import type { Node } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView, NodeView, ViewMutationRecord } from "@milkdown/kit/prose/view";
import { $view } from "@milkdown/kit/utils";

import { el } from "../ui/dom";
import { Popover } from "../ui/popover";
import { calloutKind, calloutSchema, PICKER_KINDS } from "./callout";

class CalloutView implements NodeView {
  readonly dom: HTMLElement;
  readonly contentDOM: HTMLElement;
  private readonly icon: HTMLButtonElement;
  private readonly title: HTMLInputElement;
  private menu: Popover | null = null;
  /** Shows the title field while it is empty, after "Add a title". */
  private titleShown = false;

  constructor(
    private node: Node,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
  ) {
    this.dom = el("div", "kasten-callout");
    this.icon = el("button", "kasten-callout-icon", { type: "button", contentEditable: "false" });
    this.icon.setAttribute("aria-label", "Change callout type");
    this.title = el("input", "kasten-callout-title", { type: "text", spellcheck: true });
    this.title.setAttribute("aria-label", "Callout title");
    this.contentDOM = el("div", "kasten-callout-body");
    const main = el("div", "kasten-callout-main");
    const header = el("div", "kasten-callout-header", { contentEditable: "false" });
    header.append(this.title);
    main.append(header, this.contentDOM);
    this.dom.append(this.icon, main);

    this.icon.addEventListener("mousedown", (event) => {
      event.preventDefault();
      this.pickKind();
    });
    this.title.addEventListener("input", () => this.setAttrs({ title: this.title.value }));
    this.title.addEventListener("blur", () => {
      this.titleShown = false;
      this.render();
    });
    this.title.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === "ArrowDown") {
        event.preventDefault();
        this.focusBody();
      }
    });
    this.render();
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  stopEvent(event: Event): boolean {
    const target = event.target as globalThis.Node | null;
    return !!target && (this.icon.contains(target) || this.title.contains(target));
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    if (mutation.type === "selection") return false;
    return !this.contentDOM.contains(mutation.target);
  }

  destroy(): void {
    this.menu?.close();
  }

  private render(): void {
    const { kind, title } = this.node.attrs as { kind: string; title: string };
    const style = calloutKind(kind);
    this.dom.dataset.callout = kind.toLowerCase();
    this.dom.dataset.tone = style.tone;
    this.dom.classList.toggle("has-title", title !== "" || this.titleShown);
    this.icon.textContent = style.icon;
    this.title.placeholder = style.label;
    if (document.activeElement !== this.title && this.title.value !== title) this.title.value = title;
  }

  private setAttrs(attrs: Record<string, string>): void {
    const pos = this.getPos();
    if (pos === undefined) return;
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...this.node.attrs, ...attrs }));
  }

  private pickKind(): void {
    const current = String(this.node.attrs.kind).toLowerCase();
    const items = PICKER_KINDS.map((kind) => ({
      key: kind,
      label: calloutKind(kind).label,
      icon: calloutKind(kind).icon,
      active: kind === current,
      onPick: () => this.setAttrs({ kind }),
    }));
    const title = String(this.node.attrs.title);
    const titleItem = title
      ? { key: "title", label: "Remove title", icon: "T", onPick: () => this.setAttrs({ title: "" }) }
      : { key: "title", label: "Add a title", icon: "T", onPick: () => this.showTitle() };
    this.menu?.close();
    this.menu = new Popover([{ title: "Callout type", items }, { items: [titleItem] }], {
      anchor: () => this.icon.getBoundingClientRect(),
      ownKeys: true,
      label: "Callout type",
    });
  }

  private showTitle(): void {
    this.titleShown = true;
    this.render();
    this.title.focus();
  }

  private focusBody(): void {
    const pos = this.getPos();
    if (pos === undefined) return;
    const { state } = this.view;
    this.view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(pos + 2))));
    this.view.focus();
  }
}

export const calloutView = $view(calloutSchema.node, () => (node, view, getPos) => new CalloutView(node, view, getPos));
