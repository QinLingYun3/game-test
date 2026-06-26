## 1. Combo Window

- [ ] 1.1 将 `shared/game.js` 中的 `COMBO_WINDOW_MS` 从 2000 改为 1500
- [ ] 1.2 将 `server/roomManager.js` 中的 `COMBO_WINDOW_MS` 从 2000 改为 1500

## 2. Scoring Formula

- [ ] 2.1 修改 `shared/game.js` 中的 `getScoreDeltaForCombo`，用分段线性函数替换指数公式

## 3. Verification

- [ ] 3.1 验证单人/多人模式分数不再指数爆炸
- [ ] 3.2 确认 Fever 双倍得分仍正常叠加
