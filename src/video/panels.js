// BTS Video — panels: Project bin, Effects, Transitions, Graphics, Captions, History, the Effect Controls
// inspector (with keyframe stopwatches) and direct manipulation on the program monitor.
'use strict';
let ltab = 'media';
const LTABS = [['media', 'Project'], ['effects', 'Effects'], ['transitions', 'Transitions'], ['titles', 'Graphics'], ['captions', 'Captions'], ['transcript', 'Transcript'], ['scopes', 'Scopes'], ['history', 'History']];
function showLeft(t) { ltab = t; document.querySelectorAll('#ltabs .tab').forEach(x => x.classList.toggle('active', x.dataset.t === t)); renderLeft(); }
function renderLeft() { ({ media: renderBin, effects: renderEffects, transitions: renderTransitions, titles: renderTitles, captions: renderCaptions, transcript: () => renderTranscript(), scopes: () => renderScopes(), history: renderHistory })[ltab](); }
const dragItem = (type, data, label, sw, onclick, tip) => { const it = h('div', { class: 'fx-it', draggable: 'true', onclick, 'data-tip': tip || null }, sw, h('span', { class: 'lbl' }, label)); it.ondragstart = e => { e.dataTransfer.setData(type, data); e.dataTransfer.effectAllowed = 'copy'; }; return it; };
const swatch = (style, txt) => h('span', { class: 'sw', style }, txt || '');
const searchBox = (val, on, ph) => { const s = h('input', { type: 'text', class: 'search', placeholder: ph, value: val || '' }); s.oninput = () => on(s.value); return s; };

// ---------------------------------------------------------------------  project bin
function renderBin() {
  if (ltab !== 'media') return; const b = $('#lbody'); const keepFocus = document.activeElement?.classList.contains('search'); b.innerHTML = '';
  const newBtn = h('button', { class: 'btn sm', html: icon('plus') + 'New item', onclick: e => contextMenu(e, newItemMenu()) });
  const q = searchBox(ST.binQuery, v => { ST.binQuery = v; renderBin(); }, 'Search media…');
  const kind = h('select', { class: 'kind' }, ...[['all', 'All'], ['video', 'Video'], ['audio', 'Audio'], ['image', 'Images']].map(([v, l]) => h('option', { value: v, selected: ST.binKind === v }, l))); kind.onchange = () => { ST.binKind = kind.value; renderBin(); };
  b.append(h('div', { class: 'bin-tools' }, h('button', { class: 'btn sm primary', html: icon('plus') + 'Import', onclick: importDialog }), newBtn, h('span', { class: 'muted cnt' }, `${PJ.media.length} item${PJ.media.length === 1 ? '' : 's'}`)), h('div', { class: 'bin-tools sub' }, q, kind));
  if (keepFocus) setTimeout(() => { q.focus(); q.setSelectionRange(q.value.length, q.value.length); });
  if (!PJ.media.length) { b.append(h('div', { class: 'empty-bin' }, 'Import videos, music and images, then drag them onto the timeline.', h('br'), h('br'), 'Supported: MP4, WebM, MOV, MP3, WAV, PNG, JPG')); return; }
  const g = h('div', { class: 'bin' }); const qq = (ST.binQuery || '').toLowerCase();
  PJ.media.filter(m => (ST.binKind === 'all' || m.kind === ST.binKind) && (!qq || m.name.toLowerCase().includes(qq))).forEach(m => {
    const th = h('div', { class: 'th', style: m.thumb ? { backgroundImage: `url(${m.thumb})` } : {} }, m.kind === 'audio' ? h('span', { html: icon('music', 28) }) : '', h('span', { class: 'kind' }, m.kind + (m.lowres ? ' · proxy' : '')), m.kind !== 'image' ? h('span', { class: 'dur' }, fmtTime(m.dur).slice(0, 8)) : '');
    const it = h('div', { class: 'mi' + (ST.binSel === m.id ? ' sel' : ''), draggable: 'true', title: m.path }, th, h('div', { class: 'nm' }, (m.missing ? '⚠ ' : '') + m.name));
    it.onclick = () => { ST.binSel = m.id; document.querySelectorAll('.mi.sel').forEach(x => x.classList.remove('sel')); it.classList.add('sel'); };
    it.ondragstart = e => { e.dataTransfer.setData(DT.media, m.id); e.dataTransfer.effectAllowed = 'copy'; dragMedia = m; };
    it.ondragend = () => { dragMedia = null; document.querySelectorAll('.row-t.drop').forEach(r => r.classList.remove('drop')); };
    it.ondblclick = () => appendMedia(m);
    it.oncontextmenu = e => { ST.binSel = m.id; contextMenu(e, [{ label: 'Insert at playhead', kbd: ',', action: () => editFromBin('insert') }, { label: 'Overwrite at playhead', kbd: '.', action: () => editFromBin('overwrite') }, { label: 'Append to end', action: () => appendMedia(m) }, '-', { label: 'Create proxy (low-res preview)', action: () => createProxies([m]), disabled: m.kind !== 'video' || !!m.lowres }, { label: 'Relink…', action: () => relink(m) }, '-', { label: 'Remove from project', action: () => removeMedia(m) }]); };
    g.append(it);
  });
  b.append(g);
}
function newItemMenu() { return [{ label: 'Colour matte / solid', action: () => addGenerator('color') }, { label: 'Gradient background', action: () => addGenerator('gradient') }, { label: 'Black video', action: () => addGenerator('black') }, { label: 'Adjustment layer', action: () => addGenerator('adjust') }, { label: 'Countdown leader', action: () => addGenerator('countdown') }, '-', { label: 'Title', action: () => addTitle('Big title') }, { label: 'Image sequence…', action: importImageSequence }]; }

