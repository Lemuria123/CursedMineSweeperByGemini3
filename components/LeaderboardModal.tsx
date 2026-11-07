import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X, Grid3X3, LayoutGrid, List, Trophy, ChevronDown, ChevronUp } from 'lucide-react';
import { Difficulty } from '../types';
import { getMyRecords, getLeaderboard } from '../utils/api';
import { ensureAccount } from '../utils/auth';

interface GrimoireModalProps {
  isOpen: boolean;
  onClose: () => void;
  difficulties: Difficulty[];
}

const MIN_ROWS = 8, MAX_ROWS = 25;
const MIN_COLS = 8, MAX_COLS = 25;

/** 矩阵角标列/行宽度（px）—— 比单元格略宽以容纳行号/列号 */
const MATRIX_HEADER_SIZE = 36;
/** 矩阵单元格边长（px） */
const MATRIX_CELL_SIZE = 32;
/** 弹窗内边距 p-6 左右合计（px） */
const MODAL_PADDING_X = 48;
/** 弹窗边框 border 左右合计（px） */
const MODAL_BORDER_X = 2;
/** 遮罩层 p-4 左右合计（px） */
const OUTER_PADDING_X = 32;

/**
 * 根据矩阵固有尺寸与当前视口，计算法典主弹窗总宽度（px）。
 * 列表/矩阵切换共用此宽度，避免切换视图时弹窗跳动。
 */
const computeGrimoireModalWidth = (): number => {
  const colsCount = MAX_COLS - MIN_COLS + 1;
  const matrixContentWidth = MATRIX_HEADER_SIZE + colsCount * MATRIX_CELL_SIZE;

  if (typeof window === 'undefined') {
    return matrixContentWidth + MODAL_PADDING_X + MODAL_BORDER_X;
  }

  const viewportCap =
    window.innerWidth * 0.95 - OUTER_PADDING_X - MODAL_PADDING_X - MODAL_BORDER_X;
  const contentWidth = Math.min(matrixContentWidth, viewportCap);
  return contentWidth + MODAL_PADDING_X + MODAL_BORDER_X;
};

