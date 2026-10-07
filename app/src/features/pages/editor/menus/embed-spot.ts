// Where an embed goes while its whiteboard or database is made. The spot
// moves with the edits made around it meanwhile, so the embed lands where it
// was asked for, and shows a quiet note until then.

import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

type Action = { add: { id: object; pos: number; label: string } } | { remove: object };

const key = new PluginKey<DecorationSet>("KASTEN_EMBED_SPOT");

/** Marks `pos`, showing `label` there; returns what finds the spot again. */
export function markSpot(view: EditorView, pos: number, label: string): object {
  const id = {};
  view.dispatch(view.state.tr.setMeta(key, { add: { id, pos, label } } satisfies Action));
  return id;
}

/** Where the spot is now, taking its mark away: -1 when the text around it
 * was deleted, or the page has closed. */
export function takeSpot(view: EditorView, id: object): number {
  if (view.isDestroyed) return -1;
  const pos = key.getState(view.state)?.find(undefined, undefined, (spec) => spec.id === id)[0]?.from ?? -1;
  view.dispatch(view.state.tr.setMeta(key, { remove: id } satisfies Action));
  return pos;
}

function note(label: string): HTMLElement {
  const el = document.createElement("span");
  el.className = "kasten-saving";
  el.textContent = label;
  return el;
}

export const embedSpots = $prose(
  () =>
    new Plugin<DecorationSet>({
      key,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, set) {
          const next = set.map(tr.mapping, tr.doc);
          const action = tr.getMeta(key) as Action | undefined;
          if (action && "add" in action) {
            const { id, pos, label } = action.add;
            return next.add(tr.doc, [Decoration.widget(pos, () => note(label), { id })]);
          }
          if (action && "remove" in action) return next.remove(next.find(undefined, undefined, (spec) => spec.id === action.remove));
          return next;
        },
      },
      props: { decorations: (state) => key.getState(state) },
    }),
);
