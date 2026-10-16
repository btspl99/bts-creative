// BTS Vector — Image Trace: bitmap → editable vector paths using imagetracerjs (public domain / Unlicense).
(() => {
const { P, G } = VX; const { h, toast, modal, clamp } = UI;
const sel = () => VX.sel;
const PRESETS = VX.TRACE_PRESETS = {
  'Black & white logo': { mode: 'bw', threshold: 128, colors: 2, paths: 70, corners: 70, noise: 8, blur: 0, ignoreWhite: true },
  'Sketched art': { mode: 'bw', threshold: 170, colors: 2, paths: 55, corners: 30, noise: 4, blur: 1, ignoreWhite: true },
  '3 colours': { mode: 'color', threshold: 128, colors: 3, paths: 60, corners: 50, noise: 10, blur: 0, ignoreWhite: false },
  '6 colours': { mode: 'color', threshold: 128, colors: 6, paths: 65, corners: 50, noise: 8, blur: 0, ignoreWhite: false },
  '16 colours': { mode: 'color', threshold: 128, colors: 16, paths: 75, corners: 50, noise: 6, blur: 0, ignoreWhite: false },
  'Grayscale': { mode: 'gray', threshold: 128, colors: 8, paths: 65, corners: 40, noise: 8, blur: 0, ignoreWhite: false },
  'Silhouette': { mode: 'bw', threshold: 230, colors: 2, paths: 50, corners: 40, noise: 20, blur: 1, ignoreWhite: true },
};
function sourceCanvas(ras, maxDim) {
  const src = ras.canvas || ras.image; const w = ras.width, hh = ras.height; const k = Math.min(1, maxDim / Math.max(w, hh));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(hh * k)); const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(src, 0, 0, c.width, c.height); return { c, k };
}
function preprocess(id, o) {
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255; const r = d[i] * a + 255 * (1 - a), g = d[i + 1] * a + 255 * (1 - a), b = d[i + 2] * a + 255 * (1 - a); d[i + 3] = 255;
    if (o.mode === 'bw') { const y = 0.299 * r + 0.587 * g + 0.114 * b; const v = y < o.threshold ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; }
    else if (o.mode === 'gray') { const y = 0.299 * r + 0.587 * g + 0.114 * b; d[i] = d[i + 1] = d[i + 2] = y; }
    else { d[i] = r; d[i + 1] = g; d[i + 2] = b; }
  }
  return id;
}
function tracerOptions(o) {
  const fid = 3.2 - (o.paths / 100) * 3.1; // paths (fidelity) → line/spline error thresholds
  const c = o.corners / 100;
  const opts = { ltres: Math.max(0.05, fid * (1.15 - c * 0.9)), qtres: Math.max(0.05, fid * (0.25 + c * 0.9)), pathomit: Math.round(o.noise), rightangleenhance: c > 0.5, colorsampling: o.mode === 'color' ? 2 : 0, numberofcolors: o.mode === 'bw' ? 2 : clamp(Math.round(o.colors), 2, 64), mincolorratio: 0, colorquantcycles: o.mode === 'color' ? 3 : 1, layering: 0, strokewidth: o.mode === 'bw' ? 0 : 1, linefilter: o.paths < 40, scale: 1, roundcoords: 2, viewbox: false, desc: false, lcpr: 0, qcpr: 0, blurradius: Math.round(o.blur), blurdelta: 20 };
  if (o.mode === 'bw') opts.pal = [{ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }];
  if (o.mode === 'gray') { const n = opts.numberofcolors; opts.pal = Array.from({ length: n }, (_, k) => { const v = Math.round(k * 255 / (n - 1)); return { r: v, g: v, b: v, a: 255 }; }); }
  return opts;
}
const isWhite = s => { const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(s); return m && +m[1] > 245 && +m[2] > 245 && +m[3] > 245; };
G.traceSVG = (ras, o) => {
  const { c, k } = sourceCanvas(ras, o.res || 900); const id = preprocess(c.getContext('2d').getImageData(0, 0, c.width, c.height), o);
  const opts = tracerOptions(o); const td = ImageTracer.imagedataToTracedata(id, opts);
  let svg = ImageTracer.getsvgstring(td, opts);
  if (o.ignoreWhite) svg = svg.replace(/<path[^>]*fill="(rgb\([^)]*\))"[^>]*\/>/g, (m, f) => isWhite(f) ? '' : m);
  if (o.mode === 'bw' && o.silhouette) svg = svg.replace(/fill="rgb\(0,0,0\)"/g, 'fill="rgb(0,0,0)"');
  const paths = (svg.match(/<path/g) || []).length; const colors = new Set((svg.match(/fill="rgb\([^)]*\)"/g) || [])).size;
  return { svg, w: c.width, h: c.height, k, paths, colors };
};
// trace a raster into a group of editable paths placed over the image
G.traceRaster = (ras, o) => {
  const r = G.traceSVG(ras, o); const g = new P.Group({ insert: false }); const imp = g.importSVG(r.svg, { expandShapes: true });
  const kids = []; imp.getItems({ match: i => i instanceof P.Path || i instanceof P.CompoundPath }).forEach(p => { if (p.parent instanceof P.CompoundPath) return; kids.push(p); });
  const out = new P.Group({ insert: false }); kids.forEach(p => { p.remove(); if (o.mode !== 'bw' && o.gapFill === false) { p.strokeColor = null; } if (o.mode === 'bw' || !p.strokeWidth) p.strokeColor = null; out.addChild(p); });
  const b = ras.bounds; out.scale(b.width / r.w, b.height / r.h, new P.Point(0, 0)); out.translate(b.topLeft);
  out.name = 'Image trace'; out.data.trace = { preset: o.preset || 'custom', paths: kids.length, colors: r.colors };
  out.insertAbove(ras); return { group: out, info: r };
};
VX.f.trace = async preset => {
  let ras = sel().find(i => i instanceof P.Raster);
  if (!ras) { const all = VX.selectableItems().filter(i => i instanceof P.Raster); if (all.length === 1) { ras = all[0]; VX.setSel([ras]); } }
  if (!ras) { toast('Select a placed image to trace (File › Place image…)'); return null; }
  if (!window.ImageTracer) { toast('Image trace engine not loaded', 'err'); return null; }
  const o = { preset: preset && PRESETS[preset] ? preset : 'Black & white logo', res: 900, keep: false, ...PRESETS[preset && PRESETS[preset] ? preset : 'Black & white logo'] };
  const prevImg = h('img'), srcImg = h('img', { src: (() => { try { return ras.toDataURL(); } catch { return ''; } })() }); const info = h('div', { class: 'muted', style: { fontSize: '11.5px' } }, 'Tracing…');
  const ctl = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
  const presetSel = h('select', {}, ...Object.keys(PRESETS).map(k => h('option', { value: k, selected: k === o.preset }, k)), h('option', { value: 'custom' }, 'Custom'));
  const field = (key, label, min, max, step = 1, show = () => true) => { const rng = h('input', { type: 'range', min, max, step, value: o[key] }), nb = h('input', { type: 'number', min, max, step, value: o[key], style: { width: '64px' } }); rng.oninput = () => { nb.value = rng.value; o[key] = +rng.value; presetSel.value = 'custom'; schedule(); }; nb.oninput = () => { rng.value = nb.value; o[key] = +nb.value; presetSel.value = 'custom'; schedule(); }; const row = h('label', { class: 'field' }, label, h('div', { class: 'row' }, rng, nb)); row.sync = () => { rng.value = nb.value = o[key]; row.style.display = show() ? '' : 'none'; }; return row; };
  const mode = h('select', {}, ...[['bw', 'Black and white'], ['gray', 'Grayscale'], ['color', 'Colour']].map(([v, l]) => h('option', { value: v, selected: o.mode === v }, l)));
  const fThr = field('threshold', 'Threshold', 0, 255, 1, () => o.mode === 'bw'), fCol = field('colors', 'Colours / grays', 2, 64, 1, () => o.mode !== 'bw'), fPaths = field('paths', 'Paths (fidelity)', 0, 100), fCorners = field('corners', 'Corners', 0, 100), fNoise = field('noise', 'Noise (ignore areas smaller than px)', 0, 100), fBlur = field('blur', 'Smoothing (blur)', 0, 5), fRes = field('res', 'Resolution (max px)', 200, 2000, 50);
  const ign = h('input', { type: 'checkbox', checked: o.ignoreWhite }); ign.onchange = () => { o.ignoreWhite = ign.checked; presetSel.value = 'custom'; schedule(); };
  const keep = h('input', { type: 'checkbox', checked: false }); keep.onchange = () => { o.keep = keep.checked; };
  const rows = [fThr, fCol, fPaths, fCorners, fNoise, fBlur, fRes];
  const syncAll = () => { mode.value = o.mode; ign.checked = o.ignoreWhite; rows.forEach(r => r.sync()); };
  presetSel.onchange = () => { if (PRESETS[presetSel.value]) { Object.assign(o, PRESETS[presetSel.value], { preset: presetSel.value }); syncAll(); schedule(); } };
  mode.onchange = () => { o.mode = mode.value; presetSel.value = 'custom'; syncAll(); schedule(); };
  ctl.append(h('label', { class: 'field' }, 'Preset', presetSel), h('label', { class: 'field' }, 'Mode', mode), ...rows, h('label', { class: 'row', style: { color: 'var(--tx-1)' } }, ign, 'Ignore white'), h('label', { class: 'row', style: { color: 'var(--tx-1)' } }, keep, 'Keep the original image underneath'));
  let tmr = null, url = null; const schedule = () => { clearTimeout(tmr); info.textContent = 'Tracing…'; tmr = setTimeout(run, 120); };
  const run = () => { try { const t0 = performance.now(); const r = G.traceSVG(ras, o); if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(new Blob([r.svg.replace('<svg ', `<svg viewBox="0 0 ${r.w} ${r.h}" `)], { type: 'image/svg+xml' })); prevImg.src = url; info.textContent = `${r.paths} paths · ${r.colors} colour${r.colors === 1 ? '' : 's'} · ${Math.round(performance.now() - t0)} ms`; } catch (e) { console.error(e); info.textContent = 'Trace failed: ' + e.message; } };
  syncAll(); run();
  const body = h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 240px', gap: '14px' } }, h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, h('div', { class: 'trace-prev' }, h('div', {}, srcImg), h('div', {}, prevImg)), h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', { class: 'muted', style: { fontSize: '11px' } }, 'Original  ·  Tracing result (live preview)'), info)), ctl);
  const pr = modal({ title: 'Image Trace', body, width: 860, buttons: [{ label: 'Cancel', value: null }, { label: 'Trace & expand', primary: true, value: 'ok' }] });
  VX._trace = { o, run, preset: p => { presetSel.value = p; presetSel.onchange(); } };
  const res = await pr; clearTimeout(tmr); if (url) URL.revokeObjectURL(url); VX._trace = null;
  if (res !== 'ok') return null;
  const { group } = G.traceRaster(ras, o); if (!o.keep) ras.remove(); VX.setSel([group]); VX.commit('Image trace');
  toast(`Traced into ${group.children.length} editable paths`, 'ok'); return group;
};
})();
