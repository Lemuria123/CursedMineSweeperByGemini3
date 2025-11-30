
import { CursedReward, Difficulty } from '../types';

// Placeholder for the "Red Glowing Triangle" image provided by user.
// Using a Data URI SVG here to ensure it works immediately and looks cool without external dependencies.
const CURSED_RELIC_IMAGE = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter><linearGradient id="fire" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" style="stop-color:%237f1d1d;stop-opacity:1" /><stop offset="50%" style="stop-color:%23dc2626;stop-opacity:1" /><stop offset="100%" style="stop-color:%23fca5a5;stop-opacity:1" /></linearGradient></defs><rect width="200" height="200" fill="%230f172a"/><path d="M100 30 L170 160 L30 160 Z" fill="none" stroke="url(%23fire)" stroke-width="8" stroke-linejoin="round" filter="url(%23glow)" /><path d="M100 30 L170 160 L30 160 Z" fill="none" stroke="%23ef4444" stroke-width="2" stroke-linejoin="round" opacity="0.8" /><circle cx="100" cy="110" r="15" fill="%23fbbf24" filter="url(%23glow)" opacity="0.8"><animate attributeName="opacity" values="0.8;0.4;0.8" duration="3s" repeatCount="indefinite" /></circle></svg>`;

const TITLES = [
  "The Void's Gaze", "Silent Scream", "Eternal Rust", "The First Sin", 
  "Fractured Mirror", "Digital Decay", "Neon Tomb", "Whispering Code"
];

const LORE_TEXTS = [
  "You saw the truth where others saw only grass. The mine was not there until you observed it.",
  "Fortune favors the bold, but the curse favors the persistent. You have survived the logic trap.",
  "The numbers... they were never math. They were coordinates to this exact moment.",
  "0 Prayers. 0 Hope. 100% Willpower. You have stared into the abyss and it blinked first.",
  "Data corruption imminent. The grid is dissolving. You are the only constant variable.",
];

// Generates a deterministic reward based on the grid config
export const fetchCursedReward = async (difficulty: Difficulty): Promise<CursedReward> => {
  // Simulate network delay for "Decrypting" effect
  await new Promise(resolve => setTimeout(resolve, 1500));

  const seed = difficulty.rows * difficulty.cols + difficulty.mines;
  
  // As requested, we prioritize the IMAGE type and the specific relic image for now
  const type = 'image';
  const content = CURSED_RELIC_IMAGE;

  const randomTitle = TITLES[seed % TITLES.length];

  return {
    id: `${difficulty.rows}-${difficulty.cols}-${difficulty.mines}`,
    date: Date.now(),
    difficultyName: difficulty.name,
    title: difficulty.name === 'Custom' ? 'Unknown Artifact' : randomTitle,
    content: content, // The image URL/Data URI
    type: type,
    hue: (seed * 137) % 360 // Keep hue for fallback/glow effects
  };
};
