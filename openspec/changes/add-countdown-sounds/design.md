## Context

本项目已有成熟的音效系统架构：
- `useMatchSound.js`：消除时播放 ding.mp3，使用全局懒加载 Audio 实例
- `useComboSound.js`：连击时播放 combo.mp3，同样使用全局懒加载
- `useBgm.js`：背景音乐 happy.mp3，全局共享实例
- `useCountdownVoice.js`：游戏开始倒计时语音，使用 Web Speech API

所有音效 Hook 遵循统一模式：模块级全局 Audio 实例（懒加载）+ React Hook 包装（token 去重 + 错误静默处理）。

单人模式倒计时功能已上线，包含 `countdownRemaining` 状态字段和 `CountdownCard` UI 组件。

## Goals / Non-Goals

**Goals:**
- 倒计时剩余 ≤ 10 秒时，每秒播放一次 `beep_low.mp3`
- 游戏进入结算画面时播放一次 `finish.mp3`
- 两个音效均采用预加载模式，与现有音效系统架构保持一致
- 防止同一秒内重复播放（去重逻辑）

**Non-Goals:**
- 不修改现有音效（ding、combo、bgm、语音）的行为
- 不添加音量控制 UI（沿用现有全局音量逻辑即可）
- 不支持音效开关（超出本次范围）

## Decisions

### 1. 复用现有音效架构模式
**决策**：新建 `useCountdownBeep.js` 和 `useFinishSound.js`，完全遵循 `useMatchSound.js` / `useComboSound.js` 的代码结构。
**理由**：保持代码一致性，降低维护成本。现有模式已验证可靠（懒加载、token 去重、静默错误处理）。
**替代方案**：创建一个通用 `useSound` Hook —— rejected，因为现有项目采用每个音效独立 Hook 的风格，引入通用 Hook 会破坏一致性。

### 2. beep 触发条件：基于 `countdownRemaining` 值变化
**决策**：`useCountdownBeep` 接收 `countdownRemaining` 作为参数，当值 ≤ 10 且发生变化时播放 beep。
**理由**：`countdownRemaining` 每秒通过 setInterval 更新一次，天然形成 tick 节奏。Hook 内部用 ref 记录上一次播放的值，避免同一秒内重复触发。
**替代方案**：在 setInterval 内部直接播放 —— rejected，因为会让音效逻辑侵入状态管理，不如 Hook 解耦。

### 3. finish 触发条件：基于 `phase` 变化到 "results"
**决策**：`useFinishSound` 接收 `phase` 作为参数，当 `phase` 从非 "results" 变为 "results" 时播放。
**理由**：结算画面可能由多种原因触发（倒计时到 0、棋盘清空、玩家主动结束），基于 phase 变化可以统一捕获所有情况。

### 4. 音效文件路径
**决策**：`beep_low.mp3` 和 `finish.mp3` 放在 `/sound/` 目录下，与现有音效文件同目录。
**理由**：保持资源组织一致性。

## Risks / Trade-offs

- **[Risk]** 浏览器自动播放策略可能阻止 beep 播放
  → **Mitigation**：沿用现有模式的 `.catch(() => {})` 静默失败；用户在进入游戏前已有交互（点击开始），通常已满足自动播放策略
- **[Risk]** 连续 10 次 beep 可能造成听觉疲劳
  → **Mitigation**：`beep_low.mp3` 应为短促、低音量的提示音；音量可通过 `volume` 参数统一控制
- **[Risk]** 音效文件缺失导致 404
  → **Mitigation**：在 tasks 中明确标注需要用户准备音效文件；Audio 加载失败会被 try-catch 捕获，不影响游戏

## Migration Plan

无需数据迁移。此变更纯为前端功能增强，不影响游戏状态或持久化数据。

## Open Questions

- `beep_low.mp3` 和 `finish.mp3` 的具体音频内容由用户/设计师提供，开发阶段可使用占位文件测试
