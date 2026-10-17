// BTS Video — rendering engine (shared by preview and export), playback, preview audio graph and meters.
'use strict';
const prog = $('#program'); const pctx = prog.getContext('2d');
const EXP = { on: false, cancel: false, frames: null };
function layoutMonitor() {
  const rs = ST.rs; prog.width = Math.max(2, Math.round(PJ.seq.w * rs)); prog.height = Math.max(2, Math.round(PJ.seq.h * rs));
  const v = $('#monView').getBoundingClientRect(); const k = Math.max(0.01, Math.min((v.width - 20) / PJ.seq.w, (v.height - 20) / PJ.seq.h));
  prog.style.width = PJ.seq.w * k + 'px'; prog.style.height = PJ.seq.h * k + 'px'; ST.monK = k;
  const sf = $('#safe'); sf.classList.toggle('hidden', !ST.safe); Object.assign(sf.style, { width: PJ.seq.w * k * 0.9 + 'px', height: PJ.seq.h * k * 0.9 + 'px' });
  $('#seqInfo').textContent = `${PJ.seq.w}×${PJ.seq.h} · ${PJ.seq.fps} fps${rs < 1 ? ` · preview ${rs === 0.5 ? '½' : '¼'}` : ''}${ST.useProxies ? ' · proxies' : ''}`;
  drawFrame();
}

// ---------------------------------------------------------------------  media elements & preview audio
const els = new Map(); // clip id -> media element
let audioCtx = null, masterGain = null, recDest = null, meterL = null, meterR = null;
function ensureAudio() {
  if (audioCtx) return; audioCtx = new AudioContext(); masterGain = audioCtx.createGain(); masterGain.connect(audioCtx.destination);
  recDest = audioCtx.createMediaStreamDestination(); masterGain.connect(recDest);
  const sp = audioCtx.createChannelSplitter(2); masterGain.connect(sp); meterL = audioCtx.createAnalyser(); meterR = audioCtx.createAnalyser(); meterL.fftSize = meterR.fftSize = 1024; sp.connect(meterL, 0); sp.connect(meterR, 1);
}
function resetElements() { els.forEach(e => { try { e.pause(); e.removeAttribute('src'); e.load(); } catch { } }); els.clear(); }
function mediaUrl(m) { return ST.useProxies && m.lowres ? fileUrl(m.lowres) : m.url; }
function elFor(c) {
  let e = els.get(c.id); const m = mediaById(c.mediaId); if (!m || m.missing) return null;
  if (m.kind === 'image') return m.el || null;
  const url = mediaUrl(m); if (e && e._url === url) return e;
  if (e) { try { e.pause(); } catch { } }
  e = document.createElement(c.type === 'audio' || m.kind === 'audio' ? 'audio' : 'video'); e.src = url; e.preload = 'auto'; e.playsInline = true; e._url = url; e.crossOrigin = 'anonymous';
  e.addEventListener('seeked', () => { if (!ST.playing && !EXP.on) drawFrameSoon(); });
  e.addEventListener('loadeddata', () => { if (!ST.playing && !EXP.on) drawFrameSoon(); });
  try {
    ensureAudio(); const src = audioCtx.createMediaElementSource(e);
    const hp = audioCtx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 10;
    const comp = audioCtx.createDynamicsCompressor(); comp.threshold.value = 0; comp.ratio.value = 1;
    const g = audioCtx.createGain(); const pan = audioCtx.createStereoPanner();
    src.connect(hp); hp.connect(comp); comp.connect(g); g.connect(pan); pan.connect(masterGain); Object.assign(e, { _gain: g, _hp: hp, _comp: comp, _pan: pan });
  } catch (err) { /* already connected */ }
  els.set(c.id, e); return e;
}
function activeClips(t) { return PJ.clips.filter(c => c.start <= t + 1e-6 && cEnd(c) > t + 1e-6 && !(trackById(c.track)?.hidden && c.type !== 'audio')); }
function transitionsAt(t) { const out = []; for (const tr of PJ.transitions) { const I = trInfo(tr); if (I && t >= I.t0 - 1e-6 && t < I.t1 - 1e-6) out.push(I); } return out; }
// Visual clips that must be rendered at t (includes the handles used by transitions)
function videoClipsAt(t) {
  const list = activeClips(t).filter(isVisual);
  for (const I of transitionsAt(t)) { if (trackById(I.tr.track)?.hidden) continue; [I.A, I.B].forEach(c => { if (c && !list.includes(c)) list.push(c); }); }
  return list;
}
function normGain(c) { const m = mediaById(c.mediaId); if (!m || !m.peaks) return 1; const n = m.peaks.length; let mx = 0; const a = Math.floor(c.in / m.dur * n), b = Math.ceil(c.out / m.dur * n); for (let i = Math.max(0, a); i < Math.min(n, b); i++) mx = Math.max(mx, m.peaks[i]); return mx > 0.01 ? clamp(0.89 / mx, 0.25, 8) : 1; }
function audioGainAt(c, t) { const lt = t - c.start, D = tlDur(c); const P = evalProps(c, lt); return (P.volume / 100) * fadeK(P, lt, D) * (P.normalize ? normGain(c) : 1); }
function syncMedia(playing) {
  const touched = new Set();
  syncSeq(ST.t, playing, { rate: 1, gain: 1 }, touched, 0);
  els.forEach((e, id) => { if (!touched.has(id) && !e.paused) e.pause(); });
  if (typeof updateBleep === 'function') updateBleep(playing);
}
// syncs the media elements of the current sequence at time t; nested sequences recurse with their own time,
// rate (nest speed) and gain (nest volume × fades)
function syncSeq(t, playing, outer, touched, depth) {
  const vlist = videoClipsAt(t); const vis = new Set(vlist.filter(c => c.type === 'video').map(c => c.id));
  const alist = activeClips(t); const aud = new Set(alist.filter(c => c.type === 'audio' || c.type === 'video').map(c => c.id));
  const fwd = ST.rate > 0 ? ST.rate : 1;
  PJ.clips.forEach(c => {
    if (c.type === 'nest') {
      if (depth > 4 || !(vlist.includes(c) || alist.includes(c))) return; const sd = nestSeq(c); if (!sd) return;
      const tr = trackById(c.track); const g = alist.includes(c) && !tr.muted && !c.props.detached && !EXP.silent ? audioGainAt(c, t) : 0;
      const tau = srcTime(c, t); withSeq(sd, () => syncSeq(tau, playing, { rate: outer.rate * spd(c), gain: outer.gain * g }, touched, depth + 1)); return;
    }
    if (c.type !== 'video' && c.type !== 'audio') return;
    const need = vis.has(c.id) || (c.type === 'audio' && aud.has(c.id));
    const e = need ? elFor(c) : els.get(c.id); if (!e) return;
    if (!need) return; touched.add(c.id);
    const m = mediaById(c.mediaId); const target = clamp(srcTime(c, t), 0, Math.max(0, (m.dur || 1e9) - 0.04));
    const tr = trackById(c.track); const P = c.props;
    const audible = aud.has(c.id) && hasAudioOf(c) && !tr.muted && !(c.type === 'video' && tr.muted);
    const vol = audible && !EXP.silent ? audioGainAt(c, t) * outer.gain : 0;
    e.muted = false; if (e._gain) { e._gain.gain.value = vol; e.volume = 1; e._pan.pan.value = clamp((P.pan || 0) / 100, -1, 1); e._hp.frequency.value = P.voice ? 90 : 10; e._comp.threshold.value = P.voice ? -26 : 0; e._comp.ratio.value = P.voice ? 4 : 1; } else e.volume = clamp(vol, 0, 1);
    const frozen = P.freeze != null; const inRange = srcTime(c, t) >= 0 && srcTime(c, t) < (m.dur || 1e9) - 0.04;
    const sp = spd(c) * outer.rate; e.playbackRate = clamp(sp * fwd, 0.0625, 16);
    if (playing && !frozen && inRange && ST.rate > 0) { if (Math.abs(e.currentTime - target) > 0.3 * Math.max(1, fwd * outer.rate)) e.currentTime = target; if (e.paused) e.play().catch(() => { }); }
    else { if (!e.paused) e.pause(); if (Math.abs(e.currentTime - target) > 0.02) e.currentTime = target; }
  });
}

