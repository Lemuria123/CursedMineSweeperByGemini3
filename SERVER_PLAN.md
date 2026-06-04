# Cursed Minesweeper 服务端开发计划

## 目标
- 记录玩家已认证的 ACE 奖励（反作弊）
- 按棋盘尺寸（8×8 ~ 25×25）记录 ACE 通关耗时排行
- 弱注册：平台登录自动注册，仅首次 ACE 时要求输入昵称

## 技术选型
| 层面 | 选择 | 理由 |
|------|------|------|
| 后端框架 | Express (Node.js) | 同语言，生态成熟 |
| 数据库 | SQLite (sql.js) | 纯 JS 实现，零原生依赖，沙箱环境兼容 |
| 加密 | AES-256-GCM + server nonce | 标准工业加密，防重放 |
| 反作弊 | 服务端回放验证 | 重放每一步操作，验证游戏全程合法性 |
| 端口 | `38001` (游戏 API) / `38002` (管理后台) | 38000~39000 范围，避免与常用端口冲突 |
| 管理后台 | Express + 纯 HTML/JS 页面 | 轻量内嵌，无需前端框架 |

---

## 阶段一：项目骨架

- [x] 创建 `server/` 目录
- [x] `server/package.json`：express / cors / sql.js / uuid / typescript / ts-node / cookie-session / seedrandom / @types/cookie-session
- [x] 创建 `shared/` 共享模块目录（前后端共用）
  - `shared/gameLogic.ts` — 将前端 `utils/gameLogic.ts` 的核心纯函数抽到此处（`calculateRecommendedMines`、`createEmptyGrid`、`placeMines`、`revealCellLogic`、`rearrangeMines`、`checkWin` 等）
  - `shared/deterministicPlaceMines.ts` — 基于 `seedrandom` 的确定性 `placeMines`，接受 `seed: string` 参数，前后端使用相同 seed 可生成相同雷布局
  - 前端 `utils/gameLogic.ts` 改为从 `shared/` re-export
- [x] `server/tsconfig.json` — 配置 `paths` 指向 `shared/`
- [x] `server/src/index.ts` — Express 入口，监听 `:38001`（游戏 API），CORS 允许前端
- [x] `server/src/admin.ts` — 管理后台 Express 入口，监听 `:38002`
- [x] 开发脚本 `npm run dev:server`（同时启动两个服务）

✅ **阶段一完成** — 2026-06-04

- `shared/types.ts` / `shared/gameLogic.ts` / `shared/deterministicPlaceMines.ts`
- `server/src/index.ts`（:38001，已验证 health check 返回 `{ ok: true }`）
- `server/src/admin.ts`（:38002，登录鉴权 + dashboard + 5 placeholder 页面）
- `utils/gameLogic.ts` 改为 re-export wrapper，保留 preserveRefs

## 阶段二：数据库设计

- [x] 自动建表脚本 + nonce 过期清理定时器（每 10 分钟清除过期 nonce）

### `accounts` 表
| 列 | 类型 | 说明 |
|----|------|------|
| id | TEXT PK | UUID |
| platform | TEXT | `'steam'` / `'wechat'` / `'email'` / `'phone'` / `'auto'` |
| platform_id | TEXT | 平台返回的标识符；`auto` 模式下为前端生成的设备指纹 |
| nickname | TEXT NULL | 首次 ACE 后要求填写，之前为 null |
| created_at | INTEGER | epoch ms |

### `rewards` 表（服务端权威，反作弊验证后写入）
| 列 | 类型 | 说明 |
|----|------|------|
| id | TEXT PK | `"{rows}-{cols}-{mines}"` |
| account_id | TEXT FK → accounts.id |
| difficulty_name | TEXT | |
| rows | INTEGER | |
| cols | INTEGER | |
| mines | INTEGER | |
| title | TEXT | |
| content | TEXT | 图片 data-uri 或文本 |
| type | TEXT | `'image'` / `'text'` / `'glitch'` |
| hue | INTEGER | |
| submitted_at | INTEGER | epoch ms |

