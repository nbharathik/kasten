// How to point an agent at this vault: a command for Claude Code, a config
// entry for other MCP apps (Claude Desktop, Cursor and the like), and the
// HTTP server, with its address and token, for clients that connect by
// URL. The installed app serves MCP itself (`--mcp`); a developer's build
// may use the `kasten-mcp` binary instead.

/** How to start the server: a program and its first arguments. */
export interface Server {
  command: string;
  args: string[];
}

/** The standalone `kasten-mcp` binary, on the PATH. */
export const BARE: Server = { command: "kasten-mcp", args: [] };

/** The app itself, at `exe`, as an MCP server. */
export const appServer = (exe: string): Server => ({ command: exe, args: ["--mcp"] });

/** A path in double quotes for a shell, inner quotes escaped. */
const quoted = (path: string) => `"${path.replaceAll('"', '\\"')}"`;

/** A program for a shell: quoted when it has spaces or quotes. */
const program = (command: string) => (/[\s"]/.test(command) ? quoted(command) : command);

const line = (server: Server, vault: string, extra: string[] = []) => [program(server.command), ...server.args, "--vault", quoted(vault), ...extra].join(" ");

/** Adds Kasten to Claude Code for every folder it runs in (user scope). */
export function claudeCodeCommand(vault: string, server: Server = BARE): string {
  return `claude mcp add --scope user kasten -- ${line(server, vault)}`;
}

/** The `mcpServers` entry MCP apps read from their JSON config. */
export function mcpConfig(vault: string, server: Server = BARE): string {
  return JSON.stringify({ mcpServers: { kasten: { command: server.command, args: [...server.args, "--vault", vault] } } }, null, 2);
}

/** Starts the local HTTP server; clients send the token as a bearer. */
export function httpCommand(vault: string, server: Server = BARE): string {
  return line(server, vault, ["--http"]);
}

/** The port the HTTP server listens on. */
export const HTTP_PORT = 7433;

/** Where clients reach the HTTP server: this computer only. */
export const httpUrl = (port = HTTP_PORT) => `http://127.0.0.1:${port}/mcp`;

/** The entry clients that connect by URL read, the token to be pasted in. */
export function urlConfig(port = HTTP_PORT): string {
  return JSON.stringify({ mcpServers: { kasten: { type: "http", url: httpUrl(port), headers: { Authorization: "Bearer <token>" } } } }, null, 2);
}

/** Where the HTTP server keeps its token, inside the vault. */
export function tokenPath(vault: string): string {
  const sep = vault.includes("\\") && !vault.includes("/") ? "\\" : "/";
  return [vault.replace(/[\\/]+$/, ""), ".kasten", "cache", "mcp-token"].join(sep);
}
