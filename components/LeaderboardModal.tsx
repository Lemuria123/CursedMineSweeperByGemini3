import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { X, Book, Lock, Sparkles, Grid3X3, Bomb, LayoutGrid, List, Trophy, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { CursedReward, Difficulty } from '../types';
import { getAllRewards } from '../utils/storage';
import { getRewards as getRemoteRewards, getMyRecords, getLeaderboard } from '../utils/api';
import { ensureAccount } from '../utils/auth';
import { calculateRecommendedMines } from '../utils/gameLogic';

interface GrimoireModalProps {
  isOpen: boolean;
  onClose: () => void;
  difficulties: Difficulty[];
}

type Tab = 'artifacts' | 'records';

const MIN_ROWS = 8, MAX_ROWS = 25;
const MIN_COLS = 8, MAX_COLS = 25;

/** 矩阵角标列/行宽度（px） */
const MATRIX_HEADER_SIZE = 40;
/** 矩阵单元格边长（px） */
const MATRIX_CELL_SIZE = 32;
/** 弹窗内边距 p-6 左右合计（px） */
const MODAL_PADDING_X = 48;
/** 遮罩层 p-4 左右合计（px） */
const OUTER_PADDING_X = 32;
/** 宝物详情页 max-w-md（px），主弹窗宽度不得低于此值 */
const DETAIL_PANEL_MIN_WIDTH = 448;

/**
 * 根据矩阵固有尺寸与当前视口，计算法典主弹窗总宽度（px）。
 * 矩阵内容区宽度 = 角标 + 列数×单元格；再与视口上限、详情页下限取 clamp。
 * 列表/矩阵切换共用此宽度，避免切换视图时弹窗跳动。
 */
const computeGrimoireModalWidth = (): number => {
  const colsCount = MAX_COLS - MIN_COLS + 1;
  const matrixContentWidth = MATRIX_HEADER_SIZE + colsCount * MATRIX_CELL_SIZE;

  if (typeof window === 'undefined') {
    return matrixContentWidth + MODAL_PADDING_X;
  }

  const viewportCap =
    window.innerWidth * 0.95 - OUTER_PADDING_X - MODAL_PADDING_X;
  const contentWidth = Math.max(
    DETAIL_PANEL_MIN_WIDTH,
    Math.min(matrixContentWidth, viewportCap)
  );
  return contentWidth + MODAL_PADDING_X;
};

/**
 * 解析奖励 ID，兼容新旧两种格式：
 *   新格式: rows-cols（如 "9-9"）
 *   旧格式: rows-cols-mines（如 "9-9-19"）
 */
const parseId = (id: string) => {
  const parts = id.split('-').map(Number);
  return { rows: parts[0] || 0, cols: parts[1] || 0, mines: parts[2] || 0 };
};

/** 奖励记录中的雷数统一为默认算法值（与难度选择器一致） */
const canonicalRewardMines = (rows: number, cols: number) => calculateRecommendedMines(rows, cols);

// ── Artifact Card ──
const ArtifactCard: React.FC<{ reward?: CursedReward; fallbackConfig?: Difficulty; onClick?: () => void; unsynced?: boolean }> = ({ reward, fallbackConfig, onClick, unsynced }) => {
  const { t, i18n } = useTranslation();
  const isLocked = !reward;
  const name = reward ? reward.difficultyName : fallbackConfig?.name;
  // 画廊三张卡绑定预设难度：行列与雷数始终与难度选择器一致，不用 reward 里存的当局雷数
  const specs = fallbackConfig
    ? { rows: fallbackConfig.rows, cols: fallbackConfig.cols, mines: fallbackConfig.mines }
    : reward
      ? { ...parseId(reward.id), mines: canonicalRewardMines(parseId(reward.id).rows, parseId(reward.id).cols) }
      : { rows: 0, cols: 0, mines: 0 };

  return (
    <motion.div whileHover={!isLocked ? { scale: 1.05 } : {}} onClick={!isLocked ? onClick : undefined}
      className={`relative w-full max-h-full aspect-[3/4] rounded-xl border-2 overflow-hidden flex flex-col transition-all group ${isLocked ? 'bg-slate-900 border-slate-700 opacity-60 grayscale' : 'bg-slate-800 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)] cursor-pointer'}`}>
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
          {/* 使用 layoutId 实现从卡片位置到详情的共享元素过渡动画 */}
          <motion.div layoutId={reward ? `artifact-img-${reward.id}` : undefined} className="w-full h-full relative">
            {reward?.type === 'image' ? (
              <img src={reward.content} alt={reward.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-80 group-hover:opacity-100" />
            ) : reward?.icon ? (
              <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: `hsla(${reward.hue || 0}, 30%, 10%, 1)` }}>
                <img src={reward.icon} alt={reward.title} className="w-12 h-12 object-contain opacity-70 group-hover:opacity-100 transition-opacity" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: `hsla(${reward.hue || 0}, 30%, 10%, 1)` }}><Sparkles color={`hsl(${reward.hue || 0}, 70%, 70%)`} size={32} /></div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <div className="flex justify-between items-end">
                <div>
                  {/* 管理后台配置的 Artifact 名称 */}
                  {/* i18n：根据当前语言选择奖品名称显示 */}
                  <h3 className="text-amber-100 font-bold text-sm mb-1 leading-tight line-clamp-1">{i18n.language === 'en' && reward.nameEn ? reward.nameEn : reward.title}</h3>
                  <div className="text-[9px] text-slate-400 font-mono flex gap-2">
                    <span>{specs.rows}x{specs.cols}</span>
                    <span>{t('grimoire.minesUnit', { count: specs.mines })}</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
          {unsynced && <div className="absolute top-2 right-2 bg-yellow-600 text-white text-[8px] px-1.5 py-0.5 rounded-full font-bold">{t('grimoire.offline')}</div>}
        </>
      )}
    </motion.div>
  );
};

