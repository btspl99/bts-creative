// BTS Video — core: project model, helpers, history, media import, project files and autosave.
// The video app is split into classic scripts that share one global scope:
//   fx.js (effects engine) → captions.js → core.js → render.js → timeline.js → panels.js → export.js → app.js (menus & boot)
'use strict';
const { $, h, icon, toast, modal, form, prompt, confirm, contextMenu, clamp, fmtTime } = UI;

// =====================================================================  project model
let uidN = 1; const uid = p => p + (uidN++) + Math.random().toString(36).slice(2, 5);
const newTracks = () => [{ id: 'V3', kind: 'video' }, { id: 'V2', kind: 'video' }, { id: 'V1', kind: 'video' }, { id: 'A1', kind: 'audio' }, { id: 'A2', kind: 'audio' }, { id: 'A3', kind: 'audio' }].map(t => ({ ...t, muted: false, hidden: false, locked: false }));
const PJ = {
  name: 'Untitled project', path: null, dirty: false,
  seq: { w: 1920, h: 1080, fps: 30, bg: '#000000' },
  media: [],        // {id,name,path,url,kind,dur,w,h,hasAudio,thumb,strip,peaks,missing,proxy,lowres}
  tracks: newTracks(),
  clips: [],        // {id,type,mediaId,track,start,in,out,name,props,fx:[],kf:{},link}
  transitions: [],  // {id,track,a,b,kind,dur}
  markers: [],      // {id,t,label,color}
  captions: [],     // {id,start,end,text}
  capStyle: { ...VCAP.DEFAULT_STYLE }, capBurn: true,
  sequences: [{ id: 'S1', name: 'Sequence 01' }], activeSeq: 'S1', // the active sequence's data lives in the top-level fields above
  censor: { words: [], on: true, bleep: false, estimate: true },
};
const ST = { t: 0, playing: false, rate: 1, pps: 60, tool: 'select', snap: true, sel: new Set(), selTr: null, selCap: null, ffmpeg: false, safe: false, editMode: 'overwrite', inP: null, outP: null, rs: 1, useProxies: false, binSel: null, binQuery: '', binKind: 'all', fxFocus: null, linkedSel: true };
const PREFS = Object.assign({ imgDur: 5, trDur: 1, autosave: 60, collapsed: ['Quick adjust'] }, (() => { try { return JSON.parse(localStorage.getItem('btsvid.prefs') || '{}'); } catch { return {}; } })());
const savePrefs = () => { try { localStorage.setItem('btsvid.prefs', JSON.stringify(PREFS)); } catch { } };

