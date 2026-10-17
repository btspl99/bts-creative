// BTS Video — timeline: tracks, clips, tools (select, ripple, rolling, slip, rate stretch, razor),
// keyframe diamonds, fade handles, transitions on cuts, captions track, markers, in/out and all editing operations.
'use strict';
const ROWH = { video: 58, audio: 46, cap: 30 };
const TOOLS = [['select', 'select', 'Selection tool', 'V'], ['ripple', 'chevR', 'Ripple edit tool', 'B'], ['rolling', 'swap', 'Rolling edit tool', 'N'], ['slip', 'move', 'Slip tool', 'Y'], ['rate', 'compress', 'Rate stretch tool', 'R'], ['razor', 'scissors', 'Razor tool', 'C']];
function setTool(id) { ST.tool = id; const sc = $('#tlScroll'); sc.dataset.tool = id; renderHead(); setStatus((TOOLS.find(t => t[0] === id) || [])[2] || ''); }

// =====================================================================  header
function renderHead() {
  const hd = $('#tlHead'); hd.innerHTML = '';
  const tool = ([id, ic, tip, k]) => h('button', { class: 'icon-btn' + (ST.tool === id ? ' active' : ''), 'data-tip': `${tip} (${k})`, html: icon(ic), onclick: () => setTool(id) });
  const z = h('input', { type: 'range', min: 5, max: 400, value: ST.pps, style: { width: '110px' } }); z.oninput = () => setPps(+z.value);
  const mode = h('div', { class: 'seg', 'data-tip': 'Edit mode for drops & paste: Overwrite (.) or Insert (,)' }, ...[['overwrite', 'Overwrite'], ['insert', 'Insert']].map(([k, l]) => h('button', { class: ST.editMode === k ? 'on' : '', onclick: () => { ST.editMode = k; renderHead(); } }, l)));
  hd.append(h('span', { class: 'tc', id: 'tcTl' }, tc(ST.t)), ...TOOLS.map(tool), h('div', { class: 'vsep' }),
    h('button', { class: 'icon-btn' + (ST.snap ? ' active' : ''), 'data-tip': 'Snapping (S)', html: icon('magnet'), onclick: toggleSnap }),
    h('button', { class: 'icon-btn' + (ST.linkedSel ? ' active' : ''), 'data-tip': 'Linked selection', html: icon('group'), onclick: () => { ST.linkedSel = !ST.linkedSel; renderHead(); } }),
    h('button', { class: 'icon-btn', 'data-tip': 'Add marker (M)', html: '<svg viewBox="0 0 24 24"><path d="M6 3h12v13l-6 5-6-5z"/></svg>', onclick: () => addMarker() }),
    mode, h('div', { class: 'vsep' }), h('button', { class: 'btn sm ghost', html: icon('plus') + 'Video', 'data-tip': 'Add video track', onclick: () => addTrack('video') }), h('button', { class: 'btn sm ghost', html: icon('plus') + 'Audio', 'data-tip': 'Add audio track', onclick: () => addTrack('audio') }),
    h('div', { style: { flex: 1 } }), h('span', { class: 'muted io-info' }, ioLabel()), h('button', { class: 'btn sm ghost', onclick: () => zoomTl(1 / 1.4) }, '−'), z, h('button', { class: 'btn sm ghost', onclick: () => zoomTl(1.4) }, '+'), h('button', { class: 'btn sm ghost', onclick: fitTl }, 'Fit'));
}
const ioLabel = () => (ST.inP != null || ST.outP != null) ? `In ${ST.inP != null ? tc(ST.inP) : '—'} · Out ${ST.outP != null ? tc(ST.outP) : '—'}` : '';
function toggleSnap() { ST.snap = !ST.snap; renderHead(); toast('Snapping ' + (ST.snap ? 'on' : 'off')); }
function setPps(v) { const sc = $('#tlScroll'); const center = (sc.scrollLeft + sc.clientWidth / 2) / ST.pps; ST.pps = clamp(v, 2, 600); renderTimeline(); sc.scrollLeft = center * ST.pps - sc.clientWidth / 2; }
function zoomTl(f) { setPps(ST.pps * f); renderHead(); }
function fitTl() { const w = $('#tlScroll').clientWidth - 40; ST.pps = clamp(w / Math.max(10, seqDuration()), 2, 600); renderTimeline(); renderHead(); }

