# Agent Instructions

## 核心业务需求（不可修改、不可绕过）

在处理宝物质量审核流程时，必须严格遵循以下两条铁律，**绝对禁止**擅自改变处理流程：

### 宝物「名称简单」(name_bad)
1. 执行 `_refix-names.mjs`，从候选池中选取**非黑名单**的新名称
2. 旧名称加入黑名单 `_name_blacklist.json`，永久排除
3. 清空 `image_candidates`（旧候选 URL 属于改名前的宝物，必须清除）
4. 执行补图（调用 `fetch-real-icons.mjs` 搜索候选图片 URL）
5. 最终状态：`quality_status = ''`（未验收），供用户审核

### 宝物「图片不对」(image_bad)
1. **不修改名称、不修改 icon 字段**
2. 只清空 `image_candidates`
3. 执行补图流程（调用 `fetch-real-icons.mjs` 搜索候选图片 URL）
4. 最终状态：`quality_status = ''`（未验收），供用户审核

> **绝对禁止**：标记 image_bad 时清除 icon 字段 —— 这会导致 `_refix-names.mjs` 解析 slug 为空字符串，验证逻辑崩溃。

## CRITICAL RULE: 不确定需求时必须问用户

在修改任何代码之前，如果对需求、预期行为、边界情况有任何不确定，**必须先向用户提问确认**，绝对禁止猜测后直接改代码。这条规则优先级高于所有其他规则。

## Agent skills

### Issue tracker

Issues and specs for this repo live in GitHub Issues (use the `gh` CLI). See docs/agents/issue-tracker.md.

### Triage labels

Canonical mattpocock triage roles mapped to this repo's label strings. See docs/agents/triage-labels.md.

### Domain docs

Single-context layout: root GLOSSARY.md and docs/adr/. See docs/agents/domain.md.

