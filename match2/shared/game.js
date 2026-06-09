export const ROWS = 6;
export const COLS = 8;
export const LAYERS = 3;
export const SCORE_PER_MATCH = 100;
const LAYER_INSETS = [0, 1, 2];

const TILE_TYPES = [
  { key: "cat", icon: "🐱" },
  { key: "dog", icon: "🐶" },
  { key: "fox", icon: "🦊" },
  { key: "panda", icon: "🐼" },
  { key: "frog", icon: "🐸" },
  { key: "tiger", icon: "🐯" },
  { key: "bear", icon: "🐻" },
  { key: "rabbit", icon: "🐰" },
  { key: "koala", icon: "🐨" },
  { key: "monkey", icon: "🐵" },
  { key: "lion", icon: "🦁" },
  { key: "pig", icon: "🐷" },
  { key: "cow", icon: "🐮" },
  { key: "mouse", icon: "🐭" },
  { key: "chick", icon: "🐥" },
  { key: "wolf", icon: "🐺" }
];

function createRng(seed = Date.now()) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function shuffle(items, random) {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function topTile(cell) {
  return cell.length > 0 ? cell[cell.length - 1] : null;
}

function isCellEmpty(cell) {
  return !cell || cell.length === 0;
}

function visibleBoard(board) {
  return board.map((row) => row.map((cell) => topTile(cell)));
}

function layerBoard(board, layerDepth) {
  return board.map((row) =>
    row.map((cell) => {
      if (!Array.isArray(cell)) return null;
      return cell.length >= layerDepth ? cell[layerDepth - 1] : null;
    })
  );
}

function compressPath(points) {
  if (points.length <= 2) return points;
  const compact = [points[0]];
  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const sameRow = prev.row === current.row && current.row === next.row;
    const sameCol = prev.col === current.col && current.col === next.col;
    if (!sameRow && !sameCol) compact.push(current);
  }
  compact.push(points[points.length - 1]);
  return compact;
}

function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => []));
}

function createHeightMap() {
  const heights = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

  for (let layer = 0; layer < LAYERS; layer += 1) {
    const inset = LAYER_INSETS[layer] ?? layer;
    const rowStart = inset;
    const rowEnd = ROWS - inset;
    const colStart = inset;
    const colEnd = COLS - inset;

    for (let row = rowStart; row < rowEnd; row += 1) {
      for (let col = colStart; col < colEnd; col += 1) {
        heights[row][col] += 1;
      }
    }
  }

  return heights;
}

function countHeightMapTiles(heights) {
  return heights.flat().reduce((sum, height) => sum + height, 0);
}

function generateTiles(heights) {
  const pairCount = countHeightMapTiles(heights) / 2;
  const tiles = [];
  for (let index = 0; index < pairCount; index += 1) {
    const tileType = TILE_TYPES[index % TILE_TYPES.length];
    tiles.push(
      { id: `tile-${index}-a`, type: tileType.key, icon: tileType.icon },
      { id: `tile-${index}-b`, type: tileType.key, icon: tileType.icon }
    );
  }
  return tiles;
}

function stackHeights(board) {
  return board.map((row) => row.map((cell) => cell.length));
}

function refillBoardWithHeights(tiles, heights, random) {
  const shuffled = shuffle(tiles, random);
  const board = createEmptyBoard();
  let cursor = 0;
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const height = heights[row][col];
      board[row][col] = shuffled.slice(cursor, cursor + height);
      cursor += height;
    }
  }
  return board;
}

export function getTopTile(board, row, col) {
  return topTile(board[row]?.[col] ?? []);
}

export function getCellDepth(board, row, col) {
  return board[row]?.[col]?.length ?? 0;
}

function normalizeBlockedLayers(...depths) {
  return [...new Set(depths.filter((depth) => Number.isInteger(depth) && depth > 0))].sort((a, b) => a - b);
}

function buildBlockedSurface(board, blockedLayers) {
  return board.map((row) =>
    row.map((cell) => {
      if (!Array.isArray(cell) || cell.length === 0) return null;
      for (const layerDepth of blockedLayers) {
        if (cell.length >= layerDepth) return cell[layerDepth - 1];
      }
      return null;
    })
  );
}

