// BTS Vector — modern additions: opacity masks, objects on a path, dimension annotations, procedural mockups (perspective /
// cylinder / envelope warps), gradient dithering for raster export.
(() => {
const { P, O, DOC, G, C } = VX; const { h, toast, form, clamp } = UI;
const sel = () => VX.sel; const ins = { insert: false };
const uid = () => 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const allItems = match => VX.allLayers().flatMap(L => L.getItems({ recursive: true, match }));

// ================================================================ opacity masks
// Group{ data.live:{kind:'omask', invert}, children:[art, maskSource(hidden), maskRender] }. maskRender converts the mask's
// luminance to alpha and composites with 'destination-in' inside the (isolated) group. SVG export rewrites it as a real <mask>.
const lumaAlpha = (c, inv) => { if (!c) return null; if (c.gradient) return { gradient: { stops: c.gradient.stops.map((s, k, A) => [lumaAlpha(s.color, inv), s.offset ?? (A.length > 1 ? k / (A.length - 1) : 0)]), radial: c.gradient.radial }, origin: c.origin, destination: c.destination }; const l = 0.2126 * c.red + 0.7152 * c.green + 0.0722 * c.blue; return new P.Color(0, 0, 0, clamp(l * c.alpha, 0, 1)); };
function regenOmask(g) {
  const L = g.data.live; const [art, src] = g.children; g.children.slice(2).forEach(c => c.remove());
  const render = new P.Group({ insert: false }); render.data.omaskRender = true; render.blendMode = 'destination-in';
  const m = src.clone({ insert: false }); m.visible = true;
  (m.getItems ? m.getItems({ recursive: true }) : []).concat(m).forEach(i => { if (i instanceof P.Group || i instanceof P.Layer) return; if (i instanceof P.Raster) { i.opacity *= 1; return; } i.fillColor = lumaAlpha(i.fillColor, false); i.strokeColor = lumaAlpha(i.strokeColor, false); i.shadowColor = null; });
  if (L.invert) { const r = new P.Path.Rectangle({ rectangle: art.strokeBounds.unite(src.strokeBounds).expand(2), fillColor: '#000000', insert: false }); r.data.omaskBase = true; render.addChild(r); m.blendMode = 'destination-out'; }
  render.addChild(m); g.addChild(render); g.blendMode = 'source-over'; return g;
}
VX.live.omask = {
  name: 'Opacity mask', describe: g => (g.data.live.invert ? 'Inverted' : 'Luminance') + ' mask — white shows, black hides · double-click for options',
  styleTargets: g => [g.children[0]], recolorTargets: g => [g.children[0]], regen: regenOmask,
  edit: g => { VX.setSel([g]); return VX.withPreview({ title: 'Opacity mask options', label: 'Opacity mask options', fields: [{ key: 'invert', label: 'Invert mask', type: 'checkbox', value: !!g.data.live.invert }], apply: v => { const gg = sel()[0]; gg.data.live.invert = v.invert; regenOmask(gg); } }); },
  expand: g => { const r = g.rasterize({ resolution: 144, insert: false }); r.insertAbove(g); g.remove(); return [r]; },
};
VX.f.opacityMask = invert => {
  const items = [...sel()].sort((a, b) => a.index - b.index); if (items.length < 2) return toast('Select the artwork and a mask object on top (white shows, black hides)');
  const mask = items.pop(); const g = new P.Group({ insert: false }); g.insertAbove(mask);
  const art = items.length === 1 ? items[0] : (() => { const a = new P.Group({ insert: false }); a.addChildren(items); return a; })();
  g.addChild(art); g.addChild(mask); mask.visible = false; g.data.live = { kind: 'omask', invert: !!invert }; g.name = 'Opacity mask'; regenOmask(g);
  VX.setSel([g]); VX.commit('Opacity mask'); return g;
};
VX.f.releaseOpacityMask = () => { const g = sel().find(i => i.data?.live?.kind === 'omask'); if (!g) return toast('Select an opacity-masked object'); const [art, src] = g.children; const parent = g.parent, idx = g.index; src.visible = true; const out = [art, src]; parent.insertChildren(idx, out); g.remove(); VX.setSel(out); VX.commit('Release opacity mask'); return out; };
// export: a real SVG luminance <mask>; PDF: rasterised (svg2pdf has no mask support)
const SVGNS = 'http://www.w3.org/2000/svg';
const defsOf = (root, d) => { let defs = root.querySelector('defs'); if (!defs) { defs = d.createElementNS(SVGNS, 'defs'); root.insertBefore(defs, root.firstChild); } return defs; };
let maskN = 0;
VX.svgPost.push((root, d, forPdf) => {
  root.querySelectorAll('[data-vx-omask-r]').forEach(rn => {
    const g = rn.parentNode; rn.removeAttribute('data-vx-omask-r'); if (forPdf) { rn.remove(); return; }
    const defs = defsOf(root, d); const mk = d.createElementNS(SVGNS, 'mask'); const id = 'vxmask' + (maskN++); mk.setAttribute('id', id); mk.setAttribute('maskUnits', 'userSpaceOnUse'); mk.setAttribute('x', '-100000'); mk.setAttribute('y', '-100000'); mk.setAttribute('width', '200000'); mk.setAttribute('height', '200000');
    const recol = (el, val) => { ['fill', 'stroke'].forEach(a => { const v = el.getAttribute(a); if (!v || v === 'none') return; const m = /url\(#([^)]+)\)/.exec(v); if (m) { const gr = root.querySelector('#' + CSS.escape(m[1])); if (gr) { const cp = gr.cloneNode(true); const nid = m[1] + '_m' + maskN; cp.setAttribute('id', nid); cp.querySelectorAll('stop').forEach(s => s.setAttribute('stop-color', val)); defs.append(cp); el.setAttribute(a, `url(#${nid})`); } } else el.setAttribute(a, val); }); };
    [...rn.querySelectorAll('*')].concat(rn).forEach(el => { el.removeAttribute('style'); el.removeAttribute('mix-blend-mode'); const base = el.getAttribute('data-vx-omask-base'); recol(el, base ? '#ffffff' : el.closest('[data-vx-omask-inv]') ? '#000000' : '#ffffff'); el.removeAttribute('data-vx-omask-base'); });
    [...rn.childNodes].forEach(ch => mk.append(ch)); defs.append(mk); rn.remove();
    g.setAttribute('mask', `url(#${id})`); g.removeAttribute('style'); g.removeAttribute('data-vx-omask-inv');
  });
});
VX.exportHooks = VX.exportHooks || [];
VX.exportHooks.push((item, node) => { if (item.data?.omaskRender) { node.setAttribute('data-vx-omask-r', '1'); if (item.parent?.data?.live?.invert) node.setAttribute('data-vx-omask-inv', '1'); } if (item.data?.omaskBase) node.setAttribute('data-vx-omask-base', '1'); });
const prevFix = VX.f.pdfFixups;
VX.f.pdfFixups = () => { const fx = []; allItems(i => i.data?.live?.kind === 'omask' && i.visible).forEach(g => { if (g.parent?.data?.live?.kind === 'omask') return; try { const r = g.rasterize({ resolution: 200, insert: false }); r.insertAbove(g); g.visible = false; fx.push({ undo: () => { r.remove(); g.visible = true; } }); } catch (e) { console.warn(e); } }); return fx.concat(prevFix ? prevFix() : []); };

// ================================================================ objects on a path (live): Group{ data.live:{kind:'onpath', p}, children:[path, source(hidden), copies…] }
function regenOnPath(g) {
  const p = g.data.live.p; const path = g.children[0], src = g.children[1]; g.children.slice(2).forEach(c => c.remove());
  const spine = path instanceof P.CompoundPath ? path.children[0] : path; const len = spine?.length || 0; if (!len) return g;
  path.visible = !p.hidePath; const objs = src.children; if (!objs.length) return g;
  const s0 = len * clamp(p.start, 0, 100) / 100, s1 = len * clamp(p.end, 0, 100) / 100; const span = Math.max(0, s1 - s0);
  let offs = [];
  if (p.mode === 'spacing') { const step = Math.max(1, p.spacing); for (let o = s0; o <= s1 + 1e-6 && offs.length < 2000; o += step) offs.push(o); }
  else { const n = p.what === 'objects' ? objs.length : Math.max(1, Math.round(p.count)); const closedFull = spine.closed && p.start <= 0 && p.end >= 100; for (let k = 0; k < n; k++) offs.push(s0 + (n === 1 ? span / 2 : span * k / (closedFull ? n : n - 1))); }
  offs.forEach((o, k) => {
    const off = Math.min(len, Math.max(0, o)); const pt = spine.getPointAt(off), tg = spine.getTangentAt(off), nn = spine.getNormalAt(off); if (!pt || !tg) return;
    const base = objs[k % objs.length]; const cp = base.clone({ insert: false }); cp.visible = true; cp.data.onpathCopy = true;
    cp.position = pt.add(nn.multiply(-(p.normal || 0)));
    const ang = (p.rotate ? tg.angle : 0) + (p.angle || 0) + (p.alternate && k % 2 ? 180 : 0); if (ang) cp.rotate(ang, cp.position);
    if (p.scaleEnd && p.scaleEnd !== 100) { const t = offs.length > 1 ? k / (offs.length - 1) : 0; const sc = 1 + (p.scaleEnd / 100 - 1) * t; cp.scale(sc, cp.position); }
    g.addChild(cp);
  });
  return g;
}
const ONPATH_FIELDS = (p, nObjs) => [{ key: 'what', label: 'Distribute', type: 'select', value: p.what ?? (nObjs > 1 ? 'objects' : 'copies'), options: [{ value: 'copies', label: 'Copies (repeat the selected objects)' }, { value: 'objects', label: 'The selected objects (one each)' }] }, { key: 'mode', label: 'Placement', type: 'select', value: p.mode ?? 'count', options: [{ value: 'count', label: 'Even — by count' }, { value: 'spacing', label: 'Fixed spacing' }] }, { key: 'count', label: 'Count (copies)', type: 'range', value: p.count ?? 10, min: 1, max: 300 }, { key: 'spacing', label: 'Spacing (px, fixed spacing)', type: 'range', value: p.spacing ?? 60, min: 2, max: 2000 }, { key: 'start', label: 'Start along path (%)', type: 'range', value: p.start ?? 0, min: 0, max: 100, step: 0.5 }, { key: 'end', label: 'End along path (%)', type: 'range', value: p.end ?? 100, min: 0, max: 100, step: 0.5 }, { key: 'rotate', label: 'Rotate to path', type: 'checkbox', value: p.rotate ?? true }, { key: 'angle', label: 'Extra rotation (°)', type: 'range', value: p.angle ?? 0, min: -180, max: 180 }, { key: 'normal', label: 'Offset from path (px)', type: 'range', value: p.normal ?? 0, min: -500, max: 500 }, { key: 'scaleEnd', label: 'Scale at end (%)', type: 'range', value: p.scaleEnd ?? 100, min: 5, max: 400 }, { key: 'alternate', label: 'Flip every other object', type: 'checkbox', value: p.alternate ?? false }, { key: 'hidePath', label: 'Hide the path', type: 'checkbox', value: p.hidePath ?? false }];
VX.live.onpath = {
  name: 'Objects on path', describe: g => `${g.children.length - 2} objects along a path — double-click to edit`,
  styleTargets: g => g.children.slice(1), recolorTargets: g => [g.children[1]], regen: regenOnPath,
  edit: g => { VX.setSel([g]); return VX.withPreview({ title: 'Objects on path', label: 'Edit objects on path', fields: ONPATH_FIELDS(g.data.live.p, g.children[1].children.length), apply: v => { const gg = sel()[0]; gg.data.live.p = { ...v }; regenOnPath(gg); } }); },
  expand: g => { delete g.data.live; const src = g.children[1]; src.remove(); if (!g.children[0].visible) g.children[0].remove(); g.name = 'Objects on path (expanded)'; return [g]; },
};
VX.f.objectsOnPath = () => {
  const items = [...sel()].sort((a, b) => a.index - b.index); if (items.length < 2) return toast('Select a path and the objects to place along it (the topmost path is used)');
  const paths = items.filter(i => (i instanceof P.Path || i instanceof P.CompoundPath) && (i.length || i.children?.[0]?.length)); if (!paths.length) return toast('The selection needs a path to place objects along');
  const path = [...paths].pop(); const nObjs = items.length - 1;
  return VX.withPreview({ title: 'Objects on path', label: 'Objects on path', fields: ONPATH_FIELDS({}, nObjs), apply: v => {
    const its = [...sel()].sort((a, b) => a.index - b.index); const pth = its.filter(i => (i instanceof P.Path || i instanceof P.CompoundPath)).pop(); const objs = its.filter(i => i !== pth);
    const g = new P.Group({ insert: false }); g.insertAbove(its[its.length - 1]); const src = new P.Group({ insert: false }); src.addChildren(objs); src.visible = false; g.addChildren([pth, src]); g.data.live = { kind: 'onpath', p: { ...v } }; g.name = 'Objects on path'; regenOnPath(g); VX.setSel([g]);
  } });
};

// ================================================================ dimension annotations (live, associative)
// Group{ data.live:{kind:'dim', type, pts:[{x,y,ref}], ...style} }. A ref ties an end point to an object's anchor (uid + segment)
// or to a position relative to its bounds; dimensions are re-measured whenever the document changes (before every history commit).
Object.assign(O, { dimType: 'linear', dimUnit: 'mm', dimScale: 1, dimPrec: 1, dimColor: '#e0245e', dimSize: 12, dimOffset: 24 });
const UNITS = { px: [1, 'px'], mm: [25.4 / 96, 'mm'], cm: [2.54 / 96, 'cm'], in: [1 / 96, 'in'], pt: [0.75, 'pt'] };
VX.DIM_UNITS = UNITS;
const fmtLen = (px, L) => { const [k, u] = UNITS[L.unit] || UNITS.px; return `${(px * k * (L.scale || 1)).toFixed(L.prec ?? 1)} ${u}`; };
const ensureUid = it => { if (!it.data.uid) it.data.uid = uid(); return it.data.uid; };
const findUid = id => allItems(i => i.data?.uid === id && i.data?.live?.kind !== 'dim')[0] || null;
function refFor(p) {
  const tol = 6 / P.view.zoom;
  const hit = VX.project.hitTest(p, VX.hitOpts({ segments: true, fill: true, stroke: true, tolerance: tol, match: r => !VX.isSys(r.item) && !r.item.locked && r.item.visible && !(VX.topItem(r.item)?.data?.live?.kind === 'dim') }));
  if (!hit) return null;
  if (hit.type === 'segment' && hit.item instanceof P.Path) return { uid: ensureUid(hit.item), seg: hit.segment.index };
  const top = VX.topItem(hit.item); if (!top || top.data?.live?.kind === 'dim') return null; const b = top.bounds; return { uid: ensureUid(top), u: (p.x - b.x) / (b.width || 1), v: (p.y - b.y) / (b.height || 1) };
}
function resolvePt(pt) { const r = pt.ref; if (!r) return new P.Point(pt.x, pt.y); const it = findUid(r.uid); if (!it || !it.parent) return new P.Point(pt.x, pt.y); if (r.seg != null && it.segments?.[r.seg]) return it.segments[r.seg].point.clone(); if (r.radial) return it.bounds.center; const b = it.bounds; return new P.Point(b.x + r.u * b.width, b.y + r.v * b.height); }
function arrowHead(tip, dir, size, col) { const d = dir.normalize(size); const n = d.rotate(90).multiply(0.38); return new P.Path({ segments: [tip, tip.subtract(d).add(n), tip.subtract(d).subtract(n)], closed: true, fillColor: col, insert: false }); }
function labelAt(g, L, text, at, ang) { let a = ang; if (a > 90 || a < -90) a += 180; const t = new P.PointText({ point: at, content: text, fontSize: L.size, fontFamily: 'Segoe UI, Inter, sans-serif', justification: 'center', fillColor: L.color, insert: false }); t.data.dimText = true; t.position = at; t.rotate(a, at); const bg = new P.Path.Rectangle({ rectangle: t.bounds.expand(L.size * 0.25), fillColor: new P.Color(1, 1, 1, 0.85), insert: false }); bg.rotate(0); g.addChild(bg); g.addChild(t); }
function regenDim(g) {
  const L = g.data.live; g.removeChildren(); const col = L.color; const sw = Math.max(0.5, L.size / 14); const ah = L.size * 0.75;
  const P0 = L.pts.map(resolvePt); L.pts.forEach((pt, i) => { pt.x = P0[i].x; pt.y = P0[i].y; });
  const line = (a, b, opts = {}) => g.addChild(new P.Path({ segments: [a, b], strokeColor: col, strokeWidth: sw, dashArray: opts.dash || [], insert: false }));
  if (L.type === 'linear' || L.type === 'horizontal' || L.type === 'vertical') {
    let [A, B] = P0; let dir = B.subtract(A); if (L.type === 'horizontal') dir = new P.Point(Math.sign(dir.x || 1), 0); else if (L.type === 'vertical') dir = new P.Point(0, Math.sign(dir.y || 1)); if (dir.length < 1e-6) dir = new P.Point(1, 0);
    const u = dir.normalize(), n = u.rotate(-90); const o = L.offset;
    let A2, B2; if (L.type === 'linear') { A2 = A.add(n.multiply(o)); B2 = B.add(n.multiply(o)); } else if (L.type === 'horizontal') { const y = Math.min(A.y, B.y) - o; A2 = new P.Point(A.x, y); B2 = new P.Point(B.x, y); } else { const x = Math.max(A.x, B.x) + o; A2 = new P.Point(x, A.y); B2 = new P.Point(x, B.y); }
    const ext = n.multiply(Math.sign(o || 1) * L.size * 0.5); const gap = L.size * 0.25; const e1 = A2.subtract(A), e2 = B2.subtract(B);
    if (e1.length > gap) line(A.add(e1.normalize(gap)), A2.add(e1.normalize(L.size * 0.5))); if (e2.length > gap) line(B.add(e2.normalize(gap)), B2.add(e2.normalize(L.size * 0.5)));
    line(A2, B2); const v = B2.subtract(A2); if (v.length > ah * 2) { g.addChild(arrowHead(A2, v.multiply(-1), ah, col)); g.addChild(arrowHead(B2, v, ah, col)); }
    const dist = L.type === 'horizontal' ? Math.abs(B.x - A.x) : L.type === 'vertical' ? Math.abs(B.y - A.y) : A.getDistance(B); L.value = dist;
    const mid = A2.add(B2).divide(2); const side = n.multiply(Math.sign(o || 1) * L.size * 0.8); labelAt(g, L, fmtLen(dist, L), mid.add(side), v.angle);
    void ext;
  } else if (L.type === 'angular') {
    const [V, A, B] = P0; const a1 = A.subtract(V).angle, a2 = B.subtract(V).angle; let sweep = a2 - a1; while (sweep > 180) sweep -= 360; while (sweep < -180) sweep += 360;
    const r = Math.max(L.size * 2, Math.min(A.getDistance(V), B.getDistance(V)) * 0.55) + (L.offset - 24); line(V, A, { dash: [] }); line(V, B);
    const from = V.add(new P.Point({ angle: a1, length: r })), thr = V.add(new P.Point({ angle: a1 + sweep / 2, length: r })), to = V.add(new P.Point({ angle: a1 + sweep, length: r }));
    g.addChild(new P.Path.Arc({ from, through: thr, to, strokeColor: col, strokeWidth: sw, insert: false })); const tA = new P.Point({ angle: a1 - 90 * Math.sign(sweep || 1), length: 1 }), tB = new P.Point({ angle: a1 + sweep + 90 * Math.sign(sweep || 1), length: 1 });
    if (Math.abs(sweep) * Math.PI / 180 * r > ah * 2.5) { g.addChild(arrowHead(from, tA, ah, col)); g.addChild(arrowHead(to, tB, ah, col)); }
    L.value = Math.abs(sweep); labelAt(g, L, `${Math.abs(sweep).toFixed(L.prec ?? 1)}°`, V.add(new P.Point({ angle: a1 + sweep / 2, length: r + L.size * 1.1 })), a1 + sweep / 2 + 90);
  } else { // radial / diameter
    const [Cc, Q] = P0; const it = L.pts[0].ref && findUid(L.pts[0].ref.uid); const R = it ? (it.bounds.width + it.bounds.height) / 4 : Cc.getDistance(Q); const dir = Q.subtract(Cc).length > 1e-6 ? Q.subtract(Cc).normalize() : new P.Point(1, 0);
    const E = Cc.add(dir.multiply(R)); const S = L.type === 'diameter' ? Cc.subtract(dir.multiply(R)) : Cc;
    line(S, E); g.addChild(arrowHead(E, dir, ah, col)); if (L.type === 'diameter') g.addChild(arrowHead(S, dir.multiply(-1), ah, col)); else g.addChild(new P.Path.Circle({ center: Cc, radius: sw * 1.6, fillColor: col, insert: false }));
    L.value = L.type === 'diameter' ? R * 2 : R; labelAt(g, L, (L.type === 'diameter' ? 'Ø ' : 'R ') + fmtLen(L.value, L), S.add(E).divide(2).add(dir.rotate(-90).multiply(L.size * 0.9)), dir.angle);
  }
  L.pos = [g.position.x, g.position.y]; return g;
}
VX.live.dim = {
  name: 'Dimension', describe: g => `${g.data.live.type} · ${g.data.live.type === 'angular' ? (g.data.live.value || 0).toFixed(1) + '°' : fmtLen(g.data.live.value || 0, g.data.live)} — updates when measured objects move`, styleTargets: () => [],
  edit: g => { VX.setSel([g]); const L = g.data.live; return VX.withPreview({ title: 'Dimension', label: 'Edit dimension', fields: dimFields(L), apply: v => { const gg = sel()[0]; Object.assign(gg.data.live, v); regenDim(gg); } }); },
  expand: g => { delete g.data.live; g.name = 'Dimension (expanded)'; return [g]; },
};
const dimFields = L => [{ key: 'type', label: 'Type', type: 'select', value: L.type, options: L.type === 'angular' ? ['angular'] : L.type === 'radial' || L.type === 'diameter' ? ['radial', 'diameter'] : ['linear', 'horizontal', 'vertical'] }, { key: 'unit', label: 'Units', type: 'select', value: L.unit, options: Object.keys(UNITS) }, { key: 'scale', label: 'Drawing scale (1 drawn unit = n real units)', type: 'number', value: L.scale }, { key: 'prec', label: 'Decimals', type: 'range', value: L.prec, min: 0, max: 4 }, { key: 'offset', label: 'Offset (px)', type: 'range', value: L.offset, min: -400, max: 400 }, { key: 'size', label: 'Text size (px)', type: 'range', value: L.size, min: 4, max: 120 }, { key: 'color', label: 'Colour', type: 'color', value: L.color }];
VX.f.makeDimension = (type, pts, refs = []) => { const g = new P.Group({ insert: false }); (VX.iso || VX.project.activeLayer).addChild(g); g.data.live = { kind: 'dim', type, pts: pts.map((p, i) => ({ x: p.x, y: p.y, ref: refs[i] || null })), unit: O.dimUnit, scale: O.dimScale, prec: O.dimPrec, offset: O.dimOffset, size: O.dimSize, color: O.dimColor }; g.name = 'Dimension'; regenDim(g); return g; };
VX.f.updateDimensions = () => { let n = 0; allItems(i => i.data?.live?.kind === 'dim').forEach(g => { const L = g.data.live; if (L.pos && (Math.abs(g.position.x - L.pos[0]) > 1e-6 || Math.abs(g.position.y - L.pos[1]) > 1e-6)) { const dx = g.position.x - L.pos[0], dy = g.position.y - L.pos[1]; L.pts.forEach(p => { if (!p.ref) { p.x += dx; p.y += dy; } }); } const before = JSON.stringify(L.pts.map(p => [p.x, p.y])); const now = L.pts.map(resolvePt); if (L.pts.some(p => p.ref) || JSON.stringify(now.map(p => [p.x, p.y])) !== before || L.pos && (g.position.x !== L.pos[0] || g.position.y !== L.pos[1])) { regenDim(g); n++; } }); return n; };
VX.beforeCommit.push(() => VX.f.updateDimensions());
// dimension tool
let dimSt = null;
VX.tools.dimension = {
  hideSelection: true,
  options: () => { const sel_ = (key, opts) => { const s = h('select', {}, ...opts.map(o => h('option', { value: o[0], selected: O[key] === o[0] }, o[1]))); s.onchange = () => { O[key] = s.value; dimSt = null; VX.renderOptions(); VX.drawGuides(); }; return s; }; const sc = h('input', { type: 'number', value: O.dimScale, min: 0.0001, step: 0.1, style: { width: '64px' } }); sc.onchange = () => { O.dimScale = Math.max(0.0001, +sc.value || 1); }; const pr = h('input', { type: 'number', value: O.dimPrec, min: 0, max: 4, style: { width: '46px' } }); pr.onchange = () => { O.dimPrec = clamp(+pr.value, 0, 4); }; const col = h('input', { type: 'color', value: O.dimColor }); col.oninput = () => { O.dimColor = col.value; };
    return [VX.optGrp('Type', sel_('dimType', [['linear', 'Linear (aligned)'], ['horizontal', 'Horizontal'], ['vertical', 'Vertical'], ['angular', 'Angular'], ['radial', 'Radial'], ['diameter', 'Diameter']])), VX.optGrp('Units', sel_('dimUnit', Object.keys(UNITS).map(k => [k, k]))), VX.optGrp('Scale 1:', sc), VX.optGrp('Decimals', pr), col, h('span', { class: 'muted' }, O.dimType === 'angular' ? (dimSt?.stage === 2 ? 'Click the second arm' : 'Drag from the vertex along the first arm, then click the second arm') : O.dimType === 'radial' || O.dimType === 'diameter' ? 'Click a circle / curved shape at the angle for the leader' : 'Drag between two points (snaps to anchors and attaches to objects)')]; },
  activate: () => { dimSt = null; }, escape: () => { if (!dimSt) return false; dimSt = null; VX.drawGuides(); VX.renderOptions(); return true; },
  down: e => {
    const p = VX.snapPt(e.point); const t = O.dimType;
    if (t === 'radial' || t === 'diameter') { const hit = VX.hitTop(e.point, { tolerance: 8 / P.view.zoom }); if (!hit || hit.data?.live?.kind === 'dim') return toast('Click on a circle or shape'); const c = hit.bounds.center; const g = VX.f.makeDimension(t, [c, e.point], [{ uid: ensureUid(hit), radial: true }, null]); VX.setSel([g]); VX.commit('Dimension'); return; }
    if (t === 'angular' && dimSt?.stage === 2) { dimSt.pts[2] = p; dimSt.refs[2] = refFor(p); const g = VX.f.makeDimension('angular', dimSt.pts, dimSt.refs); dimSt = null; VX.setSel([g]); VX.commit('Angular dimension'); VX.renderOptions(); return; }
    dimSt = { stage: 1, pts: [p, p], refs: [refFor(p), null] };
  },
  drag: e => { if (!dimSt || dimSt.stage !== 1) return; let p = VX.snapPt(e.point); if (e.modifiers.shift) { const v = p.subtract(dimSt.pts[0]); p = dimSt.pts[0].add(new P.Point({ length: v.length, angle: Math.round(v.angle / 45) * 45 })); } dimSt.pts[1] = p; dimSt.moved = true; document.getElementById('stPos').textContent = (O.dimType === 'angular' ? 'Arm ' : '') + fmtLen(dimSt.pts[0].getDistance(p), { unit: O.dimUnit, scale: O.dimScale, prec: O.dimPrec }); VX.drawGuides(); },
  move: e => { if (dimSt?.stage === 2) { dimSt.pts[2] = VX.snapPt(e.point); VX.drawGuides(); } },
  up: e => { if (!dimSt || dimSt.stage !== 1) return; if (!dimSt.moved || dimSt.pts[0].getDistance(dimSt.pts[1]) < 2 / P.view.zoom) { dimSt = null; VX.drawGuides(); return; } dimSt.refs[1] = refFor(dimSt.pts[1]);
    if (O.dimType === 'angular') { dimSt.stage = 2; dimSt.pts[2] = dimSt.pts[1]; VX.renderOptions(); VX.drawGuides(); return; }
    const g = VX.f.makeDimension(O.dimType, dimSt.pts, dimSt.refs); dimSt = null; VX.setSel([g]); VX.commit('Dimension'); },
  guides: (layer, zz) => { if (!dimSt) return; const col = O.dimColor; dimSt.pts.slice(0, dimSt.stage === 2 ? 3 : 2).reduce((a, b, i) => { if (i) new P.Path.Line({ from: dimSt.stage === 2 ? dimSt.pts[0] : a, to: b, strokeColor: col, strokeWidth: 1 / zz, dashArray: [4 / zz, 3 / zz], parent: layer }); return b; }); dimSt.pts.forEach(p => new P.Path.Circle({ center: p, radius: 3 / zz, fillColor: col, parent: layer })); },
};
VX.f.dimensionDialog = () => { VX.setTool('dimension'); };

// ================================================================ mockups: procedural (drawn here, no trademarks) products with the artwork warped onto them
G.homography = (src, dst) => { // 4 point pairs → 3x3 projective matrix (solves the 8x8 linear system)
  const A = [], b = []; for (let i = 0; i < 4; i++) { const [x, y] = src[i], [u, v] = dst[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v); }
  for (let c = 0; c < 8; c++) { let m = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[m][c])) m = r; [A[c], A[m]] = [A[m], A[c]]; [b[c], b[m]] = [b[m], b[c]]; for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; } }
  const hh = b.map((v, i) => v / A[i][i]); return pt => { const w = hh[6] * pt.x + hh[7] * pt.y + 1; return new P.Point((hh[0] * pt.x + hh[1] * pt.y + hh[2]) / w, (hh[3] * pt.x + hh[4] * pt.y + hh[5]) / w); };
};
const mapGroup = (item, fn, step) => { G.mapItem(item, fn, { step, simplify: 0.2 }); (item.getItems ? item.getItems({ recursive: true, match: i => i instanceof P.PointText || i instanceof P.Raster }) : []).forEach(t => { t.position = fn(t.position); }); };
const shade = (c, k) => { const x = new P.Color(c); return new P.Color(clamp(x.red * k, 0, 1), clamp(x.green * k, 0, 1), clamp(x.blue * k, 0, 1)); };
const MOCKUPS = {
  tshirt: { name: 'T-shirt', color: '#f4f4f2', area: [215, 175, 170, 200], build(col) { const g = new P.Group({ insert: false });
      const body = new P.Path({ pathData: 'M210 60 C240 80 360 80 390 60 L500 105 L560 215 L470 255 L455 225 L455 560 C380 580 220 580 145 560 L145 225 L130 255 L40 215 L100 105 Z', insert: false }); body.fillColor = col; body.strokeColor = shade(col, 0.82); body.strokeWidth = 2; g.addChild(body);
      const collar = new P.Path({ pathData: 'M210 60 C235 115 365 115 390 60 C368 92 232 92 210 60 Z', fillColor: shade(col, 0.86), insert: false }); g.addChild(collar);
      const sh = body.clone({ insert: false }); sh.strokeColor = null; sh.fillColor = { gradient: { stops: [[new P.Color(0, 0, 0, 0.16), 0], [new P.Color(0, 0, 0, 0), 0.3], [new P.Color(1, 1, 1, 0.12), 0.55], [new P.Color(0, 0, 0, 0.1), 1]] }, origin: [145, 300], destination: [455, 300] }; sh.data.mockShade = true; g.addChild(sh);
      [['M150 300 C175 360 170 450 160 540', 0.06], ['M450 320 C428 380 432 470 440 545', 0.06], ['M260 470 C300 490 330 488 360 470', 0.05]].forEach(([d, a]) => g.addChild(new P.Path({ pathData: d, strokeColor: new P.Color(0, 0, 0, a), strokeWidth: 6, strokeCap: 'round', insert: false })));
      return g; }, warp: (art, amt, B) => { G.warpItem(art, { style: 'Flag', bend: 12 * amt, hd: 0, vd: 0 }, B); G.warpItem(art, { style: 'Bulge', bend: 18 * amt, hd: 0, vd: 0 }, art.bounds); } },
  mug: { name: 'Mug', color: '#ffffff', area: [180, 190, 220, 230], build(col) { const g = new P.Group({ insert: false });
      const handle = new P.Path({ pathData: 'M440 210 C540 200 560 330 520 380 C495 412 465 420 440 418 L440 385 C470 386 500 370 508 340 C520 290 495 245 440 245 Z', insert: false }); handle.fillColor = shade(col, 0.9); handle.strokeColor = shade(col, 0.7); handle.strokeWidth = 2; g.addChild(handle);
      const body = new P.Path({ pathData: 'M150 150 L450 150 L450 470 C450 505 150 505 150 470 Z', insert: false }); body.fillColor = { gradient: { stops: [[shade(col, 0.72), 0], [shade(col, 1.0), 0.28], [shade(col, 0.98), 0.45], [shade(col, 0.66), 1]] }, origin: [150, 300], destination: [450, 300] }; body.strokeColor = shade(col, 0.6); body.strokeWidth = 2; g.addChild(body);
      const rim = new P.Path.Ellipse({ rectangle: [150, 128, 300, 44], insert: false }); rim.fillColor = shade(col, 0.55); rim.strokeColor = shade(col, 0.6); rim.strokeWidth = 2; g.addChild(rim);
      const inner = new P.Path.Ellipse({ rectangle: [160, 134, 280, 34], fillColor: shade(col, 0.35), insert: false }); g.addChild(inner);
      const gloss = new P.Path.Rectangle({ rectangle: [196, 175, 22, 280], radius: 11, fillColor: new P.Color(1, 1, 1, 0.35), insert: false }); gloss.data.mockShade = true; g.addChild(gloss);
      return g; }, warp: (art, amt, B) => { const cx = B.x + B.width / 2, hw = Math.max(1, B.width / 2), ry = 22; const th = clamp(0.25 + 0.9 * amt, 0.05, 1.3); const R = hw / th; mapGroup(art, p => { const a = (p.x - cx) / R; return new P.Point(cx + R * Math.sin(a), p.y + ry * (1 - Math.cos(a))); }, 3); } },
  phone: { name: 'Phone screen', color: '#1c1d22', area: [205, 82, 190, 400], clip: 'screen', build(col) { const g = new P.Group({ insert: false });
      const body = new P.Path.Rectangle({ rectangle: [190, 60, 220, 444], radius: 34, insert: false }); body.fillColor = col; body.strokeColor = shade(col, 1.8); body.strokeWidth = 3; g.addChild(body);
      const screen = new P.Path.Rectangle({ rectangle: [205, 75, 190, 414], radius: 24, fillColor: '#000000', insert: false }); screen.name = 'screen'; g.addChild(screen);
      const notch = new P.Path.Rectangle({ rectangle: [270, 84, 60, 16], radius: 8, fillColor: col, insert: false }); notch.data.mockTop = true; g.addChild(notch);
      return g; }, persp: amt => [[0, 0], [1, 0.06 * amt], [1, 1 - 0.06 * amt], [0, 1]] },
  card: { name: 'Business card', color: '#ffffff', area: [140, 200, 320, 183], clip: 'card', build(col) { const g = new P.Group({ insert: false });
      const desk = new P.Path.Rectangle({ rectangle: [0, 0, 600, 600], fillColor: { gradient: { stops: [['#d9d4cc', 0], ['#bdb6ab', 1]] }, origin: [0, 0], destination: [600, 600] }, insert: false }); desk.data.mockBg = true; g.addChild(desk);
      const card = new P.Path.Rectangle({ rectangle: [140, 200, 320, 183], radius: 6, fillColor: col, insert: false }); card.name = 'card'; card.shadowColor = new P.Color(0, 0, 0, 0.35); card.shadowBlur = 18; card.shadowOffset = new P.Point(6, 10); g.addChild(card);
      return g; }, persp: amt => [[0.08 * amt, 0.1 * amt], [1 - 0.02 * amt, 0], [1, 1 - 0.02 * amt], [0, 1 - 0.12 * amt]] },
  poster: { name: 'Poster on wall', color: '#ffffff', area: [190, 90, 220, 310], clip: 'poster', build(col) { const g = new P.Group({ insert: false });
      const wall = new P.Path.Rectangle({ rectangle: [0, 0, 600, 600], fillColor: { gradient: { stops: [['#e9e4dc', 0], ['#cfc8bd', 1]], radial: true }, origin: [300, 220], destination: [720, 220] }, insert: false }); wall.data.mockBg = true; g.addChild(wall);
      const floor = new P.Path.Rectangle({ rectangle: [0, 480, 600, 120], fillColor: { gradient: { stops: [['#8a6a4a', 0], ['#5e4630', 1]] }, origin: [0, 480], destination: [0, 600] }, insert: false }); floor.data.mockBg = true; g.addChild(floor);
      const frame = new P.Path.Rectangle({ rectangle: [178, 78, 244, 334], fillColor: '#2b2b2e', insert: false }); frame.shadowColor = new P.Color(0, 0, 0, 0.35); frame.shadowBlur = 16; frame.shadowOffset = new P.Point(4, 10); g.addChild(frame);
      const poster = new P.Path.Rectangle({ rectangle: [190, 90, 220, 310], fillColor: col, insert: false }); poster.name = 'poster'; g.addChild(poster);
      return g; }, persp: amt => [[0, 0.05 * amt], [1, 0], [1, 1], [0, 1 - 0.05 * amt]] },
};
VX.MOCKUPS = MOCKUPS;
G.buildMockup = (kind, art, v) => {
  const M = MOCKUPS[kind]; const g = M.build(v.color || M.color); g.name = 'Mockup — ' + M.name; g.data.mockup = kind;
  const [ax, ay, aw, ah] = M.area; const a = new P.Rectangle(ax, ay, aw, ah); const ab = art.bounds; const k = Math.min(aw / Math.max(1, ab.width), ah / Math.max(1, ab.height)) * (v.scale / 100);
  art.scale(k, ab.center); art.position = a.center.add([v.dx / 100 * aw, v.dy / 100 * ah]); art.name = 'Artwork';
  const amt = v.warp / 100; const hasRaster = art.getItems ? art.getItems({ recursive: true, class: P.Raster }).length > 0 || art instanceof P.Raster : art instanceof P.Raster;
  if (M.warp && amt && !hasRaster) M.warp(art, amt, art.bounds);
  let placed = art;
  if (M.clip) { const sh = g.children.find(c => c.name === M.clip); const cg = new P.Group({ insert: false }); const m = sh.clone({ insert: false }); m.shadowColor = null; cg.addChildren([m, art]); cg.clipped = true; cg.name = 'Artwork'; placed = cg; }
  else if (kind === 'tshirt') { const body = g.children[0].clone({ insert: false }); const cg = new P.Group({ insert: false }); body.strokeColor = null; cg.addChildren([body, art]); cg.clipped = true; cg.name = 'Artwork'; placed = cg; }
  const shadeIdx = g.children.findIndex(c => c.data.mockShade || c.data.mockTop); if (shadeIdx >= 0) g.insertChild(shadeIdx, placed); else g.addChild(placed);
  if (kind === 'mug' && !hasRaster) placed.opacity = 0.96;
  if (M.persp && amt && !hasRaster) { const q = M.persp(amt); const src = [[0, 0], [600, 0], [600, 600], [0, 600]], dst = q.map(([x, y]) => [x * 600, y * 600]); const H = G.homography(src, dst); g.children.filter(c => !c.data.mockBg).forEach(c => mapGroup(c, H, 3)); }
  return g;
};
VX.f.mockup = async kind => {
  if (!sel().length) return toast('Select the artwork to place on a mockup');
  // type is outlined (on temporary copies) so it can be warped with the product
  let temp = null; if (G.hasText(sel()) && VX.f.createOutlines) { const copies = sel().map(i => i.clone()); VX.setSel(copies); await VX.f.createOutlines({ quiet: true }); temp = VX.sel.slice(); }
  const res = await VX.withPreview({ title: 'Mockup', label: 'Mockup', width: 420, fields: [{ key: 'kind', label: 'Mockup', type: 'select', value: kind || 'tshirt', options: Object.entries(MOCKUPS).map(([k, m]) => ({ value: k, label: m.name })) }, { key: 'color', label: 'Product colour', type: 'color', value: '#f4f4f2' }, { key: 'scale', label: 'Artwork size (%)', type: 'range', value: 85, min: 5, max: 200 }, { key: 'dx', label: 'Move horizontally (%)', type: 'range', value: 0, min: -60, max: 60 }, { key: 'dy', label: 'Move vertically (%)', type: 'range', value: 0, min: -60, max: 60 }, { key: 'warp', label: 'Warp / perspective amount (%)', type: 'range', value: 60, min: 0, max: 100 }, { key: 'board', label: 'Place on a new artboard', type: 'checkbox', value: true }],
    apply: v => {
      const items = sel(); const art = new P.Group({ insert: false }); items.forEach(i => art.addChild(i.clone({ insert: false })));
      const col = v.color === '#f4f4f2' ? MOCKUPS[v.kind].color : v.color; const g = G.buildMockup(v.kind, art, { ...v, color: col });
      if (temp) items.forEach(i => i.remove());
      (VX.iso || VX.project.activeLayer).addChild(g);
      if (v.board) { const r = DOC.boards.reduce((m, b) => Math.max(m, b.x + b.w), -Infinity); const top = DOC.boards[0].y; DOC.boards.push({ name: 'Mockup — ' + MOCKUPS[v.kind].name, x: r + 60, y: top, w: 600, h: 600, bg: '#ffffff' }); g.translate([r + 60, top]); DOC.ab = DOC.boards.length - 1; VX.drawArtboard(); VX.fitRect(VX.abRect(), 140); }
      else { const b = VX.selBounds(); g.bounds.topLeft = new P.Point(b.right + 40, b.top); if (!P.view.bounds.contains(g.bounds)) VX.fitRect(b.unite(g.bounds), 140); }
      VX.setSel([g]);
    } });
  if (!res && temp) { sel().forEach(i => i.remove()); VX.setSel([]); }
  if (res?.board) VX.fitArt();
  return res;
};

// ================================================================ gradient dithering for raster export: noise only where gradients are visible
VX.f.ditherCanvas = async (canvas, opts, rect, scale, amt = 3) => {
  const s = VX.svgString(false, { ...opts, bg: false }); const d = new DOMParser().parseFromString(s, 'image/svg+xml'); const root = d.documentElement;
  root.querySelectorAll('*').forEach(el => { if (el.closest('defs')) return; ['fill', 'stroke'].forEach(a => { const v = el.getAttribute(a); if (v == null) { if (a === 'fill' && /^(path|rect|circle|ellipse|polygon|text|tspan)$/.test(el.localName)) el.setAttribute('fill', '#000'); return; } if (v === 'none') return; el.setAttribute(a, /^url\(/.test(v) ? '#ffffff' : '#000000'); }); el.removeAttribute('filter'); el.removeAttribute('mask'); el.removeAttribute('fill-opacity'); el.removeAttribute('stroke-opacity'); if (el.localName === 'image') el.setAttribute('opacity', '0'); });
  const mc = await VX.svgToCanvas(new XMLSerializer().serializeToString(root), rect.width, rect.height, scale, '#000');
  const W = canvas.width, H = canvas.height; const x = canvas.getContext('2d'); const id = x.getImageData(0, 0, W, H); const md = mc.getContext('2d').getImageData(0, 0, W, H).data; const px = id.data; let n = 0;
  for (let i = 0; i < px.length; i += 4) { const m = md[i] / 255; if (m < 0.02 || px[i + 3] === 0) continue; const nz = (Math.random() + Math.random() - 1) * amt * m; px[i] = clamp(px[i] + nz, 0, 255); px[i + 1] = clamp(px[i + 1] + nz, 0, 255); px[i + 2] = clamp(px[i + 2] + nz, 0, 255); n++; }
  x.putImageData(id, 0, 0); VX._ditherPx = n; return n;
};
})();
