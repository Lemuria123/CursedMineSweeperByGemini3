
import React from 'react';
import { motion } from 'framer-motion';

export const PrayingHands: React.FC<{ size?: number, isActive?: boolean }> = ({ size, isActive = false }) => {
  // Use explicit size if provided, otherwise fill parent
  const style = size ? { width: size, height: size } : undefined;
  const containerClass = size ? "relative flex items-center justify-center" : "relative flex items-center justify-center w-full h-full";

  return (
    <div className={containerClass} style={style}>
      {/* Active State: Rotating Holy Rays Background */}
      <motion.svg
        viewBox="0 0 24 24"
        className={`absolute inset-0 w-full h-full ${isActive ? 'text-yellow-200' : 'hidden'} opacity-60`}
        animate={{ rotate: 360, scale: [1, 1.1, 1] }}
        transition={{ rotate: { duration: 10, repeat: Infinity, ease: "linear" }, scale: { duration: 2, repeat: Infinity } }}
      >
        <path fill="currentColor" d="M12 1L13 6H11L12 1Z" />
        <path fill="currentColor" d="M12 23L11 18H13L12 23Z" />
        <path fill="currentColor" d="M1 12L6 11V13L1 12Z" />
        <path fill="currentColor" d="M23 12L18 13V11L23 12Z" />
        <path fill="currentColor" d="M4.22 4.22L8 8L7 9L3 5L4.22 4.22Z" />
        <path fill="currentColor" d="M19.78 19.78L16 16L17 15L21 19L19.78 19.78Z" />
        <path fill="currentColor" d="M4.22 19.78L8 16L9 17L5 21L4.22 19.78Z" />
        <path fill="currentColor" d="M19.78 4.22L16 8L15 7L19 3L19.78 4.22Z" />
      </motion.svg>

      {/* Main Icon - Responsive Line Art Style */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`relative z-10 w-full h-full transition-colors duration-300 ${isActive ? 'text-amber-100' : 'text-slate-400'}`}
      >
        {/* Static Rays (Top) */}
        <path d="M12 2v3" />
        <path d="M16.5 3.5l-1 2" />
        <path d="M7.5 3.5l1 2" />
        <path d="M20 6.5l-2 1" />
        <path d="M4 6.5l2 1" />

        {/* Sleeves (Cuffs) */}
        <path d="M5 18l3 3 3.5-3.5-3-3z" />
        <path d="M19 18l-3 3-3.5-3.5 3-3z" />

        {/* Hands */}
        <path d="M8.5 14.5c0-4 1.5-6 3.5-9" />
        <path d="M15.5 14.5c0-4-1.5-6-3.5-9" />
        <path d="M12 5.5v10" />
        
        {/* Thumbs */}
        <path d="M12 13s-1 0-1 2" /> 
        <path d="M12 13s1 0 1 2" />
      </svg>
      
      {/* Inner Glow Core for Active State */}
      {isActive && (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute inset-0 bg-yellow-400 blur-xl rounded-full z-0 mix-blend-overlay pointer-events-none"
        />
      )}
    </div>
  );
};
