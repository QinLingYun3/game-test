## 1. Home UI

- [x] 1.1 新增 `gameMode` state（默认 `"multi"`）和模式选择按钮（单人/多人）
- [x] 1.2 单人模式隐藏「输入房号 / 加入房间」区域
- [x] 1.3 单人模式「开房」按钮文案变为「开始游戏」

## 2. Solo Room

- [x] 2.1 实现 `createSoloRoom`，纯前端构造 room 对象
- [x] 2.2 单人模式默认道具为快速消除，无限使用（♾️）
- [x] 2.3 单人模式跳过道具选择，直接进入倒计时

## 3. Game Loop

- [x] 3.1 单人模式 tile 选择/消除逻辑复用现有 `onSelect`
- [x] 3.2 单人模式快速消除逻辑
- [x] 3.3 结算页「再来一局」按钮
- [x] 3.4 单人模式不提交排行榜

## 4. i18n

- [x] 4.1 新增 `home.modeSolo` / `home.modeMulti` / `home.startSolo` 等文案
