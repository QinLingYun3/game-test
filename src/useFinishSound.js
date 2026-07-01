import { useEffect, useRef } from "react";

// 预加载 finish.mp3 音频实例
let finishAudio = null;

function getFinishAudio() {
  if (!finishAudio) {
    finishAudio = new Audio("/sound/finish.mp3");
  }
  return finishAudio;
}

/**
 * 自定义 Hook：游戏进入结算画面时播放 finish 音效。
 *
 * @param {string | null} phase - 当前游戏阶段
 * @param {number} volume - 音量 0~1（默认 1）
 */
export default function useFinishSound(phase, volume = 1) {
  const hasPlayedRef = useRef(false);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  useEffect(() => {
    if (phase !== "results") {
      hasPlayedRef.current = false;
      return;
    }

    if (hasPlayedRef.current) return;
    hasPlayedRef.current = true;

    try {
      const audio = getFinishAudio();
      audio.currentTime = 0;
      audio.volume = volumeRef.current;
      audio.play().catch(() => {
        // 静默失败 —— 浏览器可能不允许自动播放
      });
    } catch {
      // 静默失败 —— 不影响游戏
    }
  }, [phase]);
}
