import {
  reloadLevelConfig,
  countRemovablePairs,
  findAnyRemovablePair,
  SCORE_PER_MATCH,
  countRemainingTiles,
  createBoard,
  getDifficultyRanges,
  hasAnyMoves,
  isBoardCleared,
  isPositionSelectable,
  isValidSelection,
  removePair,
  reshuffleBoard,
  LEVEL_CONFIGS
} from "../shared/game.js";

const HARD_RANGE = getDifficultyRanges(LEVEL_CONFIGS).Hard ?? { start: 0, end: 0 };

const rooms = new Map();
const socketToRoom = new Map();
const reshuffleIntervals = new Map();
const startCountdownIntervals = new Map();
const startRevealTimeouts = new Map();
const feverTimers = new Map();
const itemSelectionTimers = new Map();
const COMBO_WINDOW_MS = 2000;
const MAX_PLAYERS = 4;

function createMessage(key, params = {}) {
  return { key, params };
}

function clearReshuffleCountdown(roomCode) {
  const intervalId = reshuffleIntervals.get(roomCode);
  if (intervalId) {
    clearInterval(intervalId);
    reshuffleIntervals.delete(roomCode);
  }
}

function clearStartCountdown(roomCode) {
  const intervalId = startCountdownIntervals.get(roomCode);
  if (intervalId) {
    clearInterval(intervalId);
    startCountdownIntervals.delete(roomCode);
  }
  const timeoutId = startRevealTimeouts.get(roomCode);
  if (timeoutId) {
    clearTimeout(timeoutId);
    startRevealTimeouts.delete(roomCode);
  }
}

function clearFeverTimer(roomCode) {
  const id = feverTimers.get(roomCode);
  if (id) {
    clearTimeout(id);
    feverTimers.delete(roomCode);
  }
}

function clearItemSelectionTimer(roomCode) {
  const id = itemSelectionTimers.get(roomCode);
  if (id) {
    clearInterval(id);
    itemSelectionTimers.delete(roomCode);
  }
}

function startFeverTimer(room, sockets) {
  if (room.phase !== "game") return;
  clearFeverTimer(room.code);

  const delay = 60000 + Math.floor(Math.random() * 120000); // 60s~180s
  const timerId = setTimeout(() => {
    const liveRoom = rooms.get(room.code);
    if (!liveRoom || liveRoom.phase !== "game") return;
    if (liveRoom.fever?.active || liveRoom.feverEverTriggered) return;

    const now = Date.now();
    liveRoom.fever = { active: true, startAt: now, endAt: now + 11000 };
    liveRoom.feverEverTriggered = true;
    broadcastRoom(liveRoom, sockets);

    const endTimerId = setTimeout(() => {
      const endRoom = rooms.get(room.code);
      if (!endRoom) return;
      endRoom.fever = { active: false, startAt: endRoom.fever?.startAt ?? 0, endAt: Date.now() };
      broadcastRoom(endRoom, sockets);
      startFeverTimer(endRoom, sockets);
    }, 11000);

    feverTimers.set(room.code, endTimerId);
  }, delay);

  feverTimers.set(room.code, timerId);
}

export function triggerFeverNow(room, sockets) {
  if (room.fever?.active || room.feverEverTriggered) return;
  clearFeverTimer(room.code);
  const now = Date.now();
  room.fever = { active: true, startAt: now, endAt: now + 11000 };
  room.feverEverTriggered = true;
  broadcastRoom(room, sockets);

  const endTimerId = setTimeout(() => {
    const endRoom = rooms.get(room.code);
    if (!endRoom) return;
    endRoom.fever = { active: false, startAt: endRoom.fever?.startAt ?? 0, endAt: Date.now() };
    broadcastRoom(endRoom, sockets);
    startFeverTimer(endRoom, sockets);
  }, 11000);

  feverTimers.set(room.code, endTimerId);
}

function maybeTriggerFeverByTiles(room, sockets) {
  if (room.feverEverTriggered || !room.initialTileCount) return;
  const remaining = countRemainingTiles(room.board);
  if (remaining <= Math.floor(room.initialTileCount / 2)) {
    triggerFeverNow(room, sockets);
  }
}

function makeRoomCode() {
  let code = "";
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(code));
  return code;
}

function createPlayer(socketId, nickname, avatarSeed) {
  return {
    id: socketId,
    nickname,
    avatarSeed,
    score: 0,
    maxCombo: 0,
    connected: true
  };
}

function normalizeNicknameForCompare(nickname) {
  return String(nickname ?? "").trim().toLocaleLowerCase();
}

