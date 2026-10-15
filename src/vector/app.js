// BTS Vector — vector illustration editor (paper.js engine)
(() => {
const { $, h, icon, toast, modal, form, prompt, confirm, contextMenu, clamp } = UI;
const P = paper; P.setup(document.getElementById('cv'));
P.settings.hitTolerance = 4; P.settings.handleSize = 7;
const view = P.view, project = P.project;
const cv = document.getElementById('cv'), vpEl = $('#viewport');

// =====================================================================  document
const DOC = { w: 1200, h: 800, name: 'Untitled-1', path: null, dirty: false };
let artLayer, guideLayer;
const isSys = it => { while (it && !(it instanceof P.Layer)) it = it.parent; return !it || it.name === '__art' || it.name === '__guide'; };
const userLayers = () => project.layers.filter(l => l.name !== '__art' && l.name !== '__guide');
function setupSystemLayers() {
  artLayer?.remove(); guideLayer?.remove();
  artLayer = new P.Layer({ name: '__art', locked: true }); project.insertLayer(0, artLayer);
  guideLayer = new P.Layer({ name: '__guide' }); project.addLayer(guideLayer);
  drawArtboard(); activateUserLayer();
}
function drawArtboard() {
  artLayer.removeChildren(); artLayer.activate();
  new P.Path.Rectangle({ rectangle: new P.Rectangle(3, 4, DOC.w, DOC.h), fillColor: new P.Color(0, 0, 0, 0.35), parent: artLayer });
  new P.Path.Rectangle({ rectangle: new P.Rectangle(0, 0, DOC.w, DOC.h), fillColor: DOC.bg || 'white', parent: artLayer });
  if (O.grid) { const g = new P.Group({ parent: artLayer }); const step = O.gridSize; for (let x = step; x < DOC.w; x += step) g.addChild(new P.Path.Line({ from: [x, 0], to: [x, DOC.h], strokeColor: x % (step * 5) ? '#e8eaf0' : '#cdd2de', strokeWidth: 1 / view.zoom })); for (let y = step; y < DOC.h; y += step) g.addChild(new P.Path.Line({ from: [0, y], to: [DOC.w, y], strokeColor: y % (step * 5) ? '#e8eaf0' : '#cdd2de', strokeWidth: 1 / view.zoom })); }
  $('#stArt').textContent = `Artboard ${DOC.w} × ${DOC.h} px`;
  activateUserLayer();
}
function activateUserLayer() { const a = project.activeLayer; if (!a || isSys(a)) { const u = userLayers(); (u[u.length - 1] || newUserLayer()).activate(); } }
let layerN = 1;
function newUserLayer(name) { const l = new P.Layer({ name: name || `Layer ${layerN++}` }); project.insertLayer(guideLayer ? guideLayer.index : project.layers.length, l); l.activate(); return l; }

// =====================================================================  state
const O = { tool: 'select', fill: '#ffffff', stroke: '#000000', sw: 1, front: 'fill', grid: false, snap: false, gridSize: 20, outline: false,
  font: 'Segoe UI', fontSize: 36, fontWeight: 'normal', justify: 'left', radius: 0, sides: 6, starRatio: 0.5, brushW: 4, smooth: 8 };
let sel = []; let selSegs = [];

// =====================================================================  menus
UI.titlebar({ logo: 'Vc', menus: [
  { label: 'File', items: () => [
    { label: 'New…', kbd: 'Ctrl+N', action: newDialog }, { label: 'Open…', kbd: 'Ctrl+O', action: openDialog }, { label: 'Place image…', kbd: 'Ctrl+Shift+P', action: placeImage }, '-',
    { label: 'Save (.btsv)', kbd: 'Ctrl+S', action: () => save(false) }, { label: 'Save as…', kbd: 'Ctrl+Shift+S', action: () => save(true) },
    { label: 'Export', sub: [{ label: 'SVG…', action: exportSVG }, { label: 'PNG…', action: () => exportRaster('png') }, { label: 'JPEG…', action: () => exportRaster('jpeg') }, { label: 'PDF (vector)…', action: exportPDF }] }, '-',
    { label: 'Document setup…', kbd: 'Ctrl+Alt+P', action: docSetup }, '-', { label: 'BTS Creative home', action: () => bts.openApp('home') }, { label: 'Close window', kbd: 'Ctrl+W', action: closeWindow } ] },
  { label: 'Edit', items: () => [
    { label: 'Undo', kbd: 'Ctrl+Z', action: undo, disabled: hi <= 0 }, { label: 'Redo', kbd: 'Ctrl+Shift+Z', action: redo, disabled: hi >= hist.length - 1 }, '-',
    { label: 'Cut', kbd: 'Ctrl+X', action: cut }, { label: 'Copy', kbd: 'Ctrl+C', action: copy }, { label: 'Paste', kbd: 'Ctrl+V', action: () => paste(false) }, { label: 'Paste in place', kbd: 'Ctrl+Shift+V', action: () => paste(true) },
    { label: 'Duplicate', kbd: 'Ctrl+D', action: duplicate }, { label: 'Delete', kbd: 'Del', action: deleteSel }, '-',
    { label: 'Select all', kbd: 'Ctrl+A', action: selectAll }, { label: 'Deselect', kbd: 'Ctrl+Shift+A', action: () => setSel([]) }, { label: 'Select inverse', action: selectInverse },
    { label: 'Select same fill color', action: () => selectSame('fill') }, { label: 'Select same stroke color', action: () => selectSame('stroke') } ] },
  { label: 'Object', items: () => [
    { label: 'Transform', sub: [{ label: 'Move…', kbd: 'Shift+Ctrl+M', action: moveDialog }, { label: 'Rotate…', action: rotateDialog }, { label: 'Scale…', action: scaleDialog }, { label: 'Reflect horizontal', action: () => reflect('h') }, { label: 'Reflect vertical', action: () => reflect('v') }] },
    { label: 'Arrange', sub: [{ label: 'Bring to front', kbd: 'Ctrl+Shift+]', action: () => arrange('front') }, { label: 'Bring forward', kbd: 'Ctrl+]', action: () => arrange('fwd') }, { label: 'Send backward', kbd: 'Ctrl+[', action: () => arrange('back') }, { label: 'Send to back', kbd: 'Ctrl+Shift+[', action: () => arrange('bottom') }] },
    '-', { label: 'Group', kbd: 'Ctrl+G', action: group }, { label: 'Ungroup', kbd: 'Ctrl+Shift+G', action: ungroup },
    { label: 'Lock selection', kbd: 'Ctrl+2', action: lockSel }, { label: 'Unlock all', kbd: 'Ctrl+Alt+2', action: unlockAll }, { label: 'Hide selection', kbd: 'Ctrl+3', action: hideSel }, { label: 'Show all', kbd: 'Ctrl+Alt+3', action: showAll },
    '-', { label: 'Path', sub: [{ label: 'Join', kbd: 'Ctrl+J', action: joinPaths }, { label: 'Simplify', action: () => pathOp('simplify') }, { label: 'Smooth', action: () => pathOp('smooth') }, { label: 'Flatten curves', action: () => pathOp('flatten') }, { label: 'Reverse direction', action: () => pathOp('reverse') }, { label: 'Close path', action: () => pathOp('close') }, { label: 'Outline stroke', action: outlineStroke }] },
    { label: 'Compound path', sub: [{ label: 'Make', kbd: 'Ctrl+8', action: makeCompound }, { label: 'Release', kbd: 'Ctrl+Alt+Shift+8', action: releaseCompound }] },
    { label: 'Clipping mask', sub: [{ label: 'Make', kbd: 'Ctrl+7', action: makeClip }, { label: 'Release', kbd: 'Ctrl+Alt+7', action: ungroup }] },
    { label: 'Pathfinder', sub: [{ label: 'Unite', action: () => pathfinder('unite') }, { label: 'Minus front', action: () => pathfinder('subtract') }, { label: 'Intersect', action: () => pathfinder('intersect') }, { label: 'Exclude', action: () => pathfinder('exclude') }, { label: 'Divide', action: () => pathfinder('divide') }] },
    { label: 'Rasterize to image', action: rasterizeSel } ] },
  { label: 'Type', items: () => [{ label: 'Font size up', kbd: 'Ctrl+Shift+.', action: () => bumpFont(2) }, { label: 'Font size down', kbd: 'Ctrl+Shift+,', action: () => bumpFont(-2) }, { label: 'Create outlines (rasterize)', action: rasterizeSel }] },
  { label: 'View', items: () => [
    { label: 'Zoom in', kbd: 'Ctrl++', action: () => zoomAt(1.25) }, { label: 'Zoom out', kbd: 'Ctrl+-', action: () => zoomAt(0.8) }, { label: 'Fit artboard', kbd: 'Ctrl+0', action: fitArt }, { label: 'Actual size', kbd: 'Ctrl+1', action: () => { view.zoom = 1; afterView(); } }, '-',
    { label: 'Outline mode', kbd: 'Ctrl+Y', checked: () => O.outline, action: toggleOutline },
    { label: 'Show grid', kbd: "Ctrl+'", checked: () => O.grid, action: () => { O.grid = !O.grid; drawArtboard(); } },
    { label: 'Snap to grid', kbd: "Ctrl+Shift+'", checked: () => O.snap, action: () => { O.snap = !O.snap; } } ] },
  { label: 'Help', items: [{ label: 'Keyboard shortcuts', action: shortcutsHelp }, { label: 'Check for updates', action: () => bts.update.check().then(r => toast(r.state === 'store' ? 'Updates are delivered by the Microsoft Store.' : r.state === 'dev' ? 'Updates run in the installed version.' : 'Checking for updates…')) }, { label: 'About BTS Vector', action: () => modal({ title: 'BTS Vector', body: 'Part of BTS Creative — free and open source for students.<br>Not affiliated with Adobe Inc.' }) }] },
]});
window.addEventListener('bts:close', closeWindow);

// =====================================================================  toolbar
const TOOLS = [['select', 'select', 'Selection', 'V'], ['direct', 'direct', 'Direct selection', 'A'], '-', ['pen', 'pen', 'Pen', 'P'], ['pencil', 'pencil', 'Pencil', 'N'], ['brush', 'brush', 'Paintbrush', 'B'], ['text', 'text', 'Type', 'T'], '-',
  ['rect', 'rect', 'Rectangle', 'M'], ['ellipse', 'ellipse', 'Ellipse', 'L'], ['polygon', 'hexagon', 'Polygon', 'Shift+M'], ['star', 'star', 'Star', 'Shift+L'], ['line', 'line', 'Line segment', '\\'], '-',
  ['scissors', 'scissors', 'Scissors', 'C'], ['eyedrop', 'eyedrop', 'Eyedropper', 'I'], ['gradient', 'gradient', 'Gradient', 'G'], ['hand', 'hand', 'Hand', 'H'], ['zoom', 'zoom', 'Zoom', 'Z']];
const tb = $('#toolbar');
TOOLS.forEach(t => { if (t === '-') return tb.append(h('div', { class: 'tsep' })); const [id, ic, tip, key] = t; tb.append(h('button', { class: 'icon-btn', 'data-tool': id, 'data-tip': tip, 'data-key': key, html: icon(ic), onclick: () => setTool(id) })); });
const fsw = h('div', { class: 'fs' }, h('div', { class: 'sw fill', id: 'swFill', 'data-tip': 'Fill (click to edit, X to toggle)', onclick: () => { O.front = 'fill'; pickStyle('fill'); } }), h('div', { class: 'sw stroke', id: 'swStroke', 'data-tip': 'Stroke', onclick: () => { O.front = 'stroke'; pickStyle('stroke'); } }));
tb.append(fsw, h('div', { class: 'row', style: { gap: '2px', marginTop: '4px' } }, h('button', { class: 'icon-btn', style: { width: '20px', height: '20px', fontSize: '10px' }, 'data-tip': 'None (/)', onclick: () => applyColor(null) }, '⌀'), h('button', { class: 'icon-btn', style: { width: '20px', height: '20px', fontSize: '10px' }, 'data-tip': 'Swap (Shift+X)', onclick: swapFS }, '⇄')));
const keyTools = { v: 'select', a: 'direct', p: 'pen', n: 'pencil', b: 'brush', t: 'text', m: 'rect', l: 'ellipse', 'shift+m': 'polygon', 'shift+l': 'star', '\\': 'line', c: 'scissors', i: 'eyedrop', g: 'gradient', h: 'hand', z: 'zoom' };
Object.entries(keyTools).forEach(([k, t]) => UI.shortcut(k, () => setTool(t)));
UI.shortcut('x', () => { O.front = O.front === 'fill' ? 'stroke' : 'fill'; renderFS(); }); UI.shortcut('shift+x', swapFS); UI.shortcut('/', () => applyColor(null)); UI.shortcut('d', () => { O.fill = '#ffffff'; O.stroke = '#000000'; O.sw = 1; applyStyleToSel(); renderFS(); });
function setTool(t) { finishPen(); finishText(true); O.tool = t; tb.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === t)); if (t !== 'direct') selSegs.forEach(s => s.selected = false), sel.forEach(i => i.fullySelected = false); if (t === 'direct') sel.forEach(i => i.fullySelected = true); renderOptions(); updateCursor(); drawGuides(); }
function updateCursor() { cv.style.cursor = { hand: 'grab', zoom: 'zoom-in', text: 'text', eyedrop: 'crosshair', pen: 'crosshair', pencil: 'crosshair', brush: 'crosshair', rect: 'crosshair', ellipse: 'crosshair', polygon: 'crosshair', star: 'crosshair', line: 'crosshair', scissors: 'crosshair', gradient: 'crosshair' }[O.tool] || 'default'; }
function renderFS() {
  const f = $('#swFill'), s = $('#swStroke'); const fill = selStyle('fill'), stroke = selStyle('stroke');
  f.classList.toggle('none', fill === null); f.style.background = fill || ''; s.classList.toggle('none', stroke === null); s.style.borderColor = stroke || '#fff';
  f.classList.toggle('front', O.front === 'fill'); s.classList.toggle('front', O.front === 'stroke');
}
function swapFS() { [O.fill, O.stroke] = [O.stroke, O.fill]; sel.forEach(it => eachStyled(it, i => { const f = i.fillColor, s = i.strokeColor; i.fillColor = s; i.strokeColor = f; })); renderFS(); if (sel.length) commit('Swap fill/stroke'); renderProps(); }
async function pickStyle(which) {
  const cur = selStyle(which) || (which === 'fill' ? O.fill : O.stroke) || '#000000';
  const inp = h('input', { type: 'color', value: toHex(cur), style: { width: '100%', height: '110px' } });
  const noneCb = h('input', { type: 'checkbox', checked: selStyle(which) === null });
  const r = await modal({ title: which === 'fill' ? 'Fill color' : 'Stroke color', body: h('div', {}, inp, h('label', { class: 'row', style: { marginTop: '10px' } }, noneCb, 'None')), buttons: [{ label: 'Cancel', value: null }, { label: 'OK', primary: true, value: 'ok' }] });
  if (r !== 'ok') return; O.front = which; applyColor(noneCb.checked ? null : inp.value);
}
function applyColor(c, which = O.front) {
  if (which === 'fill') O.fill = c; else O.stroke = c;
  if (sel.length) { sel.forEach(it => eachStyled(it, i => { if (which === 'fill') i.fillColor = c; else { i.strokeColor = c; if (c && !i.strokeWidth) i.strokeWidth = O.sw || 1; } })); commit('Color'); }
  renderFS(); renderProps();
}
function eachStyled(it, fn) { if (it instanceof P.Group && !it.clipped) it.children.forEach(c => eachStyled(c, fn)); else if (it instanceof P.Group && it.clipped) it.children.slice(1).forEach(c => eachStyled(c, fn)); else fn(it); }
function firstStyled(it) { let r = null; eachStyled(it, i => { if (!r) r = i; }); return r; }
function selStyle(which) {
  if (!sel.length) return which === 'fill' ? O.fill : O.stroke;
  const i = firstStyled(sel[0]); if (!i) return null; const c = which === 'fill' ? i.fillColor : i.strokeColor;
  if (!c) return null; if (c.gradient) return 'gradient'; return c.toCSS(true);
}
const toHex = c => { if (!c || c === 'gradient') return '#000000'; if (c.startsWith('#') && c.length === 7) return c; try { return new P.Color(c).toCSS(true); } catch { return '#000000'; } };