### `records` 表（仅 ACE，按 rows×cols 分榜）
| 列 | 类型 | 说明 |
|----|------|------|
| id | INTEGER PK AUTOINCREMENT | |
| account_id | TEXT FK → accounts.id |
| rows | INTEGER | 棋盘行数 |
| cols | INTEGER | 棋盘列数 |
| mines | INTEGER | |
| time_ms | INTEGER | 首次点击 → 胜利耗时 |
| game_data | TEXT | 加密后的完整游戏进程 JSON → 阶段三详细设计 |
| validated | INTEGER 0/1 | 服务端回放是否通过 |
| submitted_at | INTEGER | epoch ms |

每个 `(rows, cols)` 组合独立排行。玩家在同一尺寸可以有多次记录，排行榜取个人最佳。

### `submission_nonces` 表（防重放）
| 列 | 类型 | 说明 |
|----|------|------|
| id | TEXT PK | UUID |
| nonce | TEXT | 随机 challenge |
| account_id | TEXT | |
| expires_at | INTEGER | epoch ms，有效期 5 分钟 |

✅ **阶段二完成** — 2026-06-04

- `server/src/db.ts` — sql.js 实现，自动建表 + WAL 持久化 + auto-save wrapper（`run/get/all`）
- `server/src/verify_db.ts` — 验证脚本，已通过全部 CRUD 测试
- 注意：`better-sqlite3` 换为 `sql.js`（沙箱环境兼容）

---

## 阶段三：反作弊协议设计（核心）

### 3.1 游戏进程数据结构（加密前明文）

客户端在游戏全程记录每一步操作，胜利时组装为：

```json
{
  "version": 1,
  "nonce": "<服务端获取的 challenge>",
  "grid": { "rows": 9, "cols": 9, "mines": 21 },
  "mine_seed": "<用于确定性生成地雷的种子>",
  "actions": [
    { "type": "first_reveal", "row": 4, "col": 4, "ts": 0 },
    { "type": "flag",       "row": 0, "col": 2, "ts": 1230 },
    { "type": "reveal",     "row": 5, "col": 5, "ts": 2400, "prayed": false },
    { "type": "chord",      "row": 4, "col": 4, "ts": 3500 }
  ],
  "prayers_used": 0,
  "total_time_ms": 45200
}
```

- `mine_seed` 用 `JSON.stringify(gridConfig)` 的哈希 + 首次点击坐标作为种子，使服务端可确定性复现地雷布局而不传输整张棋盘
- `ts` 为相对于首次点击的毫秒偏移

### 3.2 加密流程

```
客户端                                     服务端
  │                                          │
  │  GET /api/nonce ──────────────────────→  │ 生成 nonce, 写入 submission_nonces, 5min 过期
  │  ←────────────── { nonce }               │
  │                                          │
  │  组装 game_data JSON (含 nonce)           │
  │  AES-256-GCM 加密 (密钥内置于客户端)      │
  │  Base64 编码密文                          │
  │                                          │
  │  POST /api/submit ────────────────────→  │ 解密 → 校验 nonce 未过期/未使用
  │  { payload, account_id }                 │  → 回放验证 → 写入 records/rewards
  │  ←────────────── { ok / rejected }       │
```

- 加密密钥编译时注入，不在 Git 中提交（`.env` 文件提供）
- 客户端代码经过 minify + terser mangling，增加逆向难度
- 即使加密被破解，服务端回放验证是真正的防线

### 3.3 服务端回放验证算法

服务端收到游戏数据后：

1. **解密** → 得到明文 game_data JSON
2. **校验 nonce** → 未过期、未被使用（成功后标记为已用）
3. **复原地雷** → 根据 `grid.rows, grid.cols, grid.mines` + `mine_seed` 调用 `deterministicPlaceMines`（`shared/` 模块）生成地雷布局，保证与客户端完全一致
4. **逐步回放**：
   - 从 `first_reveal` 开始，复现与前端完全一致的游戏状态机
   - 对每一步操作验证其合法性：
     - reveal：目标格在回放状态中为 hidden，且 CSP 允许揭示
     - flag：目标格为 hidden 且是 mine
     - chord：目标格为 revealed 数字格，且周围 flag 数 = neighborMines
   - CSP 验证调用 `shared/gameLogic.ts` 中的 `rearrangeMines` / `revealCellLogic`，与前端完全一致
