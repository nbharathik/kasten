// The HTML export: the talk as one file that opens from disk with nothing else running, not even a network.
// The file is made by the editor, saved, and opened in a fresh browser context whose requests are refused
// once the page has loaded. Steps, a morph, a picture opened large, backups, the overview and the page that
// scrolls (?view=scroll) are checked in it.

import { statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { boxOfShown, buildTalk, noise, numberOf, openSample } from "./present-kit.mjs";

export async function run({ browser, base, shots, check }) {
  const made = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const { page: editor, logs: editorLogs } = await openSample(made, base);
  const talk = await buildTalk(editor, base);
  const { ids, order } = talk;
  const shown = order.filter((s) => s !== ids.hidden);
  const names = Object.fromEntries(Object.entries(ids).map(([k, v]) => [v, k]));

  const exported = await editor.evaluate(async () => {
    const t0 = performance.now();
    const { file, warnings } = await window.__ks.session.exports.html();
    let binary = "";
    for (let i = 0; i < file.bytes.length; i += 1 << 15) binary += String.fromCharCode(...file.bytes.subarray(i, i + (1 << 15)));
    return { name: file.name, type: file.type, base64: btoa(binary), warnings: warnings.map((w) => w.message), ms: Math.round(performance.now() - t0) };
  });
  const path = join(shots, "talk.html");
  writeFileSync(path, Buffer.from(exported.base64, "base64"));
  const kilobytes = Math.round(statSync(path).size / 1024);
  check("the editor makes one HTML file", exported.type === "text/html" && exported.name.endsWith(".html") && kilobytes > 50, `${exported.name}, ${kilobytes} KB in ${exported.ms} ms`);
  check("and says what it could not keep", Array.isArray(exported.warnings), exported.warnings.join("; "));
  check("the editor logged no errors while it made the file", editorLogs.filter((l) => !noise(l)).length === 0, editorLogs.filter((l) => !noise(l))[0] ?? "");
  await made.close();

  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const requests = [];
  const logs = [];
  page.on("request", (r) => {
    if (!/^(file|data|blob):/.test(r.url())) requests.push(r.url());
  });
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`file://${path}`, { waitUntil: "load" });
  await context.route("**/*", (route) => route.abort()); // from here on nothing leaves the machine
  await page.waitForSelector(".reveal.ready", { timeout: 15000 });
  await page.waitForTimeout(600);

  const now = () =>
    page.evaluate(() => {
      const s = document.querySelector(".slides section.present:not(.stack)");
      return { slide: s?.getAttribute("data-slide"), layer: s?.querySelector(":scope > .ks-show-layer:not([hidden])")?.getAttribute("data-step") ?? null };
    });
  const jump = async (id) => {
    for (const ch of String(numberOf(talk, id))) await page.keyboard.press(ch);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(700);
  };
  const step = async (name, fn) => {
    try {
      await fn();
    } catch (error) {
      check(name, false, error instanceof Error ? error.message.split("\n")[0] : String(error));
      await page.screenshot({ path: join(shots, `html-failed-${name.replace(/\W+/g, "-")}.png`) }).catch(() => {});
    }
  };

  await step("opens on the first slide", async () => {
    check("the page starts on the first slide", (await now()).slide === order[0]);
    await page.screenshot({ path: join(shots, "html-1.png") });
    check("the fonts came with the page", await page.evaluate(async () => (await document.fonts.ready, [...document.fonts].filter((f) => f.status === "loaded").length > 0)));
  });

  await step("steps", async () => {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    check("right goes to the slide with steps, at its start", (await now()).slide === ids.bullets && (await now()).layer === "0", JSON.stringify(await now()));
    const words = () => page.evaluate(() => [...document.querySelectorAll(".slides section.present > .ks-show-layer:not([hidden]) .ks-p")].map((p) => (p.style.visibility === "hidden" ? "-" : "+")).join(""));
    const before = await words();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(500);
    check("a step shows the next layer and brings its words in", (await now()).layer === "1" && before !== (await words()), `${before} to ${await words()}`);
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(180);
    }
    check("five steps are five layers", (await now()).slide === ids.bullets && (await now()).layer === "5", JSON.stringify(await now()));
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    check("then the next slide", (await now()).slide === ids.diagram);
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(300);
    check("left returns to the slide as it ended", (await now()).slide === ids.bullets && (await now()).layer === "5");
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(300);
    check("and back a step", (await now()).layer === "4");
  });

  await step("morph", async () => {
    await jump(ids.morphA);
    const start = await boxOfShown(page, "m-card");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(150);
    const running = await page.evaluate(() => document.getAnimations().length);
    const middle = await boxOfShown(page, "m-card");
    await page.waitForTimeout(1300);
    const end = await boxOfShown(page, "m-card");
    check("morph: the card moves from where it was to where it goes", running > 5 && start && middle && end && middle[0] !== end[0] && start[0] !== end[0], `${start} ${middle} ${end}`);
    check("morph: nothing is left behind when it ends", (await page.evaluate(() => document.getAnimations().length)) === 0);
    await page.screenshot({ path: join(shots, "html-morph.png") });
  });

  await step("a picture", async () => {
    await jump(ids.picture);
    const picture = await page.evaluate(() => {
      const i = document.querySelector(".slides section.present img.ks-image-pic");
      return i ? { src: (i.getAttribute("src") ?? "").slice(0, 22), width: i.naturalWidth } : null;
    });
    check("a picture is inside the page", !!picture && picture.src.startsWith("data:image/png") && picture.width === 800, JSON.stringify(picture));
    await page.locator(".slides section.present img.ks-image-pic").click();
    await page.waitForTimeout(200);
    check("and opens large when clicked", (await page.locator(".ks-show-lightbox").count()) === 1);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
  });

  await step("backups, overview and the rest of the keys", async () => {
    await jump(ids.columns);
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(300);
    check("down goes into a backup slide", (await now()).slide === ids.b1, names[(await now()).slide]);
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(300);
    await page.keyboard.press("o");
    await page.waitForTimeout(600);
    check("O shows the overview", await page.evaluate(() => document.querySelector(".reveal").classList.contains("overview")));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.keyboard.press("b");
    await page.waitForTimeout(300);
    check("B puts the black screen up", await page.evaluate(() => document.querySelector(".reveal").classList.contains("paused")));
    await page.keyboard.press("b");
    await page.waitForTimeout(300);
    await page.keyboard.press("l");
    await page.mouse.move(500, 300);
    await page.mouse.move(520, 320);
    await page.waitForTimeout(100);
    check("L shows the laser", await page.evaluate(() => !document.querySelector(".ks-show-laser").hidden));
    await page.keyboard.press("l");
    await page.keyboard.press("Shift+/");
    await page.waitForTimeout(200);
    check("? lists the keys", (await page.locator(".ks-show-hints").count()) === 1);
    await page.keyboard.press("Escape");
  });

  await step("embeds", async () => {
    await jump(ids.embeds);
    check("an embedded page is its still, not a frame, when there is no network", (await page.locator("iframe").count()) === 0);
    await page.screenshot({ path: join(shots, "html-embeds.png") });
  });

  check("nothing was asked of the network", requests.length === 0, requests.slice(0, 3).join(", "));
  const problems = logs.filter((l) => !noise(l));
  check("the page logged no errors", problems.length === 0, problems.slice(0, 2).join(" | "));

  const scroll = await (await browser.newContext({ viewport: { width: 1000, height: 800 } })).newPage();
  scroll.on("pageerror", (e) => logs.push(`[scroll pageerror] ${e.message}`));
  await scroll.goto(`file://${path}?view=scroll`, { waitUntil: "load" });
  await scroll.waitForSelector(".ks-show-scroll-item");
  await scroll.waitForTimeout(500);
  const view = await scroll.evaluate(() => ({
    items: document.querySelectorAll(".ks-show-scroll-item").length,
    notes: document.querySelectorAll(".ks-show-scroll-item .ks-show-notes").length,
    showHidden: document.querySelector(".ks-show").hidden,
    scale: document.querySelector(".ks-show-scroll-slide").style.transform,
    pictures: [...document.querySelectorAll(".ks-show-scroll-item img.ks-image-pic")].map((i) => i.naturalWidth),
  }));
  check(
    "?view=scroll lists every slide shown with its notes, at the page's width",
    view.items === shown.length && view.notes >= 2 && view.showHidden === true && /scale\(/.test(view.scale) && view.pictures.every((w) => w > 0),
    JSON.stringify(view),
  );
  await scroll.screenshot({ path: join(shots, "html-scroll.png") });
  await scroll.context().close();
  await context.close();
}