// =====================================================================  timeline rendering
function renderTimeline() {
  const rows = $('#tlRows'), hdr = $('#tlTracksH'); rows.innerHTML = ''; hdr.innerHTML = '';
  const total = Math.max(seqDuration() + 30, ($('#tlScroll').clientWidth || 1000) / ST.pps); const W = Math.ceil(total * ST.pps);
  $('#tlInner').style.width = W + 'px';
  hdr.append(h('div', { class: 'th-pad' }));
  const grid = ST.pps >= 40 ? ST.pps : ST.pps >= 10 ? ST.pps * 5 : ST.pps * 30; rows.style.setProperty('--grid', grid + 'px');
  // captions track
  hdr.append(h('div', { class: 'track-h cap', style: { height: ROWH.cap + 'px' } }, h('span', { class: 'tn' }, 'CC'), h('span', { class: 'muted', style: { fontSize: '10.5px', flex: 1 } }, 'Captions'),
    h('button', { class: 'tb' + (ST.capShow === false ? ' on' : ''), 'data-tip': 'Hide captions in preview', html: icon('eyeOff'), onclick: () => { ST.capShow = ST.capShow === false; renderTimeline(); drawFrame(); } }),
    h('button', { class: 'tb' + (PJ.capBurn ? ' on' : ''), 'data-tip': 'Burn captions into export', html: 'B', onclick: () => { PJ.capBurn = !PJ.capBurn; commit('Caption burn-in'); renderTimeline(); } })));
  const crow = h('div', { class: 'row-t cap', style: { height: ROWH.cap + 'px' }, 'data-track': 'CC' });
  crow.ondblclick = e => { if (e.target === crow) { const r = crow.getBoundingClientRect(); addCaption((e.clientX - r.left) / ST.pps); } };
  PJ.captions.forEach(cp => crow.append(capEl(cp))); rows.append(crow);
  PJ.tracks.forEach(t => {
    const H = ROWH[t.kind];
    const tbtn = (on, label, fn, tip) => h('button', { class: 'tb' + (on ? ' on' : ''), 'data-tip': tip, html: label, onclick: fn });
    const th = h('div', { class: 'track-h', style: { height: H + 'px' } }, h('span', { class: 'tn' }, t.id),
      t.kind === 'video' ? tbtn(t.hidden, icon('eyeOff'), () => { t.hidden = !t.hidden; renderTimeline(); drawFrame(); }, 'Hide track') : tbtn(t.muted, 'M', () => { t.muted = !t.muted; renderTimeline(); }, 'Mute track'),
      t.kind === 'video' ? tbtn(t.muted, 'M', () => { t.muted = !t.muted; renderTimeline(); }, 'Mute this track’s clip audio') : tbtn(t.voice, 'V', () => { t.voice = !t.voice; renderTimeline(); }, 'Voice track (for auto-ducking)'),
      tbtn(t.locked, icon('lock'), () => { t.locked = !t.locked; renderTimeline(); }, 'Lock track'));
    th.oncontextmenu = e => contextMenu(e, [{ label: 'Add video track', action: () => addTrack('video') }, { label: 'Add audio track', action: () => addTrack('audio') }, '-', { label: 'Delete track ' + t.id, action: () => deleteTrack(t), disabled: PJ.tracks.filter(x => x.kind === t.kind).length <= 1 }]);
    hdr.append(th);
    const row = h('div', { class: 'row-t ' + t.kind, style: { height: H + 'px' }, 'data-track': t.id });
    row.ondragover = e => rowDragOver(e, row, t); row.ondragleave = () => row.classList.remove('drop'); row.ondrop = e => rowDrop(e, row, t);
    PJ.clips.filter(c => c.track === t.id).forEach(c => row.append(clipEl(c, t)));
    PJ.transitions.filter(tr => tr.track === t.id).forEach(tr => { const el = trEl(tr); if (el) row.append(el); });
    rows.append(row);
  });
  // markers & in/out across the rows
  PJ.markers.forEach(mk => rows.append(h('div', { class: 'mk-line', style: { left: mk.t * ST.pps + 'px', background: mk.color } })));
  if (ST.inP != null || ST.outP != null) { const a = ST.inP ?? 0, b = ST.outP ?? seqDuration(); rows.append(h('div', { class: 'io-range', style: { left: a * ST.pps + 'px', width: Math.max(0, b - a) * ST.pps + 'px' } })); }
  drawRuler(); placePlayhead();
  $('#tcDur').textContent = tc(seqDuration());
  const s = selected(); $('#stSel').textContent = s.length ? `${s.length} clip${s.length > 1 ? 's' : ''} selected` : `${PJ.clips.length} clips · ${tc(seqDuration())}`;
  const io = document.querySelector('.io-info'); if (io) io.textContent = ioLabel();
}
let rtT = null; function renderTimelineSoon() { clearTimeout(rtT); rtT = setTimeout(renderTimeline, 120); }
function kfTimes(c) { const s = new Set(); for (const k in (c.kf || {})) c.kf[k].forEach(kk => s.add(Math.round(kk.t * 1000) / 1000)); return [...s].sort((a, b) => a - b); }
function clipEl(c, t) {
  const m = c.mediaId ? mediaById(c.mediaId) : null; const W = Math.max(4, tlDur(c) * ST.pps); const P = c.props;
  const el = h('div', { class: `clip ${c.type}${ST.sel.has(c.id) ? ' sel' : ''}${m?.missing ? ' missing' : ''}${c.link ? ' linked' : ''}`, style: { left: c.start * ST.pps + 'px', width: W + 'px' }, 'data-id': c.id });
  const tags = [P.speed && P.speed !== 1 ? `${Math.round(P.speed * 100)}%` : '', P.freeze != null ? 'HOLD' : '', c.fx?.some(f => f.on) ? 'fx' : '', VFX.luActive(P.lu) ? 'LU' : '', c.masks?.length ? 'MASK' : '', m?.gen === 'reverse' ? 'REV' : '', m?.anim ? 'GIF' : ''].filter(Boolean).join(' · ');
  const name = c.type === 'title' ? 'T  ' + (P.text || '').split('\n')[0] : c.type === 'shape' ? '◆ ' + (P.shape === 'emoji' ? P.text : P.shape) : c.type === 'adjust' ? 'Adjustment layer' : c.type === 'nest' ? '⧉ ' + (seqById(c.seqId)?.name || 'Missing sequence') : c.name;
  if (c.masks?.length) el.classList.add('masked');
  el.append(h('div', { class: 'cl' }, (tags ? tags + ' · ' : '') + name));
  if (c.type === 'video' && m?.strip) { const stripPx = ROWH.video - 24; el.append(h('div', { class: 'strip', style: { backgroundImage: `url(${m.strip})`, backgroundSize: `${stripPx * (m.w && m.h ? m.w / m.h : 16 / 9) * (m.stripN || 1)}px 100%` } })); }
  if (c.type === 'image' && m?.thumb) el.append(h('div', { class: 'strip', style: { backgroundImage: `url(${m.thumb})`, backgroundSize: 'auto 100%' } }));
  if (c.type === 'color') el.style.background = P.grad !== 'none' ? `linear-gradient(${P.angle}deg, ${P.color}, ${P.color2})` : P.color;
  if (c.type === 'audio' && m?.peaks) { const cv = h('canvas', { class: 'wave', width: Math.min(4000, Math.ceil(W)), height: 40 }); drawWave(cv, m, c); el.append(cv); }
  if (c.type === 'video' && m?.peaks && m.hasAudio && !P.detached) { const cv = h('canvas', { class: 'wave', width: Math.min(4000, Math.ceil(W)), height: 30, style: { height: '35%', opacity: .5 } }); drawWave(cv, m, c); el.append(cv); }
  if (P.fadeIn) el.append(h('div', { class: 'fade-in', style: { width: P.fadeIn * ST.pps + 'px' } }));
  if (P.fadeOut) el.append(h('div', { class: 'fade-out', style: { width: P.fadeOut * ST.pps + 'px' } }));
  el.append(h('div', { class: 'fh l', 'data-tip': 'Drag to fade in', style: { left: (P.fadeIn || 0) * ST.pps + 'px' } }), h('div', { class: 'fh r', 'data-tip': 'Drag to fade out', style: { right: (P.fadeOut || 0) * ST.pps + 'px' } }));
  let lastKx = -1e9; kfTimes(c).forEach(kt => { const px = kt * ST.pps; if (px - lastKx < 6) return; lastKx = px; const d = h('div', { class: 'kfd', 'data-t': kt, style: { left: px + 'px' }, title: 'Keyframe ' + kt.toFixed(2) + 's' }); el.append(d); }); // dense (tracked) keyframes are thinned for display
  el.append(h('div', { class: 'edge l' }), h('div', { class: 'edge r' }));
  el.addEventListener('pointerdown', e => clipPointerDown(e, c, el));
  el.addEventListener('dblclick', e => { if (e.target.classList.contains('kfd')) return; if (c.type === 'nest') return openNest(c); select([c.id]); if (c.type === 'title') setTimeout(() => document.querySelector('#fx textarea')?.focus(), 30); });
  el.addEventListener('contextmenu', e => { if (e.target.classList.contains('kfd')) return kfMenu(e, c, +e.target.dataset.t); if (!ST.sel.has(c.id)) selectClick(c, {}); contextMenu(e, clipMenu(c)); });
  el.ondragover = e => { const ty = e.dataTransfer.types; if (['text/bts-tr', 'text/bts-look', 'text/bts-fx', 'text/bts-kfp', 'text/bts-layout'].some(k => ty.includes(k))) { e.preventDefault(); e.stopPropagation(); el.classList.add('drop'); } };
  el.ondragleave = () => el.classList.remove('drop');
  el.ondrop = e => clipDrop(e, c, el);
  return el;
}
function clipMenu(c) {
  const vis = isVisual(c);
  return [{ label: 'Split at playhead', kbd: 'Ctrl+Shift+K', action: splitAtPlayhead }, { label: 'Duplicate', action: duplicateClips }, { label: 'Copy', action: copyClips }, '-',
    c.type === 'nest' ? { label: 'Open nested sequence', action: () => openNest(c) } : { label: 'Nest…', action: nestSelected }, { label: 'Add mask', disabled: !vis, sub: [['ellipse', 'Ellipse'], ['rect', 'Rectangle'], ['pen', 'Pen (bezier)']].map(([k, l]) => ({ label: l, action: () => addMask(k, [c]) })) },
    { label: 'Track mask / blur forward', disabled: c.type !== 'video', action: () => trackSelected(1) }, { label: 'Scene edit detection', disabled: c.type !== 'video', action: sceneDetectDialog }, '-',
    { label: 'Transition at start', disabled: !vis, sub: VFX.TRANSITIONS.map(([k, l]) => ({ label: l, action: () => addTransition(c, 'in', k) })) },
    { label: 'Transition at end', disabled: !vis, sub: VFX.TRANSITIONS.map(([k, l]) => ({ label: l, action: () => addTransition(c, 'out', k) })) },
    { label: 'Keyframe preset', disabled: !vis, sub: KF_PRESETS.map(([n]) => ({ label: n, action: () => applyKfPreset(n, [c]) })) },
    { label: 'Fade in / out', action: quickFades }, '-',
    { label: 'Speed / duration…', kbd: 'Ctrl+R', action: speedDialog }, { label: 'Reverse clip', action: reverseClip, disabled: !['video', 'audio'].includes(c.type) }, { label: 'Add frame hold segment', action: freezeFrame, disabled: c.type !== 'video' }, { label: 'Frame hold (whole clip)', action: frameHold, disabled: c.type !== 'video' }, '-',
    { label: c.link ? 'Unlink' : 'Link', kbd: 'Ctrl+L', action: toggleLink }, { label: 'Unlink audio to A track', action: unlinkAudio, disabled: !(c.type === 'video' && mediaById(c.mediaId)?.hasAudio && !c.props.detached) }, '-',
    { label: 'Delete', action: () => deleteClips(false) }, { label: 'Ripple delete', action: () => deleteClips(true) }];
}
function drawWave(cv, m, c) {
  const x = cv.getContext('2d'), W = cv.width, H = cv.height, n = m.peaks.length, per = m.dur / n; x.fillStyle = 'rgba(255,255,255,.78)';
  const D = tlDur(c);
  for (let i = 0; i < W; i++) { const lt = (i / W) * D; const st = srcTime(c, c.start + lt); const k = Math.floor(st / per); const v = m.peaks[clamp(k, 0, n - 1)] * clamp(audioGainAt(c, c.start + lt), 0, 2); const hh = Math.max(1, Math.min(H, v * H)); x.fillRect(i, (H - hh) / 2, 1, hh); }
}
function trEl(tr) {
  const I = trInfo(tr); if (!I) return null; const lbl = (VFX.TRANSITIONS.find(t => t[0] === tr.kind) || [, tr.kind])[1];
  const hd = trHandles(tr); const fmtH = v => v === Infinity ? '∞' : v.toFixed(2) + 's';
  const el = h('div', { class: 'trx' + (ST.selTr === tr.id ? ' sel' : '') + (hd?.short ? ' short' : ''), style: { left: I.t0 * ST.pps + 'px', width: Math.max(8, (I.t1 - I.t0) * ST.pps) + 'px' }, title: `${lbl} · ${tr.dur.toFixed(2)}s` + (hd ? ` · handles: A ${fmtH(hd.a)} after Out, B ${fmtH(hd.b)} before In (needs ${hd.need.toFixed(2)}s each)${hd.short ? ' — INSUFFICIENT MEDIA: frames will be held' : ''}` : '') }, h('span', {}, (hd?.short ? '⚠ ' : '') + lbl), h('div', { class: 'tre' }));
  if (hd) { const lw = Math.max(8, (I.t1 - I.t0) * ST.pps); const mk = (side, have) => { if (have >= hd.need) return; const wv = Math.max(0, hd.need - have) * ST.pps; el.append(h('div', { class: 'tr-short ' + side, style: { width: Math.min(lw / 2, wv) + 'px' } })); }; mk('l', hd.b); mk('r', hd.a); }
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return; e.stopPropagation(); selectTransition(tr.id);
    if (!e.target.classList.contains('tre')) return;
    const x0 = e.clientX, d0 = tr.dur; const mv = ev => { const two = tr.a && tr.b; tr.dur = Math.max(1 / PJ.seq.fps, d0 + (ev.clientX - x0) / ST.pps * (two ? 2 : 1)); fixTransitions(); renderTimelineFast(); drawFrameSoon(); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', () => { window.removeEventListener('pointermove', mv); commit('Transition duration'); renderTimeline(); renderFx(); }, { once: true });
  });
  el.addEventListener('dblclick', e => { e.stopPropagation(); transitionDurationDialog(tr); });
  el.addEventListener('contextmenu', e => { e.stopPropagation(); selectTransition(tr.id); contextMenu(e, [{ label: 'Change to', sub: VFX.TRANSITIONS.map(([k, l]) => ({ label: l, checked: tr.kind === k, action: () => { tr.kind = k; commit('Transition'); renderTimeline(); renderFx(); drawFrame(); } })) }, { label: 'Duration…', action: () => transitionDurationDialog(tr) }, '-', { label: 'Delete transition', action: () => deleteTransition(tr.id) }]); });
  return el;
}
function capEl(cp) {
  const el = h('div', { class: 'ccx' + (ST.selCap === cp.id ? ' sel' : ''), style: { left: cp.start * ST.pps + 'px', width: Math.max(4, (cp.end - cp.start) * ST.pps) + 'px' }, title: cp.text }, h('span', {}, cp.text.replace(/\n/g, ' ')), h('div', { class: 'edge l' }), h('div', { class: 'edge r' }));
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return; e.stopPropagation(); selectCaption(cp.id);
    const edge = e.target.classList.contains('edge') ? (e.target.classList.contains('l') ? 'l' : 'r') : null; const x0 = e.clientX, s0 = cp.start, e0 = cp.end; let moved = false;
    const mv = ev => { moved = true; let d = (ev.clientX - x0) / ST.pps;
      if (edge === 'l') cp.start = clamp(snapTime(s0 + d).t, 0, cp.end - 0.1); else if (edge === 'r') cp.end = Math.max(cp.start + 0.1, snapTime(e0 + d).t);
      else { let ns = snapTime(s0 + d).t; ns = Math.max(0, ns); cp.start = ns; cp.end = ns + (e0 - s0); }
      el.style.left = cp.start * ST.pps + 'px'; el.style.width = (cp.end - cp.start) * ST.pps + 'px'; drawFrameSoon(); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', () => { window.removeEventListener('pointermove', mv); if (moved) { PJ.captions.sort((a, b) => a.start - b.start); commit('Edit caption timing'); renderLeft(); } }, { once: true });
  });
  el.addEventListener('dblclick', e => { e.stopPropagation(); seek(cp.start); showLeft('captions'); setTimeout(() => document.querySelector(`.cap-row[data-id="${cp.id}"] textarea`)?.focus(), 50); });
  el.addEventListener('contextmenu', e => contextMenu(e, [{ label: 'Edit text…', action: async () => { const v = await prompt('Caption', 'Text', cp.text); if (v != null) { cp.text = v; commit('Edit caption'); renderTimeline(); renderLeft(); drawFrame(); } } }, { label: 'Split caption at playhead', action: () => splitCaption(cp) }, '-', { label: 'Delete caption', action: () => { PJ.captions = PJ.captions.filter(x => x !== cp); commit('Delete caption'); renderTimeline(); renderLeft(); drawFrame(); } }]));
  return el;
}
function drawRuler() {
  const cv = $('#ruler'); const dpr = devicePixelRatio || 1; const sc = $('#tlScroll'); const Wv = sc.clientWidth || 800;
  cv.width = Wv * dpr; cv.height = 30 * dpr; cv.style.width = Wv + 'px'; cv.style.marginLeft = sc.scrollLeft + 'px'; cv.style.position = 'sticky'; cv.style.left = '0';
  const x = cv.getContext('2d'); x.scale(dpr, dpr); x.fillStyle = cssVar('--bg-2', '#1c1d22'); x.fillRect(0, 0, Wv, 30);
  const steps = [1 / PJ.seq.fps, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]; const major = steps.find(s => s * ST.pps >= 80) || 600; const minor = major / (major >= 1 ? 5 : 2);
  const t0 = sc.scrollLeft / ST.pps, t1 = (sc.scrollLeft + Wv) / ST.pps;
  if (ST.inP != null || ST.outP != null) { const a = (ST.inP ?? 0) * ST.pps - sc.scrollLeft, b = (ST.outP ?? seqDuration()) * ST.pps - sc.scrollLeft; x.fillStyle = cssVar('--accent-soft', 'rgba(154,123,255,.2)'); x.fillRect(a, 0, Math.max(0, b - a), 30); x.fillStyle = cssVar('--accent', '#9a7bff'); if (ST.inP != null) x.fillRect(a, 0, 2, 30); if (ST.outP != null) x.fillRect(b - 2, 0, 2, 30); }
  x.strokeStyle = cssVar('--line-2', '#3b3d45'); x.fillStyle = cssVar('--tx-2', '#8b8e99'); x.font = '10.5px Segoe UI, sans-serif'; x.beginPath();
  for (let t = Math.floor(t0 / minor) * minor; t <= t1; t += minor) { const px = t * ST.pps - sc.scrollLeft; const isMaj = Math.abs(t / major - Math.round(t / major)) < 1e-6; x.moveTo(px + 0.5, isMaj ? 14 : 22); x.lineTo(px + 0.5, 30); if (isMaj) x.fillText(major < 1 ? tc(t).slice(3) : tc(t).slice(0, 8), px + 4, 12); }
  x.stroke();
  PJ.markers.forEach(mk => { const px = mk.t * ST.pps - sc.scrollLeft; if (px < -10 || px > Wv + 10) return; x.fillStyle = mk.color; x.beginPath(); x.moveTo(px - 5, 16); x.lineTo(px + 5, 16); x.lineTo(px + 5, 24); x.lineTo(px, 29); x.lineTo(px - 5, 24); x.closePath(); x.fill(); if (mk.label && ST.pps * 2 > 40) { x.fillStyle = cssVar('--tx-1', '#ccc'); x.fillText(mk.label, px + 7, 26); } });
}
function placePlayhead() { const ph = $('#playhead'); ph.style.left = ST.t * ST.pps + 'px'; const tt = $('#tcTl'); if (tt) tt.textContent = tc(ST.t); $('#tcCur').textContent = tc(ST.t); }
function renderTimelineFast() {
  PJ.clips.forEach(c => { const el = document.querySelector(`.clip[data-id="${c.id}"]`); if (!el) return; if (el.parentElement.dataset.track !== c.track) { const row = document.querySelector(`.row-t[data-track="${c.track}"]`); row && row.append(el); } el.style.left = c.start * ST.pps + 'px'; el.style.width = Math.max(4, tlDur(c) * ST.pps) + 'px'; });
  document.querySelectorAll('.trx').forEach(e => e.remove()); PJ.transitions.forEach(tr => { const el = trEl(tr); const row = document.querySelector(`.row-t[data-track="${tr.track}"]`); if (el && row) row.append(el); });
}

