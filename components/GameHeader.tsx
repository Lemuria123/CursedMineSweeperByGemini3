
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Bomb } from 'lucide-react';
import { GameStatus } from '../types';
import { motion } from 'framer-motion';
import { PrayingHands } from './PrayingHands';

interface GameHeaderProps {
  minesLeft: number;
  status: GameStatus;
  prayersUsed: number;
  isPraying: boolean;
  onReset: () => void;
  onTogglePrayer: () => void;
  /** 顶栏上方内容（游戏名、记录、设置），和下面的雷数 / 重置 / 祈祷排在一起，不再套卡片 */
  children?: React.ReactNode;
}

const FaceIcon: React.FC<{ status: GameStatus }> = ({ status }) => {
  // 胜负和待机三种脸共用同一套皮肤变量（见 index.css 的 .skin-face）。
  // 这里只留结构，填色和线条颜色不写死。
  // Won: Radiant Smile (Curse Lifted)
  if (status === 'won') {
    return (
      <div className="relative w-full h-full flex items-center justify-center">
         <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="face-won w-full h-full"
         >
           <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
             <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="2"/>
             <path d="M7 9C7 9 8.5 7.5 10 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
             <path d="M14 9C14 9 15.5 7.5 17 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
             <path d="M6.5 13.5C8 16.5 11 17.5 12 17.5C13 17.5 16 16.5 17.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
             <path d="M19 5L20 7L21 5L19 3L19 5Z" className="face-spark" />
           </svg>
         </motion.div>
      </div>
    );
  }

  // Lost: Dead, Slack Jaw
  if (status === 'lost') {
    return (
      <div className="relative w-full h-full flex items-center justify-center">
         <motion.div
            initial={{ rotate: 0 }}
            animate={{ rotate: [0, -5, 5, 0] }}
            transition={{ duration: 0.4 }}
            className="face-lost w-full h-full"
         >
           <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
             <circle cx="12" cy="12" r="10" strokeWidth="2" className="face-lost-disc"/>
             <path d="M6 8L9 11M9 8L6 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
             <path d="M15 8L18 11M18 8L15 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
             <path d="M7 16C9 15 11 17 12 17C14 17 16 15.5 17 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
             <path d="M17 16L17 19" className="face-blood" strokeWidth="2" strokeLinecap="round" />
             <path d="M16 19.5L16 21" className="face-blood" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
             <path d="M15 5L16 6L17 5" className="face-blood" strokeWidth="1" opacity="0.5" />
           </svg>
         </motion.div>
      </div>
    );
  }

  // Idle / Playing: Cursed, Stressed
  return (
    <div className="relative w-full h-full flex items-center justify-center">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
             <circle cx="12" cy="12" r="10" strokeWidth="2" className="face-ring"/>
             <circle cx="8" cy="10" r="1.5" strokeWidth="1.5" className="face-eye"/>
             <circle cx="16" cy="10" r="1.5" strokeWidth="1.5" className="face-eye"/>
             <path d="M6 12C7 13 8.5 13 9.5 12" strokeWidth="1" opacity="0.5" className="face-bag"/>
             <path d="M14.5 12C15.5 13 17 13 18 12" strokeWidth="1" opacity="0.5" className="face-bag"/>
             <path d="M9 16H15" strokeWidth="2" strokeLinecap="round" className="face-mouth"/>
             <motion.g
                animate={{ y: [0, 4], opacity: [1, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeIn" }}
             >
                <path d="M18 5C18 5 19 7 18 8C17.5 8.5 17 7 17 7" className="face-sweat" />
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
  onTogglePrayer,
  children
}) => {
  const { t } = useTranslation();

  return (
    // 页头不再包卡片：标题和入口在上，雷数 / 重置 / 祈祷直接摆在页面底色上
    <div className="skin-hud relative flex flex-col w-full max-w-[392px] sm:max-w-[432px] md:max-w-[512px] mx-auto px-1 mb-3">
      {children}

      {/* 状态栏左右互为镜像：图标贴外沿，数字朝向中间，两边槽一样宽，笑脸留在正中 */}
      <div className="relative flex items-center justify-between w-full h-16">
      {/* 左侧雷数。图标槽和右侧祈祷图标同为 40px，数字槽同宽，空位朝向中间 */}
      <div className="flex-1 flex justify-start">
          <div className="skin-mine flex items-center gap-2">
            <div className="skin-mine-icon flex items-center justify-center w-10 h-10 text-red-500">
                <Bomb size={40} fill="currentColor" />
            </div>
            <span className="skin-mine-count w-16 text-left text-2xl font-mono text-red-400 font-bold tracking-widest">
              {minesLeft}
            </span>
          </div>
      </div>

      {/* 2. CENTER: The Face (The Soul)
          外框和笑脸绘制区整体再缩小 15%，两者的留白比例不变。
          外框 3.2rem→2.72rem，sm 下 4rem→3.4rem；
          绘制区 2.5rem→2.125rem，sm 下 3.5rem→2.975rem。 */}
      <div className="flex-none -mt-1 z-10">
          <button
            onClick={onReset}
            className="skin-face w-[2.72rem] h-[2.72rem] sm:w-[3.4rem] sm:h-[3.4rem] flex items-center justify-center bg-gradient-to-b from-slate-700 to-slate-800 rounded-2xl shadow-[0_8px_0_rgb(30,41,59)] active:shadow-none active:translate-y-[8px] active:bg-slate-800 transition-all border border-slate-600 hover:brightness-110 group"
            title={t('game.resetGame')}
          >
            <div className="w-[2.125rem] h-[2.125rem] sm:w-[2.975rem] sm:h-[2.975rem] transition-transform group-hover:scale-105">
                <FaceIcon status={status} />
            </div>
          </button>
      </div>

      {/* 右侧祈祷。和左侧相反：数字在内、图标贴右沿 */}
      <div className="flex-1 flex justify-end">
          <button
            onClick={onTogglePrayer}
            disabled={status !== 'playing' && status !== 'idle'}
            className="skin-prayer flex items-center gap-2 justify-end group disabled:opacity-40"
            title={t('game.togglePrayer')}
          >
            {/* 数字槽和左侧雷数同宽，字靠右，这样个位数也会贴着图标 */}
            <span className={`skin-prayer-count w-16 text-right text-2xl font-mono font-bold tracking-widest ${
              isPraying ? 'text-amber-300' : 'text-amber-400/90 group-hover:text-amber-300'
            }`}>
              {prayersUsed}
            </span>

            {/* 祈祷图标：40×40，贴在右沿，和左侧炸弹槽对齐 */}
            <div className="shrink-0 w-10 h-10">
              <PrayingHands isActive={isPraying} />
            </div>
          </button>
      </div>
      </div>
    </div>
  );
};
