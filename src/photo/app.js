// BTS Photo — layer-based raster image editor
(() => {
const { $, h, icon, toast, modal, form, prompt, confirm, contextMenu, clamp } = UI;

// =====================================================================  documents
let docs = [], D = null; let uidN = 1; const uid = () => 'L' + (uidN++);
const BLENDS = [['source-over', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'], ['darken', 'Darken'], ['lighten', 'Lighten'], ['color-dodge', 'Color Dodge'], ['color-burn', 'Color Burn'], ['hard-light', 'Hard Light'], ['soft-light', 'Soft Light'], ['difference', 'Difference'], ['exclusion', 'Exclusion'], ['hue', 'Hue'], ['saturation', 'Saturation'], ['color', 'Color'], ['luminosity', 'Luminosity']];
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const ctxOf = c => c.getContext('2d', { willReadFrequently: true });
const cloneCanvas = c => { const n = mk(c.width, c.height); n.getContext('2d').drawImage(c, 0, 0); return n; };

function newLayer(name, w, h, props = {}) { return { id: uid(), name, canvas: mk(w, h), x: 0, y: 0, visible: true, opacity: 1, blend: 'source-over', locked: false, kind: 'raster', mask: null, editMask: false, fx: {}, ...props }; }
function createDoc({ w, h, name = 'Untitled-' + (docs.length + 1), bg = '#ffffff' }) {
  const d = { id: uid(), w, h, name, path: null, layers: [], active: 0, sel: null, selPath: null, prevSel: null, dirty: false, hist: [], hi: -1, zoom: 1, px: 0, py: 0, fmt: null };
  const L = newLayer(bg ? 'Background' : 'Layer 1', w, h);
  if (bg) { const c = L.canvas.getContext('2d'); c.fillStyle = bg; c.fillRect(0, 0, w, h); }
  d.layers.push(L); return d;
}
function addDoc(d) { docs.push(d); switchDoc(d); pushHist('New document'); d.dirty = false; fitView(); renderTabs(); }
function switchDoc(d) { D = d; cancelTransientTools(); renderAll(); renderTabs(); UI.setDocTitle(d.name, 'BTS Photo'); }
const AL = () => D?.layers[D.active];

// =====================================================================  state / options
const O = {
  tool: 'brush', fg: '#000000', bg: '#ffffff',
  size: 30, hardness: 0.85, opacity: 1, flow: 1, spacing: 0.12,
  tolerance: 32, contiguous: true, sampleAll: false, marq: 'rect', selMode: 'new', feather: 0,
  grad: 'linear', gradTransparent: false, shape: 'rect', shapeFill: true, shapeStroke: 0, radius: 16, sides: 5,
  font: 'Segoe UI', fontSize: 64, bold: false, italic: false, align: 'left',
  blurMode: 'blur', strength: 0.5, dodgeMode: 'dodge', range: 'midtones', cloneAligned: true,
  showGrid: false, pixel: true, autoSelect: false,
};
let clipboard = null; // {canvas, x, y}

// =====================================================================  UI scaffold
UI.titlebar({ logo: 'Ph', menus: [
  { label: 'File', items: () => [
    { label: 'New…', kbd: 'Ctrl+N', action: newDialog }, { label: 'Open…', kbd: 'Ctrl+O', action: openDialog },
    { label: 'Place image as layer…', kbd: 'Ctrl+Shift+P', action: placeImage, disabled: !D },
    '-', { label: 'Save project (.btsp)', kbd: 'Ctrl+S', action: () => saveProject(false), disabled: !D }, { label: 'Save project as…', kbd: 'Ctrl+Shift+S', action: () => saveProject(true), disabled: !D },
    { label: 'Save as Photoshop (.psd)…', action: savePsd, disabled: !D },
    { label: 'Export as', sub: [{ label: 'PNG…', action: () => exportImage('png') }, { label: 'JPEG…', action: () => exportImage('jpeg') }, { label: 'WebP…', action: () => exportImage('webp') }], disabled: !D },
    { label: 'Quick export PNG', kbd: 'Ctrl+Alt+Shift+S', action: () => exportImage('png', true), disabled: !D },
    '-', { label: 'Close document', kbd: 'Ctrl+W', action: closeDoc, disabled: !D }, { label: 'BTS Creative home', action: () => bts.openApp('home') }, { label: 'Exit', action: closeWindow } ] },
  { label: 'Edit', items: () => [
    { label: 'Undo ' + (D?.hist[D.hi]?.label || ''), kbd: 'Ctrl+Z', action: undo, disabled: !D || D.hi <= 0 },
    { label: 'Redo', kbd: 'Ctrl+Shift+Z', action: redo, disabled: !D || D.hi >= D.hist.length - 1 },
    '-', { label: 'Cut', kbd: 'Ctrl+X', action: cut }, { label: 'Copy', kbd: 'Ctrl+C', action: copy }, { label: 'Copy merged', kbd: 'Ctrl+Shift+C', action: () => copy(true) },
    { label: 'Paste', kbd: 'Ctrl+V', action: paste }, { label: 'Clear', kbd: 'Del', action: clearSel },
    '-', { label: 'Fill…', kbd: 'Shift+F5', action: fillDialog }, { label: 'Stroke…', action: strokeDialog },
    '-', { label: 'Free transform', kbd: 'Ctrl+T', action: startTransform },
    { label: 'Transform', sub: [{ label: 'Flip horizontal', action: () => flipLayer(true) }, { label: 'Flip vertical', action: () => flipLayer(false) }, { label: 'Rotate 90° CW', action: () => rotateLayer(90) }, { label: 'Rotate 90° CCW', action: () => rotateLayer(-90) }, { label: 'Rotate 180°', action: () => rotateLayer(180) }] },
  ] },
  { label: 'Image', items: () => [
    { label: 'Adjustments', sub: ADJ.map(a => ({ label: a.name + (a.params ? '…' : ''), kbd: a.kbd, action: () => runAdjust(a) })) },
    { label: 'Auto tone', kbd: 'Ctrl+Shift+L', action: () => quickAdj(autoTone, 'Auto tone') },
    { label: 'Auto contrast', kbd: 'Ctrl+Alt+Shift+L', action: () => quickAdj(autoContrast, 'Auto contrast') },
    { label: 'Auto color', kbd: 'Ctrl+Shift+B', action: () => quickAdj(autoColor, 'Auto color') },
    '-', { label: 'Image size…', kbd: 'Ctrl+Alt+I', action: imageSizeDialog }, { label: 'Canvas size…', kbd: 'Ctrl+Alt+C', action: canvasSizeDialog },
    { label: 'Image rotation', sub: [{ label: '180°', action: () => rotateCanvas(180) }, { label: '90° clockwise', action: () => rotateCanvas(90) }, { label: '90° counter-clockwise', action: () => rotateCanvas(-90) }, '-', { label: 'Flip canvas horizontal', action: () => flipCanvas(true) }, { label: 'Flip canvas vertical', action: () => flipCanvas(false) }] },
    { label: 'Crop to selection', action: cropToSelection, disabled: !D?.sel }, { label: 'Trim transparent pixels', action: trimCanvas },
    { label: 'Duplicate', action: duplicateDoc },
  ] },
  { label: 'Layer', items: () => [
    { label: 'New layer', kbd: 'Ctrl+Shift+N', action: () => addLayer() }, { label: 'Layer via copy', kbd: 'Ctrl+J', action: () => layerVia(false) }, { label: 'Layer via cut', kbd: 'Ctrl+Shift+J', action: () => layerVia(true) },
    { label: 'Duplicate layer', action: duplicateLayer }, { label: 'Delete layer', action: deleteLayer }, { label: 'Rename layer…', action: renameLayer },
    '-', { label: 'Layer mask', sub: [{ label: 'Reveal all', action: () => addMask('all') }, { label: 'Hide all', action: () => addMask('none') }, { label: 'Reveal selection', action: () => addMask('sel'), disabled: !D?.sel }, '-', { label: 'Apply mask', action: applyMask }, { label: 'Delete mask', action: deleteMask }] },
    { label: 'Layer style', sub: [{ label: 'Drop shadow…', action: () => fxDialog('shadow') }, { label: 'Stroke…', action: () => fxDialog('stroke') }, { label: 'Outer glow…', action: () => fxDialog('glow') }, '-', { label: 'Clear layer style', action: clearFx }] },
    { label: 'Rasterize layer', action: rasterizeLayer, disabled: AL()?.kind !== 'text' },
    '-', { label: 'Bring forward', kbd: 'Ctrl+]', action: () => moveLayer(1) }, { label: 'Send backward', kbd: 'Ctrl+[', action: () => moveLayer(-1) },
    { label: 'Bring to front', kbd: 'Ctrl+Shift+]', action: () => moveLayer(99) }, { label: 'Send to back', kbd: 'Ctrl+Shift+[', action: () => moveLayer(-99) },
    '-', { label: 'Merge down', kbd: 'Ctrl+E', action: mergeDown }, { label: 'Merge visible', kbd: 'Ctrl+Shift+E', action: mergeVisible }, { label: 'Flatten image', action: flatten },
  ] },
  { label: 'Select', items: () => [
    { label: 'All', kbd: 'Ctrl+A', action: selectAll }, { label: 'Deselect', kbd: 'Ctrl+D', action: deselect }, { label: 'Reselect', kbd: 'Ctrl+Shift+D', action: reselect },
    { label: 'Inverse', kbd: 'Ctrl+Shift+I', action: invertSel }, '-',
    { label: 'Color range…', action: colorRangeDialog }, { label: 'Load layer transparency', action: selectLayerAlpha },
    { label: 'Modify', sub: [{ label: 'Feather…', kbd: 'Shift+F6', action: () => modifySel('feather') }, { label: 'Expand…', action: () => modifySel('expand') }, { label: 'Contract…', action: () => modifySel('contract') }, { label: 'Smooth…', action: () => modifySel('smooth') }] },
  ] },
  { label: 'Filter', items: () => FILTERS.map(f => f === '-' ? '-' : { label: f.name + (f.params ? '…' : ''), action: () => runAdjust(f) }) },
  { label: 'View', items: () => [
    { label: 'Zoom in', kbd: 'Ctrl++', action: () => zoomBy(1.25) }, { label: 'Zoom out', kbd: 'Ctrl+-', action: () => zoomBy(0.8) },
    { label: 'Fit on screen', kbd: 'Ctrl+0', action: fitView }, { label: '100%', kbd: 'Ctrl+1', action: () => setZoom(1) },
    '-', { label: 'Pixel preview at high zoom', checked: () => O.pixel, action: () => { O.pixel = !O.pixel; requestRender(); } },
    { label: 'Show grid', kbd: "Ctrl+'", checked: () => O.showGrid, action: () => { O.showGrid = !O.showGrid; drawOverlay(); } },
  ] },
  { label: 'Help', items: [{ label: 'Keyboard shortcuts', action: shortcutsHelp }, { label: 'Check for updates', action: () => bts.update.check().then(r => toast(r.state === 'store' ? 'Updates are delivered by the Microsoft Store.' : r.state === 'dev' ? 'Updates run in the installed version.' : 'Checking for updates…')) }, { label: 'About BTS Photo', action: () => modal({ title: 'BTS Photo', body: 'Part of BTS Creative — free and open source for students.<br>Not affiliated with Adobe Inc.' }) }] },
]});
window.addEventListener('bts:close', closeWindow);

// =====================================================================  toolbar
const TOOLS = [
  ['move', 'move', 'Move', 'V'], ['marquee', 'marquee', 'Marquee', 'M'], ['lasso', 'lasso', 'Lasso', 'L'], ['wand', 'wand', 'Magic wand', 'W'], ['crop', 'crop', 'Crop', 'C'], ['eyedrop', 'eyedrop', 'Eyedropper', 'I'], '-',
  ['heal', 'heal', 'Spot healing brush', 'J'], ['brush', 'brush', 'Brush', 'B'], ['pencil', 'pencil', 'Pencil', 'N'], ['clone', 'clone', 'Clone stamp', 'S'], ['eraser', 'eraser', 'Eraser', 'E'],
  ['bucket', 'bucket', 'Paint bucket', 'G'], ['gradient', 'gradient', 'Gradient', 'Shift+G'], ['blur', 'blur', 'Blur / Sharpen / Smudge', 'R'], ['dodge', 'dodge', 'Dodge / Burn / Sponge', 'O'], '-',
  ['text', 'text', 'Type', 'T'], ['shape', 'shape', 'Shape', 'U'], ['hand', 'hand', 'Hand', 'H'], ['zoom', 'zoom', 'Zoom', 'Z'],
];
const tbEl = $('#toolbar');
TOOLS.forEach(t => { if (t === '-') return tbEl.append(h('div', { class: 'tsep' })); const [id, ic, tip, key] = t; tbEl.append(h('button', { class: 'icon-btn', 'data-tool': id, 'data-tip': tip, 'data-key': key, html: icon(ic), onclick: () => setTool(id) })); });
const fgbg = h('div', { class: 'fgbg' }, h('div', { class: 'sw fg', id: 'swFg', 'data-tip': 'Foreground color', onclick: () => pickColorDialog('fg') }), h('div', { class: 'sw bg', id: 'swBg', 'data-tip': 'Background color', onclick: () => pickColorDialog('bg') }),
  h('div', { class: 'swap', 'data-tip': 'Swap (X)', onclick: swapColors }, '⇄'), h('div', { class: 'reset', 'data-tip': 'Default colors (D)', onclick: resetColors }, '■□'));
tbEl.append(fgbg);
const keyMap = { v: 'move', m: 'marquee', l: 'lasso', w: 'wand', c: 'crop', i: 'eyedrop', j: 'heal', b: 'brush', n: 'pencil', s: 'clone', e: 'eraser', g: 'bucket', 'shift+g': 'gradient', r: 'blur', o: 'dodge', t: 'text', u: 'shape', h: 'hand', z: 'zoom' };
Object.entries(keyMap).forEach(([k, t]) => UI.shortcut(k, () => setTool(t)));
UI.shortcut('x', swapColors); UI.shortcut('d', resetColors);
UI.shortcut('[', () => { O.size = Math.max(1, Math.round(O.size / 1.15)); renderOptions(); drawOverlay(); });
UI.shortcut(']', () => { O.size = Math.min(2000, Math.round(O.size * 1.15 + 1)); renderOptions(); drawOverlay(); });
for (let i = 0; i <= 9; i++) UI.shortcut(String(i), () => { if (['brush', 'pencil', 'eraser', 'clone', 'heal'].includes(O.tool)) { O.opacity = i === 0 ? 1 : i / 10; renderOptions(); } else if (AL()) { AL().opacity = i === 0 ? 1 : i / 10; requestRender(); renderLayers(); pushHist('Opacity'); } });

function setTool(t) {
  if (O.tool === 'crop' && t !== 'crop') cropState = null;
  if (T && t !== 'move') commitTransform();
  O.tool = t; tbEl.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  if (t === 'crop' && D) cropState = { x: 0, y: 0, w: D.w, h: D.h };
  renderOptions(); updateCursor(); drawOverlay();
}
function swapColors() { [O.fg, O.bg] = [O.bg, O.fg]; renderColor(); }
function resetColors() { O.fg = '#000000'; O.bg = '#ffffff'; renderColor(); }

// =====================================================================  options bar
function renderOptions() {
  const ob = $('#optbar'); ob.innerHTML = '';
  const grp = (...k) => h('div', { class: 'grp' }, ...k), vsep = () => h('div', { class: 'vsep' });
  const num = (label, key, min, max, step = 1, scale = 1, suffix = '') => {
    const i = h('input', { type: 'number', min, max, step, value: Math.round(O[key] * scale * 100) / 100, style: { width: '62px' } });
    i.oninput = () => { O[key] = clamp(+i.value, min, max) / scale; drawOverlay(); };
    return grp(label, i, suffix);
  };
  const chk = (label, key, cb) => { const c = h('input', { type: 'checkbox', checked: !!O[key] }); c.onchange = () => { O[key] = c.checked; cb && cb(); }; return h('label', { class: 'grp' }, c, label); };
  const sel = (label, key, opts, cb) => { const s = h('select', {}, ...opts.map(([v, l]) => h('option', { value: v, selected: O[key] === v }, l))); s.onchange = () => { O[key] = s.value; cb && cb(); renderOptions(); }; return grp(label, s); };
  const t = O.tool;
  const toolName = (TOOLS.find(x => x[0] === t) || [])[2];
  ob.append(h('div', { class: 'grp', style: { color: 'var(--tx-0)', fontWeight: 600 }, html: icon((TOOLS.find(x => x[0] === t) || [])[1]) }), vsep());
  const brushOpts = (withFlow = true) => { ob.append(num('Size', 'size', 1, 2000, 1, 1, 'px'), num('Hardness', 'hardness', 0, 100, 1, 100, '%'), num('Opacity', 'opacity', 1, 100, 1, 100, '%')); if (withFlow) ob.append(num('Flow', 'flow', 1, 100, 1, 100, '%')); };
  const selModes = () => grp('', ...[['new', 'New'], ['add', 'Add'], ['sub', 'Subtract'], ['int', 'Intersect']].map(([v, l]) => h('button', { class: 'btn sm' + (O.selMode === v ? ' primary' : ''), onclick: () => { O.selMode = v; renderOptions(); } }, l)));
  if (t === 'brush' || t === 'pencil') brushOpts(t === 'brush');
  else if (t === 'eraser') brushOpts();
  else if (t === 'clone') { brushOpts(); ob.append(vsep(), chk('Aligned', 'cloneAligned'), chk('Sample all layers', 'sampleAll'), h('span', { class: 'muted' }, 'Alt+click to set source')); }
  else if (t === 'heal') ob.append(num('Size', 'size', 1, 500, 1, 1, 'px'), h('span', { class: 'muted' }, 'Paint over blemishes to remove them'));
  else if (t === 'blur') { ob.append(sel('Mode', 'blurMode', [['blur', 'Blur'], ['sharpen', 'Sharpen'], ['smudge', 'Smudge']]), num('Size', 'size', 1, 500), num('Strength', 'strength', 1, 100, 1, 100, '%')); }
  else if (t === 'dodge') { ob.append(sel('Mode', 'dodgeMode', [['dodge', 'Dodge'], ['burn', 'Burn'], ['sponge', 'Sponge (desaturate)'], ['saturate', 'Sponge (saturate)']]), sel('Range', 'range', [['shadows', 'Shadows'], ['midtones', 'Midtones'], ['highlights', 'Highlights']]), num('Size', 'size', 1, 500), num('Exposure', 'strength', 1, 100, 1, 100, '%')); }
  else if (t === 'marquee') { ob.append(selModes(), vsep(), sel('Shape', 'marq', [['rect', 'Rectangle'], ['ellipse', 'Ellipse']]), num('Feather', 'feather', 0, 250, 1, 1, 'px')); }
  else if (t === 'lasso') ob.append(selModes(), vsep(), num('Feather', 'feather', 0, 250, 1, 1, 'px'));
  else if (t === 'wand') ob.append(selModes(), vsep(), num('Tolerance', 'tolerance', 0, 255), chk('Contiguous', 'contiguous'), chk('Sample all layers', 'sampleAll'));
  else if (t === 'bucket') ob.append(num('Tolerance', 'tolerance', 0, 255), num('Opacity', 'opacity', 1, 100, 1, 100, '%'), chk('Contiguous', 'contiguous'), chk('Sample all layers', 'sampleAll'));
  else if (t === 'gradient') ob.append(sel('Type', 'grad', [['linear', 'Linear'], ['radial', 'Radial'], ['reflected', 'Reflected'], ['angle', 'Angle'], ['diamond', 'Diamond']]), chk('Foreground to transparent', 'gradTransparent'), num('Opacity', 'opacity', 1, 100, 1, 100, '%'));
  else if (t === 'text') {
    const fonts = ['Segoe UI', 'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Georgia', 'Times New Roman', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Impact', 'Courier New', 'Consolas', 'Comic Sans MS', 'Segoe Script', 'Nirmala UI', 'Mangal'];
    ob.append(sel('Font', 'font', fonts.map(f => [f, f]), applyTextOpts), num('Size', 'fontSize', 4, 1000, 1, 1, 'px'),
      h('button', { class: 'btn sm' + (O.bold ? ' primary' : ''), onclick: () => { O.bold = !O.bold; renderOptions(); applyTextOpts(); } }, 'B'),
      h('button', { class: 'btn sm' + (O.italic ? ' primary' : ''), style: { fontStyle: 'italic' }, onclick: () => { O.italic = !O.italic; renderOptions(); applyTextOpts(); } }, 'I'),
      sel('Align', 'align', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']], applyTextOpts), h('span', { class: 'muted' }, 'Click to add text · color = foreground'));
    ob.querySelector('input[type=number]').addEventListener('change', applyTextOpts);
  }
  else if (t === 'shape') ob.append(sel('Shape', 'shape', [['rect', 'Rectangle'], ['round', 'Rounded rectangle'], ['ellipse', 'Ellipse'], ['line', 'Line'], ['triangle', 'Triangle'], ['polygon', 'Polygon'], ['star', 'Star'], ['arrow', 'Arrow']]), chk('Fill (foreground)', 'shapeFill'), num('Stroke (background)', 'shapeStroke', 0, 200, 1, 1, 'px'),
    O.shape === 'round' ? num('Radius', 'radius', 0, 1000) : '', ['polygon', 'star'].includes(O.shape) ? num('Sides', 'sides', 3, 24) : '');
  else if (t === 'crop') ob.append(h('button', { class: 'btn sm primary', onclick: applyCrop }, '✓ Apply crop'), h('button', { class: 'btn sm', onclick: () => { cropState = { x: 0, y: 0, w: D.w, h: D.h }; drawOverlay(); } }, 'Reset'),
    sel('Ratio', 'cropRatio', [['free', 'Free'], ['1', '1:1'], ['1.3333', '4:3'], ['1.7778', '16:9'], ['0.8', '4:5'], ['0.7071', 'A4 portrait']]), h('span', { class: 'muted' }, 'Drag to set the crop, Enter to apply'));
  else if (t === 'move') { ob.append(chk('Auto-select layer', 'autoSelect'), vsep(), h('button', { class: 'btn sm', onclick: startTransform }, 'Free transform (Ctrl+T)'), vsep(), ...['alignL', 'alignC', 'alignR', 'alignT', 'alignM', 'alignB'].map(a => h('button', { class: 'icon-btn', 'data-tip': 'Align layer to canvas', html: icon(a), onclick: () => alignLayer(a) })));
    if (T) ob.append(vsep(), h('button', { class: 'btn sm primary', onclick: commitTransform }, '✓ Commit'), h('button', { class: 'btn sm', onclick: cancelTransform }, 'Cancel'), h('span', { class: 'muted' }, 'Shift = keep proportions · drag outside to rotate')); }
  else if (t === 'eyedrop') ob.append(chk('Sample all layers', 'sampleAll'), h('span', { class: 'muted' }, 'Click to set foreground · Alt+click for background'));
  else ob.append(h('span', { class: 'muted' }, toolName || ''));
}

// =====================================================================  color panel
function renderColor() { $('#swFg').style.background = O.fg; $('#swBg').style.background = O.bg; drawColorPanel(); }
const hexToRgb = hx => { const n = parseInt(hx.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbToHex = (r, g, b) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
function rgbToHsv(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let hh = 0; if (d) { hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh *= 60; if (hh < 0) hh += 360; } return [hh, mx ? d / mx : 0, mx]; }
function hsvToRgb(hh, s, v) { const c = v * s, x = c * (1 - Math.abs((hh / 60) % 2 - 1)), m = v - c; let r = 0, g = 0, b = 0; if (hh < 60) [r, g, b] = [c, x, 0]; else if (hh < 120) [r, g, b] = [x, c, 0]; else if (hh < 180) [r, g, b] = [0, c, x]; else if (hh < 240) [r, g, b] = [0, x, c]; else if (hh < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x]; return [(r + m) * 255, (g + m) * 255, (b + m) * 255]; }
let cpHue = 0;
function drawColorPanel() {
  const p = $('#colorPanel'); if (!p.firstChild) {
    const sv = h('div', { class: 'cp-sv', id: 'cpSv' }, h('div', { class: 'k' })); const hue = h('div', { class: 'cp-hue', id: 'cpHue' }, h('div', { class: 'k' }));
    const hex = h('input', { type: 'text', id: 'cpHex' }); hex.onchange = () => { if (/^#?[0-9a-f]{6}$/i.test(hex.value)) { O.fg = '#' + hex.value.replace('#', '').toLowerCase(); renderColor(); } };
    const sw = h('div', { class: 'sw-grid' }); ['#000000', '#404040', '#808080', '#c0c0c0', '#ffffff', '#ff0000', '#ff8000', '#ffff00', '#80ff00', '#00ff00', '#00ff80', '#00ffff', '#0080ff', '#0000ff', '#8000ff', '#ff00ff', '#ff0080', '#7f1d1d', '#92400e', '#365314', '#134e4a', '#1e3a8a', '#4c1d95', '#f5d0a9'].forEach(c => sw.append(h('span', { style: { background: c }, onclick: e => { e.altKey ? O.bg = c : O.fg = c; renderColor(); }, title: c })));
    p.append(sv, hue, h('div', { class: 'cp-row' }, h('span', { class: 'muted' }, 'Hex'), hex), sw);
    const drag = (el, fn) => el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); fn(e); const mv = ev => fn(ev); el.addEventListener('pointermove', mv); el.addEventListener('pointerup', () => el.removeEventListener('pointermove', mv), { once: true }); });
    drag(sv, e => { const r = sv.getBoundingClientRect(); const s = clamp((e.clientX - r.left) / r.width, 0, 1), v = 1 - clamp((e.clientY - r.top) / r.height, 0, 1); O.fg = rgbToHex(...hsvToRgb(cpHue, s, v)); $('#swFg').style.background = O.fg; drawColorPanel(true); });
    drag(hue, e => { const r = hue.getBoundingClientRect(); cpHue = clamp((e.clientX - r.left) / r.width, 0, 0.999) * 360; const [, s, v] = rgbToHsv(...hexToRgb(O.fg)); O.fg = rgbToHex(...hsvToRgb(cpHue, s || 1, v || 1)); $('#swFg').style.background = O.fg; drawColorPanel(true); });
  }
  const [hh, s, v] = rgbToHsv(...hexToRgb(O.fg)); if (s > 0.01 && !arguments[0]) cpHue = hh;
  const sv = $('#cpSv'); sv.style.background = `linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(${cpHue},100%,50%))`;
  sv.querySelector('.k').style.left = s * 100 + '%'; sv.querySelector('.k').style.top = (1 - v) * 100 + '%';
  $('#cpHue .k').style.left = cpHue / 360 * 100 + '%'; $('#cpHex').value = O.fg;
}
async function pickColorDialog(which) {
  const inp = h('input', { type: 'color', value: O[which], style: { width: '100%', height: '120px' } });
  const r = await modal({ title: which === 'fg' ? 'Foreground color' : 'Background color', body: inp, buttons: [{ label: 'Cancel', value: null }, { label: 'OK', primary: true, value: 'ok' }] });
  if (r === 'ok') { O[which] = inp.value; renderColor(); }
}

// =====================================================================  view
const vpEl = $('#viewport'), wrap = $('#canvasWrap'), display = $('#display'), overlay = $('#overlay');
function applyView() {
  if (!D) return;
  wrap.style.transform = `translate(${D.px}px,${D.py}px) scale(${D.zoom})`;
  vpEl.classList.toggle('pixelated', O.pixel && D.zoom >= 2);
  $('#stZoom').textContent = Math.round(D.zoom * 1000) / 10 + '%';
  drawOverlay();
}
function fitView() { if (!D) return; const r = vpEl.getBoundingClientRect(); const z = Math.min((r.width - 60) / D.w, (r.height - 60) / D.h, 1) || 1; D.zoom = z; D.px = (r.width - D.w * z) / 2; D.py = (r.height - D.h * z) / 2; applyView(); }
function setZoom(z, cx, cy) {
  if (!D) return; const r = vpEl.getBoundingClientRect(); cx ??= r.width / 2; cy ??= r.height / 2;
  z = clamp(z, 0.02, 64); const dx = (cx - D.px) / D.zoom, dy = (cy - D.py) / D.zoom;
  D.zoom = z; D.px = cx - dx * z; D.py = cy - dy * z; applyView();
}
const zoomBy = f => setZoom(D.zoom * f);
UI.shortcut('ctrl+=', () => zoomBy(1.25)); UI.shortcut('ctrl++', () => zoomBy(1.25)); UI.shortcut('ctrl+shift++', () => zoomBy(1.25)); UI.shortcut('ctrl+-', () => zoomBy(0.8)); UI.shortcut('ctrl+0', fitView); UI.shortcut('ctrl+1', () => setZoom(1));
UI.shortcut("ctrl+'", () => { O.showGrid = !O.showGrid; drawOverlay(); });
vpEl.addEventListener('wheel', e => {
  if (!D) return; e.preventDefault();
  const r = vpEl.getBoundingClientRect();
  if (e.ctrlKey || e.altKey) setZoom(D.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX - r.left, e.clientY - r.top);
  else { D.px -= e.shiftKey ? e.deltaY : e.deltaX; D.py -= e.shiftKey ? 0 : e.deltaY; applyView(); }
}, { passive: false });
new ResizeObserver(() => { const r = vpEl.getBoundingClientRect(); overlay.width = r.width * devicePixelRatio; overlay.height = r.height * devicePixelRatio; overlay.style.width = r.width + 'px'; overlay.style.height = r.height + 'px'; drawOverlay(); }).observe(vpEl);
function toDoc(e) { const r = vpEl.getBoundingClientRect(); return [(e.clientX - r.left - D.px) / D.zoom, (e.clientY - r.top - D.py) / D.zoom]; }
function toScreen(x, y) { return [x * D.zoom + D.px, y * D.zoom + D.py]; }

// =====================================================================  compositing
let renderQueued = false, stroke = null, T = null, cropState = null, shapePreview = null, gradPreview = null, lassoPts = null, marqRect = null;
function requestRender() { if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => { renderQueued = false; render(); }); }
function render() {
  if (!D) return;
  if (display.width !== D.w || display.height !== D.h) { display.width = D.w; display.height = D.h; wrap.style.width = D.w + 'px'; wrap.style.height = D.h + 'px'; }
  const c = display.getContext('2d'); c.clearRect(0, 0, D.w, D.h);
  compositeTo(c, { live: true });
  $('#stSize').textContent = `${D.w} × ${D.h} px`;
}
function maskAlpha(L) {
  if (!L.mask) return null;
  if (L._maskA && L._maskV === L.maskVer) return L._maskA;
  const m = L.mask, a = mk(m.width, m.height); const src = ctxOf(m).getImageData(0, 0, m.width, m.height); const d = src.data;
  for (let i = 0; i < d.length; i += 4) { d[i + 3] = d[i]; d[i] = d[i + 1] = d[i + 2] = 0; }
  a.getContext('2d').putImageData(src, 0, 0); L._maskA = a; L._maskV = L.maskVer; return a;
}
function layerRender(L, live) {
  // returns {canvas, x, y} with stroke/mask/fx applied
  let src = L.canvas, ox = L.x, oy = L.y;
  const needTemp = (live && stroke && stroke.layer === L && !stroke.direct) || L.mask || (L.fx && (L.fx.shadow || L.fx.stroke || L.fx.glow)) || (live && T && T.layer === L);
  if (!needTemp) return { canvas: src, x: ox, y: oy };
  let tmp = mk(D.w, D.h); let tc = tmp.getContext('2d');
  tc.drawImage(src, ox, oy);
  if (live && stroke && stroke.layer === L && !stroke.direct && !stroke.onMask) {
    tc.save(); tc.globalAlpha = stroke.opacity; tc.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over'; tc.drawImage(stroke.buf, 0, 0); tc.restore();
  }
  if (live && T && T.layer === L) drawTransformed(tc, T);
  if (L.mask) {
    let ma = maskAlpha(L);
    if (live && stroke && stroke.layer === L && stroke.onMask) { const mm = cloneCanvas(L.mask); const mc = mm.getContext('2d'); mc.globalAlpha = stroke.opacity; mc.drawImage(stroke.buf, -L.x, -L.y); ma = maskAlpha({ mask: mm, maskVer: Math.random() }); }
    tc.globalCompositeOperation = 'destination-in'; tc.drawImage(ma, L.x, L.y); tc.globalCompositeOperation = 'source-over';
  }
  const fx = L.fx || {};
  if (fx.shadow || fx.stroke || fx.glow) {
    const out = mk(D.w, D.h), oc = out.getContext('2d');
    if (fx.shadow) { const s = fx.shadow, a = s.angle * Math.PI / 180; oc.save(); oc.shadowColor = hexA(s.color, s.opacity); oc.shadowBlur = s.size; oc.shadowOffsetX = -Math.cos(a) * s.distance + 10000; oc.shadowOffsetY = Math.sin(a) * s.distance; oc.drawImage(tmp, -10000, 0); oc.restore(); }
    if (fx.glow) { const s = fx.glow; oc.save(); oc.shadowColor = hexA(s.color, s.opacity); oc.shadowBlur = s.size; oc.shadowOffsetX = 10000; oc.drawImage(tmp, -10000, 0); oc.drawImage(tmp, -10000, 0); oc.restore(); }
    if (fx.stroke) { const s = fx.stroke; const tint = mk(D.w, D.h), ti = tint.getContext('2d'); ti.drawImage(tmp, 0, 0); ti.globalCompositeOperation = 'source-in'; ti.fillStyle = s.color; ti.fillRect(0, 0, D.w, D.h); oc.save(); oc.globalAlpha = s.opacity; const n = Math.max(8, Math.ceil(s.size * 2)); for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; oc.drawImage(tint, Math.cos(a) * s.size, Math.sin(a) * s.size); } oc.restore(); }
    oc.drawImage(tmp, 0, 0); tmp = out;
  }
  return { canvas: tmp, x: 0, y: 0 };
}
const hexA = (hx, a) => { const [r, g, b] = hexToRgb(hx); return `rgba(${r},${g},${b},${a})`; };
function compositeTo(c, { live = false, only = null } = {}) {
  for (const L of D.layers) {
    if (!L.visible && only !== L) continue; if (only && only !== L) continue;
    const r = layerRender(L, live);
    c.save(); c.globalAlpha = L.opacity; c.globalCompositeOperation = L.blend; c.drawImage(r.canvas, r.x, r.y); c.restore();
  }
}
function flattenCanvas() { const c = mk(D.w, D.h); compositeTo(c.getContext('2d')); return c; }

// =====================================================================  overlay (selection ants, guides, cursors)
let antsPhase = 0;
setInterval(() => { if (D?.selPath) { antsPhase = (antsPhase + 1) % 8; drawOverlay(); } }, 120);
let cursorPos = null;
function drawOverlay() {
  const c = overlay.getContext('2d'); const dpr = devicePixelRatio; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, overlay.width, overlay.height);
  if (!D) return;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const z = D.zoom;
  const docT = () => c.setTransform(dpr * z, 0, 0, dpr * z, dpr * D.px, dpr * D.py);
  // grid
  if (O.showGrid) { docT(); c.strokeStyle = 'rgba(79,140,255,.35)'; c.lineWidth = 1 / z; const step = Math.max(10, Math.round(Math.min(D.w, D.h) / 12 / 10) * 10); c.beginPath(); for (let x = step; x < D.w; x += step) { c.moveTo(x, 0); c.lineTo(x, D.h); } for (let y = step; y < D.h; y += step) { c.moveTo(0, y); c.lineTo(D.w, y); } c.stroke(); }
  if (z >= 8 && O.pixel) { docT(); c.strokeStyle = 'rgba(128,128,128,.25)'; c.lineWidth = 1 / z; const [x0, y0] = [Math.max(0, Math.floor(-D.px / z)), Math.max(0, Math.floor(-D.py / z))]; const x1 = Math.min(D.w, x0 + overlay.width / dpr / z + 1), y1 = Math.min(D.h, y0 + overlay.height / dpr / z + 1); c.beginPath(); for (let x = x0; x <= x1; x++) { c.moveTo(x, y0); c.lineTo(x, y1); } for (let y = y0; y <= y1; y++) { c.moveTo(x0, y); c.lineTo(x1, y); } c.stroke(); }
  // selection marching ants
  if (D.selPath) { docT(); c.lineWidth = 1 / z; c.setLineDash([4 / z, 4 / z]); c.strokeStyle = '#000'; c.lineDashOffset = -antsPhase / z; c.stroke(D.selPath); c.strokeStyle = '#fff'; c.lineDashOffset = (-antsPhase + 4) / z; c.stroke(D.selPath); c.setLineDash([]); }
  docT(); c.lineWidth = 1 / z;
  if (marqRect) { c.setLineDash([4 / z, 4 / z]); c.strokeStyle = '#fff'; c.beginPath(); if (O.marq === 'ellipse') c.ellipse(marqRect.x + marqRect.w / 2, marqRect.y + marqRect.h / 2, Math.abs(marqRect.w / 2), Math.abs(marqRect.h / 2), 0, 0, Math.PI * 2); else c.rect(marqRect.x, marqRect.y, marqRect.w, marqRect.h); c.stroke(); c.setLineDash([]); }
  if (lassoPts) { c.strokeStyle = '#fff'; c.setLineDash([4 / z, 4 / z]); c.beginPath(); lassoPts.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.stroke(); c.setLineDash([]); }
  if (gradPreview) { c.strokeStyle = '#fff'; c.lineWidth = 2 / z; c.beginPath(); c.moveTo(gradPreview.x1, gradPreview.y1); c.lineTo(gradPreview.x2, gradPreview.y2); c.stroke(); [[gradPreview.x1, gradPreview.y1], [gradPreview.x2, gradPreview.y2]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 4 / z, 0, 7); c.fillStyle = '#fff'; c.fill(); c.stroke(); }); }
  if (shapePreview) { c.save(); drawShape(c, shapePreview, true); c.restore(); }
  if (cropState) {
    const cr = cropState; c.fillStyle = 'rgba(0,0,0,.55)'; c.beginPath(); c.rect(-1e5, -1e5, 2e5, 2e5); c.rect(cr.x, cr.y + cr.h, cr.w, -cr.h); c.fill('evenodd');
    c.strokeStyle = '#fff'; c.lineWidth = 1.5 / z; c.strokeRect(cr.x, cr.y, cr.w, cr.h);
    c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 1 / z; c.beginPath(); for (let i = 1; i < 3; i++) { c.moveTo(cr.x + cr.w * i / 3, cr.y); c.lineTo(cr.x + cr.w * i / 3, cr.y + cr.h); c.moveTo(cr.x, cr.y + cr.h * i / 3); c.lineTo(cr.x + cr.w, cr.y + cr.h * i / 3); } c.stroke();
    cropHandles().forEach(([x, y]) => { c.fillStyle = '#fff'; c.fillRect(x - 5 / z, y - 5 / z, 10 / z, 10 / z); });
  }
  if (T) {
    const pts = transformCorners(T); c.strokeStyle = '#31a8ff'; c.lineWidth = 1.5 / z; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath(); c.stroke();
    transformHandles(T).forEach(([x, y]) => { c.fillStyle = '#fff'; c.strokeStyle = '#31a8ff'; c.fillRect(x - 4 / z, y - 4 / z, 8 / z, 8 / z); c.strokeRect(x - 4 / z, y - 4 / z, 8 / z, 8 / z); });
  }
  // brush cursor
  if (cursorPos && ['brush', 'pencil', 'eraser', 'clone', 'heal', 'blur', 'dodge'].includes(O.tool) && !spaceDown) {
    c.setTransform(dpr, 0, 0, dpr, 0, 0); const [sx, sy] = toScreen(...cursorPos); const r = Math.max(1, O.size * z / 2);
    c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,.8)'; c.beginPath(); c.arc(sx, sy, r, 0, 7); c.stroke(); c.strokeStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(sx, sy, r + 1, 0, 7); c.stroke();
    if (O.tool === 'clone' && cloneSrc) { const [qx, qy] = toScreen(...(cloneOffset && stroke ? [cursorPos[0] - cloneOffset[0], cursorPos[1] - cloneOffset[1]] : cloneSrc)); c.beginPath(); c.moveTo(qx - 6, qy); c.lineTo(qx + 6, qy); c.moveTo(qx, qy - 6); c.lineTo(qx, qy + 6); c.stroke(); }
  }
}
function updateCursor() {
  const t = O.tool; const map = { hand: 'grab', zoom: 'zoom-in', text: 'text', move: 'move', eyedrop: 'crosshair', bucket: 'crosshair', wand: 'crosshair', marquee: 'crosshair', lasso: 'crosshair', crop: 'crosshair', gradient: 'crosshair', shape: 'crosshair' };
  vpEl.style.cursor = spaceDown ? 'grab' : (['brush', 'pencil', 'eraser', 'clone', 'heal', 'blur', 'dodge'].includes(t) ? 'none' : map[t] || 'default');
}

// =====================================================================  selection
function selectionFromCanvas(m, mode = O.selMode, label = 'Selection') {
  if (!D) return;
  const old = D.sel; let res = m;
  if (old && mode !== 'new') {
    res = cloneCanvas(old); const rc = res.getContext('2d');
    rc.globalCompositeOperation = mode === 'add' ? 'source-over' : mode === 'sub' ? 'destination-out' : 'destination-in'; rc.drawImage(m, 0, 0);
  }
  if (O.feather > 0 && ['marquee', 'lasso'].includes(O.tool)) res = blurCanvas(res, O.feather);
  setSel(res); pushHist(label);
}
function setSel(m) {
  if (m && isEmptyMask(m)) m = null;
  if (D.sel) D.prevSel = D.sel; D.sel = m; D.selPath = m ? buildAnts(m) : null; drawOverlay();
}
function isEmptyMask(m) { const d = ctxOf(m).getImageData(0, 0, m.width, m.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 127) return false; return true; }
function buildAnts(m) {
  const w = m.width, hh = m.height, d = ctxOf(m).getImageData(0, 0, w, hh).data; const on = (x, y) => x >= 0 && y >= 0 && x < w && y < hh && d[(y * w + x) * 4 + 3] > 127;
  const p = new Path2D(); let n = 0;
  for (let y = 0; y <= hh; y++) { let sx = -1; for (let x = 0; x <= w; x++) { const e = x < w && on(x, y) !== on(x, y - 1); if (e && sx < 0) sx = x; if (!e && sx >= 0) { p.moveTo(sx, y); p.lineTo(x, y); sx = -1; n++; } } }
  for (let x = 0; x <= w; x++) { let sy = -1; for (let y = 0; y <= hh; y++) { const e = y < hh && on(x, y) !== on(x - 1, y); if (e && sy < 0) sy = y; if (!e && sy >= 0) { p.moveTo(x, sy); p.lineTo(x, y); sy = -1; n++; } } }
  return p;
}
function maskFromPath(fn) { const m = mk(D.w, D.h); const c = m.getContext('2d'); c.fillStyle = '#fff'; c.beginPath(); fn(c); c.fill(); return m; }
function selectAll() { if (!D) return; const m = mk(D.w, D.h); const c = m.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, D.w, D.h); setSel(m); pushHist('Select all'); }
function deselect() { if (!D || !D.sel) return; setSel(null); pushHist('Deselect'); }
function reselect() { if (D?.prevSel) { setSel(D.prevSel); pushHist('Reselect'); } }
function invertSel() { if (!D) return; const m = mk(D.w, D.h); const c = m.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, D.w, D.h); if (D.sel) { c.globalCompositeOperation = 'destination-out'; c.drawImage(D.sel, 0, 0); } setSel(m); pushHist('Inverse'); }
function selectLayerAlpha() { const L = AL(); if (!L) return; const m = mk(D.w, D.h); m.getContext('2d').drawImage(L.canvas, L.x, L.y); hardenMask(m, 1); selectionFromCanvas(m, 'new', 'Load transparency'); }
function hardenMask(m, th = 128) { const c = ctxOf(m), id = c.getImageData(0, 0, m.width, m.height), d = id.data; for (let i = 0; i < d.length; i += 4) { const a = d[i + 3] >= th ? 255 : d[i + 3] > 0 && th === 1 ? d[i + 3] : 0; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = a; } c.putImageData(id, 0, 0); }
function blurCanvas(src, r) { const o = mk(src.width, src.height), c = o.getContext('2d'); c.filter = `blur(${r}px)`; c.drawImage(src, 0, 0); return o; }
async function modifySel(kind) {
  if (!D?.sel) return toast('Make a selection first');
  const v = await prompt({ feather: 'Feather selection', expand: 'Expand selection', contract: 'Contract selection', smooth: 'Smooth selection' }[kind], 'Radius (px)', '5', 'number'); if (!v) return;
  const r = Math.max(1, +v); let m = blurCanvas(D.sel, kind === 'feather' ? r : r / 2);
  if (kind !== 'feather') { const c = ctxOf(m), id = c.getImageData(0, 0, m.width, m.height), d = id.data, th = kind === 'expand' ? 20 : kind === 'contract' ? 235 : 128; for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= th ? 255 : 0; c.putImageData(id, 0, 0); }
  setSel(m); pushHist(kind[0].toUpperCase() + kind.slice(1));
}
function sampleData(all) { if (all) return ctxOf(flattenCanvas()).getImageData(0, 0, D.w, D.h); const L = AL(); const c = mk(D.w, D.h); c.getContext('2d').drawImage(L.canvas, L.x, L.y); return ctxOf(c).getImageData(0, 0, D.w, D.h); }
function floodMask(img, sx, sy, tol, contiguous) {
  const w = img.width, hh = img.height, d = img.data; sx = Math.floor(sx); sy = Math.floor(sy);
  const out = new Uint8Array(w * hh); if (sx < 0 || sy < 0 || sx >= w || sy >= hh) return out;
  const i0 = (sy * w + sx) * 4, r0 = d[i0], g0 = d[i0 + 1], b0 = d[i0 + 2], a0 = d[i0 + 3];
  const match = i => { const j = i * 4; return Math.abs(d[j] - r0) <= tol && Math.abs(d[j + 1] - g0) <= tol && Math.abs(d[j + 2] - b0) <= tol && Math.abs(d[j + 3] - a0) <= tol; };
  if (!contiguous) { for (let i = 0; i < w * hh; i++) if (match(i)) out[i] = 1; return out; }
  const stack = [sy * w + sx];
  while (stack.length) {
    let i = stack.pop(); let x = i % w, y = (i - x) / w;
    while (x > 0 && !out[i - 1] && match(i - 1)) { x--; i--; }
    let up = false, dn = false;
    for (; x < w && !out[i] && match(i); x++, i++) {
      out[i] = 1;
      if (y > 0) { const u = i - w; if (!out[u] && match(u)) { if (!up) { stack.push(u); up = true; } } else up = false; }
      if (y < hh - 1) { const v = i + w; if (!out[v] && match(v)) { if (!dn) { stack.push(v); dn = true; } } else dn = false; }
    }
  }
  return out;
}
function maskFromBits(bits) { const m = mk(D.w, D.h), c = m.getContext('2d'), id = c.createImageData(D.w, D.h), d = id.data; for (let i = 0; i < bits.length; i++) if (bits[i]) { const j = i * 4; d[j] = d[j + 1] = d[j + 2] = 255; d[j + 3] = 255; } c.putImageData(id, 0, 0); return m; }
async function colorRangeDialog() {
  if (!D) return; const v = await form({ title: 'Color range', fields: [{ key: 'color', label: 'Color to select', type: 'color', value: O.fg }, { key: 'tol', label: 'Fuzziness', type: 'range', min: 0, max: 200, value: 40 }], ok: 'Select' }); if (!v) return;
  const img = sampleData(true), [r, g, b] = hexToRgb(v.color), d = img.data, bits = new Uint8Array(D.w * D.h);
  for (let i = 0; i < bits.length; i++) { const j = i * 4; if (Math.abs(d[j] - r) + Math.abs(d[j + 1] - g) + Math.abs(d[j + 2] - b) <= v.tol * 1.5) bits[i] = 1; }
  selectionFromCanvas(maskFromBits(bits), 'new', 'Color range');
}

