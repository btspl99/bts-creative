// Document assistant for BTS PDF Pro — 100% offline, no AI model and no internet.
// • Extractive summary: TextRank-style sentence ranking (sentences are copied from the document, never invented)
// • Key points (best sentence per section) and keywords / topics (RAKE-style phrase scoring + TF-IDF)
// • "Ask the document": BM25 keyword search over passages, with page links
// • Study material: flashcards and quiz questions built from headings and definition sentences
import { X, copyText, toCsv, baseName, textPdf } from './ctx.js';

const { h } = UI;
const STOP = new Set(('a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just let me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up upon very was we were what when where which while who whom why will with would you your yours yourself yourselves may might must shall within without into onto per via using used use one two three also however therefore thus page chapter figure table see etc ie eg below above many much every each like make made takes take get gets got well way ways back main mainly part refer refers referred mean means meant call called calls known define defined defines include includes including following based various different important example examples called'
  + ' है हैं के का की को में से और पर भी यह वह थे था थी ने ही तो इस उस एक आहे आहेत व या ते हे ची चा चे ला ने त मध्ये आणि होते').split(/\s+/));
const PRON = /^(it|this|that|these|those|there|they|he|she|we|you|i|which|what|who|here|such|one|each|every|another|other|its|their|our|his|her)$/i;

// ---------- text helpers
export function stem(w) {
  if (!/^[a-z]+$/.test(w) || w.length < 4) return w;
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('sses')) return w.slice(0, -2);
  if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
  if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('ly') && w.length > 5) return w.slice(0, -2);
  if (w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}
export const words = s => (String(s).toLowerCase().normalize('NFC').match(/[\p{L}\p{M}\p{N}]+/gu) || []);
export const toks = s => words(s).filter(w => !STOP.has(w) && (w.length > 2 || /[ऀ-ॿ]/.test(w)) && !/^\d+$/.test(w)).map(stem);
const hash = s => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };
const rng = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const shuffle = (a, r) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const clip = (s, n = 200) => s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s;

