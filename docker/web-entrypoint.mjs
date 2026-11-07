// 前端容器入口。
// 与本地 npm run dev 一样走 Vite。容器内固定 38000，因为宿主机 5173 已被占用。
// 浏览器仍请求宿主机上的 http://localhost:38001，该端口映射保持不变。
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';

const root = '/app';
process.chdir(root);

if (!fs.existsSync(`${root}/node_modules/vite`)) {
  console.log('[docker] 前端依赖卷为空，执行 npm ci');
  const install = spawnSync('npm', ['ci'], { stdio: 'inherit', cwd: root });
  if (install.status !== 0) process.exit(install.status ?? 1);
}

const child = spawn(
  `${root}/node_modules/.bin/vite`,
  ['--host', '0.0.0.0', '--port', '38000', '--strictPort'],
  { stdio: 'inherit', cwd: root },
);

function forward(signal) {
  child.kill(signal);
}
process.on('SIGTERM', () => forward('SIGTERM'));
process.on('SIGINT', () => forward('SIGINT'));
child.on('exit', (code) => process.exit(code ?? 0));
