// BTS Photo — modern pixel algorithms (harmonize, upscale, distraction removal, sky presets, portrait tools).
// Extends window.PFX. Pure functions on ImageData / typed arrays; a few helpers render into <canvas>.
(() => {
'use strict';
const X = window.PFX;
const { clamp, mk, ctxOf, lum, rng, rgb2lab, lab2rgb, smoothstep, hexToRgb } = X;

// ===================================================================== grayscale morphology (square window, separable)
function filterGray(src, w, h, r, isMax) {
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  if (r < 1) { out.set(src); return out; }
  for (let y = 0; y < h; y++) { const o = y * w; for (let x = 0; x < w; x++) { let m = isMax ? 0 : 255; const a = Math.max(0, x - r), b = Math.min(w - 1, x + r); for (let k = a; k <= b; k++) { const v = src[o + k]; if (isMax ? v > m : v < m) m = v; } tmp[o + x] = m; } }
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) { let m = isMax ? 0 : 255; const a = Math.max(0, y - r), b = Math.min(h - 1, y + r); for (let k = a; k <= b; k++) { const v = tmp[k * w + x]; if (isMax ? v > m : v < m) m = v; } out[y * w + x] = m; }
  return out;
}
const maxGray = (s, w, h, r) => filterGray(s, w, h, r, true), minGray = (s, w, h, r) => filterGray(s, w, h, r, false);
function dilateBits(bits, w, h, r) { if (r < 1) return bits; const s = new Uint8Array(bits.length); for (let i = 0; i < s.length; i++) s[i] = bits[i] ? 255 : 0; const m = maxGray(s, w, h, r); const o = new Uint8Array(bits.length); for (let i = 0; i < o.length; i++) o[i] = m[i] ? 1 : 0; return o; }
// connected components (8-connected) → calls keep(stats) per component; returns filtered bits
function filterComponents(bits, w, h, keep) {
  const lab = new Int32Array(w * h).fill(-1), out = new Uint8Array(w * h), st = []; let id = 0;
  for (let i = 0; i < bits.length; i++) {
    if (!bits[i] || lab[i] >= 0) continue;
    const px = []; st.push(i); lab[i] = id; let x0 = w, y0 = h, x1 = -1, y1 = -1, sum = 0;
    while (st.length) { const p = st.pop(), x = p % w, y = (p - x) / w; px.push(p); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; sum++;
      for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue; const q = yy * w + xx; if (bits[q] && lab[q] < 0) { lab[q] = id; st.push(q); } } } }
    if (keep({ area: sum, w: x1 - x0 + 1, h: y1 - y0 + 1, x0, y0, px })) for (const p of px) out[p] = 1;
    id++;
  }
  return out;
}

