# OpenSpec: 混乱道具（Chaos Bomb）

```yaml
id: match2-chaos-bomb
version: 1.0.0
status: completed
author: Game Team
date: 2026-06-22
```

---

## 1. 背景（Background）

当前游戏已实现烟雾弹（Smoke Bomb）道具，其架构包含：
- 后端 `activeItems` + `itemQueue` 机制，支持道具持续、排队、过期清理
- 前端通过 `room.activeItems` 检测，触发全屏覆盖层 + 自动淡出
- WebSocket 广播使所有客户端同步道具状态

本 spec 在现有架构上新增“混乱”道具，实现方式完全参考烟雾弹，仅在视觉表现上有区别：烟雾弹是遮罩视线，混乱是扰乱图标。

---

## 2. 需求（Requirements）

### 2.1 功能性需求（Functional）

| ID | 需求 | 优先级 |
|---|---|---|
| F1 | 道具名称：**混乱**（内部标识 `chaos`） | P0 |
| F2 | 使用对象：除自己外的其他一名玩家 | P0 |
| F3 | 使用方式 ①：从道具栏拖放到任意其他玩家头像框释放 | P0 |
| F4 | 使用方式 ②：双击道具图标，自动对当前分数最高的其他玩家使用 | P0 |
| F5 | 效果：被击中者棋盘上的**顶层 tile 图标**快速切换 | P0 |
| F6 | 切换规则：使用与 tile 本身**不同的另外 3 个图标**，加上**本身图标**，共 4 个，循环轮换 | P0 |
| F7 | 轮换节奏：每个非本身图标停留 **0.2s**，轮到本身图标时**停顿 0.5s**，继续循环 | P0 |
| F8 | 持续时间：**6s**。到时间后立即切换回本身图标，动画停止 | P0 |
| F9 | 效果释放中**不影响** tile 的点击、放大、配对、消除逻辑 | P0 |
| F10 | 生效时在被击中玩家昵称下方显示小图标标记 | P0 |
| F11 | 道具状态需通过服务器广播给房间内所有客户端 | P0 |
| F12 | 同一目标已有混乱效果时，新道具进入队列，当前效果结束后自动生效 | P0 |
| F13 | 每个 tile 的 3 个假图标**独立随机**选取，不要求一致 | P0 |
| F14 | 各 tile 的动画起始时间有随机错落，偏移量 **0~1s**，增强混乱感 | P0 |

### 2.2 非功能性需求（Non-Functional）

| ID | 需求 | 优先级 |
|---|---|---|
| NF1 | 图标轮换必须纯前端实现，不增加服务器消息频率 | P1 |
| NF2 | 动画不能阻塞 UI 线程，必须使用 CSS 或 requestAnimationFrame | P1 |
| NF3 | 效果到期清理逻辑与烟雾弹保持一致（6s 过期 + setTimeout 广播） | P1 |

---

## 3. 数据模型（Data Model）

### 3.1 后端 `activeItems / itemQueue` 项结构

新增 `type: "chaos"`，其余字段与烟雾弹完全一致：

```ts
interface ActiveItem {
  type: "chaos";           // 道具类型
  by: string;              // 使用者 socketId
  target: string;          // 被击中者 socketId
  token: string;           // 唯一标识，格式："chaos:{socketId}:{timestamp}"
  expiresAt: number;       // 过期时间戳，now + 6000ms
}
```

### 3.2 WebSocket 协议

#### 客户端 → 服务器

```json
{
  "type": "use_chaos_bomb",
  "payload": {
    "targetId": "<socketId>"
  }
}
```

#### 服务器 → 客户端（通过 `room_state` 广播）

`serializeRoom()` 返回的 `activeItems` 数组中已包含 `chaos` 类型项，前端无需额外消息类型。

---

## 4. 技术方案（Technical Design）

### 4.1 后端改动

#### 4.1.1 `server/roomManager.js`

新增导出函数 `useChaosBomb(socketId, targetId)`，逻辑完全镜像 `useSmokeBomb()`：

