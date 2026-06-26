import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  COLS,
  ROWS,
  SCORE_PER_MATCH,
  TILE_TYPES,
  COMBO_WINDOW_MS,
  countRemainingTiles,
  countRemovablePairs,
  createBoard,
  createComboTracker,
  findAnyRemovablePair,
  getDifficultyRanges,
  getScoreDeltaForCombo,
  hasAnyMoves,
  isBoardCleared,
  isValidSelection,
  reloadLevelConfig,
  removePair,
  reshuffleBoard,
  LEVEL_CONFIGS
} from "@shared/game.js";
import {
  SUPPORTED_LANGUAGES,
  createMessage,
  loadPreferredLanguage,
  resolveText,
  savePreferredLanguage,
  translate
} from "./i18n.js";
import useMatchSound from "./useMatchSound.js";
import useComboSound from "./useComboSound.js";
import useBgm from "./useBgm.js";
import useCountdownVoice from "./useCountdownVoice.js";

const AVATAR_STORAGE_KEY = "match2-avatar-seed";
const NICKNAME_STORAGE_KEY = "match2-nickname";
const AVATAR_EDIT_BATCH_SIZE = 9;
const AVATAR_SEED_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const MAX_PLAYERS = 4;

function randomAvatarSeed(length = 10) {
  return Array.from({ length }, () => AVATAR_SEED_CHARS[Math.floor(Math.random() * AVATAR_SEED_CHARS.length)]).join("");
}

function normalizeAvatarSeed(value) {
  const normalized = String(value ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 24);
  return normalized || randomAvatarSeed();
}

function createAvatarBatch() {
  return Array.from({ length: AVATAR_EDIT_BATCH_SIZE }, () => randomAvatarSeed());
}

function getAvatarUrl(seed) {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(normalizeAvatarSeed(seed))}`;
}

function loadPreferredNickname() {
  try {
    return window.localStorage.getItem(NICKNAME_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function savePreferredNickname(value) {
  try {
    window.localStorage.setItem(NICKNAME_STORAGE_KEY, String(value).slice(0, 12));
  } catch {
    // Ignore storage failures.
  }
}

function loadPreferredAvatarSeed() {
  try {
    return normalizeAvatarSeed(window.localStorage.getItem(AVATAR_STORAGE_KEY));
  } catch {
    return randomAvatarSeed();
  }
}

function savePreferredAvatarSeed(seed) {
  try {
    window.localStorage.setItem(AVATAR_STORAGE_KEY, normalizeAvatarSeed(seed));
  } catch {
    // Ignore storage failures in restricted contexts.
  }
}

function isBoardPreviewMode() {
  return new URLSearchParams(window.location.search).get("preview");
}

function isHomeAccessEnabled(status, previewMode = false) {
  if (previewMode) return true;
  return status?.key === "status.connected";
}

function isTestMode() {
  return new URLSearchParams(window.location.search).get("test") === "1";
}

function createPreviewPlayers(hostId, language) {
  return [
    { id: hostId, nickname: translate(language, "lobby.host"), score: 0, avatarSeed: "PreviewHost01" },
    { id: "preview-opponent", nickname: translate(language, "lobby.player"), score: 0, avatarSeed: "PreviewPlayer02" }
  ];
}

function createPreviewBaseRoom(board, message, language) {
  const hostId = "preview-player";
  return {
    code: "PREVIEW",
    phase: "game",
    hostId,
    players: createPreviewPlayers(hostId, language),
    board,
    message,
    lastMatch: null,
    remainingTiles: countRemainingTiles(board),
    canStart: false,
    you: {
      id: hostId,
      selection: null
    }
  };
}

function createPreviewRoom(language, seed = Date.now()) {
  return createPreviewBaseRoom(createBoard(seed), createMessage("preview.randomBoard"), language);
}

function createPreviewResultsRoom(language) {
  const players = [
    { id: "preview-player", nickname: translate(language, "lobby.host"), score: 2488, maxCombo: 6, avatarSeed: "PreviewHost01" },
    { id: "preview-player-2", nickname: `${translate(language, "lobby.player")} A`, score: 1825, maxCombo: 4, avatarSeed: "PreviewPlayer02" },
    { id: "preview-player-3", nickname: `${translate(language, "lobby.player")} B`, score: 1375, maxCombo: 3, avatarSeed: "PreviewPlayer03" },
    { id: "preview-player-4", nickname: `${translate(language, "lobby.player")} C`, score: 950, maxCombo: 2, avatarSeed: "PreviewPlayer04" }
  ];

  return {
    code: "PREVIEW",
    phase: "results",
    hostId: "preview-player",
    players,
    ranking: sortRanking(players),
    board: null,
    message: createMessage("server.gameFinished"),
    lastMatch: null,
    lastCombo: null,
    canStart: false,
    you: {
      id: "preview-player",
      selection: null
    }
  };
}

function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => []));
}

function createSoloRoom(nickname, avatarSeed, language, levelIndex, difficulty = "default", options = {}) {
  const playerId = "solo-player";
  const board = createBoard();
  return {
    code: "SOLO",
    phase: "game",
    hostId: playerId,
    players: [{ id: playerId, nickname: nickname || translate(language, "lobby.host"), avatarSeed, score: 0, maxCombo: 0 }],
    board,
    levelIndex,
    soloDifficulty: difficulty,
    soloSessionId: options.sessionId ?? null,
    soloLeaderboardRank: options.leaderboardRank ?? null,
    soloScoreSubmitted: options.scoreSubmitted ?? false,
    lastMatch: null,
    lastCombo: null,
    comboTracker: createComboTracker([playerId]),
    message: createMessage("server.gameStarting", { count: 3 }),
    canStart: false,
    startCountdown: 3,
    startReveal: false,
    remainingTiles: countRemainingTiles(board),
    removablePairs: countRemovablePairs(board),
    you: {
      id: playerId,
      selection: null,
      selectedItem: "quick",
      itemCount: null
    }
  };
}

function createTile(id, type, icon) {
  return { id, type, icon };
}

const SOLO_DIFF_RANGES = getDifficultyRanges(LEVEL_CONFIGS);

function getSoloStartIndex(difficulty) {
  if (difficulty === "default") return 0;
  return SOLO_DIFF_RANGES[difficulty]?.start ?? 0;
}

function getSoloEndIndex(difficulty) {
  if (difficulty === "default") return LEVEL_CONFIGS.length - 1;
  return SOLO_DIFF_RANGES[difficulty]?.end ?? LEVEL_CONFIGS.length - 1;
}

function nextSoloLevelIndex(current, difficulty, levelPick) {
  if (levelPick && levelPick !== "all") return current;
  const end = getSoloEndIndex(difficulty);
  if (current < end) return current + 1;
  return getSoloStartIndex(difficulty);
}

function getSoloLevelProgress(levelIndex, difficulty = "default") {
  const start = getSoloStartIndex(difficulty);
  const end = getSoloEndIndex(difficulty);
  return {
    current: levelIndex - start + 1,
    total: end - start + 1
  };
}

function computeSoloCombo(comboTracker, playerId) {
  const now = Date.now();
  const prev = comboTracker.get(playerId) ?? { count: 0, lastClearedAt: 0 };
  const count = now - prev.lastClearedAt <= COMBO_WINDOW_MS && prev.lastClearedAt > 0 ? prev.count + 1 : 0;
  const scoreDelta = getScoreDeltaForCombo(count);
  comboTracker.set(playerId, { count, lastClearedAt: now });
  return { count, scoreDelta, token: `${playerId}:${now}` };
}

function createLayerRuleTestRoom(language) {
  const board = createEmptyBoard();

  board[2][1] = [
    createTile("base-left", "dog", "🐶"),
    createTile("mid-left", "fox", "🦊"),
    createTile("top-left", "cat", "🐱")
  ];
  board[2][2] = [createTile("base-block-1", "bear", "🐻"), createTile("mid-block-1", "panda", "🐼")];
  board[2][3] = [createTile("base-block-2", "tiger", "🐯"), createTile("mid-block-2", "lion", "🦁")];
  board[2][4] = [createTile("base-block-3", "rabbit", "🐰"), createTile("mid-block-3", "frog", "🐸")];
  board[2][5] = [
    createTile("base-right", "pig", "🐷"),
    createTile("mid-right", "koala", "🐨"),
    createTile("top-right", "cat", "🐱")
  ];

  board[4][2] = [createTile("lower-a", "mouse", "🐭")];
  board[4][3] = [createTile("lower-b", "cow", "🐮")];
  board[4][4] = [createTile("lower-c", "chick", "🐥")];

  return createPreviewBaseRoom(board, createMessage("preview.ruleMessage"), language);
}

function getChaosIcons(realType) {
  const shuffled = TILE_TYPES.filter((t) => t.key !== realType)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map((t) => t.icon);
  return [TILE_TYPES.find((t) => t.key === realType).icon, ...shuffled];
}

function FeverDisplay({ active, t }) {
  const [showBubble, setShowBubble] = useState(false);
  const [showBar, setShowBar] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [progress, setProgress] = useState(100);
  const [barEndAt, setBarEndAt] = useState(null);

  useEffect(() => {
    if (active) {
      setShowBubble(true);
      setShowBar(false);
      setExiting(false);
      setBarEndAt(null);
      const timer = setTimeout(() => {
        setShowBubble(false);
        setShowBar(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [active]);

  useEffect(() => {
    if (!active && showBar) {
      setExiting(true);
      const timer = setTimeout(() => {
        setShowBar(false);
        setExiting(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [active, showBar]);

  useEffect(() => {
    if (showBar && !barEndAt) {
      setBarEndAt(Date.now() + 10000);
    }
  }, [showBar, barEndAt]);

  useEffect(() => {
    if (!showBar || !barEndAt) return;
    let raf;
    function tick() {
      const remaining = Math.max(0, barEndAt - Date.now());
      setProgress((remaining / 10000) * 100);
      if (remaining > 0) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [showBar, barEndAt]);

  if (!showBubble && !showBar) return null;

  const text = t("game.feverTime");

  return (
    <>
      {showBubble && (
        <div className="fever-bubble">
          <span>{text}</span>
        </div>
      )}
      {showBar && (
        <div className={`fever-top-bar${exiting ? " exiting" : ""}`}>
          <div className="fever-top-bar-bg" style={{ width: `${progress}%` }} />
          <span className="fever-top-bar-text">{text}</span>
        </div>
      )}
    </>
  );
}

function ItemSelectionOverlay({ countdown, playerItems, selectedItem, onSelect, t }) {
  const items = [
    { type: "smoke", icon: "😶‍🌫️", label: t("item.smoke"), desc: t("item.smokeDesc") },
    { type: "chaos", icon: "😵‍💫", label: t("item.chaos"), desc: t("item.chaosDesc") },
    { type: "quick", icon: "⚡️", label: t("item.quickMatch"), desc: t("item.quickMatchDesc") }
  ];

  const total = 20;
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (countdown / total) * circumference;

  return (
    <div className="item-selection-overlay">
      <div className="item-selection-panel">
        <h2 className="item-selection-title">{t("game.itemSelectTitle")}</h2>
        <p className="item-selection-subtitle">{t("game.itemSelectSubtitle")}</p>
        <div className="item-selection-grid">
          {items.map((item) => (
            <button
              key={item.type}
              className={`item-selection-card${selectedItem === item.type ? " selected" : ""}`}
              onClick={() => onSelect(item.type)}
              type="button"
            >
              <span className="item-selection-icon">{item.icon}</span>
              <span className="item-selection-name">{item.label}</span>
              <span className="item-selection-desc">{item.desc}</span>
            </button>
          ))}
        </div>
        <div className="item-selection-timer">
          <svg viewBox="0 0 100 100" className="timer-svg">
            <circle className="timer-track" cx="50" cy="50" r="45" />
            <circle
              className="timer-progress"
              cx="50" cy="50" r="45"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
            />
          </svg>
          <span className="timer-number">{countdown}</span>
        </div>
        <div className="item-selection-players">
          {Object.entries(playerItems).map(([id, type]) => (
            <span key={id} className={`item-selection-status${type ? " ready" : ""}`}>
              {type ? "✅" : "⏳"}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function createSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const port = window.location.port === "5555" ? "3333" : window.location.port;
  const portSegment = port ? `:${port}` : "";
  return `${protocol}//${window.location.hostname}${portSegment}/ws`;
}

