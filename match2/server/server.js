import express from "express";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import {
  broadcastAfterAction,
  createRoom,
  getRoomBySocket,
  handleQuickMatch,
  handleSelection,
  joinRoom,
  leaveRoom,
  replay,
  scheduleGameStart,
  startGame,
  triggerFeverNow,
  updateAvatar,
  useChaosBomb,
  useSmokeBomb
} from "./roomManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const sockets = new Map();
const clientDir = path.join(rootDir, "dist");
const isProduction = process.env.NODE_ENV === "production";

function createMessage(key, params = {}) {
  return { key, params };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

if (isProduction) {
  app.use(express.static(clientDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDir, "index.html"));
  });
}

function send(socket, type, payload) {
  socket.send(JSON.stringify({ type, payload }));
}

function normalizeNickname(value) {
  return String(value ?? "").trim().slice(0, 12);
}

function normalizeCode(value) {
  return String(value ?? "").trim().slice(0, 4);
}

function normalizeAvatarSeed(value) {
  const normalized = String(value ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 24);
  return normalized || "player";
}

wss.on("connection", (socket) => {
  const socketId = randomUUID();
  sockets.set(socketId, socket);
  send(socket, "connected", { playerId: socketId });

  socket.on("message", (rawMessage) => {
    try {
      const message = JSON.parse(String(rawMessage));
      const { type, payload } = message;

      if (type === "create_room") {
        const nickname = normalizeNickname(payload?.nickname);
        const avatarSeed = normalizeAvatarSeed(payload?.avatarSeed);
        if (!nickname) return send(socket, "error", { message: createMessage("error.enterNickname") });
        const previousRoom = leaveRoom(socketId);
        broadcastAfterAction(previousRoom, sockets);
        const room = createRoom({ socketId, nickname, avatarSeed });
        return broadcastAfterAction(room, sockets);
      }

      if (type === "join_room") {
        const nickname = normalizeNickname(payload?.nickname);
        const code = normalizeCode(payload?.code);
        const avatarSeed = normalizeAvatarSeed(payload?.avatarSeed);
        if (!nickname || code.length !== 4) {
          return send(socket, "error", { message: createMessage("error.enterNicknameAndRoomCode") });
        }
        const previousRoom = leaveRoom(socketId);
        broadcastAfterAction(previousRoom, sockets);
        const result = joinRoom({ socketId, nickname, code, avatarSeed });
        if (result.error) return send(socket, "error", { message: result.error });
        return broadcastAfterAction(result.room, sockets);
      }

      if (type === "update_avatar") {
        const avatarSeed = normalizeAvatarSeed(payload?.avatarSeed);
        const result = updateAvatar(socketId, avatarSeed);
        if (result.error) return send(socket, "error", { message: result.error });
        return broadcastAfterAction(result.room, sockets);
      }

      if (type === "start_game") {
        const result = startGame(socketId);
        if (result.error) return send(socket, "error", { message: result.error });
        broadcastAfterAction(result.room, sockets);
        scheduleGameStart(result.room, sockets);
        return;
      }

      if (type === "select_tile") {
        const result = handleSelection(socketId, payload, sockets);
        if (result.error) return send(socket, "error", { message: result.error });
        return broadcastAfterAction(result.room, sockets);
      }

      if (type === "use_chaos_bomb") {
        const result = useChaosBomb(socketId, payload?.targetId);
        if (result.error) return send(socket, "error", { message: result.error });
        broadcastAfterAction(result.room, sockets);
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

      if (type === "use_quick_match") {
        const result = handleQuickMatch(socketId, sockets);
        if (result.error) return send(socket, "error", { message: result.error });
        return broadcastAfterAction(result.room, sockets);
      }

      if (type === "use_smoke_bomb") {
        const result = useSmokeBomb(socketId, payload?.targetId);
        if (result.error) return send(socket, "error", { message: result.error });
        broadcastAfterAction(result.room, sockets);
        setTimeout(() => {
          const liveRoom = getRoomBySocket(socketId);
          if (!liveRoom || !liveRoom.activeItems) return;
          const before = liveRoom.activeItems.length;
          const now = Date.now();
          liveRoom.activeItems = liveRoom.activeItems.filter((item) => item.expiresAt > now);
          const changed = liveRoom.activeItems.length !== before;
          // Promote queued items for targets that just got cleared
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
        }, 6500);
        return;
      }

      if (type === "trigger_fever") {
        const room = getRoomBySocket(socketId);
        if (!room) return send(socket, "error", { message: createMessage("error.notInRoom") });
        if (room.hostId !== socketId) return send(socket, "error", { message: createMessage("error.onlyHostCanStart") });
        if (room.phase !== "game") return send(socket, "error", { message: createMessage("error.gameNotStarted") });
        triggerFeverNow(room, sockets);
        broadcastAfterAction(room, sockets);
        return;
      }

      if (type === "replay") {
        const result = replay(socketId);
        if (result.error) return send(socket, "error", { message: result.error });
        return broadcastAfterAction(result.room, sockets);
      }

      return send(socket, "error", { message: createMessage("error.unknownAction") });
    } catch (error) {
      send(socket, "error", { message: createMessage("error.messageFailed") });
    }
  });

  socket.on("close", () => {
    sockets.delete(socketId);
    const room = leaveRoom(socketId);
    broadcastAfterAction(room, sockets);
  });
});

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "0.0.0.0";
server.listen(port, host, () => {
  console.log(`match2 server listening on http://${host}:${port}`);
});
