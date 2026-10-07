// How it flows: the step in the middle of the screen is the one the window
// beside the steps shows.

export function setupFlow() {
  const list = document.querySelector(".flow-steps");
  if (!list || !("IntersectionObserver" in window)) return;
  const steps = [...list.querySelectorAll(".flow-step")];
  const shots = [...document.querySelectorAll(".flow-shot")];
  const title = document.querySelector("[data-flow-title]");

  const show = (index) => {
    steps.forEach((step, i) => {
      step.classList.toggle("is-active", i === index);
      step.classList.toggle("is-done", i < index);
    });
    shots.forEach((shot, i) => shot.classList.toggle("is-active", i === index));
    if (title) title.textContent = shots[index]?.dataset.title ?? "";
    list.style.setProperty("--progress", `${(index / Math.max(1, steps.length - 1)) * 100}%`);
  };

  const middle = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) if (entry.isIntersecting) show(steps.indexOf(entry.target));
    },
    { rootMargin: "-45% 0px -45% 0px" },
  );
  for (const step of steps) middle.observe(step);
  show(0);
}
