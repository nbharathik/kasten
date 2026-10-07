// The picture a tile shows: the host's small copy when it has one, else the
// image itself. While a small copy is being made nothing is shown, so a long
// list never loads the originals.

import { useEffect, useState } from "react";

import type { SlidesHost } from "../host.ts";

/** A URL to show `path` at about `size`; undefined while the host is still making the small copy. */
export function useThumb(host: SlidesHost, path: string, size: 256 | 1024): string | undefined {
  const key = `${path}@${size}`;
  const [small, setSmall] = useState<{ key: string; url: string | undefined } | null>(null);
  useEffect(() => {
    if (!host.thumbnailUrl) return;
    let live = true;
    const asked = host.thumbnailUrl(path, size);
    if (asked === undefined || typeof asked === "string") {
      setSmall({ key, url: asked });
    } else {
      asked.then(
        (url) => live && setSmall({ key, url }),
        () => live && setSmall({ key, url: undefined }),
      );
    }
    return () => {
      live = false;
    };
  }, [host, path, size, key]);
  const original = host.imageUrl(path);
  if (!host.thumbnailUrl) return original;
  return small?.key === key ? (small.url ?? original) : undefined;
}
