# 324 宝物资源体系 — 需求总纲

> **版本**：v3.0（补图与重找逻辑并入）
> **创建**：2026-06-21
> **最后更新**：2026-06-23
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
| `server/src/db.ts` | `reward_templates` 表结构 + 迁移 + `reloadFromDisk()` |
| `server/src/admin.ts` | 管理后台全部功能（含手动/自动补图、手动/自动重找、质量标记、子进程监控） |
| `server/src/index.ts` | API 返回宝物数据，ACE 通关时发放宝物奖励 |
| `types.ts` | `CursedReward` 接口 |
| `scripts/artifacts/fetch-real-icons.mjs` | v2.0 真实图标搜索引擎（Wiki API → Bing → 下载处理 → 质量门禁） |
| `scripts/artifacts/fetch-icons.mjs` | v1.0 占位图标生成器（64×64 灰色 PNG） |
| `scripts/artifacts/_refix-names.mjs` | 重找名称引擎（3000+ 候选池、贪心匹配、直接写 DB） |
| `scripts/artifacts/_icon_hashes.json` | 图标 MD5 去重注册表（跨进程共享） |
| `scripts/artifacts/_name_blacklist.json` | 永久排除的名称黑名单 |

---

## 13. 补图（图标补充）详细逻辑

### 13.1 触发方式

补图流程用于处理标记为 `image_bad`（图片不对）或完全没有图标的宝物。三种触发方式：

| 触发方式 | 入口 | 处理范围 |
|---------|------|---------|
| **手动单件** | 管理后台 `/reward-config` 点击「🔧 补图」按钮 | 每次取 1 个 `image_bad` 或空状态宝物 |
| **自动批量** | 管理后台开启「自动补图」开关后由调度器持续驱动 | 每轮 5 件，500ms 间隔循环 |
| **命令行** | 直接执行 `node scripts/artifacts/fetch-real-icons.mjs --slugs=xxx` | 精确指定 slug 列表 |

### 13.2 手动补图流程（`GET /reward-config/fetch-next`）

实现位置：`server/src/admin.ts` 第 1389-1428 行。

```
1. 查询目标宝物
   - 优先 image_bad（用户明确标记），其次空状态
   - 排除 image_processing 状态（防止与自动补图冲突）
   - 排序：image_bad 优先 → updated_at 升序

2. 清理旧图标
   - 删除 resource/icons/{slug}.png + resource/icons/{slug}_[1-5].png
   - 删除 public/icons/{slug}.png + public/icons/{slug}_[1-5].png
   - 确保不留任何旧图残留

3. 调用 fetch-real-icons.mjs
   - 命令: node --max-old-space-size=512 scripts/artifacts/fetch-real-icons.mjs --slugs="{slug}"
   - 超时: 120 秒（2 分钟）
   - 内存限制: 512MB 堆 + 2MB maxBuffer
   - 同步阻塞等待结果

4. 验证并更新
   - 检查 resource/icons/{slug}.png 存在且 > 500 字节
   - 成功 → 清空 quality_status，更新 updated_at
   - 失败 → 返回 500 错误，告知用户
```

### 13.3 自动补图流程（`stepAutoFetch()`）

实现位置：`server/src/admin.ts` 第 1683-1754 行。

```
每轮调度（500ms 间隔）：
┌─────────────────────────────────────────────┐
│ 1. 预分配阶段                                  │
│    - 查询 FETCH_BATCH(5) 个待补图宝物           │
│    - 排除 image_processing 状态                │
│    - 立即标记为 image_processing（防冲突）       │
│    - saveDb() 持久化标记                       │
├─────────────────────────────────────────────┤
│ 2. 并行 worker 阶段                            │
│    每个 worker 处理预分配的一件宝物：            │
│    a) 从 icon 路径提取 slug                    │
│    b) 删除旧图标（resource/ + public/ 主图+候选）│
│    c) 调用 fetch-real-icons.mjs（异步 spawn）  │
│    d) 验证 resource/icons/{slug}.png 存在      │
│    e) 成功 → quality_status=''                 │
│       失败 → quality_status='image_bad'        │
│        （恢复标记，防止无限重试）                │
├─────────────────────────────────────────────┤
│ 3. 释放阶段                                    │
│    - fetchPoolActive = false                   │
│    - 下一轮调度继续                             │
└─────────────────────────────────────────────┘
```

