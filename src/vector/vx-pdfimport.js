// BTS Vector — open / place PDF, Illustrator (.ai) and EPS files as editable vectors.
//  * PDF and PDF-compatible .ai (CS and later): pdf.js getOperatorList() → paper.js items (paths, colours, strokes,
//    transforms, clipping groups, text as editable PointText or glyph outlines, images as rasters, shadings as gradients).
//  * Legacy PostScript .ai (Illustrator 3–8) and .eps: a small PostScript-subset interpreter (AI path/colour/layer/text
//    operators plus common PS drawing operators). If that fails, the embedded TIFF / EPSI preview is placed instead.
(() => {
const { P, DOC } = VX; const { h, toast, modal, form } = UI;
const PX = 96 / 72; // 1 pt = 1.333 px (the same scale the vector PDF export uses)
let libP = null;
const pdfjs = () => libP || (libP = import('../vendor/pdf.min.mjs').then(m => { m.GlobalWorkerOptions.workerSrc = '../vendor/pdf.worker.min.mjs'; return m; }));
const latin1 = (u8, a = 0, b = u8.length) => { let s = ''; const CH = 0x8000; for (let i = a; i < Math.min(b, u8.length); i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(b, u8.length, i + CH))); return s; };

// ================================================================ file sniffing
function sniff(u8) {
  if (u8[0] === 0xC5 && u8[1] === 0xD0 && u8[2] === 0xD3 && u8[3] === 0xC6) return { kind: 'epsbin' };
  const head = latin1(u8, 0, 2048);
  if (head.startsWith('%PDF')) return { kind: 'pdf', offset: 0 };
  const i = head.indexOf('%PDF-'); if (i >= 0) return { kind: 'pdf', offset: i };
  const isPS = /^\s*%!PS/.test(head);
  if (!isPS) { // a PDF object somewhere inside (some writers prepend junk or a private header)
    const all = latin1(u8, 0, Math.min(u8.length, 8 << 20)); const j = all.indexOf('%PDF-'); if (j >= 0) return { kind: 'pdf', offset: j };
    if (/\d+\s+\d+\s+obj\b/.test(all) && /\btrailer\b|\/XRef\b/.test(all)) return { kind: 'pdf', offset: 0 };
    return { kind: 'unknown' };
  }
  return { kind: 'ps' };
}
VX.f.sniffVector = u8 => sniff(u8).kind;

// ================================================================ colour & matrix helpers
const rgbColor = (c, a = 1) => new P.Color(c[0], c[1], c[2], a);
// same DeviceCMYK → sRGB polynomial as pdf.js, so legacy AI/EPS colours match PDF colours
const cmyk2rgb = (r, n, g, o) => { const cl = v => Math.max(0, Math.min(255, v)) / 255; return [
  cl(255 + r * (-4.387332384609988 * r + 54.48615194189176 * n + 18.82290502165302 * g + 212.25662451639585 * o - 285.2331026137004) + n * (1.7149763477362134 * n - 5.6096736904047315 * g - 17.873870861415444 * o - 5.497006427196366) + g * (-2.5217340131683033 * g - 21.248923337353073 * o + 17.5119270841813) + o * (-21.86122147463605 * o - 189.48180835922747)),
  cl(255 + r * (8.841041422036149 * r + 60.118027045597366 * n + 6.871425592049007 * g + 31.159100130055922 * o - 79.2970844816548) + n * (-15.310361306967817 * n + 17.575251261109482 * g + 131.35250912493976 * o - 190.9453302588951) + g * (4.444339102852739 * g + 9.8632861493405 * o - 24.86741582555878) + o * (-20.737325471181034 * o - 187.80453709719578)),
  cl(255 + r * (0.8842522430003296 * r + 8.078677503112928 * n + 30.89978309703729 * g - 0.23883238689178934 * o - 14.183576799673286) + n * (10.49593273432072 * n + 63.02378494754052 * g + 50.606957656360734 * o - 112.23884253719248) + g * (0.03296041114873217 * g + 115.60384449646641 * o - 193.58209356861505) + o * (-22.33816807309886 * o - 180.12613974708367))]; };
const M6 = a => new P.Matrix(a[0], a[1], a[2], a[3], a[4], a[5]);
const mul = (A, B) => A.clone().append(B); // apply B first, then A
const detScale = M => Math.sqrt(Math.abs(M.a * M.d - M.b * M.c)) || 1;
const BLEND = { Multiply: 'multiply', Screen: 'screen', Overlay: 'overlay', Darken: 'darken', Lighten: 'lighten', ColorDodge: 'color-dodge', ColorBurn: 'color-burn', HardLight: 'hard-light', SoftLight: 'soft-light', Difference: 'difference', Exclusion: 'exclusion', Hue: 'hue', Saturation: 'saturation', Color: 'color', Luminosity: 'luminosity' };
const CAPS = ['butt', 'round', 'square'], JOINS = ['miter', 'round', 'bevel'];

// PDF / PostScript font name → installed family + style
const STD = { helvetica: 'Arial', arial: 'Arial', arialmt: 'Arial', times: 'Times New Roman', 'times-roman': 'Times New Roman', timesnewroman: 'Times New Roman', timesnewromanps: 'Times New Roman', courier: 'Courier New', couriernew: 'Courier New', symbol: 'Symbol', zapfdingbats: 'Wingdings', calibri: 'Calibri', cambria: 'Cambria', verdana: 'Verdana', georgia: 'Georgia', tahoma: 'Tahoma', myriadpro: 'Myriad Pro', minionpro: 'Minion Pro' };
// find the installed family for a PostScript-style name such as "DejaVuSans" or "SourceSansPro"
const famCache = new Map(); let mctx = null;
const isInstalled = fam => { mctx = mctx || document.createElement('canvas').getContext('2d'); const t = 'mmmmmmmmmmlli WQ@#12'; return ['monospace', 'serif'].some(fb => { mctx.font = `40px ${fb}`; const w0 = mctx.measureText(t).width; mctx.font = `40px "${fam}", ${fb}`; return Math.abs(mctx.measureText(t).width - w0) > 0.5; }); };
function installedFamily(base) {
  if (famCache.has(base)) return famCache.get(base);
  const norm = x => x.toLowerCase().replace(/[\s_-]+/g, ''); const want = norm(base); let found = null;
  try { const list = VX.f.fontFamilies ? VX.f.fontFamilies() : []; found = list.find(f => norm(f) === want) || null; } catch { }
  if (!found) { const toks = base.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(/\s+/).filter(Boolean).slice(0, 6); const n = toks.length; const cands = [];
    for (let m = 0; m < (1 << Math.max(0, n - 1)); m++) { let s = toks[0] || ''; for (let i = 1; i < n; i++) s += (m >> (i - 1)) & 1 ? toks[i] : ' ' + toks[i]; cands.push(s); }
    cands.sort((a, b) => b.split(' ').length - a.split(' ').length); found = cands.find(isInstalled) || null; }
  famCache.set(base, found); return found;
}
function mapFont(name, fo = {}) {
  let n = String(name || 'Helvetica').replace(/^[A-Z]{6}\+/, '').replace(/^_/, '');
  const style = (n.split(/[-,]/).slice(1).join(' ') + ' ' + (fo.bold ? 'Bold' : '') + (fo.italic ? ' Italic' : '')).toLowerCase();
  let base = n.split(/[-,]/)[0].replace(/(PSMT|PS|MT)$/, '');
  const bold = /bold|black|heavy|semibold|demi/.test(style) || /Bold$/.test(base); const italic = /italic|oblique|ital\b/.test(style) || /Italic$/.test(base);
  base = base.replace(/(Bold|Italic|Oblique)+$/, '');
  const fam = STD[base.toLowerCase()] || installedFamily(base) || base.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').trim() || 'Arial';
  return { family: fam, weight: (italic ? 'italic ' : '') + (bold ? 'bold' : 'normal'), original: n };
}

// axis-aligned rectangles get paper's own segment order (bottom-left, top-left, top-right, bottom-right) so SVG export
// writes a plain <rect> without a rotate() transform (which would also rotate userSpaceOnUse gradients)
function normRect(p) {
  if (!p.closed || p.segments.length !== 4 || p.segments.some(s => !s.handleIn.isZero() || !s.handleOut.isZero())) return p;
  const b = p.bounds, eps = Math.max(b.width, b.height) * 1e-7 + 1e-9; const on = pt => (Math.abs(pt.x - b.left) < eps || Math.abs(pt.x - b.right) < eps) && (Math.abs(pt.y - b.top) < eps || Math.abs(pt.y - b.bottom) < eps);
  if (!p.segments.every(s => on(s.point)) || b.width < eps || b.height < eps) return p;
  p.segments = [b.bottomLeft, b.topLeft, b.topRight, b.bottomRight]; return p;
}
// characters that are not allowed in XML (they would break SVG export / save)
const cleanText = t => String(t || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
// ================================================================ Painter: graphics state → paper items
class Painter {
  constructor(root, base, opts = {}) {
    this.root = root; this.base = base; this.opts = opts; this.stack = []; this.subs = []; this.cur = null; this.pendingClip = null;
    this.st = { ctm: new P.Matrix(), fill: [0, 0, 0], stroke: [0, 0, 0], fa: 1, sa: 1, fillPat: null, strokePat: null, lw: 1, cap: 'butt', join: 'miter', ml: 10, dash: null, dashPhase: 0, container: root, blend: null,
      font: null, fs: 0, fdir: 1, tm: new P.Matrix(), x: 0, y: 0, lineX: 0, lineY: 0, cs: 0, ws: 0, hs: 1, lead: 0, rise: 0, mode: 0 };
    this.stats = { paths: 0, texts: 0, outlinedTexts: 0, images: 0, clips: 0, shadings: 0, approx: 0 };
    this.pageRect = opts.pageRect || null; this.patBase = base; this.ot = new Map();
  }
  get full() { return mul(this.base, this.st.ctm); }
  save() { const s = this.st; this.stack.push(s); this.st = { ...s, ctm: s.ctm.clone(), tm: s.tm.clone() }; }
  restore() { if (this.stack.length) this.st = this.stack.pop(); }
  transform(a, b, c, d, e, f) { this.st.ctm = mul(this.st.ctm, new P.Matrix(a, b, c, d, e, f)); }
  add(item) { if (this.st.blend) item.blendMode = this.st.blend; this.st.container.addChild(item); return item; }
  // --- path construction (user space; transformed when painted)
  moveTo(x, y) { this.cur = [['M', x, y]]; this.subs.push(this.cur); this.cp = [x, y]; this.sp = [x, y]; }
  ensure() { if (!this.cur) this.moveTo(...(this.cp || [0, 0])); }
  lineTo(x, y) { this.ensure(); this.cur.push(['L', x, y]); this.cp = [x, y]; }
  curveTo(x1, y1, x2, y2, x, y) { this.ensure(); this.cur.push(['C', x1, y1, x2, y2, x, y]); this.cp = [x, y]; }
  closePath() { if (this.cur) { this.cur.push(['Z']); this.cp = this.sp; this.cur = null; } }
  rect(x, y, w, hh) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + hh); this.lineTo(x, y + hh); this.closePath(); }
  constructPath(ops, coords, O) {
    let j = 0;
    for (const op of ops) {
      if (op === O.moveTo) { this.moveTo(coords[j], coords[j + 1]); j += 2; }
      else if (op === O.lineTo) { this.lineTo(coords[j], coords[j + 1]); j += 2; }
      else if (op === O.curveTo) { this.curveTo(coords[j], coords[j + 1], coords[j + 2], coords[j + 3], coords[j + 4], coords[j + 5]); j += 6; }
      else if (op === O.curveTo2) { const [cx, cy] = this.cp || [coords[j], coords[j + 1]]; this.curveTo(cx, cy, coords[j], coords[j + 1], coords[j + 2], coords[j + 3]); j += 4; }
      else if (op === O.curveTo3) { this.curveTo(coords[j], coords[j + 1], coords[j + 2], coords[j + 3], coords[j + 2], coords[j + 3]); j += 4; }
      else if (op === O.closePath) this.closePath();
      else if (op === O.rectangle) { this.rect(coords[j], coords[j + 1], coords[j + 2], coords[j + 3]); j += 4; }
    }
  }
  takeSubs() { const s = this.subs; this.subs = []; this.cur = null; return s; }
  // build a paper Path / CompoundPath from subpaths, transformed by M (null M = already in document space)
  build(subs, M) {
    const T = M ? (x, y) => M.transform(new P.Point(x, y)) : (x, y) => new P.Point(x, y);
    const paths = [];
    for (const s of subs) {
      if (s.length < 2) continue; const p = new P.Path({ insert: false });
      for (const c of s) {
        if (c[0] === 'M') p.moveTo(T(c[1], c[2]));
        else if (c[0] === 'L') p.lineTo(T(c[1], c[2]));
        else if (c[0] === 'C') p.cubicCurveTo(T(c[1], c[2]), T(c[3], c[4]), T(c[5], c[6]));
        else if (c[0] === 'Z') p.closePath();
      }
      if (p.segments.length > 1 || p.closed) paths.push(p);
    }
    if (!paths.length) return null;
    return paths.length === 1 ? normRect(paths[0]) : new P.CompoundPath({ children: paths, insert: false });
  }
  fillColorFor(M) {
    const st = this.st;
    if (st.fillPat) { const c = this.patternColor(st.fillPat, st.fa); if (c) return c; }
    return rgbColor(st.fill, st.fa);
  }
  strokeColorFor() { const st = this.st; if (st.strokePat) { const c = this.patternColor(st.strokePat, st.sa, true); if (c) return c; } return rgbColor(st.stroke, st.sa); }
  patternColor(pat, alpha, flatOnly) {
    if (pat.kind === 'shading' && pat.ir) { const M = pat.matrix ? mul(this.patBase, M6(pat.matrix)) : this.patBase; return flatOnly ? this.shadingFlat(pat.ir, alpha) : this.shadingColor(pat.ir, M, alpha); }
    if (pat.kind === 'tiling') { this.stats.approx++; return pat.color ? rgbColor(pat.color, alpha) : new P.Color(0.5, 0.5, 0.5, alpha); }
    return null;
  }
  shadingFlat(ir, alpha) { if (ir[0] === 'RadialAxial') { const s = ir[3]; const c = new P.Color(s[Math.floor(s.length / 2)][1]); c.alpha = alpha; return c; } return this.meshColor(ir, alpha); }
  meshColor(ir, alpha) { this.stats.approx++; const cols = ir[3]; if (ir[0] === 'Mesh' && cols && cols.length >= 4) { let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i + 2 < cols.length; i += 4) { r += cols[i]; g += cols[i + 1]; b += cols[i + 2]; n++; } return new P.Color(r / n / 255, g / n / 255, b / n / 255, alpha); } return new P.Color(0.5, 0.5, 0.5, alpha); }
  shadingColor(ir, M, alpha = 1) {
    if (ir[0] !== 'RadialAxial') return this.meshColor(ir, alpha);
    const [, type, , stops, p0, p1, r0, r1] = ir;
    const mk = (off) => stops.map(([o, c]) => { const col = new P.Color(c); col.alpha = alpha; return [col, Math.min(1, Math.max(0, off(o)))]; });
    if (type === 'axial') return new P.Color({ gradient: { stops: mk(o => o), radial: false }, origin: M.transform(new P.Point(p0)), destination: M.transform(new P.Point(p1)) });
    const R1 = Math.max(r1, 1e-6), k = r0 > 0 ? r0 / R1 : 0;
    const origin = M.transform(new P.Point(p1)), dest = M.transform(new P.Point(p1[0] + R1, p1[1]));
    const o = { gradient: { stops: mk(x => k + x * (1 - k)), radial: true }, origin, destination: dest };
    if (Math.hypot(p0[0] - p1[0], p0[1] - p1[1]) > 1e-6) o.highlight = M.transform(new P.Point(p0));
    return new P.Color(o);
  }
  strokeProps(item, M) {
    const st = this.st, k = detScale(M);
    item.strokeColor = this.strokeColorFor(); item.strokeWidth = st.lw > 0 ? st.lw * k : 1; item.strokeCap = st.cap; item.strokeJoin = st.join; item.miterLimit = st.ml;
    if (st.dash && st.dash.length && st.dash.some(v => v > 0)) { item.dashArray = st.dash.map(v => v * k); item.dashOffset = st.dashPhase * k; }
  }
  // paint the given subpaths
  paint(subs, M, { fill = false, stroke = false, eo = false, close = false } = {}) {
    if (close) subs.forEach(s => { if (s.length && s[s.length - 1][0] !== 'Z') s.push(['Z']); });
    const clip = this.pendingClip; this.pendingClip = null;
    if ((fill || stroke) && subs.length) {
      const item = this.build(subs, M);
      if (item) {
        item.fillColor = fill ? this.fillColorFor(M) : null; if (fill) item.fillRule = eo ? 'evenodd' : 'nonzero';
        if (stroke) this.strokeProps(item, M || this.full); else item.strokeColor = null;
        this.add(item); this.stats.paths++;
      }
    }
    if (clip && subs.length) this.clip(subs, M, clip === 'eo');
  }
  clip(subs, M, eo) {
    const path = this.build(subs, M); if (!path) return;
    path.fillRule = eo ? 'evenodd' : 'nonzero'; path.fillColor = null; path.strokeColor = null;
    const g = new P.Group({ insert: false }); this.st.container.addChild(g); g.addChild(path); g.clipped = true; g.name = 'Clip group';
    this.st.container = g; this.stats.clips++;
  }
  clipRegion() { // current clip bounds in document space
    let r = this.pageRect ? this.pageRect.clone() : null;
    for (let c = this.st.container; c && c !== this.root; c = c.parent) if (c.clipped && c.firstChild) { const b = c.firstChild.bounds; r = r ? r.intersect(b) : b.clone(); }
    return r;
  }
  shadingFill(ir) {
    const M = this.full; let r = this.clipRegion();
    if (ir[2] && r) { const bb = ir[2]; const q = new P.Path.Rectangle({ from: [bb[0], bb[1]], to: [bb[2], bb[3]], insert: false }); q.transform(M); r = r.intersect(q.bounds); }
    if (!r || r.width <= 0 || r.height <= 0) return;
    const p = new P.Path.Rectangle({ rectangle: r, insert: false }); p.fillColor = this.shadingColor(ir, M, this.st.fa); p.strokeColor = null; p.name = 'Gradient';
    this.add(p); this.stats.shadings++;
  }
  image(canvas, name, interpolate = false) {
    const w = canvas.width, hh = canvas.height; if (!w || !hh) return;
    const r = new P.Raster({ insert: false }); r.setImage(canvas);
    r.matrix = mul(this.full, new P.Matrix(1 / w, 0, 0, -1 / hh, 0.5, 0.5)); if (name) r.name = nm(name);
    if (!interpolate && Math.hypot(r.matrix.a, r.matrix.b) > 1.5 && Math.hypot(r.matrix.c, r.matrix.d) > 1.5) { r.smoothing = 'off'; r.data.pixelated = true; } // like pdf.js: no smoothing when enlarging
    if (this.st.fa < 1) r.opacity = this.st.fa;
    this.add(r); this.stats.images++;
  }
  // ---- text (PDF semantics)
  beginText() { const s = this.st; s.tm = new P.Matrix(); s.x = s.lineX = 0; s.y = s.lineY = 0; }
  setTextMatrix(a, b, c, d, e, f) { const s = this.st; s.tm = new P.Matrix(a, b, c, d, e, f); s.x = s.lineX = 0; s.y = s.lineY = 0; }
  moveText(x, y) { const s = this.st; s.x = s.lineX += x; s.y = s.lineY += y; }
  nextLine() { this.moveText(0, this.st.lead); }
  otFont(font) {
    if (!font || !font.data || font.missingFile || font.isType3Font || !window.opentype) return null;
    if (this.ot.has(font.loadedName)) return this.ot.get(font.loadedName);
    let f = null; try { const d = font.data; f = opentype.parse(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength)); } catch (e) { f = null; }
    this.ot.set(font.loadedName, f); return f;
  }
  showText(glyphs) {
    const st = this.st, font = st.font; if (!font || !glyphs) return;
    const fs = st.fs, fdir = st.fdir, fm = font.fontMatrix || [0.001, 0, 0, 0.001, 0, 0], was = fs * fm[0], hs = st.hs * fdir;
    let x = 0; const chunks = []; let ch = null;
    for (const g of glyphs) {
      if (typeof g === 'number') { const dx = -g * fs / 1000; x += dx; if (dx > 0.8 * fs || dx < -0.5 * fs) ch = null; else if (ch && dx > 0.15 * fs && !/\s$/.test(ch.text)) { ch.text += ' '; ch.x1 = x; ch.glyphs.push({ g: null, x }); } else if (ch) ch.x1 = x; continue; }
      if (!g) continue;
      if (!ch) { ch = { x0: x, x1: x, text: '', glyphs: [] }; chunks.push(ch); }
      const spacing = (g.isSpace ? st.ws : 0) + st.cs;
      ch.glyphs.push({ g, x }); ch.text += g.unicode || '';
      x += (g.width || 0) * was + spacing * fdir; ch.x1 = x;
    }
    const T = mul(mul(this.full, st.tm), new P.Matrix(hs, 0, 0, 1, st.x, st.y + st.rise));
    st.x += x * hs;
    const mode = st.mode & 3; if (mode === 3) return; // invisible text (e.g. OCR layer)
    const fillC = mode === 1 ? null : this.fillColorFor(), strokeC = mode === 1 || mode === 2 ? this.strokeColorFor() : null;
    const ot = this.opts.text === 'outline' ? (this.hasPaths(font, chunks) ? 'paths' : this.otFont(font)) : null;
    for (const c of chunks) {
      if (!c.text.trim() && !ot) continue;
      if (ot) { const it = this.glyphOutlines(c, ot, T, fs, fdir); if (it) { it.fillColor = fillC; if (strokeC) { it.strokeColor = strokeC; it.strokeWidth = st.lw * detScale(T); } it.name = nm(cleanText(c.text).trim().slice(0, 40)) || 'Text'; it.data.pdfText = cleanText(c.text); this.add(it); this.stats.outlinedTexts++; continue; } }
      if (!cleanText(c.text).trim()) continue;
      const L = mul(T, new P.Matrix(1, 0, 0, -1, c.x0, 0));
      const t = this.pointText(c.text, mapFont(font.name, font), fs, L, fillC, strokeC);
      const Mt = t.matrix, sx = Math.hypot(Mt.a, Mt.b) || 1, adv = Math.hypot(L.a * (c.x1 - c.x0), L.b * (c.x1 - c.x0)) / sx;
      this.fitWidth(t, adv);
    }
  }
  hasPaths(font, chunks) { const co = this.opts.commonObjs; if (!co || !font?.loadedName) return false; for (const c of chunks) for (const { g } of c.glyphs) if (g && g.fontChar) { try { return co.has(font.loadedName + '_path_' + g.fontChar); } catch { return false; } } return false; }
  // exact glyph outlines from pdf.js' font renderer (FontPath objects: save, transform(fontMatrix), scale, path…, restore)
  glyphPaths(c, font, T, fs) {
    const co = this.opts.commonObjs, paths = [], missing = [];
    const one = (fc, x, g) => {
      let cmds = null; try { cmds = co.has(font.loadedName + '_path_' + fc) ? co.get(font.loadedName + '_path_' + fc) : null; } catch { cmds = null; } if (!Array.isArray(cmds) || !cmds.length) { if (g && (g.fontChar || g.unicode || '').trim()) missing.push({ g, x }); return; }
      let M = mul(T, new P.Matrix(1, 0, 0, 1, x, 0)); const stack = []; let p = null, lx = 0, ly = 0; const pt = (X, Y) => M.transform(new P.Point(X, Y));
      for (let i = 0; i < cmds.length;) {
        const op = cmds[i++];
        if (op === 1) { p = new P.Path({ insert: false }); paths.push(p); lx = cmds[i]; ly = cmds[i + 1]; p.moveTo(pt(lx, ly)); i += 2; }
        else if (op === 2) { if (p) p.lineTo(pt(cmds[i], cmds[i + 1])); lx = cmds[i]; ly = cmds[i + 1]; i += 2; }
        else if (op === 0) { if (p) p.cubicCurveTo(pt(cmds[i], cmds[i + 1]), pt(cmds[i + 2], cmds[i + 3]), pt(cmds[i + 4], cmds[i + 5])); lx = cmds[i + 4]; ly = cmds[i + 5]; i += 6; }
        else if (op === 3) { const [qx, qy, ex, ey] = cmds.slice(i, i + 4); if (p) p.cubicCurveTo(pt(lx + 2 / 3 * (qx - lx), ly + 2 / 3 * (qy - ly)), pt(ex + 2 / 3 * (qx - ex), ey + 2 / 3 * (qy - ey)), pt(ex, ey)); lx = ex; ly = ey; i += 4; }
        else if (op === 5) stack.push(M.clone()); else if (op === 4) { M = stack.pop() || M; }
        else if (op === 6) M = mul(M, new P.Matrix(fs, 0, 0, fs, 0, 0));
        else if (op === 7) { M = mul(M, new P.Matrix(cmds[i], cmds[i + 1], cmds[i + 2], cmds[i + 3], cmds[i + 4], cmds[i + 5])); i += 6; }
        else if (op === 8) { M = mul(M, new P.Matrix(1, 0, 0, 1, cmds[i], cmds[i + 1])); i += 2; }
        else break;
      }
    };
    for (const { g, x } of c.glyphs) { if (!g) continue; one(g.fontChar, x, g); if (g.accent?.fontChar) one(g.accent.fontChar, x + (g.accent.offset?.x || 0) * fs / 1000); }
    paths.forEach(p => { if (p.segments.length > 2 && !p.closed) p.closePath(); });
    if (missing.length) { const ot = this.otFont(font); const extra = ot ? this.glyphOutlines({ glyphs: missing }, ot, T, fs, 1) : null; if (extra) paths.push(...extra.removeChildren()); }
    const ok = paths.filter(p => p.segments.length > 1); if (!ok.length) return null;
    const cp = new P.CompoundPath({ children: ok, insert: false }); cp.fillRule = 'nonzero'; return cp;
  }
  glyphOutlines(c, ot, T, fs, fdir) {
    if (ot === 'paths') return this.glyphPaths(c, this.st.font, T, fs);
    const upm = ot.unitsPerEm || 1000, f = fs / upm, paths = [];
    for (const { g, x } of c.glyphs) { if (!g) continue;
      let gl = null; try { gl = ot.charToGlyph(g.fontChar || g.unicode || ''); if ((!gl || gl.index === 0) && g.unicode) gl = ot.charToGlyph(g.unicode); } catch { gl = null; }
      if (!gl || gl.index === 0) continue;
      const G = mul(T, new P.Matrix(f * fdir, 0, 0, -f, x, 0)); const cmds = gl.getPath(0, 0, upm).commands; let p = null, last = null;
      const pt = (X, Y) => G.transform(new P.Point(X, Y));
      for (const k of cmds) {
        if (k.type === 'M') { p = new P.Path({ insert: false }); paths.push(p); p.moveTo(pt(k.x, k.y)); last = [k.x, k.y]; }
        else if (!p) continue;
        else if (k.type === 'L') { p.lineTo(pt(k.x, k.y)); last = [k.x, k.y]; }
        else if (k.type === 'C') { p.cubicCurveTo(pt(k.x1, k.y1), pt(k.x2, k.y2), pt(k.x, k.y)); last = [k.x, k.y]; }
        else if (k.type === 'Q') { const [x0, y0] = last; p.cubicCurveTo(pt(x0 + 2 / 3 * (k.x1 - x0), y0 + 2 / 3 * (k.y1 - y0)), pt(k.x + 2 / 3 * (k.x1 - k.x), k.y + 2 / 3 * (k.y1 - k.y)), pt(k.x, k.y)); last = [k.x, k.y]; }
        else if (k.type === 'Z') p.closePath();
      }
    }
    const ok = paths.filter(p => p.segments.length > 1); if (!ok.length) return null;
    const cp = new P.CompoundPath({ children: ok, insert: false }); cp.fillRule = 'nonzero'; return cp;
  }
  // editable PointText from a matrix mapping y-down text space → document
  pointText(content, fnt, size, L, fillC, strokeC) {
    content = cleanText(content);
    const t = new P.PointText({ insert: false, point: [0, 0], content, fontFamily: fnt.family, fontWeight: fnt.weight, fontSize: size, justification: 'left' });
    t.fillColor = fillC; if (strokeC) { t.strokeColor = strokeC; t.strokeWidth = Math.max(0.25, this.st.lw * detScale(L)); }
    const a = L.a, b = L.b, c = L.c, d = L.d;
    if (Math.abs(b) < 1e-6 && Math.abs(c) < 1e-6 && a > 0 && d > 0 && Math.abs(a - d) < 1e-4 * a) { t.fontSize = size * a; t.leading = t.fontSize * 1.2; t.point = new P.Point(L.tx, L.ty); }
    else { const k = detScale(L); t.fontSize = size * k; t.leading = t.fontSize * 1.2; t.matrix = L.clone().scale(1 / k); }
    t.data.pdfFont = fnt.original; this.add(t); this.stats.texts++; return t;
  }
  fitWidth(t, target) { // match the original advance width with tracking (keeps the text editable)
    const n = [...t.content].length; if (!n || !(target > 0)) return;
    const w = t.internalBounds.width; if (!(w > 0)) return;
    const trk = (target - w) / n / t.fontSize * 1000; if (Math.abs(trk) > 2 && Math.abs(trk) < 400) t.data.tracking = Math.round(trk * 10) / 10;
  }
  // PostScript/AI style text: string drawn at origin of matrix L (y-up text space → user space)
  plainText(str, fontName, size, Muser, fillC, strokeC) {
    if (!str) return 0; const L = mul(mul(this.full, Muser), new P.Matrix(1, 0, 0, -1, 0, 0));
    const t = this.pointText(str, mapFont(fontName), size, L, fillC, strokeC); return t.internalBounds.width / (t.fontSize / size || 1);
  }
}
VX.PdfPainter = Painter;
// paper.js refuses names made only of digits (they clash with child indices)
const nm = s => { s = String(s ?? '').trim(); return /^\d+$/.test(s) ? '“' + s + '”' : s; }; VX.safeItemName = nm;
VX.exportHooks = VX.exportHooks || [];
VX.exportHooks.push((item, node) => { if (item.data?.pixelated && item instanceof P.Raster) node.setAttribute('style', ((node.getAttribute('style') || '') + ';image-rendering:pixelated').replace(/^;/, '')); });

