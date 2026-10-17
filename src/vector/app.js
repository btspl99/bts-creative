// BTS Vector — vector illustration editor (paper.js engine). Core: document, artboards, layers, selection,
// tool dispatcher, history, files & export. Feature modules (vx-*.js) plug in through window.VX.
(() => {
const { $, h, toast, modal, form, prompt, confirm, contextMenu, clamp } = UI;
const P = paper; P.setup(document.getElementById('cv'));
P.settings.hitTolerance = 4; P.settings.handleSize = 7;
const view = P.view, project = P.project;
const cv = document.getElementById('cv'), vpEl = $('#viewport');
const VX = window.VX = { P, view, project, tools: {}, live: {}, f: {}, propSections: [], tabs: {}, menus: {}, smartLines: [], beforeCommit: [], afterGuides: [], svgPost: [], boardLabels: [] };

// ---------------------------------------------------------------- icons (24px stroke, like UI.icon)
const ICONS = {
  spiral: 'M12 12a1.5 1.5 0 1 1 1.5 1.5A3.5 3.5 0 1 1 15.5 9 5.5 5.5 0 1 1 7 15.5 7.5 7.5 0 1 1 19.5 9',
  flare: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5L19 19M19 5l-3.5 3.5M8.5 15.5L5 19',
  scale: 'M3 21h8v-8H3zM11 13l9-9M14 4h6v6',
  reflect: 'M12 2v20M9 5L3 18h6zM15 5l6 13h-6z',
  width: 'M3 12c3-6 6-6 9 0s6 6 9 0M12 7v10M10 9l2-2 2 2M10 15l2 2 2-2',
  distort: 'M4 5l15-2 2 17-17-1zM4 5l17 15M19 3L4 19',
  shapeBuilder: 'M9 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM15 10a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM19 3v4M17 5h4',
  livePaint: 'M19 11l-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2a2 2 0 0 0 2.8 0zM5 2l5 5M22 20a2 2 0 1 1-4 0c0-1.6 2-4 2-4s2 2.4 2 4z',
  blend: 'M6 6a3 3 0 1 0 0 .01M18 18a3 3 0 1 0 0 .01M8.5 8.5l1.5 1.5M12 12l.01.01M14 14l1.5 1.5',
  sprayer: 'M9 9h6v12H9zM10 9V6h4v3M12 3v1M17 3l1-1M19 6h2M17 8l2 1M5 4l1 1M4 8h1',
  measure: 'M2 17L17 2l5 5L7 22zM6 13l2 2M9 10l2 2M12 7l2 2',
  artboard: 'M6 2v20M18 2v20M2 6h20M2 18h20',
  blob: 'M5 19c-2-2-1-6 2-7s4-4 7-5 6 1 6 4-3 5-6 6-6 4-9 2z',
  knife: 'M3 21L21 3c-2 6-6 10-11 13M3 21l4-6',
  typePath: 'M3 18c4-8 14-8 18 0M8 6h8M12 6v8',
  rotateTool: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5M12 12h.01',
  recolor: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8zM7.5 12h.01M10 7.5h.01M14 7.5h.01M17 11h.01',
  dimension: 'M3 7v10M21 7v10M3 12h18M6 9l-3 3 3 3M18 9l3 3-3 3',
  repeat: 'M12 3a2 2 0 1 0 0 .01M12 19a2 2 0 1 0 0 .01M4 11a2 2 0 1 0 0 .01M20 11a2 2 0 1 0 0 .01M6.5 5.5a2 2 0 1 0 0 .01M17.5 16.5a2 2 0 1 0 0 .01',
};
VX.ICONS = ICONS;
const vicon = (n, size) => ICONS[n] ? `<svg viewBox="0 0 24 24"${size ? ` style="width:${size}px;height:${size}px"` : ''}><path d="${ICONS[n]}"/></svg>` : UI.icon(n, size);
VX.icon = vicon;

// ---------------------------------------------------------------- document & artboards
const DOC = {
  name: 'Untitled-1', path: null, dirty: false, boards: [], ab: 0, guides: [], swatches: [], symbols: [],
  get w() { return this.boards[this.ab]?.w || 1; }, set w(v) { this.boards[this.ab].w = v; },
  get h() { return this.boards[this.ab]?.h || 1; }, set h(v) { this.boards[this.ab].h = v; },
  get bg() { return this.boards[this.ab]?.bg; }, set bg(v) { this.boards[this.ab].bg = v; },
};
VX.DOC = DOC;
let artLayer, guideLayer;
const isSys = it => { if (!it) return true; while (it.parent) it = it.parent; return !(it instanceof P.Layer) || it.name === '__art' || it.name === '__guide'; };
const topLayerOf = it => { while (it && it.parent) it = it.parent; return it; };
const insideLive = it => { let x = it.parent; while (x) { if (x.data?.live) return true; x = x.parent; } return false; };
const userLayers = () => project.layers.filter(l => l.name !== '__art' && l.name !== '__guide');
const allLayers = () => { const out = []; const walk = L => { out.push(L); L.children.forEach(c => { if (c instanceof P.Layer) walk(c); }); }; userLayers().forEach(walk); return out; };
const isLayer = it => it instanceof P.Layer;
const abRect = (i = DOC.ab) => { const b = DOC.boards[i] || DOC.boards[0]; return new P.Rectangle(b.x, b.y, b.w, b.h); };
function setupSystemLayers() {
  artLayer?.remove(); guideLayer?.remove();
  artLayer = new P.Layer({ name: '__art', locked: true }); project.insertLayer(0, artLayer);
  guideLayer = new P.Layer({ name: '__guide' }); project.addLayer(guideLayer);
  drawArtboard(); activateUserLayer();
}
const cssVar = n => getComputedStyle(document.body).getPropertyValue(n).trim() || '#888';
function drawArtboard() {
  if (!artLayer) return;
  const keep = project.activeLayer; artLayer.removeChildren(); const z = view.zoom; VX.boardLabels = [];
  const accent = cssVar('--accent'), lab = cssVar('--tx-2');
  DOC.boards.forEach((b, i) => {
    const r = new P.Rectangle(b.x, b.y, b.w, b.h);
    new P.Path.Rectangle({ rectangle: new P.Rectangle(r.point.add([3 / Math.max(z, 0.3), 4 / Math.max(z, 0.3)]), r.size), fillColor: new P.Color(0, 0, 0, 0.35), parent: artLayer });
    if (!b.bg || b.bg === 'transparent') { new P.Path.Rectangle({ rectangle: r, fillColor: '#ffffff', parent: artLayer }); }
    else new P.Path.Rectangle({ rectangle: r, fillColor: b.bg, parent: artLayer });
    if (O.grid) { const g = new P.Group({ parent: artLayer }); const step = O.gridSize; if (r.width / step < 400 && r.height / step < 400) { for (let x = step; x < b.w; x += step) g.addChild(new P.Path.Line({ from: [b.x + x, b.y], to: [b.x + x, b.y + b.h], strokeColor: (x / step) % 5 ? '#e8eaf0' : '#cdd2de', strokeWidth: 1 / z })); for (let y = step; y < b.h; y += step) g.addChild(new P.Path.Line({ from: [b.x, b.y + y], to: [b.x + b.w, b.y + y], strokeColor: (y / step) % 5 ? '#e8eaf0' : '#cdd2de', strokeWidth: 1 / z })); } }
    if (O.boardNames || DOC.boards.length > 1 || O.tool === 'artboard') {
      const t = new P.PointText({ point: [b.x, b.y - 6 / z], content: `${i + 1}  ${b.name}${b.locked ? '  🔒' : ''}${b.picked ? '  ✓ export' : ''}`, fontSize: 11 / z, fontFamily: 'Segoe UI, Inter, sans-serif', fillColor: i === DOC.ab ? accent : lab, parent: artLayer });
      const lr = t.bounds.expand(3 / z); if (lr.bottom > b.y - 2 / z) lr.height = Math.max(1 / z, b.y - 2 / z - lr.y); VX.boardLabels.push({ i, rect: lr });
      if (i === DOC.ab && (DOC.boards.length > 1 || O.tool === 'artboard')) new P.Path.Rectangle({ rectangle: r.expand(1 / z), strokeColor: accent, strokeWidth: 1.5 / z, parent: artLayer });
    }
  });
  $('#stArt').textContent = `${DOC.boards[DOC.ab]?.name || 'Artboard'} · ${DOC.w} × ${DOC.h} px` + (DOC.boards.length > 1 ? ` · ${DOC.ab + 1}/${DOC.boards.length}` : '');
  if (keep && !isSys(keep)) keep.activate(); else activateUserLayer();
}
function activateUserLayer() { const a = project.activeLayer; if (!a || isSys(a) || !a.parent) { const u = userLayers(); (u[u.length - 1] || newUserLayer()).activate(); } }
let layerN = 1;
function newUserLayer(name) { const l = new P.Layer({ name: name || `Layer ${layerN++}` }); project.insertLayer(guideLayer ? guideLayer.index : project.layers.length, l); l.activate(); return l; }
function newSubLayer() { const parent = project.activeLayer && !isSys(project.activeLayer) ? project.activeLayer : userLayers()[0]; const l = new P.Layer({ name: `Sublayer ${layerN++}`, insert: false }); parent.addChild(l); l.activate(); return l; }

// ---------------------------------------------------------------- state
const O = { tool: 'select', fill: '#ffffff', stroke: '#000000', sw: 1, front: 'fill', grid: false, snap: false, gridSize: 20, outline: false,
  smart: true, snapPoint: true, snapPixel: false, rulers: true, showGuides: true, lockGuides: false,
  font: 'Segoe UI', fontSize: 36, fontWeight: 'normal', fontStyle: 'normal', justify: 'left', leading: 1.2, tracking: 0,
  radius: 0, sides: 6, starRatio: 0.5, brushW: 4, smooth: 8, alignTo: 'auto',
  snapGuides: true, snapTangent: true, snapPerp: true, snapColor: false, snapTol: 6, taskbar: true, boardNames: true };
VX.O = O;
let sel = []; let selSegs = [];

// ---------------------------------------------------------------- menus
const F = (name, ...a) => () => { const fn = VX.f[name]; if (fn) return fn(...a); toast('Feature not loaded: ' + name, 'err'); };
VX.F = F;
UI.titlebar({ logo: 'Vc', menus: [
  { label: 'File', items: () => [
    { label: 'New…', kbd: 'Ctrl+N', action: newDialog }, { label: 'New from template…', action: () => newDialog(true) }, { label: 'Open…', kbd: 'Ctrl+O', action: openDialog }, { label: 'Open SVG…', action: () => openDialog(['svg']) }, { label: 'Open PDF, Illustrator or EPS as vectors…', action: F('openVectorDialog') }, { label: 'Open DXF…', action: F('openDXFDialog') }, { label: 'Place image…', kbd: 'Ctrl+Shift+P', action: placeImage }, { label: 'Place PDF, AI or EPS as vectors…', action: F('placeVectorDialog') }, { label: 'Place DXF…', action: F('placeDXFDialog') }, '-',
    { label: 'Save (.btsv)', kbd: 'Ctrl+S', action: () => save(false) }, { label: 'Save as…', kbd: 'Ctrl+Shift+S', action: () => save(true) },
    { label: 'Export', sub: [{ label: 'Export…', kbd: 'Ctrl+Alt+E', action: () => exportDialog() }, '-', { label: 'SVG…', action: () => exportDialog('svg') }, { label: 'PNG…', action: () => exportDialog('png') }, { label: 'JPEG…', action: () => exportDialog('jpeg') }, { label: 'WebP…', action: () => exportDialog('webp') }, { label: 'PDF (vector)…', action: () => exportDialog('pdf') }, { label: 'DXF for laser cutters and CNC…', action: F('dxfExportDialog') }, '-',
      { label: 'Export selection…', action: () => exportDialog('png', 'selection') }, { label: 'Export all artboards…', action: () => exportDialog('png', 'all') }, { label: 'Export selected artboards…', action: () => exportDialog('png', 'selected') }, { label: 'Multi-page PDF (all artboards)…', action: () => exportDialog('pdf', 'all') }, { label: 'PNG with gradient dithering…', action: () => exportDialog('png', null, { dither: true }) }] },
    { label: 'Send to', sub: [{ label: 'Send to Photo', action: F('sendTo', 'photo') }, { label: 'Send to Video', action: F('sendTo', 'video') }, { label: 'Send to PDF Pro', action: F('sendTo', 'pdf') }] },
    { label: 'Copy as SVG', kbd: 'Ctrl+Alt+C', action: copyAsSVG }, '-', { label: 'Recover autosaved document…', action: F('recoverDialog') }, { label: 'Autosave settings…', action: F('autosaveDialog') }, '-',
    { label: 'Document setup…', kbd: 'Ctrl+Alt+P', action: docSetup }, '-', { label: 'BTS Creative home', action: () => bts.openApp('home') }, { label: 'Close window', kbd: 'Ctrl+W', action: closeWindow } ] },
  { label: 'Edit', items: () => [
    { label: 'Undo', kbd: 'Ctrl+Z', action: undo, disabled: hi <= 0 }, { label: 'Redo', kbd: 'Ctrl+Shift+Z', action: redo, disabled: hi >= hist.length - 1 }, '-',
    { label: 'Cut', kbd: 'Ctrl+X', action: cut }, { label: 'Copy', kbd: 'Ctrl+C', action: copy }, { label: 'Paste', kbd: 'Ctrl+V', action: () => paste(false) }, { label: 'Paste in place', kbd: 'Ctrl+Shift+V', action: () => paste(true) },
    { label: 'Duplicate', kbd: 'Ctrl+D', action: duplicate }, { label: 'Delete', kbd: 'Del', action: deleteSel }, '-',
    { label: 'Select all', kbd: 'Ctrl+A', action: selectAll }, { label: 'Select all on artboard', kbd: 'Ctrl+Alt+A', action: selectAllOnBoard }, { label: 'Deselect', kbd: 'Ctrl+Shift+A', action: () => setSel([]) }, { label: 'Select inverse', action: selectInverse },
    { label: 'Select same fill color', action: () => selectSame('fill') }, { label: 'Select same stroke color', action: () => selectSame('stroke') }, '-',
    { label: 'Recolor artwork…', action: F('recolor') }, { label: 'Edit colors', sub: [{ label: 'Invert colors', action: F('adjustColors', 'invert') }, { label: 'Convert to grayscale', action: F('adjustColors', 'gray') }, { label: 'Saturate…', action: F('adjustColors', 'saturate') }, { label: 'Blend front to back', action: F('adjustColors', 'blendFB') }] } ] },
  { label: 'Object', items: () => [
    { label: 'Transform', sub: [{ label: 'Move…', kbd: 'Shift+Ctrl+M', action: moveDialog }, { label: 'Rotate…', action: rotateDialog }, { label: 'Scale…', action: scaleDialog }, { label: 'Reflect horizontal', action: () => reflect('h') }, { label: 'Reflect vertical', action: () => reflect('v') }, { label: 'Transform each…', action: F('transformEach') }] },
    { label: 'Arrange', sub: [{ label: 'Bring to front', kbd: 'Ctrl+Shift+]', action: () => arrange('front') }, { label: 'Bring forward', kbd: 'Ctrl+]', action: () => arrange('fwd') }, { label: 'Send backward', kbd: 'Ctrl+[', action: () => arrange('back') }, { label: 'Send to back', kbd: 'Ctrl+Shift+[', action: () => arrange('bottom') }] },
    { label: 'Align', sub: [['alignL', 'Left'], ['alignC', 'Horizontal centre'], ['alignR', 'Right'], ['alignT', 'Top'], ['alignM', 'Vertical centre'], ['alignB', 'Bottom']].map(([k, l]) => ({ label: 'Align ' + l, action: () => align(k) })).concat(['-', { label: 'Distribute horizontal centres', action: () => distribute('h') }, { label: 'Distribute vertical centres', action: () => distribute('v') }, { label: 'Distribute spacing…', action: spacingDialog },
      '-', { label: 'Align to selection', checked: () => O.alignTo === 'selection', action: () => { O.alignTo = 'selection'; renderProps(); } }, { label: 'Align to key object', checked: () => O.alignTo === 'key', action: () => { O.alignTo = 'key'; renderProps(); } }, { label: 'Align to artboard', checked: () => O.alignTo === 'artboard', action: () => { O.alignTo = 'artboard'; renderProps(); } }]) },
    '-', { label: 'Group', kbd: 'Ctrl+G', action: group }, { label: 'Ungroup', kbd: 'Ctrl+Shift+G', action: ungroup },
    { label: 'Lock selection', kbd: 'Ctrl+2', action: lockSel }, { label: 'Unlock all', kbd: 'Ctrl+Alt+2', action: unlockAll }, { label: 'Hide selection', kbd: 'Ctrl+3', action: hideSel }, { label: 'Show all', kbd: 'Ctrl+Alt+3', action: showAll },
    { label: 'Enter isolation mode', action: () => enterIsolation(sel[0]), disabled: !(sel[0] instanceof P.Group) }, { label: 'Exit isolation mode', action: exitIsolation, disabled: !VX.iso },
    '-', { label: 'Expand appearance', action: F('expandAppearance') }, { label: 'Expand (outline strokes)', action: F('outlineStroke') },
    { label: 'Path', sub: [{ label: 'Join', kbd: 'Ctrl+J', action: joinPaths }, { label: 'Average anchors…', action: F('averageAnchors') }, { label: 'Outline stroke', action: F('outlineStroke') }, { label: 'Offset path…', action: F('fx', 'offset') }, { label: 'Simplify…', action: F('simplifyDialog') }, { label: 'Smooth…', action: F('smoothDialog') }, { label: 'Add anchor points', action: F('addAnchors') }, { label: 'Round corners…', action: F('roundCornersDialog') }, { label: 'Flatten curves', action: () => pathOp('flatten') }, { label: 'Reverse direction', action: () => pathOp('reverse') }, { label: 'Close path', action: () => pathOp('close') }, { label: 'Split into grid…', action: F('splitGrid') }] },
    { label: 'Shape', sub: [{ label: 'Spiral…', action: F('shape', 'spiral') }, { label: 'Flare…', action: F('shape', 'flare') }, { label: 'Polygon…', action: F('shape', 'polygon') }, { label: 'Star…', action: F('shape', 'star') }, { label: 'Rounded rectangle…', action: F('shape', 'rrect') }] },
    { label: 'Objects on path…', action: F('objectsOnPath') }, { label: 'Mockup…', action: F('mockup') },
    { label: 'Gradient', sub: [{ label: 'Gradient presets…', action: F('gradientPresets') }, '-', ...[['srgb', 'Blend in sRGB (classic)'], ['linear', 'Blend in linear light'], ['oklab', 'Blend perceptually (OKLab)']].map(([k, l]) => ({ label: l, checked: () => (VX.gradState?.blend || 'srgb') === k, action: F('gradientBlend', k) })), '-', { label: 'Gradient panel', action: () => showTab('color') }] },
    { label: 'Repeat', sub: [{ label: 'Radial…', action: F('repeat', 'radial') }, { label: 'Grid…', action: F('repeat', 'grid') }, { label: 'Mirror…', action: F('repeat', 'mirror') }, { label: 'Repeat options…', action: F('editLive') }, { label: 'Release repeat', action: F('expandAppearance') }] },
    { label: 'Blend', sub: [{ label: 'Make (between two objects)…', kbd: 'Ctrl+Alt+B', action: F('blendMake') }, { label: 'Blend options…', action: F('editLive') }, { label: 'Expand blend', action: F('expandAppearance') }, { label: 'Release blend', action: F('blendRelease') }] },
    { label: 'Envelope distort', sub: [{ label: 'Make with warp…', kbd: 'Ctrl+Alt+Shift+W', action: F('fx', 'warp') }, { label: 'Free distort…', action: F('fx', 'freeDistort') }] },
    { label: 'Image trace', sub: [{ label: 'Make (trace image)…', action: F('trace') }, { label: 'Trace with preset', sub: ['Black & white logo', 'Sketched art', '3 colours', '6 colours', '16 colours', 'Grayscale', 'Silhouette'].map(p => ({ label: p, action: F('trace', p) })) }] },
    { label: 'Compound path', sub: [{ label: 'Make', kbd: 'Ctrl+8', action: makeCompound }, { label: 'Release', kbd: 'Ctrl+Alt+Shift+8', action: releaseCompound }] },
    { label: 'Clipping mask', sub: [{ label: 'Make', kbd: 'Ctrl+7', action: makeClip }, { label: 'Release', kbd: 'Ctrl+Alt+7', action: ungroup }] },
    { label: 'Opacity mask', sub: [{ label: 'Make opacity mask', action: F('opacityMask', false) }, { label: 'Make inverted opacity mask', action: F('opacityMask', true) }, { label: 'Mask options…', action: F('editLive') }, { label: 'Release opacity mask', action: F('releaseOpacityMask') }] },
    { label: 'Pathfinder', sub: [['unite', 'Unite'], ['subtract', 'Minus front'], ['intersect', 'Intersect'], ['exclude', 'Exclude'], '-', ['divide', 'Divide'], ['trim', 'Trim'], ['merge', 'Merge'], ['crop', 'Crop'], ['outline', 'Outline'], ['minusBack', 'Minus back']].map(x => x === '-' ? '-' : ({ label: x[1], action: () => pathfinder(x[0]) })) },
    { label: 'Symbols', sub: [{ label: 'New symbol from selection', kbd: 'F8', action: F('newSymbol') }, { label: 'Redefine symbol', action: F('redefineSymbol') }, { label: 'Break link to symbol', action: F('breakSymbol') }, { label: 'Show symbols library', action: () => showTab('symbols') }] },
    { label: 'Pattern', sub: [{ label: 'Pattern maker (generate from selection)…', action: F('patternMaker') }, { label: 'Make pattern swatch from selection', action: F('patternFromSel') }, { label: 'Apply pattern…', action: () => showTab('color') }] },
    '-', { label: 'Artboards', sub: [{ label: 'New artboard', action: () => addBoard() }, { label: 'Duplicate artboard', action: () => duplicateBoard() }, { label: 'Delete artboard', action: () => deleteBoard() }, { label: 'Rename artboard…', action: () => renameBoard() }, { label: 'Fit artboard to artwork', action: fitBoardToArt }, { label: 'Fit artboard to selection', action: fitBoardToSel }, { label: 'Rearrange all artboards…', action: rearrangeBoards }, '-', { label: 'Lock artboard', checked: () => !!DOC.boards[DOC.ab]?.locked, action: () => toggleBoardLock() }, { label: 'Artboard background colour…', action: boardBgDialog }, { label: 'Select artboard for export', checked: () => !!DOC.boards[DOC.ab]?.picked, action: () => { const b = DOC.boards[DOC.ab]; b.picked = !b.picked; renderRight(); } }, { label: 'Show artboard names on canvas', checked: () => O.boardNames, action: () => { O.boardNames = !O.boardNames; drawArtboard(); } }, { label: 'Artboards panel', action: () => showTab('boards') }] },
    { label: 'Rasterize to image', action: rasterizeSel } ] },
  { label: 'Type', items: () => [
    { label: 'Character panel', kbd: 'Ctrl+T', action: () => showTab('type') }, { label: 'Font browser…', kbd: 'Ctrl+Alt+T', action: () => showTab('fonts') }, { label: 'Type on a path', action: F('typeOnPath') }, { label: 'Text on a circle…', action: F('textOnCircle') }, { label: 'Edit type on path…', action: F('editLive') }, '-',
    { label: 'Create outlines', kbd: 'Ctrl+Shift+O', action: F('createOutlines') }, { label: 'Warp text…', action: F('warpText') }, '-',
    { label: 'Bold', action: F('typeStyle', 'bold') }, { label: 'Italic', action: F('typeStyle', 'italic') }, { label: 'Align left', action: F('typeStyle', 'left') }, { label: 'Align centre', action: F('typeStyle', 'center') }, { label: 'Align right', action: F('typeStyle', 'right') },
    { label: 'Font size up', kbd: 'Ctrl+Shift+.', action: () => bumpFont(2) }, { label: 'Font size down', kbd: 'Ctrl+Shift+,', action: () => bumpFont(-2) }, { label: 'Rasterize type', action: rasterizeSel }] },
  { label: 'Effect', items: () => [
    { label: 'Distort & Transform', sub: [{ label: 'Roughen…', action: F('fx', 'roughen') }, { label: 'Zig zag…', action: F('fx', 'zigzag') }, { label: 'Pucker & bloat…', action: F('fx', 'pucker') }, { label: 'Twist…', action: F('fx', 'twist') }, { label: 'Tweak…', action: F('fx', 'tweak') }, { label: 'Free distort…', action: F('fx', 'freeDistort') }, { label: 'Transform…', action: F('fx', 'transform') }] },
    { label: 'Warp', sub: ['Arc', 'Arch', 'Bulge', 'Flag', 'Wave', 'Fish', 'Rise', 'Fisheye', 'Inflate', 'Squeeze', 'Twist'].map(s => ({ label: s + '…', action: F('fx', 'warp', s) })) },
    { label: 'Path', sub: [{ label: 'Offset path…', action: F('fx', 'offset') }, { label: 'Round corners…', action: F('fx', 'round') }, { label: 'Outline stroke', action: F('outlineStroke') }] },
    { label: '3D', sub: [{ label: 'Extrude & Bevel…', action: F('fx', 'extrude') }, { label: 'Turntable preview (spin 360°)…', action: F('fx', 'extrude', 'turntable') }, { label: 'Expand 3D to paths', action: F('expandAppearance') }] },
    { label: 'Stylize', sub: [{ label: 'Drop shadow…', action: F('shadowDialog') }, { label: 'Outer glow…', action: F('glowDialog') }, { label: 'Gaussian blur…', action: F('fx', 'blur') }, { label: 'Remove shadow / glow', action: F('removeShadow') }] },
    '-', { label: 'Edit effects on selection…', action: F('editLive') }, { label: 'Expand appearance', action: F('expandAppearance') }] },
  { label: 'View', items: () => [
    { label: 'Zoom in', kbd: 'Ctrl++', action: () => zoomAt(1.25) }, { label: 'Zoom out', kbd: 'Ctrl+-', action: () => zoomAt(0.8) }, { label: 'Fit artboard in window', kbd: 'Ctrl+0', action: fitArt }, { label: 'Fit all artboards', kbd: 'Ctrl+Alt+0', action: fitAll }, { label: 'Zoom to selection', kbd: 'Ctrl+Alt+Shift+0', action: zoomToSel }, { label: 'Actual size', kbd: 'Ctrl+1', action: () => { view.zoom = 1; afterView(); } }, '-',
    { label: 'Outline mode', kbd: 'Ctrl+Y', checked: () => O.outline, action: toggleOutline },
    { label: 'Rulers', kbd: 'Ctrl+R', checked: () => O.rulers, action: toggleRulers },
    { label: 'Guides', sub: [{ label: 'Show guides', kbd: 'Ctrl+;', checked: () => O.showGuides, action: () => { O.showGuides = !O.showGuides; drawGuides(); } }, { label: 'Lock guides', checked: () => O.lockGuides, action: () => { O.lockGuides = !O.lockGuides; } }, { label: 'Add guide…', action: addGuideDialog }, { label: 'Make guides from selection', kbd: 'Ctrl+5', action: guidesFromSel }, { label: 'Clear guides', action: () => { DOC.guides = []; drawGuides(); commit('Clear guides'); } }] },
    { label: 'Show grid', kbd: "Ctrl+'", checked: () => O.grid, action: () => { O.grid = !O.grid; drawArtboard(); } },
    '-', { label: 'Smart guides', kbd: 'Ctrl+U', checked: () => O.smart, action: () => { O.smart = !O.smart; } },
    { label: 'Snapping', sub: [{ label: 'Snap to grid', kbd: "Ctrl+Shift+'", checked: () => O.snap, action: () => { O.snap = !O.snap; } },
      { label: 'Snap to point', kbd: 'Ctrl+Alt+\'', checked: () => O.snapPoint, action: () => { O.snapPoint = !O.snapPoint; } },
      { label: 'Snap to pixel', checked: () => O.snapPixel, action: () => { O.snapPixel = !O.snapPixel; } },
      { label: 'Snap to guides', checked: () => O.snapGuides, action: () => { O.snapGuides = !O.snapGuides; } },
      '-', { label: 'Tangent snapping (lines to curves)', checked: () => O.snapTangent, action: () => { O.snapTangent = !O.snapTangent; } },
      { label: 'Perpendicular snapping', checked: () => O.snapPerp, action: () => { O.snapPerp = !O.snapPerp; } },
      { label: 'Colour snapping (nearest swatch for new fills)', checked: () => O.snapColor, action: () => { O.snapColor = !O.snapColor; toast('Colour snapping ' + (O.snapColor ? 'on' : 'off')); } },
      '-', { label: 'Snapping options…', action: F('snapOptions') }] },
    { label: 'Contextual task bar', checked: () => O.taskbar, action: () => { O.taskbar = !O.taskbar; drawGuides(); } },
    { label: 'Artboard names', checked: () => O.boardNames, action: () => { O.boardNames = !O.boardNames; drawArtboard(); } },
    '-', { label: 'Appearance…', action: UI.appearanceDialog }, { label: 'Skin', sub: UI.SKINS.map(k => ({ label: k.name, checked: () => (UI.getSettings().skin || 'dark') === k.id, action: () => UI.setSettings({ skin: k.id }) })) } ] },
  { label: 'Window', items: () => [['props', 'Properties'], ['layers', 'Layers'], ['boards', 'Artboards'], ['color', 'Color, swatches & gradients'], ['type', 'Character'], ['fonts', 'Font browser'], ['symbols', 'Symbols & shapes library']].map(([t, l]) => ({ label: l, checked: () => rtab === t, action: () => showTab(t) })).concat(['-', { label: 'Tools', sub: TOOLS.map(([id, , tip, key]) => ({ label: tip.replace(/ \(.*\)$/, '') + ' tool', kbd: key || undefined, checked: () => O.tool === id, action: () => setTool(id) })) }]) },
  { label: 'Help', items: [{ label: 'Keyboard shortcuts', kbd: 'Ctrl+/', action: UI.shortcutSheet }, { label: 'Tool reference', action: shortcutsHelp }, { label: 'Check for updates', action: () => bts.update.check().then(r => toast(r.state === 'store' ? 'Updates are delivered by the Microsoft Store.' : r.state === 'dev' ? 'Updates run in the installed version.' : 'Checking for updates…')) }, { label: 'About BTS Vector', action: () => modal({ title: 'BTS Vector', body: 'Part of BTS Creative — free and open source for students.<br>Image trace by imagetracerjs (public domain), type outlines by opentype.js (MIT).<br>Not affiliated with Adobe Inc.' }) }] },
]});
window.addEventListener('bts:close', closeWindow);
window.addEventListener('bts:settings', () => setTimeout(() => { drawArtboard(); drawRulers(); }, 30));

// ---------------------------------------------------------------- toolbar
const TOOLS = [['select', 'select', 'Selection', 'V'], ['direct', 'direct', 'Direct selection', 'A'],
  ['pen', 'pen', 'Pen', 'P'], ['typePath', 'typePath', 'Type on a path', 'Shift+T'], ['text', 'text', 'Type', 'T'], ['pencil', 'pencil', 'Pencil (smoothing)', 'N'],
  ['brush', 'brush', 'Paintbrush (width profiles)', 'B'], ['blob', 'blob', 'Blob brush', 'Shift+B'],
  ['rect', 'rect', 'Rectangle', 'M'], ['ellipse', 'ellipse', 'Ellipse', 'L'], ['polygon', 'hexagon', 'Polygon', 'Shift+M'], ['star', 'star', 'Star', 'Shift+L'], ['line', 'line', 'Line segment', '\\'], ['spiral', 'spiral', 'Spiral', ''], ['flare', 'flare', 'Flare', ''],
  ['eraser', 'eraser', 'Eraser', 'Shift+E'], ['scissors', 'scissors', 'Scissors', 'C'], ['knife', 'knife', 'Knife', ''],
  ['rotate', 'rotateTool', 'Rotate (click = reference point)', 'R'], ['reflect', 'reflect', 'Reflect (click = reference point)', 'O'], ['scale', 'scale', 'Scale (click = reference point)', 'S'], ['width', 'width', 'Width (variable stroke)', 'Shift+W'], ['distort', 'distort', 'Free distort (drag corners)', 'Shift+D'],
  ['shapeBuilder', 'shapeBuilder', 'Shape builder (drag to merge, Alt to delete)', 'Shift+Q'], ['livePaint', 'livePaint', 'Live paint bucket', 'K'], ['blendTool', 'blend', 'Blend (click two objects)', 'W'], ['sprayer', 'sprayer', 'Symbol sprayer', 'Shift+S'],
  ['gradient', 'gradient', 'Gradient (edit on canvas)', 'G'], ['eyedrop', 'eyedrop', 'Eyedropper (copy appearance)', 'I'], ['measure', 'measure', 'Measure', 'Shift+I'], ['dimension', 'dimension', 'Dimension (linear / angular / radial)', 'Shift+K'],
  ['artboard', 'artboard', 'Artboard', 'Shift+O'], ['hand', 'hand', 'Hand', 'H'], ['zoom', 'zoom', 'Zoom', 'Z']];
const tb = $('#toolbar');
const toolGrid = h('div', { class: 'tool-grid' }); tb.append(toolGrid);
TOOLS.forEach(([id, ic, tip, key]) => toolGrid.append(h('button', { class: 'icon-btn', 'data-tool': id, 'data-tip': tip, 'data-key': key, html: vicon(ic), onclick: () => setTool(id) })));
const fsw = h('div', { class: 'fs' }, h('div', { class: 'sw fill', id: 'swFill', 'data-tip': 'Fill (click to edit, X to toggle)', onclick: () => { O.front = 'fill'; pickStyle('fill'); } }), h('div', { class: 'sw stroke', id: 'swStroke', 'data-tip': 'Stroke', onclick: () => { O.front = 'stroke'; pickStyle('stroke'); } }));
tb.append(fsw, h('div', { class: 'row', style: { gap: '2px', marginTop: '4px' } }, h('button', { class: 'icon-btn mini', 'data-tip': 'None (/)', onclick: () => applyColor(null) }, '⌀'), h('button', { class: 'icon-btn mini', 'data-tip': 'Swap (Shift+X)', onclick: swapFS }, '⇄'), h('button', { class: 'icon-btn mini', 'data-tip': 'Default fill & stroke (D)', onclick: () => { O.fill = '#ffffff'; O.stroke = '#000000'; O.sw = 1; applyStyleToSel(); renderFS(); } }, '◩')));
const keyTools = { v: 'select', a: 'direct', p: 'pen', 'shift+t': 'typePath', n: 'pencil', b: 'brush', 'shift+b': 'blob', t: 'text', m: 'rect', l: 'ellipse', 'shift+m': 'polygon', 'shift+l': 'star', '\\': 'line', 'shift+e': 'eraser', c: 'scissors', r: 'rotate', o: 'reflect', s: 'scale', 'shift+w': 'width', 'shift+d': 'distort', 'shift+q': 'shapeBuilder', k: 'livePaint', w: 'blendTool', 'shift+s': 'sprayer', i: 'eyedrop', 'shift+i': 'measure', 'shift+k': 'dimension', g: 'gradient', 'shift+o': 'artboard', h: 'hand', z: 'zoom' };
Object.entries(keyTools).forEach(([k, t]) => UI.shortcut(k, () => setTool(t)));
UI.shortcut('x', () => { O.front = O.front === 'fill' ? 'stroke' : 'fill'; renderFS(); }); UI.shortcut('shift+x', swapFS); UI.shortcut('/', () => applyColor(null)); UI.shortcut('d', () => { O.fill = '#ffffff'; O.stroke = '#000000'; O.sw = 1; applyStyleToSel(); renderFS(); });
function applyStyleToSel() { if (!sel.length) return; sel.forEach(it => eachStyled(it, i => { if (i instanceof P.Raster) return; i.fillColor = O.fill; i.strokeColor = O.stroke; i.strokeWidth = O.sw; })); commit('Default colors'); }
function setTool(t) {
  finishPen(); finishText(true);
  const prev = VX.tools[O.tool]; prev?.deactivate?.();
  O.tool = t; tb.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  if (t !== 'direct') { selSegs.forEach(s => s.selected = false); sel.forEach(i => i.fullySelected = false); }
  if (t === 'direct') sel.forEach(i => { if (!(i instanceof P.Raster) && !(i instanceof P.PointText)) i.fullySelected = true; });
  VX.tools[t]?.activate?.();
  renderOptions(); updateCursor(); drawArtboard(); drawGuides();
}
function updateCursor() { const tt = VX.tools[O.tool]; cv.style.cursor = tt?.cursor || { hand: 'grab', zoom: 'zoom-in', text: 'text', select: 'default', direct: 'default' }[O.tool] || 'crosshair'; }
function renderFS() {
  const f = $('#swFill'), s = $('#swStroke'); const fill = selStyle('fill'), stroke = selStyle('stroke');
  f.classList.toggle('none', fill === null); f.style.background = fill === 'gradient' ? 'linear-gradient(135deg,#ff9a00,#9a7bff)' : (fill || ''); s.classList.toggle('none', stroke === null); s.style.borderColor = stroke === 'gradient' ? '#9a7bff' : (stroke || '#fff');
  f.classList.toggle('front', O.front === 'fill'); s.classList.toggle('front', O.front === 'stroke');
}
function swapFS() { [O.fill, O.stroke] = [O.stroke, O.fill]; sel.forEach(it => eachStyled(it, i => { const f = i.fillColor, s = i.strokeColor; i.fillColor = s; i.strokeColor = f; if (f && !i.strokeWidth) i.strokeWidth = O.sw || 1; })); renderFS(); if (sel.length) commit('Swap fill/stroke'); renderProps(); }
async function pickStyle(which) {
  const cur = selStyle(which) || (which === 'fill' ? O.fill : O.stroke) || '#000000';
  if (VX.f.colorDialog) { const r = await VX.f.colorDialog(cur === 'gradient' ? '#000000' : cur, which === 'fill' ? 'Fill color' : 'Stroke color', true); if (r === undefined) return; O.front = which; applyColor(r); return; }
  const inp = h('input', { type: 'color', value: toHex(cur), style: { width: '100%', height: '110px' } });
  const noneCb = h('input', { type: 'checkbox', checked: selStyle(which) === null });
  const r = await modal({ title: which === 'fill' ? 'Fill color' : 'Stroke color', body: h('div', {}, inp, h('label', { class: 'row', style: { marginTop: '10px' } }, noneCb, 'None')), buttons: [{ label: 'Cancel', value: null }, { label: 'OK', primary: true, value: 'ok' }] });
  if (r !== 'ok') return; O.front = which; applyColor(noneCb.checked ? null : inp.value);
}
function applyColor(c, which = O.front, opts = {}) {
  if (which === 'fill') O.fill = c; else O.stroke = c;
  if (sel.length) { sel.forEach(it => eachStyled(it, i => { if (i instanceof P.Raster) return; if (which === 'fill') { i.fillColor = c; if (i.data?.gsw) delete i.data.gsw.fill; } else { i.strokeColor = c; if (c && !i.strokeWidth) i.strokeWidth = O.sw || 1; if (i.data?.gsw) delete i.data.gsw.stroke; } if (opts.swatch) { i.data.gsw = i.data.gsw || {}; i.data.gsw[which] = opts.swatch; } })); opts.debounce ? commitDebounced('Color') : commit('Color'); }
  renderFS(); if (!opts.keepPanel) renderRight();
}
function eachStyled(it, fn) {
  const L = it.data?.live && VX.live[it.data.live.kind];
  if (L?.styleTargets) { L.styleTargets(it).forEach(c => eachStyled(c, fn)); return; }
  if (it instanceof P.Group) (it.clipped ? it.children.slice(1) : it.children).forEach(c => eachStyled(c, fn)); else fn(it);
}
function firstStyled(it) { let r = null, rv = null; eachStyled(it, i => { if (!r) r = i; if (!rv && i.visible) rv = i; }); return rv || r; }
function selStyle(which) {
  if (!sel.length) return which === 'fill' ? O.fill : O.stroke;
  const i = firstStyled(sel[0]); if (!i) return null; const c = which === 'fill' ? i.fillColor : i.strokeColor;
  if (!c) return null; if (c.gradient) return 'gradient'; return c.toCSS(true);
}
const toHex = c => { if (!c || c === 'gradient') return '#000000'; if (c.startsWith && c.startsWith('#') && c.length === 7) return c; try { return new P.Color(c).toCSS(true); } catch { return '#000000'; } };

// ---------------------------------------------------------------- options bar
function renderOptions() {
  const ob = $('#optbar'); ob.innerHTML = '';
  const grp = (...k) => h('div', { class: 'grp' }, ...k), vsep = () => h('div', { class: 'vsep' });
  const num = (label, key, min, max, step = 1, cb) => { const i = h('input', { type: 'number', min, max, step, value: O[key], style: { width: '60px' } }); i.oninput = () => { O[key] = clamp(+i.value, min, max); cb && cb(); }; return grp(label, i); };
  VX.optNum = num; VX.optGrp = grp;
  if (VX.iso) ob.append(h('div', { class: 'iso-bar' }, '◧ Isolation: ' + (VX.iso.name || 'Group'), h('button', { class: 'btn sm', onclick: exitIsolation }, 'Exit')), vsep());
  const t = O.tool;
  const fillI = h('input', { type: 'color', value: toHex(O.fill) }); fillI.oninput = () => applyColor(fillI.value, 'fill', { debounce: true, keepPanel: true });
  const strokeI = h('input', { type: 'color', value: toHex(O.stroke) }); strokeI.oninput = () => applyColor(strokeI.value, 'stroke', { debounce: true, keepPanel: true });
  ob.append(grp('Fill', fillI), grp('Stroke', strokeI), num('Weight', 'sw', 0, 200, 0.5, () => { if (sel.length) { sel.forEach(it => eachStyled(it, i => i.strokeWidth = O.sw)); commitDebounced('Stroke weight'); } }), vsep());
  const tt = VX.tools[t];
  if (tt?.options) { const r = tt.options(); if (r) ob.append(...[].concat(r)); }
  else if (t === 'rect') ob.append(num('Corner radius', 'radius', 0, 1000));
  else if (t === 'polygon') ob.append(num('Sides', 'sides', 3, 40));
  else if (t === 'star') ob.append(num('Points', 'sides', 3, 40), num('Inner %', 'starRatio', 0.1, 0.95, 0.05));
  else if (t === 'pencil') ob.append(num('Smoothness', 'smooth', 0, 50), h('span', { class: 'muted' }, 'Higher = smoother curves; close near the start to fill'));
  else if (t === 'text') ob.append(h('span', { class: 'muted' }, 'Click to type · set font, size, tracking and leading in the Character panel (Ctrl+T)'), h('button', { class: 'btn sm', onclick: () => showTab('type') }, 'Character…'));
  else if (t === 'pen') ob.append(h('span', { class: 'muted' }, 'Click for corners, drag for curves, click the first point to close, Enter to finish'));
  else if (t === 'direct') ob.append(h('span', { class: 'muted' }, 'Drag anchors / handles · Alt+click adds a point · drag the ◉ widget to round selected corners · double-click toggles smooth'));
  else if (t === 'scissors') ob.append(h('span', { class: 'muted' }, 'Click on a path to cut it'));
  else if (t === 'select' && sel.length) ob.append(...['alignL', 'alignC', 'alignR', 'alignT', 'alignM', 'alignB'].map(a => h('button', { class: 'icon-btn', 'data-tip': 'Align', html: UI.icon(a), onclick: () => align(a) })), vsep(), h('button', { class: 'btn sm', onclick: group }, 'Group'), h('button', { class: 'btn sm', onclick: ungroup }, 'Ungroup'));
}
function bumpFont(d) { sel.filter(i => i instanceof P.PointText).forEach(t => t.fontSize = Math.max(1, t.fontSize + d)); commit('Font size'); drawGuides(); }

// ---------------------------------------------------------------- right panel
let rtab = 'props';
const TABS = [['props', 'Props'], ['layers', 'Layers'], ['boards', 'Boards'], ['color', 'Color'], ['type', 'Type'], ['fonts', 'Fonts'], ['symbols', 'Symbols']];
$('#rtabs').innerHTML = ''; TABS.forEach(([t, l]) => $('#rtabs').append(h('div', { class: 'tab' + (t === rtab ? ' active' : ''), 'data-t': t }, l)));
$('#rtabs').addEventListener('click', e => { const t = e.target.closest('.tab'); if (!t) return; showTab(t.dataset.t); });
function showTab(t) { rtab = t; document.querySelectorAll('#rtabs .tab').forEach(x => x.classList.toggle('active', x.dataset.t === t)); renderRight(); }
UI.shortcut('ctrl+t', () => showTab('type')); UI.shortcut('ctrl+alt+t', () => showTab('fonts')); UI.shortcut('f7', () => showTab('layers'));
function renderRight() { if (rtab === 'props') renderProps(); else if (rtab === 'layers') renderLayersPanel(); else if (rtab === 'boards') renderBoardsPanel(); else if (VX.tabs[rtab]) { const rp = $('#rp'); const st = rp.scrollTop; rp.innerHTML = ''; VX.tabs[rtab](rp); rp.scrollTop = st; } }
const sec = (title, ...kids) => h('div', { class: 'sec' }, h('h4', {}, title), ...kids);
VX.sec = sec;
function renderProps() {
  if (rtab !== 'props') return; const rp = $('#rp'); const st = rp.scrollTop; rp.innerHTML = '';
  if (!sel.length) {
    const w = h('input', { type: 'number', value: DOC.w }), hh = h('input', { type: 'number', value: DOC.h });
    const bg = h('input', { type: 'color', value: toHex(DOC.bg && DOC.bg !== 'transparent' ? DOC.bg : '#ffffff') }); bg.oninput = () => { DOC.bg = bg.value; drawArtboard(); commitDebounced('Artboard color'); };
    const apply = () => { DOC.w = clamp(+w.value, 1, 20000); DOC.h = clamp(+hh.value, 1, 20000); drawArtboard(); commit('Artboard size'); };
    w.onchange = apply; hh.onchange = apply;
    rp.append(sec('Artboard — ' + (DOC.boards[DOC.ab]?.name || ''), h('div', { class: 'grid2' }, h('label', {}, 'W', w), h('label', {}, 'H', hh)), h('div', { class: 'colrow', style: { marginTop: '8px' } }, h('span', { class: 'lbl' }, 'Colour'), bg, h('button', { class: 'btn sm', onclick: () => { DOC.bg = 'transparent'; drawArtboard(); commit('Transparent artboard'); } }, 'Transparent'))),
      sec('Quick actions', h('div', { class: 'row', style: { flexWrap: 'wrap' } }, h('button', { class: 'btn sm', onclick: docSetup }, 'Document setup'), h('button', { class: 'btn sm', onclick: () => addBoard() }, '+ Artboard'), h('button', { class: 'btn sm', onclick: () => { O.grid = !O.grid; drawArtboard(); } }, 'Toggle grid'), h('button', { class: 'btn sm', onclick: () => exportDialog('svg') }, 'Export SVG'), h('button', { class: 'btn sm', onclick: () => exportDialog('png') }, 'Export PNG'), h('button', { class: 'btn sm', onclick: () => exportDialog('pdf') }, 'Export PDF'), h('button', { class: 'btn sm', onclick: F('recolor') }, 'Recolor artwork'))));
    VX.propSections.forEach(fn => { const el = fn([]); if (el) rp.append(el); });
    rp.scrollTop = st; return;
  }
  const b = selBounds();
  const mkNum = (val, fn) => { const i = h('input', { type: 'number', value: Math.round(val * 100) / 100, step: 1 }); i.onchange = () => { fn(+i.value); commit('Transform'); drawGuides(); renderProps(); }; return i; };
  rp.append(sec('Transform', h('div', { class: 'grid2' },
    h('label', {}, 'X', mkNum(b.x - abRect().x, v => moveSel(v - (selBounds().x - abRect().x), 0))), h('label', {}, 'Y', mkNum(b.y - abRect().y, v => moveSel(0, v - (selBounds().y - abRect().y)))),
    h('label', {}, 'W', mkNum(b.width, v => { const c = selBounds(); sel.forEach(i => i.scale(v / (c.width || 1), 1, c.topLeft)); })),
    h('label', {}, 'H', mkNum(b.height, v => { const c = selBounds(); sel.forEach(i => i.scale(1, v / (c.height || 1), c.topLeft)); })),
    h('label', {}, '⟳', mkNum(0, v => { const c = selBounds().center; sel.forEach(i => i.rotate(v, c)); })), h('span', { class: 'muted', style: { fontSize: '11px', alignSelf: 'center' } }, 'Rotate by°')),
    h('div', { class: 'icons', style: { marginTop: '8px' } }, ...[['flipH', 'Flip horizontal', () => reflect('h')], ['flipV', 'Flip vertical', () => reflect('v')], ['rotateL', 'Rotate −90°', () => rotateSel(-90)], ['rotate', 'Rotate 90°', () => rotateSel(90)]].map(([ic, tip, fn]) => h('button', { class: 'icon-btn', 'data-tip': tip, html: UI.icon(ic), onclick: fn })))));
  const it = firstStyled(sel[0]);
  const fillSel = h('select', {}, ...[['solid', 'Solid'], ['none', 'None'], ['linear', 'Linear gradient'], ['radial', 'Radial gradient']].map(([v, l]) => h('option', { value: v }, l)));
  const fc = it?.fillColor; fillSel.value = !fc ? 'none' : fc.gradient ? (fc.gradient.radial ? 'radial' : 'linear') : 'solid';
  const fillC = h('input', { type: 'color', value: fc && !fc.gradient ? fc.toCSS(true) : toHex(O.fill) });
  const g1 = h('input', { type: 'color', value: fc?.gradient ? fc.gradient.stops[0].color.toCSS(true) : '#ff9a00' }), g2 = h('input', { type: 'color', value: fc?.gradient ? fc.gradient.stops[fc.gradient.stops.length - 1].color.toCSS(true) : '#9a7bff' });
  const applyFill = () => { const m = fillSel.value; sel.forEach(s => eachStyled(s, i => { if (i instanceof P.Raster) return; if (m === 'none') i.fillColor = null; else if (m === 'solid') i.fillColor = fillC.value; else { const bb = i.bounds; i.fillColor = { gradient: { stops: [g1.value, g2.value], radial: m === 'radial' }, origin: m === 'radial' ? bb.center : bb.leftCenter, destination: bb.rightCenter }; } })); renderFS(); commitDebounced('Fill'); };
  fillSel.onchange = () => { applyFill(); renderProps(); }; fillC.oninput = applyFill; g1.oninput = applyFill; g2.oninput = applyFill;
  const sc = it?.strokeColor; const strokeOn = h('input', { type: 'checkbox', checked: !!sc }); const strokeC = h('input', { type: 'color', value: sc && !sc.gradient ? sc.toCSS(true) : '#000000' });
  const swI = h('input', { type: 'number', min: 0, step: 0.5, value: it?.strokeWidth ?? 1, style: { width: '60px' } });
  const dash = h('select', {}, h('option', { value: '' }, 'Solid'), h('option', { value: '8,6' }, 'Dashed'), h('option', { value: '1,4' }, 'Dotted'), h('option', { value: '16,6,2,6' }, 'Dash-dot')); dash.value = (it?.dashArray || []).join(',');
  const cap = h('select', {}, ...['butt', 'round', 'square'].map(x => h('option', { selected: it?.strokeCap === x }, x)));
  const join = h('select', {}, ...['miter', 'round', 'bevel'].map(x => h('option', { selected: it?.strokeJoin === x }, x)));
  const applyStroke = () => { sel.forEach(s => eachStyled(s, i => { if (i instanceof P.Raster) return; i.strokeColor = strokeOn.checked ? (i.strokeColor?.gradient ? i.strokeColor : strokeC.value) : null; i.strokeWidth = +swI.value; i.dashArray = dash.value ? dash.value.split(',').map(Number) : []; i.strokeCap = cap.value; i.strokeJoin = join.value; })); renderFS(); commitDebounced('Stroke'); };
  [strokeOn, strokeC, swI, dash, cap, join].forEach(e => e.oninput = e.onchange = applyStroke);
  const op = h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: sel[0].opacity }); op.oninput = () => { sel.forEach(s => s.opacity = +op.value); commitDebounced('Opacity'); };
  const blend = h('select', {}, ...['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'].map(x => h('option', { selected: sel[0].blendMode === x }, x))); blend.onchange = () => { sel.forEach(s => s.blendMode = blend.value); commit('Blend mode'); };
  const shadowOn = h('input', { type: 'checkbox', checked: !!sel[0].shadowColor }); shadowOn.onchange = () => { sel.forEach(s => { if (shadowOn.checked) { s.shadowColor = new P.Color(0, 0, 0, 0.35); s.shadowBlur = 12; s.shadowOffset = new P.Point(4, 6); } else s.shadowColor = null; }); commit('Shadow'); renderProps(); };
  rp.append(sec('Appearance',
    h('div', { class: 'colrow' }, h('span', { class: 'lbl' }, 'Fill'), fillSel, fillSel.value === 'solid' ? fillC : '', ['linear', 'radial'].includes(fillSel.value) ? g1 : '', ['linear', 'radial'].includes(fillSel.value) ? g2 : ''),
    h('div', { class: 'colrow' }, h('span', { class: 'lbl' }, 'Stroke'), strokeOn, strokeC, swI),
    h('div', { class: 'colrow' }, h('span', { class: 'lbl' }, ''), dash, cap, join),
    h('div', { class: 'colrow' }, h('span', { class: 'lbl' }, 'Opacity'), op),
    h('div', { class: 'colrow' }, h('span', { class: 'lbl' }, 'Blend'), blend),
    h('label', { class: 'colrow' }, h('span', { class: 'lbl' }, 'Shadow'), shadowOn, 'Drop shadow', sel[0].shadowColor ? h('button', { class: 'btn sm', onclick: F('shadowDialog') }, 'Edit…') : ''),
    h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px' } }, h('button', { class: 'btn sm', onclick: () => showTab('color') }, 'Gradient / pattern…'), h('button', { class: 'btn sm', onclick: F('recolor') }, 'Recolor…'))));
  VX.propSections.forEach(fn => { const el = fn(sel); if (el) rp.append(el); });
  const alignTo = h('select', {}, ...[['auto', 'Auto (selection / artboard)'], ['selection', 'Selection'], ['key', 'Key object'], ['artboard', 'Artboard']].map(([v, l]) => h('option', { value: v, selected: O.alignTo === v }, l))); alignTo.onchange = () => { O.alignTo = alignTo.value; if (O.alignTo === 'key' && !VX.keyObj && sel.length) VX.keyObj = sel[0]; drawGuides(); };
  rp.append(sec('Align', h('div', { class: 'icons' }, ...['alignL', 'alignC', 'alignR', 'alignT', 'alignM', 'alignB'].map(a => h('button', { class: 'icon-btn', 'data-tip': { alignL: 'Left', alignC: 'Horizontal center', alignR: 'Right', alignT: 'Top', alignM: 'Vertical center', alignB: 'Bottom' }[a], html: UI.icon(a), onclick: () => align(a) })),
    h('button', { class: 'icon-btn', 'data-tip': 'Distribute horizontal centres', html: UI.icon('swap'), onclick: () => distribute('h') }), h('button', { class: 'icon-btn', 'data-tip': 'Distribute vertical centres', html: UI.icon('swap'), style: { transform: 'rotate(90deg)' }, onclick: () => distribute('v') })),
    h('div', { class: 'colrow', style: { marginTop: '6px' } }, h('span', { class: 'lbl' }, 'Align to'), alignTo),
    h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px' } }, h('button', { class: 'btn sm', onclick: () => distributeSpacing('h') }, 'Space H'), h('button', { class: 'btn sm', onclick: () => distributeSpacing('v') }, 'Space V'), h('button', { class: 'btn sm', onclick: spacingDialog }, 'Spacing…')),
    h('div', { class: 'muted', style: { fontSize: '11px', marginTop: '6px' } }, O.alignTo === 'key' ? 'Click a selected object to make it the key object' : sel.length > 1 && O.alignTo !== 'artboard' ? 'Aligning to selection' : 'Aligning to artboard')));
  rp.append(sec('Pathfinder', h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px' } }, ...[['unite', 'Unite'], ['subtract', 'Minus front'], ['intersect', 'Intersect'], ['exclude', 'Exclude'], ['divide', 'Divide'], ['trim', 'Trim'], ['merge', 'Merge'], ['crop', 'Crop'], ['outline', 'Outline'], ['minusBack', 'Minus back']].map(([k, l]) => h('button', { class: 'btn sm', onclick: () => pathfinder(k) }, l)))));
  rp.append(sec('Arrange', h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px' } }, h('button', { class: 'btn sm', onclick: () => arrange('front') }, 'To front'), h('button', { class: 'btn sm', onclick: () => arrange('fwd') }, 'Forward'), h('button', { class: 'btn sm', onclick: () => arrange('back') }, 'Backward'), h('button', { class: 'btn sm', onclick: () => arrange('bottom') }, 'To back'), h('button', { class: 'btn sm', onclick: duplicate }, 'Duplicate'), h('button', { class: 'btn sm', onclick: deleteSel }, 'Delete'), h('button', { class: 'btn sm', onclick: makeClip }, 'Clip mask'), h('button', { class: 'btn sm', onclick: makeCompound }, 'Compound'), sel[0] instanceof P.Group ? h('button', { class: 'btn sm', onclick: () => enterIsolation(sel[0]) }, 'Isolate') : '')));
  rp.scrollTop = st;
}

// ---------------------------------------------------------------- layers panel (tree, drag-reorder, rename, sublayers)
const expanded = new Set();
const itemLabel = it => it.name || (it.data?.live ? ({ fx: 'Effect', repeat: 'Repeat', blend: 'Blend', top: 'Type on path', vw: 'Width stroke', pattern: 'Pattern fill' }[it.data.live.kind] || 'Live') : it.data?.symbolId ? 'Symbol: ' + (it.data.symbolName || '') : it instanceof P.PointText ? `“${it.content.slice(0, 18)}”` : it instanceof P.Group ? (it.clipped ? 'Clip group' : 'Group') : it instanceof P.CompoundPath ? 'Compound path' : it instanceof P.Raster ? 'Image' : 'Path');
const containsSel = it => sel.some(s => s === it || s.isDescendant?.(it));
let dragItem = null;
function renderLayersPanel() {
  if (rtab !== 'layers') return; const rp = $('#rp'); const st = rp.scrollTop; rp.innerHTML = '';
  const list = h('div', { class: 'layers-list', style: { padding: '6px' } });
  const ib = (ic, fn, tip) => h('span', { class: 'ib', 'data-tip': tip, html: UI.icon(ic), onclick: e => { e.stopPropagation(); fn(); } });
  const rename = (row, it) => { const t = row.querySelector('.t'); const inp = h('input', { type: 'text', value: it.name || itemLabel(it), style: { height: '20px', flex: 1 } }); t.replaceWith(inp); inp.focus(); inp.select(); const done = ok => { if (ok && inp.value.trim()) { it.name = inp.value.trim(); commit('Rename'); } renderLayersPanel(); }; inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); }; inp.onblur = () => done(true); };
  const dnd = (row, it) => {
    row.draggable = true;
    row.ondragstart = e => { dragItem = it; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'vx'); };
    row.ondragover = e => { if (!dragItem || dragItem === it || it.isDescendant?.(dragItem)) return; e.preventDefault(); const r = row.getBoundingClientRect(); const y = (e.clientY - r.top) / r.height; const into = (isLayer(it) || (it instanceof P.Group && !it.data?.live)) && y > 0.3 && y < 0.7; row.dataset.drop = into ? 'into' : y < 0.5 ? 'above' : 'below'; };
    row.ondragleave = () => delete row.dataset.drop;
    row.ondrop = e => { e.preventDefault(); const how = row.dataset.drop; delete row.dataset.drop; const src = dragItem; dragItem = null; if (!src || !how || src === it) return;
      if (isLayer(src) && !isLayer(it) && how !== 'into') return toast('Drop layers onto other layers');
      if (how === 'into') it.addChild(src); else if (how === 'above') src.insertAbove(it); else src.insertBelow(it);
      if (isLayer(src) && !src.parent) { if (src.index <= artLayer.index) src.insertAbove(artLayer); if (src.index >= guideLayer.index) src.insertBelow(guideLayer); }
      commit('Reorder'); renderLayersPanel(); };
  };
  const addItems = (container, depth) => [...container.children].reverse().forEach(it => {
    if (isLayer(it)) return addLayer(it, depth);
    const fc = firstStyled(it)?.fillColor; const isGroup = it instanceof P.Group || it instanceof P.CompoundPath; const open = expanded.has(it.id);
    const row = h('div', { class: 'li' + (sel.includes(it) ? ' sel' : ''), style: { paddingLeft: (10 + depth * 14) + 'px' }, onclick: e => { if (it.locked || !it.visible) return; const t = it; setSel(e.shiftKey ? (sel.includes(t) ? sel.filter(x => x !== t) : [...sel, t]) : [t]); }, ondblclick: e => { e.stopPropagation(); rename(row, it); } },
      h('span', { class: 'tw', onclick: e => { e.stopPropagation(); if (!isGroup) return; open ? expanded.delete(it.id) : expanded.add(it.id); renderLayersPanel(); } }, isGroup && !it.data?.live ? (open ? '▾' : '▸') : ''),
      ib(it.visible ? 'eye' : 'eyeOff', () => { it.visible = !it.visible; if (!it.visible) setSel(sel.filter(x => x !== it)); commit('Visibility'); renderLayersPanel(); }, 'Visibility'), ib(it.locked ? 'lock' : 'unlock', () => { it.locked = !it.locked; if (it.locked) setSel(sel.filter(x => x !== it)); commit('Lock'); renderLayersPanel(); }, 'Lock'),
      h('span', { class: 'chip', style: { background: fc && !fc.gradient ? fc.toCSS(true) : fc?.gradient ? 'linear-gradient(90deg,#ff9a00,#9a7bff)' : 'var(--bg-4)' } }), h('span', { class: 't' }, itemLabel(it)), h('span', { class: 'selind' + (containsSel(it) ? ' on' : '') }));
    dnd(row, it); list.append(row);
    if (isGroup && open && !it.data?.live) addItems(it, depth + 1);
  });
  const addLayer = (L, depth) => {
    const open = !expanded.has('c' + L.id);
    const row = h('div', { class: 'li layer' + (project.activeLayer === L ? ' sel' : ''), style: { paddingLeft: (4 + depth * 14) + 'px' }, onclick: () => { L.activate(); renderLayersPanel(); }, ondblclick: e => { e.stopPropagation(); rename(row, L); } },
      h('span', { class: 'tw', onclick: e => { e.stopPropagation(); open ? expanded.add('c' + L.id) : expanded.delete('c' + L.id); renderLayersPanel(); } }, open ? '▾' : '▸'),
      ib(L.visible ? 'eye' : 'eyeOff', () => { L.visible = !L.visible; commit('Layer visibility'); renderLayersPanel(); }, 'Visibility'), ib(L.locked ? 'lock' : 'unlock', () => { L.locked = !L.locked; if (L.locked) setSel(sel.filter(i => !i.isDescendant(L))); commit('Layer lock'); renderLayersPanel(); }, 'Lock'),
      h('span', { class: 'chip', style: { background: 'var(--accent)' } }), h('span', { class: 't' }, L.name), h('span', { class: 'muted' }, String(L.children.length)), h('span', { class: 'selind' + (sel.some(s => s.isDescendant(L)) ? ' on' : '') }));
    dnd(row, L); list.append(row);
    if (open) addItems(L, depth + 1);
  };
  [...userLayers()].reverse().forEach(L => addLayer(L, 0));
  rp.append(h('div', { class: 'row', style: { padding: '8px 10px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', gap: '4px' } }, h('button', { class: 'btn sm', onclick: () => { newUserLayer(); commit('New layer'); renderLayersPanel(); } }, '+ Layer'), h('button', { class: 'btn sm', onclick: () => { newSubLayer(); commit('New sublayer'); renderLayersPanel(); } }, '+ Sublayer'),
    h('button', { class: 'btn sm', onclick: () => { const L = project.activeLayer; if (!L.parent && userLayers().length < 2) return toast('Keep at least one layer'); L.remove(); activateUserLayer(); setSel([]); commit('Delete layer'); renderLayersPanel(); } }, 'Delete'),
    h('button', { class: 'btn sm', 'data-tip': 'Move layer up', onclick: () => { const L = project.activeLayer; const n = L.nextSibling; if (n && n !== guideLayer) L.insertAbove(n); commit('Layer order'); renderLayersPanel(); } }, '↑'),
    h('button', { class: 'btn sm', 'data-tip': 'Move layer down', onclick: () => { const L = project.activeLayer; const p = L.previousSibling; if (p && p !== artLayer) L.insertBelow(p); commit('Layer order'); renderLayersPanel(); } }, '↓'),
    sel.length ? h('button', { class: 'btn sm', onclick: () => { sel.forEach(i => project.activeLayer.addChild(i)); commit('Move to layer'); renderLayersPanel(); } }, 'Move sel. here') : ''), h('div', { class: 'muted', style: { fontSize: '11px', padding: '6px 12px 0' } }, 'Drag rows to reorder or nest · double-click to rename'), list);
  rp.scrollTop = st;
}

// ---------------------------------------------------------------- artboards
function boardAt(p) { for (let i = DOC.boards.length - 1; i >= 0; i--) if (abRect(i).contains(p)) return i; return -1; }
function setActiveBoard(i, zoom) { DOC.ab = clamp(i, 0, DOC.boards.length - 1); drawArtboard(); if (zoom) fitArt(); renderRight(); drawRulers(); }
function nextBoardPos() { const r = DOC.boards.reduce((a, b) => Math.max(a, b.x + b.w), -Infinity); const top = DOC.boards[0]?.y || 0; return [r + 60, top]; }
function addBoard(w = DOC.w, hh = DOC.h, name) { const [x, y] = nextBoardPos(); DOC.boards.push({ name: name || `Artboard ${DOC.boards.length + 1}`, x, y, w, h: hh, bg: '#ffffff' }); setActiveBoard(DOC.boards.length - 1); fitArt(); commit('New artboard'); }
function itemsOnBoard(i) { const r = abRect(i); return selectableItems().filter(it => r.contains(it.bounds.center)); }
function duplicateBoard(i = DOC.ab) { const b = DOC.boards[i]; const [x, y] = nextBoardPos(); const nb = { ...b, name: b.name + ' copy', x, y, locked: false }; const d = new P.Point(x - b.x, y - b.y); itemsOnBoard(i).forEach(it => { const c = it.clone(); c.translate(d); }); DOC.boards.push(nb); setActiveBoard(DOC.boards.length - 1); fitArt(); commit('Duplicate artboard'); }
async function deleteBoard(i = DOC.ab) { if (DOC.boards.length < 2) return toast('A document needs at least one artboard'); if (boardLocked(i)) return; const items = itemsOnBoard(i); let delArt = false; if (items.length) { const r = await modal({ title: 'Delete artboard', body: `Delete “${DOC.boards[i].name}”. Also delete the ${items.length} object(s) on it?`, buttons: [{ label: 'Cancel', value: null }, { label: 'Keep artwork', value: 'keep' }, { label: 'Delete artwork too', primary: true, value: 'del' }] }); if (!r) return; delArt = r === 'del'; } if (delArt) items.forEach(it => it.remove()); DOC.boards.splice(i, 1); setActiveBoard(Math.min(DOC.ab, DOC.boards.length - 1)); setSel([]); commit('Delete artboard'); }
async function renameBoard(i = DOC.ab) { const n = await prompt('Rename artboard', 'Name', DOC.boards[i].name); if (n) { DOC.boards[i].name = n; drawArtboard(); renderRight(); commit('Rename artboard'); } }
function moveBoard(i, dir) { const j = i + dir; if (j < 0 || j >= DOC.boards.length) return; [DOC.boards[i], DOC.boards[j]] = [DOC.boards[j], DOC.boards[i]]; DOC.ab = j; drawArtboard(); renderRight(); commit('Reorder artboards'); }
function fitBoardToArt() { const its = itemsOnBoard(DOC.ab); const all = its.length ? its : selectableItems(); if (!all.length) return toast('No artwork'); const r = all.reduce((a, i) => a ? a.unite(i.strokeBounds) : i.strokeBounds.clone(), null); Object.assign(DOC.boards[DOC.ab], { x: Math.floor(r.x), y: Math.floor(r.y), w: Math.ceil(r.width), h: Math.ceil(r.height) }); drawArtboard(); commit('Fit artboard'); }
function fitBoardToSel() { if (!sel.length) return toast('Select something'); const r = selBounds(); Object.assign(DOC.boards[DOC.ab], { x: Math.floor(r.x), y: Math.floor(r.y), w: Math.ceil(r.width), h: Math.ceil(r.height) }); drawArtboard(); commit('Fit artboard'); }
async function rearrangeBoards() {
  const v = await form({ title: 'Rearrange all artboards', fields: [{ key: 'cols', label: 'Columns', type: 'number', value: Math.min(4, DOC.boards.length) }, { key: 'gap', label: 'Spacing (px)', type: 'number', value: 60 }, { key: 'order', label: 'Layout', type: 'select', value: 'row', options: [{ value: 'row', label: 'Grid by row' }, { value: 'col', label: 'Grid by column' }] }, { key: 'art', label: 'Move artwork with artboard', type: 'checkbox', value: true }], ok: 'Rearrange' });
  if (!v) return; const cols = Math.max(1, +v.cols), gap = +v.gap; const n = DOC.boards.length; const rows = Math.ceil(n / cols);
  const cw = Math.max(...DOC.boards.map(b => b.w)), ch = Math.max(...DOC.boards.map(b => b.h));
  const groups = DOC.boards.map((b, i) => itemsOnBoard(i));
  const ox = Math.min(...DOC.boards.map(b => b.x)), oy = Math.min(...DOC.boards.map(b => b.y)); let k = 0, skipped = 0;
  DOC.boards.forEach((b, i) => { if (b.locked) { skipped++; return; } const kk = k++; const c = v.order === 'row' ? kk % cols : Math.floor(kk / rows), r = v.order === 'row' ? Math.floor(kk / cols) : kk % rows; const nx = ox + c * (cw + gap), ny = oy + r * (ch + gap); if (v.art) groups[i].forEach(it => it.translate([nx - b.x, ny - b.y])); b.x = nx; b.y = ny; });
  drawArtboard(); fitAll(); commit('Rearrange artboards'); if (skipped) toast(`${skipped} locked artboard(s) kept in place`);
}
function toggleBoardLock(i = DOC.ab) { const b = DOC.boards[i]; b.locked = !b.locked; drawArtboard(); renderRight(); commit(b.locked ? 'Lock artboard' : 'Unlock artboard'); toast(`“${b.name}” ${b.locked ? 'locked — it can no longer be moved, resized or deleted' : 'unlocked'}`); }
const boardLocked = (i, quiet) => { const b = DOC.boards[i]; if (b?.locked && !quiet) toast(`Artboard “${b.name}” is locked (Object › Artboards › Lock artboard)`); return !!b?.locked; };
async function boardBgDialog(i = DOC.ab) { const b = DOC.boards[i]; const v = await form({ title: 'Artboard background — ' + b.name, fields: [{ key: 'bg', label: 'Background colour', type: 'color', value: toHex(b.bg && b.bg !== 'transparent' ? b.bg : '#ffffff') }, { key: 't', label: 'Transparent (shows white on screen, exports transparent)', type: 'checkbox', value: !b.bg || b.bg === 'transparent' }, { key: 'all', label: 'Apply to all artboards', type: 'checkbox', value: false }] }); if (!v) return; (v.all ? DOC.boards : [b]).forEach(x => x.bg = v.t ? 'transparent' : v.bg); drawArtboard(); renderRight(); commit('Artboard background'); }
function renderBoardsPanel() {
  const rp = $('#rp'); rp.innerHTML = '';
  const list = h('div', { class: 'layers-list', style: { padding: '6px' } });
  DOC.boards.forEach((b, i) => list.append(h('div', { class: 'li' + (i === DOC.ab ? ' sel' : ''), onclick: () => setActiveBoard(i, true), ondblclick: () => renameBoard(i) },
    h('input', { type: 'checkbox', checked: !!b.picked, 'data-tip': 'Include in “Export selected artboards”', onclick: e => e.stopPropagation(), onchange: e => { b.picked = e.target.checked; drawArtboard(); renderBoardsPanel(); } }),
    h('span', { class: 'muted', style: { width: '18px' } }, String(i + 1)), h('span', { class: 'chip', style: { background: !b.bg || b.bg === 'transparent' ? 'repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0/6px 6px' : b.bg } }), h('span', { class: 't' }, b.name), h('span', { class: 'muted' }, `${b.w}×${b.h}`),
    h('span', { class: 'ib', 'data-tip': b.locked ? 'Unlock artboard' : 'Lock artboard', html: UI.icon(b.locked ? 'lock' : 'unlock'), onclick: e => { e.stopPropagation(); toggleBoardLock(i); } }),
    h('span', { class: 'ib', 'data-tip': 'Move up', onclick: e => { e.stopPropagation(); moveBoard(i, -1); } }, '↑'), h('span', { class: 'ib', 'data-tip': 'Move down', onclick: e => { e.stopPropagation(); moveBoard(i, 1); } }, '↓'))));
  rp.append(sec('Artboards', h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px' } }, h('button', { class: 'btn sm', onclick: () => addBoard() }, '+ New'), h('button', { class: 'btn sm', onclick: () => duplicateBoard() }, 'Duplicate'), h('button', { class: 'btn sm', onclick: () => renameBoard() }, 'Rename'), h('button', { class: 'btn sm', onclick: () => deleteBoard() }, 'Delete'), h('button', { class: 'btn sm', onclick: rearrangeBoards }, 'Rearrange…'), h('button', { class: 'btn sm', onclick: () => setTool('artboard') }, 'Artboard tool'))), list);
  const b = DOC.boards[DOC.ab];
  const f = (k, lbl) => { const i = h('input', { type: 'number', value: b[k], disabled: !!b.locked }); i.onchange = () => { b[k] = k === 'w' || k === 'h' ? Math.max(1, +i.value) : +i.value; drawArtboard(); commit('Artboard'); renderBoardsPanel(); }; return h('label', {}, lbl, i); };
  const presets = h('select', {}, h('option', { value: '' }, 'Preset size…'), ...Object.entries(PRESETS).map(([k, p]) => h('option', { value: k }, p.label))); presets.onchange = () => { const p = PRESETS[presets.value]; if (!p) return; b.w = p.w; b.h = p.h; drawArtboard(); commit('Artboard preset'); renderBoardsPanel(); };
  rp.append(sec('Active artboard', h('div', { class: 'grid2' }, f('x', 'X'), f('y', 'Y'), f('w', 'W'), f('h', 'H')), h('div', { class: 'row', style: { marginTop: '8px' } }, presets), h('div', { class: 'row', style: { marginTop: '8px', flexWrap: 'wrap', gap: '4px' } }, h('button', { class: 'btn sm', onclick: fitBoardToArt }, 'Fit to artwork'), h('button', { class: 'btn sm', onclick: fitBoardToSel }, 'Fit to selection'))),
    sec('Background', h('div', { class: 'colrow' }, h('span', { class: 'lbl' }, 'Colour'), (() => { const c = h('input', { type: 'color', value: toHex(b.bg && b.bg !== 'transparent' ? b.bg : '#ffffff') }); c.oninput = () => { b.bg = c.value; drawArtboard(); commitDebounced('Artboard background'); }; return c; })(), h('button', { class: 'btn sm', onclick: () => { b.bg = 'transparent'; drawArtboard(); commit('Transparent artboard'); renderBoardsPanel(); } }, 'Transparent'), h('button', { class: 'btn sm', onclick: () => boardBgDialog() }, 'More…')),
      h('label', { class: 'row', style: { color: 'var(--tx-1)', marginTop: '4px' } }, (() => { const c = h('input', { type: 'checkbox', checked: !!b.locked }); c.onchange = () => toggleBoardLock(); return c; })(), 'Lock artboard (no move / resize / delete)')),
    sec('Export artboards', h('div', { class: 'muted', style: { fontSize: '11px', marginBottom: '6px' } }, `${DOC.boards.filter(x => x.picked).length} of ${DOC.boards.length} ticked for “selected” export`), h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px' } }, h('button', { class: 'btn sm', onclick: () => exportDialog('png', 'selected') }, 'Selected…'), h('button', { class: 'btn sm', onclick: () => { const all = DOC.boards.every(x => x.picked); DOC.boards.forEach(x => x.picked = !all); drawArtboard(); renderBoardsPanel(); } }, 'Tick all / none'), h('button', { class: 'btn sm', onclick: () => exportDialog('png', 'all') }, 'PNG (each)'), h('button', { class: 'btn sm', onclick: () => exportDialog('svg', 'all') }, 'SVG (each)'), h('button', { class: 'btn sm', onclick: () => exportDialog('pdf', 'all') }, 'Multi-page PDF'))));
}

// ---------------------------------------------------------------- selection, isolation & guides
function topItem(it) { while (it && it.parent && !(it.parent instanceof P.Layer) && it.parent !== VX.iso) it = it.parent; return it; }
function selectableItems() { const out = []; const walk = L => { if (!L.visible || L.locked) return; L.children.forEach(c => { if (c instanceof P.Layer) walk(c); else if (c.visible && !c.locked) out.push(c); }); }; if (VX.iso) return VX.iso.children.filter(c => c.visible && !c.locked); userLayers().forEach(walk); return out; }
function setSel(arr) {
  sel.forEach(i => { i.fullySelected = false; i.selected = false; }); selSegs = [];
  sel = [...new Set(arr)].filter(i => i && i.parent && !isSys(i) && !i.locked && !i.layer?.locked && !(i instanceof P.Layer));
  if (VX.keyObj && !sel.includes(VX.keyObj)) VX.keyObj = null;
  if (O.tool === 'direct') sel.forEach(i => { if (!(i instanceof P.Raster) && !(i instanceof P.PointText)) i.fullySelected = true; });
  drawGuides(); renderRight(); renderFS(); renderOptions();
  $('#stSel').textContent = sel.length ? `${sel.length} object${sel.length > 1 ? 's' : ''} selected` : '';
}
function selBounds() { let b = null; sel.forEach(i => { const ib = i.strokeBounds || i.bounds; b = b ? b.unite(ib) : ib.clone(); }); return b || new P.Rectangle(0, 0, 0, 0); }
function handlePoints(b) { return [b.topLeft, b.topCenter, b.topRight, b.rightCenter, b.bottomRight, b.bottomCenter, b.bottomLeft, b.leftCenter]; }
let marquee = null, penPreview = null;
function drawGuides() {
  if (!guideLayer) return;
  guideLayer.removeChildren(); const z = view.zoom; const col = new P.Color(cssVar('--accent') || '#ff9a00');
  if (VX.iso && VX.iso.parent) { new P.Path.Rectangle({ rectangle: view.bounds.expand(50 / z), fillColor: new P.Color(0.5, 0.5, 0.55, 0.55), parent: guideLayer }); const c = VX.iso.clone({ insert: false }); c.fullySelected = false; c.selected = false; guideLayer.addChild(c); }
  if (O.showGuides) DOC.guides.forEach(g => { const vb = view.bounds; new P.Path.Line({ from: g.axis === 'v' ? [g.pos, vb.top] : [vb.left, g.pos], to: g.axis === 'v' ? [g.pos, vb.bottom] : [vb.right, g.pos], strokeColor: '#20c6e8', strokeWidth: 1 / z, parent: guideLayer }); });
  const tt = VX.tools[O.tool];
  if (O.tool !== 'direct' && sel.length && !tt?.hideSelection) {
    sel.forEach(i => { if (sel.length > 1) new P.Path.Rectangle({ rectangle: i.bounds, strokeColor: col, strokeWidth: 0.5 / z, parent: guideLayer, opacity: 0.6 }); });
    if (VX.keyObj && sel.includes(VX.keyObj)) new P.Path.Rectangle({ rectangle: VX.keyObj.bounds.expand(2 / z), strokeColor: col, strokeWidth: 3 / z, parent: guideLayer });
    const b = selBounds(); new P.Path.Rectangle({ rectangle: b, strokeColor: col, strokeWidth: 1 / z, parent: guideLayer });
    if (O.tool === 'select') handlePoints(b).forEach(p => new P.Path.Rectangle({ point: p.subtract(4 / z), size: 8 / z, fillColor: 'white', strokeColor: col, strokeWidth: 1 / z, parent: guideLayer }));
  }
  if (O.tool === 'direct') drawCornerWidgets();
  if (marquee) new P.Path.Rectangle({ from: marquee.from, to: marquee.to, strokeColor: '#4f8cff', fillColor: new P.Color(0.3, 0.55, 1, 0.08), dashArray: [4 / z, 4 / z], strokeWidth: 1 / z, parent: guideLayer });
  if (penPreview) { const pp = penPreview.clone(); pp.parent = guideLayer; }
  VX.smartLines.forEach(l => { new P.Path.Line({ from: l.from, to: l.to, strokeColor: '#ff2bd1', strokeWidth: 1 / z, parent: guideLayer }); });
  if (VX.snapHit) new P.Path.Rectangle({ point: VX.snapHit.subtract(3.5 / z), size: 7 / z, strokeColor: '#ff2bd1', strokeWidth: 1.2 / z, parent: guideLayer });
  if (VX.snapHint) { const hp = VX.snapHint.pt; new P.Path.Circle({ center: hp, radius: 4 / z, strokeColor: '#ff2bd1', strokeWidth: 1.4 / z, parent: guideLayer }); const tx = new P.PointText({ point: hp.add([8 / z, -8 / z]), content: VX.snapHint.label, fontSize: 11 / z, fillColor: '#ff2bd1', fontFamily: 'Segoe UI, Inter, sans-serif', parent: guideLayer }); new P.Path.Rectangle({ rectangle: tx.bounds.expand(3 / z), radius: 2 / z, fillColor: new P.Color(1, 1, 1, 0.9), parent: guideLayer }).insertBelow(tx); }
  tt?.guides?.(guideLayer, z);
  guideLayer.bringToFront();
  VX.afterGuides.forEach(fn => { try { fn(); } catch (e) { console.warn(e); } });
}
function enterIsolation(g) { if (!(g instanceof P.Group) || g.data?.live) return toast('Select a group to isolate'); VX.iso = g; setSel([]); renderOptions(); drawGuides(); toast('Isolation mode — Esc or double-click outside to exit'); }
function exitIsolation() { if (!VX.iso) return; const g = VX.iso; VX.iso = null; setSel(g.parent ? [g] : []); renderOptions(); drawGuides(); }

// ---- live corners on selected anchors (direct selection)
function cornerSegs() { return selSegs.filter(s => s.path && !s.hasHandles() && s.previous && s.next && s.path.closed !== undefined && (s.path.closed || (s.index > 0 && s.index < s.path.segments.length - 1))); }
function cornerWidgetPos(s) { const z = view.zoom; const a = s.previous.point.subtract(s.point).normalize(), b = s.next.point.subtract(s.point).normalize(); let bis = a.add(b); if (bis.length < 1e-6) bis = a.rotate(90); return s.point.add(bis.normalize(16 / z)); }
function drawCornerWidgets() { const z = view.zoom; cornerSegs().forEach(s => { new P.Path.Circle({ center: cornerWidgetPos(s), radius: 4 / z, strokeColor: '#ff9a00', fillColor: 'white', strokeWidth: 1.5 / z, parent: guideLayer }); new P.Path.Circle({ center: cornerWidgetPos(s), radius: 1.5 / z, fillColor: '#ff9a00', parent: guideLayer }); }); }

// ---------------------------------------------------------------- view, rulers & guides
function afterView() { $('#stZoom').textContent = Math.round(view.zoom * 100) + '%'; drawArtboard(); drawGuides(); drawRulers(); }
function fitRect(r, pad = 80) { const vs = view.viewSize; const z = Math.min((vs.width - pad) / Math.max(1, r.width), (vs.height - pad) / Math.max(1, r.height)); view.zoom = clamp(z, 0.02, 64); view.center = r.center; afterView(); }
function fitArt() { fitRect(abRect()); }
function fitAll() { fitRect(DOC.boards.reduce((a, b, i) => a ? a.unite(abRect(i)) : abRect(i), null)); }
function zoomToSel() { if (!sel.length) return fitArt(); fitRect(selBounds().expand(20), 120); }
function zoomAt(f, pt) { const p0 = pt || view.center; const old = view.zoom; const nz = clamp(old * f, 0.02, 64); view.zoom = nz; const d = p0.subtract(view.center); view.center = view.center.add(d.multiply(1 - old / nz)); afterView(); }
UI.shortcut('ctrl+=', () => zoomAt(1.25)); UI.shortcut('ctrl++', () => zoomAt(1.25)); UI.shortcut('ctrl+shift++', () => zoomAt(1.25)); UI.shortcut('ctrl+-', () => zoomAt(0.8)); UI.shortcut('ctrl+0', fitArt); UI.shortcut('ctrl+alt+0', fitAll); UI.shortcut('ctrl+alt+shift+0', zoomToSel); UI.shortcut('ctrl+1', () => { view.zoom = 1; afterView(); });
UI.shortcut('ctrl+y', toggleOutline); UI.shortcut("ctrl+'", () => { O.grid = !O.grid; drawArtboard(); }); UI.shortcut("ctrl+shift+'", () => { O.snap = !O.snap; toast('Snap to grid ' + (O.snap ? 'on' : 'off')); }); UI.shortcut("ctrl+alt+'", () => { O.snapPoint = !O.snapPoint; toast('Snap to point ' + (O.snapPoint ? 'on' : 'off')); });
UI.shortcut('ctrl+r', toggleRulers); UI.shortcut('ctrl+u', () => { O.smart = !O.smart; toast('Smart guides ' + (O.smart ? 'on' : 'off')); }); UI.shortcut('ctrl+;', () => { O.showGuides = !O.showGuides; drawGuides(); }); UI.shortcut('ctrl+5', guidesFromSel);
function setOutline(on) { userLayers().forEach(L => L.getItems({ recursive: true }).forEach(i => { if (i instanceof P.Group || i instanceof P.Layer || i instanceof P.Raster) return; if (on) { if (i.data._o) return; i.data._o = { f: colorToJSON(i.fillColor), s: colorToJSON(i.strokeColor), w: i.strokeWidth, sh: i.shadowColor ? i.shadowColor.toCSS(false) : null }; i.fillColor = null; i.strokeColor = '#000'; i.strokeWidth = 1 / view.zoom; i.shadowColor = null; } else if (i.data._o) { const o = i.data._o; i.fillColor = o.f ? colorFromJSON(o.f) : null; i.strokeColor = o.s ? colorFromJSON(o.s) : null; i.strokeWidth = o.w; if (o.sh) i.shadowColor = o.sh; delete i.data._o; } })); }
const colorToJSON = c => { if (!c) return null; if (c.gradient) { const n = c.gradient.stops.length; return { g: c.gradient.stops.map((st, i) => [st.color.toCSS(false), st.offset ?? (n > 1 ? i / (n - 1) : 0)]), r: !!c.gradient.radial, o: [c.origin.x, c.origin.y], d: [c.destination.x, c.destination.y] }; } return c.toCSS(false); };
const colorFromJSON = j => { try { if (!j) return null; if (typeof j === 'string') return new P.Color(j); return new P.Color({ gradient: { stops: j.g.map(([c, o]) => [new P.Color(c), o]), radial: j.r }, origin: new P.Point(j.o), destination: new P.Point(j.d) }); } catch { return null; } };
function toggleOutline() { O.outline = !O.outline; setOutline(O.outline); toast('Outline mode ' + (O.outline ? 'on (Ctrl+Y to exit)' : 'off')); }
cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(); const pt = view.viewToProject(new P.Point(e.clientX - r.left, e.clientY - r.top)); if (e.ctrlKey || e.altKey) zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, pt); else { view.center = view.center.add(new P.Point(e.shiftKey ? e.deltaY : e.deltaX, e.shiftKey ? 0 : e.deltaY).divide(view.zoom)); afterView(); } }, { passive: false });
// rulers
const rulerH = h('canvas', { class: 'ruler h' }), rulerV = h('canvas', { class: 'ruler v' }), rulerC = h('div', { class: 'ruler-c', 'data-tip': 'Rulers (Ctrl+R) — drag from a ruler to create a guide' });
vpEl.append(rulerH, rulerV, rulerC);
function toggleRulers() { O.rulers = !O.rulers; vpEl.classList.toggle('no-rulers', !O.rulers); drawRulers(); }
function drawRulers() {
  if (!O.rulers) return; const dpr = devicePixelRatio || 1; const W = vpEl.clientWidth, H = vpEl.clientHeight; const RS = 18;
  const bg = cssVar('--bg-2'), tx = cssVar('--tx-2'), ln = cssVar('--line-2');
  const origin = abRect().topLeft; const z = view.zoom;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000]; const step = steps.find(s => s * z >= 60) || 5000; const minor = step / (step % 5 === 0 ? 5 : 4);
  [[rulerH, W, RS, 'h'], [rulerV, RS, H, 'v']].forEach(([c, w, hh, ax]) => {
    c.width = w * dpr; c.height = hh * dpr; c.style.width = w + 'px'; c.style.height = hh + 'px'; const x = c.getContext('2d'); x.scale(dpr, dpr);
    x.fillStyle = bg; x.fillRect(0, 0, w, hh); x.strokeStyle = ln; x.fillStyle = tx; x.font = '9.5px ' + getComputedStyle(document.body).fontFamily; x.lineWidth = 1;
    const len = ax === 'h' ? w : hh; const p0 = view.viewToProject(new P.Point(0, 0)), p1 = view.viewToProject(new P.Point(len, len));
    const a0 = (ax === 'h' ? p0.x : p0.y) - (ax === 'h' ? origin.x : origin.y), a1 = (ax === 'h' ? p1.x : p1.y) - (ax === 'h' ? origin.x : origin.y);
    x.beginPath();
    for (let v = Math.floor(a0 / minor) * minor; v <= a1; v += minor) { const pr = view.projectToView(ax === 'h' ? new P.Point(v + origin.x, 0) : new P.Point(0, v + origin.y)); const s = ax === 'h' ? pr.x : pr.y; const major = Math.abs(v / step - Math.round(v / step)) < 1e-6; const tl = major ? RS : RS * 0.3; if (ax === 'h') { x.moveTo(Math.round(s) + 0.5, RS); x.lineTo(Math.round(s) + 0.5, RS - tl); } else { x.moveTo(RS, Math.round(s) + 0.5); x.lineTo(RS - tl, Math.round(s) + 0.5); } if (major) { const lbl = String(Math.round(v)); if (ax === 'h') x.fillText(lbl, s + 3, 9); else { x.save(); x.translate(9, s + 3); x.rotate(-Math.PI / 2); x.fillText(lbl, 0, 0); x.restore(); } } }
    x.stroke(); x.fillStyle = ln; if (ax === 'h') x.fillRect(0, RS - 1, w, 1); else x.fillRect(RS - 1, 0, 1, hh);
  });
}
let guideDrag = null;
const vpPoint = e => { const r = cv.getBoundingClientRect(); return new P.Point(e.clientX - r.left, e.clientY - r.top); };
[[rulerH, 'h'], [rulerV, 'v']].forEach(([c, axis]) => c.addEventListener('mousedown', e => { e.preventDefault(); guideDrag = { axis, g: null }; }));
window.addEventListener('mousemove', e => { if (!guideDrag) return; const p = view.viewToProject(vpPoint(e)); if (!guideDrag.g) { guideDrag.g = { axis: guideDrag.axis === 'h' ? 'h' : 'v', pos: 0 }; DOC.guides.push(guideDrag.g); } guideDrag.g.pos = Math.round(guideDrag.g.axis === 'h' ? p.y : p.x); drawGuides(); });
window.addEventListener('mouseup', e => { if (!guideDrag) return; const g = guideDrag.g; guideDrag = null; if (!g) return; const vp = vpPoint(e); if (vp.x < 18 || vp.y < 18) DOC.guides = DOC.guides.filter(x => x !== g); drawGuides(); commit('Guide'); });
function guideNear(p) { if (O.lockGuides || !O.showGuides) return null; const tol = 4 / view.zoom; return DOC.guides.find(g => Math.abs((g.axis === 'v' ? p.x : p.y) - g.pos) < tol) || null; }
async function addGuideDialog() { const v = await form({ title: 'Add guide', fields: [{ key: 'axis', label: 'Orientation', type: 'select', value: 'v', options: [{ value: 'v', label: 'Vertical' }, { value: 'h', label: 'Horizontal' }] }, { key: 'pos', label: 'Position (px from artboard origin)', type: 'number', value: 100 }] }); if (!v) return; const o = abRect().topLeft; DOC.guides.push({ axis: v.axis, pos: (v.axis === 'v' ? o.x : o.y) + +v.pos }); drawGuides(); commit('Add guide'); }
function guidesFromSel() { if (!sel.length) return toast('Select objects'); const b = selBounds(); DOC.guides.push({ axis: 'v', pos: b.left }, { axis: 'v', pos: b.right }, { axis: 'h', pos: b.top }, { axis: 'h', pos: b.bottom }); drawGuides(); commit('Guides from selection'); }

// ---------------------------------------------------------------- snapping (grid, pixel, point, smart guides)
function snapGrid(p) { return new P.Point(Math.round(p.x / O.gridSize) * O.gridSize, Math.round(p.y / O.gridSize) * O.gridSize); }
function anchorPoints(exclude = []) { const pts = []; const vb = view.bounds; selectableItems().forEach(it => { if (exclude.some(x => x === it || it.isDescendant?.(x))) return; if (!it.bounds.intersects(vb)) return; (it instanceof P.Path ? [it] : it.getItems ? it.getItems({ class: P.Path }) : []).forEach(p => { if (p.segments.length < 400) p.segments.forEach(s => pts.push(s.point)); }); const b = it.bounds; pts.push(b.center); }); DOC.boards.forEach((b, i) => { const r = abRect(i); pts.push(r.topLeft, r.topRight, r.bottomLeft, r.bottomRight, r.center); }); return pts; }
function snapPt(p, exclude = []) {
  VX.snapHit = null; VX.smartLines = [];
  if (O.snap) return snapGrid(p);
  const tol = (O.snapTol || 6) / view.zoom;
  if (O.snapPoint) { let best = null, bd = tol; anchorPoints(exclude).forEach(q => { const d = q.getDistance(p); if (d < bd) { bd = d; best = q; } }); if (best) { VX.snapHit = best; return best.clone(); } }
  let q = p.clone();
  if (O.snapGuides !== false && O.showGuides && !O.lockGuides) DOC.guides.forEach(g => { if (g.axis === 'v' && Math.abs(q.x - g.pos) < tol) q.x = g.pos; if (g.axis === 'h' && Math.abs(q.y - g.pos) < tol) q.y = g.pos; });
  if (O.snapPixel) q = q.round();
  return q;
}
function smartCandidates(exclude) {
  const xs = [], ys = []; const vb = view.bounds.expand(200 / view.zoom);
  selectableItems().forEach(it => { if (exclude.some(x => x === it || it.isDescendant?.(x))) return; const b = it.strokeBounds; if (!b.intersects(vb)) return; xs.push({ v: b.left, b }, { v: b.center.x, b }, { v: b.right, b }); ys.push({ v: b.top, b }, { v: b.center.y, b }, { v: b.bottom, b }); });
  DOC.boards.forEach((bb, i) => { const b = abRect(i); xs.push({ v: b.left, b }, { v: b.center.x, b }, { v: b.right, b }); ys.push({ v: b.top, b }, { v: b.center.y, b }, { v: b.bottom, b }); });
  if (O.showGuides) DOC.guides.forEach(g => (g.axis === 'v' ? xs : ys).push({ v: g.pos, b: null }));
  return { xs, ys };
}
function snapMove(b0, raw, cands) {
  let d = raw.clone(); VX.smartLines = []; VX.snapHit = null;
  if (O.snap) return snapGrid(b0.topLeft.add(d)).subtract(b0.topLeft);
  if (O.snapPixel) d = new P.Point(Math.round(b0.x + d.x) - b0.x, Math.round(b0.y + d.y) - b0.y);
  if (!O.smart || !cands) return d;
  const tol = 5 / view.zoom; const b = new P.Rectangle(b0.point.add(d), b0.size);
  const fx = [b.left, b.center.x, b.right], fy = [b.top, b.center.y, b.bottom];
  let bx = null, by = null;
  cands.xs.forEach(c => fx.forEach(v => { const dd = c.v - v; if (Math.abs(dd) < tol && (!bx || Math.abs(dd) < Math.abs(bx.dd))) bx = { dd, c }; }));
  cands.ys.forEach(c => fy.forEach(v => { const dd = c.v - v; if (Math.abs(dd) < tol && (!by || Math.abs(dd) < Math.abs(by.dd))) by = { dd, c }; }));
  if (bx) d.x += bx.dd; if (by) d.y += by.dd;
  const nb = new P.Rectangle(b0.point.add(d), b0.size); const vb = view.bounds;
  if (bx) { const r = bx.c.b; VX.smartLines.push({ from: [bx.c.v, r ? Math.min(r.top, nb.top) : vb.top], to: [bx.c.v, r ? Math.max(r.bottom, nb.bottom) : vb.bottom] }); }
  if (by) { const r = by.c.b; VX.smartLines.push({ from: [r ? Math.min(r.left, nb.left) : vb.left, by.c.v], to: [r ? Math.max(r.right, nb.right) : vb.right, by.c.v] }); }
  return d;
}
// tangent / perpendicular snapping for line ends: finds points q on nearby curves where (q - a) is tangent or normal to the curve
function snapLineEnd(a, p, exclude = []) {
  VX.snapHint = null; if (!O.snapTangent && !O.snapPerp) return null;
  const tol = Math.max(8, (O.snapTol || 6) * 1.6) / view.zoom; let best = null;
  selectableItems().forEach(it => {
    if (exclude.some(x => x === it || it.isDescendant?.(x))) return; if (!it.bounds.expand(tol * 3).contains(p)) return;
    const paths = it instanceof P.Path ? [it] : it.getItems ? it.getItems({ class: P.Path, match: q => q.visible }) : [];
    paths.forEach(path => { if (path.length < 1 || path.segments.length > 2000) return;
      path.curves.forEach(c => { if (!c.bounds.expand(tol * 2).contains(p)) return;
        const fn = (kind, t) => { const q = c.getPointAtTime(t), tg = c.getTangentAtTime(t); const v = q.subtract(a); return kind === 'tan' ? tg.cross(v) : tg.dot(v); };
        [['tan', O.snapTangent], ['perp', O.snapPerp]].forEach(([kind, on]) => { if (!on || (kind === 'tan' && c.isStraight())) return;
          const N = 32; let t0 = 0, f0 = fn(kind, 0);
          for (let k = 1; k <= N; k++) { const t1 = k / N, f1 = fn(kind, t1);
            if (f0 * f1 <= 0) { let lo = t0, hi = t1, flo = f0; for (let n = 0; n < 32; n++) { const m = (lo + hi) / 2, fm = fn(kind, m); if (flo * fm <= 0) hi = m; else { lo = m; flo = fm; } } const q = c.getPointAtTime((lo + hi) / 2); const d = q.getDistance(p); if (d < tol && q.getDistance(a) > 0.5 && (!best || d < best.d)) best = { pt: q, d, kind }; }
            t0 = t1; f0 = f1; } });
      }); });
  });
  if (!best) return null; VX.snapHint = { pt: best.pt, a, label: best.kind === 'tan' ? 'tangent' : 'perpendicular' }; return best.pt.clone();
}
const snapFillColor = c => (O.snapColor && c && VX.f.nearestSwatch) ? VX.f.nearestSwatch(c) : c;
Object.assign(VX, { snapPt, snapGrid, snapLineEnd, snapFillColor });

// ---------------------------------------------------------------- tools (single paper tool dispatcher)
const tool = new P.Tool(); tool.minDistance = 0;
let spaceDown = false, panStart = null, drag = null, cur = null, pen = null, lastClick = 0, labelDrag = null;
// on-canvas artboard name labels: click to activate, drag to move the artboard (and its artwork), double-click to rename
function labelAt(p) { return [...(VX.boardLabels || [])].reverse().find(l => l.rect.contains(p)) || null; }
window.addEventListener('keydown', e => { if (e.code === 'Space' && !e.target.closest('input,textarea,select') && !spaceDown) { spaceDown = true; cv.style.cursor = 'grab'; e.preventDefault(); } });
window.addEventListener('keyup', e => { if (e.code === 'Space') { spaceDown = false; updateCursor(); } });
const hitOpts = extra => ({ fill: true, stroke: true, segments: true, tolerance: 6 / view.zoom, match: r => !isSys(r.item) && !r.item.locked && r.item.visible && !r.item.layer?.locked && (!VX.iso || r.item.isDescendant(VX.iso)), ...extra });
function hitTop(pt, extra) { const hit = project.hitTest(pt, hitOpts({ segments: false, ...extra })); return hit ? topItem(hit.item) : null; }
function styleNew(item, opts = {}) { item.fillColor = opts.noFill ? null : snapFillColor(O.fill); item.strokeColor = O.stroke; item.strokeWidth = O.stroke ? (O.sw || 1) : 0; if (opts.line && !O.stroke) { item.strokeColor = O.fill || '#000'; item.strokeWidth = O.sw || 1; } if (VX.iso && item.parent !== VX.iso) VX.iso.addChild(item); return item; }
tool.onMouseDown = e => {
  const ev = e.event; const now = Date.now(); const dbl = now - lastClick < 320; lastClick = now;
  if (spaceDown || O.tool === 'hand' || ev.button === 1) { panStart = { pt: new P.Point(ev.clientX, ev.clientY), c: view.center.clone() }; return; }
  if (ev.button === 2) return;
  if (textEd) finishText(true);
  const t = O.tool;
  if (['select', 'direct', 'artboard'].includes(t)) { const lb = labelAt(e.point); if (lb) { if (dbl) { renameBoard(lb.i); return; } if (lb.i !== DOC.ab) setActiveBoard(lb.i); labelDrag = { i: lb.i, last: e.point, items: O.moveArtWithBoard !== false && !e.modifiers.alt ? itemsOnBoard(lb.i) : [], locked: boardLocked(lb.i, true) }; return; } }
  if (VX.tools[t]?.down) { try { VX.tools[t].down(e, dbl); } catch (err) { console.error(err); toast(String(err.message || err), 'err'); } return; }
  const pt = snapPt(e.point);
  switch (t) {
    case 'zoom': zoomAt(e.modifiers.alt ? 0.8 : 1.25, e.point); return;
    case 'select': return selectDown(e, dbl);
    case 'direct': return directDown(e, dbl);
    case 'pen': return penDown(e);
    case 'pencil': cur = new P.Path({ strokeColor: O.stroke || '#000', strokeWidth: O.sw || 1, strokeCap: 'round', strokeJoin: 'round', fillColor: null }); cur.add(e.point); return;
    case 'rect': case 'ellipse': case 'polygon': case 'star': case 'line': drag = { start: pt }; return;
    case 'text': { const hit = project.hitTest(e.point, hitOpts({ segments: false })); const ti = hit && topItem(hit.item); if (ti instanceof P.PointText) { setSel([ti]); editText(ti); } else createText(pt); return; }
    case 'eyedrop': { const hit = project.hitTest(e.point, hitOpts({ segments: false })); if (!hit) return; let src = hit.item; if (src instanceof P.Group) src = firstStyled(src) || src; if (sel.length) { sel.forEach(s => { eachStyled(s, i => { if (i instanceof P.Raster) return; i.fillColor = src.fillColor ? src.fillColor.clone() : null; i.strokeColor = src.strokeColor ? src.strokeColor.clone() : null; i.strokeWidth = src.strokeWidth; i.dashArray = src.dashArray; i.strokeCap = src.strokeCap; i.strokeJoin = src.strokeJoin; if (src instanceof P.PointText && i instanceof P.PointText) { i.fontFamily = src.fontFamily; i.fontSize = src.fontSize; i.fontWeight = src.fontWeight; i.leading = src.leading; i.data.tracking = src.data.tracking; } }); const top = topItem(hit.item); s.opacity = top.opacity; s.blendMode = top.blendMode; s.shadowColor = top.shadowColor ? top.shadowColor.clone() : null; s.shadowBlur = top.shadowBlur; s.shadowOffset = top.shadowOffset; }); commit('Eyedropper'); } O.fill = src.fillColor && !src.fillColor.gradient ? src.fillColor.toCSS(true) : O.fill; O.stroke = src.strokeColor && !src.strokeColor.gradient ? src.strokeColor.toCSS(true) : null; O.sw = src.strokeWidth; renderFS(); renderOptions(); renderRight(); return; }
    case 'scissors': { const hit = project.hitTest(e.point, hitOpts({ fill: false, segments: true })); if (!hit || !(hit.item instanceof P.Path)) return toast('Click on a path stroke'); const path = hit.item; const loc = hit.location || path.getNearestLocation(e.point); if (path.closed) { path.splitAt(loc); setSel([path]); } else { const rest = path.splitAt(loc); if (rest) setSel([path, rest]); } commit('Scissors'); return; }
    case 'gradient': drag = { start: e.point }; return;
  }
};
tool.onMouseDrag = e => {
  const ev = e.event;
  if (panStart) { const d = new P.Point(ev.clientX, ev.clientY).subtract(panStart.pt).divide(view.zoom); view.center = panStart.c.subtract(d); afterView(); return; }
  if (labelDrag) { const L = labelDrag; if (L.locked) { if (!L.warned) { boardLocked(L.i); L.warned = true; } return; } const d = e.point.subtract(L.last); L.last = e.point; const b = DOC.boards[L.i]; b.x += d.x; b.y += d.y; L.items.forEach(it => it.translate(d)); L.moved = true; drawArtboard(); drawGuides(); $('#stPos').textContent = `Artboard X ${Math.round(b.x)}  Y ${Math.round(b.y)}`; return; }
  const t = O.tool;
  if (VX.tools[t]?.drag) { try { VX.tools[t].drag(e); } catch (err) { console.error(err); } return; }
  if (t === 'select') return selectDrag(e);
  if (t === 'direct') return directDrag(e);
  if (t === 'pen') return penDrag(e);
  const pt = snapPt(e.point);
  if (t === 'pencil' && cur) { cur.add(e.point); return; }
  if (['rect', 'ellipse', 'polygon', 'star', 'line'].includes(t) && drag) {
    cur?.remove(); let a = drag.start, b = pt;
    if (e.modifiers.shift) { if (t === 'line') { const v = b.subtract(a); const ang = Math.round(v.angle / 45) * 45; b = a.add(new P.Point({ length: v.length, angle: ang })); } else { const d = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)); b = new P.Point(a.x + Math.sign(b.x - a.x || 1) * d, a.y + Math.sign(b.y - a.y || 1) * d); } }
    if (t === 'line' && !e.modifiers.shift && !VX.snapHit) { const sl = snapLineEnd(a, e.point); if (sl) b = sl; }
    if (e.modifiers.alt && t !== 'line') a = a.subtract(b.subtract(a));
    const r = new P.Rectangle(a, b);
    if (t === 'rect') cur = new P.Path.Rectangle({ rectangle: r, radius: Math.min(O.radius, r.width / 2, r.height / 2) });
    else if (t === 'ellipse') cur = new P.Path.Ellipse(r);
    else if (t === 'polygon') { cur = new P.Path.RegularPolygon({ center: drag.start, sides: O.sides, radius: Math.max(1, drag.start.getDistance(pt)) }); cur.rotate(pt.subtract(drag.start).angle + 90, drag.start); }
    else if (t === 'star') { const rr = Math.max(1, drag.start.getDistance(pt)); cur = new P.Path.Star({ center: drag.start, points: O.sides, radius1: rr, radius2: rr * O.starRatio }); cur.rotate(pt.subtract(drag.start).angle + 90, drag.start); }
    else cur = new P.Path.Line(a, b);
    styleNew(cur, { line: t === 'line', noFill: t === 'line' }); $('#stPos').textContent = `W ${Math.round(r.width)}  H ${Math.round(r.height)}`; drawGuides(); return;
  }
  if (t === 'gradient' && drag) { cur?.remove(); cur = new P.Path.Line({ from: drag.start, to: e.point, strokeColor: '#ff9a00', strokeWidth: 2 / view.zoom, parent: guideLayer }); return; }
};
tool.onMouseUp = e => {
  if (panStart) { panStart = null; return; }
  if (labelDrag) { const L = labelDrag; labelDrag = null; if (L.moved) { const b = DOC.boards[L.i]; const dx = Math.round(b.x) - b.x, dy = Math.round(b.y) - b.y; b.x += dx; b.y += dy; L.items.forEach(it => it.translate([dx, dy])); drawArtboard(); drawRulers(); commit('Move artboard'); renderRight(); } return; }
  const t = O.tool;
  if (t === 'pen') { if (drag?.closing) { drag = null; finishPen(); return; } drag = null; return; }
  if (VX.tools[t]?.up) { try { VX.tools[t].up(e); } catch (err) { console.error(err); toast(String(err.message || err), 'err'); } return; }
  VX.smartLines = []; VX.snapHit = null; VX.snapHint = null;
  if (t === 'select') return selectUp(e);
  if (t === 'direct') return directUp(e);
  if (t === 'pencil' && cur) { const p = cur; cur = null; if (p.segments.length < 2) { p.remove(); return; } if (O.smooth) p.simplify(O.smooth / 4); if (p.firstSegment.point.getDistance(p.lastSegment.point) < 8 / view.zoom && p.segments.length > 4) { p.closed = true; if (O.fill) p.fillColor = O.fill; } if (VX.iso) VX.iso.addChild(p); setSel([p]); commit('Pencil'); return; }
  if (['rect', 'ellipse', 'polygon', 'star', 'line'].includes(t) && drag) {
    if (!cur) { const s = drag.start; drag = null; shapeDialog(t, s); return; }
    const c = cur; cur = null; drag = null; setSel([c]); commit({ rect: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygon', star: 'Star', line: 'Line' }[t]); return;
  }
  if (t === 'gradient' && drag) { const a = drag.start, b = e.point; cur?.remove(); cur = null; drag = null; if (!sel.length || a.getDistance(b) < 3) return; sel.forEach(s => eachStyled(s, i => { i.fillColor = { gradient: { stops: [O.fill || '#ffffff', O.stroke || '#000000'], radial: e.modifiers.alt }, origin: a, destination: b }; })); commit('Gradient'); renderFS(); renderRight(); return; }
};
tool.onMouseMove = e => {
  const ab = abRect().topLeft; $('#stPos').textContent = `X ${Math.round(e.point.x - ab.x)}  Y ${Math.round(e.point.y - ab.y)}`;
  const tt = VX.tools[O.tool]; if (tt?.move) { tt.move(e); return; }
  if (O.tool === 'pen' && pen) { penPreview?.remove(); const last = pen.lastSegment; let pp = snapPt(e.point, [pen]); if (!VX.snapHit) pp = snapLineEnd(last.point, e.point, [pen]) || pp; penPreview = new P.Path({ segments: [new P.Segment(last.point, null, last.handleOut), new P.Segment(pp)], strokeColor: '#4f8cff', strokeWidth: 1 / view.zoom, insert: false }); drawGuides(); }
  else if (['pen', 'rect', 'ellipse', 'line', 'polygon', 'star', 'text'].includes(O.tool) && O.snapPoint) { const had = VX.snapHit; snapPt(e.point); if (had !== VX.snapHit) drawGuides(); }
  if (O.tool === 'select' && !drag && sel.length) { const b = selBounds(), z = view.zoom; const hi = handlePoints(b).findIndex(p => p.getDistance(e.point) < 7 / z); cv.style.cursor = hi >= 0 ? (hi % 4 === 1 ? 'ns-resize' : hi % 4 === 3 ? 'ew-resize' : hi === 0 || hi === 4 ? 'nwse-resize' : 'nesw-resize') : nearCornerOutside(b, e.point) ? 'alias' : 'default'; }
  if (O.tool === 'select' && !sel.length) cv.style.cursor = guideNear(e.point) ? (guideNear(e.point).axis === 'v' ? 'ew-resize' : 'ns-resize') : 'default';
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
    if (dbl && it.data?.live && VX.live[it.data.live.kind]?.edit) { setSel([it]); VX.live[it.data.live.kind].edit(it); return; }
    if (dbl && it instanceof P.Group) { enterIsolation(it); return; }
    const wasSel = sel.includes(it);
    if (e.modifiers.shift) setSel(wasSel ? sel.filter(x => x !== it) : [...sel, it]); else if (!wasSel) setSel([it]);
    if (e.modifiers.alt && sel.length) { const copies = sel.map(i => i.clone()); sel.forEach(i => i.fullySelected = false); setSel(copies); drag = { kind: 'move', dup: true, raw: new P.Point(0, 0), b0: selBounds(), cands: smartCandidates(copies) }; return; }
    drag = { kind: 'move', raw: new P.Point(0, 0), b0: selBounds(), cands: smartCandidates(sel), clickedSel: wasSel && !e.modifiers.shift ? it : null }; return;
  }
  const g = guideNear(p); if (g) { drag = { kind: 'guide', g }; return; }
  if (dbl && VX.iso) { exitIsolation(); return; }
  if (!e.modifiers.shift) setSel([]);
  marquee = { from: p, to: p, add: e.modifiers.shift }; drag = { kind: 'marquee' };
}
function selectDrag(e) {
  if (!drag) return; const p = e.point;
  if (drag.kind === 'move') {
    drag.raw = drag.raw.add(e.delta); let raw = drag.raw;
    if (e.modifiers.shift) raw = Math.abs(raw.x) > Math.abs(raw.y) ? new P.Point(raw.x, 0) : new P.Point(0, raw.y);
    const want = snapMove(drag.b0, raw, drag.cands); const curB = selBounds(); const d = drag.b0.topLeft.add(want).subtract(curB.topLeft);
    sel.forEach(i => i.translate(d)); drag.moved = true; drawGuides();
    const ab = abRect().topLeft; $('#stPos').textContent = `X ${Math.round(selBounds().x - ab.x)}  Y ${Math.round(selBounds().y - ab.y)}  Δ ${Math.round(want.x)}, ${Math.round(want.y)}`;
  }
  else if (drag.kind === 'guide') { drag.g.pos = Math.round(drag.g.axis === 'v' ? p.x : p.y); drag.moved = true; drawGuides(); }
  else if (drag.kind === 'scale') {
    const b0 = drag.b0, hi = drag.hi; const dirs = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]][hi];
    let x0 = b0.left, y0 = b0.top, x1 = b0.right, y1 = b0.bottom; const q = snapPt(p, sel);
    if (dirs[0] < 0) x0 = q.x; if (dirs[0] > 0) x1 = q.x; if (dirs[1] < 0) y0 = q.y; if (dirs[1] > 0) y1 = q.y;
    if (e.modifiers.alt) { const c = b0.center; if (dirs[0]) { const hw = Math.abs(q.x - c.x); x0 = c.x - hw; x1 = c.x + hw; } if (dirs[1]) { const hh = Math.abs(q.y - c.y); y0 = c.y - hh; y1 = c.y + hh; } }
    let nb = new P.Rectangle(new P.Point(Math.min(x0, x1), Math.min(y0, y1)), new P.Point(Math.max(x0, x1), Math.max(y0, y1)));
    if (e.modifiers.shift && dirs[0] && dirs[1]) { const k = Math.max(nb.width / b0.width, nb.height / b0.height); const w = b0.width * k, hgt = b0.height * k; nb = new P.Rectangle(dirs[0] < 0 ? b0.right - w : b0.left, dirs[1] < 0 ? b0.bottom - hgt : b0.top, w, hgt); }
    if (nb.width < 1 || nb.height < 1) return;
    const cur0 = drag.last; const sx = nb.width / (cur0.width || 1), sy = nb.height / (cur0.height || 1);
    const anchor = new P.Point(dirs[0] < 0 ? cur0.right : dirs[0] > 0 ? cur0.left : cur0.center.x, dirs[1] < 0 ? cur0.bottom : dirs[1] > 0 ? cur0.top : cur0.center.y);
    sel.forEach(i => { i.scale(sx || 1, sy || 1, anchor); });
    const ac = selBounds(); sel.forEach(i => i.translate(nb.topLeft.subtract(ac.topLeft)));
    drag.last = selBounds(); drag.moved = true; drawGuides(); $('#stPos').textContent = `W ${Math.round(nb.width)}  H ${Math.round(nb.height)}`;
  }
  else if (drag.kind === 'rotate') { let total = p.subtract(drag.c).angle - drag.a0; if (e.modifiers.shift) total = Math.round(total / 15) * 15; const d = total - drag.applied; sel.forEach(i => i.rotate(d, drag.c)); drag.applied = total; drag.moved = true; drawGuides(); $('#stPos').textContent = `${Math.round(total)}°`; }
  else if (drag.kind === 'marquee') { marquee.to = p; drawGuides(); }
}
function selectUp(e) {
  if (!drag) return; const d = drag; drag = null; VX.smartLines = [];
  if (d.kind === 'marquee') { const r = new P.Rectangle(marquee.from, marquee.to); const add = marquee.add; marquee = null; const rp = new P.Path.Rectangle({ rectangle: r, insert: false }); const items = selectableItems().filter(i => r.contains(i.bounds) || (r.intersects(i.bounds) && (i.intersects?.(rp) || i.bounds.contains(r) === false && r.contains(i.bounds.center)))); setSel(add ? [...new Set([...sel, ...items])] : items); return; }
  if (d.kind === 'guide') { const vp = view.projectToView(e.point); if (vp.x < 18 || vp.y < 18) DOC.guides = DOC.guides.filter(g => g !== d.g); drawGuides(); commit('Move guide'); return; }
  if (d.kind === 'move' && !d.moved && d.clickedSel && sel.length > 1) { VX.keyObj = d.clickedSel; if (O.alignTo !== 'key') O.alignTo = 'key'; drawGuides(); renderProps(); return; }
  if (d.moved || d.dup) commit({ move: d.dup ? 'Duplicate' : 'Move', scale: 'Scale', rotate: 'Rotate' }[d.kind]); drawGuides(); renderProps();
}

