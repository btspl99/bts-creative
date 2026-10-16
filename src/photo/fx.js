// BTS Photo — pixel processing library (pure functions on ImageData / typed arrays).
// Everything here is synchronous and DOM-free except the few helpers that use an OffscreenCanvas-like <canvas>.
(() => {
'use strict';
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const ctxOf = c => c.getContext('2d', { willReadFrequently: true });
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-6), 0, 1); return t * t * (3 - 2 * t); };
const hexToRgb = hx => { const n = parseInt((hx || '#000000').slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const lut = f => { const t = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) t[i] = f(i); return t; };
const applyLut = (d, r, g, b) => { g = g || r; b = b || r; for (let i = 0; i < d.length; i += 4) { d[i] = r[d[i]]; d[i + 1] = g[d[i + 1]]; d[i + 2] = b[d[i + 2]]; } };
// seeded RNG (mulberry32)
function rng(seed) { let a = (seed >>> 0) || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ===================================================================== colour space helpers
function rgb2hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; } return [h, s, l]; }
function hsl2rgb(h, s, l) { if (!s) return [l * 255, l * 255, l * 255]; const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = t => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]; }
const srgbToLin = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
function rgb2lab(r, g, b, out) {
  const R = srgbToLin[r | 0], G = srgbToLin[g | 0], B = srgbToLin[b | 0];
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, y = R * 0.2126 + G * 0.7152 + B * 0.0722, z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; x = f(x); y = f(y); z = f(z);
  out[0] = 116 * y - 16; out[1] = 500 * (x - y); out[2] = 200 * (y - z); return out;
}
function lab2rgb(L, a, bb, out) {
  let y = (L + 16) / 116, x = a / 500 + y, z = y - bb / 200; const f = t => { const t3 = t * t * t; return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787; };
  x = f(x) * 0.95047; y = f(y); z = f(z) * 1.08883;
  let r = x * 3.2406 + y * -1.5372 + z * -0.4986, g = x * -0.9689 + y * 1.8758 + z * 0.0415, b = x * 0.0557 + y * -0.2040 + z * 1.0570;
  const g2 = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055) * 255;
  out[0] = g2(r); out[1] = g2(g); out[2] = g2(b); return out;
}

// ===================================================================== blur primitives (single channel Float32)
function boxH(src, dst, w, h, r) {
  if (r < 1) { dst.set(src); return; } const iarr = 1 / (r + r + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w, fv = src[o], lv = src[o + w - 1]; let val = (r + 1) * fv;
    for (let j = 0; j < r; j++) val += src[o + (j < w ? j : w - 1)];
    for (let x = 0; x < w; x++) { const a = x + r, b = x - r - 1; val += (a < w ? src[o + a] : lv) - (b >= 0 ? src[o + b] : fv); dst[o + x] = val * iarr; }
  }
}
function boxV(src, dst, w, h, r) {
  if (r < 1) { dst.set(src); return; } const iarr = 1 / (r + r + 1), acc = new Float64Array(w);
  for (let x = 0; x < w; x++) acc[x] = (r + 1) * src[x];
  for (let j = 0; j < r; j++) { const o = Math.min(j, h - 1) * w; for (let x = 0; x < w; x++) acc[x] += src[o + x]; }
  for (let y = 0; y < h; y++) {
    const ao = Math.min(y + r, h - 1) * w, so = y - r - 1 >= 0 ? (y - r - 1) * w : 0, o = y * w;
    for (let x = 0; x < w; x++) { acc[x] += src[ao + x] - src[so + x]; dst[o + x] = acc[x] * iarr; }
  }
}
function boxSizes(sigma, n = 3) { const wIdeal = Math.sqrt((12 * sigma * sigma / n) + 1); let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--; const wu = wl + 2; const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4); const m = Math.round(mIdeal); const s = []; for (let i = 0; i < n; i++) s.push(((i < m ? wl : wu) - 1) / 2); return s; }
function gaussChan(ch, w, h, sigma, tmp) {
  if (sigma < 0.3) return ch; tmp = tmp || new Float32Array(ch.length);
  for (const r of boxSizes(sigma)) { boxH(ch, tmp, w, h, Math.round(r)); boxV(tmp, ch, w, h, Math.round(r)); }
  return ch;
}
function boxChan(ch, w, h, r, tmp) { tmp = tmp || new Float32Array(ch.length); boxH(ch, tmp, w, h, r); boxV(tmp, ch, w, h, r); return ch; }
function isOpaque(d) { for (let i = 3; i < d.length; i += 4) if (d[i] !== 255) return false; return true; }
// apply a single-channel op to every RGBA channel (premultiplied so transparent edges do not bleed black)
function perChannel(img, op) {
  const d = img.data, n = img.width * img.height, opaque = isOpaque(d);
  const ch = new Float32Array(n), tmp = new Float32Array(n); let a0 = null;
  if (!opaque) { a0 = new Float32Array(n); for (let i = 0; i < n; i++) a0[i] = d[i * 4 + 3]; }
  for (let c = 0; c < 3; c++) {
    if (opaque) for (let i = 0; i < n; i++) ch[i] = d[i * 4 + c]; else for (let i = 0; i < n; i++) ch[i] = d[i * 4 + c] * a0[i] / 255;
    op(ch, tmp);
    if (opaque) for (let i = 0; i < n; i++) d[i * 4 + c] = ch[i];
    else { const keep = new Float32Array(ch); for (let i = 0; i < n; i++) d[i * 4 + c] = keep[i]; }
  }
  if (!opaque) {
    ch.set(a0); op(ch, tmp);
    for (let i = 0; i < n; i++) { const a = ch[i], j = i * 4; d[j + 3] = a; if (a > 0.5) { const k = 255 / a; d[j] = d[j] * k; d[j + 1] = d[j + 1] * k; d[j + 2] = d[j + 2] * k; } }
  }
}
function gaussian(img, sigma) {
  if (sigma < 0.3) return img; const w = img.width, h = img.height;
  if (sigma >= 0.8 && w * h > 40000) { // Skia blur (SIMD/GPU) with edge-extended padding so borders do not fade
    const pad = Math.ceil(sigma * 3) + 2, pc = padCanvas(imgToCanvas(img), pad), o = mk(w, h), x = ctxOf(o); x.filter = `blur(${sigma}px)`; x.drawImage(pc, -pad, -pad); img.data.set(x.getImageData(0, 0, w, h).data); return img;
  }
  perChannel(img, (ch, tmp) => gaussChan(ch, w, h, sigma, tmp)); return img;
}
// fast blur of a 0..1 float plane (8-bit precision) through the canvas for big planes
function gaussPlane(ch, w, h, sigma) {
  if (w * h < 250000 || sigma < 0.8) return gaussChan(ch, w, h, sigma);
  const id = new ImageData(w, h), d = id.data; for (let i = 0; i < ch.length; i++) { const v = ch[i] * 255; d[i * 4] = v; d[i * 4 + 1] = (v - Math.floor(v)) * 255; d[i * 4 + 3] = 255; }
  gaussian(id, sigma); for (let i = 0; i < ch.length; i++) ch[i] = (d[i * 4] + d[i * 4 + 1] / 255) / 255; return ch;
}
function boxBlur(img, r) { r = Math.round(r); if (r < 1) return img; perChannel(img, (ch, tmp) => boxChan(ch, img.width, img.height, r, tmp)); return img; }
function lumaOf(img) { const d = img.data, n = img.width * img.height, L = new Float32Array(n); for (let i = 0; i < n; i++) L[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255; return L; }
const copyImg = img => new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
function imgToCanvas(img) { const c = mk(img.width, img.height); ctxOf(c).putImageData(img, 0, 0); return c; }
// canvas padded with stretched edges (so canvas-based shifts do not pull in transparency)
function padCanvas(src, pad) {
  pad = Math.ceil(pad); const w = src.width, h = src.height, c = mk(w + pad * 2, h + pad * 2), x = c.getContext('2d');
  x.imageSmoothingEnabled = false; x.drawImage(src, pad, pad);
  x.drawImage(src, 0, 0, w, 1, pad, 0, w, pad); x.drawImage(src, 0, h - 1, w, 1, pad, pad + h, w, pad);
  x.drawImage(src, 0, 0, 1, h, 0, pad, pad, h); x.drawImage(src, w - 1, 0, 1, h, pad + w, pad, pad, h);
  x.drawImage(src, 0, 0, 1, 1, 0, 0, pad, pad); x.drawImage(src, w - 1, 0, 1, 1, pad + w, 0, pad, pad); x.drawImage(src, 0, h - 1, 1, 1, 0, pad + h, pad, pad); x.drawImage(src, w - 1, h - 1, 1, 1, pad + w, pad + h, pad, pad);
  return c;
}
function bilinear(d, w, h, x, y, out, o) {
  x = clamp(x, 0, w - 1.001); y = clamp(y, 0, h - 1.001); const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
  const i00 = (y0 * w + x0) * 4, i10 = i00 + 4, i01 = i00 + w * 4, i11 = i01 + 4;
  for (let c = 0; c < 4; c++) { const a = d[i00 + c] + (d[i10 + c] - d[i00 + c]) * fx, b = d[i01 + c] + (d[i11 + c] - d[i01 + c]) * fx; out[o + c] = a + (b - a) * fy; }
}
// generic inverse-mapping warp: map(x,y) -> [sx,sy] in source pixels
function warp(img, map) {
  const w = img.width, h = img.height, s = new Uint8ClampedArray(img.data), d = img.data, p = [0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { map(x + 0.5, y + 0.5, p); bilinear(s, w, h, p[0] - 0.5, p[1] - 0.5, d, (y * w + x) * 4); }
  return img;
}

// ===================================================================== distance transform / morphology (masks are Float32 0..1 or Uint8)
function edt1d(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) { let s; do { const r = v[k]; s = ((f[q] + q * q) - (f[r] + r * r)) / (2 * q - 2 * r); } while (s <= z[k] && --k >= 0); k++; v[k] = q; z[k] = s; z[k + 1] = Infinity; }
  k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const r = v[k]; d[q] = (q - r) * (q - r) + f[r]; }
}
// Euclidean distance (pixels) from every pixel to the nearest pixel where inside(i) is true
function distanceTo(w, h, inside) {
  const INF = 1e20, g = new Float32Array(w * h); for (let i = 0; i < w * h; i++) g[i] = inside(i) ? 0 : INF;
  const n = Math.max(w, h), f = new Float32Array(n), dd = new Float32Array(n), v = new Int32Array(n), z = new Float32Array(n + 1);
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = g[y * w + x]; edt1d(f, h, dd, v, z); for (let y = 0; y < h; y++) g[y * w + x] = dd[y]; }
  for (let y = 0; y < h; y++) { const o = y * w; for (let x = 0; x < w; x++) f[x] = g[o + x]; edt1d(f, w, dd, v, z); for (let x = 0; x < w; x++) g[o + x] = Math.sqrt(dd[x]); }
  return g;
}
// grow (r>0) or shrink (r<0) a mask (alpha 0..255 Uint8/array, threshold 128) by r pixels with antialiased edge
function shiftEdge(alpha, w, h, r) {
  const out = new Uint8ClampedArray(w * h); if (!r) { out.set(alpha); return out; }
  if (r > 0) { const dist = distanceTo(w, h, i => alpha[i] >= 128); for (let i = 0; i < w * h; i++) out[i] = Math.max(alpha[i], clamp((r + 0.5 - dist[i]) * 255, 0, 255)); }
  else { const dist = distanceTo(w, h, i => alpha[i] < 128); for (let i = 0; i < w * h; i++) out[i] = Math.min(alpha[i], clamp((dist[i] - (-r) - 0.5 + 1) * 255, 0, 255)); }
  return out;
}
function maxFilterU8(src, w, h, r) { // square dilation, separable
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) { const o = y * w; for (let x = 0; x < w; x++) { let m = 0; for (let k = Math.max(0, x - r), e = Math.min(w - 1, x + r); k <= e; k++) if (src[o + k] > m) { m = src[o + k]; if (m === 1 || m === 255) break; } tmp[o + x] = m; } }
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) { let m = 0; for (let k = Math.max(0, y - r), e = Math.min(h - 1, y + r); k <= e; k++) if (tmp[k * w + x] > m) { m = tmp[k * w + x]; if (m === 1 || m === 255) break; } out[y * w + x] = m; }
  return out;
}
// guided filter (He et al.) — edge-aware smoothing of p using guide I (both Float32, 0..1)
function guidedFilter(I, p, w, h, r, eps) {
  // fast guided filter: coefficients on a subsampled grid for big images
  const sub = w * h > 1.2e6 ? Math.max(1, Math.min(4, Math.floor(r / 2))) : 1;
  if (sub > 1) {
    const sw = Math.ceil(w / sub), sh = Math.ceil(h / sub), Is = new Float32Array(sw * sh), Ps = new Float32Array(sw * sh), cnt = new Float32Array(sw * sh);
    for (let y = 0; y < h; y++) { const yo = ((y / sub) | 0) * sw; for (let x = 0; x < w; x++) { const k = yo + ((x / sub) | 0), i = y * w + x; Is[k] += I[i]; Ps[k] += p[i]; cnt[k]++; } }
    for (let k = 0; k < Is.length; k++) { Is[k] /= cnt[k]; Ps[k] /= cnt[k]; }
    const ab = guidedCoef(Is, Ps, sw, sh, Math.max(1, Math.round(r / sub)), eps), q = new Float32Array(w * h);
    for (let y = 0; y < h; y++) { const fy = clamp((y + 0.5) / sub - 0.5, 0, sh - 1.001), y0 = fy | 0, ay = fy - y0; for (let x = 0; x < w; x++) { const fx = clamp((x + 0.5) / sub - 0.5, 0, sw - 1.001), x0 = fx | 0, ax = fx - x0, k = y0 * sw + x0, k1 = k + (x0 + 1 < sw ? 1 : 0), k2 = k + (y0 + 1 < sh ? sw : 0), k3 = k2 + (x0 + 1 < sw ? 1 : 0); const A = (ab[0][k] * (1 - ax) + ab[0][k1] * ax) * (1 - ay) + (ab[0][k2] * (1 - ax) + ab[0][k3] * ax) * ay, Bv = (ab[1][k] * (1 - ax) + ab[1][k1] * ax) * (1 - ay) + (ab[1][k2] * (1 - ax) + ab[1][k3] * ax) * ay; q[y * w + x] = A * I[y * w + x] + Bv; } }
    return q;
  }
  const ab = guidedCoef(I, p, w, h, r, eps), q = new Float32Array(w * h); for (let i = 0; i < q.length; i++) q[i] = ab[0][i] * I[i] + ab[1][i]; return q;
}
function guidedCoef(I, p, w, h, r, eps) {
  const n = w * h, tmp = new Float32Array(n);
  const mean = a => boxChan(new Float32Array(a), w, h, r, tmp);
  const mI = mean(I), mP = mean(p), IP = new Float32Array(n), II = new Float32Array(n);
  for (let i = 0; i < n; i++) { IP[i] = I[i] * p[i]; II[i] = I[i] * I[i]; }
  const mIP = mean(IP), mII = mean(II), a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) { const v = mII[i] - mI[i] * mI[i], cv = mIP[i] - mI[i] * mP[i]; a[i] = cv / (v + eps); b[i] = mP[i] - a[i] * mI[i]; }
  boxChan(a, w, h, r, tmp); boxChan(b, w, h, r, tmp);
  return [a, b];
}
// median filter on one Uint8 channel (Huang sliding histogram)
function medianChan(src, w, h, r) {
  const out = new Uint8ClampedArray(w * h), hist = new Int32Array(256), half = ((2 * r + 1) * (2 * r + 1)) >> 1;
  for (let y = 0; y < h; y++) {
    hist.fill(0);
    for (let dy = -r; dy <= r; dy++) { const yy = clamp(y + dy, 0, h - 1) * w; for (let dx = -r; dx <= r; dx++) hist[src[yy + clamp(dx, 0, w - 1)]]++; }
    let med = 0, below = 0; while (below + hist[med] <= half) { below += hist[med]; med++; }
    out[y * w] = med;
    for (let x = 1; x < w; x++) {
      const xo = clamp(x - r - 1, 0, w - 1), xi = clamp(x + r, 0, w - 1);
      for (let dy = -r; dy <= r; dy++) { const yy = clamp(y + dy, 0, h - 1) * w; const vo = src[yy + xo], vi = src[yy + xi]; hist[vo]--; if (vo < med) below--; hist[vi]++; if (vi < med) below++; }
      while (below > half) { med--; below -= hist[med]; }
      while (below + hist[med] <= half) { below += hist[med]; med++; }
      out[y * w + x] = med;
    }
  }
  return out;
}