// =====================================================================  options bar
function renderOptions() {
  const ob = $('#optbar'); ob.innerHTML = '';
  const grp = (...k) => h('div', { class: 'grp' }, ...k), vsep = () => h('div', { class: 'vsep' });
  const num = (label, key, min, max, step = 1, cb) => { const i = h('input', { type: 'number', min, max, step, value: O[key], style: { width: '60px' } }); i.oninput = () => { O[key] = clamp(+i.value, min, max); cb && cb(); }; return grp(label, i); };
  const t = O.tool;
  const fillI = h('input', { type: 'color', value: toHex(O.fill) }); fillI.oninput = () => applyColor(fillI.value, 'fill');
  const strokeI = h('input', { type: 'color', value: toHex(O.stroke) }); strokeI.oninput = () => applyColor(strokeI.value, 'stroke');
  ob.append(grp('Fill', fillI), grp('Stroke', strokeI), num('Weight', 'sw', 0, 200, 0.5, () => { if (sel.length) { sel.forEach(it => eachStyled(it, i => i.strokeWidth = O.sw)); commitDebounced('Stroke weight'); } }), vsep());
  if (t === 'rect') ob.append(num('Corner radius', 'radius', 0, 1000));
  else if (t === 'polygon') ob.append(num('Sides', 'sides', 3, 40));
  else if (t === 'star') ob.append(num('Points', 'sides', 3, 40), num('Inner %', 'starRatio', 0.1, 0.95, 0.05));
  else if (t === 'pencil' || t === 'brush') { ob.append(num('Smoothness', 'smooth', 0, 50)); if (t === 'brush') ob.append(num('Brush size', 'brushW', 0.5, 100, 0.5)); }
  else if (t === 'text') {
    const fonts = ['Segoe UI', 'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Georgia', 'Times New Roman', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Impact', 'Courier New', 'Consolas', 'Comic Sans MS', 'Segoe Script', 'Nirmala UI', 'Mangal'];
    const f = h('select', {}, ...fonts.map(x => h('option', { selected: x === O.font }, x))); f.onchange = () => { O.font = f.value; applyText(); };
    const w = h('select', {}, ...[['normal', 'Regular'], ['bold', 'Bold'], ['300', 'Light'], ['900', 'Black'], ['italic', 'Italic']].map(([v, l]) => h('option', { value: v, selected: v === O.fontWeight }, l))); w.onchange = () => { O.fontWeight = w.value; applyText(); };
    const j = h('select', {}, ...['left', 'center', 'right'].map(x => h('option', { selected: x === O.justify }, x))); j.onchange = () => { O.justify = j.value; applyText(); };
    ob.append(grp('Font', f), grp('', w), num('Size', 'fontSize', 1, 1000, 1, applyText), grp('Align', j));
  }
  else if (t === 'pen') ob.append(h('span', { class: 'muted' }, 'Click for corners, drag for curves, click the first point to close, Enter to finish'));
  else if (t === 'direct') ob.append(h('span', { class: 'muted' }, 'Drag anchors and handles · Alt+click a path to add a point · Del removes points · double-click toggles smooth'));
  else if (t === 'scissors') ob.append(h('span', { class: 'muted' }, 'Click on a path to cut it'));
  else if (t === 'gradient') ob.append(h('span', { class: 'muted' }, 'Drag across selected objects to apply a gradient (fill → stroke colors)'));
  else if (t === 'select' && sel.length) ob.append(...['alignL', 'alignC', 'alignR', 'alignT', 'alignM', 'alignB'].map(a => h('button', { class: 'icon-btn', 'data-tip': 'Align', html: icon(a), onclick: () => align(a) })), vsep(), h('button', { class: 'btn sm', onclick: group }, 'Group'), h('button', { class: 'btn sm', onclick: ungroup }, 'Ungroup'));
}
function applyText() { const ts = sel.filter(i => i instanceof P.PointText); if (!ts.length) return; ts.forEach(t => { t.fontFamily = O.font; t.fontSize = O.fontSize; t.fontWeight = O.fontWeight; t.justification = O.justify; }); commitDebounced('Character'); drawGuides(); }
function bumpFont(d) { sel.filter(i => i instanceof P.PointText).forEach(t => t.fontSize = Math.max(1, t.fontSize + d)); commit('Font size'); drawGuides(); }

// =====================================================================  right panel
let rtab = 'props';
$('#rtabs').addEventListener('click', e => { const t = e.target.closest('.tab'); if (!t) return; rtab = t.dataset.t; document.querySelectorAll('#rtabs .tab').forEach(x => x.classList.toggle('active', x === t)); renderRight(); });
function renderRight() { rtab === 'props' ? renderProps() : rtab === 'layers' ? renderLayersPanel() : renderSwatches(); }
function renderProps() {
  if (rtab !== 'props') return; const rp = $('#rp'); rp.innerHTML = '';
  const sec = (title, ...kids) => h('div', { class: 'sec' }, h('h4', {}, title), ...kids);
  if (!sel.length) {
    const w = h('input', { type: 'number', value: DOC.w }), hh = h('input', { type: 'number', value: DOC.h });
    const bg = h('input', { type: 'color', value: DOC.bg || '#ffffff' }); bg.oninput = () => { DOC.bg = bg.value; drawArtboard(); };
    const apply = () => { DOC.w = clamp(+w.value, 1, 20000); DOC.h = clamp(+hh.value, 1, 20000); drawArtboard(); commit('Artboard size'); };
    w.onchange = apply; hh.onchange = apply;
    rp.append(sec('Document', h('div', { class: 'grid2' }, h('label', {}, 'W', w), h('label', {}, 'H', hh)), h('div', { class: 'colrow', style: { marginTop: '8px' } }, h('span', { class: 'lbl' }, 'Board'), bg)),
      sec('Quick actions', h('div', { class: 'row', style: { flexWrap: 'wrap' } }, h('button', { class: 'btn sm', onclick: docSetup }, 'Document setup'), h('button', { class: 'btn sm', onclick: () => { O.grid = !O.grid; drawArtboard(); } }, 'Toggle grid'), h('button', { class: 'btn sm', onclick: exportSVG }, 'Export SVG'), h('button', { class: 'btn sm', onclick: () => exportRaster('png') }, 'Export PNG'))));
    return;
  }
  const b = selBounds();
  const mkNum = (val, fn) => { const i = h('input', { type: 'number', value: Math.round(val * 100) / 100, step: 1 }); i.onchange = () => { fn(+i.value); commit('Transform'); drawGuides(); renderProps(); }; return i; };
  rp.append(sec('Transform', h('div', { class: 'grid2' },
    h('label', {}, 'X', mkNum(b.x, v => moveSel(v - selBounds().x, 0))), h('label', {}, 'Y', mkNum(b.y, v => moveSel(0, v - selBounds().y))),
    h('label', {}, 'W', mkNum(b.width, v => { const c = selBounds(); sel.forEach(i => i.scale(v / (c.width || 1), 1, c.topLeft)); })),
    h('label', {}, 'H', mkNum(b.height, v => { const c = selBounds(); sel.forEach(i => i.scale(1, v / (c.height || 1), c.topLeft)); })),
    h('label', {}, '⟳', mkNum(0, v => { const c = selBounds().center; sel.forEach(i => i.rotate(v, c)); })), h('span', { class: 'muted', style: { fontSize: '11px', alignSelf: 'center' } }, 'Rotate by°')),
    h('div', { class: 'icons', style: { marginTop: '8px' } }, ...[['flipH', 'Flip horizontal', () => reflect('h')], ['flipV', 'Flip vertical', () => reflect('v')], ['rotateL', 'Rotate −90°', () => rotateSel(-90)], ['rotate', 'Rotate 90°', () => rotateSel(90)]].map(([ic, tip, fn]) => h('button', { class: 'icon-btn', 'data-tip': tip, html: icon(ic), onclick: fn })))));
  // appearance
  const it = firstStyled(sel[0]);
  const fillSel = h('select', {}, ...[['solid', 'Solid'], ['none', 'None'], ['linear', 'Linear gradient'], ['radial', 'Radial gradient']].map(([v, l]) => h('option', { value: v }, l)));
  const fc = it?.fillColor; fillSel.value = !fc ? 'none' : fc.gradient ? (fc.gradient.radial ? 'radial' : 'linear') : 'solid';
  const fillC = h('input', { type: 'color', value: fc && !fc.gradient ? fc.toCSS(true) : toHex(O.fill) });
  const g1 = h('input', { type: 'color', value: fc?.gradient ? fc.gradient.stops[0].color.toCSS(true) : '#ff9a00' }), g2 = h('input', { type: 'color', value: fc?.gradient ? fc.gradient.stops[fc.gradient.stops.length - 1].color.toCSS(true) : '#9a7bff' });
  const applyFill = () => { const m = fillSel.value; sel.forEach(s => eachStyled(s, i => { if (m === 'none') i.fillColor = null; else if (m === 'solid') i.fillColor = fillC.value; else { const bb = i.bounds; i.fillColor = { gradient: { stops: [g1.value, g2.value], radial: m === 'radial' }, origin: m === 'radial' ? bb.center : bb.leftCenter, destination: m === 'radial' ? bb.rightCenter : bb.rightCenter }; } })); renderFS(); commitDebounced('Fill'); };
  fillSel.onchange = () => { applyFill(); renderProps(); }; fillC.oninput = applyFill; g1.oninput = applyFill; g2.oninput = applyFill;
  const sc = it?.strokeColor; const strokeOn = h('input', { type: 'checkbox', checked: !!sc }); const strokeC = h('input', { type: 'color', value: sc ? sc.toCSS(true) : '#000000' });
  const swI = h('input', { type: 'number', min: 0, step: 0.5, value: it?.strokeWidth ?? 1, style: { width: '60px' } });
  const dash = h('select', {}, h('option', { value: '' }, 'Solid'), h('option', { value: '8,6' }, 'Dashed'), h('option', { value: '1,4' }, 'Dotted'), h('option', { value: '16,6,2,6' }, 'Dash-dot')); dash.value = (it?.dashArray || []).join(',');
  const cap = h('select', {}, ...['butt', 'round', 'square'].map(x => h('option', { selected: it?.strokeCap === x }, x)));
  const join = h('select', {}, ...['miter', 'round', 'bevel'].map(x => h('option', { selected: it?.strokeJoin === x }, x)));
  const applyStroke = () => { sel.forEach(s => eachStyled(s, i => { i.strokeColor = strokeOn.checked ? strokeC.value : null; i.strokeWidth = +swI.value; i.dashArray = dash.value ? dash.value.split(',').map(Number) : []; i.strokeCap = cap.value; i.strokeJoin = join.value; })); renderFS(); commitDebounced('Stroke'); };
  [strokeOn, strokeC, swI, dash, cap, join].forEach(e => e.oninput = e.onchange = applyStroke);
  const op = h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: sel[0].opacity }); op.oninput = () => { sel.forEach(s => s.opacity = +op.value); commitDebounced('Opacity'); };
  const blend = h('select', {}, ...['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'].map(x => h('option', { selected: sel[0].blendMode === x }, x))); blend.onchange = () => { sel.forEach(s => s.blendMode = blend.value); commit('Blend mode'); };
  const shadowOn = h('input', { type: 'checkbox', checked: !!sel[0].shadowColor }); shadowOn.onchange = () => { sel.forEach(s => { if (shadowOn.checked) { s.shadowColor = new P.Color(0, 0, 0, 0.35); s.shadowBlur = 12; s.shadowOffset = new P.Point(4, 6); } else s.shadowColor = null; }); commit('Shadow'); };
  rp.append(sec('Appearance',
    h('div', { class: 'colrow' }, h('span', { class: 'lbl' }, 'Fill'), fillSel, fillSel.value === 'solid' ? fillC : '', ['linear', 'radial'].includes(fillSel.value) ? g1 : '', ['linear', 'radial'].includes(fillSel.value) ? g2 : ''),
    h('div', { class: 'colrow' }, h('span', { class: 'lbl' }, 'Stroke'), strokeOn, strokeC, swI),
    h('div', { class: 'colrow' }, h('span', { class: 'lbl' }, ''), dash, cap, join),
    h('div', { class: 'colrow' }, h('span', { class: 'lbl' }, 'Opacity'), op),
    h('div', { class: 'colrow' }, h('span', { class: 'lbl' }, 'Blend'), blend),
    h('label', { class: 'colrow' }, h('span', { class: 'lbl' }, 'Shadow'), shadowOn, 'Drop shadow')));
  const texts = sel.filter(i => i instanceof P.PointText);
  if (texts.length) { const t = texts[0]; const ta = h('textarea', { rows: 3, style: { width: '100%' } }, t.content); ta.oninput = () => { t.content = ta.value; drawGuides(); commitDebounced('Edit text'); };
    O.font = t.fontFamily; O.fontSize = t.fontSize; O.fontWeight = t.fontWeight; O.justify = t.justification;
    rp.append(sec('Character', ta, h('div', { class: 'muted', style: { fontSize: '11px', marginTop: '6px' } }, `${t.fontFamily}, ${t.fontSize}px — change in the Type tool options`))); }
  rp.append(sec('Align', h('div', { class: 'icons' }, ...['alignL', 'alignC', 'alignR', 'alignT', 'alignM', 'alignB'].map(a => h('button', { class: 'icon-btn', 'data-tip': { alignL: 'Left', alignC: 'Horizontal center', alignR: 'Right', alignT: 'Top', alignM: 'Vertical center', alignB: 'Bottom' }[a], html: icon(a), onclick: () => align(a) })),
    h('button', { class: 'icon-btn', 'data-tip': 'Distribute horizontally', html: icon('swap'), onclick: () => distribute('h') }), h('button', { class: 'icon-btn', 'data-tip': 'Distribute vertically', html: icon('swap'), style: { transform: 'rotate(90deg)' }, onclick: () => distribute('v') })),
    h('div', { class: 'muted', style: { fontSize: '11px', marginTop: '6px' } }, sel.length > 1 ? 'Aligning to selection' : 'Aligning to artboard')));
  rp.append(sec('Pathfinder', h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px' } }, ...[['unite', 'Unite'], ['subtract', 'Minus front'], ['intersect', 'Intersect'], ['exclude', 'Exclude'], ['divide', 'Divide']].map(([k, l]) => h('button', { class: 'btn sm', onclick: () => pathfinder(k) }, l)))));
  rp.append(sec('Arrange', h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px' } }, h('button', { class: 'btn sm', onclick: () => arrange('front') }, 'To front'), h('button', { class: 'btn sm', onclick: () => arrange('fwd') }, 'Forward'), h('button', { class: 'btn sm', onclick: () => arrange('back') }, 'Backward'), h('button', { class: 'btn sm', onclick: () => arrange('bottom') }, 'To back'), h('button', { class: 'btn sm', onclick: duplicate }, 'Duplicate'), h('button', { class: 'btn sm', onclick: deleteSel }, 'Delete'))));
}
function renderLayersPanel() {
  if (rtab !== 'layers') return; const rp = $('#rp'); rp.innerHTML = '';
  const list = h('div', { class: 'layers-list', style: { padding: '6px' } });
  const ib = (ic, fn, tip) => h('span', { class: 'ib', 'data-tip': tip, html: icon(ic), onclick: e => { e.stopPropagation(); fn(); } });
  const label = it => it.name || (it instanceof P.PointText ? `“${it.content.slice(0, 18)}”` : it instanceof P.Group ? (it.clipped ? 'Clip group' : 'Group') : it instanceof P.CompoundPath ? 'Compound path' : it instanceof P.Raster ? 'Image' : 'Path');
  [...userLayers()].reverse().forEach(L => {
    list.append(h('div', { class: 'li layer' + (project.activeLayer === L ? ' sel' : ''), onclick: () => { L.activate(); renderLayersPanel(); }, ondblclick: async () => { const n = await prompt('Rename layer', 'Name', L.name); if (n) { L.name = n; commit('Rename layer'); } } },
      ib(L.visible ? 'eye' : 'eyeOff', () => { L.visible = !L.visible; renderLayersPanel(); commit('Layer visibility'); }, 'Visibility'), ib(L.locked ? 'lock' : 'unlock', () => { L.locked = !L.locked; if (L.locked) setSel(sel.filter(i => i.layer !== L)); renderLayersPanel(); }, 'Lock'), h('span', { class: 't' }, L.name), h('span', { class: 'muted' }, String(L.children.length))));
    [...L.children].reverse().forEach(it => { const fc = firstStyled(it)?.fillColor; list.append(h('div', { class: 'li' + (sel.includes(it) ? ' sel' : ''), style: { paddingLeft: '26px' }, onclick: e => { if (it.locked || !it.visible) return; setSel(e.shiftKey ? (sel.includes(it) ? sel.filter(x => x !== it) : [...sel, it]) : [it]); } },
      ib(it.visible ? 'eye' : 'eyeOff', () => { it.visible = !it.visible; if (!it.visible) setSel(sel.filter(x => x !== it)); renderLayersPanel(); commit('Visibility'); }, 'Visibility'), ib(it.locked ? 'lock' : 'unlock', () => { it.locked = !it.locked; if (it.locked) setSel(sel.filter(x => x !== it)); renderLayersPanel(); }, 'Lock'),
      h('span', { class: 'chip', style: { background: fc && !fc.gradient ? fc.toCSS(true) : '#666' } }), h('span', { class: 't' }, label(it)))); });
  });
  rp.append(h('div', { class: 'row', style: { padding: '8px 10px', borderBottom: '1px solid var(--line)' } }, h('button', { class: 'btn sm', onclick: () => { newUserLayer(); commit('New layer'); renderLayersPanel(); } }, '+ Layer'),
    h('button', { class: 'btn sm', onclick: () => { const L = project.activeLayer; if (userLayers().length < 2) return toast('Keep at least one layer'); L.remove(); activateUserLayer(); setSel([]); commit('Delete layer'); renderLayersPanel(); } }, 'Delete layer'),
    h('button', { class: 'btn sm', onclick: () => { const L = project.activeLayer; const n = L.nextSibling; if (n && n !== guideLayer) L.insertAbove(n); commit('Layer order'); renderLayersPanel(); } }, '↑'),
    h('button', { class: 'btn sm', onclick: () => { const L = project.activeLayer; const p = L.previousSibling; if (p && p !== artLayer) L.insertBelow(p); commit('Layer order'); renderLayersPanel(); } }, '↓'),
    sel.length ? h('button', { class: 'btn sm', onclick: () => { sel.forEach(i => project.activeLayer.addChild(i)); commit('Move to layer'); renderLayersPanel(); } }, 'Move sel. here') : ''), list);
}
const SWATCHES = ['#000000', '#3a3a3a', '#7a7a7a', '#bdbdbd', '#ffffff', '#ff5a5f', '#ff9a00', '#ffd400', '#a3e635', '#3ccf8e', '#14b8a6', '#31a8ff', '#2563eb', '#6366f1', '#9a7bff', '#d946ef', '#f43f5e', '#7c2d12', '#365314', '#0f172a', '#fde68a', '#fbcfe8', '#bae6fd', '#ddd6fe'];
const GRADS = [['#ff9a00', '#ff3d77'], ['#31a8ff', '#9a7bff'], ['#3ccf8e', '#0ea5e9'], ['#111111', '#666666'], ['#fde68a', '#f97316'], ['#ffffff', '#000000']];
function renderSwatches() {
  const rp = $('#rp'); rp.innerHTML = '';
  const g = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: '6px', padding: '12px' } });
  SWATCHES.forEach(c => g.append(h('div', { style: { aspectRatio: '1', borderRadius: '5px', background: c, cursor: 'pointer', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.15)' }, title: c, onclick: () => applyColor(c) })));
  const gg = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '6px', padding: '0 12px 12px' } });
  GRADS.forEach(([a, b]) => gg.append(h('div', { style: { aspectRatio: '1', borderRadius: '5px', background: `linear-gradient(135deg,${a},${b})`, cursor: 'pointer' }, onclick: () => { sel.forEach(s => eachStyled(s, i => { const bb = i.bounds; i.fillColor = { gradient: { stops: [a, b] }, origin: bb.topLeft, destination: bb.bottomRight }; })); commit('Gradient'); } })));
  rp.append(h('div', { class: 'sec' }, h('h4', {}, `Click to apply to ${O.front} (press X to switch)`)), g, h('div', { class: 'sec', style: { borderTop: '1px solid var(--line)' } }, h('h4', {}, 'Gradients (fill)')), gg);
}

// =====================================================================  selection & guides
function topItem(it) { while (it && it.parent && !(it.parent instanceof P.Layer)) it = it.parent; return it; }
function setSel(arr) {
  sel.forEach(i => { i.fullySelected = false; i.selected = false; }); selSegs = [];
  sel = arr.filter(i => i && !isSys(i) && !i.locked && !i.layer?.locked);
  if (O.tool === 'direct') sel.forEach(i => i.fullySelected = true);
  drawGuides(); renderProps(); renderFS(); renderOptions(); if (rtab === 'layers') renderLayersPanel();
  $('#stSel').textContent = sel.length ? `${sel.length} object${sel.length > 1 ? 's' : ''} selected` : '';
}
function selBounds() { let b = null; sel.forEach(i => { const ib = i.strokeBounds || i.bounds; b = b ? b.unite(ib) : ib.clone(); }); return b || new P.Rectangle(0, 0, 0, 0); }
function handlePoints(b) { return [b.topLeft, b.topCenter, b.topRight, b.rightCenter, b.bottomRight, b.bottomCenter, b.bottomLeft, b.leftCenter]; }
let marquee = null, penPreview = null;
function drawGuides() {
  guideLayer.removeChildren(); const z = view.zoom; const col = new P.Color('#ff9a00');
  if (O.tool !== 'direct' && sel.length) {
    sel.forEach(i => { if (sel.length > 1) new P.Path.Rectangle({ rectangle: i.bounds, strokeColor: col, strokeWidth: 0.5 / z, parent: guideLayer, opacity: 0.6 }); });
    const b = selBounds(); new P.Path.Rectangle({ rectangle: b, strokeColor: col, strokeWidth: 1 / z, parent: guideLayer });
    if (O.tool === 'select') handlePoints(b).forEach(p => new P.Path.Rectangle({ point: p.subtract(4 / z), size: 8 / z, fillColor: 'white', strokeColor: col, strokeWidth: 1 / z, parent: guideLayer }));
  }
  if (marquee) new P.Path.Rectangle({ from: marquee.from, to: marquee.to, strokeColor: '#4f8cff', fillColor: new P.Color(0.3, 0.55, 1, 0.08), dashArray: [4 / z, 4 / z], strokeWidth: 1 / z, parent: guideLayer });
  if (penPreview) { const pp = penPreview.clone(); pp.parent = guideLayer; }
  guideLayer.bringToFront();
}

// =====================================================================  view
function afterView() { $('#stZoom').textContent = Math.round(view.zoom * 100) + '%'; drawGuides(); if (O.grid) drawArtboard(); }
function fitArt() { const vs = view.viewSize; const z = Math.min((vs.width - 80) / DOC.w, (vs.height - 80) / DOC.h); view.zoom = z; view.center = new P.Point(DOC.w / 2, DOC.h / 2); afterView(); }
function zoomAt(f, pt) { const p0 = pt || view.center; const old = view.zoom; const nz = clamp(old * f, 0.02, 64); view.zoom = nz; const d = p0.subtract(view.center); view.center = view.center.add(d.multiply(1 - old / nz)); afterView(); }
UI.shortcut('ctrl+=', () => zoomAt(1.25)); UI.shortcut('ctrl++', () => zoomAt(1.25)); UI.shortcut('ctrl+shift++', () => zoomAt(1.25)); UI.shortcut('ctrl+-', () => zoomAt(0.8)); UI.shortcut('ctrl+0', fitArt); UI.shortcut('ctrl+1', () => { view.zoom = 1; afterView(); });
UI.shortcut('ctrl+y', toggleOutline); UI.shortcut("ctrl+'", () => { O.grid = !O.grid; drawArtboard(); }); UI.shortcut("ctrl+shift+'", () => { O.snap = !O.snap; toast('Snap to grid ' + (O.snap ? 'on' : 'off')); });
function toggleOutline() { O.outline = !O.outline; userLayers().forEach(L => L.getItems({ recursive: true }).forEach(i => { if (i instanceof P.Group || i instanceof P.Layer) return; if (O.outline) { i.data._o = { f: i.fillColor && i.fillColor.toCSS ? (i.fillColor.gradient ? null : i.fillColor.toCSS(true)) : null, s: i.strokeColor ? i.strokeColor.toCSS(true) : null, w: i.strokeWidth, sh: !!i.shadowColor }; i.fillColor = null; i.strokeColor = '#000'; i.strokeWidth = 1 / view.zoom; } else if (i.data._o) { const o = i.data._o; i.fillColor = o.f; i.strokeColor = o.s; i.strokeWidth = o.w; delete i.data._o; } })); toast('Outline mode ' + (O.outline ? 'on (Ctrl+Y to exit)' : 'off')); }
cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(); const pt = view.viewToProject(new P.Point(e.clientX - r.left, e.clientY - r.top)); if (e.ctrlKey || e.altKey) zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, pt); else { view.center = view.center.add(new P.Point(e.shiftKey ? e.deltaY : e.deltaX, e.shiftKey ? 0 : e.deltaY).divide(view.zoom)); afterView(); } }, { passive: false });

