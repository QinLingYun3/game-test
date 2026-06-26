## 1. Server Timers

- [x] 1.1 新增 `itemSelectionTimers` Map 和 `clearItemSelectionTimer`
- [x] 1.2 在 `enterLobby` / `leaveRoom` 中清理

## 2. Server Handlers

- [x] 2.1 实现 `startItemSelection` — 替换原 `start_game` 入口
- [x] 2.2 实现 `selectItem` — 记录玩家选择
- [x] 2.3 实现 `startGameFromSelections` — 道具选择结束后正式开局
- [x] 2.4 倒计时结束未选择者视为无道具

## 3. Serialize

- [x] 3.1 `serializeRoom` 在道具选择阶段返回 `itemSelectionActive` / `itemSelections`
- [x] 3.2 对局阶段返回 `you.selectedItem` / `you.itemCount`

## 4. Frontend

- [x] 4.1 实现 `ItemSelectionOverlay` 组件（3 选 1 + 圆形进度条）
- [x] 4.2 items-panel 只显示已选道具
- [x] 4.3 道具使用校验（未选择某道具则不可用）

## 5. i18n

- [x] 5.1 新增 `game.itemSelectTitle` / `game.itemSelectSubtitle` / `game.noItem` 等文案
