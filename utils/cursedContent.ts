
import { CursedReward, Difficulty } from '../types';
import { getRewardTemplates } from './api';

// 备用随机标题（模板未配置时使用）
const FALLBACK_TITLES = [
  "The Void's Gaze", "Silent Scream", "Eternal Rust", "The First Sin",
  "Fractured Mirror", "Digital Decay", "Neon Tomb", "Whispering Code"
];

// 备用图片（模板未配置时使用）
const FALLBACK_IMAGE = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter><linearGradient id="fire" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" style="stop-color:%237f1d1d;stop-opacity:1" /><stop offset="50%" style="stop-color:%23dc2626;stop-opacity:1" /><stop offset="100%" style="stop-color:%23fca5a5;stop-opacity:1" /></linearGradient></defs><rect width="200" height="200" fill="%230f172a"/><path d="M100 30 L170 160 L30 160 Z" fill="none" stroke="url(%23fire)" stroke-width="8" stroke-linejoin="round" filter="url(%23glow)" /><path d="M100 30 L170 160 L30 160 Z" fill="none" stroke="%23ef4444" stroke-width="2" stroke-linejoin="round" opacity="0.8" /><circle cx="100" cy="110" r="15" fill="%23fbbf24" filter="url(%23glow)" opacity="0.8"><animate attributeName="opacity" values="0.8;0.4;0.8" duration="3s" repeatCount="indefinite" /></circle></svg>`;

/**
 * 获取指定难度的奖品信息。
 * 优先从后端奖品模板 API 查找匹配的模板，未配置时使用随机备用内容。
 */
export const fetchCursedReward = async (difficulty: Difficulty): Promise<CursedReward> => {
  // 模拟解密延迟
  await new Promise(resolve => setTimeout(resolve, 1500));

  try {
    // 从后端获取所有奖品模板
    const templates = await getRewardTemplates();
    // 查找匹配当前棋盘尺寸的模板
    const template = templates.find(t => t.rows === difficulty.rows && t.cols === difficulty.cols);

    if (template) {
      return {
        id: `${difficulty.rows}-${difficulty.cols}`,
        date: Date.now(),
        difficultyName: difficulty.name,
        title: template.name,
        icon: template.icon,
        content: template.content,
        type: template.type as 'image' | 'text' | 'glitch',
        hue: template.hue,
      };
    }
  } catch {
    // 离线或 API 不可用时使用备用方案
  }

  // 备用：随机生成奖品（模板未配置时的兜底）
  const seed = difficulty.rows * difficulty.cols + difficulty.mines;
  const randomTitle = FALLBACK_TITLES[seed % FALLBACK_TITLES.length];

  return {
    id: `${difficulty.rows}-${difficulty.cols}`,
    date: Date.now(),
    difficultyName: difficulty.name,
    title: difficulty.name === 'Custom' ? 'Unknown Artifact' : randomTitle,
    icon: '',
    content: FALLBACK_IMAGE,
    type: 'image',
    hue: (seed * 137) % 360,
  };
};
