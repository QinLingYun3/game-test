# OpenSpec: Item Selection（道具选择）

```yaml
id: match2-item-selection
version: 1.0.0
status: draft
author: Game Team
date: 2026-06-22
```

---

## 1. 背景

原游戏开局时所有玩家默认拥有全部 3 种道具（烟雾弹、混乱、快速消除），导致策略深度不足。改为开局前让玩家从 3 种道具中**选择 1 种**，未选择者无道具，以此来：
- 增加策略维度（选择克制对手的道具）
- 降低新手认知负担（只专注一种道具）
- 制造信息不对称（不知道对手选了什么）

---

## 2. 需求

### 2.1 功能性需求

| ID | 需求 | 优先级 |
|---|---|---|
| F1 | 房主点击「开始游戏」后，进入**道具选择阶段**，全员弹出遮罩界面 | P0 |
| F2 | 道具选择倒计时 **20 秒**，以圆形进度条显示在道具容器下方 | P0 |
| F3 | 界面列出全部 3 种道具：烟雾弹、混乱、快速消除；图标与游戏内一致 | P0 |
| F4 | 每种道具下方显示效果说明（文案沿用现有 `item.smokeDesc` / `item.chaosDesc` / `item.quickMatchDesc`） | P0 |
| F5 | 玩家点击某道具后，该道具卡片**高亮**（selected 态），并可随时切换为另一种 | P0 |
| F6 | 当**所有玩家都已选择**道具后，道具选择阶段立即结束，无需等待倒计时 | P0 |
| F7 | 倒计时结束时仍未选择的玩家，视为**无道具** | P0 |
| F8 | 道具选择结束后，进入现有 3-2-1 倒计时流程，随后正式开局 | P0 |
| F9 | 对局过程中，玩家 items-panel **只显示自己选择的道具**（或空槽）；未拥有的道具不可见、不可用 | P0 |
| F10 | 道具使用校验：若玩家未选择某道具，则调用对应 `use_xxx` 消息时返回错误 | P0 |
| F11 | 游戏结束回到大厅或玩家离开后，`itemSelections` 完全重置 | P0 |
| F12 | Test 模式（`?test=1`）下，🔥 测试按钮触发的是服务器 Fever，道具选择流程仍需正常走 | P1 |

### 2.2 非功能性需求

| ID | 需求 | 优先级 |
|---|---|---|
| NF1 | 道具选择阶段服务器必须持久化选择结果，断线重连后可恢复状态 | P1 |
| NF2 | 倒计时由服务器驱动（每秒广播），防止客户端作弊加速 | P1 |
| NF3 | 圆形倒计时进度条由前端根据 `itemSelectionCountdown` 自行渲染，不增加额外消息频率 | P1 |
| NF4 | 断线重连后若仍处于道具选择阶段，应重新展示选择界面并同步当前倒计时 | P1 |

---

## 3. 数据模型

### 3.1 后端 Room 新增字段

```ts
interface Room {
  // ... 原有字段

  /** 是否处于道具选择阶段 */
  itemSelectionActive: boolean;

  /** 当前剩余秒数（20 → 0） */
  itemSelectionCountdown: number | null;

  /** 玩家选择映射：socketId -> "smoke" | "chaos" | "quick" | null */
  itemSelections: Record<string, string | null>;
}
```

### 3.2 后端定时器 Map

```js
const itemSelectionTimers = new Map(); // roomCode -> intervalId
```

### 3.3 WebSocket 广播 — serializeRoom 新增字段

道具选择阶段返回：

```js
{
  itemSelectionActive: true,
  itemSelectionCountdown: 15,
  playerItems: {
    "player-a-id": "smoke",
    "player-b-id": null   // 未选择
  }
}
```

对局阶段（game）返回：

```js
{
  // 不再暴露他人选择，仅暴露自己的
  you: {
    id: playerId,
    selection: room.selections.get(playerId) ?? null,
    selectedItem: room.itemSelections?.[playerId] ?? null
  }
}
```

---

## 4. 技术方案

### 4.1 后端改动

#### 4.1.1 `server/roomManager.js` — 新增定时器管理

**新增 Map：**

```js
const itemSelectionTimers = new Map();
```

**`clearItemSelectionTimer(roomCode)`：**

```js
function clearItemSelectionTimer(roomCode) {
  const id = itemSelectionTimers.get(roomCode);
  if (id) {
    clearInterval(id);
    itemSelectionTimers.delete(roomCode);
  }
}
```

