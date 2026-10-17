// BTS Photo — Camera Raw: RAW decoding (LibRaw → WASM, src/vendor/photo-libraw), HEIF/HEIC decoding
// (libheif → WASM, src/vendor/photo-libheif) and the Camera Raw develop engine + dialog.
// The engine works on 16-bit linear RGB and processes in float; output is 8-bit RGBA.
(() => {
const P = () => window.__photo;
const { h, toast, modal, clamp } = UI;

// =====================================================================  loaders
let lrMod = null;
async function newLibRaw() { if (!lrMod) lrMod = import('../vendor/photo-libraw/index.js').then(m => m.default).catch(e => { lrMod = null; throw e; }); return new (await lrMod)(); }
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Missing ' + src)); document.head.append(s); }); }
async function fetchBytes(url) {
  try { const r = await fetch(url); if (r.ok) return new Uint8Array(await r.arrayBuffer()); } catch { }
  return new Promise((res, rej) => { const x = new XMLHttpRequest(); x.open('GET', url); x.responseType = 'arraybuffer'; x.onload = () => x.response ? res(new Uint8Array(x.response)) : rej(new Error('Could not load ' + url)); x.onerror = () => rej(new Error('Could not load ' + url)); x.send(); });
}
let heifP = null;
function loadHeif() {
  if (!heifP) heifP = (async () => {
    const base = new URL('../vendor/photo-libheif/', location.href).href;
    if (!window.libheif) await loadScript(base + 'libheif.js');
    const wasmBinary = await fetchBytes(base + 'libheif.wasm');
    return await window.libheif({ wasmBinary });
  })();
  heifP.catch(() => { heifP = null; });
  return heifP;
}

// =====================================================================  small binary helpers (TIFF / ISO-BMFF / JPEG)
const fourcc = (u8, i) => String.fromCharCode(u8[i], u8[i + 1], u8[i + 2], u8[i + 3]);
function looksHeif(u8) { if (!u8 || u8.length < 12 || fourcc(u8, 4) !== 'ftyp') return false; const b = fourcc(u8, 8); return ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1', 'avif', 'avis'].includes(b); }
// orientation (1..8) from a TIFF structure starting at `o`
function tiffOrientation(u8, o) {
  if (o + 8 > u8.length) return 1; const le = u8[o] === 0x49; const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const u16 = i => dv.getUint16(i, le), u32 = i => dv.getUint32(i, le);
  if (u16(o + 2) !== 42) return 1; const ifd = o + u32(o + 4); if (ifd + 2 > u8.length) return 1;
  const n = u16(ifd); for (let k = 0; k < n; k++) { const e = ifd + 2 + k * 12; if (e + 12 > u8.length) break; if (u16(e) === 0x0112) { const v = u16(e + 8); return v >= 1 && v <= 8 ? v : 1; } }
  return 1;
}
function exifOrientation(u8) {
  // "Exif\0\0" followed by a TIFF header (HEIF Exif items and JPEG APP1 both use it)
  for (let i = 0; i < u8.length - 14; i++) if (u8[i] === 0x45 && u8[i + 1] === 0x78 && u8[i + 2] === 0x69 && u8[i + 3] === 0x66 && u8[i + 4] === 0 && u8[i + 5] === 0 && (u8[i + 6] === 0x49 || u8[i + 6] === 0x4d)) return tiffOrientation(u8, i + 6);
  return 1;
}
// does the HEIF 'meta' box carry irot/imir transforms? (libheif applies those itself)
function heifHasTransforms(u8) {
  let i = 0; while (i + 8 <= u8.length) { let size = new DataView(u8.buffer, u8.byteOffset + i, 8).getUint32(0); const type = fourcc(u8, i + 4); if (size === 1 && i + 16 <= u8.length) size = Number(new DataView(u8.buffer, u8.byteOffset + i + 8, 8).getBigUint64(0)); if (size === 0) size = u8.length - i; if (size < 8) break;
    if (type === 'meta') { const end = Math.min(u8.length, i + size); for (let j = i; j < end - 4; j++) { const t = fourcc(u8, j); if (t === 'irot' || t === 'imir') return true; } return false; }
    i += size; }
  return false;
}
function orientCanvas(c, o) {
  if (!o || o === 1) return c; const w = c.width, hh = c.height, swap = o >= 5; const n = P().mk(swap ? hh : w, swap ? w : hh), x = P().ctxOf(n);
  const T = { 2: [-1, 0, 0, 1, w, 0], 3: [-1, 0, 0, -1, w, hh], 4: [1, 0, 0, -1, 0, hh], 5: [0, 1, 1, 0, 0, 0], 6: [0, 1, -1, 0, hh, 0], 7: [0, -1, -1, 0, hh, w], 8: [0, -1, 1, 0, 0, w] }[o];
  x.setTransform(...T); x.drawImage(c, 0, 0); return n;
}
// all complete JPEG streams inside a file (raw files embed full-size previews)
function findJpegs(u8) {
  const out = []; const n = u8.length;
  for (let i = 0; i < n - 4; i++) {
    if (u8[i] !== 0xff || u8[i + 1] !== 0xd8 || u8[i + 2] !== 0xff) continue;
    let j = i + 2, ok = false;
    while (j + 4 <= n) {
      if (u8[j] !== 0xff) break; const m = u8[j + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { j += 2; continue; }
      const len = (u8[j + 2] << 8) | u8[j + 3]; if (len < 2) break;
      if (m === 0xda) { j += 2 + len; while (j + 1 < n) { if (u8[j] === 0xff && u8[j + 1] !== 0 && !(u8[j + 1] >= 0xd0 && u8[j + 1] <= 0xd7)) break; j++; } if (u8[j + 1] === 0xd9) { ok = true; j += 2; } break; }
      j += 2 + len;
    }
    if (ok && j - i > 2048) { out.push({ start: i, end: j }); i = j - 1; }
  }
  return out.sort((a, b) => (b.end - b.start) - (a.end - a.start));
}
async function embeddedPreview(u8) {
  const tiffO = (u8[0] === 0x49 && u8[1] === 0x49) || (u8[0] === 0x4d && u8[1] === 0x4d) ? tiffOrientation(u8, 0) : 1;
  for (const j of findJpegs(u8).slice(0, 6)) {
    try { const bmp = await createImageBitmap(new Blob([u8.subarray(j.start, j.end)], { type: 'image/jpeg' }), { imageOrientation: 'none' }); if (bmp.width < 64) continue; const c = P().mk(bmp.width, bmp.height); P().ctxOf(c).drawImage(bmp, 0, 0); bmp.close(); return orientCanvas(c, tiffO); } catch { }
  }
  return null;
}

// =====================================================================  decoding
// src = { w, h, data: Uint16Array (RGB, linear 0..65535), alpha: Uint8Array|null, mode: 'raw'|'srgb', meta }
async function decodeRaw(u8, name) {
  const raw = await newLibRaw();
  try {
    await raw.open(new Uint8Array(u8), { outputBps: 16, noAutoBright: true, useCameraWb: true, useCameraMatrix: 1, outputColor: 1, highlight: 0, userQual: 3 });
    let meta = {}; try { meta = await raw.metadata(false) || {}; } catch { }
    const im = await raw.imageData();
    if (!im || !im.data || !im.width || (im.colors || 3) < 3) throw new Error('The raw data could not be decoded');
    let data = im.data; if (!(data instanceof Uint16Array)) { const u = new Uint16Array(im.width * im.height * 3); for (let i = 0; i < u.length; i++) u[i] = data[i] * 257; data = u; }
    if ((im.colors || 3) > 3) { const n = im.width * im.height, c = im.colors, u = new Uint16Array(n * 3); for (let i = 0; i < n; i++) { u[i * 3] = data[i * c]; u[i * 3 + 1] = data[i * c + 1]; u[i * 3 + 2] = data[i * c + 2]; } data = u; }
    const inv = bt709Inverse(); for (let i = 0; i < data.length; i++) data[i] = inv[data[i]];
    return { w: im.width, h: im.height, data, alpha: null, mode: 'raw', meta };
  } finally { try { raw.dispose(); } catch { } }
}
// This LibRaw build always applies its default output curve (BT.709: power 0.45, toe slope 4.5; the `gamm`
// option is ignored), so the 16-bit output is linearised here with the exact inverse of LibRaw's gamma_curve().
let INV709 = null;
function bt709Inverse() {
  if (INV709) return INV709;
  const g = [0.45, 4.5, 0, 0, 0], bnd = [0, 1];
  for (let i = 0; i < 48; i++) { g[2] = (bnd[0] + bnd[1]) / 2; bnd[((Math.pow(g[2] / g[1], -g[0]) - 1) / g[0] - 1 / g[2] > -1) ? 1 : 0] = g[2]; }
  g[3] = g[2] / g[1]; g[4] = g[2] * (1 / g[0] - 1);
  INV709 = new Uint16Array(65536);
  for (let i = 0; i < 65536; i++) { const y = i / 65536, r = y < g[2] ? y / g[1] : Math.pow((y + g[4]) / (1 + g[4]), 1 / g[0]); INV709[i] = Math.min(65535, Math.round(r * 65536)); }
  return INV709;
}
let SRGB2LIN = null;
function srgbToLinLut() { if (!SRGB2LIN) { SRGB2LIN = new Uint16Array(256); for (let i = 0; i < 256; i++) { const v = i / 255; SRGB2LIN[i] = Math.round((v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)) * 65535); } } return SRGB2LIN; }
function srcFromImageData(img, mode = 'srgb') {
  const n = img.width * img.height, d = img.data, L = srgbToLinLut(), data = new Uint16Array(n * 3); let alpha = null;
  for (let i = 0; i < n; i++) { data[i * 3] = L[d[i * 4]]; data[i * 3 + 1] = L[d[i * 4 + 1]]; data[i * 3 + 2] = L[d[i * 4 + 2]]; if (d[i * 4 + 3] !== 255) { if (!alpha) { alpha = new Uint8Array(n).fill(255); for (let k = 0; k < i; k++) alpha[k] = d[k * 4 + 3]; } } if (alpha) alpha[i] = d[i * 4 + 3]; }
  return { w: img.width, h: img.height, data, alpha, mode, meta: {} };
}
function srcFromCanvas(c, mode) { return srcFromImageData(P().ctxOf(c).getImageData(0, 0, c.width, c.height), mode); }
// integer-factor box downsample
function downsample(src, maxSide) {
  const k = Math.max(1, Math.ceil(Math.max(src.w, src.h) / maxSide)); if (k === 1) return { ...src, scale: 1 };
  const w = Math.floor(src.w / k), hh = Math.floor(src.h / k), d = src.data, o = new Uint16Array(w * hh * 3), a = src.alpha ? new Uint8Array(w * hh) : null, kk = k * k;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, al = 0;
    for (let yy = 0; yy < k; yy++) { let j = ((y * k + yy) * src.w + x * k) * 3; for (let xx = 0; xx < k; xx++, j += 3) { r += d[j]; g += d[j + 1]; b += d[j + 2]; } if (a) for (let xx = 0; xx < k; xx++) al += src.alpha[(y * k + yy) * src.w + x * k + xx]; }
    const q = (y * w + x) * 3; o[q] = r / kk; o[q + 1] = g / kk; o[q + 2] = b / kk; if (a) a[y * w + x] = al / kk;
  }
  return { w, h: hh, data: o, alpha: a, mode: src.mode, meta: src.meta, scale: 1 / k };
}
function cropSrc(src, cx, cy, cw, ch) {
  cw = Math.min(cw, src.w); ch = Math.min(ch, src.h); const x0 = clamp(Math.round(cx - cw / 2), 0, src.w - cw), y0 = clamp(Math.round(cy - ch / 2), 0, src.h - ch);
  const o = new Uint16Array(cw * ch * 3); for (let y = 0; y < ch; y++) o.set(src.data.subarray(((y0 + y) * src.w + x0) * 3, ((y0 + y) * src.w + x0 + cw) * 3), y * cw * 3);
  let a = null; if (src.alpha) { a = new Uint8Array(cw * ch); for (let y = 0; y < ch; y++) a.set(src.alpha.subarray((y0 + y) * src.w + x0, (y0 + y) * src.w + x0 + cw), y * cw); }
  return { w: cw, h: ch, data: o, alpha: a, mode: src.mode, meta: src.meta, scale: 1, x0, y0 };
}

// =====================================================================  develop engine
const DEFAULTS = { wb: 'shot', temp: 0, tint: 0, exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, clarity: 0, vibrance: 0, saturation: 0, nr: 0, cnr: 0 };
const defaultsFor = mode => ({ ...DEFAULTS, cnr: mode === 'raw' ? 25 : 0 });
const XYZ2RGB = [[3.2404542, -1.5371385, -0.4985314], [-0.969266, 1.8760108, 0.041556], [0.0556434, -0.2040259, 1.0572252]];
function kelvinRGB(T) {
  T = clamp(T, 1667, 25000); const t = T, t2 = t * t, t3 = t2 * t;
  const x = T <= 4000 ? -0.2661239e9 / t3 - 0.2343589e6 / t2 + 0.8776956e3 / t + 0.17991 : -3.0258469e9 / t3 + 2.1070379e6 / t2 + 0.2226347e3 / t + 0.24039;
  const y = T <= 2222 ? -1.1063814 * x ** 3 - 1.3481102 * x * x + 2.18555832 * x - 0.20219683 : T <= 4000 ? -0.9549476 * x ** 3 - 1.37418593 * x * x + 2.09137015 * x - 0.16748867 : 3.081758 * x ** 3 - 5.8733867 * x * x + 3.75112997 * x - 0.37001483;
  const X = x / y, Z = (1 - x - y) / y; const rgb = XYZ2RGB.map(r => r[0] * X + r[1] + r[2] * Z); return rgb.map(v => v / rgb[1]);
}
const W6500 = kelvinRGB(6500);
function wbMultipliers(s, st) {
  const base = s.wb === 'auto' ? st.autoWB : s.wb === 'picked' && Array.isArray(s.wbMul) ? s.wbMul : [1, 1, 1];
  const T = 1e6 / (1e6 / 6500 + 1.2 * (s.temp || 0)), k = kelvinRGB(T), tg = Math.pow(2, -(s.tint || 0) / 100 * 0.6);
  const m = [base[0] * k[0] / W6500[0], base[1] * tg, base[2] * k[2] / W6500[2]]; const lum = 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; return m.map(v => v / lum);
}
// statistics from a (small) source: auto white balance, exposure baseline, median
function statsOf(src) {
  const n = src.w * src.h, d = src.data, step = Math.max(1, Math.floor(n / 300000)), Ys = []; let sr = 0, sg = 0, sb = 0, cnt = 0;
  for (let i = 0; i < n; i += step) { const r = d[i * 3] / 65535, g = d[i * 3 + 1] / 65535, b = d[i * 3 + 2] / 65535; Ys.push(0.2126 * r + 0.7152 * g + 0.0722 * b); }
  const sorted = Float32Array.from(Ys).sort(), pc = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] || 0;
  const lo = pc(0.05), hi = pc(0.97);
  for (let i = 0; i < n; i += step) { const r = d[i * 3] / 65535, g = d[i * 3 + 1] / 65535, b = d[i * 3 + 2] / 65535, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b; if (Y < lo || Y > hi || Math.max(r, g, b) > 0.97) continue; sr += r; sg += g; sb += b; cnt++; }
  let autoWB = [1, 1, 1]; if (cnt > 50 && sr > 0 && sb > 0) autoWB = [clamp(sg / sr, 0.25, 4), 1, clamp(sg / sb, 0.25, 4)];
  const p99 = pc(0.99), med = pc(0.5);
  return { autoWB, p99, median: med, baseGain: src.mode === 'raw' ? clamp(0.97 / Math.max(1e-4, p99), 1, 12) : 1 };
}
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const PMAX = 3, TN = 8192;
function toneLut(s, raw) {
  const hl = (s.highlights || 0) / 100, sh = (s.shadows || 0) / 100, wh = (s.whites || 0) / 100, bk = (s.blacks || 0) / 100, c = (s.contrast || 0) / 100;
  const wp = 1 - 0.3 * wh, bp = -0.08 * bk, kc = (raw ? 0.15 : 0) + 0.55 * c, knee = 0.78, lut = new Float32Array(TN + 1);
  for (let i = 0; i <= TN; i++) {
    let x = (i / TN * PMAX - bp) / (wp - bp);
    if (sh) { const q = clamp(x, 0, 1); x += sh * 0.9 * q * (1 - q) ** 3; }
    if (hl) { const dd = Math.max(0, x - 0.35); x += hl * 0.45 * dd * smooth(0.35, 0.8, x); }
    if (kc) { const u = (x - 0.45) / 0.6, bell = Math.max(0, 1 - u * u); x += kc * (x - 0.45) * bell; }
    if (raw && x > knee) x = knee + (1 - knee) * Math.tanh((x - knee) / (1 - knee));
    lut[i] = clamp(x, 0, 1);
  }
  return lut;
}
let ENC = null, DEC22 = null, PLL = null; const PL_N = 65536, PL_SMAX = Math.sqrt(Math.pow(PMAX, 2.2));
// perceptual luminance Y^(1/2.2), indexed by sqrt(Y) for precision in the shadows
function plLut() { if (!PLL) { PLL = new Float32Array(PL_N + 1); for (let i = 0; i <= PL_N; i++) PLL[i] = Math.pow(i / PL_N * PL_SMAX, 2 / 2.2); } return PLL; }
function encLut() { if (!ENC) { ENC = new Uint8Array(65536); for (let i = 0; i < 65536; i++) { const v = i / 65535; ENC[i] = Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); } } return ENC; }
function dec22() { if (!DEC22) { DEC22 = new Float32Array(4097); for (let i = 0; i <= 4096; i++) DEC22[i] = Math.pow(i / 4096, 2.2); } return DEC22; }
// develop src → ImageData `out` (same size). scale = size of a src pixel relative to the full image (for radii); refSide = long side of the full image.
function develop(src, s, st, out, { scale = 1, refSide = Math.max(src.w, src.h) } = {}) {
  s = { ...DEFAULTS, ...s }; const X = P().X, raw = src.mode === 'raw';
  const w = src.w, hh = src.h, n = w * hh, d = src.data, o = out.data, A = src.alpha, E = encLut(), D22 = dec22(), lut = toneLut(s, raw);
  const [mr, mg, mb] = wbMultipliers(s, st), gain = (raw ? st.baseGain : 1) * Math.pow(2, s.exposure || 0), kr = mr * gain / 65535, kg = mg * gain / 65535, kb = mb * gain / 65535;
  const nr = clamp(s.nr / 100, 0, 1), cnr = clamp(s.cnr / 100, 0, 1), clar = clamp(s.clarity / 100, -1, 1), vib = clamp(s.vibrance / 100, -1, 1), sat = clamp(s.saturation / 100, -1, 1);
  const Pl = new Float32Array(n); let CR = null, CB = null; if (cnr > 0) { CR = new Float32Array(n); CB = new Float32Array(n); }
  const PL = plLut(), SQK = PL_N / PL_SMAX;
  for (let i = 0, j = 0; i < n; i++, j += 3) { const r = d[j] * kr, g = d[j + 1] * kg, b = d[j + 2] * kb, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b; Pl[i] = Y > 0 ? PL[Math.min(PL_N, (Math.sqrt(Y) * SQK) | 0)] : 0; if (CR) { const iy = 1 / (Y + 1e-5); CR[i] = r * iy; CB[i] = b * iy; } }
  let tmp = null; const blur = (ch, sig) => { if (sig < 0.3) return ch; tmp = tmp || new Float32Array(n); return X.gaussChan(ch, w, hh, sig, tmp); };
  if (nr > 0) { const B = blur(Pl.slice(), Math.max(0.5, (0.8 + 1.4 * nr) * scale)), t = nr * 0.045; for (let i = 0; i < n; i++) { const dd = Pl[i] - B[i]; Pl[i] = B[i] + (dd > t ? dd - t : dd < -t ? dd + t : 0); } }
  if (CR) { const sig = Math.max(0.5, (1 + 6 * cnr) * scale); blur(CR, sig); blur(CB, sig); }
  if (clar) { const B = blur(Pl.slice(), Math.max(1, refSide * 0.012 * scale)); for (let i = 0; i < n; i++) { const p = Pl[i], wgt = p < 1 ? 4 * p * (1 - p) : 0; Pl[i] = Math.max(0, p + clar * 0.8 * (p - B[i]) * Math.max(0, wgt)); } }
  for (let i = 0, j = 0, q = 0; i < n; i++, j += 3, q += 4) {
    const po = lut[Math.min(TN, (Pl[i] / PMAX * TN) | 0)], Yo = D22[(po * 4096) | 0];
    let r, g, b;
    if (CR) { r = CR[i] * Yo; b = CB[i] * Yo; g = (Yo - 0.2126 * r - 0.0722 * b) / 0.7152; }
    else { r = d[j] * kr; g = d[j + 1] * kg; b = d[j + 2] * kb; const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b; if (Y > 1e-7) { const k = Yo / Y; r *= k; g *= k; b *= k; } else r = g = b = Yo; }
    if (vib || sat) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sc = mx > 1e-6 ? (mx - mn) / mx : 0; let k = (1 + sat) * (1 + vib * (1 - sc) * (1 - sc) * 1.2); if (k < 0) k = 0; r = Yo + (r - Yo) * k; g = Yo + (g - Yo) * k; b = Yo + (b - Yo) * k; }
    let mx = Math.max(r, g, b); if (mx > 1) { if (Yo >= 1) r = g = b = 1; else { const t = (1 - Yo) / (mx - Yo); r = Yo + (r - Yo) * t; g = Yo + (g - Yo) * t; b = Yo + (b - Yo) * t; } }
    const mn = Math.min(r, g, b); if (mn < 0) { const t = Yo / (Yo - mn + 1e-9); r = Yo + (r - Yo) * t; g = Yo + (g - Yo) * t; b = Yo + (b - Yo) * t; }
    o[q] = E[(clamp(r, 0, 1) * 65535) | 0]; o[q + 1] = E[(clamp(g, 0, 1) * 65535) | 0]; o[q + 2] = E[(clamp(b, 0, 1) * 65535) | 0]; o[q + 3] = A ? A[i] : 255;
  }
  return out;
}
function autoTone(st, s) {
  // exposure so that the median sits near middle grey; recover highlights that would clip
  const m = Math.max(1e-4, st.median * st.baseGain), ev = clamp(Math.log2(0.16 / m) * 0.7, -2, 2), top = st.p99 * st.baseGain * Math.pow(2, ev);
  return { ...s, exposure: Math.round(ev * 20) / 20, contrast: 10, highlights: top > 0.95 ? -Math.round(clamp((top - 0.95) * 120, 10, 70)) : 0, shadows: m * Math.pow(2, ev) < 0.12 ? 25 : 10, whites: top < 0.8 ? 15 : 0, blacks: -5 };
}