**关键设计**：
- `fetchPoolActive` 互斥锁防止多轮调度并行导致重复捞取
- 预分配 + `image_processing` 标记确保 5 个 worker 各处理不同宝物
- 失败时恢复 `image_bad`，避免同一宝物被无限重试

### 13.4 图标搜索引擎（`fetch-real-icons.mjs` 主流程）

实现位置：`scripts/artifacts/fetch-real-icons.mjs`（共 957 行）。

```
对每个宝物执行以下搜索管线：
┌──────────────────────────────────────────────┐
│ 1. 读取 DB 获取宝物信息                        │
│    - 所有宝物从 reward_templates 表读取         │
│    - 含 name / name_en / source_ip / icon     │
│    - 解析 source_ip 为 gameCn + gameEn        │
│    - 支持 --slugs= 过滤器精确处理指定宝物        │
├──────────────────────────────────────────────┤
│ 2. 幂等性检查                                  │
│    - 用 sharp 读取已存在的资源图标尺寸           │
│    - 若尺寸 ≥ 500×500 且 > 1000 字节 → 跳过    │
│    - 同步到 public/icons/ 后 continue          │
├──────────────────────────────────────────────┤
│ 3. Wiki 域名匹配                               │
│    - 遍历 GAME_WIKI_MAP（100+ 条映射）          │
│    - 匹配优先级：gameCn 精确 → gameCn 子词      │
│      → gameCn 子串 → gameEn                   │
│    - 例: "魔兽世界" → wowpedia.fandom.com      │
├──────────────────────────────────────────────┤
│ 4. Wiki API 搜索（最优先搜图渠道）              │
│    ┌──────────────────────────────────────┐   │
│    │ a) pageimages API                     │   │
│    │    - 获取信息框主图原件（最精准）         │   │
│    │    - piprop=original|thumbnail         │   │
│    │    - pithumbsize=500                   │   │
│    │                                       │   │
│    │ b) parse API（批量抓取页面图片）        │   │
│    │    - 获取页面内所有 File: 图片          │   │
│    │    - 文件名相关性过滤                   │   │
│    │      （必须含物品英文名关键词）          │   │
│    │    - 排除 SVG/音频/UI 装饰/Logo         │   │
│    │    - imageinfo 批量查询（每批 10 张）    │   │
│    │                                       │   │
│    │ c) search API（页面名不匹配时回退）      │   │
│    │    - 搜索最多 3 个匹配页面重试           │   │
│    └──────────────────────────────────────┘   │
├──────────────────────────────────────────────┤
│ 5. Bing Images 回退（Wiki 候选 < 5 张时触发）   │
│    - 英文搜索: "{nameEn} {gameEn} video game   │
│                 item render transparent"       │
│    - 中文兜底: "{name} {gameCn} 游戏道具"       │
│    - 解析 HTML 中 murl/mediaurl 字段提取原图   │
│    - 垃圾域名过滤（新闻站/素材图库/AI生成站等）  │
│    - 优质域名优先（fandom/wiki/steam/imgur）    │
├──────────────────────────────────────────────┤
│ 6. 图片下载与处理（逐张下载，攒够 5 张即停）     │
│    ┌──────────────────────────────────────┐   │
│    │ a) HTTP 下载原图                       │   │
│    │    - 支持 HTTPS_PROXY 代理             │   │
│    │    - Referer + Wiki UA 防 CDN 403     │   │
│    │    - 30 秒超时                         │   │
│    │                                       │   │
│    │ b) 尺寸/比例预检（sharp 读取源信息）    │   │
│    │    - 任一边 < 128px → 丢弃             │   │
│    │    - 宽高比 > 3:1 或 < 1:3 → 丢弃     │   │
│    │                                       │   │
│    │ c) rembg 抠底                          │   │
│    │    - rembg i input.png output.png     │   │
│    │    - 30 秒超时                         │   │
│    │    - 失败不致命，用原图继续缩放         │   │
│    │                                       │   │
│    │ d) sharp 缩放                          │   │
│    │    - 目标: 500×500 透明底 PNG          │   │
│    │    - fit: 'contain'                   │   │
│    │    - background: rgba(0,0,0,0)        │   │
│    │                                       │   │
│    │ e) 质量门禁（像素级分析）               │   │
│    │    逐像素采样计算以下指标：             │   │
│    │    · 不透明像素占比                    │   │
│    │      < 5% → 拒绝（几乎空白）            │   │
│    │      > 95% 且未抠底 → 拒绝（截图）      │   │
│    │    · 边缘密度（Sobel 简易版）           │   │
│    │      > 50% → 拒绝（文字/UI图）          │   │
│    │      < 6% + 噪声>45 → 拒绝（风景图）    │   │
│    │    · 肤色像素占比                       │   │
│    │      > 40% → 拒绝（人物/肖像图）        │   │
│    │    · 颜色噪声（相邻像素颜色差）          │   │
│    │      > 70 → 拒绝（实物照片）            │   │
│    │    · 文件 < 5KB → 拒绝（空白图）        │   │
│    └──────────────────────────────────────┘   │
├──────────────────────────────────────────────┤
│ 7. 图标去重（跨宝物全局）                       │
│    - MD5 哈希注册表 _icon_hashes.json          │
│    - 每张图片 MD5 计算后查重                    │
│    - 读取时每次重新从磁盘加载（消除并行竞态）    │
│    - 写入时读-改-写 + 验证（最多重试 3 次）      │
│    - 重复图片直接跳过，继续试下一张              │
├──────────────────────────────────────────────┤
│ 8. 输出                                      │
│    - 第 1 张候选 → resource/icons/{slug}.png  │
│                    + public/icons/{slug}.png  │
│    - 第 2-5 张候选 → *_1.png ~ *_4.png       │
│    - 候选图同时复制到 public/icons/            │
│      供 Admin 面板预览                         │
├──────────────────────────────────────────────┤
│ 9. 降级方案（全部引擎无结果时）                 │
│    - 查找已有图标（public/ 或 resource/）       │
│    - rembg 抠底 + sharp upscale 到 500×500    │
│    - 仍失败 → 标记为 failed                   │
└──────────────────────────────────────────────┘
```

