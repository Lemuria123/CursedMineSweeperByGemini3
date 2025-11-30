import React from 'react';
import { motion } from 'framer-motion';
import { X, Settings, Skull, Zap } from 'lucide-react';
import { Difficulty, GameMode } from '../types';
import { DifficultySelector } from './DifficultySelector';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDifficulty: Difficulty;
  onDifficultyChange: (d: Difficulty) => void;
  difficulties: Difficulty[];
  gameMode: GameMode;
  onGameModeChange: (m: GameMode) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentDifficulty,
  onDifficultyChange,
  difficulties,
  gameMode,
  onGameModeChange
}) => {
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative bg-slate-800 border-2 border-slate-600 rounded-2xl p-6 max-w-sm w-full shadow-2xl"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X size={24} />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-full bg-slate-700 text-slate-300">
            <Settings size={24} />
          </div>
          <h2 className="text-2xl font-bold text-white">Settings</h2>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-bold text-slate-400 mb-3 uppercase tracking-wider">
            Game Mode
          </label>
          <div className="flex gap-2 bg-slate-900/50 p-1.5 rounded-xl border border-slate-700 w-full">
            <button
              onClick={() => onGameModeChange('classic')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${
                gameMode === 'classic' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Classic</span>
            </button>
            <button
              onClick={() => onGameModeChange('strict')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${
                gameMode === 'strict' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Skull size={16} />
              <span>Strict</span>
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500 h-8">
            {gameMode === 'strict' 
              ? "Guesses are punished. If a cell COULD be a mine, it IS a mine." 
              : "Standard minesweeper rules. Good luck!"}
          </p>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-bold text-slate-400 mb-3 uppercase tracking-wider">
            Difficulty
          </label>
          <DifficultySelector
            current={currentDifficulty}
            onChange={onDifficultyChange}
            options={difficulties}
          />
        </div>

        <div className="text-center text-xs text-slate-500 font-mono">
          Map Size: {currentDifficulty.rows}x{currentDifficulty.cols} • Mines: {currentDifficulty.mines}
        </div>
      </motion.div>
    </div>
  );
};