1. 通过 `getRoomBySocket(socketId)` 获取房间
2. 校验：
   - 房间存在（`error.notInRoom`）
   - 当前处于游戏阶段（`error.notGamePhase`）
   - 不能对自己使用（`error.cannotTargetSelf`）
   - 目标玩家必须在房间内（`error.playerNotInRoom`）
3. 生成 token：`chaos:${socketId}:${now}`
4. 创建 item：`{ type: "chaos", by, target, token, expiresAt: now + 6000 }`
5. 检查是否已有同类型同目标的 active item：
   - 有 → push 到 `itemQueue`
   - 无 → push 到 `activeItems`
6. 返回 `{ room, by, target, token, queued }`

#### 4.1.2 `server/server.js`

在 `socket.on("message")` 中新增消息处理分支：

```js
if (type === "use_chaos_bomb") {
  const result = useChaosBomb(socketId, payload?.targetId);
  if (result.error) return send(socket, "error", { message: result.error });
  broadcastAfterAction(result.room, sockets);
  // 6000ms 后清理过期 item，同时检查 itemQueue 晋升
  setTimeout(() => {
    const liveRoom = getRoomBySocket(socketId);
    if (!liveRoom || !liveRoom.activeItems) return;
    const before = liveRoom.activeItems.length;
    const now = Date.now();
    liveRoom.activeItems = liveRoom.activeItems.filter((item) => item.expiresAt > now);
    const changed = liveRoom.activeItems.length !== before;
    const expiredTargets = [];
    for (let i = liveRoom.itemQueue.length - 1; i >= 0; i--) {
      const q = liveRoom.itemQueue[i];
      const stillActive = liveRoom.activeItems.some((a) => a.type === q.type && a.target === q.target);
      if (!stillActive && !expiredTargets.some((t) => t.type === q.type && t.target === q.target)) {
        liveRoom.activeItems.push(q);
        expiredTargets.push({ type: q.type, target: q.target });
        liveRoom.itemQueue.splice(i, 1);
      }
    }
    if (changed || expiredTargets.length > 0) {
      broadcastAfterAction(liveRoom, sockets);
    }
  }, 6000);
  return;
}
```

> 注：setTimeout 中的清理逻辑与烟雾弹**完全一致**。若未来道具数量增加，建议重构为通用函数 `expireItems(room, type)`。本 spec 要求最小改动，保持复制。

#### 4.1.3 `roomManager.js` 的 `enterLobby()` / `leaveRoom()`

已有逻辑会自动清理 `activeItems` 和 `itemQueue` 中涉及离开玩家的项（通过 `by` / `target` 过滤）。混乱道具无需额外改动。

### 4.2 前端改动

#### 4.2.1 `src/App.jsx`

##### State 管理

```js
const [chaosEffect, setChaosEffect] = useState(null);
const lastChaosTokenRef = useRef("");
```

##### 效果触发 useEffect（参考烟雾弹 L613-634）

```js
// 检测是否有新的 chaos 效果作用在自己身上
useEffect(() => {
  const chaosItem = room?.activeItems?.find((item) => item.type === "chaos" && item.target === playerId);
  if (!chaosItem) return undefined;
  if (chaosItem.token === lastChaosTokenRef.current) return undefined;
  lastChaosTokenRef.current = chaosItem.token;
  setChaosEffect(chaosItem);
  return undefined;
}, [room?.activeItems, playerId]);

// 6000ms 后清除
useEffect(() => {
  if (!chaosEffect) return undefined;
  const clearTimer = window.setTimeout(() => {
    setChaosEffect(null);
  }, 6000);
  return () => {
    window.clearTimeout(clearTimer);
  };
}, [chaosEffect]);
```

##### 图标轮换逻辑

每个顶层 tile 渲染时，若 `chaosEffect` 存在，需要用 CSS animation 实现图标轮换。不读取 tile 真实 type，只更改**视觉图标**。

实现方式：在 tile 渲染循环中，给顶层 `<span className="suit-icon">` 增加一个 wrapper，当 `chaosEffect` 存在时，用 CSS keyframes 驱动 4 个图标的隐藏/显示。