// apply a change to the layer, restricted to selection: fn(ctx of layer-copy in doc space)
function withSelection(L, drawFn) {
  ensureCovers(L);
  const tmp = mk(L.canvas.width, L.canvas.height), tc = tmp.getContext('2d'); tc.drawImage(L.canvas, 0, 0);
  drawFn(tc, -L.x, -L.y);
  if (D.sel) { const keep = mk(tmp.width, tmp.height), kc = keep.getContext('2d'); kc.drawImage(tmp, 0, 0); kc.globalCompositeOperation = 'destination-in'; kc.drawImage(D.sel, L.x * -1 + 0, -L.y); // masked new
    const res = mk(tmp.width, tmp.height), rc = res.getContext('2d'); rc.drawImage(L.canvas, 0, 0); rc.globalCompositeOperation = 'destination-out'; rc.drawImage(D.sel, -L.x, -L.y); rc.globalCompositeOperation = 'source-over'; rc.drawImage(keep, 0, 0); return replaceCanvas(L, res); }
  replaceCanvas(L, tmp);
}
function replaceCanvas(L, c) { const x = L.canvas.getContext('2d'); x.clearRect(0, 0, L.canvas.width, L.canvas.height); x.drawImage(c, 0, 0); }
function ensureCovers(L) {
  const x0 = Math.min(L.x, 0), y0 = Math.min(L.y, 0), x1 = Math.max(L.x + L.canvas.width, D.w), y1 = Math.max(L.y + L.canvas.height, D.h);
  if (x0 === L.x && y0 === L.y && x1 - x0 === L.canvas.width && y1 - y0 === L.canvas.height) return;
  const n = mk(x1 - x0, y1 - y0); n.getContext('2d').drawImage(L.canvas, L.x - x0, L.y - y0); L.canvas = n; L.x = x0; L.y = y0;
}

