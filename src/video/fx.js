// BTS Video — effects engine: keyframes & easing, WebGL effect pipeline (with CPU fallback),
// stackable effects, Lumetri-style colour + creative looks, and transitions between layers.
// Everything here renders onto plain canvases so the preview and the MP4 export share one code path.
(() => {
'use strict';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hex2rgb = hx => { hx = String(hx || '#000').replace('#', ''); if (hx.length === 3) hx = hx.split('').map(c => c + c).join(''); const n = parseInt(hx, 16) || 0; return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const rgba = (hx, a) => { const [r, g, b] = hex2rgb(hx); return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`; };

// =====================================================================  keyframes
const EASES = [['linear', 'Linear'], ['easeIn', 'Ease in'], ['easeOut', 'Ease out'], ['easeInOut', 'Ease in / out'], ['hold', 'Hold']];
const easeFn = {
  linear: u => u, easeIn: u => u * u * u, easeOut: u => 1 - Math.pow(1 - u, 3),
  easeInOut: u => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2), hold: () => 0,
};
function evalKf(keys, t) {
  if (!keys || !keys.length) return undefined;
  const n = keys.length;
  if (t <= keys[0].t) return keys[0].v;
  if (t >= keys[n - 1].t) return keys[n - 1].v;
  for (let i = 0; i < n - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t >= a.t && t < b.t) { const u = (t - a.t) / ((b.t - a.t) || 1); const k = (easeFn[a.e] || easeFn.linear)(u);
      if (Array.isArray(a.v)) return a.v.map((v, j) => Array.isArray(b.v) && b.v.length === a.v.length ? v + (b.v[j] - v) * k : v);
      return a.v + (b.v - a.v) * k; }
  }
  return keys[n - 1].v;
}
function setKey(kf, key, t, v, e) {
  const arr = kf[key] || (kf[key] = []); const tol = 1 / 120;
  const ex = arr.find(k => Math.abs(k.t - t) < tol);
  if (ex) { ex.v = v; if (e) ex.e = e; } else { arr.push({ t, v, e: e || 'linear' }); arr.sort((a, b) => a.t - b.t); }
}

// =====================================================================  canvas pool
const pool = [];
function getCanvas(w, h) {
  let c = pool.pop(); if (!c) c = document.createElement('canvas');
  const x = c.getContext('2d');
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.imageSmoothingEnabled = true; x.shadowColor = 'transparent'; x.shadowBlur = 0; x.shadowOffsetX = x.shadowOffsetY = 0;
  x.clearRect(0, 0, w, h);
  return c;
}
function release(c) { if (c && pool.length < 24) pool.push(c); }
function copyOf(src) { const c = getCanvas(src.width, src.height); c.getContext('2d').drawImage(src, 0, 0); return c; }

// =====================================================================  WebGL pipeline
const GL = (() => {
  let cv = null, gl = null, ok = null, vbo = null, texIn = null, texB = null; const progs = {}; const fbs = [], txs = []; let W = 0, H = 0;
  const VS = `#version 300 es
in vec2 p; out vec2 uv; void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
  const HEAD = `#version 300 es
precision highp float; in vec2 uv; out vec4 o; uniform sampler2D tex; uniform vec2 res; uniform float time;
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
`;
  const FS = {
    color: `uniform float expo, contr, hi, sh, wh, bl, temp, tint, sat, vib, fade, mono, tintAmt; uniform vec3 shT, hiT;
void main(){ vec4 s = texture(tex, uv); vec3 c = s.rgb;
  c *= vec3(1.0 + temp * 0.0025, 1.0 - tint * 0.002, 1.0 - temp * 0.0025);
  c *= exp2(expo);
  float L = luma(c);
  c += vec3(sh * 0.0025) * (1.0 - smoothstep(0.0, 0.5, L));
  c += vec3(hi * 0.0025) * smoothstep(0.45, 1.0, L);
  c += vec3(wh * 0.002) * L * L;
  c += vec3(bl * 0.0015) * (1.0 - L) * (1.0 - L);
  c = (c - 0.5) * (1.0 + contr / 100.0) + 0.5;
  L = luma(c); c = mix(vec3(L), c, sat / 100.0);
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  c = mix(vec3(luma(c)), c, 1.0 + vib / 100.0 * (1.0 - clamp(mx - mn, 0.0, 1.0)));
  L = clamp(luma(c), 0.0, 1.0);
  c += (shT - 0.5) * tintAmt * (1.0 - L) + (hiT - 0.5) * tintAmt * L;
  c = mix(c, vec3(0.07) + c * 0.85, fade);
  c = mix(c, vec3(luma(c)), mono);
  o = vec4(clamp(c, 0.0, 1.0), s.a); }`,
    chroma: `uniform vec3 key; uniform float tol, soft, spill;
vec2 cbcr(vec3 c){ return vec2(-0.1687 * c.r - 0.3313 * c.g + 0.5 * c.b, 0.5 * c.r - 0.4187 * c.g - 0.0813 * c.b); }
void main(){ vec4 s = texture(tex, uv); float d = distance(cbcr(s.rgb), cbcr(key));
  float t0 = tol * 0.005, t1 = t0 + soft * 0.005 + 0.0001; float a = smoothstep(t0, t1, d); vec3 c = s.rgb; float k = spill / 100.0;
  if (key.g >= key.r && key.g >= key.b) { float m = max(c.r, c.b); if (c.g > m) c.g = mix(c.g, m, k); }
  else if (key.b >= key.r) { float m = max(c.r, c.g); if (c.b > m) c.b = mix(c.b, m, k); }
  else { float m = max(c.g, c.b); if (c.r > m) c.r = mix(c.r, m, k); }
  o = vec4(c, s.a * a); }`,
    sharpen: `uniform float amt;
void main(){ vec2 px = 1.0 / res; vec4 s = texture(tex, uv);
  vec3 b = (texture(tex, uv + vec2(px.x, 0.0)).rgb + texture(tex, uv - vec2(px.x, 0.0)).rgb + texture(tex, uv + vec2(0.0, px.y)).rgb + texture(tex, uv - vec2(0.0, px.y)).rgb) * 0.25;
  o = vec4(clamp(s.rgb + (s.rgb - b) * amt / 25.0, 0.0, 1.0), s.a); }`,
    grain: `uniform float amt, sz, seed;
void main(){ vec4 s = texture(tex, uv); vec2 cell = floor(uv * res / max(sz, 1.0)); float n = hash(cell + vec2(seed * 7.13, seed * 3.71)) - 0.5;
  o = vec4(clamp(s.rgb + n * amt / 100.0 * 0.45, 0.0, 1.0), s.a); }`,
    vignette: `uniform float amt, size, feather;
void main(){ vec4 s = texture(tex, uv); vec2 a = vec2(res.x / res.y, 1.0); vec2 d = (uv - 0.5) * a; float r = length(d) / (0.5 * length(a));
  float v = smoothstep(size / 100.0, size / 100.0 + feather / 100.0 + 0.001, r);
  vec3 c = mix(s.rgb, vec3(amt < 0.0 ? 1.0 : 0.0), v * abs(amt) / 100.0); o = vec4(c, s.a); }`,
    rgbsplit: `uniform vec2 off;
void main(){ vec2 d = off / res; vec4 r = texture(tex, uv + d), g = texture(tex, uv), b = texture(tex, uv - d);
  o = vec4(r.r, g.g, b.b, max(g.a, max(r.a, b.a))); }`,
    glitch: `uniform float amt, seed;
void main(){ float k = amt / 100.0; vec2 u = uv;
  float band = floor(u.y * 24.0 + hash(vec2(seed, 1.0)) * 4.0);
  if (hash(vec2(band, seed)) < k * 0.6) u.x += (hash(vec2(band * 1.7, seed + 3.0)) - 0.5) * 0.25 * k;
  float big = floor(u.y * 6.0);
  if (hash(vec2(big, seed + 9.0)) < k * 0.25) u.x += (hash(vec2(big, seed + 11.0)) - 0.5) * 0.12;
  u.x = clamp(u.x, 0.0, 1.0);
  vec2 off = vec2(0.015 * k * (0.3 + hash(vec2(seed, 7.0))), 0.0);
  vec4 cr = texture(tex, clamp(u + off, 0.0, 1.0)), cg = texture(tex, u), cb = texture(tex, clamp(u - off, 0.0, 1.0));
  vec3 c = vec3(cr.r, cg.g, cb.b);
  if (hash(vec2(band * 3.0, seed + 5.0)) < k * 0.06) c = 1.0 - c;
  o = vec4(c, max(cg.a, max(cr.a, cb.a))); }`,
    vhs: `uniform float amt;
void main(){ float k = amt / 100.0; vec2 u = uv;
  float jit = (hash(vec2(floor(u.y * res.y / 2.0), floor(time * 30.0))) - 0.5) * 0.004 * k;
  float pos = fract(time * 0.12); float band = 1.0 - smoothstep(0.0, 0.03, abs(pos - (1.0 - u.y)));
  u.x = clamp(u.x + jit + band * 0.02 * k, 0.0, 1.0);
  float off = 0.006 * k; vec4 cg = texture(tex, u);
  vec3 c = vec3(texture(tex, clamp(u + vec2(off, 0.0), 0.0, 1.0)).r, cg.g, texture(tex, clamp(u - vec2(off, 0.0), 0.0, 1.0)).b);
  c = mix(c, vec3(luma(c)), 0.25 * k);
  c *= 1.0 - 0.14 * k * (0.5 + 0.5 * sin(uv.y * res.y * 3.14159));
  c += (hash(uv * res + vec2(time * 61.0, time * 17.0)) - 0.5) * 0.12 * k;
  c += band * 0.15 * k;
  c = mix(c, c * vec3(1.06, 0.97, 1.08), k);
  o = vec4(clamp(c, 0.0, 1.0), cg.a); }`,
    crt: `uniform float amt, curve;
void main(){ float k = amt / 100.0; vec2 c = uv - 0.5; float r2 = dot(c, c); vec2 u = 0.5 + c * (1.0 + curve / 100.0 * 0.35 * r2) / (1.0 + curve / 100.0 * 0.09);
  if (u.x < 0.0 || u.x > 1.0 || u.y < 0.0 || u.y > 1.0) { o = vec4(0.0, 0.0, 0.0, texture(tex, uv).a); return; }
  vec3 s = vec3(texture(tex, u + vec2(0.0012 * k, 0.0)).r, texture(tex, u).g, texture(tex, u - vec2(0.0012 * k, 0.0)).b);
  float line = 0.5 + 0.5 * sin(u.y * res.y * 3.14159 * 0.5); s *= 1.0 - k * 0.45 * (1.0 - line);
  float m = mod(floor(uv.x * res.x), 3.0); vec3 mask = m < 1.0 ? vec3(1.0, 0.75, 0.75) : m < 2.0 ? vec3(0.75, 1.0, 0.75) : vec3(0.75, 0.75, 1.0); s *= mix(vec3(1.0), mask, k * 0.6);
  s *= 1.0 + 0.25 * k; s *= 1.0 - k * 0.6 * smoothstep(0.18, 0.5, r2 * 1.6); s *= 0.97 + 0.03 * sin(time * 120.0);
  o = vec4(clamp(s, 0.0, 1.0), texture(tex, u).a); }`,
    kaleido: `uniform float seg, ang, zoom;
void main(){ vec2 a = vec2(res.x / res.y, 1.0); vec2 c = (uv - 0.5) * a; float r = length(c) / max(zoom / 100.0, 0.05); float t = atan(c.y, c.x) + ang * 0.0174533;
  float sl = 6.28318 / max(seg, 2.0); t = mod(t, sl); t = abs(t - sl * 0.5); vec2 p = vec2(cos(t), sin(t)) * r / a + 0.5; p = abs(mod(p + 1.0, 2.0) - 1.0);
  o = texture(tex, p); }`,
    duotone: `uniform vec3 c1, c2; uniform float amt;
void main(){ vec4 s = texture(tex, uv); float L = smoothstep(0.0, 1.0, luma(s.rgb)); o = vec4(mix(s.rgb, mix(c1, c2, L), amt / 100.0), s.a); }`,
    posterize: `uniform float levels, amt;
void main(){ vec4 s = texture(tex, uv); float n = max(levels, 2.0) - 1.0; vec3 q = floor(s.rgb * n + 0.5) / n; o = vec4(mix(s.rgb, q, amt / 100.0), s.a); }`,
    edgeglow: `uniform vec3 col; uniform float amt, dark;
void main(){ vec2 px = 1.0 / res; float tl = luma(texture(tex, uv + px * vec2(-1.0, 1.0)).rgb), t = luma(texture(tex, uv + px * vec2(0.0, 1.0)).rgb), tr = luma(texture(tex, uv + px * vec2(1.0, 1.0)).rgb);
  float l = luma(texture(tex, uv + px * vec2(-1.0, 0.0)).rgb), r = luma(texture(tex, uv + px * vec2(1.0, 0.0)).rgb);
  float bl = luma(texture(tex, uv + px * vec2(-1.0, -1.0)).rgb), b = luma(texture(tex, uv + px * vec2(0.0, -1.0)).rgb), br = luma(texture(tex, uv + px * vec2(1.0, -1.0)).rgb);
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br, gy = -bl - 2.0 * b - br + tl + 2.0 * t + tr; float e = clamp(length(vec2(gx, gy)) * amt / 25.0, 0.0, 1.0);
  vec4 s = texture(tex, uv); vec3 c = s.rgb * (1.0 - dark / 100.0) + col * e * 1.4; o = vec4(clamp(c, 0.0, 1.0), s.a); }`,
    lens: `uniform float k, zoom;
void main(){ vec2 a = vec2(res.x / res.y, 1.0); vec2 c = (uv - 0.5) * a; float r2 = dot(c, c); vec2 u = c * (1.0 + k / 100.0 * r2 * 1.6) / max(zoom / 100.0, 0.1); u = u / a + 0.5;
  if (u.x < 0.0 || u.x > 1.0 || u.y < 0.0 || u.y > 1.0) { o = vec4(0.0); return; } o = texture(tex, u); }`,
    pixelsort: `uniform float thr, len, vert;
void main(){ vec4 s = texture(tex, uv); float L = luma(s.rgb); if (L < thr / 100.0) { o = s; return; } vec2 d = vert > 0.5 ? vec2(0.0, 1.0 / res.y) : vec2(1.0 / res.x, 0.0); vec4 best = s; float bl = L;
  for (int i = 1; i <= 48; i++) { float fi = float(i); if (fi > len) break; vec2 q = uv + d * fi * 2.0; if (q.x > 1.0 || q.y > 1.0) break; vec4 c = texture(tex, q); float lc = luma(c.rgb); if (lc < thr / 100.0) break; if (lc > bl) { bl = lc; best = c; } }
  o = vec4(mix(s.rgb, best.rgb, 0.85), s.a); }`,
    oldfilm: `uniform float amt;
void main(){ float k = amt / 100.0; float fr = floor(time * 18.0); vec2 jit = vec2(0.0, (hash(vec2(fr, 3.0)) - 0.5) * 0.004 * k); vec4 s = texture(tex, clamp(uv + jit, 0.0, 1.0));
  float L = luma(s.rgb); vec3 sep = vec3(L * 1.07 + 0.03, L * 0.92 + 0.02, L * 0.72); vec3 c = mix(s.rgb, sep, k * 0.9);
  c *= 1.0 + (hash(vec2(fr, 7.0)) - 0.5) * 0.18 * k;
  float x = uv.x * res.x; float sc = 0.0; for (int i = 0; i < 3; i++) { float fi = float(i); float px = hash(vec2(fr * 0.37 + fi, 11.0)) * res.x; if (hash(vec2(fr, fi + 20.0)) < 0.55) sc += (1.0 - smoothstep(0.0, 1.6, abs(x - px))) * 0.5; }
  c = mix(c, vec3(0.9, 0.85, 0.7), sc * k);
  float dust = hash(floor(uv * res / 3.0) + vec2(fr * 13.0, fr)); if (dust > 0.9993) c *= 1.0 - 0.8 * k;
  c += (hash(uv * res + vec2(time * 37.0, time * 11.0)) - 0.5) * 0.12 * k;
  vec2 a = vec2(res.x / res.y, 1.0); float r = length((uv - 0.5) * a) / (0.5 * length(a)); c *= 1.0 - k * 0.55 * smoothstep(0.45, 1.0, r);
  o = vec4(clamp(c, 0.0, 1.0), s.a); }`,
    dirblur: `uniform vec2 dir;
void main(){ vec4 acc = vec4(0.0); for (int i = -12; i <= 12; i++) { acc += texture(tex, clamp(uv + dir / res * float(i) / 12.0, 0.0, 1.0)); } o = acc / 25.0; }`,
    radblur: `uniform float amt; uniform vec2 ctr;
void main(){ vec4 acc = vec4(0.0); vec2 d = uv - ctr; for (int i = 0; i < 24; i++) { float s = 1.0 - amt / 100.0 * 0.35 * float(i) / 23.0; acc += texture(tex, clamp(ctr + d * s, 0.0, 1.0)); } o = acc / 24.0; }`,
    wave: `uniform float amp, freq, speed, vert;
void main(){ vec2 u = uv; if (vert > 0.5) u.y += sin(u.x * freq + time * speed) * amp / res.y; else u.x += sin(u.y * freq + time * speed) * amp / res.x; o = texture(tex, clamp(u, 0.0, 1.0)); }`,
    halftone: `uniform float size, amt, ang;
void main(){ float a = ang * 0.0174533; mat2 R = mat2(cos(a), -sin(a), sin(a), cos(a)); vec2 p = R * (uv * res); vec2 cell = floor(p / size) * size + size * 0.5; vec2 cuv = (transpose(R) * cell) / res;
  vec4 s = texture(tex, uv); float L = luma(texture(tex, clamp(cuv, 0.0, 1.0)).rgb); float r = (1.0 - L) * size * 0.72; float d = length(p - cell); float ink = 1.0 - smoothstep(r - 1.0, r + 1.0, d);
  vec3 c = mix(vec3(1.0), vec3(0.06), ink); o = vec4(mix(s.rgb, c, amt / 100.0), s.a); }`,
    threshold: `uniform float thr, amt;
void main(){ vec4 s = texture(tex, uv); float v = step(thr / 100.0, luma(s.rgb)); o = vec4(mix(s.rgb, vec3(v), amt / 100.0), s.a); }`,
    emboss: `uniform float amt;
void main(){ vec2 px = 1.0 / res; vec4 s = texture(tex, uv); float a = luma(texture(tex, uv - px).rgb), b = luma(texture(tex, uv + px).rgb); float e = clamp(0.5 + (b - a) * amt / 20.0, 0.0, 1.0); o = vec4(vec3(e), s.a); }`,
    colorize: `uniform vec3 col; uniform float amt;
void main(){ vec4 s = texture(tex, uv); float L = luma(s.rgb); vec3 c = L < 0.5 ? 2.0 * L * col : 1.0 - 2.0 * (1.0 - L) * (1.0 - col); o = vec4(mix(s.rgb, c, amt / 100.0), s.a); }`,
    // ---- two-input transitions (tex = outgoing A, texB = incoming B, p = progress 0..1)
    trLuma: `uniform sampler2D texB; uniform float p, soft;
void main(){ vec4 a = texture(tex, uv), b = texture(texB, uv); float e = p * (1.0 + soft); float m = smoothstep(1.0 - e, 1.0 - e + soft, luma(b.rgb) * 0.85 + 0.15 * uv.y); o = mix(a, b, m); }`,
    trBurn: `uniform sampler2D texB; uniform float p, seed;
float vn(vec2 x){ vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main(){ vec4 a = texture(tex, uv), b = texture(texB, uv); vec2 q = uv * vec2(res.x / res.y, 1.0) * 3.0 + seed; float n = vn(q) * 0.55 + vn(q * 2.3) * 0.3 + vn(q * 5.1) * 0.15; n = n * 0.8 + 0.2 * (1.0 - uv.x);
  float f = p * 1.3 - 0.15; float m = smoothstep(f - 0.03, f + 0.03, 1.0 - n); vec4 c = mix(a, b, 1.0 - m);
  float edge = 1.0 - smoothstep(0.0, 0.12, abs((1.0 - n) - f)); vec3 fire = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.95, 0.75), edge * edge);
  c.rgb += fire * edge * 1.6 * sin(p * 3.14159); c.rgb += vec3(1.0, 0.55, 0.2) * pow(sin(p * 3.14159), 3.0) * 0.45; o = vec4(clamp(c.rgb, 0.0, 1.0), max(a.a, b.a)); }`,
    trLeak: `uniform sampler2D texB; uniform float p, seed;
void main(){ vec4 a = texture(tex, uv), b = texture(texB, uv); vec4 c = mix(a, b, smoothstep(0.3, 0.7, p)); float k = sin(p * 3.14159);
  vec2 ar = vec2(res.x / res.y, 1.0); vec2 p1 = vec2(-0.2 + p * 1.4, 0.3 + 0.2 * sin(seed + p * 3.0)), p2 = vec2(1.2 - p * 1.1, 0.75); float d1 = length((uv - p1) * ar), d2 = length((uv - p2) * ar);
  vec3 leak = vec3(1.0, 0.45, 0.15) * exp(-d1 * d1 * 3.0) * 1.3 + vec3(1.0, 0.8, 0.4) * exp(-d2 * d2 * 5.0) * 0.9 + vec3(1.0, 0.3, 0.4) * smoothstep(0.6, 1.0, uv.x) * 0.35;
  vec3 col = 1.0 - (1.0 - c.rgb) * (1.0 - clamp(leak * k, 0.0, 1.0)); o = vec4(clamp(col + k * k * 0.15, 0.0, 1.0), max(a.a, b.a)); }`,
    trZoomBlur: `uniform sampler2D texB; uniform float p;
void main(){ float k = sin(p * 3.14159) * 0.3; vec2 ctr = vec2(0.5); vec4 acc = vec4(0.0); float zA = 1.0 + p * 0.5, zB = 1.5 - p * 0.5; float m = smoothstep(0.42, 0.58, p);
  for (int i = 0; i < 20; i++) { float s = 1.0 - k * float(i) / 19.0; vec2 ua = ctr + (uv - ctr) / zA * s, ub = ctr + (uv - ctr) / zB * s; acc += mix(texture(tex, clamp(ua, 0.0, 1.0)), texture(texB, clamp(ub, 0.0, 1.0)), m); }
  o = acc / 20.0; }`,
    trWhip: `uniform sampler2D texB; uniform float p, dir;
void main(){ float e = p < 0.5 ? 4.0 * p * p * p : 1.0 - pow(-2.0 * p + 2.0, 3.0) / 2.0; float bl = sin(p * 3.14159) * 0.16; vec4 acc = vec4(0.0); float x0 = uv.x + dir * e;
  for (int i = -10; i <= 10; i++) { float x = x0 + bl * float(i) / 10.0; vec4 c; if (dir > 0.0) c = x < 1.0 ? texture(tex, vec2(clamp(x, 0.0, 1.0), uv.y)) : texture(texB, vec2(clamp(x - 1.0, 0.0, 1.0), uv.y)); else c = x >= 0.0 ? texture(tex, vec2(clamp(x, 0.0, 1.0), uv.y)) : texture(texB, vec2(clamp(x + 1.0, 0.0, 1.0), uv.y)); acc += c; }
  o = acc / 21.0; }`,
    trSwipe: `uniform sampler2D texB; uniform float p;
void main(){ vec4 a = texture(tex, uv), b = texture(texB, uv); float d = (uv.x + uv.y) * 0.5; float e = p * 1.3 - 0.15; float m = smoothstep(e + 0.08, e - 0.08, d); o = mix(a, b, m); }`,
    trPixel: `uniform sampler2D texB; uniform float p;
void main(){ float cells = mix(600.0, 14.0, pow(sin(p * 3.14159), 0.6)); vec2 g = vec2(cells * res.x / res.y, cells); vec2 q = (floor(uv * g) + 0.5) / g;
  o = mix(texture(tex, q), texture(texB, q), smoothstep(0.4, 0.6, p)); }`,
  };
  function init() {
    if (ok !== null) return ok;
    try {
      cv = document.createElement('canvas'); cv.width = cv.height = 4;
      gl = cv.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, alpha: true, antialias: false, depth: false, stencil: false });
      if (!gl) return (ok = false);
      vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      texIn = mkTex(); texB = mkTex();
      for (let i = 0; i < 2; i++) { txs.push(mkTex()); fbs.push(gl.createFramebuffer()); }
      ok = true;
    } catch (e) { console.warn('WebGL unavailable', e); ok = false; }
    return ok;
  }
  function mkTex() { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; }
  function program(name) {
    if (progs[name]) return progs[name];
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(name + ': ' + gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, HEAD + FS[name])); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const pr = { p, loc: {} }; progs[name] = pr; return pr;
  }
  function size(w, h) {
    if (w === W && h === H) return; W = w; H = h; cv.width = w; cv.height = h;
    txs.forEach((t, i) => { gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.bindFramebuffer(gl.FRAMEBUFFER, fbs[i]); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  // Runs a chain of shader passes over `canvas` and writes the result back into it.
  function apply(canvas, passes, time) {
    if (!passes.length) return true;
    if (!init()) return false;
    size(canvas.width, canvas.height);
    gl.viewport(0, 0, W, H);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texIn);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND);
    let input = texIn;
    passes.forEach((ps, i) => {
      const last = i === passes.length - 1; const pr = program(ps.name);
      gl.useProgram(pr.p); gl.bindFramebuffer(gl.FRAMEBUFFER, last ? null : fbs[i % 2]);
      gl.bindTexture(gl.TEXTURE_2D, input);
      const u = { tex: 0, res: [W, H], time: time || 0, ...ps.u };
      for (const [k, v] of Object.entries(u)) {
        let l = pr.loc[k]; if (l === undefined) l = pr.loc[k] = gl.getUniformLocation(pr.p, k); if (l == null) continue;
        if (k === 'tex') gl.uniform1i(l, 0); else if (k === 'texB') gl.uniform1i(l, 1); else if (Array.isArray(v)) (v.length === 2 ? gl.uniform2fv : v.length === 3 ? gl.uniform3fv : gl.uniform4fv).call(gl, l, v); else gl.uniform1f(l, +v || 0);
      }
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 6);
      input = last ? null : txs[i % 2];
    });
    const x = canvas.getContext('2d'); x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.filter = 'none'; x.globalCompositeOperation = 'copy'; x.drawImage(cv, 0, 0); x.restore();
    return true;
  }
  // two-input pass (transitions): A → tex, B → texB; result is written into `out`
  function apply2(out, A, B, name, uni, time) {
    if (!init()) return false;
    try { program(name); } catch (e) { console.warn(e); return false; }
    size(out.width, out.height); gl.viewport(0, 0, W, H);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texB); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, B);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texIn); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, A);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.disable(gl.BLEND);
    const pr = program(name); gl.useProgram(pr.p); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const u = { tex: 0, texB: 1, res: [W, H], time: time || 0, ...uni };
    for (const [k, v] of Object.entries(u)) { let l = pr.loc[k]; if (l === undefined) l = pr.loc[k] = gl.getUniformLocation(pr.p, k); if (l == null) continue; if (k === 'tex') gl.uniform1i(l, 0); else if (k === 'texB') gl.uniform1i(l, 1); else if (Array.isArray(v)) (v.length === 2 ? gl.uniform2fv : v.length === 3 ? gl.uniform3fv : gl.uniform4fv).call(gl, l, v); else gl.uniform1f(l, +v || 0); }
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 6);
    const x = out.getContext('2d'); x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.filter = 'none'; x.globalCompositeOperation = 'copy'; x.drawImage(cv, 0, 0); x.restore();
    return true;
  }
  return { apply, apply2, init, get ok() { return init(); } };
})();

