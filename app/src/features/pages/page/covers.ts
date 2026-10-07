// Page covers, as in Notion's "Colour and gradient" gallery. The frontmatter
// holds a preset's name, or a picture kept in the vault's assets/ folder,
// linked relative to the page as pictures in its text are. The app's content
// security policy keeps remote images out.

export interface Cover {
  id: string;
  label: string;
  css: string;
}

export const COVERS: readonly Cover[] = [
  { id: "solid-red", label: "Red", css: "rgb(224 62 62)" },
  { id: "solid-yellow", label: "Yellow", css: "rgb(223 171 1)" },
  { id: "solid-blue", label: "Blue", css: "rgb(11 110 153)" },
  { id: "solid-beige", label: "Beige", css: "rgb(233 229 227)" },
  { id: "gradient-dawn", label: "Dawn", css: "linear-gradient(120deg, #f6d365 0%, #fda085 100%)" },
  { id: "gradient-ocean", label: "Ocean", css: "linear-gradient(120deg, #89f7fe 0%, #66a6ff 100%)" },
  { id: "gradient-forest", label: "Forest", css: "linear-gradient(120deg, #d4fc79 0%, #96e6a1 100%)" },
  { id: "gradient-dusk", label: "Dusk", css: "linear-gradient(120deg, #a18cd1 0%, #fbc2eb 100%)" },
  { id: "gradient-peach", label: "Peach", css: "linear-gradient(120deg, #ffecd2 0%, #fcb69f 100%)" },
  { id: "gradient-night", label: "Night", css: "linear-gradient(120deg, #30cfd0 0%, #330867 100%)" },
];

const PICTURE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

/** A picture kept with the vault, rather than a preset. */
export function isPictureCover(value: string): boolean {
  return PICTURE.test(value.trim()) && !/^[a-z]+:/i.test(value.trim());
}

/** The CSS background for a cover value, or null for none. `url` turns a
 * picture's link into one the window can load. */
export function coverBackground(value: string, url?: (src: string) => string): string | null {
  const cover = value.trim();
  if (cover === "") return null;
  if (isPictureCover(cover) && url) return `center / cover no-repeat url("${url(cover).replace(/"/g, "%22")}")`;
  // An unknown value shows as a plain band.
  return COVERS.find((c) => c.id === cover)?.css ?? "var(--notion-gray-bg)";
}

export function randomCover(random: () => number = Math.random): string {
  return COVERS[Math.floor(random() * COVERS.length)]!.id;
}
