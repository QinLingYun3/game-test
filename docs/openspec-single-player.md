# OpenSpec: Single Player Mode（单人模式）

```yaml
id: match2-single-player
version: 2.0.0
status: draft
author: Game Team
date: 2026-06-22
```

---

## 1. 背景

当前游戏只能通过 URL 参数 `?t=1` 解锁单人模式，入口隐蔽且体验不完整。现改为在首页提供显式的模式选择，让玩家一键进入单人练习，或正常进入多人对战大厅。

---

## 2. 需求

### 2.1 功能性需求

| ID | 需求 | 优先级 |
|---|---|---|
| F1 | 首页在**语言选项下方**新增一行**模式选择** | P0 |
| F2 | 模式选项为两个互斥按钮：**「自己玩」**（单人）、**「和朋友对战」**（多人）；默认选中**「和朋友对战」** | P0 |
| F3 | 选中**单人模式**时：首页「开房」按钮文案变为**「开始游戏」**，下方**「或输入房号 / 加入房间」**全部隐藏 | P0 |
| F4 | 选中**单人模式**时，点击「开始游戏」直接开局，**不进入大厅**，前端本地生成 preview room，直接进入 3-2-1 倒计时 | P0 |
| F5 | 单人模式**跳过道具选择界面**，默认道具为**速消**，无限使用，角标显示 **「♾️」**，不显示烟雾弹和混乱 | P0 |
| F6 | 选中**多人模式**时，首页保持现有 UI（开房 / 加入房间），进入大厅后**仍要求最少 2 人**才能开始 | P0 |
| F7 | 多人模式下道具选择流程保持不变（20 秒倒计时、3 选 1、有数量限制） | P0 |
| F8 | 单人模式下房主始终是当前玩家，游戏结束后停留在结算页，可点击「再来一局」直接重开 | P1 |

### 2.2 非功能性需求

| ID | 需求 | 优先级 |
|---|---|---|
| NF1 | 单人模式不连接 WebSocket 服务器，纯前端本地运行（复用现有 preview room 机制） | P1 |
| NF2 | 模式选择状态保存在前端 state，不写入 URL query string | P1 |
| NF3 | 从单人模式切换回多人模式时，首页 UI 即时恢复，无残留状态 | P1 |

---

## 3. 术语

| 术语 | 说明 |
|---|---|
| 单人模式 | 首页选择「自己玩」，不连接服务器，本地直接开局 |
| 多人模式 | 首页选择「和朋友对战」，正常连接服务器、大厅、道具选择 |
| `gameMode` | 前端 state：`"solo"` 或 `"multi"`，默认 `"multi"` |

---

## 4. 数据模型

### 4.1 前端新增 state

```js
const [gameMode, setGameMode] = useState("multi"); // "solo" | "multi"
```

### 4.2 单人模式下的 room 对象（前端本地构造）

复用现有 `createPreviewRoom` 机制，但移除对手：

```js
{
  code: "0000",
  phase: "game",
  hostId: playerId,
  players: [{ id: playerId, nickname, avatarSeed, score: 0, maxCombo: 0 }],
  // ... 其他 board、selections 等同 preview room
  itemSelections: { [playerId]: "quick" },
  itemCounts: { [playerId]: { quick: Infinity } },
  you: {
    id: playerId,
    selection: null,
    selectedItem: "quick",
    itemCount: null   // null => 前端渲染 ♾️
  }
}
```

### 4.3 多人模式 Room（后端）不变

`canStart` 保持现有逻辑：

```js
canStart: room.players.length >= 2 && room.hostId === playerId && room.phase === "lobby"
```

> 多人模式仍要求最少 2 人。

---

## 5. 技术方案

### 5.1 前端改动

#### 5.1.1 首页新增模式选择区域

在 `home-stage`（语言选择下方）插入：

```jsx
<div className="mode-select-row">
  <span className="mode-label">{t("home.modeLabel")}</span>
  <div className="mode-options">
    <button
      className={`mode-chip${gameMode === "solo" ? " active" : ""}`}
      onClick={() => setGameMode("solo")}
    >
      {t("home.modeSolo")}
    </button>
    <button
      className={`mode-chip${gameMode === "multi" ? " active" : ""}`}
      onClick={() => setGameMode("multi")}
    >
      {t("home.modeMulti")}
    </button>
  </div>
</div>
```

#### 5.1.2 首页按钮与展示条件

```jsx
<button className="primary-btn" onClick={handleStart}>
  {gameMode === "solo" ? t("home.startSolo") : t("home.create")}
</button>

{gameMode === "multi" && (
  <>
    <span className="home-or">{t("home.or")}</span>
    <div className="home-join-row">
      <input ... placeholder={t("home.joinPrompt")} />
      <button>{t("home.join")}</button>
    </div>
  </>
)}
```

#### 5.1.3 单人模式开局逻辑

```js
function handleStart() {
  if (gameMode === "solo") {
    const previewRoom = createSoloRoom(nickname, avatarSeed, language);
    setRoom(previewRoom);
    // 启动 3-2-1 本地倒计时
    startLocalCountdown(previewRoom);
    return;
  }
  // 多人模式：原有 WebSocket 开房逻辑
  send("create_room", { nickname, avatarSeed });
}
```

