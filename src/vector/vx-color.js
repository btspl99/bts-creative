// BTS Vector — colour: picker (HEX/RGB/HSB/CMYK), global swatches, colour themes & palettes, gradient editor
// (panel + on-canvas), freeform (mesh-like) gradients, pattern swatches, Recolor artwork with harmonies.
(() => {
const { P, O, DOC, G } = VX; const { h, toast, modal, form, clamp } = UI;
const sel = () => VX.sel; const ins = { insert: false };

// ---------------------------------------------------------------- conversions
const C = VX.C = {};
C.hexToRgb = hx => { let s = String(hx || '#000').replace('#', ''); if (s.length === 3) s = s.split('').map(c => c + c).join(''); const n = parseInt(s.slice(0, 6), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
C.rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
C.rgbToHsb = (r, g, b) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let hh = 0; if (d) { if (mx === r) hh = ((g - b) / d) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4; hh *= 60; if (hh < 0) hh += 360; } return [hh, mx ? d / mx * 100 : 0, mx * 100]; };
C.hsbToRgb = (hh, s, v) => { s /= 100; v /= 100; const c = v * s, x = c * (1 - Math.abs((hh / 60) % 2 - 1)), m = v - c; const [r, g, b] = hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x]; return [(r + m) * 255, (g + m) * 255, (b + m) * 255]; };
C.rgbToCmyk = (r, g, b) => { r /= 255; g /= 255; b /= 255; const k = 1 - Math.max(r, g, b); if (k >= 1) return [0, 0, 0, 100]; return [(1 - r - k) / (1 - k) * 100, (1 - g - k) / (1 - k) * 100, (1 - b - k) / (1 - k) * 100, k * 100]; };
C.cmykToRgb = (c, m, y, k) => [255 * (1 - c / 100) * (1 - k / 100), 255 * (1 - m / 100) * (1 - k / 100), 255 * (1 - y / 100) * (1 - k / 100)];
C.hsbHex = (hh, s, b) => C.rgbToHex(...C.hsbToRgb(((hh % 360) + 360) % 360, clamp(s, 0, 100), clamp(b, 0, 100)));
C.hexHsb = hx => C.rgbToHsb(...C.hexToRgb(hx));
C.norm = c => { try { if (!c) return null; if (typeof c === 'string') return new P.Color(c).toCSS(true); return c.toCSS(true); } catch { return null; } };

// ---------------------------------------------------------------- palettes & themes
const PALETTES = VX.PALETTES = {
  Material: ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800', '#ff5722', '#795548', '#9e9e9e', '#607d8b'],
  Tailwind: ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#64748b'],
  Pastel: ['#ffd1dc', '#ffe5b4', '#fffacd', '#d4f0c0', '#b5ead7', '#c1e7e3', '#cde7ff', '#c7ceea', '#e0d4ff', '#f8d7f0', '#fbe7c6', '#ffdac1'],
  Earth: ['#3e2723', '#5b3a29', '#704214', '#8b5e3c', '#a47148', '#b5651d', '#cc7722', '#c19a6b', '#d9c5a0', '#8f9779', '#6b8e23', '#556b2f'],
  Neon: ['#ff073a', '#fe4164', '#ff6ec7', '#fe019a', '#bc13fe', '#7df9ff', '#04d9ff', '#00fdff', '#39ff14', '#ccff00', '#ffff33', '#ff9933'],
  Grayscale: ['#000000', '#1a1a1a', '#333333', '#4d4d4d', '#666666', '#808080', '#999999', '#b3b3b3', '#cccccc', '#e6e6e6', '#f2f2f2', '#ffffff'],
  Sunset: ['#0b1d51', '#3b1e6d', '#7b2869', '#c73866', '#fe676e', '#fd8f52', '#ffbd71', '#ffdca2'],
  Ocean: ['#03045e', '#023e8a', '#0077b6', '#0096c7', '#00b4d8', '#48cae4', '#90e0ef', '#caf0f8'],
  Forest: ['#081c15', '#1b4332', '#2d6a4f', '#40916c', '#52b788', '#74c69d', '#95d5b2', '#d8f3dc'],
};
const DEFAULT_SW = ['#000000', '#3a3a3a', '#7a7a7a', '#bdbdbd', '#ffffff', '#ff5a5f', '#ff9a00', '#ffd400', '#a3e635', '#3ccf8e', '#14b8a6', '#31a8ff', '#2563eb', '#6366f1', '#9a7bff', '#d946ef', '#f43f5e', '#7c2d12', '#365314', '#0f172a', '#fde68a', '#fbcfe8', '#bae6fd', '#ddd6fe'];
let swId = 1;
VX.defaultSwatches = () => DEFAULT_SW.map((c, i) => ({ id: 'sw' + (swId++) + '_' + i, name: c, color: c, global: false }));
C.harmony = (hex, rule) => { const [hh, s, b] = C.hexHsb(hex); const at = d => C.hsbHex(hh + d, s, b); switch (rule) {
  case 'complementary': return [hex, at(180), C.hsbHex(hh, s * 0.6, Math.min(100, b + 15)), C.hsbHex(hh + 180, s * 0.6, Math.min(100, b + 15))];
  case 'analogous': return [at(-30), hex, at(30), at(-60), at(60)];
  case 'triadic': return [hex, at(120), at(240)];
  case 'split': return [hex, at(150), at(210)];
  case 'tetradic': return [hex, at(90), at(180), at(270)];
  case 'monochrome': return [C.hsbHex(hh, s, Math.max(15, b - 45)), C.hsbHex(hh, s, Math.max(20, b - 25)), hex, C.hsbHex(hh, s * 0.7, Math.min(100, b + 15)), C.hsbHex(hh, s * 0.35, Math.min(100, b + 30))];
  default: return [hex]; } };
C.HARMONIES = [['complementary', 'Complementary'], ['analogous', 'Analogous'], ['triadic', 'Triadic'], ['split', 'Split complementary'], ['tetradic', 'Tetradic'], ['monochrome', 'Monochrome']];

// ---------------------------------------------------------------- colour picker component
VX.colorPicker = (initial, onChange) => {
  let [hh, s, b] = C.hexHsb(C.norm(initial) || '#ff9a00'); let hex = C.hsbHex(hh, s, b);
  const sv = h('div', { class: 'sv' }), svc = h('canvas', { width: 256, height: 160 }), knob = h('div', { class: 'knob' }); sv.append(svc, knob);
  const hue = h('div', { class: 'hue' }), huec = h('canvas', { width: 256, height: 14 }), hk = h('div', { class: 'knob' }); hue.append(huec, hk);
  const chip = h('div', { class: 'chip' }); const hexI = h('input', { type: 'text', value: hex, style: { width: '86px' } });
  const mk = () => h('input', { type: 'number' }); const R = [mk(), mk(), mk()], HS = [mk(), mk(), mk()], CM = [mk(), mk(), mk(), mk()];
  const vals = h('div', { class: 'vals' }, h('span', {}, 'RGB'), ...R, h('span', {}), h('span', {}, 'HSB'), ...HS, h('span', {}), h('span', {}, 'CMYK'), ...CM);
  const el = h('div', { class: 'cp' }, sv, hue, h('div', { class: 'prev' }, chip, h('span', { class: 'muted' }, 'HEX'), hexI), vals);
  const drawSV = () => { const x = svc.getContext('2d'); const g1 = x.createLinearGradient(0, 0, 256, 0); g1.addColorStop(0, '#fff'); g1.addColorStop(1, C.hsbHex(hh, 100, 100)); x.fillStyle = g1; x.fillRect(0, 0, 256, 160); const g2 = x.createLinearGradient(0, 0, 0, 160); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, '#000'); x.fillStyle = g2; x.fillRect(0, 0, 256, 160); };
  const drawHue = () => { const x = huec.getContext('2d'); const g = x.createLinearGradient(0, 0, 256, 0); for (let k = 0; k <= 6; k++) g.addColorStop(k / 6, C.hsbHex(k * 60, 100, 100)); x.fillStyle = g; x.fillRect(0, 0, 256, 14); };
  const sync = (from, emit = true) => {
    hex = C.hsbHex(hh, s, b); const [r, g, bb] = C.hexToRgb(hex); const cm = C.rgbToCmyk(r, g, bb);
    knob.style.left = s + '%'; knob.style.top = (100 - b) + '%'; hk.style.left = (hh / 360 * 100) + '%'; chip.style.background = hex;
    if (from !== 'hex') hexI.value = hex; if (from !== 'rgb') [r, g, bb].forEach((v, i) => R[i].value = Math.round(v)); if (from !== 'hsb') [hh, s, b].forEach((v, i) => HS[i].value = Math.round(v)); if (from !== 'cmyk') cm.forEach((v, i) => CM[i].value = Math.round(v));
    drawSV(); if (emit && onChange) onChange(hex);
  };
  const dragIn = (elx, fn) => elx.addEventListener('mousedown', e => { const mv = ev => { const r = elx.getBoundingClientRect(); fn(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1)); }; mv(e); const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); });
  dragIn(sv, (x, y) => { s = x * 100; b = (1 - y) * 100; sync(); }); dragIn(hue, x => { hh = x * 359.9; sync(); });
  hexI.onchange = () => { const v = C.norm(hexI.value.startsWith('#') ? hexI.value : '#' + hexI.value); if (v) { [hh, s, b] = C.hexHsb(v); sync('hex'); } };
  R.forEach(i => i.oninput = () => { [hh, s, b] = C.rgbToHsb(...R.map(x => clamp(+x.value, 0, 255))); sync('rgb'); });
  HS.forEach(i => i.oninput = () => { hh = clamp(+HS[0].value, 0, 360); s = clamp(+HS[1].value, 0, 100); b = clamp(+HS[2].value, 0, 100); sync('hsb'); });
  CM.forEach(i => i.oninput = () => { [hh, s, b] = C.rgbToHsb(...C.cmykToRgb(...CM.map(x => clamp(+x.value, 0, 100)))); sync('cmyk'); });
  drawHue(); sync(null, false);
  el.get = () => hex; el.set = v => { const n = C.norm(v); if (n) { [hh, s, b] = C.hexHsb(n); sync(null, false); } };
  return el;
};
VX.f.colorDialog = async (initial, title = 'Colour', allowNone = false) => {
  const cp = VX.colorPicker(initial || '#000000'); const noneCb = h('input', { type: 'checkbox' });
  const sw = h('div', { class: 'swgrid', style: { marginTop: '4px' } }, ...DOC.swatches.filter(x => !x.type).slice(0, 27).map(x => h('div', { class: 's', title: x.name, style: { background: x.color }, onclick: () => cp.set(x.color) })));
  const r = await modal({ title, width: 340, body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, cp, sw, allowNone ? h('label', { class: 'row', style: { color: 'var(--tx-1)' } }, noneCb, 'None') : ''), buttons: [{ label: 'Cancel', value: null }, { label: 'OK', primary: true, value: 'ok' }] });
  if (r !== 'ok') return undefined; return noneCb.checked ? null : cp.get();
};

