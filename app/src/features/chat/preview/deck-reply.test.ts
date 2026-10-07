// The preview's chat about a slide: the scripted steps, the real change, its marks, and its undo.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { loadSlides } from "@kasten-slides/wasm";
import { beforeAll, describe, expect, it } from "vitest";

import { MemoryVault } from "../../workspace/preview/memory-vault";
import type { ChatEvent, ContextChip } from "../types";
import { plan, read, tighten } from "./deck-edit";
import { slideAsk } from "./deck-reply";
import { PREVIEW_PROVIDER, previewChat } from "./fake-chat";

const ROOT = join(import.meta.dirname, "../../../../..");
const TITLE = "Tool use in language models";
/** The slide "Why tools?", its body, and the line of the body that is long. */
const SLIDE = "s-0kr3m6c6";
const BODY = "e-1gvxp8ih";
const TITLE_BOX = "e-zlrv9qx1";

beforeAll(async () => {
  await loadSlides(await readFile(join(ROOT, "packages/slides-wasm/pkg/slides_wasm_bg.wasm")));
});

async function open() {
  const text = await readFile(join(ROOT, "fixtures/dev-vault/library/tool-use-in-language-models.deck"), "utf8");
  const vault = new MemoryVault({});
  const path = await vault.createDeck(TITLE, null, text);
  return { vault, path, text };
}

function chip(path: string, ...elements: string[]): ContextChip {
  return { kind: "slide", label: "Slide 2: Why tools?", ref: [path, SLIDE, ...elements] };
}

/** Sends `text` about the slide and collects the turn's events until it ends. */
async function ask(vault: MemoryVault, context: ContextChip[], text: string) {
  const chat = previewChat(() => vault, { pace: 0 });
  const events: ChatEvent[] = [];
  let ended!: () => void;
  const done = new Promise<void>((resolve) => (ended = resolve));
  chat.onEvent((event) => {
    events.push(event);
    if (event.kind === "done" || event.kind === "error") ended();
  });
  const turn = await chat.send({ chat: "c1", provider: PREVIEW_PROVIDER.name, model: "canned-replies", text, context });
  await done;
  return { events, session: turn.session };
}

const tools = (events: ChatEvent[]) => events.filter((e) => e.kind === "tool").map((e) => e.tool!.name);
const results = (events: ChatEvent[]) => events.filter((e) => e.kind === "toolResult").map((e) => e.result!);
const said = (events: ChatEvent[]) => events.map((e) => e.text ?? "").join("");

describe("shortening a line", () => {
  it("takes out filler, keeps the first clause of a long line and leaves short lines as they are", () => {
    expect(tighten("The model asks; the host runs it; the answer comes back")).toBe("The model asks");
    expect(tighten("This is really just a very simple idea.")).toBe("This is a simple idea");
    expect(tighten("Use a lot of tools in order to help")).toBe("Use many tools to help");
    expect(tighten("Search, code, files, calendars")).toBe("Search, code, files, calendars");
    expect(tighten("Models know what they were trained on")).toBe("Models know what they were trained on");
    expect(tighten("")).toBe("");
  });

  it("reads the slide chip of a message", () => {
    expect(slideAsk([{ kind: "note", label: "A", ref: ["a.md"] }, chip("library/talk.deck", "e1", "e2")])).toEqual({ deck: "library/talk.deck", slide: SLIDE, elements: ["e1", "e2"] });
    expect(slideAsk([{ kind: "deck", label: "Talk", ref: ["library/talk.deck"] }])).toBeNull();
    expect(slideAsk([])).toBeNull();
  });
});

describe("what would change on a slide", () => {
  it("is the selected elements' long lines, or the body's without a selection", async () => {
    const { text } = await open();
    const deck = await read(text);
    const selected = plan(deck, SLIDE, [BODY])!;
    expect(selected).toMatchObject({ number: 2, title: "Why tools?", lines: 1 });
    expect(selected.patches.map((p) => p.id)).toEqual([BODY]);
    expect(plan(deck, SLIDE, [])).toMatchObject({ lines: 1 });
    expect(plan(deck, SLIDE, [TITLE_BOX])).toMatchObject({ lines: 0, patches: [] });
    expect(plan(deck, "s-nope", [])).toBeNull();
  });
});

