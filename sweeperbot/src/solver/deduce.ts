/**
 * 只根据画面上已经打开的数字、旗和总雷数做确定性推理。
 *
 * 不猜。某一格只有在「每一种满足数字与总雷数的布雷」里都不是雷时，才允许点开。
 * 这和诅咒规则一致：只要还存在一种把它放成雷的合法布局，不祈祷去点就一定会炸。
 * 枚举不出全部布局的大区域（超过 MAX_COMPONENT）只保留单格规则，绝不拿残缺枚举当必然。
 */

export type SeenCell =
  | { kind: 'hidden' }
  | { kind: 'flag' }
  | { kind: 'open'; n: number };

export interface SeenBoard {
  rows: number;
  cols: number;
  cells: SeenCell[][];
  mines: number;
}

export interface SolverMove {
  row: number;
  col: number;
  reason: string;
}

export interface LogicFault {
  /** numbers：已打开的数字彼此矛盾。mines：剩余雷数和棋盘对不上。 */
  kind: 'numbers' | 'mines';
  reason: string;
}

export interface Deduction {
  flags: SolverMove[];
  reveals: SolverMove[];
  /** 不存在能同时满足数字和剩余雷数的布雷 */
  inconsistent: boolean;
  /** 有区域太大，没有穷举，结论只来自单格规则和雷数上下界 */
  capped: boolean;
  /** 局面不可能时写出是数字冲突还是剩余雷数冲突。可能时为 null。 */
  fault: LogicFault | null;
}

/** 超过这个未知格数就不再穷举，避免把算不完的局面误当成「没有解」。 */
export const MAX_COMPONENT = 20;

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

type Mark = 'unknown' | 'safe' | 'mine';

interface Work {
  marks: Mark[][];
  inconsistent: boolean;
  fault: LogicFault | null;
}

function neighbors(rows: number, cols: number, r: number, c: number): Array<{ r: number; c: number }> {
  const list: Array<{ r: number; c: number }> = [];
  for (const [dr, dc] of DIRS) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) list.push({ r: nr, c: nc });
  }
  return list;
}

function cloneMarks(board: SeenBoard): Work {
  const marks: Mark[][] = [];
  for (let r = 0; r < board.rows; r++) {
    const row: Mark[] = [];
    for (let c = 0; c < board.cols; c++) {
      const cell = board.cells[r][c];
      if (cell.kind === 'flag') row.push('mine');
      else if (cell.kind === 'hidden') row.push('unknown');
      else row.push('safe');
    }
    marks.push(row);
  }
  return { marks, inconsistent: false, fault: null };
}

function knownMines(work: Work): number {
  let n = 0;
  for (const row of work.marks) for (const mark of row) if (mark === 'mine') n++;
  return n;
}

/**
 * 单格规则加总雷数，迭代到不能再推。
 * 已证明的雷算进周围旗数，已证明的安全格算 0，但不会假装知道它打开后的数字。
 */
