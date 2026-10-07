// Small helpers the demos share.

export const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

const SVG = "http://www.w3.org/2000/svg";

/** An element with attributes and children; strings become text. */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  setAttributes(el, attrs);
  el.append(...children.flat().filter((child) => child != null && child !== false));
  return el;
}

/** An SVG element with attributes. */
export function s(tag, attrs = {}) {
  const el = document.createElementNS(SVG, tag);
  setAttributes(el, attrs);
  return el;
}

function setAttributes(el, attrs) {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (key === "class") el.setAttribute("class", value);
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? "" : String(value));
  }
}

/** One of the page's icons, named as `#i-<name>`. */
export function icon(href) {
  const svg = s("svg", { class: "i", "aria-hidden": "true" });
  svg.append(s("use", { href }));
  return svg;
}

/** Kasten's mark, drawn in place so its cards can rise while it works. */
let marks = 0;
export function mark() {
  const id = `km-${++marks}`;
  const svg = s("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" });
  const defs = s("defs");
  const cut = (name, shape) => {
    const mask = s("mask", { id: `${id}-${name}`, maskUnits: "userSpaceOnUse", x: -2, y: -4, width: 28, height: 30 });
    mask.append(s("rect", { x: -2, y: -4, width: 28, height: 30, fill: "#fff" }), shape);
    defs.append(mask);
  };
  cut("box", s("rect", { x: 3, y: 12.2, width: 18, height: 8.8, rx: 2.6, fill: "#000", stroke: "#000", "stroke-width": 3 }));
  cut("right", s("rect", { x: 10.2, y: 3.8, width: 8.2, height: 11, rx: 1.7, transform: "rotate(10 14.3 14.8)", fill: "#000", stroke: "#000", "stroke-width": 3 }));
  cut("slot", s("rect", { x: 9.4, y: 15.6, width: 5.2, height: 1.9, rx: 0.95, fill: "#000" }));
  const cards = s("g", { class: "km-cards" });
  const left = s("g", { mask: `url(#${id}-right)` });
  left.append(s("rect", { x: 5.6, y: 3.8, width: 8.2, height: 11, rx: 1.7, transform: "rotate(-10 9.7 14.8)" }));
  cards.append(left, s("rect", { x: 10.2, y: 3.8, width: 8.2, height: 11, rx: 1.7, transform: "rotate(10 14.3 14.8)" }));
  const inBox = s("g", { mask: `url(#${id}-box)` });
  inBox.append(cards);
  const box = s("g", { mask: `url(#${id}-slot)` });
  box.append(s("rect", { x: 3, y: 12.2, width: 18, height: 8.8, rx: 2.6 }));
  const ink = s("g", { fill: "currentColor" });
  ink.append(inBox, box);
  svg.append(defs, ink);
  return svg;
}

/** Resolves after `ms`, or at once when motion is reduced. */
export const wait = (ms) => new Promise((done) => setTimeout(done, still ? 0 : ms));

/** Runs `run` once, when `el` is first well in view. */
export function whenSeen(el, run) {
  if (!("IntersectionObserver" in window)) return run();
  const seen = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      seen.disconnect();
      run();
    },
    { threshold: 0.35 },
  );
  seen.observe(el);
}