describe("the preview's chat about a slide", () => {
  it("reads it, shortens the selected line for real, marks it as its own and keeps it in the chat's session", async () => {
    const { vault, path, text } = await open();
    const { events, session } = await ask(vault, [chip(path, BODY)], "Tighten the words on this slide");
    expect(tools(events)).toEqual(["get_slide", "update_elements", "lint_deck"]);
    const [readOne, changed, checked] = results(events);
    expect(readOne).toMatchObject({ ok: true, summary: `Read slide 2 of “${TITLE}”`, paths: [] });
    expect(changed!.ok).toBe(true);
    expect(changed!.summary).toMatch(new RegExp(`^Changed “${TITLE}” · lint: \\d+ errors?, \\d+ warnings?$`));
    expect(changed!.paths).toEqual([path]);
    expect(checked!.summary).toMatch(new RegExp(`^Checked “${TITLE}”: \\d+ errors?, \\d+ warnings?$`));
    expect(said(events)).toContain("browser preview");
    expect(said(events)).toContain("shortened 1 line on slide 2");
    expect(events.at(-1)).toMatchObject({ kind: "done" });
    expect(events.at(-1)!.stopped).toBeUndefined();

    // The deck: the line is shorter, and the slide says whose work it is.
    const saved = JSON.parse((await vault.deck(path)).text);
    const slide = saved.slides.find((s: { id: string }) => s.id === SLIDE);
    const lines = slide.elements.find((e: { id: string }) => e.id === BODY).text.paragraphs.map((p: { runs: { t: string }[] }) => p.runs.map((r) => r.t).join(""));
    expect(lines).toEqual(["Models know what they were trained on", "A tool reaches what they cannot know", "Search, code, files, calendars", "Each call is one turn of a conversation", "The model asks"]);
    expect(slide["x-agent"]).toEqual([{ at: expect.any(Number), by: "chat", ids: [BODY], session }]);
    // The other slides are not touched.
    expect(JSON.stringify(saved.slides.filter((s: { id: string }) => s.id !== SLIDE))).toEqual(JSON.stringify(JSON.parse(text).slides.filter((s: { id: string }) => s.id !== SLIDE)));

    // One session of the chat's, which an undo takes back whole.
    const [info] = await vault.sessions();
    expect(info).toMatchObject({ id: session, client: "chat", commits: 1 });
    expect(await vault.undoSession(session)).toMatchObject({ conflict: null });
    expect((await vault.deck(path)).text).toBe(text);
  });

  it("changes the body's lines when nothing is selected, and says when the words are short already", async () => {
    const { vault, path } = await open();
    const whole = await ask(vault, [chip(path)], "Tighten this");
    expect(tools(whole.events)).toEqual(["get_slide", "update_elements", "lint_deck"]);
    const short = await ask(vault, [chip(path, TITLE_BOX)], "Make it shorter");
    expect(tools(short.events)).toEqual(["get_slide"]);
    expect(said(short.events)).toContain("already short: I changed nothing");
  });

  it("checks the deck when asked to, and changes nothing", async () => {
    const { vault, path, text } = await open();
    const { events } = await ask(vault, [chip(path, BODY)], "Check the deck and fix what lint reports");
    expect(tools(events)).toEqual(["get_slide", "lint_deck"]);
    expect((await vault.deck(path)).text).toBe(text);
    expect(await vault.sessions()).toEqual([]);
  });

  it("shows the change that waits for review as a waiting call, and changes nothing", async () => {
    const { vault, path, text } = await open();
    const { events } = await ask(vault, [chip(path, BODY)], "Remove all the other slides");
    expect(tools(events)).toEqual(["get_slide", "delete_slides"]);
    const waiting = results(events)[1]!;
    expect(waiting).toMatchObject({ ok: true, paths: [] });
    expect(waiting.summary).toBe(`Waiting for review: delete slides from “${TITLE}” (it takes out 5 slides; more than 3 in 10 minutes waits for you)`);
    expect((await vault.deck(path)).text).toBe(text);
    expect(await vault.sessions()).toEqual([]);
  });

  it("says so when the deck is not there", async () => {
    const { vault } = await open();
    const { events } = await ask(vault, [chip("library/gone.deck", BODY)], "Tighten this");
    expect(results(events)[0]).toMatchObject({ ok: false });
    expect(results(events)[0]!.summary).toContain("Could not read slide");
    expect(events.at(-1)).toMatchObject({ kind: "done" });
  });
});
