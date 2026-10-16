// Reading features: page display (single / continuous / spread), reading modes (dark, sepia, night),
// full screen & presentation, reading ruler, read aloud (speechSynthesis) and compare files.
import { X, sleep, textFrac } from './ctx.js';

const VKEY = 'bts.pdf.view';
let saved = {}; try { saved = JSON.parse(localStorage.getItem(VKEY) || '{}'); } catch { }
export const V = { mode: saved.mode || 'normal', spread: !!saved.spread, cover: saved.cover !== false, single: !!saved.single, cur: 0, ruler: false, presenting: false };
const persist = () => { try { localStorage.setItem(VKEY, JSON.stringify({ mode: V.mode, spread: V.spread, cover: V.cover, single: V.single })); } catch { } };
const ws = () => document.getElementById('ws'), pagesEl = () => document.getElementById('pages');

export function applyView() {
  const w = ws(); if (!w) return;
  ['dark', 'sepia', 'night'].forEach(m => w.classList.toggle('rm-' + m, V.mode === m));
  const p = pagesEl(); p.classList.toggle('spread', V.spread); p.classList.toggle('cover', V.spread && V.cover); p.classList.toggle('single', V.single);
  if (V.single) showSingle(V.cur, true);
  else document.querySelectorAll('#pages .page.cur').forEach(e => e.classList.remove('cur'));
}
export function setMode(m) { V.mode = m; persist(); applyView(); UI.toast('Reading mode: ' + ({ normal: 'Normal', dark: 'Dark', sepia: 'Sepia', night: 'Night' }[m])); }
export function modeMenu(e) {
  const r = e.currentTarget.getBoundingClientRect();
  UI.showDropdown([['normal', 'Normal'], ['dark', 'Dark (inverted)'], ['sepia', 'Sepia'], ['night', 'Night (low blue)']].map(([k, l]) => ({ label: l, checked: V.mode === k, action: () => setMode(k) })).concat(['-',
    { label: 'Two-page spread', checked: V.spread, action: () => setSpread(!V.spread) }, { label: 'Single page', checked: V.single, action: () => setSingle(!V.single) },
    { label: 'Reading ruler', checked: V.ruler, action: toggleRuler }]), r.left, r.bottom + 2, () => document.querySelectorAll('.dropdown').forEach(d => d.remove()));
}
export function setSpread(on) { V.spread = on; persist(); applyView(); if (X.S.zoomMode) X.setZoom(X.S.zoomMode); }
export function setCover(on) { V.cover = on; persist(); applyView(); }
export function setSingle(on) {
  const i = X.currentPageIdx(); V.single = on; V.cur = i; persist(); applyView();
  if (!on) setTimeout(() => X.scrollToPage(i), 30);
}
export function showSingle(i, quiet) {
  const n = X.S.pages.length; if (!n) return;
  V.cur = Math.max(0, Math.min(n - 1, i));
  // in spread+single mode show the pair
  const pair = V.spread ? pairOf(V.cur) : [V.cur];
  X.S.pages.forEach((p, k) => p._el && p._el.classList.toggle('cur', pair.includes(k)));
  const st = document.getElementById('stage'); st.scrollTop = 0;
  const el = document.getElementById('stPage'); if (el) el.textContent = `Page ${V.cur + 1} of ${n}`;
}
function pairOf(i) { const off = V.cover ? 1 : 0; if (V.cover && i === 0) return [0]; const a = i - ((i - off) % 2 + 2) % 2; return [a, a + 1].filter(k => k < X.S.pages.length); }
export function stepPage(d) {
  if (!X.S.pages.length) return;
  const step = V.spread ? (V.cover && V.cur === 0 && d > 0 ? 1 : 2) : 1;
  const base = V.spread ? pairOf(V.cur)[0] : V.cur;
  if (V.single || V.presenting) showSingle(base + d * step);
  else X.scrollToPage(Math.max(0, Math.min(X.S.pages.length - 1, X.currentPageIdx() + d)));
}
// keyboard & wheel navigation in single-page / presentation mode
window.addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
  if (!(V.single || V.presenting) || (X.S.sel && !V.presenting) || e.ctrlKey || e.altKey) return;
  const next = ['ArrowRight', 'PageDown'].concat(V.presenting ? [' ', 'ArrowDown', 'Enter'] : []);
  const prv = ['ArrowLeft', 'PageUp'].concat(V.presenting ? ['ArrowUp', 'Backspace'] : []);
  if (next.includes(e.key)) { e.preventDefault(); e.stopPropagation(); stepPage(1); }
  else if (prv.includes(e.key)) { e.preventDefault(); e.stopPropagation(); stepPage(-1); }
  else if (e.key === 'Home') showSingle(0); else if (e.key === 'End') showSingle(X.S.pages.length - 1);
  else if (e.key === 'Escape' && V.presenting) endPresent();
}, true);
let wheelLock = 0;
document.getElementById('stage')?.addEventListener('wheel', e => {
  if (!(V.single || V.presenting) || e.ctrlKey) return;
  const st = e.currentTarget; const atBottom = st.scrollTop + st.clientHeight >= st.scrollHeight - 2, atTop = st.scrollTop <= 0;
  if (Date.now() < wheelLock) return;
  if (e.deltaY > 0 && atBottom) { stepPage(1); wheelLock = Date.now() + 350; }
  else if (e.deltaY < 0 && atTop) { stepPage(-1); wheelLock = Date.now() + 350; }
}, { passive: true });

