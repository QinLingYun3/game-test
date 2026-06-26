import test from "node:test";
import assert from "node:assert/strict";
import { countRemovablePairs, findPath, hasAnyMoves, isValidSelection, reshuffleBoard } from "./game.js";

const TEST_ROWS = 10;
const TEST_COLS = 10;

function emptyBoard() {
  return Array.from({ length: TEST_ROWS }, () => Array.from({ length: TEST_COLS }, () => []));
}

function tile(id, type) {
  return { id, type, icon: type };
}

test("same-layer tiles can connect through lower-layer tiles", () => {
  const board = emptyBoard();
  board[1][5] = [tile("left-base", "base"), tile("left-mid", "mid"), tile("left-top", "bear")];
  board[1][6] = [tile("middle-base", "base"), tile("middle-mid", "monkey")];
  board[1][7] = [tile("right-base", "base"), tile("right-mid", "mid"), tile("right-top", "bear")];

  const first = { row: 1, col: 5 };
  const second = { row: 1, col: 7 };

  assert.deepEqual(findPath(board, first, second, 3), [first, second]);
  assert.equal(isValidSelection(board, first, second).ok, true);
});

test("same-layer blocker forces the path away from the occupied cell", () => {
  const board = emptyBoard();
  board[1][5] = [tile("left-base", "base"), tile("left-mid", "mid"), tile("left-top", "bear")];
  board[1][6] = [tile("middle-base", "base"), tile("middle-mid", "mid"), tile("middle-top", "blocker")];
  board[1][7] = [tile("right-base", "base"), tile("right-mid", "mid"), tile("right-top", "bear")];

  const path = findPath(board, { row: 1, col: 5 }, { row: 1, col: 7 }, 3);
  assert.notDeepEqual(path, [
    { row: 1, col: 5 },
    { row: 1, col: 7 }
  ]);
});

test("tiles can connect through transparent outer helper tiles", () => {
  const board = Array.from({ length: TEST_ROWS }, (_, row) =>
    Array.from({ length: TEST_COLS }, (_, col) => [tile(`block-${row}-${col}`, "blocker")])
  );
  board[0][0] = [tile("left", "dog")];
  board[0][2] = [tile("right", "dog")];

  assert.equal(isValidSelection(board, { row: 0, col: 0 }, { row: 0, col: 2 }).ok, true);
});

test("path is blocked by any tile on either endpoint layer", () => {
  const board = emptyBoard();
  board[2][1] = [tile("left-base", "base"), tile("left-mid", "mid"), tile("left-top", "dog")];
  board[2][3] = [tile("right-base", "base"), tile("right-mid", "dog")];
  board[2][2] = [tile("block-base", "base"), tile("block-mid", "frog")];
  board[1][1] = [tile("up-left-base", "base"), tile("up-left-mid", "seal")];
  board[1][2] = [tile("up-mid-base", "base"), tile("up-mid-mid", "seal")];
  board[1][3] = [tile("up-right-base", "base"), tile("up-right-mid", "seal")];
  board[3][1] = [tile("down-left-base", "base"), tile("down-left-mid", "seal")];
  board[3][2] = [tile("down-mid-base", "base"), tile("down-mid-mid", "seal")];
  board[3][3] = [tile("down-right-base", "base"), tile("down-right-mid", "seal")];

  assert.equal(isValidSelection(board, { row: 2, col: 1 }, { row: 2, col: 3 }).ok, false);
});

test("reshuffle keeps the board playable when moves exist after refresh", () => {
  const board = emptyBoard();
  board[0][0] = [tile("a1", "dog")];
  board[0][1] = [tile("a2", "cat")];
  board[1][0] = [tile("a3", "cat")];
  board[1][1] = [tile("a4", "dog")];

  const nextBoard = reshuffleBoard(board, 12345);
  assert.equal(hasAnyMoves(nextBoard), true);
});

test("countRemovablePairs reports available matches", () => {
  const board = emptyBoard();
  board[0][0] = [tile("left", "dog")];
  board[0][1] = [tile("right", "dog")];

  assert.equal(countRemovablePairs(board), 1);
});

test("path is blocked by buried tiles on the same endpoint layer", () => {
  const board = emptyBoard();
  board[2][2] = [tile("left-base", "base"), tile("left-mid", "mid"), tile("left-top", "rabbit")];
  board[2][4] = [tile("right-base", "base"), tile("right-mid", "rabbit")];
  board[2][3] = [tile("block-base", "base"), tile("block-mid", "dog")];
  board[1][2] = [tile("up-left-base", "base"), tile("up-left-mid", "seal"), tile("up-left-top", "cap")];
  board[1][3] = [tile("up-mid-base", "base"), tile("up-mid-mid", "seal"), tile("up-mid-top", "cap")];
  board[1][4] = [tile("up-right-base", "base"), tile("up-right-mid", "seal"), tile("up-right-top", "cap")];
  board[3][2] = [tile("down-left-base", "base"), tile("down-left-mid", "seal"), tile("down-left-top", "cap")];
  board[3][3] = [tile("down-mid-base", "base"), tile("down-mid-mid", "seal"), tile("down-mid-top", "cap")];
  board[3][4] = [tile("down-right-base", "base"), tile("down-right-mid", "seal"), tile("down-right-top", "cap")];

  assert.equal(isValidSelection(board, { row: 2, col: 2 }, { row: 2, col: 4 }).ok, false);
});
