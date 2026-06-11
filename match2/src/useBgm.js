import { useEffect, useRef } from "react";

/** 背景音乐实例（全局共享，避免重复创建） */
let bgmAudio = null;

function getBgmAudio() {
  if (!bgmAudio) {
    bgmAudio = new Audio("/sound/happy.mp3");
    bgmAudio.loop = true;
    bgmAudio.volume = 0.5;
  }
  return bgmAudio;
}

/**
 * 自定义 Hook：根据游戏阶段自动播放/暂停背景音乐。
 * 如果浏览器因自动播放策略阻止播放，会在用户首次点击页面时尝试恢复。
 *
 * @param {object} options
 * @param {boolean} options.playing - 是否允许播放（如游戏进行中）
 * @param {number} options.volume - 音量 0~1（默认 0.5)
 */
export default function useBgm({ playing = false, volume = 0.5 } = {}) {
  const stateRef = useRef({ playing: false, volume: 0.5 });

  useEffect(() => {
    const audio = getBgmAudio();
    const prev = stateRef.current;

    // 更新音量
    if (volume !== prev.volume) {
      audio.volume = Math.max(0, Math.min(1, volume));
    }

    // 控制播放/暂停
    if (playing && !prev.playing) {
      audio.play().catch(() => {
        // 静默失败 —— 用户未交互时浏览器可能阻止自动播放
      });
    } else if (!playing && prev.playing) {
      audio.pause();
    }

    stateRef.current = { playing, volume };
  }, [playing, volume]);

  // 监听用户首次交互（点击/触摸/按键），恢复被阻止的播放
  useEffect(() => {
    if (!playing) return;

    const audio = getBgmAudio();

    function tryResume() {
      if (audio.paused) {
        audio.play().catch(() => {
          // 仍然被阻止，等待下一次交互
        });
      }
    }

    // 使用一次性的全局事件监听
    document.addEventListener("click", tryResume, { once: true });
    document.addEventListener("touchstart", tryResume, { once: true });
    document.addEventListener("keydown", tryResume, { once: true });

    return () => {
      document.removeEventListener("click", tryResume);
      document.removeEventListener("touchstart", tryResume);
      document.removeEventListener("keydown", tryResume);
    };
  }, [playing]);
}