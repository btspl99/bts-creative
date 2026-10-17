// BTS Video — colour grading: .cube LUTs (1D / 3D), Lift / Gamma / Gain / Offset colour wheels, RGB + hue curves,
// and the Scopes panel (waveform, RGB parade, vectorscope, histogram). The grading tools are ordinary stackable effects
// (VFX.EFFECTS 'lut', 'wheels', 'curves'), so they work per clip and on adjustment layers, their numeric parameters are
// keyframeable ('fx:<id>:<param>'), and preview + export share one renderer: WebGL2 shaders with an exact CPU port.
(() => {
'use strict';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// =====================================================================  LUTs
const BUNDLED = [['teal-orange', 'Teal & Orange'], ['film-warm', 'Film Warm'], ['bleach-bypass', 'Bleach Bypass'], ['cold-blue', 'Cold Blue'], ['vintage-fade', 'Vintage Fade'], ['mono-contrast', 'Mono Contrast'], ['day-for-night', 'Day for Night'], ['kodak-warm', 'Kodak-ish Warm']];
const luts = new Map(); // id -> parsed LUT | {loading: Promise} | {error}
function parseCube(text) {
  let N3 = 0, N1 = 0, title = '', dmin = [0, 0, 0], dmax = [1, 1, 1]; const vals = [];
  for (const raw of String(text).replace(/^﻿/, '').split(/\r?\n/)) {
    const ln = raw.trim(); if (!ln || ln[0] === '#') continue;
    const kw = ln.split(/\s+/);
    if (/^TITLE$/i.test(kw[0])) { title = ln.replace(/^TITLE\s*/i, '').replace(/^"|"$/g, ''); continue; }
    if (/^LUT_3D_SIZE$/i.test(kw[0])) { N3 = +kw[1]; continue; }
    if (/^LUT_1D_SIZE$/i.test(kw[0])) { N1 = +kw[1]; continue; }
    if (/^DOMAIN_MIN$/i.test(kw[0])) { dmin = kw.slice(1, 4).map(Number); continue; }
    if (/^DOMAIN_MAX$/i.test(kw[0])) { dmax = kw.slice(1, 4).map(Number); continue; }
    if (/^LUT_(1D|3D)_INPUT_RANGE$/i.test(kw[0])) { dmin = [+kw[1], +kw[1], +kw[1]]; dmax = [+kw[2], +kw[2], +kw[2]]; continue; }
    if (/^[A-Z_]+$/i.test(kw[0]) && isNaN(+kw[0])) continue; // unknown keyword
    if (kw.length >= 3) vals.push(+kw[0], +kw[1], +kw[2]);
  }
  if (N3 && N1) throw new Error('LUTs that combine a 1D shaper and a 3D table are not supported');
  const N = N3 || N1; if (!N || N < 2 || N > 256) throw new Error('This is not a valid .cube LUT (missing LUT_3D_SIZE or LUT_1D_SIZE)');
  const need = N3 ? N * N * N * 3 : N * 3; if (vals.length < need || vals.some(v => !isFinite(v))) throw new Error(`The LUT data is incomplete (${Math.floor(vals.length / 3)} of ${need / 3} entries)`);
  if (dmin.some((v, i) => !(dmax[i] > v))) { dmin = [0, 0, 0]; dmax = [1, 1, 1]; }
  if (N3) return { kind: '3d', N, title, dmin, dmax, data: new Float32Array(vals.slice(0, need)) };
  const d = new Float32Array(N * 3); for (let i = 0; i < N; i++) for (let c = 0; c < 3; c++) d[c * N + i] = vals[i * 3 + c]; // rows R, G, B
  return { kind: '1d', N, title, dmin, dmax, data: d };
}
const lutName = id => { if (!id) return 'None'; if (id.startsWith('b:')) return (BUNDLED.find(b => b[0] === id.slice(2)) || [, id.slice(2)])[1]; return id.slice(2).split(/[\\/]/).pop().replace(/\.cube$/i, ''); };
function loadLut(id) {
  const cur = luts.get(id); if (cur) return cur.loading || Promise.resolve(cur.error ? null : cur);
  const job = (async () => {
    let text;
    if (id.startsWith('b:')) text = await (await fetch('luts/' + encodeURIComponent(id.slice(2)) + '.cube')).text();
    else { const r = await bts.fs.read(id.slice(2)); text = new TextDecoder().decode(new Uint8Array(r.data)); }
    const L = parseCube(text); L.id = id; L.key = 'lut:' + id + ':' + L.N + ':' + L.data.length; return L;
  })().then(L => { luts.set(id, L); if (typeof drawFrameSoon === 'function') drawFrameSoon(); return L; })
    .catch(e => { luts.set(id, { error: e.message || String(e) }); console.warn('LUT', id, e); if (window.UI) UI.toast(`Could not load the LUT “${lutName(id)}”: ${e.message}`, 'err', 6000); return null; });
  luts.set(id, { loading: job }); return job;
}
function getLut(id) { if (!id) return null; const L = luts.get(id); if (!L) { loadLut(id); return null; } return L.loading || L.error ? null : L; }
// all LUT effects in every sequence (used before an export so no frame renders without its LUT)
async function preloadAll() {
  const ids = new Set(); const scan = clips => (clips || []).forEach(c => (c.fx || []).forEach(f => { if (f.type === 'lut' && f.lut) ids.add(f.lut); }));
  if (typeof PJ !== 'undefined') { scan(PJ.clips); (PJ.sequences || []).forEach(s => scan(s.clips)); }
  await Promise.all([...ids].map(loadLut));
}

// =====================================================================  curves
// Monotonicity-preserving cubic (Fritsch–Carlson) through points [[x,y],...] sampled at n positions on [0,1].
function monoSample(pts, n, periodic) {
  let P = (pts || []).map(p => [+p[0], +p[1]]).filter(p => isFinite(p[0]) && isFinite(p[1])).sort((a, b) => a[0] - b[0]);
  const out = new Float32Array(n);
  if (!P.length) { out.fill(periodic ? 0.5 : NaN); return out; }
  if (P.length === 1) { out.fill(P[0][1]); return out; }
  if (periodic) { const a = P[P.length - 2] || P[0], b = P[P.length - 1], c = P[0], d = P[1]; P = [[a[0] - 1, a[1]], [b[0] - 1, b[1]], ...P, [c[0] + 1, c[1]], [d[0] + 1, d[1]]]; }
  const m = P.length, dx = [], sl = [], t = new Array(m).fill(0);
  for (let i = 0; i < m - 1; i++) { dx[i] = Math.max(1e-6, P[i + 1][0] - P[i][0]); sl[i] = (P[i + 1][1] - P[i][1]) / dx[i]; }
  t[0] = sl[0]; t[m - 1] = sl[m - 2];
  for (let i = 1; i < m - 1; i++) t[i] = sl[i - 1] * sl[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / sl[i - 1] + (dx[i] + 2 * dx[i - 1]) / sl[i]);
  let k = 0;
  for (let j = 0; j < n; j++) {
    const x = periodic ? j / n : j / (n - 1);
    if (x <= P[0][0]) { out[j] = P[0][1]; continue; } if (x >= P[m - 1][0]) { out[j] = P[m - 1][1]; continue; }
    while (k < m - 2 && x > P[k + 1][0]) k++; while (k > 0 && x < P[k][0]) k--;
    const h = dx[k], s = (x - P[k][0]) / h, s2 = s * s, s3 = s2 * s;
    out[j] = (2 * s3 - 3 * s2 + 1) * P[k][1] + (s3 - 2 * s2 + s) * h * t[k] + (-2 * s3 + 3 * s2) * P[k + 1][1] + (s3 - s2) * h * t[k + 1];
  }
  return out;
}
const DEF_CURVE = [[0, 0], [1, 1]];
const isIdentityCurve = pts => !pts || !pts.length || (pts.length === 2 && pts.every(p => Math.abs(p[0] - p[1]) < 1e-4) && Math.abs(pts[0][0]) < 1e-4 && Math.abs(pts[1][0] - 1) < 1e-4);
const isFlatHue = pts => !pts || !pts.length || pts.every(p => Math.abs(p[1] - 0.5) < 1e-4);
const crvCache = new Map();
function curveTable(f) {
  const key = 'crv:' + JSON.stringify([f.cm, f.cr, f.cg, f.cb, f.hs, f.hh]); let T = crvCache.get(key); if (T) return T;
  const d = new Float32Array(256 * 6);
  [f.cm, f.cr, f.cg, f.cb].forEach((pts, r) => { const s = monoSample(pts && pts.length ? pts : DEF_CURVE, 256, false); for (let i = 0; i < 256; i++) d[r * 256 + i] = clamp(s[i], 0, 1); });
  const hs = monoSample(f.hs, 256, true), hh = monoSample(f.hh, 256, true);
  for (let i = 0; i < 256; i++) { d[4 * 256 + i] = clamp(hs[i], 0, 1) * 2; d[5 * 256 + i] = clamp(hh[i], 0, 1) - 0.5; }
  T = { kind: '2d', key, w: 256, h: 6, ch: 1, data: d, hue: !isFlatHue(f.hs) || !isFlatHue(f.hh) };
  crvCache.set(key, T); if (crvCache.size > 40) crvCache.delete(crvCache.keys().next().value); return T;
}

// =====================================================================  wheels
const WHEELS = [['lift', 'Lift'], ['gamma', 'Gamma'], ['gain', 'Gain'], ['off', 'Offset']];
function wheelUniforms(f) {
  const v = (w, c) => (+f[w + c] || 0) + (+f[w + 'Y'] || 0);
  const lift = ['R', 'G', 'B'].map(c => v('lift', c) * 0.004), gain = ['R', 'G', 'B'].map(c => 1 + v('gain', c) * 0.01), gexp = ['R', 'G', 'B'].map(c => Math.pow(2, -v('gamma', c) * 0.01)), off = ['R', 'G', 'B'].map(c => v('off', c) * 0.003);
  return { lift, gainv: gain, gexp, off };
}
const wheelsIdentity = f => WHEELS.every(([w]) => ['R', 'G', 'B', 'Y'].every(c => !(+f[w + c])));

// =====================================================================  passes (shared by the WebGL and CPU paths)
function passFor(f) {
  if (f.type === 'lut') {
    const amt = clamp((f.amount ?? 100) / 100, 0, 1); if (amt <= 0) return null; const L = getLut(f.lut); if (!L) return null;
    if (L.kind === '3d') return { name: 'lut3d', u: { N: L.N, amt, dmin: L.dmin, dmax: L.dmax }, tex: { lut: { kind: '3d', key: L.key, w: L.N, h: L.N, d: L.N, ch: 3, data: L.data } }, L };
    return { name: 'lut1d', u: { N: L.N, amt, dmin: L.dmin, dmax: L.dmax }, tex: { lut1: { kind: '2d', key: L.key, w: L.N, h: 3, ch: 1, data: L.data } }, L };
  }
  if (f.type === 'wheels') { if (wheelsIdentity(f)) return null; return { name: 'wheels', u: wheelUniforms(f) }; }
  if (f.type === 'curves') {
    const amt = clamp((f.amount ?? 100) / 100, 0, 1); if (amt <= 0) return null;
    if ([f.cm, f.cr, f.cg, f.cb].every(isIdentityCurve) && isFlatHue(f.hs) && isFlatHue(f.hh)) return null;
    const T = curveTable(f); return { name: 'curves', u: { amt, hueOn: T.hue ? 1 : 0 }, tex: { crv: T }, T };
  }
  return null;
}
const SHADERS = {
  lut3d: `uniform highp sampler3D lut; uniform float N, amt; uniform vec3 dmin, dmax;
vec3 lk(int x, int y, int z){ return texelFetch(lut, ivec3(x, y, z), 0).rgb; }
void main(){ vec4 s = texture(tex, uv); vec3 c = clamp((s.rgb - dmin) / (dmax - dmin), 0.0, 1.0) * (N - 1.0);
  vec3 f0 = min(floor(c), vec3(N - 2.0)); ivec3 a = ivec3(f0); ivec3 b = a + 1; vec3 f = c - f0;
  vec3 c00 = mix(lk(a.x, a.y, a.z), lk(b.x, a.y, a.z), f.x), c10 = mix(lk(a.x, b.y, a.z), lk(b.x, b.y, a.z), f.x);
  vec3 c01 = mix(lk(a.x, a.y, b.z), lk(b.x, a.y, b.z), f.x), c11 = mix(lk(a.x, b.y, b.z), lk(b.x, b.y, b.z), f.x);
  vec3 v = mix(mix(c00, c10, f.y), mix(c01, c11, f.y), f.z);
  o = vec4(clamp(mix(s.rgb, v, amt), 0.0, 1.0), s.a); }`,
  lut1d: `uniform highp sampler2D lut1; uniform float N, amt; uniform vec3 dmin, dmax;
float l1(int row, float x){ float p = clamp(x, 0.0, 1.0) * (N - 1.0); float i0 = min(floor(p), N - 2.0); float f = p - i0; int i = int(i0);
  return mix(texelFetch(lut1, ivec2(i, row), 0).r, texelFetch(lut1, ivec2(i + 1, row), 0).r, f); }
void main(){ vec4 s = texture(tex, uv); vec3 c = (s.rgb - dmin) / (dmax - dmin); vec3 v = vec3(l1(0, c.r), l1(1, c.g), l1(2, c.b));
  o = vec4(clamp(mix(s.rgb, v, amt), 0.0, 1.0), s.a); }`,
  wheels: `uniform vec3 lift, gainv, gexp, off;
void main(){ vec4 s = texture(tex, uv); vec3 c = s.rgb; c = c + lift * (1.0 - c); c = c * gainv; c = pow(max(c, vec3(0.0)), gexp); c = c + off;
  o = vec4(clamp(c, 0.0, 1.0), s.a); }`,
  curves: `uniform highp sampler2D crv; uniform float amt, hueOn;
float cv(int row, float x){ float p = clamp(x, 0.0, 1.0) * 255.0; float i0 = min(floor(p), 254.0); float f = p - i0; int i = int(i0);
  return mix(texelFetch(crv, ivec2(i, row), 0).r, texelFetch(crv, ivec2(i + 1, row), 0).r, f); }
float hv(int row, float h){ float p = fract(h) * 256.0; float i0 = floor(p); float f = p - i0; int i = int(i0) % 256; int j = (i + 1) % 256;
  return mix(texelFetch(crv, ivec2(i, row), 0).r, texelFetch(crv, ivec2(j, row), 0).r, f); }
vec3 rgb2hsv(vec3 c){ float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), d = mx - mn; float h = 0.0;
  if (d > 1e-6) { if (mx == c.r) h = (c.g - c.b) / d; else if (mx == c.g) h = (c.b - c.r) / d + 2.0; else h = (c.r - c.g) / d + 4.0; h = h / 6.0; if (h < 0.0) h += 1.0; }
  return vec3(h, mx > 0.0 ? d / mx : 0.0, mx); }
vec3 hsv2rgb(vec3 c){ vec3 k = mod(vec3(5.0, 3.0, 1.0) + c.x * 6.0, 6.0); return c.z - c.z * c.y * clamp(min(k, 4.0 - k), 0.0, 1.0); }
void main(){ vec4 s = texture(tex, uv); vec3 c = s.rgb; vec3 g = vec3(cv(0, c.r), cv(0, c.g), cv(0, c.b)); g = vec3(cv(1, g.r), cv(2, g.g), cv(3, g.b));
  if (hueOn > 0.5) { vec3 q = rgb2hsv(g); float sm = hv(4, q.x), sh = hv(5, q.x); q.y = clamp(q.y * sm, 0.0, 1.0); q.x = fract(q.x + sh); g = hsv2rgb(q); }
  o = vec4(clamp(mix(c, g, amt), 0.0, 1.0), s.a); }`,
};
Object.entries(SHADERS).forEach(([k, src]) => VFX.GL.addShader(k, src));
const CPU_PASSES = Object.keys(SHADERS);
// exact JS port of the shaders above (used when WebGL2 is unavailable)
function cpuPass(canvas, ps) {
  const x = canvas.getContext('2d', { willReadFrequently: true }); const im = x.getImageData(0, 0, canvas.width, canvas.height); const d = im.data; const u = ps.u; const n = d.length;
  if (ps.name === 'lut3d') {
    const L = ps.L, N = L.N, T = L.data, a3 = u.amt; const lk = (xx, yy, zz, c) => T[((zz * N + yy) * N + xx) * 3 + c];
    for (let i = 0; i < n; i += 4) {
      const p = [0, 1, 2].map(c => clamp((d[i + c] / 255 - u.dmin[c]) / (u.dmax[c] - u.dmin[c]), 0, 1) * (N - 1));
      const f0 = p.map(v => Math.min(Math.floor(v), N - 2)), fr = p.map((v, c) => v - f0[c]); const [ax, ay, az] = f0, bx = ax + 1, by = ay + 1, bz = az + 1;
      for (let c = 0; c < 3; c++) {
        const m = (q, r, t) => q + (r - q) * t;
        const c00 = m(lk(ax, ay, az, c), lk(bx, ay, az, c), fr[0]), c10 = m(lk(ax, by, az, c), lk(bx, by, az, c), fr[0]), c01 = m(lk(ax, ay, bz, c), lk(bx, ay, bz, c), fr[0]), c11 = m(lk(ax, by, bz, c), lk(bx, by, bz, c), fr[0]);
        const v = m(m(c00, c10, fr[1]), m(c01, c11, fr[1]), fr[2]); const s0 = d[i + c] / 255; d[i + c] = clamp(s0 + (v - s0) * a3, 0, 1) * 255;
      }
    }
  } else if (ps.name === 'lut1d') {
    const L = ps.L, N = L.N, T = L.data; const l1 = (row, v) => { const p = clamp(v, 0, 1) * (N - 1); const i0 = Math.min(Math.floor(p), N - 2); const f = p - i0; return T[row * N + i0] + (T[row * N + i0 + 1] - T[row * N + i0]) * f; };
    for (let i = 0; i < n; i += 4) for (let c = 0; c < 3; c++) { const s0 = d[i + c] / 255; const v = l1(c, (s0 - u.dmin[c]) / (u.dmax[c] - u.dmin[c])); d[i + c] = clamp(s0 + (v - s0) * u.amt, 0, 1) * 255; }
  } else if (ps.name === 'wheels') {
    for (let i = 0; i < n; i += 4) for (let c = 0; c < 3; c++) { let v = d[i + c] / 255; v = v + u.lift[c] * (1 - v); v *= u.gainv[c]; v = Math.pow(Math.max(v, 0), u.gexp[c]); v += u.off[c]; d[i + c] = clamp(v, 0, 1) * 255; }
  } else if (ps.name === 'curves') {
    const T = ps.T.data; const cv = (row, v) => { const p = clamp(v, 0, 1) * 255; const i0 = Math.min(Math.floor(p), 254); const f = p - i0; return T[row * 256 + i0] + (T[row * 256 + i0 + 1] - T[row * 256 + i0]) * f; };
    const hv = (row, hh) => { const p = (hh - Math.floor(hh)) * 256; const i0 = Math.floor(p); const f = p - i0; const a = i0 % 256, b = (a + 1) % 256; return T[row * 256 + a] + (T[row * 256 + b] - T[row * 256 + a]) * f; };
    for (let i = 0; i < n; i += 4) {
      const c = [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255]; let g = c.map(v => cv(0, v)); g = [cv(1, g[0]), cv(2, g[1]), cv(3, g[2])];
      if (u.hueOn > 0.5) { const q = rgb2hsv(g); q[1] = clamp(q[1] * hv(4, q[0]), 0, 1); q[0] = ((q[0] + hv(5, q[0])) % 1 + 1) % 1; g = hsv2rgb(q); }
      for (let k = 0; k < 3; k++) d[i + k] = clamp(c[k] + (g[k] - c[k]) * u.amt, 0, 1) * 255;
    }
  }
  x.putImageData(im, 0, 0);
}
function rgb2hsv([r, g, b]) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), dd = mx - mn; let hh = 0; if (dd > 1e-6) { if (mx === r) hh = (g - b) / dd; else if (mx === g) hh = (b - r) / dd + 2; else hh = (r - g) / dd + 4; hh /= 6; if (hh < 0) hh += 1; } return [hh, mx > 0 ? dd / mx : 0, mx]; }
function hsv2rgb([hh, s, v]) { return [5, 3, 1].map(n0 => { const k = ((n0 + hh * 6) % 6 + 6) % 6; return v - v * s * clamp(Math.min(k, 4 - k), 0, 1); }); }

