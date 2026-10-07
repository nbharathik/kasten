// Short messages at the top right, below the tabs and the page's actions,
// with Undo where it makes sense. Each one goes after a few seconds (more
// when it offers an action) unless the pointer or the keyboard is on it.

import "./overlays.css";

import { useEffect, useState } from "react";

import { useWorkspace, type Toast } from "../store";
import { Icon } from "../../../ui/Icon";

/** How long a toast stays, and how long it takes to go. */
export const TOAST_MS = { plain: 4000, action: 8000, leave: 140 };

export function Toasts() {
  const toasts = useWorkspace((s) => s.toasts);
  // Always there, so screen readers hear what arrives in it.
  return (
    <div className="kasten-toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const dismiss = useWorkspace((s) => s.dismiss);
  const [held, setHeld] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (held || leaving) return;
    const timer = setTimeout(() => setLeaving(true), toast.action ? TOAST_MS.action : TOAST_MS.plain);
    return () => clearTimeout(timer);
  }, [held, leaving, toast.action]);

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => dismiss(toast.id), TOAST_MS.leave);
    return () => clearTimeout(timer);
  }, [leaving, dismiss, toast.id]);

  return (
    <div
      className={`kasten-toast${leaving ? " is-leaving" : ""}`}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setHeld(false)}
    >
      <span className="kasten-toast-text">{toast.text}</span>
      {toast.action && (
        <button
          type="button"
          className="kasten-toast-action"
          onClick={() => {
            dismiss(toast.id);
            toast.action!.run();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" aria-label="Dismiss" className="kasten-toast-close" onClick={() => setLeaving(true)}>
        <Icon name="close" className="size-3" />
      </button>
    </div>
  );
}
