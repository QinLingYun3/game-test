import express from "express";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import {
  broadcastAfterAction,
  createRoom,
  handleSelection,
  joinRoom,
  leaveRoom,
  replay,
  startGame
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
        if (!nickname) return send(socket, "error", { message: createMessage("error.enterNickname") });
        const previousRoom = leaveRoom(socketId);
        broadcastAfterAction(previousRoom, sockets);
        const room = createRoom({ socketId, nickname });
        return broadcastAfterAction(room, sockets);
      }

      if (type === "join_room") {
        const nickname = normalizeNickname(payload?.nickname);
        const code = normalizeCode(payload?.code);
        if (!nickname || code.length !== 4) {
          return send(socket, "error", { message: createMessage("error.enterNicknameAndRoomCode") });
        }
        const previousRoom = leaveRoom(socketId);
        broadcastAfterAction(previousRoom, sockets);
        const result = joinRoom({ socketId, nickname, code });
        if (result.error) return send(socket, "error", { message: result.error });
        return broadcastAfterAction(result.room, sockets);
      }

      if (type === "start_game") {
        const result = startGame(socketId);
        if (result.error) return send(socket, "error", { message: result.error });
        return broadcastAfterAction(result.room, sockets);
      }

      if (type === "select_tile") {
        const result = handleSelection(socketId, payload, sockets);
        if (result.error) return send(socket, "error", { message: result.error });
        return broadcastAfterAction(result.room, sockets);
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
