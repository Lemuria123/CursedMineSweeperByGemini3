
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, LayoutGrid, Bomb, Grid3X3, Skull, Plus, Minus, AlertTriangle } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';
import { Difficulty } from '../types';
import { calculateRecommendedMines } from '../utils/gameLogic';
import { ensureAccount } from '../utils/auth';
import { setNickname } from '../utils/api';
import { DifficultySelector } from './DifficultySelector';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDifficulty: Difficulty;
  onDifficultyChange: (d: Difficulty) => void;
  difficulties: Difficulty[];
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentDifficulty,
  onDifficultyChange,
  difficulties,
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

  const MIN_DIM = 8;
  const MAX_ROWS = 25;
  const MAX_COLS = 25;

  useEffect(() => {
    if (isOpen) {
        setRows(currentDifficulty.rows);
        setCols(currentDifficulty.cols);
        setMines(currentDifficulty.mines);
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
      setMines(calculateRecommendedMines(rows, cols));
  }, [rows, cols]);

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
      setMines(d.mines);
  };

  if (!isOpen) return null;

  const minMines = Math.max(1, Math.floor(rows * cols * 0.15));
  const maxMines = Math.floor(rows * cols * 0.30);
  const recommended = calculateRecommendedMines(rows, cols);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative bg-slate-800 border-2 border-slate-600 rounded-2xl p-5 max-w-md w-full shadow-2xl flex flex-col max-h-[85vh] overflow-y-auto no-scrollbar select-text"
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
            className={`px-2 py-1 rounded text-xs font-bold transition-all ${
              i18n.language === 'zh' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t('settings.langZh')}
          </button>
          <button
            onClick={() => i18n.changeLanguage('en')}
            className={`px-2 py-1 rounded text-xs font-bold transition-all ${
              i18n.language === 'en' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t('settings.langEn')}
          </button>
        </div>

        {/* Cursed Header Section */}
        <div className="flex flex-col items-center text-center mb-4 pt-1 shrink-0">
            <div className="p-3 rounded-full bg-red-500/10 text-red-500 mb-3 border border-red-500/20 shadow-[0_0_20px_rgba(220,38,38,0.2)]">
                <Skull size={32} strokeWidth={2} />
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
                        className="px-3 py-1.5 rounded-lg text-sm font-bold text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={handleNicknameSave}
                        disabled={nicknameSaving}
                        className="px-3 py-1.5 rounded-lg text-sm font-bold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 transition-colors"
                      >
                        {nicknameSaving ? t('common.saving') : t('common.save')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p>
                    <span className="text-2xl font-black text-white tracking-tight">
                      Sorry,&nbsp;{debugNickname ?? t('settings.noNickname')}
                    </span>
                    {!debugNickname && (
                      <button
                        type="button"
                        onClick={() => setNicknameEditing(true)}
                        className="ml-2 text-xs font-bold text-amber-500 hover:text-amber-400"
                      >
                        {t('settings.setNickname')}
                      </button>
                    )}
                    {debugNickname && (
                      <button
                        type="button"
                        onClick={() => setNicknameEditing(true)}
                        className="ml-2 text-xs font-bold text-slate-500 hover:text-slate-300"
                      >
                        {t('settings.editNickname')}
                      </button>
                    )}
                  </p>
                )}
                {nicknameError && (
                  <p className="text-red-400 text-xs mt-1">{nicknameError}</p>
                )}
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
                <p className="text-amber-400 font-bold tracking-wide uppercase text-xs border-t border-slate-700 pt-2 mt-2 inline-block px-4">
                    {t('settings.rulePrayer')}
                </p>
            </div>
        </div>

        {/* Quick Presets */}
        <div className="mb-5 shrink-0">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 text-center">
                {t('settings.selectDifficulty')}
            </label>
            <DifficultySelector 
                activeName={activePreset}
                onChange={handlePresetClick}
                options={difficulties}
            />
        </div>

        {/* Customizer */}
        <div className="space-y-4 bg-slate-900/50 p-4 rounded-xl border border-slate-700 shrink-0">
            {/* Dimensions */}
            <div className="flex gap-4">
                <div className="flex-1">
                    <label className="flex items-center gap-2 text-slate-400 text-xs uppercase font-bold mb-2">
                        <LayoutGrid size={14} /> {t('settings.rows')}
                    </label>
                    <div className="flex items-stretch">
                        <button
                            onClick={() => setRows(r => Math.max(MIN_DIM, r - 1))}
                            className="flex items-center justify-center w-9 bg-slate-800 border border-slate-600 rounded-l-lg text-slate-400 hover:text-white hover:bg-slate-700 active:bg-slate-950 transition-colors"
                        >
                            <Minus size={14} />
                        </button>
                        <input
                            type="number"
                            value={rows}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val)) setRows(val);
                            }}
                            className="w-full bg-slate-800 border-y border-slate-600 px-2 py-2 text-white font-mono text-center focus:border-amber-500 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]"
                        />
                        <button
                            onClick={() => setRows(r => Math.min(MAX_ROWS, r + 1))}
                            className="flex items-center justify-center w-9 bg-slate-800 border border-slate-600 rounded-r-lg text-slate-400 hover:text-white hover:bg-slate-700 active:bg-slate-950 transition-colors"
                        >
                            <Plus size={14} />
                        </button>
                    </div>
                </div>
                <div className="flex-1">
                    <label className="flex items-center gap-2 text-slate-400 text-xs uppercase font-bold mb-2">
                        <Grid3X3 size={14} /> {t('settings.cols')}
                    </label>
                    <div className="flex items-stretch">
                        <button
                            onClick={() => setCols(c => Math.max(MIN_DIM, c - 1))}
                            className="flex items-center justify-center w-9 bg-slate-800 border border-slate-600 rounded-l-lg text-slate-400 hover:text-white hover:bg-slate-700 active:bg-slate-950 transition-colors"
                        >
                            <Minus size={14} />
                        </button>
                        <input
                            type="number"
                            value={cols}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val)) setCols(val);
                            }}
                            className="w-full bg-slate-800 border-y border-slate-600 px-2 py-2 text-white font-mono text-center focus:border-amber-500 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]"
                        />
                        <button
                            onClick={() => setCols(c => Math.min(MAX_COLS, c + 1))}
                            className="flex items-center justify-center w-9 bg-slate-800 border border-slate-600 rounded-r-lg text-slate-400 hover:text-white hover:bg-slate-700 active:bg-slate-950 transition-colors"
                        >
                            <Plus size={14} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Mines Slider */}
            <div>
                 <div className="flex justify-between items-end mb-2">
                    <label className="flex items-center gap-2 text-slate-400 text-xs uppercase font-bold">
                        <Bomb size={14} /> {t('settings.curseDensity')}
                    </label>
                    <span className={`text-xs font-mono font-bold ${mines >= recommended ? 'text-red-400' : 'text-emerald-400'}`}>
                        {t('settings.mines', { count: mines, pct: Math.round((mines / (rows * cols)) * 100) })}
                    </span>
                 </div>
                 <input 
                    type="range"
                    min={minMines} max={maxMines}
                    value={mines}
                    onChange={(e) => setMines(parseInt(e.target.value))}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                 />
            </div>
        </div>

        {error && (
            <div className="mt-4 flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <AlertTriangle size={16} className="shrink-0" />
                <span>{error}</span>
            </div>
        )}
        <button
            onClick={handleApply}
            className="mt-6 w-full py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl shadow-lg shadow-amber-900/20 transition-all active:scale-95 shrink-0"
        >
            {t('settings.startNewGame')}
        </button>
      </motion.div>
    </div>
  );
};
