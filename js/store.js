/* ============================================================
 * Store：設定 / 學習進度 / 每日紀錄，全部自動存到 localStorage
 * ============================================================ */
(function () {
  const K = {
    settings: 'toeic.settings.v1',
    progress: 'toeic.progress.v1',
    log: 'toeic.log.v1',
  };

  const DEFAULTS = {
    newPerDay: 20,        // 每日新字數
    maxReviews: 200,      // 每日複習上限
    direction: 'en',      // en: 英→中, zh: 中→英, mix: 隨機
    order: 'random',      // random: 隨機出現, star: 重要度優先, alpha: 字母順序
    kind: 'all',          // all / word / phrase
    scores: [0, 1, 2, 3, 4], // TOEIC 分數區間索引
    minStar: 1,
    cats: null,           // null = 全部分類
    autoSpeak: true,
    humanVoice: true,
    rate: 0.9,
    theme: 'light',
  };

  const read = (key, fallback) => {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  };
  const write = (key, val) => {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { console.warn('儲存失敗', e); return false; }
  };

  const Store = {
    settings: Object.assign({}, DEFAULTS, read(K.settings, {})),
    // progress[word] = [reps, interval(天), ef, due(ms), lapses, last(ms)]
    progress: read(K.progress, {}),
    // log['YYYY-MM-DD'] = { n: 新字, r: 複習, ok: 答對 }
    log: read(K.log, {}),

    _t: null,
    saveSoon() {
      clearTimeout(this._t);
      this._t = setTimeout(() => this.flush(), 400);
    },
    flush() {
      clearTimeout(this._t);
      write(K.settings, this.settings);
      write(K.progress, this.progress);
      write(K.log, this.log);
    },

    dayKey(ts) {
      const d = ts ? new Date(ts) : new Date();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${d.getFullYear()}-${m}-${day}`;
    },
    today() {
      const k = this.dayKey();
      return this.log[k] || (this.log[k] = { n: 0, r: 0, ok: 0 });
    },

    /** 連續學習天數：今天尚未學也不會中斷（從昨天往回算） */
    streak() {
      let n = 0;
      const d = new Date();
      const active = (dt) => {
        const e = this.log[this.dayKey(dt.getTime())];
        return e && (e.n + e.r) > 0;
      };
      if (!active(d)) d.setDate(d.getDate() - 1);
      while (active(d)) { n++; d.setDate(d.getDate() - 1); }
      return n;
    },

    exportJSON() {
      return JSON.stringify({
        app: 'toeic-vocab', v: 1, exportedAt: new Date().toISOString(),
        settings: this.settings, progress: this.progress, log: this.log,
      });
    },
    importJSON(text) {
      const o = JSON.parse(text);
      if (!o || o.app !== 'toeic-vocab' || typeof o.progress !== 'object') {
        throw new Error('這不是有效的進度檔案');
      }
      this.progress = o.progress || {};
      this.log = o.log || {};
      if (o.settings) this.settings = Object.assign({}, DEFAULTS, o.settings);
      this.flush();
    },
    resetAll() {
      this.progress = {};
      this.log = {};
      this.settings = Object.assign({}, DEFAULTS);
      this.flush();
    },
  };

  window.addEventListener('beforeunload', () => Store.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') Store.flush();
  });

  window.Store = Store;
})();