// CPU fallback for the two per-pixel effects people rely on most (colour + chroma key).
function cpuApply(canvas, passes) {
  const x = canvas.getContext('2d', { willReadFrequently: true }); const im = x.getImageData(0, 0, canvas.width, canvas.height); const d = im.data;
  for (const ps of passes) {
    const u = ps.u;
    if (ps.name === 'color') {
      const tb = u.temp * 0.0025, tg = u.tint * 0.002, ex = Math.pow(2, u.expo), ct = 1 + u.contr / 100, st = u.sat / 100;
      for (let i = 0; i < d.length; i += 4) {
        let r = d[i] / 255 * (1 + tb) * ex, g = d[i + 1] / 255 * (1 - tg) * ex, b = d[i + 2] / 255 * (1 - tb) * ex;
        let L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const s1 = u.sh * 0.0025 * (1 - smooth(0, 0.5, L)) + u.hi * 0.0025 * smooth(0.45, 1, L) + u.wh * 0.002 * L * L + u.bl * 0.0015 * (1 - L) * (1 - L);
        r += s1; g += s1; b += s1;
        r = (r - 0.5) * ct + 0.5; g = (g - 0.5) * ct + 0.5; b = (b - 0.5) * ct + 0.5;
        L = 0.2126 * r + 0.7152 * g + 0.0722 * b; r = L + (r - L) * st; g = L + (g - L) * st; b = L + (b - L) * st;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const vb = 1 + u.vib / 100 * (1 - clamp(mx - mn, 0, 1)); L = 0.2126 * r + 0.7152 * g + 0.0722 * b; r = L + (r - L) * vb; g = L + (g - L) * vb; b = L + (b - L) * vb;
        L = clamp(0.2126 * r + 0.7152 * g + 0.0722 * b, 0, 1);
        r += (u.shT[0] - 0.5) * u.tintAmt * (1 - L) + (u.hiT[0] - 0.5) * u.tintAmt * L; g += (u.shT[1] - 0.5) * u.tintAmt * (1 - L) + (u.hiT[1] - 0.5) * u.tintAmt * L; b += (u.shT[2] - 0.5) * u.tintAmt * (1 - L) + (u.hiT[2] - 0.5) * u.tintAmt * L;
        r = r + (0.07 + r * 0.85 - r) * u.fade; g = g + (0.07 + g * 0.85 - g) * u.fade; b = b + (0.07 + b * 0.85 - b) * u.fade;
        L = 0.2126 * r + 0.7152 * g + 0.0722 * b; r += (L - r) * u.mono; g += (L - g) * u.mono; b += (L - b) * u.mono;
        d[i] = clamp(r, 0, 1) * 255; d[i + 1] = clamp(g, 0, 1) * 255; d[i + 2] = clamp(b, 0, 1) * 255;
      }
    } else if (ps.name === 'chroma') {
      const cb = c => [-0.1687 * c[0] - 0.3313 * c[1] + 0.5 * c[2], 0.5 * c[0] - 0.4187 * c[1] - 0.0813 * c[2]];
      const kc = cb(u.key), t0 = u.tol * 0.005, t1 = t0 + u.soft * 0.005 + 0.0001, k = u.spill / 100; const kg = u.key[1] >= u.key[0] && u.key[1] >= u.key[2], kb = !kg && u.key[2] >= u.key[0];
      for (let i = 0; i < d.length; i += 4) {
        const c = [d[i] / 255, d[i + 1] / 255, d[i + 2] / 255]; const q = cb(c); const dist = Math.hypot(q[0] - kc[0], q[1] - kc[1]);
        d[i + 3] *= smooth(t0, t1, dist);
        if (kg) { const m = Math.max(c[0], c[2]); if (c[1] > m) d[i + 1] = (c[1] + (m - c[1]) * k) * 255; }
        else if (kb) { const m = Math.max(c[0], c[1]); if (c[2] > m) d[i + 2] = (c[2] + (m - c[2]) * k) * 255; }
        else { const m = Math.max(c[1], c[2]); if (c[0] > m) d[i] = (c[0] + (m - c[0]) * k) * 255; }
      }
    }
  }
  x.putImageData(im, 0, 0);
}
function smooth(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
let warnedGL = false;
function runPasses(canvas, passes, time) {
  if (!passes.length) return;
  if (GL.apply(canvas, passes, time)) return;
  const cpu = passes.filter(p => p.name === 'color' || p.name === 'chroma');
  if (cpu.length) cpuApply(canvas, cpu);
  if (cpu.length < passes.length && !warnedGL) { warnedGL = true; console.warn('WebGL is unavailable: some effects are skipped'); window.UI && UI.toast('WebGL is unavailable on this computer — some effects (sharpen, grain, glitch, VHS…) are skipped.', 'err', 7000); }
}

// =====================================================================  colour (Lumetri-style)
const LU_DEFAULT = { expo: 0, contr: 0, hi: 0, sh: 0, wh: 0, bl: 0, temp: 0, tint: 0, sat: 100, vib: 0, look: '', lookAmt: 100 };
const LOOKS = {
  'Cinematic': { contr: 15, sat: -10, hi: -15, fade: 0.15, shT: [0.38, 0.5, 0.6], hiT: [0.62, 0.53, 0.42], tintAmt: 0.5 },
  'Teal & Orange': { contr: 10, sat: 15, shT: [0.3, 0.55, 0.63], hiT: [0.7, 0.5, 0.34], tintAmt: 0.8 },
  'Warm': { temp: 40, tint: 5, sat: 5 },
  'Cool': { temp: -40, tint: -5, sat: -5 },
  'Vintage': { fade: 0.5, sat: -30, temp: 20, contr: -10, shT: [0.55, 0.5, 0.4], hiT: [0.6, 0.55, 0.4], tintAmt: 0.4 },
  'Noir': { mono: 1, contr: 40, expo: -0.1, fade: 0.05, sh: -15 },
  'Faded': { fade: 0.7, contr: -20, sat: -20 },
  'Vivid': { sat: 45, vib: 40, contr: 15 },
  'Bleach bypass': { sat: -55, contr: 40, hi: 10, fade: 0.05 },
  'Moonlight': { temp: -60, expo: -0.5, sat: -40, contr: 10, shT: [0.4, 0.45, 0.66], hiT: [0.5, 0.55, 0.7], tintAmt: 0.5 },
  'Sunset': { temp: 55, tint: 15, sat: 15, hiT: [0.7, 0.5, 0.4], tintAmt: 0.4 },
  'Matte': { fade: 0.45, contr: -5 },
  'Film stock': { contr: 10, fade: 0.2, sat: -10, shT: [0.45, 0.5, 0.56], hiT: [0.58, 0.52, 0.45], tintAmt: 0.4 },
};
function luActive(lu) { if (!lu) return false; for (const k of ['expo', 'contr', 'hi', 'sh', 'wh', 'bl', 'temp', 'tint', 'vib']) if (lu[k]) return true; return (lu.sat ?? 100) !== 100 || (!!lu.look && (lu.lookAmt ?? 100) > 0); }
function luPass(lu) {
  lu = { ...LU_DEFAULT, ...lu }; const L = LOOKS[lu.look] || {}; const k = (lu.lookAmt ?? 100) / 100;
  const u = { expo: lu.expo + (L.expo || 0) * k, contr: lu.contr + (L.contr || 0) * k, hi: lu.hi + (L.hi || 0) * k, sh: lu.sh + (L.sh || 0) * k, wh: lu.wh, bl: lu.bl, temp: lu.temp + (L.temp || 0) * k, tint: lu.tint + (L.tint || 0) * k,
    sat: Math.max(0, lu.sat + (L.sat || 0) * k), vib: lu.vib + (L.vib || 0) * k, fade: (L.fade || 0) * k, mono: (L.mono || 0) * k, tintAmt: (L.tintAmt || 0) * k, shT: L.shT || [0.5, 0.5, 0.5], hiT: L.hiT || [0.5, 0.5, 0.5] };
  return { name: 'color', u };
}
// CSS-filter preview of a look, used for swatches in the panels
function lookSwatchCss(name) { const L = LOOKS[name] || {}; return `saturate(${(100 + (L.sat || 0)) / 100 * (L.mono ? 0 : 1)}) contrast(${1 + (L.contr || 0) / 100}) sepia(${(L.temp > 0 ? L.temp / 150 : 0) + (L.fade || 0) * 0.3}) hue-rotate(${L.temp < 0 ? 15 : 0}deg) brightness(${Math.pow(2, L.expo || 0)})`; }

// =====================================================================  effects
// Each effect: {name, cat, params:[{k,label,type,min,max,step,def,opts}], stage: 'pixel'|'composite'}
const P = (k, label, min, max, def, step = 1, extra = {}) => ({ k, label, min, max, def, step, ...extra });
const EFFECTS = {
  chroma: { name: 'Chroma key', cat: 'Keying', params: [{ k: 'color', label: 'Key colour', type: 'color', def: '#00b140' }, P('tol', 'Tolerance', 0, 100, 25), P('soft', 'Softness', 0, 100, 12), P('spill', 'Spill suppress', 0, 100, 60)] },
  blur: { name: 'Gaussian blur', cat: 'Blur & sharpen', params: [P('amount', 'Blurriness', 0, 100, 12, 0.5), { k: 'edges', label: 'Repeat edges', type: 'bool', def: true }] },
  sharpen: { name: 'Sharpen', cat: 'Blur & sharpen', params: [P('amount', 'Amount', 0, 100, 35)] },
  mosaic: { name: 'Mosaic / face blur', cat: 'Stylize', params: [{ k: 'mode', label: 'Mode', type: 'select', def: 'pixelate', opts: [['pixelate', 'Pixelate'], ['blur', 'Blur']] }, P('size', 'Cell size / blur', 2, 120, 24), { k: 'whole', label: 'Whole frame', type: 'bool', def: false }, { k: 'shape', label: 'Region shape', type: 'select', def: 'ellipse', opts: [['ellipse', 'Ellipse'], ['rect', 'Rectangle']] }, P('rx', 'Region X %', 0, 100, 38), P('ry', 'Region Y %', 0, 100, 25), P('rw', 'Region W %', 1, 100, 24), P('rh', 'Region H %', 1, 100, 40)] },
  vignette: { name: 'Vignette', cat: 'Stylize', params: [P('amount', 'Amount', -100, 100, 55), P('size', 'Midpoint', 0, 100, 45), P('feather', 'Feather', 0, 100, 55)] },
  grain: { name: 'Film grain', cat: 'Stylize', params: [P('amount', 'Amount', 0, 100, 30), P('size', 'Size', 1, 8, 1.5, 0.1)] },
  glow: { name: 'Glow', cat: 'Stylize', params: [P('radius', 'Radius', 1, 80, 18), P('strength', 'Intensity', 0, 200, 70), P('threshold', 'Threshold', 0, 100, 40)] },
  glitch: { name: 'Glitch', cat: 'Stylize', params: [P('amount', 'Amount', 0, 100, 45), P('speed', 'Speed', 1, 30, 12)] },
  rgbsplit: { name: 'RGB split', cat: 'Stylize', params: [P('amount', 'Distance px', 0, 80, 10, 0.5), P('angle', 'Angle°', -180, 180, 0)] },
  vhs: { name: 'VHS', cat: 'Stylize', params: [P('amount', 'Amount', 0, 100, 70)] },
  bw: { name: 'Black & white', cat: 'Colour', params: [P('amount', 'Amount', 0, 100, 100)] },
  sepia: { name: 'Sepia', cat: 'Colour', params: [P('amount', 'Amount', 0, 100, 85)] },
  invert: { name: 'Invert', cat: 'Colour', params: [P('amount', 'Amount', 0, 100, 100)] },
  mirror: { name: 'Mirror', cat: 'Distort', params: [{ k: 'side', label: 'Keep side', type: 'select', def: 'left', opts: [['left', 'Left → right'], ['right', 'Right → left'], ['top', 'Top → bottom'], ['bottom', 'Bottom → top']] }] },
  flip: { name: 'Flip', cat: 'Distort', params: [{ k: 'h', label: 'Horizontal', type: 'bool', def: true }, { k: 'v', label: 'Vertical', type: 'bool', def: false }] },
  shadow: { name: 'Drop shadow', cat: 'Composite', stage: 'composite', params: [{ k: 'color', label: 'Colour', type: 'color', def: '#000000' }, P('opacity', 'Opacity %', 0, 100, 70), P('blur', 'Softness', 0, 100, 24), P('dist', 'Distance', 0, 200, 16), P('angle', 'Direction°', -180, 180, 135)] },
  rounded: { name: 'Rounded corners', cat: 'Composite', stage: 'composite', params: [P('radius', 'Radius px', 0, 400, 40)] },
  border: { name: 'Border', cat: 'Composite', stage: 'composite', params: [P('width', 'Width px', 0, 60, 8), { k: 'color', label: 'Colour', type: 'color', def: '#ffffff' }] },
  crt: { name: 'CRT scanlines', cat: 'Retro', params: [P('amount', 'Amount', 0, 100, 70), P('curve', 'Curvature', 0, 100, 40)] },
  oldfilm: { name: 'Old film', cat: 'Retro', params: [P('amount', 'Amount', 0, 100, 75)] },
  kaleido: { name: 'Kaleidoscope', cat: 'Distort', params: [P('seg', 'Segments', 2, 24, 6), P('angle', 'Angle°', -180, 180, 0), P('zoom', 'Zoom %', 20, 400, 100)] },
  lens: { name: 'Lens distortion', cat: 'Distort', params: [P('k', 'Curvature', -100, 100, 40), P('zoom', 'Zoom %', 50, 200, 100)] },
  wave: { name: 'Wave warp', cat: 'Distort', params: [P('amp', 'Amplitude px', 0, 120, 18), P('freq', 'Frequency', 1, 80, 18), P('speed', 'Speed', 0, 20, 4), { k: 'vert', label: 'Vertical', type: 'bool', def: false }] },
  shake: { name: 'Camera shake', cat: 'Distort', params: [P('amount', 'Amount px', 0, 120, 18), P('rot', 'Rotation°', 0, 10, 1.5, 0.1), P('speed', 'Speed', 0.5, 30, 9, 0.5), P('zoom', 'Zoom (hide edges) %', 100, 140, 108)] },
  pixelsort: { name: 'Pixel sort', cat: 'Stylize', params: [P('thr', 'Threshold', 0, 100, 55), P('len', 'Length', 2, 48, 30), { k: 'vert', label: 'Vertical', type: 'bool', def: true }] },
  edgeglow: { name: 'Edge glow', cat: 'Stylize', params: [{ k: 'color', label: 'Glow colour', type: 'color', def: '#38e8ff' }, P('amount', 'Strength', 0, 100, 60), P('dark', 'Darken image', 0, 100, 70)] },
  halftone: { name: 'Halftone', cat: 'Stylize', params: [P('size', 'Dot size', 3, 40, 9), P('angle', 'Angle°', -90, 90, 45), P('amount', 'Mix', 0, 100, 100)] },
  emboss: { name: 'Emboss', cat: 'Stylize', params: [P('amount', 'Amount', 0, 100, 50)] },
  duotone: { name: 'Duotone', cat: 'Colour', params: [{ k: 'c1', label: 'Shadows', type: 'color', def: '#1b1446' }, { k: 'c2', label: 'Highlights', type: 'color', def: '#ff8a3d' }, P('amount', 'Mix', 0, 100, 100)] },
  posterize: { name: 'Posterize', cat: 'Colour', params: [P('levels', 'Levels', 2, 32, 5), P('amount', 'Mix', 0, 100, 100)] },
  threshold: { name: 'Threshold', cat: 'Colour', params: [P('thr', 'Level', 0, 100, 50), P('amount', 'Mix', 0, 100, 100)] },
  colorize: { name: 'Colorize / tint', cat: 'Colour', params: [{ k: 'color', label: 'Tint', type: 'color', def: '#3aa0ff' }, P('amount', 'Amount', 0, 100, 70)] },
  dirblur: { name: 'Directional blur', cat: 'Blur & sharpen', params: [P('amount', 'Length px', 0, 200, 30), P('angle', 'Angle°', -180, 180, 0)] },
  radblur: { name: 'Zoom blur', cat: 'Blur & sharpen', params: [P('amount', 'Amount', 0, 100, 35), P('cx', 'Centre X %', 0, 100, 50), P('cy', 'Centre Y %', 0, 100, 50)] },
  letterbox: { name: 'Letterbox bars', cat: 'Composite', params: [{ k: 'aspect', label: 'Aspect', type: 'select', def: '2.39', opts: [['2.39', '2.39:1 Scope'], ['2', '2:1'], ['1.85', '1.85:1'], ['1.33', '4:3 pillarbox'], ['1', '1:1 square']] }, { k: 'color', label: 'Colour', type: 'color', def: '#000000' }, P('amount', 'Amount %', 0, 100, 100)] },
};
const FX_PRESETS = [
  ['Green screen key', 'chroma', { color: '#00b140' }], ['Blue screen key', 'chroma', { color: '#0047bb', tol: 28 }],
  ['VHS tape', 'vhs', { amount: 80 }], ['Cinematic bars 2.39:1', 'letterbox', {}], ['Neon edges', 'edgeglow', { color: '#ff3df2', dark: 85 }], ['Comic halftone', 'halftone', { size: 7 }], ['Retro TV', 'crt', { amount: 85, curve: 60 }], ['Handheld shake', 'shake', { amount: 8, rot: 0.6, speed: 4 }], ['Earthquake', 'shake', { amount: 40, rot: 3, speed: 22 }],
  ['Face blur (pixelate)', 'mosaic', {}], ['Face blur (soft)', 'mosaic', { mode: 'blur', size: 30 }], ['Pixelate whole frame', 'mosaic', { whole: true, size: 32 }],
];
function newFx(type, over = {}) { const d = EFFECTS[type]; const f = { id: 'f' + Math.random().toString(36).slice(2, 9), type, on: true }; d.params.forEach(p => f[p.k] = p.def); return Object.assign(f, over); }

// Applies the pixel-stage effects of a stack to a layer canvas (in place). env: {rs, t}
function applyStack(canvas, fxs, env) {
  const W = canvas.width, H = canvas.height, rs = env.rs || 1; let passes = [];
  const flush = () => { if (passes.length) { runPasses(canvas, passes, env.t || 0); passes = []; } };
  for (const f of fxs) {
    if (!f.on) continue; const def = EFFECTS[f.type]; if (!def || def.stage === 'composite') continue;
    switch (f.type) {
      case 'chroma': passes.push({ name: 'chroma', u: { key: hex2rgb(f.color), tol: f.tol, soft: f.soft, spill: f.spill } }); break;
      case 'sharpen': if (f.amount > 0) passes.push({ name: 'sharpen', u: { amt: f.amount } }); break;
      case 'grain': if (f.amount > 0) passes.push({ name: 'grain', u: { amt: f.amount, sz: f.size * rs, seed: Math.floor((env.t || 0) * 24) % 997 } }); break;
      case 'vignette': if (f.amount) passes.push({ name: 'vignette', u: { amt: f.amount, size: f.size, feather: f.feather } }); break;
      case 'rgbsplit': if (f.amount > 0) { const a = f.angle * Math.PI / 180; passes.push({ name: 'rgbsplit', u: { off: [Math.cos(a) * f.amount * rs, -Math.sin(a) * f.amount * rs] } }); } break;
      case 'glitch': if (f.amount > 0) passes.push({ name: 'glitch', u: { amt: f.amount, seed: Math.floor((env.t || 0) * f.speed) % 991 + 1 } }); break;
      case 'vhs': if (f.amount > 0) passes.push({ name: 'vhs', u: { amt: f.amount } }); break;
      case 'crt': if (f.amount > 0 || f.curve > 0) passes.push({ name: 'crt', u: { amt: f.amount, curve: f.curve } }); break;
      case 'oldfilm': if (f.amount > 0) passes.push({ name: 'oldfilm', u: { amt: f.amount } }); break;
      case 'kaleido': passes.push({ name: 'kaleido', u: { seg: f.seg, ang: f.angle, zoom: f.zoom } }); break;
      case 'lens': if (f.k || f.zoom !== 100) passes.push({ name: 'lens', u: { k: f.k, zoom: f.zoom } }); break;
      case 'wave': if (f.amp > 0) passes.push({ name: 'wave', u: { amp: f.amp * rs, freq: f.freq, speed: f.speed, vert: f.vert ? 1 : 0 } }); break;
      case 'pixelsort': passes.push({ name: 'pixelsort', u: { thr: f.thr, len: f.len, vert: f.vert ? 1 : 0 } }); break;
      case 'edgeglow': if (f.amount > 0) passes.push({ name: 'edgeglow', u: { col: hex2rgb(f.color), amt: f.amount, dark: f.dark } }); break;
      case 'halftone': if (f.amount > 0) passes.push({ name: 'halftone', u: { size: Math.max(2, f.size * rs), amt: f.amount, ang: f.angle } }); break;
      case 'emboss': if (f.amount > 0) passes.push({ name: 'emboss', u: { amt: f.amount } }); break;
      case 'duotone': if (f.amount > 0) passes.push({ name: 'duotone', u: { c1: hex2rgb(f.c1), c2: hex2rgb(f.c2), amt: f.amount } }); break;
      case 'posterize': if (f.amount > 0) passes.push({ name: 'posterize', u: { levels: f.levels, amt: f.amount } }); break;
      case 'threshold': if (f.amount > 0) passes.push({ name: 'threshold', u: { thr: f.thr, amt: f.amount } }); break;
      case 'colorize': if (f.amount > 0) passes.push({ name: 'colorize', u: { col: hex2rgb(f.color), amt: f.amount } }); break;
      case 'dirblur': if (f.amount > 0) { const a = f.angle * Math.PI / 180; passes.push({ name: 'dirblur', u: { dir: [Math.cos(a) * f.amount * rs / 2, -Math.sin(a) * f.amount * rs / 2] } }); } break;
      case 'radblur': if (f.amount > 0) passes.push({ name: 'radblur', u: { amt: f.amount, ctr: [f.cx / 100, 1 - f.cy / 100] } }); break;
      default: flush(); apply2d(canvas, f, env, W, H, rs);
    }
  }
  flush();
}
function apply2d(canvas, f, env, W, H, rs) {
  const x = canvas.getContext('2d');
  const redraw = (filter, fn) => { const tmp = copyOf(canvas); x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H); x.filter = filter || 'none'; fn ? fn(tmp) : x.drawImage(tmp, 0, 0); x.restore(); release(tmp); };
  switch (f.type) {
    case 'blur': if (f.amount > 0) { const tmp = copyOf(canvas); x.save(); x.setTransform(1, 0, 0, 1, 0, 0); if (!f.edges) x.clearRect(0, 0, W, H); x.filter = `blur(${f.amount * rs * 0.6}px)`; x.drawImage(tmp, 0, 0); x.restore(); release(tmp); } break;
    case 'bw': if (f.amount > 0) redraw(`grayscale(${f.amount / 100})`); break;
    case 'sepia': if (f.amount > 0) redraw(`sepia(${f.amount / 100})`); break;
    case 'invert': if (f.amount > 0) redraw(`invert(${f.amount / 100})`); break;
    case 'flip': if (f.h || f.v) redraw(null, tmp => { x.translate(f.h ? W : 0, f.v ? H : 0); x.scale(f.h ? -1 : 1, f.v ? -1 : 1); x.drawImage(tmp, 0, 0); }); break;
    case 'mirror': redraw(null, tmp => {
      x.drawImage(tmp, 0, 0); x.beginPath();
      if (f.side === 'left') { x.rect(W / 2, 0, W / 2, H); x.clip(); x.translate(W, 0); x.scale(-1, 1); }
      else if (f.side === 'right') { x.rect(0, 0, W / 2, H); x.clip(); x.translate(W, 0); x.scale(-1, 1); }
      else if (f.side === 'top') { x.rect(0, H / 2, W, H / 2); x.clip(); x.translate(0, H); x.scale(1, -1); }
      else { x.rect(0, 0, W, H / 2); x.clip(); x.translate(0, H); x.scale(1, -1); }
      x.drawImage(tmp, 0, 0); }); break;
    case 'glow': if (f.strength > 0) {
      const tmp = getCanvas(W, H), tx = tmp.getContext('2d'); const th = f.threshold / 100;
      tx.filter = `brightness(${1 - th * 0.6}) contrast(${1 + th * 2.5}) blur(${f.radius * rs}px)`; tx.drawImage(canvas, 0, 0);
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'lighter'; x.globalAlpha = clamp(f.strength / 100, 0, 1); x.drawImage(tmp, 0, 0); if (f.strength > 100) { x.globalAlpha = (f.strength - 100) / 100; x.drawImage(tmp, 0, 0); } x.restore(); release(tmp); } break;
    case 'shake': if (f.amount > 0 || f.rot > 0) { const t = (env.t || 0) * f.speed; let sd = 0; for (const ch of String(f.id)) sd = (sd * 31 + ch.charCodeAt(0)) % 9973; const ph = i => (sd * (i + 1) * 0.618) % 6.283;
      const n = i => Math.sin(t * 1.31 + ph(i)) * 0.55 + Math.sin(t * 2.71 + ph(i + 3)) * 0.3 + Math.sin(t * 5.07 + ph(i + 6)) * 0.15;
      redraw(null, tmp => { x.translate(W / 2 + n(0) * f.amount * rs, H / 2 + n(1) * f.amount * rs); x.rotate(n(2) * f.rot * Math.PI / 180); const z = f.zoom / 100; x.scale(z, z); x.drawImage(tmp, -W / 2, -H / 2); }); } break;
    case 'letterbox': { const ar = +f.aspect || 2.39, k = clamp(f.amount / 100, 0, 1); x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = f.color;
      if (W / H < ar) { const bh = (H - W / ar) / 2 * k; x.fillRect(0, 0, W, bh); x.fillRect(0, H - bh, W, bh); } else { const bw = (W - H * ar) / 2 * k; x.fillRect(0, 0, bw, H); x.fillRect(W - bw, 0, bw, H); } x.restore(); break; }
    case 'mosaic': {
      const rx = f.whole ? 0 : f.rx / 100 * W, ry = f.whole ? 0 : f.ry / 100 * H, rw = f.whole ? W : f.rw / 100 * W, rh = f.whole ? H : f.rh / 100 * H; if (rw < 1 || rh < 1) break;
      const eff = getCanvas(W, H), ex = eff.getContext('2d');
      if (f.mode === 'blur') { ex.filter = `blur(${f.size * rs * 0.7}px)`; ex.drawImage(canvas, 0, 0); ex.filter = 'none'; }
      else { const cell = Math.max(2, f.size * rs); const sw = Math.max(1, Math.round(rw / cell)), shh = Math.max(1, Math.round(rh / cell)); const sm = getCanvas(sw, shh); sm.getContext('2d').drawImage(canvas, rx, ry, rw, rh, 0, 0, sw, shh); ex.imageSmoothingEnabled = false; ex.drawImage(sm, 0, 0, sw, shh, rx, ry, rw, rh); release(sm); }
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.beginPath(); if (f.shape === 'ellipse' && !f.whole) x.ellipse(rx + rw / 2, ry + rh / 2, rw / 2, rh / 2, 0, 0, Math.PI * 2); else x.rect(rx, ry, rw, rh); x.clip();
      if (f.mode !== 'blur') x.clearRect(rx, ry, rw, rh); x.drawImage(eff, 0, 0); x.restore(); release(eff); break; }
  }
}
// Composite stage: rounded corners + border are baked into the layer, shadow is returned for the final draw.
function compositeStage(layer, fxs, rect, rs) {
  const rnd = fxs.find(f => f.on && f.type === 'rounded'), bor = fxs.find(f => f.on && f.type === 'border'), sh = fxs.find(f => f.on && f.type === 'shadow');
  let out = layer, made = null;
  if ((rnd && rnd.radius > 0) || (bor && bor.width > 0)) {
    made = getCanvas(layer.width, layer.height); const x = made.getContext('2d'); x.setTransform(rs, 0, 0, rs, layer.width / 2, layer.height / 2);
    const r = Math.min(rnd ? rnd.radius : 0, rect.w / 2, rect.h / 2);
    x.beginPath(); x.roundRect(rect.x, rect.y, rect.w, rect.h, r); x.save(); x.clip(); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(layer, 0, 0); x.restore();
    if (bor && bor.width > 0) { x.save(); x.clip(); x.lineWidth = bor.width * 2; x.strokeStyle = bor.color; x.stroke(); x.restore(); }
    out = made;
  }
  return { canvas: out, made, shadow: sh };
}

