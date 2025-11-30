import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, Trophy, Skull } from 'lucide-react';
import { GameState, Difficulty, CellData, GameStatus, GameMode } from './types';
import { createEmptyGrid, placeMines, revealCellLogic, revealAllMines, checkWin } from './utils/gameLogic';
import { saveGameRecord, isNewBest } from './utils/storage';
import { Board } from './components/Board';
import { GameHeader } from './components/GameHeader';
import { SettingsModal } from './components/SettingsModal';
import { LeaderboardModal } from './components/LeaderboardModal';
import { Modal } from './components/Modal';

const DIFFICULTIES: Difficulty[] = [
  { name: 'Easy', rows: 9, cols: 9, mines: 10 },
  { name: 'Medium', rows: 16, cols: 16, mines: 40 },
  { name: 'Hard', rows: 16, cols: 30, mines: 99 },
];

const STARTING_PRAYERS = 3;
const DRAG_THRESHOLD = 5; // Reduced threshold for better sensitivity

const App: React.FC = () => {
  const [difficulty, setDifficulty] = useState<Difficulty>(DIFFICULTIES[0]);
  const [gameMode, setGameMode] = useState<GameMode>('classic');
  const [showSettings, setShowSettings] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  
  const [gameState, setGameState] = useState<GameState>({
    grid: createEmptyGrid(DIFFICULTIES[0].rows, DIFFICULTIES[0].cols),
    status: 'idle',
    difficulty: DIFFICULTIES[0],
    mode: 'classic',
    flagsUsed: 0,
    timeElapsed: 0,
    prayersLeft: STARTING_PRAYERS,
    isPraying: false,
  });

  const [isBestTime, setIsBestTime] = useState(false);
  const [timerInterval, setTimerInterval] = useState<number | null>(null);

  // --- Drag to Scroll State ---
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDownRef = useRef(false);
  const isDraggingRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  // Initialize Game
  const initGame = useCallback((diff: Difficulty = difficulty, mode: GameMode = gameMode) => {
    if (timerInterval) clearInterval(timerInterval);
    setGameState({
      grid: createEmptyGrid(diff.rows, diff.cols),
      status: 'idle',
      difficulty: diff,
      mode: mode,
      flagsUsed: 0,
      timeElapsed: 0,
      prayersLeft: STARTING_PRAYERS,
      isPraying: false,
    });
    setTimerInterval(null);
    setIsBestTime(false);
    
    // Center the board on init if possible
    if (scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        setTimeout(() => {
            const centerX = (container.scrollWidth - container.clientWidth) / 2;
            const centerY = (container.scrollHeight - container.clientHeight) / 2;
            container.scrollTo({ left: centerX, top: centerY, behavior: 'smooth' });
        }, 100);
    }
  }, [difficulty, gameMode, timerInterval]);

  // Difficulty/Mode Change Handler
  const handleSettingsChange = (newDiff: Difficulty, newMode: GameMode) => {
    setDifficulty(newDiff);
    setGameMode(newMode);
    initGame(newDiff, newMode);
  };

  // Timer Logic
  useEffect(() => {
    if (gameState.status === 'playing' && !timerInterval) {
      const id = window.setInterval(() => {
        setGameState(prev => ({ ...prev, timeElapsed: prev.timeElapsed + 1 }));
      }, 1000);
      setTimerInterval(id);
    } else if (gameState.status !== 'playing' && timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
    }
    return () => {
      if (timerInterval) clearInterval(timerInterval);
    };
  }, [gameState.status, timerInterval]);

  const handleTogglePrayer = () => {
      if (gameState.status !== 'playing' && gameState.status !== 'idle') return;
      if (gameState.prayersLeft <= 0 && !gameState.isPraying) return;
      
      setGameState(prev => ({
          ...prev,
          isPraying: !prev.isPraying
      }));
  };

  // Click Handler
  const handleCellClick = (row: number, col: number) => {
    if (gameState.status === 'won' || gameState.status === 'lost') return;

    let newGrid = [...gameState.grid];
    let newStatus: GameStatus = gameState.status;
    let isFirstClick = false;

    const cell = newGrid[row][col];

    if (cell.status === 'flagged') return;

    // First Click: Generate Mines
    if (gameState.status === 'idle') {
      newGrid = placeMines(newGrid, gameState.difficulty.mines, row, col);
      newStatus = 'playing';
      isFirstClick = true;
    }

    // Reveal Logic
    const { grid: revealedGrid, exploded, prayerConsumed } = revealCellLogic(
      newGrid, 
      row, 
      col, 
      gameState.mode, 
      isFirstClick,
      gameState.isPraying
    );
    newGrid = revealedGrid;

    // Manage Prayer State
    let newPrayersLeft = gameState.prayersLeft;
    let newIsPraying = gameState.isPraying;

    if (prayerConsumed) {
        newPrayersLeft = Math.max(0, newPrayersLeft - 1);
        newIsPraying = false; 
    } else if (gameState.isPraying && !exploded) {
        newIsPraying = false; 
    }

    if (exploded) {
      newStatus = 'lost';
      newGrid = revealAllMines(newGrid);
      newGrid[row][col].isExploded = true;
    } else if (checkWin(newGrid)) {
      newStatus = 'won';
      newGrid = newGrid.map(r => r.map(c => c.isMine ? { ...c, status: 'flagged' } : c));
      
      const isRecord = isNewBest(gameState.timeElapsed, gameState.difficulty.name, gameState.mode);
      setIsBestTime(isRecord);
      saveGameRecord(gameState.timeElapsed, gameState.difficulty.name, gameState.mode);
    }

    setGameState(prev => ({
      ...prev,
      grid: newGrid,
      status: newStatus,
      flagsUsed: newStatus === 'won' ? prev.difficulty.mines : prev.flagsUsed,
      prayersLeft: newPrayersLeft,
      isPraying: newIsPraying
    }));
  };

  // Right Click (Flag) Handler
  const handleRightClick = (row: number, col: number, e: React.MouseEvent) => {
    e.preventDefault();
    if (gameState.status !== 'playing' && gameState.status !== 'idle') return;

    const newGrid = gameState.grid.map(row => row.map(cell => ({ ...cell })));
    const cell = newGrid[row][col];

    if (cell.status === 'revealed') return;

    let flagsChange = 0;
    if (cell.status === 'flagged') {
      cell.status = 'hidden';
      flagsChange = -1;
    } else {
      cell.status = 'flagged';
      flagsChange = 1;
    }

    setGameState(prev => ({
      ...prev,
      grid: newGrid,
      flagsUsed: prev.flagsUsed + flagsChange
    }));
  };

  // --- Drag Handling Logic ---

  // Handle move via window listener to avoid losing capture
  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isDownRef.current || !scrollContainerRef.current) return;

    const dx = e.clientX - startPosRef.current.x;
    const dy = e.clientY - startPosRef.current.y;
    
    // Check threshold
    if (!isDraggingRef.current) {
        if (Math.sqrt(dx*dx + dy*dy) > DRAG_THRESHOLD) {
            isDraggingRef.current = true;
        }
    }

    if (isDraggingRef.current) {
        scrollContainerRef.current.scrollLeft = startPosRef.current.scrollLeft - dx;
        scrollContainerRef.current.scrollTop = startPosRef.current.scrollTop - dy;
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    isDownRef.current = false;
    // We don't reset isDraggingRef immediately here because the 'click' event fires *after* pointerup.
    // The click capture handler needs to know if a drag occurred.
    // Cleanup listeners
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerUp);
  }, [handlePointerMove]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!scrollContainerRef.current) return;
    // Allow drag on any button, but typically left click is primary. 
    // We start the "potential drag" state.
    isDownRef.current = true;
    isDraggingRef.current = false; // Reset drag state for new interaction
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

  // Intercept clicks if we were dragging
  const handleClickCapture = (e: React.MouseEvent) => {
    if (isDraggingRef.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return (
    <div className="h-screen w-screen bg-slate-900 flex flex-col relative overflow-hidden">
      
      {/* Fixed Background Layer */}
      <div className={`absolute inset-0 z-0 pointer-events-none transition-all duration-1000 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] ${
        gameState.mode === 'strict' 
          ? 'from-red-900/30 via-slate-900 to-black' 
          : 'from-slate-800 via-slate-900 to-black'
      }`} />

      {/* Prayer Overlay */}
      {gameState.isPraying && (
          <div className="absolute inset-0 z-0 pointer-events-none border-[10px] border-purple-500/20 animate-pulse shadow-[inset_0_0_100px_rgba(168,85,247,0.2)]" />
      )}

      {/* Fixed Header Section */}
      <div className="z-20 w-full flex-none p-4 pb-0 flex flex-col items-center pointer-events-none">
        {/* Unified Max Width Container for HUD */}
        <div className="pointer-events-auto w-full max-w-2xl">
             <div className="flex items-center gap-3 mb-4 justify-between">
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                         <h1 className={`text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text drop-shadow-sm tracking-tight ${
                        gameState.mode === 'strict' 
                        ? 'bg-gradient-to-r from-red-500 to-orange-500' 
                        : 'bg-gradient-to-r from-emerald-400 to-cyan-400'
                        }`}>
                        {gameState.mode === 'strict' ? 'Cursed Mine Sweeper' : 'Grassland Sweeper'}
                        </h1>
                        {gameState.mode === 'strict' && (
                        <span className="hidden sm:inline-block bg-red-900/50 text-red-300 text-[10px] px-1.5 py-0.5 rounded border border-red-700 font-mono">
                            CURSED
                        </span>
                        )}
                    </div>
                </div>
                
                <div className="flex gap-2">
                    <button 
                        onClick={() => setShowLeaderboard(true)}
                        className="p-2 rounded-full bg-slate-800 text-yellow-500 hover:text-yellow-300 hover:bg-slate-700 transition-all border border-slate-700 shadow-lg"
                        title="Leaderboard"
                    >
                        <Trophy size={20} />
                    </button>

                    <button 
                        onClick={() => setShowSettings(true)}
                        className="p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all border border-slate-700 shadow-lg relative"
                        title="Settings"
                    >
                        <Settings size={20} />
                        {gameState.mode === 'strict' && (
                        <Skull size={10} className="absolute -top-1 -right-1 text-red-500" />
                        )}
                    </button>
                </div>
            </div>

            <GameHeader 
            minesLeft={difficulty.mines - gameState.flagsUsed} 
            timer={gameState.timeElapsed} 
            status={gameState.status}
            prayersLeft={gameState.prayersLeft}
            isPraying={gameState.isPraying}
            onReset={() => initGame()}
            onTogglePrayer={handleTogglePrayer}
            />
        </div>
      </div>

      {/* Scrollable Game Board Area */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing relative z-10 w-full"
        onPointerDown={handlePointerDown}
        // Pointer move/up are handled globally to prevent capture loss
        onClickCapture={handleClickCapture} // Intercepts standard clicks
        onContextMenuCapture={handleClickCapture} // Intercepts right-clicks if dragged
      >
          {/* Container centers content but allows it to grow */}
          <div className="min-w-full min-h-full flex items-center justify-center p-8 lg:p-12 w-fit h-fit mx-auto">
            <Board 
                grid={gameState.grid} 
                gameStatus={gameState.status}
                onCellClick={handleCellClick}
                onCellRightClick={handleRightClick}
            />
          </div>
      </div>

      <Modal 
        status={gameState.status} 
        time={gameState.timeElapsed} 
        isBestTime={isBestTime}
        onRestart={() => initGame()} 
      />

      <SettingsModal 
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        currentDifficulty={difficulty}
        onDifficultyChange={(d) => handleSettingsChange(d, gameMode)}
        difficulties={DIFFICULTIES}
        gameMode={gameMode}
        onGameModeChange={(m) => handleSettingsChange(difficulty, m)}
      />

      <LeaderboardModal
        isOpen={showLeaderboard}
        onClose={() => setShowLeaderboard(false)}
        difficulties={DIFFICULTIES}
        currentDifficultyName={difficulty.name}
        gameMode={gameState.mode}
      />
    </div>
  );
};

export default App;
