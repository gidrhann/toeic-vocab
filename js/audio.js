/* ============================================================
 * Speech：單字優先播放「真人錄音」(Free Dictionary API)，
 * 找不到或離線時退回瀏覽器內建 TTS；例句使用 TTS。
 * ============================================================ */
(function () {
  const cache = new Map();   // word -> url | null
  let token = 0;             // 避免舊請求在新卡片出現後才播放
  let voice = null;
  let curAudio = null;

  function pickVoice() {
    if (!('speechSynthesis' in window)) return;
    const list = speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
    if (!list.length) return;
    const score = (v) => {
      let s = 0;
      if (/en[-_]US/i.test(v.lang)) s += 10;
      if (/natural|online/i.test(v.name)) s += 8;
      if (/google us english/i.test(v.name)) s += 6;
      if (/aria|jenny|guy|samantha|ava|allison/i.test(v.name)) s += 4;
      if (/zira|david|mark/i.test(v.name)) s += 2;
      return s;
    };
    voice = list.sort((a, b) => score(b) - score(a))[0];
  }
  if ('speechSynthesis' in window) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }

  function stop() {
    token++;
    if (curAudio) { try { curAudio.pause(); } catch (e) { /* noop */ } curAudio = null; }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  function tts(text, rate) {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    if (voice) u.voice = voice;
    u.rate = rate || 0.9;
    speechSynthesis.speak(u);
  }

  async function lookup(word) {
    const key = word.toLowerCase();
    if (cache.has(key)) return cache.get(key);
    let url = null;
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 2500);
      const res = await fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(key), { signal: ctl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const all = [];
        for (const e of data) for (const p of (e.phonetics || [])) if (p.audio) all.push(p.audio);
        url = all.find((a) => /-us\.mp3/i.test(a)) || all.find((a) => /-uk\.mp3/i.test(a)) || all[0] || null;
        if (url && url.startsWith('//')) url = 'https:' + url;
      }
    } catch (e) { /* 離線或逾時：退回 TTS */ }
    cache.set(key, url);
    return url;
  }

  const isSingle = (w) => /^[A-Za-z][A-Za-z'’-]*$/.test(w);

  const Speech = {
    /** 預先查詢下一張卡的錄音，降低等待時間 */
    prefetch(word) {
      if (Store.settings.humanVoice && isSingle(word)) lookup(word);
    },

    async word(word) {
      stop();
      const my = token;
      const rate = Store.settings.rate;
      if (Store.settings.humanVoice && isSingle(word)) {
        const url = await lookup(word);
        if (my !== token) return;
        if (url) {
          try {
            const a = new Audio(url);
            curAudio = a;
            a.playbackRate = Math.min(1, rate + 0.1);
            await a.play();
            return;
          } catch (e) { /* 播放失敗 → TTS */ }
        }
      }
      if (my === token) tts(word, rate);
    },

    sentence(text) {
      stop();
      tts(text, Store.settings.rate);
    },

    stop,
  };

  window.Speech = Speech;
})();
