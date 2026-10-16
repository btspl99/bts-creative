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
    if (t >= a.t && t < b.t) { const u = (t - a.t) / ((b.t - a.t) || 1); return a.v + (b.v - a.v) * (easeFn[a.e] || easeFn.linear)(u); }
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
  let cv = null, gl = null, ok = null, vbo = null, texIn = null; const progs = {}; const fbs = [], txs = []; let W = 0, H = 0;
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
  };
  function init() {
    if (ok !== null) return ok;
    try {
      cv = document.createElement('canvas'); cv.width = cv.height = 4;
      gl = cv.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, alpha: true, antialias: false, depth: false, stencil: false });
      if (!gl) return (ok = false);
      vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      texIn = mkTex();
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
        if (k === 'tex') gl.uniform1i(l, 0); else if (Array.isArray(v)) (v.length === 2 ? gl.uniform2fv : v.length === 3 ? gl.uniform3fv : gl.uniform4fv).call(gl, l, v); else gl.uniform1f(l, +v || 0);
      }
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 6);
      input = last ? null : txs[i % 2];
    });
    const x = canvas.getContext('2d'); x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.filter = 'none'; x.globalCompositeOperation = 'copy'; x.drawImage(cv, 0, 0); x.restore();
    return true;
  }
  return { apply, init, get ok() { return init(); } };
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
};
const FX_PRESETS = [
  ['Green screen key', 'chroma', { color: '#00b140' }], ['Blue screen key', 'chroma', { color: '#0047bb', tol: 28 }],
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
];
const TR_SWATCH = {
  cross: 'linear-gradient(90deg,#3d5fa8,#b06a2b)', dipBlack: 'linear-gradient(90deg,#3d5fa8,#000,#b06a2b)', dipWhite: 'linear-gradient(90deg,#3d5fa8,#fff,#b06a2b)',
  wipeL: 'linear-gradient(90deg,#b06a2b 50%,#3d5fa8 50%)', wipeR: 'linear-gradient(270deg,#b06a2b 50%,#3d5fa8 50%)', wipeU: 'linear-gradient(0deg,#b06a2b 50%,#3d5fa8 50%)', wipeD: 'linear-gradient(180deg,#b06a2b 50%,#3d5fa8 50%)',
  slide: 'linear-gradient(90deg,#3d5fa8 35%,#b06a2b 35%)', push: 'linear-gradient(90deg,#3d5fa8 50%,#b06a2b 50%)', zoom: 'radial-gradient(#b06a2b 30%,#3d5fa8 31%)', spin: 'conic-gradient(#b06a2b 0 30%,#3d5fa8 0)',
  blurDissolve: 'linear-gradient(90deg,#3d5fa8,#7a6a8b,#b06a2b)', iris: 'radial-gradient(circle,#b06a2b 40%,#3d5fa8 41%)', clock: 'conic-gradient(#b06a2b 0 65%,#3d5fa8 0)', glitch: 'repeating-linear-gradient(0deg,#3d5fa8 0 4px,#b06a2b 4px 7px,#9a7bff 7px 9px)',
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
    default: cross(); // cross dissolve
  }
  ctx.restore();
}

window.VFX = { EASES, easeFn, evalKf, setKey, getCanvas, release, copyOf, GL, runPasses, EFFECTS, FX_PRESETS, newFx, applyStack, compositeStage, LU_DEFAULT, LOOKS, luActive, luPass, lookSwatchCss, TRANSITIONS, TR_SWATCH, LEGACY_TR, drawTransition, hex2rgb, rgba };
})();