// =====================================================================  effect definitions
const P = (k, label, min, max, def, step = 1, extra = {}) => ({ k, label, min, max, def, step, ...extra });
VFX.EFFECTS.lut = { name: 'LUT (.cube)', cat: 'Colour', ui: 'lut', params: [{ k: 'lut', label: 'LUT', type: 'lut', def: 'b:teal-orange' }, P('amount', 'Intensity %', 0, 100, 100)] };
const WHEEL_LABELS = {
  liftR: 'Lift red', liftG: 'Lift green', liftB: 'Lift blue', liftY: 'Lift luma', gammaR: 'Gamma red', gammaG: 'Gamma green', gammaB: 'Gamma blue', gammaY: 'Gamma luma',
  gainR: 'Gain red', gainG: 'Gain green', gainB: 'Gain blue', gainY: 'Gain luma', offR: 'Offset red', offG: 'Offset green', offB: 'Offset blue', offY: 'Offset luma' };
VFX.EFFECTS.wheels = { name: 'Colour wheels', cat: 'Colour', ui: 'wheels', params: Object.entries(WHEEL_LABELS).map(([k, l]) => P(k, l, -100, 100, 0, 0.5)) };
VFX.EFFECTS.curves = { name: 'RGB curves', cat: 'Colour', ui: 'curves', params: [{ k: 'cm', label: 'Master', type: 'curve', def: DEF_CURVE }, { k: 'cr', label: 'Red', type: 'curve', def: DEF_CURVE }, { k: 'cg', label: 'Green', type: 'curve', def: DEF_CURVE }, { k: 'cb', label: 'Blue', type: 'curve', def: DEF_CURVE }, { k: 'hs', label: 'Hue vs Sat', type: 'hcurve', def: [] }, { k: 'hh', label: 'Hue vs Hue', type: 'hcurve', def: [] }, P('amount', 'Mix %', 0, 100, 100)] };