// ================================================================ pdf.js operator list → Painter
const getObj = (page, id, ms = 4000) => new Promise(res => {
  const stores = String(id).startsWith('g_') ? [page.commonObjs, page.objs] : [page.objs, page.commonObjs];
  for (const s of stores) { try { if (s.has(id)) return res(s.get(id)); } catch { } }
  let done = false; const t = setTimeout(() => { done = true; res(null); }, ms);
  try { stores[0].get(id, v => { if (!done) { clearTimeout(t); res(v); } }); } catch { clearTimeout(t); res(null); }
});
function imgToCanvas(img, maskRGB) {
  if (!img) return null; const w = img.width, hh = img.height; if (!w || !hh) return null;
  const c = document.createElement('canvas'); c.width = w; c.height = hh; const x = c.getContext('2d');
  if (img.bitmap) x.drawImage(img.bitmap, 0, 0);
  else if (img.data) {
    const id = x.createImageData(w, hh), d = id.data, s = img.data;
    if (maskRGB) { const rb = (w + 7) >> 3; for (let y = 0; y < hh; y++) for (let i = 0; i < w; i++) { const bit = (s[y * rb + (i >> 3)] >> (7 - (i & 7))) & 1; const o = (y * w + i) * 4; d[o + 3] = bit ? 0 : 255; } }
    else if (img.kind === 1) { const rb = (w + 7) >> 3; for (let y = 0; y < hh; y++) for (let i = 0; i < w; i++) { const v = (s[y * rb + (i >> 3)] >> (7 - (i & 7))) & 1 ? 255 : 0; const o = (y * w + i) * 4; d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255; } }
    else if (img.kind === 2) { for (let i = 0, j = 0; i < w * hh; i++, j += 3) { d[i * 4] = s[j]; d[i * 4 + 1] = s[j + 1]; d[i * 4 + 2] = s[j + 2]; d[i * 4 + 3] = 255; } }
    else d.set(s.subarray(0, d.length));
    x.putImageData(id, 0, 0);
  } else return null;
  if (maskRGB) { x.globalCompositeOperation = 'source-in'; x.fillStyle = new P.Color(...maskRGB).toCSS(true); x.fillRect(0, 0, w, hh); }
  return c;
}

