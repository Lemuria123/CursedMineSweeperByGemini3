import React from 'react';
import { Flag, Clock, RefreshCw } from 'lucide-react';
import { GameStatus } from '../types';

interface GameHeaderProps {
  minesLeft: number;
  timer: number;
  status: GameStatus;
  onReset: () => void;
}

export const GameHeader: React.FC<GameHeaderProps> = ({ minesLeft, timer, status, onReset }) => {
  
  const getStatusIcon = () => {
    switch (status) {
      case 'won': return '😎';
      case 'lost': return '😵';
      case 'playing': return '🤔';
      default: return '🙂';
    }
  };

  return (
    <div className="flex items-center justify-between w-full max-w-xl bg-slate-800/80 backdrop-blur-md p-4 rounded-xl shadow-lg border border-slate-700 mb-6">
      
      {/* Mines Counter */}
      <div className="flex items-center gap-2 bg-slate-900 px-4 py-2 rounded-lg border border-red-900/50 shadow-inner">
        <Flag className="text-red-500" size={20} fill="currentColor" />
        <span className="text-2xl font-mono text-red-400 font-bold min-w-[3ch] text-right">
          {minesLeft}
        </span>
      </div>

      {/* Reset / Status Button */}
      <button
        onClick={onReset}
        className="w-16 h-16 flex items-center justify-center text-4xl bg-gradient-to-b from-slate-700 to-slate-800 rounded-xl shadow-[0_4px_0_rgb(30,41,59)] active:shadow-none active:translate-y-[4px] active:bg-slate-800 transition-all border border-slate-600 hover:brightness-110"
        title="Reset Game"
      >
        {getStatusIcon()}
      </button>

      {/* Timer */}
      <div className="flex items-center gap-2 bg-slate-900 px-4 py-2 rounded-lg border border-emerald-900/50 shadow-inner">
        <Clock className="text-emerald-500" size={20} />
        <span className="text-2xl font-mono text-emerald-400 font-bold min-w-[3ch] text-right">
          {String(timer).padStart(3, '0')}
        </span>
      </div>
    </div>
  );
};
