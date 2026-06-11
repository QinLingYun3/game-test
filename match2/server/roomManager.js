import {
  countRemovablePairs,
  SCORE_PER_MATCH,
  countRemainingTiles,
  createBoard,
  hasAnyMoves,
  isBoardCleared,
  isPositionSelectable,
  isValidSelection,
  removePair,
  reshuffleBoard
} from "../shared/game.js";

const rooms = new Map();
const socketToRoom = new Map();
const reshuffleIntervals = new Map();
const startCountdownIntervals = new Map();
const startRevealTimeouts = new Map();
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
  return Math.round(SCORE_PER_MATCH * 1.5 ** Math.max(0, comboCount - 1));
}

function serializeRoom(room, playerId) {
  const ranking = [...room.players].sort((a, b) => b.score - a.score);
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
    you: {
      id: playerId,
      selection: room.selections.get(playerId) ?? null
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
  room.phase = "lobby";
  room.board = null;
  room.selections = new Map();
  room.lastMatch = null;
  room.lastCombo = null;
  room.comboTracker = createComboTracker(room.players);
  room.startCountdown = null;
  room.startReveal = false;
  room.reshuffleCountdown = null;
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
    selections: new Map(),
    lastMatch: null,
    lastCombo: null,
    startCountdown: null,
    startReveal: false,
    comboTracker: createComboTracker([createPlayer(socketId, nickname, avatarSeed)]),
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
  room.board = createBoard();
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
    }, 500);

    startRevealTimeouts.set(room.code, timeoutId);
  }, 1000);

  startCountdownIntervals.set(room.code, intervalId);
}

function finishGame(room) {
  clearReshuffleCountdown(room.code);
  clearStartCountdown(room.code);
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
  if (current && current.row === position.row && current.col === position.col) {
    room.selections.delete(socketId);
    room.message = createMessage("server.selectionCanceled");
    return { room };
  }

  if (!current) {
    room.selections.set(socketId, position);
    room.message = createMessage("server.firstSelected");
    return { room };
  }

  const result = isValidSelection(room.board, current, position);
  if (!result.ok) {
    room.selections.set(socketId, position);
    room.message = result.reason;
    return { room };
  }

  room.board = removePair(room.board, current, position);
  room.selections.delete(socketId);
  const now = Date.now();
  const previousCombo = room.comboTracker.get(socketId) ?? { count: 0, lastClearedAt: 0 };
  const nextComboCount =
    now - previousCombo.lastClearedAt <= COMBO_WINDOW_MS && previousCombo.count > 0 ? previousCombo.count + 1 : 1;
  const scoreDelta = getScoreDeltaForCombo(nextComboCount);
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
    token: `${socketId}:${now}`
  };
  room.players = room.players.map((player) =>
    player.id === socketId
      ? { ...player, score: player.score + scoreDelta, maxCombo: Math.max(player.maxCombo ?? 0, nextComboCount) }
      : player
  );
  room.message = createMessage("server.matchScored", {
    nickname: room.players.find((player) => player.id === socketId)?.nickname ?? "",
    score: scoreDelta
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
  room.players = room.players.filter((player) => player.id !== socketId);
  room.selections.delete(socketId);
  room.comboTracker.delete(socketId);

  if (room.players.length === 0) {
    rooms.delete(room.code);
    return null;
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
