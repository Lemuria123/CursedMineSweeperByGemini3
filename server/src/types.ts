import type { ReplayVersion } from '../../shared/types';

// Types for game submission data (encrypted payload).

export interface GridConfig {
  rows: number;
  cols: number;
  mines: number;
}

export interface GameAction {
  type: 'first_reveal' | 'reveal' | 'flag' | 'chord';
  row: number;
  col: number;
  ts: number;        // ms offset from first click
  prayed?: boolean;  // only for 'reveal' type — whether pray mode was active
  initial_flags?: { row: number; col: number }[]; // active flags before first_reveal
}

export interface GameSubmission {
  version?: ReplayVersion;
  nonce: string;
  grid: GridConfig;
  mine_seed: string;   // deterministic mine layout seed
  actions: GameAction[];
  prayers_used: number;
  total_time_ms: number;
}

export interface VerifyResult {
  valid: boolean;
  reason?: string;
}
