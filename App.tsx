
import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, BookOpen } from 'lucide-react';
import { GameState, Difficulty, GameStatus, CellStatus } from './types';
import { createEmptyGrid, placeMines, revealCellLogic, revealAllMines, checkWin, getChordTargets, calculateRecommendedMines, getNeighbors } from './utils/gameLogic';
import { createRNG, hashSeed } from './shared/deterministicPlaceMines';
import { Board } from './components/Board';
import { GameHeader } from './components/GameHeader';
import { SettingsModal } from './components/SettingsModal';
import { GrimoireModal } from './components/LeaderboardModal'; 
import { Modal } from './components/Modal';
import { GameRecorder } from './utils/recorder';
import { ensureAccount } from './utils/auth';
import { setNickname, getNonce, submitGame, getConfig } from './utils/api';
import { encrypt } from './utils/encrypt';
import { SKIN_STORAGE_KEY, SkinId, isSkinId } from './utils/skins';

// Updated logic: Default mines are now calculated based on the new density formula.
// Easy: 9x9 (81) -> ~21 mines
// Medium: 16x16 (256) -> ~58 mines
// Hard: 25x16 (400) -> ~88 mines
const DIFFICULTIES: Difficulty[] = [
  { name: 'Easy', rows: 9, cols: 9, mines: calculateRecommendedMines(9, 9) },
  { name: 'Medium', rows: 16, cols: 16, mines: calculateRecommendedMines(16, 16) },
  { name: 'Hard', rows: 25, cols: 16, mines: calculateRecommendedMines(25, 16) },
];

const DRAG_THRESHOLD = 5;

