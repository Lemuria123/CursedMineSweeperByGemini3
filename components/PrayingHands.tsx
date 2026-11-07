
import React from 'react';
import { motion } from 'framer-motion';

interface PrayingHandsProps {
  /** 是否处于祈祷激活态（亮度增强 + 轻微脉动） */
  isActive?: boolean;
}

/**
 * 祈祷图标：直接使用 public/pray-icon.jpg。
 * 原图是方图，金色圆标四周有一圈暗色底；外层裁成正圆并裁掉溢出，
 * 中层按圆标占比放大（1024 / 742 ≈ 1.4），让金色圆标铺满容器，暗边不再露出。
 * 激活时的呼吸缩放仍作用在图片上，相对这块已经放大的区域轻微脉动。
 */
export const PrayingHands: React.FC<PrayingHandsProps> = ({ isActive = false }) => {
  return (
    <div
      className={`w-full h-full rounded-full overflow-hidden ${
        isActive ? 'shadow-[0_0_12px_rgba(251,191,36,0.65)]' : ''
      }`}
    >
      {/* 只做视觉放大，不改变占位，溢出部分由外层圆裁掉 */}
      <div className="w-full h-full origin-center scale-[1.4]">
        <motion.img
          src="/pray-icon.jpg"
          alt=""
          aria-hidden="true"
          draggable={false}
          className={`w-full h-full object-cover select-none transition-all duration-300 ${
            isActive
              ? 'brightness-110 saturate-110'
              : 'brightness-[0.82] saturate-[0.65] opacity-90 group-hover:brightness-95 group-hover:saturate-90'
          }`}
          animate={isActive ? { scale: [1, 1.06, 1] } : { scale: 1 }}
          transition={{ duration: 2, repeat: isActive ? Infinity : 0, ease: 'easeInOut' }}
        />
      </div>
    </div>
  );
};
