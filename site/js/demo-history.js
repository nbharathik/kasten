// The history demo: five versions of a page, what changed in each, and a
// restore that adds a version instead of erasing any. Lines an agent wrote
// stay marked until someone edits them.

import { h, icon } from "./dom.js";

const intro = ["p", "A town by the sea, Wednesday to Monday."];
const todo = (text, done = false) => ["todo", text, done];
const itinerary = [
  ["h", "Itinerary"],
  ["p", "Wednesday: fly out, check in near the harbour"],
  ["p", "Thursday: the old town and the market"],
];

const VERSIONS = [
  { time: "Mon 9:12", who: "You", kind: "you", what: "Started the page", body: [intro, ["h", "Before we go"], todo("Flights")] },
  { time: "Mon 9:40", who: "You", kind: "you", what: "Added two to-dos", body: [intro, ["h", "Before we go"], todo("Flights"), todo("Offline maps"), todo("Travel insurance")] },
  {
    time: "Tue 11:05",
    who: "Claude",
    kind: "agent",
    what: "Wrote an itinerary",
    body: [intro, ...itinerary, ["p", "Friday: a day trip to the lighthouse"], ["h", "Before we go"], todo("Flights"), todo("Offline maps"), todo("Travel insurance")],
  },
  { time: "Wed 18:30", who: "You", kind: "you", what: "Booked the flights, cut Friday", body: [intro, ...itinerary, ["h", "Before we go"], todo("Flights", true), todo("Offline maps"), todo("Travel insurance")] },
  {
    time: "Now",
    who: "You",
    kind: "you",
    what: "Added a packing note",
    body: [intro, ...itinerary, ["h", "Before we go"], todo("Flights", true), todo("Offline maps"), todo("Travel insurance"), ["p", "Pack light: the ferry takes one bag each."]],
  },
];
const MAX_VERSIONS = 8;

export default function historyDemo(root) {
  const range = root.querySelector("[data-history-range]");
  const list = root.querySelector("[data-history-list]");
  const body = root.querySelector("[data-history-body]");
  const when = root.querySelector("[data-history-when]");
  const restore = root.querySelector("[data-history-restore]");
  const note = root.querySelector("[data-history-note]");
  const versions = VERSIONS.map((version) => ({ ...version }));
  let current = versions.length - 1;

  function show(index, message = "") {
    current = index;
    range.max = String(versions.length - 1);
    range.value = String(index);
    const version = versions[index];
    range.setAttribute("aria-valuetext", `${version.time}, ${version.who}: ${version.what}`);
    const latest = index === versions.length - 1;
    when.textContent = latest ? "The page now" : `As it was ${version.time}`;
    restore.disabled = latest || versions.length >= MAX_VERSIONS;
    body.replaceChildren(...changes(versions, index).map(block));
    list.replaceChildren(
      ...versions
        .map((item, i) =>
          h(
            "li",
            {},
            h(
              "button",
              { type: "button", "aria-current": String(i === index), onclick: () => show(i) },
              h("span", { class: `dh-who is-${item.kind}` }, item.kind === "agent" ? icon("#i-sparkle") : item.kind === "restore" ? icon("#i-restore") : "Y"),
              h("span", { class: "dh-what" }, item.what, h("small", {}, item.who)),
              h("span", { class: "dh-time" }, item.time),
            ),
          ),
        )
        .reverse(),
    );
    note.textContent = latest ? message : `This is the page as it was ${version.time}. Restoring it makes a new version; nothing after it is lost.`;
  }

  range.addEventListener("input", () => show(Number(range.value)));
  restore.addEventListener("click", () => {
    const from = versions[current];
    for (const item of versions) if (item.time === "Now") item.time = "Today";
    versions.push({ time: "Now", who: "You", kind: "restore", what: `Restored ${from.time}`, body: from.body.map((part) => [...part]) });
    show(versions.length - 1, "Restored as a new version. Every later version is still here.");
  });
  show(current);
}

/** The blocks of version `index` beside those of the one before: kept,
 * added or removed, each marked if an agent wrote it and no one has
 * changed it since. */
function changes(versions, index) {
  const marked = agentMarks(versions, index);
  const before = index > 0 ? versions[index - 1].body : [];
  return align(before, versions[index].body).map(({ op, part, j }) => ({ op, part, agent: op !== "removed" && marked[j] }));
}

/** Which blocks of version `index` an agent wrote. */
function agentMarks(versions, upto) {
  let marks = [];
  for (let i = 0; i <= upto; i++) {
    const before = i > 0 ? versions[i - 1].body : [];
    const was = marks;
    marks = [];
    for (const { op, i: from, j } of align(before, versions[i].body)) {
      if (op === "removed") continue;
      marks[j] = op === "kept" ? was[from] : versions[i].kind === "agent";
    }
  }
  return marks;
}

/** An alignment of two lists of blocks by their longest common run. */
function align(a, b) {
  const key = (part) => (part[0] === "todo" ? `todo:${part[1]}` : part.join(":"));
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = key(a[i]) === key(b[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && key(a[i]) === key(b[j])) {
      out.push({ op: a[i][2] === b[j][2] ? "kept" : "changed", part: b[j], i, j });
      i++;
      j++;
    } else if (j < m && (i === n || lcs[i][j + 1] >= lcs[i + 1][j])) {
      out.push({ op: "added", part: b[j], j });
      j++;
    } else {
      out.push({ op: "removed", part: a[i], i });
      i++;
    }
  }
  return out;
}

function block({ op, part, agent }) {
  const [kind, text, done] = part;
  const cls = [op === "added" || op === "changed" ? "is-added" : "", op === "removed" ? "is-removed" : "", agent ? "is-agent" : ""].filter(Boolean).join(" ");
  if (kind === "h") return h("p", { class: cls ? `dh-h ${cls}` : "dh-h" }, text);
  if (kind === "todo") return h("p", { class: cls || null }, h("span", { class: done ? "dh-box is-done" : "dh-box" }, done ? icon("#i-check") : null), text);
  return h("p", { class: cls || null }, text);
}
