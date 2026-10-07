// The plain-files demo: a page and the Markdown file it is, kept in step.
// Ticking a to-do, changing the status, renaming the page or adding a line
// with [[links]] changes the file beside it, the way Kasten saves a page.

import { h, icon, still, wait, whenSeen } from "./dom.js";

const PAGES = [
  { title: "Packing list", where: "Seaside trip" },
  { title: "Harbour walk", where: "Seaside trip" },
  { title: "Ferry times", where: "Pages" },
  { title: "Budget", where: "Seaside trip" },
  { title: "Zettelkasten method", where: "Pages" },
];
const MAX_LINES = 5;
const LINK = /\[\[([^\]]+)\]\]/g;

export default function filesDemo(root) {
  const el = Object.fromEntries(["title", "status", "todos", "lines", "input", "suggest", "code", "path", "announce"].map((name) => [name, root.querySelector(`[data-${name}]`)]));
  const state = {
    title: el.title.value,
    status: el.status.value,
    todos: [
      { text: "Flights", done: true },
      { text: "Offline maps", done: false },
      { text: "Travel insurance", done: false },
    ],
    lines: [],
  };
  let shown = [];
  let picks = [];
  let active = 0;
  let touring = false;
  let touched = false;

  const say = (text) => {
    if (!touring) el.announce.textContent = text;
  };

  function drawTodos() {
    el.todos.replaceChildren(
      ...state.todos.map((todo) => {
        const box = h("input", { type: "checkbox", checked: todo.done });
        box.addEventListener("change", () => {
          todo.done = box.checked;
          drawFile();
          say(`${todo.text} ${todo.done ? "ticked" : "unticked"}. The file changed with it.`);
        });
        return h("li", {}, h("label", {}, box, todo.text));
      }),
    );
  }

  function drawLines() {
    el.lines.replaceChildren(...state.lines.map((line) => h("p", {}, ...chips(line))));
  }

  function drawFile() {
    const lines = fileLines(state);
    el.path.textContent = `library/${slug(state.title)}.md`;
    let fences = 0;
    el.code.replaceChildren(
      ...lines.map((line, i) => {
        if (line === "---") fences++;
        const changed = shown.length > 0 && shown[i] !== line;
        return h("span", { class: changed ? "ln is-changed" : "ln" }, ...paint(line, fences === 1 && line !== "---"));
      }),
    );
    shown = lines;
  }

  // Typing a line, with [[ offering pages to link.
  const query = () => {
    const upto = el.input.value.slice(0, el.input.selectionStart ?? el.input.value.length);
    const at = upto.lastIndexOf("[[");
    if (at < 0 || upto.slice(at).includes("]]")) return null;
    return { at, text: upto.slice(at + 2) };
  };

  function openSuggest() {
    const found = query();
    if (!found || found.text.length > 40) return closeSuggest();
    const needle = found.text.trim().toLowerCase();
    picks = PAGES.filter((page) => page.title.toLowerCase().includes(needle)).slice(0, 5);
    if (needle && !PAGES.some((page) => page.title.toLowerCase() === needle)) picks.push({ title: found.text.trim(), fresh: true });
    if (picks.length === 0) return closeSuggest();
    active = Math.min(active, picks.length - 1);
    el.suggest.replaceChildren(
      ...picks.map((page, i) =>
        h(
          "li",
          { role: "option", id: `df-option-${i}`, "aria-selected": String(i === active), onmousedown: (event) => (event.preventDefault(), pick(i)) },
          icon(page.fresh ? "#i-plus" : "#i-page"),
          page.fresh ? `New page “${page.title}”` : page.title,
          page.where ? h("small", {}, `in ${page.where}`) : null,
        ),
      ),
    );
    el.suggest.hidden = false;
    el.input.setAttribute("aria-expanded", "true");
    el.input.setAttribute("aria-activedescendant", `df-option-${active}`);
  }

  function closeSuggest() {
    picks = [];
    active = 0;
    el.suggest.hidden = true;
    el.input.setAttribute("aria-expanded", "false");
    el.input.removeAttribute("aria-activedescendant");
  }

  function pick(i) {
    const found = query();
    const page = picks[i];
    if (!found || !page) return;
    const value = el.input.value;
    const before = `${value.slice(0, found.at)}[[${page.title}]] `;
    el.input.value = before + value.slice(el.input.selectionStart ?? value.length).replace(/^\]\]\s?/, "");
    el.input.setSelectionRange(before.length, before.length);
    closeSuggest();
  }

  function commit() {
    const line = el.input.value.trim().replace(/\s+/g, " ");
    if (!line) return;
    state.lines.push(line);
    if (state.lines.length > MAX_LINES) state.lines.shift();
    el.input.value = "";
    drawLines();
    drawFile();
    const fresh = [...line.matchAll(LINK)].map((m) => m[1]).filter((title) => !PAGES.some((page) => page.title.toLowerCase() === title.toLowerCase()));
    say(fresh.length ? `Added the line, and a new page for ${fresh.join(", ")}.` : "Added the line to the page and to the file.");
  }

  el.input.addEventListener("input", () => {
    active = 0;
    openSuggest();
  });
  el.input.addEventListener("click", openSuggest);
  el.input.addEventListener("blur", () => setTimeout(closeSuggest, 120));
  el.input.addEventListener("keydown", (event) => {
    const open = !el.suggest.hidden;
    if (open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      active = (active + (event.key === "ArrowDown" ? 1 : -1) + picks.length) % picks.length;
      openSuggest();
    } else if (open && (event.key === "Enter" || event.key === "Tab")) {
      event.preventDefault();
      pick(active);
    } else if (open && event.key === "Escape") {
      closeSuggest();
    } else if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
  });

  el.title.addEventListener("input", () => {
    state.title = el.title.value;
    drawFile();
  });
  el.title.addEventListener("change", () => say(`Renamed. The file is now ${el.path.textContent}.`));
  el.status.addEventListener("change", () => {
    state.status = el.status.value;
    drawFile();
    say(`Status set to ${state.status}.`);
  });

  setupTabs(root);
  drawTodos();
  drawLines();
  drawFile();

  // A short tour when the demo first comes into view, until the visitor
  // takes over.
  const stop = () => (touched = true);
  root.addEventListener("pointerdown", stop);
  root.addEventListener("keydown", stop);
  whenSeen(root, async () => {
    if (still) return;
    touring = true;
    await wait(900);
    const box = el.todos.querySelectorAll("input")[1];
    if (!touched && box && !box.checked) {
      box.checked = true;
      box.dispatchEvent(new Event("change"));
    }
    await wait(1300);
    for (const letter of "Book the ferry, see [[Fer") {
      if (touched) break;
      el.input.value += letter;
      el.input.dispatchEvent(new Event("input"));
      await wait(55);
    }
    await wait(900);
    if (!touched) pick(0);
    await wait(700);
    if (!touched) commit();
    touring = false;
  });
}