async function drawPdfPage(lib, page, painter) {
  const O = lib.OPS; const ol = await page.getOperatorList({ annotationMode: lib.AnnotationMode.DISABLE });
  const fn = ol.fnArray, args = ol.argsArray; const objs = new Map();
  // resolve fonts, images and patterns before walking (they arrive asynchronously)
  const need = new Set();
  for (let i = 0; i < fn.length; i++) {
    const f = fn[i], a = args[i];
    if (f === O.setFont || f === O.paintImageXObject || f === O.shadingFill || f === O.paintImageXObjectRepeat) need.add(a[0]);
    else if ((f === O.setFillColorN || f === O.setStrokeColorN) && a && a[0] === 'Shading') need.add(a[1]);
    else if (f === O.paintImageMaskXObject || f === O.paintInlineImageXObject) { if (a && a[0] && typeof a[0].data === 'string') need.add(a[0].data); }
    else if (f === O.paintImageMaskXObjectGroup) (a[0] || []).forEach(im => { if (typeof im.data === 'string') need.add(im.data); });
  }
  await Promise.all([...need].map(async id => objs.set(id, await getObj(page, id))));
  const R = img => (img && typeof img.data === 'string' ? objs.get(img.data) || null : img);
  const ocStack = []; const cfg = painter.opts.ocConfig; let unknown = 0;
  for (let i = 0; i < fn.length; i++) {
    const f = fn[i], a = args[i] || [], st = painter.st;
    try {
      switch (f) {
        case O.save: painter.save(); break;
        case O.restore: painter.restore(); break;
        case O.transform: painter.transform(...a); break;
        case O.setLineWidth: st.lw = a[0]; break;
        case O.setLineCap: st.cap = CAPS[a[0]] || 'butt'; break;
        case O.setLineJoin: st.join = JOINS[a[0]] || 'miter'; break;
        case O.setMiterLimit: st.ml = a[0]; break;
        case O.setDash: st.dash = a[0] ? [...a[0]] : null; st.dashPhase = a[1] || 0; break;
        case O.setGState: for (const [k, v] of a[0] || []) {
          if (k === 'LW') st.lw = v; else if (k === 'LC') st.cap = CAPS[v] || 'butt'; else if (k === 'LJ') st.join = JOINS[v] || 'miter'; else if (k === 'ML') st.ml = v;
          else if (k === 'D') { st.dash = v[0] ? [...v[0]] : null; st.dashPhase = v[1] || 0; } else if (k === 'ca') st.fa = v; else if (k === 'CA') st.sa = v;
          else if (k === 'BM') { const n = Array.isArray(v) ? v[0] : v; const nm = typeof n === 'string' ? n.replace(/^\//, '') : n?.name; st.blend = BLEND[nm] || null; }
          else if (k === 'Font') { /* [font, size] — handled through setFont */ }
        } break;
        case O.setFillRGBColor: st.fill = [a[0] / 255, a[1] / 255, a[2] / 255]; st.fillPat = null; break;
        case O.setStrokeRGBColor: st.stroke = [a[0] / 255, a[1] / 255, a[2] / 255]; st.strokePat = null; break;
        case O.setFillGray: st.fill = [a[0], a[0], a[0]]; st.fillPat = null; break;
        case O.setStrokeGray: st.stroke = [a[0], a[0], a[0]]; st.strokePat = null; break;
        case O.setFillCMYKColor: st.fill = cmyk2rgb(...a); st.fillPat = null; break;
        case O.setStrokeCMYKColor: st.stroke = cmyk2rgb(...a); st.strokePat = null; break;
        case O.setFillTransparent: st.fill = [0, 0, 0]; st.fa = 0; break;
        case O.setStrokeTransparent: st.sa = 0; break;
        case O.setFillColorN: case O.setStrokeColorN: {
          let pat = null;
          if (a[0] === 'Shading') pat = { kind: 'shading', ir: objs.get(a[1]), matrix: a[2] };
          else if (a[0] === 'TilingPattern') pat = { kind: 'tiling', color: a[1] ? [a[1][0] / 255, a[1][1] / 255, a[1][2] / 255] : null };
          if (f === O.setFillColorN) st.fillPat = pat; else st.strokePat = pat; break;
        }
        case O.constructPath: painter.constructPath(a[0], a[1], O); break;
        case O.closePath: painter.closePath(); break;
        case O.stroke: painter.paint(painter.takeSubs(), painter.full, { stroke: true }); break;
        case O.closeStroke: painter.paint(painter.takeSubs(), painter.full, { stroke: true, close: true }); break;
        case O.fill: painter.paint(painter.takeSubs(), painter.full, { fill: true }); break;
        case O.eoFill: painter.paint(painter.takeSubs(), painter.full, { fill: true, eo: true }); break;
        case O.fillStroke: painter.paint(painter.takeSubs(), painter.full, { fill: true, stroke: true }); break;
        case O.eoFillStroke: painter.paint(painter.takeSubs(), painter.full, { fill: true, stroke: true, eo: true }); break;
        case O.closeFillStroke: painter.paint(painter.takeSubs(), painter.full, { fill: true, stroke: true, close: true }); break;
        case O.closeEOFillStroke: painter.paint(painter.takeSubs(), painter.full, { fill: true, stroke: true, eo: true, close: true }); break;
        case O.endPath: painter.paint(painter.takeSubs(), painter.full, {}); break;
        case O.clip: painter.pendingClip = 'nz'; break;
        case O.eoClip: painter.pendingClip = 'eo'; break;
        case O.beginText: painter.beginText(); break;
        case O.endText: break;
        case O.setFont: { const fo = objs.get(a[0]); st.font = fo && !(fo instanceof Error) ? fo : { name: 'Helvetica', loadedName: a[0], missingFile: true }; let s = a[1]; st.fdir = s < 0 ? -1 : 1; st.fs = Math.abs(s); break; }
        case O.setTextMatrix: painter.setTextMatrix(...a); break;
        case O.moveText: painter.moveText(a[0], a[1]); break;
        case O.setLeadingMoveText: st.lead = a[1]; painter.moveText(a[0], a[1]); break;
        case O.nextLine: painter.nextLine(); break;
        case O.setLeading: st.lead = -a[0]; break;
        case O.setCharSpacing: st.cs = a[0]; break;
        case O.setWordSpacing: st.ws = a[0]; break;
        case O.setHScale: st.hs = a[0] / 100; break;
        case O.setTextRise: st.rise = a[0]; break;
        case O.setTextRenderingMode: st.mode = a[0]; break;
        case O.showText: case O.showSpacedText: painter.showText(a[0]); break;
        case O.nextLineShowText: painter.nextLine(); painter.showText(a[0]); break;
        case O.nextLineSetSpacingShowText: st.ws = a[0]; st.cs = a[1]; painter.nextLine(); painter.showText(a[2]); break;
        case O.paintImageXObject: { const im = objs.get(a[0]); const c = imgToCanvas(im); if (c) painter.image(c, 'Image', im?.interpolate); break; }
        case O.paintInlineImageXObject: { const im = R(a[0]); const c = imgToCanvas(im); if (c) painter.image(c, 'Image', im?.interpolate); break; }
        case O.paintImageMaskXObject: { const im = R(a[0]); const c = imgToCanvas(im, st.fill); if (c) painter.image(c, 'Image mask', a[0]?.interpolate); break; }
        case O.paintImageMaskXObjectGroup: for (const im of a[0] || []) { painter.save(); painter.transform(...im.transform); const c = imgToCanvas(R(im), st.fill); if (c) painter.image(c, 'Image mask'); painter.restore(); } break;
        case O.paintImageXObjectRepeat: { const im = objs.get(a[0]); const c = imgToCanvas(im); const pos = a[3] || []; if (c) for (let k = 0; k + 1 < pos.length; k += 2) { painter.save(); painter.transform(a[1], 0, 0, a[2], pos[k], pos[k + 1]); painter.image(c, 'Image'); painter.restore(); } break; }
        case O.paintSolidColorImageMask: { painter.rect(0, 0, 1, 1); painter.paint(painter.takeSubs(), painter.full, { fill: true }); break; }
        case O.shadingFill: { const ir = objs.get(a[0]); if (ir) painter.shadingFill(ir); break; }
        case O.paintFormXObjectBegin: { painter.save(); if (a[0]) painter.transform(...a[0]); const bb = a[1]; if (bb) { painter.rect(bb[0], bb[1], bb[2] - bb[0], bb[3] - bb[1]); painter.pendingClip = 'nz'; painter.paint(painter.takeSubs(), painter.full, {}); } break; }
        case O.paintFormXObjectEnd: painter.restore(); break;
        case O.beginGroup: { painter.save(); const g = new P.Group({ insert: false }); g.name = 'Group'; if (st.fa < 1) { g.opacity = st.fa; } painter.add(g); painter.st.container = g; painter.st.fa = 1; painter.st.sa = 1; break; }
        case O.endGroup: painter.restore(); break;
        case O.beginMarkedContentProps: {
          let layerItem = null;
          if (a[0] === 'OC' && a[1] && painter.opts.ocLayer) { const id = a[1].id; let name = null, vis = true; try { const g = cfg?.getGroup?.(id); name = g?.name; vis = cfg ? cfg.isVisible(a[1]) : true; } catch { } if (name) layerItem = painter.opts.ocLayer(name, vis); }
          ocStack.push(layerItem ? { prev: st.container, item: layerItem } : null);
          if (layerItem && (st.container === painter.root || st.container.data?.ocLayer)) st.container = layerItem; break;
        }
        case O.beginMarkedContent: ocStack.push(null); break;
        case O.endMarkedContent: { const e = ocStack.pop(); if (e && painter.st.container === e.item) painter.st.container = e.prev; break; }
        case O.dependency: case O.setRenderingIntent: case O.setFlatness: case O.beginInlineImage: case O.beginImageData: case O.endInlineImage: case O.markPoint: case O.markPointProps: case O.beginCompat: case O.endCompat: case O.setCharWidth: case O.setCharWidthAndBounds: break;
        default: unknown++;
      }
    } catch (e) { console.warn('PDF import op', f, e); }
  }
  return { ops: fn.length, unknown };
}

// remove empty clip groups, unwrap page-sized rectangular clips and single-child plain groups
function tidy(container, pageRect) {
  const walk = g => {
    for (const c of [...(g.children || [])]) {
      if (!(c instanceof P.Group) || c instanceof P.Layer) continue;
      walk(c);
      if (c.clipped) {
        if (c.children.length <= 1) { c.remove(); continue; }
        const m = c.firstChild; const isRect = m instanceof P.Path && m.segments.length === 4 && m.closed && m.segments.every(s => s.handleIn.isZero() && s.handleOut.isZero()) && Math.abs(m.area) >= m.bounds.area * 0.999;
        if (isRect && pageRect && m.bounds.expand(1).contains(pageRect)) { m.remove(); c.parent.insertChildren(c.index, c.removeChildren()); c.remove(); continue; }
      } else if (!c.children.length) c.remove();
      else if (c.children.length === 1 && c.opacity === 1 && c.blendMode === 'normal' && !c.data?.ocLayer) { c.parent.insertChild(c.index, c.firstChild); c.remove(); }
    }
  };
  walk(container);
}

// ================================================================ UI: options & orchestration
async function askOptions(numPages, mode, name, defaults = {}) {
  const fields = [];
  if (numPages > 1) fields.push({ key: 'pages', label: mode === 'open' ? 'Pages' : 'Page to place', type: 'select', value: mode === 'open' ? 'all' : '1', options: (mode === 'open' ? [{ value: 'all', label: 'All pages — one artboard each' }] : []).concat(Array.from({ length: Math.min(numPages, 500) }, (_, i) => ({ value: String(i + 1), label: `Page ${i + 1} only` }))) });
  fields.push({ key: 'text', label: 'Text', type: 'select', value: defaults.text || 'editable', options: [{ value: 'editable', label: 'Keep as editable text (uses installed fonts)' }, { value: 'outline', label: 'Convert to outlines when the font is embedded (exact look)' }] });
  return form({ title: mode === 'open' ? 'Open PDF as vectors' : 'Place PDF as vectors', ok: mode === 'open' ? 'Open' : 'Place', fields });
}

// Open or place a PDF / AI / EPS. opts: { mode: 'open'|'place', pages: 'all'|number, text: 'editable'|'outline', ask: bool }
async function importVector(file, opts = {}) {
  const u8 = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
  const name = file.name || 'document.pdf'; const mode = opts.mode || 'open';
  const sn = sniff(u8);
  if (sn.kind === 'pdf') return importPDF(u8.subarray(sn.offset), name, mode, opts, file.path);
  if (sn.kind === 'ps' || sn.kind === 'epsbin') return importPS(u8, name, mode, opts, file.path, sn.kind === 'epsbin');
  throw new Error(/\.ai$/i.test(name) ? 'This .ai file has no PDF-compatible content and is not a PostScript Illustrator file. Re-save it in Illustrator with “Create PDF Compatible File” turned on.' : 'Not a PDF, Illustrator or EPS file.');
}
VX.f.importVector = importVector;

async function importPDF(u8, name, mode, opts, path) {
  const lib = await pdfjs(); let doc;
  try { doc = await lib.getDocument({ data: u8.slice(), fontExtraProperties: true, disableFontFace: true, isEvalSupported: false, verbosity: 0 }).promise; }
  catch (e) { if (/password/i.test(e.name + e.message)) throw new Error('This PDF is password-protected. Open it in PDF Pro and remove the password first.'); throw e; }
  const n = doc.numPages; let o = { pages: opts.pages ?? (mode === 'open' ? 'all' : 1), text: opts.text || 'editable' };
  if (opts.ask !== false) { const v = await askOptions(n, mode, name, opts); if (!v) { doc.destroy(); return null; } o = { pages: v.pages ?? (mode === 'open' ? 'all' : 1), text: v.text }; }
  const list = o.pages === 'all' ? Array.from({ length: n }, (_, i) => i + 1) : [Math.min(n, Math.max(1, +o.pages || 1))];
  let ocConfig = null; try { ocConfig = await doc.getOptionalContentConfig(); } catch { }
  const hasOC = !!ocConfig && [...(ocConfig[Symbol.iterator] ? ocConfig : [])].length > 0;
  const total = { pages: list.length, paths: 0, texts: 0, outlinedTexts: 0, images: 0, clips: 0, shadings: 0, approx: 0, ops: 0, unknown: 0 };
  const pages = []; for (const k of list) { const pg = await doc.getPage(k); const vp = pg.getViewport({ scale: PX }); pages.push({ k, pg, vp, w: +vp.width.toFixed(3), h: +vp.height.toFixed(3) }); }
  const docName = name.replace(/\.(pdf|ai)$/i, '.btsv');
  let placed = null;
  if (mode === 'open') {
    VX.createDoc('custom', { name: docName, w: pages[0].w, h: pages[0].h });
    let x = 0; DOC.boards = pages.map((p, i) => { const b = { name: pages.length > 1 ? `Page ${p.k}` : 'Artboard 1', x, y: 0, w: p.w, h: p.h, bg: '#ffffff' }; x += p.w + 60; return b; }); DOC.ab = 0;
    VX.userLayers().forEach(L => L.remove());
  } else { placed = new P.Group({ name: nm(name.replace(/\.\w+$/, '')) }); (VX.iso || VX.P.project.activeLayer).addChild(placed); }
  const ocLayers = new Map();
  const ocLayer = (lname, vis) => {
    if (ocLayers.has(lname)) return ocLayers.get(lname);
    let L; if (mode === 'open') { L = VX.newUserLayer(nm(lname)); L.visible = vis; } else { L = new P.Group({ name: nm(lname) }); placed.addChild(L); L.visible = vis; }
    L.data.ocLayer = true; ocLayers.set(lname, L); return L;
  };
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]; const b = mode === 'open' ? DOC.boards[i] : { x: 0, y: 0 };
    let root;
    if (mode === 'open') { root = VX.newUserLayer(pages.length > 1 ? `Page ${p.k}` : 'Layer 1'); if (hasOC) { root.remove(); root = new P.Group({ insert: false }); } }
    else root = placed;
    const base = new P.Matrix(1, 0, 0, 1, b.x, b.y).append(M6(p.vp.transform));
    const painter = new Painter(root, base, { text: o.text, commonObjs: p.pg.commonObjs, pageRect: new P.Rectangle(b.x, b.y, p.w, p.h), ocConfig, ocLayer: hasOC ? ocLayer : null });
    const r = await drawPdfPage(lib, p.pg, painter);
    tidy(root, painter.pageRect);
    if (mode === 'open' && hasOC && root.children.length) { const L = VX.newUserLayer(pages.length > 1 ? `Page ${p.k}` : 'Unlayered'); L.addChildren(root.removeChildren()); L.insertAbove(VX.artLayer); }
    Object.keys(painter.stats).forEach(k => total[k] += painter.stats[k]); total.ops += r.ops; total.unknown += r.unknown;
  }
  // order: put OCG layers in the order they appeared, below the system guide layer
  VX.userLayers().forEach(L => { if (L.data.ocLayer) tidy(L, null); });
  doc.destroy();
  return finish(mode, placed, docName, path, total, name);
}