5. **终态校验** → 所有安全格 revealed、所有雷 flagged

全部通过 → `records.validated = 1`，写入 rewards，返回成功。
任一失败 → 拒绝本次提交，写入 records 但 `validated = 0`（供管理后台审计），不写入 rewards。

✅ **阶段三完成** — 2026-06-04

- `server/src/crypto.ts` — AES-256-GCM 加解密（`encrypt` / `decrypt` / `generateKey`）
- `server/src/types.ts` — GameSubmission / GameAction / VerifyResult 类型（含 `prayed` 字段）
- `server/src/verify.ts` — 回放验证引擎（确定性 mine layout + seeded RNG CSP 回放 + 终态校验）
- `server/src/index.ts` — 完整接入 GET /api/nonce + POST /api/submit + 全部 9 个 Stage 4 API
- `shared/gameLogic.ts` — `revealCellLogic` 和 `rearrangeMines` 支持可选 `rng` 参数
- `server/src/test_verify.ts` — 验证测试（5×5 棋盘，fully deterministic，PASSED）
- 关键架构决策：CSP 使用 seeded RNG（`mine_seed + '-csp'`）保证服务端回放完全确定性

---

## 阶段四：API 设计

| 方法 | 路径 | 请求体 | 响应 | 说明 |
|------|------|--------|------|------|
| `POST` | `/api/auth` | `{ platform, platform_id }` | `{ account_id }` | 注册或登录；`auto` 模式首次自动创建 |
| `GET` | `/api/auth/:id` | — | `{ id, nickname, created_at }` | 获取玩家信息 |
| `PATCH` | `/api/auth/:id/nickname` | `{ nickname }` | `{ ok }` | 设置/修改昵称 |
| `GET` | `/api/nonce` | — | `{ nonce }` | 获取一次性加密 nonce |
| `POST` | `/api/submit` | `{ account_id, payload }` | `{ ok, reward? }` | 提交加密游戏数据，验证后入 rewards + records |
| `GET` | `/api/records/:rows/:cols` | — | `[{ rank, nickname, time_ms, date }]` | 指定尺寸排行榜（top 100，按 time_ms ASC） |
| `GET` | `/api/records/me/:account_id` | — | `[{ rows, cols, mines, time_ms, date }...]` | 玩家各尺寸个人最佳 |
| `GET` | `/api/rewards/:account_id` | — | `[{ id, title, content, type, ... }]` | 玩家所有已认证奖励 |

✅ **阶段四完成** — 2026-06-04（与阶段三同步实现，全部 9 个端点已在 `server/src/index.ts` 中完成）

---

## 阶段五：前后端对接

- [x] 前端：新增 `utils/api.ts` — 封装所有 `fetch` 调用
- [x] 前端：新增 `utils/recorder.ts` — 游戏进程记录器（记录每一步 action + ts）
- [x] 前端：新增 `utils/encrypt.ts` — AES-256-GCM 加密（密钥从构建环境注入，或 hardcode + obfuscate）
- [x] 前端：新增 `utils/auth.ts` — auto 模式自动注册（设备指纹/随机 UUID），存 localStorage
- [x] 前端：**首次 ACE 获得奖励时**弹出昵称输入框（允许跳过，跳过则以 `"Anonymous" + account_id 后 4 位` 显示在排行榜上；之后可在设置中修改）
- [x] 前端：奖励判定逻辑保持本地不变（`App.tsx` 现有逻辑），离线可获得奖励并存 localStorage；联网时额外调用 `/api/submit` 推送到服务端
- [x] 前端：Grimoire 页面增加 Tab 切换：**Artifacts** / **Records**
  - Artifacts tab：合并 `localStorage`（旧版） + `/api/rewards`（服务端）。同 id 的奖励以服务端数据为准；localStorage 独有（未上传成功的离线奖励）保留为本地副本，标注未同步
  - Records tab：调用 `/api/records/me/:id` 展示个人各尺寸 ACE 成绩；调用 `/:rows/:cols` 展示各尺寸最快玩家排行榜
