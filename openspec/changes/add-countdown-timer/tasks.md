## 1. Shared Logic — Countdown Calculation

- [ ] 1.1 Add `countHeightMapTiles` export to `shared/game.js` (or verify it exists) for tile count calculation
- [ ] 1.2 Add `computeLevelCountdown(levelIndex)` helper in `shared/game.js` that returns `totalTiles * 1.5`

## 2. Core Countdown State & Tick

- [ ] 2.1 Extend `createSoloRoom` in `src/App.jsx` to initialize `countdownTotal` and `countdownRemaining` based on level tile count
- [ ] 2.2 Add `useEffect` countdown tick interval in `src/App.jsx` that decrements `countdownRemaining` every second during active gameplay
- [ ] 2.3 Implement countdown pause logic: tick should skip when `startCountdown != null`, `startReveal`, `soloReshufflePending`, or `reshuffleCountdown` is active
- [ ] 2.4 Implement game over on countdown expiration: when `countdownRemaining` reaches 0, transition room phase to `"results"` and preserve score

## 3. Combo Time Bonus

- [ ] 3.1 Modify `computeSoloCombo` or the combo handling logic in `onSelect` to add 3 seconds to `countdownRemaining` when a combo occurs
- [ ] 3.2 Modify `onUseQuickMatch` SOLO branch to add 3 seconds on combo after quick match usage

## 4. Cross-Level Time Carryover

- [ ] 4.1 Modify level advancement logic in `onSelect` (board cleared branch) to carry over `countdownRemaining` to the next level instead of resetting
- [ ] 4.2 Ensure next level's `countdownTotal` is added to the carried-over remaining time

## 5. Item Interactions

- [ ] 5.1 Update `onUseQuickMatch` SOLO branch to reduce `countdownRemaining` by 4 seconds (with floor at 0)
- [ ] 5.2 Ensure `soloReshufflePending` already pauses countdown tick (covered in 2.3); verify shuffle completion resumes tick correctly
- [ ] 5.3 Update i18n strings for quick match and reshuffle item descriptions to mention countdown effects

## 6. Countdown UI Component

- [ ] 6.1 Create `CountdownCard` React component in `src/App.jsx` (or as inline JSX) that displays "剩余时间" label and remaining seconds
- [ ] 6.2 Style the countdown card to match the existing `removable-card` CSS classes
- [ ] 6.3 Implement dynamic background color interpolation from bright orange (full time) to vivid red (0 time)
- [ ] 6.4 Add progress bar inside the countdown card showing `remaining / total` percentage
- [ ] 6.5 Add CSS animation for flashing and pulsing the countdown number when remaining <= 10 seconds
- [ ] 6.6 Conditionally render the countdown card only when `room?.code === "SOLO"` and `room?.phase === "game"`
- [ ] 6.7 Place the countdown card above the "removable pairs" card in the `players-panel`

## 7. Polish & Verification

- [ ] 7.1 Test countdown initialization for different levels (verify tile count * 1.5)
- [ ] 7.2 Test combo adds 3 seconds and quick match subtracts 4 seconds
- [ ] 7.3 Test cross-level time carryover
- [ ] 7.4 Test countdown reaches 0 triggers game over and results screen
- [ ] 7.5 Test countdown pauses during start countdown and reshuffle
- [ ] 7.6 Verify UI color gradient and 10-second warning animation
- [ ] 7.7 Verify updated item descriptions display correctly