// ---------------------------------------------------------------- gradients (panel state + on-canvas tool)
const GS = VX.gradState = { type: 'linear', angle: 0, stops: [{ c: '#ff9a00', a: 1, o: 0 }, { c: '#9a7bff', a: 1, o: 1 }], cur: 0, target: 'fill', blend: 'srgb' };
const stopColor = s => { const c = new P.Color(s.c); c.alpha = s.a; return c; };
// ---- colour-space blending: sRGB (classic canvas interpolation), linear light, perceptual OKLab
const toLin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const fromLin = v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055);
C.toOklab = hex => { const [r, g, b] = C.hexToRgb(hex).map(toLin); const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b); return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s]; };
C.fromOklab = ([L, a, b]) => { const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3; return C.rgbToHex(fromLin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), fromLin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), fromLin(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)); };
C.mix = (a, b, t, space = 'srgb') => { if (space === 'oklab') { const A = C.toOklab(a), B = C.toOklab(b); return C.fromOklab(A.map((v, i) => v + (B[i] - v) * t)); } const A = C.hexToRgb(a), B = C.hexToRgb(b); if (space === 'linear') return C.rgbToHex(...A.map((v, i) => fromLin(toLin(v) + (toLin(B[i]) - toLin(v)) * t))); return C.rgbToHex(...A.map((v, i) => v + (B[i] - v) * t)); };
C.labDist = (a, b) => { const A = C.toOklab(a), B = C.toOklab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };
C.BLENDS = [['srgb', 'sRGB'], ['linear', 'Linear'], ['oklab', 'OKLab']];
// user stops {c,a,o} → paper stops; non-sRGB blending inserts intermediate stops computed in the chosen colour space
G.expandStops = (stops, blend = 'srgb') => { const s = [...stops].sort((a, b) => a.o - b.o); if (blend === 'srgb' || s.length < 2) return s.map(x => [stopColor(x), x.o]); const out = []; for (let i = 0; i < s.length - 1; i++) { const A = s[i], B = s[i + 1]; const n = 12; for (let k = 0; k < n; k++) { const t = k / n; const c = new P.Color(C.mix(A.c, B.c, t, blend)); c.alpha = A.a + (B.a - A.a) * t; out.push([c, A.o + (B.o - A.o) * t]); } } const L = s[s.length - 1]; out.push([stopColor(L), L.o]); return out; };
const userStopsOf = (i, target = GS.target) => { const u = i.data?.gradU?.[target]; if (u) return { stops: u.stops.map(x => ({ ...x })), blend: u.blend }; const c = target === 'stroke' ? i.strokeColor : i.fillColor; if (!c?.gradient) return null; return { stops: c.gradient.stops.map((s, k, A) => ({ c: new P.Color(s.color.red, s.color.green, s.color.blue).toCSS(true), a: s.color.alpha, o: s.offset ?? (A.length > 1 ? k / (A.length - 1) : 0) })), blend: 'srgb' }; };
const setUserGradient = (i, target, us, radial, origin, destination) => { const obj = { gradient: { stops: G.expandStops(us.stops, us.blend), radial }, origin, destination }; if (target === 'stroke') i.strokeColor = obj; else i.fillColor = obj; i.data.gradU = i.data.gradU || {}; if (us.blend && us.blend !== 'srgb') i.data.gradU[target] = { stops: us.stops.map(x => ({ c: x.c, a: x.a, o: x.o })), blend: us.blend }; else delete i.data.gradU[target]; };
G.userStopsOf = userStopsOf; G.setUserGradient = setUserGradient;
G.gradientFor = (item, st = GS) => { const b = item.bounds; const c = b.center; const stops = G.expandStops(st.stops, st.blend); if (st.type === 'radial') return { gradient: { stops, radial: true }, origin: c, destination: c.add([Math.max(b.width, b.height) / 2, 0]) }; const d = new P.Point({ angle: st.angle, length: 1 }); const half = Math.abs(d.x) * b.width / 2 + Math.abs(d.y) * b.height / 2; return { gradient: { stops, radial: false }, origin: c.subtract(d.multiply(half)), destination: c.add(d.multiply(half)) }; };
G.applyGradient = (target = GS.target) => { if (!sel().length) return toast('Select objects to apply the gradient'); sel().forEach(s => VX.eachStyled(s, i => { if (i instanceof P.Raster) return; const g = G.gradientFor(i); setUserGradient(i, target, { stops: GS.stops, blend: GS.blend }, g.gradient.radial, g.origin, g.destination); if (target === 'stroke' && !i.strokeWidth) i.strokeWidth = Math.max(4, VX.O.sw); })); VX.commitDebounced('Gradient'); VX.renderFS(); VX.drawGuides(); };
G.loadGradientFrom = item => { const it = item && VX.firstStyled(item); const col = it && (GS.target === 'stroke' ? it.strokeColor : it.fillColor); if (!col?.gradient) return false; const us = userStopsOf(it); GS.type = col.gradient.radial ? 'radial' : 'linear'; GS.stops = us.stops; GS.blend = us.blend || 'srgb'; if (col.origin && col.destination) GS.angle = Math.round(col.destination.subtract(col.origin).angle); GS.cur = Math.min(GS.cur, GS.stops.length - 1); return true; };
// ---- gradient presets library
G.GRADIENT_PRESETS = [
  ['Sunrise', 'linear', 90, [['#ff512f', 0], ['#f09819', 1]]], ['Ocean', 'linear', 0, [['#2193b0', 0], ['#6dd5ed', 1]]], ['Purple haze', 'linear', 45, [['#7f00ff', 0], ['#e100ff', 1]]], ['Mint', 'linear', 0, [['#00b09b', 0], ['#96c93d', 1]]],
  ['Peach', 'linear', 90, [['#ffecd2', 0], ['#fcb69f', 1]]], ['Night sky', 'linear', 90, [['#0f2027', 0], ['#203a43', 0.5], ['#2c5364', 1]]], ['Rainbow', 'linear', 0, [['#ff0000', 0], ['#ff9a00', 0.2], ['#ffe600', 0.4], ['#33cc33', 0.6], ['#2f6bff', 0.8], ['#8f2fff', 1]]], ['Fire', 'linear', 270, [['#f12711', 0], ['#f5af19', 1]]],
  ['Steel', 'linear', 90, [['#bdc3c7', 0], ['#2c3e50', 1]]], ['Gold', 'linear', 45, [['#b8860b', 0], ['#ffd700', 0.45], ['#fff4c2', 0.55], ['#b8860b', 1]]], ['Chrome', 'linear', 90, [['#f5f5f5', 0], ['#9a9a9a', 0.48], ['#2b2b2b', 0.5], ['#cfcfcf', 1]]], ['Candy', 'linear', 0, [['#ff6fd8', 0], ['#3813c2', 1]]],
  ['Lagoon', 'linear', 135, [['#43cea2', 0], ['#185a9d', 1]]], ['Blush', 'linear', 0, [['#ee9ca7', 0], ['#ffdde1', 1]]], ['Glow (radial)', 'radial', 0, [['#fffbd5', 0], ['#ff9a00', 0.55], ['#b20a2c', 1]]], ['Spotlight (radial)', 'radial', 0, [['#ffffff', 0], ['#ffffff00', 1]]],
  ['Sphere (radial)', 'radial', 0, [['#9ad0ff', 0], ['#2f6bff', 0.6], ['#0b1d51', 1]]], ['Black to clear', 'linear', 90, [['#000000', 0], ['#00000000', 1]]], ['Duotone', 'linear', 0, [['#ff3d77', 0], ['#ff3d77', 0.5], ['#31a8ff', 0.5], ['#31a8ff', 1]]], ['Aurora', 'linear', 30, [['#00c9ff', 0], ['#92fe9d', 0.5], ['#fc00ff', 1]]],
];
const presetStops = p => p[3].map(([c, o]) => { const hx = c.length === 9 ? c.slice(0, 7) : c; const a = c.length === 9 ? parseInt(c.slice(7), 16) / 255 : 1; return { c: hx, a, o }; });
const presetCSS = p => `${p[1] === 'radial' ? 'radial-gradient(circle' : `linear-gradient(${90 + p[2]}deg`}, ${presetStops(p).map(s => { const [r, g, b] = C.hexToRgb(s.c); return `rgba(${r},${g},${b},${s.a}) ${s.o * 100}%`; }).join(', ')}), repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0/8px 8px`;
G.applyPreset = (name, target) => { const p = G.GRADIENT_PRESETS.find(x => x[0] === name); if (!p) return false; GS.type = p[1]; GS.angle = p[2]; GS.stops = presetStops(p); GS.cur = 0; if (sel().length) G.applyGradient(target); return true; };
const presetGrid = (onPick) => h('div', { class: 'swgrid', style: { gridTemplateColumns: 'repeat(5,1fr)' } }, ...G.GRADIENT_PRESETS.map(p => h('div', { class: 's', title: p[0], 'data-tip': p[0], style: { background: presetCSS(p) }, onclick: () => onPick(p[0]) })));
VX.f.gradientPresets = async () => {
  const name = h('div', { class: 'muted', style: { fontSize: '11.5px' } }, sel().length ? 'Click a preset to apply it to the selection (Undo to revert).' : 'Click a preset to load it into the Gradient panel; select objects to apply it.');
  const tgt = h('div', { class: 'seg' }, ...[['fill', 'Fill'], ['stroke', 'Stroke']].map(([v, l]) => { const b = h('button', { class: GS.target === v ? 'on' : '', onclick: () => { GS.target = v; tgt.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); } }, l); return b; }));
  const blend = h('select', {}, ...C.BLENDS.map(([k, l]) => h('option', { value: k, selected: GS.blend === k }, 'Blend: ' + l))); blend.onchange = () => { GS.blend = blend.value; };
  const r = modal({ title: `Gradient presets (${G.GRADIENT_PRESETS.length})`, width: 420, body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, h('div', { class: 'row', style: { gap: '8px' } }, tgt, blend), presetGrid(n => { G.applyPreset(n); VX.flushCommit(); }), name), buttons: [{ label: 'Done', primary: true, value: 'ok' }] });
  await r; VX.renderRight(); return true;
};
VX.f.gradientBlend = k => { GS.blend = k; const targets = []; sel().forEach(s => VX.eachStyled(s, i => { const c = GS.target === 'stroke' ? i.strokeColor : i.fillColor; if (c?.gradient) targets.push(i); })); targets.forEach(i => { const c = GS.target === 'stroke' ? i.strokeColor : i.fillColor; const us = userStopsOf(i); us.blend = k; setUserGradient(i, GS.target, us, c.gradient.radial, c.origin, c.destination); }); if (targets.length) VX.commit('Gradient blending'); toast('Gradient blending: ' + C.BLENDS.find(b => b[0] === k)[1]); VX.renderRight(); };
VX.f.nearestSwatch = c => { const hex = C.norm(c); if (!hex) return c; const sw = DOC.swatches.filter(x => !x.type && C.norm(x.color)); if (!sw.length) return c; let best = sw[0], bd = Infinity; sw.forEach(x => { const d = C.labDist(hex, C.norm(x.color)); if (d < bd) { bd = d; best = x; } }); return C.norm(best.color); };
const gradCSS = st => `linear-gradient(90deg, ${G.expandStops(st.stops, st.blend).map(([c, o]) => `rgba(${Math.round(c.red * 255)},${Math.round(c.green * 255)},${Math.round(c.blue * 255)},${c.alpha}) ${o * 100}%`).join(', ')})`;
function gradientEditor() {
  const wrap = h('div', {});
  const render = () => {
    wrap.innerHTML = '';
    const type = h('div', { class: 'seg' }, ...[['linear', 'Linear'], ['radial', 'Radial']].map(([v, l]) => h('button', { class: GS.type === v ? 'on' : '', onclick: () => { GS.type = v; render(); live(); } }, l)));
    const tgt = h('div', { class: 'seg' }, ...[['fill', 'Fill'], ['stroke', 'Stroke']].map(([v, l]) => h('button', { class: GS.target === v ? 'on' : '', onclick: () => { GS.target = v; render(); } }, l)));
    const blendSeg = h('div', { class: 'seg', 'data-tip': 'Colour blending between stops' }, ...C.BLENDS.map(([v, l]) => h('button', { class: GS.blend === v ? 'on' : '', onclick: () => { GS.blend = v; render(); live(); } }, l)));
    const bar = h('div', { class: 'gstops', style: { background: gradCSS(GS) + ', repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0/10px 10px' } });
    GS.stops.forEach((s, i) => { const st = h('div', { class: 'st' + (i === GS.cur ? ' on' : ''), style: { left: s.o * 100 + '%', background: s.c } }); st.onmousedown = e => { e.stopPropagation(); GS.cur = i; const r = bar.getBoundingClientRect(); const mv = ev => { s.o = clamp((ev.clientX - r.left) / r.width, 0, 1); st.style.left = s.o * 100 + '%'; bar.style.background = gradCSS(GS) + ', repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0/10px 10px'; live(); }; const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); render(); }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up); render(); }; st.ondblclick = e => { e.stopPropagation(); if (GS.stops.length > 2) { GS.stops.splice(i, 1); GS.cur = 0; render(); live(); } }; bar.append(st); });
    bar.onmousedown = e => { const r = bar.getBoundingClientRect(); const o = clamp((e.clientX - r.left) / r.width, 0, 1); const sorted = [...GS.stops].sort((a, b) => a.o - b.o); let c = sorted[0].c; for (let k = 0; k < sorted.length - 1; k++) if (o >= sorted[k].o && o <= sorted[k + 1].o) { const t = (o - sorted[k].o) / Math.max(1e-6, sorted[k + 1].o - sorted[k].o); const A = C.hexToRgb(sorted[k].c), B = C.hexToRgb(sorted[k + 1].c); c = C.rgbToHex(...A.map((v, j) => v + (B[j] - v) * t)); } GS.stops.push({ c, a: 1, o }); GS.cur = GS.stops.length - 1; render(); live(); };
    const s = GS.stops[GS.cur] || GS.stops[0];
    const col = h('input', { type: 'color', value: s.c }); col.oninput = () => { s.c = col.value; bar.style.background = gradCSS(GS); live(); };
    const pos = h('input', { type: 'number', min: 0, max: 100, value: Math.round(s.o * 100), style: { width: '56px' } }); pos.onchange = () => { s.o = clamp(+pos.value / 100, 0, 1); render(); live(); };
    const op = h('input', { type: 'number', min: 0, max: 100, value: Math.round(s.a * 100), style: { width: '56px' } }); op.onchange = () => { s.a = clamp(+op.value / 100, 0, 1); render(); live(); };
    const ang = h('input', { type: 'number', value: GS.angle, style: { width: '56px' } }); ang.onchange = () => { GS.angle = +ang.value; live(); };
    wrap.append(h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } }, type, tgt, h('span', { class: 'muted' }, '∠'), ang), h('div', { class: 'row', style: { gap: '6px', marginTop: '6px' } }, h('span', { class: 'muted' }, 'Blend'), blendSeg),
      bar, h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } }, h('span', { class: 'muted' }, 'Stop'), col, h('span', { class: 'muted' }, 'at'), pos, h('span', { class: 'muted' }, '% op'), op, h('button', { class: 'btn sm', 'data-tip': 'Delete stop (or double-click it)', onclick: () => { if (GS.stops.length > 2) { GS.stops.splice(GS.cur, 1); GS.cur = 0; render(); live(); } } }, '✕'), h('button', { class: 'btn sm', 'data-tip': 'Reverse', onclick: () => { GS.stops.forEach(x => x.o = 1 - x.o); render(); live(); } }, '⇄')),
      h('div', { class: 'row', style: { gap: '4px', marginTop: '8px', flexWrap: 'wrap' } }, h('button', { class: 'btn sm primary', onclick: () => G.applyGradient() }, 'Apply to ' + GS.target), h('button', { class: 'btn sm', onclick: () => VX.setTool('gradient') }, 'Edit on canvas (G)'), h('button', { class: 'btn sm', onclick: () => VX.f.freeformGradient() }, 'Freeform…'), h('button', { class: 'btn sm', onclick: () => VX.f.gradientPresets() }, 'Presets…')),
      h('div', { class: 'muted', style: { fontSize: '11px', marginTop: '6px' } }, 'Click the bar to add a stop · drag stops · double-click a stop to remove it'));
  };
  const live = () => { if (sel().length && sel().some(s => { const i = VX.firstStyled(s); const c = i && (GS.target === 'stroke' ? i.strokeColor : i.fillColor); return c?.gradient; })) G.applyGradient(); };
  render(); return wrap;
}
// on-canvas gradient tool: drag to draw a gradient with the panel's stops; drag end points / stops; dbl-click line adds a stop; Alt+click a stop deletes it.
// Works on "user stops" (the editable stops; OKLab / linear blends store them in data.gradU and expand into dense paper stops).
let gd = null;
const gradItems = () => { const out = []; sel().forEach(s => VX.eachStyled(s, i => { const c = GS.target === 'stroke' ? i.strokeColor : i.fillColor; if (c?.gradient && c.origin && c.destination) out.push(i); })); return out; };
const gcol = i => GS.target === 'stroke' ? i.strokeColor : i.fillColor;
const reStop = (fn) => gradItems().forEach(i => { const c = gcol(i); const us = userStopsOf(i); fn(us); setUserGradient(i, GS.target, us, c.gradient.radial, c.origin.clone(), c.destination.clone()); });
const setEnds = (i, o, d) => { const c = gcol(i); const us = userStopsOf(i); setUserGradient(i, GS.target, us, c.gradient.radial, o, d); };
VX.tools.gradient = {
  options: () => [h('div', { class: 'seg' }, ...[['fill', 'Fill'], ['stroke', 'Stroke']].map(([v, l]) => h('button', { class: GS.target === v ? 'on' : '', onclick: () => { GS.target = v; VX.renderOptions(); VX.drawGuides(); } }, l))), h('div', { class: 'seg' }, ...C.BLENDS.map(([v, l]) => h('button', { class: GS.blend === v ? 'on' : '', 'data-tip': 'Blending space', onclick: () => { VX.f.gradientBlend(v); VX.renderOptions(); } }, l))), h('span', { class: 'muted' }, 'Drag across objects to apply · drag end points or stops · double-click the line to add a stop · Alt+click a stop to remove'), h('button', { class: 'btn sm', onclick: () => VX.f.gradientPresets() }, 'Presets…'), h('button', { class: 'btn sm', onclick: () => VX.showTab('color') }, 'Gradient panel')],
  activate: () => { const it = gradItems()[0]; if (it) G.loadGradientFrom(it); },
  down: (e, dbl) => {
    const z = P.view.zoom; const it = gradItems()[0];
    if (it) { const c = gcol(it); const o = c.origin, d = c.destination; const us = userStopsOf(it);
      const stopHit = us.stops.findIndex(s => o.add(d.subtract(o).multiply(s.o)).getDistance(e.point) < 7 / z);
      if (o.getDistance(e.point) < 7 / z) { gd = { kind: 'origin', it }; return; } if (d.getDistance(e.point) < 7 / z) { gd = { kind: 'dest', it }; return; }
      if (stopHit >= 0) { if (e.modifiers.alt && us.stops.length > 2) { reStop(u => u.stops.splice(stopHit, 1)); G.loadGradientFrom(VX.sel[0]); VX.commit('Delete gradient stop'); VX.drawGuides(); return; } gd = { kind: 'stop', it, k: stopHit }; return; }
      const loc = new P.Path.Line({ from: o, to: d, insert: false }).getNearestLocation(e.point);
      if (dbl && loc && loc.point.getDistance(e.point) < 6 / z) { const t = loc.offset / o.getDistance(d); const s = [...us.stops].sort((a, b) => a.o - b.o); let col = s[0].c, al = s[0].a; for (let k = 0; k < s.length - 1; k++) if (t >= s[k].o && t <= s[k + 1].o) { const f = (t - s[k].o) / Math.max(1e-6, s[k + 1].o - s[k].o); col = C.mix(s[k].c, s[k + 1].c, f, us.blend); al = s[k].a + (s[k + 1].a - s[k].a) * f; } reStop(u => { u.stops.push({ c: col, a: al, o: t }); u.stops.sort((a, b) => a.o - b.o); }); G.loadGradientFrom(VX.sel[0]); VX.commit('Add gradient stop'); VX.drawGuides(); return; }
    }
    if (!sel().length) { const t = VX.hitTop(e.point); if (t) { VX.setSel([t]); if (gradItems().length) { G.loadGradientFrom(t); VX.drawGuides(); return; } } }
    gd = { kind: 'new', a: e.point, b: e.point };
  },
  drag: e => {
    if (!gd) return; const p = e.point;
    if (gd.kind === 'new') { gd.b = p; VX.drawGuides(); return; }
    if (gd.kind === 'origin' || gd.kind === 'dest') gradItems().forEach(i => { const c = gcol(i); setEnds(i, gd.kind === 'origin' ? p : c.origin.clone(), gd.kind === 'dest' ? p : c.destination.clone()); });
    else { const c = gcol(gd.it); const o = c.origin, d = c.destination; const v = d.subtract(o); const t = clamp(p.subtract(o).dot(v) / Math.max(1e-6, v.dot(v)), 0, 1); reStop(u => { if (u.stops[gd.k]) u.stops[gd.k].o = t; }); }
    gd.moved = true; VX.drawGuides();
  },
  up: e => {
    const g = gd; gd = null; if (!g) return;
    if (g.kind === 'new') { if (!sel().length || g.a.getDistance(g.b) < 3) { VX.drawGuides(); return; } sel().forEach(s => VX.eachStyled(s, i => { if (i instanceof P.Raster) return; const radial = e.modifiers.alt || GS.type === 'radial'; setUserGradient(i, GS.target, { stops: GS.stops, blend: GS.blend }, radial, g.a, g.b); if (GS.target === 'stroke' && !i.strokeWidth) i.strokeWidth = 4; })); VX.commit('Gradient'); VX.renderFS(); VX.drawGuides(); return; }
    if (g.moved) { G.loadGradientFrom(VX.sel[0]); VX.commit('Edit gradient'); if (VX.rtab === 'color') VX.renderRight(); }
  },
  guides: (layer, z) => {
    if (gd?.kind === 'new') { new P.Path.Line({ from: gd.a, to: gd.b, strokeColor: '#ffffff', strokeWidth: 3 / z, parent: layer }); new P.Path.Line({ from: gd.a, to: gd.b, strokeColor: '#20232a', strokeWidth: 1 / z, parent: layer }); return; }
    gradItems().slice(0, 4).forEach(i => { const c = gcol(i); const o = c.origin, d = c.destination; new P.Path.Line({ from: o, to: d, strokeColor: '#ffffff', strokeWidth: 3 / z, parent: layer }); new P.Path.Line({ from: o, to: d, strokeColor: '#20232a', strokeWidth: 1 / z, parent: layer }); new P.Path.Circle({ center: o, radius: 5 / z, fillColor: 'white', strokeColor: '#20232a', strokeWidth: 1 / z, parent: layer }); new P.Path.Rectangle({ point: d.subtract(4 / z), size: 8 / z, fillColor: 'white', strokeColor: '#20232a', strokeWidth: 1 / z, parent: layer }); userStopsOf(i).stops.forEach(s => { const p = o.add(d.subtract(o).multiply(s.o)); const dm = new P.Path.RegularPolygon({ center: p, sides: 4, radius: 6 / z, fillColor: stopColor(s), strokeColor: 'white', strokeWidth: 1.5 / z, parent: layer }); dm.rotate(45); }); if (c.gradient.radial) new P.Path.Circle({ center: o, radius: o.getDistance(d), strokeColor: '#ffffff', dashArray: [4 / z, 4 / z], strokeWidth: 1 / z, parent: layer }); });
  },
};
// freeform (mesh-like) gradient: clip group of the shape + blurred radial colour blobs
VX.f.freeformGradient = () => {
  if (!sel().filter(VX.isShape).length) return toast('Select a closed shape');
  return VX.withPreview({ title: 'Freeform gradient', fields: [{ key: 'pal', label: 'Colours', type: 'select', value: 'harmony', options: [{ value: 'harmony', label: 'Harmony of current fill' }, ...Object.keys(PALETTES).map(k => ({ value: k, label: k }))] }, { key: 'n', label: 'Colour points', type: 'range', value: 5, min: 2, max: 16 }, { key: 'spread', label: 'Spread (%)', type: 'range', value: 70, min: 20, max: 150 }, { key: 'seed', label: 'Arrangement', type: 'range', value: 4, min: 1, max: 999 }], label: 'Freeform gradient', apply: v => {
    const rnd = G.rng(v.seed); const out = [];
    sel().filter(VX.isShape).forEach(s => {
      const base = VX.firstStyled(s)?.fillColor; const baseHex = base && !base.gradient ? base.toCSS(true) : (VX.O.fill || '#ff9a00');
      const cols = v.pal === 'harmony' ? C.harmony(baseHex, 'analogous').concat(C.harmony(baseHex, 'triadic')) : PALETTES[v.pal];
      const b = s.bounds; const g = new P.Group({ insert: false }); g.insertAbove(s); const mask = s.clone({ insert: false }); mask.strokeColor = null; g.addChild(mask);
      const bg = new P.Path.Rectangle({ rectangle: b, fillColor: cols[0], insert: false }); g.addChild(bg);
      const R = Math.max(b.width, b.height) * v.spread / 100;
      for (let k = 0; k < v.n; k++) { const c = new P.Point(b.x + rnd() * b.width, b.y + rnd() * b.height); const col = new P.Color(cols[(k + 1) % cols.length]); const t = col.clone(); t.alpha = 0; const blob = new P.Path.Circle({ center: c, radius: R, insert: false }); blob.fillColor = { gradient: { stops: [[col, 0], [t, 1]], radial: true }, origin: c, destination: c.add([R, 0]) }; g.addChild(blob); }
      g.clipped = true; g.name = 'Freeform gradient'; if (s.strokeColor) { const st = s.clone({ insert: false }); st.fillColor = null; g.addChild(st); } s.remove(); out.push(g);
    }); VX.setSel(out); } });
};