### 13.5 占位图标生成（`fetch-icons.mjs`）

实现位置：`scripts/artifacts/fetch-icons.mjs`（共 54 行）。

- 为每个宝物生成 64×64 灰色纯色 PNG 占位图
- 输出到 `resource/icons/` 和 `public/icons/`
- 跳过已存在的图标文件（幂等操作）
- 后续由 `fetch-real-icons.mjs` 替换为真实图标

### 13.6 代理与网络配置

- 通过环境变量 `HTTPS_PROXY` / `https_proxy` 读取代理 URL
- 有代理时通过 `HttpsProxyAgent` 走代理连接
- 无代理时直连
- 通用 User-Agent 模拟 Chrome 125
- HTTP 请求自动跟随重定向（最多 3 次）+ 自动收集传递 Cookie

### 13.7 子进程监控面板

管理后台顶部展示实时监控面板（每 5 秒自动刷新）：
- 正在运行的子进程数（重找 / 图标下载）
- 累计完成数（自服务器启动以来）
- 待处理数（name_bad / 需补图）
- 上次执行状态与时间

---

## 14. 重找宝物详细逻辑

### 14.1 触发方式

重找宝物流程用于处理标记为 `name_bad`（名称过于简单/泛称）的宝物，需要替换为全新的名称和图标。三种触发方式：

| 触发方式 | 入口 | 处理范围 |
|---------|------|---------|
| **手动单件** | 管理后台点击「🔧 重找」按钮 | 每次取 1 个 `name_bad` 宝物 |
| **自动批量** | 管理后台开启「自动重找」开关后由调度器持续驱动 | 每轮 10 件，500ms 间隔循环 |
| **命令行** | `node scripts/artifacts/_refix-names.mjs --coords="8-13,9-20"` | 精确指定棋盘坐标列表 |

### 14.2 手动重找流程（`GET /reward-config/refix-names`）

实现位置：`server/src/admin.ts` 第 1431-1471 行。

```
1. 查询目标宝物
   - 取 1 个 quality_status 含 name_bad 的宝物
   - 排序：updated_at 为空优先 → updated_at 升序

2. 保存 DB（saveDb）
   - 防止子进程直接写磁盘 DB 导致内存数据不一致

3. 调用 _refix-names.mjs
   - 命令: node --max-old-space-size=512 scripts/artifacts/_refix-names.mjs --coords="{rows}-{cols}"
   - 超时: 60 秒
   - 同步阻塞等待结果
   - 从 stdout 解析新 slug: refixOut.match(/new=([^\s]+)/)

4. 下载新图标
   - 调用 fetch-real-icons.mjs --slugs="{newSlug}"
   - 超时: 120 秒

5. 服务器同步
   - await reloadFromDisk() 从磁盘重新加载 DB
   - 更新 updated_at 时间戳
```