// =====================================================================  tools (single paper tool dispatcher)
const tool = new P.Tool(); tool.minDistance = 0;
let spaceDown = false, panStart = null, drag = null, cur = null, pen = null, lastClick = 0;
window.addEventListener('keydown', e => { if (e.code === 'Space' && !e.target.closest('input,textarea,select') && !spaceDown) { spaceDown = true; cv.style.cursor = 'grab'; e.preventDefault(); } });
window.addEventListener('keyup', e => { if (e.code === 'Space') { spaceDown = false; updateCursor(); } });
const snap = p => O.snap ? new P.Point(Math.round(p.x / O.gridSize) * O.gridSize, Math.round(p.y / O.gridSize) * O.gridSize) : p;
const hitOpts = extra => ({ fill: true, stroke: true, segments: true, tolerance: 6 / view.zoom, match: r => !isSys(r.item) && !r.item.locked && r.item.visible && !r.item.layer?.locked, ...extra });
function styleNew(item, opts = {}) { item.fillColor = opts.noFill ? null : O.fill; item.strokeColor = O.stroke; item.strokeWidth = O.stroke ? (O.sw || 1) : 0; if (opts.line && !O.stroke) { item.strokeColor = O.fill || '#000'; item.strokeWidth = O.sw || 1; } return item; }
tool.onMouseDown = e => {
  const ev = e.event; const now = Date.now(); const dbl = now - lastClick < 320; lastClick = now;
  if (spaceDown || O.tool === 'hand' || ev.button === 1) { panStart = { pt: new P.Point(ev.clientX, ev.clientY), c: view.center.clone() }; return; }
  if (ev.button === 2) return;
  if (textEd) finishText(true);
  const t = O.tool, pt = snap(e.point);
  switch (t) {
    case 'zoom': zoomAt(e.modifiers.alt ? 0.8 : 1.25, e.point); return;
    case 'select': return selectDown(e, dbl);
    case 'direct': return directDown(e, dbl);
    case 'pen': return penDown(e);
    case 'pencil': case 'brush': cur = new P.Path({ strokeColor: t === 'brush' ? (O.stroke || O.fill || '#000') : (O.stroke || '#000'), strokeWidth: t === 'brush' ? O.brushW : (O.sw || 1), strokeCap: 'round', strokeJoin: 'round', fillColor: null }); cur.add(e.point); return;
    case 'rect': case 'ellipse': case 'polygon': case 'star': case 'line': drag = { start: pt }; return;
    case 'text': { const hit = project.hitTest(e.point, hitOpts({ segments: false })); const ti = hit && topItem(hit.item); if (ti instanceof P.PointText) { setSel([ti]); editText(ti); } else createText(pt); return; }
    case 'eyedrop': { const hit = project.hitTest(e.point, hitOpts({ segments: false })); if (!hit) return; const src = hit.item; if (sel.length) { sel.forEach(s => eachStyled(s, i => { i.fillColor = src.fillColor ? src.fillColor.clone() : null; i.strokeColor = src.strokeColor ? src.strokeColor.clone() : null; i.strokeWidth = src.strokeWidth; i.dashArray = src.dashArray; i.opacity = src.opacity; if (src instanceof P.PointText && i instanceof P.PointText) { i.fontFamily = src.fontFamily; i.fontSize = src.fontSize; i.fontWeight = src.fontWeight; } })); commit('Eyedropper'); } O.fill = src.fillColor && !src.fillColor.gradient ? src.fillColor.toCSS(true) : O.fill; O.stroke = src.strokeColor ? src.strokeColor.toCSS(true) : null; O.sw = src.strokeWidth; renderFS(); renderOptions(); renderProps(); return; }
    case 'scissors': { const hit = project.hitTest(e.point, hitOpts({ fill: false, segments: true })); if (!hit || !(hit.item instanceof P.Path)) return toast('Click on a path stroke'); const path = hit.item; const loc = hit.location || path.getNearestLocation(e.point); if (path.closed) { path.splitAt(loc); } else { const rest = path.splitAt(loc); if (rest) setSel([path, rest]); } commit('Scissors'); return; }
    case 'gradient': drag = { start: e.point }; return;
  }
};
tool.onMouseDrag = e => {
  const ev = e.event;
  if (panStart) { const d = new P.Point(ev.clientX, ev.clientY).subtract(panStart.pt).divide(view.zoom); view.center = panStart.c.subtract(d); afterView(); return; }
  const t = O.tool, pt = snap(e.point);
  if (t === 'select') return selectDrag(e);
  if (t === 'direct') return directDrag(e);
  if (t === 'pen') return penDrag(e);
  if ((t === 'pencil' || t === 'brush') && cur) { cur.add(e.point); return; }
  if (['rect', 'ellipse', 'polygon', 'star', 'line'].includes(t) && drag) {
    cur?.remove(); let a = drag.start, b = pt;
    if (e.modifiers.shift) { if (t === 'line') { const v = b.subtract(a); const ang = Math.round(v.angle / 45) * 45; b = a.add(new P.Point({ length: v.length, angle: ang })); } else { const d = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)); b = new P.Point(a.x + Math.sign(b.x - a.x || 1) * d, a.y + Math.sign(b.y - a.y || 1) * d); } }
    if (e.modifiers.alt && t !== 'line') a = a.subtract(b.subtract(a));
    const r = new P.Rectangle(a, b);
    if (t === 'rect') cur = new P.Path.Rectangle({ rectangle: r, radius: Math.min(O.radius, r.width / 2, r.height / 2) });
    else if (t === 'ellipse') cur = new P.Path.Ellipse(r);
    else if (t === 'polygon') { cur = new P.Path.RegularPolygon({ center: drag.start, sides: O.sides, radius: Math.max(1, drag.start.getDistance(pt)) }); cur.rotate(pt.subtract(drag.start).angle + 90, drag.start); }
    else if (t === 'star') { const rr = Math.max(1, drag.start.getDistance(pt)); cur = new P.Path.Star({ center: drag.start, points: O.sides, radius1: rr, radius2: rr * O.starRatio }); cur.rotate(pt.subtract(drag.start).angle + 90, drag.start); }
    else cur = new P.Path.Line(a, b);
    styleNew(cur, { line: t === 'line', noFill: t === 'line' }); return;
  }
  if (t === 'gradient' && drag) { cur?.remove(); cur = new P.Path.Line({ from: drag.start, to: e.point, strokeColor: '#ff9a00', strokeWidth: 2 / view.zoom, parent: guideLayer }); return; }
};
tool.onMouseUp = e => {
  if (panStart) { panStart = null; return; }
  const t = O.tool;
  if (t === 'select') return selectUp(e);
  if (t === 'direct') return directUp(e);
  if ((t === 'pencil' || t === 'brush') && cur) { const p = cur; cur = null; if (p.segments.length < 2) { p.remove(); return; } if (O.smooth) p.simplify(O.smooth / 4); if (p.firstSegment.point.getDistance(p.lastSegment.point) < 8 / view.zoom && p.segments.length > 4) { p.closed = true; if (t === 'pencil' && O.fill) p.fillColor = O.fill; } setSel([p]); commit(t === 'brush' ? 'Paintbrush' : 'Pencil'); return; }
  if (['rect', 'ellipse', 'polygon', 'star', 'line'].includes(t) && drag) {
    if (!cur) { // click without drag → size dialog
      const s = drag.start; drag = null; shapeDialog(t, s); return; }
    const c = cur; cur = null; drag = null; setSel([c]); commit({ rect: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygon', star: 'Star', line: 'Line' }[t]); return;
  }
  if (t === 'gradient' && drag) { const a = drag.start, b = e.point; cur?.remove(); cur = null; drag = null; if (!sel.length || a.getDistance(b) < 3) return; sel.forEach(s => eachStyled(s, i => { i.fillColor = { gradient: { stops: [O.fill || '#ffffff', O.stroke || '#000000'], radial: e.modifiers.alt }, origin: a, destination: b }; })); commit('Gradient'); renderFS(); renderProps(); return; }
};
tool.onMouseMove = e => {
  $('#stPos').textContent = `X ${Math.round(e.point.x)}  Y ${Math.round(e.point.y)}`;
  if (O.tool === 'pen' && pen) { penPreview?.remove(); const last = pen.lastSegment; penPreview = new P.Path({ segments: [new P.Segment(last.point, null, last.handleOut), new P.Segment(snap(e.point))], strokeColor: '#4f8cff', strokeWidth: 1 / view.zoom, insert: false }); drawGuides(); }
  if (O.tool === 'select' && !drag && sel.length) { const b = selBounds(), z = view.zoom; const hi = handlePoints(b).findIndex(p => p.getDistance(e.point) < 7 / z); cv.style.cursor = hi >= 0 ? (hi % 4 === 1 ? 'ns-resize' : hi % 4 === 3 ? 'ew-resize' : hi === 0 || hi === 4 ? 'nwse-resize' : 'nesw-resize') : nearCornerOutside(b, e.point) ? 'alias' : 'default'; }
};

// ---- selection tool
function nearCornerOutside(b, p) { const z = view.zoom; return [b.topLeft, b.topRight, b.bottomRight, b.bottomLeft].some(c => { const d = c.getDistance(p); return d > 6 / z && d < 22 / z; }) && !b.expand(2 / z).contains(p); }
function selectDown(e, dbl) {
  const p = e.point, z = view.zoom;
  if (sel.length) {
    const b = selBounds(); const hi = handlePoints(b).findIndex(q => q.getDistance(p) < 7 / z);
    if (hi >= 0) { drag = { kind: 'scale', hi, b0: b.clone(), last: b.clone() }; return; }
    if (nearCornerOutside(b, p)) { drag = { kind: 'rotate', c: b.center, a0: p.subtract(b.center).angle, applied: 0 }; return; }
  }
  const hit = project.hitTest(p, hitOpts({ segments: false }));
  if (hit) {
    const it = topItem(hit.item);
    if (dbl && it instanceof P.PointText) { editText(it); return; }
    if (dbl && it instanceof P.Group) { setSel([hit.item]); return; }
    if (e.modifiers.shift) setSel(sel.includes(it) ? sel.filter(x => x !== it) : [...sel, it]); else if (!sel.includes(it)) setSel([it]);
    if (e.modifiers.alt && sel.length) { const copies = sel.map(i => { const c = i.clone(); return c; }); sel.forEach(i => i.fullySelected = false); setSel(copies); drag = { kind: 'move', dup: true, start: p, total: new P.Point(0, 0) }; return; }
    drag = { kind: 'move', start: p, total: new P.Point(0, 0) }; return;
  }
  if (!e.modifiers.shift) setSel([]);
  marquee = { from: p, to: p, add: e.modifiers.shift }; drag = { kind: 'marquee' };
}
function selectDrag(e) {
  if (!drag) return; const p = e.point;
  if (drag.kind === 'move') { let d = e.delta; if (O.snap && sel.length) { const b = selBounds(); const target = snap(b.topLeft.add(d)); d = target.subtract(b.topLeft); } if (e.modifiers.shift) { const tot = drag.total.add(d); const want = Math.abs(tot.x) > Math.abs(tot.y) ? new P.Point(tot.x, 0) : new P.Point(0, tot.y); d = want.subtract(drag.total); } drag.total = drag.total.add(d); sel.forEach(i => i.position = i.position.add(d)); drag.moved = true; drawGuides(); }
  else if (drag.kind === 'scale') {
    const b0 = drag.b0, hi = drag.hi; const dirs = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]][hi];
    let x0 = b0.left, y0 = b0.top, x1 = b0.right, y1 = b0.bottom; const q = snap(p);
    if (dirs[0] < 0) x0 = q.x; if (dirs[0] > 0) x1 = q.x; if (dirs[1] < 0) y0 = q.y; if (dirs[1] > 0) y1 = q.y;
    if (e.modifiers.alt) { const c = b0.center; if (dirs[0]) { const hw = Math.abs(q.x - c.x); x0 = c.x - hw; x1 = c.x + hw; } if (dirs[1]) { const hh = Math.abs(q.y - c.y); y0 = c.y - hh; y1 = c.y + hh; } }
    let nb = new P.Rectangle(new P.Point(Math.min(x0, x1), Math.min(y0, y1)), new P.Point(Math.max(x0, x1), Math.max(y0, y1)));
    if (e.modifiers.shift && dirs[0] && dirs[1]) { const k = Math.max(nb.width / b0.width, nb.height / b0.height); const w = b0.width * k, hgt = b0.height * k; nb = new P.Rectangle(dirs[0] < 0 ? b0.right - w : b0.left, dirs[1] < 0 ? b0.bottom - hgt : b0.top, w, hgt); }
    if (nb.width < 1 || nb.height < 1) return;
    const cur0 = drag.last; const sx = (nb.width / (cur0.width || 1)) * (Math.sign(x1 - x0) || 1) * (drag.fx || 1), sy = (nb.height / (cur0.height || 1));
    const anchor = new P.Point(dirs[0] < 0 ? cur0.right : dirs[0] > 0 ? cur0.left : cur0.center.x, dirs[1] < 0 ? cur0.bottom : dirs[1] > 0 ? cur0.top : cur0.center.y);
    sel.forEach(i => { i.scale(Math.abs(sx) || 1, sy || 1, anchor); });
    const ac = selBounds(); sel.forEach(i => i.position = i.position.add(nb.topLeft.subtract(ac.topLeft)));
    drag.last = selBounds(); drag.moved = true; drawGuides();
  }
  else if (drag.kind === 'rotate') { let total = p.subtract(drag.c).angle - drag.a0; if (e.modifiers.shift) total = Math.round(total / 15) * 15; const d = total - drag.applied; sel.forEach(i => i.rotate(d, drag.c)); drag.applied = total; drag.moved = true; drawGuides(); }
  else if (drag.kind === 'marquee') { marquee.to = p; drawGuides(); }
}
function selectUp(e) {
  if (!drag) return; const d = drag; drag = null;
  if (d.kind === 'marquee') { const r = new P.Rectangle(marquee.from, marquee.to); const add = marquee.add; marquee = null; const items = userLayers().filter(L => L.visible && !L.locked).flatMap(L => L.children.filter(i => i.visible && !i.locked && (r.intersects(i.bounds) || r.contains(i.bounds)) && (r.contains(i.bounds) || i.intersects?.(new P.Path.Rectangle({ rectangle: r, insert: false })) || r.contains(i.bounds.center)))); setSel(add ? [...new Set([...sel, ...items])] : items); return; }
  if (d.moved || d.dup) commit({ move: d.dup ? 'Duplicate' : 'Move', scale: 'Scale', rotate: 'Rotate' }[d.kind]); renderProps();
}

