import { describe, expect, it } from "vitest";

import { appServer, claudeCodeCommand, httpCommand, httpUrl, mcpConfig, tokenPath, urlConfig } from "./connect";

describe("connecting agents", () => {
  it("quotes the vault for a shell, spaces and quotes included", () => {
    expect(claudeCodeCommand("/home/me/My Notes")).toBe('claude mcp add --scope user kasten -- kasten-mcp --vault "/home/me/My Notes"');
    expect(httpCommand('C:\\Users\\me\\Say "hi"')).toBe('kasten-mcp --vault "C:\\Users\\me\\Say \\"hi\\"" --http');
  });

  it("writes an mcpServers entry other apps can paste", () => {
    expect(JSON.parse(mcpConfig("C:\\Users\\me\\Notes"))).toEqual({ mcpServers: { kasten: { command: "kasten-mcp", args: ["--vault", "C:\\Users\\me\\Notes"] } } });
  });

  it("says where the token is, in the vault's own style of path", () => {
    expect(tokenPath("/home/me/Notes/")).toBe("/home/me/Notes/.kasten/cache/mcp-token");
    expect(tokenPath("C:\\Users\\me\\Notes")).toBe("C:\\Users\\me\\Notes\\.kasten\\cache\\mcp-token");
  });

  it("uses the installed app itself when it knows where it is", () => {
    const app = appServer("C:\\Program Files\\Kasten\\kasten-app.exe");
    expect(claudeCodeCommand("C:\\Notes", app)).toBe('claude mcp add --scope user kasten -- "C:\\Program Files\\Kasten\\kasten-app.exe" --mcp --vault "C:\\Notes"');
    expect(JSON.parse(mcpConfig("/home/me/Notes", appServer("/usr/bin/kasten-app")))).toEqual({ mcpServers: { kasten: { command: "/usr/bin/kasten-app", args: ["--mcp", "--vault", "/home/me/Notes"] } } });
    expect(httpCommand("/home/me/Notes", appServer("/usr/bin/kasten-app"))).toBe('/usr/bin/kasten-app --mcp --vault "/home/me/Notes" --http');
  });

  it("gives clients that connect by URL the address, with the token to paste in", () => {
    expect(httpUrl()).toBe("http://127.0.0.1:7433/mcp");
    expect(JSON.parse(urlConfig())).toEqual({ mcpServers: { kasten: { type: "http", url: "http://127.0.0.1:7433/mcp", headers: { Authorization: "Bearer <token>" } } } });
  });
});