**注册清理点：**
- `enterLobby()` 调用
- `finishGame()` 调用
- `leaveRoom()` 调用（若玩家离开导致提前结束也需处理）

#### 4.1.2 `server/roomManager.js` — 道具选择入口

**`startItemSelection(socketId, sockets)`**（替换原 `start_game` 的直接调用）：

```js
export function startItemSelection(socketId, sockets) {
  const room = getRoomBySocket(socketId);
  if (!room) return { error: createMessage("error.notInRoom") };
  if (room.hostId !== socketId) return { error: createMessage("error.onlyHostCanStart") };
  if (room.players.length < 2) return { error: createMessage("error.needTwoPlayers") };

  clearItemSelectionTimer(room.code);
  room.itemSelectionActive = true;
  room.itemSelectionCountdown = 20;
  room.itemSelections = {};
  room.message = createMessage("server.itemSelection");
  broadcastRoom(room, sockets);

  const intervalId = setInterval(() => {
    const liveRoom = rooms.get(room.code);
    if (!liveRoom || !liveRoom.itemSelectionActive) {
      clearItemSelectionTimer(room.code);
      return;
    }

    liveRoom.itemSelectionCountdown -= 1;
    if (liveRoom.itemSelectionCountdown > 0) {
      liveRoom.message = createMessage("server.itemSelectionCountdown", { count: liveRoom.itemSelectionCountdown });
      broadcastRoom(liveRoom, sockets);

      // 全选提前结束
      const allSelected = liveRoom.players.every((p) => liveRoom.itemSelections[p.id] != null);
      if (allSelected) {
        clearItemSelectionTimer(liveRoom.code);
        liveRoom.itemSelectionActive = false;
        liveRoom.itemSelectionCountdown = null;
        startGameFromSelections(liveRoom, sockets);
      }
      return;
    }

    // 倒计时结束
    clearInterval(intervalId);
    itemSelectionTimers.delete(room.code);
    liveRoom.itemSelectionActive = false;
    liveRoom.itemSelectionCountdown = null;
    liveRoom.players.forEach((p) => {
      if (!(p.id in liveRoom.itemSelections)) {
        liveRoom.itemSelections[p.id] = null;
      }
    });
    startGameFromSelections(liveRoom, sockets);
  }, 1000);

  itemSelectionTimers.set(room.code, intervalId);
  return { room };
}
```

#### 4.1.3 `server/roomManager.js` — 从选择过渡到正式开局

**`startGameFromSelections(room, sockets)`：**

```js
function startGameFromSelections(room, sockets) {
  clearReshuffleCountdown(room.code);
  room.phase = "game";
  room.players = resetScores(room.players);
  room.selections = new Map();
  room.lastMatch = null;
  room.lastCombo = null;
  room.reshuffleCountdown = null;
  room.startCountdown = 3;
  room.startReveal = false;
  room.comboTracker = createComboTracker(room.players);
  room.fever = { active: false, startAt: 0, endAt: 0 };
  room.feverEverTriggered = false;
  reloadLevelConfig();
  room.board = createBoard();
  room.initialTileCount = countRemainingTiles(room.board);
  room.message = createMessage("server.gameStarting", { count: 3 });
  broadcastRoom(room, sockets);
  scheduleGameStart(room, sockets); // 复用现有 3-2-1 倒计时
}
```

> ⚠️ 注意：不再调用现有的 `startGame()` 作为入口。原有的 `startGame()` 可保留供测试复用，但生产环境流程改为 `startItemSelection → startGameFromSelections`。

#### 4.1.4 `server/roomManager.js` — 玩家选择道具

**`selectItem(socketId, itemType)`：**

```js
export function selectItem(socketId, itemType) {
  const room = getRoomBySocket(socketId);
  if (!room) return { error: createMessage("error.notInRoom") };
  if (!room.itemSelectionActive) return { error: createMessage("error.itemSelectionEnded") };
  if (!["smoke", "chaos", "quick"].includes(itemType)) {
    return { error: createMessage("error.invalidItem") };
  }
  room.itemSelections[socketId] = itemType;
  return { room };
}
```

#### 4.1.5 `server/roomManager.js` — 道具使用校验（防越权）

在 `useChaosBomb`、`useSmokeBomb`、`handleQuickMatch` 开头增加校验：