> **每个 tile 的 3 个假图标独立随机选取**。每个 tile 的动画起始时间也独立随机延迟 `0~1000ms`（通过 `--chaos-start` CSS 变量），使全棋盘不会整齐划一地切换。

```jsx
// 在 board-grid 渲染的 tile span 内部
const isChaosTarget = chaosEffect && !isEmpty && isTopLayer;
const chaosIcons = isChaosTarget ? getChaosIcons(tile.type) : null;
const chaosDelay = isChaosTarget ? Math.random() * 1000 : 0; // 0~1000ms 随机错落

<span
  className={`suit-icon${chaosIcons ? " chaos-cycling" : ""}`}
  style={chaosIcons ? { "--chaos-start": `${chaosDelay}ms` } : undefined}
>
  {chaosIcons ? (
    chaosIcons.map((icon, idx) => (
      <span key={idx} className="chaos-icon">{icon}</span>
    ))
  ) : (
    tile.icon ?? "?"
  )}
</span>
```

CSS 将利用额外的 inline `<span>` children 实现 4 图标的交替，并结合 `--chaos-start` 变量控制整体偏移。具体见 §5.2。

##### 拖放与双击（参考烟雾弹 L1029-1047）

- 道具栏新增混乱图标 `<div className="item-icon chaos-bomb-icon"> ... </div>`
- `draggable` 条件与烟雾弹一致：`room?.phase === "game" && !room?.startCountdown && !room?.startReveal && !room?.reshuffleCountdown`
- `onDragStart`：`event.dataTransfer.setData("text/item", "chaos")`
- `onDrop` 在玩家卡片上：增加 `item === "chaos"` 分支，发送 `"use_chaos_bomb"`
- `onDoubleClick`：找到 `ranking.find((p) => p.id !== playerId)`，发送 `"use_chaos_bomb"`

##### 玩家卡片小图标（参考烟雾弹 L1011-1015）

已有逻辑遍历 `room.activeItems` 并显示图标：

```jsx
{room?.activeItems?.filter((item) => item.target === player.id).map((item) => (
  <span key={item.token} className="player-active-item" title={item.type === "smoke" ? "烟雾弹" : item.type === "chaos" ? "混乱" : item.type}>
    {item.type === "chaos" ? "😵‍💫" : item.type === "smoke" ? "😶‍🌫️" : "🎁"}
  </span>
))}
```

##### Test Mode 按钮（参考烟雾弹 L1231-1243）

在 `isTestMode()` 区域新增混乱测试按钮，放在烟雾弹测试按钮旁边（左下角）：

```jsx
{isTestMode() && room.phase === "game" && (
  <button
    className="chaos-test-btn"
    type="button"
    title="测试混乱"
    onClick={() => {
      setChaosEffect({ token: `test:${Date.now()}` });
    }}
  >
    😵‍💫
  </button>
)}
```

#### 4.2.2 `src/styles.css`

##### 图标轮换动画（核心视觉）

顶层 tile 被施加混乱时，`.suit-icon` 内显示 4 个图标交替。利用 CSS 的 animation + `content`（有限支持）或额外的 inline `<span>` children。

由于 CSS `content` 属性在 `::before/::after` 中不能直接用 `animation` 改变值（需 `@property` 或 steps），推荐方案：在 DOM 中插入 4 个叠在一起的 `<span>`，用 animation 控制 opacity。