// ===================================================================== noise
function valueNoise2D(seed) {
  const R = rng(seed), P = new Uint8Array(512), G = new Float32Array(256); for (let i = 0; i < 256; i++) { P[i] = i; G[i] = R(); }
  for (let i = 255; i > 0; i--) { const j = (R() * (i + 1)) | 0; [P[i], P[j]] = [P[j], P[i]]; } for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  const f = t => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
    const a = G[P[P[X] + Y]], b = G[P[P[X + 1] + Y]], c = G[P[P[X] + Y + 1]], d = G[P[P[X + 1] + Y + 1]], u = f(xf), v = f(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
}
function fbm(noise, x, y, oct, rough = 0.5) { let s = 0, a = 1, n = 0; for (let o = 0; o < oct; o++) { s += noise(x, y) * a; n += a; a *= rough; x *= 2.02; y *= 2.02; } return s / n; }

// ===================================================================== adjustments  fn(img, p, ctx)
const toneW = l => [Math.pow(1 - l, 2), 1 - Math.abs(l - 0.5) * 2, Math.pow(l, 2)];
function curveLut(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0]);
  if (p.length < 2) return lut(i => i);
  // monotone cubic (Fritsch–Carlson)
  const n = p.length, xs = p.map(q => q[0]), ys = p.map(q => q[1]), dx = [], m = [], sl = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = Math.max(1e-6, xs[i + 1] - xs[i]); sl[i] = (ys[i + 1] - ys[i]) / dx[i]; }
  m[0] = sl[0]; m[n - 1] = sl[n - 2]; for (let i = 1; i < n - 1; i++) m[i] = sl[i - 1] * sl[i] <= 0 ? 0 : (sl[i - 1] + sl[i]) / 2;
  for (let i = 0; i < n - 1; i++) { if (!sl[i]) { m[i] = m[i + 1] = 0; continue; } const a = m[i] / sl[i], b = m[i + 1] / sl[i], s = a * a + b * b; if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * sl[i]; m[i + 1] = t * b * sl[i]; } }
  return lut(x => { if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1]; let i = 0; while (xs[i + 1] < x) i++; const h = dx[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t; return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1]; });
}
function histogram(d) { const hr = new Float64Array(256), hg = new Float64Array(256), hb = new Float64Array(256), hl = new Float64Array(256); for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; hr[d[i]]++; hg[d[i + 1]]++; hb[d[i + 2]]++; hl[Math.round(lum(d[i], d[i + 1], d[i + 2]))]++; } return [hr, hg, hb, hl]; }
function percentile(hh, p) { let tot = 0; for (let i = 0; i < 256; i++) tot += hh[i]; let acc = 0; for (let i = 0; i < 256; i++) { acc += hh[i]; if (acc >= tot * p) return i; } return 255; }
const stretch = (lo, hi) => lut(i => (i - lo) * 255 / Math.max(1, hi - lo));
const autoTone = img => { const [hr, hg, hb] = histogram(img.data); applyLut(img.data, stretch(percentile(hr, .005), percentile(hr, .995)), stretch(percentile(hg, .005), percentile(hg, .995)), stretch(percentile(hb, .005), percentile(hb, .995))); };
const autoContrast = img => { const hl = histogram(img.data)[3]; applyLut(img.data, stretch(percentile(hl, .005), percentile(hl, .995))); };
const autoColor = img => { autoContrast(img); const d = img.data; let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 16) { const l = lum(d[i], d[i + 1], d[i + 2]); if (l < 25 || l > 235) continue; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } if (!n) return; const avg = (r + g + b) / 3 / n; applyLut(d, lut(i => i * avg / (r / n || 1)), lut(i => i * avg / (g / n || 1)), lut(i => i * avg / (b / n || 1))); };
function equalize(img) { const hl = histogram(img.data)[3]; let tot = 0; hl.forEach(v => tot += v); const cdf = new Float64Array(256); let acc = 0; for (let i = 0; i < 256; i++) { acc += hl[i]; cdf[i] = acc / (tot || 1); } const d = img.data; for (let i = 0; i < d.length; i += 4) { const l = lum(d[i], d[i + 1], d[i + 2]), nl = cdf[Math.round(l)] * 255, k = l > 0.5 ? nl / l : 0; if (l < 0.5) d[i] = d[i + 1] = d[i + 2] = nl; else { d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; } } }
function hueSat(img, p) {
  const d = img.data, hs = p.h / 360, sm = 1 + p.s / 100, lt = p.l / 100;
  for (let i = 0; i < d.length; i += 4) {
    let [h, s, l] = rgb2hsl(d[i], d[i + 1], d[i + 2]);
    if (p.col) { h = (p.h + 360) % 360 / 360; s = clamp(0.25 + p.s / 100 * 0.75, 0, 1); } else { h = (h + hs + 1) % 1; s = clamp(s * sm, 0, 1); }
    l = lt > 0 ? l + (1 - l) * lt : l * (1 + lt); const o = hsl2rgb(h, s, l); d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2];
  }
}
function vibrance(img, p) { const d = img.data, V = p.v / 100, S = p.s / 100; for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), avg = lum(r, g, b); const sat = (mx - mn) / 255; let amt = S + V * (1 - sat) * (V > 0 ? 1.4 : 1); const skin = r > g && g > b && (r - b) / 255 > 0.1 && (r - b) / 255 < 0.6 ? 0.6 : 1; amt *= V > 0 ? skin : 1; d[i] = avg + (r - avg) * (1 + amt); d[i + 1] = avg + (g - avg) * (1 + amt); d[i + 2] = avg + (b - avg) * (1 + amt); } }
function colorBalance(img, p) {
  const d = img.data, A = [[p.sr, p.sg, p.sb], [p.mr, p.mg, p.mb], [p.hr, p.hg, p.hb]];
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2], l = lum(r, g, b) / 255, W = toneW(l); let nr = r, ng = g, nb = b;
    for (let t = 0; t < 3; t++) { const k = W[t] * 0.75; nr += A[t][0] * k; ng += A[t][1] * k; nb += A[t][2] * k; }
    if (p.pl) { const nl = lum(nr, ng, nb), ol = lum(r, g, b), dl = ol - nl; nr += dl; ng += dl; nb += dl; }
    d[i] = nr; d[i + 1] = ng; d[i + 2] = nb;
  }
}
function blackWhite(img, p) {
  const d = img.data, [tr, tg, tb] = hexToRgb(p.tc), W = { r: p.re / 100, y: p.ye / 100, g: p.gr / 100, c: p.cy / 100, b: p.bl / 100, m: p.ma / 100 };
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2]; let mx, md, mn, prim, sec;
    if (r >= g && r >= b) { mx = r; prim = W.r; if (g >= b) { md = g; mn = b; sec = W.y; } else { md = b; mn = g; sec = W.m; } }
    else if (g >= r && g >= b) { mx = g; prim = W.g; if (r >= b) { md = r; mn = b; sec = W.y; } else { md = b; mn = r; sec = W.c; } }
    else { mx = b; prim = W.b; if (r >= g) { md = r; mn = g; sec = W.m; } else { md = g; mn = r; sec = W.c; } }
    const v = mn + (mx - md) * prim + (md - mn) * sec;
    if (p.tint) { const l = clamp(v, 0, 255) / 255; const k = 1 - Math.abs(l - 0.5) * 2; d[i] = v + (tr - 128) * k * 0.6; d[i + 1] = v + (tg - 128) * k * 0.6; d[i + 2] = v + (tb - 128) * k * 0.6; }
    else d[i] = d[i + 1] = d[i + 2] = v;
  }
}
function photoFilter(img, p) { const [fr, fg, fb] = hexToRgb(p.c), k = p.d / 100, d = img.data; for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2], ol = lum(r, g, b); let nr = r * (1 - k) + (r * fr / 255) * k * 1.0 + fr * k * 0.25 * (1 - r / 255), ng = g * (1 - k) + (g * fg / 255) * k + fg * k * 0.25 * (1 - g / 255), nb = b * (1 - k) + (b * fb / 255) * k + fb * k * 0.25 * (1 - b / 255); if (p.pl) { const dl = ol - lum(nr, ng, nb); nr += dl; ng += dl; nb += dl; } d[i] = nr; d[i + 1] = ng; d[i + 2] = nb; } }
function channelMixer(img, p) { const d = img.data; for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2]; if (p.mono) { const v = (r * p.rr + g * p.rg + b * p.rb) / 100 + p.rc * 2.55; d[i] = d[i + 1] = d[i + 2] = v; } else { d[i] = (r * p.rr + g * p.rg + b * p.rb) / 100 + p.rc * 2.55; d[i + 1] = (r * p.gr + g * p.gg + b * p.gb) / 100 + p.gc * 2.55; d[i + 2] = (r * p.br + g * p.bg + b * p.bb) / 100 + p.bc * 2.55; } } }
const GRADMAPS = { custom: null, bw: ['#000000', '#ffffff'], sunset: ['#1b1035', '#c2416b', '#ffd27a'], teal: ['#062a34', '#2a9d8f', '#f4e9cd'], duo: ['#3b0a57', '#ff6b6b', '#ffe66d'], copper: ['#1a0d00', '#b87333', '#ffe0b3'], ocean: ['#001219', '#0a9396', '#e9d8a6'], infrared: ['#000000', '#ff0055', '#ffffaa'] };
function gradientLut(stops) { // stops: [[pos 0..1, '#hex'], ...]
  const s = [...stops].sort((a, b) => a[0] - b[0]).map(([p, c]) => [p, hexToRgb(c)]); const L = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) { const t = i / 255; let k = 0; while (k < s.length - 2 && t > s[k + 1][0]) k++; const a = s[k], b = s[Math.min(k + 1, s.length - 1)]; const f = b[0] > a[0] ? clamp((t - a[0]) / (b[0] - a[0]), 0, 1) : 0; for (let c = 0; c < 3; c++) L[i * 3 + c] = a[1][c] + (b[1][c] - a[1][c]) * f; }
  return L;
}
function gradientMap(img, p) {
  let cols = GRADMAPS[p.preset] || [p.a, p.b]; if (p.preset === 'custom' || !GRADMAPS[p.preset]) cols = p.mid && p.useMid ? [p.a, p.mid, p.b] : [p.a, p.b];
  if (p.rev) cols = [...cols].reverse(); const L = gradientLut(cols.map((c, i) => [i / (cols.length - 1), c])), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const t = Math.round(lum(d[i], d[i + 1], d[i + 2])) * 3; d[i] = L[t]; d[i + 1] = L[t + 1]; d[i + 2] = L[t + 2]; }
}
const SC_COLORS = ['reds', 'yellows', 'greens', 'cyans', 'blues', 'magentas', 'whites', 'neutrals', 'blacks'];
function selectiveColor(img, p) {
  // p.adj = {reds:[c,m,y,k],...} in -100..100, p.rel boolean
  const d = img.data, A = p.adj || {};
  const act = SC_COLORS.filter(k => A[k] && A[k].some(v => v)); if (!act.length) return;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b), md = r + g + b - mx - mn; const v = [r, g, b];
    const W = { reds: r === mx ? mx - md : 0, greens: g === mx && r !== mx ? mx - md : 0, blues: b === mx && r !== mx && g !== mx ? mx - md : 0, cyans: r === mn ? md - mn : 0, magentas: g === mn && r !== mn ? md - mn : 0, yellows: b === mn && r !== mn && g !== mn ? md - mn : 0, whites: mn > 128 ? (mn - 128) * 2 : 0, blacks: mx < 128 ? (128 - mx) * 2 : 0, neutrals: Math.max(0, 255 - (Math.abs(mx - 128) + Math.abs(mn - 128))) };
    const out = [r, g, b];
    for (const k of act) { const w = W[k] / 255; if (!w) continue; const [C, M, Y, K] = A[k]; const adj = [C, M, Y];
      for (let c = 0; c < 3; c++) { const s = adj[c] / 100 + K / 100; if (!s) continue; const base = p.rel ? (s > 0 ? v[c] : 255 - v[c]) : 255; out[c] -= s * w * base * (p.rel ? 1 : 0.5); } }
    d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2];
  }
}
function shadowsHighlights(img, p, ctx) {
  const w = img.width, h = img.height, d = img.data, L = lumaOf(img), B = new Float32Array(L); gaussPlane(B, w, h, Math.max(1, p.r * (ctx?.scale || 1)));
  const S = p.s / 100, H = p.hl / 100, C = (p.c ?? 0) / 100;
  for (let i = 0, j = 0; i < L.length; i++, j += 4) {
    const l = L[i], bl = B[i]; const c1 = clamp(1 - bl * 1.6, 0, 1), c2 = clamp((bl - 0.4) / 0.6, 0, 1), sm = c1 * c1, hm = c2 * c2;
    let nl = l + S * sm * (1 - l) * 0.9 * (l + 0.15) * 1.6 - H * hm * l * 0.65; nl = clamp(nl, 0, 1);
    const k = (nl + 0.002) / (l + 0.002); let r = d[j] * k, g = d[j + 1] * k, b = d[j + 2] * k;
    if (C) { const m = nl * 255; r = m + (r - m) * (1 + C); g = m + (g - m) * (1 + C); b = m + (b - m) * (1 + C); }
    d[j] = r; d[j + 1] = g; d[j + 2] = b;
  }
}
function tempTint(img, p) { const t = p.t / 100, n = p.n / 100, d = img.data; const kr = 1 + t * 0.25, kb = 1 - t * 0.25, kg = 1 - n * 0.2; const norm = 1 / lum(kr, kg, kb); for (let i = 0; i < d.length; i += 4) { d[i] = d[i] * kr * norm; d[i + 1] = d[i + 1] * kg * norm; d[i + 2] = d[i + 2] * kb * norm; } }
function clarity(img, p, ctx) {
  const w = img.width, h = img.height, d = img.data, L = lumaOf(img), B = new Float32Array(L); gaussPlane(B, w, h, Math.max(2, Math.max(w, h) * 0.015 * (p.r ?? 1)));
  const a = p.a / 100 * 1.6;
  for (let i = 0, j = 0; i < L.length; i++, j += 4) { const l = L[i], mid = 1 - Math.pow(Math.abs(l - 0.5) * 2, 2); const nl = clamp(l + (l - B[i]) * a * (0.3 + 0.7 * mid), 0, 1); const k = (nl + 0.003) / (l + 0.003); d[j] *= k; d[j + 1] *= k; d[j + 2] *= k; }
}
function dehaze(img, p) {
  const w = img.width, h = img.height, d = img.data, n = w * h, a = p.a / 100;
  const k = Math.min(1, 900 / Math.max(w, h)), sw = Math.max(1, Math.round(w * k)), sh = Math.max(1, Math.round(h * k));
  const dc = new Uint8Array(sw * sh).fill(255);
  for (let y = 0; y < h; y++) { const yy = Math.min(sh - 1, (y * k) | 0) * sw; for (let x = 0; x < w; x++) { const j = (y * w + x) * 4, m = Math.min(d[j], d[j + 1], d[j + 2]), q = yy + Math.min(sw - 1, (x * k) | 0); if (m < dc[q]) dc[q] = m; } }
  const r = Math.max(2, Math.round(Math.min(sw, sh) / 80));
  const inv = new Uint8Array(sw * sh); for (let i = 0; i < inv.length; i++) inv[i] = 255 - dc[i];
  const mf = maxFilterU8(inv, sw, sh, r), dark = new Float32Array(sw * sh); for (let i = 0; i < dark.length; i++) dark[i] = (255 - mf[i]) / 255;
  boxChan(dark, sw, sh, r * 2);
  const order = Array.from(dark.keys()).sort((x, y) => dark[y] - dark[x]).slice(0, Math.max(1, Math.floor(dark.length * 0.002)));
  let Ar = 0, Ag = 0, Ab = 0; order.forEach(i => { const x = Math.min(w - 1, Math.round((i % sw) / k)), y = Math.min(h - 1, Math.round(Math.floor(i / sw) / k)), j = (y * w + x) * 4; Ar += d[j]; Ag += d[j + 1]; Ab += d[j + 2]; }); Ar /= order.length; Ag /= order.length; Ab /= order.length; const Am = Math.max(Ar, Ag, Ab, 1) / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const j = (y * w + x) * 4, fx = clamp(x * k, 0, sw - 1.001), fy = clamp(y * k, 0, sh - 1.001), x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0, i = y0 * sw + x0;
    const dk = (dark[i] * (1 - ax) + dark[Math.min(i + 1, y0 * sw + sw - 1)] * ax) * (1 - ay) + (dark[Math.min(i + sw, dark.length - 1)] * (1 - ax) + dark[Math.min(i + sw + 1, dark.length - 1)] * ax) * ay;
    if (a >= 0) { const t = Math.max(0.12, 1 - 0.95 * a * dk / Am); d[j] = (d[j] - Ar) / t + Ar; d[j + 1] = (d[j + 1] - Ag) / t + Ag; d[j + 2] = (d[j + 2] - Ab) / t + Ab; }
    else { const kk = -a * 0.7; d[j] += (Ar - d[j]) * kk; d[j + 1] += (Ag - d[j + 1]) * kk; d[j + 2] += (Ab - d[j + 2]) * kk; }
  }
}
function levels(img, p) { const f = (ib, g, iw, ob, ow) => lut(i => { let v = clamp((i - ib) / Math.max(1, iw - ib), 0, 1); v = Math.pow(v, 1 / g); return ob + v * (ow - ob); }); const m = f(p.ib, p.g, p.iw, p.ob, p.ow); if (!p.ch || p.ch === 'rgb') return applyLut(img.data, m); const id = lut(i => i); applyLut(img.data, p.ch === 'r' ? m : id, p.ch === 'g' ? m : id, p.ch === 'b' ? m : id); }
function curves(img, p) { const c = p.pts || {}; const lr = curveLut(c.rgb || [[0, 0], [255, 255]]), r = curveLut(c.r || [[0, 0], [255, 255]]), g = curveLut(c.g || [[0, 0], [255, 255]]), b = curveLut(c.b || [[0, 0], [255, 255]]); applyLut(img.data, lut(i => r[lr[i]]), lut(i => g[lr[i]]), lut(i => b[lr[i]])); }
function labStats(d, step = 4) { const o = [0, 0, 0]; let n = 0; const s = [0, 0, 0], s2 = [0, 0, 0]; for (let i = 0; i < d.length; i += 4 * step) { if (d[i + 3] < 128) continue; rgb2lab(d[i], d[i + 1], d[i + 2], o); for (let c = 0; c < 3; c++) { s[c] += o[c]; s2[c] += o[c] * o[c]; } n++; } n = n || 1; const m = s.map(v => v / n); return { mean: m, std: s2.map((v, c) => Math.sqrt(Math.max(1e-6, v / n - m[c] * m[c]))) }; }
function matchColor(img, p) {
  const src = p.stats; if (!src) return; const dst = labStats(img.data, 2), d = img.data, o = [0, 0, 0], q = [0, 0, 0];
  const li = p.lum / 100, ci = p.int / 100, fade = p.fade / 100;
  for (let i = 0; i < d.length; i += 4) {
    rgb2lab(d[i], d[i + 1], d[i + 2], o);
    let L = (o[0] - dst.mean[0]) * (src.std[0] / dst.std[0]) + src.mean[0]; L = o[0] + (L - o[0]) * li;
    let a = (o[1] - dst.mean[1]) * (src.std[1] / dst.std[1]) + src.mean[1], b = (o[2] - dst.mean[2]) * (src.std[2] / dst.std[2]) + src.mean[2];
    if (p.neutral) { a -= dst.mean[1]; b -= dst.mean[2]; }
    a = o[1] + (a - o[1]) * ci; b = o[2] + (b - o[2]) * ci;
    lab2rgb(L, a, b, q); d[i] = q[0] + (d[i] - q[0]) * fade; d[i + 1] = q[1] + (d[i + 1] - q[1]) * fade; d[i + 2] = q[2] + (d[i + 2] - q[2]) * fade;
  }
}