// ---- direct selection
function directDown(e, dbl) {
  const hit = project.hitTest(e.point, hitOpts({ handles: true, segments: true, fill: true, stroke: true }));
  if (!hit) { if (!e.modifiers.shift) { selSegs.forEach(s => s.selected = false); selSegs = []; setSel([]); } marquee = { from: e.point, to: e.point }; drag = { kind: 'marquee' }; return; }
  const item = hit.item;
  if (!(item instanceof P.Path)) { setSel([topItem(item)]); drag = { kind: 'move', moved: false }; return; }
  if (!sel.includes(item)) { sel.forEach(i => i.fullySelected = false); sel = [item]; item.fullySelected = true; renderProps(); renderFS(); }
  if (hit.type === 'segment') {
    const seg = hit.segment;
    if (dbl) { if (seg.hasHandles()) seg.clearHandles(); else seg.smooth({ type: 'catmull-rom' }); commit('Toggle smooth'); return; }
    if (e.modifiers.shift) { seg.selected = !seg.selected; selSegs = seg.selected ? [...selSegs, seg] : selSegs.filter(s => s !== seg); }
    else if (!seg.selected) { item.segments.forEach(s => s.selected = false); selSegs.forEach(s => s.selected = false); seg.selected = true; selSegs = [seg]; }
    drag = { kind: 'segs', moved: false }; return;
  }
  if (hit.type === 'handle-in' || hit.type === 'handle-out') { const seg = hit.segment; const smooth = seg.handleIn.length && seg.handleOut.length && Math.abs(seg.handleIn.angle - seg.handleOut.angle + 180) % 360 < 3; drag = { kind: 'handle', seg, which: hit.type === 'handle-in' ? 'handleIn' : 'handleOut', smooth: smooth && !e.modifiers.alt }; return; }
  if (e.modifiers.alt && (hit.type === 'stroke' || hit.type === 'curve')) { const loc = item.getNearestLocation(e.point); const seg = item.divideAt(loc); if (seg) { selSegs.forEach(s => s.selected = false); seg.selected = true; selSegs = [seg]; } commit('Add anchor'); drag = { kind: 'segs' }; return; }
  // clicked on fill/stroke: select whole path and drag it
  item.segments.forEach(s => s.selected = true); selSegs = [...item.segments]; drag = { kind: 'segs', moved: false };
}
function directDrag(e) {
  if (!drag) return;
  if (drag.kind === 'segs') { const d = e.delta; selSegs.forEach(s => s.point = s.point.add(d)); drag.moved = true; }
  else if (drag.kind === 'handle') { const s = drag.seg; s[drag.which] = e.point.subtract(s.point); if (drag.smooth) { const o = drag.which === 'handleIn' ? 'handleOut' : 'handleIn'; s[o] = s[drag.which].normalize(-s[o].length); } drag.moved = true; }
  else if (drag.kind === 'move') { sel.forEach(i => i.position = i.position.add(e.delta)); drag.moved = true; }
  else if (drag.kind === 'marquee') { marquee.to = e.point; drawGuides(); }
}
function directUp() {
  if (!drag) return; const d = drag; drag = null;
  if (d.kind === 'marquee') { const r = new P.Rectangle(marquee.from, marquee.to); marquee = null; const paths = userLayers().flatMap(L => L.getItems({ class: P.Path, recursive: true })).filter(p => !p.locked && p.visible && !isSys(p)); selSegs = []; const touched = []; paths.forEach(p => { let any = false; p.segments.forEach(s => { if (r.contains(s.point)) { s.selected = true; selSegs.push(s); any = true; } }); if (any) touched.push(p); }); sel.forEach(i => i.fullySelected = false); sel = touched; sel.forEach(p => { p.fullySelected = true; p.segments.forEach(s => s.selected = r.contains(s.point)); }); drawGuides(); renderProps(); return; }
  if (d.moved) { commit(d.kind === 'handle' ? 'Edit handle' : 'Move anchor'); renderProps(); }
}

