import React from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Trophy, Bomb, Eye, Crown, Sparkles } from 'lucide-react';
import { GameStatus } from '../types';

interface ModalProps {
  status: GameStatus;
  prayersUsed: number;
  isPrayerFailure?: boolean;
  onRestart: () => void;
  onClose?: () => void;
}

// 对局结束弹窗：只展示胜负、ACE 和祈祷结果，不再展示宝物。
export const Modal: React.FC<ModalProps> = ({ status, prayersUsed, isPrayerFailure, onRestart, onClose }) => {
  const { t } = useTranslation();
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
        {isAced && (
            <div className="absolute inset-0 bg-gradient-to-t from-amber-500/10 via-transparent to-transparent pointer-events-none" />
        )}

        <div className="relative mx-auto mb-6 flex items-center justify-center">
            <motion.div
                className={`w-20 h-20 rounded-full flex items-center justify-center ${isWin ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}
            >
                {isWin ? <Trophy size={40} /> : <Bomb size={40} />}
                {isAced && (
                    <div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 p-2 rounded-full shadow-lg border-2 border-slate-800">
                        <Crown size={16} fill="currentColor" />
                    </div>
                )}
            </motion.div>
        </div>

        <h2 className="text-3xl font-extrabold text-white mb-2">
        {isWin ? (isAced ? t('modal.pureVictory') : t('modal.youWon')) : t('modal.gameOver')}
        </h2>

        <div className="flex flex-wrap gap-2 justify-center mb-4 min-h-[24px]">
            {isAced && (
            <span className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg">
                <Sparkles size={12} fill="currentColor" /> {t('modal.aced')}
            </span>
            )}
        </div>

        {/* 结束说明与下方「查看棋盘」同一字号（text-base），不再用更小的 text-sm */}
        <p className="text-slate-400 mb-6 text-base leading-relaxed">
        {isWin
            ? t('modal.clearedWithPrayers', { count: prayersUsed })
            : (isPrayerFailure
                ? t('modal.prayerFailure')
                : t('modal.curseClaims'))
        }
        </p>

        <div className="space-y-3 relative z-10">
            <button
            onClick={onRestart}
            className={`
                w-full py-3 rounded-xl font-bold text-white shadow-lg transition-transform active:scale-95 border-b-4
                ${isWin ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-800' : 'bg-slate-600 hover:bg-slate-500 border-slate-800'}
            `}
            >
            {t('modal.playAgain')}
            </button>

            {onClose && (
                <button
                    onClick={onClose}
                    className="w-full py-3 rounded-xl font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                >
                    <Eye size={18} />
                    {t('modal.viewBoard')}
                </button>
            )}
        </div>
      </motion.div>
    </div>
  );
};
