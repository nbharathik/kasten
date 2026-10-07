// Folder paths as the vault chooser builds them, in the separator the path
// already uses, so Windows paths stay Windows paths.

/** A vault's name as a folder name: characters no system allows become dashes. */
export function folderName(name: string): string {
  const clean = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/^\.+/, "")
    .trim();
  return clean || "Kasten";
}

const separator = (path: string) => (/^[A-Za-z]:\\/.test(path) || (path.includes("\\") && !path.includes("/")) ? "\\" : "/");

/** `name` inside `folder`. */
export function inside(folder: string, name: string): string {
  const sep = separator(folder);
  return folder.endsWith(sep) ? `${folder}${name}` : `${folder}${sep}${name}`;
}

/** The folder that holds `path`. */
export function parentOf(path: string): string {
  const trimmed = path.replace(/(?<=.)[\\/]+$/, "");
  const at = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (at < 0) return trimmed;
  if (at === 0) return trimmed.slice(0, 1);
  const parent = trimmed.slice(0, at);
  return /^[A-Za-z]:$/.test(parent) ? `${parent}\\` : parent;
}