- [x] 删除旧版 `LeaderboardModal.tsx`（功能迁移到 Grimoire 内）

✅ **阶段五完成** — 2026-06-04

- `utils/auth.ts` — `crypto.randomUUID()` 生成设备指纹，localStorage 持久化
- `utils/api.ts` — 封装全部 9 个 API 端点（auth/nonce/submit/records/rewards）
- `utils/encrypt.ts` — Web Crypto API 实现 AES-256-GCM，与 server crypto.ts 格式一致
- `utils/recorder.ts` — `GameRecorder` 类，start/record/buildPayload 生命周期
- `App.tsx` — 记录所有点击/右键/Chord 操作；胜利后自动提交到服务端；离线降级；首次 ACE 弹昵称输入框
- `components/LeaderboardModal.tsx` — 重构为 Artifacts/Records 双 Tab；Artifacts 合并本地+远程去重；Records 展示个人最佳 + 各尺寸排行榜
- Vite 编译通过（:5174）

---

## 阶段六：管理后台（server/src/admin.ts，端口 38002）

一个嵌入在 Express 中的纯 HTML/JS 管理面板，不依赖前端框架。

### 6.1 鉴权
- [ ] 简单的 token 鉴权：`.env` 中配置 `ADMIN_TOKEN`
- [ ] 登录页输入 token，验证后存入 session cookie，有效期 24h

### 6.2 页面清单

| 页面 | 路由 | 内容 |
|------|------|------|
| 登录页 | `/` | token 输入框，登录按钮 |
| 首页仪表盘 | `/dashboard` | 总注册用户数、总 ACE 记录数、总奖励数、今日活跃玩家数、当前 nonce 池大小 |
| 用户列表 | `/users` | 表格：nickname / platform / 注册时间 / ACE 记录数 / 操作（查看详情） |
| 用户详情 | `/users/:id` | 基本信息 + 该用户所有 records（尺寸、耗时、日期）+ 该用户所有 rewards |
| 记录列表 | `/records` | 表格：玩家昵称 / 尺寸 / 耗时 / 日期，支持按 rows/cols 筛选 |
| 奖励列表 | `/rewards` | 表格：玩家昵称 / 难度名 / 标题 / 日期，支持按难度筛选 |
| 提交日志 | `/submissions` | 最近提交记录：玩家 / 尺寸 / 是否通过验证 / 时间，支持按状态筛选（全部/通过/未通过） |

### 6.3 API（admin 内部使用，均需 admin token）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/admin/auth` | `{ token }` → 设置 session |
| `GET` | `/admin/summary` | `{ total_users, total_records, total_rewards, today_active, nonce_pool_size }` |
| `GET` | `/admin/users` | 用户列表（支持 `?page=&page_size=`） |
| `GET` | `/admin/users/:id` | 用户详情 + records + rewards |
| `GET` | `/admin/records` | 记录列表（支持 `?rows=&cols=&page=`） |
| `GET` | `/admin/rewards` | 奖励列表（支持 `?difficulty=&page=`） |
| `GET` | `/admin/submissions` | 提交日志（最近 200 条，支持 `?validated=0/1/&page=`） |

### 6.4 前端实现
- [ ] 纯 HTML + 内联 CSS（Tailwind CDN）+ 内联 JS（fetch 调用 admin API）
- [ ] 每个页面一个路由处理函数，返回完整 HTML
- [ ] 表格支持简单分页（上一页/下一页按钮）
- [ ] 移动端友好（响应式表格）

---

## 阶段七：部署与优化

- [ ] `server/` 增加 `Dockerfile`
- [ ] 生产构建前端，产物输出到 `server/public/`，Express 托管静态文件
- [ ] 环境变量管理（`.env`）：`ENCRYPTION_KEY` / `GAME_API_PORT=38001` / `ADMIN_PORT=38002` / `DB_PATH` / `ADMIN_TOKEN`
- [ ] 添加速率限制：`express-rate-limit` 对 `/api/submit` 和 `/api/auth`
- [ ] 账号可疑标记与封禁机制（可选）
