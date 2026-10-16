// BTS Vector — type: Character panel (installed fonts via queryLocalFonts), tracking, leading, bold/italic, alignment,
// type on a path (live), text on a circle, create outlines (opentype.js from local font files, trace fallback), warp text.
(() => {
const { P, O, DOC, G } = VX; const { h, toast, form, clamp } = UI;
const sel = () => VX.sel; const ins = { insert: false };

// ---------------------------------------------------------------- tracking support for paper.js PointText (canvas letterSpacing)
(() => {
  const proto = P.PointText.prototype; const draw0 = proto._draw, bounds0 = proto._getBounds; let trackPx = 0;
  proto._draw = function (ctx, param, vm) { const tr = this._data && this._data.tracking; if (tr) ctx.letterSpacing = (tr / 1000 * this.fontSize) + 'px'; try { return draw0.call(this, ctx, param, vm); } finally { if (tr) ctx.letterSpacing = '0px'; } };
  proto._getBounds = function (m, o) { const tr = this._data && this._data.tracking; trackPx = tr ? tr / 1000 * this.fontSize : 0; try { return bounds0.call(this, m, o); } finally { trackPx = 0; } };
  const V = P.view; const tw0 = V.getTextWidth; V.getTextWidth = function (font, lines) { const w = tw0.call(this, font, lines); return trackPx ? w + trackPx * Math.max(0, ...lines.map(l => l.length)) : w; };
})();
VX.fontWeightStr = o => ((o.fontStyle === 'italic' ? 'italic ' : '') + (o.fontWeight || 'normal')).trim();
const parseWeight = fw => { fw = String(fw || 'normal'); return { italic: /italic/i.test(fw), weight: fw.replace(/italic/i, '').trim() || 'normal' }; };
const isBold = w => /bold/i.test(w) || +w >= 600;
const touch = t => { t.content = t.content; };

// ---------------------------------------------------------------- installed fonts
const FALLBACK_FONTS = ['Segoe UI', 'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Georgia', 'Times New Roman', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Impact', 'Courier New', 'Consolas', 'Comic Sans MS', 'Segoe Script', 'Nirmala UI', 'Mangal', 'Inter', 'Roboto', 'Open Sans', 'Poppins', 'DejaVu Sans', 'Liberation Sans', 'Noto Sans'];
let fontData = null, fontFamilies = null, fontsLoading = null;
VX.f.loadFonts = () => {
  if (fontsLoading) return fontsLoading;
  fontsLoading = (async () => { try { if (!window.queryLocalFonts) throw new Error('no api'); const list = await Promise.race([window.queryLocalFonts(), new Promise((_, j) => setTimeout(() => j(new Error('timeout')), 4000))]); fontData = list; fontFamilies = [...new Set(list.map(f => f.family))].sort((a, b) => a.localeCompare(b)); } catch (e) { fontData = []; fontFamilies = FALLBACK_FONTS.slice(); } if (VX.rtab === 'type') VX.renderRight(); return fontFamilies; })();
  return fontsLoading;
};
VX.f.fontFamilies = () => fontFamilies || FALLBACK_FONTS;
const otCache = new Map();
async function opentypeFont(family, weight, italic) {
  await VX.f.loadFonts(); if (!fontData?.length || !window.opentype) return null;
  const fam = fontData.filter(f => f.family.toLowerCase() === String(family).toLowerCase()); if (!fam.length) return null;
  const want = (isBold(weight) ? 'bold' : 'regular') + (italic ? ' italic' : '');
  const score = f => { const s = f.style.toLowerCase(); let k = 0; if (isBold(weight) === /bold|black|heavy|semibold/.test(s)) k += 2; if (italic === /italic|oblique/.test(s)) k += 2; if (!isBold(weight) && /regular|normal|book|roman/.test(s)) k += 1; if (/condensed|narrow|light|thin/.test(s)) k -= 1; return k; };
  const fd = [...fam].sort((a, b) => score(b) - score(a))[0]; const key = fd.postscriptName + want;
  if (otCache.has(key)) return otCache.get(key);
  try { const buf = await (await fd.blob()).arrayBuffer(); const f = opentype.parse(buf); otCache.set(key, f); return f; } catch (e) { console.warn('opentype parse failed', fd.fullName, e.message); otCache.set(key, null); return null; }
}

// ---------------------------------------------------------------- create outlines
function linesOf(t) { return String(t.content).split(/\r\n|\n|\r/); }
async function textToOutline(t) {
  const { italic, weight } = parseWeight(t.fontWeight); const size = t.fontSize; const lead = t.leading || size * 1.2; const trackPx = (t.data.tracking || 0) / 1000 * size; const just = t.justification;
  const font = await opentypeFont(t.fontFamily, weight, italic); let cp = null, engine = 'trace';
  if (font) {
    const parts = [];
    try { linesOf(t).forEach((line, li) => { let glyphs; try { glyphs = font.stringToGlyphs(line); } catch { glyphs = [...line].map(ch => font.charToGlyph(ch)); } const sc = size / font.unitsPerEm; let w = 0; glyphs.forEach((g, i) => { w += (g.advanceWidth || 0) * sc + (i < glyphs.length - 1 ? trackPx : 0); if (i < glyphs.length - 1) w += font.getKerningValue(g, glyphs[i + 1]) * sc; });
      let x = just === 'center' ? -w / 2 : just === 'right' ? -w : 0; const y = li * lead;
      glyphs.forEach((g, i) => { const d = g.getPath(x, y, size).toPathData(3); if (d) parts.push(d); x += (g.advanceWidth || 0) * sc + trackPx; if (i < glyphs.length - 1) x += font.getKerningValue(g, glyphs[i + 1]) * sc; }); }); } catch (e) { console.warn('opentype outline failed, using trace', e.message); parts.length = 0; }
    if (parts.length) { cp = new P.CompoundPath({ pathData: parts.join(' '), insert: false }); engine = 'opentype'; }
  }
  if (!cp) cp = traceTextOutline(t);
  if (!cp) return null;
  cp.fillRule = 'nonzero'; cp.transform(t.matrix);
  cp.fillColor = t.fillColor ? t.fillColor.clone() : null; cp.strokeColor = t.strokeColor ? t.strokeColor.clone() : null; cp.strokeWidth = t.strokeWidth; cp.opacity = t.opacity; cp.blendMode = t.blendMode; if (t.shadowColor) { cp.shadowColor = t.shadowColor; cp.shadowBlur = t.shadowBlur; cp.shadowOffset = t.shadowOffset; }
  cp.name = 'Outlined: ' + String(t.content).slice(0, 20); cp.data.outlinedFrom = { font: t.fontFamily, engine };
  return cp;
}
// fallback: render the text large to a canvas and trace it (always matches what is on screen)
function traceTextOutline(t) {
  if (!window.ImageTracer) return null;
  const lines = linesOf(t); const size = t.fontSize; const k = clamp(220 / size, 0.5, 20); const fs = size * k; const lead = (t.leading || size * 1.2) * k; const trackPx = (t.data.tracking || 0) / 1000 * fs;
  const c = document.createElement('canvas'); const x = c.getContext('2d'); const font = `${t.fontWeight} ${fs}px "${t.fontFamily}"`; x.font = font; x.letterSpacing = trackPx + 'px';
  const w = Math.max(...lines.map(l => x.measureText(l).width)) + fs; const hh = lead * lines.length + fs; c.width = Math.ceil(Math.min(8000, w + fs)); c.height = Math.ceil(Math.min(8000, hh + fs));
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.font = font; x.letterSpacing = trackPx + 'px'; x.fillStyle = '#000'; x.textAlign = t.justification; const ox = t.justification === 'center' ? c.width / 2 : t.justification === 'right' ? c.width - fs / 2 : fs / 2, oy = fs * 1.1;
  lines.forEach((l, i) => x.fillText(l, ox, oy + i * lead));
  const id = x.getImageData(0, 0, c.width, c.height);
  const td = ImageTracer.imagedataToTracedata(id, { numberofcolors: 2, colorsampling: 0, colorquantcycles: 1, pal: [{ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }], ltres: 0.6, qtres: 0.6, pathomit: 4, rightangleenhance: false, blurradius: 0, roundcoords: 2 });
  const svg = ImageTracer.getsvgstring(td, { ...td.options, viewbox: false, strokewidth: 0, desc: false, scale: 1, roundcoords: 2, lcpr: 0, qcpr: 0 });
  const it = new P.Group({ insert: false }); it.importSVG(svg, { insert: true, expandShapes: true });
  const blacks = it.getItems({ class: P.Path, match: p => p.fillColor && p.fillColor.brightness < 0.5 }).concat(it.getItems({ class: P.CompoundPath, match: p => p.fillColor && p.fillColor.brightness < 0.5 }));
  if (!blacks.length) return null;
  const cp = new P.CompoundPath({ insert: false }); blacks.forEach(b => { (b instanceof P.CompoundPath ? b.children.slice() : [b]).forEach(ch => cp.addChild(ch.clone({ insert: false }))); });
  cp.translate([-ox, -oy]); cp.scale(1 / k, new P.Point(0, 0)); return cp;
}
VX.f.createOutlines = async ({ quiet = false } = {}) => {
  const items = sel(); const texts = []; const groupsTop = [];
  items.forEach(i => { if (i instanceof P.PointText) texts.push(i); else if (i.data?.live?.kind === 'top') groupsTop.push(i); else if (i.getItems) i.getItems({ class: P.PointText }).forEach(t => texts.push(t)); });
  groupsTop.forEach(g => { const r = VX.live.top.expand(g); r.forEach(x => x.getItems ? x.getItems({ class: P.PointText }).forEach(t => texts.push(t)) : x instanceof P.PointText && texts.push(x)); });
  if (!texts.length) { toast('Select type to outline'); return []; }
  const out = []; const tops = new Set(items.filter(i => !(i instanceof P.PointText)));
  for (const t of texts) { const cp = await textToOutline(t); if (!cp) continue; cp.insertAbove(t); t.remove(); out.push(cp); }
  const newSel = items.filter(i => i.parent && !(i instanceof P.PointText)).concat(out.filter(o => !o.parent || [...tops].every(tt => !o.isDescendant(tt))));
  VX.setSel([...new Set(newSel.filter(i => i.parent))]); if (quiet) return out; VX.commit('Create outlines');
  const eng = out.map(o => o.data.outlinedFrom?.engine); if (eng.includes('trace')) toast('Some fonts were not available as files — outlined by tracing the rendered text');
  return out;
};
UI.shortcut('ctrl+shift+o', () => VX.f.createOutlines());
VX.f.warpText = async () => { if (!sel().length) return toast('Select type to warp'); if (G.hasText(sel()) || sel().some(i => i.data?.live?.kind === 'top')) await VX.f.createOutlines(); if (!sel().length) return; return VX.f.fx('warp'); };

// ---------------------------------------------------------------- type on a path (live): Group{ data.live:{kind:'top', ...}, children:[path, glyphs…] }
const measureCtx = document.createElement('canvas').getContext('2d');
function regenTop(g) {
  const L = g.data.live; const path = g.children[0]; g.children.slice(1).forEach(c => c.remove());
  let pth = path; if (L.side === 'bottom') { pth = path.clone({ insert: false }); pth.reverse(); }
  const len = pth.length; if (!len) return g; const fw = VX.fontWeightStr({ fontStyle: L.italic ? 'italic' : 'normal', fontWeight: L.weight });
  measureCtx.font = `${fw} ${L.size}px "${L.font}"`; const track = (L.tracking || 0) / 1000 * L.size; const chars = [...L.text]; const widths = chars.map(ch => measureCtx.measureText(ch).width + track);
  const total = widths.reduce((a, b) => a + b, 0) - track; let s = (L.offset / 100) * len; if (L.align === 'center') s -= total / 2; else if (L.align === 'right') s -= total;
  chars.forEach((ch, i) => { let mid = s + widths[i] / 2 - (i === chars.length - 1 ? 0 : 0); s += widths[i]; if (path.closed) mid = ((mid % len) + len) % len; else if (mid < 0 || mid > len) return; if (ch === ' ') return; const p = pth.getPointAt(mid), tg = pth.getTangentAt(mid); if (!p || !tg) return; const t = new P.PointText({ point: p.add(pth.getNormalAt(mid).multiply(-(L.baseline || 0))), content: ch, fontFamily: L.font, fontSize: L.size, fontWeight: fw, justification: 'center', fillColor: L.color || '#111111', insert: false }); t.rotate(tg.angle, t.point); if (L.strokeColor) { t.strokeColor = L.strokeColor; t.strokeWidth = L.strokeWidth || 1; } g.addChild(t); });
  return g;
}
VX.f.regenTop = regenTop;
const topFields = L => [{ key: 'text', label: 'Text', type: 'text', value: L.text }, { key: 'font', label: 'Font', type: 'select', value: L.font, options: [...new Set([L.font, ...VX.f.fontFamilies()])] }, { key: 'size', label: 'Size (px)', type: 'range', value: L.size, min: 4, max: 400 }, { key: 'tracking', label: 'Tracking (1/1000 em)', type: 'range', value: L.tracking || 0, min: -200, max: 1500 }, { key: 'offset', label: 'Start / centre position along path (%)', type: 'range', value: L.offset, min: 0, max: 100, step: 0.5 }, { key: 'align', label: 'Align', type: 'select', value: L.align, options: ['left', 'center', 'right'] }, { key: 'side', label: 'Side', type: 'select', value: L.side, options: [{ value: 'top', label: 'Along path (top)' }, { value: 'bottom', label: 'Flipped (other side)' }] }, { key: 'baseline', label: 'Baseline shift (px)', type: 'range', value: L.baseline || 0, min: -200, max: 200 }, { key: 'color', label: 'Colour', type: 'color', value: L.color || '#111111' }, { key: 'bold', label: 'Bold', type: 'checkbox', value: isBold(L.weight) }, { key: 'italic', label: 'Italic', type: 'checkbox', value: !!L.italic }];
const fromFields = (L, v) => Object.assign(L, { text: v.text, font: v.font, size: v.size, tracking: v.tracking, offset: v.offset, align: v.align, side: v.side, baseline: v.baseline, color: v.color, weight: v.bold ? 'bold' : 'normal', italic: v.italic });
VX.live.top = {
  name: 'Type on a path', describe: g => `“${g.data.live.text.slice(0, 30)}” — double-click to edit text & position`,
  styleTargets: g => g.children.slice(1),
  edit: g => { VX.setSel([g]); return VX.withPreview({ title: 'Type on a path', fields: topFields(g.data.live), label: 'Edit type on path', apply: v => { const gg = sel()[0]; fromFields(gg.data.live, v); regenTop(gg); } }); },
  expand: g => { delete g.data.live; g.name = 'Type on path (expanded)'; const path = g.children[0]; if (!path.strokeColor && !path.fillColor) path.remove(); return [g]; },
};
function makeTop(path, opts) { const g = new P.Group({ insert: false }); g.insertAbove(path); const L = { kind: 'top', text: 'Type on a path', font: O.font, size: O.fontSize, weight: O.fontWeight, italic: O.fontStyle === 'italic', tracking: O.tracking, offset: 0, align: 'left', side: 'top', baseline: 0, color: O.fill && O.fill !== '#ffffff' ? O.fill : '#111111', ...opts }; g.addChild(path); g.data.live = L; g.name = 'Type on path'; regenTop(g); return g; }
VX.f.makeTypeOnPath = makeTop;
VX.f.typeOnPath = async () => { const p = sel().find(i => i instanceof P.Path); if (!p) { VX.setTool('typePath'); toast('Click a path with the Type-on-a-path tool'); return; } const txt = await UI.prompt('Type on a path', 'Text', 'Type on a path'); if (!txt) return; p.strokeColor = null; p.fillColor = null; const g = makeTop(p, { text: txt }); VX.setSel([g]); VX.commit('Type on a path'); return g; };
VX.f.textOnCircle = () => VX.withPreview({ title: 'Text on a circle', needSel: false, label: 'Text on a circle', fields: [{ key: 'text', label: 'Text', type: 'text', value: 'BTS CREATIVE • TEXT ON A CIRCLE •' }, { key: 'r', label: 'Radius (px)', type: 'range', value: 160, min: 10, max: 2000 }, { key: 'size', label: 'Size (px)', type: 'range', value: 32, min: 4, max: 300 }, { key: 'tracking', label: 'Tracking', type: 'range', value: 80, min: -200, max: 1500 }, { key: 'side', label: 'Position', type: 'select', value: 'top', options: [{ value: 'top', label: 'Top (reads clockwise)' }, { value: 'bottom', label: 'Bottom (reads left to right)' }] }, { key: 'full', label: 'Spread around the full circle', type: 'checkbox', value: false }, { key: 'showCircle', label: 'Show the circle', type: 'checkbox', value: false }, { key: 'color', label: 'Colour', type: 'color', value: '#111111' }],
  apply: v => { const c = VX.abRect().center; const circ = new P.Path.Circle({ center: c, radius: v.r }); if (v.showCircle) { circ.strokeColor = '#bbbbbb'; circ.strokeWidth = 1; } (VX.iso || VX.project.activeLayer).addChild(circ); let tracking = v.tracking; if (v.full) { measureCtx.font = `${O.fontWeight} ${v.size}px "${O.font}"`; const w = [...v.text].reduce((a, ch) => a + measureCtx.measureText(ch).width, 0); tracking = ((2 * Math.PI * v.r - w) / Math.max(1, v.text.length)) / v.size * 1000; } const g = makeTop(circ, { text: v.text, size: v.size, tracking, offset: 25, align: 'center', side: v.side, color: v.color }); VX.setSel([g]); } });
VX.tools.typePath = {
  options: () => [h('span', { class: 'muted' }, 'Click any path to type along it · double-click existing type on a path to edit'), h('button', { class: 'btn sm', onclick: () => VX.f.textOnCircle() }, 'Text on a circle…')],
  down: async (e, dbl) => { const hit = VX.project.hitTest(e.point, VX.hitOpts({ segments: false, fill: true, stroke: true, tolerance: 8 / P.view.zoom })); const top = hit && VX.topItem(hit.item); if (top?.data?.live?.kind === 'top') return VX.live.top.edit(top); const p = hit?.item instanceof P.Path ? hit.item : null; if (!p) return toast('Click on a path'); VX.setSel([p]); await VX.f.typeOnPath(); },
};

// ---------------------------------------------------------------- Character panel
const textsInSel = () => sel().filter(i => i instanceof P.PointText);
const topsInSel = () => sel().filter(i => i.data?.live?.kind === 'top');
function applyChar(patch) {
  Object.assign(O, patch); const fw = VX.fontWeightStr(O);
  textsInSel().forEach(t => { if ('font' in patch) t.fontFamily = O.font; if ('fontSize' in patch) { t.fontSize = O.fontSize; t.leading = O.fontSize * O.leading; } if ('fontWeight' in patch || 'fontStyle' in patch) t.fontWeight = fw; if ('justify' in patch) t.justification = O.justify; if ('leading' in patch) t.leading = t.fontSize * O.leading; if ('tracking' in patch) { t.data.tracking = O.tracking; touch(t); } if ('color' in patch) t.fillColor = patch.color; });
  topsInSel().forEach(g => { const L = g.data.live; if ('font' in patch) L.font = O.font; if ('fontSize' in patch) L.size = O.fontSize; if ('fontWeight' in patch) L.weight = O.fontWeight; if ('fontStyle' in patch) L.italic = O.fontStyle === 'italic'; if ('tracking' in patch) L.tracking = O.tracking; if ('color' in patch) L.color = patch.color; if ('justify' in patch) L.align = O.justify; regenTop(g); });
  if (textsInSel().length || topsInSel().length) VX.commitDebounced('Character'); VX.drawGuides();
}
VX.f.applyChar = applyChar;
VX.f.typeStyle = k => { if (k === 'bold') applyChar({ fontWeight: isBold(O.fontWeight) ? 'normal' : 'bold' }); else if (k === 'italic') applyChar({ fontStyle: O.fontStyle === 'italic' ? 'normal' : 'italic' }); else applyChar({ justify: k }); VX.renderRight(); };
UI.shortcut('ctrl+b', () => VX.f.typeStyle('bold')); UI.shortcut('ctrl+i', () => VX.f.typeStyle('italic'));
VX.tabs.type = rp => {
  VX.f.loadFonts(); const sec = VX.sec;
  const t0 = textsInSel()[0], g0 = topsInSel()[0];
  if (t0) { const pw = parseWeight(t0.fontWeight); Object.assign(O, { font: t0.fontFamily, fontSize: t0.fontSize, fontWeight: pw.weight, fontStyle: pw.italic ? 'italic' : 'normal', justify: t0.justification, leading: Math.round((t0.leading / t0.fontSize) * 100) / 100, tracking: t0.data.tracking || 0 }); }
  else if (g0) { const L = g0.data.live; Object.assign(O, { font: L.font, fontSize: L.size, fontWeight: L.weight, fontStyle: L.italic ? 'italic' : 'normal', tracking: L.tracking || 0, justify: L.align }); }
  const fams = VX.f.fontFamilies(); const q = h('input', { type: 'text', placeholder: `Search ${fams.length} fonts…`, style: { width: '100%' } });
  const list = h('div', { class: 'fontlist' });
  const fill = () => { list.innerHTML = ''; const s = q.value.toLowerCase(); fams.filter(f => !s || f.toLowerCase().includes(s)).slice(0, 400).forEach(f => list.append(h('div', { class: f === O.font ? 'on' : '', style: { fontFamily: `"${f}"` }, onclick: () => { applyChar({ font: f }); list.querySelectorAll('.on').forEach(x => x.classList.remove('on')); list.querySelectorAll('div').forEach(x => { if (x.textContent === f) x.classList.add('on'); }); cur.textContent = f; } }, f))); };
  q.oninput = fill; fill(); const cur = h('div', { style: { fontFamily: `"${O.font}"`, fontSize: '15px', color: 'var(--tx-0)', margin: '2px 0 6px' } }, O.font);
  setTimeout(() => list.querySelector('.on')?.scrollIntoView({ block: 'center' }), 0);
  const numI = (key, min, max, step, toO = v => v, fromO = v => v) => { const i = h('input', { type: 'number', min, max, step, value: fromO(O[key]) }); i.onchange = () => applyChar({ [key]: toO(clamp(+i.value, min, max)) }); return i; };
  const weight = h('select', {}, ...[['100', 'Thin 100'], ['300', 'Light 300'], ['normal', 'Regular 400'], ['500', 'Medium 500'], ['600', 'Semibold 600'], ['bold', 'Bold 700'], ['800', 'Extrabold 800'], ['900', 'Black 900']].map(([v, l]) => h('option', { value: v, selected: String(O.fontWeight) === v }, l))); weight.onchange = () => applyChar({ fontWeight: weight.value });
  const seg = (items, curV, fn) => h('div', { class: 'seg' }, ...items.map(([v, l, tip]) => h('button', { class: curV === v ? 'on' : '', 'data-tip': tip || l, onclick: () => { fn(v); VX.renderRight(); } }, l)));
  const colI = h('input', { type: 'color', value: VX.toHex(t0?.fillColor && !t0.fillColor.gradient ? t0.fillColor.toCSS(true) : g0 ? g0.data.live.color : '#111111') }); colI.oninput = () => applyChar({ color: colI.value });
  const none = !t0 && !g0;
  rp.append(sec('Character' + (none ? ' — new type' : ''), cur, q, list,
    h('div', { class: 'grid2', style: { marginTop: '10px' } }, h('label', {}, 'Size', numI('fontSize', 1, 2000, 1)), h('label', {}, 'Weight', weight), h('label', { 'data-tip': 'Leading (line height, × size)' }, '↕', numI('leading', 0.5, 5, 0.05)), h('label', { 'data-tip': 'Tracking (1/1000 em)' }, 'VA', numI('tracking', -500, 2000, 10))),
    h('div', { class: 'row', style: { marginTop: '10px', gap: '8px', flexWrap: 'wrap' } }, seg([['bold', 'B', 'Bold (Ctrl+B)']], isBold(O.fontWeight) ? 'bold' : '', () => VX.f.typeStyle('bold')), seg([['italic', 'I', 'Italic (Ctrl+I)']], O.fontStyle === 'italic' ? 'italic' : '', () => VX.f.typeStyle('italic')), seg([['left', '⯇≡', 'Align left'], ['center', '≡', 'Align centre'], ['right', '≡⯈', 'Align right']], O.justify, v => applyChar({ justify: v })), colI),
    h('div', { class: 'muted', style: { fontSize: '11px', marginTop: '6px' } }, none ? 'Settings apply to the next text you type. Select text to edit it.' : `Editing ${textsInSel().length + topsInSel().length} type object(s)`)));
  if (t0) { const ta = h('textarea', { rows: 3, style: { width: '100%' } }, t0.content); ta.oninput = () => { t0.content = ta.value; VX.drawGuides(); VX.commitDebounced('Edit text'); }; rp.append(sec('Text', ta)); }
  rp.append(sec('Type tools', h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px' } }, h('button', { class: 'btn sm', onclick: () => VX.f.createOutlines() }, 'Create outlines'), h('button', { class: 'btn sm', onclick: () => VX.f.warpText() }, 'Warp text…'), h('button', { class: 'btn sm', onclick: () => VX.f.typeOnPath() }, 'Type on a path'), h('button', { class: 'btn sm', onclick: () => VX.f.textOnCircle() }, 'Text on a circle…'), g0 ? h('button', { class: 'btn sm', onclick: () => VX.live.top.edit(g0) }, 'Edit path type…') : '')));
};
VX.propSections.push(items => { const t = items.find(i => i instanceof P.PointText); if (!t) return null; return VX.sec('Character', h('div', { class: 'muted', style: { fontSize: '11.5px', marginBottom: '6px' } }, `${t.fontFamily} · ${Math.round(t.fontSize)} px · ${t.fontWeight}${t.data.tracking ? ' · tracking ' + t.data.tracking : ''}`), h('div', { class: 'row', style: { gap: '4px', flexWrap: 'wrap' } }, h('button', { class: 'btn sm', onclick: () => VX.showTab('type') }, 'Character panel…'), h('button', { class: 'btn sm', onclick: () => VX.f.createOutlines() }, 'Create outlines'), h('button', { class: 'btn sm', onclick: () => VX.f.warpText() }, 'Warp…'))); });
})();
