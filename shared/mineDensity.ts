const EASY_AREA = 9 * 9;
const MEDIUM_AREA = 16 * 16;
const HARD_AREA = 25 * 16;
const EASY_DENSITY = 19 / EASY_AREA;
const MEDIUM_DENSITY = 58 / MEDIUM_AREA;
const HARD_DENSITY = 88 / HARD_AREA;

export function calculateRecommendedMines(rows: number, cols: number): number {
  const area = rows * cols;
  if (area <= EASY_AREA) {
    return Math.max(1, Math.floor(area * (0.2 + 1 / Math.pow(area, 0.65))) - 1);
  }

  // Interpolate density between presets, then continue the original rate of decline
  // from the hard preset. Round up to a whole mine.
  if (area <= MEDIUM_AREA) {
    const progress = (area - EASY_AREA) / (MEDIUM_AREA - EASY_AREA);
    return Math.ceil(area * (EASY_DENSITY + progress * (MEDIUM_DENSITY - EASY_DENSITY)));
  }
  if (area <= HARD_AREA) {
    const progress = (area - MEDIUM_AREA) / (HARD_AREA - MEDIUM_AREA);
    return Math.ceil(area * (MEDIUM_DENSITY + progress * (HARD_DENSITY - MEDIUM_DENSITY)));
  }
  return Math.ceil(area * (HARD_DENSITY + area ** -0.65 - HARD_AREA ** -0.65));
}