// ===================================================================== filters  fn(img, p, ctx)  ctx = {scale, fg, bg, seed}
const S = (ctx, v) => v * (ctx?.scale || 1);
function motionBlur(img, p, ctx) {
  const dist = S(ctx, p.d); if (dist < 1) return; const c = imgToCanvas(img), pad = Math.ceil(dist) + 2, pc = padCanvas(c, pad);
  const o = mk(pc.width, pc.height), oc = ctxOf(o), n = clamp(Math.ceil(dist * 1.2), 3, 48), a = p.a * Math.PI / 180;
  for (let i = 0; i < n; i++) { const t = (i / (n - 1) - 0.5) * dist; oc.globalAlpha = 1 / (i + 1); oc.drawImage(pc, Math.cos(a) * t, -Math.sin(a) * t); }
  img.data.set(oc.getImageData(pad, pad, img.width, img.height).data);
}
function radialBlur(img, p, ctx) {
  const w = img.width, h = img.height, c = imgToCanvas(img), cx = w * p.x / 100, cy = h * p.y / 100, amt = p.amt / 100;
  if (p.mode === 'spin') {
    const pad = Math.ceil(Math.hypot(w, h) / 2), pc = padCanvas(c, pad), o = mk(w, h), oc = ctxOf(o), ang = amt * 0.6, n = clamp(Math.ceil(ang * Math.hypot(w, h) / 3), 8, 48);
    for (let i = 0; i < n; i++) { const t = (i / (n - 1) - 0.5) * ang; oc.save(); oc.globalAlpha = 1 / (i + 1); oc.translate(cx, cy); oc.rotate(t); oc.translate(-cx - pad, -cy - pad); oc.drawImage(pc, 0, 0); oc.restore(); }
    img.data.set(oc.getImageData(0, 0, w, h).data);
  } else {
    const o = mk(w, h), oc = ctxOf(o), n = clamp(Math.ceil(amt * Math.hypot(w, h) / 6), 8, 40);
    for (let i = 0; i < n; i++) { const s = 1 + amt * 0.5 * (i / (n - 1)); oc.save(); oc.globalAlpha = 1 / (i + 1); oc.translate(cx, cy); oc.scale(s, s); oc.translate(-cx, -cy); oc.drawImage(c, 0, 0); oc.restore(); }
    img.data.set(oc.getImageData(0, 0, w, h).data);
  }
}
function lensBlur(img, p, ctx) {
  const w = img.width, h = img.height, R = S(ctx, p.r); if (R < 0.8) return;
  const n = w * h, d = img.data, thr = p.t / 255, boost = p.b / 100 * 6;
  // HDR-ish planes (gamma 2) with highlight boost so bright points bloom into discs
  const pl = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) { const j = i * 4, l = lum(d[j], d[j + 1], d[j + 2]) / 255; const k = l > thr ? 1 + boost * Math.pow((l - thr) / (1 - thr + 1e-3), 2) : 1; for (let c = 0; c < 3; c++) { const v = d[j + c] / 255; pl[c][i] = v * v * k; } }
  // work at reduced resolution for large radii (disc stays ~8px there), exact disc via row prefix sums
  const s = Math.min(1, 8 / R), ww = Math.max(1, Math.round(w * s)), hh = Math.max(1, Math.round(h * s)), r = Math.max(1, R * s);
  const down = ch => { if (s === 1) return ch; const o = new Float32Array(ww * hh), cnt = new Float32Array(ww * hh); for (let y = 0; y < h; y++) { const yy = Math.min(hh - 1, (y * s) | 0); for (let x = 0; x < w; x++) { const k = yy * ww + Math.min(ww - 1, (x * s) | 0); o[k] += ch[y * w + x]; cnt[k]++; } } for (let i = 0; i < o.length; i++) o[i] /= cnt[i] || 1; return o; };
  const ri = Math.ceil(r), hw = []; let area = 0; const blades = p.shape === 'hex' ? 6 : 0;
  for (let dy = -ri; dy <= ri; dy++) { let half; if (blades) { const a = Math.abs(dy) / r; half = a > Math.sqrt(3) / 2 ? -1 : r * (1 - a / Math.sqrt(3)); } else half = Math.abs(dy) > r ? -1 : Math.sqrt(r * r - dy * dy); const hi = half < 0 ? -1 : Math.round(half); hw.push(hi); if (hi >= 0) area += hi * 2 + 1; }
  const conv = ch => { const P = new Float64Array((ww + 1) * hh); for (let y = 0; y < hh; y++) { let acc = 0; const o = y * (ww + 1), q = y * ww; for (let x = 0; x < ww; x++) { acc += ch[q + x]; P[o + x + 1] = acc; } } const out = new Float32Array(ww * hh);
    for (let y = 0; y < hh; y++) for (let k = 0; k < hw.length; k++) { const half = hw[k]; if (half < 0) continue; const sy = Math.min(hh - 1, Math.max(0, y + k - ri)), o = sy * (ww + 1), lastV = ch[sy * ww + ww - 1], firstV = ch[sy * ww]; const q = y * ww;
      for (let x = 0; x < ww; x++) { const x0 = x - half, x1 = x + half; let v; if (x0 >= 0 && x1 < ww) v = P[o + x1 + 1] - P[o + x0]; else { const a = Math.max(0, x0), b = Math.min(ww - 1, x1); v = P[o + b + 1] - P[o + a] + (x0 < 0 ? -x0 * firstV : 0) + (x1 >= ww ? (x1 - ww + 1) * lastV : 0); } out[q + x] += v; } }
    for (let i = 0; i < out.length; i++) out[i] /= area; return out; };
  const res = pl.map(ch => conv(down(ch)));
  const noise = (p.noise || 0) * 2.55, R0 = rng(7);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const j = (y * w + x) * 4, nz = noise ? (R0() - 0.5) * noise : 0; let v0, v1, v2;
    if (s === 1) { const i = y * w + x; v0 = res[0][i]; v1 = res[1][i]; v2 = res[2][i]; }
    else { const fx = clamp((x + 0.5) * s - 0.5, 0, ww - 1.001), fy = clamp((y + 0.5) * s - 0.5, 0, hh - 1.001), x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0, i = y0 * ww + x0, i1 = Math.min(i + 1, y0 * ww + ww - 1), i2 = Math.min(i + ww, (hh - 1) * ww + x0), i3 = Math.min(i2 + 1, (hh - 1) * ww + ww - 1); const bl = a => (a[i] * (1 - ax) + a[i1] * ax) * (1 - ay) + (a[i2] * (1 - ax) + a[i3] * ax) * ay; v0 = bl(res[0]); v1 = bl(res[1]); v2 = bl(res[2]); }
    d[j] = Math.sqrt(v0) * 255 + nz; d[j + 1] = Math.sqrt(v1) * 255 + nz; d[j + 2] = Math.sqrt(v2) * 255 + nz;
  }
}
function tiltShift(img, p, ctx) {
  const w = img.width, h = img.height, bl = gaussian(copyImg(img), S(ctx, p.r)), d = img.data, b = bl.data;
  const a = p.a * Math.PI / 180, cx = w / 2, cy = h * p.y / 100, nx = -Math.sin(a), ny = Math.cos(a), half = h * p.band / 200, fe = Math.max(1, h * p.fe / 100), sat = p.sat / 100;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const dist = Math.abs((x - cx) * nx + (y - cy) * ny); const k = smoothstep(half, half + fe, dist), j = (y * w + x) * 4; for (let c = 0; c < 4; c++) d[j + c] = d[j + c] + (b[j + c] - d[j + c]) * k; if (sat) { const l = lum(d[j], d[j + 1], d[j + 2]); for (let c = 0; c < 3; c++) d[j + c] = l + (d[j + c] - l) * (1 + sat); } }
}
function surfaceBlur(img, p, ctx) { const w = img.width, h = img.height, r = Math.max(1, Math.round(S(ctx, p.r))), eps = Math.pow(p.t / 255, 2) * 0.6 + 1e-5, d = img.data, n = w * h; for (let c = 0; c < 3; c++) { const I = new Float32Array(n); for (let i = 0; i < n; i++) I[i] = d[i * 4 + c] / 255; const q = guidedFilter(I, I, w, h, r, eps); for (let i = 0; i < n; i++) d[i * 4 + c] = q[i] * 255; } }
function unsharp(img, p, ctx) { const b = gaussian(copyImg(img), S(ctx, p.r)).data, d = img.data, k = p.amt / 100; for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) { const diff = d[i + c] - b[i + c]; if (Math.abs(diff) >= p.t) d[i + c] = d[i + c] + diff * k; } }
function sharpen(img, p, ctx) { unsharp(img, { amt: (p?.amt ?? 60), r: 0.8, t: 0 }, { scale: 1 }); }
function median(img, p, ctx) { const w = img.width, h = img.height, r = Math.max(1, Math.round(S(ctx, p.r))), d = img.data, n = w * h, ch = new Uint8ClampedArray(n); for (let c = 0; c < 3; c++) { for (let i = 0; i < n; i++) ch[i] = d[i * 4 + c]; const m = medianChan(ch, w, h, r); const k = (p.keep ?? 0) / 100; for (let i = 0; i < n; i++) d[i * 4 + c] = m[i] + (ch[i] - m[i]) * k; } }
function addNoise(img, p, ctx) {
  const w = img.width, h = img.height, d = img.data, amt = p.a, R = rng(p.seed || 1), gs = Math.max(1, S(ctx, p.size || 1)), film = p.film;
  const gw = Math.ceil(w / gs) + 2, gh = Math.ceil(h / gs) + 2, planes = p.mono ? 1 : 3, G = [];
  const gauss = () => { let u = 0, v = 0; while (!u) u = R(); v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  for (let k = 0; k < planes; k++) { const g = new Float32Array(gw * gh); for (let i = 0; i < g.length; i++) g[i] = p.dist === 'uniform' ? (R() - 0.5) * 2 : gauss() * 0.6; G.push(g); }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = x / gs, gy = y / gs, x0 = gx | 0, y0 = gy | 0, fx = gx - x0, fy = gy - y0, j = (y * w + x) * 4; const l = film ? lum(d[j], d[j + 1], d[j + 2]) / 255 : 0.5; const fw = film ? 0.35 + 0.65 * (1 - Math.abs(l - 0.45) * 1.6) : 1;
    for (let c = 0; c < 3; c++) { const g = G[p.mono ? 0 : c], i0 = y0 * gw + x0; const v = (g[i0] * (1 - fx) + g[i0 + 1] * fx) * (1 - fy) + (g[i0 + gw] * (1 - fx) + g[i0 + gw + 1] * fx) * fy; d[j + c] += v * amt * fw; }
  }
}
function mosaic(img, p, ctx) { const w = img.width, h = img.height, d = img.data, s = Math.max(2, Math.round(S(ctx, p.s))); for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) { let r = 0, g = 0, b = 0, a = 0, n = 0; const ye = Math.min(y + s, h), xe = Math.min(x + s, w); for (let yy = y; yy < ye; yy++) for (let xx = x; xx < xe; xx++) { const i = (yy * w + xx) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; a += d[i + 3]; n++; } r /= n; g /= n; b /= n; a /= n; for (let yy = y; yy < ye; yy++) for (let xx = x; xx < xe; xx++) { const i = (yy * w + xx) * 4; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a; } } }
function crystallize(img, p, ctx) {
  const w = img.width, h = img.height, d = img.data, s = Math.max(3, S(ctx, p.s)), gw = Math.ceil(w / s) + 1, gh = Math.ceil(h / s) + 1, R = rng(p.seed || 3);
  const px = new Float32Array(gw * gh), py = new Float32Array(gw * gh); for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { px[j * gw + i] = (i + R()) * s; py[j * gw + i] = (j + R()) * s; }
  const lab = new Int32Array(w * h), sum = new Float64Array(gw * gh * 4), cnt = new Float64Array(gw * gh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const ci = Math.floor(x / s), cj = Math.floor(y / s); let best = 1e18, bi = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= gw || j >= gh) continue; const k = j * gw + i, dx = px[k] - x, dy = py[k] - y, dd = dx * dx + dy * dy; if (dd < best) { best = dd; bi = k; } } const o = y * w + x; lab[o] = bi; for (let c = 0; c < 4; c++) sum[bi * 4 + c] += d[o * 4 + c]; cnt[bi]++; }
  for (let o = 0; o < w * h; o++) { const k = lab[o]; for (let c = 0; c < 4; c++) d[o * 4 + c] = sum[k * 4 + c] / cnt[k]; }
}
function halftone(img, p, ctx) {
  const w = img.width, h = img.height, d = img.data, s = Math.max(3, S(ctx, p.s)), src = gaussian(copyImg(img), s / 3).data;
  const chans = p.mode === 'color' ? [[0, 15], [1, 75], [2, 0]] : [[-1, p.ang ?? 45]];
  const out = new Float32Array(w * h * 3).fill(1);
  for (const [ch, angDeg] of chans) {
    const a = angDeg * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x * ca + y * sa, v = -x * sa + y * ca; const cu = (Math.floor(u / s) + 0.5) * s, cv = (Math.floor(v / s) + 0.5) * s;
      const sx = clamp(Math.round(cu * ca - cv * sa), 0, w - 1), sy = clamp(Math.round(cu * sa + cv * ca), 0, h - 1), j = (sy * w + sx) * 4;
      const val = ch < 0 ? lum(src[j], src[j + 1], src[j + 2]) / 255 : src[j + ch] / 255;
      const rad = Math.sqrt(1 - val) * s * 0.72, dist = Math.hypot(u - cu, v - cv), cov = clamp(rad - dist + 0.5, 0, 1), o = (y * w + x) * 3;
      if (ch < 0) out[o] = out[o + 1] = out[o + 2] = 1 - cov; else out[o + ch] = 1 - cov;
    }
  }
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) d[i * 4 + c] = out[i * 3 + c] * 255;
}
function posterize(img, p) { const n = Math.max(2, p.n); applyLut(img.data, lut(i => Math.round(i / 255 * (n - 1)) * 255 / (n - 1))); }
function threshold(img, p) { const d = img.data; for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = lum(d[i], d[i + 1], d[i + 2]) >= p.t ? 255 : 0; }
function emboss(img, p, ctx) {
  const w = img.width, h = img.height, d = img.data, L = lumaOf(img); const a = p.a * Math.PI / 180, dx = Math.cos(a), dy = -Math.sin(a), hgt = Math.max(1, Math.round(S(ctx, p.h))), amt = p.amt / 100;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const x1 = clamp(Math.round(x + dx * hgt), 0, w - 1), y1 = clamp(Math.round(y + dy * hgt), 0, h - 1), x0 = clamp(Math.round(x - dx * hgt), 0, w - 1), y0 = clamp(Math.round(y - dy * hgt), 0, h - 1); const g = (L[y0 * w + x0] - L[y1 * w + x1]) * amt * 255, j = (y * w + x) * 4; if (p.color) { d[j] += g; d[j + 1] += g; d[j + 2] += g; } else d[j] = d[j + 1] = d[j + 2] = 128 + g; }
}
function findEdges(img, p) {
  const w = img.width, h = img.height, d = img.data, s = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const xm = Math.max(0, x - 1), xp = Math.min(w - 1, x + 1), ym = Math.max(0, y - 1), yp = Math.min(h - 1, y + 1), j = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) { const g = (k, l) => s[(l * w + k) * 4 + c]; const gx = -g(xm, ym) - 2 * g(xm, y) - g(xm, yp) + g(xp, ym) + 2 * g(xp, y) + g(xp, yp), gy = -g(xm, ym) - 2 * g(x, ym) - g(xp, ym) + g(xm, yp) + 2 * g(x, yp) + g(xp, yp); d[j + c] = 255 - Math.min(255, Math.hypot(gx, gy) * (p?.k ?? 1) * 0.5); } }
}
function oilPaint(img, p, ctx) {
  // generalized Kuwahara via box statistics on 4 quadrants (O(1) per pixel) + brush "shine"
  const w = img.width, h = img.height, d = img.data, n = w * h, r = Math.max(1, Math.round(S(ctx, p.r))), q = Math.max(1, Math.round(r / 2));
  const L = lumaOf(img), L2 = new Float32Array(n); for (let i = 0; i < n; i++) L2[i] = L[i] * L[i];
  const tmp = new Float32Array(n), mL = boxChan(new Float32Array(L), w, h, q, tmp), mL2 = boxChan(L2, w, h, q, tmp), M = [0, 1, 2].map(c => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = d[i * 4 + c]; return boxChan(a, w, h, q, tmp); });
  const offs = [[-q, -q], [q, -q], [-q, q], [q, q]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let best = 1e9, bi = 0; for (const [ox, oy] of offs) { const k = clamp(y + oy, 0, h - 1) * w + clamp(x + ox, 0, w - 1), v = mL2[k] - mL[k] * mL[k]; if (v < best) { best = v; bi = k; } } const j = (y * w + x) * 4; d[j] = M[0][bi]; d[j + 1] = M[1][bi]; d[j + 2] = M[2][bi]; }
  const shine = (p.shine ?? 30) / 100; if (shine > 0) { const Ls = lumaOf(img); gaussPlane(Ls, w, h, Math.max(0.6, r / 3)); for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x, g = (Ls[i - w - 1] - Ls[i + w + 1]) * 255 * shine * 2.5, j = i * 4; d[j] += g; d[j + 1] += g; d[j + 2] += g; } }
}
function glitch(img, p, ctx) {
  const w = img.width, h = img.height, d = img.data, s = new Uint8ClampedArray(d), sh = Math.round(S(ctx, p.shift)), R = rng(p.seed || 11), slices = p.slices | 0, maxOff = S(ctx, p.offset);
  const rowOff = new Int32Array(h); for (let k = 0; k < slices; k++) { const y0 = (R() * h) | 0, hh = Math.max(1, (R() * h * 0.08) | 0), o = Math.round((R() - 0.5) * 2 * maxOff); for (let y = y0; y < Math.min(h, y0 + hh); y++) rowOff[y] = o; }
  for (let y = 0; y < h; y++) { const ro = rowOff[y], scan = p.scan && (y % 3 === 0) ? 0.82 : 1; for (let x = 0; x < w; x++) { const j = (y * w + x) * 4; const xr = clamp(x - sh + ro, 0, w - 1), xg = clamp(x + ro, 0, w - 1), xb = clamp(x + sh + ro, 0, w - 1), o = y * w * 4; d[j] = s[o + xr * 4] * scan; d[j + 1] = s[o + xg * 4 + 1] * scan; d[j + 2] = s[o + xb * 4 + 2] * scan; d[j + 3] = s[o + xg * 4 + 3]; } }
}
function chromatic(img, p, ctx) {
  const w = img.width, h = img.height, d = img.data, s = new Uint8ClampedArray(d), cx = w / 2, cy = h / 2, k = p.amt / 1000, tmp = [0, 0, 0, 0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const j = (y * w + x) * 4, dx = x - cx, dy = y - cy; bilinear(s, w, h, cx + dx * (1 + k), cy + dy * (1 + k), tmp, 0); d[j] = tmp[0]; bilinear(s, w, h, cx + dx * (1 - k), cy + dy * (1 - k), tmp, 0); d[j + 2] = tmp[2]; }
}
function vignette(img, p) {
  const w = img.width, h = img.height, d = img.data, cx = w / 2, cy = h / 2, rx = w / 2, ry = h / 2 * (p.round ? w / h * (p.round / 100) + (1 - p.round / 100) : 1);
  const mid = p.s / 100, fe = Math.max(0.02, p.f / 100), amt = p.a / 100, [vr, vg, vb] = hexToRgb(p.c || '#000000');
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const dd = Math.hypot((x - cx) / rx, (y - cy) / (ry || 1)) / Math.SQRT2 * 1.41; const t = smoothstep(mid, mid + fe, dd) * Math.abs(amt), j = (y * w + x) * 4; if (amt >= 0) { d[j] += (vr - d[j]) * t; d[j + 1] += (vg - d[j + 1]) * t; d[j + 2] += (vb - d[j + 2]) * t; } else { d[j] += (255 - d[j]) * t; d[j + 1] += (255 - d[j + 1]) * t; d[j + 2] += (255 - d[j + 2]) * t; } }
}
function twirl(img, p) { const w = img.width, h = img.height, cx = w * (p.x ?? 50) / 100, cy = h * (p.y ?? 50) / 100, R = Math.min(w, h) / 2 * p.r / 100, A = p.a * Math.PI / 180; warp(img, (x, y, o) => { const dx = x - cx, dy = y - cy, dd = Math.hypot(dx, dy); if (dd >= R) { o[0] = x; o[1] = y; return; } const t = 1 - dd / R, th = A * t * t, c = Math.cos(th), s = Math.sin(th); o[0] = cx + dx * c - dy * s; o[1] = cy + dx * s + dy * c; }); }
function pinch(img, p) { const w = img.width, h = img.height, cx = w * (p.x ?? 50) / 100, cy = h * (p.y ?? 50) / 100, R = Math.min(w, h) / 2 * p.r / 100, a = p.a / 100; warp(img, (x, y, o) => { const dx = x - cx, dy = y - cy, dd = Math.hypot(dx, dy); if (dd >= R || dd < 1e-6) { o[0] = x; o[1] = y; return; } const t = dd / R, e = a >= 0 ? 1 - 0.7 * a : 1 - 0.85 * a, nt = Math.pow(t, e), f = nt + (t - nt) * smoothstep(0.75, 1, t); const k = f / t; o[0] = cx + dx * k; o[1] = cy + dy * k; }); }
function wave(img, p, ctx) { const A = S(ctx, p.amp), L = Math.max(2, S(ctx, p.len)), tri = t => 2 / Math.PI * Math.asin(Math.sin(t)), sq = t => Math.sign(Math.sin(t)); const f = p.type === 'triangle' ? tri : p.type === 'square' ? sq : Math.sin; warp(img, (x, y, o) => { o[0] = x + (p.dir !== 'v' ? f(2 * Math.PI * y / L) * A : 0); o[1] = y + (p.dir !== 'h' ? f(2 * Math.PI * x / L) * A : 0); }); }
function ripple(img, p, ctx) { const w = img.width, h = img.height, cx = w * (p.x ?? 50) / 100, cy = h * (p.y ?? 50) / 100, A = S(ctx, p.amp), L = Math.max(2, S(ctx, p.len)), damp = Math.max(w, h) * 0.6; warp(img, (x, y, o) => { const dx = x - cx, dy = y - cy, dd = Math.hypot(dx, dy) || 1e-6, off = Math.sin(2 * Math.PI * dd / L) * A * Math.exp(-dd / damp); o[0] = x + dx / dd * off; o[1] = y + dy / dd * off; }); }
function polar(img, p) { const w = img.width, h = img.height, cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2; if (p.mode === 'toPolar') warp(img, (x, y, o) => { const dx = x - cx, dy = y - cy; let th = Math.atan2(dx, -dy); if (th < 0) th += Math.PI * 2; o[0] = th / (Math.PI * 2) * w; o[1] = Math.hypot(dx / (w / 2) * R, dy / (h / 2) * R) / R * h; }); else warp(img, (x, y, o) => { const th = x / w * Math.PI * 2, r = y / h; o[0] = cx + Math.sin(th) * r * w / 2; o[1] = cy - Math.cos(th) * r * h / 2; }); }
function lensFlare(img, p) {
  const w = img.width, h = img.height, c = imgToCanvas(img), x = c.getContext('2d'), fx = w * p.x / 100, fy = h * p.y / 100, B = p.b / 100, D = Math.hypot(w, h);
  x.globalCompositeOperation = 'lighter';
  const glow = (cx, cy, r, col, a) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`); x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2); };
  glow(fx, fy, D * 0.35 * B, '255,220,170', 0.55); glow(fx, fy, D * 0.07 * B, '255,255,240', 1); glow(fx, fy, D * 0.025 * B, '255,255,255', 1);
  x.save(); x.translate(fx, fy); x.scale(1, 0.012); glow(0, 0, D * 0.5 * B, p.type === 'anamorphic' ? '120,170,255' : '255,230,200', 0.7); x.restore();
  if (p.type !== 'anamorphic') { x.save(); x.translate(fx, fy); x.scale(0.012, 1); glow(0, 0, D * 0.18 * B, '255,230,200', 0.4); x.restore(); }
  const vx = w / 2 - fx, vy = h / 2 - fy, ghosts = [[0.4, 0.035, '120,255,160', 0.18], [0.75, 0.06, '255,160,90', 0.14], [1.1, 0.02, '160,180,255', 0.3], [1.35, 0.09, '255,120,200', 0.08], [1.7, 0.045, '120,200,255', 0.16], [2.0, 0.13, '255,220,120', 0.06]];
  for (const [t, r, col, a] of ghosts) { const gx = fx + vx * t, gy = fy + vy * t, rr = D * r * B; const g = x.createRadialGradient(gx, gy, rr * 0.7, gx, gy, rr); g.addColorStop(0, `rgba(${col},${a * 0.6})`); g.addColorStop(0.85, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`); x.fillStyle = g; x.beginPath(); x.arc(gx, gy, rr, 0, 7); x.fill(); }
  if (p.type === 'zoom') { x.strokeStyle = 'rgba(255,240,220,0.25)'; x.lineWidth = D * 0.004 * B; x.beginPath(); x.arc(fx + vx, fy + vy, D * 0.22 * B, 0, 7); x.stroke(); }
  img.data.set(ctxOf(c).getImageData(0, 0, w, h).data);
}
function clouds(img, p, ctx) {
  const w = img.width, h = img.height, d = img.data, N = valueNoise2D(p.seed || 5), sc = Math.max(4, S(ctx, p.sc)), [ar, ag, ab] = hexToRgb(ctx?.fg || '#000000'), [br, bg, bb] = hexToRgb(ctx?.bg || '#ffffff');
  const ox = (ctx?.ox || 0), oy = (ctx?.oy || 0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = fbm(N, (x + ox) / sc, (y + oy) / sc, p.oct || 6, p.rough != null ? p.rough / 100 : 0.5); v = clamp((v - 0.5) * (1 + (p.con || 0) / 50) + 0.5, 0, 1); const j = (y * w + x) * 4; if (p.diff) { d[j] = Math.abs(d[j] - (ar + (br - ar) * v)); d[j + 1] = Math.abs(d[j + 1] - (ag + (bg - ag) * v)); d[j + 2] = Math.abs(d[j + 2] - (ab + (bb - ab) * v)); } else { d[j] = ar + (br - ar) * v; d[j + 1] = ag + (bg - ag) * v; d[j + 2] = ab + (bb - ab) * v; d[j + 3] = 255; } }
}
function solarize(img) { applyLut(img.data, lut(i => i > 127 ? 255 - i : i)); }

