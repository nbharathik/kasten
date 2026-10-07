// Installing a new version in place, in a build that can: the download
// comes first (its signature is checked), then, when the person says so,
// the pages' typing is written and committed, the new version installs and
// Kasten restarts on it. The daily check may download by itself; installing
// always waits for the person.

import { installUpdate, prepareUpdate, type DownloadProgress } from "../../lib/api";
import { writeEverything } from "../workspace/page/before-exit";
import { useUpdates } from "./store";

type Prepare = (onProgress: (progress: DownloadProgress) => void) => Promise<string | null>;

const said = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Downloads the newer version unless it is already here. Says whether it
 * is ready to install; never throws, a failure is kept in `installError`. */
export async function download(prepare: Prepare = prepareUpdate): Promise<boolean> {
  const { phase } = useUpdates.getState();
  if (phase === "ready") return true;
  if (phase === "downloading" || phase === "installing") return false;
  useUpdates.setState({ phase: "downloading", progress: 0, installError: null });
  try {
    const version = await prepare(({ done, total }) => useUpdates.setState({ progress: total ? Math.min(1, done / total) : null }));
    if (!version) {
      useUpdates.setState({
        phase: "failed",
        progress: null,
        installError: "This version isn’t ready to install from here yet. Download it from the release page instead.",
      });
      return false;
    }
    useUpdates.setState({ phase: "ready", progress: 1 });
    return true;
  } catch (err) {
    useUpdates.setState({ phase: "failed", progress: null, installError: said(err) });
    return false;
  }
}

/** Installs the new version, downloading it first if need be. What was
 * typed is written and committed before; Kasten then restarts on it. */
export async function installAndRestart(prepare: Prepare = prepareUpdate, install: () => Promise<void> = installUpdate): Promise<void> {
  if (!(await download(prepare))) return;
  useUpdates.setState({ phase: "installing", installError: null });
  await writeEverything();
  try {
    await install();
  } catch (err) {
    useUpdates.setState({ phase: "failed", installError: said(err) });
  }
}

/** The words on the install button for each phase. */
export function installLabel(phase: string, progress: number | null): string {
  if (phase === "downloading") return progress === null ? "Downloading…" : `Downloading… ${Math.round(progress * 100)}%`;
  if (phase === "ready") return "Restart to update";
  if (phase === "installing") return "Installing…";
  return "Install and restart";
}