// =====================================================================  history
function cloneLayer(L) { return { ...L, canvas: cloneCanvas(L.canvas), mask: L.mask ? cloneCanvas(L.mask) : null, fx: JSON.parse(JSON.stringify(L.fx || {})), text: L.text ? { ...L.text } : undefined, _maskA: null }; }
function pushHist(label) {
  if (!D) return;
  D.hist = D.hist.slice(0, D.hi + 1);
  D.hist.push({ label, w: D.w, h: D.h, active: D.active, layers: D.layers.map(cloneLayer), sel: D.sel ? cloneCanvas(D.sel) : null });
  if (D.hist.length > 40) D.hist.shift(); D.hi = D.hist.length - 1;
  if (D.hist.length > 1) { D.dirty = true; UI.setDocTitle(D.name + ' •', 'BTS Photo'); renderTabs(); }
  renderLayers(); renderHistory();
}
function restoreHist(i) {
  const s = D.hist[i]; if (!s) return; D.hi = i; D.w = s.w; D.h = s.h; D.active = s.active; D.layers = s.layers.map(cloneLayer); D.layers.forEach(l => l.maskVer = Math.random());
  D.sel = s.sel ? cloneCanvas(s.sel) : null; D.selPath = D.sel ? buildAnts(D.sel) : null;
  T = null; renderAll();
}
function undo() { if (T) return cancelTransform(); if (D && D.hi > 0) restoreHist(D.hi - 1); }
function redo() { if (D && D.hi < D.hist.length - 1) restoreHist(D.hi + 1); }
UI.shortcut('ctrl+z', undo); UI.shortcut('ctrl+shift+z', redo); UI.shortcut('ctrl+y', redo); UI.shortcut('ctrl+alt+z', undo);

// =====================================================================  pointer handling
let spaceDown = false, pan = null, cloneSrc = null, cloneOffset = null, drag = null;
window.addEventListener('keydown', e => { if (e.code === 'Space' && !e.target.closest('input,textarea,select') && !spaceDown) { spaceDown = true; updateCursor(); drawOverlay(); e.preventDefault(); } if (e.key === 'Enter' && !e.target.closest('input,textarea')) { if (T) commitTransform(); else if (cropState) applyCrop(); } if (e.key === 'Escape') { if (T) cancelTransform(); else if (textEd) finishText(false); } });
window.addEventListener('keyup', e => { if (e.code === 'Space') { spaceDown = false; updateCursor(); drawOverlay(); } });
vpEl.addEventListener('pointermove', e => { if (!D) return; cursorPos = toDoc(e); const [x, y] = cursorPos; $('#stPos').textContent = `X ${Math.floor(x)}  Y ${Math.floor(y)}`; if (!drag) drawOverlay(); updateHoverCursor(e); });
vpEl.addEventListener('pointerleave', () => { cursorPos = null; drawOverlay(); });
vpEl.addEventListener('contextmenu', e => { if (!D) return; contextMenu(e, [{ label: 'Undo', action: undo }, '-', { label: 'Deselect', action: deselect, disabled: !D.sel }, { label: 'Select inverse', action: invertSel }, { label: 'Layer via copy', action: () => layerVia(false) }, { label: 'Free transform', action: startTransform }, '-', { label: 'Fill…', action: fillDialog }, { label: 'Stroke…', action: strokeDialog }]); });
vpEl.addEventListener('pointerdown', e => {
  if (!D) return; if (e.button === 2) return;
  if (textEd && !e.target.closest('.text-editor')) { finishText(true); if (O.tool === 'text') return; }
  vpEl.setPointerCapture(e.pointerId);
  const [x, y] = toDoc(e);
  if (spaceDown || O.tool === 'hand' || e.button === 1) { pan = { sx: e.clientX, sy: e.clientY, px: D.px, py: D.py }; vpEl.style.cursor = 'grabbing'; return; }
  const L = AL(); const t = O.tool;
  const paintTools = ['brush', 'pencil', 'eraser', 'clone', 'heal', 'blur', 'dodge'];
  if (paintTools.includes(t) || ['bucket', 'gradient', 'move'].includes(t)) {
    if (!L) return;
    if (L.locked) return toast('Layer is locked', 'err');
    if (L.kind === 'text' && t !== 'move') { if (!(L.editMask && L.mask)) return toast('Rasterize the text layer first (Layer › Rasterize)', 'err'); }
    if (!L.visible && t !== 'move') return toast('Layer is hidden', 'err');
  }
  switch (t) {
    case 'zoom': { const r = vpEl.getBoundingClientRect(); setZoom(D.zoom * (e.altKey ? 0.8 : 1.25), e.clientX - r.left, e.clientY - r.top); return; }
    case 'eyedrop': { const img = O.sampleAll ? flattenCanvas() : (() => { const c = mk(D.w, D.h); c.getContext('2d').drawImage(L.canvas, L.x, L.y); return c; })(); const p = ctxOf(img).getImageData(clamp(Math.floor(x), 0, D.w - 1), clamp(Math.floor(y), 0, D.h - 1), 1, 1).data; const hx = rgbToHex(p[0], p[1], p[2]); if (e.altKey) O.bg = hx; else O.fg = hx; renderColor(); return; }
    case 'wand': { const bits = floodMask(sampleData(O.sampleAll), x, y, O.tolerance, O.contiguous); selectionFromCanvas(maskFromBits(bits), e.shiftKey ? 'add' : e.altKey ? 'sub' : O.selMode, 'Magic wand'); return; }
    case 'bucket': { bucketFill(x, y); return; }
    case 'text': { textClick(x, y); return; }
    case 'clone': if (e.altKey) { cloneSrc = [x, y]; cloneOffset = null; toast('Clone source set'); return; } if (!cloneSrc) return toast('Alt+click to set a clone source first', 'err'); break;
  }
  if (paintTools.includes(t)) return beginStroke(e, x, y);
  if (t === 'marquee') { drag = { x0: x, y0: y, mode: e.shiftKey ? 'add' : e.altKey ? 'sub' : O.selMode }; marqRect = { x, y, w: 0, h: 0 }; return; }
  if (t === 'lasso') { drag = { mode: e.shiftKey ? 'add' : e.altKey ? 'sub' : O.selMode }; lassoPts = [[x, y]]; return; }
  if (t === 'gradient') { gradPreview = { x1: x, y1: y, x2: x, y2: y }; drag = {}; return; }
  if (t === 'shape') { shapePreview = { type: O.shape, x1: x, y1: y, x2: x, y2: y }; drag = {}; return; }
  if (t === 'crop') { drag = cropDragStart(x, y); return; }
  if (t === 'move') {
    if (T) { drag = transformDragStart(x, y, e); return; }
    if (O.autoSelect || e.ctrlKey) { for (let i = D.layers.length - 1; i >= 0; i--) { const l = D.layers[i]; if (!l.visible) continue; const lx = Math.floor(x - l.x), ly = Math.floor(y - l.y); if (lx < 0 || ly < 0 || lx >= l.canvas.width || ly >= l.canvas.height) continue; if (ctxOf(l.canvas).getImageData(lx, ly, 1, 1).data[3] > 10) { D.active = i; renderLayers(); break; } } }
    const ML = AL(); if (!ML || ML.locked) return;
    if (D.sel && ML.kind === 'raster') { startTransform(); drag = T ? { kind: 'move', sx: x, sy: y, t0: { ...T } } : null; return; }
    drag = { kind: 'layer', sx: x, sy: y, lx: ML.x, ly: ML.y, L: ML, alt: e.altKey };
    if (e.altKey) { duplicateLayer(true); drag.L = AL(); }
    return;
  }
});
vpEl.addEventListener('pointermove', e => {
  if (!D) return;
  if (pan) { D.px = pan.px + e.clientX - pan.sx; D.py = pan.py + e.clientY - pan.sy; applyView(); return; }
  const [x, y] = toDoc(e);
  if (stroke) { continueStroke(x, y, e); return; }
  if (!drag) return;
  const t = O.tool;
  if (t === 'marquee') { let w = x - drag.x0, hh = y - drag.y0; if (e.shiftKey && drag.mode !== 'add') { const m = Math.max(Math.abs(w), Math.abs(hh)); w = Math.sign(w || 1) * m; hh = Math.sign(hh || 1) * m; } if (e.altKey && drag.mode !== 'sub') { marqRect = { x: drag.x0 - w, y: drag.y0 - hh, w: w * 2, h: hh * 2 }; } else marqRect = { x: drag.x0, y: drag.y0, w, h: hh }; drawOverlay(); }
  else if (t === 'lasso') { lassoPts.push([x, y]); drawOverlay(); }
  else if (t === 'gradient') { gradPreview.x2 = x; gradPreview.y2 = y; if (e.shiftKey) { const a = Math.round(Math.atan2(y - gradPreview.y1, x - gradPreview.x1) / (Math.PI / 4)) * Math.PI / 4, l = Math.hypot(x - gradPreview.x1, y - gradPreview.y1); gradPreview.x2 = gradPreview.x1 + Math.cos(a) * l; gradPreview.y2 = gradPreview.y1 + Math.sin(a) * l; } drawOverlay(); }
  else if (t === 'shape') { let x2 = x, y2 = y; if (e.shiftKey) { const s = Math.max(Math.abs(x - shapePreview.x1), Math.abs(y - shapePreview.y1)); if (shapePreview.type === 'line' || shapePreview.type === 'arrow') { const a = Math.round(Math.atan2(y - shapePreview.y1, x - shapePreview.x1) / (Math.PI / 4)) * Math.PI / 4, l = Math.hypot(x - shapePreview.x1, y - shapePreview.y1); x2 = shapePreview.x1 + Math.cos(a) * l; y2 = shapePreview.y1 + Math.sin(a) * l; } else { x2 = shapePreview.x1 + Math.sign(x - shapePreview.x1 || 1) * s; y2 = shapePreview.y1 + Math.sign(y - shapePreview.y1 || 1) * s; } } shapePreview.x2 = x2; shapePreview.y2 = y2; drawOverlay(); }
  else if (t === 'crop') { cropDragMove(drag, x, y, e); drawOverlay(); }
  else if (t === 'move') {
    if (drag.kind === 'layer') { let dx = x - drag.sx, dy = y - drag.sy; if (e.shiftKey) Math.abs(dx) > Math.abs(dy) ? dy = 0 : dx = 0; drag.L.x = Math.round(drag.lx + dx); drag.L.y = Math.round(drag.ly + dy); requestRender(); }
    else if (T) { transformDragMove(drag, x, y, e); requestRender(); drawOverlay(); }
  }
});
vpEl.addEventListener('pointerup', e => {
  if (!D) return;
  if (pan) { pan = null; updateCursor(); return; }
  if (stroke) { endStroke(); return; }
  if (!drag) return; const d = drag; drag = null; const t = O.tool;
  if (t === 'marquee') { const r = normRect(marqRect); marqRect = null; if (r.w < 2 || r.h < 2) { if (d.mode === 'new') { deselect(); } drawOverlay(); return; } selectionFromCanvas(maskFromPath(c => O.marq === 'ellipse' ? c.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2) : c.rect(Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h))), d.mode, O.marq === 'ellipse' ? 'Elliptical marquee' : 'Rectangular marquee'); }
  else if (t === 'lasso') { const pts = lassoPts; lassoPts = null; if (pts.length < 3) { drawOverlay(); return; } selectionFromCanvas(maskFromPath(c => { pts.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath(); }), d.mode, 'Lasso'); }
  else if (t === 'gradient') { const g = gradPreview; gradPreview = null; if (Math.hypot(g.x2 - g.x1, g.y2 - g.y1) > 2) applyGradient(g); drawOverlay(); }
  else if (t === 'shape') { const s = shapePreview; shapePreview = null; drawOverlay(); if (Math.abs(s.x2 - s.x1) > 2 || Math.abs(s.y2 - s.y1) > 2) commitShape(s); }
  else if (t === 'move') { if (d.kind === 'layer') { if (d.L.x !== d.lx || d.L.y !== d.ly || d.alt) pushHist('Move'); } }
});
function updateHoverCursor(e) {
  if (O.tool === 'move' && T && !drag) { const [x, y] = toDoc(e); const h0 = transformHit(x, y); vpEl.style.cursor = h0 === 'rotate' ? 'alias' : h0 === 'move' ? 'move' : h0 ? 'nwse-resize' : 'default'; }
}
const normRect = r => ({ x: Math.min(r.x, r.x + r.w), y: Math.min(r.y, r.y + r.h), w: Math.abs(r.w), h: Math.abs(r.h) });

