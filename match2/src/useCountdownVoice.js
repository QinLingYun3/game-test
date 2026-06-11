/**
 * 自定义 Hook：在游戏开始倒计时时播放英语语音（3, 2, 1, Go!）
 * 使用 Web Speech API 合成语音，无需额外音频文件。
 */
export default function useCountdownVoice() {
  let lastSpokenCount = null;

  /**
   * 播报倒计时数字（英语）
   * @param {number | null} count - 倒计时数字（3, 2, 1），null 或 0 时播报 "Go!"
   */
  function speakCountdown(count) {
    if (count == null) return;

    // 避免重复播报同一个数字
    if (count === lastSpokenCount) return;
    lastSpokenCount = count;

    // 使用 Speech Synthesis API
    if (!window.speechSynthesis) return;

    const utterance = new SpeechSynthesisUtterance();

    if (count === 0 || count == null) {
      utterance.text = "Go!";
    } else {
      utterance.text = String(count);
    }

    utterance.lang = "en-US";
    utterance.rate = 0.9; // 语速稍慢
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // 取消之前可能正在播放的语音
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  return speakCountdown;
}