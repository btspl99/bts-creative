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
window.VCAP = { parse, toSRT, toVTT, parseTs, fmt, PRESETS, DEFAULT_STYLE, draw };
})();
