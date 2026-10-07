// Heavy things on a board (a note's editor in an expanded card) start one
// at a time, a couple of frames apart, once the view stops moving, instead
// of all in one frame when a board opens or the zoom comes in close.

import { useEffect, useState } from "react";

const waiting: (() => void)[] = [];
let running = false;

function next(): void {
  const start = waiting.shift();
  if (!start) {
    running = false;
    return;
  }
  start();
  // Let the frame this one costs paint before the next begins.
  requestAnimationFrame(() => setTimeout(next, 16));
}

/** True once it is this component's turn, while `wanted` stays true. A
 * turn is not taken while `wait` is true (the view is moving); once taken
 * it is kept. */
export function useTurn(wanted: boolean, wait = false): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!wanted) {
      setReady(false);
      return;
    }
    if (ready || wait) return;
    let live = true;
    const start = () => live && setReady(true);
    waiting.push(start);
    if (!running) {
      running = true;
      next();
    }
    return () => {
      live = false;
      const at = waiting.indexOf(start);
      if (at >= 0) waiting.splice(at, 1);
    };
  }, [wanted, wait, ready]);
  return wanted && ready;
}