// ===================================================================== Lab statistics & harmonize
// stats of RGBA data; weight(i) optional → 0..1 per pixel index; step = pixel stride
function labStatsW(d, weight, step = 1) {
  const o = [0, 0, 0], s = [0, 0, 0], s2 = [0, 0, 0]; let n = 0;
  for (let p = 0, i = 0; i < d.length; p += step, i = p * 4) { const wgt = weight ? weight(p) : (d[i + 3] > 127 ? 1 : 0); if (wgt <= 0) continue; rgb2lab(d[i], d[i + 1], d[i + 2], o); for (let c = 0; c < 3; c++) { s[c] += o[c] * wgt; s2[c] += o[c] * o[c] * wgt; } n += wgt; }
  n = n || 1; const mean = s.map(v => v / n); return { mean, std: s2.map((v, c) => Math.sqrt(Math.max(1e-4, v / n - mean[c] * mean[c]))), n };
}
// p: {src (target/background stats), dst (layer stats), amount, color, lum, contrast, light:{gx,gy,cx,cy,mean}, lighting}
// ctx.x/ctx.y = doc offset of the image's top-left pixel
function harmonize(img, p, ctx) {
  const d = img.data, w = img.width, A = p.amount, kc = p.color * A, kl = p.lum * A, kk = p.contrast ? A : 0;
  const rs = [1, 2].map(c => clamp(p.src.std[c] / p.dst.std[c], 0.4, 2.5)), rl = clamp(p.src.std[0] / p.dst.std[0], 0.5, 2);
  const o = [0, 0, 0], q = [0, 0, 0], lt = p.light, kL = (p.lighting || 0) * A, ox = ctx?.x || 0, oy = ctx?.y || 0;
  for (let i = 0, k = 0; i < d.length; i += 4, k++) {
    if (!d[i + 3]) continue;
    rgb2lab(d[i], d[i + 1], d[i + 2], o);
    let L = o[0], a = o[1], b = o[2];
    const Lt = (L - p.dst.mean[0]) * (1 + (rl - 1) * kk) + p.dst.mean[0] + (p.src.mean[0] - p.dst.mean[0]) * kl; L = Lt;
    a = (a - p.dst.mean[1]) * (1 + (rs[0] - 1) * kk) + p.dst.mean[1] + (p.src.mean[1] - p.dst.mean[1]) * kc;
    b = (b - p.dst.mean[2]) * (1 + (rs[1] - 1) * kk) + p.dst.mean[2] + (p.src.mean[2] - p.dst.mean[2]) * kc;
    if (kL && lt) { const x = (k % w) + ox, y = ((k / w) | 0) + oy; const sh = clamp(((x - lt.cx) * lt.gx + (y - lt.cy) * lt.gy) / Math.max(5, lt.mean), -0.6, 0.6); L *= 1 + sh * kL; }
    lab2rgb(clamp(L, 0, 100), a, b, q); d[i] = q[0]; d[i + 1] = q[1]; d[i + 2] = q[2];
  }
}
// least-squares plane fit of luminance (L*) over the RGBA data: returns {gx, gy, cx, cy, mean} in doc coords
function lightPlane(d, w, h, ox, oy, step = 3) {
  let n = 0, sx = 0, sy = 0, sl = 0, sxx = 0, syy = 0, sxy = 0, sxl = 0, syl = 0; const o = [0, 0, 0];
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) { const i = (y * w + x) * 4; if (d[i + 3] < 128) continue; rgb2lab(d[i], d[i + 1], d[i + 2], o); const X0 = x + ox, Y0 = y + oy, L = o[0]; n++; sx += X0; sy += Y0; sl += L; sxx += X0 * X0; syy += Y0 * Y0; sxy += X0 * Y0; sxl += X0 * L; syl += Y0 * L; }
  if (n < 10) return null;
  const cx = sx / n, cy = sy / n, ml = sl / n, cxx = sxx / n - cx * cx, cyy = syy / n - cy * cy, cxy = sxy / n - cx * cy, cxl = sxl / n - cx * ml, cyl = syl / n - cy * ml;
  const det = cxx * cyy - cxy * cxy; if (Math.abs(det) < 1e-6) return { gx: 0, gy: 0, cx, cy, mean: ml };
  return { gx: (cxl * cyy - cyl * cxy) / det, gy: (cyl * cxx - cxl * cxy) / det, cx, cy, mean: ml };
}