function applyBasic(board: SeenBoard, work: Work, flags: SolverMove[], reveals: SolverMove[]): void {
  let changed = true;
  while (changed && !work.inconsistent) {
    changed = false;
    const foundFlags: SolverMove[] = [];
    const foundSafe: SolverMove[] = [];

    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const cell = board.cells[r][c];
        if (cell.kind !== 'open') continue;
        let flagged = 0;
        let deducedMines = 0;
        const unknown: Array<{ r: number; c: number }> = [];
        for (const pos of neighbors(board.rows, board.cols, r, c)) {
          const mark = work.marks[pos.r][pos.c];
          if (board.cells[pos.r][pos.c].kind === 'flag') flagged++;
          else if (mark === 'mine') deducedMines++;
          else if (mark === 'unknown') unknown.push(pos);
        }
        const mines = flagged + deducedMines;
        if (mines > cell.n || mines + unknown.length < cell.n) {
          work.inconsistent = true;
          const minesLeft = board.mines - knownMines(work);
          const short = mines + unknown.length < cell.n;
          // 旗自己就已经和数字冲突，这是数字问题。多出来或少掉的雷来自剩余雷数时，记成雷数矛盾。
          if (flagged > cell.n || (short && minesLeft >= cell.n - mines)) {
            work.fault = {
              kind: 'numbers',
              reason: `(${r},${c}) 的数字是 ${cell.n}，周围已有 ${mines} 颗雷、${unknown.length} 个未开格，凑不出来`,
            };
          } else if (short) {
            work.fault = {
              kind: 'mines',
              reason: `剩余 ${minesLeft} 颗雷，不够满足 (${r},${c}) 的数字 ${cell.n}`,
            };
          } else {
            work.fault = {
              kind: 'mines',
              reason: `剩余雷数要求未开区域放 ${minesLeft + deducedMines} 颗雷，但 (${r},${c}) 的数字 ${cell.n} 周围最多只能有 ${cell.n} 颗`,
            };
          }
          return;
        }
        if (unknown.length === 0) continue;
        if (mines === cell.n) {
          for (const pos of unknown) {
            foundSafe.push({ row: pos.r, col: pos.c, reason: '周围旗数已等于数字，其余未开格必然安全' });
          }
        } else if (mines + unknown.length === cell.n) {
          for (const pos of unknown) {
            foundFlags.push({ row: pos.r, col: pos.c, reason: '未开格恰好补满数字，这些格子必然是雷' });
          }
        }
      }
    }

    const unknownCells: Array<{ r: number; c: number }> = [];
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        if (work.marks[r][c] === 'unknown') unknownCells.push({ r, c });
      }
    }
    const minesLeft = board.mines - knownMines(work);
    if (minesLeft < 0 || minesLeft > unknownCells.length) {
      work.inconsistent = true;
      const known = knownMines(work);
      work.fault = {
        kind: 'mines',
        reason: minesLeft < 0
          ? `已经确定 ${known} 颗雷，超过了总雷数 ${board.mines}`
          : `剩余 ${minesLeft} 颗雷，未开格只剩 ${unknownCells.length} 个`,
      };
      return;
    }
    if (unknownCells.length > 0 && minesLeft === 0) {
      for (const pos of unknownCells) {
        foundSafe.push({ row: pos.r, col: pos.c, reason: '剩余雷数为 0，未开格必然安全' });
      }
    } else if (unknownCells.length > 0 && minesLeft === unknownCells.length) {
      for (const pos of unknownCells) {
        foundFlags.push({ row: pos.r, col: pos.c, reason: '剩余雷数等于未开格数，未开格必然是雷' });
      }
    }

    for (const move of foundFlags) {
      if (work.marks[move.row][move.col] !== 'unknown') continue;
      work.marks[move.row][move.col] = 'mine';
      flags.push(move);
      changed = true;
    }
    for (const move of foundSafe) {
      if (work.marks[move.row][move.col] !== 'unknown') continue;
      work.marks[move.row][move.col] = 'safe';
      reveals.push(move);
      changed = true;
    }
  }
}

function popcount(n: number): number {
  let count = 0;
  let x = n;
  while (x) {
    x &= x - 1;
    count++;
  }
  return count;
}

interface Constraint {
  /** 落在本区域未知格上的位图 */
  bits: number;
  need: number;
  unknownCount: number;
}

interface Component {
  cells: Array<{ r: number; c: number }>;
  constraints: Constraint[];
}