function buildRouteContext(board, start, end, blockedLayers = [1]) {
  const surface = buildBlockedSurface(board, blockedLayers);
  const occupied = Array.from({ length: ROWS + 2 }, () => Array(COLS + 2).fill(false));

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (!surface[row][col]) continue;
      occupied[row + 1][col + 1] = true;
    }
  }

  const from = { row: start.row + 1, col: start.col + 1 };
  const to = { row: end.row + 1, col: end.col + 1 };
  occupied[from.row][from.col] = false;
  occupied[to.row][to.col] = false;

  function toBoardPoint(point) {
    return { row: point.row - 1, col: point.col - 1 };
  }

  function isClearLine(a, b) {
    if (a.row === b.row) {
      const [startCol, endCol] = a.col < b.col ? [a.col, b.col] : [b.col, a.col];
      for (let col = startCol + 1; col < endCol; col += 1) {
        if (occupied[a.row][col]) return false;
      }
      return true;
    }

    if (a.col === b.col) {
      const [startRow, endRow] = a.row < b.row ? [a.row, b.row] : [b.row, a.row];
      for (let row = startRow + 1; row < endRow; row += 1) {
        if (occupied[row][a.col]) return false;
      }
      return true;
    }

    return false;
  }

  function isEmptyPoint(point) {
    return !occupied[point.row][point.col];
  }

  return { surface, occupied, from, to, toBoardPoint, isClearLine, isEmptyPoint };
}

function findGridLinePath(board, start, end, blockedLayers = [1]) {
  if (!start || !end) return null;
  if (start.row === end.row && start.col === end.col) return null;

  const surface = buildBlockedSurface(board, blockedLayers);
  const routeRows = ROWS + 2;
  const routeCols = COLS + 2;
  const blocked = Array.from({ length: routeRows }, () => Array(routeCols).fill(false));

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (!surface[row][col]) continue;
      blocked[row + 1][col + 1] = true;
    }
  }

  const from = { row: start.row + 1, col: start.col + 1 };
  const to = { row: end.row + 1, col: end.col + 1 };
  blocked[from.row][from.col] = false;
  blocked[to.row][to.col] = false;

  const directions = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 }
  ];
  const queue = [];
  const visited = new Set();

  function inside(row, col) {
    return row >= 0 && row < routeRows && col >= 0 && col < routeCols;
  }

  function key(row, col, dir, turns) {
    return `${row}:${col}:${dir}:${turns}`;
  }

  for (let dir = 0; dir < directions.length; dir += 1) {
    const nextRow = from.row + directions[dir].row;
    const nextCol = from.col + directions[dir].col;
    if (!inside(nextRow, nextCol) || blocked[nextRow][nextCol]) continue;
    queue.push({
      row: nextRow,
      col: nextCol,
      dir,
      turns: 0,
      path: [from, { row: nextRow, col: nextCol }]
    });
    visited.add(key(nextRow, nextCol, dir, 0));
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (current.row === to.row && current.col === to.col) {
      return compressPath(
        current.path.map((point) => ({
          row: point.row - 1,
          col: point.col - 1
        }))
      );
    }

    for (let dir = 0; dir < directions.length; dir += 1) {
      const turns = current.turns + (dir === current.dir ? 0 : 1);
      if (turns > 2) continue;

      const nextRow = current.row + directions[dir].row;
      const nextCol = current.col + directions[dir].col;
      if (!inside(nextRow, nextCol) || blocked[nextRow][nextCol]) continue;

      const stateKey = key(nextRow, nextCol, dir, turns);
      if (visited.has(stateKey)) continue;
      visited.add(stateKey);
      queue.push({
        row: nextRow,
        col: nextCol,
        dir,
        turns,
        path: [...current.path, { row: nextRow, col: nextCol }]
      });
    }
  }

  return null;
}

export function getRouteDebugPaths(board, start, end, blockedLayers = [1]) {
  if (!start || !end) return [];
  if (start.row === end.row && start.col === end.col) return [];

  const normalizedLayers = Array.isArray(blockedLayers)
    ? normalizeBlockedLayers(...blockedLayers)
    : normalizeBlockedLayers(blockedLayers);
  const bfsPath = findGridLinePath(board, start, end, normalizedLayers);
  if (bfsPath) {
    return [{
      kind: "grid-search",
      valid: true,
      path: bfsPath,
      blockedLayers: normalizedLayers
    }];
  }

  return [];
}