/** On phones the page and the file are tabs. */
function setupTabs(root) {
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  const show = (name) => {
    root.dataset.view = name;
    for (const tab of tabs) {
      const on = tab.id.endsWith(name);
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
    }
  };
  for (const tab of tabs) {
    tab.addEventListener("click", () => show(tab.id.endsWith("file") ? "file" : "page"));
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const other = tabs.find((t) => t !== tab);
      other.focus();
      other.click();
    });
  }
  show("page");
}

/** The page as Kasten writes it. */
function fileLines(state) {
  return [
    "---",
    "id: 01M3A2KTR05W9C8QXZ4JYB6N7D",
    `title: ${yaml(state.title)}`,
    "type: page",
    "icon: ✈️",
    "tags: [travel]",
    "props:",
    `  status: ${state.status}`,
    "---",
    "> [!tip] Trip at a glance",
    "> A town by the sea, Wednesday to Monday.",
    "",
    "## Before we go",
    "",
    ...state.todos.map((todo) => `- [${todo.done ? "x" : " "}] ${todo.text}`),
    ...state.lines.flatMap((line) => ["", line]),
  ];
}

/** A title as YAML: plain when it reads the same, quoted when it would not. */
function yaml(text) {
  const plain = /^[\p{L}\p{N}][\p{L}\p{N} '’.,!?()&-]*$/u.test(text) && text === text.trim();
  return plain ? text : JSON.stringify(text);
}

/** A file name from a title, as Kasten makes one. */
function slug(title) {
  let out = "";
  let dash = false;
  for (const letter of title.toLowerCase()) {
    if (/[\p{L}\p{N}]/u.test(letter)) {
      if (dash && out) out += "-";
      out += letter;
      dash = false;
    } else dash = true;
    if ([...out].length >= 80) break;
  }
  return out || "untitled";
}

/** A line of the page, its [[links]] drawn as links. */
function chips(line) {
  return split(line, (title) => h("span", { class: "df-link" }, icon("#i-page"), title));
}

/** A line of the file, coloured as an editor would. */
function paint(line, frontmatter) {
  if (!line) return [" "];
  if (line === "---") return [h("span", { class: "t-dim" }, line)];
  if (frontmatter) {
    const pair = /^(\s*[\w-]+:)(.*)$/.exec(line);
    return pair ? [h("span", { class: "t-key" }, pair[1]), pair[2]] : [line];
  }
  if (line.startsWith("## ")) return [h("span", { class: "t-head" }, line)];
  if (line.startsWith("> ")) return [h("span", { class: "t-dim" }, "> "), line.slice(2)];
  const todo = /^- \[( |x)\] (.*)$/.exec(line);
  if (todo) return [h("span", { class: todo[1] === "x" ? "t-done" : "t-dim" }, `- [${todo[1]}]`), " ", ...links(todo[2])];
  return links(line);
}

const links = (text) => split(text, (title) => h("span", { class: "t-link" }, `[[${title}]]`));

/** Text with each [[link]] made by `make`. */
function split(text, make) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    parts.push(text.slice(last, m.index), make(m[1]));
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts.filter((part) => part !== "");
}