function finish(mode, placed, docName, path, total, name) {
  if (mode === 'open') {
    if (!VX.userLayers().length) VX.newUserLayer('Layer 1');
    VX.drawArtboard(); VX.resetHistory('Open'); DOC.name = docName; DOC.path = null; DOC.srcPath = path || null;
    VX.setActiveBoard?.(0); DOC.boards.length > 1 ? VX.fitAll() : VX.fitArt(); UI.setDocTitle(DOC.name, 'BTS Vector');
  } else {
    if (!placed.children.length) { placed.remove(); toast('Nothing to place on that page'); return total; }
    const ab = VX.abRect(); placed.position = ab.center;
    const k = Math.min(1, ab.width * 0.95 / placed.bounds.width, ab.height * 0.95 / placed.bounds.height); if (k < 1) placed.scale(k);
    VX.setSel([placed]); VX.commit('Place ' + name);
  }
  const bits = [`${total.paths} paths`, total.texts ? `${total.texts} text objects` : '', total.outlinedTexts ? `${total.outlinedTexts} outlined text runs` : '', total.images ? `${total.images} images` : '', total.shadings ? `${total.shadings} gradients` : ''].filter(Boolean).join(', ');
  toast((mode === 'open' ? 'Opened as vectors: ' : 'Placed as vectors: ') + bits, 'ok', 5000);
  if (total.approx) toast('Some mesh shadings or patterns were approximated with flat colours.', '', 6000);
  VX.lastImport = total; return total;
}

