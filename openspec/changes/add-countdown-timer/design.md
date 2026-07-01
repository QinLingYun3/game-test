## Context

本项目是一个 React 连连看游戏，支持多人对战和单人闯关模式。单人模式（SOLO）在客户端本地运行，通过 `createSoloRoom` 创建房间状态，所有游戏逻辑在 `App.jsx` 中通过 `setRoom` 更新状态。现有系统已有 combo 追踪、道具系统（速消/洗牌/烟雾弹/混乱弹）、Fever Time、关卡进度等机制。

## Goals / Non-Goals

**Goals:**
- 为单人模式引入全局倒计时机制，增加游戏紧张感
- 倒计时与 combo、道具、关卡切换深度整合
- 提供直观的倒计时 UI，包含颜色渐变、进度条、低时间警告动画
- 时间到 0 时正常结束游戏并进入结算流程

**Non-Goals:**
- 不影响多人对战模式的任何逻辑和 UI
- 不修改关卡生成或消除匹配的核心算法
- 不引入新的道具类型

## Decisions

### 1. 倒计时状态存储在 room 对象中
**决策**：将 `countdownTotal`（本关总时间）和 `countdownRemaining`（剩余时间）作为 `room` 对象的字段，与现有 `startCountdown`、`reshuffleCountdown` 等字段保持一致。
**理由**：单人模式的状态全部集中在 `room` 对象中，便于统一管理和 React 渲染触发。不需要引入额外的全局状态或 Context。
**替代方案**：使用独立的 React state ——  rejected，因为会导致状态分散，增加与关卡切换、combo、道具交互的复杂度。

### 2. 使用 `setInterval` 驱动倒计时 tick
**决策**：在 `App.jsx` 中通过 `useEffect` + `setInterval`（1000ms）递减 `countdownRemaining`。
**理由**：与现有的 `startCountdown` 倒计时实现方式一致，保持代码风格统一。单人模式无需服务器同步，本地 tick 足够精确。
**替代方案**：`requestAnimationFrame` —— rejected，因为秒级精度不需要 RAF，且会增加不必要的渲染开销。

### 3. 洗牌期间暂停倒计时
**决策**：在 `soloReshufflePending` 为 true 或 `reshuffleCountdown` 存在时，暂停倒计时 tick。
**理由**：洗牌是被动救场机制，不应消耗玩家的宝贵时间。这与用户要求一致。

### 4. 颜色渐变和动画通过 CSS class + inline style 实现
**决策**：倒计时卡片的颜色从亮橙色到鲜红色通过计算 HSL/RGB 插值动态设置背景色；10 秒以下的闪烁跳动通过 CSS animation 实现。
**理由**：CSS animation 性能优于 JS 动画；颜色计算简单，在渲染时根据剩余时间比例实时计算即可。

### 5. 速消扣减 4 秒倒计时
**决策**：在 `onUseQuickMatch` 的 SOLO 分支中，成功使用速消后额外扣减 4 秒倒计时。
**理由**：速消是主动获益道具，需要代价平衡。4 秒的代价在使用得当的情况下可以通过 combo 赚回，形成策略选择。

## Risks / Trade-offs

- **[Risk]** 倒计时 tick 与 React 渲染周期不完全同步，可能导致 1 秒内的视觉误差
  → **Mitigation**：使用 `setInterval` 每秒更新，UI 显示取 `Math.ceil(remaining)`，视觉误差在可接受范围内
- **[Risk]** 跨关卡时间转化为分数后，玩家可能倾向于快速通关而非追求高 combo
  → **Mitigation**：combo 本身也提供分数奖励，玩家需要在"快速通关拿时间分"和"叠 combo 拿 combo 分"之间做策略选择
- **[Risk]** 低时间闪烁动画可能引发部分用户不适
  → **Mitigation**：动画幅度保持轻微（scale 1.05 + opacity 脉冲），不采用高频闪烁

## Migration Plan

无需数据迁移。此变更仅影响单人模式运行时状态和 UI，不涉及持久化数据格式变更。

## Open Questions

- 是否需要在倒计时到 0 时播放特殊音效？（可在实现阶段决定）
