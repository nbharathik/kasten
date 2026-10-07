// Slides inside Kasten, in the browser preview of the app on its sample vault: the
// Slides view, a deck in a tab, editing, a new deck, the PowerPoint export, the trash.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LONG = { timeout: 20000 };
const SAMPLE = "Tool use in language models";

export async function run({ browser, previewBase, shots, check }) {
  const base = await previewBase();
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(e.message));
  const step = async (name, fn) => {
    try {
      await fn();
    } catch (error) {
      check(name, false, error instanceof Error ? error.message.split("\n")[0] : String(error));
      await page.screenshot({ path: join(shots, `failed-${name.replace(/\W+/g, "-")}.png`) }).catch(() => {});
    }
  };

  await step("opens the sample vault", async () => {
    await page.goto(`${base}/?samples=dev`, { waitUntil: "load" });
    await page.getByRole("navigation", { name: "Sidebar" }).waitFor(LONG);
    await page.getByText("Opening your notes").waitFor({ state: "hidden", ...LONG });
    await page.getByRole("navigation", { name: "Sidebar" }).getByText("Slides", { exact: true }).first().click();
    await page.getByText(SAMPLE).first().waitFor(LONG);
    check("the Slides view lists the sample deck", true);
    await page.screenshot({ path: join(shots, "slides-home.png") });
  });

  await step("opens a deck in a tab and edits it", async () => {
    await page.getByText(SAMPLE).first().click();
    await page.waitForFunction(() => window.__ks, null, LONG);
    check("the editor shows its six slides", (await page.evaluate(() => window.__ks.session.deck.slides.length)) === 6);
    const title = await page.evaluate(() => window.__ks.session.slide.elements.find((e) => e.placeholder === "title").id);
    const box = await page.locator(`.ks-stage [data-el="${title}"]`).first().boundingBox();
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(() => window.__ks.session.state.editing !== null, null, LONG);
    await page.keyboard.press("Control+a");
    await page.keyboard.type("Edited in Kasten");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => window.__ks.session.state.saving.status === "saved", null, LONG);
    check("the change is saved to the vault", (await page.evaluate(() => JSON.stringify(window.__ks.session.deck).includes("Edited in Kasten"))) === true);
    await page.screenshot({ path: join(shots, "deck-in-kasten.png") });
  });

  await step("exports PowerPoint", async () => {
    const [download] = await Promise.all([
      page.waitForEvent("download", LONG),
      (async () => {
        await page.getByRole("menuitem", { name: "File", exact: true }).first().click();
        await page.locator(".ks-popover").getByText("Download", { exact: true }).first().hover();
        await page.locator(".ks-popover").getByText("Microsoft PowerPoint (.pptx)").click();
      })(),
    ]);
    const file = join(shots, download.suggestedFilename());
    await download.saveAs(file);
    check("a .pptx file was downloaded", file.endsWith(".pptx"), download.suggestedFilename());
    let listing = "";
    try {
      listing = execFileSync("unzip", ["-l", file]).toString();
    } catch {
      check("unzip could read the file", false);
      return;
    }
    check("it is a package of six slides with notes", /ppt\/slides\/slide6\.xml/.test(listing) && /notesSlide/.test(listing));
    check("with the edited title in it", execFileSync("unzip", ["-p", file, "ppt/slides/slide1.xml"]).toString().includes("Edited in Kasten"));
    writeFileSync(join(shots, "last-export.txt"), file);
  });

  await step("makes a new deck", async () => {
    await page.keyboard.press("Escape");
    await page.getByRole("navigation", { name: "Sidebar" }).getByText("Slides", { exact: true }).first().click();
    await page.getByRole("button", { name: /new deck/i }).first().click();
    await page.getByLabel("Title").fill("Made in the acceptance run");
    await page.getByRole("button", { name: "Create" }).click();
    await page.waitForFunction(() => window.__ks?.session.deck.title === "Made in the acceptance run", null, LONG);
    check("a new deck opens in the editor", true);
  });

  check("the app reported no page errors", problems.length === 0, problems[0] ?? "");
  await context.close();
}
