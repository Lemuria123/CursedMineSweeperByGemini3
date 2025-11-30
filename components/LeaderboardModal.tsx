
import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Book, Lock, Sparkles, Grid3X3, Bomb, LayoutGrid, List } from 'lucide-react';
import { CursedReward, Difficulty } from '../types';
import { getAllRewards } from '../utils/storage';

interface GrimoireModalProps {
  isOpen: boolean;
  onClose: () => void;
  difficulties: Difficulty[]; 
}

// Range for custom games
const MIN_ROWS = 8, MAX_ROWS = 24;
const MIN_COLS = 8, MAX_COLS = 30;

const parseId = (id: string) => {
  const [rows, cols, mines] = id.split('-').map(Number);
  return { rows, cols, mines };
};

// Visual component for a reward card (Gallery View)
const ArtifactCard: React.FC<{ 
    reward?: CursedReward;
    fallbackConfig?: Difficulty; 
    onClick?: () => void 
}> = ({ reward, fallbackConfig, onClick }) => {
  const isLocked = !reward;
  const name = reward ? reward.difficultyName : fallbackConfig?.name;
  
  let specs = { rows: 0, cols: 0, mines: 0 };
  if (reward) {
      specs = parseId(reward.id);
  } else if (fallbackConfig) {
      specs = { rows: fallbackConfig.rows, cols: fallbackConfig.cols, mines: fallbackConfig.mines };
  }

  return (
    <motion.div
        whileHover={!isLocked ? { scale: 1.05 } : {}}
        onClick={!isLocked ? onClick : undefined}
        className={`
            relative aspect-[3/4] rounded-xl border-2 overflow-hidden flex flex-col transition-all group
            ${isLocked 
                ? 'bg-slate-900 border-slate-700 opacity-60 grayscale' 
                : 'bg-slate-800 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)] cursor-pointer'}
        `}
    >
        {isLocked ? (
            <div className="flex flex-col items-center justify-center h-full p-4 text-center">
                <div className="mb-3 p-3 rounded-full bg-slate-800 border border-slate-600">
                     <Lock className="text-slate-500" size={24} />
                </div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{name}</span>
                <div className="flex items-center gap-2 text-[10px] text-slate-600 font-mono bg-slate-800/50 px-2 py-1 rounded">
                     <span className="flex items-center gap-1"><Grid3X3 size={10} /> {specs.rows}x{specs.cols}</span>
                     <span className="flex items-center gap-1"><Bomb size={10} /> {specs.mines}</span>
                </div>
            </div>
        ) : (
            <>
                <div className="w-full h-full relative">
                    {reward?.type === 'image' ? (
                         <img src={reward.content} alt={reward.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-80 group-hover:opacity-100" />
                    ) : (
                        <div 
                            className="w-full h-full flex items-center justify-center"
                            style={{ backgroundColor: `hsla(${reward?.hue || 0}, 30%, 10%, 1)` }}
                        >
                            <Sparkles color={`hsl(${reward?.hue || 0}, 70%, 70%)`} size={32} />
                        </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                        <h3 className="text-amber-100 font-bold text-sm mb-1 leading-tight line-clamp-1 group-hover:text-amber-400 transition-colors">
                            {reward?.title}
                        </h3>
                        <div className="flex justify-between items-end border-t border-white/10 pt-2 mt-1">
                            <div>
                                <div className="text-[10px] text-amber-500 font-bold uppercase mb-0.5">{name}</div>
                                <div className="text-[9px] text-slate-400 font-mono flex gap-2">
                                    <span>{specs.rows}x{specs.cols}</span>
                                    <span>{specs.mines} Mines</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="absolute inset-0 border-2 border-amber-500/0 group-hover:border-amber-500/50 rounded-xl pointer-events-none transition-all duration-300" />
            </>
        )}
    </motion.div>
  );
};

// Advanced Matrix View with Drag-to-Pan and Sticky Headers
const MatrixView: React.FC<{ rewards: CursedReward[], onSelect: (r: CursedReward) => void }> = ({ rewards, onSelect }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const isDown = useRef(false);
    const startPos = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
    const isDragging = useRef(false);

    const rowsCount = MAX_ROWS - MIN_ROWS + 1;
    const colsCount = MAX_COLS - MIN_COLS + 1;

    const getRewardForCell = (r: number, c: number) => {
        const matching = rewards.filter(rew => {
            const specs = parseId(rew.id);
            return specs.rows === r && specs.cols === c;
        });
        if (matching.length > 0) {
            return matching.sort((a,b) => parseId(b.id).mines - parseId(a.id).mines)[0];
        }
        return null;
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!scrollRef.current) return;
        isDown.current = true;
        isDragging.current = false;
        startPos.current = {
            x: e.clientX,
            y: e.clientY,
            scrollLeft: scrollRef.current.scrollLeft,
            scrollTop: scrollRef.current.scrollTop
        };
        
        e.preventDefault();
        // IMPORTANT: Capture on currentTarget (the container), not target (the cell)
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDown.current || !scrollRef.current) return;
        e.preventDefault();
        
        const dx = e.clientX - startPos.current.x;
        const dy = e.clientY - startPos.current.y;

        // Threshold to differentiate click vs drag
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            isDragging.current = true;
        }

        if (isDragging.current) {
            scrollRef.current.scrollLeft = startPos.current.scrollLeft - dx;
            scrollRef.current.scrollTop = startPos.current.scrollTop - dy;
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        isDown.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    const handleCellClick = (reward: CursedReward | null) => {
        if (!isDragging.current && reward) {
            onSelect(reward);
        }
    };

    return (
        <div className="w-full h-full relative rounded-lg border border-slate-700 bg-slate-900/50 overflow-hidden" style={{ touchAction: 'none' }}>
            <div 
                ref={scrollRef}
                className="w-full h-full overflow-auto no-scrollbar cursor-grab active:cursor-grabbing select-none overscroll-contain"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={handlePointerUp}
                style={{ touchAction: 'none' }}
            >
                <div 
                    className="grid bg-slate-900"
                    style={{
                        gridTemplateColumns: `40px repeat(${colsCount}, 32px)`,
                        gridTemplateRows: `40px repeat(${rowsCount}, 32px)`,
                        width: 'max-content',
                        height: 'max-content'
                    }}
                >
                    {/* 1. Sticky Corner (Top-Left) */}
                    <div className="sticky top-0 left-0 z-30 bg-slate-800 border-b border-r border-slate-600 flex items-center justify-center shadow-lg">
                        <Grid3X3 size={16} className="text-amber-500" />
                    </div>

                    {/* 2. Sticky Column Headers (Top Row) */}
                    {Array.from({ length: colsCount }).map((_, i) => (
                        <div 
                            key={`col-header-${i}`} 
                            className="sticky top-0 z-20 bg-slate-800 border-b border-slate-700 flex items-end justify-center pb-2 shadow-sm"
                        >
                            <span className="text-[10px] text-slate-400 font-mono -rotate-45 origin-bottom translate-y-[-4px] select-none">
                                {MIN_COLS + i}
                            </span>
                        </div>
                    ))}

                    {/* 3. Rows (Row Header + Cells) */}
                    {Array.from({ length: rowsCount }).map((_, rIdx) => {
                        const rowNum = MIN_ROWS + rIdx;
                        return (
                            <React.Fragment key={`row-${rowNum}`}>
                                {/* Sticky Row Header (Left Column) */}
                                <div className="sticky left-0 z-20 bg-slate-800 border-r border-slate-700 flex items-center justify-end pr-2 shadow-sm">
                                    <span className="text-[10px] text-slate-400 font-mono select-none">
                                        {rowNum}
                                    </span>
                                </div>

                                {/* Data Cells */}
                                {Array.from({ length: colsCount }).map((_, cIdx) => {
                                    const colNum = MIN_COLS + cIdx;
                                    const reward = getRewardForCell(rowNum, colNum);
                                    const isUnlocked = !!reward;
                                    
                                    return (
                                        <div 
                                            key={`cell-${rowNum}-${colNum}`}
                                            className="flex items-center justify-center p-[2px] bg-slate-900"
                                        >
                                            <div
                                                onClick={() => handleCellClick(reward)}
                                                className={`
                                                    w-full h-full rounded-sm transition-all duration-200
                                                    ${isUnlocked 
                                                        ? 'bg-amber-500 border border-amber-400 shadow-[0_0_5px_rgba(245,158,11,0.5)] cursor-pointer hover:scale-110 hover:z-10 relative' 
                                                        : 'bg-slate-800/30 border border-slate-700/30'}
                                                `}
                                            >
                                                {isUnlocked && (
                                                    <div className="w-full h-full bg-white opacity-0 hover:opacity-20 animate-pulse rounded-sm" />
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
            {/* Overlay Hint */}
            <div className="absolute bottom-4 right-4 pointer-events-none text-[10px] text-slate-500 font-mono bg-slate-900/80 px-2 py-1 rounded border border-slate-700 z-40">
                DRAG TO PAN
            </div>
        </div>
    );
};

export const GrimoireModal: React.FC<GrimoireModalProps> = ({
  isOpen,
  onClose,
  difficulties
}) => {
  const [rewards, setRewards] = useState<CursedReward[]>([]);
  const [selectedReward, setSelectedReward] = useState<CursedReward | null>(null);
  const [viewMode, setViewMode] = useState<'gallery' | 'matrix'>('gallery');

  useEffect(() => {
    if (isOpen) {
        setRewards(getAllRewards());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Prepare data for Gallery View
  const standardConfigs = difficulties.map(d => ({ config: d, id: `${d.rows}-${d.cols}-${d.mines}` }));
  const standardSlots = standardConfigs.map(item => {
      const found = rewards.find(r => r.id === item.id);
      return { type: 'standard', config: item.config, reward: found };
  });
  const standardIds = standardConfigs.map(s => s.id);
  const customRewards = rewards.filter(r => !standardIds.includes(r.id));
  const allSlots = [
      ...standardSlots.map(s => ({ ...s, isCustom: false })),
      ...customRewards.map(r => ({ type: 'custom', config: undefined, reward: r, isCustom: true }))
  ];

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
      <AnimatePresence>
          {selectedReward ? (
               <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="relative bg-slate-900 border border-amber-900/50 rounded-lg max-w-sm w-full shadow-2xl flex flex-col overflow-hidden"
               >
                   <button onClick={() => setSelectedReward(null)} className="absolute top-4 right-4 text-white bg-black/50 p-2 rounded-full hover:bg-black/80 z-20 backdrop-blur-sm transition-all">
                       <X size={20} />
                   </button>
                   
                   {/* Large Image Preview */}
                   <div className="w-full aspect-square bg-black relative group cursor-move">
                       {selectedReward.type === 'image' ? (
                           <img src={selectedReward.content} className="w-full h-full object-cover" alt="Artifact" />
                       ) : (
                           <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: `hsl(${selectedReward.hue}, 30%, 10%)` }}>
                               <Sparkles size={64} color={`hsl(${selectedReward.hue}, 70%, 70%)`} />
                           </div>
                       )}
                       <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent opacity-80" />
                   </div>

                   <div className="p-6 -mt-16 relative z-10">
                        <motion.div 
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.1 }}
                        >
                            <h2 className="text-2xl font-black text-white mb-1 drop-shadow-lg leading-none">{selectedReward.title}</h2>
                            <div className="flex items-center gap-3 text-amber-500 font-mono text-xs mb-6 uppercase tracking-wider">
                                <span>{selectedReward.difficultyName}</span>
                                <span className="w-1 h-1 rounded-full bg-amber-500/50" />
                                <span>{new Date(selectedReward.date).toLocaleDateString()}</span>
                            </div>

                            <div className="bg-slate-800/50 border border-amber-500/10 rounded-xl p-4 backdrop-blur-md">
                                <p className="text-slate-300 italic font-serif leading-relaxed text-sm">
                                    "This artifact is evidence of a reality where logic dictates survival. You have stared into the numbers, and they blinked."
                                </p>
                            </div>
                        </motion.div>
                   </div>
               </motion.div>
          ) : (
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 20, opacity: 0 }}
                // UPDATED: Fixed height h-[85vh] instead of max-h to force flex container to have explicit height
                className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-3xl w-full shadow-2xl h-[85vh] flex flex-col"
            >
                <div className="flex-none flex items-center justify-between mb-6">
                     <div className="flex items-center gap-3">
                        <div className="p-3 rounded-full bg-amber-900/20 text-amber-500 border border-amber-900/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                            <Book size={24} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white tracking-tight">Grimoire</h2>
                            <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Cursed Artifact Collection</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {/* View Toggle */}
                        <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
                            <button 
                                onClick={() => setViewMode('gallery')}
                                className={`p-2 rounded-md transition-all ${viewMode === 'gallery' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                                title="Gallery View"
                            >
                                <List size={18} />
                            </button>
                            <button 
                                onClick={() => setViewMode('matrix')}
                                className={`p-2 rounded-md transition-all ${viewMode === 'matrix' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                                title="Matrix View"
                            >
                                <LayoutGrid size={18} />
                            </button>
                        </div>

                        <button
                            onClick={onClose}
                            className="text-slate-400 hover:text-white transition-colors bg-slate-800 p-2 rounded-lg border border-slate-700 ml-2"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Content Area - Conditionally scrollable on parent vs child */}
                <div className={`flex-1 min-h-0 ${viewMode === 'gallery' ? 'overflow-y-auto custom-scrollbar pr-1 -mr-1' : 'overflow-hidden'}`}>
                    {viewMode === 'gallery' ? (
                        <>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pb-4">
                                {allSlots.map((slot, idx) => (
                                    <ArtifactCard 
                                        key={slot.reward ? slot.reward.id : `locked-${idx}`}
                                        fallbackConfig={slot.config} 
                                        reward={slot.reward}
                                        onClick={() => slot.reward && setSelectedReward(slot.reward)}
                                    />
                                ))}
                            </div>
                            {allSlots.length === 0 && (
                                <div className="text-center py-12 text-slate-600">
                                    <p>The void is empty.</p>
                                    <p className="text-sm mt-2">Win with 0 prayers to fill it.</p>
                                </div>
                            )}
                        </>
                    ) : (
                        <MatrixView rewards={rewards} onSelect={(r) => setSelectedReward(r)} />
                    )}
                </div>

                <div className="flex-none mt-6 pt-4 border-t border-slate-800 text-center text-slate-500 text-[10px] uppercase tracking-widest font-bold">
                    Collect artifacts by achieving ACED victories
                </div>
            </motion.div>
          )}
      </AnimatePresence>
    </div>
  );
};
