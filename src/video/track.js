// BTS Video — shape masks (ellipse / rectangle / pen-bezier) with on-monitor editing, a template-matching (NCC) motion
// tracker that writes keyframes for masks and the face-blur region, and Smart Reframe that follows the subject.
'use strict';

// =====================================================================  masks
const MASK_TYPES = [['ellipse', 'Ellipse'], ['rect', 'Rectangle'], ['pen', 'Pen (bezier)']];
function maskBase(c) { // content size in clip-local units (for default mask sizes)
  if (['video', 'image', 'nest'].includes(c.type)) { const R = mediaRect(c, { ...c.props, cropL: 0, cropR: 0, cropT: 0, cropB: 0 }); return { w: R.dw, h: R.dh }; }
  if (c.type === 'shape') return { w: c.props.w, h: c.props.h }; return { w: PJ.seq.w, h: PJ.seq.h };
}
function newMask(type, c, over = {}) {
  const B = maskBase(c); const k = Math.min(PJ.seq.w, PJ.seq.h) / 1080; const n = (c.masks || []).length + 1;
  const w = Math.round(B.w * 0.38), hh = Math.round(B.h * 0.55);
  const m = { id: 'k' + Math.random().toString(36).slice(2, 8), name: `Mask ${n}`, type, x: 0, y: 0, w, h: hh, rot: 0, smooth: type === 'pen', feather: Math.round(18 * k), expand: 0, opacity: 100, invert: false, mode: 'add', on: true, ...over };
  if (type === 'pen' && !m.pts) m.pts = Array.from({ length: 6 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 3; return [Math.round(Math.cos(a) * w / 2), Math.round(Math.sin(a) * hh / 2)]; });
  return m;
}
function addMask(type = 'ellipse', cs = selected(), over) {
  cs = cs.filter(isVisual); if (!cs.length) return toast('Select a video, image, title, shape or nested clip first'); let m;
  cs.forEach(c => { c.masks = c.masks || []; m = newMask(type, c, over); c.masks.push(m); }); ST.maskFocus = m.id;
  PREFS.collapsed = (PREFS.collapsed || []).filter(x => x !== 'Masks'); savePrefs(); commit('Add ' + type + ' mask'); renderTimeline(); renderFx(); drawFrame(); return m;
}
function removeMask(c, id) { c.masks = (c.masks || []).filter(m => m.id !== id); for (const k in c.kf) if (k.startsWith('mask:' + id + ':')) delete c.kf[k]; if (ST.maskFocus === id) ST.maskFocus = null; commit('Remove mask'); renderTimeline(); renderFx(); drawFrame(); }
const maskKey = (m, p) => `mask:${m.id}:${p}`;
const flatPts = pts => pts.flatMap(p => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]);
function maskAt(c, m, lt) { return evalMasks({ masks: [m], kf: c.kf }, lt)[0] || m; }
function setMaskParam(c, m, p, v, lt) { const k = maskKey(m, p); if (c.kf[k]?.length) VFX.setKey(c.kf, k, frameSnap(lt), v); else m[p] = v; }
function setMaskPts(c, m, pts, lt) { const k = maskKey(m, 'pts'); if (c.kf[k]?.length) VFX.setKey(c.kf, k, frameSnap(lt), flatPts(pts)); else m.pts = pts.map(p => [p[0], p[1]]); }
function toggleMaskPathKf(c, m, lt) { const k = maskKey(m, 'pts'); if (c.kf[k]?.length) { const cur = maskAt(c, m, lt); m.pts = cur.pts; delete c.kf[k]; } else VFX.setKey(c.kf, k, frameSnap(lt), flatPts(m.pts || [])); commit('Mask path keyframes'); renderFx(); renderTimeline(); }
const focusMask = c => (c.masks || []).find(m => m.id === ST.maskFocus) || (c.masks || [])[0] || null;

