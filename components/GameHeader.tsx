import React from 'react';
import { Flag, Clock, RefreshCw, Hand } from 'lucide-react';
import { GameStatus } from '../types';
import { motion, AnimatePresence } from 'framer-motion';

interface GameHeaderProps {
  minesLeft: number;
  timer: number;
  status: GameStatus;
  prayersLeft: number;
  isPraying: boolean;
  onReset: () => void;
  onTogglePrayer: () => void;
}

export const GameHeader: React.FC<GameHeaderProps> = ({ 
  minesLeft, 
  timer, 
  status, 
  prayersLeft,
  isPraying,
  onReset,
  onTogglePrayer
}) => {
  
  const getStatusIcon = () => {
    switch (status) {
      case 'won': return '😎';
      case 'lost': return '😵';
      case 'playing': return '🤔';
      default: return '🙂';
    }
  };

  return (
    <div className="flex items-center justify-between w-full max-w-2xl bg-slate-800/80 backdrop-blur-md p-4 rounded-xl shadow-lg border border-slate-700 mb-6 gap-2 sm:gap-4">
      
      {/* Mines Counter */}
      <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 sm:px-4 rounded-lg border border-red-900/50 shadow-inner min-w-[80px]">
        <Flag className="text-red-500" size={20} fill="currentColor" />
        <span className="text-xl sm:text-2xl font-mono text-red-400 font-bold ml-auto">
          {minesLeft}
        </span>
      </div>

      {/* Center Controls Group */}
      <div className="flex items-center gap-3">
          {/* Prayer Button */}
          <button
            onClick={onTogglePrayer}
            disabled={status !== 'playing' && status !== 'idle'}
            className={`
                relative w-12 h-12 sm:w-16 sm:h-16 flex flex-col items-center justify-center rounded-xl transition-all border shadow-lg
                ${isPraying 
                    ? 'bg-purple-600 border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.5)] text-white' 
                    : prayersLeft > 0 
                        ? 'bg-slate-700 border-slate-600 text-purple-400 hover:bg-slate-600' 
                        : 'bg-slate-800/50 border-slate-700 text-slate-600 cursor-not-allowed'}
            `}
            title={prayersLeft > 0 ? "Pray (Safe Guess)" : "No Prayers Left"}
          >
            <AnimatePresence>
                {isPraying && (
                    <motion.div
                        initial={{ scale: 1.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 0.5 }}
                        exit={{ scale: 0, opacity: 0 }}
                        className="absolute inset-0 bg-purple-400 rounded-xl blur-md"
                        transition={{ repeat: Infinity, duration: 1.5, repeatType: 'reverse' }}
                    />
                )}
            </AnimatePresence>
            <Hand size={24} className={isPraying ? "fill-current animate-pulse" : ""} />
            <span className="text-[10px] sm:text-xs font-bold mt-1">{prayersLeft}</span>
          </button>

          {/* Reset / Status Button */}
          <button
            onClick={onReset}
            className="w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center text-2xl sm:text-4xl bg-gradient-to-b from-slate-700 to-slate-800 rounded-xl shadow-[0_4px_0_rgb(30,41,59)] active:shadow-none active:translate-y-[4px] active:bg-slate-800 transition-all border border-slate-600 hover:brightness-110"
            title="Reset Game"
          >
            {getStatusIcon()}
          </button>
      </div>

      {/* Timer */}
      <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 sm:px-4 rounded-lg border border-emerald-900/50 shadow-inner min-w-[80px]">
        <Clock className="text-emerald-500" size={20} />
        <span className="text-xl sm:text-2xl font-mono text-emerald-400 font-bold ml-auto">
          {String(timer).padStart(3, '0')}
        </span>
      </div>
    </div>
  );
};
