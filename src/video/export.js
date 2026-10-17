// BTS Video — export: presets, H.264 / H.265 / ProRes / GIF / MP3 / PNG / WebM, in-out range,
// audio mixing with keyframed volume, pan, normalize / noise reduction / voice enhance, baking and auto-ducking.
'use strict';
const EXPORT_PRESETS = [
  { id: 'yt1080', label: 'YouTube 1080p (H.264)', fmt: 'mp4', codec: 'h264', w: 1920, h: 1080, q: 'crf', crf: 18, abr: 192 },
  { id: 'yt4k', label: 'YouTube 4K (H.264)', fmt: 'mp4', codec: 'h264', w: 3840, h: 2160, q: 'crf', crf: 18, abr: 192 },
  { id: 'reel', label: 'Instagram Reel / Shorts 1080×1920', fmt: 'mp4', codec: 'h264', w: 1080, h: 1920, q: 'kbps', kbps: 8000, abr: 160, fpsMax: 30 },
  { id: 'whatsapp', label: 'WhatsApp-friendly (small, 720p)', fmt: 'mp4', codec: 'h264', w: 1280, h: 720, q: 'kbps', kbps: 1500, abr: 96, fpsMax: 30 },
  { id: 'twitter', label: 'Twitter / X (720p)', fmt: 'mp4', codec: 'h264', w: 1280, h: 720, q: 'kbps', kbps: 5000, abr: 128, fpsMax: 60 },
  { id: 'seq', label: 'Match sequence (H.264)', fmt: 'mp4', codec: 'h264', w: 0, h: 0, q: 'crf', crf: 20, abr: 192 },
  { id: 'hevc', label: 'High efficiency (H.265 / HEVC)', fmt: 'mp4', codec: 'h265', w: 0, h: 0, q: 'crf', crf: 23, abr: 192 },
  { id: 'prores', label: 'Master (ProRes 422 HQ .mov)', fmt: 'mov', codec: 'prores', w: 0, h: 0, q: 'crf', crf: 0, abr: 0 },
  { id: 'gif', label: 'Animated GIF', fmt: 'gif', codec: 'gif', w: 640, h: 0, q: 'crf', crf: 0, fpsMax: 15 },
  { id: 'mp3', label: 'MP3 audio only', fmt: 'mp3', codec: 'mp3', w: 0, h: 0, q: 'crf', abr: 256 },
  { id: 'png', label: 'PNG frame (current frame)', fmt: 'png', codec: 'png' },
  { id: 'pngseq', label: 'PNG image sequence', fmt: 'pngseq', codec: 'png', w: 0, h: 0 },
  { id: 'webm', label: 'WebM (VP9, built-in real-time)', fmt: 'webm', codec: 'vp9', w: 0, h: 0, q: 'kbps', kbps: 8000 },
];
let encoders = null;
async function codecSupport() {
  if (encoders) return encoders; encoders = { h265: false, prores: false };
  const probe = async args => { try { const r = await bts.ffmpeg.run(['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:d=0.1', ...args, '-f', 'null', '-']); return !!r.ok; } catch { return false; } };
  [encoders.h265, encoders.prores] = await Promise.all([probe(['-c:v', 'libx265', '-x265-params', 'log-level=none']), probe(['-c:v', 'prores_ks'])]);
  return encoders;
}
function progressModal(title) {
  const bar = h('div'), txt = h('div', { class: 'muted', style: { marginTop: '8px', fontSize: '12px' } }, 'Preparing…');
  const back = h('div', { class: 'modal-back exp' }, h('div', { class: 'modal', style: { width: '440px' } }, h('div', { class: 'm-h' }, title), h('div', { class: 'm-b' }, h('div', { class: 'progress' }, bar), txt), h('div', { class: 'm-f' }, h('button', { class: 'btn', onclick: () => { EXP.cancel = true; txt.textContent = 'Cancelling…'; } }, 'Cancel'))));
  document.body.append(back); return { set: (k, s) => { bar.style.width = Math.round(k * 100) + '%'; txt.textContent = s; }, close: () => back.remove() };
}
async function exportFrame() {
  const c = document.createElement('canvas'); c.width = PJ.seq.w; c.height = PJ.seq.h; await prepareStill(ST.t); renderAt(c.getContext('2d'), ST.t, 1);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const p = await bts.fs.saveAs({ data: await UI.blobToU8(blob), defaultPath: `frame-${tc(ST.t).replace(/:/g, '-')}.png`, filters: [{ name: 'PNG', extensions: ['png'] }] }); if (p) toast('Frame exported', 'ok');
}
// make sure the preview elements show the exact frame at t
async function prepareStill(t) { if (window.VGRADE) await VGRADE.preloadAll(); const save = ST.t; ST.t = t; syncMedia(false); ST.t = save; await seekForExport(t); }
// every video clip that is visible at t — including the ones inside nested sequences — with its source time and effective speed
function videoSourcesAt(t, depth = 0, rate = 1, out = []) {
  videoClipsAt(t).forEach(c => {
    if (c.type === 'video') out.push({ c, st: srcTime(c, t), sp: (c.props.freeze != null ? 1 : spd(c) * rate) });
    else if (c.type === 'nest' && depth < 4) { const sd = nestSeq(c); if (sd) { const tau = srcTime(c, t); withSeq(sd, () => videoSourcesAt(tau, depth + 1, rate * spd(c), out)); } }
  });
  return out;
}
async function seekForExport(t) {
  const act = videoSourcesAt(t);
  await Promise.all(act.map(({ c, st }) => new Promise(res => { const e = elFor(c); if (!e) return res(); e.pause(); const m = mediaById(c.mediaId); const target = clamp(st, 0, Math.max(0, (e.duration || m?.dur || 1e9) - 0.04)); const go = () => { if (Math.abs(e.currentTime - target) < 0.5 / PJ.seq.fps && e.readyState >= 2) return res(); const done = () => { e.removeEventListener('seeked', done); res(); }; e.addEventListener('seeked', done); e.currentTime = target; setTimeout(done, 4000); }; if (e.readyState >= 1) go(); else e.addEventListener('loadedmetadata', go, { once: true }); })));
}
function estimateSize(o, secs) {
  if (o.fmt === 'png') return 2e6; if (o.fmt === 'mp3') return o.abr * 1000 / 8 * secs;
  const W = o.W, H = o.H, fps = o.fps; let vk;
  if (o.fmt === 'gif') vk = W * H * fps * 0.45 / 1000; else if (o.fmt === 'pngseq') return W * H * 1.6 * fps * secs; else if (o.codec === 'prores') vk = W * H * fps * 4.6 / 1000; else if (o.q === 'kbps') vk = o.kbps; else { const bpp = { 16: 0.16, 18: 0.12, 20: 0.09, 23: 0.06, 26: 0.04, 28: 0.03, 30: 0.022 }; const k = Object.keys(bpp).map(Number).reduce((a, b) => Math.abs(b - o.crf) < Math.abs(a - o.crf) ? b : a); vk = W * H * fps * bpp[k] / 1000 * (o.codec === 'h265' ? 0.6 : 1); }
  return (vk + (o.abr || 0)) * 1000 / 8 * secs;
}
const fmtBytes = b => b > 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';
async function exportDialog(presetId) {
  if (!PJ.clips.length) return toast('The timeline is empty'); pause();
  const enc = ST.ffmpeg ? await codecSupport() : {};
  const presets = EXPORT_PRESETS.filter(p => ST.ffmpeg || ['webm', 'png'].includes(p.fmt)).filter(p => p.codec !== 'h265' || enc.h265).filter(p => p.codec !== 'prores' || enc.prores);
  const want = typeof presetId === 'string' && presets.some(p => p.id === presetId) ? presetId : null;
  const o = { preset: want || (ST.ffmpeg ? (PJ.seq.h > PJ.seq.w ? 'reel' : 'yt1080') : 'webm'), range: ST.inP != null && ST.outP != null ? 'io' : 'all', fit: 'fit' };
  const body = h('div', { class: 'exp-form' }); let vals = {};
  const field = (label, el) => h('label', { class: 'field' }, label, el);
  const render = () => {
    const pr = EXPORT_PRESETS.find(p => p.id === o.preset); body.innerHTML = '';
    const pSel = h('select', {}, ...presets.map(p => h('option', { value: p.id, selected: p.id === o.preset }, p.label))); pSel.onchange = () => { o.preset = pSel.value; Object.assign(o, { w: undefined, h: undefined, crf: undefined, kbps: undefined, q: undefined, codec: undefined, fps: undefined }); render(); };
    const codec = o.codec || pr.codec, q = o.q || pr.q || 'crf';
    let W = o.w ?? (pr.w || PJ.seq.w), H = o.h ?? (pr.h || (pr.w ? Math.round(pr.w * PJ.seq.h / PJ.seq.w / 2) * 2 : PJ.seq.h)); W = Math.round(W / 2) * 2; H = Math.round(H / 2) * 2;
    const fps = o.fps ?? Math.min(PJ.seq.fps, pr.fpsMax || 1000);
    const range = h('select', {}, h('option', { value: 'all', selected: o.range === 'all' }, 'Entire sequence'), h('option', { value: 'io', selected: o.range === 'io', disabled: !(ST.inP != null || ST.outP != null) }, `In to Out ${ST.inP != null || ST.outP != null ? `(${tc(ST.inP ?? 0)} → ${tc(ST.outP ?? seqDuration())})` : '— set I / O first'}`), h('option', { value: 'sel', selected: o.range === 'sel', disabled: !selected().length }, 'Selected clips')); range.onchange = () => { o.range = range.value; render(); };
    const [t0, t1] = exportRange(o.range); const secs = Math.max(0, t1 - t0);
    body.append(field('Preset', pSel));
    if (!['png', 'mp3'].includes(pr.fmt)) {
      const wi = h('input', { type: 'number', value: W, min: 16, max: 7680, step: 2 }), hi2 = h('input', { type: 'number', value: H, min: 16, max: 4320, step: 2 }); wi.onchange = () => { o.w = +wi.value; render(); }; hi2.onchange = () => { o.h = +hi2.value; render(); };
      const fpsSel = h('select', {}, ...[...new Set([12, 15, 24, 25, 30, 50, 60, PJ.seq.fps])].sort((a, b) => a - b).map(v => h('option', { value: v, selected: v === fps }, v + ' fps'))); fpsSel.onchange = () => { o.fps = +fpsSel.value; render(); };
      const fitSel = h('select', {}, h('option', { value: 'fit', selected: o.fit === 'fit' }, 'Fit (letterbox)'), h('option', { value: 'fill', selected: o.fit === 'fill' }, 'Fill (crop centre)')); fitSel.onchange = () => { o.fit = fitSel.value; render(); };
      body.append(h('div', { class: 'row' }, field('Width', wi), field('Height', hi2), field('Frame rate', fpsSel), (W / H).toFixed(3) !== (PJ.seq.w / PJ.seq.h).toFixed(3) ? field('Aspect differs', fitSel) : ''));
    }
    if (['mp4', 'mov'].includes(pr.fmt)) {
      const cSel = h('select', {}, h('option', { value: 'h264', selected: codec === 'h264' }, 'H.264 / AVC'), enc.h265 ? h('option', { value: 'h265', selected: codec === 'h265' }, 'H.265 / HEVC') : '', enc.prores ? h('option', { value: 'prores', selected: codec === 'prores' }, 'Apple ProRes 422 HQ') : ''); cSel.onchange = () => { o.codec = cSel.value; render(); };
      body.append(field('Video codec', cSel));
      if (codec !== 'prores') {
        const qSel = h('select', {}, h('option', { value: 'crf', selected: q === 'crf' }, 'Constant quality (CRF)'), h('option', { value: 'kbps', selected: q === 'kbps' }, 'Target bitrate')); qSel.onchange = () => { o.q = qSel.value; render(); };
        const crf = o.crf ?? pr.crf ?? 20, kb = o.kbps ?? pr.kbps ?? 8000;
        const qi = q === 'crf' ? h('select', {}, ...[[16, 'Best (16)'], [18, 'High (18)'], [20, 'Good (20)'], [23, 'Medium (23)'], [26, 'Small (26)'], [28, 'Smaller (28)'], [30, 'Tiny (30)']].map(([v, l]) => h('option', { value: v, selected: v === crf }, l))) : h('input', { type: 'number', value: kb, min: 200, max: 200000, step: 100 });
        qi.onchange = () => { if (q === 'crf') o.crf = +qi.value; else o.kbps = +qi.value; render(); };
        body.append(h('div', { class: 'row' }, field('Quality mode', qSel), field(q === 'crf' ? 'Quality' : 'Video kbps', qi)));
      }
    }
    if (pr.fmt === 'png') body.append(h('div', { class: 'muted' }, `Saves the frame at the playhead (${tc(ST.t)}) as a ${PJ.seq.w}×${PJ.seq.h} PNG.`));
    else body.append(field('Range', range));
    const est = { ...pr, codec, q, crf: o.crf ?? pr.crf, kbps: o.kbps ?? pr.kbps, W, H, fps };
    if (pr.fmt !== 'png') body.append(h('div', { class: 'est' }, h('span', {}, `Duration ${tc(secs)}`), h('span', {}, `Estimated size ≈ ${fmtBytes(estimateSize(est, secs))}`)));
    vals = { pr, codec, q, crf: est.crf, kbps: est.kbps, W, H, fps, t0, t1, fit: o.fit };
  };
  render();
  const r = await modal({ title: 'Export', body, width: 520, buttons: [{ label: 'Cancel', value: null }, { label: 'Export…', primary: true, value: 'ok' }] }); if (r !== 'ok') return;
  const v = vals; const fmt = v.pr.fmt;
  if (fmt === 'png') return exportFrame();
  if (v.t1 - v.t0 < 0.04) return toast('The export range is empty', 'err');
  const ext = fmt === 'pngseq' ? 'png' : fmt;
  const out = await bts.fs.pickSavePath({ defaultPath: PJ.name.replace(/\.btsvid$/, '') + (fmt === 'pngseq' ? '_frames' : '') + '.' + ext, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] }); if (!out) return;
  try { await runExport(out, v); } catch (e) { console.error(e); toast('Export failed: ' + e.message, 'err', 8000); }
  finally { EXP.on = false; document.querySelector('.modal-back.exp')?.remove(); drawFrame(); }
}
function exportRange(kind) { if (kind === 'io' && (ST.inP != null || ST.outP != null)) return [ST.inP ?? 0, ST.outP ?? seqDuration()]; if (kind === 'sel' && selected().length) return [Math.min(...selected().map(c => c.start)), Math.max(...selected().map(cEnd))]; return [0, seqDuration()]; }
async function runExport(out, v) { const fmt = v.pr.fmt; if (fmt === 'webm') return exportWebM(out, v.t0, v.t1, v.W, v.H, v.kbps || 8000); return exportFFmpeg(out, { fmt, codec: v.codec, q: v.q, crf: v.crf, kbps: v.kbps, abr: v.pr.abr || 192, W: v.W, H: v.H, fps: v.fps, fit: v.fit }, v.t0, v.t1); }

