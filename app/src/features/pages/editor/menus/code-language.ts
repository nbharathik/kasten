// The code block's language picker, in place of Crepe's: its search leaves
// out the language already chosen (typing "rust" in a Rust block finds
// nothing), it has no keyboard and it shows the code through its list. This
// one searches names and aliases, moves with the arrows, picks with Enter and
// stores the short name GitHub and other editors read, such as `rust`.

import { codeBlockConfig } from "@milkdown/kit/component/code-block";
import type { Ctx } from "@milkdown/kit/ctx";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { el } from "../ui/dom";

export interface Language {
  name: string;
  alias: readonly string[];
}

/** The short name a fence keeps: `rust`, `typescript`, `cpp`. */
export function fenceName(language: Language): string {
  const name = language.name.toLowerCase();
  return /^[a-z0-9-]+$/.test(name) ? name : (language.alias[0] ?? name.replace(/\s+/g, "-"));
}

/** Languages matching `query`, best first: an exact name or alias, then
 * names that start with it, then any that contain it. Plain text leads. */
export function rankLanguages(all: readonly Language[], query: string): Language[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...all];
  const score = (language: Language) => {
    const names = [language.name.toLowerCase(), ...language.alias.map((a) => a.toLowerCase())];
    if (names.includes(q)) return 0;
    if (names.some((n) => n.startsWith(q))) return 1;
    if (names.some((n) => n.includes(q))) return 2;
    return 3;
  };
  return all
    .map((language) => ({ language, rank: score(language) }))
    .filter((x) => x.rank < 3)
    .sort((a, b) => a.rank - b.rank || a.language.name.localeCompare(b.language.name))
    .map((x) => x.language);
}

const PLAIN: Language = { name: "Plain text", alias: [] };

class LanguagePicker {
  private readonly box: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly list: HTMLElement;
  private shown: Language[] = [];
  private at = 0;

  constructor(
    private readonly view: EditorView,
    private readonly pos: number,
    private readonly languages: readonly Language[],
    anchor: HTMLElement,
    private readonly onClose: () => void,
  ) {
    this.box = el("div", "kasten-lang-picker");
    this.box.setAttribute("role", "dialog");
    this.box.setAttribute("aria-label", "Code language");
    this.input = el("input", "kasten-lang-search", { type: "text", placeholder: "Search languages" });
    this.input.setAttribute("aria-label", "Search languages");
    this.list = el("div", "kasten-lang-list");
    this.list.setAttribute("role", "listbox");
    this.box.append(this.input, this.list);
    document.body.appendChild(this.box);
    // Below the button, or above it when the window has no room below.
    const rect = anchor.getBoundingClientRect();
    const height = 320;
    const top = rect.bottom + 4 + height <= window.innerHeight ? rect.bottom + 4 : Math.max(8, rect.top - 4 - height);
    Object.assign(this.box.style, { left: `${Math.max(8, Math.min(rect.left, window.innerWidth - 248))}px`, top: `${top}px` });

    this.input.addEventListener("input", () => this.render());
    this.input.addEventListener("keydown", this.onKey);
    document.addEventListener("pointerdown", this.onOutside, true);
    this.render();
    this.input.focus();
  }

  close(): void {
    document.removeEventListener("pointerdown", this.onOutside, true);
    this.box.remove();
    this.onClose();
  }

  private readonly onOutside = (event: PointerEvent) => {
    if (!this.box.contains(event.target as Node)) this.close();
  };

  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      this.at = (this.at + (event.key === "ArrowDown" ? 1 : -1) + this.shown.length) % Math.max(1, this.shown.length);
      this.highlight();
    } else if (event.key === "Enter") {
      event.preventDefault();
      const language = this.shown[this.at];
      if (language) this.pick(language);
    } else if (event.key === "Escape") {
      event.preventDefault();
      this.close();
      this.view.focus();
    }
  };

  private render(): void {
    const current = String(this.view.state.doc.nodeAt(this.pos)?.attrs.language ?? "").toLowerCase();
    const isCurrent = (language: Language) =>
      language === PLAIN ? current === "" : fenceName(language) === current || language.name.toLowerCase() === current || language.alias.includes(current);
    const ranked = rankLanguages([PLAIN, ...this.languages], this.input.value);
    // With nothing typed, the language in use comes first.
    const chosen = this.input.value.trim() ? undefined : ranked.find(isCurrent);
    this.shown = (chosen ? [chosen, ...ranked.filter((l) => l !== chosen)] : ranked).slice(0, 80);
    this.at = 0;
    this.list.replaceChildren(
      ...(this.shown.length
        ? this.shown.map((language, i) => {
            const option = el("div", "kasten-lang-option", { textContent: language.name });
            option.setAttribute("role", "option");
            if (isCurrent(language)) option.dataset.chosen = "true";
            option.addEventListener("mousedown", (event) => {
              event.preventDefault();
              this.pick(language);
            });
            option.addEventListener("mousemove", () => {
              if (this.at === i) return;
              this.at = i;
              this.highlight();
            });
            return option;
          })
        : [el("div", "kasten-lang-empty", { textContent: "No language by that name" })]),
    );
    this.highlight();
  }

  private highlight(): void {
    this.list.querySelectorAll<HTMLElement>(".kasten-lang-option").forEach((option, i) => {
      option.setAttribute("aria-selected", String(i === this.at));
      if (i === this.at) option.scrollIntoView?.({ block: "nearest" });
    });
  }

  private pick(language: Language): void {
    const node = this.view.state.doc.nodeAt(this.pos);
    if (node?.type.name === "code_block") {
      const value = language === PLAIN ? "" : fenceName(language);
      this.view.dispatch(this.view.state.tr.setNodeMarkup(this.pos, undefined, { ...node.attrs, language: value }));
    }
    this.close();
    this.view.focus();
  }
}

/** The code block at a node view's button. */
function codeBlockAt(view: EditorView, button: Element): number | null {
  let found: number | null = null;
  view.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== "code_block") return true;
    if ((view.nodeDOM(pos) as Element | null)?.contains(button)) found = pos;
    return false;
  });
  return found;
}

export const codeLanguagePicker = $prose((ctx: Ctx) => {
  let open: LanguagePicker | null = null;
  return new Plugin({
    key: new PluginKey("kasten-code-language"),
    view: (view) => {
      // Before Crepe's own button handler: the event stops at the editor.
      const onClick = (event: MouseEvent) => {
        const button = (event.target as Element | null)?.closest?.(".milkdown-code-block .language-button");
        if (!button || !view.editable) return;
        event.preventDefault();
        event.stopPropagation();
        if (open) return open.close();
        const pos = codeBlockAt(view, button);
        if (pos === null) return;
        const languages = (ctx.get(codeBlockConfig.key).languages ?? []) as readonly Language[];
        open = new LanguagePicker(view, pos, languages, button as HTMLElement, () => (open = null));
      };
      view.dom.addEventListener("click", onClick, true);
      return {
        destroy: () => {
          view.dom.removeEventListener("click", onClick, true);
          open?.close();
        },
      };
    },
  });
});