### 14.3 自动重找流程（`stepAutoRefix()`）

实现位置：`server/src/admin.ts` 第 1621-1677 行。

```
每轮调度（500ms 间隔）：
┌─────────────────────────────────────────────┐
│ 1. 批量取件                                   │
│    - 查询 REFIX_BATCH(10) 个 name_bad 宝物     │
│    - 合并坐标: "8-13,9-20,10-15,..."          │
├─────────────────────────────────────────────┤
│ 2. 单次子进程调用                              │
│    - _refix-names.mjs --coords="..."          │
│    - 一次性处理 10 件（避免多进程 DB 冲突）     │
│    - 超时 60 秒                                │
├─────────────────────────────────────────────┤
│ 3. 解析输出                                   │
│    - new=slug1,slug2,...                      │
│    - old=slug1,slug2,...                      │
├─────────────────────────────────────────────┤
│ 4. reloadFromDisk()                           │
│    - _refix-names.mjs 已直接写磁盘 DB          │
│    - 必须 reload 才能同步改名结果给内存 DB      │
├─────────────────────────────────────────────┤
│ 5. Fire-and-forget 图标下载                   │
│    - 每个新 slug 异步 spawn 下载进程           │
│    - 不阻塞重找主循环                          │
│    - 失败不影响总体流程                         │
├─────────────────────────────────────────────┤
│ 6. 标记已处理                                 │
│    - quality_status = ''                      │
│    - updated_at = datetime('now')            │
└─────────────────────────────────────────────┘
```

**关键设计**：
- 批量合为单次子进程调用，避免多个 `_refix-names.mjs` 同时写 DB 造成竞争
- `_refix-names.mjs` 直接写磁盘 DB，不走内存 DB
- `reloadFromDisk()` 在标记前调用，防止 `saveDb()` 覆盖改名结果
- 图标下载 fire-and-forget，不阻塞重找循环

### 14.4 重找名称引擎（`_refix-names.mjs`）

实现位置：`scripts/artifacts/_refix-names.mjs`（约 3352 行，含候选池数据）。

```
┌──────────────────────────────────────────────┐
│ 1. 参数解析                                   │
│    - --coords="rows-cols,..." 指定替换目标      │
│    - 转换为棋盘 grid 索引 idx(r,c)=(r-8)*18+(c-8) │
├──────────────────────────────────────────────┤
│ 2. 从 SQLite DB 加载当前全部 324 条宝物数据    │
│    - 读取 rows, cols, name, name_en,          │
│            source_ip, icon                   │
│    - 要求宝物数 ≥ 323（防数据损坏）             │
├──────────────────────────────────────────────┤
│ 3. 计算约束条件                                │
│    - IP 计数: 排除待替换宝物后统计每个 game IP  │
│               已有的宝物数量（上限 3）           │
│    - 已用名称集合: usedN                        │
│    - 已用 slug 集合: usedS                     │
│    - IP 基础名: baseIp() 去除版本号/副标题      │
│      (例: "魔兽世界 经典旧世" → "魔兽世界")     │
├──────────────────────────────────────────────┤
│ 4. 读取黑名单                                  │
│    - _name_blacklist.json                     │
│    - 用户标记为 name_bad 的宝物名永久排除       │
├──────────────────────────────────────────────┤
│ 5. 加载史诗候选池（3000+ 件）                  │
│    - 格式: gameIP|region|ChineseName|          │
│            EnglishName|slug                   │
│    - 解析为 {name, nameEn, ip, slug}           │
├──────────────────────────────────────────────┤
│ 6. 筛选可用候选                                │
│    排除条件（AND 关系）：                       │
│    · 宝物名在已用名称集合中 → 排除              │
│    · slug 在已用 slug 集合中 → 排除             │
│    · 宝物名在黑名单中 → 排除                    │
│    · 来源游戏 IP 已有 ≥ 3 个宝物 → 排除         │
├──────────────────────────────────────────────┤
│ 7. 确定性打乱（Fisher-Yates + Date.now seed）   │
│    - 使用当前时间戳作为随机种子                 │
├──────────────────────────────────────────────┤
│ 8. 贪心匹配替换                                │
│    for 每个待替换宝物:                         │
│      从 shuffled 池中找第一个 name ≠ 旧名       │
│         且 slug ≠ 旧 slug 的候选               │
│      找到后交换到 pool 头部，保证不可重用        │
│      更新 curIp 计数                           │
│      找不到满足条件的 → 报错退出                │
├──────────────────────────────────────────────┤
│ 9. 验证结果                                    │
│    · 无重复名称                                │
│    · 无重复 slug                                │
│    · 所有游戏 IP 不超过 3 个宝物                │
│    任一不满足 → 报错退出                       │
├──────────────────────────────────────────────┤
│ 10. 直接写 SQLite DB                           │
│     - 非替换行: 用原始数据 UPDATE              │
│     - 替换行: UPDATE name, name_en,            │
│               source_ip, icon,               │
│               quality_status=''              │
│     - db.export() + writeFileSync 写入磁盘     │
├──────────────────────────────────────────────┤
│ 11. 收尾清理                                   │
│     a) 黑名单更新: 旧宝物名追加到               │
│        _name_blacklist.json                   │
│     b) 删除旧图标: resource/ + public/ 中       │
│        旧 slug 的主图 + 候选图 _1~_5            │
│     c) 清理 _icon_hashes.json:                 │
│        删除旧 slug 的哈希条目                   │
├──────────────────────────────────────────────┤
│ 12. 输出结果                                   │
│     stdout: new=slug1,slug2,...                │
│             old=slug1,slug2,...                │
│     供调用方（admin.ts）解析使用                │
└──────────────────────────────────────────────┘
```