// =====================================================================  Effect Controls UI for the grading effects
// ctx: { c, f, slider(label, key, min, max, step, opts), live(), commit(label), commitSoon(label) }
const isLight = () => (UI.getSettings().skin || 'dark') === 'light';
function ui(d, ctx) {
  if (d.ui === 'lut') return lutUI(ctx); if (d.ui === 'wheels') return wheelsUI(ctx); if (d.ui === 'curves') return curvesUI(ctx); return null;
}
function lutUI({ c, f, slider, live, commit }) {
  const imported = (PREFS.luts || []).filter(p => typeof p === 'string');
  const s = h('select', {}, h('optgroup', { label: 'Bundled LUTs' }, ...BUNDLED.map(([k, l]) => h('option', { value: 'b:' + k, selected: f.lut === 'b:' + k }, l))),
    imported.length || (f.lut && f.lut.startsWith('f:')) ? h('optgroup', { label: 'Imported' }, ...[...new Set([...(f.lut && f.lut.startsWith('f:') ? [f.lut.slice(2)] : []), ...imported])].map(p => h('option', { value: 'f:' + p, selected: f.lut === 'f:' + p }, lutName('f:' + p)))) : '',
    h('option', { value: '__import' }, 'Import .cube file…'));
  s.onchange = async () => { if (s.value === '__import') { const id = await importLutFile(); if (id) { f.lut = id; commit('LUT'); } renderFx(); return; } f.lut = s.value; loadLut(f.lut).then(() => drawFrameSoon()); live(); commit('LUT'); };
  const L = luts.get(f.lut); const info = L && !L.loading ? (L.error ? h('div', { class: 'warn' }, L.error) : h('div', { class: 'okmsg' }, `${L.kind === '3d' ? '3D' : '1D'} LUT · ${L.N}${L.kind === '3d' ? '³' : ''} points${L.title ? ' · ' + L.title : ''}`)) : h('div', { class: 'okmsg' }, 'Loading…');
  if (!L) loadLut(f.lut).then(() => renderFx());
  return h('div', {}, h('div', { class: 'p2' }, h('span', {}, 'LUT'), s), info, slider('Intensity %', `fx:${f.id}:amount`, 0, 100, 1));
}
async function importLutFile() {
  const fl = await bts.fs.open({ filters: [{ name: 'Cube LUT', extensions: ['cube'] }] }); if (!fl) return null;
  const p = fl[0].path; try { const L = parseCube(new TextDecoder().decode(new Uint8Array(fl[0].data))); const id = 'f:' + p; L.id = id; L.key = 'lut:' + id + ':' + L.N + ':' + L.data.length; luts.set(id, L);
    PREFS.luts = [p, ...(PREFS.luts || []).filter(x => x !== p)].slice(0, 12); savePrefs(); toast(`Imported ${L.kind === '3d' ? '3D' : '1D'} LUT “${lutName(id)}”`, 'ok'); return id; }
  catch (e) { toast('Could not import the LUT: ' + e.message, 'err', 6000); return null; }
}
// adds a LUT effect (bundled id or 'import') to the selected clips
async function applyLut(id) {
  const cs = selected().filter(isVisual); if (!cs.length) return toast('Select a clip or an adjustment layer first');
  if (id === 'import') { id = await importLutFile(); if (!id) return; }
  await loadLut(id); addEffect('lut', { lut: id }, cs); return id;
}
const HUE_OF = (R, G, B) => { const x = (2 * R - G - B) / 3, y = (G - B) / Math.sqrt(3); return { x, y, m: Math.hypot(x, y) }; };
const discCache = new Map();
function hueDisc(px) {
  const key = px + (isLight() ? 'l' : 'd'); if (discCache.has(key)) return discCache.get(key);
  const cv = document.createElement('canvas'); cv.width = cv.height = px; const x = cv.getContext('2d'); const im = x.createImageData(px, px); const R = px / 2 - 1;
  for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) {
    const dx = i + 0.5 - px / 2, dy = px / 2 - (j + 0.5), r = Math.hypot(dx, dy) / R; const o = (j * px + i) * 4; if (r > 1) continue;
    const th = Math.atan2(dy, dx); const s = Math.min(1, r) * 0.75; const v = isLight() ? 0.92 : 0.55; const rgb = hsv2rgb([((th / (2 * Math.PI)) % 1 + 1) % 1, s, v]);
    im.data[o] = rgb[0] * 255; im.data[o + 1] = rgb[1] * 255; im.data[o + 2] = rgb[2] * 255; im.data[o + 3] = 255 * clamp((1 - r) * R, 0, 1);
  }
  x.putImageData(im, 0, 0); discCache.set(key, cv); return cv;
}
function wheelsUI({ c, f, slider, live, commit, commitSoon }) {
  const lt = () => clamp(ST.t - c.start, 0, tlDur(c)); const get = k => animGet(c, `fx:${f.id}:${k}`, lt()) || 0;
  const grid = h('div', { class: 'cw-grid' });
  WHEELS.forEach(([w, label]) => {
    const px = 112; const cv = h('canvas', { class: 'cw-wheel', width: px * (devicePixelRatio || 1), height: px * (devicePixelRatio || 1), style: { width: px + 'px', height: px + 'px' }, 'data-tip': 'Drag to tint · double-click to reset' });
    const val = h('div', { class: 'cw-val' });
    const draw = () => {
      const dpr = devicePixelRatio || 1, x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, px, px); x.drawImage(hueDisc(px * dpr), 0, 0, px, px);
      x.strokeStyle = 'rgba(128,128,128,.55)'; x.lineWidth = 1; x.beginPath(); x.moveTo(px / 2, 6); x.lineTo(px / 2, px - 6); x.moveTo(6, px / 2); x.lineTo(px - 6, px / 2); x.stroke();
      const q = HUE_OF(get(w + 'R'), get(w + 'G'), get(w + 'B')); const R = px / 2 - 8; const cx = px / 2 + q.x / 100 * R, cy = px / 2 - q.y / 100 * R;
      x.beginPath(); x.arc(cx, cy, 6, 0, Math.PI * 2); x.fillStyle = 'rgba(255,255,255,.9)'; x.fill(); x.lineWidth = 2; x.strokeStyle = '#111'; x.stroke();
      val.textContent = ['R', 'G', 'B', 'Y'].map(k => (k === 'Y' ? 'Y ' : k + ' ') + (+get(w + k)).toFixed(0)).join('  ');
    };
    const setFrom = ev => { const r = cv.getBoundingClientRect(); const R = px / 2 - 8; let dx = (ev.clientX - r.left - px / 2) / R, dy = -(ev.clientY - r.top - px / 2) / R; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
      const fine = ev.shiftKey ? 0.25 : 1; const th = Math.atan2(dy, dx), mag = Math.min(1, m) * 100 * fine;
      [0, 1, 2].forEach(i => animSet(c, `fx:${f.id}:${w}${'RGB'[i]}`, +(mag * Math.cos(th - i * 2 * Math.PI / 3)).toFixed(2), lt())); draw(); live(); };
    cv.addEventListener('pointerdown', ev => { cv.setPointerCapture(ev.pointerId); setFrom(ev); const mv = e2 => setFrom(e2); cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', () => { cv.removeEventListener('pointermove', mv); commit('Colour wheel'); renderFx(); }, { once: true }); });
    cv.addEventListener('dblclick', () => { ['R', 'G', 'B'].forEach(k => animSet(c, `fx:${f.id}:${w}${k}`, 0, lt())); draw(); live(); commit('Reset colour wheel'); renderFx(); });
    draw(); grid.append(h('div', { class: 'cw-cell' }, h('div', { class: 'cw-t' }, label), cv, val));
  });
  const lum = h('div', {}, h('div', { class: 'sub-h' }, 'Luma'), ...WHEELS.map(([w]) => slider(WHEEL_LABELS[w + 'Y'], `fx:${f.id}:${w}Y`, -100, 100, 0.5)));
  const det = h('details', { class: 'cw-num' }, h('summary', {}, 'Wheel colour values (keyframeable)'), ...WHEELS.flatMap(([w]) => ['R', 'G', 'B'].map(k => slider(WHEEL_LABELS[w + k], `fx:${f.id}:${w}${k}`, -100, 100, 0.5))));
  det.open = !!ST.cwNumOpen; det.ontoggle = () => { ST.cwNumOpen = det.open; };
  return h('div', {}, grid, lum, det, h('div', { class: 'btn-row' }, h('button', { class: 'btn sm', onclick: () => { WHEELS.forEach(([w]) => ['R', 'G', 'B', 'Y'].forEach(k => { delete c.kf[`fx:${f.id}:${w}${k}`]; f[w + k] = 0; })); commit('Reset colour wheels'); renderFx(); drawFrame(); } }, 'Reset wheels')));
}
const CURVE_TABS = [['cm', 'Master', '#d8d8d8'], ['cr', 'Red', '#ff5a5a'], ['cg', 'Green', '#4fd16a'], ['cb', 'Blue', '#4c8dff'], ['hs', 'Hue vs Sat', null], ['hh', 'Hue vs Hue', null]];
function curvesUI({ c, f, slider, live, commit, commitSoon }) {
  let tab = ST.curveTab && CURVE_TABS.some(t => t[0] === ST.curveTab) ? ST.curveTab : 'cm';
  const tabs = h('div', { class: 'cv-tabs' }); const W = 290, H = 190; const dpr = devicePixelRatio || 1;
  const cv = h('canvas', { class: 'cv-box', width: W * dpr, height: H * dpr, style: { width: W + 'px', height: H + 'px' }, 'data-tip': 'Click to add a point, drag to move, double-click a point to remove it' });
  const hue = () => tab === 'hs' || tab === 'hh';
  const pts = () => { if (!Array.isArray(f[tab])) f[tab] = hue() ? [] : JSON.parse(JSON.stringify(DEF_CURVE)); return f[tab]; };
  const toS = ([x, y]) => [8 + x * (W - 16), H - 8 - y * (H - 16)]; const toV = (sx, sy) => [clamp((sx - 8) / (W - 16), 0, 1), clamp((H - 8 - sy) / (H - 16), 0, 1)];
  const draw = () => {
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
    x.fillStyle = cssVar('--bg-1', '#16171b'); x.fillRect(0, 0, W, H);
    if (hue()) { const g = x.createLinearGradient(8, 0, W - 8, 0); for (let i = 0; i <= 12; i++) { const rgb = hsv2rgb([i / 12, 0.8, 0.9]); g.addColorStop(i / 12, `rgb(${rgb.map(v => Math.round(v * 255)).join(',')})`); } x.globalAlpha = 0.35; x.fillStyle = g; x.fillRect(8, 8, W - 16, H - 16); x.globalAlpha = 1; }
    x.strokeStyle = cssVar('--line-2', 'rgba(128,128,128,.4)'); x.lineWidth = 1; x.beginPath();
    for (let i = 1; i < 4; i++) { const gx = 8 + i * (W - 16) / 4, gy = 8 + i * (H - 16) / 4; x.moveTo(gx, 8); x.lineTo(gx, H - 8); x.moveTo(8, gy); x.lineTo(W - 8, gy); } x.stroke();
    x.strokeRect(8.5, 8.5, W - 17, H - 17);
    const col = (CURVE_TABS.find(t => t[0] === tab) || [])[2] || cssVar('--accent', '#9a7bff');
    const smp = monoSample(hue() ? pts() : (pts().length ? pts() : DEF_CURVE), 256, hue());
    x.strokeStyle = hue() ? cssVar('--tx-0', '#fff') : col; x.lineWidth = 2; x.beginPath();
    for (let i = 0; i < 256; i++) { const vx = hue() ? i / 256 : i / 255; const [sx, sy] = toS([vx, clamp(smp[i], 0, 1)]); i ? x.lineTo(sx, sy) : x.moveTo(sx, sy); } x.stroke();
    pts().forEach(p => { const [sx, sy] = toS(p); x.beginPath(); x.arc(sx, sy, 4.5, 0, Math.PI * 2); x.fillStyle = col; x.fill(); x.strokeStyle = '#000'; x.lineWidth = 1; x.stroke(); });
  };
  const hit = (sx, sy) => pts().findIndex(p => { const [px, py] = toS(p); return Math.hypot(px - sx, py - sy) < 8; });
  cv.addEventListener('pointerdown', ev => {
    const r = cv.getBoundingClientRect(); const sx = ev.clientX - r.left, sy = ev.clientY - r.top; let i = hit(sx, sy);
    if (ev.button === 2) return;
    if (i < 0) { pts().push(toV(sx, sy)); pts().sort((a, b) => a[0] - b[0]); i = hit(sx, sy); }
    let p = pts()[i]; cv.setPointerCapture(ev.pointerId);
    const mv = e2 => { const [vx, vy] = toV(e2.clientX - r.left, e2.clientY - r.top); p[0] = +vx.toFixed(4); p[1] = +vy.toFixed(4); pts().sort((a, b) => a[0] - b[0]); draw(); live(); };
    mv(ev); cv.addEventListener('pointermove', mv); cv.addEventListener('pointerup', () => { cv.removeEventListener('pointermove', mv); commit('Curves'); }, { once: true });
  });
  const removeAt = ev => { const r = cv.getBoundingClientRect(); const i = hit(ev.clientX - r.left, ev.clientY - r.top); if (i < 0) return; if (!hue() && pts().length <= 2) return toast('A curve needs at least two points'); pts().splice(i, 1); draw(); live(); commit('Remove curve point'); };
  cv.addEventListener('dblclick', removeAt); cv.addEventListener('contextmenu', ev => { ev.preventDefault(); removeAt(ev); });
  const renderTabs = () => { tabs.innerHTML = ''; CURVE_TABS.forEach(([k, l, colr]) => tabs.append(h('button', { class: 'cv-tab' + (k === tab ? ' on' : ''), style: colr ? { '--cvc': colr } : {}, onclick: () => { tab = ST.curveTab = k; renderTabs(); draw(); } }, l))); };
  renderTabs(); draw();
  return h('div', {}, tabs, cv, h('div', { class: 'btn-row' }, h('button', { class: 'btn sm', onclick: () => { f[tab] = hue() ? [] : JSON.parse(JSON.stringify(DEF_CURVE)); draw(); live(); commit('Reset curve'); } }, 'Reset this curve'), h('button', { class: 'btn sm ghost', onclick: () => { CURVE_TABS.forEach(([k]) => { f[k] = k === 'hs' || k === 'hh' ? [] : JSON.parse(JSON.stringify(DEF_CURVE)); }); draw(); live(); commit('Reset curves'); } }, 'Reset all')),
    h('div', { class: 'hint' }, 'Hue curves: the middle line means “no change”. Add three points and drag the middle one to change one colour range.'), slider('Mix %', `fx:${f.id}:amount`, 0, 100, 1));
}

// =====================================================================  Scopes panel (live from the program monitor, reduced resolution)
const SCOPES = [['wave', 'Waveform (luma)'], ['parade', 'RGB parade'], ['vector', 'Vectorscope'], ['hist', 'Histogram'], ['all', 'All four']];
let scopeMode = 'all', scopeLast = 0, scopeTimer = null; const scopeSrc = document.createElement('canvas');
function renderScopes() {
  if (typeof ltab === 'undefined' || ltab !== 'scopes') return; const b = $('#lbody'); b.innerHTML = '';
  const s = h('select', {}, ...SCOPES.map(([k, l]) => h('option', { value: k, selected: scopeMode === k }, l))); s.onchange = () => { scopeMode = s.value; drawScopes(true); };
  b.append(h('div', { class: 'bin-tools' }, h('span', { class: 'muted' }, 'Scope'), s, h('span', { class: 'muted cnt' }, 'Program · live')), h('div', { class: 'scope-wrap' }, h('canvas', { id: 'scopeCv' })));
  drawScopes(true);
}
function scopesTick() { if (typeof ltab === 'undefined' || ltab !== 'scopes') return; const now = performance.now(); const gap = ST.playing ? 110 : 30; if (now - scopeLast < gap) { if (!scopeTimer) scopeTimer = setTimeout(() => { scopeTimer = null; drawScopes(true); }, gap); return; } drawScopes(true); }
function drawScopes(force) {
  const cv = $('#scopeCv'); if (!cv) return; scopeLast = performance.now();
  const wrap = cv.parentElement; const dpr = devicePixelRatio || 1; const Wc = Math.max(160, wrap.clientWidth - 16); const Hc = scopeMode === 'all' ? Math.round(Wc * 1.25) : scopeMode === 'vector' ? Wc : Math.round(Wc * 0.62);
  if (cv.width !== Wc * dpr || cv.height !== Hc * dpr) { cv.width = Wc * dpr; cv.height = Hc * dpr; cv.style.width = Wc + 'px'; cv.style.height = Hc + 'px'; }
  const x = cv.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = '#0b0b0d'; x.fillRect(0, 0, cv.width, cv.height);
  const src = prog; if (!src || !src.width) return;
  const sw = Math.min(360, src.width), sh = Math.max(2, Math.round(sw * src.height / src.width)); scopeSrc.width = sw; scopeSrc.height = sh;
  const sx = scopeSrc.getContext('2d', { willReadFrequently: true }); sx.drawImage(src, 0, 0, sw, sh); const px = sx.getImageData(0, 0, sw, sh).data;
  const W = cv.width, H = cv.height;
  if (scopeMode === 'all') { const hw = Math.floor(W / 2), hh = Math.floor(H / 2); drawWave(x, px, sw, sh, 0, 0, hw - 2, hh - 2, false); drawWave(x, px, sw, sh, hw + 2, 0, W - hw - 2, hh - 2, true); drawVector(x, px, 0, hh + 2, hw - 2, H - hh - 2); drawHist(x, px, hw + 2, hh + 2, W - hw - 2, H - hh - 2); }
  else if (scopeMode === 'wave') drawWave(x, px, sw, sh, 0, 0, W, H, false); else if (scopeMode === 'parade') drawWave(x, px, sw, sh, 0, 0, W, H, true); else if (scopeMode === 'vector') drawVector(x, px, 0, 0, W, H); else drawHist(x, px, 0, 0, W, H);
  return { mode: scopeMode, w: sw, h: sh };
}
function scopeLabel(x, txt, X, Y) { x.font = `${10 * (devicePixelRatio || 1)}px sans-serif`; x.fillStyle = 'rgba(220,220,220,.75)'; x.fillText(txt, X + 4, Y + 12 * (devicePixelRatio || 1)); }
function drawWave(x, px, sw, sh, X, Y, W, H, parade) {
  const cols = parade ? 3 : 1; const bw = Math.floor(W / cols); const bins = 128; const im = x.createImageData(Math.max(1, bw * cols), H); const acc = new Uint32Array(sw * bins * cols);
  for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) { const o = (j * sw + i) * 4; const r = px[o], g = px[o + 1], b = px[o + 2];
    if (parade) { acc[(0 * sw + i) * bins + (r * (bins - 1) / 255 | 0)]++; acc[(1 * sw + i) * bins + (g * (bins - 1) / 255 | 0)]++; acc[(2 * sw + i) * bins + (b * (bins - 1) / 255 | 0)]++; }
    else acc[i * bins + ((0.2126 * r + 0.7152 * g + 0.0722 * b) * (bins - 1) / 255 | 0)]++; }
  const norm = 255 / Math.max(1, Math.log1p(sh * 0.35)); const tint = parade ? [[255, 80, 80], [80, 230, 110], [90, 140, 255]] : [[120, 255, 150]];
  for (let k = 0; k < cols; k++) for (let xx = 0; xx < bw; xx++) { const si = Math.min(sw - 1, Math.floor(xx / bw * sw));
    for (let yy = 0; yy < H; yy++) { const bin = Math.min(bins - 1, Math.floor((1 - yy / H) * bins)); const v = acc[(k * sw + si) * bins + bin]; if (!v) continue; const a = Math.min(255, Math.log1p(v) * norm); const o = (yy * bw * cols + k * bw + xx) * 4; const t = tint[k];
      im.data[o] = t[0]; im.data[o + 1] = t[1]; im.data[o + 2] = t[2]; im.data[o + 3] = a; } }
  const tmp = document.createElement('canvas'); tmp.width = im.width; tmp.height = H; tmp.getContext('2d').putImageData(im, 0, 0);
  x.save(); x.fillStyle = '#101013'; x.fillRect(X, Y, W, H); x.strokeStyle = 'rgba(255,255,255,.12)'; x.lineWidth = 1;
  for (const v of [0, 25, 50, 75, 100]) { const yy = Y + H - v / 100 * H; x.beginPath(); x.moveTo(X, yy + 0.5); x.lineTo(X + W, yy + 0.5); x.stroke(); }
  x.globalCompositeOperation = 'lighter'; x.drawImage(tmp, X, Y); x.restore(); scopeLabel(x, parade ? 'RGB parade' : 'Waveform (luma)', X, Y);
}
const SKIN_DEG = 123; // the skin-tone ("I") line on a Cb/Cr vectorscope
function drawVector(x, px, X, Y, W, H) {
  const S = Math.min(W, H), cx = X + W / 2, cy = Y + H / 2, R = S / 2 - 6; const N = 128; const acc = new Uint32Array(N * N);
  for (let o = 0; o < px.length; o += 4) { const r = px[o] / 255, g = px[o + 1] / 255, b = px[o + 2] / 255; const yv = 0.2126 * r + 0.7152 * g + 0.0722 * b; const cb = (b - yv) / 1.8556, cr = (r - yv) / 1.5748;
    const ix = Math.round((cb + 0.5) * (N - 1)), iy = Math.round((0.5 - cr) * (N - 1)); if (ix >= 0 && ix < N && iy >= 0 && iy < N) acc[iy * N + ix]++; }
  const im = x.createImageData(N, N); const norm = 255 / Math.max(1, Math.log1p(px.length / 4 * 0.02));
  for (let i = 0; i < N * N; i++) { if (!acc[i]) continue; const a = Math.min(255, 40 + Math.log1p(acc[i]) * norm); const o = i * 4; im.data[o] = 150; im.data[o + 1] = 255; im.data[o + 2] = 170; im.data[o + 3] = a; }
  const tmp = document.createElement('canvas'); tmp.width = N; tmp.height = N; tmp.getContext('2d').putImageData(im, 0, 0);
  x.save(); x.fillStyle = '#101013'; x.fillRect(X, Y, W, H);
  x.strokeStyle = 'rgba(255,255,255,.14)'; x.lineWidth = 1; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.moveTo(cx - R, cy); x.lineTo(cx + R, cy); x.moveTo(cx, cy - R); x.lineTo(cx, cy + R); x.stroke();
  const sk = SKIN_DEG * Math.PI / 180; x.strokeStyle = 'rgba(255,190,120,.8)'; x.setLineDash([4, 3]); x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(sk) * R, cy - Math.sin(sk) * R); x.stroke(); x.setLineDash([]);
  // 75 % colour-bar targets
  [['R', [0.75, 0, 0]], ['Mg', [0.75, 0, 0.75]], ['B', [0, 0, 0.75]], ['Cy', [0, 0.75, 0.75]], ['G', [0, 0.75, 0]], ['Yl', [0.75, 0.75, 0]]].forEach(([n, [r, g, b]]) => {
    const yv = 0.2126 * r + 0.7152 * g + 0.0722 * b; const tx = cx + (b - yv) / 1.8556 * 2 * R, ty = cy - (r - yv) / 1.5748 * 2 * R;
    x.strokeStyle = 'rgba(255,255,255,.45)'; x.strokeRect(tx - 5, ty - 5, 10, 10); x.fillStyle = 'rgba(255,255,255,.6)'; x.font = `${9 * (devicePixelRatio || 1)}px sans-serif`; x.fillText(n, tx + 7, ty + 3); });
  x.globalCompositeOperation = 'lighter'; x.drawImage(tmp, cx - R, cy - R, R * 2, R * 2); x.restore(); scopeLabel(x, 'Vectorscope', X, Y);
}
function drawHist(x, px, X, Y, W, H) {
  const hs = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  for (let o = 0; o < px.length; o += 4) { hs[0][px[o]]++; hs[1][px[o + 1]]++; hs[2][px[o + 2]]++; hs[3][Math.round(0.2126 * px[o] + 0.7152 * px[o + 1] + 0.0722 * px[o + 2])]++; }
  const mx = Math.max(1, ...hs.slice(0, 3).map(a => { const s = [...a].sort((p, q) => q - p); return s[2]; }));
  x.save(); x.fillStyle = '#101013'; x.fillRect(X, Y, W, H); x.globalCompositeOperation = 'lighter';
  [['rgba(255,70,70,.55)', 0], ['rgba(70,220,100,.55)', 1], ['rgba(80,130,255,.55)', 2], ['rgba(220,220,220,.25)', 3]].forEach(([col, k]) => { x.fillStyle = col; x.beginPath(); x.moveTo(X, Y + H);
    for (let i = 0; i < 256; i++) x.lineTo(X + i / 255 * W, Y + H - Math.min(1, hs[k][i] / mx) * (H - 16)); x.lineTo(X + W, Y + H); x.closePath(); x.fill(); });
  x.restore(); scopeLabel(x, 'Histogram', X, Y);
}
// numeric summary of the current program frame (used by tests / the status bar)
function scopeStats() { const src = prog; const c = document.createElement('canvas'); c.width = 64; c.height = Math.max(2, Math.round(64 * src.height / src.width)); const x = c.getContext('2d'); x.drawImage(src, 0, 0, c.width, c.height); const d = x.getImageData(0, 0, c.width, c.height).data; let r = 0, g = 0, b = 0; const n = d.length / 4; for (let o = 0; o < d.length; o += 4) { r += d[o]; g += d[o + 1]; b += d[o + 2]; } return { r: r / n, g: g / n, b: b / n }; }

window.VGRADE = { BUNDLED, parseCube, loadLut, getLut, preloadAll, lutName, importLutFile, applyLut, passFor, cpuPass, CPU_PASSES, monoSample, curveTable, wheelUniforms, ui, SCOPES, renderScopes, scopesTick, drawScopes, setScopeMode: m => { scopeMode = m; drawScopes(true); }, scopeStats, luts };
window.renderScopes = renderScopes; window.scopesTick = scopesTick;
window.addEventListener('bts:settings', () => { discCache.clear(); if (typeof renderFx === 'function' && typeof selected === 'function' && selected().some(c => (c.fx || []).some(f => ['wheels', 'curves'].includes(f.type)))) renderFx(); });
})();
