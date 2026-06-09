import { useEffect, useMemo, useRef, useState } from "react";
import {
  COLS,
  ROWS,
  SCORE_PER_MATCH,
  countRemainingTiles,
  createBoard,
  getTopTile,
  getCellDepth,
  getRouteDebugPathsAcrossLayers,
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

function isBoardPreviewMode() {
  return new URLSearchParams(window.location.search).get("preview");
}

function createPreviewPlayers(hostId, language) {
  return [
    { id: hostId, nickname: translate(language, "lobby.host"), score: 0 },
    { id: "preview-opponent", nickname: translate(language, "lobby.player"), score: 0 }
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

function sortRanking(players) {
  return [...players].sort((a, b) => b.score - a.score);
}

function getPathSignature(lastMatch) {
  if (!lastMatch?.path) return "";
  return `${lastMatch.by}:${lastMatch.path.map((point) => `${point.row},${point.col}`).join("|")}`;
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

function buildDebugPolylines(paths, boardElement) {
  if (!paths?.length || !boardElement) return [];
  return paths
    .map((entry) => {
      const overlay = buildOverlayPolyline(entry.path, boardElement);
      if (!overlay) return null;
      return {
        ...overlay,
        kind: entry.kind,
        valid: entry.valid
      };
    })
    .filter(Boolean);
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
  const [playerId, setPlayerId] = useState(previewMode ? "preview-player" : "");
  const [room, setRoom] = useState(() =>
    previewRuleMode ? createLayerRuleTestRoom(loadPreferredLanguage()) : previewBoardMode ? createPreviewRoom(loadPreferredLanguage()) : null
  );
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(previewMode ? createMessage("status.preview") : createMessage("status.connecting"));
  const [activePath, setActivePath] = useState(null);
  const [hoverTarget, setHoverTarget] = useState(null);
  const [debugPaths, setDebugPaths] = useState([]);
  const mySelection = room?.you?.selection;
  const reshuffling = Boolean(room?.reshuffleCountdown);

  useEffect(() => {
    savePreferredLanguage(language);
  }, [language]);

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
    if (!room?.board || room.phase !== "game" || !mySelection || !hoverTarget) {
      setDebugPaths([]);
      return;
    }

    if (mySelection.row === hoverTarget.row && mySelection.col === hoverTarget.col) {
      setDebugPaths([]);
      return;
    }

    const selectedTile = getTopTile(room.board, mySelection.row, mySelection.col);
    const hoveredTile = getTopTile(room.board, hoverTarget.row, hoverTarget.col);
    if (!selectedTile || !hoveredTile || selectedTile.type !== hoveredTile.type) {
      setDebugPaths([]);
      return;
    }

    const firstDepth = getCellDepth(room.board, mySelection.row, mySelection.col);
    const secondDepth = getCellDepth(room.board, hoverTarget.row, hoverTarget.col);
    const candidates = getRouteDebugPathsAcrossLayers(
      room.board,
      mySelection,
      hoverTarget,
      firstDepth,
      secondDepth
    );
    const frame = window.requestAnimationFrame(() => {
      setDebugPaths(buildDebugPolylines(candidates, boardRef.current));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [room?.board, room?.phase, mySelection, hoverTarget]);

  const ranking = useMemo(() => sortRanking(room?.players ?? []), [room]);
  const t = (key, params) => translate(language, key, params);
  const formatMessage = (value) => resolveText(language, value);

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
    send("create_room", { nickname });
  }

  function onJoinRoom() {
    send("join_room", { nickname, code: joinCode });
  }

  function onSelect(row, col) {
    setHoverTarget({ row, col });
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

  function onHoverTile(row, col) {
    if (!mySelection) return;
    setHoverTarget({ row, col });
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

  return (
    <div className="page-shell">
      <div className="page-backdrop" />
      <main className="app-card">
        <header className="hero">
          <div>
            <p className="eyebrow">{t("app.eyebrow")}</p>
            <h1>{t("app.title")}</h1>
          </div>
          <p className="status">{formatMessage(status)}</p>
        </header>

        {!room && (
          <section className="panel home-panel">
            <label className="field">
              <span>{t("language.label")}</span>
              <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                {SUPPORTED_LANGUAGES.map((option) => (
                  <option key={option} value={option}>
                    {t(`language.${option}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t("home.nicknameLabel")}</span>
              <input
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                maxLength={12}
                placeholder={t("home.nicknamePlaceholder")}
              />
            </label>
            <div className="home-actions">
              <button className="primary-btn" onClick={onCreateRoom}>
                {t("home.create")}
              </button>
              <label className="field inline-field">
                <span>{t("home.roomCodeLabel")}</span>
                <input
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder={t("home.roomCodePlaceholder")}
                />
              </label>
              <button className="secondary-btn" onClick={onJoinRoom}>
                {t("home.join")}
              </button>
            </div>
            <p className="tip">{t("home.tip")}</p>
          </section>
        )}

        {room && room.phase === "lobby" && (
          <section className="panel lobby-panel">
            <div className="room-badge">{t("lobby.roomCode", { code: room.code })}</div>
            <h2>{t("lobby.title")}</h2>
            <p className="room-message">{formatMessage(room.message)}</p>
            <div className="player-list">
              {room.players.map((player) => (
                <article className="player-chip" key={player.id}>
                  <strong>{player.nickname}</strong>
                  <span>{player.id === room.hostId ? t("lobby.host") : t("lobby.player")}</span>
                </article>
              ))}
              {room.players.length < 2 && <article className="player-chip empty">{t("lobby.waiting")}</article>}
            </div>
            <button className="primary-btn" disabled={!room.canStart} onClick={() => send("start_game")}>
              {t("lobby.start")}
            </button>
          </section>
        )}

        {room && room.phase === "game" && (
          <section className="panel game-panel">
            <div className="topbar">
              <div>
                <p className="room-badge">{t("game.roomCodeMoves", { code: room.code, count: room.removablePairs ?? 0 })}</p>
                <p className="room-message">{formatMessage(room.message)}</p>
                {reshuffling && <p className="room-message">{t("game.reshuffleCountdown", { count: room.reshuffleCountdown })}</p>}
              </div>
              <div className="scoreboard">
                {ranking.map((player) => (
                  <div className={`score-card${player.id === playerId ? " mine" : ""}`} key={player.id}>
                    <span>{player.nickname}</span>
                    <strong>{player.score}</strong>
                  </div>
                ))}
              </div>
            </div>

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
                          disabled={isEmpty || !canInteract}
                          onClick={() => onSelect(rowIndex, colIndex)}
                          onMouseEnter={() => onHoverTile(rowIndex, colIndex)}
                          onMouseLeave={() => setHoverTarget(null)}
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
                                  className={`${visualClass}${isTopLayer && isSelected ? " selected" : ""}`}
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
                  {debugPaths.length > 0 && (
                    <svg
                      className="match-path-overlay debug"
                      viewBox={`0 0 ${debugPaths[0].width} ${debugPaths[0].height}`}
                      preserveAspectRatio="none"
                    >
                      {debugPaths.map((pathEntry) => (
                        <g key={pathEntry.kind}>
                          <polyline
                            points={pathEntry.points.map((point) => `${point.x},${point.y}`).join(" ")}
                            className={`match-path debug-path${pathEntry.valid ? " valid" : " invalid"}`}
                          />
                        </g>
                      ))}
                    </svg>
                  )}
                </div>
              ) : (
                <p className="board-status">{t("game.boardLoading")}</p>
              )}
            </div>

            <div className="legend">
              <span>{t("game.legendSize", { rows: ROWS, cols: COLS })}</span>
              <span>{t("game.legendStack")}</span>
              <span>{t("game.legendScore")}</span>
              <span>{t("game.legendDebug")}</span>
            </div>
            {previewMode && (
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

        {error && <p className="error-banner">{formatMessage(error)}</p>}
      </main>
    </div>
  );
}

export default App;
