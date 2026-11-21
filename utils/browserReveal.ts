import { revealCellFast, type RearrangementAttempt, type RevealResult } from '../shared/gameLogic';
import type { CellData } from '../shared/types';
import { preserveRefs } from './gameLogic';

function runWorker(grid: CellData[][], row: number, col: number, signal: AbortSignal) {
  return new Promise<RevealResult | null>((resolve, reject) => {
    signal.throwIfAborted();
    const worker = new Worker(new URL('./prayer.worker.ts', import.meta.url), { type: 'module' });
    const close = () => {
      worker.terminate();
      signal.removeEventListener('abort', abort);
    };
    const abort = () => { close(); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => { close(); resolve(data); };
    worker.onerror = worker.onmessageerror = () => { close(); reject(new Error('Prayer worker failed')); };
    try { worker.postMessage({ grid, row, col }); }
    catch (error) { close(); reject(error); }
  });
}

export async function revealInBrowser(
  grid: CellData[][], row: number, col: number, first: boolean, prayer: boolean,
  rng: () => number, observe: (attempt: RearrangementAttempt) => void,
  signal: AbortSignal, onExact: () => void,
): Promise<RevealResult> {
  let attempt: RearrangementAttempt | undefined;
  const fast = revealCellFast(grid, row, col, first, prayer, rng, event => { attempt = event; });
  let result = fast;
  if (prayer && fast.exploded) {
    onExact();
    result = await runWorker(grid, row, col, signal) ?? fast;
  }
  if (attempt) observe(result !== fast ? { kind: 'prayer', outcome: 'success' } : attempt);
  return { ...result, grid: preserveRefs(grid, result.grid) };
}
