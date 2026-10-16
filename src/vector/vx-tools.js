// BTS Vector — interactive tools: paintbrush (width profiles), blob brush, eraser, knife, spiral, flare, rotate/reflect/scale
// (reference point), width, free distort, shape builder, live paint bucket, blend, symbol sprayer, measure, artboard.
(() => {
const { P, O, DOC, G } = VX; const { h, toast, clamp } = UI;
const view = P.view; const ins = { insert: false };
const T = VX.tools; const sel = () => VX.sel;
const z = () => view.zoom;
const num = (...a) => VX.optNum(...a), grp = (...a) => VX.optGrp(...a);
const muted = t => h('span', { class: 'muted' }, t);
const selectEl = (key, opts, cb) => { const s = h('select', {}, ...opts.map(o => h('option', { value: o.value ?? o, selected: (o.value ?? o) === O[key] }, o.label ?? o))); s.onchange = () => { O[key] = s.value; cb && cb(); }; return s; };
const checkEl = (key, label, cb) => { const c = h('input', { type: 'checkbox', checked: !!O[key] }); c.onchange = () => { O[key] = c.checked; cb && cb(); }; return h('label', { class: 'grp' }, c, label); };
const shapesIn = items => items.filter(VX.isShape);
const commitSel = (items, label) => { VX.setSel(items); VX.commit(label); };
Object.assign(O, { brushProfile: 'uniform', brushPressure: false, blobSize: 24, blobMerge: true, eraserSize: 20, spiralDecay: 80, spiralSegs: 10, blendSteps: 6, sprayDensity: 5, spraySize: 30, sprayVar: 40, sprayRotate: true, moveArtWithBoard: true, flareRays: 14 });

// ---------------------------------------------------------------- paintbrush with width profiles / pressure
let stroke = null;
T.brush = {
  options: () => [num('Size', 'brushW', 0.5, 200, 0.5), grp('Profile', selectEl('brushProfile', [{ value: 'uniform', label: 'Uniform' }, { value: 'taperBoth', label: 'Taper both ends' }, { value: 'taperStart', label: 'Taper start' }, { value: 'taperEnd', label: 'Taper end' }, { value: 'bulge', label: 'Bulge' }, { value: 'pinch', label: 'Pinch' }, { value: 'wave', label: 'Wave' }])), checkEl('brushPressure', 'Pen pressure'), num('Smoothness', 'smooth', 0, 50)],
  down: e => { stroke = { path: new P.Path({ strokeColor: O.stroke || O.fill || '#000', strokeWidth: O.brushW, strokeCap: 'round', strokeJoin: 'round', parent: VX.guideLayer }), press: [] }; stroke.path.add(e.point); stroke.press.push(e.event.pressure || 0.5); },
  drag: e => { if (!stroke) return; stroke.path.add(e.point); stroke.press.push(e.event.pressure || 0.5); },
  up: () => {
    if (!stroke) return; const { path, press } = stroke; stroke = null; path.remove(); if (path.segments.length < 2) return;
    const spine = new P.Path({ segments: path.segments, insert: false, strokeColor: path.strokeColor, strokeWidth: O.brushW, strokeCap: 'round', strokeJoin: 'round' }); if (O.smooth) spine.simplify(O.smooth / 4);
    (VX.iso || VX.project.activeLayer).addChild(spine);
    if (O.brushProfile === 'uniform' && !O.brushPressure) { commitSel([spine], 'Paintbrush'); return; }
    let pts = null; if (O.brushPressure && press.some(p => p !== 0.5 && p > 0)) { const n = press.length; pts = []; for (let k = 0; k < n; k += Math.max(1, Math.floor(n / 24))) pts.push({ t: k / (n - 1), w: O.brushW * (0.15 + press[k] * 1.7) }); }
    const g = G.makeVW(spine, { base: O.brushW, profile: O.brushProfile, pts }); commitSel([g], 'Paintbrush');
  },
};

// ---------------------------------------------------------------- blob brush (paints filled shapes that merge)
T.blob = {
  options: () => [num('Size', 'blobSize', 1, 400), checkEl('blobMerge', 'Merge with same-colour shapes'), muted('Paints filled shapes; overlapping strokes of the same colour merge')],
  down: e => { stroke = { path: new P.Path({ strokeColor: O.fill || O.stroke || '#000', strokeWidth: O.blobSize, strokeCap: 'round', strokeJoin: 'round', opacity: 0.7, parent: VX.guideLayer }) }; stroke.path.add(e.point); },
  drag: e => { if (stroke) stroke.path.add(e.point); },
  up: () => {
    if (!stroke) return; const p = stroke.path; stroke = null; p.remove(); const color = O.fill || O.stroke || '#000';
    const spine = new P.Path({ segments: p.segments, insert: false }); if (spine.segments.length > 2) spine.simplify(Math.max(1, O.blobSize / 12));
    let shape = spine.segments.length < 2 || spine.length < 1 ? new P.Path.Circle({ center: p.firstSegment.point, radius: O.blobSize / 2, insert: false }) : G.strokeToShape(spine, O.blobSize, { cap: 'round', join: 'round' });
    if (!shape) return; shape.fillColor = color; shape.strokeColor = null;
    const target = VX.iso || VX.project.activeLayer;
    if (O.blobMerge) { const css = new P.Color(color).toCSS(true); const hits = VX.selectableItems().filter(i => VX.isShape(i) && i.fillColor && !i.fillColor.gradient && i.fillColor.toCSS(true) === css && !i.strokeColor && i.bounds.intersects(shape.bounds) && (i.intersects(shape) || i.contains(shape.interiorPoint) || shape.contains(i.interiorPoint))); if (hits.length) { let u = shape; hits.forEach(hh => { u = u.unite(hh, ins); }); u.style = hits[0].style; u.insertAbove(hits.sort((a, b) => a.index - b.index)[hits.length - 1]); hits.forEach(x => x.remove()); return commitSel([u], 'Blob brush'); } }
    target.addChild(shape); commitSel([shape], 'Blob brush');
  },
};

// ---------------------------------------------------------------- eraser & knife
T.eraser = {
  options: () => [num('Size', 'eraserSize', 1, 400), muted(sel().length ? 'Erasing from the selected objects' : 'Erasing from every unlocked shape')],
  down: e => { stroke = { path: new P.Path({ strokeColor: new P.Color(1, 0.3, 0.3, 0.45), strokeWidth: O.eraserSize, strokeCap: 'round', strokeJoin: 'round', parent: VX.guideLayer }) }; stroke.path.add(e.point); },
  drag: e => { if (stroke) stroke.path.add(e.point); },
  up: () => {
    if (!stroke) return; const p = stroke.path; stroke = null; p.remove();
    const spine = new P.Path({ segments: p.segments, insert: false }); if (spine.segments.length > 2) spine.simplify(Math.max(1, O.eraserSize / 12));
    const cutter = spine.segments.length < 2 || spine.length < 1 ? new P.Path.Circle({ center: p.firstSegment.point, radius: O.eraserSize / 2, insert: false }) : G.strokeToShape(spine, O.eraserSize, { cap: 'round', join: 'round' });
    const pool = sel().length ? sel() : VX.selectableItems(); const targets = []; pool.forEach(i => { if (VX.isShape(i)) targets.push(i); else if (i instanceof P.Group && !i.data?.live) i.getItems({ match: x => VX.isShape(x) && !(x.parent instanceof P.CompoundPath) }).forEach(x => targets.push(x)); });
    const out = []; let changed = false;
    targets.forEach(t => { if (!t.bounds.intersects(cutter.bounds)) { if (sel().includes(t)) out.push(t); return; } const r = t.subtract(cutter, ins); if (!r || r.isEmpty()) { t.remove(); changed = true; return; } r.style = t.style; const pieces = VX.splitCompound(r); pieces.forEach(q => { q.style = t.style; q.insertAbove(t); out.push(q); }); t.remove(); changed = true; });
    if (changed) commitSel(out, 'Eraser');
  },
};
T.knife = {
  options: () => [muted('Drag across closed shapes to cut them into pieces')],
  down: e => { stroke = { path: new P.Path({ strokeColor: '#ff2bd1', strokeWidth: 1.5 / z(), parent: VX.guideLayer }) }; stroke.path.add(e.point); },
  drag: e => { if (stroke) stroke.path.add(e.point); },
  up: () => {
    if (!stroke) return; const p = stroke.path; stroke = null; p.remove(); if (p.segments.length < 2) return;
    const spine = new P.Path({ segments: p.segments, insert: false }); spine.simplify(1);
    const cutter = G.strokeToShape(spine, Math.max(0.4, 0.8 / z()), { cap: 'butt', join: 'round' }); const out = [];
    const pool = sel().length ? sel() : VX.selectableItems();
    pool.filter(VX.isShape).forEach(t => { if (!t.bounds.intersects(spine.bounds) || !(t.closed || t instanceof P.CompoundPath)) return; if (!t.intersects(spine)) return; const r = t.subtract(cutter, ins); const pieces = VX.splitCompound(r); pieces.forEach(q => { q.style = t.style; q.insertAbove(t); out.push(q); }); t.remove(); });
    if (out.length) commitSel(out, 'Knife'); else toast('Drag fully across a closed shape to cut it');
  },
};

// ---------------------------------------------------------------- spiral & flare tools
let dragShape = null;
T.spiral = {
  options: () => [num('Decay %', 'spiralDecay', 5, 99), num('Segments', 'spiralSegs', 2, 200), muted('Drag from the centre')],
  down: e => { dragShape = { c: VX.snapPt(e.point), item: null }; },
  drag: e => { if (!dragShape) return; dragShape.item?.remove(); const v = e.point.subtract(dragShape.c); if (v.length < 2) return; const s = G.spiral(dragShape.c, v.length, O.spiralDecay / 100, O.spiralSegs, !e.modifiers.alt); s.rotate(v.angle, dragShape.c); VX.styleNew(s, { noFill: true }); if (!s.strokeColor) { s.strokeColor = '#000'; s.strokeWidth = 2; } (VX.iso || VX.project.activeLayer).addChild(s); dragShape.item = s; },
  up: () => { const d = dragShape; dragShape = null; if (d?.item) commitSel([d.item], 'Spiral'); else VX.f.shape('spiral'); },
};
T.flare = {
  options: () => [num('Rays', 'flareRays', 0, 60), muted('Drag from the centre to set size and ring direction')],
  down: e => { dragShape = { c: e.point, item: null }; },
  drag: e => { if (!dragShape) return; dragShape.item?.remove(); const v = e.point.subtract(dragShape.c); if (v.length < 4) return; const g = G.flare(dragShape.c, v.length / 3, { rays: O.flareRays, angle: v.angle }); (VX.iso || VX.project.activeLayer).addChild(g); dragShape.item = g; },
  up: () => { const d = dragShape; dragShape = null; if (d?.item) commitSel([d.item], 'Flare'); else VX.f.shape('flare'); },
};

// ---------------------------------------------------------------- rotate / reflect / scale tools with reference point
let refPt = null, xf = null;
const refOf = () => refPt || (sel().length ? VX.selBounds().center : null);
const xfGuides = (layer, zz) => { const r = refOf(); if (!r) return; const s = 7 / zz; new P.Path.Circle({ center: r, radius: s, strokeColor: '#20c6e8', strokeWidth: 1.5 / zz, parent: layer }); new P.Path.Line({ from: r.subtract([s * 1.6, 0]), to: r.add([s * 1.6, 0]), strokeColor: '#20c6e8', strokeWidth: 1.2 / zz, parent: layer }); new P.Path.Line({ from: r.subtract([0, s * 1.6]), to: r.add([0, s * 1.6]), strokeColor: '#20c6e8', strokeWidth: 1.2 / zz, parent: layer }); };
const xfTool = kind => ({
  options: () => [muted(kind === 'rotate' ? 'Click to set the reference point, drag to rotate (Shift = 45°) · Alt+click for exact angle' : kind === 'reflect' ? 'Click to set the reference point, drag to reflect across an axis through it · Alt+click for dialog' : 'Click to set the reference point, drag to scale (Shift = uniform) · Alt+click for dialog'), h('button', { class: 'btn sm', onclick: () => { refPt = null; VX.drawGuides(); } }, 'Reset reference point')],
  activate: () => { refPt = null; }, guides: xfGuides,
  down: e => {
    if (!sel().length) { const it = VX.hitTop(e.point); if (it) VX.setSel([it]); else return toast('Select objects first'); }
    if (e.modifiers.alt) { refPt = VX.snapPt(e.point, sel()); VX.drawGuides(); if (kind === 'rotate') VX.rotateDialog(refPt); else if (kind === 'scale') VX.scaleDialog(refPt); else reflectDialog(refPt); return; }
    xf = { start: e.point, ref: refOf(), applied: 0, prevS: [1, 1], moved: false, dup: false };
  },
  drag: e => {
    if (!xf) return; const r = xf.ref; xf.moved = true;
    if (kind === 'rotate') { let a = e.point.subtract(r).angle - xf.start.subtract(r).angle; if (e.modifiers.shift) a = Math.round(a / 45) * 45; sel().forEach(i => i.rotate(a - xf.applied, r)); xf.applied = a; $st(`${Math.round(a)}°`); }
    else if (kind === 'reflect') { let a = e.point.subtract(r).angle; if (e.modifiers.shift) a = Math.round(a / 45) * 45; if (xf.axis != null) reflectAbout(sel(), r, xf.axis); reflectAbout(sel(), r, a); xf.axis = a; $st(`Axis ${Math.round(a)}°`); }
    else { const d0 = xf.start.subtract(r), d1 = e.point.subtract(r); let sx = Math.abs(d0.x) > 4 ? d1.x / d0.x : 1, sy = Math.abs(d0.y) > 4 ? d1.y / d0.y : 1; if (e.modifiers.shift) { const s = d1.length / Math.max(1, d0.length); sx = sy = s; } sx = sx || 0.001; sy = sy || 0.001; sel().forEach(i => i.scale(sx / xf.prevS[0], sy / xf.prevS[1], r)); xf.prevS = [sx, sy]; $st(`${Math.round(sx * 100)}% × ${Math.round(sy * 100)}%`); }
    VX.drawGuides();
  },
  up: e => { const x = xf; xf = null; if (!x) return; if (!x.moved || x.start.getDistance(e.point) < 3 / z()) { refPt = VX.snapPt(e.point, sel()); VX.drawGuides(); return; } VX.commit({ rotate: 'Rotate', reflect: 'Reflect', scale: 'Scale' }[kind]); VX.renderProps(); },
});
const $st = t => { document.getElementById('stPos').textContent = t; };
function reflectAbout(items, r, angle) { items.forEach(i => { i.rotate(-angle, r); i.scale(1, -1, r); i.rotate(angle, r); }); }
async function reflectDialog(r) { const v = await UI.form({ title: 'Reflect', fields: [{ key: 'axis', label: 'Axis', type: 'select', value: 'v', options: [{ value: 'v', label: 'Vertical' }, { value: 'h', label: 'Horizontal' }, { value: 'a', label: 'Angle' }] }, { key: 'a', label: 'Angle (°)', type: 'number', value: 45 }, { key: 'copy', label: 'Copy', type: 'checkbox', value: false }] }); if (!v) return; if (v.copy) VX.setSel(sel().map(i => i.clone())); reflectAbout(sel(), r || VX.selBounds().center, v.axis === 'v' ? 90 : v.axis === 'h' ? 0 : +v.a); VX.commit('Reflect'); VX.drawGuides(); }
VX.f.reflectDialog = reflectDialog;
T.rotate = xfTool('rotate'); T.reflect = xfTool('reflect'); T.scale = xfTool('scale');

// ---------------------------------------------------------------- width tool (variable stroke width points)
let wHover = null, wDrag = null;
const spineOf = it => it?.data?.live?.kind === 'vw' ? it.children[0] : (it instanceof P.Path && it.strokeColor && it.strokeWidth ? it : null);
T.width = {
  hideSelection: true,
  options: () => [muted('Drag on a stroke to add or adjust a width point · Alt+click a width point to delete it · works on any stroked path')],
  move: e => { const hit = VX.hitTop(e.point, { fill: true, stroke: true, tolerance: 12 / z() }); const it = hit && (spineOf(hit) ? hit : null); wHover = null; if (it) { const sp = spineOf(it); const loc = sp.getNearestLocation(e.point); if (loc && loc.point.getDistance(e.point) < Math.max(14 / z(), (it.data?.live ? it.data.live.base : sp.strokeWidth))) wHover = { it, sp, t: loc.offset / sp.length, p: loc.point }; } VX.drawGuides(); },
  down: e => {
    T.width.move(e); if (!wHover) return; let { it, sp, t } = wHover;
    if (it.data?.live?.kind !== 'vw') { const base = sp.strokeWidth; const g = G.makeVW(sp, { base, pts: [{ t: 0, w: base }, { t: 1, w: base }] }); it = g; VX.setSel([g]); }
    const L = it.data.live; if (!L.pts?.length) { const fn = u => L.base * (G.profiles[L.profile] || G.profiles.uniform)(u); L.pts = [0, 0.25, 0.5, 0.75, 1].map(u => ({ t: u, w: fn(u) })); }
    let pt = L.pts.find(q => Math.abs(q.t - t) < 0.03);
    if (e.modifiers.alt && pt) { if (L.pts.length > 2) L.pts.splice(L.pts.indexOf(pt), 1); G.regenVW(it); VX.commit('Delete width point'); return; }
    if (!pt) { pt = { t, w: G.widthFromPoints(L.pts, L.base)(t) }; L.pts.push(pt); }
    wDrag = { it, pt, sp: it.children[0] };
  },
  drag: e => { if (!wDrag) return; const loc = wDrag.sp.getNearestLocation(e.point); const w = Math.max(0.2, e.point.getDistance(wDrag.sp.getPointAt(wDrag.pt.t * wDrag.sp.length)) * 2); wDrag.pt.w = w; G.regenVW(wDrag.it); $st(`Width ${w.toFixed(1)} px`); wHover = { it: wDrag.it, sp: wDrag.sp, t: wDrag.pt.t, p: wDrag.sp.getPointAt(wDrag.pt.t * wDrag.sp.length) }; VX.drawGuides(); },
  up: () => { if (!wDrag) return; const it = wDrag.it; wDrag = null; VX.setSel([it]); VX.commit('Width point'); },
  guides: (layer, zz) => {
    const show = it => { const L = it.data?.live; const sp = spineOf(it); if (!sp) return; new P.Path({ segments: sp.segments, closed: sp.closed, strokeColor: '#20c6e8', strokeWidth: 1 / zz, parent: layer }); (L?.pts || []).forEach(q => { const o = q.t * sp.length; const p = sp.getPointAt(o), n = sp.getNormalAt(o); if (!p || !n) return; new P.Path.Line({ from: p.add(n.multiply(q.w / 2)), to: p.subtract(n.multiply(q.w / 2)), strokeColor: '#20c6e8', strokeWidth: 1 / zz, parent: layer }); [1, -1].forEach(sg => new P.Path.Circle({ center: p.add(n.multiply(sg * q.w / 2)), radius: 3 / zz, fillColor: 'white', strokeColor: '#20c6e8', strokeWidth: 1 / zz, parent: layer })); new P.Path.Circle({ center: p, radius: 3 / zz, fillColor: '#20c6e8', parent: layer }); }); };
    sel().forEach(show); if (wHover) { if (!sel().includes(wHover.it)) show(wHover.it); new P.Path.Circle({ center: wHover.p, radius: 4 / zz, strokeColor: '#ff2bd1', strokeWidth: 1.5 / zz, parent: layer }); }
  },
};

// ---------------------------------------------------------------- free distort tool (drag the 4 corners)
let dq = null;
T.distort = {
  hideSelection: true,
  options: () => [muted('Drag any of the four corner handles to distort the selection · Esc resets the handles')],
  activate: () => { dq = null; }, escape: () => { dq = null; VX.drawGuides(); return true; },
  quad: () => { if (!sel().length) return null; if (!dq || dq.key !== sel().map(i => i.id).join()) { const b = VX.selBounds(); dq = { key: sel().map(i => i.id).join(), b, q: [b.topLeft, b.topRight, b.bottomRight, b.bottomLeft], json: null }; } return dq; },
  down: e => {
    const q = T.distort.quad(); if (!q) { const it = VX.hitTop(e.point); if (it) VX.setSel([it]); return; }
    const k = q.q.findIndex(p => p.getDistance(e.point) < 8 / z()); if (k < 0) { const it = VX.hitTop(e.point); if (it) { VX.setSel([it]); dq = null; VX.drawGuides(); } return; }
    if (G.hasText(sel())) { toast('Convert type to outlines first (Type › Create outlines)'); return; }
    if (sel().some(i => i instanceof P.Raster)) { toast('Images cannot be distorted'); return; }
    q.drag = k; q.keys = VX.selKeys(); q.json = sel().map(i => i.exportJSON({ asString: false })); q.q0 = q.q.map(p => p.clone()); q.base = q.b.clone(); q.snapState = q.json;
  },
  drag: e => { const q = dq; if (q?.drag == null) return; q.q[q.drag] = e.point; const items = sel(); items.forEach((it, i) => { it.importJSON(q.json[i]); }); const b = q.b; const off = (k, idx) => q.q[idx].subtract(k); items.forEach(it => G.freeDistort(it, { tl: off(b.topLeft, 0), tr: off(b.topRight, 1), br: off(b.bottomRight, 2), bl: off(b.bottomLeft, 3) }, b)); VX.drawGuides(); },
  up: () => { const q = dq; if (q?.drag == null) return; q.drag = null; const key = sel().map(i => i.id).join(); q.key = key; q.json = null; VX.commit('Free distort'); },
  guides: (layer, zz) => { const q = T.distort.quad(); if (!q) return; new P.Path({ segments: q.q, closed: true, strokeColor: '#20c6e8', strokeWidth: 1 / zz, parent: layer }); q.q.forEach(p => new P.Path.Rectangle({ point: p.subtract(4 / zz), size: 8 / zz, fillColor: 'white', strokeColor: '#20c6e8', strokeWidth: 1 / zz, parent: layer })); },
};

// ---------------------------------------------------------------- shape builder
let sb = null;
G.divideShapes = ps => {
  let pieces = [{ p: ps[0].clone(ins), src: ps[0] }];
  for (let k = 1; k < ps.length; k++) { const nx = []; for (const { p, src } of pieces) { nx.push({ p: p.subtract(ps[k], ins), src }, { p: p.intersect(ps[k], ins), src: ps[k] }); } nx.push({ p: ps.slice(0, k).reduce((a, q) => a.subtract(q, ins), ps[k].clone(ins)), src: ps[k] }); pieces = nx.filter(x => x.p && !x.p.isEmpty() && Math.abs(x.p.area) > 0.05); }
  return pieces.flatMap(({ p, src }) => VX.splitCompound(p).map(q => { q.style = src.style; return { p: q, src }; }));
};
function sbRegions() { const ps = shapesIn(sel()).filter(i => i.closed !== false).sort((a, b) => a.index - b.index); if (ps.length < 2) return null; const key = ps.map(p => p.id + ':' + p.segments?.length).join(); if (sb?.key === key) return sb; sb = { key, ps, regions: G.divideShapes(ps), picked: new Set(), hover: null }; return sb; }
T.shapeBuilder = {
  hideSelection: false,
  options: () => [muted(sel().length < 2 ? 'Select two or more overlapping shapes first (Selection tool), then drag across regions to merge · Alt+click / Alt+drag deletes regions' : 'Drag across regions to merge them · Alt+drag deletes regions')],
  activate: () => { sb = null; },
  move: e => { const s = sbRegions(); if (!s) return; const r = s.regions.find(x => x.p.contains(e.point)); if (r !== s.hover) { s.hover = r; VX.drawGuides(); } },
  down: e => { const s = sbRegions(); if (!s) { const it = VX.hitTop(e.point); if (it) VX.setSel([...sel(), it]); return; } s.picked = new Set(); s.alt = e.modifiers.alt; const r = s.regions.find(x => x.p.contains(e.point)); if (r) s.picked.add(r); s.trail = [e.point]; VX.drawGuides(); },
  drag: e => { const s = sb; if (!s?.trail) return; s.trail.push(e.point); const r = s.regions.find(x => x.p.contains(e.point)); if (r) s.picked.add(r); VX.drawGuides(); },
  up: () => {
    const s = sb; if (!s?.trail) return; s.trail = null; if (!s.picked.size) { VX.drawGuides(); return; }
    const picked = [...s.picked]; const rest = s.regions.filter(r => !s.picked.has(r)); const top = s.ps[s.ps.length - 1]; const out = [];
    rest.forEach(r => { r.p.insertBelow(top); out.push(r.p); });
    if (!s.alt) { let u = picked[0].p; picked.slice(1).forEach(r => { u = u.unite(r.p, ins); }); u.style = picked[0].src.style; u.insertBelow(top); out.push(u); }
    s.ps.forEach(p => p.remove()); sb = null; VX.setSel(out); VX.commit(s.alt ? 'Shape builder (delete)' : 'Shape builder (merge)');
  },
  guides: (layer, zz) => { const s = sb && sb.key ? sb : null; if (!s) return; s.regions.forEach(r => { const c = r.p.clone(ins); c.fillColor = null; c.strokeColor = new P.Color(0.13, 0.78, 0.91, 0.6); c.strokeWidth = 1 / zz; c.dashArray = [3 / zz, 3 / zz]; layer.addChild(c); }); [...s.picked, s.hover].filter(Boolean).forEach(r => { const c = r.p.clone(ins); c.fillColor = s.alt ? new P.Color(1, 0.2, 0.3, 0.35) : new P.Color(0.13, 0.78, 0.91, 0.3); c.strokeColor = '#20c6e8'; c.strokeWidth = 1.5 / zz; layer.addChild(c); }); if (s.trail?.length > 1) new P.Path({ segments: s.trail, strokeColor: '#20c6e8', strokeWidth: 1.5 / zz, parent: layer }); },
};

// ---------------------------------------------------------------- live paint bucket
T.livePaint = {
  options: () => [muted('Click inside any region formed by overlapping shapes to fill it with the current fill colour'), h('span', { class: 'chip', style: { width: '18px', height: '18px', borderRadius: '4px', background: O.fill || 'transparent', boxShadow: 'inset 0 0 0 1px var(--line-2)' } })],
  down: e => {
    const pool = (sel().length ? sel() : VX.selectableItems()).filter(i => VX.isShape(i) && (i.closed || i instanceof P.CompoundPath) && i.bounds.contains(e.point)).sort((a, b) => a.index - b.index);
    if (!pool.length) return toast('Click inside a closed shape');
    const cands = (sel().length ? sel() : VX.selectableItems()).filter(i => VX.isShape(i) && (i.closed || i instanceof P.CompoundPath) && i.bounds.intersects(pool.reduce((a, b) => a.unite(b.bounds), pool[0].bounds))).sort((a, b) => a.index - b.index).slice(-12);
    if (cands.length === 1) { cands[0].fillColor = O.fill; VX.commit('Live paint'); VX.renderRight(); return; }
    const regions = G.divideShapes(cands); const hit = regions.filter(r => r.p.contains(e.point)).sort((a, b) => Math.abs(a.p.area) - Math.abs(b.p.area))[0];
    if (!hit) return toast('No region under the cursor');
    const piece = hit.p; piece.fillColor = O.fill; piece.strokeColor = null; piece.name = 'Live paint fill'; piece.insertAbove(cands[cands.length - 1]);
    cands.filter(c => c.strokeColor).forEach(c => { const s = c.clone(); s.fillColor = null; s.insertAbove(piece); s.name = 'Live paint edge'; c.strokeColor = null; });
    VX.setSel([piece]); VX.commit('Live paint');
  },
};

// ---------------------------------------------------------------- blend tool
let blendA = null;
T.blendTool = {
  options: () => [num('Steps', 'blendSteps', 1, 200), muted(blendA ? 'Now click the second object' : 'Click the first object, then the second · double-click a blend to edit')],
  activate: () => { blendA = null; },
  down: (e, dbl) => { const it = VX.hitTop(e.point); if (!it) { blendA = null; VX.renderOptions(); return; } if (dbl && it.data?.live?.kind === 'blend') return VX.live.blend.edit(it); if (!blendA || blendA === it) { blendA = it; VX.setSel([it]); VX.renderOptions(); return; } const g = G.makeBlend(blendA, it, O.blendSteps); blendA = null; commitSel([g], 'Blend'); VX.renderOptions(); },
  guides: (layer, zz) => { if (blendA?.parent) new P.Path.Rectangle({ rectangle: blendA.bounds.expand(4 / zz), strokeColor: '#20c6e8', strokeWidth: 2 / zz, dashArray: [4 / zz, 3 / zz], parent: layer }); },
};

// ---------------------------------------------------------------- symbol sprayer
let spray = null;
T.sprayer = {
  options: () => { const s = h('select', {}, ...(VX.f.symbolChoices ? VX.f.symbolChoices() : []).map(o => h('option', { value: o.value, selected: o.value === O.spraySymbol }, o.label))); s.onchange = () => { O.spraySymbol = s.value; }; if (!O.spraySymbol && s.options.length) O.spraySymbol = s.options[0].value; return [grp('Symbol', s), num('Size', 'spraySize', 4, 400), num('Size variation %', 'sprayVar', 0, 100), num('Density', 'sprayDensity', 1, 20), checkEl('sprayRotate', 'Random rotation')]; },
  down: e => { if (!VX.f.symbolInstance) return; spray = { items: [], last: null, rnd: G.rng(Date.now() % 9973) }; T.sprayer.drag(e); },
  drag: e => { if (!spray) return; const gap = O.spraySize * 1.4 / (O.sprayDensity / 5); if (spray.last && spray.last.getDistance(e.point) < gap * 0.6) return; spray.last = e.point; const r = spray.rnd; const it = VX.f.symbolInstance(O.spraySymbol, e.point.add(new P.Point((r() * 2 - 1) * O.spraySize, (r() * 2 - 1) * O.spraySize)), O.spraySize * (1 - O.sprayVar / 100 * r())); if (!it) return; if (O.sprayRotate) it.rotate(r() * 360); spray.items.push(it); },
  up: () => { const s = spray; spray = null; if (!s?.items.length) return; const g = new P.Group({ insert: false }); g.insertAbove(s.items[s.items.length - 1]); g.addChildren(s.items); g.name = 'Symbol set'; commitSel([g], 'Symbol sprayer'); },
};

// ---------------------------------------------------------------- measure
let meas = null;
T.measure = {
  hideSelection: true,
  options: () => [muted(meas?.b ? `Distance ${meas.d.toFixed(1)} px · Angle ${meas.a.toFixed(1)}° · ΔX ${meas.dx.toFixed(1)} · ΔY ${meas.dy.toFixed(1)}` : 'Drag to measure distance and angle (Shift = 45° steps, snaps to points)')],
  down: e => { meas = { a0: VX.snapPt(e.point), b: null }; },
  drag: e => { if (!meas) return; let b = VX.snapPt(e.point); if (e.modifiers.shift) { const v = b.subtract(meas.a0); b = meas.a0.add(new P.Point({ length: v.length, angle: Math.round(v.angle / 45) * 45 })); } const v = b.subtract(meas.a0); Object.assign(meas, { b, d: v.length, a: -v.angle, dx: v.x, dy: v.y }); $st(`D ${v.length.toFixed(1)} px  ∠ ${(-v.angle).toFixed(1)}°  ΔX ${v.x.toFixed(1)}  ΔY ${v.y.toFixed(1)}`); VX.drawGuides(); },
  up: () => { VX.renderOptions(); },
  guides: (layer, zz) => { if (!meas?.b) return; new P.Path.Line({ from: meas.a0, to: meas.b, strokeColor: '#ff2bd1', strokeWidth: 1.5 / zz, parent: layer }); [meas.a0, meas.b].forEach(p => new P.Path.Circle({ center: p, radius: 3 / zz, fillColor: '#ff2bd1', parent: layer })); const mid = meas.a0.add(meas.b).divide(2); const t = new P.PointText({ point: mid.add([8 / zz, -8 / zz]), content: `${meas.d.toFixed(1)} px  ${meas.a.toFixed(1)}°`, fontSize: 12 / zz, fillColor: '#ff2bd1', fontFamily: 'Segoe UI, sans-serif', parent: layer }); const bg = new P.Path.Rectangle({ rectangle: t.bounds.expand(4 / zz), radius: 3 / zz, fillColor: 'white', opacity: 0.9, parent: layer }); bg.insertBelow(t); },
};

// ---------------------------------------------------------------- artboard tool
let abd = null;
const boardHandles = i => { const r = VX.abRect(i); return [r.topLeft, r.topCenter, r.topRight, r.rightCenter, r.bottomRight, r.bottomCenter, r.bottomLeft, r.leftCenter]; };
T.artboard = {
  hideSelection: true, cursor: 'default',
  options: () => { const b = DOC.boards[DOC.ab]; const name = h('input', { type: 'text', value: b.name, style: { width: '130px' } }); name.onchange = () => { b.name = name.value || b.name; VX.drawArtboard(); VX.commit('Rename artboard'); }; const w = h('input', { type: 'number', value: b.w, style: { width: '70px' } }), hh = h('input', { type: 'number', value: b.h, style: { width: '70px' } }); const ap = () => { b.w = Math.max(1, +w.value); b.h = Math.max(1, +hh.value); VX.drawArtboard(); VX.commit('Artboard size'); }; w.onchange = ap; hh.onchange = ap; const pre = h('select', {}, h('option', { value: '' }, 'Preset…'), ...Object.entries(VX.PRESETS).map(([k, p]) => h('option', { value: k }, p.label))); pre.onchange = () => { const p = VX.PRESETS[pre.value]; if (p) { b.w = p.w; b.h = p.h; VX.drawArtboard(); VX.commit('Artboard preset'); VX.renderOptions(); } };
    return [grp('Name', name), grp('W', w), grp('H', hh), pre, checkEl('moveArtWithBoard', 'Move artwork'), h('button', { class: 'btn sm', onclick: () => VX.addBoard() }, '+ New'), h('button', { class: 'btn sm', onclick: () => VX.duplicateBoard() }, 'Duplicate'), h('button', { class: 'btn sm', onclick: () => VX.deleteBoard() }, 'Delete'), muted('Drag empty canvas = new artboard')]; },
  activate: () => VX.drawArtboard(), deactivate: () => setTimeout(() => VX.drawArtboard(), 0),
  move: e => { const i = DOC.ab; const k = boardHandles(i).findIndex(p => p.getDistance(e.point) < 7 / z()); document.getElementById('cv').style.cursor = k >= 0 ? (k % 4 === 1 ? 'ns-resize' : k % 4 === 3 ? 'ew-resize' : k === 0 || k === 4 ? 'nwse-resize' : 'nesw-resize') : VX.boardAt(e.point) >= 0 ? 'move' : 'crosshair'; },
  down: (e, dbl) => {
    const k = boardHandles(DOC.ab).findIndex(p => p.getDistance(e.point) < 7 / z());
    if (k >= 0) { abd = { kind: 'resize', k, r0: VX.abRect() }; return; }
    const i = VX.boardAt(e.point);
    if (i >= 0) { if (dbl) return VX.renameBoard(i); if (i !== DOC.ab) VX.setActiveBoard(i); abd = { kind: 'move', i, items: O.moveArtWithBoard && !e.modifiers.alt ? VX.itemsOnBoard(i) : [], last: e.point }; if (e.modifiers.alt) { VX.duplicateBoard(i); abd.i = DOC.ab; abd.items = []; } return; }
    abd = { kind: 'new', a: VX.snapPt(e.point), b: null };
  },
  drag: e => {
    if (!abd) return; const p = VX.snapPt(e.point);
    if (abd.kind === 'move') { const d = e.point.subtract(abd.last); abd.last = e.point; const b = DOC.boards[abd.i]; b.x += d.x; b.y += d.y; abd.items.forEach(it => it.translate(d)); abd.moved = true; }
    else if (abd.kind === 'resize') { const r0 = abd.r0; const dirs = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]][abd.k]; let x0 = r0.left, y0 = r0.top, x1 = r0.right, y1 = r0.bottom; if (dirs[0] < 0) x0 = p.x; if (dirs[0] > 0) x1 = p.x; if (dirs[1] < 0) y0 = p.y; if (dirs[1] > 0) y1 = p.y; const b = DOC.boards[DOC.ab]; Object.assign(b, { x: Math.round(Math.min(x0, x1)), y: Math.round(Math.min(y0, y1)), w: Math.max(1, Math.round(Math.abs(x1 - x0))), h: Math.max(1, Math.round(Math.abs(y1 - y0))) }); abd.moved = true; }
    else { abd.b = p; }
    VX.drawArtboard(); VX.drawGuides();
  },
  up: () => {
    const a = abd; abd = null; if (!a) return;
    if (a.kind === 'new') { if (!a.b || Math.abs(a.b.x - a.a.x) < 4 || Math.abs(a.b.y - a.a.y) < 4) return; const r = new P.Rectangle(a.a, a.b); DOC.boards.push({ name: `Artboard ${DOC.boards.length + 1}`, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bg: '#ffffff' }); VX.setActiveBoard(DOC.boards.length - 1); VX.commit('New artboard'); VX.renderOptions(); return; }
    if (a.moved) { const b = DOC.boards[DOC.ab]; b.x = Math.round(b.x); b.y = Math.round(b.y); VX.drawArtboard(); VX.commit(a.kind === 'move' ? 'Move artboard' : 'Resize artboard'); VX.renderOptions(); VX.drawRulers(); }
  },
  escape: () => false,
  guides: (layer, zz) => { boardHandles(DOC.ab).forEach(p => new P.Path.Rectangle({ point: p.subtract(4 / zz), size: 8 / zz, fillColor: 'white', strokeColor: VX.cssVar('--accent'), strokeWidth: 1 / zz, parent: layer })); if (abd?.kind === 'new' && abd.b) new P.Path.Rectangle({ from: abd.a, to: abd.b, strokeColor: VX.cssVar('--accent'), dashArray: [4 / zz, 4 / zz], strokeWidth: 1 / zz, parent: layer }); },
};
UI.shortcut('ctrl+shift+delete', () => { if (O.tool === 'artboard') VX.deleteBoard(); });
})();
