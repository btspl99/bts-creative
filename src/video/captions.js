// BTS Video — captions: SRT / WebVTT import & export, style presets and canvas rendering.
(() => {
'use strict';
const parseTs = s => { const m = String(s).trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/); if (!m) return NaN; return (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3] + (m[4] ? +m[4].padEnd(3, '0') / 1000 : 0); };
const fmt = (t, sep) => { t = Math.max(0, t); const ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, f = ms % 1000; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(f).padStart(3, '0')}`; };
function parse(text) {
  text = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const blocks = text.split(/\n{2,}/); const out = [];
  for (const b of blocks) {
    const lines = b.split('\n').filter(l => l.length); const i = lines.findIndex(l => l.includes('-->')); if (i < 0) continue;
    const [a, z] = lines[i].split('-->'); const start = parseTs(a), end = parseTs(z.trim().split(/\s+/)[0]);
    if (!isFinite(start) || !isFinite(end)) continue;
    const txt = lines.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '').trim();
    if (txt) out.push({ start, end: Math.max(end, start + 0.1), text: txt });
  }
  return out.sort((a, b) => a.start - b.start);
}
const toSRT = caps => caps.map((c, i) => `${i + 1}\n${fmt(c.start, ',')} --> ${fmt(c.end, ',')}\n${c.text}\n`).join('\n');
const toVTT = caps => 'WEBVTT\n\n' + caps.map((c, i) => `${i + 1}\n${fmt(c.start, '.')} --> ${fmt(c.end, '.')}\n${c.text}\n`).join('\n');

const PRESETS = {
  'Classic box': { font: 'Segoe UI', size: 52, weight: 600, color: '#ffffff', bg: '#000000', bgOpacity: 70, outline: 0, outlineColor: '#000000', pos: 'bottom', margin: 7, upper: false },
  'Outline': { font: 'Arial', size: 58, weight: 800, color: '#ffffff', bg: '#000000', bgOpacity: 0, outline: 5, outlineColor: '#000000', pos: 'bottom', margin: 8, upper: false },
  'Yellow': { font: 'Arial', size: 54, weight: 700, color: '#ffe14a', bg: '#000000', bgOpacity: 0, outline: 4, outlineColor: '#000000', pos: 'bottom', margin: 8, upper: false },
  'Social bold': { font: 'Arial Black', size: 66, weight: 900, color: '#ffffff', bg: '#000000', bgOpacity: 0, outline: 7, outlineColor: '#000000', pos: 'middle', margin: 0, upper: true },
  'Highlight': { font: 'Segoe UI', size: 54, weight: 800, color: '#111111', bg: '#ffe14a', bgOpacity: 100, outline: 0, outlineColor: '#000000', pos: 'bottom', margin: 10, upper: false },
  'Minimal': { font: 'Georgia', size: 46, weight: 400, color: '#ffffff', bg: '#000000', bgOpacity: 35, outline: 0, outlineColor: '#000000', pos: 'bottom', margin: 6, upper: false },
  'Top': { font: 'Segoe UI', size: 48, weight: 600, color: '#ffffff', bg: '#000000', bgOpacity: 60, outline: 0, outlineColor: '#000000', pos: 'top', margin: 6, upper: false },
};
const DEFAULT_STYLE = { preset: 'Classic box', ...PRESETS['Classic box'] };

function wrap(ctx, text, maxW) {
  const out = [];
  String(text).split('\n').forEach(par => { const words = par.split(/\s+/); let line = '';
    words.forEach(w => { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }); out.push(line); });
  return out;
}
// Draws one caption onto ctx in sequence units (W×H).
function draw(ctx, cap, st, W, H) {
  st = { ...DEFAULT_STYLE, ...st }; const k = Math.min(W, H) / 1080; const size = st.size * k;
  ctx.save(); ctx.font = `${st.weight} ${size}px "${st.font}", "Segoe UI", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines = wrap(ctx, st.upper ? cap.text.toUpperCase() : cap.text, W * 0.84); const lh = size * 1.25; const total = lines.length * lh;
  const cy = st.pos === 'top' ? H * st.margin / 100 + total / 2 + size * 0.3 : st.pos === 'middle' ? H / 2 : H - H * st.margin / 100 - total / 2 - size * 0.3;
  lines.forEach((ln, i) => {
    const y = cy - total / 2 + lh * (i + 0.5); const w = ctx.measureText(ln).width;
    if (st.bgOpacity > 0) { ctx.save(); ctx.globalAlpha *= st.bgOpacity / 100; ctx.fillStyle = st.bg; ctx.beginPath(); ctx.roundRect(W / 2 - w / 2 - size * 0.35, y - lh / 2, w + size * 0.7, lh, size * 0.18); ctx.fill(); ctx.restore(); }
    if (st.outline > 0) { ctx.lineJoin = 'round'; ctx.lineWidth = st.outline * 2 * k; ctx.strokeStyle = st.outlineColor; ctx.strokeText(ln, W / 2, y); }
    ctx.fillStyle = st.color; ctx.fillText(ln, W / 2, y);
  });
  ctx.restore();
}