// ===================================================================== looks (one-click presets)
const curveFrom = pts => curveLut(pts);
function splitTone(d, sh, hi, amt) { const [sr, sg, sb] = hexToRgb(sh), [hr, hg, hb] = hexToRgb(hi); for (let i = 0; i < d.length; i += 4) { const l = lum(d[i], d[i + 1], d[i + 2]) / 255, ws = (1 - l) * (1 - l) * amt, wh = l * l * amt; d[i] += (sr - 128) * ws + (hr - 128) * wh; d[i + 1] += (sg - 128) * ws + (hg - 128) * wh; d[i + 2] += (sb - 128) * ws + (hb - 128) * wh; } }
function satAdj(d, k) { for (let i = 0; i < d.length; i += 4) { const l = lum(d[i], d[i + 1], d[i + 2]); d[i] = l + (d[i] - l) * k; d[i + 1] = l + (d[i + 1] - l) * k; d[i + 2] = l + (d[i + 2] - l) * k; } }
const vig = (img, a) => vignette(img, { a, s: 45, f: 70, round: 0, c: '#000000' });
const LOOKS = [
  { id: 'vintage', name: 'Vintage', fn: img => { const d = img.data; applyLut(d, curveFrom([[0, 40], [128, 140], [255, 235]]), curveFrom([[0, 30], [128, 128], [255, 225]]), curveFrom([[0, 50], [128, 110], [255, 190]])); satAdj(d, 0.75); vig(img, 35); } },
  { id: 'cinematic', name: 'Cinematic', fn: img => { const d = img.data; applyLut(d, curveFrom([[0, 8], [70, 55], [190, 205], [255, 245]])); splitTone(d, '#1a8a9a', '#ff9a4a', 0.55); satAdj(d, 1.1); vig(img, 25); } },
  { id: 'noir', name: 'B&W Noir', fn: img => { blackWhite(img, { re: 60, ye: 70, gr: 30, cy: 40, bl: 15, ma: 60, tint: false, tc: '#000000' }); applyLut(img.data, curveFrom([[0, 0], [60, 35], [190, 215], [255, 255]])); vig(img, 45); } },
  { id: 'fade', name: 'Fade', fn: img => { applyLut(img.data, curveFrom([[0, 45], [128, 135], [255, 235]])); satAdj(img.data, 0.8); } },
  { id: 'warm', name: 'Warm', fn: img => { tempTint(img, { t: 45, n: 0 }); satAdj(img.data, 1.08); } },
  { id: 'cool', name: 'Cool', fn: img => { tempTint(img, { t: -45, n: 5 }); applyLut(img.data, curveFrom([[0, 5], [128, 125], [255, 250]])); } },
  { id: 'matte', name: 'Matte', fn: img => { applyLut(img.data, curveFrom([[0, 35], [60, 62], [190, 195], [255, 238]])); satAdj(img.data, 0.88); } },
  { id: 'cross', name: 'Cross-process', fn: img => { applyLut(img.data, curveFrom([[0, 0], [64, 40], [192, 225], [255, 255]]), curveFrom([[0, 10], [64, 60], [192, 210], [255, 250]]), curveFrom([[0, 40], [128, 115], [255, 200]])); satAdj(img.data, 1.15); } },
  { id: 'sepia', name: 'Sepia', fn: img => { const d = img.data; for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2]; d[i] = r * .393 + g * .769 + b * .189; d[i + 1] = r * .349 + g * .686 + b * .168; d[i + 2] = r * .272 + g * .534 + b * .131; } } },
  { id: 'lomo', name: 'Lomo', fn: img => { applyLut(img.data, curveFrom([[0, 0], [60, 40], [190, 220], [255, 255]])); satAdj(img.data, 1.35); vig(img, 70); } },
  { id: 'polaroid', name: 'Polaroid', fn: img => { applyLut(img.data, curveFrom([[0, 30], [128, 140], [255, 245]]), curveFrom([[0, 25], [128, 135], [255, 240]]), curveFrom([[0, 45], [128, 130], [255, 215]])); splitTone(img.data, '#3a6a7a', '#ffd9a0', 0.3); satAdj(img.data, 0.85); } },
  { id: 'hdr', name: 'HDR', fn: (img, ctx) => { shadowsHighlights(img, { s: 55, hl: 45, r: 30, c: 15 }, ctx); clarity(img, { a: 70 }, ctx); satAdj(img.data, 1.15); } },
  { id: 'vivid', name: 'Vivid', fn: img => { vibrance(img, { v: 55, s: 12 }); applyLut(img.data, curveFrom([[0, 0], [64, 55], [192, 205], [255, 255]])); } },
  { id: 'moody', name: 'Moody', fn: img => { applyLut(img.data, curveFrom([[0, 10], [90, 70], [200, 185], [255, 230]])); satAdj(img.data, 0.7); splitTone(img.data, '#20405a', '#a08060', 0.4); vig(img, 40); } },
  { id: 'pastel', name: 'Pastel', fn: img => { applyLut(img.data, curveFrom([[0, 60], [128, 165], [255, 250]])); satAdj(img.data, 0.65); splitTone(img.data, '#a0c0ff', '#ffc0d0', 0.35); } },
  { id: 'golden', name: 'Golden hour', fn: img => { tempTint(img, { t: 60, n: -10 }); splitTone(img.data, '#5a3a8a', '#ffb050', 0.35); applyLut(img.data, curveFrom([[0, 15], [128, 135], [255, 250]])); } },
  { id: 'bleach', name: 'Bleach bypass', fn: img => { const d = img.data; for (let i = 0; i < d.length; i += 4) { const l = lum(d[i], d[i + 1], d[i + 2]); for (let c = 0; c < 3; c++) { const v = d[i + c] / 255, L = l / 255, ov = L < 0.5 ? 2 * v * L : 1 - 2 * (1 - v) * (1 - L); d[i + c] = (v * 0.4 + ov * 0.6) * 255; } } satAdj(d, 0.55); } },
  { id: 'chrome', name: 'Chrome', fn: img => { applyLut(img.data, curveFrom([[0, 0], [70, 60], [180, 200], [255, 255]])); satAdj(img.data, 1.2); splitTone(img.data, '#2050a0', '#ffe0a0', 0.25); } },
];

