
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

export const Cell: React.FC<CellProps> = React.memo(({ data, onClick, onRightClick, disabled }) => {
  const { row, col, status, isMine, neighborMines, isExploded } = data;
  
  // Refs for handling touch logic securely
  const timerRef = useRef<any>(null);
  
  // State lock: If true, it means the LAST (or current) touch interaction was a long press.
  // We reset this to false only when a NEW touch starts.
  // This ensures that no matter how late the 'click' event fires after a long press, we block it.
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
    // Hidden (Grass) - 3D Button look
    bgClass = isEven ? 'bg-grass-light' : 'bg-grass-dark';
    // 3D effect: Bottom border simulates the side of the block
    borderClass = 'border-b-[4px] border-grass-shadow';
    contentClass = 'active:border-b-0 active:translate-y-[4px] transition-all';
  }

  // Ensure exploded cells appear on top of neighbors for the animation
  const zIndexClass = isExploded ? 'z-50' : 'z-0';

  // --- Touch Logic for Long Press ---
  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled) return;
    
    // CRITICAL: A new touch has started. Reset the long-press lock.
    isLongPress.current = false;
    
    timerRef.current = setTimeout(() => {
      // Timer fired: This interaction is now officially a long press.
      isLongPress.current = true;
      
      if (navigator.vibrate) navigator.vibrate(50);
      onRightClick(e as unknown as React.MouseEvent);
    }, 300); // 300ms long press
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    // Clear timer if it hasn't fired yet (short tap)
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    
    // If it WAS a long press, we must suppress the subsequent click event from the browser
    if (isLongPress.current) {
       if (e.cancelable) e.preventDefault();
    }
  };

  const handleTouchMove = () => {
    // Cancel long press if user drags/scrolls
    if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
    }
  };

  const handleSafeClick = () => {
      if (disabled) return;
      
      // Secondary Safety Layer:
      // If e.preventDefault() failed (e.g., ghost clicks on some Android webviews),
      // we check our lock. The lock remains TRUE until the user touches the screen again.
      if (isLongPress.current) {
          return;
      }
      onClick();
  };

  return (
    <div
      className={`
        relative w-full h-full 
        ${zIndexClass} 
        select-none
        p-[1px] // Slight gap to let the dark board background show through at corners
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

          {/* Render Content */}
          {status === 'revealed' && !isMine && neighborMines > 0 && (
            <motion.span
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`${NUMBER_COLORS[neighborMines]} drop-shadow-sm`}
            >
              {neighborMines}
            </motion.span>
          )}

          {status === 'revealed' && isMine && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15 }}
            >
              <Bomb size={20} className={isExploded ? "text-white fill-current" : "text-gray-800 fill-current"} />
            </motion.div>
          )}

          <AnimatePresence>
            {status === 'flagged' && (
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
          
          {/* Incorrect Flag Reveal */}
          {status === 'revealed' && !isMine && data.isMine === false && data.status === 'flagged' && (
             <div className="absolute inset-0 flex items-center justify-center opacity-60">
               <X className="text-red-800" size={24} strokeWidth={3} />
             </div>
          )}
      </div>
    </div>
  );
});
