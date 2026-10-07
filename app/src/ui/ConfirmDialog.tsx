// A question before a big step, such as emptying the trash: what happens,
// the step's own button, and Cancel. Escape or a press outside cancels.

import { useId, type ReactNode } from "react";

import { Button } from "./Button";
import { Modal } from "./Modal";

interface Props {
  title: string;
  children: ReactNode;
  /** The step's button, in its own words: "Empty trash". */
  confirm: string;
  /** A step that is hard to take back: the button says so in red, and
   * Cancel has the focus. */
  danger?: boolean;
  /** Announced as an alert, for a question the person didn't ask for. */
  alert?: boolean;
  busy?: boolean;
  onConfirm(): void;
  onClose(): void;
}

export function ConfirmDialog({ title, children, confirm, danger, alert, busy, onConfirm, onClose }: Props) {
  const id = useId();
  return (
    <Modal label={title} describedBy={`${id}-body`} role={alert ? "alertdialog" : "dialog"} onClose={onClose} className="ui-dialog">
      <h2 className="ui-dialog-title">{title}</h2>
      <div id={`${id}-body`} className="ui-dialog-body">
        {children}
      </div>
      <footer className="ui-dialog-foot">
        <Button autoFocus={danger} onClick={onClose}>
          Cancel
        </Button>
        <Button tone={danger ? "danger" : "primary"} disabled={busy} onClick={onConfirm}>
          {confirm}
        </Button>
      </footer>
    </Modal>
  );
}
