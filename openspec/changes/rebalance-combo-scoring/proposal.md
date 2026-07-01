## Why

现有 combo 计分公式 `100 × 1.5^n` 是指数增长，高 combo 玩家一次消除可得数百万分，导致排行榜出现离谱分数，完全失去平衡。同时，统一的 2 秒 combo 窗口对所有难度一视同仁，容易难度下玩家难以感受到 combo 的爽快感，困难难度下又过于宽松。

## What Changes

- combo 窗口根据难度动态调整：
  - 容易：1 秒
  - 中等：1.4 秒
  - 困难：1.8 秒
- combo 计分系数根据难度动态调整：
  - 容易：1.1 倍
  - 中等：1.3 倍
  - 困难：1.6 倍
- 新增 `getComboWindowMs(difficulty)` 和更新 `getScoreDeltaForCombo(comboCount, difficulty)` 函数
- 前后端同步更新，确保单人模式和多人模式一致

## Impact

- `shared/game.js`：`getScoreDeltaForCombo` 新增 difficulty 参数，`COMBO_WINDOW_MS` 替换为 `getComboWindowMs(difficulty)`
- `server/roomManager.js`：导入并使用新的 combo 窗口函数
- `src/App.jsx`：`computeSoloCombo` 传入当前关卡难度
- 影响所有模式：单人、多人、Fever