// 矩阵棋盘排行榜浮层：点击任意棋盘尺寸时弹出
const RecipeBoardLeaderboard: React.FC<{
  rows: number;
  cols: number;
  leaderboard: { rows: number; cols: number; entries: any[] }[];
  myRecords: any[];
  onClose: () => void;
  formatTime: (ms: number) => string;
}> = ({ rows, cols, leaderboard, myRecords, onClose, formatTime }) => {
  const { t } = useTranslation();
  const lbData = leaderboard.find(lb => lb.rows === rows && lb.cols === cols);
  const myRecord = myRecords.find((r: any) => r.rows === rows && r.cols === cols);
  const entries = lbData ? lbData.entries.slice(0, 20) : [];

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="bg-slate-900 border border-slate-600 rounded-xl p-5 max-w-md w-full max-h-[70vh] flex flex-col shadow-2xl"
      >
        <div className="flex-none flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-amber-400 flex items-center gap-2">
            <Trophy size={16} /> {rows}×{cols}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white bg-slate-800 p-1.5 rounded-lg"><X size={16} /></button>
        </div>

        <div className="flex-none flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2.5 mb-3">
          {myRecord ? (
            <>
              <span className="text-white font-mono text-sm">{t('grimoire.yourBest')}</span>
              <span className="text-amber-400 font-bold font-mono text-sm">{formatTime(myRecord.time_ms)}</span>
            </>
          ) : (
            <span className="text-slate-500 text-sm">{t('grimoire.noRecord')}</span>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
          {entries.length > 0 ? (
            <div className="space-y-1">
              {entries.map((e: any) => (
                <div key={e.rank} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-3 py-2 text-sm">
                  <div className="flex items-center gap-3">
                    <span className={`w-6 text-center font-bold ${e.rank === 1 ? 'text-amber-400' : e.rank <= 3 ? 'text-slate-300' : 'text-slate-500'}`}>
                      {e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : `#${e.rank}`}
                    </span>
                    <span className="text-white">{e.nickname}</span>
                  </div>
                  <span className="text-amber-400 font-mono text-xs">{formatTime(e.time_ms)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-600 text-xs text-center py-4">{t('grimoire.noLeaderboard')}</p>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// 记录矩阵：每个格子显示该尺寸的个人排名，点击后看排行榜
const MatrixView: React.FC<{
  recordsRanks: Record<string, number>;
  onCellClick: (rows: number, cols: number) => void;
}> = ({ recordsRanks, onCellClick }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDown = useRef(false);
  const startPos = useRef({ x: 0, y: 0, sl: 0, st: 0 });
  const isDragging = useRef(false);
  const rowsCount = MAX_ROWS - MIN_ROWS + 1;
  const colsCount = MAX_COLS - MIN_COLS + 1;

  return (
    <div className="w-full h-full relative rounded-lg bg-slate-900/50 overflow-hidden" style={{ touchAction: 'none' }}>
      <div ref={scrollRef} className="w-full h-full overflow-auto no-scrollbar cursor-grab active:cursor-grabbing select-none overscroll-contain"
        onPointerDown={e => { if (!scrollRef.current) return; isDown.current = true; isDragging.current = false; startPos.current = { x: e.clientX, y: e.clientY, sl: scrollRef.current.scrollLeft, st: scrollRef.current.scrollTop }; if (e.pointerType !== 'mouse') { e.currentTarget.setPointerCapture(e.pointerId); } }}
        onPointerMove={e => { if (!isDown.current || !scrollRef.current) return; const dx = e.clientX - startPos.current.x, dy = e.clientY - startPos.current.y; if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDragging.current = true; if (isDragging.current) { scrollRef.current.scrollLeft = startPos.current.sl - dx; scrollRef.current.scrollTop = startPos.current.st - dy; } }}
        onPointerUp={e => { isDown.current = false; if (e.pointerType !== 'mouse') { e.currentTarget.releasePointerCapture(e.pointerId); } }}>
        <div className="grid bg-slate-900" style={{ gridTemplateColumns: `${MATRIX_HEADER_SIZE}px repeat(${colsCount}, ${MATRIX_CELL_SIZE}px)`, gridTemplateRows: `${MATRIX_HEADER_SIZE}px repeat(${rowsCount}, ${MATRIX_CELL_SIZE}px)`, width: 'max-content', height: 'max-content' }}>
          <div className="sticky top-0 left-0 z-30 bg-slate-800 border-b border-r border-slate-600 flex items-center justify-center shadow-lg"><Grid3X3 size={16} className="text-amber-500" /></div>
          {Array.from({ length: colsCount }).map((_, i) => <div key={`ch-${i}`} className="sticky top-0 z-20 bg-slate-800 border-b border-slate-700 flex items-end justify-center pb-2 shadow-sm"><span className="text-[10px] text-slate-400 font-mono -rotate-45 origin-bottom translate-y-[-4px] select-none">{MIN_COLS + i}</span></div>)}
          {Array.from({ length: rowsCount }).map((_, ri) => {
            const rn = MIN_ROWS + ri;
            return <React.Fragment key={`r-${rn}`}>
              <div className="sticky left-0 z-20 bg-slate-800 border-r border-slate-700 flex items-center justify-end pr-2 shadow-sm"><span className="text-[10px] text-slate-400 font-mono select-none">{rn}</span></div>
              {Array.from({ length: colsCount }).map((_, ci) => {
                const cn = MIN_COLS + ci;
                const rank = recordsRanks[`${rn}-${cn}`] || 0;
                const getRankBadge = () => {
                  if (rank === 0) return null;
                  if (rank === 1) return <span className="text-[18px] leading-none">🥇</span>;
                  if (rank === 2) return <span className="text-[18px] leading-none">🥈</span>;
                  if (rank === 3) return <span className="text-[18px] leading-none">🥉</span>;
                  if (rank >= 4 && rank <= 99) return <span className="text-[10px] font-mono font-bold text-amber-300 leading-none">#{rank}</span>;
                  return <span className="text-[7px] font-mono font-bold text-red-400 leading-none">100+</span>;
                };
                const badge = getRankBadge();
                return <div key={`c-${rn}-${cn}`} className="flex items-center justify-center p-[2px] bg-slate-900">
                  <motion.div
                    onClick={() => { if (!isDragging.current) onCellClick(rn, cn); }}
                    className={`w-full h-full rounded-sm transition-all duration-200 flex items-center justify-center overflow-hidden ${
                      rank > 0 ? 'bg-amber-900/40 border border-amber-700/50 cursor-pointer hover:scale-110' : 'bg-slate-800/30 border border-slate-700/30 cursor-pointer'
                    }`}>
                    {badge}
                  </motion.div>
                </div>;
              })}
            </React.Fragment>;
          })}
        </div>
      </div>
    </div>
  );
};

// 法典弹窗现在只保留成绩：预设难度的个人最佳、排行榜，以及全尺寸矩阵。
export const GrimoireModal: React.FC<GrimoireModalProps> = ({ isOpen, onClose, difficulties }) => {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<'gallery' | 'matrix'>('gallery');
  const [modalWidthPx, setModalWidthPx] = useState(computeGrimoireModalWidth);

  const [myRecords, setMyRecords] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<{ rows: number; cols: number; entries: any[] }[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [serverAccountId, setServerAccountId] = useState<string | null>(null);

  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const INITIAL_VISIBLE = 10;
  const LOAD_MORE_COUNT = 10;
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const loadingMoreRef = useRef(false);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const [selectedBoard, setSelectedBoard] = useState<{ rows: number; cols: number } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const updateWidth = () => setModalWidthPx(computeGrimoireModalWidth());
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [isOpen]);

  const fetchRecords = async () => {
    setRecordsLoading(true);
    try {
      const { accountId } = await ensureAccount();
      setServerAccountId(accountId);
      const records = await getMyRecords(accountId);
      setMyRecords(records);

      const boardSet = new Set<string>();
      for (const diff of difficulties) {
        boardSet.add(`${diff.rows}-${diff.cols}`);
      }
      for (const r of records) {
        boardSet.add(`${r.rows}-${r.cols}`);
      }

      const lbData: { rows: number; cols: number; entries: any[] }[] = [];
      for (const key of boardSet) {
        const [rows, cols] = key.split('-').map(Number);
        try {
          const entries = await getLeaderboard(rows, cols);
          lbData.push({ rows, cols, entries });
        } catch { /* 单个尺寸失败不挡住其余成绩 */ }
      }
      setLeaderboard(lbData);
    } catch { /* 离线时保留空列表 */ }
    finally {
      setRecordsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setSelectedBoard(null);
    setExpandedSections(new Set(difficulties.map(d => `${d.rows}-${d.cols}`)));
    setVisibleCounts({});
    fetchRecords();
  }, [isOpen]);

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleBoardCellClick = async (rows: number, cols: number) => {
    setSelectedBoard({ rows, cols });
    const exists = leaderboard.some(lb => lb.rows === rows && lb.cols === cols);
    if (!exists) {
      try {
        const entries = await getLeaderboard(rows, cols);
        setLeaderboard(prev => {
          if (prev.some(lb => lb.rows === rows && lb.cols === cols)) return prev;
          return [...prev, { rows, cols, entries }];
        });
      } catch { /* 浮层里显示暂无排行榜 */ }
    }
  };

  const handleContentScroll = useCallback(() => {
    const el = contentScrollRef.current;
    if (!el || loadingMoreRef.current) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      loadingMoreRef.current = true;
      setVisibleCounts(prev => {
        const next = { ...prev };
        let changed = false;
        for (const diff of difficulties) {
          const key = `${diff.rows}-${diff.cols}`;
          if (!expandedSections.has(key)) continue;
          const lbData = leaderboard.find(lb => lb.rows === diff.rows && lb.cols === diff.cols);
          if (!lbData) continue;
          const current = next[key] || INITIAL_VISIBLE;
          if (current < lbData.entries.length) {
            next[key] = Math.min(current + LOAD_MORE_COUNT, lbData.entries.length);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      setTimeout(() => { loadingMoreRef.current = false; }, 300);
    }
  }, [leaderboard, expandedSections, difficulties]);

  useEffect(() => {
    const el = contentScrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleContentScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleContentScroll);
  }, [handleContentScroll]);

  if (!isOpen) return null;

  const recordsRanks: Record<string, number> = {};
  if (serverAccountId) {
    for (const r of myRecords) {
      const key = `${r.rows}-${r.cols}`;
      const lb = leaderboard.find(item => item.rows === r.rows && item.cols === r.cols);
      if (lb) {
        const entry = lb.entries.find((e: any) => e.account_id === serverAccountId);
        recordsRanks[key] = entry ? entry.rank : 101;
      }
    }
  }

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm overflow-hidden">
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            style={{ width: modalWidthPx }}
            className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl max-h-[calc(100vh-2rem)] h-[85vh] flex flex-col overflow-hidden max-w-[95vw] shrink-0">
            <div className="flex-none flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Trophy size={16} className="text-amber-500" />
                {t('grimoire.recordsTab')}
              </h2>
              <div className="flex items-center gap-2">
                <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
                  <button onClick={() => setViewMode('gallery')} className={`p-2 rounded-md ${viewMode === 'gallery' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}><List size={18} /></button>
                  <button onClick={() => setViewMode('matrix')} className={`p-2 rounded-md ${viewMode === 'matrix' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}><LayoutGrid size={18} /></button>
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-white bg-slate-800 p-2 rounded-lg border border-slate-700"><X size={24} /></button>
              </div>
            </div>

            <div
              ref={contentScrollRef}
              className={`flex-1 min-h-0 pr-1 -mr-1 ${
                viewMode === 'matrix'
                  ? 'overflow-hidden'
                  : 'overflow-y-auto no-scrollbar overscroll-contain'
              }`}
            >
              {viewMode === 'gallery' ? (
                  <div className="space-y-6 pb-4">
                    {recordsLoading ? <p className="text-slate-500 text-sm text-center py-8">{t('grimoire.loading')}</p> :
                     difficulties.map((diff) => {
                       const myRecord = myRecords.find((r: any) => r.rows === diff.rows && r.cols === diff.cols);
                       const lbData = leaderboard.find(lb => lb.rows === diff.rows && lb.cols === diff.cols);
                       const sectionKey = `${diff.rows}-${diff.cols}`;
                       const isExpanded = expandedSections.has(sectionKey);
                       const visibleCount = visibleCounts[sectionKey] || INITIAL_VISIBLE;
                       const totalEntries = lbData ? lbData.entries.length : 0;
                       const hasMore = visibleCount < totalEntries;
                       return (
                         <div key={sectionKey}>
                           <button
                             onClick={() => toggleSection(sectionKey)}
                             className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2 w-full hover:text-slate-200 transition-colors group"
                           >
                             <Trophy size={14} className="text-amber-500 flex-shrink-0" />
                             <span>{t(`difficulty.${diff.name}`, diff.name)}  {diff.rows}×{diff.cols}</span>
                             {lbData && (
                               <span className="ml-auto flex items-center gap-1 text-xs text-slate-500 font-normal normal-case flex-shrink-0">
                                 <span className="group-hover:text-slate-400">{t('grimoire.recordsCount', { count: lbData.entries.length })}</span>
                                 {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                               </span>
                             )}
                           </button>
                           {isExpanded && (
                             <div className="space-y-2">
                               <div className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-3">
                                 {myRecord ? (
                                   <>
                                     <span className="text-white font-mono text-sm">{t('grimoire.yourBest')}</span>
                                     <span className="text-amber-400 font-bold font-mono">{formatTime(myRecord.time_ms)}</span>
                                   </>
                                 ) : (
                                   <span className="text-slate-500 text-sm">{t('grimoire.noRecord')}</span>
                                 )}
                               </div>
                               {lbData && lbData.entries.length > 0 ? (
                                 <div className="space-y-1">
                                   {lbData.entries.slice(0, visibleCount).map((e: any) => (
                                     <div key={e.rank} className="flex items-center justify-between bg-slate-800/50 rounded-lg px-4 py-2 text-sm">
                                       <div className="flex items-center gap-3">
                                         <span className={`w-6 text-center font-bold ${e.rank === 1 ? 'text-amber-400' : e.rank <= 3 ? 'text-slate-300' : 'text-slate-500'}`}>
                                           {e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : `#${e.rank}`}
                                         </span>
                                         <span className="text-white">{e.nickname}</span>
                                       </div>
                                       <span className="text-amber-400 font-mono text-xs">{formatTime(e.time_ms)}</span>
                                     </div>
                                   ))}
                                   {hasMore && (
                                     <p className="text-center text-slate-500 text-xs py-2">{t('grimoire.scrollMore', { remaining: totalEntries - visibleCount })}</p>
                                   )}
                                 </div>
                               ) : (
                                 <p className="text-slate-600 text-xs px-2">{t('grimoire.noLeaderboard')}</p>
                               )}
                             </div>
                           )}
                         </div>
                       );
                     })}
                  </div>
              ) : (
                  <div className="h-full w-full relative">
                    <MatrixView recordsRanks={recordsRanks} onCellClick={handleBoardCellClick} />
                    <AnimatePresence>
                      {selectedBoard && (
                        <RecipeBoardLeaderboard
                          rows={selectedBoard.rows}
                          cols={selectedBoard.cols}
                          leaderboard={leaderboard}
                          myRecords={myRecords}
                          onClose={() => setSelectedBoard(null)}
                          formatTime={formatTime}
                        />
                      )}
                    </AnimatePresence>
                  </div>
              )}
            </div>

            <div className="flex-none mt-4 pt-3 border-t border-slate-800 text-center text-slate-500 text-[10px] uppercase tracking-widest font-bold">
              {t('grimoire.recordsFooter')}
            </div>
          </motion.div>
    </div>
  );
};
