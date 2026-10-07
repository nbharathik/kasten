// The window's own actions, always at the top right: the quick glance (the
// side stack, to look at other pages beside this one) and the chat.

import { useShell } from "../lib/store";
import { keyTitle } from "../features/shortcuts/store";
import { useWorkspace } from "../features/workspace/store";
import { IconButton } from "../ui/Button";

export function GlobalActions() {
  const stackOpen = useWorkspace((s) => s.stackOpen);
  const chatOpen = useShell((s) => s.chatOpen);
  return (
    <div className="flex shrink-0 items-center gap-0.5 self-center pl-1 pr-2">
      <IconButton
        icon="glance"
        label="Quick glance"
        title={keyTitle("Quick glance: find pages and keep them beside this one", "stack")}
        size="sm"
        active={stackOpen}
        onClick={() => useWorkspace.getState().toggleStack()}
      />
      <IconButton icon="chat" label="Chat" title={keyTitle("Chat about the pages open", "chat-dock")} size="sm" active={chatOpen} onClick={() => useShell.getState().toggleChat()} />
    </div>
  );
}