// =====================================================================  snapping & selection
function snapTime(t, exclude, excludeIds) {
  if (!ST.snap) return { t, snapped: false };
  const cands = [0, ST.t]; PJ.clips.forEach(c => { if (exclude && c.id === exclude) return; if (excludeIds && excludeIds.has(c.id)) return; cands.push(c.start, cEnd(c)); });
  PJ.markers.forEach(m => cands.push(m.t)); if (ST.inP != null) cands.push(ST.inP); if (ST.outP != null) cands.push(ST.outP); PJ.captions.forEach(c => cands.push(c.start, c.end));
  const tol = 8 / ST.pps; let best = null; cands.forEach(v => { if (Math.abs(v - t) < tol && (best == null || Math.abs(v - t) < Math.abs(best - t))) best = v; });
  return best != null ? { t: best, snapped: true } : { t, snapped: false };
}
function showSnap(t) { const s = $('#snapline'); if (t == null) s.classList.add('hidden'); else { s.classList.remove('hidden'); s.style.left = t * ST.pps + 'px'; } }
function selected() { return PJ.clips.filter(c => ST.sel.has(c.id)); }
function select(ids) { ST.sel = new Set(ids); ST.selTr = null; ST.selCap = null; renderTimeline(); renderFx(); drawOverlay(); }
function linkedOf(c) { return c.link && ST.linkedSel ? PJ.clips.filter(o => o.link === c.link) : [c]; }
function selectClick(c, e) { const grp = e.altKey ? [c] : linkedOf(c); if (e.shiftKey || e.ctrlKey) { const on = !ST.sel.has(c.id); grp.forEach(g => on ? ST.sel.add(g.id) : ST.sel.delete(g.id)); ST.selTr = null; ST.selCap = null; renderTimeline(); renderFx(); } else select(grp.map(g => g.id)); }
function selectTransition(id) { ST.sel.clear(); ST.selCap = null; ST.selTr = id; renderTimeline(); renderFx(); }
function selectCaption(id) { ST.sel.clear(); ST.selTr = null; ST.selCap = id; renderTimeline(); renderFx(); }
function selectAll() { PJ.clips.forEach(c => ST.sel.add(c.id)); renderTimeline(); renderFx(); }

