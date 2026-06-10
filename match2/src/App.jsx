import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  COLS,
  ROWS,
  SCORE_PER_MATCH,
  countRemainingTiles,
  createBoard,
  isBoardCleared,
  isValidSelection,
  removePair
} from "@shared/game.js";
import {
  SUPPORTED_LANGUAGES,
  createMessage,
  loadPreferredLanguage,
  resolveText,
  savePreferredLanguage,
  translate
} from "./i18n.js";

const AVATAR_STORAGE_KEY = "match2-avatar-seed";
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

function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => []));
}

function createTile(id, type, icon) {
  return { id, type, icon };
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

function createSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const port = window.location.port === "5173" ? "3001" : window.location.port;
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

function App() {
  const previewMode = isBoardPreviewMode();
  const previewRuleMode = previewMode === "rule-test";
  const previewBoardMode = previewMode === "board";
  const [language, setLanguage] = useState(() => loadPreferredLanguage());
  const socketRef = useRef(null);
  const boardRef = useRef(null);
  const [nickname, setNickname] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [avatarSeed, setAvatarSeed] = useState(() => loadPreferredAvatarSeed());
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [avatarOptions, setAvatarOptions] = useState(() => createAvatarBatch());
  const [playerId, setPlayerId] = useState(previewMode ? "preview-player" : "");
  const [room, setRoom] = useState(() =>
    previewRuleMode ? createLayerRuleTestRoom(loadPreferredLanguage()) : previewBoardMode ? createPreviewRoom(loadPreferredLanguage()) : null
  );
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(previewMode ? createMessage("status.preview") : createMessage("status.connecting"));
  const [activePath, setActivePath] = useState(null);
  const [comboPopup, setComboPopup] = useState(null);
  const [copiedRoomCode, setCopiedRoomCode] = useState(false);
  const playerCardRefs = useRef(new Map());
  const previousPlayerPositionsRef = useRef(new Map());
  const previousRankingOrderRef = useRef(new Map());
  const lastComboTokenRef = useRef("");
  const mySelection = room?.you?.selection;
  const reshuffling = Boolean(room?.reshuffleCountdown);

  useEffect(() => {
    savePreferredLanguage(language);
  }, [language]);

  useEffect(() => {
    savePreferredAvatarSeed(avatarSeed);
  }, [avatarSeed]);

  useEffect(() => {
    if (room?.phase !== "lobby" && avatarModalOpen) {
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
  }, [previewMode, room]);

  useEffect(() => {
    if (previewMode) return undefined;

    const socket = new WebSocket(createSocketUrl());
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setStatus(createMessage("status.connected"));
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "connected") {
        setPlayerId(message.payload.playerId);
      }
      if (message.type === "room_state") {
        setRoom(message.payload);
        setError(null);
      }
      if (message.type === "error") {
        setError(message.payload.message);
      }
    });

    socket.addEventListener("close", () => {
      setStatus(createMessage("status.disconnected"));
    });

    return () => socket.close();
  }, [previewMode]);

  useEffect(() => {
    if (!room?.lastMatch?.path || room.phase !== "game") return undefined;
    const frame = window.requestAnimationFrame(() => {
      setActivePath(buildOverlayPolyline(room.lastMatch.path, boardRef.current));
    });
    const timer = window.setTimeout(() => setActivePath(null), 900);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [room?.phase, boardRef, getPathSignature(room?.lastMatch)]);

  useEffect(() => {
    const combo = room?.lastCombo;
    if (!combo?.token || combo.count < 2) return undefined;
    if (combo.token === lastComboTokenRef.current) return undefined;

    lastComboTokenRef.current = combo.token;
    setComboPopup({ count: combo.count, by: combo.by, token: combo.token });
    const timer = window.setTimeout(() => {
      setComboPopup((current) => (current?.token === combo.token ? null : current));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [room?.lastCombo]);

  const ranking = useMemo(() => sortRanking(room?.players ?? [], previousRankingOrderRef.current), [room?.players]);
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

  function send(type, payload) {
    if (previewMode) {
      setError(createMessage("error.previewOffline"));
      return;
    }
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setError(createMessage("error.serverNotReady"));
      return;
    }
    socketRef.current.send(JSON.stringify({ type, payload }));
  }

  function onCreateRoom() {
    send("create_room", { nickname, avatarSeed });
  }

  function onJoinRoom() {
    send("join_room", { nickname, code: joinCode, avatarSeed });
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
    if (previewMode) {
      setRoom((currentRoom) => {
        if (!currentRoom || currentRoom.phase !== "game" || currentRoom.reshuffleCountdown) return currentRoom;

        const current = currentRoom.you?.selection;
        const nextPosition = { row, col };

        if (!current) {
          return {
            ...currentRoom,
            message: createMessage("preview.firstSelected"),
            you: { ...currentRoom.you, selection: nextPosition }
          };
        }

        if (current.row === row && current.col === col) {
          return {
            ...currentRoom,
            message: createMessage("preview.selectionCanceled"),
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
        const nextPlayers = currentRoom.players.map((player) =>
          player.id === playerId ? { ...player, score: player.score + SCORE_PER_MATCH } : player
        );

        return {
          ...currentRoom,
          board: nextBoard,
          players: nextPlayers,
          remainingTiles: countRemainingTiles(nextBoard),
          message: createMessage("preview.matchSuccess"),
          lastMatch: {
            by: playerId,
            pair: [current, nextPosition],
            path: result.path,
            tile: result.tile
          },
          phase: isBoardCleared(nextBoard) ? "results" : "game",
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
    if (previewMode) {
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
    setActivePath(null);
    setError(null);
  }

  function loadRulePreviewBoard() {
    if (!previewMode) return;
    setRoom(createLayerRuleTestRoom(language));
    setActivePath(null);
    setError(null);
  }

  const canInteract = room?.phase === "game" && !reshuffling;
  const boardRows = Array.isArray(room?.board) ? room.board : [];
  const hasRenderableBoard = boardRows.length > 0;
  const homeErrorTarget = !room ? getHomeErrorTarget(error) : null;
  const showGlobalError = Boolean(error) && !homeErrorTarget;
  const connectionTone = getConnectionTone(status);
  const currentPlayer = room?.players?.find((player) => player.id === playerId) ?? null;

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
              <label className="field home-inline-field language-field">
                <span>{t("language.label")}</span>
                <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                  {SUPPORTED_LANGUAGES.map((option) => (
                    <option key={option} value={option}>
                      {t(`language.${option}`)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="home-inline-action-row">
                <label className={`field home-inline-field nickname-field${homeErrorTarget === "nickname" ? " has-bubble" : ""}`}>
                  <span>{t("home.nicknameLabel")}</span>
                  <input
                    value={nickname}
                    onChange={(event) => {
                      setNickname(event.target.value);
                      if (homeErrorTarget === "nickname") setError(null);
                    }}
                    maxLength={12}
                    placeholder={t("home.nicknamePlaceholder")}
                  />
                  {homeErrorTarget === "nickname" && <p className="field-bubble">{formatMessage(error)}</p>}
                </label>
                <div className="home-actions home-actions-stack create-room-actions">
                  <button className="primary-btn" onClick={onCreateRoom}>
                    {t("home.create")}
                  </button>
                </div>
              </div>
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
                <button className="secondary-btn join-btn" onClick={onJoinRoom}>
                  {t("home.join")}
                </button>
              </div>
            </section>
          </section>
        )}

        {room && room.phase !== "game" && (
          <header className="hero">
            <div>
              {room.phase === "lobby" ? (
                <img className="lobby-logo" src="/img/homelogo.png" alt={t("app.title")} />
              ) : (
                <>
                  <p className="eyebrow">{t("app.eyebrow")}</p>
                  <h1>{t("app.title")}</h1>
                </>
              )}
            </div>
            {room.phase !== "lobby" && <p className="status">{formatMessage(status)}</p>}
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
                    <strong>{player.nickname}</strong>
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

        {room && room.phase === "game" && (
          <section className="panel game-panel">
            <div className="game-topbar">
              <img className="game-top-logo" src="/img/homelogo.png" alt={t("app.title")} />
              <div className="pill-row">
                <span className="info-pill count-pill">{t("game.countPill", { count: room.removablePairs ?? 0 })}</span>
                {reshuffling && <span className="info-pill warning">{t("game.reshuffleCountdown", { count: room.reshuffleCountdown })}</span>}
              </div>
            </div>

            <div className="game-main">
              <aside className="players-panel">
                <div className="players-column">
                  {ranking.map((player, index) => (
                    <article
                      className={`player-card${player.id === playerId ? " mine" : ""}`}
                      key={player.id}
                      ref={(element) => {
                        if (element) {
                          playerCardRefs.current.set(player.id, element);
                        } else {
                          playerCardRefs.current.delete(player.id);
                        }
                      }}
                    >
                      <div className="player-avatar">
                        {player.avatarSeed ? (
                          <img className="avatar-image" src={getAvatarUrl(player.avatarSeed)} alt={player.nickname} />
                        ) : (
                          <span>{getAvatarLabel(player.nickname)}</span>
                        )}
                      </div>
                      <div className="player-meta">
                        <strong>{player.nickname}</strong>
                        <span>{player.id === room.hostId ? t("lobby.host") : `${t("lobby.player")} ${index + 1}`}</span>
                      </div>
                      <div className="player-score">{player.score}</div>
                    </article>
                  ))}
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
                              style={{ zIndex: isSelected ? 50 : rowIndex + 1 }}
                              disabled={isEmpty || !canInteract}
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
                                  const selectedStyle =
                                    isTopLayer && isSelected
                                      ? { zIndex: normalizedStack.length + 20 }
                                      : { zIndex: layerIndex + 1 };
                                  return (
                                    <span
                                      key={tile.id ?? `${rowIndex}-${colIndex}-${layerIndex}`}
                                      className={`${visualClass}${!isTopLayer ? " buried" : ""}${isTopLayer && isSelected ? " selected" : ""}`}
                                      style={selectedStyle}
                                    >
                                      <span className="suit-icon">{tile.icon ?? "?"}</span>
                                    </span>
                                  );
                                })}
                            </button>
                          );
                        })
                      )}
                      {activePath && (
                        <svg
                          className="match-path-overlay"
                          viewBox={`0 0 ${activePath.width} ${activePath.height}`}
                          preserveAspectRatio="none"
                        >
                          <polyline
                            points={activePath.points.map((point) => `${point.x},${point.y}`).join(" ")}
                            className="match-path"
                          />
                          {activePath.points.map((point, index) => (
                            <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r="6" className="match-node" />
                          ))}
                        </svg>
                      )}
                    </div>
                  ) : (
                    <p className="board-status">{t("game.boardLoading")}</p>
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
                  className="combo-popup"
                  style={{
                    "--combo-size": `${getComboVisual(comboPopup.count).size}px`,
                    "--combo-color": getComboVisual(comboPopup.count).color
                  }}
                >
                  {t("game.comboPopup", { count: comboPopup.count })}
                </div>
              </div>
            )}
          </section>
        )}

        {room && room.phase === "results" && (
          <section className="panel result-panel">
            <div className="room-badge">{t("lobby.roomCode", { code: room.code })}</div>
            <h2>{t("results.title")}</h2>
            <p className="room-message">{formatMessage(room.message)}</p>
            <div className="rank-list">
              {sortRanking(room.players).map((player, index) => (
                <article className={`rank-card${player.id === playerId ? " mine" : ""}`} key={player.id}>
                  <span>#{index + 1}</span>
                  <strong>{player.nickname}</strong>
                  <b>{t("results.points", { score: player.score })}</b>
                </article>
              ))}
            </div>
            <button className="primary-btn" onClick={() => send("replay")}>
              {t("results.backToLobby")}
            </button>
          </section>
        )}

        {showGlobalError && <p className="error-banner">{formatMessage(error)}</p>}

        {room?.phase === "lobby" && avatarModalOpen && (
          <div className="avatar-modal-backdrop" onClick={() => setAvatarModalOpen(false)}>
            <section className="avatar-modal" onClick={(event) => event.stopPropagation()}>
              <div className="avatar-modal-header">
                <h3>{t("lobby.avatarTitle")}</h3>
                {currentPlayer && (
                  <img
                    className="avatar-image avatar-modal-current"
                    src={getAvatarUrl(currentPlayer.avatarSeed ?? avatarSeed)}
                    alt={currentPlayer.nickname}
                  />
                )}
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
      </main>
    </div>
  );
}

export default App;
