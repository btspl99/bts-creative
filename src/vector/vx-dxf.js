// BTS Vector — DXF export for laser cutters / CNC (R12 ASCII by default, optional R2000) and DXF import.
// Non-ASCII text is written as AutoCAD \U+XXXX escapes so it survives any DXF code page.
const dxfEsc = t => String(t).replace(/[^\x00-\x7f]/gu, ch => { const c = ch.codePointAt(0); return c > 0xffff ? '?' : '\\U+' + c.toString(16).toUpperCase().padStart(4, '0'); });
const dxfUnesc = t => String(t).replace(/\\U\+([0-9A-Fa-f]{4})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)));
(() => {
const { P, DOC } = VX; const { toast, form } = UI;
const UNITS = { mm: { k: 25.4 / 96, ins: 4, label: 'Millimetres' }, in: { k: 1 / 96, ins: 1, label: 'Inches' }, px: { k: 1, ins: 0, label: 'Pixels (1 px = 1 unit)' } };
const TEXT_CAP = 0.7; // DXF text height is roughly the cap height; 1 em ≈ height / 0.7

// ---------------------------------------------------------------- AutoCAD Color Index
const ACI = (() => {
  const t = [[0, 0, 0], [255, 0, 0], [255, 255, 0], [0, 255, 0], [0, 255, 255], [0, 0, 255], [255, 0, 255], [255, 255, 255], [128, 128, 128], [192, 192, 192]];
  const V = [255, 255, 165, 165, 127, 127, 76, 76, 38, 38];
  for (let i = 10; i < 250; i++) { const hue = Math.floor((i - 10) / 10) * 15, v = V[i % 10] / 255, s = i % 2 ? 0.5 : 1; const f = n => { const k = (n + hue / 60) % 6; return Math.round(255 * v * (1 - s * Math.max(0, Math.min(k, 4 - k, 1)))); }; t.push([f(5), f(3), f(1)]); }
  t.push([51, 51, 51], [80, 80, 80], [105, 105, 105], [130, 130, 130], [190, 190, 190], [255, 255, 255]); return t;
})();
const aciNearest = (rgb, basic) => {
  let best = 7, bd = Infinity; const N = basic ? 8 : 256;
  for (let i = 1; i < N; i++) { if (i >= 250 && i !== 255 && basic) continue; const refs = i === 7 ? [[0, 0, 0], [255, 255, 255]] : [ACI[i]]; for (const c of refs) { const d = (c[0] - rgb[0]) ** 2 * 0.3 + (c[1] - rgb[1]) ** 2 * 0.59 + (c[2] - rgb[2]) ** 2 * 0.11; if (d < bd) { bd = d; best = i; } } }
  return best;
};
VX.f.aciColor = i => ACI[i]; VX.f.aciNearest = aciNearest;
const colRGB = c => { if (!c) return null; if (c.gradient) c = c.gradient.stops[0].color; return [Math.round(c.red * 255), Math.round(c.green * 255), Math.round(c.blue * 255)]; };

// ---------------------------------------------------------------- collecting geometry
const layerOf = it => { let x = it; while (x && !(x instanceof P.Layer)) x = x.parent; return x; };
const styleOwner = it => (it.parent instanceof P.CompoundPath ? it.parent : it);
function targetsFor(scope) {
  const vis = it => { for (let x = it; x; x = x.parent) if (x.visible === false) return false; return true; };
  const all = []; const walk = L => L.children.forEach(c => { if (c instanceof P.Layer) { if (c.visible) walk(c); } else if (c.visible) all.push(c); }); VX.userLayers().forEach(L => { if (L.visible) walk(L); });
  if (scope === 'selection') return VX.sel.filter(vis);
  if (scope === 'board') { const r = VX.abRect(); return all.filter(it => r.intersects(it.bounds) || r.contains(it.bounds)); }
  return all;
}
function refRect(scope) { if (scope === 'all') return DOC.boards.reduce((a, b, i) => a ? a.unite(VX.abRect(i)) : VX.abRect(i), null); return VX.abRect(); }
// walk to leaves: { kind:'path', path (global coords), layer, color } | { kind:'text', item, M, layer, color }
function leaves(items, pre, out = [], layerHint = null) {
  for (const it of items) {
    if (!it || it.visible === false) continue;
    const layer = layerHint || layerOf(it)?.name || '0';
    if (it instanceof P.Group) { const kids = it.clipped ? it.children.slice(1) : it.children; leaves(kids, pre, out, layerHint); continue; }
    if (it instanceof P.CompoundPath) { it.children.forEach(ch => out.push(leafPath(ch, pre, layer))); continue; }
    if (it instanceof P.Path) { out.push(leafPath(it, pre, layer)); continue; }
    if (it instanceof P.Shape) { const p = it.toPath(false); out.push(leafPath(p, mulM(pre, it.parent ? it.parent.globalMatrix : null), layer, it)); continue; }
    if (it instanceof P.PointText) { const M = mulM(pre, it.globalMatrix); out.push({ kind: 'text', item: it, M, layer, color: colRGB(it.fillColor || it.strokeColor) }); continue; }
    if (it instanceof P.SymbolItem) { const def = it.definition.item; leaves([def], mulM(pre, it.globalMatrix), out, layer); continue; }
  }
  return out.filter(Boolean);
}
const mulM = (A, B) => !A ? (B ? B.clone() : null) : !B ? A.clone() : A.clone().append(B);
function leafPath(p, pre, layer, styleFrom) {
  const g = new P.Path({ segments: p.segments.map(s => s.clone()), closed: p.closed, insert: false });
  const M = styleFrom ? mulM(pre, p.matrix) : mulM(pre, p.globalMatrix); if (M) g.transform(M);
  const so = styleFrom || styleOwner(p); const color = colRGB(so.strokeColor) || colRGB(so.fillColor) || [0, 0, 0];
  return { kind: 'path', path: g, layer, color };
}

// ---------------------------------------------------------------- curve maths (CAD space)
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const split = (c, t = 0.5) => { const [p0, p1, p2, p3] = c; const a = lerp(p0, p1, t), b = lerp(p1, p2, t), d = lerp(p2, p3, t), e = lerp(a, b, t), f = lerp(b, d, t), g = lerp(e, f, t); return [[p0, a, e, g], [g, f, d, p3]]; };
const bez = (c, t) => { const u = 1 - t; return [u * u * u * c[0][0] + 3 * u * u * t * c[1][0] + 3 * u * t * t * c[2][0] + t * t * t * c[3][0], u * u * u * c[0][1] + 3 * u * u * t * c[1][1] + 3 * u * t * t * c[2][1] + t * t * t * c[3][1]]; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const lineDist = (p, a, b) => { const L = dist(a, b); if (L < 1e-12) return dist(p, a); return Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L; };
const isStraight = (c, tol) => lineDist(c[1], c[0], c[3]) <= tol * 0.25 && lineDist(c[2], c[0], c[3]) <= tol * 0.25;
function circle3(a, b, c) { const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])); if (Math.abs(d) < 1e-12) return null; const a2 = a[0] ** 2 + a[1] ** 2, b2 = b[0] ** 2 + b[1] ** 2, c2 = c[0] ** 2 + c[1] ** 2; const ux = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d, uy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d; return { c: [ux, uy], r: Math.hypot(a[0] - ux, a[1] - uy) }; }
// cubic → [{p, bulge}] (arc / line pieces; bulge belongs to the start point of each piece)
function cubicToArcs(c, tol, out, depth = 0) {
  if (isStraight(c, tol)) { out.push({ p: c[0], b: 0 }); return; }
  const m = bez(c, 0.5), circ = circle3(c[0], m, c[3]);
  if (circ && circ.r < 1e7) {
    let ok = true; for (const t of [0.125, 0.25, 0.375, 0.625, 0.75, 0.875]) { if (Math.abs(dist(bez(c, t), circ.c) - circ.r) > tol) { ok = false; break; } }
    if (ok) { // signed sweep through the mid point
      const ang = p => Math.atan2(p[1] - circ.c[1], p[0] - circ.c[0]); const a0 = ang(c[0]), a1 = ang(m), a2 = ang(c[3]);
      const ccw = ((c[3][0] - c[0][0]) * (m[1] - c[0][1]) - (c[3][1] - c[0][1]) * (m[0] - c[0][0])) < 0;
      let sweep = a2 - a0; if (ccw) { while (sweep <= 0) sweep += 2 * Math.PI; } else { while (sweep >= 0) sweep -= 2 * Math.PI; }
      void a1; out.push({ p: c[0], b: Math.tan(sweep / 4) }); return;
    }
  }
  if (depth > 14) { out.push({ p: c[0], b: 0 }); return; }
  const [l, r] = split(c); cubicToArcs(l, tol, out, depth + 1); cubicToArcs(r, tol, out, depth + 1);
}
function cubicFlatten(c, tol, out, depth = 0) { if (depth > 16 || isStraight(c, tol * 4) && Math.max(lineDist(c[1], c[0], c[3]), lineDist(c[2], c[0], c[3])) <= tol) { out.push({ p: c[0], b: 0 }); return; } const [l, r] = split(c); cubicFlatten(l, tol, out, depth + 1); cubicFlatten(r, tol, out, depth + 1); }
const curvesOf = path => path.curves.map(cv => [[cv.point1.x, cv.point1.y], [cv.point1.x + cv.handle1.x, cv.point1.y + cv.handle1.y], [cv.point2.x + cv.handle2.x, cv.point2.y + cv.handle2.y], [cv.point2.x, cv.point2.y]]);
// exact circle / ellipse built from 4 Bézier quarter arcs (paper's Path.Circle / Path.Ellipse, any rotation)
function asEllipse(path) {
  if (!path.closed || path.segments.length !== 4) return null; const K = 0.5522847498;
  const pts = path.segments.map(s => [s.point.x, s.point.y]); const c = [(pts[0][0] + pts[2][0]) / 2, (pts[0][1] + pts[2][1]) / 2];
  const c2 = [(pts[1][0] + pts[3][0]) / 2, (pts[1][1] + pts[3][1]) / 2]; const size = Math.max(path.bounds.width, path.bounds.height) || 1; const eps = size * 1e-4;
  if (dist(c, c2) > eps) return null;
  const a = [pts[0][0] - c[0], pts[0][1] - c[1]], b = [pts[1][0] - c[0], pts[1][1] - c[1]];
  if (Math.abs(a[0] * b[0] + a[1] * b[1]) > size * size * 1e-4) return null; // axes must be perpendicular
  for (let i = 0; i < 4; i++) {
    const s = path.segments[i], n = path.segments[(i + 1) % 4]; const u = [s.point.x - c[0], s.point.y - c[1]], v = [n.point.x - c[0], n.point.y - c[1]];
    if (Math.abs(s.handleOut.x - K * v[0]) > eps * 5 || Math.abs(s.handleOut.y - K * v[1]) > eps * 5) return null;
    if (Math.abs(n.handleIn.x - K * u[0]) > eps * 5 || Math.abs(n.handleIn.y - K * u[1]) > eps * 5) return null;
  }
  const ra = Math.hypot(...a), rb = Math.hypot(...b);
  if (Math.abs(ra - rb) <= eps * 2) return { circle: true, c, r: (ra + rb) / 2 };
  const major = ra >= rb ? a : b, ratio = Math.min(ra, rb) / Math.max(ra, rb); return { circle: false, c, major, ratio };
}