// ================================================================ legacy PostScript Illustrator (AI 3–8) & EPS
function tokenize(s) { // → array of tokens; procedures {…} are nested arrays with .proc = true
  const out = []; const stack = [out]; let i = 0; const n = s.length;
  const isWS = c => c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 0;
  const DELIM = '()<>[]{}/%';
  while (i < n) {
    const c = s.charCodeAt(i), ch = s[i];
    if (isWS(c)) { i++; continue; }
    const top = stack[stack.length - 1];
    if (ch === '%') { const e = s.indexOf('\n', i); const line = s.slice(i, e < 0 ? n : e).replace(/\r$/, ''); if (/^%(AI5_BeginLayer|AI5_EndLayer|%BeginData|%BeginBinary)/.test(line)) top.push({ t: 'cmt', v: line }); i = e < 0 ? n : e + 1; continue; }
    if (ch === '(') { let depth = 1, j = i + 1, str = ''; while (j < n && depth) { const d = s[j]; if (d === '\\') { const e = s[j + 1]; const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }; if (map[e] !== undefined) { str += map[e]; j += 2; } else if (/[0-7]/.test(e)) { const m = /^[0-7]{1,3}/.exec(s.slice(j + 1, j + 4))[0]; str += String.fromCharCode(parseInt(m, 8)); j += 1 + m.length; } else if (e === '\n' || e === '\r') { j += 2; } else { j++; } continue; } if (d === '(') depth++; else if (d === ')') { depth--; if (!depth) break; } str += d; j++; } top.push({ t: 'str', v: str }); i = j + 1; continue; }
    if (ch === '<' && s[i + 1] === '<') { top.push({ t: 'name', v: '<<' }); i += 2; continue; }
    if (ch === '>' && s[i + 1] === '>') { top.push({ t: 'name', v: '>>' }); i += 2; continue; }
    if (ch === '<') { const e = s.indexOf('>', i); const hex = s.slice(i + 1, e < 0 ? n : e).replace(/[^0-9a-fA-F]/g, ''); let str = ''; for (let k = 0; k < hex.length; k += 2) str += String.fromCharCode(parseInt(hex.substr(k, 2).padEnd(2, '0'), 16)); top.push({ t: 'str', v: str }); i = e < 0 ? n : e + 1; continue; }
    if (ch === '{') { const a = []; a.proc = true; top.push({ t: 'proc', v: a }); stack.push(a); i++; continue; }
    if (ch === '}') { if (stack.length > 1) stack.pop(); i++; continue; }
    if (ch === '[' || ch === ']') { top.push({ t: 'name', v: ch }); i++; continue; }
    let j = i + (ch === '/' ? 1 : 0); while (j < n && !isWS(s.charCodeAt(j)) && !DELIM.includes(s[j])) j++; if (ch === '/' && s[i + 1] === '/') j = Math.max(j, i + 2);
    const word = s.slice(i, Math.max(j, i + 1)); i = Math.max(j, i + 1);
    if (word[0] === '/') top.push({ t: 'lit', v: word.replace(/^\/+/, '') });
    else if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(word)) top.push({ t: 'num', v: parseFloat(word) });
    else if (/^\d+#[0-9a-zA-Z]+$/.test(word)) { const [b, v] = word.split('#'); top.push({ t: 'num', v: parseInt(v, +b) }); }
    else top.push({ t: 'name', v: word });
  }
  return out;
}

