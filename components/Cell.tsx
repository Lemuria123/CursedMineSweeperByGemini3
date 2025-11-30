import React from 'react';
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

  // Checkerboard pattern logic
  const isEven = (row + col) % 2 === 0;
  
  // Dynamic classes based on state
  let bgClass = '';
  
  if (status === 'revealed') {
    if (isMine) {
      bgClass = isExploded ? 'bg-red-500' : 'bg-red-200';
    } else {
      bgClass = isEven ? 'bg-[#e5c29f]' : 'bg-[#d7b594]'; // Dirt colors
    }
  } else {
    // Hidden (Grass)
    bgClass = isEven ? 'bg-grass-medium hover:bg-emerald-300' : 'bg-grass-dark hover:bg-emerald-500';
  }

  // Shadow for 3D effect on hidden cells
  const shadowClass = status === 'hidden' || status === 'flagged' 
    ? 'shadow-[inset_0_-4px_0_rgba(0,0,0,0.15)] active:shadow-none active:translate-y-[2px]' 
    : '';

  // Ensure exploded cells appear on top of neighbors for the animation
  const zIndexClass = isExploded ? 'z-50' : 'z-0';

  return (
    <div
      className={`
        relative w-full h-full flex items-center justify-center
        text-lg font-bold cursor-pointer select-none transition-transform duration-75
        ${bgClass} ${shadowClass} ${zIndexClass} rounded-sm
      `}
      onClick={disabled ? undefined : onClick}
      onContextMenu={disabled ? undefined : onRightClick}
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <AnimatePresence>
        {isExploded && <ExplosionEffect />}
      </AnimatePresence>

      {/* Render Content */}
      {status === 'revealed' && !isMine && neighborMines > 0 && (
        <motion.span
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={NUMBER_COLORS[neighborMines]}
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
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0, opacity: 0 }}
            className="text-red-600 drop-shadow-md"
          >
            <Flag size={20} fill="currentColor" />
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Incorrect Flag Reveal (only when game over and cell is revealed but was safe) */}
      {status === 'revealed' && !isMine && data.isMine === false && data.status === 'flagged' && (
         <div className="absolute inset-0 flex items-center justify-center opacity-50">
           <X className="text-red-900" size={24} />
         </div>
      )}
    </div>
  );
});