`createSoloRoom` 基于现有 `createPreviewRoom` 改造：

```js
function createSoloRoom(nickname, avatarSeed, language) {
  const playerId = "solo-player";
  const room = {
    code: "SOLO",
    phase: "game",
    hostId: playerId,
    players: [
      { id: playerId, nickname, avatarSeed, score: 0, maxCombo: 0 }
    ],
    board: createBoard(),
    selections: new Map(),
    activeItems: [],
    fever: { active: false },
    itemSelections: { [playerId]: "quick" },
    itemCounts: { [playerId]: { quick: Infinity } },
    startCountdown: 3,
    startReveal: false,
    message: createMessage("server.gameStarting", { count: 3 }),
    you: {
      id: playerId,
      selection: null,
      selectedItem: "quick",
      itemCount: null
    }
  };
  return room;
}
```

#### 5.1.4 本地 3-2-1 倒计时逻辑

复用现有 `room.startCountdown` 渲染逻辑，改为前端 setInterval 驱动：

```js
useEffect(() => {
  if (!room || room.code !== "SOLO" || room.startCountdown == null) return;
  if (room.startCountdown <= 0) return;

  const timer = setInterval(() => {
    setRoom((prev) => {
      if (!prev || prev.startCountdown == null) return prev;
      const next = prev.startCountdown - 1;
      return {
        ...prev,
        startCountdown: next,
        startReveal: next === 0,
        message: next > 0
          ? createMessage("server.gameStarting", { count: next })
          : createMessage("server.gameStarted")
      };
    });
  }, 1000);

  return () => clearInterval(timer);
}, [room?.startCountdown]);
```

并在 `startReveal === true` 后延时 500ms 清除倒计时遮罩：

```js
useEffect(() => {
  if (room?.startReveal && room?.code === "SOLO") {
    const t = setTimeout(() => {
      setRoom((prev) => prev ? { ...prev, startCountdown: null, startReveal: false } : prev);
    }, 500);
    return () => clearTimeout(t);
  }
}, [room?.startReveal]);
```

#### 5.1.5 items-panel 适配无限角标

```jsx
<span className="item-count-badge">
  {room?.you?.itemCount == null ? "♾️" : room.you.itemCount}
</span>
```

> `null` 渲染 ♾️；数字正常渲染；`0` 时 item 已隐藏（条件渲染过滤）。

### 5.2 后端改动

**无改动。** 单人模式不走后端，多人模式逻辑完全保持现有行为。

### 5.3 i18n 新增键

| Key | zh | en | fr |
|---|---|---|---|
| `home.modeLabel` | 模式 | Mode | Mode |
| `home.modeSolo` | 自己玩 | Solo | Solo |
| `home.modeMulti` | 和朋友对战 | Multiplayer | Multijoueur |
| `home.startSolo` | 开始游戏 | Start Game | Commencer |

### 5.4 CSS 新增样式

```css
.mode-select-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.mode-label {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 248, 230, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.mode-options {
  display: flex;
  gap: 10px;
}

.mode-chip {
  padding: 8px 18px;
  border-radius: 999px;
  border: 2px solid rgba(255, 248, 230, 0.2);
  background: rgba(0, 0, 0, 0.2);
  color: rgba(255, 248, 230, 0.7);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.mode-chip:hover {
  border-color: rgba(255, 248, 230, 0.4);
  color: rgba(255, 248, 230, 0.9);
}

.mode-chip.active {
  border-color: rgba(255, 180, 80, 0.8);
  background: rgba(255, 160, 60, 0.15);
  color: #ffe0b2;
  box-shadow: 0 0 16px rgba(255, 160, 60, 0.2);
}
```

---

## 6. 任务拆分

| # | 任务 | 文件 | 预估工时 |
|---|---|---|---|
| 1 | 前端：新增 `gameMode` state 和首页模式选择 UI | `src/App.jsx` | 15 min |
| 2 | 前端：首页按钮/加入房间区域根据 mode 条件渲染 | `src/App.jsx` | 10 min |
| 3 | 前端：实现 `createSoloRoom` + 本地 3-2-1 倒计时 | `src/App.jsx` | 20 min |
| 4 | 前端：items-panel 角标渲染 ♾️（`itemCount == null`） | `src/App.jsx` | 5 min |
| 5 | 前端：新增 i18n 键（zh/en/fr） | `src/i18n.js` | 10 min |
| 6 | 前端：新增 mode-chip CSS | `src/styles.css` | 10 min |
| 7 | 前端：清理 `isHomeAccessEnabled()` / `?t=1` 相关代码 | `src/App.jsx` | 5 min |
| 8 | 端到端测试 | — | 15 min |

**总计：约 1.5 小时**

---

## 7. 验收标准

- [ ] 首页显示模式选择，默认「和朋友对战」
- [ ] 切换到「自己玩」时：按钮变成「开始游戏」，加入房间区域隐藏
- [ ] 点击「开始游戏」后直接出现 3-2-1 倒计时，不经过大厅和道具选择
- [ ] 单人局道具栏只显示速消，角标为 ♾️，可无限次使用
- [ ] 切换回「和朋友对战」时，首页 UI 完全恢复现有状态
- [ ] 多人模式仍要求 >=2 人才能开始，道具选择流程不变
- [ ] 多语言环境文案正确
