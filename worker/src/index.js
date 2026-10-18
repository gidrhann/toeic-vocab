/* ============================================================
 * TOEIC 單字卡雲端同步 Worker
 *   GET /sync/<同步碼>  -> 取得進度 JSON（沒有則 404）
 *   PUT /sync/<同步碼>  -> 儲存進度 JSON
 * 同步碼就是密鑰；KV 裡只存它的 SHA-256 雜湊，不存原碼。
 * ============================================================ */
const ALLOWED_ORIGINS = [
  'https://toeic.gidrhann.com',
  'http://localhost:8765',
  'http://127.0.0.1:8765',
];
const MAX_BYTES = 5 * 1024 * 1024;
const CODE_RE = /^[A-Za-z0-9_-]{32,128}$/;

function cors(origin) {
  const h = {
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (ALLOWED_ORIGINS.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const headers = cors(origin);
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!ALLOWED_ORIGINS.includes(origin)) return json({ error: 'forbidden' }, 403);

    const m = new URL(req.url).pathname.match(/^\/sync\/([^/]+)$/);
    if (!m || !CODE_RE.test(m[1])) return json({ error: 'bad sync code' }, 400);
    const key = 'u:' + (await sha256(m[1]));

    if (req.method === 'GET') {
      const v = await env.SYNC.get(key);
      return v
        ? new Response(v, { headers: { ...headers, 'Content-Type': 'application/json' } })
        : json({ error: 'not found' }, 404);
    }

    if (req.method === 'PUT') {
      const text = await req.text();
      if (text.length > MAX_BYTES) return json({ error: 'too large' }, 413);
      let o;
      try { o = JSON.parse(text); } catch (e) { return json({ error: 'bad json' }, 400); }
      if (!o || o.app !== 'toeic-vocab' || typeof o.progress !== 'object') {
        return json({ error: 'invalid payload' }, 400);
      }
      await env.SYNC.put(key, text);
      return json({ ok: true, savedAt: Date.now() });
    }

    return json({ error: 'method not allowed' }, 405);
  },
};
