# 324 宝物资源体系 — 需求与实施计划

> 本文档记录 2026-06-21 经 `/grill-me` 会话对齐的全部需求与实施计划。  
> 实施状态：待开发（计划阶段）。

---

## 1. 背景与目标

为扫雷游戏 **8×8～25×25** 全部棋盘尺寸（共 **324** 格）设计奖品体系。玩家以 ACE 通关某尺寸后获得对应宝物；宝物可在 Grimoire（法典）中查看。

**核心目标：**

1. 每个棋盘尺寸有独立的宝物：**名称、图标、打开后说明文字**。
2. 内区棋盘的说明文字来自小说 [`星系殖民指南.md`](星系殖民指南.md)，**打乱顺序**分配到各格，但保留**原书阅读顺序**的「下一宝物」链。
3. 三个预设难度 + 25×25 有特殊内容（封面 / 作者自序三段）。
4. 所有资源存放在 `resource/`；名称、图标文件名、说明文字汇总于一个 MD 文件。
5. 图标为**本地图片文件**（游戏史上著名虚拟道具，便于搜图），**不用 emoji**。

**现有代码基线（实施前）：**

- 棋盘矩阵范围：`MIN_ROWS/COLS=8`，`MAX_ROWS/COLS=25`（[`components/LeaderboardModal.tsx`](components/LeaderboardModal.tsx)）。
- 预设难度：Easy 9×9、Medium 16×16、Hard **26×16**（错误，需改为 25×16）（[`App.tsx`](App.tsx)）。
- 奖品模板表 `reward_templates`：仅 `name/icon/content/type/hue`（[`server/src/db.ts`](server/src/db.ts)）。
- 详情页**未展示** `reward.content`，为硬编码英文占位（[`components/LeaderboardModal.tsx`](components/LeaderboardModal.tsx)）。

---

## 2. 需求清单

### 2.1 每个宝物的四要素

| 要素 | 说明 |
|------|------|
| **名称** | 游戏史上著名虚拟道具名（例：魔兽世界风剑、明日方舟原石），便于搜索对应图标 |
| **图标** | 本地图片文件，存 `resource/icons/` |
| **说明文字** | 打开奖品后展示的正文（见 2.3 分类规则） |
| **下一宝物** | 按小说**原本顺序**的下一段落所在棋盘尺寸，便于用户从头到尾阅读 |

### 2.2 特殊尺寸（固定内容，不参与正文打乱）

| 棋盘 | 内容类型 | 说明 |
|------|----------|------|
| **9×9** | 书的封面 | `type=image`；AI 生成《星系殖民指南》封面图 |
| **16×16** | 作者自序 · 第一段 | 原文行 10–13 |
| **25×16** | 作者自序 · 第一个重点 | 原文行 15、17–18 |
| **25×25** | 作者自序 · 第二个重点及最后部分 | 原文行 20、22 |

**自序原文对照（[`星系殖民指南.md`](星系殖民指南.md)）：**

- **16×16 第一段**：作者身份、写作动机（「我是 David Henryschein…」至「成功者的成功经验。」）
- **25×16 第一个重点**：「在超空间技术实现之后…」准备工作重点 + 「殖民的成功率…」三阶段框架
- **25×25 第二重点+结尾**：「本书的第二个重点是分享经验…」+ 「指南的最后章节里…」

### 2.3 正文分配规则

**段落统计方法（Grill 确认）：**

- 原文许多段落之间**无空行**，不能仅按空行切块。
- 按**每个非空正文行**计为一段（排除 `#` 标题、`---`、作者署名行）。
- 全文正文段：**279** 段（自序 9 + 正文 270）。

**棋盘分区：**

| 分区 | 条件 | 数量 | 说明文字 |
|------|------|------|----------|
| **边缘区** | `row=8` 或 `col=8` | **35** | **不分配小说段落**；有名称+图标；打开后文字为**道具说明**（宝物 lore） |
| **内区** | `row≥9` 且 `col≥9` | **289** | 4 个特殊格 + 285 个小说段落格 |

**内区正文分配：**

- 自序 9 段已全部用于 3 个特殊自序格 + 阅读链，**不再进入打乱池**。
- 正文 270 段需填满 **285** 个格子 → 从中选取句子最多的 **15** 段，按**整句边界**（。！？）一分为二，凑满 285 单元。
- **硬性约束：不得切开句子**，必须保留整句完整性。
- 285 个正文单元**打乱顺序**随机映射到 285 个内区格子（排除 9×9、16×16、25×16、25×25）。
- 「下一宝物」按小说**原序**计算，与格子在矩阵中的位置无关。

