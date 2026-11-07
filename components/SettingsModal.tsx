
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Bomb, Skull, AlertTriangle, Plus, Minus, MoveDiagonal2, Check } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';
import { Difficulty } from '../types';
import { calculateRecommendedMines } from '../utils/gameLogic';
import { ensureAccount } from '../utils/auth';
import { setNickname } from '../utils/api';
import { DifficultySelector } from './DifficultySelector';
import { SKINS, SkinId } from '../utils/skins';

/** 按下右上角标记时记下起点。之后的行列都按相对这次按下的位移来算，避免格子自己变大后把增量算重复 */
interface ResizeDrag {
  pointerId: number;
  startX: number;
  startY: number;
  startRows: number;
  startCols: number;
  /** 拖过一格才增减一行或一列：格子边长，再加上格与格之间的 1px 缝 */
  pitch: number;
}

/**
 * 预览里的雷从最底行往上铺：一行从左到右铺满，再铺上面一行。
 * 简单 9 列、19 个雷时，就是底下两行全是雷，再往上的一行最左边再放 1 个。
 * 返回 true 表示这一格要画出地雷。
 */
function isPreviewMine(row: number, col: number, rows: number, cols: number, mines: number): boolean {
  const fromBottom = rows - 1 - row;
  return fromBottom * cols + col < mines;
}

/**
 * 选中难度后，在行/列原来的位置画出这块棋盘，并把当前雷数铺在格子里。
 * 格子是未翻开的样子，颜色走 cell-hidden，换皮肤时跟着变。
 * 边长在样式里写成对局格子的 1/4，这里只负责按行列把格子排出来。
 */
