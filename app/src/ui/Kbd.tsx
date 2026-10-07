// A keycap for a shortcut, such as "Ctrl+K": each key on its own cap.

export function Kbd({ keys, className = "" }: { keys: string; className?: string }) {
  const parts = keys.split(/\+(?!$)/);
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {parts.map((key, i) => (
        <kbd key={i} className="ui-kbd">
          {key}
        </kbd>
      ))}
    </span>
  );
}