function buildComponents(board: SeenBoard, work: Work): { components: Component[]; free: Array<{ r: number; c: number }> } {
  const index = new Map<string, number>();
  const cells: Array<{ r: number; c: number }> = [];
  const touchesNumber: boolean[] = [];

  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      if (work.marks[r][c] !== 'unknown') continue;
      let hit = false;
      for (const pos of neighbors(board.rows, board.cols, r, c)) {
        if (board.cells[pos.r][pos.c].kind === 'open') {
          hit = true;
          break;
        }
      }
      index.set(`${r},${c}`, cells.length);
      cells.push({ r, c });
      touchesNumber.push(hit);
    }
  }

  const parent = cells.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const unite = (a: number, b: number) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) parent[pa] = pb;
  };

  // 同一个数字旁边的未知格互相牵连，必须放进同一个枚举区域。
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      if (board.cells[r][c].kind !== 'open') continue;
      const ids: number[] = [];
      for (const pos of neighbors(board.rows, board.cols, r, c)) {
        if (work.marks[pos.r][pos.c] !== 'unknown') continue;
        const id = index.get(`${pos.r},${pos.c}`);
        if (id !== undefined) ids.push(id);
      }
      for (let i = 1; i < ids.length; i++) unite(ids[0], ids[i]);
    }
  }

  const grouped = new Map<number, number[]>();
  const free: Array<{ r: number; c: number }> = [];
  for (let i = 0; i < cells.length; i++) {
    if (!touchesNumber[i]) {
      free.push(cells[i]);
      continue;
    }
    const root = find(i);
    const list = grouped.get(root);
    if (list) list.push(i);
    else grouped.set(root, [i]);
  }

  const components: Component[] = [];
  for (const ids of grouped.values()) {
    const local = new Map<number, number>();
    ids.forEach((id, order) => local.set(id, order));
    const compCells = ids.map((id) => cells[id]);
    const constraints: Constraint[] = [];
    const seen = new Set<string>();
    for (const cell of compCells) {
      for (const pos of neighbors(board.rows, board.cols, cell.r, cell.c)) {
        const source = board.cells[pos.r][pos.c];
        if (source.kind !== 'open') continue;
        const key = `${pos.r},${pos.c}`;
        if (seen.has(key)) continue;
        seen.add(key);
        let bits = 0;
        let unknownCount = 0;
        let mines = 0;
        for (const near of neighbors(board.rows, board.cols, pos.r, pos.c)) {
          const mark = work.marks[near.r][near.c];
          if (mark === 'mine') mines++;
          else if (mark === 'unknown') {
            const id = index.get(`${near.r},${near.c}`);
            const bit = id === undefined ? undefined : local.get(id);
            if (bit !== undefined) {
              bits |= 1 << bit;
              unknownCount++;
            }
          }
        }
        constraints.push({ bits, need: source.n - mines, unknownCount });
      }
    }
    components.push({ cells: compCells, constraints });
  }

  return { components, free };
}

interface AssignmentGroup {
  count: number;
  always: number;
  ever: number;
}

function enumerate(component: Component): AssignmentGroup[] | 'capped' {
  if (component.cells.length > MAX_COMPONENT) return 'capped';
  const groups = new Map<number, { always: number; ever: number }>();
  const total = component.cells.length;

  const visit = (index: number, mask: number, count: number): void => {
    for (const constraint of component.constraints) {
      const placed = popcount(mask & constraint.bits);
      const assigned = popcount(((1 << index) - 1) & constraint.bits);
      const pending = constraint.unknownCount - assigned;
      if (placed > constraint.need) return;
      if (placed + pending < constraint.need) return;
    }
    if (index === total) {
      const existing = groups.get(count);
      if (!existing) groups.set(count, { always: mask, ever: mask });
      else {
        existing.always &= mask;
        existing.ever |= mask;
      }
      return;
    }
    visit(index + 1, mask, count);
    visit(index + 1, mask | (1 << index), count + 1);
  };

  visit(0, 0, 0);
  if (groups.size === 0) return [];
  return [...groups.entries()].map(([count, bits]) => ({ count, always: bits.always, ever: bits.ever }));
}

function sumSet(left: Set<number>, groups: AssignmentGroup[]): Set<number> {
  const next = new Set<number>();
  for (const base of left) for (const group of groups) next.add(base + group.count);
  return next;
}

/**
 * 各区域的雷数还要一起满足全局剩余雷数。
 * 某一格只有在所有还能对上总雷数的组合里都是雷（或都不是）时才落子。
 */