// ---- pen
function penDown(e) {
  const pt = snap(e.point);
  if (!pen) { pen = styleNew(new P.Path(), {}); if (!O.stroke) { pen.strokeColor = '#000'; pen.strokeWidth = 1; } pen.fillColor = null; pen.add(pt); pen.fullySelected = true; drag = { seg: pen.lastSegment }; return; }
  if (pen.segments.length > 1 && pt.getDistance(pen.firstSegment.point) < 8 / view.zoom) { pen.closed = true; pen.fillColor = O.fill; drag = { seg: pen.firstSegment, closing: true }; return; }
  pen.add(pt); drag = { seg: pen.lastSegment };
}
function penDrag(e) { if (!pen || !drag) return; const s = drag.seg; const v = e.point.subtract(s.point); if (drag.closing) { s.handleIn = v.multiply(-1); if (!e.modifiers.alt) s.handleOut = v; } else { s.handleOut = v; if (!e.modifiers.alt) s.handleIn = v.multiply(-1); } }
tool.onMouseUp = (orig => e => { if (O.tool === 'pen') { if (drag?.closing) { drag = null; finishPen(); return; } drag = null; return; } orig(e); })(tool.onMouseUp);
function finishPen() { if (!pen) return; const p = pen; pen = null; penPreview?.remove(); penPreview = null; p.fullySelected = false; if (p.segments.length < 2) { p.remove(); drawGuides(); return; } setSel([p]); commit('Pen path'); }
UI.shortcut('enter', () => { if (pen) finishPen(); });
UI.shortcut('escape', () => { if (pen) finishPen(); else if (textEd) finishText(false); else setSel([]); });

