## Context

当前排行榜系统存储在 `server/server.js` 中，使用内存数组 `soloLeaderboard` 和 `solo-leaderboard.json` 文件持久化。每个 entry 包含 `sessionId`, `nickname`, `avatarSeed`, `score`, `submittedAt`, `order`。前端通过 WebSocket 获取排行榜数据并展示在一个模态框中。

目前只有一个总榜，按 `score` 降序排列，取前 20 名。`submittedAt` 字段已存在，可用于时间维度过滤。

## Goals / Non-Goals

**Goals:**
- 服务端支持按日/周/月/总榜四个维度过滤排行榜数据
- 前端增加 Tab 切换，默认展示日榜
- 保持向后兼容（不提交 `period` 时返回总榜）
- 日/周/月的定义基于服务器本地时间

**Non-Goals:**
- 不修改持久化数据格式（继续使用现有 `solo-leaderboard.json`）
- 不增加新的存储机制（不引入数据库）
- 不修改分数计算逻辑
- 不增加排行榜条目数量限制（保持 20 条）

## Decisions

### 1. 时间维度过滤在服务端完成
**决策**：`getLeaderboardPayload(period)` 在服务端根据 `submittedAt` 过滤，而非前端过滤。
**理由**：
- 减少数据传输量
- 避免暴露全部历史数据到前端
- 与现有架构一致（排序、截断都在服务端）

**替代方案**：前端过滤 — 被否决，因为会下载全部历史数据。

### 2. 日/周/月基于服务器本地时间
**决策**：使用 `Date.now()`（服务器本地时间）计算日/周/月起止时间。
**理由**：简单、无需时区处理、与现有 `submittedAt` 一致。

**时间范围定义**：
- 日榜：`submittedAt >= 当天 00:00:00`
- 周榜：`submittedAt >= 本周一 00:00:00`
- 月榜：`submittedAt >= 本月 1 日 00:00:00`

### 3. Tab 顺序：日 / 周 / 月 / 总
**决策**：默认选中「日榜」，Tab 顺序为 日 → 周 → 月 → 总。
**理由**：日榜变化最频繁，最能激发玩家每日参与的动力。

### 4. 向后兼容
**决策**：`get_leaderboard` 请求不传递 `period` 时，默认返回总榜（`all`）。
**理由**：避免破坏现有客户端或第三方调用。

## Risks / Trade-offs

- **[Risk]** 服务器时区与玩家时区不一致，导致日/周/月边界感知差异
  → **Mitigation**：项目当前无多时区需求，使用服务器本地时间可接受。未来如需可按 UTC 统一。

- **[Risk]** 日榜数据量过少（某天没人玩）导致榜单为空
  → **Mitigation**：空榜单显示「暂时还没有成绩」提示，与现有空状态一致。

- **[Risk]** 频繁切换 Tab 导致大量 WebSocket 请求
  → **Mitigation**：每次切换都请求服务端，数据量小（最多 20 条），影响可忽略。未来可前端缓存。

## Migration Plan

无需迁移。现有 `solo-leaderboard.json` 数据格式不变，`submittedAt` 字段已存在。新代码上线后，旧数据自动兼容（旧 entry 的 `submittedAt` 会被正确过滤）。

## Open Questions

- 是否需要缓存各维度榜单以减少重复计算？（当前数据量小，暂不实现）
