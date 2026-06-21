
import React from 'react';
import { motion } from 'framer-motion';

interface PrayingHandsProps {
  /** 是否处于祈祷激活态（亮度增强 + 轻微脉动） */
  isActive?: boolean;
}

/**
 * 祈祷图标：直接使用 public/pray-icon.jpg 整图。
 * 图片本身已包含合十手势、放射光晕与圆形构图，小尺寸下比 SVG 更易辨认。
 */
export const PrayingHands: React.FC<PrayingHandsProps> = ({ isActive = false }) => {
  return (
    <motion.img
      src="/pray-icon.jpg"
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`w-full h-full object-contain rounded-full select-none transition-all duration-300 ${
        isActive
          ? 'brightness-110 saturate-110 shadow-[0_0_12px_rgba(251,191,36,0.65)]'
          : 'brightness-[0.82] saturate-[0.65] opacity-90 group-hover:brightness-95 group-hover:saturate-90'
      }`}
      animate={isActive ? { scale: [1, 1.06, 1] } : { scale: 1 }}
      transition={{ duration: 2, repeat: isActive ? Infinity : 0, ease: 'easeInOut' }}
    />
  );
};
