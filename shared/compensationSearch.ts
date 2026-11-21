export interface CompensationConstraint {
  need: number;
  varIdxs: number[];
  fixed: number;
}

export type CompensationDelta = -2 | -1 | 1 | 2;

export function findThreeCellCompensation(
  original: Int8Array,
  constraints: readonly CompensationConstraint[],
  delta: -1 | 1,
  spend: () => boolean,
): Int8Array | null {
  const pivotValue = delta === 1 ? 1 : 0;
  const signatures = Array.from({ length: original.length }, (): number[] => []);
  constraints.forEach(({ varIdxs }, clue) => {
    for (const index of varIdxs) signatures[index].push(clue);
  });
  const replacements = new Map<string, number>();
  for (let i = 0; i < original.length; i++) {
    if (original[i] !== pivotValue) replacements.set(signatures[i].join(','), i);
  }

  for (let i = 0; i < original.length; i++) {
    if (original[i] !== pivotValue) continue;
    const clues = signatures[i];
    // The two replacement signatures must partition the pivot's visible clues.
    for (let mask = 1; mask < (1 << clues.length) - 1; mask += 2) {
      if (!spend()) return null;
      const left: number[] = [];
      const right: number[] = [];
      for (let bit = 0; bit < clues.length; bit++) {
        if (mask & (1 << bit)) left.push(clues[bit]);
        else right.push(clues[bit]);
      }
      const a = replacements.get(left.join(','));
      const b = replacements.get(right.join(','));
      if (a === undefined || b === undefined) continue;
      const result = new Int8Array(original);
      result[i] = 1 - pivotValue;
      result[a] = result[b] = pivotValue;
      return result;
    }
  }
  return null;
}

export function findBoundedCompensation(
  original: Int8Array,
  constraints: readonly CompensationConstraint[],
  delta: CompensationDelta,
  maxChanges: number,
  spend: () => boolean,
): Int8Array | null {
  const total = original.reduce((sum, value) => sum + value, 0) + delta;
  return visit(new Int8Array(original.length).fill(-1));

  function visit(assignment: Int8Array): Int8Array | null {
    let selected = -1;
    for (;;) {
      let changed = false;
      let fewestOpen = Infinity;
      selected = -1;
      for (const { need, fixed, varIdxs } of constraints) {
        let placed = fixed;
        const open: number[] = [];
        for (const i of varIdxs) {
          if (assignment[i] === 1) placed++;
          else if (assignment[i] === -1) open.push(i);
        }
        if (placed > need || placed + open.length < need) return null;
        if (!open.length) continue;
        if (placed === need || placed + open.length === need) {
          for (const i of open) assignment[i] = placed === need ? 0 : 1;
          changed = true;
        } else if (open.length < fewestOpen) {
          fewestOpen = open.length;
          selected = open[open.length - 1];
        }
      }

      let mines = 0;
      let originalMinesInOpen = 0;
      let flips = 0;
      const open: number[] = [];
      for (let i = 0; i < assignment.length; i++) {
        if (assignment[i] === -1) {
          open.push(i);
          originalMinesInOpen += original[i];
        } else {
          mines += assignment[i];
          if (assignment[i] !== original[i]) flips++;
        }
      }
      if (mines > total || mines + open.length < total ||
          flips + Math.abs(total - mines - originalMinesInOpen) > maxChanges) return null;
      if (open.length && (mines === total || mines + open.length === total)) {
        for (const i of open) assignment[i] = mines === total ? 0 : 1;
        changed = true;
      }
      if (changed) continue;
      if (!open.length) return assignment;
      if (selected === -1) selected = open[0];
      break;
    }

    // Start with the existing layout to keep changes local and prune sooner.
    for (const value of [original[selected], 1 - original[selected]]) {
      if (!spend()) return null;
      const next = new Int8Array(assignment);
      next[selected] = value;
      const result = visit(next);
      if (result) return result;
    }
    return null;
  }
}