```css
/* 给 suit-icon 添加 chaos 模式 */
.suit-icon.chaos-cycling {
  position: relative;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
}

.suit-icon.chaos-cycling .chaos-icon {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  opacity: 0;
  animation-duration: 1.1s;
  animation-iteration-count: infinite;
  animation-delay: calc(var(--chaos-start, 0s));
}

/* 4 个子元素使用各自独立的 keyframes，show 窗口无缝衔接 */
.suit-icon.chaos-cycling .chaos-icon:nth-child(1) { animation-name: chaos-self;   }
.suit-icon.chaos-cycling .chaos-icon:nth-child(2) { animation-name: chaos-fake-1;  }
.suit-icon.chaos-cycling .chaos-icon:nth-child(3) { animation-name: chaos-fake-2;  }
.suit-icon.chaos-cycling .chaos-icon:nth-child(4) { animation-name: chaos-fake-3;  }

/* 本身图标：0s ~ 0.5s 显示 (45% of 1.1s) */
@keyframes chaos-self {
  0%, 45%  { opacity: 1; }
  46%, 100% { opacity: 0; }
}

/* 假冒图标 1：0.5s ~ 0.7s 显示 */
@keyframes chaos-fake-1 {
  0%, 45%  { opacity: 0; }
  46%, 63% { opacity: 1; }
  64%, 100% { opacity: 0; }
}

/* 假冒图标 2：0.7s ~ 0.9s 显示 */
@keyframes chaos-fake-2 {
  0%, 63%  { opacity: 0; }
  64%, 81% { opacity: 1; }
  82%, 100% { opacity: 0; }
}

/* 假冒图标 3：0.9s ~ 1.1s 显示 (82% ~ 100%) */
@keyframes chaos-fake-3 {
  0%, 81%  { opacity: 0; }
  82%, 100% { opacity: 1; }
}
```

> 4 个 `@keyframes` 的 show 窗口在 1.1s 周期内严格首尾相接，因此任意时刻**恰好只有一个** `<span>` 的 `opacity` 为 1，不存在空白帧。
> 所有子元素共用同一个 `--chaos-start` 偏移，确保同一 tile 上的 4 个图标同步启动。
> 不同 tile 之间通过各自独立的 `--chaos-start` 实现随机错落。

> 一个完整周期 = 本身图标 0.5s + 假图标1 0.2s + 假图标2 0.2s + 假图标3 0.2s + 空白 1.0s = **2.1s**。6s 内约循环 2.85 次，视觉上足够。

备选简化方案：如果精确时间不需要那么严格，可以让 4 个 icon 各停留 0.25s，利用 `steps(4)` 简化动画。但需求要求“本身图标停 0.5s，其余 0.2s”，因此使用上述 keyframes。

**注意**：CSS 的 `content` 不能用 `animation` 驱动文本变化，必须通过 DOM children 的 opacity 切换实现。

##### 道具栏图标样式

混乱道具图标不需要独立的 hover 效果，直接复用 `.smoke-bomb-icon:hover`：

