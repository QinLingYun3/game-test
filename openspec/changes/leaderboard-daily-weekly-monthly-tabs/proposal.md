## Why

当前排行榜只有一个总榜，玩家无法查看自己在不同时间维度（今日、本周、本月）的表现。添加日/周/月三个 Tab 可以让玩家更有目标感，提升留存和竞争动力。

## What Changes

- **Backend**: 在 `soloLeaderboard` entry 中增加 `submittedAt` 时间戳（已有），服务端按日/周/月三个维度过滤并返回排行榜数据
- **Backend API**: `get_leaderboard` 请求增加 `period` 参数（`daily`/`weekly`/`monthly`/`all`），服务端根据参数过滤返回对应榜单
- **Frontend**: 排行榜弹窗增加 Tab 切换（日榜 / 周榜 / 月榜 / 总榜），默认显示日榜
- **Frontend**: 加载排行榜时传递 `period` 参数，根据选中 Tab 展示不同数据
- **i18n**: 新增日/周/月/总榜翻译键

## Capabilities

### New Capabilities
- `leaderboard-time-periods`: 排行榜支持按日、周、月、总榜四个时间维度筛选和展示

### Modified Capabilities
- （无现有 spec 需要修改）

## Impact

- `server/server.js`: leaderboard 数据过滤逻辑、WebSocket API 参数处理
- `src/App.jsx`: 排行榜 UI 增加 Tab 切换、请求参数传递
- `src/styles.css`: 排行榜 Tab 样式
- `src/i18n.js`: 新增翻译键
- `solo-leaderboard.json`: 数据格式不变（已有 `submittedAt` 字段）
