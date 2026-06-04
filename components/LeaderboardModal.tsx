import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Book, Lock, Sparkles, Grid3X3, Bomb, LayoutGrid, List, Trophy, Clock } from 'lucide-react';
import { CursedReward, Difficulty } from '../types';
import { getAllRewards } from '../utils/storage';
import { getRewards as getRemoteRewards, getMyRecords, getLeaderboard } from '../utils/api';
import { getAccountId } from '../utils/auth';

interface GrimoireModalProps {
  isOpen: boolean;
  onClose: () => void;
  difficulties: Difficulty[];
}

type Tab = 'artifacts' | 'records';

const MIN_ROWS = 8, MAX_ROWS = 25;
const MIN_COLS = 8, MAX_COLS = 25;

const parseId = (id: string) => {
  const [r, c, m] = id.split('-').map(Number);
  return { rows: r, cols: c, mines: m };
};

// ── Artifact Card ──
const ArtifactCard: React.FC<{ reward?: CursedReward; fallbackConfig?: Difficulty; onClick?: () => void; unsynced?: boolean }> = ({ reward, fallbackConfig, onClick, unsynced }) => {
  const isLocked = !reward;
  const name = reward ? reward.difficultyName : fallbackConfig?.name;
  let specs = reward ? parseId(reward.id) : (fallbackConfig ? { rows: fallbackConfig.rows, cols: fallbackConfig.cols, mines: fallbackConfig.mines } : { rows: 0, cols: 0, mines: 0 });

  return (
    <motion.div whileHover={!isLocked ? { scale: 1.05 } : {}} onClick={!isLocked ? onClick : undefined}
      className={`relative aspect-[3/4] rounded-xl border-2 overflow-hidden flex flex-col transition-all group ${isLocked ? 'bg-slate-900 border-slate-700 opacity-60 grayscale' : 'bg-slate-800 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)] cursor-pointer'}`}>
      {isLocked ? (
        <div className="flex flex-col items-center justify-center h-full p-4 text-center">
          <div className="mb-3 p-3 rounded-full bg-slate-800 border border-slate-600"><Lock className="text-slate-500" size={24} /></div>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{name}</span>
          <div className="flex items-center gap-2 text-[10px] text-slate-600 font-mono bg-slate-800/50 px-2 py-1 rounded">
            <span className="flex items-center gap-1"><Grid3X3 size={10} /> {specs.rows}x{specs.cols}</span>
            <span className="flex items-center gap-1"><Bomb size={10} /> {specs.mines}</span>
          </div>
        </div>
      ) : (
        <>
          <div className="w-full h-full relative">
            {reward.type === 'image' ? <img src={reward.content} alt={reward.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-80 group-hover:opacity-100" /> :
              <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: `hsla(${reward.hue || 0}, 30%, 10%, 1)` }}><Sparkles color={`hsl(${reward.hue || 0}, 70%, 70%)`} size={32} /></div>}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <h3 className="text-amber-100 font-bold text-sm mb-1 leading-tight line-clamp-1">{reward.title}</h3>
              <div className="flex justify-between items-end border-t border-white/10 pt-2 mt-1">
                <div>
                  <div className="text-[10px] text-amber-500 font-bold uppercase mb-0.5">{name}</div>
                  <div className="text-[9px] text-slate-400 font-mono flex gap-2"><span>{specs.rows}x{specs.cols}</span><span>{specs.mines} Mines</span></div>
                </div>
              </div>
            </div>
          </div>
          {unsynced && <div className="absolute top-2 right-2 bg-yellow-600 text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold">OFFLINE</div>}
        </>
      )}
    </motion.div>
  );
};

