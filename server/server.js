import express from "express";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
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
  selectItem,
  startGame,
  startItemSelection,
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
const dataDir = path.join(__dirname, "data");
const leaderboardFilePath = path.join(dataDir, "solo-leaderboard.json");
const soloSessions = new Map();
const soloLeaderboard = [];
const LEADERBOARD_LIMIT = 20;
let soloSubmitOrder = 0;
let leaderboardWriteChain = Promise.resolve();

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

function broadcastOnlineCount() {
  const count = sockets.size;
  sockets.forEach((socket) => {
    if (socket.readyState !== 1) return;
    send(socket, "online_count", { count });
  });
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

function normalizeSessionId(value) {
  return String(value ?? "").trim();
}

function normalizeScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.round(score));
}

function sanitizeLeaderboardEntry(entry) {
  return {
    sessionId: normalizeSessionId(entry?.sessionId) || randomUUID(),
    nickname: normalizeNickname(entry?.nickname),
    avatarSeed: normalizeAvatarSeed(entry?.avatarSeed),
    score: normalizeScore(entry?.score),
    submittedAt: Number.isFinite(Number(entry?.submittedAt)) ? Number(entry.submittedAt) : Date.now(),
    order: Number.isFinite(Number(entry?.order)) ? Number(entry.order) : 0
  };
}

function compareLeaderboardEntries(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  if (a.submittedAt !== b.submittedAt) return a.submittedAt - b.submittedAt;
  return a.order - b.order;
}

async function loadPersistedLeaderboard() {
  try {
    const raw = await readFile(leaderboardFilePath, "utf8");
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    const normalizedEntries = entries
      .map(sanitizeLeaderboardEntry)
      .filter((entry) => entry.nickname);
    soloLeaderboard.splice(0, soloLeaderboard.length, ...normalizedEntries.sort(compareLeaderboardEntries));
    soloSubmitOrder = soloLeaderboard.reduce((maxOrder, entry) => Math.max(maxOrder, entry.order), -1) + 1;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error("Failed to load solo leaderboard:", error);
    }
  }
}

async function persistLeaderboard() {
  await mkdir(dataDir, { recursive: true });
  const tempPath = `${leaderboardFilePath}.tmp`;
  const payload = JSON.stringify({ entries: soloLeaderboard }, null, 2);
  await writeFile(tempPath, payload, "utf8");
  await rename(tempPath, leaderboardFilePath);
}

function queueLeaderboardPersist() {
  leaderboardWriteChain = leaderboardWriteChain
    .catch(() => undefined)
    .then(() => persistLeaderboard());
  return leaderboardWriteChain;
}

function getLeaderboardPayload() {
  return soloLeaderboard
    .slice()
    .sort(compareLeaderboardEntries)
    .slice(0, LEADERBOARD_LIMIT)
    .map((entry, index) => ({
      rank: index + 1,
      nickname: entry.nickname,
      avatarSeed: entry.avatarSeed,
      score: entry.score
    }));
}

function createSoloSession(nickname, avatarSeed) {
  const sessionId = randomUUID();
  soloSessions.set(sessionId, {
    sessionId,
    nickname,
    avatarSeed,
    submitted: false,
    rank: null
  });
  return sessionId;
}

async function submitSoloScore(sessionId, score) {
  const session = soloSessions.get(sessionId);
  if (!session) {
    return { error: createMessage("error.invalidSoloSession") };
  }

  if (!session.submitted) {
    const entry = {
      sessionId,
      nickname: session.nickname,
      avatarSeed: session.avatarSeed,
      score,
      submittedAt: Date.now(),
      order: soloSubmitOrder++
    };
    soloLeaderboard.push(entry);
    soloLeaderboard.sort(compareLeaderboardEntries);
    session.submitted = true;
    session.rank = soloLeaderboard.findIndex((item) => item.sessionId === sessionId) + 1;
    await queueLeaderboardPersist();
  }

  return {
    rank: session.rank,
    leaderboard: getLeaderboardPayload()
  };
}

wss.on("connection", (socket) => {
  const socketId = randomUUID();
  sockets.set(socketId, socket);
  send(socket, "connected", { playerId: socketId });
  broadcastOnlineCount();

  socket.on("message", async (rawMessage) => {
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

      if (type === "create_solo_session") {
        const nickname = normalizeNickname(payload?.nickname);
        const avatarSeed = normalizeAvatarSeed(payload?.avatarSeed);
        if (!nickname) {
          return send(socket, "error", {
            clientRequestId: payload?.clientRequestId ?? null,
            message: createMessage("error.enterNickname")
          });
        }
        return send(socket, "solo_session_created", {
          clientRequestId: payload?.clientRequestId ?? null,
          sessionId: createSoloSession(nickname, avatarSeed)
        });
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
        const result = startItemSelection(socketId, sockets);
        if (result.error) return send(socket, "error", { message: result.error });
        return;
      }

      if (type === "select_item") {
        const result = selectItem(socketId, payload?.itemType);
        if (result.error) return send(socket, "error", { message: result.error });
        return broadcastAfterAction(result.room, sockets);
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

      if (type === "submit_solo_score") {
        const sessionId = normalizeSessionId(payload?.sessionId);
        const result = await submitSoloScore(sessionId, normalizeScore(payload?.score));
        if (result.error) {
          return send(socket, "error", {
            clientRequestId: payload?.clientRequestId ?? null,
            message: result.error
          });
        }
        return send(socket, "solo_score_submitted", {
          clientRequestId: payload?.clientRequestId ?? null,
          ...result
        });
      }

      if (type === "get_leaderboard") {
        return send(socket, "leaderboard_state", {
          clientRequestId: payload?.clientRequestId ?? null,
          entries: getLeaderboardPayload()
        });
      }

      return send(socket, "error", { message: createMessage("error.unknownAction") });
    } catch (error) {
      send(socket, "error", { message: createMessage("error.messageFailed") });
    }
  });

  socket.on("close", () => {
    sockets.delete(socketId);
    broadcastOnlineCount();
    const room = leaveRoom(socketId);
    broadcastAfterAction(room, sockets);
  });
});

const port = Number(process.env.PORT ?? 3333);
const host = process.env.HOST ?? "0.0.0.0";
await loadPersistedLeaderboard();
server.listen(port, host, () => {
  console.log(`match2 server listening on http://${host}:${port}`);
});
