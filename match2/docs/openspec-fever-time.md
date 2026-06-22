# OpenSpec: Fever Time（狂热时刻）

```yaml
id: match2-fever-time
version: 1.1.0
status: completed
author: Game Team
date: 2026-06-22
```

---

## 1. 背景

增加随机触发的限时高分窗口机制，激励玩家在特定时段内集中操作，提升紧张感和娱乐性。

---

## 2. 需求

### 2.1 功能性需求

| ID | 需求 | 优先级 |
|---|---|---|
| F1 | 游戏开始后，系统**随机**在 **60s~180s** 后触发 Fever Time | P0 |
| F2 | Fever Time 持续 **10s**。结束后重新随机 60s~180s 进入下一轮 | P0 |
| F3 | Fever 期间成功消除：**双倍得分**（含 combo 加成也翻倍） | P0 |
| F4 | Fever 期间**点错**（第二下点中与第一下不同的图案，无法配对）：**扣 100 分** | P0 |
| F5 | 扣分下限为 **0**，不会扣成负数 | P0 |
| F6 | **Fever 开始之前**已经点了第一下的，即使第二下在 Fever 期间且配对成功，**不算 Fever** | P0 |
| F7 | Fever 开始前点了第一下，第二下在 Fever 期间点错，**不扣分** | P0 |
| F8 | Fever 期间需要服务器广播 Fever 状态给所有客户端，前端有醒目的 UI 提示 | P0 |
| F9 | 游戏结束回到大厅后，fever 定时器完全清除 | P0 |
| F10 | 玩家离开房间后，fever 定时器清除 | P0 |
| F11 | Fever 期间**禁止使用任何道具**（烟雾弹、混乱、快速消除均禁用） | P0 |
| F12 | 顶部显示红色跳动文字条，文案为「进入FEVER TIME！得分加倍，点错扣分！」 | P0 |
| F13 | 文字条兼具倒计时功能：红色背景宽度随剩余时间逐渐缩短 | P0 |
| F14 | **同时只能存在 1 个 Fever 窗口**，不得重复触发、不得叠加 | P0 |
| F15 | Fever 结束后立即恢复到 1 倍得分、点错不扣分，再开始计算下一个窗口期 | P0 |
| F16 | Test 模式（`?test=1`）下，左下角增加 🔥 测试按钮，点击立即开始 Fever Time | P1 |

### 2.2 非功能性需求

| ID | 需求 | 优先级 |
|---|---|---|
| NF1 | Fever 触发不依赖外部输入，纯后端定时器驱动 | P1 |
| NF2 | 得分/扣分广播后，前端消息文案需区分 Fever 状态 | P1 |
| NF3 | fever 定时器必须与 reshuffle/startCountdown 定时器独立管理 | P1 |
| NF4 | Fever 倒计时前端根据 `endAt` 自行计算，不增加服务器消息频率 | P1 |

---

## 3. 数据模型

### 3.1 后端 Room 新增字段

```ts
interface FeverState {
  active: boolean;
  startAt: number;
  endAt: number;
}
```

```js
room.fever = { active: false, startAt: 0, endAt: 0 };
```

### 3.2 Selection 增强

```js
room.selections.set(socketId, { row, col, selectedAt: now });
```

### 3.3 WebSocket 广播

`serializeRoom()` 返回中新增 `fever` 字段：

```js
fever: room.fever ?? { active: false, startAt: 0, endAt: 0 }
```

### 3.4 Fever 期间 lastCombo 字段扩展

```js
room.lastCombo = {
  by: socketId,
  count: nextComboCount,
  scoreDelta,
  token: `${socketId}:${now}`,
  fever: true
};
```

---

## 4. 技术方案

### 4.1 后端改动

#### 4.1.1 `server/roomManager.js` — 定时器管理

**新增 Fever 定时器 Map**：

```js
const feverTimers = new Map();
```

**`startFeverTimer(room, sockets)`**：