// =====================================================================  dialog
function histogram(img, cv) {
  const d = img.data, H = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)]; for (let i = 0; i < d.length; i += 4) { H[0][d[i]]++; H[1][d[i + 1]]++; H[2][d[i + 2]]++; }
  const c = cv.getContext('2d'), W = cv.width, HH = cv.height; c.clearRect(0, 0, W, HH); let mx = 1; for (let k = 0; k < 3; k++) for (let i = 2; i < 254; i++) mx = Math.max(mx, H[k][i]);
  c.globalCompositeOperation = 'screen'; ['#ff4b4b', '#3ccf6e', '#3b8bff'].forEach((col, k) => { c.fillStyle = col; c.beginPath(); c.moveTo(0, HH); for (let i = 0; i < 256; i++) c.lineTo(i / 255 * W, HH - Math.min(HH, H[k][i] / mx * HH)); c.lineTo(W, HH); c.fill(); }); c.globalCompositeOperation = 'source-over';
  const clipHi = H[0][255] + H[1][255] + H[2][255], clipLo = H[0][0] + H[1][0] + H[2][0], tot = d.length / 4 * 3;
  return { hi: clipHi / tot, lo: clipLo / tot };
}
const rng = (key, label, min, max, step = 1) => ({ key, label, type: 'range', min, max, step });
function crFields(mode) {
  return [
    { key: 'n0', type: 'note', label: 'White balance' },
    { key: 'wb', label: 'White balance', type: 'select', options: [{ value: 'shot', label: mode === 'raw' ? 'As shot' : 'Original' }, { value: 'auto', label: 'Auto' }, { value: 'picked', label: 'Custom (picker)' }] },
    rng('temp', 'Temperature (cool ↔ warm)', -100, 100), rng('tint', 'Tint (green ↔ magenta)', -100, 100),
    { key: 'n1', type: 'note', label: 'Tone' },
    rng('exposure', 'Exposure (stops)', -5, 5, 0.05), rng('contrast', 'Contrast', -100, 100), rng('highlights', 'Highlights', -100, 100), rng('shadows', 'Shadows', -100, 100), rng('whites', 'Whites', -100, 100), rng('blacks', 'Blacks', -100, 100),
    { key: 'n2', type: 'note', label: 'Presence' },
    rng('clarity', 'Clarity', -100, 100), rng('vibrance', 'Vibrance', -100, 100), rng('saturation', 'Saturation', -100, 100),
    { key: 'n3', type: 'note', label: 'Detail' },
    rng('nr', 'Noise reduction', 0, 100), rng('cnr', 'Color noise reduction', 0, 100),
  ];
}
// returns settings or null. full = full-resolution source (used for the 100% detail view)
async function cameraRawDialog({ full, title = 'Camera Raw', ok = 'Open', init = null, info = '', notice = '' }) {
  const pv = downsample(full, 1000), st = statsOf(pv), refSide = Math.max(full.w, full.h);
  let s = { ...defaultsFor(full.mode), ...(init || {}) }; if (s.wb === 'picked' && !Array.isArray(s.wbMul)) s.wb = 'shot';
  const cv = h('canvas', { width: pv.w, height: pv.h, class: 'cr-cv checker' }), img = new ImageData(pv.w, pv.h), orig = new ImageData(pv.w, pv.h);
  develop(pv, { ...DEFAULTS, wb: 'shot', cnr: 0 }, { ...st }, orig, { scale: 1 / pv.scale, refSide }); // unedited (as shot, base rendering)
  const histC = h('canvas', { width: 280, height: 90, class: 'cr-hist' }), clipEl = h('div', { class: 'muted cr-clip' }), loupe = h('canvas', { width: 280, height: 170, class: 'cr-loupe checker' });
  let showOrig = false, picking = false, lx = full.w / 2, ly = full.h / 2, seq = 0, timer = null, ltimer = null;
  const statusEl = h('div', { class: 'muted cr-status' }, info);
  const draw = () => { const my = ++seq; const t0 = performance.now(); develop(pv, s, st, img, { scale: 1 / pv.scale, refSide }); if (my !== seq) return; cv.getContext('2d').putImageData(showOrig ? orig : img, 0, 0); const cl = histogram(img, histC); clipEl.textContent = `${Math.round(performance.now() - t0)} ms` + (cl.hi > 0.002 ? ' · ' + (cl.hi * 100).toFixed(1) + '% clipped highlights' : '') + (cl.lo > 0.002 ? ' · ' + (cl.lo * 100).toFixed(1) + '% clipped shadows' : ''); };
  const drawLoupe = () => { const c = cropSrc(full, lx, ly, loupe.width, loupe.height), o = new ImageData(c.w, c.h); develop(c, s, st, o, { scale: 1, refSide }); loupe.getContext('2d').clearRect(0, 0, loupe.width, loupe.height); loupe.getContext('2d').putImageData(o, 0, 0); };
  const sched = () => { clearTimeout(timer); timer = setTimeout(draw, 20); clearTimeout(ltimer); ltimer = setTimeout(drawLoupe, 160); };
  const fields = h('div', { class: 'ph-fields cr-fields' });
  const buildF = () => { fields.innerHTML = ''; P().buildFields(fields, crFields(full.mode), s, (v, key) => { if (key === 'wb' && s.wb === 'picked' && !s.wbMul) { s.wb = 'shot'; toast('Click a neutral grey or white area in the preview to set the white balance'); setPick(true); } sched(); }); };
  const pickBtn = h('button', { class: 'btn sm', 'data-tip': 'White balance picker — click something that should be neutral grey', onclick: () => setPick(!picking) }, 'White balance picker');
  const setPick = on => { picking = on; pickBtn.classList.toggle('primary', on); cv.style.cursor = on ? 'crosshair' : 'zoom-in'; };
  const origChk = h('input', { type: 'checkbox' }); origChk.onchange = () => { showOrig = origChk.checked; cv.getContext('2d').putImageData(showOrig ? orig : img, 0, 0); };
  cv.style.cursor = 'zoom-in';
  cv.onpointerdown = e => {
    const r = cv.getBoundingClientRect(), px = clamp(Math.floor((e.clientX - r.left) / r.width * pv.w), 0, pv.w - 1), py = clamp(Math.floor((e.clientY - r.top) / r.height * pv.h), 0, pv.h - 1);
    if (picking) { let R = 0, G = 0, B = 0, k = 0; for (let y = Math.max(0, py - 2); y <= Math.min(pv.h - 1, py + 2); y++) for (let x = Math.max(0, px - 2); x <= Math.min(pv.w - 1, px + 2); x++) { const j = (y * pv.w + x) * 3; R += pv.data[j]; G += pv.data[j + 1]; B += pv.data[j + 2]; k++; } if (R > 0 && B > 0 && G > 0) { s.wb = 'picked'; s.wbMul = [clamp(G / R, 0.2, 5), 1, clamp(G / B, 0.2, 5)]; s.temp = 0; s.tint = 0; buildF(); sched(); } setPick(false); return; }
    lx = px / pv.w * full.w; ly = py / pv.h * full.h; drawLoupe();
  };
  const autoBtn = h('button', { class: 'btn sm', onclick: () => { s = autoTone(st, s); buildF(); sched(); } }, 'Auto');
  const resetBtn = h('button', { class: 'btn sm', onclick: () => { s = defaultsFor(full.mode); buildF(); sched(); } }, 'Reset');
  buildF(); draw(); drawLoupe();
  const body = h('div', { class: 'cr-dlg' },
    h('div', { class: 'cr-main' }, notice ? h('div', { class: 'cr-notice' }, notice) : '', h('div', { class: 'cr-pv' }, cv), h('div', { class: 'row cr-bar' }, statusEl, h('label', { class: 'row chk' }, origChk, 'Show original'))),
    h('div', { class: 'cr-side' }, histC, clipEl, h('div', { class: 'row cr-btns' }, autoBtn, resetBtn, pickBtn), fields, h('div', { class: 'muted cr-l' }, 'Detail at 100% — click the preview to move'), loupe));
  const r = await modal({ title, width: 1240, body, buttons: [{ label: 'Cancel', value: null }, { label: ok, primary: true, value: 'ok' }] });
  clearTimeout(timer); clearTimeout(ltimer);
  if (r !== 'ok') return null; const out = { ...s }; if (out.wb !== 'picked') delete out.wbMul; Object.keys(out).forEach(k => /^n\d$/.test(k) && delete out[k]); return out;
}

