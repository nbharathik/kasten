import { afterEach, describe, expect, it } from "vitest";

import { wantsSystemMenu } from "./native-menu";

function rightClick(target: Element): MouseEvent {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 });
  Object.defineProperty(event, "target", { value: target });
  return event;
}

function add<T extends HTMLElement>(el: T): T {
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = "";
  window.getSelection()?.removeAllRanges();
});

describe("the system's menu in the desktop app", () => {
  it("is kept for text being written: fields and the page editor", () => {
    expect(wantsSystemMenu(rightClick(add(document.createElement("textarea"))))).toBe(true);
    const field = add(document.createElement("input"));
    expect(wantsSystemMenu(rightClick(field))).toBe(true);
    const page = add(document.createElement("div"));
    page.setAttribute("contenteditable", "true");
    const word = page.appendChild(document.createElement("strong"));
    expect(wantsSystemMenu(rightClick(word))).toBe(true);
  });

  it("is kept for selected text, to copy it", () => {
    const message = add(document.createElement("p"));
    message.textContent = "A reply worth keeping";
    expect(wantsSystemMenu(rightClick(message))).toBe(false);
    const range = document.createRange();
    range.selectNodeContents(message);
    window.getSelection()!.addRange(range);
    expect(wantsSystemMenu(rightClick(message))).toBe(true);
  });

  it("is left out everywhere else, where it would only go back or reload", () => {
    const button = add(document.createElement("button"));
    expect(wantsSystemMenu(rightClick(button))).toBe(false);
    const box = add(document.createElement("input"));
    box.type = "checkbox";
    expect(wantsSystemMenu(rightClick(box))).toBe(false);
    const readOnly = add(document.createElement("div"));
    readOnly.setAttribute("contenteditable", "false");
    expect(wantsSystemMenu(rightClick(readOnly))).toBe(false);
  });
});
