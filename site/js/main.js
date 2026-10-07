// The page's behaviour: theme, header, things arriving as they scroll into
// view, the download for this computer, and the demos, each loaded as it
// comes near.

import { setupFlow } from "./flow.js";
import { setupTheme } from "./theme-toggle.js";

const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

setupTheme();
setupHeader();
setupReveals();
setupDownloads();
setupCopy();
setupFlow();
setupHeroDepth();
setupDemos();

function setupHeader() {
  const header = document.querySelector("[data-header]");
  const nav = document.getElementById("site-nav");
  const toggle = document.querySelector("[data-menu-toggle]");
  const stick = () => header.classList.toggle("is-stuck", scrollY > 8);
  addEventListener("scroll", stick, { passive: true });
  stick();

  const close = () => {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  };
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nav.classList.contains("is-open")) {
      close();
      toggle.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!header.contains(event.target)) close();
  });
}

/** Marks what is already on screen as arrived, hides the rest, and lets each
 * arrive as it scrolls into view. */
function setupReveals() {
  const items = [...document.querySelectorAll("[data-reveal]")];
  const onScreen = (el) => el.getBoundingClientRect().top < innerHeight * 0.92;
  for (const el of items) if (still || onScreen(el)) el.classList.add("is-in");
  document.documentElement.classList.add("js");
  if (still || !("IntersectionObserver" in window)) {
    for (const el of items) el.classList.add("is-in");
    return;
  }
  const seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        seen.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  for (const el of items) if (!el.classList.contains("is-in")) seen.observe(el);
}

/** The visitor's system, when it is one Kasten runs on. */
function desktop() {
  const agent = navigator.userAgent.toLowerCase();
  const platform = (navigator.userAgentData?.platform ?? navigator.platform ?? "").toLowerCase();
  if (/android|iphone|ipad|ipod|mobile/.test(agent)) return null;
  if (platform.startsWith("win") || agent.includes("windows")) return "windows";
  if (platform.startsWith("mac") || agent.includes("mac os")) return "mac";
  if (platform.includes("linux") || agent.includes("linux")) return "linux";
  return null;
}

function setupDownloads() {
  const os = desktop();
  if (!os) return;
  const name = { windows: "Windows", mac: "macOS", linux: "Linux" }[os];
  for (const label of document.querySelectorAll("[data-os-label]")) label.textContent = `Download for ${name}`;
  document.querySelector(`.systems [data-os="${os}"]`)?.classList.add("is-you");
}

function setupCopy() {
  for (const button of document.querySelectorAll("[data-copy]")) {
    const label = button.querySelector("span");
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy);
        label.textContent = "Copied";
        button.classList.add("is-done");
      } catch {
        label.textContent = "Select and copy";
      }
      setTimeout(() => {
        label.textContent = "Copy";
        button.classList.remove("is-done");
      }, 2000);
    });
  }
}

/** The floating pieces by the hero's window drift a little with the pointer,
 * each by its own depth. */
function setupHeroDepth() {
  const stage = document.querySelector(".hero-stage");
  if (still || !stage || !matchMedia("(pointer: fine)").matches) return;
  const floats = [...stage.querySelectorAll(".float")].map((el, i) => ({ el, depth: [10, 16, 12, 8][i] ?? 10 }));
  let frame = 0;
  stage.addEventListener("pointermove", (event) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const box = stage.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - 0.5;
      const y = (event.clientY - box.top) / box.height - 0.5;
      for (const { el, depth } of floats) el.style.transform = `translate(${-x * depth}px, ${-y * depth}px)`;
    });
  });
  stage.addEventListener("pointerleave", () => {
    for (const { el } of floats) el.style.transform = "";
  });
}

/** Loads each demo's script when its section is about to scroll into view. */
function setupDemos() {
  const demos = { files: "./demo-files.js", board: "./demo-board.js", history: "./demo-history.js", ai: "./demo-ai.js" };
  const start = (el) => import(demos[el.dataset.demo]).then((demo) => demo.default(el));
  const els = [...document.querySelectorAll("[data-demo]")];
  if (!("IntersectionObserver" in window)) {
    for (const el of els) start(el);
    return;
  }
  const near = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        near.unobserve(entry.target);
        start(entry.target);
      }
    },
    { rootMargin: "600px 0px" },
  );
  for (const el of els) near.observe(el);
}
