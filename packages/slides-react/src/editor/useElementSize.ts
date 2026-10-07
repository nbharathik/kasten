import { type RefObject, useLayoutEffect, useState } from "react";

/** The width and height of an element, kept up to date as it is resized. */
export function useElementSize(ref: RefObject<Element | null>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const read = () => setSize((now) => (now.w === element.clientWidth && now.h === element.clientHeight ? now : { w: element.clientWidth, h: element.clientHeight }));
    read();
    if (typeof ResizeObserver === "undefined") return;
    const watcher = new ResizeObserver(read);
    watcher.observe(element);
    return () => watcher.disconnect();
  }, [ref]);
  return size;
}
