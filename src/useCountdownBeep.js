import { useEffect, useRef } from "react";

// 预加载 beep_low.mp3 音频实例
let beepAudio = null;

function getBeepAudio() {
  if (!beepAudio) {
    beepAudio = new Audio("/sound/beep_low.mp3");
  }
  return beepAudio;
}

/**
 * 自定义 Hook：倒计时剩余 ≤ 10 秒时，每秒播放一次 beep 警告音。
 *
 * @param {number | null} countdownRemaining - 当前剩余秒数
 * @param {number} volume - 音量 0~1（默认 1）
 */
export default function useCountdownBeep(countdownRemaining, volume = 1) {
  const lastValueRef = useRef(null);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  useEffect(() => {
    if (countdownRemaining == null) return;
    if (countdownRemaining > 10) return;
    if (countdownRemaining === lastValueRef.current) return;

    lastValueRef.current = countdownRemaining;

    try {
      const audio = getBeepAudio();
      audio.currentTime = 0;
      audio.volume = volumeRef.current;
      audio.play().catch(() => {
        // 静默失败 —— 浏览器可能不允许自动播放
      });
    } catch {
      // 静默失败 —— 不影响游戏
    }
  }, [countdownRemaining]);
}
