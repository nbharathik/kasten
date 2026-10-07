// @vitest-environment node

import type { Theme } from "@kasten-slides/wasm";
import { beforeAll, describe, expect, it } from "vitest";

import { newDeck } from "../test/engine.ts";
import { fontStack } from "./fonts.ts";

let light: Theme;
let serif: Theme;

beforeAll(async () => {
  light = (await newDeck("Light deck", "Light")).deck.theme;
  serif = (await newDeck("Serif deck", "Serif")).deck.theme;
});

describe("fontStack", () => {
  it("makes the theme's roles a quoted family, its fallbacks and a generic at the end", () => {
    expect(fontStack(light, "heading")).toBe('"Inter", "Helvetica Neue", "Arial", sans-serif');
    expect(fontStack(light, "body")).toBe('"Inter", "Helvetica Neue", "Arial", sans-serif');
    expect(fontStack(light, "code")).toBe('"Roboto Mono", "Consolas", monospace');
    expect(fontStack(serif, "heading")).toBe('"Cambria", "Caladea", "Georgia", serif');
  });

  it("is the body font when no font is named", () => {
    expect(fontStack(light)).toBe(fontStack(light, "body"));
    expect(fontStack(light, "")).toBe(fontStack(light, "body"));
  });

  it("uses the fallbacks the theme lists for a family that a run names", () => {
    expect(fontStack(serif, "Cambria")).toBe('"Cambria", "Caladea", "Georgia", serif');
    expect(fontStack(serif, "calibri")).toBe('"Calibri", "Carlito", "Arial", sans-serif');
  });

  it("puts a generic family after a family the theme does not know, judged by its name", () => {
    expect(fontStack(light, "Lato")).toBe('"Lato", sans-serif');
    expect(fontStack(light, "Georgia")).toBe('"Georgia", serif');
    expect(fontStack(light, "Times New Roman")).toBe('"Times New Roman", serif');
    expect(fontStack(light, "Fira Mono")).toBe('"Fira Mono", monospace');
    expect(fontStack(light, "Source Code Pro")).toBe('"Source Code Pro", monospace');
    expect(fontStack(light, "IBM Plex Sans")).toBe('"IBM Plex Sans", sans-serif');
  });

  it("leaves a generic family bare, because in quotes it would name a font", () => {
    expect(fontStack(light, "serif")).toBe("serif");
    const custom: Theme = { ...light, fonts: { ...light.fonts, body: { family: "Lato", fallback: ["Arial", "Sans-Serif"] } } };
    expect(fontStack(custom, "body")).toBe('"Lato", "Arial", sans-serif');
  });

  it("escapes quotes and backslashes, drops empty and repeated names", () => {
    const odd: Theme = {
      ...light,
      fonts: { ...light.fonts, body: { family: 'My "Font"\\', fallback: ["", "my \"font\"\\", "Arial", "Arial"] } },
    };
    expect(fontStack(odd, "body")).toBe('"My \\"Font\\"\\\\", "Arial", sans-serif');
  });
});
