// Full screen: the editor covers the whole window of the app. What follows the mode: the mark on the body, the host's hook, and Escape.

import { afterEach, describe, expect, it, vi } from "vitest";

import { FULL_SCREEN_ATTRIBUTE, watchFullScreen } from "./full-screen.ts";
import { EditorUi } from "./ui-state.ts";

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const marked = () => document.body.hasAttribute(FULL_SCREEN_ATTRIBUTE);

afterEach(() => {
  document.body.removeAttribute(FULL_SCREEN_ATTRIBUTE);
  document.body.replaceChildren();
});

describe("the mode", () => {
  it("is off to begin with and switches", () => {
    const ui = new EditorUi();
    expect(ui.state.fullScreen).toBe(false);
    ui.toggleFullScreen();
    expect(ui.state.fullScreen).toBe(true);
    ui.toggleFullScreen();
    expect(ui.state.fullScreen).toBe(false);
  });

  it("does not tell its watchers when it is set to what it is", () => {
    const ui = new EditorUi();
    const seen = vi.fn();
    ui.subscribe(seen);
    ui.setFullScreen(false);
    expect(seen).not.toHaveBeenCalled();
    ui.setFullScreen(true);
    ui.setFullScreen(true);
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe("the page while an editor is in full screen", () => {
  it("is marked, and not otherwise", () => {
    const ui = new EditorUi();
    const stop = watchFullScreen(ui);
    expect(marked()).toBe(false);
    ui.setFullScreen(true);
    expect(document.body.getAttribute(FULL_SCREEN_ATTRIBUTE)).toBe("true");
    ui.setFullScreen(false);
    expect(marked()).toBe(false);
    stop();
  });

  it("is marked when the mode is already on as the watch starts", () => {
    const ui = new EditorUi();
    ui.setFullScreen(true);
    const stop = watchFullScreen(ui);
    expect(marked()).toBe(true);
    stop();
    expect(marked()).toBe(false);
  });

  it("stays marked until the last editor in full screen is out", () => {
    const one = new EditorUi();
    const two = new EditorUi();
    const stopOne = watchFullScreen(one);
    const stopTwo = watchFullScreen(two);
    one.setFullScreen(true);
    two.setFullScreen(true);
    two.setFullScreen(false);
    expect(marked()).toBe(true);
    stopTwo();
    expect(marked()).toBe(true);
    stopOne();
    expect(marked()).toBe(false);
  });

  it("is off, and unmarked, when the editor goes away", () => {
    const ui = new EditorUi();
    const stop = watchFullScreen(ui);
    ui.setFullScreen(true);
    stop();
    expect(ui.state.fullScreen).toBe(false);
    expect(marked()).toBe(false);
    // A watch that is over no longer follows the mode.
    ui.setFullScreen(true);
    expect(marked()).toBe(false);
  });

  it("does not use the browser's Fullscreen API: the editor fills the app's window, not the monitor", async () => {
    const request = vi.fn(async () => {});
    const exit = vi.fn(async () => {});
    Object.defineProperty(document.documentElement, "requestFullscreen", { configurable: true, value: request });
    Object.defineProperty(document, "exitFullscreen", { configurable: true, value: exit });
    const ui = new EditorUi();
    const stop = watchFullScreen(ui);
    ui.setFullScreen(true);
    ui.setFullScreen(false);
    await settle();
    stop();
    expect(request).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    Reflect.deleteProperty(document.documentElement, "requestFullscreen");
    Reflect.deleteProperty(document, "exitFullscreen");
  });
});

describe("a host with a hook of its own", () => {
  it("is told when the mode goes on and when it goes off, and reads its hook when the mode changes", () => {
    const ui = new EditorUi();
    const stop = watchFullScreen(ui);
    const fullScreen = vi.fn();
    // The host gives its actions after the editor has started.
    ui.actions = { fullScreen };
    ui.setFullScreen(true);
    expect(fullScreen).toHaveBeenLastCalledWith(true);
    ui.setFullScreen(false);
    expect(fullScreen).toHaveBeenLastCalledWith(false);
    expect(fullScreen).toHaveBeenCalledTimes(2);
    stop();
  });

  it("may fail or refuse without stopping the mode", async () => {
    const ui = new EditorUi();
    const stop = watchFullScreen(ui);
    ui.actions = {
      fullScreen: () => {
        throw new Error("no window");
      },
    };
    expect(() => ui.setFullScreen(true)).not.toThrow();
    expect(ui.state.fullScreen).toBe(true);
    ui.actions = { fullScreen: () => Promise.reject(new Error("later")) };
    ui.setFullScreen(false);
    ui.setFullScreen(true);
    await settle();
    expect(ui.state.fullScreen).toBe(true);
    stop();
  });

  it("is told to give the screen back when the editor goes away, and not told about off when the mode never was on", () => {
    const ui = new EditorUi();
    const stop = watchFullScreen(ui);
    const fullScreen = vi.fn();
    ui.actions = { fullScreen };
    ui.setFullScreen(true);
    stop();
    expect(fullScreen).toHaveBeenLastCalledWith(false);
    expect(ui.state.fullScreen).toBe(false);

    const idle = new EditorUi();
    const stopIdle = watchFullScreen(idle);
    const never = vi.fn();
    idle.actions = { fullScreen: never };
    stopIdle();
    expect(never).not.toHaveBeenCalled();
  });
});

describe("Escape", () => {
  const press = (target: EventTarget, init: KeyboardEventInit = {}): KeyboardEvent => {
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  };

  it("leaves full screen when nothing else took it, wherever the focus is", () => {
    const ui = new EditorUi();
    const stop = watchFullScreen(ui);
    ui.setFullScreen(true);
    const button = document.body.appendChild(document.createElement("button"));
    const event = press(button);
    expect(ui.state.fullScreen).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    ui.setFullScreen(true);
    press(document.body);
    expect(ui.state.fullScreen).toBe(false);
    stop();
  });

  it("does nothing outside full screen, and does not take the key", () => {
    const ui = new EditorUi();
    const stop = watchFullScreen(ui);
    const event = press(document.body);
    expect(event.defaultPrevented).toBe(false);
    expect(ui.state.fullScreen).toBe(false);
    stop();
  });

  it("is left to whatever took it: a handler that prevented it, a field, a menu, a dialog, a text being composed", () => {
    const ui = new EditorUi();
    const stop = watchFullScreen(ui);
    ui.setFullScreen(true);
    const taken = document.body.appendChild(document.createElement("div"));
    taken.addEventListener("keydown", (event) => event.preventDefault());
    press(taken);
    const field = document.body.appendChild(document.createElement("textarea"));
    press(field);
    const editable = document.body.appendChild(document.createElement("div"));
    editable.setAttribute("contenteditable", "true");
    press(editable);
    const menu = document.body.appendChild(document.createElement("div"));
    menu.className = "ks-popover";
    press(menu.appendChild(document.createElement("button")));
    const dialog = document.body.appendChild(document.createElement("div"));
    dialog.className = "ks-scrim";
    press(dialog.appendChild(document.createElement("button")));
    press(document.body, { isComposing: true });
    expect(ui.state.fullScreen).toBe(true);
    stop();
  });

  it("is left to a modal window of the host, such as a palette, while one is open", () => {
    const ui = new EditorUi();
    const stop = watchFullScreen(ui);
    ui.setFullScreen(true);
    const modal = document.body.appendChild(document.createElement("div"));
    modal.setAttribute("aria-modal", "true");
    press(document.body);
    expect(ui.state.fullScreen).toBe(true);
    modal.remove();
    press(document.body);
    expect(ui.state.fullScreen).toBe(false);
    stop();
  });

  it("is not listened to any more once the editor has gone away", () => {
    const ui = new EditorUi();
    const stop = watchFullScreen(ui);
    stop();
    ui.setFullScreen(true);
    press(document.body);
    expect(ui.state.fullScreen).toBe(true);
  });
});
