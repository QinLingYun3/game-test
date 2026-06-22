# OpenSpec: 快速消除道具（Quick Match）

```yaml
id: match2-quick-match
version: 1.0.0
status: draft
author: Game Team
date: 2026-06-22
```

---

## 1. 背景（Background）

在已有烟雾弹、混乱两种道具的基础上，新增第三种道具"快速消除"。其定位是：不依赖手动选牌，由系统立即消除一对 tile，视觉表现必须与普通手动消除完全一致（放大 + 连线 + 消失动画）。

---

## 2. 需求（Requirements）

### 2.1 功能性需求

| ID | 需求 | 优先级 |
|---|---|---|
| F1 | 道具名称：**快速消除**（内部标识 `quick_match`），图标 `⚡️` | P0 |
| F2 | 使用对象：**自己**（只能对自己使用） | P0 |
| F3 | 使用方式：**双击**道具图标 | P0 |
| F4 | 效果：从当前棋盘中**随机**选择一对可消除的 tile，立即消除 | P0 |
| F5 | 消除时必须与普通手动消除保持**完全一致**的视觉动画：放大、连线、消失 | P0 |
| F6 | 若棋盘 `removablePairs === 0`，道具**禁用**（不可点击，视觉上变灰） | P0 |
| F7 | 消除成功时，用户得分 **+100**（固定分值，不参与 combo 加成） | P0 |
| F8 | 消除后需检查是否棋盘清空 → 进入 results；或无可消除 → 启动 reshuffle | P0 |
| F9 | 需要服务器广播 | P0 |

### 2.2 非功能性需求

| ID | 需求 | 优先级 |
|---|---|---|
| NF1 | 最小改动，复用现有消除逻辑和动画管道 | P1 |
| NF2 | 前端禁用状态需即时响应，不依赖后端返回后再禁 | P1 |

---

## 3. 数据模型

### 3.1 WebSocket 协议

#### 客户端 → 服务器

```json
{
  "type": "use_quick_match",
  "payload": {}
}
```

> 无需 payload（只能对自己使用）。

#### 服务器 → 客户端（通过 `room_state` 广播）

与普通消除完全一致。`serializeRoom` 的 `lastMatch` 字段包含本次快速消除的 pair/path 信息。

---

## 4. 技术方案

### 4.1 后端改动

#### 4.1.1 `shared/game.js` — 新增 `findAnyRemovablePair(board)`

提取 `countRemovablePairs` 中的配对查找逻辑，返回**第一对**找到的坐标，而非计数。

```js
export function findAnyRemovablePair(board) {
  const typeGroups = {};
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const tile = topTile(board[row][col]);
      if (tile) {
        (typeGroups[tile.type] ??= []).push({
          row, col, depth: getCellDepth(board, row, col)
        });
      }
    }
  }

  for (const tiles of Object.values(typeGroups)) {
    if (tiles.length < 2) continue;
    for (let i = 0; i < tiles.length; i += 1) {
      for (let j = i + 1; j < tiles.length; j += 1) {
        const blockedLayers = normalizeBlockedLayers(tiles[i].depth, tiles[j].depth);
        const path = findPath(board, tiles[i], tiles[j], blockedLayers);
        if (path) {
          return {
            pair: [tiles[i], tiles[j]],
            path,
            tile: topTile(board[tiles[i].row][tiles[i].col]),
            depths: {
              first: tiles[i].depth,
              second: tiles[j].depth
            }
          };
        }
      }
    }
  }
  return null;
}
```

#### 4.1.2 `server/roomManager.js` — 新增 `handleQuickMatch(socketId, sockets)`

逻辑与 `handleSelection` 的配对消除阶段完全一致，但跳过"选择"阶段：

1. 通过 `getRoomBySocket(socketId)` 获取房间
2. 校验：
   - 房间存在（`error.roomNotFound`）
   - 当前处于游戏阶段（`error.notGamePhase`）
   - 不在倒计时/揭示期（`error.waitForCountdown`）
   - 不在 reshuffle 中（`error.waitForReshuffle`）
