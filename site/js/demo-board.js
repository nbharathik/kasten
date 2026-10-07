// The whiteboard demo: cards, a sticky and a section on a small board, wide
// on big screens and tall on phones, scaled to fit. Drag anything, or move
// it with the arrow keys; arrows follow, and a section carries what sits in
// it.

import { h, icon, s, still, wait, whenSeen } from "./dom.js";

const NODES = [
  { id: "research", kind: "section", title: "Research" },
  { id: "interviews", kind: "card", title: "Interviews", text: "Five people, one question: how do you find an old photo?" },
  { id: "score", kind: "card", title: "Duplicate score", text: "A perceptual hash scores how alike two photos are." },
  { id: "roadmap", kind: "card", title: "Roadmap", text: "Import, thumbnails, then the duplicate score." },
  { id: "launch", kind: "card", title: "Launch", text: "A website, a demo and installers for every system." },
  { id: "burst", kind: "sticky", title: "What about burst shots?" },
];
const EDGES = [
  { from: "interviews", to: "score", label: "suggests" },
  { from: "score", to: "roadmap", label: "formalised in" },
  { from: "roadmap", to: "launch" },
];
// Where things sit: [x, y, width, height] at the start, [x, y] tidied.
const LAYOUTS = {
  wide: {
    world: { w: 960, h: 540 },
    start: { research: [36, 36, 440, 300], interviews: [64, 84, 230, 100], score: [222, 212, 230, 100], roadmap: [590, 64, 230, 100], launch: [640, 350, 230, 100], burst: [90, 392, 180, 92] },
    tidy: { research: [36, 60], interviews: [60, 110], score: [60, 226], roadmap: [560, 60], launch: [560, 226], burst: [560, 392] },
    spare: (n) => [760, 60 + 110 * n],
    sticky: (n) => [520 + n * 26, 200 + n * 22],
  },
  tall: {
    world: { w: 400, h: 620 },
    start: { research: [16, 16, 368, 250], interviews: [32, 56, 190, 104], score: [176, 150, 192, 104], roadmap: [24, 300, 190, 104], launch: [186, 460, 196, 104], burst: [24, 470, 140, 84] },
    tidy: { research: [16, 16], interviews: [32, 52], score: [32, 158], roadmap: [24, 300], launch: [210, 300], burst: [24, 430] },
    spare: (n) => [210, 430 + 100 * n],
    sticky: (n) => [200 + n * 16, 330 + n * 20],
  },
};
const STICKIES = ["Ask the team", "Try it on 10,000 photos", "Name it?", "Faster thumbnails"];

