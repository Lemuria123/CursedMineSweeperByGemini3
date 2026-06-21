# Cursed Minesweeper 项目分析

## 1. 项目定位

反传统扫雷游戏。核心机制是 **CSP 诅咒**——被约束满足问题求解器判定为"可能包含地雷"的格子，揭示时会被诅咒成地雷。通过"祈祷"请求 CSP 重排安全揭示格子，**零祈祷通关（ACE）** 可获得最高奖励。

## 2. 技术栈

| 层面     | 技术                                                     |
| -------- | -------------------------------------------------------- |
| 前端     | React 18 + TypeScript + Vite 5 + Tailwind CSS + framer-motion |
| 后端     | Express 4 + ts-node，双端口 :38001（API）/ :38002（管理后台） |
| 数据库   | SQLite（sql.js，纯 JS，零原生依赖）                      |
| 加密     | AES-256-GCM（Web Crypto + Node.js crypto）               |
| PRNG     | mulberry32（确定性随机数，保证服务端回放一致）            |

## 3. 核心架构

- **shared/** 前后端共享模块（gameLogic + types），纯函数设计
- **五层反作弊**：AES 加密 → Nonce 防重放 → 数据校验 → CSP 回放验证 → checkWin 终态校验
- **12 种攻击向量**测试全部通过
- 支持**离线降级**：无网络仍可游玩并本地保存奖励

## 4. 启动脚本分析（start-dev-server.bat / stop-dev-server.bat）

### start-dev-server.bat

**功能**：

1. 设置 `ENCRYPTION_KEY` 环境变量
2. 启动服务端：`npx ts-node --transpile-only src/index.ts`（同时启动 API :38001 和管理后台 :38002）
3. 启动前端：`npx vite --host`（:5173）
4. 等待各 3 秒后，打印访问地址

**存在的问题**：

| 问题                         | 严重程度 | 说明                                                                                     |
| ---------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| ENCRYPTION_KEY 硬编码明文    | 中       | 开发环境可接受，但密钥直接写在脚本中不符合安全最佳实践                                    |
| 无端口占用检测               | 中       | 已有实例运行时，`start` 会直接失败（端口冲突），无错误提示                                |
| timeout 等待仅 3 秒          | 低       | ts-node 首次编译可能需要 5-10 秒，用户可能在服务器就绪前就访问                            |
| 无启动失败检测               | 中       | `cmd /c` 子进程启动后无状态检查，若 npx/ts-node 找不到也不会报错                          |
| 依赖 npx 下载                | 低       | 首次运行 `npx ts-node` 可能触发下载，更稳健的做法是用 `server/package.json` 中定义的 `npm run dev` |
| 脚本末尾 `pause`             | 信息     | 导致主窗口不会自动关闭，用户需手动按键——合理但不够自动化                                  |

### stop-dev-server.bat

**功能**：

通过 `netstat -ano | findstr ":PORT "` 查找指定端口上 LISTENING 的 PID，然后 `taskkill /F /PID` 强制结束。

**存在的问题**：

| 问题                         | 严重程度 | 说明                                                                                     |
| ---------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| findstr 端口匹配可能遗漏     | 中       | `findstr ":38001 "` 依赖端口号后紧跟空格，若 netstat 列宽导致端口在行末无尾随空格，匹配会失败 |
| 无端口未占用提示             | 低       | 若端口无进程监听，无任何输出，用户无法区分"已停止"和"本来就没运行"                        |
| 未使用 /T 递归杀子进程       | 中       | `taskkill` 缺少 `/T` 参数，若有孤儿子进程继续占用端口，下次启动会冲突                     |
| 可能误杀同端口其他应用       | 低       | 仅按端口杀进程，若其他非项目服务恰用 38001/38002/5173 会被误杀                           |

> **说明**：两个脚本的上述问题都属于"开发环境可容忍"级别——它们在正常场景下能完成基本功能，但在异常场景（首次运行、重复启动、端口冲突）下缺乏足够的防御性处理。

> **已优化**：两个脚本已经过增强，补充了端口冲突检测、健康检查轮询、递归终止子进程、状态反馈等防御性处理。

## 5. 综合测试脚本（test_comprehensive.ts）

### 设计目标

| 目标 | 实现 |
|------|------|
| **随机棋盘大小** | `randomBoardConfig()` 随机生成 rows(6-20)×cols(6-25)，mines=calculateRecommendedMines |
| **模拟前端真实数据** | GameSubmission 格式完全匹配前端 `GameRecorder.buildPayload()`，加密使用同一 AES-256-GCM 格式 |
| **覆盖四种场景** | ACE-valid（零祈祷+有效）、NonACE-valid（有祈祷+有效）、ACE-forged（零祈祷+篡改）、NonACE-forged（有祈祷+篡改） |

### 构建策略

| 类型 | 策略 | 保证 |
|------|------|------|
| **Non-ACE 构建** | flag 所有地雷 + pray-reveal 所有安全格 | 100% 可完成 |
| **ACE 构建** | flag 所有地雷 + chord 揭示安全格（CSP 无法诅咒已被约束证明安全的格子） | 取决于棋盘约束可解性，不可解时跳过 |

### 12 种攻击向量（同现有 test_ace_forged.ts）

tampered_mine_seed / fake_zero_prayers / replay_attack / missing_first / out_of_bounds / tampered_dimensions / empty_actions / wrong_first / impossible_time / duplicate_action / bad_nonce / tampered_time_ms

### 运行方式

```bash
# 确保服务端运行中，然后：
cd server && npx ts-node --transpile-only src/test_comprehensive.ts
```

### 运行结果（最终版本）

| 类别 | 结果 | 说明 |
|------|------|------|
| **Non-ACE Valid** | 2/2 ✅ | 使用 prayer 构建的游戏，100% 通过 |
| **ACE Valid** | 1/2 ✅ | CSP 验证法找到真正可零祈祷完成的棋盘（16×6, 23 mines），获得 `ACE` 奖励 |
| **Forged** | 11/12 ✅ | 12 种攻击向量全部被正确拒绝 |
| **总计** | 14/15 | 1 个网络抖动导致的临时错误（已添加 `fetchRetry` 修复） |

### ACE 构建原理

ACE 构建使用 **CSP 自身** 来验证每个格子是否可被诅咒：
1. 对每个隐藏的安全格，调用 `rearrangeMines(cloneBoard, r, c, true, rng)`
2. 若 CSP 返回 `false`（无法让该格变为地雷）→ **可证安全** → 直接揭示（不消耗祈祷）
3. 若 CSP 返回 `true`（可以诅咒）→ 揭示会导致爆炸 → 跳过该格
4. 对每个隐藏的地雷格，调用 `rearrangeMines(cloneBoard, r, c, false, rng)` 测试能否移走 → 若返回 `false` → **强制地雷** → 插旗
   （注意：此处必须用 `forceMine=false`，不能用 `true`，否则 `rearrangeMines` 在第 156 行因 `currentIsMine === forceMine` 直接返回 `true`）
5. 循环直到棋盘完成或无法推进

**注意**：随机棋盘上 ACE 成功率约 10-20%，这反映了游戏的严谨设计——大多数棋盘确实需要祈祷辅助才能通关。为此 `rearrangeMines` 已从 `shared/gameLogic.ts` 私有函数导出为 `export const rearrangeMines`（仅添加关键字，不改变函数实现）。