// ===================================================================== inpainting (multi-scale PatchMatch, Wexler-style EM)
// data: Uint8ClampedArray RGBA (w*h*4), hole: Uint8Array (1 = fill). Modifies data in place. opt: {patch, srcMask (Uint8Array 1=allowed), maxSearch}
function inpaint(data, w, h, hole, opt = {}) {
  const PR = opt.patch || 3, maxSearch = opt.maxSearch || 140000;
  // ---- build pyramid
  const levels = [];
  let cur = { w, h, img: new Float32Array(w * h * 4), hole: new Uint8Array(hole), src: opt.srcMask ? new Uint8Array(opt.srcMask) : null };
  for (let i = 0; i < w * h * 4; i++) cur.img[i] = data[i];
  levels.push(cur);
  const holeExtent = l => { let x0 = l.w, y0 = l.h, x1 = -1, y1 = -1, n = 0; for (let y = 0; y < l.h; y++) for (let x = 0; x < l.w; x++) if (l.hole[y * l.w + x]) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return { n, size: Math.max(x1 - x0 + 1, y1 - y0 + 1) }; };
  while (true) {
    const ex = holeExtent(cur); if (ex.n === 0) break;
    if (ex.size <= 40 || cur.w < 100 || cur.h < 100) break;
    const nw = cur.w >> 1, nh = cur.h >> 1, n = { w: nw, h: nh, img: new Float32Array(nw * nh * 4), hole: new Uint8Array(nw * nh), src: cur.src ? new Uint8Array(nw * nh) : null };
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      let acc0 = 0, acc1 = 0, acc2 = 0, acc3 = 0, cnt = 0, anyHole = 0, srcOk = 1;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const k = (y * 2 + dy) * cur.w + x * 2 + dx; if (cur.hole[k]) { anyHole = 1; continue; } const j = k * 4; acc0 += cur.img[j]; acc1 += cur.img[j + 1]; acc2 += cur.img[j + 2]; acc3 += cur.img[j + 3]; cnt++; if (cur.src && !cur.src[k]) srcOk = 0; }
      const o = y * nw + x; n.hole[o] = anyHole; if (n.src) n.src[o] = srcOk;
      if (cnt) { n.img[o * 4] = acc0 / cnt; n.img[o * 4 + 1] = acc1 / cnt; n.img[o * 4 + 2] = acc2 / cnt; n.img[o * 4 + 3] = acc3 / cnt; }
    }
    levels.push(n); cur = n;
  }
  // ---- coarsest: exemplar-based (Criminisi-style) init propagates structure into the hole
  const top = levels[levels.length - 1];
  const tex = holeExtent(top), searchR = Math.max(12, Math.round(tex.size * 1.6));
  onionFill(top); exemplarFill(top, Math.min(PR, 3), searchR);
  let nnf = null; // {tx:Int32 indices of targets, sx, sy}
  for (let li = levels.length - 1; li >= 0; li--) {
    const L = levels[li]; let pr = PR; let prep = prepareLevel(L, pr);
    if (li === 0 && levels.length > 1 && prep.targets.length > 30000 && pr > 2) { pr = 2; prep = prepareLevel(L, pr); }
    if (!prep.validCount) { if (li === levels.length - 1) onionFill(L); nnf = null; continue; }
    let nn;
    if (nnf) { nn = upsampleNNF(nnf, levels[li + 1], L, prep); vote(L, prep, nn, pr); }
    else nn = randomNNF(L, prep);
    const heavy = prep.targets.length > maxSearch;
    const em = li === levels.length - 1 ? 2 : heavy ? 1 : li === 0 ? 2 : 3;
    for (let it = 0; it < em; it++) {
      if (!heavy) patchMatch(L, prep, nn, pr, li === levels.length - 1 ? 4 : 2, it, li === levels.length - 1 ? searchR : 48);
      else propagateOnly(L, prep, nn, pr);
      vote(L, prep, nn, pr);
    }
    nnf = nn;
  }
  const L0 = levels[0];
  for (let i = 0; i < w * h; i++) if (hole[i]) { const j = i * 4; data[j] = L0.img[j]; data[j + 1] = L0.img[j + 1]; data[j + 2] = L0.img[j + 2]; data[j + 3] = L0.img[j + 3]; }
  return data;
}
function onionFill(L) {
  const { w, h, img } = L, known = new Uint8Array(w * h); let front = [];
  for (let i = 0; i < w * h; i++) known[i] = L.hole[i] ? 0 : 1;
  for (let i = 0; i < w * h; i++) if (!known[i]) front.push(i);
  let guard = 0;
  while (front.length && guard++ < w + h + 10) {
    const next = [], fill = [];
    for (const i of front) { const x = i % w, y = (i - x) / w; let a0 = 0, a1 = 0, a2 = 0, a3 = 0, c = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const k = yy * w + xx; if (!known[k]) continue; const j = k * 4; a0 += img[j]; a1 += img[j + 1]; a2 += img[j + 2]; a3 += img[j + 3]; c++; } if (c) fill.push([i, a0 / c, a1 / c, a2 / c, a3 / c]); else next.push(i); }
    for (const [i, a, b, cc, d] of fill) { known[i] = 1; const j = i * 4; img[j] = a; img[j + 1] = b; img[j + 2] = cc; img[j + 3] = d; }
    if (!fill.length) break; front = next;
  }
}
function exemplarFill(L, pr, searchR = 1e9) {
  const { w, h, img } = L, n = w * h, known = new Uint8Array(n); for (let i = 0; i < n; i++) known[i] = L.hole[i] ? 0 : 1;
  const conf = new Float32Array(n); for (let i = 0; i < n; i++) conf[i] = known[i];
  // candidate source centers: full patch inside the image and fully known
  const hd = maxFilterU8(L.hole, w, h, pr), src = []; for (let y = pr; y < h - pr; y++) for (let x = pr; x < w - pr; x++) { const i = y * w + x; if (!hd[i] && (!L.src || L.src[i])) src.push(i); }
  if (!src.length) return;
  const L2 = new Float32Array(n); for (let i = 0; i < n; i++) L2[i] = 0.3 * img[i * 4] + 0.59 * img[i * 4 + 1] + 0.11 * img[i * 4 + 2];
  let remaining = 0; for (let i = 0; i < n; i++) if (!known[i]) remaining++;
  let guard = 0;
  while (remaining > 0 && guard++ < n) {
    // fill front = unknown pixels with a known 4-neighbour; priority = confidence * (1 + isophote strength)
    let best = -1, bp = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (known[i]) continue; if (!((x > 0 && known[i - 1]) || (x < w - 1 && known[i + 1]) || (y > 0 && known[i - w]) || (y < h - 1 && known[i + w]))) continue;
      let c = 0, cnt = 0, bgx = 0, bgy = 0, bm = 0; for (let dy = -pr; dy <= pr; dy++) for (let dx = -pr; dx <= pr; dx++) { const xx = x + dx, yy = y + dy; if (xx < 1 || yy < 1 || xx >= w - 1 || yy >= h - 1) continue; const k = yy * w + xx; c += conf[k]; cnt++; if (known[k] && known[k - 1] && known[k + 1] && known[k - w] && known[k + w]) { const gx = L2[k + 1] - L2[k - 1], gy = L2[k + w] - L2[k - w], m = gx * gx + gy * gy; if (m > bm) { bm = m; bgx = gx; bgy = gy; } } }
      // front normal from the known-mask gradient; isophote = gradient rotated 90°
      const kn = (xx, yy) => xx < 0 || yy < 0 || xx >= w || yy >= h ? 1 : known[yy * w + xx];
      let nx = (kn(x + 1, y - 1) + 2 * kn(x + 1, y) + kn(x + 1, y + 1)) - (kn(x - 1, y - 1) + 2 * kn(x - 1, y) + kn(x - 1, y + 1)), ny = (kn(x - 1, y + 1) + 2 * kn(x, y + 1) + kn(x + 1, y + 1)) - (kn(x - 1, y - 1) + 2 * kn(x, y - 1) + kn(x + 1, y - 1)); const nl = Math.hypot(nx, ny) || 1;
      const data = Math.abs(-bgy * nx / nl + bgx * ny / nl) / 255;
      const pri = (c / Math.max(1, cnt)) * (data + 0.02); if (pri > best) { best = pri; bp = i; } }
    if (bp < 0) break;
    const px = bp % w, py = (bp - px) / w;
    // best source patch by SSD over known pixels
    let bs = -1, bd = Infinity;
    for (let q = 0; q < src.length; q++) { const si = src[q], sx = si % w, sy = (si - sx) / w; if (Math.abs(sx - px) > searchR || Math.abs(sy - py) > searchR) continue; let d = 0, cnt = 0;
      for (let dy = -pr; dy <= pr && d < bd; dy++) { const yy = py + dy; if (yy < 0 || yy >= h) continue; for (let dx = -pr; dx <= pr; dx++) { const xx = px + dx; if (xx < 0 || xx >= w) continue; const k = yy * w + xx; if (!known[k]) continue; const a = k * 4, b = ((sy + dy) * w + sx + dx) * 4; const e0 = img[a] - img[b], e1 = img[a + 1] - img[b + 1], e2 = img[a + 2] - img[b + 2]; d += e0 * e0 + e1 * e1 + e2 * e2; cnt++; } }
      if (cnt && d < bd) { bd = d; bs = si; } }
    if (bs < 0) break;
    const sx = bs % w, sy = (bs - sx) / w; let cp = 0, cc = 0; for (let dy = -pr; dy <= pr; dy++) for (let dx = -pr; dx <= pr; dx++) { const xx = px + dx, yy = py + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; cp += conf[yy * w + xx]; cc++; } cp /= cc || 1;
    for (let dy = -pr; dy <= pr; dy++) { const yy = py + dy; if (yy < 0 || yy >= h) continue; for (let dx = -pr; dx <= pr; dx++) { const xx = px + dx; if (xx < 0 || xx >= w) continue; const k = yy * w + xx; if (known[k]) continue; const b = ((sy + dy) * w + sx + dx) * 4; for (let c = 0; c < 4; c++) img[k * 4 + c] = img[b + c]; L2[k] = 0.3 * img[k * 4] + 0.59 * img[k * 4 + 1] + 0.11 * img[k * 4 + 2]; known[k] = 1; conf[k] = Math.min(1, cp); remaining--; } }
  }
}
function prepareLevel(L, pr) {
  const { w, h } = L, n = w * h;
  // valid source centers: whole patch inside image, no hole pixel in it, allowed by src mask
  const hd = maxFilterU8(L.hole, w, h, pr), valid = new Uint8Array(n), list = [];
  for (let y = pr; y < h - pr; y++) for (let x = pr; x < w - pr; x++) { const i = y * w + x; if (!hd[i] && (!L.src || L.src[i])) { valid[i] = 1; list.push(i); } }
  // targets: centers whose patch overlaps the hole (clamped to valid center range)
  const targets = [], tIndex = new Int32Array(n).fill(-1);
  for (let y = pr; y < h - pr; y++) for (let x = pr; x < w - pr; x++) { const i = y * w + x; if (hd[i]) { tIndex[i] = targets.length; targets.push(i); } }
  // make sure hole pixels near the image border are covered by at least one target
  // confidence of each target patch: high outside / near the hole boundary, decaying inside (Wexler et al.)
  const dist = distanceTo(w, h, i => !L.hole[i]), conf = new Float32Array(targets.length); for (let k = 0; k < targets.length; k++) conf[k] = Math.pow(1.35, -dist[targets[k]]);
  return { valid, validList: Int32Array.from(list), validCount: list.length, targets: Int32Array.from(targets), tIndex, conf };
}
function randomNNF(L, prep) { const t = prep.targets, s = new Int32Array(t.length), dist = new Float32Array(t.length).fill(Infinity), vl = prep.validList; for (let k = 0; k < t.length; k++) s[k] = vl[(Math.random() * vl.length) | 0]; return { s, dist }; }
function upsampleNNF(nnf, Lc, L, prep) {
  const t = prep.targets, s = new Int32Array(t.length), dist = new Float32Array(t.length).fill(Infinity), vl = prep.validList, w = L.w, wc = Lc.w;
  const cprep = nnf._prep;
  for (let k = 0; k < t.length; k++) {
    const i = t[k], x = i % w, y = (i - x) / w, cx = Math.min(Lc.w - 1, x >> 1), cy = Math.min(Lc.h - 1, y >> 1), ci = cy * wc + cx;
    const ck = cprep ? cprep.tIndex[ci] : -1; let cand = -1;
    if (ck >= 0) { const cs = nnf.s[ck], csx = cs % wc, csy = (cs - csx) / wc; const sx = csx * 2 + (x & 1), sy = csy * 2 + (y & 1); if (sx < w && sy < L.h) { const si = sy * w + sx; if (prep.valid[si]) cand = si; } }
    else { // coarse pixel was outside the hole: use identity-like offset from nearest valid
      cand = -1;
    }
    s[k] = cand >= 0 ? cand : vl[(Math.random() * vl.length) | 0];
  }
  return { s, dist };
}
function patchDist(img, w, a, b, pr, best) {
  let d = 0;
  for (let dy = -pr; dy <= pr; dy++) { let ia = (a + dy * w - pr) * 4, ib = (b + dy * w - pr) * 4; for (let dx = -pr; dx <= pr; dx++, ia += 4, ib += 4) { const e0 = img[ia] - img[ib], e1 = img[ia + 1] - img[ib + 1], e2 = img[ia + 2] - img[ib + 2]; d += e0 * e0 + e1 * e1 + e2 * e2; } if (d >= best) return d; }
  return d;
}
function patchMatch(L, prep, nn, pr, iters, seedIt, radius) {
  const { w, h, img } = L, t = prep.targets, s = nn.s, dist = nn.dist, valid = prep.valid, tIndex = prep.tIndex, vl = prep.validList;
  for (let k = 0; k < t.length; k++) dist[k] = patchDist(img, w, t[k], s[k], pr, Infinity);
  const maxR = radius ? Math.min(radius, Math.max(w, h)) : Math.max(w, h);
  for (let it = 0; it < iters; it++) {
    const rev = (it + seedIt) & 1, start = rev ? t.length - 1 : 0, end = rev ? -1 : t.length, step = rev ? -1 : 1, dd = rev ? -1 : 1;
    for (let k = start; k !== end; k += step) {
      const i = t[k]; let bs = s[k], bd = dist[k];
      // propagation from left/right and up/down neighbours
      const nb = [i - dd, i - dd * w];
      for (let q = 0; q < 2; q++) { const ni = nb[q], nk = tIndex[ni]; if (nk < 0) continue; const cand = s[nk] + (q === 0 ? dd : dd * w); if (cand < 0 || cand >= w * h || !valid[cand] || cand === bs) continue; const cd = patchDist(img, w, i, cand, pr, bd); if (cd < bd) { bd = cd; bs = cand; } }
      // random search
      const bx = bs % w, by = (bs - bx) / w;
      for (let r = maxR; r >= 1; r >>= 1) { const cx = bx + Math.round((Math.random() * 2 - 1) * r), cy = by + Math.round((Math.random() * 2 - 1) * r); if (cx < pr || cy < pr || cx >= w - pr || cy >= h - pr) continue; const cand = cy * w + cx; if (!valid[cand] || cand === bs) continue; const cd = patchDist(img, w, i, cand, pr, bd); if (cd < bd) { bd = cd; bs = cand; } }
      if (r0(vl) && bd === Infinity) { bs = vl[(Math.random() * vl.length) | 0]; bd = patchDist(img, w, i, bs, pr, Infinity); }
      s[k] = bs; dist[k] = bd;
    }
  }
  nn._prep = prep;
}
const r0 = vl => vl.length > 0;
function propagateOnly(L, prep, nn, pr) { const { w, img } = L, t = prep.targets; for (let k = 0; k < t.length; k++) nn.dist[k] = patchDist(img, w, t[k], nn.s[k], pr, Infinity); nn._prep = prep; }
function vote(L, prep, nn, pr) {
  const { w, h, img, hole } = L, t = prep.targets, s = nn.s, n = w * h;
  const acc = new Float32Array(n * 4), wsum = new Float32Array(n);
  // weight by patch similarity (sigma from 75th percentile of distances)
  let sig2 = 1; if (nn.dist && isFinite(nn.dist[0])) { const sample = []; for (let k = 0; k < t.length; k += Math.max(1, (t.length / 2000) | 0)) if (isFinite(nn.dist[k])) sample.push(nn.dist[k]); sample.sort((a, b) => a - b); sig2 = (sample[(sample.length * 0.75) | 0] || 1) + 1; }
  for (let k = 0; k < t.length; k++) {
    const i = t[k], si = s[k], dk = nn.dist ? nn.dist[k] : 0, wt = (isFinite(dk) ? Math.exp(-dk / (2 * sig2)) + 1e-4 : 1e-4) * prep.conf[k];
    for (let dy = -pr; dy <= pr; dy++) for (let dx = -pr; dx <= pr; dx++) { const p = i + dy * w + dx; if (!hole[p]) continue; const q = (si + dy * w + dx) * 4, pj = p * 4; acc[pj] += img[q] * wt; acc[pj + 1] += img[q + 1] * wt; acc[pj + 2] += img[q + 2] * wt; acc[pj + 3] += img[q + 3] * wt; wsum[p] += wt; }
  }
  for (let p = 0; p < n; p++) if (hole[p] && wsum[p] > 0) { const pj = p * 4, k = 1 / wsum[p]; img[pj] = acc[pj] * k; img[pj + 1] = acc[pj + 1] * k; img[pj + 2] = acc[pj + 2] * k; img[pj + 3] = acc[pj + 3] * k; }
  void h;
}

