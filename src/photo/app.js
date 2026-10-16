// BTS Photo — layer-based raster image editor
(() => {
const { $, h, toast, modal, form, prompt, confirm, contextMenu, clamp } = UI;
const X = window.PFX;
// extra icons for tools the shared kit does not have
const XP = {
  remove: 'M15 4l5 5-9 9H6v-5zM3 21h18M13 6l5 5',
  patch: 'M4 6c3-3 6 0 9-2s5 1 7 3l-2 11c-3 2-6-1-9 1s-5-1-7-3z',
  redeye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 11v2',
  pstamp: 'M5 22h14M5 18h14v-3a2 2 0 0 0-2-2h-3l1-6a3 3 0 1 0-6 0l1 6H7a2 2 0 0 0-2 2zM8 15h.01M12 15h.01M16 15h.01',
  mixer: 'M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08M7 15a3 3 0 1 0 0 6c2 0 3-1.5 3-3M3 17l3 3',
  colorrep: 'M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08M4 15h6v6H4zM14 18h6',
  ruler: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  pcrop: 'M6 3l-2 15 16 3-2-17zM6 3l14 1M4 18l14 3',
  smudge: 'M18 2l4 4-12 12H6v-4zM3 21c2-2 2-4 4-4',
  sponge: 'M4 8h16v12H4zM8 12h.01M12 15h.01M16 12h.01',
  looks: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3v18M3 12h18',
  camera: 'M3 7h4l2-3h6l2 3h4v13H3zM12 10a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  liquify: 'M3 12c3-6 6 6 9 0s6 6 9 0M3 18c3-6 6 6 9 0s6 6 9 0M3 6c3-6 6 6 9 0s6 6 9 0',
  heal: 'M10 2h4v8h8v4h-8v8h-4v-8H2v-4h8z',
  frame: 'M3 7h18M3 17h18M7 3v18M17 3v18M10 10l4 4M14 10l-4 4',
  brighten: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  upscale: 'M3 21l7-7M3 21v-5M3 21h5M21 3l-7 7M21 3v5M21 3h-5M4 4h6v6H4zM14 14h6v6h-6z',
  sky: 'M6 18h11a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 6 18zM2 22h20',
  harmonize: 'M4 12a8 8 0 0 1 16 0M9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0M2 20h20M7 16h10',
  subject: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21c1-4 4-6 8-6s7 2 8 6M2 2h4M2 2v4M22 2h-4M22 2v4M2 22v-4M22 22v-4',
  check: 'M4 12l5 5L20 6',
  close: 'M6 6l12 12M18 6L6 18',
  wires: 'M2 6c6 4 14 4 20 0M2 11c6 4 14 4 20 0M5 3v18M19 3v18',
  dust: 'M5 5h.01M9 8h.01M16 6h.01M7 15h.01M14 13h.01M18 17h.01M11 19h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
};
const icon = (n, s) => XP[n] ? `<svg viewBox="0 0 24 24"${s ? ` style="width:${s}px;height:${s}px"` : ''}><path d="${XP[n]}"/></svg>` : UI.icon(n, s);

// =====================================================================  documents
let docs = [], D = null; let uidN = 1; const uid = () => 'L' + (uidN++);
const BLENDS = [['source-over', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'], ['darken', 'Darken'], ['lighten', 'Lighten'], ['color-dodge', 'Color Dodge'], ['color-burn', 'Color Burn'], ['hard-light', 'Hard Light'], ['soft-light', 'Soft Light'], ['difference', 'Difference'], ['exclusion', 'Exclusion'], ['hue', 'Hue'], ['saturation', 'Saturation'], ['color', 'Color'], ['luminosity', 'Luminosity']];
let cidN = 1; const cid = c => c ? (c._cid || (c._cid = cidN++)) : 0;
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const ctxOf = c => c.getContext('2d', { willReadFrequently: true });
const cloneCanvas = c => { const n = mk(c.width, c.height); n.getContext('2d').drawImage(c, 0, 0); return n; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function newLayer(name, w, h, props = {}) { return { id: uid(), name, canvas: mk(w, h), x: 0, y: 0, visible: true, opacity: 1, blend: 'source-over', locked: false, kind: 'raster', mask: null, editMask: false, fx: {}, ...props }; }
function createDoc({ w, h, name = 'Untitled-' + (docs.length + 1), bg = '#ffffff' }) {
  const d = { id: uid(), w, h, name, path: null, layers: [], active: 0, sel: null, selPath: null, prevSel: null, dirty: false, hist: [], hi: -1, zoom: 1, px: 0, py: 0, fmt: null, guides: [], notes: [], snaps: [], ruler: null };
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
  grad: 'linear', gradStops: [[0, '#000000', 1], [1, '#ffffff', 1]], gradReverse: false, shape: 'rect', shapeFill: true, shapeStroke: 0, shapeFillC: '#31a8ff', shapeStrokeC: '#000000', radius: 0, sides: 5,
  font: 'Segoe UI', fontSize: 64, bold: false, italic: false, align: 'left',
  blurMode: 'blur', strength: 0.5, dodgeMode: 'dodge', range: 'midtones', cloneAligned: true,
  showGrid: false, gridSize: 0, pixel: true, autoSelect: false, cropRatio: 'free', cropW: 4, cropH: 5, cropFill: false,
  showRulers: false, showGuides: true, snap: true, smartGuides: true, lockGuides: false, showNotes: true,
  pattern: 0, patScale: 1, wet: 0.5, mixLoad: 0.5, crTol: 40, crMode: 'color', healSample: false, removeSize: 60,
  removeMode: 'object', brightMode: 'teeth', frameShape: 'rect', frameRadius: 0, frameStroke: 0, frameStrokeC: '#ffffff', smartFilters: false,
};
let clipboard = null; // {canvas, x, y}
let fxClipboard = null, lastFilter = null;

// =====================================================================  tools (grouped like Photoshop)
const TOOLDEF = {
  move: ['move', 'Move', 'V'], marquee: ['marquee', 'Marquee', 'M'], lasso: ['lasso', 'Lasso', 'L'], wand: ['wand', 'Magic wand', 'W'],
  crop: ['crop', 'Crop', 'C'], pcrop: ['pcrop', 'Perspective crop', 'Shift+C'],
  eyedrop: ['eyedrop', 'Eyedropper', 'I'], ruler: ['ruler', 'Ruler / measure', 'Shift+I'], note: ['note', 'Note', 'Shift+I'],
  heal: ['heal', 'Spot healing brush', 'J'], remove: ['remove', 'Remove tool', 'Shift+J'], patch: ['patch', 'Patch tool', 'Shift+J'], redeye: ['redeye', 'Red-eye tool', 'Shift+J'],
  brush: ['brush', 'Brush', 'B'], pencil: ['pencil', 'Pencil', 'N'], mixer: ['mixer', 'Mixer brush', 'Shift+B'], colorrep: ['colorrep', 'Color replacement', 'Shift+B'],
  clone: ['clone', 'Clone stamp', 'S'], pstamp: ['pstamp', 'Pattern stamp', 'Shift+S'],
  eraser: ['eraser', 'Eraser', 'E'], gradient: ['gradient', 'Gradient', 'G'], bucket: ['bucket', 'Paint bucket', 'Shift+G'],
  blur: ['blur', 'Blur / Sharpen / Smudge', 'R'], dodge: ['dodge', 'Dodge / Burn / Sponge', 'O'],
  brighten: ['brighten', 'Teeth & eye brighten', 'Shift+O'], frame: ['frame', 'Frame', 'K'],
  text: ['text', 'Type', 'T'], shape: ['shape', 'Shape', 'U'], hand: ['hand', 'Hand', 'H'], zoom: ['zoom', 'Zoom', 'Z'],
};
const GROUPS = [['move'], ['marquee'], ['lasso'], ['wand'], ['crop', 'pcrop'], ['eyedrop', 'ruler', 'note'], '-',
  ['heal', 'remove', 'patch', 'redeye'], ['brush', 'pencil', 'mixer', 'colorrep'], ['clone', 'pstamp'], ['eraser'], ['gradient', 'bucket'], ['blur'], ['dodge', 'brighten'], '-',
  ['text'], ['shape'], ['frame'], ['hand'], ['zoom']];
const groupOf = t => GROUPS.find(g => g !== '-' && g.includes(t));
const groupCur = {}; GROUPS.forEach(g => { if (g !== '-') groupCur[g[0]] = g[0]; });
const PAINT_TOOLS = ['brush', 'pencil', 'eraser', 'clone', 'heal', 'remove', 'blur', 'dodge', 'pstamp', 'mixer', 'colorrep', 'redeye', 'brighten'];

// =====================================================================  menus
const SKIN_ITEMS = () => UI.SKINS.map(k => ({ label: k.name, checked: () => (UI.getSettings().skin || 'dark') === k.id, action: () => { UI.setSettings({ skin: k.id }); requestRender(); } }));
const noDoc = () => !D;
UI.titlebar({ logo: 'Ph', menus: [
  { label: 'File', items: () => [
    { label: 'New…', kbd: 'Ctrl+N', action: newDialog }, { label: 'Open…', kbd: 'Ctrl+O', action: openDialog },
    { label: 'Place image as layer…', kbd: 'Ctrl+Shift+P', action: placeImage, disabled: !D },
    '-', { label: 'Save project (.btsp)', kbd: 'Ctrl+S', action: () => saveProject(false), disabled: !D }, { label: 'Save project as…', kbd: 'Ctrl+Shift+S', action: () => saveProject(true), disabled: !D },
    { label: 'Save as Photoshop (.psd)…', action: savePsd, disabled: !D },
    '-', { label: 'Export As…', kbd: 'Ctrl+Alt+Shift+W', action: exportDialog, disabled: !D },
    { label: 'Quick export PNG', kbd: 'Ctrl+Alt+Shift+S', action: quickExportPng, disabled: !D },
    { label: 'Export layers to files…', action: exportLayersDialog, disabled: !D },
    { label: 'Copy merged to clipboard', action: () => copy(true), disabled: !D },
    '-', { label: 'Autosave & recovery…', action: autosaveSettings }, { label: 'Recover autosaved documents…', action: () => checkRecovery({ manual: true }) },
    '-', { label: 'Close document', kbd: 'Ctrl+W', action: closeDoc, disabled: !D }, { label: 'BTS Creative home', action: () => bts.openApp('home') }, { label: 'Exit', action: closeWindow } ] },
  { label: 'Edit', items: () => [
    { label: 'Undo ' + (D?.hist[D.hi]?.label || ''), kbd: 'Ctrl+Z', action: undo, disabled: !D || D.hi <= 0 },
    { label: 'Redo', kbd: 'Ctrl+Shift+Z', action: redo, disabled: !D || D.hi >= D.hist.length - 1 },
    '-', { label: 'Cut', kbd: 'Ctrl+X', action: cut }, { label: 'Copy', kbd: 'Ctrl+C', action: copy }, { label: 'Copy merged', kbd: 'Ctrl+Shift+C', action: () => copy(true) },
    { label: 'Paste', kbd: 'Ctrl+V', action: paste }, { label: 'Paste as new layer (from clipboard)', action: paste }, { label: 'Clear', kbd: 'Del', action: clearSel },
    '-', { label: 'Fill…', kbd: 'Shift+F5', action: fillDialog }, { label: 'Content-Aware Fill…', kbd: 'Shift+Backspace', action: contentAwareFillDialog, disabled: noDoc() }, { label: 'Stroke…', action: strokeDialog },
    { label: 'Remove', sub: [{ label: 'Wires & cables…', action: () => removeDistractions('wires'), disabled: noDoc() }, { label: 'Dust & spots…', action: () => removeDistractions('spots'), disabled: noDoc() }, '-', { label: 'Remove tool (brush over distractions)', action: () => setTool('remove') }] }, { label: 'Sky replacement…', action: skyReplaceDialog, disabled: noDoc() },
    '-', { label: 'Free transform', kbd: 'Ctrl+T', action: startTransform },
    { label: 'Transform', sub: [{ label: 'Flip horizontal', action: () => flipLayer(true) }, { label: 'Flip vertical', action: () => flipLayer(false) }, { label: 'Rotate 90° CW', action: () => rotateLayer(90) }, { label: 'Rotate 90° CCW', action: () => rotateLayer(-90) }, { label: 'Rotate 180°', action: () => rotateLayer(180) }] },
    '-', { label: 'Define pattern…', action: definePattern, disabled: noDoc() }, { label: 'Take history snapshot', action: takeSnapshot, disabled: noDoc() },
  ] },
  { label: 'Image', items: () => [
    { label: 'Adjustments', sub: ADJ.map(a => ({ label: a.name + (a.params || a.custom ? '…' : ''), kbd: a.kbd, action: () => runAdjust(a) })) },
    { label: 'Auto tone', kbd: 'Ctrl+Shift+L', action: () => quickAdj(X.adj.autoTone, 'Auto tone') },
    { label: 'Auto contrast', kbd: 'Ctrl+Alt+Shift+L', action: () => quickAdj(X.adj.autoContrast, 'Auto contrast') },
    { label: 'Auto color', kbd: 'Ctrl+Shift+B', action: () => quickAdj(X.adj.autoColor, 'Auto color') },
    '-', { label: 'Image size…', kbd: 'Ctrl+Alt+I', action: imageSizeDialog }, { label: 'Canvas size…', kbd: 'Ctrl+Alt+C', action: canvasSizeDialog },
    { label: 'Image rotation', sub: [{ label: '180°', action: () => rotateCanvas(180) }, { label: '90° clockwise', action: () => rotateCanvas(90) }, { label: '90° counter-clockwise', action: () => rotateCanvas(-90) }, { label: 'Arbitrary…', action: () => straightenDialog(0) }, '-', { label: 'Flip canvas horizontal', action: () => flipCanvas(true) }, { label: 'Flip canvas vertical', action: () => flipCanvas(false) }] },
    { label: 'Straighten…', action: () => straightenDialog(D?.ruler ? rulerAngle() : 0), disabled: noDoc() }, { label: 'Auto-straighten', action: autoStraighten, disabled: noDoc() },
    { label: 'Crop to selection', action: cropToSelection, disabled: !D?.sel }, { label: 'Trim…', action: trimDialog, disabled: noDoc() }, { label: 'Reveal all', action: revealAll, disabled: noDoc() },
    { label: 'Generative expand canvas…', action: expandDialog, disabled: noDoc() },
    { label: 'Upscale (super resolution)…', action: upscaleDialog, disabled: noDoc() },
    '-', { label: 'Duplicate', action: duplicateDoc },
  ] },
  { label: 'Layer', items: () => [
    { label: 'New layer', kbd: 'Ctrl+Shift+N', action: () => addLayer() },
    { label: 'New adjustment layer', sub: ADJ.filter(a => a.layer !== false).map(a => ({ label: a.name + '…', action: () => runAdjust(a, { asLayer: true }) })) },
    { label: 'Layer via copy', kbd: 'Ctrl+J', action: () => layerVia(false) }, { label: 'Layer via cut', kbd: 'Ctrl+Shift+J', action: () => layerVia(true) },
    { label: 'Duplicate layer', action: duplicateLayer }, { label: 'Delete layer', action: deleteLayer }, { label: 'Rename layer…', action: renameLayer },
    { label: 'Layer properties / edit adjustment…', action: editActiveLayer, disabled: AL()?.kind !== 'adjust' },
    '-', { label: 'Layer mask', sub: [{ label: 'Reveal all', action: () => addMask('all') }, { label: 'Hide all', action: () => addMask('none') }, { label: 'Reveal selection', action: () => addMask('sel'), disabled: !D?.sel }, '-', { label: 'Apply mask', action: applyMask }, { label: 'Delete mask', action: deleteMask }, { label: 'Invert mask', action: invertMask }] },
    { label: 'Layer style', sub: [{ label: 'Blending options / all styles…', action: () => layerStyleDialog() }, '-', ...FX_LIST.map(([k, n]) => ({ label: n + '…', action: () => layerStyleDialog(k) })), '-', { label: 'Copy layer style', action: copyFx }, { label: 'Paste layer style', action: pasteFx, disabled: !fxClipboard }, { label: 'Clear layer style', action: clearFx }] },
    { label: 'Remove background', sub: [{ label: 'Person / portrait (AI)', action: () => removeBackground('ai') }, { label: 'Plain or product background…', action: () => removeBackground('plain') }] },
    { label: 'Harmonize…', action: harmonizeDialog, disabled: noDoc() },
    { label: 'Frame', sub: [{ label: 'New rectangle frame', action: () => newFrameCentered('rect'), disabled: noDoc() }, { label: 'New ellipse frame', action: () => newFrameCentered('ellipse'), disabled: noDoc() }, { label: 'Frame from selection / layer', action: frameFromSelectionOrLayer, disabled: noDoc() }, '-', { label: 'Place image into frame…', action: () => placeIntoFrame(), disabled: !activeFrame() }, { label: 'Fill frame', action: () => updateFrame({ fit: 'fill', scale: 1, ox: 0, oy: 0 }), disabled: !activeFrame() }, { label: 'Fit content to frame', action: () => updateFrame({ fit: 'fit', scale: 1, ox: 0, oy: 0 }), disabled: !activeFrame() }, { label: 'Remove image from frame', action: () => updateFrame({ img: null }), disabled: !activeFrame()?.frame.img }] },
    { label: 'Smart filters', sub: SMART_MENU() },
    { label: 'Adjustment presets', sub: [{ label: 'Save preset from active adjustment layer…', action: saveActivePreset, disabled: AL()?.kind !== 'adjust' }, { label: 'Apply preset…', action: applyPresetDialog, disabled: noDoc() }, { label: 'Manage presets…', action: managePresetsDialog }] },
    { label: 'Rasterize layer', action: rasterizeLayer, disabled: !(AL()?.kind === 'text' || AL()?.kind === 'frame' || AL()?.smart) },
    '-', { label: 'Bring forward', kbd: 'Ctrl+]', action: () => moveLayer(1) }, { label: 'Send backward', kbd: 'Ctrl+[', action: () => moveLayer(-1) },
    { label: 'Bring to front', kbd: 'Ctrl+Shift+]', action: () => moveLayer(99) }, { label: 'Send to back', kbd: 'Ctrl+Shift+[', action: () => moveLayer(-99) },
    '-', { label: 'Merge down', kbd: 'Ctrl+E', action: mergeDown }, { label: 'Merge visible', kbd: 'Ctrl+Shift+E', action: mergeVisible }, { label: 'Flatten image', action: flatten },
  ] },
  { label: 'Select', items: () => [
    { label: 'All', kbd: 'Ctrl+A', action: selectAll }, { label: 'Deselect', kbd: 'Ctrl+D', action: deselect }, { label: 'Reselect', kbd: 'Ctrl+Shift+D', action: reselect },
    { label: 'Inverse', kbd: 'Ctrl+Shift+I', action: invertSel }, '-',
    { label: 'Subject (people, AI)', kbd: 'Ctrl+Alt+S', action: () => selectSubject('ai') }, { label: 'Subject (plain background)', action: () => selectSubject('plain') },
    { label: 'Sky', action: selectSky }, { label: 'Focus area…', action: focusAreaDialog }, { label: 'Color range…', action: colorRangeDialog }, { label: 'Load layer transparency', action: selectLayerAlpha },
    '-', { label: 'Grow', action: growSel, disabled: !D?.sel }, { label: 'Similar', action: similarSel, disabled: !D?.sel },
    { label: 'Modify', sub: [{ label: 'Feather…', kbd: 'Shift+F6', action: () => modifySel('feather') }, { label: 'Expand…', action: () => modifySel('expand') }, { label: 'Contract…', action: () => modifySel('contract') }, { label: 'Smooth…', action: () => modifySel('smooth') }, { label: 'Border…', action: () => modifySel('border') }] },
    { label: 'Refine edge…', kbd: 'Ctrl+Alt+R', action: refineEdgeDialog, disabled: !D?.sel },
  ] },
  { label: 'Filter', items: () => [
    { label: 'Repeat last filter' + (lastFilter ? ': ' + lastFilter.F.name : ''), kbd: 'Ctrl+F', action: repeatFilter, disabled: !lastFilter },
    { label: 'Filter Gallery…', action: () => filterDialog(FILTERS.find(f => f.id === 'gauss'), { gallery: true }), disabled: noDoc() },
    { label: 'Liquify…', kbd: 'Ctrl+Shift+X', action: liquifyDialog, disabled: noDoc() }, '-',
    ...FILTER_CATS.filter(c => c !== 'Portrait').map(cat => ({ label: cat, sub: FILTERS.filter(f => f.cat === cat).map(f => ({ label: f.name + (f.params ? '…' : ''), action: () => runFilter(f) })) })),
    { label: 'Portrait', sub: [{ label: 'Skin smoothing…', action: () => runFilter(FILTERS.find(f => f.id === 'skin')) }, { label: 'Background blur…', action: backgroundBlurDialog, disabled: noDoc() }, { label: 'Teeth & eye brighten tool', action: () => setTool('brighten') }] },
    '-', { label: 'Smart filters', sub: SMART_MENU() },
  ] },
  { label: 'Tools', items: () => GROUPS.flatMap(g => g === '-' ? ['-'] : g.map(t => ({ label: TOOLDEF[t][1], kbd: TOOLDEF[t][2], checked: () => O.tool === t, action: () => setTool(t) }))) },
  { label: 'View', items: () => [
    { label: 'Zoom in', kbd: 'Ctrl++', action: () => zoomBy(1.25) }, { label: 'Zoom out', kbd: 'Ctrl+-', action: () => zoomBy(0.8) },
    { label: 'Fit on screen', kbd: 'Ctrl+0', action: fitView }, { label: '100%', kbd: 'Ctrl+1', action: () => setZoom(1) },
    '-', { label: 'Rulers', kbd: 'Ctrl+R', checked: () => O.showRulers, action: toggleRulers },
    { label: 'Guides', kbd: 'Ctrl+;', checked: () => O.showGuides, action: () => { O.showGuides = !O.showGuides; drawOverlay(); } },
    { label: 'Grid', kbd: "Ctrl+'", checked: () => O.showGrid, action: () => { O.showGrid = !O.showGrid; drawOverlay(); } },
    { label: 'Snap', kbd: 'Ctrl+Shift+;', checked: () => O.snap, action: () => { O.snap = !O.snap; } },
    { label: 'Smart guides', checked: () => O.smartGuides, action: () => { O.smartGuides = !O.smartGuides; } },
    { label: 'Contextual task bar', checked: () => O.taskBar, action: toggleTaskBar },
    { label: 'Notes', checked: () => O.showNotes, action: () => { O.showNotes = !O.showNotes; drawOverlay(); } },
    { label: 'New guide…', action: newGuideDialog, disabled: noDoc() }, { label: 'Lock guides', checked: () => O.lockGuides, action: () => { O.lockGuides = !O.lockGuides; } },
    { label: 'Clear guides', action: () => { if (D) { D.guides = []; drawOverlay(); } } }, { label: 'Grid settings…', action: gridDialog },
    '-', { label: 'Pixel preview at high zoom', checked: () => O.pixel, action: () => { O.pixel = !O.pixel; requestRender(); } },
    { label: 'Panels', sub: [['layers', 'Layers'], ['looks', 'Looks'], ['adjust', 'Adjustments & filters'], ['history', 'History & snapshots']].map(([t, n]) => ({ label: n, checked: () => rtab === t, action: () => showTab(t) })) },
    '-', { label: 'Appearance…', action: UI.appearanceDialog }, { label: 'Skin', sub: SKIN_ITEMS() },
  ] },
  { label: 'Help', items: [{ label: 'Keyboard shortcuts', kbd: 'Ctrl+/', action: UI.shortcutSheet }, { label: 'Check for updates', action: () => bts.update.check().then(r => toast(r.state === 'store' ? 'Updates are delivered by the Microsoft Store.' : r.state === 'dev' ? 'Updates run in the installed version.' : 'Checking for updates…')) }, { label: 'About BTS Photo', action: () => modal({ title: 'BTS Photo', body: 'Part of BTS Creative — free and open source for students.<br>Person segmentation by MediaPipe (Apache-2.0).<br>Not affiliated with Adobe Inc.' }) }] },
]});
window.addEventListener('bts:close', closeWindow);
window.addEventListener('bts:settings', () => { requestRender(); drawRulers(); });

// =====================================================================  toolbar
const tbEl = $('#toolbar');
function renderToolbar() {
  tbEl.querySelectorAll('.tgrp,.tsep').forEach(e => e.remove());
  const fg = tbEl.querySelector('.fgbg');
  GROUPS.forEach(g => {
    if (g === '-') return tbEl.insertBefore(h('div', { class: 'tsep' }), fg);
    const cur = groupCur[g[0]], [ic, tip, key] = TOOLDEF[cur];
    const b = h('button', { class: 'icon-btn tgrp' + (g.includes(O.tool) ? ' active' : '') + (g.length > 1 ? ' multi' : ''), 'data-tool': cur, 'data-tip': tip + (g.length > 1 ? ' (right-click for more)' : ''), 'data-key': key, html: icon(ic), onclick: () => setTool(cur) });
    if (g.length > 1) { const flyout = e => { e.preventDefault(); const r = b.getBoundingClientRect(); UI.showDropdown(g.map(t => ({ label: TOOLDEF[t][1], kbd: TOOLDEF[t][2], checked: O.tool === t, action: () => setTool(t) })), r.right + 4, r.top, () => document.querySelectorAll('.dropdown').forEach(d => d.remove())); }; b.addEventListener('contextmenu', flyout); let lp = null; b.addEventListener('pointerdown', e => { lp = setTimeout(() => flyout(e), 450); }); b.addEventListener('pointerup', () => clearTimeout(lp)); b.addEventListener('pointerleave', () => clearTimeout(lp)); }
    tbEl.insertBefore(b, fg);
  });
}
const fgbg = h('div', { class: 'fgbg' }, h('div', { class: 'sw fg', id: 'swFg', 'data-tip': 'Foreground color', onclick: () => pickColorDialog('fg') }), h('div', { class: 'sw bg', id: 'swBg', 'data-tip': 'Background color', onclick: () => pickColorDialog('bg') }),
  h('div', { class: 'swap', 'data-tip': 'Swap (X)', onclick: swapColors }, '⇄'), h('div', { class: 'reset', 'data-tip': 'Default colors (D)', onclick: resetColors }, '■□'));
tbEl.append(fgbg);
const keyMap = { v: 'move', m: 'marquee', l: 'lasso', w: 'wand', c: 'crop', 'shift+c': 'pcrop', i: 'eyedrop', j: 'heal', b: 'brush', n: 'pencil', s: 'clone', e: 'eraser', g: 'gradient', r: 'blur', o: 'dodge', t: 'text', u: 'shape', h: 'hand', z: 'zoom', k: 'frame' };
Object.entries(keyMap).forEach(([k, t]) => UI.shortcut(k, () => setTool(t)));
// Shift+key cycles through a tool group
[['shift+i', 'eyedrop'], ['shift+j', 'heal'], ['shift+b', 'brush'], ['shift+s', 'clone'], ['shift+g', 'gradient'], ['shift+o', 'dodge']].forEach(([k, g0]) => UI.shortcut(k, () => { const g = GROUPS.find(x => x[0] === g0); const i = g.indexOf(O.tool); setTool(g[(i + 1) % g.length]); }));
UI.shortcut('x', swapColors); UI.shortcut('d', resetColors);
UI.shortcut('[', () => { O.size = Math.max(1, Math.round(O.size / 1.15)); renderOptions(); drawOverlay(); });
UI.shortcut(']', () => { O.size = Math.min(2000, Math.round(O.size * 1.15 + 1)); renderOptions(); drawOverlay(); });
for (let i = 0; i <= 9; i++) UI.shortcut(String(i), () => { if (['brush', 'pencil', 'eraser', 'clone', 'pstamp', 'mixer'].includes(O.tool)) { O.opacity = i === 0 ? 1 : i / 10; renderOptions(); } else if (AL()) { AL().opacity = i === 0 ? 1 : i / 10; requestRender(); renderLayers(); pushHist('Opacity'); } });

function setTool(t) {
  if (!TOOLDEF[t]) return;
  if (O.tool === 'crop' && t !== 'crop') cropState = null;
  if (O.tool === 'pcrop' && t !== 'pcrop') pcropState = null;
  if (T && t !== 'move') commitTransform();
  O.tool = t; const g = groupOf(t); if (g) groupCur[g[0]] = t; renderToolbar();
  if (t === 'crop' && D) cropState = { x: 0, y: 0, w: D.w, h: D.h };
  if (t === 'pcrop' && D) { const ix = D.w * 0.08, iy = D.h * 0.08; pcropState = [[ix, iy], [D.w - ix, iy], [D.w - ix, D.h - iy], [ix, D.h - iy]]; }
  if (t === 'remove' && O.size < 40) O.size = O.removeSize;
  renderOptions(); updateCursor(); drawOverlay();
}
function swapColors() { [O.fg, O.bg] = [O.bg, O.fg]; renderColor(); }
function resetColors() { O.fg = '#000000'; O.bg = '#ffffff'; renderColor(); }

// =====================================================================  options bar
const CROP_RATIOS = [['free', 'Free'], ['orig', 'Original'], ['1', '1:1 (square)'], ['0.8', '4:5 (portrait)'], ['1.25', '5:4'], ['1.3333', '4:3'], ['0.75', '3:4'], ['1.5', '3:2'], ['0.6667', '2:3'], ['1.7778', '16:9'], ['0.5625', '9:16 (story)'], ['0.7071', 'A4 portrait'], ['1.4142', 'A4 landscape'], ['custom', 'Custom W:H']];
function cropRatioValue() { if (O.cropRatio === 'free') return 0; if (O.cropRatio === 'orig') return D ? D.w / D.h : 0; if (O.cropRatio === 'custom') return O.cropW / Math.max(0.01, O.cropH); return +O.cropRatio; }
function renderOptions() {
  const ob = $('#optbar'); ob.innerHTML = '';
  const grp = (...k) => h('div', { class: 'grp' }, ...k), vsep = () => h('div', { class: 'vsep' });
  const num = (label, key, min, max, step = 1, scale = 1, suffix = '', cb) => {
    const i = h('input', { type: 'number', min, max, step, value: Math.round(O[key] * scale * 100) / 100, style: { width: '62px' } });
    i.oninput = () => { O[key] = clamp(+i.value, min, max) / scale; drawOverlay(); cb && cb(); };
    return grp(label, i, suffix);
  };
  const chk = (label, key, cb) => { const c = h('input', { type: 'checkbox', checked: !!O[key] }); c.onchange = () => { O[key] = c.checked; cb && cb(); }; return h('label', { class: 'grp' }, c, label); };
  const sel = (label, key, opts, cb) => { const s = h('select', {}, ...opts.map(([v, l]) => h('option', { value: v, selected: String(O[key]) === String(v) }, l))); s.onchange = () => { O[key] = s.value; cb && cb(); renderOptions(); }; return grp(label, s); };
  const col = (label, key) => { const c = h('input', { type: 'color', value: O[key] }); c.oninput = () => { O[key] = c.value; }; return grp(label, c); };
  const btn = (label, fn, primary) => h('button', { class: 'btn sm' + (primary ? ' primary' : ''), onclick: fn }, label);
  const tip = s => h('span', { class: 'muted' }, s);
  const t = O.tool;
  ob.append(h('div', { class: 'grp tool-name', html: icon(TOOLDEF[t][0]) + `<span>${TOOLDEF[t][1]}</span>` }), vsep());
  const brushOpts = (withFlow = true) => { ob.append(num('Size', 'size', 1, 2000, 1, 1, 'px'), num('Hardness', 'hardness', 0, 100, 1, 100, '%'), num('Opacity', 'opacity', 1, 100, 1, 100, '%')); if (withFlow) ob.append(num('Flow', 'flow', 1, 100, 1, 100, '%')); };
  const selModes = () => grp('', ...[['new', 'New'], ['add', 'Add'], ['sub', 'Subtract'], ['int', 'Intersect']].map(([v, l]) => h('button', { class: 'btn sm' + (O.selMode === v ? ' primary' : ''), onclick: () => { O.selMode = v; renderOptions(); } }, l)));
  const selectQuick = () => [vsep(), btn('Select subject', () => selectSubject('ai')), btn('Select sky', selectSky), D?.sel ? btn('Refine edge…', refineEdgeDialog) : ''];
  if (t === 'brush' || t === 'pencil') brushOpts(t === 'brush');
  else if (t === 'eraser') brushOpts();
  else if (t === 'clone') { brushOpts(); ob.append(vsep(), chk('Aligned', 'cloneAligned'), chk('Sample all layers', 'sampleAll'), tip('Alt+click to set source')); }
  else if (t === 'pstamp') { brushOpts(); ob.append(vsep(), grp('Pattern', patternSelect()), num('Scale', 'patScale', 0.1, 10, 0.1, 1, '×'), btn('Define pattern…', definePattern)); }
  else if (t === 'mixer') { ob.append(num('Size', 'size', 1, 1000, 1, 1, 'px'), num('Wet', 'wet', 0, 100, 1, 100, '%'), num('Load', 'mixLoad', 0, 100, 1, 100, '%'), num('Flow', 'flow', 1, 100, 1, 100, '%'), tip('Mixes the foreground color with the paint already on the canvas')); }
  else if (t === 'colorrep') { ob.append(num('Size', 'size', 1, 1000, 1, 1, 'px'), num('Tolerance', 'crTol', 1, 255), sel('Mode', 'crMode', [['color', 'Color'], ['hue', 'Hue'], ['saturation', 'Saturation'], ['luminosity', 'Luminosity']]), tip('Replaces the color under the brush center with the foreground color')); }
  else if (t === 'heal') ob.append(num('Size', 'size', 1, 500, 1, 1, 'px'), chk('Sample all layers', 'healSample'), tip('Paint over blemishes — content-aware healing on release'));
  else if (t === 'remove') ob.append(sel('Mode', 'removeMode', [['object', 'Objects (content-aware)'], ['wires', 'Wires & cables'], ['spots', 'Dust & spots']]), num('Size', 'size', 1, 800, 1, 1, 'px'), O.removeMode === 'object' ? chk('Sample all layers', 'healSample') : '', tip(O.removeMode === 'object' ? 'Brush over an object to remove it' : O.removeMode === 'wires' ? 'Brush along the wires — thin lines under the brush are detected and removed' : 'Brush over the area — small spots under the brush are detected and removed'), O.removeMode !== 'object' ? btn('Whole image / selection…', () => removeDistractions(O.removeMode)) : '');
  else if (t === 'brighten') ob.append(sel('Mode', 'brightMode', [['teeth', 'Teeth whitening'], ['eyes', 'Eye brighten']]), num('Size', 'size', 1, 500), num('Strength', 'strength', 1, 100, 1, 100, '%'), tip('Paint over teeth or the irises'));
  else if (t === 'frame') {
    const F = activeFrame(); const live = (p, label) => F && updateFrame(p, label);
    ob.append(sel('Shape', 'frameShape', [['rect', 'Rectangle'], ['ellipse', 'Ellipse']], () => live({ shape: O.frameShape }, 'Frame shape')), O.frameShape === 'rect' ? num('Corner radius', 'frameRadius', 0, 2000, 1, 1, '', () => live({ radius: O.frameRadius }, 'Frame corners')) : '', num('Stroke', 'frameStroke', 0, 200, 1, 1, 'px', () => live({ stroke: O.frameStroke }, 'Frame stroke')));
    const sc = h('input', { type: 'color', value: O.frameStrokeC }); sc.oninput = () => { O.frameStrokeC = sc.value; live({ strokeC: sc.value }, 'Frame stroke'); }; ob.append(grp('', sc));
    if (F) { const fnum = (label, key, min, max, k = 1) => { const i = h('input', { type: 'number', min, max, value: Math.round((F.frame[key] || 0) * k), style: { width: '62px' } }); i.oninput = () => updateFrame({ [key]: clamp(+i.value, min, max) / k }, 'Frame content'); return grp(label, i); };
      ob.append(vsep(), btn(F.frame.img ? 'Replace image…' : 'Place image…', () => placeIntoFrame(F), true), btn('Fill', () => updateFrame({ fit: 'fill', scale: 1, ox: 0, oy: 0 })), btn('Fit', () => updateFrame({ fit: 'fit', scale: 1, ox: 0, oy: 0 })), fnum('Content %', 'scale', 5, 1000, 100), fnum('X', 'ox', -20000, 20000), fnum('Y', 'oy', -20000, 20000)); }
    else ob.append(tip('Drag to draw a frame · click a frame to fill it with an image'));
  }
  else if (t === 'patch') ob.append(tip(D?.sel ? 'Drag inside the selection to the area you want to copy from' : 'Draw around the area to repair, then drag it to a clean area'), D?.sel ? btn('Deselect', deselect) : '');
  else if (t === 'redeye') ob.append(num('Pupil size', 'size', 4, 400, 1, 1, 'px'), num('Darken', 'strength', 1, 100, 1, 100, '%'), tip('Click on a red eye'));
  else if (t === 'blur') { ob.append(sel('Mode', 'blurMode', [['blur', 'Blur'], ['sharpen', 'Sharpen'], ['smudge', 'Smudge']]), num('Size', 'size', 1, 500), num('Strength', 'strength', 1, 100, 1, 100, '%')); }
  else if (t === 'dodge') { ob.append(sel('Mode', 'dodgeMode', [['dodge', 'Dodge'], ['burn', 'Burn'], ['sponge', 'Sponge (desaturate)'], ['saturate', 'Sponge (saturate)']]), sel('Range', 'range', [['shadows', 'Shadows'], ['midtones', 'Midtones'], ['highlights', 'Highlights']]), num('Size', 'size', 1, 500), num('Exposure', 'strength', 1, 100, 1, 100, '%')); }
  else if (t === 'marquee') { ob.append(selModes(), vsep(), sel('Shape', 'marq', [['rect', 'Rectangle'], ['ellipse', 'Ellipse']]), num('Feather', 'feather', 0, 250, 1, 1, 'px'), ...selectQuick()); }
  else if (t === 'lasso') ob.append(selModes(), vsep(), num('Feather', 'feather', 0, 250, 1, 1, 'px'), ...selectQuick());
  else if (t === 'wand') ob.append(selModes(), vsep(), num('Tolerance', 'tolerance', 0, 255), chk('Contiguous', 'contiguous'), chk('Sample all layers', 'sampleAll'), ...selectQuick());
  else if (t === 'bucket') ob.append(num('Tolerance', 'tolerance', 0, 255), num('Opacity', 'opacity', 1, 100, 1, 100, '%'), chk('Contiguous', 'contiguous'), chk('Sample all layers', 'sampleAll'));
  else if (t === 'gradient') {
    const sw = h('div', { class: 'grad-swatch', 'data-tip': 'Click to edit the gradient', style: { background: gradCss(O.gradStops) }, onclick: async () => { const s = await gradientEditor(O.gradStops); if (s) { O.gradStops = s; renderOptions(); } } });
    ob.append(grp(sw), grp('', ...[['linear', 'Linear'], ['radial', 'Radial'], ['angle', 'Angle'], ['reflected', 'Reflected'], ['diamond', 'Diamond']].map(([v, l]) => h('button', { class: 'btn sm' + (O.grad === v ? ' primary' : ''), onclick: () => { O.grad = v; renderOptions(); } }, l))),
      chk('Reverse', 'gradReverse'), num('Opacity', 'opacity', 1, 100, 1, 100, '%'), btn('FG → BG', () => { O.gradStops = [[0, O.fg, 1], [1, O.bg, 1]]; renderOptions(); }), btn('FG → transparent', () => { O.gradStops = [[0, O.fg, 1], [1, O.fg, 0]]; renderOptions(); }));
  }
  else if (t === 'text') {
    const fonts = ['Segoe UI', 'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Georgia', 'Times New Roman', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Impact', 'Courier New', 'Consolas', 'Comic Sans MS', 'Segoe Script', 'Nirmala UI', 'Mangal'];
    ob.append(sel('Font', 'font', fonts.map(f => [f, f]), applyTextOpts), num('Size', 'fontSize', 4, 1000, 1, 1, 'px'),
      h('button', { class: 'btn sm' + (O.bold ? ' primary' : ''), onclick: () => { O.bold = !O.bold; renderOptions(); applyTextOpts(); } }, 'B'),
      h('button', { class: 'btn sm' + (O.italic ? ' primary' : ''), style: { fontStyle: 'italic' }, onclick: () => { O.italic = !O.italic; renderOptions(); applyTextOpts(); } }, 'I'),
      sel('Align', 'align', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']], applyTextOpts), btn('Layer style…', () => layerStyleDialog()), tip('Click to add text · color = foreground'));
    ob.querySelector('input[type=number]').addEventListener('change', applyTextOpts);
  }
  else if (t === 'shape') ob.append(sel('Shape', 'shape', [['rect', 'Rectangle'], ['round', 'Rounded rectangle'], ['ellipse', 'Ellipse'], ['line', 'Line'], ['triangle', 'Triangle'], ['polygon', 'Polygon'], ['star', 'Star'], ['arrow', 'Arrow']]), chk('Fill', 'shapeFill'), col('', 'shapeFillC'), num('Stroke', 'shapeStroke', 0, 200, 1, 1, 'px'), col('', 'shapeStrokeC'),
    ['rect', 'round'].includes(O.shape) ? num('Corner radius', 'radius', 0, 2000) : '', ['polygon', 'star'].includes(O.shape) ? num('Sides', 'sides', 3, 24) : '', btn('Layer style…', () => layerStyleDialog()));
  else if (t === 'crop') {
    ob.append(btn('✓ Apply crop', applyCrop, true), btn('Reset', () => { cropState = { x: 0, y: 0, w: D.w, h: D.h }; drawOverlay(); }), sel('Ratio', 'cropRatio', CROP_RATIOS, () => fitCropToRatio()));
    if (O.cropRatio === 'custom') ob.append(num('W', 'cropW', 0.01, 10000, 0.01, 1, '', fitCropToRatio), num('H', 'cropH', 0.01, 10000, 0.01, 1, '', fitCropToRatio));
    ob.append(h('button', { class: 'icon-btn', 'data-tip': 'Swap orientation', html: icon('swap'), onclick: () => { if (O.cropRatio === 'custom') [O.cropW, O.cropH] = [O.cropH, O.cropW]; else if (+O.cropRatio) { const v = 1 / +O.cropRatio, m = CROP_RATIOS.find(r => Math.abs(+r[0] - v) < 0.002); if (m) O.cropRatio = m[0]; else { O.cropRatio = 'custom'; O.cropW = v; O.cropH = 1; } } renderOptions(); fitCropToRatio(); } }),
      btn('Straighten…', () => straightenDialog(0)), chk('Content-aware fill outside', 'cropFill'), tip('Drag to set the crop, Enter to apply'));
  }
  else if (t === 'pcrop') ob.append(btn('✓ Apply perspective crop', applyPerspectiveCrop, true), btn('Reset', () => setTool('pcrop')), tip('Drag the four corners onto the edges of the slanted object, then Enter'));
  else if (t === 'ruler') {
    const r = D?.ruler; const info = r ? `X ${Math.round(r.x1)}  Y ${Math.round(r.y1)}   W ${Math.round(r.x2 - r.x1)}  H ${Math.round(r.y2 - r.y1)}   A ${rulerAngle().toFixed(1)}°   L ${Math.hypot(r.x2 - r.x1, r.y2 - r.y1).toFixed(1)} px` : 'Drag to measure distance and angle';
    ob.append(h('span', { class: 'mono', id: 'rulerInfo' }, info), r ? btn('Straighten layer', straightenFromRuler) : '', r ? btn('Clear', () => { D.ruler = null; renderOptions(); drawOverlay(); }) : '');
  }
  else if (t === 'note') ob.append(tip('Click to add a note · click a note to edit it'), btn('Show / hide notes', () => { O.showNotes = !O.showNotes; drawOverlay(); }), D?.notes?.length ? btn('Delete all notes', () => { D.notes = []; drawOverlay(); }) : '');
  else if (t === 'move') { ob.append(chk('Auto-select layer', 'autoSelect'), chk('Snap', 'snap'), chk('Smart guides', 'smartGuides'), vsep(), btn('Free transform (Ctrl+T)', startTransform), vsep(), ...['alignL', 'alignC', 'alignR', 'alignT', 'alignM', 'alignB'].map(a => h('button', { class: 'icon-btn', 'data-tip': 'Align layer to canvas', html: icon(a), onclick: () => alignLayer(a) })));
    if (T) ob.append(vsep(), btn('✓ Commit', commitTransform, true), btn('Cancel', cancelTransform), tip('Shift = keep proportions · drag outside to rotate')); }
  else if (t === 'eyedrop') ob.append(chk('Sample all layers', 'sampleAll'), tip('Click to set foreground · Alt+click for background'));
  else ob.append(tip(TOOLDEF[t][1]));
}
function fitCropToRatio() { if (!cropState || !D) return; const r = cropRatioValue(); if (!r) return drawOverlay(); let w = cropState.w, hh = w / r; if (hh > D.h) { hh = D.h; w = hh * r; } if (w > D.w) { w = D.w; hh = w / r; } cropState = { x: (D.w - w) / 2, y: (D.h - hh) / 2, w, h: hh }; drawOverlay(); }

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
const rulerH = h('canvas', { class: 'ruler rh' }), rulerV = h('canvas', { class: 'ruler rv' }), rulerC = h('div', { class: 'ruler rc', 'data-tip': 'Rulers — drag from a ruler to create a guide' });
vpEl.append(rulerH, rulerV, rulerC);
function applyView() {
  if (!D) return;
  wrap.style.transform = `translate(${D.px}px,${D.py}px) scale(${D.zoom})`;
  vpEl.classList.toggle('pixelated', O.pixel && D.zoom >= 2);
  $('#stZoom').textContent = Math.round(D.zoom * 1000) / 10 + '%';
  drawOverlay(); drawRulers();
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
UI.shortcut('ctrl+r', toggleRulers); UI.shortcut('ctrl+;', () => { O.showGuides = !O.showGuides; drawOverlay(); }); UI.shortcut('ctrl+shift+;', () => { O.snap = !O.snap; toast('Snap ' + (O.snap ? 'on' : 'off')); }); UI.shortcut('ctrl+shift+:', () => { O.snap = !O.snap; toast('Snap ' + (O.snap ? 'on' : 'off')); });
vpEl.addEventListener('wheel', e => {
  if (!D) return; e.preventDefault();
  const r = vpEl.getBoundingClientRect();
  if (e.ctrlKey || e.altKey) setZoom(D.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX - r.left, e.clientY - r.top);
  else { D.px -= e.shiftKey ? e.deltaY : e.deltaX; D.py -= e.shiftKey ? 0 : e.deltaY; applyView(); }
}, { passive: false });
new ResizeObserver(() => { const r = vpEl.getBoundingClientRect(); overlay.width = r.width * devicePixelRatio; overlay.height = r.height * devicePixelRatio; overlay.style.width = r.width + 'px'; overlay.style.height = r.height + 'px'; drawOverlay(); drawRulers(); }).observe(vpEl);
function toDoc(e) { const r = vpEl.getBoundingClientRect(); return [(e.clientX - r.left - D.px) / D.zoom, (e.clientY - r.top - D.py) / D.zoom]; }
function toScreen(x, y) { return [x * D.zoom + D.px, y * D.zoom + D.py]; }
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || getComputedStyle(document.body).getPropertyValue(n).trim();

// ---------- rulers & guides
function toggleRulers() { O.showRulers = !O.showRulers; vpEl.classList.toggle('with-rulers', O.showRulers); drawRulers(); }
function drawRulers() {
  if (!O.showRulers || !D) return; const RS = 20, dpr = devicePixelRatio, r = vpEl.getBoundingClientRect();
  const bg = cssVar('--bg-2'), tx = cssVar('--tx-2'), ln = cssVar('--line-2');
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000]; const step = steps.find(s => s * D.zoom >= 60) || 10000;
  [[rulerH, r.width, RS, true], [rulerV, RS, r.height, false]].forEach(([cv, w, hh, horiz]) => {
    cv.width = w * dpr; cv.height = hh * dpr; cv.style.width = w + 'px'; cv.style.height = hh + 'px';
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = bg; c.fillRect(0, 0, w, hh); c.strokeStyle = ln; c.fillStyle = tx; c.font = '9px ' + (cssVar('--font') || 'sans-serif'); c.lineWidth = 1;
    const len = horiz ? w : hh, off = horiz ? D.px : D.py; const first = Math.floor(-off / D.zoom / step) * step;
    c.beginPath();
    for (let v = first; v * D.zoom + off < len; v += step / 5) { const s = Math.round(v * D.zoom + off) + 0.5; const major = Math.abs(v / step - Math.round(v / step)) < 1e-6; const tl = major ? RS : RS * 0.3; if (horiz) { c.moveTo(s, RS); c.lineTo(s, RS - tl); } else { c.moveTo(RS, s); c.lineTo(RS - tl, s); } if (major) { if (horiz) c.fillText(String(Math.round(v)), s + 2, 9); else { c.save(); c.translate(9, s + 2); c.rotate(-Math.PI / 2); c.textAlign = 'right'; c.fillText(String(Math.round(v)), 0, 0); c.restore(); } } }
    c.moveTo(horiz ? 0 : RS - 0.5, horiz ? RS - 0.5 : 0); c.lineTo(horiz ? w : RS - 0.5, horiz ? RS - 0.5 : hh); c.stroke();
    if (cursorPos) { const s = horiz ? cursorPos[0] * D.zoom + D.px : cursorPos[1] * D.zoom + D.py; c.strokeStyle = cssVar('--accent') || '#31a8ff'; c.beginPath(); if (horiz) { c.moveTo(s, 0); c.lineTo(s, RS); } else { c.moveTo(0, s); c.lineTo(RS, s); } c.stroke(); }
  });
}
let guideDrag = null;
[[rulerH, 'h'], [rulerV, 'v']].forEach(([el, o]) => el.addEventListener('pointerdown', e => { if (!D) return; e.stopPropagation(); el.setPointerCapture(e.pointerId); const [x, y] = toDoc(e); guideDrag = { o, p: o === 'h' ? y : x, isNew: true }; if (!O.showGuides) O.showGuides = true; drawOverlay(); }));
[rulerH, rulerV].forEach(el => { el.addEventListener('pointermove', e => { if (guideDrag) { const [x, y] = toDoc(e); guideDrag.p = Math.round(guideDrag.o === 'h' ? y : x); drawOverlay(); } }); el.addEventListener('pointerup', e => finishGuideDrag(e)); });
function finishGuideDrag(e) {
  if (!guideDrag) return; const g = guideDrag; guideDrag = null; const r = vpEl.getBoundingClientRect(), RS = O.showRulers ? 20 : 0;
  const overRuler = g.o === 'h' ? e.clientY - r.top < RS : e.clientX - r.left < RS;
  const outside = g.p < -1 || g.p > (g.o === 'h' ? D.h : D.w) + 1;
  if (!overRuler && !outside) { if (g.guide) g.guide.p = g.p; else D.guides.push({ o: g.o, p: g.p }); } else if (g.guide) D.guides = D.guides.filter(x => x !== g.guide);
  drawOverlay();
}
function guideAt(x, y) { if (!O.showGuides || O.lockGuides) return null; const tol = 4 / D.zoom; return (D.guides || []).find(g => Math.abs((g.o === 'h' ? y : x) - g.p) < tol) || null; }
async function newGuideDialog() { const v = await form({ title: 'New guide', fields: [{ key: 'o', label: 'Orientation', type: 'select', value: 'v', options: [{ value: 'v', label: 'Vertical' }, { value: 'h', label: 'Horizontal' }] }, { key: 'p', label: 'Position (px)', type: 'number', value: 0 }, { key: 'pct', label: 'Position is a percentage', type: 'checkbox', value: false }] }); if (!v) return; const p = v.pct ? (v.o === 'h' ? D.h : D.w) * v.p / 100 : v.p; D.guides.push({ o: v.o, p: Math.round(p) }); O.showGuides = true; drawOverlay(); }
async function gridDialog() { const v = await form({ title: 'Grid', fields: [{ key: 's', label: 'Gridline every (px, 0 = automatic)', type: 'number', value: O.gridSize }, { key: 'on', label: 'Show grid', type: 'checkbox', value: O.showGrid }] }); if (!v) return; O.gridSize = Math.max(0, +v.s); O.showGrid = v.on; drawOverlay(); }
const gridStep = () => O.gridSize > 0 ? O.gridSize : Math.max(10, Math.round(Math.min(D.w, D.h) / 12 / 10) * 10);

// ---------- snapping & smart guides
let smartLines = [];
function snapTargets(axis, exclude) {
  const t = [0, axis === 'x' ? D.w / 2 : D.h / 2, axis === 'x' ? D.w : D.h];
  if (O.showGuides) (D.guides || []).forEach(g => { if ((g.o === 'v') === (axis === 'x')) t.push(g.p); });
  if (O.smartGuides) D.layers.forEach(L => { if (L === exclude || !L.visible || L.kind === 'adjust') return; const b = layerBounds(L); if (!b) return; if (axis === 'x') t.push(b.x, b.x + b.w / 2, b.x + b.w); else t.push(b.y, b.y + b.h / 2, b.y + b.h); });
  return t;
}
function snapValue(v, axis, exclude) { if (!O.snap || !D) return v; const tol = 7 / D.zoom; let best = null; for (const t of snapTargets(axis, exclude)) { const d = Math.abs(t - v); if (d < tol && (!best || d < best.d)) best = { d, t }; } if (O.showGrid) { const s = gridStep(), g = Math.round(v / s) * s; if (Math.abs(g - v) < tol && (!best || Math.abs(g - v) < best.d)) best = { d: Math.abs(g - v), t: g }; } return best ? best.t : v; }
const snapPt = (x, y, ex) => [snapValue(x, 'x', ex), snapValue(y, 'y', ex)];
// snap a moving box (edges & centre) — returns corrected [dx,dy] and fills smartLines
function snapBox(b, dx, dy, exclude) {
  smartLines = []; if (!O.snap) return [dx, dy]; const tol = 7 / D.zoom;
  const solve = (axis, pos, size, d) => { const cand = [pos + d, pos + d + size / 2, pos + d + size]; let best = null; for (const t of snapTargets(axis, exclude)) cand.forEach((c, k) => { const e = Math.abs(t - c); if (e < tol && (!best || e < best.e)) best = { e, corr: t - c, t }; }); if (best) { smartLines.push({ axis, p: best.t }); return d + best.corr; } return d; };
  return [solve('x', b.x, b.w, dx), solve('y', b.y, b.h, dy)];
}
const boundsCache = new WeakMap();
function layerBounds(L) { if (L.kind === 'adjust') return null; const k = cid(L.canvas) + ':' + contentSerial; let c = boundsCache.get(L); if (!c || c.k !== k) { c = { k, b: alphaBounds(L.canvas) }; boundsCache.set(L, c); } return c.b ? { x: c.b.x + L.x, y: c.b.y + L.y, w: c.b.w, h: c.b.h } : null; }

// =====================================================================  compositing
let renderQueued = false, stroke = null, T = null, cropState = null, pcropState = null, shapePreview = null, gradPreview = null, lassoPts = null, marqRect = null, liveLayer = null, patchDrag = null;
let contentSerial = 1, pcache = null, workC = null, liveTmp = null;
function requestRender(bump = true) { if (bump && !(stroke || T || liveLayer)) contentSerial++; if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => { renderQueued = false; render(); }); }
let proxyUntil = 0, proxyTimer = null;
// while sliders are dragged on big images, render a reduced-resolution proxy and refine when idle
function proxyRender() { if (!D || D.w * D.h <= 3e6) return requestRender(); proxyUntil = performance.now() + 350; requestRender(); clearTimeout(proxyTimer); proxyTimer = setTimeout(() => { proxyUntil = 0; requestRender(false); }, 380); }
function render() {
  if (!D) return;
  const proxy = performance.now() < proxyUntil, s = proxy ? Math.min(1, Math.sqrt(2e6 / (D.w * D.h))) : 1, cw = Math.max(1, Math.round(D.w * s)), ch = Math.max(1, Math.round(D.h * s));
  if (display.width !== cw || display.height !== ch) { display.width = cw; display.height = ch; }
  if (wrap.style.width !== D.w + 'px' || wrap.style.height !== D.h + 'px') { wrap.style.width = D.w + 'px'; wrap.style.height = D.h + 'px'; display.style.width = D.w + 'px'; display.style.height = D.h + 'px'; }
  const c = display.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cw, ch);
  const li = livePivot(), needCPU = D.layers.some((l, i) => l.kind === 'adjust' && l.visible && i >= Math.max(0, li));
  if (needCPU) {
    if (!workC || workC.width !== cw || workC.height !== ch) workC = mk(cw, ch);
    const wc = ctxOf(workC); wc.setTransform(1, 0, 0, 1, 0, 0); wc.clearRect(0, 0, cw, ch); wc.setTransform(s, 0, 0, s, 0, 0); compositeTo(wc, { live: true, scale: s }); c.drawImage(workC, 0, 0);
  } else { c.setTransform(s, 0, 0, s, 0, 0); compositeTo(c, { live: true, scale: s }); }
  $('#stSize').textContent = `${D.w} × ${D.h} px` + (proxy ? ' · preview' : '');
  updateTaskBar();
}
function maskAlpha(L) {
  if (!L.mask) return null;
  if (L._maskA && L._maskV === L.maskVer && L._maskC === cid(L.mask)) return L._maskA;
  const m = L.mask, a = mk(m.width, m.height); const src = ctxOf(m).getImageData(0, 0, m.width, m.height); const d = src.data;
  for (let i = 0; i < d.length; i += 4) { d[i + 3] = d[i]; d[i] = d[i + 1] = d[i + 2] = 0; }
  a.getContext('2d').putImageData(src, 0, 0); L._maskA = a; L._maskV = L.maskVer; L._maskC = cid(L.mask); return a;
}
function layerSig(L) { return `${L.id}|${L.kind}|${L.visible}|${L.opacity}|${L.blend}|${L.x}|${L.y}|${cid(L.canvas)}|${L.mask ? cid(L.mask) + ':' + L.maskVer : ''}|${fxKeyOf(L)}|${L.adj ? JSON.stringify(L.adj) : ''}`; }
function fxKeyOf(L) { const f = L.fx; if (!f) return ''; const k = Object.keys(f).filter(x => f[x]); return k.length ? JSON.stringify(f) : ''; }
function activeFx(L) { const f = L.fx || {}, o = {}; for (const k of Object.keys(f)) if (f[k] && FX_DEF[k]) o[k] = { ...FX_DEF[k], ...f[k] }; return o; }
function layerRender(L, live) {
  // returns {canvas, x, y} with stroke/mask/fx applied
  let src = L.canvas, ox = L.x, oy = L.y;
  const fx = activeFx(L), hasFx = Object.keys(fx).length > 0;
  const liveHere = live && ((stroke && stroke.layer === L) || (T && T.layer === L));
  const needTemp = liveHere || L.mask || hasFx;
  if (!needTemp) return { canvas: src, x: ox, y: oy };
  let key = null;
  if (hasFx && !liveHere) { key = contentSerial + '|' + D.w + 'x' + D.h + '|' + layerSig(L); if (L._fxc && L._fxc.key === key) return { canvas: L._fxc.canvas, x: 0, y: 0 }; }
  let tmp, tc;
  if (liveHere && !hasFx) { if (!liveTmp || liveTmp.width !== D.w || liveTmp.height !== D.h) liveTmp = mk(D.w, D.h); tmp = liveTmp; tc = tmp.getContext('2d'); tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, D.w, D.h); }
  else { tmp = mk(D.w, D.h); tc = ctxOf(tmp); }
  tc.drawImage(src, ox, oy);
  if (live && stroke && stroke.layer === L && !stroke.direct && !stroke.onMask && !stroke.maskOnly) {
    tc.save(); tc.globalAlpha = stroke.opacity; tc.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over'; tc.drawImage(stroke.buf, 0, 0); tc.restore();
  }
  if (live && T && T.layer === L) drawTransformed(tc, T);
  if (L.mask) {
    let ma = maskAlpha(L);
    if (live && stroke && stroke.layer === L && stroke.onMask) { const mm = cloneCanvas(L.mask); const mc = mm.getContext('2d'); mc.globalAlpha = stroke.opacity; mc.drawImage(stroke.buf, -L.x, -L.y); ma = maskAlpha({ mask: mm, maskVer: Math.random() }); }
    tc.globalCompositeOperation = 'destination-in'; tc.drawImage(ma, L.x, L.y); tc.globalCompositeOperation = 'source-over';
  }
  if (hasFx) tmp = renderFx(tmp, fx);
  if (key) L._fxc = { key, canvas: tmp };
  return { canvas: tmp, x: 0, y: 0 };
}
const hexA = (hx, a) => { const [r, g, b] = hexToRgb(hx); return `rgba(${r},${g},${b},${a})`; };
function livePivot() { const L = stroke ? stroke.layer : T ? T.layer : liveLayer; return L ? D.layers.indexOf(L) : -1; }
function compositeTo(c, { live = false, only = null, scale = 1 } = {}) {
  let start = 0;
  if (live && !only) {
    const li = livePivot();
    if (li > 0) {
      const W = Math.round(D.w * scale), H = Math.round(D.h * scale);
      const key = contentSerial + '#' + W + 'x' + H + '#' + D.layers.slice(0, li).map(layerSig).join(';');
      if (!pcache || pcache.key !== key) { const cc = mk(W, H), x = ctxOf(cc); x.setTransform(scale, 0, 0, scale, 0, 0); compositeRange(x, 0, li, false, null, scale); const g = mk(W, H); g.getContext('2d').drawImage(cc, 0, 0); pcache = { key, canvas: g }; }
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(pcache.canvas, 0, 0); c.restore(); start = li;
    }
  }
  compositeRange(c, start, D.layers.length, live, only, scale);
}
function compositeRange(c, a, b, live, only, scale = 1) {
  for (let i = a; i < b; i++) {
    const L = D.layers[i];
    if (only && only !== L) continue; if (!L.visible && only !== L) continue;
    if (L.kind === 'adjust') { if (!only) applyAdjustLayer(c, L, live, scale); continue; }
    const r = layerRender(L, live);
    c.save(); c.globalAlpha = L.opacity; c.globalCompositeOperation = L.blend; c.drawImage(r.canvas, r.x, r.y); c.restore();
  }
}
function maskBytes(L, live, W = D.w, H = D.h) {
  if (!L.mask) return null;
  const liveMask = live && stroke && stroke.layer === L && stroke.onMask, k = W / D.w;
  const key = cid(L.mask) + ':' + L.maskVer + ':' + L.x + ':' + L.y + ':' + W + 'x' + H;
  if (!liveMask && L._mb && L._mb.key === key) return L._mb.data;
  const c = mk(W, H), x = ctxOf(c); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.setTransform(k, 0, 0, k, 0, 0); x.clearRect(L.x, L.y, L.mask.width, L.mask.height); x.drawImage(L.mask, L.x, L.y);
  if (liveMask) { x.save(); x.globalAlpha = stroke.opacity; x.drawImage(stroke.buf, 0, 0); x.restore(); }
  const d = x.getImageData(0, 0, W, H).data, out = new Uint8Array(W * H); for (let i = 0; i < out.length; i++) out[i] = d[i * 4];
  if (!liveMask) L._mb = { key, data: out }; return out;
}
function applyAdjustLayer(c, L, live, scale = 1) {
  const A = ADJ_BY_ID[L.adj?.type]; if (!A) return;
  const W = c.canvas.width, H = c.canvas.height, img = c.getImageData(0, 0, W, H), orig = new Uint8ClampedArray(img.data);
  try { A.fn(img, L.adj.params, { scale: W / D.w, layer: true }); } catch (e) { console.error(e); return; }
  const d = img.data, op = L.opacity, m = maskBytes(L, live, W, H);
  if (!L.blend || L.blend === 'source-over') {
    for (let i = 0, p = 0; i < d.length; i += 4, p++) { const k = m ? op * m[p] / 255 : op; d[i + 3] = orig[i + 3]; if (k >= 1) continue; d[i] = orig[i] + (d[i] - orig[i]) * k; d[i + 1] = orig[i + 1] + (d[i + 1] - orig[i + 1]) * k; d[i + 2] = orig[i + 2] + (d[i + 2] - orig[i + 2]) * k; }
    c.putImageData(img, 0, 0);
  } else {
    for (let i = 0, p = 0; i < d.length; i += 4, p++) d[i + 3] = orig[i + 3] * (m ? m[p] / 255 : 1);
    const t = mk(W, H); ctxOf(t).putImageData(img, 0, 0); c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = op; c.globalCompositeOperation = L.blend; c.drawImage(t, 0, 0); c.restore();
  }
}
function flattenCanvas() { const c = mk(D.w, D.h); compositeTo(ctxOf(c)); return c; }
// composite of all layers below index i (used to stamp adjustment layers)
function compositeBelow(i) { const c = mk(D.w, D.h); compositeRange(ctxOf(c), 0, i, false, null); return c; }
// cheap reduced-size composite of layers [0, upTo) for thumbnails / histograms
function smallComposite(upTo = D.layers.length, maxDim = 200) { const k = Math.min(1, maxDim / Math.max(D.w, D.h)), c = mk(Math.max(1, Math.round(D.w * k)), Math.max(1, Math.round(D.h * k))), x = ctxOf(c); x.setTransform(k, 0, 0, k, 0, 0); compositeRange(x, 0, upTo, false, null, k); return c; }

// =====================================================================  layer styles renderer
const FX_LIST = [['shadow', 'Drop shadow'], ['innerShadow', 'Inner shadow'], ['glow', 'Outer glow'], ['innerGlow', 'Inner glow'], ['stroke', 'Stroke'], ['colorOverlay', 'Color overlay'], ['gradOverlay', 'Gradient overlay'], ['patternOverlay', 'Pattern overlay'], ['bevel', 'Bevel & emboss']];
const FX_DEF = {
  shadow: { color: '#000000', opacity: 0.6, angle: 120, distance: 10, spread: 0, size: 14 },
  innerShadow: { color: '#000000', opacity: 0.6, angle: 120, distance: 6, choke: 0, size: 10, blend: 'multiply' },
  glow: { color: '#ffee88', opacity: 0.8, spread: 0, size: 20 },
  innerGlow: { color: '#ffffbe', opacity: 0.75, choke: 0, size: 12, blend: 'screen', source: 'edge' },
  stroke: { color: '#000000', size: 3, pos: 'outside', opacity: 1 },
  colorOverlay: { color: '#ff3b3b', opacity: 1, blend: 'source-over' },
  gradOverlay: { stops: [[0, '#000000', 1], [1, '#ffffff', 1]], angle: 90, style: 'linear', scale: 100, opacity: 1, blend: 'source-over', reverse: false },
  patternOverlay: { pattern: 0, scale: 1, opacity: 1, blend: 'source-over' },
  bevel: { depth: 100, size: 8, soften: 1, angle: 120, altitude: 30, hl: '#ffffff', hlo: 0.75, sh: '#000000', sho: 0.6, dir: 'up' },
};
function fxMargin(fx) { let m = 2; if (fx.shadow) m = Math.max(m, fx.shadow.distance + fx.shadow.size * 1.6 + 4); if (fx.glow) m = Math.max(m, fx.glow.size * 1.6 + 4); if (fx.stroke && fx.stroke.pos !== 'inside') m = Math.max(m, fx.stroke.size + 4); return Math.ceil(m); }
function gradLutRGBA(stops, reverse) {
  const s = [...stops].map(([p, c, a]) => [reverse ? 1 - p : p, hexToRgb(c), a ?? 1]).sort((a, b) => a[0] - b[0]); const L = new Float32Array(256 * 4);
  for (let i = 0; i < 256; i++) { const t = i / 255; let k = 0; while (k < s.length - 2 && t > s[k + 1][0]) k++; const a = s[k], b = s[Math.min(k + 1, s.length - 1)]; let f = b[0] > a[0] ? clamp((t - a[0]) / (b[0] - a[0]), 0, 1) : 0; if (t <= s[0][0]) f = 0; for (let c = 0; c < 3; c++) L[i * 4 + c] = a[1][c] + (b[1][c] - a[1][c]) * f; L[i * 4 + 3] = a[2] + (b[2] - a[2]) * f; }
  return L;
}
function renderFx(src, fx) {
  const b = alphaBounds(src); if (!b) return src;
  const m = fxMargin(fx), x0 = Math.max(0, b.x - m), y0 = Math.max(0, b.y - m), x1 = Math.min(D.w, b.x + b.w + m), y1 = Math.min(D.h, b.y + b.h + m), rw = x1 - x0, rh = y1 - y0, n = rw * rh;
  const sd = ctxOf(src).getImageData(x0, y0, rw, rh).data, A = new Float32Array(n); for (let i = 0; i < n; i++) A[i] = sd[i * 4 + 3] / 255;
  const out = mk(D.w, D.h), oc = out.getContext('2d');
  let dOut = null, dIn = null; const getOut = () => dOut || (dOut = X.distanceTo(rw, rh, i => A[i] >= 0.5)), getIn = () => dIn || (dIn = X.distanceTo(rw, rh, i => A[i] < 0.5));
  const paint = (alpha, color, opacity, blend) => {
    const id = new ImageData(rw, rh), d = id.data; let fill = null; const rgb = typeof color === 'string' ? hexToRgb(color) : null; if (!rgb) fill = color;
    for (let i = 0; i < n; i++) { const a = alpha[i]; if (a <= 0.002) continue; const j = i * 4; if (rgb) { d[j] = rgb[0]; d[j + 1] = rgb[1]; d[j + 2] = rgb[2]; d[j + 3] = Math.min(1, a) * opacity * 255; } else { const f = fill(i); d[j] = f[0]; d[j + 1] = f[1]; d[j + 2] = f[2]; d[j + 3] = Math.min(1, a) * opacity * (f[3] ?? 1) * 255; } }
    const c = mk(rw, rh); c.getContext('2d').putImageData(id, 0, 0); oc.save(); oc.globalCompositeOperation = blend || 'source-over'; oc.drawImage(c, x0, y0); oc.restore();
  };
  const shifted = (arr, dx, dy, outside) => { const s = new Float32Array(n); for (let y = 0; y < rh; y++) { const sy = y - dy; for (let x = 0; x < rw; x++) { const sx = x - dx; s[y * rw + x] = sx < 0 || sy < 0 || sx >= rw || sy >= rh ? outside : arr[sy * rw + sx]; } } return s; };
  // ---- effects below the content
  if (fx.shadow) { const s = fx.shadow, a = s.angle * Math.PI / 180; const S = shifted(A, Math.round(-Math.cos(a) * s.distance), Math.round(Math.sin(a) * s.distance), 0); X.gaussChan(S, rw, rh, Math.max(0.01, s.size / 2)); const sp = 1 / Math.max(0.05, 1 - (s.spread || 0) / 100 * 0.95); if (sp !== 1) for (let i = 0; i < n; i++) S[i] = Math.min(1, S[i] * sp); paint(S, s.color, s.opacity); }
  if (fx.glow) { const s = fx.glow, G = new Float32Array(A); X.gaussChan(G, rw, rh, Math.max(0.01, s.size / 2)); const sp = 1 / Math.max(0.05, 1 - (s.spread || 0) / 100 * 0.95) * 1.6; for (let i = 0; i < n; i++) G[i] = Math.min(1, G[i] * sp); paint(G, s.color, s.opacity); }
  if (fx.stroke && fx.stroke.pos !== 'inside') { const s = fx.stroke, sz = s.pos === 'center' ? s.size / 2 : s.size, d = getOut(), S = new Float32Array(n); for (let i = 0; i < n; i++) S[i] = clamp(sz - d[i] + 0.5, 0, 1); paint(S, s.color, s.opacity); }
  oc.drawImage(src, 0, 0);
  // ---- overlays (clipped to the content)
  if (fx.patternOverlay) { const s = fx.patternOverlay, pc = patternCanvas(s.pattern), pw = pc.width, ph = pc.height, pd = ctxOf(pc).getImageData(0, 0, pw, ph).data, sc = Math.max(0.05, s.scale || 1); paint(A, i => { const x = (i % rw) + x0, y = ((i / rw) | 0) + y0, px = ((Math.floor(x / sc) % pw) + pw) % pw, py = ((Math.floor(y / sc) % ph) + ph) % ph, j = (py * pw + px) * 4; return [pd[j], pd[j + 1], pd[j + 2], pd[j + 3] / 255]; }, s.opacity, s.blend); }
  if (fx.gradOverlay) { const s = fx.gradOverlay, L = gradLutRGBA(s.stops, s.reverse), a = s.angle * Math.PI / 180, ca = Math.cos(a), sa = -Math.sin(a), cx = b.x + b.w / 2 - x0, cy = b.y + b.h / 2 - y0, ext = (Math.abs(b.w * ca) + Math.abs(b.h * sa)) / 2 * (s.scale / 100) || 1, rad = Math.hypot(b.w, b.h) / 2 * (s.scale / 100) || 1;
    paint(A, i => { const x = i % rw - cx, y = ((i / rw) | 0) - cy; const t = s.style === 'radial' ? Math.hypot(x, y) / rad : (x * ca + y * sa) / ext * 0.5 + 0.5; const k = clamp(Math.round(t * 255), 0, 255) * 4; return [L[k], L[k + 1], L[k + 2], L[k + 3]]; }, s.opacity, s.blend); }
  if (fx.colorOverlay) { const s = fx.colorOverlay; paint(A, s.color, s.opacity, s.blend); }
  if (fx.innerGlow) { const s = fx.innerGlow, d = getIn(), G = new Float32Array(n), ch = s.size * (s.choke || 0) / 100; for (let i = 0; i < n; i++) { if (A[i] <= 0) continue; const t = clamp((d[i] - ch) / Math.max(0.5, s.size - ch), 0, 1); G[i] = A[i] * (s.source === 'center' ? t : 1 - t * t * (3 - 2 * t)); } paint(G, s.color, s.opacity, s.blend || 'screen'); }
  if (fx.innerShadow) { const s = fx.innerShadow, a = s.angle * Math.PI / 180, inv = new Float32Array(n); for (let i = 0; i < n; i++) inv[i] = 1 - A[i]; const S = shifted(inv, Math.round(-Math.cos(a) * s.distance), Math.round(Math.sin(a) * s.distance), 1); X.gaussChan(S, rw, rh, Math.max(0.01, s.size / 2)); const sp = 1 / Math.max(0.05, 1 - (s.choke || 0) / 100 * 0.95); for (let i = 0; i < n; i++) S[i] = Math.min(1, S[i] * sp) * A[i]; paint(S, s.color, s.opacity, s.blend || 'multiply'); }
  if (fx.bevel) {
    const s = fx.bevel, d = getIn(), H = new Float32Array(n), sz = Math.max(1, s.size), dir = s.dir === 'down' ? -1 : 1;
    for (let i = 0; i < n; i++) if (A[i] > 0) { const t = clamp(d[i] / sz, 0, 1); H[i] = Math.sin(t * Math.PI / 2) * A[i]; }
    if (s.soften > 0) X.gaussChan(H, rw, rh, s.soften);
    const az = s.angle * Math.PI / 180, al = s.altitude * Math.PI / 180, lx = Math.cos(az) * Math.cos(al), ly = -Math.sin(az) * Math.cos(al), lz = Math.sin(al), k = (s.depth / 100) * sz * 0.5 * dir;
    const HL = new Float32Array(n), SH = new Float32Array(n);
    for (let y = 1; y < rh - 1; y++) for (let x = 1; x < rw - 1; x++) { const i = y * rw + x; if (A[i] <= 0) continue; const gx = (H[i + 1] - H[i - 1]) * k, gy = (H[i + rw] - H[i - rw]) * k, inv = 1 / Math.sqrt(gx * gx + gy * gy + 1); const shade = (-gx * lx - gy * ly + lz) * inv - lz; if (shade > 0) HL[i] = Math.min(1, shade * 2.2) * A[i]; else SH[i] = Math.min(1, -shade * 2.2) * A[i]; }
    paint(HL, s.hl, s.hlo, 'screen'); paint(SH, s.sh, s.sho, 'multiply');
  }
  if (fx.stroke && fx.stroke.pos !== 'outside') { const s = fx.stroke, sz = s.pos === 'center' ? s.size / 2 : s.size, d = getIn(), S = new Float32Array(n); for (let i = 0; i < n; i++) S[i] = A[i] * clamp(sz - d[i] + 0.5, 0, 1); paint(S, s.color, s.opacity); }
  return out;
}

// =====================================================================  patterns
const PATTERNS = [];
function builtinPatterns() {
  const make = (name, w, hh, fn) => { const c = mk(w, hh), x = c.getContext('2d'); fn(x, w, hh); PATTERNS.push({ name, canvas: c }); };
  make('Checker', 32, 32, (x) => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, 32, 32); x.fillStyle = '#c8c8c8'; x.fillRect(0, 0, 16, 16); x.fillRect(16, 16, 16, 16); });
  make('Polka dots', 24, 24, (x) => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, 24, 24); x.fillStyle = '#e0457b'; x.beginPath(); x.arc(6, 6, 4, 0, 7); x.arc(18, 18, 4, 0, 7); x.fill(); });
  make('Stripes', 20, 20, (x) => { x.fillStyle = '#1e3a8a'; x.fillRect(0, 0, 20, 20); x.strokeStyle = '#facc15'; x.lineWidth = 5; x.beginPath(); for (let k = -20; k < 40; k += 10) { x.moveTo(k, 20); x.lineTo(k + 20, 0); } x.stroke(); });
  make('Grid', 24, 24, (x) => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, 24, 24); x.strokeStyle = '#7aa7ff'; x.strokeRect(0.5, 0.5, 24, 24); });
  make('Bricks', 48, 24, (x) => { x.fillStyle = '#9a3412'; x.fillRect(0, 0, 48, 24); x.strokeStyle = '#e7d3c0'; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 1); x.lineTo(48, 1); x.moveTo(0, 13); x.lineTo(48, 13); x.moveTo(1, 1); x.lineTo(1, 13); x.moveTo(25, 1); x.lineTo(25, 13); x.moveTo(13, 13); x.lineTo(13, 24); x.moveTo(37, 13); x.lineTo(37, 24); x.stroke(); });
  make('Noise', 64, 64, (x) => { const id = x.createImageData(64, 64), R = X.rng(9); for (let i = 0; i < id.data.length; i += 4) { const v = 110 + R() * 110; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; } x.putImageData(id, 0, 0); });
  make('Hexagons', 30, 52, (x) => { x.fillStyle = '#0f766e'; x.fillRect(0, 0, 30, 52); x.strokeStyle = '#99f6e4'; x.lineWidth = 2; const hx = (cx, cy) => { x.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k + Math.PI / 6; const px = cx + Math.cos(a) * 17, py = cy + Math.sin(a) * 17; k ? x.lineTo(px, py) : x.moveTo(px, py); } x.closePath(); x.stroke(); }; hx(0, 0); hx(30, 0); hx(15, 26); hx(0, 52); hx(30, 52); });
  make('Paper', 96, 96, (x) => { const id = x.createImageData(96, 96), N = X.valueNoise2D(4); for (let y = 0; y < 96; y++) for (let k = 0; k < 96; k++) { const v = 225 + X.fbm(N, k / 12, y / 12, 4) * 30; const j = (y * 96 + k) * 4; id.data[j] = v; id.data[j + 1] = v - 4; id.data[j + 2] = v - 12; id.data[j + 3] = 255; } x.putImageData(id, 0, 0); });
}
builtinPatterns();
const patternCanvas = i => (PATTERNS[i] || PATTERNS[0]).canvas;
function patternSelect(value = O.pattern, onchange = v => { O.pattern = v; }) { const s = h('select', {}, ...PATTERNS.map((p, i) => h('option', { value: i, selected: +value === i }, p.name))); s.onchange = () => onchange(+s.value); return s; }
async function definePattern() {
  if (!D) return; const L = AL(); const r = extractSel(L, L?.kind === 'adjust'); if (!r) return toast('Nothing to define');
  const name = await prompt('Define pattern', 'Pattern name', 'Pattern ' + (PATTERNS.length + 1)); if (!name) return;
  let c = r.canvas; if (c.width > 1024 || c.height > 1024) { const k = 1024 / Math.max(c.width, c.height), n = mk(c.width * k, c.height * k); n.getContext('2d').drawImage(c, 0, 0, n.width, n.height); c = n; }
  PATTERNS.push({ name, canvas: c }); O.pattern = PATTERNS.length - 1; renderOptions(); toast('Pattern defined — use it with the Pattern stamp or Pattern overlay', 'ok');
}

// =====================================================================  overlay (selection ants, guides, cursors)
let antsPhase = 0;
setInterval(() => { if (D?.selPath) { antsPhase = (antsPhase + 1) % 8; drawOverlay(); } }, 120);
let cursorPos = null;
function drawOverlay() {
  const c = overlay.getContext('2d'); const dpr = devicePixelRatio; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, overlay.width, overlay.height);
  if (!D) { updateTaskBar(); return; }
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const z = D.zoom, vw = overlay.width / dpr, vh = overlay.height / dpr;
  const docT = () => c.setTransform(dpr * z, 0, 0, dpr * z, dpr * D.px, dpr * D.py);
  if (O.showGrid) { docT(); c.strokeStyle = 'rgba(79,140,255,.35)'; c.lineWidth = 1 / z; const step = gridStep(); c.beginPath(); for (let x = step; x < D.w; x += step) { c.moveTo(x, 0); c.lineTo(x, D.h); } for (let y = step; y < D.h; y += step) { c.moveTo(0, y); c.lineTo(D.w, y); } c.stroke(); }
  if (z >= 8 && O.pixel) { docT(); c.strokeStyle = 'rgba(128,128,128,.25)'; c.lineWidth = 1 / z; const [x0, y0] = [Math.max(0, Math.floor(-D.px / z)), Math.max(0, Math.floor(-D.py / z))]; const x1 = Math.min(D.w, x0 + vw / z + 1), y1 = Math.min(D.h, y0 + vh / z + 1); c.beginPath(); for (let x = x0; x <= x1; x++) { c.moveTo(x, y0); c.lineTo(x, y1); } for (let y = y0; y <= y1; y++) { c.moveTo(x0, y); c.lineTo(x1, y); } c.stroke(); }
  // heal / remove stroke mask preview
  if (stroke && stroke.maskOnly) { docT(); c.save(); c.globalAlpha = 0.45; c.drawImage(stroke.buf, 0, 0); c.restore(); }
  // selection marching ants
  if (D.selPath) { docT(); if (patchDrag) c.translate(patchDrag.dx, patchDrag.dy); c.lineWidth = 1 / z; c.setLineDash([4 / z, 4 / z]); c.strokeStyle = '#000'; c.lineDashOffset = -antsPhase / z; c.stroke(D.selPath); c.strokeStyle = '#fff'; c.lineDashOffset = (-antsPhase + 4) / z; c.stroke(D.selPath); c.setLineDash([]); }
  docT(); c.lineWidth = 1 / z;
  if (marqRect) { c.setLineDash([4 / z, 4 / z]); c.strokeStyle = '#fff'; c.beginPath(); if (O.marq === 'ellipse') c.ellipse(marqRect.x + marqRect.w / 2, marqRect.y + marqRect.h / 2, Math.abs(marqRect.w / 2), Math.abs(marqRect.h / 2), 0, 0, Math.PI * 2); else c.rect(marqRect.x, marqRect.y, marqRect.w, marqRect.h); c.stroke(); c.setLineDash([]); }
  if (lassoPts) { c.strokeStyle = '#fff'; c.setLineDash([4 / z, 4 / z]); c.beginPath(); lassoPts.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.stroke(); c.setLineDash([]); }
  if (gradPreview) { c.strokeStyle = '#fff'; c.lineWidth = 2 / z; c.beginPath(); c.moveTo(gradPreview.x1, gradPreview.y1); c.lineTo(gradPreview.x2, gradPreview.y2); c.stroke(); [[gradPreview.x1, gradPreview.y1], [gradPreview.x2, gradPreview.y2]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 4 / z, 0, 7); c.fillStyle = '#fff'; c.fill(); c.stroke(); }); }
  if (shapePreview) { c.save(); if (shapePreview.frame) { c.setLineDash([6 / z, 4 / z]); c.strokeStyle = '#31a8ff'; c.lineWidth = 1.5 / z; shapePath(c, shapePreview); c.stroke(); c.setLineDash([]); } else drawShape(c, shapePreview, true); c.restore(); }
  if (cropState) {
    const cr = cropState; c.fillStyle = 'rgba(0,0,0,.55)'; c.beginPath(); c.rect(-1e5, -1e5, 2e5, 2e5); c.rect(cr.x, cr.y + cr.h, cr.w, -cr.h); c.fill('evenodd');
    c.strokeStyle = '#fff'; c.lineWidth = 1.5 / z; c.strokeRect(cr.x, cr.y, cr.w, cr.h);
    c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 1 / z; c.beginPath(); for (let i = 1; i < 3; i++) { c.moveTo(cr.x + cr.w * i / 3, cr.y); c.lineTo(cr.x + cr.w * i / 3, cr.y + cr.h); c.moveTo(cr.x, cr.y + cr.h * i / 3); c.lineTo(cr.x + cr.w, cr.y + cr.h * i / 3); } c.stroke();
    cropHandles().forEach(([x, y]) => { c.fillStyle = '#fff'; c.fillRect(x - 5 / z, y - 5 / z, 10 / z, 10 / z); });
  }
  if (pcropState) {
    const q = pcropState; c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.rect(-1e5, -1e5, 2e5, 2e5); c.moveTo(...q[0]); c.lineTo(...q[3]); c.lineTo(...q[2]); c.lineTo(...q[1]); c.closePath(); c.fill('evenodd');
    c.strokeStyle = '#31a8ff'; c.lineWidth = 1.5 / z; c.beginPath(); q.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath(); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 1 / z; c.beginPath(); for (let i = 1; i < 3; i++) { const t = i / 3, a = lerpP(q[0], q[1], t), b = lerpP(q[3], q[2], t), e = lerpP(q[0], q[3], t), f = lerpP(q[1], q[2], t); c.moveTo(...a); c.lineTo(...b); c.moveTo(...e); c.lineTo(...f); } c.stroke();
    q.forEach(([x, y]) => { c.fillStyle = '#fff'; c.strokeStyle = '#31a8ff'; c.fillRect(x - 5 / z, y - 5 / z, 10 / z, 10 / z); c.strokeRect(x - 5 / z, y - 5 / z, 10 / z, 10 / z); });
  }
  if (T) {
    const pts = transformCorners(T); c.strokeStyle = '#31a8ff'; c.lineWidth = 1.5 / z; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath(); c.stroke();
    transformHandles(T).forEach(([x, y]) => { c.fillStyle = '#fff'; c.strokeStyle = '#31a8ff'; c.fillRect(x - 4 / z, y - 4 / z, 8 / z, 8 / z); c.strokeRect(x - 4 / z, y - 4 / z, 8 / z, 8 / z); });
  }
  if (D.ruler && O.tool === 'ruler') { const r = D.ruler; c.strokeStyle = '#ffd400'; c.lineWidth = 1.5 / z; c.beginPath(); c.moveTo(r.x1, r.y1); c.lineTo(r.x2, r.y2); c.stroke(); [[r.x1, r.y1], [r.x2, r.y2]].forEach(([x, y]) => { c.beginPath(); c.moveTo(x - 6 / z, y); c.lineTo(x + 6 / z, y); c.moveTo(x, y - 6 / z); c.lineTo(x, y + 6 / z); c.stroke(); }); }
  // guides & smart guides (screen space, full length)
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const gl = (o, p, col, dash) => { c.strokeStyle = col; c.lineWidth = 1; c.setLineDash(dash || []); c.beginPath(); if (o === 'h') { const y = Math.round(p * z + D.py) + 0.5; c.moveTo(0, y); c.lineTo(vw, y); } else { const x = Math.round(p * z + D.px) + 0.5; c.moveTo(x, 0); c.lineTo(x, vh); } c.stroke(); c.setLineDash([]); };
  if (O.showGuides) (D.guides || []).forEach(g => gl(g.o, g.p, '#00d5ff'));
  if (guideDrag) gl(guideDrag.o, guideDrag.p, '#00d5ff', [4, 3]);
  smartLines.forEach(s => gl(s.axis === 'x' ? 'v' : 'h', s.p, '#ff2bd6'));
  if (O.showNotes && D.notes?.length) D.notes.forEach((n, i) => { const [sx, sy] = toScreen(n.x, n.y); c.fillStyle = '#ffd84d'; c.strokeStyle = '#7a5b00'; c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + 16, sy); c.lineTo(sx + 20, sy + 4); c.lineTo(sx + 20, sy + 18); c.lineTo(sx, sy + 18); c.closePath(); c.fill(); c.stroke(); c.fillStyle = '#7a5b00'; c.font = 'bold 10px sans-serif'; c.fillText(String(i + 1), sx + 6, sy + 13); });
  // brush cursor
  if (cursorPos && PAINT_TOOLS.includes(O.tool) && !spaceDown) {
    const [sx, sy] = toScreen(...cursorPos); const r = Math.max(1, O.size * z / 2);
    c.lineWidth = 1; c.strokeStyle = 'rgba(0,0,0,.8)'; c.beginPath(); c.arc(sx, sy, r, 0, 7); c.stroke(); c.strokeStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(sx, sy, r + 1, 0, 7); c.stroke();
    if (O.tool === 'clone' && cloneSrc) { const [qx, qy] = toScreen(...(cloneOffset && stroke ? [cursorPos[0] - cloneOffset[0], cursorPos[1] - cloneOffset[1]] : cloneSrc)); c.beginPath(); c.moveTo(qx - 6, qy); c.lineTo(qx + 6, qy); c.moveTo(qx, qy - 6); c.lineTo(qx, qy + 6); c.stroke(); }
  }
  if (O.showRulers && cursorPos) drawRulers();
  updateTaskBar();
}
const lerpP = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
function updateCursor() {
  const t = O.tool; const map = { hand: 'grab', zoom: 'zoom-in', text: 'text', move: 'move', eyedrop: 'crosshair', bucket: 'crosshair', wand: 'crosshair', marquee: 'crosshair', lasso: 'crosshair', crop: 'crosshair', pcrop: 'crosshair', gradient: 'crosshair', shape: 'crosshair', ruler: 'crosshair', note: 'copy', patch: 'crosshair' };
  vpEl.style.cursor = spaceDown ? 'grab' : (PAINT_TOOLS.includes(t) ? 'none' : map[t] || 'default');
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
  if (D.sel) D.prevSel = D.sel; D.sel = m; D.selPath = m ? buildAnts(m) : null; D.selBounds = m ? maskBounds(m) : null; drawOverlay();
  if (['marquee', 'lasso', 'wand', 'patch'].includes(O.tool)) renderOptions();
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
// selection mask <-> Uint8 alpha array helpers
function selAlpha(m = D.sel) { const d = ctxOf(m).getImageData(0, 0, m.width, m.height).data, a = new Uint8ClampedArray(m.width * m.height); for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3]; return a; }
function maskFromAlpha(a, w = D.w, hh = D.h) { const m = mk(w, hh), c = ctxOf(m), id = c.createImageData(w, hh), d = id.data; for (let i = 0; i < a.length; i++) { const j = i * 4; d[j] = d[j + 1] = d[j + 2] = 255; d[j + 3] = a[i]; } c.putImageData(id, 0, 0); return m; }
async function modifySel(kind) {
  if (!D?.sel) return toast('Make a selection first');
  const v = await prompt({ feather: 'Feather selection', expand: 'Expand selection', contract: 'Contract selection', smooth: 'Smooth selection', border: 'Border selection' }[kind], kind === 'border' ? 'Width (px)' : 'Radius (px)', '5', 'number'); if (!v) return;
  const r = Math.max(1, +v); const a = selAlpha(); let out;
  if (kind === 'feather') { const f = Float32Array.from(a); X.gaussChan(f, D.w, D.h, r / 2); out = Uint8ClampedArray.from(f); }
  else if (kind === 'expand') out = X.shiftEdge(a, D.w, D.h, r);
  else if (kind === 'contract') out = X.shiftEdge(a, D.w, D.h, -r);
  else if (kind === 'border') { const o = X.shiftEdge(a, D.w, D.h, Math.ceil(r / 2)), i = X.shiftEdge(a, D.w, D.h, -Math.floor(r / 2)); out = new Uint8ClampedArray(a.length); for (let k = 0; k < a.length; k++) out[k] = Math.max(0, o[k] - i[k]); }
  else { const f = Float32Array.from(a); X.gaussChan(f, D.w, D.h, r / 2); out = new Uint8ClampedArray(a.length); for (let k = 0; k < a.length; k++) out[k] = f[k] >= 128 ? 255 : 0; }
  setSel(maskFromAlpha(out)); pushHist(kind[0].toUpperCase() + kind.slice(1));
}
function sampleData(all) { if (all) return ctxOf(flattenCanvas()).getImageData(0, 0, D.w, D.h); const L = AL(); const c = mk(D.w, D.h); if (L.kind !== 'adjust') c.getContext('2d').drawImage(L.canvas, L.x, L.y); return ctxOf(c).getImageData(0, 0, D.w, D.h); }
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

// apply a change to the layer, restricted to selection: fn(ctx of layer-copy in doc space)
function withSelection(L, drawFn) {
  ensureCovers(L);
  const tmp = mk(L.canvas.width, L.canvas.height), tc = tmp.getContext('2d'); tc.drawImage(L.canvas, 0, 0);
  drawFn(tc, -L.x, -L.y);
  if (D.sel) { const keep = mk(tmp.width, tmp.height), kc = keep.getContext('2d'); kc.drawImage(tmp, 0, 0); kc.globalCompositeOperation = 'destination-in'; kc.drawImage(D.sel, -L.x, -L.y);
    const res = mk(tmp.width, tmp.height), rc = res.getContext('2d'); rc.drawImage(L.canvas, 0, 0); rc.globalCompositeOperation = 'destination-out'; rc.drawImage(D.sel, -L.x, -L.y); rc.globalCompositeOperation = 'source-over'; rc.drawImage(keep, 0, 0); return replaceCanvas(L, res); }
  replaceCanvas(L, tmp);
}
function replaceCanvas(L, c) { const x = L.canvas.getContext('2d'); x.clearRect(0, 0, L.canvas.width, L.canvas.height); x.drawImage(c, 0, 0); }
function ensureCovers(L) {
  if (L.kind === 'adjust' || L.kind === 'frame') return;
  const x0 = Math.min(L.x, 0), y0 = Math.min(L.y, 0), x1 = Math.max(L.x + L.canvas.width, D.w), y1 = Math.max(L.y + L.canvas.height, D.h);
  if (x0 === L.x && y0 === L.y && x1 - x0 === L.canvas.width && y1 - y0 === L.canvas.height) return;
  const n = mk(x1 - x0, y1 - y0); n.getContext('2d').drawImage(L.canvas, L.x - x0, L.y - y0); L.canvas = n;
  if (L.smart) { const pad = c => { const q = mk(n.width, n.height); q.getContext('2d').drawImage(c, L.x - x0, L.y - y0); return q; }; L.smart.orig = pad(L.smart.orig); L.smart.filters.forEach(f => { if (f.mask) f.mask = pad(f.mask); }); }
  if (L.mask) { const m = mk(n.width, n.height), mc = m.getContext('2d'); mc.fillStyle = '#fff'; mc.fillRect(0, 0, m.width, m.height); mc.clearRect(L.x - x0, L.y - y0, L.mask.width, L.mask.height); mc.drawImage(L.mask, L.x - x0, L.y - y0); L.mask = m; L.maskVer = Math.random(); }
  L.x = x0; L.y = y0;
}

// =====================================================================  history
function cloneLayer(L) { return { ...L, canvas: cloneCanvas(L.canvas), mask: L.mask ? cloneCanvas(L.mask) : null, fx: JSON.parse(JSON.stringify(L.fx || {})), adj: L.adj ? JSON.parse(JSON.stringify(L.adj)) : undefined, text: L.text ? { ...L.text } : undefined, frame: L.frame ? { ...L.frame } : undefined, smart: L.smart ? { orig: L.smart.orig, filters: L.smart.filters.map(f => ({ ...f, vals: JSON.parse(JSON.stringify(f.vals)) })) } : undefined, _maskA: null, _fxc: null, _mb: null }; }
function snapState(label) { return { label, w: D.w, h: D.h, active: D.active, layers: D.layers.map(cloneLayer), sel: D.sel ? cloneCanvas(D.sel) : null }; }
function pushHist(label) {
  if (!D) return; contentSerial++;
  D.hist = D.hist.slice(0, D.hi + 1);
  D.hist.push(snapState(label));
  if (D.hist.length > 40) D.hist.shift(); D.hi = D.hist.length - 1;
  if (D.hist.length > 1) { D.dirty = true; UI.setDocTitle(D.name + ' •', 'BTS Photo'); renderTabs(); }
  renderRight();
}
function applyState(s) { D.w = s.w; D.h = s.h; D.active = clamp(s.active, 0, s.layers.length - 1); D.layers = s.layers.map(cloneLayer); D.layers.forEach(l => l.maskVer = Math.random()); D.sel = s.sel ? cloneCanvas(s.sel) : null; D.selPath = D.sel ? buildAnts(D.sel) : null; D.selBounds = D.sel ? maskBounds(D.sel) : null; contentSerial++; }
function restoreHist(i) {
  const s = D.hist[i]; if (!s) return; const sizeChanged = s.w !== D.w || s.h !== D.h; D.hi = i; applyState(s);
  T = null; renderAll(); if (sizeChanged) fitView();
}
function undo() { if (T) return cancelTransform(); if (D && D.hi > 0) restoreHist(D.hi - 1); }
function redo() { if (D && D.hi < D.hist.length - 1) restoreHist(D.hi + 1); }
UI.shortcut('ctrl+z', undo); UI.shortcut('ctrl+shift+z', redo); UI.shortcut('ctrl+y', redo); UI.shortcut('ctrl+alt+z', undo);
async function takeSnapshot() { if (!D) return; const name = await prompt('New snapshot', 'Snapshot name', 'Snapshot ' + (D.snaps.length + 1)); if (!name) return; D.snaps.push({ name, state: snapState(name), at: new Date() }); showTab('history'); toast('Snapshot saved', 'ok'); }
function restoreSnapshot(sn) { applyState(sn.state); T = null; pushHist('Snapshot: ' + sn.name); renderAll(); fitView(); }

// =====================================================================  pointer handling
let spaceDown = false, pan = null, cloneSrc = null, cloneOffset = null, drag = null;
window.addEventListener('keydown', e => { if (e.code === 'Space' && !e.target.closest('input,textarea,select') && !spaceDown) { spaceDown = true; updateCursor(); drawOverlay(); e.preventDefault(); } if (e.key === 'Enter' && !e.target.closest('input,textarea,.modal,.ph-float')) { if (T) commitTransform(); else if (cropState && O.tool === 'crop') applyCrop(); else if (pcropState && O.tool === 'pcrop') applyPerspectiveCrop(); } if (e.key === 'Escape') { if (T) cancelTransform(); else if (textEd) finishText(false); } });
window.addEventListener('keyup', e => { if (e.code === 'Space') { spaceDown = false; updateCursor(); drawOverlay(); } });
vpEl.addEventListener('pointermove', e => { if (!D) return; cursorPos = toDoc(e); const [x, y] = cursorPos; $('#stPos').textContent = `X ${Math.floor(x)}  Y ${Math.floor(y)}`; if (!drag) drawOverlay(); updateHoverCursor(e); });
vpEl.addEventListener('pointerleave', () => { cursorPos = null; drawOverlay(); });
vpEl.addEventListener('contextmenu', e => { if (!D) return; contextMenu(e, [{ label: 'Undo', action: undo }, '-', { label: 'Deselect', action: deselect, disabled: !D.sel }, { label: 'Select inverse', action: invertSel }, { label: 'Select subject', action: () => selectSubject('ai') }, { label: 'Layer via copy', action: () => layerVia(false) }, { label: 'Free transform', action: startTransform }, '-', { label: 'Fill…', action: fillDialog }, { label: 'Content-Aware Fill…', action: contentAwareFillDialog, disabled: !D.sel }, { label: 'Stroke…', action: strokeDialog }, { label: 'Refine edge…', action: refineEdgeDialog, disabled: !D.sel }]); });
vpEl.addEventListener('pointerdown', e => {
  if (!D) return; if (e.button === 2) return;
  if (e.target.closest('.ruler')) return;
  if (textEd && !e.target.closest('.text-editor')) { finishText(true); if (O.tool === 'text') return; }
  vpEl.setPointerCapture(e.pointerId);
  let [x, y] = toDoc(e);
  if (spaceDown || O.tool === 'hand' || e.button === 1) { pan = { sx: e.clientX, sy: e.clientY, px: D.px, py: D.py }; vpEl.style.cursor = 'grabbing'; return; }
  const t = O.tool;
  if (t === 'move' && !T) { const g = guideAt(x, y); if (g) { guideDrag = { o: g.o, p: g.p, guide: g }; drag = { kind: 'guide' }; return; } }
  const L = AL();
  const needsPixels = PAINT_TOOLS.includes(t) || ['bucket', 'gradient', 'patch'].includes(t);
  if (needsPixels || t === 'move') {
    if (!L) return;
    if (L.locked) return toast('Layer is locked', 'err');
    if (L.kind === 'adjust' && t !== 'move' && !['brush', 'pencil', 'eraser', 'gradient', 'bucket'].includes(t)) return toast('This is an adjustment layer — select a pixel layer, or paint on its mask with the brush', 'err');
    if (L.kind === 'adjust' && t !== 'move' && !L.mask) addMask('all', true);
    if (L.kind === 'text' && t !== 'move') { if (!(L.editMask && L.mask)) return toast('Rasterize the text layer first (Layer › Rasterize)', 'err'); }
    if (L.kind === 'frame' && t !== 'move' && !(L.editMask && L.mask)) return toast('Frames hold an image — use Layer › Frame › Place image, or Layer › Rasterize layer to paint on it', 'err');
    if (L.smart && t !== 'move' && !(L.editMask && L.mask)) return smartBlock(L);
    if (!L.visible && t !== 'move') return toast('Layer is hidden', 'err');
  }
  switch (t) {
    case 'zoom': { const r = vpEl.getBoundingClientRect(); setZoom(D.zoom * (e.altKey ? 0.8 : 1.25), e.clientX - r.left, e.clientY - r.top); return; }
    case 'eyedrop': { const img = O.sampleAll || L?.kind === 'adjust' ? flattenCanvas() : (() => { const c = mk(D.w, D.h); c.getContext('2d').drawImage(L.canvas, L.x, L.y); return c; })(); const p = ctxOf(img).getImageData(clamp(Math.floor(x), 0, D.w - 1), clamp(Math.floor(y), 0, D.h - 1), 1, 1).data; const hx = rgbToHex(p[0], p[1], p[2]); if (e.altKey) O.bg = hx; else O.fg = hx; renderColor(); return; }
    case 'wand': { const bits = floodMask(sampleData(O.sampleAll), x, y, O.tolerance, O.contiguous); selectionFromCanvas(maskFromBits(bits), e.shiftKey ? 'add' : e.altKey ? 'sub' : O.selMode, 'Magic wand'); return; }
    case 'bucket': { bucketFill(x, y); return; }
    case 'text': { textClick(x, y); return; }
    case 'note': { noteClick(x, y); return; }
    case 'redeye': { redEyeAt(x, y); return; }
    case 'frame': { [x, y] = snapPt(x, y); shapePreview = { type: O.frameShape === 'ellipse' ? 'ellipse' : 'rect', x1: x, y1: y, x2: x, y2: y, frame: true }; drag = {}; return; }
    case 'ruler': { [x, y] = snapPt(x, y); D.ruler = { x1: x, y1: y, x2: x, y2: y }; drag = { kind: 'ruler' }; return; }
    case 'pcrop': { const tol = 12 / D.zoom; const i = pcropState.findIndex(p => Math.hypot(p[0] - x, p[1] - y) < tol); if (i >= 0) drag = { kind: 'pc', i }; else drag = { kind: 'pcnew', sx: x, sy: y }; return; }
    case 'patch': { if (D.sel && pointInSel(x, y)) { patchDrag = { sx: x, sy: y, dx: 0, dy: 0 }; drag = { kind: 'patch' }; return; } drag = { mode: 'new' }; lassoPts = [[x, y]]; return; }
    case 'clone': if (e.altKey) { cloneSrc = [x, y]; cloneOffset = null; toast('Clone source set'); return; } if (!cloneSrc) return toast('Alt+click to set a clone source first', 'err'); break;
  }
  if (PAINT_TOOLS.includes(t)) return beginStroke(e, x, y);
  if (t === 'marquee') { [x, y] = snapPt(x, y); drag = { x0: x, y0: y, mode: e.shiftKey ? 'add' : e.altKey ? 'sub' : O.selMode }; marqRect = { x, y, w: 0, h: 0 }; return; }
  if (t === 'lasso') { drag = { mode: e.shiftKey ? 'add' : e.altKey ? 'sub' : O.selMode }; lassoPts = [[x, y]]; return; }
  if (t === 'gradient') { [x, y] = snapPt(x, y); gradPreview = { x1: x, y1: y, x2: x, y2: y }; drag = {}; return; }
  if (t === 'shape') { [x, y] = snapPt(x, y); shapePreview = { type: O.shape, x1: x, y1: y, x2: x, y2: y }; drag = {}; return; }
  if (t === 'crop') { drag = cropDragStart(x, y); return; }
  if (t === 'move') {
    if (T) { drag = transformDragStart(x, y, e); return; }
    if (O.autoSelect || e.ctrlKey) { for (let i = D.layers.length - 1; i >= 0; i--) { const l = D.layers[i]; if (!l.visible || l.kind === 'adjust') continue; const lx = Math.floor(x - l.x), ly = Math.floor(y - l.y); if (lx < 0 || ly < 0 || lx >= l.canvas.width || ly >= l.canvas.height) continue; if (ctxOf(l.canvas).getImageData(lx, ly, 1, 1).data[3] > 10) { D.active = i; renderLayers(); break; } } }
    const ML = AL(); if (!ML || ML.locked || ML.kind === 'adjust') return;
    if (D.sel && ML.kind === 'raster') { startTransform(); drag = T ? { kind: 'move', sx: x, sy: y, t0: { ...T } } : null; return; }
    drag = { kind: 'layer', sx: x, sy: y, lx: ML.x, ly: ML.y, L: ML, alt: e.altKey };
    if (e.altKey) { duplicateLayer(true); drag.L = AL(); }
    drag.b = layerBounds(drag.L); liveLayer = drag.L;
    return;
  }
});
vpEl.addEventListener('pointermove', e => {
  if (!D) return;
  if (pan) { D.px = pan.px + e.clientX - pan.sx; D.py = pan.py + e.clientY - pan.sy; applyView(); return; }
  let [x, y] = toDoc(e);
  if (stroke) { continueStroke(x, y, e); return; }
  if (!drag) return;
  const t = O.tool;
  if (drag.kind === 'guide') { guideDrag.p = Math.round(guideDrag.o === 'h' ? y : x); drawOverlay(); return; }
  if (t === 'marquee') { [x, y] = snapPt(x, y); let w = x - drag.x0, hh = y - drag.y0; if (e.shiftKey && drag.mode !== 'add') { const m = Math.max(Math.abs(w), Math.abs(hh)); w = Math.sign(w || 1) * m; hh = Math.sign(hh || 1) * m; } if (e.altKey && drag.mode !== 'sub') { marqRect = { x: drag.x0 - w, y: drag.y0 - hh, w: w * 2, h: hh * 2 }; } else marqRect = { x: drag.x0, y: drag.y0, w, h: hh }; drawOverlay(); }
  else if (t === 'lasso' || (t === 'patch' && lassoPts)) { lassoPts.push([x, y]); drawOverlay(); }
  else if (t === 'patch' && patchDrag) { patchDrag.dx = x - patchDrag.sx; patchDrag.dy = y - patchDrag.sy; drawOverlay(); }
  else if (t === 'ruler') { [x, y] = snapPt(x, y); if (e.shiftKey) { const r = D.ruler, a = Math.round(Math.atan2(y - r.y1, x - r.x1) / (Math.PI / 4)) * Math.PI / 4, l = Math.hypot(x - r.x1, y - r.y1); x = r.x1 + Math.cos(a) * l; y = r.y1 + Math.sin(a) * l; } D.ruler.x2 = x; D.ruler.y2 = y; drawOverlay(); const ri = $('#rulerInfo'); if (ri) ri.textContent = `X ${Math.round(D.ruler.x1)}  Y ${Math.round(D.ruler.y1)}   W ${Math.round(x - D.ruler.x1)}  H ${Math.round(y - D.ruler.y1)}   A ${rulerAngle().toFixed(1)}°   L ${Math.hypot(x - D.ruler.x1, y - D.ruler.y1).toFixed(1)} px`; }
  else if (t === 'pcrop') { if (drag.kind === 'pc') pcropState[drag.i] = [x, y]; else { const x0 = Math.min(drag.sx, x), y0 = Math.min(drag.sy, y), x1 = Math.max(drag.sx, x), y1 = Math.max(drag.sy, y); if (x1 - x0 > 4 && y1 - y0 > 4) pcropState = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; } drawOverlay(); }
  else if (t === 'gradient') { [x, y] = snapPt(x, y); gradPreview.x2 = x; gradPreview.y2 = y; if (e.shiftKey) { const a = Math.round(Math.atan2(y - gradPreview.y1, x - gradPreview.x1) / (Math.PI / 4)) * Math.PI / 4, l = Math.hypot(x - gradPreview.x1, y - gradPreview.y1); gradPreview.x2 = gradPreview.x1 + Math.cos(a) * l; gradPreview.y2 = gradPreview.y1 + Math.sin(a) * l; } drawOverlay(); }
  else if (t === 'shape' || t === 'frame') { [x, y] = snapPt(x, y); let x2 = x, y2 = y; if (e.shiftKey) { const s = Math.max(Math.abs(x - shapePreview.x1), Math.abs(y - shapePreview.y1)); if (shapePreview.type === 'line' || shapePreview.type === 'arrow') { const a = Math.round(Math.atan2(y - shapePreview.y1, x - shapePreview.x1) / (Math.PI / 4)) * Math.PI / 4, l = Math.hypot(x - shapePreview.x1, y - shapePreview.y1); x2 = shapePreview.x1 + Math.cos(a) * l; y2 = shapePreview.y1 + Math.sin(a) * l; } else { x2 = shapePreview.x1 + Math.sign(x - shapePreview.x1 || 1) * s; y2 = shapePreview.y1 + Math.sign(y - shapePreview.y1 || 1) * s; } } shapePreview.x2 = x2; shapePreview.y2 = y2; drawOverlay(); }
  else if (t === 'crop') { cropDragMove(drag, x, y, e); drawOverlay(); }
  else if (t === 'move') {
    if (drag.kind === 'layer') { let dx = x - drag.sx, dy = y - drag.sy; if (e.shiftKey) Math.abs(dx) > Math.abs(dy) ? dy = 0 : dx = 0; if (drag.b && !e.ctrlKey) [dx, dy] = snapBox(drag.b, dx, dy, drag.L); drag.L.x = Math.round(drag.lx + dx); drag.L.y = Math.round(drag.ly + dy); requestRender(); drawOverlay(); }
    else if (T) { transformDragMove(drag, x, y, e); requestRender(); drawOverlay(); }
  }
});
vpEl.addEventListener('pointerup', e => {
  if (!D) return;
  if (pan) { pan = null; updateCursor(); return; }
  if (stroke) { endStroke(); return; }
  if (!drag) return; const d = drag; drag = null; const t = O.tool;
  if (d.kind === 'guide') { finishGuideDrag(e); return; }
  if (t === 'marquee') { const r = normRect(marqRect); marqRect = null; if (r.w < 2 || r.h < 2) { if (d.mode === 'new') { deselect(); } drawOverlay(); return; } selectionFromCanvas(maskFromPath(c => O.marq === 'ellipse' ? c.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2) : c.rect(Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h))), d.mode, O.marq === 'ellipse' ? 'Elliptical marquee' : 'Rectangular marquee'); }
  else if (t === 'lasso' || (t === 'patch' && lassoPts)) { const pts = lassoPts; lassoPts = null; if (pts.length < 3) { drawOverlay(); return; } selectionFromCanvas(maskFromPath(c => { pts.forEach((p, i) => i ? c.lineTo(...p) : c.moveTo(...p)); c.closePath(); }), d.mode, t === 'patch' ? 'Patch selection' : 'Lasso'); }
  else if (t === 'patch' && patchDrag) { const p = patchDrag; patchDrag = null; drawOverlay(); if (Math.hypot(p.dx, p.dy) > 2) applyPatch(Math.round(p.dx), Math.round(p.dy)); }
  else if (t === 'ruler') { renderOptions(); drawOverlay(); }
  else if (t === 'pcrop') drawOverlay();
  else if (t === 'gradient') { const g = gradPreview; gradPreview = null; if (Math.hypot(g.x2 - g.x1, g.y2 - g.y1) > 2) applyGradient(g); drawOverlay(); }
  else if (t === 'frame') { const s = shapePreview; shapePreview = null; drawOverlay(); const r = normRect({ x: s.x1, y: s.y1, w: s.x2 - s.x1, h: s.y2 - s.y1 }); if (r.w > 4 && r.h > 4) createFrame(r); else { const f = frameAt(s.x1, s.y1); if (f) { D.active = D.layers.indexOf(f); renderLayers(); renderOptions(); if (!f.frame.img) placeIntoFrame(f); } } }
  else if (t === 'shape') { const s = shapePreview; shapePreview = null; drawOverlay(); if (Math.abs(s.x2 - s.x1) > 2 || Math.abs(s.y2 - s.y1) > 2) commitShape(s); }
  else if (t === 'move') { liveLayer = null; smartLines = []; if (d.kind === 'layer') { if (d.L.kind === 'text' && (d.L.x || d.L.y)) { d.L.text.x += d.L.x; d.L.text.y += d.L.y; d.L.x = 0; d.L.y = 0; renderTextLayer(d.L); } if (d.L.x !== d.lx || d.L.y !== d.ly || d.alt) pushHist('Move'); requestRender(); } drawOverlay(); }
});
function updateHoverCursor(e) {
  if (O.tool === 'move' && T && !drag) { const [x, y] = toDoc(e); const h0 = transformHit(x, y); vpEl.style.cursor = h0 === 'rotate' ? 'alias' : h0 === 'move' ? 'move' : h0 ? 'nwse-resize' : 'default'; }
  else if (O.tool === 'move' && !drag) { const [x, y] = toDoc(e); const g = guideAt(x, y); vpEl.style.cursor = g ? (g.o === 'h' ? 'row-resize' : 'col-resize') : 'move'; }
  else if (O.tool === 'patch' && !drag && D?.sel) { const [x, y] = toDoc(e); vpEl.style.cursor = pointInSel(x, y) ? 'move' : 'crosshair'; }
}
const normRect = r => ({ x: Math.min(r.x, r.x + r.w), y: Math.min(r.y, r.y + r.h), w: Math.abs(r.w), h: Math.abs(r.h) });
function pointInSel(x, y) { if (!D.sel || x < 0 || y < 0 || x >= D.w || y >= D.h) return false; return ctxOf(D.sel).getImageData(Math.floor(x), Math.floor(y), 1, 1).data[3] > 127; }

// =====================================================================  brush engine
function makeDab(size, hardness, color) {
  const s = Math.max(1, Math.ceil(size)), c = mk(s + 2, s + 2), x = c.getContext('2d'), r = s / 2;
  const g = x.createRadialGradient(r + 1, r + 1, 0, r + 1, r + 1, r);
  const [R, G, B] = hexToRgb(color); g.addColorStop(0, `rgba(${R},${G},${B},1)`); g.addColorStop(clamp(hardness, 0, 0.99), `rgba(${R},${G},${B},1)`); g.addColorStop(1, `rgba(${R},${G},${B},0)`);
  x.fillStyle = g; x.beginPath(); x.arc(r + 1, r + 1, r, 0, 7); x.fill(); return c;
}
function layerDocCanvas(L) { const c = mk(D.w, D.h); if (L.kind !== 'adjust') c.getContext('2d').drawImage(L.canvas, L.x, L.y); return c; }
function ensureAdjMask(L) { if (L.kind === 'adjust' && !L.mask) { const m = mk(D.w, D.h), c = m.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, D.w, D.h); L.mask = m; L.maskVer = Math.random(); L.x = 0; L.y = 0; } }
function beginStroke(e, x, y) {
  const L = AL(); const t = O.tool;
  ensureCovers(L); ensureAdjMask(L);
  const onMask = !!(L.mask && L.editMask) || L.kind === 'adjust';
  if (onMask && L.kind !== 'adjust' && L.mask.width !== L.canvas.width) { const nm = mk(L.canvas.width, L.canvas.height), nc = nm.getContext('2d'); nc.fillStyle = '#fff'; nc.fillRect(0, 0, nm.width, nm.height); nc.drawImage(L.mask, 0, 0); L.mask = nm; }
  const direct = ['blur', 'dodge', 'colorrep', 'brighten'].includes(t);
  const maskOnly = ['heal', 'remove'].includes(t);
  let color = O.fg; if (onMask) { const [r, g, b] = hexToRgb(O.fg); const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b); color = rgbToHex(lum, lum, lum); }
  stroke = { layer: L, buf: mk(D.w, D.h), last: [x, y], acc: 0, erase: t === 'eraser' && !onMask, opacity: maskOnly ? 1 : O.opacity, direct, onMask: onMask && !maskOnly, maskOnly, tool: t, color,
    dab: t === 'pencil' ? null : makeDab(O.size, maskOnly ? 0.9 : t === 'eraser' || t === 'brush' || t === 'clone' || t === 'pstamp' ? O.hardness : 0.5, maskOnly ? '#ff3060' : t === 'eraser' ? '#000000' : color) };
  if (onMask && t === 'eraser') { stroke.dab = makeDab(O.size, O.hardness, '#ffffff'); stroke.color = '#ffffff'; }
  if (t === 'clone') { const srcC = O.sampleAll ? flattenCanvas() : layerDocCanvas(L); stroke.srcC = srcC; if (!O.cloneAligned || !cloneOffset) cloneOffset = [x - cloneSrc[0], y - cloneSrc[1]]; }
  if (t === 'pstamp') { const pc = patternCanvas(O.pattern), s = mk(D.w, D.h), sc = s.getContext('2d'), pat = sc.createPattern(pc, 'repeat'); pat.setTransform(new DOMMatrix().scale(O.patScale)); sc.fillStyle = pat; sc.fillRect(0, 0, D.w, D.h); stroke.srcC = s; }
  if (t === 'mixer') { stroke.load = hexToRgb(O.fg); stroke.sampler = mk(1, 1); }
  if (t === 'colorrep') { const p = ctxOf(L.canvas).getImageData(clamp(Math.floor(x - L.x), 0, L.canvas.width - 1), clamp(Math.floor(y - L.y), 0, L.canvas.height - 1), 1, 1).data; stroke.target = [p[0], p[1], p[2]]; }
  if (t === 'blur' && O.blurMode === 'smudge') stroke.pick = null;
  dabAt(x, y); requestRender(); drawOverlay();
}
function continueStroke(x, y, e) {
  const s = stroke; const [lx, ly] = s.last; const dist = Math.hypot(x - lx, y - ly); const step = Math.max(1, O.size * (s.direct ? 0.3 : s.tool === 'mixer' ? 0.15 : O.spacing));
  let tt = step - s.acc; while (tt <= dist) { const k = tt / dist; dabAt(lx + (x - lx) * k, ly + (y - ly) * k); tt += step; }
  s.acc = dist - (tt - step); s.last = [x, y]; cursorPos = [x, y]; requestRender(); drawOverlay();
}
function dabAt(x, y) {
  const s = stroke, t = s.tool, sz = O.size;
  if (s.direct) return directDab(x, y);
  const c = s.buf.getContext('2d');
  if (s.maskOnly) { c.drawImage(s.dab, x - sz / 2 - 1, y - sz / 2 - 1); return; }
  if (t === 'pencil') { c.fillStyle = s.color; const r = Math.max(1, Math.round(sz)); c.fillRect(Math.round(x - r / 2), Math.round(y - r / 2), r, r); return; }
  if (t === 'clone' || t === 'pstamp') {
    const r = sz / 2, src = s.srcC, ox = t === 'clone' ? cloneOffset[0] : 0, oy = t === 'clone' ? cloneOffset[1] : 0;
    const tmp = mk(sz + 2, sz + 2), tc = tmp.getContext('2d'); tc.drawImage(src, x - ox - r - 1, y - oy - r - 1, sz + 2, sz + 2, 0, 0, sz + 2, sz + 2);
    tc.globalCompositeOperation = 'destination-in'; tc.drawImage(s.dab, 0, 0);
    c.save(); c.globalAlpha = O.flow; c.drawImage(tmp, x - r - 1, y - r - 1); c.restore(); return;
  }
  if (t === 'mixer') {
    // sample what is under the brush (layer + wet paint), mix with the loaded colour, deposit
    const L = s.layer, sm = s.sampler.getContext('2d', { willReadFrequently: true }), r = Math.max(1, sz / 2);
    sm.clearRect(0, 0, 1, 1); sm.imageSmoothingQuality = 'low'; sm.drawImage(L.canvas, x - L.x - r / 2, y - L.y - r / 2, r, r, 0, 0, 1, 1); sm.drawImage(s.buf, x - r / 2, y - r / 2, r, r, 0, 0, 1, 1);
    const p = sm.getImageData(0, 0, 1, 1).data; const wet = O.wet, ld = O.mixLoad;
    if (p[3] > 8) { for (let k = 0; k < 3; k++) s.load[k] = s.load[k] * (1 - wet * 0.35) + p[k] * wet * 0.35; }
    const fg = hexToRgb(O.fg); for (let k = 0; k < 3; k++) s.load[k] = s.load[k] * (1 - ld * 0.08) + fg[k] * ld * 0.08;
    const dab = makeDab(sz, 0.5, rgbToHex(...s.load)); c.save(); c.globalAlpha = O.flow * 0.6; c.drawImage(dab, x - sz / 2 - 1, y - sz / 2 - 1); c.restore(); return;
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
  if (t === 'colorrep') {
    const [tr, tg, tb] = stroke.target, [fr, fgc, fb] = hexToRgb(O.fg), [fh, fs, fl] = X.rgb2hsl(fr, fgc, fb), tol = O.crTol;
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const wgt = weight(px, py); if (!wgt) continue; const j = (py * W + px) * 4, dist = (Math.abs(d[j] - tr) + Math.abs(d[j + 1] - tg) + Math.abs(d[j + 2] - tb)) / 3; if (dist > tol) continue;
      const soft = wgt * clamp((tol - dist) / (tol * 0.35 + 1), 0, 1); const [hh2, s2, l2] = X.rgb2hsl(d[j], d[j + 1], d[j + 2]);
      const o = O.crMode === 'hue' ? X.hsl2rgb(fh, s2, l2) : O.crMode === 'saturation' ? X.hsl2rgb(hh2, fs, l2) : O.crMode === 'luminosity' ? X.hsl2rgb(hh2, s2, fl) : X.hsl2rgb(fh, fs, l2);
      for (let ch = 0; ch < 3; ch++) d[j + ch] = d[j + ch] * (1 - soft) + o[ch] * soft;
    }
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
  if (t === 'brighten') brightenDab(d, W, H, weight);
  cx.putImageData(img, x0, y0);
}
async function endStroke() {
  const s = stroke; stroke = null; const L = s.layer;
  if (s.maskOnly) { drawOverlay(); if (s.tool === 'remove' && O.removeMode !== 'object') { await removeDistractions(O.removeMode, s.buf, true); return; } await inpaintLayer(L, s.buf, { tool: s.tool }); return; }
  if (!s.direct) {
    let buf = s.buf;
    if (D.sel) { const b = cloneCanvas(buf), bc = b.getContext('2d'); bc.globalCompositeOperation = 'destination-in'; bc.drawImage(D.sel, 0, 0); buf = b; }
    if (s.onMask) { const mc = L.mask.getContext('2d'); mc.save(); mc.globalAlpha = s.opacity; mc.drawImage(buf, -L.x, -L.y); mc.restore(); L.maskVer = Math.random(); }
    else { const c = L.canvas.getContext('2d'); c.save(); c.globalAlpha = s.opacity; c.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over'; c.drawImage(buf, -L.x, -L.y); c.restore(); }
  }
  requestRender(); pushHist({ brush: 'Brush', pencil: 'Pencil', eraser: 'Eraser', clone: 'Clone stamp', blur: 'Blur tool', dodge: 'Dodge tool', pstamp: 'Pattern stamp', mixer: 'Mixer brush', colorrep: 'Color replacement', brighten: 'Teeth & eye brighten' }[s.tool] || 'Paint');
}

// =====================================================================  content-aware healing / fill / remove / patch
let busy = false;
async function withBusy(label, fn) {
  if (busy) return; busy = true; const el = h('div', { class: 'ph-busy' }, h('div', { class: 'spinner' }), label); document.body.append(el);
  await sleep(30); try { return await fn(); } catch (e) { console.error(e); toast(label.replace('…', '') + ' failed: ' + e.message, 'err', 6000); } finally { el.remove(); busy = false; }
}
// maskC: doc-space canvas whose alpha marks the area to fill
async function inpaintLayer(L, maskC, { tool = 'fill', sampleAll = O.healSample, output = 'layer', label } = {}) {
  ensureCovers(L);
  const mb = alphaBounds(maskC); if (!mb) { requestRender(); return; }
  return withBusy(tool === 'heal' ? 'Healing…' : tool === 'remove' ? 'Removing…' : 'Content-aware fill…', async () => {
    const hs = Math.max(mb.w, mb.h), margin = Math.round(clamp(hs * (tool === 'heal' ? 1.2 : 1.6), 24, 700));
    const rx = Math.max(0, mb.x - margin), ry = Math.max(0, mb.y - margin), rx2 = Math.min(D.w, mb.x + mb.w + margin), ry2 = Math.min(D.h, mb.y + mb.h + margin), rw = rx2 - rx, rh = ry2 - ry;
    const srcC = sampleAll ? flattenCanvas() : layerDocCanvas(L);
    const img = ctxOf(srcC).getImageData(rx, ry, rw, rh), orig = new Uint8ClampedArray(img.data);
    let ma = ctxOf(maskC).getImageData(rx, ry, rw, rh).data, alpha = new Uint8ClampedArray(rw * rh); for (let i = 0; i < alpha.length; i++) alpha[i] = ma[i * 4 + 3];
    if (tool === 'remove') alpha = X.shiftEdge(alpha, rw, rh, Math.max(2, Math.round(hs * 0.04)));
    const hole = new Uint8Array(rw * rh); for (let i = 0; i < hole.length; i++) hole[i] = alpha[i] > 8 ? 1 : 0;
    const dil = X.maxFilterU8(hole, rw, rh, 1); // fill a 1px safety ring too
    // downscale very large areas for speed
    const MAXP = 4.5e6; let k = 1; if (rw * rh > MAXP) k = Math.sqrt(MAXP / (rw * rh));
    if (k < 1) {
      const sw = Math.max(8, Math.round(rw * k)), sh = Math.max(8, Math.round(rh * k)), sc = mk(sw, sh), scx = ctxOf(sc); const tc = mk(rw, rh); ctxOf(tc).putImageData(img, 0, 0); scx.imageSmoothingQuality = 'high'; scx.drawImage(tc, 0, 0, sw, sh);
      const si = scx.getImageData(0, 0, sw, sh), shole = new Uint8Array(sw * sh); for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { let any = 0; const xa = Math.floor(x / k), ya = Math.floor(y / k), xb = Math.min(rw - 1, Math.ceil((x + 1) / k)), yb = Math.min(rh - 1, Math.ceil((y + 1) / k)); for (let yy = ya; yy <= yb && !any; yy++) for (let xx = xa; xx <= xb; xx++) if (dil[yy * rw + xx]) { any = 1; break; } shole[y * sw + x] = any; }
      X.inpaint(si.data, sw, sh, shole, { patch: 3 }); scx.putImageData(si, 0, 0); const up = mk(rw, rh), ux = ctxOf(up); ux.imageSmoothingQuality = 'high'; ux.drawImage(sc, 0, 0, rw, rh); const ud = ux.getImageData(0, 0, rw, rh).data; for (let i = 0; i < hole.length; i++) if (dil[i]) for (let c = 0; c < 4; c++) img.data[i * 4 + c] = ud[i * 4 + c];
    } else X.inpaint(img.data, rw, rh, dil, { patch: tool === 'heal' ? 2 : 3 });
    // soft edge blend using the painted alpha
    const res = img.data, sel = D.sel ? ctxOf(D.sel).getImageData(rx, ry, rw, rh).data : null;
    const soft = Float32Array.from(alpha); X.gaussChan(soft, rw, rh, tool === 'heal' ? 1 : 1.5);
    for (let i = 0; i < hole.length; i++) { let a = Math.max(alpha[i], soft[i]) / 255; if (tool === 'fill' && sel) a = Math.min(1, sel[i * 4 + 3] / 255 + (dil[i] && !hole[i] ? 0.5 : 0)); if (dil[i] && a < 0.5) a = Math.max(a, 0.5); const j = i * 4; for (let c = 0; c < 4; c++) res[j + c] = orig[j + c] + (res[j + c] - orig[j + c]) * a; }
    if (output === 'new') { const n = newLayer(label || 'Content-aware fill', D.w, D.h); const c = mk(rw, rh), cx = ctxOf(c); const id = new ImageData(rw, rh); for (let i = 0; i < hole.length; i++) if (dil[i] || alpha[i]) { const j = i * 4; for (let q = 0; q < 4; q++) id.data[j + q] = res[j + q]; } cx.putImageData(id, 0, 0); n.canvas.getContext('2d').drawImage(c, rx, ry); D.layers.splice(D.active + 1, 0, n); D.active++; }
    else { const keep = mk(rw, rh); ctxOf(keep).putImageData(img, 0, 0); const lc = L.canvas.getContext('2d'); lc.clearRect(rx - L.x, ry - L.y, rw, rh); lc.drawImage(keep, rx - L.x, ry - L.y); }
    requestRender(); pushHist(label || { heal: 'Spot healing', remove: 'Remove tool', fill: 'Content-aware fill' }[tool] || 'Content-aware fill');
  });
}
async function contentAwareFillDialog() {
  if (!D) return; if (!D.sel) return toast('Select the area to fill first (lasso around the object)');
  const L = AL(); if (!L || L.kind !== 'raster') return toast('Select a pixel layer', 'err'); if (smartBlock(L)) return;
  const v = await form({ title: 'Content-Aware Fill', fields: [{ key: 'sample', label: 'Sample from', type: 'select', value: 'layer', options: [{ value: 'layer', label: 'Current layer' }, { value: 'all', label: 'All layers' }] }, { key: 'out', label: 'Output to', type: 'select', value: 'layer', options: [{ value: 'layer', label: 'Current layer' }, { value: 'new', label: 'New layer' }] }, { key: 'expand', label: 'Expand selection by (px)', type: 'number', value: 3 }], ok: 'Fill' });
  if (!v) return; let m = D.sel; if (+v.expand > 0) m = maskFromAlpha(X.shiftEdge(selAlpha(), D.w, D.h, +v.expand));
  await inpaintLayer(L, m, { tool: 'fill', sampleAll: v.sample === 'all', output: v.out });
}
UI.shortcut('shift+backspace', contentAwareFillDialog);
async function applyPatch(dx, dy) {
  const L = AL(); if (!L || L.kind !== 'raster' || !D.sel) return; ensureCovers(L);
  const b = maskBounds(D.sel); if (!b) return; const pad = 3, x0 = Math.max(0, b.x - pad), y0 = Math.max(0, b.y - pad), x1 = Math.min(D.w, b.x + b.w + pad), y1 = Math.min(D.h, b.y + b.h + pad), w = x1 - x0, hh = y1 - y0;
  await withBusy('Patching…', async () => {
    const full = layerDocCanvas(L), fc = ctxOf(full); const dst = fc.getImageData(x0, y0, w, hh), src = fc.getImageData(x0 + dx, y0 + dy, w, hh);
    const sa = ctxOf(D.sel).getImageData(x0, y0, w, hh).data, mask = new Uint8Array(w * hh); for (let i = 0; i < mask.length; i++) mask[i] = sa[i * 4 + 3] > 20 ? 1 : 0;
    const out = new Uint8ClampedArray(dst.data); X.membraneBlend(out, src.data, mask, w, hh);
    for (let i = 0; i < mask.length; i++) { const a = sa[i * 4 + 3] / 255, j = i * 4; for (let c = 0; c < 3; c++) dst.data[j + c] = dst.data[j + c] + (out[j + c] - dst.data[j + c]) * a; }
    const c = mk(w, hh); ctxOf(c).putImageData(dst, 0, 0); const lc = L.canvas.getContext('2d'); lc.clearRect(x0 - L.x, y0 - L.y, w, hh); lc.drawImage(c, x0 - L.x, y0 - L.y);
    requestRender(); pushHist('Patch tool');
  });
}
function redEyeAt(x, y) {
  const L = AL(); if (!L || L.kind !== 'raster') return; ensureCovers(L);
  const r = Math.max(4, O.size / 2), x0 = Math.max(0, Math.floor(x - r - L.x)), y0 = Math.max(0, Math.floor(y - r - L.y)), x1 = Math.min(L.canvas.width, Math.ceil(x + r - L.x)), y1 = Math.min(L.canvas.height, Math.ceil(y + r - L.y)); if (x1 <= x0 || y1 <= y0) return;
  const cx = ctxOf(L.canvas), img = cx.getImageData(x0, y0, x1 - x0, y1 - y0), d = img.data, W = x1 - x0; let n = 0; const dk = 1 - O.strength * 0.6;
  for (let py = 0; py < y1 - y0; py++) for (let px = 0; px < W; px++) { const dd = Math.hypot(px + x0 + L.x - x, py + y0 + L.y - y) / r; if (dd > 1) continue; const j = (py * W + px) * 4, R = d[j], G = d[j + 1], B = d[j + 2]; const red = R / ((G + B) / 2 + 12); if (red < 1.45 || R < 60) continue; const k = clamp((red - 1.45) * 1.5, 0, 1) * (dd > 0.8 ? (1 - dd) * 5 : 1); const v = (G + B) / 2 * dk; d[j] = R + (v - R) * k; d[j + 1] = G + (v * 0.98 - G) * k * 0.5; d[j + 2] = B + (v - B) * k * 0.5; n++; }
  cx.putImageData(img, x0, y0); requestRender(); if (n) pushHist('Red-eye'); else toast('No red pixels found there — try a larger pupil size');
}

// =====================================================================  ruler / notes
function rulerAngle() { const r = D?.ruler; if (!r) return 0; let a = Math.atan2(r.y2 - r.y1, r.x2 - r.x1) * 180 / Math.PI; return -a; }
function straightenFromRuler() { if (!D?.ruler) return; let a = -rulerAngle(); while (a > 45) a -= 90; while (a < -45) a += 90; rotateArbitrary(-a, 'crop'); D.ruler = null; renderOptions(); }
async function noteClick(x, y) {
  const tol = 14 / D.zoom; const idx = (D.notes || []).findIndex(n => x >= n.x - 2 / D.zoom && x <= n.x + 22 / D.zoom && y >= n.y - 2 / D.zoom && y <= n.y + tol + 6 / D.zoom);
  const ta = h('textarea', { rows: 5, style: { width: '100%' } }, idx >= 0 ? D.notes[idx].text : '');
  const r = await modal({ title: idx >= 0 ? 'Note ' + (idx + 1) : 'New note', body: h('div', {}, h('div', { class: 'muted', style: { marginBottom: '6px' } }, 'Notes are saved in .btsp projects and never appear in exported images.'), ta), buttons: [...(idx >= 0 ? [{ label: 'Delete', value: 'del' }] : []), { label: 'Cancel', value: null }, { label: 'Save', primary: true, value: 'ok' }] });
  if (r === 'del') D.notes.splice(idx, 1); else if (r === 'ok') { if (idx >= 0) D.notes[idx].text = ta.value; else if (ta.value.trim()) D.notes.push({ x, y, text: ta.value, author: 'me', at: Date.now() }); }
  O.showNotes = true; renderOptions(); drawOverlay();
}

// =====================================================================  bucket / gradient / shapes
function bucketFill(x, y) {
  const L = AL(); ensureCovers(L); ensureAdjMask(L);
  const bits = floodMask(sampleData(O.sampleAll), x, y, O.tolerance, O.contiguous);
  const m = maskFromBits(bits); if (D.sel) { const mc = m.getContext('2d'); mc.globalCompositeOperation = 'destination-in'; mc.drawImage(D.sel, 0, 0); }
  if (L.kind === 'adjust') { const mc = L.mask.getContext('2d'); const [r, g, b] = hexToRgb(O.fg), v = Math.round(0.299 * r + 0.587 * g + 0.114 * b); const f = mk(D.w, D.h), fc = f.getContext('2d'); fc.fillStyle = rgbToHex(v, v, v); fc.fillRect(0, 0, D.w, D.h); fc.globalCompositeOperation = 'destination-in'; fc.drawImage(m, 0, 0); mc.drawImage(f, 0, 0); L.maskVer = Math.random(); requestRender(); pushHist('Paint bucket'); return; }
  const fill = mk(D.w, D.h), fc = fill.getContext('2d'); fc.fillStyle = O.fg; fc.fillRect(0, 0, D.w, D.h); fc.globalCompositeOperation = 'destination-in'; fc.drawImage(m, 0, 0);
  const c = L.canvas.getContext('2d'); c.save(); c.globalAlpha = O.opacity; c.drawImage(fill, -L.x, -L.y); c.restore();
  requestRender(); pushHist('Paint bucket');
}
const gradCss = stops => `linear-gradient(90deg,${[...stops].sort((a, b) => a[0] - b[0]).map(([p, c, a]) => hexA(c, a ?? 1) + ' ' + (p * 100).toFixed(1) + '%').join(',')}), repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0/10px 10px`;
function renderGradient(c, g, stops, type, reverse) {
  const W = c.canvas.width, H = c.canvas.height, len = Math.hypot(g.x2 - g.x1, g.y2 - g.y1) || 1;
  const st = [...stops].map(([p, col, a]) => [reverse ? 1 - p : p, col, a ?? 1]).sort((a, b) => a[0] - b[0]);
  const add = (gr, map = p => p) => st.forEach(([p, col, a]) => gr.addColorStop(clamp(map(p), 0, 1), hexA(col, a)));
  if (type === 'linear') { const gr = c.createLinearGradient(g.x1, g.y1, g.x2, g.y2); add(gr); c.fillStyle = gr; c.fillRect(0, 0, W, H); }
  else if (type === 'reflected') { const gr = c.createLinearGradient(2 * g.x1 - g.x2, 2 * g.y1 - g.y2, g.x2, g.y2); st.forEach(([p, col, a]) => { gr.addColorStop(0.5 + p / 2, hexA(col, a)); gr.addColorStop(0.5 - p / 2, hexA(col, a)); }); c.fillStyle = gr; c.fillRect(0, 0, W, H); }
  else if (type === 'radial') { const gr = c.createRadialGradient(g.x1, g.y1, 0, g.x1, g.y1, len); add(gr); c.fillStyle = gr; c.fillRect(0, 0, W, H); }
  else if (type === 'angle') { const gr = c.createConicGradient(Math.atan2(g.y2 - g.y1, g.x2 - g.x1), g.x1, g.y1); add(gr); c.fillStyle = gr; c.fillRect(0, 0, W, H); }
  else { const L = gradLutRGBA(stops, reverse), id = c.createImageData(W, H), dd = id.data; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = clamp(Math.round((Math.abs(x - g.x1) + Math.abs(y - g.y1)) / len * 255), 0, 255) * 4, j = (y * W + x) * 4; dd[j] = L[k]; dd[j + 1] = L[k + 1]; dd[j + 2] = L[k + 2]; dd[j + 3] = L[k + 3] * 255; } c.putImageData(id, 0, 0); }
}
function applyGradient(g) {
  const L = AL(); ensureCovers(L); ensureAdjMask(L);
  const tmp = mk(D.w, D.h), c = ctxOf(tmp);
  renderGradient(c, g, L.kind === 'adjust' ? O.gradStops.map(([p, col, a]) => { const [r, gg, b] = hexToRgb(col), v = Math.round(0.299 * r + 0.587 * gg + 0.114 * b); return [p, rgbToHex(v, v, v), a]; }) : O.gradStops, O.grad, O.gradReverse);
  if (D.sel) { c.globalCompositeOperation = 'destination-in'; c.drawImage(D.sel, 0, 0); }
  if (L.kind === 'adjust') { L.mask.getContext('2d').drawImage(tmp, 0, 0); L.maskVer = Math.random(); requestRender(); pushHist('Gradient'); return; }
  const lc = L.canvas.getContext('2d'); lc.save(); lc.globalAlpha = O.opacity; lc.drawImage(tmp, -L.x, -L.y); lc.restore();
  requestRender(); pushHist('Gradient');
}
async function gradientEditor(stops0) {
  let stops = stops0.map(s => [...s]); let sel = 0;
  const PRESETS = [[[0, '#000000', 1], [1, '#ffffff', 1]], [[0, O.fg, 1], [1, O.fg, 0]], [[0, '#ff0000', 1], [0.17, '#ffff00', 1], [0.33, '#00ff00', 1], [0.5, '#00ffff', 1], [0.67, '#0000ff', 1], [0.83, '#ff00ff', 1], [1, '#ff0000', 1]], [[0, '#1b1035', 1], [0.5, '#c2416b', 1], [1, '#ffd27a', 1]], [[0, '#0f2027', 1], [0.5, '#2c5364', 1], [1, '#a8e6ff', 1]], [[0, '#f7971e', 1], [1, '#ffd200', 1]], [[0, '#ee9ca7', 1], [1, '#ffdde1', 1]], [[0, '#00c6ff', 1], [1, '#0072ff', 1]], [[0, '#b8860b', 1], [0.5, '#fff6c8', 1], [1, '#8a6a10', 1]]];
  const bar = h('div', { class: 'ge-bar' }), track = h('div', { class: 'ge-track' }), pre = h('div', { class: 'ge-presets' });
  const colI = h('input', { type: 'color' }), opI = h('input', { type: 'number', min: 0, max: 100, style: { width: '64px' } }), posI = h('input', { type: 'number', min: 0, max: 100, style: { width: '64px' } });
  const del = h('button', { class: 'btn sm', onclick: () => { if (stops.length > 2) { stops.splice(sel, 1); sel = 0; draw(); } } }, 'Delete stop');
  const draw = () => { bar.style.background = gradCss(stops); track.innerHTML = ''; stops.forEach((s, i) => { const k = h('div', { class: 'ge-stop' + (i === sel ? ' sel' : ''), style: { left: s[0] * 100 + '%', background: s[1] } }); k.onpointerdown = e => { e.stopPropagation(); sel = i; draw(); k.setPointerCapture(e.pointerId); const r = track.getBoundingClientRect(); const mv = ev => { const y = ev.clientY - r.bottom; if (y > 40 && stops.length > 2) { stops.splice(sel, 1); sel = 0; draw(); k.removeEventListener('pointermove', mv); return; } stops[sel][0] = clamp((ev.clientX - r.left) / r.width, 0, 1); draw(); }; k.addEventListener('pointermove', mv); k.addEventListener('pointerup', () => k.removeEventListener('pointermove', mv), { once: true }); }; track.append(k); }); const s = stops[sel]; colI.value = s[1]; opI.value = Math.round((s[2] ?? 1) * 100); posI.value = Math.round(s[0] * 100); };
  track.onpointerdown = e => { const r = track.getBoundingClientRect(), p = clamp((e.clientX - r.left) / r.width, 0, 1); const L = gradLutRGBA(stops), k = Math.round(p * 255) * 4; stops.push([p, rgbToHex(L[k], L[k + 1], L[k + 2]), L[k + 3]]); sel = stops.length - 1; draw(); };
  bar.onpointerdown = track.onpointerdown;
  colI.oninput = () => { stops[sel][1] = colI.value; draw(); }; opI.oninput = () => { stops[sel][2] = clamp(+opI.value, 0, 100) / 100; draw(); }; posI.oninput = () => { stops[sel][0] = clamp(+posI.value, 0, 100) / 100; draw(); };
  PRESETS.forEach(p => pre.append(h('div', { class: 'ge-pre', style: { background: gradCss(p) }, onclick: () => { stops = p.map(s => [...s]); sel = 0; draw(); } })));
  draw();
  const body = h('div', { class: 'ge' }, h('div', { class: 'muted' }, 'Presets'), pre, h('div', { class: 'muted' }, 'Click the bar to add a stop · drag stops to move · drag down to remove'), bar, track, h('div', { class: 'row' }, 'Color', colI, 'Opacity %', opI, 'Location %', posI, del));
  const r = await modal({ title: 'Gradient editor', body, width: 560, buttons: [{ label: 'Cancel', value: null }, { label: 'OK', primary: true, value: 'ok' }] });
  return r === 'ok' ? stops : null;
}
function shapePath(c, s) {
  const x = Math.min(s.x1, s.x2), y = Math.min(s.y1, s.y2), w = Math.abs(s.x2 - s.x1), hh = Math.abs(s.y2 - s.y1), cx = x + w / 2, cy = y + hh / 2;
  c.beginPath();
  switch (s.type) {
    case 'rect': O.radius > 0 ? c.roundRect(x, y, w, hh, Math.min(O.radius, w / 2, hh / 2)) : c.rect(x, y, w, hh); break;
    case 'round': c.roundRect(x, y, w, hh, Math.min(O.radius || 16, w / 2, hh / 2)); break;
    case 'ellipse': c.ellipse(cx, cy, w / 2, hh / 2, 0, 0, Math.PI * 2); break;
    case 'triangle': c.moveTo(cx, y); c.lineTo(x + w, y + hh); c.lineTo(x, y + hh); c.closePath(); break;
    case 'polygon': case 'star': { const n = O.sides, pts = s.type === 'star' ? n * 2 : n; for (let i = 0; i < pts; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / pts, rr = s.type === 'star' && i % 2 ? 0.45 : 1; const px = cx + Math.cos(a) * w / 2 * rr, py = cy + Math.sin(a) * hh / 2 * rr; i ? c.lineTo(px, py) : c.moveTo(px, py); } c.closePath(); break; }
    case 'line': case 'arrow': c.moveTo(s.x1, s.y1); c.lineTo(s.x2, s.y2); if (s.type === 'arrow') { const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1), L = Math.max(14, (O.shapeStroke || 4) * 4); c.moveTo(s.x2, s.y2); c.lineTo(s.x2 - L * Math.cos(a - 0.45), s.y2 - L * Math.sin(a - 0.45)); c.moveTo(s.x2, s.y2); c.lineTo(s.x2 - L * Math.cos(a + 0.45), s.y2 - L * Math.sin(a + 0.45)); } break;
  }
}
function drawShape(c, s, preview) {
  shapePath(c, s); const isLine = s.type === 'line' || s.type === 'arrow';
  if (O.shapeFill && !isLine) { c.fillStyle = O.shapeFillC; if (preview) c.globalAlpha = 0.7; c.fill(); c.globalAlpha = 1; }
  if (O.shapeStroke > 0 || isLine) { c.strokeStyle = isLine && !O.shapeStroke ? O.shapeFillC : O.shapeStrokeC; c.lineWidth = O.shapeStroke || 4; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(); }
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
function rasterizeLayer() { const L = AL(); if (!L || !(L.kind === 'text' || L.kind === 'frame' || L.smart)) return; const what = L.kind === 'text' ? 'type' : L.kind === 'frame' ? 'frame' : 'smart filters'; toRaster(L); pushHist('Rasterize ' + what); renderLayers(); renderOptions(); }

// =====================================================================  free transform
function startTransform() {
  const L = AL(); if (!L || !D) return; if (L.locked) return toast('Layer is locked', 'err'); if (L.kind === 'adjust') return toast('Adjustment layers cannot be transformed', 'err');
  if (L.kind === 'text' || L.kind === 'frame' || L.smart) { rasterizeLayer(); }
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
  if (O.tool !== 'move') { O.tool = 'move'; renderToolbar(); }
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
  if (d.kind === 'move') { let dx = x - d.sx, dy = y - d.sy; if (!t0.rot && !e.ctrlKey) { const w = t0.w * Math.abs(t0.sx), hh = t0.h * Math.abs(t0.sy); [dx, dy] = snapBox({ x: t0.tx - w / 2, y: t0.ty - hh / 2, w, h: hh }, dx, dy, t.layer); } t.tx = t0.tx + dx; t.ty = t0.ty + dy; }
  else if (d.kind === 'rotate') { let a = t0.rot + Math.atan2(y - t0.ty, x - t0.tx) - d.a0; if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * Math.PI / 12; t.rot = a; }
  else {
    const dirs = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]][d.handle];
    const tt = { ...t0 }; const [lx, ly] = toLocal(tt, x, y);
    let nsx = dirs[0] ? (lx * t0.sx * dirs[0] + t0.w / 2 * Math.abs(t0.sx)) / t0.w : t0.sx;
    let nsy = dirs[1] ? (ly * t0.sy * dirs[1] + t0.h / 2 * Math.abs(t0.sy)) / t0.h : t0.sy;
    if (dirs[0] && dirs[1] && (e.shiftKey === !O.freeRatio)) { const k = Math.max(nsx / t0.sx, nsy / t0.sy); nsx = t0.sx * k; nsy = t0.sy * k; }
    const ow = t0.w * t0.sx, oh = t0.h * t0.sy, nw = t0.w * nsx, nh = t0.h * nsy;
    const dxl = dirs[0] * (nw - ow) / 2, dyl = dirs[1] * (nh - oh) / 2; const cs = Math.cos(t0.rot), sn = Math.sin(t0.rot);
    t.sx = nsx; t.sy = nsy; t.tx = t0.tx + dxl * cs - dyl * sn; t.ty = t0.ty + dxl * sn + dyl * cs;
  }
}
function commitTransform() { if (!T) return; const t = T; T = null; smartLines = []; ensureCovers(t.layer); const c = t.layer.canvas.getContext('2d'); c.save(); c.translate(-t.layer.x, -t.layer.y); drawTransformed(c, t); c.restore(); renderOptions(); requestRender(); drawOverlay(); pushHist('Free transform'); }
function cancelTransform() { if (!T) return; T = null; smartLines = []; restoreHist(D.hi); renderOptions(); }
function alphaBounds(c) { const d = ctxOf(c).getImageData(0, 0, c.width, c.height).data, w = c.width; let x0 = w, y0 = c.height, x1 = -1, y1 = -1; for (let y = 0; y < c.height; y++) { const o = y * w; for (let x = 0; x < w; x++) if (d[(o + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } } return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }; }
const maskBounds = alphaBounds;
function cancelTransientTools() { T = null; cropState = null; pcropState = null; marqRect = null; lassoPts = null; shapePreview = null; gradPreview = null; patchDrag = null; liveLayer = null; smartLines = []; if (textEd) { textEd.el.remove(); textEd = null; } }

// =====================================================================  crop
function cropHandles() { const c = cropState; return [[c.x, c.y], [c.x + c.w / 2, c.y], [c.x + c.w, c.y], [c.x + c.w, c.y + c.h / 2], [c.x + c.w, c.y + c.h], [c.x + c.w / 2, c.y + c.h], [c.x, c.y + c.h], [c.x, c.y + c.h / 2]]; }
function cropDragStart(x, y) {
  const hs = cropHandles(), tol = 10 / D.zoom; for (let i = 0; i < 8; i++) if (Math.hypot(hs[i][0] - x, hs[i][1] - y) < tol) return { kind: 'h', i, c0: { ...cropState } };
  const c = cropState; if (x > c.x && x < c.x + c.w && y > c.y && y < c.y + c.h) return { kind: 'move', sx: x, sy: y, c0: { ...c } };
  return { kind: 'new', sx: x, sy: y };
}
function cropDragMove(d, x, y) {
  const ratio = cropRatioValue(); [x, y] = snapPt(x, y);
  if (d.kind === 'move') { let dx = x - d.sx, dy = y - d.sy; [dx, dy] = snapBox(d.c0, dx, dy, null); cropState.x = d.c0.x + dx; cropState.y = d.c0.y + dy; return; }
  if (d.kind === 'new') { let w = x - d.sx, hh = y - d.sy; if (ratio) hh = Math.sign(hh || 1) * Math.abs(w) / ratio; cropState = normRect({ x: d.sx, y: d.sy, w, h: hh }); return; }
  const c = { ...d.c0 }; const dir = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]][d.i];
  let x0 = c.x, y0 = c.y, x1 = c.x + c.w, y1 = c.y + c.h; if (dir[0] < 0) x0 = x; if (dir[0] > 0) x1 = x; if (dir[1] < 0) y0 = y; if (dir[1] > 0) y1 = y;
  let r = normRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }); if (ratio) { if (dir[0] === 0) { r.w = r.h * ratio; r.x = c.x + c.w / 2 - r.w / 2; } else { r.h = r.w / ratio; if (dir[1] < 0) r.y = y1 - r.h; else if (dir[1] === 0) r.y = c.y + c.h / 2 - r.h / 2; } } cropState = r;
}
async function applyCrop() {
  if (!cropState || !D) return; const c = { x: Math.round(cropState.x), y: Math.round(cropState.y), w: Math.round(cropState.w), h: Math.round(cropState.h) };
  if (c.w < 1 || c.h < 1) return;
  const outside = c.x < 0 || c.y < 0 || c.x + c.w > D.w || c.y + c.h > D.h;
  D.layers.forEach(L => { L.x -= c.x; L.y -= c.y; if (L.kind === 'text') { L.text.x -= c.x; L.text.y -= c.y; } if (L.kind === 'adjust' && L.mask) { L.x = 0; L.y = 0; const m = mk(c.w, c.h), mc = m.getContext('2d'); mc.fillStyle = '#fff'; mc.fillRect(0, 0, c.w, c.h); mc.clearRect(-c.x, -c.y, L.mask.width, L.mask.height); mc.drawImage(L.mask, -c.x, -c.y); L.mask = m; L.maskVer = Math.random(); } });
  D.w = c.w; D.h = c.h; setSel(null); cropState = O.tool === 'crop' ? { x: 0, y: 0, w: D.w, h: D.h } : null; D.layers.filter(l => l.kind === 'text').forEach(renderTextLayer); fitView(); requestRender(); pushHist('Crop');
  if (outside && O.cropFill && O.tool === 'crop') await expandFill('Content-aware crop fill');
}
function applyPerspectiveCrop() {
  if (!pcropState || !D) return; const q = pcropState; const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const ow = Math.round((dist(q[0], q[1]) + dist(q[3], q[2])) / 2), oh = Math.round((dist(q[0], q[3]) + dist(q[1], q[2])) / 2); if (ow < 2 || oh < 2) return;
  D.layers.forEach(L => {
    if (L.kind === 'adjust') { L.mask = null; L.editMask = false; return; } toRaster(L);
    if (L.mask) { const mm = mk(D.w, D.h), mc = mm.getContext('2d'); mc.fillStyle = '#fff'; mc.fillRect(0, 0, D.w, D.h); mc.clearRect(L.x, L.y, L.mask.width, L.mask.height); mc.drawImage(L.mask, L.x, L.y); const mo = X.warpPerspective(ctxOf(mm).getImageData(0, 0, D.w, D.h), q, ow, oh), m2 = mk(ow, oh); ctxOf(m2).putImageData(mo, 0, 0); L.mask = m2; L.maskVer = Math.random(); }
    const full = layerDocCanvas(L), out = X.warpPerspective(ctxOf(full).getImageData(0, 0, D.w, D.h), q, ow, oh); const n = mk(ow, oh); ctxOf(n).putImageData(out, 0, 0); L.canvas = n; L.x = 0; L.y = 0;
  });
  D.w = ow; D.h = oh; setSel(null); pcropState = null; fitView(); requestRender(); pushHist('Perspective crop'); setTool('pcrop');
}

// =====================================================================  edit operations
function selOrAll() { return D.sel || (() => { const m = mk(D.w, D.h), c = m.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, D.w, D.h); return m; })(); }
function extractSel(L, merged) {
  const m = selOrAll(), b = maskBounds(m); if (!b) return null;
  const c = mk(b.w, b.h), x = c.getContext('2d');
  if (merged || !L || L.kind === 'adjust') x.drawImage(flattenCanvas(), -b.x, -b.y); else x.drawImage(L.canvas, L.x - b.x, L.y - b.y);
  x.globalCompositeOperation = 'destination-in'; x.drawImage(m, -b.x, -b.y); return { canvas: c, x: b.x, y: b.y };
}
async function copy(merged = false) {
  if (!D) return; const L = AL(); const r = extractSel(L, merged); if (!r) return; clipboard = r;
  let ok = false; try { const blob = await new Promise(res => r.canvas.toBlob(res, 'image/png')); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); ok = true; } catch {}
  toast(merged ? (ok ? 'Merged image copied to the clipboard' : 'Merged image copied') : 'Copied');
}
async function cut() { if (!D) return; await copy(); clearSel(); }
function clearSel() { const L = AL(); if (!D || !L || L.locked || L.kind === 'adjust' || smartBlock(L)) return; ensureCovers(L); const c = L.canvas.getContext('2d'); c.save(); c.globalCompositeOperation = 'destination-out'; c.drawImage(selOrAll(), -L.x, -L.y); c.restore(); requestRender(); pushHist('Clear'); }
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
function quickFill(color, opacity = 1) { const L = AL(); if (!D || !L || L.locked || L.kind === 'adjust' || smartBlock(L)) return; if (L.kind === 'text' || L.kind === 'frame') return toast('Rasterize the layer first', 'err'); withSelection(L, (c) => { c.save(); c.globalAlpha = opacity; c.fillStyle = color; c.fillRect(0, 0, c.canvas.width, c.canvas.height); c.restore(); }); requestRender(); pushHist('Fill'); }
async function fillDialog() {
  if (!D) return; const v = await form({ title: 'Fill', fields: [{ key: 'what', label: 'Contents', type: 'select', value: 'fg', options: [{ value: 'fg', label: 'Foreground color' }, { value: 'bg', label: 'Background color' }, { value: 'color', label: 'Custom color' }, { value: 'gray', label: '50% gray' }, { value: 'white', label: 'White' }, { value: 'black', label: 'Black' }, { value: 'pattern', label: 'Pattern' }, { value: 'content', label: 'Content-aware' }] }, { key: 'color', label: 'Custom color', type: 'color', value: '#ff0000' }, { key: 'pat', label: 'Pattern', type: 'select', value: O.pattern, options: PATTERNS.map((p, i) => ({ value: i, label: p.name })) }, { key: 'op', label: 'Opacity %', type: 'range', min: 1, max: 100, value: 100 }] });
  if (!v) return;
  if (v.what === 'content') { if (!D.sel) return toast('Content-aware fill needs a selection'); return inpaintLayer(AL(), D.sel, { tool: 'fill' }); }
  if (v.what === 'pattern') { const L = AL(); if (!L || L.kind === 'adjust') return; withSelection(L, c => { c.save(); c.globalAlpha = v.op / 100; c.fillStyle = c.createPattern(patternCanvas(+v.pat), 'repeat'); c.fillRect(0, 0, c.canvas.width, c.canvas.height); c.restore(); }); requestRender(); return pushHist('Fill pattern'); }
  quickFill({ fg: O.fg, bg: O.bg, color: v.color, gray: '#808080', white: '#ffffff', black: '#000000' }[v.what], v.op / 100);
}
UI.shortcut('shift+f5', fillDialog);
async function strokeDialog() {
  if (!D?.sel) return toast('Make a selection first'); const v = await form({ title: 'Stroke selection', fields: [{ key: 'w', label: 'Width (px)', type: 'number', value: 4 }, { key: 'color', label: 'Color', type: 'color', value: O.fg }, { key: 'pos', label: 'Location', type: 'select', value: 'center', options: ['inside', 'center', 'outside'] }] }); if (!v) return;
  const L = AL(); if (L.kind === 'adjust') return; ensureCovers(L); const w = Math.max(1, +v.w), a = selAlpha();
  const outer = v.pos === 'inside' ? a : X.shiftEdge(a, D.w, D.h, v.pos === 'center' ? w / 2 : w), inner = v.pos === 'outside' ? a : X.shiftEdge(a, D.w, D.h, -(v.pos === 'center' ? w / 2 : w));
  const ring = new Uint8ClampedArray(a.length); for (let i = 0; i < a.length; i++) ring[i] = Math.max(0, outer[i] - inner[i]);
  const rc = maskFromAlpha(ring), x = rc.getContext('2d'); x.globalCompositeOperation = 'source-in'; x.fillStyle = v.color; x.fillRect(0, 0, D.w, D.h);
  L.canvas.getContext('2d').drawImage(rc, -L.x, -L.y); requestRender(); pushHist('Stroke');
}
function flipLayer(horiz) { const L = AL(); if (!L || L.kind === 'adjust') return; if (L.kind === 'text' || L.kind === 'frame' || L.smart) rasterizeLayer(); ensureCovers(L); const c = cloneCanvas(L.canvas), x = L.canvas.getContext('2d'); x.clearRect(0, 0, c.width, c.height); x.save(); horiz ? (x.translate(c.width, 0), x.scale(-1, 1)) : (x.translate(0, c.height), x.scale(1, -1)); x.drawImage(c, 0, 0); x.restore(); requestRender(); pushHist(horiz ? 'Flip horizontal' : 'Flip vertical'); }
function rotateLayer(deg) { const L = AL(); if (!L || L.kind === 'adjust') return; if (L.kind === 'text' || L.kind === 'frame' || L.smart) rasterizeLayer(); const b = alphaBounds(L.canvas); if (!b) return; const src = mk(b.w, b.h); src.getContext('2d').drawImage(L.canvas, -b.x, -b.y); L.canvas.getContext('2d').clearRect(b.x, b.y, b.w, b.h); const t = { layer: L, src, w: b.w, h: b.h, tx: L.x + b.x + b.w / 2, ty: L.y + b.y + b.h / 2, sx: 1, sy: 1, rot: deg * Math.PI / 180 }; T = t; commitTransform(); }
function alignLayer(kind) { const L = AL(); if (!L || L.kind === 'adjust') return; const b = alphaBounds(L.canvas); if (!b) return; const ax = L.x + b.x, ay = L.y + b.y; const ox = L.x, oy = L.y; if (kind === 'alignL') L.x -= ax; if (kind === 'alignC') L.x += Math.round((D.w - b.w) / 2 - ax); if (kind === 'alignR') L.x += D.w - b.w - ax; if (kind === 'alignT') L.y -= ay; if (kind === 'alignM') L.y += Math.round((D.h - b.h) / 2 - ay); if (kind === 'alignB') L.y += D.h - b.h - ay; if (L.kind === 'text') { L.text.x += L.x - ox; L.text.y += L.y - oy; renderTextLayer(L); } requestRender(); pushHist('Align'); }

// =====================================================================  image operations
function resampleCanvas(src, nw, nh, q) {
  if (q === 'none') { const c = mk(nw, nh), x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(src, 0, 0, nw, nh); return c; }
  let cur = src;
  if (q === 'sharper' || q === 'high') { while (cur.width / 2 >= nw && cur.height / 2 >= nh) { const s = mk(Math.round(cur.width / 2), Math.round(cur.height / 2)), x = s.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, s.width, s.height); cur = s; } }
  const c = mk(nw, nh), x = ctxOf(c); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = q === 'low' ? 'low' : 'high'; x.drawImage(cur, 0, 0, nw, nh);
  if (q === 'sharper' && (nw < src.width)) { const id = x.getImageData(0, 0, nw, nh); X.flt.unsharp(id, { amt: 45, r: 0.6, t: 0 }, { scale: 1 }); x.putImageData(id, 0, 0); }
  if (q === 'enlarge' && nw > src.width) { const id = x.getImageData(0, 0, nw, nh); X.flt.unsharp(id, { amt: 70, r: Math.max(0.8, nw / src.width * 0.6), t: 1 }, { scale: 1 }); x.putImageData(id, 0, 0); }
  return c;
}
async function imageSizeDialog() {
  if (!D) return;
  const v = await form({ title: 'Image size', fields: [{ key: 'w', label: 'Width (px)', type: 'number', value: D.w }, { key: 'h', label: 'Height (px)', type: 'number', value: D.h }, { key: 'lock', label: 'Constrain proportions', type: 'checkbox', value: true }, { key: 'q', label: 'Resample', type: 'select', value: 'high', options: [{ value: 'high', label: 'Automatic (bicubic, stepped)' }, { value: 'sharper', label: 'Bicubic sharper (best for reduction)' }, { value: 'enlarge', label: 'Preserve details (enlargement)' }, { value: 'low', label: 'Bilinear' }, { value: 'none', label: 'Nearest neighbor (hard edges)' }] }],
    onChange: vals => { const ins = document.querySelectorAll('.modal input[type=number]'); if (vals.lock) { if (document.activeElement === ins[0]) { ins[1].value = Math.round(vals.w * D.h / D.w); vals.h = +ins[1].value; } else if (document.activeElement === ins[1]) { ins[0].value = Math.round(vals.h * D.w / D.h); vals.w = +ins[0].value; } } } });
  if (!v) return; resizeImage(Math.max(1, Math.round(v.w)), Math.max(1, Math.round(v.h)), v.q);
}
function resizeImage(nw, nh, q = 'high') {
  const kx = nw / D.w, ky = nh / D.h;
  D.layers.forEach(L => { if (L.kind !== 'adjust') { L.canvas = resampleCanvas(L.canvas, Math.max(1, Math.round(L.canvas.width * kx)), Math.max(1, Math.round(L.canvas.height * ky)), q); } L.x = Math.round(L.x * kx); L.y = Math.round(L.y * ky); if (L.mask) { const m = mk(Math.max(1, L.mask.width * kx), Math.max(1, L.mask.height * ky)); m.getContext('2d').drawImage(L.mask, 0, 0, m.width, m.height); L.mask = m; L.maskVer = Math.random(); } if (L.kind === 'text') { L.text.x *= kx; L.text.y *= ky; L.text.size = Math.round(L.text.size * ky); }
    if (L.kind === 'frame') { L.frame.w *= kx; L.frame.h *= ky; L.frame.ox *= kx; L.frame.oy *= ky; renderFrameLayer(L); }
    if (L.smart) { L.smart.orig = resampleCanvas(L.smart.orig, L.canvas.width, L.canvas.height, q); L.smart.filters.forEach(f => { if (f.mask) f.mask = resampleCanvas(f.mask, L.canvas.width, L.canvas.height, 'high'); }); L.canvas = smartRecompute(L); } });
  D.w = nw; D.h = nh; setSel(null); D.layers.filter(l => l.kind === 'text').forEach(renderTextLayer); fitView(); requestRender(); pushHist('Image size');
}
function anchorPicker(val = 'c', onchange) {
  const g = h('div', { class: 'anchor-grid' }); const keys = ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br'];
  const draw = () => { g.innerHTML = ''; keys.forEach(k => g.append(h('button', { class: 'anc' + (k === val ? ' on' : ''), type: 'button', onclick: () => { val = k; onchange(k); draw(); } }, k === val ? '●' : ''))); }; draw(); return g;
}
async function canvasSizeDialog() {
  if (!D) return; let anchor = 'c';
  const wI = h('input', { type: 'number', value: D.w }), hI = h('input', { type: 'number', value: D.h }), rel = h('input', { type: 'checkbox' }), col = h('input', { type: 'color', value: O.bg }), fillSel = h('select', {}, h('option', { value: 'color' }, 'Color'), h('option', { value: 'transparent' }, 'Transparent'), h('option', { value: 'content' }, 'Content-aware (generative)'));
  rel.onchange = () => { wI.value = rel.checked ? 0 : D.w; hI.value = rel.checked ? 0 : D.h; };
  const body = h('div', { class: 'form-grid' }, h('label', { class: 'field' }, 'Width (px)', wI), h('label', { class: 'field' }, 'Height (px)', hI), h('label', { class: 'row', style: { color: 'var(--tx-1)' } }, rel, 'Relative'), h('div', { class: 'field' }, h('span', {}, 'Anchor'), anchorPicker('c', k => anchor = k)), h('label', { class: 'field' }, 'Extension fill', fillSel), h('label', { class: 'field' }, 'Extension color', col));
  const r = await modal({ title: 'Canvas size', body, width: 420, buttons: [{ label: 'Cancel', value: null }, { label: 'OK', primary: true, value: 'ok' }] }); if (r !== 'ok') return;
  const nw = Math.max(1, rel.checked ? D.w + +wI.value : +wI.value), nh = Math.max(1, rel.checked ? D.h + +hI.value : +hI.value);
  await resizeCanvas(nw, nh, anchor, fillSel.value, col.value);
}
async function resizeCanvas(nw, nh, a, fill = 'color', color = O.bg) {
  const dx = a.includes('l') ? 0 : a.includes('r') ? nw - D.w : Math.round((nw - D.w) / 2), dy = a.includes('t') ? 0 : a.includes('b') ? nh - D.h : Math.round((nh - D.h) / 2);
  D.layers.forEach(L => { if (L.kind === 'adjust') { if (L.mask) { const m = mk(nw, nh), mc = m.getContext('2d'); mc.fillStyle = '#fff'; mc.fillRect(0, 0, nw, nh); mc.clearRect(dx, dy, L.mask.width, L.mask.height); mc.drawImage(L.mask, dx, dy); L.mask = m; L.maskVer = Math.random(); } return; } L.x += dx; L.y += dy; if (L.kind === 'text') { L.text.x += dx; L.text.y += dy; } });
  const bgL = D.layers[0]; if (fill === 'color' && bgL.name === 'Background' && bgL.kind === 'raster') { const n = mk(nw, nh), c = n.getContext('2d'); c.fillStyle = color; c.fillRect(0, 0, nw, nh); c.drawImage(bgL.canvas, bgL.x, bgL.y); bgL.canvas = n; bgL.x = 0; bgL.y = 0; }
  D.w = nw; D.h = nh; setSel(null); D.layers.filter(l => l.kind === 'text').forEach(renderTextLayer); fitView(); requestRender(); pushHist('Canvas size');
  if (fill === 'content') await expandFill();
}
// fill transparent areas of the composite with synthesized content (as a new bottom layer)
async function expandFill(label = 'Generative expand') {
  const flat = flattenCanvas(), fc = ctxOf(flat), W = D.w, H = D.h; const all = fc.getImageData(0, 0, W, H), ad = all.data; let n = 0;
  const hole = new Uint8Array(W * H); for (let i = 0; i < hole.length; i++) if (ad[i * 4 + 3] < 250) { hole[i] = 1; n++; }
  if (!n) return toast('Nothing to fill'); if (n === hole.length) return toast('The image is empty', 'err');
  await withBusy('Generating expanded content…', async () => {
    const MAXP = 3.2e6; let k = Math.min(1, Math.sqrt(MAXP / (W * H)));
    // make partially transparent pixels opaque for synthesis
    for (let i = 0; i < hole.length; i++) if (!hole[i]) ad[i * 4 + 3] = 255;
    let res;
    if (k < 1) {
      const sw = Math.round(W * k), sh = Math.round(H * k), tmp = mk(W, H); ctxOf(tmp).putImageData(all, 0, 0); const s = mk(sw, sh), sx = ctxOf(s); sx.imageSmoothingQuality = 'high'; sx.drawImage(tmp, 0, 0, sw, sh);
      const si = sx.getImageData(0, 0, sw, sh), shole = new Uint8Array(sw * sh); for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const xa = Math.floor(x / k), ya = Math.floor(y / k), xb = Math.min(W - 1, Math.ceil((x + 1) / k)), yb = Math.min(H - 1, Math.ceil((y + 1) / k)); let any = 0; for (let yy = ya; yy <= yb && !any; yy++) for (let xx = xa; xx <= xb; xx++) if (hole[yy * W + xx]) { any = 1; break; } shole[y * sw + x] = any; }
      X.inpaint(si.data, sw, sh, shole, { patch: 3 }); sx.putImageData(si, 0, 0); const up = mk(W, H), ux = ctxOf(up); ux.imageSmoothingQuality = 'high'; ux.drawImage(s, 0, 0, W, H); res = ux.getImageData(0, 0, W, H);
    } else { res = new ImageData(new Uint8ClampedArray(ad), W, H); X.inpaint(res.data, W, H, hole, { patch: 3 }); }
    // keep only the synthesized pixels; feather into the original edge
    const near = X.distanceTo(W, H, i => !hole[i]); const rd = res.data;
    for (let i = 0; i < hole.length; i++) { rd[i * 4 + 3] = hole[i] ? 255 : near[i] === 0 ? 0 : 255; }
    const L = newLayer(label, W, H); ctxOf(L.canvas).putImageData(res, 0, 0);
    D.layers.splice(0, 0, L); D.active = Math.min(D.layers.length - 1, D.active + 1); requestRender(); pushHist(label);
  });
}
async function expandDialog() {
  if (!D) return;
  const v = await form({ title: 'Generative expand canvas', width: 420, fields: [
    { key: 'mode', label: 'Expand', type: 'select', value: 'ratio', options: [{ value: 'ratio', label: 'To an aspect ratio' }, { value: 'px', label: 'By pixels on each side' }, { value: 'pct', label: 'By a percentage' }] },
    { key: 'ratio', label: 'Aspect ratio', type: 'select', value: '1.7778', options: [{ value: '1', label: '1:1' }, { value: '0.8', label: '4:5' }, { value: '1.7778', label: '16:9' }, { value: '0.5625', label: '9:16' }, { value: '1.5', label: '3:2' }, { value: '1.3333', label: '4:3' }, { value: '2.3333', label: '21:9 (cinema)' }] },
    { key: 'top', label: 'Top (px)', type: 'number', value: 0 }, { key: 'right', label: 'Right (px)', type: 'number', value: 200 }, { key: 'bottom', label: 'Bottom (px)', type: 'number', value: 0 }, { key: 'left', label: 'Left (px)', type: 'number', value: 200 },
    { key: 'pct', label: 'Percentage (all sides)', type: 'range', min: 5, max: 100, value: 25 }], ok: 'Generate' });
  if (!v) return; let nw = D.w, nh = D.h, dx = 0, dy = 0;
  if (v.mode === 'ratio') { const r = +v.ratio; if (D.w / D.h < r) nw = Math.round(D.h * r); else nh = Math.round(D.w / r); dx = Math.round((nw - D.w) / 2); dy = Math.round((nh - D.h) / 2); }
  else if (v.mode === 'px') { dx = Math.max(0, +v.left); dy = Math.max(0, +v.top); nw = D.w + dx + Math.max(0, +v.right); nh = D.h + dy + Math.max(0, +v.bottom); }
  else { const p = v.pct / 100; dx = Math.round(D.w * p / 2); dy = Math.round(D.h * p / 2); nw = D.w + dx * 2; nh = D.h + dy * 2; }
  if (nw === D.w && nh === D.h) return toast('The image already has that shape');
  D.layers.forEach(L => { if (L.kind === 'adjust') { if (L.mask) { const m = mk(nw, nh), mc = m.getContext('2d'); mc.fillStyle = '#fff'; mc.fillRect(0, 0, nw, nh); mc.clearRect(dx, dy, L.mask.width, L.mask.height); mc.drawImage(L.mask, dx, dy); L.mask = m; L.maskVer = Math.random(); } return; } L.x += dx; L.y += dy; if (L.kind === 'text') { L.text.x += dx; L.text.y += dy; } });
  D.w = nw; D.h = nh; setSel(null); D.layers.filter(l => l.kind === 'text').forEach(renderTextLayer); fitView(); requestRender(); pushHist('Expand canvas');
  await expandFill();
}
function rotateCanvas(deg) {
  if (!D) return; const W = D.w, H = D.h, swap = Math.abs(deg) === 90;
  D.layers.forEach(L => { if (L.kind === 'adjust') { if (L.mask) { const m = mk(swap ? H : W, swap ? W : H), mc = m.getContext('2d'); mc.translate(m.width / 2, m.height / 2); mc.rotate(deg * Math.PI / 180); mc.drawImage(L.mask, -W / 2, -H / 2); L.mask = m; L.maskVer = Math.random(); } return; } toRaster(L); ensureCovers(L); const full = mk(W, H); full.getContext('2d').drawImage(L.canvas, L.x, L.y); const n = mk(swap ? H : W, swap ? W : H), c = n.getContext('2d'); c.translate(n.width / 2, n.height / 2); c.rotate(deg * Math.PI / 180); c.drawImage(full, -W / 2, -H / 2); if (L.mask) { const mm = mk(W, H), mmc = mm.getContext('2d'); mmc.fillStyle = '#fff'; mmc.fillRect(0, 0, W, H); mmc.clearRect(L.x, L.y, L.mask.width, L.mask.height); mmc.drawImage(L.mask, L.x, L.y); const m = mk(n.width, n.height), mc = m.getContext('2d'); mc.translate(n.width / 2, n.height / 2); mc.rotate(deg * Math.PI / 180); mc.drawImage(mm, -W / 2, -H / 2); L.mask = m; L.maskVer = Math.random(); } L.canvas = n; L.x = 0; L.y = 0; });
  if (swap) { D.w = H; D.h = W; } setSel(null); fitView(); requestRender(); pushHist('Rotate canvas');
}
// arbitrary rotation: mode 'crop' (largest same-aspect rectangle), 'expand' (grow canvas), 'fill' (keep size, content-aware fill corners)
async function rotateArbitrary(deg, mode = 'crop') {
  if (!D || !deg) return; const W = D.w, H = D.h, a = deg * Math.PI / 180, ca = Math.abs(Math.cos(a)), sa = Math.abs(Math.sin(a));
  let nw = W, nh = H; if (mode === 'expand') { nw = Math.ceil(W * ca + H * sa); nh = Math.ceil(W * sa + H * ca); }
  else if (mode === 'crop') { const k = Math.min(W / (W * ca + H * sa), H / (W * sa + H * ca)); nw = Math.floor(W * k); nh = Math.floor(H * k); }
  const rot = (src, fillWhite) => { const n = mk(nw, nh), c = n.getContext('2d'); if (fillWhite) { c.fillStyle = '#fff'; c.fillRect(0, 0, nw, nh); } c.translate(nw / 2, nh / 2); c.rotate(a); c.imageSmoothingQuality = 'high'; c.drawImage(src, -W / 2, -H / 2); return n; };
  D.layers.forEach(L => { if (L.kind === 'adjust') { if (L.mask) { L.mask = rot(L.mask, true); L.maskVer = Math.random(); } return; } toRaster(L); L.canvas = rot(layerDocCanvas(L)); if (L.mask) { const mm = mk(W, H), mmc = mm.getContext('2d'); mmc.fillStyle = '#fff'; mmc.fillRect(0, 0, W, H); mmc.clearRect(L.x, L.y, L.mask.width, L.mask.height); mmc.drawImage(L.mask, L.x, L.y); L.mask = rot(mm, true); L.maskVer = Math.random(); } L.x = 0; L.y = 0; });
  D.w = nw; D.h = nh; setSel(null); fitView(); requestRender(); pushHist('Rotate ' + (Math.round(deg * 10) / 10) + '°');
  if (mode === 'fill') await expandFill('Content-aware edges');
}
async function straightenDialog(initial = 0) {
  if (!D) return; const flat = flattenCanvas(), k = Math.min(1, 420 / Math.max(D.w, D.h)), pw = Math.round(D.w * k), ph = Math.round(D.h * k);
  const pv = h('canvas', { width: pw, height: ph, class: 'ph-preview-cv' }); let ang = initial, mode = 'crop';
  const draw = () => { const c = pv.getContext('2d'); c.clearRect(0, 0, pw, ph); c.save(); c.translate(pw / 2, ph / 2); c.rotate(ang * Math.PI / 180); c.drawImage(flat, -pw / 2, -ph / 2, pw, ph); c.restore(); if (mode === 'crop' && ang) { const a = ang * Math.PI / 180, ca = Math.abs(Math.cos(a)), sa = Math.abs(Math.sin(a)), kk = Math.min(pw / (pw * ca + ph * sa), ph / (pw * sa + ph * ca)); c.strokeStyle = '#ffd400'; c.setLineDash([5, 4]); c.strokeRect((pw - pw * kk) / 2, (ph - ph * kk) / 2, pw * kk, ph * kk); c.setLineDash([]); } c.strokeStyle = 'rgba(255,255,255,.35)'; c.beginPath(); for (let i = 1; i < 6; i++) { c.moveTo(0, ph * i / 6); c.lineTo(pw, ph * i / 6); c.moveTo(pw * i / 6, 0); c.lineTo(pw * i / 6, ph); } c.stroke(); };
  const fields = h('div', { class: 'ph-fields' }); buildFields(fields, [{ key: 'a', label: 'Angle (°)', type: 'range', min: -45, max: 45, step: 0.1, value: ang }, { key: 'mode', label: 'Edges', type: 'select', value: 'crop', options: [{ value: 'crop', label: 'Crop to fit (no empty corners)' }, { value: 'expand', label: 'Expand canvas (keep everything)' }, { value: 'fill', label: 'Content-aware fill corners' }] }], { a: ang, mode }, vals => { ang = vals.a; mode = vals.mode; draw(); });
  draw();
  const auto = h('button', { class: 'btn sm', style: { alignSelf: 'flex-start' }, onclick: () => { const s = mk(Math.round(D.w * Math.min(1, 700 / Math.max(D.w, D.h))), Math.round(D.h * Math.min(1, 700 / Math.max(D.w, D.h)))); ctxOf(s).drawImage(flat, 0, 0, s.width, s.height); ang = -X.estimateTilt(ctxOf(s).getImageData(0, 0, s.width, s.height)); const inp = fields.querySelectorAll('input'); inp[0].value = inp[1].value = ang.toFixed(1); draw(); } }, 'Auto');
  const r = await modal({ title: 'Straighten / rotate', width: 760, body: h('div', { class: 'ph-dlg' }, h('div', { class: 'ph-preview' }, pv), h('div', { class: 'ph-side' }, fields, auto)), buttons: [{ label: 'Cancel', value: null }, { label: 'Apply', primary: true, value: 'ok' }] });
  if (r === 'ok' && Math.abs(ang) > 0.01) await rotateArbitrary(ang, mode);
}
async function autoStraighten() {
  if (!D) return; const flat = flattenCanvas(), k = Math.min(1, 800 / Math.max(D.w, D.h)), s = mk(Math.round(D.w * k), Math.round(D.h * k)); ctxOf(s).drawImage(flat, 0, 0, s.width, s.height);
  const tilt = X.estimateTilt(ctxOf(s).getImageData(0, 0, s.width, s.height));
  if (Math.abs(tilt) < 0.15) return toast('The image already looks straight');
  await rotateArbitrary(-tilt, 'crop'); toast(`Straightened by ${(-tilt).toFixed(1)}°`, 'ok');
}
function flipCanvas(horiz) { if (!D) return; D.layers.forEach(L => { if (L.kind === 'adjust') { if (L.mask) { const c = cloneCanvas(L.mask), x = L.mask.getContext('2d'); x.clearRect(0, 0, c.width, c.height); x.save(); horiz ? (x.translate(c.width, 0), x.scale(-1, 1)) : (x.translate(0, c.height), x.scale(1, -1)); x.drawImage(c, 0, 0); x.restore(); L.maskVer = Math.random(); } return; } toRaster(L); ensureCovers(L); const c = cloneCanvas(L.canvas), x = L.canvas.getContext('2d'); x.clearRect(0, 0, c.width, c.height); x.save(); horiz ? (x.translate(c.width, 0), x.scale(-1, 1)) : (x.translate(0, c.height), x.scale(1, -1)); x.drawImage(c, 0, 0); x.restore(); if (L.mask) { const m = cloneCanvas(L.mask), mx = L.mask.getContext('2d'); mx.clearRect(0, 0, m.width, m.height); mx.save(); horiz ? (mx.translate(m.width, 0), mx.scale(-1, 1)) : (mx.translate(0, m.height), mx.scale(1, -1)); mx.drawImage(m, 0, 0); mx.restore(); L.maskVer = Math.random(); } if (horiz) L.x = D.w - L.x - c.width; else L.y = D.h - L.y - c.height; }); requestRender(); pushHist('Flip canvas'); }
function cropToSelection() { if (!D?.sel) return; const b = maskBounds(D.sel); if (!b) return; cropState = b; applyCrop(); cropState = null; drawOverlay(); }
function trimCanvas(based = 'transparent') {
  if (!D) return; const flat = flattenCanvas(); let b;
  if (based === 'transparent') b = alphaBounds(flat);
  else { const d = ctxOf(flat).getImageData(0, 0, D.w, D.h).data, j0 = based === 'tl' ? 0 : (D.w * D.h - 1) * 4, r0 = d[j0], g0 = d[j0 + 1], b0 = d[j0 + 2]; let x0 = D.w, y0 = D.h, x1 = -1, y1 = -1; for (let y = 0; y < D.h; y++) for (let x = 0; x < D.w; x++) { const j = (y * D.w + x) * 4; if (Math.abs(d[j] - r0) + Math.abs(d[j + 1] - g0) + Math.abs(d[j + 2] - b0) > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } } b = x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }; }
  if (!b) return toast('Nothing to trim'); cropState = b; applyCrop(); cropState = null; drawOverlay();
}
async function trimDialog() { const v = await form({ title: 'Trim', fields: [{ key: 'b', label: 'Based on', type: 'select', value: 'transparent', options: [{ value: 'transparent', label: 'Transparent pixels' }, { value: 'tl', label: 'Top-left pixel color' }, { value: 'br', label: 'Bottom-right pixel color' }] }], ok: 'Trim' }); if (v) trimCanvas(v.b); }
function revealAll() {
  if (!D) return; let x0 = 0, y0 = 0, x1 = D.w, y1 = D.h; D.layers.forEach(L => { if (L.kind === 'adjust') return; const b = layerBounds(L); if (!b) return; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); });
  if (x0 === 0 && y0 === 0 && x1 === D.w && y1 === D.h) return toast('All layer content is already visible');
  const dx = -x0, dy = -y0; D.layers.forEach(L => { if (L.kind === 'adjust') { if (L.mask) { const m = mk(x1 - x0, y1 - y0), mc = m.getContext('2d'); mc.fillStyle = '#fff'; mc.fillRect(0, 0, m.width, m.height); mc.clearRect(dx, dy, L.mask.width, L.mask.height); mc.drawImage(L.mask, dx, dy); L.mask = m; L.maskVer = Math.random(); } return; } L.x += dx; L.y += dy; if (L.kind === 'text') { L.text.x += dx; L.text.y += dy; } });
  D.w = x1 - x0; D.h = y1 - y0; setSel(null); D.layers.filter(l => l.kind === 'text').forEach(renderTextLayer); fitView(); requestRender(); pushHist('Reveal all');
}
function duplicateDoc() { if (!D) return; const d = createDoc({ w: D.w, h: D.h, name: D.name.replace(/(\.\w+)?$/, ' copy'), bg: null }); d.layers = D.layers.map(cloneLayer); d.guides = JSON.parse(JSON.stringify(D.guides || [])); addDoc(d); }

// =====================================================================  layers
function addLayer(name) { if (!D) return; const L = newLayer(name || `Layer ${D.layers.length}`, D.w, D.h); D.layers.splice(D.active + 1, 0, L); D.active++; renderLayers(); pushHist('New layer'); }
function duplicateLayer(silent) { const L = AL(); if (!L) return; const c = cloneLayer(L); c.id = uid(); c.name = L.name + ' copy'; D.layers.splice(D.active + 1, 0, c); D.active++; renderLayers(); if (silent !== true) { requestRender(); pushHist('Duplicate layer'); } }
function deleteLayer() { if (!D || D.layers.length <= 1) return toast('An image needs at least one layer'); D.layers.splice(D.active, 1); D.active = clamp(D.active - 1, 0, D.layers.length - 1); requestRender(); pushHist('Delete layer'); }
async function renameLayer() { const L = AL(); if (!L) return; const v = await prompt('Rename layer', 'Name', L.name); if (v) { L.name = v; pushHist('Rename layer'); } }
function layerVia(cutIt) { const L = AL(); if (!D || !L || L.kind === 'adjust') return; const r = extractSel(L); if (!r) return; if (cutIt) { const c = L.canvas.getContext('2d'); c.save(); c.globalCompositeOperation = 'destination-out'; c.drawImage(selOrAll(), -L.x, -L.y); c.restore(); } const n = newLayer(cutIt ? 'Layer via cut' : 'Layer via copy', r.canvas.width, r.canvas.height); n.canvas = r.canvas; n.x = r.x; n.y = r.y; D.layers.splice(D.active + 1, 0, n); D.active++; setSel(null); requestRender(); pushHist(cutIt ? 'Layer via cut' : 'Layer via copy'); }
UI.shortcut('ctrl+j', () => layerVia(false)); UI.shortcut('ctrl+shift+j', () => layerVia(true)); UI.shortcut('ctrl+shift+n', () => addLayer());
function moveLayer(d) { if (!D) return; const i = D.active, j = clamp(i + d, 0, D.layers.length - 1); if (i === j) return; const [L] = D.layers.splice(i, 1); D.layers.splice(j, 0, L); D.active = j; requestRender(); pushHist('Arrange'); }
UI.shortcut('ctrl+]', () => moveLayer(1)); UI.shortcut('ctrl+[', () => moveLayer(-1)); UI.shortcut('ctrl+shift+]', () => moveLayer(99)); UI.shortcut('ctrl+shift+[', () => moveLayer(-99));
function bakeLayer(L) { const r = layerRender(L, false); const c = mk(D.w, D.h); c.getContext('2d').drawImage(r.canvas, r.x, r.y); return c; }
// an adjustment layer's visible effect as pixels (adjusted composite below, masked)
function stampAdjust(i) { const L = D.layers[i], below = compositeBelow(i), c = mk(D.w, D.h), x = ctxOf(c); x.drawImage(below, 0, 0); const vis = L.visible; L.visible = true; const op = L.opacity; L.opacity = 1; applyAdjustLayer(x, L, false); L.visible = vis; L.opacity = op; const m = maskBytes(L); if (m) { const id = x.getImageData(0, 0, D.w, D.h); for (let p = 0; p < m.length; p++) id.data[p * 4 + 3] = id.data[p * 4 + 3] * m[p] / 255; x.putImageData(id, 0, 0); } return c; }
function mergeDown() {
  if (!D || D.active === 0) return; const top = D.layers[D.active], bot = D.layers[D.active - 1];
  if (bot.kind === 'adjust') return toast('Cannot merge onto an adjustment layer', 'err');
  const base = bakeLayer(bot), bc = ctxOf(base);
  if (top.visible) { if (top.kind === 'adjust') { const tmp = mk(D.w, D.h), tx = ctxOf(tmp); tx.drawImage(base, 0, 0); applyAdjustLayer(tx, top, false); bc.clearRect(0, 0, D.w, D.h); bc.drawImage(tmp, 0, 0); } else { bc.save(); bc.globalAlpha = top.opacity; bc.globalCompositeOperation = top.blend; bc.drawImage(bakeLayer(top), 0, 0); bc.restore(); } }
  Object.assign(bot, { canvas: base, x: 0, y: 0, mask: null, fx: {}, kind: 'raster', text: undefined }); D.layers.splice(D.active, 1); D.active--; requestRender(); pushHist('Merge down');
}
function mergeVisible() { if (!D) return; const c = flattenCanvas(); const vis = D.layers.filter(l => l.visible); if (vis.length < 2) return; const L = newLayer('Merged', D.w, D.h); L.canvas = c; D.layers = D.layers.filter(l => !l.visible || l === vis[vis.length - 1]); D.layers[D.layers.indexOf(vis[vis.length - 1])] = L; D.active = D.layers.indexOf(L); requestRender(); pushHist('Merge visible'); }
UI.shortcut('ctrl+e', mergeDown); UI.shortcut('ctrl+shift+e', mergeVisible);
function flatten() { if (!D) return; const c = mk(D.w, D.h), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, D.w, D.h); x.drawImage(flattenCanvas(), 0, 0); const L = newLayer('Background', D.w, D.h); L.canvas = c; D.layers = [L]; D.active = 0; requestRender(); pushHist('Flatten image'); }
function addMask(kind, silent) {
  const L = AL(); if (!L) return; ensureCovers(L); const w = L.kind === 'adjust' ? D.w : L.canvas.width, hh = L.kind === 'adjust' ? D.h : L.canvas.height; if (L.kind === 'adjust') { L.x = 0; L.y = 0; }
  const m = mk(w, hh), c = m.getContext('2d'); c.fillStyle = kind === 'none' ? '#000' : '#fff'; c.fillRect(0, 0, w, hh);
  if (kind === 'sel' && D.sel) { c.fillStyle = '#000'; c.fillRect(0, 0, w, hh); const s = cloneCanvas(D.sel), sc = s.getContext('2d'); sc.globalCompositeOperation = 'source-in'; sc.fillStyle = '#fff'; sc.fillRect(0, 0, s.width, s.height); c.drawImage(s, -L.x, -L.y); setSel(null); }
  L.mask = m; L.maskVer = Math.random(); L.editMask = true; requestRender(); if (!silent) { pushHist('Add layer mask'); toast('Mask added — paint black to hide, white to reveal'); }
}
function maskFromDocAlpha(L, alpha /* Uint8 doc-size */) { ensureCovers(L); const w = L.kind === 'adjust' ? D.w : L.canvas.width, hh = L.kind === 'adjust' ? D.h : L.canvas.height; const m = mk(w, hh), c = ctxOf(m); c.fillStyle = '#000'; c.fillRect(0, 0, w, hh); const doc = mk(D.w, D.h), dc = ctxOf(doc), id = dc.createImageData(D.w, D.h); for (let i = 0; i < alpha.length; i++) { const j = i * 4; id.data[j] = id.data[j + 1] = id.data[j + 2] = alpha[i]; id.data[j + 3] = 255; } dc.putImageData(id, 0, 0); c.drawImage(doc, -L.x, -L.y); L.mask = m; L.maskVer = Math.random(); L.editMask = false; }
function applyMask() { const L = AL(); if (!L?.mask || L.kind === 'adjust') return; const c = L.canvas.getContext('2d'); c.globalCompositeOperation = 'destination-in'; c.drawImage(maskAlpha(L), 0, 0); c.globalCompositeOperation = 'source-over'; L.mask = null; L.editMask = false; requestRender(); pushHist('Apply mask'); }
function deleteMask() { const L = AL(); if (!L?.mask) return; L.mask = null; L.editMask = false; requestRender(); pushHist('Delete mask'); }
function invertMask() { const L = AL(); if (!L?.mask) return; const c = ctxOf(L.mask), id = c.getImageData(0, 0, L.mask.width, L.mask.height); for (let i = 0; i < id.data.length; i += 4) { id.data[i] = id.data[i + 1] = id.data[i + 2] = 255 - id.data[i]; id.data[i + 3] = 255; } c.putImageData(id, 0, 0); L.maskVer = Math.random(); requestRender(); pushHist('Invert mask'); }

// =====================================================================  layer style dialog
function copyFx() { const L = AL(); if (!L) return; fxClipboard = JSON.parse(JSON.stringify(L.fx || {})); toast(Object.keys(fxClipboard).length ? 'Layer style copied' : 'This layer has no style — copied an empty style'); }
function pasteFx() { const L = AL(); if (!L || !fxClipboard) return; if (L.kind === 'adjust') return toast('Adjustment layers cannot have styles', 'err'); L.fx = JSON.parse(JSON.stringify(fxClipboard)); requestRender(); pushHist('Paste layer style'); renderLayers(); }
function clearFx() { const L = AL(); if (!L) return; L.fx = {}; requestRender(); pushHist('Clear layer style'); renderLayers(); }
const BLEND_OPTS = BLENDS.map(([v, l]) => ({ value: v, label: l }));
function fxFields(k) {
  const col = (key, label = 'Color') => ({ key, label, type: 'color' }), op = { key: 'opacity', label: 'Opacity %', type: 'range', min: 0, max: 100, scale: 100 }, ang = { key: 'angle', label: 'Angle °', type: 'range', min: -180, max: 180 }, bl = { key: 'blend', label: 'Blend mode', type: 'select', options: BLEND_OPTS };
  return {
    shadow: [col('color'), op, ang, { key: 'distance', label: 'Distance', type: 'range', min: 0, max: 300 }, { key: 'spread', label: 'Spread %', type: 'range', min: 0, max: 100 }, { key: 'size', label: 'Size', type: 'range', min: 0, max: 250 }],
    innerShadow: [col('color'), bl, op, ang, { key: 'distance', label: 'Distance', type: 'range', min: 0, max: 200 }, { key: 'choke', label: 'Choke %', type: 'range', min: 0, max: 100 }, { key: 'size', label: 'Size', type: 'range', min: 0, max: 150 }],
    glow: [col('color'), op, { key: 'spread', label: 'Spread %', type: 'range', min: 0, max: 100 }, { key: 'size', label: 'Size', type: 'range', min: 1, max: 250 }],
    innerGlow: [col('color'), bl, op, { key: 'source', label: 'Source', type: 'select', options: [{ value: 'edge', label: 'Edge' }, { value: 'center', label: 'Center' }] }, { key: 'choke', label: 'Choke %', type: 'range', min: 0, max: 100 }, { key: 'size', label: 'Size', type: 'range', min: 1, max: 150 }],
    stroke: [col('color'), { key: 'size', label: 'Size', type: 'range', min: 1, max: 100 }, { key: 'pos', label: 'Position', type: 'select', options: [{ value: 'outside', label: 'Outside' }, { value: 'center', label: 'Center' }, { value: 'inside', label: 'Inside' }] }, op],
    colorOverlay: [col('color'), bl, op],
    gradOverlay: [{ key: 'stops', label: 'Gradient', type: 'stops' }, bl, op, { key: 'style', label: 'Style', type: 'select', options: [{ value: 'linear', label: 'Linear' }, { value: 'radial', label: 'Radial' }] }, ang, { key: 'scale', label: 'Scale %', type: 'range', min: 10, max: 150 }, { key: 'reverse', label: 'Reverse', type: 'checkbox' }],
    patternOverlay: [{ key: 'pattern', label: 'Pattern', type: 'pattern' }, bl, op, { key: 'scale', label: 'Scale', type: 'range', min: 0.1, max: 8, step: 0.1 }],
    bevel: [{ key: 'dir', label: 'Direction', type: 'select', options: [{ value: 'up', label: 'Up' }, { value: 'down', label: 'Down' }] }, { key: 'depth', label: 'Depth %', type: 'range', min: 1, max: 500 }, { key: 'size', label: 'Size', type: 'range', min: 1, max: 100 }, { key: 'soften', label: 'Soften', type: 'range', min: 0, max: 16 }, ang, { key: 'altitude', label: 'Altitude °', type: 'range', min: 0, max: 90 }, col('hl', 'Highlight'), { key: 'hlo', label: 'Highlight opacity %', type: 'range', min: 0, max: 100, scale: 100 }, col('sh', 'Shadow'), { key: 'sho', label: 'Shadow opacity %', type: 'range', min: 0, max: 100, scale: 100 }],
  }[k];
}
async function layerStyleDialog(focus) {
  const L = AL(); if (!L || !D) return toast('Select a layer'); if (L.kind === 'adjust') return toast('Adjustment layers cannot have styles', 'err');
  const before = JSON.parse(JSON.stringify(L.fx || {})); const work = {}; FX_LIST.forEach(([k]) => work[k] = { ...FX_DEF[k], ...(before[k] || {}), stops: (before[k]?.stops || FX_DEF[k].stops)?.map(s => [...s]) });
  const on = {}; FX_LIST.forEach(([k]) => on[k] = !!before[k]); if (focus) on[focus] = true;
  let cur = focus || FX_LIST.find(([k]) => on[k])?.[0] || 'shadow';
  const list = h('div', { class: 'fx-list' }), pane = h('div', { class: 'fx-pane' }), blendRow = h('div', { class: 'fx-blend' });
  const commitLive = () => { const fx = {}; FX_LIST.forEach(([k]) => { if (on[k]) { const o = { ...work[k] }; if (!o.stops) delete o.stops; fx[k] = o; } }); L.fx = fx; proxyRender(); renderLayers(); };
  const drawList = () => { list.innerHTML = ''; FX_LIST.forEach(([k, n]) => { const cb = h('input', { type: 'checkbox', checked: on[k] }); cb.onclick = e => { e.stopPropagation(); on[k] = cb.checked; if (cb.checked) cur = k; drawList(); drawPane(); commitLive(); }; list.append(h('div', { class: 'fx-item' + (k === cur ? ' sel' : ''), onclick: () => { cur = k; if (!on[k]) { on[k] = true; commitLive(); } drawList(); drawPane(); } }, cb, n)); }); };
  const drawPane = () => { pane.innerHTML = ''; pane.append(h('div', { class: 'fx-title' }, FX_LIST.find(x => x[0] === cur)[1])); const f = h('div', { class: 'ph-fields' }); buildFields(f, fxFields(cur), work[cur], () => { on[cur] = true; list.querySelectorAll('.fx-item')[FX_LIST.findIndex(x => x[0] === cur)].querySelector('input').checked = true; commitLive(); }); pane.append(f); };
  // general blending options
  const bsel = h('select', {}, ...BLENDS.map(([v, l]) => h('option', { value: v, selected: L.blend === v }, l))), bop = h('input', { type: 'number', min: 0, max: 100, value: Math.round(L.opacity * 100), style: { width: '64px' } });
  const ob = L.blend, oo = L.opacity; bsel.onchange = () => { L.blend = bsel.value; requestRender(); }; bop.oninput = () => { L.opacity = clamp(+bop.value, 0, 100) / 100; requestRender(); };
  blendRow.append(h('span', { class: 'muted' }, 'Layer blend'), bsel, h('span', { class: 'muted' }, 'Opacity %'), bop);
  drawList(); drawPane(); commitLive();
  const tools = h('div', { class: 'row', style: { gap: '6px' } }, h('button', { class: 'btn sm', onclick: () => { fxClipboard = JSON.parse(JSON.stringify(L.fx)); toast('Style copied'); } }, 'Copy style'), h('button', { class: 'btn sm', disabled: !fxClipboard, onclick: () => { if (!fxClipboard) return; FX_LIST.forEach(([k]) => { on[k] = !!fxClipboard[k]; if (fxClipboard[k]) work[k] = { ...FX_DEF[k], ...fxClipboard[k] }; }); drawList(); drawPane(); commitLive(); } }, 'Paste style'), h('button', { class: 'btn sm', onclick: () => { FX_LIST.forEach(([k]) => on[k] = false); drawList(); commitLive(); } }, 'Clear all'));
  const r = await floatPanel({ title: 'Layer style — ' + L.name, width: 560, body: h('div', { class: 'fx-dlg' }, blendRow, h('div', { class: 'fx-main' }, list, pane), tools) });
  if (!r) { L.fx = before; L.blend = ob; L.opacity = oo; requestRender(); renderLayers(); return; }
  commitLive(); pushHist('Layer style'); renderLayers();
}

// =====================================================================  generic field builder (range/number/select/checkbox/color/stops/pattern/text)
function buildFields(el, fields, vals, onChange) {
  fields.forEach(fd => {
    if (vals[fd.key] === undefined && fd.value !== undefined) vals[fd.key] = fd.value;
    const sc = fd.scale || 1; const v = vals[fd.key];
    if (fd.type === 'range') {
      const num = h('input', { type: 'number', value: Math.round(v * sc * 100) / 100, min: fd.min, max: fd.max, step: fd.step || 1, style: { width: '64px' } });
      const rng = h('input', { type: 'range', value: v * sc, min: fd.min, max: fd.max, step: fd.step || 1 });
      rng.oninput = () => { num.value = rng.value; vals[fd.key] = +rng.value / sc; onChange(vals, fd.key); };
      num.oninput = () => { rng.value = num.value; vals[fd.key] = +num.value / sc; onChange(vals, fd.key); };
      el.append(h('label', { class: 'field' }, fd.label, h('div', { class: 'row' }, rng, num)));
    } else if (fd.type === 'select') {
      const s = h('select', {}, ...fd.options.map(o => h('option', { value: o.value ?? o, selected: String(o.value ?? o) === String(v) }, o.label ?? o))); s.onchange = () => { vals[fd.key] = typeof v === 'number' ? +s.value : s.value; onChange(vals, fd.key); };
      el.append(h('label', { class: 'field' }, fd.label, s));
    } else if (fd.type === 'checkbox') { const c = h('input', { type: 'checkbox', checked: !!v }); c.onchange = () => { vals[fd.key] = c.checked; onChange(vals, fd.key); }; el.append(h('label', { class: 'row chk' }, c, fd.label)); }
    else if (fd.type === 'color') { const c = h('input', { type: 'color', value: v }); c.oninput = () => { vals[fd.key] = c.value; onChange(vals, fd.key); }; el.append(h('label', { class: 'row chk' }, c, fd.label)); }
    else if (fd.type === 'stops') { const sw = h('div', { class: 'grad-swatch wide', style: { background: gradCss(v) } }); sw.onclick = async () => { const s = await gradientEditor(vals[fd.key]); if (s) { vals[fd.key] = s; sw.style.background = gradCss(s); onChange(vals, fd.key); } }; el.append(h('label', { class: 'field' }, fd.label + ' (click to edit)', sw)); }
    else if (fd.type === 'pattern') { const p = h('div', { class: 'pat-grid' }); const draw = () => { p.innerHTML = ''; PATTERNS.forEach((pt, i) => { const c = h('canvas', { width: 36, height: 36, class: 'pat' + (i === vals[fd.key] ? ' on' : ''), title: pt.name }); const x = c.getContext('2d'); x.fillStyle = x.createPattern(pt.canvas, 'repeat'); x.fillRect(0, 0, 36, 36); c.onclick = () => { vals[fd.key] = i; draw(); onChange(vals, fd.key); }; p.append(c); }); }; draw(); el.append(h('div', { class: 'field' }, h('span', {}, fd.label), p)); }
    else if (fd.type === 'note') el.append(h('div', { class: 'muted', style: { fontSize: '11.5px' } }, fd.label));
    else { const i = h('input', { type: fd.type || 'text', value: v ?? '' }); i.oninput = () => { vals[fd.key] = fd.type === 'number' ? +i.value : i.value; onChange(vals, fd.key); }; el.append(h('label', { class: 'field' }, fd.label, i)); }
  });
  return vals;
}
// non-blocking floating panel (does not dim the canvas) — resolves true on OK, false/null on cancel
function floatPanel({ title, body, width = 340, ok = 'OK', onOpen }) {
  return new Promise(resolve => {
    document.querySelectorAll('.ph-float').forEach(f => f.__cancel && f.__cancel());
    const p = h('div', { class: 'ph-float', style: { width: width + 'px' } }); const head = h('div', { class: 'pf-h' }, h('span', {}, title));
    const close = v => { p.remove(); window.removeEventListener('keydown', key, true); resolve(v); }; p.__cancel = () => close(false);
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(false); } if (e.key === 'Enter' && !e.target.closest('textarea') && p.contains(document.activeElement)) { e.preventDefault(); close(true); } };
    window.addEventListener('keydown', key, true);
    p.append(head, h('div', { class: 'pf-b' }, body), h('div', { class: 'pf-f' }, h('button', { class: 'btn', onclick: () => close(false) }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => close(true) }, ok)));
    document.body.append(p);
    // draggable header
    head.onpointerdown = e => { const r = p.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top; head.setPointerCapture(e.pointerId); const mv = ev => { p.style.left = clamp(ev.clientX - sx, 0, innerWidth - 80) + 'px'; p.style.top = clamp(ev.clientY - sy, 0, innerHeight - 40) + 'px'; p.style.right = 'auto'; }; head.addEventListener('pointermove', mv); head.addEventListener('pointerup', () => head.removeEventListener('pointermove', mv), { once: true }); };
    onOpen && onOpen(p);
  });
}

// =====================================================================  right panel: layers / looks / adjust / history
let rtab = 'layers', dragLayer = null;
$('#rtabs').innerHTML = '';
[['layers', 'Layers'], ['looks', 'Looks'], ['adjust', 'Adjust'], ['history', 'History']].forEach(([t, n]) => $('#rtabs').append(h('div', { class: 'tab' + (t === rtab ? ' active' : ''), 'data-t': t }, n)));
$('#rtabs').addEventListener('click', e => { const t = e.target.closest('.tab'); if (!t) return; showTab(t.dataset.t); });
function showTab(t) { rtab = t; document.querySelectorAll('#rtabs .tab').forEach(x => x.classList.toggle('active', x.dataset.t === t)); renderRight(); }
let looksTimer = null;
function renderRight() { if (rtab === 'layers') renderLayers(); else if (rtab === 'history') renderHistory(); else if (rtab === 'looks') { if (!$('#rtBody .looks-grid')) renderLooks(); else { clearTimeout(looksTimer); looksTimer = setTimeout(() => rtab === 'looks' && renderLooks(), 250); } } else renderAdjustPanel(); renderLayerActions(); }
function layerThumb(l) {
  const th = h('canvas'); const tw = 44, thh = 34; th.width = tw * 2; th.height = thh * 2; const tc = th.getContext('2d');
  if (l.kind === 'adjust') { tc.fillStyle = cssVar('--bg-4') || '#444'; tc.fillRect(0, 0, th.width, th.height); tc.fillStyle = cssVar('--tx-0') || '#fff'; tc.beginPath(); tc.arc(th.width / 2, th.height / 2, 22, Math.PI / 2, Math.PI * 1.5); tc.fill(); tc.strokeStyle = tc.fillStyle; tc.lineWidth = 3; tc.beginPath(); tc.arc(th.width / 2, th.height / 2, 22, 0, 7); tc.stroke(); return th; }
  const k = Math.min(th.width / D.w, th.height / D.h); const ox = (th.width - D.w * k) / 2, oy = (th.height - D.h * k) / 2;
  tc.fillStyle = '#fff'; tc.fillRect(ox, oy, D.w * k, D.h * k); tc.fillStyle = '#ddd'; for (let y = 0; y < D.h * k; y += 8) for (let x = (y / 8) % 2 * 8; x < D.w * k; x += 16) tc.fillRect(ox + x, oy + y, 8, 8);
  tc.drawImage(l.canvas, ox + l.x * k, oy + l.y * k, l.canvas.width * k, l.canvas.height * k); return th;
}
function renderLayers() {
  if (rtab !== 'layers') { renderLayerActions(); return; }
  const b = $('#rtBody'); const st = b.scrollTop; b.innerHTML = ''; renderLayerActions(); if (!D) return;
  const L = AL();
  const blend = h('select', {}, ...BLENDS.map(([v, l]) => h('option', { value: v, selected: L?.blend === v }, l))); blend.onchange = () => { L.blend = blend.value; requestRender(); pushHist('Blend mode'); };
  const op = h('input', { type: 'number', min: 0, max: 100, value: Math.round((L?.opacity ?? 1) * 100) }); op.onchange = () => { L.opacity = clamp(+op.value, 0, 100) / 100; requestRender(); pushHist('Opacity'); };
  const lock = h('button', { class: 'icon-btn', 'data-tip': 'Lock layer', html: icon(L?.locked ? 'lock' : 'unlock'), onclick: () => { L.locked = !L.locked; renderLayers(); } });
  b.append(h('div', { class: 'layer-top' }, blend, h('span', { class: 'muted' }, 'Opacity'), op, lock));
  [...D.layers].reverse().forEach(l => {
    const i = D.layers.indexOf(l);
    const thumbs = [h('div', { class: 'lt' + (!l.editMask || !l.mask || l.kind === 'adjust' ? ' sel' : ''), 'data-tip': l.kind === 'adjust' ? 'Double-click to edit the adjustment' : '', onclick: e => { e.stopPropagation(); D.active = i; l.editMask = false; renderLayers(); }, ondblclick: e => { e.stopPropagation(); if (l.kind === 'adjust') { D.active = i; editActiveLayer(); } } }, layerThumb(l))];
    if (l.mask) { const mc = h('canvas', { width: 88, height: 68 }); const mx = mc.getContext('2d'); mx.drawImage(l.mask, 0, 0, 88, 68); thumbs.push(h('div', { class: 'lt' + (l.editMask && l.kind !== 'adjust' ? ' sel' : ''), 'data-tip': 'Layer mask', onclick: e => { e.stopPropagation(); D.active = i; l.editMask = true; renderLayers(); } }, mc)); }
    const hasFx = Object.keys(l.fx || {}).some(k => l.fx[k]);
    const nm = h('div', { class: 'nm' }, l.name, l.kind === 'text' ? h('span', { class: 'badge' }, '  T') : '', l.kind === 'frame' ? h('span', { class: 'badge' }, '  ▢ frame') : '', l.smart ? h('span', { class: 'badge' }, '  ◆ smart') : '', l.locked ? h('span', { class: 'badge' }, '  🔒') : '');
    const fxB = hasFx ? h('span', { class: 'fx-badge', 'data-tip': 'Layer style — double-click to edit', ondblclick: e => { e.stopPropagation(); D.active = i; layerStyleDialog(); }, onclick: e => { e.stopPropagation(); D.active = i; layerStyleDialog(); } }, 'fx') : '';
    const row = h('div', { class: 'layer' + (i === D.active ? ' active' : '') + (l.kind === 'adjust' ? ' adj' : ''), draggable: 'true' },
      h('div', { class: 'vis', html: icon(l.visible ? 'eye' : 'eyeOff'), onclick: e => { e.stopPropagation(); l.visible = !l.visible; requestRender(); renderLayers(); } }), ...thumbs, nm, fxB);
    row.onclick = () => { D.active = i; renderLayers(); if (rtab === 'looks') renderLooks(); };
    row.ondblclick = e => { if (e.target.closest('.vis,.lt,.fx-badge')) return; const inp = h('input', { type: 'text', value: l.name }); nm.innerHTML = ''; nm.append(inp); inp.focus(); inp.select(); const done = () => { l.name = inp.value || l.name; renderLayers(); }; inp.onblur = done; inp.onkeydown = ev => { ev.stopPropagation(); if (ev.key === 'Enter') inp.blur(); }; };
    row.oncontextmenu = e => { D.active = i; renderLayers(); contextMenu(e, [{ label: 'Duplicate layer', action: duplicateLayer }, { label: 'Delete layer', action: deleteLayer }, { label: 'Rename…', action: renameLayer }, ...(l.kind === 'adjust' ? [{ label: 'Edit adjustment…', action: editActiveLayer }] : []), '-', { label: 'Add mask', action: () => addMask('all') }, { label: 'Layer style…', action: () => layerStyleDialog(), disabled: l.kind === 'adjust' }, { label: 'Copy layer style', action: copyFx }, { label: 'Paste layer style', action: pasteFx, disabled: !fxClipboard }, { label: 'Clear layer style', action: clearFx }, { label: 'Rasterize', action: rasterizeLayer, disabled: !(l.kind === 'text' || l.kind === 'frame' || l.smart) }, { label: 'Convert for smart filters', action: () => convertToSmart(l), disabled: l.kind !== 'raster' || !!l.smart }, ...(l.kind === 'frame' ? [{ label: 'Place image into frame…', action: () => placeIntoFrame(l) }] : []), { label: 'Harmonize…', action: harmonizeDialog, disabled: i === 0 || l.kind === 'adjust' }, '-', { label: 'Merge down', action: mergeDown }, { label: 'Flatten image', action: flatten }]); };
    row.ondragstart = () => dragLayer = i; row.ondragover = e => { e.preventDefault(); row.classList.add('drag-over'); }; row.ondragleave = () => row.classList.remove('drag-over');
    row.ondrop = e => { e.preventDefault(); if (dragLayer == null || dragLayer === i) return; const [m] = D.layers.splice(dragLayer, 1); D.layers.splice(i, 0, m); D.active = i; dragLayer = null; requestRender(); pushHist('Reorder layers'); };
    b.append(row);
    if (l.smart) b.append(smartRows(l, i));
  });
  b.scrollTop = st;
}
function renderLayerActions() {
  const a = $('#layerActions'); a.innerHTML = '';
  const btn = (ic, tip, fn) => h('button', { class: 'icon-btn', 'data-tip': tip, html: icon(ic), onclick: fn });
  if (rtab === 'history') { a.append(btn('camera', 'New snapshot', takeSnapshot), btn('copy', 'New document from current state', duplicateDoc)); return; }
  a.append(btn('fx', 'Layer style', e => contextMenu(e, [{ label: 'All styles…', action: () => layerStyleDialog() }, '-', ...FX_LIST.map(([k, n]) => ({ label: n + '…', action: () => layerStyleDialog(k) })), '-', { label: 'Copy style', action: copyFx }, { label: 'Paste style', action: pasteFx, disabled: !fxClipboard }, { label: 'Clear', action: clearFx }])),
    btn('mask', 'Add layer mask', () => addMask(D?.sel ? 'sel' : 'all')), btn('adjust', 'New adjustment layer', e => contextMenu(e, ADJ.filter(x => x.layer !== false).map(x => ({ label: x.name, action: () => runAdjust(x, { asLayer: true }) })))),
    btn('folder', 'Place image', placeImage), btn('plus', 'New layer', () => addLayer()), btn('copy', 'Duplicate layer', duplicateLayer), btn('trash', 'Delete layer', deleteLayer));
}
function renderHistory() {
  if (rtab !== 'history') return; const b = $('#rtBody'); b.innerHTML = ''; if (!D) return;
  b.append(h('div', { class: 'hist-h' }, h('span', {}, 'Snapshots'), h('button', { class: 'btn sm', html: icon('camera') + 'New', onclick: takeSnapshot })));
  if (!D.snaps.length) b.append(h('div', { class: 'muted hist-empty' }, 'Snapshots keep a state permanently, even after the history list moves on.'));
  D.snaps.forEach((s, i) => { const th = h('canvas', { width: 40, height: 30 }); const L0 = s.state; try { const c = th.getContext('2d'), k = Math.min(40 / L0.w, 30 / L0.h); L0.layers.forEach(l => { if (l.visible && l.kind !== 'adjust') { c.globalAlpha = l.opacity; c.drawImage(l.canvas, l.x * k, l.y * k, l.canvas.width * k, l.canvas.height * k); } }); } catch {} b.append(h('div', { class: 'hist snap', onclick: () => restoreSnapshot(s), oncontextmenu: e => contextMenu(e, [{ label: 'Restore', action: () => restoreSnapshot(s) }, { label: 'Rename…', action: async () => { const n = await prompt('Rename snapshot', 'Name', s.name); if (n) { s.name = n; renderHistory(); } } }, { label: 'Delete', action: () => { D.snaps.splice(i, 1); renderHistory(); } }]) }, th, h('span', {}, s.name))); });
  b.append(h('div', { class: 'hist-h' }, h('span', {}, 'History')));
  D.hist.forEach((s, i) => b.append(h('div', { class: 'hist' + (i === D.hi ? ' cur' : i > D.hi ? ' future' : ''), onclick: () => restoreHist(i) }, s.label)));
  b.scrollTop = b.scrollHeight;
}
function renderAdjustPanel() {
  const b = $('#rtBody'); b.innerHTML = '';
  b.append(h('div', { class: 'panel-h' }, 'Adjustment layers (non-destructive)'));
  const grid = h('div', { class: 'adj-grid' }); ADJ.filter(a => a.layer !== false).forEach(a => grid.append(h('button', { class: 'adj-tile', 'data-tip': a.name + ' — adds an editable adjustment layer', onclick: () => runAdjust(a, { asLayer: true }), html: icon(a.icon || 'sliders') + `<span>${a.name}</span>` }))); b.append(grid);
  b.append(h('div', { class: 'panel-h' }, 'Filters'));
  FILTER_CATS.forEach(cat => { b.append(h('div', { class: 'adj-cat' }, cat)); FILTERS.filter(f => f.cat === cat).forEach(f => b.append(h('div', { class: 'adj-btn', onclick: () => runFilter(f), html: icon(f.icon || 'fx') + f.name }))); });
  b.append(h('div', { class: 'adj-btn', onclick: liquifyDialog, html: icon('liquify') + 'Liquify…' }), h('div', { class: 'adj-btn', onclick: () => filterDialog(FILTERS[0], { gallery: true }), html: icon('grid') + 'Filter Gallery…' }));
}
let looksThumbKey = null, looksThumbs = {};
function renderLooks() {
  const b = $('#rtBody'); b.innerHTML = ''; if (!D) { b.append(h('div', { class: 'muted hist-empty' }, 'Open an image to use Looks.')); return; }
  const L = AL(), lookL = L?.kind === 'adjust' && L.adj?.type === 'look' ? L : null;
  const amt = h('input', { type: 'range', min: 0, max: 100, value: lookL ? lookL.adj.params.amt : 100 }), amtN = h('span', { class: 'mono' }, (lookL ? lookL.adj.params.amt : 100) + '%');
  let t = null; amt.oninput = () => { amtN.textContent = amt.value + '%'; if (lookL) { lookL.adj.params.amt = +amt.value; proxyRender(); clearTimeout(t); t = setTimeout(() => pushHist('Look intensity'), 400); } };
  b.append(h('div', { class: 'looks-h' }, h('div', {}, h('div', { class: 'looks-t' }, 'Looks'), h('div', { class: 'muted', style: { fontSize: '11px' } }, lookL ? 'Editing “' + lookL.name + '” — pick another look or change intensity' : 'Click a look to add it as an adjustable layer')), h('label', { class: 'looks-amt' }, h('span', { class: 'muted' }, 'Intensity'), amt, amtN)));
  // thumbnails from a small copy of the composite (below the active look layer)
  const key = D.id + ':' + contentSerial + ':' + (lookL ? D.layers.indexOf(lookL) : -1);
  const grid = h('div', { class: 'looks-grid' });
  if (looksThumbKey !== key) {
    looksThumbKey = key; looksThumbs = {};
    const src = smallComposite(lookL ? D.layers.indexOf(lookL) : D.layers.length, 120), k = src.width / D.w, s = mk(src.width, src.height), sx = ctxOf(s); sx.fillStyle = '#fff'; sx.fillRect(0, 0, s.width, s.height); sx.drawImage(src, 0, 0);
    const base = sx.getImageData(0, 0, s.width, s.height); looksThumbs.none = s;
    X.LOOKS.forEach(lk => { const img = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height); try { lk.fn(img, { scale: k }); } catch (e) { console.error(e); } const c = mk(s.width, s.height); ctxOf(c).putImageData(img, 0, 0); looksThumbs[lk.id] = c; });
  }
  const cell = (id, name) => { const th = looksThumbs[id], cv = h('canvas', { width: 108, height: 80 }); const x = cv.getContext('2d'), kk = Math.max(108 / th.width, 80 / th.height); x.drawImage(th, (108 - th.width * kk) / 2, (80 - th.height * kk) / 2, th.width * kk, th.height * kk); return h('div', { class: 'look' + ((lookL ? lookL.adj.params.look : '') === id ? ' on' : ''), onclick: () => applyLook(id, +amt.value) }, cv, h('span', {}, name)); };
  X.LOOKS.forEach(lk => grid.append(cell(lk.id, lk.name)));
  b.append(grid);
  if (lookL) b.append(h('div', { class: 'row', style: { padding: '8px 10px', gap: '6px' } }, h('button', { class: 'btn sm', onclick: () => { D.layers.splice(D.layers.indexOf(lookL), 1); D.active = clamp(D.active - 1, 0, D.layers.length - 1); requestRender(); pushHist('Remove look'); renderLooks(); } }, 'Remove look'), h('button', { class: 'btn sm', onclick: () => { mergeDown(); renderLooks(); } }, 'Merge into layer below')));
}
function applyLook(id, amt = 100) {
  if (!D) return; const L = AL(); const lk = X.LOOKS.find(l => l.id === id);
  if (L?.kind === 'adjust' && L.adj?.type === 'look') { L.adj.params.look = id; L.name = 'Look: ' + lk.name; }
  else { const n = newLayer('Look: ' + lk.name, 1, 1, { kind: 'adjust', adj: { type: 'look', params: { look: id, amt } } }); D.layers.splice(D.active + 1, 0, n); D.active++; }
  requestRender(); pushHist('Look: ' + lk.name); if (rtab === 'looks') renderLooks();
}
function renderTabs() {
  const t = $('#docTabs'); t.innerHTML = '';
  docs.forEach(d => t.append(h('div', { class: 'dt' + (d === D ? ' active' : ''), onclick: () => switchDoc(d) }, `${d.name}${d.dirty ? ' •' : ''} @ ${Math.round(d.zoom * 100)}%`, h('span', { class: 'dt-x', onclick: e => { e.stopPropagation(); switchDoc(d); closeDoc(); } }, '×'))));
}
function renderAll() { renderRight(); renderOptions(); applyView(); requestRender(); $('.welcome')?.classList.toggle('hidden', !!D); wrap.style.display = D ? '' : 'none'; if (!D) { [rulerH, rulerV].forEach(r => { r.width = 0; }); } }

// =====================================================================  adjustments (usable destructively or as adjustment layers)
const A = X.adj, lut = X.lut, applyLut = X.applyLut;
const rng = (key, label, min, max, value, step) => ({ key, label, type: 'range', min, max, value, step });
const ADJ = [
  { id: 'bc', name: 'Brightness/Contrast', icon: 'adjust', params: [rng('b', 'Brightness', -150, 150, 0), rng('c', 'Contrast', -100, 100, 0)], fn: (img, p) => { const k = (259 * (p.c + 255)) / (255 * (259 - p.c)); applyLut(img.data, lut(i => k * (i + p.b - 128) + 128)); } },
  { id: 'levels', name: 'Levels', icon: 'sliders', kbd: 'Ctrl+L', params: [{ key: 'ch', label: 'Channel', type: 'select', value: 'rgb', options: [{ value: 'rgb', label: 'RGB' }, { value: 'r', label: 'Red' }, { value: 'g', label: 'Green' }, { value: 'b', label: 'Blue' }] }, rng('ib', 'Input black', 0, 253, 0), rng('g', 'Gamma (midtones)', 0.1, 3, 1, 0.01), rng('iw', 'Input white', 2, 255, 255), rng('ob', 'Output black', 0, 255, 0), rng('ow', 'Output white', 0, 255, 255)], fn: A.levels },
  { id: 'curves', name: 'Curves', icon: 'sliders', kbd: 'Ctrl+M', custom: 'curves', defaults: () => ({ pts: { rgb: [[0, 0], [255, 255]], r: [[0, 0], [255, 255]], g: [[0, 0], [255, 255]], b: [[0, 0], [255, 255]] } }), fn: A.curves },
  { id: 'exposure', name: 'Exposure', icon: 'adjust', params: [rng('e', 'Exposure (stops)', -5, 5, 0, 0.05), rng('o', 'Offset', -0.5, 0.5, 0, 0.01), rng('g', 'Gamma', 0.1, 3, 1, 0.01)], fn: (img, p) => applyLut(img.data, lut(i => Math.pow(clamp((i / 255) * Math.pow(2, p.e) + p.o, 0, 1), 1 / p.g) * 255)) },
  { id: 'vibrance', name: 'Vibrance', icon: 'adjust', params: [rng('v', 'Vibrance', -100, 100, 0), rng('s', 'Saturation', -100, 100, 0)], fn: A.vibrance },
  { id: 'hue', name: 'Hue/Saturation', icon: 'adjust', kbd: 'Ctrl+U', params: [rng('h', 'Hue', -180, 180, 0), rng('s', 'Saturation', -100, 100, 0), rng('l', 'Lightness', -100, 100, 0), { key: 'col', label: 'Colorize', type: 'checkbox', value: false }], fn: A.hueSat },
  { id: 'cbal', name: 'Color Balance', icon: 'adjust', kbd: 'Ctrl+B', params: [{ key: 'n1', type: 'note', label: 'Shadows' }, rng('sr', 'Cyan ↔ Red', -100, 100, 0), rng('sg', 'Magenta ↔ Green', -100, 100, 0), rng('sb', 'Yellow ↔ Blue', -100, 100, 0), { key: 'n2', type: 'note', label: 'Midtones' }, rng('mr', 'Cyan ↔ Red', -100, 100, 0), rng('mg', 'Magenta ↔ Green', -100, 100, 0), rng('mb', 'Yellow ↔ Blue', -100, 100, 0), { key: 'n3', type: 'note', label: 'Highlights' }, rng('hr', 'Cyan ↔ Red', -100, 100, 0), rng('hg', 'Magenta ↔ Green', -100, 100, 0), rng('hb', 'Yellow ↔ Blue', -100, 100, 0), { key: 'pl', label: 'Preserve luminosity', type: 'checkbox', value: true }], fn: A.colorBalance },
  { id: 'bw', name: 'Black & White', icon: 'adjust', kbd: 'Ctrl+Alt+Shift+B', params: [rng('re', 'Reds %', -200, 300, 40), rng('ye', 'Yellows %', -200, 300, 60), rng('gr', 'Greens %', -200, 300, 40), rng('cy', 'Cyans %', -200, 300, 60), rng('bl', 'Blues %', -200, 300, 20), rng('ma', 'Magentas %', -200, 300, 80), { key: 'tint', label: 'Tint', type: 'checkbox', value: false }, { key: 'tc', label: 'Tint color', type: 'color', value: '#c8a26b' }], fn: A.blackWhite },
  { id: 'pfilter', name: 'Photo Filter', icon: 'adjust', params: [{ key: 'preset', label: 'Filter', type: 'select', value: '#ec8a00', options: [{ value: '#ec8a00', label: 'Warming (85)' }, { value: '#fa9600', label: 'Warming (LBA)' }, { value: '#006dff', label: 'Cooling (80)' }, { value: '#00b5ff', label: 'Cooling (LBB)' }, { value: '#ea1a1a', label: 'Red' }, { value: '#19c919', label: 'Green' }, { value: '#ac7a33', label: 'Sepia' }, { value: 'custom', label: 'Custom color' }] }, { key: 'c', label: 'Custom color', type: 'color', value: '#ec8a00' }, rng('d', 'Density %', 0, 100, 25), { key: 'pl', label: 'Preserve luminosity', type: 'checkbox', value: true }], fn: (img, p) => A.photoFilter(img, { ...p, c: p.preset && p.preset !== 'custom' ? p.preset : p.c }) },
  { id: 'mixer', name: 'Channel Mixer', icon: 'sliders', params: [{ key: 'mono', label: 'Monochrome (uses Red output row)', type: 'checkbox', value: false }, { key: 'n1', type: 'note', label: 'Red output' }, rng('rr', 'Red %', -200, 200, 100), rng('rg', 'Green %', -200, 200, 0), rng('rb', 'Blue %', -200, 200, 0), rng('rc', 'Constant', -100, 100, 0), { key: 'n2', type: 'note', label: 'Green output' }, rng('gr', 'Red %', -200, 200, 0), rng('gg', 'Green %', -200, 200, 100), rng('gb', 'Blue %', -200, 200, 0), rng('gc', 'Constant', -100, 100, 0), { key: 'n3', type: 'note', label: 'Blue output' }, rng('br', 'Red %', -200, 200, 0), rng('bg', 'Green %', -200, 200, 0), rng('bb', 'Blue %', -200, 200, 100), rng('bc', 'Constant', -100, 100, 0)], fn: A.channelMixer },
  { id: 'gmap', name: 'Gradient Map', icon: 'gradient', params: [{ key: 'preset', label: 'Gradient', type: 'select', value: 'custom', options: [{ value: 'custom', label: 'Custom (colors below)' }, { value: 'bw', label: 'Black → white' }, { value: 'sunset', label: 'Sunset' }, { value: 'teal', label: 'Teal duotone' }, { value: 'duo', label: 'Purple-pink duotone' }, { value: 'copper', label: 'Copper' }, { value: 'ocean', label: 'Ocean' }, { value: 'infrared', label: 'Infrared' }] }, { key: 'a', label: 'Shadows color', type: 'color', value: '#1b1035' }, { key: 'useMid', label: 'Use midtone color', type: 'checkbox', value: false }, { key: 'mid', label: 'Midtone color', type: 'color', value: '#c2416b' }, { key: 'b', label: 'Highlights color', type: 'color', value: '#ffd27a' }, { key: 'rev', label: 'Reverse', type: 'checkbox', value: false }], fn: A.gradientMap },
  { id: 'selcolor', name: 'Selective Color', icon: 'adjust', custom: 'selcolor', defaults: () => ({ rel: true, adj: Object.fromEntries(X.SC_COLORS.map(c => [c, [0, 0, 0, 0]])) }), fn: A.selectiveColor },
  { id: 'shhl', name: 'Shadows/Highlights', icon: 'adjust', params: [rng('s', 'Shadows amount', 0, 100, 35), rng('hl', 'Highlights amount', 0, 100, 0), rng('r', 'Radius (px)', 1, 200, 30), rng('c', 'Color correction', -100, 100, 0)], fn: A.shadowsHighlights },
  { id: 'temp', name: 'Temperature/Tint', icon: 'adjust', params: [rng('t', 'Temperature (cool ↔ warm)', -100, 100, 0), rng('n', 'Tint (green ↔ magenta)', -100, 100, 0)], fn: (img, p) => A.tempTint(img, { t: p.t, n: -p.n }) },
  { id: 'colorvib', name: 'Color & Vibrance', icon: 'adjust', params: [rng('t', 'Temperature (cool ↔ warm)', -100, 100, 0), rng('n', 'Tint (green ↔ magenta)', -100, 100, 0), rng('v', 'Vibrance', -100, 100, 0), rng('s', 'Saturation', -100, 100, 0)], fn: (img, p) => { if (p.t || p.n) A.tempTint(img, { t: p.t, n: -p.n }); if (p.v || p.s) A.vibrance(img, { v: p.v, s: p.s }); } },
  { id: 'clarity', name: 'Clarity', icon: 'adjust', params: [rng('a', 'Clarity', -100, 100, 30)], fn: A.clarity },
  { id: 'dehaze', name: 'Dehaze', icon: 'adjust', params: [rng('a', 'Amount', -100, 100, 40)], fn: A.dehaze },
  { id: 'invert', name: 'Invert', icon: 'swap', kbd: 'Ctrl+I', fn: img => applyLut(img.data, lut(i => 255 - i)) },
  { id: 'equalize', name: 'Equalize', icon: 'adjust', fn: A.equalize },
  { id: 'autotone', name: 'Auto Tone', icon: 'adjust', fn: A.autoTone },
  { id: 'autocontrast', name: 'Auto Contrast', icon: 'adjust', fn: A.autoContrast },
  { id: 'autocolor', name: 'Auto Color', icon: 'adjust', fn: A.autoColor },
  { id: 'desat', name: 'Desaturate', icon: 'adjust', kbd: 'Ctrl+Shift+U', fn: img => { const d = img.data; for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; } },
  { id: 'posterize', name: 'Posterize', icon: 'grid', params: [rng('n', 'Levels', 2, 32, 4)], fn: A.posterize },
  { id: 'threshold', name: 'Threshold', icon: 'adjust', params: [rng('t', 'Threshold level', 1, 255, 128)], fn: A.threshold },
  { id: 'match', name: 'Match Color', icon: 'adjust', custom: 'match', layer: false, fn: A.matchColor },
  { id: 'fglight', name: 'Foreground lighting', icon: 'sky', layer: false, params: [rng('amt', 'Amount %', 0, 150, 55)], fn: (img, p) => { const k = (p.amt ?? 55) / 100, gr = 1 + ((p.gr ?? 1) - 1) * k, gg = 1 + ((p.gg ?? 1) - 1) * k, gb = 1 + ((p.gb ?? 1) - 1) * k, d = img.data; for (let i = 0; i < d.length; i += 4) { d[i] *= gr; d[i + 1] *= gg; d[i + 2] *= gb; } } },
  { id: 'look', name: 'Look', icon: 'looks', layer: false, hidden: true, fn: (img, p, ctx) => { const lk = X.LOOKS.find(l => l.id === p.look); if (!lk) return; const o = new Uint8ClampedArray(img.data); lk.fn(img, ctx); const k = clamp((p.amt ?? 100) / 100, 0, 1); if (k < 1) { const d = img.data; for (let i = 0; i < d.length; i += 4) { d[i] = o[i] + (d[i] - o[i]) * k; d[i + 1] = o[i + 1] + (d[i + 1] - o[i + 1]) * k; d[i + 2] = o[i + 2] + (d[i + 2] - o[i + 2]) * k; } } } },
];
const ADJ_BY_ID = Object.fromEntries(ADJ.map(a => [a.id, a]));
['look', 'fglight'].forEach(id => ADJ.splice(ADJ.findIndex(a => a.id === id), 1)); // looks: Looks panel; foreground lighting: sky replacement
const defaultsOf = a => a.defaults ? a.defaults() : Object.fromEntries((a.params || []).filter(p => p.type !== 'note').map(p => [p.key, p.value]));
ADJ.forEach(a => { if (a.kbd) UI.shortcut(a.kbd.toLowerCase(), () => runAdjust(a)); });
UI.shortcut('ctrl+shift+l', () => quickAdj(A.autoTone, 'Auto tone')); UI.shortcut('ctrl+shift+b', () => quickAdj(A.autoColor, 'Auto color')); UI.shortcut('ctrl+alt+shift+l', () => quickAdj(A.autoContrast, 'Auto contrast'));
function layerImageOp(L, fn, params) {
  // apply fn(ImageData, params, ctx) to layer pixels, honoring selection
  ensureCovers(L);
  const c = ctxOf(L.canvas); const img = c.getImageData(0, 0, L.canvas.width, L.canvas.height);
  const orig = D.sel ? new Uint8ClampedArray(img.data) : null;
  fn(img, params, { scale: 1, x: L.x, y: L.y, fg: O.fg, bg: O.bg });
  if (D.sel) { const sa = ctxOf(D.sel).getImageData(0, 0, D.w, D.h).data, d = img.data, W = L.canvas.width; for (let y = 0; y < L.canvas.height; y++) { const dy = y + L.y; for (let x = 0; x < W; x++) { const dx = x + L.x, j = (y * W + x) * 4; const a = dx < 0 || dy < 0 || dx >= D.w || dy >= D.h ? 0 : sa[(dy * D.w + dx) * 4 + 3] / 255; if (a >= 1) continue; for (let k = 0; k < 4; k++) d[j + k] = orig[j + k] + (d[j + k] - orig[j + k]) * a; } } }
  c.putImageData(img, 0, 0);
}
function quickAdj(fn, name) { const L = AL(); if (!D || !L || L.kind !== 'raster') return toast('Select a pixel layer', 'err'); if (smartBlock(L)) return; layerImageOp(L, fn, {}); requestRender(); pushHist(name); }
function editActiveLayer() { const L = AL(); if (L?.kind !== 'adjust') return; if (L.adj.type === 'look') return showTab('looks'); const a = ADJ_BY_ID[L.adj.type]; if (a) adjustLayerDialog(a, L, false); }
async function runAdjust(a, { asLayer = false } = {}) {
  if (!D) return toast('Open an image first');
  if (asLayer) {
    if (a.layer === false) return runAdjust(a);
    const L = newLayer(a.name, 1, 1, { kind: 'adjust', adj: { type: a.id, params: defaultsOf(a) } });
    if (D.sel) { L.mask = maskFromAlphaGray(selAlpha()); L.maskVer = 1; setSel(null); }
    D.layers.splice(D.active + 1, 0, L); D.active++; requestRender(); renderLayers();
    if (!a.params && !a.custom) { pushHist('New ' + a.name + ' layer'); return; }
    return adjustLayerDialog(a, L, true);
  }
  const L = AL(); if (!L) return; if (L.kind === 'adjust') return toast('Select a pixel layer (or use Layer › New adjustment layer)', 'err'); if (L.kind === 'text' || L.kind === 'frame') return toast('Rasterize the layer first', 'err'); if (L.locked) return toast('Layer is locked', 'err'); if (smartBlock(L)) return;
  if (a.custom === 'match') return matchColorDialog();
  if (!a.params && !a.custom) { layerImageOp(L, a.fn, {}); requestRender(); pushHist(a.name); return; }
  ensureCovers(L); const orig = cloneCanvas(L.canvas); let timer = null, vals = defaultsOf(a);
  const big = orig.width * orig.height > 4e6;
  const preview = () => { clearTimeout(timer); timer = setTimeout(() => { const c = L.canvas.getContext('2d'); c.clearRect(0, 0, orig.width, orig.height); c.drawImage(orig, 0, 0); layerImageOp(L, a.fn, vals); contentSerial++; requestRender(false); }, big ? 120 : 16); };
  preview();
  const ok = await floatPanel({ title: a.name, width: a.custom === 'curves' ? 330 : 320, body: adjustBody(a, vals, preview) });
  clearTimeout(timer); const c = L.canvas.getContext('2d'); c.clearRect(0, 0, orig.width, orig.height); c.drawImage(orig, 0, 0);
  if (ok) { layerImageOp(L, a.fn, vals); pushHist(a.name); } requestRender();
}
function maskFromAlphaGray(a) { const m = mk(D.w, D.h), c = ctxOf(m), id = c.createImageData(D.w, D.h); for (let i = 0; i < a.length; i++) { const j = i * 4; id.data[j] = id.data[j + 1] = id.data[j + 2] = a[i]; id.data[j + 3] = 255; } c.putImageData(id, 0, 0); return m; }
async function adjustLayerDialog(a, L, isNew) {
  const before = JSON.parse(JSON.stringify(L.adj.params)); const vals = L.adj.params; let t = null;
  const upd = () => proxyRender();
  const ok = await floatPanel({ title: (isNew ? 'New ' : '') + a.name + ' layer', width: a.custom === 'curves' ? 330 : 320, body: adjustBody(a, vals, upd) });
  if (!ok) { if (isNew) { D.layers.splice(D.layers.indexOf(L), 1); D.active = clamp(D.active - 1, 0, D.layers.length - 1); } else L.adj.params = before; requestRender(); renderLayers(); return; }
  requestRender(); pushHist(isNew ? 'New ' + a.name + ' layer' : 'Edit ' + a.name);
}
function adjustBody(a, vals, onChange) {
  const el = h('div', { class: 'ph-fields' });
  if (a.params || a.custom) el.append(presetRow(a, vals, () => { const nb = adjustBody(a, vals, onChange); el.replaceWith(nb); onChange(); }).el);
  if (a.custom === 'curves') el.append(curvesWidget(vals, onChange));
  else if (a.custom === 'selcolor') el.append(selColorWidget(vals, onChange));
  else buildFields(el, a.params, vals, () => onChange());
  if (a.params?.length > 2 || a.custom) el.append(h('button', { class: 'btn sm', style: { alignSelf: 'flex-start' }, onclick: () => { const d = defaultsOf(a); Object.keys(vals).forEach(k => delete vals[k]); Object.assign(vals, d); const p = el.parentElement; const nb = adjustBody(a, vals, onChange); el.replaceWith(nb); onChange(); void p; } }, 'Reset'));
  return el;
}
function curvesWidget(vals, onChange) {
  let ch = 'rgb'; const pts = vals.pts; const S = 256;
  const cv = h('canvas', { class: 'curve-box', width: S * 2, height: S * 2, style: { width: S + 'px', height: S + 'px' } });
  const sel = h('select', {}, ...[['rgb', 'RGB'], ['r', 'Red'], ['g', 'Green'], ['b', 'Blue']].map(([v, l]) => h('option', { value: v }, l))); sel.onchange = () => { ch = sel.value; draw(); };
  let hist = null; try { const L = AL(); const s = smallComposite(L?.kind === 'adjust' ? D.layers.indexOf(L) : D.layers.length, 400); hist = X.histogram(ctxOf(s).getImageData(0, 0, s.width, s.height).data); } catch { }
  const draw = () => {
    const c = cv.getContext('2d'); c.setTransform(2, 0, 0, 2, 0, 0); c.clearRect(0, 0, S, S); c.fillStyle = cssVar('--bg-0') || '#0b0c0f'; c.fillRect(0, 0, S, S);
    if (hist) { const hh = ch === 'rgb' ? hist[3] : hist['rgb'.indexOf(ch)]; let mx = 1; for (let i = 1; i < 255; i++) mx = Math.max(mx, hh[i]); c.fillStyle = 'rgba(128,128,128,.28)'; for (let i = 0; i < 256; i++) c.fillRect(i, S - Math.min(S, hh[i] / mx * S), 1, S); }
    c.strokeStyle = 'rgba(128,128,128,.3)'; c.lineWidth = 1; c.beginPath(); for (let i = 1; i < 4; i++) { c.moveTo(i * S / 4, 0); c.lineTo(i * S / 4, S); c.moveTo(0, i * S / 4); c.lineTo(S, i * S / 4); } c.moveTo(0, S); c.lineTo(S, 0); c.stroke();
    const l = X.curveLut(pts[ch]); c.strokeStyle = { rgb: cssVar('--tx-0') || '#fff', r: '#ff5a5f', g: '#3ccf8e', b: '#31a8ff' }[ch]; c.lineWidth = 2; c.beginPath(); for (let i = 0; i < 256; i++) i ? c.lineTo(i, S - l[i]) : c.moveTo(i, S - l[i]); c.stroke();
    pts[ch].forEach(([x, y], i) => { c.fillStyle = i === dragI ? '#31a8ff' : (cssVar('--tx-0') || '#fff'); c.strokeStyle = cssVar('--bg-0') || '#000'; c.fillRect(x - 4, S - y - 4, 8, 8); c.strokeRect(x - 4, S - y - 4, 8, 8); });
  };
  let dragI = -1; const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * S, S - (e.clientY - r.top) / r.height * S]; };
  cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); const [x, y] = pos(e); const p = pts[ch]; dragI = p.findIndex(q => Math.hypot(q[0] - x, q[1] - y) < 10); if (dragI < 0) { p.push([clamp(Math.round(x), 0, 255), clamp(Math.round(y), 0, 255)]); dragI = p.length - 1; } draw(); onChange(); };
  cv.onpointermove = e => { if (dragI < 0) return; const p = pts[ch]; const [rx, ry] = pos(e); const x = clamp(Math.round(rx), 0, 255), y = clamp(Math.round(ry), 0, 255); if ((rx < -24 || rx > S + 24 || ry < -24 || ry > S + 24) && p.length > 2) { p.splice(dragI, 1); dragI = -1; } else p[dragI] = [x, y]; draw(); onChange(); };
  cv.onpointerup = () => { dragI = -1; draw(); };
  cv.ondblclick = e => { const [x, y] = pos(e); const p = pts[ch]; const i = p.findIndex(q => Math.hypot(q[0] - x, q[1] - y) < 10); if (i >= 0 && p.length > 2) { p.splice(i, 1); draw(); onChange(); } };
  const presets = h('select', {}, ...[['', 'Preset…'], ['contrast', 'Increase contrast (S-curve)'], ['lighter', 'Lighter'], ['darker', 'Darker'], ['matte', 'Matte / faded blacks'], ['negative', 'Negative'], ['linear', 'Linear (reset)']].map(([v, l]) => h('option', { value: v }, l)));
  presets.onchange = () => { const P = { contrast: [[0, 0], [64, 48], [192, 208], [255, 255]], lighter: [[0, 0], [128, 160], [255, 255]], darker: [[0, 0], [128, 96], [255, 255]], matte: [[0, 40], [64, 70], [192, 200], [255, 245]], negative: [[0, 255], [255, 0]], linear: [[0, 0], [255, 255]] }[presets.value]; if (P) { pts[ch] = P.map(p => [...p]); draw(); onChange(); } presets.value = ''; };
  draw();
  return h('div', { class: 'curves' }, h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Channel'), sel, presets), cv, h('div', { class: 'muted', style: { fontSize: '11px' } }, 'Click to add points · drag to shape · drag out or double-click to remove'));
}
function selColorWidget(vals, onChange) {
  let cur = 'reds'; const el = h('div', { class: 'ph-fields' });
  const draw = () => { el.innerHTML = ''; const s = h('select', {}, ...X.SC_COLORS.map(c => h('option', { value: c, selected: c === cur }, c[0].toUpperCase() + c.slice(1)))); s.onchange = () => { cur = s.value; draw(); }; el.append(h('label', { class: 'field' }, 'Colors', s)); const arr = vals.adj[cur]; const v = { c: arr[0], m: arr[1], y: arr[2], k: arr[3] }; buildFields(el, [rng('c', 'Cyan %', -100, 100, 0), rng('m', 'Magenta %', -100, 100, 0), rng('y', 'Yellow %', -100, 100, 0), rng('k', 'Black %', -100, 100, 0)], v, nv => { vals.adj[cur] = [nv.c, nv.m, nv.y, nv.k]; onChange(); }); const rel = h('input', { type: 'checkbox', checked: vals.rel }); rel.onchange = () => { vals.rel = rel.checked; onChange(); }; el.append(h('label', { class: 'row chk' }, rel, 'Relative (otherwise absolute)')); };
  draw(); return el;
}
async function matchColorDialog() {
  const L = AL(); const others = D.layers.map((l, i) => [l, i]).filter(([l]) => l !== L && l.kind !== 'adjust');
  const docsOpts = docs.filter(d => d !== D).map(d => ({ value: 'doc:' + d.id, label: 'Document: ' + d.name }));
  const opts = [...others.map(([l, i]) => ({ value: 'layer:' + i, label: 'Layer: ' + l.name })), ...docsOpts, { value: 'merged', label: 'Merged image (this document)' }];
  if (!opts.length) return toast('Open another image or add another layer to match from', 'err');
  ensureCovers(L); const orig = cloneCanvas(L.canvas); let timer = null;
  const statsOf = v => { let c; if (v.startsWith('layer:')) c = layerDocCanvas(D.layers[+v.slice(6)]); else if (v.startsWith('doc:')) { const d = docs.find(x => x.id === v.slice(4)); const cur = D; D = d; c = flattenCanvas(); D = cur; } else c = flattenCanvas(); const k = Math.min(1, 500 / Math.max(c.width, c.height)), s = mk(c.width * k, c.height * k); ctxOf(s).drawImage(c, 0, 0, s.width, s.height); return X.adj.labStats(ctxOf(s).getImageData(0, 0, s.width, s.height).data, 1); };
  const vals = { src: opts[0].value, lum: 100, int: 100, fade: 0, neutral: false }; let stats = statsOf(vals.src);
  const preview = (v, key) => { if (key === 'src') stats = statsOf(vals.src); clearTimeout(timer); timer = setTimeout(() => { const c = L.canvas.getContext('2d'); c.clearRect(0, 0, orig.width, orig.height); c.drawImage(orig, 0, 0); layerImageOp(L, A.matchColor, { ...vals, stats }); contentSerial++; requestRender(false); }, 60); };
  const el = h('div', { class: 'ph-fields' }); buildFields(el, [{ key: 'src', label: 'Source', type: 'select', options: opts }, rng('lum', 'Luminance %', 0, 200, 100), rng('int', 'Color intensity %', 0, 200, 100), rng('fade', 'Fade %', 0, 100, 0), { key: 'neutral', label: 'Neutralize', type: 'checkbox' }], vals, preview);
  preview();
  const ok = await floatPanel({ title: 'Match Color', body: el });
  clearTimeout(timer); const c = L.canvas.getContext('2d'); c.clearRect(0, 0, orig.width, orig.height); c.drawImage(orig, 0, 0);
  if (ok) { layerImageOp(L, A.matchColor, { ...vals, stats }); pushHist('Match color'); } requestRender();
}

// =====================================================================  filters
const F = X.flt;
const FILTER_CATS = ['Blur', 'Sharpen', 'Noise', 'Pixelate', 'Stylize', 'Distort', 'Render', 'Portrait'];
const pt = (dx = 50, dy = 50) => [rng('x', 'Center X %', 0, 100, dx), rng('y', 'Center Y %', 0, 100, dy)];
const FILTERS = [
  { id: 'gauss', cat: 'Blur', name: 'Gaussian Blur', icon: 'blur', params: [rng('r', 'Radius (px)', 0.1, 250, 4, 0.1)], fn: (img, p, ctx) => X.gaussian(img, p.r * (ctx?.scale || 1)) },
  { id: 'box', cat: 'Blur', name: 'Box Blur', icon: 'blur', params: [rng('r', 'Radius (px)', 1, 250, 6)], fn: (img, p, ctx) => X.boxBlur(img, Math.max(1, p.r * (ctx?.scale || 1))) },
  { id: 'motion', cat: 'Blur', name: 'Motion Blur', icon: 'blur', params: [rng('a', 'Angle °', -180, 180, 0), rng('d', 'Distance (px)', 1, 500, 30)], fn: F.motionBlur },
  { id: 'radial', cat: 'Blur', name: 'Radial / Zoom Blur', icon: 'blur', params: [{ key: 'mode', label: 'Method', type: 'select', value: 'zoom', options: [{ value: 'zoom', label: 'Zoom' }, { value: 'spin', label: 'Spin' }] }, rng('amt', 'Amount', 1, 100, 25), ...pt()], fn: F.radialBlur, point: true },
  { id: 'lens', cat: 'Blur', name: 'Lens Blur (bokeh)', icon: 'blur', params: [rng('r', 'Radius (px)', 1, 120, 14), rng('b', 'Specular brightness', 0, 100, 40), rng('t', 'Highlight threshold', 120, 255, 200), { key: 'shape', label: 'Iris shape', type: 'select', value: 'circle', options: [{ value: 'circle', label: 'Circle' }, { value: 'hex', label: 'Hexagon' }] }, rng('noise', 'Noise', 0, 20, 0)], fn: F.lensBlur, slow: true },
  { id: 'tilt', cat: 'Blur', name: 'Tilt-Shift', icon: 'blur', params: [rng('y', 'Focus line position %', 0, 100, 55), rng('band', 'Sharp band %', 0, 80, 18), rng('fe', 'Transition %', 1, 60, 18), rng('r', 'Blur radius', 1, 80, 12), rng('a', 'Angle °', -90, 90, 0), rng('sat', 'Miniature saturation %', 0, 60, 15)], fn: F.tiltShift },
  { id: 'surface', cat: 'Blur', name: 'Surface Blur', icon: 'blur', params: [rng('r', 'Radius (px)', 1, 60, 6), rng('t', 'Threshold (levels)', 2, 255, 24)], fn: F.surfaceBlur },
  { id: 'sharpen', cat: 'Sharpen', name: 'Sharpen', icon: 'fx', params: [rng('amt', 'Amount %', 1, 300, 60)], fn: F.sharpen },
  { id: 'unsharp', cat: 'Sharpen', name: 'Unsharp Mask', icon: 'fx', params: [rng('amt', 'Amount %', 1, 500, 120), rng('r', 'Radius (px)', 0.1, 50, 1.5, 0.1), rng('t', 'Threshold (levels)', 0, 100, 2)], fn: F.unsharp },
  { id: 'noise', cat: 'Noise', name: 'Add Noise / Film Grain', icon: 'grid', params: [rng('a', 'Amount', 1, 150, 18), { key: 'mono', label: 'Monochromatic', type: 'checkbox', value: true }, { key: 'film', label: 'Film grain (stronger in midtones)', type: 'checkbox', value: true }, rng('size', 'Grain size', 1, 6, 1, 0.1), { key: 'dist', label: 'Distribution', type: 'select', value: 'gauss', options: [{ value: 'gauss', label: 'Gaussian' }, { value: 'uniform', label: 'Uniform' }] }, rng('seed', 'Seed', 1, 999, 1)], fn: F.addNoise },
  { id: 'median', cat: 'Noise', name: 'Reduce Noise (Median)', icon: 'blur', params: [rng('r', 'Radius (px)', 1, 10, 1), rng('keep', 'Preserve details %', 0, 100, 0)], fn: F.median },
  { id: 'mosaic', cat: 'Pixelate', name: 'Pixelate / Mosaic', icon: 'grid', params: [rng('s', 'Cell size (px)', 2, 300, 14)], fn: F.mosaic },
  { id: 'crystal', cat: 'Pixelate', name: 'Crystallize', icon: 'hexagon', params: [rng('s', 'Cell size (px)', 3, 300, 20), rng('seed', 'Seed', 1, 999, 3)], fn: F.crystallize },
  { id: 'halftone', cat: 'Pixelate', name: 'Color Halftone', icon: 'grid', params: [rng('s', 'Dot size (px)', 3, 80, 8), { key: 'mode', label: 'Mode', type: 'select', value: 'color', options: [{ value: 'color', label: 'Color (CMY screens)' }, { value: 'mono', label: 'Black & white' }] }, rng('ang', 'Screen angle (B&W)', 0, 90, 45)], fn: F.halftone },
  { id: 'posterize', cat: 'Stylize', name: 'Posterize', icon: 'grid', params: [rng('n', 'Levels', 2, 32, 5)], fn: A.posterize },
  { id: 'threshold', cat: 'Stylize', name: 'Threshold', icon: 'adjust', params: [rng('t', 'Threshold level', 1, 255, 128)], fn: A.threshold },
  { id: 'emboss', cat: 'Stylize', name: 'Emboss', icon: 'fx', params: [rng('a', 'Angle °', -180, 180, 135), rng('h', 'Height (px)', 1, 10, 2), rng('amt', 'Amount %', 1, 500, 150), { key: 'color', label: 'Keep color', type: 'checkbox', value: false }], fn: F.emboss },
  { id: 'edges', cat: 'Stylize', name: 'Find Edges', icon: 'fx', params: [rng('k', 'Strength', 0.2, 4, 1, 0.1)], fn: F.findEdges },
  { id: 'oil', cat: 'Stylize', name: 'Oil Paint', icon: 'brush', params: [rng('r', 'Stylization (px)', 1, 20, 4), rng('shine', 'Brush shine', 0, 100, 30)], fn: F.oilPaint },
  { id: 'glitch', cat: 'Stylize', name: 'Glitch / RGB Split', icon: 'fx', params: [rng('shift', 'RGB split (px)', 0, 80, 8), rng('slices', 'Slices', 0, 60, 12), rng('offset', 'Slice offset (px)', 0, 200, 30), { key: 'scan', label: 'Scanlines', type: 'checkbox', value: true }, rng('seed', 'Seed', 1, 999, 11)], fn: F.glitch },
  { id: 'solarize', cat: 'Stylize', name: 'Solarize', icon: 'adjust', fn: F.solarize },
  { id: 'chroma', cat: 'Distort', name: 'Chromatic Aberration', icon: 'fx', params: [rng('amt', 'Amount', -40, 40, 6)], fn: F.chromatic },
  { id: 'twirl', cat: 'Distort', name: 'Twirl', icon: 'rotate', params: [rng('a', 'Angle °', -999, 999, 180), rng('r', 'Radius %', 5, 100, 80), ...pt()], fn: F.twirl, point: true },
  { id: 'pinch', cat: 'Distort', name: 'Pinch / Bulge', icon: 'ellipse', params: [rng('a', 'Amount (+ pinch, − bulge)', -100, 100, -50), rng('r', 'Radius %', 5, 100, 80), ...pt()], fn: F.pinch, point: true },
  { id: 'wave', cat: 'Distort', name: 'Wave', icon: 'liquify', params: [rng('amp', 'Amplitude (px)', 1, 200, 12), rng('len', 'Wavelength (px)', 4, 800, 90), { key: 'dir', label: 'Direction', type: 'select', value: 'both', options: [{ value: 'both', label: 'Both' }, { value: 'h', label: 'Horizontal' }, { value: 'v', label: 'Vertical' }] }, { key: 'type', label: 'Type', type: 'select', value: 'sine', options: ['sine', 'triangle', 'square'] }], fn: F.wave },
  { id: 'ripple', cat: 'Distort', name: 'Ripple (water drop)', icon: 'liquify', params: [rng('amp', 'Amplitude (px)', 1, 80, 8), rng('len', 'Ring spacing (px)', 4, 300, 40), ...pt()], fn: F.ripple, point: true },
  { id: 'polar', cat: 'Distort', name: 'Polar Coordinates', icon: 'rotate', params: [{ key: 'mode', label: 'Conversion', type: 'select', value: 'toPolar', options: [{ value: 'toPolar', label: 'Rectangular to polar' }, { value: 'toRect', label: 'Polar to rectangular' }] }], fn: F.polar },
  { id: 'vignette', cat: 'Render', name: 'Vignette', icon: 'ellipse', params: [rng('a', 'Amount % (− = white)', -100, 100, 55), rng('s', 'Midpoint %', 0, 100, 45), rng('f', 'Feather %', 2, 100, 55), rng('round', 'Roundness %', 0, 100, 0), { key: 'c', label: 'Color', type: 'color', value: '#000000' }], fn: F.vignette },
  { id: 'flare', cat: 'Render', name: 'Lens Flare', icon: 'fx', params: [rng('x', 'Position X %', 0, 100, 25), rng('y', 'Position Y %', 0, 100, 25), rng('b', 'Brightness %', 10, 300, 100), { key: 'type', label: 'Lens type', type: 'select', value: 'prime', options: [{ value: 'prime', label: '50mm prime' }, { value: 'zoom', label: '105mm zoom' }, { value: 'anamorphic', label: 'Anamorphic (blue streak)' }] }], fn: F.lensFlare, point: true },
  { id: 'clouds', cat: 'Render', name: 'Clouds', icon: 'blur', params: [rng('sc', 'Scale (px)', 8, 2000, 220), rng('oct', 'Detail', 1, 9, 6), rng('rough', 'Roughness %', 20, 80, 50), rng('con', 'Contrast', 0, 100, 20), rng('seed', 'Seed', 1, 999, 5), { key: 'diff', label: 'Difference clouds', type: 'checkbox', value: false }], fn: F.clouds, note: 'Uses the foreground and background colors' },
  { id: 'skin', cat: 'Portrait', name: 'Skin Smoothing', icon: 'blur', params: [rng('amt', 'Smoothness %', 0, 100, 60), rng('r', 'Radius (px)', 1, 40, 8), rng('detail', 'Keep skin texture %', 0, 100, 25), { key: 'onlySkin', label: 'Only skin tones', type: 'checkbox', value: true }], fn: F.skinSmooth },
];
UI.shortcut('ctrl+f', () => repeatFilter()); UI.shortcut('ctrl+shift+x', () => liquifyDialog());
function filterRegion(L) {
  // doc-space rectangle the filter works on: selection bounds (or the canvas) ∩ layer
  const sb = D.sel ? maskBounds(D.sel) : { x: 0, y: 0, w: D.w, h: D.h }; if (!sb) return null;
  const x0 = Math.max(sb.x, L.x), y0 = Math.max(sb.y, L.y), x1 = Math.min(sb.x + sb.w, L.x + L.canvas.width), y1 = Math.min(sb.y + sb.h, L.y + L.canvas.height);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
function applyFilterToLayer(L, Fd, vals) {
  if (L.smart || (O.smartFilters && L.kind === 'raster')) return applySmartFilter(L, Fd, vals);
  ensureCovers(L); const r = filterRegion(L); if (!r) return false;
  const c = ctxOf(L.canvas), img = c.getImageData(r.x - L.x, r.y - L.y, r.w, r.h), orig = D.sel ? new Uint8ClampedArray(img.data) : null;
  Fd.fn(img, vals, { scale: 1, fg: O.fg, bg: O.bg, ox: r.x, oy: r.y });
  if (D.sel) { const sa = ctxOf(D.sel).getImageData(r.x, r.y, r.w, r.h).data, d = img.data; for (let i = 0; i < d.length; i += 4) { const a = sa[i + 3] / 255; if (a >= 1) continue; for (let k = 0; k < 4; k++) d[i + k] = orig[i + k] + (d[i + k] - orig[i + k]) * a; } }
  c.putImageData(img, r.x - L.x, r.y - L.y); return true;
}
function checkPixelLayer() { const L = AL(); if (!D || !L) { toast('Open an image first'); return null; } if (L.kind === 'adjust') { toast('Select a pixel layer — filters do not apply to adjustment layers', 'err'); return null; } if (L.kind === 'text' || L.kind === 'frame') { toast('Rasterize the ' + (L.kind === 'text' ? 'text' : 'frame') + ' layer first (Layer › Rasterize layer)', 'err'); return null; } if (L.locked) { toast('Layer is locked', 'err'); return null; } return L; }
async function runFilter(Fd, vals) {
  const L = checkPixelLayer(); if (!L) return;
  if (Fd.params && !vals) return filterDialog(Fd);
  vals = vals || {};
  await withBusy(Fd.name + '…', async () => { if (applyFilterToLayer(L, Fd, vals)) { lastFilter = { F: Fd, vals: { ...vals } }; requestRender(); pushHist(Fd.name); } else toast('Nothing to filter in this area'); });
}
function repeatFilter() { if (!lastFilter) return toast('No filter applied yet'); runFilter(lastFilter.F, lastFilter.vals); }
async function filterDialog(Fd, { gallery = false, smartEdit = null } = {}) {
  const L = smartEdit ? smartEdit.L : checkPixelLayer(); if (!L) return; ensureCovers(L); const r = smartEdit ? { x: L.x, y: L.y, w: L.canvas.width, h: L.canvas.height } : filterRegion(L); if (!r) return toast('Nothing to filter in this area');
  const se = smartEdit ? L.smart.filters[smartEdit.i] : null;
  const PW = gallery ? 560 : 620, PH = gallery ? 420 : 440, k = Math.min(1, PW / r.w, PH / r.h), pw = Math.max(1, Math.round(r.w * k)), ph = Math.max(1, Math.round(r.h * k));
  const src = mk(pw, ph), sx = ctxOf(src); sx.imageSmoothingQuality = 'high'; sx.drawImage(se ? smartPartial(L, smartEdit.i) : L.canvas, r.x - L.x, r.y - L.y, r.w, r.h, 0, 0, pw, ph); const base = sx.getImageData(0, 0, pw, ph);
  let selA = null; if (se ? se.mask : D.sel) { const sc = mk(pw, ph), scx = ctxOf(sc); scx.drawImage(se ? se.mask : D.sel, se ? 0 : r.x, se ? 0 : r.y, r.w, r.h, 0, 0, pw, ph); selA = scx.getImageData(0, 0, pw, ph).data; }
  const pv = h('canvas', { width: pw, height: ph, class: 'ph-preview-cv checker' }), info = h('div', { class: 'muted pv-info' }, ''); let cur = Fd, vals = se ? JSON.parse(JSON.stringify(se.vals)) : defaultsOf(Fd), timer = null, showOrig = false;
  const renderPv = () => { const img = new ImageData(new Uint8ClampedArray(base.data), pw, ph); if (!showOrig) { const t0 = performance.now(); try { cur.fn(img, vals, { scale: k, fg: O.fg, bg: O.bg, ox: r.x * k, oy: r.y * k }); } catch (e) { console.error(e); } if (selA) { const d = img.data, b = base.data; for (let i = 0; i < d.length; i += 4) { const a = selA[i + 3] / 255; for (let q = 0; q < 4; q++) d[i + q] = b[i + q] + (d[i + q] - b[i + q]) * a; } } info.textContent = `Preview ${Math.round(k * 100)}% · ${Math.round(performance.now() - t0)} ms`; } else info.textContent = 'Original'; ctxOf(pv).putImageData(img, 0, 0); };
  const sched = () => { clearTimeout(timer); timer = setTimeout(renderPv, cur.slow ? 120 : 30); };
  pv.onpointerdown = e => { if (cur.point && !e.altKey) { const b = pv.getBoundingClientRect(); vals.x = Math.round((e.clientX - b.left) / b.width * 100); vals.y = Math.round((e.clientY - b.top) / b.height * 100); drawFields(); sched(); return; } showOrig = true; renderPv(); };
  pv.onpointerup = () => { if (showOrig) { showOrig = false; renderPv(); } };
  const fields = h('div', { class: 'ph-fields' }), title = h('div', { class: 'fx-title' });
  const drawFields = () => { fields.innerHTML = ''; title.textContent = cur.name; if (cur.params) buildFields(fields, cur.params, vals, () => sched()); else fields.append(h('div', { class: 'muted' }, 'This filter has no settings.')); if (cur.note) fields.append(h('div', { class: 'muted', style: { fontSize: '11px' } }, cur.note)); if (cur.point) fields.append(h('div', { class: 'muted', style: { fontSize: '11px' } }, 'Click the preview to set the center · Alt+press to compare')); else fields.append(h('div', { class: 'muted', style: { fontSize: '11px' } }, 'Press and hold the preview to see the original')); };
  let galleryEl = null;
  if (gallery) {
    galleryEl = h('div', { class: 'fg-list' }); const tk = Math.min(1, 84 / Math.max(pw, ph)), tw = Math.max(1, Math.round(pw * tk)), tht = Math.max(1, Math.round(ph * tk)), ts = mk(tw, tht); ctxOf(ts).drawImage(src, 0, 0, tw, tht); const tbase = ctxOf(ts).getImageData(0, 0, tw, tht);
    FILTER_CATS.forEach(cat => { galleryEl.append(h('div', { class: 'fg-cat' }, cat)); const g = h('div', { class: 'fg-grid' }); FILTERS.filter(f => f.cat === cat).forEach(f => { const c = h('canvas', { width: tw, height: tht }); const cell = h('div', { class: 'fg-cell' + (f === cur ? ' on' : ''), title: f.name, onclick: () => { cur = f; vals = defaultsOf(f); galleryEl.querySelectorAll('.fg-cell').forEach(x => x.classList.toggle('on', x === cell)); drawFields(); sched(); } }, c, h('span', {}, f.name)); g.append(cell); setTimeout(() => { if (!c.isConnected) return; const im = new ImageData(new Uint8ClampedArray(tbase.data), tw, tht); try { f.fn(im, defaultsOf(f), { scale: tk * k, fg: O.fg, bg: O.bg }); } catch { } ctxOf(c).putImageData(im, 0, 0); }, 10); }); galleryEl.append(g); });
  }
  drawFields(); renderPv();
  const body = h('div', { class: 'ph-dlg' + (gallery ? ' gallery' : '') }, h('div', { class: 'ph-preview' }, pv, info), ...(gallery ? [galleryEl] : []), h('div', { class: 'ph-side' }, title, fields));
  const res = await modal({ title: (se ? 'Smart filter — ' : '') + (gallery ? 'Filter Gallery' : cur.name), width: gallery ? 1180 : 960, body, buttons: [{ label: 'Cancel', value: null }, { label: 'Apply', primary: true, value: 'ok' }] });
  clearTimeout(timer); if (res !== 'ok') return;
  if (se) { se.vals = vals; L.canvas = smartRecompute(L); requestRender(); pushHist('Edit smart filter: ' + cur.name); renderLayers(); return; }
  await withBusy(cur.name + '…', async () => { if (applyFilterToLayer(L, cur, vals)) { lastFilter = { F: cur, vals: { ...vals } }; requestRender(); pushHist(cur.name); } });
}

// =====================================================================  Liquify
async function liquifyDialog() {
  const L = checkPixelLayer(); if (!L || smartBlock(L)) return; ensureCovers(L);
  const r = D.sel ? filterRegion(L) : { x: Math.max(0, L.x), y: Math.max(0, L.y), w: Math.min(D.w, L.x + L.canvas.width) - Math.max(0, L.x), h: Math.min(D.h, L.y + L.canvas.height) - Math.max(0, L.y) };
  if (!r || r.w < 2 || r.h < 2) return;
  const fullC = mk(r.w, r.h); ctxOf(fullC).drawImage(L.canvas, r.x - L.x, r.y - L.y, r.w, r.h, 0, 0, r.w, r.h);
  const k = Math.min(1, 1100 / Math.max(r.w, r.h)), pw = Math.max(2, Math.round(r.w * k)), ph = Math.max(2, Math.round(r.h * k));
  const srcC = mk(pw, ph), sxc = ctxOf(srcC); sxc.imageSmoothingQuality = 'high'; sxc.drawImage(fullC, 0, 0, pw, ph); const src = sxc.getImageData(0, 0, pw, ph);
  // displacement field (output pixel p samples source at p + d(p)), stored at preview resolution
  let dx = new Float32Array(pw * ph), dy = new Float32Array(pw * ph); const undoStack = [];
  const st = { tool: 'warp', size: Math.round(Math.max(pw, ph) / 8), pressure: 50, density: 50, mesh: false, showBrush: true };
  const cv = h('canvas', { width: pw, height: ph, class: 'lq-canvas checker' }), out = new ImageData(pw, ph), ov = h('canvas', { class: 'lq-ov' });
  const renderOut = () => { const s = src.data, o = out.data, tmp = [0, 0, 0, 0]; for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) { const i = y * pw + x; if (dx[i] === 0 && dy[i] === 0) { const j = i * 4; o[j] = s[j]; o[j + 1] = s[j + 1]; o[j + 2] = s[j + 2]; o[j + 3] = s[j + 3]; continue; } X.bilinear(s, pw, ph, x + dx[i], y + dy[i], o, i * 4); } ctxOf(cv).putImageData(out, 0, 0); drawOv(); };
  let cursor = null;
  const drawOv = () => { const rc = cv.getBoundingClientRect(); ov.width = rc.width; ov.height = rc.height; const c = ov.getContext('2d'); c.clearRect(0, 0, ov.width, ov.height); const s = rc.width / pw;
    if (st.mesh) { c.strokeStyle = 'rgba(80,160,255,.55)'; c.lineWidth = 1; const step = Math.max(8, Math.round(Math.max(pw, ph) / 40)); c.beginPath(); for (let y = 0; y <= ph; y += step) for (let x = 0; x <= pw; x += step) { const i = Math.min(ph - 1, y) * pw + Math.min(pw - 1, x); const px = (x - dx[i]) * s, py = (y - dy[i]) * s; if (x) c.lineTo(px, py); else c.moveTo(px, py); } c.stroke(); c.beginPath(); for (let x = 0; x <= pw; x += step) for (let y = 0; y <= ph; y += step) { const i = Math.min(ph - 1, y) * pw + Math.min(pw - 1, x); const px = (x - dx[i]) * s, py = (y - dy[i]) * s; if (y) c.lineTo(px, py); else c.moveTo(px, py); } c.stroke(); }
    if (cursor) { c.strokeStyle = 'rgba(0,0,0,.8)'; c.lineWidth = 1; c.beginPath(); c.arc(cursor[0] * s, cursor[1] * s, st.size / 2 * s, 0, 7); c.stroke(); c.strokeStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(cursor[0] * s, cursor[1] * s, st.size / 2 * s + 1, 0, 7); c.stroke(); } };
  const sample = (a, x, y) => { x = clamp(x, 0, pw - 1.001); y = clamp(y, 0, ph - 1.001); const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * pw + x0; return (a[i] * (1 - fx) + a[i + 1] * fx) * (1 - fy) + (a[i + pw] * (1 - fx) + a[i + pw + 1] * fx) * fy; };
  const dab = (cx, cy, mvx, mvy) => {
    const R = st.size / 2, p = st.pressure / 100, x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(pw - 1, Math.ceil(cx + R)), y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(ph - 1, Math.ceil(cy + R));
    const ox = dx.slice(), oy = dy.slice(), dens = st.density / 100;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const ddx = x - cx, ddy = y - cy, d = Math.hypot(ddx, ddy) / R; if (d >= 1) continue; const w = Math.pow(1 - d * d, 1 + dens * 2) * p, i = y * pw + x;
      if (st.tool === 'warp') { const qx = x - mvx * w, qy = y - mvy * w; dx[i] = sample(ox, qx, qy) + qx - x; dy[i] = sample(oy, qx, qy) + qy - y; }
      else if (st.tool === 'twirlcw' || st.tool === 'twirlccw') { const a = (st.tool === 'twirlcw' ? -1 : 1) * 0.12 * w, cs = Math.cos(a), sn = Math.sin(a); const qx = cx + ddx * cs - ddy * sn, qy = cy + ddx * sn + ddy * cs; dx[i] = sample(ox, qx, qy) + qx - x; dy[i] = sample(oy, qx, qy) + qy - y; }
      else if (st.tool === 'pucker' || st.tool === 'bloat') { const f = st.tool === 'pucker' ? 1 + 0.06 * w : 1 - 0.06 * w; const qx = cx + ddx * f, qy = cy + ddy * f; dx[i] = sample(ox, qx, qy) + qx - x; dy[i] = sample(oy, qx, qy) + qy - y; }
      else if (st.tool === 'reconstruct') { const f = 1 - 0.25 * w; dx[i] = ox[i] * f; dy[i] = oy[i] * f; }
      else if (st.tool === 'smooth') { let sx = 0, sy = 0, n = 0; for (let k2 = -2; k2 <= 2; k2++) for (let l2 = -2; l2 <= 2; l2++) { const xx = clamp(x + l2, 0, pw - 1), yy = clamp(y + k2, 0, ph - 1), j = yy * pw + xx; sx += ox[j]; sy += oy[j]; n++; } dx[i] = ox[i] + (sx / n - ox[i]) * w; dy[i] = oy[i] + (sy / n - oy[i]) * w; }
      else if (st.tool === 'push') { const nx = -mvy, ny = mvx, qx = x - nx * w * 0.5, qy = y - ny * w * 0.5; dx[i] = sample(ox, qx, qy) + qx - x; dy[i] = sample(oy, qx, qy) + qy - y; }
    }
  };
  let dragging = null, raf = 0; const toP = e => { const rc = cv.getBoundingClientRect(); return [(e.clientX - rc.left) / rc.width * pw, (e.clientY - rc.top) / rc.height * ph]; };
  const sched = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; renderOut(); }); };
  let holdTimer = null;
  ov.onpointerdown = e => { ov.setPointerCapture(e.pointerId); undoStack.push([dx.slice(), dy.slice()]); if (undoStack.length > 30) undoStack.shift(); const p = toP(e); dragging = p; if (st.tool !== 'warp' && st.tool !== 'push') { dab(p[0], p[1], 0, 0); sched(); holdTimer = setInterval(() => { if (dragging) { dab(dragging[0], dragging[1], 0, 0); sched(); } }, 40); } };
  ov.onpointermove = e => { const p = toP(e); cursor = p; if (!dragging) { drawOv(); return; } const mvx = p[0] - dragging[0], mvy = p[1] - dragging[1]; const dist = Math.hypot(mvx, mvy), step = Math.max(1, st.size / 10); if (dist < step && (st.tool === 'warp' || st.tool === 'push')) { drawOv(); return; } const n = Math.max(1, Math.ceil(dist / step)); for (let s = 1; s <= n; s++) { const q = [dragging[0] + mvx * s / n, dragging[1] + mvy * s / n]; dab(q[0], q[1], mvx / n, mvy / n); } dragging = p; sched(); };
  ov.onpointerup = () => { dragging = null; clearInterval(holdTimer); };
  ov.onpointerleave = () => { cursor = null; drawOv(); };
  ov.onwheel = e => { e.preventDefault(); st.size = clamp(Math.round(st.size * (e.deltaY < 0 ? 1.1 : 0.9)), 2, Math.max(pw, ph)); sizeI.value = st.size; drawOv(); };
  const TOOLS_LQ = [['warp', 'Forward warp', 'W'], ['reconstruct', 'Reconstruct', 'R'], ['smooth', 'Smooth', 'E'], ['twirlcw', 'Twirl clockwise', 'C'], ['twirlccw', 'Twirl counter-clockwise', 'Shift+C'], ['pucker', 'Pucker', 'S'], ['bloat', 'Bloat', 'B'], ['push', 'Push left', 'O']];
  const tb = h('div', { class: 'lq-tools' }); const drawTb = () => { tb.innerHTML = ''; TOOLS_LQ.forEach(([id, n, key]) => tb.append(h('button', { class: 'btn sm' + (st.tool === id ? ' primary' : ''), 'data-tip': key, onclick: () => { st.tool = id; drawTb(); } }, n))); }; drawTb();
  const sizeI = h('input', { type: 'number', min: 2, max: 2000, value: st.size, style: { width: '70px' } }); sizeI.oninput = () => { st.size = clamp(+sizeI.value, 2, 2000); };
  const opts = h('div', { class: 'ph-fields' }); opts.append(h('label', { class: 'field' }, 'Brush size (px, wheel)', sizeI)); buildFields(opts, [rng('pressure', 'Brush pressure', 1, 100, 50), rng('density', 'Brush density', 0, 100, 50), { key: 'mesh', label: 'Show mesh', type: 'checkbox' }], st, () => drawOv());
  const acts = h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } }, h('button', { class: 'btn sm', onclick: () => { const u = undoStack.pop(); if (u) { [dx, dy] = u; renderOut(); } } }, 'Undo step'), h('button', { class: 'btn sm', onclick: () => { undoStack.push([dx.slice(), dy.slice()]); dx.fill(0); dy.fill(0); renderOut(); } }, 'Restore all'));
  const keyH = e => { if (e.target.closest('input')) return; const m = { w: 'warp', r: 'reconstruct', e: 'smooth', c: e.shiftKey ? 'twirlccw' : 'twirlcw', s: 'pucker', b: 'bloat', o: 'push' }[e.key.toLowerCase()]; if (m) { st.tool = m; drawTb(); e.stopPropagation(); } if (e.key === '[') { st.size = Math.max(2, Math.round(st.size / 1.15)); sizeI.value = st.size; drawOv(); } if (e.key === ']') { st.size = Math.round(st.size * 1.15 + 1); sizeI.value = st.size; drawOv(); } if ((e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); const u = undoStack.pop(); if (u) { [dx, dy] = u; renderOut(); } } };
  const body = h('div', { class: 'lq' }, h('div', { class: 'lq-left' }, tb), h('div', { class: 'lq-stage' }, h('div', { class: 'lq-wrap' }, cv, ov)), h('div', { class: 'lq-right' }, opts, acts, h('div', { class: 'muted', style: { fontSize: '11px' } }, 'Drag to warp. Hold the mouse for twirl, pucker and bloat. [ ] change the brush size.')));
  window.addEventListener('keydown', keyH, true);
  renderOut(); setTimeout(drawOv, 50);
  window.__lq = { st, dab, renderOut, get dx() { return dx; } };
  const res = await modal({ title: 'Liquify', width: Math.min(innerWidth - 40, 1400), body, buttons: [{ label: 'Cancel', value: null }, { label: 'Apply', primary: true, value: 'ok' }] });
  window.removeEventListener('keydown', keyH, true); clearInterval(holdTimer); delete window.__lq;
  if (res !== 'ok' || !dx.some(v => v) && !dy.some(v => v)) return;
  await withBusy('Applying liquify…', async () => {
    const W = r.w, H = r.h, fd = ctxOf(fullC).getImageData(0, 0, W, H), s = fd.data, o = new ImageData(W, H), od = o.data, sx = pw / W, sy = ph / H;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const px = (x + 0.5) * sx - 0.5, py = (y + 0.5) * sy - 0.5; const ddx = sample(dx, px, py) / sx, ddy = sample(dy, px, py) / sy; const j = (y * W + x) * 4; if (!ddx && !ddy) { od[j] = s[j]; od[j + 1] = s[j + 1]; od[j + 2] = s[j + 2]; od[j + 3] = s[j + 3]; continue; } X.bilinear(s, W, H, x + ddx, y + ddy, od, j); }
    if (D.sel) { const sa = ctxOf(D.sel).getImageData(r.x, r.y, W, H).data; for (let i = 0; i < od.length; i += 4) { const a = sa[i + 3] / 255; for (let q = 0; q < 4; q++) od[i + q] = s[i + q] + (od[i + q] - s[i + q]) * a; } }
    const c = mk(W, H); ctxOf(c).putImageData(o, 0, 0); const lc = L.canvas.getContext('2d'); lc.clearRect(r.x - L.x, r.y - L.y, W, H); lc.drawImage(c, r.x - L.x, r.y - L.y); requestRender(); pushHist('Liquify');
  });
}

// =====================================================================  smart selections
let segPromise = null;
function loadSegmenter() {
  if (segPromise) return segPromise;
  segPromise = (async () => {
    if (!window.SelfieSegmentation) { await new Promise((res, rej) => { const s = document.createElement('script'); s.src = '../vendor/photo-selfie/selfie_segmentation.js'; s.onload = res; s.onerror = () => rej(new Error('segmentation model missing')); document.head.append(s); }); }
    const base = new URL('../vendor/photo-selfie/', location.href).href;
    const seg = new SelfieSegmentation({ locateFile: f => base + f }); seg.setOptions({ modelSelection: 0, selfieMode: false });
    let resolveRes = null; seg.onResults(r => resolveRes && resolveRes(r));
    return { run: async canvas => { const p = new Promise(r => resolveRes = r); await seg.send({ image: canvas }); const r = await p; return r.segmentationMask; } };
  })();
  segPromise.catch(() => { segPromise = null; });
  return segPromise;
}
// person mask (Uint8 0..255, doc size) refined with a guided filter on the image
async function personMask(srcCanvas) {
  const seg = await loadSegmenter(); const W = srcCanvas.width, H = srcCanvas.height;
  const k = Math.min(1, 1024 / Math.max(W, H)), sw = Math.max(16, Math.round(W * k)), sh = Math.max(16, Math.round(H * k)), small = mk(sw, sh), sc = ctxOf(small); sc.fillStyle = '#fff'; sc.fillRect(0, 0, sw, sh); sc.drawImage(srcCanvas, 0, 0, sw, sh);
  const m = await seg.run(small); const mc = mk(sw, sh), mx = ctxOf(mc); mx.drawImage(m, 0, 0, sw, sh); const md = mx.getImageData(0, 0, sw, sh).data;
  const P = new Float32Array(sw * sh); for (let i = 0; i < P.length; i++) P[i] = Math.max(md[i * 4], md[i * 4 + 3] < 255 ? md[i * 4 + 3] : 0) / 255;
  const I = X.lumaOf(sc.getImageData(0, 0, sw, sh)); const q = X.guidedFilter(I, P, sw, sh, Math.max(2, Math.round(Math.max(sw, sh) / 160)), 1e-3);
  const qc = mk(sw, sh), qx = ctxOf(qc), id = qx.createImageData(sw, sh); for (let i = 0; i < q.length; i++) { const v = X.smoothstep(0.38, 0.72, q[i]) * 255; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255; id.data[i * 4 + 3] = v; } qx.putImageData(id, 0, 0);
  const full = mk(W, H), fx = ctxOf(full); fx.imageSmoothingQuality = 'high'; fx.drawImage(qc, 0, 0, W, H); const fd = fx.getImageData(0, 0, W, H).data, out = new Uint8ClampedArray(W * H); for (let i = 0; i < out.length; i++) out[i] = fd[i * 4 + 3]; return out;
}
// background by flooding from the borders through colours similar to the border colours
function plainBgMask(img, tol = 30, contiguous = true) {
  const W = img.width, H = img.height, d = img.data, n = W * H;
  const border = []; for (let x = 0; x < W; x += Math.max(1, W >> 7)) { border.push(x, (H - 1) * W + x); } for (let y = 0; y < H; y += Math.max(1, H >> 7)) { border.push(y * W, y * W + W - 1); }
  // k-means (k<=3) on the border colours
  let cents = [[d[0], d[1], d[2]], [d[(n - 1) * 4], d[(n - 1) * 4 + 1], d[(n - 1) * 4 + 2]], [d[(W - 1) * 4], d[(W - 1) * 4 + 1], d[(W - 1) * 4 + 2]]];
  for (let it = 0; it < 8; it++) { const s = cents.map(() => [0, 0, 0, 0]); border.forEach(i => { const j = i * 4; let b = 0, bd = 1e9; cents.forEach((c, k) => { const e = (d[j] - c[0]) ** 2 + (d[j + 1] - c[1]) ** 2 + (d[j + 2] - c[2]) ** 2; if (e < bd) { bd = e; b = k; } }); s[b][0] += d[j]; s[b][1] += d[j + 1]; s[b][2] += d[j + 2]; s[b][3]++; }); cents = s.filter(v => v[3] > border.length * 0.04).map(v => [v[0] / v[3], v[1] / v[3], v[2] / v[3]]); if (!cents.length) cents = [[d[0], d[1], d[2]]]; }
  const t2 = (tol * 1.8) ** 2, like = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const j = i * 4; if (d[j + 3] < 16) { like[i] = 1; continue; } for (const c of cents) { if ((d[j] - c[0]) ** 2 + (d[j + 1] - c[1]) ** 2 + (d[j + 2] - c[2]) ** 2 < t2) { like[i] = 1; break; } } }
  if (!contiguous) return like;
  const bg = new Uint8Array(n), st = []; const push = i => { if (like[i] && !bg[i]) { bg[i] = 1; st.push(i); } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); } for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (st.length) { const i = st.pop(), x = i % W; if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (i >= W) push(i - W); if (i < n - W) push(i + W); }
  return bg;
}
function softFromBits(bits, W, H, feather, shift = 0) { let a = new Uint8ClampedArray(bits.length); for (let i = 0; i < a.length; i++) a[i] = bits[i] ? 255 : 0; if (shift) a = X.shiftEdge(a, W, H, shift); if (feather > 0) { const f = Float32Array.from(a); X.gaussChan(f, W, H, feather / 2); a = Uint8ClampedArray.from(f); } return a; }
async function subjectAlpha(mode, src) {
  if (mode === 'ai') {
    try { const a = await personMask(src); let on = 0; for (let i = 0; i < a.length; i += 7) if (a[i] > 128) on++; if (on / (a.length / 7) > 0.004) return a; toast('No person found — used background-colour detection instead'); }
    catch (e) { console.error(e); toast('Person model unavailable — used background-colour detection', 'err'); }
  }
  const img = ctxOf(src).getImageData(0, 0, src.width, src.height), bg = plainBgMask(img, 30, true); for (let i = 0; i < bg.length; i++) bg[i] = bg[i] ? 0 : 1;
  // remove tiny islands of foreground noise via open (contract+expand)
  return softFromBits(bg, src.width, src.height, 1.5, 0);
}
async function selectSubject(mode = 'ai') { if (!D) return; await withBusy('Selecting subject…', async () => { const a = await subjectAlpha(mode, flattenCanvas()); setSel(maskFromAlpha(a)); pushHist('Select subject'); }); }
async function removeBackground(mode) {
  const L = AL(); if (!L || L.kind === 'adjust') return toast('Select a pixel layer', 'err');
  if (mode === 'plain') {
    const src = layerDocCanvas(L), img = ctxOf(src).getImageData(0, 0, D.w, D.h); let timer = null;
    const vals = { tol: 30, feather: 2, shift: 0, holes: false };
    const before = { mask: L.mask, mv: L.maskVer, em: L.editMask };
    const prev = () => { clearTimeout(timer); timer = setTimeout(() => { const bg = plainBgMask(img, vals.tol, !vals.holes); const fg = new Uint8Array(bg.length); for (let i = 0; i < bg.length; i++) fg[i] = bg[i] ? 0 : 1; maskFromDocAlpha(L, softFromBits(fg, D.w, D.h, vals.feather, -vals.shift)); requestRender(); }, 80); };
    const el = h('div', { class: 'ph-fields' }); buildFields(el, [rng('tol', 'Tolerance', 1, 120, 30), rng('feather', 'Feather (px)', 0, 40, 2), rng('shift', 'Shift edge inward (px)', -10, 20, 0), { key: 'holes', label: 'Also remove enclosed background areas', type: 'checkbox' }, { key: 'n', type: 'note', label: 'Works best for products and portraits on a plain, evenly coloured background. The result is a layer mask, so you can paint it to fix details.' }], vals, prev);
    prev(); const ok = await floatPanel({ title: 'Remove background', body: el, ok: 'Remove' }); clearTimeout(timer);
    if (!ok) { L.mask = before.mask; L.maskVer = before.mv; L.editMask = before.em; requestRender(); return; }
    const bg = plainBgMask(img, vals.tol, !vals.holes); const fg = new Uint8Array(bg.length); for (let i = 0; i < bg.length; i++) fg[i] = bg[i] ? 0 : 1; maskFromDocAlpha(L, softFromBits(fg, D.w, D.h, vals.feather, -vals.shift)); requestRender(); pushHist('Remove background'); renderLayers(); return;
  }
  await withBusy('Removing background…', async () => { const a = await subjectAlpha('ai', layerDocCanvas(L)); maskFromDocAlpha(L, a); requestRender(); pushHist('Remove background'); renderLayers(); toast('Background hidden with a layer mask — paint the mask to refine', 'ok'); });
}
async function selectSky() {
  if (!D) return;
  await withBusy('Selecting sky…', async () => {
    const W = D.w, H = D.h, img = ctxOf(flattenCanvas()).getImageData(0, 0, W, H), d = img.data, n = W * H;
    const skyLike = i => { const j = i * 4, r = d[j], g = d[j + 1], b = d[j + 2], l = (r + g + b) / 3, mx = Math.max(r, g, b), mn = Math.min(r, g, b); const blue = b >= r + 8 && b >= g - 20 && l > 70; const cloud = l > 165 && mx - mn < 45; const dusk = r > 150 && l > 120 && b > 60 && mx - mn < 120 && (i / W) < H * 0.5; return blue || cloud || dusk; };
    // grad magnitude for edge stopping
    const L = X.lumaOf(img); const sky = new Uint8Array(n), st = [];
    for (let x = 0; x < W; x++) for (let y = 0; y < Math.max(1, H * 0.02); y++) { const i = (y | 0) * W + x; if (skyLike(i)) { sky[i] = 1; st.push(i); } }
    while (st.length) { const i = st.pop(), x = i % W, y = (i - x) / W; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) { if (j < 0 || sky[j]) continue; if (Math.abs(L[j] - L[i]) > 0.09 || !skyLike(j)) continue; sky[j] = 1; st.push(j); } }
    let on = 0, blue = 0, sr = 0, sb = 0, top = 0; for (let i = 0; i < n; i++) if (sky[i]) { on++; const j = i * 4; sr += d[j]; sb += d[j + 2]; if (d[j + 2] > d[j] + 12) blue++; } for (let x = 0; x < W; x++) top += sky[x];
    const bright = on ? (sr + sb) / 2 / on : 0;
    if (on < n * 0.01 || (blue < on * 0.12 && !(bright > 175 && top > W * 0.6 && sb >= sr * 0.97))) return toast('No sky found in this image');
    // smooth: close small gaps then feather
    let a = softFromBits(sky, W, H, 0, 3); a = X.shiftEdge(a, W, H, -2); const f = Float32Array.from(a); X.gaussChan(f, W, H, 1.2);
    setSel(maskFromAlpha(Uint8ClampedArray.from(f))); pushHist('Select sky');
  });
}
async function focusAreaDialog() {
  if (!D) return; const W = D.w, H = D.h, k = Math.min(1, 900 / Math.max(W, H)), sw = Math.round(W * k), sh = Math.round(H * k), s = mk(sw, sh), sx = ctxOf(s); sx.drawImage(flattenCanvas(), 0, 0, sw, sh);
  const L = X.lumaOf(sx.getImageData(0, 0, sw, sh)), E = new Float32Array(sw * sh);
  for (let y = 1; y < sh - 1; y++) for (let x = 1; x < sw - 1; x++) { const i = y * sw + x; E[i] = Math.abs(4 * L[i] - L[i - 1] - L[i + 1] - L[i - sw] - L[i + sw]); }
  X.gaussChan(E, sw, sh, Math.max(3, Math.max(sw, sh) / 45)); let mx = 0; for (const v of E) mx = Math.max(mx, v); for (let i = 0; i < E.length; i++) E[i] /= mx || 1;
  const vals = { range: 50, soft: 3 }; const prevSel = D.sel;
  const make = () => { const th = 0.6 - vals.range / 100 * 0.55; const bits = new Uint8Array(E.length); for (let i = 0; i < E.length; i++) bits[i] = E[i] > th ? 1 : 0; let a = softFromBits(bits, sw, sh, 0, 4); a = X.shiftEdge(a, sw, sh, -4); const f = Float32Array.from(a); X.gaussChan(f, sw, sh, vals.soft); const sm = maskFromAlpha(Uint8ClampedArray.from(f), sw, sh), full = mk(W, H); full.getContext('2d').drawImage(sm, 0, 0, W, H); return full; };
  let timer; const prev = () => { clearTimeout(timer); timer = setTimeout(() => { D.sel = make(); D.selPath = buildAnts(D.sel); drawOverlay(); }, 60); };
  const el = h('div', { class: 'ph-fields' }); buildFields(el, [rng('range', 'In-focus range', 0, 100, 50), rng('soft', 'Softness', 0, 20, 3), { key: 'n', type: 'note', label: 'Selects the sharp, in-focus parts of the photo.' }], vals, prev); prev();
  const ok = await floatPanel({ title: 'Focus area', body: el }); clearTimeout(timer);
  if (!ok) { D.sel = prevSel; D.selPath = prevSel ? buildAnts(prevSel) : null; drawOverlay(); return; }
  D.sel = prevSel; setSel(make()); pushHist('Focus area');
}
async function colorRangeDialog() {
  if (!D) return; const flat = flattenCanvas(), W = D.w, H = D.h, img = ctxOf(flat).getImageData(0, 0, W, H), d = img.data;
  const k = Math.min(1, 300 / Math.max(W, H)), pw = Math.round(W * k), ph = Math.round(H * k); const thumb = mk(pw, ph); ctxOf(thumb).drawImage(flat, 0, 0, pw, ph);
  const vals = { mode: 'sampled', color: O.fg, fuzz: 40, invert: false }; const pv = h('canvas', { width: pw, height: ph, class: 'ph-preview-cv', style: { cursor: 'crosshair' } });
  const compute = (full) => { const w = full ? W : pw, hh = full ? H : ph, src = full ? d : ctxOf(thumb).getImageData(0, 0, pw, ph).data, a = new Uint8ClampedArray(w * hh); const [r0, g0, b0] = hexToRgb(vals.color), fz = Math.max(1, vals.fuzz * 1.6);
    for (let i = 0; i < a.length; i++) { const j = i * 4, r = src[j], g = src[j + 1], b = src[j + 2], l = 0.299 * r + 0.587 * g + 0.114 * b, mx = Math.max(r, g, b), mn = Math.min(r, g, b); let v;
      switch (vals.mode) {
        case 'highlights': v = X.smoothstep(150, 200, l); break; case 'midtones': v = 1 - Math.min(1, Math.abs(l - 128) / 70); break; case 'shadows': v = 1 - X.smoothstep(50, 100, l); break;
        case 'skin': { const ok = r > 80 && g > 40 && b > 20 && r > g && r > b && r - mn > 15 && Math.abs(r - g) > 12; v = ok ? 1 - Math.min(1, Math.abs((r - g) / (r + 1) - 0.18) * 4) : 0; break; }
        case 'sampled': { const dist = Math.sqrt((r - r0) ** 2 + (g - g0) ** 2 + (b - b0) ** 2); v = clamp(1 - (dist - fz * 0.5) / (fz * 0.5), 0, 1); break; }
        default: { const hue = { reds: 0, yellows: 60, greens: 120, cyans: 180, blues: 240, magentas: 300 }[vals.mode]; const [hh2, s] = X.rgb2hsl(r, g, b); let dh = Math.abs(hh2 * 360 - hue); dh = Math.min(dh, 360 - dh); v = s > 0.12 && mx - mn > 20 ? clamp(1 - (dh - 15) / 30, 0, 1) : 0; }
      } a[i] = (vals.invert ? 1 - v : v) * 255; }
    return a; };
  const draw = () => { const a = compute(false), id = new ImageData(pw, ph); for (let i = 0; i < a.length; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = a[i]; id.data[i * 4 + 3] = 255; } ctxOf(pv).putImageData(id, 0, 0); };
  pv.onclick = e => { const r = pv.getBoundingClientRect(), x = clamp(Math.floor((e.clientX - r.left) / r.width * W), 0, W - 1), y = clamp(Math.floor((e.clientY - r.top) / r.height * H), 0, H - 1), j = (y * W + x) * 4; vals.color = rgbToHex(d[j], d[j + 1], d[j + 2]); vals.mode = 'sampled'; drawF(); draw(); };
  const fl = h('div', { class: 'ph-fields' }); const drawF = () => { fl.innerHTML = ''; buildFields(fl, [{ key: 'mode', label: 'Select', type: 'select', options: [['sampled', 'Sampled color'], ['reds', 'Reds'], ['yellows', 'Yellows'], ['greens', 'Greens'], ['cyans', 'Cyans'], ['blues', 'Blues'], ['magentas', 'Magentas'], ['highlights', 'Highlights'], ['midtones', 'Midtones'], ['shadows', 'Shadows'], ['skin', 'Skin tones']].map(([value, label]) => ({ value, label })) }, { key: 'color', label: 'Sampled color (or click the preview)', type: 'color' }, rng('fuzz', 'Fuzziness', 0, 200, 40), { key: 'invert', label: 'Invert', type: 'checkbox' }], vals, draw); }; drawF(); draw();
  const r = await modal({ title: 'Color range', width: 720, body: h('div', { class: 'ph-dlg' }, h('div', { class: 'ph-preview' }, pv, h('div', { class: 'muted pv-info' }, 'White = selected')), h('div', { class: 'ph-side' }, fl)), buttons: [{ label: 'Cancel', value: null }, { label: 'Select', primary: true, value: 'ok' }] });
  if (r !== 'ok') return; selectionFromCanvas(maskFromAlpha(compute(true)), 'new', 'Color range');
}
function growSel(similar = false) {
  // Grow: adjacent pixels whose colour is within the magic-wand tolerance of colours already selected; Similar: the same test anywhere in the image
  if (!D?.sel) return; const W = D.w, H = D.h, d = sampleData(O.sampleAll).data, a = selAlpha(), n = W * H, tol = O.tolerance || 32;
  const Q = 64, set = new Uint8Array(Q * Q * Q); for (let i = 0; i < n; i++) if (a[i] > 127) { const j = i * 4; set[(d[j] >> 2) * Q * Q + (d[j + 1] >> 2) * Q + (d[j + 2] >> 2)] = 1; }
  const rr = Math.max(0, Math.round(tol / 4)); let cur = set; for (let ax = 0; ax < 3 && rr; ax++) { const nx = new Uint8Array(cur.length), st = [Q * Q, Q, 1][ax]; for (let i = 0; i < cur.length; i++) { if (!cur[i]) continue; const c = Math.floor(i / st) % Q; for (let k = -rr; k <= rr; k++) { const cc = c + k; if (cc >= 0 && cc < Q) nx[i + k * st] = 1; } } cur = nx; }
  const ok = i => { const j = i * 4; return cur[(d[j] >> 2) * Q * Q + (d[j + 1] >> 2) * Q + (d[j + 2] >> 2)] === 1; };
  const out = new Uint8ClampedArray(a);
  if (similar) { for (let i = 0; i < n; i++) if (ok(i)) out[i] = 255; }
  else { const st = [], inS = new Uint8Array(n); for (let i = 0; i < n; i++) if (a[i] > 127) { inS[i] = 1; st.push(i); }
    while (st.length) { const i = st.pop(), x = i % W; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) { if (j < 0 || j >= n || inS[j] || !ok(j)) continue; inS[j] = 1; out[j] = 255; st.push(j); } } }
  setSel(maskFromAlpha(out)); pushHist(similar ? 'Similar' : 'Grow');
}
const similarSel = () => growSel(true);
async function refineEdgeDialog() {
  if (!D?.sel) return toast('Make a selection first'); const W = D.w, H = D.h, base = selAlpha(), orig = D.sel;
  const flat = flattenCanvas(); const k = Math.min(1, 560 / Math.max(W, H)), pw = Math.round(W * k), ph = Math.round(H * k);
  const vals = { view: 'overlay', smooth: 0, feather: 0, contrast: 0, shift: 0, edge: false, radius: 6, out: 'sel' };
  let guideI = null; const compute = (w, hh, src, img) => {
    let a = src; if (vals.edge && vals.radius > 0) { const Pp = new Float32Array(a.length); for (let i = 0; i < a.length; i++) Pp[i] = a[i] / 255; const q = X.guidedFilter(X.lumaOf(img), Pp, w, hh, Math.max(1, Math.round(vals.radius * w / W)), 4e-3); a = new Uint8ClampedArray(a.length); for (let i = 0; i < a.length; i++) a[i] = clamp(q[i], 0, 1) * 255; }
    if (vals.smooth > 0) { const f = Float32Array.from(a); X.gaussChan(f, w, hh, vals.smooth * w / W); a = new Uint8ClampedArray(a.length); for (let i = 0; i < a.length; i++) a[i] = X.smoothstep(100, 155, f[i]) * 255; }
    if (vals.shift) a = X.shiftEdge(a, w, hh, Math.round(vals.shift * w / W) || Math.sign(vals.shift));
    if (vals.feather > 0) { const f = Float32Array.from(a); X.gaussChan(f, w, hh, vals.feather * w / W / 2 + 0.01); a = Uint8ClampedArray.from(f); }
    if (vals.contrast > 0) { const c = vals.contrast / 100 * 0.49; for (let i = 0; i < a.length; i++) a[i] = X.smoothstep(c * 255, 255 - c * 255, a[i]) * 255; }
    return a; };
  const smallSrc = (() => { const c = mk(pw, ph); c.getContext('2d').drawImage(orig, 0, 0, pw, ph); const dd = ctxOf(c).getImageData(0, 0, pw, ph).data, a = new Uint8ClampedArray(pw * ph); for (let i = 0; i < a.length; i++) a[i] = dd[i * 4 + 3]; return a; })();
  const smallImg = (() => { const c = mk(pw, ph); ctxOf(c).drawImage(flat, 0, 0, pw, ph); return ctxOf(c).getImageData(0, 0, pw, ph); })();
  const pv = h('canvas', { width: pw, height: ph, class: 'ph-preview-cv checker' });
  const draw = () => { const a = compute(pw, ph, smallSrc, smallImg), id = new ImageData(pw, ph), s = smallImg.data, o = id.data; for (let i = 0; i < a.length; i++) { const j = i * 4, v = a[i] / 255; if (vals.view === 'mask') { o[j] = o[j + 1] = o[j + 2] = a[i]; o[j + 3] = 255; } else if (vals.view === 'black') { o[j] = s[j] * v; o[j + 1] = s[j + 1] * v; o[j + 2] = s[j + 2] * v; o[j + 3] = 255; } else if (vals.view === 'white') { o[j] = s[j] * v + 255 * (1 - v); o[j + 1] = s[j + 1] * v + 255 * (1 - v); o[j + 2] = s[j + 2] * v + 255 * (1 - v); o[j + 3] = 255; } else if (vals.view === 'layers') { o[j] = s[j]; o[j + 1] = s[j + 1]; o[j + 2] = s[j + 2]; o[j + 3] = a[i]; } else { o[j] = s[j] * v + (s[j] * 0.4 + 255 * 0.6) * (1 - v); o[j + 1] = s[j + 1] * v + s[j + 1] * 0.4 * (1 - v); o[j + 2] = s[j + 2] * v + s[j + 2] * 0.4 * (1 - v); o[j + 3] = 255; } } ctxOf(pv).putImageData(id, 0, 0); };
  let t; const sched = () => { clearTimeout(t); t = setTimeout(draw, 40); };
  const fl = h('div', { class: 'ph-fields' }); buildFields(fl, [{ key: 'view', label: 'View', type: 'select', options: [{ value: 'overlay', label: 'Overlay (red)' }, { value: 'black', label: 'On black' }, { value: 'white', label: 'On white' }, { value: 'layers', label: 'On layers (transparent)' }, { value: 'mask', label: 'Black & white mask' }] }, { key: 'edge', label: 'Smart radius (edge-aware, for hair & fur)', type: 'checkbox' }, rng('radius', 'Radius (px)', 1, 60, 6), rng('smooth', 'Smooth', 0, 50, 0), rng('feather', 'Feather (px)', 0, 100, 0), rng('contrast', 'Contrast %', 0, 100, 0), rng('shift', 'Shift edge (px, − contract, + expand)', -60, 60, 0), { key: 'out', label: 'Output to', type: 'select', options: [{ value: 'sel', label: 'Selection' }, { value: 'mask', label: 'Layer mask' }, { value: 'newmask', label: 'New layer with layer mask' }] }], vals, sched);
  draw(); void guideI;
  const r = await modal({ title: 'Refine edge', width: 940, body: h('div', { class: 'ph-dlg' }, h('div', { class: 'ph-preview' }, pv), h('div', { class: 'ph-side' }, fl)), buttons: [{ label: 'Cancel', value: null }, { label: 'OK', primary: true, value: 'ok' }] });
  if (r !== 'ok') return;
  await withBusy('Refining edge…', async () => {
    const full = compute(W, H, base, ctxOf(flat).getImageData(0, 0, W, H));
    if (vals.out === 'sel') { setSel(maskFromAlpha(full)); pushHist('Refine edge'); }
    else { const L = AL(); if (!L || L.kind === 'adjust') return; let T2 = L; if (vals.out === 'newmask') { duplicateLayer(true); T2 = AL(); T2.name = L.name + ' (refined)'; } maskFromDocAlpha(T2, full); setSel(null); requestRender(); pushHist('Refine edge'); renderLayers(); }
  });
}

// =====================================================================  files
const TEMPLATES = [
  { id: 'insta', name: 'Instagram post', w: 1080, h: 1080, group: 'Social' }, { id: 'instap', name: 'Instagram portrait', w: 1080, h: 1350, group: 'Social' }, { id: 'story', name: 'Instagram story / Reel', w: 1080, h: 1920, group: 'Social' },
  { id: 'yt', name: 'YouTube thumbnail', w: 1280, h: 720, group: 'Social' }, { id: 'fb', name: 'Facebook cover', w: 1640, h: 624, group: 'Social' }, { id: 'li', name: 'LinkedIn banner', w: 1584, h: 396, group: 'Social' }, { id: 'x', name: 'X / Twitter header', w: 1500, h: 500, group: 'Social' },
  { id: 'a4', name: 'A4 @300 dpi', w: 2480, h: 3508, group: 'Print' }, { id: 'a4l', name: 'A4 landscape @300 dpi', w: 3508, h: 2480, group: 'Print' }, { id: 'letter', name: 'US Letter @300 dpi', w: 2550, h: 3300, group: 'Print' }, { id: 'passport', name: 'Passport photo 35×45 mm @300 dpi', w: 413, h: 531, group: 'Print' }, { id: 'postcard', name: 'Postcard 6×4 in @300 dpi', w: 1800, h: 1200, group: 'Print' },
  { id: 'hd', name: 'Full HD', w: 1920, h: 1080, group: 'Screen' }, { id: '4k', name: '4K UHD', w: 3840, h: 2160, group: 'Screen' }, { id: 'web', name: 'Web 1366×768', w: 1366, h: 768, group: 'Screen' }, { id: 'phone', name: 'Phone wallpaper', w: 1170, h: 2532, group: 'Screen' }, { id: 'icon', name: 'App icon', w: 1024, h: 1024, group: 'Screen' },
];
async function newDialog() {
  let pick = TEMPLATES.find(t => t.id === 'hd'), bg = 'white';
  const name = h('input', { type: 'text', value: 'Untitled-' + (docs.length + 1) }), wI = h('input', { type: 'number', value: pick.w }), hI = h('input', { type: 'number', value: pick.h });
  const bgSel = h('select', {}, ...[['white', 'White'], ['black', 'Black'], ['bgc', 'Background color'], ['transparent', 'Transparent']].map(([v, l]) => h('option', { value: v }, l))); bgSel.onchange = () => bg = bgSel.value;
  const grid = h('div', { class: 'tpl-grid' });
  const drawGrid = () => { const st = grid.scrollTop; grid.innerHTML = ''; ['Social', 'Print', 'Screen'].forEach(g => { grid.append(h('div', { class: 'tpl-group' }, g)); TEMPLATES.filter(t => t.group === g).forEach(t => { const s = 46 / Math.max(t.w, t.h); grid.append(h('div', { class: 'tpl' + (pick === t ? ' on' : ''), onclick: () => { pick = t; wI.value = t.w; hI.value = t.h; name.value = t.name; drawGrid(); }, ondblclick: () => document.querySelector('.modal .m-f .primary')?.click() }, h('div', { class: 'tpl-ic' }, h('div', { style: { width: t.w * s + 'px', height: t.h * s + 'px' } })), h('div', { class: 'tpl-n' }, t.name), h('div', { class: 'tpl-d muted' }, `${t.w} × ${t.h}`))); }); }); grid.scrollTop = st; };
  drawGrid(); wI.oninput = hI.oninput = () => { pick = null; drawGrid(); };
  const body = h('div', { class: 'new-dlg' }, grid, h('div', { class: 'new-side' }, h('label', { class: 'field' }, 'Name', name), h('label', { class: 'field' }, 'Width (px)', wI), h('label', { class: 'field' }, 'Height (px)', hI), h('button', { class: 'btn sm', onclick: () => { [wI.value, hI.value] = [hI.value, wI.value]; } }, '⇄ Swap orientation'), h('label', { class: 'field' }, 'Background', bgSel)));
  const r = await modal({ title: 'New document', width: 860, body, buttons: [{ label: 'Cancel', value: null }, { label: 'Create', primary: true, value: 'ok' }] });
  if (r !== 'ok') return; const w = clamp(Math.round(+wI.value), 1, 16000), hh = clamp(Math.round(+hI.value), 1, 16000);
  addDoc(createDoc({ w, h: hh, name: name.value || 'Untitled', bg: { white: '#ffffff', black: '#000000', bgc: O.bg, transparent: null }[bg] }));
}
UI.shortcut('ctrl+n', newDialog);
async function openDialog() { const fs = await bts.fs.open({ multi: true, filters: [{ name: 'Images & projects', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'bmp', 'gif', 'psd', 'btsp', 'svg', 'ico'] }] }); if (fs) for (const f of fs) await openFile(f); }
UI.shortcut('ctrl+o', openDialog);
async function decodeImage(u8, name) { const type = /\.svg$/i.test(name) ? 'image/svg+xml' : ''; const blob = new Blob([u8], type ? { type } : {}); try { return await createImageBitmap(blob); } catch { const url = URL.createObjectURL(blob); const im = new Image(); im.src = url; await im.decode(); return im; } }
const b64ToU8 = s => Uint8Array.from(atob(s.split(',')[1]), c => c.charCodeAt(0));
async function openFile(f) {
  const u8 = new Uint8Array(f.data);
  try {
    if (/\.btsp$/i.test(f.name)) { const j = JSON.parse(new TextDecoder().decode(u8)); const d = await docFromProject(j, f.name); d.path = f.path; d.fmt = 'btsp'; addDoc(d); }
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
const canvasToBlob = (c, type = 'image/png', q) => new Promise(r => c.toBlob(r, type, q));
const canvasToU8 = async (c, type = 'image/png', q) => UI.blobToU8(await canvasToBlob(c, type, q));
const projectJSON = () => serializeDoc(D, c => c.toDataURL('image/png'));
async function saveProject(as) {
  if (!D) return; if (T) commitTransform();
  const data = new TextEncoder().encode(JSON.stringify(await serializeDoc(D, c => c.toDataURL('image/png'))));
  let p = D.fmt === 'btsp' && !as ? D.path : null;
  if (p) await bts.fs.write({ path: p, data }); else { p = await bts.fs.saveAs({ data, defaultPath: D.name.replace(/\.\w+$/, '') + '.btsp', filters: [{ name: 'BTS Photo project', extensions: ['btsp'] }] }); if (!p) return; }
  D.path = p; D.fmt = 'btsp'; D.name = p.split(/[\\/]/).pop(); D.dirty = false; UI.setDocTitle(D.name, 'BTS Photo'); renderTabs(); dropRecovery(D); toast('Saved ' + D.name, 'ok');
}
UI.shortcut('ctrl+s', () => saveProject(false)); UI.shortcut('ctrl+shift+s', () => saveProject(true));
function psdObject() {
  return { width: D.w, height: D.h, canvas: flattenCanvas(), children: D.layers.map((L, i) => {
    if (L.kind === 'adjust') return { name: L.name + ' (stamped)', canvas: stampAdjust(i), left: 0, top: 0, opacity: L.opacity, hidden: !L.visible, blendMode: 'normal' };
    const r = (L.mask || Object.keys(activeFx(L)).length) ? { canvas: bakeLayer(L), x: 0, y: 0 } : { canvas: L.canvas, x: L.x, y: L.y }; return { name: L.name, canvas: r.canvas, left: r.x, top: r.y, opacity: L.opacity, hidden: !L.visible, blendMode: psdBlendOut(L.blend) }; }) };
}
async function savePsd() {
  if (!D) return; if (T) commitTransform();
  const buf = agPsd.writePsd(psdObject(), { generateThumbnail: true });
  const p = await bts.fs.saveAs({ data: new Uint8Array(buf), defaultPath: D.name.replace(/\.\w+$/, '') + '.psd', filters: [{ name: 'Photoshop', extensions: ['psd'] }] });
  if (p) { toast('Saved PSD', 'ok'); D.dirty = false; renderTabs(); }
}
let avifOK = null; async function avifSupported() { if (avifOK !== null) return avifOK; const b = await canvasToBlob(mk(2, 2), 'image/avif', 0.5); avifOK = !!b && b.type === 'image/avif'; return avifOK; }
function exportCanvas(fmt, scale, matte) {
  let c = flattenCanvas(); const flat = fmt === 'jpeg' || (matte && matte !== 'none');
  if (flat) { const o = mk(c.width, c.height), x = o.getContext('2d'); x.fillStyle = matte && matte !== 'none' ? matte : '#ffffff'; x.fillRect(0, 0, o.width, o.height); x.drawImage(c, 0, 0); c = o; }
  if (scale !== 1) c = resampleCanvas(c, Math.max(1, Math.round(c.width * scale)), Math.max(1, Math.round(c.height * scale)), scale < 1 ? 'sharper' : 'high');
  return c;
}
async function exportDialog() {
  if (!D) return; if (T) commitTransform();
  const fmts = [['png', 'PNG'], ['jpeg', 'JPEG'], ['webp', 'WebP']]; if (await avifSupported()) fmts.push(['avif', 'AVIF']);
  const vals = { fmt: 'png', q: 85, scale: 1, custom: 100, matte: 'none', meta: false };
  const pvC = h('canvas', { class: 'ph-preview-cv checker' }), info = h('div', { class: 'exp-info' }), sizeEl = h('div', { class: 'exp-size' }, '…');
  let blob = null, seq = 0;
  const update = async () => { const my = ++seq; const sc = vals.scale === 'custom' ? vals.custom / 100 : +vals.scale; const W = Math.max(1, Math.round(D.w * sc)), H = Math.max(1, Math.round(D.h * sc)); info.textContent = `${W} × ${H} px · ${vals.fmt.toUpperCase()}${vals.fmt !== 'png' ? ' · quality ' + vals.q + '%' : ''}`; sizeEl.textContent = 'Estimating…';
    await sleep(120); if (my !== seq) return; const c = exportCanvas(vals.fmt, sc, vals.fmt === 'jpeg' ? (vals.matte === 'none' ? '#ffffff' : vals.matte) : vals.matte); const b = await canvasToBlob(c, 'image/' + vals.fmt, vals.q / 100); if (my !== seq) return; blob = b;
    const kb = b.size / 1024; sizeEl.textContent = kb > 1024 ? (kb / 1024).toFixed(2) + ' MB' : kb.toFixed(0) + ' KB';
    const k = Math.min(1, 520 / c.width, 380 / c.height); pvC.width = Math.max(1, Math.round(c.width * k)); pvC.height = Math.max(1, Math.round(c.height * k));
    if (vals.fmt !== 'png') { const im = await createImageBitmap(b); ctxOf(pvC).drawImage(im, 0, 0, pvC.width, pvC.height); } else { ctxOf(pvC).clearRect(0, 0, pvC.width, pvC.height); ctxOf(pvC).drawImage(c, 0, 0, pvC.width, pvC.height); } };
  const fl = h('div', { class: 'ph-fields' });
  const scaleRow = h('div', { class: 'seg' }); const drawScale = () => { scaleRow.innerHTML = ''; [['0.5', '0.5x'], ['1', '1x'], ['2', '2x'], ['3', '3x'], ['custom', 'Custom']].forEach(([v, l]) => scaleRow.append(h('button', { class: 'btn sm' + (String(vals.scale) === v ? ' primary' : ''), onclick: () => { vals.scale = v === 'custom' ? 'custom' : +v; drawScale(); drawF(); update(); } }, l))); };
  const drawF = () => { fl.innerHTML = ''; buildFields(fl, [{ key: 'fmt', label: 'Format', type: 'select', options: fmts.map(([value, label]) => ({ value, label })) }], vals, () => { drawF(); update(); }); if (vals.fmt !== 'png') buildFields(fl, [rng('q', 'Quality %', 1, 100, 85)], vals, update); fl.append(h('div', { class: 'field' }, h('span', {}, 'Scale'), scaleRow)); if (vals.scale === 'custom') buildFields(fl, [rng('custom', 'Scale %', 1, 800, 100)], vals, update); buildFields(fl, [{ key: 'matte', label: vals.fmt === 'jpeg' ? 'Background (JPEG has no transparency)' : 'Matte', type: 'select', options: [{ value: 'none', label: vals.fmt === 'jpeg' ? 'White' : 'None (keep transparency)' }, { value: '#ffffff', label: 'White' }, { value: '#000000', label: 'Black' }, { value: O.bg, label: 'Background color' }] }], vals, update); };
  drawScale(); drawF(); update();
  const body = h('div', { class: 'ph-dlg exp' }, h('div', { class: 'ph-preview' }, pvC, info), h('div', { class: 'ph-side' }, h('div', { class: 'exp-sz-box' }, h('span', { class: 'muted' }, 'Estimated file size'), sizeEl), fl));
  const r = await modal({ title: 'Export As', width: 900, body, buttons: [{ label: 'Cancel', value: null }, { label: 'Export…', primary: true, value: 'ok' }] });
  if (r !== 'ok') return; await update(); if (!blob) return;
  const ext = vals.fmt === 'jpeg' ? 'jpg' : vals.fmt; const data = await UI.blobToU8(blob);
  const p = await bts.fs.saveAs({ data, defaultPath: D.name.replace(/\.\w+$/, '') + (vals.scale !== 1 && vals.scale !== 'custom' ? '@' + vals.scale + 'x' : '') + '.' + ext, filters: [{ name: vals.fmt.toUpperCase(), extensions: [ext] }] });
  if (p) toast(`Exported ${(data.length / 1024).toFixed(0)} KB`, 'ok');
}
UI.shortcut('ctrl+alt+shift+w', exportDialog);
async function quickExportPng() { if (!D) return; if (T) commitTransform(); const data = await canvasToU8(flattenCanvas(), 'image/png'); const p = await bts.fs.saveAs({ data, defaultPath: D.name.replace(/\.\w+$/, '') + '.png', filters: [{ name: 'PNG', extensions: ['png'] }] }); if (p) toast(`Exported ${(data.length / 1024).toFixed(0)} KB`, 'ok'); }
UI.shortcut('ctrl+alt+shift+s', quickExportPng);
async function exportLayersDialog() {
  if (!D) return; if (T) commitTransform();
  const v = await form({ title: 'Export layers to files', fields: [{ key: 'fmt', label: 'Format', type: 'select', value: 'png', options: [{ value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPEG' }, { value: 'webp', label: 'WebP' }] }, { key: 'q', label: 'Quality % (JPEG/WebP)', type: 'range', min: 10, max: 100, value: 90 }, { key: 'trim', label: 'Trim each layer to its content', type: 'checkbox', value: false }, { key: 'hidden', label: 'Include hidden layers', type: 'checkbox', value: false }, { key: 'fx', label: 'Include layer styles and masks', type: 'checkbox', value: true }], ok: 'Choose folder & name…' });
  if (!v) return; const ext = v.fmt === 'jpeg' ? 'jpg' : v.fmt;
  const base = await bts.fs.pickSavePath({ defaultPath: D.name.replace(/\.\w+$/, '') + '.' + ext, filters: [{ name: v.fmt.toUpperCase(), extensions: [ext] }] }); if (!base) return;
  const stem = base.replace(/\.[^.\\/]+$/, ''); let n = 0;
  await withBusy('Exporting layers…', async () => {
    for (let i = 0; i < D.layers.length; i++) { const L = D.layers[i]; if (!L.visible && !v.hidden) continue; let c = L.kind === 'adjust' ? stampAdjust(i) : v.fx ? bakeLayer(L) : layerDocCanvas(L);
      if (v.trim) { const b = alphaBounds(c); if (!b) continue; const t = mk(b.w, b.h); t.getContext('2d').drawImage(c, -b.x, -b.y); c = t; }
      if (v.fmt === 'jpeg') { const o = mk(c.width, c.height), x = o.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, o.width, o.height); x.drawImage(c, 0, 0); c = o; }
      const safe = L.name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60); const data = await canvasToU8(c, 'image/' + v.fmt, v.q / 100); await bts.fs.write({ path: `${stem}_${String(i + 1).padStart(2, '0')}_${safe}.${ext}`, data }); n++; }
  });
  toast(`Exported ${n} layer file${n === 1 ? '' : 's'}`, 'ok');
}
async function closeDoc() {
  if (!D) return;
  if (D.dirty) { const r = await modal({ title: 'Save changes?', body: `Save changes to “${D.name}” before closing?`, buttons: [{ label: 'Cancel', value: null }, { label: "Don't save", value: 'no' }, { label: 'Save', primary: true, value: 'yes' }] }); if (r === null) return; if (r === 'yes') { await saveProject(false); if (D.dirty) return; } }
  dropRecovery(D); docs = docs.filter(d => d !== D); D = docs[docs.length - 1] || null; if (D) switchDoc(D); else { renderAll(); renderTabs(); UI.setDocTitle('', 'BTS Photo'); const c = overlay.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, overlay.width, overlay.height); display.width = 1; display.height = 1; }
}
UI.shortcut('ctrl+w', closeDoc);
async function closeWindow() { while (docs.some(d => d.dirty)) { D = docs.find(d => d.dirty); switchDoc(D); const before = docs.length; await closeDoc(); if (docs.length === before) return; } bts.win.close(); }

// =====================================================================  2026 additions: shared helpers
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };
function smartBlock(L) { if (L?.smart) { toast('This layer has smart filters — use Layer › Smart filters › Rasterize before editing its pixels', 'err'); return true; } return false; }
function toRaster(L) { if (L.kind === 'text') delete L.text; if (L.kind === 'frame') delete L.frame; if (L.kind === 'text' || L.kind === 'frame') L.kind = 'raster'; if (L.smart) L.smart = null; }
function busyText(t) { const el = document.querySelector('.ph-busy'); if (el && el.lastChild) el.lastChild.textContent = t; }
const docArea = () => D.w * D.h;

// =====================================================================  Harmonize (match colour, light and tone of a layer to what is below it)
function shadowCanvas(L, v) {
  const b = layerBounds(L); if (!b) return mk(D.w, D.h); const yb = b.y + b.h, W = D.w, H = D.h;
  const sil = mk(W, H), sx = sil.getContext('2d'); sx.drawImage(layerDocCanvas(L), 0, 0); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = '#000'; sx.fillRect(0, 0, W, H);
  const c = mk(W, H), x = c.getContext('2d'), ky = clamp(v.len / 100, 0.02, 1) * 0.65, kx = ky * Math.tan(clamp(v.angle, -75, 75) * Math.PI / 180);
  // cast shadow: the silhouette laid down on the ground plane behind the object
  x.filter = `blur(${Math.max(0.5, v.soft)}px)`; x.globalAlpha = 0.7; x.setTransform(1, 0, -kx, ky, kx * yb, yb * (1 - ky)); x.drawImage(sil, 0, 0);
  // contact (ambient occlusion): the bottom slice, flattened and tight
  const sh = Math.max(2, Math.round(b.h * 0.12)); x.setTransform(1, 0, 0, 1, 0, 0); x.filter = `blur(${Math.max(0.6, v.soft / 4)}px)`; x.globalAlpha = 0.95; x.drawImage(sil, b.x, yb - sh, b.w, sh, b.x - b.w * 0.02, yb - sh * 0.18, b.w * 1.04, sh * 0.32);
  x.filter = 'none'; return c;
}
async function harmonizeDialog() {
  const L = AL(); if (!D || !L) return toast('Open an image first');
  if (L.kind === 'adjust') return toast('Select a pixel layer to harmonize', 'err');
  if (D.active === 0) return toast('Harmonize matches a layer to the layers below it — select an upper layer (for example a placed or pasted object)', 'err');
  if (smartBlock(L) || L.locked) return;
  if (L.kind !== 'raster') { toRaster(L); renderLayers(); }
  ensureCovers(L); const lb = layerBounds(L); if (!lb) return toast('The layer is empty');
  const below = compositeBelow(D.active), mx = Math.round(lb.w * 0.6), my = Math.round(lb.h * 0.6);
  const rx = clamp(lb.x - mx, 0, D.w), ry = clamp(lb.y - my, 0, D.h), rx2 = clamp(lb.x + lb.w + mx, 0, D.w), ry2 = clamp(lb.y + lb.h + my, 0, D.h);
  if (rx2 - rx < 4 || ry2 - ry < 4) return toast('The layer is outside the canvas', 'err');
  const bd = ctxOf(below).getImageData(rx, ry, rx2 - rx, ry2 - ry), step = Math.max(1, Math.round(Math.sqrt(bd.width * bd.height / 250000)));
  const src = X.labStatsW(bd.data, null, step); if (src.n < 20) return toast('There is nothing below this layer to match', 'err');
  const light = X.lightPlane(bd.data, bd.width, bd.height, rx, ry, Math.max(2, step * 2));
  const orig = cloneCanvas(L.canvas), od = ctxOf(orig).getImageData(0, 0, orig.width, orig.height), dst = X.labStatsW(od.data, null, Math.max(1, Math.round(Math.sqrt(orig.width * orig.height / 250000))));
  const vals = { amount: 75, color: 70, lum: 60, contrast: true, lighting: 50, shadow: false, sop: 55, soft: 12, angle: 25, len: 35 };
  let shL = null, timer = null; const big = orig.width * orig.height > 4e6;
  const params = () => ({ src, dst, amount: vals.amount / 100, color: vals.color / 100, lum: vals.lum / 100, contrast: vals.contrast, light, lighting: vals.lighting / 100 });
  const restore = () => { const c = L.canvas.getContext('2d'); c.clearRect(0, 0, orig.width, orig.height); c.drawImage(orig, 0, 0); };
  const syncShadow = () => {
    if (vals.shadow && !shL) { shL = newLayer('Contact shadow', D.w, D.h, { blend: 'multiply' }); D.layers.splice(D.layers.indexOf(L), 0, shL); D.active = D.layers.indexOf(L); }
    if (!vals.shadow && shL) { D.layers.splice(D.layers.indexOf(shL), 1); D.active = D.layers.indexOf(L); shL = null; }
    if (shL) { shL.canvas = shadowCanvas(L, vals); shL.opacity = vals.sop / 100; }
  };
  const preview = () => { clearTimeout(timer); timer = setTimeout(() => { restore(); layerImageOp(L, X.harmonize, params()); syncShadow(); contentSerial++; requestRender(false); renderLayers(); }, big ? 140 : 25); };
  const el = h('div', { class: 'ph-fields' });
  buildFields(el, [rng('amount', 'Strength %', 0, 100, 75), rng('color', 'Colour match %', 0, 150, 70), rng('lum', 'Brightness match %', 0, 150, 60), { key: 'contrast', label: 'Match contrast and saturation range', type: 'checkbox' }, rng('lighting', 'Directional lighting %', 0, 150, 50),
    { key: 'n0', type: 'note', label: 'Shadow' }, { key: 'shadow', label: 'Add contact shadow under the layer', type: 'checkbox' }, rng('sop', 'Shadow opacity %', 0, 100, 55), rng('soft', 'Softness (px)', 0, 80, 12), rng('angle', 'Shadow angle °', -70, 70, 25), rng('len', 'Shadow length %', 2, 100, 35),
    { key: 'n1', type: 'note', label: 'Statistics transfer in Lab colour space from the area around the layer. The lighting term follows the brightness gradient of the background.' }], vals, preview);
  preview();
  const ok = await floatPanel({ title: 'Harmonize — ' + L.name, width: 330, body: el, ok: 'Apply' });
  clearTimeout(timer); restore();
  if (!ok) { if (shL) { D.layers.splice(D.layers.indexOf(shL), 1); D.active = D.layers.indexOf(L); } requestRender(); renderLayers(); return; }
  layerImageOp(L, X.harmonize, params()); syncShadow(); requestRender(); pushHist('Harmonize'); renderLayers();
}

// =====================================================================  Upscale (super resolution: Lanczos3 + edge-directed smoothing + detail-preserving sharpening)
const UPSCALE_MAX_SIDE = 16384, UPSCALE_MAX_AREA = 120e6;
const upscaleAllowed = f => D && D.w * f <= UPSCALE_MAX_SIDE && D.h * f <= UPSCALE_MAX_SIDE && D.w * D.h * f * f <= UPSCALE_MAX_AREA;
async function upscaleImageData(img, f, v, onProgress) {
  if (v.noise > 0) { img = X.copyImg(img); X.flt.surfaceBlur(img, { r: 2, t: 4 + v.noise * 0.55 }, { scale: 1 }); }
  return X.upscale(img, f, { edge: v.edge / 100, sharpen: v.sharpen / 100 * 1.2, onProgress });
}
async function upscaleDialog() {
  if (!D) return toast('Open an image first'); if (T) commitTransform();
  const vals = { f: upscaleAllowed(2) ? 2 : 0, edge: 60, sharpen: 50, noise: 0 };
  if (!vals.f) return toast(`The image is too large to upscale (limit ${UPSCALE_MAX_SIDE}px per side)`, 'err');
  const flat = flattenCanvas(), ok = k => upscaleAllowed(k);
  const ovK = Math.min(1, 220 / Math.max(D.w, D.h)), ov = h('canvas', { width: Math.round(D.w * ovK), height: Math.round(D.h * ovK), class: 'up-ov' }); let cx = D.w / 2, cy = D.h / 2;
  const before = h('canvas', { class: 'up-pv' }), after = h('canvas', { class: 'up-pv' }), info = h('div', { class: 'muted pv-info' });
  let seq = 0;
  const drawOv = () => { const c = ctxOf(ov); c.drawImage(flat, 0, 0, ov.width, ov.height); const cw = 300 / vals.f, chh = 225 / vals.f; c.strokeStyle = '#ffd400'; c.lineWidth = 2; c.strokeRect((cx - cw / 2) * ovK, (cy - chh / 2) * ovK, cw * ovK, chh * ovK); };
  const update = async () => { const my = ++seq; drawOv(); const f = vals.f, cw = Math.round(300 / f), chh = Math.round(225 / f), x0 = clamp(Math.round(cx - cw / 2), 0, Math.max(0, D.w - cw)), y0 = clamp(Math.round(cy - chh / 2), 0, Math.max(0, D.h - chh));
    const crop = ctxOf(flat).getImageData(x0, y0, Math.min(cw, D.w), Math.min(chh, D.h)); const t0 = performance.now();
    const up = await upscaleImageData(crop, f, vals); if (my !== seq) return;
    [before, after].forEach(c => { c.width = up.width; c.height = up.height; });
    const bc = ctxOf(before); bc.imageSmoothingQuality = 'medium'; const tmp = mk(crop.width, crop.height); ctxOf(tmp).putImageData(crop, 0, 0); bc.drawImage(tmp, 0, 0, up.width, up.height);
    ctxOf(after).drawImage(up, 0, 0); info.textContent = `${D.w} × ${D.h} → ${D.w * f} × ${D.h * f} px · preview at 100% · ${Math.round(performance.now() - t0)} ms`; };
  ov.onpointerdown = e => { const r = ov.getBoundingClientRect(); cx = (e.clientX - r.left) / r.width * D.w; cy = (e.clientY - r.top) / r.height * D.h; update(); };
  const fl = h('div', { class: 'ph-fields' }); let t = null; const sched = () => { clearTimeout(t); t = setTimeout(update, 60); };
  const scaleRow = h('div', { class: 'seg' }); const drawScale = () => { scaleRow.innerHTML = ''; [2, 4].forEach(k => scaleRow.append(h('button', { class: 'btn sm' + (vals.f === k ? ' primary' : ''), disabled: !ok(k), title: ok(k) ? '' : 'Result would be too large', onclick: () => { vals.f = k; drawScale(); sched(); } }, k + '×'))); };
  drawScale(); fl.append(h('div', { class: 'field' }, h('span', {}, 'Scale'), scaleRow));
  buildFields(fl, [rng('edge', 'Edge smoothing (anti-jaggies) %', 0, 100, 60), rng('sharpen', 'Detail / sharpening %', 0, 100, 50), rng('noise', 'Noise reduction %', 0, 100, 0),
    { key: 'n', type: 'note', label: 'Lanczos3 resampling, edge-directed smoothing along contours and halo-free detail sharpening. Click the overview to choose the preview area.' }], vals, sched);
  const body = h('div', { class: 'ph-dlg up-dlg' }, h('div', { class: 'ph-preview' }, h('div', { class: 'up-pair' }, h('div', {}, h('div', { class: 'muted up-l' }, 'Standard resize'), before), h('div', {}, h('div', { class: 'muted up-l' }, 'Super resolution'), after)), info), h('div', { class: 'ph-side' }, ov, fl));
  update();
  const r = await modal({ title: 'Upscale (super resolution)', width: 1040, body, buttons: [{ label: 'Cancel', value: null }, { label: 'Upscale', primary: true, value: 'ok' }] });
  seq++; if (r !== 'ok') return; await upscaleImage(vals.f, vals);
}
async function upscaleImage(f, v = { edge: 60, sharpen: 50, noise: 0 }) {
  if (!upscaleAllowed(f)) return toast('The result would be too large', 'err');
  await withBusy('Upscaling…', async () => {
    const rasters = D.layers.filter(L => L.kind === 'raster' || L.kind === 'text' || L.kind === 'frame'); let done = 0;
    for (const L of D.layers) {
      if (L.kind === 'raster') {
        const prog = p => busyText(`Upscaling ${L.name} — ${Math.round((done + p) / rasters.length * 100)}%`);
        L.canvas = await upscaleImageData(ctxOf(L.canvas).getImageData(0, 0, L.canvas.width, L.canvas.height), f, v, prog);
        if (L.smart) { L.smart.orig = await upscaleImageData(ctxOf(L.smart.orig).getImageData(0, 0, L.smart.orig.width, L.smart.orig.height), f, v); L.smart.filters.forEach(fl => { if (fl.mask) fl.mask = resampleCanvas(fl.mask, fl.mask.width * f, fl.mask.height * f, 'high'); }); }
        done++;
      }
      L.x *= f; L.y *= f;
      if (L.mask) { L.mask = resampleCanvas(L.mask, L.mask.width * f, L.mask.height * f, 'high'); L.maskVer = Math.random(); }
      if (L.kind === 'text') { L.text.x *= f; L.text.y *= f; L.text.size = Math.round(L.text.size * f); }
      if (L.kind === 'frame') { L.frame.w *= f; L.frame.h *= f; L.frame.ox *= f; L.frame.oy *= f; L.frame.radius *= f; L.frame.stroke *= f; }
    }
    D.w *= f; D.h *= f; (D.guides || []).forEach(g => g.p *= f); setSel(null);
    D.layers.forEach(l => { if (l.kind === 'text') renderTextLayer(l); else if (l.kind === 'frame') renderFrameLayer(l); else if (l.smart) l.canvas = smartRecompute(l); });
    fitView(); requestRender(); pushHist(`Upscale ${f}×`);
  });
}

// =====================================================================  Distraction removal (wires & cables, dust & spots) — detection + tiled inpainting
async function inpaintTiled(L, hole, label) {
  const W = D.w, H = D.h; let any = 0; for (let i = 0; i < hole.length; i++) if (hole[i]) { any = 1; break; } if (!any) return false;
  await withBusy(label + '…', async () => {
    ensureCovers(L); const lc = ctxOf(L.canvas), TS = 200, M = 44; const tiles = [];
    for (let ty = 0; ty < H; ty += TS) for (let tx = 0; tx < W; tx += TS) { let has = 0; for (let y = ty; y < Math.min(H, ty + TS) && !has; y++) for (let x = tx, o = y * W; x < Math.min(W, tx + TS); x++) if (hole[o + x]) { has = 1; break; } if (has) tiles.push([tx, ty]); }
    for (let k = 0; k < tiles.length; k++) {
      const [tx, ty] = tiles[k], x0 = Math.max(0, tx - M), y0 = Math.max(0, ty - M), x1 = Math.min(W, tx + TS + M), y1 = Math.min(H, ty + TS + M), w = x1 - x0, hh = y1 - y0;
      const id = lc.getImageData(x0 - L.x, y0 - L.y, w, hh), hm = new Uint8Array(w * hh); for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) hm[y * w + x] = hole[(y + y0) * W + x + x0];
      X.inpaint(id.data, w, hh, hm, { patch: 2 });
      lc.putImageData(id, x0 - L.x, y0 - L.y, tx - x0, ty - y0, Math.min(TS, W - tx), Math.min(TS, H - ty));
      if (k % 4 === 3) { busyText(`${label}… ${Math.round((k + 1) / tiles.length * 100)}%`); await sleep(0); }
    }
    requestRender(); pushHist(label);
  });
  return true;
}
function regionBits(rc) { if (!rc) return null; const a = ctxOf(rc).getImageData(0, 0, D.w, D.h).data, r = new Uint8Array(D.w * D.h); for (let i = 0; i < r.length; i++) r[i] = a[i * 4 + 3] > 20 ? 1 : 0; return r; }
const DISTRACT = {
  wires: { name: 'Remove wires & cables', fields: [rng('sens', 'Sensitivity', 1, 100, 60), rng('width', 'Maximum wire width (px)', 1, 30, 6), { key: 'bright', label: 'Also detect light lines', type: 'checkbox', value: false }, { key: 'smoothOnly', label: 'Only over smooth backgrounds (sky, walls)', type: 'checkbox', value: true }], scaleKeys: ['width'], detect: (img, reg, p) => X.detectWires(img, reg, p) },
  spots: { name: 'Remove dust & spots', fields: [rng('sens', 'Sensitivity', 1, 100, 60), rng('size', 'Maximum spot size (px)', 2, 60, 10), { key: 'bright', label: 'Also detect light spots', type: 'checkbox', value: false }], scaleKeys: ['size'], detect: (img, reg, p) => X.detectSpots(img, reg, p) },
};
async function removeDistractions(kind, regionCanvas = null, direct = false) {
  const L = AL(), K = DISTRACT[kind]; if (!D || !L || L.kind !== 'raster') return toast('Select a pixel layer', 'err'); if (smartBlock(L) || L.locked) return;
  const W = D.w, H = D.h, region = regionBits(regionCanvas || D.sel), full = ctxOf(layerDocCanvas(L)).getImageData(0, 0, W, H);
  const vals = Object.fromEntries(K.fields.map(f => [f.key, f.value]));
  if (!direct) {
    const k = Math.min(1, 760 / Math.max(W, H)), pw = Math.max(1, Math.round(W * k)), ph = Math.max(1, Math.round(H * k)), sc = mk(pw, ph), scx = ctxOf(sc); const tmp = mk(W, H); ctxOf(tmp).putImageData(full, 0, 0); scx.imageSmoothingQuality = 'high'; scx.drawImage(tmp, 0, 0, pw, ph); const small = scx.getImageData(0, 0, pw, ph);
    let sreg = null; if (region) { const rc = mk(pw, ph); rc.getContext('2d').drawImage(regionCanvas || D.sel, 0, 0, pw, ph); const a = ctxOf(rc).getImageData(0, 0, pw, ph).data; sreg = new Uint8Array(pw * ph); for (let i = 0; i < sreg.length; i++) sreg[i] = a[i * 4 + 3] > 20 ? 1 : 0; }
    const pv = h('canvas', { width: pw, height: ph, class: 'ph-preview-cv' }), info = h('div', { class: 'muted pv-info' });
    const draw = () => { const p = { ...vals }; K.scaleKeys.forEach(q => p[q] = Math.max(1, vals[q] * k)); p.grow = 1; const m = K.detect(small, sreg, p), id = new ImageData(new Uint8ClampedArray(small.data), pw, ph), d = id.data; let n = 0; for (let i = 0; i < m.length; i++) if (m[i]) { n++; d[i * 4] = 255; d[i * 4 + 1] = d[i * 4 + 1] * 0.2; d[i * 4 + 2] = d[i * 4 + 2] * 0.3; } ctxOf(pv).putImageData(id, 0, 0); info.textContent = n ? `Detected ${Math.round(n / k / k).toLocaleString()} px (red) — they will be removed with content-aware fill` : 'Nothing detected — raise the sensitivity'; };
    let t; const fl = h('div', { class: 'ph-fields' }); buildFields(fl, [...K.fields, { key: 'n', type: 'note', label: region ? 'Working inside the selected / brushed area.' : 'Working on the whole layer. Select or brush an area first to limit the search.' }], vals, () => { clearTimeout(t); t = setTimeout(draw, 80); }); draw();
    const r = await modal({ title: K.name, width: 1040, body: h('div', { class: 'ph-dlg' }, h('div', { class: 'ph-preview' }, pv, info), h('div', { class: 'ph-side' }, fl)), buttons: [{ label: 'Cancel', value: null }, { label: 'Remove', primary: true, value: 'ok' }] });
    if (r !== 'ok') return;
  }
  let hole; await withBusy('Detecting…', async () => { hole = K.detect(full, region, vals); });
  if (!hole || !(await inpaintTiled(L, hole, K.name))) toast('Nothing was detected' + (direct ? ' under the brush' : ''));
}

// =====================================================================  Sky replacement
function skyAlphaFrom(img) {
  const W = img.width, H = img.height, d = img.data, n = W * H;
  const skyLike = i => { const j = i * 4, r = d[j], g = d[j + 1], b = d[j + 2], l = (r + g + b) / 3, mx = Math.max(r, g, b), mn = Math.min(r, g, b); const blue = b >= r + 8 && b >= g - 20 && l > 70; const cloud = l > 165 && mx - mn < 45; const dusk = r > 150 && l > 120 && b > 60 && mx - mn < 120 && (i / W) < H * 0.5; return blue || cloud || dusk; };
  const L = X.lumaOf(img); const sky = new Uint8Array(n), st = [];
  for (let x = 0; x < W; x++) for (let y = 0; y < Math.max(1, H * 0.02); y++) { const i = (y | 0) * W + x; if (skyLike(i)) { sky[i] = 1; st.push(i); } }
  while (st.length) { const i = st.pop(), x = i % W, y = (i - x) / W; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) { if (j < 0 || sky[j]) continue; if (Math.abs(L[j] - L[i]) > 0.09 || !skyLike(j)) continue; sky[j] = 1; st.push(j); } }
  let on = 0, blue = 0, sr = 0, sb = 0, top = 0; for (let i = 0; i < n; i++) if (sky[i]) { on++; const j = i * 4; sr += d[j]; sb += d[j + 2]; if (d[j + 2] > d[j] + 12) blue++; } for (let x = 0; x < W; x++) top += sky[x];
  const bright = on ? (sr + sb) / 2 / on : 0;
  if (on < n * 0.01 || (blue < on * 0.12 && !(bright > 175 && top > W * 0.6 && sb >= sr * 0.97))) return null;
  let a = softFromBits(sky, W, H, 0, 3); a = X.shiftEdge(a, W, H, -2); const f = Float32Array.from(a); X.gaussChan(f, W, H, 1.2); return Uint8ClampedArray.from(f);
}
const skyThumbCache = {};
async function skyReplaceDialog() {
  if (!D) return toast('Open an image first'); if (T) commitTransform();
  const W = D.w, H = D.h; let alpha = null, img = null;
  await withBusy('Finding the sky…', async () => { img = ctxOf(flattenCanvas()).getImageData(0, 0, W, H); alpha = D.sel ? selAlpha() : skyAlphaFrom(img); });
  if (!alpha) return toast('No sky found — select the sky first (Select › Sky, Color range or the lasso)', 'err');
  // horizon: lowest row that is still mostly sky somewhere
  const rows = new Float32Array(H); for (let y = 0; y < H; y++) { let s = 0; for (let x = 0, o = y * W; x < W; x += 2) s += alpha[o + x]; rows[y] = s / (W / 2) / 255; }
  let horizon = 0; for (let y = 0; y < H; y++) if (rows[y] > 0.04) horizon = y; horizon = Math.max(horizon, Math.round(H * 0.15));
  const oldSky = X.labStatsW(img.data, i => alpha[i] / 255, Math.max(1, Math.round(Math.sqrt(W * H / 200000))));
  const vals = { preset: 'sunset', shift: 0, fade: Math.max(2, Math.round(Math.max(W, H) / 400)), bright: 0, temp: 0, scale: 100, pos: 0, flip: false, fg: 55 };
  let custom = null, baseKey = null, base = null, maskKey = null;
  const skyL = newLayer('Sky', W, H), fgL = newLayer('Foreground lighting', 1, 1, { kind: 'adjust', adj: { type: 'fglight', params: { gr: 1, gg: 1, gb: 1, amt: vals.fg } } });
  const insertAt = D.layers.length; D.layers.splice(insertAt, 0, fgL, skyL); D.active = D.layers.indexOf(skyL);
  const baseSky = () => { const key = (custom ? 'custom' : vals.preset) + ':' + vals.bright + ':' + vals.temp; if (key === baseKey) return base; baseKey = key;
    const bw = Math.min(1400, W), bh = Math.max(8, Math.round(bw * (horizon * 1.12) / W)); const c = custom ? (() => { const o = mk(bw, bh), ox = ctxOf(o), s = Math.max(bw / custom.width, bh / custom.height); ox.drawImage(custom, (bw - custom.width * s) / 2, (bh - custom.height * s) / 2, custom.width * s, custom.height * s); return o; })() : X.renderSky(vals.preset, bw, bh, 11);
    if (vals.bright || vals.temp) { const id = ctxOf(c).getImageData(0, 0, c.width, c.height); if (vals.temp) X.adj.tempTint(id, { t: vals.temp, n: 0 }); if (vals.bright) { const k = 1 + vals.bright / 100; for (let i = 0; i < id.data.length; i += 4) { id.data[i] *= k; id.data[i + 1] *= k; id.data[i + 2] *= k; } } ctxOf(c).putImageData(id, 0, 0); }
    base = c; return c; };
  const drawSky = () => { const b = baseSky(), c = skyL.canvas.getContext('2d'), s = vals.scale / 100, dw = W * s, dh = horizon * 1.12 * s, dx = (W - dw) / 2, dy = horizon * 1.12 - dh + vals.pos / 100 * H;
    c.save(); c.clearRect(0, 0, W, H); if (vals.flip) { c.translate(W, 0); c.scale(-1, 1); } c.imageSmoothingQuality = 'high'; c.drawImage(b, dx, dy, dw, dh); c.drawImage(b, 0, b.height - 1, b.width, 1, dx, dy + dh - 1, dw, H - dy - dh + 2); if (dy > 0) c.drawImage(b, 0, 0, b.width, 1, dx, 0, dw, dy + 1); c.restore();
    // foreground colour/brightness cast from the new sky
    const sd = ctxOf(b).getImageData(0, 0, b.width, b.height).data, ns = X.labStatsW(sd, () => 1, 7), dl = (ns.mean[0] - oldSky.mean[0]) * 0.35, da = (ns.mean[1] - oldSky.mean[1]) * 0.45, db = (ns.mean[2] - oldSky.mean[2]) * 0.45;
    const ref = X.lab2rgb(55, 0, 0, [0, 0, 0]), tgt = X.lab2rgb(clamp(55 + dl, 5, 95), da, db, [0, 0, 0]); Object.assign(fgL.adj.params, { gr: tgt[0] / ref[0], gg: tgt[1] / ref[1], gb: tgt[2] / ref[2], amt: vals.fg }); fgL.visible = vals.fg > 0; };
  const drawMask = () => { const key = vals.shift + ':' + vals.fade; if (key === maskKey) return; maskKey = key; let a = alpha; if (vals.shift) a = X.shiftEdge(a, W, H, vals.shift); if (vals.fade > 0) { const f = Float32Array.from(a); X.gaussChan(f, W, H, vals.fade / 2); a = Uint8ClampedArray.from(f); } skyL.mask = maskFromAlphaGray(a); skyL.maskVer = Math.random(); const inv = new Uint8ClampedArray(a.length); for (let i = 0; i < a.length; i++) inv[i] = 255 - a[i]; fgL.mask = maskFromAlphaGray(inv); fgL.maskVer = Math.random(); fgL.x = fgL.y = 0; };
  let timer = null; const update = () => { clearTimeout(timer); timer = setTimeout(() => { drawMask(); drawSky(); requestRender(); renderLayers(); }, docArea() > 4e6 ? 120 : 30); };
  const grid = h('div', { class: 'sky-grid' });
  const drawGrid = () => { grid.innerHTML = ''; X.SKIES.forEach(s => { let th = skyThumbCache[s.id]; if (!th) th = skyThumbCache[s.id] = X.renderSky(s.id, 96, 56, 11); const cv = h('canvas', { width: 96, height: 56 }); cv.getContext('2d').drawImage(th, 0, 0); grid.append(h('div', { class: 'sky-cell' + (!custom && vals.preset === s.id ? ' on' : ''), title: s.name, onclick: () => { custom = null; vals.preset = s.id; drawGrid(); update(); } }, cv, h('span', {}, s.name))); });
    grid.append(h('div', { class: 'sky-cell load' + (custom ? ' on' : ''), onclick: async () => { const fs = await bts.fs.open({ filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }] }); if (!fs) return; const im = await decodeImage(new Uint8Array(fs[0].data), fs[0].name); custom = mk(im.width, im.height); custom.getContext('2d').drawImage(im, 0, 0); drawGrid(); update(); } }, h('div', { class: 'sky-load', html: icon('image') }), h('span', {}, 'Image file…'))); };
  drawGrid();
  const fl = h('div', { class: 'ph-fields' }); buildFields(fl, [rng('shift', 'Shift edge (px)', -40, 40, 0), rng('fade', 'Fade edge (px)', 0, 100, vals.fade), rng('bright', 'Sky brightness', -60, 60, 0), rng('temp', 'Sky temperature', -100, 100, 0), rng('scale', 'Sky scale %', 50, 300, 100), rng('pos', 'Sky position %', -50, 50, 0), { key: 'flip', label: 'Flip sky horizontally', type: 'checkbox' }, rng('fg', 'Foreground colour & light match %', 0, 100, 55)], vals, update);
  drawMask(); drawSky(); requestRender(); renderLayers();
  const ok = await floatPanel({ title: 'Sky replacement', width: 360, body: h('div', { class: 'ph-fields' }, grid, fl), ok: 'Apply' });
  clearTimeout(timer);
  if (!ok) { D.layers = D.layers.filter(l => l !== skyL && l !== fgL); D.active = clamp(D.active, 0, D.layers.length - 1); requestRender(); renderLayers(); return; }
  drawMask(); drawSky(); setSel(null); requestRender(); pushHist('Sky replacement'); renderLayers();
}

// =====================================================================  Portrait: background blur, teeth & eye brighten (tool), skin smoothing (filter)
async function backgroundBlurDialog() {
  const L = checkPixelLayer(); if (!L || smartBlock(L)) return; ensureCovers(L);
  const W = D.w, H = D.h, src = layerDocCanvas(L); let alpha = null;
  await withBusy('Finding the subject…', async () => { alpha = await subjectAlpha('ai', src); }); if (!alpha) return;
  const vals = { r: 22, bright: 35, feather: 3, shift: 1 };
  const k = Math.min(1, 640 / Math.max(W, H)), pw = Math.max(1, Math.round(W * k)), ph = Math.max(1, Math.round(H * k)), sc = mk(pw, ph), scx = ctxOf(sc); scx.imageSmoothingQuality = 'high'; scx.drawImage(src, 0, 0, pw, ph);
  const sImg = scx.getImageData(0, 0, pw, ph), sA = (() => { const c = maskFromAlpha(alpha), s = mk(pw, ph); s.getContext('2d').drawImage(c, 0, 0, pw, ph); const d = ctxOf(s).getImageData(0, 0, pw, ph).data, a = new Uint8ClampedArray(pw * ph); for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3]; return a; })();
  const compute = (img, a, w, hh, scale) => {
    let sub = a; if (vals.shift) sub = X.shiftEdge(a, w, hh, Math.max(1, Math.round(vals.shift * scale)));
    const known = new Float32Array(w * hh); for (let i = 0; i < known.length; i++) known[i] = sub[i] > 40 ? 0 : 1;
    const bg = X.copyImg(img); X.pullPushFill(bg.data, w, hh, known); X.flt.lensBlur(bg, { r: vals.r, b: vals.bright, t: 200, shape: 'circle', noise: 0 }, { scale });
    const fa = Float32Array.from(a); if (vals.feather > 0) X.gaussChan(fa, w, hh, Math.max(0.3, vals.feather * scale / 2));
    const out = X.copyImg(img), o = out.data, b = bg.data; for (let i = 0; i < fa.length; i++) { const t = fa[i] / 255, j = i * 4; for (let c = 0; c < 3; c++) o[j + c] = o[j + c] * t + b[j + c] * (1 - t); } return out; };
  const pv = h('canvas', { width: pw, height: ph, class: 'ph-preview-cv' }); let t; const draw = () => ctxOf(pv).putImageData(compute(sImg, sA, pw, ph, k), 0, 0);
  const fl = h('div', { class: 'ph-fields' }); buildFields(fl, [rng('r', 'Blur amount (px)', 1, 120, 22), rng('bright', 'Bokeh brightness', 0, 100, 35), rng('feather', 'Edge feather (px)', 0, 30, 3), rng('shift', 'Protect subject edge (px)', 0, 20, 1), { key: 'n', type: 'note', label: 'Keeps the subject (Select subject) sharp and applies a lens blur to everything else. The background behind the subject is reconstructed first so the subject does not bleed into the blur.' }], vals, () => { clearTimeout(t); t = setTimeout(draw, 60); }); draw();
  const r = await modal({ title: 'Background blur', width: 980, body: h('div', { class: 'ph-dlg' }, h('div', { class: 'ph-preview' }, pv), h('div', { class: 'ph-side' }, fl)), buttons: [{ label: 'Cancel', value: null }, { label: 'Apply', primary: true, value: 'ok' }] });
  if (r !== 'ok') return;
  await withBusy('Blurring the background…', async () => { const full = ctxOf(src).getImageData(0, 0, W, H), out = compute(full, alpha, W, H, 1); const c = mk(W, H); ctxOf(c).putImageData(out, 0, 0); const lc = L.canvas.getContext('2d'); lc.clearRect(-L.x, -L.y, W, H); lc.drawImage(c, -L.x, -L.y); requestRender(); pushHist('Background blur'); });
}
function brightenDab(d, W, H, weight) {
  const k = O.strength, mode = O.brightMode;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const w0 = weight(px, py) * k * 0.22; if (!w0) continue; const j = (py * W + px) * 4; let [hh, s, l] = X.rgb2hsl(d[j], d[j + 1], d[j + 2]);
    if (mode === 'teeth') { const deg = hh * 360, yel = deg > 15 && deg < 75 ? 1 - Math.abs(deg - 45) / 30 : 0; s *= 1 - w0 * (0.6 + yel * 1.4); l += (1 - l) * w0 * 0.55 * (l > 0.25 ? 1 : 0.3); }
    else { l += (1 - l) * w0 * 0.35 * (l > 0.08 ? 1 : 0.2); s = Math.min(1, s * (1 + w0 * 0.6)); }
    const o = X.hsl2rgb(hh, clamp(s, 0, 1), clamp(l, 0, 1)); d[j] = o[0]; d[j + 1] = o[1]; d[j + 2] = o[2];
  }
}

// =====================================================================  Frames (place an image into a shape that clips it)
let frameCount = 0;
function frameAt(x, y) { for (let i = D.layers.length - 1; i >= 0; i--) { const l = D.layers[i]; if (l.kind !== 'frame' || !l.visible) continue; if (x >= l.x && y >= l.y && x <= l.x + l.frame.w && y <= l.y + l.frame.h) return l; } return null; }
function renderFrameLayer(L) {
  const f = L.frame, w = Math.max(1, Math.round(f.w)), hh = Math.max(1, Math.round(f.h)), c = mk(w, hh), x = c.getContext('2d');
  const path = () => { x.beginPath(); if (f.shape === 'ellipse') x.ellipse(w / 2, hh / 2, w / 2, hh / 2, 0, 0, Math.PI * 2); else if (f.radius > 0) x.roundRect(0, 0, w, hh, Math.min(f.radius, w / 2, hh / 2)); else x.rect(0, 0, w, hh); };
  x.save(); path(); x.clip();
  if (f.img) { const iw = f.img.width, ih = f.img.height, s = (f.fit === 'fit' ? Math.min(w / iw, hh / ih) : Math.max(w / iw, hh / ih)) * (f.scale || 1); x.imageSmoothingQuality = 'high'; x.drawImage(f.img, (w - iw * s) / 2 + (f.ox || 0), (hh - ih * s) / 2 + (f.oy || 0), iw * s, ih * s); }
  else { x.fillStyle = 'rgba(150,156,166,.45)'; x.fillRect(0, 0, w, hh); x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = Math.max(1, Math.min(w, hh) / 150); x.beginPath(); x.moveTo(0, 0); x.lineTo(w, hh); x.moveTo(w, 0); x.lineTo(0, hh); x.stroke(); }
  x.restore();
  if (f.stroke > 0) { x.save(); path(); x.clip(); path(); x.lineWidth = f.stroke * 2; x.strokeStyle = f.strokeC; x.stroke(); x.restore(); }
  L.canvas = c;
}
function createFrame(r, shape = O.frameShape) {
  if (!D) return; const w = Math.max(4, Math.round(r.w)), hh = Math.max(4, Math.round(r.h));
  const L = newLayer('Frame ' + (++frameCount), w, hh, { kind: 'frame', x: Math.round(r.x), y: Math.round(r.y), frame: { shape, w, h: hh, radius: shape === 'rect' ? O.frameRadius : 0, img: null, fit: 'fill', scale: 1, ox: 0, oy: 0, stroke: O.frameStroke, strokeC: O.frameStrokeC } });
  renderFrameLayer(L); D.layers.splice(D.active + 1, 0, L); D.active++; requestRender(); pushHist('New frame'); renderLayers(); renderOptions(); return L;
}
function newFrameCentered(shape) { if (!D) return; const s = Math.min(D.w, D.h) * 0.6; createFrame({ x: (D.w - s) / 2, y: (D.h - s) / 2, w: s, h: s }, shape); }
const activeFrame = () => AL()?.kind === 'frame' ? AL() : null;
async function placeIntoFrame(L = activeFrame(), file) {
  if (!L) return toast('Select a frame layer first (draw one with the Frame tool, K)', 'err');
  const f = file || (await bts.fs.open({ filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'svg'] }] }))?.[0]; if (!f) return;
  const im = await decodeImage(new Uint8Array(f.data), f.name); const c = mk(im.width, im.height); c.getContext('2d').drawImage(im, 0, 0);
  setFrameImage(L, c);
}
function setFrameImage(L, canvas) { Object.assign(L.frame, { img: canvas, scale: 1, ox: 0, oy: 0 }); renderFrameLayer(L); requestRender(); pushHist('Place into frame'); renderLayers(); renderOptions(); }
let frameHistT = null;
function updateFrame(p, label = 'Frame') { const L = activeFrame(); if (!L) return; Object.assign(L.frame, p); renderFrameLayer(L); requestRender(); clearTimeout(frameHistT); frameHistT = setTimeout(() => { pushHist(label); renderLayers(); }, 350); }
function frameFromSelectionOrLayer() { const L = AL(); if (!D || !L) return; const r = extractSel(L, false); if (!r) return; const fl = createFrame({ x: r.x, y: r.y, w: r.canvas.width, h: r.canvas.height }, 'rect'); if (fl) setFrameImage(fl, r.canvas); }

// =====================================================================  Adjustment presets (user presets saved per adjustment type)
const PRESET_KEY = 'bts.photo.adjPresets';
const presetsAll = () => LS.get(PRESET_KEY, {}), presetsOf = id => presetsAll()[id] || [];
function savePresetData(id, name, params) { const all = presetsAll(); const list = all[id] || []; const i = list.findIndex(p => p.name === name); const p = { name, params: JSON.parse(JSON.stringify(params)) }; if (i >= 0) list[i] = p; else list.push(p); all[id] = list; LS.set(PRESET_KEY, all); }
function deletePresetData(id, name) { const all = presetsAll(); all[id] = (all[id] || []).filter(p => p.name !== name); if (!all[id].length) delete all[id]; LS.set(PRESET_KEY, all); }
function presetRow(a, vals, rebuild) {
  const sel = h('select', { class: 'preset-sel' }); const fill = () => { sel.innerHTML = ''; sel.append(h('option', { value: '' }, presetsOf(a.id).length ? 'Presets…' : 'No saved presets')); presetsOf(a.id).forEach(p => sel.append(h('option', { value: p.name }, p.name))); }; fill();
  sel.onchange = () => { const p = presetsOf(a.id).find(q => q.name === sel.value); if (!p) return; Object.keys(vals).forEach(k => delete vals[k]); Object.assign(vals, JSON.parse(JSON.stringify(p.params))); rebuild(p.name); };
  const save = h('button', { class: 'btn sm', 'data-tip': 'Save these settings as a preset', onclick: async () => { const n = await prompt('Save ' + a.name + ' preset', 'Preset name', sel.value || a.name + ' ' + (presetsOf(a.id).length + 1)); if (!n) return; savePresetData(a.id, n, vals); fill(); sel.value = n; toast('Preset saved', 'ok'); } }, 'Save…');
  const del = h('button', { class: 'btn sm', 'data-tip': 'Delete the selected preset', onclick: () => { if (!sel.value) return toast('Choose a preset to delete'); deletePresetData(a.id, sel.value); fill(); toast('Preset deleted'); } }, 'Delete');
  return { el: h('div', { class: 'preset-row' }, sel, save, del), sel };
}
async function saveActivePreset() { const L = AL(); if (L?.kind !== 'adjust' || !ADJ_BY_ID[L.adj.type]?.params && !ADJ_BY_ID[L.adj.type]?.custom) return toast('Select an adjustment layer with settings', 'err'); const a = ADJ_BY_ID[L.adj.type]; const n = await prompt('Save ' + a.name + ' preset', 'Preset name', L.name); if (!n) return; savePresetData(a.id, n, L.adj.params); toast('Preset saved', 'ok'); }
function presetThumb(a, params, base) { const img = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height); try { a.fn(img, JSON.parse(JSON.stringify(params)), { scale: base.width / D.w }); } catch (e) { console.error(e); } const c = mk(base.width, base.height); ctxOf(c).putImageData(img, 0, 0); return c; }
async function applyPresetDialog() {
  if (!D) return toast('Open an image first'); const all = presetsAll(), ids = Object.keys(all).filter(id => ADJ_BY_ID[id]);
  if (!ids.length) return toast('No presets yet — save one from an adjustment panel (Save…)');
  const s = smallComposite(D.layers.length, 120), b2 = mk(s.width, s.height), bx = ctxOf(b2); bx.fillStyle = '#fff'; bx.fillRect(0, 0, s.width, s.height); bx.drawImage(s, 0, 0); const base = bx.getImageData(0, 0, s.width, s.height);
  let chosen = null; const grid = h('div', { class: 'preset-grid' });
  ids.forEach(id => { const a = ADJ_BY_ID[id]; grid.append(h('div', { class: 'adj-cat' }, a.name)); all[id].forEach(p => { const th = presetThumb(a, p.params, base), cv = h('canvas', { width: 108, height: 80 }); const x = cv.getContext('2d'), kk = Math.max(108 / th.width, 80 / th.height); x.drawImage(th, (108 - th.width * kk) / 2, (80 - th.height * kk) / 2, th.width * kk, th.height * kk);
    const cell = h('div', { class: 'look', onclick: () => { grid.querySelectorAll('.look').forEach(e => e.classList.remove('on')); cell.classList.add('on'); chosen = { id, p }; }, ondblclick: () => document.querySelector('.modal .m-f .primary')?.click() }, cv, h('span', {}, p.name)); grid.append(cell); }); });
  const r = await modal({ title: 'Apply adjustment preset', width: 620, body: grid, buttons: [{ label: 'Cancel', value: null }, { label: 'Add adjustment layer', primary: true, value: 'ok' }] });
  if (r !== 'ok' || !chosen) return; const a = ADJ_BY_ID[chosen.id];
  const L = newLayer(a.name + ': ' + chosen.p.name, 1, 1, { kind: 'adjust', adj: { type: a.id, params: JSON.parse(JSON.stringify(chosen.p.params)) } }); D.layers.splice(D.active + 1, 0, L); D.active++; requestRender(); pushHist('Preset: ' + chosen.p.name); renderLayers();
}
async function managePresetsDialog() {
  const body = h('div', { class: 'preset-list' }); const draw = () => { body.innerHTML = ''; const all = presetsAll(); const ids = Object.keys(all); if (!ids.length) body.append(h('div', { class: 'muted' }, 'No saved presets.')); ids.forEach(id => { body.append(h('div', { class: 'adj-cat' }, ADJ_BY_ID[id]?.name || id)); all[id].forEach(p => body.append(h('div', { class: 'preset-item' }, h('span', {}, p.name), h('button', { class: 'btn sm', onclick: () => { deletePresetData(id, p.name); draw(); } }, 'Delete')))); }); }; draw();
  await modal({ title: 'Adjustment presets', width: 420, body, buttons: [{ label: 'Done', primary: true }] });
}

// =====================================================================  Smart filters (non-destructive, editable filter stack per layer)
function smartPartial(L, upto = Infinity) {
  const s = L.smart, c = mk(s.orig.width, s.orig.height), x = ctxOf(c); x.drawImage(s.orig, 0, 0);
  s.filters.forEach((f, i) => { if (i >= upto || !f.on) return; const Fd = FILTERS.find(q => q.id === f.id); if (!Fd) return; const img = x.getImageData(0, 0, c.width, c.height), orig = f.mask ? new Uint8ClampedArray(img.data) : null;
    try { Fd.fn(img, f.vals, { scale: 1, fg: f.fg, bg: f.bg, ox: L.x, oy: L.y }); } catch (e) { console.error(e); }
    if (f.mask) { const m = ctxOf(f.mask).getImageData(0, 0, c.width, c.height).data, d = img.data; for (let j = 0; j < d.length; j += 4) { const a = m[j + 3] / 255; if (a >= 1) continue; for (let q = 0; q < 4; q++) d[j + q] = orig[j + q] + (d[j + q] - orig[j + q]) * a; } }
    x.putImageData(img, 0, 0); });
  return c;
}
const smartRecompute = L => smartPartial(L);
function convertToSmart(L = AL(), silent) { if (!D || !L) return; if (L.kind !== 'raster') return toast(L.kind === 'adjust' ? 'Adjustment layers cannot hold filters' : 'Rasterize the layer first', 'err'); if (L.smart) return silent ? null : toast('This layer already uses smart filters'); ensureCovers(L); L.smart = { orig: cloneCanvas(L.canvas), filters: [] }; if (!silent) { pushHist('Convert for smart filters'); renderLayers(); toast('Filters on this layer are now editable — see the Layers panel', 'ok'); } }
function applySmartFilter(L, Fd, vals) {
  convertToSmart(L, true); let mask = null; if (D.sel) { mask = mk(L.canvas.width, L.canvas.height); mask.getContext('2d').drawImage(D.sel, -L.x, -L.y); }
  L.smart.filters.push({ id: Fd.id, vals: JSON.parse(JSON.stringify(vals)), on: true, fg: O.fg, bg: O.bg, mask }); L.canvas = smartRecompute(L); renderLayers(); return true;
}
function smartToggle(L, i) { const f = L.smart.filters[i]; f.on = !f.on; L.canvas = smartRecompute(L); requestRender(); pushHist((f.on ? 'Show ' : 'Hide ') + 'smart filter'); renderLayers(); }
function smartDelete(L, i) { L.smart.filters.splice(i, 1); L.canvas = smartRecompute(L); requestRender(); pushHist('Delete smart filter'); renderLayers(); }
function smartEdit(L, i) { const f = L.smart.filters[i], Fd = FILTERS.find(q => q.id === f.id); if (!Fd) return; if (!Fd.params) return toast('This filter has no settings'); filterDialog(Fd, { smartEdit: { L, i } }); }
function rasterizeSmart(L = AL()) { if (!L?.smart) return toast('The active layer has no smart filters'); L.smart = null; pushHist('Rasterize smart filters'); renderLayers(); }

// =====================================================================  Autosave & crash recovery (IndexedDB)
const AS = LS.get('bts.photo.autosave', { on: true, sec: 60 }), SESSION = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
let idbP = null;
function idb() { if (!idbP) { idbP = new Promise((res, rej) => { const r = indexedDB.open('bts-photo-recovery', 1); r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains('docs')) db.createObjectStore('docs', { keyPath: 'rid' }); if (!db.objectStoreNames.contains('alive')) db.createObjectStore('alive', { keyPath: 'session' }); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); idbP.catch(() => { idbP = null; }); } return idbP; }
async function idbDo(store, mode, fn) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction(store, mode), st = tx.objectStore(store); let out; const r = fn(st); if (r) r.onsuccess = () => { out = r.result; }; tx.oncomplete = () => res(out); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); }); }
function layerMeta(L) { return { name: L.name, x: L.x, y: L.y, visible: L.visible, opacity: L.opacity, blend: L.blend, locked: L.locked, fx: L.fx, kind: L.kind, text: L.text, adj: L.adj, editMask: L.editMask, frame: L.frame ? { ...L.frame, img: undefined } : undefined, smart: L.smart ? { filters: L.smart.filters.map(f => ({ id: f.id, vals: f.vals, on: f.on, fg: f.fg, bg: f.bg })) } : undefined }; }
// enc(canvas) -> string (data URL) or Promise<Blob>
async function serializeDoc(d, enc) {
  const layers = [];
  for (const L of d.layers) { const m = layerMeta(L); m.png = L.kind === 'adjust' ? null : await enc(L.canvas); m.mask = L.mask ? await enc(L.mask) : null; if (L.frame?.img) m.frameImg = await enc(L.frame.img); if (L.smart) { m.smartOrig = await enc(L.smart.orig); m.smartMasks = []; for (const f of L.smart.filters) m.smartMasks.push(f.mask ? await enc(f.mask) : null); } layers.push(m); }
  return { app: 'BTS Photo', v: 3, w: d.w, h: d.h, guides: d.guides, notes: d.notes, layers };
}
async function partToCanvas(v) { if (!v) return null; const im = typeof v === 'string' ? await decodeImage(b64ToU8(v), 'x.png') : await createImageBitmap(v); const c = mk(im.width, im.height); c.getContext('2d').drawImage(im, 0, 0); return c; }
async function docFromProject(j, name) {
  const d = createDoc({ w: j.w, h: j.h, name, bg: null }); d.layers = [];
  for (const l of j.layers) {
    const kind = l.kind || 'raster', base = { visible: l.visible, opacity: l.opacity, blend: l.blend, locked: l.locked, fx: l.fx || {}, kind, editMask: !!l.editMask };
    let L; if (kind === 'adjust') L = newLayer(l.name, 1, 1, { ...base, adj: l.adj });
    else { const c = await partToCanvas(l.png); L = newLayer(l.name, c.width, c.height, { ...base, x: l.x, y: l.y, text: l.text }); L.canvas = c; }
    if (l.mask) { L.mask = await partToCanvas(l.mask); L.maskVer = 1; L.x = l.x || 0; L.y = l.y || 0; }
    if (kind === 'frame' && l.frame) { L.frame = { ...l.frame, img: await partToCanvas(l.frameImg) }; }
    if (l.smart && l.smartOrig) { L.smart = { orig: await partToCanvas(l.smartOrig), filters: [] }; for (let i = 0; i < l.smart.filters.length; i++) L.smart.filters.push({ ...l.smart.filters[i], mask: await partToCanvas(l.smartMasks?.[i]) }); }
    d.layers.push(L);
  }
  d.guides = j.guides || []; d.notes = j.notes || []; d.active = d.layers.length - 1; return d;
}
let asBusy = false, asLast = 0;
async function autosaveDoc(d) {
  d.rid = d.rid || (crypto.randomUUID ? crypto.randomUUID() : 'r' + Math.random()); const j = await serializeDoc(d, c => canvasToBlob(c, 'image/png'));
  const tk = Math.min(1, 160 / Math.max(d.w, d.h)), tc = mk(Math.max(1, d.w * tk), Math.max(1, d.h * tk)); { const cur = D; D = d; try { tc.getContext('2d').drawImage(flattenCanvas(), 0, 0, tc.width, tc.height); } finally { D = cur; } }
  const thumb = await canvasToBlob(tc, 'image/png');
  await idbDo('docs', 'readwrite', st => st.put({ rid: d.rid, session: SESSION, name: d.name, path: d.path, w: d.w, h: d.h, at: Date.now(), thumb, j }));
  d.asKey = d.hi + ':' + d.hist.length + ':' + d.w + 'x' + d.h;
}
async function autosaveNow(force = false) {
  if (asBusy) return 0; asBusy = true; let n = 0;
  try { await idbDo('alive', 'readwrite', st => st.put({ session: SESSION, at: Date.now() }));
    for (const d of docs) { const key = d.hi + ':' + d.hist.length + ':' + d.w + 'x' + d.h; if (!d.dirty && !force) continue; if (d.asKey === key && !force) continue; if (T && d === D) continue; await autosaveDoc(d); n++; } }
  catch (e) { console.warn('Autosave failed', e); } finally { asBusy = false; asLast = Date.now(); }
  return n;
}
async function dropRecovery(d) { if (!d?.rid) return; try { await idbDo('docs', 'readwrite', st => st.delete(d.rid)); } catch { } d.asKey = null; }
setInterval(() => { if (AS.on && docs.length && Date.now() - asLast >= AS.sec * 1000) autosaveNow(); else if (Date.now() - asLast >= 30000) { asLast = Date.now(); idbDo('alive', 'readwrite', st => st.put({ session: SESSION, at: Date.now() })).catch(() => { }); } }, 5000);
async function checkRecovery({ manual = false, includeOwn = false } = {}) {
  let entries = [], alive = [];
  try { entries = await idbDo('docs', 'readonly', st => st.getAll()) || []; alive = await idbDo('alive', 'readonly', st => st.getAll()) || []; } catch (e) { if (manual) toast('Recovery storage is unavailable', 'err'); return 0; }
  const live = new Set(alive.filter(a => a.session !== SESSION && Date.now() - a.at < 90000).map(a => a.session));
  const cand = entries.filter(e => (includeOwn || e.session !== SESSION) && !live.has(e.session) && !docs.some(d => d.rid === e.rid));
  if (!cand.length) { if (manual) toast('No autosaved documents to recover'); return 0; }
  const picks = new Set(cand.map(e => e.rid)), list = h('div', { class: 'rec-list' });
  for (const e of cand) { const url = e.thumb ? URL.createObjectURL(e.thumb) : ''; const cb = h('input', { type: 'checkbox', checked: true }); cb.onchange = () => cb.checked ? picks.add(e.rid) : picks.delete(e.rid); list.append(h('label', { class: 'rec-item' }, cb, url ? h('img', { src: url }) : h('div', { class: 'rec-ph' }), h('div', {}, h('div', { class: 'rec-n' }, e.name), h('div', { class: 'muted rec-d' }, `${e.w} × ${e.h} px · autosaved ${new Date(e.at).toLocaleString()}`)))); }
  const r = await modal({ title: 'Recover unsaved work', width: 520, body: h('div', {}, h('div', { class: 'muted', style: { marginBottom: '8px' } }, 'BTS Photo closed unexpectedly. These documents were autosaved and can be restored.'), list), buttons: [{ label: 'Discard', value: 'discard' }, { label: 'Later', value: null }, { label: 'Recover', primary: true, value: 'ok' }] });
  if (r === 'discard') { for (const e of cand) await idbDo('docs', 'readwrite', st => st.delete(e.rid)); toast('Autosaved documents discarded'); return 0; }
  if (r !== 'ok') return 0; let n = 0;
  for (const e of cand) { if (!picks.has(e.rid)) continue; try { const d = await docFromProject(e.j, e.name.replace(/( \(recovered\))?$/, ' (recovered)')); d.path = null; d.fmt = null; addDoc(d); d.dirty = true; d.rid = e.rid; await idbDo('docs', 'readwrite', st => st.put({ ...e, session: SESSION })); renderTabs(); n++; } catch (err) { console.error(err); toast('Could not recover ' + e.name, 'err'); } }
  if (n) toast(`Recovered ${n} document${n === 1 ? '' : 's'} — save them to keep the changes`, 'ok'); return n;
}
async function autosaveSettings() {
  const v = await form({ title: 'Autosave & recovery', fields: [{ key: 'on', label: 'Autosave unsaved documents for crash recovery', type: 'checkbox', value: AS.on }, { key: 'sec', label: 'Every (seconds)', type: 'number', value: AS.sec, min: 15, max: 3600 }] }); if (!v) return;
  AS.on = !!v.on; AS.sec = clamp(Math.round(+v.sec || 60), 15, 3600); LS.set('bts.photo.autosave', AS); toast(AS.on ? `Autosave every ${AS.sec} s` : 'Autosave is off', 'ok');
}

// =====================================================================  Contextual task bar
O.taskBar = LS.get('bts.photo.taskbar', true);
const tbar = h('div', { class: 'ctx-bar' }); vpEl.append(tbar); let tbarKey = '';
['pointerdown', 'pointerup', 'pointermove', 'dblclick', 'wheel', 'contextmenu'].forEach(ev => tbar.addEventListener(ev, e => e.stopPropagation()));
function toggleTaskBar() { O.taskBar = !O.taskBar; LS.set('bts.photo.taskbar', O.taskBar); updateTaskBar(); }
function taskBarItems() {
  if (T) return [['check', 'Commit', commitTransform, true], ['close', 'Cancel', cancelTransform]];
  if (O.tool === 'crop' && cropState) return [['check', 'Apply crop', applyCrop, true], ['undo', 'Reset', () => { cropState = { x: 0, y: 0, w: D.w, h: D.h }; drawOverlay(); }], ['rotate', 'Straighten…', () => straightenDialog(0)]];
  if (D.sel) return [['bucket', 'Fill…', fillDialog], ['heal', 'Content-aware fill', contentAwareFillDialog], ['swap', 'Inverse', invertSel], ['mask', 'Mask', () => addMask('sel')], ['wand', 'Refine edge', refineEdgeDialog], ['close', 'Deselect', deselect]];
  const L = AL(), out = [['subject', 'Select subject', () => selectSubject('ai')], ['eraser', 'Remove background', () => removeBackground('ai')]];
  if (L?.kind === 'frame') out.unshift(['image', 'Place image', () => placeIntoFrame(L)]);
  if (D.active > 0 && L && L.kind !== 'adjust') out.push(['harmonize', 'Harmonize', harmonizeDialog]);
  out.push(['sky', 'Replace sky', skyReplaceDialog], ['upscale', 'Upscale', upscaleDialog]); return out;
}
function updateTaskBar() {
  if (!O.taskBar || !D || stroke || drag || textEd || busy || pan) { tbar.style.display = 'none'; return; }
  const items = taskBarItems(), key = items.map(i => i[1]).join('|');
  if (key !== tbarKey) { tbarKey = key; tbar.innerHTML = ''; items.forEach(([ic, label, fn, primary]) => tbar.append(h('button', { class: 'cb' + (primary ? ' primary' : ''), onclick: () => fn(), html: icon(ic, 15) + `<span>${label}</span>` }))); tbar.append(h('button', { class: 'cb x', 'data-tip': 'Hide the contextual task bar (View menu to show it again)', onclick: toggleTaskBar, html: icon('close', 13) })); }
  tbar.style.display = 'flex';
  const vr = vpEl.getBoundingClientRect(), bw = tbar.offsetWidth || 300, bh = tbar.offsetHeight || 34; let ax, ay;
  if (T) { const pts = transformCorners(T).map(p => toScreen(...p)); ax = pts.reduce((s, p) => s + p[0], 0) / 4; ay = Math.max(...pts.map(p => p[1])) + 14; }
  else if (D.sel && D.selBounds) { const b = D.selBounds; [ax, ay] = toScreen(b.x + b.w / 2, b.y + b.h); ay += 14; if (ay + bh > vr.height - 8) ay = toScreen(0, b.y)[1] - bh - 14; }
  else { [ax, ay] = toScreen(D.w / 2, D.h); ay += 16; }
  tbar.style.left = clamp(ax - bw / 2, 8, Math.max(8, vr.width - bw - 8)) + 'px'; tbar.style.top = clamp(ay, 30, Math.max(30, vr.height - bh - 8)) + 'px';
}
function smartRows(l, i) {
  const wrap = h('div', { class: 'sf-wrap' + (i === D.active ? ' active' : '') });
  wrap.append(h('div', { class: 'sf-h' }, h('span', { class: 'sf-ic', html: icon('fx', 12) }), 'Smart filters'));
  l.smart.filters.forEach((f, k) => { const Fd = FILTERS.find(q => q.id === f.id);
    wrap.append(h('div', { class: 'sf' + (f.on ? '' : ' off'), ondblclick: e => { e.stopPropagation(); D.active = i; smartEdit(l, k); } },
      h('div', { class: 'vis', 'data-tip': 'Show / hide this filter', html: icon(f.on ? 'eye' : 'eyeOff'), onclick: e => { e.stopPropagation(); smartToggle(l, k); } }),
      h('span', { class: 'sf-n' }, Fd ? Fd.name : f.id), f.mask ? h('span', { class: 'badge' }, 'masked') : '',
      h('button', { class: 'icon-btn sf-b', 'data-tip': 'Edit filter settings', html: icon('sliders', 13), onclick: e => { e.stopPropagation(); D.active = i; smartEdit(l, k); } }),
      h('button', { class: 'icon-btn sf-b', 'data-tip': 'Delete smart filter', html: icon('trash', 13), onclick: e => { e.stopPropagation(); smartDelete(l, k); } }))); });
  if (!l.smart.filters.length) wrap.append(h('div', { class: 'sf muted' }, 'Apply a filter to add it here'));
  return wrap;
}
const SMART_MENU = () => [{ label: 'Convert for smart filters', action: () => convertToSmart(), disabled: AL()?.kind !== 'raster' || !!AL()?.smart }, { label: 'Apply new filters as smart filters', checked: () => O.smartFilters, action: () => { O.smartFilters = !O.smartFilters; toast(O.smartFilters ? 'New filters are added as editable smart filters' : 'Filters are applied directly to pixels'); } }, { label: 'Rasterize smart filters', action: () => rasterizeSmart(), disabled: !AL()?.smart }];

// =====================================================================  boot
vpEl.append(h('div', { class: 'welcome' }, h('div', { class: 'card' }, h('div', { class: 'big-ico' }, 'Ph'), h('h2', {}, 'BTS Photo'), h('p', {}, 'Create a new image or open a photo, PSD or project. You can also drop files here or paste an image.'),
  h('div', { class: 'row' }, h('button', { class: 'btn primary', html: icon('plus') + 'New', onclick: newDialog }), h('button', { class: 'btn', html: icon('open') + 'Open', onclick: openDialog })))));
UI.fileDrop(async files => { if (D && activeFrame() && files.length === 1 && /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(files[0].name)) return placeIntoFrame(activeFrame(), { name: files[0].name, data: new Uint8Array(await files[0].arrayBuffer()) }); for (const f of files) await openFile({ name: f.name, path: bts.fs.pathOf(f), data: new Uint8Array(await f.arrayBuffer()) }); }, 'Drop images to open');
renderColor(); renderToolbar(); setTool('brush'); renderAll(); renderTabs(); UI.setDocTitle('', 'BTS Photo');
const qf = UI.queryFile(); if (qf) bts.fs.read(qf).then(f => openFile({ ...f, data: new Uint8Array(f.data) }));
setTimeout(() => checkRecovery().catch(e => console.warn('Recovery check failed', e)), 1500);
window.__bts = { get D() { return D; }, O, X, addDoc, createDoc, setTool, pushHist, requestRender, render, flattenCanvas, runAdjust, ADJ, ADJ_BY_ID, FILTERS, runFilter, filterDialog, applyFilterToLayer, layerImageOp, startTransform, commitTransform, selectAll, deselect, invertSel, addLayer, applyGradient, commitShape, savePsd, psdObject, projectJSON, openFile, renderLayers, layerStyleDialog, textClick, finishText, get T() { return T; },
  inpaintLayer, contentAwareFillDialog, applyPatch, redEyeAt, selectSubject, selectSky, focusAreaDialog, colorRangeDialog, growSel, similarSel, refineEdgeDialog, removeBackground, personMask, plainBgMask, liquifyDialog, applyLook, showTab, renderLooks,
  exportDialog, exportLayersDialog, quickExportPng, newDialog, TEMPLATES, takeSnapshot, restoreSnapshot, expandDialog, expandFill, rotateArbitrary, straightenDialog, autoStraighten, revealAll, trimCanvas, resizeCanvas, resizeImage, applyCrop, applyPerspectiveCrop, cropRatioValue, fitCropToRatio,
  get cropState() { return cropState; }, set cropState(v) { cropState = v; }, get pcropState() { return pcropState; }, set pcropState(v) { pcropState = v; }, repeatFilter, get lastFilter() { return lastFilter; }, gradientEditor, definePattern, PATTERNS, copyFx, pasteFx, clearFx, toggleRulers, snapValue, newGuideDialog, setSel, maskFromAlpha, selAlpha, editActiveLayer, mergeDown, flatten, stampAdjust, beginStrokeAt: (x, y) => beginStroke({}, x, y), continueStrokeAt: (x, y) => continueStroke(x, y, {}), endStroke, noteClick, rulerAngle, straightenFromRuler, get busy() { return busy; },
  harmonizeDialog, shadowCanvas, upscaleDialog, upscaleImage, removeDistractions, inpaintTiled, skyReplaceDialog, skyAlphaFrom, backgroundBlurDialog, createFrame, newFrameCentered, setFrameImage, placeIntoFrame, updateFrame, renderFrameLayer, frameFromSelectionOrLayer, savePresetData, deletePresetData, presetsAll, applyPresetDialog, managePresetsDialog, saveActivePreset, convertToSmart, applySmartFilter, smartToggle, smartDelete, smartEdit, rasterizeSmart, smartRecompute, autosaveNow, checkRecovery, dropRecovery, docFromProject, serializeDoc, autosaveSettings, toggleTaskBar, updateTaskBar, AS, rasterizeLayer, adjustLayerDialog, get docs() { return docs; }, switchDoc };
})();