// ---------------------------------------------------------------------  effects
let fxQuery = '';
function renderEffects() {
  const b = $('#lbody'); const keep = document.activeElement?.classList.contains('search'); b.innerHTML = ''; const w = h('div', { class: 'fx-list' }); const q = fxQuery.toLowerCase(); const ok = s => !q || s.toLowerCase().includes(q);
  const sb = searchBox(fxQuery, v => { fxQuery = v; renderEffects(); }, 'Search effects, looks, presets…'); b.append(h('div', { class: 'bin-tools' }, sb)); if (keep) setTimeout(() => { sb.focus(); sb.setSelectionRange(sb.value.length, sb.value.length); });
  const sec = (title, items) => { items = items.filter(Boolean); if (items.length) w.append(h('h5', {}, title), ...items); };
  const cats = {}; Object.entries(VFX.EFFECTS).forEach(([k, d]) => { if (ok(d.name) || ok(d.cat)) (cats[d.cat] = cats[d.cat] || []).push(dragItem(DT.fx, JSON.stringify({ type: k }), d.name, swatch({ background: FX_SW[k] || 'var(--bg-4)' }, 'fx'), () => addEffect(k), 'Click to add to the selected clip, or drag onto a clip')); });
  Object.entries(cats).forEach(([cat, items]) => sec('Video effects · ' + cat, items));
  sec('Effect presets', VFX.FX_PRESETS.filter(p => ok(p[0])).map(([n, k, over]) => dragItem(DT.fx, JSON.stringify({ type: k, over }), n, swatch({ background: FX_SW[k] }, '★'), () => addEffect(k, over))));
  sec('Lumetri looks', Object.keys(VFX.LOOKS).filter(ok).map(n => dragItem(DT.look, n, n, swatch({ background: 'linear-gradient(135deg,#f59e0b,#3b82f6)', filter: VFX.lookSwatchCss(n) }), () => applyLook(n))));
  sec('Motion presets (keyframes)', KF_PRESETS.filter(p => ok(p[0])).map(([n]) => dragItem(DT.kfp, n, n, swatch({ background: 'var(--accent-soft)', color: 'var(--accent)' }, '◆'), () => applyKfPreset(n))));
  sec('Picture-in-picture & layouts', LAYOUTS.filter(p => ok(p[1])).map(([k, n]) => dragItem(DT.layout, k, n, swatch({ background: LAYOUT_SW(k) }), () => applyLayout(k))));
  sec('Audio effects', [['Normalize', () => toggleAudioFx('normalize')], ['Noise reduction', () => toggleAudioFx('denoise')], ['Voice enhance', () => toggleAudioFx('voice')], ['Fade in / out (0.5 s)', quickFades], ['Auto-duck music under voice…', autoDuckDialog], ['Mute clip', () => setProp('volume', 0)]].filter(([n]) => ok(n)).map(([n, fn]) => h('div', { class: 'fx-it', onclick: fn }, swatch({ background: 'linear-gradient(90deg,#2f8a63,#123,#2f8a63)' }), h('span', { class: 'lbl' }, n))));
  b.append(w);
}
const FX_SW = { chroma: 'linear-gradient(135deg,#00b140 50%,#3d5fa8 50%)', blur: 'radial-gradient(#9ab,#345)', sharpen: 'repeating-linear-gradient(90deg,#fff 0 2px,#333 2px 4px)', mosaic: 'repeating-conic-gradient(#888 0 25%,#444 0 50%) 0 0/8px 8px', vignette: 'radial-gradient(#ddd 30%,#000 80%)', grain: 'repeating-radial-gradient(#777 0 1px,#444 1px 2px)', glow: 'radial-gradient(#fff,#f59e0b 40%,#222 70%)', glitch: 'repeating-linear-gradient(0deg,#f0f 0 3px,#0ff 3px 5px,#222 5px 8px)', rgbsplit: 'linear-gradient(90deg,#f00,#0f0,#00f)', vhs: 'repeating-linear-gradient(0deg,#556 0 2px,#334 2px 4px)', bw: 'linear-gradient(90deg,#000,#fff)', sepia: 'linear-gradient(90deg,#3b2a1a,#d9b48a)', invert: 'linear-gradient(90deg,#fff 50%,#000 50%)', mirror: 'linear-gradient(90deg,#3d5fa8,#9a7bff,#3d5fa8)', flip: 'linear-gradient(270deg,#3d5fa8,#9a7bff)', shadow: 'radial-gradient(circle at 40% 40%,#9a7bff 30%,#111 31%)', rounded: '#9a7bff', border: '#222', crop: '#555',
  crt: 'repeating-linear-gradient(0deg,#3d5fa8 0 2px,#111 2px 3px)', oldfilm: 'linear-gradient(90deg,#5a4630,#c7a77a 48%,#fff 50%,#c7a77a 52%,#5a4630)', kaleido: 'conic-gradient(#f59e0b,#9a7bff,#06b6d4,#f59e0b,#9a7bff,#06b6d4,#f59e0b)', lens: 'radial-gradient(circle,#9ab 20%,#345 60%,#111)', wave: 'repeating-radial-gradient(circle at 0 50%,#3d5fa8 0 3px,#9a7bff 3px 6px)', shake: 'linear-gradient(100deg,#3d5fa8 40%,#9a7bff 41% 59%,#3d5fa8 60%)',
  pixelsort: 'linear-gradient(180deg,#111 0 40%,#f59e0b 40% 55%,#fff 55% 60%,#9a7bff 60%)', edgeglow: 'linear-gradient(135deg,#111 45%,#38e8ff 48% 52%,#111 55%)', halftone: 'radial-gradient(circle,#111 35%,#fff 36%) 0 0/6px 6px', emboss: 'linear-gradient(135deg,#ddd,#777 50%,#333)', duotone: 'linear-gradient(90deg,#1b1446,#ff8a3d)', posterize: 'linear-gradient(90deg,#123 0 25%,#365 25% 50%,#9a5 50% 75%,#fe8 75%)',
  threshold: 'linear-gradient(90deg,#000 50%,#fff 50%)', colorize: 'linear-gradient(90deg,#0b2a4a,#3aa0ff,#cfe6ff)', dirblur: 'linear-gradient(90deg,#3d5fa8,#9aa9d6,#3d5fa8)', radblur: 'radial-gradient(#fff,#3d5fa8 30%,#9aa9d6 50%,#3d5fa8)', lut: 'linear-gradient(135deg,#0f6e78,#e0874a)', wheels: 'conic-gradient(#f44,#ff4,#4f4,#4ff,#44f,#f4f,#f44)', curves: 'linear-gradient(45deg,#222 48%,#ddd 50%,#222 52%)', letterbox: 'linear-gradient(180deg,#000 0 22%,#3d5fa8 22% 78%,#000 78%)' };
const LAYOUT_SW = k => k.startsWith('pip') ? `radial-gradient(circle at ${k.endsWith('l') ? '22%' : '78%'} ${k.includes('-t') ? '25%' : '75%'},#9a7bff 18%,#3d5fa8 19%)` : k === 'split2' ? 'linear-gradient(90deg,#3d5fa8 49%,#000 49% 51%,#b06a2b 51%)' : k === 'split2v' ? 'linear-gradient(180deg,#3d5fa8 48%,#000 48% 52%,#b06a2b 52%)' : k === 'split3' ? 'linear-gradient(90deg,#3d5fa8 32%,#000 32% 34%,#b06a2b 34% 65%,#000 65% 67%,#2f8a63 67%)' : k === 'grid4' ? 'conic-gradient(#3d5fa8 0 25%,#b06a2b 0 50%,#2f8a63 0 75%,#7a4fb0 0)' : '#3d5fa8';
function addEffect(type, over = {}, cs = selected()) {
  cs = cs.filter(isVisual); if (!cs.length) return toast('Select a video, image, title, shape or adjustment clip first');
  let last; cs.forEach(c => { last = VFX.newFx(type, over); c.fx.push(last); }); ST.fxFocus = last.id;
  PREFS.collapsed = (PREFS.collapsed || []).filter(x => x !== 'Effects'); commit('Add effect: ' + VFX.EFFECTS[type].name); renderTimeline(); renderFx(); drawFrame();
}
function applyLook(name, cs = selected()) { cs = cs.filter(isVisual); if (!cs.length) return toast('Select a clip (or an adjustment layer) first'); cs.forEach(c => { c.props.lu = { ...VFX.LU_DEFAULT, ...c.props.lu, look: name, lookAmt: 100 }; }); commit('Look: ' + name); renderTimeline(); renderFx(); drawFrame(); }
function toggleAudioFx(k) { const cs = selected().filter(hasAudioOf); if (!cs.length) return toast('Select an audio clip or a video clip with audio'); const on = !cs.every(c => c.props[k]); cs.forEach(c => c.props[k] = on); commit((on ? 'Enable ' : 'Disable ') + k); renderFx(); toast(`${{ normalize: 'Normalize', denoise: 'Noise reduction', voice: 'Voice enhance' }[k]} ${on ? 'on' : 'off'}${k === 'denoise' ? ' — heard in exports, or use “Bake audio effects” to hear it now' : ''}`); }

// ---------------------------------------------------------------------  transitions panel
function renderTransitions() {
  const b = $('#lbody'); b.innerHTML = ''; const w = h('div', { class: 'fx-list' });
  const d = h('input', { type: 'number', value: PREFS.trDur, min: 0.1, max: 10, step: 0.1, style: { width: '64px' } }); d.onchange = () => { PREFS.trDur = clamp(+d.value || 1, 0.04, 10); savePrefs(); };
  b.append(h('div', { class: 'bin-tools' }, h('span', { class: 'muted', style: { alignSelf: 'center' } }, 'Default duration (s)'), d));
  w.append(h('div', { class: 'hint' }, 'Drag a transition onto a cut (left half of a clip = its start, right half = its end). Click to apply at the cut nearest the playhead. Double-click a transition on the timeline to change its duration.'));
  w.append(h('h5', {}, 'Video transitions'));
  VFX.TRANSITIONS.forEach(([k, l]) => w.append(dragItem(DT.tr, k, l, swatch({ background: VFX.TR_SWATCH[k] }), () => applyTransition(k))));
  b.append(w);
}

