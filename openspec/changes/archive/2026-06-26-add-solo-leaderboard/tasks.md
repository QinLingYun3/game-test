## 1. Server Leaderboard State

- [x] 1.1 Add in-memory solo leaderboard storage and solo session finalization tracking in the server layer.
- [x] 1.2 Add WebSocket messages for creating a solo session, submitting a finalized solo score, and fetching the top-20 leaderboard.
- [x] 1.3 Compute stable leaderboard ordering and return the submitting session's rank while preventing duplicate submissions for the same solo session.

## 2. Solo Client Lifecycle

- [x] 2.1 Request a server-issued solo session id when a solo run starts and store it in the local solo room state.
- [x] 2.2 Finalize the solo session on successful completion and on page close or solo-view departure, then store the returned leaderboard rank for results display.
- [x] 2.3 Ensure solo leaderboard submission remains isolated from multiplayer flows and cannot submit the same solo session more than once from the client.

## 3. Leaderboard UI

- [x] 3.1 Add a leaderboard link next to the how-to-play link on the home screen and render a leaderboard modal/panel populated with the top 20 entries.
- [x] 3.2 Show avatar, nickname, score, and rank for each displayed leaderboard entry.
- [x] 3.3 Update the solo results screen to show the player's leaderboard placement alongside the final score and verify translated copy where needed.
