import React from 'react';
import { motion } from 'framer-motion';
import { Trophy, Bomb, Eye } from 'lucide-react';
import { GameStatus } from '../types';

interface ModalProps {
  status: GameStatus;
  time: number;
  isBestTime?: boolean;
  onRestart: () => void;
  onClose?: () => void;
}

export const Modal: React.FC<ModalProps> = ({ status, time, isBestTime, onRestart, onClose }) => {
  if (status !== 'won' && status !== 'lost') return null;

  const isWin = status === 'won';

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-slate-800 border-2 border-slate-600 rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center"
      >
        <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-4 ${isWin ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
          {isWin ? <Trophy size={40} /> : <Bomb size={40} />}
        </div>

        <h2 className="text-3xl font-extrabold text-white mb-2">
          {isWin ? 'You Won!' : 'Game Over!'}
        </h2>
        
        {isWin && isBestTime && (
           <motion.div 
             initial={{ opacity: 0, scale: 0.5 }}
             animate={{ opacity: 1, scale: 1 }}
             className="inline-block bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded-full text-sm font-bold mb-2 border border-yellow-500/50"
           >
             🏆 New Best Time!
           </motion.div>
        )}

        <p className="text-slate-400 mb-6">
          {isWin 
            ? `Amazing job! You cleared the field in ${time} seconds.` 
            : 'Better luck next time. Watch your step!'}
        </p>

        <div className="space-y-3">
            <button
            onClick={onRestart}
            className={`
                w-full py-3 rounded-xl font-bold text-white shadow-lg transition-transform active:scale-95
                ${isWin ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-slate-600 hover:bg-slate-500'}
            `}
            >
            Play Again
            </button>
            
            {onClose && (
                <button
                    onClick={onClose}
                    className="w-full py-3 rounded-xl font-bold text-slate-300 hover:text-white hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
                >
                    <Eye size={18} />
                    Review Board
                </button>
            )}
        </div>
      </motion.div>
    </div>
  );
};