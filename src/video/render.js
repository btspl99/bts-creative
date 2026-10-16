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
  const t = ST.t; const vis = new Set(videoClipsAt(t).filter(c => c.type === 'video').map(c => c.id));
  const aud = new Set(activeClips(t).filter(c => c.type === 'audio' || c.type === 'video').map(c => c.id));
  const fwd = ST.rate > 0 ? ST.rate : 1;
  PJ.clips.forEach(c => {
    if (c.type !== 'video' && c.type !== 'audio') return;
    const need = vis.has(c.id) || (c.type === 'audio' && aud.has(c.id));
    const e = need ? elFor(c) : els.get(c.id); if (!e) return;
    if (!need) { if (!e.paused) e.pause(); return; }
    const m = mediaById(c.mediaId); const target = clamp(srcTime(c, t), 0, Math.max(0, (m.dur || 1e9) - 0.04));
    const tr = trackById(c.track); const P = c.props;
    const audible = aud.has(c.id) && hasAudioOf(c) && !tr.muted && !(c.type === 'video' && tr.muted);
    const vol = audible && !EXP.silent ? audioGainAt(c, t) : 0;
    e.muted = false; if (e._gain) { e._gain.gain.value = vol; e.volume = 1; e._pan.pan.value = clamp((P.pan || 0) / 100, -1, 1); e._hp.frequency.value = P.voice ? 90 : 10; e._comp.threshold.value = P.voice ? -26 : 0; e._comp.ratio.value = P.voice ? 4 : 1; } else e.volume = clamp(vol, 0, 1);
    const frozen = P.freeze != null; const inRange = srcTime(c, t) >= 0 && srcTime(c, t) < (m.dur || 1e9) - 0.04;
    e.playbackRate = clamp(spd(c) * fwd, 0.0625, 16);
    if (playing && !frozen && inRange && ST.rate > 0) { if (Math.abs(e.currentTime - target) > 0.3 * Math.max(1, fwd)) e.currentTime = target; if (e.paused) e.play().catch(() => { }); }
    else { if (!e.paused) e.pause(); if (Math.abs(e.currentTime - target) > 0.02) e.currentTime = target; }
  });
}