function sortRanking(players, previousOrder = new Map()) {
  return [...players]
    .map((player, index) => ({ player, index }))
    .sort((a, b) => {
      if (b.player.score !== a.player.score) {
        return b.player.score - a.player.score;
      }
      const previousA = previousOrder.get(a.player.id);
      const previousB = previousOrder.get(b.player.id);
      if (previousA != null && previousB != null && previousA !== previousB) {
        return previousA - previousB;
      }
      if (previousA != null && previousB == null) return -1;
      if (previousA == null && previousB != null) return 1;
      return a.index - b.index;
    })
    .map(({ player }) => player);
}

function getPathSignature(lastMatch) {
  if (!lastMatch?.path) return "";
  return `${lastMatch.by}:${lastMatch.path.map((point) => `${point.row},${point.col}`).join("|")}`;
}

function getAvatarLabel(nickname) {
  const normalized = String(nickname ?? "").trim();
  return normalized ? normalized.slice(0, 1).toUpperCase() : "?";
}

function getHomeErrorTarget(error) {
  const key = error?.key;
  if (!key) return null;
  if (key === "error.enterNickname" || key === "error.previewOffline" || key === "error.serverNotReady") {
    return "nickname";
  }
  if (
    key === "error.enterNicknameAndRoomCode" ||
    key === "error.roomNotFound" ||
    key === "error.roomFull" ||
    key === "error.nicknameTaken" ||
    key === "error.gameAlreadyStarted"
  ) {
    return "join";
  }
  return null;
}

function copyTextFallback(value) {
  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  textArea.style.pointerEvents = "none";
  document.body.appendChild(textArea);
  textArea.select();
  textArea.setSelectionRange(0, textArea.value.length);
  const copied = document.execCommand("copy");
  document.body.removeChild(textArea);
  return copied;
}

function getConnectionTone(status) {
  const key = status?.key;
  if (key === "status.connected") return "connected";
  if (key === "status.connecting") return "connecting";
  return "disconnected";
}

function getComboVisual(count) {
  const clamped = Math.max(2, count);
  const size = Math.min(92, 50 + (clamped - 2) * 10);
  let color = "#ffe98d";
  if (clamped >= 5) {
    color = "#ff6548";
  } else if (clamped >= 4) {
    color = "#ff8f3f";
  } else if (clamped >= 3) {
    color = "#ffc24b";
  }
  return { size, color };
}

function getLayerVisual(depth = 1) {
  if (depth >= 3) {
    return {
      className: "extra-overlay",
      topOffset: -13,
      width: 67,
      height: 77
    };
  }
  if (depth === 2) {
    return {
      className: "mid-overlay",
      topOffset: -6,
      width: 67,
      height: 77
    };
  }
  return {
    className: "demo-cell",
    topOffset: 0,
    width: 67,
    height: 77
  };
}

function getPolylineLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    length += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return length;
}

function buildRopeParticles(points) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const particles = [];
  let keyIndex = 0;

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const segmentLength = Math.hypot(dx, dy);
    const steps = Math.max(2, Math.floor(segmentLength / 36));

    for (let step = 0; step <= steps; step += 1) {
      const ratio = step / steps;
      const x = start.x + dx * ratio;
      const y = start.y + dy * ratio;
      const spreadX = (Math.sin((index + 1) * (step + 1)) * 28).toFixed(2);
      const spreadY = (Math.cos((index + 2) * (step + 1)) * 28 - 14).toFixed(2);
      particles.push({
        key: `rope-${keyIndex}`,
        left: x,
        top: y,
        x: `${spreadX}px`,
        y: `${spreadY}px`,
        delay: `${(0.46 + ratio * 0.08).toFixed(2)}s`
      });
      keyIndex += 1;
    }
  }

  return particles;
}

function buildOverlayPolyline(path, boardElement) {
  if (!path?.length || !boardElement) return null;

  const boardRect = boardElement.getBoundingClientRect();
  const rowCenters = Array.from({ length: ROWS }, () => null);
  const colCenters = Array.from({ length: COLS }, () => null);

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cell = boardElement.querySelector(`[data-row='${row}'][data-col='${col}']`);
      if (!cell) continue;
      const icons = cell.querySelectorAll(".suit-icon");
      const topIcon = icons[icons.length - 1];
      const target = topIcon ?? cell;
      const rect = target.getBoundingClientRect();
      const centerX = rect.left - boardRect.left + rect.width / 2;
      const centerY = rect.top - boardRect.top + rect.height / 2;
      if (rowCenters[row] == null) rowCenters[row] = centerY;
      if (colCenters[col] == null) colCenters[col] = centerX;
    }
  }

  const fallbackCell = boardElement.querySelector("[data-row='0'][data-col='0']");
  if (!fallbackCell) return null;
  const fallbackRect = fallbackCell.getBoundingClientRect();
  const boardStyle = window.getComputedStyle(boardElement);
  const gap = Number.parseFloat(boardStyle.columnGap || boardStyle.gap || "0");
  const stepX = fallbackRect.width + gap;
  const stepY = fallbackRect.height + gap;

  function firstGap(centers, fallbackStep) {
    for (let index = 1; index < centers.length; index += 1) {
      if (centers[index] != null && centers[index - 1] != null) {
        return centers[index] - centers[index - 1];
      }
    }
    return fallbackStep;
  }

  const colStep = firstGap(colCenters, stepX);
  const rowStep = firstGap(rowCenters, stepY);
  const firstColCenter =
    colCenters.find((value) => value != null) ?? (fallbackRect.left - boardRect.left + fallbackRect.width / 2);
  const firstRowCenter =
    rowCenters.find((value) => value != null) ?? (fallbackRect.top - boardRect.top + fallbackRect.height / 2);

  function projectFromCenters(value, centers, firstCenter, step) {
    if (Number.isInteger(value) && value >= 0 && value < centers.length && centers[value] != null) {
      return centers[value];
    }
    return firstCenter + value * step;
  }

  const points = path.map((point) => ({
    x: projectFromCenters(point.col, colCenters, firstColCenter, colStep),
    y: projectFromCenters(point.row, rowCenters, firstRowCenter, rowStep)
  }));

  return {
    width: boardRect.width,
    height: boardRect.height,
    points
  };
}

function buildMatchReveal(lastMatch, boardElement) {
  if (!lastMatch?.path?.length || !boardElement) return null;
  const polyline = buildOverlayPolyline(lastMatch.path, boardElement);
  if (!polyline) return null;

  const boardRect = boardElement.getBoundingClientRect();
  const pair = Array.isArray(lastMatch.pair) ? lastMatch.pair : [];
  const depths = lastMatch.depths ?? {};
  const ghosts = pair
    .map((position, index) => {
      const cell = boardElement.querySelector(`[data-row='${position.row}'][data-col='${position.col}']`);
      if (!cell) return null;
      const rect = cell.getBoundingClientRect();
      const depth = index === 0 ? depths.first ?? 1 : depths.second ?? 1;
      const visual = getLayerVisual(depth);
      const centerX = rect.left - boardRect.left + visual.width / 2;
      const centerY = rect.top - boardRect.top + visual.topOffset + visual.height / 2;
      const particleOffsets = [
        { x: -26, y: -24 },
        { x: -8, y: -30 },
        { x: 16, y: -22 },
        { x: 28, y: -4 },
        { x: 20, y: 24 },
        { x: -4, y: 30 },
        { x: -24, y: 20 },
        { x: -30, y: -2 }
      ];
      return {
        key: `${position.row}-${position.col}-${index}`,
        className: visual.className,
        left: rect.left - boardRect.left,
        top: rect.top - boardRect.top + visual.topOffset,
        width: visual.width,
        height: visual.height,
        icon: lastMatch.tile?.icon ?? "?",
        particles: particleOffsets.map((offset, particleIndex) => ({
          key: `${position.row}-${position.col}-${particleIndex}`,
          left: centerX,
          top: centerY,
          x: offset.x,
          y: offset.y
        }))
      };
    })
    .filter(Boolean);

  return {
    ...polyline,
    ghosts,
    ropeParticles: buildRopeParticles(polyline.points),
    length: getPolylineLength(polyline.points),
    token: lastMatch.token ?? `${lastMatch.by}:${polyline.points.map((point) => `${point.x}-${point.y}`).join("|")}`
  };
}

