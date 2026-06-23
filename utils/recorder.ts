// Game action recorder — captures every player action for server replay verification.
// Records: first_reveal, reveal (with prayed flag), flag, chord.
// Produces the game_data payload for POST /api/submit.

interface RecordedAction {
  type: 'first_reveal' | 'reveal' | 'flag' | 'chord';
  row: number;
  col: number;
  ts: number;      // ms offset from first action
  prayed?: boolean; // only for reveal
}

interface GameDataPayload {
  version: 1;
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

  start(firstClickRow: number, firstClickCol: number, seedSuffix: string = '') {
    this.actions = [];
    this.startTime = Date.now();
    this.firstClickRow = firstClickRow;
    this.firstClickCol = firstClickCol;
    this.seedSuffix = seedSuffix;
    this.record('first_reveal', firstClickRow, firstClickCol);
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
      version: 1,
      nonce,
      grid: { rows, cols, mines },
      mine_seed: mineSeed,
      actions: this.actions,
      prayers_used: prayersUsed,
      total_time_ms: Date.now() - this.startTime,
    };
  }
}
