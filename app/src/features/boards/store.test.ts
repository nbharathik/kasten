import { beforeEach, describe, expect, it } from "vitest";

import type { BoardInfo, VaultClient } from "../../lib/vault/types";
import { useWorkspace } from "../workspace/store";
import { useBoards } from "./store";

const info = (title: string): BoardInfo => ({ path: `library/${title}.canvas`, title, project: null, nodes: 0, modified: 0 });

beforeEach(() => useBoards.setState({ list: [], loaded: false, creating: false }));

describe("the boards list", () => {
  it("keeps the newest answer when two loads cross", async () => {
    const answers: ((list: BoardInfo[]) => void)[] = [];
    const client = { boards: () => new Promise<BoardInfo[]>((resolve) => answers.push(resolve)) } as unknown as VaultClient;
    useWorkspace.setState({ client });
    const first = useBoards.getState().load();
    const second = useBoards.getState().load();
    answers[1]!([info("new"), info("old")]);
    await second;
    answers[0]!([info("old")]);
    await first;
    expect(useBoards.getState().list.map((b) => b.title)).toEqual(["new", "old"]);
  });
});