// =====================================================================  transitions
const TRANSITIONS = [
  ['cross', 'Cross dissolve'], ['dipBlack', 'Dip to black'], ['dipWhite', 'Dip to white'],
  ['wipeL', 'Wipe left → right'], ['wipeR', 'Wipe right → left'], ['wipeU', 'Wipe up'], ['wipeD', 'Wipe down'],
  ['slide', 'Slide'], ['push', 'Push'], ['zoom', 'Zoom'], ['spin', 'Spin'], ['blurDissolve', 'Blur dissolve'],
  ['iris', 'Circle iris'], ['clock', 'Clock wipe'], ['glitch', 'Glitch'],
  ['whipL', 'Whip pan left'], ['whipR', 'Whip pan right'], ['zoomBlur', 'Zoom blur'], ['lightLeak', 'Light leak'], ['filmBurn', 'Film burn'], ['cube', 'Cube spin (2D)'],
  ['swipe', 'Swipe (diagonal)'], ['heart', 'Heart wipe'], ['star', 'Star wipe'], ['diamond', 'Diamond iris'], ['lumaFade', 'Luma fade'], ['barnDoor', 'Barn door'],
  ['blinds', 'Venetian blinds'], ['checker', 'Checkerboard'], ['pixelate', 'Pixelate'], ['flash', 'Flash (white)'], ['pushUp', 'Push up'], ['slideUp', 'Slide up'],
];
const TR_SWATCH = {
  cross: 'linear-gradient(90deg,#3d5fa8,#b06a2b)', dipBlack: 'linear-gradient(90deg,#3d5fa8,#000,#b06a2b)', dipWhite: 'linear-gradient(90deg,#3d5fa8,#fff,#b06a2b)',
  wipeL: 'linear-gradient(90deg,#b06a2b 50%,#3d5fa8 50%)', wipeR: 'linear-gradient(270deg,#b06a2b 50%,#3d5fa8 50%)', wipeU: 'linear-gradient(0deg,#b06a2b 50%,#3d5fa8 50%)', wipeD: 'linear-gradient(180deg,#b06a2b 50%,#3d5fa8 50%)',
  slide: 'linear-gradient(90deg,#3d5fa8 35%,#b06a2b 35%)', push: 'linear-gradient(90deg,#3d5fa8 50%,#b06a2b 50%)', zoom: 'radial-gradient(#b06a2b 30%,#3d5fa8 31%)', spin: 'conic-gradient(#b06a2b 0 30%,#3d5fa8 0)',
  blurDissolve: 'linear-gradient(90deg,#3d5fa8,#7a6a8b,#b06a2b)', iris: 'radial-gradient(circle,#b06a2b 40%,#3d5fa8 41%)', clock: 'conic-gradient(#b06a2b 0 65%,#3d5fa8 0)', glitch: 'repeating-linear-gradient(0deg,#3d5fa8 0 4px,#b06a2b 4px 7px,#9a7bff 7px 9px)',
  whipL: 'linear-gradient(90deg,#3d5fa8,#8aa0d0 40%,#d0a070 60%,#b06a2b)', whipR: 'linear-gradient(270deg,#3d5fa8,#8aa0d0 40%,#d0a070 60%,#b06a2b)', zoomBlur: 'radial-gradient(#b06a2b 10%,#8a7a9a 45%,#3d5fa8 75%)',
  lightLeak: 'radial-gradient(circle at 30% 40%,#ffd08a,#ff7a3d 35%,#3d5fa8 75%)', filmBurn: 'radial-gradient(circle at 60% 50%,#fff3c0 5%,#ff7a1a 25%,#5a1a05 45%,#3d5fa8 70%)', cube: 'linear-gradient(90deg,#2c457a 0 55%,#d08a4b 55%)',
  swipe: 'linear-gradient(135deg,#b06a2b 45%,#3d5fa8 55%)', heart: 'radial-gradient(circle,#b06a2b 35%,#3d5fa8 36%)', star: 'conic-gradient(#b06a2b 0 10%,#3d5fa8 0 20%,#b06a2b 0 30%,#3d5fa8 0 40%,#b06a2b 0 50%,#3d5fa8 0 60%,#b06a2b 0 70%,#3d5fa8 0 80%,#b06a2b 0 90%,#3d5fa8 0)',
  diamond: 'linear-gradient(45deg,#3d5fa8 30%,#b06a2b 30% 70%,#3d5fa8 70%)', lumaFade: 'linear-gradient(90deg,#000,#3d5fa8,#b06a2b,#fff)', barnDoor: 'linear-gradient(90deg,#3d5fa8 30%,#b06a2b 30% 70%,#3d5fa8 70%)',
  blinds: 'repeating-linear-gradient(0deg,#3d5fa8 0 4px,#b06a2b 4px 8px)', checker: 'repeating-conic-gradient(#3d5fa8 0 25%,#b06a2b 0 50%) 0 0/10px 10px', pixelate: 'repeating-conic-gradient(#5b77b8 0 25%,#c07a3b 0 50%) 0 0/8px 8px',
  flash: 'linear-gradient(90deg,#3d5fa8,#fff,#b06a2b)', pushUp: 'linear-gradient(0deg,#3d5fa8 50%,#b06a2b 50%)', slideUp: 'linear-gradient(0deg,#b06a2b 35%,#3d5fa8 35%)',
};
const easeIO = u => easeFn.easeInOut(clamp(u, 0, 1));
const LEGACY_TR = { fade: 'cross', wipe: 'wipeL', slide: 'slide', zoom: 'zoom', blur: 'blurDissolve', iris: 'iris' };
// Composite layer A (outgoing) and B (incoming) onto ctx (pixel space). A or B may be null (transparent).
function drawTransition(ctx, kind, A, B, p, seed) {
  const cv = ctx.canvas, W = cv.width, H = cv.height, e = easeIO(p);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
  const draw = (L, a = 1, fn) => { if (!L || a <= 0) return; ctx.save(); ctx.globalAlpha = a; fn && fn(); ctx.drawImage(L, 0, 0, W, H); ctx.restore(); };
  const cross = (fa, fb) => { if (A && B) { draw(A, 1, fa); draw(B, p, fb); } else { draw(A, 1 - p, fa); draw(B, p, fb); } };
  const regions = (path) => { // A outside the path, B inside
    if (A) { ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); path(); ctx.clip('evenodd'); ctx.drawImage(A, 0, 0, W, H); ctx.restore(); }
    if (B) { ctx.save(); ctx.beginPath(); path(); ctx.clip(); ctx.drawImage(B, 0, 0, W, H); ctx.restore(); }
  };
  switch (kind) {
    case 'dipBlack': case 'dipWhite': { const col = kind === 'dipBlack' ? '#000' : '#fff';
      if (p < 0.5) { draw(A); ctx.globalAlpha = Math.min(1, p * 2); ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); }
      else { draw(B); ctx.globalAlpha = Math.min(1, (1 - p) * 2); ctx.fillStyle = col; ctx.fillRect(0, 0, W, H); } break; }
    case 'wipeL': regions(() => ctx.rect(0, 0, W * e, H)); break;
    case 'wipeR': regions(() => ctx.rect(W * (1 - e), 0, W * e, H)); break;
    case 'wipeU': regions(() => ctx.rect(0, H * (1 - e), W, H * e)); break;
    case 'wipeD': regions(() => ctx.rect(0, 0, W, H * e)); break;
    case 'iris': regions(() => ctx.arc(W / 2, H / 2, Math.hypot(W, H) / 2 * e, 0, Math.PI * 2)); break;
    case 'clock': regions(() => { if (e <= 0) return; ctx.moveTo(W / 2, H / 2); ctx.arc(W / 2, H / 2, Math.hypot(W, H), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * e); ctx.closePath(); }); break;
    case 'slide': draw(A); draw(B, 1, () => ctx.translate(W * (1 - e), 0)); break;
    case 'push': draw(A, 1, () => ctx.translate(-W * e, 0)); draw(B, 1, () => ctx.translate(W * (1 - e), 0)); break;
    case 'zoom': { const za = () => { ctx.translate(W / 2, H / 2); ctx.scale(1 + e * 0.6, 1 + e * 0.6); ctx.translate(-W / 2, -H / 2); }, zb = () => { ctx.translate(W / 2, H / 2); ctx.scale(0.4 + 0.6 * e, 0.4 + 0.6 * e); ctx.translate(-W / 2, -H / 2); };
      draw(A, A && B ? 1 : 1 - p, za); draw(B, p, zb); break; }
    case 'spin': { draw(A, A && B ? 1 : 1 - p, () => { ctx.translate(W / 2, H / 2); ctx.rotate(e * Math.PI); ctx.scale(1 - e * 0.9, 1 - e * 0.9); ctx.translate(-W / 2, -H / 2); });
      draw(B, Math.min(1, p * 1.6), () => { ctx.translate(W / 2, H / 2); ctx.rotate(-(1 - e) * Math.PI); ctx.scale(Math.max(0.01, e), Math.max(0.01, e)); ctx.translate(-W / 2, -H / 2); }); break; }
    case 'blurDissolve': { const s = W / 1920; cross(() => { ctx.filter = `blur(${e * 40 * s}px)`; }, () => { ctx.filter = `blur(${(1 - e) * 40 * s}px)`; }); break; }
    case 'glitch': {
      const L = p < 0.5 ? A : B; const k = Math.sin(p * Math.PI); if (!L) break;
      const tmp = getCanvas(W, H), tx = tmp.getContext('2d'); tx.drawImage(L, 0, 0, W, H);
      let rnd = (seed || 1) * 9301 + Math.floor(p * 40) * 49297; const R = () => { rnd = (rnd * 9301 + 49297) % 233280; return rnd / 233280; };
      ctx.globalAlpha = 1; let y = 0; while (y < H) { const hh = Math.max(4, R() * H * 0.12); const dx = (R() - 0.5) * W * 0.18 * k * (R() < 0.6 ? 1 : 0); ctx.drawImage(tmp, 0, y, W, hh, dx, y, W, hh); y += hh; }
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.45 * k; ctx.filter = 'hue-rotate(120deg)'; ctx.drawImage(tmp, 14 * k * W / 1920, 0, W, H); ctx.filter = 'hue-rotate(-120deg)'; ctx.drawImage(tmp, -14 * k * W / 1920, 0, W, H);
      release(tmp); break; }
    case 'whipL': case 'whipR': case 'zoomBlur': case 'lightLeak': case 'filmBurn': case 'swipe': case 'lumaFade': case 'pixelate': {
      const name = { whipL: 'trWhip', whipR: 'trWhip', zoomBlur: 'trZoomBlur', lightLeak: 'trLeak', filmBurn: 'trBurn', swipe: 'trSwipe', lumaFade: 'trLuma', pixelate: 'trPixel' }[kind];
      const u = { p, dir: kind === 'whipR' ? -1 : 1, seed: ((seed || 1) % 97) * 0.37, soft: 0.25 };
      const out = getCanvas(W, H), ea = A || getCanvas(W, H), eb = B || getCanvas(W, H);
      if (GL.apply2(out, ea, eb, name, u, p)) ctx.drawImage(out, 0, 0); else cross();
      release(out); if (!A) release(ea); if (!B) release(eb); break; }
    case 'cube': { const z = 1 - 0.08 * Math.sin(p * Math.PI), wa = W * (1 - e), wb = W * e;
      const face = (L, x0, w, shade) => { if (!L || w < 0.5) return; ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(1, z); ctx.translate(-W / 2, -H / 2); ctx.drawImage(L, x0, 0, w, H); ctx.fillStyle = `rgba(0,0,0,${shade})`; ctx.fillRect(x0, 0, w, H); ctx.restore(); };
      face(A, 0, wa, e * 0.55); face(B, wa, wb, (1 - e) * 0.55); break; }
    case 'heart': { const s = e * Math.max(W, H) * 2.4; regions(() => { ctx.moveTo(W / 2, H / 2 + s * 0.35); ctx.bezierCurveTo(W / 2 - s * 0.6, H / 2 - s * 0.1, W / 2 - s * 0.3, H / 2 - s * 0.62, W / 2, H / 2 - s * 0.25); ctx.bezierCurveTo(W / 2 + s * 0.3, H / 2 - s * 0.62, W / 2 + s * 0.6, H / 2 - s * 0.1, W / 2, H / 2 + s * 0.35); ctx.closePath(); }); break; }
    case 'star': { const r = e * Math.max(W, H) * 1.5; regions(() => { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5 + e * 0.6, rr = i % 2 ? r * 0.45 : r; i ? ctx.lineTo(W / 2 + Math.cos(a) * rr, H / 2 + Math.sin(a) * rr) : ctx.moveTo(W / 2 + Math.cos(a) * rr, H / 2 + Math.sin(a) * rr); } ctx.closePath(); }); break; }
    case 'diamond': { const r = e * (W + H) / 2; regions(() => { ctx.moveTo(W / 2, H / 2 - r); ctx.lineTo(W / 2 + r, H / 2); ctx.lineTo(W / 2, H / 2 + r); ctx.lineTo(W / 2 - r, H / 2); ctx.closePath(); }); break; }
    case 'barnDoor': regions(() => ctx.rect(W / 2 * (1 - e), 0, W * e, H)); break;
    case 'blinds': { const n = 10, bh = H / n; regions(() => { for (let i = 0; i < n; i++) ctx.rect(0, i * bh, W, bh * e + 0.5); }); break; }
    case 'checker': { const cols = 10, rows = Math.max(2, Math.round(cols * H / W)), cw = W / cols, chh = H / rows; let rnd = (seed || 7) * 7919; const R = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
      const order = []; for (let i = 0; i < cols * rows; i++) order.push(R()); regions(() => { for (let i = 0; i < cols * rows; i++) if (order[i] < e) ctx.rect((i % cols) * cw, Math.floor(i / cols) * chh, cw + 0.5, chh + 0.5); }); break; }
    case 'flash': { cross(); ctx.globalAlpha = Math.pow(Math.sin(p * Math.PI), 1.5); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); break; }
    case 'pushUp': draw(A, 1, () => ctx.translate(0, -H * e)); draw(B, 1, () => ctx.translate(0, H * (1 - e))); break;
    case 'slideUp': draw(A); draw(B, 1, () => ctx.translate(0, H * (1 - e))); break;
    default: cross(); // cross dissolve
  }
  ctx.restore();
}

window.VFX = { EASES, easeFn, evalKf, setKey, getCanvas, release, copyOf, GL, runPasses, EFFECTS, FX_PRESETS, newFx, applyStack, compositeStage, LU_DEFAULT, LOOKS, luActive, luPass, lookSwatchCss, TRANSITIONS, TR_SWATCH, LEGACY_TR, drawTransition, hex2rgb, rgba };
})();
