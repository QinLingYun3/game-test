## Context

开局前让玩家从 3 种道具中选择 1 种，增加策略维度。服务端驱动 20 秒倒计时。

## Decisions

1. 道具选择阶段在 `room.phase === "lobby"` 时触发，通过 `itemSelectionActive` 区分
2. 倒计时由服务端每秒广播驱动
3. 全员选择后提前结束，不等倒计时
4. 对局中只显示已选道具，未拥有者不可见

## Data Model

- 新增 `itemSelectionActive`、`itemSelectionCountdown`、`itemSelections` 字段
- 新增 `itemSelectionTimers` Map 管理定时器
- 新增 `selectItem` 消息类型

## Risks

- 道具选择阶段房主退出需清理定时器并回到大厅