// ---- shapes by dialog
async function shapeDialog(t, at) {
  if (t === 'line') return;
  const v = await form({ title: { rect: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygon', star: 'Star' }[t], fields: t === 'rect' || t === 'ellipse' ? [{ key: 'w', label: 'Width', type: 'number', value: 200 }, { key: 'h', label: 'Height', type: 'number', value: 120 }, ...(t === 'rect' ? [{ key: 'r', label: 'Corner radius', type: 'number', value: O.radius }] : [])] : [{ key: 'r', label: 'Radius', type: 'number', value: 100 }, { key: 'n', label: t === 'star' ? 'Points' : 'Sides', type: 'number', value: O.sides }] });
  if (!v) return; let it;
  if (t === 'rect') it = new P.Path.Rectangle({ point: at, size: [v.w, v.h], radius: +v.r || 0 }); else if (t === 'ellipse') it = new P.Path.Ellipse({ point: at, size: [v.w, v.h] });
  else if (t === 'polygon') it = new P.Path.RegularPolygon({ center: at, sides: Math.max(3, v.n), radius: v.r }); else it = new P.Path.Star({ center: at, points: Math.max(3, v.n), radius1: v.r, radius2: v.r * O.starRatio });
  styleNew(it); setSel([it]); commit('Shape');
}

// ---- text
let textEd = null;
function createText(pt) { const t = new P.PointText({ point: pt.add([0, O.fontSize * 0.8]), content: '', fontFamily: O.font, fontSize: O.fontSize, fontWeight: O.fontWeight, justification: O.justify, fillColor: O.fill && O.fill !== '#ffffff' ? O.fill : '#111111' }); editText(t, true); }
function editText(t, isNew) {
  const ta = h('textarea', { class: 'text-in', spellcheck: 'false' }); ta.value = t.content;
  const place = () => { const b = t.content ? t.bounds : new P.Rectangle(t.point.subtract([0, t.fontSize * 0.8]), new P.Size(10, t.fontSize)); const tl = view.projectToView(b.topLeft); ta.style.left = tl.x + 'px'; ta.style.top = tl.y + 'px'; ta.style.font = `${t.fontWeight === 'italic' ? 'italic ' : ''}${/^\d+$|bold/.test(t.fontWeight) ? t.fontWeight + ' ' : ''}${t.fontSize * view.zoom}px "${t.fontFamily}"`; const lines = ta.value.split('\n'); const cx = document.createElement('canvas').getContext('2d'); cx.font = ta.style.font; ta.style.width = Math.max(30, ...lines.map(l => cx.measureText(l).width)) + 16 + 'px'; ta.style.height = lines.length * t.fontSize * view.zoom * 1.25 + 4 + 'px'; ta.style.textAlign = t.justification; };
  t.visible = false; vpEl.append(ta); place(); ta.oninput = place;
  textEd = { t, ta, isNew }; setTimeout(() => { ta.focus(); ta.select(); }, 20);
  ta.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') finishText(true); });
}
function finishText(commitIt) {
  if (!textEd) return; const { t, ta, isNew } = textEd; textEd = null; ta.remove(); t.visible = true;
  if (commitIt) t.content = ta.value;
  if (!t.content.trim()) { t.remove(); if (!isNew) commit('Delete text'); setSel([]); return; }
  setSel([t]); commit(isNew ? 'Type' : 'Edit type');
}

// =====================================================================  edit ops
let clip = null;
function copy() { if (!sel.length) return; clip = sel.map(i => i.exportJSON({ asString: false })); toast(`Copied ${sel.length} object(s)`); }
function cut() { copy(); deleteSel(); }
function paste(inPlace) { if (!clip) return; const items = clip.map(j => { const it = project.activeLayer.importJSON(j); return it; }); if (!inPlace) items.forEach(i => i.position = i.position.add(new P.Point(10, 10))); setSel(items); commit('Paste'); }
function duplicate() { if (!sel.length) return; const c = sel.map(i => { const x = i.clone(); x.position = x.position.add([10, 10]); return x; }); setSel(c); commit('Duplicate'); }
function deleteSel() {
  if (O.tool === 'direct' && selSegs.length) { const paths = new Set(selSegs.map(s => s.path)); selSegs.forEach(s => s.remove()); paths.forEach(p => { if (p.segments.length < 2) p.remove(); }); selSegs = []; setSel([...paths].filter(p => p.parent)); commit('Delete anchors'); return; }
  if (!sel.length) return; sel.forEach(i => i.remove()); setSel([]); commit('Delete');
}
function selectAll() { setSel(userLayers().filter(L => L.visible && !L.locked).flatMap(L => L.children.filter(i => i.visible && !i.locked))); }
function selectInverse() { const all = userLayers().flatMap(L => L.children.filter(i => i.visible && !i.locked)); setSel(all.filter(i => !sel.includes(i))); }
function selectSame(which) { if (!sel.length) return; const ref = firstStyled(sel[0]); const c = which === 'fill' ? ref.fillColor : ref.strokeColor; if (!c) return; const css = c.toCSS(true); setSel(userLayers().flatMap(L => L.children).filter(i => { const s = firstStyled(i); const cc = s && (which === 'fill' ? s.fillColor : s.strokeColor); return cc && !cc.gradient && cc.toCSS(true) === css; })); }
UI.shortcut('ctrl+c', copy); UI.shortcut('ctrl+x', cut); UI.shortcut('ctrl+v', () => paste(false)); UI.shortcut('ctrl+shift+v', () => paste(true)); UI.shortcut('ctrl+d', duplicate);
UI.shortcut('delete', deleteSel); UI.shortcut('backspace', deleteSel); UI.shortcut('ctrl+a', selectAll); UI.shortcut('ctrl+shift+a', () => setSel([]));
['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].forEach(k => { const d = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k]; const go = m => { if (O.tool === 'direct' && selSegs.length) selSegs.forEach(s => s.point = s.point.add(new P.Point(d).multiply(m))); else moveSel(d[0] * m, d[1] * m); drawGuides(); commitDebounced('Nudge'); renderProps(); }; UI.shortcut(k, () => go(1)); UI.shortcut('shift+' + k, () => go(10)); });
function moveSel(dx, dy) { sel.forEach(i => i.position = i.position.add([dx, dy])); }
function rotateSel(a) { const c = selBounds().center; sel.forEach(i => i.rotate(a, c)); commit('Rotate'); drawGuides(); renderProps(); }
function reflect(axis) { if (!sel.length) return; const c = selBounds().center; sel.forEach(i => i.scale(axis === 'h' ? -1 : 1, axis === 'v' ? -1 : 1, c)); commit('Reflect'); drawGuides(); }
async function moveDialog() { if (!sel.length) return; const v = await form({ title: 'Move', fields: [{ key: 'x', label: 'Horizontal', type: 'number', value: 0 }, { key: 'y', label: 'Vertical', type: 'number', value: 0 }, { key: 'copy', label: 'Copy', type: 'checkbox', value: false }] }); if (!v) return; if (v.copy) setSel(sel.map(i => i.clone())); moveSel(v.x, v.y); commit('Move'); drawGuides(); }
async function rotateDialog() { if (!sel.length) return; const v = await form({ title: 'Rotate', fields: [{ key: 'a', label: 'Angle°', type: 'number', value: 45 }, { key: 'copy', label: 'Copy', type: 'checkbox', value: false }] }); if (!v) return; if (v.copy) setSel(sel.map(i => i.clone())); rotateSel(v.a); }
async function scaleDialog() { if (!sel.length) return; const v = await form({ title: 'Scale', fields: [{ key: 'x', label: 'Horizontal %', type: 'number', value: 100 }, { key: 'y', label: 'Vertical %', type: 'number', value: 100 }, { key: 'strokes', label: 'Scale strokes', type: 'checkbox', value: false }] }); if (!v) return; const c = selBounds().center; sel.forEach(i => { i.scale(v.x / 100, v.y / 100, c); if (v.strokes) eachStyled(i, s => s.strokeWidth *= Math.sqrt(v.x * v.y) / 100); }); commit('Scale'); drawGuides(); }
UI.shortcut('ctrl+shift+m', moveDialog);
function arrange(how) { if (!sel.length) return; const s = [...sel].sort((a, b) => a.index - b.index); if (how === 'front') s.forEach(i => i.bringToFront()); else if (how === 'bottom') [...s].reverse().forEach(i => i.sendToBack()); else if (how === 'fwd') [...s].reverse().forEach(i => { const n = i.nextSibling; if (n && !sel.includes(n)) i.insertAbove(n); }); else s.forEach(i => { const p = i.previousSibling; if (p && !sel.includes(p)) i.insertBelow(p); }); commit('Arrange'); }
UI.shortcut('ctrl+shift+]', () => arrange('front')); UI.shortcut('ctrl+]', () => arrange('fwd')); UI.shortcut('ctrl+[', () => arrange('back')); UI.shortcut('ctrl+shift+[', () => arrange('bottom'));
function group() { if (sel.length < 2) return; const s = [...sel].sort((a, b) => a.index - b.index); const top = s[s.length - 1]; const g = new P.Group(); g.insertAbove(top); g.addChildren(s); setSel([g]); commit('Group'); }
function ungroup() { const out = []; sel.forEach(i => { if (i instanceof P.Group) { if (i.clipped) { i.children[0].clipMask = false; } const kids = i.removeChildren(); i.parent.insertChildren(i.index, kids); i.remove(); out.push(...kids); } else if (i instanceof P.CompoundPath) out.push(i); else out.push(i); }); setSel(out); commit('Ungroup'); }
UI.shortcut('ctrl+g', group); UI.shortcut('ctrl+shift+g', ungroup);
function lockSel() { sel.forEach(i => i.locked = true); setSel([]); commit('Lock'); }
function unlockAll() { userLayers().forEach(L => L.getItems({ recursive: true }).forEach(i => i.locked = false)); commit('Unlock all'); renderLayersPanel(); }
function hideSel() { sel.forEach(i => i.visible = false); setSel([]); commit('Hide'); }
function showAll() { userLayers().forEach(L => L.getItems({ recursive: true }).forEach(i => i.visible = true)); commit('Show all'); renderLayersPanel(); }
UI.shortcut('ctrl+2', lockSel); UI.shortcut('ctrl+alt+2', unlockAll); UI.shortcut('ctrl+3', hideSel); UI.shortcut('ctrl+alt+3', showAll);
function joinPaths() { const ps = sel.filter(i => i instanceof P.Path && !i.closed); if (ps.length === 1) { ps[0].closed = true; commit('Close path'); return; } if (ps.length < 2) return toast('Select two open paths'); const a = ps[0]; ps.slice(1).forEach(b => a.join(b, 10 / view.zoom)); setSel([a]); commit('Join'); }
UI.shortcut('ctrl+j', joinPaths);
function pathOp(op) { const ps = sel.flatMap(i => i instanceof P.Path ? [i] : i.getItems ? i.getItems({ class: P.Path }) : []); if (!ps.length) return toast('Select paths'); ps.forEach(p => { if (op === 'simplify') p.simplify(2.5); else if (op === 'smooth') p.smooth({ type: 'continuous' }); else if (op === 'flatten') p.flatten(2); else if (op === 'reverse') p.reverse(); else if (op === 'close') p.closed = true; }); commit({ simplify: 'Simplify', smooth: 'Smooth', flatten: 'Flatten', reverse: 'Reverse', close: 'Close path' }[op]); drawGuides(); }
function makeCompound() { const ps = sel.filter(i => i instanceof P.Path || i instanceof P.CompoundPath); if (ps.length < 2) return toast('Select two or more paths'); const s = [...ps].sort((a, b) => a.index - b.index); const cp = new P.CompoundPath({ fillRule: 'evenodd' }); cp.insertAbove(s[s.length - 1]); cp.style = s[0].style; s.forEach(p => cp.addChildren(p instanceof P.CompoundPath ? p.removeChildren() : [p])); ps.filter(p => p instanceof P.CompoundPath).forEach(p => p.remove()); setSel([cp]); commit('Compound path'); }
function releaseCompound() { const out = []; sel.forEach(i => { if (i instanceof P.CompoundPath) { const st = i.style; const kids = i.removeChildren(); kids.forEach(k => k.style = st); i.parent.insertChildren(i.index, kids); i.remove(); out.push(...kids); } else out.push(i); }); setSel(out); commit('Release compound path'); }
UI.shortcut('ctrl+8', makeCompound); UI.shortcut('ctrl+alt+shift+8', releaseCompound);
function makeClip() { if (sel.length < 2) return toast('Select the artwork and a shape on top to use as the mask'); const s = [...sel].sort((a, b) => a.index - b.index); const mask = s.pop(); const g = new P.Group(); g.insertAbove(mask); g.addChild(mask); g.addChildren(s); g.clipped = true; setSel([g]); commit('Clipping mask'); }
UI.shortcut('ctrl+7', makeClip); UI.shortcut('ctrl+alt+7', ungroup);
function pathfinder(op) {
  const ps = sel.filter(i => i instanceof P.Path || i instanceof P.CompoundPath).sort((a, b) => a.index - b.index);
  if (ps.length < 2) return toast('Select two or more closed shapes');
  if (op === 'divide') { const out = []; const pieces = [ps[0]]; for (let k = 1; k < ps.length; k++) { const nxt = []; for (const p of pieces) { nxt.push(p.subtract(ps[k], { insert: false }), p.intersect(ps[k], { insert: false })); } nxt.push(ps.slice(0, k).reduce((acc, p) => acc.subtract(p, { insert: false }), ps[k])); pieces.splice(0, pieces.length, ...nxt.filter(x => x && !x.isEmpty())); } const parent = ps[ps.length - 1]; pieces.forEach(p => { p.insertAbove(parent); out.push(p); }); ps.forEach(p => p.remove()); setSel(out); commit('Divide'); return; }
  let res;
  if (op === 'subtract') { const front = ps[ps.length - 1]; res = ps.slice(0, -1).reduce((acc, p) => acc ? acc.unite(p, { insert: false }) : p.clone({ insert: false }), null); res = res.subtract(front, { insert: false }); res.style = ps[0].style; }
  else { res = ps[0].clone({ insert: false }); for (let k = 1; k < ps.length; k++) res = res[op](ps[k], { insert: false }); res.style = op === 'unite' ? ps[ps.length - 1].style : ps[0].style; }
  res.insertAbove(ps[ps.length - 1]); ps.forEach(p => p.remove()); setSel([res]); commit({ unite: 'Unite', subtract: 'Minus front', intersect: 'Intersect', exclude: 'Exclude' }[op]);
}
function outlineStroke() { const out = []; sel.forEach(i => { if (!(i instanceof P.Path) || !i.strokeColor || !i.strokeWidth) { out.push(i); return; } const w = i.strokeWidth / 2; const pts = []; const len = i.length; const n = Math.max(8, Math.ceil(len / 3)); const L = [], R = []; for (let k = 0; k <= n; k++) { const off = Math.min(len, len * k / n); const p = i.getPointAt(off), nn = i.getNormalAt(off); if (!p || !nn) continue; L.push(p.add(nn.multiply(w))); R.push(p.subtract(nn.multiply(w))); } const shape = new P.Path({ segments: [...L, ...R.reverse()], closed: true, fillColor: i.strokeColor, insert: false }); shape.simplify(0.5); shape.insertAbove(i); if (i.fillColor && i.closed) { i.strokeColor = null; out.push(i, shape); } else { i.remove(); out.push(shape); } }); setSel(out); commit('Outline stroke'); }
function rasterizeSel() { if (!sel.length) return; const out = sel.map(i => { const r = i.rasterize({ resolution: 300, insert: false }); r.insertAbove(i); i.remove(); return r; }); setSel(out); commit('Rasterize'); }
function align(kind) {
  if (!sel.length) return; const ref = sel.length > 1 ? selBounds() : new P.Rectangle(0, 0, DOC.w, DOC.h);
  sel.forEach(i => { const b = i.strokeBounds; const d = { alignL: [ref.left - b.left, 0], alignC: [ref.center.x - b.center.x, 0], alignR: [ref.right - b.right, 0], alignT: [0, ref.top - b.top], alignM: [0, ref.center.y - b.center.y], alignB: [0, ref.bottom - b.bottom] }[kind]; i.position = i.position.add(d); });
  commit('Align'); drawGuides(); renderProps();
}
function distribute(axis) { if (sel.length < 3) return toast('Select three or more objects'); const s = [...sel].sort((a, b) => axis === 'h' ? a.bounds.center.x - b.bounds.center.x : a.bounds.center.y - b.bounds.center.y); const first = s[0].bounds.center, last = s[s.length - 1].bounds.center; s.forEach((i, k) => { const t = k / (s.length - 1); const target = axis === 'h' ? first.x + (last.x - first.x) * t : first.y + (last.y - first.y) * t; i.position = i.position.add(axis === 'h' ? [target - i.bounds.center.x, 0] : [0, target - i.bounds.center.y]); }); commit('Distribute'); drawGuides(); }
cv.addEventListener('contextmenu', e => { e.preventDefault(); contextMenu(e, [{ label: 'Undo', action: undo }, '-', { label: 'Cut', action: cut, disabled: !sel.length }, { label: 'Copy', action: copy, disabled: !sel.length }, { label: 'Paste', action: () => paste(false), disabled: !clip }, { label: 'Duplicate', action: duplicate, disabled: !sel.length }, { label: 'Delete', action: deleteSel, disabled: !sel.length }, '-', { label: 'Group', action: group, disabled: sel.length < 2 }, { label: 'Ungroup', action: ungroup }, { label: 'Make clipping mask', action: makeClip, disabled: sel.length < 2 }, '-', { label: 'Bring to front', action: () => arrange('front') }, { label: 'Send to back', action: () => arrange('bottom') }, '-', { label: 'Transform', sub: [{ label: 'Rotate…', action: rotateDialog }, { label: 'Scale…', action: scaleDialog }, { label: 'Reflect horizontal', action: () => reflect('h') }, { label: 'Reflect vertical', action: () => reflect('v') }] }]); });

// =====================================================================  history
let hist = [], hi = -1;
function snapshot() { return JSON.stringify({ doc: { w: DOC.w, h: DOC.h, bg: DOC.bg }, layers: userLayers().map(L => L.exportJSON({ asString: false })), active: userLayers().indexOf(project.activeLayer) }); }
function commit(label) { hist = hist.slice(0, hi + 1); hist.push({ label, s: snapshot() }); if (hist.length > 100) hist.shift(); hi = hist.length - 1; if (hist.length > 1) { DOC.dirty = true; UI.setDocTitle(DOC.name + ' •', 'BTS Vector'); } if (rtab === 'layers') renderLayersPanel(); }
let cdT = null; function commitDebounced(l) { clearTimeout(cdT); cdT = setTimeout(() => commit(l), 400); }
function restore(s) {
  const d = JSON.parse(s); sel = []; selSegs = []; userLayers().forEach(L => L.remove());
  DOC.w = d.doc.w; DOC.h = d.doc.h; DOC.bg = d.doc.bg;
  d.layers.forEach(j => { const L = project.importJSON(j); L.insertBelow(guideLayer); });
  if (!userLayers().length) newUserLayer(); (userLayers()[d.active] || userLayers()[0]).activate(); drawArtboard(); setSel([]);
}
function undo() { if (pen) return finishPen(); if (hi > 0) { hi--; restore(hist[hi].s); } }
function redo() { if (hi < hist.length - 1) { hi++; restore(hist[hi].s); } }
UI.shortcut('ctrl+z', undo); UI.shortcut('ctrl+shift+z', redo); UI.shortcut('ctrl+y', redo);

// =====================================================================  files
function resetDoc(w, h2, name, bg) { project.clear(); artLayer = guideLayer = null; DOC.w = w; DOC.h = h2; DOC.name = name; DOC.path = null; DOC.bg = bg || '#ffffff'; layerN = 1; setupSystemLayers(); sel = []; hist = []; hi = -1; commit('New'); DOC.dirty = false; fitArt(); setSel([]); UI.setDocTitle(name, 'BTS Vector'); }
async function newDialog() {
  if (DOC.dirty && !(await confirm('Discard changes?', 'The current artwork has unsaved changes.', 'Discard'))) return;
  const pr = { a4: [794, 1123], a4l: [1123, 794], letter: [816, 1056], hd: [1920, 1080], insta: [1080, 1080], story: [1080, 1920], logo: [1000, 1000], card: [1050, 600], poster: [1800, 2400], icon: [512, 512] };
  const v = await form({ title: 'New document', fields: [{ key: 'name', label: 'Name', value: 'Untitled-1' }, { key: 'p', label: 'Artboard', type: 'select', value: 'a4', options: [{ value: 'a4', label: 'A4 portrait' }, { value: 'a4l', label: 'A4 landscape' }, { value: 'letter', label: 'US Letter' }, { value: 'hd', label: 'Full HD 1920×1080' }, { value: 'insta', label: 'Social post 1080×1080' }, { value: 'story', label: 'Story 1080×1920' }, { value: 'logo', label: 'Logo 1000×1000' }, { value: 'card', label: 'Business card (3.5×2 in)' }, { value: 'poster', label: 'Poster 18×24' }, { value: 'icon', label: 'Icon 512×512' }, { value: 'custom', label: 'Custom' }] }, { key: 'w', label: 'Custom width (px)', type: 'number', value: 1200 }, { key: 'h', label: 'Custom height (px)', type: 'number', value: 800 }], ok: 'Create' });
  if (!v) return; const [w, hh] = pr[v.p] || [+v.w, +v.h]; resetDoc(w, hh, v.name);
}
UI.shortcut('ctrl+n', newDialog);
async function docSetup() { const v = await form({ title: 'Document setup', fields: [{ key: 'w', label: 'Artboard width (px)', type: 'number', value: DOC.w }, { key: 'h', label: 'Artboard height (px)', type: 'number', value: DOC.h }, { key: 'bg', label: 'Artboard color', type: 'color', value: DOC.bg || '#ffffff' }, { key: 'grid', label: 'Grid size (px)', type: 'number', value: O.gridSize }] }); if (!v) return; DOC.w = +v.w; DOC.h = +v.h; DOC.bg = v.bg; O.gridSize = Math.max(2, +v.grid); drawArtboard(); commit('Document setup'); fitArt(); }
UI.shortcut('ctrl+alt+p', docSetup);
async function openDialog() { const fs = await bts.fs.open({ filters: [{ name: 'Vector & images', extensions: ['btsv', 'svg', 'png', 'jpg', 'jpeg', 'webp'] }] }); if (fs) openFile(fs[0]); }
UI.shortcut('ctrl+o', openDialog);
async function openFile(f) {
  const txt = () => new TextDecoder().decode(new Uint8Array(f.data));
  try {
    if (/\.btsv$/i.test(f.name)) { const j = JSON.parse(txt()); resetDoc(j.doc.w, j.doc.h, f.name, j.doc.bg); userLayers().forEach(L => L.remove()); j.layers.forEach(l => project.importJSON(l).insertBelow(guideLayer)); activateUserLayer(); hist = []; hi = -1; commit('Open'); DOC.dirty = false; }
    else if (/\.svg$/i.test(f.name)) {
      const s = txt(); const doc = new DOMParser().parseFromString(s, 'image/svg+xml').documentElement; let w = parseFloat(doc.getAttribute('width')) || 0, hh = parseFloat(doc.getAttribute('height')) || 0; const vb = (doc.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number); if ((!w || !hh) && vb.length === 4) { w = vb[2]; hh = vb[3]; }
      resetDoc(Math.round(w || 1000), Math.round(hh || 1000), f.name.replace(/\.svg$/i, '.btsv'));
      const item = project.activeLayer.importSVG(s, { expandShapes: true, insert: true });
      if (vb.length === 4 && (vb[0] || vb[1])) item.translate([-vb[0], -vb[1]]);
      if (item instanceof P.Group && !item.clipped) { const kids = item.removeChildren(); project.activeLayer.insertChildren(item.index, kids); item.remove(); }
      hist = []; hi = -1; commit('Open'); DOC.dirty = false; DOC.svgPath = f.path;
    } else { const url = await toDataUrl(new Uint8Array(f.data), f.name); const im = new Image(); im.src = url; await im.decode(); resetDoc(im.width, im.height, f.name.replace(/\.\w+$/, '.btsv')); new P.Raster({ source: url, position: [im.width / 2, im.height / 2] }); hist = []; hi = -1; commit('Open'); DOC.dirty = false; }
    if (/\.btsv$/i.test(f.name)) DOC.path = f.path; if (f.path) bts.recent.add(f.path); fitArt(); UI.setDocTitle(DOC.name, 'BTS Vector');
  } catch (e) { console.error(e); toast('Could not open file: ' + e.message, 'err', 6000); }
}
const toDataUrl = (u8, name) => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(new Blob([u8], { type: /\.png$/i.test(name) ? 'image/png' : /\.svg$/i.test(name) ? 'image/svg+xml' : 'image/jpeg' })); });
async function placeImage() { const fs = await bts.fs.open({ filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }] }); if (!fs) return; const f = fs[0];
  if (/\.svg$/i.test(f.name)) { const it = project.activeLayer.importSVG(new TextDecoder().decode(new Uint8Array(f.data)), { expandShapes: true }); it.position = view.center; setSel([it]); commit('Place SVG'); return; }
  const url = await toDataUrl(new Uint8Array(f.data), f.name); const r = new P.Raster({ source: url, position: view.center }); r.onLoad = () => { const k = Math.min(1, DOC.w * 0.8 / r.width, DOC.h * 0.8 / r.height); r.scale(k); setSel([r]); commit('Place image'); }; }
