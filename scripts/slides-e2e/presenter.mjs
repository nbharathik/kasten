// The presenter's window: it opens beside the show, follows it and drives it (slide, step, black screen),
// shows the notes and what comes next, keeps a timer, and says when the show has ended. In the browser the
// two windows talk over a BroadcastChannel; in the desktop app the same messages travel between Tauri windows.

import { join } from "node:path";

import { buildTalk, noise, openSample, where } from "./present-kit.mjs";

export async function run({ browser, base, shots, check }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const { page, logs } = await openSample(context, base);
  const talk = await buildTalk(page, base);
  const { ids, order } = talk;
  const shownOrder = order.filter((s) => s !== ids.hidden);
  const total = shownOrder.length;
  const step = async (name, fn) => {
    try {
      await fn();
    } catch (error) {
      check(name, false, error instanceof Error ? error.message.split("\n")[0] : String(error));
    }
  };

  const [popup] = await Promise.all([context.waitForEvent("page"), page.evaluate(() => window.__ks.ui.actions.present("start", { presenter: true }))]);
  popup.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) logs.push(`[presenter ${m.type()}] ${m.text().slice(0, 300)}`);
  });
  popup.on("pageerror", (e) => logs.push(`[presenter pageerror] ${e.message}`));
  await popup.setViewportSize({ width: 1280, height: 800 });
  await page.waitForSelector(".ks-show .reveal.ready");
  await popup.waitForSelector(".ks-presenter .ks-show-scroll-frame", { timeout: 20000 });
  await page.waitForTimeout(600);

  const facts = () => popup.evaluate(() => Object.fromEntries([...document.querySelectorAll(".ks-pv-fact")].map((e) => [e.dataset.fact, e.textContent.replace(/\s+/g, " ").trim()])));
  const notes = () => popup.evaluate(() => document.querySelector(".ks-pv-notes-text")?.textContent?.trim().slice(0, 60) ?? "");
  const audience = async () => (await where(page)).slide;
  const black = () => page.evaluate(() => document.querySelector(".reveal").classList.contains("paused"));

  await step("shows the first slide", async () => {
    const f = await facts();
    check("the presenter's view shows slide 1 of the talk", new RegExp(`Slide 1 / ${total}\\b`).test(f.slide ?? ""), JSON.stringify(f));
    check("a slide without steps says so", f.step === "No steps", f.step);
    await popup.screenshot({ path: join(shots, "presenter-1.png") });
  });

  await step("follows the audience", async () => {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(500);
    let f = await facts();
    check("the audience moves, the presenter's view follows", new RegExp(`Slide 2 / ${total}\\b`).test(f.slide ?? "") && /^Step 0 \/ \d+$/.test(f.step ?? ""), JSON.stringify(f));
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(500);
    f = await facts();
    check("steps are followed too", /^Step 1 \/ \d+$/.test(f.step ?? ""), f.step);
    check("the notes of the slide are shown", (await notes()).length > 0, await notes());
    await popup.screenshot({ path: join(shots, "presenter-2.png") });
  });

  await step("drives the audience", async () => {
    await popup.bringToFront();
    await popup.keyboard.press("ArrowRight");
    await page.waitForTimeout(500);
    check("the presenter moves, the audience follows", (await where(page)).fragment === "1", JSON.stringify(await where(page)));
    for (let i = 0; i < 5; i++) await popup.keyboard.press("Space");
    await page.waitForTimeout(700);
    check("many steps later the audience is on the next slide", (await audience()) === shownOrder[2], `${await audience()} against ${shownOrder[2]}`);
    await popup.keyboard.press("ArrowLeft");
    await page.waitForTimeout(500);
    const back = await where(page);
    check("the presenter goes back a step and the audience goes back with it", back.slide === shownOrder[2] && back.fragment === "-1", JSON.stringify(back));
  });

  await step("black screen and buttons", async () => {
    await popup.keyboard.press("b");
    await page.waitForTimeout(500);
    check("B in the presenter's view puts the audience's black screen up", await black());
    check("and the button says how to take it down", /Show the slide/.test(await popup.locator(".ks-pv-controls button[aria-pressed]").textContent()));
    await popup.keyboard.press("b");
    await page.waitForTimeout(400);
    check("B takes it down", !(await black()));
    await popup.locator(".ks-pv-controls button.is-primary").click();
    await page.waitForTimeout(400);
    const heading = await popup.locator(".ks-pv-next .ks-pv-heading").textContent();
    check("what comes next is shown", /Next/.test(heading ?? ""), heading ?? "");
  });

  await step("the size of the notes and the timer", async () => {
    const size = () => popup.evaluate(() => getComputedStyle(document.querySelector(".ks-pv-notes-text")).fontSize);
    const s0 = await size();
    await popup.keyboard.press("Control+=");
    const s1 = await size();
    await popup.keyboard.press("Control+-");
    await popup.keyboard.press("Control+-");
    const s2 = await size();
    check("Ctrl + and Ctrl - change the size of the notes", parseFloat(s1) > parseFloat(s0) && parseFloat(s2) < parseFloat(s0), `${s0} ${s1} ${s2}`);
    const t0 = (await facts()).timer;
    await popup.waitForTimeout(2200);
    const t1 = (await facts()).timer;
    check("the timer runs", t1 !== t0, `${t0} to ${t1}`);
    await popup.getByRole("button", { name: "Reset" }).click();
    check("and starts again with Reset", /^00:0[0-1]/.test((await facts()).timer ?? ""), (await facts()).timer);
  });

  await step("the show ends", async () => {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
    check("the presenter is told the show has ended", (await popup.locator(".ks-pv-ended").count()) === 1);
    await popup.screenshot({ path: join(shots, "presenter-ended.png") });
  });

  const problems = logs.filter((l) => !noise(l));
  check("neither window logged errors", problems.length === 0, problems.slice(0, 2).join(" | "));
  await context.close();
}
