// How the last "Test connection" went, in a line: that it works, with the
// start of the model's answer, or why not and what to check.

import type { ProviderCheck } from "../../../../chat/types";
import { Icon } from "../../../../../ui/Icon";

export function CheckResult({ check, className = "" }: { check: ProviderCheck; className?: string }) {
  return (
    <span role="status" className={`flex items-start gap-1.5 ${check.ok ? "text-success" : "text-danger"} ${className}`}>
      <Icon name={check.ok ? "circle-check" : "alert"} className="mt-px size-3.5 shrink-0" />
      <span>
        {check.message}
        {check.ok && check.reply ? ` · “${check.reply}”` : ""}
      </span>
    </span>
  );
}
