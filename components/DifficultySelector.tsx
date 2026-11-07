import React from 'react';
import { useTranslation } from 'react-i18next';
import { Difficulty } from '../types';
import { motion } from 'framer-motion';

interface Props {
  activeName: string;
  onChange: (d: Difficulty) => void;
  options: Difficulty[];
}

/**
 * 三个预设的棋盘外形，不写文字。
 * 简单是小方块（9×9），中等是更大的方块（16×16），困难是又高又窄的一条（25×16）。
 */
const BOARD_MARK: Record<string, string> = {
  Easy: 'w-2.5 h-2.5',
  Medium: 'w-3.5 h-3.5',
  Hard: 'w-3 h-4',
};

export const DifficultySelector: React.FC<Props> = ({ activeName, onChange, options }) => {
  const { t } = useTranslation();
  // 竖排贴在棋盘左边。不再套卡片，三个按钮本身就是控件
  return (
    <div className="flex flex-col gap-2 shrink-0">
      {options.map((opt) => {
        const isActive = activeName === opt.name;
        const label = t(`difficulty.${opt.name}`, opt.name);
        return (
          <button
            key={opt.name}
            type="button"
            aria-label={label}
            title={label}
            onClick={() => onChange(opt)}
            className={`
              relative flex items-center justify-center w-10 h-10 rounded-lg border border-slate-600 bg-slate-800 transition-all
              ${isActive ? 'text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'}
            `}
          >
            {isActive && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 bg-emerald-600 rounded-lg shadow-lg"
                transition={{ type: 'spring', duration: 0.5 }}
              />
            )}
            <span className={`relative z-10 block rounded-sm bg-current ${BOARD_MARK[opt.name] ?? 'w-3 h-3'}`} />
          </button>
        );
      })}
    </div>
  );
};