// Quitting, restarting or hiding the desktop window writes what is still
// waiting first: the app holds the request (src-tauri/src/closing) until
// this says the pages are written, or a few seconds pass. The browser
// preview writes as the page is hidden.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";

import { inTauri } from "../../../lib/api";
import { flushOpenPage } from "./open-page";
import { writeUnsavedNow } from "./unsaved";

/** How long the pages get before the window closes anyway. */
const WAIT_MS = 2_500;

export function useWritesOnClose(): void {
  useEffect(() => {
    if (!inTauri()) {
      const hide = () => void flushOpenPage();
      window.addEventListener("pagehide", hide);
      return () => window.removeEventListener("pagehide", hide);
    }
    let gone = false;
    let stop: (() => void) | undefined;
    void listen("kasten://closing", async () => {
      try {
        await Promise.race([flushOpenPage(), new Promise((done) => setTimeout(done, WAIT_MS))]);
      } catch {
        // Written or not, the app goes ahead.
      } finally {
        // Typing that could not be written stays on this computer, and
        // comes back when its page next opens.
        writeUnsavedNow();
        void invoke("pages_written").catch(() => {});
      }
    }).then((unlisten) => (gone ? unlisten() : (stop = unlisten)));
    return () => {
      gone = true;
      stop?.();
    };
  }, []);
}