// =====================================================================  pointer interaction on clips
function shiftKf(c, d) { if (!d || !c.kf) return; for (const k in c.kf) c.kf[k].forEach(kk => kk.t += d); }
function trimLeft(c, newStart) { const d = newStart - c.start; c.in += d * spd(c); c.start = newStart; shiftKf(c, -d); }
function neighbour(c, side) { return PJ.clips.find(o => o !== c && o.track === c.track && (side === 'r' ? Math.abs(o.start - cEnd(c)) < 1e-3 : Math.abs(cEnd(o) - c.start) < 1e-3)); }
const srcMax = c => { if (c.type === 'nest') return Math.max(nestDur(c), c.out); const m = mediaById(c.mediaId); return m && m.kind !== 'image' && c.props.freeze == null ? m.dur : Infinity; };
// how much extra media a clip has before its In point / after its Out point (timeline seconds; generated clips are unlimited)
const handleBefore = c => ['video', 'audio', 'nest'].includes(c.type) && c.props.freeze == null ? c.in / spd(c) : Infinity;
const handleAfter = c => ['video', 'audio', 'nest'].includes(c.type) && c.props.freeze == null ? Math.max(0, srcMax(c) - c.out) / spd(c) : Infinity;
function trHandles(tr) {
  const I = trInfo(tr); if (!I || !I.A || !I.B) return null; const need = tr.dur / 2;
  const a = handleAfter(I.A), b = handleBefore(I.B); return { need, a, b, short: a + 1e-3 < need || b + 1e-3 < need };
}
function clipPointerDown(e, c, el) {
  if (e.button !== 0) return; e.stopPropagation(); const t = trackById(c.track); if (t.locked) return;
  const sc = $('#tlScroll'), r = sc.getBoundingClientRect(); const tAt = ev => (ev.clientX - r.left + sc.scrollLeft) / ST.pps;
  const fr = 1 / PJ.seq.fps; const tg = e.target;
  if (ST.tool === 'razor') { const at = snapTime(tAt(e), c.id).t; const grp = e.altKey ? [c] : linkedOf(c); let ok = false; grp.forEach(g => { if (splitClip(g, at)) ok = true; }); if (ok) { commit('Razor'); renderTimeline(); drawFrame(); } return; }
  // keyframe diamond: select / drag in time
  if (tg.classList.contains('kfd')) { const kt = +tg.dataset.t; seek(c.start + kt); select([c.id]); dragKeyframes(e, c, kt, tAt); return; }
  // fade handles
  if (tg.classList.contains('fh')) { const side = tg.classList.contains('l') ? 'fadeIn' : 'fadeOut'; if (!ST.sel.has(c.id)) select([c.id]); const x0 = e.clientX, v0 = c.props[side] || 0;
    const mv = ev => { const d = (ev.clientX - x0) / ST.pps * (side === 'fadeIn' ? 1 : -1); c.props[side] = Math.round(clamp(v0 + d, 0, tlDur(c) / 2) * 100) / 100; const fe = el.querySelector(side === 'fadeIn' ? '.fade-in' : '.fade-out'); tg.style[side === 'fadeIn' ? 'left' : 'right'] = c.props[side] * ST.pps + 'px'; if (fe) fe.style.width = c.props[side] * ST.pps + 'px'; drawFrameSoon(); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', () => { window.removeEventListener('pointermove', mv); commit('Fade'); renderTimeline(); renderFx(); }, { once: true }); return; }
  if (e.shiftKey || e.ctrlKey) { selectClick(c, e); return; }
  if (!ST.sel.has(c.id)) selectClick(c, e);
  const edge = tg.classList.contains('edge') ? (tg.classList.contains('l') ? 'l' : 'r') : null;
  const sp = spd(c); const t0 = tAt(e), y0 = e.clientY;
  const snap0 = PJ.clips.map(x => ({ c: x, start: x.start, in: x.in, out: x.out, track: x.track, speed: x.props.speed, kf: JSON.stringify(x.kf || {}) }));
  const o0 = snap0.find(o => o.c === c); const resetAll = () => snap0.forEach(o => { Object.assign(o.c, { start: o.start, in: o.in, out: o.out, track: o.track }); o.c.props.speed = o.speed; o.c.kf = JSON.parse(o.kf); });
  const later = (track, after, skip) => snap0.filter(o => o.track === track && o.c !== skip && o.start >= after - 1e-6);
  let moved = false; const tool = ST.tool; const nbr = tool === 'rolling' && edge ? neighbour(c, edge) : null;
  const linkedEdge = edge && tool === 'select' && !e.altKey ? linkedOf(c).filter(o => o !== c && (edge === 'l' ? Math.abs(o.start - c.start) < 1e-3 : Math.abs(cEnd(o) - cEnd(c)) < 1e-3)) : [];
  const move = ev => {
    const dt = tAt(ev) - t0; if (!moved && Math.abs(ev.clientX - e.clientX) < 3 && Math.abs(ev.clientY - y0) < 3) return; moved = true; resetAll();
    if (tool === 'slip' && !edge) {
      const mx = srcMax(c); let d = -dt * sp; d = clamp(d, -o0.in, mx - o0.out); c.in = o0.in + d; c.out = o0.out + d; setStatus(`Slip: in ${tc(c.in)} · out ${tc(c.out)}`);
    } else if (edge && tool === 'rolling') {
      if (!nbr) { setStatus('Rolling edit needs an adjacent clip on this side'); return; }
      const L = edge === 'r' ? c : nbr, R2 = edge === 'r' ? nbr : c; const lo = snap0.find(o => o.c === L), ro = snap0.find(o => o.c === R2);
      const cut0 = ro.start; let cut = snapTime(cut0 + dt, null, new Set([L.id, R2.id])).t;
      cut = clamp(cut, Math.max(lo.start + fr, ro.start - ro.in / spd(R2)), Math.min(ro.start + (ro.out - ro.in) / spd(R2) - fr, lo.start + (srcMax(L) - lo.in) / spd(L)));
      L.out = lo.in + (cut - lo.start) * spd(L); trimLeft(R2, cut); showSnap(cut);
    } else if (edge && tool === 'rate') {
      if (!['video', 'audio'].includes(c.type)) return; const len = o0.out - o0.in;
      if (edge === 'r') { const nd = Math.max(fr, snapTime(o0.start + len / o0.speed + dt, c.id).t - o0.start); c.props.speed = clamp(len / nd, 0.1, 10); }
      else { const e0 = o0.start + len / o0.speed; const ns = Math.min(e0 - fr, snapTime(o0.start + dt, c.id).t); c.props.speed = clamp(len / (e0 - ns), 0.1, 10); c.start = e0 - len / c.props.speed; }
      setStatus(`Speed ${Math.round(c.props.speed * 100)}%`);
    } else if (edge === 'l') {
      let ns = o0.start + dt; const sn = snapTime(ns, c.id); ns = sn.t; showSnap(sn.snapped ? ns : null);
      let d = ns - o0.start; d = Math.max(d, -o0.in / sp); d = Math.min(d, (o0.out - o0.in) / sp - fr);
      if (tool === 'ripple') { c.in = o0.in + d * sp; shiftKf(c, -d); later(c.track, o0.start + (o0.out - o0.in) / sp, c).forEach(o => o.c.start = o.start - d); }
      else { [c, ...linkedEdge].forEach(x => { const xo = snap0.find(o => o.c === x); const dd = Math.min(Math.max(d, -xo.in / spd(x)), (xo.out - xo.in) / spd(x) - fr); x.start = xo.start + dd; x.in = xo.in + dd * spd(x); shiftKf(x, -dd); }); }
    } else if (edge === 'r') {
      const oldEnd = o0.start + (o0.out - o0.in) / sp; let ne = oldEnd + dt; const sn = snapTime(ne, c.id); ne = sn.t; showSnap(sn.snapped ? ne : null);
      const d = ne - oldEnd;
      [c, ...linkedEdge].forEach(x => { const xo = snap0.find(o => o.c === x); x.out = clamp(xo.out + d * spd(x), xo.in + fr, srcMax(x)); });
      if (tool === 'ripple') { const real = cEnd(c) - oldEnd; later(c.track, oldEnd, c).forEach(o => o.c.start = o.start + real); }
    } else {
      const sel = selected(); const orig = snap0.filter(o => ST.sel.has(o.c.id));
      let d = dt; const sn1 = snapTime(o0.start + d, null, ST.sel), sn2 = snapTime(o0.start + tlDur(c) + d, null, ST.sel);
      if (sn1.snapped) { d = sn1.t - o0.start; showSnap(sn1.t); } else if (sn2.snapped) { d = sn2.t - o0.start - tlDur(c); showSnap(sn2.t); } else showSnap(null);
      d = Math.max(d, -Math.min(...orig.map(o => o.start)));
      orig.forEach(o => { o.c.start = o.start + d; });
      const rowsEls = [...document.querySelectorAll('.row-t[data-track]')]; const hover = rowsEls.find(rr => { const b = rr.getBoundingClientRect(); return ev.clientY >= b.top && ev.clientY < b.bottom; });
      if (hover && hover.dataset.track !== 'CC' && Math.abs(ev.clientY - y0) > 12) {
        const nt = trackById(hover.dataset.track); const kinds = PJ.tracks.filter(k => k.kind === nt.kind); const curT = trackById(o0.track);
        if (sel.length === 1) { if ((c.type === 'audio') === (nt.kind === 'audio') && !nt.locked) c.track = nt.id; }
        else if (curT.kind === nt.kind) { // move the whole selection by the same number of tracks of each kind
          const shift = kinds.indexOf(nt) - kinds.indexOf(curT);
          orig.forEach(o => { const ks = PJ.tracks.filter(k => k.kind === trackById(o.track).kind); const tgt = ks[ks.indexOf(trackById(o.track)) + (trackById(o.track).kind === nt.kind ? shift : 0)]; if (tgt && !tgt.locked) o.c.track = tgt.id; });
        }
      }
    }
    renderTimelineFast(); drawFrameSoon();
  };
  const up = ev => {
    window.removeEventListener('pointermove', move); showSnap(null);
    if (!moved) return;
    if (!edge && tool === 'select') { const mvd = selected(); if (ev.ctrlKey && ST.editMode !== 'insert') { mvd.forEach(x => { PJ.clips = PJ.clips.filter(o => o !== x); }); mvd.sort((a, b) => a.start - b.start).forEach(x => placeClip(x, 'insert')); } else mvd.forEach(x => overwrite(x)); }
    commit(edge ? (tool === 'rolling' ? 'Rolling edit' : tool === 'ripple' ? 'Ripple edit' : tool === 'rate' ? 'Rate stretch' : 'Trim') : tool === 'slip' ? 'Slip' : 'Move');
    renderTimeline(); renderFx(); drawFrame();
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true });
}
function dragKeyframes(e, c, kt, tAt) {
  const t0 = tAt(e); let moved = false; const keys = []; for (const k in c.kf) c.kf[k].forEach(kk => { if (Math.abs(kk.t - kt) < 1e-3) keys.push(kk); });
  const mv = ev => { moved = true; const d = tAt(ev) - t0; keys.forEach(kk => kk.t = Math.max(0, frameSnap(kt + d))); const el = document.querySelector(`.clip[data-id="${c.id}"] .kfd[data-t="${kt}"]`); if (el) el.style.left = (kt + d) * ST.pps + 'px'; seek(c.start + kt + d); };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', () => { window.removeEventListener('pointermove', mv); if (moved) { for (const k in c.kf) c.kf[k].sort((a, b) => a.t - b.t); commit('Move keyframe'); renderTimeline(); renderFx(); } }, { once: true });
}
function kfMenu(e, c, kt) {
  e.preventDefault(); e.stopPropagation();
  const keysAt = () => { const out = []; for (const k in c.kf) c.kf[k].forEach(kk => { if (Math.abs(kk.t - kt) < 1e-3) out.push(kk); }); return out; };
  contextMenu(e, [...VFX.EASES.map(([k, l]) => ({ label: 'Interpolation: ' + l, checked: keysAt().every(kk => (kk.e || 'linear') === k), action: () => { keysAt().forEach(kk => kk.e = k); commit('Keyframe easing'); drawFrame(); renderFx(); } })), '-',
    { label: 'Go to keyframe', action: () => seek(c.start + kt) }, { label: 'Delete keyframe', action: () => { for (const k in c.kf) { c.kf[k] = c.kf[k].filter(kk => Math.abs(kk.t - kt) >= 1e-3); if (!c.kf[k].length) delete c.kf[k]; } commit('Delete keyframe'); renderTimeline(); renderFx(); drawFrame(); } }]);
}

// =====================================================================  drag & drop onto the timeline
const DT = { media: 'text/bts-media', title: 'text/bts-title', shape: 'text/bts-shape', gen: 'text/bts-gen', fx: 'text/bts-fx', look: 'text/bts-look', tr: 'text/bts-tr', kfp: 'text/bts-kfp', layout: 'text/bts-layout' };
let dragMedia = null;
function rowDragOver(e, row, t) {
  const ty = e.dataTransfer.types; let kind = null;
  if (ty.includes(DT.media)) kind = dragMedia?.kind === 'audio' ? 'audio' : 'video'; else if (ty.includes(DT.title) || ty.includes(DT.shape) || ty.includes(DT.gen)) kind = 'video';
  if (kind && kind === t.kind && !t.locked) { e.preventDefault(); row.classList.add('drop'); }
}
function rowDrop(e, row, t) {
  e.preventDefault(); row.classList.remove('drop'); const r = row.getBoundingClientRect(); let at = Math.max(0, (e.clientX - r.left) / ST.pps); at = snapTime(at, null).t;
  const mode = e.ctrlKey ? 'insert' : ST.editMode; const d = e.dataTransfer;
  const mid = d.getData(DT.media), tt = d.getData(DT.title), sh = d.getData(DT.shape), gen = d.getData(DT.gen);
  let c = null;
  if (mid) { const m = mediaById(mid); if (!m || m.missing) return; c = clipFromMedia(m, t.id, at); placeClip(c, mode); if (m.hasAudio && m.kind === 'video' && e.altKey) {} }
  else if (tt) c = makeTitle(tt, at, t.id, mode);
  else if (sh) c = makeShape(JSON.parse(sh), at, t.id, mode);
  else if (gen) c = makeGenerator(gen, at, t.id, mode);
  if (c) { select([c.id]); commit('Add ' + c.type); drawFrame(); }
}
function clipDrop(e, c, el) {
  el.classList.remove('drop'); const d = e.dataTransfer; e.preventDefault(); e.stopPropagation();
  const tr = d.getData(DT.tr), lk = d.getData(DT.look), fx = d.getData(DT.fx), kp = d.getData(DT.kfp), lay = d.getData(DT.layout);
  if (tr) { const r = el.getBoundingClientRect(); const side = e.clientX - r.left < r.width / 2 ? 'in' : 'out'; addTransition(c, side, tr); }
  else if (lk) applyLook(lk, [c]);
  else if (fx) { const j = JSON.parse(fx); addEffect(j.type, j.over, [c]); }
  else if (kp) applyKfPreset(kp, [c]);
  else if (lay) applyLayout(lay, [c]);
}

// =====================================================================  clip creation
function freeTrack(kind, start, d, prefer) {
  const ts = PJ.tracks.filter(t => t.kind === kind && !t.locked); const order = kind === 'video' ? [...ts].reverse() : ts;
  if (prefer && order.some(t => t.id === prefer)) order.unshift(order.splice(order.findIndex(t => t.id === prefer), 1)[0]);
  return (order.find(t => !PJ.clips.some(c => c.track === t.id && c.start < start + d - 1e-6 && cEnd(c) > start + 1e-6)) || order[0]).id;
}
function newClip(type, track, start, len, extra = {}) { return migrateClip({ id: uid('c'), type, mediaId: null, track, start, in: 0, out: len, name: extra.name || type, props: { ...defaultProps(type), ...(extra.props || {}) }, fx: extra.fx || [], kf: {} }); }
function clipFromMedia(m, track, start) {
  const type = m.kind === 'audio' ? 'audio' : m.kind === 'image' ? 'image' : 'video';
  const c = newClip(type, track, start, m.kind === 'image' ? PREFS.imgDur : m.dur, { name: m.name }); c.mediaId = m.id; return c;
}
function appendMedia(m, at, mode) {
  if (m.missing) return toast('Media is offline — relink it first', 'err');
  const kind = m.kind === 'audio' ? 'audio' : 'video';
  const start = at ?? PJ.clips.filter(c => trackById(c.track).kind === kind && (kind === 'audio' ? c.track === 'A1' : c.track === 'V1')).reduce((mx, c) => Math.max(mx, cEnd(c)), 0);
  const track = at != null && mode !== 'insert' && mode !== 'overwrite' ? freeTrack(kind, start, m.dur, kind === 'video' ? 'V1' : 'A1') : (kind === 'video' ? 'V1' : 'A1');
  const c = clipFromMedia(m, track, start); placeClip(c, mode || 'overwrite'); select([c.id]); commit('Add clip'); renderTimeline(); drawFrame(); return c;
}
function placeClip(c, mode = 'overwrite') { if (mode === 'insert') insertSpace(c.start, tlDur(c), new Set([c.id])); overwrite(c); PJ.clips.push(c); }
function insertSpace(at, d, skip) {
  PJ.clips.slice().forEach(o => { if (skip?.has(o.id) || trackById(o.track)?.locked) return; if (o.start < at - 1e-6 && cEnd(o) > at + 1e-6) splitClip(o, at); });
  PJ.clips.forEach(o => { if (skip?.has(o.id) || trackById(o.track)?.locked) return; if (o.start >= at - 1e-6) o.start += d; });
  PJ.captions.forEach(cp => { if (cp.start >= at - 1e-6) { cp.start += d; cp.end += d; } });
  PJ.markers.forEach(mk => { if (mk.t >= at - 1e-6) mk.t += d; });
}
function overwrite(c) {
  const s = c.start, e = cEnd(c), add = [];
  PJ.clips = PJ.clips.filter(o => {
    if (o === c || o.track !== c.track) return true; const os = o.start, oe = cEnd(o);
    if (oe <= s + 1e-6 || os >= e - 1e-6) return true;
    if (os >= s - 1e-6 && oe <= e + 1e-6) return false;
    if (os < s && oe > e) { const right = JSON.parse(JSON.stringify(o)); right.id = uid('c'); trimLeft(right, e); add.push(right); o.out = o.in + (s - os) * spd(o); PJ.transitions.forEach(tr => { if (tr.a === o.id) tr.a = right.id; }); return true; }
    if (os < s) { o.out = o.in + (s - os) * spd(o); return true; }
    trimLeft(o, e); return true;
  });
  PJ.clips.push(...add);
}
const TITLE_TPL = {
  'Big title': { text: 'Your title', size: 120, weight: 800, anim: 'pop' },
  'Title card': { text: 'THE TITLE\nA short subtitle', size: 104, weight: 800, anim: 'rise', style: 'card', boxColor: '#0b0c10', boxOpacity: 85, accent: '#9a7bff', len: 5 },
  'Lower third': { text: 'Name Surname\nRole · Organisation', size: 52, weight: 700, align: 'left', anim: 'slide', style: 'lower3', boxColor: '#111827', boxOpacity: 82, accent: '#9a7bff', y: 360, x: -520, shadow: false },
  'Subscribe button': { text: 'SUBSCRIBE', size: 64, weight: 800, anim: 'pop', style: 'cta', accent: '#e53935', y: 330, shadow: false, len: 4 },
  'Quote': { text: 'Education is the most powerful\nweapon to change the world.\n— Nelson Mandela', size: 64, weight: 500, italic: true, anim: 'fade', style: 'quote', accent: '#9a7bff', len: 6 },
  'Credits roll': { text: 'Directed by\nYour Name\n\nEdited by\nYour Name\n\nMusic\nArtist Name\n\nMade with BTS Video', size: 54, weight: 500, anim: 'roll', len: 8 },
  'Countdown': { text: '5', size: 260, weight: 800, anim: 'none', style: 'countdown', count: 5, accent: '#9a7bff', shadow: false, len: 5 },
  'Subtitle': { text: 'Subtitle text goes here', size: 48, weight: 500, box: true, boxOpacity: 55, anim: 'fade', y: 420 },
  'Typewriter': { text: 'Once upon a time…', size: 72, weight: 400, font: 'Courier New', anim: 'type' },
  'Neon outline': { text: 'BOLD STATEMENT', size: 110, weight: 900, color: '#ffffff', outline: 6, outlineColor: '#9a7bff', anim: 'letters' },
};
function makeTitle(tpl, at = ST.t, track, mode = 'overwrite') {
  const T = TITLE_TPL[tpl] || TITLE_TPL['Big title']; const len = T.len || 4; const p = { ...T }; delete p.len;
  // templates are designed for 1080p: scale size by the short side and positions by each axis
  const k = Math.min(PJ.seq.w, PJ.seq.h) / 1080; p.size = Math.round((p.size || 96) * k); if (p.outline) p.outline = Math.max(1, Math.round(p.outline * k)); if (p.x) p.x = Math.round(p.x * PJ.seq.w / 1920); if (p.y) p.y = Math.round(p.y * PJ.seq.h / 1080);
  const c = newClip('title', track || freeTrack('video', at, len, 'V2'), at, len, { name: p.text.split('\n')[0], props: p }); placeClip(c, mode); renderTimeline(); return c;
}
function addTitle(tpl) { const c = makeTitle(tpl, ST.t); select([c.id]); commit('Add title'); drawFrame(); }
function makeShape(def, at = ST.t, track, mode = 'overwrite') {
  const k = Math.min(PJ.seq.w, PJ.seq.h) / 1080; const sz = def.shape === 'emoji' ? { w: 220, h: 220 } : def.shape === 'arrow' ? { w: 420, h: 160 } : def.shape === 'line' ? { w: 600, h: 8 } : { w: 420, h: 260 };
  const c = newClip('shape', track || freeTrack('video', at, 4, 'V2'), at, 4, { name: def.shape, props: { radius: Math.round(24 * k), ...def, w: Math.round(sz.w * k), h: Math.max(2, Math.round(sz.h * k)) } }); placeClip(c, mode); renderTimeline(); return c;
}
function addShape(def) { const c = makeShape(def); select([c.id]); commit('Add shape'); drawFrame(); }
function makeGenerator(kind, at = ST.t, track, mode = 'overwrite') {
  let c;
  if (kind === 'adjust') c = newClip('adjust', track || freeTrack('video', at, 5, 'V2'), at, 5, { name: 'Adjustment layer' });
  else if (kind === 'gradient') c = newClip('color', track || freeTrack('video', at, 5, 'V1'), at, 5, { name: 'Gradient', props: { grad: 'linear', color: '#1d4ed8', color2: '#9333ea', angle: 135 } });
  else if (kind === 'countdown') c = newClip('title', track || freeTrack('video', at, 5, 'V1'), at, 5, { name: 'Countdown leader', props: { ...TITLE_TPL.Countdown, anim: 'none', size: Math.round(260 * Math.min(PJ.seq.w, PJ.seq.h) / 1080) } });
  else if (kind === 'black') c = newClip('color', track || freeTrack('video', at, 5, 'V1'), at, 5, { name: 'Black video', props: { color: '#000000' } });
  else c = newClip('color', track || freeTrack('video', at, 5, 'V1'), at, 5, { name: 'Color matte' });
  if (kind === 'countdown') { delete c.props.len; c.fx = []; }
  placeClip(c, mode); renderTimeline(); return c;
}
function addGenerator(kind) { const c = makeGenerator(kind); select([c.id]); commit('Add ' + c.name); drawFrame(); }
function addColor() { addGenerator('color'); }
function addTrack(kind) { const n = PJ.tracks.filter(t => t.kind === kind).length + 1; let id = (kind === 'video' ? 'V' : 'A') + n; while (trackById(id)) id += "'"; const t = { id, kind, muted: false, hidden: false, locked: false }; if (kind === 'video') PJ.tracks.unshift(t); else PJ.tracks.push(t); commit('Add track'); renderTimeline(); return t; }
function deleteTrack(t) { if (PJ.clips.some(c => c.track === t.id) && !window.confirm(`Delete ${t.id} and its clips?`)) return; PJ.clips = PJ.clips.filter(c => c.track !== t.id); PJ.tracks = PJ.tracks.filter(x => x !== t); commit('Delete track'); renderTimeline(); drawFrame(); }

// =====================================================================  editing operations
function splitClip(c, t) {
  if (t <= c.start + 1e-3 || t >= cEnd(c) - 1e-3) return null;
  const right = JSON.parse(JSON.stringify(c)); right.id = uid('c'); const off = t - c.start;
  c.out = c.in + off * spd(c); right.in = c.in + off * spd(c); right.start = t; shiftKf(right, -off); c.props.fadeOut = 0; right.props.fadeIn = 0;
  if (c.props.freeze != null) { right.in = c.in; }
  PJ.transitions.forEach(tr => { if (tr.a === c.id) tr.a = right.id; });
  PJ.clips.push(right); return right;
}
function splitAtPlayhead() {
  const t = ST.t; let targets = selected().filter(c => c.start < t && cEnd(c) > t); if (!targets.length) targets = PJ.clips.filter(c => c.start < t - 1e-3 && cEnd(c) > t + 1e-3 && !trackById(c.track).locked);
  if (!targets.length) return toast('Nothing under the playhead to split');
  targets.forEach(c => splitClip(c, t)); commit('Split'); renderTimeline(); renderFx();
}
function deleteClips(ripple) {
  if (ST.selTr) return deleteTransition(ST.selTr);
  if (ST.selCap) { PJ.captions = PJ.captions.filter(c => c.id !== ST.selCap); ST.selCap = null; commit('Delete caption'); renderTimeline(); renderLeft(); drawFrame(); return; }
  const sel = selected(); if (!sel.length) return;
  PJ.clips = PJ.clips.filter(c => !ST.sel.has(c.id));
  if (ripple) sel.sort((a, b) => b.start - a.start).forEach(s => { const d = tlDur(s); PJ.clips.forEach(c => { if (c.track === s.track && c.start >= cEnd(s) - 1e-6) c.start -= d; }); });
  ST.sel.clear(); commit(ripple ? 'Ripple delete' : 'Delete'); renderTimeline(); renderFx(); drawFrame();
}
let clipBoard = null;
function copyClips() { const s = selected(); if (!s.length) return; const t0 = Math.min(...s.map(c => c.start)); clipBoard = s.map(c => ({ ...JSON.parse(JSON.stringify(c)), start: c.start - t0 })); toast(`Copied ${s.length} clip(s)`); }
function cutClips() { copyClips(); deleteClips(false); }
function pasteClips() { if (!clipBoard) return; const ids = []; const relink = {}; clipBoard.forEach(c => { const n = JSON.parse(JSON.stringify(c)); n.id = uid('c'); if (n.link) n.link = relink[n.link] || (relink[n.link] = uid('L')); n.start += ST.t; placeClip(n, ST.editMode); ids.push(n.id); }); select(ids); commit('Paste'); drawFrame(); }
function duplicateClips() { const s = selected(); if (!s.length) return; const ids = []; const off = Math.max(...s.map(cEnd)) - Math.min(...s.map(c => c.start)); const relink = {}; s.forEach(c => { const n = JSON.parse(JSON.stringify(c)); n.id = uid('c'); if (n.link) n.link = relink[n.link] || (relink[n.link] = uid('L')); n.start = c.start + off; placeClip(n); ids.push(n.id); }); select(ids); commit('Duplicate'); }
function deleteTransition(id) { PJ.transitions = PJ.transitions.filter(t => t.id !== id); ST.selTr = null; commit('Delete transition'); renderTimeline(); renderFx(); drawFrame(); }
async function transitionDurationDialog(tr) { const v = await form({ title: 'Transition duration', fields: [{ key: 'd', label: 'Duration (seconds)', type: 'number', value: tr.dur.toFixed(2), min: 0.04, step: 0.1 }] }); if (!v) return; tr.dur = Math.max(1 / PJ.seq.fps, +v.d || 1); commit('Transition duration'); renderTimeline(); renderFx(); drawFrame(); }
// Adds a transition at the clip's start ('in') or end ('out'); two-sided when a clip touches that side.
function addTransition(c, side, kind = 'cross', durS) {
  if (!c || !isVisual(c)) return toast('Transitions go on video, image, title or shape clips');
  const nb = neighbour(c, side === 'in' ? 'l' : 'r'); const a = side === 'in' ? nb?.id || null : c.id, b = side === 'in' ? c.id : nb?.id || null;
  let tr = PJ.transitions.find(t => t.a === a && t.b === b);
  if (!tr) { PJ.transitions = PJ.transitions.filter(t => !(side === 'in' ? t.b === c.id : t.a === c.id)); tr = { id: uid('t'), track: c.track, a, b, kind, dur: durS || PREFS.trDur }; PJ.transitions.push(tr); }
  else { tr.kind = kind; if (durS) tr.dur = durS; }
  commit('Transition: ' + kind); ST.sel.clear(); ST.selTr = tr.id; renderTimeline(); renderFx(); drawFrame(); return tr;
}
function applyTransition(kind = 'cross') {
  const sel = selected().filter(isVisual);
  if (sel.length) { sel.forEach(c => addTransition(c, 'in', kind)); return; }
  // nearest cut to the playhead on any unlocked video track
  let best = null; PJ.clips.filter(c => isVisual(c) && !trackById(c.track).locked).forEach(c => { [['in', c.start], ['out', cEnd(c)]].forEach(([side, t]) => { const d = Math.abs(t - ST.t); if (!best || d < best.d) best = { c, side, d }; }); });
  if (!best) return toast('Add a clip first'); addTransition(best.c, best.side, kind);
}
function quickFades() { const cs = selected(); if (!cs.length) return toast('Select a clip first'); cs.forEach(c => { c.props.fadeIn = Math.min(0.5, tlDur(c) / 3); c.props.fadeOut = Math.min(0.5, tlDur(c) / 3); }); commit('Fades'); renderTimeline(); renderFx(); drawFrame(); }
function setProp(k, v, cs = selected()) { if (!cs.length) return toast('Select a clip first'); cs.forEach(c => { c.props[k] = v; if (c.kf) delete c.kf[k]; }); commit('Change ' + k); renderFx(); drawFrame(); renderTimeline(); }
function resetEffects() { selected().forEach(c => { const keep = ['title', 'color', 'shape'].includes(c.type) ? Object.fromEntries(Object.entries(c.props).filter(([k]) => !(k in defaultProps('video')))) : {}; c.props = { ...defaultProps(c.type), ...keep, speed: c.props.speed, freeze: c.props.freeze, detached: c.props.detached }; c.fx = []; c.kf = {}; }); commit('Reset effects'); renderTimeline(); renderFx(); drawFrame(); }
function closeGaps() { PJ.tracks.forEach(t => { let pos = 0; PJ.clips.filter(c => c.track === t.id).sort((a, b) => a.start - b.start).forEach(c => { c.start = pos; pos = cEnd(c); }); }); commit('Close gaps'); renderTimeline(); drawFrame(); }

// speed, duration, ramp, reverse, freeze
async function speedDialog() {
  const c = selected()[0]; if (!c) return toast('Select a clip');
  const media = ['video', 'audio'].includes(c.type);
  const fields = [...(media ? [{ key: 's', label: 'Speed %', type: 'number', value: Math.round(spd(c) * 100), min: 10, max: 1000 }] : []), { key: 'd', label: 'Duration (seconds)' + (media ? ' — changes the speed' : ''), type: 'number', value: tlDur(c).toFixed(2), step: 0.1, min: 0.04 },
    ...(media ? [{ key: 'rev', label: 'Reverse speed (renders a reversed copy)', type: 'checkbox', value: false }] : []), { key: 'ripple', label: 'Ripple edit, shifting trailing clips', type: 'checkbox', value: true }];
  const v = await form({ title: 'Clip speed / duration', fields }); if (!v) return;
  const oldEnd = cEnd(c);
  if (media) {
    let sp = clamp(+v.s, 10, 1000) / 100; const dIn = +v.d; if (Math.abs(dIn - tlDur(c)) > 0.01) sp = clamp((c.out - c.in) / dIn, 0.1, 10);
    c.props.speed = sp;
  } else c.out = c.in + Math.max(0.04, +v.d);
  if (v.ripple) { const d = cEnd(c) - oldEnd; PJ.clips.forEach(o => { if (o !== c && o.track === c.track && o.start >= oldEnd - 1e-6) o.start += d; }); } else overwrite(c);
  commit('Speed / duration'); renderTimeline(); renderFx(); drawFrame();
  if (v.rev) await reverseClip();
}
async function speedRampDialog() {
  const c = selected()[0]; if (!c || !['video', 'audio'].includes(c.type)) return toast('Select a video or audio clip');
  const v = await form({ title: 'Speed ramp', fields: [{ key: 'a', label: 'Start speed %', type: 'number', value: 100, min: 10, max: 1000 }, { key: 'b', label: 'End speed %', type: 'number', value: 300, min: 10, max: 1000 }, { key: 'n', label: 'Steps (smoothness)', type: 'number', value: 8, min: 2, max: 30 }, { key: 'curve', label: 'Curve', type: 'select', value: 'ease', options: [{ value: 'linear', label: 'Linear' }, { value: 'ease', label: 'Ease in / out' }] }] });
  if (!v) return;
  const n = clamp(+v.n | 0, 2, 30), a = clamp(+v.a, 10, 1000) / 100, b = clamp(+v.b, 10, 1000) / 100; const len = c.out - c.in; const seg = len / n; let pos = c.start; const oldEnd = cEnd(c);
  const parts = []; for (let i = 0; i < n; i++) { const u = n === 1 ? 0 : i / (n - 1); const k = v.curve === 'ease' ? VFX.easeFn.easeInOut(u) : u; const s = a + (b - a) * k; const p = JSON.parse(JSON.stringify(c)); p.id = i === 0 ? c.id : uid('c'); p.in = c.in + seg * i; p.out = c.in + seg * (i + 1); p.props.speed = s; p.start = pos; p.kf = {}; if (i > 0) p.props.fadeIn = 0; if (i < n - 1) p.props.fadeOut = 0; pos += seg / s; parts.push(p); }
  const link = c.link; PJ.clips = PJ.clips.filter(o => o !== c); parts.forEach(p => { p.link = link || null; PJ.clips.push(p); });
  const d = pos - oldEnd; PJ.clips.forEach(o => { if (!parts.includes(o) && o.track === c.track && o.start >= oldEnd - 1e-6) o.start += d; });
  select(parts.map(p => p.id)); commit('Speed ramp'); drawFrame(); toast(`Speed ramp: ${n} segments from ${Math.round(a * 100)}% to ${Math.round(b * 100)}%`, 'ok');
}
async function reverseClip() {
  const c = selected()[0]; if (!c || !['video', 'audio'].includes(c.type)) return toast('Select a video or audio clip');
  if (!ST.ffmpeg) return toast('Reversing needs FFmpeg', 'err'); const m = mediaById(c.mediaId); if (!m || m.missing) return;
  const len = c.out - c.in; if (len > 120 && !(await confirm('Reverse a long clip?', 'Reversing loads the whole clip into memory. It may take a while.', 'Reverse'))) return;
  const dir = (await bts.ffmpeg.tmpDir()).replace(/\\/g, '/'); const out = `${dir}/${m.id}-rev-${Math.round(c.in * 1000)}-${Math.round(c.out * 1000)}.${m.kind === 'audio' ? 'wav' : 'mp4'}`;
  setStatus('Reversing clip…'); const pm = progressModal('Reversing clip'); pm.set(0.3, 'Rendering a reversed copy with FFmpeg…');
  const args = ['-ss', c.in.toFixed(3), '-t', len.toFixed(3), '-i', m.proxy || m.path];
  if (m.kind === 'audio') args.push('-af', 'areverse', '-c:a', 'pcm_s16le', out);
  else args.push('-vf', 'reverse', ...(m.hasAudio ? ['-af', 'areverse', '-c:a', 'aac', '-b:a', '192k'] : ['-an']), '-c:v', 'libx264', '-crf', '17', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', out);
  const id = await bts.ffmpeg.start(args); const r = await bts.ffmpeg.end(id); pm.close(); setStatus('Ready');
  if (!r.ok) return toast('Could not reverse: ' + r.log.split('\n').filter(Boolean).slice(-1)[0], 'err', 7000);
  const nm = await importPath(out, m.name.replace(/\.\w+$/, '') + ' (reversed)' + (m.kind === 'audio' ? '.wav' : '.mp4')); if (!nm || nm.missing) return; nm.gen = 'reverse';
  c.mediaId = nm.id; c.in = 0; c.out = Math.min(nm.dur, len); c.name = nm.name; els.delete(c.id);
  commit('Reverse clip'); renderTimeline(); renderFx(); drawFrame(); toast('Clip reversed', 'ok');
}
async function freezeFrame() {
  const c = selected().find(x => x.type === 'video') || PJ.clips.find(x => x.type === 'video' && x.start <= ST.t && cEnd(x) > ST.t && !trackById(x.track).locked);
  if (!c) return toast('Put the playhead over a video clip'); const t = clamp(ST.t, c.start, cEnd(c) - 1 / PJ.seq.fps);
  const v = await form({ title: 'Insert frame hold segment', fields: [{ key: 'd', label: 'Hold duration (seconds)', type: 'number', value: 2, min: 0.1, step: 0.5 }] }); if (!v) return;
  const d = Math.max(0.1, +v.d); const src = srcTime(c, t);
  const right = splitClip(c, t); const hold = JSON.parse(JSON.stringify(c)); hold.id = uid('c'); hold.start = t; hold.in = 0; hold.out = d; hold.props.speed = 1; hold.props.freeze = src; hold.props.fadeIn = hold.props.fadeOut = 0; hold.kf = {}; hold.link = null; hold.name = c.name + ' (hold)';
  insertSpace(t, d, new Set()); PJ.clips.push(hold); if (right && right.start < t + d - 1e-6) right.start = t + d;
  select([hold.id]); commit('Frame hold segment'); drawFrame();
}
function frameHold() { const cs = selected().filter(c => c.type === 'video'); if (!cs.length) return toast('Select a video clip'); cs.forEach(c => { c.props.freeze = c.props.freeze != null ? null : srcTime(c, clamp(ST.t, c.start, cEnd(c) - 0.01)); }); commit('Frame hold'); renderTimeline(); renderFx(); drawFrame(); }

// trims, lift/extract, insert/overwrite edits
function rippleTrimToPlayhead(which) {
  const t = ST.t; const targets = PJ.clips.filter(c => !trackById(c.track).locked && c.start < t - 1e-3 && cEnd(c) > t + 1e-3);
  if (!targets.length) return toast('No clip under the playhead');
  let newT = t;
  targets.forEach(c => {
    if (which === 'next') { const amt = cEnd(c) - t; const oldEnd = cEnd(c); c.out = c.in + (t - c.start) * spd(c); PJ.clips.forEach(o => { if (o !== c && o.track === c.track && o.start >= oldEnd - 1e-6) o.start -= amt; }); }
    else { const amt = t - c.start, s0 = c.start; const oldEnd = cEnd(c); trimLeft(c, t); c.start = s0; PJ.clips.forEach(o => { if (o !== c && o.track === c.track && o.start >= oldEnd - 1e-6) o.start -= amt; }); newT = Math.min(newT, s0); }
  });
  commit(which === 'next' ? 'Ripple trim next edit' : 'Ripple trim previous edit'); renderTimeline(); seek(newT);
}
function liftExtract(extract) {
  const a = ST.inP ?? null, b = ST.outP ?? null; if (a == null || b == null || b <= a) return toast('Set an In point (I) and an Out point (O) first');
  PJ.clips.slice().forEach(c => { if (!trackById(c.track).locked && c.start < a - 1e-6 && cEnd(c) > a + 1e-6) splitClip(c, a); });
  PJ.clips.slice().forEach(c => { if (!trackById(c.track).locked && c.start < b - 1e-6 && cEnd(c) > b + 1e-6) splitClip(c, b); });
  PJ.clips = PJ.clips.filter(c => trackById(c.track).locked || !(c.start >= a - 1e-6 && cEnd(c) <= b + 1e-6));
  if (extract) { const d = b - a; PJ.clips.forEach(c => { if (!trackById(c.track).locked && c.start >= b - 1e-6) c.start -= d; }); PJ.captions = PJ.captions.filter(cp => !(cp.start >= a && cp.end <= b)); PJ.captions.forEach(cp => { if (cp.start >= b - 1e-6) { cp.start -= d; cp.end -= d; } }); ST.outP = null; }
  ST.sel.clear(); commit(extract ? 'Extract' : 'Lift'); renderTimeline(); renderFx(); seek(a);
}
function editFromBin(mode) {
  const m = mediaById(ST.binSel) || PJ.media.find(x => !x.missing); if (!m) return toast('Select a clip in the Project panel first');
  let c = clipFromMedia(m, m.kind === 'audio' ? 'A1' : 'V1', ST.t);
  if (ST.inP != null && ST.outP != null && ST.outP > ST.inP) { c.start = ST.inP; c.out = Math.min(c.out, ST.outP - ST.inP); }
  placeClip(c, mode); select([c.id]); commit(mode === 'insert' ? 'Insert edit' : 'Overwrite edit'); seek(cEnd(c));
}
// in / out
function setIn(t = ST.t) { ST.inP = frameSnap(t); if (ST.outP != null && ST.outP <= ST.inP) ST.outP = null; renderTimeline(); renderHead(); }
function setOut(t = ST.t) { ST.outP = frameSnap(t); if (ST.inP != null && ST.inP >= ST.outP) ST.inP = null; renderTimeline(); renderHead(); }
function clearIO() { ST.inP = ST.outP = null; renderTimeline(); renderHead(); }
function markClip() { const c = selected()[0] || PJ.clips.find(x => x.start <= ST.t && cEnd(x) > ST.t); if (!c) return; ST.inP = c.start; ST.outP = cEnd(c); renderTimeline(); renderHead(); }
// markers
const MK_COLORS = [['#22c55e', 'Green'], ['#ef4444', 'Red'], ['#a855f7', 'Purple'], ['#f97316', 'Orange'], ['#eab308', 'Yellow'], ['#3b82f6', 'Blue'], ['#06b6d4', 'Cyan'], ['#ffffff', 'White']];
function addMarker(t = ST.t, label = '') { const mk = { id: uid('k'), t: frameSnap(t), label, color: MK_COLORS[0][0] }; PJ.markers.push(mk); PJ.markers.sort((a, b) => a.t - b.t); commit('Add marker'); renderTimeline(); return mk; }
async function editMarker(mk) {
  const v = await form({ title: 'Marker', fields: [{ key: 'label', label: 'Name', value: mk.label }, { key: 'color', label: 'Colour', type: 'select', value: mk.color, options: MK_COLORS.map(([v, l]) => ({ value: v, label: l })) }, { key: 't', label: 'Time (seconds)', type: 'number', value: mk.t.toFixed(3), step: 0.04 }, { key: 'del', label: 'Delete this marker', type: 'checkbox', value: false }] });
  if (!v) return; if (v.del) PJ.markers = PJ.markers.filter(x => x !== mk); else Object.assign(mk, { label: v.label, color: v.color, t: Math.max(0, +v.t) }); PJ.markers.sort((a, b) => a.t - b.t); commit('Edit marker'); renderTimeline();
}
function markerAtPlayhead() { return PJ.markers.find(m => Math.abs(m.t - ST.t) < 1.5 / PJ.seq.fps); }
function jumpMarker(dir) { const list = PJ.markers.filter(m => dir > 0 ? m.t > ST.t + 1e-3 : m.t < ST.t - 1e-3); if (!list.length) return toast('No more markers'); seek(dir > 0 ? list[0].t : list[list.length - 1].t); }
// link / group
function toggleLink() { const s = selected(); if (!s.length) return toast('Select clips first'); const anyLinked = s.some(c => c.link); if (anyLinked) { s.forEach(c => c.link = null); commit('Unlink'); toast('Unlinked'); } else if (s.length > 1) { const id = uid('L'); s.forEach(c => c.link = id); commit('Link'); toast(`Linked ${s.length} clips`); } else return toast('Select two or more clips to link'); renderTimeline(); }
function groupClips() { const s = selected(); if (s.length < 2) return toast('Select two or more clips to group'); const id = uid('G'); s.forEach(c => c.link = id); commit('Group'); renderTimeline(); toast(`Grouped ${s.length} clips`); }
function ungroupClips() { const s = selected(); s.forEach(c => c.link = null); commit('Ungroup'); renderTimeline(); }
function unlinkAudio() {
  const vids = selected().filter(c => c.type === 'video' && mediaById(c.mediaId)?.hasAudio && !c.props.detached); if (!vids.length) return toast('Select a video clip that has audio');
  const ids = [];
  vids.forEach(c => { const a = JSON.parse(JSON.stringify(c)); a.id = uid('c'); a.type = 'audio'; a.track = freeTrack('audio', c.start, tlDur(c), 'A1'); a.fx = []; a.kf = c.kf.volume ? { volume: c.kf.volume } : {}; a.props = { ...defaultProps('audio'), volume: c.props.volume, pan: c.props.pan, fadeIn: c.props.fadeIn, fadeOut: c.props.fadeOut, speed: c.props.speed, normalize: c.props.normalize, denoise: c.props.denoise, voice: c.props.voice };
    c.props.detached = true; const L = c.link || uid('L'); c.link = L; a.link = L; overwrite(a); PJ.clips.push(a); ids.push(c.id, a.id); });
  select(ids); commit('Unlink audio'); toast('Audio moved to its own track — the clips stay linked (Ctrl+L to unlink).', 'ok', 5000);
}
// captions on the timeline
function addCaption(at = ST.t, text = 'New caption') { const cp = { id: uid('cc'), start: frameSnap(at), end: frameSnap(at) + 2, text }; PJ.captions.push(cp); PJ.captions.sort((a, b) => a.start - b.start); ST.selCap = cp.id; ST.sel.clear(); commit('Add caption'); renderTimeline(); renderLeft(); renderFx(); drawFrame(); return cp; }
function splitCaption(cp) { const t = ST.t; if (t <= cp.start + 0.05 || t >= cp.end - 0.05) return toast('Put the playhead inside the caption'); const words = cp.text.split(/\s+/); const half = Math.ceil(words.length / 2); const n = { id: uid('cc'), start: t, end: cp.end, text: words.slice(half).join(' ') || cp.text }; cp.end = t; cp.text = words.slice(0, half).join(' '); PJ.captions.push(n); PJ.captions.sort((a, b) => a.start - b.start); commit('Split caption'); renderTimeline(); renderLeft(); drawFrame(); }

// =====================================================================  keyframe presets, layouts, reframe
const KF_PRESETS = [
  ['Ken Burns zoom in', (c, D) => ({ scale: [[0, 100, 'easeInOut'], [D, 120]] })],
  ['Ken Burns zoom out', (c, D) => ({ scale: [[0, 122, 'easeInOut'], [D, 100]] })],
  ['Pan left', (c, D) => ({ scale: [[0, 118]], x: [[0, PJ.seq.w * 0.07, 'easeInOut'], [D, -PJ.seq.w * 0.07]] })],
  ['Pan right', (c, D) => ({ scale: [[0, 118]], x: [[0, -PJ.seq.w * 0.07, 'easeInOut'], [D, PJ.seq.w * 0.07]] })],
  ['Pop in', (c, D) => ({ scale: [[0, 0, 'easeOut'], [Math.min(0.25, D / 3), 112, 'easeInOut'], [Math.min(0.4, D / 2), 100]], opacity: [[0, 0], [Math.min(0.12, D / 4), 100]] })],
  ['Fade in', (c, D) => ({ opacity: [[0, 0, 'easeOut'], [Math.min(1, D / 2), 100]] })],
  ['Fade out', (c, D) => ({ opacity: [[Math.max(0, D - Math.min(1, D / 2)), 100, 'easeIn'], [D, 0]] })],
  ['Slide in from left', (c, D) => ({ x: [[0, -PJ.seq.w, 'easeOut'], [Math.min(0.6, D / 2), 0]] })],
  ['Spin in', (c, D) => ({ rotation: [[0, -180, 'easeOut'], [Math.min(0.7, D / 2), 0]], scale: [[0, 0, 'easeOut'], [Math.min(0.7, D / 2), 100]] })],
];
function applyKfPreset(name, cs = selected()) {
  cs = cs.filter(isVisual); if (!cs.length) return toast('Select a video, image, title or shape clip'); const pr = KF_PRESETS.find(p => p[0] === name); if (!pr) return;
  cs.forEach(c => { const D = tlDur(c); const def = pr[1](c, D); for (const [k, keys] of Object.entries(def)) { if (/Fade (in|out)/.test(name) && c.kf[k]) { keys.forEach(([t, v, e]) => VFX.setKey(c.kf, k, t, v, e)); continue; } c.kf[k] = keys.map(([t, v, e]) => ({ t, v, e: e || 'linear' })); if (keys.length === 1) { c.props[k] = keys[0][1]; delete c.kf[k]; } } });
  commit('Keyframe preset: ' + name); renderTimeline(); renderFx(); drawFrame(); toast(name + ' applied', 'ok');
}
const LAYOUTS = [['pip-tl', 'PiP top-left'], ['pip-tr', 'PiP top-right'], ['pip-bl', 'PiP bottom-left'], ['pip-br', 'PiP bottom-right'], ['split2', 'Split screen 2-up (side by side)'], ['split2v', 'Split screen 2-up (stacked)'], ['split3', 'Split screen 3-up'], ['grid4', '4-up grid'], ['full', 'Full frame (reset layout)']];
// Fit a clip's displayed media into a cell rectangle (seq coords, top-left origin) by scaling + cropping
function fitToCell(c, cx, cy, cw, ch) {
  const P = { ...c.props, cropL: 0, cropR: 0, cropT: 0, cropB: 0 }; const R = mediaRect(c, P); const dw = R.dw, dh = R.dh;
  const s = Math.max(cw / dw, ch / dh); const cropX = Math.max(0, (1 - cw / (dw * s)) / 2) * 100, cropY = Math.max(0, (1 - ch / (dh * s)) / 2) * 100;
  Object.assign(c.props, { scale: Math.round(s * 1000) / 10, cropL: cropX, cropR: cropX, cropT: cropY, cropB: cropY, x: cx + cw / 2 - PJ.seq.w / 2, y: cy + ch / 2 - PJ.seq.h / 2, rotation: 0 });
  ['scale', 'x', 'y', 'cropL', 'cropR', 'cropT', 'cropB', 'rotation'].forEach(k => delete c.kf[k]);
}
function applyLayout(kind, cs = selected()) {
  cs = cs.filter(c => ['video', 'image', 'color'].includes(c.type)); if (!cs.length) return toast('Select one or more video/image clips (stacked on different tracks for split screens)');
  const W = PJ.seq.w, H = PJ.seq.h, m = Math.round(Math.min(W, H) * 0.04);
  // order: top-most track first
  const order = PJ.tracks.map(t => t.id); cs.sort((a, b) => order.indexOf(a.track) - order.indexOf(b.track));
  if (kind.startsWith('pip')) {
    const c = cs[0]; if (c.type !== 'color') { c.props.fit = 'fit'; c.props.bgFill = 'none'; } const R = mediaRect(c, { ...c.props, cropL: 0, cropR: 0, cropT: 0, cropB: 0 }); const tw = (W >= H ? 0.32 : 0.46) * W; const s = Math.min(tw / R.dw, (H * 0.4) / R.dh); const w = R.dw * s, hh = R.dh * s;
    const x = kind.endsWith('l') ? m : W - m - w, y = kind.includes('-t') ? m : H - m - hh;
    Object.assign(c.props, { scale: Math.round(s * 1000) / 10, cropL: 0, cropR: 0, cropT: 0, cropB: 0, x: x + w / 2 - W / 2, y: y + hh / 2 - H / 2, rotation: 0 }); ['scale', 'x', 'y', 'cropL', 'cropR', 'cropT', 'cropB', 'rotation'].forEach(k => delete c.kf[k]); if (!c.fx.some(f => f.type === 'shadow')) c.fx.push(VFX.newFx('shadow', { blur: 30, dist: 10 })); if (!c.fx.some(f => f.type === 'rounded')) c.fx.push(VFX.newFx('rounded', { radius: 24 })); }
  else if (kind === 'full') cs.forEach(c => { Object.assign(c.props, { scale: 100, x: 0, y: 0, cropL: 0, cropR: 0, cropT: 0, cropB: 0, rotation: 0 }); c.fx = c.fx.filter(f => !['shadow', 'rounded', 'border'].includes(f.type)); });
  else {
    const cells = kind === 'split2' ? [[0, 0, W / 2, H], [W / 2, 0, W / 2, H]] : kind === 'split2v' ? [[0, 0, W, H / 2], [0, H / 2, W, H / 2]] : kind === 'split3' ? (W >= H ? [[0, 0, W / 3, H], [W / 3, 0, W / 3, H], [2 * W / 3, 0, W / 3, H]] : [[0, 0, W, H / 3], [0, H / 3, W, H / 3], [0, 2 * H / 3, W, H / 3]]) : [[0, 0, W / 2, H / 2], [W / 2, 0, W / 2, H / 2], [0, H / 2, W / 2, H / 2], [W / 2, H / 2, W / 2, H / 2]];
    if (cs.length < cells.length) toast(`This layout has ${cells.length} cells — select ${cells.length} clips stacked on different video tracks.`, '', 5000);
    cs.slice(0, cells.length).forEach((c, i) => fitToCell(c, ...cells[i]));
  }
  commit('Layout: ' + kind); renderFx(); drawFrame(); renderTimeline();
}

// =====================================================================  menu helpers (keyframes, effects, text, audio)
function kfTargets() { const cs = selected(); if (!cs.length) toast('Select a clip first'); return cs; }
function addKeyframesAtPlayhead(keys) {
  const cs = kfTargets(); let n = 0;
  cs.forEach(c => { const D = tlDur(c); const lt = frameSnap(clamp(ST.t - c.start, 0, D)); const P = evalProps(c, lt); (keys || (isVisual(c) ? ['x', 'y', 'scale', 'rotation', 'opacity'] : ['volume'])).forEach(k => { if (k === 'volume' && !hasAudioOf(c)) return; VFX.setKey(c.kf, k, lt, P[k]); n++; }); });
  if (n) { commit('Add keyframes'); renderTimeline(); renderFx(); toast(`Added ${n} keyframe(s) at ${tc(ST.t)}`); }
}
function removeAllKeyframes() { const cs = kfTargets(); cs.forEach(c => { for (const k in c.kf) { const v = VFX.evalKf(c.kf[k], clamp(ST.t - c.start, 0, tlDur(c))); delete c.kf[k]; animSet(c, k, v, 0); } }); commit('Remove keyframes'); renderTimeline(); renderFx(); drawFrame(); }
function setEaseAtPlayhead(e) { let n = 0; kfTargets().forEach(c => { const lt = ST.t - c.start; for (const k in c.kf) c.kf[k].forEach(kk => { if (Math.abs(kk.t - lt) < 0.5 / PJ.seq.fps) { kk.e = e; n++; } }); }); if (!n) return toast('Put the playhead on a keyframe (use Next / Previous keyframe)'); commit('Keyframe easing'); drawFrame(); renderFx(); }
function jumpKeyframe(dir) { const c = selected()[0]; if (!c) return toast('Select a clip'); const ts = kfTimes(c).map(t => c.start + t).filter(t => dir > 0 ? t > ST.t + 1e-3 : t < ST.t - 1e-3); if (!ts.length) return toast('No more keyframes'); seek(dir > 0 ? ts[0] : ts[ts.length - 1]); }
function toggleAllEffects() { const cs = selected().filter(c => c.fx.length); if (!cs.length) return toast('The selected clip has no effects'); const on = !cs.some(c => c.fx.some(f => f.on)); cs.forEach(c => c.fx.forEach(f => f.on = on)); commit(on ? 'Enable effects' : 'Bypass effects'); renderFx(); renderTimeline(); drawFrame(); }
function showInspectorGroup(name) { if (!selected().length) return toast('Select a clip first'); PREFS.collapsed = (PREFS.collapsed || []).filter(x => x !== name); savePrefs(); renderFx(); const g = [...document.querySelectorAll('#fx .grp h5')].find(h5 => I18N.source(h5).includes(name)); g && g.scrollIntoView({ block: 'start' }); }
function setTextAnim(a) { const ts = selected().filter(c => c.type === 'title'); if (!ts.length) return toast('Select a title clip'); ts.forEach(c => c.props.anim = a); commit('Text animation'); renderFx(); drawFrame(); }
async function clipVolumeDialog() {
  const cs = selected().filter(hasAudioOf); if (!cs.length) return toast('Select an audio clip or a video clip with audio'); const c = cs[0];
  const v = await form({ title: 'Clip volume & pan', fields: [{ key: 'vol', label: 'Volume %', type: 'range', value: c.props.volume, min: 0, max: 200 }, { key: 'pan', label: 'Pan (−100 left … 100 right)', type: 'range', value: c.props.pan || 0, min: -100, max: 100 }] });
  if (!v) return; cs.forEach(x => { x.props.volume = +v.vol; delete x.kf.volume; x.props.pan = +v.pan; }); commit('Clip volume'); renderTimeline(); renderFx();
}

// =====================================================================  sequences, nesting & the sequence tab bar
function switchSequence(id) {
  if (id === PJ.activeSeq) return true; const tgt = PJ.sequences.find(s => s.id === id); if (!tgt || !tgt.clips) return false;
  pause(); const cur = PJ.sequences.find(s => s.id === PJ.activeSeq); if (cur) Object.assign(cur, liveSeqData(), { t: ST.t });
  SEQ_KEYS.forEach(k => { PJ[k] = tgt[k]; delete tgt[k]; }); PJ.activeSeq = id; ST.t = tgt.t || 0;
  ST.sel.clear(); ST.selTr = ST.selCap = null; ST.inP = ST.outP = null;
  renderAll(); renderSeqTabs(); seek(ST.t); setStatus('Editing ' + tgt.name); return true;
}
function seqUsers(id) { const out = []; PJ.sequences.forEach(s => { const sd = seqById(s.id); (sd.clips || []).forEach(c => { if (c.type === 'nest' && c.seqId === id) out.push({ seq: s, c }); }); }); return out; }
function newSequenceData(name, seq) { return { id: uid('S'), name, seq: { ...(seq || PJ.seq) }, tracks: newTracks(), clips: [], transitions: [], markers: [], captions: [], capStyle: { ...PJ.capStyle }, capBurn: true }; }
async function newSequenceDialog() {
  const v = await form({ title: 'New sequence', width: 420, fields: [{ key: 'name', label: 'Name', value: `Sequence ${String(PJ.sequences.length + 1).padStart(2, '0')}` }, { key: 'size', label: 'Frame size', type: 'select', value: `${PJ.seq.w}x${PJ.seq.h}`, options: [...new Set([`${PJ.seq.w}x${PJ.seq.h}`, ...SEQ_SIZES.map(s => s[0])])].map(sz => ({ value: sz, label: (SEQ_SIZES.find(s => s[0] === sz) || [, sz.replace('x', '×')])[1] })) }, { key: 'fps', label: 'Frame rate', type: 'select', value: String(PJ.seq.fps), options: FPS_LIST.map(String) }] });
  if (!v) return; const [w, hh] = v.size.split('x').map(Number); return newSequence(v.name || 'Sequence', { ...PJ.seq, w, h: hh, fps: +v.fps });
}
function newSequence(name, seq) { const sd = newSequenceData(name, seq); PJ.sequences.push(sd); switchSequence(sd.id); commit('New sequence'); renderSeqTabs(); return sd; }
async function renameSequence(id = PJ.activeSeq) { const s = PJ.sequences.find(x => x.id === id); if (!s) return; const v = await prompt('Rename sequence', 'Name', s.name); if (!v) return; s.name = v; commit('Rename sequence'); renderSeqTabs(); renderTimeline(); }
function duplicateSequence(id = PJ.activeSeq) {
  const src = seqById(id); if (!src) return; const sd = JSON.parse(JSON.stringify({ ...src, id: undefined, t: undefined })); sd.id = uid('S'); sd.name = src.name + ' copy';
  const remap = {}; sd.clips.forEach(c => { const n = uid('c'); remap[c.id] = n; c.id = n; }); sd.transitions.forEach(tr => { tr.id = uid('t'); if (tr.a) tr.a = remap[tr.a]; if (tr.b) tr.b = remap[tr.b]; });
  PJ.sequences.push(sd); commit('Duplicate sequence'); renderSeqTabs(); return sd;
}
function deleteSequence(id = PJ.activeSeq) {
  if (PJ.sequences.length < 2) return toast('A project needs at least one sequence'); const users = seqUsers(id); if (users.length) return toast(`This sequence is nested in ${users.map(u => u.seq.name).join(', ')} — delete those nest clips first`, 'err', 6000);
  if (id === PJ.activeSeq) switchSequence(PJ.sequences.find(s => s.id !== id).id); PJ.sequences = PJ.sequences.filter(s => s.id !== id); commit('Delete sequence'); renderSeqTabs();
}
// turns the selected clips into one nested-sequence clip (Premiere's Nest)
function nestSelected(name) {
  const sel = selected(); if (!sel.length) return toast('Select the clips to nest');
  const ids = new Set(sel.map(c => c.id)); const t0 = Math.min(...sel.map(c => c.start)), t1 = Math.max(...sel.map(cEnd));
  const trs = PJ.transitions.filter(tr => (tr.a ? ids.has(tr.a) : true) && (tr.b ? ids.has(tr.b) : true));
  const n = PJ.sequences.filter(s => /^Nested sequence/.test(s.name)).length + 1;
  const sd = { id: uid('S'), name: typeof name === 'string' && name ? name : `Nested sequence ${String(n).padStart(2, '0')}`, seq: { ...PJ.seq }, tracks: PJ.tracks.map(t => ({ ...t, muted: false, hidden: false, locked: false, voice: t.voice })), clips: sel.map(c => { c.start -= t0; c.link = c.link && sel.filter(o => o.link === c.link).length > 1 ? c.link : null; return c; }), transitions: trs, markers: [], captions: [], capStyle: { ...PJ.capStyle }, capBurn: false };
  PJ.clips = PJ.clips.filter(c => !ids.has(c.id)); PJ.transitions = PJ.transitions.filter(tr => !trs.includes(tr)); PJ.sequences.push(sd);
  const order = PJ.tracks.map(t => t.id); const vis = sel.filter(isVisual);
  const track = (vis.length ? vis : sel).map(c => c.track).sort((a, b) => vis.length ? order.indexOf(b) - order.indexOf(a) : order.indexOf(a) - order.indexOf(b))[0];
  const c = newClip('nest', track, t0, t1 - t0, { name: sd.name }); c.seqId = sd.id; if (!vis.length) c.props.audioOnly = true;
  placeClip(c, 'overwrite'); select([c.id]); commit('Nest'); renderSeqTabs(); drawFrame(); toast(`Nested ${sel.length} clip(s) into “${sd.name}” — double-click it to edit its contents`, 'ok', 5000); return c;
}
function openNest(c) { c = c || selected().find(x => x.type === 'nest'); if (!c) return toast('Select a nested sequence clip'); if (!switchSequence(c.seqId)) toast('The nested sequence is missing', 'err'); }
function matchNestLength(c) { c = c || selected().find(x => x.type === 'nest'); if (!c) return; c.out = Math.max(c.in + 1 / PJ.seq.fps, nestDur(c)); overwrite(c); commit('Match nest length'); renderTimeline(); drawFrame(); }
function renderSeqTabs() {
  const bar = $('#seqTabs'); if (!bar) return; bar.innerHTML = '';
  const used = new Set(); PJ.sequences.forEach(s => (seqById(s.id).clips || []).forEach(c => { if (c.type === 'nest') used.add(c.seqId); }));
  PJ.sequences.forEach(s => {
    const t = h('div', { class: 'seq-tab' + (s.id === PJ.activeSeq ? ' on' : ''), 'data-id': s.id, title: used.has(s.id) ? 'Nested sequence (used inside another sequence)' : 'Sequence' }, h('span', { class: 'ic' }, used.has(s.id) ? '⧉' : '▤'), h('span', { class: 'nm' }, s.name));
    t.onclick = () => switchSequence(s.id); t.ondblclick = () => renameSequence(s.id);
    t.oncontextmenu = e => contextMenu(e, [{ label: 'Open', action: () => switchSequence(s.id) }, { label: 'Rename…', action: () => renameSequence(s.id) }, { label: 'Duplicate', action: () => duplicateSequence(s.id) }, { label: 'Insert into active sequence as nest', disabled: s.id === PJ.activeSeq, action: () => insertSequenceAsNest(s.id) }, '-', { label: 'Delete sequence', action: () => deleteSequence(s.id), disabled: PJ.sequences.length < 2 }]);
    bar.append(t);
  });
  bar.append(h('button', { class: 'seq-add', 'data-tip': 'New sequence', onclick: newSequenceDialog }, '+'));
}
function insertSequenceAsNest(id, at = ST.t) {
  if (seqContains(id, PJ.activeSeq)) return toast('That would nest a sequence inside itself', 'err'); const sd = seqById(id); if (!sd) return;
  const d = withSeq(sd, () => seqDuration()) || 5; const c = newClip('nest', freeTrack('video', at, d, 'V1'), at, d, { name: sd.name }); c.seqId = id; placeClip(c, ST.editMode); select([c.id]); commit('Insert nested sequence'); renderSeqTabs(); drawFrame(); return c;
}
