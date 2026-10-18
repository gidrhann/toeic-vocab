/* ============================================================
 * Mobile：手機體驗強化
 *  - 評分／翻面時輕微震動（Android）
 *  - 主題切換時同步狀態列顏色 (theme-color)
 *  - 點同步碼自動全選，方便複製
 *  - 註冊 Service Worker（離線可用、可加入主畫面）
 * ============================================================ */
(function () {
  const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* 不支援就略過 */ } };

  document.addEventListener('click', (e) => {
    const t = e.target.closest('.rate, #btn-show, .speak, #btn-undo');
    if (t) buzz(t.classList.contains('rate') ? 12 : 8);
  }, { passive: true });

  document.addEventListener('focusin', (e) => {
    if (e.target.id === 'sync-code') e.target.select();
  });

  const meta = document.querySelector('meta[name="theme-color"]');
  const syncBar = () => {
    if (!meta) return;
    const bg = getComputedStyle(document.body).backgroundColor;
    if (bg) meta.setAttribute('content', bg);
  };
  new MutationObserver(syncBar).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('load', syncBar);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