function resetScores(players) {
  return players.map((player) => ({ ...player, score: 0, maxCombo: 0 }));
}

function createComboTracker(players) {
  return new Map(players.map((player) => [player.id, { count: 0, lastClearedAt: 0 }]));
}

function getScoreDeltaForCombo(comboCount) {
  return Math.round(SCORE_PER_MATCH * 1.5 ** Math.max(0, comboCount));
}

function serializeRoom(room, playerId) {
  const ranking = [...room.players].sort((a, b) => b.score - a.score);
  const now = Date.now();
  const activeItems = (room.activeItems || [])
    .filter((item) => item.expiresAt > now)
    .map(({ type, by, target, token }) => ({ type, by, target, token }));

  if (room.itemSelectionActive) {
    return {
      code: room.code,
      phase: room.phase,
      hostId: room.hostId,
      players: room.players,
      ranking,
      board: room.board,
      message: room.message,
      lastMatch: room.lastMatch,
      lastCombo: room.lastCombo ?? null,
      startCountdown: room.startCountdown ?? null,
      startReveal: room.startReveal ?? false,
      reshuffleCountdown: room.reshuffleCountdown ?? null,
      removablePairs: room.board ? countRemovablePairs(room.board) : 0,
      remainingTiles: room.board ? countRemainingTiles(room.board) : 0,
      canStart: false,
      activeItems,
      fever: room.fever ?? { active: false, startAt: 0, endAt: 0 },
      itemSelectionActive: true,
      itemSelectionCountdown: room.itemSelectionCountdown,
      itemSelections: room.itemSelections ?? {},
      you: {
        id: playerId,
        selection: null,
        selectedItem: room.itemSelections?.[playerId] ?? null
      }
    };
  }

  return {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    players: room.players,
    ranking,
    board: room.board,
    message: room.message,
    lastMatch: room.lastMatch,
    lastCombo: room.lastCombo ?? null,
    startCountdown: room.startCountdown ?? null,
    startReveal: room.startReveal ?? false,
    reshuffleCountdown: room.reshuffleCountdown ?? null,
    removablePairs: room.board ? countRemovablePairs(room.board) : 0,
    remainingTiles: room.board ? countRemainingTiles(room.board) : 0,
    canStart: room.players.length >= 2 && room.hostId === playerId && room.phase === "lobby",
    activeItems,
    fever: room.fever ?? { active: false, startAt: 0, endAt: 0 },
    itemSelectionActive: false,
    itemSelectionCountdown: null,
    you: {
      id: playerId,
      selection: room.selections.get(playerId) ?? null,
      selectedItem: room.itemSelections?.[playerId] ?? null,
      itemCount: room.itemCounts?.[playerId]?.[room.itemSelections?.[playerId]] ?? 0
    }
  };
}

function broadcastRoom(room, sockets) {
  room.players.forEach((player) => {
    const socket = sockets.get(player.id);
    if (!socket || socket.readyState !== 1) return;
    socket.send(
      JSON.stringify({
        type: "room_state",
        payload: serializeRoom(room, player.id)
      })
    );
  });
}

function enterLobby(room) {
  clearReshuffleCountdown(room.code);
  clearStartCountdown(room.code);
  clearFeverTimer(room.code);
  clearItemSelectionTimer(room.code);
  if (room.phase === "results") {
    room.levelIndex = room.levelIndex >= HARD_RANGE.end ? HARD_RANGE.start : room.levelIndex + 1;
  }
  room.phase = "lobby";
  room.board = null;
  room.selections = new Map();
  room.lastMatch = null;
  room.lastCombo = null;
  room.comboTracker = createComboTracker(room.players);
  room.startCountdown = null;
  room.startReveal = false;
  room.reshuffleCountdown = null;
  room.activeItems = [];
  room.itemQueue = [];
  room.fever = { active: false, startAt: 0, endAt: 0 };
  room.feverEverTriggered = false;
  room.initialTileCount = 0;
  room.itemSelectionActive = false;
  room.itemSelectionCountdown = null;
  room.itemSelections = {};
  room.itemCounts = {};
  room.message = room.players.length < 2 ? createMessage("server.waitingForPlayer") : createMessage("server.hostCanStart");
  room.players = resetScores(room.players);
}

