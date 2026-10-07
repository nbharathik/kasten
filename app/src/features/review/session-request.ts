// Asks the History view to show one agent session: "See in History" on an
// agent's writing in a page. A History already open takes the session at
// once; one about to open takes it when it mounts.

import { useEffect, useRef } from "react";

import { useWorkspace, type OpenHow } from "../workspace/store";

type Listener = (session: string) => void;

let pending: string | null = null;
const listeners = new Set<Listener>();

/** Opens History on its agent sessions, with `session` open. */
export function showSession(session: string, how: OpenHow = "here"): void {
  pending = session;
  useWorkspace.getState().go({ view: "history" }, how);
  for (const listener of listeners) listener(session);
  if (listeners.size) pending = null;
}

/** Lets History take requests: the one waiting, then each new one. */
export function useSessionRequests(onSession: Listener): void {
  const handler = useRef(onSession);
  useEffect(() => {
    handler.current = onSession;
  }, [onSession]);
  useEffect(() => {
    const listener: Listener = (session) => handler.current(session);
    if (pending !== null) {
      listener(pending);
      pending = null;
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
}
