## Context

单人模式复用现有 preview room 机制，纯前端本地运行。首页新增模式选择 UI，区别多人模式流程。

## Decisions

1. 单人模式不连接 WebSocket 服务器
2. 默认道具为快速消除，无限使用（itemCount: null → 渲染 ♾️）
3. 游戏结束后停留在结算页，可点「再来一局」
4. 模式选择状态保存在前端 state，不写入 URL

## Data Model

- 新增 `gameMode` state：`"solo" | "multi"`
- 单人 room code 为 `"SOLO"`，playerId 为 `"solo-player"`
- 单人 `selectedItem: "quick"`, `itemCount: null`

## Risks

- 单人模式与多人模式共享 board/selections 逻辑，需确保隔离
