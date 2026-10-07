// Dev only: the whole app on a preview vault with sample agent work (see
// demo-vault.ts), so the review queue and the history view have something
// to show without an MCP server. index.html beside this file loads it.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../../../styles.css";
import { AppShell } from "../../../shell/AppShell";
import { usePrefs } from "../../workspace/prefs";
import { loadDevSamples } from "../../workspace/preview/samples";
import { applyTheme, watchSystemTheme } from "../../workspace/theme";
import { DemoVault } from "./demo-vault";

applyTheme(usePrefs.getState().theme);
watchSystemTheme(() => usePrefs.getState().theme);

// One vault per page load, so reloading starts the demo afresh.
const connect = async () => ({ client: new DemoVault(await loadDevSamples()) });

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing #root");

createRoot(root).render(
  <StrictMode>
    <AppShell connect={connect} />
  </StrictMode>,
);