export function getRouteDebugPathsAcrossLayers(board, start, end, firstDepth, secondDepth) {
  const blockedLayers = normalizeBlockedLayers(firstDepth, secondDepth);
  const label = blockedLayers.join("-");
  return getRouteDebugPaths(board, start, end, blockedLayers).map((entry) => ({
    ...entry,
    blockedLayers,
    kind: `${entry.kind}-layers-${label}`
  }));
}

export function findPath(board, start, end, blockedLayers = [1]) {
  if (start.row === end.row && start.col === end.col) return null;

  const normalizedLayers = Array.isArray(blockedLayers)
    ? normalizeBlockedLayers(...blockedLayers)
    : normalizeBlockedLayers(blockedLayers);
  const gridPath = findGridLinePath(board, start, end, normalizedLayers);
  if (gridPath) return gridPath;

  const candidates = getRouteDebugPaths(board, start, end, normalizedLayers);
  const matched = candidates.find((candidate) => candidate.valid);
  if (matched) {
    return matched.path;
  }

  return null;
}

export function hasAnyMoves(board) {
  const positions = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const tile = topTile(board[row][col]);
      if (tile) {
        positions.push({
          row,
          col,
          type: tile.type,
          depth: getCellDepth(board, row, col)
        });
      }
    }
  }

  for (let i = 0; i < positions.length; i += 1) {
    for (let j = i + 1; j < positions.length; j += 1) {
      if (positions[i].type !== positions[j].type) continue;
      const blockedLayers = normalizeBlockedLayers(positions[i].depth, positions[j].depth);
      if (findPath(board, positions[i], positions[j], blockedLayers)) return true;
    }
  }

  return false;
}

export function countRemainingTiles(board) {
  return board.flat().reduce((sum, cell) => sum + cell.length, 0);
}

export function createBoard(seed = Date.now()) {
  const random = createRng(seed);
  const heights = createHeightMap();
  const tiles = generateTiles(heights);
  let attempt = 0;

  while (attempt < 100) {
    const board = refillBoardWithHeights(tiles, heights, random);
    if (hasAnyMoves(board)) return board;
    attempt += 1;
  }

  throw new Error("无法生成可消除的棋盘");
}

export function reshuffleBoard(board, seed = Date.now()) {
  const random = createRng(seed);
  const heights = stackHeights(board);
  const tiles = board.flat().flat();
  let attempt = 0;

  while (attempt < 100) {
    const nextBoard = refillBoardWithHeights(tiles, heights, random);
    if (countRemainingTiles(nextBoard) === 0 || hasAnyMoves(nextBoard)) return nextBoard;
    attempt += 1;
  }

  return board;
}

export function isValidSelection(board, first, second) {
  if (!first || !second) return { ok: false, reason: "请选择两张牌" };
  const firstTile = getTopTile(board, first.row, first.col);
  const secondTile = getTopTile(board, second.row, second.col);
  const firstDepth = getCellDepth(board, first.row, first.col);
  const secondDepth = getCellDepth(board, second.row, second.col);

  if (!firstTile || !secondTile) return { ok: false, reason: "目标牌不存在" };
  if (first.row === second.row && first.col === second.col) {
    return { ok: false, reason: "不能选择同一张牌" };
  }
  if (firstTile.type !== secondTile.type) return { ok: false, reason: "图案不一致" };

  const blockedLayers = normalizeBlockedLayers(firstDepth, secondDepth);
  const path = findPath(board, first, second, blockedLayers);

  if (!path) return { ok: false, reason: "当前无法连通" };

  return { ok: true, path, tile: firstTile };
}

export function removePair(board, first, second) {
  const nextBoard = board.map((row) => row.map((cell) => [...cell]));
  nextBoard[first.row][first.col].pop();
  nextBoard[second.row][second.col].pop();
  return nextBoard;
}

export function isPositionSelectable(board, position) {
  return Boolean(getTopTile(board, position.row, position.col));
}

export function getVisibleBoard(board) {
  return visibleBoard(board);
}

export function isBoardCleared(board) {
  return board.flat().every((cell) => isCellEmpty(cell));
}
