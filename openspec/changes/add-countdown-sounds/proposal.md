## Why

单人模式倒计时功能已上线，但当前缺乏配套的音效反馈。倒计时最后10秒的紧张感、游戏结算时的成就感都需要音效来强化玩家体验。补全这些音效可以让游戏节奏更加鲜明，提升整体沉浸感。

## What Changes

- 新增倒计时低时间警告音效：当单人模式倒计时剩余 ≤ 10 秒时，每减少 1 秒播放一次 `beep_low.mp3`
- 新增结算音效：当游戏进入结算画面（`phase: "results"`）时播放 `finish.mp3`
- 两个音效文件均需要预加载，采用与现有 `ding.mp3`、`combo.mp3` 一致的懒加载单例模式
- 新增两个自定义 Hook：`useCountdownBeep` 和 `useFinishSound`
- 在 `App.jsx` 中集成新的音效 Hook，与现有的 `useMatchSound`、`useComboSound` 等并列

## Capabilities

### New Capabilities
- `countdown-beep-sound`: 倒计时最后10秒每秒播放 beep 警告音，包含预加载和防重复播放逻辑
- `finish-sound`: 游戏结算时播放 finish 音效，包含预加载和触发条件判断

### Modified Capabilities
<!-- 无现有 spec 需要修改 -->

## Impact

- 新增音效文件：`/sound/beep_low.mp3`、`/sound/finish.mp3`（需用户自行提供）
- 前端 React 层：新增 `useCountdownBeep.js` 和 `useFinishSound.js` 两个 Hook
- `App.jsx`：引入并调用新的音效 Hook
- 遵循现有音效系统的架构模式（全局懒加载 Audio 实例 + token 去重）
