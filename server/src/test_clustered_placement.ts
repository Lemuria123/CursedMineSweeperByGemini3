import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createRNG, deterministicPlaceMines, hashSeed, placeSeededMines } from '../../shared/deterministicPlaceMines';
import { calculateRecommendedMines, createEmptyGrid, getNeighbors, placeMines } from '../../shared/gameLogic';
import { CURRENT_REPLAY_VERSION } from '../../shared/types';
import { GameRecorder } from '../../utils/recorder';
import { createReplayBoard, isGameSubmission, verifySubmission } from './verify';

test('fixed medium and hard seeds use the 1.5× clustered layout and preserve uniform replay versions', () => {
  const cases = [
    { rows: 16, cols: 16, mines: 60, row: 7, col: 5, digest: 'e44f387f4e3938d0454733c58e0cd0d971b1b3e6f020e20b913e56328256b77d' },
    { rows: 25, cols: 16, mines: 90, row: 2, col: 2, digest: '5f3b9a0fae0acebbefb1c24ad15ae4ef4c699044879b21ed428d5e6b6a6e735a' },
  ];
  for (const { rows, cols, mines, row, col, digest } of cases) {
    const seed = `${rows}-${cols}-${mines}-${row}-${col}-v4`;
    const empty = createEmptyGrid(rows, cols);
    empty[0][0].status = 'flagged';
    const clustered = placeSeededMines(empty, mines, row, col, seed, 4);
    const replay = createReplayBoard({ rows, cols, mines }, seed, {
      type: 'first_reveal', row, col, ts: 0, initial_flags: [{ row: 0, col: 0 }],
    }, 4);
    assert.deepEqual(clustered, replay);
    const bits = clustered.flat().map(cell => Number(cell.isMine)).join('');
    assert.equal(createHash('sha256').update(bits).digest('hex'), digest);

    const legacy = placeMines(createEmptyGrid(rows, cols), mines, row, col, createRNG(hashSeed(seed)));
    for (const version of [1, 2, 3] as const) {
      assert.deepEqual(createReplayBoard({ rows, cols, mines }, seed, { type: 'first_reveal', row, col, ts: 0 }, version), legacy);
    }
    assert.notEqual(legacy.flat().map(cell => Number(cell.isMine)).join(''), bits);
  }
});

test('clustered placement keeps total mines, first-click safety and clue counts', () => {
  for (const [rows, cols] of [[9, 9], [16, 16], [25, 16], [25, 25]]) {
    const mines = calculateRecommendedMines(rows, cols);
    for (const [row, col] of [[0, 0], [rows - 1, 0], [Math.floor(rows / 2), Math.floor(cols / 2)]]) {
      for (let i = 0; i < 8; i++) {
        const seed = `cluster-safety-${rows}-${cols}-${row}-${col}-${i}`;
        const grid = deterministicPlaceMines(rows, cols, mines, row, col, seed, 4);
        assert.equal(grid.flat().filter(cell => cell.isMine).length, mines);
        assert(!grid[row][col].isMine);
        assert(getNeighbors(grid, row, col).every(({ r, c }) => !grid[r][c].isMine));
        for (const cell of grid.flat().filter(cell => !cell.isMine)) {
          assert.equal(cell.neighborMines, getNeighbors(grid, cell.row, cell.col).filter(({ r, c }) => grid[r][c].isMine).length);
        }
      }
    }
  }
});

test('a version 4 win with an initial flag is accepted by the verifier', () => {
  const recorder = new GameRecorder();
  recorder.start(2, 2, 'v3', [{ row: 2, col: 4 }]);
  recorder.record('reveal', 3, 4, true);
  const payload = { ...recorder.buildPayload('cluster-replay', 5, 5, 3, 1), total_time_ms: 500 };
  assert.equal(payload.version, CURRENT_REPLAY_VERSION);
  assert.equal(payload.version, 4);
  assert(isGameSubmission(payload));
  assert.deepEqual(verifySubmission(payload), { valid: true });
});
