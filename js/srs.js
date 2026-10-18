/* ============================================================
 * SRS：間隔重複演算法 (改良自 SM-2)
 * 卡片狀態 = [reps, interval(天), ef, due(ms), lapses, last(ms)]
 * 評分 q：1 忘記了 / 2 困難 / 3 記得 / 4 太簡單
 * ============================================================ */
(function () {
  const MIN = 60 * 1000;
  const DAY = 24 * 60 * MIN;
  const MASTER_DAYS = 21;       // 間隔 ≥ 21 天視為「已熟練」
  const MAX_INTERVAL = 365;
  const LEARN_WINDOW = 20 * MIN; // 20 分鐘內到期的卡，算作本次學習階段

  const fresh = () => [0, 0, 2.5, 0, 0, 0];

  /** 純函式：算出評分後的新狀態（不修改原物件） */
  function next(state, q, now) {
    now = now || Date.now();
    let [reps, interval, ef, , lapses] = state || fresh();
    let due;

    if (q === 1) {
      if (reps > 0) lapses++;
      ef = Math.max(1.3, ef - 0.2);
      reps = 0;
      interval = 0;
      due = now + MIN;                 // 1 分鐘後再出現
    } else if (q === 2) {
      if (reps === 0) {
        interval = 0;
        due = now + 6 * MIN;           // 學習階段：6 分鐘後
      } else {
        ef = Math.max(1.3, ef - 0.15);
        interval = Math.max(1, Math.round(interval * 1.2));
        reps++;
        due = now + interval * DAY;
      }
    } else if (q === 3) {
      if (reps === 0) interval = 1;
      else if (reps === 1) interval = 3;
      else interval = Math.round(interval * ef);
      interval = Math.min(MAX_INTERVAL, Math.max(1, interval));
      reps++;
      due = now + interval * DAY;
    } else {
      if (reps === 0) interval = 4;
      else if (reps === 1) interval = 7;
      else interval = Math.round(interval * ef * 1.3) + 1;
      interval = Math.min(MAX_INTERVAL, interval);
      ef = ef + 0.15;
      reps++;
      due = now + interval * DAY;
    }
    return [reps, interval, Math.round(ef * 100) / 100, due, lapses, now];
  }

  /** 把下一次出現時間轉成按鈕上的短標籤 */
  function label(state, q, now) {
    now = now || Date.now();
    const s = next(state, q, now);
    const ms = s[3] - now;
    if (ms < 60 * MIN) return `${Math.max(1, Math.round(ms / MIN))} 分`;
    const d = ms / DAY;
    if (d < 1) return `${Math.round(ms / (60 * MIN))} 小時`;
    if (d < 30) return `${Math.round(d)} 天`;
    if (d < 365) return `${Math.round(d / 30)} 個月`;
    return '1 年';
  }

  /** 狀態分類：new 新字 / learn 學習中 / master 已熟練 */
  function status(state) {
    if (!state) return 'new';
    if (state[1] >= MASTER_DAYS) return 'master';
    return 'learn';
  }

  window.SRS = { fresh, next, label, status, MIN, DAY, LEARN_WINDOW, MASTER_DAYS };
})();