// =====================================================================  brush engine
function makeDab(size, hardness, color) {
  const s = Math.max(1, Math.ceil(size)), c = mk(s + 2, s + 2), x = c.getContext('2d'), r = s / 2;
  const g = x.createRadialGradient(r + 1, r + 1, 0, r + 1, r + 1, r);
  const [R, G, B] = hexToRgb(color); g.addColorStop(0, `rgba(${R},${G},${B},1)`); g.addColorStop(clamp(hardness, 0, 0.99), `rgba(${R},${G},${B},1)`); g.addColorStop(1, `rgba(${R},${G},${B},0)`);
  x.fillStyle = g; x.beginPath(); x.arc(r + 1, r + 1, r, 0, 7); x.fill(); return c;
}
function beginStroke(e, x, y) {
  const L = AL(); const t = O.tool;
  ensureCovers(L);
  const onMask = !!(L.mask && L.editMask);
  if (onMask && L.mask.width !== L.canvas.width) { const nm = mk(L.canvas.width, L.canvas.height), nc = nm.getContext('2d'); nc.fillStyle = '#fff'; nc.fillRect(0, 0, nm.width, nm.height); nc.drawImage(L.mask, 0, 0); L.mask = nm; }
  const direct = ['heal', 'blur', 'dodge'].includes(t);
  let color = O.fg; if (onMask) { const [r, g, b] = hexToRgb(O.fg); const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b); color = rgbToHex(lum, lum, lum); }
  stroke = { layer: L, buf: mk(D.w, D.h), last: [x, y], acc: 0, erase: t === 'eraser' && !onMask, opacity: O.opacity, direct, onMask, tool: t, color,
    dab: t === 'pencil' ? null : makeDab(O.size, t === 'eraser' || t === 'brush' || t === 'clone' ? O.hardness : 0.5, t === 'eraser' ? '#000000' : color) };
  if (onMask && t === 'eraser') { stroke.dab = makeDab(O.size, O.hardness, '#ffffff'); stroke.color = '#ffffff'; }
  if (t === 'clone') { const srcC = O.sampleAll ? flattenCanvas() : (() => { const c = mk(D.w, D.h); c.getContext('2d').drawImage(L.canvas, L.x, L.y); return c; })(); stroke.srcC = srcC; if (!O.cloneAligned || !cloneOffset) cloneOffset = [x - cloneSrc[0], y - cloneSrc[1]]; }
  if (t === 'blur' && O.blurMode === 'smudge') stroke.pick = null;
  dabAt(x, y); requestRender();
}
function continueStroke(x, y, e) {
  const s = stroke; const [lx, ly] = s.last; const dist = Math.hypot(x - lx, y - ly); const step = Math.max(1, O.size * (s.direct ? 0.3 : O.spacing));
  if (e.shiftKey && !s.shiftLine) {}
  let tt = step - s.acc; while (tt <= dist) { const k = tt / dist; dabAt(lx + (x - lx) * k, ly + (y - ly) * k); tt += step; }
  s.acc = dist - (tt - step); s.last = [x, y]; cursorPos = [x, y]; requestRender(); drawOverlay();
}
function dabAt(x, y) {
  const s = stroke, t = s.tool, sz = O.size;
  if (s.direct) return directDab(x, y);
  const c = s.buf.getContext('2d');
  if (t === 'pencil') { c.fillStyle = s.color; const r = Math.max(1, Math.round(sz)); c.fillRect(Math.round(x - r / 2), Math.round(y - r / 2), r, r); return; }
  if (t === 'clone') {
    const r = sz / 2, src = s.srcC, ox = cloneOffset[0], oy = cloneOffset[1];
    const tmp = mk(sz + 2, sz + 2), tc = tmp.getContext('2d'); tc.drawImage(src, x - ox - r - 1, y - oy - r - 1, sz + 2, sz + 2, 0, 0, sz + 2, sz + 2);
    tc.globalCompositeOperation = 'destination-in'; tc.drawImage(s.dab, 0, 0);
    c.save(); c.globalAlpha = O.flow; c.drawImage(tmp, x - r - 1, y - r - 1); c.restore(); return;
  }
  c.save(); c.globalAlpha = O.flow; c.drawImage(s.dab, x - sz / 2 - 1, y - sz / 2 - 1); c.restore();
}
function directDab(x, y) {
  const L = stroke.layer, sz = Math.max(4, O.size), r = sz / 2;
  const lx = Math.round(x - L.x - r), ly = Math.round(y - L.y - r), w = Math.ceil(sz), hh = Math.ceil(sz);
  const x0 = clamp(lx, 0, L.canvas.width), y0 = clamp(ly, 0, L.canvas.height), x1 = clamp(lx + w, 0, L.canvas.width), y1 = clamp(ly + hh, 0, L.canvas.height);
  if (x1 - x0 < 2 || y1 - y0 < 2) return;
  const cx = ctxOf(L.canvas), img = cx.getImageData(x0, y0, x1 - x0, y1 - y0), d = img.data, W = x1 - x0, H = y1 - y0;
  const ccx = x - L.x - x0, ccy = y - L.y - y0;
  const selD = D.sel ? ctxOf(D.sel).getImageData(x0 + L.x, y0 + L.y, W, H).data : null;
  const weight = (px, py) => { const dd = Math.hypot(px - ccx, py - ccy) / r; if (dd >= 1) return 0; const fw = dd < 0.5 ? 1 : 1 - (dd - 0.5) / 0.5; return selD ? fw * selD[(py * W + px) * 4 + 3] / 255 : fw; };
  const t = stroke.tool, k = O.strength;
  if (t === 'heal') {
    // diffusion inpainting inside the circle from its boundary
    const f = new Float32Array(d.length); for (let i = 0; i < d.length; i++) f[i] = d[i];
    const inside = new Uint8Array(W * H); for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) if (Math.hypot(px - ccx, py - ccy) < r * 0.85) inside[py * W + px] = 1;
    for (let it = 0; it < 60; it++) for (let py = 1; py < H - 1; py++) for (let px = 1; px < W - 1; px++) { const i = py * W + px; if (!inside[i]) continue; for (let ch = 0; ch < 4; ch++) { const j = i * 4 + ch; f[j] = (f[j - 4] + f[j + 4] + f[j - W * 4] + f[j + W * 4]) / 4; } }
    // add back a bit of texture from the ring for realism
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) { const i = py * W + px; if (!inside[i]) continue; const wgt = weight(px, py); for (let ch = 0; ch < 4; ch++) { const j = i * 4 + ch; d[j] = d[j] * (1 - wgt) + f[j] * wgt; } }
  } else if (t === 'blur') {
    const src = new Uint8ClampedArray(d);
    if (O.blurMode === 'smudge') {
      if (stroke.pick && stroke.pick.width === W && stroke.pick.height === H) { const p = stroke.pick.data; for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) { const wgt = weight(px, py) * k; if (!wgt) continue; const j = (py * W + px) * 4; for (let ch = 0; ch < 4; ch++) d[j + ch] = d[j + ch] * (1 - wgt) + p[j + ch] * wgt; } }
      stroke.pick = new ImageData(new Uint8ClampedArray(d), W, H);
    } else {
      for (let py = 1; py < H - 1; py++) for (let px = 1; px < W - 1; px++) {
        const wgt = weight(px, py) * k; if (!wgt) continue; const j = (py * W + px) * 4;
        for (let ch = 0; ch < 4; ch++) { const avg = (src[j + ch] * 4 + src[j + ch - 4] + src[j + ch + 4] + src[j + ch - W * 4] + src[j + ch + W * 4] + (src[j + ch - W * 4 - 4] + src[j + ch - W * 4 + 4] + src[j + ch + W * 4 - 4] + src[j + ch + W * 4 + 4]) * 0.5) / 10;
          d[j + ch] = O.blurMode === 'blur' ? src[j + ch] * (1 - wgt) + avg * wgt : clamp(src[j + ch] + (src[j + ch] - avg) * wgt * 1.5, 0, 255); }
      }
    }
  } else if (t === 'dodge') {
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const wgt = weight(px, py) * k * 0.25; if (!wgt) continue; const j = (py * W + px) * 4; const lum = (0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]) / 255;
      const rangeW = O.range === 'shadows' ? 1 - lum : O.range === 'highlights' ? lum : 1 - Math.abs(lum - 0.5) * 2;
      const a = wgt * Math.max(0.15, rangeW);
      if (O.dodgeMode === 'dodge') for (let ch = 0; ch < 3; ch++) d[j + ch] = d[j + ch] + (255 - d[j + ch]) * a;
      else if (O.dodgeMode === 'burn') for (let ch = 0; ch < 3; ch++) d[j + ch] = d[j + ch] * (1 - a);
      else { const g = (d[j] + d[j + 1] + d[j + 2]) / 3; const m = O.dodgeMode === 'sponge' ? a * 2 : -a * 2; for (let ch = 0; ch < 3; ch++) d[j + ch] = clamp(d[j + ch] + (g - d[j + ch]) * m, 0, 255); }
    }
  }
  cx.putImageData(img, x0, y0);
}
function endStroke() {
  const s = stroke; stroke = null; const L = s.layer;
  if (!s.direct) {
    let buf = s.buf;
    if (D.sel) { const b = cloneCanvas(buf), bc = b.getContext('2d'); bc.globalCompositeOperation = 'destination-in'; bc.drawImage(D.sel, 0, 0); buf = b; }
    if (s.onMask) { const mc = L.mask.getContext('2d'); mc.save(); mc.globalAlpha = s.opacity; mc.drawImage(buf, -L.x, -L.y); mc.restore(); L.maskVer = Math.random(); }
    else { const c = L.canvas.getContext('2d'); c.save(); c.globalAlpha = s.opacity; c.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over'; c.drawImage(buf, -L.x, -L.y); c.restore(); }
  }
  requestRender(); pushHist({ brush: 'Brush', pencil: 'Pencil', eraser: 'Eraser', clone: 'Clone stamp', heal: 'Spot healing', blur: 'Blur tool', dodge: 'Dodge tool' }[s.tool] || 'Paint');
}

// =====================================================================  bucket / gradient / shapes
function bucketFill(x, y) {
  const L = AL(); ensureCovers(L);
  const bits = floodMask(sampleData(O.sampleAll), x, y, O.tolerance, O.contiguous);
  const m = maskFromBits(bits); if (D.sel) { const mc = m.getContext('2d'); mc.globalCompositeOperation = 'destination-in'; mc.drawImage(D.sel, 0, 0); }
  const fill = mk(D.w, D.h), fc = fill.getContext('2d'); fc.fillStyle = O.fg; fc.fillRect(0, 0, D.w, D.h); fc.globalCompositeOperation = 'destination-in'; fc.drawImage(m, 0, 0);
  const c = L.canvas.getContext('2d'); c.save(); c.globalAlpha = O.opacity; c.drawImage(fill, -L.x, -L.y); c.restore();
  requestRender(); pushHist('Paint bucket');
}
function applyGradient(g) {
  const L = AL(); ensureCovers(L);
  const tmp = mk(D.w, D.h), c = tmp.getContext('2d');
  const c0 = O.fg, c1 = O.gradTransparent ? hexA(O.fg, 0) : O.bg; const len = Math.hypot(g.x2 - g.x1, g.y2 - g.y1);
  if (O.grad === 'linear' || O.grad === 'reflected') { const gr = O.grad === 'linear' ? c.createLinearGradient(g.x1, g.y1, g.x2, g.y2) : c.createLinearGradient(2 * g.x1 - g.x2, 2 * g.y1 - g.y2, g.x2, g.y2); if (O.grad === 'linear') { gr.addColorStop(0, c0); gr.addColorStop(1, c1); } else { gr.addColorStop(0, c1); gr.addColorStop(0.5, c0); gr.addColorStop(1, c1); } c.fillStyle = gr; c.fillRect(0, 0, D.w, D.h); }
  else if (O.grad === 'radial') { const gr = c.createRadialGradient(g.x1, g.y1, 0, g.x1, g.y1, len); gr.addColorStop(0, c0); gr.addColorStop(1, c1); c.fillStyle = gr; c.fillRect(0, 0, D.w, D.h); }
  else if (O.grad === 'angle') { const gr = c.createConicGradient(Math.atan2(g.y2 - g.y1, g.x2 - g.x1), g.x1, g.y1); gr.addColorStop(0, c0); gr.addColorStop(1, c1); c.fillStyle = gr; c.fillRect(0, 0, D.w, D.h); }
  else { const id = c.createImageData(D.w, D.h), dd = id.data, A = hexToRgb(c0), B = hexToRgb(O.bg), a1 = O.gradTransparent ? 0 : 255; for (let y = 0; y < D.h; y++) for (let x = 0; x < D.w; x++) { const tt = clamp((Math.abs(x - g.x1) + Math.abs(y - g.y1)) / len, 0, 1), j = (y * D.w + x) * 4; const BB = O.gradTransparent ? A : B; dd[j] = A[0] + (BB[0] - A[0]) * tt; dd[j + 1] = A[1] + (BB[1] - A[1]) * tt; dd[j + 2] = A[2] + (BB[2] - A[2]) * tt; dd[j + 3] = 255 + (a1 - 255) * tt; } c.putImageData(id, 0, 0); }
  if (D.sel) { c.globalCompositeOperation = 'destination-in'; c.drawImage(D.sel, 0, 0); }
  const lc = L.canvas.getContext('2d'); lc.save(); lc.globalAlpha = O.opacity; lc.drawImage(tmp, -L.x, -L.y); lc.restore();
  requestRender(); pushHist('Gradient');
}
function shapePath(c, s) {
  const x = Math.min(s.x1, s.x2), y = Math.min(s.y1, s.y2), w = Math.abs(s.x2 - s.x1), hh = Math.abs(s.y2 - s.y1), cx = x + w / 2, cy = y + hh / 2;
  c.beginPath();
  switch (s.type) {
    case 'rect': c.rect(x, y, w, hh); break;
    case 'round': c.roundRect(x, y, w, hh, Math.min(O.radius, w / 2, hh / 2)); break;
    case 'ellipse': c.ellipse(cx, cy, w / 2, hh / 2, 0, 0, Math.PI * 2); break;
    case 'triangle': c.moveTo(cx, y); c.lineTo(x + w, y + hh); c.lineTo(x, y + hh); c.closePath(); break;
    case 'polygon': case 'star': { const n = O.sides, pts = s.type === 'star' ? n * 2 : n; for (let i = 0; i < pts; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / pts, rr = s.type === 'star' && i % 2 ? 0.45 : 1; const px = cx + Math.cos(a) * w / 2 * rr, py = cy + Math.sin(a) * hh / 2 * rr; i ? c.lineTo(px, py) : c.moveTo(px, py); } c.closePath(); break; }
    case 'line': case 'arrow': c.moveTo(s.x1, s.y1); c.lineTo(s.x2, s.y2); if (s.type === 'arrow') { const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1), L = Math.max(14, (O.shapeStroke || 4) * 4); c.moveTo(s.x2, s.y2); c.lineTo(s.x2 - L * Math.cos(a - 0.45), s.y2 - L * Math.sin(a - 0.45)); c.moveTo(s.x2, s.y2); c.lineTo(s.x2 - L * Math.cos(a + 0.45), s.y2 - L * Math.sin(a + 0.45)); } break;
  }
}
function drawShape(c, s, preview) {
  shapePath(c, s); const isLine = s.type === 'line' || s.type === 'arrow';
  if (O.shapeFill && !isLine) { c.fillStyle = O.fg; if (preview) c.globalAlpha = 0.7; c.fill(); c.globalAlpha = 1; }
  if (O.shapeStroke > 0 || isLine) { c.strokeStyle = isLine ? O.fg : O.bg; c.lineWidth = O.shapeStroke || 4; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(); }
  if (preview && !O.shapeFill && !O.shapeStroke && !isLine) { c.strokeStyle = '#31a8ff'; c.lineWidth = 1 / D.zoom; c.stroke(); }
}
let shapeCount = {};
function commitShape(s) {
  const name = { rect: 'Rectangle', round: 'Rounded Rectangle', ellipse: 'Ellipse', line: 'Line', triangle: 'Triangle', polygon: 'Polygon', star: 'Star', arrow: 'Arrow' }[s.type];
  shapeCount[name] = (shapeCount[name] || 0) + 1;
  const L = newLayer(`${name} ${shapeCount[name]}`, D.w, D.h); drawShape(L.canvas.getContext('2d'), s, false);
  D.layers.splice(D.active + 1, 0, L); D.active++; requestRender(); pushHist('New shape');
}