// ---------------------------------------------------------------------  frame server (sequential decode per clip)
const readers = new Map(); // clip id -> {id, s0, sp, idx, bmp}
async function framesFor(t, fps) {
  const list = videoSourcesAt(t); const act = new Map(list.map(v => [v.c.id, v]));
  for (const [cid, r] of readers) if (!act.has(cid)) { bts.ffmpeg.framesClose(r.id); r.bmp?.close?.(); readers.delete(cid); EXP.frames.delete(cid); }
  for (const [cid, v] of act) {
    const c = v.c; const m = mediaById(c.mediaId); if (!m || m.missing) continue;
    const sp = v.sp; const want = clamp(v.st, 0, Math.max(0, m.dur - 0.5 / fps));
    let r = readers.get(cid); let k = r ? Math.round((want - r.s0) * fps / r.sp) : 0;
    if (r && (Math.abs(sp - r.sp) > 1e-6 || k < r.idx || k - r.idx > fps * 4)) { bts.ffmpeg.framesClose(r.id); r.bmp?.close?.(); readers.delete(cid); r = null; }
    if (!r) {
      const box = Math.ceil(Math.max(PJ.seq.w, PJ.seq.h) * 1.5); const w = Math.min(m.w || PJ.seq.w, box), hh = Math.min(m.h || PJ.seq.h, box); let id, raw = null;
      if (m.alpha && bts.ffmpeg.framesOpenRaw) { const k2 = Math.min(1, box / Math.max(m.w || 1, m.h || 1)); raw = { w: Math.max(2, Math.round((m.w || w) * k2 / 2) * 2), h: Math.max(2, Math.round((m.h || hh) * k2 / 2) * 2) }; id = await bts.ffmpeg.framesOpenRaw({ file: m.proxy || m.path, start: want, fps, w: raw.w, h: raw.h, speed: sp, pix: 'rgba', decoder: 'libvpx-vp9' }); }
      else id = await bts.ffmpeg.framesOpen({ file: m.proxy || m.path, start: want, fps, w, h: hh, speed: sp });
      r = { id, s0: want, sp, idx: -1, bmp: null, raw }; readers.set(cid, r); k = 0;
    }
    while (r.idx < k) { const buf = await bts.ffmpeg.framesNext(r.id); if (!buf) { r.idx = k; break; } r.idx++;
      if (r.idx === k) { const nb = r.raw ? await createImageBitmap(new ImageData(new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.byteLength), r.raw.w, r.raw.h)) : await createImageBitmap(new Blob([buf], { type: 'image/jpeg' })); r.bmp?.close?.(); r.bmp = nb; } }
    if (r.bmp) EXP.frames.set(cid, r.bmp);
  }
}
function closeReaders() { for (const [, r] of readers) { bts.ffmpeg.framesClose(r.id); r.bmp?.close?.(); } readers.clear(); EXP.frames = null; }