// ---------- full screen & presentation
export async function fullScreen() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); }
  catch { UI.toast('Full screen is not available here'); }
}
let prev = null;
export async function present() {
  if (!X.S.pages.length) return;
  if (V.presenting) return endPresent();
  prev = { single: V.single, spread: V.spread, zoom: X.S.zoomMode || X.S.zoom, tool: X.S.tool, idx: X.currentPageIdx() };
  V.presenting = true; V.spread = false; V.single = true; V.cur = prev.idx;
  document.body.classList.add('presenting'); X.setTool('hand');
  try { await document.documentElement.requestFullscreen(); } catch { }
  await sleep(120); applyView(); X.setZoom('fit-page'); showSingle(V.cur);
  UI.toast('Presentation: → / Space next, ← previous, Esc to exit', '', 2500);
}
export function endPresent() {
  if (!V.presenting) return;
  V.presenting = false; document.body.classList.remove('presenting');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
  const i = V.cur; V.single = prev?.single || false; V.spread = prev?.spread || false; applyView();
  setTimeout(() => { X.setZoom(prev?.zoom || 'fit-width'); X.setTool(prev?.tool === 'hand' ? 'select' : prev?.tool || 'select'); if (!V.single) X.scrollToPage(i); else showSingle(i); }, 80);
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && V.presenting) endPresent(); });
document.getElementById('stage')?.addEventListener('click', e => { if (V.presenting && !e.target.closest('button')) stepPage(e.clientX < innerWidth / 4 ? -1 : 1); });

// ---------- reading ruler / line focus
let rulerEl = null;
export function toggleRuler() {
  V.ruler = !V.ruler;
  if (V.ruler) {
    rulerEl = UI.h('div', { class: 'reading-ruler' }); document.getElementById('stage').append(rulerEl);
    UI.toast('Reading ruler on — move the mouse over the page. Ctrl+Shift+L to turn off.');
  } else { rulerEl?.remove(); rulerEl = null; }
}
document.addEventListener('mousemove', e => {
  if (!rulerEl) return; const st = document.getElementById('stage'); const r = st.getBoundingClientRect();
  if (e.clientY < r.top || e.clientY > r.bottom) return;
  rulerEl.style.top = (e.clientY - r.top + st.scrollTop - 18) + 'px';
});