export default function boardDemo(root) {
  const canvas = root.querySelector("[data-board-canvas]");
  const world = root.querySelector("[data-board-world]");
  const edgesSvg = root.querySelector("[data-board-edges]");
  const announce = root.querySelector("[data-board-announce]");
  let layout = null;
  let nodes = [];
  let scale = 1;
  let added = 0;
  let touched = false;

  const byId = (id) => nodes.find((node) => node.id === id);
  const inSection = (node) => node.kind !== "section" && nodes.some((sec) => sec.kind === "section" && contains(sec, node));
  const ridersOf = (node) => (node.kind === "section" ? nodes.filter((other) => other !== node && other.kind !== "section" && contains(node, other)) : []);

  function fit() {
    const wanted = canvas.clientWidth < 600 ? LAYOUTS.tall : LAYOUTS.wide;
    if (wanted !== layout) {
      layout = wanted;
      canvas.classList.toggle("is-tall", layout === LAYOUTS.tall);
      world.style.setProperty("--ww", `${layout.world.w}px`);
      world.style.setProperty("--wh", `${layout.world.h}px`);
      build();
    }
    const box = canvas.getBoundingClientRect();
    scale = Math.min(box.width / layout.world.w, box.height / layout.world.h) || 1;
    world.style.setProperty("--scale", scale);
    world.style.setProperty("--ox", `${(box.width - layout.world.w * scale) / 2}px`);
    world.style.setProperty("--oy", `${(box.height - layout.world.h * scale) / 2}px`);
  }

  function build() {
    for (const node of nodes) node.el.remove();
    added = 0;
    nodes = NODES.map((spec) => {
      const [x, y, w, hgt] = layout.start[spec.id];
      return { ...spec, x, y, w, h: hgt };
    });
    for (const node of nodes) add(node);
    drawEdges();
  }

  function add(node) {
    node.el = draw(node);
    // Sections sit under the arrows, and the arrows under the cards.
    if (node.kind === "section") world.insertBefore(node.el, edgesSvg);
    else world.append(node.el);
    place(node);
    grab(node);
  }

  function draw(node) {
    const attrs = { class: `db-node db-${node.kind}`, tabindex: "0", role: "group", "aria-roledescription": node.kind, "aria-label": `${node.title}, ${node.kind}. Arrow keys move it.` };
    if (node.kind === "section") return h("div", attrs, h("span", {}, node.title));
    if (node.kind === "sticky") return h("div", attrs, node.title);
    return h("div", attrs, h("p", { class: "db-title" }, icon("#i-page"), node.title), h("p", {}, node.text));
  }

  function place(node) {
    Object.assign(node.el.style, { left: `${node.x}px`, top: `${node.y}px`, width: `${node.w}px`, height: `${node.h}px` });
  }

  function drawEdges() {
    const marker = s("marker", { id: "db-arrow", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
    marker.append(s("path", { class: "db-arrow", d: "M0 0 L10 5 L0 10 z" }));
    const defs = s("defs");
    defs.append(marker);
    const parts = [defs];
    for (const edge of EDGES) {
      const a = byId(edge.from);
      const b = byId(edge.to);
      if (!a || !b) continue;
      const { d, mid } = curve(a, b);
      parts.push(s("path", { d, "marker-end": "url(#db-arrow)" }));
      if (!edge.label) continue;
      const text = s("text", { x: mid.x, y: mid.y + 4 });
      text.textContent = edge.label;
      parts.push(text);
    }
    edgesSvg.replaceChildren(...parts);
  }

  /** Moves `node`, and whatever rides with it, by dx, dy. */
  function moveBy(node, dx, dy, riders = ridersOf(node)) {
    for (const item of [node, ...riders]) {
      item.x = clamp(item.x + dx, 0, layout.world.w - item.w);
      item.y = clamp(item.y + dy, 0, layout.world.h - item.h);
      place(item);
    }
    drawEdges();
  }

  function grab(node) {
    node.el.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      touched = true;
      event.preventDefault();
      node.el.setPointerCapture(event.pointerId);
      node.el.focus({ preventScroll: true });
      node.el.classList.add("is-dragging");
      const riders = ridersOf(node);
      const was = inSection(node);
      let last = { x: event.clientX, y: event.clientY };
      const move = (e) => {
        moveBy(node, (e.clientX - last.x) / scale, (e.clientY - last.y) / scale, riders);
        last = { x: e.clientX, y: e.clientY };
      };
      const end = () => {
        node.el.classList.remove("is-dragging");
        node.el.removeEventListener("pointermove", move);
        node.el.removeEventListener("pointerup", end);
        node.el.removeEventListener("pointercancel", end);
        report(node, was);
      };
      node.el.addEventListener("pointermove", move);
      node.el.addEventListener("pointerup", end);
      node.el.addEventListener("pointercancel", end);
    });
    node.el.addEventListener("keydown", (event) => {
      const step = event.shiftKey ? 40 : 10;
      const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
      if (!delta) return;
      event.preventDefault();
      touched = true;
      const was = inSection(node);
      moveBy(node, ...delta);
      report(node, was);
    });
  }

  function report(node, was) {
    const now = inSection(node);
    if (node.kind === "section") announce.textContent = `Moved ${node.title} and what sits in it.`;
    else if (now !== was) announce.textContent = now ? `${node.title} is now in Research.` : `${node.title} left Research.`;
    else announce.textContent = `Moved ${node.title}.`;
  }

  /** Glides each node to where `to` puts it; null leaves it be. */
  async function glide(to) {
    const from = nodes.map((node) => ({ node, x: node.x, y: node.y, target: to(node) }));
    const frames = still ? 1 : 28;
    for (let f = 1; f <= frames; f++) {
      const t = ease(f / frames);
      for (const { node, x, y, target } of from) {
        if (!target) continue;
        node.x = x + (target[0] - x) * t;
        node.y = y + (target[1] - y) * t;
        place(node);
      }
      drawEdges();
      if (f < frames) await new Promise((next) => requestAnimationFrame(next));
    }
  }

  root.querySelector("[data-board-tidy]").addEventListener("click", async () => {
    touched = true;
    let spare = 0;
    await glide((node) => layout.tidy[node.id] ?? layout.spare(spare++));
    announce.textContent = "Tidied into a grid.";
  });
  root.querySelector("[data-board-reset]").addEventListener("click", async () => {
    touched = true;
    const extra = nodes.filter((node) => !layout.start[node.id]);
    for (const node of extra) node.el.remove();
    nodes = nodes.filter((node) => !extra.includes(node));
    added = 0;
    await glide((node) => layout.start[node.id].slice(0, 2));
    announce.textContent = "The board is as it was.";
  });
  root.querySelector("[data-board-add]").addEventListener("click", () => {
    touched = true;
    if (added >= STICKIES.length) {
      announce.textContent = "That's plenty of stickies for one demo.";
      return;
    }
    const [x, y] = layout.sticky(added);
    const node = { id: `sticky-${added}`, kind: "sticky", title: STICKIES[added], x, y, w: 150, h: 80 };
    added++;
    nodes.push(node);
    add(node);
    node.el.classList.add("is-new");
    node.el.focus({ preventScroll: true });
    announce.textContent = `Added a sticky: ${node.title}.`;
  });

  new ResizeObserver(fit).observe(canvas);
  fit();

  // Once, as it comes into view: a card moves, and its arrows follow.
  whenSeen(root, async () => {
    if (still) return;
    await wait(700);
    const card = byId("roadmap");
    for (const dy of [90, -90]) {
      if (touched || !card) return;
      const target = [card.x, card.y + dy];
      await glide((node) => (node === card ? target : null));
      await wait(250);
    }
  });
}