// ---------------------------------------------------------------- patterns
const PATTERNS = [['stripes', 'Stripes'], ['dots', 'Dots'], ['grid', 'Grid'], ['checker', 'Checker'], ['diag', 'Diagonal stripes'], ['zigzag', 'Zig zag']];
O.patScale = 16; O.patAngle = 0;
function tileItem(kind, s, fg, bg) {
  const g = new P.Group({ insert: false });
  if (bg) g.addChild(new P.Path.Rectangle({ rectangle: [0, 0, s, s], fillColor: bg, insert: false }));
  const add = it => { it.fillColor = fg; g.addChild(it); };
  if (kind === 'stripes') add(new P.Path.Rectangle({ rectangle: [0, 0, s / 2, s], insert: false }));
  else if (kind === 'diag') add(new P.Path.Rectangle({ rectangle: [0, 0, s / 2, s], insert: false }));
  else if (kind === 'dots') add(new P.Path.Circle({ center: [s / 2, s / 2], radius: s * 0.22, insert: false }));
  else if (kind === 'grid') { add(new P.Path.Rectangle({ rectangle: [0, 0, s, s * 0.1], insert: false })); add(new P.Path.Rectangle({ rectangle: [0, 0, s * 0.1, s], insert: false })); }
  else if (kind === 'checker') { add(new P.Path.Rectangle({ rectangle: [0, 0, s / 2, s / 2], insert: false })); add(new P.Path.Rectangle({ rectangle: [s / 2, s / 2, s / 2, s / 2], insert: false })); }
  else if (kind === 'zigzag') { const z = new P.Path({ segments: [[0, s * 0.35], [s / 2, s * 0.1], [s, s * 0.35], [s, s * 0.6], [s / 2, s * 0.35], [0, s * 0.6]], closed: true, insert: false }); add(z); }
  else { const sw = DOC.swatches.find(x => x.id === kind && x.type === 'pattern'); if (sw) { const it = new P.Group({ insert: false }); it.importJSON(sw.json); const k = s / Math.max(sw.w, sw.h); it.scale(k, new P.Point(0, 0)); it.position = new P.Point(s / 2 * sw.w / Math.max(sw.w, sw.h) + (s - s * sw.w / Math.max(sw.w, sw.h)) / 2, s / 2 * sw.h / Math.max(sw.w, sw.h) + (s - s * sw.h / Math.max(sw.w, sw.h)) / 2); g.addChild(it); } }
  return g;
}
// generated patterns (Pattern maker): grid / brick by row / brick by column / hex tiling of the swatch artwork with spacing
const TILE_TYPES = [['grid', 'Grid'], ['brick', 'Brick by row'], ['brickCol', 'Brick by column'], ['hex', 'Hex']];
G.TILE_TYPES = TILE_TYPES;
function layoutTiles(g, L, sw, mask) {
  const b = mask.bounds; const lay = sw.layout; const k = Math.max(2, L.scale) / Math.max(1e-6, sw.aw, sw.ah);
  const aw = sw.aw * k, ah = sw.ah * k; const sx = Math.max(1, aw + (lay.gx || 0) * k); let sy = Math.max(1, ah + (lay.gy || 0) * k); if (lay.tile === 'hex') sy = Math.max(1, sy * 0.866);
  const diag = Math.hypot(b.width, b.height); let nx = Math.ceil(diag / sx) + 3, ny = Math.ceil(diag / sy) + 3; const cap = 2500; if (nx * ny > cap) { const f = Math.sqrt(nx * ny / cap); nx = Math.ceil(nx / f); ny = Math.ceil(ny / f); }
  const art = new P.Group({ insert: false }); art.importJSON(sw.json); art.scale(k, new P.Point(0, 0));
  const c0 = b.center; const flat = new P.Group({ insert: false }); const off = (lay.offset ?? 50) / 100;
  if (L.bg) flat.addChild(new P.Path.Rectangle({ rectangle: b.expand(diag), fillColor: L.bg, insert: false }));
  for (let r = -Math.floor(ny / 2); r <= Math.ceil(ny / 2); r++) for (let c = -Math.floor(nx / 2); c <= Math.ceil(nx / 2); c++) {
    let x = c * sx, y = r * sy; if (lay.tile === 'brick') x += (Math.abs(r) % 2) * sx * off; else if (lay.tile === 'hex') x += (Math.abs(r) % 2) * sx * 0.5; else if (lay.tile === 'brickCol') y += (Math.abs(c) % 2) * sy * off;
    const cl = art.clone({ insert: false }); cl.position = c0.add([x, y]); flat.addChild(cl); }
  if (L.angle) flat.rotate(L.angle, c0);
  g.addChild(flat); if (L.stroke) { const st = mask.clone({ insert: false }); st.clipMask = false; st.fillColor = null; st.strokeColor = L.stroke; st.strokeWidth = L.sw || 1; g.addChild(st); }
  g.clipped = true; return g;
}
function regenPattern(g) {
  const L = g.data.live; const mask = g.children[0]; g.children.slice(1).forEach(c => c.remove());
  const csw = DOC.swatches.find(x => x.id === L.pid && x.type === 'pattern'); if (csw?.layout) return layoutTiles(g, L, csw, mask);
  const b = mask.bounds; const s = Math.max(2, L.scale); const diag = Math.hypot(b.width, b.height); let n = Math.ceil(diag / s) + 2; let step = s;
  if (n * n > 4000) { step = diag / 62; n = 64; }
  const tile = tileItem(L.pid, step, L.fg, L.bg); const c = b.center; const start = c.subtract([n * step / 2, n * step / 2]);
  const flat = new P.Group({ insert: false }); for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) { const cl = tile.clone({ insert: false }); cl.translate(start.add([k * step, r * step])); flat.addChild(cl); }
  const ang = (L.angle || 0) + (L.pid === 'diag' ? 45 : 0); if (ang) flat.rotate(ang, c);
  g.addChild(flat); if (L.stroke) { const st = mask.clone({ insert: false }); st.clipMask = false; st.fillColor = null; st.strokeColor = L.stroke; st.strokeWidth = L.sw || 1; g.addChild(st); }
  g.clipped = true; return g;
}
VX.live.pattern = { name: 'Pattern fill', styleTargets: () => [], describe: g => 'Pattern: ' + ((PATTERNS.find(p => p[0] === g.data.live.pid) || [0, 'Custom'])[1]), edit: g => { VX.setSel([g]); const L = g.data.live; return VX.withPreview({ title: 'Pattern options', fields: [{ key: 'scale', label: 'Tile size (px)', type: 'range', value: L.scale, min: 2, max: 400 }, { key: 'angle', label: 'Angle (°)', type: 'range', value: L.angle, min: -180, max: 180 }, { key: 'fg', label: 'Foreground', type: 'color', value: L.fg || '#000000' }, { key: 'bg', label: 'Background', type: 'color', value: L.bg || '#ffffff' }, { key: 'nobg', label: 'Transparent background', type: 'checkbox', value: !L.bg }], label: 'Pattern options', apply: v => { const gg = sel()[0]; Object.assign(gg.data.live, { scale: v.scale, angle: v.angle, fg: v.fg, bg: v.nobg ? null : v.bg }); regenPattern(gg); } }); }, expand: g => { delete g.data.live; g.name = 'Pattern (expanded)'; return [g]; } };
G.applyPattern = (pid, opts = {}) => {
  const items = sel().filter(i => VX.isShape(i) || i.data?.live?.kind === 'pattern'); if (!items.length) return toast('Select closed shapes to fill with a pattern');
  const csw = DOC.swatches.find(x => x.id === pid && x.type === 'pattern'); if (csw?.layout) { if (opts.bg === undefined) opts.bg = csw.bg ?? null; if (opts.scale === undefined) opts.scale = csw.size; }
  const fg = opts.fg || (VX.O.stroke && VX.O.stroke !== '#ffffff' ? VX.O.stroke : '#1d1f24'), bg = opts.bg !== undefined ? opts.bg : (VX.O.fill && VX.O.fill !== VX.O.stroke ? VX.O.fill : '#ffffff');
  const out = items.map(it => { if (it.data?.live?.kind === 'pattern') { Object.assign(it.data.live, { pid }, csw?.layout ? { bg, scale: opts.scale } : {}); return regenPattern(it); } const g = new P.Group({ insert: false }); g.insertAbove(it); const mask = it.clone({ insert: false }); g.addChild(mask); g.data.live = { kind: 'pattern', pid, scale: opts.scale || O.patScale, angle: O.patAngle, fg, bg, stroke: it.strokeColor ? it.strokeColor.toCSS(true) : null, sw: it.strokeWidth }; g.name = 'Pattern fill'; it.remove(); return regenPattern(g); });
  VX.setSel(out); if (!opts.noCommit) VX.commit('Pattern fill'); return out;
};
VX.f.patternFromSel = async () => { if (!sel().length) return toast('Select artwork to turn into a pattern tile'); const name = await UI.prompt('New pattern swatch', 'Name', 'Pattern ' + (DOC.swatches.filter(x => x.type === 'pattern').length + 1)); if (!name) return; const g = new P.Group({ insert: false }); sel().forEach(i => g.addChild(i.clone({ insert: false }))); const b = g.bounds; g.translate(b.topLeft.multiply(-1)); const pad = Math.max(b.width, b.height) * 0.15; const sw = { id: 'pat' + Date.now().toString(36), name, type: 'pattern', json: g.exportJSON({ asString: false }), w: b.width + pad, h: b.height + pad }; DOC.swatches.push(sw); VX.commit('New pattern swatch'); VX.showTab('color'); toast('Pattern swatch “' + name + '” added'); return sw; };