// ===================================================================== Upscale: Lanczos3 + edge-directed smoothing + detail-preserving sharpening (banded, low memory)
const L3 = x => { if (x === 0) return 1; if (x <= -3 || x >= 3) return 0; const px = Math.PI * x; return 3 * Math.sin(px) * Math.sin(px / 3) / (px * px); };
function lanczosTaps(f) { // per output phase: base offset and 6 normalised weights
  const taps = []; for (let ph = 0; ph < f; ph++) { const sx = (ph + 0.5) / f - 0.5, base = Math.floor(sx); const wts = []; let s = 0; for (let k = -2; k <= 3; k++) { const v = L3(sx - (base + k)); wts.push(v); s += v; } taps.push({ base, w: wts.map(v => v / s) }); } return taps;
}
// src: ImageData; returns Promise<canvas>. opts: {edge 0..1, sharpen 0..2, radius, onProgress(fraction)}
async function upscale(src, f, opts = {}) {
  const W = src.width, H = src.height, OW = W * f, OH = H * f, sd = src.data, taps = lanczosTaps(f);
  const edge = opts.edge ?? 0.6, sharp = opts.sharpen ?? 0.6, out = mk(OW, OH), oc = ctxOf(out);
  // premultiplied float source rows are produced lazily, horizontally resampled, kept in a small cache
  const rowCache = new Map(), hrow = y => { y = clamp(y, 0, H - 1); let r = rowCache.get(y); if (r) return r; r = new Float32Array(OW * 4); const o = y * W * 4;
    for (let ox = 0; ox < OW; ox++) { const q = (ox / f) | 0, t = taps[ox - q * f]; let r0 = 0, g0 = 0, b0 = 0, a0 = 0; for (let k = 0; k < 6; k++) { const xx = clamp(q + t.base - 2 + k, 0, W - 1), j = o + xx * 4, wt = t.w[k], a = sd[j + 3]; r0 += sd[j] * a * wt; g0 += sd[j + 1] * a * wt; b0 += sd[j + 2] * a * wt; a0 += a * wt; } const j = ox * 4; r[j] = r0 / 255; r[j + 1] = g0 / 255; r[j + 2] = b0 / 255; r[j + 3] = a0; }
    rowCache.set(y, r); if (rowCache.size > 12) rowCache.delete(rowCache.keys().next().value); return r; };
  const BAND = Math.max(16, Math.min(256, Math.floor(6e6 / OW))), M = 4;
  for (let by0 = 0; by0 < OH; by0 += BAND) {
    const by1 = Math.min(OH, by0 + BAND), ry0 = Math.max(0, by0 - M), ry1 = Math.min(OH, by1 + M), bh = ry1 - ry0, buf = new Float32Array(bh * OW * 4);
    for (let oy = ry0; oy < ry1; oy++) { const q = (oy / f) | 0, t = taps[oy - q * f], rows = []; for (let k = 0; k < 6; k++) rows.push(hrow(q + t.base - 2 + k)); const o = (oy - ry0) * OW * 4;
      for (let j = 0; j < OW * 4; j++) { let v = 0; for (let k = 0; k < 6; k++) v += rows[k][j] * t.w[k]; buf[o + j] = v; } }
    // luminance plane of the band
    const n = bh * OW, Lp = new Float32Array(n); for (let i = 0; i < n; i++) { const j = i * 4; Lp[i] = 0.299 * buf[j] + 0.587 * buf[j + 1] + 0.114 * buf[j + 2]; }
    // ---- edge-directed smoothing along the edge tangent (removes staircase jaggies on diagonals)
    if (edge > 0) {
      const res = new Float32Array(buf), sample = (x, y, c) => { x = clamp(x, 0, OW - 1.001); y = clamp(y, 0, bh - 1.001); const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = (y0 * OW + x0) * 4 + c; return (buf[i] * (1 - fx) + buf[i + 4] * fx) * (1 - fy) + (buf[i + OW * 4] * (1 - fx) + buf[i + OW * 4 + 4] * fx) * fy; };
      for (let y = 1; y < bh - 1; y++) for (let x = 1; x < OW - 1; x++) {
        let jxx = 0, jyy = 0, jxy = 0;
        for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 1 || yy >= bh - 1) continue; for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 1 || xx >= OW - 1) continue; const i = yy * OW + xx, gx = Lp[i + 1] - Lp[i - 1], gy = Lp[i + OW] - Lp[i - OW]; jxx += gx * gx; jyy += gy * gy; jxy += gx * gy; } }
        const tr = jxx + jyy; if (tr < 60) continue;
        const dd = Math.sqrt((jxx - jyy) * (jxx - jyy) + 4 * jxy * jxy), l1 = (tr + dd) / 2, l2 = (tr - dd) / 2, coh = ((l1 - l2) / (l1 + l2 + 1e-6)) ** 2; if (coh < 0.25) continue;
        // tangent = eigenvector of the smaller eigenvalue
        let tx = jxy, ty = l2 - jxx; if (Math.abs(tx) + Math.abs(ty) < 1e-6) { tx = l2 - jyy; ty = jxy; } const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const k = edge * coh * 0.75, i = (y * OW + x) * 4;
        for (let c = 0; c < 4; c++) { const a = sample(x + tx, y + ty, c), b = sample(x - tx, y - ty, c), a2 = sample(x + 2 * tx, y + 2 * ty, c), b2 = sample(x - 2 * tx, y - 2 * ty, c); const sm = buf[i + c] * 0.36 + (a + b) * 0.22 + (a2 + b2) * 0.1; res[i + c] = buf[i + c] + (sm - buf[i + c]) * k; }
      }
      buf.set(res); for (let i = 0; i < n; i++) { const j = i * 4; Lp[i] = 0.299 * buf[j] + 0.587 * buf[j + 1] + 0.114 * buf[j + 2]; }
    }
    // ---- detail-preserving sharpening: unsharp on luminance, clamped to the local 3×3 range (no halos)
    if (sharp > 0) {
      const bl = new Float32Array(Lp); X.gaussChan(bl, OW, bh, Math.max(0.6, (opts.radius ?? 0.55) * f));
      for (let y = 1; y < bh - 1; y++) for (let x = 1; x < OW - 1; x++) { const i = y * OW + x, l = Lp[i]; let mn = l, mx = l; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = Lp[i + dy * OW + dx]; if (v < mn) mn = v; if (v > mx) mx = v; }
        const slack = (mx - mn) * 0.12 + 1.5; const nl = clamp(l + (l - bl[i]) * sharp * 1.6, mn - slack, mx + slack), dl = nl - l; if (!dl) continue; const j = i * 4, a = buf[j + 3] / 255; buf[j] += dl * a; buf[j + 1] += dl * a; buf[j + 2] += dl * a; }
    }
    const id = new ImageData(OW, by1 - by0), od = id.data, off = (by0 - ry0) * OW * 4;
    for (let j = 0; j < od.length; j += 4) { const a = buf[off + j + 3]; if (a <= 0.5) { od[j + 3] = 0; continue; } const k = 255 / a; od[j] = buf[off + j] * k; od[j + 1] = buf[off + j + 1] * k; od[j + 2] = buf[off + j + 2] * k; od[j + 3] = a; }
    oc.putImageData(id, 0, by0);
    if (opts.onProgress) { opts.onProgress(by1 / OH); await new Promise(r => setTimeout(r, 0)); }
  }
  return out;
}