// ===================================================================== membrane (seamless) blend — Laplace interpolation of boundary differences via pull-push + relaxation
// dst, src: RGBA Uint8ClampedArray (w*h*4); mask: Uint8Array 1 = inside. Writes src + membrane into dst inside mask.
function membraneBlend(dst, src, mask, w, h) {
  const n = w * h, known = new Uint8Array(n), diff = new Float32Array(n * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (mask[i]) continue; let nearIn = false; for (let dy = -1; dy <= 1 && !nearIn; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && mask[yy * w + xx]) { nearIn = true; break; } } if (nearIn) { known[i] = 1; for (let c = 0; c < 3; c++) diff[i * 3 + c] = dst[i * 4 + c] - src[i * 4 + c]; } }
  // pull-push
  const lv = [{ w, h, v: diff, wt: Float32Array.from(known) }];
  while (lv[lv.length - 1].w > 2 && lv[lv.length - 1].h > 2) { const a = lv[lv.length - 1], nw = Math.ceil(a.w / 2), nh = Math.ceil(a.h / 2), v = new Float32Array(nw * nh * 3), wt = new Float32Array(nw * nh); for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { const i = y * a.w + x, o = (y >> 1) * nw + (x >> 1), ww = a.wt[i]; if (!ww) continue; wt[o] += ww; for (let c = 0; c < 3; c++) v[o * 3 + c] += a.v[i * 3 + c] * ww; } for (let o = 0; o < nw * nh; o++) if (wt[o]) { for (let c = 0; c < 3; c++) v[o * 3 + c] /= wt[o]; wt[o] = Math.min(1, wt[o]); } lv.push({ w: nw, h: nh, v, wt }); }
  for (let l = lv.length - 2; l >= 0; l--) { const a = lv[l], b = lv[l + 1]; for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { const i = y * a.w + x; const ww = a.wt[i]; if (ww >= 1) continue; const bx = Math.min(b.w - 1, Math.max(0, (x - 0.5) / 2)), by = Math.min(b.h - 1, Math.max(0, (y - 0.5) / 2)), x0 = Math.floor(bx), y0 = Math.floor(by), x1 = Math.min(b.w - 1, x0 + 1), y1 = Math.min(b.h - 1, y0 + 1), fx = bx - x0, fy = by - y0; for (let c = 0; c < 3; c++) { const g = (xx, yy) => b.v[(yy * b.w + xx) * 3 + c]; const up = (g(x0, y0) * (1 - fx) + g(x1, y0) * fx) * (1 - fy) + (g(x0, y1) * (1 - fx) + g(x1, y1) * fx) * fy; a.v[i * 3 + c] = a.v[i * 3 + c] * ww + up * (1 - ww); } } }
  // relaxation (Gauss-Seidel) inside the mask
  const v = lv[0].v, iters = Math.min(120, Math.max(20, Math.round(Math.sqrt(n) / 3)));
  for (let it = 0; it < iters; it++) for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (!mask[i]) continue; for (let c = 0; c < 3; c++) v[i * 3 + c] = (v[(i - 1) * 3 + c] + v[(i + 1) * 3 + c] + v[(i - w) * 3 + c] + v[(i + w) * 3 + c]) / 4; }
  for (let i = 0; i < n; i++) if (mask[i]) for (let c = 0; c < 3; c++) dst[i * 4 + c] = src[i * 4 + c] + v[i * 3 + c];
}

