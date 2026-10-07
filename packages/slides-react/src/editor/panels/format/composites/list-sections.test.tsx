import type { Element } from "@kasten-slides/wasm";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { edit, enter, held, mount, section } from "../test-kit.tsx";
import { addCitationKeys, parseKeys, showKeys } from "./citation-keys.ts";

afterEach(cleanup);

type Kit = Awaited<ReturnType<typeof mount>>;
type Of<K extends Element["type"]> = Extract<Element, { type: K }>;
const at = { x: 64, y: 148, w: 600, h: 260 };
const chat = (extra: Partial<Of<"chat">> = {}): Element => ({ type: "chat", id: "", messages: [{ role: "system", text: "Be brief." }, { role: "user", text: "Hi" }], ...at, ...extra }) as Element;
const probs = (extra: Partial<Of<"token-probs">> = {}): Element =>
  ({ type: "token-probs", id: "", tokens: ["The", " cat"], next: [{ token: " sat", p: 0.6 }, { token: " ran", p: 0.4 }], chosen: 0, ...at, ...extra }) as Element;
const grid = (extra: Partial<Of<"card-grid">> = {}): Element => ({ type: "card-grid", id: "", cards: [{ title: "Plan", body: "Think." }, { title: "Act" }], ...at, ...extra }) as Element;
const cite = (extra: Partial<Of<"citation">> = {}): Element => ({ type: "citation", id: "", keys: ["vaswani2017"], ...at, ...extra }) as Element;
const the = <K extends Element["type"]>(kit: Kit, at = 0) => held(kit, kit.ids[at] as string) as Of<K>;

describe("Conversation", () => {
  const box = (name: string) => within(section("conversation")).getByLabelText(name) as HTMLTextAreaElement;
  const role = (n: number) => within(section("conversation")).getByRole("combobox", { name: `Role of message ${n}` }) as HTMLSelectElement;

  it("lists the messages with a role and the words of each", async () => {
    await mount({ elements: [chat()] });
    expect([role(1).value, role(2).value]).toEqual(["system", "user"]);
    expect([box("Text of message 1").value, box("Text of message 2").value]).toEqual(["Be brief.", "Hi"]);
    expect(box("Text of message 1").hasAttribute("data-primary")).toBe(true);
  });

  it("changes a role, and the words of a message when the box is left, each one step of undo", async () => {
    const kit = await mount({ elements: [chat()] });
    fireEvent.change(role(2), { target: { value: "assistant" } });
    expect(the<"chat">(kit).messages[1]?.role).toBe("assistant");
    fireEvent.change(box("Text of message 2"), { target: { value: "Hello!" } });
    fireEvent.blur(box("Text of message 2"));
    expect(the<"chat">(kit).messages[1]).toEqual({ role: "assistant", text: "Hello!" });
    edit(() => kit.session.undo());
    expect(the<"chat">(kit).messages[1]).toEqual({ role: "assistant", text: "Hi" });
    expect(box("Text of message 2").value).toBe("Hi");
  });

  it("adds a message said by the other side, and takes one away", async () => {
    const kit = await mount({ elements: [chat()] });
    fireEvent.click(within(section("conversation")).getByRole("button", { name: "Add message" }));
    expect(the<"chat">(kit).messages.map((m) => m.role)).toEqual(["system", "user", "assistant"]);
    expect(the<"chat">(kit).messages[2]?.text).toBe("");
    fireEvent.click(within(section("conversation")).getByRole("button", { name: "Remove message 1" }));
    expect(the<"chat">(kit).messages.map((m) => m.text)).toEqual(["Hi", ""]);
  });

  it("moves a message up and down", async () => {
    const kit = await mount({ elements: [chat()] });
    fireEvent.click(within(section("conversation")).getByRole("button", { name: "Move message 2 up" }));
    expect(the<"chat">(kit).messages.map((m) => m.text)).toEqual(["Hi", "Be brief."]);
    fireEvent.click(within(section("conversation")).getByRole("button", { name: "Move message 1 down" }));
    expect(the<"chat">(kit).messages.map((m) => m.text)).toEqual(["Be brief.", "Hi"]);
    edit(() => kit.session.undo());
    edit(() => kit.session.undo());
    expect(the<"chat">(kit).messages.map((m) => m.text)).toEqual(["Be brief.", "Hi"]);
  });

  it("offers the five roles", async () => {
    await mount({ elements: [chat()] });
    expect([...role(1).options].map((o) => o.textContent)).toEqual(["System", "User", "Assistant", "Tool call", "Tool result"]);
  });

  it("does not show a list for conversations that differ, and says Mixed", async () => {
    await mount({ elements: [chat(), chat({ messages: [{ role: "user", text: "Other" }] })] });
    expect(within(section("conversation")).getByText(/Mixed: the selected items have different messages/)).toBeTruthy();
    expect(within(section("conversation")).queryByRole("button", { name: "Add message" })).toBeNull();
  });
});