// ===================================================================== distraction removal: detection masks (Uint8 1 = remove)
// thin dark (and optionally bright) line structures — wires, cables, power lines
function detectWires(img, region, p = {}) {
  const w = img.width, h = img.height, d = img.data, n = w * h, Lm = new Uint8Array(n);
  for (let i = 0; i < n; i++) Lm[i] = lum(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
  const r = Math.max(1, Math.round((p.width ?? 6) / 2) + 1), T = 4 + (100 - (p.sens ?? 60)) * 0.5;
  const close = minGray(maxGray(Lm, w, h, r), w, h, r); let resp = new Float32Array(n); for (let i = 0; i < n; i++) resp[i] = close[i] - Lm[i];
  if (p.bright) { const open = maxGray(minGray(Lm, w, h, r), w, h, r); for (let i = 0; i < n; i++) resp[i] = Math.max(resp[i], Lm[i] - open[i]); }
  // only where the background (closing) is smooth — skies, walls
  let smooth = null; if (p.smoothOnly !== false) { const c = new Float32Array(n), c2 = new Float32Array(n); for (let i = 0; i < n; i++) { c[i] = close[i]; c2[i] = close[i] * close[i]; } const rr = r * 2 + 2; X.boxChan(c, w, h, rr); X.boxChan(c2, w, h, rr); smooth = new Uint8Array(n); for (let i = 0; i < n; i++) smooth[i] = c2[i] - c[i] * c[i] < 220 ? 1 : 0; }
  const strong = new Uint8Array(n), weak = new Uint8Array(n);
  for (let i = 0; i < n; i++) { if (region && !region[i]) continue; if (smooth && !smooth[i]) continue; if (resp[i] > T) strong[i] = 1; if (resp[i] > T * 0.45) weak[i] = 1; }
  // hysteresis: weak pixels connected to strong ones
  const st = []; for (let i = 0; i < n; i++) if (strong[i]) st.push(i);
  while (st.length) { const i = st.pop(), x = i % w; for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w, x > 0 ? i - w - 1 : -1, x < w - 1 ? i - w + 1 : -1, x > 0 ? i + w - 1 : -1, x < w - 1 ? i + w + 1 : -1]) { if (j < 0 || j >= n || strong[j] || !weak[j]) continue; strong[j] = 1; st.push(j); } }
  const minLen = p.minLen ?? Math.max(20, r * 8);
  const lines = filterComponents(strong, w, h, c => { const len = Math.max(c.w, c.h, Math.hypot(c.w, c.h) * 0.8); return len >= minLen && c.area / len <= r * 2.2 + 2; });
  return dilateBits(lines, w, h, p.grow ?? 2);
}
// small blobs that differ from the local median — dust, sensor spots, pimples
function detectSpots(img, region, p = {}) {
  const w = img.width, h = img.height, d = img.data, n = w * h, Lm = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) Lm[i] = lum(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
  const maxSize = Math.max(2, p.size ?? 10), r = Math.ceil(maxSize / 2) + 2, med = X.medianChan(Lm, w, h, r), T = 3 + (100 - (p.sens ?? 60)) * 0.35;
  const bits = new Uint8Array(n);
  for (let i = 0; i < n; i++) { if (region && !region[i]) continue; const df = med[i] - Lm[i]; if (df > T || (p.bright && -df > T)) bits[i] = 1; }
  const maxArea = Math.PI * (maxSize / 2) ** 2 * 1.6;
  const spots = filterComponents(bits, w, h, c => c.area <= maxArea && c.w <= maxSize * 1.6 && c.h <= maxSize * 1.6 && c.area >= (p.minArea ?? 2));
  return dilateBits(spots, w, h, p.grow ?? 1);
}

