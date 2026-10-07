import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MemoryVault } from "../features/workspace/preview/memory-vault";
import { useWorkspace } from "../features/workspace/store";
import { StatusBar } from "./StatusBar";

afterEach(() => {
  cleanup();
  useWorkspace.setState({ client: null });
});

const kept = { load: () => null, save: () => {} };

describe("the status bar", () => {
  it("says where a preview keeps its notes", () => {
    useWorkspace.setState({ client: new MemoryVault({}, kept) });
    const { unmount } = render(<StatusBar />);
    expect(screen.getByLabelText("Vault").textContent).toBe("Browser preview: sample notes, saved in this browser");
    unmount();
    // ?samples=dev and the speed checks keep theirs in memory only.
    useWorkspace.setState({ client: new MemoryVault({}) });
    render(<StatusBar />);
    expect(screen.getByLabelText("Vault").textContent).toBe("Browser preview: sample notes, kept until you reload");
  });
});
