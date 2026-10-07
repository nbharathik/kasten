import type { ChatMessage, ChatRole } from "@kasten-slides/wasm";

import type { Patch } from "../../../session/elements.ts";
import { SelectField } from "../controls.tsx";
import type { SectionProps } from "../types.ts";
import { json, only, same } from "../values.ts";
import { patchEach } from "../write.ts";
import { CodeArea } from "./CodeArea.tsx";
import { CompositeSection } from "./CompositeSection.tsx";
import { ListEditor, MixedList } from "./ListEditor.tsx";

const ROLES: { value: ChatRole; label: string }[] = [
  { value: "system", label: "System" },
  { value: "user", label: "User" },
  { value: "assistant", label: "Assistant" },
  { value: "toolCall", label: "Tool call" },
  { value: "toolResult", label: "Tool result" },
];

/** Who speaks after this message: the other side of a conversation. */
const REPLY: Record<ChatRole, ChatRole> = { system: "user", user: "assistant", assistant: "user", toolCall: "toolResult", toolResult: "assistant" };

/** A conversation: its messages, each said by a role, in order. */
export function ChatSection({ session, ui, elements }: SectionProps) {
  const chats = only(elements, "chat");
  const lists = chats.map((c) => c.messages);
  const alike = lists.every((list) => same(list, lists[0]));
  const messages: ChatMessage[] = lists[0] ?? [];
  const set = (next: ChatMessage[]) => patchEach(session, chats, (): Patch => ({ messages: json(next) }));
  const edit = (index: number, change: Partial<ChatMessage>) => set(messages.map((m, i) => (i === index ? { ...m, ...change } : m)));

  return (
    <CompositeSection id="conversation" title="Conversation" ui={ui} ids={chats.map((c) => c.id)}>
      {alike ? (
        <ListEditor
          label="Messages"
          items={messages}
          rowName={(i) => `Message ${i + 1}`}
          empty="There are no messages yet."
          addLabel="Add message"
          row={(message, i) => (
            <>
              <SelectField label={`Role of message ${i + 1}`} value={message.role} options={ROLES} onPick={(role) => edit(i, { role })} />
              <CodeArea label={`Text of message ${i + 1}`} value={message.text} code={false} rows={3} primary={i === 0} placeholder="What is said" onCommit={(text) => edit(i, { text })} />
            </>
          )}
          onAdd={() => set([...messages, { role: REPLY[messages.at(-1)?.role ?? "assistant"], text: "" }])}
          onRemove={(i) => set(messages.filter((_, at) => at !== i))}
          onMove={(from, to) => {
            const next = [...messages];
            const [moved] = next.splice(from, 1);
            if (moved) next.splice(to, 0, moved);
            set(next);
          }}
        />
      ) : (
        <MixedList what="messages" />
      )}
    </CompositeSection>
  );
}