// ===================================================================== sky presets (procedural)
const SKIES = [
  { id: 'blue', name: 'Blue day', stops: [[0, '#2a64c8'], [0.55, '#5f9ce6'], [1, '#bcdcf7']], clouds: { cov: 0.42, col: '#ffffff', shade: '#9fb3cc', scale: 0.32, stretch: 1.6 }, sun: null },
  { id: 'sunset', name: 'Sunset', stops: [[0, '#28245e'], [0.45, '#b24a72'], [0.78, '#f28a4f'], [1, '#ffd38a']], clouds: { cov: 0.36, col: '#ffb36b', shade: '#5a2d5e', scale: 0.28, stretch: 3.2 }, sun: { x: 0.68, y: 0.94, r: 0.5, col: '#ffe2a0', a: 0.9 } },
  { id: 'golden', name: 'Golden hour', stops: [[0, '#3f6fc4'], [0.6, '#9ab6d8'], [1, '#f6cf86']], clouds: { cov: 0.3, col: '#fff1d0', shade: '#b8977a', scale: 0.3, stretch: 2.2 }, sun: { x: 0.25, y: 0.92, r: 0.55, col: '#ffd78a', a: 0.8 } },
  { id: 'dusk', name: 'Dusk', stops: [[0, '#0b1533'], [0.5, '#3b2f6b'], [0.85, '#a5566e'], [1, '#e9906d']], clouds: { cov: 0.25, col: '#6b4e7a', shade: '#1d1a3a', scale: 0.26, stretch: 3.5 }, sun: { x: 0.5, y: 1.02, r: 0.6, col: '#ff9c72', a: 0.55 } },
  { id: 'overcast', name: 'Overcast', stops: [[0, '#7f8791'], [1, '#cdd1d6']], clouds: { cov: 0.92, col: '#d9dce0', shade: '#6d737b', scale: 0.4, stretch: 1.4 }, sun: null },
  { id: 'night', name: 'Night stars', stops: [[0, '#01030c'], [0.7, '#0b1630'], [1, '#22335a']], clouds: null, stars: 0.0016, sun: { x: 0.78, y: 0.2, r: 0.07, col: '#f3f0dd', a: 0.9, moon: true } },
  { id: 'storm', name: 'Dramatic', stops: [[0, '#1f252e'], [0.6, '#4b5563'], [1, '#9aa1aa']], clouds: { cov: 0.7, col: '#b8bec6', shade: '#20262e', scale: 0.35, stretch: 1.8, contrast: 1.6 }, sun: null },
  { id: 'pastel', name: 'Cotton candy', stops: [[0, '#7aa6f0'], [0.6, '#c3b6ec'], [1, '#ffc4dc']], clouds: { cov: 0.38, col: '#fff3fa', shade: '#c9a3c7', scale: 0.3, stretch: 2 }, sun: null },
];
function renderSky(id, w, h, seed = 7) {
  const S = SKIES.find(s => s.id === id) || SKIES[0];
  const k = Math.min(1, 900 / Math.max(w, h)), sw = Math.max(8, Math.round(w * k)), sh = Math.max(8, Math.round(h * k));
  const c = mk(sw, sh), x = ctxOf(c), g = x.createLinearGradient(0, 0, 0, sh); S.stops.forEach(([p, col]) => g.addColorStop(p, col)); x.fillStyle = g; x.fillRect(0, 0, sw, sh);
  if (S.sun) { const s = S.sun, cx = s.x * sw, cy = s.y * sh, rr = s.r * Math.max(sw, sh); const gr = x.createRadialGradient(cx, cy, 0, cx, cy, rr); const [r0, g0, b0] = hexToRgb(s.col); gr.addColorStop(0, `rgba(${r0},${g0},${b0},${s.a})`); gr.addColorStop(s.moon ? 0.35 : 0.15, `rgba(${r0},${g0},${b0},${s.a * (s.moon ? 0.9 : 0.6)})`); gr.addColorStop(1, `rgba(${r0},${g0},${b0},0)`); x.globalCompositeOperation = 'screen'; x.fillStyle = gr; x.fillRect(0, 0, sw, sh); x.globalCompositeOperation = 'source-over'; if (s.moon) { x.fillStyle = s.col; x.beginPath(); x.arc(cx, cy, Math.max(3, rr * 0.28), 0, 7); x.fill(); } }
  const id2 = x.getImageData(0, 0, sw, sh), d = id2.data, R = rng(seed);
  if (S.clouds) {
    const C = S.clouds, N = X.valueNoise2D(seed), sc = Math.max(sw, sh) * C.scale, [cr, cg, cb] = hexToRgb(C.col), [hr, hg, hb] = hexToRgb(C.shade), con = C.contrast || 1;
    for (let y = 0; y < sh; y++) { const fy = y / sh, persp = 0.55 + fy * 1.4; for (let xx = 0; xx < sw; xx++) {
      const nx = xx / sc / C.stretch * persp, ny = y / sc * persp * 1.6; let v = X.fbm(N, nx, ny, 6, 0.52); v = smoothstep(1 - C.cov - 0.12, 1 - C.cov + 0.22, v * 0.85 + 0.12); if (v <= 0.002) continue;
      const lightv = clamp(0.5 + (X.fbm(N, nx + 0.07, ny - 0.11, 4, 0.5) - X.fbm(N, nx, ny, 4, 0.5)) * 6 * con + (1 - fy) * 0.25, 0, 1), a = clamp(v * (0.75 + 0.25 * (1 - fy)), 0, 1) * (0.92 - fy * 0.25);
      const j = (y * sw + xx) * 4, cR = hr + (cr - hr) * lightv, cG = hg + (cg - hg) * lightv, cB = hb + (cb - hb) * lightv; d[j] += (cR - d[j]) * a; d[j + 1] += (cG - d[j + 1]) * a; d[j + 2] += (cB - d[j + 2]) * a; } }
  }
  if (S.stars) { const nStars = Math.round(sw * sh * S.stars); for (let s = 0; s < nStars; s++) { const xx = (R() * sw) | 0, y = (R() * sh * 0.85) | 0, b = 120 + R() * 135 * (1 - y / sh * 0.6), j = (y * sw + xx) * 4; d[j] = Math.max(d[j], b); d[j + 1] = Math.max(d[j + 1], b); d[j + 2] = Math.max(d[j + 2], b + 10); if (R() < 0.08 && xx > 0 && xx < sw - 1) { for (const o of [-4, 4]) { d[j + o] = Math.max(d[j + o], b * 0.5); d[j + o + 1] = Math.max(d[j + o + 1], b * 0.5); d[j + o + 2] = Math.max(d[j + o + 2], b * 0.55); } } } }
  x.putImageData(id2, 0, 0);
  if (sw === w && sh === h) return c;
  const o = mk(w, h), ox = ctxOf(o); ox.imageSmoothingQuality = 'high'; ox.drawImage(c, 0, 0, w, h); return o;
}