// ---------------------------------------------------------------- export
function buildEntities(opts) {
  const u = UNITS[opts.units] || UNITS.mm; const k = u.k * (opts.scale || 1);
  const ref = refRect(opts.scope); const C = new P.Matrix(k, 0, 0, -k, -ref.left * k, ref.bottom * k);
  const tol = Math.max(1e-6, (opts.tolerance || 0.05) * (opts.units === 'mm' ? 1 : opts.units === 'in' ? 1 / 25.4 : 96 / 25.4) );
  const ents = []; const stats = { POLYLINE: 0, LWPOLYLINE: 0, LINE: 0, ARC: 0, CIRCLE: 0, ELLIPSE: 0, SPLINE: 0, TEXT: 0 };
  const r2000 = opts.version === 'r2000';
  const colorOf = rgb => opts.color === 'bylayer' ? 256 : aciNearest(rgb || [0, 0, 0], opts.color === 'basic');
  const lv = leaves(opts.items, null);
  const polys = [];
  for (const L of lv) {
    const layer = sanitizeLayer(L.layer);
    if (L.kind === 'text' && opts.text === 'skip') continue;
    if (L.kind === 'text') {
      const t = L.item; const lines = String(t.content).split(/\r?\n/); const lead = t.leading || t.fontSize * 1.2;
      const M = C.clone().append(L.M || new P.Matrix()); const sc = Math.sqrt(Math.abs(M.a * M.d - M.b * M.c)); const dir = { x: M.a, y: M.b }; const rot = Math.abs(dir.y) < 1e-9 * Math.abs(dir.x) ? 0 : Math.atan2(dir.y, dir.x) * 180 / Math.PI;
      lines.forEach((line, i) => { if (!line.trim()) return; const p = M.transform(new P.Point(0, i * lead)); ents.push({ type: 'TEXT', layer, color: colorOf(L.color), x: p.x, y: p.y, h: t.fontSize * sc * TEXT_CAP, text: line, rot, just: t.justification, truecolor: L.color }); stats.TEXT++; });
      continue;
    }
    const g = L.path; g.transform(C);
    if (g.segments.length < 2 && !g.closed) continue;
    const col = colorOf(L.color);
    if (opts.exact !== false) { const e = asEllipse(g); if (e && (e.circle || r2000)) { ents.push(e.circle ? { type: 'CIRCLE', layer, color: col, c: e.c, r: e.r, truecolor: L.color } : { type: 'ELLIPSE', layer, color: col, c: e.c, major: e.major, ratio: e.ratio, truecolor: L.color }); stats[e.circle ? 'CIRCLE' : 'ELLIPSE']++; continue; } }
    const cs = curvesOf(g);
    if (opts.curves === 'spline' && r2000 && cs.some(c => !isStraight(c, tol))) {
      const ctrl = [cs[0][0]]; cs.forEach(c => ctrl.push(isStraight(c, tol) ? lerp(c[0], c[3], 1 / 3) : c[1], isStraight(c, tol) ? lerp(c[0], c[3], 2 / 3) : c[2], c[3]));
      const knots = [0, 0, 0, 0]; for (let i = 1; i < cs.length; i++) knots.push(i, i, i); knots.push(cs.length, cs.length, cs.length, cs.length);
      ents.push({ type: 'SPLINE', layer, color: col, ctrl, knots, closed: g.closed, truecolor: L.color }); stats.SPLINE++; continue;
    }
    const verts = [];
    for (const c of cs) { if (opts.curves === 'flatten') cubicFlatten(c, tol, verts); else cubicToArcs(c, tol, verts); }
    const last = cs.length ? cs[cs.length - 1][3] : [g.firstSegment.point.x, g.firstSegment.point.y];
    if (!g.closed) verts.push({ p: last, b: 0 });
    polys.push({ layer, color: col, truecolor: L.color, verts, closed: g.closed });
  }
  const joined = opts.join ? joinPolys(polys, Math.max(tol * 0.5, 1e-6)) : polys;
  for (const pl of joined) {
    if (pl.verts.length < 2 && !pl.closed) continue;
    if (opts.curves === 'explode') { // separate LINE / ARC entities
      const n = pl.verts.length, segs = pl.closed ? n : n - 1;
      for (let i = 0; i < segs; i++) { const a = pl.verts[i], b = pl.verts[(i + 1) % n]; if (dist(a.p, b.p) < 1e-9) continue; if (Math.abs(a.b) < 1e-9) { ents.push({ type: 'LINE', layer: pl.layer, color: pl.color, a: a.p, b: b.p, truecolor: pl.truecolor }); stats.LINE++; } else { ents.push({ type: 'ARC', layer: pl.layer, color: pl.color, ...bulgeArc(a.p, b.p, a.b), truecolor: pl.truecolor }); stats.ARC++; } }
      continue;
    }
    if (pl.verts.length === 2 && !pl.closed && !pl.verts[0].b) { ents.push({ type: 'LINE', layer: pl.layer, color: pl.color, a: pl.verts[0].p, b: pl.verts[1].p, truecolor: pl.truecolor }); stats.LINE++; continue; }
    const t = r2000 ? 'LWPOLYLINE' : 'POLYLINE'; ents.push({ type: t, ...pl }); stats[t]++;
  }
  return { ents, stats, k, ref };
}
function bulgeArc(a, b, bulge) { // → centre, radius, CCW start/end angles (degrees)
  const th = 4 * Math.atan(bulge), d = dist(a, b), r = d / (2 * Math.sin(Math.abs(th) / 2)); const m = lerp(a, b, 0.5);
  const hh = Math.sqrt(Math.max(0, r * r - (d / 2) ** 2)); const nx = -(b[1] - a[1]) / d, ny = (b[0] - a[0]) / d; // left normal
  const sgn = (Math.abs(th) < Math.PI) === (bulge > 0) ? 1 : -1; const c = [m[0] + nx * hh * sgn, m[1] + ny * hh * sgn];
  let s = Math.atan2(a[1] - c[1], a[0] - c[0]) * 180 / Math.PI, e = Math.atan2(b[1] - c[1], b[0] - c[0]) * 180 / Math.PI; if (bulge < 0) [s, e] = [e, s];
  return { c, r, start: (s + 360) % 360, end: (e + 360) % 360 };
}
function joinPolys(polys, eps) {
  const open = polys.filter(p => !p.closed), done = polys.filter(p => p.closed);
  const reverse = pl => { const v = pl.verts; const out = []; for (let i = v.length - 1; i >= 0; i--) out.push({ p: v[i].p, b: i > 0 ? -v[i - 1].b : 0 }); return { ...pl, verts: out }; };
  while (open.length) {
    let cur = open.shift(); let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < open.length; i++) {
        const o = open[i]; if (o.layer !== cur.layer || o.color !== cur.color) continue;
        const cs = cur.verts[0].p, ce = cur.verts[cur.verts.length - 1].p, os = o.verts[0].p, oe = o.verts[o.verts.length - 1].p;
        let next = null;
        if (dist(ce, os) <= eps) next = { ...cur, verts: cur.verts.slice(0, -1).concat(o.verts) };
        else if (dist(ce, oe) <= eps) next = { ...cur, verts: cur.verts.slice(0, -1).concat(reverse(o).verts) };
        else if (dist(cs, oe) <= eps) next = { ...cur, verts: o.verts.slice(0, -1).concat(cur.verts) };
        else if (dist(cs, os) <= eps) next = { ...cur, verts: reverse(o).verts.slice(0, -1).concat(cur.verts) };
        if (next) { cur = next; open.splice(i, 1); grew = true; break; }
      }
    }
    if (cur.verts.length > 2 && dist(cur.verts[0].p, cur.verts[cur.verts.length - 1].p) <= eps) { cur = { ...cur, verts: cur.verts.slice(0, -1), closed: true }; }
    done.push(cur);
  }
  return done;
}
const sanitizeLayer = n => String(n || '0').replace(/^“(\d+)”$/, '$1').replace(/[<>\/\\":;?*|=`,]/g, '_').trim().slice(0, 255) || '0';
const fmt = v => { if (!isFinite(v)) v = 0; const s = (Math.round(v * 1e6) / 1e6).toFixed(6).replace(/\.?0+$/, ''); return s === '-0' ? '0' : s; };

function writeDXF(ents, opts, layerNames) {
  const r2000 = opts.version === 'r2000'; const out = []; const G = (c, v) => out.push(String(c), typeof v === 'number' ? fmt(v) : String(v));
  let H = 0x20; const nh = () => (H++).toString(16).toUpperCase();
  const ext = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }; const grow = (x, y) => { ext.x0 = Math.min(ext.x0, x); ext.y0 = Math.min(ext.y0, y); ext.x1 = Math.max(ext.x1, x); ext.y1 = Math.max(ext.y1, y); };
  ents.forEach(e => { if (e.verts) e.verts.forEach(v => grow(...v.p)); if (e.a) { grow(...e.a); grow(...e.b); } if (e.c) { const r = e.r || Math.hypot(...(e.major || [0, 0])); grow(e.c[0] - r, e.c[1] - r); grow(e.c[0] + r, e.c[1] + r); } if (e.ctrl) e.ctrl.forEach(p => grow(...p)); if (e.type === 'TEXT') grow(e.x, e.y); });
  if (!isFinite(ext.x0)) Object.assign(ext, { x0: 0, y0: 0, x1: 0, y1: 0 });
  const layerColor = {}; ents.forEach(e => { if (!(e.layer in layerColor)) layerColor[e.layer] = e.color === 256 ? 7 : e.color; }); layerNames.forEach(n => { if (!(n in layerColor)) layerColor[n] = 7; }); if (!('0' in layerColor)) layerColor['0'] = 7;
  // handles reserved for the R2000 structure
  const hd = r2000 ? { vportT: nh(), ltypeT: nh(), layerT: nh(), styleT: nh(), viewT: nh(), ucsT: nh(), appidT: nh(), dimT: nh(), brT: nh(), ms: nh(), ps: nh(), msB: nh(), msE: nh(), psB: nh(), psE: nh(), root: nh(), groups: nh(), layouts: nh(), layM: nh(), layP: nh() } : null;
  G(0, 'SECTION'); G(2, 'HEADER'); G(9, '$ACADVER'); G(1, r2000 ? 'AC1015' : 'AC1009');
  if (r2000) { G(9, '$HANDSEED'); G(5, 'FFFFF'); G(9, '$DWGCODEPAGE'); G(3, 'ANSI_1252'); }
  G(9, '$INSBASE'); G(10, 0); G(20, 0); G(30, 0); G(9, '$EXTMIN'); G(10, ext.x0); G(20, ext.y0); G(30, 0); G(9, '$EXTMAX'); G(10, ext.x1); G(20, ext.y1); G(30, 0);
  G(9, '$LIMMIN'); G(10, 0); G(20, 0); G(9, '$LIMMAX'); G(10, Math.max(1, ext.x1)); G(20, Math.max(1, ext.y1));
  G(9, '$INSUNITS'); G(70, UNITS[opts.units]?.ins ?? 4); if (r2000) { G(9, '$MEASUREMENT'); G(70, opts.units === 'in' ? 0 : 1); }
  G(0, 'ENDSEC');
  if (r2000) { G(0, 'SECTION'); G(2, 'CLASSES'); G(0, 'ENDSEC'); }
  // ---- tables
  G(0, 'SECTION'); G(2, 'TABLES');
  const table = (name, h, n, fn, extra) => { G(0, 'TABLE'); G(2, name); if (r2000) { G(5, h); G(330, 0); G(100, 'AcDbSymbolTable'); } G(70, n); if (r2000 && extra) extra(); fn(); G(0, 'ENDTAB'); };
  const rec = (type, sub, owner, hcode = 5) => { G(0, type); if (r2000) { G(hcode, nh()); G(330, owner); G(100, 'AcDbSymbolTableRecord'); G(100, sub); } };
  table('VPORT', hd?.vportT, 1, () => { rec('VPORT', 'AcDbViewportTableRecord', hd?.vportT); G(2, '*ACTIVE'); G(70, 0); G(10, 0); G(20, 0); G(11, 1); G(21, 1); G(12, (ext.x0 + ext.x1) / 2); G(22, (ext.y0 + ext.y1) / 2); G(13, 0); G(23, 0); G(14, 10); G(24, 10); G(15, 10); G(25, 10); G(16, 0); G(26, 0); G(36, 1); G(17, 0); G(27, 0); G(37, 0); G(40, Math.max(1, ext.y1 - ext.y0) * 1.1); G(41, 1.6); G(42, 50); G(43, 0); G(44, 0); G(50, 0); G(51, 0); G(71, 0); G(72, 100); G(73, 1); G(74, 3); G(75, 0); G(76, 0); G(77, 0); G(78, 0); });
  table('LTYPE', hd?.ltypeT, r2000 ? 3 : 1, () => {
    const lt = (name, desc) => { rec('LTYPE', 'AcDbLinetypeTableRecord', hd?.ltypeT); G(2, name); G(70, 0); G(3, desc); G(72, 65); G(73, 0); G(40, 0); };
    if (r2000) { lt('ByBlock', ''); lt('ByLayer', ''); } lt(r2000 ? 'Continuous' : 'CONTINUOUS', 'Solid line');
  });
  const lnames = Object.keys(layerColor);
  table('LAYER', hd?.layerT, lnames.length, () => lnames.forEach(n => { rec('LAYER', 'AcDbLayerTableRecord', hd?.layerT); G(2, n); G(70, 0); G(62, layerColor[n] || 7); G(6, r2000 ? 'Continuous' : 'CONTINUOUS'); if (r2000) { G(370, -3); G(390, 0); } }));
  table('STYLE', hd?.styleT, 1, () => { rec('STYLE', 'AcDbTextStyleTableRecord', hd?.styleT); G(2, r2000 ? 'Standard' : 'STANDARD'); G(70, 0); G(40, 0); G(41, 1); G(50, 0); G(71, 0); G(42, 2.5); G(3, 'txt'); G(4, ''); });
  table('VIEW', hd?.viewT, 0, () => { }); table('UCS', hd?.ucsT, 0, () => { });
  table('APPID', hd?.appidT, 1, () => { rec('APPID', 'AcDbRegAppTableRecord', hd?.appidT); G(2, 'ACAD'); G(70, 0); });
  table('DIMSTYLE', hd?.dimT, 1, () => { rec('DIMSTYLE', 'AcDbDimStyleTableRecord', hd?.dimT, r2000 ? 105 : 5); G(2, r2000 ? 'Standard' : 'STANDARD'); G(70, 0); }, () => G(100, 'AcDbDimStyleTable'));
  if (r2000) table('BLOCK_RECORD', hd.brT, 2, () => {
    G(0, 'BLOCK_RECORD'); G(5, hd.ms); G(330, hd.brT); G(100, 'AcDbSymbolTableRecord'); G(100, 'AcDbBlockTableRecord'); G(2, '*Model_Space'); G(340, hd.layM);
    G(0, 'BLOCK_RECORD'); G(5, hd.ps); G(330, hd.brT); G(100, 'AcDbSymbolTableRecord'); G(100, 'AcDbBlockTableRecord'); G(2, '*Paper_Space'); G(340, hd.layP);
  });
  G(0, 'ENDSEC');
  // ---- blocks
  G(0, 'SECTION'); G(2, 'BLOCKS');
  if (r2000) [['*Model_Space', hd.ms, hd.msB, hd.msE, 0], ['*Paper_Space', hd.ps, hd.psB, hd.psE, 1]].forEach(([n, br, b, e, ps]) => {
    G(0, 'BLOCK'); G(5, b); G(330, br); G(100, 'AcDbEntity'); if (ps) G(67, 1); G(8, '0'); G(100, 'AcDbBlockBegin'); G(2, n); G(70, 0); G(10, 0); G(20, 0); G(30, 0); G(3, n); G(1, '');
    G(0, 'ENDBLK'); G(5, e); G(330, br); G(100, 'AcDbEntity'); if (ps) G(67, 1); G(8, '0'); G(100, 'AcDbBlockEnd');
  });
  G(0, 'ENDSEC');
  // ---- entities
  G(0, 'SECTION'); G(2, 'ENTITIES');
  const head = (type, e, sub) => { G(0, type); if (r2000) { G(5, nh()); G(330, hd.ms); G(100, 'AcDbEntity'); } G(8, e.layer); G(62, e.color); if (r2000 && opts.color === 'true' && e.truecolor) G(420, (e.truecolor[0] << 16) | (e.truecolor[1] << 8) | e.truecolor[2]); if (r2000 && sub) G(100, sub); };
  for (const e of ents) {
    if (e.type === 'LINE') { head('LINE', e, 'AcDbLine'); G(10, e.a[0]); G(20, e.a[1]); G(30, 0); G(11, e.b[0]); G(21, e.b[1]); G(31, 0); }
    else if (e.type === 'CIRCLE') { head('CIRCLE', e, 'AcDbCircle'); G(10, e.c[0]); G(20, e.c[1]); G(30, 0); G(40, e.r); }
    else if (e.type === 'ARC') { head('ARC', e, 'AcDbCircle'); G(10, e.c[0]); G(20, e.c[1]); G(30, 0); G(40, e.r); if (r2000) G(100, 'AcDbArc'); G(50, e.start); G(51, e.end); }
    else if (e.type === 'ELLIPSE') { head('ELLIPSE', e, 'AcDbEllipse'); G(10, e.c[0]); G(20, e.c[1]); G(30, 0); G(11, e.major[0]); G(21, e.major[1]); G(31, 0); G(210, 0); G(220, 0); G(230, 1); G(40, e.ratio); G(41, 0); G(42, Math.PI * 2); }
    else if (e.type === 'LWPOLYLINE') { head('LWPOLYLINE', e, 'AcDbPolyline'); G(90, e.verts.length); G(70, e.closed ? 1 : 0); G(43, 0); e.verts.forEach(v => { G(10, v.p[0]); G(20, v.p[1]); if (Math.abs(v.b) > 1e-9) G(42, v.b); }); }
    else if (e.type === 'POLYLINE') {
      head('POLYLINE', e, 'AcDb2dPolyline'); G(66, 1); G(10, 0); G(20, 0); G(30, 0); G(70, e.closed ? 1 : 0);
      e.verts.forEach(v => { G(0, 'VERTEX'); if (r2000) { G(5, nh()); G(330, hd.ms); G(100, 'AcDbEntity'); } G(8, e.layer); if (r2000) { G(100, 'AcDbVertex'); G(100, 'AcDb2dVertex'); } G(10, v.p[0]); G(20, v.p[1]); G(30, 0); if (Math.abs(v.b) > 1e-9) G(42, v.b); });
      G(0, 'SEQEND'); if (r2000) { G(5, nh()); G(330, hd.ms); G(100, 'AcDbEntity'); } G(8, e.layer);
    }
    else if (e.type === 'SPLINE') { head('SPLINE', e, 'AcDbSpline'); G(210, 0); G(220, 0); G(230, 1); G(70, 8 | (e.closed ? 0 : 0)); G(71, 3); G(72, e.knots.length); G(73, e.ctrl.length); G(74, 0); G(42, 1e-10); G(43, 1e-10); e.knots.forEach(kn => G(40, kn)); e.ctrl.forEach(p => { G(10, p[0]); G(20, p[1]); G(30, 0); }); }
    else if (e.type === 'TEXT') {
      head('TEXT', e, 'AcDbText'); G(10, e.x); G(20, e.y); G(30, 0); G(40, Math.max(1e-4, e.h)); G(1, dxfEsc(e.text.replace(/[\r\n]/g, ' '))); if (e.rot) G(50, e.rot); G(7, r2000 ? 'Standard' : 'STANDARD');
      const jx = e.just === 'center' ? 1 : e.just === 'right' ? 2 : 0; if (jx) { G(72, jx); G(11, e.x); G(21, e.y); G(31, 0); } if (r2000) G(100, 'AcDbText');
    }
  }
  G(0, 'ENDSEC');
  if (r2000) { // ---- objects: root dictionary, groups, layouts
    G(0, 'SECTION'); G(2, 'OBJECTS');
    G(0, 'DICTIONARY'); G(5, hd.root); G(330, 0); G(100, 'AcDbDictionary'); G(281, 1); G(3, 'ACAD_GROUP'); G(350, hd.groups); G(3, 'ACAD_LAYOUT'); G(350, hd.layouts);
    G(0, 'DICTIONARY'); G(5, hd.groups); G(330, hd.root); G(100, 'AcDbDictionary'); G(281, 1);
    G(0, 'DICTIONARY'); G(5, hd.layouts); G(330, hd.root); G(100, 'AcDbDictionary'); G(281, 1); G(3, 'Model'); G(350, hd.layM); G(3, 'Layout1'); G(350, hd.layP);
    [['Model', hd.layM, hd.ms, 0], ['Layout1', hd.layP, hd.ps, 1]].forEach(([n, h, br, tab]) => {
      G(0, 'LAYOUT'); G(5, h); G(330, hd.layouts); G(100, 'AcDbPlotSettings'); G(1, ''); G(2, 'none_device'); G(4, ''); G(6, ''); [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 140, 141].forEach(c => G(c, 0)); G(142, 1); G(143, 1); G(70, tab ? 0 : 1024); G(72, 0); G(73, 0); G(74, 5); G(7, ''); G(75, 16); G(147, 1); G(148, 0); G(149, 0);
      G(100, 'AcDbLayout'); G(1, n); G(70, 1); G(71, tab); G(10, 0); G(20, 0); G(11, 420); G(21, 297); G(12, 0); G(22, 0); G(32, 0); G(14, ext.x0); G(24, ext.y0); G(34, 0); G(15, ext.x1); G(25, ext.y1); G(35, 0); G(146, 0); G(13, 0); G(23, 0); G(33, 0); G(16, 1); G(26, 0); G(36, 0); G(17, 0); G(27, 1); G(37, 0); G(76, 0); G(330, br);
    });
    G(0, 'ENDSEC');
  }
  G(0, 'EOF');
  return out.join('\r\n') + '\r\n';
}

// opts: { scope: 'selection'|'board'|'all', version: 'r12'|'r2000', units, scale, curves: 'arcs'|'flatten'|'explode'|'spline', tolerance (mm), color: 'aci'|'basic'|'bylayer'|'true', text: 'text'|'outline'|'skip', join, exact }
async function exportDXF(opts = {}) {
  opts = { scope: 'board', version: 'r12', units: 'mm', scale: 1, curves: 'arcs', tolerance: 0.05, color: 'aci', text: 'text', join: false, exact: true, ...opts };
  VX.flushCommit(); VX.finishText?.(true);
  let items = targetsFor(opts.scope); if (!items.length) throw new Error(opts.scope === 'selection' ? 'Select something to export' : 'Nothing to export');
  let S = null, keys = null;
  const isText = i => i instanceof P.PointText || i.data?.live?.kind === 'top';
  const hasText = items.some(i => isText(i) || (i.getItems && i.getItems({ match: isText }).length));
  try {
    if (hasText && opts.text === 'outline' && VX.f.createOutlines) {
      S = VX.snapshot(); keys = VX.selKeys(); const tkeys = VX.selKeys(items);
      const texts = items.flatMap(i => isText(i) ? [i] : i.getItems ? i.getItems({ match: isText }) : []).filter(t => !t.parent?.data?.live || t.data?.live?.kind === 'top');
      VX.setSel(texts); const outs = await VX.f.createOutlines({ quiet: true }) || [];
      items = VX.resolveKeys(tkeys).filter(i => i.parent && !(i instanceof P.PointText)); outs.forEach(o => { if (!items.some(t => o.isDescendant(t))) items.push(o); });
    } else if (opts.text === 'skip') items = items.filter(i => !(i instanceof P.PointText));
    const { ents, stats, k } = buildEntities({ ...opts, items });
    const layerNames = [...new Set(VX.userLayers().map(L => sanitizeLayer(L.name)))];
    const text = writeDXF(ents, opts, opts.layersAll ? layerNames : []);
    return { text, stats, entities: ents.length, k };
  } finally { if (S) { VX.restore(S); VX.setSel(VX.resolveKeys(keys)); } }
}
VX.f.exportDXF = exportDXF;
VX.f.dxfExportDialog = async () => {
  const v = await form({ title: 'Export DXF', ok: 'Export', fields: [
    { key: 'scope', label: 'What to export', type: 'select', value: VX.sel.length ? 'selection' : 'board', options: [{ value: 'selection', label: 'Selection only' }, { value: 'board', label: 'Current artboard' }, { value: 'all', label: 'Everything (all artboards)' }] },
    { key: 'version', label: 'DXF version', type: 'select', value: 'r12', options: [{ value: 'r12', label: 'R12 ASCII — most compatible (laser cutters, CNC)' }, { value: 'r2000', label: 'R2000 — LWPOLYLINE, ELLIPSE, SPLINE, true colour' }] },
    { key: 'units', label: 'Units', type: 'select', value: 'mm', options: Object.entries(UNITS).map(([k, u]) => ({ value: k, label: u.label })) },
    { key: 'scale', label: 'Scale factor', type: 'number', value: 1 },
    { key: 'curves', label: 'Curves', type: 'select', value: 'arcs', options: [{ value: 'arcs', label: 'Polylines with true arcs (smooth, R12-safe)' }, { value: 'flatten', label: 'Flatten to straight segments (safest for lasers)' }, { value: 'explode', label: 'Separate LINE and ARC entities' }, { value: 'spline', label: 'SPLINE entities (R2000 only)' }] },
    { key: 'tolerance', label: 'Curve tolerance (mm)', type: 'number', value: 0.05 },
    { key: 'exact', label: 'Export exact circles / ellipses as CIRCLE / ELLIPSE', type: 'checkbox', value: true },
    { key: 'color', label: 'Colours', type: 'select', value: 'aci', options: [{ value: 'aci', label: 'Stroke colour → nearest ACI colour (256)' }, { value: 'basic', label: 'Stroke colour → basic ACI 1–7 (cut / engrave mapping)' }, { value: 'bylayer', label: 'By layer' }, { value: 'true', label: 'True colour (R2000) + ACI fallback' }] },
    { key: 'text', label: 'Text', type: 'select', value: 'text', options: [{ value: 'text', label: 'TEXT entities' }, { value: 'outline', label: 'Convert to outlines' }, { value: 'skip', label: 'Leave text out' }] },
    { key: 'join', label: 'Join paths that touch (continuous cuts)', type: 'checkbox', value: false }] });
  if (!v) return;
  try {
    const r = await exportDXF({ ...v, scale: +v.scale || 1, tolerance: Math.max(0.0001, +v.tolerance || 0.05) });
    const p = await bts.fs.saveAs({ data: new TextEncoder().encode(r.text), defaultPath: DOC.name.replace(/\.\w+$/, '') + '.dxf', filters: [{ name: 'DXF', extensions: ['dxf'] }] });
    if (p) toast(`Exported DXF: ${r.entities} entities`, 'ok'); return r;
  } catch (e) { console.error(e); toast(e.message, 'err', 6000); }
};

// ---------------------------------------------------------------- import
function parseDXF(text) {
  const lines = text.split(/\r\n|\r|\n/); const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) { const c = parseInt(lines[i].trim(), 10); if (isNaN(c)) { i--; continue; } pairs.push([c, lines[i + 1].replace(/^\s+/, '').replace(/\s+$/, '')]); }
  const header = {}, layers = {}, blocks = {}, entities = []; let sec = null, i = 0;
  const readEntity = () => { const e = { type: pairs[i][1], codes: [] }; i++; while (i < pairs.length && pairs[i][0] !== 0) { e.codes.push(pairs[i]); i++; } return e; };
  while (i < pairs.length) {
    const [c, v] = pairs[i];
    if (c === 0 && v === 'SECTION') { sec = pairs[i + 1]?.[1]; i += 2; continue; }
    if (c === 0 && v === 'ENDSEC') { sec = null; i++; continue; }
    if (c === 0 && v === 'EOF') break;
    if (sec === 'HEADER' && c === 9) { const name = v; i++; const vals = []; while (i < pairs.length && pairs[i][0] !== 9 && pairs[i][0] !== 0) { vals.push(pairs[i]); i++; } header[name] = vals; continue; }
    if (sec === 'TABLES' && c === 0 && v === 'LAYER') { const e = readEntity(); const g = k => e.codes.find(p => p[0] === k)?.[1]; if (g(2) != null) layers[g(2)] = { color: parseInt(g(62) || '7', 10), tc: g(420) != null ? +g(420) : null }; continue; }
    if (sec === 'BLOCKS' && c === 0 && v === 'BLOCK') { const b = readEntity(); const g = k => b.codes.find(p => p[0] === k)?.[1]; const name = g(2); const blk = { base: [+(g(10) || 0), +(g(20) || 0)], ents: [] }; while (i < pairs.length && !(pairs[i][0] === 0 && pairs[i][1] === 'ENDBLK')) { if (pairs[i][0] === 0) blk.ents.push(readEntity()); else i++; } blocks[name] = blk; continue; }
    if (sec === 'ENTITIES' && c === 0) { entities.push(readEntity()); continue; }
    i++;
  }
  // attach VERTEX records to their POLYLINE
  const group = list => { const out = []; for (let k = 0; k < list.length; k++) { const e = list[k]; if (e.type === 'POLYLINE') { e.vertices = []; while (k + 1 < list.length && list[k + 1].type === 'VERTEX') e.vertices.push(list[++k]); if (list[k + 1]?.type === 'SEQEND') k++; } if (e.type !== 'SEQEND' && e.type !== 'VERTEX') out.push(e); } return out; };
  Object.values(blocks).forEach(b => { b.ents = group(b.ents); });
  return { header, layers, blocks, entities: group(entities) };
}
VX.f.parseDXF = parseDXF;
const INS2PX = { 0: null, 1: 96, 2: 96 * 12, 4: 96 / 25.4, 5: 96 / 2.54, 6: 9600 / 2.54, 8: 96e-6, 9: 96e-3, 10: 96 * 36, 13: 96e-3 / 25.4, 14: 96 / 2.54 / 10 * 10 };
function getc(e, code, def) { const p = e.codes.find(q => q[0] === code); return p ? p[1] : def; }
const num = (e, code, def = 0) => { const v = getc(e, code); return v == null ? def : parseFloat(v); };