```css
.smoke-bomb-icon:hover,
.chaos-bomb-icon:hover {
  box-shadow:
    0 0 25px rgba(255, 160, 80, 0.4),
    inset 0 0 15px rgba(255, 120, 60, 0.2);
  border-color: rgba(255, 180, 100, 0.5);
}
```
.chaos-test-btn {
  position: fixed;
  left: 84px;  /* 烟雾弹在 20px，间隔 64px */
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
.chaos-test-btn:hover {
  transform: scale(1.08);
  box-shadow: 0 0 20px rgba(255, 0, 128, 0.35);
  border-color: rgba(255, 0, 128, 0.6);
}
```

##### 玩家卡片状态图标

`.player-active-item` 已存在，无需新增样式，只需扩展 `title` 文本。

#### 4.2.3 `src/i18n.js`

新增翻译键（zh/en/fr）：

| Key | zh | en | fr |
|---|---|---|---|
| `item.chaos` | 混乱 | Chaos | Chaos |
| `error.cannotTargetSelf` | 不能对自己使用 | Cannot use on yourself | Impossible de s'auto-cibler |
| `error.playerNotInRoom` | 目标玩家不在房间中 | Target player not in room | Joueur cible introuvable |

> `error.cannotTargetSelf` 和 `error.playerNotInRoom` 在烟雾弹实现中尚未在 i18n 中添加（后端使用了这些 key），建议一并补齐。

#### 4.2.4 `shared/game.js`

目前 `TILE_TYPES` 未导出。前端需要访问全部图标列表，以便为每个 tile 的 `type` 挑选 3 个不同的假图标。

方案 A（推荐）：导出 `TILE_TYPES`：
```js
export const TILE_TYPES = [ ... ];
```

方案 B：在前端硬编码图标列表（维护两份，不推荐）。

**选择方案 A**，最小改动且避免重复。

前端根据 tile 的 `type` 计算假图标列表：
```js
import { TILE_TYPES } from "@shared/game.js";

function getChaosIcons(realType) {
  const shuffled = TILE_TYPES.filter((t) => t.key !== realType)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map((t) => t.icon);
  return [TILE_TYPES.find((t) => t.key === realType).icon, ...shuffled];
}
```

> 注意：
> - 假图标的随机性不需要种子同步，因为纯视觉干扰不影响游戏逻辑。
> - 但要确保每个 tile 的 3 个假图标互不相同且不等于本身。
> - 每个 tile 独立调用 `getChaosIcons()`，因此不同 tile 上的假图标可以完全不同。

---

## 5. 接口定义（API / Interface）

### 5.1 后端导出函数签名

```ts
// server/roomManager.js
export function useChaosBomb(socketId: string, targetId: string): {
  room?: Room;
  by?: string;
  target?: string;
  token?: string;
  queued?: boolean;
  error?: Message;
};
```

### 5.2 前端组件接口

| Props / State | 类型 | 说明 |
|---|---|---|
| `chaosEffect` | `{ token: string } \| null` | 当前作用在自己身上的 chaos 效果 |

### 5.3 关键渲染伪代码

```jsx
// Board tile rendering (inside board-grid map)
const isChaosTarget = chaosEffect && !isEmpty && isTopLayer;
const chaosIcons = isChaosTarget ? getChaosIcons(tile.type) : null;
const chaosDelay = isChaosTarget ? Math.floor(Math.random() * 1000) : 0;

<span
  className={`suit-icon${chaosIcons ? " chaos-cycling" : ""}`}
  style={chaosIcons ? { "--chaos-start": `${chaosDelay}ms` } : undefined}
>
  {chaosIcons ? (
    chaosIcons.map((icon, idx) => (
      <span key={idx} className="chaos-icon">{icon}</span>
    ))
  ) : (
    tile.icon ?? "?"
  )}
</span>
```

---

## 6. 流程图（Flow）

```
[玩家A 拖放/双击混乱道具]
          │
          ▼
[App.jsx] send("use_chaos_bomb", { targetId: B })
          │
          ▼
[server.js] 解析 type === "use_chaos_bomb"
          │
          ▼
[roomManager.useChaosBomb(B)]
    ├─ 合法性校验 ──▶ 失败 → 发 error 给 A
    ├─ 创建 chaos item，expiresAt = now + 6000
    ├─ 检查 B 是否已有 chaos active
    │       ├─ 有 → 放入 itemQueue
    │       └─ 无 → 放入 activeItems
    └─ 返回 { room, token, queued }
          │
          ▼
[server.js] broadcastAfterAction(room, sockets)
    ├─ 所有客户端收到 room_state（含 activeItems）
    └─ setTimeout(6000ms) 清理过期 + 晋升 queue
          │
          ▼
[App.jsx 玩家B侧]
    └─ room.activeItems 变化 → 检测 chaos target === self
        ├─ 是新 token → setChaosEffect(item)
        ├─ 启动 6000ms timer → setChaosEffect(null)
        └─ 渲染 board 时，顶层 tile 加 .chaos-cycling，显示 4 图标轮换
          │
          ▼
[App.jsx 所有玩家侧]
    └─ 玩家列表渲染 activeItems，B 的头像下方显示 😵‍💫 标记
```

---

## 7. 测试策略（Testing）

### 7.1 手动测试清单

| # | 步骤 | 预期结果 |
|---|---|---|
| 1 | 创建房间，2 人开局 | 正常开始游戏 |
| 2 | A 拖放混乱到 B 头像 | B 的棋盘顶层 tile 图标开始轮换；B 头像下方出现 😵‍💫；A 的棋盘不受影响 |
| 3 | B 在混乱期间点击、配对、消除 | 操作正常生效，消除的是 tile 的真实 type |
| 4 | 6s 后 | B 的 tile 图标立即恢复为本身；😵‍💫 标记消失；各 tile 切换时间错落自然 |
| 5 | A 在 B 已有混乱时再次使用 | 新混乱进入 itemQueue；6s 后 B 的混乱继续新一轮 |
| 6 | A 双击混乱道具 | 自动对当前分数最高的**其他**玩家使用 |
| 7 | A 尝试对自己使用（不可能，但拖放不允许） | 拖放目标排除自己；代码层面也返回 error |
| 8 | 游戏结束后回到大厅 | activeItems / itemQueue 被清空，无残留效果 |
| 9 | Test mode (`?test=1`) 点击测试按钮 | B 本地触发混乱效果（不经过服务器）|

### 7.2 边界情况

| 场景 | 处理 |
|---|---|
| 目标玩家中途离开 | `leaveRoom()` 过滤掉涉及该玩家的 item，效果自动终止 |
| 页面刷新 | 重新连接后从 `room_state` 恢复 activeItems，若 chaos 仍在有效期则继续显示剩余时间；前端 timer 重新按剩余时间计算（或简化处理：直接用 CSS animation 持续时间，不依赖 JS timer 的精确性） |
| 多层 tile，上层被消除后露出下层 | 新露出的顶层 tile 若仍在 chaos 效果期内，应独立随机生成假图标与延迟，开始轮换 |
| tile 被选中放大时 | 轮换继续，视觉正常 |

---

## 8. 风险与回滚（Risks & Rollback）

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| CSS 动画在 4 图标交错时性能开销 | 低 | 仅 16 种 tile × 最多可见层数，DOM 增量极小；使用 opacity 无 reflow |
| `TILE_TYPES` 导出影响 tree-shaking | 极低 | Vite 对常量数组优化良好 |
| 与烟雾弹同时叠加 | 中 | 两者独立，`activeItems` 允许多个不同类型 item 共存；视觉层面烟雾遮罩 + 混乱轮换可叠加 |
| 代码与烟雾弹大量重复 | 中 | 本版本先复制实现以保证稳定性；后续可重构通用道具框架 |

回滚策略：
- 纯增量化改动，不涉及数据迁移。
- 回滚时只需删除 `use_chaos_bomb` 消息分支、`useChaosBomb` 函数、前端 UI、样式、i18n 键即可。

---

## 9. 任务拆分（Task Breakdown）

| # | 任务 | 文件 | 预估工时 |
|---|---|---|---|
| 1 | 导出 `TILE_TYPES` | `shared/game.js` | 5 min |
| 2 | 实现 `useChaosBomb()` + `enterLobby` 清理确认 | `server/roomManager.js` | 15 min |
| 3 | 新增 `use_chaos_bomb` 消息处理 | `server/server.js` | 10 min |
| 4 | 新增 i18n 文本键 | `src/i18n.js` | 10 min |
| 5 | 前端 state、效果触发、拖放/双击、渲染、测试按钮 | `src/App.jsx` | 30 min |
| 6 | 混乱动画 CSS、道具栏样式 | `src/styles.css` | 20 min |
| 7 | 端到端手动测试 + 微调 | — | 20 min |

**总计：约 1.5 小时**

---

## 10. 验收标准（Acceptance Criteria）

- [x] 游戏开始后可以从道具栏拖放混乱到对手头像，成功触发效果
- [x] 双击混乱道具自动对分数最高的其他玩家生效
- [x] 被击中者所有**顶层** tile 图标以 4 图标轮换（本身停 0.5s，其余各 0.2s），持续 6s
- [x] 混乱期间 tile 仍可正常点击、配对、消除（逻辑基于真实 type）
- [x] 6s 到期后所有 tile 图标立即恢复为本身样式
- [x] 生效期间被击中玩家昵称下方显示 😵‍💫 图标
- [x] 同一目标连续使用混乱时，后续进入队列，当前结束后自动生效
- [x] 玩家离开房间或回到大厅后，混乱效果及标记完全清除
- [x] 测试模式下可本地触发混乱效果看动画
- [x] 多语言环境（zh/en/fr）下文本正常显示