describe("Token probabilities", () => {
  const tokens = () => within(section("token-probs")).getByLabelText("Tokens so far") as HTMLTextAreaElement;
  const token = (n: number) => within(section("token-probs")).getByRole("textbox", { name: `Next token ${n}` }) as HTMLInputElement;
  const chance = (n: number) => within(section("token-probs")).getByLabelText(`Chance of next token ${n}`) as HTMLInputElement;
  const picked = (n: number) => within(section("token-probs")).getByRole("radio", { name: `Picked: next token ${n}` }) as HTMLInputElement;

  it("shows the tokens one to a line, with their spaces, and the next tokens with their chances in percent", async () => {
    await mount({ elements: [probs()] });
    expect(tokens().value).toBe("The\n cat");
    expect(tokens().hasAttribute("data-primary")).toBe(true);
    expect([token(1).value, token(2).value]).toEqual([" sat", " ran"]);
    expect([chance(1).value, chance(2).value]).toEqual(["60", "40"]);
    expect([picked(1).checked, picked(2).checked]).toEqual([true, false]);
  });

  it("makes the tokens from the lines, keeping leading spaces and dropping empty lines", async () => {
    const kit = await mount({ elements: [probs()] });
    fireEvent.change(tokens(), { target: { value: "The\n cat\n\n sat\r\n on" } });
    fireEvent.blur(tokens());
    expect(the<"token-probs">(kit).tokens).toEqual(["The", " cat", " sat", " on"]);
  });

  it("changes a token, and a chance from percent to a number from 0 to 1", async () => {
    const kit = await mount({ elements: [probs()] });
    enter(token(2), " walked");
    expect(the<"token-probs">(kit).next[1]).toEqual({ token: " walked", p: 0.4 });
    enter(chance(2), "12.5");
    expect(the<"token-probs">(kit).next[1]?.p).toBe(0.125);
    expect(chance(2).value).toBe("12.5");
  });

  it("picks the token that was chosen, and clears the pick", async () => {
    const kit = await mount({ elements: [probs()] });
    fireEvent.click(picked(2));
    expect(the<"token-probs">(kit).chosen).toBe(1);
    fireEvent.click(within(section("token-probs")).getByRole("button", { name: "Clear pick" }));
    expect(the<"token-probs">(kit).chosen).toBeUndefined();
    // With nothing picked there is nothing to clear.
    expect(within(section("token-probs")).queryByRole("button", { name: "Clear pick" })).toBeNull();
  });

  it("adds a token, and keeps the pick on the token it was on when one before it goes", async () => {
    const kit = await mount({ elements: [probs({ chosen: 1 })] });
    fireEvent.click(within(section("token-probs")).getByRole("button", { name: "Add token" }));
    expect(the<"token-probs">(kit).next).toHaveLength(3);
    expect(the<"token-probs">(kit).next[2]).toEqual({ token: "", p: 0 });
    fireEvent.click(within(section("token-probs")).getByRole("button", { name: "Remove next token 1" }));
    expect(the<"token-probs">(kit).next.map((n) => n.token)).toEqual([" ran", ""]);
    expect(the<"token-probs">(kit).chosen).toBe(0);
    fireEvent.click(within(section("token-probs")).getByRole("button", { name: "Remove next token 1" }));
    expect(the<"token-probs">(kit).chosen).toBeUndefined();
  });

  it("says when the chances do not add up to 100 percent", async () => {
    await mount({ elements: [probs({ next: [{ token: "a", p: 0.9 }, { token: "b", p: 0.5 }] })] });
    expect(within(section("token-probs")).getByText(/These add up to 140%/)).toBeTruthy();
    cleanup();
    await mount({ elements: [probs()] });
    expect(within(section("token-probs")).queryByText(/These add up/)).toBeNull();
  });

  it("follows undo", async () => {
    const kit = await mount({ elements: [probs()] });
    enter(chance(1), "10");
    edit(() => kit.session.undo());
    expect(chance(1).value).toBe("60");
  });
});