// ---- direct selection (with live-corner widgets)
function directDown(e, dbl) {
  const z = view.zoom;
  const cw = cornerSegs().find(s => cornerWidgetPos(s).getDistance(e.point) < 7 / z);
  if (cw) { const segs = cornerSegs(); drag = { kind: 'corner', segs: segs.map(s => ({ path: s.path, idx: s.index })), paths: [...new Set(segs.map(s => s.path))].map(p => ({ p, json: p.exportJSON({ asString: false }) })), start: e.point, w0: cornerWidgetPos(cw), seg0: cw.point.clone() }; return; }
  const hit = project.hitTest(e.point, hitOpts({ handles: true, segments: true, fill: true, stroke: true }));
  if (!hit) { if (!e.modifiers.shift) { selSegs.forEach(s => s.selected = false); selSegs = []; setSel([]); } marquee = { from: e.point, to: e.point }; drag = { kind: 'marquee' }; return; }
  const item = hit.item;
  if (!(item instanceof P.Path)) { setSel([topItem(item)]); drag = { kind: 'move', moved: false }; return; }
  if (!sel.includes(item)) { sel.forEach(i => i.fullySelected = false); sel = [item]; item.fullySelected = true; renderRight(); renderFS(); }
  if (hit.type === 'segment') {
    const seg = hit.segment;
    if (dbl) { if (seg.hasHandles()) seg.clearHandles(); else seg.smooth({ type: 'catmull-rom' }); commit('Toggle smooth'); return; }
    if (e.modifiers.shift) { seg.selected = !seg.selected; selSegs = seg.selected ? [...selSegs, seg] : selSegs.filter(s => s !== seg); }
    else if (!seg.selected) { item.segments.forEach(s => s.selected = false); selSegs.forEach(s => s.selected = false); seg.selected = true; selSegs = [seg]; }
    drag = { kind: 'segs', moved: false }; drawGuides(); return;
  }
  if (hit.type === 'handle-in' || hit.type === 'handle-out') { const seg = hit.segment; const smooth = seg.handleIn.length && seg.handleOut.length && Math.abs(seg.handleIn.angle - seg.handleOut.angle + 180) % 360 < 3; drag = { kind: 'handle', seg, which: hit.type === 'handle-in' ? 'handleIn' : 'handleOut', smooth: smooth && !e.modifiers.alt }; return; }
  if (e.modifiers.alt && (hit.type === 'stroke' || hit.type === 'curve')) { const loc = item.getNearestLocation(e.point); const seg = item.divideAt(loc); if (seg) { selSegs.forEach(s => s.selected = false); seg.selected = true; selSegs = [seg]; } commit('Add anchor'); drag = { kind: 'segs' }; return; }
  item.segments.forEach(s => s.selected = true); selSegs = [...item.segments]; drag = { kind: 'segs', moved: false }; drawGuides();
}
function directDrag(e) {
  if (!drag) return;
  if (drag.kind === 'segs') { const d = e.delta; selSegs.forEach(s => s.point = s.point.add(d)); drag.moved = true; drawGuides(); }
  else if (drag.kind === 'handle') { const s = drag.seg; s[drag.which] = e.point.subtract(s.point); if (drag.smooth) { const o = drag.which === 'handleIn' ? 'handleOut' : 'handleIn'; s[o] = s[drag.which].normalize(-s[o].length); } drag.moved = true; }
  else if (drag.kind === 'move') { sel.forEach(i => i.translate(e.delta)); drag.moved = true; }
  else if (drag.kind === 'corner') {
    const r = Math.max(0, e.point.getDistance(drag.seg0) - 16 / view.zoom) * 1.6;
    drag.paths.forEach(({ p, json }) => { p.importJSON(json); });
    const byPath = new Map(); drag.segs.forEach(({ path, idx }) => { if (!byPath.has(path)) byPath.set(path, []); byPath.get(path).push(idx); });
    byPath.forEach((idxs, path) => VX.f.roundCornersAt ? VX.f.roundCornersAt(path, idxs, r) : null);
    drag.moved = true; drag.r = r; $('#stPos').textContent = `Corner radius ${Math.round(r)}`; drawGuides();
  }
  else if (drag.kind === 'marquee') { marquee.to = e.point; drawGuides(); }
}
function directUp() {
  if (!drag) return; const d = drag; drag = null;
  if (d.kind === 'corner') { selSegs = []; if (d.moved) commit('Round corners'); drawGuides(); return; }
  if (d.kind === 'marquee') { const r = new P.Rectangle(marquee.from, marquee.to); marquee = null; const paths = selectableItems().flatMap(i => i instanceof P.Path ? [i] : i.getItems ? i.getItems({ class: P.Path }) : []).filter(p => !p.locked && p.visible && !isSys(p)); selSegs = []; const touched = []; paths.forEach(p => { let any = false; p.segments.forEach(s => { if (r.contains(s.point)) { selSegs.push(s); any = true; } }); if (any) touched.push(p); }); sel.forEach(i => i.fullySelected = false); sel = touched; sel.forEach(p => { p.fullySelected = true; p.segments.forEach(s => s.selected = r.contains(s.point)); }); drawGuides(); renderRight(); return; }
  if (d.moved) { commit(d.kind === 'handle' ? 'Edit handle' : 'Move anchor'); renderRight(); }
}