const App: React.FC = () => {
  const { t } = useTranslation();
  const [difficulty, setDifficulty] = useState<Difficulty>(DIFFICULTIES[0]);
  // 界面选择写在本地，刷新后还是上次那一套；读失败就用原来的诅咒界面
  const [skin, setSkin] = useState<SkinId>(() => {
    try {
      const saved = localStorage.getItem(SKIN_STORAGE_KEY);
      return isSkinId(saved) ? saved : 'cursed';
    } catch {
      return 'cursed';
    }
  });
  const handleSkinChange = (next: SkinId) => {
    setSkin(next);
    try {
      localStorage.setItem(SKIN_STORAGE_KEY, next);
    } catch {
      // 写不进去时，这次打开期间的选择仍然有效
    }
  };
  const [showSettings, setShowSettings] = useState(false);
  const [showGrimoire, setShowGrimoire] = useState(false);
  
  const [gameState, setGameState] = useState<GameState>({
    grid: createEmptyGrid(DIFFICULTIES[0].rows, DIFFICULTIES[0].cols),
    status: 'idle',
    difficulty: DIFFICULTIES[0],
    flagsUsed: 0,
    prayersUsed: 0,
    isPraying: false,
  });

  const [isGameOverModalOpen, setIsGameOverModalOpen] = useState(false);
  const [isPrayerFailure, setIsPrayerFailure] = useState(false);

  // Transient UI state for flashing cells on invalid chord click
  const [highlightedCells, setHighlightedCells] = useState<string[]>([]);

  // Server integration
  const recorderRef = useRef<GameRecorder>(new GameRecorder());
  // 从后端配置读取的祈祷奖励阈值（默认 0 = ACE 模式）
  // 使用 ref 避免回调函数中的闭包陈旧问题
  const prayerRewardThresholdRef = useRef<number>(0);
  // 胜利后的账号注册和成绩提交是异步的。组件卸载后此标记为 false，避免再打开昵称框。
  const isMountedRef = useRef(true);
  const [showNicknamePrompt, setShowNicknamePrompt] = useState(false);
  const [nickname, setNicknameLocal] = useState('');
  const [nicknameError, setNicknameError] = useState('');

  // 启动时注册账号（离线时静默失败，ACE 时会重试）
  useEffect(() => {
    isMountedRef.current = true;
    ensureAccount().catch(() => {
      // Offline — will retry on next ACE
    });

    // 启动时从后端读取配置（祈祷奖励阈值等）
    getConfig().then(config => {
      const threshold = parseInt(config.prayer_reward_threshold || '0', 10);
      prayerRewardThresholdRef.current = isNaN(threshold) ? 0 : threshold;
    }).catch(() => {
      // 离线或读取失败时维持默认值 0（ACE 模式）
    });

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // --- Drag to Scroll State ---
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDownRef = useRef(false);
  const isDraggingRef = useRef(false);
  const cspRngRef = useRef<(() => number) | null>(null); // seeded CSP RNG, matches backend
  const startPosRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  // 将棋盘滚动到可视区域中心；同步执行 scrollTo，以便 useLayoutEffect 在绘制前完成居中
  const centerBoard = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const centerX = (container.scrollWidth - container.clientWidth) / 2;
    const centerY = (container.scrollHeight - container.clientHeight) / 2;
    container.scrollTo({ left: centerX, top: centerY, behavior: 'auto' });
  }, []);

  // Initialize Game
  const initGame = useCallback((diff: Difficulty = difficulty) => {
    recorderRef.current = new GameRecorder();
    setGameState({
      grid: createEmptyGrid(diff.rows, diff.cols),
      status: 'idle',
      difficulty: diff,
      flagsUsed: 0,
      prayersUsed: 0,
      isPraying: false,
    });
    setIsGameOverModalOpen(false);
    setIsPrayerFailure(false);
    setHighlightedCells([]);
    
    // Trigger centering after a short delay to allow React to render the new grid size
    setTimeout(centerBoard, 50);
  }, [difficulty, centerBoard]);

  // 页面挂载和窗口尺寸变化时居中棋盘（使用 useLayoutEffect 在浏览器绘制前同步完成，避免视觉抖动）
  useLayoutEffect(() => {
    centerBoard();
    window.addEventListener('resize', centerBoard);
    return () => window.removeEventListener('resize', centerBoard);
  }, [centerBoard]);

  // Difficulty Change Handler
  const handleDifficultyChange = (newDiff: Difficulty) => {
    setDifficulty(newDiff);
    initGame(newDiff);
  };

  // Handle Game Over Modal Visibility
  useEffect(() => {
    if (gameState.status === 'won' || gameState.status === 'lost') {
        // Small delay to allow explosion animation or final reveal
        setTimeout(() => setIsGameOverModalOpen(true), 500);
    } else {
        setIsGameOverModalOpen(false);
    }
  }, [gameState.status]);

  const handleTogglePrayer = () => {
      if (gameState.status !== 'playing' && gameState.status !== 'idle') return;
      setGameState(prev => ({ ...prev, isPraying: !prev.isPraying }));
  };

  // Click Handler
  const handleCellClick = (row: number, col: number) => {
    if (gameState.status === 'won' || gameState.status === 'lost') return;

    let newGrid = [...gameState.grid];
    let newStatus: GameStatus = gameState.status;
    let newPrayersUsed = gameState.prayersUsed;
    let newIsPraying = gameState.isPraying;

    const cell = newGrid[row][col];
    if (cell.status === 'flagged') return;

    // First Click: Generate Mines (seeded RNG = same layout as backend)
    if (gameState.status === 'idle') {
      const seedSuffix = String(Date.now());
      const mineSeed = `${gameState.difficulty.rows}-${gameState.difficulty.cols}-${gameState.difficulty.mines}-${row}-${col}-${seedSuffix}`;
      cspRngRef.current = createRNG(hashSeed(mineSeed + '-csp'));
      newGrid = placeMines(newGrid, gameState.difficulty.mines, row, col, createRNG(hashSeed(mineSeed)));
      newStatus = 'playing';
      recorderRef.current.start(row, col, seedSuffix);
    }

    // Capture prayer state before logic runs to determine if it was a failure
    const wasPrayingActive = newIsPraying;

    // Logic for Revealed vs Hidden cells
    let actionTaken = false;
    if (cell.status === 'revealed') {
        // --- CHORDING LOGIC ---
        const targets = getChordTargets(newGrid, row, col);
        
        if (targets.length > 0) {
            actionTaken = true;
            // Record chord with prayer state so backend can replicate CSP
            recorderRef.current.record('chord', row, col, newIsPraying);
            for (const target of targets) {
                const result = revealCellLogic(newGrid, target.r, target.c, false, newIsPraying, cspRngRef.current!);
                newGrid = result.grid; 
                if (result.prayerConsumed) newPrayersUsed++;
                if (result.exploded) {
                    newStatus = 'lost';
                    newGrid = revealAllMines(newGrid);
                    newGrid[target.r][target.c].isExploded = true;
                    break;
                }
            }
        } else {
            // Check if we should flash neighbors (Feedback for "Not enough flags")
            const neighborMines = cell.neighborMines;
            if (neighborMines > 0) {
                // Count current flags around logic is slightly duplicated from getChordTargets but that returns [] if not matching.
                // We want to detect the case where flags != neighborMines
                const neighbors = getNeighbors(newGrid, row, col);
                const flags = neighbors.filter(n => newGrid[n.r][n.c].status === 'flagged').length;
                
                if (flags !== neighborMines) {
                    // Flash surrounding HIDDEN cells
                    const hiddenNeighbors = neighbors
                        .filter(n => newGrid[n.r][n.c].status === 'hidden')
                        .map(n => newGrid[n.r][n.c].id);
                    
                    if (hiddenNeighbors.length > 0) {
                        setHighlightedCells(hiddenNeighbors);
                        setTimeout(() => setHighlightedCells([]), 150);
                    }
                }
            }
        }
    } else {
        // --- STANDARD REVEAL LOGIC ---
        actionTaken = true;
        // first_reveal is already recorded by recorderRef.current.start(),
        // do not record a second reveal for the same cell
        if (gameState.status !== 'idle') {
          recorderRef.current.record('reveal', row, col, newIsPraying);
        }
        const result = revealCellLogic(newGrid, row, col, gameState.status === 'idle', newIsPraying, cspRngRef.current!);
        newGrid = result.grid;
        if (result.prayerConsumed) newPrayersUsed++;
        if (result.exploded) {
            newStatus = 'lost';
            newGrid = revealAllMines(newGrid);
            newGrid[row][col].isExploded = true;
        }
    }

    // Auto-disable prayer after an action
    if (newIsPraying && actionTaken) {
        newIsPraying = false;
    }

    // Detect Prayer Failure
    if (newStatus === 'lost' && wasPrayingActive) {
        setIsPrayerFailure(true);
    }

    // --- CHECK WIN CONDITION ---
    if (newStatus !== 'lost' && checkWin(newGrid)) {
      newStatus = 'won';
      newGrid = newGrid.map(r => r.map(c => c.isMine ? { ...c, status: 'flagged' } : c));
      
      // 祈祷次数在阈值内才提交成绩（默认 0 = 零祈祷）。不再发放宝物。
      // 账号还没有昵称时，在这次合格通关后询问排行榜昵称。
      const threshold = prayerRewardThresholdRef.current;
      if (newPrayersUsed <= threshold) {
        // 棋盘胜负必须在这次点击里同步落下，网络请求不能挡住翻开结果。
        // 提交放在立即执行的异步函数里：失败写日志，卸载后不再 setState。
        const prayersUsedForSubmit = newPrayersUsed;
        void (async () => {
          try {
            const { accountId, nickname: existingNickname } = await ensureAccount();
            await submitToServer(accountId, prayersUsedForSubmit);
            // 等待期间玩家可能已经离开页面，此时昵称框没有可附着的组件
            if (!isMountedRef.current) return;
            if (!existingNickname) {
              setNicknameError('');
              setShowNicknamePrompt(true);
            }
          } catch (error) {
            console.error('[ace] 合格通关成绩提交失败:', error);
          }
        })();
      }
    }

    // Always update game state regardless of win/loss
    setGameState(prev => ({
      ...prev,
      grid: newGrid,
      status: newStatus,
      flagsUsed: newStatus === 'won' ? prev.difficulty.mines : prev.flagsUsed, 
      prayersUsed: newPrayersUsed,
      isPraying: newIsPraying
    }));
  };

  // Right Click (Flag) Handler
  const handleRightClick = (row: number, col: number, e: React.MouseEvent) => {
    e.preventDefault();
    if (gameState.status !== 'playing' && gameState.status !== 'idle') return;

    const cell = gameState.grid[row][col];
    if (cell.status === 'revealed') return;

    const newStatus: CellStatus = cell.status === 'flagged' ? 'hidden' : 'flagged';
    const flagsChange = newStatus === 'flagged' ? 1 : -1;

    // Record flag action
    recorderRef.current.record('flag', row, col);

    // Only clone the changed cell — preserves React.memo for all other cells
    setGameState(prev => ({
      ...prev,
      grid: prev.grid.map((r, ri) =>
        ri === row
          ? r.map((c, ci) => (ci === col ? { ...c, status: newStatus } : c))
          : r
      ),
      flagsUsed: prev.flagsUsed + flagsChange
    }));
  };

  // --- Drag Handling Logic ---
  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isDownRef.current || !scrollContainerRef.current) return;
    const dx = e.clientX - startPosRef.current.x;
    const dy = e.clientY - startPosRef.current.y;
    if (!isDraggingRef.current) {
        if (Math.sqrt(dx*dx + dy*dy) > DRAG_THRESHOLD) isDraggingRef.current = true;
    }
    if (isDraggingRef.current) {
        scrollContainerRef.current.scrollLeft = startPosRef.current.scrollLeft - dx;
        scrollContainerRef.current.scrollTop = startPosRef.current.scrollTop - dy;
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    isDownRef.current = false;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerUp);
  }, [handlePointerMove]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!scrollContainerRef.current) return;
    isDownRef.current = true;
    isDraggingRef.current = false;
    startPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: scrollContainerRef.current.scrollLeft,
      scrollTop: scrollContainerRef.current.scrollTop,
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  // ── Server submission helper ──
  const submitToServer = useCallback(async (accountId: string, prayersUsed: number) => {
    const nonceData = await getNonce(accountId);
    const payload = recorderRef.current.buildPayload(
      nonceData.nonce,
      gameState.difficulty.rows,
      gameState.difficulty.cols,
      gameState.difficulty.mines,
      prayersUsed,
    );
    const encrypted = await encrypt(JSON.stringify(payload));
    await submitGame(accountId, encrypted);
  }, [gameState.difficulty]);

  const handleNicknameSubmit = async () => {
    const trimmed = nickname.trim();
    if (!trimmed) return;
    setNicknameError('');
    try {
      const { accountId } = await ensureAccount();
      await setNickname(accountId, trimmed);
      setShowNicknamePrompt(false);
      setNicknameLocal('');
      // Record already submitted by the win callback — no duplicate submit needed
    } catch {
      setNicknameError(t('common.saveFailed'));
    }
  };

  const handleNicknameSkip = () => {
    setShowNicknamePrompt(false);
    setNicknameLocal('');
    setNicknameError('');
  };
  return (
    <div data-skin={skin} className="h-screen w-screen bg-slate-900 flex flex-col relative overflow-hidden">
      
      {/* Fixed Background Layer - Reverted to Red/Black Cursed Theme */}
      <div className="skin-bg absolute inset-0 z-0 pointer-events-none bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-900/30 via-slate-900 to-black" />

      {/* Prayer Overlay */}
      {gameState.isPraying && (
          <div className="absolute inset-0 z-0 pointer-events-none border-[10px] border-purple-500/20 animate-pulse shadow-[inset_0_0_100px_rgba(168,85,247,0.2)]" />
      )}

      {/* Fixed Header Section */}
      <div className="z-20 w-full flex-none p-4 pb-0 flex flex-col items-center pointer-events-none">
        <div className="pointer-events-auto w-full max-w-2xl">
            <GameHeader 
            minesLeft={gameState.difficulty.mines - gameState.flagsUsed} 
            status={gameState.status}
            prayersUsed={gameState.prayersUsed}
            isPraying={gameState.isPraying}
            onReset={() => initGame()}
            onTogglePrayer={handleTogglePrayer}
            >
              {/* 标题居中。记录、设置钉在左右，不占文档流，也不再套圆形底 */}
              <div className="relative flex items-center justify-center min-h-10">
                <button
                    onClick={() => setShowGrimoire(true)}
                    className="skin-tool absolute left-0 top-1/2 z-10 -translate-y-1/2 p-1 text-amber-500 hover:text-amber-300 transition-colors"
                    title={t('app.grimoireTooltip')}
                >
                    <BookOpen size={22} />
                </button>

                <h1 className="skin-title text-xl sm:text-2xl md:text-3xl font-extrabold text-transparent bg-clip-text tracking-tight bg-gradient-to-r from-red-500 to-orange-500 text-center">
                  {t('app.title')}
                </h1>

                <button
                    onClick={() => setShowSettings(true)}
                    className="skin-tool absolute right-0 top-1/2 z-10 -translate-y-1/2 p-1 text-slate-400 hover:text-white transition-colors"
                    title={t('app.settingsTooltip')}
                >
                    <Settings size={22} />
                </button>
              </div>
            </GameHeader>
        </div>
      </div>

      {/* Scrollable Game Board Area */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-auto cursor-grab active:cursor-grabbing relative z-10 w-full"
        onPointerDown={handlePointerDown}
      >
          {/* 顶部不再留白。滚到最上时棋盘就贴着顶栏，不会再多出一截空档 */}
          <div className="min-w-fit min-h-fit px-8 pb-8 lg:px-12 lg:pb-12 m-auto w-fit h-fit block">
            <Board 
                grid={gameState.grid} 
                gameStatus={gameState.status}
                onCellClick={handleCellClick}
                onCellRightClick={handleRightClick}
                highlightedCells={highlightedCells}
            />
          </div>
      </div>

      {isGameOverModalOpen && (
          <Modal 
            status={gameState.status} 
            prayersUsed={gameState.prayersUsed}
            isPrayerFailure={isPrayerFailure}
            onRestart={() => initGame()} 
            onClose={() => setIsGameOverModalOpen(false)}
          />
      )}

      <SettingsModal 
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        currentDifficulty={difficulty}
        onDifficultyChange={handleDifficultyChange}
        difficulties={DIFFICULTIES}
        skin={skin}
        onSkinChange={handleSkinChange}
      />

      <GrimoireModal
        isOpen={showGrimoire}
        onClose={() => setShowGrimoire(false)}
        difficulties={DIFFICULTIES}
      />

      {/* Nickname prompt on first ACE */}
      {showNicknamePrompt && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-slate-900 border-2 border-amber-900/50 rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center">
            <h2 className="text-2xl font-bold text-amber-500 mb-2">{t('app.aceComplete')}</h2>
            <p className="text-slate-400 mb-6 text-sm">{t('app.enterNickname')}</p>
            <input
              type="text"
              value={nickname}
              onChange={e => setNicknameLocal(e.target.value.slice(0, 32))}
              placeholder={t('app.nicknamePlaceholder')}
              maxLength={32}
              className="w-full px-4 py-3 rounded-lg bg-slate-800 text-white border border-slate-700 focus:outline-none focus:border-amber-500 mb-2"
              onKeyDown={e => e.key === 'Enter' && handleNicknameSubmit()}
              autoFocus
            />
            {nicknameError && (
              <p className="text-red-400 text-sm mb-4">{nicknameError}</p>
            )}
            {!nicknameError && <div className="mb-4" />}
            <div className="flex gap-3">
              <button
                onClick={handleNicknameSkip}
                className="flex-1 py-3 rounded-xl font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                {t('app.skip')}
              </button>
              <button
                onClick={handleNicknameSubmit}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-amber-600 hover:bg-amber-500 transition-colors shadow-lg"
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
