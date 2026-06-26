import { useCallback, useRef } from "react";

// 预加载 ding.mp3 音频实例
let dingAudio = null;

function getDingAudio() {
  if (!dingAudio) {
    dingAudio = new Audio("/sound/ding.mp3");
  }
  return dingAudio;
}

/**
 * 自定义 Hook：消除时播放 "叮" 的音效。
 * 只需在组件中调用，并传入当前 room.lastMatch 的标识即可。
 *
 * @param {string | null} matchToken - 用于标识最近一次消除的 token（每次消除应不同）
 * @param {number} volume - 音量 0~1（默认 1）
 */
export default function useMatchSound(matchToken, volume = 1) {
  const lastTokenRef = useRef(null);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  return useCallback(() => {
    if (!matchToken || matchToken === lastTokenRef.current) return;
    lastTokenRef.current = matchToken;

    try {
      const audio = getDingAudio();
      audio.currentTime = 0;
      audio.volume = volumeRef.current;
      audio.play().catch(() => {
        // 静默失败 —— 浏览器可能不允许自动播放
      });
    } catch {
      // 静默失败 —— 不影响游戏
    }
  }, [matchToken]);
}