### 2.4 边缘区（8×* / *×8）行为

- **可获得奖品**（ACE 后正常解锁）。
- 有**名称 + 图标**。
- 打开后文字 = **道具说明**（非小说段落）。
- **不参与**小说阅读链（`novel_index = -1`）。
- 连续阅读模式**不包含**边缘格。

### 2.5 难度与尺寸修正

| 议题 | 决策 |
|------|------|
| Hard 难度 | 改为 **25×16**（当前 26×16 为错误配置；矩阵最大 25×25，无法选中 26×16） |
| 25×25 | **不加入预设难度**；仅作为矩阵内特殊宝物格（自序第三段） |
| 预设难度最终 | Easy 9×9、Medium 16×16、Hard 25×16 |

### 2.6 图标与素材流程

1. **先**编写脚本搜索/整理 **324** 个著名游戏道具**名称**，生成 `artifacts.md` 骨架。
2. **再**写脚本按名称**搜图、存图**到 `resource/icons/`，在 MD 中记录图片路径关系。
3. **最后**写脚本从 MD **写入数据库** `reward_templates`。
4. 9×9 封面：**AI 生成**（nanobanana 或可用图像模型），存 `resource/covers/grimoire-cover.png`。
5. 图标搜图失败项标记 `pending`，不阻断流水线；记录来源 URL（版权注意）。

**用户明确拒绝：** emoji 作为图标。

### 2.7 UI 需求（宝物详情页重做）

当前详情页设计不足，需重新排版：

| 要求 | 说明 |
|------|------|
| 图标尺寸 | **不宜过大**（建议 48–64px 级别） |
| 正文 | 展示 `content`，支持**大量文字** |
| 滚动 | 正文区可滚动；**禁止内外双层纵向/横向滚动条** |
| 下一宝物 | 按钮跳转；**未获得**则不可跳转，提示需先 ACE 该尺寸 |
| 连续阅读 | 按 `novel_index` 原序自动打开**下一宝物详情**；下一格未获得则停止并提示 |
| 卡片列表 | 有 `icon` 时显示本地小图；封面类仍可用 `content` 大图 |

---

## 3. 数据模型与阅读链

### 3.1 阅读链（289 单元，`novel_index` 0–288）

仅内区小说相关宝物参与：

```
0   → 9×9   封面（image）
1   → 16×16 自序第一段
2   → 25×16 自序第一重点
3   → 25×25 自序第二重点+结尾
4–288 → 正文 285 单元（270 段 + 15 次按句拆分），打乱映射到 285 个内区格
```

每个单元记录 `next_novel_index`；脚本反查该序号对应的 `rows-cols` 写入 `next_rows`、`next_cols`。

### 3.2 `artifacts.md` 字段（单文件汇总）

存放路径：`resource/artifacts.md`

| 字段 | 说明 |
|------|------|
| `rows`, `cols` | 棋盘尺寸 |
| `name` | 道具名称 |
| `icon` | 相对路径，如 `icons/wow-thunderfury.png` |
| `content` | 打开后正文 |
| `type` | `text` / `image` |
| `novel_index` | 阅读链序号；边缘格为 `-1` |
| `next_rows`, `next_cols` | 原序下一宝物棋盘（脚本生成） |
| `content_kind` | `cover` / `preface` / `novel` / `item_lore` |
| `icon_source` | （可选）图标来源 URL，备注用 |

### 3.3 数据库扩展

`reward_templates` 与 `rewards` 表新增：

```sql
novel_index   INTEGER DEFAULT -1
next_rows     INTEGER DEFAULT 0
next_cols     INTEGER DEFAULT 0
content_kind  TEXT DEFAULT 'item_lore'
```

玩家获奖时固化 `next_*`，避免后续模板改动影响已有记录。

`icon` 字段语义改为**图片路径**（通过 `public/icons/` 或 Vite 静态资源暴露）。

### 3.4 API / 类型扩展

- `GET /api/reward-templates`、`GET /api/rewards/:accountId` 返回新字段。
- 前端 `CursedReward`（[`types.ts`](types.ts)）增加 `novelIndex?`、`nextRows?`、`nextCols?`、`contentKind?`。

---

## 4. 资源目录结构

```
resource/
  星系殖民指南.md              # 小说原文（已有）
  PLAN-324-artifacts.md        # 本计划文档
  artifacts.md                 # 324 宝物主数据表（待生成）
  icons/                       # 324 个本地图标（待生成）
  covers/
    grimoire-cover.png         # 9×9 封面（AI 生成，待生成）
```

---

## 5. 脚本流水线

目录建议：`scripts/artifacts/`

