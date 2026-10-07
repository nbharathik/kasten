// Waiting until the page shows what was put on it. Fonts load when the first layout finds text that needs them, and
// pictures load when their elements are made; a photograph taken before either has finished shows the wrong font or
// an empty frame.

/** How long to wait for pictures and fonts in all before giving up on them, in milliseconds. */
const PATIENCE = 15_000;

/** A frame has been drawn, or a moment has passed (a page that is not shown gets no frames). */
export function frame(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      resolve();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => finish());
    setTimeout(finish, 120);
  });
}

function loaded(image: HTMLImageElement): Promise<void> {
  const decoded = (): Promise<void> => (typeof image.decode === "function" ? image.decode().catch(() => undefined) : Promise.resolve());
  if (image.complete) return decoded();
  return new Promise((resolve) => {
    image.addEventListener("load", () => resolve(decoded()), { once: true });
    image.addEventListener("error", () => resolve(), { once: true });
  });
}

/**
 * Resolves when everything under `root` is laid out, its fonts and pictures are loaded and a frame has been drawn.
 * Best effort: it gives up on what does not arrive in time and the page is photographed as it is.
 */
export async function settle(root: HTMLElement): Promise<void> {
  const work = async (): Promise<void> => {
    // A layout is what makes the browser ask for the fonts the text uses; once they are in, the text is laid out again
    // and may need more of them (another script's range), so go round until the fonts have nothing left to fetch.
    for (let round = 0; round < 5; round++) {
      void root.offsetHeight;
      await document.fonts?.ready;
      await Promise.all(Array.from(root.querySelectorAll("img"), loaded));
      void root.offsetHeight;
      if (document.fonts === undefined || document.fonts.status === "loaded") break;
    }
    await frame();
    await frame();
  };
  await Promise.race([work(), new Promise<void>((resolve) => setTimeout(resolve, PATIENCE))]);
}