```js
// useChaosBomb
if (room.itemSelections?.[socketId] !== "chaos") {
  return { error: createMessage("error.itemNotOwned") };
}

// useSmokeBomb
if (room.itemSelections?.[socketId] !== "smoke") {
  return { error: createMessage("error.itemNotOwned") };
}

// handleQuickMatch
if (room.itemSelections?.[socketId] !== "quick") {
  return { error: createMessage("error.itemNotOwned") };
}
```

#### 4.1.6 `server/roomManager.js` — 生命周期清理

**`createRoom()`** 初始化新增：

```js
itemSelectionActive: false,
itemSelectionCountdown: null,
itemSelections: {},
```

**`enterLobby()`** 清理新增：

```js
clearItemSelectionTimer(room.code);
room.itemSelectionActive = false;
room.itemSelectionCountdown = null;
room.itemSelections = {};
```

**`leaveRoom()`** 离开时清理选择记录，人数不足时自动回 lobby：

```js
if (room.itemSelections) {
  delete room.itemSelections[socketId];
}
if (room.itemSelectionActive && room.players.length <= 1) {
  clearItemSelectionTimer(room.code);
  enterLobby(room);
}
```

#### 4.1.7 `server/roomManager.js` — `serializeRoom`

```js
function serializeRoom(room, playerId) {
  // ... 原有代码

  if (room.itemSelectionActive) {
    return {
      // ... 原有字段（phase 仍为 "lobby"）
      phase: room.phase,
      canStart: false, // 道具选择期间禁止重复点击开始
      itemSelectionActive: true,
      itemSelectionCountdown: room.itemSelectionCountdown,
      playerItems: room.itemSelections ?? {},
      you: {
        id: playerId,
        selection: null,
        selectedItem: room.itemSelections?.[playerId] ?? null
      }
    };
  }

  return {
    // ... 原有字段
    itemSelectionActive: false,
    itemSelectionCountdown: null,
    you: {
      id: playerId,
      selection: room.selections.get(playerId) ?? null,
      selectedItem: room.itemSelections?.[playerId] ?? null
    }
  };
}
```

#### 4.1.8 `server/server.js` — 消息路由改造

**替换 `start_game` 处理：**

```js
if (type === "start_game") {
  const result = startItemSelection(socketId, sockets);
  if (result.error) return send(socket, "error", { message: result.error });
  return; // startItemSelection 内部已 broadcast
}
```

**新增 `select_item` 处理：**

```js
if (type === "select_item") {
  const result = selectItem(socketId, payload?.itemType);
  if (result.error) return send(socket, "error", { message: result.error });
  return broadcastAfterAction(result.room, sockets);
}
```

### 4.2 前端改动

#### 4.2.1 `src/App.jsx` — 新增道具选择遮罩组件

```jsx
function ItemSelectionOverlay({ countdown, playerItems, selectedItem, onSelect, t }) {
  const items = [
    { type: "smoke", icon: "😶‍🌫️", label: t("item.smoke"), desc: t("item.smokeDesc") },
    { type: "chaos", icon: "😵‍💫", label: t("item.chaos"), desc: t("item.chaosDesc") },
    { type: "quick", icon: "⚡️", label: t("item.quickMatch"), desc: t("item.quickMatchDesc") }
  ];

  const total = 20;
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (countdown / total) * circumference;

  return (
    <div className="item-selection-overlay">
      <div className="item-selection-panel">
        <h2 className="item-selection-title">{t("game.itemSelectTitle")}</h2>
        <p className="item-selection-subtitle">{t("game.itemSelectSubtitle")}</p>
        <div className="item-selection-grid">
          {items.map((item) => (
            <button
              key={item.type}
              className={`item-selection-card${selectedItem === item.type ? " selected" : ""}`}
              onClick={() => onSelect(item.type)}
            >
              <span className="item-selection-icon">{item.icon}</span>
              <span className="item-selection-name">{item.label}</span>
              <span className="item-selection-desc">{item.desc}</span>
            </button>
          ))}
        </div>
        <div className="item-selection-timer">
          <svg viewBox="0 0 100 100" className="timer-svg">
            <circle className="timer-track" cx="50" cy="50" r="45" />
            <circle
              className="timer-progress"
              cx="50" cy="50" r="45"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
            />
          </svg>
          <span className="timer-number">{countdown}</span>
        </div>
        <div className="item-selection-players">
          {Object.entries(playerItems).map(([id, type]) => (
            <span key={id} className={`item-selection-status${type ? " ready" : ""}`}>
              {type ? "✅" : "⏳"}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
```

