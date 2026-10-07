// Arrow keys through the Steps grid. Every place the focus can be in has `data-row` (-1 for
// the header row, then 0 for the first element) and `data-col` (a number that puts it in order
// along its row; a place between two columns has a fraction), so the next place is found from
// the page and not from a list the grid would have to keep in step with what it draws.

interface Place {
  el: HTMLElement;
  row: number;
  col: number;
}

function placesOf(grid: HTMLElement): Place[] {
  return [...grid.querySelectorAll<HTMLElement>("[data-cell]")].map((el) => ({ el, row: Number(el.dataset.row), col: Number(el.dataset.col) }));
}

/** Where an arrow key, Home or End takes the focus from `from` (with Ctrl, Home and End go to the corners); undefined when it stays. */
export function neighbour(grid: HTMLElement, from: HTMLElement, key: string, ctrl = false): HTMLElement | undefined {
  const places = placesOf(grid);
  const here = places.find((place) => place.el === from);
  if (!here) return undefined;
  const inRow = (row: number) => places.filter((place) => place.row === row).sort((a, b) => a.col - b.col);
  const along = inRow(here.row);
  const at = along.indexOf(here);
  switch (key) {
    case "ArrowLeft":
      return along[Math.max(at - 1, 0)]?.el;
    case "ArrowRight":
      return along[Math.min(at + 1, along.length - 1)]?.el;
    case "Home":
      return (ctrl ? [...places].sort((a, b) => a.row - b.row || a.col - b.col)[0] : along[0])?.el;
    case "End":
      return (ctrl ? [...places].sort((a, b) => b.row - a.row || b.col - a.col)[0] : along[along.length - 1])?.el;
    case "ArrowUp":
    case "ArrowDown": {
      const rows = [...new Set(places.map((place) => place.row))].sort((a, b) => a - b);
      const to = rows[rows.indexOf(here.row) + (key === "ArrowUp" ? -1 : 1)];
      if (to === undefined) return undefined;
      // The place in the next row that is nearest the column we are in.
      return inRow(to).reduce<Place | undefined>((best, place) => (!best || Math.abs(place.col - here.col) < Math.abs(best.col - here.col) ? place : best), undefined)?.el;
    }
    default:
      return undefined;
  }
}
