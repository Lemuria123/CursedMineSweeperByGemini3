
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

/**
 * 按棋盘尺寸（rows × cols）判断是否已拥有该尺寸的奖品
 * 同尺寸不同雷数只计 1 个奖品，不再按 mines 区分
 */
export const hasRewardForDifficulty = (diff: Difficulty): boolean => {
  const rewards = getRewards();
  return rewards.some(r => {
    const parts = r.id.split('-').map(Number);
    // 兼容旧格式（rows-cols-mines）和新格式（rows-cols）
    return parts[0] === diff.rows && parts[1] === diff.cols;
  });
};

export const saveReward = (reward: CursedReward) => {
  const rewards = getRewards();
  // 按尺寸去重（同尺寸不同雷数视为重复）
  if (hasRewardForDifficulty({ name: '', rows: parseInt(reward.id.split('-')[0]), cols: parseInt(reward.id.split('-')[1]), mines: 0 })) return;
  
  rewards.push(reward);
  localStorage.setItem(REWARD_STORAGE_KEY, JSON.stringify(rewards));
};

export const getAllRewards = (): CursedReward[] => {
  return getRewards().sort((a, b) => b.date - a.date);
};