function applyEnumeration(board: SeenBoard, work: Work, flags: SolverMove[], reveals: SolverMove[]): boolean {
  const { components, free } = buildComponents(board, work);
  const solved: AssignmentGroup[][] = [];
  const loose: Array<{ min: number; max: number }> = [];
  let capped = false;
  for (const component of components) {
    const groups = enumerate(component);
    if (groups === 'capped') {
      // 区域太大时不算具体布局，但仍给出雷数上下界，用来核对剩余雷数。
      capped = true;
      const lower = component.constraints.reduce((max, constraint) => Math.max(max, constraint.need), 0);
      loose.push({ min: Math.max(0, lower), max: component.cells.length });
      continue;
    }
    if (groups.length === 0) {
      work.inconsistent = true;
      work.fault = {
        kind: 'numbers',
        reason: '已打开的数字互相矛盾，不存在能同时满足它们的布雷',
      };
      return false;
    }
    solved.push(groups);
    loose.push({
      min: Math.min(...groups.map((group) => group.count)),
      max: Math.max(...groups.map((group) => group.count)),
    });
  }

  if (capped) {
    const minesLeft = board.mines - knownMines(work);
    const minMines = loose.reduce((sum, bound) => sum + bound.min, 0);
    const maxMines = loose.reduce((sum, bound) => sum + bound.max, 0) + free.length;
    if (minesLeft < minMines || minesLeft > maxMines) {
      work.inconsistent = true;
      work.fault = {
        kind: 'mines',
        reason: `剩余 ${minesLeft} 颗雷，棋盘上未开区域只能再放 ${minMines} 到 ${maxMines} 颗`,
      };
    }
    // 大区域没有穷举完，不能拿残缺结果去点格子。
    return true;
  }

  const minesLeft = board.mines - knownMines(work);
  const prefix: Array<Set<number>> = [new Set([0])];
  for (const groups of solved) prefix.push(sumSet(prefix[prefix.length - 1], groups));
  const suffix: Array<Set<number>> = new Array(solved.length + 1);
  suffix[solved.length] = new Set([0]);
  for (let i = solved.length - 1; i >= 0; i--) suffix[i] = sumSet(suffix[i + 1], solved[i]);

  const reachable = prefix[solved.length];
  let onlyFree: number | null = null;
  let freeChoices = 0;
  for (let f = 0; f <= free.length; f++) {
    if (!reachable.has(minesLeft - f)) continue;
    freeChoices++;
    onlyFree = f;
  }
  if (freeChoices === 0) {
    const placed = [...reachable].sort((a, b) => a - b);
    work.inconsistent = true;
    work.fault = {
      kind: 'mines',
      reason: `剩余 ${minesLeft} 颗雷。数字区域能容纳的雷数是 ${placed.join('、') || '0'}，孤立未开格还有 ${free.length} 个，对不上`,
    };
    return false;
  }

  if (free.length > 0 && freeChoices === 1 && onlyFree === 0) {
    for (const cell of free) {
      reveals.push({ row: cell.r, col: cell.c, reason: '扣掉各区域之后没有剩余雷，这些孤立格必然安全' });
    }
  } else if (free.length > 0 && freeChoices === 1 && onlyFree === free.length) {
    for (const cell of free) {
      flags.push({ row: cell.r, col: cell.c, reason: '扣掉各区域之后剩余雷数等于孤立格数，这些格子必然是雷' });
    }
  }

  for (let i = 0; i < solved.length; i++) {
    const viableCounts = new Set<number>();
    for (const group of solved[i]) {
      for (const p of prefix[i]) {
        for (const s of suffix[i + 1]) {
          const used = p + group.count + s;
          if (used <= minesLeft && minesLeft - used <= free.length) viableCounts.add(group.count);
        }
      }
    }
    if (viableCounts.size === 0) {
      work.inconsistent = true;
      work.fault = {
        kind: 'mines',
        reason: `剩余 ${minesLeft} 颗雷，无法分配到各个数字区域`,
      };
      return false;
    }
    const component = components[i];
    for (let bit = 0; bit < component.cells.length; bit++) {
      let alwaysMine = true;
      let everMine = false;
      let saw = false;
      for (const group of solved[i]) {
        if (!viableCounts.has(group.count)) continue;
        saw = true;
        // always 位：这个雷数下每一种布雷都是雷。ever 位：至少有一种布雷是雷。
        const certainMine = (group.always & (1 << bit)) !== 0;
        const possibleMine = (group.ever & (1 << bit)) !== 0;
        if (!certainMine) alwaysMine = false;
        if (possibleMine) everMine = true;
      }
      if (!saw) continue;
      const cell = component.cells[bit];
      if (alwaysMine) {
        flags.push({
          row: cell.r,
          col: cell.c,
          reason: '该格在全部合法布雷中都是雷',
        });
      } else if (!everMine) {
        reveals.push({
          row: cell.r,
          col: cell.c,
          reason: '该格在全部合法布雷中都安全',
        });
      }
    }
  }

  return false;
}

export function deduce(board: SeenBoard): Deduction {
  const work = cloneMarks(board);
  const flags: SolverMove[] = [];
  const reveals: SolverMove[] = [];
  applyBasic(board, work, flags, reveals);
  if (work.inconsistent) {
    return { flags: [], reveals: [], inconsistent: true, capped: false, fault: work.fault };
  }

  const capped = applyEnumeration(board, work, flags, reveals);
  if (work.inconsistent) {
    return { flags: [], reveals: [], inconsistent: true, capped, fault: work.fault };
  }
  return { flags, reveals, inconsistent: false, capped, fault: null };
}
