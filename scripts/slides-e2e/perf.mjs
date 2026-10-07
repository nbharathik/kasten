// The editor's speed budgets, measured in a real browser: a drag with a hundred elements
// on the slide holds 60 frames a second, a keystroke in a text box is handled well inside
// one frame, and an operation through WebAssembly takes under 2 ms.

import { boxOf } from "./lib.mjs";

const LONG = { timeout: 15000 };

/** Runs `move` while recording the time between animation frames; resolves to how it went. */
async function frames(page, move) {
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const tick = (t) => {
      window.__frames.push(t - last);
      last = t;
      if (window.__on) requestAnimationFrame(tick);
    };
    window.__on = true;
    requestAnimationFrame(tick);
  });
  await move();
  const times = await page.evaluate(() => {
    window.__on = false;
    return window.__frames;
  });
  times.sort((a, b) => a - b);
  const at = (q) => times[Math.min(times.length - 1, Math.floor(times.length * q))];
  return { count: times.length, median: at(0.5), p95: at(0.95), slow: times.filter((t) => t > 25).length };
}

const fmt = (n) => `${n.toFixed(1)} ms`;

export async function run({ browser, base, check }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(base, { waitUntil: "load" });
  await page.waitForSelector("h1");
  await page.fill('input[aria-label="Title of the new deck"]', "Speed");
  await page.click('button:has-text("New deck")');
  await page.waitForFunction(() => window.__ks, null, LONG);

  await page.evaluate(() => {
    const { session } = window.__ks;
    const elements = [];
    for (let i = 0; i < 100; i++) {
      elements.push({ type: "shape", id: `e-p${String(i).padStart(6, "0")}`, shape: "roundRect", x: 20 + (i % 10) * 92, y: 20 + Math.floor(i / 10) * 44, w: 80, h: 36, text: { paragraphs: [{ runs: [{ t: `Box ${i}` }] }], valign: "middle" }, style: { fill: { color: "accent1" } } });
    }
    elements.push({ type: "text", id: "e-typing0", x: 40, y: 340, w: 880, h: 160, text: { paragraphs: Array.from({ length: 5 }, (_, i) => ({ runs: [{ t: `Paragraph ${i} with some words that go on for a while, so that lines wrap.` }] })) } });
    session.elements.insert(elements);
    session.select([]);
  });
  await page.waitForTimeout(600);

  const one = await boxOf(page, "e-p000055");
  const single = await frames(page, async () => {
    await page.mouse.move(one.x + one.width / 2, one.y + one.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 80; i++) {
      await page.mouse.move(one.x + one.width / 2 + i * 3, one.y + one.height / 2 + i, { steps: 1 });
      await page.waitForTimeout(8);
    }
    await page.mouse.up();
  });
  check("dragging one element among a hundred holds 60 frames a second", single.p95 <= 20, `median ${fmt(single.median)}, 95th ${fmt(single.p95)}, ${single.slow} slow of ${single.count}`);

  await page.keyboard.press("Control+a");
  const many = await page.evaluate(() => window.__ks.session.state.selection.length);
  const grab = await boxOf(page, "e-p000011");
  const all = await frames(page, async () => {
    await page.mouse.move(grab.x + grab.width / 2, grab.y + grab.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 80; i++) {
      await page.mouse.move(grab.x + grab.width / 2 - i, grab.y + grab.height / 2 + i, { steps: 1 });
      await page.waitForTimeout(8);
    }
    await page.mouse.up();
  });
  check(`dragging all ${many} selected holds 60 frames a second`, many > 100 && all.p95 <= 20, `median ${fmt(all.median)}, 95th ${fmt(all.p95)}, ${all.slow} slow of ${all.count}`);
  await page.evaluate(() => window.__ks.session.select([]));

  const typing = await boxOf(page, "e-typing0");
  await page.mouse.dblclick(typing.x + 60, typing.y + 30);
  await page.waitForFunction(() => window.__ks.session.state.editing !== null, null, LONG);
  await page.evaluate(() => {
    window.__work = [];
    // From the key going down to the words being in the editor: what the page itself spends on a key.
    let started = 0;
    document.addEventListener("keydown", () => (started = performance.now()), true);
    document.addEventListener("input", () => window.__work.push(performance.now() - started), true);
  });
  for (const ch of "The quick brown fox jumps over the lazy dog") {
    await page.keyboard.type(ch);
    await page.waitForTimeout(30);
  }
  const work = (await page.evaluate(() => window.__work)).sort((a, b) => a - b);
  const p95 = work[Math.floor(work.length * 0.95)] ?? Infinity;
  check("a keystroke is handled well inside one frame", work.length >= 40 && p95 < 16, `${work.length} keys, 95th ${fmt(p95)}, worst ${fmt(work[work.length - 1] ?? 0)}`);
  await page.keyboard.press("Escape");

  const ops = await page.evaluate(() => {
    const { session } = window.__ks;
    const slide = session.slide.id;
    const times = [];
    for (let i = 0; i < 200; i++) {
      const t = performance.now();
      session.core.apply("set_notes", { slide, notes: `note ${i}` });
      times.push(performance.now() - t);
    }
    return times.sort((a, b) => a - b);
  });
  const opP95 = ops[Math.floor(ops.length * 0.95)];
  check("an operation through WebAssembly takes under 2 ms", opP95 < 2, `95th ${fmt(opP95)} over ${ops.length} operations`);
  await page.close();
}
