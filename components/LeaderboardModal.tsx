import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Trophy, Calendar, Clock, Skull } from 'lucide-react';
import { GameRecord, Difficulty, GameMode } from '../types';
import { getLeaderboard } from '../utils/storage';

interface LeaderboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  difficulties: Difficulty[];
  currentDifficultyName: string;
  gameMode: GameMode;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  isOpen,
  onClose,
  difficulties,
  currentDifficultyName,
  gameMode
}) => {
  const [activeTab, setActiveTab] = useState(currentDifficultyName);
  const [records, setRecords] = useState<GameRecord[]>([]);

  useEffect(() => {
    if (isOpen) {
        setActiveTab(currentDifficultyName);
    }
  }, [isOpen, currentDifficultyName]);

  useEffect(() => {
    if (isOpen) {
      getLeaderboard(activeTab, gameMode).then(setRecords);
    }
  }, [isOpen, activeTab, gameMode]);

  if (!isOpen) return null;

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative bg-slate-800 border-2 border-slate-600 rounded-2xl p-6 max-w-md w-full shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors z-10"
        >
          <X size={24} />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className={`p-3 rounded-full bg-opacity-20 ${gameMode === 'strict' ? 'bg-red-500 text-red-500' : 'bg-yellow-500 text-yellow-500'}`}>
            {gameMode === 'strict' ? <Skull size={24} /> : <Trophy size={24} />}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Leaderboard</h2>
            <p className="text-xs text-slate-400 uppercase tracking-widest">{gameMode} mode</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-slate-900/50 p-1 rounded-xl mb-4 shrink-0">
          {difficulties.map((d) => (
            <button
              key={d.name}
              onClick={() => setActiveTab(d.name)}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors relative ${
                activeTab === d.name ? 'text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {activeTab === d.name && (
                <motion.div
                   layoutId="leaderboardTab"
                   className="absolute inset-0 bg-slate-700 shadow-sm rounded-lg"
                   transition={{ type: 'spring', duration: 0.5 }}
                />
              )}
              <span className="relative z-10">{d.name}</span>
            </button>
          ))}
        </div>

        {/* List */}
        <div className="overflow-y-auto pr-2 -mr-2 flex-grow custom-scrollbar">
          {records.length === 0 ? (
            <div className="text-center text-slate-500 py-10">
              No records yet. Be the first!
            </div>
          ) : (
            <ul className="space-y-2">
              {records.map((record, index) => (
                <motion.li
                  key={record.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`
                    flex items-center justify-between p-3 rounded-lg border
                    ${index === 0 ? 'bg-yellow-500/10 border-yellow-500/30' : 
                      index === 1 ? 'bg-slate-300/10 border-slate-300/30' :
                      index === 2 ? 'bg-orange-700/10 border-orange-700/30' :
                      'bg-slate-700/30 border-slate-700/50'}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <div className={`
                      w-8 h-8 flex items-center justify-center rounded-full font-bold text-sm
                      ${index === 0 ? 'bg-yellow-500 text-slate-900' : 
                        index === 1 ? 'bg-slate-300 text-slate-900' :
                        index === 2 ? 'bg-orange-700 text-slate-100' :
                        'bg-slate-700 text-slate-400'}
                    `}>
                      {index + 1}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Calendar size={10} /> {formatDate(record.date)}
                        </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                     <Clock size={14} className={index < 3 ? 'text-emerald-400' : 'text-slate-500'} />
                     <span className={`font-mono font-bold text-lg ${index < 3 ? 'text-white' : 'text-slate-300'}`}>
                        {record.time}s
                     </span>
                  </div>
                </motion.li>
              ))}
            </ul>
          )}
        </div>
      </motion.div>
    </div>
  );
};
