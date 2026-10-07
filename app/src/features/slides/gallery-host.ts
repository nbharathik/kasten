// The images drawer's part of Slides' host in Kasten: the vault's assets as the
// editor's images, their small copies as blob URLs (the asset protocol cannot
// read the cache they are kept in), and where each is used.

import type { HostImage, ImageUse, SlidesHost } from "@kasten-slides/react";

import type { AssetInfo } from "../../lib/vault/asset-types";
import { fileUrl } from "../../lib/vault/file-url";
import type { VaultClient } from "../../lib/vault/types";
import { useWorkspace } from "../workspace/store";
import { assetVersion, onAssetFiles } from "./events";

/** An asset as the editor's host image: what is known, and nothing for what is not. */
export function hostImage(asset: AssetInfo): HostImage {
  return {
    path: asset.path,
    name: asset.name,
    bytes: asset.bytes,
    added: asset.added,
    tags: asset.tags,
    ...(asset.width !== null && asset.height !== null ? { width: asset.width, height: asset.height } : {}),
    ...(asset.id ? { id: asset.id } : {}),
    ...(asset.source ? { source: asset.source } : {}),
    ...(asset.createdBy ? { createdBy: asset.createdBy } : {}),
    ...(asset.caption ? { caption: asset.caption } : {}),
    ...(asset.citationKey ? { citationKey: asset.citationKey } : {}),
    ...(asset.clip ? { clip: asset.clip } : {}),
    ...(asset.paper ? { paper: asset.paper } : {}),
    ...(asset.deck ? { deck: asset.deck } : {}),
  };
}

type GalleryMembers = Required<Pick<SlidesHost, "images" | "assetInfo" | "thumbnailUrl" | "imageUsage" | "setImageMeta" | "watchImages" | "openPath">> & Pick<SlidesHost, "addImage">;

/** The host members for the images drawer, on the vault's assets. */
export function galleryHost(client: VaultClient): GalleryMembers {
  // Small copies made so far: one per picture, size and version of the file.
  const thumbs = new Map<string, Promise<string | undefined>>();
  return {
    images: async () => (await client.assets()).map(hostImage),
    assetInfo: async (path) => hostImage(await client.asset(path)),
    imageUsage: async (): Promise<Record<string, ImageUse>> => client.assetsUsage(),
    setImageMeta: async (path, edit) => hostImage(await client.setAssetMeta(path, edit)),
    addImage: async (name, bytes, options) => (await client.addAsset(name, bytes, { source: options?.source ?? "file", ...(options?.deck ? { deck: options.deck } : {}) })).path,
    // A picture with no small copy (a vector picture, or the preview) shows as itself.
    thumbnailUrl(path, size) {
      const key = `${path}@${size}@${assetVersion(path)}`;
      let made = thumbs.get(key);
      if (!made) {
        made = client.assetThumb(path, size).then(
          (bytes) => (bytes ? URL.createObjectURL(new Blob([bytes as BlobPart], { type: "image/webp" })) : (fileUrl(path) ?? undefined)),
          () => fileUrl(path) ?? undefined,
        );
        thumbs.set(key, made);
      }
      return made;
    },
    watchImages: (onChange) => onAssetFiles(() => onChange()),
    openPath: (path) => useWorkspace.getState().openPath(path, "tab"),
  };
}
