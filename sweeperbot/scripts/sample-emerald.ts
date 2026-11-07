import fs from 'node:fs';
import { decodePng, getPixel } from '../src/image';
import { isEmerald, isAmber, isSlateButton } from '../src/vision/colors';
import { colorBlobs } from '../src/vision/overlay';

for (const name of ['logs/debug-gear2/02-settings1.png', 'logs/debug-gear2/04-after-gear2.png']) {
  const img = decodePng(fs.readFileSync(name));
  console.log('\n==', name, img.width, img.height);
  const em = colorBlobs(img, (r,g,b)=>isEmerald({r,g,b})).filter(b=>b.area>20).sort((a,b)=>b.area-a.area).slice(0,15);
  console.log('emerald blobs', em.map(b=>`${b.w}x${b.h}@${b.cx},${b.cy}a${b.area}`));
  // sample around expected button column x=581 y=1010
  for (const [x,y] of [[581,1010],[581,1056],[581,1102],[580,1000],[590,1010]]) {
    const c = getPixel(img, x, y);
    console.log(`px ${x},${y}`, c, 'em', isEmerald(c), 'slate', isSlateButton(c));
  }
}