// ===================================================================== geometry
function homography(src, dst) { // 4 point pairs [[x,y]...] → 3x3 matrix mapping src→dst
  const A = [], b = [];
  for (let i = 0; i < 4; i++) { const [x, y] = src[i], [u, v] = dst[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v); }
  for (let c = 0; c < 8; c++) { let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]]; for (let r = 0; r < 8; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; } }
  const hh = b.map((v, i) => v / A[i][i]); return [hh[0], hh[1], hh[2], hh[3], hh[4], hh[5], hh[6], hh[7], 1];
}
function warpPerspective(srcImg, quad, ow, oh) { // quad: 4 source points (tl,tr,br,bl) → output rect
  const H = homography([[0, 0], [ow, 0], [ow, oh], [0, oh]], quad), out = new ImageData(ow, oh), d = out.data, s = srcImg.data, w = srcImg.width, h = srcImg.height, tmp = [0, 0, 0, 0];
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) { const X = x + 0.5, Y = y + 0.5, z = H[6] * X + H[7] * Y + H[8], sx = (H[0] * X + H[1] * Y + H[2]) / z - 0.5, sy = (H[3] * X + H[4] * Y + H[5]) / z - 0.5, j = (y * ow + x) * 4; if (sx < -1 || sy < -1 || sx > w || sy > h) continue; bilinear(s, w, h, sx, sy, tmp, 0); d[j] = tmp[0]; d[j + 1] = tmp[1]; d[j + 2] = tmp[2]; d[j + 3] = tmp[3]; }
  return out;
}
// estimate the tilt (degrees) of the dominant near-horizontal / near-vertical structure
function estimateTilt(img) {
  const w = img.width, h = img.height, L = lumaOf(img); gaussChan(L, w, h, 1);
  const bins = new Float64Array(901); // -45..45 step 0.1 deg
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; const gx = (L[i + 1 - w] + 2 * L[i + 1] + L[i + 1 + w]) - (L[i - 1 - w] + 2 * L[i - 1] + L[i - 1 + w]), gy = (L[i - 1 + w] + 2 * L[i + w] + L[i + 1 + w]) - (L[i - 1 - w] + 2 * L[i - w] + L[i + 1 - w]); const m = gx * gx + gy * gy; if (m < 0.02) continue; let a = Math.atan2(gy, gx) * 180 / Math.PI; a = ((a % 90) + 90) % 90; if (a > 45) a -= 90; bins[Math.round((a + 45) * 10)] += Math.sqrt(m); }
  const sm = new Float64Array(901); for (let i = 0; i < 901; i++) { let s = 0; for (let k = -6; k <= 6; k++) { const j = i + k; if (j >= 0 && j < 901) s += bins[j] * (7 - Math.abs(k)); } sm[i] = s; }
  let bi = 450; for (let i = 0; i < 901; i++) if (sm[i] > sm[bi]) bi = i; return (bi - 450) / 10;
}

