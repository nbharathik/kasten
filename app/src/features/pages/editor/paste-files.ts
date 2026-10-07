// Files pasted or dropped into a page: each is kept in the vault (the page's
// file provider) and linked where it landed. Pictures become image blocks,
// under the line they were pasted on; other files become links in the text.
// A placeholder marks the spot while the files are saved.

import type { Ctx } from "@milkdown/kit/ctx";
import type { Node, ResolvedPos, Schema } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, type EditorState } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

import { isImageFile } from "../../../lib/vault/assets";
import { filesOf, type FileProvider } from "./files";

type Action = { add: { id: object; pos: number } } | { remove: { id: object } };

const key = new PluginKey<DecorationSet>("KASTEN_PASTE_FILES");

/** Whether copied HTML is only a picture, as a browser's "Copy image" makes.
 * Office and web pages also put a picture of the selection next to its
 * HTML; that paste is the text, not the picture. */
export function onlyPicture(html: string): boolean {
  const body = new DOMParser().parseFromString(html, "text/html").body;
  return !body.textContent?.trim() && body.querySelectorAll("img").length === 1 && !body.querySelector("table, video, iframe");
}

/** Where pictures go for a paste at `pos`: above an empty line, below a
 * written one, or at `pos` when blocks cannot go there (a table cell). */
export function pictureSpot(state: EditorState, pos: number): number {
  const block = state.schema.nodes["image-block"];
  const $pos = state.doc.resolve(pos);
  if (!block || fits($pos, block.create())) return pos;
  if (!$pos.parent.isTextblock || $pos.depth < 1) return pos;
  const empty = $pos.parent.content.size === 0;
  const at = empty ? $pos.before() : $pos.after();
  return fits(state.doc.resolve(at), block.create()) ? at : pos;
}

const fits = ($pos: ResolvedPos, node: Node) => $pos.parent.canReplaceWith($pos.index(), $pos.index(), node.type, node.marks);

/** What goes into the page at `$pos` for the saved files: blocks between
 * blocks, inline pictures and links inside text, plain links where neither
 * fits (a code block). */
export function nodesFor(schema: Schema, $pos: ResolvedPos, saved: { file: File; link: string }[]): Node[] {
  const { paragraph, image } = schema.nodes;
  const block = schema.nodes["image-block"];
  const linked = (file: File, link: string) => schema.text(file.name || link, schema.marks.link ? [schema.marks.link.create({ href: link })] : []);
  const between = paragraph ? fits($pos, paragraph.create()) : false;
  const out: Node[] = [];
  for (const { file, link } of saved) {
    if (between) {
      out.push(isImageFile(file) && block ? block.create({ src: link }) : paragraph!.create(null, linked(file, link)));
      continue;
    }
    const picture = isImageFile(file) && image ? image.create({ src: link, alt: file.name.replace(/\.[^.]*$/, "") }) : null;
    const node = [picture, linked(file, link)].find((n) => n && fits($pos, n)) ?? schema.text(link);
    if (out.length) out.push(schema.text(" "));
    out.push(node);
  }
  // Inside text, a space keeps the links apart from the words around them.
  if (!between && out.length) {
    const offset = $pos.parentOffset;
    const before = $pos.parent.textBetween(Math.max(0, offset - 1), offset);
    const after = $pos.parent.textBetween(offset, Math.min($pos.parent.content.size, offset + 1));
    if (before && !/\s/.test(before)) out.unshift(schema.text(" "));
    if (after && !/[\s.,;:!?)]/.test(after)) out.push(schema.text(" "));
  }
  return out;
}

const placeholderAt = (state: EditorState, id: object) => key.getState(state)?.find(undefined, undefined, (spec) => spec.id === id)[0]?.from ?? -1;

/** Keeps `files` and puts them into the page at `pos` once kept. Files that
 * cannot be kept are left out; the provider has said why. */
export function insertFiles(view: EditorView, provider: FileProvider, files: File[], pos: number): Promise<void> {
  const at = files.every(isImageFile) ? pictureSpot(view.state, pos) : pos;
  const id = {};
  view.dispatch(view.state.tr.setMeta(key, { add: { id, pos: at } } satisfies Action));
  const kept = files.map((file) =>
    provider.save(file).then(
      (link) => ({ file, link }),
      () => null,
    ),
  );
  return Promise.all(kept).then((results) => {
    if (view.isDestroyed) return;
    const found = placeholderAt(view.state, id);
    const tr = view.state.tr.setMeta(key, { remove: { id } } satisfies Action);
    const saved = results.filter((r) => r !== null);
    if (found >= 0 && saved.length) tr.insert(found, nodesFor(view.state.schema, view.state.doc.resolve(found), saved));
    view.dispatch(tr);
  });
}

/** Opens the system's file picker; `chosen` gets the files picked, if any. */
export function pickFiles(chosen: (files: File[]) => void): void {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.addEventListener("change", () => {
    const files = Array.from(input.files ?? []);
    if (files.length) chosen(files);
  });
  input.click();
}

function savingWidget(): HTMLElement {
  const note = document.createElement("span");
  note.className = "kasten-saving";
  note.textContent = "Saving the file…";
  return note;
}

export const pasteFiles = $prose(
  (ctx: Ctx) =>
    new Plugin<DecorationSet>({
      key,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, set) {
          const next = set.map(tr.mapping, tr.doc);
          const action = tr.getMeta(key) as Action | undefined;
          if (action && "add" in action) return next.add(tr.doc, [Decoration.widget(action.add.pos, savingWidget, { id: action.add.id })]);
          if (action && "remove" in action) return next.remove(next.find(undefined, undefined, (spec) => spec.id === action.remove.id));
          return next;
        },
      },
      props: {
        decorations: (state) => key.getState(state),
        // DOM handlers run before any plugin's handlePaste, so a pasted
        // picture is kept before the clipboard plugin pastes its HTML.
        handleDOMEvents: {
          paste(view, event) {
            const provider = filesOf(ctx);
            const files = Array.from(event.clipboardData?.files ?? []);
            if (!provider || !files.length || !view.editable) return false;
            const html = event.clipboardData?.getData("text/html") ?? "";
            if (html && !onlyPicture(html)) return false;
            event.preventDefault();
            void insertFiles(view, provider, files, view.state.selection.from);
            return true;
          },
          drop(view, event) {
            const provider = filesOf(ctx);
            const files = Array.from(event.dataTransfer?.files ?? []);
            // A block dragged within the page carries no files.
            if (view.dragging || !provider || !files.length || !view.editable) return false;
            event.preventDefault();
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
            void insertFiles(view, provider, files, pos);
            return true;
          },
        },
      },
    }),
);
