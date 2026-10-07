// A slide is drawn in units of 1/96 inch. A 16:9 slide is 960 x 540 units,
// which is 10 x 5.625 inches: exactly the size PowerPoint and Google Slides
// use, and one unit is 9525 EMU, so nothing is rounded on export. Type sizes
// are in points (1 pt = 4/3 units), as in Google Slides.

export const SLIDE_WIDTH = 960;
export const SLIDE_HEIGHT = 540;
export const SLIDE_WIDTH_4_3 = 720;
export const EMU_PER_UNIT = 9525;

export const pointsToUnits = (points: number): number => (points * 4) / 3;
export const unitsToPoints = (units: number): number => (units * 3) / 4;
export const unitsToEmu = (units: number): number => Math.round(units * EMU_PER_UNIT);
export const emuToUnits = (emu: number): number => emu / EMU_PER_UNIT;
