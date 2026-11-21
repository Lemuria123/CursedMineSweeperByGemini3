import type { RearrangementAttempt } from '../shared/gameLogic';

const STORAGE_KEY = 'cms_rearrangement_stats_v1';

const emptyCounts = () => ({
  attempts: 0,
  success: 0,
  isolated_shortage: 0,
  budget_exhausted: 0,
  frontier_limit: 0,
  unclassified: 0,
});

type RearrangementStats = Record<RearrangementAttempt['kind'], ReturnType<typeof emptyCounts>>;

export function saveRearrangementStats(attempts: readonly RearrangementAttempt[]): void {
  if (attempts.length === 0) return;

  const save = () => {
    try {
      const stored: Partial<RearrangementStats> | null = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      const stats: RearrangementStats = {
        curse: { ...emptyCounts(), ...stored?.curse },
        prayer: { ...emptyCounts(), ...stored?.prayer },
      };
      for (const { kind, outcome } of attempts) {
        stats[kind].attempts++;
        stats[kind][outcome]++;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
    } catch {
      // Storage can be disabled. A recording failure must leave the game playable.
    }
  };

  window.setTimeout(() => {
    // Serialize writes from different tabs where the browser provides Web Locks.
    if (navigator.locks) void navigator.locks.request(STORAGE_KEY, save).catch(() => {});
    else save();
  }, 0);
}
