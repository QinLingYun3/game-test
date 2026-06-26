## Why

现有 combo 计分公式 `100 × 1.5^n` 是指数增长，高 combo 玩家一次消除可得数百万分，导致排行榜出现 800 多万的离谱分数，完全失去平衡。

## What Changes

- combo 窗口从 2s 缩短到 1.5s，更难叠 combo
- combo 计分从指数改为分段线性：
  - combo 0: 100
  - combo 1-4: 100 + 20 × combo
  - combo 5-9: 100 + 50 × combo
  - combo 10-19: 100 + 100 × combo
  - combo 20+: 100 + 300 × combo

## Impact

- Affected code: `shared/game.js`（`getScoreDeltaForCombo`）, `server/roomManager.js`（`COMBO_WINDOW_MS` 已定义）
- 前后端共享 `getScoreDeltaForCombo`，改一处即可
- 影响所有模式：单人、多人、Fever
