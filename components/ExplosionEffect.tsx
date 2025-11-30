import React from 'react';
import { motion } from 'framer-motion';

export const ExplosionEffect: React.FC = () => {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
      {/* Core Flash */}
      <motion.div
        initial={{ scale: 0, opacity: 1 }}
        animate={{ scale: [0, 2.5, 3], opacity: [1, 0.8, 0] }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="absolute w-full h-full rounded-full bg-red-500 blur-sm"
      />
      
      {/* Inner Orange Core */}
      <motion.div
        initial={{ scale: 0, opacity: 1 }}
        animate={{ scale: [0, 1.5, 2], opacity: [1, 0.5, 0] }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="absolute w-3/4 h-3/4 rounded-full bg-orange-400"
      />

      {/* Particles */}
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ x: 0, y: 0, scale: 0.5, opacity: 1 }}
          animate={{
            x: Math.cos(i * 60 * (Math.PI / 180)) * 40,
            y: Math.sin(i * 60 * (Math.PI / 180)) * 40,
            scale: 0,
            opacity: 0
          }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="absolute w-2 h-2 rounded-full bg-yellow-300"
        />
      ))}
    </div>
  );
};
