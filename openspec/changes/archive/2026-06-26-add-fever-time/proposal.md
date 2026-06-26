## Why

增加随机触发的限时高分窗口机制，激励玩家在特定时段内集中操作，提升紧张感和娱乐性。

## What Changes

- 后端随机定时器触发 Fever Time（60s~180s），持续 10s
- Fever 期间双倍得分，点错扣 100 分
- 前端红色进度条倒计时显示
- Fever 期间禁用道具

## Impact

- Affected code: `server/roomManager.js`, `src/App.jsx`, `src/styles.css`, `src/i18n.js`
- 新增 `fever` 字段、`feverTimers` 管理
- 得分/扣分逻辑需判断 Fever 状态
