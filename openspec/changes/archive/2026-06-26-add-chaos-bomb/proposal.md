## Why

在烟雾弹基础上新增第二种攻击性道具"混乱"，击中后使目标玩家的 tile 图标快速轮换，干扰其判断。

## What Changes

- 新增 `useChaosBomb` 服务端函数，复用 `activeItems` / `itemQueue` 机制
- 前端混沌效果：tile 图标 CSS 动画轮换，随机错落
- 双击或拖放使用

## Impact

- Affected code: `server/server.js`, `server/roomManager.js`, `src/App.jsx`, `src/styles.css`, `src/i18n.js`
- 完全复用烟雾弹的架构，差异仅在视觉效果
