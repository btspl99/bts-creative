// BTS Vector — geometry & effects: live effects (Distort & Transform, Warp, Offset, Round corners, Blur),
// Repeat (radial / grid / mirror), Blend, variable-width strokes, outline stroke, shapes, shadows & glow.
(() => {
const { P, DOC } = VX; const { h, toast, form, clamp } = UI;
const G = VX.G = {};
const ins = { insert: false };
const sel = () => VX.sel;

// ---------------------------------------------------------------- helpers
G.rng = seed => { let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };
G.eachPath = (item, fn) => { if (!item) return; if (item instanceof P.Path) fn(item); else if (item instanceof P.CompoundPath || item instanceof P.Group) item.children.slice().forEach(c => G.eachPath(c, fn)); };
G.hasText = items => items.some(i => i instanceof P.PointText || (i.getItems && i.getItems({ class: P.PointText }).length));
// Offsets along a path that include every anchor (so corners survive resampling)
G.sampleOffsets = (path, step) => { const len = path.length; if (!len) return [0]; const n = Math.max(4, Math.ceil(len / Math.max(0.5, step))); const set = []; for (let k = 0; k <= n; k++) set.push(len * k / n); path.segments.forEach(s => { const o = s.location?.offset; if (o != null) set.push(o); }); set.sort((a, b) => a - b); const out = []; set.forEach(o => { if (!out.length || o - out[out.length - 1] > 1e-3) out.push(o); }); if (path.closed && out.length > 1 && len - out[out.length - 1] < 1e-3) out.pop(); return out; };
G.resample = (path, step) => G.sampleOffsets(path, step).map(o => path.getPointAt(Math.min(o, path.length))).filter(Boolean);
G.setPoints = (path, pts, simplifyTol) => { const closed = path.closed; path.removeSegments(); path.addSegments(pts); path.closed = closed; if (simplifyTol) path.simplify(simplifyTol); };
// map every point of every path through fn (dense resample first)
G.mapItem = (item, fn, { step = 4, simplify = 0.25 } = {}) => G.eachPath(item, p => { if (p.segments.length < 2 && !p.closed) return; const pts = G.resample(p, step).map(fn); G.setPoints(p, pts, simplify); });
G.lerp = (a, b, t) => a + (b - a) * t;
G.lerpColor = (a, b, t) => { if (!a && !b) return null; if (!a || a.gradient) return t < 0.5 ? a : b; if (!b || b.gradient) return t < 0.5 ? a : b; return new P.Color(G.lerp(a.red, b.red, t), G.lerp(a.green, b.green, t), G.lerp(a.blue, b.blue, t), G.lerp(a.alpha, b.alpha, t)); };

// ---------------------------------------------------------------- stroke → shape (used by outline stroke, offset, blob brush, eraser, width)
G.strokeToShape = (path, width, { cap = 'butt', join = 'round', miterLimit = 4 } = {}) => {
  const w = width / 2; const parts = [];
  const strip = c => { const len = c.length; const m = clamp(Math.ceil(len / 3), 2, 80); const L = [], R = []; for (let k = 0; k <= m; k++) { const t = c.getTimeAt(len * k / m) ?? k / m; const p = c.getPointAtTime(t), n = c.getNormalAtTime(t); if (!p || !n || isNaN(n.x)) continue; L.push(p.add(n.multiply(w))); R.push(p.subtract(n.multiply(w))); } if (L.length < 2) return null; return new P.Path({ segments: [...L, ...R.reverse()], closed: true, insert: false }); };
  path.curves.forEach(c => { if (c.length < 1e-6) return; const s = strip(c); if (s) parts.push(s); });
  const segs = path.segments; const n = segs.length;
  segs.forEach((s, i) => {
    const isEnd = !path.closed && (i === 0 || i === n - 1);
    if (isEnd) {
      if (cap === 'round') parts.push(new P.Path.Circle({ center: s.point, radius: w, insert: false }));
      else if (cap === 'square') { const c = i === 0 ? path.firstCurve : path.lastCurve; if (!c) return; const t = i === 0 ? 0 : 1; const tg = c.getTangentAtTime(t).multiply(i === 0 ? -1 : 1), nn = c.getNormalAtTime(t); parts.push(new P.Path({ segments: [s.point.add(nn.multiply(w)), s.point.add(nn.multiply(w)).add(tg.multiply(w)), s.point.subtract(nn.multiply(w)).add(tg.multiply(w)), s.point.subtract(nn.multiply(w))], closed: true, insert: false })); }
      return;
    }
    const cin = s.previous && s.curve?.previous || (path.closed ? path.lastCurve : null), cout = s.curve;
    if (!cin || !cout) return;
    if (join === 'round') { parts.push(new P.Path.Circle({ center: s.point, radius: w, insert: false })); return; }
    const t1 = cin.getTangentAtTime(1), t2 = cout.getTangentAtTime(0); const n1 = cin.getNormalAtTime(1), n2 = cout.getNormalAtTime(0);
    if (!t1 || !t2 || Math.abs(t1.cross(t2)) < 1e-4) return;
    [1, -1].forEach(sg => { const A = s.point.add(n1.multiply(w * sg)), B = s.point.add(n2.multiply(w * sg)); let poly = [s.point, A, B];
      if (join === 'miter') { const den = t1.cross(t2); const k = (B.subtract(A)).cross(t2) / den; const M = A.add(t1.multiply(k)); if (M.getDistance(s.point) <= miterLimit * w) poly = [s.point, A, M, B]; }
      parts.push(new P.Path({ segments: poly, closed: true, insert: false })); });
  });
  return G.uniteAll(parts);
};
G.uniteAll = parts => { let arr = parts.filter(Boolean); if (!arr.length) return null; while (arr.length > 1) { const nx = []; for (let i = 0; i < arr.length; i += 2) nx.push(i + 1 < arr.length ? arr[i].unite(arr[i + 1], ins) : arr[i]); arr = nx; } return arr[0]; };
G.offsetShape = (shape, d, join = 'round') => {
  if (!d) return shape.clone(ins);
  if (shape instanceof P.Path && !shape.closed) { const r = G.strokeToShape(shape, Math.abs(d) * 2, { cap: 'round', join }); return r; }
  let ring = null; G.eachPath(shape, p => { const r = G.strokeToShape(p, Math.abs(d) * 2, { join, cap: 'butt' }); ring = ring ? ring.unite(r, ins) : r; });
  const base = shape.clone(ins); base.strokeColor = null;
  return d > 0 ? base.unite(ring, ins) : base.subtract(ring, ins);
};
// variable-width outline of a spine path. widthAt(u) → full width at relative length u ∈ [0,1]
G.variableOutline = (spine, widthAt, { caps = 'round' } = {}) => {
  const len = spine.length; if (!len) return null; const n = clamp(Math.ceil(len / 2.5), 8, 600); const L = [], R = [];
  for (let k = 0; k <= n; k++) { const o = len * k / n; const p = spine.getPointAt(o), nn = spine.getNormalAt(o); if (!p || !nn) continue; const w = Math.max(0.01, widthAt(k / n)) / 2; L.push(p.add(nn.multiply(w))); R.push(p.subtract(nn.multiply(w))); }
  const pts = [...L];
  if (!spine.closed && caps === 'round') { const e = spine.getPointAt(len), te = spine.getTangentAt(len), we = Math.max(0.01, widthAt(1)) / 2; for (let a = 1; a < 8; a++) { const ang = -90 + a * 180 / 8; pts.push(e.add(te.rotate(ang).multiply(we))); } }
  pts.push(...R.reverse());
  if (!spine.closed && caps === 'round') { const s = spine.getPointAt(0), ts = spine.getTangentAt(0).multiply(-1), ws = Math.max(0.01, widthAt(0)) / 2; for (let a = 1; a < 8; a++) { const ang = -90 + a * 180 / 8; pts.push(s.add(ts.rotate(ang).multiply(ws))); } }
  const out = new P.Path({ segments: pts, closed: true, insert: false }); out.simplify(0.4);
  if (spine.closed) { const inner = new P.Path({ segments: R.slice().reverse(), closed: true, insert: false }); const outer = new P.Path({ segments: L, closed: true, insert: false }); const ring = Math.abs(outer.area) > Math.abs(inner.area) ? outer.subtract(inner, ins) : inner.subtract(outer, ins); return ring; }
  return out;
};
G.profiles = {
  uniform: () => 1, taperBoth: u => Math.sin(Math.PI * clamp(u, 0, 1)) * 0.95 + 0.05, taperStart: u => 0.08 + 0.92 * Math.min(1, u * 2.2), taperEnd: u => 0.08 + 0.92 * Math.min(1, (1 - u) * 2.2),
  bulge: u => 0.35 + 0.65 * Math.sin(Math.PI * u), pinch: u => 1 - 0.75 * Math.sin(Math.PI * u), wave: u => 0.55 + 0.45 * Math.sin(u * Math.PI * 6),
};
G.widthFromPoints = (pts, base) => u => { if (!pts?.length) return base; const s = [...pts].sort((a, b) => a.t - b.t); if (u <= s[0].t) return s[0].w; if (u >= s[s.length - 1].t) return s[s.length - 1].w; for (let i = 0; i < s.length - 1; i++) if (u >= s[i].t && u <= s[i + 1].t) { const k = (u - s[i].t) / Math.max(1e-6, s[i + 1].t - s[i].t); const e = (1 - Math.cos(Math.PI * k)) / 2; return G.lerp(s[i].w, s[i + 1].w, e); } return base; };

// ---------------------------------------------------------------- round corners
G.roundCornersAt = (path, idxs, r) => {
  if (!(path instanceof P.Path) || r <= 0) return;
  const segs = path.segments; const n = segs.length; const plan = [];
  [...new Set(idxs)].sort((a, b) => b - a).forEach(i => {
    const s = segs[i]; if (!s || s.hasHandles()) return; if (!path.closed && (i === 0 || i === n - 1)) return;
    const prev = s.previous, next = s.next; if (!prev || !next) return;
    const p0 = prev.handleOut.isZero() ? prev.point : prev.point.add(prev.handleOut), p1 = next.handleIn.isZero() ? next.point : next.point.add(next.handleIn);
    const v0 = p0.subtract(s.point), v1 = p1.subtract(s.point); const l0 = s.point.getDistance(prev.point), l1 = s.point.getDistance(next.point); if (l0 < 1e-6 || l1 < 1e-6) return;
    const theta = Math.abs(v0.getDirectedAngle(v1)) * Math.PI / 180; if (theta < 1e-3 || Math.abs(theta - Math.PI) < 1e-3) return;
    let d = r / Math.tan(theta / 2); const dmax = Math.min(l0, l1) * 0.5; let rr = r; if (d > dmax) { d = dmax; rr = d * Math.tan(theta / 2); }
    const A = s.point.add(v0.normalize(d)), B = s.point.add(v1.normalize(d)); const phi = Math.PI - theta; const hl = 4 / 3 * Math.tan(phi / 4) * rr;
    plan.push({ i, A: new P.Segment(A, null, s.point.subtract(A).normalize(hl)), B: new P.Segment(B, s.point.subtract(B).normalize(hl), null) });
  });
  plan.forEach(({ i, A, B }) => { path.removeSegment(i); path.insertSegments(i, [A, B]); });
};
G.roundAll = (item, r) => G.eachPath(item, p => G.roundCornersAt(p, p.segments.map((s, i) => i), r));
VX.f.roundCornersAt = G.roundCornersAt;

// ---------------------------------------------------------------- warp envelopes & distortions
G.WARPS = ['Arc', 'Arch', 'Bulge', 'Flag', 'Wave', 'Fish', 'Rise', 'Fisheye', 'Inflate', 'Squeeze', 'Twist'];
G.warpPoint = (style, bend, u, v) => { // u,v ∈ [-1,1]; returns [du, dv] in normalized units
  const b = bend; switch (style) {
    case 'Arc': return [0, -b * (1 - u * u)];
    case 'Arch': return [0, -b * (1 - u * u) * (1 - v) / 2];
    case 'Bulge': return [0, b * (1 - u * u) * v * 0.5];
    case 'Flag': return [0, b * Math.sin(u * Math.PI) * 0.35];
    case 'Wave': return [0, b * Math.sin(u * Math.PI + (v + 1) * Math.PI / 4) * 0.35];
    case 'Fish': return [0, v * b * 0.45 * Math.cos((u + 1) * Math.PI / 2 * 1.2)];
    case 'Rise': return [0, -b * (u + 1) * (u + 1) / 4 + b * 0.0];
    case 'Fisheye': { const r = Math.hypot(u, v); if (r >= 1) return [0, 0]; const k = b * (1 - r * r) * 0.5; return [u * k, v * k]; }
    case 'Inflate': return [b * (1 - v * v) * u * 0.3, b * (1 - u * u) * v * 0.3];
    case 'Squeeze': return [-b * (1 - v * v) * u * 0.35, b * (1 - u * u) * v * 0.2];
    case 'Twist': { const r = Math.min(1, Math.hypot(u, v)); const a = b * Math.PI / 2 * (1 - r); const cu = u * Math.cos(a) - v * Math.sin(a), cv = u * Math.sin(a) + v * Math.cos(a); return [cu - u, cv - v]; }
  } return [0, 0];
};
G.warpItem = (item, { style = 'Arc', bend = 50, hd = 0, vd = 0, orient = 'h' }, B) => {
  const b = B || item.bounds; const cx = b.center.x, cy = b.center.y, hw = Math.max(1, b.width / 2), hh = Math.max(1, b.height / 2);
  const bb = bend / 100, H = hd / 100, V = vd / 100;
  G.mapItem(item, p => { let u = (p.x - cx) / hw, v = (p.y - cy) / hh; if (orient === 'v') [u, v] = [v, u]; let [du, dv] = G.warpPoint(style, bb, u, v); if (orient === 'v') [du, dv] = [dv, du]; let x = (p.x - cx) / hw + du, y = (p.y - cy) / hh + dv; const ux = (p.x - cx) / hw, vy = (p.y - cy) / hh; x *= 1 + H * vy * 0.5; y *= 1 + V * ux * 0.5; return new P.Point(cx + x * hw, cy + y * hh); }, { step: Math.max(2, Math.min(b.width, b.height) / 60), simplify: 0.3 });
};
G.freeDistort = (item, q, B) => { const b = B || item.bounds; const TL = b.topLeft.add(q.tl), TR = b.topRight.add(q.tr), BR = b.bottomRight.add(q.br), BL = b.bottomLeft.add(q.bl); G.mapItem(item, p => { const s = (p.x - b.x) / (b.width || 1), t = (p.y - b.y) / (b.height || 1); return TL.multiply((1 - s) * (1 - t)).add(TR.multiply(s * (1 - t))).add(BR.multiply(s * t)).add(BL.multiply((1 - s) * t)); }, { step: Math.max(2, Math.min(b.width, b.height) / 50), simplify: 0.25 }); };

// ---------------------------------------------------------------- effect registry
const FX = G.FX = {
  roughen: { name: 'Roughen', fields: p => [{ key: 'size', label: 'Size (% of object)', type: 'range', value: p.size ?? 5, min: 0, max: 50, step: 0.5 }, { key: 'detail', label: 'Detail (points per 100 px)', type: 'range', value: p.detail ?? 10, min: 1, max: 100 }, { key: 'mode', label: 'Points', type: 'select', value: p.mode ?? 'smooth', options: [{ value: 'smooth', label: 'Smooth' }, { value: 'corner', label: 'Corner' }] }, { key: 'seed', label: 'Variation (seed)', type: 'range', value: p.seed ?? 7, min: 1, max: 999 }],
    apply: (it, p, B) => { const rnd = G.rng(p.seed); const amt = (p.size / 100) * Math.hypot(B.width, B.height) * 0.5; G.eachPath(it, path => { const pts = G.resample(path, 100 / p.detail).map(q => q.add(new P.Point((rnd() * 2 - 1) * amt, (rnd() * 2 - 1) * amt))); G.setPoints(path, pts); if (p.mode === 'smooth') path.smooth({ type: 'catmull-rom', factor: 0.5 }); }); return it; } },
  zigzag: { name: 'Zig zag', fields: p => [{ key: 'size', label: 'Size (px)', type: 'range', value: p.size ?? 10, min: 0, max: 100, step: 0.5 }, { key: 'ridges', label: 'Ridges per segment', type: 'range', value: p.ridges ?? 4, min: 1, max: 60 }, { key: 'mode', label: 'Points', type: 'select', value: p.mode ?? 'corner', options: [{ value: 'smooth', label: 'Smooth' }, { value: 'corner', label: 'Corner' }] }],
    apply: (it, p) => { G.eachPath(it, path => { const pts = []; let sg = 1; const curves = path.curves.slice(); curves.forEach(c => { const N = Math.max(2, Math.round(p.ridges) * 2); for (let j = 0; j < N; j++) { const t = c.getTimeAt(c.length * j / N) ?? j / N; const q = c.getPointAtTime(t), nn = c.getNormalAtTime(t); if (q && nn) pts.push(q.add(nn.multiply(p.size * sg))); sg = -sg; } }); if (!path.closed) { const e = path.lastSegment.point, nn = path.getNormalAt(path.length); if (nn) pts.push(e.add(nn.multiply(p.size * sg))); } G.setPoints(path, pts); if (p.mode === 'smooth') path.smooth({ type: 'catmull-rom', factor: 0.5 }); }); return it; } },
  pucker: { name: 'Pucker & bloat', fields: p => [{ key: 'amount', label: 'Pucker ← → Bloat (%)', type: 'range', value: p.amount ?? 40, min: -200, max: 200 }],
    apply: (it, p, B) => { const c = B.center; const k = p.amount / 100; G.eachPath(it, path => { const pts = []; path.curves.slice().forEach(cv => { const K = 18; for (let j = 0; j < K; j++) { const t = cv.getTimeAt(cv.length * j / K) ?? j / K; const q = cv.getPointAtTime(t); const w = Math.sin(Math.PI * j / K); pts.push(q.add(q.subtract(c).multiply(k * w * 0.6))); } }); if (!path.closed) pts.push(path.lastSegment.point); G.setPoints(path, pts, 0.3); }); return it; } },
  twist: { name: 'Twist', fields: p => [{ key: 'angle', label: 'Angle (°)', type: 'range', value: p.angle ?? 60, min: -720, max: 720 }],
    apply: (it, p, B) => { const c = B.center; const R = Math.max(1, Math.hypot(B.width, B.height) / 2); G.mapItem(it, q => { const d = q.getDistance(c) / R; return q.rotate(p.angle * (1 - Math.min(1, d)), c); }, { step: 3, simplify: 0.3 }); return it; } },
  tweak: { name: 'Tweak', fields: p => [{ key: 'h', label: 'Horizontal (% of object)', type: 'range', value: p.h ?? 10, min: 0, max: 100 }, { key: 'v', label: 'Vertical (% of object)', type: 'range', value: p.v ?? 10, min: 0, max: 100 }, { key: 'anchors', label: 'Modify anchor points', type: 'checkbox', value: p.anchors ?? true }, { key: 'handles', label: 'Modify control points (handles)', type: 'checkbox', value: p.handles ?? true }, { key: 'seed', label: 'Variation (seed)', type: 'range', value: p.seed ?? 3, min: 1, max: 999 }],
    apply: (it, p, B) => { const rnd = G.rng(p.seed); const dx = B.width * p.h / 100, dy = B.height * p.v / 100; const r = () => new P.Point((rnd() * 2 - 1) * dx, (rnd() * 2 - 1) * dy); G.eachPath(it, path => { path.segments.forEach(s => { if (p.anchors) s.point = s.point.add(r()); if (p.handles) { s.handleIn = s.handleIn.isZero() ? r().multiply(0.4) : s.handleIn.add(r().multiply(0.5)); s.handleOut = s.handleOut.isZero() ? r().multiply(0.4) : s.handleOut.add(r().multiply(0.5)); } }); }); return it; } },
  warp: { name: 'Warp', fields: p => [{ key: 'style', label: 'Style', type: 'select', value: p.style ?? 'Arc', options: G.WARPS }, { key: 'orient', label: 'Orientation', type: 'select', value: p.orient ?? 'h', options: [{ value: 'h', label: 'Horizontal' }, { value: 'v', label: 'Vertical' }] }, { key: 'bend', label: 'Bend (%)', type: 'range', value: p.bend ?? 50, min: -100, max: 100 }, { key: 'hd', label: 'Horizontal distortion (%)', type: 'range', value: p.hd ?? 0, min: -100, max: 100 }, { key: 'vd', label: 'Vertical distortion (%)', type: 'range', value: p.vd ?? 0, min: -100, max: 100 }],
    apply: (it, p, B) => { G.warpItem(it, p, B); return it; } },
  freeDistort: { name: 'Free distort', fields: p => ['tl', 'tr', 'br', 'bl'].flatMap(k => [{ key: k + 'x', label: { tl: 'Top-left', tr: 'Top-right', br: 'Bottom-right', bl: 'Bottom-left' }[k] + ' X offset (%)', type: 'range', value: p[k + 'x'] ?? ({ tl: 10, tr: -10 }[k] || 0), min: -100, max: 100 }, { key: k + 'y', label: 'Y offset (%)', type: 'range', value: p[k + 'y'] ?? 0, min: -100, max: 100 }]),
    apply: (it, p, B) => { const o = k => new P.Point((p[k + 'x'] || 0) / 100 * B.width, (p[k + 'y'] || 0) / 100 * B.height); G.freeDistort(it, { tl: o('tl'), tr: o('tr'), br: o('br'), bl: o('bl') }, B); return it; } },
  transform: { name: 'Transform', fields: p => [{ key: 'sx', label: 'Scale H (%)', type: 'range', value: p.sx ?? 90, min: 1, max: 200 }, { key: 'sy', label: 'Scale V (%)', type: 'range', value: p.sy ?? 90, min: 1, max: 200 }, { key: 'mx', label: 'Move H (px)', type: 'range', value: p.mx ?? 20, min: -500, max: 500 }, { key: 'my', label: 'Move V (px)', type: 'range', value: p.my ?? 0, min: -500, max: 500 }, { key: 'rot', label: 'Rotate (°)', type: 'range', value: p.rot ?? 10, min: -180, max: 180 }, { key: 'copies', label: 'Copies', type: 'range', value: p.copies ?? 5, min: 0, max: 60 }],
    apply: (it, p) => { const g = new P.Group({ insert: false }); g.addChild(it); let last = it; for (let k = 0; k < p.copies; k++) { const c = last.clone(); c.scale(p.sx / 100, p.sy / 100); c.translate([p.mx, p.my]); c.rotate(p.rot); last = c; } if (!p.copies) { last.scale(p.sx / 100, p.sy / 100); last.translate([p.mx, p.my]); last.rotate(p.rot); } return g; } },
  offset: { name: 'Offset path', fields: p => [{ key: 'd', label: 'Offset (px)', type: 'range', value: p.d ?? 10, min: -200, max: 200, step: 0.5 }, { key: 'join', label: 'Joins', type: 'select', value: p.join ?? 'round', options: [{ value: 'round', label: 'Round' }, { value: 'miter', label: 'Miter' }, { value: 'bevel', label: 'Bevel' }] }, { key: 'keep', label: 'Keep original underneath', type: 'checkbox', value: p.keep ?? false }],
    apply: (it, p) => { const out = []; const one = s => { const r = G.offsetShape(s, p.d, p.join); if (!r) return s; r.style = s.style; if (!s.closed && s instanceof P.Path) { r.fillColor = s.strokeColor; r.strokeColor = null; } return r; }; let res; if (it instanceof P.Group) { it.children.slice().forEach(c => { if (VX.isShape(c)) { const r = one(c); if (p.keep) r.insertBelow(c); else c.replaceWith(r); } }); res = it; } else if (VX.isShape(it)) { const r = one(it); if (p.keep) { const g = new P.Group({ insert: false }); g.addChildren([r, it]); res = g; } else res = r; } else res = it; out.push(res); return res; } },
  round: { name: 'Round corners', fields: p => [{ key: 'r', label: 'Radius (px)', type: 'range', value: p.r ?? 12, min: 0, max: 300 }], apply: (it, p) => { G.roundAll(it, p.r); return it; } },
  blur: { name: 'Gaussian blur', fields: p => [{ key: 'r', label: 'Radius (px)', type: 'range', value: p.r ?? 6, min: 0, max: 100, step: 0.5 }], apply: (it, p) => G.blurRaster(it, p.r) },
};
G.blurRaster = (it, r) => { const tmp = it.clone(); tmp.shadowColor = null; const pad = r * 3; const res = 2; const ras = tmp.rasterize({ resolution: 72 * res, insert: false }); tmp.remove(); const c = document.createElement('canvas'); c.width = Math.ceil(ras.width + pad * 2 * res); c.height = Math.ceil(ras.height + pad * 2 * res); const x = c.getContext('2d'); x.filter = `blur(${r * res / 2}px)`; x.drawImage(ras.canvas, pad * res, pad * res); const out = new P.Raster({ canvas: c, insert: false }); out.scale(1 / res); out.position = ras.position; return out; };

// ---------------------------------------------------------------- live effect groups: Group{ data.live:{kind:'fx', fx:[{type,p}]}, children:[source(hidden), result] }
const srcOf = g => g.children[0];
function regenFx(g) {
  const src = srcOf(g); g.children.slice(1).forEach(c => c.remove());
  let res = src.clone({ insert: false }); res.visible = true; const B = src.strokeBounds;
  for (const f of g.data.live.fx) { const def = FX[f.type]; if (!def) continue; res = def.apply(res, f.p, res.strokeBounds || B) || res; }
  res.visible = true; g.addChild(res); return g;
}
G.regenFx = regenFx;
function wrapFx(it) { if (it.data?.live?.kind === 'fx') return it; const g = new P.Group({ insert: false }); g.insertAbove(it); g.data.live = { kind: 'fx', fx: [] }; g.name = it.name || ''; g.opacity = it.opacity; g.blendMode = it.blendMode; if (it.shadowColor) { g.shadowColor = it.shadowColor; g.shadowBlur = it.shadowBlur; g.shadowOffset = it.shadowOffset; it.shadowColor = null; } it.opacity = 1; it.blendMode = 'normal'; g.addChild(it); it.visible = false; return g; }
VX.live.fx = {
  name: 'Effect', styleTargets: g => g.children,
  edit: g => editFxChain(g),
  expand: g => { const res = g.children[1]; const parent = g.parent, idx = g.index; const out = []; if (res) { res.remove(); res.opacity *= g.opacity; if (g.shadowColor) { res.shadowColor = g.shadowColor; res.shadowBlur = g.shadowBlur; res.shadowOffset = g.shadowOffset; } parent.insertChild(idx, res); out.push(res); } g.remove(); return out; },
};
async function ensureOutlinesForFx() { if (G.hasText(sel()) && VX.f.createOutlines) { const ok = await UI.confirm('Convert type to outlines?', 'Distortion effects work on paths. The selected text will be converted to outlines (shapes) first.', 'Convert'); if (!ok) return false; await VX.f.createOutlines(); } return true; }
async function fxDialog(type, preset) {
  const def = FX[type]; if (!def) return;
  if (!sel().length) return toast('Select one or more objects first');
  if (type !== 'blur' && !(await ensureOutlinesForFx())) return;
  const p0 = preset ? { style: preset } : {};
  const fields = def.fields(p0);
  return VX.withPreview({ title: def.name, fields, label: def.name, apply: v => { const items = sel(); const out = items.map(it => { const g = wrapFx(it); g.data.live.fx.push({ type, p: { ...v } }); regenFx(g); return g; }); VX.setSel(out); } });
}
async function editFxChain(g) {
  const fx = g.data.live.fx; if (!fx.length) return;
  let idx = fx.length - 1;
  if (fx.length > 1) { const v = await form({ title: 'Edit effect', fields: [{ key: 'i', label: 'Effect', type: 'select', value: String(idx), options: fx.map((f, i) => ({ value: String(i), label: `${i + 1}. ${FX[f.type]?.name || f.type}` })) }], ok: 'Edit' }); if (!v) return; idx = +v.i; }
  const f = fx[idx]; const def = FX[f.type];
  VX.setSel([g]);
  return VX.withPreview({ title: 'Edit ' + def.name, fields: def.fields(f.p), label: 'Edit ' + def.name, apply: v => { const gg = sel()[0]; gg.data.live.fx[idx].p = { ...v }; regenFx(gg); } });
}
function fxSection(items) {
  const g = items.length === 1 && items[0].data?.live ? items[0] : null; if (!g) return null;
  const L = g.data.live; const sec = VX.sec;
  if (L.kind === 'fx') return sec('Effects (live)', ...L.fx.map((f, i) => h('div', { class: 'colrow' }, h('span', { style: { flex: 1, color: 'var(--tx-1)' } }, `fx  ${FX[f.type]?.name || f.type}`), h('button', { class: 'btn sm', onclick: () => { VX.setSel([g]); const def = FX[f.type]; VX.withPreview({ title: 'Edit ' + def.name, fields: def.fields(f.p), label: 'Edit effect', apply: v => { const gg = sel()[0]; gg.data.live.fx[i].p = { ...v }; regenFx(gg); } }); } }, 'Edit'), h('button', { class: 'btn sm', onclick: () => { g.data.live.fx.splice(i, 1); if (!g.data.live.fx.length) { const src = srcOf(g); src.visible = true; src.remove(); src.opacity = g.opacity; g.parent.insertChild(g.index, src); g.remove(); VX.setSel([src]); } else { regenFx(g); VX.setSel([g]); } VX.commit('Remove effect'); } }, '✕'))),
    h('div', { class: 'row', style: { gap: '4px' } }, h('button', { class: 'btn sm', onclick: VX.F('expandAppearance') }, 'Expand appearance')));
  const def = VX.live[L.kind]; if (!def) return null;
  return sec((def.name || 'Live object'), h('div', { class: 'muted', style: { fontSize: '11px', marginBottom: '6px' } }, def.describe ? def.describe(g) : 'Live, editable object'), h('div', { class: 'row', style: { gap: '4px', flexWrap: 'wrap' } }, def.edit ? h('button', { class: 'btn sm', onclick: () => def.edit(g) }, 'Edit…') : '', h('button', { class: 'btn sm', onclick: VX.F('expandAppearance') }, 'Expand')));
}
VX.propSections.push(fxSection);

// ---------------------------------------------------------------- Repeat (live): Group{ data.live:{kind:'repeat', type, p}, children:[source, copies…] }
function regenRepeat(g) {
  const { type, p } = g.data.live; const src = g.children[0];
  const prevCenters = g.children.map(c => c.bounds.center);
  g.children.slice(1).forEach(c => c.remove());
  if (type === 'radial') {
    const n = Math.max(1, Math.round(p.count)); let c;
    if (prevCenters.length > 1) c = prevCenters.reduce((a, b) => a.add(b), new P.Point(0, 0)).divide(prevCenters.length); else c = src.bounds.center.add([0, p.radius]);
    let dir = src.bounds.center.subtract(c); if (dir.length < 1e-6) dir = new P.Point(0, -1);
    src.translate(c.add(dir.normalize(p.radius)).subtract(src.bounds.center));
    for (let k = 1; k < n; k++) { const cp = src.clone(); const a = 360 * k / n; if (p.rotate) cp.rotate(a, c); else cp.position = src.position.rotate(a, c); }
    g.data.live.center = [c.x, c.y];
  } else if (type === 'grid') {
    const rows = Math.max(1, Math.round(p.rows)), cols = Math.max(1, Math.round(p.cols)); const b = src.bounds; const w = b.width + p.gx, hh = b.height + p.gy;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { if (!r && !c) continue; const cp = src.clone(); cp.translate([c * w + (r % 2 ? p.brick / 100 * w : 0), r * hh]); if (p.flipAlt && (r + c) % 2) cp.scale(-1, 1); }
  } else if (type === 'mirror') {
    const b = src.bounds; const cp = src.clone();
    if (p.axis === 'v') cp.scale(-1, 1, new P.Point(b.right + p.gap / 2, b.center.y)); else cp.scale(1, -1, new P.Point(b.center.x, b.bottom + p.gap / 2));
    if (p.angle) cp.rotate(p.angle, new P.Point(p.axis === 'v' ? b.right + p.gap / 2 : b.center.x, p.axis === 'v' ? b.center.y : b.bottom + p.gap / 2));
  }
  return g;
}
const REPEAT_FIELDS = {
  radial: p => [{ key: 'count', label: 'Number of instances', type: 'range', value: p.count ?? 8, min: 1, max: 100 }, { key: 'radius', label: 'Radius (px)', type: 'range', value: p.radius ?? 150, min: 0, max: 2000 }, { key: 'rotate', label: 'Rotate instances', type: 'checkbox', value: p.rotate ?? true }],
  grid: p => [{ key: 'rows', label: 'Rows', type: 'range', value: p.rows ?? 3, min: 1, max: 50 }, { key: 'cols', label: 'Columns', type: 'range', value: p.cols ?? 4, min: 1, max: 50 }, { key: 'gx', label: 'Horizontal spacing (px)', type: 'range', value: p.gx ?? 20, min: -500, max: 1000 }, { key: 'gy', label: 'Vertical spacing (px)', type: 'range', value: p.gy ?? 20, min: -500, max: 1000 }, { key: 'brick', label: 'Row offset / brick (%)', type: 'range', value: p.brick ?? 0, min: 0, max: 100 }, { key: 'flipAlt', label: 'Flip alternate instances', type: 'checkbox', value: p.flipAlt ?? false }],
  mirror: p => [{ key: 'axis', label: 'Axis', type: 'select', value: p.axis ?? 'v', options: [{ value: 'v', label: 'Vertical (left ↔ right)' }, { value: 'h', label: 'Horizontal (top ↕ bottom)' }] }, { key: 'gap', label: 'Gap (px)', type: 'range', value: p.gap ?? 0, min: -500, max: 500 }, { key: 'angle', label: 'Axis angle (°)', type: 'range', value: p.angle ?? 0, min: -90, max: 90 }],
};
const RNAME = { radial: 'Radial repeat', grid: 'Grid repeat', mirror: 'Mirror repeat' };
VX.live.repeat = {
  name: 'Repeat', describe: g => `${RNAME[g.data.live.type]} · ${g.children.length} instances — double-click to edit`,
  edit: g => { VX.setSel([g]); const { type, p } = g.data.live; return VX.withPreview({ title: RNAME[type] + ' options', fields: REPEAT_FIELDS[type](p), label: 'Edit repeat', apply: v => { const gg = sel()[0]; gg.data.live.p = { ...v }; regenRepeat(gg); } }); },
  expand: g => { delete g.data.live; return [g]; },
};
VX.f.repeat = type => {
  if (!sel().length) return toast('Select the artwork to repeat');
  return VX.withPreview({ title: RNAME[type], fields: REPEAT_FIELDS[type]({}), label: RNAME[type], apply: v => { const items = sel(); let src = items.length > 1 ? (() => { const s = [...items].sort((a, b) => a.index - b.index); const gg = new P.Group({ insert: false }); gg.insertAbove(s[s.length - 1]); gg.addChildren(s); return gg; })() : items[0]; if (src.data?.live?.kind === 'repeat') { src.data.live = { kind: 'repeat', type, p: { ...v } }; regenRepeat(src); VX.setSel([src]); return; } const g = new P.Group({ insert: false }); g.insertAbove(src); g.addChild(src); g.data.live = { kind: 'repeat', type, p: { ...v } }; g.name = RNAME[type]; regenRepeat(g); VX.setSel([g]); } });
};
VX.f.editLive = () => { const g = sel()[0]; if (!g?.data?.live) return toast('Select a live object (repeat, blend, effect, type on path)'); const L = VX.live[g.data.live.kind]; L?.edit ? L.edit(g) : toast('Nothing to edit'); };

// ---------------------------------------------------------------- Blend: Group{ data.live:{kind:'blend', p:{steps, orient}}, children:[A, steps…, B] }
G.pathPoints = (path, n) => { const len = path.length; const pts = []; const N = path.closed ? n : n - 1; for (let k = 0; k < n; k++) pts.push(path.getPointAt(Math.min(len, len * k / N))); return pts; };
G.singlePath = it => { if (it instanceof P.Path) return it; if (it instanceof P.CompoundPath && it.children.length === 1) return it.children[0]; return null; };
G.interpolate = (A, B, t) => {
  const pa = G.singlePath(A), pb = G.singlePath(B);
  if (pa && pb && pa.length && pb.length) {
    const n = clamp(Math.max(pa.segments.length, pb.segments.length) * 10, 48, 240);
    let a = G.pathPoints(pa, n), b = G.pathPoints(pb, n);
    if (pa.closed && pb.closed) { if (pa.clockwise !== pb.clockwise) b = b.reverse(); let best = 0, bd = Infinity; const ca = pa.bounds.center, cb = pb.bounds.center; for (let s = 0; s < n; s += Math.max(1, Math.floor(n / 48))) { let d = 0; for (let k = 0; k < n; k += 4) d += a[k].subtract(ca).getDistance(b[(k + s) % n].subtract(cb)); if (d < bd) { bd = d; best = s; } } b = b.slice(best).concat(b.slice(0, best)); }
    const pts = a.map((p, k) => p.multiply(1 - t).add(b[k].multiply(t)));
    const out = new P.Path({ segments: pts, closed: pa.closed && pb.closed, insert: false }); out.simplify(0.6);
    out.fillColor = G.lerpColor(A.fillColor, B.fillColor, t); out.strokeColor = G.lerpColor(A.strokeColor, B.strokeColor, t); out.strokeWidth = G.lerp(A.strokeWidth || 0, B.strokeWidth || 0, t); out.opacity = G.lerp(A.opacity, B.opacity, t);
    return out;
  }
  const src = (t < 0.5 ? A : B).clone({ insert: false }); const ba = A.bounds, bb = B.bounds; const tb = t < 0.5 ? ba : bb;
  const w = G.lerp(ba.width, bb.width, t), hh = G.lerp(ba.height, bb.height, t); src.scale(w / Math.max(1e-6, tb.width), hh / Math.max(1e-6, tb.height)); src.position = ba.center.multiply(1 - t).add(bb.center.multiply(t));
  VX.eachStyled(src, i => { const fa = VX.firstStyled(A), fb = VX.firstStyled(B); if (fa && fb) { i.fillColor = G.lerpColor(fa.fillColor, fb.fillColor, t); i.strokeColor = G.lerpColor(fa.strokeColor, fb.strokeColor, t); } });
  return src;
};
function regenBlend(g) {
  const kids = g.children; const A = kids[0], B = kids[kids.length - 1]; kids.slice(1, -1).forEach(c => c.remove());
  const n = Math.max(1, Math.round(g.data.live.p.steps)); let prev = A;
  for (let k = 1; k <= n; k++) { const t = k / (n + 1); const m = G.interpolate(A, B, t); m.data.blendStep = true; m.insertAbove(prev); prev = m; }
  return g;
}
VX.live.blend = {
  name: 'Blend', describe: g => `${g.data.live.p.steps} steps between 2 objects — double-click to edit`,
  edit: g => { VX.setSel([g]); return VX.withPreview({ title: 'Blend options', fields: [{ key: 'steps', label: 'Specified steps', type: 'range', value: g.data.live.p.steps, min: 1, max: 200 }], label: 'Blend options', apply: v => { const gg = sel()[0]; gg.data.live.p = { ...v }; regenBlend(gg); } }); },
  expand: g => { delete g.data.live; g.name = 'Expanded blend'; return [g]; },
};
G.makeBlend = (A, B, steps) => { const s = [A, B].sort((a, b) => a.index - b.index); const g = new P.Group({ insert: false }); g.insertAbove(s[1]); g.addChildren([A, B]); g.data.live = { kind: 'blend', p: { steps } }; g.name = 'Blend'; regenBlend(g); return g; };
VX.f.blendMake = () => { const items = sel(); if (items.length !== 2) return toast('Select exactly two objects to blend'); return VX.withPreview({ title: 'Make blend', fields: [{ key: 'steps', label: 'Specified steps', type: 'range', value: 8, min: 1, max: 200 }], label: 'Blend', apply: v => { const [a, b] = sel(); VX.setSel([G.makeBlend(a, b, v.steps)]); } }); };
VX.f.blendRelease = () => { const g = sel()[0]; if (g?.data?.live?.kind !== 'blend') return toast('Select a blend'); const kids = g.children; const A = kids[0], B = kids[kids.length - 1]; kids.slice(1, -1).forEach(c => c.remove()); const parent = g.parent, idx = g.index; parent.insertChildren(idx, [A, B]); g.remove(); VX.setSel([A, B]); VX.commit('Release blend'); };
UI.shortcut('ctrl+alt+b', () => VX.f.blendMake());

// ---------------------------------------------------------------- variable-width stroke: Group{ data.live:{kind:'vw', pts:[{t,w}], profile, base}, children:[spine(hidden), outline] }
G.regenVW = g => { const L = g.data.live; const spine = g.children[0]; g.children.slice(1).forEach(c => c.remove()); const fn = L.pts?.length ? G.widthFromPoints(L.pts, L.base) : (u => L.base * (G.profiles[L.profile] || G.profiles.uniform)(u)); const o = G.variableOutline(spine, fn, { caps: L.caps || 'round' }); if (!o) return g; o.fillColor = L.color || spine.strokeColor || '#000'; o.strokeColor = null; g.addChild(o); return g; };
G.makeVW = (spine, { base, profile = 'uniform', pts = null, color } = {}) => { const g = new P.Group({ insert: false }); g.insertAbove(spine); const col = color || (spine.strokeColor ? spine.strokeColor.toCSS(true) : '#000'); g.addChild(spine); spine.visible = false; g.data.live = { kind: 'vw', base: base || spine.strokeWidth || 4, profile, pts, color: col }; g.name = 'Width stroke'; G.regenVW(g); return g; };
VX.live.vw = {
  name: 'Variable-width stroke', describe: g => (g.data.live.pts?.length ? `${g.data.live.pts.length} width points` : `Profile: ${g.data.live.profile}`) + ' — use the Width tool (Shift+W) to edit',
  styleTargets: g => g.children.slice(1),
  edit: g => { VX.setSel([g]); return VX.withPreview({ title: 'Stroke width profile', fields: [{ key: 'base', label: 'Width (px)', type: 'range', value: g.data.live.base, min: 0.5, max: 200, step: 0.5 }, { key: 'profile', label: 'Profile', type: 'select', value: g.data.live.pts?.length ? 'points' : g.data.live.profile, options: [...Object.keys(G.profiles), 'points'] }], label: 'Width profile', apply: v => { const gg = sel()[0]; gg.data.live.base = v.base; if (v.profile !== 'points') { gg.data.live.profile = v.profile; gg.data.live.pts = null; } G.regenVW(gg); } }); },
  expand: g => { const o = g.children[1]; const parent = g.parent, idx = g.index; if (o) { o.remove(); parent.insertChild(idx, o); } g.remove(); return o ? [o] : []; },
};

// ---------------------------------------------------------------- path commands
VX.f.outlineStroke = () => {
  const items = sel(); if (!items.length) return toast('Select stroked paths'); const out = [];
  items.forEach(i => {
    if (i.data?.live?.kind === 'vw') { out.push(...VX.live.vw.expand(i)); return; }
    const paths = i instanceof P.Path ? [i] : i instanceof P.CompoundPath ? [i] : [];
    if (!paths.length || !i.strokeColor || !i.strokeWidth) { out.push(i); return; }
    let shape = null; G.eachPath(i, p => { const s = G.strokeToShape(p, i.strokeWidth, { cap: i.strokeCap, join: i.strokeJoin, miterLimit: i.miterLimit }); if (s) shape = shape ? shape.unite(s, ins) : s; });
    if (!shape) { out.push(i); return; }
    shape.fillColor = i.strokeColor; shape.strokeColor = null; shape.opacity = 1;
    if (i.fillColor && (i.closed || i instanceof P.CompoundPath)) { const g = new P.Group({ insert: false }); g.insertAbove(i); const f = i; f.strokeColor = null; g.addChildren([f, shape]); out.push(g); } else { shape.insertAbove(i); i.remove(); out.push(shape); }
  });
  VX.setSel(out); VX.commit('Outline stroke');
};
VX.f.addAnchors = () => { const ps = VX.selPaths(); if (!ps.length) return toast('Select paths'); ps.forEach(p => { for (let i = p.curves.length - 1; i >= 0; i--) p.curves[i].divideAtTime(0.5); }); VX.commit('Add anchor points'); VX.drawGuides(); };
VX.f.simplifyDialog = () => VX.withPreview({ title: 'Simplify', fields: [{ key: 't', label: 'Curve precision (lower = fewer points)', type: 'range', value: 2.5, min: 0.1, max: 30, step: 0.1 }, { key: 'straight', label: 'Straight lines', type: 'checkbox', value: false }], label: 'Simplify', apply: v => VX.selPaths().forEach(p => { if (v.straight) { p.flatten(v.t * 2); } else p.simplify(v.t); }) });
VX.f.smoothDialog = () => VX.withPreview({ title: 'Smooth', fields: [{ key: 'type', label: 'Method', type: 'select', value: 'continuous', options: ['continuous', 'catmull-rom', 'geometric', 'asymmetric'] }, { key: 'factor', label: 'Factor (catmull-rom / geometric)', type: 'range', value: 0.5, min: 0, max: 1, step: 0.05 }], label: 'Smooth', apply: v => VX.selPaths().forEach(p => p.smooth({ type: v.type, factor: v.factor })) });
VX.f.roundCornersDialog = () => {
  const segs = VX.selSegs.filter(s => s.path); if (segs.length) { const byPath = new Map(); segs.forEach(s => { if (!byPath.has(s.path)) byPath.set(s.path, []); byPath.get(s.path).push(s.index); }); const keys = [...byPath].map(([p, idx]) => ({ k: VX.selKeys([p])[0], idx })); return VX.withPreview({ title: 'Round selected corners', fields: [{ key: 'r', label: 'Radius (px)', type: 'range', value: 12, min: 0, max: 300 }], label: 'Round corners', apply: v => keys.forEach(({ k, idx }) => { const p = VX.resolveKeys([k])[0]; if (p) G.roundCornersAt(p, idx, v.r); }) }); }
  return fxDialog('round');
};
VX.f.averageAnchors = async () => { const segs = VX.selSegs; if (segs.length < 2) return toast('Select two or more anchor points with the Direct selection tool'); const v = await form({ title: 'Average', fields: [{ key: 'axis', label: 'Axis', type: 'select', value: 'both', options: ['both', 'horizontal', 'vertical'] }] }); if (!v) return; const c = segs.reduce((a, s) => a.add(s.point), new P.Point(0, 0)).divide(segs.length); segs.forEach(s => { s.point = new P.Point(v.axis === 'vertical' ? s.point.x : c.x, v.axis === 'horizontal' ? s.point.y : c.y); }); VX.commit('Average'); VX.drawGuides(); };
VX.f.splitGrid = () => VX.withPreview({ title: 'Split into grid', fields: [{ key: 'rows', label: 'Rows', type: 'range', value: 3, min: 1, max: 40 }, { key: 'cols', label: 'Columns', type: 'range', value: 3, min: 1, max: 40 }, { key: 'gut', label: 'Gutter (px)', type: 'range', value: 10, min: 0, max: 200 }], label: 'Split into grid', apply: v => { const out = []; sel().forEach(it => { const b = it.bounds; const cw = (b.width - v.gut * (v.cols - 1)) / v.cols, ch = (b.height - v.gut * (v.rows - 1)) / v.rows; if (cw <= 0 || ch <= 0) return; for (let r = 0; r < v.rows; r++) for (let c = 0; c < v.cols; c++) { const rr = new P.Path.Rectangle({ rectangle: [b.x + c * (cw + v.gut), b.y + r * (ch + v.gut), cw, ch], insert: false }); rr.style = (VX.firstStyled(it) || it).style; rr.insertBelow(it); out.push(rr); } it.remove(); }); VX.setSel(out); } });
VX.f.transformEach = () => VX.withPreview({ title: 'Transform each', fields: [{ key: 'sx', label: 'Scale H (%)', type: 'range', value: 100, min: 1, max: 300 }, { key: 'sy', label: 'Scale V (%)', type: 'range', value: 100, min: 1, max: 300 }, { key: 'mx', label: 'Move H (px)', type: 'range', value: 0, min: -500, max: 500 }, { key: 'my', label: 'Move V (px)', type: 'range', value: 0, min: -500, max: 500 }, { key: 'rot', label: 'Rotate (°)', type: 'range', value: 0, min: -180, max: 180 }, { key: 'random', label: 'Random', type: 'checkbox', value: false }, { key: 'seed', label: 'Random seed', type: 'range', value: 5, min: 1, max: 999 }], label: 'Transform each', apply: v => { const rnd = G.rng(v.seed); sel().forEach(it => { const k = v.random ? rnd() : 1; const c = it.bounds.center; it.scale(1 + (v.sx / 100 - 1) * k, 1 + (v.sy / 100 - 1) * k, c); it.rotate(v.rot * k, c); it.translate([v.mx * k, v.my * k]); }); } });

// ---------------------------------------------------------------- effects menu entry, shadows & glow
VX.f.fx = (type, preset) => fxDialog(type, preset);
VX.f.shadowDialog = () => { const s0 = sel()[0]; const c0 = s0?.shadowColor; return VX.withPreview({ title: 'Drop shadow', fields: [{ key: 'x', label: 'X offset (px)', type: 'range', value: s0?.shadowOffset?.x || 6, min: -200, max: 200 }, { key: 'y', label: 'Y offset (px)', type: 'range', value: s0?.shadowOffset?.y || 8, min: -200, max: 200 }, { key: 'blur', label: 'Blur (px)', type: 'range', value: s0?.shadowBlur || 12, min: 0, max: 200 }, { key: 'color', label: 'Colour', type: 'color', value: c0 ? new P.Color(c0.red, c0.green, c0.blue).toCSS(true) : '#000000' }, { key: 'op', label: 'Opacity (%)', type: 'range', value: c0 ? Math.round(c0.alpha * 100) : 40, min: 0, max: 100 }], label: 'Drop shadow', apply: v => sel().forEach(s => { const c = new P.Color(v.color); c.alpha = v.op / 100; s.shadowColor = c; s.shadowBlur = v.blur; s.shadowOffset = new P.Point(v.x, v.y); }) }); };
VX.f.glowDialog = () => VX.withPreview({ title: 'Outer glow', fields: [{ key: 'color', label: 'Glow colour', type: 'color', value: '#ffd400' }, { key: 'blur', label: 'Blur (px)', type: 'range', value: 24, min: 1, max: 200 }, { key: 'op', label: 'Opacity (%)', type: 'range', value: 90, min: 0, max: 100 }], label: 'Outer glow', apply: v => sel().forEach(s => { const c = new P.Color(v.color); c.alpha = v.op / 100; s.shadowColor = c; s.shadowBlur = v.blur; s.shadowOffset = new P.Point(0, 0); }) });
VX.f.removeShadow = () => { sel().forEach(s => s.shadowColor = null); VX.commit('Remove shadow'); VX.renderRight(); };
// raster silhouette of an item's shadow (for PDF export & Expand appearance; svg2pdf cannot draw SVG filters)
G.shadowRaster = it => {
  const sc = it.shadowColor; if (!sc) return null; const blur = it.shadowBlur || 0; const off = it.shadowOffset || new P.Point(0, 0);
  const tmp = it.clone(); tmp.shadowColor = null; tmp.opacity = 1; const solid = new P.Color(sc.red, sc.green, sc.blue);
  (tmp instanceof P.Group ? tmp.getItems({ recursive: true }) : [tmp]).concat(tmp).forEach(i => { if (i.fillColor) i.fillColor = solid; if (i.strokeColor) i.strokeColor = solid; });
  const res = 2; const ras = tmp.rasterize({ resolution: 72 * res, insert: false }); tmp.remove();
  const pad = Math.ceil(blur * 1.5 + 2); const c = document.createElement('canvas'); c.width = Math.ceil(ras.width + pad * 2 * res); c.height = Math.ceil(ras.height + pad * 2 * res); const x = c.getContext('2d'); x.filter = blur ? `blur(${blur * res / 2}px)` : 'none'; x.drawImage(ras.canvas, pad * res, pad * res);
  const out = new P.Raster({ canvas: c, insert: false }); out.scale(1 / res); out.position = ras.position.add(off); out.opacity = sc.alpha * it.opacity; return out;
};
// svg2pdf cannot draw SVG filters or gradients with transparent stops faithfully: swap those for rasters while exporting a PDF
const alphaGrad = c => c && c.gradient && c.gradient.stops.some(s => s.color.alpha < 0.999);
VX.f.pdfFixups = () => {
  const fx = [];
  VX.allLayers().forEach(L => L.getItems({ recursive: true, match: i => i.visible && !(i instanceof P.Group) && !(i instanceof P.Layer) && !(i.parent instanceof P.CompoundPath) && (alphaGrad(i.fillColor) || alphaGrad(i.strokeColor)) }).forEach(it => {
    if (it.parent?.clipped && it.parent.children[0] === it) return;
    try { const r = it.rasterize({ resolution: 144, insert: false }); r.opacity = it.opacity; r.insertAbove(it); it.visible = false; fx.push({ undo: () => { r.remove(); it.visible = true; } }); } catch (e) { console.warn(e); }
  }));
  VX.f.pdfShadowRasters().forEach(r => fx.push({ undo: () => r.remove() }));
  return fx;
};
VX.f.pdfShadowRasters = () => { const out = []; VX.allLayers().map(L => L.getItems({ recursive: true, match: i => !!i.shadowColor && i.visible })).forEach(arr => arr.forEach(it => { const r = G.shadowRaster(it); if (r) { r.insertBelow(it); out.push(r); } })); return out; };
VX.f.expandAppearance = () => {
  const items = sel(); if (!items.length) return toast('Select objects to expand'); const out = [];
  items.forEach(it => {
    let cur = [it];
    if (it.data?.live) { const L = VX.live[it.data.live.kind]; cur = L?.expand ? [].concat(L.expand(it)) : (delete it.data.live, [it]); }
    cur.forEach(c => { if (c.shadowColor) { const r = G.shadowRaster(c); c.shadowColor = null; if (r) { const g = new P.Group({ insert: false }); g.insertAbove(c); g.addChildren([r, c]); out.push(g); return; } } out.push(c); });
  });
  VX.setSel(out); VX.commit('Expand appearance');
};

// ---------------------------------------------------------------- shapes: spiral, flare, polygon, star, rounded rect
G.spiral = (c, radius, decay = 0.8, segs = 10, cw = true) => { const pts = []; const per = 12; const total = segs * per; for (let k = 0; k <= total; k++) { const th = k / per * Math.PI / 2; const r = radius * Math.pow(decay, k / per); pts.push(c.add(new P.Point(Math.cos(th) * r, (cw ? 1 : -1) * Math.sin(th) * r))); } const p = new P.Path({ segments: pts, insert: false }); p.simplify(0.4); return p; };
G.flare = (c, radius, { rays = 14, rings = 6, angle = 30, color = '#fff6c8', seed = 3 } = {}) => {
  const rnd = G.rng(seed); const g = new P.Group({ insert: false }); g.name = 'Flare';
  const halo = new P.Path.Circle({ center: c, radius: radius * 1.6, insert: false }); halo.fillColor = { gradient: { stops: [[new P.Color(color).set ? color : color, 0], [new P.Color(1, 1, 1, 0), 1]], radial: true }, origin: c, destination: c.add([radius * 1.6, 0]) }; halo.opacity = 0.55; g.addChild(halo);
  const core = new P.Path.Circle({ center: c, radius: radius * 0.35, insert: false }); core.fillColor = { gradient: { stops: [['#ffffff', 0], [color, 0.5], [new P.Color(1, 1, 1, 0), 1]], radial: true }, origin: c, destination: c.add([radius * 0.35, 0]) }; g.addChild(core);
  for (let k = 0; k < rays; k++) { const a = 360 * k / rays + rnd() * 8; const L = radius * (0.9 + rnd() * 1.4); const w = radius * 0.025; const tip = c.add(new P.Point({ angle: a, length: L })); const n = new P.Point({ angle: a + 90, length: w }); const ray = new P.Path({ segments: [c.add(n), tip, c.subtract(n)], closed: true, insert: false }); ray.fillColor = { gradient: { stops: [['#ffffff', 0], [new P.Color(1, 1, 1, 0), 1]] }, origin: c, destination: tip }; ray.opacity = 0.8; g.addChild(ray); }
  const dir = new P.Point({ angle, length: 1 }); for (let k = 1; k <= rings; k++) { const d = radius * (1.5 + k * 0.9 + rnd() * 0.5); const rr = radius * (0.12 + rnd() * 0.35); const ring = new P.Path.Circle({ center: c.add(dir.multiply(d)), radius: rr, insert: false }); ring.fillColor = new P.Color(1, 1, 0.85, 0.12 + rnd() * 0.15); ring.strokeColor = new P.Color(1, 1, 1, 0.25); ring.strokeWidth = 1; g.addChild(ring); }
  return g;
};
VX.f.shape = kind => {
  const c = VX.abRect().center; const place = it => { VX.styleNew(it, { noFill: kind === 'spiral' }); if (kind === 'spiral' && !VX.O.stroke) { it.strokeColor = '#000'; it.strokeWidth = 2; } return it; };
  const defs = {
    spiral: { title: 'Spiral', fields: [{ key: 'r', label: 'Radius (px)', type: 'range', value: 150, min: 5, max: 2000 }, { key: 'decay', label: 'Decay (%)', type: 'range', value: 80, min: 5, max: 99 }, { key: 'segs', label: 'Segments (quarter turns)', type: 'range', value: 12, min: 2, max: 200 }, { key: 'cw', label: 'Clockwise', type: 'checkbox', value: true }], make: v => { const p = G.spiral(c, v.r, v.decay / 100, v.segs, v.cw); p.insertAbove(VX.project.activeLayer.lastChild || null); VX.project.activeLayer.addChild(p); return place(p); } },
    flare: { title: 'Flare', fields: [{ key: 'r', label: 'Centre radius (px)', type: 'range', value: 60, min: 5, max: 1000 }, { key: 'rays', label: 'Rays', type: 'range', value: 14, min: 0, max: 60 }, { key: 'rings', label: 'Rings', type: 'range', value: 6, min: 0, max: 30 }, { key: 'angle', label: 'Ring direction (°)', type: 'range', value: 30, min: -180, max: 180 }, { key: 'color', label: 'Colour', type: 'color', value: '#ffe08a' }, { key: 'seed', label: 'Variation', type: 'range', value: 3, min: 1, max: 999 }], make: v => { const g = G.flare(c, v.r, v); VX.project.activeLayer.addChild(g); return g; } },
    polygon: { title: 'Polygon', fields: [{ key: 'r', label: 'Radius', type: 'range', value: 120, min: 2, max: 2000 }, { key: 'n', label: 'Sides', type: 'range', value: 6, min: 3, max: 60 }], make: v => place(new P.Path.RegularPolygon({ center: c, sides: v.n, radius: v.r })) },
    star: { title: 'Star', fields: [{ key: 'r1', label: 'Radius 1', type: 'range', value: 140, min: 2, max: 2000 }, { key: 'r2', label: 'Radius 2', type: 'range', value: 60, min: 1, max: 2000 }, { key: 'n', label: 'Points', type: 'range', value: 5, min: 3, max: 80 }], make: v => place(new P.Path.Star({ center: c, points: v.n, radius1: v.r1, radius2: v.r2 })) },
    rrect: { title: 'Rounded rectangle', fields: [{ key: 'w', label: 'Width', type: 'range', value: 300, min: 2, max: 4000 }, { key: 'h', label: 'Height', type: 'range', value: 180, min: 2, max: 4000 }, { key: 'r', label: 'Corner radius', type: 'range', value: 24, min: 0, max: 1000 }], make: v => place(new P.Path.Rectangle({ rectangle: new P.Rectangle(c.subtract([v.w / 2, v.h / 2]), new P.Size(v.w, v.h)), radius: Math.min(v.r, v.w / 2, v.h / 2) })) },
  };
  const d = defs[kind]; if (!d) return;
  return VX.withPreview({ title: d.title, fields: d.fields, needSel: false, label: d.title, apply: v => VX.setSel([d.make(v)]) });
};
})();
