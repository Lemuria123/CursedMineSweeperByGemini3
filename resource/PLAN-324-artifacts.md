# 324 宝物资源体系 — 需求总纲

> **版本**：v2.0（需求重梳理）
> **创建**：2026-06-21
> **最后更新**：2026-06-22
> **用途**：宝物体系的唯一需求文档。任何改动先查此文，变更后同步更新。

---

## 1. 背景

为扫雷游戏 **8×8 ~ 25×25** 全部 324 个棋盘尺寸设计奖品体系。玩家 ACE 通关后获得对应宝物，可在 Grimoire（法典）中查看详情。

---

## 2. 宝物四要素

每个棋盘尺寸的宝物由四个要素构成：

| 要素 | 含义 | 要求 |
|------|------|------|
| **名称** | 宝物的中文专有名词 | 必须是游戏中具体命名的道具/角色，**禁止泛称**（如"羽毛""石榴""咖啡"等） |
| **名称英文** | 宝物的英文名 | 对应 game IP 中的官方英文名或约定俗成译名 |
| **图标** | 本地 PNG 图片 | 256×256 透明底 PNG；**单个宝物**的图片，不得含文字、logo、多个泛指物；背景用 `rembg` 移除 |
| **说明文字** | 打开宝物后展示的正文 | 小说段落 / 道具 lore（见 §3） |

---

## 3. 棋盘分区与内容分配

### 3.1 分区定义

| 分区 | 条件 | 数量 | 说明文字来源 | 阅读链参与 |
|------|------|------|-------------|-----------|
| 边缘区 | `row=8` 或 `col=8` | 35 格 | 道具说明（`item_lore`） | 不参与 |
| 内区 | `row≥9` 且 `col≥9` | 289 格 | 4 特殊格 + 285 小说段落 | 参与 |

### 3.2 四个特殊尺寸（固定内容）

| 棋盘 | `content_kind` | `type` | 内容 |
|------|---------------|--------|------|
| 9×9 | `cover` | `image` | 封面图 `/covers/galaxy-colonization-guide-cover.png` |
| 16×16 | `preface` | `text` | 作者自序第一段 |
| 25×16 | `preface` | `text` | 自序第一重点 |
| 25×25 | `preface` | `text` | 自序第二重点+结尾 |

### 3.3 正文分配规则

- 小说 `resource/星系殖民指南.md` 全文切分 → 285 个单元
- 整句切分：**不得切开句子**，按 `。！？` 边界分割
- 打乱映射：固定 seed 的确定性 shuffle（Fisher-Yates + LCG）
- 阅读链严格按**原书顺序**，`next_rows`/`next_cols` 指向下一段落所在棋盘

### 3.4 道具说明文案（`item_lore`）

> 在诅咒与逻辑交汇的深处，你发掘出一件上古遗物——「${name}」，它似乎来自于一个虚拟的世界。

- **不显示**具体游戏 IP 名称
- 文案模板位于 `build-artifacts.mjs` 的 `itemLore()` 函数

---

## 4. 道具名称约束

### 4.1 多样性规则

1. 必须是**有辨识度的专有名词**（游戏中具体命名的道具/角色名）
2. 禁止任何泛称词
3. 同一基准游戏系列**最多 3 个**宝物（DLC/资料片算同一系列）
4. 324 个宝物覆盖 220+ 不同游戏 IP

### 4.2 名称数据文件

路径：`scripts/artifacts/item-names.mjs`

每条记录结构：
```js
{ name: '雷霆之怒，逐风者的祝福之剑', nameEn: 'Thunderfury', ip: '魔兽世界', slug: 'wow-thunderfury' }
```

四项字段**缺一不可**：
| 字段 | 含义 | 示例 |
|------|------|------|
| `name` | 中文名（必须专有名词） | 雷霆之怒，逐风者的祝福之剑 |
| `nameEn` | 英文名 | Thunderfury |
| `ip` | 来源游戏 | 魔兽世界 |
| `slug` | 图标文件名前缀 | wow-thunderfury（对应 icons/wow-thunderfury.png） |

---

## 5. 图标需求

### 5.1 规格

| 属性 | 要求 |
|------|------|
| 尺寸 | 256×256 px |
| 格式 | 透明底 PNG（`rembg` 抠底） |
| 内容 | **单个宝物**，无文字、游戏 logo、多个泛指物 |
| 品质 | 尽量高清、干净的游戏素材图 |
| **每个宝物独立图标** | 严禁不同宝物共用同一张图片 |

### 5.2 获取流程

`fetch-real-icons.mjs` 搜索 → 下载 → `rembg` 抠底 → `sharp` 缩放到 256×256

搜图优先级：Bing（直连）→ 百度（直连）→ Google（需代理）

### 5.3 存储位置

| 目录 | 说明 |
|------|------|
| `resource/icons/` | 原始图标（脚本下载维护） |
| `public/icons/` | 前端静态资源副本 |

---

## 6. 数据模型

### 6.1 `artifacts.md`

由 `build-artifacts.mjs` 生成，**禁止手动编辑**。共 14 列：

| 列 | 说明 | 示例 |
|----|------|------|
| `rows` | 棋盘行数 | 8 |
| `cols` | 棋盘列数 | 8 |
| `name` | 宝物中文名 | 雷霆之怒，逐风者的祝福之剑 |
| `name_en` | 宝物英文名 | Thunderfury |
| `source_ip` | 来源游戏 | 魔兽世界 |
| `icon` | 图标路径 | /icons/wow-thunderfury.png |
| `type` | text / image | text |
| `novel_index` | 阅读链序号（-1=不参与） | -1 |
| `next_rows` | 下一宝物棋盘行数 | 0 |
| `next_cols` | 下一宝物棋盘列数 | 0 |
| `content_kind` | cover / preface / novel / item_lore | item_lore |
| `hue` | 卡片色调 0-360 | 128 |
| `icon_source` | 图标来源 URL（可选） | |
| `content` | 宝物说明正文 | |

