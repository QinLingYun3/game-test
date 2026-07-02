## 1. Backend — Time Period Filtering

- [x] 1.1 Add `getPeriodStart(period)` helper in `server/server.js` to compute start timestamp for daily/weekly/monthly
- [x] 1.2 Update `getLeaderboardPayload(period = "all")` to accept period parameter and filter entries by `submittedAt >= periodStart`
- [x] 1.3 Update `get_leaderboard` WebSocket handler to read `payload?.period` and pass it to `getLeaderboardPayload`
- [x] 1.4 Validate period parameter — fallback to `"all"` for invalid values

## 2. Frontend — Tab UI

- [x] 2.1 Add `leaderboardPeriod` state (default `"daily"`) in `src/App.jsx`
- [x] 2.2 Add Tab bar component inside leaderboard modal with 4 tabs: 日榜 / 周榜 / 月榜 / 总榜
- [x] 2.3 Update `loadLeaderboard()` to accept `period` parameter and send it in `get_leaderboard` request
- [x] 2.4 Wire tab onClick to set `leaderboardPeriod` and trigger `loadLeaderboard(period)`
- [x] 2.5 Show loading state when switching tabs

## 3. i18n & Styling

- [x] 3.1 Add translation keys in `src/i18n.js`: `leaderboard.daily`, `leaderboard.weekly`, `leaderboard.monthly`, `leaderboard.allTime` (zh/en/fr)
- [x] 3.2 Add CSS for leaderboard tabs in `src/styles.css` (active/inactive state, hover)
- [x] 3.3 Ensure tab styles match existing dark theme

## 4. Testing & Verification

- [x] 4.1 Build passes (`npm run build`)
- [x] 4.2 Test opening leaderboard shows daily tab by default
- [x] 4.3 Test switching tabs loads correct period data
- [x] 4.4 Test empty period shows empty state message
- [x] 4.5 Test backward compatibility (no period param → all-time)
