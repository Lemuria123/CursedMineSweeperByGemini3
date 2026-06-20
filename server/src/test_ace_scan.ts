// Quick scan: which sizes can produce ACE games?
import { revealCellLogic } from '../../shared/gameLogic';
import { deterministicPlaceMines } from '../../shared/deterministicPlaceMines';

const sizes = [[4,4,2],[5,5,3],[5,6,3],[6,5,3],[5,5,4],[6,6,3],[6,6,4],[7,7,5],[8,8,10],[8,8,12],[9,9,12]];
for (const [rows, cols, mines] of sizes) {
  let found = false;
  const fr = Math.floor(rows/2), fc = Math.floor(cols/2);
  for (let a = 0; a < 200; a++) {
    const seed = `${rows}-${cols}-${mines}-${fr}-${fc}-scan-${a}`;
    let b = deterministicPlaceMines(rows, cols, mines, fr, fc, seed).map(r => r.map(c => ({...c})));
    const r = revealCellLogic(b, fr, fc, true, false); b = r.grid;
    if (r.exploded) continue;
    let ok = true;
    for (let ri = 0; ri < rows && ok; ri++)
      for (let ci = 0; ci < cols && ok; ci++)
        if (b[ri][ci].status === 'hidden' && !b[ri][ci].isMine) ok = false;
    if (ok) { found = true; console.log(`✅ ACE: ${rows}x${cols} ${mines}m (seed#${a})`); break; }
  }
  if (!found) console.log(`❌ No ACE: ${rows}x${cols} ${mines}m`);
}