// strip prolog / setup / binary sections from an Illustrator file; keep the drawing body
function aiBody(s) {
  let body = s;
  const endSetup = s.lastIndexOf('%%EndSetup'); const endProlog = s.lastIndexOf('%%EndProlog');
  if (endSetup >= 0) body = s.slice(endSetup + 10); else if (endProlog >= 0) body = s.slice(endProlog + 11);
  const tr = body.search(/^%%(PageTrailer|Trailer)\b/m); if (tr >= 0) body = body.slice(0, tr);
  body = body.replace(/%%BeginData:?[^\n]*\n[\s\S]*?%%EndData/g, '').replace(/%%BeginBinary:?[^\n]*\n[\s\S]*?%%EndBinary/g, '').replace(/%AI\d*_BeginPalette[\s\S]*?%AI\d*_EndPalette/g, '').replace(/%AI\d*_BeginBrushPattern[\s\S]*?%AI\d*_EndBrushPattern/g, '').replace(/%AI\d*_BeginPattern[\s\S]*?%AI\d*_EndPattern/g, '').replace(/%AI\d*_BeginGradient[\s\S]*?%AI\d*_EndGradient/g, '').replace(/%AI\d*_BeginSymbol[\s\S]*?%AI\d*_EndSymbol/g, '').replace(/%AI9_PrivateDataBegin[\s\S]*$/, '').replace(/%%BeginResource[\s\S]*?%%EndResource/g, '');
  return body;
}
function bboxOf(s) {
  const hr = /^%%HiResBoundingBox:\s*([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/m.exec(s) || /^%%BoundingBox:\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/m.exec(s);
  if (!hr) return null; const b = hr.slice(1, 5).map(Number); return b[2] > b[0] && b[3] > b[1] ? b : null;
}

class PSInterp {
  constructor(painter, { ai = false, limit = 4e6 } = {}) {
    this.p = painter; this.ai = ai; this.os = []; this.dicts = [new Map()]; this.steps = 0; this.limit = limit; this.unknown = new Map(); this.compound = null;
    this.font = { name: 'Helvetica', size: 12 }; this.text = null; this.layers = []; this.cpDev = null;
  }
  // current point is kept in user space of the painter (PostScript keeps device space; we transform at build time)
  pt(x, y) { return this.p.full.transform(new P.Point(x, y)); }
  num() { const v = this.os.pop(); if (!v || v.t !== 'num') throw new Error('typecheck: number expected'); return v.v; }
  nums(k) { const a = new Array(k); for (let i = k - 1; i >= 0; i--) a[i] = this.num(); return a; }
  pop() { const v = this.os.pop(); if (!v) throw new Error('stackunderflow'); return v; }
  push(v) { this.os.push(v); }
  pushN(v) { this.os.push({ t: 'num', v }); }
  // path in document space: subs with already-transformed points
  dmove(x, y) { if (this.ended) { this.ended = false; if (!this.p.pendingClip) this.take(); } const q = this.pt(x, y); this.cur = [['M', q.x, q.y]]; (this.subs || (this.subs = [])).push(this.cur); this.cpU = [x, y]; this.spU = [x, y]; }
  dline(x, y) { if (!this.cur) this.dmove(...(this.cpU || [x, y])); const q = this.pt(x, y); this.cur.push(['L', q.x, q.y]); this.cpU = [x, y]; }
  dcurve(x1, y1, x2, y2, x, y) { if (!this.cur) this.dmove(...(this.cpU || [x1, y1])); const a = this.pt(x1, y1), b = this.pt(x2, y2), c = this.pt(x, y); this.cur.push(['C', a.x, a.y, b.x, b.y, c.x, c.y]); this.cpU = [x, y]; }
  dclose() { if (this.cur) { this.cur.push(['Z']); this.cur = null; this.cpU = this.spU; } }
  take() { const s = this.subs || []; this.subs = []; this.cur = null; return s; }
  paintAI(op) {
    const close = 'nfsbh'.includes(op), fill = 'fFbB'.includes(op), stroke = 'sSbB'.includes(op);
    if (close) this.dclose();
    if ((op === 'h' || op === 'H') && !this.compound) { this.ended = true; return; } // AI: path ends unpainted (unless W / a paint op follows)
    this.ended = false;
    if (this.compound) { this.compound.subs.push(...this.take()); this.compound.op = op; if (this.p.pendingClip) { this.compound.clip = this.p.pendingClip; this.p.pendingClip = null; } return; }
    this.p.paint(this.take(), null, { fill, stroke, eo: this.fillRule === 'eo' });
  }
  arc(x, y, r, a1, a2, neg) {
    const rad = d => d * Math.PI / 180; let s = rad(a1), e = rad(a2);
    if (!neg) { while (e < s) e += 2 * Math.PI; } else { while (e > s) e -= 2 * Math.PI; }
    const sx = x + r * Math.cos(s), sy = y + r * Math.sin(s); if (this.cur) this.dline(sx, sy); else this.dmove(sx, sy);
    const segs = Math.max(1, Math.ceil(Math.abs(e - s) / (Math.PI / 2))); const d = (e - s) / segs; const k = 4 / 3 * Math.tan(d / 4);
    for (let i = 0; i < segs; i++) { const t0 = s + i * d, t1 = t0 + d; const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1); this.dcurve(x + r * (c0 - k * s0), y + r * (s0 + k * c0), x + r * (c1 + k * s1), y + r * (s1 - k * c1), x + r * c1, y + r * s1); }
  }
  lookup(name) { for (let i = this.dicts.length - 1; i >= 0; i--) if (this.dicts[i].has(name)) return this.dicts[i].get(name); return undefined; }
  run(tokens) {
    for (let i = 0; i < tokens.length; i++) {
      if (++this.steps > this.limit) throw new Error('too complex');
      const tk = tokens[i];
      if (tk.t !== 'name') { if (tk.t === 'cmt') this.comment(tk.v); else this.push(tk); continue; }
      this.exec(tk.v);
    }
  }
  execObj(o) { if (o && o.t === 'proc') this.run(o.v); else if (o && o.t === 'name') this.exec(o.v); else if (o) this.push(o); }
  comment(line) { /* layer comments are informative only; Lb/Ln/LB drive layers */ }
  exec(name) {
    if (!this.ai) { const d = this.lookup(name); if (d !== undefined) { if (d && d.t === 'proc') return this.run(d.v); if (d && d.t === 'op') return d.v(); return this.push(d); } }
    const op = (this.ai ? AIOPS[name] || PSOPS[name] : PSOPS[name] || AIOPS[name]);
    if (op) { op.call(this); if (this.ai && AIOPS[name]) this.os.length = 0; return; }
    this.unknown.set(name, (this.unknown.get(name) || 0) + 1);
    if (this.ai) this.os.length = 0; // AI body: every operator consumes all pending operands
  }
  colorFromStack(kind) { // AI x/X/Xx custom colours: … (name) tint [type]
    const items = this.os.splice(0); const nums = items.filter(v => v.t === 'num').map(v => v.v);
    let type = 0, tint = 0; if (kind === 'Xx') { type = nums.pop(); tint = nums.pop(); } else tint = nums.pop();
    const f = 1 - (tint || 0);
    if (type === 1) return nums.slice(0, 3).map(v => 1 - (1 - v) * f);
    const [c = 0, m = 0, y = 0, k = 0] = nums; return cmyk2rgb(c * f, m * f, y * f, k * f);
  }
}
const n1 = function () { return this.num(); };
const AIOPS = {
  m() { const [x, y] = this.nums(2); this.dmove(x, y); },
  l() { const [x, y] = this.nums(2); this.dline(x, y); }, L() { AIOPS.l.call(this); },
  c() { const a = this.nums(6); this.dcurve(...a); }, C() { AIOPS.c.call(this); },
  v() { const [x2, y2, x, y] = this.nums(4); const [cx, cy] = this.cpU || [x2, y2]; this.dcurve(cx, cy, x2, y2, x, y); }, V() { AIOPS.v.call(this); },
  y() { const [x1, y1, x, y] = this.nums(4); this.dcurve(x1, y1, x, y, x, y); }, Y() { AIOPS.y.call(this); },
  N() { this.paintAI('N'); }, n() { this.paintAI('n'); }, F() { this.paintAI('F'); }, f() { this.paintAI('f'); }, S() { this.paintAI('S'); }, s() { this.paintAI('s'); },
  B() { this.paintAI('B'); }, A() { }, Ap() { }, Ar() { }, O() { }, R() { }, D() { }, Xw() { }, XT() { }, Xt() { }, Bb() { }, BB() { }, Bg() { }, Bh() { }, Bm() { }, Bc() { }, XW() { }, b() { this.paintAI('b'); }, H() { this.paintAI('H'); }, h() { this.paintAI('h'); },
  W() { this.p.pendingClip = this.fillRule === 'eo' ? 'eo' : 'nz'; },
  '*u'() { this.compound = { subs: [], op: 'f' }; },
  '*U'() { const c = this.compound; this.compound = null; if (!c) return; const op = c.op; const fill = 'fFbB'.includes(op), stroke = 'sSbB'.includes(op); if (c.clip) this.p.pendingClip = c.clip; this.p.paint(c.subs, null, { fill, stroke, eo: this.fillRule !== 'nz' }); },
  u() { this.p.save(); const g = new P.Group({ insert: false }); g.name = 'Group'; this.p.add(g); this.p.st.container = g; }, U() { this.p.restore(); },
  q() { this.p.save(); }, Q() { this.p.restore(); },
  g() { const v = this.num(); this.p.st.fill = [v, v, v]; }, G() { const v = this.num(); this.p.st.stroke = [v, v, v]; },
  k() { const a = this.nums(4); this.p.st.fill = cmyk2rgb(...a); }, K() { const a = this.nums(4); this.p.st.stroke = cmyk2rgb(...a); },
  x() { this.p.st.fill = this.colorFromStack('x'); }, X() { this.p.st.stroke = this.colorFromStack('x'); },
  Xx() { this.p.st.fill = this.colorFromStack('Xx'); }, XX() { this.p.st.stroke = this.colorFromStack('Xx'); },
  Xa() { const a = this.nums(3); this.p.st.fill = a; }, XA() { const a = this.nums(3); this.p.st.stroke = a; },
  w() { this.p.st.lw = this.num(); }, j() { this.p.st.join = JOINS[this.num()] || 'miter'; }, J() { this.p.st.cap = CAPS[this.num()] || 'butt'; }, M() { this.p.st.ml = this.num(); },
  d() { const ph = this.num(); const arr = this.pop(); this.p.st.dash = arr.t === 'arr' ? arr.v.map(v => v.v) : null; this.p.st.dashPhase = ph; },
  XR() { this.fillRule = this.num() ? 'eo' : 'nz'; },
  cm() { const a = this.nums(6); this.p.transform(...a); },
  Lb() { const nums = this.os.filter(v => v.t === 'num').map(v => v.v); const vis = nums.length ? nums[0] !== 0 : true; this.p.save(); const L = this.p.opts.newLayer ? this.p.opts.newLayer(vis) : (() => { const g = new P.Group({ insert: false }); this.p.add(g); g.visible = vis; return g; })(); this.p.st.container = L; this.layers.push(L); },
  Ln() { const s = this.os.find(v => v.t === 'str'); const L = this.layers[this.layers.length - 1]; if (s && L) L.name = nm(s.v) || 'Layer'; },
  LB() { this.layers.pop(); this.p.restore(); },
  // text (AI 3+): To … Tp … Tf … Tx … TO
  To() { this.text = { m: new P.Matrix(), x: 0, y: 0, lead: 0, lineX: 0 }; },
  Tp() { const a = this.nums(7); if (!this.text) AIOPS.To.call(this); this.text.m = new P.Matrix(a[0], a[1], a[2], a[3], a[4], a[5]); this.text.x = this.text.y = this.text.lineX = 0; },
  TP() { }, TO() { this.text = null; },
  Tf() { const items = this.os.splice(0); const lit = items.find(v => v.t === 'lit' || v.t === 'name'); const nums = items.filter(v => v.t === 'num'); if (lit) this.font.name = lit.v.replace(/^_/, ''); if (nums.length) this.font.size = nums[0].v; },
  Tl() { const nums = this.os.filter(v => v.t === 'num'); if (nums.length && this.text) this.text.lead = nums[0].v; },
  'T*'() { if (this.text) { this.text.y -= this.text.lead || this.font.size * 1.2; this.text.x = this.text.lineX; } },
  Td() { const [x, y] = this.nums(2); if (this.text) { this.text.lineX += x; this.text.x = this.text.lineX; this.text.y += y; } },
  Tr() { this.textMode = this.num(); },
  Tx() { this.aiShow(); }, Tj() { this.aiShow(); }, TX() { this.aiShow(); }, Tk() { }, TK() { },
};
PSInterp.prototype.aiShow = function () {
  const s = this.os.reverse().find(v => v.t === 'str'); this.os.length = 0; if (!s || !this.text) return;
  const mode = this.textMode || 0; if (mode === 3) return;
  const M = mul(this.text.m, new P.Matrix(1, 0, 0, 1, this.text.x, this.text.y));
  const w = this.p.plainText(s.v.replace(/\r/g, ''), this.font.name, this.font.size, M, mode === 1 ? null : rgbColor(this.p.st.fill), mode === 1 || mode === 2 ? rgbColor(this.p.st.stroke) : null);
  this.text.x += w;
};
const PSOPS = {
  // stack & arithmetic
  pop() { this.pop(); }, dup() { const v = this.pop(); this.push(v); this.push(v); }, exch() { const b = this.pop(), a = this.pop(); this.push(b); this.push(a); },
  clear() { this.os.length = 0; }, mark() { this.push({ t: 'mark' }); }, cleartomark() { while (this.os.length && this.pop().t !== 'mark'); }, counttomark() { let k = 0; for (let i = this.os.length - 1; i >= 0 && this.os[i].t !== 'mark'; i--) k++; this.pushN(k); },
  count() { this.pushN(this.os.length); },
  index() { const k = this.num(); this.push(this.os[this.os.length - 1 - k]); },
  copy() { const k = this.num(); this.os.push(...this.os.slice(this.os.length - k)); },
  roll() { const j = this.num(), k = this.num(); if (k <= 0) return; const a = this.os.splice(this.os.length - k, k); const s = ((j % k) + k) % k; this.os.push(...a.slice(k - s), ...a.slice(0, k - s)); },
  add() { const b = this.num(), a = this.num(); this.pushN(a + b); }, sub() { const b = this.num(), a = this.num(); this.pushN(a - b); },
  mul() { const b = this.num(), a = this.num(); this.pushN(a * b); }, div() { const b = this.num(), a = this.num(); this.pushN(a / b); },
  idiv() { const b = this.num(), a = this.num(); this.pushN(Math.trunc(a / b)); }, mod() { const b = this.num(), a = this.num(); this.pushN(a % b); },
  neg() { this.pushN(-this.num()); }, abs() { this.pushN(Math.abs(this.num())); }, sqrt() { this.pushN(Math.sqrt(this.num())); },
  sin() { this.pushN(Math.sin(this.num() * Math.PI / 180)); }, cos() { this.pushN(Math.cos(this.num() * Math.PI / 180)); },
  atan() { const b = this.num(), a = this.num(); let d = Math.atan2(a, b) * 180 / Math.PI; if (d < 0) d += 360; this.pushN(d); },
  round() { this.pushN(Math.round(this.num())); }, floor() { this.pushN(Math.floor(this.num())); }, ceiling() { this.pushN(Math.ceil(this.num())); }, truncate() { this.pushN(Math.trunc(this.num())); },
  cvi() { this.pushN(Math.trunc(this.num())); }, cvr() { }, cvx() { const v = this.pop(); this.push(v.t === 'arr' ? { t: 'proc', v: v.v } : v); }, cvlit() { }, bind() { },
  true() { this.push({ t: 'bool', v: true }); }, false() { this.push({ t: 'bool', v: false }); },
  eq() { const b = this.pop(), a = this.pop(); this.push({ t: 'bool', v: a.v === b.v }); }, ne() { const b = this.pop(), a = this.pop(); this.push({ t: 'bool', v: a.v !== b.v }); },
  gt() { const b = this.num(), a = this.num(); this.push({ t: 'bool', v: a > b }); }, lt() { const b = this.num(), a = this.num(); this.push({ t: 'bool', v: a < b }); },
  ge() { const b = this.num(), a = this.num(); this.push({ t: 'bool', v: a >= b }); }, le() { const b = this.num(), a = this.num(); this.push({ t: 'bool', v: a <= b }); },
  not() { const a = this.pop(); this.push(a.t === 'bool' ? { t: 'bool', v: !a.v } : { t: 'num', v: ~a.v }); },
  and() { const b = this.pop(), a = this.pop(); this.push(a.t === 'bool' ? { t: 'bool', v: a.v && b.v } : { t: 'num', v: a.v & b.v }); },
  or() { const b = this.pop(), a = this.pop(); this.push(a.t === 'bool' ? { t: 'bool', v: a.v || b.v } : { t: 'num', v: a.v | b.v }); },
  if() { const p = this.pop(), c = this.pop(); if (c.v) this.execObj(p); }, ifelse() { const q = this.pop(), p = this.pop(), c = this.pop(); this.execObj(c.v ? p : q); },
  exec() { this.execObj(this.pop()); },
  repeat() { const p = this.pop(); const k = this.num(); for (let i = 0; i < k; i++) this.execObj(p); },
  for() { const p = this.pop(); const lim = this.num(), inc = this.num(), ini = this.num(); if (!inc) return; for (let v = ini; inc > 0 ? v <= lim : v >= lim; v += inc) { this.pushN(v); this.execObj(p); } },
  '['() { this.push({ t: 'mark' }); }, ']'() { const a = []; while (this.os.length && this.os[this.os.length - 1].t !== 'mark') a.unshift(this.pop()); this.pop(); this.push({ t: 'arr', v: a }); },
  array() { const k = this.num(); this.push({ t: 'arr', v: Array.from({ length: k }, () => ({ t: 'null' })) }); },
  aload() { const a = this.pop(); this.os.push(...a.v); this.push(a); }, length() { const a = this.pop(); this.pushN(a.t === 'str' ? a.v.length : a.v?.length ?? (a.v instanceof Map ? a.v.size : 0)); },
  get() { const k = this.pop(), a = this.pop(); if (a.t === 'dict') this.push(a.v.get(k.v) ?? { t: 'null' }); else if (a.t === 'str') this.pushN(a.v.charCodeAt(k.v)); else this.push(a.v[k.v] ?? { t: 'null' }); },
  put() { const v = this.pop(), k = this.pop(), a = this.pop(); if (a.t === 'dict') a.v.set(k.v, v); else if (Array.isArray(a.v)) a.v[k.v] = v; },
  // dictionaries
  def() { const v = this.pop(), k = this.pop(); this.dicts[this.dicts.length - 1].set(k.v, v); },
  dict() { this.pop(); this.push({ t: 'dict', v: new Map() }); }, '<<'() { this.push({ t: 'mark' }); }, '>>'() { const m = new Map(); while (this.os.length && this.os[this.os.length - 1].t !== 'mark') { const v = this.pop(), k = this.pop(); m.set(k.v, v); } this.pop(); this.push({ t: 'dict', v: m }); },
  begin() { const d = this.pop(); this.dicts.push(d.t === 'dict' ? d.v : new Map()); }, end() { if (this.dicts.length > 1) this.dicts.pop(); },
  currentdict() { this.push({ t: 'dict', v: this.dicts[this.dicts.length - 1] }); }, userdict() { this.push({ t: 'dict', v: this.dicts[0] }); }, globaldict() { this.push({ t: 'dict', v: this.dicts[0] }); }, systemdict() { this.push({ t: 'dict', v: new Map() }); },
  load() { const k = this.pop(); const v = this.lookup(k.v); this.push(v ?? { t: 'name', v: k.v }); },
  where() { const k = this.pop(); for (let i = this.dicts.length - 1; i >= 0; i--) if (this.dicts[i].has(k.v)) { this.push({ t: 'dict', v: this.dicts[i] }); this.push({ t: 'bool', v: true }); return; } this.push({ t: 'bool', v: false }); },
  known() { const k = this.pop(), d = this.pop(); this.push({ t: 'bool', v: d.t === 'dict' && d.v.has(k.v) }); },
  save() { this.p.save(); this.push({ t: 'save' }); }, restore() { this.pop(); this.p.restore(); },
  showpage() { }, setpagedevice() { this.pop(); }, setflat() { this.pop(); }, setoverprint() { this.pop(); }, setstrokeadjust() { this.pop(); }, setsmoothness() { this.pop(); },
  stopped() { const p = this.pop(); try { this.execObj(p); this.push({ t: 'bool', v: false }); } catch (e) { if (/too complex/.test(e.message)) throw e; this.push({ t: 'bool', v: true }); } },
  // graphics state
  gsave() { this.p.save(); }, grestore() { this.p.restore(); },
  translate() { const [x, y] = this.nums(2); this.p.transform(1, 0, 0, 1, x, y); }, scale() { const [x, y] = this.nums(2); this.p.transform(x, 0, 0, y, 0, 0); },
  rotate() { const a = this.num() * Math.PI / 180; this.p.transform(Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0); },
  concat() { const a = this.pop(); if (a.t === 'arr' && a.v.length === 6) this.p.transform(...a.v.map(v => v.v)); },
  matrix() { this.push({ t: 'arr', v: [1, 0, 0, 1, 0, 0].map(v => ({ t: 'num', v })) }); },
  setlinewidth() { this.p.st.lw = this.num(); }, setlinecap() { this.p.st.cap = CAPS[this.num()] || 'butt'; }, setlinejoin() { this.p.st.join = JOINS[this.num()] || 'miter'; }, setmiterlimit() { this.p.st.ml = this.num(); },
  setdash() { AIOPS.d.call(this); },
  setgray() { const v = this.num(); this.p.st.fill = this.p.st.stroke = [v, v, v]; this.psColor = true; },
  setrgbcolor() { const a = this.nums(3); this.p.st.fill = this.p.st.stroke = a; }, setcmykcolor() { const a = this.nums(4); this.p.st.fill = this.p.st.stroke = cmyk2rgb(...a); },
  sethsbcolor() { const [hh, s, b] = this.nums(3); const c = new P.Color({ hue: hh * 360, saturation: s, brightness: b }); this.p.st.fill = this.p.st.stroke = [c.red, c.green, c.blue]; },
  // paths
  newpath() { this.take(); }, moveto() { const [x, y] = this.nums(2); this.dmove(x, y); }, lineto() { const [x, y] = this.nums(2); this.dline(x, y); },
  rmoveto() { const [dx, dy] = this.nums(2); const [x, y] = this.cpU || [0, 0]; this.dmove(x + dx, y + dy); }, rlineto() { const [dx, dy] = this.nums(2); const [x, y] = this.cpU || [0, 0]; this.dline(x + dx, y + dy); },
  curveto() { const a = this.nums(6); this.dcurve(...a); }, rcurveto() { const a = this.nums(6); const [x, y] = this.cpU || [0, 0]; this.dcurve(x + a[0], y + a[1], x + a[2], y + a[3], x + a[4], y + a[5]); },
  closepath() { this.dclose(); }, arc() { const a = this.nums(5); this.arc(...a, false); }, arcn() { const a = this.nums(5); this.arc(...a, true); },
  currentpoint() { const [x, y] = this.cpU || [0, 0]; this.pushN(x); this.pushN(y); },
  fill() { this.p.paint(this.take(), null, { fill: true }); }, eofill() { this.p.paint(this.take(), null, { fill: true, eo: true }); }, stroke() { this.p.paint(this.take(), null, { stroke: true }); },
  clip() { this.p.pendingClip = 'nz'; this.p.paint(this.subs ? this.subs.map(s => s.slice()) : [], null, {}); }, eoclip() { this.p.pendingClip = 'eo'; this.p.paint(this.subs ? this.subs.map(s => s.slice()) : [], null, {}); },
  rectfill() { const [x, y, w, hh] = this.nums(4); this.dmove(x, y); this.dline(x + w, y); this.dline(x + w, y + hh); this.dline(x, y + hh); this.dclose(); PSOPS.fill.call(this); },
  rectstroke() { const [x, y, w, hh] = this.nums(4); this.dmove(x, y); this.dline(x + w, y); this.dline(x + w, y + hh); this.dline(x, y + hh); this.dclose(); PSOPS.stroke.call(this); },
  rectclip() { const [x, y, w, hh] = this.nums(4); this.take(); this.dmove(x, y); this.dline(x + w, y); this.dline(x + w, y + hh); this.dline(x, y + hh); this.dclose(); PSOPS.clip.call(this); this.take(); },
  // fonts & text
  findfont() { const k = this.pop(); this.push({ t: 'font', v: { name: String(k.v), size: 1 } }); },
  scalefont() { const s = this.num(); const f = this.pop(); this.push({ t: 'font', v: { ...(f.v || {}), size: s } }); },
  makefont() { const m = this.pop(); const f = this.pop(); this.push({ t: 'font', v: { ...(f.v || {}), size: Math.abs(m.v?.[3]?.v || 1) * (f.v?.size || 1) } }); },
  setfont() { const f = this.pop(); if (f.t === 'font') this.font = { ...f.v }; },
  selectfont() { const s = this.pop(); const k = this.pop(); this.font = { name: String(k.v), size: s.t === 'num' ? s.v : 12 }; },
  show() { const s = this.pop(); const [x, y] = this.cpU || [0, 0]; const w = this.p.plainText(s.v, this.font.name, this.font.size, new P.Matrix(1, 0, 0, 1, x, y), rgbColor(this.p.st.fill), null); this.cpU = [x + w, y]; },
  stringwidth() { const s = this.pop(); this.pushN(s.v.length * this.font.size * 0.5); this.pushN(0); },
};

// minimal TIFF decoder for EPS previews (uncompressed / PackBits / LZW, 1/8-bit gray, RGB, palette)
function decodeTIFF(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); const le = dv.getUint16(0) === 0x4949;
  const U16 = o => dv.getUint16(o, le), U32 = o => dv.getUint32(o, le); const ifd = U32(4); const n = U16(ifd); const tags = {};
  const SZ = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8 };
  for (let i = 0; i < n; i++) { const e = ifd + 2 + i * 12; const tag = U16(e), type = U16(e + 2), cnt = U32(e + 4); const sz = (SZ[type] || 1) * cnt; const off = sz > 4 ? U32(e + 8) : e + 8; const vals = []; for (let k = 0; k < Math.min(cnt, 65536); k++) vals.push(type === 3 ? U16(off + k * 2) : type === 4 ? U32(off + k * 4) : u8[off + k]); tags[tag] = vals; }
  const W = tags[256][0], H = tags[257][0], bps = (tags[258] || [1])[0], comp = (tags[259] || [1])[0], photo = (tags[262] || [1])[0], spp = (tags[277] || [1])[0], pred = (tags[317] || [1])[0];
  const offs = tags[273], cnts = tags[279]; const parts = [];
  for (let s = 0; s < offs.length; s++) {
    const src = u8.subarray(offs[s], offs[s] + cnts[s]);
    if (comp === 1) parts.push(src);
    else if (comp === 32773) { const out = []; for (let i = 0; i < src.length;) { const b = (src[i] << 24) >> 24; i++; if (b >= 0) { for (let k = 0; k <= b; k++) out.push(src[i++]); } else if (b !== -128) { const v = src[i++]; for (let k = 0; k < 1 - b; k++) out.push(v); } } parts.push(Uint8Array.from(out)); }
    else if (comp === 5) { const out = []; let dict = [], bits = 9, buf = 0, nb = 0, prev = null; const reset = () => { dict = []; for (let i = 0; i < 256; i++) dict.push([i]); dict.push(null, null); bits = 9; };
      reset(); for (let i = 0; i < src.length; i++) { buf = (buf << 8) | src[i]; nb += 8; while (nb >= bits) { const code = (buf >> (nb - bits)) & ((1 << bits) - 1); nb -= bits; if (code === 256) { reset(); prev = null; continue; } if (code === 257) { i = src.length; break; } let entry = code < dict.length && dict[code] ? dict[code] : prev ? prev.concat(prev[0]) : null; if (!entry) { i = src.length; break; } out.push(...entry); if (prev) dict.push(prev.concat(entry[0])); prev = entry; if (dict.length + 1 >= (1 << bits) && bits < 12) bits++; } } parts.push(Uint8Array.from(out)); }
    else throw new Error('Unsupported TIFF compression');
  }
  const raw = new Uint8Array(parts.reduce((a, p) => a + p.length, 0)); let o = 0; parts.forEach(p => { raw.set(p, o); o += p.length; });
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); const id = x.createImageData(W, H); const d = id.data;
  const rowB = Math.ceil(W * bps * spp / 8);
  if (pred === 2 && bps === 8) for (let y = 0; y < H; y++) for (let i = spp; i < W * spp; i++) raw[y * rowB + i] = (raw[y * rowB + i] + raw[y * rowB + i - spp]) & 255;
  const cmap = tags[320];
  for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) {
    const q = (y * W + i) * 4; let r, g, b;
    if (photo === 2) { const s = y * rowB + i * spp * (bps / 8); r = raw[s]; g = raw[s + 1]; b = raw[s + 2]; }
    else { let v; if (bps === 8) v = raw[y * rowB + i]; else { const bit = i * bps; v = (raw[y * rowB + (bit >> 3)] >> (8 - bps - (bit & 7))) & ((1 << bps) - 1); }
      if (photo === 3 && cmap) { const N = 1 << bps; r = cmap[v] >> 8; g = cmap[N + v] >> 8; b = cmap[2 * N + v] >> 8; }
      else { let t = Math.round(v * 255 / ((1 << bps) - 1)); if (photo === 0) t = 255 - t; r = g = b = t; } }
    d[q] = r; d[q + 1] = g; d[q + 2] = b; d[q + 3] = 255;
  }
  x.putImageData(id, 0, 0); return c;
}
function decodeEPSI(s) {
  const m = /%%BeginPreview:\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\r?\n([\s\S]*?)%%EndPreview/.exec(s); if (!m) return null;
  const W = +m[1], H = +m[2], depth = +m[3]; const hex = m[5].replace(/[^0-9a-fA-F]/g, ''); const rowB = Math.ceil(W * depth / 8);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); const id = x.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) { const bit = i * depth; const byte = parseInt(hex.substr((y * rowB + (bit >> 3)) * 2, 2), 16) || 0; const v = (byte >> (8 - depth - (bit & 7))) & ((1 << depth) - 1); const t = 255 - Math.round(v * 255 / ((1 << depth) - 1)); const q = (y * W + i) * 4; id.data[q] = id.data[q + 1] = id.data[q + 2] = t; id.data[q + 3] = 255; }
  x.putImageData(id, 0, 0); return c;
}

