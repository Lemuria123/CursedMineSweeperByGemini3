
import { CursedReward, Difficulty } from '../types';

const REWARD_STORAGE_KEY = 'cursed_minesweeper_grimoire_v1';

const getRewards = (): CursedReward[] => {
  try {
    const data = localStorage.getItem(REWARD_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error("Failed to load grimoire", e);
    return [];
  }
};

export const hasRewardForDifficulty = (diff: Difficulty): boolean => {
  const id = `${diff.rows}-${diff.cols}-${diff.mines}`;
  const rewards = getRewards();
  return rewards.some(r => r.id === id);
};

export const saveReward = (reward: CursedReward) => {
  const rewards = getRewards();
  // Deduplicate just in case
  if (rewards.some(r => r.id === reward.id)) return;
  
  rewards.push(reward);
  localStorage.setItem(REWARD_STORAGE_KEY, JSON.stringify(rewards));
};

export const getAllRewards = (): CursedReward[] => {
  return getRewards().sort((a, b) => b.date - a.date);
};
