import React, { useState, useEffect, useCallback } from 'react';
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
  });

  const [isBestTime, setIsBestTime] = useState(false);
  const [timerInterval, setTimerInterval] = useState<number | null>(null);

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
    });
    setTimerInterval(null);
    setIsBestTime(false);
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

    // Reveal Logic (includes Hostile Logic if mode is strict)
    const { grid: revealedGrid, exploded } = revealCellLogic(
      newGrid, 
      row, 
      col, 
      gameState.mode, 
      isFirstClick
    );
    newGrid = revealedGrid;

    if (exploded) {
      newStatus = 'lost';
      newGrid = revealAllMines(newGrid);
      newGrid[row][col].isExploded = true;
    } else if (checkWin(newGrid)) {
      newStatus = 'won';
      newGrid = newGrid.map(r => r.map(c => c.isMine ? { ...c, status: 'flagged' } : c));
      
      // Save Game Record
      const isRecord = isNewBest(gameState.timeElapsed, gameState.difficulty.name, gameState.mode);
      setIsBestTime(isRecord);
      saveGameRecord(gameState.timeElapsed, gameState.difficulty.name, gameState.mode);
    }

    setGameState(prev => ({
      ...prev,
      grid: newGrid,
      status: newStatus,
      flagsUsed: newStatus === 'won' ? prev.difficulty.mines : prev.flagsUsed
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

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 relative overflow-y-auto">
      
      {/* Background decoration */}
      <div className={`absolute inset-0 z-0 pointer-events-none transition-all duration-1000 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] ${
        gameState.mode === 'strict' 
          ? 'from-red-900/30 via-slate-900 to-black' 
          : 'from-slate-800 via-slate-900 to-black'
      }`} />

      <div className="z-10 flex flex-col items-center w-full max-w-4xl">
        
        {/* Header Section with Title and Action Buttons */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex flex-col items-center md:items-end md:flex-row gap-2">
            <h1 className={`text-3xl md:text-5xl font-extrabold text-transparent bg-clip-text drop-shadow-sm tracking-tight text-center mr-2 ${
               gameState.mode === 'strict' 
               ? 'bg-gradient-to-r from-red-500 to-orange-500' 
               : 'bg-gradient-to-r from-emerald-400 to-cyan-400'
            }`}>
              {gameState.mode === 'strict' ? 'Strict Sweeper' : 'Grassland Sweeper'}
            </h1>
            {gameState.mode === 'strict' && (
              <span className="bg-red-900/50 text-red-300 text-xs px-2 py-1 rounded border border-red-700 font-mono mb-2 md:mb-1">
                NO GUESSING
              </span>
            )}
          </div>
          
          <button 
            onClick={() => setShowLeaderboard(true)}
            className="p-2 rounded-full bg-slate-800 text-yellow-500 hover:text-yellow-300 hover:bg-slate-700 transition-all border border-slate-700 shadow-lg"
            title="Leaderboard"
          >
            <Trophy size={24} />
          </button>

          <button 
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all border border-slate-700 shadow-lg relative"
            title="Settings"
          >
            <Settings size={24} />
            {gameState.mode === 'strict' && (
              <Skull size={12} className="absolute -top-1 -right-1 text-red-500" />
            )}
          </button>
        </div>

        <GameHeader 
          minesLeft={difficulty.mines - gameState.flagsUsed} 
          timer={gameState.timeElapsed} 
          status={gameState.status}
          onReset={() => initGame()}
        />

        <Board 
          grid={gameState.grid} 
          gameStatus={gameState.status}
          onCellClick={handleCellClick}
          onCellRightClick={handleRightClick}
        />
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