### 6.2 `reward_templates` 表（SQLite）

数据库文件：`server/data/cursed.db`

关键字段（除基础字段外）：
- `source_ip` — 宝物来源游戏（不得为 `undefined` 或空）
- `novel_index` — 阅读链序号
- `next_rows` / `next_cols` — 阅读链下一宝物坐标
- `content_kind` — cover / preface / novel / item_lore
- `quality_status` — 质量标记（空=正常，`name_bad`=名称简单，`image_bad`=图片不对，`ok`=验收通过，可逗号组合）
- `icon` — 图标路径（不得为 `/icons/undefined.png`）

---

## 7. 质量审核机制

### 7.1 管理后台 URL

`http://localhost:38002/reward-config`

### 7.2 质量标记

三个复选框（AJAX 即时保存到 `quality_status`）：

| 复选框 | `quality_status` 标记 | 颜色 |
|--------|----------------------|------|
| 名称简单 | `name_bad` | 琥珀色 |
| 图片不对 | `image_bad` | 蓝色 |
| 验收通过 | `ok` | 绿色（行背景变绿） |

可组合标记，如 `name_bad,image_bad`、`ok,name_bad` 等。

### 7.3 筛选功能

- 「🔍 只显示未验收」按钮：筛选 `quality_status` 不含 `ok` 的宝物
- 筛选模式下显示「← 显示全部」按钮返回

### 7.4 预览图

表格中图标预览为 200px 宽，点击可全屏放大。

---

## 8. 前端详情页

### 8.1 Grimoire 宝物详情

- 标题：宝物名称
- 图标：200px 宽，左对齐嵌入正文区
- 正文：`item_lore` 道具说明 / 小说段落
- 底部：「下一章」按钮（阅读链导航）
- **文字可选中、复制**（`select-text`）

### 8.2 类型区分

| `type` | 说明 |
|--------|------|
| `text` | 普通文本正文 |
| `image` | 封面图（如 9×9） |
| `glitch` | 故障风文字特效 |

---

## 9. 管理后台技术

- **Tailwind CSS**：本地编译（`npx tailwindcss -i public/tailwind.css -o public/tailwind.min.css --minify`），不依赖远程 CDN
- 修改 `admin.ts` 后需重新编译 CSS

---

## 10. 脚本流水线

**全量重建顺序（严格遵守）：**

```
1. item-names.mjs       → 道具名列表（手动维护，不自动生成）
2. build-artifacts.mjs  → 读小说 → 切段 → 打乱 → resource/artifacts.md
3. fetch-real-icons.mjs → 搜图 → 下载 → 抠底 → 缩放 → resource/icons/ + public/icons/
4. seed-db.mjs          → artifacts.md → reward_templates 表
```

| 脚本 | 职责 | 用法 |
|------|------|------|
| `item-names.mjs` | 导出 `ITEM_NAMES` 数组（324 条，含 name/nameEn/ip/slug） | 被其他脚本 `import` |
| `build-artifacts.mjs` | 生成 artifacts.md | `node scripts/artifacts/build-artifacts.mjs` |
| `fetch-real-icons.mjs` | 搜图下载处理 | `node scripts/artifacts/fetch-real-icons.mjs` |
| `seed-db.mjs` | artifacts.md → DB | `node scripts/artifacts/seed-db.mjs` |

**重要约束：**
- 改名称后**必须重跑全链路**（build→fetch→seed）
- `seed-db.mjs` 用 `INSERT OR REPLACE` **覆盖**已有数据
- 覆盖前必须备份 `quality_status`（验收标记会被重置）
- `fetch-real-icons.mjs` **增量**下载缺失图标，已有图标跳过
- **严禁**以任何方式引入 `undefined` 名称、`undefined` source_ip 或 `undefined.png` 图标

---

## 11. 资源目录结构

```
resource/
  星系殖民指南.md              # 小说原文
  PLAN-324-artifacts.md        # 本文档（需求总纲）
  artifacts.md                 # 324 宝物主数据（脚本生成）
  icons/                       # 324 个本地图标 256×256 PNG
  covers/
    galaxy-colonization-guide-cover.png  # 9×9 封面

public/
  icons/                       # 前端图标副本
  tailwind.css                 # Tailwind 编译源文件
  tailwind.min.css             # Tailwind 本地编译产物

scripts/artifacts/
  item-names.mjs               # 道具名称列表（手动维护）
  build-artifacts.mjs          # 主数据构建
  fetch-real-icons.mjs         # 图标下载处理
  seed-db.mjs                  # 数据库写入
```

---

## 12. 对应代码文件清单

| 文件 | 涉及内容 |
|------|---------|
| `index.html` | 全局 `select-none`（详情页用 `select-text` 覆盖） |
| `components/LeaderboardModal.tsx` | 宝物详情页（图文混排、阅读链导航、文字可选中） |
| `server/src/db.ts` | `reward_templates` 表结构 + 迁移 |
| `server/src/admin.ts` | 管理后台全部功能 |
| `server/src/index.ts` | API 返回宝物数据 |
| `types.ts` | `CursedReward` 接口 |

---

> *本文档为宝物体系唯一权威需求来源。所有与上述规则冲突的代码或脚本都视为 bug，需修正。*