// ---------------------------------------------------------------------  graphics (titles, shapes, stickers)
const STICKERS = ['⭐', '❤️', '👍', '😂', '🔥', '🎉', '✅', '❗', '❓', '👉', '😎', '💯', '🎵', '📍', '💡', '🚀', '👏', '😮', '🙌', '✨'];
const SHAPES = [['rect', 'Rectangle'], ['ellipse', 'Ellipse'], ['triangle', 'Triangle'], ['arrow', 'Arrow'], ['star', 'Star'], ['heart', 'Heart'], ['line', 'Line']];
function renderTitles() {
  const b = $('#lbody'); b.innerHTML = ''; const w = h('div', { class: 'fx-list' });
  w.append(h('h5', {}, 'Text templates — click to add at playhead'));
  Object.keys(TITLE_TPL).forEach(k => w.append(dragItem(DT.title, k, k, swatch({ background: '#b06a2b', display: 'grid', placeItems: 'center', fontSize: '11px', fontWeight: 700, color: '#fff' }, 'T'), () => addTitle(k))));
  w.append(h('h5', {}, 'Shapes'));
  const sg = h('div', { class: 'shape-grid' }); SHAPES.forEach(([k, l]) => { const def = { shape: k }; const it = h('div', { class: 'shape-it', draggable: 'true', 'data-tip': l, onclick: () => addShape(def), html: shapeIcon(k) }); it.ondragstart = e => e.dataTransfer.setData(DT.shape, JSON.stringify(def)); sg.append(it); }); w.append(sg);
  w.append(h('h5', {}, 'Stickers'));
  const st = h('div', { class: 'shape-grid stickers' }); STICKERS.forEach(s => { const def = { shape: 'emoji', text: s }; const it = h('div', { class: 'shape-it', draggable: 'true', onclick: () => addShape(def) }, s); it.ondragstart = e => e.dataTransfer.setData(DT.shape, JSON.stringify(def)); st.append(it); }); w.append(st);
  w.append(h('h5', {}, 'Backgrounds & generators'));
  [['color', 'Colour matte / solid', '#1d4ed8'], ['gradient', 'Gradient background', 'linear-gradient(135deg,#1d4ed8,#9333ea)'], ['black', 'Black video', '#000'], ['adjust', 'Adjustment layer', 'repeating-linear-gradient(45deg,#666 0 4px,#444 4px 8px)'], ['countdown', 'Countdown leader', 'conic-gradient(#9a7bff 0 70%,#222 0)']].forEach(([k, l, bg]) => w.append(dragItem(DT.gen, k, l, swatch({ background: bg }), () => addGenerator(k))));
  b.append(w);
}
function shapeIcon(k) { const d = { rect: '<rect x="3" y="6" width="18" height="12" rx="2"/>', ellipse: '<ellipse cx="12" cy="12" rx="9" ry="6"/>', triangle: '<path d="M12 4l9 16H3z"/>', arrow: '<path d="M3 10h11V6l7 6-7 6v-4H3z"/>', star: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>', heart: '<path d="M12 20s-8-5-8-10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5-8 10-8 10z"/>', line: '<path d="M3 12h18" stroke-width="3"/>' }[k]; return `<svg viewBox="0 0 24 24" style="width:26px;height:26px">${d}</svg>`; }

// ---------------------------------------------------------------------  captions panel
function renderCaptions() {
  if (ltab !== 'captions') return; const b = $('#lbody'); const af = document.activeElement; if (af && b.contains(af) && af.tagName === 'TEXTAREA') return; b.innerHTML = '';
  const preset = h('select', {}, ...Object.keys(VCAP.PRESETS).map(k => h('option', { selected: PJ.capStyle.preset === k }, k))); preset.onchange = () => { PJ.capStyle = { ...PJ.capStyle, preset: preset.value, ...VCAP.PRESETS[preset.value] }; commit('Caption style'); drawFrame(); };
  const burn = h('input', { type: 'checkbox', checked: PJ.capBurn }); burn.onchange = () => { PJ.capBurn = burn.checked; commit('Caption burn-in'); renderTimeline(); };
  b.append(h('div', { class: 'bin-tools wrap' }, h('button', { class: 'btn sm primary', html: icon('plus') + 'Add', onclick: () => addCaption(ST.t) }), h('button', { class: 'btn sm', onclick: importCaptions }, 'Import SRT/VTT'), h('button', { class: 'btn sm', onclick: () => exportCaptions('srt') }, 'SRT'), h('button', { class: 'btn sm', onclick: () => exportCaptions('vtt') }, 'VTT')),
    h('div', { class: 'bin-tools wrap' }, h('span', { class: 'muted' }, 'Style'), preset, h('button', { class: 'btn sm ghost', onclick: captionStyleDialog }, 'Customize…'), h('label', { class: 'row', style: { color: 'var(--tx-1)', fontSize: '12px' } }, burn, 'Burn into export')),
    h('div', { class: 'bin-tools wrap' }, h('button', { class: 'btn sm primary', onclick: autoTranscribeDialog, 'data-tip': 'Recognise the speech and create timed captions (offline)' }, 'Auto-transcribe…'), h('button', { class: 'btn sm', onclick: transcriptDialog, 'data-tip': 'Paste what is said — BTS Video times it to the speech (offline)' }, 'Auto-time transcript…'), h('button', { class: 'btn sm' + (PJ.censor.words.length ? ' primary' : ''), onclick: censorDialog }, `Censor words${PJ.censor.words.length ? ` (${PJ.censor.words.length})` : ''}…`), (() => { const i = h('input', { type: 'checkbox', checked: !!PJ.censor.bleep }); i.onchange = () => setCensor({ bleep: i.checked }); return h('label', { class: 'row', style: { color: 'var(--tx-1)', fontSize: '12px' }, 'data-tip': 'Mute + 1 kHz tone over censored words' }, i, 'Bleep'); })()));
  if (!PJ.captions.length) { b.append(h('div', { class: 'empty-bin' }, 'No captions yet. Use “Auto-transcribe…” to recognise the speech, import an SRT or WebVTT file, paste a transcript with “Auto-time transcript…”, click Add, or double-click the CC track on the timeline.')); return; }
  const list = h('div', { class: 'cap-list' });
  PJ.captions.forEach(cp => {
    const num = (v, on) => { const i = h('input', { type: 'number', step: 0.1, min: 0, value: v.toFixed(2) }); i.onchange = () => { on(Math.max(0, +i.value)); PJ.captions.sort((a, b2) => a.start - b2.start); commit('Caption timing'); renderTimeline(); renderCaptions(); drawFrame(); }; return i; };
    const ta = h('textarea', { rows: 2 }, cp.text); ta.oninput = () => { cp.text = ta.value; drawFrameSoon(); commitDebounced('Caption text'); renderTimelineSoon(); };
    const cens = PJ.censor.words.length ? VCAP.wordTimes(cp, true).filter(wd => VCAP.isCensored(wd.w, PJ.censor.words)).length : 0;
    const row = h('div', { class: 'cap-row' + (ST.selCap === cp.id ? ' sel' : '') + (ST.t >= cp.start && ST.t < cp.end ? ' now' : ''), 'data-id': cp.id },
      (cp.words && cp.words.length === VCAP.tokens(cp.text).length) || cens ? h('div', { class: 'wd' }, [(cp.words && cp.words.length === VCAP.tokens(cp.text).length) ? `${cp.words.length} timed words` : '', cens ? `${cens} censored${PJ.censor.bleep ? ' · bleep' : ''}` : ''].filter(Boolean).join(' · ')) : '',
      h('div', { class: 'tm' }, num(cp.start, v => { cp.start = v; if (cp.end <= v) cp.end = v + 0.5; }), h('span', { class: 'muted' }, '→'), num(cp.end, v => { cp.end = Math.max(cp.start + 0.1, v); }), h('button', { class: 'icon-btn sm', 'data-tip': 'Go to caption', html: icon('play'), onclick: () => seek(cp.start) }), h('button', { class: 'icon-btn sm', 'data-tip': 'Delete caption', html: icon('trash'), onclick: () => { PJ.captions = PJ.captions.filter(x => x !== cp); commit('Delete caption'); renderTimeline(); renderCaptions(); drawFrame(); } })), ta);
    row.onclick = e => { if (e.target.tagName === 'INPUT' || e.target.closest('button')) return; ST.selCap = cp.id; ST.sel.clear(); if (e.target.tagName !== 'TEXTAREA') seek(cp.start + 0.01); document.querySelectorAll('.cap-row.sel').forEach(x => x.classList.remove('sel')); row.classList.add('sel'); renderTimeline(); };
    list.append(row);
  });
  b.append(list);
}
async function captionStyleDialog() {
  const s = PJ.capStyle;
  const v = await form({ title: 'Caption style', width: 420, fields: [{ key: 'font', label: 'Font', type: 'select', value: s.font, options: FONTS }, { key: 'size', label: 'Size (at 1080p)', type: 'range', value: s.size, min: 16, max: 140 }, { key: 'weight', label: 'Weight', type: 'select', value: String(s.weight), options: ['400', '600', '700', '800', '900'] },
    { key: 'color', label: 'Text colour', type: 'color', value: s.color }, { key: 'outline', label: 'Outline width', type: 'range', value: s.outline, min: 0, max: 14 }, { key: 'outlineColor', label: 'Outline colour', type: 'color', value: s.outlineColor },
    { key: 'bg', label: 'Background colour', type: 'color', value: s.bg }, { key: 'bgOpacity', label: 'Background opacity %', type: 'range', value: s.bgOpacity, min: 0, max: 100 },
    { key: 'pos', label: 'Position', type: 'select', value: s.pos, options: [{ value: 'bottom', label: 'Bottom' }, { value: 'middle', label: 'Middle' }, { value: 'top', label: 'Top' }] }, { key: 'margin', label: 'Margin %', type: 'range', value: s.margin, min: 0, max: 30 }, { key: 'upper', label: 'UPPERCASE', type: 'checkbox', value: s.upper }],
    onChange: vals => { PJ.capStyle = { ...s, ...vals, weight: +vals.weight }; drawFrame(); } });
  if (!v) { PJ.capStyle = s; drawFrame(); return; } PJ.capStyle = { ...s, ...v, weight: +v.weight, preset: 'Custom' }; commit('Caption style'); renderCaptions(); drawFrame();
}
async function importCaptions() {
  const f = await bts.fs.open({ filters: [{ name: 'Captions', extensions: ['srt', 'vtt'] }] }); if (!f) return;
  const caps = VCAP.parse(new TextDecoder().decode(new Uint8Array(f[0].data))); if (!caps.length) return toast('No captions found in that file', 'err');
  let replace = true; if (PJ.captions.length) { const r = await modal({ title: 'Import captions', body: `Replace the ${PJ.captions.length} existing captions or add to them?`, buttons: [{ label: 'Cancel', value: null }, { label: 'Add', value: 'add' }, { label: 'Replace', primary: true, value: 'rep' }] }); if (!r) return; replace = r === 'rep'; }
  addCaptionsFromList(caps, replace); toast(`Imported ${caps.length} captions`, 'ok');
}
function addCaptionsFromList(caps, replace) { if (replace) PJ.captions = []; caps.forEach(c => PJ.captions.push({ id: uid('cc'), ...c })); PJ.captions.sort((a, b) => a.start - b.start); commit('Import captions'); showLeft('captions'); renderTimeline(); drawFrame(); }
async function exportCaptions(fmt) { if (!PJ.captions.length) return toast('There are no captions'); const caps = PJ.censor.on && PJ.censor.words.length ? PJ.captions.map(c => ({ ...c, text: VCAP.censor(c.text, PJ.censor.words) })) : PJ.captions; const txt = fmt === 'vtt' ? VCAP.toVTT(caps) : VCAP.toSRT(caps); const p = await bts.fs.saveAs({ data: new TextEncoder().encode(txt), defaultPath: PJ.name.replace(/\.btsvid$/, '') + '.' + fmt, filters: [{ name: fmt.toUpperCase(), extensions: [fmt] }] }); if (p) toast('Saved ' + p.split(/[\\/]/).pop(), 'ok'); }

// ---------------------------------------------------------------------  history panel
function renderHistory() {
  if (ltab !== 'history') return; const b = $('#lbody'); b.innerHTML = '';
  b.append(h('div', { class: 'bin-tools' }, h('button', { class: 'btn sm', html: icon('undo') + 'Undo', onclick: undo }), h('button', { class: 'btn sm', html: icon('redo') + 'Redo', onclick: redo }), h('span', { class: 'muted cnt' }, `${hist.length} steps`)));
  const list = h('div', { class: 'hist-list' });
  hist.forEach((st, i) => list.append(h('div', { class: 'hist-it' + (i === hi ? ' cur' : '') + (i > hi ? ' fut' : ''), onclick: () => jumpHistory(i) }, h('span', { class: 'n' }, String(i + 1)), h('span', { class: 'lbl' }, st.label), h('span', { class: 'muted tm' }, I18N.date(st.at, { hour: '2-digit', minute: '2-digit' })))));
  b.append(list); const cur = list.querySelector('.cur'); cur && cur.scrollIntoView({ block: 'nearest' });
}

// =====================================================================  Effect Controls inspector
const FONTS = ['Segoe UI', 'Arial', 'Arial Black', 'Impact', 'Georgia', 'Times New Roman', 'Verdana', 'Trebuchet MS', 'Courier New', 'Comic Sans MS', 'Segoe Script', 'Nirmala UI', 'Tahoma', 'Calibri', 'Cambria', 'Consolas'];
const ANIMS = [['none', 'None'], ['fade', 'Fade'], ['rise', 'Fade up'], ['pop', 'Pop'], ['slide', 'Slide in'], ['type', 'Typewriter'], ['wipe', 'Wipe reveal'], ['letters', 'Letter by letter'], ['roll', 'Credits roll'],
  ['words', 'Word by word'], ['bounce', 'Bounce'], ['wave', 'Wave'], ['blurIn', 'Blur in'], ['trackIn', 'Track in (letter spacing)'], ['zoomIn', 'Zoom in'], ['glitch', 'Glitch text'], ['neon', 'Neon flicker'], ['drop', 'Drop in'], ['flip', 'Flip in'], ['scramble', 'Scramble / decode'], ['karaoke', 'Karaoke highlight']];
const isCollapsed = t => (PREFS.collapsed || []).includes(t);
function toggleCollapsed(t) { const s = new Set(PREFS.collapsed || []); s.has(t) ? s.delete(t) : s.add(t); PREFS.collapsed = [...s]; savePrefs(); }
function animGet(c, key, lt) { if (c.kf?.[key]?.length) return VFX.evalKf(c.kf[key], lt); if (key.startsWith('fx:')) { const [, id, p] = key.split(':'); return c.fx.find(f => f.id === id)?.[p]; } if (key.startsWith('mask:')) { const [, id, p] = key.split(':'); return (c.masks || []).find(m => m.id === id)?.[p]; } return c.props[key]; }
function animSet(c, key, v, lt) { if (c.kf?.[key]?.length) { VFX.setKey(c.kf, key, lt, v); return; } if (key.startsWith('fx:')) { const [, id, p] = key.split(':'); const f = c.fx.find(x => x.id === id); if (f) f[p] = v; } else if (key.startsWith('mask:')) { const [, id, p] = key.split(':'); const m = (c.masks || []).find(x => x.id === id); if (m) m[p] = v; } else c.props[key] = v; }
let rfT = null; function renderFxSoon() { if (ST.playing) return; clearTimeout(rfT); rfT = setTimeout(() => { const a = document.activeElement; if (a && $('#fx').contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.type !== 'range') return; const c = selected()[0]; if (c && Object.keys(c.kf || {}).length) renderFx(); if (ltab === 'captions') renderCaptions(); }, 60); }
function renderFx() {
  const b = $('#fx'); const scroll = b.scrollTop; b.innerHTML = ''; const s = selected();
  const w = h('div', { class: 'ec' });
  const grp = (title, ...kids) => { const g = h('div', { class: 'grp' + (isCollapsed(title) ? ' collapsed' : '') }, h('h5', { onclick: () => { toggleCollapsed(title); g.classList.toggle('collapsed'); } }, h('span', {}, h('span', { class: 'car' }, '▾'), title)), h('div', { class: 'gb' }, ...kids)); return g; };
  if (ST.selTr) { const tr = PJ.transitions.find(t => t.id === ST.selTr); if (tr) { renderTransitionInspector(w, tr, grp); b.append(w); return; } }
  if (ST.selCap) { const cp = PJ.captions.find(c => c.id === ST.selCap); if (cp) { const ta = h('textarea', { rows: 3 }, cp.text); ta.oninput = () => { cp.text = ta.value; drawFrameSoon(); commitDebounced('Caption text'); renderTimelineSoon(); };
    w.append(h('div', { class: 'grp' }, h('div', { class: 'ttl' }, 'Caption'), h('div', { class: 'muted sub' }, `${tc(cp.start)} → ${tc(cp.end)}`)), grp('Text', ta, h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn sm', onclick: () => splitCaption(cp) }, 'Split at playhead'), h('button', { class: 'btn sm', onclick: () => showLeft('captions') }, 'Caption list'), h('button', { class: 'btn sm', onclick: captionStyleDialog }, 'Style…')))); b.append(w); return; } }
  if (s.length !== 1) { w.append(h('div', { class: 'none' }, s.length ? `${s.length} clips selected — effects, looks and presets you click apply to all of them.` : 'Select a clip in the timeline to edit its motion, keyframes, effects, colour, audio and transitions.')); b.append(w); return; }
  const c = s[0], p = c.props; const D = tlDur(c); const lt = () => clamp(ST.t - c.start, 0, D); const m = mediaById(c.mediaId);
  const live = () => drawFrameSoon(); const done = l => { commitDebounced(l); };
  // generic animatable slider
  const slider = (label, key, min, max, step = 1, opts = {}) => {
    const animated = !!c.kf?.[key]?.length; const canAnim = opts.anim !== false && (ANIM_KEYS.includes(key) || key.startsWith('fx:') || key.startsWith('mask:'));
    const val = animGet(c, key, lt()) ?? 0; const r = h('input', { type: 'range', min, max, step, value: val }); const n = h('input', { type: 'number', min, max, step, value: +(+val).toFixed(step < 1 ? 2 : 0) });
    const set = v => { animSet(c, key, v, lt()); live(); done(label); if (opts.onSet) opts.onSet(v); if (['fadeIn', 'fadeOut', 'volume', 'speed'].includes(key) || animated) renderTimelineSoon(); };
    r.oninput = () => { n.value = r.value; set(+r.value); }; n.oninput = () => { if (n.value === '') return; r.value = n.value; set(+n.value); };
    const sw = canAnim ? h('button', { class: 'kf-sw' + (animated ? ' on' : ''), 'data-tip': animated ? 'Stop animating (removes keyframes)' : 'Toggle animation — adds a keyframe at the playhead', html: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 13V9M10 2h4"/></svg>', onclick: () => { if (animated) { const v = animGet(c, key, lt()); delete c.kf[key]; animSet(c, key, v, lt()); } else VFX.setKey(c.kf, key, frameSnap(lt()), +val, 'linear'); commit(animated ? 'Remove keyframes' : 'Add keyframe'); renderFx(); renderTimeline(); } }) : h('span');
    let nav = h('span');
    if (animated) { const keys = c.kf[key]; const at = keys.find(k => Math.abs(k.t - lt()) < 0.5 / PJ.seq.fps);
      nav = h('span', { class: 'kf-nav' }, h('button', { 'data-tip': 'Previous keyframe', onclick: () => { const k = [...keys].reverse().find(k => k.t < lt() - 1e-3); if (k) seek(c.start + k.t); } }, '‹'),
        h('button', { class: 'dia' + (at ? ' on' : ''), 'data-tip': at ? 'Remove keyframe (right-click: easing)' : 'Add keyframe', onclick: () => { if (at) { c.kf[key] = keys.filter(k => k !== at); if (!c.kf[key].length) { delete c.kf[key]; animSet(c, key, at.v, lt()); } } else VFX.setKey(c.kf, key, frameSnap(lt()), animGet(c, key, lt())); commit('Keyframe'); renderFx(); renderTimeline(); },
          oncontextmenu: e => { if (!at) return; contextMenu(e, VFX.EASES.map(([k2, l]) => ({ label: l, checked: (at.e || 'linear') === k2, action: () => { at.e = k2; commit('Keyframe easing'); drawFrame(); } }))); } }, '◆'),
        h('button', { 'data-tip': 'Next keyframe', onclick: () => { const k = keys.find(k => k.t > lt() + 1e-3); if (k) seek(c.start + k.t); } }, '›')); }
    return h('div', { class: 'p' + (animated ? ' anim' : '') }, sw, h('span', { class: 'pl' }, label), r, n, nav);
  };
  const sel = (label, obj, key, opts, after) => { const s2 = h('select', {}, ...opts.map(([v, l]) => h('option', { value: v, selected: obj[key] == v }, l))); s2.onchange = () => { obj[key] = isNaN(+s2.value) || s2.value === '' ? s2.value : +s2.value; live(); commit(label); after ? after() : (renderTimeline(), renderFx()); }; return h('div', { class: 'p2' }, h('span', {}, label), s2); };
  const chk = (label, obj, key, after) => { const i = h('input', { type: 'checkbox', checked: !!obj[key] }); i.onchange = () => { obj[key] = i.checked; live(); commit(label); after && after(); }; return h('label', { class: 'p2' }, h('span', {}, label), i); };
  const col = (label, obj, key) => { const i = h('input', { type: 'color', value: obj[key] }); i.oninput = () => { obj[key] = i.value; live(); done(label); }; return h('div', { class: 'p2' }, h('span', {}, label), i); };
  const plain = (label, obj, key, min, max, step = 1) => { const r = h('input', { type: 'range', min, max, step, value: obj[key] }); const n = h('input', { type: 'number', min, max, step, value: obj[key] }); const set = v => { obj[key] = v; live(); done(label); }; r.oninput = () => { n.value = r.value; set(+r.value); }; n.oninput = () => { r.value = n.value; set(+n.value); }; return h('div', { class: 'p' }, h('span'), h('span', { class: 'pl' }, label), r, n, h('span')); };
  const title = c.type === 'title' ? 'Title' : c.type === 'shape' ? 'Shape' : c.type === 'adjust' ? 'Adjustment layer' : c.name;
  w.append(h('div', { class: 'grp' }, h('div', { class: 'ttl' }, title), h('div', { class: 'muted sub' }, `${c.track} · ${tc(c.start)} → ${tc(cEnd(c))} · ${D.toFixed(2)}s${c.link ? ' · linked' : ''}`)));
  if (c.type === 'title') {
    const ta = h('textarea', { rows: 3 }, p.text); ta.oninput = () => { p.text = ta.value; c.name = ta.value.split('\n')[0]; live(); done('Title text'); renderTimelineSoon(); };
    w.append(grp('Text', ta, sel('Font', p, 'font', FONTS.map(f => [f, f]), () => { }), plain('Size', p, 'size', 8, 400), sel('Weight', p, 'weight', [[300, 'Light'], [400, 'Regular'], [600, 'Semibold'], [700, 'Bold'], [800, 'Extra bold'], [900, 'Black']], () => { }), chk('Italic', p, 'italic'),
      sel('Align', p, 'align', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']], () => { }), plain('Letter spacing', p, 'spacing', -10, 60), plain('Line height', p, 'lineH', 0.8, 2.5, 0.05), col('Colour', p, 'color'),
      chk('Shadow', p, 'shadow'), col('Shadow colour', p, 'shadowColor'), plain('Stroke', p, 'outline', 0, 20), col('Stroke colour', p, 'outlineColor'),
      chk('Background box', p, 'box'), col('Box colour', p, 'boxColor'), plain('Box opacity', p, 'boxOpacity', 0, 100),
      sel('Animation', p, 'anim', ANIMS, () => { }), sel('Template style', p, 'style', [['', 'Plain'], ['lower3', 'Lower third'], ['card', 'Title card'], ['cta', 'Call to action'], ['quote', 'Quote'], ['countdown', 'Countdown']], () => renderFx()), col('Accent colour', p, 'accent'),
      p.style === 'countdown' ? plain('Count from', p, 'count', 1, 60) : ''));
  }
  if (c.type === 'shape') w.append(grp('Shape', sel('Shape', p, 'shape', [...SHAPES, ['emoji', 'Sticker / emoji']], () => renderFx()), p.shape === 'emoji' ? (() => { const i = h('input', { type: 'text', value: p.text }); i.oninput = () => { p.text = i.value; live(); done('Sticker'); }; return h('div', { class: 'p2' }, h('span', {}, 'Character'), i); })() : '', col('Fill', p, 'fill'), col('Stroke', p, 'stroke'), plain('Stroke width', p, 'strokeW', 0, 40), plain('Width', p, 'w', 4, 3000), plain('Height', p, 'h', 2, 3000), p.shape === 'rect' ? plain('Corner radius', p, 'radius', 0, 500) : ''));
  if (c.type === 'nest') { const sd = nestSeq(c); const nd = nestDur(c);
    w.append(grp('Nested sequence', h('div', { class: 'okmsg' }, sd ? `“${sd.name}” · ${sd.seq.w}×${sd.seq.h} · ${nd.toFixed(2)} s · ${sd.clips.length} clip(s)` : 'The nested sequence is missing.'), nd > c.out + 0.05 || nd < c.out - 0.05 ? h('div', { class: 'warn' }, `The nested sequence is ${nd.toFixed(2)} s long; this clip shows ${c.in.toFixed(2)}–${c.out.toFixed(2)} s of it.`) : '',
      h('div', { class: 'btn-row' }, h('button', { class: 'btn sm primary', onclick: () => openNest(c) }, 'Open (edit contents)'), h('button', { class: 'btn sm', onclick: () => matchNestLength(c) }, 'Match sequence length'), h('button', { class: 'btn sm', onclick: () => renameSequence(c.seqId) }, 'Rename…')))); }
  if (c.type === 'color') w.append(grp('Colour matte', col('Colour', p, 'color'), sel('Gradient', p, 'grad', [['none', 'Solid'], ['linear', 'Linear gradient'], ['radial', 'Radial gradient']], () => { renderFx(); renderTimeline(); }), p.grad !== 'none' ? col('Colour 2', p, 'color2') : '', p.grad === 'linear' ? plain('Angle°', p, 'angle', 0, 360) : ''));
  if (isVisual(c)) {
    if (c.type !== 'adjust') {
      w.append(grp('Motion', slider('Position X', 'x', -PJ.seq.w, PJ.seq.w), slider('Position Y', 'y', -PJ.seq.h, PJ.seq.h), slider('Scale %', 'scale', 0, 500), slider('Rotation°', 'rotation', -360, 360),
        ['video', 'image'].includes(c.type) ? sel('Frame fit', p, 'fit', [['fit', 'Fit (letterbox)'], ['fill', 'Fill (crop)'], ['stretch', 'Stretch']], () => { }) : '',
        ['video', 'image'].includes(c.type) && p.fit === 'fit' ? sel('Empty area', p, 'bgFill', [['none', 'Background colour'], ['blur', 'Blurred copy (social)']], () => { }) : '',
        h('div', { class: 'p2' }, h('span', {}, 'Preset'), (() => { const s3 = h('select', {}, h('option', { value: '' }, 'Apply motion preset…'), ...KF_PRESETS.map(([n]) => h('option', { value: n }, n))); s3.onchange = () => { if (s3.value) applyKfPreset(s3.value, [c]); }; return s3; })())));
      w.append(grp('Opacity', slider('Opacity %', 'opacity', 0, 100), slider('Fade in (s)', 'fadeIn', 0, Math.max(0.1, Math.min(10, D)), 0.05, { anim: false }), slider('Fade out (s)', 'fadeOut', 0, Math.max(0.1, Math.min(10, D)), 0.05, { anim: false })));
      if (['video', 'image', 'color'].includes(c.type)) w.append(grp('Crop', slider('Left %', 'cropL', 0, 100), slider('Right %', 'cropR', 0, 100), slider('Top %', 'cropT', 0, 100), slider('Bottom %', 'cropB', 0, 100)));
    }
    // masks
    const mlist = h('div'); const lt0 = lt();
    (c.masks || []).forEach(m => {
      const foc = focusMask(c) === m; const on = h('input', { type: 'checkbox', checked: m.on !== false, 'data-tip': 'Mask on/off' }); on.onchange = () => { m.on = on.checked; commit('Mask on/off'); drawFrame(); };
      const card = h('div', { class: 'mask-card' + (foc ? ' focus' : '') }, h('div', { class: 'mask-h' }, on, h('span', { class: 'nm', onclick: () => { ST.maskFocus = m.id; renderFx(); drawOverlay(); } }, (foc ? '▾ ' : '▸ ') + m.name + ' · ' + (MASK_TYPES.find(t => t[0] === m.type) || [, m.type])[1]), h('button', { class: 'icon-btn sm', 'data-tip': 'Delete mask', html: icon('trash'), onclick: () => removeMask(c, m.id) })));
      if (foc) card.append(slider('Position X', `mask:${m.id}:x`, -PJ.seq.w, PJ.seq.w), slider('Position Y', `mask:${m.id}:y`, -PJ.seq.h, PJ.seq.h), m.type !== 'pen' ? slider('Width', `mask:${m.id}:w`, 2, PJ.seq.w * 2) : '', m.type !== 'pen' ? slider('Height', `mask:${m.id}:h`, 2, PJ.seq.h * 2) : '', slider('Rotation°', `mask:${m.id}:rot`, -180, 180),
        slider('Feather', `mask:${m.id}:feather`, 0, 300), slider('Expansion', `mask:${m.id}:expand`, -300, 300), slider('Opacity %', `mask:${m.id}:opacity`, 0, 100), chk('Inverted', m, 'invert'), m.type === 'pen' ? chk('Smooth (bezier)', m, 'smooth') : '',
        sel('Mode', m, 'mode', [['add', 'Add'], ['subtract', 'Subtract'], ['intersect', 'Intersect']]),
        m.type === 'pen' ? h('div', { class: 'btn-row' }, h('button', { class: 'btn sm' + (c.kf[`mask:${m.id}:pts`]?.length ? ' primary' : ''), onclick: () => toggleMaskPathKf(c, m, lt0), 'data-tip': 'Animate the mask shape (keyframe the path at the playhead)' }, c.kf[`mask:${m.id}:pts`]?.length ? '◆ Path animated' : 'Animate path'), h('button', { class: 'btn sm', onclick: () => { if (c.kf[`mask:${m.id}:pts`]?.length) VFX.setKey(c.kf, `mask:${m.id}:pts`, frameSnap(lt0), flatPts(maskAt(c, m, lt0).pts)); commit('Path keyframe'); renderTimeline(); renderFx(); } }, '+ Path key')) : '',
        c.type === 'video' ? h('div', { class: 'btn-row' }, h('button', { class: 'btn sm', onclick: () => trackSelected(-1, { target: 'mask' }), 'data-tip': 'Track the masked area backward from the playhead' }, '◀ Track'), h('button', { class: 'btn sm', onclick: () => trackSelected(1, { target: 'mask' }), 'data-tip': 'Track the masked area forward from the playhead (writes position keyframes)' }, 'Track ▶')) : '');
      mlist.append(card);
    });
    w.append(grp('Masks', mlist, h('div', { class: 'btn-row' }, h('button', { class: 'btn sm', onclick: () => addMask('ellipse', [c]) }, '+ Ellipse'), h('button', { class: 'btn sm', onclick: () => addMask('rect', [c]) }, '+ Rectangle'), h('button', { class: 'btn sm', onclick: () => addMask('pen', [c]) }, '+ Pen'), h('button', { class: 'btn sm ghost', onclick: startPenMask, 'data-tip': 'Click points on the program monitor' }, 'Draw pen…')),
      !(c.masks || []).length ? h('div', { class: 'muted', style: { fontSize: '11.5px' } }, 'Masks cut out part of this clip. Drag them on the program monitor; animate or track them.') : ''));
    // effect stack
    const stack = h('div', { class: 'fx-stack' });
    c.fx.forEach((f, i) => {
      const d = VFX.EFFECTS[f.type]; if (!d) return; const open = ST.fxFocus === f.id || c.fx.length <= 2;
      const on = h('input', { type: 'checkbox', checked: f.on, 'data-tip': 'Effect on/off' }); on.onchange = () => { f.on = on.checked; commit((f.on ? 'Enable ' : 'Disable ') + d.name); drawFrame(); renderTimeline(); };
      const hd = h('div', { class: 'fx-h', draggable: 'true' }, on, h('span', { class: 'nm', onclick: () => { ST.fxFocus = ST.fxFocus === f.id ? null : f.id; renderFx(); drawOverlay(); } }, (open ? '▾ ' : '▸ ') + d.name),
        h('button', { class: 'mini', 'data-tip': 'Move up', disabled: i === 0, onclick: () => { c.fx.splice(i - 1, 0, c.fx.splice(i, 1)[0]); commit('Reorder effects'); renderFx(); drawFrame(); } }, '▲'),
        h('button', { class: 'mini', 'data-tip': 'Move down', disabled: i === c.fx.length - 1, onclick: () => { c.fx.splice(i + 1, 0, c.fx.splice(i, 1)[0]); commit('Reorder effects'); renderFx(); drawFrame(); } }, '▼'),
        h('button', { class: 'mini', 'data-tip': 'Remove effect', onclick: () => { c.fx.splice(i, 1); for (const k in c.kf) if (k.startsWith('fx:' + f.id + ':')) delete c.kf[k]; commit('Remove ' + d.name); renderFx(); drawFrame(); renderTimeline(); } }, '✕'));
      hd.ondragstart = e => { e.dataTransfer.setData('text/bts-fxi', String(i)); }; hd.ondragover = e => { if (e.dataTransfer.types.includes('text/bts-fxi')) e.preventDefault(); };
      hd.ondrop = e => { const from = +e.dataTransfer.getData('text/bts-fxi'); if (isNaN(from) || from === i) return; c.fx.splice(i, 0, c.fx.splice(from, 1)[0]); commit('Reorder effects'); renderFx(); drawFrame(); };
      const body = h('div', { class: 'fx-b' + (open ? '' : ' hidden') });
      if (d.ui && window.VGRADE) body.append(VGRADE.ui(d, { c, f, slider, live, commit: l => { commit(l); renderTimeline(); drawFrame(); }, commitSoon: done }) || '');
      else d.params.forEach(pp => {
        if (pp.type === 'color') body.append(col(pp.label, f, pp.k)); else if (pp.type === 'bool') body.append(chk(pp.label, f, pp.k, () => drawOverlay())); else if (pp.type === 'select') body.append(sel(pp.label, f, pp.k, pp.opts, () => { drawOverlay(); }));
        else body.append(slider(pp.label, `fx:${f.id}:${pp.k}`, pp.min, pp.max, pp.step || 1, { onSet: () => drawOverlay() }));
      });
      if (f.type === 'chroma') body.append(h('div', { class: 'p2' }, h('span', {}, 'Pick key'), h('button', { class: 'btn sm', onclick: () => pickKeyColor(c, f) }, 'Eyedropper on monitor')));
      if (f.type === 'mosaic' && !f.whole) body.append(h('div', { class: 'hint' }, 'Drag the region box on the program monitor to cover a face, then track it — or animate Region X/Y with the stopwatches.'), c.type === 'video' ? h('div', { class: 'btn-row' }, h('button', { class: 'btn sm', onclick: () => { ST.fxFocus = f.id; trackSelected(-1, { target: 'blur' }); } }, '◀ Track face'), h('button', { class: 'btn sm', onclick: () => { ST.fxFocus = f.id; trackSelected(1, { target: 'blur' }); } }, 'Track face ▶')) : '');
      stack.append(h('div', { class: 'fx-card' + (f.on ? '' : ' off') + (ST.fxFocus === f.id ? ' focus' : '') }, hd, body));
    });
    const add = h('select', {}, h('option', { value: '' }, '+ Add effect…'), ...Object.entries(VFX.EFFECTS).map(([k, d]) => h('option', { value: k }, `${d.cat} › ${d.name}`))); add.onchange = () => { if (add.value) addEffect(add.value, {}, [c]); };
    w.append(grp('Effects', c.fx.length ? stack : h('div', { class: 'muted', style: { fontSize: '11.5px', marginBottom: '6px' } }, 'No effects. Drag effects here from the Effects panel or add one below.'), add));
    // Lumetri
    const lu = p.lu; const luS = (label, k, min, max, step = 1) => plain(label, lu, k, min, max, step);
    const look = h('select', {}, h('option', { value: '' }, 'None'), ...Object.keys(VFX.LOOKS).map(n => h('option', { value: n, selected: lu.look === n }, n))); look.onchange = () => { lu.look = look.value; live(); commit('Look'); renderTimeline(); };
    w.append(grp('Lumetri Color', h('div', { class: 'sub-h' }, 'Basic correction'), luS('Temperature', 'temp', -100, 100), luS('Tint', 'tint', -100, 100), luS('Exposure', 'expo', -4, 4, 0.05), luS('Contrast', 'contr', -100, 100), luS('Highlights', 'hi', -100, 100), luS('Shadows', 'sh', -100, 100), luS('Whites', 'wh', -100, 100), luS('Blacks', 'bl', -100, 100), luS('Saturation', 'sat', 0, 200), luS('Vibrance', 'vib', -100, 100),
      h('div', { class: 'sub-h' }, 'Creative'), h('div', { class: 'p2' }, h('span', {}, 'Look'), look), luS('Intensity', 'lookAmt', 0, 100),
      h('div', { class: 'row', style: { marginTop: '6px' } }, h('button', { class: 'btn sm', onclick: () => { p.lu = { ...VFX.LU_DEFAULT }; commit('Reset Lumetri'); renderFx(); drawFrame(); renderTimeline(); } }, 'Reset colour'))));
    w.append(grp('Quick adjust', plain('Brightness', p, 'brightness', 0, 200), plain('Contrast', p, 'contrast', 0, 200), plain('Saturation', p, 'saturation', 0, 300), plain('Hue°', p, 'hue', -180, 180), plain('Blur px', p, 'blur', 0, 30, 0.1), plain('Grayscale', p, 'grayscale', 0, 100), plain('Sepia', p, 'sepia', 0, 100)));
    // transitions on this clip
    const trIn = PJ.transitions.find(t => t.b === c.id), trOut = PJ.transitions.find(t => t.a === c.id);
    const trSel = (label, tr, side) => { const s4 = h('select', {}, h('option', { value: '' }, 'None'), ...VFX.TRANSITIONS.map(([k, l]) => h('option', { value: k, selected: tr?.kind === k }, l))); s4.onchange = () => { if (!s4.value) { PJ.transitions = PJ.transitions.filter(t => t !== tr); commit('Remove transition'); renderTimeline(); renderFx(); drawFrame(); } else addTransition(c, side, s4.value); select([c.id]); }; return h('div', { class: 'p2' }, h('span', {}, label), s4); };
    const trDurEl = tr => tr ? plain(tr === trIn ? 'In duration' : 'Out duration', tr, 'dur', 0.04, Math.max(0.1, Math.min(10, D * (tr.a && tr.b ? 2 : 1))), 0.05) : '';
    w.append(grp('Transitions', trSel('At start', trIn, 'in'), trDurEl(trIn), trSel('At end', trOut, 'out'), trDurEl(trOut)));
  }
  if (hasAudioOf(c) || c.type === 'audio') {
    w.append(grp('Audio', slider('Volume %', 'volume', 0, 200), plain('Pan (L/R)', p, 'pan', -100, 100), c.type === 'audio' ? slider('Fade in (s)', 'fadeIn', 0, Math.max(0.1, Math.min(10, D)), 0.05, { anim: false }) : '', c.type === 'audio' ? slider('Fade out (s)', 'fadeOut', 0, Math.max(0.1, Math.min(10, D)), 0.05, { anim: false }) : '',
      chk('Normalize', p, 'normalize'), chk('Noise reduction', p, 'denoise'), chk('Voice enhance', p, 'voice'),
      h('div', { class: 'row', style: { marginTop: '6px', flexWrap: 'wrap' } }, h('button', { class: 'btn sm', onclick: () => bakeAudio(c), 'data-tip': 'Render normalize / noise reduction / voice enhance into a new audio file so you can hear them in the preview' }, 'Bake audio effects'), c.type === 'video' && !p.detached ? h('button', { class: 'btn sm', onclick: unlinkAudio }, 'Unlink audio') : '')));
  }
  if (c.type === 'video' || c.type === 'audio') w.append(grp('Speed & time', slider('Speed ×', 'speed', 0.1, 8, 0.05, { anim: false, onSet: () => { renderTimelineSoon(); } }), h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } }, h('button', { class: 'btn sm', onclick: speedDialog }, 'Speed / duration…'), h('button', { class: 'btn sm', onclick: speedRampDialog }, 'Speed ramp…'), h('button', { class: 'btn sm', onclick: reverseClip }, 'Reverse'), c.type === 'video' ? h('button', { class: 'btn sm' + (p.freeze != null ? ' primary' : ''), onclick: frameHold }, p.freeze != null ? 'Release hold' : 'Frame hold') : '')));
  w.append(h('div', { class: 'grp' }, h('button', { class: 'btn sm', onclick: resetEffects }, 'Reset all effects')));
  b.append(w); b.scrollTop = scroll;
}
function renderTransitionInspector(w, tr, grp) {
  const I = trInfo(tr); const lbl = (VFX.TRANSITIONS.find(t => t[0] === tr.kind) || [, tr.kind])[1];
  const k = h('select', {}, ...VFX.TRANSITIONS.map(([v, l]) => h('option', { value: v, selected: tr.kind === v }, l))); k.onchange = () => { tr.kind = k.value; commit('Transition'); renderTimeline(); drawFrame(); renderFx(); };
  const dn = h('input', { type: 'number', min: 0.04, max: 20, step: 0.05, value: tr.dur.toFixed(2) }); dn.onchange = () => { tr.dur = Math.max(1 / PJ.seq.fps, +dn.value || 1); commit('Transition duration'); renderTimeline(); drawFrame(); renderFx(); };
  const hd = trHandles(tr); const fh = v => v === Infinity ? 'unlimited (generated)' : v.toFixed(2) + ' s';
  const hInfo = hd ? h('div', {}, h('div', { class: 'okmsg' }, `Media handles — outgoing clip: ${fh(hd.a)} after its Out point · incoming clip: ${fh(hd.b)} before its In point. This transition needs ${hd.need.toFixed(2)} s on each side.`),
    hd.short ? h('div', { class: 'warn' }, `⚠ Insufficient media: ${hd.a < hd.need ? `the outgoing clip is ${(hd.need - hd.a).toFixed(2)} s short` : ''}${hd.a < hd.need && hd.b < hd.need ? ' and ' : ''}${hd.b < hd.need ? `the incoming clip is ${(hd.need - hd.b).toFixed(2)} s short` : ''} — the edge frames will be held (frozen). Shorten the transition to ${(2 * Math.min(hd.a, hd.b)).toFixed(2)} s or trim the clips.`) : '',
    hd.short ? h('button', { class: 'btn sm', onclick: () => { tr.dur = Math.max(1 / PJ.seq.fps, 2 * Math.min(hd.a, hd.b)); commit('Fit transition to handles'); renderTimeline(); renderFx(); drawFrame(); } }, 'Fit to available media') : '') : h('div', { class: 'okmsg' }, 'One-sided transition — no extra media needed.');
  w.append(h('div', { class: 'grp' }, h('div', { class: 'ttl' }, lbl), h('div', { class: 'muted sub' }, `${tr.track} · ${I ? tc(I.t0) + ' → ' + tc(I.t1) : ''} · ${tr.a && tr.b ? 'between two clips' : tr.b ? 'at clip start' : 'at clip end'}`), hInfo),
    grp('Transition', h('div', { class: 'p2' }, h('span', {}, 'Type'), k), h('div', { class: 'p2' }, h('span', {}, 'Duration (s)'), dn), h('div', { class: 'row', style: { marginTop: '8px', gap: '6px' } }, h('button', { class: 'btn sm', onclick: () => I && seek(I.t0) }, 'Go to start'), h('button', { class: 'btn sm', onclick: () => { if (!I) return; ST.inP = I.t0; ST.outP = I.t1; seek(I.t0); play(); ST.loopIO = false; } }, 'Preview'), h('button', { class: 'btn sm', onclick: () => deleteTransition(tr.id) }, 'Delete'))));
}

// =====================================================================  program monitor overlay (move clips, face-blur region, key picking)
const ovl = $('#ovl'); let picking = null;
function clipScreenMap(c) {
  const P = evalProps(c, ST.t - c.start); const k = ST.monK || 1; const s = P.scale / 100, a = P.rotation * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
  const toS = (x, y) => [(PJ.seq.w / 2 + P.x + (x * cs - y * sn) * s) * k, (PJ.seq.h / 2 + P.y + (x * sn + y * cs) * s) * k];
  const toL = (sx, sy) => { const X = sx / k - PJ.seq.w / 2 - P.x, Y = sy / k - PJ.seq.h / 2 - P.y; return [(X * cs + Y * sn) / s, (-X * sn + Y * cs) / s]; };
  return { P, toS, toL, k, s };
}
function overlayState() {
  if (ST.playing || EXP.on) return null; const s = selected(); if (s.length !== 1) return null; const c = s[0]; if (!isVisual(c) || c.type === 'adjust') return null;
  if (!(c.start <= ST.t + 1e-6 && cEnd(c) > ST.t)) return null; return c;
}
function drawOverlay() {
  if (!ovl) return; const r = prog.getBoundingClientRect(); const dpr = devicePixelRatio || 1;
  ovl.style.width = r.width + 'px'; ovl.style.height = r.height + 'px'; if (ovl.width !== Math.round(r.width * dpr)) ovl.width = Math.round(r.width * dpr); if (ovl.height !== Math.round(r.height * dpr)) ovl.height = Math.round(r.height * dpr);
  const x = ovl.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, r.width, r.height);
  const c = overlayState(); ovl.style.cursor = picking || ST.penDraw ? 'crosshair' : c ? 'move' : 'default'; if (!c) return;
  const M = clipScreenMap(c); const W = PJ.seq.w, H = PJ.seq.h; const R = ['video', 'image'].includes(c.type) ? mediaRect(c, M.P) : c.type === 'shape' ? { x: -M.P.w / 2, y: -M.P.h / 2, w: M.P.w, h: M.P.h } : { x: -W / 2, y: -H / 2, w: W, h: H };
  const poly = pts => { x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(...p) : x.moveTo(...p)); x.closePath(); };
  x.setLineDash([5, 4]); x.lineWidth = 1.5; x.strokeStyle = 'rgba(255,255,255,.85)'; poly([M.toS(R.x, R.y), M.toS(R.x + R.w, R.y), M.toS(R.x + R.w, R.y + R.h), M.toS(R.x, R.y + R.h)]); x.stroke();
  x.setLineDash([]); x.strokeStyle = cssVar('--accent', '#9a7bff'); const [cx, cy] = M.toS(0, 0); x.beginPath(); x.arc(cx, cy, 5, 0, Math.PI * 2); x.stroke();
  const mos = mosaicFx(c); if (mos) { const f = evalFx(c, ST.t - c.start).find(g => g.id === mos.id); const rx = f.rx / 100 * W - W / 2, ry = f.ry / 100 * H - H / 2, rw = f.rw / 100 * W, rh = f.rh / 100 * H;
    x.lineWidth = 2; x.strokeStyle = '#ffd400'; poly([M.toS(rx, ry), M.toS(rx + rw, ry), M.toS(rx + rw, ry + rh), M.toS(rx, ry + rh)]); x.stroke(); const [hx, hy] = M.toS(rx + rw, ry + rh); x.fillStyle = '#ffd400'; x.fillRect(hx - 5, hy - 5, 10, 10); x.font = '11px sans-serif'; x.fillText(I18N.T('blur region'), ...M.toS(rx, ry - 8 / M.k)); }
  if ((c.masks && c.masks.length) || ST.penDraw) drawMaskOverlay(x, c, M);
}
function mosaicFx(c) { const ms = c.fx.filter(f => f.type === 'mosaic' && f.on && !f.whole); return ms.find(f => f.id === ST.fxFocus) || ms[0] || null; }
ovl && ovl.addEventListener('pointerdown', e => {
  const r = ovl.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top;
  if (picking) { const k = prog.width / r.width; const px = pctx.getImageData(Math.floor(sx * k), Math.floor(sy * k), 1, 1).data; const hex = '#' + [px[0], px[1], px[2]].map(v => v.toString(16).padStart(2, '0')).join(''); picking.f.color = hex; picking = null; commit('Pick key colour'); renderFx(); drawFrame(); toast('Key colour ' + hex, 'ok'); return; }
  if (maskPointerDown(e, r)) return;
  const c = overlayState(); if (!c) return; const M = clipScreenMap(c); const lt = clamp(ST.t - c.start, 0, tlDur(c)); const W = PJ.seq.w, H = PJ.seq.h;
  const mos = mosaicFx(c); let mode = 'move', f0 = null;
  if (mos) { const f = evalFx(c, lt).find(g => g.id === mos.id); const [lx, ly] = M.toL(sx, sy); const rx = f.rx / 100 * W - W / 2, ry = f.ry / 100 * H - H / 2, rw = f.rw / 100 * W, rh = f.rh / 100 * H;
    if (Math.abs(lx - (rx + rw)) < 14 / M.k / M.s && Math.abs(ly - (ry + rh)) < 14 / M.k / M.s) mode = 'resize'; else if (lx >= rx && lx <= rx + rw && ly >= ry && ly <= ry + rh) mode = 'region'; f0 = { ...f, lx, ly }; }
  const x0 = animGet(c, 'x', lt), y0 = animGet(c, 'y', lt); let moved = false;
  const mv = ev => { moved = true; const ex = ev.clientX - r.left, ey = ev.clientY - r.top;
    if (mode === 'move') { animSet(c, 'x', Math.round(x0 + (ex - sx) / M.k), lt); animSet(c, 'y', Math.round(y0 + (ey - sy) / M.k), lt); }
    else { const [lx, ly] = M.toL(ex, ey); const dx = (lx - f0.lx) / W * 100, dy = (ly - f0.ly) / H * 100; const key = n => `fx:${mos.id}:${n}`;
      if (mode === 'region') { animSet(c, key('rx'), clamp(f0.rx + dx, -50, 100), lt); animSet(c, key('ry'), clamp(f0.ry + dy, -50, 100), lt); } else { animSet(c, key('rw'), clamp(f0.rw + dx, 1, 100), lt); animSet(c, key('rh'), clamp(f0.rh + dy, 1, 100), lt); } }
    drawFrame(); };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', () => { window.removeEventListener('pointermove', mv); if (moved) { commit(mode === 'move' ? 'Move clip' : 'Move blur region'); renderFx(); renderTimeline(); } }, { once: true });
});
function pickKeyColor(c, f) { pause(); picking = { c, f }; ST.fxPickOff = true; toast('Click the colour to key out on the program monitor'); f.on = false; drawFrame(); setTimeout(() => { const restore = () => { f.on = true; drawFrame(); }; const iv = setInterval(() => { if (!picking) { clearInterval(iv); restore(); } }, 100); }, 0); drawOverlay(); }
