import type { Deck, Element, Slide } from "@kasten-slides/wasm";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { plainDeck } from "../render/testing/decks.ts";
import { EmbedFrame, LiveLayer, VideoPlayer, liveItems } from "./Live.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const embed = (extra: Record<string, unknown> = {}) => ({ type: "embed", id: "e", x: 10, y: 20, w: 300, h: 200, url: "http://127.0.0.1:9/demo", poster: "posters/p.png", ...extra }) as unknown as Extract<Element, { type: "embed" }>;
const video = (extra: Record<string, unknown> = {}) => ({ type: "video", id: "v", x: 40, y: 50, w: 320, h: 180, src: "assets/clip.webm", poster: "assets/poster.png", ...extra }) as unknown as Extract<Element, { type: "video" }>;
const group = (children: Element[], extra: Record<string, unknown> = {}) => ({ type: "group", id: "g", children, ...extra }) as unknown as Element;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  vi.useRealTimers();
  await act(async () => root.unmount());
  host.remove();
});

const render = (ui: React.ReactElement) => act(async () => root.render(ui));
const settle = () => act(async () => void (await Promise.resolve()));

describe("the live embeds and videos of a slide", () => {
  const scene = (elements: Element[]): { deck: Deck; slide: Slide } => plainDeck(elements);

  it("are the embeds and videos at any depth, with the boxes they are drawn in", () => {
    const { deck, slide } = scene([embed(), group([video()])]);
    const items = liveItems(deck, slide, 0);
    expect(items.map((i) => [i.element.id, i.box])).toEqual([
      ["e", { x: 10, y: 20, w: 300, h: 200 }],
      ["v", { x: 40, y: 50, w: 320, h: 180 }],
    ]);
  });

  it("leave out what a step hides, and what is in a group it hides", () => {
    const { deck, slide } = scene([embed({ stepStates: { 0: "hidden", 2: "normal" } }), group([video()], { stepStates: { 0: "hidden", 1: "normal" } })]);
    expect(liveItems(deck, slide, 0)).toEqual([]);
    expect(liveItems(deck, slide, 1).map((i) => i.element.id)).toEqual(["v"]);
    expect(liveItems(deck, slide, 2).map((i) => i.element.id)).toEqual(["e", "v"]);
  });

  it("are dim when a step dims them", () => {
    const { deck, slide } = scene([embed({ stepStates: { 0: "dimmed" } })]);
    expect(liveItems(deck, slide, 0)[0]?.opacity).toBe(deck.theme.dimmedOpacity);
  });

  it("are a layer the size of the slide, and none when there are none", async () => {
    const { deck, slide } = scene([embed()]);
    await render(<LiveLayer deck={deck} slide={slide} step={0} imageUrl={() => undefined} />);
    expect(host.querySelector<HTMLElement>(".ks-show-live")?.style.width).toBe("960px");
    const plain = scene([]);
    await render(<LiveLayer deck={plain.deck} slide={plain.slide} step={0} imageUrl={() => undefined} />);
    expect(host.querySelector(".ks-show-live")).toBeNull();
  });
});

