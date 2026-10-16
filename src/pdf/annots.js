// Extra annotation types for BTS PDF Pro: callout, measure, mark (tick/cross/dot), image watermark,
// background, link, "sign here" tag, digital-signature-look box and stamps (with optional sub line).
// Each type provides: svg (on-screen), bbox, move, pdf (flatten on save).
import { X } from './ctx.js';

const NS = 'http://www.w3.org/2000/svg';
function S(tag, attrs = {}, ...kids) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v); kids.forEach(k => k && e.append(k)); return e; }
const flip = (x, y) => `matrix(1 0 0 -1 ${x} ${y})`;
const txt = (str, attrs) => { const t = S('text', attrs); t.textContent = str; return t; };

export const TYPES = ['callout', 'measure', 'mark', 'wmimg', 'bg', 'link', 'signhere', 'dsig', 'stamp'];

// ---------- measurement helpers
export function measureValue(a) {
  const sc = a.scale || { ratio: 1, unit: 'in' }; const k = (sc.ratio || 1) / 72; // page pt -> real units
  const P = a.pts; let v = 0;
  if (a.mode === 'area') {
    let s = 0; for (let i = 0; i < P.length; i++) { const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length]; s += x1 * y2 - x2 * y1; }
    v = Math.abs(s) / 2 * k * k; return fmtNum(v) + ' ' + sc.unit + '²';
  }
  for (let i = 1; i < P.length; i++) v += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  if (a.mode === 'perimeter' && a.closed && P.length > 2) v += Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]);
  return fmtNum(v * k) + ' ' + sc.unit;
}
const fmtNum = v => v >= 100 ? v.toFixed(1) : v >= 10 ? v.toFixed(2) : v.toFixed(3);
function labelPos(a) {
  const P = a.pts;
  if (a.mode === 'area' || (a.mode === 'perimeter' && a.closed)) { const cx = P.reduce((s, p) => s + p[0], 0) / P.length, cy = P.reduce((s, p) => s + p[1], 0) / P.length; return [cx, cy]; }
  const i = Math.max(1, Math.floor(P.length / 2)); return [(P[i - 1][0] + P[i][0]) / 2, (P[i - 1][1] + P[i][1]) / 2 + 4];
}
// nearest point on rectangle border to (px,py)
function edgePoint(a) {
  const cx = Math.max(a.x, Math.min(a.ax, a.x + a.w)), cy = Math.max(a.y, Math.min(a.ay, a.y + a.h));
  if (cx > a.x && cx < a.x + a.w && cy > a.y && cy < a.y + a.h) return [a.x, a.y + a.h / 2];
  return [cx, cy];
}
const tickPath = a => `M${a.x + a.w * 0.1} ${a.y + a.h * 0.5} L${a.x + a.w * 0.4} ${a.y + a.h * 0.15} L${a.x + a.w * 0.92} ${a.y + a.h * 0.88}`;
const crossPaths = a => [[a.x + a.w * 0.15, a.y + a.h * 0.15, a.x + a.w * 0.85, a.y + a.h * 0.85], [a.x + a.w * 0.15, a.y + a.h * 0.85, a.x + a.w * 0.85, a.y + a.h * 0.15]];
const signherePts = a => [[a.x, a.y], [a.x + a.w - a.h / 2, a.y], [a.x + a.w, a.y + a.h / 2], [a.x + a.w - a.h / 2, a.y + a.h], [a.x, a.y + a.h]];
export function dsigLines(a) { return [`Digitally signed by ${a.name || ''}`, `Date: ${a.date || ''}`, a.reason ? `Reason: ${a.reason}` : '', a.location ? `Location: ${a.location}` : ''].filter(Boolean); }