### 14.5 黑名单机制

**写入**：管理后台标记 `name_bad` 时自动追加
- 位置：`server/src/admin.ts` 第 1371-1383 行（`POST /reward-config/quality`）
- 文件：`scripts/artifacts/_name_blacklist.json`
- 规则：首次标记为 `name_bad` 时，将该宝物名永久加入黑名单

**写入**：重找完成后自动追加
- 位置：`_refix-names.mjs` 第 3305-3316 行
- 规则：被替换掉的旧宝物名自动加入黑名单，防止将来再次选中

**读取**：重找时排除
- 位置：`_refix-names.mjs` 第 54-59 行
- 规则：黑名单中的名称在候选筛选阶段被永久排除

### 14.6 质量标记生命周期

```
宝物创建（quality_status 为空）
       │
       ├── 用户标记 name_bad（名称简单）
       │         │
       │         ├── 名称加入黑名单
       │         └── 触发手动/自动重找
       │                    │
       │                    └── quality_status 清空
       │
       ├── 用户标记 image_bad（图片不对）
       │         │
       │         └── 触发手动/自动补图
       │                    │
       │                    ├── 成功 → quality_status 清空
       │                    └── 失败 → 保持 image_bad
       │
       └── 用户标记 ok（验收通过）
                  │
                  ├── 清理 resource/icons/ 下全部文件
                  ├── 清理 public/icons/ 下候选图 _1~_5
                  └── 仅保留 public/icons/ 下主图标
```

### 14.7 批量模式参数汇总

| 常量 | 值 | 说明 |
|------|-----|------|
| `REFIX_BATCH` | 10 | 自动重找每轮取件数（合并为单次子进程调用） |
| `FETCH_BATCH` | 5 | 自动补图每轮工件数（并行独立下载） |
| `CYCLE_DELAY` | 500ms | 调度循环间隔 |
| `REFIX_TIMEOUT` | 60s | `_refix-names.mjs` 超时 |
| `FETCH_TIMEOUT` | 180s | `fetch-real-icons.mjs` 超时（含 Bing 搜索+下载+rembg） |
| `--max-old-space-size` | 512MB | Node.js 堆内存限制（防 OOM） |

### 14.8 候选池约束规则

重找名称时严格遵守以下约束（全部通过才可替换）：

1. **名称唯一**：新名称不得与任何已有宝物名重复
2. **slug 唯一**：新 slug 不得与任何已有宝物 slug 重复
3. **与原名不同**：新名严格不等于原宝物名，新 slug 严格不等于原 slug
4. **IP 上限**：替换后该游戏 IP 系列宝物总数 ≤ 3
5. **黑名单排除**：不得选用已被永久排除的名称
6. **候选池容量**：3000+ 条唯一命名的虚拟宝物，覆盖游戏 IP 无上限

---

> *本文档为宝物体系唯一权威需求来源。所有与上述规则冲突的代码或脚本都视为 bug，需修正。*
