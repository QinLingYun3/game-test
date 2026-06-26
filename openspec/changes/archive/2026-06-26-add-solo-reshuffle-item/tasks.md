## 1. Shared Board Logic

- [x] 1.1 Add a reshuffle path in `shared/game.js` that can reorder the current remaining tiles without restarting the level.
- [x] 1.2 Ensure reshuffle results always preserve at least one valid move and do not create same-type stacked tiles within any cell.

## 2. Solo Item Integration

- [x] 2.1 Add the `🔄` reshuffle item to the solo item UI and wire it to the existing double-click item interaction pattern.
- [x] 2.2 Update solo room state handling so using reshuffle only mutates the current board and recalculates remaining-tile / removable-pair counts.

## 3. Copy and Verification

- [x] 3.1 Add translated item label and description text for Chinese, English, and French.
- [x] 3.2 Verify solo reshuffle does not restart the level, does not break scoring/progress state, and never leaves a dead board after use.
