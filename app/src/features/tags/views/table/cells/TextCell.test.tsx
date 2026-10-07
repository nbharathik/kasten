// A link in a table cell opens in the browser, and clicking it doesn't
// start editing the cell.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../../lib/api")>()),
  openUrl: vi.fn(async () => {}),
}));

import * as api from "../../../../../lib/api";
import type { PropDef } from "../../../../../lib/vault/types";
import { TextCell } from "./TextCell";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("a link cell", () => {
  it("opens its link, and the click goes no further", () => {
    const onCell = vi.fn();
    render(
      <div onClick={onCell}>
        <TextCell
          value="https://example.com/reading"
          def={{ type: "url" } as PropDef}
          editing={false}
          seed={null}
          label="site of Reading list"
          path="inbox/a.md"
          anchor={createRef()}
          save={vi.fn()}
          finish={vi.fn()}
        />
      </div>,
    );
    const link = screen.getByRole("link");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    fireEvent(link, click);
    expect(api.openUrl).toHaveBeenCalledWith("https://example.com/reading");
    expect(click.defaultPrevented).toBe(true);
    expect(onCell).not.toHaveBeenCalled();
  });
});
