## Context

计分在 `shared/game.js` 的 `getScoreDeltaForCombo` 中定义，前后端共享。combo 窗口原在 `server/roomManager.js`（`COMBO_WINDOW_MS = 2000`）和 `shared/game.js`（`COMBO_WINDOW_MS = 2000`）各有一份。

## Decisions

1. **combo 窗口根据难度动态调整**
   - 容易 1s / 中等 1.4s / 困难 1.8s
   - 用 `getComboWindowMs(difficulty)` 函数替代固定常量
   - 前后端共享同一函数

2. **combo 计分系数根据难度动态调整**
   - 容易 1.1x / 中等 1.3x / 困难 1.6x
   - `getScoreDeltaForCombo(comboCount, difficulty)` 新增 difficulty 参数
   - 保留指数增长公式，但降低系数防止分数爆炸

3. **前后端同步**
   - `shared/game.js` 导出两个函数
   - `server/roomManager.js` 导入并使用
   - `src/App.jsx` 中 `computeSoloCombo` 传入当前关卡难度

## Scoring Table

### 容易 (1.1x)

| combo | 得分 |
|-------|------|
| 0 | 100 |
| 1 | 110 |
| 2 | 121 |
| 3 | 133 |
| 4 | 146 |
| 5 | 161 |

### 中等 (1.3x)

| combo | 得分 |
|-------|------|
| 0 | 100 |
| 1 | 130 |
| 2 | 169 |
| 3 | 220 |
| 4 | 286 |
| 5 | 371 |

### 困难 (1.6x)

| combo | 得分 |
|-------|------|
| 0 | 100 |
| 1 | 160 |
| 2 | 256 |
| 3 | 410 |
| 4 | 655 |
| 5 | 1,049 |