describe("Cards", () => {
  const title = (n: number) => within(section("cards")).getByLabelText(`Title of card ${n}`) as HTMLInputElement;
  const body = (n: number) => within(section("cards")).getByLabelText(`Text of card ${n}`) as HTMLTextAreaElement;
  const columns = () => within(section("cards")).getByLabelText("Cards to a row") as HTMLInputElement;

  it("lists each card with its title and its line", async () => {
    await mount({ elements: [grid()] });
    expect([title(1).value, title(2).value]).toEqual(["Plan", "Act"]);
    expect([body(1).value, body(2).value]).toEqual(["Think.", ""]);
    expect(title(1).closest("[data-primary]")).not.toBeNull();
  });

  it("changes a title on Enter and a line when its box is left; a card with no line has none rather than an empty one", async () => {
    const kit = await mount({ elements: [grid()] });
    enter(title(2), "Do");
    fireEvent.change(body(2), { target: { value: "Call a tool." } });
    fireEvent.blur(body(2));
    expect(the<"card-grid">(kit).cards[1]).toEqual({ title: "Do", body: "Call a tool." });
    fireEvent.change(body(1), { target: { value: "  " } });
    fireEvent.blur(body(1));
    expect(the<"card-grid">(kit).cards[0]).toEqual({ title: "Plan" });
  });

  it("adds a card, takes one away and moves one", async () => {
    const kit = await mount({ elements: [grid()] });
    fireEvent.click(within(section("cards")).getByRole("button", { name: "Add card" }));
    expect(the<"card-grid">(kit).cards).toHaveLength(3);
    fireEvent.click(within(section("cards")).getByRole("button", { name: "Move card 2 up" }));
    expect(the<"card-grid">(kit).cards.map((c) => c.title)).toEqual(["Act", "Plan", ""]);
    fireEvent.click(within(section("cards")).getByRole("button", { name: "Remove card 3" }));
    expect(the<"card-grid">(kit).cards.map((c) => c.title)).toEqual(["Act", "Plan"]);
    edit(() => kit.session.undo());
    expect(the<"card-grid">(kit).cards).toHaveLength(3);
  });

  it("sets how many cards to a row, or leaves it to the drawing", async () => {
    const kit = await mount({ elements: [grid()] });
    expect(columns().value).toBe("");
    expect(within(section("cards")).getByRole("button", { name: "Automatic" }).hasAttribute("disabled")).toBe(true);
    enter(columns(), "2");
    expect(the<"card-grid">(kit).columns).toBe(2);
    enter(columns(), "9");
    expect(the<"card-grid">(kit).columns).toBe(6);
    fireEvent.click(within(section("cards")).getByRole("button", { name: "Automatic" }));
    expect(the<"card-grid">(kit).columns).toBeUndefined();
  });

  it("still sets the columns of grids whose cards differ", async () => {
    const kit = await mount({ elements: [grid(), grid({ cards: [{ title: "Only" }] })] });
    expect(within(section("cards")).getByText(/Mixed: the selected items have different cards/)).toBeTruthy();
    enter(columns(), "3");
    expect(kit.ids.map((id) => (held(kit, id) as Of<"card-grid">).columns)).toEqual([3, 3]);
  });
});