// =====================================================================  text tool
let textEd = null; // {layer, el, isNew}
function textClick(x, y) {
  const L = AL();
  // edit existing text layer under cursor
  for (let i = D.layers.length - 1; i >= 0; i--) { const l = D.layers[i]; if (l.kind !== 'text' || !l.visible) continue; const b = l.text.bounds; if (b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { D.active = i; renderLayers(); openTextEditor(l, false); return; } }
  const tl = newLayer('Text', D.w, D.h, { kind: 'text', text: { str: '', x, y, font: O.font, size: O.fontSize, bold: O.bold, italic: O.italic, color: O.fg, align: O.align } });
  D.layers.splice(D.active + 1, 0, tl); D.active++; renderLayers(); openTextEditor(tl, true);
}
function cssFontOf(t) { return `${t.italic ? 'italic ' : ''}${t.bold ? '700 ' : '400 '}${t.size}px "${t.font}"`; }
function openTextEditor(L, isNew) {
  const t = L.text; const ta = h('textarea', { class: 'text-editor', spellcheck: 'false' });
  ta.value = t.str; ta.style.font = cssFontOf(t); ta.style.color = t.color; ta.style.textAlign = t.align;
  const place = () => { const [sx, sy] = toScreen(t.x, t.y); ta.style.left = sx + 'px'; ta.style.top = sy + 'px'; ta.style.transform = `scale(${D.zoom})`; const lines = ta.value.split('\n'); const cx = document.createElement('canvas').getContext('2d'); cx.font = cssFontOf(t); ta.style.width = Math.max(40, ...lines.map(l => cx.measureText(l).width)) + t.size + 'px'; ta.style.height = lines.length * t.size * 1.2 + 6 + 'px'; };
  ta.oninput = place; place(); vpEl.append(ta);
  L._editing = true; renderTextLayer(L); requestRender();
  textEd = { layer: L, el: ta, isNew, place };
  ta.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') finishText(true); if (e.key === 'Enter' && e.ctrlKey) finishText(true); });
  setTimeout(() => ta.focus(), 20);
}
function finishText(commit) {
  if (!textEd) return; const { layer: L, el, isNew } = textEd; textEd = null; el.remove(); delete L._editing;
  if (commit) L.text.str = el.value;
  if (!L.text.str.trim()) { if (isNew) { D.layers = D.layers.filter(l => l !== L); D.active = clamp(D.active - 1, 0, D.layers.length - 1); } renderAll(); return; }
  L.name = L.text.str.split('\n')[0].slice(0, 30) || 'Text'; renderTextLayer(L); requestRender(); pushHist(isNew ? 'Type layer' : 'Edit type');
}
function applyTextOpts() {
  const L = textEd?.layer || (AL()?.kind === 'text' ? AL() : null); if (!L) return;
  Object.assign(L.text, { font: O.font, size: O.fontSize, bold: O.bold, italic: O.italic, align: O.align, color: textEd ? O.fg : L.text.color });
  if (textEd) { textEd.el.style.font = cssFontOf(L.text); textEd.el.style.textAlign = L.text.align; textEd.el.style.color = L.text.color; textEd.place(); }
  else { renderTextLayer(L); requestRender(); pushHist('Text style'); }
}
function renderTextLayer(L) {
  const t = L.text; L.canvas = mk(D.w, D.h); L.x = 0; L.y = 0; if (L._editing) { t.bounds = null; return; }
  const c = L.canvas.getContext('2d'); c.font = cssFontOf(t); c.fillStyle = t.color; c.textBaseline = 'top'; c.textAlign = t.align;
  const lines = t.str.split('\n'); const w = Math.max(...lines.map(l => c.measureText(l).width), 1);
  const ax = t.align === 'center' ? t.x + w / 2 : t.align === 'right' ? t.x + w : t.x;
  lines.forEach((ln, i) => c.fillText(ln, ax, t.y + i * t.size * 1.2));
  t.bounds = { x: t.x, y: t.y, w, h: lines.length * t.size * 1.2 };
}
function rasterizeLayer() { const L = AL(); if (L?.kind !== 'text') return; L.kind = 'raster'; delete L.text; pushHist('Rasterize type'); renderLayers(); }

// =====================================================================  free transform
function startTransform() {
  const L = AL(); if (!L || !D) return; if (L.locked) return toast('Layer is locked', 'err');
  if (L.kind === 'text') { rasterizeLayer(); }
  if (T) return;
  ensureCovers(L);
  let src, bx, by;
  if (D.sel) {
    const b = maskBounds(D.sel); if (!b) return;
    src = mk(b.w, b.h); const sc = src.getContext('2d'); sc.drawImage(L.canvas, L.x - b.x, L.y - b.y); sc.globalCompositeOperation = 'destination-in'; sc.drawImage(D.sel, -b.x, -b.y);
    const lc = L.canvas.getContext('2d'); lc.save(); lc.globalCompositeOperation = 'destination-out'; lc.drawImage(D.sel, -L.x, -L.y); lc.restore();
    bx = b.x; by = b.y; setSel(null);
  } else {
    const b = alphaBounds(L.canvas); if (!b) return toast('Layer is empty');
    src = mk(b.w, b.h); src.getContext('2d').drawImage(L.canvas, -b.x, -b.y); L.canvas.getContext('2d').clearRect(b.x, b.y, b.w, b.h);
    bx = b.x + L.x; by = b.y + L.y;
  }
  T = { layer: L, src, w: src.width, h: src.height, tx: bx + src.width / 2, ty: by + src.height / 2, sx: 1, sy: 1, rot: 0 };
  if (O.tool !== 'move') { O.tool = 'move'; tbEl.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === 'move')); }
  renderOptions(); requestRender(); drawOverlay();
}
UI.shortcut('ctrl+t', startTransform);
function drawTransformed(c, t) { c.save(); c.translate(t.tx, t.ty); c.rotate(t.rot); c.scale(t.sx, t.sy); c.drawImage(t.src, -t.w / 2, -t.h / 2); c.restore(); }
function tPoint(t, lx, ly) { const x = lx * t.sx, y = ly * t.sy, cs = Math.cos(t.rot), sn = Math.sin(t.rot); return [t.tx + x * cs - y * sn, t.ty + x * sn + y * cs]; }
function transformCorners(t) { const w = t.w / 2, hh = t.h / 2; return [[-w, -hh], [w, -hh], [w, hh], [-w, hh]].map(p => tPoint(t, ...p)); }
function transformHandles(t) { const w = t.w / 2, hh = t.h / 2; return [[-w, -hh], [0, -hh], [w, -hh], [w, 0], [w, hh], [0, hh], [-w, hh], [-w, 0]].map(p => tPoint(t, ...p)); }
function toLocal(t, x, y) { const dx = x - t.tx, dy = y - t.ty, cs = Math.cos(-t.rot), sn = Math.sin(-t.rot); return [(dx * cs - dy * sn) / t.sx, (dx * sn + dy * cs) / t.sy]; }
function transformHit(x, y) {
  const t = T; const hs = transformHandles(t); const tol = 8 / D.zoom;
  for (let i = 0; i < hs.length; i++) if (Math.hypot(hs[i][0] - x, hs[i][1] - y) < tol) return i;
  const [lx, ly] = toLocal(t, x, y); if (Math.abs(lx) <= t.w / 2 && Math.abs(ly) <= t.h / 2) return 'move'; return 'rotate';
}
function transformDragStart(x, y, e) { const hit = transformHit(x, y); return { kind: hit === 'move' ? 'move' : hit === 'rotate' ? 'rotate' : 'scale', handle: hit, sx: x, sy: y, t0: { ...T }, a0: Math.atan2(y - T.ty, x - T.tx) }; }
function transformDragMove(d, x, y, e) {
  const t = T, t0 = d.t0;
  if (d.kind === 'move') { t.tx = t0.tx + x - d.sx; t.ty = t0.ty + y - d.sy; }
  else if (d.kind === 'rotate') { let a = t0.rot + Math.atan2(y - t0.ty, x - t0.tx) - d.a0; if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * Math.PI / 12; t.rot = a; }
  else {
    const dirs = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]][d.handle];
    const tt = { ...t0 }; const [lx, ly] = toLocal(tt, x, y);
    let nsx = dirs[0] ? (lx * t0.sx * dirs[0] + t0.w / 2 * Math.abs(t0.sx)) / t0.w : t0.sx;
    let nsy = dirs[1] ? (ly * t0.sy * dirs[1] + t0.h / 2 * Math.abs(t0.sy)) / t0.h : t0.sy;
    if (dirs[0] && dirs[1] && (e.shiftKey === !O.freeRatio)) { const k = Math.max(nsx / t0.sx, nsy / t0.sy); nsx = t0.sx * k; nsy = t0.sy * k; }
    // keep opposite edge fixed
    const ow = t0.w * t0.sx, oh = t0.h * t0.sy, nw = t0.w * nsx, nh = t0.h * nsy;
    const dxl = dirs[0] * (nw - ow) / 2, dyl = dirs[1] * (nh - oh) / 2; const cs = Math.cos(t0.rot), sn = Math.sin(t0.rot);
    t.sx = nsx; t.sy = nsy; t.tx = t0.tx + dxl * cs - dyl * sn; t.ty = t0.ty + dxl * sn + dyl * cs;
  }
}
function commitTransform() { if (!T) return; const t = T; T = null; ensureCovers(t.layer); const c = t.layer.canvas.getContext('2d'); c.save(); c.translate(-t.layer.x, -t.layer.y); drawTransformed(c, t); c.restore(); renderOptions(); requestRender(); drawOverlay(); pushHist('Free transform'); }
function cancelTransform() { if (!T) return; T = null; restoreHist(D.hi); renderOptions(); }
function alphaBounds(c) { const d = ctxOf(c).getImageData(0, 0, c.width, c.height).data, w = c.width; let x0 = w, y0 = c.height, x1 = -1, y1 = -1; for (let y = 0; y < c.height; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }; }
const maskBounds = alphaBounds;
function cancelTransientTools() { T = null; cropState = null; marqRect = null; lassoPts = null; shapePreview = null; gradPreview = null; if (textEd) { textEd.el.remove(); textEd = null; } }

// =====================================================================  crop
function cropHandles() { const c = cropState; return [[c.x, c.y], [c.x + c.w / 2, c.y], [c.x + c.w, c.y], [c.x + c.w, c.y + c.h / 2], [c.x + c.w, c.y + c.h], [c.x + c.w / 2, c.y + c.h], [c.x, c.y + c.h], [c.x, c.y + c.h / 2]]; }
function cropDragStart(x, y) {
  const hs = cropHandles(), tol = 10 / D.zoom; for (let i = 0; i < 8; i++) if (Math.hypot(hs[i][0] - x, hs[i][1] - y) < tol) return { kind: 'h', i, c0: { ...cropState } };
  const c = cropState; if (x > c.x && x < c.x + c.w && y > c.y && y < c.y + c.h) return { kind: 'move', sx: x, sy: y, c0: { ...c } };
  return { kind: 'new', sx: x, sy: y };
}
function cropDragMove(d, x, y) {
  const ratio = O.cropRatio && O.cropRatio !== 'free' ? +O.cropRatio : 0;
  if (d.kind === 'move') { cropState.x = d.c0.x + x - d.sx; cropState.y = d.c0.y + y - d.sy; return; }
  if (d.kind === 'new') { let w = x - d.sx, hh = y - d.sy; if (ratio) hh = Math.sign(hh || 1) * Math.abs(w) / ratio; cropState = normRect({ x: d.sx, y: d.sy, w, h: hh }); return; }
  const c = { ...d.c0 }; const dir = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]][d.i];
  let x0 = c.x, y0 = c.y, x1 = c.x + c.w, y1 = c.y + c.h; if (dir[0] < 0) x0 = x; if (dir[0] > 0) x1 = x; if (dir[1] < 0) y0 = y; if (dir[1] > 0) y1 = y;
  let r = normRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }); if (ratio) { r.h = r.w / ratio; if (dir[1] < 0) r.y = y1 - r.h; } cropState = r;
}
function applyCrop() {
  if (!cropState || !D) return; const c = { x: Math.round(cropState.x), y: Math.round(cropState.y), w: Math.round(cropState.w), h: Math.round(cropState.h) };
  if (c.w < 1 || c.h < 1) return;
  D.layers.forEach(L => { L.x -= c.x; L.y -= c.y; if (L.kind === 'text') { L.text.x -= c.x; L.text.y -= c.y; } });
  D.w = c.w; D.h = c.h; setSel(null); cropState = { x: 0, y: 0, w: D.w, h: D.h }; D.layers.filter(l => l.kind === 'text').forEach(renderTextLayer); fitView(); requestRender(); pushHist('Crop');
}

// =====================================================================  edit operations
function selOrAll() { return D.sel || (() => { const m = mk(D.w, D.h), c = m.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, D.w, D.h); return m; })(); }
function extractSel(L, merged) {
  const m = selOrAll(), b = maskBounds(m); if (!b) return null;
  const c = mk(b.w, b.h), x = c.getContext('2d');
  if (merged) x.drawImage(flattenCanvas(), -b.x, -b.y); else x.drawImage(L.canvas, L.x - b.x, L.y - b.y);
  x.globalCompositeOperation = 'destination-in'; x.drawImage(m, -b.x, -b.y); return { canvas: c, x: b.x, y: b.y };
}
async function copy(merged = false) {
  if (!D) return; const L = AL(); const r = extractSel(L, merged); if (!r) return; clipboard = r;
  try { const blob = await new Promise(res => r.canvas.toBlob(res, 'image/png')); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); } catch {}
  toast('Copied');
}
async function cut() { if (!D) return; await copy(); clearSel(); }
function clearSel() { const L = AL(); if (!D || !L || L.locked) return; ensureCovers(L); const c = L.canvas.getContext('2d'); c.save(); c.globalCompositeOperation = 'destination-out'; c.drawImage(selOrAll(), -L.x, -L.y); c.restore(); requestRender(); pushHist('Clear'); }
async function paste() {
  let src = null;
  try { const items = await navigator.clipboard.read(); for (const it of items) { const type = it.types.find(t => t.startsWith('image/')); if (type) { const bmp = await createImageBitmap(await it.getType(type)); const c = mk(bmp.width, bmp.height); c.getContext('2d').drawImage(bmp, 0, 0); src = { canvas: c, x: null, y: null }; break; } } } catch {}
  if (clipboard && (!src || (src.canvas.width === clipboard.canvas.width && src.canvas.height === clipboard.canvas.height))) src = clipboard;
  if (!src) return toast('Clipboard has no image');
  if (!D) { addDoc(createDoc({ w: src.canvas.width, h: src.canvas.height, bg: null })); }
  const L = newLayer('Pasted layer', src.canvas.width, src.canvas.height); L.canvas.getContext('2d').drawImage(src.canvas, 0, 0);
  L.x = src.x ?? Math.round((D.w - L.canvas.width) / 2); L.y = src.y ?? Math.round((D.h - L.canvas.height) / 2);
  D.layers.splice(D.active + 1, 0, L); D.active++; setSel(null); requestRender(); pushHist('Paste');
}
UI.shortcut('ctrl+c', () => copy()); UI.shortcut('ctrl+shift+c', () => copy(true)); UI.shortcut('ctrl+x', cut); UI.shortcut('ctrl+v', paste);
UI.shortcut('delete', clearSel); UI.shortcut('backspace', clearSel);
UI.shortcut('alt+backspace', () => quickFill(O.fg)); UI.shortcut('ctrl+backspace', () => quickFill(O.bg));
UI.shortcut('ctrl+a', selectAll); UI.shortcut('ctrl+d', deselect); UI.shortcut('ctrl+shift+d', reselect); UI.shortcut('ctrl+shift+i', invertSel);
function quickFill(color, opacity = 1) { const L = AL(); if (!D || !L || L.locked) return; withSelection(L, (c, ox, oy) => { c.save(); c.globalAlpha = opacity; c.fillStyle = color; c.fillRect(0, 0, c.canvas.width, c.canvas.height); c.restore(); }); requestRender(); pushHist('Fill'); }
async function fillDialog() {
  if (!D) return; const v = await form({ title: 'Fill', fields: [{ key: 'what', label: 'Contents', type: 'select', value: 'fg', options: [{ value: 'fg', label: 'Foreground color' }, { value: 'bg', label: 'Background color' }, { value: 'color', label: 'Custom color' }, { value: 'gray', label: '50% gray' }, { value: 'white', label: 'White' }, { value: 'black', label: 'Black' }] }, { key: 'color', label: 'Custom color', type: 'color', value: '#ff0000' }, { key: 'op', label: 'Opacity %', type: 'range', min: 1, max: 100, value: 100 }] });
  if (!v) return; quickFill({ fg: O.fg, bg: O.bg, color: v.color, gray: '#808080', white: '#ffffff', black: '#000000' }[v.what], v.op / 100);
}
UI.shortcut('shift+f5', fillDialog);
async function strokeDialog() {
  if (!D?.sel) return toast('Make a selection first'); const v = await form({ title: 'Stroke selection', fields: [{ key: 'w', label: 'Width (px)', type: 'number', value: 4 }, { key: 'color', label: 'Color', type: 'color', value: O.fg }, { key: 'pos', label: 'Location', type: 'select', value: 'center', options: ['inside', 'center', 'outside'] }] }); if (!v) return;
  const L = AL(); ensureCovers(L); const w = Math.max(1, +v.w); const m = D.sel;
  const dil = r => { const o = mk(D.w, D.h), c = o.getContext('2d'); const n = Math.max(8, Math.ceil(r * 3)); for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; c.drawImage(m, Math.cos(a) * r, Math.sin(a) * r); } c.drawImage(m, 0, 0); return o; };
  const ero = r => { const inv = mk(D.w, D.h), ic = inv.getContext('2d'); ic.fillStyle = '#fff'; ic.fillRect(0, 0, D.w, D.h); ic.globalCompositeOperation = 'destination-out'; ic.drawImage(m, 0, 0); const d2 = mk(D.w, D.h), dc = d2.getContext('2d'); const n = Math.max(8, Math.ceil(r * 3)); for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; dc.drawImage(inv, Math.cos(a) * r, Math.sin(a) * r); } const out = cloneCanvas(m), oc = out.getContext('2d'); oc.globalCompositeOperation = 'destination-out'; oc.drawImage(d2, 0, 0); return out; };
  const outer = v.pos === 'inside' ? m : dil(v.pos === 'center' ? w / 2 : w), inner = v.pos === 'outside' ? m : ero(v.pos === 'center' ? w / 2 : w);
  const ring = cloneCanvas(outer), rc = ring.getContext('2d'); rc.globalCompositeOperation = 'destination-out'; rc.drawImage(inner, 0, 0); rc.globalCompositeOperation = 'source-in'; rc.fillStyle = v.color; rc.fillRect(0, 0, D.w, D.h);
  L.canvas.getContext('2d').drawImage(ring, -L.x, -L.y); requestRender(); pushHist('Stroke');
}
function flipLayer(horiz) { const L = AL(); if (!L) return; if (L.kind === 'text') rasterizeLayer(); ensureCovers(L); const c = cloneCanvas(L.canvas), x = L.canvas.getContext('2d'); x.clearRect(0, 0, c.width, c.height); x.save(); horiz ? (x.translate(c.width, 0), x.scale(-1, 1)) : (x.translate(0, c.height), x.scale(1, -1)); x.drawImage(c, 0, 0); x.restore(); requestRender(); pushHist(horiz ? 'Flip horizontal' : 'Flip vertical'); }
function rotateLayer(deg) { const L = AL(); if (!L) return; if (L.kind === 'text') rasterizeLayer(); const b = alphaBounds(L.canvas); if (!b) return; const src = mk(b.w, b.h); src.getContext('2d').drawImage(L.canvas, -b.x, -b.y); L.canvas.getContext('2d').clearRect(b.x, b.y, b.w, b.h); const t = { layer: L, src, w: b.w, h: b.h, tx: L.x + b.x + b.w / 2, ty: L.y + b.y + b.h / 2, sx: 1, sy: 1, rot: deg * Math.PI / 180 }; T = t; commitTransform(); }
function alignLayer(kind) { const L = AL(); if (!L) return; const b = alphaBounds(L.canvas); if (!b) return; const ax = L.x + b.x, ay = L.y + b.y; if (kind === 'alignL') L.x -= ax; if (kind === 'alignC') L.x += Math.round((D.w - b.w) / 2 - ax); if (kind === 'alignR') L.x += D.w - b.w - ax; if (kind === 'alignT') L.y -= ay; if (kind === 'alignM') L.y += Math.round((D.h - b.h) / 2 - ay); if (kind === 'alignB') L.y += D.h - b.h - ay; if (L.kind === 'text') { L.text.x += L.x; L.text.y += L.y; renderTextLayer(L); } requestRender(); pushHist('Align'); }