3. 校验 `countRemovablePairs(room.board) > 0`，否则返回 `error.noRemovablePairs`
4. 调用 `findAnyRemovablePair(room.board)` 获取第一对可消除 tile
5. `room.board = removePair(room.board, pair[0], pair[1])`
6. `room.selections.delete(socketId)`（防御性清理，确保不会残留选中态）
7. 重置该用户的 combo 计数器：`room.comboTracker.set(socketId, { count: 0, lastClearedAt: 0 })`
8. `room.lastMatch = { by: socketId, pair, path, tile, depths, token: `${socketId}:${now}:match` }`
9. `room.lastCombo = { by: socketId, count: 1, scoreDelta: SCORE_PER_MATCH, token: `${socketId}:${now}` }`
10. `room.players = room.players.map(...score += SCORE_PER_MATCH...)`
11. 设置 `room.message = createMessage("server.quickMatchUsed", { ... })`
12. 如果 `isBoardCleared(room.board)` 或 `countRemainingTiles === 0` → `finishGame(room)`
13. 否则如果 `!hasAnyMoves(room.board)` → `scheduleDeadlockReshuffle(room, sockets)`
14. 返回 `{ room }`

```js
export function handleQuickMatch(socketId, sockets) {
  const room = getRoomBySocket(socketId);
  if (!room) return { error: createMessage("error.roomNotFound") };
  if (room.phase !== "game") return { error: createMessage("error.notGamePhase") };
  if (room.startCountdown != null || room.startReveal) return { error: createMessage("error.waitForCountdown") };
  if (room.reshuffleCountdown) return { error: createMessage("error.waitForReshuffle") };
  if (countRemovablePairs(room.board) === 0) return { error: createMessage("error.noRemovablePairs") };

  const match = findAnyRemovablePair(room.board);
  if (!match) return { error: createMessage("error.noRemovablePairs") };

  const { pair, path, tile, depths } = match;
  room.board = removePair(room.board, pair[0], pair[1]);
  room.selections.delete(socketId);
  const now = Date.now();
  room.comboTracker.set(socketId, { count: 0, lastClearedAt: 0 });

  room.lastMatch = {
    by: socketId,
    pair,
    path,
    tile,
    depths,
    token: `${socketId}:${now}:match`
  };
  room.lastCombo = {
    by: socketId,
    count: 1,
    scoreDelta: SCORE_PER_MATCH,
    token: `${socketId}:${now}`
  };
  room.players = room.players.map((player) =>
    player.id === socketId
      ? { ...player, score: player.score + SCORE_PER_MATCH }
      : player
  );
  room.message = createMessage("server.quickMatchUsed", {
    nickname: room.players.find((p) => p.id === socketId)?.nickname ?? ""
  });

  if (isBoardCleared(room.board) || countRemainingTiles(room.board) === 0) {
    finishGame(room);
    return { room };
  }

  if (!hasAnyMoves(room.board)) {
    scheduleDeadlockReshuffle(room, sockets);
  }

  return { room };
}
```

> **注意**：`lastCombo` 仍然设置（`count: 1, scoreDelta: 100`），这样前端可以复用 combo popup 的显示管道。但从 combo 累积角度看，`comboTracker` 被重置为 0，因此下一次真实手动消除不会因此获得 combo 加成。

#### 4.1.3 `server/server.js` — 新增消息分支

```js
if (type === "use_quick_match") {
  const result = handleQuickMatch(socketId, sockets);
  if (result.error) return send(socket, "error", { message: result.error });
  return broadcastAfterAction(result.room, sockets);
}
```

### 4.2 前端改动

#### 4.2.1 `src/i18n.js` — 新增翻译键

