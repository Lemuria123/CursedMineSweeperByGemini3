// 游戏服务容器入口。
// 进程本身仍是 server 的 ts-node（API :38001 与管理后台 :38002 同一进程），不改业务代码。
// /app 由宿主机项目挂载；node_modules 使用独立卷。卷是空的时候在这里安装 Linux 依赖。
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';

const root = '/app/server';
process.chdir(root);

if (!fs.existsSync(`${root}/node_modules/express`)) {
  console.log('[docker] server 依赖卷为空，执行 npm ci');
  const install = spawnSync('npm', ['ci'], { stdio: 'inherit', cwd: root });
  if (install.status !== 0) process.exit(install.status ?? 1);
}

const child = spawn(
  `${root}/node_modules/.bin/ts-node`,
  ['--transpile-only', 'src/index.ts'],
  { stdio: 'inherit', cwd: root },
);

function forward(signal) {
  child.kill(signal);
}
process.on('SIGTERM', () => forward('SIGTERM'));
process.on('SIGINT', () => forward('SIGINT'));
child.on('exit', (code) => process.exit(code ?? 0));
