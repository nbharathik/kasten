import { describe, expect, it } from "vitest";

import { type DeckOptions, idsOf, openDeck } from "../filmstrip/test-support.ts";
import type { EditorSession } from "../session/session.ts";
import { commandOf, isEnabled, runCommand } from "./index.ts";

async function setup(options: DeckOptions = {}) {
  const made = await openDeck({ slides: 5, ...options });
  const context = { session: made.session, ui: made.ui };
  const ids = idsOf(made.session);
  return {
    ...made,
    context,
    ids,
    pick: (...places: number[]) => made.session.selectSlides(places.map((place) => ids[place]!)),
    can: (id: string) => isEnabled(commandOf(id), context),
  };
}

/** The sections as [title, the slide each starts at]. */
const sections = (session: EditorSession) => (session.deck.sections ?? []).map((section) => [section.title, section.startsAt]);

describe("the section commands", () => {
  it("add a section at the slide that is picked, called Untitled section, in one step of undo", async () => {
    const t = await setup();
    t.pick(2);
    await runCommand("slide.add-section", t.context);
    expect(sections(t.session)).toEqual([["Untitled section", t.ids[2]]]);
    expect(t.session.state.undoLabel).toBe("add_section");
    t.session.undo();
    expect(sections(t.session)).toEqual([]);
  });

  it("go by the first slide picked in the deck's order", async () => {
    const t = await setup();
    t.pick(3, 1);
    await runCommand("slide.add-section", t.context);
    expect(sections(t.session)).toEqual([["Untitled section", t.ids[1]]]);
  });

  it("offer to add a section only where none starts, and to rename or remove the one the slide is in", async () => {
    const t = await setup({ sections: [{ title: "Method", at: 1 }] });
    const offered = (place: number) => {
      t.pick(place);
      return ["slide.add-section", "slide.rename-section", "slide.remove-section"].map(t.can);
    };
    expect(offered(0), "before the first section: in none").toEqual([true, false, false]);
    expect(offered(1), "where it starts").toEqual([false, true, true]);
    expect(offered(3), "inside it").toEqual([true, true, true]);
  });

  it("do nothing where a section already starts", async () => {
    const t = await setup({ sections: [{ title: "Method", at: 1 }] });
    t.pick(1);
    await runCommand("slide.add-section", t.context);
    expect(sections(t.session)).toEqual([["Method", t.ids[1]]]);
    expect(t.session.slides.addSection(t.ids[1])).toBeUndefined();
    expect(t.session.state.undoLabel).toBeFalsy();
  });

  it("remove the section the slide is in and keep every slide, in one step of undo", async () => {
    const t = await setup({
      sections: [
        { title: "Intro", at: 0 },
        { title: "Method", at: 2 },
      ],
    });
    t.pick(3);
    await runCommand("slide.remove-section", t.context);
    expect(sections(t.session)).toEqual([["Intro", t.ids[0]]]);
    expect(idsOf(t.session)).toEqual(t.ids);
    expect(t.session.state.undoLabel).toBe("remove_section");
    t.session.undo();
    expect(sections(t.session)).toHaveLength(2);
  });

  it("change nothing when a section is renamed to nothing, to the name it has, or where none starts", async () => {
    const t = await setup({ sections: [{ title: "Intro", at: 0 }] });
    t.session.slides.renameSection(t.ids[0]!, "   ");
    t.session.slides.renameSection(t.ids[0]!, "Intro");
    t.session.slides.renameSection(t.ids[1]!, "Elsewhere");
    expect(t.session.state.undoLabel).toBeFalsy();
    t.session.slides.renameSection(t.ids[0]!, " Beginning ");
    expect(sections(t.session)).toEqual([["Beginning", t.ids[0]]]);
    expect(t.session.state.undoLabel).toBe("rename_section");
  });
});
