
import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flag, Bomb, X } from 'lucide-react';
import { CellData } from '../types';
import { ExplosionEffect } from './ExplosionEffect';

interface CellProps {
  data: CellData;
  onClick: () => void;
  onRightClick: (e: React.MouseEvent) => void;
  disabled: boolean;
  isHighlighted?: boolean;
}

const NUMBER_COLORS = [
  '',
  'text-blue-600',
  'text-green-600',
  'text-red-600',
  'text-purple-700',
  'text-red-900',
  'text-cyan-700',
  'text-black',
  'text-gray-600',
];

export const Cell: React.FC<CellProps> = React.memo(({ data, onClick, onRightClick, disabled, isHighlighted }) => {
  const { row, col, status, isMine, neighborMines, isExploded, isMisflagged } = data;
  
  // Refs for handling touch logic securely
  const timerRef = useRef<any>(null);
  const isLongPress = useRef(false);

  // Checkerboard pattern logic
  const isEven = (row + col) % 2 === 0;
  
  // Dynamic classes based on state
  let bgClass = '';
  let borderClass = '';
  let contentClass = '';
  
  if (status === 'revealed') {
    if (isMine) {
      bgClass = isExploded ? 'bg-red-500' : 'bg-red-400';
      borderClass = 'border-none';
    } else {
      // Dirt (Revealed) - Flat look
      bgClass = isEven ? 'bg-dirt-light' : 'bg-dirt-dark';
    }
  } else {
    // Hidden or Flagged (Grass) - 3D Button look
    bgClass = isEven ? 'bg-grass-light' : 'bg-grass-dark';
    
    // UI FEEDBACK: If highlighted, simulate the "pressed" state (flat, no border-b, shifted down)
    if (isHighlighted) {
        borderClass = 'border-none';
        contentClass = 'translate-y-[4px] brightness-90'; // darken slightly to look 'pressed in shadow'
    } else {
        borderClass = 'border-b-[4px] border-grass-shadow';
        contentClass = 'active:border-b-0 active:translate-y-[4px] transition-all';
    }
  }
  
  // Ensure exploded cells appear on top of neighbors for the animation
  const zIndexClass = isExploded ? 'z-50' : 'z-0';

  // --- Touch Logic for Long Press ---
  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled) return;
    isLongPress.current = false;
    timerRef.current = setTimeout(() => {
      isLongPress.current = true;
      if (navigator.vibrate) navigator.vibrate(50);
      onRightClick(e as unknown as React.MouseEvent);
    }, 200); 
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (isLongPress.current && e.cancelable) e.preventDefault();
  };

  const handleTouchMove = () => {
    if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
    }
  };

  const handleSafeClick = () => {
      if (disabled) return;
      if (isLongPress.current) return;
      onClick();
  };

  // Determine if we show flag
  const showFlag = status === 'flagged' || isMisflagged;

  return (
    <div
      className={`
        relative w-full h-full 
        ${zIndexClass} 
        select-none
        p-[1px]
      `}
      onClick={handleSafeClick}
      onContextMenu={disabled ? undefined : onRightClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
    >
        {/* Main Cell Body */}
        <div className={`
            w-full h-full flex items-center justify-center
            text-lg font-bold cursor-pointer rounded-md
            ${bgClass} ${borderClass} ${contentClass}
        `}>
          <AnimatePresence>
            {isExploded && <ExplosionEffect />}
          </AnimatePresence>

          {/* Render Number (Standard Revealed Safe Cell) */}
          {status === 'revealed' && !isMine && !isMisflagged && neighborMines > 0 && (
            <motion.span
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`${NUMBER_COLORS[neighborMines]} drop-shadow-sm`}
            >
              {neighborMines}
            </motion.span>
          )}

          {/* Render Mine (Revealed Mine) */}
          {status === 'revealed' && isMine && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15 }}
            >
              <Bomb size={20} className={isExploded ? "text-white fill-current" : "text-gray-800 fill-current"} />
            </motion.div>
          )}

          {/* Render Flag (Normal Flagged State) */}
          <AnimatePresence>
            {showFlag && (
              <motion.div
                initial={{ scale: 0, y: -10 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0, opacity: 0 }}
                className="text-red-600 drop-shadow-md relative -top-[2px]"
              >
                <Flag size={20} fill="#dc2626" strokeWidth={2} className="text-red-700" />
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Render X for Misflagged (Incorrect Flag) */}
          {isMisflagged && (
             <motion.div 
                initial={{ opacity: 0, scale: 2 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute inset-0 flex items-center justify-center"
             >
               <X className="text-red-900 drop-shadow-md" size={28} strokeWidth={3} />
             </motion.div>
          )}
      </div>
    </div>
  );
});