function buildFromDXF(d, k) {
  // returns { layers: Map name → [items], stats }
  const out = new Map(); const stats = {}; const T0 = new P.Matrix(k, 0, 0, -k, 0, 0); const skipped = {};
  const add = (layer, it) => { if (!out.has(layer)) out.set(layer, []); out.get(layer).push(it); };
  const colorOf = (e, layer, blockColor) => {
    const tc = getc(e, 420); if (tc != null) { const v = +tc; return new P.Color(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255); }
    let c = parseInt(getc(e, 62, '256'), 10); if (c === 0 && blockColor) return blockColor; if (c === 256 || isNaN(c)) { const L = d.layers[layer]; if (L?.tc != null) { const v = L.tc; return new P.Color(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255); } c = Math.abs(L?.color ?? 7); }
    if (c === 7 || c <= 0 || c > 255) return new P.Color(0, 0, 0); const a = ACI[c]; return new P.Color(a[0] / 255, a[1] / 255, a[2] / 255);
  };
  const style = (it, e, layer, M, blockColor) => { it.strokeColor = colorOf(e, layer, blockColor); it.strokeWidth = 1; it.fillColor = null; it.strokeScaling = true; it.data.dxf = e.type; };
  const arcPts = (cx, cy, r, a0, a1) => { while (a1 <= a0) a1 += 360; return { s: [cx + r * Math.cos(a0 * Math.PI / 180), cy + r * Math.sin(a0 * Math.PI / 180)], m: [cx + r * Math.cos((a0 + a1) / 2 * Math.PI / 180), cy + r * Math.sin((a0 + a1) / 2 * Math.PI / 180)], e: [cx + r * Math.cos(a1 * Math.PI / 180), cy + r * Math.sin(a1 * Math.PI / 180)] }; };
  const polyPath = (verts, closed, M) => { // verts [{x,y,b}] in DXF space
    const p = new P.Path({ insert: false }); const T = (x, y) => M.transform(new P.Point(x, y)); if (!verts.length) return null;
    p.moveTo(T(verts[0].x, verts[0].y)); const n = verts.length, segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) { const a = verts[i], b = verts[(i + 1) % n]; if (closed && i === n - 1 && Math.hypot(a.x - b.x, a.y - b.y) < 1e-12) break;
      if (Math.abs(a.b || 0) > 1e-9) { const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy); if (L < 1e-12) continue; const s = a.b * L / 2; const mx = (a.x + b.x) / 2 + dy / L * s, my = (a.y + b.y) / 2 - dx / L * s; p.arcTo(T(mx, my), T(b.x, b.y)); }
      else if (!(closed && i === n - 1)) p.lineTo(T(b.x, b.y)); }
    if (closed) p.closePath(); return p;
  };
  const deBoor = (deg, knots, ctrl, w, t) => { let s = deg; while (s < knots.length - deg - 2 && t >= knots[s + 1]) s++; const dd = []; for (let j = 0; j <= deg; j++) { const c = ctrl[s - deg + j], ww = w ? w[s - deg + j] : 1; dd.push([c[0] * ww, c[1] * ww, ww]); } for (let r = 1; r <= deg; r++) for (let j = deg; j >= r; j--) { const i = s - deg + j; const den = knots[i + deg - r + 1] - knots[i]; const a = den ? (t - knots[i]) / den : 0; dd[j] = [0, 1, 2].map(q => (1 - a) * dd[j - 1][q] + a * dd[j][q]); } return [dd[deg][0] / dd[deg][2], dd[deg][1] / dd[deg][2]]; };
  const draw = (e, M, layerIn, depth, blockColor) => {
    const layer = getc(e, 8, '0') === '0' && layerIn ? layerIn : getc(e, 8, '0'); const T = (x, y) => M.transform(new P.Point(x, y)); let it = null;
    stats[e.type] = (stats[e.type] || 0) + 1;
    switch (e.type) {
      case 'LINE': it = new P.Path({ segments: [T(num(e, 10), num(e, 20)), T(num(e, 11), num(e, 21))], insert: false }); break;
      case 'LWPOLYLINE': { const verts = []; for (const [c, v] of e.codes) { if (c === 10) verts.push({ x: +v, y: 0, b: 0 }); else if (c === 20 && verts.length) verts[verts.length - 1].y = +v; else if (c === 42 && verts.length) verts[verts.length - 1].b = +v; } it = polyPath(verts, (parseInt(getc(e, 70, '0'), 10) & 1) === 1, M); break; }
      case 'POLYLINE': { const flags = parseInt(getc(e, 70, '0'), 10); if (flags & (16 | 64)) { skipped[e.type + ' mesh'] = (skipped[e.type + ' mesh'] || 0) + 1; break; } const verts = (e.vertices || []).filter(v => !(parseInt(getc(v, 70, '0'), 10) & 16)).map(v => ({ x: num(v, 10), y: num(v, 20), b: num(v, 42, 0) })); it = polyPath(verts, (flags & 1) === 1, M); break; }
      case 'CIRCLE': { const cx = num(e, 10), cy = num(e, 20), r = num(e, 40); it = new P.Path.Circle({ center: [cx, cy], radius: r, insert: false }); it.transform(M); break; }
      case 'ARC': { const a = arcPts(num(e, 10), num(e, 20), num(e, 40), num(e, 50), num(e, 51)); it = new P.Path({ insert: false }); it.moveTo(T(...a.s)); it.arcTo(T(...a.m), T(...a.e)); break; }
      case 'ELLIPSE': {
        const cx = num(e, 10), cy = num(e, 20), ax = num(e, 11), ay = num(e, 21), ratio = num(e, 40, 1); let t0 = num(e, 41, 0), t1 = num(e, 42, Math.PI * 2); while (t1 <= t0) t1 += Math.PI * 2;
        const bx = -ay * ratio, by = ax * ratio; const pt = t => [cx + ax * Math.cos(t) + bx * Math.sin(t), cy + ay * Math.cos(t) + by * Math.sin(t)]; const dp = t => [-ax * Math.sin(t) + bx * Math.cos(t), -ay * Math.sin(t) + by * Math.cos(t)];
        const full = Math.abs(t1 - t0 - Math.PI * 2) < 1e-9; const n = Math.max(1, Math.ceil((t1 - t0) / (Math.PI / 2) - 1e-9)); const dt = (t1 - t0) / n, kk = 4 / 3 * Math.tan(dt / 4);
        it = new P.Path({ insert: false }); it.moveTo(T(...pt(t0)));
        for (let i = 0; i < n; i++) { const a = t0 + i * dt, b = a + dt, pa = pt(a), pb = pt(b), da = dp(a), db = dp(b); it.cubicCurveTo(T(pa[0] + kk * da[0], pa[1] + kk * da[1]), T(pb[0] - kk * db[0], pb[1] - kk * db[1]), T(...pb)); }
        if (full) it.closePath(); break;
      }
      case 'SPLINE': {
        const deg = parseInt(getc(e, 71, '3'), 10), knots = [], ctrl = [], wts = [], fit = []; for (const [c, v] of e.codes) { if (c === 40) knots.push(+v); else if (c === 10) ctrl.push([+v, 0]); else if (c === 20 && ctrl.length) ctrl[ctrl.length - 1][1] = +v; else if (c === 41) wts.push(+v); else if (c === 11) fit.push([+v, 0]); else if (c === 21 && fit.length) fit[fit.length - 1][1] = +v; }
        const closed = (parseInt(getc(e, 70, '0'), 10) & 1) === 1; it = new P.Path({ insert: false });
        if (ctrl.length > deg && knots.length === ctrl.length + deg + 1) {
          const rational = wts.length === ctrl.length && wts.some(w => Math.abs(w - 1) > 1e-9);
          const interior = knots.slice(deg + 1, knots.length - deg - 1); const bezierForm = deg === 3 && !rational && knots.slice(0, 4).every(v => v === knots[0]) && knots.slice(-4).every(v => v === knots[knots.length - 1]) && interior.every((v, i) => i % 3 === 0 ? interior[i + 1] === v && interior[i + 2] === v : true) && interior.length % 3 === 0;
          if (bezierForm) { it.moveTo(T(...ctrl[0])); for (let i = 1; i + 2 < ctrl.length; i += 3) it.cubicCurveTo(T(...ctrl[i]), T(...ctrl[i + 1]), T(...ctrl[i + 2])); }
          else { const a = knots[deg], b = knots[knots.length - deg - 1], N = Math.max(16, (ctrl.length - deg) * 12); for (let i = 0; i <= N; i++) { const p = deBoor(deg, knots, ctrl, rational ? wts : null, Math.min(b - 1e-12, a + (b - a) * i / N)); i ? it.lineTo(T(...p)) : it.moveTo(T(...p)); } it.simplify(0.15); }
        } else if (fit.length > 1) { fit.forEach((p, i) => i ? it.lineTo(T(...p)) : it.moveTo(T(...p))); it.smooth({ type: 'catmull-rom' }); }
        if (closed) it.closePath(); break;
      }
      case 'TEXT': case 'MTEXT': {
        let s = getc(e, 1, '') + e.codes.filter(p => p[0] === 3).map(p => p[1]).join(''); s = dxfUnesc(s); if (e.type === 'MTEXT') s = dxfUnesc(e.codes.filter(p => p[0] === 3).map(p => p[1]).join('') + getc(e, 1, '')).replace(/\\P/g, '\n').replace(/\\[A-Za-z][^;\\{}]*;/g, '').replace(/[{}]/g, '').replace(/\\~/g, ' ');
        const hgt = num(e, 40, 1); const jx = parseInt(getc(e, 72, '0'), 10); const useAlign = e.type === 'TEXT' && jx && getc(e, 11) != null;
        const x = useAlign ? num(e, 11) : num(e, 10), y = useAlign ? num(e, 21) : num(e, 20); const rot = e.type === 'MTEXT' ? (getc(e, 50) != null ? num(e, 50) : Math.atan2(num(e, 21, 0), num(e, 11, 1)) * 180 / Math.PI) : num(e, 50, 0);
        const pos = T(x, y); const scale = Math.sqrt(Math.abs(M.a * M.d - M.b * M.c));
        it = new P.PointText({ insert: false, point: pos, content: s, fontFamily: 'Arial', fontSize: hgt / TEXT_CAP * scale, justification: jx === 1 || jx === 4 ? 'center' : jx === 2 ? 'right' : 'left' });
        if (e.type === 'MTEXT') it.translate([0, it.fontSize * 0.8]);
        if (rot) it.rotate(-rot, pos); it.fillColor = colorOf(e, layer, blockColor); it.data.dxf = e.type; add(layer, it); return;
      }
      case 'INSERT': {
        const blk = d.blocks[getc(e, 2)]; if (!blk || depth > 8) break; const ix = num(e, 10), iy = num(e, 20), sx = num(e, 41, 1), sy = num(e, 42, 1), rot = num(e, 50, 0) * Math.PI / 180;
        const B = M.clone().append(new P.Matrix(1, 0, 0, 1, ix, iy)).append(new P.Matrix(Math.cos(rot), Math.sin(rot), -Math.sin(rot), Math.cos(rot), 0, 0)).append(new P.Matrix(sx, 0, 0, sy, 0, 0)).append(new P.Matrix(1, 0, 0, 1, -blk.base[0], -blk.base[1]));
        const bc = colorOf(e, layer, blockColor); blk.ents.forEach(be => draw(be, B, layer, depth + 1, bc)); return;
      }
      default: skipped[e.type] = (skipped[e.type] || 0) + 1; stats[e.type]--; if (!stats[e.type]) delete stats[e.type]; return;
    }
    if (it) { style(it, e, layer, M, blockColor); add(layer, it); }
  };
  d.entities.forEach(e => draw(e, T0, null, 0, null));
  return { out, stats, skipped };
}