// ---- pen
function penDown(e) {
  const pt = snapPt(e.point, pen ? [pen] : []);
  if (!pen) { pen = styleNew(new P.Path(), {}); if (!O.stroke) { pen.strokeColor = '#000'; pen.strokeWidth = 1; } pen.fillColor = null; pen.add(pt); pen.fullySelected = true; drag = { seg: pen.lastSegment }; return; }
  if (!VX.snapHit && !e.modifiers.shift) { const sl = snapLineEnd(pen.lastSegment.point, e.point, [pen]); if (sl) pt.set(sl.x, sl.y); }
  if (pen.segments.length > 1 && pt.getDistance(pen.firstSegment.point) < 8 / view.zoom) { pen.closed = true; pen.fillColor = snapFillColor(O.fill); drag = { seg: pen.firstSegment, closing: true }; return; }
  pen.add(pt); drag = { seg: pen.lastSegment };
}
function penDrag(e) { if (!pen || !drag) return; const s = drag.seg; const v = e.point.subtract(s.point); if (drag.closing) { s.handleIn = v.multiply(-1); if (!e.modifiers.alt) s.handleOut = v; } else { s.handleOut = v; if (!e.modifiers.alt) s.handleIn = v.multiply(-1); } }
function finishPen() { VX.snapHint = null; if (!pen) return; const p = pen; pen = null; penPreview?.remove(); penPreview = null; p.fullySelected = false; if (p.segments.length < 2) { p.remove(); drawGuides(); return; } setSel([p]); commit('Pen path'); }
UI.shortcut('enter', () => { if (pen) finishPen(); else VX.tools[O.tool]?.enter?.(); });
UI.shortcut('escape', () => { if (pen) finishPen(); else if (textEd) finishText(false); else if (VX.tools[O.tool]?.escape?.()) return; else if (VX.iso) exitIsolation(); else setSel([]); });

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
function createText(pt) { const t = new P.PointText({ point: pt.add([0, O.fontSize * 0.8]), content: '', fontFamily: O.font, fontSize: O.fontSize, fontWeight: VX.fontWeightStr ? VX.fontWeightStr(O) : O.fontWeight, justification: O.justify, leading: O.fontSize * O.leading, fillColor: snapFillColor(O.fill && O.fill !== '#ffffff' ? O.fill : '#111111') }); t.data.tracking = O.tracking; if (VX.iso) VX.iso.addChild(t); editText(t, true); }
function editText(t, isNew) {
  const ta = h('textarea', { class: 'text-in', spellcheck: 'false' }); ta.value = t.content;
  const place = () => { const b = t.content ? t.bounds : new P.Rectangle(t.point.subtract([0, t.fontSize * 0.8]), new P.Size(10, t.fontSize)); const tl = view.projectToView(b.topLeft); ta.style.left = tl.x + 'px'; ta.style.top = tl.y + 'px'; ta.style.font = `${t.fontWeight} ${t.fontSize * view.zoom}px "${t.fontFamily}"`; ta.style.letterSpacing = ((t.data.tracking || 0) / 1000 * t.fontSize * view.zoom) + 'px'; const lines = ta.value.split('\n'); const cx = document.createElement('canvas').getContext('2d'); cx.font = ta.style.font; ta.style.width = Math.max(30, ...lines.map(l => cx.measureText(l).width + l.length * ((t.data.tracking || 0) / 1000 * t.fontSize * view.zoom))) + 16 + 'px'; ta.style.lineHeight = (t.leading * view.zoom) + 'px'; ta.style.height = lines.length * t.leading * view.zoom + 6 + 'px'; ta.style.textAlign = t.justification; };
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

// ---------------------------------------------------------------- edit ops
let clip = null;
function copy() { if (!sel.length) return; clip = sel.map(i => i.exportJSON({ asString: false })); toast(`Copied ${sel.length} object(s)`); }
function cut() { copy(); deleteSel(); }
async function paste(inPlace) {
  if (!clip) { try { const t = await navigator.clipboard.readText(); if (/^\s*(<\?xml|<svg)/i.test(t)) { const it = (VX.iso || project.activeLayer).importSVG(t, { expandShapes: true }); it.position = view.center; setSel([it]); commit('Paste SVG'); } } catch { } return; }
  const target = VX.iso || project.activeLayer; const items = clip.map(j => target.importJSON(j)); if (!inPlace) items.forEach(i => i.translate([10, 10])); setSel(items); commit('Paste');
}
function duplicate() { if (!sel.length) return; const c = sel.map(i => { const x = i.clone(); x.translate([10, 10]); return x; }); setSel(c); commit('Duplicate'); }
function deleteSel() {
  if (O.tool === 'direct' && selSegs.length) { const paths = new Set(selSegs.map(s => s.path)); selSegs.forEach(s => s.remove()); paths.forEach(p => { if (p.segments.length < 2) p.remove(); }); selSegs = []; setSel([...paths].filter(p => p.parent)); commit('Delete anchors'); return; }
  if (!sel.length) return; sel.forEach(i => i.remove()); setSel([]); commit('Delete');
}
function selectAll() { setSel(selectableItems()); }
function selectAllOnBoard() { setSel(itemsOnBoard(DOC.ab)); }
function selectInverse() { setSel(selectableItems().filter(i => !sel.includes(i))); }
function selectSame(which) { if (!sel.length) return; const ref = firstStyled(sel[0]); const c = which === 'fill' ? ref.fillColor : ref.strokeColor; if (!c) return; const css = c.toCSS(true); setSel(selectableItems().filter(i => { const s = firstStyled(i); const cc = s && (which === 'fill' ? s.fillColor : s.strokeColor); return cc && !cc.gradient && cc.toCSS(true) === css; })); }
UI.shortcut('ctrl+c', copy); UI.shortcut('ctrl+x', cut); UI.shortcut('ctrl+v', () => paste(false)); UI.shortcut('ctrl+shift+v', () => paste(true)); UI.shortcut('ctrl+d', duplicate);
UI.shortcut('delete', deleteSel); UI.shortcut('backspace', deleteSel); UI.shortcut('ctrl+a', selectAll); UI.shortcut('ctrl+alt+a', selectAllOnBoard); UI.shortcut('ctrl+shift+a', () => setSel([]));
['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].forEach(k => { const d = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k]; const go = m => { if (O.tool === 'direct' && selSegs.length) selSegs.forEach(s => s.point = s.point.add(new P.Point(d).multiply(m))); else moveSel(d[0] * m, d[1] * m); drawGuides(); commitDebounced('Nudge'); renderProps(); }; UI.shortcut(k, () => go(1)); UI.shortcut('shift+' + k, () => go(10)); });
function moveSel(dx, dy) { sel.forEach(i => i.translate([dx, dy])); }
function rotateSel(a) { const c = selBounds().center; sel.forEach(i => i.rotate(a, c)); commit('Rotate'); drawGuides(); renderProps(); }
function reflect(axis) { if (!sel.length) return; const c = selBounds().center; sel.forEach(i => i.scale(axis === 'h' ? -1 : 1, axis === 'v' ? -1 : 1, c)); commit('Reflect'); drawGuides(); }
async function moveDialog() { if (!sel.length) return; const v = await form({ title: 'Move', fields: [{ key: 'x', label: 'Horizontal', type: 'number', value: 0 }, { key: 'y', label: 'Vertical', type: 'number', value: 0 }, { key: 'copy', label: 'Copy', type: 'checkbox', value: false }] }); if (!v) return; if (v.copy) setSel(sel.map(i => i.clone())); moveSel(v.x, v.y); commit('Move'); drawGuides(); }
async function rotateDialog(ref) { if (!sel.length) return; const v = await form({ title: 'Rotate', fields: [{ key: 'a', label: 'Angle°', type: 'number', value: 45 }, { key: 'copy', label: 'Copy', type: 'checkbox', value: false }] }); if (!v) return; if (v.copy) setSel(sel.map(i => i.clone())); const c = ref || selBounds().center; sel.forEach(i => i.rotate(v.a, c)); commit('Rotate'); drawGuides(); renderProps(); }
async function scaleDialog(ref) { if (!sel.length) return; const v = await form({ title: 'Scale', fields: [{ key: 'x', label: 'Horizontal %', type: 'number', value: 100 }, { key: 'y', label: 'Vertical %', type: 'number', value: 100 }, { key: 'strokes', label: 'Scale strokes', type: 'checkbox', value: false }, { key: 'copy', label: 'Copy', type: 'checkbox', value: false }] }); if (!v) return; if (v.copy) setSel(sel.map(i => i.clone())); const c = ref || selBounds().center; sel.forEach(i => { i.scale(v.x / 100, v.y / 100, c); if (v.strokes) eachStyled(i, s => s.strokeWidth *= Math.sqrt(Math.abs(v.x * v.y)) / 100); }); commit('Scale'); drawGuides(); }
UI.shortcut('ctrl+shift+m', moveDialog);
function arrange(how) { if (!sel.length) return; const s = [...sel].sort((a, b) => a.index - b.index); if (how === 'front') s.forEach(i => i.bringToFront()); else if (how === 'bottom') [...s].reverse().forEach(i => i.sendToBack()); else if (how === 'fwd') [...s].reverse().forEach(i => { const n = i.nextSibling; if (n && !sel.includes(n)) i.insertAbove(n); }); else s.forEach(i => { const p = i.previousSibling; if (p && !sel.includes(p)) i.insertBelow(p); }); commit('Arrange'); }
UI.shortcut('ctrl+shift+]', () => arrange('front')); UI.shortcut('ctrl+]', () => arrange('fwd')); UI.shortcut('ctrl+[', () => arrange('back')); UI.shortcut('ctrl+shift+[', () => arrange('bottom'));
function group() { if (sel.length < 2) return; const s = [...sel].sort((a, b) => a.index - b.index); const top = s[s.length - 1]; const g = new P.Group(); g.insertAbove(top); g.addChildren(s); setSel([g]); commit('Group'); }
function ungroup() { const out = []; sel.forEach(i => { if (i instanceof P.Group) { if (i.clipped) { i.children[0].clipMask = false; } if (i.data?.live) { const L = VX.live[i.data.live.kind]; if (L?.expand) { out.push(...[].concat(L.expand(i))); return; } } const kids = i.removeChildren().filter(k => k.visible || true); i.parent.insertChildren(i.index, kids); i.remove(); out.push(...kids); } else out.push(i); }); setSel(out); commit('Ungroup'); }
UI.shortcut('ctrl+g', group); UI.shortcut('ctrl+shift+g', ungroup);
function lockSel() { sel.forEach(i => i.locked = true); setSel([]); commit('Lock'); }
function unlockAll() { allLayers().forEach(L => { L.locked = false; L.getItems({ recursive: true }).forEach(i => i.locked = false); }); commit('Unlock all'); renderRight(); }
function hideSel() { sel.forEach(i => i.visible = false); setSel([]); commit('Hide'); }
function showAll() { allLayers().forEach(L => { L.visible = true; L.getItems({ recursive: true }).forEach(i => { if (!insideLive(i)) i.visible = true; }); }); commit('Show all'); renderRight(); }
UI.shortcut('ctrl+2', lockSel); UI.shortcut('ctrl+alt+2', unlockAll); UI.shortcut('ctrl+3', hideSel); UI.shortcut('ctrl+alt+3', showAll);
function joinPaths() { const ps = sel.filter(i => i instanceof P.Path && !i.closed); if (ps.length === 1) { ps[0].closed = true; commit('Close path'); return; } if (ps.length < 2) return toast('Select two open paths'); const a = ps[0]; ps.slice(1).forEach(b => a.join(b, 10 / view.zoom)); setSel([a]); commit('Join'); }
UI.shortcut('ctrl+j', joinPaths);
const selPaths = () => sel.flatMap(i => i instanceof P.Path ? [i] : i.getItems ? i.getItems({ class: P.Path }).filter(p => !(p.parent instanceof P.CompoundPath) || true) : []);
function pathOp(op) { const ps = selPaths(); if (!ps.length) return toast('Select paths'); ps.forEach(p => { if (op === 'simplify') p.simplify(2.5); else if (op === 'smooth') p.smooth({ type: 'continuous' }); else if (op === 'flatten') p.flatten(2); else if (op === 'reverse') p.reverse(); else if (op === 'close') p.closed = true; }); commit({ simplify: 'Simplify', smooth: 'Smooth', flatten: 'Flatten', reverse: 'Reverse', close: 'Close path' }[op]); drawGuides(); }
function makeCompound() { const ps = sel.filter(i => i instanceof P.Path || i instanceof P.CompoundPath); if (ps.length < 2) return toast('Select two or more paths'); const s = [...ps].sort((a, b) => a.index - b.index); const cp = new P.CompoundPath({ fillRule: 'evenodd' }); cp.insertAbove(s[s.length - 1]); cp.style = s[0].style; s.forEach(p => cp.addChildren(p instanceof P.CompoundPath ? p.removeChildren() : [p])); ps.filter(p => p instanceof P.CompoundPath).forEach(p => p.remove()); setSel([cp]); commit('Compound path'); }
function releaseCompound() { const out = []; sel.forEach(i => { if (i instanceof P.CompoundPath) { const st = i.style; const kids = i.removeChildren(); kids.forEach(k => k.style = st); i.parent.insertChildren(i.index, kids); i.remove(); out.push(...kids); } else out.push(i); }); setSel(out); commit('Release compound path'); }
UI.shortcut('ctrl+8', makeCompound); UI.shortcut('ctrl+alt+shift+8', releaseCompound);
function makeClip() { if (sel.length < 2) return toast('Select the artwork and a shape on top to use as the mask'); const s = [...sel].sort((a, b) => a.index - b.index); const mask = s.pop(); const g = new P.Group(); g.insertAbove(mask); g.addChild(mask); g.addChildren(s); g.clipped = true; setSel([g]); commit('Clipping mask'); }
UI.shortcut('ctrl+7', makeClip); UI.shortcut('ctrl+alt+7', ungroup);
const isShape = i => i instanceof P.Path || i instanceof P.CompoundPath;
function pathfinder(op) {
  const ps = sel.filter(isShape).sort((a, b) => a.index - b.index);
  if (ps.length < 2) return toast('Select two or more shapes (paths or compound paths)');
  const ins = { insert: false };
  const place = (out, label) => { const parent = ps[ps.length - 1]; out.forEach(p => p.insertAbove(parent)); ps.forEach(p => p.remove()); setSel(out); commit(label); };
  const nonEmpty = x => x && !x.isEmpty() && Math.abs(x.area) > 0.01;
  if (op === 'divide' || op === 'outline') {
    let pieces = [{ p: ps[0].clone(ins), src: ps[0] }];
    for (let k = 1; k < ps.length; k++) { const nxt = []; for (const { p, src } of pieces) { nxt.push({ p: p.subtract(ps[k], ins), src }, { p: p.intersect(ps[k], ins), src: ps[k] }); } nxt.push({ p: ps.slice(0, k).reduce((acc, q) => acc.subtract(q, ins), ps[k].clone(ins)), src: ps[k] }); pieces = nxt.filter(x => nonEmpty(x.p)); }
    const out = pieces.flatMap(({ p, src }) => splitCompound(p).map(q => { q.style = src.style; if (op === 'outline') { q.strokeColor = src.fillColor || src.strokeColor || '#000'; q.fillColor = null; q.strokeWidth = 1; } return q; }));
    return place(out, op === 'divide' ? 'Divide' : 'Outline');
  }
  if (op === 'trim' || op === 'merge') {
    let out = ps.map((p, k) => { let r = p.clone(ins); r.strokeColor = null; for (let j = k + 1; j < ps.length; j++) r = r.subtract(ps[j], ins); r.style = p.style; r.strokeColor = null; return r; }).filter(nonEmpty);
    if (op === 'merge') { const byColor = new Map(); out.forEach(r => { const key = r.fillColor ? r.fillColor.toCSS(true) : 'none'; if (byColor.has(key)) { const m = byColor.get(key); const u = m.unite(r, ins); u.style = m.style; byColor.set(key, u); } else byColor.set(key, r); }); out = [...byColor.values()]; }
    return place(out, op === 'trim' ? 'Trim' : 'Merge');
  }
  if (op === 'crop') { const top = ps[ps.length - 1]; const out = ps.slice(0, -1).map(p => { const r = p.intersect(top, ins); r.style = p.style; return r; }).filter(nonEmpty); return place(out, 'Crop'); }
  if (op === 'minusBack') { const front = ps[ps.length - 1]; let r = front.clone(ins); ps.slice(0, -1).forEach(p => r = r.subtract(p, ins)); r.style = front.style; return place([r], 'Minus back'); }
  let res;
  if (op === 'subtract') { const front = ps[ps.length - 1]; res = ps.slice(0, -1).reduce((acc, p) => acc ? acc.unite(p, ins) : p.clone(ins), null); res = res.subtract(front, ins); res.style = ps[0].style; }
  else { res = ps[0].clone(ins); for (let k = 1; k < ps.length; k++) res = res[op](ps[k], ins); res.style = op === 'unite' ? ps[ps.length - 1].style : ps[0].style; }
  place([res], { unite: 'Unite', subtract: 'Minus front', intersect: 'Intersect', exclude: 'Exclude' }[op]);
}
function splitCompound(p) { if (!(p instanceof P.CompoundPath)) return [p]; const kids = p.children.slice(); const outers = kids.filter(c => c.clockwise === kids.reduce((a, b) => Math.abs(b.area) > Math.abs(a.area) ? b : a).clockwise); if (outers.length <= 1) return [p]; return outers.map(o => { const holes = kids.filter(c => c !== o && !outers.includes(c) && o.bounds.contains(c.bounds) && o.contains(c.interiorPoint)); if (!holes.length) { const q = o.clone({ insert: false }); q.style = p.style; return q; } const cp = new P.CompoundPath({ children: [o.clone({ insert: false }), ...holes.map(x => x.clone({ insert: false }))], insert: false }); cp.style = p.style; return cp; }); }
function rasterizeSel() { if (!sel.length) return; const out = sel.map(i => { const r = i.rasterize({ resolution: 300, insert: false }); r.insertAbove(i); i.remove(); return r; }); setSel(out); commit('Rasterize'); }
function alignRef() {
  const mode = O.alignTo === 'auto' ? (sel.length > 1 ? 'selection' : 'artboard') : O.alignTo;
  if (mode === 'key' && VX.keyObj && sel.includes(VX.keyObj)) return { r: VX.keyObj.strokeBounds, skip: VX.keyObj };
  if (mode === 'artboard' || sel.length < 2) return { r: abRect() };
  return { r: selBounds() };
}
function align(kind) {
  if (!sel.length) return; const { r: ref, skip } = alignRef();
  sel.forEach(i => { if (i === skip) return; const b = i.strokeBounds; const d = { alignL: [ref.left - b.left, 0], alignC: [ref.center.x - b.center.x, 0], alignR: [ref.right - b.right, 0], alignT: [0, ref.top - b.top], alignM: [0, ref.center.y - b.center.y], alignB: [0, ref.bottom - b.bottom] }[kind]; i.translate(d); });
  commit('Align'); drawGuides(); renderProps();
}
function distribute(axis) { if (sel.length < 3) return toast('Select three or more objects'); const s = [...sel].sort((a, b) => axis === 'h' ? a.bounds.center.x - b.bounds.center.x : a.bounds.center.y - b.bounds.center.y); const first = s[0].bounds.center, last = s[s.length - 1].bounds.center; s.forEach((i, k) => { const t = k / (s.length - 1); const target = axis === 'h' ? first.x + (last.x - first.x) * t : first.y + (last.y - first.y) * t; i.translate(axis === 'h' ? [target - i.bounds.center.x, 0] : [0, target - i.bounds.center.y]); }); commit('Distribute'); drawGuides(); }
function distributeSpacing(axis, gap = null) {
  if (sel.length < 2 || (gap === null && sel.length < 3)) return toast(gap === null ? 'Select three or more objects' : 'Select two or more objects');
  const s = [...sel].sort((a, b) => axis === 'h' ? a.strokeBounds.left - b.strokeBounds.left : a.strokeBounds.top - b.strokeBounds.top);
  const key = O.alignTo === 'key' && VX.keyObj && sel.includes(VX.keyObj) ? VX.keyObj : null;
  const sizes = s.map(i => axis === 'h' ? i.strokeBounds.width : i.strokeBounds.height);
  const start = axis === 'h' ? s[0].strokeBounds.left : s[0].strokeBounds.top, end = axis === 'h' ? s[s.length - 1].strokeBounds.right : s[s.length - 1].strokeBounds.bottom;
  const g = gap !== null ? gap : (end - start - sizes.reduce((a, b) => a + b, 0)) / (s.length - 1);
  let pos = start; if (key && gap !== null) { const ki = s.indexOf(key); pos = (axis === 'h' ? key.strokeBounds.left : key.strokeBounds.top) - sizes.slice(0, ki).reduce((a, b) => a + b, 0) - g * ki; }
  s.forEach((i, k) => { const b = i.strokeBounds; i.translate(axis === 'h' ? [pos - b.left, 0] : [0, pos - b.top]); pos += sizes[k] + g; });
  commit('Distribute spacing'); drawGuides();
}
async function spacingDialog() { const v = await form({ title: 'Distribute spacing', fields: [{ key: 'axis', label: 'Direction', type: 'select', value: 'h', options: [{ value: 'h', label: 'Horizontal' }, { value: 'v', label: 'Vertical' }] }, { key: 'mode', label: 'Spacing', type: 'select', value: 'auto', options: [{ value: 'auto', label: 'Even (keep outer objects)' }, { value: 'fixed', label: 'Exact gap' }] }, { key: 'gap', label: 'Gap (px) — key object stays put when aligning to key object', type: 'number', value: 20 }] }); if (!v) return; distributeSpacing(v.axis, v.mode === 'fixed' ? +v.gap : null); }
cv.addEventListener('contextmenu', e => { e.preventDefault(); contextMenu(e, [{ label: 'Undo', action: undo }, '-', { label: 'Cut', action: cut, disabled: !sel.length }, { label: 'Copy', action: copy, disabled: !sel.length }, { label: 'Paste', action: () => paste(false) }, { label: 'Duplicate', action: duplicate, disabled: !sel.length }, { label: 'Delete', action: deleteSel, disabled: !sel.length }, '-', { label: 'Group', action: group, disabled: sel.length < 2 }, { label: 'Ungroup', action: ungroup }, { label: 'Isolate group', action: () => enterIsolation(sel[0]), disabled: !(sel[0] instanceof P.Group) }, { label: 'Make clipping mask', action: makeClip, disabled: sel.length < 2 }, '-', { label: 'Bring to front', action: () => arrange('front') }, { label: 'Send to back', action: () => arrange('bottom') }, '-', { label: 'Transform', sub: [{ label: 'Rotate…', action: () => rotateDialog() }, { label: 'Scale…', action: () => scaleDialog() }, { label: 'Reflect horizontal', action: () => reflect('h') }, { label: 'Reflect vertical', action: () => reflect('v') }] }, { label: 'Recolor artwork…', action: F('recolor') }, { label: 'Copy as SVG', action: copyAsSVG }, { label: 'Export selection…', action: () => exportDialog('png', 'selection'), disabled: !sel.length }]); });

// ---------------------------------------------------------------- history
let hist = [], hi = -1;
function docState() { return { boards: DOC.boards.map(b => ({ ...b })), ab: DOC.ab, guides: DOC.guides.map(g => ({ ...g })), swatches: JSON.parse(JSON.stringify(DOC.swatches)), symbols: DOC.symbols }; }
function snapshot() { if (O.outline) setOutline(false); try { return JSON.stringify({ doc: docState(), layers: userLayers().map(L => L.exportJSON({ asString: false })), active: userLayers().indexOf(topLayerOf(project.activeLayer)) }); } finally { if (O.outline) setOutline(true); } }
function commit(label) { VX.beforeCommit.forEach(fn => { try { fn(label); } catch (e) { console.warn(e); } }); hist = hist.slice(0, hi + 1); hist.push({ label, s: snapshot() }); if (hist.length > 100) hist.shift(); hi = hist.length - 1; if (hist.length > 1) { DOC.dirty = true; UI.setDocTitle(DOC.name + ' •', 'BTS Vector'); } if (rtab === 'layers' || rtab === 'boards') renderRight(); }
let cdT = null, cdL = null; function commitDebounced(l) { clearTimeout(cdT); cdL = l; cdT = setTimeout(() => { cdT = null; commit(l); }, 400); }
function resetHistory(label = 'Open') { hist = []; hi = -1; commit(label); DOC.dirty = false; UI.setDocTitle(DOC.name, 'BTS Vector'); }
function flushCommit() { if (cdT) { clearTimeout(cdT); cdT = null; commit(cdL); } }
function loadDocState(d) {
  if (d.boards) { DOC.boards = d.boards.map(b => ({ ...b })); DOC.ab = Math.min(d.ab || 0, DOC.boards.length - 1); }
  else DOC.boards = [{ name: 'Artboard 1', x: 0, y: 0, w: d.w || 1200, h: d.h || 800, bg: d.bg || '#ffffff' }], DOC.ab = 0;
  DOC.guides = (d.guides || []).map(g => ({ ...g })); DOC.swatches = d.swatches ? JSON.parse(JSON.stringify(d.swatches)) : VX.defaultSwatches ? VX.defaultSwatches() : []; DOC.symbols = d.symbols || [];
}
function restore(s) {
  const d = JSON.parse(s); sel = []; selSegs = []; VX.iso = null; VX.keyObj = null; userLayers().forEach(L => L.remove());
  loadDocState(d.doc);
  importLayers(d.layers);
  if (!userLayers().length) newUserLayer(); (userLayers()[d.active] || userLayers()[0]).activate(); if (O.outline) setOutline(true); drawArtboard(); setSel([]); renderOptions();
}
// paper's project.importJSON() imports *into* the active layer when it is empty, so import while the (never empty) artboard layer is active
function importLayers(list) { const pin = new P.Path({ parent: artLayer }); list.forEach(j => { artLayer.activate(); const L = project.importJSON(j); if (L === artLayer || L === guideLayer) throw new Error('layer import clobbered a system layer'); L.insertBelow(guideLayer); }); pin.remove(); }
function undo() { if (pen) return finishPen(); if (hi > 0) { hi--; restore(hist[hi].s); } }
function redo() { if (hi < hist.length - 1) { hi++; restore(hist[hi].s); } }
UI.shortcut('ctrl+z', undo); UI.shortcut('ctrl+shift+z', redo);
// selection keys survive restore() (used by live-preview dialogs)
// indices are looked up with indexOf: paper's cached _index can be stale for layers moved with insertAbove/insertBelow
function selKeys(items = sel) { return items.map(it => { const path = []; let x = it; while (x && x.parent) { path.unshift(x.parent.children.indexOf(x)); x = x.parent; } if (x) path.unshift(project.layers.indexOf(x)); return path; }); }
function resolveKeys(keys) { return keys.map(path => { let x = project; for (const i of path) { x = (x === project ? project.layers : x.children)[i]; if (!x) return null; } return x; }).filter(Boolean); }
function lightenModal() { const m = [...document.querySelectorAll('.modal-back')].pop(); if (m) m.classList.add('vx-preview'); }
async function withPreview({ title, fields, apply, label, ok = 'OK', width, needSel = true, onDone, setup }) {
  if (needSel && !sel.length) { toast('Select one or more objects first'); return null; }
  flushCommit(); const S = snapshot(); const keys = selKeys(); let lastErr = null;
  const run = (vals, final = false) => { restoreQuiet(S, keys); try { apply({ ...vals }, { final }); lastErr = null; } catch (e) { lastErr = e; console.warn(e); } drawGuides(); view.update(); };
  const defaults = Object.fromEntries(fields.map(f => [f.key, f.value]));
  run(defaults); let curVals = { ...defaults };
  const pr = form({ title, fields, ok, width, onChange: v => { curVals = { ...v }; run(v); } }); lightenModal();
  // setup(api) lets a dialog drive its own preview (e.g. an animated turntable); it returns a cleanup function
  const cleanup = setup ? setup({ run: patch => run({ ...curVals, ...patch }), vals: () => curVals, modal: [...document.querySelectorAll('.modal-back')].pop() }) : null;
  const v = await pr; try { cleanup && cleanup(); } catch (e) { console.warn(e); }
  if (!v) { restoreQuiet(S, keys); return null; }
  run(v, true); if (lastErr) { toast(String(lastErr.message || lastErr), 'err'); } commit(label || title); onDone && onDone(v); return v;
}
function restoreQuiet(S, keys) { restore(S); setSel(resolveKeys(keys)); }

// ---------------------------------------------------------------- new document, presets & templates
const PRESETS = {
  logo: { label: 'Logo 1000×1000', w: 1000, h: 1000 }, a3: { label: 'Poster A3 (297×420 mm)', w: 1123, h: 1587 }, a4: { label: 'Poster A4 (210×297 mm)', w: 794, h: 1123 }, a4l: { label: 'A4 landscape', w: 1123, h: 794 },
  card: { label: 'Business card 3.5×2 in', w: 1050, h: 600 }, insta: { label: 'Instagram post 1080×1080', w: 1080, h: 1080 }, story: { label: 'Instagram story 1080×1920', w: 1080, h: 1920 },
  pres: { label: 'Presentation 16:9 1920×1080', w: 1920, h: 1080 }, icon: { label: 'Icon 512×512', w: 512, h: 512 }, letter: { label: 'US Letter 8.5×11 in', w: 816, h: 1056 }, custom: { label: 'Custom', w: 1200, h: 800 },
};
VX.PRESETS = PRESETS;
function resetDoc(w, h2, name, bg) { project.clear(); artLayer = guideLayer = null; VX.iso = null; DOC.boards = [{ name: 'Artboard 1', x: 0, y: 0, w, h: h2, bg: bg || '#ffffff' }]; DOC.ab = 0; DOC.guides = []; DOC.swatches = VX.defaultSwatches ? VX.defaultSwatches() : []; DOC.symbols = []; DOC.name = name; DOC.path = null; layerN = 1; setupSystemLayers(); sel = []; hist = []; hi = -1; commit('New'); DOC.dirty = false; fitArt(); setSel([]); UI.setDocTitle(name, 'BTS Vector'); }
async function newDialog(withTemplate) {
  if (DOC.dirty && !(await confirm('Discard changes?', 'The current artwork has unsaved changes.', 'Discard'))) return;
  let pick = 'a4'; const vals = { name: 'Untitled-1', w: 1200, h: 800, boards: 1, tpl: !!withTemplate };
  const grid = h('div', { class: 'preset-grid' });
  const draw = () => { grid.innerHTML = ''; Object.entries(PRESETS).forEach(([k, p]) => { const s = 46 / Math.max(p.w, p.h); grid.append(h('div', { class: 'preset' + (k === pick ? ' on' : ''), onclick: () => { pick = k; draw(); } }, h('div', { class: 'thumb' }, h('div', { style: { width: p.w * s + 'px', height: p.h * s + 'px' } })), h('div', { class: 'pl' }, p.label))); }); };
  draw();
  const name = h('input', { type: 'text', value: vals.name }), cw = h('input', { type: 'number', value: 1200 }), ch = h('input', { type: 'number', value: 800 }), nb = h('input', { type: 'number', value: 1, min: 1, max: 50 }), tpl = h('input', { type: 'checkbox', checked: vals.tpl });
  const body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, h('label', { class: 'field' }, 'Name', name), h('div', { class: 'muted' }, 'Document preset'), grid, h('div', { class: 'grid2' }, h('label', {}, 'Width', cw), h('label', {}, 'Height', ch), h('label', {}, 'Artboards', nb)), h('div', { class: 'muted', style: { fontSize: '11px', marginTop: '-6px' } }, 'Width / height apply to the Custom preset'), h('label', { class: 'row', style: { color: 'var(--tx-1)' } }, tpl, 'Start from template (starter layout, text and guides)'));
  const r = await modal({ title: 'New document', body, width: 640, buttons: [{ label: 'Cancel', value: null }, { label: 'Create', primary: true, value: 'ok' }] });
  if (r !== 'ok') return;
  createDoc(pick, { name: name.value || 'Untitled-1', w: +cw.value, h: +ch.value, boards: +nb.value, template: tpl.checked });
}
function createDoc(pick, { name = 'Untitled-1', w, h: hh, boards = 1, template = false } = {}) {
  const p = PRESETS[pick] || PRESETS.custom; const W = pick === 'custom' ? (w || 1200) : p.w, H = pick === 'custom' ? (hh || 800) : p.h;
  resetDoc(W, H, name); for (let i = 1; i < Math.max(1, Math.min(50, boards)); i++) DOC.boards.push({ name: `Artboard ${i + 1}`, x: i * (W + 60), y: 0, w: W, h: H, bg: '#ffffff' });
  if (template) applyTemplate(pick);
  drawArtboard(); hist = []; hi = -1; commit('New'); DOC.dirty = false; DOC.boards.length > 1 ? fitAll() : fitArt();
}
function applyTemplate(kind) {
  const b = DOC.boards[0]; const W = b.w, H = b.h; const m = Math.round(Math.min(W, H) * 0.06);
  const T = (content, x, y, size, opts = {}) => { const t = new P.PointText({ point: [x, y], content, fontFamily: opts.font || 'Segoe UI', fontSize: size, fontWeight: opts.weight || 'normal', justification: opts.just || 'left', fillColor: opts.color || '#1d1f24', leading: size * 1.2 }); t.data.tracking = opts.tracking || 0; return t; };
  const R = (x, y, w, hh, color, r = 0) => new P.Path.Rectangle({ rectangle: [x, y, w, hh], radius: r, fillColor: color });
  DOC.guides.push({ axis: 'v', pos: m }, { axis: 'v', pos: W - m }, { axis: 'h', pos: m }, { axis: 'h', pos: H - m });
  if (kind === 'a3' || kind === 'a4' || kind === 'a4l' || kind === 'letter') { R(0, 0, W, H * 0.42, '#ff9a00'); T('POSTER TITLE', m, H * 0.3, W * 0.1, { weight: 'bold', color: '#ffffff' }); T('A short subtitle goes here', m, H * 0.36, W * 0.035, { color: '#ffffff' }); T('Event details · Date · Venue\nMore information line two', m, H * 0.55, W * 0.03, {}); T('yourwebsite.example', m, H - m, W * 0.025, { color: '#666a75' }); }
  else if (kind === 'card') { R(0, 0, W * 0.36, H, '#1d1f24'); new P.Path.Circle({ center: [W * 0.18, H * 0.5], radius: H * 0.16, fillColor: '#ff9a00' }); T('Your Name', W * 0.42, H * 0.38, H * 0.11, { weight: 'bold' }); T('Job title', W * 0.42, H * 0.5, H * 0.06, { color: '#666a75' }); T('+00 00000 00000\nname@example.com\nexample.com', W * 0.42, H * 0.66, H * 0.05, {}); }
  else if (kind === 'insta' || kind === 'story') { R(0, 0, W, H, '#fde68a'); new P.Path.Circle({ center: [W * 0.8, H * 0.2], radius: W * 0.25, fillColor: '#ff9a00', opacity: 0.8 }); T('Big bold\nheadline', m, H * 0.55, W * 0.11, { weight: 'bold' }); T('@yourhandle', m, H - m, W * 0.04, { color: '#666a75' }); }
  else if (kind === 'pres') { R(0, 0, W * 0.012, H, '#ff9a00'); T('Presentation title', m * 1.5, H * 0.45, H * 0.09, { weight: 'bold' }); T('Subtitle · Presenter name · Date', m * 1.5, H * 0.55, H * 0.035, { color: '#666a75' }); }
  else if (kind === 'logo') { new P.Path.Circle({ center: [W / 2, H * 0.42], radius: W * 0.2, fillColor: '#ff9a00' }); new P.Path.Star({ center: [W / 2, H * 0.42], points: 5, radius1: W * 0.12, radius2: W * 0.05, fillColor: '#ffffff' }); T('BRAND', W / 2, H * 0.78, W * 0.09, { weight: 'bold', just: 'center', tracking: 200 }); }
  else if (kind === 'icon') { DOC.guides.push({ axis: 'v', pos: W / 2 }, { axis: 'h', pos: H / 2 }); new P.Path.Rectangle({ rectangle: [W * 0.06, H * 0.06, W * 0.88, H * 0.88], radius: W * 0.2, fillColor: '#31a8ff' }); new P.Path.Circle({ center: [W / 2, H / 2], radius: W * 0.22, fillColor: '#ffffff' }); }
  else { T('Title', m, m + 60, 48, { weight: 'bold' }); }
}
UI.shortcut('ctrl+n', () => newDialog());
async function docSetup() { const v = await form({ title: 'Document setup', fields: [{ key: 'w', label: 'Artboard width (px)', type: 'number', value: DOC.w }, { key: 'h', label: 'Artboard height (px)', type: 'number', value: DOC.h }, { key: 'bg', label: 'Artboard color', type: 'color', value: toHex(DOC.bg && DOC.bg !== 'transparent' ? DOC.bg : '#ffffff') }, { key: 'grid', label: 'Grid size (px)', type: 'number', value: O.gridSize }] }); if (!v) return; DOC.w = +v.w; DOC.h = +v.h; DOC.bg = v.bg; O.gridSize = Math.max(2, +v.grid); drawArtboard(); commit('Document setup'); fitArt(); }
UI.shortcut('ctrl+alt+p', docSetup);

// ---------------------------------------------------------------- files
async function openDialog(exts) { const fs = await bts.fs.open({ filters: [{ name: 'Vector & images', extensions: Array.isArray(exts) ? exts : ['btsv', 'svg', 'pdf', 'ai', 'eps', 'dxf', 'png', 'jpg', 'jpeg', 'webp'] }] }); if (fs) openFile(fs[0]); }
UI.shortcut('ctrl+o', () => openDialog());
async function openFile(f) {
  const txt = () => new TextDecoder().decode(new Uint8Array(f.data));
  try {
    if (/\.(pdf|ai|eps|epsf|ps)$/i.test(f.name) || (!/\.(btsv|svg|dxf|png|jpe?g|webp)$/i.test(f.name) && VX.f.sniffVector && VX.f.sniffVector(new Uint8Array(f.data)) !== 'unknown')) { const r = await VX.f.importVector({ ...f, data: new Uint8Array(f.data) }, { mode: 'open', ...(f.importOpts || {}) }); if (r && f.path) bts.recent.add(f.path); return r; }
    if (/\.dxf$/i.test(f.name)) { const r = await VX.f.importDXF({ ...f, data: new Uint8Array(f.data) }, { mode: 'open', ...(f.importOpts || {}) }); if (r && f.path) bts.recent.add(f.path); return r; }
    if (/\.btsv$/i.test(f.name)) { const j = JSON.parse(txt()); resetDoc(1, 1, f.name); userLayers().forEach(L => L.remove()); loadDocState(j.doc); importLayers(j.layers); activateUserLayer(); drawArtboard(); hist = []; hi = -1; commit('Open'); DOC.dirty = false; }
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
const toDataUrl = (u8, name) => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(new Blob([u8], { type: /\.png$/i.test(name) ? 'image/png' : /\.svg$/i.test(name) ? 'image/svg+xml' : /\.webp$/i.test(name) ? 'image/webp' : 'image/jpeg' })); });
function placeRaster(url, at) { return new Promise(res => { const r = new P.Raster({ source: url, position: at || view.center }); if (VX.iso) VX.iso.addChild(r); r.onLoad = () => { const k = Math.min(1, DOC.w * 0.8 / r.width, DOC.h * 0.8 / r.height); r.scale(k); setSel([r]); commit('Place image'); res(r); }; }); }
async function placeImage() { const fs = await bts.fs.open({ filters: [{ name: 'Images & vector files', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg', 'pdf', 'ai', 'eps', 'dxf'] }] }); if (!fs) return; const f = fs[0];
  if (/\.(pdf|ai|eps|epsf|ps|dxf)$/i.test(f.name)) { try { return await (/\.dxf$/i.test(f.name) ? VX.f.importDXF : VX.f.importVector)({ ...f, data: new Uint8Array(f.data) }, { mode: 'place' }); } catch (e) { console.error(e); toast('Could not place file: ' + e.message, 'err', 7000); } return; }
  if (/\.svg$/i.test(f.name)) { const it = (VX.iso || project.activeLayer).importSVG(new TextDecoder().decode(new Uint8Array(f.data)), { expandShapes: true }); it.position = view.center; setSel([it]); commit('Place SVG'); return; }
  await placeRaster(await toDataUrl(new Uint8Array(f.data), f.name)); }
UI.shortcut('ctrl+shift+p', placeImage);
function docJSON() { return JSON.stringify({ app: 'BTS Vector', v: 2, doc: docState(), layers: (() => { if (O.outline) setOutline(false); try { return userLayers().map(L => L.exportJSON({ asString: false })); } finally { if (O.outline) setOutline(true); } })() }); }
async function save(as, toPath) {
  finishText(true); finishPen();
  const data = new TextEncoder().encode(docJSON());
  let p = toPath || (!as && DOC.path); if (p) await bts.fs.write({ path: p, data }); else { p = await bts.fs.saveAs({ data, defaultPath: DOC.name.replace(/\.\w+$/, '') + '.btsv', filters: [{ name: 'BTS Vector', extensions: ['btsv'] }] }); if (!p) return; }
  DOC.path = p; DOC.name = p.split(/[\\/]/).pop(); DOC.dirty = false; UI.setDocTitle(DOC.name, 'BTS Vector'); toast('Saved ' + DOC.name, 'ok'); VX.f.autosaveClear?.(); return p;
}
UI.shortcut('ctrl+s', () => save(false)); UI.shortcut('ctrl+shift+s', () => save(true));

// ---- export
const shadowCSS = it => { const c = it.shadowColor; return c ? { dx: it.shadowOffset?.x || 0, dy: it.shadowOffset?.y || 0, blur: it.shadowBlur || 0, color: c.toCSS(true), op: c.alpha } : null; };
function onExportHook(item, node) {
  try {
    if (item.shadowColor && node.setAttribute) node.setAttribute('data-vx-shadow', JSON.stringify(shadowCSS(item)));
    if (item instanceof P.PointText && node.setAttribute) {
      const fw = String(item.fontWeight || ''); if (/italic/i.test(fw)) { node.setAttribute('font-style', 'italic'); const w = fw.replace(/italic/i, '').trim(); if (w) node.setAttribute('font-weight', w); else node.removeAttribute('font-weight'); }
      if (item.data?.tracking) node.setAttribute('letter-spacing', (item.data.tracking / 1000 * item.fontSize).toFixed(2));
    }
    if (node.setAttribute) (VX.exportHooks || []).forEach(fn => fn(item, node));
  } catch (e) { console.warn(e); }
  return node;
}
function withExportScene(fn, { only = null, board = DOC.ab, bg = true, pdf = false } = {}) {
  finishText(true); const prevSel = sel; const prevIso = VX.iso; VX.iso = null; setSel([]); const outline = O.outline; if (outline) setOutline(false);
  const ga = guideLayer, aa = artLayer; ga.remove(); aa.remove();
  const hidden = []; if (only) { const keep = new Set(only); selectableItems().forEach(i => { if (!keep.has(i) && !only.some(o => o.isDescendant?.(i))) { hidden.push(i); i.visible = false; } }); }
  const b = DOC.boards[board]; const bgRect = bg && !only && b.bg && b.bg !== 'transparent' ? new P.Path.Rectangle({ rectangle: abRect(board), fillColor: b.bg, insert: false }) : null; if (bgRect) userLayers()[0].insertChild(0, bgRect);
  const extras = pdf && VX.f.pdfFixups ? VX.f.pdfFixups() : [];
  try { return fn(); } finally { extras.forEach(x => x.undo()); bgRect?.remove(); hidden.forEach(i => i.visible = true); project.insertLayer(0, aa); project.addLayer(ga); activateUserLayer(); if (outline) setOutline(true); VX.iso = prevIso; setSel(prevSel.filter(i => i.parent)); }
}
function svgString(forPdf, opts = {}) {
  const board = opts.board ?? DOC.ab; const rect = opts.rect || abRect(board);
  const s = withExportScene(() => project.exportSVG({ asString: true, bounds: rect, matchShapes: !forPdf, precision: 3, onExport: onExportHook }), { ...opts, board, pdf: forPdf });
  const d = new DOMParser().parseFromString(s, 'image/svg+xml'); const root = d.documentElement;
  VX.svgPost.forEach(fn => { try { fn(root, d, forPdf); } catch (e) { console.warn(e); } });
  root.querySelectorAll('[visibility="hidden"]').forEach(el => el.remove());
  root.querySelectorAll('[font-weight]').forEach(el => { const fw = el.getAttribute('font-weight'); if (/italic/i.test(fw)) { el.setAttribute('font-style', 'italic'); const w = fw.replace(/italic/i, '').trim(); if (w && w !== 'none') el.setAttribute('font-weight', w); else el.removeAttribute('font-weight'); } else if (fw === 'none') el.removeAttribute('font-weight'); });
  const NONE_ATTRS = ['stroke-width', 'font-size', 'font-family', 'font-weight', 'text-anchor', 'stroke-linejoin', 'stroke-linecap', 'stroke-miterlimit', 'stroke-dashoffset', 'fill-rule', 'letter-spacing'];
  if (forPdf) root.querySelectorAll(NONE_ATTRS.map(a => `[${a}="none"]`).join(',')).forEach(el => NONE_ATTRS.forEach(a => el.getAttribute(a) === 'none' && el.removeAttribute(a)));
  let defs = root.querySelector('defs'); let fid = 0;
  root.querySelectorAll('[data-vx-shadow]').forEach(el => { const sh = JSON.parse(el.getAttribute('data-vx-shadow')); el.removeAttribute('data-vx-shadow'); if (forPdf) return; if (!defs) { defs = d.createElementNS('http://www.w3.org/2000/svg', 'defs'); root.insertBefore(defs, root.firstChild); } const f = d.createElementNS('http://www.w3.org/2000/svg', 'filter'); const id = 'vxshadow' + (fid++); f.setAttribute('id', id); f.setAttribute('x', '-50%'); f.setAttribute('y', '-50%'); f.setAttribute('width', '200%'); f.setAttribute('height', '200%'); const ds = d.createElementNS('http://www.w3.org/2000/svg', 'feDropShadow'); ds.setAttribute('dx', sh.dx); ds.setAttribute('dy', sh.dy); ds.setAttribute('stdDeviation', (sh.blur / 2).toFixed(2)); const c = new P.Color(sh.color); ds.setAttribute('flood-color', new P.Color(c.red, c.green, c.blue).toCSS(true)); ds.setAttribute('flood-opacity', sh.op ?? 1); f.append(ds); defs.append(f); el.setAttribute('filter', `url(#${id})`); });
  root.querySelectorAll('[data-paper-data]').forEach(el => el.removeAttribute('data-paper-data'));
  root.setAttribute('width', Math.round(rect.width * 1000) / 1000); root.setAttribute('height', Math.round(rect.height * 1000) / 1000); root.setAttribute('viewBox', `${rect.x} ${rect.y} ${rect.width} ${rect.height}`); root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(root);
}
async function svgToCanvas(s, w, hh, scale, fillBg) { const url = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' })); const im = new Image(); im.src = url; await im.decode(); const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(hh * scale)); const x = c.getContext('2d'); if (fillBg) { x.fillStyle = fillBg; x.fillRect(0, 0, c.width, c.height); } x.drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url); return c; }
async function renderToCanvas(scale, bgWhite, opts = {}) { const rect = opts.rect || abRect(opts.board ?? DOC.ab); return svgToCanvas(svgString(false, opts), rect.width, rect.height, scale, bgWhite ? '#fff' : null); }
async function buildPDF(pages) {
  const { jsPDF } = window.jspdf; let pdf = null;
  for (const pg of pages) {
    const W = pg.w * 0.75, H = pg.h * 0.75;
    if (!pdf) pdf = new jsPDF({ unit: 'pt', format: [W, H], orientation: W > H ? 'landscape' : 'portrait' }); else pdf.addPage([W, H], W > H ? 'landscape' : 'portrait');
    const holder = h('div', { style: { position: 'fixed', left: '-99999px', top: 0 } }); holder.innerHTML = pg.svg.replace(/^<\?xml[^>]*>\s*/, ''); document.body.append(holder);
    try { await window.svg2pdf.svg2pdf(holder.querySelector('svg'), pdf, { x: 0, y: 0, width: W, height: H }); } finally { holder.remove(); }
  }
  return new Uint8Array(pdf.output('arraybuffer'));
}
const safeName = s => String(s).replace(/[\\/:*?"<>|]+/g, '_').trim() || 'artboard';
// exportTo: fmt svg|png|jpeg|webp|pdf; scope board|all|selection; returns written paths. If `path` given, writes there without a dialog.
async function exportTo({ fmt = 'png', scope = 'board', scale = 1, transparent = false, path = null, quality = 0.92, outlineText = false, dither = false, ditherAmt = 3 } = {}) {
  flushCommit(); const base = DOC.name.replace(/\.\w+$/, ''); const ext = fmt === 'jpeg' ? 'jpg' : fmt;
  let targets;
  if (scope === 'selection') { if (!sel.length) { toast('Select something to export'); return []; } const only = [...sel]; targets = [{ name: base + '-selection', opts: { rect: selBounds(), only, bg: false } }]; }
  else if (scope === 'all') targets = DOC.boards.map((b, i) => ({ name: base + '-' + safeName(b.name), bname: b.name, opts: { board: i, bg: !transparent } }));
  else if (scope === 'selected') { const idx = DOC.boards.map((b, i) => b.picked ? i : -1).filter(i => i >= 0); if (!idx.length) { toast('Tick one or more artboards in the Artboards panel first'); return []; } targets = idx.map(i => ({ name: base + '-' + safeName(DOC.boards[i].name), bname: DOC.boards[i].name, opts: { board: i, bg: !transparent } })); }
  else targets = [{ name: base, bname: DOC.boards[DOC.ab].name, opts: { board: DOC.ab, bg: !transparent } }];
  const rectOf = t => t.opts.rect || abRect(t.opts.board);
  const bytesFor = async t => {
    if (fmt === 'svg') return new TextEncoder().encode(svgString(false, t.opts));
    const r = rectOf(t); const c = await svgToCanvas(svgString(false, t.opts), r.width, r.height, scale, fmt === 'jpeg' ? '#ffffff' : null);
    if (dither && VX.f.ditherCanvas) await VX.f.ditherCanvas(c, t.opts, r, scale, ditherAmt);
    const blob = await new Promise(res => c.toBlob(res, 'image/' + fmt, quality)); return UI.blobToU8(blob);
  };
  const filters = [{ name: fmt.toUpperCase(), extensions: [ext] }];
  if (fmt === 'pdf') {
    let S = null, keys = null; const hasText = selectableItems().some(i => i instanceof P.PointText || i.data?.live?.kind === 'top' || (i.getItems && i.getItems({ class: P.PointText }).length));
    if (outlineText && hasText && VX.f.createOutlines) { S = snapshot(); keys = selKeys(); const onlyKeys = targets.map(t => t.opts.only ? selKeys(t.opts.only) : null); setSel(allLayers().flatMap(L => L.getItems({ recursive: true, match: i => i instanceof P.PointText || i.data?.live?.kind === 'top' })).filter(i => !i.parent?.data?.live)); await VX.f.createOutlines({ quiet: true }); targets.forEach((t, k) => { if (onlyKeys[k]) t.opts.only = resolveKeys(onlyKeys[k]); }); }
    let pages; try { pages = targets.map(t => { const r = rectOf(t); return { svg: svgString(true, t.opts), w: r.width, h: r.height }; }); } finally { if (S) { restore(S); setSel(resolveKeys(keys)); } }
    const data = await buildPDF(pages); if (path === 'bytes') return data; const name = scope === 'all' || scope === 'selected' ? base : targets[0].name;
    const p = path ? await bts.fs.write({ path, data }) : await bts.fs.saveAs({ data, defaultPath: name + '.pdf', filters }); if (p) toast(`Exported ${pages.length}-page vector PDF`, 'ok'); return p ? [p] : [];
  }
  const out = []; let first = path;
  for (let k = 0; k < targets.length; k++) {
    const t = targets[k]; const data = await bytesFor(t);
    if (k === 0) { const p = first ? await bts.fs.write({ path: first, data }) : await bts.fs.saveAs({ data, defaultPath: t.name + '.' + ext, filters }); if (!p) return []; first = p; out.push(p); }
    else { const dir = first.replace(/[^\\/]*$/, ''); const stem = first.replace(/^.*[\\/]/, '').replace(/\.\w+$/, ''); const p = dir + stem.replace(new RegExp('-' + safeName(targets[0].bname).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), '') + '-' + safeName(t.bname) + '.' + ext; await bts.fs.write({ path: p, data }); out.push(p); }
  }
  toast(`Exported ${out.length} ${ext.toUpperCase()} file${out.length > 1 ? 's' : ''}`, 'ok'); return out;
}
async function exportDialog(fmt = 'png', scope, extra = {}) {
  scope = scope || 'board'; const npick = DOC.boards.filter(b => b.picked).length;
  const v = await form({ title: 'Export', ok: 'Export', fields: [
    { key: 'fmt', label: 'Format', type: 'select', value: fmt, options: [{ value: 'svg', label: 'SVG (vector)' }, { value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPEG' }, { value: 'webp', label: 'WebP' }, { value: 'pdf', label: 'PDF (vector)' }] },
    { key: 'scope', label: 'What to export', type: 'select', value: scope, options: [{ value: 'board', label: `Current artboard (${DOC.boards[DOC.ab].name})` }, { value: 'all', label: `All ${DOC.boards.length} artboard(s) — one file each / multi-page PDF` }, { value: 'selected', label: `Selected artboards (${npick} ticked in the Artboards panel)` }, { value: 'selection', label: 'Selection only' }] },
    { key: 'scale', label: 'Scale (raster formats)', type: 'select', value: '2', options: [{ value: '0.5', label: '0.5×' }, { value: '1', label: '1×' }, { value: '2', label: '2×' }, { value: '3', label: '3×' }, { value: '4', label: '4× (print)' }] },
    { key: 'q', label: 'Quality (JPEG / WebP)', type: 'range', value: 92, min: 30, max: 100 },
    { key: 't', label: 'Transparent background (PNG / WebP / SVG)', type: 'checkbox', value: false },
    { key: 'dither', label: 'Raster: dither gradients (adds slight noise to stop banding)', type: 'checkbox', value: !!extra.dither },
    { key: 'ol', label: 'PDF: convert type to outlines (keeps exact fonts)', type: 'checkbox', value: true }] });
  if (!v) return; return exportTo({ fmt: v.fmt, scope: v.scope, scale: +v.scale, transparent: v.t, quality: v.q / 100, outlineText: v.ol, dither: v.dither });
}
UI.shortcut('ctrl+alt+e', () => exportDialog());
async function copyAsSVG() {
  const s = sel.length ? svgString(false, { rect: selBounds(), only: [...sel], bg: false }) : svgString(false);
  try { await navigator.clipboard.writeText(s); } catch { const ta = h('textarea', {}, s); document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  toast('SVG copied to the clipboard (' + Math.round(s.length / 1024) + ' KB)', 'ok'); return s;
}
UI.shortcut('ctrl+alt+c', copyAsSVG);
async function closeWindow() { if (DOC.dirty) { const r = await modal({ title: 'Save changes?', body: `Save changes to “${DOC.name}” before closing?`, buttons: [{ label: 'Cancel', value: null }, { label: "Don't save", value: 'no' }, { label: 'Save', primary: true, value: 'yes' }] }); if (r === null) return; if (r === 'yes') { await save(false); if (DOC.dirty) return; } } try { await VX.f.autosaveClear?.(); } catch { } bts.win.close(); }
UI.shortcut('ctrl+w', closeWindow);
function shortcutsHelp() { const rows = TOOLS.map(([id, , tip, key]) => [key || '—', tip]).concat([['Space', 'Pan'], ['X / Shift+X / /', 'Toggle fill-stroke / swap / none'], ['Shift (drag)', 'Constrain'], ['Alt (drag)', 'Duplicate / from center'], ['Double-click group', 'Isolation mode'], ['Double-click live object', 'Edit repeat / blend / effect / type on path']]); modal({ title: 'Tool reference', width: 520, body: '<table class="kb-table">' + rows.map(r => `<tr><td>${r[1]}</td><td>${r[0]}</td></tr>`).join('') + '</table>' }); }

// ---------------------------------------------------------------- expose core API to modules & tests
Object.defineProperties(VX, Object.getOwnPropertyDescriptors({
  get sel() { return sel; }, get selSegs() { return selSegs; }, set selSegs(v) { selSegs = v; }, get guideLayer() { return guideLayer; }, get artLayer() { return artLayer; }, get tool() { return tool; },
  setSel, commit, commitDebounced, flushCommit, drawGuides, drawArtboard, renderProps, renderRight, renderOptions, renderFS, showTab, get rtab() { return rtab; },
  eachStyled, firstStyled, userLayers, allLayers, isSys, topItem, selBounds, selectableItems, hitOpts, hitTop, styleNew, abRect, boardAt, setActiveBoard, addBoard, duplicateBoard, deleteBoard, renameBoard, rearrangeBoards, moveBoard, itemsOnBoard,
  applyColor, toHex, withPreview, snapshot, restore, restoreQuiet, selKeys, resolveKeys, lightenModal, splitCompound, isShape, selPaths, setTool, finishText, editText, enterIsolation, exitIsolation,
  svgString, exportTo, exportDialog, buildPDF, resetHistory, fitRect, renderToCanvas, copyAsSVG, save, docJSON, openFile, placeRaster, toDataUrl, createDoc, newDialog, fitArt, fitAll, zoomToSel, zoomAt, afterView,
  duplicate, lockSel, hideSel, deleteSel, boardLocked, toggleBoardLock, boardBgDialog, colorToJSON, colorFromJSON, svgToCanvas,
  pathfinder, group, ungroup, align, distribute, distributeSpacing, makeClip, makeCompound, reflect, rotateSel, rotateDialog, scaleDialog, moveSel, undo, redo, get hist() { return hist; }, cssVar, toggleOutline, drawRulers, newSubLayer, newUserLayer,
}));
VX.boot = () => {
  UI.fileDrop(async files => { const f = files[0]; const data = new Uint8Array(await f.arrayBuffer()); if (/\.(pdf|ai|eps|dxf)$/i.test(f.name) && hist.length > 1) { try { await (/\.dxf$/i.test(f.name) ? VX.f.importDXF : VX.f.importVector)({ name: f.name, data }, { mode: 'place' }); } catch (e) { toast('Could not place file: ' + e.message, 'err', 7000); } return; } if (/\.(png|jpe?g|webp|svg)$/i.test(f.name) && hist.length > 1) { if (/\.svg$/i.test(f.name)) { const it = project.activeLayer.importSVG(new TextDecoder().decode(data), { expandShapes: true }); it.position = view.center; setSel([it]); commit('Place SVG'); } else placeRaster(await toDataUrl(data, f.name)); } else openFile({ name: f.name, path: bts.fs.pathOf(f), data }); }, 'Drop SVG, PDF, AI, EPS, DXF or images');
  view.onResize = () => { drawGuides(); drawRulers(); };
  resetDoc(1200, 800, 'Untitled-1'); setTool('select'); renderFS(); renderRight(); drawRulers();
  const qf = UI.queryFile(); if (qf) bts.fs.read(qf).then(f => openFile({ ...f, data: new Uint8Array(f.data) }));
  else VX.f.bootHandoff?.();
  window.__bts = { svgPdf: () => svgString(true), P, DOC, O, setSel, get sel() { return sel; }, commit, pathfinder, group, svgString, exportPDF: () => exportDialog('pdf'), exportTo, setTool, align, renderToCanvas, makeClip, userLayers, VX };
};
})();
