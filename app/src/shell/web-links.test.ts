import { afterEach, describe, expect, it, vi } from "vitest";

import { followWebLink } from "./web-links";

function anchor(href: string, where?: HTMLElement): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = "link";
  (where ?? document.body).appendChild(a);
  return a;
}

function click(target: Element, init: MouseEventInit = {}) {
  const event = new MouseEvent(init.button === 1 ? "auxclick" : "click", { bubbles: true, cancelable: true, button: 0, ...init });
  Object.defineProperty(event, "target", { value: target });
  return event;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("web links in the desktop app", () => {
  it("opens a web link outside the app, on a click or a middle click", () => {
    const open = vi.fn();
    const a = anchor("https://kasten.app/docs");
    const event = click(a.appendChild(document.createElement("span")));
    followWebLink(event, open);
    expect(open).toHaveBeenCalledWith("https://kasten.app/docs");
    expect(event.defaultPrevented).toBe(true);
    followWebLink(click(a, { button: 1 }), open);
    expect(open).toHaveBeenCalledTimes(2);
    followWebLink(click(anchor("mailto:me@example.com")), open);
    expect(open).toHaveBeenLastCalledWith("mailto:me@example.com");
  });

  it("leaves the app's own links, handled clicks and right clicks alone", () => {
    const open = vi.fn();
    const own = click(anchor("#/library"));
    followWebLink(own, open);
    expect(own.defaultPrevented).toBe(false);
    const handled = click(anchor("https://kasten.app"));
    handled.preventDefault();
    followWebLink(handled, open);
    followWebLink(click(anchor("https://kasten.app"), { button: 2 }), open);
    expect(open).not.toHaveBeenCalled();
  });

  it("takes the window nowhere for a link the app doesn't route", () => {
    const open = vi.fn();
    for (const href of ["../sources/paper.pdf#page=3", "file:///etc/passwd", "javascript:alert(1)", "other.html", ""]) {
      const event = click(anchor(href));
      followWebLink(event, open);
      expect(event.defaultPrevented, href).toBe(true);
    }
    expect(open).not.toHaveBeenCalled();
  });

  it("in text being edited, follows a link only with Ctrl or Cmd, as editors do", () => {
    const open = vi.fn();
    const page = document.createElement("div");
    page.setAttribute("contenteditable", "true");
    document.body.appendChild(page);
    const a = anchor("https://kasten.app", page);
    const plain = click(a);
    followWebLink(plain, open);
    expect(open).not.toHaveBeenCalled();
    expect(plain.defaultPrevented).toBe(true);
    followWebLink(click(a, { ctrlKey: true }), open);
    followWebLink(click(a, { metaKey: true }), open);
    expect(open).toHaveBeenCalledTimes(2);
  });
});
