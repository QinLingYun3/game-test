## Context

Solo mode is simulated entirely on the client, while board validity rules live in `shared/game.js`. Existing item behavior already includes a quick-match item in solo mode, but there is no recovery tool for an unfavorable remaining layout besides continuing to search manually or waiting for a forced reshuffle path. The requested reshuffle item must work on the current remaining board, preserve the current run, and guarantee the reshuffled board is still playable.

## Goals / Non-Goals

**Goals:**
- Add a new solo-only reshuffle item with icon `🔄`.
- Let players trigger the item with the same double-click interaction pattern used by quick-match.
- Reshuffle only the remaining tiles on the board without resetting score, combo state, or level progress.
- Guarantee that reshuffle output has at least one valid move and does not introduce same-type vertical stacking within a cell.
- Add translated item label and description text in all supported languages.

**Non-Goals:**
- No multiplayer item-selection or server-side item protocol changes.
- No new inventory, cooldown, or usage-count system beyond the existing solo item conventions.
- No board-shape or level-config redesign outside the reshuffle validity guarantees.

## Decisions

### Decision: Implement reshuffle as a second solo-only selectable item
Solo already special-cases item behavior on the client. Adding reshuffle alongside quick-match keeps the feature local to solo mode and avoids touching multiplayer room state or item-selection flow.

Alternative considered:
- Replace quick-match with reshuffle in solo mode. Rejected because the request is additive and would remove an existing solo affordance.

### Decision: Reuse `reshuffleBoard` with stricter validity checks
The board generator and reshuffle utility already know how to redistribute remaining tiles. The reshuffle item should call into the same shared path so board constraints stay centralized.

Alternative considered:
- Create a separate reshuffle algorithm just for the item. Rejected because it would duplicate solvability and anti-deadlock rules.

### Decision: Treat reshuffle as board-state mutation only
Using reshuffle must not restart the level, regenerate from the original height map, or alter score/combo progression. The item only replaces tile placement for the current board while preserving the rest of the solo room state.

Alternative considered:
- Rebuild the full level from its original config. Rejected because the request explicitly says not to restart.

## Risks / Trade-offs

- [Reshuffle reduces predictability of solo difficulty] → Limit it to explicit player action and preserve the existing remaining tiles only.
- [Board validity constraints become harder to satisfy late in a level] → Reuse the stricter shared reshuffle checks and keep the current bounded retry loop.
- [Solo item UI becomes more conditional] → Keep the new item inside the existing solo-only item branch and reuse current double-click affordances and copy patterns.