// opts: { mode: 'open'|'place', units: 'mm'|'in'|'px'|null (null = from file / ask), ask }
async function importDXF(file, opts = {}) {
  const u8 = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data); const name = file.name || 'drawing.dxf'; const mode = opts.mode || 'open';
  let text = new TextDecoder('utf-8').decode(u8); if (text.includes('�')) text = new TextDecoder('windows-1252').decode(u8);
  if (/^AutoCAD Binary DXF/.test(text)) throw new Error('Binary DXF is not supported — save it as ASCII DXF.');
  const d = parseDXF(text); if (!d.entities.length) throw new Error('No drawing entities found in this DXF.');
  const ins = parseInt(d.header.$INSUNITS?.[0]?.[1] ?? '0', 10); let k = INS2PX[ins] ?? null;
  if (opts.units) k = opts.units === 'mm' ? 96 / 25.4 : opts.units === 'in' ? 96 : 1;
  if (k == null) {
    let u = 'mm'; if (opts.ask !== false) { const v = await form({ title: 'DXF units', ok: 'Import', fields: [{ key: 'u', label: 'This DXF does not say which units it uses. Treat one unit as:', type: 'select', value: 'mm', options: [{ value: 'mm', label: '1 millimetre' }, { value: 'in', label: '1 inch' }, { value: 'px', label: '1 pixel' }] }] }); if (!v) return null; u = v.u; }
    k = u === 'mm' ? 96 / 25.4 : u === 'in' ? 96 : 1;
  }
  const { out, stats, skipped } = buildFromDXF(d, k);
  let bounds = null; out.forEach(list => list.forEach(it => { bounds = bounds ? bounds.unite(it.bounds) : it.bounds.clone(); }));
  if (!bounds) throw new Error('Nothing drawable in this DXF.');
  const docName = name.replace(/\.dxf$/i, '.btsv');
  if (mode === 'open') {
    const W = Math.max(1, Math.ceil(bounds.width)), H = Math.max(1, Math.ceil(bounds.height));
    VX.createDoc('custom', { name: docName, w: W, h: H }); VX.userLayers().forEach(L => L.remove());
    const off = bounds.topLeft.multiply(-1);
    [...out.keys()].forEach(ln => { const L = VX.newUserLayer(ln === '0' ? 'Layer 0' : VX.safeItemName(ln)); out.get(ln).forEach(it => { it.translate(off); L.addChild(it); }); if (d.layers[ln] && d.layers[ln].color < 0) L.visible = false; });
    VX.drawArtboard(); VX.resetHistory('Open'); DOC.name = docName; VX.fitArt(); UI.setDocTitle(DOC.name, 'BTS Vector');
  } else {
    const g = new P.Group({ name: VX.safeItemName(name.replace(/\.\w+$/, '')) }); (VX.iso || P.project.activeLayer).addChild(g);
    [...out.keys()].forEach(ln => { const sub = new P.Group({ name: VX.safeItemName(ln) }); out.get(ln).forEach(it => sub.addChild(it)); g.addChild(sub); });
    g.position = VX.abRect().center; VX.setSel([g]); VX.commit('Place ' + name);
  }
  const n = Object.values(stats).reduce((a, b) => a + b, 0); const sk = Object.entries(skipped).map(([t, c]) => `${c} ${t}`).join(', ');
  toast(`Imported ${n} DXF entities` + (sk ? ` (skipped: ${sk})` : ''), sk ? '' : 'ok', 6000);
  return { stats, skipped, k, bounds: { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height } };
}
VX.f.importDXF = importDXF;
VX.f.openDXFDialog = async () => { const fs = await bts.fs.open({ filters: [{ name: 'DXF', extensions: ['dxf'] }] }); if (fs) return VX.openFile(fs[0]); };
VX.f.placeDXFDialog = async () => { const fs = await bts.fs.open({ filters: [{ name: 'DXF', extensions: ['dxf'] }] }); if (!fs) return; try { return await importDXF({ ...fs[0], data: new Uint8Array(fs[0].data) }, { mode: 'place' }); } catch (e) { toast('Could not place DXF: ' + e.message, 'err', 6000); } };
})();
