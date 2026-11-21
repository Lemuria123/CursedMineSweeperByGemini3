import { CURRENT_REPLAY_VERSION, type ReplayVersion } from '../shared/types';

// Game action recorder — captures every player action for server replay verification.
// Records: first_reveal, reveal (with prayed flag), flag, chord.
// Produces the game_data payload for POST /api/submit.

interface RecordedAction {
  type: 'first_reveal' | 'reveal' | 'flag' | 'chord';
  row: number;
  col: number;
  ts: number;      // ms offset from first action
  prayed?: boolean; // only for reveal
  initial_flags?: { row: number; col: number }[]; // active flags before first_reveal
}

interface GameDataPayload {
  version: ReplayVersion;
  nonce: string;
  grid: { rows: number; cols: number; mines: number };
  mine_seed: string;
  actions: RecordedAction[];
  prayers_used: number;
  total_time_ms: number;
}

export class GameRecorder {
  private actions: RecordedAction[] = [];
  private startTime: number = 0;
  private firstClickRow: number = 0;
  private firstClickCol: number = 0;
  private seedSuffix: string = '';

  start(
    firstClickRow: number,
    firstClickCol: number,
    seedSuffix: string = '',
    initialFlags: NonNullable<RecordedAction['initial_flags']> = [],
  ) {
    this.startTime = Date.now();
    this.firstClickRow = firstClickRow;
    this.firstClickCol = firstClickCol;
    this.seedSuffix = seedSuffix;
    const firstReveal: RecordedAction = { type: 'first_reveal', row: firstClickRow, col: firstClickCol, ts: 0 };
    if (initialFlags.length > 0) {
      firstReveal.initial_flags = initialFlags.map(({ row, col }) => ({ row, col }));
    }
    this.actions = [firstReveal];
  }

  record(type: RecordedAction['type'], row: number, col: number, prayed?: boolean) {
    const ts = Date.now() - this.startTime;
    const action: RecordedAction = { type, row, col, ts };
    if (prayed !== undefined && (type === 'reveal' || type === 'chord')) {
      action.prayed = prayed;
    }
    this.actions.push(action);
  }

  /**
   * Build the full payload ready for encryption and submission.
   */
  buildPayload(nonce: string, rows: number, cols: number, mines: number, prayersUsed: number): GameDataPayload {
    const mineSeed = `${rows}-${cols}-${mines}-${this.firstClickRow}-${this.firstClickCol}${this.seedSuffix ? '-' + this.seedSuffix : ''}`;
    return {
      version: CURRENT_REPLAY_VERSION,
      nonce,
      grid: { rows, cols, mines },
      mine_seed: mineSeed,
      actions: this.actions,
      prayers_used: prayersUsed,
      total_time_ms: Date.now() - this.startTime,
    };
  }
}
