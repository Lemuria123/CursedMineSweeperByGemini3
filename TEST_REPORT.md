# Cursed Minesweeper — ACE 自动化测试报告

> **日期**: 2026-06-05  
> **版本**: v0.2.1  
> **测试环境**: Windows, Node.js, sql.js, Express + Admin :38001/:38002

---

## 一、测试概况

| 测试类型 | 脚本 | 轮次 | 通过 | 失败 | 通过率 |
|----------|------|------|------|------|--------|
| 合法 ACE 提交 | `test_ace_valid.ts` | 10 | 10 | 0 | **100%** |
| 伪造 ACE 提交 | `test_ace_forged.ts` | 10 | 10 | 0 | **100%** |

---

## 二、合法 ACE 测试 (10 轮)

### 测试流程
```
生成唯一设备ID → 注册账号 → 设置昵称
→ 构建 ACE 游戏 (first_reveal + flag, 0 prayers, 无 CSP)
→ 获取 nonce → AES-256-GCM 加密 → POST /api/submit
→ 验证: valid=true, reward=ACE, records/me ✅, rewards ✅, leaderboard ✅
```

### 测试结果

| Rd | Account | Valid | Reward | RecOK | RewOK | LbOK | Time |
|----|---------|-------|--------|-------|-------|------|------|
| 1 | 58134046 | true | ACE | true | true | true | 29ms |
| 2 | 7a22798d | true | ACE | true | true | true | 8ms |
| 3 | daea5f53 | true | ACE | true | true | true | 7ms |
| 4 | 1135ebd0 | true | ACE | true | true | true | 8ms |
| 5 | c10783f5 | true | ACE | true | true | true | 7ms |
| 6 | 0038f253 | true | ACE | true | true | true | 6ms |
| 7 | 8bac1f1e | true | ACE | true | true | true | 6ms |
| 8 | 6528ee3b | true | ACE | true | true | true | 6ms |
| 9 | 5ba68f25 | true | ACE | true | true | true | 6ms |
| 10 | 82ebd80b | true | ACE | true | true | true | 6ms |

### 关键验证点
- ✅ 每次提交独立账号，无冲突
- ✅ `valid: true` — 服务端回放验证通过
- ✅ `reward: ACE` — 奖励正确写入
- ✅ `records/me` — 个人记录正确关联
- ✅ `rewards` — 奖励列表正确展示
- ✅ `records/:rows/:cols` — 排行榜包含该玩家
- ✅ 平均响应时间: 8.9ms（不含首轮 29ms）

---

## 三、伪造 ACE 测试 (10 轮)

### 10 种攻击向量全部正确拒绝

| # | 攻击类型 | 攻击描述 | 结果 |
|---|----------|----------|------|
| 1 | tampered_mine_seed | 修改 mine_seed 为恶意值 | ✅ REJECTED |
| 2 | fake_zero_prayers | 谎报 prayers=0（实际 >0） | ✅ REJECTED |
| 3 | replay_attack | 重复使用同一个 nonce | ✅ REJECTED |
| 4 | missing_first_reveal | 删除 first_reveal，首动作为 reveal | ✅ REJECTED |
| 5 | out_of_bounds | 插入越界坐标 (99,99) | ✅ REJECTED |
| 6 | tampered_dimensions | grid 改为 50×50，与 mine_seed 不匹配 | ✅ REJECTED |
| 7 | empty_actions | action 列表为空 | ✅ REJECTED |
| 8 | wrong_first_action | 首动作为 flag 而非 first_reveal | ✅ REJECTED |
| 9 | impossible_time | total_time_ms=50（低于 100ms 最低限制） | ✅ REJECTED |
| 10 | duplicate_reveal | 重复 first_reveal 同一格子 | ✅ REJECTED |

### 零漏网验证
- ✅ `valid: false` — 全部 10 轮返回拒绝
- ✅ `reward: null` — 无一获得奖励
- ✅ `rewards` 端点无数据泄漏

---

## 四、发现并修复的问题

| # | 问题 | 修复 |
|---|------|------|
| 1 | `rewards.id` 单 PK 导致多账号同尺寸冲突 | 改为 `PRIMARY KEY (id, account_id)` 复合主键 |
| 2 | `saveDb()` 同步写磁盘阻塞，高并发下崩溃 | 改为 debounced `scheduleSave()` (500ms 延迟) |
| 3 | `verifySubmission` 内部 CSP 异常导致服务端 crash | 加 try/catch 返回 `valid:false` 而非 500 |
| 4 | 无 `total_time_ms` 和时间戳一致性校验 | 新增: 最低 100ms + 不小于最后 action ts |
| 5 | 无 mine_seed 与 grid config 一致性校验 | 新增: seed 前缀必须匹配 `rows-cols-mines-` |
| 6 | 伪造测试中 duplicate 插入末尾被 status break 跳过 | 改为 splice 插入中间（游戏结束前） |

---

## 五、反作弊有效性总结

```
                    防御层
┌─────────────────────────────────────────────┐
│ 传输加密  │ AES-256-GCM, 错误密钥→拒         │
│ Nonce     │ 一次性, 5min 过期, 重放→拒       │
│ 数据校验  │ seed 匹配, time 范围, prayer 一致 │
│ CSP 回放  │ 确定性 RNG, 逐 action 合法性     │
│ 终态校验  │ checkWin 必须 true               │
└─────────────────────────────────────────────┘

攻击向量覆盖:
  数据篡改 ✅  重放攻击 ✅  时间伪造 ✅  维度伪造 ✅
  空数据 ✅    类型伪造 ✅  越界攻击 ✅  重复操作 ✅
```

## 六、测试脚本

- **合法 ACE**: `server/src/test_ace_valid.ts` — `cd server && set ENCRYPTION_KEY=... && npx ts-node --transpile-only src/test_ace_valid.ts`
- **伪造 ACE**: `server/src/test_ace_forged.ts` — `cd server && set ENCRYPTION_KEY=... && npx ts-node --transpile-only src/test_ace_forged.ts`
- **JSON 结果**: `test_ace_valid_results.json` / `test_ace_forged_results.json`
