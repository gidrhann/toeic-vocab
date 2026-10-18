/* ============================================================
 * Sync：透過 Cloudflare Worker + KV 同步學習進度
 * 流程：下載雲端 → 與本機合併 → 把合併結果上傳
 * ============================================================ */
(function () {
  const API = 'https://toeic-api.gidrhann.com/sync/';
  const listeners = [];
  let timer = null, busy = false;

  const Sync = {
    status: 'idle', // idle | syncing | ok | error
    lastAt: Number(localStorage.getItem('toeic.syncat.v1')) || 0,
    error: '',

    enabled() { return !!Store.getSyncCode(); },
    onChange(fn) { listeners.push(fn); },
    _set(status, error) {
      this.status = status; this.error = error || '';
      if (status === 'ok') { this.lastAt = Date.now(); localStorage.setItem('toeic.syncat.v1', String(this.lastAt)); }
      listeners.forEach((f) => f());
    },

    newCode() {
      const a = crypto.getRandomValues(new Uint8Array(24));
      return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    validCode(c) { return /^[A-Za-z0-9_-]{32,128}$/.test(c); },

    async now() {
      if (!this.enabled() || busy) return;
      busy = true; this._set('syncing');
      try {
        const url = API + Store.getSyncCode();
        const r = await fetch(url);
        if (r.ok) Store.mergeRemote(await r.json());
        else if (r.status !== 404) throw new Error('下載失敗 (' + r.status + ')');
        Store.flush();
        const p = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: Store.exportJSON(),
        });
        if (!p.ok) throw new Error('上傳失敗 (' + p.status + ')');
        this._set('ok');
        if (typeof this.onMerged === 'function') this.onMerged();
      } catch (e) {
        this._set('error', e.message === 'Failed to fetch' ? '無法連線到同步伺服器' : e.message);
      } finally { busy = false; }
    },

    /** 本機有變動後，延遲 8 秒再同步，避免連續請求 */
    later() {
      if (!this.enabled() || busy) return;
      clearTimeout(timer);
      timer = setTimeout(() => this.now(), 8000);
    },
  };

  Store.onSaved = () => Sync.later();
  window.addEventListener('online', () => Sync.now());
  window.Sync = Sync;
  window.addEventListener('load', () => Sync.now());
})();