使用位置（overlay 最顶层，`z-index: 150` 盖住 lobby-panel）：

> 道具选择阶段 `room.phase` 仍保持 `"lobby"`，因此不新增 phase；前端通过 `room.itemSelectionActive` 条件优先渲染遮罩，lobby 面板在底层正常存在但不可见。

```jsx
{room?.itemSelectionActive && (
  <ItemSelectionOverlay
    countdown={room.itemSelectionCountdown}
    playerItems={room.playerItems ?? {}}
    selectedItem={room.you?.selectedItem}
    onSelect={(type) => send("select_item", { itemType: type })}
    t={t}
  />
)}
```

#### 4.2.2 `src/App.jsx` — items-panel 改造（仅显示已选道具）

```jsx
<aside className="items-panel">
  <div className="items-column">
    {room?.you?.selectedItem === "smoke" && (
      <div className="item-slot">
        <div className="item-tooltip">
          <div className={`item-icon smoke-bomb-icon${(room?.fever?.active || feverEffect?.active) ? " disabled" : ""}`} ...>
            😶‍🌫️
          </div>
          <div className="item-tooltip-bubble">{t("item.smokeDesc")}</div>
        </div>
      </div>
    )}
    {room?.you?.selectedItem === "chaos" && (
      <div className="item-slot">
        <div className="item-tooltip">
          <div className={`item-icon chaos-bomb-icon${(room?.fever?.active || feverEffect?.active) ? " disabled" : ""}`} ...>
            😵‍💫
          </div>
          <div className="item-tooltip-bubble">{t("item.chaosDesc")}</div>
        </div>
      </div>
    )}
    {room?.you?.selectedItem === "quick" && (
      <div className="item-slot">
        <div className="item-tooltip">
          <div className={`item-icon quick-match-icon${(room?.removablePairs ?? 0) === 0 || room?.fever?.active || feverEffect?.active ? " disabled" : ""}`} ...>
            ⚡️
          </div>
          <div className="item-tooltip-bubble">{t("item.quickMatchDesc")}</div>
        </div>
      </div>
    )}
    {room?.you?.selectedItem == null && (
      <div className="item-slot item-empty">
        <div className="item-icon disabled">
          🚫
        </div>
        <span className="item-empty-label">{t("game.noItem")}</span>
      </div>
    )}
  </div>
</aside>
```

#### 4.2.3 `src/styles.css` — 道具选择界面样式

```css
/* === Item Selection Overlay === */
.item-selection-overlay {
  position: fixed;
  inset: 0;
  z-index: 150;
  display: grid;
  place-items: center;
  background: rgba(8, 14, 18, 0.78);
  backdrop-filter: blur(18px);
  animation: overlay-fade-in 0.3s ease both;
}

.item-selection-panel {
  width: min(600px, 92vw);
  padding: 32px 28px 24px;
  border-radius: 24px;
  background: rgba(16, 24, 32, 0.92);
  border: 1px solid rgba(160, 180, 200, 0.15);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
}

.item-selection-title {
  margin: 0;
  font-size: 26px;
  font-weight: 900;
  color: #fff7e6;
  text-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
}

.item-selection-subtitle {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 240, 210, 0.65);
}

.item-selection-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  width: 100%;
}

.item-selection-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 18px 12px;
  border-radius: 16px;
  border: 2px solid rgba(160, 180, 200, 0.12);
  background: rgba(24, 32, 40, 0.65);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  color: inherit;
}

.item-selection-card:hover {
  transform: translateY(-3px);
  border-color: rgba(255, 160, 80, 0.35);
  box-shadow: 0 8px 24px rgba(255, 160, 80, 0.12);
}

.item-selection-card.selected {
  border-color: rgba(255, 175, 80, 0.75);
  background: rgba(255, 175, 80, 0.08);
  box-shadow: 0 0 24px rgba(255, 160, 80, 0.18);
}

.item-selection-icon {
  font-size: 42px;
  line-height: 1;
}

.item-selection-name {
  font-size: 15px;
  font-weight: 800;
  color: #fff7e6;
}

.item-selection-desc {
  font-size: 11px;
  font-weight: 500;
  color: rgba(200, 210, 220, 0.7);
  line-height: 1.45;
  text-align: center;
}

/* === Circular Countdown === */
.item-selection-timer {
  position: relative;
  width: 72px;
  height: 72px;
  margin-top: 4px;
}

.timer-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.timer-track,
.timer-progress {
  cx: 50;
  cy: 50;
  r: 45;
  fill: none;
  stroke-width: 6;
}

.timer-track {
  stroke: rgba(255, 255, 255, 0.08);
}

.timer-progress {
  stroke: #ff9f43;
  stroke-linecap: round;
  transition: stroke-dashoffset 1s linear;
}

.timer-number {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 22px;
  font-weight: 800;
  color: #ff9f43;
}

/* === Player Selection Status === */
.item-selection-players {
  display: flex;
  gap: 8px;
}

.item-selection-status {
  opacity: 0.35;
  font-size: 18px;
  transition: opacity 0.3s ease;
}

.item-selection-status.ready {
  opacity: 1;
}

/* === Empty Item Slot === */
.item-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 8px;
}

.item-empty .item-icon {
  opacity: 0.25;
  cursor: default;
}

.item-empty-label {
  font-size: 12px;
  font-weight: 600;
  color: rgba(160, 180, 200, 0.45);
}

@keyframes overlay-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@media (max-width: 700px) {
  .item-selection-grid {
    grid-template-columns: 1fr;
  }
}
```