/** A curved arrow from the side of `a` that faces `b` to the side of `b`
 * that faces `a`, and its middle. */
function curve(a, b) {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const across = Math.abs(cb.x - ca.x) * a.h > Math.abs(cb.y - ca.y) * a.w;
  const sign = across ? Math.sign(cb.x - ca.x) || 1 : Math.sign(cb.y - ca.y) || 1;
  const p1 = across ? { x: ca.x + (sign * a.w) / 2, y: ca.y } : { x: ca.x, y: ca.y + (sign * a.h) / 2 };
  const p2 = across ? { x: cb.x - (sign * b.w) / 2, y: cb.y } : { x: cb.x, y: cb.y - (sign * b.h) / 2 };
  const pull = Math.max(30, Math.min(120, Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2));
  const c1 = across ? { x: p1.x + sign * pull, y: p1.y } : { x: p1.x, y: p1.y + sign * pull };
  const c2 = across ? { x: p2.x - sign * pull, y: p2.y } : { x: p2.x, y: p2.y - sign * pull };
  const mid = {
    x: 0.125 * p1.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * p2.x,
    y: 0.125 * p1.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * p2.y,
  };
  return { d: `M${p1.x} ${p1.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p2.x} ${p2.y}`, mid };
}

const contains = (outer, inner) => {
  const cx = inner.x + inner.w / 2;
  const cy = inner.y + inner.h / 2;
  return cx > outer.x && cx < outer.x + outer.w && cy > outer.y && cy < outer.y + outer.h;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const ease = (t) => 1 - (1 - t) ** 3;
