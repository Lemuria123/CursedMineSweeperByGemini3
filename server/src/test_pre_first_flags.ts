import assert from 'node:assert/strict';
import { GameRecorder } from '../../utils/recorder';
import { verifySubmission } from './verify';

// The opening chord needs the mine flag at (1, 1), and the safe flag at (3, 4) blocks the first flood.
const recorder = new GameRecorder();
recorder.start(3, 3, '0', [{ row: 1, col: 1 }, { row: 3, col: 4 }]);
recorder.record('chord', 1, 2);

const minesToFlag = [[0, 4], [1, 0], [4, 0], [4, 5], [5, 2], [5, 7], [6, 2], [7, 1], [7, 7]];
for (const [row, col] of minesToFlag) {
  recorder.record('flag', row, col);
}

recorder.record('flag', 3, 4);
recorder.record('reveal', 3, 4);

const squaresToReveal = [
  [0, 0], [2, 0], [3, 0], [5, 0], [5, 1], [5, 3], [5, 4], [5, 5],
  [5, 6], [6, 0], [6, 1], [6, 3], [6, 4], [6, 7], [7, 0], [7, 2],
];
for (const [row, col] of squaresToReveal) {
  recorder.record('reveal', row, col);
}

const payload = recorder.buildPayload('pre-first-flags-test', 8, 8, 10, 0);
assert.equal(payload.version, 3);
const result = verifySubmission({ ...payload, total_time_ms: Math.max(100, payload.total_time_ms) });
assert.deepEqual(result, { valid: true });
console.log('PASS: flags placed before the first reveal carry through to a zero-prayer win');
