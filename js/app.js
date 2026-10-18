/* ============================================================
 * 多益互動單字卡 — 主程式
 * ============================================================ */
(function () {
  'use strict';

  const D = window.TOEIC_DATA;
  const $ = (id) => document.getElementById(id);

  if (!D) {
    document.querySelector('.loader-title').textContent = '找不到單字資料 (data/vocab.js)';
    document.querySelector('.loader-sub').textContent = '請先執行：node tools/build-data.js';
    return;
  }

  const ROWS = D.rows;
  const N = ROWS.length;
  // 欄位索引
  const W = 0, ZH = 1, POS = 2, STAR = 3, SC = 4, CAT = 5, E1 = 6, Z1 = 7, E2 = 8, Z2 = 9, FORMS = 10, TIPS = 11;
  const S = Store.settings;
  const prog = () => Store.progress; // 匯入進度時 Store.progress 會被重新指派，所以每次都重新取用

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isPhrase = (r) => /\s/.test(r[W]);
  const STATE_TEXT = { new: '新字', learn: '學習中', master: '已熟練' };
  const SPEAKER = '<svg viewBox="0 0 24 24"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>';

  /* ---------- Toast ---------- */
  let toastT;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2400);
  }

  /* ---------- 例句中的單字高亮 ---------- */
  const reCache = new Map();
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function buildRes(idx) {
    const r = ROWS[idx];
    const cands = [r[W]].concat(r[FORMS] ? r[FORMS].split(' · ') : [])
      .map((s) => s.trim()).filter(Boolean).sort((a, b) => b.length - a.length)
      .map((s) => escRe(s).replace(/\s+/g, '\\s+'));
    const primary = `(?<![A-Za-z])(?:${cands.join('|')})(?![A-Za-z])`;
    const toks = r[W].split(/\s+/).filter((t) => t.length > 3 && /^[A-Za-z'-]+$/.test(t))
      .map((t) => escRe(t.slice(0, Math.max(4, t.length - 2))));
    const fallback = toks.length ? `(?<![A-Za-z])(?:${toks.join('|')})[a-z]*` : null;
    return { primary, fallback };
  }
  function highlight(text, idx) {
    if (!text) return '';
    let res = reCache.get(idx);
    if (!res) { res = buildRes(idx); reCache.set(idx, res); }
    for (const src of [res.primary, res.fallback]) {
      if (!src) continue;
      const re = new RegExp(src, 'gi');
      let out = '', last = 0, m, found = false;
      while ((m = re.exec(text))) {
        if (!m[0]) { re.lastIndex++; continue; }
        found = true;
        out += esc(text.slice(last, m.index)) + '<mark>' + esc(m[0]) + '</mark>';
        last = m.index + m[0].length;
      }
      if (found) return out + esc(text.slice(last));
    }
    return esc(text);
  }

  function examplesHTML(idx) {
    const r = ROWS[idx];
    let html = '';
    [[E1, Z1], [E2, Z2]].forEach(([e, z]) => {
      if (!r[e]) return;
      html += `<div class="ex">
        <p class="ex-en">${highlight(r[e], idx)}</p>
        <button type="button" class="ex-play" data-say="${esc(r[e])}" aria-label="朗讀例句" title="朗讀例句">${SPEAKER}</button>
        <p class="ex-zh">${esc(r[z])}</p>
      </div>`;
    });
    return html;
  }
  const tipsHTML = (idx) => (ROWS[idx][TIPS] || []).map((t) => `<li>${esc(t)}</li>`).join('');

  /* ============================================================
   * 出題範圍與學習佇列
   * ============================================================ */
  function inScope(i) {
    const r = ROWS[i];
    if (r[STAR] < S.minStar) return false;
    if (S.scores.length < 5 && !S.scores.includes(r[SC])) return false;
    if (S.cats && !S.cats.includes(r[CAT])) return false;
    if (S.kind !== 'all') {
      const ph = isPhrase(r);
      if (S.kind === 'word' && ph) return false;
      if (S.kind === 'phrase' && !ph) return false;
    }
    return true;
  }
  function getPool() {
    const out = [];
    for (let i = 0; i < N; i++) if (inScope(i)) out.push(i);
    return out;
  }

  function seededShuffle(arr, seedStr) {
    let h = 1779033703;
    for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = h >>> 0;
    const rnd = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }

  const st = {
    queue: [], total: 0, done: 0, undo: [], revealed: false,
    extraNew: 0, builtDay: Store.dayKey(), poolSize: 0, freshLeft: 0,
  };

  function buildQueue() {
    const now = Date.now();
    const pool = getPool();
    st.poolSize = pool.length;
    st.builtDay = Store.dayKey();
    const today = Store.today();
    const due = [], learning = [];
    let fresh = [];
    const pg = prog();
    for (const i of pool) {
      const p = pg[ROWS[i][W]];
      if (!p) fresh.push(i);
      else if (p[3] <= now + SRS.LEARN_WINDOW) (p[0] === 0 ? learning : due).push(i);
    }
    const byDue = (a, b) => pg[ROWS[a][W]][3] - pg[ROWS[b][W]][3];
    learning.sort(byDue);
    due.sort(byDue);
    const reviewCap = Math.max(0, S.maxReviews - today.r);
    const reviews = learning.concat(due.slice(0, reviewCap));

    if (S.order === 'random') {
      // 隨機抽取新單字
      for (let i = fresh.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
      }
    }
    else if (S.order === 'alpha') fresh.sort((a, b) => ROWS[a][W].localeCompare(ROWS[b][W], 'en', { sensitivity: 'base' }));
    const quota = Math.max(0, S.newPerDay - today.n + st.extraNew);
    st.freshLeft = Math.max(0, fresh.length - quota);
    const news = fresh.slice(0, quota);

    // 新字平均穿插在複習之間
    const q = [];
    let ri = 0, ni = 0;
    const total = reviews.length + news.length;
    for (let k = 0; k < total; k++) {
      if (ni < news.length && (ri >= reviews.length || (ni + 0.5) * total <= (k + 0.5) * news.length)) q.push(news[ni++]);
      else q.push(reviews[ri++]);
    }
    st.queue = q;
    st.total = q.length;
    st.done = 0;
    st.undo = [];
  }

  /* ---------- 卡片渲染 ---------- */
  const el = {
    card: $('card'), scene: $('card-scene'),
    fWord: $('f-word'), fPos: $('f-pos'), fStars: $('f-stars'), fScore: $('f-score'), fCat: $('f-cat'), fState: $('f-state'),
    bWord: $('b-word'), bPos: $('b-pos'), bZh: $('b-zh'), bForms: $('b-forms'), bStars: $('b-stars'), bScore: $('b-score'), bCat: $('b-cat'),
    examples: $('b-examples'), tipsWrap: $('b-tips-wrap'), tips: $('b-tips'), btnTips: $('btn-tips'),
    showBtn: $('btn-show'), rateGrid: $('rate-grid'),
    speak: $('btn-speak'), speakB: $('btn-speak-b'),
  };

  const starText = (n) => '★'.repeat(n) + '<span style="opacity:.25">' + '★'.repeat(5 - n) + '</span>';
  function dirFor(idx) {
    if (S.direction === 'mix') return (Math.imul(idx + 1, 2654435761) >>> 0) % 2 ? 'zh' : 'en';
    return S.direction === 'zh' ? 'zh' : 'en';
  }
  const curIdx = () => st.queue[0];
  const curRow = () => ROWS[st.queue[0]];

  function setFlip(v) {
    el.card.dataset.flipped = v ? 'true' : 'false';
  }

  function showCard(opts) {
    opts = opts || {};
    const idx = curIdx();
    if (idx === undefined) { showDone(); updateCounts(); return; }
    $('done').hidden = true;
    $('card-scene').hidden = false;
    $('answer-bar').hidden = false;
    document.querySelector('.hotkeys').hidden = false;

    const r = ROWS[idx];
    const dir = dirFor(idx);
    const state = SRS.status(prog()[r[W]]);

    // 正面
    el.card.setAttribute('data-state', state);
    el.fWord.textContent = dir === 'zh' ? r[ZH] : r[W];
    el.fWord.classList.toggle('zh-front', dir === 'zh');
    el.fPos.textContent = r[POS];
    el.speak.hidden = dir === 'zh';
    el.fStars.innerHTML = starText(r[STAR]);
    el.fScore.textContent = 'TOEIC ' + D.scores[r[SC]];
    el.fCat.textContent = D.cats[r[CAT]];
    el.fState.textContent = STATE_TEXT[state];
    el.fState.className = 'state-badge ' + state;

    // 背面
    el.bWord.textContent = r[W];
    el.bPos.textContent = r[POS];
    el.bZh.textContent = r[ZH];
    el.bForms.innerHTML = r[FORMS] ? '<b>詞形</b>' + esc(r[FORMS]) : '';
    el.bForms.hidden = !r[FORMS];
    el.bStars.innerHTML = starText(r[STAR]);
    el.bScore.textContent = 'TOEIC ' + D.scores[r[SC]];
    el.bCat.textContent = D.cats[r[CAT]];
    el.examples.innerHTML = examplesHTML(idx);
    el.tips.innerHTML = tipsHTML(idx);
    el.tipsWrap.hidden = !r[TIPS].length;
    el.tipsWrap.classList.remove('open');
    el.btnTips.setAttribute('aria-expanded', 'false');
    el.card.querySelectorAll('.face').forEach((f) => { f.scrollTop = 0; });

    // 重設翻面（不要動畫）
    st.revealed = !!opts.revealed;
    el.card.classList.add('no-anim');
    setFlip(st.revealed);
    void el.card.offsetWidth;
    requestAnimationFrame(() => el.card.classList.remove('no-anim'));

    el.scene.classList.remove('swap');
    void el.scene.offsetWidth;
    if (!opts.silent) el.scene.classList.add('swap');

    el.showBtn.hidden = st.revealed;
    el.rateGrid.hidden = !st.revealed;
    if (st.revealed) updateRateLabels();

    updateCounts();
    const nxt = st.queue[1];
    if (nxt !== undefined) Speech.prefetch(ROWS[nxt][W]);
    if (dir === 'en' && S.autoSpeak && !opts.silent) setTimeout(() => { if (curIdx() === idx && !st.revealed) speakWord(); }, 260);
  }

  function updateRateLabels() {
    const p = prog()[curRow()[W]];
    for (let q = 1; q <= 4; q++) $('int-' + q).textContent = SRS.label(p, q);
  }

  function reveal() {
    if (st.revealed || curIdx() === undefined) return;
    st.revealed = true;
    setFlip(true);
    el.showBtn.hidden = true;
    el.rateGrid.hidden = false;
    updateRateLabels();
    if (dirFor(curIdx()) === 'zh' && S.autoSpeak) setTimeout(speakWord, 350);
  }

  function updateCounts() {
    let n = 0, l = 0, r = 0;
    const pg = prog();
    for (const i of st.queue) {
      const p = pg[ROWS[i][W]];
      if (!p) n++; else if (p[0] === 0) l++; else r++;
    }
    $('cnt-new').textContent = n;
    $('cnt-learn').textContent = l;
    $('cnt-review').textContent = r;
    const cur = st.queue[0];
    let kind = '';
    if (cur !== undefined) { const p = pg[ROWS[cur][W]]; kind = !p ? 'new' : p[0] === 0 ? 'learn' : 'review'; }
    document.querySelector('.c-new').classList.toggle('is-current', kind === 'new');
    document.querySelector('.c-learn').classList.toggle('is-current', kind === 'learn');
    document.querySelector('.c-review').classList.toggle('is-current', kind === 'review');
    const pct = st.total ? Math.round((st.done / st.total) * 100) : 100;
    $('session-fill').style.width = pct + '%';
    $('session-progress').setAttribute('aria-valuenow', pct);
    $('btn-undo').disabled = st.undo.length === 0;
  }

  function updateStreak() {
    $('streak-num').textContent = Store.streak();
  }

  /* ---------- 評分 ---------- */
  function rate(q) {
    const idx = curIdx();
    if (idx === undefined || !st.revealed) return;
    const word = ROWS[idx][W];
    const pg = prog();
    const prev = pg[word] ? pg[word].slice() : null;
    const log = Store.today();
    st.undo.push({ idx, word, prev, queue: st.queue.slice(), done: st.done, log: { n: log.n, r: log.r, ok: log.ok } });
    if (st.undo.length > 30) st.undo.shift();

    const now = Date.now();
    const ns = SRS.next(prev, q, now);
    pg[word] = ns;
    if (prev) log.r++; else log.n++;
    if (q >= 2) log.ok++;

    st.queue.shift();
    if (ns[3] - now <= SRS.LEARN_WINDOW) {
      const pos = Math.min(st.queue.length, q === 1 ? 3 : 6);
      st.queue.splice(pos, 0, idx);
    } else {
      st.done++;
    }
    Store.saveSoon();
    updateStreak();
    showCard();
  }

  function undo() {
    const u = st.undo.pop();
    if (!u) return;
    if (u.prev) prog()[u.word] = u.prev; else delete prog()[u.word];
    const log = Store.today();
    log.n = u.log.n; log.r = u.log.r; log.ok = u.log.ok;
    st.queue = u.queue;
    st.done = u.done;
    Store.saveSoon();
    updateStreak();
    showCard({ revealed: true, silent: true });
  }

  /* ---------- 發音 ---------- */
  function pulse(btn) {
    btn.classList.remove('playing');
    void btn.offsetWidth;
    btn.classList.add('playing');
  }
  function speakWord() {
    const r = curRow();
    if (!r) return;
    Speech.word(r[W]);
    pulse(el.speak.hidden ? el.speakB : (st.revealed ? el.speakB : el.speak));
  }

  /* ---------- 完成畫面 ---------- */
  function showDone() {
    $('card-scene').hidden = true;
    $('answer-bar').hidden = true;
    document.querySelector('.hotkeys').hidden = true;
    const done = $('done');
    done.hidden = false;
    const t = Store.today();
    const total = t.n + t.r;
    const acc = total ? Math.round((t.ok / total) * 100) : 0;
    const emptyPool = st.poolSize === 0;
    $('done-text').textContent = emptyPool
      ? '目前的篩選條件下沒有單字，請到「設定」調整題庫範圍。'
      : total
        ? '太棒了！記憶曲線已為你排好下一次複習時間，明天再來。'
        : '目前沒有待學的卡片。';
    $('done-stats').innerHTML = total
      ? `<div class="done-stat"><b>${t.n}</b><span>今日新字</span></div>
         <div class="done-stat"><b>${t.r}</b><span>今日複習</span></div>
         <div class="done-stat"><b>${acc}%</b><span>記得率</span></div>
         <div class="done-stat"><b>${Store.streak()}</b><span>連續天數</span></div>`
      : '';
    $('btn-more').hidden = st.freshLeft <= 0;
    $('btn-more').textContent = `再學 ${Math.min(10, st.freshLeft)} 個新字`;
    if (total) confetti(done);
  }
  function confetti(host) {
    host.querySelectorAll('.confetti').forEach((c) => c.remove());
    const colors = ['#8b5cf6', '#22d3ee', '#f472b6', '#fbbf24', '#34d399', '#60a5fa'];
    for (let i = 0; i < 46; i++) {
      const c = document.createElement('i');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + '%';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = 1.6 + Math.random() * 1.8 + 's';
      c.style.animationDelay = Math.random() * 0.6 + 's';
      host.appendChild(c);
    }
    setTimeout(() => host.querySelectorAll('.confetti').forEach((c) => c.remove()), 4500);
  }

  /* ============================================================
   * 字庫（虛擬捲動，上萬筆也不卡）
   * ============================================================ */
  const ROW_H = 68;
  const br = { list: [], status: 'all', star: 0, q: '', lw: null, lz: null, start: -1, end: -1, ready: false };

  function refreshBrowse() {
    if (!br.lw) { br.lw = ROWS.map((r) => r[W].toLowerCase()); br.lz = ROWS.map((r) => r[ZH]); }
    const q = br.q.trim().toLowerCase();
    const pg = prog();
    const out = [];
    for (let i = 0; i < N; i++) {
      const r = ROWS[i];
      if (br.star && r[STAR] !== br.star) continue;
      if (q && !br.lw[i].includes(q) && !br.lz[i].includes(q)) continue;
      if (br.status !== 'all' && SRS.status(pg[r[W]]) !== br.status) continue;
      out.push(i);
    }
    // 搜尋時，完全符合/前綴符合的排在前面
    if (q) out.sort((a, b) => {
      const sa = br.lw[a] === q ? 0 : br.lw[a].startsWith(q) ? 1 : 2;
      const sb = br.lw[b] === q ? 0 : br.lw[b].startsWith(q) ? 1 : 2;
      return sa - sb;
    });
    br.list = out;
    $('browse-count').textContent = `共 ${N.toLocaleString()} 字・符合 ${out.length.toLocaleString()} 筆`;
    $('vspacer').style.height = out.length * ROW_H + 'px';
    $('vlist').scrollTop = 0;
    $('vempty').hidden = out.length > 0;
    br.start = br.end = -1;
    renderRows();
  }

  function renderRows() {
    const box = $('vlist');
    const h = box.clientHeight || 600;
    const start = Math.max(0, Math.floor(box.scrollTop / ROW_H) - 6);
    const end = Math.min(br.list.length, start + Math.ceil(h / ROW_H) + 12);
    if (start === br.start && end === br.end) return;
    br.start = start; br.end = end;
    const pg = prog();
    let html = '';
    for (let k = start; k < end; k++) {
      const i = br.list[k];
      const r = ROWS[i];
      const s = SRS.status(pg[r[W]]);
      html += `<button type="button" class="vrow" data-i="${i}">
        <span class="vrow-main"><span class="vrow-w">${esc(r[W])}</span><span class="vrow-z">${esc(r[ZH])}</span></span>
        <span class="vrow-meta"><span class="vrow-star">${'★'.repeat(r[STAR])}</span><span class="state-badge ${s}">${STATE_TEXT[s]}</span></span>
      </button>`;
    }
    $('vrows').style.transform = `translateY(${start * ROW_H}px)`;
    $('vrows').innerHTML = html;
  }

  /* ---------- 單字詳情 ---------- */
  function openDetail(idx) {
    const r = ROWS[idx];
    const p = prog()[r[W]];
    const s = SRS.status(p);
    $('d-title').textContent = r[W];
    let meta = '尚未學習';
    if (p) {
      const dueMs = p[3] - Date.now();
      const next = dueMs <= 0 ? '現在可複習' : '下次複習：' + new Date(p[3]).toLocaleDateString('zh-TW');
      meta = `已複習 ${p[0]} 次・間隔 ${p[1]} 天・忘記 ${p[4]} 次・${next}`;
    }
    $('detail-body').innerHTML = `
      <div class="face-top">
        <span class="chip stars">${starText(r[STAR])}</span>
        <span class="chip">TOEIC ${D.scores[r[SC]]}</span>
        <span class="chip cat">${esc(D.cats[r[CAT]])}</span>
        <span class="state-badge ${s}">${STATE_TEXT[s]}</span>
      </div>
      <div class="back-head">
        <div class="back-word"><h3>${esc(r[W])}</h3><span class="pos">${esc(r[POS])}</span>
          <button type="button" class="speak sm" data-say-word="${esc(r[W])}" aria-label="發音">${SPEAKER}</button></div>
        <p class="zh">${esc(r[ZH])}</p>
        ${r[FORMS] ? `<p class="forms"><b>詞形</b>${esc(r[FORMS])}</p>` : ''}
      </div>
      <div class="examples">${examplesHTML(idx)}</div>
      ${r[TIPS].length ? `<div class="tips open"><ul class="tips-list">${tipsHTML(idx)}</ul></div>` : ''}
      <p class="detail-meta">${esc(meta)}</p>
      <div class="detail-actions">
        <button type="button" class="btn sm primary" data-act="master" data-i="${idx}">標記為已熟練</button>
        <button type="button" class="btn sm danger" data-act="reset" data-i="${idx}">重設進度</button>
      </div>`;
    $('dlg-detail').showModal();
  }

  /* ============================================================
   * 統計
   * ============================================================ */
  function renderStats() {
    const pg = prog();
    const now = Date.now();
    let learned = 0, master = 0;
    const perScore = D.scores.map(() => ({ t: 0, m: 0, l: 0 }));
    const forecast = new Array(7).fill(0);
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    for (let i = 0; i < N; i++) {
      const r = ROWS[i];
      const o = perScore[r[SC]];
      o.t++;
      const p = pg[r[W]];
      if (!p) continue;
      learned++;
      if (p[1] >= SRS.MASTER_DAYS) { master++; o.m++; } else o.l++;
      const dd = Math.floor((p[3] - startToday.getTime()) / SRS.DAY);
      if (dd <= 0) forecast[0]++; else if (dd < 7) forecast[dd]++;
    }
    const learning = learned - master;

    // 近 14 天
    const days = [];
    for (let k = 13; k >= 0; k--) {
      const d = new Date(); d.setDate(d.getDate() - k);
      const e = Store.log[Store.dayKey(d.getTime())] || { n: 0, r: 0, ok: 0 };
      days.push({ d, n: e.n, r: e.r, ok: e.ok });
    }
    const last7 = days.slice(-7);
    const t7 = last7.reduce((a, x) => a + x.n + x.r, 0);
    const ok7 = last7.reduce((a, x) => a + x.ok, 0);
    const today = days[days.length - 1];

    $('kpis').innerHTML = [
      ['已學單字', learned.toLocaleString(), `共 ${N.toLocaleString()} 字`, 'var(--violet)'],
      ['已熟練', master.toLocaleString(), `間隔 ≥ ${SRS.MASTER_DAYS} 天`, 'var(--green)'],
      ['連續學習', Store.streak() + ' 天', '每天一點點最有效', 'var(--amber)'],
      ['今日進度', today.n + today.r, `新字 ${today.n}・複習 ${today.r}`, 'var(--cyan)'],
      ['近 7 日記得率', t7 ? Math.round((ok7 / t7) * 100) + '%' : '—', `共評分 ${t7} 次`, 'var(--pink)'],
    ].map(([a, b, c, col]) => `<div class="kpi" style="--kc:${col}"><span>${a}</span><b>${b}</b><small>${c}</small></div>`).join('');

    const HMAX = 120;
    const maxDay = Math.max(1, ...days.map((x) => x.n + x.r));
    const wk = ['日', '一', '二', '三', '四', '五', '六'];
    $('bars-14').innerHTML = days.map((x, i) => {
      const tot = x.n + x.r;
      return `<div class="bar${i === 13 ? ' today' : ''}" title="${x.d.getMonth() + 1}/${x.d.getDate()}：新字 ${x.n}、複習 ${x.r}">
        <span class="bar-v">${tot || ''}</span>
        <div class="bar-stack"><i class="bar-n" data-h="${(x.n / maxDay) * HMAX}"></i><i class="bar-r" data-h="${(x.r / maxDay) * HMAX}"></i></div>
        <label>${x.d.getDate()}</label></div>`;
    }).join('');
    const maxF = Math.max(1, ...forecast);
    $('bars-forecast').innerHTML = forecast.map((v, i) => {
      const d = new Date(); d.setDate(d.getDate() + i);
      return `<div class="bar${i === 0 ? ' today' : ''}" title="${v} 張">
        <span class="bar-v">${v || ''}</span>
        <div class="bar-stack"><i class="bar-f" data-h="${(v / maxF) * HMAX}"></i></div>
        <label>${i === 0 ? '今天' : i === 1 ? '明天' : '週' + wk[d.getDay()]}</label></div>`;
    }).join('');

    // 環形圖
    const C = 2 * Math.PI * 70;
    const fl = learned / N, fm = master / N;
    $('ring').innerHTML = `
      <div class="ring">
        <svg viewBox="0 0 170 170">
          <defs><linearGradient id="gA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#6366f1"/></linearGradient>
          <linearGradient id="gB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#34d399"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs>
          <circle class="bg" cx="85" cy="85" r="70"/>
          <circle class="fg" id="ring-l" cx="85" cy="85" r="70" stroke="url(#gA)" stroke-dasharray="${C}" stroke-dashoffset="${C}"/>
          <circle class="fg" id="ring-m" cx="85" cy="85" r="70" stroke="url(#gB)" stroke-dasharray="${C}" stroke-dashoffset="${C}"/>
        </svg>
        <div class="ring-center"><b>${(fm * 100).toFixed(1)}%</b><span>已熟練</span></div>
      </div>
      <div class="ring-legend">
        <div><i style="background:#22d3ee"></i>已熟練<b>${master.toLocaleString()}</b></div>
        <div><i style="background:#8b5cf6"></i>學習中<b>${learning.toLocaleString()}</b></div>
        <div><i style="background:rgba(255,255,255,.2)"></i>未學習<b>${(N - learned).toLocaleString()}</b></div>
      </div>`;

    $('score-bars').innerHTML = perScore.map((o, i) => `
      <div><div class="sb-top"><span>TOEIC <b>${D.scores[i]}</b></span><span>${o.m + o.l} / ${o.t}</span></div>
      <div class="sb-track"><i class="sb-m" data-w="${(o.m / o.t) * 100}"></i><i class="sb-l" data-w="${(o.l / o.t) * 100}"></i></div></div>`).join('');

    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.querySelectorAll('#view-stats [data-h]').forEach((n) => { n.style.height = n.dataset.h + 'px'; });
      document.querySelectorAll('#view-stats [data-w]').forEach((n) => { n.style.width = n.dataset.w + '%'; });
      const rl = $('ring-l'), rm = $('ring-m');
      if (rl) rl.style.strokeDashoffset = C * (1 - fl);
      if (rm) rm.style.strokeDashoffset = C * (1 - fm);
    }));
  }

  /* ============================================================
   * 設定
   * ============================================================ */
  let settingsDirty = false;
  const FILTER_KEYS = ['newPerDay', 'maxReviews', 'direction', 'order', 'kind', 'scores', 'minStar', 'cats'];
  function setSetting(key, val) {
    S[key] = val;
    Store.saveSoon();
    if (FILTER_KEYS.includes(key)) settingsDirty = true;
  }
  const chipGroup = (items, isOn, attr) => `<div class="chips">${items.map(([v, label]) =>
    `<button type="button" class="chip-btn${isOn(v) ? ' on' : ''}" ${attr}="${v}">${label}</button>`).join('')}</div>`;
  const catIncluded = (i) => !S.cats || S.cats.includes(i);

  function renderSettings() {
    const pool = getPool().length;
    const catCount = D.cats.map(() => 0);
    ROWS.forEach((r) => catCount[r[CAT]]++);
    $('settings-body').innerHTML = `
      <div class="sec-title">學習</div>
      <div class="field">
        <div class="field-row"><label for="s-new">每日新字數</label><span class="field-val" id="v-new">${S.newPerDay}</span></div>
        <input type="range" id="s-new" min="0" max="100" step="1" value="${S.newPerDay}">
      </div>
      <div class="field">
        <div class="field-row"><label for="s-rev">每日複習上限</label><span class="field-val" id="v-rev">${S.maxReviews}</span></div>
        <input type="range" id="s-rev" min="20" max="500" step="10" value="${S.maxReviews}">
      </div>
      <div class="field"><label>卡片正面</label>
        ${chipGroup([['en', '英文 → 中文'], ['zh', '中文 → 英文'], ['mix', '隨機']], (v) => S.direction === v, 'data-dir')}</div>
      <div class="field"><label>新字順序</label>
        ${chipGroup([['random', '隨機出現'], ['star', '重要度優先'], ['alpha', '字母順序']], (v) => S.order === v, 'data-order')}</div>

      <div class="sec-title">題庫範圍</div>
      <div class="filter-info">目前範圍內共 <b>${pool.toLocaleString()}</b> 個單字（全部 ${N.toLocaleString()}）</div>
      <div class="field"><label>類型</label>
        ${chipGroup([['all', '全部'], ['word', '只有單字'], ['phrase', '只有片語']], (v) => S.kind === v, 'data-kind')}</div>
      <div class="field"><label>TOEIC 分數區間</label>
        ${chipGroup(D.scores.map((s, i) => [i, s]), (v) => S.scores.includes(+v), 'data-score')}</div>
      <div class="field"><label>最低星級<small>星級越高越常考</small></label>
        ${chipGroup([1, 2, 3, 4, 5].map((n) => [n, '★' + n + (n < 5 ? '+' : '')]), (v) => S.minStar === +v, 'data-star')}</div>
      <div class="field"><div class="field-row"><label>主題分類</label>
        <span class="btn-row"><button type="button" class="chip-btn" data-cat-all="1">全選</button><button type="button" class="chip-btn" data-cat-all="0">清除</button></span></div>
        ${chipGroup(D.cats.map((c, i) => [i, `${esc(c)} <small style="opacity:.6">${catCount[i]}</small>`]), (v) => catIncluded(+v), 'data-cat')}</div>

      <div class="sec-title">發音</div>
      <div class="field-row"><span>自動發音<small>出現卡片時自動朗讀</small></span>
        <label class="switch"><input type="checkbox" id="s-auto" ${S.autoSpeak ? 'checked' : ''}><i></i></label></div>
      <div class="field-row"><span>優先使用真人錄音<small>單字會先查詢線上真人錄音，找不到再用電腦語音</small></span>
        <label class="switch"><input type="checkbox" id="s-human" ${S.humanVoice ? 'checked' : ''}><i></i></label></div>
      <div class="field">
        <div class="field-row"><label for="s-rate">語速</label><span class="field-val" id="v-rate">${S.rate.toFixed(2)}x</span></div>
        <input type="range" id="s-rate" min="0.6" max="1.2" step="0.05" value="${S.rate}">
      </div>

      <div class="sec-title">資料</div>
      <div class="btn-row">
        <button type="button" class="btn sm" id="btn-export">匯出進度</button>
        <button type="button" class="btn sm" id="btn-import">匯入進度</button>
        <button type="button" class="btn sm danger" id="btn-reset">清除全部進度</button>
        <input type="file" id="file-import" accept="application/json,.json" hidden>
      </div>
      <p class="muted">進度會自動儲存在這個瀏覽器（localStorage）。</p>

      <div class="sec-title">雲端同步</div>
      ${syncHTML()}`;
  }

  function syncHTML() {
    const code = Store.getSyncCode();
    if (!code) {
      return `<p class="muted">在多台裝置間同步進度。同步碼就是你的密鑰，請勿分享給別人。</p>
        <div class="btn-row">
          <button type="button" class="btn sm primary" id="btn-sync-on">開啟同步（產生新同步碼）</button>
        </div>
        <div class="field"><label for="sync-input">已有同步碼？貼在這裡</label>
          <input type="text" id="sync-input" autocomplete="off" spellcheck="false" placeholder="貼上其他裝置的同步碼">
          <div class="btn-row"><button type="button" class="btn sm" id="btn-sync-join">使用此同步碼</button></div></div>`;
    }
    const st = Sync.status === 'syncing' ? '同步中…'
      : Sync.status === 'error' ? '同步失敗：' + Sync.error
      : Sync.lastAt ? '上次同步：' + new Date(Sync.lastAt).toLocaleString() : '尚未同步';
    return `<p class="muted" id="sync-status">${st}</p>
      <div class="field"><label for="sync-code">你的同步碼（在其他裝置貼上即可同步）</label>
        <input type="text" id="sync-code" readonly value="${code}"></div>
      <div class="btn-row">
        <button type="button" class="btn sm primary" id="btn-sync-now">立即同步</button>
        <button type="button" class="btn sm" id="btn-sync-copy">複製同步碼</button>
        <button type="button" class="btn sm danger" id="btn-sync-off">停用同步</button>
      </div>`;
  }

  function wireSettings() {
    const body = $('settings-body');
    body.addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 's-new') { setSetting('newPerDay', +t.value); $('v-new').textContent = t.value; }
      else if (t.id === 's-rev') { setSetting('maxReviews', +t.value); $('v-rev').textContent = t.value; }
      else if (t.id === 's-rate') { setSetting('rate', +t.value); $('v-rate').textContent = (+t.value).toFixed(2) + 'x'; }
      else if (t.id === 's-auto') setSetting('autoSpeak', t.checked);
      else if (t.id === 's-human') setSetting('humanVoice', t.checked);
    });
    body.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const d = b.dataset;
      if (d.dir) setSetting('direction', d.dir);
      else if (d.order) setSetting('order', d.order);
      else if (d.kind) setSetting('kind', d.kind);
      else if (d.star) setSetting('minStar', +d.star);
      else if (d.score !== undefined) {
        const i = +d.score;
        const has = S.scores.includes(i);
        if (has && S.scores.length === 1) return toast('至少要保留一個分數區間');
        setSetting('scores', has ? S.scores.filter((x) => x !== i) : S.scores.concat(i).sort());
      } else if (d.cat !== undefined) {
        const i = +d.cat;
        const cur = S.cats ? S.cats.slice() : D.cats.map((_, k) => k);
        const has = cur.includes(i);
        if (has && cur.length === 1) return toast('至少要保留一個分類');
        const nxt = has ? cur.filter((x) => x !== i) : cur.concat(i).sort((a, b) => a - b);
        setSetting('cats', nxt.length === D.cats.length ? null : nxt);
      } else if (d.catAll !== undefined) {
        setSetting('cats', d.catAll === '1' ? null : [0]);
        if (d.catAll === '0') toast('已保留第一個分類，請再勾選你要的分類');
      } else if (b.id === 'btn-export') return exportProgress();
      else if (b.id === 'btn-import') return $('file-import').click();
      else if (b.id === 'btn-reset') return resetAll();
      else if (b.id === 'btn-sync-on') { Store.setSyncCode(Sync.newCode()); Sync.now(); }
      else if (b.id === 'btn-sync-join') {
        const c = ($('sync-input').value || '').trim();
        if (!Sync.validCode(c)) return toast('同步碼格式不正確');
        Store.setSyncCode(c); Sync.now();
      }
      else if (b.id === 'btn-sync-now') { Sync.now(); return; }
      else if (b.id === 'btn-sync-copy') {
        return navigator.clipboard.writeText(Store.getSyncCode()).then(() => toast('已複製同步碼'), () => toast('請手動選取複製'));
      }
      else if (b.id === 'btn-sync-off') {
        if (!confirm('停用後此裝置不再同步（雲端資料仍保留）。確定嗎？')) return;
        Store.setSyncCode('');
      }
      else return;
      const keep = $('dlg-settings').querySelector('.dlg-body').scrollTop;
      renderSettings();
      $('dlg-settings').querySelector('.dlg-body').scrollTop = keep;
    });
    body.addEventListener('change', (e) => {
      if (e.target.id !== 'file-import' || !e.target.files[0]) return;
      const rd = new FileReader();
      rd.onload = () => {
        try { Store.importJSON(String(rd.result)); Object.assign(S, Store.settings); settingsDirty = true; renderSettings(); toast('進度已匯入'); updateStreak(); }
        catch (err) { toast('匯入失敗：' + err.message); }
      };
      rd.readAsText(e.target.files[0]);
    });
  }

  function exportProgress() {
    Store.flush();
    const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `toeic-progress-${Store.dayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('已匯出學習進度');
  }
  function resetAll() {
    if (!confirm('確定要清除全部學習進度與設定嗎？此動作無法復原。')) return;
    Store.resetAll();
    Object.assign(S, Store.settings);
    st.extraNew = 0;
    settingsDirty = true;
    renderSettings();
    updateStreak();
    toast('已清除全部進度');
  }

  /* ============================================================
   * 分頁與事件
   * ============================================================ */
  let view = 'study';
  function switchView(name) {
    if (!['study', 'browse', 'stats'].includes(name)) name = 'study';
    view = name;
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('is-active', v.id === 'view-' + name));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.view === name));
    if (history.replaceState) history.replaceState(null, '', '#' + name);
    if (name === 'browse') { refreshBrowse(); }
    if (name === 'stats') renderStats();
    if (name === 'study') updateCounts();
  }

  function anyDialogOpen() {
    return $('dlg-settings').open || $('dlg-detail').open;
  }

  function init() {
    // 分頁
    $('tabs').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) switchView(b.dataset.view); });
    document.addEventListener('click', (e) => { const g = e.target.closest('[data-goto]'); if (g) switchView(g.dataset.goto); });

    // 主題切換 (深色 / 淺色)
    const btnTheme = $('btn-theme');
    if (btnTheme) {
      btnTheme.addEventListener('click', () => {
        const cur = document.documentElement.getAttribute('data-theme') || 'light';
        const next = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        S.theme = next;
        Store.saveSoon();
        toast(next === 'dark' ? '已切換為深色模式' : '已切換為淺色模式');
      });
    }

    // 卡片
    el.card.addEventListener('click', (e) => {
      if (e.target.closest('button, .tips-list')) return;
      if (window.getSelection && String(window.getSelection())) return;
      if (!st.revealed) reveal();
      else setFlip(el.card.dataset.flipped !== 'true');
    });
    el.showBtn.addEventListener('click', reveal);
    el.rateGrid.addEventListener('click', (e) => { const b = e.target.closest('.rate'); if (b) rate(+b.dataset.q); });
    el.speak.addEventListener('click', (e) => { e.stopPropagation(); Speech.word(curRow()[W]); pulse(el.speak); });
    el.speakB.addEventListener('click', (e) => { e.stopPropagation(); Speech.word(curRow()[W]); pulse(el.speakB); });
    el.btnTips.addEventListener('click', toggleTips);
    $('btn-undo').addEventListener('click', undo);
    $('btn-more').addEventListener('click', () => { st.extraNew += 10; buildQueue(); showCard(); });

    // 例句朗讀（卡片 / 詳情共用）
    document.addEventListener('click', (e) => {
      const p = e.target.closest('.ex-play');
      if (p) { e.stopPropagation(); Speech.sentence(p.dataset.say); pulse(p); return; }
      const w = e.target.closest('[data-say-word]');
      if (w) { Speech.word(w.dataset.sayWord); pulse(w); }
    });

    // 字庫
    let t;
    $('search').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { br.q = e.target.value; refreshBrowse(); }, 120); });
    $('seg-status').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      document.querySelectorAll('#seg-status button').forEach((x) => x.classList.toggle('is-active', x === b));
      br.status = b.dataset.v; refreshBrowse();
    });
    $('sel-star').addEventListener('change', (e) => { br.star = +e.target.value; refreshBrowse(); });
    $('vlist').addEventListener('scroll', () => requestAnimationFrame(renderRows), { passive: true });
    $('vrows').addEventListener('click', (e) => { const r = e.target.closest('.vrow'); if (r) openDetail(+r.dataset.i); });
    window.addEventListener('resize', () => { br.start = br.end = -1; if (view === 'browse') renderRows(); });

    // 詳情動作
    $('detail-body').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const idx = +b.dataset.i, w = ROWS[idx][W], now = Date.now();
      if (b.dataset.act === 'master') { prog()[w] = [4, 60, 2.5, now + 60 * SRS.DAY, 0, now]; toast('已標記為熟練（60 天後再複習）'); }
      else { delete prog()[w]; toast('已重設進度'); }
      Store.saveSoon(); settingsDirty = true;
      $('dlg-detail').close();
      br.start = br.end = -1; renderRows();
    });

    // 設定
    $('btn-settings').addEventListener('click', () => { renderSettings(); $('dlg-settings').showModal(); });
    wireSettings();
    Sync.onChange(() => { if ($('dlg-settings').open) { const el = $('sync-status'); if (el || Store.getSyncCode()) { const keep = $('dlg-settings').querySelector('.dlg-body').scrollTop; renderSettings(); $('dlg-settings').querySelector('.dlg-body').scrollTop = keep; } } });
    Sync.onMerged = () => {
      Object.assign(S, Store.settings); updateStreak();
      if ($('dlg-settings').open) settingsDirty = true;
      else { buildQueue(); showCard({ silent: true }); if (view === 'browse') refreshBrowse(); if (view === 'stats') renderStats(); }
    };
    $('dlg-settings').addEventListener('close', () => {
      if (settingsDirty) { settingsDirty = false; buildQueue(); showCard({ silent: true }); if (view === 'browse') refreshBrowse(); if (view === 'stats') renderStats(); }
    });
    $('dlg-detail').addEventListener('close', () => {
      if (settingsDirty) { settingsDirty = false; buildQueue(); showCard({ silent: true }); }
    });
    document.querySelectorAll('.dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

    // 隔天自動刷新
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && st.builtDay !== Store.dayKey()) { st.extraNew = 0; buildQueue(); showCard({ silent: true }); updateStreak(); }
    });

    // 鍵盤
    document.addEventListener('keydown', onKey);

    updateStreak();
    buildQueue();
    switchView((location.hash || '#study').slice(1));
    showCard({ silent: true });
    $('loader').classList.add('is-done');
  }

  function toggleTips() {
    const open = !el.tipsWrap.classList.contains('open');
    el.tipsWrap.classList.toggle('open', open);
    el.btnTips.setAttribute('aria-expanded', open);
  }

  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag) || anyDialogOpen()) return;
    if (view !== 'study') return;
    const k = e.key;
    if (curIdx() === undefined) return;
    if (k === ' ' || k === 'Enter') {
      e.preventDefault();
      if (document.activeElement && document.activeElement.tagName === 'BUTTON' && k === 'Enter') return;
      if (!st.revealed) reveal(); else rate(3);
    } else if (['1', '2', '3', '4'].includes(k)) {
      if (st.revealed) rate(+k); else reveal();
    } else if (k === 's' || k === 'S' || k === 'ArrowUp') {
      e.preventDefault(); Speech.word(curRow()[W]); pulse(st.revealed ? el.speakB : (el.speak.hidden ? el.speakB : el.speak));
    } else if (k === 'e' || k === 'E') {
      const r = curRow(); if (r[E1]) { Speech.sentence(r[E1]); } if (!st.revealed) reveal();
    } else if (k === 't' || k === 'T') {
      if (!st.revealed) reveal(); toggleTips();
    } else if (k === 'z' || k === 'Z' || k === 'Backspace') {
      undo();
    } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
      if (st.revealed) setFlip(el.card.dataset.flipped !== 'true');
    }
  }

  init();
})();