async function importPS(u8, name, mode, opts, path, bin) {
  let ps = u8, tiff = null, wmf = false;
  if (bin) { const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); const s0 = dv.getUint32(4, true), l0 = dv.getUint32(8, true), wl = dv.getUint32(16, true), t0 = dv.getUint32(20, true), tl = dv.getUint32(24, true); ps = u8.subarray(s0, s0 + l0); if (tl) tiff = u8.subarray(t0, t0 + tl); wmf = !!wl; }
  const s = latin1(ps);
  const isAI = /%%Creator:[^\n]*Illustrator|^%AI\d|%%AI\d_|Adobe_Illustrator/m.test(s) || /%%AI5_|%AI5_FileFormat|%AI3_/.test(s);
  const bb = bboxOf(s); const docName = name.replace(/\.(ai|eps|ps)$/i, '.btsv');
  const totalFail = msg => { throw new Error(msg); };
  let placed = null, board;
  const run = () => {
    let W = bb ? (bb[2] - bb[0]) * PX : 800, H = bb ? (bb[3] - bb[1]) * PX : 600;
    if (mode === 'open') { VX.createDoc('custom', { name: docName, w: +W.toFixed(3), h: +H.toFixed(3) }); VX.userLayers().forEach(L => L.remove()); board = DOC.boards[0]; }
    else { placed = new P.Group({ name: nm(name.replace(/\.\w+$/, '')) }); (VX.iso || VX.P.project.activeLayer).addChild(placed); board = { x: 0, y: 0 }; }
    const root = mode === 'open' ? VX.newUserLayer('Layer 1') : placed;
    const base = new P.Matrix(PX, 0, 0, -PX, board.x - (bb ? bb[0] : 0) * PX, board.y + (bb ? bb[3] : H / PX) * PX);
    const painter = new Painter(root, base, { pageRect: new P.Rectangle(board.x, board.y, W, H), newLayer: mode === 'open' && isAI ? vis => { const L = VX.newUserLayer('Layer'); L.visible = vis; return L; } : null });
    const it = new PSInterp(painter, { ai: isAI });
    let err = null; try { it.run(tokenize(isAI ? aiBody(s) : s.replace(/%%BeginPreview[\s\S]*?%%EndPreview/, ''))); } catch (e) { err = e; }
    if (mode === 'open') { const empty = VX.userLayers().filter(L => !L.children.length && L.name === 'Layer 1'); if (VX.userLayers().length > 1) empty.forEach(L => L.remove()); }
    if (mode === 'open' && !bb) { const all = VX.userLayers().reduce((r, L) => L.children.length ? (r ? r.unite(L.bounds) : L.bounds) : r, null); if (all) { VX.userLayers().forEach(L => L.translate(all.topLeft.multiply(-1))); DOC.boards[0].w = Math.ceil(all.width); DOC.boards[0].h = Math.ceil(all.height); } }
    return { painter, it, err };
  };
  const r = run(); const st = r.painter.stats;
  const drew = st.paths + st.texts + st.images;
  const unk = [...r.it.unknown.entries()].sort((a, b) => b[1] - a[1]);
  if (!drew || (r.err && drew < 3)) {
    // fall back to the embedded preview
    let prev = null; try { if (tiff) prev = decodeTIFF(tiff); else prev = decodeEPSI(s); } catch (e) { console.warn(e); }
    if (mode === 'open') { VX.userLayers().forEach(L => L.removeChildren()); } else placed?.remove();
    if (!prev) {
      if (mode === 'open') { VX.resetHistory('Open'); }
      totalFail(wmf ? "This file uses PostScript features BTS Vector can't convert, and its only preview is WMF, which is not supported. Save it as PDF or SVG from the original app." : "This file uses PostScript features BTS Vector can't convert, and it has no TIFF or EPSI preview. Save it as PDF or SVG from the original app.");
    }
    const W = bb ? (bb[2] - bb[0]) * PX : prev.width, H = bb ? (bb[3] - bb[1]) * PX : prev.height;
    const target = mode === 'open' ? VX.userLayers()[0] : (VX.iso || VX.P.project.activeLayer);
    const ras = new P.Raster({ insert: false }); ras.setImage(prev); target.addChild(ras); ras.scale(W / prev.width, H / prev.height); ras.position = mode === 'open' ? new P.Point(W / 2, H / 2) : VX.abRect().center; ras.name = 'EPS preview';
    if (mode === 'open') { VX.drawArtboard(); VX.resetHistory('Open'); DOC.name = docName; VX.fitArt(); UI.setDocTitle(DOC.name, 'BTS Vector'); } else { VX.setSel([ras]); VX.commit('Place ' + name); }
    toast('This file is too complex to convert to vectors, so its embedded preview image was placed instead.', '', 8000); if (r.err) console.warn('EPS/AI interpreter:', r.err.message);
    return { preview: true, unknown: unk.slice(0, 10) };
  }
  if (r.err) console.warn('EPS/AI import stopped early:', r.err.message);
  const total = { ...st, pages: 1, unknown: unk.slice(0, 12), error: r.err ? r.err.message : null, ai: isAI };
  if (mode === 'open') VX.userLayers().forEach(L => tidy(L, null)); else tidy(placed, null);
  const res = finish(mode, placed, docName, path, total, name);
  if (r.err || unk.length > 8) toast('Some PostScript in this file was skipped; check the result against the original.', '', 7000);
  return res;
}
VX.f.psTokenize = tokenize; VX.f.decodeTIFF = decodeTIFF;

