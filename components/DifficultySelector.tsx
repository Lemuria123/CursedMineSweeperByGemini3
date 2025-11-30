import React from 'react';
import { Difficulty } from '../types';
import { motion } from 'framer-motion';

interface Props {
  current: Difficulty;
  onChange: (d: Difficulty) => void;
  options: Difficulty[];
}

export const DifficultySelector: React.FC<Props> = ({ current, onChange, options }) => {
  return (
    <div className="flex gap-2 bg-slate-900/50 p-1.5 rounded-xl border border-slate-700 w-full justify-center">
      {options.map((opt) => {
        const isActive = current.name === opt.name;
        return (
          <button
            key={opt.name}
            onClick={() => onChange(opt)}
            className={`
              relative flex-1 px-4 py-2 rounded-lg text-sm font-bold transition-all
              ${isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200'}
            `}
          >
            {isActive && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 bg-emerald-600 rounded-lg shadow-lg"
                transition={{ type: 'spring', duration: 0.5 }}
              />
            )}
            <span className="relative z-10">{opt.name}</span>
          </button>
        );
      })}
    </div>
  );
};