window.PFX = {
  clamp, mk, ctxOf, lum, rng, hexToRgb, lut, applyLut, rgb2hsl, hsl2rgb, rgb2lab, lab2rgb, smoothstep,
  gaussChan, gaussPlane, boxChan, gaussian, boxBlur, lumaOf, copyImg, imgToCanvas, padCanvas, bilinear, warp,
  distanceTo, shiftEdge, maxFilterU8, guidedFilter, medianChan, valueNoise2D, fbm, histogram, percentile, curveLut, gradientLut, GRADMAPS, SC_COLORS,
  adj: { autoTone, autoContrast, autoColor, equalize, hueSat, vibrance, colorBalance, blackWhite, photoFilter, channelMixer, gradientMap, selectiveColor, shadowsHighlights, tempTint, clarity, dehaze, levels, curves, matchColor, labStats, posterize, threshold },
  flt: { motionBlur, radialBlur, lensBlur, tiltShift, surfaceBlur, unsharp, sharpen, median, addNoise, mosaic, crystallize, halftone, emboss, findEdges, oilPaint, glitch, chromatic, vignette, twirl, pinch, wave, ripple, polar, lensFlare, clouds, solarize },
  LOOKS, inpaint, membraneBlend, homography, warpPerspective, estimateTilt,
};
})();