// Pattern maker: generate a pattern swatch from the selection with a tile type and spacing (live preview on a sample swatch rectangle)
VX.f.patternMaker = () => {
  if (!sel().length) return toast('Select the artwork to turn into a pattern');
  const b0 = VX.selBounds(); const id = 'pat' + Date.now().toString(36); const n = DOC.swatches.filter(x => x.type === 'pattern').length + 1;
  return VX.withPreview({ title: 'Pattern maker', label: 'Pattern maker', width: 420, fields: [{ key: 'name', label: 'Swatch name', type: 'text', value: 'Pattern ' + n }, { key: 'tile', label: 'Tile type', type: 'select', value: 'grid', options: TILE_TYPES.map(([v, l]) => ({ value: v, label: l })) }, { key: 'gx', label: 'Horizontal spacing (px)', type: 'range', value: Math.round(b0.width * 0.2), min: -200, max: 600 }, { key: 'gy', label: 'Vertical spacing (px)', type: 'range', value: Math.round(b0.height * 0.2), min: -200, max: 600 }, { key: 'offset', label: 'Brick offset (%)', type: 'range', value: 50, min: 0, max: 100 }, { key: 'size', label: 'Artwork size in the pattern (px)', type: 'range', value: Math.round(clamp(Math.max(b0.width, b0.height), 8, 200)), min: 4, max: 600 }, { key: 'bg', label: 'Background colour', type: 'color', value: '#ffffff' }, { key: 'nobg', label: 'Transparent background', type: 'checkbox', value: true }, { key: 'sample', label: 'Add a sample rectangle filled with the pattern', type: 'checkbox', value: true }],
    apply: (v, { final } = {}) => {
      const items = sel(); const g = new P.Group({ insert: false }); items.forEach(i => g.addChild(i.clone({ insert: false }))); const b = g.bounds; g.translate(b.topLeft.multiply(-1));
      const sw = { id, name: v.name || ('Pattern ' + n), type: 'pattern', json: g.exportJSON({ asString: false }), w: b.width * 1.15, h: b.height * 1.15, aw: b.width, ah: b.height, size: v.size, bg: v.nobg ? null : v.bg, layout: { tile: v.tile, gx: v.gx, gy: v.gy, offset: v.offset } };
      DOC.swatches = DOC.swatches.filter(x => x.id !== id); DOC.swatches.push(sw);
      if (final && !v.sample) return;
      const side = Math.max(260, v.size * 3.5); const rr = new P.Path.Rectangle({ rectangle: [b0.right + 40, b0.top, side, side], fillColor: '#ffffff' }); (VX.iso || VX.project.activeLayer).addChild(rr); const keepSel = [...items]; VX.setSel([rr]);
      const out = G.applyPattern(id, { noCommit: true }); if (out?.[0]) { out[0].name = 'Pattern sample — ' + sw.name; if (!final && !P.view.bounds.contains(out[0].bounds)) VX.fitRect(b0.unite(out[0].bounds), 160); } VX.setSel(final ? out : keepSel);
    },
    onDone: () => { toast('Pattern swatch added to Color › Pattern swatches'); } });
};
// ---------------------------------------------------------------- swatches (global swatches update linked objects)
G.updateGlobalSwatch = (sw, color) => { sw.color = color; VX.allLayers().forEach(L => L.getItems({ recursive: true, match: i => i.data?.gsw && (i.data.gsw.fill === sw.id || i.data.gsw.stroke === sw.id) }).forEach(i => { if (i.data.gsw.fill === sw.id) i.fillColor = color; if (i.data.gsw.stroke === sw.id) i.strokeColor = color; })); };
async function editSwatch(sw) { const r = await VX.f.colorDialog(sw.color, `Edit swatch — ${sw.name}${sw.global ? ' (global)' : ''}`); if (r == null) return; if (sw.global) G.updateGlobalSwatch(sw, r); else sw.color = r; sw.name = r === sw.name ? r : sw.name; VX.commit('Edit swatch'); VX.renderRight(); }
function swatchMenu(e, sw) { UI.contextMenu(e, [{ label: 'Edit colour…', action: () => editSwatch(sw) }, { label: sw.global ? 'Make local (unlink)' : 'Make global (linked)', action: () => { sw.global = !sw.global; VX.commit('Swatch type'); VX.renderRight(); } }, { label: 'Rename…', action: async () => { const n = await UI.prompt('Rename swatch', 'Name', sw.name); if (n) { sw.name = n; VX.commit('Rename swatch'); VX.renderRight(); } } }, { label: 'Select objects using it', action: () => VX.setSel(VX.selectableItems().filter(i => { const s = VX.firstStyled(i); return s && ((s.fillColor && !s.fillColor.gradient && s.fillColor.toCSS(true) === C.norm(sw.color)) || s.data?.gsw?.fill === sw.id); })) }, '-', { label: 'Delete swatch', action: () => { DOC.swatches = DOC.swatches.filter(x => x !== sw); VX.commit('Delete swatch'); VX.renderRight(); } }]); }
VX.f.addSwatch = (color, global = false, name) => { const sw = { id: 'sw' + Date.now().toString(36) + (swId++), name: name || color, color, global }; DOC.swatches.push(sw); VX.commit('New swatch'); VX.renderRight(); return sw; };
G.docColors = (items) => { const set = new Map(); const add = c => { if (!c) return; if (c.gradient) { c.gradient.stops.forEach(s => add(s.color)); return; } const k = new P.Color(c.red, c.green, c.blue).toCSS(true); set.set(k, (set.get(k) || 0) + 1); }; const walk = it => { if (it instanceof P.Group || it instanceof P.Layer) { if (it.data?.live?.kind === 'fx') { walk(it.children[1] || it.children[0]); return; } const LV = it.data?.live && VX.live[it.data.live.kind]; if (LV?.recolorTargets) { LV.recolorTargets(it).forEach(walk); return; } it.children.forEach(walk); return; } if (it instanceof P.Raster) return; add(it.fillColor); add(it.strokeColor); }; (items || VX.selectableItems()).forEach(walk); return [...set.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]); };

