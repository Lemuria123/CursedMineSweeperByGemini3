import fs from 'node:fs';
import { decodePng, getPixel, luma } from '../src/image';

const img = decodePng(fs.readFileSync('logs/debug-gear2/04-after-gear2.png'));
const start = { x: 860, y: 1106 };
// scan left of start for square-ish bright-on-dark widgets
const hits: Array<{x:number;y:number;score:number}> = [];
for (let y = start.y - 160; y <= start.y + 20; y += 2) {
  for (let x = start.x - 360; x <= start.x - 200; x += 2) {
    let dark=0, mid=0;
    for (let dy=-8; dy<=8; dy+=2) for (let dx=-8; dx<=8; dx+=2) {
      const c = getPixel(img, x+dx, y+dy);
      const L = luma(c);
      if (L < 40) dark++; else if (L > 90 && L < 200) mid++;
    }
    if (dark >= 20 && mid >= 6) hits.push({x,y,score:dark+mid});
  }
}
// cluster by y
hits.sort((a,b)=>a.y-b.y || a.x-b.x);
console.log('hits', hits.length);
const centers: typeof hits = [];
for (const h of hits) {
  const near = centers.find(c => Math.abs(c.x-h.x)<12 && Math.abs(c.y-h.y)<12);
  if (near) { near.score += h.score; near.x = Math.round((near.x+h.x)/2); near.y=Math.round((near.y+h.y)/2); }
  else centers.push({...h});
}
centers.sort((a,b)=>b.score-a.score);
console.log(centers.slice(0,12));
