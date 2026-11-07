import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { GameSession } from '../src/browser/session';
import { detectOverlay, findSettingsGear } from '../src/vision/overlay';
import { findGrid } from '../src/vision/board';

const outDir = path.resolve('logs/debug-difficulty');
fs.mkdirSync(outDir, { recursive: true });

function save(name: string, image: { width: number; height: number; data: Uint8Array | Buffer }) {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data);
  const file = path.join(outDir, name);
  fs.writeFileSync(file, PNG.sync.write(png));
  console.log('saved', name, image.width + 'x' + image.height);
}

const session = await GameSession.open({
  url: 'http://127.0.0.1:38100',
  difficulty: 'hard',
  games: 1,
  maxSteps: 10,
  viewportWidth: 1440,
  viewportHeight: 1900,
  headless: true,
  offline: true,
  logDir: outDir,
});

try {
  await session.goto('http://127.0.0.1:38100');
  await new Promise((r) => setTimeout(r, 1000));
  let shot = await session.screenshot();
  save('01-open.png', shot);
  console.log('overlay', detectOverlay(shot).kind, 'grid', findGrid(shot)?.rows, 'x', findGrid(shot)?.cols);

  let overlay = detectOverlay(shot);
  if (overlay.kind === 'nickname') {
    await session.click(overlay.skip.x, overlay.skip.y);
    await new Promise((r) => setTimeout(r, 400));
    shot = await session.screenshot();
    save('02-after-nick.png', shot);
  }

  const gear = findSettingsGear(shot);
  console.log('gear', gear);
  await session.click(gear.x, gear.y);
  await new Promise((r) => setTimeout(r, 600));
  shot = await session.screenshot();
  save('03-settings.png', shot);
  const settings = detectOverlay(shot);
  console.log('settings', settings.kind, settings.kind === 'settings' ? { tabs: settings.tabs.length, start: settings.start } : settings);

  if (settings.kind === 'settings') {
    for (const [i, name] of (['easy', 'medium', 'hard'] as const).entries()) {
      await session.click(settings.tabs[i].x, settings.tabs[i].y);
      await new Promise((r) => setTimeout(r, 350));
      const mid = await session.screenshot();
      save(`04-tab-${name}.png`, mid);
      const again = detectOverlay(mid);
      console.log('tab', name, again.kind, again.kind === 'settings' ? again.tabs.length : '');
    }
    const after = detectOverlay(await session.screenshot());
    const start = after.kind === 'settings' ? after.start : settings.start;
    console.log('click start', start);
    await session.click(start.x, start.y);
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 300));
      shot = await session.screenshot();
      const o = detectOverlay(shot);
      const g = findGrid(shot);
      console.log('poll', i, 'overlay', o.kind, 'grid', g ? `${g.rows}x${g.cols}` : null);
      if (o.kind === 'none' && g) {
        save('05-after-start.png', shot);
        break;
      }
      if (o.kind === 'nickname') {
        await session.click(o.skip.x, o.skip.y);
      }
      if (i === 9) save('05-after-start-timeout.png', shot);
    }
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await session.close();
}