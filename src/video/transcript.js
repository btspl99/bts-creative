// BTS Video — Edit by transcript: the Transcript panel shows the sequence's recognised words (from Auto-transcribe
// captions, which keep per-word timings) as flowing paragraphs. Click a word to seek, select words and press Delete to
// ripple-delete that speech from the timeline; also removes filler words and long pauses. Every edit is one undo step.
'use strict';
const TS_FILLERS = ['um', 'uh', 'erm', 'hmm', 'like', 'you know'];
const TS = { sel: null, anchor: null, words: [], fill: new Set(), nowI: -1 };
const tsNorm = w => String(w).toLowerCase().replace(/^[^\p{L}\p{M}\p{N}']+|[^\p{L}\p{M}\p{N}']+$/gu, '');
const tsFmt = t => { t = Math.max(0, t); const h0 = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = Math.floor(t % 60); return (h0 ? h0 + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(s).padStart(2, '0'); };

// flat word list of the active sequence: [{w, s, e, cap, k, est}] sorted by time
function tsWords() {
  const out = [];
  PJ.captions.slice().sort((a, b) => a.start - b.start).forEach(cp => (VCAP.wordTimes(cp, true) || []).forEach((w, k) => out.push({ w: w.w, s: w.s, e: Math.max(w.e, w.s + 0.02), cap: cp.id, k, est: !!w.est })));
  return out.sort((a, b) => a.s - b.s);
}
// paragraphs by pauses (and sentence ends): [[i0, i1], ...]
function tsParagraphs(W) {
  const gapP = PREFS.tsParaGap ?? 1.2; const out = []; let st = 0;
  for (let i = 1; i <= W.length; i++) {
    if (i === W.length) { out.push([st, i - 1]); break; }
    const gap = W[i].s - W[i - 1].e; const sentence = /[.?!।॥]["')\]]*$/.test(W[i - 1].w);
    if (gap > gapP || (sentence && gap > 0.5) || (i - st > 120 && gap > 0.35)) { out.push([st, i - 1]); st = i; }
  }
  return out;
}
function tsHasTranscript() { return PJ.captions.length > 0; }
function renderTranscript() {
  if (ltab !== 'transcript') return; const b = $('#lbody'); b.innerHTML = '';
  const W = TS.words = tsWords(); if (TS.sel && (TS.sel[1] >= W.length)) TS.sel = null;
  const tb = h('div', { class: 'bin-tools wrap ts-tools' },
    h('button', { class: 'btn sm primary', onclick: tsCutSelection, 'data-tip': 'Ripple-delete the selected words from the timeline (Delete)' }, 'Cut selection'),
    h('button', { class: 'btn sm', onclick: removeFillersDialog }, 'Remove filler words…'),
    h('button', { class: 'btn sm', onclick: removePausesDialog }, 'Remove pauses…'),
    h('button', { class: 'btn sm', onclick: exportTranscriptDialog }, 'Export…'),
    h('button', { class: 'icon-btn sm', 'data-tip': 'Transcript settings', html: icon('sliders'), onclick: transcriptSettings }));
  b.append(tb);
  if (!W.length) { b.append(h('div', { class: 'empty-bin' }, 'No transcript yet. Run Auto-transcribe to recognise the speech — the words appear here with their timings, ready for editing.', h('br'), h('br'), h('button', { class: 'btn sm primary', onclick: autoTranscribeDialog }, 'Auto-transcribe…'))); return; }
  const est = W.filter(w => w.est).length;
  b.append(h('div', { class: 'ts-info muted' }, `${W.length} words · ${tsFmt(W[W.length - 1].e)}`, est ? h('span', { class: 'ts-warn' }, ` · ${est} words have estimated timings`) : ''));
  const body = h('div', { class: 'ts-body', tabindex: '0', lang: W.some(w => /[ऀ-ॿ]/.test(w.w)) ? 'hi' : 'en' });
  tsParagraphs(W).forEach(([i0, i1]) => {
    const p = h('div', { class: 'ts-p' }, h('span', { class: 'ts-tc', 'data-tip': 'Go to this paragraph', onclick: () => seek(W[i0].s) }, tsFmt(W[i0].s)));
    const tx = h('div', { class: 'ts-tx' });
    for (let i = i0; i <= i1; i++) { tx.append(h('span', { class: 'tw' + (TS.fill.has(i) ? ' filler' : '') + (W[i].est ? ' est' : ''), 'data-i': String(i) }, W[i].w)); if (i < i1) tx.append(' '); }
    p.append(tx); body.append(p);
  });
  wireTranscript(body); b.append(body); tsPaintSel(); TS.nowI = -1; transcriptTick();
}
function wireTranscript(body) {
  let drag = false, moved = false, downI = -1;
  const idxAt = ev => { const el = document.elementFromPoint(ev.clientX, ev.clientY); const t = el && el.closest && el.closest('.tw'); return t && body.contains(t) ? +t.dataset.i : -1; };
  body.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return; const t = ev.target.closest('.tw'); if (!t) { if (!ev.target.closest('.ts-tc')) { TS.sel = null; tsPaintSel(); } return; }
    const i = +t.dataset.i; body.focus({ preventScroll: true });
    if (ev.shiftKey && TS.anchor != null) { TS.sel = [Math.min(TS.anchor, i), Math.max(TS.anchor, i)]; tsPaintSel(); return; }
    TS.anchor = i; TS.sel = [i, i]; drag = true; moved = false; downI = i; tsPaintSel(); body.setPointerCapture(ev.pointerId); ev.preventDefault();
  });
  body.addEventListener('pointermove', ev => { if (!drag) return; const i = idxAt(ev); if (i < 0) return; if (i !== downI) moved = true; TS.sel = [Math.min(TS.anchor, i), Math.max(TS.anchor, i)]; tsPaintSel(); });
  body.addEventListener('pointerup', () => { if (!drag) return; drag = false; if (!moved && downI >= 0 && TS.words[downI]) seek(TS.words[downI].s + 0.001); });
  body.addEventListener('keydown', ev => {
    const k = ev.key;
    if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); ev.stopPropagation(); tsCutSelection(); }
    else if (k === 'Escape') { ev.stopPropagation(); TS.sel = null; tsPaintSel(); }
    else if ((ev.ctrlKey || ev.metaKey) && k.toLowerCase() === 'a') { ev.preventDefault(); ev.stopPropagation(); if (TS.words.length) { TS.sel = [0, TS.words.length - 1]; tsPaintSel(); } }
    else if ((k === 'ArrowLeft' || k === 'ArrowRight') && ev.shiftKey && TS.sel) { ev.preventDefault(); ev.stopPropagation(); const j = clamp((TS.sel[0] === TS.anchor ? TS.sel[1] : TS.sel[0]) + (k === 'ArrowRight' ? 1 : -1), 0, TS.words.length - 1); TS.sel = [Math.min(TS.anchor, j), Math.max(TS.anchor, j)]; tsPaintSel(); }
  });
}
function tsPaintSel() {
  const body = document.querySelector('#lbody .ts-body'); if (!body) return; const [a, z] = TS.sel || [-1, -2];
  body.querySelectorAll('.tw').forEach(el => { const i = +el.dataset.i; el.classList.toggle('sel', i >= a && i <= z); });
  const st = $('#stSel'); if (st) st.textContent = TS.sel ? `${z - a + 1} word(s) selected · ${(TS.words[z].e - TS.words[a].s).toFixed(2)} s` : '';
}
// highlights the word under the playhead (called from drawFrame / the playback loop)
function transcriptTick() {
  if (typeof ltab === 'undefined' || ltab !== 'transcript' || !TS.words.length) return;
  const W = TS.words, t = ST.t; let lo = 0, hi2 = W.length - 1, f = -1;
  while (lo <= hi2) { const m = (lo + hi2) >> 1; if (W[m].s <= t + 1e-4) { f = m; lo = m + 1; } else hi2 = m - 1; }
  const i = f >= 0 && t < W[f].e + 0.12 ? f : -1; if (i === TS.nowI) return;
  const body = document.querySelector('#lbody .ts-body'); if (!body) return;
  if (TS.nowI >= 0) body.querySelector(`.tw[data-i="${TS.nowI}"]`)?.classList.remove('now');
  TS.nowI = i; if (i < 0) return; const el = body.querySelector(`.tw[data-i="${i}"]`); if (!el) return; el.classList.add('now');
  if (ST.playing) { const pr = body.parentElement.getBoundingClientRect(), r = el.getBoundingClientRect(); if (r.top < pr.top + 60 || r.bottom > pr.bottom - 20) el.scrollIntoView({ block: 'center' }); }
}

