/**
 * 独立 ACE 扫雷机器人。
 *
 * 在 sweeperbot 目录：
 *   npm install
 *   npx playwright install chromium
 *   npm start -- --url http://127.0.0.1:38100 --offline --difficulty hard --games 20
 *   npm start -- --headed --games 1
 *
 * 沙盒（不挂载正在改的仓库，端口 38100）：
 *   docker compose -f sweeperbot/sandbox/docker-compose.yml up -d --build
 * 游戏页面写死的 38001 在 --offline 时会被拦住，不会打到本机那套正在改的 API。
 * 它自己开一个浏览器，截图认盘，只点逻辑上必然安全的格子。
 * 推不动、赢或炸了都会重开。剩余雷数和棋盘对不上，或数字互相矛盾时，记成 logic_error 并重开。
 * 过程写在 logs/sessions 里。
 */
import { parseArgs } from './config';
import { runBot } from './play/loop';

const config = parseArgs(process.argv.slice(2));
runBot(config).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
