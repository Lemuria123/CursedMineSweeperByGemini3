
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Bomb, Eye, Crown, Sparkles } from 'lucide-react';
import { GameStatus, CursedReward } from '../types';

interface ModalProps {
  status: GameStatus;
  prayersUsed: number;
  newReward: CursedReward | null; 
  isPrayerFailure?: boolean;
  onRestart: () => void;
  onClose?: () => void;
}

export const Modal: React.FC<ModalProps> = ({ status, prayersUsed, newReward, isPrayerFailure, onRestart, onClose }) => {
  if (status !== 'won' && status !== 'lost') return null;

  const isWin = status === 'won';
  const isAced = isWin && prayersUsed === 0;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-slate-900 border-2 border-amber-900/50 rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center relative overflow-hidden"
      >
        {/* Aced Background Effect */}
        {isAced && (
            <div className="absolute inset-0 bg-gradient-to-t from-amber-500/10 via-transparent to-transparent pointer-events-none" />
        )}

        {/* Header Icon / Relic Reveal */}
        <div className="relative mx-auto mb-6 flex items-center justify-center">
          <AnimatePresence mode="wait">
            {newReward ? (
                /* NEW REWARD ANIMATION */
                <motion.div
                    key="relic"
                    initial={{ scale: 0, rotate: 180, filter: 'blur(10px)' }}
                    animate={{ scale: 1, rotate: 0, filter: 'blur(0px)' }}
                    transition={{ type: "spring", duration: 1.5, bounce: 0.5 }}
                    className="relative w-32 h-32 rounded-lg shadow-[0_0_50px_rgba(220,38,38,0.4)] border-2 border-amber-500/50 overflow-hidden bg-black"
                >
                    <motion.div 
                        className="absolute inset-0 bg-gradient-to-tr from-amber-500/20 to-red-500/20 z-10 animate-pulse" 
                    />
                    <img src={newReward.content} alt="Cursed Relic" className="w-full h-full object-cover" />
                    
                    {/* Shiny glint effect */}
                    <motion.div
                        initial={{ x: '-100%' }}
                        animate={{ x: '100%' }}
                        transition={{ duration: 1, delay: 1, repeat: Infinity, repeatDelay: 3 }}
                        className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12 z-20"
                    />
                </motion.div>
            ) : (
                /* Standard Win/Loss Icon */
                <motion.div 
                    key="icon"
                    className={`w-20 h-20 rounded-full flex items-center justify-center ${isWin ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}
                >
                    {isWin ? <Trophy size={40} /> : <Bomb size={40} />}
                    {isAced && !newReward && (
                        <div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 p-2 rounded-full shadow-lg border-2 border-slate-800">
                            <Crown size={16} fill="currentColor" />
                        </div>
                    )}
                </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Text Content */}
        {newReward ? (
             <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
             >
                 <h2 className="text-xl font-bold text-amber-500 uppercase tracking-widest mb-1">Cursed Artifact</h2>
                 <h3 className="text-2xl font-black text-white mb-4 drop-shadow-md">{newReward.title}</h3>
                 <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700 mb-6">
                     <p className="text-xs text-slate-400 font-mono italic">
                        "Artifact retrieved from the void."
                     </p>
                 </div>
             </motion.div>
        ) : (
            <>
                <h2 className="text-3xl font-extrabold text-white mb-2">
                {isWin ? (isAced ? 'Pure Victory!' : 'You Won!') : 'Game Over!'}
                </h2>
                
                <div className="flex flex-wrap gap-2 justify-center mb-4 min-h-[24px]">
                    {isAced && (
                    <span className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg">
                        <Sparkles size={12} fill="currentColor" /> ACED
                    </span>
                    )}
                </div>

                <p className="text-slate-400 mb-6 text-sm leading-relaxed">
                {isWin 
                    ? `Sector cleared using ${prayersUsed} prayers.` 
                    : (isPrayerFailure 
                        ? 'Not even prayer can save you from the inevitable.' 
                        : 'The curse claims another soul.')
                }
                </p>
            </>
        )}

        <div className="space-y-3 relative z-10">
            <button
            onClick={onRestart}
            className={`
                w-full py-3 rounded-xl font-bold text-white shadow-lg transition-transform active:scale-95 border-b-4
                ${isWin ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-800' : 'bg-slate-600 hover:bg-slate-500 border-slate-800'}
            `}
            >
            {newReward ? 'Collect & Continue' : 'Play Again'}
            </button>
            
            {onClose && (
                <button
                    onClick={onClose}
                    className="w-full py-3 rounded-xl font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                >
                    <Eye size={18} />
                    View Board
                </button>
            )}
        </div>
      </motion.div>
    </div>
  );
};
