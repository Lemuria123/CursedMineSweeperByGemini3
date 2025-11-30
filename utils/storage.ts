import { GameRecord, GameMode } from '../types';

const STORAGE_KEY = 'minesweeper_records_v2'; // Bumped version for new schema

// Helper to get all records
const getAllRecords = (): GameRecord[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to load records", e);
    return [];
  }
};

export const saveGameRecord = async (time: number, difficultyName: string, mode: GameMode = 'classic'): Promise<GameRecord> => {
  const records = getAllRecords();
  const newRecord: GameRecord = {
    id: Date.now().toString(),
    date: Date.now(),
    time,
    difficultyName,
    mode,
  };
  
  records.push(newRecord);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  
  return newRecord;
};

export const getLeaderboard = async (difficultyName: string, mode: GameMode = 'classic'): Promise<GameRecord[]> => {
  const records = getAllRecords();
  return records
    .filter(r => r.difficultyName === difficultyName && (r.mode === mode || (!r.mode && mode === 'classic')))
    .sort((a, b) => a.time - b.time)
    .slice(0, 10);
};

export const isNewBest = (time: number, difficultyName: string, mode: GameMode = 'classic'): boolean => {
    const records = getAllRecords().filter(r => r.difficultyName === difficultyName && (r.mode === mode || (!r.mode && mode === 'classic')));
    if (records.length === 0) return true;
    const bestTime = Math.min(...records.map(r => r.time));
    return time < bestTime;
}
