import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameRecorder } from '../../utils/recorder';
import { verifySubmission } from './verify';

test('a pending submission keeps the winning game and its finish time after restart', async (t) => {
  let now = 1_000;
  t.mock.method(Date, 'now', () => now);
  let recorder = new GameRecorder();
  recorder.start(2, 2, 'v3');
  now = 1_500;
  recorder.record('flag', 2, 4);
  now = 1_600;
  recorder.record('reveal', 3, 4, true);
  const completed = recorder.snapshot(5, 5, 3, 1);

  let receiveNonce!: (value: string) => void;
  const nonce = new Promise<string>(resolve => { receiveNonce = resolve; });
  const payload = nonce.then(nonce => ({ ...completed, nonce }));
  recorder.record('flag', 0, 0);
  now = 6_000;
  recorder = new GameRecorder();
  recorder.start(4, 4, 'next-game');
  now = 8_000;
  receiveNonce('test-nonce');

  const submitted = await payload;
  assert.deepEqual(submitted.grid, { rows: 5, cols: 5, mines: 3 });
  assert.equal(submitted.mine_seed, '5-5-3-2-2-v3');
  assert.equal(submitted.prayers_used, 1);
  assert.equal(submitted.total_time_ms, 600);
  assert.equal(submitted.actions.length, 3);
  assert.deepEqual(verifySubmission(submitted), { valid: true });
});

test('changing a snapshot does not alter the recorder’s initial flags', () => {
  const recorder = new GameRecorder();
  recorder.start(2, 2, 'seed', [{ row: 0, col: 0 }]);
  const snapshot = recorder.snapshot(5, 5, 3, 0);
  snapshot.actions[0].initial_flags![0].row = 4;
  assert.deepEqual(recorder.snapshot(5, 5, 3, 0).actions[0].initial_flags, [{ row: 0, col: 0 }]);
});
