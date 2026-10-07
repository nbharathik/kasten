// Settings → AI providers: the endpoints chats talk to,
// the Anthropic API or any OpenAI-compatible server such as a local vLLM
// server, each with the model new chats start with. Keys are kept in the
// system keychain by the backend; the window never sees them again.

import { useEffect, useRef, useState } from "react";

import { takeProvidersJump } from "../../../chat/actions";
import { useChat } from "../../../chat/store";
import type { ChatProvider, ProviderCheck } from "../../../chat/types";
import { Icon } from "../../../../ui/Icon";
import { Group, Row } from "./parts";
import { ProviderForm } from "./ProviderForm";
import { CheckResult } from "./providers/CheckResult";

const KINDS = { anthropic: "Anthropic", openai: "OpenAI-compatible" } as const;
const BUTTON = "ui-btn";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** `editing` while the form for a new provider is open. */
const NEW = "\u0000new";

export function AIProviders() {
  const providers = useChat((s) => s.providers);
  const problem = useChat((s) => s.providersError);
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void useChat.getState().loadProviders();
    // "Set up in Settings → AI providers" in the chat opens Settings here.
    if (takeProvidersJump()) top.current?.scrollIntoView?.({ block: "start" });
  }, []);

  const names = providers?.map((p) => p.name) ?? [];
  return (
    <div ref={top} className="scroll-mt-6">
      <Group title="AI providers" detail="Chat talks to these: the Anthropic API, or any OpenAI-compatible server such as a local vLLM server. Keys are kept in your system keychain, never in the vault.">
        {problem && (
          <Row label="The providers could not be read" detail={problem}>
            {null}
          </Row>
        )}
        {providers === null && (
          <Row label="Reading the providers…">
            {null}
          </Row>
        )}
        {providers?.length === 0 && editing !== NEW && (
          <Row label="No providers yet" detail="Add one to start chatting">
            {null}
          </Row>
        )}
        {providers?.map((provider) =>
          editing === provider.name ? (
            <ProviderForm key={provider.name} provider={provider} taken={names} onDone={() => setEditing(null)} />
          ) : (
            <ProviderRow
              key={provider.name}
              provider={provider}
              removing={removing === provider.name}
              onEdit={() => {
                setRemoving(null);
                setEditing(provider.name);
              }}
              onRemove={(on) => setRemoving(on ? provider.name : null)}
            />
          ),
        )}
        {editing === NEW ? (
          <ProviderForm provider={null} taken={names} onDone={() => setEditing(null)} />
        ) : (
          <div className="py-3">
            <button type="button" className={BUTTON} disabled={providers === null} onClick={() => setEditing(NEW)}>
              Add a provider
            </button>
          </div>
        )}
      </Group>
    </div>
  );
}

function ProviderRow({ provider, removing, onEdit, onRemove }: { provider: ChatProvider; removing: boolean; onEdit(): void; onRemove(on: boolean): void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<ProviderCheck | null>(null);
  const test = async () => {
    setChecking(true);
    setCheck(null);
    try {
      setCheck(await useChat.getState().ensure().testProvider(provider.name));
    } catch (err) {
      setCheck({ ok: false, model: provider.model, millis: 0, reply: "", message: message(err) });
    } finally {
      setChecking(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await useChat.getState().removeProvider(provider.name);
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  };
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await useChat.getState().confirmProvider(provider.name);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  const detail = `${KINDS[provider.kind]} · ${provider.model} · ${provider.baseUrl} · ${provider.hasKey ? "Key in your system keychain" : "No key stored"}`;
  if (removing) {
    return (
      <div role="alertdialog" aria-label={`Remove ${provider.name}?`} className="flex flex-wrap items-center gap-3 py-3" onKeyDown={(e) => e.key === "Escape" && onRemove(false)}>
        <div className="min-w-0 flex-1">
          <div className="text-14 font-medium">Remove “{provider.name}”?</div>
          <div className="mt-0.5 text-13 text-muted">{error ?? "Its key is deleted from your system keychain too. Chats using it pick another provider."}</div>
        </div>
        <button type="button" className={BUTTON} onClick={() => onRemove(false)}>
          Cancel
        </button>
        <button type="button" autoFocus className="ui-btn is-danger is-sm" disabled={busy} onClick={() => void remove()}>
          {busy ? "Removing…" : "Remove"}
        </button>
      </div>
    );
  }
  // A vault someone shared can name any server; notes go there only once
  // confirmed on this computer.
  const asking = provider.confirmed ? null : error ?? `This vault's settings send chats to this provider. Nothing goes to ${provider.baseUrl} from this computer until you confirm it.`;
  return (
    <Row label={provider.name} detail={<ProviderDetail detail={detail} check={check} checking={checking} asking={asking} />}>
      <div className="flex gap-2">
        {!provider.confirmed && (
          <button type="button" className={BUTTON} aria-label={`Confirm ${provider.name}`} disabled={busy} onClick={() => void confirm()}>
            Confirm
          </button>
        )}
        <button type="button" className={BUTTON} aria-label={`Test ${provider.name}`} disabled={checking} onClick={() => void test()}>
          {checking ? "Testing…" : "Test connection"}
        </button>
        <button type="button" className={BUTTON} aria-label={`Change ${provider.name}`} onClick={onEdit}>
          Change
        </button>
        <button type="button" className={BUTTON} aria-label={`Remove ${provider.name}`} onClick={() => onRemove(true)}>
          Remove
        </button>
      </div>
    </Row>
  );
}

/** The provider's settings, whether its address waits to be confirmed,
 * and the last test's outcome under them. */
function ProviderDetail({ detail, check, checking, asking }: { detail: string; check: ProviderCheck | null; checking: boolean; asking: string | null }) {
  return (
    <>
      <span className="block">{detail}</span>
      {asking && (
        <span className="mt-1 flex items-start gap-1.5 text-warning">
          <Icon name="alert" className="mt-px size-3.5 shrink-0" />
          <span>{asking}</span>
        </span>
      )}
      {checking && <span className="mt-1 block text-muted">Asking the model for one word…</span>}
      {check && <CheckResult check={check} className="mt-1" />}
    </>
  );
}