// ---------------------------------------------------------------------  clip drawing
function legacyFilter(P) { const f = []; if (P.brightness !== 100) f.push(`brightness(${P.brightness / 100})`); if (P.contrast !== 100) f.push(`contrast(${P.contrast / 100})`); if (P.saturation !== 100) f.push(`saturate(${P.saturation / 100})`); if (P.hue) f.push(`hue-rotate(${P.hue}deg)`); if (P.grayscale) f.push(`grayscale(${P.grayscale / 100})`); if (P.sepia) f.push(`sepia(${P.sepia / 100})`); if (P.blur) f.push(`blur(${P.blur}px)`); return f.join(' ') || 'none'; }
function applyTransform(x, P) { x.translate(PJ.seq.w / 2 + P.x, PJ.seq.h / 2 + P.y); if (P.rotation) x.rotate(P.rotation * Math.PI / 180); const s = P.scale / 100; x.scale(s, s); }
function frameSourceOf(c) { if (c.type === 'image') return mediaById(c.mediaId)?.el || null; return EXP.frames?.get(c.id) || els.get(c.id) || null; }
// rectangle the media occupies (centred coordinates, before the clip transform)
function mediaRect(c, P) {
  const W = PJ.seq.w, H = PJ.seq.h; const m = mediaById(c.mediaId); const e = frameSourceOf(c);
  const sw = (e && (e.videoWidth || e.naturalWidth || e.width)) || m?.w || W, sh = (e && (e.videoHeight || e.naturalHeight || e.height)) || m?.h || H;
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
  const e = frameSourceOf(c); const R = mediaRect(c, P);
  if (!e) return R;
  const ready = c.type === 'image' || e instanceof ImageBitmap || e.readyState >= 2; if (!ready || !R.sw || !R.sh || R.w <= 0 || R.h <= 0) return R;
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
function bellPath(x, s) { x.beginPath(); x.moveTo(-s * 0.5, s * 0.32); x.quadraticCurveTo(-s * 0.36, s * 0.18, -s * 0.36, -s * 0.05); x.quadraticCurveTo(-s * 0.36, -s * 0.42, 0, -s * 0.44); x.quadraticCurveTo(s * 0.36, -s * 0.42, s * 0.36, -s * 0.05); x.quadraticCurveTo(s * 0.36, s * 0.18, s * 0.5, s * 0.32); x.closePath(); x.moveTo(s * 0.12, s * 0.4); x.arc(0, s * 0.4, s * 0.12, 0, Math.PI); }
function drawTitle(x, P, lt, D) {
  const W = PJ.seq.w, H = PJ.seq.h;
  let text = P.text;
  if (P.style === 'countdown') { const n = Math.max(1, Math.ceil(P.count - lt / D * P.count - 1e-6)); text = String(n); }
  const lines = String(text).split('\n'); const size = P.size; const lh = size * (P.lineH || 1.2);
  let a = 1, dy = 0, dx = 0, sc = 1, chars = Infinity, wipe = 1, letters = false;
  const ai = clamp(lt / 0.6, 0, 1), ao = clamp((D - lt) / 0.6, 0, 1);
  switch (P.anim) {
    case 'fade': a = Math.min(ai, ao); break;
    case 'pop': sc = 0.6 + 0.4 * easeOut(clamp(lt / 0.35, 0, 1)) + (lt < 0.35 ? Math.sin(lt / 0.35 * Math.PI) * 0.08 : 0); a = Math.min(clamp(lt / 0.15, 0, 1), ao); break;
    case 'slide': dx = -(1 - easeOut(ai)) * W * 0.25; a = Math.min(ai, ao); break;
    case 'rise': dy = (1 - easeOut(ai)) * 90; a = Math.min(ai, ao); break;
    case 'type': chars = Math.floor(lt * 18); a = ao; break;
    case 'wipe': wipe = easeOut(clamp(lt / 0.8, 0, 1)); a = ao; break;
    case 'letters': letters = true; a = ao; break;
    case 'roll': dy = H / 2 + lines.length * lh / 2 - (lt / D) * (lines.length * lh + H); break;
  }
  x.globalAlpha *= clamp(a, 0, 1); x.translate(dx, dy); x.scale(sc, sc);
  const fontOf = (sz, wt) => `${P.italic ? 'italic ' : ''}${wt} ${sz}px "${P.font}", "Segoe UI", sans-serif`;
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
  let shown = 0, idx = 0, y = -totalH / 2;
  lines.forEach((ln, i) => {
    const cy = y + lhs[i] / 2; y += lhs[i]; const wt = i > 0 && P.style === 'lower3' ? 400 : P.weight; x.font = fontOf(lsz[i], wt);
    const lw = widths[i]; const startX = P.align === 'left' ? -maxW / 2 : P.align === 'right' ? maxW / 2 - lw : -lw / 2;
    const style = () => { if (P.shadow) { x.shadowColor = VFX.rgba(P.shadowColor || '#000000', 0.6); x.shadowBlur = lsz[i] * 0.15; x.shadowOffsetY = lsz[i] * 0.04; } };
    const paint = (txt, px, py) => { x.textAlign = 'left'; style(); if (P.outline) { x.lineWidth = P.outline * 2; x.strokeStyle = P.outlineColor; x.lineJoin = 'round'; x.strokeText(txt, px, py); x.shadowColor = 'transparent'; } x.fillStyle = P.color; x.fillText(txt, px, py); x.shadowColor = 'transparent'; };
    if (letters) {
      let px = startX; for (const ch of ln) { const u = clamp((lt - idx * 0.045) / 0.3, 0, 1); idx++; const cw = x.measureText(ch).width; if (u > 0) { x.save(); x.globalAlpha *= u; paint(ch, px, cy + (1 - easeOut(u)) * lsz[i] * 0.4); x.restore(); } px += cw; }
    } else {
      let txt = ln; if (chars !== Infinity) { txt = ln.slice(0, Math.max(0, chars - shown)); shown += ln.length; }
      if (txt) paint(txt, startX, cy);
    }
  });
  if (wipe < 1) x.restore();
}
// Renders a single clip onto ctx (ctx pixel size = seq × rs)
function drawClipTo(ctx, c, t, rs) {
  const W = PJ.seq.w, H = PJ.seq.h, lt = t - c.start, D = tlDur(c);
  const P = evalProps(c, lt); const alpha = clamp(P.opacity / 100, 0, 1) * fadeK(P, lt, D); if (alpha <= 0.001) return;
  const fxs = evalFx(c, lt).filter(f => f.on && VFX.EFFECTS[f.type]);
  const pix = fxs.filter(f => VFX.EFFECTS[f.type].stage !== 'composite'), comp = fxs.filter(f => VFX.EFFECTS[f.type].stage === 'composite');
  const lu = VFX.luActive(P.lu); const lf = legacyFilter(P);
  if (c.type === 'adjust') {
    const L = VFX.copyOf(ctx.canvas); VFX.applyStack(L, pix, { rs, t }); if (lu) VFX.runPasses(L, [VFX.luPass(P.lu)], t);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha; ctx.filter = lf; ctx.drawImage(L, 0, 0); ctx.restore(); VFX.release(L); return;
  }
  ctx.save();
  if (!pix.length && !comp.length && !lu) {
    ctx.setTransform(rs, 0, 0, rs, 0, 0); ctx.globalAlpha = alpha; ctx.filter = lf; applyTransform(ctx, P);
    drawSource(ctx, c, P, t, lt, D); ctx.restore(); return;
  }
  const L = VFX.getCanvas(ctx.canvas.width, ctx.canvas.height); const lx = L.getContext('2d'); lx.setTransform(rs, 0, 0, rs, L.width / 2, L.height / 2); lx.filter = lf;
  const R = drawSource(lx, c, P, t, lt, D) || { x: -W / 2, y: -H / 2, w: W, h: H }; lx.filter = 'none';
  VFX.applyStack(L, pix, { rs, t }); if (lu) VFX.runPasses(L, [VFX.luPass(P.lu)], t);
  const cs = VFX.compositeStage(L, comp, R, rs);
  ctx.setTransform(rs, 0, 0, rs, 0, 0); ctx.globalAlpha = alpha; applyTransform(ctx, P);
  if (cs.shadow) { const s = cs.shadow, k = rs * P.scale / 100, a = s.angle * Math.PI / 180; ctx.shadowColor = VFX.rgba(s.color, s.opacity / 100); ctx.shadowBlur = s.blur * k; ctx.shadowOffsetX = Math.cos(a) * s.dist * k; ctx.shadowOffsetY = Math.sin(a) * s.dist * k; }
  ctx.drawImage(cs.canvas, -W / 2, -H / 2, W, H);
  ctx.restore(); VFX.release(L); if (cs.made) VFX.release(cs.made);
}
function renderAt(ctx, t, rs = 1) {
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = PJ.seq.bg; ctx.fillRect(0, 0, cw, ch); ctx.restore();
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
  if (PJ.capBurn || !EXP.on) { const cap = captionAt(t); if (cap && (EXP.on ? PJ.capBurn : ST.capShow !== false)) { ctx.save(); ctx.setTransform(rs, 0, 0, rs, 0, 0); VCAP.draw(ctx, cap, PJ.capStyle, PJ.seq.w, PJ.seq.h); ctx.restore(); } }
}
function captionAt(t) { return PJ.captions.find(c => t >= c.start && t < c.end); }
function drawFrame() { if (!EXP.on) { renderAt(pctx, ST.t, ST.rs); drawOverlay(); } }
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
  syncMedia(ST.rate > 0); renderAt(pctx, ST.t, ST.rs); drawOverlay(); placePlayhead(); autoscroll(); if (ST.recording) updateRecording();
  requestAnimationFrame(loop);
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
