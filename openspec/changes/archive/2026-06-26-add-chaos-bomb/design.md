## Context

复用烟雾弹的 `activeItems` / `itemQueue` 架构。差异仅在视觉效果：混乱让 tile 图标轮换，而非遮罩。

## Decisions

1. 使用方式与烟雾弹一致：拖放或双击
2. 图标轮换纯前端 CSS 实现，不增加服务器消息
3. 每个 tile 的假图标独立随机选取
4. 动画错落 0~1s

## Data Model

- 后端 `activeItems` 新增 `type: "chaos"`
- `useChaosBomb` 完全镜像 `useSmokeBomb`
