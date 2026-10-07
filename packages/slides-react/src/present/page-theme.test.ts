import { afterEach, describe, expect, it } from "vitest";

import { pageTheme } from "./page-theme.ts";

afterEach(() => {
  document.body.innerHTML = "";
  delete document.documentElement.dataset.theme;
});

describe("the theme of the page around a presentation", () => {
  it("is none when neither the editor nor the page names one", () => {
    document.body.innerHTML = '<div class="ks-editor"></div>';
    expect(pageTheme()).toBeUndefined();
  });

  it("is the one the page names", () => {
    document.documentElement.dataset.theme = "dark";
    expect(pageTheme()).toBe("dark");
  });

  it("is the editor's when it names one, before the page's", () => {
    document.documentElement.dataset.theme = "light";
    document.body.innerHTML = '<div class="ks-editor" data-theme="dark"></div>';
    expect(pageTheme()).toBe("dark");
  });

  it("is none for a name that is not a theme", () => {
    document.documentElement.dataset.theme = "sepia";
    expect(pageTheme()).toBeUndefined();
  });
});
