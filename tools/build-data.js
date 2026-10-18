/**
 * 將 Hugging Face 的 kknono668/toeic-vocab-tw 原始 JSON (約 22MB)
 * 精簡成網頁可直接載入的 data/vocab.js (file:// 也能開啟，不需要伺服器)。
 *
 * 用法：node tools/build-data.js
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'data', 'raw', 'toeic_vocabulary.json');
const OUT = path.join(__dirname, '..', 'data', 'vocab.js');

const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
console.log('原始筆數:', raw.length);

const POS = {
  noun: 'n.', verb: 'v.', adjective: 'adj.', adverb: 'adv.', preposition: 'prep.',
  conjunction: 'conj.', pronoun: 'pron.', determiner: 'det.', interjection: 'interj.',
  phrase: 'phr.', idiom: 'idiom', auxiliary: 'aux.', article: 'art.', numeral: 'num.',
  'noun phrase': 'n. phr.', 'verb phrase': 'v. phr.', 'adverbial phrase': 'adv. phr.',
  'proper noun': 'proper n.', 'prepositional phrase': 'prep. phr.', 'verb (passive)': 'v. (被動)',
  gerund: 'gerund', abbreviation: 'abbr.', 'modal verb': 'modal v.', prefix: 'prefix',
  number: 'num.', 'adjective phrase': 'adj. phr.',
};

const SCORES = ['0-400', '400-600', '600-780', '780-900', '900+'];
const cats = [];
const seen = new Set();
const unknownPos = new Set();
const rows = [];

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

for (const x of raw) {
  const word = clean(x.english_word);
  const zh = clean(x.chinese_definition);
  if (!word || !zh) continue;
  const key = word.toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);

  let ci = cats.indexOf(x.category);
  if (ci < 0) { cats.push(x.category); ci = cats.length - 1; }

  const si = Math.max(0, SCORES.indexOf(x.toeic_score_range));

  const pos = (x.parts_of_speech || []).map((p) => {
    const k = String(p).toLowerCase();
    if (!POS[k]) unknownPos.add(k);
    return POS[k] || k;
  }).join(' / ');

  // 詞形變化：攤平、去重、排除原字
  const forms = [];
  for (const wf of x.word_forms || []) {
    for (const f of wf.forms || []) {
      const t = clean(f);
      if (t && t.toLowerCase() !== key && !forms.includes(t)) forms.push(t);
    }
  }

  const ex = x.examples || [];
  const tips = x.exam_tips || [];

  rows.push([
    word,                                   // 0 英文
    zh,                                     // 1 中文
    pos,                                    // 2 詞性
    x.star_rating || 1,                     // 3 星級 (1-5)
    si,                                     // 4 分數區間索引
    ci,                                     // 5 分類索引
    ex[0] ? clean(ex[0].english) : '',      // 6 例句1 英
    ex[0] ? clean(ex[0].chinese) : '',      // 7 例句1 中
    ex[1] ? clean(ex[1].english) : '',      // 8 例句2 英
    ex[1] ? clean(ex[1].chinese) : '',      // 9 例句2 中
    forms.slice(0, 6).join(' · '),          // 10 詞形變化
    tips.slice(0, 2).map(clean),            // 11 考試技巧 (取前 2 則)
  ]);
}

if (unknownPos.size) console.log('未對應的詞性:', [...unknownPos]);

// 預設順序：星級高的先出現，同星級保持原資料順序
rows.forEach((r, i) => r.push(i));
rows.sort((a, b) => b[3] - a[3] || a[12] - b[12]);
rows.forEach((r) => r.pop());

const payload = { v: 1, scores: SCORES, cats, rows };
fs.writeFileSync(OUT, 'window.TOEIC_DATA=' + JSON.stringify(payload) + ';', 'utf8');
console.log('輸出筆數:', rows.length, '→', OUT);
console.log('檔案大小: ' + (fs.statSync(OUT).size / 1024 / 1024).toFixed(2) + ' MB');
