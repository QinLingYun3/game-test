## 1. Countdown Beep Sound Hook

- [x] 1.1 Create `src/useCountdownBeep.js` following the `useMatchSound.js` pattern
- [x] 1.2 Implement lazy-loaded singleton Audio instance for `/sound/beep_low.mp3`
- [x] 1.3 Implement token/value-based deduplication to prevent repeated playback in the same second
- [x] 1.4 Add silent error handling for browser autoplay policy

## 2. Finish Sound Hook

- [x] 2.1 Create `src/useFinishSound.js` following the `useComboSound.js` pattern
- [x] 2.2 Implement lazy-loaded singleton Audio instance for `/sound/finish.mp3`
- [x] 2.3 Implement phase-transition detection (non-"results" → "results") as trigger
- [x] 2.4 Add silent error handling for browser autoplay policy

## 3. App.jsx Integration

- [x] 3.1 Import `useCountdownBeep` and `useFinishSound` in `src/App.jsx`
- [x] 3.2 Call `useCountdownBeep(room?.countdownRemaining)` in the App component
- [x] 3.3 Call `useFinishSound(room?.phase)` in the App component
- [x] 3.4 Ensure hooks are placed alongside existing sound hooks (`useMatchSound`, `useComboSound`)

## 4. Verification

- [x] 4.1 Verify build passes (`npm run build`)
- [x] 4.2 Verify existing tests still pass (`npm test`)
- [x] 4.3 Confirm beep sound logic: only plays when countdown ≤ 10 and value changes
- [x] 4.4 Confirm finish sound logic: only plays once per transition to results
- [x] 4.5 Document that `/sound/beep_low.mp3` and `/sound/finish.mp3` files need to be provided
