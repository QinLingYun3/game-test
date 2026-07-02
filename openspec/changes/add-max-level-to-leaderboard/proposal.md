## Why

当前排行榜只记录分数，无法反映玩家在"闯关"模式下的进度深度。增加最大关卡数字段可以让玩家看到谁闯过了更多关卡，增强排行榜的竞争维度。

## What Changes

- 排行榜数据结构增加 `maxLevel` 字段，记录玩家在"闯关"模式下到达的最大关卡数
- 只在玩家选择"闯关"（difficulty === "default"）时记录和显示最大关卡数
- 提交分数时同步提交 `maxLevel`
- 排行榜 UI 增加最大关卡数显示
- 只记录新记录：如果同一 session 的 `maxLevel` 比之前的高才更新，不覆盖已有记录

## Capabilities

### New Capabilities
- `leaderboard-max-level`: 排行榜最大关卡数记录与展示

### Modified Capabilities
<!-- 无现有 spec 需要修改 -->

## Impact

- `server/server.js`：leaderboard 数据结构、提交逻辑、序列化逻辑
- `src/App.jsx`：提交分数时传入 maxLevel，排行榜显示
- `src/i18n.js`：新增 leaderboard.maxLevel 翻译
- `solo-leaderboard.json`：持久化数据结构新增 maxLevel 字段