// =====================================================================  image operations
async function imageSizeDialog() {
  if (!D) return; let lock = true;
  const v = await form({ title: 'Image size', fields: [{ key: 'w', label: 'Width (px)', type: 'number', value: D.w }, { key: 'h', label: 'Height (px)', type: 'number', value: D.h }, { key: 'lock', label: 'Constrain proportions', type: 'checkbox', value: true }, { key: 'q', label: 'Resample', type: 'select', value: 'high', options: [{ value: 'high', label: 'Bicubic (smooth)' }, { value: 'low', label: 'Bilinear' }, { value: 'none', label: 'Nearest neighbor (hard edges)' }] }],
    onChange: vals => { const ins = document.querySelectorAll('.modal input[type=number]'); if (vals.lock) { if (document.activeElement === ins[0]) { ins[1].value = Math.round(vals.w * D.h / D.w); vals.h = +ins[1].value; } else if (document.activeElement === ins[1]) { ins[0].value = Math.round(vals.h * D.w / D.h); vals.w = +ins[0].value; } } } });
  if (!v) return; const nw = Math.max(1, Math.round(v.w)), nh = Math.max(1, Math.round(v.h)), kx = nw / D.w, ky = nh / D.h;
  D.layers.forEach(L => { const c = mk(L.canvas.width * kx, L.canvas.height * ky), x = c.getContext('2d'); x.imageSmoothingEnabled = v.q !== 'none'; x.imageSmoothingQuality = v.q === 'high' ? 'high' : 'low'; x.drawImage(L.canvas, 0, 0, c.width, c.height); L.canvas = c; L.x = Math.round(L.x * kx); L.y = Math.round(L.y * ky); if (L.mask) { const m = mk(c.width, c.height); m.getContext('2d').drawImage(L.mask, 0, 0, c.width, c.height); L.mask = m; L.maskVer = Math.random(); } if (L.kind === 'text') { L.text.x *= kx; L.text.y *= ky; L.text.size = Math.round(L.text.size * ky); } });
  D.w = nw; D.h = nh; setSel(null); D.layers.filter(l => l.kind === 'text').forEach(renderTextLayer); fitView(); requestRender(); pushHist('Image size');
}
async function canvasSizeDialog() {
  if (!D) return; const v = await form({ title: 'Canvas size', fields: [{ key: 'w', label: 'Width (px)', type: 'number', value: D.w }, { key: 'h', label: 'Height (px)', type: 'number', value: D.h }, { key: 'anchor', label: 'Anchor', type: 'select', value: 'c', options: [{ value: 'tl', label: 'Top left' }, { value: 't', label: 'Top' }, { value: 'tr', label: 'Top right' }, { value: 'l', label: 'Left' }, { value: 'c', label: 'Center' }, { value: 'r', label: 'Right' }, { value: 'bl', label: 'Bottom left' }, { value: 'b', label: 'Bottom' }, { value: 'br', label: 'Bottom right' }] }, { key: 'fill', label: 'Extension color (background layer)', type: 'color', value: O.bg }] });
  if (!v) return; const nw = Math.max(1, +v.w), nh = Math.max(1, +v.h), a = v.anchor;
  const dx = a.includes('l') ? 0 : a.includes('r') ? nw - D.w : Math.round((nw - D.w) / 2), dy = a.includes('t') ? 0 : a.includes('b') ? nh - D.h : Math.round((nh - D.h) / 2);
  D.layers.forEach((L, i) => { L.x += dx; L.y += dy; if (L.kind === 'text') { L.text.x += dx; L.text.y += dy; } });
  const bgL = D.layers[0]; if (bgL.name === 'Background') { const n = mk(nw, nh), c = n.getContext('2d'); c.fillStyle = v.fill; c.fillRect(0, 0, nw, nh); c.drawImage(bgL.canvas, bgL.x, bgL.y); bgL.canvas = n; bgL.x = 0; bgL.y = 0; }
  D.w = nw; D.h = nh; setSel(null); D.layers.filter(l => l.kind === 'text').forEach(renderTextLayer); fitView(); requestRender(); pushHist('Canvas size');
}
function rotateCanvas(deg) {
  if (!D) return; const W = D.w, H = D.h, swap = Math.abs(deg) === 90;
  D.layers.forEach(L => { if (L.kind === 'text') { L.kind = 'raster'; delete L.text; } ensureCovers(L); const full = mk(W, H); full.getContext('2d').drawImage(L.canvas, L.x, L.y); const n = mk(swap ? H : W, swap ? W : H), c = n.getContext('2d'); c.translate(n.width / 2, n.height / 2); c.rotate(deg * Math.PI / 180); c.drawImage(full, -W / 2, -H / 2); L.canvas = n; L.x = 0; L.y = 0; if (L.mask) { const m = mk(n.width, n.height), mc = m.getContext('2d'); mc.translate(n.width / 2, n.height / 2); mc.rotate(deg * Math.PI / 180); mc.drawImage(L.mask, -W / 2, -H / 2); L.mask = m; L.maskVer = Math.random(); } });
  if (swap) { D.w = H; D.h = W; } setSel(null); fitView(); requestRender(); pushHist('Rotate canvas');
}
function flipCanvas(horiz) { if (!D) return; D.layers.forEach(L => { if (L.kind === 'text') { L.kind = 'raster'; delete L.text; } ensureCovers(L); const c = cloneCanvas(L.canvas), x = L.canvas.getContext('2d'); x.clearRect(0, 0, c.width, c.height); x.save(); horiz ? (x.translate(c.width, 0), x.scale(-1, 1)) : (x.translate(0, c.height), x.scale(1, -1)); x.drawImage(c, 0, 0); x.restore(); if (horiz) L.x = D.w - L.x - c.width; else L.y = D.h - L.y - c.height; }); requestRender(); pushHist('Flip canvas'); }
function cropToSelection() { if (!D?.sel) return; const b = maskBounds(D.sel); if (!b) return; cropState = b; applyCrop(); cropState = null; drawOverlay(); }
function trimCanvas() { if (!D) return; const b = alphaBounds(flattenCanvas()); if (!b) return toast('Image is empty'); cropState = b; applyCrop(); cropState = null; drawOverlay(); }
function duplicateDoc() { if (!D) return; const d = createDoc({ w: D.w, h: D.h, name: D.name.replace(/(\.\w+)?$/, ' copy'), bg: null }); d.layers = D.layers.map(cloneLayer); addDoc(d); }

// =====================================================================  layers
function addLayer(name) { if (!D) return; const L = newLayer(name || `Layer ${D.layers.length}`, D.w, D.h); D.layers.splice(D.active + 1, 0, L); D.active++; renderLayers(); pushHist('New layer'); }
function duplicateLayer(silent) { const L = AL(); if (!L) return; const c = cloneLayer(L); c.id = uid(); c.name = L.name + ' copy'; D.layers.splice(D.active + 1, 0, c); D.active++; renderLayers(); if (!silent) { requestRender(); pushHist('Duplicate layer'); } }
function deleteLayer() { if (!D || D.layers.length <= 1) return toast('An image needs at least one layer'); D.layers.splice(D.active, 1); D.active = clamp(D.active - 1, 0, D.layers.length - 1); requestRender(); pushHist('Delete layer'); }
async function renameLayer() { const L = AL(); if (!L) return; const v = await prompt('Rename layer', 'Name', L.name); if (v) { L.name = v; pushHist('Rename layer'); } }
function layerVia(cutIt) { const L = AL(); if (!D || !L) return; const r = extractSel(L); if (!r) return; if (cutIt) { const c = L.canvas.getContext('2d'); c.save(); c.globalCompositeOperation = 'destination-out'; c.drawImage(selOrAll(), -L.x, -L.y); c.restore(); } const n = newLayer(cutIt ? 'Layer via cut' : 'Layer via copy', r.canvas.width, r.canvas.height); n.canvas = r.canvas; n.x = r.x; n.y = r.y; D.layers.splice(D.active + 1, 0, n); D.active++; setSel(null); requestRender(); pushHist(cutIt ? 'Layer via cut' : 'Layer via copy'); }
UI.shortcut('ctrl+j', () => layerVia(false)); UI.shortcut('ctrl+shift+j', () => layerVia(true)); UI.shortcut('ctrl+shift+n', () => addLayer());
function moveLayer(d) { if (!D) return; const i = D.active, j = clamp(i + d, 0, D.layers.length - 1); if (i === j) return; const [L] = D.layers.splice(i, 1); D.layers.splice(j, 0, L); D.active = j; requestRender(); pushHist('Arrange'); }
UI.shortcut('ctrl+]', () => moveLayer(1)); UI.shortcut('ctrl+[', () => moveLayer(-1)); UI.shortcut('ctrl+shift+]', () => moveLayer(99)); UI.shortcut('ctrl+shift+[', () => moveLayer(-99));
function bakeLayer(L) { const r = layerRender(L, false); const c = mk(D.w, D.h); c.getContext('2d').drawImage(r.canvas, r.x, r.y); return c; }
function mergeDown() { if (!D || D.active === 0) return; const top = D.layers[D.active], bot = D.layers[D.active - 1]; const base = bakeLayer(bot), bc = base.getContext('2d'); if (top.visible) { bc.save(); bc.globalAlpha = top.opacity; bc.globalCompositeOperation = top.blend; bc.drawImage(bakeLayer(top), 0, 0); bc.restore(); } Object.assign(bot, { canvas: base, x: 0, y: 0, mask: null, fx: {}, kind: 'raster', text: undefined }); D.layers.splice(D.active, 1); D.active--; requestRender(); pushHist('Merge down'); }
function mergeVisible() { if (!D) return; const c = flattenCanvas(); const vis = D.layers.filter(l => l.visible); if (vis.length < 2) return; const L = newLayer('Merged', D.w, D.h); L.canvas = c; const idx = D.layers.indexOf(vis[vis.length - 1]); D.layers = D.layers.filter(l => !l.visible || l === vis[vis.length - 1]); D.layers[D.layers.indexOf(vis[vis.length - 1])] = L; D.active = D.layers.indexOf(L); requestRender(); pushHist('Merge visible'); }
UI.shortcut('ctrl+e', mergeDown); UI.shortcut('ctrl+shift+e', mergeVisible);
function flatten() { if (!D) return; const c = mk(D.w, D.h), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, D.w, D.h); x.drawImage(flattenCanvas(), 0, 0); const L = newLayer('Background', D.w, D.h); L.canvas = c; D.layers = [L]; D.active = 0; requestRender(); pushHist('Flatten image'); }
function addMask(kind) { const L = AL(); if (!L) return; ensureCovers(L); const m = mk(L.canvas.width, L.canvas.height), c = m.getContext('2d'); c.fillStyle = kind === 'none' ? '#000' : '#fff'; c.fillRect(0, 0, m.width, m.height); if (kind === 'sel' && D.sel) { c.fillStyle = '#000'; c.fillRect(0, 0, m.width, m.height); const s = cloneCanvas(D.sel), sc = s.getContext('2d'); sc.globalCompositeOperation = 'source-in'; sc.fillStyle = '#fff'; sc.fillRect(0, 0, s.width, s.height); c.drawImage(s, -L.x, -L.y); setSel(null); } L.mask = m; L.maskVer = Math.random(); L.editMask = true; requestRender(); pushHist('Add layer mask'); toast('Mask added — paint black to hide, white to reveal'); }
function applyMask() { const L = AL(); if (!L?.mask) return; const c = L.canvas.getContext('2d'); c.globalCompositeOperation = 'destination-in'; c.drawImage(maskAlpha(L), 0, 0); c.globalCompositeOperation = 'source-over'; L.mask = null; L.editMask = false; requestRender(); pushHist('Apply mask'); }
function deleteMask() { const L = AL(); if (!L?.mask) return; L.mask = null; L.editMask = false; requestRender(); pushHist('Delete mask'); }
async function fxDialog(kind) {
  const L = AL(); if (!L) return; const cur = L.fx?.[kind];
  const fields = kind === 'shadow' ? [{ key: 'color', label: 'Color', type: 'color', value: cur?.color || '#000000' }, { key: 'opacity', label: 'Opacity %', type: 'range', min: 0, max: 100, value: (cur?.opacity ?? 0.6) * 100 }, { key: 'angle', label: 'Angle°', type: 'range', min: -180, max: 180, value: cur?.angle ?? 120 }, { key: 'distance', label: 'Distance', type: 'range', min: 0, max: 200, value: cur?.distance ?? 10 }, { key: 'size', label: 'Size (blur)', type: 'range', min: 0, max: 150, value: cur?.size ?? 14 }]
    : kind === 'stroke' ? [{ key: 'color', label: 'Color', type: 'color', value: cur?.color || '#000000' }, { key: 'size', label: 'Size', type: 'range', min: 1, max: 50, value: cur?.size ?? 3 }, { key: 'opacity', label: 'Opacity %', type: 'range', min: 0, max: 100, value: (cur?.opacity ?? 1) * 100 }]
    : [{ key: 'color', label: 'Color', type: 'color', value: cur?.color || '#ffee88' }, { key: 'size', label: 'Size', type: 'range', min: 1, max: 150, value: cur?.size ?? 20 }, { key: 'opacity', label: 'Opacity %', type: 'range', min: 0, max: 100, value: (cur?.opacity ?? 0.8) * 100 }];
  const prev = JSON.stringify(L.fx || {});
  const apply = v => { L.fx = L.fx || {}; L.fx[kind] = { ...v, opacity: v.opacity / 100 }; requestRender(); };
  const init = {}; fields.forEach(f => init[f.key] = f.value); apply(init);
  const v = await form({ title: { shadow: 'Drop shadow', stroke: 'Stroke', glow: 'Outer glow' }[kind], fields, onChange: apply });
  if (!v) { L.fx = JSON.parse(prev); requestRender(); return; } apply(v); pushHist('Layer style'); renderLayers();
}
function clearFx() { const L = AL(); if (!L) return; L.fx = {}; requestRender(); pushHist('Clear layer style'); renderLayers(); }

// layers panel
let rtab = 'layers', dragLayer = null;
$('#rtabs').addEventListener('click', e => { const t = e.target.closest('.tab'); if (!t) return; rtab = t.dataset.t; document.querySelectorAll('#rtabs .tab').forEach(x => x.classList.toggle('active', x === t)); renderRight(); });
function renderRight() { if (rtab === 'layers') renderLayers(); else if (rtab === 'history') renderHistory(); else renderAdjustPanel(); }
function renderLayers() {
  if (rtab !== 'layers') { renderLayerActions(); return; }
  const b = $('#rtBody'); b.innerHTML = ''; renderLayerActions(); if (!D) return;
  const L = AL();
  const blend = h('select', {}, ...BLENDS.map(([v, l]) => h('option', { value: v, selected: L?.blend === v }, l))); blend.onchange = () => { L.blend = blend.value; requestRender(); pushHist('Blend mode'); };
  const op = h('input', { type: 'number', min: 0, max: 100, value: Math.round((L?.opacity ?? 1) * 100) }); op.onchange = () => { L.opacity = clamp(+op.value, 0, 100) / 100; requestRender(); pushHist('Opacity'); };
  const lock = h('button', { class: 'icon-btn', 'data-tip': 'Lock layer', html: icon(L?.locked ? 'lock' : 'unlock'), onclick: () => { L.locked = !L.locked; renderLayers(); } });
  b.append(h('div', { class: 'layer-top' }, blend, h('span', { class: 'muted' }, 'Opacity'), op, lock));
  [...D.layers].reverse().forEach(l => {
    const i = D.layers.indexOf(l);
    const th = h('canvas'); const tw = 44, thh = 34; th.width = tw * 2; th.height = thh * 2; const tc = th.getContext('2d'); const k = Math.min(th.width / D.w, th.height / D.h); const ox = (th.width - D.w * k) / 2, oy = (th.height - D.h * k) / 2;
    tc.fillStyle = '#fff'; tc.fillRect(ox, oy, D.w * k, D.h * k); tc.fillStyle = '#ddd'; for (let y = 0; y < D.h * k; y += 8) for (let x = (y / 8) % 2 * 8; x < D.w * k; x += 16) tc.fillRect(ox + x, oy + y, 8, 8);
    tc.drawImage(l.canvas, ox + l.x * k, oy + l.y * k, l.canvas.width * k, l.canvas.height * k);
    const thumbs = [h('div', { class: 'lt' + (!l.editMask || !l.mask ? ' sel' : ''), onclick: e => { e.stopPropagation(); D.active = i; l.editMask = false; renderLayers(); } }, th)];
    if (l.mask) { const mc = h('canvas', { width: 88, height: 68 }); const mx = mc.getContext('2d'); mx.drawImage(l.mask, 0, 0, 88, 68); thumbs.push(h('div', { class: 'lt' + (l.editMask ? ' sel' : ''), 'data-tip': 'Layer mask', onclick: e => { e.stopPropagation(); D.active = i; l.editMask = true; renderLayers(); } }, mc)); }
    const nm = h('div', { class: 'nm' }, l.name, l.kind === 'text' ? h('span', { class: 'badge' }, '  T') : '', Object.keys(l.fx || {}).some(k => l.fx[k]) ? h('span', { class: 'badge' }, '  fx') : '', l.locked ? h('span', { class: 'badge' }, '  🔒') : '');
    const row = h('div', { class: 'layer' + (i === D.active ? ' active' : ''), draggable: 'true' },
      h('div', { class: 'vis', html: icon(l.visible ? 'eye' : 'eyeOff'), onclick: e => { e.stopPropagation(); l.visible = !l.visible; requestRender(); renderLayers(); } }), ...thumbs, nm);
    row.onclick = () => { D.active = i; if (l.kind === 'text' && O.tool === 'text') {} renderLayers(); };
    row.ondblclick = e => { if (e.target.closest('.vis,.lt')) return; const inp = h('input', { type: 'text', value: l.name }); nm.innerHTML = ''; nm.append(inp); inp.focus(); inp.select(); const done = () => { l.name = inp.value || l.name; renderLayers(); }; inp.onblur = done; inp.onkeydown = ev => { ev.stopPropagation(); if (ev.key === 'Enter') inp.blur(); }; };
    row.oncontextmenu = e => { D.active = i; renderLayers(); contextMenu(e, [{ label: 'Duplicate layer', action: duplicateLayer }, { label: 'Delete layer', action: deleteLayer }, { label: 'Rename…', action: renameLayer }, '-', { label: 'Add mask', action: () => addMask('all') }, { label: 'Drop shadow…', action: () => fxDialog('shadow') }, { label: 'Stroke…', action: () => fxDialog('stroke') }, { label: 'Rasterize', action: rasterizeLayer, disabled: l.kind !== 'text' }, '-', { label: 'Merge down', action: mergeDown }, { label: 'Flatten image', action: flatten }]); };
    row.ondragstart = () => dragLayer = i; row.ondragover = e => { e.preventDefault(); row.classList.add('drag-over'); }; row.ondragleave = () => row.classList.remove('drag-over');
    row.ondrop = e => { e.preventDefault(); if (dragLayer == null || dragLayer === i) return; const [m] = D.layers.splice(dragLayer, 1); D.layers.splice(i, 0, m); D.active = i; dragLayer = null; requestRender(); pushHist('Reorder layers'); };
    b.append(row);
  });
}
function renderLayerActions() {
  const a = $('#layerActions'); a.innerHTML = '';
  const btn = (ic, tip, fn) => h('button', { class: 'icon-btn', 'data-tip': tip, html: icon(ic), onclick: fn });
  a.append(btn('fx', 'Layer style', e => contextMenu(e, [{ label: 'Drop shadow…', action: () => fxDialog('shadow') }, { label: 'Stroke…', action: () => fxDialog('stroke') }, { label: 'Outer glow…', action: () => fxDialog('glow') }, '-', { label: 'Clear', action: clearFx }])),
    btn('mask', 'Add layer mask', () => addMask(D?.sel ? 'sel' : 'all')), btn('adjust', 'Adjustments', e => contextMenu(e, ADJ.map(x => ({ label: x.name, action: () => runAdjust(x) })))),
    btn('folder', 'Place image', placeImage), btn('plus', 'New layer', () => addLayer()), btn('copy', 'Duplicate layer', duplicateLayer), btn('trash', 'Delete layer', deleteLayer));
}
function renderHistory() {
  if (rtab !== 'history') return; const b = $('#rtBody'); b.innerHTML = ''; if (!D) return;
  D.hist.forEach((s, i) => b.append(h('div', { class: 'hist' + (i === D.hi ? ' cur' : i > D.hi ? ' future' : ''), onclick: () => restoreHist(i) }, s.label)));
  b.scrollTop = b.scrollHeight;
}
function renderAdjustPanel() {
  const b = $('#rtBody'); b.innerHTML = '';
  b.append(h('div', { class: 'panel-h' }, 'Adjustments'));
  ADJ.forEach(a => b.append(h('div', { class: 'adj-btn', onclick: () => runAdjust(a), html: icon(a.icon || 'sliders') + a.name })));
  b.append(h('div', { class: 'panel-h' }, 'Filters'));
  FILTERS.filter(f => f !== '-').forEach(a => b.append(h('div', { class: 'adj-btn', onclick: () => runAdjust(a), html: icon(a.icon || 'fx') + a.name })));
}
function renderTabs() {
  const t = $('#docTabs'); t.innerHTML = '';
  docs.forEach(d => t.append(h('div', { class: 'dt' + (d === D ? ' active' : ''), onclick: () => switchDoc(d) }, `${d.name}${d.dirty ? ' •' : ''} @ ${Math.round(d.zoom * 100)}%`, h('span', { style: { cursor: 'pointer', color: 'var(--tx-3)' }, onclick: e => { e.stopPropagation(); switchDoc(d); closeDoc(); } }, '×'))));
}
function renderAll() { renderLayers(); renderHistory(); renderOptions(); applyView(); requestRender(); $('.welcome')?.classList.toggle('hidden', !!D); }

