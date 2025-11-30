
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, LayoutGrid, Bomb, Grid3X3, Skull } from 'lucide-react';
import { Difficulty } from '../types';
import { calculateRecommendedMines } from '../utils/gameLogic';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDifficulty: Difficulty;
  onDifficultyChange: (d: Difficulty) => void;
  difficulties: Difficulty[];
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentDifficulty,
  onDifficultyChange,
  difficulties
}) => {
  const [rows, setRows] = useState(currentDifficulty.rows);
  const [cols, setCols] = useState(currentDifficulty.cols);
  const [mines, setMines] = useState(currentDifficulty.mines);

  useEffect(() => {
    if (isOpen) {
        setRows(currentDifficulty.rows);
        setCols(currentDifficulty.cols);
        setMines(currentDifficulty.mines);
    }
  }, [isOpen, currentDifficulty]);

  // Real-time calculation of default mines when dimensions change
  useEffect(() => {
      // We set the mines to the recommended amount for the new size
      setMines(calculateRecommendedMines(rows, cols));
  }, [rows, cols]);

  const handleApply = () => {
      onDifficultyChange({
          name: 'Custom',
          rows,
          cols,
          mines
      });
      onClose();
  };

  const handlePresetClick = (d: Difficulty) => {
      setRows(d.rows);
      setCols(d.cols);
      // Mine update will trigger via useEffect, but we set it here explicitly to ensure preset consistency if useEffect has delay
      setMines(d.mines);
  };

  if (!isOpen) return null;

  const maxMines = Math.floor(rows * cols * 0.85);
  const density = Math.round((mines / (rows * cols)) * 100);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative bg-slate-800 border-2 border-slate-600 rounded-2xl p-6 max-w-md w-full shadow-2xl"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X size={24} />
        </button>

        {/* Cursed Header Section */}
        <div className="flex flex-col items-center text-center mb-6 pt-2">
            <div className="p-4 rounded-full bg-red-500/10 text-red-500 mb-4 border border-red-500/20 shadow-[0_0_20px_rgba(220,38,38,0.2)]">
                <Skull size={40} strokeWidth={2} />
            </div>
            <h2 className="text-3xl font-black text-white mb-4 tracking-tight">
                You are <span className="text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]">Cursed!</span>
            </h2>
            <div className="space-y-3">
                <div className="text-lg text-slate-300 font-medium leading-relaxed">
                    <p className="text-red-400 font-bold mb-1">Guesses are punished.</p>
                    <p>
                        If a cell <span className="italic text-white">could</span> be a mine, it <span className="text-red-400 font-bold italic">IS</span> a mine.
                    </p>
                </div>
                <p className="text-amber-400 font-bold tracking-wide uppercase text-sm border-t border-slate-700 pt-3 mt-2 inline-block px-4">
                    Only prayer can save you.
                </p>
            </div>
        </div>

        {/* Quick Presets */}
        <div className="mb-6">
            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider text-center">Select Difficulty</label>
            <div className="flex gap-2">
                {difficulties.map(d => (
                    <button
                        key={d.name}
                        onClick={() => handlePresetClick(d)}
                        className={`
                            flex-1 py-2 rounded-lg text-sm font-bold border transition-all
                            ${(rows === d.rows && cols === d.cols && mines === d.mines) 
                                ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg transform scale-105' 
                                : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'}
                        `}
                    >
                        {d.name}
                    </button>
                ))}
            </div>
        </div>

        {/* Custom Sliders */}
        <div className="space-y-5 mb-8 bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
            {/* Rows */}
            <div>
                <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-400 flex items-center gap-2 font-semibold"><Grid3X3 size={14} /> Rows</span>
                    <span className="font-mono font-bold text-emerald-400">{rows}</span>
                </div>
                <input 
                    type="range" min="8" max="24" step="1" 
                    value={rows} onChange={(e) => setRows(Number(e.target.value))}
                    className="w-full accent-emerald-500 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
            </div>

             {/* Cols */}
             <div>
                <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-400 flex items-center gap-2 font-semibold"><LayoutGrid size={14} /> Columns</span>
                    <span className="font-mono font-bold text-emerald-400">{cols}</span>
                </div>
                <input 
                    type="range" min="8" max="30" step="1" 
                    value={cols} onChange={(e) => setCols(Number(e.target.value))}
                    className="w-full accent-emerald-500 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
            </div>

             {/* Mines */}
             <div>
                <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-400 flex items-center gap-2 font-semibold"><Bomb size={14} /> Mines</span>
                    <span className="font-mono font-bold text-red-400">{mines} <span className="text-slate-500 text-xs font-normal">({density}%)</span></span>
                </div>
                <input 
                    type="range" min="1" max={maxMines} step="1" 
                    value={mines} onChange={(e) => setMines(Number(e.target.value))}
                    className="w-full accent-red-500 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                />
            </div>
        </div>

        <button 
            onClick={handleApply}
            className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2"
        >
            Start New Game
        </button>

      </motion.div>
    </div>
  );
};
