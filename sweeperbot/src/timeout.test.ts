import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withTimeout } from './timeout';

test('clears the deadline after a completed game', async (t) => {
  const clear = t.mock.method(globalThis, 'clearTimeout');
  assert.equal(await withTimeout(Promise.resolve('win'), 180_000, 'playOne'), 'win');
  assert.equal(clear.mock.callCount(), 1);
});

test('clears the deadline after a failed game', async (t) => {
  const clear = t.mock.method(globalThis, 'clearTimeout');
  const failure = new Error('browser closed');
  await assert.rejects(withTimeout(Promise.reject(failure), 180_000, 'playOne'), failure);
  assert.equal(clear.mock.callCount(), 1);
});

test('still rejects a stalled game at its deadline', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = withTimeout(new Promise(() => {}), 180_000, 'playOne');
  const rejected = assert.rejects(pending, /playOne timed out after 180000ms/);
  t.mock.timers.tick(180_000);
  await rejected;
});
