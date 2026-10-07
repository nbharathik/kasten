// The mouse's back and forward buttons move through the pane's places, as
// in a browser, instead of the webview leaving the app (which closed the
// page it showed). Back first closes a peek.

import { useEffect } from "react";

import { usePeek } from "../features/peek/store";
import { useWorkspace } from "../features/workspace/store";

const BACK = 3;
const FORWARD = 4;

export function stepFromButton(button: number): void {
  if (button === BACK) {
    const peek = usePeek.getState();
    if (peek.peek) peek.close();
    else useWorkspace.getState().goBack();
  } else if (button === FORWARD) {
    useWorkspace.getState().goForward();
  }
}

export function useMouseNavigation(): void {
  useEffect(() => {
    let handled = 0;
    const stop = (event: MouseEvent) => {
      if (event.button === BACK || event.button === FORWARD) event.preventDefault();
    };
    const onUp = (event: MouseEvent) => {
      if (event.button !== BACK && event.button !== FORWARD) return;
      event.preventDefault();
      handled = Date.now();
      stepFromButton(event.button);
    };
    // Some webviews turn the button into history navigation anyway: keep an
    // entry to land on, and take the move as Back once.
    const guard = { kasten: "back-guard" };
    if (history.state?.kasten !== guard.kasten) history.pushState(guard, "");
    const onPop = () => {
      history.pushState(guard, "");
      if (Date.now() - handled > 500) stepFromButton(BACK);
    };
    window.addEventListener("mousedown", stop);
    window.addEventListener("auxclick", stop);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("mousedown", stop);
      window.removeEventListener("auxclick", stop);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("popstate", onPop);
    };
  }, []);
}
