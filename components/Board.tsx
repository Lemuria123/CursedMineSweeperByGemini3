
import React from 'react';
import { Cell } from './Cell';
import { CellData, GameStatus } from '../types';

interface BoardProps {
  grid: CellData[][];
  gameStatus: GameStatus;
  onCellClick: (row: number, col: number) => void;
  onCellRightClick: (row: number, col: number, e: React.MouseEvent) => void;
}

export const Board: React.FC<BoardProps> = ({ grid, gameStatus, onCellClick, onCellRightClick }) => {
  // 防御性检查：确保 grid 不为空
  if (!grid || grid.length === 0 || !grid[0] || grid[0].length === 0) {
    return (
      <div className="bg-grass-darker p-3 rounded-lg shadow-2xl border-4 border-grass-dark/50 text-white">
        <p>Loading game board...</p>
      </div>
    );
  }

  const rows = grid.length;
  const cols = grid[0].length;

  return (
    <div 
      className="bg-[#14532d] p-3 rounded-lg shadow-2xl border-4 border-[#14532d]"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, max-content)`, 
        gap: '0px',
        width: 'fit-content',
      }}
    >
      {grid.flatMap((row) =>
        row.map((cell) => (
          <div 
            key={cell.id} 
            className="w-9 h-9 sm:w-10 sm:h-10 md:w-12 md:h-12"
          >
            <Cell
              data={cell}
              onClick={() => onCellClick(cell.row, cell.col)}
              onRightClick={(e) => onCellRightClick(cell.row, cell.col, e)}
              disabled={gameStatus === 'won' || gameStatus === 'lost'}
            />
          </div>
        ))
      )}
    </div>
  );
};
