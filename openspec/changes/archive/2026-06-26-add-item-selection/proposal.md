## Why

原游戏开局时所有玩家默认拥有全部 3 种道具（烟雾弹、混乱、快速消除），导致策略深度不足。改为开局前让玩家从 3 种道具中选择 1 种，增加策略维度，降低新手认知负担。

## What Changes

- 房主点击「开始游戏」后进入道具选择阶段，20 秒倒计时
- 玩家从 3 种道具中选择 1 种，全员选择后提前结束
- 未选择者无道具
- 对局中只显示已选道具

## Impact

- Affected code: `server/server.js`, `server/roomManager.js`, `src/App.jsx`, `src/i18n.js`, `src/styles.css`
- 新增 `itemSelectionActive` / `itemSelections` / `itemSelectionCountdown` 字段
- 新增 `itemSelectionTimers` 定时器管理
