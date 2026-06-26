## Context

计分在 `shared/game.js` 的 `getScoreDeltaForCombo` 中定义，前后端共享。combo 窗口在 `server/roomManager.js`（`COMBO_WINDOW_MS = 2000`）和 `shared/game.js`（`COMBO_WINDOW_MS = 2000`）各有一份。

## Decisions

1. combo 窗口从 2000 改为 1500，两处同步修改
2. 计分改为分段线性函数，代替指数公式
3. 只改 `shared/game.js` 中的 `getScoreDeltaForCombo`，服务端引用同一函数

## Scoring Table

| combo | 得分 |
|-------|------|
| 0 | 100 |
| 1 | 120 |
| 2 | 140 |
| 3 | 160 |
| 4 | 180 |
| 5 | 350 |
| 6 | 400 |
| 7 | 450 |
| 8 | 500 |
| 9 | 550 |
| 10 | 1,100 |
| 15 | 1,600 |
| 20 | 6,100 |
| 30 | 9,100 |
