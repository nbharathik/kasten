import "./settings.css";

import { useState } from "react";

import { ShortcutSettings } from "../../../shortcuts/ShortcutSettings";
import { VaultChooser } from "../../../vaults/VaultChooser";
import { MeaningSettings } from "../../../meaning/MeaningSettings";
import { CalendarSettings } from "../../../calendar/CalendarSettings";
import { Icon } from "../../../../ui/Icon";
import { About } from "./About";
import { AgentSettings } from "./AgentSettings";
import { AIProviders } from "./AIProviders";
import { AppearanceSettings } from "./AppearanceSettings";
import { DesktopSettings } from "./DesktopSettings";
import { PageSettings } from "./PageSettings";
import { SettingsNav } from "./SettingsNav";
import { TemplateSettings } from "./TemplateSettings";
import { HistorySettings, VaultSettings } from "./VaultSettings";

/** How this window looks, page defaults, templates, AI, the vault and its
 * safety, one group after another, with a list of them beside. */
export function Settings() {
  const [switching, setSwitching] = useState(false);

  if (switching) return <VaultChooser onCancel={() => setSwitching(false)} />;

  return (
    <div className="kasten-settings">
      <SettingsNav />
      <div className="kasten-settings-body">
        <h1 className="text-28 font-bold tracking-tight">
          <Icon name="settings" className="mr-2.5 inline size-[26px] align-[-4px] text-muted" />
          Settings
        </h1>
        <p className="mt-1 text-14 text-muted">How Kasten looks and works on this computer, and how this vault is kept safe. Your notes stay plain files; nothing here changes them.</p>

        <AppearanceSettings />
        <PageSettings />
        <CalendarSettings />
        <TemplateSettings />
        <AIProviders />
        <MeaningSettings />
        <AgentSettings />
        <VaultSettings onSwitch={() => setSwitching(true)} />
        <HistorySettings />
        <DesktopSettings />
        <ShortcutSettings />
        <About />
      </div>
    </div>
  );
}
