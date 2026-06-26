## Why

新增第三种道具"快速消除"，由系统自动消除一对 tile，不依赖手动选牌，提升操作流畅度。

## What Changes

- 新增 `findAnyRemovablePair` 共享函数
- 后端 `useQuickMatch` 处理逻辑
- 前端 UI 集成 + 动画复用

## Impact

- Affected code: `shared/game.js`, `server/server.js`, `server/roomManager.js`, `src/App.jsx`
- 消除动画与手动消除完全一致
