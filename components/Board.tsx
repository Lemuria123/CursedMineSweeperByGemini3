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
  const rows = grid.length;
  const cols = grid[0].length;

  return (
    <div 
      className="bg-grass-darker p-3 rounded-lg shadow-2xl border-4 border-grass-dark/50"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: '2px',
        width: 'fit-content',
        maxWidth: '100%',
      }}
    >
      {grid.flatMap((row) =>
        row.map((cell) => (
          <div 
            key={cell.id} 
            className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12"
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