#### 4.2.4 `src/i18n.js` — 新增键

| Key | zh | en | fr |
|---|---|---|---|
| `game.itemSelectTitle` | 选择你的道具 | Choose your item | Choisissez votre objet |
| `game.itemSelectSubtitle` | 倒计时结束后未选择将无道具 | No item if time runs out | Pas d'objet si le temps ecoule |
| `game.noItem` | 未选择道具 | No item selected | Aucun objet selectionne |
| `server.itemSelection` | 正在选择道具... | Choosing items... | Choix des objets... |
| `server.itemSelectionCountdown` | 选择道具倒计时 {{count}} 秒 | Item selection ends in {{count}}s | Choix se termine dans {{count}}s |
| `error.itemSelectionEnded` | 道具选择已结束 | Item selection has ended | Le choix est termine |
| `error.invalidItem` | 无效的道具 | Invalid item | Objet invalide |
| `error.itemNotOwned` | 你未选择此道具 | You do not own this item | Vous n'avez pas cet objet |

---

## 5. 任务拆分

| # | 任务 | 文件 | 预估工时 |
|---|---|---|---|
| 1 | 后端：新增 `itemSelectionTimers` Map + clear 函数 | `server/roomManager.js` | 10 min |
| 2 | 后端：`createRoom` / `enterLobby` / `leaveRoom` 初始化与清理 | `server/roomManager.js` | 10 min |
| 3 | 后端：实现 `startItemSelection` + `startGameFromSelections` | `server/roomManager.js` | 25 min |
| 4 | 后端：实现 `selectItem` | `server/roomManager.js` | 10 min |
| 5 | 后端：道具使用增加 `itemNotOwned` 校验 | `server/roomManager.js` | 10 min |
| 6 | 后端：改造 `serializeRoom` | `server/roomManager.js` | 10 min |
| 7 | 后端：`server.js` 替换 `start_game` 路由 + 新增 `select_item` | `server/server.js` | 10 min |
| 8 | 前端：`ItemSelectionOverlay` 组件 | `src/App.jsx` | 25 min |
| 9 | 前端：items-panel 仅渲染已选道具 | `src/App.jsx` | 15 min |
| 10 | 前端：新增 i18n 键 | `src/i18n.js` | 10 min |
| 11 | 前端：CSS 样式（选择卡片 + 圆形倒计时） | `src/styles.css` | 25 min |
| 12 | 端到端测试 | — | 30 min |

**总计：约 3.5 小时**

---

## 6. 验收标准

- [ ] 房主点击开始后，全员弹出道具选择遮罩
- [ ] 界面显示 3 种道具，图标与游戏内一致，下方有说明文案
- [ ] 点击某道具后，该卡片高亮，可切换
- [ ] 圆形倒计时从 20 秒开始，每秒递减
- [ ] 所有玩家都选择后，遮罩立即消失，进入 3-2-1 倒计时
- [ ] 倒计时结束后未选择的玩家对局中无任何道具
- [ ] 对局中 items-panel 仅显示自己选择的道具
- [ ] 未选择道具的玩家调用 `use_xxx` 时收到 error.itemNotOwned
- [ ] 游戏结束回到大厅后，下一把重新选择
- [ ] 道具选择阶段断线重连可恢复正常
- [ ] 多语言环境文案正确