function DifficultyBoardPreview({ rows, cols, mines }: { rows: number; cols: number; mines: number }) {
  if (rows < 1 || cols < 1) return null;

  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // 和真正的格子一样，按行列奇偶铺两种草地，小棋盘才看得出是一格一格
      const isEven = (row + col) % 2 === 0;
      const mine = isPreviewMine(row, col, rows, cols, mines);
      cells.push(
        <div
          key={`${row}-${col}`}
          className={`diff-preview-cell cell-body cell-hidden flex items-center justify-center ${isEven ? 'bg-grass-light' : 'bg-grass-dark'}`}
        >
          {mine && <Bomb className="diff-preview-mine fill-current" aria-hidden />}
        </div>
      );
    }
  }

  return (
    <div className="diff-preview-frame skin-board bg-[#14532d] shrink-0" aria-hidden="true">
      <div className="diff-preview" data-cols={cols}>
        {cells}
      </div>
    </div>
  );
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDifficulty: Difficulty;
  onDifficultyChange: (d: Difficulty) => void;
  difficulties: Difficulty[];
  /** 当前界面。四个灵魂里高亮的就是这一套 */
  skin: SkinId;
  onSkinChange: (skin: SkinId) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentDifficulty,
  onDifficultyChange,
  difficulties,
  skin,
  onSkinChange,
}) => {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState(currentDifficulty.rows);
  const [cols, setCols] = useState(currentDifficulty.cols);
  const [mines, setMines] = useState(currentDifficulty.mines);
  const [error, setError] = useState('');
  const [activePreset, setActivePreset] = useState(currentDifficulty.name);
  // 展示服务端 account_id 与昵称
  const [debugAccountId, setDebugAccountId] = useState('');
  const [debugNickname, setDebugNickname] = useState<string | null>(null);
  const [nicknameInput, setNicknameInput] = useState('');
  const [nicknameEditing, setNicknameEditing] = useState(false);
  const [nicknameError, setNicknameError] = useState('');
  const [nicknameSaving, setNicknameSaving] = useState(false);
  const resizeDrag = useRef<ResizeDrag | null>(null);
  /**
   * 按住加号或减号时的连发。
   * delay：短按和连发之间的等待。timer：连发开始后的下一拍。
   * swallowedClick：按下时已经改过一颗，紧跟着的 click 要吃掉，避免点一下加两颗。
   */
  const mineRepeat = useRef<{ delay: number | null; timer: number | null; swallowedClick: boolean }>({
    delay: null,
    timer: null,
    swallowedClick: false,
  });
  /** 连发时读这个数。React 状态要等下一次渲染才变，按住期间不能拿旧的闭包值来加减 */
  const minesRef = useRef(mines);
  /** 15%～30% 的上下限。行列一变就在渲染里写进来，连发回调不用自己再算 */
  const mineBoundsRef = useRef({ min: 1, max: 1 });

  const MIN_DIM = 8;
  const MAX_ROWS = 25;
  const MAX_COLS = 25;

  useEffect(() => {
    if (isOpen) {
        setRows(currentDifficulty.rows);
        setCols(currentDifficulty.cols);
        setMines(currentDifficulty.mines);
        minesRef.current = currentDifficulty.mines;
        setError('');
        setActivePreset(currentDifficulty.name);
        setNicknameEditing(false);
        setNicknameError('');

        // 打开设置页时注册/拉取账号，便于联调排行榜与昵称
        ensureAccount()
          .then(({ accountId, nickname }) => {
            setDebugAccountId(accountId);
            setDebugNickname(nickname);
            setNicknameInput(nickname ?? '');
          })
          .catch(() => {
            setDebugAccountId('');
            setDebugNickname(null);
            setNicknameInput('');
          });
    }
  }, [isOpen, currentDifficulty]);

  const handleNicknameSave = async () => {
    const trimmed = nicknameInput.trim();
    if (!trimmed) {
      setNicknameError(t('app.nicknameEmpty'));
      return;
    }
    setNicknameSaving(true);
    setNicknameError('');
    try {
      const { accountId } = await ensureAccount();
      await setNickname(accountId, trimmed);
      setDebugNickname(trimmed);
      setNicknameEditing(false);
    } catch {
      setNicknameError(t('common.saveFailed'));
    } finally {
      setNicknameSaving(false);
    }
  };

  useEffect(() => {
      const next = calculateRecommendedMines(rows, cols);
      minesRef.current = next;
      setMines(next);
  }, [rows, cols]);

  // 停掉按住加减雷的等待和连发。松手、到了雷数边界、关掉弹窗都走这里
  const clearMineRepeat = () => {
      const repeat = mineRepeat.current;
      if (repeat.delay != null) window.clearTimeout(repeat.delay);
      if (repeat.timer != null) window.clearTimeout(repeat.timer);
      repeat.delay = null;
      repeat.timer = null;
  };

  // 关掉弹窗或卸载时按钮已经不在了，不能再留着连发去改雷数
  useEffect(() => {
      if (isOpen) return;
      clearMineRepeat();
  }, [isOpen]);

  useEffect(() => clearMineRepeat, []);

  const handleApply = () => {
      if (rows < MIN_DIM || rows > MAX_ROWS) {
          setError(t('settings.rowsError', { min: MIN_DIM, max: MAX_ROWS }));
          return;
      }
      if (cols < MIN_DIM || cols > MAX_COLS) {
          setError(t('settings.colsError', { min: MIN_DIM, max: MAX_COLS }));
          return;
      }
      setError('');
      onDifficultyChange({
          name: 'Custom',
          rows,
          cols,
          mines
      });
      onClose();
  };

  const handlePresetClick = (d: Difficulty) => {
      setActivePreset(d.name);
      setRows(d.rows);
      setCols(d.cols);
      minesRef.current = d.mines;
      setMines(d.mines);
  };

  // 拖出来的尺寸如果正好是简单、中等或困难，高亮对应按钮，否则不算任何一个预设
  const applyBoardSize = (nextRows: number, nextCols: number) => {
      const clampedRows = Math.min(MAX_ROWS, Math.max(MIN_DIM, nextRows));
      const clampedCols = Math.min(MAX_COLS, Math.max(MIN_DIM, nextCols));
      setRows(clampedRows);
      setCols(clampedCols);
      const match = difficulties.find((d) => d.rows === clampedRows && d.cols === clampedCols);
      setActivePreset(match ? match.name : 'Custom');
  };

  // 右上角是拖动点：向右加列，向左减列；向上加行，向下减行。底边和左边留在原地的感觉靠“往外拉变大”
  const onResizePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
      const cell = event.currentTarget.parentElement?.querySelector('.diff-preview-cell');
      const box = cell?.getBoundingClientRect();
      resizeDrag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          startRows: rows,
          startCols: cols,
          pitch: (box?.width ?? 12) + 1,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
  };

  const onResizePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
      const drag = resizeDrag.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const nextCols = drag.startCols + Math.round((event.clientX - drag.startX) / drag.pitch);
      const nextRows = drag.startRows + Math.round((drag.startY - event.clientY) / drag.pitch);
      applyBoardSize(nextRows, nextCols);
  };

  const endResizeDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
      if (resizeDrag.current?.pointerId !== event.pointerId) return;
      resizeDrag.current = null;
  };

  // 和原来的滑条一样：雷数只在总格子的 15% 到 30% 之间
  const minMines = Math.max(1, Math.floor(rows * cols * 0.15));
  const maxMines = Math.floor(rows * cols * 0.30);
  mineBoundsRef.current = { min: minMines, max: maxMines };

  /**
   * 按当前上下限改一颗雷。
   * 已经到边界时返回 false，连发要停，免得计时器空转。
   */
  const stepMines = (delta: number) => {
      const { min, max } = mineBoundsRef.current;
      const next = Math.min(max, Math.max(min, minesRef.current + delta));
      if (next === minesRef.current) return false;
      minesRef.current = next;
      setMines(next);
      return true;
  };

  /**
   * 按下就先改一颗。停大约三分之一秒再连发，所以快速点一下仍然只动一颗。
   * 按住越久，每一拍越短，从最少雷按到最多雷不用按很长时间。
   */
  const startMineHold = (delta: number) => {
      clearMineRepeat();
      mineRepeat.current.swallowedClick = true;
      if (!stepMines(delta)) return;
      let gap = 96;
      const tick = () => {
          if (!stepMines(delta)) {
              clearMineRepeat();
              return;
          }
          gap = Math.max(36, gap - 8);
          mineRepeat.current.timer = window.setTimeout(tick, gap);
      };
      mineRepeat.current.delay = window.setTimeout(() => {
          mineRepeat.current.delay = null;
          tick();
      }, 320);
  };

  // click 排在松手之后、排在 setTimeout(0) 之前。标记留到下一拍再清，避免误吞下一次真正的点击
  const releaseMineHold = () => {
      clearMineRepeat();
      window.setTimeout(() => {
          mineRepeat.current.swallowedClick = false;
      }, 0);
  };

  const onMinePointerDown = (delta: number) => (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      // 挡住紧跟着的 click，否则点一下会加两颗
      event.preventDefault();
      startMineHold(delta);
      try {
          event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
          // 捕获失败时，松手事件仍然落在这颗按钮上就能停
      }
  };

  const onMinePointerLeave = (event: React.PointerEvent<HTMLButtonElement>) => {
      // 指针已经被这颗按钮抓住时，移出按钮仍算按住，要等松手
      if (event.currentTarget.hasPointerCapture(event.pointerId)) return;
      releaseMineHold();
  };

  const onMineKeyDown = (delta: number) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      // 键盘自己会连发 keydown。连发交给上面的计时器，这里只认第一次按下
      if (event.repeat) return;
      startMineHold(delta);
  };

  const onMineKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      releaseMineHold();
  };

  // 读屏软件有时只触发 click，不经过按下。那种情况在这里补一颗
  const onMineClick = (delta: number) => () => {
      if (mineRepeat.current.swallowedClick) {
          mineRepeat.current.swallowedClick = false;
          return;
      }
      stepMines(delta);
  };

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="skin-settings relative bg-slate-800 border-2 border-slate-600 rounded-2xl p-5 max-w-md w-full shadow-2xl flex flex-col max-h-[85vh] overflow-y-auto no-scrollbar select-text"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors z-10 bg-slate-800/50 rounded-full p-1"
        >
          <X size={20} />
        </button>

        {/* 语言切换器：左上角紧凑按钮组，与关闭按钮对称 */}
        <div className="absolute top-4 left-4 z-10 flex gap-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700">
          <button
            onClick={() => i18n.changeLanguage('zh')}
            className={`px-2 py-1 rounded text-base font-bold transition-all ${
              i18n.language === 'zh' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t('settings.langZh')}
          </button>
          <button
            onClick={() => i18n.changeLanguage('en')}
            className={`px-2 py-1 rounded text-base font-bold transition-all ${
              i18n.language === 'en' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t('settings.langEn')}
          </button>
        </div>

        {/* Cursed Header Section */}
        <div className="flex flex-col items-center text-center mb-4 pt-1 shrink-0">
            {/* 四个小魂火贴在骷髅原有的圆圈上：上诅咒、右深渊、下街机、左古庙。不另画圆，避免把下面的按钮挤出弹窗 */}
            <div className="skin-picker mb-3" role="group" aria-label={t('settings.skinGroup')}>
              <div className="skin-skull p-3 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 shadow-[0_0_20px_rgba(220,38,38,0.2)]">
                <Skull size={32} strokeWidth={2} />
              </div>
              {SKINS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-skin-choice={item.id}
                  className={`skin-soul skin-soul-${item.place}${skin === item.id ? ' is-active' : ''}`}
                  aria-pressed={skin === item.id}
                  title={t(`settings.skins.${item.id}`)}
                  onClick={() => onSkinChange(item.id)}
                >
                  {/* 魂火：一团小火苗，不是吃豆人那种带眼睛的幽灵 */}
                  <svg viewBox="0 0 12 16" aria-hidden="true">
                    <path fill="currentColor" d="M6 .4C7.2 2.2 8.6 3.2 9.2 5.2 10.2 6.6 10.4 8.2 9.8 10 9.4 12.2 8 14.6 6 15.2 4 14.6 2.6 12.2 2.2 10 1.6 8.2 1.8 6.6 2.8 5.2 3.4 3.2 4.8 2.2 6 .4Z" />
                  </svg>
                </button>
              ))}
            </div>

            {/* 昵称与 account_id：可编辑昵称，ID 仅供调试复制 */}
            {debugAccountId && (
              <div className="text-center mb-2 px-2 break-all leading-snug">
                {nicknameEditing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={nicknameInput}
                      onChange={(e) => setNicknameInput(e.target.value.slice(0, 32))}
                      maxLength={32}
                      placeholder={t('app.nicknamePlaceholder')}
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 text-white border border-slate-700 focus:outline-none focus:border-amber-500 text-center text-lg font-black"
                      onKeyDown={(e) => e.key === 'Enter' && handleNicknameSave()}
                    />
                    <div className="flex gap-2 justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          setNicknameEditing(false);
                          setNicknameInput(debugNickname ?? '');
                          setNicknameError('');
                        }}
                        className="px-3 py-1.5 rounded-lg text-base font-bold text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={handleNicknameSave}
                        disabled={nicknameSaving}
                        className="px-3 py-1.5 rounded-lg text-base font-bold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 transition-colors"
                      >
                        {nicknameSaving ? t('common.saving') : t('common.save')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p>
                    {/* 已有昵称：保留 “Sorry, 昵称” 与修改入口 */}
                    {debugNickname ? (
                      <>
                        <span className="text-2xl font-black text-white tracking-tight">
                          Sorry,&nbsp;{debugNickname}
                        </span>
                        <button
                          type="button"
                          onClick={() => setNicknameEditing(true)}
                          className="ml-2 text-base font-bold text-slate-500 hover:text-slate-300"
                        >
                          {t('settings.editNickname')}
                        </button>
                      </>
                    ) : (
                      /* 未设置昵称：整句改为可点击的 Set Your Name，点击后进入编辑 */
                      <button
                        type="button"
                        onClick={() => setNicknameEditing(true)}
                        className="text-2xl font-black tracking-tight text-amber-500 hover:text-amber-400"
                      >
                        {t('settings.setNickname')}
                      </button>
                    )}
                  </p>
                )}
                {nicknameError && (
                  <p className="text-red-400 text-base mt-1">{nicknameError}</p>
                )}
                {/* 调试用 account_id，按要求保持 11px，不跟上面的正文一起放大 */}
                <p className="text-[11px] text-slate-400 font-mono mt-1">
                  （{debugAccountId}）
                </p>
              </div>
            )}

            {/* i18n：标题含 HTML 标签，使用 Trans 组件渲染 */}
            <h2 className="text-2xl font-black text-white mb-2 tracking-tight">
                <Trans i18nKey="settings.cursedTitle">
                  YOU ARE <span className="text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]">CURSED</span>
                </Trans>
            </h2>
            <div className="space-y-1 px-2">
                <div className="text-base text-slate-300 font-medium leading-tight">
                    <div className="text-red-400 font-bold">{t('settings.ruleBlindGuess')}</div>
                    <span className="block sm:inline mt-1 sm:mt-0">
                        <Trans i18nKey="settings.ruleMine">
                          If a cell <span className="italic text-white">can</span> be a mine, it <span className="text-red-400 font-bold italic">is</span> a mine.
                        </Trans>
                    </span>
                </div>
                {/* 与上方 “你被诅咒了” 同一字号，这句话是规则里最重要的一句 */}
                <p className="text-amber-400 font-black tracking-tight uppercase text-2xl border-t border-slate-700 pt-2 mt-2 inline-block px-4">
                    {t('settings.rulePrayer')}
                </p>
            </div>
        </div>

        {/* 左边是难度，中间是棋盘，右边是加减雷和开始。不再套一层卡片，直接放在设置页底色上 */}
        <div className="shrink-0">
            <div className="flex items-center justify-center gap-3">
                <DifficultySelector
                    activeName={activePreset}
                    onChange={handlePresetClick}
                    options={difficulties}
                />
                <div className="diff-preview-slot">
                    <div className="relative">
                        <DifficultyBoardPreview rows={rows} cols={cols} mines={mines} />
                        {/* 只留双向箭头，不画按钮底和边框。向右、向上变大，向左、向下变小 */}
                        <button
                            type="button"
                            aria-label={t('settings.resizeBoard')}
                            title={t('settings.resizeBoard')}
                            onPointerDown={onResizePointerDown}
                            onPointerMove={onResizePointerMove}
                            onPointerUp={endResizeDrag}
                            onPointerCancel={endResizeDrag}
                            className="absolute top-0 right-0 z-10 flex translate-x-1/2 -translate-y-1/2 items-center justify-center w-8 h-8 text-slate-300 hover:text-white cursor-nesw-resize touch-none"
                        >
                            <MoveDiagonal2 size={18} />
                        </button>
                    </div>
                </div>
                <div className="flex flex-col items-center gap-2 shrink-0">
                    {/* 点一下改一颗，按住连发。touch-none 避免按住时把整页设置拖着滚 */}
                    <button
                        type="button"
                        aria-label={t('settings.fewerMines')}
                        disabled={mines <= minMines}
                        onPointerDown={onMinePointerDown(-1)}
                        onPointerUp={releaseMineHold}
                        onPointerCancel={releaseMineHold}
                        onLostPointerCapture={releaseMineHold}
                        onPointerLeave={onMinePointerLeave}
                        onKeyDown={onMineKeyDown(-1)}
                        onKeyUp={onMineKeyUp}
                        onClick={onMineClick(-1)}
                        className="flex items-center justify-center w-10 h-10 bg-slate-800 border border-slate-600 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 active:bg-slate-950 transition-colors disabled:opacity-40 disabled:pointer-events-none touch-none"
                    >
                        {/* 图标比原来大两号：16 → 18 → 20 */}
                        <Minus size={20} />
                    </button>
                    <button
                        type="button"
                        aria-label={t('settings.moreMines')}
                        disabled={mines >= maxMines}
                        onPointerDown={onMinePointerDown(1)}
                        onPointerUp={releaseMineHold}
                        onPointerCancel={releaseMineHold}
                        onLostPointerCapture={releaseMineHold}
                        onPointerLeave={onMinePointerLeave}
                        onKeyDown={onMineKeyDown(1)}
                        onKeyUp={onMineKeyUp}
                        onClick={onMineClick(1)}
                        className="flex items-center justify-center w-10 h-10 bg-slate-800 border border-slate-600 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 active:bg-slate-950 transition-colors disabled:opacity-40 disabled:pointer-events-none touch-none"
                    >
                        {/* 与减号同一档，大两号 */}
                        <Plus size={20} />
                    </button>
                    <button
                        type="button"
                        aria-label={t('settings.startNewGame')}
                        title={t('settings.startNewGame')}
                        onClick={handleApply}
                        className="flex items-center justify-center w-10 h-10 bg-amber-600 hover:bg-amber-500 text-white rounded-lg shadow-lg shadow-amber-900/20 transition-all active:scale-95"
                    >
                        {/* 确认勾比原来大一号：16 → 18 */}
                        <Check size={18} />
                    </button>
                </div>
            </div>
        </div>

        {error && (
            <div className="mt-4 flex items-center gap-2 text-red-400 text-base bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <AlertTriangle size={16} className="shrink-0" />
                <span>{error}</span>
            </div>
        )}
      </motion.div>
    </div>
  );
};
