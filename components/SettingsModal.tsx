
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, LayoutGrid, Bomb, Grid3X3, Skull, Plus, Minus, AlertTriangle } from 'lucide-react';
import { Difficulty } from '../types';
import { calculateRecommendedMines } from '../utils/gameLogic';
import { DifficultySelector } from './DifficultySelector';

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
  const [error, setError] = useState('');
  const [activePreset, setActivePreset] = useState(currentDifficulty.name);

  const MIN_DIM = 8;
  const MAX_ROWS = 25;
  const MAX_COLS = 25;

  useEffect(() => {
    if (isOpen) {
        setRows(currentDifficulty.rows);
        setCols(currentDifficulty.cols);
        setMines(currentDifficulty.mines);
        setError('');
        setActivePreset(currentDifficulty.name);
    }
  }, [isOpen, currentDifficulty]);

  // Real-time calculation of default mines when dimensions change
  useEffect(() => {
      // We set the mines to the recommended amount for the new size
      setMines(calculateRecommendedMines(rows, cols));
  }, [rows, cols]);

  const handleApply = () => {
      if (rows < MIN_DIM || rows > MAX_ROWS) {
          setError(`Rows must be between ${MIN_DIM} and ${MAX_ROWS}`);
          return;
      }
      if (cols < MIN_DIM || cols > MAX_COLS) {
          setError(`Columns must be between ${MIN_DIM} and ${MAX_COLS}`);
          return;
      }
      setError('');
      onDifficultyChange({
          name: 'Custom',
          rows,
          cols,
          mines
      });
      onClose();
  };

  const handlePresetClick = (d: Difficulty) => {
      setActivePreset(d.name);
      setRows(d.rows);
      setCols(d.cols);
      setMines(d.mines);
  };

  if (!isOpen) return null;

  const minMines = Math.max(1, Math.floor(rows * cols * 0.15));
  const maxMines = Math.floor(rows * cols * 0.30);
  const recommended = calculateRecommendedMines(rows, cols);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative bg-slate-800 border-2 border-slate-600 rounded-2xl p-5 max-w-md w-full shadow-2xl flex flex-col max-h-[85vh] overflow-y-auto no-scrollbar"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors z-10 bg-slate-800/50 rounded-full p-1"
        >
          <X size={20} />
        </button>

        {/* Cursed Header Section */}
        <div className="flex flex-col items-center text-center mb-4 pt-1 shrink-0">
            <div className="p-3 rounded-full bg-red-500/10 text-red-500 mb-3 border border-red-500/20 shadow-[0_0_20px_rgba(220,38,38,0.2)]">
                <Skull size={32} strokeWidth={2} />
            </div>
            <h2 className="text-2xl font-black text-white mb-2 tracking-tight">
                YOU ARE <span className="text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]">CURSED</span>
            </h2>
            <div className="space-y-1 px-2">
                <div className="text-sm text-slate-300 font-medium leading-tight">
                    <div className="text-red-400 font-bold">Blind guessing is punished.</div>
                    <span className="block sm:inline mt-1 sm:mt-0">
                        If a cell <span className="italic text-white">can</span> be a mine, it <span className="text-red-400 font-bold italic">is</span> a mine.
                    </span>
                </div>
                <p className="text-amber-400 font-bold tracking-wide uppercase text-[10px] border-t border-slate-700 pt-2 mt-2 inline-block px-4">
                    Only prayer can save you.
                </p>
            </div>
        </div>

        {/* Quick Presets */}
        <div className="mb-5 shrink-0">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 text-center">
                Select Difficulty
            </label>
            <DifficultySelector 
                activeName={activePreset}
                onChange={handlePresetClick}
                options={difficulties}
            />
        </div>

        {/* Customizer */}
        <div className="space-y-4 bg-slate-900/50 p-4 rounded-xl border border-slate-700 shrink-0">
            {/* Dimensions */}
            <div className="flex gap-4">
                <div className="flex-1">
                    <label className="flex items-center gap-2 text-slate-400 text-xs uppercase font-bold mb-2">
                        <LayoutGrid size={14} /> Rows
                    </label>
                    <div className="flex items-stretch">
                        <button
                            onClick={() => setRows(r => Math.max(MIN_DIM, r - 1))}
                            className="flex items-center justify-center w-9 bg-slate-800 border border-slate-600 rounded-l-lg text-slate-400 hover:text-white hover:bg-slate-700 active:bg-slate-950 transition-colors"
                        >
                            <Minus size={14} />
                        </button>
                        <input
                            type="number"
                            value={rows}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val)) setRows(val);
                            }}
                            className="w-full bg-slate-800 border-y border-slate-600 px-2 py-2 text-white font-mono text-center focus:border-amber-500 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]"
                        />
                        <button
                            onClick={() => setRows(r => Math.min(MAX_ROWS, r + 1))}
                            className="flex items-center justify-center w-9 bg-slate-800 border border-slate-600 rounded-r-lg text-slate-400 hover:text-white hover:bg-slate-700 active:bg-slate-950 transition-colors"
                        >
                            <Plus size={14} />
                        </button>
                    </div>
                </div>
                <div className="flex-1">
                    <label className="flex items-center gap-2 text-slate-400 text-xs uppercase font-bold mb-2">
                        <Grid3X3 size={14} /> Cols
                    </label>
                    <div className="flex items-stretch">
                        <button
                            onClick={() => setCols(c => Math.max(MIN_DIM, c - 1))}
                            className="flex items-center justify-center w-9 bg-slate-800 border border-slate-600 rounded-l-lg text-slate-400 hover:text-white hover:bg-slate-700 active:bg-slate-950 transition-colors"
                        >
                            <Minus size={14} />
                        </button>
                        <input
                            type="number"
                            value={cols}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val)) setCols(val);
                            }}
                            className="w-full bg-slate-800 border-y border-slate-600 px-2 py-2 text-white font-mono text-center focus:border-amber-500 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]"
                        />
                        <button
                            onClick={() => setCols(c => Math.min(MAX_COLS, c + 1))}
                            className="flex items-center justify-center w-9 bg-slate-800 border border-slate-600 rounded-r-lg text-slate-400 hover:text-white hover:bg-slate-700 active:bg-slate-950 transition-colors"
                        >
                            <Plus size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Mines Slider */}
            <div>
                 <div className="flex justify-between items-end mb-2">
                    <label className="flex items-center gap-2 text-slate-400 text-xs uppercase font-bold">
                        <Bomb size={14} /> Curse Density
                    </label>
                    <span className={`text-xs font-mono font-bold ${mines >= recommended ? 'text-red-400' : 'text-emerald-400'}`}>
                        {mines} Mines ({Math.round((mines / (rows * cols)) * 100)}%)
                    </span>
                 </div>
                 <input 
                    type="range"
                    min={minMines} max={maxMines}
                    value={mines}
                    onChange={(e) => setMines(parseInt(e.target.value))}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                 />
            </div>
        </div>

        {error && (
            <div className="mt-4 flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <AlertTriangle size={16} className="shrink-0" />
                <span>{error}</span>
            </div>
        )}

        <button
            onClick={handleApply}
            className="mt-6 w-full py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl shadow-lg shadow-amber-900/20 transition-all active:scale-95 shrink-0"
        >
            Start New Game
        </button>
      </motion.div>
    </div>
  );
};
