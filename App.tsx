
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, BookOpen } from 'lucide-react';
import { GameState, Difficulty, GameStatus, CursedReward } from './types';
import { createEmptyGrid, placeMines, revealCellLogic, revealAllMines, checkWin, getChordTargets, calculateRecommendedMines } from './utils/gameLogic';
import { hasRewardForDifficulty, saveReward } from './utils/storage';
import { fetchCursedReward } from './utils/cursedContent';
import { Board } from './components/Board';
import { GameHeader } from './components/GameHeader';
import { SettingsModal } from './components/SettingsModal';
import { GrimoireModal } from './components/LeaderboardModal'; 
import { Modal } from './components/Modal';

// Updated logic: Default mines are now calculated based on the new density formula.
// Easy: 9x9 (81) -> ~21 mines
// Medium: 16x16 (256) -> ~58 mines
// Hard: 16x30 (480) -> ~105 mines
const DIFFICULTIES: Difficulty[] = [
  { name: 'Easy', rows: 9, cols: 9, mines: calculateRecommendedMines(9, 9) },
  { name: 'Medium', rows: 16, cols: 16, mines: calculateRecommendedMines(16, 16) }, 
  { name: 'Hard', rows: 16, cols: 30, mines: calculateRecommendedMines(16, 30) },
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
    timeElapsed: 0,
    prayersUsed: 0,
    isPraying: false,
  });

  const [isGameOverModalOpen, setIsGameOverModalOpen] = useState(false);
  const [timerInterval, setTimerInterval] = useState<number | null>(null);

  // New State for Just Unlocked Reward
  const [newUnlockedReward, setNewUnlockedReward] = useState<CursedReward | null>(null);

  // --- Drag to Scroll State ---
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDownRef = useRef(false);
  const isDraggingRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  // Initialize Game
  const initGame = useCallback((diff: Difficulty = difficulty) => {
    if (timerInterval) clearInterval(timerInterval);
    setGameState({
      grid: createEmptyGrid(diff.rows, diff.cols),
      status: 'idle',
      difficulty: diff,
      flagsUsed: 0,
      timeElapsed: 0,
      prayersUsed: 0,
      isPraying: false,
    });
    setTimerInterval(null);
    setIsGameOverModalOpen(false);
    setNewUnlockedReward(null);
    
    if (scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        setTimeout(() => {
            const centerX = (container.scrollWidth - container.clientWidth) / 2;
            const centerY = (container.scrollHeight - container.clientHeight) / 2;
            container.scrollTo({ left: centerX, top: centerY, behavior: 'smooth' });
        }, 100);
    }
  }, [difficulty, timerInterval]);

  // Difficulty Change Handler
  const handleDifficultyChange = (newDiff: Difficulty) => {
    setDifficulty(newDiff);
    initGame(newDiff);
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

    // First Click: Generate Mines
    if (gameState.status === 'idle') {
      newGrid = placeMines(newGrid, gameState.difficulty.mines, row, col);
      newStatus = 'playing';
    }

    // Logic for Revealed vs Hidden cells
    if (cell.status === 'revealed') {
        // --- CHORDING LOGIC ---
        const targets = getChordTargets(newGrid, row, col);
        for (const target of targets) {
            const result = revealCellLogic(newGrid, target.r, target.c, false, newIsPraying);
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
        // --- STANDARD REVEAL LOGIC ---
        const result = revealCellLogic(newGrid, row, col, gameState.status === 'idle', newIsPraying);
        newGrid = result.grid;
        if (result.prayerConsumed) newPrayersUsed++;
        if (result.exploded) {
            newStatus = 'lost';
            newGrid = revealAllMines(newGrid);
            newGrid[row][col].isExploded = true;
        }
    }

    // --- CHECK WIN CONDITION ---
    if (newStatus !== 'lost' && checkWin(newGrid)) {
      newStatus = 'won';
      newGrid = newGrid.map(r => r.map(c => c.isMine ? { ...c, status: 'flagged' } : c));
      
      // REWARD LOGIC
      if (newPrayersUsed === 0) {
          // Rule: To earn a reward, the mine count must be at least the recommended amount for this size
          const minMinesRequired = calculateRecommendedMines(gameState.difficulty.rows, gameState.difficulty.cols);
          
          if (gameState.difficulty.mines >= minMinesRequired) {
            // It's a valid ACED win. Check if we should unlock a reward.
            if (!hasRewardForDifficulty(gameState.difficulty)) {
                // Trigger async fetch
                fetchCursedReward(gameState.difficulty).then(reward => {
                    saveReward(reward);
                    setNewUnlockedReward(reward);
                });
            }
          }
      }
    }

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

  const handleClickCapture = (e: React.MouseEvent) => {
    if (isDraggingRef.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return (
    <div className="h-screen w-screen bg-slate-900 flex flex-col relative overflow-hidden">
      
      {/* Fixed Background Layer */}
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
                           Cursed Mine Sweeper
                        </h1>
                    </div>
                </div>
                
                <div className="flex gap-2">
                    <button 
                        onClick={() => setShowGrimoire(true)}
                        className="p-2 rounded-full bg-slate-800 text-amber-500 hover:text-amber-300 hover:bg-slate-700 transition-all border border-slate-700 shadow-lg group relative"
                        title="The Grimoire"
                    >
                        <BookOpen size={20} />
                        {/* Notification dot if something is unlocked but not viewed? For now just simple */}
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
            timer={gameState.timeElapsed} 
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
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing relative z-10 w-full"
        onPointerDown={handlePointerDown}
        onClickCapture={handleClickCapture} 
        onContextMenuCapture={handleClickCapture} 
      >
          <div className="min-w-full min-h-full flex items-center justify-center p-8 lg:p-12 w-fit h-fit mx-auto">
            <Board 
                grid={gameState.grid} 
                gameStatus={gameState.status}
                onCellClick={handleCellClick}
                onCellRightClick={handleRightClick}
            />
          </div>
      </div>

      {isGameOverModalOpen && (
          <Modal 
            status={gameState.status} 
            time={gameState.timeElapsed} 
            prayersUsed={gameState.prayersUsed}
            newReward={newUnlockedReward}
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
    </div>
  );
};

export default App;