// ---------------------------------------------------------------------  cutting
// time range a word group [i, j] occupies, taking half of the pause on each side (so the remaining gap stays natural)
function tsRangeOf(W, i, j) {
  const prevE = i > 0 ? W[i - 1].e : W[i].s - 0.24, nextS = j < W.length - 1 ? W[j + 1].s : W[j].e + 0.24;
  const g1 = Math.max(0, W[i].s - prevE), g2 = Math.max(0, nextS - W[j].e);
  return [Math.max(0, W[i].s - Math.min(g1 / 2, 0.12)), W[j].e + Math.min(g2 / 2, 0.12)];
}
function tsMerge(ranges) { const r = ranges.filter(([a, b]) => b - a > 0.01).map(([a, b]) => [Math.max(0, a), b]).sort((p, q) => p[0] - q[0]); const out = []; r.forEach(x => { const l = out[out.length - 1]; if (l && x[0] <= l[1] + 1e-3) l[1] = Math.max(l[1], x[1]); else out.push([...x]); }); return out; }
function tsCutSelection() {
  if (!TS.sel) return toast('Select words in the transcript first (click, drag or Shift+click)');
  const W = TS.words = tsWords(); if (TS.sel[1] >= W.length) { TS.sel = null; return toast('Select words in the transcript first (click, drag or Shift+click)'); } const r = tsRangeOf(W, TS.sel[0], TS.sel[1]); return transcriptCut([r], 'Cut words (transcript)');
}
// ripple-deletes the time ranges from the timeline (clips on every unlocked track, or only the clips under the speech),
// shifts captions / markers after each cut and removes the cut words from the captions. One undo step.
function transcriptCut(ranges, label = 'Transcript edit') {
  const R = tsMerge(ranges); if (!R.length) return 0; pause(); const scope = PREFS.tsScope || 'all';
  for (const [a, b] of [...R].reverse()) tsRipple(a, b, scope);
  TS.sel = null; TS.fill.clear(); ST.sel.clear(); commit(label); renderTimeline(); renderFx(); renderLeft(); seek(Math.min(R[0][0], seqDuration()));
  const total = R.reduce((s, [a, b]) => s + b - a, 0); setStatus(`Removed ${R.length} range(s) · ${total.toFixed(2)} s`); return total;
}
function tsRipple(a, b, scope) {
  const d = b - a; let tracks = null;
  if (scope === 'linked') {
    // the speaker's clips: video (or nested) clips under the words plus everything linked to them; for audio-only edits the
    // voice-over tracks (or A1). Unlinked music / graphics on other tracks are not cut.
    tracks = new Set(); const over = c => c.start < b - 1e-6 && cEnd(c) > a + 1e-6;
    let hit = PJ.clips.filter(c => over(c) && (c.type === 'video' || c.type === 'nest'));
    if (!hit.length) { const a1 = (PJ.tracks.find(t => t.kind === 'audio') || {}).id; hit = PJ.clips.filter(c => over(c) && c.type === 'audio' && (trackById(c.track)?.voice || c.track === a1)); }
    hit.forEach(c => { tracks.add(c.track); if (c.link) PJ.clips.filter(o => o.link === c.link).forEach(o => tracks.add(o.track)); });
  }
  const cut = c => { const tk = trackById(c.track); return tk && !tk.locked && (!tracks || tracks.has(c.track)); };
  PJ.clips.slice().forEach(c => { if (cut(c) && c.start < a - 1e-6 && cEnd(c) > a + 1e-6) splitClip(c, a); });
  PJ.clips.slice().forEach(c => { if (cut(c) && c.start < b - 1e-6 && cEnd(c) > b + 1e-6) splitClip(c, b); });
  PJ.clips = PJ.clips.filter(c => !(cut(c) && c.start >= a - 1e-6 && cEnd(c) <= b + 1e-6));
  PJ.clips.forEach(c => { if (cut(c) && c.start >= b - 1e-6) c.start = Math.max(0, c.start - d); });
  tsShiftCaptions(a, b);
  PJ.markers.forEach(mk => { if (mk.t >= b - 1e-6) mk.t -= d; else if (mk.t > a) mk.t = a; });
  if (ST.inP != null) ST.inP = ST.inP >= b ? ST.inP - d : Math.min(ST.inP, a); if (ST.outP != null) ST.outP = ST.outP >= b ? ST.outP - d : Math.min(ST.outP, a);
}
function tsShiftCaptions(a, b) {
  const d = b - a; const out = [];
  PJ.captions.forEach(cp => {
    if (cp.end <= a + 1e-6) { out.push(cp); return; }
    if (cp.start >= b - 1e-6) { cp.start = +(cp.start - d).toFixed(3); cp.end = +(cp.end - d).toFixed(3); if (cp.words) cp.words = cp.words.map(w => ({ s: +(w.s - d).toFixed(3), e: +(w.e - d).toFixed(3) })); out.push(cp); return; }
    const keep = [];
    (VCAP.wordTimes(cp, true) || []).forEach(w => { const mid = (w.s + w.e) / 2; if (mid >= a && mid < b) return;
      if (mid < a) keep.push({ w: w.w, s: w.s, e: Math.min(w.e, a) }); else keep.push({ w: w.w, s: Math.max(w.s, b) - d, e: w.e - d }); });
    if (!keep.length) return; // the whole caption was cut
    const st = cp.start < a ? cp.start : keep[0].s; const en = cp.end > b ? cp.end - d : Math.max(keep[keep.length - 1].e, Math.min(cp.end, a));
    cp.text = keep.map(k => k.w).join(' '); cp.words = keep.map(k => ({ s: +k.s.toFixed(3), e: +k.e.toFixed(3) }));
    cp.start = +st.toFixed(3); cp.end = +Math.max(st + 0.1, en).toFixed(3); out.push(cp);
  });
  PJ.captions = out.sort((p, q) => p.start - q.start);
}

