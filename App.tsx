
import React, { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { Settings, BookOpen } from 'lucide-react';
import { GameState, Difficulty, GameStatus, CursedReward, CellStatus } from './types';
import { createEmptyGrid, placeMines, revealCellLogic, revealAllMines, checkWin, getChordTargets, calculateRecommendedMines, getNeighbors } from './utils/gameLogic';
import { createRNG, hashSeed } from './shared/deterministicPlaceMines';
import { hasRewardForDifficulty, saveReward } from './utils/storage';
import { fetchCursedReward } from './utils/cursedContent';
import { Board } from './components/Board';
import { GameHeader } from './components/GameHeader';
import { SettingsModal } from './components/SettingsModal';
import { GrimoireModal } from './components/LeaderboardModal'; 
import { Modal } from './components/Modal';
import { GameRecorder } from './utils/recorder';
import { getAccountId } from './utils/auth';
import { register, getAccount, setNickname, getNonce, submitGame } from './utils/api';
import { encrypt } from './utils/encrypt';

// Updated logic: Default mines are now calculated based on the new density formula.
// Easy: 9x9 (81) -> ~21 mines
// Medium: 16x16 (256) -> ~58 mines
// Hard: 16x30 (480) -> ~105 mines
const DIFFICULTIES: Difficulty[] = [
  { name: 'Easy', rows: 9, cols: 9, mines: calculateRecommendedMines(9, 9) },
  { name: 'Medium', rows: 16, cols: 16, mines: calculateRecommendedMines(16, 16) },
  { name: 'Hard', rows: 25, cols: 16, mines: calculateRecommendedMines(25, 16) },
];

const DRAG_THRESHOLD = 5;

const App: React.FC = () => {
  const [difficulty, setDifficulty] = useState<Difficulty>(DIFFICULTIES[0]);
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

  // New State for Just Unlocked Reward
  const [newUnlockedReward, setNewUnlockedReward] = useState<CursedReward | null>(null);

  // Transient UI state for flashing cells on invalid chord click
  const [highlightedCells, setHighlightedCells] = useState<string[]>([]);

  // Server integration
  const recorderRef = useRef<GameRecorder>(new GameRecorder());
  const [showNicknamePrompt, setShowNicknamePrompt] = useState(false);
  const [pendingAceReward, setPendingAceReward] = useState<CursedReward | null>(null);
  const [nickname, setNicknameLocal] = useState('');
  const [accountNickname, setAccountNickname] = useState<string | null>(null);

  // Register on mount
  useEffect(() => {
    const accountId = getAccountId();
    register('auto', accountId).then(info => {
      setAccountNickname(info.nickname);
    }).catch(() => {
      // Offline — will retry on next ACE
    });
  }, []);

  // --- Drag to Scroll State ---
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDownRef = useRef(false);
  const isDraggingRef = useRef(false);
  const cspRngRef = useRef<(() => number) | null>(null); // seeded CSP RNG, matches backend
  const startPosRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  // Center the board logic
  const centerBoard = useCallback(() => {
    if (scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        // Use requestAnimationFrame to ensure layout is complete
        requestAnimationFrame(() => {
            const centerX = (container.scrollWidth - container.clientWidth) / 2;
            const centerY = (container.scrollHeight - container.clientHeight) / 2;
            container.scrollTo({ left: centerX, top: centerY, behavior: 'auto' });
        });
    }
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
    setNewUnlockedReward(null);
    setHighlightedCells([]);
    
    // Trigger centering after a short delay to allow React to render the new grid size
    setTimeout(centerBoard, 50);
  }, [difficulty, centerBoard]);

  // Center on mount and resize
  useEffect(() => {
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
      
      // Always submit record to server (all wins, ACE or not)
      register('auto', getAccountId()).then(() =>
        submitToServer(null, newPrayersUsed)
      ).catch(() => {});

      // ACE reward: triggered when mines >= recommended (always true for default difficulties)
      if (newPrayersUsed === 0 && gameState.difficulty.mines >= calculateRecommendedMines(gameState.difficulty.rows, gameState.difficulty.cols) && !hasRewardForDifficulty(gameState.difficulty)) {
          fetchCursedReward(gameState.difficulty).then(async (reward) => {
              saveReward(reward);
              setNewUnlockedReward(reward);
              setPendingAceReward(reward);
              // Check nickname for ACE leaderboard (account already registered by submit above)
              try {
                const accountId = getAccountId();
                const info = await getAccount(accountId);
                if (!info.nickname) {
                  setShowNicknamePrompt(true);
                }
              } catch { /* offline — will retry later */ }
          });
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
  const submitToServer = useCallback(async (reward: CursedReward | null, prayersUsed: number) => {
    const accountId = getAccountId();
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
    try {
      const accountId = getAccountId();
      await setNickname(accountId, trimmed);
      setAccountNickname(trimmed);
      setShowNicknamePrompt(false);
      setNicknameLocal('');
      // Record already submitted by the win callback — no duplicate submit needed
    } catch {
      setShowNicknamePrompt(false);
    }
  };

  const handleNicknameSkip = () => {
    setShowNicknamePrompt(false);
    setNicknameLocal('');
    setPendingAceReward(null);
  };

  return (
    <div className="h-screen w-screen bg-slate-900 flex flex-col relative overflow-hidden">
      
      {/* Fixed Background Layer - Reverted to Red/Black Cursed Theme */}
      <div className="absolute inset-0 z-0 pointer-events-none transition-all duration-1000 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-900/30 via-slate-900 to-black" />

      {/* Prayer Overlay */}
      {gameState.isPraying && (
          <div className="absolute inset-0 z-0 pointer-events-none border-[10px] border-purple-500/20 animate-pulse shadow-[inset_0_0_100px_rgba(168,85,247,0.2)]" />
      )}

      {/* Fixed Header Section */}
      <div className="z-20 w-full flex-none p-4 pb-0 flex flex-col items-center pointer-events-none">
        <div className="pointer-events-auto w-full max-w-2xl">
             <div className="flex items-center gap-3 mb-4 justify-between">
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                         <h1 className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text drop-shadow-sm tracking-tight bg-gradient-to-r from-red-500 to-orange-500">
                           CURSED MINES
                        </h1>
                    </div>
                </div>
                
                <div className="flex gap-2">
                    <button 
                        onClick={() => setShowGrimoire(true)}
                        className="p-2 rounded-full bg-slate-800 text-amber-500 hover:text-amber-300 hover:bg-slate-700 transition-all border border-slate-700 shadow-lg group relative"
                        title="Grimoire (Collection)"
                    >
                        <BookOpen size={20} />
                    </button>

                    <button 
                        onClick={() => setShowSettings(true)}
                        className="p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all border border-slate-700 shadow-lg relative"
                        title="Settings"
                    >
                        <Settings size={20} />
                    </button>
                </div>
            </div>

            <GameHeader 
            minesLeft={gameState.difficulty.mines - gameState.flagsUsed} 
            status={gameState.status}
            prayersUsed={gameState.prayersUsed}
            isPraying={gameState.isPraying}
            onReset={() => initGame()}
            onTogglePrayer={handleTogglePrayer}
            />
        </div>
      </div>

      {/* Scrollable Game Board Area */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-auto custom-scrollbar cursor-grab active:cursor-grabbing relative z-10 w-full"
        onPointerDown={handlePointerDown}
      >
          <div className="min-w-fit min-h-fit p-8 lg:p-12 m-auto w-fit h-fit block">
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
            newReward={newUnlockedReward}
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
            <h2 className="text-2xl font-bold text-amber-500 mb-2">ACE Complete!</h2>
            <p className="text-slate-400 mb-6 text-sm">Enter a nickname for the leaderboard.</p>
            <input
              type="text"
              value={nickname}
              onChange={e => setNicknameLocal(e.target.value.slice(0, 32))}
              placeholder="Nickname"
              maxLength={32}
              className="w-full px-4 py-3 rounded-lg bg-slate-800 text-white border border-slate-700 focus:outline-none focus:border-amber-500 mb-4"
              onKeyDown={e => e.key === 'Enter' && handleNicknameSubmit()}
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={handleNicknameSkip}
                className="flex-1 py-3 rounded-xl font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Skip
              </button>
              <button
                onClick={handleNicknameSubmit}
                className="flex-1 py-3 rounded-xl font-bold text-white bg-amber-600 hover:bg-amber-500 transition-colors shadow-lg"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