// ---------- read aloud
const R = { on: false, queue: [], i: 0, pageIdx: 0, voice: localStorage.getItem('bts.tts.voice') || '', rate: +(localStorage.getItem('bts.tts.rate') || 1), bar: null, toEnd: false, paused: false };
function voices() { try { return speechSynthesis.getVoices(); } catch { return []; } }
// sentences with item ranges for highlighting
async function pageSentences(pg) {
  const { items } = await X.pageText(pg); const out = []; let cur = { text: '', parts: [] };
  items.forEach((it, k) => {
    const s = it.str; if (!s) { if (it.hasEOL && cur.text && !/\s$/.test(cur.text)) cur.text += ' '; return; }
    let start = 0;
    const re = /[.!?।]+["')\]]*\s+|[.!?।]+$/g; let m;
    while ((m = re.exec(s))) {
      const end = m.index + m[0].length; cur.text += s.slice(start, end); cur.parts.push({ k, a: start, b: end });
      if (cur.text.trim()) out.push(cur); cur = { text: '', parts: [] }; start = end;
    }
    if (start < s.length) { cur.text += s.slice(start); cur.parts.push({ k, a: start, b: s.length }); }
    cur.text += it.hasEOL ? ' ' : '';
  });
  if (cur.text.trim()) out.push(cur);
  return out;
}
export async function readAloud(what = 'page') {
  if (!('speechSynthesis' in window)) return UI.toast('Speech is not available on this system', 'err');
  const S = X.S; if (!S.pages.length) return;
  stopReading(true);
  let start = X.currentPageIdx(), fromText = null;
  if (what === 'selection') {
    const sel = getSelection(); const txt = sel && sel.toString().trim();
    if (!txt) return UI.toast('Select some text on the page first');
    const el = sel.anchorNode?.parentElement?.closest('.page'); if (el) start = S.pages.findIndex(p => p.id === el.dataset.id);
    fromText = txt.slice(0, 40);
  }
  R.on = true; R.toEnd = what !== 'page'; R.pageIdx = Math.max(0, start); R.paused = false; R.fails = 0;
  showBar();
  await loadPage(R.pageIdx, fromText);
  speakNext();
}
async function loadPage(i, fromText) {
  R.pageIdx = i; R.queue = await pageSentences(X.S.pages[i]); R.i = 0;
  if (fromText) { const k = R.queue.findIndex(s => s.text.includes(fromText.slice(0, 20))); if (k >= 0) R.i = k; }
  if (!R.queue.length) R.queue = [];
  updateBar();
}
function speakNext() {
  if (!R.on) return;
  if (R.i >= R.queue.length) {
    clearHl();
    if (R.toEnd && R.pageIdx < X.S.pages.length - 1) { loadPage(R.pageIdx + 1).then(() => { X.scrollToPage(R.pageIdx); speakNext(); }); return; }
    stopReading(); return;
  }
  const s = R.queue[R.i]; const u = new SpeechSynthesisUtterance(s.text.replace(/\s+/g, ' ').trim());
  const v = voices().find(v => v.name === R.voice); if (v) { u.voice = v; u.lang = v.lang; }
  u.rate = R.rate;
  u.onend = () => { if (!R.on) return; R.fails = 0; R.i++; speakNext(); };
  u.onerror = e => {
    if (e.error === 'interrupted' || e.error === 'canceled') return;
    if (++R.fails >= 2) { stopReading(); UI.toast('Speech failed (' + (e.error || 'no voice') + '). Install a text-to-speech voice in your system settings.', 'err', 6000); return; }
    R.i++; speakNext();
  };
  highlight(s); updateBar();
  try { speechSynthesis.speak(u); } catch (e) { UI.toast('Speech failed: ' + e.message, 'err'); stopReading(); }
}
function clearHl() { document.querySelectorAll('.tts-hl').forEach(e => e.remove()); }
function highlight(s) {
  clearHl(); const pg = X.S.pages[R.pageIdx]; if (!pg?._el) return;
  X.pageText(pg).then(({ items }) => {
    const box = pg._el; let firstTop = null;
    for (const p of s.parts) {
      const it = items[p.k]; if (!it || !it.str) continue;
      const r = itemRect(pg, it, p.a, p.b); if (!r) continue;
      box.append(UI.h('div', { class: 'tts-hl', style: { left: r.l + 'px', top: r.t + 'px', width: r.w + 'px', height: r.h + 'px' } }));
      if (firstTop == null) firstTop = r.t;
    }
    if (firstTop != null && !V.single) { const st = document.getElementById('stage'); const y = pg._el.offsetTop + firstTop; if (y < st.scrollTop + 40 || y > st.scrollTop + st.clientHeight - 80) st.scrollTo({ top: y - st.clientHeight / 3, behavior: 'smooth' }); }
  });
}
// viewport rect (px, relative to page element) for characters a..b of a text item
export function itemRect(pg, it, a = 0, b = it.str.length) {
  const vp = pg._vp; if (!vp) return null;
  const [A, B, C, D, E, F] = it.transform; const len = Math.max(1, it.str.length);
  const ul = Math.hypot(A, B) || 1, vl = Math.hypot(C, D) || it.height || 10;
  const ux = A / ul, uy = B / ul, vx = (C || -uy * vl) / vl, vy = (D || ux * vl) / vl;
  const w = it.width || ul * len * 0.5, fh = vl;
  const f0 = textFrac(it.str, a), f1 = textFrac(it.str, b);
  const p = (fx, fy) => vp.convertToViewportPoint(E + ux * w * fx + vx * fh * fy, F + uy * w * fx + vy * fh * fy);
  const pts = [p(f0, -0.22), p(f1, -0.22), p(f0, 0.95), p(f1, 0.95)];
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
  return { l: Math.min(...xs), t: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
export function pauseResume() {
  if (!R.on) return readAloud('page');
  if (speechSynthesis.paused || R.paused) { speechSynthesis.resume(); R.paused = false; } else { speechSynthesis.pause(); R.paused = true; }
  updateBar();
}
export function stopReading(silent) {
  R.on = false; try { speechSynthesis.cancel(); } catch { }
  clearHl(); R.bar?.remove(); R.bar = null;
}
function showBar() {
  R.bar?.remove();
  const { h } = UI;
  const vs = voices(); const sel = h('select', { style: { maxWidth: '190px' } }, h('option', { value: '' }, 'Default voice'), ...vs.map(v => h('option', { value: v.name, selected: v.name === R.voice }, `${v.name} (${v.lang})`)));
  sel.onchange = () => { R.voice = sel.value; try { localStorage.setItem('bts.tts.voice', R.voice); } catch { } restartSentence(); };
  const rate = h('select', {}, ...[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(r => h('option', { value: r, selected: r === R.rate }, r + '×')));
  rate.onchange = () => { R.rate = +rate.value; try { localStorage.setItem('bts.tts.rate', R.rate); } catch { } restartSentence(); };
  R.bar = h('div', { class: 'tts-bar' },
    h('button', { class: 'icon-btn', 'data-tip': 'Previous sentence', html: UI.icon('skipB'), onclick: () => { R.i = Math.max(0, R.i - 1); restartSentence(); } }),
    h('button', { class: 'icon-btn tts-pp', 'data-tip': 'Pause / resume', html: UI.icon('pause'), onclick: pauseResume }),
    h('button', { class: 'icon-btn', 'data-tip': 'Next sentence', html: UI.icon('skipF'), onclick: () => { R.i++; restartSentence(); } }),
    h('button', { class: 'icon-btn', 'data-tip': 'Stop', html: UI.icon('stop'), onclick: () => stopReading() }),
    h('span', { class: 'tts-info muted' }), sel, rate);
  document.getElementById('stage').parentElement.append(R.bar);
  if (!vs.length) try { speechSynthesis.onvoiceschanged = () => { if (R.bar) showBar(); }; } catch { }
  updateBar();
}
function restartSentence() { if (!R.on) return; try { speechSynthesis.cancel(); } catch { } setTimeout(speakNext, 60); }
function updateBar() {
  if (!R.bar) return;
  R.bar.querySelector('.tts-info').textContent = `Reading page ${R.pageIdx + 1} · sentence ${Math.min(R.i + 1, R.queue.length)} of ${R.queue.length}`;
  R.bar.querySelector('.tts-pp').innerHTML = UI.icon(R.paused ? 'play' : 'pause');
}
export async function voiceDialog() {
  const vs = voices();
  const v = await UI.form({ title: 'Read aloud — voice & speed', fields: [
    { key: 'voice', label: 'Voice', type: 'select', value: R.voice, options: [{ value: '', label: 'Default voice' }, ...vs.map(v => ({ value: v.name, label: `${v.name} (${v.lang})` }))] },
    { key: 'rate', label: 'Speed', type: 'select', value: String(R.rate), options: ['0.5', '0.75', '1', '1.25', '1.5', '1.75', '2'] }] });
  if (!v) return; R.voice = v.voice; R.rate = +v.rate;
  try { localStorage.setItem('bts.tts.voice', R.voice); localStorage.setItem('bts.tts.rate', R.rate); } catch { }
  if (!vs.length) UI.toast('No speech voices are installed on this computer — the system default will be used.');
}
export const _tts = R;

// ---------- compare files
function wordsOf(items) {
  // words with their item index and char range
  const out = [];
  items.forEach((it, k) => { const re = /\S+/g; let m; while ((m = re.exec(it.str || ''))) out.push({ w: m[0], k, a: m.index, b: m.index + m[0].length }); });
  return out;
}
// LCS-based word diff (Myers would be faster; LCS on words per page is fine for typical pages)
export function diffWords(A, B) {
  const n = A.length, m = B.length;
  if (n * m > 4e6) { // too large: fall back to line-insensitive set comparison
    const sb = new Set(B), sa = new Set(A);
    return { delA: A.map((w, i) => sb.has(w) ? -1 : i).filter(i => i >= 0), insB: B.map((w, i) => sa.has(w) ? -1 : i).filter(i => i >= 0) };
  }
  const dp = new Array(n + 1); for (let i = 0; i <= n; i++) dp[i] = new Uint32Array(m + 1);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const delA = [], insB = []; let i = 0, j = 0;
  while (i < n && j < m) { if (A[i] === B[j]) { i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) delA.push(i++); else insB.push(j++); }
  while (i < n) delA.push(i++); while (j < m) insB.push(j++);
  return { delA, insB };
}
export async function compareDialog(fileArg) {
  const S = X.S; if (!S.pages.length) return UI.toast('Open the first PDF, then compare');
  const fs = fileArg ? [fileArg] : await X.IO.open({ filters: [{ name: 'PDF', extensions: ['pdf'] }] }); if (!fs) return;
  const other = await X.pdfjsLib.getDocument({ data: new Uint8Array(fs[0].data).slice(), isEvalSupported: false }).promise;
  return showCompare(other, fs[0].name);
}
export async function compareData(other) {
  const S = X.S; const n = Math.max(S.pages.length, other.numPages); const pages = [];
  let added = 0, removed = 0, changed = 0;
  for (let i = 0; i < n; i++) {
    const pa = S.pages[i]; const itemsA = pa ? (await X.pageText(pa)).items : [];
    let itemsB = [], pb = null;
    if (i < other.numPages) { pb = await other.getPage(i + 1); itemsB = (await pb.getTextContent()).items; }
    const wa = wordsOf(itemsA), wb = wordsOf(itemsB);
    const d = diffWords(wa.map(w => w.w), wb.map(w => w.w));
    added += d.insB.length; removed += d.delA.length; if (d.insB.length || d.delA.length) changed++;
    pages.push({ i, pa, pb, itemsA, itemsB, wa, wb, d });
  }
  return { pages, added, removed, changed, nA: S.pages.length, nB: other.numPages };
}
async function showCompare(other, name) {
  const { h } = UI; const S = X.S;
  const prog = UI.toast('Comparing…');
  const res = await compareData(other);
  const ov = h('div', { class: 'compare' });
  const close = () => { ov.remove(); other.destroy(); };
  const summary = `${res.changed} of ${res.pages.length} page(s) differ · ${res.removed} word(s) removed · ${res.added} word(s) added` + (res.nA !== res.nB ? ` · page count ${res.nA} → ${res.nB}` : '');
  const head = h('div', { class: 'cmp-head' }, h('b', {}, 'Compare'), h('span', { class: 'cmp-file' }, (S.fileName || 'Current') + '  ⟷  ' + name),
    h('span', { class: 'cmp-legend' }, h('i', { class: 'del' }), 'Removed', h('i', { class: 'ins' }), 'Added'), h('span', { class: 'grow' }),
    h('label', { class: 'row' }, (() => { const c = h('input', { type: 'checkbox' }); c.onchange = () => ov.classList.toggle('only-diff', c.checked); return c; })(), 'Only changed pages'),
    h('button', { class: 'btn sm', onclick: () => exportReport(res, name) }, 'Export report…'), h('button', { class: 'btn sm primary', onclick: close }, 'Close'));
  const sum = h('div', { class: 'cmp-sum' }, summary);
  const body = h('div', { class: 'cmp-body' });
  ov.append(head, sum, body); document.getElementById('stage').parentElement.append(ov);
  const W = 520;
  for (const pr of res.pages) {
    const same = !pr.d.insB.length && !pr.d.delA.length;
    const row = h('div', { class: 'cmp-row' + (same ? ' same' : '') }, h('div', { class: 'cmp-n' }, `Page ${pr.i + 1}` + (same ? ' — no text changes' : ` — ${pr.d.delA.length} removed, ${pr.d.insB.length} added`)));
    const cols = h('div', { class: 'cmp-cols' });
    cols.append(await pane(pr.pa ? await X.ensureJs(pr.pa) : null, pr.pa ? X.viewportOf(pr.pa, 1) : null, pr.wa, pr.itemsA, pr.d.delA, 'del', W, pr.pa));
    cols.append(await pane(pr.pb, pr.pb ? pr.pb.getViewport({ scale: 1 }) : null, pr.wb, pr.itemsB, pr.d.insB, 'ins', W, null));
    row.append(cols); body.append(row);
  }
  return res;
}
async function pane(jsPage, vp1, words, items, marks, cls, W, appPage) {
  const { h } = UI; const box = h('div', { class: 'cmp-pane' });
  if (!jsPage) { box.append(h('div', { class: 'cmp-missing' }, 'No page')); return box; }
  const sc = W / vp1.width; const vp = appPage ? X.viewportOf(appPage, sc) : jsPage.getViewport({ scale: sc });
  const c = h('canvas', { width: Math.floor(vp.width * 1.5), height: Math.floor(vp.height * 1.5), style: { width: vp.width + 'px', height: vp.height + 'px' } });
  box.style.width = vp.width + 'px'; box.style.height = vp.height + 'px'; box.append(c);
  try { await jsPage.render({ canvasContext: c.getContext('2d'), viewport: appPage ? X.viewportOf(appPage, sc * 1.5) : jsPage.getViewport({ scale: sc * 1.5 }) }).promise; } catch { }
  const fake = { _vp: vp };
  for (const wi of marks) {
    const w = words[wi]; const it = items[w.k]; const r = itemRect(fake, it, w.a, w.b); if (!r) continue;
    box.append(h('div', { class: 'cmp-mark ' + cls, style: { left: r.l + 'px', top: r.t + 'px', width: r.w + 'px', height: r.h + 'px' }, title: w.w }));
  }
  return box;
}
async function exportReport(res, name) {
  let out = `Comparison report\nOriginal: ${X.S.fileName || 'Current document'}\nRevised:  ${name}\nDate: ${new Date().toLocaleString()}\n\n`;
  out += `${res.changed} of ${res.pages.length} page(s) differ; ${res.removed} word(s) removed; ${res.added} word(s) added.\n\n`;
  for (const p of res.pages) {
    if (!p.d.delA.length && !p.d.insB.length) continue;
    out += `--- Page ${p.i + 1} ---\n`;
    if (p.d.delA.length) out += '  Removed: ' + p.d.delA.map(i => p.wa[i].w).join(' ') + '\n';
    if (p.d.insB.length) out += '  Added:   ' + p.d.insB.map(i => p.wb[i].w).join(' ') + '\n';
  }
  const path = await X.IO.saveAs({ data: new TextEncoder().encode(out), defaultPath: 'comparison-report.txt', filters: [{ name: 'Text', extensions: ['txt'] }] });
  if (path) UI.toast('Report saved', 'ok');
}

window.addEventListener('DOMContentLoaded', applyView);
setTimeout(applyView, 0);
