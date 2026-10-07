// The same cases as the core's (tests/core/capture.rs), so the browser
// preview captures as the app does.

import { describe, expect, it } from "vitest";

import { splitCapture } from "./capture-split";
import { bodyFacts } from "./vault-text";

describe("a capture keeps each line once", () => {
  it("makes a one-line thought a title alone", () => {
    expect(splitCapture("Buy milk")).toEqual({ title: "Buy milk", body: "" });
    expect(splitCapture("  Buy milk  \n\n")).toEqual({ title: "Buy milk", body: "" });
    expect(splitCapture("Buy milk.").title).toBe("Buy milk");
    expect(splitCapture("Is it done?").title).toBe("Is it done?");
    expect(splitCapture("Wait...").title).toBe("Wait...");
  });

  it("takes the first line as the title and does not repeat it", () => {
    expect(splitCapture("Call the **printer** about toner\nThey open at nine.")).toEqual({ title: "Call the printer about toner", body: "They open at nine.\n" });
    expect(splitCapture("# Weekly plan\n\n- [ ] Draft the intro\n- [ ] Book the room")).toEqual({ title: "Weekly plan", body: "- [ ] Draft the intro\n- [ ] Book the room\n" });
  });

  it("keeps a first line that would lose something in the body", () => {
    for (const markdown of ["- [ ] Call the venue\n- [ ] Pack", "Read [the paper](https://example.org/p) tonight", "Look at [[Zettelkasten method]] again", "Try `cargo bench` on the laptop", "> A quote to keep"]) {
      const { title, body } = splitCapture(markdown);
      expect(title, markdown).not.toBe("");
      expect(body, markdown).toBe(`${markdown}\n`);
    }
  });

  it("splits a long first line after its first sentence", () => {
    expect(splitCapture("Photos pile up because nobody sorts them. A weekly ten-minute review might fix that, if it is easy to start.")).toEqual({
      title: "Photos pile up because nobody sorts them",
      body: "A weekly ten-minute review might fix that, if it is easy to start.\n",
    });
  });

  it("keeps a long line with no sentence to split whole in the body", () => {
    const long = "Notes we never find again are the real cost of keeping notes and the reason search matters so much to people";
    const { title, body } = splitCapture(long);
    expect(title.endsWith("…")).toBe(true);
    expect([...title].length).toBeLessThanOrEqual(81);
    expect(long.startsWith(title.slice(0, -1))).toBe(true);
    expect(body).toBe(`${long}\n`);
  });

  it("leaves a first line that repeats the title out of the excerpt", () => {
    expect(bodyFacts("Buy milk\nFrom the corner shop.\n", "Buy milk").excerpt).toBe("From the corner shop.");
    expect(bodyFacts("# Weekly plan\n\nDraft the intro.\n", "Weekly plan").excerpt).toBe("Draft the intro.");
    expect(bodyFacts("Buy milk today.\n", "Buy").excerpt).toBe("Buy milk today.");
  });
});