// ── Matrix View ──
const MatrixView: React.FC<{ rewards: CursedReward[]; onSelect: (r: CursedReward) => void }> = ({ rewards, onSelect }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDown = useRef(false);
  const startPos = useRef({ x: 0, y: 0, sl: 0, st: 0 });
  const isDragging = useRef(false);
  const rowsCount = MAX_ROWS - MIN_ROWS + 1;
  const colsCount = MAX_COLS - MIN_COLS + 1;

  const getR = (r: number, c: number) => {
    const m = rewards.filter(rw => { const s = parseId(rw.id); return s.rows === r && s.cols === c; });
    return m.length > 0 ? m.sort((a, b) => parseId(b.id).mines - parseId(a.id).mines)[0] : null;
  };

  return (
    <div className="w-full h-full relative rounded-lg border border-slate-700 bg-slate-900/50 overflow-hidden" style={{ touchAction: 'none' }}>
      <div ref={scrollRef} className="w-full h-full overflow-auto no-scrollbar cursor-grab active:cursor-grabbing select-none overscroll-contain"
        onPointerDown={e => { if (!scrollRef.current) return; isDown.current = true; isDragging.current = false; startPos.current = { x: e.clientX, y: e.clientY, sl: scrollRef.current.scrollLeft, st: scrollRef.current.scrollTop }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={e => { if (!isDown.current || !scrollRef.current) return; const dx = e.clientX - startPos.current.x, dy = e.clientY - startPos.current.y; if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDragging.current = true; if (isDragging.current) { scrollRef.current.scrollLeft = startPos.current.sl - dx; scrollRef.current.scrollTop = startPos.current.st - dy; } }}
        onPointerUp={e => { isDown.current = false; e.currentTarget.releasePointerCapture(e.pointerId); }}>
        <div className="grid bg-slate-900" style={{ gridTemplateColumns: `40px repeat(${colsCount}, 32px)`, gridTemplateRows: `40px repeat(${rowsCount}, 32px)`, width: 'max-content', height: 'max-content' }}>
          <div className="sticky top-0 left-0 z-30 bg-slate-800 border-b border-r border-slate-600 flex items-center justify-center shadow-lg"><Grid3X3 size={16} className="text-amber-500" /></div>
          {Array.from({ length: colsCount }).map((_, i) => <div key={`ch-${i}`} className="sticky top-0 z-20 bg-slate-800 border-b border-slate-700 flex items-end justify-center pb-2 shadow-sm"><span className="text-[10px] text-slate-400 font-mono -rotate-45 origin-bottom translate-y-[-4px] select-none">{MIN_COLS + i}</span></div>)}
          {Array.from({ length: rowsCount }).map((_, ri) => {
            const rn = MIN_ROWS + ri;
            return <React.Fragment key={`r-${rn}`}>
              <div className="sticky left-0 z-20 bg-slate-800 border-r border-slate-700 flex items-center justify-end pr-2 shadow-sm"><span className="text-[10px] text-slate-400 font-mono select-none">{rn}</span></div>
              {Array.from({ length: colsCount }).map((_, ci) => {
                const cn = MIN_COLS + ci;
                const reward = getR(rn, cn);
                return <div key={`c-${rn}-${cn}`} className="flex items-center justify-center p-[2px] bg-slate-900">
                  <div onClick={() => { if (!isDragging.current && reward) onSelect(reward); }}
                    className={`w-full h-full rounded-sm transition-all duration-200 ${reward ? 'bg-amber-500 border border-amber-400 shadow-[0_0_5px_rgba(245,158,11,0.5)] cursor-pointer hover:scale-110' : 'bg-slate-800/30 border border-slate-700/30'}`}>
                    {reward && <div className="w-full h-full bg-white opacity-0 hover:opacity-20 animate-pulse rounded-sm" />}
                  </div>
                </div>;
              })}
            </React.Fragment>;
          })}
        </div>
      </div>
    </div>
  );
};

// ── Main GrimoireModal ──
export const GrimoireModal: React.FC<GrimoireModalProps> = ({ isOpen, onClose, difficulties }) => {
  const [tab, setTab] = useState<Tab>('artifacts');
  const [localRewards, setLocalRewards] = useState<CursedReward[]>([]);
  const [remoteRewards, setRemoteRewards] = useState<CursedReward[]>([]);
  const [selectedReward, setSelectedReward] = useState<CursedReward | null>(null);
  const [viewMode, setViewMode] = useState<'gallery' | 'matrix'>('gallery');

  // Records state
  const [myRecords, setMyRecords] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<{ rows: number; cols: number; entries: any[] }[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLocalRewards(getAllRewards());
      // Fetch remote rewards
      const accountId = getAccountId();
      getRemoteRewards(accountId).then(r => {
        const mapped: CursedReward[] = r.map((rw: any) => ({
          id: rw.id,
          date: rw.submitted_at,
          difficultyName: rw.difficulty_name,
          title: rw.title,
          content: rw.content,
          type: rw.type,
          hue: rw.hue,
        }));
        setRemoteRewards(mapped);
      }).catch(() => {});

      // Fetch records
      if (tab === 'records') fetchRecords();
    }
  }, [isOpen, tab]);

  const fetchRecords = async () => {
    setRecordsLoading(true);
    try {
      const accountId = getAccountId();
      const records = await getMyRecords(accountId);
      setMyRecords(records);

      // Fetch leaderboard for each size the player has records for
      const uniqueSizes = new Set<string>();
      records.forEach((r: any) => uniqueSizes.add(`${r.rows}x${r.cols}`));
      const lbData: any[] = [];
      for (const size of uniqueSizes) {
        const [rows, cols] = size.split('x').map(Number);
        try {
          const entries = await getLeaderboard(rows, cols);
          lbData.push({ rows, cols, entries });
        } catch {}
      }
      setLeaderboard(lbData);
    } catch {} finally {
      setRecordsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && tab === 'records') fetchRecords();
  }, [tab]);

  if (!isOpen) return null;

  // Merge rewards: remote wins for same id, local-only shown with "OFFLINE" badge
  const remoteIds = new Set(remoteRewards.map(r => r.id));
  const merged = [...remoteRewards];
  for (const lr of localRewards) {
    if (!remoteIds.has(lr.id)) merged.push(lr);
  }
  merged.sort((a, b) => b.date - a.date);

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
      <AnimatePresence>
        {selectedReward ? (
          <motion.div key="detail" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
            className="relative bg-slate-900 border border-amber-900/50 rounded-lg max-w-sm w-full shadow-2xl flex flex-col overflow-hidden">
            <button onClick={() => setSelectedReward(null)} className="absolute top-4 right-4 text-white bg-black/50 p-2 rounded-full hover:bg-black/80 z-20"><X size={20} /></button>
            <div className="w-full aspect-square bg-black relative">
              {selectedReward.type === 'image' ? <img src={selectedReward.content} className="w-full h-full object-cover" alt="Artifact" /> :
                <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: `hsl(${selectedReward.hue}, 30%, 10%)` }}><Sparkles size={64} color={`hsl(${selectedReward.hue}, 70%, 70%)`} /></div>}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent opacity-80" />
            </div>
            <div className="p-6 -mt-16 relative z-10">
              <h2 className="text-2xl font-black text-white mb-1">{selectedReward.title}</h2>
              <div className="flex items-center gap-3 text-amber-500 font-mono text-xs mb-6 uppercase tracking-wider">
                <span>{selectedReward.difficultyName}</span>
                <span className="w-1 h-1 rounded-full bg-amber-500/50" />
                <span>{new Date(selectedReward.date).toLocaleDateString()}</span>
              </div>
              <div className="bg-slate-800/50 border border-amber-500/10 rounded-xl p-4">
                <p className="text-slate-300 italic text-sm">"This artifact is evidence of a reality where logic dictates survival."</p>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div key="main" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
            className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-3xl w-full shadow-2xl h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex-none flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-amber-900/20 text-amber-500 border border-amber-900/50"><Book size={24} /></div>
                <div><h2 className="text-2xl font-bold text-white">Grimoire</h2></div>
              </div>
              <div className="flex items-center gap-2">
                {tab === 'artifacts' && (
                  <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
                    <button onClick={() => setViewMode('gallery')} className={`p-2 rounded-md ${viewMode === 'gallery' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}><List size={18} /></button>
                    <button onClick={() => setViewMode('matrix')} className={`p-2 rounded-md ${viewMode === 'matrix' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}><LayoutGrid size={18} /></button>
                  </div>
                )}
                <button onClick={onClose} className="text-slate-400 hover:text-white bg-slate-800 p-2 rounded-lg border border-slate-700"><X size={24} /></button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex-none flex gap-1 mb-4 bg-slate-800 p-1 rounded-lg">
              <button onClick={() => setTab('artifacts')}
                className={`flex-1 py-2 rounded-md text-sm font-semibold transition ${tab === 'artifacts' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                <Sparkles size={14} className="inline mr-1" />Artifacts
              </button>
              <button onClick={() => setTab('records')}
                className={`flex-1 py-2 rounded-md text-sm font-semibold transition ${tab === 'records' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                <Trophy size={14} className="inline mr-1" />Records
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 -mr-1">
              {tab === 'artifacts' ? (
                viewMode === 'gallery' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pb-4">
                    {merged.map((reward) => (
                      <ArtifactCard key={reward.id} reward={reward} onClick={() => setSelectedReward(reward)} unsynced={!remoteIds.has(reward.id) && !!remoteRewards.length} />
                    ))}
                    {merged.length === 0 && <div className="col-span-full text-center py-12 text-slate-600"><p>The void is empty.</p><p className="text-sm mt-2">Win with 0 prayers to collect artifacts.</p></div>}
                  </div>
                ) : (
                  <MatrixView rewards={merged} onSelect={r => setSelectedReward(r)} />
                )
              ) : (
                /* Records tab */
                <div className="space-y-6 pb-4">
                  {/* My Records */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2"><Clock size={14} /> My Best Times</h3>
                    {recordsLoading ? <p className="text-slate-500 text-sm">Loading...</p> :
                     myRecords.length === 0 ? <p className="text-slate-600 text-sm">No records yet. ACE a game to appear here.</p> :
                     <div className="space-y-2">
                       {myRecords.map((r: any, i: number) => (
                         <div key={i} className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-3">
                           <div>
                             <span className="text-white font-mono text-sm">{r.rows}x{r.cols}</span>
                             <span className="text-slate-500 text-xs ml-2">{r.mines} mines</span>
                           </div>
                           <div className="flex items-center gap-3">
                             <span className="text-amber-400 font-bold font-mono">{formatTime(r.time_ms)}</span>
                             <span className="text-slate-600 text-xs">{new Date(r.submitted_at).toLocaleDateString()}</span>
                           </div>
                         </div>
                       ))}
                     </div>}
                  </div>

                  {/* Leaderboard per size */}
                  {leaderboard.map((lb) => (
                    <div key={`${lb.rows}x${lb.cols}`}>
                      <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Trophy size={14} className="text-amber-500" /> {lb.rows}x{lb.cols} Leaderboard
                      </h3>
                      <div className="space-y-1">
                        {lb.entries.slice(0, 10).map((e: any) => (
                          <div key={e.rank} className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-2 text-sm">
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
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-none mt-4 pt-3 border-t border-slate-800 text-center text-slate-500 text-[10px] uppercase tracking-widest font-bold">
              {tab === 'artifacts' ? 'Collect artifacts by achieving ACED victories' : 'Times verified & anti-cheat protected'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
