## Context

现有排行榜系统存储在 `server/server.js` 中，使用内存数组 `soloLeaderboard` 和 `solo-leaderboard.json` 文件持久化。每个 entry 包含 `sessionId`, `nickname`, `avatarSeed`, `score`, `submittedAt`, `order`。前端通过 WebSocket 获取排行榜数据并展示。

单人模式支持难度选择（闯关/容易/中等/困难）和关卡选择。只有闯关模式会按顺序推进关卡。

## Goals / Non-Goals

**Goals:**
- 在排行榜中记录闯关模式玩家的最大关卡数
- 排行榜 UI 显示最大关卡数
- 只记录新记录（不覆盖已有记录）

**Non-Goals:**
- 不修改非闯关模式的排行榜行为
- 不修改分数排序逻辑（分数仍是主要排序依据）
- 不引入新的持久化存储方案

## Decisions

### 1. maxLevel 只在 difficulty === default（闯关）时记录
**决策**：前端提交分数时，只有当 `soloDifficulty === "default"` 时才传入 `maxLevel`，否则传 `null`。
**理由**：容易/中等/困难模式可以选择任意关卡，最大关卡数没有意义。

### 2. 后端存储 maxLevel，但排序仍以分数为主
**决策**：`maxLevel` 不参与排序，只作为展示字段。
**理由**：排行榜的核心竞争维度仍是分数，最大关卡数作为附加信息展示。

### 3. 只记录新记录：同一 session 的 maxLevel 只增不减
**决策**：如果同一 session 已经提交过，且新的 `maxLevel` 比之前的高，则更新；否则不更新。
**理由**：防止玩家重复提交低关卡数覆盖已有记录。

### 4. 向后兼容已有 leaderboard 数据
**决策**：`sanitizeLeaderboardEntry` 中 `maxLevel` 默认为 `null`，已有数据无此字段时不会报错。
**理由**：避免已有 `solo-leaderboard.json` 数据格式不兼容导致加载失败。

## Risks / Trade-offs

- **[Risk]** 已有 `solo-leaderboard.json` 数据没有 `maxLevel` 字段
  -> **Mitigation**：`sanitizeLeaderboardEntry` 中 `maxLevel` 默认为 `null`，向后兼容
- **[Risk]** 非闯关模式的玩家看到排行榜上的 maxLevel 感到困惑
  -> **Mitigation**：前端只在 `maxLevel` 有值时显示，无值时不显示该字段
