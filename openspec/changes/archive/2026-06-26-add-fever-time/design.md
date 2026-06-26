## Context

游戏开始后随机触发 Fever Time 限时双倍得分窗口，提升紧张感。纯后端定时器驱动。

## Decisions

1. 随机 60s~180s 触发，持续 10s
2. Fever 期间双倍得分，点错扣 100 分（下限 0）
3. 扣分仅限 Fever 期间选择的第一下在 Fever 之后的情况
4. Fever 期间禁用道具
5. 同一时间只能存在 1 个 Fever

## Data Model

- 新增 `fever` 字段：`{ active, startAt, endAt }`
- 新增 `feverEverTriggered` 阻止重复触发
- 新增 `feverTimers` Map
- Selection 增加 `selectedAt` 字段

## Risks

- 定时器需与 reshuffle/startCountdown 独立管理
