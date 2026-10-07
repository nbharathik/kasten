// What the present-mode scenarios share: a sample deck opened in the browser, and a talk built on it that
// uses everything present mode does (steps, a morph pair, backup and hidden slides, embeds, a video, a picture).
// Pictures and the clip are made in the page, so nothing here needs a program or a fixture.

/** Opens the sample deck of `slides dev` in a new page of `context`, and waits for the editor. */
export async function openSample(context, base, query = "?deck=demo") {
  const page = await context.newPage();
  const logs = [];
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0, 400)}`);
  });
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message.slice(0, 300)}`));
  await page.goto(`${base}/${query}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__ks, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  return { page, logs };
}

/** What a page logs that is not the point of a check: the still of an embed that cannot load, and the like. */
export const noise = (line) => /favicon|59999|sandbox|ERR_CONNECTION_REFUSED|Failed to load resource/.test(line);

/**
 * Builds the talk on the sample deck (four slides: title, bullets, diagram, columns).
 * Resolves to the ids of the slides by name and the order of all of them.
 */
export function buildTalk(page, base) {
  return page.evaluate(async (base) => {
    const { session, host } = window.__ks;
    const core = session.core;
    const apply = (name, input) => core.apply(name, input);
    const deck = () => core.deck;
    const [title, bullets, diagram, columns] = deck().slides.map((s) => s.id);
    const ids = { title, bullets, diagram, columns };

    // The bullet slide: each paragraph appears at its own step.
    const body = deck().slides.find((s) => s.id === bullets).elements.find((e) => e.placeholder === "body");
    const paragraphs = body.text.paragraphs.map((p, i) => ({ ...p, step: i + 1 }));
    apply("set_rich_text", { slide: bullets, id: body.id, text: { ...body.text, paragraphs } });
    apply("set_slide_steps", { slide: bullets, steps: paragraphs.length });

    // The diagram: the parts come in one by one.
    const parts = deck().slides.find((s) => s.id === diagram).elements.filter((e) => e.type === "shape");
    parts.slice(1).forEach((el, i) => apply("set_step_states", { slide: diagram, id: el.id, states: { 0: "hidden", [i + 1]: "normal" } }));
    apply("set_slide_steps", { slide: diagram, steps: 3 });

    const add = (layout) => apply("add_slide", { layout }).output.slide;
    const shape = (id, kind, x, y, w, h, words, fill, extra = {}) => ({
      type: "shape", id, shape: kind, x, y, w, h,
      style: { fill: { color: fill }, stroke: { color: "text1", width: 1, alpha: 0.25 } },
      text: { paragraphs: [{ runs: [{ t: words, color: "bg1", b: true }], align: "center" }], valign: "middle" },
      ...extra,
    });
    const words = (id, x, y, w, h, t, size = 28) => ({ type: "text", id, x, y, w, h, text: { paragraphs: [{ runs: [{ t, size }] }] } });

    // A morph pair: the same ids on two slides, moved, resized, turned and recoloured.
    const morphA = add("blank");
    apply("add_elements", { slide: morphA, elements: [
      words("m-title", 60, 30, 840, 60, "Morph: before", 36),
      shape("m-card", "roundRect", 80, 140, 300, 160, "Alpha", "accent1"),
      shape("m-dot", "ellipse", 640, 120, 90, 90, "", "accent2"),
      shape("m-bar", "rect", 80, 420, 200, 30, "", "accent4"),
      shape("m-gone", "roundRect", 640, 380, 240, 80, "Only here", "accent5"),
    ] });
    const morphB = add("blank");
    apply("add_elements", { slide: morphB, elements: [
      words("m-title", 60, 30, 840, 60, "Morph: after", 36),
      shape("m-card", "roundRect", 480, 250, 420, 200, "Omega", "accent3", { rotation: 12 }),
      shape("m-dot", "ellipse", 100, 110, 200, 200, "", "accent6"),
      shape("m-bar", "rect", 80, 420, 520, 30, "", "accent4"),
      shape("m-new", "roundRect", 620, 110, 260, 80, "Only there", "accent5"),
    ] });
    apply("set_transition", { ids: [morphB], transition: { kind: "morph", duration: 0.8 } });
    apply("set_notes", { slide: morphA, notes: "**Before**: the card sits at the left.\n\n- Say what Morph does\n- Then press right" });
    apply("set_notes", { slide: morphB, notes: "*After*: everything moved. See [the docs](https://example.com/docs)." });
    Object.assign(ids, { morphA, morphB });

    // Two backup slides under the columns slide, and a hidden one at the end.
    const b1 = add("title-body");
    const b2 = add("title-body");
    apply("set_slide_flags", { ids: [b1, b2], backup: true });
    for (const [id, t] of [[b1, "Backup one"], [b2, "Backup two"]]) {
      const el = deck().slides.find((s) => s.id === id).elements.find((e) => e.placeholder === "title");
      if (el) apply("set_rich_text", { slide: id, id: el.id, text: { paragraphs: [{ runs: [{ t }] }] } });
    }
    apply("move_slides", { ids: [b1, b2], to: 4 });
    const hidden = add("title-only");
    apply("set_slide_flags", { ids: [hidden], hidden: true });
    Object.assign(ids, { b1, b2, hidden });

    // A picture and a clip, made here: a canvas gives the picture, a recorder gives a short WebM.
    const canvas = (color, label, w, h) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d");
      g.fillStyle = color;
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#fff";
      g.font = "48px sans-serif";
      g.textAlign = "center";
      g.fillText(label, w / 2, h / 2);
      return c;
    };
    const png = async (color, label, w, h) => new Uint8Array(await (await new Promise((r) => canvas(color, label, w, h).toBlob(r, "image/png"))).arrayBuffer());
    const clip = async () => {
      const c = canvas("#a33", "clip", 320, 180);
      const recorder = new MediaRecorder(c.captureStream(15), { mimeType: "video/webm" });
      const chunks = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      const done = new Promise((r) => (recorder.onstop = r));
      recorder.start(100);
      for (let i = 0; i < 12; i++) {
        c.getContext("2d").fillRect(i * 20, 150, 20, 20);
        await new Promise((r) => setTimeout(r, 90));
      }
      recorder.stop();
      await done;
      return new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer());
    };
    const posterPath = await host.addImage("poster.png", await png("#3b6", "poster", 640, 360));
    const photoPath = await host.addImage("photo.png", await png("#36b", "a picture", 800, 450));
    const clipPath = await host.addImage("clip.webm", await clip());

    const embeds = add("blank");
    apply("add_elements", { slide: embeds, elements: [
      words("live-title", 60, 20, 840, 50, "Embeds", 32),
      { type: "embed", id: "live", x: 60, y: 90, w: 400, h: 380, url: `${base.replace("127.0.0.1", "localhost")}/?deck=empty`, poster: posterPath, title: "The dev page" },
      { type: "embed", id: "dead", x: 500, y: 90, w: 400, h: 380, url: "http://127.0.0.1:59999/", poster: posterPath, title: "Nothing here" },
    ] });
    const video = add("blank");
    apply("add_elements", { slide: video, elements: [
      words("video-title", 60, 20, 840, 50, "A video", 32),
      { type: "video", id: "clip", x: 200, y: 90, w: 560, h: 380, src: clipPath, poster: posterPath },
    ] });
    const picture = add("blank");
    apply("add_elements", { slide: picture, elements: [
      words("pic-title", 60, 20, 840, 50, "A picture: click it", 32),
      { type: "image", id: "photo", x: 180, y: 90, w: 600, h: 337, src: photoPath, alt: "A blue placeholder" },
    ] });
    Object.assign(ids, { embeds, video, picture });
    return { ids, order: deck().slides.map((s) => s.id) };
  }, base);
}

/** The number a slide has in the talk (hidden slides are skipped, backups are counted), from 1. */
export const numberOf = (talk, id) => talk.order.filter((s) => s !== talk.ids.hidden).indexOf(id) + 1;

/** The slides a person meets going right from the start: not the hidden one, not the backups. */
export const mainLine = (talk) => talk.order.filter((s) => s !== talk.ids.hidden && s !== talk.ids.b1 && s !== talk.ids.b2);

/** Where the talk is now, as the page can tell: the slide, the step (reveal's fragment), and the layer shown. */
export const where = (page) =>
  page.evaluate(() => {
    const el = document.querySelector(".reveal");
    const now = document.querySelector(".slides section.present:not(.stack)");
    return {
      slide: now?.getAttribute("data-slide") ?? null,
      fragment: now?.getAttribute("data-fragment") ?? null,
      layer: now?.querySelector(":scope > .ks-show-layer:not([hidden])")?.getAttribute("data-step") ?? null,
      classes: el?.className ?? "",
    };
  });

/** Types the number of a slide and Enter, and waits for the talk to get there. */
export async function jumpTo(page, talk, id, wait = 600) {
  for (const ch of String(numberOf(talk, id))) await page.keyboard.press(ch);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(wait);
}

/** The screen box of an element on the slide that is showing: [x, y, w, h], rounded. */
export const boxOfShown = (page, id) =>
  page.evaluate((id) => {
    const e = document.querySelector(`.slides section.present [data-id="${id}"]`);
    const b = e?.getBoundingClientRect();
    return b ? [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] : null;
  }, id);

/** Starts the show from the first slide and waits until reveal is ready. */
export async function startShow(page, options) {
  await page.evaluate((options) => window.__ks.ui.actions.present("start", options), options);
  await page.waitForSelector(".ks-show .reveal.ready");
  await page.waitForTimeout(700);
}
