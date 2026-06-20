# Cursed Minesweeper — 测试流程文档

> 最后更新: 2026-06-20 v0.2.1

## ⚠️ Git 提交规则

**未经用户测试验收，禁止提交任何代码到 Git 仓库。**

开发完成后，必须经过以下流程才能 commit：
1. 用户手动启动服务、在浏览器中验证功能
2. 运行测试脚本（test_ace_valid / test_ace_forged / test_all），确认全部通过
3. 用户明确批准后，方可 `git commit`

AI 助手禁止在用户未验收的情况下自行 `git add` + `git commit`。

---

## 一、环境准备

### 系统要求
- Node.js ≥ 20
- Windows 10/11（PowerShell 5+）
- 端口 38001（游戏 API）、38002（管理后台）、5173（前端开发服务器）未被占用

### 环境变量
```powershell
$env:ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
```

---

## 二、一键启停（开发）

```batch
# 启动（三个窗口：游戏API+管理后台、前端Vite）
start-dev-server.bat

# 停止（根据端口杀进程）
stop-dev-server.bat
```

或手动：

```powershell
# 终端1：服务端（:38001 + :38002 单进程）
cd server
$env:ENCRYPTION_KEY = '...'
npx ts-node --transpile-only src/index.ts

# 终端2：前端
npx vite --host
```

---

## 三、测试套件总览

| 脚本 | 轮次 | 内容 | 预期结果 |
|------|------|------|----------|
| `test_ace_valid.ts` | 20 | 合法游戏提交（ACE + CSP 混合，4×4~16×16） | 20/20 valid，有 ACE 轮次拿到 reward |
| `test_ace_forged.ts` | 12 | 12 种攻击向量，各尺寸 | 12/12 rejected，0 leaked |
| `test_ace_scan.ts` | — | 扫描哪些尺寸可产出 ACE 游戏 | 输出 ACE 可行尺寸列表 |
| `test_all.ts` | 46 | 全栈功能测试（共享模块/服务端/API/Admin/前端） | 46/46 passed |
| `test_security.ts` | 13 | 专项安全测试（nonce 重放/篡改/加密攻击） | 13/13 rejected |

---

## 四、快速回归测试命令

```powershell
cd server
$env:ENCRYPTION_KEY='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

# 1. 清库启动（可选，干净环境）
Remove-Item "data\cursed.db" -ErrorAction SilentlyContinue
npx ts-node --transpile-only src/index.ts  # 另开终端

# 2. 合法 ACE 测试（20 轮）
npx ts-node --transpile-only src/test_ace_valid.ts

# 3. 伪造攻击测试（12 轮）
npx ts-node --transpile-only src/test_ace_forged.ts

# 4. 全栈快速验证（46 项）
npx ts-node --transpile-only src/test_all.ts

# 5. 安全专项（13 项）
npx ts-node --transpile-only src/test_security.ts
```

### 一键全部测试

```powershell
cd server
$env:ENCRYPTION_KEY='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
npx ts-node --transpile-only src/test_ace_valid.ts && echo "---ACE OK---" && npx ts-node --transpile-only src/test_ace_forged.ts && echo "---FORGED OK---" && npx ts-node --transpile-only src/test_all.ts && echo "---ALL OK---"
```

---

## 五、测试结果解读

### test_ace_valid 输出示例

```
╔══════════════════════════════════════════════╗
║  ACE Valid Test — Full Sizes, ACE + CSP     ║
╚══════════════════════════════════════════════╝

[SERVER] OK

[ 1/20] ACE 4x4   2m ✅ valid=true reward=🎁ACE acts= 3 pray= 0 build=  0ms total= 11ms
[ 7/20] CSP 8x8  14m ✅ valid=true reward=--    acts=26 pray=12 build=  6ms total= 12ms
...

╔══════════════════════════════════════════════╗
║  Valid: 20/20 | ACE found: 12 | ACE valid: 12 | Rewarded: 12  ║
╚══════════════════════════════════════════════╝
```

- `Valid: 20/20` — 所有提交通过验证（至少 `prayerCount ≤ prayers_used` 且 `checkWin = true`）
- `ACE found: 12` — 12 个棋盘能通过 flood fill 完成（0 祈祷）
- `Rewarded: 12` — 12 个 ACE 游戏正确获得了 reward
- CSP 行 `reward=--` — 使用了祈祷的游戏正确无奖励

### test_ace_forged 输出示例

```
╔══════════════════════════════════════════════╗
║  ACE Forged Test — 12 Attacks, Mixed Sizes  ║
╚══════════════════════════════════════════════╝

[ 1/12] 4x4(2m) tampered_mine_seed    ✅ REJECTED | 10ms
...
╔══════════════════════════════════════════════╗
║  Rejected: 12/12 | Leaked: 0                ║
╚══════════════════════════════════════════════╝
```

- `Rejected: 12/12` — 所有攻击被拒绝
- `Leaked: 0` — 没有任何伪造数据获得 reward 或通过验证

### 失败排查

| 现象 | 原因 | 解决 |
|------|------|------|
| `Server returned HTML (500)` | 服务端崩溃，检查服务端 terminal 日志 | 常见原因: sql.js WASM crash、DB 文件锁、端口冲突 |
| `valid=false reason:game did not end in win` | builder 与 verifier CSP 发散 | 检查 mine_seed 和 cspRng 是否用同一 hash seed |
| `prayer mismatch` | builder 记录的 prayers_used 与回放 prayerCount 不一致 | builder 中误操作的祈祷次数需同步 |
| 全部返回 `ACCEPTED(BUG!)` | 验证逻辑未生效 | 检查 verify.ts 中的新增校验是否被跳过 |

---

## 六、管理后台验收

```powershell
# 登录
Invoke-WebRequest -Uri "http://localhost:38002/login" -Method POST `
  -Body "token=admin" -ContentType "application/x-www-form-urlencoded"
```

浏览器打开 http://localhost:38002，输入密码 `admin`。

验收要点:
1. Dashboard: Users / ACE Records / Rewards / Today Active 计数正确
2. Records 页: 有测试产生的 ACE 记录
3. Rewards 页: 有测试产生的奖励
4. Submissions 页: Passed/Failed Tab 过滤正常

---

## 七、测试数据清理

```powershell
# 清空测试数据
Remove-Item "server\data\cursed.db" -ErrorAction SilentlyContinue

# 清理测试结果 JSON
Remove-Item "server\test_ace_valid_results.json" -ErrorAction SilentlyContinue
Remove-Item "server\test_ace_forged_results.json" -ErrorAction SilentlyContinue
```

下次启动服务端会自动重建数据库。

---

## 八、已知限制

1. **大棋盘 ACE 概率极低**: 8×8/14雷以上棋盘，flood fill 无法覆盖全部安全格，必须靠 chord+CSP solve 才能通关。这是设计意图——ACE 天然稀有。
2. **sql.js WASM 清理 crash**: Windows 上进程退出时会触发 `UV_HANDLE_CLOSING` assertion。已通过 `uncaughtException` handler 静默，不影响运行。
3. **单进程架构**: 管理后台与游戏 API 必须在同一进程内运行（共享 sql.js 内存数据库），否则会因文件锁冲突损坏 DB。