| 顺序 | 脚本 | 职责 |
|------|------|------|
| 1 | `compile-names.ts` | 生成 324 道具名；写 `artifacts.md` 骨架（`rows/cols/name`）；文件名规范 `icons/{ip}-{slug}.png` |
| 2 | `split-novel.ts` | 读小说切段、拆 15 段、打乱分配、填 `content`/`novel_index`/`next_*`；边缘格填道具说明模板 |
| 3 | `generate-cover.ts` | AI 生成封面 → `resource/covers/grimoire-cover.png` |
| 4 | `fetch-icons.ts` | 按名称搜图、下载到 `icons/`、回写 MD；失败标 `pending` |
| 5 | `seed-db.ts` | 从 `artifacts.md` 批量写入 `reward_templates` |

正文打乱使用**固定 seed** 的确定性 shuffle，便于复现与调试。

---

## 6. 代码改造范围

| 文件 | 改造内容 |
|------|----------|
| [`App.tsx`](App.tsx) | Hard 改为 25×16 |
| [`server/src/db.ts`](server/src/db.ts) | 表字段迁移 |
| [`server/src/index.ts`](server/src/index.ts) | API 返回新字段；发奖写入 `next_*` |
| [`server/src/admin.ts`](server/src/admin.ts) | 配置页：`icon` 改路径输入；展示阅读链字段 |
| [`types.ts`](types.ts) | `CursedReward` 扩展 |
| [`utils/api.ts`](utils/api.ts) | 类型与映射 |
| [`components/LeaderboardModal.tsx`](components/LeaderboardModal.tsx) | 详情重做、连续阅读、`ArtifactCard` 图标 |
| 相关测试文件 | Hard 尺寸、奖品字段 |

---

## 7. 风险与约束

- **图标版权**：记录来源；商用需谨慎；允许占位图分批替换。
- **324 图标体量**：第一轮可部分 `pending`，先跑通流程。
- **阅读链 vs 打乱**：展示位置随机；`next_*` 严格按原书顺序。
- **边缘格**：35 格不在阅读链；道具说明可后续人工润色。
- **UI 滚动**：详情弹窗仅正文区一层滚动，符合项目 UI 规范。

---

## 8. 实施顺序与待办

1. 修正 Hard 25×16 + DB 字段迁移
2. `compile-names` + `split-novel` → 产出 `artifacts.md`（可先无图）
3. AI 封面 + 详情页 UI（可用占位数据验证阅读链）
4. `fetch-icons` + `seed-db`
5. Admin / API 联调 + ACE 全流程验收

### 待办 checklist

- [ ] 将 Hard 难度从 26×16 改为 25×16（App.tsx 及相关测试）
- [ ] 扩展 `reward_templates` / `rewards`：`novel_index`、`next_rows`、`next_cols`、`content_kind`
- [ ] 编写 `compile-names.ts`：324 道具名 + `artifacts.md` 骨架
- [ ] 编写 `split-novel.ts`：切段、拆 15 段、打乱、填 content 与阅读链
- [ ] AI 生成 9×9 封面图 → `resource/covers/`
- [ ] 编写 `fetch-icons.ts`：搜图、存图、回写 MD
- [ ] 编写 `seed-db.ts`：MD → 数据库
- [ ] 重做 `LeaderboardModal` 详情：小图标、正文滚动、下一宝物、连续阅读
- [ ] 同步 API、`types.ts`、`ArtifactCard`、admin 配置页

---

## 9. Grill 会话决策记录（问答原文摘要）

| # | 问题 | 用户选择 |
|---|------|----------|
| 1 | Hard 尺寸 26×16 vs 25×16 | **改为 25×16**（26×16 为错误配置） |
| 2 | 324 段切分策略 | 先统计段落；原文很多段之间无空行，按行计段 |
| 3 | 41 段缺口 | **8×* / *×8 不分配小说文本** |
| 4 | 边缘格表现 | 可获得奖品；名称+图标；文字为道具说明 |
| 5 | 图标形式 | **本地图片文件**；emoji 太差 |
| 6 | 图标素材来源 | 先名称 MD → 搜图脚本 → 存图 → 写库脚本 |
| 7 | 自序三段拆分 | 16×16 第一段；25×16 第一个重点；25×25 第二重点+最后 |
| 8 | 封面与 25×25 | **AI 生成封面**；25×25 **不加入预设难度** |
| 9 | 下一宝物 UI | 未获得不可跳转；**连续阅读**；详情页重排（小图标、大文字、可滚动） |

---

*文档版本：v1.0 | 与 Cursor 计划 `324宝物资源体系` 同步*