// ================================================================ menu actions
VX.f.openVectorDialog = async () => { const fs = await bts.fs.open({ filters: [{ name: 'PDF, Illustrator & EPS', extensions: ['pdf', 'ai', 'eps', 'epsf', 'ps'] }] }); if (fs) return VX.openFile(fs[0]); };
VX.f.placeVectorDialog = async () => { const fs = await bts.fs.open({ filters: [{ name: 'PDF, Illustrator & EPS', extensions: ['pdf', 'ai', 'eps', 'epsf', 'ps'] }] }); if (!fs) return; const f = fs[0]; try { return await importVector({ ...f, data: new Uint8Array(f.data) }, { mode: 'place' }); } catch (e) { console.error(e); toast('Could not place file: ' + e.message, 'err', 7000); } };
VX.f.renderPdfPage = async (u8, pageNo = 1, scale = PX) => { // reference render (tests & previews)
  const lib = await pdfjs(); const sn = sniff(u8); const doc = await lib.getDocument({ data: u8.subarray(sn.offset || 0).slice(), isEvalSupported: false, verbosity: 0 }).promise; const pg = await doc.getPage(pageNo); const vp = pg.getViewport({ scale });
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  await pg.render({ canvasContext: x, viewport: vp, annotationMode: lib.AnnotationMode.DISABLE }).promise; doc.destroy(); return c;
};
})();
