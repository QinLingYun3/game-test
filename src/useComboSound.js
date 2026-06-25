import { useCallback, useRef } from "react";

// 预加载 combo.mp3 音频实例
let comboSound = null;

function getComboSound() {
  if (!comboSound) {
    comboSound = new Audio("/sound/combo.mp3");
  }
  return comboSound;
}

/**
 * 自定义 Hook：连击时播放 combo 音效。
 *
 * @param {string | null} comboToken - 用于标识最近一次连击的 token
 */
export default function useComboSound(comboToken) {
  const lastTokenRef = useRef(null);

  const playComboSound = useCallback(() => {
    if (!comboToken || comboToken === lastTokenRef.current) return;
    lastTokenRef.current = comboToken;

    try {
      const audio = getComboSound();
      audio.currentTime = 0;
      audio.play().catch(() => {
        // 静默失败 —— 浏览器可能不允许自动播放
      });
    } catch {
      // 静默失败 —— 不影响游戏
    }
  }, [comboToken]);

  return playComboSound;
}