```js
function startFeverTimer(room, sockets) {
  if (room.phase !== "game") return;
  clearFeverTimer(room.code);

  const delay = 60000 + Math.floor(Math.random() * 120000);
  const timerId = setTimeout(() => {
    const liveRoom = rooms.get(room.code);
    if (!liveRoom || liveRoom.phase !== "game") return;
    if (liveRoom.fever?.active) return; // 防重入：已有活跃窗口则不叠加

    const now = Date.now();
    liveRoom.fever = { active: true, startAt: now, endAt: now + 10000 };
    broadcastRoom(liveRoom, sockets);

    const endTimerId = setTimeout(() => {
      const endRoom = rooms.get(room.code);
      if (!endRoom) return;
      endRoom.fever = { active: false, startAt: endRoom.fever?.startAt ?? 0, endAt: Date.now() };
      broadcastRoom(endRoom, sockets);
      startFeverTimer(endRoom, sockets);
    }, 10000);

    feverTimers.set(room.code, endTimerId);
  }, delay);

  feverTimers.set(room.code, timerId);
}
```

**`clearFeverTimer(roomCode)`**：

```js
function clearFeverTimer(roomCode) {
  const id = feverTimers.get(roomCode);
  if (id) {
    clearTimeout(id);
    feverTimers.delete(roomCode);
  }
}
```

**注册点**：
- `startGame()` 成功后调用 `startFeverTimer(room, sockets)`
- `enterLobby()` 中调用 `clearFeverTimer(room.code)`
- `finishGame()` 中调用 `clearFeverTimer(room.code)`
- `leaveRoom()` 中调用 `clearFeverTimer(room.code)`

#### 4.1.2 `server/roomManager.js` — `handleSelection` 改造

```js
export function handleSelection(socketId, position, sockets) {
  const room = getRoomBySocket(socketId);
  if (!room) return { error: createMessage("error.roomNotFound") };
  if (room.phase !== "game") return { error: createMessage("error.notGamePhase") };
  if (room.startCountdown != null || room.startReveal) return { error: createMessage("error.waitForCountdown") };
  if (room.reshuffleCountdown) return { error: createMessage("error.waitForReshuffle") };

  if (!isPositionSelectable(room.board, position)) return { error: createMessage("error.noSelectableTile") };

  const current = room.selections.get(socketId);
  const now = Date.now();

  if (current && current.row === position.row && current.col === position.col) {
    room.selections.delete(socketId);
    room.message = createMessage("server.selectionCanceled");
    return { room };
  }

  if (!current) {
    room.selections.set(socketId, { ...position, selectedAt: now });
    room.message = createMessage("server.firstSelected");
    return { room };
  }

  const result = isValidSelection(room.board, current, position);
  const feverActive = room.fever?.active === true;
  const isFeverMatch = feverActive && current.selectedAt != null && current.selectedAt >= room.fever.startAt;

  if (!result.ok) {
    if (isFeverMatch) {
      room.players = room.players.map((player) =>
        player.id === socketId
          ? { ...player, score: Math.max(0, player.score - 100) }
          : player
      );
      room.lastMatch = null;
      room.lastCombo = null;
      room.message = createMessage("server.feverPenalty", {
        nickname: room.players.find((p) => p.id === socketId)?.nickname ?? ""
      });
    } else {
      room.selections.set(socketId, position);
      room.message = result.reason;
    }
    return { room };
  }

  room.board = removePair(room.board, current, position);
  room.selections.delete(socketId);
  const previousCombo = room.comboTracker.get(socketId) ?? { count: 0, lastClearedAt: 0 };
  let nextComboCount =
    now - previousCombo.lastClearedAt <= COMBO_WINDOW_MS && previousCombo.count > 0 ? previousCombo.count + 1 : 1;
  const baseScore = getScoreDeltaForCombo(nextComboCount);
  const scoreDelta = isFeverMatch ? baseScore * 2 : baseScore;

  room.comboTracker.set(socketId, { count: nextComboCount, lastClearedAt: now });
  room.lastMatch = {
    by: socketId,
    pair: [current, position],
    path: result.path,
    tile: result.tile,
    depths: result.depths,
    token: `${socketId}:${now}:match`
  };
  room.lastCombo = {
    by: socketId,
    count: nextComboCount,
    scoreDelta,
    token: `${socketId}:${now}`,
    fever: isFeverMatch
  };
  room.players = room.players.map((player) =>
    player.id === socketId
      ? { ...player, score: player.score + scoreDelta, maxCombo: Math.max(player.maxCombo ?? 0, nextComboCount) }
      : player
  );
  room.message = createMessage(
    isFeverMatch ? "server.feverMatchScored" : "server.matchScored",
    {
      nickname: room.players.find((p) => p.id === socketId)?.nickname ?? "",
      score: scoreDelta
    }
  );

  if (isBoardCleared(room.board) || countRemainingTiles(room.board) === 0) {
    clearFeverTimer(room.code);
    finishGame(room);
    return { room };
  }

  if (!hasAnyMoves(room.board)) {
    scheduleDeadlockReshuffle(room, sockets);
  }

  return { room };
}
```