// ===================================================================== portrait
// soft skin-tone likelihood 0..1 (YCbCr box with soft edges)
function skinMask(img) {
  const d = img.data, n = img.width * img.height, m = new Float32Array(n);
  for (let i = 0; i < n; i++) { const j = i * 4, r = d[j], g = d[j + 1], b = d[j + 2]; const y = 0.299 * r + 0.587 * g + 0.114 * b, cb = 128 - 0.1687 * r - 0.3313 * g + 0.5 * b, cr = 128 + 0.5 * r - 0.4187 * g - 0.0813 * b;
    m[i] = smoothstep(70, 82, cb) * (1 - smoothstep(122, 134, cb)) * smoothstep(128, 140, cr) * (1 - smoothstep(170, 182, cr)) * smoothstep(35, 70, y) * (d[j + 3] / 255); }
  return m;
}
// p: {amt 0..100, r radius px, detail 0..100, onlySkin}
function skinSmooth(img, p, ctx) {
  const w = img.width, h = img.height, d = img.data, n = w * h, sc = ctx?.scale || 1, r = Math.max(1, Math.round((p.r ?? 8) * sc)), amt = (p.amt ?? 60) / 100, det = (p.detail ?? 25) / 100;
  let m = p.onlySkin === false ? new Float32Array(n).fill(1) : skinMask(img); if (p.onlySkin !== false) X.gaussPlane(m, w, h, Math.max(1, r * 0.6));
  const eps = 0.0025 + (p.amt ?? 60) / 100 * 0.006, orig = new Uint8ClampedArray(d);
  for (let c = 0; c < 3; c++) {
    const I = new Float32Array(n); for (let i = 0; i < n; i++) I[i] = orig[i * 4 + c] / 255;
    const q = X.guidedFilter(I, I, w, h, r, eps), fine = new Float32Array(I); X.gaussChan(fine, w, h, Math.max(0.5, 0.8 * sc));
    for (let i = 0; i < n; i++) { const k = m[i] * amt; if (k <= 0.002) continue; const tex = (I[i] - fine[i]) * det; d[i * 4 + c] = (I[i] + (q[i] + tex - I[i]) * k) * 255; }
  }
}
// pull-push fill: fill pixels where known[i] < 0.5 from surrounding known colours (RGBA Uint8ClampedArray in place)
function pullPushFill(data, w, h, known) {
  // level: avg colour (v) + confidence (wt 0..1); pull = weighted average, push = blend with the upsampled coarser level
  const L0 = { w, h, v: new Float32Array(w * h * 4), wt: new Float32Array(w * h) };
  for (let i = 0; i < w * h; i++) { L0.wt[i] = clamp(known[i], 0, 1); for (let c = 0; c < 4; c++) L0.v[i * 4 + c] = data[i * 4 + c]; }
  const lv = [L0];
  while (lv[lv.length - 1].w > 1 || lv[lv.length - 1].h > 1) {
    const a = lv[lv.length - 1], nw = Math.max(1, Math.ceil(a.w / 2)), nh = Math.max(1, Math.ceil(a.h / 2)), v = new Float32Array(nw * nh * 4), wt = new Float32Array(nw * nh);
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { const i = y * a.w + x, o = (y >> 1) * nw + (x >> 1), q = a.wt[i]; if (!q) continue; wt[o] += q; for (let c = 0; c < 4; c++) v[o * 4 + c] += a.v[i * 4 + c] * q; }
    for (let o = 0; o < nw * nh; o++) if (wt[o] > 0) { const k = 1 / wt[o]; for (let c = 0; c < 4; c++) v[o * 4 + c] *= k; wt[o] = Math.min(1, wt[o]); }
    lv.push({ w: nw, h: nh, v, wt });
  }
  for (let l = lv.length - 2; l >= 0; l--) { const a = lv[l], b = lv[l + 1];
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { const i = y * a.w + x, ww = a.wt[i]; if (ww >= 1) continue;
      const bx = clamp((x - 0.5) / 2, 0, b.w - 1), by = clamp((y - 0.5) / 2, 0, b.h - 1), x0 = Math.floor(bx), y0 = Math.floor(by), x1 = Math.min(b.w - 1, x0 + 1), y1 = Math.min(b.h - 1, y0 + 1), fx = bx - x0, fy = by - y0;
      for (let c = 0; c < 4; c++) { const up = (b.v[(y0 * b.w + x0) * 4 + c] * (1 - fx) + b.v[(y0 * b.w + x1) * 4 + c] * fx) * (1 - fy) + (b.v[(y1 * b.w + x0) * 4 + c] * (1 - fx) + b.v[(y1 * b.w + x1) * 4 + c] * fx) * fy; a.v[i * 4 + c] = a.v[i * 4 + c] * ww + up * (1 - ww); }
      a.wt[i] = 1; } }
  const v = L0.v; for (let i = 0; i < w * h; i++) if (known[i] < 0.5) for (let c = 0; c < 4; c++) data[i * 4 + c] = v[i * 4 + c];
  return data;
}

Object.assign(X, { maxGray, minGray, dilateBits, filterComponents, labStatsW, harmonize, lightPlane, upscale, lanczosTaps, detectWires, detectSpots, SKIES, renderSky, skinMask, skinSmooth, pullPushFill });
X.flt.skinSmooth = skinSmooth;
})();
