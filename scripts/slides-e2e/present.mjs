// Present mode as an audience meets it, on a talk that uses everything: keys, steps, a morph between two
// slides, backup and hidden slides, the overview, the black screen, the laser, a picture opened large,
// live embeds and a video; and the speed of a step and of a morph with forty elements moving.

import { join } from "node:path";

import { boxOfShown, buildTalk, jumpTo, mainLine, noise, numberOf, openSample, startShow, where } from "./present-kit.mjs";

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const at = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
  return { n: s.length, p50: at(0.5), p95: at(0.95), max: s[s.length - 1] ?? 0 };
};
const fmt = (s) => `n=${s.n} p50 ${s.p50.toFixed(1)} p95 ${s.p95.toFixed(1)} max ${s.max.toFixed(1)} ms`;

export async function run({ browser, base, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const { page, logs } = await openSample(context, base);
  const talk = await buildTalk(page, base);
  const { ids, order } = talk;
  const names = Object.fromEntries(Object.entries(ids).map(([k, v]) => [v, k]));
  const press = async (key, wait = 250) => {
    await page.keyboard.press(key);
    await page.waitForTimeout(wait);
  };
  const cur = async () => (await where(page)).slide;
  const has = (cls) => page.evaluate((cls) => document.querySelector(".reveal").classList.contains(cls), cls);
  const shot = (name) => page.screenshot({ path: join(shots, `present-${name}.png`) });
  const step = async (name, fn) => {
    try {
      await fn();
    } catch (error) {
      check(name, false, error instanceof Error ? error.message.split("\n")[0] : String(error));
      await shot(`failed-${name.replace(/\W+/g, "-")}`).catch(() => {});
    }
  };
  const main = mainLine(talk);

  await step("starts the show", async () => {
    await startShow(page);
    check("present mode starts on the first slide", (await cur()) === order[0]);
    check("the editor underneath is inert", await page.evaluate(() => [...document.body.children].filter((n) => !n.classList.contains("ks-show-root")).every((n) => n.inert)));
  });

  await step("keys", async () => {
    await press("ArrowRight");
    check("right goes to the next slide", (await cur()) === order[1]);
    await press("Space", 300);
    check("space is one step on a slide with steps", (await where(page)).fragment === "0");
    await press("Shift+Space");
    check("shift and space go back a step", (await where(page)).fragment === "-1");
    await press("ArrowLeft");
    check("left goes back a slide", (await cur()) === order[0]);
    for (const ch of String(numberOf(talk, ids.embeds))) await page.keyboard.press(ch);
    await page.waitForTimeout(150);
    check("typed digits show a box saying where they go", (await page.locator(".ks-show-jump:not([hidden])").count()) === 1);
    await press("Enter", 500);
    check(`digits and Enter jump to slide ${numberOf(talk, ids.embeds)}`, (await cur()) === ids.embeds, names[await cur()]);
  });

  await step("black screen, overview, laser and the list of keys", async () => {
    await press("b", 300);
    check("B puts the black screen up", await has("paused"));
    await press("b", 300);
    check("B takes it down", !(await has("paused")));
    await press("o", 700);
    check("O opens the overview", await has("overview"));
    await shot("overview");
    await press("Escape", 500);
    check("Escape closes the overview and does not leave the show", !(await has("overview")) && (await page.locator(".ks-show").count()) === 1);
    await press("l");
    await page.mouse.move(300, 200);
    await page.mouse.move(420, 260);
    await page.waitForTimeout(100);
    const laser = await page.evaluate(() => {
      const dot = document.querySelector(".ks-show-laser");
      const b = dot.getBoundingClientRect();
      return { hidden: dot.hidden, x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
    });
    check("L shows a dot that follows the pointer", !laser.hidden && Math.abs(laser.x - 420) <= 2 && Math.abs(laser.y - 260) <= 2, JSON.stringify(laser));
    await press("l");
    check("L again puts it away", await page.evaluate(() => document.querySelector(".ks-show-laser").hidden));
    await page.keyboard.press("Shift+/");
    await page.waitForTimeout(200);
    check("? shows the list of keys", (await page.locator(".ks-show-hints").count()) === 1);
    await press("Escape");
    check("Escape puts the list away first", (await page.locator(".ks-show-hints").count()) === 0 && (await page.locator(".ks-show").count()) === 1);
  });

  await step("visits the slides in order", async () => {
    await press("Home", 400);
    const visited = [await cur()];
    const state = () => page.evaluate(() => {
      const s = document.querySelector(".slides section.present:not(.stack)");
      return `${s?.getAttribute("data-slide")}:${s?.getAttribute("data-fragment")}`;
    });
    for (let i = 0; i < 80; i++) {
      const before = await state();
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(70);
      const after = await state();
      if (before === after) break;
      const slide = after.split(":")[0];
      if (visited[visited.length - 1] !== slide) visited.push(slide);
    }
    check("going right visits the slides shown, not the hidden one or the backups", JSON.stringify(visited) === JSON.stringify(main), `${visited.map((v) => names[v] ?? "-")} against ${main.map((v) => names[v])}`);
  });

  await step("backup slides", async () => {
    await press("Home", 300);
    await jumpTo(page, talk, ids.columns, 500);
    check("jumped to the slide with backups under it", (await cur()) === ids.columns, names[await cur()]);
    await press("ArrowDown", 400);
    check("down goes into the first backup", (await cur()) === ids.b1, names[await cur()]);
    await press("ArrowDown", 400);
    check("down again goes to the second", (await cur()) === ids.b2);
    await shot("backup");
    await press("ArrowUp", 400);
    await press("ArrowUp", 400);
    check("up twice is back on the slide", (await cur()) === ids.columns);
    await press("ArrowDown", 400);
    await press("ArrowRight", 500);
    check("right from a backup goes on to the next slide of the talk", (await cur()) === main[main.indexOf(ids.columns) + 1], names[await cur()]);
  });

  await step("steps", async () => {
    // Coming onto a slide from a later one shows it as it ended; from the start it begins with its first step.
    await press("Home", 400);
    await jumpTo(page, talk, ids.bullets);
    const shown = () => page.evaluate(() => [...document.querySelectorAll(".slides section.present .ks-slide .ks-p")].map((p) => (p.style.visibility === "hidden" ? "-" : "+")).join(""));
    const before = await shown();
    await press("ArrowRight", 450);
    const after = await shown();
    check("a step brings the next words in", before !== after && (await where(page)).slide === ids.bullets, `${before} to ${after}`);
    for (let i = 0; i < 4; i++) await press("ArrowRight", 350);
    check("the last step shows everything", !(await shown()).includes("-"), await shown());
    await press("ArrowRight", 500);
    check("and the next press goes to the next slide", (await cur()) === ids.diagram, names[await cur()]);
    await press("ArrowLeft", 500);
    check("going back returns to the slide as it ended", (await cur()) === ids.bullets && !(await shown()).includes("-"));
    await press("ArrowLeft", 400);
    check("and back a step", (await shown()).includes("-"));
  });

  await step("morph", async () => {
    await jumpTo(page, talk, ids.morphA);
    const start = await boxOfShown(page, "m-card");
    await shot("morph-a");
    await press("ArrowRight", 0);
    await page.waitForTimeout(250);
    const middle = await boxOfShown(page, "m-card");
    const running = await page.evaluate(() => document.getAnimations().length);
    await shot("morph-middle");
    await page.waitForTimeout(1300);
    const end = await boxOfShown(page, "m-card");
    check("morph: the card is on its way between where it was and where it goes", running > 5 && middle && start && end && middle[0] !== start[0] && middle[0] !== end[0], `${start} ${middle} ${end}; ${running} animations`);
    check("morph: nothing is left running or behind when it ends", (await page.evaluate(() => document.getAnimations().length)) === 0 && (await page.evaluate(() => document.querySelectorAll(".slides section.present .ks-slide > [aria-hidden=true]").length)) === 0);
    await shot("morph-b");
    await press("ArrowLeft", 1500);
    check("morph: going back returns to the first slide with the card where it was", (await cur()) === ids.morphA && JSON.stringify(await boxOfShown(page, "m-card")) === JSON.stringify(start));
  });

  await step("a picture opened large", async () => {
    await jumpTo(page, talk, ids.picture);
    check("on the picture slide", (await cur()) === ids.picture, names[await cur()]);
    await page.locator(".slides section.present img.ks-image-pic").click({ timeout: 5000 });
    await page.waitForTimeout(300);
    check("clicking a picture opens it large", (await page.locator(".ks-show-lightbox").count()) === 1);
    await shot("lightbox");
    await press("ArrowRight", 300);
    check("keys do not move the talk under the picture", (await cur()) === ids.picture);
    await press("Escape", 300);
    check("Escape puts the picture away and does not leave", (await page.locator(".ks-show-lightbox").count()) === 0 && (await page.locator(".ks-show").count()) === 1);
  });

  await step("embeds and a video", async () => {
    await jumpTo(page, talk, ids.embeds, 1500);
    await shot("embeds");
    const frames = await page.evaluate(() => [...document.querySelectorAll(".slides section.present iframe")].map((f) => f.getAttribute("src") ?? ""));
    check("a web address that can be shown is a live frame", frames.some((src) => src.includes("localhost")), frames.join(" "));
    check("a page that is not there keeps its still", (await page.locator(".slides section.present img").count()) >= 1);
    await jumpTo(page, talk, ids.video, 1000);
    const video = await page.evaluate(() => {
      const v = document.querySelector(".slides section.present video");
      return v ? { src: v.currentSrc.slice(0, 12), ready: v.readyState, muted: v.muted } : null;
    });
    check("a video slide has a video that loaded", !!video && video.ready >= 1, JSON.stringify(video));
    await shot("video");
  });

  await step("the show ends", async () => {
    await press("Escape", 500);
    check("Escape leaves the show", (await page.locator(".ks-show").count()) === 0);
    check("and the editor is back", await page.evaluate(() => [...document.body.children].every((n) => !n.inert)));
  });

  await step("speed", async () => {
    // A heavy pair: forty shapes on each of two slides (the same ids, moved), the second morphing from the first, and eight steps on the first.
    const heavy = await page.evaluate(() => {
      const core = window.__ks.session.core;
      const apply = (n, i) => core.apply(n, i);
      const add = (layout) => apply("add_slide", { layout }).output.slide;
      const make = (moved) => Array.from({ length: 40 }, (_, i) => ({
        type: i % 4 === 0 ? "text" : "shape",
        ...(i % 4 === 0
          ? { text: { paragraphs: [{ runs: [{ t: `Item ${i}${moved ? " moved" : ""}`, size: 16 }] }] } }
          : { shape: i % 3 === 0 ? "ellipse" : "roundRect", style: { fill: { color: `accent${(i % 6) + 1}` } } }),
        id: `h-${i}`, x: 40 + (i % 8) * 110 + (moved ? 18 : 0), y: 40 + Math.floor(i / 8) * 90 + (moved ? 12 : 0), w: 90 + (moved ? 6 : 0), h: 70,
      }));
      const a = add("blank");
      apply("add_elements", { slide: a, elements: make(false) });
      const b = add("blank");
      apply("add_elements", { slide: b, elements: make(true) });
      apply("set_transition", { ids: [b], transition: { kind: "morph", duration: 0.6 } });
      apply("set_slide_steps", { slide: a, steps: 8 });
      for (let i = 0; i < 40; i++) apply("set_step_states", { slide: a, id: `h-${i}`, states: i < 5 ? {} : { 0: "hidden", [Math.min(8, 1 + Math.floor((i - 5) / 5))]: "normal" } });
      return { a, b, order: core.deck.slides.map((s) => s.id) };
    });
    const heavyTalk = { ids, order: heavy.order };
    await page.evaluate(() => {
      window.__keys = [];
      addEventListener("keydown", () => (window.__t0 = performance.now()), true);
      addEventListener("keydown", () => {
        const sync = performance.now() - window.__t0;
        requestAnimationFrame(() => window.__keys.push({ sync, frame: performance.now() - window.__t0 }));
      });
    });
    await startShow(page);
    await jumpTo(page, heavyTalk, heavy.a, 900);
    await page.evaluate(() => (window.__keys.length = 0));
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(160);
      }
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press("ArrowLeft");
        await page.waitForTimeout(160);
      }
    }
    const steps = await page.evaluate(() => window.__keys.splice(0));
    const toFrame = stats(steps.map((k) => k.frame));
    check("a step on a slide with forty elements reaches the screen in under 50 ms", steps.length >= 40 && toFrame.p95 < 50, fmt(toFrame));

    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(120);
    }
    await page.evaluate(() => {
      window.__gaps = [];
      let last = performance.now();
      const tick = (t) => {
        window.__gaps.push(t - last);
        last = t;
        if (window.__gaps.length < 120) window.__tick = requestAnimationFrame(tick);
      };
      window.__tick = requestAnimationFrame(tick);
    });
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(1100);
    const gaps = (await page.evaluate(() => (cancelAnimationFrame(window.__tick), window.__gaps.slice(1)))).slice(0, 36);
    const morph = stats(gaps);
    check("a morph of forty elements keeps moving smoothly (no frame gap over 50 ms at the 95th)", gaps.length >= 20 && morph.p95 < 50, fmt(morph));
    await shot("heavy");
  });

  const problems = logs.filter((l) => !noise(l));
  check("the talk logged no errors", problems.length === 0, problems.slice(0, 2).join(" | "));
  await context.close();
}
