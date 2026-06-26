## Why

Solo mode currently ends at the local results screen and loses the player's outcome once the session ends. Adding a persistent leaderboard creates a reason to replay, gives players a shared benchmark, and surfaces rank feedback at the moment a run ends.

## What Changes

- Add a server-backed solo leaderboard that records avatar, nickname, and score when a solo player clears the run or actively exits.
- Treat each solo session as a distinct leaderboard entry even if multiple entries share the same nickname.
- Add a leaderboard entry point on the home screen next to the how-to-play link and show the top 20 results in a modal or panel.
- Show the player's leaderboard position on the solo results screen in addition to the final score.

## Capabilities

### New Capabilities
- `solo-leaderboard`: Persist solo run results on the server, expose ranked leaderboard data, and present leaderboard views and rank feedback in the client.

### Modified Capabilities
- None.

## Impact

- Affected code: `server/server.js`, `server/roomManager.js`, `src/App.jsx`, `src/i18n.js`, and related styles.
- New server-side state for leaderboard storage and ranking.
- New client UI for opening the leaderboard and rendering top-20 results and final placement.
