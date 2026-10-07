import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readWorks } from "./bib";
import { KeyField } from "./KeyField";

afterEach(cleanup);

const WORKS = readWorks(readFileSync(join(import.meta.dirname, "../../../../../../fixtures/dev-vault/references.bib"), "utf8"));

/** The field with a value of its own, inside something that hears the keys it lets through. */
function Field({ start = "", works = WORKS, onKey }: { start?: string; works?: typeof WORKS; onKey?: (key: string) => void }) {
  const [value, setValue] = useState(start);
  return (
    <div onKeyDown={(event) => onKey?.(event.key)}>
      <KeyField works={works} value={value} onChange={setValue} />
    </div>
  );
}

const field = () => screen.getByRole("combobox", { name: "Citation key" }) as HTMLInputElement;
const options = () => screen.queryAllByRole("option").map((o) => o.querySelector(".kasten-clip-work-key")!.textContent);

describe("the citation key field", () => {
  it("offers the works that match what is typed, up to six, best first", () => {
    render(<Field />);
    fireEvent.focus(field());
    expect(options()).toHaveLength(6);
    fireEvent.change(field(), { target: { value: "bengio" } });
    expect(options()).toEqual(["lecun2015deep", "goodfellow2016deep"]);
    fireEvent.change(field(), { target: { value: "he20" } });
    expect(options()).toEqual(["he2016resnet"]);
    fireEvent.change(field(), { target: { value: "zebra" } });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("shows who and what each work is", () => {
    render(<Field />);
    fireEvent.change(field(), { target: { value: "vaswani" } });
    expect(within(screen.getByRole("option")).getByText("Vaswani et al., 2017 · Attention is all you need")).toBeTruthy();
  });

  it("moves through the works with the arrow keys and takes one with Enter", () => {
    render(<Field />);
    fireEvent.change(field(), { target: { value: "bengio" } });
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[0]!.getAttribute("aria-selected")).toBe("true");
    expect(field().getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[0]!.id);
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    // Round to the first again.
    expect(screen.getAllByRole("option")[0]!.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(field(), { key: "ArrowUp" });
    expect(screen.getAllByRole("option")[1]!.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(field().value).toBe("goodfellow2016deep");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("takes a work clicked", () => {
    render(<Field />);
    fireEvent.change(field(), { target: { value: "resnet" } });
    fireEvent.click(screen.getByRole("option"));
    expect(field().value).toBe("he2016resnet");
  });

  it("lets Enter through when no work is chosen, so the form is sent", () => {
    render(<Field />);
    fireEvent.change(field(), { target: { value: "bengio" } });
    // fireEvent says false when the key was cancelled.
    expect(fireEvent.keyDown(field(), { key: "Enter" })).toBe(true);
  });

  it("closes its list with Escape, and only then lets Escape go on to the form", () => {
    const heard = vi.fn();
    render(<Field onKey={heard} />);
    fireEvent.change(field(), { target: { value: "bengio" } });
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(heard).not.toHaveBeenCalled();
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(heard).toHaveBeenCalledWith("Escape");
  });

  it("opens on focus and closes when the focus leaves", () => {
    render(<Field />);
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.focus(field());
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.blur(field());
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("does not list works once the key is one of them", () => {
    render(<Field start="lecun2015deep" />);
    fireEvent.focus(field());
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByText("LeCun et al., 2015 · Deep learning")).toBeTruthy();
  });
});

describe("what the field says of the key", () => {
  it("names the work when the key is a work's", () => {
    render(<Field start="devlin2019bert" />);
    expect(screen.getByText(/^Devlin et al\., 2019 · BERT: Pre-training/)).toBeTruthy();
  });

  it("says a key the bibliography lacks is kept anyway", () => {
    render(<Field start="nobody1999" />);
    expect(screen.getByText("Not in the vault's .bib files yet. The key is kept with the figure.")).toBeTruthy();
  });

  it("says the vault has no bibliography when it has none", () => {
    render(<Field works={[]} />);
    expect(screen.getByText("No .bib file in the vault yet. Type the key the paper will have.")).toBeTruthy();
  });

  it("refuses a key that cannot be one, as an alert", () => {
    render(<Field start="two words" />);
    expect(screen.getByRole("alert").textContent).toBe("A citation key has no spaces, commas, braces, quotes or backslashes");
    expect(field().getAttribute("aria-invalid")).toBe("true");
  });

  it("says nothing before anything is typed when there is a bibliography", () => {
    render(<Field />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(".kasten-clip-note")).toBeNull();
  });
});