UI.shortcut('ctrl+shift+p', placeImage);
async function save(as) {
  finishText(true); finishPen();
  const data = new TextEncoder().encode(JSON.stringify({ app: 'BTS Vector', v: 1, doc: { w: DOC.w, h: DOC.h, bg: DOC.bg }, layers: userLayers().map(L => L.exportJSON({ asString: false })) }));
  let p = !as && DOC.path; if (p) await bts.fs.write({ path: p, data }); else { p = await bts.fs.saveAs({ data, defaultPath: DOC.name.replace(/\.\w+$/, '') + '.btsv', filters: [{ name: 'BTS Vector', extensions: ['btsv'] }] }); if (!p) return; }
  DOC.path = p; DOC.name = p.split(/[\\/]/).pop(); DOC.dirty = false; UI.setDocTitle(DOC.name, 'BTS Vector'); toast('Saved ' + DOC.name, 'ok');
}
UI.shortcut('ctrl+s', () => save(false)); UI.shortcut('ctrl+shift+s', () => save(true));
function svgString(forPdf) {
  finishText(true); const prevSel = sel; setSel([]); const outline = O.outline; if (outline) toggleOutline();
  const ga = guideLayer, aa = artLayer; ga.remove(); aa.remove();
  const bgRect = DOC.bg && DOC.bg !== 'transparent' ? new P.Path.Rectangle({ rectangle: [0, 0, DOC.w, DOC.h], fillColor: DOC.bg }) : null; if (bgRect) { const L = userLayers()[0]; L.insertChild(0, bgRect); }
  let s; try { s = project.exportSVG({ asString: true, bounds: new P.Rectangle(0, 0, DOC.w, DOC.h), matchShapes: !forPdf, precision: 3 }); } finally { bgRect?.remove(); project.insertLayer(0, aa); project.addLayer(ga); activateUserLayer(); if (outline) toggleOutline(); setSel(prevSel.filter(i => i.parent)); }
  const d = new DOMParser().parseFromString(s, 'image/svg+xml'); const root = d.documentElement; if (forPdf) root.querySelectorAll('[stroke-width="none"],[font-size="none"],[font-family="none"],[font-weight="none"],[text-anchor="none"]').forEach(el => ['stroke-width', 'font-size', 'font-family', 'font-weight', 'text-anchor'].forEach(a => el.getAttribute(a) === 'none' && el.removeAttribute(a))); root.setAttribute('width', DOC.w); root.setAttribute('height', DOC.h); root.setAttribute('viewBox', `0 0 ${DOC.w} ${DOC.h}`); root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(root);
}
async function exportSVG() { const s = svgString(); const p = await bts.fs.saveAs({ data: new TextEncoder().encode(s), defaultPath: DOC.name.replace(/\.\w+$/, '') + '.svg', filters: [{ name: 'SVG', extensions: ['svg'] }] }); if (p) toast('Exported SVG', 'ok'); }
async function renderToCanvas(scale, bgWhite) { const s = svgString(); const url = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' })); const im = new Image(); im.src = url; await im.decode(); const c = document.createElement('canvas'); c.width = Math.round(DOC.w * scale); c.height = Math.round(DOC.h * scale); const x = c.getContext('2d'); if (bgWhite) { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); } x.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url); return c; }
async function exportRaster(fmt) {
  const v = await form({ title: 'Export ' + fmt.toUpperCase(), fields: [{ key: 's', label: 'Scale', type: 'select', value: '2', options: [{ value: '1', label: '1× (' + DOC.w + '×' + DOC.h + ')' }, { value: '2', label: '2×' }, { value: '3', label: '3×' }, { value: '4', label: '4× (print)' }] }, ...(fmt === 'png' ? [{ key: 't', label: 'Transparent background', type: 'checkbox', value: false }] : [])], ok: 'Export' }); if (!v) return;
  const bg = DOC.bg; if (v.t) DOC.bg = 'transparent'; const c = await renderToCanvas(+v.s, fmt === 'jpeg'); DOC.bg = bg;
  const blob = await new Promise(r => c.toBlob(r, 'image/' + fmt, 0.92)); const ext = fmt === 'jpeg' ? 'jpg' : 'png';
  const p = await bts.fs.saveAs({ data: await UI.blobToU8(blob), defaultPath: DOC.name.replace(/\.\w+$/, '') + '.' + ext, filters: [{ name: fmt.toUpperCase(), extensions: [ext] }] }); if (p) toast('Exported ' + ext.toUpperCase(), 'ok');
}
async function exportPDF() {
  try {
    const s = svgString(true); const holder = h('div', { style: { position: 'fixed', left: '-99999px', top: 0 } }); holder.innerHTML = s; document.body.append(holder);
    const el = holder.querySelector('svg'); const { jsPDF } = window.jspdf; const W = DOC.w * 0.75, H = DOC.h * 0.75; const pdf = new jsPDF({ unit: 'pt', format: [W, H], orientation: W > H ? 'landscape' : 'portrait' });
    await window.svg2pdf.svg2pdf(el, pdf, { x: 0, y: 0, width: W, height: H }); holder.remove();
    const p = await bts.fs.saveAs({ data: new Uint8Array(pdf.output('arraybuffer')), defaultPath: DOC.name.replace(/\.\w+$/, '') + '.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] }); if (p) toast('Exported vector PDF', 'ok');
  } catch (e) { console.error(e); toast('PDF export failed: ' + e.message, 'err', 6000); }
}
async function closeWindow() { if (DOC.dirty) { const r = await modal({ title: 'Save changes?', body: `Save changes to “${DOC.name}” before closing?`, buttons: [{ label: 'Cancel', value: null }, { label: "Don't save", value: 'no' }, { label: 'Save', primary: true, value: 'yes' }] }); if (r === null) return; if (r === 'yes') { await save(false); if (DOC.dirty) return; } } bts.win.close(); }
UI.shortcut('ctrl+w', closeWindow);
function shortcutsHelp() { const rows = [['V / A', 'Selection / direct selection'], ['P N B T', 'Pen · Pencil · Paintbrush · Type'], ['M / L', 'Rectangle / Ellipse'], ['Shift+M / Shift+L', 'Polygon / Star'], ['\\', 'Line'], ['C I G', 'Scissors · Eyedropper · Gradient'], ['H / Z / Space', 'Hand / Zoom / pan'], ['X / Shift+X / /', 'Toggle fill-stroke / swap / none'], ['Ctrl+G / Shift+G', 'Group / ungroup'], ['Ctrl+7 / 8', 'Clipping mask / compound path'], ['Ctrl+J', 'Join paths'], ['Ctrl+D', 'Duplicate'], ['Ctrl+[ ]', 'Arrange'], ['Ctrl+Y', 'Outline mode'], ["Ctrl+'", 'Grid'], ['Shift (drag)', 'Constrain'], ['Alt (drag)', 'Duplicate / from center']]; modal({ title: 'Keyboard shortcuts', width: 480, body: '<table style="width:100%">' + rows.map(r => `<tr><td style="padding:3px 10px 3px 0;color:var(--tx-0);white-space:nowrap">${r[0]}</td><td style="color:var(--tx-2)">${r[1]}</td></tr>`).join('') + '</table>' }); }

// =====================================================================  boot
UI.fileDrop(async files => { const f = files[0]; const data = new Uint8Array(await f.arrayBuffer()); if (/\.(png|jpe?g|webp|svg)$/i.test(f.name) && hist.length > 1) { if (/\.svg$/i.test(f.name)) { const it = project.activeLayer.importSVG(new TextDecoder().decode(data), { expandShapes: true }); it.position = view.center; setSel([it]); commit('Place SVG'); } else { const r = new P.Raster({ source: await toDataUrl(data, f.name), position: view.center }); r.onLoad = () => { setSel([r]); commit('Place image'); }; } } else openFile({ name: f.name, path: bts.fs.pathOf(f), data }); }, 'Drop SVG or images');
view.onResize = () => drawGuides();
resetDoc(1200, 800, 'Untitled-1'); setTool('select'); renderFS(); renderRight();
const qf = UI.queryFile(); if (qf) bts.fs.read(qf).then(f => openFile({ ...f, data: new Uint8Array(f.data) }));
window.__bts = { svgPdf: () => svgString(true), P, DOC, O, setSel, get sel() { return sel; }, commit, pathfinder, group, svgString, exportPDF, setTool, align, renderToCanvas, makeClip, userLayers };
})();