describe("Citation", () => {
  const keys = () => within(section("citation")).getByLabelText("Citation keys") as HTMLInputElement;
  const format = () => within(section("citation")).getByLabelText("Citation format") as HTMLSelectElement;

  it("shows the keys and the format", async () => {
    await mount({ elements: [cite({ keys: ["a2020", "b2021"], format: "numbered" })] });
    expect(keys().value).toBe("a2020, b2021");
    expect(format().value).toBe("numbered");
    expect(keys().closest("[data-primary]")).not.toBeNull();
  });

  it("makes the keys from what is typed, whether it is separated by commas, semicolons or spaces", async () => {
    const kit = await mount({ elements: [cite()] });
    enter(keys(), "x1, x2;x3  x1");
    expect(the<"citation">(kit).keys).toEqual(["x1", "x2", "x3"]);
    enter(keys(), "");
    expect(the<"citation">(kit).keys).toEqual([]);
  });

  it("chooses the format, and short is what it is when it names none", async () => {
    const kit = await mount({ elements: [cite()] });
    expect(format().value).toBe("short");
    fireEvent.change(format(), { target: { value: "list" } });
    expect(the<"citation">(kit).format).toBe("list");
    expect([...format().options].map((o) => o.value)).toEqual(["short", "numbered", "full", "list"]);
  });

  it("shows Mixed for citations with different keys, and sets them all", async () => {
    const kit = await mount({ elements: [cite(), cite({ keys: ["other"], y: 20 })] });
    expect(keys().value).toBe("");
    expect(keys().placeholder).toBe("Mixed");
    enter(keys(), "shared");
    expect(kit.ids.map((id) => (held(kit, id) as Of<"citation">).keys)).toEqual([["shared"], ["shared"]]);
  });

  it("leaves a place for the citation picker: adding a key is one step of undo and never doubles a key", async () => {
    const kit = await mount({ elements: [cite({ keys: ["a"] }), cite({ keys: ["a", "b"], y: 20 })] });
    const both = kit.ids.map((id) => held(kit, id));
    edit(() => expect(addCitationKeys(kit.session, both, ["b", "c"])).toBe(true));
    expect(kit.ids.map((id) => (held(kit, id) as Of<"citation">).keys)).toEqual([["a", "b", "c"], ["a", "b", "c"]]);
    edit(() => kit.session.undo());
    expect(kit.ids.map((id) => (held(kit, id) as Of<"citation">).keys)).toEqual([["a"], ["a", "b"]]);
    expect(addCitationKeys(kit.session, kit.ids.map((id) => held(kit, id)), ["a"])).toBe(false);
  });

  it("reads keys from a box and writes them back", () => {
    expect(parseKeys(" a ,b;; c a")).toEqual(["a", "b", "c"]);
    expect(showKeys(["a", "b"])).toBe("a, b");
    expect(parseKeys("")).toEqual([]);
  });
});

describe("The sections of composites in a mixed selection", () => {
  it("shows a section for each kind, each acting on its own kind only", async () => {
    const kit = await mount({ elements: [chat(), grid({ y: 20 }), { type: "text", id: "", ...at, text: { paragraphs: [{ runs: [{ t: "Hello" }] }] } } as Element] });
    expect(screen.getByRole("heading", { name: "Conversation" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Cards" })).toBeTruthy();
    fireEvent.click(within(section("cards")).getByRole("button", { name: "Add card" }));
    expect(the<"card-grid">(kit, 1).cards).toHaveLength(3);
    expect(the<"chat">(kit, 0).messages).toHaveLength(2);
    expect(screen.getByText("3 elements")).toBeTruthy();
  });

  it("has no section for elements that are not composites", async () => {
    await mount({ elements: [{ type: "shape", id: "", shape: "rect", ...at } as Element] });
    expect(document.querySelector('[data-section="code"], [data-section="cards"], [data-section="conversation"]')).toBeNull();
  });
});
