// Settings for AI agents: how to connect one, and the guardrail limits
// after which its changes wait for review.

import { useEffect, useState } from "react";

import { appInfo, mcpToken } from "../../../../lib/api";
import type { VaultConfig } from "../../../../lib/vault/types";
import { useWorkspace } from "../../store";
import { appServer, BARE, claudeCodeCommand, httpCommand, httpUrl, mcpConfig, tokenPath, urlConfig, type Server } from "./connect";
import { Group, Row } from "./parts";

interface Limit {
  key: string;
  label: string;
  detail: string;
  unit: string;
  /** From the stored value to the one shown, and back. */
  show: (value: number) => number;
  store: (value: number) => number;
}

const same = (v: number) => v;

const LIMITS: Limit[] = [
  { key: "max_removed_fraction", label: "Largest removal", detail: "An edit removing more of a note's text waits for review", unit: "%", show: (v) => Math.round(v * 100), store: (v) => v / 100 },
  { key: "max_notes_per_session_10min", label: "Notes changed in 10 minutes", detail: "Past this, a session's further changes wait for review", unit: "notes", show: same, store: same },
  { key: "max_trash_per_session", label: "Notes trashed per session", detail: "Past this, moving notes to the trash waits for review", unit: "notes", show: same, store: same },
  { key: "max_board_nodes_removed", label: "Cards removed from a board at once", detail: "More than this waits for review", unit: "cards", show: same, store: same },
  { key: "max_slides_removed", label: "Slides taken out of decks in 10 minutes", detail: "Removing slides or emptying them; past this a change waits for review, even in a trusted session. A deck moved to the trash always waits", unit: "slides", show: same, store: same },
  { key: "max_write_bytes", label: "Largest single write", detail: "Bigger writes are refused outright", unit: "KB", show: (v) => Math.round(v / 1024), store: (v) => v * 1024 },
  { key: "max_asset_bytes", label: "Largest picture an agent may add", detail: "Bigger pictures and files are refused outright", unit: "MB", show: (v) => Math.round(v / 1048576), store: (v) => v * 1048576 },
  { key: "max_assets_per_session_10min", label: "Pictures added in 10 minutes", detail: "Past this a session's pictures are refused; a PowerPoint file comes in whole or not at all", unit: "pictures", show: same, store: same },
  { key: "max_asset_bytes_per_session_10min", label: "Picture data added in 10 minutes", detail: "Past this a session's pictures are refused", unit: "MB", show: (v) => Math.round(v / 1048576), store: (v) => v * 1048576 },
];

export function AgentSettings() {
  const client = useWorkspace((s) => s.client);
  const toast = useWorkspace((s) => s.toast);
  const [config, setConfig] = useState<VaultConfig | null>(null);

  // The installed app serves MCP itself; the browser preview shows kasten-mcp.
  const [server, setServer] = useState<Server>(BARE);
  useEffect(() => {
    client?.getConfig().then(setConfig, () => {});
  }, [client]);
  useEffect(() => {
    appInfo().then((info) => info?.exe && setServer(appServer(info.exe)), () => {});
  }, []);

  const save = async (key: string, value: number) => {
    if (!client || !config || !Number.isFinite(value) || value < 0 || config.guardrails[key] === value) return;
    try {
      // Read again first: the AI providers above live in the same file and
      // may have changed since this section loaded it.
      const current = await client.getConfig();
      const next = { ...current, guardrails: { ...current.guardrails, [key]: value } };
      await client.setConfig(next);
      setConfig(next);
      toast("Saved the new limit");
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err));
    }
  };

  const vault = client?.kind === "preview" ? "~/Notes" : (client?.label ?? "~/Notes");
  const { go } = useWorkspace.getState();

  return (
    <Group title="AI agents" detail="Agents such as Claude Code work on your notes through Kasten's MCP server. Changes are recorded in history. Changes that meet a review rule wait for your decision.">
      <Row label="Connect Claude Code" detail="Run this once in a terminal">
        <CopyButton text={claudeCodeCommand(vault, server)} />
      </Row>
      <Row label="Claude Desktop, Cursor and other MCP apps" detail="Add this to the app's MCP settings (its mcpServers)">
        <CopyButton text={mcpConfig(vault, server)} label="Copy the config" />
      </Row>
      <Row
        label="Clients that connect by URL"
        detail={`Start the server with the command, then connect to ${httpUrl()} with the token as a bearer. It answers this computer only; the token is kept in ${tokenPath(vault)}.`}
      >
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <CopyButton text={httpCommand(vault, server)} label="Copy the command" />
          <CopyButton text={urlConfig()} label="Copy the URL config" />
          <TokenButton />
        </div>
      </Row>
      <Row label="Changes waiting and past sessions" detail="Accept or reject proposals; undo a whole session">
        <div className="flex gap-2">
          <button type="button" className="rounded-md px-2.5 py-1 text-13 ring-1 ring-line hover:bg-hover" onClick={() => go({ view: "review" })}>
            Review
          </button>
          <button type="button" className="rounded-md px-2.5 py-1 text-13 ring-1 ring-line hover:bg-hover" onClick={() => go({ view: "history" })}>
            History
          </button>
        </div>
      </Row>
      {config &&
        LIMITS.filter((limit) => config.guardrails[limit.key] !== undefined).map((limit) => (
          <Row key={limit.key} label={limit.label} detail={limit.detail}>
            <label className="flex items-center gap-1.5 text-13 text-muted">
              <input
                type="number"
                min={0}
                aria-label={limit.label}
                defaultValue={limit.show(config.guardrails[limit.key]!)}
                className="h-8 w-20 rounded-md border border-line bg-canvas px-2 text-right text-13 text-ink outline-none focus:border-accent"
                onBlur={(e) => void save(limit.key, limit.store(Number(e.currentTarget.value)))}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              />
              {limit.unit}
            </label>
          </Row>
        ))}
    </Group>
  );
}

const SNIPPET = "max-w-[300px] truncate rounded-md bg-panel px-2 py-1 font-mono text-12 ring-1 ring-line hover:ring-accent/50";

/** Copies the HTTP server's token, which is never shown. */
function TokenButton() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const { toast } = useWorkspace.getState();
    try {
      const token = await mcpToken();
      if (!token) return toast("The browser preview serves no MCP, so it has no token");
      await navigator.clipboard?.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <button type="button" className={SNIPPET} onClick={() => void copy()}>
      {copied ? "Copied ✓" : "Copy the token"}
    </button>
  );
}

/** A snippet that copies itself when clicked. */
function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={SNIPPET}
      title={`Copy: ${text}`}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => setCopied(true));
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied ✓" : (label ?? text)}
    </button>
  );
}
