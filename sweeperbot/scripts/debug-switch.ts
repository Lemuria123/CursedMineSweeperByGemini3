import { GameSession } from '../src/browser/session';
import { detectOverlay, findSettingsGear, findResetFace } from '../src/vision/overlay';
import { findGrid } from '../src/vision/board';
import { counterAnchorY } from '../src/vision/digits';
import { PRESETS } from '../src/config';

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function pick(session: Awaited<ReturnType<typeof GameSession.open>>, name: 'easy'|'medium'|'hard') {
  const target = PRESETS[name];
  const index = name === 'easy' ? 0 : name === 'medium' ? 1 : 2;
  for (let attempt = 0; attempt < 3; attempt++) {
    let view = await session.screenshot();
    const nick = detectOverlay(view);
    if (nick.kind === 'nickname') {
      await session.click(nick.skip.x, nick.skip.y);
      await sleep(250);
      view = await session.screenshot();
    }
    const gear = findSettingsGear(view);
    console.log(name, 'attempt', attempt, 'gear', gear, 'overlay', detectOverlay(view).kind, 'grid', (() => { const g=findGrid(view); return g?`${g.rows}x${g.cols}`:null; })());
    await session.click(gear.x, gear.y);
    await sleep(500);
    let settings = detectOverlay(await session.screenshot());
    console.log(name, 'after gear', settings.kind, settings.kind==='settings'?settings: '');
    if (settings.kind !== 'settings') {
      // wheel and retry detect
      const shot = await session.screenshot();
      await session.wheel(Math.round(shot.width/2), Math.round(shot.height/2), 280);
      await sleep(300);
      settings = detectOverlay(await session.screenshot());
      console.log(name, 'after wheel', settings.kind);
    }
    if (settings.kind !== 'settings') continue;
    await session.click(settings.tabs[index].x, settings.tabs[index].y);
    await sleep(250);
    const afterTab = detectOverlay(await session.screenshot());
    const start = afterTab.kind === 'settings' ? afterTab.start : settings.start;
    await session.click(start.x, start.y);
    for (let i = 0; i < 20; i++) {
      await sleep(200);
      const shot = await session.screenshot();
      const o = detectOverlay(shot);
      if (o.kind === 'nickname') { await session.click(o.skip.x, o.skip.y); continue; }
      if (o.kind !== 'none') { console.log(name, 'poll overlay', o.kind); continue; }
      const g = findGrid(shot);
      console.log(name, 'poll', i, g ? `${g.rows}x${g.cols}` : null, 'want', `${target.rows}x${target.cols}`);
      if (g && g.rows === target.rows && g.cols === target.cols) return true;
    }
  }
  return false;
}

const session = await GameSession.open({
  url: 'http://127.0.0.1:38100', difficulty: 'easy', games: 1, maxSteps: 5,
  viewportWidth: 1440, viewportHeight: 1900, headless: true, offline: true, logDir: 'logs/debug-difficulty',
});
try {
  await session.goto('http://127.0.0.1:38100');
  await sleep(800);
  console.log('easy', await pick(session, 'easy'));
  // simulate stuck restart via face
  const shot = await session.screenshot();
  const face = findResetFace(shot, counterAnchorY(shot));
  await session.click(face.x, face.y);
  await sleep(500);
  console.log('medium', await pick(session, 'medium'));
  console.log('hard', await pick(session, 'hard'));
} finally {
  await session.close();
}