// ---------------------------------------------------------------------  filler words
function findFillers(list = PREFS.tsFillers || TS_FILLERS) {
  const W = tsWords(); const pats = list.map(f => String(f).split(/\s+/).map(tsNorm).filter(Boolean)).filter(p => p.length).sort((p, q) => q.length - p.length); const hits = [];
  for (let i = 0; i < W.length; i++) for (const p of pats) { if (p.every((t, k) => W[i + k] && tsNorm(W[i + k].w) === t)) { hits.push([i, i + p.length - 1]); i += p.length - 1; break; } }
  return { W, hits };
}
async function removeFillersDialog() {
  if (!tsHasTranscript()) return toast('Run Auto-transcribe first — the transcript comes from its captions', 'err');
  const v = await form({ title: 'Remove filler words', width: 460, fields: [{ key: 'list', label: 'Filler words and phrases (comma separated)', type: 'textarea', rows: 3, value: (PREFS.tsFillers || TS_FILLERS).join(', ') }], ok: 'Find' });
  if (!v) return; const list = v.list.split(/[,\n]+/).map(s => s.trim()).filter(Boolean); PREFS.tsFillers = list; savePrefs();
  const { W, hits } = findFillers(list); if (!hits.length) return toast('No filler words found');
  if (ltab !== 'transcript') showLeft('transcript');
  TS.fill = new Set(hits.flatMap(([i, j]) => Array.from({ length: j - i + 1 }, (_, k) => i + k))); renderTranscript();
  const checks = hits.map(() => true);
  const rows = h('div', { class: 'ts-prev' }, ...hits.map(([i, j], n) => {
    const cb = h('input', { type: 'checkbox', checked: true }); cb.onchange = () => { checks[n] = cb.checked; };
    const ctx = (k0, k1) => W.slice(Math.max(0, k0), Math.max(0, k1)).map(w => w.w).join(' ');
    return h('label', { class: 'ts-prow' }, cb, h('span', { class: 'tc' }, tsFmt(W[i].s)), h('span', { class: 'cx' }, ctx(i - 4, i) + ' ', h('b', {}, ctx(i, j + 1)), ' ' + ctx(j + 1, j + 5)),
      h('button', { class: 'icon-btn sm', 'data-tip': 'Preview', html: icon('play'), onclick: ev => { ev.preventDefault(); seek(Math.max(0, W[i].s - 1)); play(1); const stop = W[j].e + 0.8; const iv = setInterval(() => { if (!ST.playing || ST.t >= stop) { clearInterval(iv); pause(); } }, 50); } }));
  }));
  const r = await modal({ title: 'Remove filler words', width: 560, body: h('div', {}, h('div', { class: 'muted', style: { marginBottom: '8px' } }, `${hits.length} filler word(s) found. Untick any you want to keep, then remove the rest from the timeline.`), rows), buttons: [{ label: 'Cancel', value: null }, { label: 'Remove selected', primary: true, value: 'ok' }] });
  TS.fill.clear(); if (r !== 'ok') { renderTranscript(); return null; }
  const ranges = hits.filter((_, n) => checks[n]).map(([i, j]) => tsRangeOf(W, i, j)); if (!ranges.length) { renderTranscript(); return 0; }
  const t = transcriptCut(ranges, 'Remove filler words'); toast(`Removed ${ranges.length} filler word(s) · ${t.toFixed(1)} s`, 'ok'); return ranges.length;
}
// ---------------------------------------------------------------------  pauses
function findPauses(minGap = 1, pad = 0.25) {
  const W = tsWords(); const out = [];
  for (let i = 1; i < W.length; i++) { const g = W[i].s - W[i - 1].e; if (g > minGap) { const a = W[i - 1].e + pad, b = W[i].s - pad; if (b - a > 0.05) out.push([a, b]); } }
  return out;
}
async function removePausesDialog() {
  if (!tsHasTranscript()) return toast('Run Auto-transcribe first — the transcript comes from its captions', 'err');
  const v = await form({ title: 'Remove pauses', width: 420, fields: [{ key: 'min', label: 'Remove pauses longer than (seconds)', type: 'number', value: PREFS.tsPauseMin ?? 1, min: 0.2, max: 30, step: 0.1 }, { key: 'pad', label: 'Keep this much silence on each side (seconds)', type: 'number', value: PREFS.tsPausePad ?? 0.25, min: 0, max: 2, step: 0.05 }], ok: 'Find pauses' });
  if (!v) return; PREFS.tsPauseMin = Math.max(0.1, +v.min || 1); PREFS.tsPausePad = Math.max(0, +v.pad || 0); savePrefs();
  const R = findPauses(PREFS.tsPauseMin, PREFS.tsPausePad); if (!R.length) return toast('No pauses that long');
  const total = R.reduce((s, [a, b]) => s + b - a, 0);
  const ok = await confirm('Remove pauses', `${R.length} pause(s) found. Removing them shortens the sequence by ${total.toFixed(1)} s (${tsFmt(seqDuration())} → ${tsFmt(seqDuration() - total)}).`, 'Remove pauses');
  if (!ok) return null; transcriptCut(R, 'Remove pauses'); toast(`Removed ${R.length} pause(s) · ${total.toFixed(1)} s`, 'ok'); return R.length;
}
// ---------------------------------------------------------------------  export / settings
function transcriptText(stamps = true) { const W = tsWords(); return tsParagraphs(W).map(([i0, i1]) => (stamps ? `[${tsFmt(W[i0].s)}] ` : '') + W.slice(i0, i1 + 1).map(w => w.w).join(' ')).join('\n\n'); }
async function exportTranscriptDialog() {
  if (!tsHasTranscript()) return toast('There is no transcript yet', 'err');
  const v = await form({ title: 'Export transcript', width: 420, fields: [{ key: 'stamps', label: 'Start each paragraph with its timestamp', type: 'checkbox', value: true }, { key: 'bom', label: 'Word / DOCX friendly (UTF-8 with byte-order mark)', type: 'checkbox', value: true }] });
  if (!v) return; const txt = transcriptText(v.stamps).replace(/\n/g, '\r\n') + '\r\n';
  const p = await bts.fs.saveAs({ data: new TextEncoder().encode((v.bom ? '﻿' : '') + txt), defaultPath: PJ.name.replace(/\.btsvid$/, '') + ' transcript.txt', filters: [{ name: 'Text', extensions: ['txt'] }] });
  if (p) toast('Saved ' + p.split(/[\\/]/).pop(), 'ok'); return p;
}
async function copyTranscript() { if (!tsHasTranscript()) return toast('There is no transcript yet', 'err'); try { await navigator.clipboard.writeText(transcriptText(true)); toast('Transcript copied', 'ok'); } catch (e) { toast('Could not copy: ' + e.message, 'err'); } }
async function transcriptSettings() {
  const v = await form({ title: 'Transcript settings', width: 460, fields: [
    { key: 'scope', label: 'Cutting words removes time from', type: 'select', value: PREFS.tsScope || 'all', options: [{ value: 'all', label: 'All unlocked tracks (everything stays in sync)' }, { value: 'linked', label: 'Only the speaker’s clips and their linked audio (music keeps playing)' }] },
    { key: 'gap', label: 'Start a new paragraph after a pause of (seconds)', type: 'number', value: PREFS.tsParaGap ?? 1.2, min: 0.3, max: 10, step: 0.1 }] });
  if (!v) return; PREFS.tsScope = v.scope; PREFS.tsParaGap = Math.max(0.2, +v.gap || 1.2); savePrefs(); renderTranscript();
}
function selectTranscriptWords(i, j) { TS.words = tsWords(); TS.sel = [Math.min(i, j), Math.max(i, j)]; TS.anchor = TS.sel[0]; tsPaintSel(); return TS.sel; }