#### 4.1.3 Fever 期间禁止道具

**`useSmokeBomb` / `useChaosBomb` / `handleQuickMatch`** 的开头增加校验：

```js
if (room.fever?.active) {
  return { error: createMessage("error.feverNoItems") };
}
```

#### 4.1.4 `serializeRoom` 改造

```js
return {
  // ... 原有字段
  fever: room.fever ?? { active: false, startAt: 0, endAt: 0 }
};
```

### 4.2 前端改动

#### 4.2.1 Fever 期间禁用道具

道具栏的三个图标在 `room?.fever?.active` 为 true 时统一禁用：

```jsx
const feverActive = room?.fever?.active === true;

// 烟雾弹
<div className={`item-icon smoke-bomb-icon${feverActive ? " disabled" : ""}`} ... />

// 混乱
<div className={`item-icon chaos-bomb-icon${feverActive ? " disabled" : ""}`} ... />

// 快速消除
<div className={`item-icon quick-match-icon${feverActive || (room?.removablePairs ?? 0) === 0 ? " disabled" : ""}`} ... />
```

> `.disabled` 类已有样式定义（opacity: 0.35; cursor: not-allowed; pointer-events: none）。

#### 4.2.2 Fever 顶部文字条（中央放大 → 缩小到顶部 + 倒计时）

 Fever 触发时，同一段文本先从屏幕**中央放大显示**，1s 后通过 CSS transition **平滑缩小并位移到顶部**变成提示条。提示条不能凭空出现，必须是中央文本的连续变形。

```jsx
function FeverBar({ endAt }) {
  const [settled, setSettled] = useState(false);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const settleTimer = setTimeout(() => setSettled(true), 1000);
    return () => clearTimeout(settleTimer);
  }, []);

  useEffect(() => {
    const total = 10000;
    let raf;
    function tick() {
      const remaining = Math.max(0, endAt - Date.now());
      setProgress((remaining / total) * 100);
      if (remaining > 0) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [endAt]);

  return (
    <div className={`fever-bar-container${settled ? " settled" : ""}`}>
      <div className="fever-bar-bg" style={{ width: `${progress}%` }} />
      <span className="fever-bar-text">🔥 进入FEVER TIME！得分加倍，点错扣分！</span>
    </div>
  );
}
```

#### 4.2.3 CSS

```css
/* 初始状态：全屏居中放大 */
.fever-bar-container {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  animation: fever-blink 1s ease infinite alternate;
  transition:
    position 0.8s cubic-bezier(0.4, 0, 0.2, 1),
    inset 0.8s cubic-bezier(0.4, 0, 0.2, 1),
    border-radius 0.6s ease,
    height 0.6s ease,
    margin 0.6s ease,
    width 0.6s ease;
}

/* 红色背景 */
.fever-bar-container::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, #c62828, #e53935);
  border-radius: 12px;
  transition: border-radius 0.6s ease;
}

/* 缩小到顶部后的状态 */
.fever-bar-container.settled {
  position: static;
  width: 100%;
  height: 32px;
  margin-bottom: 10px;
  border-radius: 8px;
  overflow: hidden;
  animation: fever-blink 1s ease infinite alternate;
}

.fever-bar-container.settled::before {
  border-radius: 8px;
}

.fever-bar-bg {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.25);
  border-radius: inherit;
  z-index: 1;
}

.fever-bar-text {
  position: relative;
  z-index: 2;
  color: #fff;
  font-size: 48px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  transition: font-size 0.7s cubic-bezier(0.4, 0, 0.2, 1);
}

.fever-bar-container.settled .fever-bar-text {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

@keyframes fever-blink {
  from { box-shadow: 0 0 6px rgba(229, 57, 53, 0.3); }
  to   { box-shadow: 0 0 18px rgba(229, 57, 53, 0.7); }
}
```