function scheduleDeadlockReshuffle(room, sockets) {
  if (reshuffleIntervals.has(room.code)) return;

  room.selections = new Map();
  room.reshuffleCountdown = 5;
  room.lastCombo = null;
  room.message = createMessage("server.noMovesReshuffle", { count: 5 });
  broadcastRoom(room, sockets);

  const intervalId = setInterval(() => {
    const liveRoom = rooms.get(room.code);
    if (!liveRoom) {
      clearReshuffleCountdown(room.code);
      return;
    }

    if (liveRoom.phase !== "game") {
      liveRoom.reshuffleCountdown = null;
      clearReshuffleCountdown(room.code);
      broadcastRoom(liveRoom, sockets);
      return;
    }

    liveRoom.reshuffleCountdown -= 1;

    if (liveRoom.reshuffleCountdown > 0) {
      liveRoom.message = createMessage("server.noMovesReshuffle", { count: liveRoom.reshuffleCountdown });
      broadcastRoom(liveRoom, sockets);
      return;
    }

    liveRoom.board = reshuffleBoard(liveRoom.board);
    liveRoom.reshuffleCountdown = null;
    liveRoom.lastMatch = null;
    liveRoom.lastCombo = null;
    liveRoom.message = createMessage("server.boardReshuffled");
    clearReshuffleCountdown(room.code);
    broadcastRoom(liveRoom, sockets);
  }, 1000);

  reshuffleIntervals.set(room.code, intervalId);
}

export function createRoom({ socketId, nickname, avatarSeed }) {
  const code = makeRoomCode();
  const room = {
    code,
    hostId: socketId,
    phase: "lobby",
    players: [createPlayer(socketId, nickname, avatarSeed)],
    board: null,
    levelIndex: HARD_RANGE.start,
    selections: new Map(),
    lastMatch: null,
    lastCombo: null,
    startCountdown: null,
    startReveal: false,
    comboTracker: createComboTracker([createPlayer(socketId, nickname, avatarSeed)]),
    activeItems: [],
    itemQueue: [],
    fever: { active: false, startAt: 0, endAt: 0 },
    feverEverTriggered: false,
    initialTileCount: 0,
    itemSelectionActive: false,
    itemSelectionCountdown: null,
    itemSelections: {},
    itemCounts: {},
    message: createMessage("server.waitingForPlayer")
  };

  rooms.set(code, room);
  socketToRoom.set(socketId, code);
  return room;
}

export function joinRoom({ socketId, nickname, code, avatarSeed }) {
  const room = rooms.get(code);
  if (!room) return { error: createMessage("error.roomNotFound") };
  if (room.players.length >= MAX_PLAYERS) return { error: createMessage("error.roomFull") };
  if (room.phase !== "lobby") return { error: createMessage("error.gameAlreadyStarted") };
  if (room.players.some((player) => normalizeNicknameForCompare(player.nickname) === normalizeNicknameForCompare(nickname))) {
    return { error: createMessage("error.nicknameTaken") };
  }

  room.players.push(createPlayer(socketId, nickname, avatarSeed));
  room.comboTracker.set(socketId, { count: 0, lastClearedAt: 0 });
  room.message = createMessage("server.playersReady");
  socketToRoom.set(socketId, code);
  return { room };
}

export function updateAvatar(socketId, avatarSeed) {
  const room = getRoomBySocket(socketId);
  if (!room) return { error: createMessage("error.roomNotFound") };
  if (room.phase !== "lobby") return { error: createMessage("error.avatarLobbyOnly") };

  room.players = room.players.map((player) => (player.id === socketId ? { ...player, avatarSeed } : player));
  return { room };
}

export function getRoomBySocket(socketId) {
  const code = socketToRoom.get(socketId);
  return code ? rooms.get(code) : null;
}

export function useChaosBomb(socketId, targetId) {
  const room = getRoomBySocket(socketId);
  if (!room) return { error: createMessage("error.notInRoom") };
  if (room.phase !== "game") return { error: createMessage("error.notGamePhase") };
  if (room.fever?.active) return { error: createMessage("error.feverNoItems") };
  if (room.itemSelections?.[socketId] !== "chaos") {
    return { error: createMessage("error.itemNotOwned") };
  }
  if ((room.itemCounts?.[socketId]?.chaos ?? 0) <= 0) {
    return { error: createMessage("error.itemNotOwned") };
  }
  if (socketId === targetId) return { error: createMessage("error.cannotTargetSelf") };
  if (!room.players.some((player) => player.id === targetId)) {
    return { error: createMessage("error.playerNotInRoom") };
  }
  const now = Date.now();
  const token = `chaos:${socketId}:${now}`;
  const item = { type: "chaos", by: socketId, target: targetId, token, expiresAt: now + 6000 };
  const hasActive = room.activeItems.some((active) => active.type === "chaos" && active.target === targetId);
  if (hasActive) {
    room.itemQueue.push(item);
  } else {
    room.activeItems.push(item);
  }
  room.itemCounts[socketId].chaos -= 1;
  return { room, by: socketId, target: targetId, token, queued: hasActive };
}