// ---------------------------------------------------------------------  censor list (masks words like f*** and drives the bleep)
const esc = w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const reCache = new Map();
function censorRe(list) {
  const key = (list || []).join('|'); if (reCache.has(key)) return reCache.get(key);
  const parts = (list || []).map(w => String(w).trim().toLowerCase()).filter(Boolean).map(w => w.endsWith('*') ? esc(w.slice(0, -1)) + '[\\p{L}\\p{N}]*' : esc(w));
  const re = parts.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${parts.join('|')})(?![\\p{L}\\p{N}])`, 'giu') : null; reCache.set(key, re); return re;
}
const maskWord = w => { const ch = [...w]; return ch[0] + '*'.repeat(Math.max(2, ch.length - 1)); };
function censor(text, list) { const re = censorRe(list); return re ? String(text).replace(re, maskWord) : text; }
function isCensored(token, list) { const re = censorRe(list); if (!re) return false; re.lastIndex = 0; const t = String(token).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}*]+$/gu, ''); re.lastIndex = 0; const m = re.exec(t); re.lastIndex = 0; return !!m && m[0].length === t.length; }
const tokens = text => String(text).split(/\s+/).filter(Boolean);
// word timings of a caption: real ones (from transcript alignment) when they still match the text, else an estimate by character length
function wordTimes(cap, estimate = true) {
  const tk = tokens(cap.text); if (!tk.length) return [];
  if (cap.words && cap.words.length === tk.length) return cap.words.map((w, i) => ({ w: tk[i], s: w.s, e: w.e }));
  if (!estimate) return null;
  const total = tk.reduce((s, w) => s + w.length + 1, 0); const D = cap.end - cap.start; let acc = 0;
  return tk.map(w => { const s0 = cap.start + acc / total * D; acc += w.length + 1; return { w, s: s0, e: cap.start + (acc - 1) / total * D, est: true }; });
}
function bleepRanges(caps, list, estimate = true) {
  const out = []; if (!censorRe(list)) return out;
  (caps || []).forEach(cp => { const wt = wordTimes(cp, estimate); if (!wt) return; wt.forEach(w => { if (isCensored(w.w, list)) out.push([Math.max(cp.start, w.s - 0.03), Math.min(cp.end, w.e + 0.03)]); }); });
  return out.sort((a, b) => a[0] - b[0]);
}

// ---------------------------------------------------------------------  transcript alignment ("transcribe from text")
// text: the pasted transcript. speech: [[start,end],...] non-silent regions (from FFmpeg silencedetect). env: RMS energy
// envelope sampled at `rate` Hz starting at t0. Returns captions [{start,end,text,words:[{s,e}]}] on the same time base.
const syl = w => { const s = w.toLowerCase().replace(/[^a-zÀ-ɏ]/g, ''); if (!s) return /\d/.test(w) ? Math.max(1, w.replace(/\D/g, '').length * 0.8) : 0.6; const g = s.replace(/e$/, '').match(/[aeiouyà-ÿ]+/g); return Math.max(1, g ? g.length : 1); };
const pauseAfter = w => /[.!?…]["')\]]*$/.test(w) ? 2 : /[,;:—–-]["')\]]*$/.test(w) ? 1 : 0;
function alignTranscript(text, speech, env, rate, t0, t1, opt = {}) {
  const words = tokens(text.replace(/\r/g, '')); if (!words.length) return [];
  let segs = (speech || []).map(([a, b]) => [Math.max(t0, a), Math.min(t1, b)]).filter(([a, b]) => b - a >= 0.12);
  if (!segs.length) segs = [[t0, t1]];
  while (segs.length > words.length) { let bi = 1, bg = Infinity; for (let i = 1; i < segs.length; i++) { const g = segs[i][0] - segs[i - 1][1]; if (g < bg) { bg = g; bi = i; } } segs[bi - 1][1] = segs[bi][1]; segs.splice(bi, 1); }
  const wgt = words.map(w => syl(w) + 0.35); const cum = [0]; wgt.forEach(v => cum.push(cum[cum.length - 1] + v)); const Wt = cum[cum.length - 1];
  const T = segs.reduce((s, [a, b]) => s + b - a, 0); const segCum = [0]; segs.forEach(([a, b]) => segCum.push(segCum[segCum.length - 1] + b - a));
  // choose, for every pause between speech segments, the word boundary that best fits it (punctuation preferred)
  const bnd = [0]; const S = segs.length;
  for (let j = 1; j < S; j++) {
    const target = segCum[j] / T * Wt; let best = -1, bc = Infinity; const lo = bnd[j - 1] + 1, hi = words.length - (S - j);
    for (let b = lo; b <= hi; b++) { const d = Math.abs(cum[b] - target) / (Wt / words.length); if (d > 14) { if (cum[b] > target) break; continue; } const c = d - pauseAfter(words[b - 1]) * 2.2; if (c < bc) { bc = c; best = b; } }
    bnd.push(best < 0 ? clampI(Math.round(target / Wt * words.length), lo, hi) : best);
  }
  bnd.push(words.length);
  const out = new Array(words.length);
  for (let j = 0; j < S; j++) {
    const [a, b] = segs[j]; const i0 = bnd[j], i1 = bnd[j + 1]; const ws = cum[i1] - cum[i0] || 1;
    for (let i = i0; i < i1; i++) out[i] = { s: a + (cum[i] - cum[i0]) / ws * (b - a), e: a + (cum[i + 1] - cum[i0]) / ws * (b - a) - 0.35 / ws * (b - a) * 0.5 };
  }
  // snap inner word boundaries to the nearest energy dip (±80 ms)
  if (env && env.length && rate) {
    const at = t => env[Math.max(0, Math.min(env.length - 1, Math.round((t - t0) * rate)))] || 0;
    for (let i = 1; i < words.length; i++) { const prev = out[i - 1], cur = out[i]; if (cur.s - prev.e > 0.1) continue; const mid = (prev.e + cur.s) / 2; let bt = mid, bv = at(mid);
      for (let d = -0.08; d <= 0.08; d += 1 / rate) { const t = mid + d; if (t <= prev.s + 0.08 || t >= cur.e - 0.08) continue; const v = at(t); if (v < bv) { bv = v; bt = t; } }
      prev.e = Math.min(prev.e, bt); cur.s = Math.max(bt, prev.e); }
  }
  // group words into caption lines: phrases end at punctuation / pauses, long phrases are split into even chunks
  const maxC = opt.maxChars || 42, maxW = opt.maxWords || 7; const phrases = []; let ph = [];
  words.forEach((w, i) => { ph.push(i); const gap = i + 1 < words.length ? out[i + 1].s - out[i].e : 1; if (pauseAfter(w) || gap > 0.3 || i === words.length - 1) { phrases.push(ph); ph = []; } });
  const merged = []; phrases.forEach(p => { const last = merged[merged.length - 1]; const len = idx => idx.reduce((s, i) => s + words[i].length + 1, 0);
    if (last && (last.length < 3 || p.length < 2) && last.length + p.length <= maxW && len(last) + len(p) <= maxC && out[p[0]].s - out[last[last.length - 1]].e < 0.5 && pauseAfter(words[last[last.length - 1]]) < 2) last.push(...p); else merged.push([...p]); });
  const caps = [];
  merged.forEach(p => { const chars = p.reduce((s, i) => s + words[i].length + 1, 0); const k = Math.max(Math.ceil(p.length / maxW), Math.ceil(chars / maxC)); const per = Math.ceil(p.length / k);
    for (let j = 0; j < p.length; j += per) { const idx = p.slice(j, j + per); caps.push({ start: out[idx[0]].s, end: out[idx[idx.length - 1]].e, text: idx.map(i => words[i]).join(' '), words: idx.map(i => ({ s: +out[i].s.toFixed(3), e: +out[i].e.toFixed(3) })) }); } });
  caps.forEach((c, i) => { const nx = caps[i + 1]; c.end = Math.min(nx ? nx.start : t1, c.end + 0.25); c.start = +c.start.toFixed(3); c.end = +Math.max(c.start + 0.2, c.end).toFixed(3); });
  return caps;
}
const clampI = (v, a, b) => Math.max(a, Math.min(b, v));
window.VCAP = { parse, toSRT, toVTT, parseTs, fmt, PRESETS, DEFAULT_STYLE, draw, censor, censorRe, isCensored, wordTimes, bleepRanges, alignTranscript, tokens };
})();