#### 4.2.4 Test 模式 🔥 按钮

```jsx
{isTestMode() && room.phase === "game" && (
  <button
    className="fever-test-btn"
    type="button"
    title="测试 FEVER TIME"
    onClick={() => {
      // 本地前端直接触发 fever 效果
      setFeverEffect({ active: true, startAt: Date.now(), endAt: Date.now() + 10000 });
    }}
  >
    🔥
  </button>
)}
```

```css
.fever-test-btn {
  position: fixed;
  left: 148px;
  bottom: 20px;
  z-index: 200;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.4);
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.fever-test-btn:hover {
  transform: scale(1.08);
  box-shadow: 0 0 20px rgba(255, 107, 53, 0.4);
  border-color: rgba(255, 107, 53, 0.6);
}
```

> 烟雾弹按钮在 20px，混乱在 84px，Fever 测试按钮在 148px，三个按钮并排。

#### 4.2.5 `lastCombo` useEffect 改造

```js
setComboPopup({ count: combo.count, by: combo.by, token: combo.token, fever: combo.fever ?? false });
```

#### 4.2.5 i18n 新增键

| Key | zh | en | fr |
|---|---|---|---|
| `game.feverTime` | 🔥 FEVER TIME！双倍得分！ | 🔥 FEVER TIME! Double Score! | 🔥 FEVER TIME! Double score! |
| `server.feverMatchScored` | {{nickname}} FEVER消除！+{{score}} | {{nickname}} FEVER match! +{{score}} | {{nickname}} FEVER match! +{{score}} |
| `server.feverPenalty` | {{nickname}} FEVER点错！-100 | {{nickname}} FEVER penalty! -100 | {{nickname}} FEVER penalty! -100 |
| `error.feverNoItems` | FEVER TIME期间禁止使用道具 | Items are disabled during FEVER TIME | Les objets sont désactivés pendant FEVER TIME |

---

## 5. 任务拆分

| # | 任务 | 文件 | 预估工时 |
|---|---|---|---|
| 1 | 新增 `selectedAt` 到 selections | `server/roomManager.js` | 10 min |
| 2 | 新增 fever 定时器管理 | `server/roomManager.js` | 20 min |
| 3 | hook fever 到生命周期 | `server/roomManager.js` | 10 min |
| 4 | 改造 handleSelection | `server/roomManager.js` | 20 min |
| 5 | Fever 期间禁止道具（useSmoke/useChaos/handleQuickMatch） | `server/roomManager.js` | 10 min |
| 6 | 改造 serializeRoom | `server/roomManager.js` | 5 min |
| 7 | 新增 i18n 键 | `src/i18n.js` | 10 min |
| 8 | 前端道具栏 fever 禁用 | `src/App.jsx` | 10 min |
| 9 | FeverBar 组件 + 倒计时 | `src/App.jsx` | 20 min |
| 10 | Fever CSS 动画 | `src/styles.css` | 15 min |
| 11 | combo popup 区分 fever | `src/App.jsx` + `src/styles.css` | 10 min |
| 12 | 端到端测试 | — | 30 min |

**总计：约 3 小时**

---

## 6. 验收标准

- [x] 游戏开始后 60~180s 随机触发 Fever
- [x] Fever 持续 10s，顶部红色条跳动显示文案，背景宽度随倒计时缩短
- [x] Fever 期间所有道具图标变灰禁用
- [x] Fever 期间成功消除得分翻倍
- [x] Fever 期间点错扣 100 分，最低 0 分
- [x] Fever 开始前点的第一下，第二下在 Fever 期间不算双倍
- [x] Fever 期间使用道具返回错误提示
- [x] Fever 结束后道具恢复可用
- [x] 游戏结束后 Fever 不再触发
- [x] 多语言环境文案正确