// =====================================================================  public entry points
function rawInfo(src, name) { const m = src.meta || {}; const parts = [name, `${src.w} × ${src.h}`]; if (m.camera_make || m.camera_model) parts.push(`${m.camera_make || ''} ${m.camera_model || ''}`.trim()); if (m.iso_speed) parts.push('ISO ' + Math.round(m.iso_speed)); if (m.shutter) parts.push(m.shutter >= 1 ? m.shutter.toFixed(1) + ' s' : '1/' + Math.round(1 / m.shutter) + ' s'); if (m.aperture) parts.push('f/' + (+m.aperture).toFixed(1)); if (m.focal_len) parts.push(Math.round(m.focal_len) + ' mm'); return parts.join(' · '); }
function toCanvas(img) { const c = P().mk(img.width, img.height); P().ctxOf(c).putImageData(img, 0, 0); return c; }
function developFull(src, s) { const st = statsOf(downsample(src, 1000)), out = new ImageData(src.w, src.h); develop(src, s, st, out, { scale: 1, refSide: Math.max(src.w, src.h) }); return toCanvas(out); }
// decode a raw file; falls back to the embedded JPEG preview when the raw data cannot be decoded
async function loadRawSource(u8, name) {
  try { return { src: await decodeRaw(u8, name) }; }
  catch (e) {
    console.warn('LibRaw could not decode', name, e);
    const c = await embeddedPreview(u8); if (!c) throw new Error('This camera raw file could not be decoded and has no embedded preview');
    return { src: srcFromCanvas(c, 'srgb'), preview: true };
  }
}
async function openRawDialog(u8, name) {
  const { src, preview } = await P().withBusyResult('Decoding camera raw…', () => loadRawSource(u8, name));
  const s = await cameraRawDialog({ full: src, title: 'Camera Raw — ' + name, ok: 'Open', info: rawInfo(src, name), notice: preview ? 'The raw sensor data in this file could not be decoded, so the full-size JPEG preview embedded in it is being edited instead.' : '' });
  if (!s) return null;
  const c = await P().withBusyResult('Developing…', async () => { await P().sleep(20); return developFull(src, s); });
  if (preview) toast('Opened the embedded JPEG preview of this raw file (the raw data could not be decoded)', 'err', 7000);
  return c;
}
// develop with given (or default) settings, no dialog — batch & Place
async function developRaw(u8, name, settings = null) { const { src, preview } = await loadRawSource(u8, name); return { canvas: developFull(src, { ...defaultsFor(src.mode), ...(settings || {}) }), preview }; }
// Camera Raw filter on the active pixel layer (honours the selection)
function applyToLayer(settings) {
  const A = P(), L = A.needPixelLayer(); A.REC('camraw', { settings });
  A.layerImageOp(L, img => { const src = srcFromImageData(img); develop(src, { ...DEFAULTS, ...settings }, statsOf(downsample(src, 1000)), img, { scale: 1, refSide: Math.max(img.width, img.height) }); }, {});
  A.requestRender(); A.pushHist('Camera Raw filter');
}
async function filterDialog(init = null) {
  const A = P(); const L = A.checkPixelLayer(); if (!L) return; if (L.smart) return toast('This layer has smart filters — use Layer › Smart filters › Rasterize first', 'err');
  const full = srcFromCanvas(L.canvas, 'srgb');
  const s = await cameraRawDialog({ full, title: 'Camera Raw filter', ok: 'OK', init, info: L.name + ` · ${full.w} × ${full.h}` });
  if (!s) return false;
  await A.withBusyResult('Camera Raw filter…', async () => { await A.sleep(20); applyToLayer(s); });
  return true;
}
async function decodeHeif(u8) {
  const lh = await loadHeif(); const dec = new lh.HeifDecoder(); const imgs = dec.decode(u8);
  if (!imgs || !imgs.length) throw new Error('No image found in this HEIF file');
  const im = imgs.find(i => { try { return i.is_primary(); } catch { return false; } }) || imgs[0];
  const w = im.get_width(), hh = im.get_height(), id = new ImageData(w, hh);
  await new Promise((res, rej) => im.display(id, r => r ? res() : rej(new Error('HEIF decoding failed'))));
  imgs.forEach(i => { try { i.free(); } catch { } });
  let c = toCanvas(id);
  if (!heifHasTransforms(u8)) { const o = exifOrientation(u8); if (o > 1) c = orientCanvas(c, o); }
  return c;
}
window.PhotoRaw = { openRawDialog, develop: developRaw, applyToLayer, filterDialog, decodeHeif, looksHeif, cameraRawDialog, _: { decodeRaw, embeddedPreview, findJpegs, srcFromImageData, srcFromCanvas, downsample, develop, statsOf, wbMultipliers, toneLut, exifOrientation, heifHasTransforms, kelvinRGB, defaultsFor, DEFAULTS, loadHeif, autoTone } };
})();
