## Context

首页禁用按钮已有模式（`homeAccessEnabled` 控制）。新增一个额外的 `betaConsent` state 作为第二道闸门，不改变原有连接状态逻辑。

## Decisions

1. 复选框放在房号输入框下方、操作按钮上方
2. 按钮禁用逻辑改为：`!homeAccessEnabled || !betaConsent`
3. 未勾选时点击按钮弹出 `"必须同意才能开始游戏"` 的 error bubble
4. localStorage key 为 `match2-beta-consent`

## Data Model

- `betaConsent` state：`true | false`
- 初始值从 localStorage 读取
- 勾选时写入 localStorage

## Component Order

```
┌─ 模式选择 ─────────────────────┐
│   [自己玩]  [和朋友对战]          │
├─ 难度/关卡选择 ─────────────────┤
│   (单人模式可见)                  │
├─ 昵称输入 ──────────────────────┤
├─ 操作按钮 ──────────────────────┤
│   [开始游戏] / [开房]            │
├─ 房号输入（多人模式） ───────────┤
│   [输入房号]  [加入房间]          │
├─ ☐ 我同意这是先行版...  ← 新增  │
└─────────────────────────────────┘
```
