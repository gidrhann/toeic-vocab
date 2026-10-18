/* Service Worker：離線可用
 * - 9 MB 的字庫 (data/vocab.js) 用 cache-first，只下載一次
 * - 其餘同源檔案 network-first，更新程式後立即生效，離線時才用快取
 * - 跨網域請求（同步 API、字型、真人發音）不攔截
 * 字庫更新時請把 VERSION 加 1。 */
const VERSION = 'v1';
const CACHE = 'toeic-' + VERSION;
const VOCAB = '/data/vocab.js';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/store.js', 'js/srs.js', 'js/audio.js',
  'js/sync.js', 'js/mobile.js', 'js/app.js', 'assets/hannlogo-64.png', 'assets/hannlogo-256.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  if (url.pathname.endsWith(VOCAB)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
  );
});