// ---------------------------------------------------------------------  audio graph
// piecewise-linear gain envelope for a clip, sampled at the breakpoints (with eased segments subdivided)
function gainEnvelope(c, visStart, visEnd) {
  const D = tlDur(c); const ts = new Set([visStart - c.start, visEnd - c.start]); const P = c.props;
  (c.kf?.volume || []).forEach((k, i, a) => { ts.add(k.t); if (i < a.length - 1 && (k.e || 'linear') !== 'linear') { const nxt = a[i + 1]; if (k.e === 'hold') ts.add(nxt.t - 1e-3); else for (let j = 1; j < 10; j++) ts.add(k.t + (nxt.t - k.t) * j / 10); } });
  if (P.fadeIn) { for (let j = 0; j <= 4; j++) ts.add(P.fadeIn * j / 4); } if (P.fadeOut) { for (let j = 0; j <= 4; j++) ts.add(D - P.fadeOut * j / 4); }
  const a = visStart - c.start, b = visEnd - c.start; const pts = [...ts].filter(t => t >= a - 1e-6 && t <= b + 1e-6).sort((x, y) => x - y);
  const g = t => { const PP = evalProps(c, t); return (PP.volume / 100) * fadeK(PP, t, D); };
  const out = []; pts.forEach(t => { const v = g(t); if (!out.length || t - out[out.length - 1][0] > 1e-4) out.push([t - a, v]); });
  // drop collinear points
  return out.filter((p, i, arr) => i === 0 || i === arr.length - 1 || Math.abs((arr[i + 1][1] - arr[i - 1][1]) * (p[0] - arr[i - 1][0]) / ((arr[i + 1][0] - arr[i - 1][0]) || 1) + arr[i - 1][1] - p[1]) > 1e-4);
}
function envExpr(pts) {
  if (pts.length === 1 || pts.every(p => Math.abs(p[1] - pts[0][1]) < 1e-5)) return pts[0][1].toFixed(5);
  const seg = (i) => { const [t0, v0] = pts[i], [t1, v1] = pts[i + 1]; const sl = (v1 - v0) / ((t1 - t0) || 1); return `(${v0.toFixed(5)}+(${sl.toFixed(6)})*(t-${t0.toFixed(4)}))`; };
  const tree = (lo, hi2) => { if (hi2 - lo <= 1) return seg(lo); const mid = (lo + hi2) >> 1; return `if(lt(t,${pts[mid][0].toFixed(4)}),${tree(lo, mid)},${tree(mid, hi2)})`; };
  return `if(lt(t,${pts[0][0].toFixed(4)}),${pts[0][1].toFixed(5)},if(gte(t,${pts[pts.length - 1][0].toFixed(4)}),${pts[pts.length - 1][1].toFixed(5)},${tree(0, pts.length - 1)}))`;
}
const atempoChain = sp => { if (sp === 1) return ''; let s = sp; const parts = []; while (s > 2) { parts.push('atempo=2'); s /= 2; } while (s < 0.5) { parts.push('atempo=0.5'); s /= 0.5; } parts.push(`atempo=${s.toFixed(5)}`); return ',' + parts.join(','); };
function cleanupChain(P, forBake) {
  let f = ''; if (P.denoise) f += ',afftdn=nf=-25:nr=14:tn=1'; if (P.voice) f += ',highpass=f=85,lowpass=f=12000,acompressor=threshold=0.08:ratio=3.5:attack=8:release=120:makeup=2,equalizer=f=3000:t=q:w=1.2:g=3';
  if (P.normalize || P.voice) f += ',loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000'; return f;
}
// Collects every audio source between lo and hi of the current sequence, recursing into nested sequences.
// ctx maps the current sequence's time to the top (exported) timeline and carries the outer gain.
function collectAudio(lo, hi, ctx, depth, items) {
  PJ.clips.forEach(c => {
    if (!hasAudioOf(c) || trackById(c.track)?.muted) return;
    const x = Math.max(c.start, lo), y = Math.min(cEnd(c), hi); if (y - x < 0.01) return;
    const own = gainEnvelope(c, x, y).map(([r]) => ctx.toTop(x + r));
    const gIn = T => { const lt = ctx.fromTop(T) - c.start; const PP = evalProps(c, lt); return (PP.volume / 100) * fadeK(PP, lt, tlDur(c)); };
    const gain = T => ctx.gain(T) * gIn(T); const A = ctx.toTop(x), B = ctx.toTop(y);
    const bps = [...new Set([...own, ...ctx.bps.filter(T => T > A && T < B), A, B])].sort((p, q) => p - q);
    if (c.type === 'nest') {
      if (depth > 4) return; const sd = nestSeq(c); if (!sd) return; const sp = spd(c);
      const sub = { toTop: tau => ctx.toTop(c.start + (tau - c.in) / sp), fromTop: T => c.in + (ctx.fromTop(T) - c.start) * sp, gain, bps };
      withSeq(sd, () => collectAudio(srcTime(c, x), srcTime(c, y), sub, depth + 1, items)); return;
    }
    const m = mediaById(c.mediaId); if (!m || m.missing || (!m.hasAudio && m.kind !== 'audio')) return;
    const rate = (B - A) > 1e-6 ? (y - x) / (B - A) : 1; // local seconds per exported second (nest speeds)
    items.push({ c, m, A, B, sIn: srcTime(c, x), sOut: srcTime(c, y), speed: spd(c) * rate, gain, bps, P: c.props });
  });
  return items;
}
const TOP_CTX = { toTop: t => t, fromTop: t => t, gain: () => 1, bps: [] };
function bleepExportRanges(t0, t1) { if (!PJ.censor || !PJ.censor.on || !PJ.censor.bleep || !PJ.censor.words.length) return []; return VCAP.bleepRanges(PJ.captions, PJ.censor.words, PJ.censor.estimate).map(([a, b]) => [Math.max(a, t0) - t0, Math.min(b, t1) - t0]).filter(([a, b]) => b > a); }
function buildAudio(t0, t1, inputOffset) {
  const inputs = [], filt = [], labels = [];
  const items = collectAudio(t0, t1, TOP_CTX, 0, []);
  items.forEach((it, i) => {
    const P = it.P; if (it.B - it.A < 0.01) return;
    let env = it.bps.filter(T => T >= it.A - 1e-6 && T <= it.B + 1e-6).map(T => [T - it.A, it.gain(T)]);
    env = env.filter((p, j, arr) => j === 0 || j === arr.length - 1 || Math.abs((arr[j + 1][1] - arr[j - 1][1]) * (p[0] - arr[j - 1][0]) / ((arr[j + 1][0] - arr[j - 1][0]) || 1) + arr[j - 1][1] - p[1]) > 1e-4);
    if (!env.length || env.every(p => p[1] <= 1e-4)) return;
    const k = inputs.length / 2 + inputOffset; inputs.push('-i', it.m.proxy || it.m.path);
    const delay = Math.max(0, Math.round((it.A - t0) * 1000));
    let f = `[${k}:a]atrim=start=${it.sIn.toFixed(4)}:end=${it.sOut.toFixed(4)},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo${atempoChain(Math.round(it.speed * 1e5) / 1e5)}${cleanupChain(P)}`;
    f += `,volume='${envExpr(env)}':eval=frame`;
    if (P.pan) { const pn = clamp(P.pan / 100, -1, 1); const L = pn > 0 ? 1 - pn : 1, R = pn < 0 ? 1 + pn : 1; f += `,pan=stereo|c0=${L.toFixed(3)}*c0|c1=${R.toFixed(3)}*c1`; }
    f += `,adelay=${delay}|${delay}[a${i}]`; filt.push(f); labels.push(`[a${i}]`);
  });
  if (!labels.length) return { inputs, graph: null, n: 0 };
  const bl = bleepExportRanges(t0, t1);
  if (!bl.length) return { inputs, graph: [...filt, `${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,alimiter=limit=0.98:level=disabled,apad[aout]`].join(';\n'), n: labels.length };
  // censor bleep: mute the programme and add a 1 kHz tone over every censored word
  const cond = bl.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join('+');
  const k = inputs.length / 2 + inputOffset; inputs.push('-f', 'lavfi', '-i', `sine=frequency=1000:sample_rate=48000:duration=${(t1 - t0 + 1).toFixed(3)}`);
  filt.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,volume='if(${cond},0,1)':eval=frame[prog]`);
  filt.push(`[${k}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume='if(${cond},2.4,0)':eval=frame[beep]`);
  filt.push(`[prog][beep]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.98:level=disabled,apad[aout]`);
  return { inputs, graph: filt.join(';\n'), n: labels.length, bleeps: bl.length };
}
// short graphs go inline; long ones (many keyframes) go through a script file (FFmpeg 7+ `-/filter_complex`)
async function graphArgs(graph) {
  if (graph.length < 6000) return ['-filter_complex', graph.replace(/;\n/g, ';')];
  const name = `graph-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.txt`; return ['-/filter_complex', await bts.ffmpeg.tmpWrite(name, new TextEncoder().encode(graph))];
}

// ---------------------------------------------------------------------  FFmpeg export
async function exportFFmpeg(out, o, t0, t1) {
  if (window.VGRADE) await VGRADE.preloadAll(); // every LUT must be loaded before the first frame renders
  EXP.on = true; EXP.cancel = false; const fmt = o.fmt; const fps = o.fps || PJ.seq.fps; const W = Math.round(o.W / 2) * 2, H = Math.round(o.H / 2) * 2; const total = t1 - t0; const N = Math.max(1, Math.round(total * fps));
  const pm = progressModal('Exporting ' + (fmt === 'pngseq' ? 'PNG sequence' : fmt.toUpperCase()));
  try {
    if (fmt === 'mp3') {
      const A = buildAudio(t0, t1, 0); if (!A.n) throw new Error('There is no audio in the timeline');
      const ga = await graphArgs(A.graph); pm.set(0.3, 'Mixing audio…');
      const id = await bts.ffmpeg.start([...A.inputs, ...ga, '-map', '[aout]', '-t', total.toFixed(3), '-c:a', 'libmp3lame', '-b:a', (o.abr || 256) + 'k', out]); const r = await bts.ffmpeg.end(id);
      if (!r.ok) throw new Error(r.log.split('\n').filter(Boolean).slice(-3).join(' ')); toast('Exported ' + out.split(/[\\/]/).pop(), 'ok', 6000); return { ok: true, out };
    }
    const withAudio = !['gif', 'pngseq'].includes(fmt); const A = withAudio ? buildAudio(t0, t1, 1) : { inputs: [], graph: null, n: 0 };
    let args = ['-f', 'image2pipe', '-framerate', String(fps), '-c:v', fmt === 'pngseq' || o.codec === 'prores' ? 'png' : 'mjpeg', '-i', 'pipe:0', ...A.inputs];
    if (A.graph) args.push(...(await graphArgs(A.graph)));
    args.push('-map', '0:v'); if (A.graph) args.push('-map', '[aout]');
    let outPath = out;
    if (fmt === 'gif') args.push('-vf', `fps=${fps},split[s0][s1];[s0]palettegen=max_colors=192[p];[s1][p]paletteuse=dither=bayer`, '-loop', '0');
    else if (fmt === 'pngseq') { outPath = out.replace(/(\.png)?$/i, '') + '_%05d.png'; args.push('-c:v', 'png', '-start_number', '0'); }
    else if (o.codec === 'prores') { args.push('-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', '-vendor', 'apl0', '-r', String(fps)); if (A.graph) args.push('-c:a', 'pcm_s16le'); }
    else {
      const vc = o.codec === 'h265' ? 'libx265' : 'libx264';
      args.push('-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p', '-c:v', vc, '-preset', 'medium');
      if (o.q === 'kbps') args.push('-b:v', o.kbps + 'k', '-maxrate', Math.round(o.kbps * 1.5) + 'k', '-bufsize', Math.round(o.kbps * 2) + 'k'); else args.push('-crf', String(o.crf ?? 20));
      if (o.codec === 'h265') args.push('-tag:v', 'hvc1', '-x265-params', 'log-level=error');
      args.push('-pix_fmt', 'yuv420p', '-color_range', 'tv', '-r', String(fps)); if (A.graph) args.push('-c:a', 'aac', '-b:a', (o.abr || 192) + 'k'); if (fmt === 'mp4') args.push('-movflags', '+faststart');
    }
    if (fmt !== 'pngseq') args.push('-t', total.toFixed(3)); args.push(outPath);
    const startWall = performance.now(); const id = await bts.ffmpeg.start(args); EXP.frames = new Map();
    const lossless = fmt === 'pngseq' || o.codec === 'prores';
    try {
      const c = document.createElement('canvas'); c.width = W; c.height = H; const cx = c.getContext('2d'); const full = document.createElement('canvas'); full.width = PJ.seq.w; full.height = PJ.seq.h; const fx = full.getContext('2d');
      const k = o.fit === 'fill' ? Math.max(W / PJ.seq.w, H / PJ.seq.h) : Math.min(W / PJ.seq.w, H / PJ.seq.h); const dw = PJ.seq.w * k, dh = PJ.seq.h * k;
      for (let f = 0; f < N; f++) {
        if (EXP.cancel) { await bts.ffmpeg.kill(id); toast('Export cancelled'); return { ok: false, cancelled: true }; }
        const t = t0 + f / fps; await framesFor(t, fps); renderAt(fx, t, 1);
        cx.fillStyle = '#000'; cx.fillRect(0, 0, W, H); cx.drawImage(full, (W - dw) / 2, (H - dh) / 2, dw, dh);
        const blob = await new Promise(r => c.toBlob(r, lossless ? 'image/png' : 'image/jpeg', 0.95));
        const ok = await bts.ffmpeg.write(id, await UI.blobToU8(blob)); if (!ok) break;
        if (f % 5 === 0) { const el = (performance.now() - startWall) / 1000; const eta = el / (f + 1) * (N - f - 1); pm.set((f + 1) / N, `Rendering frame ${f + 1} of ${N} · ${Math.round(eta)}s remaining`); if (f % 30 === 0) renderAt(pctx, t, ST.rs); }
      }
    } finally { closeReaders(); }
    pm.set(1, 'Finishing…'); const r = await bts.ffmpeg.end(id);
    if (!r.ok) throw new Error('FFmpeg: ' + r.log.split('\n').filter(Boolean).slice(-3).join(' '));
    toast(`Exported ${out.split(/[\\/]/).pop()} in ${Math.round((performance.now() - startWall) / 1000)}s`, 'ok', 7000); return { ok: true, out: outPath };
  } finally { pm.close(); EXP.on = false; }
}
async function exportWebM(out, t0, t1, W, H, kbps) {
  if (window.VGRADE) await VGRADE.preloadAll();
  EXP.on = true; EXP.cancel = false; ensureAudio(); await audioCtx.resume();
  const pm = progressModal('Exporting WebM (real-time)');
  const c = document.createElement('canvas'); c.width = W; c.height = H; const cx = c.getContext('2d'); const full = document.createElement('canvas'); full.width = PJ.seq.w; full.height = PJ.seq.h; const fx = full.getContext('2d');
  const k = Math.min(W / PJ.seq.w, H / PJ.seq.h); const dw = PJ.seq.w * k, dh = PJ.seq.h * k;
  const stream = c.captureStream(PJ.seq.fps); recDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm', videoBitsPerSecond: kbps * 1000 });
  const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data); const stopped = new Promise(r => rec.onstop = r);
  masterGain.disconnect(audioCtx.destination);
  try {
    ST.t = t0; ST.playing = true; ST.rate = 1; playBase = { wall: performance.now(), t: t0 }; syncMedia(true); await UI.sleep(300); playBase = { wall: performance.now(), t: t0 }; rec.start(250);
    await new Promise(res => { const step = () => { if (EXP.cancel) return res(); ST.t = playBase.t + (performance.now() - playBase.wall) / 1000; if (ST.t >= t1) return res(); syncMedia(true); renderAt(fx, ST.t, 1); cx.fillStyle = '#000'; cx.fillRect(0, 0, W, H); cx.drawImage(full, (W - dw) / 2, (H - dh) / 2, dw, dh); pm.set((ST.t - t0) / (t1 - t0), `Recording ${tc(ST.t - t0)} of ${tc(t1 - t0)}`); requestAnimationFrame(step); }; step(); });
    rec.stop(); await stopped;
  } finally { ST.playing = false; syncMedia(false); masterGain.connect(audioCtx.destination); pm.close(); EXP.on = false; }
  if (EXP.cancel) return toast('Export cancelled');
  const blob = new Blob(chunks, { type: 'video/webm' }); await bts.fs.write({ path: out, data: await UI.blobToU8(blob) }); toast('Exported ' + out.split(/[\\/]/).pop(), 'ok', 6000);
}

// ---------------------------------------------------------------------  baking audio effects into a temp file
async function bakeAudio(c) {
  if (!ST.ffmpeg) return toast('Baking needs FFmpeg', 'err');
  const P = c.props; if (!P.normalize && !P.denoise && !P.voice) return toast('Turn on Normalize, Noise reduction or Voice enhance first');
  if (c.type === 'video') { unlinkAudio(); c = selected().find(x => x.type === 'audio'); if (!c) return; }
  const m = mediaById(c.mediaId); const dir = (await bts.ffmpeg.tmpDir()).replace(/\\/g, '/'); const out = `${dir}/${m.id}-baked-${Date.now().toString(36)}.wav`;
  const pm = progressModal('Baking audio effects'); pm.set(0.3, 'Processing with FFmpeg (afftdn / compressor / loudnorm)…');
  const id = await bts.ffmpeg.start(['-ss', c.in.toFixed(3), '-t', (c.out - c.in).toFixed(3), '-i', m.proxy || m.path, '-vn', '-af', 'aformat=sample_rates=48000:channel_layouts=stereo' + cleanupChain(P), '-c:a', 'pcm_s16le', out]);
  const r = await bts.ffmpeg.end(id); pm.close(); if (!r.ok) return toast('Could not process audio', 'err');
  const nm = await importPath(out, m.name.replace(/\.\w+$/, '') + ' (cleaned).wav'); if (!nm || nm.missing) return; nm.gen = 'baked';
  const shift = c.in; c.mediaId = nm.id; c.in = 0; c.out = c.out - shift; P.normalize = P.denoise = P.voice = false; els.delete(c.id);
  commit('Bake audio effects'); renderTimeline(); renderFx(); toast('Audio effects baked into a new file — you can hear them in the preview now.', 'ok', 5000);
}

// ---------------------------------------------------------------------  auto-ducking (adds volume keyframes on music clips)
async function autoDuckDialog() {
  const aTracks = PJ.tracks.filter(t => t.kind === 'audio');
  const voiceDefault = aTracks.filter(t => t.voice).map(t => t.id); const vt = voiceDefault.length ? voiceDefault : [aTracks[0]?.id].filter(Boolean);
  const fields = [...aTracks.map(t => ({ key: 'v_' + t.id, label: `${t.id} is voice`, type: 'checkbox', value: vt.includes(t.id) })), { key: 'vv', label: 'Audio inside video clips (V tracks) is voice', type: 'checkbox', value: !vt.length },
    { key: 'db', label: 'Duck amount (dB)', type: 'range', value: -14, min: -40, max: -3 }, { key: 'thr', label: 'Voice detection threshold (dBFS)', type: 'range', value: -32, min: -60, max: -10 }, { key: 'att', label: 'Fade down (s)', type: 'number', value: 0.25, step: 0.05 }, { key: 'rel', label: 'Fade up (s)', type: 'number', value: 0.6, step: 0.05 }];
  const v = await form({ title: 'Auto-duck music under voice (other audio tracks are lowered while someone speaks)', width: 460, fields }); if (!v) return;
  const voiceTracks = new Set(aTracks.filter(t => v['v_' + t.id]).map(t => t.id));
  const res = autoDuck({ voiceTracks, voiceInVideo: v.vv, db: +v.db, thr: +v.thr, attack: +v.att, release: +v.rel });
  if (!res.music) return toast('No music clips found on the non-voice audio tracks', 'err');
  toast(res.regions ? `Ducked ${res.music} music clip(s) under ${res.regions} voice section(s)` : 'No voice detected above the threshold', res.regions ? 'ok' : 'err', 5000);
}
function autoDuck({ voiceTracks, voiceInVideo, db = -14, thr = -32, attack = 0.25, release = 0.6, rate = 20 }) {
  const thrLin = Math.pow(10, thr / 20); const end2 = seqDuration(); const n = Math.ceil(end2 * rate) + 1; const act = new Uint8Array(n);
  const voices = PJ.clips.filter(c => (c.type === 'audio' && voiceTracks.has(c.track)) || (voiceInVideo && c.type === 'video' && hasAudioOf(c)));
  voices.forEach(c => { const m = mediaById(c.mediaId); if (!m?.peaks) return; for (let i = Math.floor(c.start * rate); i < Math.ceil(cEnd(c) * rate) && i < n; i++) { const t = i / rate; if (t < c.start || t >= cEnd(c)) continue; const lvl = peakAt(m, srcTime(c, t)) * audioGainAt(c, t); if (lvl >= thrLin) act[i] = 1; } });
  // close short gaps (< 0.4 s) and drop blips (< 0.12 s)
  const runs = []; let s = -1; for (let i = 0; i <= n; i++) { if (i < n && act[i]) { if (s < 0) s = i; } else if (s >= 0) { runs.push([s / rate, i / rate]); s = -1; } }
  const merged = []; runs.forEach(r => { const last = merged[merged.length - 1]; if (last && r[0] - last[1] < 0.4) last[1] = r[1]; else merged.push([...r]); });
  const regions = merged.filter(r => r[1] - r[0] >= 0.12);
  const music = PJ.clips.filter(c => c.type === 'audio' && !voiceTracks.has(c.track)); const f = Math.pow(10, db / 20);
  // duck factor at timeline time t (linear ramps down before / up after each voice region)
  const duckAt = t => { let k = 1; for (const [a, b] of regions) { if (t >= a && t <= b) k = Math.min(k, f); else if (t >= a - attack && t < a) k = Math.min(k, 1 - (1 - f) * (t - (a - attack)) / attack); else if (t > b && t <= b + release) k = Math.min(k, f + (1 - f) * (t - b) / release); } return k; };
  music.forEach(c => {
    // re-running auto-duck starts again from the clip's own (un-ducked) volume keyframes
    if (c.preDuck !== undefined) { if (c.preDuck) c.kf.volume = JSON.parse(c.preDuck); else delete c.kf.volume; }
    const own = c.kf.volume ? JSON.parse(JSON.stringify(c.kf.volume)) : null; const D = tlDur(c);
    const ts = new Set([0, D]);
    regions.forEach(([a, b]) => [a - attack, a, b, b + release].forEach(t => { const lt = t - c.start; if (lt > 0 && lt < D) ts.add(lt); }));
    const hit = regions.some(([a, b]) => b + release > c.start && a - attack < cEnd(c)); if (!hit) { delete c.preDuck; return; }
    (own || []).forEach((k, i, arr) => { ts.add(clamp(k.t, 0, D)); const nx = arr[i + 1]; if (nx && (k.e || 'linear') !== 'linear') for (let j = 1; j < 6; j++) ts.add(clamp(k.t + (nx.t - k.t) * j / 6, 0, D)); });
    const baseAt = lt => own ? VFX.evalKf(own, lt) : c.props.volume;
    const keys = [...ts].sort((x, y) => x - y).map(lt => ({ t: lt, v: Math.round(baseAt(lt) * duckAt(c.start + lt) * 100) / 100, e: 'linear' }));
    c.kf.volume = keys.filter((k, i, a) => i === 0 || i === a.length - 1 || !(Math.abs(a[i - 1].v - k.v) < 1e-3 && Math.abs(a[i + 1].v - k.v) < 1e-3));
    c.preDuck = own ? JSON.stringify(own) : null;
  });
  commit('Auto-duck'); renderTimeline(); renderFx(); return { music: music.length, regions: regions.length };
}
function removeDucking() { let n = 0; PJ.clips.forEach(c => { if (c.preDuck === undefined) return; if (c.preDuck) c.kf.volume = JSON.parse(c.preDuck); else delete c.kf.volume; delete c.preDuck; n++; }); if (!n) return toast('No auto-ducking to remove'); commit('Remove auto-ducking'); renderTimeline(); renderFx(); toast(`Removed ducking from ${n} clip(s)`, 'ok'); }
