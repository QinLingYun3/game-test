## 1. Server Timers

- [x] 1.1 新增 `feverTimers` Map 和 `clearFeverTimer`
- [x] 1.2 `enterLobby` / `leaveRoom` / `finishGame` 中清理
- [x] 1.3 随机 60s~180s 触发 Fever

## 2. Server Scoring

- [x] 2.1 新增 `triggerFeverNow` 函数
- [x] 2.2 `handleSelection` 中 Fever 双倍得分逻辑
- [x] 2.3 Fever 期间点错扣 100 分
- [x] 2.4 扣分下限 0

## 3. Frontend

- [x] 3.1 实现 `FeverDisplay` 组件（入场气泡 + 红色进度条）
- [x] 3.2 Fever 期间禁用道具按钮
- [x] 3.3 Fever 得分/扣分消息展示

## 4. i18n

- [x] 4.1 新增 `game.feverTime` / `server.feverMatchScored` / `server.feverPenalty` 等文案