// on-monitor drawing / editing (called from the overlay in panels.js)
function drawMaskOverlay(x, c, M) {
  const lt = clamp(ST.t - c.start, 0, tlDur(c));
  if (ST.penDraw && ST.penDraw.c === c) { const pts = ST.penDraw.pts.map(p => M.toS(...p)); x.strokeStyle = '#ffd400'; x.lineWidth = 1.5; x.setLineDash([4, 3]); x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(...p) : x.moveTo(...p)); x.stroke(); x.setLineDash([]); pts.forEach((p, i) => { x.fillStyle = i ? '#ffd400' : '#fff'; x.fillRect(p[0] - 4, p[1] - 4, 8, 8); }); return; }
  (c.masks || []).forEach(m0 => {
    const m = maskAt(c, m0, lt); const foc = m0 === focusMask(c);
    // draw the outline through the clip transform by sampling the path
    const sx = x; sx.save(); sx.lineWidth = foc ? 2 : 1.2; sx.strokeStyle = foc ? '#ffd400' : 'rgba(255,212,0,.55)'; sx.setLineDash(m.on === false ? [3, 4] : []);
    const pr = new Path2D(); const tmp = { beginPath() { }, moveTo: (a, b) => pr.moveTo(...M.toS(a, b)), lineTo: (a, b) => pr.lineTo(...M.toS(a, b)), closePath: () => pr.closePath(),
      bezierCurveTo: (a, b, c2, d, e, f) => pr.bezierCurveTo(...M.toS(a, b), ...M.toS(c2, d), ...M.toS(e, f)),
      ellipse: (cx, cy, rx, ry, rot) => { for (let i = 0; i <= 48; i++) { const t = i / 48 * Math.PI * 2; const px = cx + Math.cos(t) * rx * Math.cos(rot) - Math.sin(t) * ry * Math.sin(rot), py = cy + Math.cos(t) * rx * Math.sin(rot) + Math.sin(t) * ry * Math.cos(rot); i ? pr.lineTo(...M.toS(px, py)) : pr.moveTo(...M.toS(px, py)); } pr.closePath(); } };
    maskPath(tmp, m, true); sx.stroke(pr);
    if (foc) { sx.fillStyle = '#ffd400'; maskHandles(m).forEach(hd => { const [px, py] = M.toS(...hd.p); sx.fillRect(px - 4.5, py - 4.5, 9, 9); }); const [cx, cy] = M.toS(m.x, m.y); sx.beginPath(); sx.arc(cx, cy, 4, 0, Math.PI * 2); sx.fill(); sx.font = '11px sans-serif'; sx.fillText(m.name + (m.invert ? ' (inverted)' : ''), cx + 8, cy - 8); }
    sx.restore();
  });
}
function maskHandles(m) {
  const a = (m.rot || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a); const P = (px, py) => [m.x + px * ca - py * sa, m.y + px * sa + py * ca];
  if (m.type === 'pen') return (m.pts || []).map((p, i) => ({ kind: 'pt', i, p: P(p[0], p[1]) }));
  return [{ kind: 'size', p: P(m.w / 2, m.h / 2) }, { kind: 'w', p: P(m.w / 2, 0) }, { kind: 'h', p: P(0, m.h / 2) }];
}
function maskPointerDown(e, ovlRect) {
  const c = overlayState(); if (!c) return false; const M = clipScreenMap(c); const sx = e.clientX - ovlRect.left, sy = e.clientY - ovlRect.top; const lt = clamp(ST.t - c.start, 0, tlDur(c));
  if (ST.penDraw && ST.penDraw.c === c) { // pen drawing: click adds points; click the first point (or double-click / Enter) closes
    const P0 = ST.penDraw.pts[0]; if (P0 && ST.penDraw.pts.length >= 3) { const [fx, fy] = M.toS(...P0); if (Math.hypot(fx - sx, fy - sy) < 9 || e.detail >= 2) { finishPenMask(); return true; } }
    ST.penDraw.pts.push(M.toL(sx, sy)); drawOverlay(); return true;
  }
  const m0 = focusMask(c); if (!m0) return false; const m = maskAt(c, m0, lt);
  const [lx, ly] = M.toL(sx, sy); const tol = 9 / M.k / M.s;
  const hit = maskHandles(m).find(hd => Math.hypot(hd.p[0] - lx, hd.p[1] - ly) < tol);
  let inside = false; if (!hit) { const tc2 = document.createElement('canvas').getContext('2d'); maskPath(tc2, m); inside = tc2.isPointInPath(lx, ly); }
  if (!hit && !inside) return false;
  const a = -(m.rot || 0) * Math.PI / 180; const toMaskAxes = (dx, dy) => [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
  const start = { x: m.x, y: m.y, w: m.w, h: m.h, pts: (m.pts || []).map(p => [...p]) }; let moved = false;
  const mv = ev => { moved = true; const [nx, ny] = M.toL(ev.clientX - ovlRect.left, ev.clientY - ovlRect.top); const dx = nx - lx, dy = ny - ly;
    if (!hit) { setMaskParam(c, m0, 'x', Math.round(start.x + dx), lt); setMaskParam(c, m0, 'y', Math.round(start.y + dy), lt); }
    else if (hit.kind === 'pt') { const [ux, uy] = toMaskAxes(dx, dy); const pts = start.pts.map(p => [...p]); pts[hit.i] = [Math.round(pts[hit.i][0] + ux), Math.round(pts[hit.i][1] + uy)]; setMaskPts(c, m0, pts, lt); }
    else { const [ux, uy] = toMaskAxes(dx, dy); if (hit.kind !== 'h') setMaskParam(c, m0, 'w', Math.max(4, Math.round(start.w + ux * 2)), lt); if (hit.kind !== 'w') setMaskParam(c, m0, 'h', Math.max(4, Math.round(start.h + uy * 2)), lt); }
    drawFrame(); };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', () => { window.removeEventListener('pointermove', mv); if (moved) { commit('Edit mask'); renderFx(); renderTimeline(); } }, { once: true });
  return true;
}
function startPenMask() { const c = selected()[0]; if (!c || !isVisual(c)) return toast('Select a visual clip, then click points on the program monitor'); pause(); if (!(c.start <= ST.t && cEnd(c) > ST.t)) seek(c.start); ST.penDraw = { c, pts: [] }; drawOverlay(); toast('Click to add points on the monitor — click the first point, double-click or press Enter to close the mask. Esc cancels.', '', 6000); }
function finishPenMask() {
  const P = ST.penDraw; ST.penDraw = null; if (!P || P.pts.length < 3) { drawOverlay(); return toast('A pen mask needs at least 3 points'); }
  const cx = P.pts.reduce((s, p) => s + p[0], 0) / P.pts.length, cy = P.pts.reduce((s, p) => s + p[1], 0) / P.pts.length;
  const xs = P.pts.map(p => p[0]), ys = P.pts.map(p => p[1]);
  addMask('pen', [P.c], { x: Math.round(cx), y: Math.round(cy), pts: P.pts.map(p => [Math.round(p[0] - cx), Math.round(p[1] - cy)]), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
}
window.addEventListener('keydown', e => { if (!ST.penDraw) return; if (e.key === 'Enter') { e.preventDefault(); finishPenMask(); } else if (e.key === 'Escape') { ST.penDraw = null; drawOverlay(); } }, true);

// =====================================================================  motion tracker (normalised cross-correlation)
// Reads grey frames of a clip from the FFmpeg raw frame server: one frame per sequence frame (or per `step` frames).
async function openGray(c, tStart, fw, fh, fps) {
  const m = mediaById(c.mediaId); const sp = spd(c);
  return bts.ffmpeg.framesOpenRaw({ file: m.proxy || m.path, start: Math.max(0, srcTime(c, tStart)), fps, w: fw, h: fh, speed: sp, pix: 'gray', decoder: m.alpha ? 'libvpx-vp9' : undefined });
}
function trackGeom(c) { const m = mediaById(c.mediaId); const R = mediaRect(c, { ...c.props, cropL: 0, cropR: 0, cropT: 0, cropB: 0 }); return { m, R, aspect: (m.w || 16) / (m.h || 9) }; }
// template matching search; returns {x,y,score} of the template's top-left in frame I
function nccSearch(I, fw, fh, T, tw, th, px, py, rad) {
  const n = tw * th; let tm = 0; for (let i = 0; i < n; i++) tm += T[i]; tm /= n; let ts = 0; for (let i = 0; i < n; i++) { const d = T[i] - tm; ts += d * d; } ts = Math.sqrt(ts) || 1;
  const score = (x, y) => { if (x < 0 || y < 0 || x + tw > fw || y + th > fh) return -2; let s = 0, s2 = 0, cr = 0;
    for (let j = 0; j < th; j++) { const ro = (y + j) * fw + x, to = j * tw; for (let i = 0; i < tw; i++) { const v = I[ro + i]; s += v; s2 += v * v; cr += v * T[to + i]; } }
    const mean = s / n; const vs = s2 - s * mean; if (vs <= 1e-6) return -1; return (cr - mean * tm * n) / (Math.sqrt(vs) * ts); };
  let best = { x: px, y: py, score: -2 }; const x0 = Math.round(px), y0 = Math.round(py);
  for (let dy = -rad; dy <= rad; dy += 2) for (let dx = -rad; dx <= rad; dx += 2) { const sc = score(x0 + dx, y0 + dy); if (sc > best.score) best = { x: x0 + dx, y: y0 + dy, score: sc }; }
  const bx = best.x, by = best.y; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const sc = score(bx + dx, by + dy); if (sc > best.score) best = { x: bx + dx, y: by + dy, score: sc }; }
  // sub-pixel refinement (parabola through the neighbours)
  const sL = score(best.x - 1, best.y), sR = score(best.x + 1, best.y), sU = score(best.x, best.y - 1), sD = score(best.x, best.y + 1);
  const sub = (a, b, c2) => { const d = a - 2 * b + c2; return Math.abs(d) > 1e-6 && a > -1.5 && c2 > -1.5 ? clamp(0.5 * (a - c2) / d, -0.5, 0.5) : 0; };
  return { x: best.x + sub(sL, best.score, sR), y: best.y + sub(sU, best.score, sD), score: best.score };
}
const cut = (I, fw, x, y, w, h) => { const T = new Float32Array(w * h); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) T[j * w + i] = I[(y + j) * fw + x + i]; return T; };
// Tracks a box (clip-local units {x,y,w,h}, centre-based) from time tFrom towards dir (+1 forward / −1 backward) and calls
// onSample(timelineTime, dxLocal, dyLocal) with the box centre's offset from its start position. Returns {frames, lost}.
async function trackBox(c, box, tFrom, dir, onSample, opt = {}) {
  if (c.type !== 'video') throw new Error('Tracking works on video clips');
  const { m, R } = trackGeom(c); if (!m || m.missing) throw new Error('The media is offline');
  const fps = opt.fps || PJ.seq.fps; const tEnd = dir > 0 ? cEnd(c) - 0.5 / fps : c.start; const span = Math.min(opt.maxSpan || 60, Math.abs(tEnd - tFrom)); if (span < 1 / fps) throw new Error('Nothing to track in that direction');
  // work at a frame size where the box is ≤ ~64 px
  const boxPx480 = Math.max(box.w, box.h) / R.dw * 480; let fw = Math.round(clamp(480 * Math.min(1, 64 / Math.max(8, boxPx480)), 160, 480) / 2) * 2; const fh = Math.max(2, Math.round(fw * R.dh / R.dw / 2) * 2);
  const toPx = (lx, ly) => [(lx + R.dw / 2) / R.dw * fw, (ly + R.dh / 2) / R.dh * fh]; const kx = R.dw / fw, ky = R.dh / fh;
  const tw = Math.max(8, Math.min(fw - 2, Math.round(box.w / kx))), th = Math.max(8, Math.min(fh - 2, Math.round(box.h / ky)));
  const [cx0, cy0] = toPx(box.x, box.y); let px = clamp(cx0 - tw / 2, 0, fw - tw), py = clamp(cy0 - th / 2, 0, fh - th); const sx0 = px, sy0 = py;
  const rad = Math.max(10, Math.round(Math.max(tw, th) * 0.6)); const N = Math.max(1, Math.round(span * fps));
  const t0 = dir > 0 ? tFrom : tFrom - N / fps; const id = await openGray(c, t0, fw, fh, fps);
  const frames = []; let T = null, T0 = null, lost = false, done = 0;
  const step = (I, t) => {
    if (!T) { T0 = cut(I, fw, Math.round(px), Math.round(py), tw, th); T = Float32Array.from(T0); onSample(t, 0, 0, 1); return true; }
    const r = nccSearch(I, fw, fh, T, tw, th, px, py, rad); if (r.score < (opt.minScore ?? 0.35)) { lost = true; return false; }
    px = r.x; py = r.y; onSample(t, (px - sx0) * kx, (py - sy0) * ky, r.score);
    if (r.score > 0.75) { const P2 = cut(I, fw, clamp(Math.round(px), 0, fw - tw), clamp(Math.round(py), 0, fh - th), tw, th); for (let i = 0; i < T.length; i++) T[i] = T[i] * 0.8 + P2[i] * 0.1 + T0[i] * 0.1; }
    return true;
  };
  try {
    for (let i = 0; i <= N; i++) {
      if (opt.cancelled && opt.cancelled()) break; const buf = await bts.ffmpeg.framesNext(id); if (!buf) break;
      if (dir > 0) { if (!step(buf, t0 + i / fps)) break; done++; if (opt.progress && i % 5 === 0) opt.progress(i / N); }
      else { frames.push(buf); if (opt.progress && i % 10 === 0) opt.progress(i / N * 0.5); }
    }
    if (dir < 0) for (let i = frames.length - 1; i >= 0; i--) { if (opt.cancelled && opt.cancelled()) break; if (!step(frames[i], t0 + i / fps)) break; done++; if (opt.progress && i % 5 === 0) opt.progress(0.5 + (frames.length - i) / frames.length * 0.5); }
  } finally { bts.ffmpeg.framesClose(id); }
  return { frames: done, lost };
}
// replaces the keyframes of `keys` between a and b (clip-local times) with the tracked samples
function clearKfRange(c, keys, a, b) { keys.forEach(k => { if (!c.kf[k]) return; c.kf[k] = c.kf[k].filter(kk => kk.t < a - 1e-4 || kk.t > b + 1e-4); if (!c.kf[k].length) delete c.kf[k]; }); }
// Track the focused mask (or the face-blur region) forward / backward from the playhead
async function trackSelected(dir = 1, opts = {}) {
  if (!ST.ffmpeg) return toast('Tracking needs FFmpeg', 'err');
  const c = selected().find(x => x.type === 'video') || null; if (!c) return toast('Select a video clip that has a mask or a face-blur (mosaic) effect');
  if (!(ST.t >= c.start - 1e-6 && ST.t <= cEnd(c))) seek(c.start);
  const lt0 = clamp(ST.t - c.start, 0, tlDur(c)); const W = PJ.seq.w, H = PJ.seq.h;
  const mos = opts.target === 'mask' ? null : (c.fx || []).find(f => f.type === 'mosaic' && f.on && !f.whole && (opts.target === 'blur' || ST.fxFocus === f.id || !(c.masks || []).length));
  const mk = mos ? null : focusMask(c); if (!mos && !mk) return toast('Add a mask or a Mosaic / face blur effect to track', 'err');
  let box, keys, apply;
  if (mos) { const f = evalFx(c, lt0).find(g => g.id === mos.id); box = { x: (f.rx + f.rw / 2) / 100 * W - W / 2, y: (f.ry + f.rh / 2) / 100 * H - H / 2, w: f.rw / 100 * W, h: f.rh / 100 * H }; keys = [`fx:${mos.id}:rx`, `fx:${mos.id}:ry`];
    apply = (lt, dx, dy) => { VFX.setKey(c.kf, keys[0], lt, Math.round((f.rx + dx / W * 100) * 100) / 100); VFX.setKey(c.kf, keys[1], lt, Math.round((f.ry + dy / H * 100) * 100) / 100); }; }
  else { const m = maskAt(c, mk, lt0); const xs = m.type === 'pen' ? m.pts.map(p => p[0]) : [-m.w / 2, m.w / 2], ys = m.type === 'pen' ? m.pts.map(p => p[1]) : [-m.h / 2, m.h / 2];
    box = { x: m.x + (Math.max(...xs) + Math.min(...xs)) / 2, y: m.y + (Math.max(...ys) + Math.min(...ys)) / 2, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; keys = [maskKey(mk, 'x'), maskKey(mk, 'y')];
    apply = (lt, dx, dy) => { VFX.setKey(c.kf, keys[0], lt, Math.round((m.x + dx) * 100) / 100); VFX.setKey(c.kf, keys[1], lt, Math.round((m.y + dy) * 100) / 100); }; }
  EXP.cancel = false; const pm = opts.silent ? null : progressModal(`Tracking ${mos ? 'blur region' : mk.name} ${dir > 0 ? 'forward' : 'backward'}`);
  const samples = []; let res;
  try { res = await trackBox(c, box, ST.t, dir, (t, dx, dy) => samples.push([t, dx, dy]), { progress: k => pm && pm.set(k, `Tracking… ${Math.round(k * 100)}%`), cancelled: () => EXP.cancel, maxSpan: opts.maxSpan }); }
  catch (e) { pm && pm.close(); return toast(e.message, 'err'); }
  pm && pm.close(); if (samples.length < 2) return toast('Could not track — try a larger or more detailed region', 'err');
  const lts = samples.map(s => frameSnap(s[0] - c.start)); clearKfRange(c, keys, Math.min(...lts), Math.max(...lts));
  samples.forEach((s, i) => { if (i % (opts.every || 1) && i !== samples.length - 1) return; apply(frameSnap(s[0] - c.start), s[1], s[2]); });
  commit(`Track ${mos ? 'blur region' : 'mask'} ${dir > 0 ? 'forward' : 'backward'}`); renderTimeline(); renderFx(); drawFrame();
  toast(`Tracked ${res.frames} frames${res.lost ? ' — lost the target, stopped early' : ''}`, res.lost ? '' : 'ok', 5000); return { frames: res.frames, lost: res.lost, keys: samples.length };
}

// =====================================================================  Smart Reframe (follows the subject when changing aspect ratio)
// picks the most "interesting" box (motion + detail, centre-weighted) in a clip's first second
async function autoSubject(c, fw, fh) {
  const id = await openGray(c, c.start + Math.min(0.2, tlDur(c) / 4), fw, fh, 5); const f0 = await bts.ffmpeg.framesNext(id); const f1 = (await bts.ffmpeg.framesNext(id)) || f0; bts.ffmpeg.framesClose(id);
  if (!f0) return null; const sal = new Float32Array(fw * fh);
  for (let y = 1; y < fh - 1; y++) for (let x = 1; x < fw - 1; x++) { const i = y * fw + x; const gx = f0[i + 1] - f0[i - 1], gy = f0[i + fw] - f0[i - fw]; sal[i] = Math.abs(f1[i] - f0[i]) * 2 + Math.sqrt(gx * gx + gy * gy) * 0.35; }
  const bw = Math.round(fw * 0.22), bh = Math.round(fh * 0.4); let best = null;
  for (let y = 0; y + bh <= fh; y += 4) for (let x = 0; x + bw <= fw; x += 4) { let s = 0; for (let j = 0; j < bh; j += 2) for (let i = 0; i < bw; i += 2) s += sal[(y + j) * fw + x + i];
    const cx = (x + bw / 2) / fw - 0.5, cy = (y + bh / 2) / fh - 0.45; s *= 1 - Math.min(0.6, (cx * cx + cy * cy) * 1.6); if (!best || s > best.s) best = { s, x, y }; }
  return best ? { px: best.x + bw / 2, py: best.y + bh / 2, bw, bh } : null;
}
async function smartReframe({ aspect = '9:16', follow = true, smooth = 0.6 } = {}) {
  const A = ASPECTS.find(a => a[0] === aspect) || ASPECTS[1]; const long = Math.max(PJ.seq.w, PJ.seq.h) >= 1900 ? 1 : 2 / 3;
  changeSequence(Math.round(A[1] * long / 2) * 2, Math.round(A[2] * long / 2) * 2, PJ.seq.fps, 'fill');
  if (!follow || !ST.ffmpeg) return { clips: 0 };
  const vids = PJ.clips.filter(c => c.type === 'video' && !trackById(c.track).locked && mediaById(c.mediaId) && !mediaById(c.mediaId).missing);
  EXP.cancel = false; const pm = progressModal('Smart reframe — following the subject'); let done = 0; const W = PJ.seq.w, H = PJ.seq.h;
  try {
    for (const [ci, c] of vids.entries()) {
      if (EXP.cancel) break; pm.set(ci / vids.length, `Analysing ${c.name} (${ci + 1}/${vids.length})…`);
      const { R } = trackGeom(c); const fw = 320, fh = Math.max(2, Math.round(fw * R.dh / R.dw / 2) * 2); const kx = R.dw / fw, ky = R.dh / fh;
      // subject: focused mask, else the face-blur region, else automatic
      let start = null; const mk = focusMask(c); const mos = (c.fx || []).find(f => f.type === 'mosaic' && !f.whole);
      if (mk) { const m = maskAt(c, mk, 0); start = { x: m.x, y: m.y, w: Math.max(40, m.w || 200), h: Math.max(40, m.h || 200) }; }
      else if (mos) start = { x: (mos.rx + mos.rw / 2) / 100 * W - W / 2, y: (mos.ry + mos.rh / 2) / 100 * H - H / 2, w: mos.rw / 100 * W, h: mos.rh / 100 * H };
      else { const s0 = await autoSubject(c, fw, fh); if (!s0) continue; start = { x: s0.px * kx - R.dw / 2, y: s0.py * ky - R.dh / 2, w: s0.bw * kx, h: s0.bh * ky }; }
      const fps = Math.min(15, PJ.seq.fps); const pts = [];
      await trackBox(c, start, c.start, 1, (t, dx, dy) => pts.push([t - c.start, start.x + dx, start.y + dy]), { fps, maxSpan: 600, minScore: 0.2, cancelled: () => EXP.cancel, progress: k => pm.set((ci + k) / vids.length, `Tracking the subject in ${c.name}… ${Math.round(k * 100)}%`) });
      if (pts.length < 2) continue;
      // smooth the path (exponential, forward + backward) so the virtual camera glides
      const a = clamp(1 - smooth, 0.05, 1); for (let i = 1; i < pts.length; i++) { pts[i][1] = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * a; pts[i][2] = pts[i - 1][2] + (pts[i][2] - pts[i - 1][2]) * a; }
      for (let i = pts.length - 2; i >= 0; i--) { pts[i][1] = pts[i + 1][1] + (pts[i][1] - pts[i + 1][1]) * a; pts[i][2] = pts[i + 1][2] + (pts[i][2] - pts[i + 1][2]) * a; }
      const s = (c.props.scale || 100) / 100; const Rm = mediaRect(c, { ...c.props, cropL: 0, cropR: 0, cropT: 0, cropB: 0 }); const maxX = Math.max(0, (Rm.dw * s - W) / 2), maxY = Math.max(0, (Rm.dh * s - H) / 2);
      delete c.kf.x; delete c.kf.y; const D = tlDur(c); const every = Math.max(1, Math.round(fps * 0.5));
      pts.forEach((p, i) => { if (i % every && i !== pts.length - 1) return; const lt = clamp(frameSnap(p[0]), 0, D); VFX.setKey(c.kf, 'x', lt, Math.round(clamp(-p[1] * s, -maxX, maxX)), 'easeInOut'); if (maxY > 1) VFX.setKey(c.kf, 'y', lt, Math.round(clamp(-p[2] * s, -maxY, maxY)), 'easeInOut'); });
      done++;
    }
  } finally { pm.close(); }
  commit('Smart reframe'); renderTimeline(); renderFx(); drawFrame(); toast(`Smart reframe: ${done} clip(s) now follow their subject in ${aspect}`, 'ok', 5000); return { clips: done };
}
async function smartReframeDialog() {
  const v = await form({ title: 'Smart reframe (follow the subject)', width: 440, fields: [{ key: 'a', label: 'Target aspect ratio', type: 'select', value: PJ.seq.w > PJ.seq.h ? '9:16' : '16:9', options: ASPECTS.map(([a, w, hh]) => ({ value: a, label: `${a} (${w}×${hh})` })) },
    { key: 'follow', label: 'Track the subject and keyframe the framing (uses the clip’s mask or face-blur region if it has one)', type: 'checkbox', value: true }, { key: 'smooth', label: 'Camera smoothness', type: 'range', value: 60, min: 0, max: 95 }] });
  if (!v) return; return smartReframe({ aspect: v.a, follow: v.follow, smooth: +v.smooth / 100 });
}