describe("an embedded page", () => {
  const item = (extra: Record<string, unknown> = {}) => ({ element: embed(extra), box: { x: 10, y: 20, w: 300, h: 200 }, opacity: 1 });
  const yes = vi.fn().mockResolvedValue({});
  const no = vi.fn().mockRejectedValue(new TypeError("refused"));

  it("runs in a frame over its box, sandboxed, see-through until it has loaded", async () => {
    await render(<EmbedFrame item={item()} ask={yes as unknown as typeof fetch} />);
    await settle();
    const frame = host.querySelector<HTMLIFrameElement>("iframe");
    expect(frame?.getAttribute("src")).toBe("http://127.0.0.1:9/demo");
    expect(frame?.getAttribute("sandbox")).toBe("allow-scripts allow-same-origin");
    expect(frame?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(frame?.style.opacity).toBe("0");
    const box = host.querySelector<HTMLElement>(".ks-show-live-item");
    expect([box?.style.left, box?.style.top, box?.style.width, box?.style.height]).toEqual(["10px", "20px", "300px", "200px"]);
    await act(async () => void frame?.dispatchEvent(new Event("load")));
    expect(frame?.style.opacity).toBe("1");
    expect(box?.style.pointerEvents).toBe("auto");
  });

  it("is given no storage of its own when it is a page of the presentation's own origin", async () => {
    await render(<EmbedFrame item={item({ url: `${location.origin}/other` })} ask={yes as unknown as typeof fetch} />);
    await settle();
    expect(host.querySelector("iframe")?.getAttribute("sandbox")).toBe("allow-scripts");
  });

  it("goes away, and leaves the still, when nothing answers at the address", async () => {
    await render(<EmbedFrame item={item()} ask={no as unknown as typeof fetch} />);
    await act(async () => void (await new Promise((done) => setTimeout(done, 10))));
    expect(host.querySelector("iframe")).toBeNull();
  });

  it("goes away when the address answers but the page does not load in time", async () => {
    vi.useFakeTimers();
    await render(<EmbedFrame item={item()} seconds={3} ask={yes as unknown as typeof fetch} />);
    await settle();
    expect(host.querySelector("iframe")).not.toBeNull();
    await act(async () => void vi.advanceTimersByTime(3100));
    expect(host.querySelector("iframe")).toBeNull();
  });

  it("stays when it loads in time", async () => {
    vi.useFakeTimers();
    await render(<EmbedFrame item={item()} seconds={3} ask={yes as unknown as typeof fetch} />);
    await settle();
    await act(async () => void host.querySelector("iframe")?.dispatchEvent(new Event("load")));
    await act(async () => void vi.advanceTimersByTime(10_000));
    expect(host.querySelector("iframe")).not.toBeNull();
  });

  it("is not there at all for an address that is not a web address", async () => {
    for (const url of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,x", "", "not a url"]) {
      await render(<EmbedFrame item={item({ url })} ask={yes as unknown as typeof fetch} />);
      await settle();
      expect(host.querySelector("iframe"), url).toBeNull();
    }
  });
});

describe("a video", () => {
  const item = (extra: Record<string, unknown> = {}) => ({ element: video(extra), box: { x: 40, y: 50, w: 320, h: 180 }, opacity: 1 });
  const urls = (path: string) => `blob:${path}`;

  it("plays in place, with its still until it starts and the controls of the browser", async () => {
    await render(<VideoPlayer item={item()} imageUrl={urls} />);
    const node = host.querySelector("video");
    expect(node?.getAttribute("src")).toBe("blob:assets/clip.webm");
    expect(node?.getAttribute("poster")).toBe("blob:assets/poster.png");
    expect(node?.controls).toBe(true);
    expect(node?.getAttribute("preload")).toBe("metadata");
    expect(node?.hasAttribute("data-autoplay")).toBe(false);
    expect(node?.style.left).toBe("40px");
  });

  it("starts by itself when the video says so, and loops when it says so", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    await render(<VideoPlayer item={item({ autoplay: true, looped: true })} imageUrl={urls} />);
    const node = host.querySelector("video");
    expect(node?.loop).toBe(true);
    expect(node?.hasAttribute("data-autoplay")).toBe(true);
    expect(play).toHaveBeenCalled();
    play.mockRestore();
  });

  it("plays without sound if the browser will not play with it", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValueOnce(new Error("NotAllowedError")).mockResolvedValue(undefined);
    await render(<VideoPlayer item={item({ autoplay: true })} imageUrl={urls} />);
    await settle();
    expect(host.querySelector("video")?.muted).toBe(true);
    expect(play).toHaveBeenCalledTimes(2);
    play.mockRestore();
  });

  it("is not there when the host has no file, or the file cannot be played", async () => {
    await render(<VideoPlayer item={item()} imageUrl={() => undefined} />);
    expect(host.querySelector("video")).toBeNull();
    await render(<VideoPlayer item={item()} imageUrl={urls} />);
    await act(async () => void host.querySelector("video")?.dispatchEvent(new Event("error")));
    expect(host.querySelector("video")).toBeNull();
  });
});