export function useSmokeBomb(socketId, targetId) {
  const room = getRoomBySocket(socketId);
  if (!room) return { error: createMessage("error.notInRoom") };
  if (room.phase !== "game") return { error: createMessage("error.notGamePhase") };
  if (room.fever?.active) return { error: createMessage("error.feverNoItems") };
  if (room.itemSelections?.[socketId] !== "smoke") {
    return { error: createMessage("error.itemNotOwned") };
  }
  if ((room.itemCounts?.[socketId]?.smoke ?? 0) <= 0) {
    return { error: createMessage("error.itemNotOwned") };
  }
  if (socketId === targetId) return { error: createMessage("error.cannotTargetSelf") };
  if (!room.players.some((player) => player.id === targetId)) {
    return { error: createMessage("error.playerNotInRoom") };
  }
  const now = Date.now();
  const token = `smoke:${socketId}:${now}`;
  const item = { type: "smoke", by: socketId, target: targetId, token, expiresAt: now + 6500 };
  const hasActive = room.activeItems.some((active) => active.type === "smoke" && active.target === targetId);
  if (hasActive) {
    room.itemQueue.push(item);
  } else {
    room.activeItems.push(item);
  }
  room.itemCounts[socketId].smoke -= 1;
  return { room, by: socketId, target: targetId, token, queued: hasActive };
}

const DEFAULT_ITEM_COUNTS = {
  smoke: 1,
  chaos: 1,
  quick: 2
};

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
  room.itemCounts = {};
  room.players.forEach((p) => {
    const type = room.itemSelections?.[p.id];
    if (type) {
      room.itemCounts[p.id] = { [type]: DEFAULT_ITEM_COUNTS[type] };
    }
  });
  reloadLevelConfig(room.levelIndex);
  room.board = createBoard();
  room.initialTileCount = countRemainingTiles(room.board);
  room.message = createMessage("server.gameStarting", { count: 3 });
  broadcastRoom(room, sockets);
  scheduleGameStart(room, sockets);
}

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

export function startGame(socketId) {
  const room = getRoomBySocket(socketId);
  if (!room) return { error: createMessage("error.notInRoom") };
  if (room.hostId !== socketId) return { error: createMessage("error.onlyHostCanStart") };
  if (room.players.length < 2) return { error: createMessage("error.needTwoPlayers") };

  clearReshuffleCountdown(room.code);
  room.phase = "game";
  room.players = resetScores(room.players);
  room.selections = new Map();
  room.lastMatch = null;
  room.lastCombo = null;
  room.reshuffleCountdown = null;
  room.startCountdown = 5;
  room.startReveal = false;
  room.comboTracker = createComboTracker(room.players);
  room.fever = { active: false, startAt: 0, endAt: 0 };
  room.feverEverTriggered = false;
  reloadLevelConfig(room.levelIndex);
  room.board = createBoard();
  room.initialTileCount = countRemainingTiles(room.board);
  room.message = createMessage("server.gameStarting", { count: 5 });
  return { room };
}

export function scheduleGameStart(room, sockets) {
  clearStartCountdown(room.code);

  const intervalId = setInterval(() => {
    const liveRoom = rooms.get(room.code);
    if (!liveRoom) {
      clearStartCountdown(room.code);
      return;
    }

    if (liveRoom.phase !== "game" || liveRoom.startCountdown == null) {
      clearStartCountdown(room.code);
      return;
    }

    if (liveRoom.startCountdown > 1) {
      liveRoom.startCountdown -= 1;
      liveRoom.message = createMessage("server.gameStarting", { count: liveRoom.startCountdown });
      broadcastRoom(liveRoom, sockets);
      return;
    }

    clearInterval(intervalId);
    startCountdownIntervals.delete(room.code);
    liveRoom.startCountdown = 0;
    liveRoom.startReveal = true;
    liveRoom.message = createMessage("server.gameStarted");
    broadcastRoom(liveRoom, sockets);

    const timeoutId = setTimeout(() => {
      const revealRoom = rooms.get(room.code);
      if (!revealRoom) {
        clearStartCountdown(room.code);
        return;
      }
      revealRoom.startCountdown = null;
      revealRoom.startReveal = false;
      startRevealTimeouts.delete(room.code);
      broadcastRoom(revealRoom, sockets);
      startFeverTimer(revealRoom, sockets);
    }, 500);

    startRevealTimeouts.set(room.code, timeoutId);
  }, 1000);

  startCountdownIntervals.set(room.code, intervalId);
}