| Key | zh | en | fr |
|---|---|---|---|
| `item.quickMatch` | 快速消除 | Quick Match | Coup rapide |
| `error.noRemovablePairs` | 当前无可消除的牌 | No removable pairs left | Aucune paire removable |
| `server.quickMatchUsed` | `{{nickname}}` 使用快速消除成功 | `{{nickname}}` used Quick Match | `{{nickname}}` a utilise Coup rapide |

#### 4.2.2 `src/App.jsx` — 新增道具图标

在 `items-column` 中新增第三个 `item-slot`：

```jsx
<div className="item-slot">
  <div
    className={`item-icon quick-match-icon${(room?.removablePairs ?? 0) === 0 ? " disabled" : ""}`}
    onDoubleClick={() => {
      if ((room?.removablePairs ?? 0) === 0) return;
      if (room?.phase !== "game" || room?.startCountdown || room?.startReveal || room?.reshuffleCountdown) return;
      send("use_quick_match");
    }}
    title={t("item.quickMatch")}
  >
    ⚡️
  </div>
</div>
```

> 不使用 `draggable`（不能拖放，只能双击自己使用）。
> 禁用条件：`room?.removablePairs === 0`。此时加 `.disabled` class，视觉上变灰。

#### 4.2.3 `src/styles.css` — 样式

复用 `.item-icon` 的基础样式，hover 效果与烟雾弹道具共用。

```css
.quick-match-icon {
  cursor: pointer;
}

.quick-match-icon.disabled {
  opacity: 0.35;
  cursor: not-allowed;
  pointer-events: none;
}

.smoke-bomb-icon:hover,
.chaos-bomb-icon:hover,
.quick-match-icon:not(.disabled):hover {
  box-shadow:
    0 0 25px rgba(255, 160, 80, 0.4),
    inset 0 0 15px rgba(255, 120, 60, 0.2);
  border-color: rgba(255, 180, 100, 0.5);
}
```

> 现有的 `matchReveal` + `lastMatch` 管道已经能自动渲染放大/连线/消失动画，无需新增前端动画代码。

### 4.3 Test Mode 按钮

Spec 未要求测试按钮。但如果需要，可参照烟雾弹/混乱在 `?test=1` 时增加：

```jsx
<button className="quick-match-test-btn" ... onClick={() => {
  // 本地直接在前端找一对并触发 setMatchReveal 较复杂
  // 本 feature 建议仅通过多人联机测试
}}>⚡️</button>
```

> 快速消除涉及后端棋盘修改 + lastMatch 生成，纯前端测试无法完整模拟，本 spec 暂不提供 test mode 按钮。

---

## 5. 任务拆分

| # | 任务 | 文件 | 预估工时 |
|---|---|---|---|
| 1 | 新增 `findAnyRemovablePair` | `shared/game.js` | 15 min |
| 2 | 实现 `handleQuickMatch` | `server/roomManager.js` | 20 min |
| 3 | 新增 `use_quick_match` 消息处理 | `server/server.js` | 5 min |
| 4 | 新增 i18n 键 | `src/i18n.js` | 10 min |
| 5 | 前端道具图标 + 双击 + 禁用逻辑 | `src/App.jsx` | 15 min |
| 6 | CSS .disabled 与 hover 样式 | `src/styles.css` | 10 min |
| 7 | 端到端测试（联机验证动画） | — | 15 min |

**总计：约 1.5 小时**

---

## 6. 验收标准

- [ ] 游戏开始后道具栏显示 `⚡️`，双击后立即消除一对 tile
- [ ] 消除时播放与普通消除完全一致的放大/连线/消失动画
- [ ] 消除后用户得分 +100
- [ ] 当 `removablePairs === 0` 时，道具图标变灰且不可点击
- [ ] 倒计时、洗牌期间不可使用
- [ ] 消除后若棋盘清空，正常进入结算页面
- [ ] 消除后若无可消除对，正常启动 reshuffle 倒计时
- [ ] 多语言环境（zh/en/fr）下文本正常显示
- [ ] 服务器广播后所有客户端同步状态