// ---------- on-screen SVG
export function svg(a) {
  const op = a.opacity ?? 1;
  switch (a.type) {
    case 'callout': {
      const g = S('g', {}); const [ex, ey] = edgePoint(a);
      g.append(S('line', { x1: a.ax, y1: a.ay, x2: ex, y2: ey, stroke: a.stroke || '#ff5a5f', 'stroke-width': a.sw || 1.2 }));
      g.append(S('circle', { cx: a.ax, cy: a.ay, r: 2.2, fill: a.stroke || '#ff5a5f' }));
      g.append(S('rect', { x: a.x, y: a.y, width: a.w, height: a.h, fill: a.fill || '#ffffff', stroke: a.stroke || '#ff5a5f', 'stroke-width': a.sw || 1.2 }));
      if (!a._editing) {
        const t = S('text', { transform: flip(a.x + 3, a.y + a.h - 2), fill: a.color, 'font-size': a.size, 'font-family': X.cssFont(a.font), 'font-weight': a.bold ? 700 : 400 });
        (a.text || '').split('\n').forEach((ln, i) => { const ts = S('tspan', { x: 0, y: a.size * (0.85 + i * 1.2) }); ts.textContent = ln || ' '; t.append(ts); });
        g.append(t);
      }
      return g;
    }
    case 'measure': {
      const g = S('g', { stroke: a.color, 'stroke-width': a.sw || 1.2, fill: 'none' });
      const d = a.pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join('') + (a.mode === 'area' || a.closed ? 'Z' : '');
      g.append(S('path', { d, fill: a.mode === 'area' ? a.color : 'none', 'fill-opacity': 0.15 }));
      g.append(S('path', { d, stroke: 'transparent', 'stroke-width': 8 }));
      a.pts.forEach(p => g.append(S('circle', { cx: p[0], cy: p[1], r: 1.6, fill: a.color })));
      const [lx, ly] = labelPos(a); const label = measureValue(a); const fs = 9;
      const w = label.length * fs * 0.55 + 6;
      g.append(S('rect', { x: lx - w / 2, y: ly - 2, width: w, height: fs + 4, fill: '#ffffff', stroke: a.color, 'stroke-width': 0.6, rx: 2 }));
      g.append(txt(label, { transform: flip(lx, ly + fs * 0.25), fill: '#111', stroke: 'none', 'font-size': fs, 'font-family': 'Helvetica, Arial', 'text-anchor': 'middle' }));
      return g;
    }
    case 'mark': {
      const g = S('g', { stroke: a.color, 'stroke-width': a.sw || Math.max(1.4, a.w * 0.12), fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      g.append(S('rect', { x: a.x, y: a.y, width: a.w, height: a.h, fill: 'transparent', stroke: 'none' }));
      if (a.kind === 'tick') g.append(S('path', { d: tickPath(a) }));
      else if (a.kind === 'cross') crossPaths(a).forEach(([x1, y1, x2, y2]) => g.append(S('line', { x1, y1, x2, y2 })));
      else g.append(S('circle', { cx: a.x + a.w / 2, cy: a.y + a.h / 2, r: a.w * 0.28, fill: a.color, stroke: 'none' }));
      return g;
    }
    case 'wmimg': {
      const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
      return S('image', { href: a.src, x: 0, y: 0, width: a.w, height: a.h, opacity: op, preserveAspectRatio: 'none', transform: `translate(${cx} ${cy}) rotate(${a.angle || 0}) translate(${-a.w / 2} ${a.h / 2}) scale(1 -1)` });
    }
    case 'bg': {
      const g = S('g', { 'pointer-events': 'none' });
      if (a.color) g.append(S('rect', { x: a.x, y: a.y, width: a.w, height: a.h, fill: a.color, 'fill-opacity': op }));
      if (a.src) g.append(S('image', { href: a.src, x: 0, y: 0, width: a.w, height: a.h, opacity: op, preserveAspectRatio: a.fit === 'stretch' ? 'none' : a.fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice', transform: flip(a.x, a.y + a.h) }));
      return g;
    }
    case 'cropsel': return S('rect', { x: a.x, y: a.y, width: a.w, height: a.h, fill: 'rgba(255,90,95,.08)', stroke: '#ff5a5f', 'stroke-width': 1.5, 'stroke-dasharray': '6 4', 'vector-effect': 'non-scaling-stroke' });
    case 'link': return S('rect', { x: a.x, y: a.y, width: a.w, height: a.h, fill: 'rgba(49,120,255,.08)', stroke: '#2f6bff', 'stroke-width': 1, 'stroke-dasharray': '3 2', 'vector-effect': 'non-scaling-stroke' });
    case 'signhere': {
      const g = S('g', {});
      g.append(S('polygon', { points: signherePts(a).map(p => p.join(',')).join(' '), fill: '#ffd400', stroke: '#b58900', 'stroke-width': 1 }));
      g.append(txt(a.label || 'Sign here', { transform: flip(a.x + 6, a.y + a.h / 2), fill: '#111', 'font-size': a.h * 0.42, 'font-family': 'Helvetica, Arial', 'font-weight': 700, 'dominant-baseline': 'central' }));
      return g;
    }
    case 'dsig': {
      const g = S('g', {}); const c = a.color || '#1d3fbb';
      g.append(S('rect', { x: a.x, y: a.y, width: a.w, height: a.h, fill: 'rgba(29,63,187,.04)', stroke: c, 'stroke-width': 1, rx: 3 }));
      const s = Math.min(a.h * 0.6, 28);
      g.append(S('path', { d: `M${a.x + 6} ${a.y + a.h / 2} l${s * 0.3} ${-s * 0.3} l${s * 0.5} ${s * 0.6}`, stroke: '#3ccf8e', 'stroke-width': 2.4, fill: 'none', 'stroke-linecap': 'round' }));
      const lines = dsigLines(a); const fs = Math.min(9, (a.h - 6) / lines.length / 1.25);
      lines.forEach((ln, i) => g.append(txt(ln, { transform: flip(a.x + s + 14, a.y + a.h - 4 - fs * (i + 0.85) * 1.25), fill: i ? '#333' : c, 'font-size': fs, 'font-family': 'Helvetica, Arial', 'font-weight': i ? 400 : 700 })));
      return g;
    }
    case 'stamp': {
      const g = S('g', { opacity: 0.9 });
      g.append(S('rect', { x: a.x, y: a.y, width: a.w, height: a.h, rx: 6, fill: 'transparent', stroke: a.color, 'stroke-width': 2.5 }));
      if (a.sub) {
        g.append(txt(a.label, { transform: flip(a.x + a.w / 2, a.y + a.h * 0.64), fill: a.color, 'font-size': a.h * 0.36, 'font-family': 'Helvetica, Arial', 'font-weight': 700, 'text-anchor': 'middle', 'dominant-baseline': 'central' }));
        g.append(txt(a.sub, { transform: flip(a.x + a.w / 2, a.y + a.h * 0.25), fill: a.color, 'font-size': a.h * 0.2, 'font-family': 'Helvetica, Arial', 'text-anchor': 'middle', 'dominant-baseline': 'central' }));
      } else g.append(txt(a.label, { transform: flip(a.x + a.w / 2, a.y + a.h / 2), fill: a.color, 'font-size': a.h * 0.45, 'font-family': 'Helvetica, Arial', 'font-weight': 700, 'text-anchor': 'middle', 'dominant-baseline': 'central' }));
      return g;
    }
  }
  return undefined;
}

export function bbox(a) {
  switch (a.type) {
    case 'callout': return { x: Math.min(a.x, a.ax), y: Math.min(a.y, a.ay), w: Math.max(a.x + a.w, a.ax) - Math.min(a.x, a.ax), h: Math.max(a.y + a.h, a.ay) - Math.min(a.y, a.ay) };
    case 'measure': { const xs = a.pts.map(p => p[0]), ys = a.pts.map(p => p[1]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; }
    case 'mark': case 'wmimg': case 'bg': case 'link': case 'signhere': case 'dsig': case 'stamp': return { x: a.x, y: a.y, w: a.w, h: a.h };
  }
  return null;
}
export function move(a, dx, dy) {
  if (a.type === 'callout') { a.x += dx; a.y += dy; a.ax += dx; a.ay += dy; return true; }
  if (a.type === 'measure') { a.pts.forEach(p => { p[0] += dx; p[1] += dy; }); return true; }
  if (a.type === 'bg') return true; // backgrounds are fixed
  return false;
}

// ---------- flatten into the PDF (pdf-lib)
export async function pdf(doc, p, a) {
  const { rgb, degrees } = window.PDFLib; const C = X.hex2rgb; const op = a.opacity ?? 1;
  switch (a.type) {
    case 'callout': {
      const [ex, ey] = edgePoint(a); const stroke = C(a.stroke || '#ff5a5f');
      p.drawLine({ start: { x: a.ax, y: a.ay }, end: { x: ex, y: ey }, thickness: a.sw || 1.2, color: stroke });
      p.drawCircle({ x: a.ax, y: a.ay, size: 2.2, color: stroke });
      p.drawRectangle({ x: a.x, y: a.y, width: a.w, height: a.h, color: C(a.fill || '#ffffff'), borderColor: stroke, borderWidth: a.sw || 1.2 });
      const font = await X.getFont(doc, a.font, a.bold);
      if (!X.canEncode(font, a.text || '')) { const img = await doc.embedPng(await X.textToPng({ ...a, bg: a.fill || '#ffffff' })); p.drawImage(img, { x: a.x + 0.6, y: a.y + 0.6, width: a.w - 1.2, height: a.h - 1.2 }); return true; }
      (a.text || '').split('\n').forEach((ln, i) => { if (ln) p.drawText(ln, { x: a.x + 3, y: a.y + a.h - 2 - a.size * (0.85 + i * 1.2), size: a.size, font, color: C(a.color) }); });
      return true;
    }
    case 'measure': {
      const col = C(a.color); const P = a.pts; const closed = a.mode === 'area' || a.closed;
      if (a.mode === 'area') p.drawSvgPath(P.map((q, i) => (i ? 'L' : 'M') + q[0] + ' ' + (-q[1])).join(' ') + ' Z', { x: 0, y: 0, color: col, opacity: 0.15, borderWidth: 0 });
      for (let i = 1; i < P.length; i++) p.drawLine({ start: { x: P[i - 1][0], y: P[i - 1][1] }, end: { x: P[i][0], y: P[i][1] }, thickness: a.sw || 1.2, color: col });
      if (closed && P.length > 2) p.drawLine({ start: { x: P[P.length - 1][0], y: P[P.length - 1][1] }, end: { x: P[0][0], y: P[0][1] }, thickness: a.sw || 1.2, color: col });
      const font = await X.getFont(doc, 'Helvetica', false); const label = measureValue(a).replace('²', '2'); const fs = 9;
      const [lx, ly] = labelPos(a); const w = font.widthOfTextAtSize(label, fs) + 6;
      p.drawRectangle({ x: lx - w / 2, y: ly - 2, width: w, height: fs + 4, color: rgb(1, 1, 1), borderColor: col, borderWidth: 0.6 });
      p.drawText(label, { x: lx - w / 2 + 3, y: ly + 0.6, size: fs, font, color: rgb(0.07, 0.07, 0.07) });
      return true;
    }
    case 'mark': {
      const col = C(a.color), th = a.sw || Math.max(1.4, a.w * 0.12);
      if (a.kind === 'tick') p.drawSvgPath(tickPath(a).replace(/([ML])([\d.-]+) ([\d.-]+)/g, (m, c, x, y) => `${c}${x} ${-y}`), { x: 0, y: 0, borderColor: col, borderWidth: th, borderLineCap: 1 });
      else if (a.kind === 'cross') crossPaths(a).forEach(([x1, y1, x2, y2]) => p.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: th, color: col, lineCap: 1 }));
      else p.drawCircle({ x: a.x + a.w / 2, y: a.y + a.h / 2, size: a.w * 0.28, color: col });
      return true;
    }
    case 'wmimg': {
      const b = await X.dataUrlBytes(a.src); const img = a.src.startsWith('data:image/jp') ? await doc.embedJpg(b) : await doc.embedPng(b);
      const t = (a.angle || 0) * Math.PI / 180, cx = a.x + a.w / 2, cy = a.y + a.h / 2;
      const x = cx + (-a.w / 2) * Math.cos(t) - (-a.h / 2) * Math.sin(t), y = cy + (-a.w / 2) * Math.sin(t) + (-a.h / 2) * Math.cos(t);
      p.drawImage(img, { x, y, width: a.w, height: a.h, rotate: degrees(a.angle || 0), opacity: op });
      return true;
    }
    case 'bg': case 'link': return true; // handled in docops.postBuild
    case 'signhere': {
      const pts = signherePts(a);
      p.drawSvgPath(pts.map((q, i) => (i ? 'L' : 'M') + q[0] + ' ' + (-q[1])).join(' ') + ' Z', { x: 0, y: 0, color: rgb(1, 0.83, 0), borderColor: rgb(0.71, 0.54, 0), borderWidth: 1 });
      const font = await X.getFont(doc, 'Helvetica', true); const fs = a.h * 0.42; const label = a.label || 'Sign here';
      if (X.canEncode(font, label)) p.drawText(label, { x: a.x + 6, y: a.y + a.h / 2 - fs * 0.35, size: fs, font, color: rgb(0.07, 0.07, 0.07) });
      return true;
    }
    case 'dsig': {
      const c = C(a.color || '#1d3fbb'); const s = Math.min(a.h * 0.6, 28);
      p.drawRectangle({ x: a.x, y: a.y, width: a.w, height: a.h, borderColor: c, borderWidth: 1, color: rgb(0.97, 0.975, 1) });
      p.drawSvgPath(`M${a.x + 6} ${-(a.y + a.h / 2)} l${s * 0.3} ${s * 0.3} l${s * 0.5} ${-s * 0.6}`, { x: 0, y: 0, borderColor: rgb(0.24, 0.81, 0.56), borderWidth: 2.4, borderLineCap: 1 });
      const fb = await X.getFont(doc, 'Helvetica', true), fr = await X.getFont(doc, 'Helvetica', false);
      const lines = dsigLines(a); const fs = Math.min(9, (a.h - 6) / lines.length / 1.25);
      for (let i = 0; i < lines.length; i++) {
        const f = i ? fr : fb; const ln = lines[i];
        if (X.canEncode(f, ln)) p.drawText(ln, { x: a.x + s + 14, y: a.y + a.h - 4 - fs * (i + 0.85) * 1.25 - fs * 0.3, size: fs, font: f, color: i ? rgb(0.2, 0.2, 0.2) : c });
      }
      return true;
    }
    case 'stamp': {
      const font = await X.getFont(doc, 'Helvetica', true); const col = C(a.color);
      p.drawRectangle({ x: a.x, y: a.y, width: a.w, height: a.h, borderColor: col, borderWidth: 2.5, opacity: 0.9, borderOpacity: 0.9 });
      if (a.sub) {
        const s1 = a.h * 0.36, s2 = a.h * 0.2, fr = await X.getFont(doc, 'Helvetica', false);
        if (X.canEncode(font, a.label)) p.drawText(a.label, { x: a.x + (a.w - font.widthOfTextAtSize(a.label, s1)) / 2, y: a.y + a.h * 0.64 - s1 * 0.35, size: s1, font, color: col, opacity: 0.9 });
        if (X.canEncode(fr, a.sub)) p.drawText(a.sub, { x: a.x + (a.w - fr.widthOfTextAtSize(a.sub, s2)) / 2, y: a.y + a.h * 0.25 - s2 * 0.35, size: s2, font: fr, color: col, opacity: 0.9 });
      } else {
        const sz = a.h * 0.45;
        if (X.canEncode(font, a.label)) p.drawText(a.label, { x: a.x + (a.w - font.widthOfTextAtSize(a.label, sz)) / 2, y: a.y + a.h / 2 - sz * 0.35, size: sz, font, color: col, opacity: 0.9 });
      }
      return true;
    }
  }
  return false;
}