// ---------------------------------------------------------------------  clip drawing
function legacyFilter(P) { const f = []; if (P.brightness !== 100) f.push(`brightness(${P.brightness / 100})`); if (P.contrast !== 100) f.push(`contrast(${P.contrast / 100})`); if (P.saturation !== 100) f.push(`saturate(${P.saturation / 100})`); if (P.hue) f.push(`hue-rotate(${P.hue}deg)`); if (P.grayscale) f.push(`grayscale(${P.grayscale / 100})`); if (P.sepia) f.push(`sepia(${P.sepia / 100})`); if (P.blur) f.push(`blur(${P.blur}px)`); return f.join(' ') || 'none'; }
function applyTransform(x, P) { x.translate(PJ.seq.w / 2 + P.x, PJ.seq.h / 2 + P.y); if (P.rotation) x.rotate(P.rotation * Math.PI / 180); const s = P.scale / 100; x.scale(s, s); }
function frameSourceOf(c) { if (c.type === 'image') return mediaById(c.mediaId)?.el || null; if (c.type === 'nest') return null; return EXP.frames?.get(c.id) || els.get(c.id) || null; }
// renders a nested sequence at the nest clip's source time into a reusable canvas (transparent where the nest is empty)
const nestCv = new Map();
function nestFrame(c, t) {
  const sd = nestSeq(c); if (!sd || seqDepth > 4) return null; const rs = EXP.on ? 1 : ST.rs;
  const w = Math.max(2, Math.round(sd.seq.w * rs)), hh = Math.max(2, Math.round(sd.seq.h * rs)); const key = c.id + ':' + seqDepth;
  let cv = nestCv.get(key); if (!cv) { cv = document.createElement('canvas'); nestCv.set(key, cv); } if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; }
  const x = cv.getContext('2d'); const tau = srcTime(c, t); withSeq(sd, () => renderAt(x, tau, rs, { transparent: true })); return cv;
}
// rectangle the media occupies (centred coordinates, before the clip transform)
function mediaRect(c, P, eOver) {
  const W = PJ.seq.w, H = PJ.seq.h; const m = mediaById(c.mediaId); const e = eOver || frameSourceOf(c); const nsd = c.type === 'nest' && !eOver ? nestSeq(c) : null;
  const sw = nsd ? nsd.seq.w : (e && (e.videoWidth || e.naturalWidth || e.width)) || m?.w || W, sh = nsd ? nsd.seq.h : (e && (e.videoHeight || e.naturalHeight || e.height)) || m?.h || H;
  let dw, dh; if (P.fit === 'stretch') { dw = W; dh = H; } else { const k = P.fit === 'fill' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh); dw = sw * k; dh = sh * k; }
  const cl = clamp(P.cropL, 0, 100) / 100, cr = clamp(P.cropR, 0, 100) / 100, ct = clamp(P.cropT, 0, 100) / 100, cb = clamp(P.cropB, 0, 100) / 100;
  return { sw, sh, dw, dh, cl, cr, ct, cb, x: -dw / 2 + dw * cl, y: -dh / 2 + dh * ct, w: Math.max(0, dw * (1 - cl - cr)), h: Math.max(0, dh * (1 - ct - cb)) };
}
// Draws the clip's content centred at the origin of x (which already carries the clip transform). Returns the content rect.
function drawSource(x, c, P, t, lt, D) {
  const W = PJ.seq.w, H = PJ.seq.h; const full = { x: -W / 2, y: -H / 2, w: W, h: H };
  if (c.type === 'color') {
    if (P.grad === 'linear') { const a = (P.angle - 90) * Math.PI / 180, r = Math.hypot(W, H) / 2; const g = x.createLinearGradient(-Math.cos(a) * r, -Math.sin(a) * r, Math.cos(a) * r, Math.sin(a) * r); g.addColorStop(0, P.color); g.addColorStop(1, P.color2); x.fillStyle = g; }
    else if (P.grad === 'radial') { const g = x.createRadialGradient(0, 0, 0, 0, 0, Math.hypot(W, H) / 2); g.addColorStop(0, P.color); g.addColorStop(1, P.color2); x.fillStyle = g; }
    else x.fillStyle = P.color;
    x.fillRect(-W / 2 - 2, -H / 2 - 2, W + 4, H + 4); return full;
  }
  if (c.type === 'title') { drawTitle(x, P, clamp(lt, 0, D), D); return full; }
  if (c.type === 'shape') return drawShape(x, P);
  const e = c.type === 'nest' ? nestFrame(c, t) : frameSourceOf(c); const R = mediaRect(c, P, c.type === 'nest' ? e : null);
  if (!e) return R;
  const ready = c.type === 'image' || c.type === 'nest' || e instanceof ImageBitmap || e instanceof HTMLCanvasElement || e.readyState >= 2; if (!ready || !R.sw || !R.sh || R.w <= 0 || R.h <= 0) return R;
  if (P.bgFill === 'blur' && P.fit === 'fit') { x.save(); const k = Math.max(W / R.sw, H / R.sh); x.filter = `blur(${Math.round(Math.min(W, H) / 22)}px) brightness(0.75)`; x.drawImage(e, -R.sw * k / 2, -R.sh * k / 2, R.sw * k, R.sh * k); x.restore(); }
  x.drawImage(e, R.sw * R.cl, R.sh * R.ct, R.sw * (1 - R.cl - R.cr), R.sh * (1 - R.ct - R.cb), R.x, R.y, R.w, R.h);
  return R;
}
function drawShape(x, P) {
  const w = P.w, hh = P.h; x.save(); x.beginPath(); const R = { x: -w / 2, y: -hh / 2, w, h: hh };
  x.fillStyle = P.fill; x.strokeStyle = P.stroke; x.lineWidth = P.strokeW; x.lineJoin = 'round';
  switch (P.shape) {
    case 'ellipse': x.ellipse(0, 0, w / 2, hh / 2, 0, 0, Math.PI * 2); break;
    case 'triangle': x.moveTo(0, -hh / 2); x.lineTo(w / 2, hh / 2); x.lineTo(-w / 2, hh / 2); x.closePath(); break;
    case 'arrow': { const sh = hh * 0.36; x.moveTo(-w / 2, -sh / 2); x.lineTo(w / 2 - hh / 2, -sh / 2); x.lineTo(w / 2 - hh / 2, -hh / 2); x.lineTo(w / 2, 0); x.lineTo(w / 2 - hh / 2, hh / 2); x.lineTo(w / 2 - hh / 2, sh / 2); x.lineTo(-w / 2, sh / 2); x.closePath(); break; }
    case 'star': { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.4 : 1; x.lineTo(Math.cos(a) * w / 2 * r, Math.sin(a) * hh / 2 * r); } x.closePath(); break; }
    case 'heart': { x.moveTo(0, hh * 0.35); x.bezierCurveTo(-w * 0.6, -hh * 0.1, -w * 0.3, -hh * 0.62, 0, -hh * 0.25); x.bezierCurveTo(w * 0.3, -hh * 0.62, w * 0.6, -hh * 0.1, 0, hh * 0.35); x.closePath(); break; }
    case 'line': x.rect(-w / 2, -Math.max(2, hh) / 2, w, Math.max(2, hh)); break;
    case 'emoji': x.font = `${hh}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(P.text || '⭐', 0, hh * 0.05); x.restore(); return R;
    default: x.roundRect(-w / 2, -hh / 2, w, hh, Math.min(P.radius, w / 2, hh / 2));
  }
  x.fill(); if (P.strokeW > 0) x.stroke(); x.restore(); return R;
}
const easeOut = u => 1 - Math.pow(1 - u, 3);
const easeOutBack = u => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };
const easeOutBounce = u => { const n = 7.5625, d = 2.75; if (u < 1 / d) return n * u * u; if (u < 2 / d) return n * (u -= 1.5 / d) * u + 0.75; if (u < 2.5 / d) return n * (u -= 2.25 / d) * u + 0.9375; return n * (u -= 2.625 / d) * u + 0.984375; };
const hash2 = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
const GLITCH_CH = '!<>-_\\/[]{}=+*^?#%&$@';
// per-glyph animations: return the transform/opacity of glyph i (of n) in word wi
const GLYPH_ANIMS = {
  letters: (g, lt, sz) => { const u = clamp((lt - g.i * 0.045) / 0.3, 0, 1); return { al: u, dy: (1 - easeOut(u)) * sz * 0.4 }; },
  words: (g, lt, sz) => { const u = clamp((lt - g.wi * 0.2) / 0.28, 0, 1); const e = easeOut(u); return { al: u, dy: (1 - e) * sz * 0.3, sc: 0.85 + 0.15 * e }; },
  bounce: (g, lt, sz) => { const u = clamp((lt - g.i * 0.04) / 0.7, 0, 1); return { al: clamp(u * 5, 0, 1), dy: -(1 - easeOutBounce(u)) * sz * 1.2 }; },
  wave: (g, lt, sz) => ({ al: clamp(lt / 0.4, 0, 1), dy: Math.sin(lt * 6 - g.i * 0.55) * sz * 0.14 }),
  trackIn: (g, lt, sz) => { const u = clamp(lt / 0.9, 0, 1); return { al: u, dx: (g.li - (g.ln - 1) / 2) * sz * 0.7 * (1 - easeOut(u)) }; },
  drop: (g, lt, sz) => { const u = clamp((lt - g.i * 0.05) / 0.5, 0, 1); return { al: u > 0 ? 1 : 0, dy: -(1 - easeOutBounce(u)) * sz * 2.2, rot: (1 - u) * 0.6 * (g.i % 2 ? 1 : -1) }; },
  flip: (g, lt) => { const u = clamp((lt - g.i * 0.035) / 0.4, 0, 1); return { al: u > 0 ? 1 : 0, sy: Math.max(0.02, easeOutBack(u)) }; },
  scramble: (g, lt) => { const r = 0.25 + g.i * 0.035; return { al: clamp(lt / 0.2, 0, 1), txt: lt < r && g.ch.trim() ? GLITCH_CH[Math.floor(hash2(Math.floor(lt * 20), g.i) * GLITCH_CH.length)] : g.ch }; },
  karaoke: (g, lt, sz, D) => ({ al: clamp(lt / 0.25, 0, 1), hi: g.i / Math.max(1, g.n) < lt / Math.max(0.3, D * 0.8) }),
  glitch: (g, lt, sz) => { const fr = Math.floor(lt * 14); const burst = lt < 0.6 || (lt % 1.3) < 0.18; const k = lt < 0.6 ? 0.6 : 0.25;
    if (!burst || hash2(fr, g.i) > k) return { al: 1 }; return { al: 1, dx: (hash2(fr, g.i + 9) - 0.5) * sz * 0.35, dy: (hash2(fr + 3, g.i) - 0.5) * sz * 0.12, txt: hash2(fr, g.i + 5) < 0.4 && g.ch.trim() ? GLITCH_CH[Math.floor(hash2(fr, g.i + 7) * GLITCH_CH.length)] : g.ch, split: true }; },
  neon: () => ({ al: 1 }),
};
function bellPath(x, s) { x.beginPath(); x.moveTo(-s * 0.5, s * 0.32); x.quadraticCurveTo(-s * 0.36, s * 0.18, -s * 0.36, -s * 0.05); x.quadraticCurveTo(-s * 0.36, -s * 0.42, 0, -s * 0.44); x.quadraticCurveTo(s * 0.36, -s * 0.42, s * 0.36, -s * 0.05); x.quadraticCurveTo(s * 0.36, s * 0.18, s * 0.5, s * 0.32); x.closePath(); x.moveTo(s * 0.12, s * 0.4); x.arc(0, s * 0.4, s * 0.12, 0, Math.PI); }
function drawTitle(x, P, lt, D) {
  const W = PJ.seq.w, H = PJ.seq.h;
  let text = P.text;
  if (P.style === 'countdown') { const n = Math.max(1, Math.ceil(P.count - lt / D * P.count - 1e-6)); text = String(n); }
  const lines = String(text).split('\n'); const size = P.size; const lh = size * (P.lineH || 1.2);
  let a = 1, dy = 0, dx = 0, sc = 1, chars = Infinity, wipe = 1, glyph = null, blurPx = 0, cursor = false, neon = false;
  const ai = clamp(lt / 0.6, 0, 1), ao = clamp((D - lt) / 0.6, 0, 1);
  switch (P.anim) {
    case 'fade': a = Math.min(ai, ao); break;
    case 'pop': sc = 0.6 + 0.4 * easeOut(clamp(lt / 0.35, 0, 1)) + (lt < 0.35 ? Math.sin(lt / 0.35 * Math.PI) * 0.08 : 0); a = Math.min(clamp(lt / 0.15, 0, 1), ao); break;
    case 'slide': dx = -(1 - easeOut(ai)) * W * 0.25; a = Math.min(ai, ao); break;
    case 'rise': dy = (1 - easeOut(ai)) * 90; a = Math.min(ai, ao); break;
    case 'type': chars = Math.floor(lt * 18); cursor = true; a = ao; break;
    case 'wipe': wipe = easeOut(clamp(lt / 0.8, 0, 1)); a = ao; break;
    case 'roll': dy = H / 2 + lines.length * lh / 2 - (lt / D) * (lines.length * lh + H); break;
    case 'zoomIn': { const u = easeOut(clamp(lt / 0.7, 0, 1)); sc = 2.2 - 1.2 * u; a = Math.min(clamp(lt / 0.35, 0, 1), ao); break; }
    case 'blurIn': { const u = easeOut(clamp(lt / 0.8, 0, 1)); blurPx = (1 - u) * size * 0.3; sc = 1.08 - 0.08 * u; a = Math.min(clamp(lt / 0.5, 0, 1), ao); break; }
    case 'neon': { neon = true; glyph = GLYPH_ANIMS.neon; const fr = Math.floor(lt * 16); a = (lt < 1.4 ? (hash2(fr, 1) > 0.62 - lt * 0.4 ? 1 : 0.15) : 0.92 + 0.08 * hash2(fr, 2)) * ao; break; }
    default: if (GLYPH_ANIMS[P.anim]) { glyph = GLYPH_ANIMS[P.anim]; a = ao; }
  }
  x.globalAlpha *= clamp(a, 0, 1); x.translate(dx, dy); x.scale(sc, sc); if (blurPx > 0.3) x.filter = `blur(${blurPx * (x.getTransform().a || 1)}px)`;
  const fontOf = (sz, wt) => `${P.italic ? 'italic ' : ''}${wt} ${sz}px "${P.font}", "Segoe UI", ${VCAP.DEVA_FONTS}, sans-serif`;
  x.font = fontOf(size, P.weight); x.textBaseline = 'middle'; try { x.letterSpacing = (P.spacing || 0) + 'px'; } catch { }
  // per-line sizes: lower thirds / quotes use a smaller second line
  const lsz = lines.map((l, i) => (P.style === 'lower3' && i > 0) || (P.style === 'quote' && /^[—-]/.test(l)) ? size * 0.58 : size);
  const widths = lines.map((l, i) => { x.font = fontOf(lsz[i], i > 0 && P.style === 'lower3' ? 400 : P.weight); return x.measureText(l).width; });
  const maxW = Math.max(...widths, 1); const lhs = lsz.map(s => s * (P.lineH || 1.2)); const totalH = lhs.reduce((s, v) => s + v, 0);
  const pad = size * 0.35;
  if (P.style === 'card') { x.save(); x.globalAlpha *= P.boxOpacity / 100; x.fillStyle = P.boxColor; x.fillRect(-W, -H, W * 2, H * 2); x.restore(); x.save(); x.fillStyle = P.accent; x.fillRect(-Math.min(maxW, W * 0.3) / 2 * wipe, totalH / 2 + pad * 0.8, Math.min(maxW, W * 0.3) * wipe, Math.max(3, size * 0.06)); x.restore(); }
  if (P.style === 'lower3') { const bw = (maxW + pad * 2) * easeOut(clamp(lt / 0.5, 0, 1)); x.save(); x.globalAlpha *= P.boxOpacity / 100; x.fillStyle = P.boxColor; x.fillRect(-maxW / 2 - pad, -totalH / 2 - pad * 0.5, bw, totalH + pad); x.restore(); x.fillStyle = P.accent; x.fillRect(-maxW / 2 - pad - size * 0.14, -totalH / 2 - pad * 0.5, size * 0.14, totalH + pad); }
  else if (P.style === 'cta') {
    const pulse = 1 + Math.max(0, Math.sin((lt - 0.6) * 5)) * 0.04 * (lt > 0.6 ? 1 : 0); x.scale(pulse, pulse);
    const bh = totalH + pad * 1.3, bw = maxW + pad * 2 + size * 1.25; x.fillStyle = P.accent; x.beginPath(); x.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2); x.fill();
    x.save(); x.translate(-bw / 2 + pad + size * 0.4, 0); x.rotate(Math.sin(lt * 14) * 0.25 * clamp(1.5 - lt, 0, 1)); x.fillStyle = P.color; bellPath(x, size * 0.85); x.fill(); x.restore();
    x.translate(size * 0.55, 0);
  }
  else if (P.style === 'quote') { x.save(); x.font = `700 ${size * 2.2}px Georgia, serif`; x.fillStyle = P.accent; x.textAlign = 'center'; x.fillText('“', 0, -totalH / 2 - size * 0.55); x.restore(); }
  else if (P.style === 'countdown') {
    const per = D / P.count, frac = (lt % per) / per; const r = Math.max(maxW, size) * 0.85;
    x.save(); x.lineWidth = size * 0.06; x.strokeStyle = 'rgba(255,255,255,.25)'; x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = P.accent; x.lineWidth = size * 0.1; x.beginPath(); x.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); x.stroke();
    x.lineWidth = 2; x.strokeStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.moveTo(-W, 0); x.lineTo(-r * 1.15, 0); x.moveTo(r * 1.15, 0); x.lineTo(W, 0); x.moveTo(0, -H); x.lineTo(0, -r * 1.15); x.moveTo(0, r * 1.15); x.lineTo(0, H); x.stroke(); x.restore();
  }
  if (P.box && P.style !== 'lower3' && P.style !== 'cta' && P.style !== 'card') { x.save(); x.globalAlpha *= P.boxOpacity / 100; x.fillStyle = P.boxColor; x.beginPath(); x.roundRect(-maxW / 2 - pad, -totalH / 2 - pad * 0.6, maxW + pad * 2, totalH + pad * 1.2, size * 0.15); x.fill(); x.restore(); }
  if (wipe < 1) { x.save(); x.beginPath(); x.rect(-maxW / 2 - pad, -totalH / 2 - pad - H, (maxW + pad * 2) * wipe, totalH + pad * 2 + H * 2); x.clip(); }
  const nChars = lines.reduce((s, l) => s + [...l].length, 0); let wordsN = 0; lines.forEach(l => { wordsN += l.split(/\s+/).filter(Boolean).length; });
  let shown = 0, idx = 0, wi = -1, y = -totalH / 2;
  lines.forEach((ln, i) => {
    const cy = y + lhs[i] / 2; y += lhs[i]; const wt = i > 0 && P.style === 'lower3' ? 400 : P.weight; x.font = fontOf(lsz[i], wt);
    const lw = widths[i]; const startX = P.align === 'left' ? -maxW / 2 : P.align === 'right' ? maxW / 2 - lw : -lw / 2;
    const glowCol = P.outline ? P.outlineColor : P.accent;
    const style = () => { if (neon) { x.shadowColor = glowCol; x.shadowBlur = lsz[i] * 0.45; } else if (P.shadow) { x.shadowColor = VFX.rgba(P.shadowColor || '#000000', 0.6); x.shadowBlur = lsz[i] * 0.15; x.shadowOffsetY = lsz[i] * 0.04; } };
    const paint = (txt, px, py, col) => { x.textAlign = 'left'; style(); if (P.outline) { x.lineWidth = P.outline * 2; x.strokeStyle = P.outlineColor; x.lineJoin = 'round'; x.strokeText(txt, px, py); if (!neon) x.shadowColor = 'transparent'; } x.fillStyle = col || P.color; x.fillText(txt, px, py); if (neon) x.fillText(txt, px, py); x.shadowColor = 'transparent'; x.shadowBlur = 0; x.shadowOffsetY = 0; };
    if (glyph) {
      const glyphs = [...ln]; let px = startX; let prevSpace = true;
      glyphs.forEach((ch, li) => {
        const space = !ch.trim(); if (!space && prevSpace) wi++; prevSpace = space; const cw = x.measureText(ch).width;
        const g = glyph({ i: idx, n: nChars, wi: Math.max(0, wi), nw: wordsN, li, ln: glyphs.length, ch }, lt, lsz[i], D); idx++;
        if ((g.al ?? 1) > 0.001 && !space) {
          x.save(); x.globalAlpha *= clamp(g.al ?? 1, 0, 1); x.translate(px + cw / 2 + (g.dx || 0), cy + (g.dy || 0)); if (g.rot) x.rotate(g.rot); x.scale(g.sc || 1, (g.sc || 1) * (g.sy ?? 1));
          const txt = g.txt ?? ch; const tw = x.measureText(txt).width;
          if (g.split) { x.save(); x.globalCompositeOperation = 'lighter'; x.globalAlpha *= 0.75; x.fillStyle = '#ff2a6d'; x.fillText(txt, -tw / 2 - lsz[i] * 0.05, 0); x.fillStyle = '#05d9e8'; x.fillText(txt, -tw / 2 + lsz[i] * 0.05, 0); x.restore(); }
          paint(txt, -tw / 2, 0, g.hi ? P.accent : null); x.restore();
        }
        px += cw;
      });
    } else {
      let txt = ln; if (chars !== Infinity) { txt = ln.slice(0, Math.max(0, chars - shown)); shown += ln.length; }
      if (txt) paint(txt, startX, cy);
      if (cursor && chars !== Infinity && (chars < shown || i === lines.length - 1) && (chars - (shown - ln.length)) >= 0 && (chars - (shown - ln.length)) <= ln.length && Math.floor(lt * 2.5) % 2 === 0) { const cx2 = startX + x.measureText(txt).width + size * 0.04; x.fillStyle = P.color; x.fillRect(cx2, cy - lsz[i] * 0.42, Math.max(2, lsz[i] * 0.06), lsz[i] * 0.84); }
    }
  });
  if (wipe < 1) x.restore();
  x.filter = 'none';
}
// ---------------------------------------------------------------------  masks (ellipse / rectangle / pen-bezier, keyframeable)
const MASK_KEYS = ['x', 'y', 'w', 'h', 'rot', 'feather', 'expand', 'opacity'];
function evalMasks(c, lt) {
  if (!c.masks || !c.masks.length) return []; const kf = c.kf || {};
  return c.masks.filter(m => m.on !== false).map(m => {
    const g = { ...m }; MASK_KEYS.forEach(k => { const kk = kf[`mask:${m.id}:${k}`]; if (kk && kk.length) g[k] = VFX.evalKf(kk, lt); });
    const kp = kf[`mask:${m.id}:pts`]; if (kp && kp.length) { const flat = VFX.evalKf(kp, lt); g.pts = []; for (let i = 0; i + 1 < flat.length; i += 2) g.pts.push([flat[i], flat[i + 1]]); }
    return g;
  });
}
// builds the mask outline in clip-local units (origin = clip centre, before the clip's motion transform)
function maskPath(x, m, noBegin) {
  if (!noBegin) x.beginPath(); const a = (m.rot || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a); const P = (px, py) => [m.x + px * ca - py * sa, m.y + px * sa + py * ca];
  if (m.type === 'ellipse') { x.ellipse(m.x, m.y, Math.max(0.5, Math.abs(m.w) / 2), Math.max(0.5, Math.abs(m.h) / 2), a, 0, Math.PI * 2); return; }
  if (m.type === 'rect') { const w = m.w / 2, hh = m.h / 2; [[-w, -hh], [w, -hh], [w, hh], [-w, hh]].forEach(([px, py], i) => { const q = P(px, py); i ? x.lineTo(...q) : x.moveTo(...q); }); x.closePath(); return; }
  const pts = (m.pts || []).map(([px, py]) => P(px, py)); const n = pts.length; if (n < 2) return;
  if (!m.smooth || n < 3) { pts.forEach((q, i) => i ? x.lineTo(...q) : x.moveTo(...q)); x.closePath(); return; }
  // closed Catmull-Rom spline through the points, drawn as cubic Béziers
  x.moveTo(...pts[0]);
  for (let i = 0; i < n; i++) { const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    x.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]); }
  x.closePath();
}
function applyMasks(L, masks, rs) {
  const W = L.width, H = L.height; const M = VFX.getCanvas(W, H), mx = M.getContext('2d');
  if ((masks[0].mode || 'add') !== 'add') { mx.fillStyle = '#fff'; mx.fillRect(0, 0, W, H); }
  masks.forEach((m, i) => {
    const S = VFX.getCanvas(W, H), sx = S.getContext('2d'); sx.setTransform(rs, 0, 0, rs, W / 2, H / 2); sx.fillStyle = sx.strokeStyle = '#fff'; sx.lineJoin = 'round';
    if (m.invert) { sx.save(); sx.setTransform(1, 0, 0, 1, 0, 0); sx.fillRect(0, 0, W, H); sx.restore(); sx.globalCompositeOperation = 'destination-out'; }
    maskPath(sx, m); sx.fill();
    if (m.expand > 0) { sx.lineWidth = m.expand * 2; sx.stroke(); }
    else if (m.expand < 0) { sx.globalCompositeOperation = m.invert ? 'source-over' : 'destination-out'; sx.lineWidth = -m.expand * 2; sx.stroke(); }
    let src = S; if (m.feather > 0) { const F = VFX.getCanvas(W, H), fx = F.getContext('2d'); fx.filter = `blur(${m.feather * rs / 2}px)`; fx.drawImage(S, 0, 0); VFX.release(S); src = F; }
    mx.globalAlpha = clamp((m.opacity ?? 100) / 100, 0, 1); const mode = m.mode || 'add'; mx.globalCompositeOperation = mode === 'subtract' ? 'destination-out' : mode === 'intersect' && i > 0 ? 'destination-in' : 'source-over';
    mx.drawImage(src, 0, 0); VFX.release(src);
  });
  const lx = L.getContext('2d'); lx.save(); lx.setTransform(1, 0, 0, 1, 0, 0); lx.globalAlpha = 1; lx.filter = 'none'; lx.globalCompositeOperation = 'destination-in'; lx.drawImage(M, 0, 0); lx.restore(); VFX.release(M);
}
// Renders a single clip onto ctx (ctx pixel size = seq × rs)
function drawClipTo(ctx, c, t, rs) {
  const W = PJ.seq.w, H = PJ.seq.h, lt = t - c.start, D = tlDur(c);
  const P = evalProps(c, lt); const alpha = clamp(P.opacity / 100, 0, 1) * fadeK(P, lt, D); if (alpha <= 0.001) return;
  const fxs = evalFx(c, lt).filter(f => f.on && VFX.EFFECTS[f.type]);
  const pix = fxs.filter(f => VFX.EFFECTS[f.type].stage !== 'composite'), comp = fxs.filter(f => VFX.EFFECTS[f.type].stage === 'composite');
  const lu = VFX.luActive(P.lu); const lf = legacyFilter(P); const mk = evalMasks(c, lt);
  if (c.type === 'adjust') {
    const L = VFX.copyOf(ctx.canvas); VFX.applyStack(L, pix, { rs, t }); if (lu) VFX.runPasses(L, [VFX.luPass(P.lu)], t); if (mk.length) applyMasks(L, mk, rs);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha; ctx.filter = lf; ctx.drawImage(L, 0, 0); ctx.restore(); VFX.release(L); return;
  }
  ctx.save();
  if (!pix.length && !comp.length && !lu && !mk.length) {
    ctx.setTransform(rs, 0, 0, rs, 0, 0); ctx.globalAlpha = alpha; ctx.filter = lf; applyTransform(ctx, P);
    drawSource(ctx, c, P, t, lt, D); ctx.restore(); return;
  }
  const L = VFX.getCanvas(ctx.canvas.width, ctx.canvas.height); const lx = L.getContext('2d'); lx.setTransform(rs, 0, 0, rs, L.width / 2, L.height / 2); lx.filter = lf;
  const R = drawSource(lx, c, P, t, lt, D) || { x: -W / 2, y: -H / 2, w: W, h: H }; lx.filter = 'none';
  VFX.applyStack(L, pix, { rs, t }); if (lu) VFX.runPasses(L, [VFX.luPass(P.lu)], t); if (mk.length) applyMasks(L, mk, rs);
  const cs = VFX.compositeStage(L, comp, R, rs);
  ctx.setTransform(rs, 0, 0, rs, 0, 0); ctx.globalAlpha = alpha; applyTransform(ctx, P);
  if (cs.shadow) { const s = cs.shadow, k = rs * P.scale / 100, a = s.angle * Math.PI / 180; ctx.shadowColor = VFX.rgba(s.color, s.opacity / 100); ctx.shadowBlur = s.blur * k; ctx.shadowOffsetX = Math.cos(a) * s.dist * k; ctx.shadowOffsetY = Math.sin(a) * s.dist * k; }
  ctx.drawImage(cs.canvas, -W / 2, -H / 2, W, H);
  ctx.restore(); VFX.release(L); if (cs.made) VFX.release(cs.made);
}
function renderAt(ctx, t, rs = 1, opts = {}) {
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over'; if (opts.transparent) ctx.clearRect(0, 0, cw, ch); else { ctx.fillStyle = PJ.seq.bg; ctx.fillRect(0, 0, cw, ch); } ctx.restore();
  const vids = PJ.tracks.filter(k => k.kind === 'video' && !k.hidden).reverse(); // V1 (bottom) first
  const act = videoClipsAt(t); const trs = transitionsAt(t);
  for (const tk of vids) {
    const T = trs.find(I => I.tr.track === tk.id);
    act.filter(c => c.track === tk.id && (!T || (c !== T.A && c !== T.B))).sort((a, b) => a.start - b.start).forEach(c => drawClipTo(ctx, c, t, rs));
    if (T) {
      const lay = c => { if (!c) return null; const L = VFX.getCanvas(cw, ch); drawClipTo(L.getContext('2d'), c, t, rs); return L; };
      const LA = lay(T.A), LB = lay(T.B); const p = clamp((t - T.t0) / Math.max(1e-6, T.t1 - T.t0), 0, 1);
      VFX.drawTransition(ctx, T.tr.kind, LA, LB, p, T.tr.id.length * 7 + 3); VFX.release(LA); VFX.release(LB);
    }
  }
  if (PJ.capBurn || !EXP.on) { const cap = captionAt(t); if (cap && (EXP.on ? PJ.capBurn : ST.capShow !== false)) { ctx.save(); ctx.setTransform(rs, 0, 0, rs, 0, 0); VCAP.draw(ctx, PJ.censor && PJ.censor.on && PJ.censor.words.length ? { ...cap, text: VCAP.censor(cap.text, PJ.censor.words) } : cap, PJ.capStyle, PJ.seq.w, PJ.seq.h); ctx.restore(); } }
}
function captionAt(t) { return PJ.captions.find(c => t >= c.start && t < c.end); }
function drawFrame() { if (!EXP.on) { renderAt(pctx, ST.t, ST.rs); drawOverlay(); if (typeof scopesTick === 'function') scopesTick(); if (typeof transcriptTick === 'function') transcriptTick(); } }
let dfT = null; function drawFrameSoon() { if (dfT) return; dfT = requestAnimationFrame(() => { dfT = null; if (!ST.playing) syncMedia(false); drawFrame(); }); }

// ---------------------------------------------------------------------  transport
function seek(t) { ST.t = clamp(t, 0, Math.max(seqDuration(), 0)); if (ST.playing) playBase = { wall: performance.now(), t: ST.t }; placePlayhead(); syncMedia(ST.playing && ST.rate > 0); drawFrame(); autoscroll(); if (typeof renderFxSoon === 'function') renderFxSoon(); }
function autoscroll() { const sc = $('#tlScroll'); const x = ST.t * ST.pps; if (x < sc.scrollLeft + 20 || x > sc.scrollLeft + sc.clientWidth - 40) sc.scrollLeft = x - sc.clientWidth * 0.3; }
let playBase = null;
function togglePlay() { ST.playing ? pause() : play(1); }
function play(rate = 1) {
  if (!PJ.clips.length) return; ensureAudio(); audioCtx.resume();
  ST.rate = rate; if (rate > 0 && ST.t >= seqDuration() - 0.01) ST.t = 0;
  ST.playing = true; playBase = { wall: performance.now(), t: ST.t }; $('#bPlay').innerHTML = icon('pause'); syncMedia(rate > 0); requestAnimationFrame(loop); meterLoop();
}
function pause() { const was = ST.playing; ST.playing = false; ST.rate = 1; $('#bPlay').innerHTML = icon('play'); syncMedia(false); drawFrame(); if (was && typeof renderFx === 'function') renderFx(); }
function shuttle(dir) {
  if (dir === 0) return pause();
  if (!ST.playing || Math.sign(ST.rate) !== dir) return play(dir);
  const r = clamp(Math.abs(ST.rate) * 2, 1, 8) * dir; ST.rate = r; playBase = { wall: performance.now(), t: ST.t }; syncMedia(r > 0); setStatus(`Shuttle ${r > 0 ? '▶' : '◀'} ${Math.abs(r)}×`);
}
function loop() {
  if (!ST.playing) return;
  ST.t = playBase.t + (performance.now() - playBase.wall) / 1000 * ST.rate;
  const endT = ST.loopIO && ST.outP != null ? ST.outP : seqDuration();
  if (ST.rate > 0 && ST.t >= endT) { if (ST.loopIO && ST.inP != null) { ST.t = ST.inP; playBase = { wall: performance.now(), t: ST.t }; syncMedia(true); } else { ST.t = endT; pause(); placePlayhead(); return; } }
  if (ST.rate < 0 && ST.t <= 0) { ST.t = 0; pause(); placePlayhead(); return; }
  syncMedia(ST.rate > 0); renderAt(pctx, ST.t, ST.rs); drawOverlay(); placePlayhead(); autoscroll(); if (ST.recording) updateRecording(); if (typeof scopesTick === 'function') scopesTick(); if (typeof transcriptTick === 'function') transcriptTick();
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------------  censor bleep in the preview (1 kHz tone, programme muted)
let bleepOsc = null, bleepGain = null; const bleepCache = { key: null, ranges: [] };
function bleepRanges() {
  const key = hi + ':' + PJ.activeSeq + ':' + JSON.stringify(PJ.censor); if (bleepCache.key === key) return bleepCache.ranges;
  bleepCache.key = key; bleepCache.ranges = PJ.censor && PJ.censor.words.length ? VCAP.bleepRanges(PJ.captions, PJ.censor.words, PJ.censor.estimate) : []; return bleepCache.ranges;
}
function updateBleep(playing) {
  if (!audioCtx || !masterGain) return;
  const on = playing && !EXP.on && PJ.censor && PJ.censor.on && PJ.censor.bleep && PJ.censor.words.length > 0;
  const hit = on && bleepRanges().some(([a, b]) => ST.t >= a && ST.t < b);
  if (hit && !bleepOsc) { bleepOsc = audioCtx.createOscillator(); bleepOsc.frequency.value = 1000; bleepGain = audioCtx.createGain(); bleepGain.gain.value = 0; bleepOsc.connect(bleepGain); bleepGain.connect(audioCtx.destination); bleepOsc.start(); }
  masterGain.gain.value = hit ? 0 : 1; if (bleepGain) bleepGain.gain.value = hit ? 0.2 : 0;
}

// ---------------------------------------------------------------------  audio meters
const meterBuf = new Float32Array(1024); const meterState = { l: -60, r: -60, pl: -60, pr: -60, plT: 0, prT: 0 }; let meterRunning = false;
function meterLoop() {
  if (meterRunning) return; meterRunning = true;
  const step = () => {
    const cv = $('#meters'); if (!cv) { meterRunning = false; return; }
    const lv = an => { if (!an || !ST.playing) return -60; an.getFloatTimeDomainData(meterBuf); let m = 0; for (let i = 0; i < meterBuf.length; i++) m = Math.max(m, Math.abs(meterBuf[i])); return m > 0 ? Math.max(-60, 20 * Math.log10(m)) : -60; };
    const now = performance.now();
    for (const [k, an] of [['l', meterL], ['r', meterR]]) { const v = lv(an); meterState[k] = v > meterState[k] ? v : Math.max(v, meterState[k] - 1.2); const pk = 'p' + k; if (meterState[k] >= meterState[pk] || now - meterState[pk + 'T'] > 1500) { meterState[pk] = meterState[k]; meterState[pk + 'T'] = now; } }
    drawMeters(cv);
    if (ST.playing || meterState.l > -59 || meterState.r > -59) requestAnimationFrame(step); else { meterRunning = false; drawMeters(cv); }
  };
  requestAnimationFrame(step);
}
function cssVar(n, fb) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || getComputedStyle(document.body).getPropertyValue(n).trim() || fb; }
function drawMeters(cv) {
  const dpr = devicePixelRatio || 1; const Wc = cv.clientWidth || 30, Hc = cv.clientHeight || 200; if (cv.width !== Wc * dpr || cv.height !== Hc * dpr) { cv.width = Wc * dpr; cv.height = Hc * dpr; }
  const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, Wc, Hc);
  const top = 6, bot = Hc - 16, bh = bot - top; const yOf = db => top + bh * (1 - (db + 60) / 60);
  x.fillStyle = cssVar('--bg-0', '#111'); x.fillRect(0, 0, Wc, Hc);
  const bw = 7; const xs = [Wc / 2 - bw - 1, Wc / 2 + 1];
  [['l', xs[0]], ['r', xs[1]]].forEach(([k, bx]) => {
    x.fillStyle = cssVar('--bg-3', '#222'); x.fillRect(bx, top, bw, bh);
    const v = meterState[k]; if (v > -60) { const g = x.createLinearGradient(0, bot, 0, top); g.addColorStop(0, '#2fbf71'); g.addColorStop(0.7, '#2fbf71'); g.addColorStop(0.85, '#f5c542'); g.addColorStop(1, '#ff4d4f'); x.fillStyle = g; x.fillRect(bx, yOf(v), bw, bot - yOf(v)); }
    const p = meterState['p' + k]; if (p > -60) { x.fillStyle = p > -1 ? '#ff4d4f' : cssVar('--tx-0', '#fff'); x.fillRect(bx, yOf(p) - 1, bw, 2); }
  });
  x.fillStyle = cssVar('--tx-3', '#777'); x.font = '8px sans-serif'; x.textAlign = 'center'; x.fillText('L R', Wc / 2, Hc - 4);
}
