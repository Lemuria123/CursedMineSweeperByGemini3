import fs from 'node:fs';
import { decodePng } from '../src/image';
import { colorBlobs } from '../src/vision/overlay';
import { isAmber, isEmerald, isSlateButton } from '../src/vision/colors';

const img = decodePng(fs.readFileSync('logs/debug-difficulty/03-settings.png'));
const dump = (name: string, match: (r:number,g:number,b:number)=>boolean) => {
  const blobs = colorBlobs(img, match).filter((b) => b.area > 30).sort((a, b) => b.area - a.area).slice(0, 20);
  console.log(name, blobs.map((b) => `${b.w}x${b.h}@${b.cx},${b.cy}a${b.area}`).join(' | '));
};
dump('amber', (r,g,b)=>isAmber({r,g,b}));
dump('emerald', (r,g,b)=>isEmerald({r,g,b}));
dump('slate', (r,g,b)=>isSlateButton({r,g,b}));
