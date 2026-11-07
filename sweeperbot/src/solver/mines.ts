/**
 * 三档预设的雷数。公式与游戏公开规则一致：总数 × (20% + 1 / 总数^0.65)，再减 1。
 * 机器人用它核对标题栏读到的数字，避免把计数器认错后继续下。
 */
export function recommendedMines(rows: number, cols: number): number {
  const total = rows * cols;
  const factor = 0.2 + 1 / Math.pow(total, 0.65);
  return Math.max(1, Math.floor(total * factor) - 1);
}
