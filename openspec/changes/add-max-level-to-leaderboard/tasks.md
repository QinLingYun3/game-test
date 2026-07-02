## 1. Backend — Leaderboard Data Structure

- [ ] 1.1 Update `sanitizeLeaderboardEntry` in `server/server.js` to include `maxLevel` field (default `null`)
- [ ] 1.2 Update `getLeaderboardPayload` in `server/server.js` to include `maxLevel` in the response
- [ ] 1.3 Update `submitSoloScore` in `server/server.js` to accept `maxLevel` parameter
- [ ] 1.4 Implement "only new record" logic: update `maxLevel` only if new value > existing value for same session

## 2. Backend — WebSocket Protocol

- [ ] 2.1 Update `submit_solo_score` message handler to extract `maxLevel` from payload
- [ ] 2.2 Pass `maxLevel` to `submitSoloScore` function

## 3. Frontend — Score Submission

- [ ] 3.1 Update `getSoloSubmissionPayload` in `src/App.jsx` to include `maxLevel` when in campaign mode
- [ ] 3.2 Ensure `maxLevel` is only sent when `soloDifficulty === "default"`

## 4. Frontend — Leaderboard UI

- [ ] 4.1 Update leaderboard row rendering to display `maxLevel` when present
- [ ] 4.2 Add i18n translations for max level label in zh/en/fr
- [ ] 4.3 Style the max level display in leaderboard rows

## 5. Verification

- [ ] 5.1 Verify build passes
- [ ] 5.2 Verify existing tests pass
- [ ] 5.3 Test campaign mode submits max level correctly
- [ ] 5.4 Test non-campaign mode does not submit max level
- [ ] 5.5 Test leaderboard UI shows max level only when present
- [ ] 5.6 Test backward compatibility with old leaderboard data
