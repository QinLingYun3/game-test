## Why

Solo runs can still stall when the remaining board layout is poor, even if the player has already invested time into the run. A dedicated reshuffle item gives solo players a recovery tool without restarting the level, while keeping the board in a solvable state.

## What Changes

- Add a new solo-only item with icon `🔄` that reshuffles the remaining tiles on the current board instead of restarting the level.
- Allow players to trigger the reshuffle item by double-clicking it, matching the existing item interaction style.
- Guarantee that reshuffling never creates a dead board and never produces vertically stacked duplicate tiles in the same cell.
- Add item name and description copy for all supported languages.

## Capabilities

### New Capabilities
- `solo-reshuffle-item`: Covers the solo reshuffle item behavior, solvable-board guarantees after reshuffle, and player-facing item copy.

### Modified Capabilities

## Impact

- Affected code: `src/App.jsx`, `shared/game.js`, `src/i18n.js`, and any solo item UI styling/hooks.
- No API or server protocol changes are required because solo mode is locally simulated.
- Reuses existing board generation and reshuffle logic, with stricter validity rules for solo reshuffle outcomes.