// =====================================================================  adjustments & filters
const lut = f => { const t = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) t[i] = f(i); return t; };
const applyLut = (d, r, g, b) => { for (let i = 0; i < d.length; i += 4) { d[i] = r[d[i]]; d[i + 1] = (g || r)[d[i + 1]]; d[i + 2] = (b || r)[d[i + 2]]; } };
function rgb2hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let hh = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh /= 6; } return [hh, s, l]; }
function hsl2rgb(hh, s, l) { if (!s) return [l * 255, l * 255, l * 255]; const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = t => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(hh + 1 / 3) * 255, f(hh) * 255, f(hh - 1 / 3) * 255]; }
function convolve(img, k, div = 1, bias = 0, keepAlpha = true) {
  const w = img.width, hh = img.height, s = new Uint8ClampedArray(img.data), d = img.data, n = Math.sqrt(k.length) | 0, hn = n >> 1;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { let r = 0, g = 0, b = 0; for (let ky = 0; ky < n; ky++) for (let kx = 0; kx < n; kx++) { const sx = clamp(x + kx - hn, 0, w - 1), sy = clamp(y + ky - hn, 0, hh - 1), j = (sy * w + sx) * 4, kk = k[ky * n + kx]; r += s[j] * kk; g += s[j + 1] * kk; b += s[j + 2] * kk; } const i = (y * w + x) * 4; d[i] = r / div + bias; d[i + 1] = g / div + bias; d[i + 2] = b / div + bias; }
}
function blurImageData(img, r) { const c = mk(img.width, img.height); c.getContext('2d').putImageData(img, 0, 0); const o = mk(img.width, img.height), oc = ctxOf(o); oc.filter = `blur(${r}px)`; oc.drawImage(c, 0, 0); return oc.getImageData(0, 0, img.width, img.height); }
function histogram(d) { const hr = new Array(256).fill(0), hg = new Array(256).fill(0), hb = new Array(256).fill(0); for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; hr[d[i]]++; hg[d[i + 1]]++; hb[d[i + 2]]++; } return [hr, hg, hb]; }
function percentile(hh, p) { const tot = hh.reduce((a, b) => a + b, 0); let acc = 0; for (let i = 0; i < 256; i++) { acc += hh[i]; if (acc >= tot * p) return i; } return 255; }
function stretch(lo, hi) { return lut(i => (i - lo) * 255 / Math.max(1, hi - lo)); }
function autoTone(img) { const [hr, hg, hb] = histogram(img.data); applyLut(img.data, stretch(percentile(hr, .005), percentile(hr, .995)), stretch(percentile(hg, .005), percentile(hg, .995)), stretch(percentile(hb, .005), percentile(hb, .995))); }
function autoContrast(img) { const d = img.data, hl = new Array(256).fill(0); for (let i = 0; i < d.length; i += 4) hl[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++; applyLut(d, stretch(percentile(hl, .005), percentile(hl, .995))); }
function autoColor(img) { autoTone(img); const d = img.data; let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 16) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } const avg = (r + g + b) / 3 / n; const kr = avg / (r / n || 1), kg = avg / (g / n || 1), kb = avg / (b / n || 1); applyLut(d, lut(i => i * kr), lut(i => i * kg), lut(i => i * kb)); }
const ADJ = [
  { name: 'Brightness/Contrast', icon: 'adjust', params: [{ key: 'b', label: 'Brightness', type: 'range', min: -150, max: 150, value: 0 }, { key: 'c', label: 'Contrast', type: 'range', min: -100, max: 100, value: 0 }], fn: (img, p) => { const k = (259 * (p.c + 255)) / (255 * (259 - p.c)); applyLut(img.data, lut(i => k * (i + p.b - 128) + 128)); } },
  { name: 'Levels', icon: 'sliders', kbd: 'Ctrl+L', params: [{ key: 'ib', label: 'Input black', type: 'range', min: 0, max: 253, value: 0 }, { key: 'g', label: 'Gamma (midtones)', type: 'range', min: 0.1, max: 3, step: 0.01, value: 1 }, { key: 'iw', label: 'Input white', type: 'range', min: 2, max: 255, value: 255 }, { key: 'ob', label: 'Output black', type: 'range', min: 0, max: 255, value: 0 }, { key: 'ow', label: 'Output white', type: 'range', min: 0, max: 255, value: 255 }], fn: (img, p) => applyLut(img.data, lut(i => { let v = clamp((i - p.ib) / Math.max(1, p.iw - p.ib), 0, 1); v = Math.pow(v, 1 / p.g); return p.ob + v * (p.ow - p.ob); })) },
  { name: 'Curves', icon: 'sliders', kbd: 'Ctrl+M', curves: true },
  { name: 'Exposure', icon: 'adjust', params: [{ key: 'e', label: 'Exposure (stops)', type: 'range', min: -5, max: 5, step: 0.05, value: 0 }, { key: 'o', label: 'Offset', type: 'range', min: -0.5, max: 0.5, step: 0.01, value: 0 }, { key: 'g', label: 'Gamma', type: 'range', min: 0.1, max: 3, step: 0.01, value: 1 }], fn: (img, p) => applyLut(img.data, lut(i => Math.pow(clamp((i / 255) * Math.pow(2, p.e) + p.o, 0, 1), 1 / p.g) * 255)) },
  { name: 'Vibrance', icon: 'adjust', params: [{ key: 'v', label: 'Vibrance', type: 'range', min: -100, max: 100, value: 0 }, { key: 's', label: 'Saturation', type: 'range', min: -100, max: 100, value: 0 }], fn: (img, p) => { const d = img.data; for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), avg = (r + g + b) / 3; const amt = (p.s / 100) + (p.v / 100) * (1 - (mx - Math.min(r, g, b)) / 255) * 1.5; d[i] = r + (r - avg) * amt; d[i + 1] = g + (g - avg) * amt; d[i + 2] = b + (b - avg) * amt; } } },
  { name: 'Hue/Saturation', icon: 'adjust', kbd: 'Ctrl+U', params: [{ key: 'h', label: 'Hue', type: 'range', min: -180, max: 180, value: 0 }, { key: 's', label: 'Saturation', type: 'range', min: -100, max: 100, value: 0 }, { key: 'l', label: 'Lightness', type: 'range', min: -100, max: 100, value: 0 }, { key: 'col', label: 'Colorize', type: 'checkbox', value: false }], fn: (img, p) => { const d = img.data; for (let i = 0; i < d.length; i += 4) { let [hh, s, l] = rgb2hsl(d[i], d[i + 1], d[i + 2]); if (p.col) { hh = ((p.h + 180) / 360); s = clamp(0.25 + p.s / 100, 0, 1); } else { hh = (hh + p.h / 360 + 1) % 1; s = clamp(s * (1 + p.s / 100), 0, 1); } l = p.l > 0 ? l + (1 - l) * p.l / 100 : l * (1 + p.l / 100); const [r, g, b] = hsl2rgb(hh, s, l); d[i] = r; d[i + 1] = g; d[i + 2] = b; } } },
  { name: 'Color Balance', icon: 'adjust', kbd: 'Ctrl+B', params: [{ key: 'cr', label: 'Cyan ↔ Red', type: 'range', min: -100, max: 100, value: 0 }, { key: 'mg', label: 'Magenta ↔ Green', type: 'range', min: -100, max: 100, value: 0 }, { key: 'yb', label: 'Yellow ↔ Blue', type: 'range', min: -100, max: 100, value: 0 }], fn: (img, p) => { const d = img.data; for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 765, w = 1 - Math.abs(l - 0.5) * 2; d[i] += p.cr * 0.6 * w; d[i + 1] += p.mg * 0.6 * w; d[i + 2] += p.yb * 0.6 * w; } } },
  { name: 'Black & White', icon: 'adjust', kbd: 'Ctrl+Alt+Shift+B', params: [{ key: 'r', label: 'Reds %', type: 'range', min: -50, max: 150, value: 40 }, { key: 'g', label: 'Greens %', type: 'range', min: -50, max: 150, value: 40 }, { key: 'b', label: 'Blues %', type: 'range', min: -50, max: 150, value: 20 }, { key: 'tint', label: 'Tint', type: 'checkbox', value: false }, { key: 'tc', label: 'Tint color', type: 'color', value: '#c8a26b' }], fn: (img, p) => { const d = img.data, [tr, tg, tb] = hexToRgb(p.tc); const s = (p.r + p.g + p.b) / 100 || 1; for (let i = 0; i < d.length; i += 4) { const v = (d[i] * p.r + d[i + 1] * p.g + d[i + 2] * p.b) / 100 / s; if (p.tint) { d[i] = v * tr / 255 * 1.2; d[i + 1] = v * tg / 255 * 1.2; d[i + 2] = v * tb / 255 * 1.2; } else d[i] = d[i + 1] = d[i + 2] = v; } } },
  { name: 'Photo Filter', icon: 'adjust', params: [{ key: 'c', label: 'Filter color', type: 'color', value: '#ec8a00' }, { key: 'd', label: 'Density %', type: 'range', min: 0, max: 100, value: 25 }], fn: (img, p) => { const [r, g, b] = hexToRgb(p.c), k = p.d / 100, d = img.data; for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; d[i] = d[i] * (1 - k) + (d[i] * r / 255) * k + l * 0.0; d[i + 1] = d[i + 1] * (1 - k) + (d[i + 1] * g / 255) * k; d[i + 2] = d[i + 2] * (1 - k) + (d[i + 2] * b / 255) * k; } } },
  { name: 'Invert', icon: 'swap', kbd: 'Ctrl+I', fn: img => applyLut(img.data, lut(i => 255 - i)) },
  { name: 'Desaturate', icon: 'adjust', kbd: 'Ctrl+Shift+U', fn: img => { const d = img.data; for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; } },
  { name: 'Posterize', icon: 'grid', params: [{ key: 'n', label: 'Levels', type: 'range', min: 2, max: 32, value: 4 }], fn: (img, p) => applyLut(img.data, lut(i => Math.round(i / 255 * (p.n - 1)) * 255 / (p.n - 1))) },
  { name: 'Threshold', icon: 'adjust', params: [{ key: 't', label: 'Threshold level', type: 'range', min: 1, max: 255, value: 128 }], fn: (img, p) => { const d = img.data; for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) >= p.t ? 255 : 0; } },
  { name: 'Gradient Map', icon: 'gradient', params: [{ key: 'a', label: 'Shadows color', type: 'color', value: '#1b1035' }, { key: 'b', label: 'Highlights color', type: 'color', value: '#ffd27a' }], fn: (img, p) => { const A = hexToRgb(p.a), B = hexToRgb(p.b), d = img.data; for (let i = 0; i < d.length; i += 4) { const t = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255; d[i] = A[0] + (B[0] - A[0]) * t; d[i + 1] = A[1] + (B[1] - A[1]) * t; d[i + 2] = A[2] + (B[2] - A[2]) * t; } } },
];
const FILTERS = [
  { name: 'Gaussian Blur', icon: 'blur', params: [{ key: 'r', label: 'Radius (px)', type: 'range', min: 0.1, max: 100, step: 0.1, value: 4 }], fn: (img, p) => { const o = blurImageData(img, p.r); img.data.set(o.data); } },
  { name: 'Motion Blur', icon: 'blur', params: [{ key: 'a', label: 'Angle°', type: 'range', min: -180, max: 180, value: 0 }, { key: 'd', label: 'Distance (px)', type: 'range', min: 1, max: 200, value: 20 }], fn: (img, p) => { const c = mk(img.width, img.height); c.getContext('2d').putImageData(img, 0, 0); const o = mk(img.width, img.height), oc = ctxOf(o); const n = Math.min(60, Math.ceil(p.d)), a = p.a * Math.PI / 180; oc.globalAlpha = 1 / n * 1.0; for (let i = 0; i < n; i++) { const t = (i / (n - 1 || 1) - 0.5) * p.d; oc.globalAlpha = 1 / (i + 1); oc.drawImage(c, Math.cos(a) * t, Math.sin(a) * t); } img.data.set(oc.getImageData(0, 0, img.width, img.height).data); } },
  { name: 'Unsharp Mask', icon: 'fx', params: [{ key: 'amt', label: 'Amount %', type: 'range', min: 1, max: 500, value: 120 }, { key: 'r', label: 'Radius (px)', type: 'range', min: 0.1, max: 30, step: 0.1, value: 1.5 }, { key: 't', label: 'Threshold', type: 'range', min: 0, max: 100, value: 2 }], fn: (img, p) => { const b = blurImageData(img, p.r).data, d = img.data, k = p.amt / 100; for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) { const diff = d[i + c] - b[i + c]; if (Math.abs(diff) >= p.t) d[i + c] = d[i + c] + diff * k; } } },
  { name: 'Sharpen', icon: 'fx', fn: img => convolve(img, [0, -1, 0, -1, 5, -1, 0, -1, 0]) },
  '-',
  { name: 'Add Noise', icon: 'grid', params: [{ key: 'a', label: 'Amount', type: 'range', min: 1, max: 150, value: 20 }, { key: 'mono', label: 'Monochromatic', type: 'checkbox', value: true }], fn: (img, p) => { const d = img.data; for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * p.a * 2; if (p.mono) { d[i] += n; d[i + 1] += n; d[i + 2] += n; } else { d[i] += (Math.random() - 0.5) * p.a * 2; d[i + 1] += (Math.random() - 0.5) * p.a * 2; d[i + 2] += (Math.random() - 0.5) * p.a * 2; } } } },
  { name: 'Reduce Noise (Median)', icon: 'blur', params: [{ key: 'r', label: 'Radius', type: 'range', min: 1, max: 4, value: 1 }], fn: (img, p) => { const w = img.width, hh = img.height, s = new Uint8ClampedArray(img.data), d = img.data, r = p.r; const arr = []; for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; for (let c = 0; c < 3; c++) { arr.length = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const sx = clamp(x + dx, 0, w - 1), sy = clamp(y + dy, 0, hh - 1); arr.push(s[(sy * w + sx) * 4 + c]); } arr.sort((a, b) => a - b); d[i + c] = arr[arr.length >> 1]; } } } },
  '-',
  { name: 'Pixelate (Mosaic)', icon: 'grid', params: [{ key: 's', label: 'Cell size', type: 'range', min: 2, max: 200, value: 12 }], fn: (img, p) => { const w = img.width, hh = img.height, d = img.data, s = p.s; for (let y = 0; y < hh; y += s) for (let x = 0; x < w; x += s) { let r = 0, g = 0, b = 0, a = 0, n = 0; for (let yy = y; yy < Math.min(y + s, hh); yy++) for (let xx = x; xx < Math.min(x + s, w); xx++) { const i = (yy * w + xx) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; a += d[i + 3]; n++; } for (let yy = y; yy < Math.min(y + s, hh); yy++) for (let xx = x; xx < Math.min(x + s, w); xx++) { const i = (yy * w + xx) * 4; d[i] = r / n; d[i + 1] = g / n; d[i + 2] = b / n; d[i + 3] = a / n; } } } },
  { name: 'Emboss', icon: 'fx', fn: img => convolve(img, [-2, -1, 0, -1, 1, 1, 0, 1, 2]) },
  { name: 'Find Edges', icon: 'fx', fn: img => { convolve(img, [-1, -1, -1, -1, 8, -1, -1, -1, -1]); applyLut(img.data, lut(i => 255 - i)); } },
  { name: 'Oil Paint', icon: 'brush', params: [{ key: 'r', label: 'Radius', type: 'range', min: 1, max: 6, value: 3 }, { key: 'lv', label: 'Intensity levels', type: 'range', min: 4, max: 40, value: 20 }], fn: (img, p) => { const w = img.width, hh = img.height, s = new Uint8ClampedArray(img.data), d = img.data, r = p.r, L = p.lv; const cnt = new Int32Array(L), sr = new Int32Array(L), sg = new Int32Array(L), sb = new Int32Array(L); for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { cnt.fill(0); sr.fill(0); sg.fill(0); sb.fill(0); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const sx = clamp(x + dx, 0, w - 1), sy = clamp(y + dy, 0, hh - 1), j = (sy * w + sx) * 4; const li = Math.min(L - 1, ((s[j] + s[j + 1] + s[j + 2]) / 3 * L / 256) | 0); cnt[li]++; sr[li] += s[j]; sg[li] += s[j + 1]; sb[li] += s[j + 2]; } let m = 0; for (let k = 1; k < L; k++) if (cnt[k] > cnt[m]) m = k; const i = (y * w + x) * 4; d[i] = sr[m] / cnt[m]; d[i + 1] = sg[m] / cnt[m]; d[i + 2] = sb[m] / cnt[m]; } } },
  '-',
  { name: 'Vignette', icon: 'ellipse', params: [{ key: 'a', label: 'Amount %', type: 'range', min: 0, max: 100, value: 50 }, { key: 's', label: 'Size %', type: 'range', min: 10, max: 100, value: 60 }], fn: (img, p, off) => { const w = img.width, hh = img.height, d = img.data, cx = D.w / 2 - (off?.x || 0), cy = D.h / 2 - (off?.y || 0), R = Math.hypot(D.w, D.h) / 2; for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const t = clamp((Math.hypot(x - cx, y - cy) / R - p.s / 100 * 0.6) / (1 - p.s / 100 * 0.6), 0, 1), k = 1 - t * t * p.a / 100, i = (y * w + x) * 4; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; } } },
  { name: 'Sepia', icon: 'adjust', fn: img => { const d = img.data; for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2]; d[i] = r * .393 + g * .769 + b * .189; d[i + 1] = r * .349 + g * .686 + b * .168; d[i + 2] = r * .272 + g * .534 + b * .131; } } },
  { name: 'Glow (Diffuse)', icon: 'blur', params: [{ key: 'r', label: 'Radius', type: 'range', min: 1, max: 60, value: 12 }, { key: 'a', label: 'Amount %', type: 'range', min: 0, max: 100, value: 40 }], fn: (img, p) => { const b = blurImageData(img, p.r).data, d = img.data, k = p.a / 100; for (let i = 0; i < d.length; i += 4) for (let c = 0; c < 3; c++) d[i + c] = 255 - (255 - d[i + c]) * (255 - b[i + c] * k) / 255; } },
];
function layerImageOp(L, fn, params) {
  // apply fn(ImageData, params) to layer pixels, honoring selection; returns nothing (mutates layer)
  ensureCovers(L);
  const c = ctxOf(L.canvas); const img = c.getImageData(0, 0, L.canvas.width, L.canvas.height);
  fn(img, params, { x: L.x, y: L.y });
  if (!D.sel) { c.putImageData(img, 0, 0); return; }
  const n = mk(L.canvas.width, L.canvas.height); ctxOf(n).putImageData(img, 0, 0); const nc = n.getContext('2d'); nc.globalCompositeOperation = 'destination-in'; nc.drawImage(D.sel, -L.x, -L.y);
  c.save(); c.globalCompositeOperation = 'destination-out'; c.drawImage(D.sel, -L.x, -L.y); c.restore(); c.drawImage(n, 0, 0);
}
async function runAdjust(a) {
  const L = AL(); if (!D || !L) return toast('Open an image first'); if (L.kind === 'text') return toast('Rasterize the text layer first', 'err'); if (L.locked) return toast('Layer is locked', 'err');
  if (a.curves) return curvesDialog();
  if (!a.params) { layerImageOp(L, a.fn, {}); requestRender(); pushHist(a.name); return; }
  ensureCovers(L); const orig = cloneCanvas(L.canvas);
  // preview on a downscaled region for speed when huge
  let timer = null;
  const preview = vals => { clearTimeout(timer); timer = setTimeout(() => { const c = L.canvas.getContext('2d'); c.clearRect(0, 0, orig.width, orig.height); c.drawImage(orig, 0, 0); layerImageOp(L, a.fn, vals); requestRender(); }, orig.width * orig.height > 4e6 ? 120 : 16); };
  const init = {}; a.params.forEach(p => init[p.key] = p.value); preview(init);
  const v = await form({ title: a.name, fields: a.params.map(p => ({ ...p })), onChange: preview, ok: 'Apply' });
  clearTimeout(timer); const c = L.canvas.getContext('2d'); c.clearRect(0, 0, orig.width, orig.height); c.drawImage(orig, 0, 0);
  if (v) { layerImageOp(L, a.fn, v); pushHist(a.name); } requestRender();
}
function quickAdj(fn, name) { const L = AL(); if (!D || !L || L.kind === 'text') return; layerImageOp(L, fn, {}); requestRender(); pushHist(name); }
ADJ.forEach(a => { if (a.kbd) UI.shortcut(a.kbd.toLowerCase(), () => runAdjust(a)); });
UI.shortcut('ctrl+shift+l', () => quickAdj(autoTone, 'Auto tone')); UI.shortcut('ctrl+shift+b', () => quickAdj(autoColor, 'Auto color'));
async function curvesDialog() {
  const L = AL(); ensureCovers(L); const orig = cloneCanvas(L.canvas);
  let ch = 'rgb'; const pts = { rgb: [[0, 0], [255, 255]], r: [[0, 0], [255, 255]], g: [[0, 0], [255, 255]], b: [[0, 0], [255, 255]] };
  const S = 256; const cv = h('canvas', { class: 'curve-box', width: S * 2, height: S * 2, style: { width: S + 'px', height: S + 'px' } });
  const sel = h('select', {}, ...[['rgb', 'RGB'], ['r', 'Red'], ['g', 'Green'], ['b', 'Blue']].map(([v, l]) => h('option', { value: v }, l))); sel.onchange = () => { ch = sel.value; draw(); };
  const hist = histogram(ctxOf(orig).getImageData(0, 0, orig.width, orig.height).data);
  const curveLut = arr => { const p = [...arr].sort((a, b) => a[0] - b[0]); return lut(x => { if (x <= p[0][0]) return p[0][1]; if (x >= p[p.length - 1][0]) return p[p.length - 1][1]; let i = 0; while (p[i + 1][0] < x) i++; const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)]; const t = (x - p1[0]) / (p2[0] - p1[0] || 1); const t2 = t * t, t3 = t2 * t; return 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3); }); };
  const draw = () => {
    const c = cv.getContext('2d'); c.setTransform(2, 0, 0, 2, 0, 0); c.clearRect(0, 0, S, S); c.fillStyle = '#0b0c0f'; c.fillRect(0, 0, S, S);
    const hh = ch === 'rgb' ? hist[0].map((v, i) => v + hist[1][i] + hist[2][i]) : hist['rgb'.indexOf(ch)]; const mx = Math.max(...hh.slice(1, 255)) || 1;
    c.fillStyle = 'rgba(255,255,255,.12)'; hh.forEach((v, i) => c.fillRect(i, S - Math.min(S, v / mx * S), 1, S));
    c.strokeStyle = 'rgba(255,255,255,.1)'; c.beginPath(); for (let i = 1; i < 4; i++) { c.moveTo(i * S / 4, 0); c.lineTo(i * S / 4, S); c.moveTo(0, i * S / 4); c.lineTo(S, i * S / 4); } c.stroke();
    const l = curveLut(pts[ch]); c.strokeStyle = { rgb: '#fff', r: '#ff5a5f', g: '#3ccf8e', b: '#31a8ff' }[ch]; c.lineWidth = 1.5; c.beginPath(); for (let i = 0; i < 256; i++) i ? c.lineTo(i, S - l[i]) : c.moveTo(i, S - l[i]); c.stroke();
    pts[ch].forEach(([x, y]) => { c.fillStyle = '#fff'; c.fillRect(x - 3, S - y - 3, 6, 6); });
  };
  const apply = () => { const lr = curveLut(pts.rgb), r = curveLut(pts.r), g = curveLut(pts.g), b = curveLut(pts.b); const fr = lut(i => r[lr[i]]), fg = lut(i => g[lr[i]]), fb = lut(i => b[lr[i]]); const c = L.canvas.getContext('2d'); c.clearRect(0, 0, orig.width, orig.height); c.drawImage(orig, 0, 0); layerImageOp(L, img => applyLut(img.data, fr, fg, fb), {}); requestRender(); };
  let dragI = -1;
  cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); const x = e.offsetX, y = S - e.offsetY; const p = pts[ch]; dragI = p.findIndex(q => Math.hypot(q[0] - x, q[1] - y) < 8); if (dragI < 0) { p.push([x, y]); dragI = p.length - 1; } draw(); apply(); };
  cv.onpointermove = e => { if (dragI < 0) return; const p = pts[ch]; const x = clamp(e.offsetX, 0, 255), y = clamp(S - e.offsetY, 0, 255); if ((e.offsetX < -20 || e.offsetX > S + 20) && p.length > 2) { p.splice(dragI, 1); dragI = -1; } else p[dragI] = [dragI === 0 ? Math.min(x, 254) : x, y]; draw(); apply(); };
  cv.onpointerup = () => dragI = -1;
  draw();
  const r = await modal({ title: 'Curves', body: h('div', {}, h('div', { class: 'row', style: { marginBottom: '8px' } }, h('span', { class: 'muted' }, 'Channel'), sel, h('span', { class: 'muted', style: { marginLeft: 'auto', fontSize: '11px' } }, 'Click to add points · drag out to remove')), cv), buttons: [{ label: 'Cancel', value: null }, { label: 'Apply', primary: true, value: 'ok' }] });
  if (r === 'ok') pushHist('Curves'); else { const c = L.canvas.getContext('2d'); c.clearRect(0, 0, orig.width, orig.height); c.drawImage(orig, 0, 0); requestRender(); }
}

