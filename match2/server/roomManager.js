import {
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

function makeRoomCode() {
  let code = "";
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(code));
  return code;
}

function createPlayer(socketId, nickname) {
  return {
    id: socketId,
    nickname,
    score: 0,
    connected: true
  };
}

function resetScores(players) {
  return players.map((player) => ({ ...player, score: 0 }));
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
    remainingTiles: room.board ? countRemainingTiles(room.board) : 0,
    canStart: room.players.length === 2 && room.hostId === playerId && room.phase === "lobby",
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
  room.phase = "lobby";
  room.board = null;
  room.selections = new Map();
  room.lastMatch = null;
  room.message = room.players.length < 2 ? "等待另一位玩家加入..." : "房主可以开始游戏";
  room.players = resetScores(room.players);
}

export function createRoom({ socketId, nickname }) {
  const code = makeRoomCode();
  const room = {
    code,
    hostId: socketId,
    phase: "lobby",
    players: [createPlayer(socketId, nickname)],
    board: null,
    selections: new Map(),
    lastMatch: null,
    message: "等待另一位玩家加入..."
  };

  rooms.set(code, room);
  socketToRoom.set(socketId, code);
  return room;
}

export function joinRoom({ socketId, nickname, code }) {
  const room = rooms.get(code);
  if (!room) return { error: "房间不存在" };
  if (room.players.length >= 2) return { error: "房间已满" };
  if (room.phase !== "lobby") return { error: "游戏已开始，暂不允许加入" };

  room.players.push(createPlayer(socketId, nickname));
  room.message = "玩家已到齐，等待房主开始";
  socketToRoom.set(socketId, code);
  return { room };
}

export function getRoomBySocket(socketId) {
  const code = socketToRoom.get(socketId);
  return code ? rooms.get(code) : null;
}

export function startGame(socketId) {
  const room = getRoomBySocket(socketId);
  if (!room) return { error: "你当前不在房间中" };
  if (room.hostId !== socketId) return { error: "只有房主可以开始" };
  if (room.players.length < 2) return { error: "需要 2 名玩家才能开始" };

  room.phase = "game";
  room.players = resetScores(room.players);
  room.selections = new Map();
  room.lastMatch = null;
  room.board = createBoard();
  room.message = "开局成功，开始抢连吧";
  return { room };
}

function finishGame(room) {
  room.phase = "results";
  room.selections = new Map();
  room.message = "本局结束";
}

export function handleSelection(socketId, position) {
  const room = getRoomBySocket(socketId);
  if (!room) return { error: "房间不存在" };
  if (room.phase !== "game") return { error: "当前不在游戏阶段" };

  if (!isPositionSelectable(room.board, position)) return { error: "该位置没有可选牌" };

  const current = room.selections.get(socketId);
  if (current && current.row === position.row && current.col === position.col) {
    room.selections.delete(socketId);
    room.message = "已取消选择";
    return { room };
  }

  if (!current) {
    room.selections.set(socketId, position);
    room.message = "已选中第一张牌";
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
  room.lastMatch = {
    by: socketId,
    pair: [current, position],
    path: result.path,
    tile: result.tile
  };
  room.players = room.players.map((player) =>
    player.id === socketId ? { ...player, score: player.score + SCORE_PER_MATCH } : player
  );
  room.message = `${room.players.find((player) => player.id === socketId)?.nickname} 成功消除，+${SCORE_PER_MATCH}`;

  if (isBoardCleared(room.board) || countRemainingTiles(room.board) === 0) {
    finishGame(room);
    return { room };
  }

  if (!hasAnyMoves(room.board)) {
    room.board = reshuffleBoard(room.board);
    room.message = "当前无可用配对，棋盘已自动洗牌";
  }

  return { room };
}

export function leaveRoom(socketId) {
  const room = getRoomBySocket(socketId);
  socketToRoom.delete(socketId);
  if (!room) return null;

  room.players = room.players.filter((player) => player.id !== socketId);
  room.selections.delete(socketId);

  if (room.players.length === 0) {
    rooms.delete(room.code);
    return null;
  }

  if (room.hostId === socketId) {
    room.hostId = room.players[0].id;
  }

  enterLobby(room);
  room.message = "有玩家离开，房间已回到大厅";
  return room;
}

export function replay(socketId) {
  const room = getRoomBySocket(socketId);
  if (!room) return { error: "房间不存在" };
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
