// HTML as a picture: the markup goes into an SVG `foreignObject`, the browser
// draws that SVG as an image, and the image is copied onto a canvas that is
// read back as PNG. Used for the formulas PowerPoint gets as pictures, and by
// anything else that has to turn markup into pixels (a PNG or PDF of a slide).

/** No side of the picture is longer than this many pixels, whatever scale is asked for: browsers refuse bigger canvases. */
const MAX_SIDE = 8192;
/** Nor is it more than this many pixels in all. */
const MAX_PIXELS = 48_000_000;
/** How long the browser has to draw the SVG before it is given up on, in milliseconds. */
const PATIENCE = 20_000;

const SVG = "http://www.w3.org/2000/svg";

/** The pixels a picture of `width` x `height` units has at `scale`, kept within what a canvas can hold; null when there is nothing to draw. */
export function pixelsOf(width: number, height: number, scale: number): { w: number; h: number } | null {
  if (!(width > 0 && height > 0 && scale > 0) || ![width, height, scale].every(Number.isFinite)) return null;
  const limit = Math.min(1, MAX_SIDE / Math.max(width * scale, height * scale), Math.sqrt(MAX_PIXELS / (width * scale * height * scale)));
  const w = Math.max(1, Math.round(width * scale * limit));
  const h = Math.max(1, Math.round(height * scale * limit));
  return { w, h };
}

/**
 * The SVG document that holds the markup: a `foreignObject` of `width` x
 * `height` units, shown at `scale` times that. The markup is parsed as HTML and
 * written back as XML, since an SVG is XML and HTML is not always well formed.
 * `css` is put in the document itself: an SVG drawn as an image loads nothing
 * from outside, so fonts in it must be data URLs.
 */
export function svgDocument(html: string, css: string, width: number, height: number, scale: number): string {
  const px = pixelsOf(width, height, scale) ?? { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
  const root = document.createElement("div");
  root.setAttribute("style", `width:${width}px;height:${height}px;margin:0;padding:0;overflow:hidden;background:transparent`);
  root.innerHTML = html;
  const style = document.createElement("style");
  style.textContent = css;
  root.prepend(style);
  const inner = new XMLSerializer().serializeToString(root);
  return `<svg xmlns="${SVG}" width="${px.w}" height="${px.h}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="${width}" height="${height}">${inner}</foreignObject></svg>`;
}

/** Loads a picture from an address; null when the browser cannot draw it or takes too long. */
function load(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    const timer = setTimeout(() => resolve(null), PATIENCE);
    image.onload = () => {
      clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    image.src = url;
  });
}

function toPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob(resolve, "image/png");
    } catch {
      // A canvas the browser has marked as tainted refuses to be read: some WebKit builds do that to a drawing of an SVG with a foreignObject.
      resolve(null);
    }
  });
}

/**
 * Draws `html` styled by `css` into a transparent PNG, `width` x `height`
 * units drawn at `scale` pixels to the unit (a slide's 960 x 540 units at 3
 * come to 2880 x 1620 pixels). Resolves to the PNG's bytes, or to null when
 * this browser cannot make one (no canvas, an SVG it will not draw, a canvas it
 * will not let be read): a caller that gets null does without the picture.
 */
export async function rasterize(html: string, css: string, width: number, height: number, scale: number): Promise<Uint8Array | null> {
  if (typeof document === "undefined" || typeof Image === "undefined") return null;
  const size = pixelsOf(width, height, scale);
  if (!size) return null;
  try {
    const svg = svgDocument(html, css, width, height, scale);
    const image = await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    if (!image) return null;
    const canvas = document.createElement("canvas");
    canvas.width = size.w;
    canvas.height = size.h;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, size.w, size.h);
    const blob = await toPng(canvas);
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}
