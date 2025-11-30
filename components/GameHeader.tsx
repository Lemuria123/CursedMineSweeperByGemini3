
import React from 'react';
import { Bomb } from 'lucide-react';
import { GameStatus } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { PrayingHands } from './PrayingHands';

interface GameHeaderProps {
  minesLeft: number;
  status: GameStatus;
  prayersUsed: number;
  isPraying: boolean;
  onReset: () => void;
  onTogglePrayer: () => void;
}

const FaceIcon: React.FC<{ status: GameStatus }> = ({ status }) => {
  // Won: Radiant Smile (Curse Lifted)
  if (status === 'won') {
    return (
      <div className="relative w-full h-full flex items-center justify-center p-2">
         <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full h-full text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]"
         >
           <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
             <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="2"/>
             <path d="M7 9C7 9 8.5 7.5 10 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
             <path d="M14 9C14 9 15.5 7.5 17 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
             <path d="M6.5 13.5C8 16.5 11 17.5 12 17.5C13 17.5 16 16.5 17.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
             <path d="M19 5L20 7L21 5L19 3L19 5Z" fill="#fef08a" />
           </svg>
         </motion.div>
      </div>
    );
  }

  // Lost: Dead, Slack Jaw
  if (status === 'lost') {
    return (
      <div className="relative w-full h-full flex items-center justify-center p-2">
         <motion.div
            initial={{ rotate: 0 }}
            animate={{ rotate: [0, -5, 5, 0] }}
            transition={{ duration: 0.4 }}
            className="w-full h-full text-slate-400"
         >
           <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
             <circle cx="12" cy="12" r="10" fill="#334155" stroke="currentColor" strokeWidth="2"/>
             <path d="M6 8L9 11M9 8L6 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
             <path d="M15 8L18 11M18 8L15 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
             <path d="M7 16C9 15 11 17 12 17C14 17 16 15.5 17 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
             <path d="M17 16L17 19" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
             <path d="M16 19.5L16 21" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
             <path d="M15 5L16 6L17 5" stroke="#ef4444" strokeWidth="1" opacity="0.5" />
           </svg>
         </motion.div>
      </div>
    );
  }

  // Idle / Playing: Cursed, Stressed
  return (
    <div className="relative w-full h-full flex items-center justify-center p-2">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-indigo-200">
             <circle cx="12" cy="12" r="10" fill="#1e293b" stroke="currentColor" strokeWidth="2" className="stroke-slate-500"/>
             <circle cx="8" cy="10" r="1.5" fill="#0f172a" stroke="currentColor" strokeWidth="1.5"/>
             <circle cx="16" cy="10" r="1.5" fill="#0f172a" stroke="currentColor" strokeWidth="1.5"/>
             <path d="M6 12C7 13 8.5 13 9.5 12" stroke="#6366f1" strokeWidth="1" opacity="0.5"/>
             <path d="M14.5 12C15.5 13 17 13 18 12" stroke="#6366f1" strokeWidth="1" opacity="0.5"/>
             <path d="M9 16H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
             <motion.g
                animate={{ y: [0, 4], opacity: [1, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeIn" }}
             >
                <path d="M18 5C18 5 19 7 18 8C17.5 8.5 17 7 17 7" fill="#a5b4fc" />
             </motion.g>
        </svg>
    </div>
  );
};

export const GameHeader: React.FC<GameHeaderProps> = ({ 
  minesLeft, 
  status, 
  prayersUsed,
  isPraying,
  onReset,
  onTogglePrayer
}) => {
  
  return (
    <div className="relative flex items-center justify-between w-full max-w-2xl mx-auto h-20 bg-slate-900/40 backdrop-blur-md rounded-2xl shadow-xl border border-white/5 px-2 sm:px-4 mb-6">
      
      {/* 1. LEFT: Mine Counter (Threat) */}
      <div className="flex-1 flex justify-start">
          <div className="flex items-center gap-3 bg-slate-950/50 px-4 py-2 rounded-xl border border-red-900/20 shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] min-w-[90px] sm:min-w-[110px]">
            <div className="p-1.5 rounded-full bg-red-500/10 text-red-500 shadow-[0_0_10px_rgba(220,38,38,0.2)]">
                <Bomb size={18} fill="currentColor" />
            </div>
            <span className="text-2xl font-mono text-red-400 font-bold tracking-widest drop-shadow-sm">
              {minesLeft}
            </span>
          </div>
      </div>

      {/* 2. CENTER: The Face (The Soul) */}
      <div className="flex-none -mt-1 z-10">
          <button
            onClick={onReset}
            className="w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center bg-gradient-to-b from-slate-700 to-slate-800 rounded-2xl shadow-[0_8px_0_rgb(30,41,59)] active:shadow-none active:translate-y-[8px] active:bg-slate-800 transition-all border border-slate-600 hover:brightness-110 group"
            title="Reset Game"
          >
            <div className="w-full h-full p-1 transition-transform group-hover:scale-105">
                <FaceIcon status={status} />
            </div>
          </button>
      </div>

      {/* 3. RIGHT: Prayer Toggle (Redemption) */}
      <div className="flex-1 flex justify-end">
          <button
            onClick={onTogglePrayer}
            disabled={status !== 'playing' && status !== 'idle'}
            className={`
                relative flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-300 min-w-[90px] sm:min-w-[110px] justify-center group
                ${isPraying 
                    ? 'bg-amber-900/30 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)] translate-y-[1px]' 
                    : 'bg-slate-800/50 border-slate-700 hover:bg-slate-800 hover:border-slate-500 shadow-lg'
                }
            `}
            title="Toggle Prayer (Safe Guess)"
          >
            {/* Glow effect when active */}
            {isPraying && (
                <motion.div
                    layoutId="prayer-glow"
                    className="absolute inset-0 bg-amber-500/10 rounded-xl animate-pulse" 
                />
            )}

            <div className={`w-8 h-8 ${isPraying ? 'text-amber-400 drop-shadow-[0_0_5px_rgba(245,158,11,0.8)]' : 'text-slate-500 group-hover:text-slate-300'}`}>
                 <PrayingHands isActive={isPraying} />
            </div>
            
            <span className={`hidden sm:block text-xs font-bold uppercase tracking-wider ${isPraying ? 'text-amber-400' : 'text-slate-500 group-hover:text-slate-300'}`}>
                {isPraying ? 'Praying' : 'Pray'}
            </span>
          </button>
      </div>
    </div>
  );
};
