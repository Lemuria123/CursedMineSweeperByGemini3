import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { GameSession } from '../src/browser/session';
import { detectOverlay, findSettingsGear } from '../src/vision/overlay';
import { findGrid } from '../src/vision/board';
import { colorBlobs } from '../src/vision/overlay';
import { isAmber, isEmerald } from '../src/vision/colors';

const outDir = path.resolve('logs/debug-gear2');
fs.mkdirSync(outDir, { recursive: true });
function save(name: string, image: {width:number;height:number;data:Uint8Array|Buffer}) {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data);
  fs.writeFileSync(path.join(outDir, name), PNG.sync.write(png));
}
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

const session = await GameSession.open({
  url: 'http://127.0.0.1:38100', difficulty: 'easy', games: 1, maxSteps: 5,
  viewportWidth: 1440, viewportHeight: 1900, headless: true, offline: true, logDir: outDir,
});
try {
  await session.goto('http://127.0.0.1:38100');
  await sleep(800);
  let shot = await session.screenshot();
  save('01.png', shot);
  let gear = findSettingsGear(shot);
  await session.click(gear.x, gear.y);
  await sleep(600);
  shot = await session.screenshot();
  save('02-settings1.png', shot);
  console.log('1', detectOverlay(shot));
  const s1 = detectOverlay(shot);
  if (s1.kind === 'settings') {
    await session.click(s1.tabs[0].x, s1.tabs[0].y);
    await sleep(200);
    await session.click(s1.start.x, s1.start.y);
    await sleep(800);
  }
  shot = await session.screenshot();
  save('03-after-easy.png', shot);
  console.log('after easy', detectOverlay(shot).kind, findGrid(shot)?.rows, findGrid(shot)?.cols);

  gear = findSettingsGear(shot);
  console.log('gear2', gear);
  // try a few nearby clicks and dump amber/emerald
  await session.click(gear.x, gear.y);
  await sleep(700);
  shot = await session.screenshot();
  save('04-after-gear2.png', shot);
  console.log('after gear2 overlay', detectOverlay(shot));
  const ambers = colorBlobs(shot, (r,g,b)=>isAmber({r,g,b})).filter(b=>b.area>30).sort((a,b)=>b.area-a.area).slice(0,10);
  const emeralds = colorBlobs(shot, (r,g,b)=>isEmerald({r,g,b})).filter(b=>b.area>30).sort((a,b)=>b.area-a.area).slice(0,10);
  console.log('ambers', ambers.map(b=>`${b.w}x${b.h}@${b.cx},${b.cy}`));
  console.log('emeralds', emeralds.map(b=>`${b.w}x${b.h}@${b.cx},${b.cy}`));

  // try clicking title-bar right more carefully - sample header for gear icon
  // Also try Escape then gear again
  await session.page.keyboard.press('Escape');
  await sleep(300);
  shot = await session.screenshot();
  save('05-escape.png', shot);
  gear = findSettingsGear(shot);
  await session.click(gear.x, gear.y);
  await sleep(700);
  shot = await session.screenshot();
  save('06-gear-after-esc.png', shot);
  console.log('after esc+gear', detectOverlay(shot));
} finally {
  await session.close();
}
