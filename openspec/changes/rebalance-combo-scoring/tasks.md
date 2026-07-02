## 1. Combo Window by Difficulty

- [x] 1.1 在 `shared/game.js` 中创建 `getComboWindowMs(difficulty)` 函数
- [x] 1.2 移除 `shared/game.js` 中的 `COMBO_WINDOW_MS` 常量
- [x] 1.3 在 `server/roomManager.js` 中导入并使用 `getComboWindowMs()`
- [x] 1.4 在 `src/App.jsx` 的 `computeSoloCombo` 中使用 `getComboWindowMs(difficulty)`

## 2. Scoring Formula by Difficulty

- [x] 2.1 修改 `shared/game.js` 中的 `getScoreDeltaForCombo`，新增 difficulty 参数
- [x] 2.2 同步更新 `server/roomManager.js` 中的 `getScoreDeltaForCombo`
- [x] 2.3 在 `src/App.jsx` 的 `computeSoloCombo` 中传入当前关卡难度

## 3. Verification

- [x] 3.1 验证 build 通过
- [x] 3.2 验证现有测试通过
- [x] 3.3 确认各难度 combo 窗口和系数正确应用