// ---------------------------------------------------------------- Color tab
VX.tabs.color = rp => {
  const sec = VX.sec; const s0 = sel()[0]; if (s0) G.loadGradientFrom(s0);
  const front = O.front; const cur = (() => { const c = s0 ? (front === 'fill' ? VX.firstStyled(s0)?.fillColor : VX.firstStyled(s0)?.strokeColor) : null; return c && !c.gradient ? c.toCSS(true) : (front === 'fill' ? O.fill : O.stroke) || '#000000'; })();
  const cp = VX.colorPicker(cur, hex => VX.applyColor(hex, O.front, { debounce: true, keepPanel: true }));
  const tgt = h('div', { class: 'seg' }, ...[['fill', 'Fill'], ['stroke', 'Stroke']].map(([v, l]) => h('button', { class: O.front === v ? 'on' : '', onclick: () => { O.front = v; VX.renderFS(); VX.renderRight(); } }, l)), h('button', { onclick: () => VX.applyColor(null) }, 'None'));
  rp.append(sec('Colour', h('div', { class: 'row', style: { marginBottom: '8px' } }, tgt), cp));
  const grid = h('div', { class: 'swgrid' });
  DOC.swatches.filter(x => !x.type).forEach(sw => grid.append(h('div', { class: 's' + (sw.global ? ' global' : ''), title: sw.name + (sw.global ? ' (global)' : ''), style: { background: sw.color }, onclick: () => VX.applyColor(sw.color, O.front, { swatch: sw.global ? sw.id : null }), ondblclick: () => editSwatch(sw), oncontextmenu: e => swatchMenu(e, sw) })));
  rp.append(sec('Swatches', grid, h('div', { class: 'row', style: { gap: '4px', marginTop: '8px', flexWrap: 'wrap' } }, h('button', { class: 'btn sm', onclick: () => VX.f.addSwatch(cp.get()) }, '+ Swatch'), h('button', { class: 'btn sm', onclick: () => VX.f.addSwatch(cp.get(), true, 'Global ' + cp.get()) }, '+ Global'), h('button', { class: 'btn sm', onclick: () => { const cols = G.docColors(sel().length ? sel() : null); cols.forEach(c => { if (!DOC.swatches.some(x => C.norm(x.color) === c)) DOC.swatches.push({ id: 'sw' + (swId++) + Date.now().toString(36), name: c, color: c, global: false }); }); VX.commit('Add used colours'); VX.renderRight(); } }, 'Add used colours')), h('div', { class: 'muted', style: { fontSize: '11px', marginTop: '6px' } }, 'Click to apply · double-click to edit · right-click for options. Editing a global swatch (corner mark) recolours every object using it.')));
  const base = C.norm(cp.get()) || '#ff9a00';
  const palRow = (name, cols) => h('div', { class: 'palrow' }, h('span', { class: 'nm' }, name), h('div', { class: 'chips' }, ...cols.map(c => h('div', { style: { background: c }, title: c, onclick: e => { e.stopPropagation(); VX.applyColor(c); } }))), h('button', { class: 'btn sm', 'data-tip': 'Add to swatches', onclick: () => { cols.forEach(c => DOC.swatches.push({ id: 'sw' + (swId++) + Date.now().toString(36), name: name + ' ' + c, color: c, global: false })); VX.commit('Add palette'); VX.renderRight(); } }, '+'));
  rp.append(sec('Colour themes', ...C.HARMONIES.map(([k, l]) => palRow(l.replace('Split complementary', 'Split compl.'), C.harmony(base, k)))));
  rp.append(sec('Libraries', ...Object.entries(PALETTES).map(([k, v]) => palRow(k, v))));
  rp.append(sec('Gradient', gradientEditor(), h('div', { class: 'muted', style: { fontSize: '10.5px', letterSpacing: '.6px', textTransform: 'uppercase', margin: '12px 0 6px' } }, `Presets (${G.GRADIENT_PRESETS.length})`), presetGrid(n => { G.applyPreset(n); VX.renderRight(); })));
  const pscale = h('input', { type: 'number', value: O.patScale, min: 2, max: 400, style: { width: '60px' } }); pscale.onchange = () => { O.patScale = +pscale.value; };
  const pang = h('input', { type: 'number', value: O.patAngle, style: { width: '60px' } }); pang.onchange = () => { O.patAngle = +pang.value; };
  const pats = [...PATTERNS, ...DOC.swatches.filter(x => x.type === 'pattern').map(x => [x.id, x.name])];
  rp.append(sec('Pattern swatches', h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px' } }, ...pats.map(([k, l]) => h('button', { class: 'btn sm', onclick: () => G.applyPattern(k) }, l))), h('div', { class: 'row', style: { marginTop: '8px', gap: '6px', flexWrap: 'wrap' } }, h('span', { class: 'muted' }, 'Tile'), pscale, h('span', { class: 'muted' }, 'Angle'), pang, h('button', { class: 'btn sm', onclick: VX.f.patternFromSel }, 'New from selection')), h('div', { class: 'muted', style: { fontSize: '11px', marginTop: '6px' } }, 'Uses the stroke colour as the foreground and fill as the background. Double-click a pattern-filled object to edit it.')));
  rp.append(sec('Recolor', h('div', { class: 'row', style: { gap: '4px', flexWrap: 'wrap' } }, h('button', { class: 'btn sm primary', onclick: VX.F('recolor') }, 'Recolor artwork…'), h('button', { class: 'btn sm', onclick: VX.F('adjustColors', 'invert') }, 'Invert'), h('button', { class: 'btn sm', onclick: VX.F('adjustColors', 'gray') }, 'Grayscale'), h('button', { class: 'btn sm', onclick: VX.F('adjustColors', 'blendFB') }, 'Blend front→back'))));
};

// ---------------------------------------------------------------- recolor artwork
G.recolorItems = (items, map) => { const conv = c => { if (!c) return c; if (c.gradient) { return { gradient: { stops: c.gradient.stops.map((s, k, A) => [conv(s.color), s.offset ?? (A.length > 1 ? k / (A.length - 1) : 0)]), radial: c.gradient.radial }, origin: c.origin, destination: c.destination }; } const k = new P.Color(c.red, c.green, c.blue).toCSS(true); if (!map[k]) return c; const n = new P.Color(map[k]); n.alpha = c.alpha; return n; }; const walk = it => { if (it instanceof P.Group || it instanceof P.Layer || it instanceof P.CompoundPath && false) { if (it.data?.live?.kind === 'pattern') { const L = it.data.live; if (L.fg && map[C.norm(L.fg)]) L.fg = map[C.norm(L.fg)]; if (L.bg && map[C.norm(L.bg)]) L.bg = map[C.norm(L.bg)]; regenPattern(it); return; } const LV = it.data?.live && VX.live[it.data.live.kind]; if (LV?.recolorTargets) { LV.recolorTargets(it).forEach(walk); LV.regen?.(it); return; } it.children.forEach(walk); return; } if (it instanceof P.Raster) return; if (it.fillColor) it.fillColor = conv(it.fillColor); if (it.strokeColor) it.strokeColor = conv(it.strokeColor); const gu = it.data?.gradU; if (gu) Object.values(gu).forEach(u => u.stops.forEach(st => { const k = C.norm(st.c); if (map[k]) st.c = map[k]; })); }; items.forEach(walk); };
G.harmonyMap = (orig, rule, base, { keepNeutrals = true, keepLight = true } = {}) => {
  const hs = C.harmony(base, rule); const hues = hs.map(x => C.hexHsb(x)); const map = {};
  const chroma = orig.filter(c => !keepNeutrals || C.hexHsb(c)[1] > 8); const sorted = [...chroma].sort((a, b) => C.hexHsb(a)[0] - C.hexHsb(b)[0]);
  sorted.forEach((c, i) => { const [, s, b] = C.hexHsb(c); const t = hues[Math.floor(i * hues.length / Math.max(1, sorted.length)) % hues.length]; map[c] = keepLight ? C.hsbHex(t[0], rule === 'monochrome' ? t[1] : Math.max(s, t[1] * 0.6), rule === 'monochrome' ? t[2] * 0.4 + b * 0.6 : b) : C.hsbHex(t[0], t[1], t[2]); });
  return map;
};
VX.f.recolor = async () => {
  const items = sel().length ? [...sel()] : VX.selectableItems(); if (!items.length) return toast('Nothing to recolor');
  const orig = G.docColors(items).slice(0, 48); if (!orig.length) return toast('No colours found');
  VX.flushCommit(); const S = VX.snapshot(); const keys = VX.selKeys(); const scope = sel().length ? 'sel' : 'doc';
  let map = Object.fromEntries(orig.map(c => [c, c]));
  const rows = h('div', { style: { maxHeight: '300px', overflow: 'auto', paddingRight: '4px' } });
  const base = h('input', { type: 'color', value: orig.find(c => C.hexHsb(c)[1] > 8) || orig[0] });
  const rule = h('select', {}, h('option', { value: '' }, 'Harmony rule…'), ...C.HARMONIES.map(([k, l]) => h('option', { value: k }, l)));
  const lib = h('select', {}, h('option', { value: '' }, 'Map to library…'), ...Object.keys(PALETTES).map(k => h('option', { value: k }, k)));
  const neutrals = h('input', { type: 'checkbox', checked: true }), light = h('input', { type: 'checkbox', checked: true });
  let tmr = null; const preview = () => { clearTimeout(tmr); tmr = setTimeout(() => { VX.restore(S); const its = scope === 'sel' ? VX.resolveKeys(keys) : VX.selectableItems(); G.recolorItems(its, map); if (scope === 'sel') VX.setSel(its); P.view.update(); }, 40); };
  const draw = () => { rows.innerHTML = ''; orig.forEach(c => { const inp = h('input', { type: 'color', value: map[c] }); inp.oninput = () => { map[c] = inp.value; preview(); }; rows.append(h('div', { class: 'rc-row' }, h('div', { class: 'c', style: { background: c }, title: c }), h('span', { class: 'muted' }, '→'), inp, h('span', { class: 'muted', style: { fontSize: '11px' } }, c + (map[c] !== c ? ' → ' + map[c] : '')))); }); };
  const applyRule = () => { if (!rule.value) return; map = { ...Object.fromEntries(orig.map(c => [c, c])), ...G.harmonyMap(orig, rule.value, base.value, { keepNeutrals: neutrals.checked, keepLight: light.checked }) }; draw(); preview(); };
  rule.onchange = applyRule; base.oninput = applyRule;
  lib.onchange = () => { const pal = PALETTES[lib.value]; if (!pal) return; const sorted = [...orig].sort((a, b) => C.hexHsb(a)[2] - C.hexHsb(b)[2]); const ps = [...pal].sort((a, b) => C.hexHsb(a)[2] - C.hexHsb(b)[2]); sorted.forEach((c, i) => { if (neutrals.checked && C.hexHsb(c)[1] <= 8) return; map[c] = ps[Math.round(i * (ps.length - 1) / Math.max(1, sorted.length - 1))]; }); draw(); preview(); };
  const shuffle = () => { const keysC = orig.filter(c => !neutrals.checked || C.hexHsb(c)[1] > 8); const vals = keysC.map(c => map[c]); for (let i = vals.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [vals[i], vals[j]] = [vals[j], vals[i]]; } keysC.forEach((c, i) => map[c] = vals[i]); draw(); preview(); };
  const generate = () => { const rules = C.HARMONIES.map(x => x[0]); const r = rules[Math.floor(Math.random() * rules.length)]; const b = C.hsbHex(Math.random() * 360, 45 + Math.random() * 50, 55 + Math.random() * 40); base.value = b; rule.value = r; applyRule(); };
  draw();
  const body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    h('div', { class: 'muted' }, `${orig.length} colour(s) in ${scope === 'sel' ? 'the selection' : 'the document'} — edit any colour, or remap all at once:`),
    h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } }, base, rule, lib),
    h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } }, h('button', { class: 'btn sm', onclick: shuffle }, '⤨ Shuffle colours'), h('button', { class: 'btn sm', onclick: generate }, '✦ Generate palette'), h('button', { class: 'btn sm', onclick: () => { map = Object.fromEntries(orig.map(c => [c, c])); rule.value = ''; lib.value = ''; draw(); preview(); } }, 'Reset')),
    h('div', { class: 'row', style: { gap: '14px' } }, h('label', { class: 'row', style: { color: 'var(--tx-1)' } }, neutrals, 'Keep black, white & grays'), h('label', { class: 'row', style: { color: 'var(--tx-1)' } }, light, 'Preserve lightness')), rows);
  const pr = modal({ title: 'Recolor artwork', body, width: 460, buttons: [{ label: 'Cancel', value: null }, { label: 'Apply', primary: true, value: 'ok' }] }); VX.lightenModal();
  VX._recolor = { map: () => map, setMap: m => { map = m; draw(); preview(); }, applyRule: (r, b) => { rule.value = r; if (b) base.value = b; applyRule(); }, shuffle, generate };
  const r = await pr; clearTimeout(tmr); VX._recolor = null;
  VX.restore(S); if (r !== 'ok') { if (scope === 'sel') VX.setSel(VX.resolveKeys(keys)); return null; }
  const its = scope === 'sel' ? VX.resolveKeys(keys) : VX.selectableItems(); G.recolorItems(its, map); if (scope === 'sel') VX.setSel(its); VX.commit('Recolor artwork'); return map;
};
VX.f.adjustColors = async kind => {
  const items = sel(); if (!items.length) return toast('Select objects');
  if (kind === 'saturate') return VX.withPreview({ title: 'Saturate', fields: [{ key: 'k', label: 'Intensity (%)', type: 'range', value: 20, min: -100, max: 100 }], label: 'Saturate', apply: v => { const cols = G.docColors(sel()); const map = Object.fromEntries(cols.map(c => { const [hh, s, b] = C.hexHsb(c); return [c, C.hsbHex(hh, s * (1 + v.k / 100), b)]; })); G.recolorItems(sel(), map); } });
  if (kind === 'blendFB') { const s = [...items].sort((a, b) => a.index - b.index); if (s.length < 3) return toast('Select three or more objects'); const f0 = VX.firstStyled(s[0])?.fillColor, f1 = VX.firstStyled(s[s.length - 1])?.fillColor; if (!f0 || !f1 || f0.gradient || f1.gradient) return toast('Front and back objects need solid fills'); s.forEach((it, k) => VX.eachStyled(it, i => { i.fillColor = G.lerpColor(f0, f1, k / (s.length - 1)); })); VX.commit('Blend colors'); return; }
  const cols = G.docColors(items); const map = Object.fromEntries(cols.map(c => { const [r, g, b] = C.hexToRgb(c); if (kind === 'invert') return [c, C.rgbToHex(255 - r, 255 - g, 255 - b)]; const y = 0.299 * r + 0.587 * g + 0.114 * b; return [c, C.rgbToHex(y, y, y)]; }));
  G.recolorItems(items, map); VX.commit(kind === 'invert' ? 'Invert colors' : 'Grayscale'); VX.renderRight();
};
})();
