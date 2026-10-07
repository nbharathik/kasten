import { useRef, useState } from "react";

import { COVERS } from "./covers";
import { Popup } from "./Popup";

interface CoverPickerProps {
  onPick: (cover: string) => void;
  onRemove: () => void;
  onClose: () => void;
  /** Keeps a picture with the vault and gives its link; none, no uploads. */
  onUpload?: (file: File) => Promise<string>;
}

/** Notion's cover gallery: colours and gradients, or a picture of your own. */
export function CoverPicker({ onPick, onRemove, onClose, onUpload }: CoverPickerProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file: File | undefined) => {
    if (!file || !onUpload) return;
    setBusy(true);
    try {
      onPick(await onUpload(file));
    } catch {
      // The upload said why in a toast.
    } finally {
      setBusy(false);
    }
  };
  return (
    <Popup label="Page cover" className="kasten-cover-picker" onClose={onClose}>
      <div className="kasten-popup-bar">
        <span className="kasten-popup-heading">Colour and gradient</span>
        {onUpload && (
          <>
            <input ref={input} type="file" accept="image/*" hidden aria-label="Picture for the cover" onChange={(e) => void upload(e.target.files?.[0])} />
            <button type="button" className="kasten-popup-button" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? "Uploading…" : "Upload a picture"}
            </button>
          </>
        )}
        <button type="button" className="kasten-popup-button" onClick={onRemove}>
          Remove
        </button>
      </div>
      <div className="kasten-cover-grid">
        {COVERS.map((cover) => (
          <button
            key={cover.id}
            type="button"
            className="kasten-cover-swatch"
            style={{ background: cover.css }}
            title={cover.label}
            aria-label={cover.label}
            onClick={() => onPick(cover.id)}
          />
        ))}
      </div>
    </Popup>
  );
}