function App() {
  const previewMode = isBoardPreviewMode();
  const previewRuleMode = previewMode === "rule-test";
  const previewBoardMode = previewMode === "board";
  const previewResultsMode = previewMode === "results";
  const [language, setLanguage] = useState(() => loadPreferredLanguage());
  const [gameMode, setGameMode] = useState("multi");
  const [soloDifficulty, setSoloDifficulty] = useState("default");
    const [soloLevelIdx, setSoloLevelIdx] = useState(0);
    const [soloLevelPick, setSoloLevelPick] = useState("all");
  const socketRef = useRef(null);
  const boardRef = useRef(null);
  const [nickname, setNickname] = useState(() => loadPreferredNickname());
  const [joinCode, setJoinCode] = useState("");
  const [avatarSeed, setAvatarSeed] = useState(() => loadPreferredAvatarSeed());
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [how2playModalOpen, setHow2playModalOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [leaderboardEntries, setLeaderboardEntries] = useState([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [avatarOptions, setAvatarOptions] = useState(() => createAvatarBatch());
  const [playerId, setPlayerId] = useState(previewMode ? "preview-player" : "");
  const pendingRequestsRef = useRef(new Map());
  const soloSubmitLocksRef = useRef(new Set());
  const previousRoomRef = useRef(null);
  const [room, setRoom] = useState(() =>
    previewRuleMode
      ? createLayerRuleTestRoom(loadPreferredLanguage())
      : previewBoardMode
        ? createPreviewRoom(loadPreferredLanguage())
        : previewResultsMode
          ? createPreviewResultsRoom(loadPreferredLanguage())
          : null
  );
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(previewMode ? createMessage("status.preview") : createMessage("status.connecting"));
  const [onlineCount, setOnlineCount] = useState(null);
  const homeAccessEnabled = isHomeAccessEnabled(status, previewMode);
  const [matchReveal, setMatchReveal] = useState(null);
  const [comboPopup, setComboPopup] = useState(null);
  const [playerComboPopup, setPlayerComboPopup] = useState(null);
  const [copiedRoomCode, setCopiedRoomCode] = useState(false);
  const [smokeEffect, setSmokeEffect] = useState(null);
  const [smokeFading, setSmokeFading] = useState(false);
  const [chaosEffect, setChaosEffect] = useState(null);
  const [feverEffect, setFeverEffect] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);
  const playerCardRefs = useRef(new Map());
  const previousPlayerPositionsRef = useRef(new Map());
  const previousRankingOrderRef = useRef(new Map());
  const lastComboTokenRef = useRef("");
  const lastPlayerComboTokenRef = useRef("");
  const lastSmokeTokenRef = useRef("");
  const lastChaosTokenRef = useRef("");
  const mySelection = room?.you?.selection;
  const reshuffling = Boolean(room?.reshuffleCountdown);

  useEffect(() => {
    savePreferredLanguage(language);
  }, [language]);

  useEffect(() => {
    savePreferredAvatarSeed(avatarSeed);
  }, [avatarSeed]);

  useEffect(() => {
    if (room && room?.phase !== "lobby" && avatarModalOpen) {
      setAvatarModalOpen(false);
    }
  }, [avatarModalOpen, room?.phase]);

  useEffect(() => {
    if (!copiedRoomCode) return undefined;
    const timer = window.setTimeout(() => setCopiedRoomCode(false), 1200);
    return () => window.clearTimeout(timer);
  }, [copiedRoomCode]);

  useEffect(() => {
    if (previewMode || room) return;
    setStatus(createMessage("status.connecting"));
    setOnlineCount(null);
  }, [previewMode, room]);

  useEffect(() => {
    if (room?.levelIndex == null) return;
    reloadLevelConfig(room.levelIndex);
  }, [room?.levelIndex]);

  useEffect(() => {
    if (previewMode) return undefined;

    const socket = new WebSocket(createSocketUrl());
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setStatus(createMessage("status.connected"));
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const clientRequestId = message.payload?.clientRequestId;
      if (clientRequestId) {
        const pending = pendingRequestsRef.current.get(clientRequestId);
        if (pending) {
          if (message.type === pending.responseType) {
            pendingRequestsRef.current.delete(clientRequestId);
            pending.resolve(message.payload);
          } else if (message.type === "error") {
            pendingRequestsRef.current.delete(clientRequestId);
            pending.reject(new Error(message.payload?.message?.key ?? "request_failed"));
          }
        }
      }
      if (message.type === "connected") {
        setPlayerId(message.payload.playerId);
      }
      if (message.type === "online_count") {
        setOnlineCount(message.payload?.count ?? 0);
      }
      if (message.type === "room_state") {
        setRoom(message.payload);
        setError(null);
      }
      if (message.type === "leaderboard_state" && !clientRequestId) {
        setLeaderboardEntries(message.payload.entries ?? []);
      }
      if (message.type === "solo_score_submitted" && !clientRequestId) {
        setLeaderboardEntries(message.payload.leaderboard ?? []);
      }
      if (message.type === "error") {
        setError(message.payload.message);
      }
    });

    socket.addEventListener("close", () => {
      releasePendingRequests();
      setOnlineCount(null);
      setStatus(createMessage("status.disconnected"));
    });

    return () => {
      releasePendingRequests();
      socket.close();
    };
  }, [previewMode]);

  // 音效：消除匹配时播放“叮”声
  const playMatchSound = useMatchSound(getPathSignature(room?.lastMatch));

  // Sound: play combo.mp3 when combo occurs (count >= 2)
  const playComboSound = useComboSound(room?.lastCombo?.token ?? null);

  // Background music: loop happy.mp3 continuously from homepage
  const bgmPlaying = true;
  useBgm({ playing: bgmPlaying, volume: 0.4 });

  // English countdown voice: speak 3, 2, 1, Go! during game start countdown
  const speakCountdown = useCountdownVoice();

  // Listen for countdown changes and speak the number
  useEffect(() => {
    speakCountdown(room?.startCountdown);
  }, [room?.startCountdown]);

  // Solo mode local 3-2-1 countdown
  useEffect(() => {
    if (!room || room.code !== "SOLO" || room.startCountdown == null) return undefined;
    if (room.startCountdown <= 0) return undefined;
    const timer = setInterval(() => {
      setRoom((prev) => {
        if (!prev || prev.startCountdown == null) return prev;
        const next = prev.startCountdown - 1;
        return {
          ...prev,
          startCountdown: next,
          startReveal: next === 0,
          message: next > 0 ? createMessage("server.gameStarting", { count: next }) : createMessage("server.gameStarted")
        };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [room?.startCountdown, room?.code]);

  useEffect(() => {
    if (room?.startReveal && room?.code === "SOLO") {
      const t = setTimeout(() => {
        setRoom((prev) => (prev ? { ...prev, startCountdown: null, startReveal: false } : prev));
      }, 500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [room?.startReveal, room?.code]);

  useEffect(() => {
    if (room?.lastMatch?.path) {
      playMatchSound();
    }
  }, [getPathSignature(room?.lastMatch)]);

  useEffect(() => {
    const previousRoom = previousRoomRef.current;
    if (
      previousRoom?.code === "SOLO" &&
      previousRoom.phase !== "results" &&
      previousRoom.soloSessionId &&
      previousRoom.soloSessionId !== room?.soloSessionId
    ) {
      submitSoloScoreSilently(previousRoom);
    }
    previousRoomRef.current = room;
  }, [room]);

  useEffect(() => {
    if (room?.code === "SOLO" && room.phase === "results") {
      void finalizeSoloScore(room);
    }
  }, [room?.code, room?.phase, room?.soloSessionId]);

  useEffect(() => {
    if (previewMode) return undefined;
    const handleBeforeUnload = () => {
      const activeRoom = previousRoomRef.current;
      if (activeRoom?.code === "SOLO" && activeRoom.phase !== "results") {
        submitSoloScoreSilently(activeRoom);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [previewMode]);

  useEffect(() => {
    if (!room?.lastMatch?.path || room.phase !== "game" || room.lastMatch.by !== playerId) return undefined;
    const frame = window.requestAnimationFrame(() => {
      setMatchReveal(buildMatchReveal(room.lastMatch, boardRef.current));
    });
    const timer = window.setTimeout(() => setMatchReveal(null), 950);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [room?.phase, boardRef, getPathSignature(room?.lastMatch)]);

  useEffect(() => {
    const combo = room?.lastCombo;
    if (!combo?.token || combo.count < 1) return undefined;
    if (combo.by !== playerId) return undefined;
    if (combo.token === lastComboTokenRef.current) return undefined;

    lastComboTokenRef.current = combo.token;
    setComboPopup({ count: combo.count, by: combo.by, token: combo.token, fever: combo.fever ?? false });
    const timer = window.setTimeout(() => {
      setComboPopup((current) => (current?.token === combo.token ? null : current));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [room?.lastCombo]);

  // Play combo sound effect when combo popup appears
  useEffect(() => {
    if (comboPopup?.token) {
      playComboSound();
    }
  }, [comboPopup?.token]);

  useEffect(() => {
    const combo = room?.lastCombo;
    if (!combo?.token || combo.count < 1) return undefined;
    if (combo.token === lastPlayerComboTokenRef.current) return undefined;

    lastPlayerComboTokenRef.current = combo.token;
    setPlayerComboPopup({ by: combo.by, count: combo.count, token: combo.token });
    const timer = window.setTimeout(() => {
      setPlayerComboPopup((current) => (current?.token === combo.token ? null : current));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [room?.lastCombo]);

  // Smoke bomb effect timer: 6s display + 0.5s fade out
  useEffect(() => {
    const smokeItem = room?.activeItems?.find((item) => item.type === "smoke" && item.target === playerId);
    if (!smokeItem) return undefined;
    if (smokeItem.token === lastSmokeTokenRef.current) return undefined;
    lastSmokeTokenRef.current = smokeItem.token;
    setSmokeFading(false);
    setSmokeEffect(smokeItem);
    return undefined;
  }, [room?.activeItems, playerId]);

  useEffect(() => {
    if (!smokeEffect) return undefined;
    const fadeTimer = window.setTimeout(() => setSmokeFading(true), 6000);
    const clearTimer = window.setTimeout(() => {
      setSmokeEffect(null);
      setSmokeFading(false);
    }, 6500);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(clearTimer);
    };
  }, [smokeEffect]);

  // Chaos bomb effect: 6s then clear immediately
  useEffect(() => {
    const chaosItem = room?.activeItems?.find((item) => item.type === "chaos" && item.target === playerId);
    if (!chaosItem) return undefined;
    if (chaosItem.token === lastChaosTokenRef.current) return undefined;
    lastChaosTokenRef.current = chaosItem.token;
    setChaosEffect(chaosItem);
    return undefined;
  }, [room?.activeItems, playerId]);

  useEffect(() => {
    if (!chaosEffect) return undefined;
    const clearTimer = window.setTimeout(() => {
      setChaosEffect(null);
    }, 6000);
    return () => {
      window.clearTimeout(clearTimer);
    };
  }, [chaosEffect]);

  const ranking = useMemo(() => sortRanking(room?.players ?? [], previousRankingOrderRef.current), [room?.players]);
  const resultsRanking = useMemo(() => sortRanking(room?.players ?? []), [room?.players]);
  const t = (key, params) => translate(language, key, params);
  const formatMessage = (value) => resolveText(language, value);

  useEffect(() => {
    previousRankingOrderRef.current = new Map(ranking.map((player, index) => [player.id, index]));
  }, [ranking]);

  useLayoutEffect(() => {
    const elements = ranking
      .map((player) => {
        const element = playerCardRefs.current.get(player.id);
        if (!element) return null;
        return { id: player.id, element, top: element.getBoundingClientRect().top };
      })
      .filter(Boolean);

    const previousPositions = previousPlayerPositionsRef.current;

    elements.forEach(({ id, element, top }) => {
      const previousTop = previousPositions.get(id);
      if (previousTop == null) return;
      const deltaY = previousTop - top;
      if (Math.abs(deltaY) < 1) return;

      element.style.transition = "none";
      element.style.transform = `translateY(${deltaY}px)`;

      window.requestAnimationFrame(() => {
        element.style.transition = "transform 220ms ease";
        element.style.transform = "translateY(0)";
      });
    });

    previousPlayerPositionsRef.current = new Map(elements.map(({ id, top }) => [id, top]));
  }, [ranking]);

  function send(type, payload, options = {}) {
    const { silent = false } = options;
    if (previewMode) {
      if (!silent) setError(createMessage("error.previewOffline"));
      return false;
    }
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      if (!silent) setError(createMessage("error.serverNotReady"));
      return false;
    }
    socketRef.current.send(JSON.stringify({ type, payload }));
    return true;
  }

  function sendRequest(type, payload, responseType) {
    return new Promise((resolve, reject) => {
      const clientRequestId = `${type}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      pendingRequestsRef.current.set(clientRequestId, { resolve, reject, responseType });
      const sent = send(type, { ...payload, clientRequestId }, { silent: true });
      if (!sent) {
        pendingRequestsRef.current.delete(clientRequestId);
        reject(new Error("socket_not_ready"));
      }
    });
  }

  function releasePendingRequests() {
    pendingRequestsRef.current.forEach(({ reject }) => reject(new Error("socket_closed")));
    pendingRequestsRef.current.clear();
  }

  function getSoloSubmissionPayload(targetRoom) {
    if (!targetRoom || targetRoom.code !== "SOLO" || !targetRoom.soloSessionId || targetRoom.soloScoreSubmitted) return null;
    const soloPlayer = targetRoom.players?.find((player) => player.id === "solo-player");
    return {
      sessionId: targetRoom.soloSessionId,
      score: soloPlayer?.score ?? 0
    };
  }

  function submitSoloScoreSilently(targetRoom) {
    const payload = getSoloSubmissionPayload(targetRoom);
    if (!payload || soloSubmitLocksRef.current.has(payload.sessionId)) return false;
    const sent = send("submit_solo_score", payload, { silent: true });
    if (sent) {
      soloSubmitLocksRef.current.add(payload.sessionId);
    }
    return sent;
  }

  async function finalizeSoloScore(targetRoom) {
    const payload = getSoloSubmissionPayload(targetRoom);
    if (!payload) return targetRoom?.soloLeaderboardRank ?? null;
    if (soloSubmitLocksRef.current.has(payload.sessionId)) return null;

    soloSubmitLocksRef.current.add(payload.sessionId);
    try {
      const result = await sendRequest("submit_solo_score", payload, "solo_score_submitted");
      const nextRank = result?.rank ?? null;
      setLeaderboardEntries(result?.leaderboard ?? []);
      setRoom((currentRoom) =>
        currentRoom?.soloSessionId === payload.sessionId
          ? {
              ...currentRoom,
              soloScoreSubmitted: true,
              soloLeaderboardRank: nextRank
            }
          : currentRoom
      );
      return nextRank;
    } catch {
      soloSubmitLocksRef.current.delete(payload.sessionId);
      return null;
    }
  }

  async function loadLeaderboard() {
    if (previewMode) return;
    setLeaderboardLoading(true);
    try {
      const result = await sendRequest("get_leaderboard", {}, "leaderboard_state");
      setLeaderboardEntries(result?.entries ?? []);
    } catch {
      setError(createMessage("error.serverNotReady"));
    } finally {
      setLeaderboardLoading(false);
    }
  }

  async function startSoloSession(nextNickname, nextAvatarSeed, difficulty, startIdx) {
    let sessionId = null;
    try {
      const result = await sendRequest(
        "create_solo_session",
        { nickname: nextNickname, avatarSeed: nextAvatarSeed },
        "solo_session_created"
      );
      sessionId = result?.sessionId ?? null;
    } catch {
      // Solo mode works without server — leaderboard submission will be unavailable
    }
    reloadLevelConfig(startIdx);
    try {
      const soloRoom = createSoloRoom(nextNickname, nextAvatarSeed, language, startIdx, difficulty, {
        sessionId
      });
      setPlayerId("solo-player");
      setRoom(soloRoom);
      setError(null);
    } catch {
      setError(createMessage("error.boardGenerationFailed"));
    }
  }

  function onCreateRoom() {
    if (!homeAccessEnabled) return;
    send("create_room", { nickname, avatarSeed });
  }

    async function onStartSolo() {
    if (!homeAccessEnabled) return;
    let startIdx;
    if (soloLevelPick === "all") {
      startIdx = getSoloStartIndex(soloDifficulty);
    } else {
      startIdx = Number(soloLevelPick);
    }
    try {
      await startSoloSession(nickname, avatarSeed, soloDifficulty, startIdx);
    } catch (requestError) {
      if (requestError?.message?.startsWith("error.")) {
        setError(createMessage(requestError.message));
      } else {
        setError(createMessage("error.serverNotReady"));
      }
    }
  }

  function onJoinRoom() {
    if (!homeAccessEnabled) return;
    send("join_room", { nickname, code: joinCode, avatarSeed });
  }

  function onUseQuickMatch() {
    if ((room?.removablePairs ?? 0) === 0 || room?.fever?.active || feverEffect?.active) return;
    if (room?.phase !== "game" || room?.startCountdown || room?.startReveal || room?.reshuffleCountdown) return;
    if (room?.code === "SOLO") {
      setRoom((currentRoom) => {
        if (!currentRoom) return currentRoom;
        const match = findAnyRemovablePair(currentRoom.board);
        if (!match) return currentRoom;
        const { pair, path, tile, depths } = match;
        const nextBoard = removePair(currentRoom.board, pair[0], pair[1]);
        const nextComboTracker = new Map(currentRoom.comboTracker);
        nextComboTracker.set(playerId, { count: 0, lastClearedAt: 0 });
        const nextPlayers = currentRoom.players;
        if (!hasAnyMoves(nextBoard) && !isBoardCleared(nextBoard)) {
          const reshuffled = reshuffleBoard(nextBoard);
          return {
            ...currentRoom,
            comboTracker: nextComboTracker,
            board: reshuffled,
            players: nextPlayers,
            remainingTiles: countRemainingTiles(reshuffled),
            removablePairs: countRemovablePairs(reshuffled),
            message: createMessage("server.boardReshuffled"),
            lastMatch: { by: playerId, pair, path, tile, depths, token: `solo:${Date.now()}:quick` },
            lastCombo: null,
            phase: "game",
            you: { ...currentRoom.you, selection: null }
          };
        }
        const cleared = isBoardCleared(nextBoard);
        const currentSoloDifficulty = currentRoom.soloDifficulty ?? soloDifficulty;
                if (cleared && currentRoom.code === "SOLO" && currentRoom.levelIndex < getSoloEndIndex(currentSoloDifficulty) && soloLevelPick === "all") {
          const nextIdx = currentRoom.levelIndex + 1;
          reloadLevelConfig(nextIdx);
          const freshBoard = createBoard();
          const currentProgress = getSoloLevelProgress(currentRoom.levelIndex, currentSoloDifficulty);
          const nextProgress = getSoloLevelProgress(nextIdx, currentSoloDifficulty);
          return {
            ...currentRoom,
            comboTracker: nextComboTracker,
            board: freshBoard,
            levelIndex: nextIdx,
            players: nextPlayers,
            remainingTiles: countRemainingTiles(freshBoard),
            removablePairs: countRemovablePairs(freshBoard),
            message: createMessage("solo.levelComplete", { current: currentProgress.current, next: nextProgress.current }),
            lastMatch: { by: playerId, pair, path, tile, depths, token: `solo:${Date.now()}:quick` },
            lastCombo: null,
            phase: "game",
            startCountdown: 3,
            startReveal: false,
            you: { ...currentRoom.you, selection: null }
          };
        }
        return {
          ...currentRoom,
          comboTracker: nextComboTracker,
          board: nextBoard,
          players: nextPlayers,
          remainingTiles: countRemainingTiles(nextBoard),
          removablePairs: countRemovablePairs(nextBoard),
          message: createMessage("server.quickMatchUsed", { nickname: nextPlayers.find((p) => p.id === playerId)?.nickname ?? "" }),
          lastMatch: { by: playerId, pair, path, tile, depths, token: `solo:${Date.now()}:quick` },
          lastCombo: null,
          phase: cleared ? "results" : "game",
          you: { ...currentRoom.you, selection: null }
        };
      });
      return;
    }
    send("use_quick_match");
  }

  function onUseSoloReshuffle() {
    if (room?.code !== "SOLO") return;
    if ((room?.removablePairs ?? 0) === 0 || room?.fever?.active || feverEffect?.active) return;
    if (room?.phase !== "game" || room?.startCountdown || room?.startReveal || room?.reshuffleCountdown) return;
    setRoom((currentRoom) => {
      if (!currentRoom || currentRoom.code !== "SOLO") return currentRoom;
      if (currentRoom.reshuffleCountdown) return currentRoom;
      const reshuffled = reshuffleBoard(currentRoom.board);
      return {
        ...currentRoom,
        board: reshuffled,
        remainingTiles: countRemainingTiles(reshuffled),
        removablePairs: countRemovablePairs(reshuffled),
        message: createMessage("server.boardReshuffled"),
        lastMatch: null,
        lastCombo: null,
        you: { ...currentRoom.you, selection: null }
      };
    });
  }

  async function onCopyRoomCode(code) {
    const value = String(code ?? "");
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else if (!copyTextFallback(value)) {
        return;
      }
      setCopiedRoomCode(true);
    } catch {
      if (copyTextFallback(value)) {
        setCopiedRoomCode(true);
      }
    }
  }

  function onSelect(row, col) {
    if (previewMode || room?.code === "SOLO") {
      setRoom((currentRoom) => {
        if (!currentRoom || currentRoom.phase !== "game" || currentRoom.reshuffleCountdown) return currentRoom;

        const current = currentRoom.you?.selection;
        const nextPosition = { row, col };

        if (!current) {
          return {
            ...currentRoom,
            remainingTiles: countRemainingTiles(currentRoom.board),
            removablePairs: countRemovablePairs(currentRoom.board),
            message: currentRoom.code === "SOLO" ? createMessage("server.firstSelected") : createMessage("preview.firstSelected"),
            you: { ...currentRoom.you, selection: nextPosition }
          };
        }

        if (current.row === row && current.col === col) {
          return {
            ...currentRoom,
            message: currentRoom.code === "SOLO" ? createMessage("server.selectionCanceled") : createMessage("preview.selectionCanceled"),
            you: { ...currentRoom.you, selection: null }
          };
        }

        const result = isValidSelection(currentRoom.board, current, nextPosition);
        if (!result.ok) {
          return {
            ...currentRoom,
            message: result.reason,
            you: { ...currentRoom.you, selection: nextPosition }
          };
        }

        const nextBoard = removePair(currentRoom.board, current, nextPosition);
        const isSolo = currentRoom.code === "SOLO";
        const nextComboTracker = new Map(currentRoom.comboTracker);
        const combo = isSolo ? computeSoloCombo(nextComboTracker, playerId) : null;
        const scoreDelta = combo?.scoreDelta ?? SCORE_PER_MATCH;
        const nextPlayers = currentRoom.players.map((player) =>
          player.id === playerId ? { ...player, score: player.score + scoreDelta, maxCombo: isSolo ? Math.max(player.maxCombo ?? 0, combo.count) : player.maxCombo } : player
        );

        if (!hasAnyMoves(nextBoard) && !isBoardCleared(nextBoard)) {
          const reshuffled = reshuffleBoard(nextBoard);
          return {
            ...currentRoom,
            comboTracker: nextComboTracker,
            board: reshuffled,
            players: nextPlayers,
            remainingTiles: countRemainingTiles(reshuffled),
            removablePairs: countRemovablePairs(reshuffled),
            message: createMessage("server.boardReshuffled"),
            lastMatch: {
              by: playerId,
              pair: [current, nextPosition],
              path: result.path,
              tile: result.tile,
              depths: result.depths,
              token: `solo:${Date.now()}:match`
            },
            lastCombo: isSolo ? { by: playerId, count: combo.count, scoreDelta: combo.scoreDelta, token: combo.token } : undefined,
            phase: "game",
            you: { ...currentRoom.you, selection: null }
          };
        }

        const cleared = isBoardCleared(nextBoard);
        // Solo mode: if cleared and not last level, advance to next level seamlessly
        const currentSoloDifficulty = currentRoom.soloDifficulty ?? soloDifficulty;
                if (isSolo && cleared && currentRoom.levelIndex < getSoloEndIndex(currentSoloDifficulty) && soloLevelPick === "all") {
          const nextIdx = currentRoom.levelIndex + 1;
          reloadLevelConfig(nextIdx);
          const freshBoard = createBoard();
          const currentProgress = getSoloLevelProgress(currentRoom.levelIndex, currentSoloDifficulty);
          const nextProgress = getSoloLevelProgress(nextIdx, currentSoloDifficulty);
          return {
            ...currentRoom,
            comboTracker: nextComboTracker,
            board: freshBoard,
            levelIndex: nextIdx,
            players: nextPlayers,
            remainingTiles: countRemainingTiles(freshBoard),
            removablePairs: countRemovablePairs(freshBoard),
            message: createMessage("solo.levelComplete", {
              current: currentProgress.current,
              next: nextProgress.current
            }),
            lastMatch: {
              by: playerId,
              pair: [current, nextPosition],
              path: result.path,
              tile: result.tile,
              depths: result.depths,
              token: `solo:${Date.now()}:match`
            },
            lastCombo: { by: playerId, count: combo.count, scoreDelta: combo.scoreDelta, token: combo.token },
            phase: "game",
            startCountdown: 3,
            startReveal: false,
            you: { ...currentRoom.you, selection: null }
          };
        }

        return {
          ...currentRoom,
          comboTracker: nextComboTracker,
          board: nextBoard,
          players: nextPlayers,
          remainingTiles: countRemainingTiles(nextBoard),
          removablePairs: countRemovablePairs(nextBoard),
          message: isSolo ? createMessage("server.matchScored", { nickname: nextPlayers.find((p) => p.id === playerId)?.nickname ?? "", score: scoreDelta }) : createMessage("preview.matchSuccess"),
          lastMatch: {
            by: playerId,
            pair: [current, nextPosition],
            path: result.path,
            tile: result.tile,
            depths: result.depths,
            token: `${isSolo ? "solo" : "preview"}:${Date.now()}:match`
          },
          lastCombo: isSolo ? { by: playerId, count: combo.count, scoreDelta: combo.scoreDelta, token: combo.token } : undefined,
          phase: cleared ? "results" : "game",
          you: { ...currentRoom.you, selection: null }
        };
      });
      return;
    }
    if (room?.phase !== "game" || room?.reshuffleCountdown) return;
    send("select_tile", { row, col });
  }

  function refreshAvatarOptions() {
    setAvatarOptions(createAvatarBatch());
  }

  function onOpenAvatarModal() {
    refreshAvatarOptions();
    setAvatarModalOpen(true);
  }

  function onChooseAvatar(nextSeed) {
    const normalizedSeed = normalizeAvatarSeed(nextSeed);
    setAvatarSeed(normalizedSeed);
    setAvatarModalOpen(false);
    if (!room) return;
    if (previewMode || room?.code === "SOLO") {
      setRoom((currentRoom) => {
        if (!currentRoom) return currentRoom;
        return {
          ...currentRoom,
          players: currentRoom.players.map((player) =>
            player.id === playerId ? { ...player, avatarSeed: normalizedSeed } : player
          )
        };
      });
      return;
    }
    send("update_avatar", { avatarSeed: normalizedSeed });
  }

  function regeneratePreviewBoard() {
    if (!previewBoardMode) return;
    setRoom(createPreviewRoom(language));
    setMatchReveal(null);
    setError(null);
  }

  function loadRulePreviewBoard() {
    if (!previewMode) return;
    setRoom(createLayerRuleTestRoom(language));
    setMatchReveal(null);
    setError(null);
  }

  function loadResultsPreview() {
    if (!previewMode) return;
    setRoom(createPreviewResultsRoom(language));
    setMatchReveal(null);
    setError(null);
  }

  const canInteract = room?.phase === "game" && !reshuffling;
  const startBlocked = room?.phase === "game" && (room.startCountdown != null || room.startReveal);
  const boardRows = Array.isArray(room?.board) ? room.board : [];
  const hasRenderableBoard = boardRows.length > 0;
  const homeErrorTarget = !room ? getHomeErrorTarget(error) : null;
  const showGlobalError = Boolean(error) && !homeErrorTarget;
  const connectionTone = getConnectionTone(status);
  const currentPlayer = room?.players?.find((player) => player.id === playerId) ?? null;
  const homeStatusText =
    status?.key === "status.connected" && onlineCount != null
      ? `${formatMessage(status)} · ${t("status.onlineCount", { count: onlineCount })}`
      : formatMessage(status);

  return (
    <div className={`page-shell${!room ? " home-screen" : ""}`}>
      <div className="page-backdrop" />
      <main className={`app-card${room?.phase === "game" ? " game-layout" : ""}`}>
        {!room && (
          <section className="home-stage">
            <div className="home-stage-copy">
              <img className="home-logo" src="/img/homelogo.png" alt={t("app.title")} />
            </div>

            <section className="panel home-panel">
              <div className="home-connection-row" aria-label={homeStatusText} title={homeStatusText}>
                <span className={`connection-dot ${connectionTone}`} />
                <span className="home-connection-text">{homeStatusText}</span>
              </div>
              <label className="field home-inline-field language-field">
                <span className="language-icon-slot">
                  <img
                    src="https://cdn-icons-png.flaticon.com/512/2014/2014350.png"
                    alt="language"
                    width="30"
                    height="30"
                  />
                </span>
                <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                  {SUPPORTED_LANGUAGES.map((option) => (
                    <option key={option} value={option}>
                      {t(`language.${option}`)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mode-select-row">
                <span className="mode-label">{t("home.modeLabel")}</span>
                <div className="mode-options">
                  <button
                    type="button"
                    className={`mode-chip${gameMode === "solo" ? " active" : ""}`}
                    disabled={!homeAccessEnabled}
                    onClick={() => setGameMode("solo")}
                  >
                    {t("home.modeSolo")}
                  </button>
                  <button
                    type="button"
                    className={`mode-chip${gameMode === "multi" ? " active" : ""}`}
                    disabled={!homeAccessEnabled}
                    onClick={() => setGameMode("multi")}
                  >
                    {t("home.modeMulti")}
                  </button>
                </div>
              </div>
                            {gameMode === "solo" && (
                <div className="mode-select-row difficulty-select-row">
                  <span className="mode-label">{t("home.difficultyLabel")}</span>
                  <select
                    className="difficulty-select"
                    value={soloDifficulty}
                    disabled={!homeAccessEnabled}
                    onChange={(event) => {
                      setSoloDifficulty(event.target.value);
                      setSoloLevelPick("all");
                    }}
                  >
                    <option value="default">{t("difficulty.default")}</option>
                    <option value="Easy">{t("difficulty.easy")}</option>
                    <option value="Medium">{t("difficulty.medium")}</option>
                    <option value="Hard">{t("difficulty.hard")}</option>
                  </select>
                  {soloDifficulty !== "default" && (
                    <>
                      <span className="mode-label" style={{ marginLeft: "12px" }}>{t("home.levelLabel")}</span>
                      <select
                        className="level-pick-select"
                        value={soloLevelPick}
                        disabled={!homeAccessEnabled}
                        onChange={(event) => setSoloLevelPick(event.target.value)}
                      >
                                                <option value="all">{t("home.allLevels")}</option>
                          {LEVEL_CONFIGS.filter((c) => c.difficulty === soloDifficulty).map((config, i) => {
                            const realIndex = LEVEL_CONFIGS.indexOf(config);
                            const label = config.name.replace(/^Level \d+ /, "");
                            const maxLayer = Math.max(...config.heightMap.flat(), 0);
                            return (
                              <option key={realIndex} value={realIndex}>
                                {label} ({maxLayer} layers)
                              </option>
                            );
                          })}
                      </select>
                    </>
                  )}
                </div>
              )}
              <div className="home-inline-action-row">
                <label className={`field home-inline-field nickname-field${homeErrorTarget === "nickname" ? " has-bubble" : ""}`}>
                  <span>{t("home.nicknameLabel")}</span>
                  <div className="home-avatar-wrap">
                    <img className="avatar-image home-avatar-image" src={getAvatarUrl(avatarSeed)} alt={t("lobby.editAvatar")} />
                    <button
                      type="button"
                      className="avatar-edit-btn home-avatar-edit-btn"
                      aria-label={t("lobby.editAvatar")}
                      title={t("lobby.editAvatar")}
                      onClick={onOpenAvatarModal}
                    >
                      ✏️
                    </button>
                  </div>
                  <input
                    value={nickname}
                    onChange={(event) => {
                                          setNickname(event.target.value);
                                          savePreferredNickname(event.target.value);
                                          if (homeErrorTarget === "nickname") setError(null);
                                        }}
                    maxLength={12}
                    placeholder={t("home.nicknamePlaceholder")}
                  />
                  {homeErrorTarget === "nickname" && <p className="field-bubble">{formatMessage(error)}</p>}
                </label>
                <div className="home-actions home-actions-stack create-room-actions">
                  <button className="primary-btn" disabled={!homeAccessEnabled} onClick={gameMode === "solo" ? onStartSolo : onCreateRoom}>
                    {gameMode === "solo" ? t("home.startSolo") : t("home.create")}
                  </button>
                </div>
              </div>
              {gameMode === "multi" && (
                <>
                  <div className="home-divider" aria-hidden="true" />
                  <div className="join-row">
                    <label className={`field home-inline-field join-field${homeErrorTarget === "join" ? " has-bubble" : ""}`}>
                      <span>{t("home.joinPrompt")}</span>
                      <input
                        value={joinCode}
                        onChange={(event) => {
                          setJoinCode(event.target.value.replace(/\D/g, "").slice(0, 4));
                          if (homeErrorTarget === "join") setError(null);
                        }}
                        placeholder={t("home.roomCodePlaceholder")}
                      />
                      {homeErrorTarget === "join" && <p className="field-bubble join-bubble">{formatMessage(error)}</p>}
                    </label>
                    <button className="secondary-btn join-btn" disabled={!homeAccessEnabled} onClick={onJoinRoom}>
                      {t("home.join")}
                    </button>
                  </div>
                </>
              )}
              <div className="home-how2play-row">
                <button type="button" className="how2play-link" disabled={!homeAccessEnabled} onClick={() => setHow2playModalOpen(true)}>
                  {t("home.how2play")}
                </button>
                <button
                  type="button"
                  className="how2play-link"
                  disabled={!homeAccessEnabled}
                  onClick={() => {
                    setLeaderboardOpen(true);
                    void loadLeaderboard();
                  }}
                >
                  {t("home.leaderboard")}
                </button>
                <button type="button" className="how2play-link" disabled={!homeAccessEnabled} onClick={() => setCreditsOpen(true)}>
                  {t("home.credits")}
                </button>
              </div>
            </section>
          </section>
        )}

        {room && room.phase === "lobby" && (
          <header className="hero">
            <div>
              <img className="lobby-logo" src="/img/homelogo.png" alt={t("app.title")} />
            </div>
          </header>
        )}

        {room && room.phase === "lobby" && (
          <section className="panel lobby-panel">
            <div className="room-badge-row">
              <span className={`connection-dot ${connectionTone}`} aria-label={formatMessage(status)} title={formatMessage(status)} />
              <div className="room-badge">{t("lobby.roomCode", { code: room.code })}</div>
              <button className="copy-chip" onClick={() => onCopyRoomCode(room.code)}>
                {copiedRoomCode ? t("lobby.copied") : t("lobby.copy")}
              </button>
            </div>
            <h2>{t("lobby.title")}</h2>
            <p className="room-message">{formatMessage(room.message)}</p>
            <div className="player-list">
              {room.players.map((player) => (
                <article className={`player-chip${player.id === playerId ? " mine" : ""}`} key={player.id}>
                  <div className="player-chip-avatar-wrap">
                    <img
                      className="avatar-image lobby-avatar-image"
                      src={getAvatarUrl(player.avatarSeed)}
                      alt={player.nickname}
                    />
                    {player.id === playerId && (
                      <button
                        className="avatar-edit-btn"
                        type="button"
                        aria-label={t("lobby.editAvatar")}
                        title={t("lobby.editAvatar")}
                        onClick={onOpenAvatarModal}
                      >
                        ✏️
                      </button>
                    )}
                  </div>
                  <div className="player-chip-meta">
                    <strong>{player.nickname}{player.id === playerId ? `（${t("you")}）` : ""}</strong>
                    <span>{player.id === room.hostId ? t("lobby.host") : t("lobby.player")}</span>
                  </div>
                </article>
              ))}
              {Array.from({ length: Math.max(0, MAX_PLAYERS - room.players.length) }, (_value, index) => (
                <article className="player-chip empty" key={`empty-${index}`}>
                  {t("lobby.waiting")}
                </article>
              ))}
            </div>
            {room.hostId === playerId && (
              <button className="primary-btn" disabled={!room.canStart} onClick={() => send("start_game")}>
                {t("lobby.start")}
              </button>
            )}
          </section>
        )}

        {room?.itemSelectionActive && (
          <ItemSelectionOverlay
            countdown={room.itemSelectionCountdown}
            playerItems={room.itemSelections ?? {}}
            selectedItem={room.you?.selectedItem}
            onSelect={(type) => send("select_item", { itemType: type })}
            t={t}
          />
        )}

        {room && room.phase === "game" && (
          <section className="panel game-panel">
            <div className="game-topbar">
              <div className="topbar-brand">
                <img className="game-top-logo" src="/img/homelogo.png" alt={t("app.title")} />
                <FeverDisplay
                  active={!!(room?.fever?.active || feverEffect?.active)}
                  t={t}
                />
              </div>
              <div className="topbar-status">
                <div className="removable-orb" aria-label={t("game.countPill", { count: room.removablePairs ?? 0 })}>
                  <span className="removable-orb-count">{room.removablePairs ?? 0}</span>
                  <span className="removable-orb-label">{t("game.removableLabel")}</span>
                </div>
                {reshuffling && <span className="info-pill warning">{t("game.reshuffleCountdown", { count: room.reshuffleCountdown })}</span>}
              </div>
            </div>

            <div className="game-main">
              <aside className="players-panel">
                <div className="players-column">
                  {ranking.map((player, index) => (
                    <article
                      className={`player-card${player.id === playerId ? " mine" : ""}${dragOverTarget === player.id ? " drag-highlight" : ""}`}
                      key={player.id}
                      ref={(element) => {
                        if (element) {
                          playerCardRefs.current.set(player.id, element);
                        } else {
                          playerCardRefs.current.delete(player.id);
                        }
                      }}
                      onDragOver={(event) => {
                        if (player.id !== playerId) {
                          event.preventDefault();
                          setDragOverTarget(player.id);
                        }
                      }}
                      onDragLeave={() => setDragOverTarget(null)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDragOverTarget(null);
                        const item = event.dataTransfer.getData("text/item");
                        if (item === "smoke" && player.id !== playerId) {
                          send("use_smoke_bomb", { targetId: player.id });
                        }
                        if (item === "chaos" && player.id !== playerId) {
                          send("use_chaos_bomb", { targetId: player.id });
                        }
                      }}
                    >
                      <div className={`player-avatar${player.id === playerId ? " mine" : ""}`}>
                        {player.avatarSeed ? (
                          <img className="avatar-image" src={getAvatarUrl(player.avatarSeed)} alt={player.nickname} />
                        ) : (
                          <span>{getAvatarLabel(player.nickname)}</span>
                        )}
                      </div>
                      <div className="player-meta">
                        <strong>{player.nickname}{player.id === playerId ? `（${t("you")}）` : ""}</strong>
                        <div className="player-meta-row">
                          {room?.activeItems?.filter((item) => item.target === player.id).map((item) => (
                            <span key={item.token} className="player-active-item" title={item.type === "smoke" ? "烟雾弹" : item.type === "chaos" ? t("item.chaos") : item.type}>
                              {item.type === "smoke" ? "😶‍🌫️" : item.type === "chaos" ? "😵‍💫" : "🎁"}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="player-score">{player.score}</div>
                      {playerComboPopup?.by === player.id && (
                        <div className="player-combo-badge">{t("game.comboPopup", { count: playerComboPopup.count })}</div>
                      )}
                    </article>
                  ))}
                </div>
              </aside>

              <aside className="items-panel">
                <div className="items-column">
                  {room?.you?.selectedItem === "smoke" && (room?.you?.itemCount ?? 0) > 0 && (
                    <div className="item-slot">
                      <div className="item-tooltip">
                        <div
                          className={`item-icon smoke-bomb-icon${(room?.fever?.active || feverEffect?.active) ? " disabled" : ""}`}
                          draggable={room?.phase === "game" && !room?.startCountdown && !room?.startReveal && !room?.reshuffleCountdown && !room?.fever?.active && !feverEffect?.active}
                          onDragStart={(event) => {
                            event.dataTransfer.setData("text/item", "smoke");
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          onDoubleClick={() => {
                            if (room?.fever?.active || feverEffect?.active) return;
                            if (room?.phase !== "game" || room?.startCountdown || room?.startReveal || room?.reshuffleCountdown) return;
                            const highestOther = ranking.find((p) => p.id !== playerId);
                            if (highestOther) {
                              send("use_smoke_bomb", { targetId: highestOther.id });
                            }
                          }}
                        >
                          😶‍🌫️
                          <span className="item-count-badge">{room?.code === "SOLO" ? "♾️" : (room?.you?.itemCount ?? 0)}</span>
                        </div>
                        <div className="item-tooltip-bubble">
                          {t("item.smokeDesc")}
                        </div>
                      </div>
                    </div>
                  )}
                  {room?.you?.selectedItem === "chaos" && (room?.you?.itemCount ?? 0) > 0 && (
                    <div className="item-slot">
                      <div className="item-tooltip">
                        <div
                          className={`item-icon chaos-bomb-icon${(room?.fever?.active || feverEffect?.active) ? " disabled" : ""}`}
                          draggable={room?.phase === "game" && !room?.startCountdown && !room?.startReveal && !room?.reshuffleCountdown && !room?.fever?.active && !feverEffect?.active}
                          onDragStart={(event) => {
                            event.dataTransfer.setData("text/item", "chaos");
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          onDoubleClick={() => {
                            if (room?.fever?.active || feverEffect?.active) return;
                            if (room?.phase !== "game" || room?.startCountdown || room?.startReveal || room?.reshuffleCountdown) return;
                            const highestOther = ranking.find((p) => p.id !== playerId);
                            if (highestOther) {
                              send("use_chaos_bomb", { targetId: highestOther.id });
                            }
                          }}
                        >
                          😵‍💫
                          <span className="item-count-badge">{room?.code === "SOLO" ? "♾️" : (room?.you?.itemCount ?? 0)}</span>
                        </div>
                        <div className="item-tooltip-bubble">
                          {t("item.chaosDesc")}
                        </div>
                      </div>
                    </div>
                  )}
                  {room?.you?.selectedItem === "quick" && (room?.code === "SOLO" || (room?.you?.itemCount ?? 0) > 0) && (
                    <div className="item-slot">
                      <div className="item-tooltip">
                        <div
                          className={`item-icon quick-match-icon${(room?.removablePairs ?? 0) === 0 || room?.fever?.active || feverEffect?.active ? " disabled" : ""}`}
                          onDoubleClick={onUseQuickMatch}
                        >
                          ⚡️
                          <span className="item-count-badge">{room?.code === "SOLO" ? "♾️" : (room?.you?.itemCount ?? 0)}</span>
                        </div>
                        <div className="item-tooltip-bubble">
                          {t("item.quickMatchDesc")}
                        </div>
                      </div>
                    </div>
                  )}
                  {room?.code === "SOLO" && (
                    <div className="item-slot">
                      <div className="item-tooltip">
                        <div
                          className={`item-icon reshuffle-icon${(room?.removablePairs ?? 0) === 0 || room?.fever?.active || feverEffect?.active ? " disabled" : ""}`}
                          onDoubleClick={onUseSoloReshuffle}
                        >
                          🔄
                          <span className="item-count-badge">♾️</span>
                        </div>
                        <div className="item-tooltip-bubble">
                          {t("item.reshuffleDesc")}
                        </div>
                      </div>
                    </div>
                  )}
                  {((room?.you?.selectedItem == null) || (room?.code !== "SOLO" && (room?.you?.itemCount ?? 0) <= 0)) && (
                    <div className="item-slot item-empty" />
                  )}
                </div>
              </aside>

              <div className="board-panel">
                <div className="board-frame">
                  {hasRenderableBoard ? (
                    <div
                      ref={boardRef}
                      className="board-grid"
                      style={{ gridTemplateColumns: `repeat(${COLS}, auto)` }}
                    >
                      {boardRows.map((row, rowIndex) =>
                        (Array.isArray(row) ? row : []).map((stack, colIndex) => {
                          const normalizedStack = Array.isArray(stack) ? stack : [];
                          const isSelected =
                            mySelection?.row === rowIndex && mySelection?.col === colIndex;
                          const isEmpty = normalizedStack.length === 0;
                          return (
                            <button
                              key={`${rowIndex}-${colIndex}`}
                              data-row={rowIndex}
                              data-col={colIndex}
                              className={`tile-slot${isEmpty ? " empty" : ""}${isSelected ? " selected" : ""}`}
                              style={{ zIndex: rowIndex + 1 }}
                              disabled={isEmpty || !canInteract || startBlocked}
                              onClick={() => onSelect(rowIndex, colIndex)}
                            >
                              {!isEmpty &&
                                normalizedStack.map((tile, layerIndex) => {
                                  const visualClass =
                                    layerIndex === 0
                                      ? "demo-cell"
                                      : layerIndex === 1
                                        ? "mid-overlay"
                                        : "extra-overlay";
                                  const isTopLayer = layerIndex === normalizedStack.length - 1;
                                  const isChaosTarget = chaosEffect && isTopLayer;
                                  const chaosIcons = isChaosTarget ? getChaosIcons(tile.type) : null;
                                  const chaosDelay = isChaosTarget ? Math.floor(Math.random() * 1000) : 0;
                                  return (
                                    <span
                                      key={tile.id ?? `${rowIndex}-${colIndex}-${layerIndex}`}
                                      className={`${visualClass}${!isTopLayer ? " buried" : ""}${isTopLayer ? " top-layer" : ""}${isTopLayer && isSelected ? " selected" : ""}`}
                                      style={{ zIndex: isTopLayer && isSelected ? 999 : layerIndex + 1 }}
                                    >
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
                                    </span>
                                  );
                                })}
                            </button>
                          );
                        })
                      )}
                      {matchReveal && (
                        <div className="match-reveal-overlay">
                          {matchReveal.ghosts.map((ghost) => (
                            <Fragment key={ghost.key}>
                              <span
                                className={`match-ghost ${ghost.className}`}
                                style={{
                                  left: `${ghost.left}px`,
                                  top: `${ghost.top}px`,
                                  width: `${ghost.width}px`,
                                  height: `${ghost.height}px`
                                }}
                              >
                                <span className="suit-icon">{ghost.icon}</span>
                              </span>
                              <div className="match-particles">
                                {ghost.particles.map((particle) => (
                                  <span
                                    key={particle.key}
                                    className="match-particle"
                                    style={{
                                      left: `${particle.left}px`,
                                      top: `${particle.top}px`,
                                      "--particle-x": `${particle.x}px`,
                                      "--particle-y": `${particle.y}px`
                                    }}
                                  />
                                ))}
                              </div>
                            </Fragment>
                          ))}
                          <div className="match-particles rope-particles">
                            {matchReveal.ropeParticles.map((particle) => (
                              <span
                                key={particle.key}
                                className="match-particle rope-particle"
                                style={{
                                  left: `${particle.left}px`,
                                  top: `${particle.top}px`,
                                  "--particle-x": particle.x,
                                  "--particle-y": particle.y,
                                  "--particle-delay": particle.delay
                                }}
                              />
                            ))}
                          </div>
                          <svg
                            className="match-path-overlay rope-style"
                            viewBox={`0 0 ${matchReveal.width} ${matchReveal.height}`}
                            preserveAspectRatio="none"
                            style={{
                              "--path-length": `${matchReveal.length}`
                            }}
                          >
                            <polyline
                              points={matchReveal.points.map((point) => `${point.x},${point.y}`).join(" ")}
                              className="match-path rope-core"
                            />
                            <polyline
                              points={matchReveal.points.map((point) => `${point.x},${point.y}`).join(" ")}
                              className="match-path rope-strand"
                            />
                            {matchReveal.points.map((point, index) => (
                              <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r="5.5" className="match-node rope-knot" />
                            ))}
                          </svg>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="board-status">{t("game.boardLoading")}</p>
                  )}
                  {smokeEffect && (
                    <div className={`smoke-overlay${smokeFading ? " fade-out" : ""}`}>
                      <img src="/img/smoke.gif" alt="" className="smoke-gif" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {previewMode && (
              <div className="game-tools">
                <div className="preview-actions">
                  {previewBoardMode && (
                    <button className="secondary-btn" onClick={regeneratePreviewBoard}>
                      {t("preview.regenerate")}
                    </button>
                  )}
                  <button className="secondary-btn" onClick={loadRulePreviewBoard}>
                    {t("preview.ruleTest")}
                  </button>
                </div>
              </div>
            )}

            {comboPopup && (
              <div className="combo-popup-layer" aria-hidden="true">
                <div
                  className={`combo-popup${comboPopup.fever ? " fever" : ""}`}
                  style={{
                    "--combo-size": `${getComboVisual(comboPopup.count).size}px`,
                    "--combo-color": getComboVisual(comboPopup.count).color
                  }}
                >
                  {t("game.comboPopup", { count: comboPopup.count })}
                </div>
              </div>
            )}

            {room.startCountdown != null && (
              <div className={`game-start-overlay${room.startReveal ? " fading" : ""}`}>
                {room.startCountdown > 0 && (
                  <div className="game-start-countdown">
                    {room?.code === "SOLO" && (
                      <p className="game-start-stage">
                        {t("solo.levelProgress", getSoloLevelProgress(room?.levelIndex ?? 0, room?.soloDifficulty ?? "default"))}
                      </p>
                    )}
                    <div className="game-start-ring">
                      <span className="game-start-number">{room.startCountdown}</span>
                    </div>
                    <p className="game-start-label">{t("game.startingLabel")}</p>
                  </div>
                )}
              </div>
            )}

            {reshuffling && (
              <div className="reshuffle-modal">
                <div className="reshuffle-modal-card">
                  <p>{t("game.reshuffleModal")}</p>
                  <span>{t("game.reshuffleCountdown", { count: room.reshuffleCountdown })}</span>
                </div>
              </div>
            )}

            {isTestMode() && room.phase === "game" && (
              <button
                className="smoke-test-btn"
                type="button"
                title="测试烟雾弹"
                onClick={() => {
                  setSmokeFading(false);
                  setSmokeEffect({ token: `test:${Date.now()}` });
                }}
              >
                😶‍🌫️
              </button>
            )}

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

            {isTestMode() && room.phase === "game" && (
              <button
                className="fever-test-btn"
                type="button"
                title="测试 FEVER TIME"
                onClick={() => send("trigger_fever")}
              >
                🔥
              </button>
            )}
          </section>
        )}

        {room && room.phase === "results" && (
          <section className="panel result-panel">
            <div className="results-shell">
              <div className="results-header">
                <img className="results-logo" src="/img/homelogo.png" alt={t("app.title")} />
              </div>
              {resultsRanking[0] && (
                <article className="results-champion-card">
                  <div className="results-champion-badge">#1</div>
                  <img
                    className="avatar-image results-champion-avatar"
                    src={getAvatarUrl(resultsRanking[0].avatarSeed)}
                    alt={resultsRanking[0].nickname}
                  />
                  <div className="results-champion-meta">
                    <strong>{resultsRanking[0].nickname}</strong>
                    <div className="results-pill-row">
                      <span className="results-stat-pill">{t("results.points", { score: resultsRanking[0].score })}</span>
                      <span className="results-stat-pill combo">{t("results.maxCombo", { count: resultsRanking[0].maxCombo ?? 0 })}</span>
                      {room?.code === "SOLO" && (
                        <span className="results-stat-pill rank">
                          {room?.soloLeaderboardRank != null
                            ? t("leaderboard.resultRank", { rank: room.soloLeaderboardRank })
                            : t("leaderboard.submitting")}
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              )}
              <div className="rank-list">
                {resultsRanking.slice(1).map((player, index) => {
                  const rank = index + 2;
                  return (
                  <article className={`rank-card${player.id === playerId ? " mine" : ""}`} key={player.id}>
                    <div className="rank-card-leading">
                      <span className={`rank-badge rank-${rank}`}>#{rank}</span>
                      <img className="avatar-image results-avatar" src={getAvatarUrl(player.avatarSeed)} alt={player.nickname} />
                      <div className="rank-card-meta">
                        <strong>{player.nickname}{player.id === playerId ? `（${t("you")}）` : ""}</strong>
                        {player.id === room.hostId && <span>{t("lobby.host")}</span>}
                        </div>
                      </div>
                    <div className="results-pill-row compact">
                      <span className="results-stat-pill">{t("results.points", { score: player.score })}</span>
                      <span className="results-stat-pill combo">{t("results.maxCombo", { count: player.maxCombo ?? 0 })}</span>
                    </div>
                  </article>
                  );
                })}
              </div>
              {room?.code === "SOLO" && (
                <div className="results-actions">
                  <button
                    className="primary-btn play-again-btn"
                    onClick={async () => {
                      const soloPlayer = room?.players?.find((p) => p.id === playerId);
                      const currentSoloDifficulty = room?.soloDifficulty ?? soloDifficulty;
                      const nextIdx = nextSoloLevelIndex(room?.levelIndex ?? soloLevelIdx, currentSoloDifficulty, soloLevelPick);
                      try {
                        await startSoloSession(
                          soloPlayer?.nickname ?? nickname,
                          soloPlayer?.avatarSeed ?? avatarSeed,
                          currentSoloDifficulty,
                          nextIdx
                        );
                        setMatchReveal(null);
                        setError(null);
                      } catch (requestError) {
                        if (requestError?.message?.startsWith("error.")) {
                          setError(createMessage(requestError.message));
                        } else {
                          setError(createMessage("error.serverNotReady"));
                        }
                      }
                    }}
                  >
                    {t("results.playAgain")}
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {showGlobalError && <p className="error-banner">{formatMessage(error)}</p>}

        {avatarModalOpen && (
          <div className="avatar-modal-backdrop" onClick={() => setAvatarModalOpen(false)}>
            <section className="avatar-modal" onClick={(event) => event.stopPropagation()}>
              <div className="avatar-modal-header">
                <h3>{t("lobby.avatarTitle")}</h3>
                <img
                  className="avatar-image avatar-modal-current"
                  src={getAvatarUrl(currentPlayer?.avatarSeed ?? avatarSeed)}
                  alt={currentPlayer?.nickname ?? t("lobby.editAvatar")}
                />
              </div>
              <div className="avatar-grid">
                {avatarOptions.map((seed) => (
                  <button
                    key={seed}
                    type="button"
                    className={`avatar-option${normalizeAvatarSeed(seed) === normalizeAvatarSeed(currentPlayer?.avatarSeed ?? avatarSeed) ? " selected" : ""}`}
                    onClick={() => onChooseAvatar(seed)}
                  >
                    <img className="avatar-image" src={getAvatarUrl(seed)} alt={seed} />
                  </button>
                ))}
              </div>
              <button type="button" className="secondary-btn avatar-refresh-btn" onClick={refreshAvatarOptions}>
                {t("lobby.avatarRefresh")}
              </button>
            </section>
          </div>
        )}
        {how2playModalOpen && (
          <div className="how2play-modal-backdrop" onClick={() => setHow2playModalOpen(false)}>
            <div className="how2play-modal" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="how2play-modal-close"
                onClick={() => setHow2playModalOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
              <img className="how2play-image" src="/img/how2play.jpg" alt={t("home.how2play")} />
            </div>
          </div>
        )}
        {leaderboardOpen && (
          <div className="how2play-modal-backdrop" onClick={() => setLeaderboardOpen(false)}>
            <div className="how2play-modal leaderboard-modal" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="how2play-modal-close"
                onClick={() => setLeaderboardOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
              <div className="leaderboard-header">
                <h3>{t("leaderboard.title")}</h3>
              </div>
              <div className="leaderboard-list">
                {leaderboardLoading && <p className="leaderboard-empty">{t("leaderboard.loading")}</p>}
                {!leaderboardLoading && leaderboardEntries.length === 0 && <p className="leaderboard-empty">{t("leaderboard.empty")}</p>}
                {!leaderboardLoading &&
                  leaderboardEntries.map((entry) => (
                    <article className="leaderboard-row" key={`${entry.rank}-${entry.nickname}-${entry.score}`}>
                      <div className="leaderboard-row-leading">
                        <span className="leaderboard-rank">#{entry.rank}</span>
                        <img className="avatar-image leaderboard-avatar" src={getAvatarUrl(entry.avatarSeed)} alt={entry.nickname} />
                        <strong>{entry.nickname}</strong>
                      </div>
                      <span className="results-stat-pill">{t("results.points", { score: entry.score })}</span>
                    </article>
                  ))}
              </div>
            </div>
          </div>
        )}
        {creditsOpen && (
          <div className="how2play-modal-backdrop" onClick={() => setCreditsOpen(false)}>
            <div className="how2play-modal credits-modal" onClick={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="how2play-modal-close"
                onClick={() => setCreditsOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
              <div className="leaderboard-header">
                <h3>{t("home.credits")}</h3>
              </div>
              <div className="credits-list">
                <p className="credits-name">YAN Rong Kang</p>
                <p className="credits-name">QIN Ling Yun</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