const mediaById = id => PJ.media.find(m => m.id === id);
const clipById = id => PJ.clips.find(c => c.id === id);
const trackById = id => PJ.tracks.find(t => t.id === id);
const spd = c => (c.props && c.props.speed) || 1;
const tlDur = c => (c.out - c.in) / spd(c);
const cEnd = c => c.start + tlDur(c);
const dur = tlDur, end = cEnd;
const seqDuration = () => PJ.clips.reduce((m, c) => Math.max(m, cEnd(c)), 0);
const srcTime = (c, t) => (c.props.freeze != null ? c.props.freeze : c.in + (t - c.start) * spd(c));
const fileUrl = p => (p.startsWith('/') ? 'file://' : 'file:///') + encodeURI(p.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F');
const isVisual = c => c.type !== 'audio' && !(c.type === 'nest' && c.props?.audioOnly);
const hasAudioOf = c => c.type === 'audio' || (c.type === 'video' && !!mediaById(c.mediaId)?.hasAudio && !c.props.detached && c.props.freeze == null) || (c.type === 'nest' && !c.props.detached && nestHasAudio(c));
const ANIM_KEYS = ['x', 'y', 'scale', 'rotation', 'opacity', 'cropL', 'cropR', 'cropT', 'cropB', 'volume'];
const defaultProps = type => ({
  x: 0, y: 0, scale: 100, rotation: 0, opacity: 100, volume: 100, pan: 0, fadeIn: 0, fadeOut: 0,
  cropL: 0, cropR: 0, cropT: 0, cropB: 0, fit: 'fit', bgFill: 'none', speed: 1, freeze: null, detached: false,
  brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, grayscale: 0, sepia: 0,
  lu: { ...VFX.LU_DEFAULT }, normalize: false, denoise: false, voice: false,
  ...(type === 'title' ? { text: 'Your title', font: 'Segoe UI', size: 96, color: '#ffffff', weight: 700, italic: false, align: 'center', box: false, boxColor: '#000000', boxOpacity: 60, shadow: true, shadowColor: '#000000', anim: 'fade', outline: 0, outlineColor: '#000000', style: '', accent: '#9a7bff', spacing: 0, lineH: 1.2, count: 5 } : {}),
  ...(type === 'color' ? { color: '#1d4ed8', grad: 'none', color2: '#9333ea', angle: 135 } : {}),
  ...(type === 'shape' ? { shape: 'rect', fill: '#9a7bff', stroke: '#ffffff', strokeW: 0, w: 420, h: 260, radius: 24, text: '⭐' } : {}),
});
function evalProps(c, lt) {
  const P = { ...c.props }; const kf = c.kf;
  if (kf) for (const k in kf) { if (k.includes(':')) continue; const v = VFX.evalKf(kf[k], lt); if (v !== undefined) P[k] = v; }
  return P;
}
function evalFx(c, lt) {
  if (!c.fx || !c.fx.length) return [];
  const kf = c.kf || {};
  return c.fx.map(f => { let g = f; for (const k in kf) { if (!k.startsWith('fx:' + f.id + ':')) continue; if (g === f) g = { ...f }; g[k.split(':')[2]] = VFX.evalKf(kf[k], lt); } return g; });
}
function fadeK(P, lt, D) { if (lt < 0 || lt > D) return 1; let a = 1; if (P.fadeIn && lt < P.fadeIn) a *= clamp(lt / P.fadeIn, 0, 1); if (P.fadeOut && lt > D - P.fadeOut) a *= clamp((D - lt) / P.fadeOut, 0, 1); return a; }
const tc = s => { const f = PJ.seq.fps; s = Math.max(0, s); const fr = Math.floor(s * f + 1e-6); const hh = Math.floor(fr / (3600 * f)), mm = Math.floor(fr / (60 * f)) % 60, ss = Math.floor(fr / f) % 60, ff = fr % f; return [hh, mm, ss, ff].map(v => String(v).padStart(2, '0')).join(':'); };
const frameSnap = t => Math.round(t * PJ.seq.fps) / PJ.seq.fps;
function setStatus(s) { const el = $('#stInfo'); if (el) el.textContent = s; }

// =====================================================================  sequences & nesting
// Every sequence has {id, name, seq, tracks, clips, transitions, markers, captions, capStyle, capBurn}. The ACTIVE
// sequence's data lives in the top-level PJ fields (so all editing code works unchanged); the others are stored in PJ.sequences.
const SEQ_KEYS = ['seq', 'tracks', 'clips', 'transitions', 'markers', 'captions', 'capStyle', 'capBurn'];
function liveSeqData() { const o = {}; SEQ_KEYS.forEach(k => o[k] = PJ[k]); return o; }
function seqById(id) { const s = PJ.sequences.find(x => x.id === id); if (!s) return null; return id === PJ.activeSeq ? Object.assign({ id: s.id, name: s.name }, liveSeqData()) : s; }
// Temporarily make another sequence's data the "current" one (synchronous only) — used to render / analyse nested sequences.
let seqDepth = 0;
function withSeq(sd, fn) {
  if (!sd || sd.id === PJ.activeSeq && seqDepth === 0) return fn();
  const save = liveSeqData(); SEQ_KEYS.forEach(k => { if (sd[k] !== undefined) PJ[k] = sd[k]; }); seqDepth++;
  try { return fn(); } finally { seqDepth--; Object.assign(PJ, save); }
}
const nestSeq = c => c && c.type === 'nest' ? seqById(c.seqId) : null;
const nestDur = c => { const sd = nestSeq(c); return sd ? withSeq(sd, () => PJ.clips.reduce((m, x) => Math.max(m, x.start + (x.out - x.in) / ((x.props && x.props.speed) || 1)), 0)) : 0; };
function nestHasAudio(c, depth = 0) { const sd = nestSeq(c); if (!sd || depth > 6) return false; return withSeq(sd, () => PJ.clips.some(x => x.type === 'audio' || (x.type === 'video' && !!mediaById(x.mediaId)?.hasAudio && !x.props.detached && x.props.freeze == null) || (x.type === 'nest' && nestHasAudio(x, depth + 1)))); }
// true when sequence `inner` (or anything nested inside it) is `outer` — nesting it would create a loop
function seqContains(innerId, outerId, depth = 0) { if (innerId === outerId) return true; if (depth > 8) return true; const sd = seqById(innerId); if (!sd) return false; return sd.clips.some(x => x.type === 'nest' && seqContains(x.seqId, outerId, depth + 1)); }

// =====================================================================  transitions model
function trInfo(tr) {
  const A = tr.a ? clipById(tr.a) : null, B = tr.b ? clipById(tr.b) : null;
  if (!A && !B) return null;
  if (A && B) { const cut = B.start; return { tr, A, B, cut, t0: cut - tr.dur / 2, t1: cut + tr.dur / 2 }; }
  if (B) { const cut = B.start; return { tr, A, B, cut, t0: cut, t1: cut + Math.min(tr.dur, tlDur(B)) }; }
  const cut = cEnd(A); return { tr, A, B, cut, t0: cut - Math.min(tr.dur, tlDur(A)), t1: cut };
}
function fixTransitions() {
  const seen = new Set();
  PJ.transitions = PJ.transitions.filter(tr => {
    const A = tr.a && clipById(tr.a), B = tr.b && clipById(tr.b);
    if (tr.a && !A) return false; if (tr.b && !B) return false; if (!A && !B) return false;
    if (A && A.track !== tr.track) return false; if (B && B.track !== tr.track) return false;
    if (A && B && Math.abs(cEnd(A) - B.start) > 1e-3) return false;
    const key = (tr.a || '-') + '|' + (tr.b || '-'); if (seen.has(key)) return false; seen.add(key);
    const maxD = A && B ? 2 * Math.min(tlDur(A), tlDur(B)) : tlDur(A || B); tr.dur = clamp(tr.dur, 1 / PJ.seq.fps, Math.max(1 / PJ.seq.fps, maxD));
    return true;
  });
  // one-sided transitions become two-sided when a neighbour now touches them
  PJ.transitions.forEach(tr => { if (tr.a && tr.b) return; const c = clipById(tr.a || tr.b); if (!c) return;
    const nb = tr.b ? PJ.clips.find(o => o.track === c.track && o !== c && Math.abs(cEnd(o) - c.start) < 1e-3) : PJ.clips.find(o => o.track === c.track && o !== c && Math.abs(o.start - cEnd(c)) < 1e-3);
    if (nb && !PJ.transitions.some(o => o !== tr && (tr.b ? o.b === c.id : o.a === c.id))) { if (tr.b) tr.a = nb.id; else tr.b = nb.id; } });
}

// =====================================================================  history
let hist = [], hi = -1;
const docState = () => ({ seq: PJ.seq, tracks: PJ.tracks, clips: PJ.clips, transitions: PJ.transitions, markers: PJ.markers, captions: PJ.captions, capStyle: PJ.capStyle, capBurn: PJ.capBurn, activeSeq: PJ.activeSeq, sequences: PJ.sequences.map(s => s.id === PJ.activeSeq ? { id: s.id, name: s.name } : s), censor: PJ.censor });
const snapshot = () => JSON.stringify(docState());
function commit(label) {
  fixTransitions();
  hist = hist.slice(0, hi + 1); hist.push({ label, s: snapshot(), at: Date.now() }); if (hist.length > 200) hist.shift(); hi = hist.length - 1;
  if (hist.length > 1) markDirty();
  if (typeof renderHistory === 'function') renderHistory();
}
let cdT = null; function commitDebounced(l) { clearTimeout(cdT); cdT = setTimeout(() => commit(l), 450); }
function markDirty() { PJ.dirty = true; UI.setDocTitle(PJ.name + ' •', 'BTS Video'); }
function restore(s) {
  const d = JSON.parse(s); Object.assign(PJ, { seq: d.seq, tracks: d.tracks, clips: d.clips, transitions: d.transitions || [], markers: d.markers || [], captions: d.captions || [], capStyle: d.capStyle || { ...VCAP.DEFAULT_STYLE }, capBurn: d.capBurn !== false });
  if (d.sequences) { PJ.sequences = d.sequences; PJ.activeSeq = d.activeSeq; } if (d.censor) PJ.censor = d.censor;
  [...ST.sel].forEach(id => { if (!clipById(id)) ST.sel.delete(id); }); if (ST.selTr && !PJ.transitions.some(t => t.id === ST.selTr)) ST.selTr = null; if (ST.selCap && !PJ.captions.some(c => c.id === ST.selCap)) ST.selCap = null;
  layoutMonitor(); renderTimeline(); renderFx(); renderLeft(); if (typeof renderOptions === 'function') renderOptions(); if (typeof renderSeqTabs === 'function') renderSeqTabs(); syncMedia(false); drawFrame();
}
function undo() { if (hi > 0) { hi--; restore(hist[hi].s); renderHistory(); } }
function redo() { if (hi < hist.length - 1) { hi++; restore(hist[hi].s); renderHistory(); } }
function jumpHistory(i) { if (i >= 0 && i < hist.length && i !== hi) { hi = i; restore(hist[i].s); renderHistory(); } }

// =====================================================================  migration of older projects
function migrateClip(c) {
  c.props = { ...defaultProps(c.type), ...(c.props || {}) }; c.props.lu = { ...VFX.LU_DEFAULT, ...(c.props.lu || {}) };
  c.fx = c.fx || []; c.kf = c.kf || {};
  if (c.type === 'title' && c.props.ty) { c.props.y = (c.props.y || 0) + c.props.ty; delete c.props.ty; }
  const p = c.props;
  if (p.trIn && p.trIn !== 'none') PJ.transitions.push({ id: uid('t'), track: c.track, a: null, b: c.id, kind: VFX.LEGACY_TR[p.trIn] || p.trIn, dur: p.trDur || 1 });
  if (p.trOut && p.trOut !== 'none') PJ.transitions.push({ id: uid('t'), track: c.track, a: c.id, b: null, kind: VFX.LEGACY_TR[p.trOut] || p.trOut, dur: p.trOutDur || 1 });
  delete p.trIn; delete p.trOut; delete p.trDur; delete p.trOutDur; delete p.ty;
  return c;
}

// =====================================================================  media import
async function importDialog() { const fs = await bts.fs.open({ multi: true, filters: [{ name: 'Media', extensions: ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'opus', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'] }] }); if (!fs) return; for (const f of fs) await importPath(f.path, f.name); }
const kindOf = n => /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(n) ? 'audio' : /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(n) ? 'image' : 'video';
async function importPath(path, name, existingId) {
  name = name || path.split(/[\\/]/).pop();
  const m = existingId ? mediaById(existingId) : { id: uid('m'), name, path, kind: kindOf(name), dur: 5, w: 0, h: 0, hasAudio: false };
  m.path = path; m.url = fileUrl(m.proxy || path); m.missing = false;
  if (!existingId) PJ.media.push(m);
  setStatus(`Importing ${name}…`);
  try {
    if ((m.kind === 'image' || m.anim) && ST.ffmpeg && /\.(gif|a?png|webp)$/i.test(name)) await transcodeAnimated(m);
    if (m.kind === 'image') { const im = new Image(); im.src = m.url; await im.decode(); m.w = im.naturalWidth; m.h = im.naturalHeight; m.dur = PREFS.imgDur; m.el = im; m.thumb = thumbOf(im, im.naturalWidth || 160, im.naturalHeight || 90); }
    else {
      if (ST.ffmpeg) { const info = await bts.ffmpeg.probe(m.anim ? m.proxy : path); if (info) { const d = info.match(/Duration: (\d+):(\d+):([\d.]+)/); if (d) m.dur = +d[1] * 3600 + +d[2] * 60 + +d[3]; m.hasAudio = /Stream #.*Audio:/.test(info); const v = info.match(/Stream #.*Video:.*?(\d{2,5})x(\d{2,5})/); if (v && !/Video: (png|mjpeg).*attached pic/.test(info)) { m.w = +v[1]; m.h = +v[2]; } } }
      const el = document.createElement(m.kind === 'audio' ? 'audio' : 'video'); el.preload = 'auto'; el.src = m.url; el.muted = true;
      const ok = await new Promise(res => { el.onloadeddata = () => res(true); el.onerror = () => res(false); setTimeout(() => res(el.readyState >= 1), 15000); });
      if (!ok) {
        if (ST.ffmpeg && m.kind === 'video') await makeProxy(m);
        else if (ST.ffmpeg && m.kind === 'audio') await makeAudioProxy(m);
        else throw new Error('This format cannot be played. Convert it to MP4 (H.264) or WebM.');
      } else {
        if (isFinite(el.duration) && el.duration > 0) m.dur = el.duration;
        if (m.kind === 'video') { m.w = el.videoWidth || m.w; m.h = el.videoHeight || m.h; if (!ST.ffmpeg) m.hasAudio = true; await makeStrip(m, el); }
      }
      if (m.kind === 'audio' || m.hasAudio) await makePeaks(m);
    }
    m.ready = true;
  } catch (e) { console.error(e); m.missing = true; toast(`Could not import ${name}: ${e.message}`, 'err', 6000); }
  setStatus('Ready'); renderBin(); renderTimeline(); markDirty(); return m;
}
// Animated GIF / APNG / WebP → a temporary VP9 WebM that keeps the alpha channel, so it plays (and exports) as a moving clip.
async function transcodeAnimated(m) {
  const r = await bts.ffmpeg.run(['-hide_banner', '-i', m.path, '-map', '0:v:0', '-f', 'null', '-']);
  const fr = [...String(r.log || '').matchAll(/frame=\s*(\d+)/g)].pop(); const n = fr ? +fr[1] : 0;
  if (n < 2) { if (m.anim) { m.anim = false; m.alpha = false; m.kind = 'image'; } return false; }
  setStatus(`Converting animated ${m.name} (${n} frames)…`);
  const out = (await bts.ffmpeg.tmpDir()).replace(/\\/g, '/') + `/${m.id}-anim-${Date.now().toString(36)}.webm`;
  const id = await bts.ffmpeg.start(['-i', m.path, '-an', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2:color=black@0,format=yuva420p', '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-auto-alt-ref', '0', '-b:v', '0', '-crf', '22', '-deadline', 'good', '-cpu-used', '4', '-row-mt', '1', out]);
  const res = await bts.ffmpeg.end(id); if (!res.ok) throw new Error('Could not convert the animation: ' + res.log.split('\n').filter(Boolean).slice(-1)[0]);
  Object.assign(m, { kind: 'video', anim: true, alpha: true, frames: n, proxy: out, url: fileUrl(out), hasAudio: false }); return true;
}
async function makeProxy(m) {
  setStatus(`Creating playable proxy for ${m.name}…`);
  const dir = await bts.ffmpeg.tmpDir(); const out = `${dir}/${m.id}-proxy.mp4`.replace(/\\/g, '/');
  const id = await bts.ffmpeg.start(['-i', m.path, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', out]);
  const r = await bts.ffmpeg.end(id); if (!r.ok) throw new Error('Unsupported media format');
  m.proxy = out; m.url = fileUrl(out);
  const el = document.createElement('video'); el.src = m.url; el.muted = true; await new Promise(res => { el.onloadeddata = res; el.onerror = res; });
  if (isFinite(el.duration)) m.dur = el.duration; m.w = el.videoWidth; m.h = el.videoHeight; await makeStrip(m, el);
}
async function makeAudioProxy(m) {
  const dir = await bts.ffmpeg.tmpDir(); const out = `${dir}/${m.id}-proxy.wav`.replace(/\\/g, '/');
  const id = await bts.ffmpeg.start(['-i', m.path, '-vn', '-c:a', 'pcm_s16le', out]); const r = await bts.ffmpeg.end(id); if (!r.ok) throw new Error('Unsupported audio format');
  m.proxy = out; m.url = fileUrl(out);
}
function thumbOf(src, w, hh, tw = 160) { const c = document.createElement('canvas'); c.width = tw; c.height = Math.round(tw * hh / w) || 90; c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.7); }
async function makeStrip(m, el) {
  const seekTo = t => new Promise(r => { const done = () => { el.removeEventListener('seeked', done); r(); }; el.addEventListener('seeked', done); el.currentTime = t; setTimeout(done, 3000); });
  const n = Math.min(8, Math.max(1, Math.ceil(m.dur / 4))); const tw = 96, th = Math.round(tw * (el.videoHeight || 9) / (el.videoWidth || 16));
  const strip = document.createElement('canvas'); strip.width = tw * n; strip.height = th; const sx = strip.getContext('2d');
  for (let i = 0; i < n; i++) { await seekTo(Math.min(m.dur - 0.05, (i + 0.5) * m.dur / n)); sx.drawImage(el, i * tw, 0, tw, th); if (i === 0) m.thumb = thumbOf(el, el.videoWidth || 16, el.videoHeight || 9); }
  m.strip = strip.toDataURL('image/jpeg', 0.6); m.stripN = n;
}
async function makePeaks(m) {
  try {
    const buf = await (await fetch(m.url)).arrayBuffer(); if (buf.byteLength > 300e6) return;
    const ac = new OfflineAudioContext(1, 44100, 44100); const ab = await ac.decodeAudioData(buf); const d = ab.getChannelData(0);
    const N = Math.min(20000, Math.ceil(ab.duration * 50)); const step = Math.max(1, Math.floor(d.length / N)); const peaks = new Float32Array(N);
    for (let i = 0; i < N; i++) { let mx = 0; for (let j = i * step; j < (i + 1) * step && j < d.length; j += 4) { const v = Math.abs(d[j]); if (v > mx) mx = v; } peaks[i] = mx; }
    m.peaks = peaks; m.peakMax = peaks.reduce((a, b) => Math.max(a, b), 0); m.hasAudio = true; renderTimelineSoon();
  } catch (e) { if (m.kind === 'video' && !ST.ffmpeg) m.hasAudio = false; }
}
// level (0..1) of a media's audio around source time t
function peakAt(m, t) { if (!m || !m.peaks) return 0; const i = Math.floor(t / m.dur * m.peaks.length); return m.peaks[clamp(i, 0, m.peaks.length - 1)] || 0; }
async function relink(m) { const f = await bts.fs.open({}); if (!f) return; await importPath(f[0].path, m.name, m.id); els.forEach((e, k) => { if (clipById(k)?.mediaId === m.id) els.delete(k); }); renderTimeline(); }
function removeMedia(m) { if (PJ.clips.some(c => c.mediaId === m.id) && !window.confirm('This media is used in the timeline. Remove it and its clips?')) return; PJ.clips = PJ.clips.filter(c => c.mediaId !== m.id); PJ.media = PJ.media.filter(x => x !== m); commit('Remove media'); renderBin(); renderTimeline(); drawFrame(); }

// Image sequence → video (via FFmpeg)
async function importImageSequence() {
  if (!ST.ffmpeg) return toast('Image sequences need FFmpeg', 'err');
  const f = await bts.fs.open({ filters: [{ name: 'First image of the sequence', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'webp'] }] }); if (!f) return;
  if (!/\d+\.\w+$/.test(f[0].path)) return toast('The file name must end with a frame number, e.g. shot_0001.png', 'err', 6000);
  const v = await form({ title: 'Import image sequence', fields: [{ key: 'fps', label: 'Frame rate', type: 'select', value: String(PJ.seq.fps), options: ['12', '15', '24', '25', '30', '60'] }] }); if (!v) return;
  return importImageSequencePath(f[0].path, v.fps);
}
async function importImageSequencePath(p, fps) {
  const nm = p.split(/[\\/]/).pop(); const mm = nm.match(/^(.*?)(\d+)(\.\w+)$/); if (!mm) return null; const v = { fps: String(fps) };
  const dir = p.slice(0, p.length - nm.length); const pattern = dir + mm[1] + '%0' + mm[2].length + 'd' + mm[3];
  const tmp = (await bts.ffmpeg.tmpDir()).replace(/\\/g, '/') + `/${uid('seq')}.mp4`;
  setStatus('Building image sequence…');
  const id = await bts.ffmpeg.start(['-framerate', v.fps, '-start_number', String(+mm[2]), '-i', pattern, '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', tmp]);
  const r = await bts.ffmpeg.end(id); if (!r.ok) { setStatus('Ready'); return toast('Could not build the sequence: ' + r.log.split('\n').filter(Boolean).slice(-1)[0], 'err', 7000); }
  return importPath(tmp, mm[1].replace(/[_\-. ]+$/, '') + ' (sequence).mp4');
}
// Low-res proxies for smoother preview (export always uses originals)
async function createProxies(list) {
  if (!ST.ffmpeg) return toast('Proxies need FFmpeg', 'err');
  const vids = (list || PJ.media).filter(m => m.kind === 'video' && !m.missing && !m.lowres); if (!vids.length) return toast('No video media need proxies');
  const dir = (await bts.ffmpeg.tmpDir()).replace(/\\/g, '/');
  for (const [i, m] of vids.entries()) {
    setStatus(`Creating proxy ${i + 1}/${vids.length}: ${m.name}`);
    const out = `${dir}/${m.id}-lowres.mp4`; const id = await bts.ffmpeg.start(['-i', m.proxy || m.path, '-vf', 'scale=-2:min(540\\,ih)', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-g', '15', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', out]);
    const r = await bts.ffmpeg.end(id); if (r.ok) m.lowres = out;
  }
  setStatus('Ready'); ST.useProxies = true; resetElements(); renderBin(); drawFrame(); toast(`Proxies ready — preview now uses low-res copies (View › Use proxies).`, 'ok', 5000);
}

// =====================================================================  project files & autosave
function projectJSON() {
  return JSON.stringify({ app: 'BTS Video', v: 2, ...docState(), media: PJ.media.map(m => ({ id: m.id, name: m.name, path: m.path, kind: m.kind, dur: m.dur, w: m.w, h: m.h, hasAudio: m.hasAudio, gen: m.gen, anim: m.anim, alpha: m.alpha })) }, null, 1);
}
async function saveProject(as) {
  const data = new TextEncoder().encode(projectJSON());
  let p = !as && PJ.path; if (p) await bts.fs.write({ path: p, data }); else { p = await bts.fs.saveAs({ data, defaultPath: PJ.name.replace(/\.btsvid$/, '') + '.btsvid', filters: [{ name: 'BTS Video project', extensions: ['btsvid'] }] }); if (!p) return; }
  PJ.path = p; PJ.name = p.split(/[\\/]/).pop(); PJ.dirty = false; UI.setDocTitle(PJ.name, 'BTS Video'); clearAutosave(); toast('Saved ' + PJ.name, 'ok');
}
async function openProject() { const f = await bts.fs.open({ filters: [{ name: 'BTS Video project', extensions: ['btsvid'] }] }); if (f) loadProject(f[0]); }
async function loadProject(f, fromJSON) {
  try {
    const j = fromJSON || JSON.parse(new TextDecoder().decode(new Uint8Array(f.data))); pause(); resetElements();
    PJ.seq = j.seq; PJ.tracks = j.tracks; PJ.transitions = j.transitions || []; PJ.markers = j.markers || []; PJ.captions = j.captions || []; PJ.capStyle = { ...VCAP.DEFAULT_STYLE, ...(j.capStyle || {}) }; PJ.capBurn = j.capBurn !== false;
    PJ.clips = (j.clips || []).map(migrateClip); fixTransitions();
    PJ.sequences = j.sequences && j.sequences.length ? j.sequences : [{ id: 'S1', name: 'Sequence 01' }]; PJ.activeSeq = j.activeSeq && PJ.sequences.some(x => x.id === j.activeSeq) ? j.activeSeq : PJ.sequences[0].id;
    PJ.censor = { words: [], on: true, bleep: false, estimate: true, ...(j.censor || {}) };
    PJ.sequences.forEach(sd => { if (sd.id === PJ.activeSeq || !sd.clips) return; sd.transitions = sd.transitions || []; sd.markers = sd.markers || []; sd.captions = sd.captions || []; sd.capStyle = { ...VCAP.DEFAULT_STYLE, ...(sd.capStyle || {}) }; if (sd.capBurn === undefined) sd.capBurn = true; withSeq(sd, () => { PJ.clips = PJ.clips.map(migrateClip); sd.clips = PJ.clips; fixTransitions(); sd.transitions = PJ.transitions; }); });
    PJ.media = j.media.map(m => ({ ...m, url: fileUrl(m.path) })); PJ.path = f ? f.path : null; PJ.name = f ? f.name : (j.name || 'Recovered project'); ST.sel.clear(); ST.selTr = null; ST.selCap = null; ST.t = 0;
    renderAll(); for (const m of PJ.media) await importPath(m.path, m.name, m.id);
    hist = []; hi = -1; commit('Open'); PJ.dirty = !f; UI.setDocTitle(PJ.name + (f ? '' : ' •'), 'BTS Video'); if (f && f.path) bts.recent.add(f.path);
    const miss = PJ.media.filter(m => m.missing); if (miss.length) toast(`${miss.length} media file(s) are offline. Right-click them in the Project panel to relink.`, 'err', 7000);
  } catch (e) { console.error(e); toast('Could not open project: ' + e.message, 'err'); }
}
// Autosave is keyed per WINDOW (an id kept in sessionStorage, so it survives a reload of the same window but is unique per
// window). Each window writes a heartbeat; on start-up a window only offers to recover autosaves whose owner window is gone.
const WIN_ID = (() => { try { let id = sessionStorage.getItem('btsvid.win'); if (!id) { id = 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); sessionStorage.setItem('btsvid.win', id); } return id; } catch { return 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); } })();
const AUTOSAVE_PREFIX = 'btsvid.autosave.', ALIVE_PREFIX = 'btsvid.alive.', LEGACY_AUTOSAVE = 'btsvid.autosave';
const autosaveKey = () => AUTOSAVE_PREFIX + WIN_ID;
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
const lsDel = k => { try { localStorage.removeItem(k); } catch { } };
function heartbeat() { lsSet(ALIVE_PREFIX + WIN_ID, String(Date.now())); }
heartbeat(); setInterval(heartbeat, 5000);
window.addEventListener('beforeunload', () => lsDel(ALIVE_PREFIX + WIN_ID));
function autosaveNow() {
  if (!PJ.clips.length && !PJ.media.length && PJ.sequences.length < 2) return;
  const rec = { at: Date.now(), name: PJ.name, path: PJ.path, win: WIN_ID, data: JSON.parse(projectJSON()) };
  lsSet(autosaveKey(), JSON.stringify(rec));
  if (ST.ffmpeg) bts.ffmpeg.tmpWrite('autosave-' + (PJ.name || 'project').replace(/[^\w.-]+/g, '_').replace(/\.btsvid$/, '') + '-' + WIN_ID + '.btsvid', new TextEncoder().encode(JSON.stringify(rec.data))).catch(() => { });
  setStatus('Autosaved ' + new Date().toLocaleTimeString());
}
function clearAutosave() { lsDel(autosaveKey()); }
function getAutosave() { try { return JSON.parse(lsGet(autosaveKey()) || 'null'); } catch { return null; } }
// autosaves left behind by windows that are no longer running (crash / power loss), newest first
function orphanAutosaves() {
  const out = []; let keys = []; try { keys = Object.keys(localStorage); } catch { }
  keys.forEach(k => {
    if (k !== LEGACY_AUTOSAVE && !k.startsWith(AUTOSAVE_PREFIX)) return; if (k === autosaveKey() || k.endsWith('.claim')) return;
    const owner = k === LEGACY_AUTOSAVE ? null : k.slice(AUTOSAVE_PREFIX.length); const alive = owner ? +lsGet(ALIVE_PREFIX + owner) || 0 : 0;
    if (owner && Date.now() - alive < 20000) return; // that window is still open
    try { const rec = JSON.parse(lsGet(k)); if (rec && rec.data) out.push({ key: k, rec }); } catch { }
  });
  return out.sort((a, b) => b.rec.at - a.rec.at);
}
const hasRecoverable = () => !!getAutosave() || orphanAutosaves().length > 0;
async function recoverAutosave(ask = true) {
  let rec = getAutosave(), key = autosaveKey();
  if (!rec) {
    const orph = orphanAutosaves(); if (!orph.length) { if (!ask) return; return toast('No autosaved project to recover'); }
    let pick = orph[0];
    if (orph.length > 1 && ask) { const v = await form({ title: 'Recover autosaved project', width: 460, fields: [{ key: 'k', label: 'Autosaved projects from windows that closed unexpectedly', type: 'select', value: orph[0].key, options: orph.map(o => ({ value: o.key, label: `${o.rec.name} — ${new Date(o.rec.at).toLocaleString()}` })) }] }); if (!v) return; pick = orph.find(o => o.key === v.k) || orph[0]; }
    else if (ask) { const ok = await confirm('Recover project?', `An autosaved copy of “${pick.rec.name}” from ${new Date(pick.rec.at).toLocaleString()} was found. Recover it?`, 'Recover'); if (!ok) { lsDel(pick.key); return; } }
    // claim it so another window starting at the same time doesn't recover it too
    lsSet(pick.key + '.claim', WIN_ID); await UI.sleep(60); if (lsGet(pick.key + '.claim') !== WIN_ID) return; lsDel(pick.key + '.claim');
    rec = pick.rec; key = pick.key;
  } else if (ask) { const ok = await confirm('Recover project?', `An autosaved copy of “${rec.name}” from ${new Date(rec.at).toLocaleString()} was found. Recover it?`, 'Recover'); if (!ok) { clearAutosave(); return; } }
  await loadProject(rec.path ? { path: rec.path, name: rec.name } : null, rec.data); if (rec.path) { PJ.dirty = true; UI.setDocTitle(PJ.name + ' •', 'BTS Video'); }
  if (key !== autosaveKey()) { lsDel(key); autosaveNow(); } // the recovered copy now belongs to this window
  toast('Project recovered — save it to keep the changes.', 'ok', 6000);
}