// =====================================================================  files
async function newDialog() {
  const presets = { custom: null, hd: [1920, 1080], '4k': [3840, 2160], insta: [1080, 1080], story: [1080, 1920], a4: [2480, 3508], letter: [2550, 3300], yt: [1280, 720], web: [1366, 768], icon: [512, 512] };
  const v = await form({ title: 'New document', width: 420, fields: [
    { key: 'name', label: 'Name', value: 'Untitled-' + (docs.length + 1) },
    { key: 'preset', label: 'Preset', type: 'select', value: 'hd', options: [{ value: 'hd', label: 'Full HD 1920×1080' }, { value: '4k', label: '4K UHD 3840×2160' }, { value: 'yt', label: 'YouTube thumbnail 1280×720' }, { value: 'insta', label: 'Instagram post 1080×1080' }, { value: 'story', label: 'Story / Reel 1080×1920' }, { value: 'a4', label: 'A4 @300dpi 2480×3508' }, { value: 'letter', label: 'US Letter @300dpi' }, { value: 'web', label: 'Web 1366×768' }, { value: 'icon', label: 'Icon 512×512' }, { value: 'custom', label: 'Custom size' }] },
    { key: 'w', label: 'Width (custom, px)', type: 'number', value: 1920 }, { key: 'h', label: 'Height (custom, px)', type: 'number', value: 1080 },
    { key: 'bg', label: 'Background', type: 'select', value: 'white', options: [{ value: 'white', label: 'White' }, { value: 'black', label: 'Black' }, { value: 'bgc', label: 'Background color' }, { value: 'transparent', label: 'Transparent' }] }], ok: 'Create' });
  if (!v) return; const [w, hh] = presets[v.preset] || [clamp(+v.w, 1, 16000), clamp(+v.h, 1, 16000)];
  addDoc(createDoc({ w, h: hh, name: v.name, bg: { white: '#ffffff', black: '#000000', bgc: O.bg, transparent: null }[v.bg] }));
}
UI.shortcut('ctrl+n', newDialog);
async function openDialog() { const fs = await bts.fs.open({ multi: true, filters: [{ name: 'Images & projects', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'psd', 'btsp', 'svg', 'ico'] }] }); if (fs) for (const f of fs) await openFile(f); }
UI.shortcut('ctrl+o', openDialog);
async function decodeImage(u8, name) { const type = /\.svg$/i.test(name) ? 'image/svg+xml' : ''; const blob = new Blob([u8], type ? { type } : {}); try { return await createImageBitmap(blob); } catch { const url = URL.createObjectURL(blob); const im = new Image(); im.src = url; await im.decode(); return im; } }
async function openFile(f) {
  const u8 = new Uint8Array(f.data);
  try {
    if (/\.btsp$/i.test(f.name)) { const j = JSON.parse(new TextDecoder().decode(u8)); const d = createDoc({ w: j.w, h: j.h, name: f.name, bg: null }); d.layers = []; for (const l of j.layers) { const im = await decodeImage(Uint8Array.from(atob(l.png.split(',')[1]), c => c.charCodeAt(0)), 'x.png'); const L = newLayer(l.name, im.width, im.height, { x: l.x, y: l.y, visible: l.visible, opacity: l.opacity, blend: l.blend, locked: l.locked, fx: l.fx || {}, kind: l.kind || 'raster', text: l.text }); L.canvas.getContext('2d').drawImage(im, 0, 0); if (l.mask) { const mi = await decodeImage(Uint8Array.from(atob(l.mask.split(',')[1]), c => c.charCodeAt(0)), 'm.png'); L.mask = mk(mi.width, mi.height); L.mask.getContext('2d').drawImage(mi, 0, 0); L.maskVer = 1; } d.layers.push(L); } d.path = f.path; d.fmt = 'btsp'; addDoc(d); }
    else if (/\.psd$/i.test(f.name)) {
      const psd = agPsd.readPsd(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength), { skipThumbnail: true });
      const d = createDoc({ w: psd.width, h: psd.height, name: f.name, bg: null }); d.layers = [];
      const walk = (kids) => (kids || []).forEach(ch => { if (ch.children) return walk(ch.children); if (!ch.canvas) return; const L = newLayer(ch.name || 'Layer', ch.canvas.width, ch.canvas.height, { x: ch.left || 0, y: ch.top || 0, visible: !ch.hidden, opacity: ch.opacity ?? 1, blend: psdBlendIn(ch.blendMode) }); L.canvas.getContext('2d').drawImage(ch.canvas, 0, 0); d.layers.push(L); });
      walk(psd.children);
      if (!d.layers.length && psd.canvas) { const L = newLayer('Background', psd.width, psd.height); L.canvas.getContext('2d').drawImage(psd.canvas, 0, 0); d.layers.push(L); }
      d.active = d.layers.length - 1; d.path = f.path; d.fmt = 'psd'; addDoc(d);
    } else {
      const im = await decodeImage(u8, f.name); const d = createDoc({ w: im.width, h: im.height, name: f.name, bg: null }); d.layers[0].name = 'Background'; d.layers[0].canvas.getContext('2d').drawImage(im, 0, 0); d.path = f.path; d.fmt = (f.name.split('.').pop() || 'png').toLowerCase(); addDoc(d);
    }
    if (f.path) bts.recent.add(f.path);
  } catch (e) { console.error(e); toast('Could not open ' + f.name + ': ' + e.message, 'err', 6000); }
}
const psdBlendIn = m => { if (!m || m === 'normal' || m === 'pass through') return 'source-over'; const v = m.replace(/ /g, '-'); return BLENDS.some(b => b[0] === v) ? v : 'source-over'; };
const psdBlendOut = b => b === 'source-over' ? 'normal' : b.replace(/-/g, ' ');
async function placeImage() {
  const fs = await bts.fs.open({ filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'svg'] }] }); if (!fs) return;
  if (!D) return openFile(fs[0]);
  const im = await decodeImage(new Uint8Array(fs[0].data), fs[0].name); const L = newLayer(fs[0].name.replace(/\.\w+$/, ''), im.width, im.height);
  L.canvas.getContext('2d').drawImage(im, 0, 0); L.x = Math.round((D.w - im.width) / 2); L.y = Math.round((D.h - im.height) / 2);
  D.layers.splice(D.active + 1, 0, L); D.active++; requestRender(); pushHist('Place'); if (im.width > D.w || im.height > D.h) { startTransform(); const k = Math.min(D.w / im.width, D.h / im.height); T.sx = T.sy = k; requestRender(); drawOverlay(); toast('Press Enter to commit the placed image'); }
}
UI.shortcut('ctrl+shift+p', placeImage);
const canvasToU8 = async (c, type = 'image/png', q) => UI.blobToU8(await new Promise(r => c.toBlob(r, type, q)));
async function saveProject(as) {
  if (!D) return; if (T) commitTransform();
  const j = { app: 'BTS Photo', v: 1, w: D.w, h: D.h, layers: D.layers.map(L => ({ name: L.name, x: L.x, y: L.y, visible: L.visible, opacity: L.opacity, blend: L.blend, locked: L.locked, fx: L.fx, kind: L.kind, text: L.text, png: L.canvas.toDataURL('image/png'), mask: L.mask ? L.mask.toDataURL('image/png') : null })) };
  const data = new TextEncoder().encode(JSON.stringify(j));
  let p = D.fmt === 'btsp' && !as ? D.path : null;
  if (p) await bts.fs.write({ path: p, data }); else { p = await bts.fs.saveAs({ data, defaultPath: D.name.replace(/\.\w+$/, '') + '.btsp', filters: [{ name: 'BTS Photo project', extensions: ['btsp'] }] }); if (!p) return; }
  D.path = p; D.fmt = 'btsp'; D.name = p.split(/[\\/]/).pop(); D.dirty = false; UI.setDocTitle(D.name, 'BTS Photo'); renderTabs(); toast('Saved ' + D.name, 'ok');
}
UI.shortcut('ctrl+s', () => saveProject(false)); UI.shortcut('ctrl+shift+s', () => saveProject(true));
async function savePsd() {
  if (!D) return; if (T) commitTransform();
  const psd = { width: D.w, height: D.h, canvas: flattenCanvas(), children: D.layers.map(L => { const r = (L.mask || L.fx && Object.keys(L.fx).length) ? { canvas: bakeLayer(L), x: 0, y: 0 } : { canvas: L.canvas, x: L.x, y: L.y }; return { name: L.name, canvas: r.canvas, left: r.x, top: r.y, opacity: L.opacity, hidden: !L.visible, blendMode: psdBlendOut(L.blend) }; }) };
  const buf = agPsd.writePsd(psd, { generateThumbnail: true });
  const p = await bts.fs.saveAs({ data: new Uint8Array(buf), defaultPath: D.name.replace(/\.\w+$/, '') + '.psd', filters: [{ name: 'Photoshop', extensions: ['psd'] }] });
  if (p) { toast('Saved PSD', 'ok'); D.dirty = false; renderTabs(); }
}
async function exportImage(fmt, quick) {
  if (!D) return; if (T) commitTransform();
  let q = 0.92, scale = 1;
  if (!quick) { const v = await form({ title: 'Export as ' + fmt.toUpperCase(), fields: [{ key: 'scale', label: 'Scale %', type: 'number', value: 100 }, ...(fmt !== 'png' ? [{ key: 'q', label: 'Quality %', type: 'range', min: 10, max: 100, value: 90 }] : [])], ok: 'Export…' }); if (!v) return; q = (v.q ?? 92) / 100; scale = clamp(+v.scale, 1, 1000) / 100; }
  let c = flattenCanvas(); if (fmt === 'jpeg') { const o = mk(c.width, c.height), x = o.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, o.width, o.height); x.drawImage(c, 0, 0); c = o; }
  if (scale !== 1) { const o = mk(c.width * scale, c.height * scale), x = o.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, o.width, o.height); c = o; }
  const ext = fmt === 'jpeg' ? 'jpg' : fmt; const data = await canvasToU8(c, 'image/' + fmt, q);
  const p = await bts.fs.saveAs({ data, defaultPath: D.name.replace(/\.\w+$/, '') + '.' + ext, filters: [{ name: fmt.toUpperCase(), extensions: [ext] }] });
  if (p) toast(`Exported ${(data.length / 1024).toFixed(0)} KB`, 'ok');
}
UI.shortcut('ctrl+alt+shift+s', () => exportImage('png', true));
async function closeDoc() {
  if (!D) return;
  if (D.dirty) { const r = await modal({ title: 'Save changes?', body: `Save changes to “${D.name}” before closing?`, buttons: [{ label: 'Cancel', value: null }, { label: "Don't save", value: 'no' }, { label: 'Save', primary: true, value: 'yes' }] }); if (r === null) return; if (r === 'yes') { await saveProject(false); if (D.dirty) return; } }
  docs = docs.filter(d => d !== D); D = docs[docs.length - 1] || null; if (D) switchDoc(D); else { renderAll(); renderTabs(); UI.setDocTitle('', 'BTS Photo'); const c = overlay.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, overlay.width, overlay.height); display.width = 1; display.height = 1; }
}
UI.shortcut('ctrl+w', closeDoc);
async function closeWindow() { while (docs.some(d => d.dirty)) { D = docs.find(d => d.dirty); switchDoc(D); const before = docs.length; await closeDoc(); if (docs.length === before) return; } bts.win.close(); }
function shortcutsHelp() {
  const rows = [['V M L W C I', 'Move · Marquee · Lasso · Wand · Crop · Eyedropper'], ['J B N S E', 'Heal · Brush · Pencil · Clone · Eraser'], ['G / Shift+G', 'Bucket / Gradient'], ['R O T U H Z', 'Blur · Dodge · Type · Shape · Hand · Zoom'], ['[ ]', 'Brush size'], ['X / D', 'Swap / default colors'], ['1–0', 'Opacity'], ['Space', 'Pan'], ['Alt+wheel / Ctrl+wheel', 'Zoom'],
    ['Ctrl+T', 'Free transform'], ['Ctrl+J', 'Layer via copy'], ['Ctrl+E', 'Merge down'], ['Ctrl+A / D / Shift+I', 'Select all / deselect / inverse'], ['Ctrl+L / M / U / B', 'Levels / Curves / Hue-Sat / Color balance'], ['Ctrl+I', 'Invert'], ['Alt / Ctrl+Backspace', 'Fill fg / bg'], ['Ctrl+Z / Shift+Z', 'Undo / redo']];
  modal({ title: 'Keyboard shortcuts', width: 520, body: '<table style="width:100%">' + rows.map(r => `<tr><td style="padding:3px 10px 3px 0;color:var(--tx-0);white-space:nowrap">${r[0]}</td><td style="color:var(--tx-2)">${r[1]}</td></tr>`).join('') + '</table>' });
}

// =====================================================================  boot
vpEl.append(h('div', { class: 'welcome' }, h('div', { class: 'card' }, h('div', { class: 'big-ico' }, 'Ph'), h('h2', {}, 'BTS Photo'), h('p', {}, 'Create a new image or open a photo, PSD or project. You can also drop files here or paste an image.'),
  h('div', { class: 'row' }, h('button', { class: 'btn primary', html: icon('plus') + 'New', onclick: newDialog }), h('button', { class: 'btn', html: icon('open') + 'Open', onclick: openDialog })))));
UI.fileDrop(async files => { for (const f of files) await openFile({ name: f.name, path: bts.fs.pathOf(f), data: new Uint8Array(await f.arrayBuffer()) }); }, 'Drop images to open');
renderColor(); setTool('brush'); renderAll(); renderTabs(); UI.setDocTitle('', 'BTS Photo');
const qf = UI.queryFile(); if (qf) bts.fs.read(qf).then(f => openFile({ ...f, data: new Uint8Array(f.data) }));
window.__bts = { get D() { return D; }, O, addDoc, createDoc, setTool, pushHist, requestRender, flattenCanvas, runAdjust, ADJ, FILTERS, layerImageOp, startTransform, commitTransform, selectAll, addLayer, applyGradient, commitShape, savePsd, renderLayers, fxDialog, textClick, finishText, get T() { return T; } };
})();