function finishGame(room) {
  clearReshuffleCountdown(room.code);
  clearStartCountdown(room.code);
  clearFeverTimer(room.code);
  room.phase = "results";
  room.selections = new Map();
  room.lastCombo = null;
  room.startCountdown = null;
  room.startReveal = false;
  room.reshuffleCountdown = null;
  room.message = createMessage("server.gameFinished");
}

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
  maybeTriggerFeverByTiles(room, sockets);
  const previousCombo = room.comboTracker.get(socketId) ?? { count: 0, lastClearedAt: 0 };
  let nextComboCount =
    now - previousCombo.lastClearedAt <= COMBO_WINDOW_MS && previousCombo.lastClearedAt > 0 ? previousCombo.count + 1 : 0;
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
    finishGame(room);
    return { room };
  }

  if (!hasAnyMoves(room.board)) {
    scheduleDeadlockReshuffle(room, sockets);
  }

  return { room };
}

export function handleQuickMatch(socketId, sockets) {
  const room = getRoomBySocket(socketId);
  if (!room) return { error: createMessage("error.roomNotFound") };
  if (room.phase !== "game") return { error: createMessage("error.notGamePhase") };
  if (room.fever?.active) return { error: createMessage("error.feverNoItems") };
  if (room.itemSelections?.[socketId] !== "quick") {
    return { error: createMessage("error.itemNotOwned") };
  }
  if ((room.itemCounts?.[socketId]?.quick ?? 0) <= 0) {
    return { error: createMessage("error.itemNotOwned") };
  }
  if (room.startCountdown != null || room.startReveal) return { error: createMessage("error.waitForCountdown") };
  if (room.reshuffleCountdown) return { error: createMessage("error.waitForReshuffle") };
  if (countRemovablePairs(room.board) === 0) return { error: createMessage("error.noRemovablePairs") };

  const match = findAnyRemovablePair(room.board);
  if (!match) return { error: createMessage("error.noRemovablePairs") };

  const { pair, path, tile, depths } = match;
  room.board = removePair(room.board, pair[0], pair[1]);
  room.selections.delete(socketId);
  maybeTriggerFeverByTiles(room, sockets);
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
    count: 0,
    scoreDelta: SCORE_PER_MATCH,
    token: `${socketId}:${now}`,
    fever: false
  };
  room.players = room.players.map((player) =>
    player.id === socketId
      ? { ...player, score: player.score + SCORE_PER_MATCH }
      : player
  );
  room.itemCounts[socketId].quick -= 1;
  room.message = createMessage("server.quickMatchUsed", {
    nickname: room.players.find((player) => player.id === socketId)?.nickname ?? ""
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

export function leaveRoom(socketId) {
  const room = getRoomBySocket(socketId);
  socketToRoom.delete(socketId);
  if (!room) return null;

  clearReshuffleCountdown(room.code);
  clearStartCountdown(room.code);
  clearFeverTimer(room.code);
  room.players = room.players.filter((player) => player.id !== socketId);
  room.selections.delete(socketId);
  room.comboTracker.delete(socketId);
  if (room.activeItems) {
    room.activeItems = room.activeItems.filter((item) => item.by !== socketId && item.target !== socketId);
  }
  if (room.itemQueue) {
    room.itemQueue = room.itemQueue.filter((item) => item.by !== socketId && item.target !== socketId);
  }
  if (room.itemSelections) {
    delete room.itemSelections[socketId];
  }
  if (room.itemCounts) {
    delete room.itemCounts[socketId];
  }

  if (room.players.length === 0) {
    clearItemSelectionTimer(room.code);
    rooms.delete(room.code);
    return null;
  }

  if (room.itemSelectionActive && room.players.length <= 1) {
    clearItemSelectionTimer(room.code);
    enterLobby(room);
    room.message = createMessage("server.playerLeft");
    return room;
  }

  if (room.hostId === socketId) {
    room.hostId = room.players[0].id;
  }

  enterLobby(room);
  room.message = createMessage("server.playerLeft");
  return room;
}

export function replay(socketId) {
  const room = getRoomBySocket(socketId);
  if (!room) return { error: createMessage("error.roomNotFound") };
  enterLobby(room);
  return { room };
}

export function syncRoom(socketId, sockets) {
  const room = getRoomBySocket(socketId);
  if (room) broadcastRoom(room, sockets);
}

export function broadcastAfterAction(room, sockets) {
  if (room) broadcastRoom(room, sockets);
}