// ── 矩阵棋盘排行榜浮层 ──
// 在 Records 矩阵模式下，点击任意棋盘单元格时弹出此面板
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
    // 半透明背景遮罩 + 绝对定位面板，覆盖在矩阵上方
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="bg-slate-900 border border-slate-600 rounded-xl p-5 max-w-md w-full max-h-[70vh] flex flex-col shadow-2xl"
      >
        {/* 头部：棋盘尺寸 + 关闭按钮 */}
        <div className="flex-none flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-amber-400 flex items-center gap-2">
            <Trophy size={16} /> {rows}×{cols}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white bg-slate-800 p-1.5 rounded-lg"><X size={16} /></button>
        </div>

        {/* 个人最佳 */}
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

        {/* 排行榜列表（可滚动） */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 -mr-1">
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

// ── Matrix View ──
// 当 recordsRanks 不为空时，进入 Records 模式，每个单元格显示该棋盘尺寸的排名徽章
// 否则为 Artifacts 模式，显示已收集的琥珀色方块
const MatrixView: React.FC<{
  rewards: CursedReward[];
  onSelect: (r: CursedReward) => void;
  recordsRanks?: Record<string, number>; // key: "rows-cols", value: 排名 (1..100, 101=100+), 0=无数据
  onCellClick?: (rows: number, cols: number) => void; // Records 模式点击单元格查看排行榜
}> = ({ rewards, onSelect, recordsRanks, onCellClick }) => {
  const isRecordsMode = !!recordsRanks && Object.keys(recordsRanks).length > 0;
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
    // 填满父容器高度，矩阵内部拖拽平移，避免外层 content 区再出现纵向滚动条
    <div className="w-full h-full relative rounded-lg border border-slate-700 bg-slate-900/50 overflow-hidden" style={{ touchAction: 'none' }}>
      <div ref={scrollRef} className="w-full h-full overflow-auto no-scrollbar cursor-grab active:cursor-grabbing select-none overscroll-contain"
        onPointerDown={e => { if (!scrollRef.current) return; isDown.current = true; isDragging.current = false; startPos.current = { x: e.clientX, y: e.clientY, sl: scrollRef.current.scrollLeft, st: scrollRef.current.scrollTop }; /* 仅触屏/笔使用 pointer capture 实现拖拽滚动；鼠标不使用 capture，否则 mousedown/mouseup 会路由到不同元素导致 click 事件不触发 */ if (e.pointerType !== 'mouse') { e.currentTarget.setPointerCapture(e.pointerId); } }}
        onPointerMove={e => { if (!isDown.current || !scrollRef.current) return; const dx = e.clientX - startPos.current.x, dy = e.clientY - startPos.current.y; if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDragging.current = true; if (isDragging.current) { scrollRef.current.scrollLeft = startPos.current.sl - dx; scrollRef.current.scrollTop = startPos.current.st - dy; } }}
        onPointerUp={e => { isDown.current = false; /* 仅在非鼠标输入时释放 capture */ if (e.pointerType !== 'mouse') { e.currentTarget.releasePointerCapture(e.pointerId); } }}>
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
                const rankKey = `${rn}-${cn}`;
                const rank = isRecordsMode ? (recordsRanks?.[rankKey] || 0) : 0;
                // 排名徽章渲染函数
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
                    onClick={() => {
                    if (isDragging.current) return;
                    if (isRecordsMode && onCellClick) onCellClick(rn, cn);
                    else if (!isRecordsMode && reward) onSelect(reward);
                  }}
                    className={`w-full h-full rounded-sm transition-all duration-200 flex items-center justify-center overflow-hidden
                      ${isRecordsMode ? (
                        rank > 0 ? 'bg-amber-900/40 border border-amber-700/50 cursor-pointer hover:scale-110' : 'bg-slate-800/30 border border-slate-700/30'
                      ) : (
                        reward ? 'border border-amber-400 shadow-[0_0_3px_rgba(245,158,11,0.4)] cursor-pointer hover:scale-110' : 'bg-slate-800/30 border border-slate-700/30'
                      )}`}>
                    {/* 宝物缩略图：矩阵 Artifacts 模式下展示图标，Records 模式下展示排名徽章 */}
                    {!isRecordsMode && reward ? (
                      reward.icon ? (
                        <img src={reward.icon} alt={reward.title} className="w-3/4 h-3/4 object-contain"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <div className="w-full h-full bg-amber-500/60" />
                      )
                    ) : null}
                    {isRecordsMode && badge && badge}
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

// ── Main GrimoireModal ──
export const GrimoireModal: React.FC<GrimoireModalProps> = ({ isOpen, onClose, difficulties }) => {
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<Tab>('artifacts');
  const [localRewards, setLocalRewards] = useState<CursedReward[]>([]);
  const [remoteRewards, setRemoteRewards] = useState<CursedReward[]>([]);
  const [selectedReward, setSelectedReward] = useState<CursedReward | null>(null);
  const [viewMode, setViewMode] = useState<'gallery' | 'matrix'>('gallery');
  // 主弹窗宽度：打开时与窗口 resize 时按矩阵视口计算，列表/矩阵共用
  const [modalWidthPx, setModalWidthPx] = useState(computeGrimoireModalWidth);

  // Records state
  const [myRecords, setMyRecords] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<{ rows: number; cols: number; entries: any[] }[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  // 服务端 account_id，用于排行榜个人排名匹配
  const [serverAccountId, setServerAccountId] = useState<string | null>(null);

  // 每个难度 section 的展开/收起状态（null 表示使用默认值，初始化时由 effect 处理）
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  // 每个难度当前显示的排行榜条目数，默认显示 10 条
  const INITIAL_VISIBLE = 10;
  const LOAD_MORE_COUNT = 10;
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  // 滚动加载防抖标记
  const loadingMoreRef = useRef(false);
  // 内容区滚动容器引用
  const contentScrollRef = useRef<HTMLDivElement>(null);
  // Records 矩阵模式：点击某个棋盘单元格后弹出的排行榜面板
  const [selectedBoard, setSelectedBoard] = useState<{ rows: number; cols: number } | null>(null);

  // 弹窗宽度随视口更新；列表与矩阵视图共用，切换时不改变
  useEffect(() => {
    if (!isOpen) return;
    const updateWidth = () => setModalWidthPx(computeGrimoireModalWidth());
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setLocalRewards(getAllRewards().map(r => {
        const { rows, cols } = parseId(r.id);
        return { ...r, mines: canonicalRewardMines(rows, cols) };
      }));
      setSelectedBoard(null); // 每次打开/切换时关闭旧浮层
      // Fetch remote rewards
      ensureAccount().then(({ accountId }) => {
        setServerAccountId(accountId);
        return getRemoteRewards(accountId).then(r => {
          const mapped: CursedReward[] = r.map((rw: any) => ({
            id: rw.id,
            date: rw.submitted_at,
            difficultyName: rw.difficulty_name,
            title: rw.title,
            icon: rw.icon || '',
            content: rw.content,
            type: rw.type,
            hue: rw.hue,
            mines: canonicalRewardMines(rw.rows, rw.cols),
            // i18n：英文版本的名称与正文，回退到中文
            nameEn: rw.name_en || '',
            contentEn: rw.content_en || '',
            // v0.4.0 阅读链字段
            novelIndex: rw.novel_index,
            nextRows: rw.next_rows,
            nextCols: rw.next_cols,
            contentKind: rw.content_kind || 'item_lore',
            sourceIp: rw.source_ip || '',
          }));
          setRemoteRewards(mapped);
        });
      }).catch(() => {});

      // Fetch records
      if (tab === 'records') fetchRecords();
    }
  }, [isOpen, tab]);

  const fetchRecords = async () => {
    setRecordsLoading(true);
    try {
      const { accountId } = await ensureAccount();
      setServerAccountId(accountId);
      const records = await getMyRecords(accountId);
      setMyRecords(records);

      // 收集需要拉取排行榜的棋盘尺寸：预设难度 + 玩家个人记录中额外的尺寸
      const boardSet = new Set<string>();
      for (const diff of difficulties) {
        boardSet.add(`${diff.rows}-${diff.cols}`);
      }
      for (const r of records) {
        boardSet.add(`${r.rows}-${r.cols}`);
      }

      // 为所有棋盘尺寸拉取排行榜
      const lbData: any[] = [];
      for (const key of boardSet) {
        const [rows, cols] = key.split('-').map(Number);
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
    // 切换到 records 时重置展开/收起和可见条目数
    if (tab === 'records') {
      setExpandedSections(new Set(difficulties.map(d => `${d.rows}-${d.cols}`)));
      setVisibleCounts({});
      setSelectedBoard(null); // 关闭上一棋盘弹出的排行榜浮层
    }
  }, [tab]);

  // 切换某个难度 section 的展开/收起
  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 矩阵单元格点击：打开排行榜浮层（数据不存在时即时拉取）
  const handleBoardCellClick = async (rows: number, cols: number) => {
    setSelectedBoard({ rows, cols });
    // 如果该棋盘的排行榜尚未拉取，即时请求
    const exists = leaderboard.some(lb => lb.rows === rows && lb.cols === cols);
    if (!exists) {
      try {
        const entries = await getLeaderboard(rows, cols);
        setLeaderboard(prev => {
          // 避免重复添加
          if (prev.some(lb => lb.rows === rows && lb.cols === cols)) return prev;
          return [...prev, { rows, cols, entries }];
        });
      } catch {}
    }
  };

  // 内容区滚动事件：检测是否滚动到底部附近，自动加载更多条目
  const handleContentScroll = useCallback(() => {
    const el = contentScrollRef.current;
    if (!el || loadingMoreRef.current) return;
    // 距离底部 80px 时触发加载
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      loadingMoreRef.current = true;
      setVisibleCounts(prev => {
        const next = { ...prev };
        let changed = false;
        for (const diff of difficulties) {
          const key = `${diff.rows}-${diff.cols}`;
          // 已收起的 section 不加载更多
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
      // 300ms 防抖，避免频繁触发
      setTimeout(() => { loadingMoreRef.current = false; }, 300);
    }
  }, [leaderboard, expandedSections, difficulties]);

  // 绑定/解绑滚动事件
  useEffect(() => {
    const el = contentScrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleContentScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleContentScroll);
  }, [handleContentScroll]);

  // Merge rewards: remote wins for same id, local-only shown with "OFFLINE" badge
  // 必须在 early return 之前执行，避免 React Hooks 顺序错误
  const remoteIds = useMemo(() => new Set(remoteRewards.map(r => r.id)), [remoteRewards]);
  const merged = React.useMemo(() => {
    const result = [...remoteRewards];
    for (const lr of localRewards) {
      if (!remoteIds.has(lr.id)) result.push(lr);
    }
    result.sort((a, b) => b.date - a.date);
    return result;
  }, [remoteRewards, localRewards, remoteIds]);

  // 预计算详情视图所需的数据
  // 核心改进：只依赖 selectedReward.id，从 merged 中实时查找最新版本，
  // 这样当 API 返回完整数据后 merged 更新时，detailData 自动获得后端配置的完整字段
  const detailData = useMemo(() => {
    if (!selectedReward) return null;
    // 始终从 merged 中查找最新数据，而非直接使用 selectedReward 对象
    const latest = merged.find(r => r.id === selectedReward.id);
    if (!latest) return null;

    const { nextRows, nextCols } = latest;
    // 在已收集宝物中查找「下一章节」对应的宝物
    const nextReward = (nextRows && nextCols)
      ? merged.find(r => { const s = parseId(r.id); return s.rows === nextRows && s.cols === nextCols; })
      : null;
    // 根据当前语言，选择中文/英文显示名称
    const displayTitle = i18n.language === 'en' && latest.nameEn
      ? latest.nameEn
      : latest.title;
    return {
      reward: latest,       // 始终使用 merged 中的最新版本（包含后端配置的完整字段）
      displayTitle,
      hasNext: !!nextReward,
      goToNext: () => { if (nextReward) setSelectedReward(nextReward); },
    };
  }, [selectedReward, merged, i18n.language]);

  if (!isOpen) return null;

  // 计算 Records 模式下每个棋盘尺寸的排名：key="rows-cols", value=排名数
  // 排名从 leaderboard 中查找玩家 account_id 的位置，未进 top100 则标记为 101
  const recordsRanks: Record<string, number> = {};
  if (tab === 'records' && serverAccountId) {
    const accountId = serverAccountId;
    for (const r of myRecords) {
      const key = `${r.rows}-${r.cols}`;
      const lb = leaderboard.find(lb => lb.rows === r.rows && lb.cols === r.cols);
      if (lb) {
        const entry = lb.entries.find((e: any) => e.account_id === accountId);
        recordsRanks[key] = entry ? entry.rank : 101; // 101 表示 100+
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
      <LayoutGroup>
      {/* 主列表视图始终存在，不再通过 AnimatePresence 与详情视图交替切换，
          避免列表退出动画 + 详情进入动画的双重动画问题 */}
      <motion.div key="main" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            style={{ width: modalWidthPx }}
            className="relative bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl max-h-[calc(100vh-2rem)] h-[85vh] flex flex-col overflow-hidden max-w-[95vw] shrink-0">
            {/* Header */}
            <div className="flex-none flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-full bg-amber-900/20 text-amber-500 border border-amber-900/50"><Book size={24} /></div>
                <div><h2 className="text-2xl font-bold text-white">{t('grimoire.title')}</h2></div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
                  <button onClick={() => setViewMode('gallery')} className={`p-2 rounded-md ${viewMode === 'gallery' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}><List size={18} /></button>
                  <button onClick={() => setViewMode('matrix')} className={`p-2 rounded-md ${viewMode === 'matrix' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}><LayoutGrid size={18} /></button>
                </div>
                <button onClick={onClose} className="text-slate-400 hover:text-white bg-slate-800 p-2 rounded-lg border border-slate-700"><X size={24} /></button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex-none flex gap-1 mb-4 bg-slate-800 p-1 rounded-lg">
              <button onClick={() => setTab('artifacts')}
                className={`flex-1 py-2 rounded-md text-sm font-semibold transition ${tab === 'artifacts' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                <Sparkles size={14} className="inline mr-1" />{t('grimoire.artifactsTab')}
              </button>
              <button onClick={() => setTab('records')}
                className={`flex-1 py-2 rounded-md text-sm font-semibold transition ${tab === 'records' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                <Trophy size={14} className="inline mr-1" />{t('grimoire.recordsTab')}
              </button>
            </div>

            {/* Content —— 矩阵视图由 MatrixView 内部平移；遗物画廊按内容区高度撑满卡片；记录列表在此滚动 */}
            <div
              ref={contentScrollRef}
              className={`flex-1 min-h-0 pr-1 -mr-1 ${
                viewMode === 'matrix' || (tab === 'artifacts' && viewMode === 'gallery')
                  ? 'overflow-hidden'
                  : 'overflow-y-auto no-scrollbar overscroll-contain'
              }`}
            >
              {tab === 'artifacts' ? (
                viewMode === 'gallery' ? (
                  /* 遗物画廊：在固定弹窗宽度内三等分，卡片 w-full + aspect-[3/4]，纵向居中 */
                  <div className="flex h-full w-full items-center justify-center gap-4 px-2">
                      {difficulties.map((diff) => {
                        const match = merged.find(r => {
                          const { rows, cols } = parseId(r.id);
                          return rows === diff.rows && cols === diff.cols;
                        });
                        return (
                          <div
                            key={`${diff.rows}-${diff.cols}`}
                            className="flex h-full min-w-0 flex-1 items-center justify-center"
                          >
                            <ArtifactCard
                              reward={match}
                              fallbackConfig={diff}
                              onClick={match ? () => setSelectedReward(match) : undefined}
                              unsynced={match ? !remoteIds.has(match.id) && !!remoteRewards.length : false}
                            />
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <div className="h-full w-full">
                    <MatrixView rewards={merged} onSelect={r => setSelectedReward(r)} />
                  </div>
                )
              ) : (
                /* Records tab —— 列表 / 矩阵两种视图 */
                viewMode === 'gallery' ? (
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
                           {/* 可点击的标题行，带展开/收起箭头 */}
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
                           {/* 展开时显示内容，收起时隐藏 */}
                           {isExpanded && (
                             <div className="space-y-2">
                               {/* 个人最佳 */}
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
                               {/* 排行榜 —— 滚动加载更多 */}
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
                                   {/* 底部提示：还有更多数据可滚动加载 */}
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
                  /* Records 矩阵视图 —— 显示每个棋盘尺寸的排名徽章，点击查看排行榜 */
                  <div className="h-full w-full relative">
                    <MatrixView rewards={merged} onSelect={r => setSelectedReward(r)} recordsRanks={recordsRanks}
                      onCellClick={handleBoardCellClick} />
                    {/* 选中棋盘后弹出排行榜浮层，覆盖在矩阵上方；AnimatePresence 使弹窗关闭时 exit 动画生效 */}
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
                ))}
            </div>

            <div className="flex-none mt-4 pt-3 border-t border-slate-800 text-center text-slate-500 text-[10px] uppercase tracking-widest font-bold">
              {tab === 'artifacts' ? t('grimoire.artifactsFooter') : t('grimoire.recordsFooter')}
            </div>
          </motion.div>

      {/* ── 宝物详情视图 ── */}
      <AnimatePresence>
        {selectedReward && detailData && (
          <motion.div key="detail"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-40 flex items-center justify-center p-4">
            <div className="relative bg-slate-900 border border-amber-900/50 rounded-lg max-w-md w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden select-text">

              {/* 关闭按钮 */}
              <button onClick={() => setSelectedReward(null)}
                className="absolute top-3 right-3 text-slate-400 hover:text-white bg-black/50 p-2 rounded-full hover:bg-black/80 z-20 transition-colors">
                <X size={18} />
              </button>

              {/* ── 标题栏：宝物名称 ── */}
              <div className="flex-none px-6 pt-5 pb-3">
                <h2 className="text-lg font-bold text-white leading-tight">
                  {detailData.displayTitle}
                </h2>
              </div>

              {/* ── 正文内容区 ── */}
              {/* 仅此一层纵向滚动，遵循无嵌套滚动条规范 */}
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 pb-4">
                <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 min-h-[120px]">

                  {/* ── 宝物核心视觉：图片居中，文字放在下方 ── */}
                  {/* type=image：内容图（封面）承载 layoutId 动画 */}
                  {/* type≠image：200px 图标独立一行 */}
                  {detailData.reward.type === 'image' && detailData.reward.content ? (
                    <motion.div layoutId={`artifact-img-${detailData.reward.id}`} className="mb-4">
                      <img
                        src={detailData.reward.content}
                        alt={detailData.reward.title}
                        className="w-full rounded"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </motion.div>
                  ) : (
                    detailData.reward.icon ? (
                      <motion.div
                        layoutId={`artifact-img-${detailData.reward.id}`}
                        className="mb-4 flex justify-center"
                      >
                        <img
                          src={detailData.reward.icon}
                          alt={detailData.reward.title}
                          className="w-[200px] h-auto"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      </motion.div>
                    ) : null
                  )}

                  {/* image 类型在内容图下方展示小图标（封面类型 icon 与 content 重复时跳过） */}
                  {detailData.reward.type === 'image' && detailData.reward.contentKind !== 'cover' && detailData.reward.icon ? (
                    <div className="flex justify-center mb-4">
                      <img
                        src={detailData.reward.icon}
                        alt={detailData.reward.title}
                        className="w-12 h-12 object-contain opacity-50"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  ) : null}

                  {/* 正文文字：仅 text / glitch 类型，段落首行缩进两字符 */}
                  {detailData.reward.type === 'text' || detailData.reward.type === 'glitch' ? (
                    <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-line" style={{ textIndent: '2em' }}>
                      {detailData.reward.content}
                    </div>
                  ) : null}

                </div>
              </div>

              {/* ── 底部导航：下一章提示 + 按钮 ── */}
              <div className="flex-none px-6 pb-4 pt-2 border-t border-slate-800 flex items-center justify-end gap-2">
                <div className="text-[11px] text-slate-400">
                  {detailData.reward.nextRows ? (
                    <span>ACE {detailData.reward.nextRows}×{detailData.reward.nextCols} 解锁</span>
                  ) : null}
                </div>
                <button
                  onClick={detailData.goToNext}
                  disabled={!detailData.hasNext}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                    detailData.hasNext
                      ? 'bg-amber-600 hover:bg-amber-500 text-white cursor-pointer'
                      : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                  }`}
                >
                  {t('grimoire.nextArtifactBtn')}
                </button>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </LayoutGroup>
    </div>
  );
};
