## Context

The project already maintains a persistent WebSocket connection while the client is on the home screen and in play, but solo mode itself is resolved entirely on the client. There is no server-tracked identity for a solo run, no shared scoreboard, and no way to show a player where their final score stands against previous runs. The repository also has no database dependency today, so the leaderboard design should stay lightweight and fit the current Node server architecture.

## Goals / Non-Goals

**Goals:**
- Add a server-backed leaderboard for solo runs without introducing a database.
- Record solo run outcomes for completed runs and when the player closes the page or otherwise leaves the solo game view before completion.
- Treat every solo session as a unique leaderboard candidate even when nickname and avatar are reused.
- Expose a top-20 leaderboard view on the home screen.
- Return and display the submitting run's leaderboard rank on the solo results screen.

**Non-Goals:**
- Durable persistence across server restarts.
- Merging or deduplicating entries by nickname, avatar, browser, or socket.
- Changing multiplayer scoring or room ranking behavior.
- Building anti-cheat or server-authoritative solo gameplay in this change.

## Decisions

### 1. Use an in-memory server leaderboard store
The server will maintain an in-memory array of solo leaderboard entries sorted by score descending, with stable tie-breaking by submission time. This keeps implementation aligned with the current server architecture and avoids adding a database for a small feature.

Alternatives considered:
- Persist to a file: more fragile for concurrent writes and unnecessary for this repo's current runtime model.
- Add SQLite or another database: durable, but too large a dependency and migration surface for the immediate need.

### 2. Introduce a server-issued solo session id
When a player starts a solo run, the client will request a new solo session id from the server over the existing WebSocket connection. The server will track whether that session has already been finalized so the same run can only be recorded once.

Alternatives considered:
- Use nickname plus timestamp client-side only: easier to spoof and harder to guard against duplicate submissions.
- Use socket id only: insufficient because the same socket can play multiple solo runs in one browser session.

### 3. Submit leaderboard records only on finalization events
The client will submit a solo leaderboard record on two event types:
- final completion of the solo run
- page close or departure from the solo game view before completion

The server will accept the first valid finalization for a solo session id and ignore duplicates for that session. The submitted payload will include session id, nickname, avatar seed, score, and finalization reason.

Alternatives considered:
- Update the leaderboard continuously after every move: unnecessary server traffic and weaker semantics for a leaderboard.
- Record browser close or crash as guaranteed exits: not reliable enough to promise in requirements.

### 4. Return the submitting run's rank with submission acknowledgement
On leaderboard submission, the server will compute the rank of that run in the full leaderboard and return it to the client. The solo results screen will render this rank next to the final score so the player sees both local outcome and leaderboard placement immediately. Ties will use strict positional ordering based on score descending and submission order, without shared ranks or skipped numbers.

Alternatives considered:
- Require the client to fetch the whole leaderboard and derive rank locally: wasteful and fragile if only the top 20 are returned.
- Show rank only in the leaderboard modal: weaker immediate feedback after a run ends.

### 5. Expose top-20 leaderboard reads as a dedicated message
The client home screen will request leaderboard data through a dedicated WebSocket message and render the top 20 entries in a modal opened from a new “Leaderboard” link next to “How to Play”.

Alternatives considered:
- Push leaderboard state on every connection automatically: unnecessary data transfer for users who never open the modal.
- Add an HTTP endpoint alongside WebSocket: workable, but inconsistent with the app's current communication model.

## Risks / Trade-offs

- [Leaderboard resets on server restart] → Accept as an intentional limitation of the in-memory design and document it in the proposal/design.
- [Client-side solo scoring can be spoofed] → Limit scope to honest-player leaderboard behavior for now; defer server-authoritative solo validation.
- [Exit submission may be missed on abrupt tab close] → Use best-effort submission on page close and solo-view departure, and document that abrupt transport loss can still prevent recording.
- [Repeated submissions for one run] → Guard with a per-session finalized flag on the server.

## Migration Plan

1. Add server-side leaderboard/session state and message handlers behind the existing WebSocket server.
2. Add client-side solo session lifecycle: request session id at run start, finalize on completion and on page close or solo-view departure.
3. Add home-screen leaderboard modal and solo results rank display.
4. Verify that multiplayer paths remain unchanged.

Rollback is straightforward: remove the new message handlers and client UI; no persistent schema migration is involved.

## Open Questions

- None at proposal time.
