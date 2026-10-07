// Opening Settings at one of its groups, as the palette does: the group is
// kept until the Settings page is drawn, which then scrolls to it.

import { useWorkspace, type OpenHow } from "../../store";
import { sectionId } from "./sections";

let pending: string | null = null;

export function openSettingsAt(title: string, how: OpenHow = "here"): void {
  const { place, go } = useWorkspace.getState();
  if (place.view === "settings" && how === "here") {
    document.getElementById(sectionId(title))?.scrollIntoView?.({ block: "start" });
    return;
  }
  pending = title;
  go({ view: "settings" }, how);
}

/** The group Settings should show first, once. */
export function takeSettingsJump(): string | null {
  const title = pending;
  pending = null;
  return title;
}
