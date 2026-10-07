// The drawer's list: the host's images and, when the host can say, where each
// is used. Loaded when the drawer opens, and again when the host says its
// images changed or the drawer added some.

import { useCallback, useEffect, useRef, useState } from "react";

import type { HostImage, ImageUse, SlidesHost } from "../host.ts";

export interface Images {
  images: HostImage[];
  /** Where each used image is used; null while it is being worked out, or when the host cannot say. */
  usage: Record<string, ImageUse> | null;
  loading: boolean;
  /** Why the list could not be had, if it could not. */
  failed: string | null;
  /** Reads the list and the uses again. */
  refresh(): void;
  /** Takes in a newer account of one image (after an edit). */
  replace(image: HostImage): void;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function useImages(host: SlidesHost): Images {
  const [state, setState] = useState<Pick<Images, "images" | "usage" | "loading" | "failed">>({ images: [], usage: null, loading: true, failed: null });
  const latest = useRef(0);

  const refresh = useCallback(() => {
    const mine = ++latest.current;
    const current = () => mine === latest.current;
    (host.images ? host.images() : Promise.resolve([])).then(
      (images) => current() && setState((now) => ({ ...now, images, loading: false, failed: null })),
      (error: unknown) => current() && setState((now) => ({ ...now, loading: false, failed: messageOf(error) })),
    );
    if (host.imageUsage) {
      host.imageUsage().then(
        (usage) => current() && setState((now) => ({ ...now, usage })),
        () => current() && setState((now) => ({ ...now, usage: null })),
      );
    }
  }, [host]);

  useEffect(() => {
    refresh();
    return host.watchImages?.(refresh);
  }, [host, refresh]);

  const replace = useCallback((image: HostImage) => setState((now) => ({ ...now, images: now.images.map((held) => (held.path === image.path ? image : held)) })), []);

  return { ...state, refresh, replace };
}