// ---------- document model: lines → headings / paragraphs → sentences (with page + y)
export async function pageLines(pg) {
  const { items } = await X.pageText(pg); const rows = [];
  for (const it of items) {
    if (!it.str) continue; const sz = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10; const y = it.transform[5], x = it.transform[4];
    let ln = rows.find(l => Math.abs(l.y - y) < sz * 0.45); if (!ln) { ln = { y, sz, parts: [] }; rows.push(ln); }
    ln.parts.push({ x, str: it.str, w: it.width || 0, sz }); ln.sz = Math.max(ln.sz, sz);
  }
  // split each row into segments at wide gaps; two long segments = two text columns, many short ones = a table row
  const join = parts => { let s = '', end = null; for (const p of parts) { if (end != null && p.x - end > p.sz * 0.15 && !/\s$/.test(s) && !/^\s/.test(p.str)) s += ' '; s += p.str; end = p.x + p.w; } return s.replace(/\s+/g, ' ').trim(); };
  const lines = []; let twoCol = 0;
  for (const r of rows) {
    r.parts.sort((a, b) => a.x - b.x); const segs = []; let cur = [];
    for (const p of r.parts) { const last = cur[cur.length - 1]; if (last && p.x - (last.x + last.w) > p.sz * 1.6) { segs.push(cur); cur = []; } cur.push(p); }
    if (cur.length) segs.push(cur);
    const texts = segs.map(join).filter(Boolean); if (!texts.length) continue;
    const spaced = /\S {3,}\S/.test(r.parts.map(p => p.str).join(''));
    if (texts.length === 2 && texts.every(t => t.length >= 22 && !/^[-+]?[\d.,%]+$/.test(t)) && !spaced) {
      segs.forEach((sg, k) => lines.push({ y: r.y, sz: r.sz, x: sg[0].x, rx: sg[sg.length - 1].x + sg[sg.length - 1].w, text: texts[k], col: k })); twoCol++;
    } else lines.push({ y: r.y, sz: r.sz, x: r.parts[0].x, rx: r.parts[r.parts.length - 1].x + r.parts[r.parts.length - 1].w, text: join(r.parts), table: (texts.length >= 2 && !/[.!?।:;]$/.test(texts[texts.length - 1])) || spaced });
  }
  lines.sort((a, b) => b.y - a.y || a.x - b.x);
  if (twoCol >= 3) {
    // reading order for a two-column page: text above the columns, the left column, the right column, then the rest
    const colLines = lines.filter(l => l.col != null); const top = Math.max(...colLines.map(l => l.y)), bottom = Math.min(...colLines.map(l => l.y));
    const split = Math.min(...colLines.filter(l => l.col === 1).map(l => l.x));
    const inCols = l => l.y <= top + l.sz * 0.5 && l.y >= bottom - l.sz * 0.5;
    const above = lines.filter(l => l.y > top + l.sz * 0.5), below = lines.filter(l => l.y < bottom - l.sz * 0.5);
    const left = lines.filter(l => inCols(l) && l.x < split - 2), right = lines.filter(l => inCols(l) && l.x >= split - 2);
    return [...above, ...left, ...right, ...below].filter(l => l.text);
  }
  return lines.filter(l => l.text);
}
const modelCache = new Map();
export async function docModel(idx) {
  const S = X.S; idx = idx || S.pages.map((_, i) => i);
  const key = idx.join(',') + '|' + idx.map(i => S.pages[i].src + ':' + S.pages[i].index).join(',');
  if (modelCache.has(key)) return modelCache.get(key);
  const pages = []; const hist = {};
  for (const i of idx) { const lines = await pageLines(S.pages[i]); pages.push({ i, lines }); lines.forEach(l => { const k = Math.round(l.sz); hist[k] = (hist[k] || 0) + l.text.length; }); }
  const body = +(Object.entries(hist).sort((a, b) => b[1] - a[1])[0]?.[0] || 11);
  const M = { body, sections: [], sentences: [], paras: [], headings: [] };
  let sec = { title: '', page: idx[0] ?? 0, sents: [] }; M.sections.push(sec);
  for (const P of pages) {
    let para = null;
    const flush = () => { if (para && para.text.trim()) { M.paras.push(para); splitSentences(para.text).forEach(t => { const s = { text: t, page: P.i, y: para.y, sec: M.sections.length - 1, k: M.sentences.length, para: M.paras.length - 1 }; s.toks = toks(t); if (s.toks.length >= 2 && t.length >= 15) { M.sentences.push(s); sec.sents.push(s); } }); } para = null; };
    for (let li = 0; li < P.lines.length; li++) {
      const l = P.lines[li]; const t = l.text;
      const heading = l.sz >= body * 1.18 && t.length <= 110 && words(t).length <= 14 && !/[,;]$/.test(t);
      if (l.table && !heading) { flush(); continue; } // table rows are not prose
      if (heading) { flush(); sec = { title: t.replace(/[.:]+$/, ''), page: P.i, y: l.y, sents: [] }; M.sections.push(sec); M.headings.push(sec); continue; }
      const prev = P.lines[li - 1];
      const gap = prev ? prev.y - l.y : 0;
      if (!para || gap > Math.max(prev.sz, l.sz) * 1.65 || Math.abs(l.sz - para.sz) > 1.5 || (/[.!?।:]$/.test(para.text) && l.x > para.x + l.sz * 1.5)) { flush(); para = { text: t, y: l.y, sz: l.sz, x: l.x, page: P.i }; }
      else para.text = para.text.endsWith('-') ? para.text.slice(0, -1) + t : para.text + ' ' + t;
    }
    flush();
  }
  modelCache.set(key, M); if (modelCache.size > 12) modelCache.delete(modelCache.keys().next().value);
  return M;
}
export function splitSentences(text) {
  return text.replace(/\s+/g, ' ').split(/(?<=[.!?।])\s+(?=["'(\[]?[\p{Lu}\p{N}ऀ-ॿ])/u).map(s => s.trim()).filter(Boolean);
}
export const clearCache = () => modelCache.clear();

// ---------- TextRank
export function textRank(sents, { d = 0.85, iters = 40 } = {}) {
  const n = sents.length; if (!n) return [];
  const T = sents.map(s => new Set(s.toks)); const W = Array.from({ length: n }, () => new Float32Array(n)); const out = new Float32Array(n);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    let ov = 0; const [a, b] = T[i].size < T[j].size ? [T[i], T[j]] : [T[j], T[i]]; for (const w of a) if (b.has(w)) ov++;
    if (!ov) continue; const v = ov / (Math.log(T[i].size + 1) + Math.log(T[j].size + 1)); W[i][j] = W[j][i] = v; out[i] += v; out[j] += v;
  }
  let pr = new Float32Array(n).fill(1 / n);
  for (let it = 0; it < iters; it++) {
    const nx = new Float32Array(n).fill((1 - d) / n);
    for (let j = 0; j < n; j++) { if (!out[j]) { for (let i = 0; i < n; i++) nx[i] += d * pr[j] / n; continue; } const c = d * pr[j] / out[j]; const row = W[j]; for (let i = 0; i < n; i++) if (row[i]) nx[i] += c * row[i]; }
    pr = nx;
  }
  return Array.from(pr);
}
function ranked(M) {
  if (M._rank) return M._rank;
  let sents = M.sentences; let pool = sents;
  if (sents.length > 1200) { const df = tfidfScores(M); pool = sents.slice().sort((a, b) => sentScore(b, df) - sentScore(a, df)).slice(0, 1200); }
  const r = textRank(pool); const headTok = new Set(M.headings.flatMap(hd => toks(hd.title)));
  pool.forEach((s, i) => { let v = r[i]; const first = M.sections[s.sec]?.sents[0] === s; if (first) v *= 1.12; if (s.toks.some(t => headTok.has(t))) v *= 1.08; if (s.text.length < 40) v *= 0.8; if (s.text.length > 320) v *= 0.85; s.score = v; });
  sents.forEach(s => { if (s.score == null) s.score = 0; });
  M._rank = pool.slice().sort((a, b) => b.score - a.score); return M._rank;
}
function tfidfScores(M) { const df = new Map(); M.paras.forEach(p => new Set(toks(p.text)).forEach(t => df.set(t, (df.get(t) || 0) + 1))); return { df, N: M.paras.length || 1 }; }
const sentScore = (s, { df, N }) => s.toks.reduce((a, t) => a + Math.log(1 + N / (df.get(t) || 1)), 0) / Math.sqrt(s.toks.length + 1);

// ---------- public analysis API
const LEN = { short: [0.08, 3, 5], medium: [0.16, 5, 10], long: [0.3, 8, 20] };
export async function summarize({ scope = 'doc', length = 'medium', pages } = {}) {
  const M = await docModel(pages || scopePages(scope)); const r = ranked(M);
  const [f, lo, hi] = LEN[length] || LEN.medium; const n = Math.max(1, Math.min(r.length, Math.max(lo, Math.min(hi, Math.round(M.sentences.length * f)))));
  const pick = []; for (const s of r) { if (pick.length >= n) break; if (pick.some(p => overlap(p, s) > 0.6)) continue; pick.push(s); }
  pick.sort((a, b) => a.k - b.k);
  return { sentences: pick.map(s => ({ text: s.text, page: s.page, y: s.y })), total: M.sentences.length, length, scope };
}
const overlap = (a, b) => { const A = new Set(a.toks); let o = 0; b.toks.forEach(t => A.has(t) && o++); return o / Math.max(1, Math.min(A.size, b.toks.length)); };
export async function keyPoints({ scope = 'doc', pages, max = 8 } = {}) {
  const M = await docModel(pages || scopePages(scope)); ranked(M); const out = [];
  const secs = M.sections.filter(s => s.sents.length);
  if (secs.length >= 3) for (const s of secs) { const best = s.sents.slice().sort((a, b) => b.score - a.score)[0]; if (best) out.push({ text: shortPoint(best.text), page: best.page, y: best.y, section: s.title }); }
  for (const s of ranked(M)) { if (out.length >= max) break; if (out.some(o => o.text === shortPoint(s.text))) continue; out.push({ text: shortPoint(s.text), page: s.page, y: s.y, section: M.sections[s.sec]?.title || '' }); }
  return out.slice(0, Math.max(max, secs.length)).sort((a, b) => a.page - b.page || b.y - a.y);
}
const shortPoint = t => { t = t.replace(/^(however|moreover|also|therefore|thus|in addition|for example),?\s+/i, ''); t = cap(t); if (t.length <= 180) return t; const cut = t.slice(0, 180); const k = Math.max(cut.lastIndexOf(';'), cut.lastIndexOf(', ')); return (k > 80 ? cut.slice(0, k) : cut.replace(/\s+\S*$/, '')) + '…'; };
export async function keywords({ scope = 'doc', pages, max = 14 } = {}) {
  const M = await docModel(pages || scopePages(scope));
  const cnt = new Map(), surf = new Map(), pagesOf = new Map(), inHead = new Set();
  const add = (key, s, page, w) => { cnt.set(key, (cnt.get(key) || 0) + w); const m = surf.get(key) || new Map(); m.set(s, (m.get(s) || 0) + 1); surf.set(key, m); if (!pagesOf.has(key)) pagesOf.set(key, new Set()); pagesOf.get(key).add(page); };
  const texts = M.sentences.map(s => [s.text, s.page, false]).concat(M.headings.map(hd => [hd.title, hd.page, true]));
  for (const [t, page, head] of texts) {
    const ws = (t.normalize('NFC').match(/[\p{L}\p{M}\p{N}'’-]+|[.,;:!?()]/gu) || []); let run = [];
    const end = () => {
      for (let n = 1; n <= 2; n++) for (let i = 0; i + n <= run.length; i++) {
        const g = run.slice(i, i + n); const key = g.map(w => stem(w.toLowerCase())).join(' ');
        add(key, g.join(' '), page, head ? 2 : 1); if (head) inHead.add(key);
      }
      run = [];
    };
    for (const w of ws) { const lw = w.toLowerCase(); if (/^[.,;:!?()]$/.test(w) || STOP.has(lw) || /\d/.test(w) || (lw.length < 3 && !/[\u0900-\u097F]/.test(lw))) end(); else run.push(w.replace(/^['’]+|['’]+$/g, '')); }
    end();
  }
  const N = Math.max(1, M.sentences.length);
  const cand = [...cnt.entries()].map(([k, c]) => { const n = k.split(' ').length; const df = pagesOf.get(k).size; return { k, c, n, score: c * (n > 1 ? 1.7 : 1) * (inHead.has(k) ? 1.6 : 1) * (1 + Math.log(1 + df)) }; })
    .filter(x => x.c >= (N > 12 ? 2 : 1) && (x.n === 1 ? x.k.length > 3 : true));
  cand.sort((a, b) => b.score - a.score);
  const out = [];
  for (const c of cand) {
    if (out.length >= max) break;
    // a bigram replaces its words only when it is about as frequent; otherwise keep the single word
    if (out.some(o => o.k === c.k || (o.n > 1 && o.k.split(' ').includes(c.k) && o.c >= c.c * 0.6) || (c.n > 1 && c.k.split(' ').includes(o.k) && c.c < o.c * 0.6))) continue;
    const s = [...surf.get(c.k).entries()].sort((a, b) => b[1] - a[1])[0][0];
    out.push({ k: c.k, n: c.n, c: c.c, term: /^[A-Z][a-z]+( [a-z]+)*$/.test(s) ? s.toLowerCase() : s, count: c.c, pages: [...pagesOf.get(c.k)].sort((a, b) => a - b) });
  }
  return out.map(({ term, count, pages }) => ({ term, count, pages }));
}
// BM25 over passages of up to three sentences
export async function ask(q, { scope = 'doc', pages, max = 5 } = {}) {
  const M = await docModel(pages || scopePages(scope));
  if (!M._pass) {
    const byPara = new Map(); M.sentences.forEach(s => { if (!byPara.has(s.para)) byPara.set(s.para, []); byPara.get(s.para).push(s); });
    const P = []; for (const ss of byPara.values()) { for (let i = 0; i < ss.length; i += 3) { const grp = ss.slice(i, i + 3); P.push({ text: grp.map(s => s.text).join(' '), page: grp[0].page, y: grp[0].y, toks: grp.flatMap(s => s.toks) }); } }
    const df = new Map(); P.forEach(p => new Set(p.toks).forEach(t => df.set(t, (df.get(t) || 0) + 1)));
    M._pass = { P, df, avg: P.reduce((n, p) => n + p.toks.length, 0) / Math.max(1, P.length) };
  }
  const { P, df, avg } = M._pass; const qt = [...new Set(toks(q))]; if (!qt.length || !P.length) return [];
  const N = P.length, k1 = 1.4, b = 0.75; const ql = q.toLowerCase().trim();
  const res = P.map(p => {
    const tf = new Map(); p.toks.forEach(t => tf.set(t, (tf.get(t) || 0) + 1)); let s = 0, hit = 0;
    for (const t of qt) { const f = tf.get(t) || 0; if (!f) continue; hit++; const idf = Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5)); s += idf * f * (k1 + 1) / (f + k1 * (1 - b + b * p.toks.length / avg)); }
    if (hit && qt.length > 1) s *= 1 + 0.5 * (hit / qt.length); if (ql.length > 4 && p.text.toLowerCase().includes(ql)) s *= 1.5;
    return { p, s };
  }).filter(r => r.s > 0).sort((a, b) => b.s - a.s).slice(0, max);
  const top = res[0]?.s || 1;
  return res.map(({ p, s }) => ({ text: p.text, page: p.page, y: p.y, score: Math.round(s / top * 100), html: markTerms(p.text, qt) }));
}
const escH = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function markTerms(text, qt) { const set = new Set(qt); return escH(text).replace(/[\p{L}\p{M}\p{N}]+/gu, w => set.has(stem(w.toLowerCase())) ? `<mark>${w}</mark>` : w); }

// ---------- study material
const DEF = /^(?:(?:the|a|an)\s+)?([\p{L}][\p{L}\p{N}\s'’-]{1,60}?)\s+(is defined as|are defined as|is known as|are known as|is called|are called|refers to|refer to|stands for|means|mean|is|are)\s+(.{12,})$/iu;
export async function studyMaterial({ scope = 'doc', pages, maxQuiz = 10 } = {}) {
  const M = await docModel(pages || scopePages(scope)); ranked(M);
  const cards = []; const seen = new Set();
  for (const s of M.sentences) {
    const m = DEF.exec(s.text.replace(/\s+/g, ' ')); if (!m) continue;
    let [, subj, verb, pred] = m; subj = subj.trim(); pred = pred.trim().replace(/[.!?]+$/, '');
    let term, def;
    if (/called|known as/i.test(verb)) { term = pred.split(/[,;(]| which | that /)[0].trim(); def = subj; if (words(term).length > 4) continue; }
    else { term = subj; def = pred; }
    const tw = words(term);
    if (!tw.length || tw.length > 5 || PRON.test(tw[0]) || /^\d/.test(def) || /\d/.test(term) || def.length < 12 || STOP.has(tw[tw.length - 1])) continue;
    const key = tw.map(stem).join(' '); if (seen.has(key)) continue; seen.add(key);
    cards.push({ kind: 'definition', front: cap(term), back: cap(s.text), answer: cap(def), term: term, page: s.page, y: s.y, sentence: s.text });
  }
  for (const sec of M.sections) {
    if (!sec.title || !sec.sents.length) continue;
    const t = sec.title.replace(/^(chapter|unit|lesson|section|part)\s*[\dIVXivx]+[.:)\-–]?\s*/i, '').replace(/^\d+(\.\d+)*[.)]?\s+/, '').trim(); if (!t) continue;
    const best = sec.sents.slice().sort((a, b) => b.score - a.score).slice(0, 2).sort((a, b) => a.k - b.k);
    cards.push({ kind: 'topic', front: `Explain: ${t}`, back: best.map(s => s.text).join(' '), page: sec.page, y: sec.y, term: t });
  }
  // quiz
  const defs = cards.filter(c => c.kind === 'definition'); const r = rng(hash(defs.map(d => d.term).join('|') || 'q'));
  const kw = (await keywords({ pages: pages || scopePages(scope), max: 20 })).map(k => k.term);
  const pool = [...new Set(defs.map(d => cap(d.term)).concat(kw.filter(k => words(k).length <= 2).map(cap)))];
  const quiz = [];
  for (const d of defs) {
    if (quiz.length >= maxQuiz) break;
    const re = new RegExp('\\b' + d.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
    const defPool = pool.filter(p => defs.some(x => cap(x.term) === p));
    const pick = list => shuffle(list.filter(p => p.toLowerCase() !== d.term.toLowerCase() && !p.toLowerCase().includes(d.term.toLowerCase()) && !d.term.toLowerCase().includes(p.toLowerCase())), r);
    let distract = pick(defPool).slice(0, 3); if (distract.length < 3) distract = distract.concat(pick(pool).filter(p => !distract.includes(p))).slice(0, 3);
    if (distract.length >= 2 && re.test(d.sentence)) {
      const opts = shuffle([cap(d.term), ...distract], r);
      quiz.push({ type: 'blank', q: d.sentence.replace(re, '_____'), options: opts, answer: opts.indexOf(cap(d.term)), page: d.page, y: d.y });
    }
    if (quiz.length >= maxQuiz) break;
    if (distract.length && re.test(d.sentence) && r() < 0.6) {
      const isTrue = r() < 0.5; const stmt = isTrue ? d.sentence : d.sentence.replace(re, distract[0].toLowerCase() === d.sentence.match(re)[0].toLowerCase() ? distract[1] || distract[0] : distract[0]);
      quiz.push({ type: 'tf', q: stmt, options: ['True', 'False'], answer: isTrue ? 0 : 1, page: d.page, y: d.y });
    }
  }
  return { cards, quiz };
}
export const studyCsv = (st, which) => which === 'quiz'
  ? toCsv([['Type', 'Question', 'Option A', 'Option B', 'Option C', 'Option D', 'Answer', 'Page'], ...st.quiz.map(q => [q.type === 'tf' ? 'True/False' : 'Fill in the blank', q.q, ...[0, 1, 2, 3].map(i => q.options[i] || ''), q.options[q.answer], q.page + 1])])
  : toCsv([['Front', 'Back', 'Page'], ...st.cards.map(c => [c.front, c.back, c.page + 1])]);
export async function studyPdf(st) {
  const L = 'ABCD'; const B = [{ text: 'Study material', size: 22, bold: true }, { text: `${X.S.fileName || 'Document'} · ${st.cards.length} flashcards · ${st.quiz.length} quiz questions · made offline by BTS PDF Pro`, size: 9, color: [0.4, 0.4, 0.45], after: 16 }];
  if (st.cards.length) { B.push({ text: 'Flashcards', size: 16, bold: true, before: 4 }); st.cards.forEach((c, i) => { B.push({ text: `${i + 1}. ${c.front}`, size: 11, bold: true, after: 2 }, { text: c.back + `  (page ${c.page + 1})`, size: 10.5, indent: 14, after: 8 }); }); }
  if (st.quiz.length) {
    B.push({ text: 'Quiz', size: 16, bold: true, pageBreak: true });
    st.quiz.forEach((q, i) => { B.push({ text: `${i + 1}. ${q.type === 'tf' ? 'True or false: ' : ''}${q.q}`, size: 11, bold: true, after: 3 }); q.options.forEach((o, k) => B.push({ text: `${L[k]})  ${o}`, size: 10.5, indent: 14, after: 1 })); B.push({ text: '', size: 4 }); });
    B.push({ text: 'Answer key', size: 14, bold: true, pageBreak: true });
    B.push({ text: st.quiz.map((q, i) => `${i + 1}: ${L[q.answer]} (${q.options[q.answer]}) — p.${q.page + 1}`).join('\n'), size: 10.5 });
  }
  return textPdf(B);
}
export function summaryText(sum, kp, kw) {
  let t = `Summary of ${X.S.fileName || 'document'} (${sum.length}, extractive — sentences selected from the document)\n\n`;
  t += sum.sentences.map(s => `• ${s.text} [p.${s.page + 1}]`).join('\n');
  if (kp?.length) t += '\n\nKey points\n' + kp.map(k => `• ${k.text} [p.${k.page + 1}]`).join('\n');
  if (kw?.length) t += '\n\nKeywords: ' + kw.map(k => k.term).join(', ');
  return t + '\n';
}
export async function summaryPdfBytes(sum, kp, kw) {
  const B = [{ text: 'Summary', size: 20, bold: true }, { text: `${X.S.fileName || 'Document'} · extractive summary (${sum.length}) · made offline by BTS PDF Pro`, size: 9, color: [0.4, 0.4, 0.45], after: 14 }];
  sum.sentences.forEach(s => B.push({ text: `•  ${s.text}  (p.${s.page + 1})`, size: 11, after: 5 }));
  if (kp?.length) { B.push({ text: 'Key points', size: 14, bold: true, before: 10 }); kp.forEach(k => B.push({ text: `•  ${k.text}`, size: 10.5, after: 4 })); }
  if (kw?.length) { B.push({ text: 'Keywords', size: 14, bold: true, before: 10 }); B.push({ text: kw.map(k => k.term).join(' · '), size: 10.5 }); }
  const ref = X.S.pages[0]; return textPdf(B, { size: [ref?.w > 100 ? Math.min(ref.w, 842) : 595.28, ref?.h > 100 ? Math.min(ref.h, 1191) : 841.89] });
}
export async function insertSummaryPage(sum, kp, kw, where = 'end') {
  const bytes = await summaryPdfBytes(sum, kp, kw); const at = where === 'start' ? 0 : X.S.pages.length;
  const added = await X.appendPdf(new Uint8Array(bytes), 'Summary', at); X.commit('Insert summary page'); await X.refreshAfterPageOp(); X.scrollToPage(at);
  UI.toast(`Summary inserted as ${added.length} new page(s) — save to keep it`, 'ok'); return added.length;
}
function scopePages(scope) { const S = X.S; if (scope === 'page') return [X.currentPageIdx()]; if (Array.isArray(scope)) return scope; return S.pages.map((_, i) => i); }

// =====================================================================================  panel UI
const A = { tab: 'summary', scope: 'doc', len: 'medium', sum: null, kp: null, kw: null, ans: null, q: '', st: null, quizState: {}, flip: {} };
let panel = null;
export function isOpen() { return !!panel && !panel.classList.contains('hidden'); }
export function openAssistant(tab) {
  if (!X.S.pages.length) return UI.toast('Open a PDF first');
  if (!panel) { panel = h('div', { class: 'assist hidden', id: 'assist' }); document.querySelector('.mid').append(panel); }
  if (tab) A.tab = tab; panel.classList.remove('hidden'); document.querySelector('.mid').classList.add('wide-right'); render();
  if (A.tab === 'summary' && !A.sum) runSummary(); else if (A.tab === 'points' && !A.kp) runPoints(); else if (A.tab === 'study' && !A.st) runStudy();
  if (A.tab === 'ask') setTimeout(() => panel.querySelector('.as-ask input')?.focus(), 30);
}
export function closeAssistant() { panel?.classList.add('hidden'); document.querySelector('.mid')?.classList.remove('wide-right'); }
export function onDocChanged() { clearCache(); Object.assign(A, { sum: null, kp: null, kw: null, ans: null, st: null, quizState: {}, flip: {} }); if (isOpen()) { if (!X.S.pages.length) closeAssistant(); else render(); } }
const go = (page, y) => X.scrollToPage(page, y != null ? y + 14 : null);
async function runSummary() { A.sum = await summarize({ scope: A.scope, length: A.len }); render(); return A.sum; }
async function runPoints() { A.kp = await keyPoints({ scope: A.scope }); A.kw = await keywords({ scope: A.scope }); render(); }
async function runAsk(q) { A.q = q; A.ans = q.trim() ? await ask(q, { scope: A.scope }) : null; render(); }
async function runStudy() { A.st = await studyMaterial({ scope: A.scope }); A.quizState = {}; A.flip = {}; render(); }
export function setStudyView(v) { A.studyView = v; render(); }
function render() {
  if (!panel) return; panel.innerHTML = '';
  const tabs = h('div', { class: 'tabs' }, ...[['summary', 'Summary'], ['points', 'Key points'], ['ask', 'Ask'], ['study', 'Study']].map(([k, l]) => h('div', { class: 'tab' + (A.tab === k ? ' active' : ''), onclick: () => openAssistant(k) }, l)));
  const scope = h('select', { class: 'as-scope' }, h('option', { value: 'doc', selected: A.scope === 'doc' }, 'Whole document'), h('option', { value: 'page', selected: A.scope === 'page' }, 'Current page'));
  scope.onchange = () => { A.scope = scope.value; A.sum = A.kp = A.ans = A.st = null; openAssistant(A.tab); };
  panel.append(h('div', { class: 'panel-h as-head' }, h('span', { html: X.icon('bulb', 15) }), 'Document assistant', h('span', { class: 'grow' }), scope, h('button', { class: 'icon-btn', 'data-tip': 'Close', html: X.icon('close'), onclick: closeAssistant })), tabs);
  const b = h('div', { class: 'as-body' }); panel.append(b);
  const note = txt => h('div', { class: 'as-note' }, txt);
  const pgLink = (p, y) => h('a', { class: 'as-pg', onclick: e => { e.stopPropagation(); go(p, y); } }, 'p.' + (p + 1));
  if (A.tab === 'summary') {
    const seg = h('div', { class: 'seg' }, ...[['short', 'Short'], ['medium', 'Medium'], ['long', 'Long']].map(([k, l]) => h('button', { class: 'btn sm' + (A.len === k ? ' primary' : ''), onclick: () => { A.len = k; runSummary(); } }, l)));
    b.append(h('div', { class: 'row as-ctl' }, h('span', { class: 'muted' }, 'Length'), seg));
    if (!A.sum) b.append(note('Ranking sentences…'));
    else if (!A.sum.sentences.length) b.append(note('No readable text found. If this is a scan, run Tools › Recognize text (OCR) first.'));
    else {
      b.append(h('ul', { class: 'as-list' }, ...A.sum.sentences.map(s => h('li', { onclick: () => go(s.page, s.y) }, s.text, ' ', pgLink(s.page, s.y)))));
      b.append(h('div', { class: 'as-acts' }, h('button', { class: 'btn sm', onclick: async () => { await copyText(summaryText(A.sum)); UI.toast('Summary copied', 'ok'); } }, 'Copy'),
        h('button', { class: 'btn sm', onclick: () => exportSummary('txt') }, 'Save .txt…'), h('button', { class: 'btn sm', onclick: () => exportSummary('page') }, 'Insert as PDF page')));
    }
    b.append(note(`Extractive summary: ${A.sum ? A.sum.sentences.length + ' of ' + A.sum.total + ' sentences' : 'sentences'} picked from the document by an offline ranking method (TextRank). Nothing is generated or sent online.`));
  } else if (A.tab === 'points') {
    if (!A.kp) b.append(note('Finding key points…'));
    else {
      b.append(h('div', { class: 'as-sub' }, 'Key points'), h('ul', { class: 'as-list' }, ...A.kp.map(k => h('li', { onclick: () => go(k.page, k.y) }, k.section ? h('span', { class: 'as-sec' }, k.section) : null, k.text, ' ', pgLink(k.page, k.y)))));
      b.append(h('div', { class: 'as-sub' }, 'Keywords & topics'), h('div', { class: 'as-chips' }, ...A.kw.map(k => h('span', { class: 'chip', 'data-tip': `${k.count}× · pages ${k.pages.map(p => p + 1).join(', ')}`, onclick: () => { A.tab = 'ask'; runAsk(k.term); } }, k.term, h('b', {}, String(k.count))))));
      b.append(h('div', { class: 'as-acts' }, h('button', { class: 'btn sm', onclick: async () => { await copyText(A.kp.map(k => '• ' + k.text).join('\n') + '\n\nKeywords: ' + A.kw.map(k => k.term).join(', ')); UI.toast('Copied', 'ok'); } }, 'Copy')));
      b.append(note('Click a keyword to find where it is discussed.'));
    }
  } else if (A.tab === 'ask') {
    const inp = h('input', { type: 'text', placeholder: 'Ask about the document… e.g. what is evaporation', value: A.q });
    inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') runAsk(inp.value); };
    b.append(h('div', { class: 'row as-ask' }, inp, h('button', { class: 'btn sm primary', onclick: () => runAsk(inp.value) }, 'Search')));
    if (A.ans) {
      if (!A.ans.length) b.append(note('No passage matches those words. Try other keywords.'));
      A.ans.forEach(r => b.append(h('div', { class: 'as-hit', onclick: () => go(r.page, r.y) }, h('div', { class: 'as-meta' }, pgLink(r.page, r.y), h('span', { class: 'as-bar' }, h('i', { style: { width: r.score + '%' } }))), h('div', { html: r.html }))));
    }
    b.append(note('"Ask" finds the best-matching passages with a local keyword search (BM25). It shows text from your PDF — it does not write answers and works without internet.'));
  } else if (A.tab === 'study') {
    if (!A.st) { b.append(note('Building flashcards and quiz…')); return; }
    const { cards, quiz } = A.st;
    b.append(h('div', { class: 'as-acts' }, h('button', { class: 'btn sm', onclick: () => exportStudy('cards-csv') }, 'Flashcards CSV…'), h('button', { class: 'btn sm', onclick: () => exportStudy('quiz-csv') }, 'Quiz CSV…'), h('button', { class: 'btn sm', onclick: () => exportStudy('pdf') }, 'Study sheet PDF…')));
    const view = A.studyView || 'cards';
    b.append(h('div', { class: 'seg as-ctl' }, h('button', { class: 'btn sm' + (view === 'cards' ? ' primary' : ''), onclick: () => { A.studyView = 'cards'; render(); } }, `Flashcards (${cards.length})`), h('button', { class: 'btn sm' + (view === 'quiz' ? ' primary' : ''), onclick: () => { A.studyView = 'quiz'; render(); } }, `Quiz (${quiz.length})`)));
    if (view === 'cards') b.append(h('div', { class: 'as-sub' }, `Flashcards (${cards.length}) — click to flip`));
    if (view === 'cards' && !cards.length) b.append(note('No definitions ("… is / are / means / refers to …") or headings were found.'));
    if (view === 'cards') cards.forEach((c, i) => b.append(h('div', { class: 'fcard' + (A.flip[i] ? ' flipped' : ''), onclick: e => { if (e.target.closest('.as-pg')) return; A.flip[i] = !A.flip[i]; render(); } }, h('div', { class: 'fc-k' }, c.kind === 'topic' ? 'Topic' : 'Term', ' · ', pgLink(c.page, c.y)), h('div', { class: 'fc-t' }, A.flip[i] ? c.back : c.front))));
    const sc = Object.entries(A.quizState); const right = sc.filter(([k, v]) => quiz[k] && v === quiz[k].answer).length;
    if (view === 'quiz') b.append(h('div', { class: 'as-sub' }, `Quiz (${quiz.length})` + (sc.length ? ` — score ${right} / ${sc.length}` : '')));
    if (view === 'quiz' && !quiz.length) b.append(note('Not enough definitions to build quiz questions.'));
    if (view === 'quiz') quiz.forEach((q, i) => {
      const done = A.quizState[i] != null;
      b.append(h('div', { class: 'quiz' }, h('div', { class: 'qz-q' }, `${i + 1}. ${q.type === 'tf' ? 'True or false: ' : ''}${q.q}`),
        h('div', { class: 'qz-opts' }, ...q.options.map((o, k) => h('button', { class: 'btn sm' + (done && k === q.answer ? ' ok' : done && k === A.quizState[i] ? ' bad' : ''), disabled: done, onclick: () => { A.quizState[i] = k; render(); } }, o))),
        done ? h('div', { class: 'qz-fb' }, A.quizState[i] === q.answer ? '✓ Correct' : `✗ Answer: ${q.options[q.answer]}`, ' · ', pgLink(q.page, q.y)) : null));
    });
    if (view === 'quiz' && sc.length) b.append(h('div', { class: 'as-acts' }, h('button', { class: 'btn sm', onclick: () => { A.quizState = {}; render(); } }, 'Reset quiz')));
    b.append(note('Made from headings and definition sentences in your PDF. Check answers against the page — they are copied, not generated.'));
  }
}
export async function exportSummary(fmt = 'txt') {
  if (!X.S.pages.length) return;
  if (!A.sum) A.sum = await summarize({ scope: A.scope, length: A.len });
  if (!A.kp) { A.kp = await keyPoints({ scope: A.scope }); A.kw = await keywords({ scope: A.scope }); }
  if (fmt === 'page') { const v = await UI.form({ title: 'Insert summary as a new page', fields: [{ key: 'where', label: 'Position', type: 'select', value: 'end', options: [{ value: 'start', label: 'Before the first page' }, { value: 'end', label: 'After the last page' }] }], ok: 'Insert' }); if (!v) return; return insertSummaryPage(A.sum, A.kp, A.kw, v.where); }
  const p = await X.IO.saveAs({ data: new TextEncoder().encode(summaryText(A.sum, A.kp, A.kw)), defaultPath: baseName() + '-summary.txt', filters: [{ name: 'Text', extensions: ['txt'] }] });
  if (p) UI.toast('Summary saved', 'ok'); return p;
}
export async function exportStudy(kind) {
  if (!X.S.pages.length) return;
  if (!A.st) A.st = await studyMaterial({ scope: A.scope });
  if (kind === 'pdf') { const p = await X.IO.saveAs({ data: await studyPdf(A.st), defaultPath: baseName() + '-study.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] }); if (p) UI.toast('Study sheet saved', 'ok'); return p; }
  const quiz = kind === 'quiz-csv'; const p = await X.IO.saveAs({ data: new TextEncoder().encode(studyCsv(A.st, quiz ? 'quiz' : 'cards')), defaultPath: baseName() + (quiz ? '-quiz.csv' : '-flashcards.csv'), filters: [{ name: 'CSV', extensions: ['csv'] }] });
  if (p) UI.toast((quiz ? 'Quiz' : 'Flashcards') + ' exported', 'ok'); return p;
}
export async function askDialog() { openAssistant('ask'); }
export const _state = A;
