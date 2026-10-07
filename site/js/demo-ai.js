// The AI demo: a chat that makes a change you can keep or undo in one step,
// and a bigger change that waits for your review.

import { h, icon, mark, wait, whenSeen } from "./dom.js";

const b = (text) => h("b", {}, text);

const RUNS = {
  packing: {
    chip: "Make a packing list",
    ask: "Make a packing list for the seaside trip.",
    steps: ["Read “Seaside trip”", "Made the page “Packing list”", "Linked it from “Seaside trip”"],
    reply: () => ["I made ", b("Packing list"), " with twelve things to bring and linked it from ", b("Seaside trip"), ". What I wrote is marked on both pages."],
    card: {
      kind: "session",
      title: "Claude's session · 2 changes",
      items: [
        ["add", "Packing list", "new page"],
        ["edit", "Seaside trip", "1 line added"],
      ],
      actions: [
        { label: "Undo session", icon: "#i-undo", then: "Undone as new commits, so even the undo is in History.", strike: true, primary: true },
        { label: "Keep", then: "Kept. The marks go, and the change stays in History." },
      ],
    },
  },
  tidy: {
    chip: "Clear out my old trip notes",
    ask: "Clear out my old trip notes.",
    steps: ["Searched your notes", "Found 6 notes tagged #old-trip"],
    reply: () => ["Moving 6 notes to the trash is more than an agent may do on its own, so it ", b("waits for you"), "."],
    card: {
      kind: "review",
      title: "Waiting for your review",
      items: [["trash", "6 notes tagged #old-trip", "to the trash"]],
      actions: [
        { label: "Approve", then: "Approved. They're in the trash, and History brings them back in one click.", strike: true, primary: true },
        { label: "Reject", then: "Rejected. Nothing changed." },
      ],
    },
  },
};

export default function aiDemo(root) {
  const log = root.querySelector("[data-ai-log]");
  const chips = root.querySelector("[data-ai-chips]");
  let busy = false;

  const add = (el) => {
    log.append(el);
    log.scrollTop = log.scrollHeight;
    return el;
  };

  function drawChips() {
    chips.replaceChildren(
      ...Object.entries(RUNS).map(([name, run]) => h("button", { type: "button", disabled: busy, onclick: () => play(name) }, run.chip)),
    );
  }

  async function play(name) {
    if (busy) return;
    busy = true;
    drawChips();
    const run = RUNS[name];
    add(h("div", { class: "msg msg-user" }, run.ask));
    await wait(500);
    const steps = h("ul", { class: "steps" });
    const said = h("div", {}, steps);
    const answer = add(h("div", { class: "msg msg-ai is-thinking", "aria-busy": "true" }, mark(), said));
    for (const step of run.steps) {
      await wait(650);
      steps.append(h("li", {}, icon("#i-check"), step));
      log.scrollTop = log.scrollHeight;
    }
    await wait(450);
    answer.classList.remove("is-thinking");
    answer.removeAttribute("aria-busy");
    said.append(h("p", {}, ...run.reply()));
    await wait(300);
    said.append(card(run.card));
    log.scrollTop = log.scrollHeight;
    busy = false;
    drawChips();
  }

  function card(spec) {
    const items = spec.items.map(([kind, what, how]) =>
      h("li", {}, h("span", { class: `chg chg-${kind}`, "aria-hidden": "true" }, { add: "+", edit: "~", trash: "−" }[kind]), what, h("small", {}, how)),
    );
    const footer = h("footer", {});
    const settle = (action) => {
      if (action.strike) for (const item of items) item.classList.add("is-gone");
      footer.replaceChildren(h("p", {}, action.then));
    };
    footer.append(
      ...spec.actions.map((action) =>
        h("button", { type: "button", class: `btn btn-sm ${action.primary ? "btn-primary" : "btn-ghost"}`, onclick: () => settle(action) }, action.icon ? icon(action.icon) : null, action.label),
      ),
    );
    return h(
      "section",
      { class: `card-box${spec.kind === "review" ? " is-review" : ""}`, "aria-label": spec.title },
      h("header", {}, icon(spec.kind === "review" ? "#i-eye" : "#i-sparkle"), spec.title),
      h("ul", {}, items),
      footer,
    );
  }

  root.querySelector("[data-ai-replay]").addEventListener("click", () => {
    if (busy) return;
    log.replaceChildren();
    play("packing");
  });
  drawChips();
  whenSeen(root, () => play("packing"));
}
