// True text editing core for BTS PDF Pro.
// A small PDF content-stream tokenizer and text interpreter (BT/ET, Tf, Td/TD/Tm/T*, Tj/TJ/'/", q/Q, cm, Do),
// fonts (ToUnicode, encodings, widths), positioned text runs, lines and paragraph blocks, and a rewriter that
// really removes / replaces the show-text operators in the content stream (so old text is gone from the file)
// and writes the new text at the same position, size and colour.
// Pure module (no DOM): it is also run under Node by the automated tests.
import { AGL, ENC } from '../vendor/pdf-glyphs/glyphs.js';
const PL = () => globalThis.PDFLib;

// ------------------------------------------------------------------ bytes, matrices
export const u8ToBin = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return s; };
export const binToU8 = s => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
const I = [1, 0, 0, 1, 0, 0];
export const mul = (m, n) => [m[0] * n[0] + m[1] * n[2], m[0] * n[1] + m[1] * n[3], m[2] * n[0] + m[3] * n[2], m[2] * n[1] + m[3] * n[3], m[4] * n[0] + m[5] * n[2] + n[4], m[4] * n[1] + m[5] * n[3] + n[5]];
export const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
export const inv = m => { const d = (m[0] * m[3] - m[1] * m[2]) || 1e-12; return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d]; };
const fmt = v => { const r = Math.round(v * 1000) / 1000; return Object.is(r, -0) ? '0' : String(r); };

// ------------------------------------------------------------------ tokenizer
// Returns operators: { op, a: [args], s: start offset of first operand, e: end offset }.
// Operands: numbers (JS numbers), {t:'s', v: byte-string, hex}, {t:'n', v: name}, {t:'a', v: [...]}, {t:'d', v: {}}, {t:'b'}, {t:'z'}.
const isWS = c => c === 32 || c === 10 || c === 13 || c === 9 || c === 12 || c === 0;
const isDel = c => c === 40 || c === 41 || c === 60 || c === 62 || c === 91 || c === 93 || c === 123 || c === 125 || c === 47 || c === 37;
export function tokenize(s) {
  const ops = []; let args = [], start = -1; const frames = []; let i = 0; const n = s.length;
  const put = v => { if (frames.length) frames[frames.length - 1].v.push(v); else args.push(v); };
  const regular = () => { const b = i; while (i < n) { const c = s.charCodeAt(i); if (isWS(c) || isDel(c)) break; i++; } return s.slice(b, i); };
  while (i < n) {
    const c = s.charCodeAt(i);
    if (isWS(c)) { i++; continue; }
    if (c === 37) { while (i < n && s.charCodeAt(i) !== 10 && s.charCodeAt(i) !== 13) i++; continue; }
    if (start < 0) start = i;
    if (c === 40) { // literal string
      let depth = 1, out = ''; i++;
      while (i < n) {
        const ch = s[i];
        if (ch === '\\') {
          const e = s[++i];
          if (e === 'n') out += '\n'; else if (e === 'r') out += '\r'; else if (e === 't') out += '\t'; else if (e === 'b') out += '\b'; else if (e === 'f') out += '\f';
          else if (e === '\r') { if (s[i + 1] === '\n') i++; } else if (e === '\n') { /* line continuation */ }
          else if (e >= '0' && e <= '7') { let o = e; while (o.length < 3 && s[i + 1] >= '0' && s[i + 1] <= '7') o += s[++i]; out += String.fromCharCode(parseInt(o, 8) & 255); }
          else if (e !== undefined) out += e;
          i++; continue;
        }
        if (ch === '(') depth++; else if (ch === ')' && !--depth) { i++; break; }
        out += ch; i++;
      }
      put({ t: 's', v: out }); continue;
    }
    if (c === 60) {
      if (s.charCodeAt(i + 1) === 60) { frames.push({ k: 'd', v: [] }); i += 2; continue; }
      let j = s.indexOf('>', i); if (j < 0) j = n;
      const hx = s.slice(i + 1, j).replace(/[^0-9a-fA-F]/g, ''); let out = '';
      for (let k = 0; k < hx.length; k += 2) out += String.fromCharCode(parseInt(hx[k] + (hx[k + 1] || '0'), 16));
      put({ t: 's', v: out, hex: true }); i = j + 1; continue;
    }
    if (c === 62) {
      if (s.charCodeAt(i + 1) === 62) { const f = frames.pop(); const d = {}; if (f) for (let k = 0; k + 1 < f.v.length; k += 2) if (f.v[k]?.t === 'n') d[f.v[k].v] = f.v[k + 1]; put({ t: 'd', v: d }); i += 2; continue; }
      i++; continue;
    }
    if (c === 91) { frames.push({ k: 'a', v: [] }); i++; continue; }
    if (c === 93) { const f = frames.pop(); put({ t: 'a', v: f ? f.v : [] }); i++; continue; }
    if (c === 123 || c === 125) { i++; continue; }
    if (c === 47) { i++; const raw = regular(); put({ t: 'n', v: raw.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) }); continue; }
    if (c === 41) { i++; continue; }
    const w = regular();
    if (!w) { i++; continue; }
    if (/^[+\-]?(\d+\.?\d*|\.\d+)$/.test(w) || /^[+\-]?\d*\.\d*$/.test(w) && w !== '.' && w !== '-' && w !== '+') { put(parseFloat(w) || 0); continue; }
    if (w === 'true' || w === 'false') { put({ t: 'b', v: w === 'true' }); continue; }
    if (w === 'null') { put({ t: 'z' }); continue; }
    // operator
    frames.length = 0;
    if (w === 'BI') { // inline image: skip to EI
      let j = i, idPos = -1;
      while (j < n) { const k = s.indexOf('ID', j); if (k < 0) break; if (isWS(s.charCodeAt(k - 1)) && (k + 2 >= n || isWS(s.charCodeAt(k + 2)))) { idPos = k; break; } j = k + 2; }
      let end = n;
      if (idPos >= 0) { let k = idPos + 3; while (k < n) { const e = s.indexOf('EI', k); if (e < 0) break; if (isWS(s.charCodeAt(e - 1)) && (e + 2 >= n || isWS(s.charCodeAt(e + 2)) || isDel(s.charCodeAt(e + 2)))) { end = e + 2; break; } k = e + 2; } }
      ops.push({ op: 'BI', a: [], s: start, e: end }); i = end; args = []; start = -1; continue;
    }
    ops.push({ op: w, a: args, s: start, e: i }); args = []; start = -1;
  }
  return ops;
}

// ------------------------------------------------------------------ glyph names & CMaps
const LIG = { fi: 'fi', fl: 'fl', ff: 'ff', ffi: 'ffi', ffl: 'ffl', dotlessj: 'ȷ', nbspace: '\u00a0', sfthyphen: '\u00ad', minus: '−', ellipsis: '…', quotesingle: "'" };
export function glyphToUni(n) {
  if (!n) return '';
  if (AGL[n]) return String.fromCodePoint(AGL[n]);
  if (LIG[n]) return LIG[n];
  let m = /^uni([0-9A-Fa-f]{4,})$/.exec(n); if (m && m[1].length % 4 === 0) return m[1].match(/.{4}/g).map(h => String.fromCharCode(parseInt(h, 16))).join('');
  m = /^u([0-9A-Fa-f]{4,6})$/.exec(n); if (m) return String.fromCodePoint(parseInt(m[1], 16));
  if (n.includes('.')) return glyphToUni(n.split('.')[0]);
  if (n.includes('_')) return n.split('_').map(glyphToUni).join('');
  return '';
}
const utf16 = hx => { let out = ''; for (let k = 0; k + 3 < hx.length; k += 4) out += String.fromCharCode(parseInt(hx.slice(k, k + 4), 16)); if (hx.length === 2) out = String.fromCharCode(parseInt(hx, 16)); return out; };
export function parseCMap(text) {
  const map = new Map(), ranges = [], cid = new Map(), cidRanges = [];
  for (const m of text.matchAll(/begincodespacerange([\s\S]*?)endcodespacerange/g))
    for (const r of m[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) ranges.push({ len: r[1].length / 2, lo: parseInt(r[1], 16), hi: parseInt(r[2], 16) });
  for (const m of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const r of m[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) map.set(parseInt(r[1], 16), utf16(r[2]));
  for (const m of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for (const r of m[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g)) {
      const lo = parseInt(r[1], 16), hi = parseInt(r[2], 16);
      if (hi - lo > 65535) continue;
      if (r[3][0] === '<') {
        const hx = r[3].slice(1, -1); const base = utf16(hx);
        for (let c = lo; c <= hi; c++) { const off = c - lo; map.set(c, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + off)); }
      } else { const arr = [...r[3].matchAll(/<([0-9a-fA-F]*)>/g)].map(x => utf16(x[1])); for (let c = lo; c <= hi; c++) if (arr[c - lo] != null) map.set(c, arr[c - lo]); }
    }
  for (const m of text.matchAll(/begincidchar([\s\S]*?)endcidchar/g)) for (const r of m[1].matchAll(/<([0-9a-fA-F]+)>\s*(\d+)/g)) cid.set(parseInt(r[1], 16), +r[2]);
  for (const m of text.matchAll(/begincidrange([\s\S]*?)endcidrange/g)) for (const r of m[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\d+)/g)) cidRanges.push([parseInt(r[1], 16), parseInt(r[2], 16), +r[3]]);
  return { map, ranges, cid, cidRanges };
}

// ------------------------------------------------------------------ fonts
const STD14 = { 'Helvetica': 'Helvetica', 'Helvetica-Bold': 'Helvetica-Bold', 'Helvetica-Oblique': 'Helvetica-Oblique', 'Helvetica-BoldOblique': 'Helvetica-BoldOblique', 'Times-Roman': 'Times-Roman', 'Times-Bold': 'Times-Bold', 'Times-Italic': 'Times-Italic', 'Times-BoldItalic': 'Times-BoldItalic', 'Courier': 'Courier', 'Courier-Bold': 'Courier-Bold', 'Courier-Oblique': 'Courier-Oblique', 'Courier-BoldOblique': 'Courier-BoldOblique', 'Symbol': 'Symbol', 'ZapfDingbats': 'ZapfDingbats',
  'Arial': 'Helvetica', 'Arial,Bold': 'Helvetica-Bold', 'Arial,Italic': 'Helvetica-Oblique', 'Arial,BoldItalic': 'Helvetica-BoldOblique', 'ArialMT': 'Helvetica', 'Arial-BoldMT': 'Helvetica-Bold', 'TimesNewRoman': 'Times-Roman', 'TimesNewRoman,Bold': 'Times-Bold', 'TimesNewRomanPSMT': 'Times-Roman', 'TimesNewRoman,Italic': 'Times-Italic', 'CourierNew': 'Courier', 'CourierNewPSMT': 'Courier' };
const nameOf = o => o && o.asString ? o.asString().replace(/^\//, '').replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) : (o && o.decodeText ? o.decodeText() : null);
const numOf = o => o && typeof o.asNumber === 'function' ? o.asNumber() : (typeof o === 'number' ? o : null);
export function decodeStream(st) {
  const L = PL();
  if (st instanceof L.PDFRawStream) return L.decodePDFRawStream(st).decode();
  if (st.getContents) { try { return st.getUnencodedContents ? st.getUnencodedContents() : st.getContents(); } catch { return st.getContents(); } }
  return new Uint8Array();
}
function stdMetrics(name) {
  const L = PL(); const std = STD14[name.replace(/^[A-Z]{6}\+/, '')]; if (!std) return null;
  try { const e = L.StandardFontEmbedder.for(std); return { emb: e, std }; } catch { return null; }
}
// font family/weight/style guess for the standard-font fallback
export function stdFallback(f) {
  const n = ((f.baseName || '') + ' ' + (f.family || '')).toLowerCase();
  let family = 'Helvetica';
  if (/courier|mono|consol|typewriter|cmtt|code/.test(n) || (f.flags & 1)) family = 'Courier';
  else if (!/sans|arial|helvet|calibri|verdana|tahoma|segoe|inter|roboto|carlito|dejavusans|noto ?sans|ubuntu|lato|open ?sans/.test(n) && (/times|serif|roman|georgia|cambria|garamond|book|minion|palatino|cmr|cmbx|cmti|charter|caladea|baskerville|libertin|tinos|liberationserif|nimbusrom|century|bodoni/.test(n) || (f.flags & 2))) family = 'Times';
  const bold = /bold|black|heavy|semibold|demi|cmbx|extrabold/.test(n) || (f.weight || 0) >= 600 || !!(f.flags & 262144);
  const italic = /italic|oblique|cmti|cmsl|slant/.test(n) || (f.italicAngle || 0) !== 0 || !!(f.flags & 64);
  return { family, bold, italic };
}
export function stdFontName({ family, bold, italic }) {
  if (family === 'Times') return bold ? (italic ? 'Times-BoldItalic' : 'Times-Bold') : (italic ? 'Times-Italic' : 'Times-Roman');
  if (family === 'Courier') return bold ? (italic ? 'Courier-BoldOblique' : 'Courier-Bold') : (italic ? 'Courier-Oblique' : 'Courier');
  return bold ? (italic ? 'Helvetica-BoldOblique' : 'Helvetica-Bold') : (italic ? 'Helvetica-Oblique' : 'Helvetica');
}

export function loadFont(doc, dict) {
  const L = PL(); const ctx = doc.context; const N = k => L.PDFName.of(k);
  const look = (d, k) => d ? ctx.lookup(d.get(N(k))) : undefined;
  const f = { dict, used: new Set(), codeLen: 1, toUni: null, rev: new Map(), type3: false, vertical: false, embedded: false, subset: false, ascent: 0.8, descent: -0.2, flags: 0 };
  f.subtype = nameOf(look(dict, 'Subtype')) || 'Type1';
  f.baseName = (nameOf(look(dict, 'BaseFont')) || nameOf(look(dict, 'Name')) || 'Font');
  f.subset = /^[A-Z]{6}\+/.test(f.baseName);
  f.type3 = f.subtype === 'Type3';
  let desc = dict, fd;
  if (f.subtype === 'Type0') {
    const dfs = look(dict, 'DescendantFonts'); desc = dfs && ctx.lookup(dfs.get(0)); f.cidType = nameOf(look(desc, 'Subtype'));
    const enc = look(dict, 'Encoding');
    if (enc instanceof L.PDFName) { const en = nameOf(enc); f.codeLen = 2; f.identity = /^Identity-[HV]$/.test(en); f.vertical = /-V$/.test(en); f.cmapName = en; }
    else if (enc) { try { const cm = parseCMap(u8ToBin(decodeStream(enc))); f.cmap = cm; f.vertical = /\/WMode\s+1/.test(u8ToBin(decodeStream(enc))); if (cm.ranges.length) f.ranges = cm.ranges; } catch { } }
    // widths
    const dw = numOf(look(desc, 'DW')); f.dw = dw ?? 1000; f.w = new Map();
    const W = look(desc, 'W');
    if (W) { const arr = W.asArray(); for (let k = 0; k < arr.length;) { const c1 = numOf(ctx.lookup(arr[k])); const nx = ctx.lookup(arr[k + 1]); if (nx instanceof L.PDFArray) { nx.asArray().forEach((w, j) => f.w.set(c1 + j, numOf(ctx.lookup(w)))); k += 2; } else { const c2 = numOf(nx), w = numOf(ctx.lookup(arr[k + 2])); for (let c = c1; c <= c2 && c - c1 < 65536; c++) f.w.set(c, w); k += 3; } } }
  } else {
    f.first = numOf(look(dict, 'FirstChar')) ?? 0; const W = look(dict, 'Widths'); f.widths = W ? W.asArray().map(x => numOf(ctx.lookup(x)) ?? 0) : null;
    if (f.type3) { const fm = look(dict, 'FontMatrix'); f.fm = fm ? fm.asArray().map(x => numOf(ctx.lookup(x))) : [0.001, 0, 0, 0.001, 0, 0]; }
  }
  fd = look(desc, 'FontDescriptor');
  if (fd) {
    f.flags = numOf(look(fd, 'Flags')) || 0; f.italicAngle = numOf(look(fd, 'ItalicAngle')) || 0; f.weight = numOf(look(fd, 'FontWeight')) || 0;
    const fam = look(fd, 'FontFamily'); f.family = fam?.decodeText ? fam.decodeText() : '';
    const a = numOf(look(fd, 'Ascent')), d = numOf(look(fd, 'Descent'));
    if (a && a > 100 && a < 1600) f.ascent = a / 1000; if (d && d < 0 && d > -800) f.descent = d / 1000;
    f.missing = numOf(look(fd, 'MissingWidth')) || 0;
    const ff = look(fd, 'FontFile') || look(fd, 'FontFile2') || look(fd, 'FontFile3'); f.embedded = !!ff;
    if (look(fd, 'FontFile') && f.subtype !== 'Type0') { // Type 1 program: read its built-in encoding from the clear-text part
      try { const t = u8ToBin(decodeStream(look(fd, 'FontFile'))); const head = t.slice(0, Math.max(0, t.indexOf('eexec')) || 20000); if (!/\/Encoding\s+StandardEncoding/.test(head)) { const be = new Map(); for (const m of head.matchAll(/dup\s+(\d+)\s*\/([^\s\/\[\]]+)\s+put/g)) be.set(+m[1], m[2]); if (be.size) f.builtin = be; } } catch { }
    }
  }
  if (f.type3) { const bb = look(dict, 'FontBBox'); if (bb) { const v = bb.asArray().map(x => numOf(ctx.lookup(x))); const sy = f.fm[3] || 0.001; f.ascent = Math.max(0.5, v[3] * sy); f.descent = Math.min(0, v[1] * sy); } }
  // simple-font encoding (code -> glyph name / unicode)
  if (f.subtype !== 'Type0') {
    const enc = look(dict, 'Encoding'); let base = null, diffs = null;
    if (enc instanceof L.PDFName) base = nameOf(enc);
    else if (enc instanceof L.PDFDict) { base = nameOf(look(enc, 'BaseEncoding')); const D = look(enc, 'Differences'); if (D) { diffs = new Map(); let code = 0; for (const x of D.asArray()) { const o = ctx.lookup(x); if (o instanceof L.PDFNumber) code = o.asNumber(); else { diffs.set(code++, nameOf(o)); } } } }
    const symbolic = !!(f.flags & 4) && !(f.flags & 32);
    const std = stdMetrics(f.baseName);
    let tbl = ENC[base] || null;
    if (!tbl) tbl = f.builtin ? null : (std?.std === 'Symbol' || std?.std === 'ZapfDingbats') ? null : (f.subtype === 'TrueType' ? ENC.WinAnsiEncoding : (symbolic && f.embedded ? null : ENC.StandardEncoding));
    f.encUni = new Map();
    for (let c = 0; c < 256; c++) {
      let u = '';
      if (diffs?.has(c)) u = glyphToUni(diffs.get(c));
      else if (f.builtin?.has(c)) u = glyphToUni(f.builtin.get(c));
      else if (tbl && tbl[c]) u = String.fromCodePoint(tbl[c]);
      if (u) f.encUni.set(c, u);
    }
    f.diffs = diffs; f.std = std;
  }
  const tu = look(dict, 'ToUnicode');
  if (tu && !(tu instanceof L.PDFName)) { try { const cm = parseCMap(u8ToBin(decodeStream(tu))); if (cm.map.size) f.toUni = cm.map; if (!f.ranges && f.subtype === 'Type0' && cm.ranges.length) f.ranges = cm.ranges; } catch { } }
  // reverse map unicode -> code, used to re-encode new text in the same font
  const addRev = (code, u) => { if (u && [...u].length === 1 && !f.rev.has(u)) f.rev.set(u, code); };
  if (f.toUni) for (const [c, u] of f.toUni) addRev(c, u);
  if (f.encUni) for (const [c, u] of f.encUni) addRev(c, u);
  if (!f.rev.has(' ')) { const c = f.rev.get('\t') ?? f.rev.get('\u00a0'); if (c != null) f.rev.set(' ', c); }
  f.decodable = !!(f.toUni || (f.encUni && f.encUni.size > 20));
  // widths in text space per unit font size
  f.width = code => {
    if (f.subtype === 'Type0') { const c = f.cidOf(code); const w = f.w.get(c); return (w ?? f.dw) / 1000; }
    if (f.type3) { const w = f.widths?.[code - f.first]; return (w || 0) * (f.fm[0] || 0.001); }
    const w = f.widths ? f.widths[code - f.first] : undefined;
    if (w != null && (w > 0 || !f.std)) return w / 1000;
    if (f.std) { const u = f.encUni.get(code) || String.fromCharCode(code); try { return f.std.emb.widthOfTextAtSize(u, 1000) / 1000; } catch { return 0.5; } }
    return (f.missing || 500) / 1000;
  };
  f.hasWidth = code => {
    if (f.subtype === 'Type0') return f.w.has(f.cidOf(code)) || !f.subset;
    if (f.widths) { const w = f.widths[code - f.first]; return w != null && (w > 0 || code === 32); }
    return true;
  };
  f.cidOf = code => {
    if (f.identity || !f.cmap) return code;
    if (f.cmap.cid.has(code)) return f.cmap.cid.get(code);
    for (const [lo, hi, c] of f.cmap.cidRanges) if (code >= lo && code <= hi) return c + code - lo;
    return code;
  };
  f.split = str => {
    const out = [];
    if (f.subtype !== 'Type0') { for (let k = 0; k < str.length; k++) out.push(str.charCodeAt(k)); return out; }
    if (!f.ranges || f.identity) { for (let k = 0; k + 1 < str.length; k += 2) out.push(str.charCodeAt(k) * 256 + str.charCodeAt(k + 1)); return out; }
    for (let k = 0; k < str.length;) {
      let took = 0;
      for (let len = 1; len <= 4 && !took; len++) { if (k + len > str.length) break; let v = 0; for (let j = 0; j < len; j++) v = v * 256 + str.charCodeAt(k + j); if (f.ranges.some(r => r.len === len && v >= r.lo && v <= r.hi)) { out.push(v); took = len; } }
      if (!took) { out.push(str.charCodeAt(k)); took = 1; }
      k += took;
    }
    return out;
  };
  f.uni = code => (f.toUni && f.toUni.get(code)) ?? (f.encUni ? (f.encUni.get(code) || '') : '');
  // can the font draw this code? (subset fonts only contain the glyphs that were used)
  f.has = code => {
    if (!f.hasWidth(code)) return false;
    if (!f.embedded) return true;
    if (!f.subset) return true;
    if (f.toUni && f.toUni.has(code)) return true;
    if (f.used.has(code)) return true;
    if (f.builtin && f.builtin.has(code)) return true;
    if (f.diffs && f.diffs.has(code)) return true;
    return false;
  };
  f.codeFor = ch => { const c = f.rev.get(ch); return c != null && f.has(c) ? c : null; };
  return f;
}

// ------------------------------------------------------------------ page analysis
const FONTS = new WeakMap(); // doc -> Map(key -> font)
function fontFrom(doc, res, name) {
  const L = PL(); if (!res) return null;
  const fdict = doc.context.lookup(res.get(L.PDFName.of('Font'))); if (!(fdict instanceof L.PDFDict)) return null;
  const raw = fdict.get(L.PDFName.of(name)); if (!raw) return null;
  let m = FONTS.get(doc); if (!m) FONTS.set(doc, m = new Map());
  const key = raw instanceof L.PDFRef ? raw.toString() : raw;
  if (!m.has(key)) { const d = doc.context.lookup(raw); m.set(key, d instanceof L.PDFDict ? loadFont(doc, d) : null); }
  return m.get(key);
}
function contentsOf(doc, node) {
  const L = PL(); const c = node.get(L.PDFName.of('Contents')); if (!c) return { refs: [], text: '' };
  const refs = []; const parts = [];
  const add = r => { const st = doc.context.lookup(r); if (st && st instanceof L.PDFStream || st?.dict) { refs.push(r); try { parts.push(u8ToBin(decodeStream(st))); } catch (e) { parts.push(''); } } };
  const v = doc.context.lookup(c);
  if (v instanceof L.PDFArray) v.asArray().forEach(add); else add(c);
  return { refs, text: parts.join('\n') };
}
const nums = (a, k) => a.slice(0, k).map(x => typeof x === 'number' ? x : 0);

export function analyzePage(doc, pageIndex) {
  const L = PL();
  const page = doc.getPage(pageIndex); const node = page.node;
  const { refs, text } = contentsOf(doc, node);
  const model = { doc, pageIndex, page, streams: [], runs: [], forms: new Map() };
  const st0 = { id: 0, kind: 'page', refs, text, ops: tokenize(text), res: node.Resources(), toPage: I };
  model.streams.push(st0);
  interpret(model, st0, 0);
  buildLines(model); buildBlocks(model);
  return model;
}

function interpret(model, st, depth) {
  const L = PL(); const doc = model.doc;
  let gs = { ctm: I, fill: { sp: 'g', v: [0] }, Tc: 0, Tw: 0, Th: 1, TL: 0, fk: null, font: null, fs: 0, Ts: 0, Tr: 0 };
  const stack = []; let Tm = I, Tlm = I;
  const show = (o, elems, prefix) => {
    const f = gs.font; if (!f) return;
    const Tm0 = Tm; let u = 0; const parts = [], glyphs = [], chars = [];
    for (const el of elems) {
      if (typeof el === 'number') {
        const adj = -el / 1000 * gs.fs * gs.Th; parts.push({ n: el });
        if (adj > 0.2 * gs.fs * gs.Th && chars.length && chars[chars.length - 1].ch !== ' ') chars.push({ ch: ' ', g: -1 });
        u += adj; continue;
      }
      if (!el || el.t !== 's') continue;
      const codes = f.split(el.v); const pi = parts.length; parts.push({ codes, hex: !!el.hex });
      codes.forEach((code, ci) => {
        const w0 = f.width(code);
        const tx = (w0 * gs.fs + gs.Tc + (code === 32 && f.codeLen === 1 && f.subtype !== 'Type0' ? gs.Tw : 0)) * gs.Th;
        const ch = f.uni(code).replace(/[\t\u00a0]/g, ' '); const gi = glyphs.length;
        glyphs.push({ code, u, w: tx, ch, pi, ci }); f.used.add(code);
        for (const c of ch) chars.push({ ch: c, g: gi });
        u += tx;
      });
    }
    Tm = mul([1, 0, 0, 1, u, 0], Tm0);
    const M = mul(Tm0, gs.ctm), P = mul(M, st.toPage);
    const lo = f.descent * gs.fs + gs.Ts, hi = f.ascent * gs.fs + gs.Ts;
    const pts = [apply(P, 0, lo), apply(P, u, lo), apply(P, 0, hi), apply(P, u, hi)];
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const sy = Math.hypot(P[2], P[3]), sx = Math.hypot(P[0], P[1]);
    const run = {
      id: model.runs.length, sid: st.id, oi: model._oi, op: o.op, s: o.s, e: o.e, prefix, f, fk: gs.fk, fs: gs.fs, Tc: gs.Tc, Tw: gs.Tw, Th: gs.Th, Ts: gs.Ts, Tr: gs.Tr, fill: gs.fill,
      Tm0, ctm: gs.ctm, M, P, u, parts, glyphs, chars, text: chars.map(c => c.ch).join(''),
      bbox: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) },
      size: gs.fs * sy, ang: Math.round(Math.atan2(P[1], P[0]) * 180 / Math.PI), skewed: Math.abs(P[0] * P[2] + P[1] * P[3]) > 1e-3 * sx * sy,
    };
    model.runs.push(run);
  };
  for (let oi = 0; oi < st.ops.length; oi++) {
    const o = st.ops[oi], a = o.a; model._oi = oi;
    switch (o.op) {
      case 'q': stack.push({ ...gs }); break;
      case 'Q': if (stack.length) gs = stack.pop(); break;
      case 'cm': if (a.length >= 6) gs.ctm = mul(nums(a, 6), gs.ctm); break;
      case 'g': gs.fill = { sp: 'g', v: nums(a, 1) }; break;
      case 'rg': gs.fill = { sp: 'rg', v: nums(a, 3) }; break;
      case 'k': gs.fill = { sp: 'k', v: nums(a, 4) }; break;
      case 'cs': gs.fill = { sp: 'cs', cs: a[0]?.v, v: [] }; break;
      case 'sc': case 'scn': {
        const v = a.filter(x => typeof x === 'number'); const pat = a.find(x => x?.t === 'n');
        if (gs.fill.sp === 'cs') gs.fill = { ...gs.fill, v, pat: pat?.v };
        else gs.fill = { sp: v.length === 1 ? 'g' : v.length === 3 ? 'rg' : 'k', v };
        break;
      }
      case 'BT': Tm = Tlm = I; break;
      case 'Tc': gs.Tc = +a[0] || 0; break;
      case 'Tw': gs.Tw = +a[0] || 0; break;
      case 'Tz': gs.Th = (+a[0] || 0) / 100; break;
      case 'TL': gs.TL = +a[0] || 0; break;
      case 'Ts': gs.Ts = +a[0] || 0; break;
      case 'Tr': gs.Tr = +a[0] || 0; break;
      case 'Tf': gs.fk = a[0]?.v; gs.fs = +a[1] || 0; gs.font = fontFrom(doc, st.res, gs.fk); break;
      case 'Td': Tlm = mul([1, 0, 0, 1, +a[0] || 0, +a[1] || 0], Tlm); Tm = Tlm; break;
      case 'TD': gs.TL = -(+a[1] || 0); Tlm = mul([1, 0, 0, 1, +a[0] || 0, +a[1] || 0], Tlm); Tm = Tlm; break;
      case 'Tm': if (a.length >= 6) { Tlm = Tm = nums(a, 6); } break;
      case 'T*': Tlm = mul([1, 0, 0, 1, 0, -gs.TL], Tlm); Tm = Tlm; break;
      case 'Tj': show(o, [a[0]], ''); break;
      case 'TJ': show(o, a[0]?.v || [], ''); break;
      case "'": Tlm = mul([1, 0, 0, 1, 0, -gs.TL], Tlm); Tm = Tlm; show(o, [a[0]], 'T*'); break;
      case '"': gs.Tw = +a[0] || 0; gs.Tc = +a[1] || 0; Tlm = mul([1, 0, 0, 1, 0, -gs.TL], Tlm); Tm = Tlm; show(o, [a[2]], `${fmt(gs.Tw)} Tw ${fmt(gs.Tc)} Tc T*`); break;
      case 'Do': {
        if (depth > 6) break;
        const xo = st.res && model.doc.context.lookup(st.res.get(L.PDFName.of('XObject')));
        const ref = xo instanceof L.PDFDict ? xo.get(L.PDFName.of(a[0]?.v || '')) : null; if (!ref) break;
        const xs = model.doc.context.lookup(ref); if (!xs?.dict) break;
        if (nameOf(xs.dict.lookup(L.PDFName.of('Subtype'))) !== 'Form') break;
        const key = ref.toString();
        if (model.forms.has(key)) { model.forms.get(key).uses++; break; }
        const mx = xs.dict.lookup(L.PDFName.of('Matrix')); const fm = mx ? mx.asArray().map(x => numOf(model.doc.context.lookup(x)) || 0) : I;
        let text = ''; try { text = u8ToBin(decodeStream(xs)); } catch { break; }
        const fres = xs.dict.lookup(L.PDFName.of('Resources'));
        const st2 = { id: model.streams.length, kind: 'form', ref, xs, text, ops: tokenize(text), res: fres instanceof L.PDFDict ? fres : st.res, ownRes: fres instanceof L.PDFDict, toPage: mul(fm, mul(gs.ctm, st.toPage)) };
        model.streams.push(st2); model.forms.set(key, { st: st2, uses: 1 });
        const saveOi = model._oi; interpret(model, st2, depth + 1); model._oi = saveOi;
        break;
      }
    }
  }
}

// ------------------------------------------------------------------ lines & paragraph blocks
const rot = (ang, x, y) => { const r = -ang * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [x * c - y * s, x * s + y * c]; };
function buildLines(model) {
  const rs = model.runs.filter(r => r.glyphs.length && r.size > 0.5);
  for (const r of rs) { const [x, y] = rot(r.ang, ...apply(r.P, 0, r.Ts)); const [x1] = rot(r.ang, ...apply(r.P, r.u, r.Ts)); r.fx0 = Math.min(x, x1); r.fx1 = Math.max(x, x1); r.fy = y; }
  rs.sort((a, b) => a.ang - b.ang || b.fy - a.fy || a.fx0 - b.fx0);
  const bands = [];
  for (const r of rs) {
    const b = bands[bands.length - 1];
    if (b && b.ang === r.ang && Math.abs(b.y - r.fy) < 0.3 * Math.max(b.size, r.size)) { b.runs.push(r); b.size = Math.max(b.size, r.size); }
    else bands.push({ ang: r.ang, y: r.fy, size: r.size, runs: [r] });
  }
  const lines = [];
  for (const b of bands) {
    b.runs.sort((p, q) => p.fx0 - q.fx0);
    let cur = null;
    for (const r of b.runs) {
      if (cur && r.sid === cur.sid && r.fx0 <= cur.x1 + 0.9 * Math.max(cur.size, r.size)) {
        const gap = r.fx0 - cur.x1;
        if (gap > 0.15 * r.size && !/\s$/.test(cur.text) && !/^\s/.test(r.text)) { cur.text += ' '; cur.chars.push({ ch: ' ', run: -1 }); }
        cur.runs.push(r); cur.x1 = Math.max(cur.x1, r.fx1); cur.size = Math.max(cur.size, r.size);
      } else { cur = { ang: b.ang, y: b.y, sid: r.sid, runs: [r], x0: r.fx0, x1: r.fx1, size: r.size, text: '', chars: [] }; lines.push(cur); }
      for (const c of r.chars) cur.chars.push({ ch: c.ch, run: r.id, g: c.g });
      cur.text += r.text;
    }
  }
  for (const l of lines) {
    l.y = l.runs.reduce((s, r) => s + r.fy, 0) / l.runs.length;
    const cnt = new Map(); for (const r of l.runs) cnt.set(r.f, (cnt.get(r.f) || 0) + r.glyphs.length);
    l.font = [...cnt].sort((a, b) => b[1] - a[1])[0][0]; l.dom = l.runs.slice().sort((a, b) => b.glyphs.length - a.glyphs.length)[0];
    l.bbox = l.runs.reduce((b, r) => ({ x0: Math.min(b.x0, r.bbox.x0), y0: Math.min(b.y0, r.bbox.y0), x1: Math.max(b.x1, r.bbox.x1), y1: Math.max(b.y1, r.bbox.y1) }), { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 });
    for (const r of l.runs) r.line = l;
  }
  model.lines = lines;
}
const famKey = f => (f.baseName || '').replace(/^[A-Z]{6}\+/, '');
// page-space advance of the first word of a line (for the "would it have fitted on the previous line?" test)
function firstWordW(model, l) {
  let w = 0, started = false;
  for (const c of l.chars) {
    if (c.ch === ' ') { if (started) break; continue; }
    started = true; if (c.run < 0 || c.g < 0) continue; const r = model.runs[c.run]; const g = r.glyphs[c.g];
    w += g.w * Math.hypot(r.P[0], r.P[1]) / Math.max(1, [...g.ch].length);
  }
  return w;
}
function buildBlocks(model) {
  const blocks = [];
  const ls = model.lines.filter(l => l.text.trim()).sort((a, b) => a.ang - b.ang || b.y - a.y || a.x0 - b.x0);
  for (const l of ls) {
    let best = null;
    for (const b of blocks) {
      const last = b.lines[b.lines.length - 1];
      if (b.ang !== l.ang || b.sid !== l.sid) continue;
      const dy = last.y - l.y, sz = Math.max(last.size, l.size);
      if (dy < 0.75 * sz || dy > 1.9 * sz) continue;
      if (Math.abs(last.size - l.size) > 0.13 * sz) continue;
      if (famKey(last.font) !== famKey(l.font)) continue;
      if (b.lead && Math.abs(dy - b.lead) > 0.25 * sz) continue;
      const ov = Math.min(b.x1, l.x1) - Math.max(b.x0, l.x0);
      if (ov < -0.2 * sz) continue;
      const bw = Math.max(b.x1, l.x1) - Math.min(b.x0, l.x0);
      if (bw < 12 * sz) continue; // narrow columns (table cells, labels) are edited line by line
      // hard line break: the next line's first word would have fitted at the end of the previous line
      if ((last.x1 - Math.min(b.x0, l.x0)) + 0.3 * sz + firstWordW(model, l) < bw * 0.97) continue;
      if (!best || dy < best.dy) best = { b, dy };
    }
    if (best) { const b = best.b; if (!b.lead) b.lead = best.dy; b.lines.push(l); b.x0 = Math.min(b.x0, l.x0); b.x1 = Math.max(b.x1, l.x1); }
    else blocks.push({ ang: l.ang, sid: l.sid, lines: [l], x0: l.x0, x1: l.x1 });
  }
  // page text margins (for the alignment of single-line blocks)
  const byAng = new Map(); for (const b of blocks) { if (!byAng.has(b.ang)) byAng.set(b.ang, []); byAng.get(b.ang).push(b); }
  const margins = new Map();
  for (const [ang, bs] of byAng) {
    const xs = bs.flatMap(b => b.lines.map(l => Math.round(l.x0 / 3) * 3)); const cnt = new Map(); xs.forEach(x => cnt.set(x, (cnt.get(x) || 0) + 1));
    const left = [...cnt].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
    const multi = bs.filter(b => b.lines.length > 1); const right = multi.length ? Math.max(...multi.map(b => b.x1)) : Math.max(...bs.map(b => b.x1));
    margins.set(ang, { left, right });
  }
  for (const b of blocks) {
    b.runs = b.lines.flatMap(l => l.runs);
    b.bbox = b.lines.reduce((q, l) => ({ x0: Math.min(q.x0, l.bbox.x0), y0: Math.min(q.y0, l.bbox.y0), x1: Math.max(q.x1, l.bbox.x1), y1: Math.max(q.y1, l.bbox.y1) }), { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 });
    // block text with the run of every character (for keeping bold / italic / colour of unchanged words)
    const chars = [];
    for (const l of b.lines) {
      let lc = l.chars.slice(); while (lc.length && lc[0].ch === ' ') lc.shift(); while (lc.length && lc[lc.length - 1].ch === ' ') lc.pop();
      if (!lc.length) continue;
      if (chars.length) {
        const prev = chars[chars.length - 1];
        if (prev.ch === '­' && /^[a-z]/.test(lc[0].ch)) chars.pop();
        else if (!(prev.ch === '-' && /^[a-z]/.test(lc[0].ch))) chars.push({ ch: ' ', run: prev.run });
      }
      for (const c of lc) chars.push({ ch: c.ch, run: c.run >= 0 ? c.run : (chars[chars.length - 1]?.run ?? lc.find(x => x.run >= 0)?.run) });
    }
    b.chars = chars.filter(c => c.run != null && c.run >= 0); b.text = b.chars.map(c => c.ch).join('');
    const sz = Math.max(...b.lines.map(l => l.size)), tol = 0.6 * sz;
    const L0 = b.lines.map(l => l.x0), R0 = b.lines.map(l => l.x1), C0 = b.lines.map(l => (l.x0 + l.x1) / 2);
    const spread = v => Math.max(...v) - Math.min(...v);
    b.align = 'left';
    if (b.lines.length >= 2) {
      if (spread(L0) < tol) b.align = spread(R0.slice(0, -1)) < 0.2 * sz && (b.lines.length >= 3 || spread(R0) < 0.2 * sz) && b.lines.length >= 2 && !(b.lines.length === 2 && spread(R0) > tol) ? 'justify' : 'left';
      else if (spread(R0) < tol) b.align = 'right';
      else if (spread(C0) < tol) b.align = 'center';
    } else {
      const m = margins.get(b.ang), l = b.lines[0];
      if (Math.abs(l.x0 - m.left) < 0.6 * sz) b.align = 'left';
      else if (Math.abs(l.x1 - m.right) < 0.6 * sz) b.align = 'right';
      else if (Math.abs((l.x0 + l.x1) / 2 - (m.left + m.right) / 2) < 1.2 * sz) b.align = 'center';
    }
    // room available for the new text: single lines may grow up to the margin or the next text on the same line
    b.availW = b.x1 - b.x0;
    if (b.lines.length === 1) {
      const m = margins.get(b.ang), l = b.lines[0];
      const band = model.lines.filter(o => o !== l && o.ang === l.ang && Math.abs(o.y - l.y) < 0.6 * sz && o.text.trim());
      const limR = Math.min(Math.max(m.right, l.x1), ...band.filter(o => o.x0 >= l.x1 - 0.5).map(o => o.x0 - 0.6 * sz));
      const limL = Math.max(Math.min(m.left, l.x0), ...band.filter(o => o.x1 <= l.x0 + 0.5).map(o => o.x1 + 0.6 * sz));
      const c = (l.x0 + l.x1) / 2;
      b.availW = Math.max(b.availW, b.align === 'right' ? l.x1 - limL : b.align === 'center' ? 2 * Math.min(c - limL, limR - c) : limR - l.x0);
    }
    for (const l of b.lines) l.block = b;
  }
  model.blocks = blocks;
}

// ------------------------------------------------------------------ mapping pdf.js text items -> runs
// items: pdf.js getTextContent().items (transform in PDF user space). Returns [{ item, runs: [...] , ok }]
const norm = s => s.replace(/\s+/g, '').normalize('NFKC');
export function mapItems(model, items) {
  return items.filter(it => it.str && it.str.trim()).map(it => {
    const [a, b, , , e, f] = it.transform; const sz = Math.hypot(it.transform[2], it.transform[3]) || Math.hypot(a, b) || 10;
    const ang = Math.round(Math.atan2(b, a) * 180 / Math.PI);
    const [ix, iy] = rot(ang, e, f); const ix1 = ix + (it.width || 0);
    const cand = model.runs.filter(r => r.glyphs.length && Math.abs(r.ang - ang) <= 1 && Math.abs(r.fy - iy) < 0.5 * sz && r.fx1 > ix - 0.3 * sz && r.fx0 < ix1 + 0.3 * sz);
    const want = norm(it.str), got = norm(cand.map(r => r.text).join(''));
    return { item: it, runs: cand, ok: !!want && got.includes(want) };
  });
}
// runs/lines/blocks hit by a PDF-space rectangle (e.g. a clicked text-layer span)
export function hitTest(model, rect) {
  const cx = (rect.x0 + rect.x1) / 2, cy = (rect.y0 + rect.y1) / 2, sh = Math.max(1, (rect.y1 - rect.y0) * 0.25);
  const inR = r => r.bbox.x0 - 1 <= rect.x1 && r.bbox.x1 + 1 >= rect.x0 && r.bbox.y0 - sh <= cy && r.bbox.y1 + sh >= cy;
  let runs = model.runs.filter(r => r.glyphs.length && r.line && inR(r));
  if (!runs.length) return null;
  runs.sort((a, b) => Math.hypot((a.bbox.x0 + a.bbox.x1) / 2 - cx, (a.bbox.y0 + a.bbox.y1) / 2 - cy) - Math.hypot((b.bbox.x0 + b.bbox.x1) / 2 - cx, (b.bbox.y0 + b.bbox.y1) / 2 - cy));
  const line = runs[0].line; return { run: runs[0], line, block: line.block || { lines: [line], runs: line.runs, text: line.text.trim(), bbox: line.bbox, align: 'left', ang: line.ang, sid: line.sid } };
}

// ------------------------------------------------------------------ writing
const litStr = codes => '(' + codes.map(c => { const ch = String.fromCharCode(c & 255); if (ch === '(' || ch === ')' || ch === '\\') return '\\' + ch; if (c < 32 || c > 126) return '\\' + (c & 255).toString(8).padStart(3, '0'); return ch; }).join('') + ')';
const hexStr = (codes, len) => '<' + codes.map(c => c.toString(16).padStart(len * 2, '0')).join('') + '>';
const codeBytes = (f, c) => { if (f.identity || !f.ranges) return 2; const r = f.ranges.find(q => c >= q.lo && c <= q.hi); return r ? r.len : (c > 255 ? 2 : 1); };
const strOf = (codes, f, hex) => f.subtype === 'Type0' ? '<' + codes.map(c => c.toString(16).padStart(codeBytes(f, c) * 2, '0')).join('') + '>' : hex ? hexStr(codes, 1) : litStr(codes);
const fillOps = fill => {
  if (!fill) return '0 g';
  if (fill.sp === 'g') return `${fmt(fill.v[0] ?? 0)} g`;
  if (fill.sp === 'rg') return `${fill.v.map(fmt).join(' ')} rg`;
  if (fill.sp === 'k') return `${fill.v.map(fmt).join(' ')} k`;
  if (fill.sp === 'cs') return `/${fill.cs} cs ${fill.v.map(fmt).join(' ')}${fill.pat ? ' /' + fill.pat : ''} scn`;
  return '0 g';
};
export const fillToCss = fill => {
  const c = v => Math.round(Math.max(0, Math.min(1, v)) * 255);
  if (!fill) return '#000000';
  if (fill.sp === 'g') return `rgb(${c(fill.v[0])},${c(fill.v[0])},${c(fill.v[0])})`;
  if (fill.sp === 'rg') return `rgb(${c(fill.v[0])},${c(fill.v[1])},${c(fill.v[2])})`;
  if (fill.sp === 'k' || (fill.sp === 'cs' && fill.v.length === 4)) { const [C, M, Y, K] = fill.v; return `rgb(${c((1 - C) * (1 - K))},${c((1 - M) * (1 - K))},${c((1 - Y) * (1 - K))})`; }
  if (fill.sp === 'cs' && fill.v.length === 3) return `rgb(${c(fill.v[0])},${c(fill.v[1])},${c(fill.v[2])})`;
  if (fill.sp === 'cs' && fill.v.length === 1) return `rgb(${c(fill.v[0])},${c(fill.v[0])},${c(fill.v[0])})`;
  return '#000000';
};
const hexToFill = hx => { const n = parseInt((hx || '#000000').slice(1), 16); return { sp: 'rg', v: [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] }; };

// Output font: { key, kind: 'same'|'std'|'custom', name, items(str) -> TJ items, width(str, fs, Tc, Th) }
const COMPLEX = /[\u0590-\u08ff\u0900-\u0dff\u0e00-\u0eff\u0f00-\u0fff\u1000-\u109f\u1780-\u17ff]/;
export const needsShaping = t => COMPLEX.test(t);
function sameFont(f, fk, spaceEm = 0.3333) {
  const hasSpace = f.codeFor(' ') != null;
  return {
    kind: 'same', key: fk, name: famKey(f), f,
    can: text => !COMPLEX.test(text) && [...text].every(ch => ch === '\n' || (ch === ' ' || ch === '\u00a0' ? true : f.codeFor(ch) != null)),
    items: text => { const out = []; let cur = []; for (const ch of text) { if ((ch === ' ' || ch === '\u00a0') && !hasSpace) { if (cur.length) out.push(cur), cur = []; out.push(-spaceEm * 1000); } else { const c = f.codeFor(ch === '\u00a0' ? ' ' : ch); if (c != null) cur.push(c); } } if (cur.length) out.push(cur); return out.map(x => typeof x === 'number' ? x : strOf(x, f, false)); },
    width: (text, fs, Tc, Th) => { let w = 0; for (const ch of text) { if ((ch === ' ' || ch === '\u00a0') && !hasSpace) { w += spaceEm * fs * Th; continue; } const c = f.codeFor(ch === '\u00a0' ? ' ' : ch); if (c == null) continue; w += (f.width(c) * fs + Tc) * Th; } return w; },
  };
}
function libFont(pf, key, kind, name) {
  return {
    kind, key, name, pf,
    can: text => { const t = text.replace(/\n/g, ''); const fk = pf.embedder?.font; if (fk?.hasGlyphForCodePoint) return [...t].every(ch => /\s/.test(ch) || fk.hasGlyphForCodePoint(ch.codePointAt(0))); try { pf.encodeText(t); return true; } catch { return false; } },
    items: text => [pf.encodeText(text).toString()],
    width: (text, fs, Tc, Th) => (pf.widthOfTextAtSize(text, fs) + Tc * [...text].length) * Th,
  };
}

export class TextEditor {
  constructor(doc, opts = {}) {
    this.doc = doc; this.models = new Map(); this.runEdits = new Map(); this.appends = new Map(); this.fontNames = new Map(); this.libFonts = new Map(); this.notes = [];
    this.fontkit = opts.fontkit || null; this.customFont = opts.customFont || null; // { bytes, name }
    this.resolveFont = opts.resolveFont || null; // async (familyName, font) => bytes of an installed font with that name
  }
  page(i) { if (!this.models.has(i)) this.models.set(i, analyzePage(this.doc, i)); return this.models.get(i); }
  streamKey(model, sid) { const st = model.streams[sid]; return st.kind === 'form' ? 'f' + st.ref.toString() : 'p' + model.pageIndex; }
  // ---- glyph-level edits
  editRun(model, run) { const k = this.streamKey(model, run.sid) + '#' + run.oi + '@' + run.s; let e = this.runEdits.get(k); if (!e) this.runEdits.set(k, e = { model, run, g: new Map() }); return e; }
  removeRuns(model, runs) { for (const r of runs) { const e = this.editRun(model, r); r.glyphs.forEach((_, gi) => e.g.set(gi, { del: true })); } }
  // ---- resources / fonts for appended text
  resOf(model, sid) {
    const L = PL(); const st = model.streams[sid];
    if (st.kind === 'page') { const n = model.page.node; let r = n.Resources(); if (!r) { r = this.doc.context.obj({}); n.set(L.PDFName.of('Resources'), r); } return r; }
    if (!st.ownRes) { const r = this.doc.context.obj({}); st.xs.dict.set(L.PDFName.of('Resources'), r); st.res = r; st.ownRes = true; const pr = model.page.node.Resources(); if (pr) for (const [k, v] of pr.entries()) r.set(k, v); }
    return st.res;
  }
  fontName(res, ref, hint = 'F') {
    const L = PL(); const ctx = this.doc.context;
    let fd = ctx.lookup(res.get(L.PDFName.of('Font'))); if (!(fd instanceof L.PDFDict)) { fd = ctx.obj({}); res.set(L.PDFName.of('Font'), fd); }
    for (const [k, v] of fd.entries()) if (v === ref || v?.toString() === ref.toString()) return k.asString().slice(1);
    let i = 1, nm; do nm = 'BTS' + hint + (i++); while (fd.get(L.PDFName.of(nm))); fd.set(L.PDFName.of(nm), ref); return nm;
  }
  // candidate fonts for new text, in order of preference: the original font, a font the user chose, the same
  // family installed on this computer, the nearest standard font
  async candidates(model, sid, srcFont, srcKey, pref = {}) {
    const mode = pref.mode || 'auto'; const out = [];
    if (mode === 'auto' && !pref.fallbackOnly && srcKey && srcFont && !srcFont.type3 && !srcFont.vertical && srcFont.decodable) out.push(sameFont(srcFont, srcKey));
    const embed = async (k, bytes) => { let pf = this.libFonts.get(k); if (pf === undefined) { try { this.doc.registerFontkit(this.fontkit); pf = await this.doc.embedFont(bytes, { subset: true }); } catch (e) { pf = null; this.notes.push('font:' + e.message); } this.libFonts.set(k, pf); } return pf; };
    if ((mode === 'custom' || mode === 'auto') && this.customFont && this.fontkit) {
      const pf = await embed('custom:' + this.customFont.name, this.customFont.bytes);
      if (pf) out.push(libFont(pf, this.fontName(this.resOf(model, sid), pf.ref, 'C'), 'custom', this.customFont.name));
    }
    if (mode === 'auto' && srcFont && this.resolveFont && this.fontkit) {
      const fam = famKey(srcFont); const k = 'local:' + fam;
      let pf = this.libFonts.get(k);
      if (pf === undefined) { const bytes = await this.resolveFont(fam, srcFont).catch(() => null); pf = bytes ? await embed(k, bytes) : null; this.libFonts.set(k, pf); }
      if (pf) out.push(libFont(pf, this.fontName(this.resOf(model, sid), pf.ref, 'L'), 'local', fam));
    }
    const st = pref.family ? { family: pref.family, bold: !!pref.bold, italic: !!pref.italic } : srcFont ? stdFallback(srcFont) : { family: 'Helvetica', bold: !!pref.bold, italic: !!pref.italic };
    const nm = stdFontName(st); let pf = this.libFonts.get(nm);
    if (!pf) { pf = await this.doc.embedFont(nm); this.libFonts.set(nm, pf); }
    out.push(libFont(pf, this.fontName(this.resOf(model, sid), pf.ref, 'S'), 'std', nm));
    return out;
  }
  async outFont(model, sid, srcFont, srcKey, text, pref = {}) {
    const cands = await this.candidates(model, sid, srcFont, srcKey, pref);
    const hit = cands.find(c => c.can(text)); if (hit) return hit;
    // pick per character: report what nobody can write
    const bad = [...new Set([...text].filter(ch => ch !== '\n' && !/\s/.test(ch) && !cands.some(c => c.can(ch))))].join('');
    if (!bad) return cands[0];
    throw Object.assign(new Error('NEED_FONT'), { code: 'NEED_FONT', chars: bad });
  }
  append(model, sid, text) { const k = this.streamKey(model, sid); if (!this.appends.has(k)) this.appends.set(k, { model, sid, parts: [] }); this.appends.get(k).parts.push(text); }

  // ---- rewrite a block (paragraph or line) with new text, reflowed inside the original width.
  // Unchanged characters keep their own font, size and colour (bold / italic words survive an edit).
  async writeBlock(model, block, newText, pref = {}) {
    const runs = block.runs; this.removeRuns(model, runs);
    const t = (newText ?? '').replace(/\r/g, '').replace(/ /g, ' ');
    if (!t.trim()) return { deleted: true };
    const dom = runs.slice().sort((a, b) => b.glyphs.length - a.glyphs.length)[0];
    const R = dom.M, Ri = inv(R);
    const fr = block.lines.map(l => { const us = l.runs.flatMap(r => [apply(Ri, ...apply(r.M, 0, 0)), apply(Ri, ...apply(r.M, r.u, 0))]); return { u0: Math.min(...us.map(p => p[0])), u1: Math.max(...us.map(p => p[0])), v: us.reduce((s, p) => s + p[1], 0) / us.length }; });
    const U0 = Math.min(...fr.map(x => x.u0)), W = Math.max(...fr.map(x => x.u1)) - U0, V0 = fr[0].v;
    const lead = fr.length > 1 ? (fr[0].v - fr[fr.length - 1].v) / (fr.length - 1) : 1.2 * dom.fs;
    // styles of the original characters
    const styles = [], sk = new Map();
    const sIdx = r => { const k = [r.fk, r.fs, fillOps(r.fill), r.Tc, r.Th, r.Ts, r.Tr].join('|'); if (!sk.has(k)) { sk.set(k, styles.length); styles.push({ f: r.f, fk: r.fk, fs: r.fs, fill: pref.color ? hexToFill(pref.color) : r.fill, Tc: r.Tc, Th: r.Th, Ts: r.Ts, Tr: r.Tr === 3 ? 0 : r.Tr, text: '' }); } return sk.get(k); };
    const domS = sIdx(dom);
    const oc = (block.chars?.length ? block.chars : block.runs.flatMap(r => r.chars.map(c => ({ ch: c.ch, run: r.id })))).map(c => ({ ch: c.ch, s: sIdx(model.runs[c.run]) }));
    const old = oc.map(c => c.ch).join('');
    let p = 0; while (p < old.length && p < t.length && old[p] === t[p]) p++;
    let q = 0; while (q < old.length - p && q < t.length - p && old[old.length - 1 - q] === t[t.length - 1 - q]) q++;
    const mid = p > 0 ? oc[p - 1].s : (oc[0]?.s ?? domS);
    const chars = []; for (let i = 0; i < t.length; i++) chars.push({ ch: t[i], s: i < p ? oc[i].s : i >= t.length - q ? oc[old.length - (t.length - i)].s : mid });
    // per word: the first candidate font that can draw it (original font, chosen font, installed font, standard font)
    const variant = new Map(); const fonts = [];
    for (const si of new Set(chars.map(c => c.s))) {
      const st = styles[si]; const cands = await this.candidates(model, dom.sid, st.f, st.fk, pref);
      const vIdx = ci => { const k = si + ':' + ci; if (!variant.has(k)) { variant.set(k, styles.length); styles.push({ ...st, font: cands[ci], text: '' }); } return variant.get(k); };
      let lastV = null; const pendingSpaces = [];
      for (let i = 0; i < chars.length;) {
        if (chars[i].s !== si) { i++; continue; }
        if (chars[i].ch === ' ' || chars[i].ch === '\n') { if (lastV != null) chars[i].s = lastV; else pendingSpaces.push(i); i++; continue; }
        let j = i; while (j < chars.length && chars[j].s === si && chars[j].ch !== ' ' && chars[j].ch !== '\n') j++;
        const word = chars.slice(i, j).map(c => c.ch).join('');
        let ci = cands.findIndex(c => c.can(word));
        if (ci < 0) { const bad = [...new Set([...word].filter(ch => !cands.some(c => c.can(ch))))].join(''); if (bad) throw Object.assign(new Error('NEED_FONT'), { code: 'NEED_FONT', chars: bad }); ci = cands.length - 1; }
        lastV = vIdx(ci); for (let k = i; k < j; k++) chars[k].s = lastV;
        while (pendingSpaces.length) chars[pendingSpaces.pop()].s = lastV;
        i = j;
      }
      if (pendingSpaces.length) { const v = vIdx(0); while (pendingSpaces.length) chars[pendingSpaces.pop()].s = v; }
    }
    for (const c of chars) if (c.ch !== '\n') styles[c.s].text += c.ch;
    const used = new Set(chars.map(c => c.s));
    for (const si of used) if (styles[si].font.kind !== 'same') fonts.push(styles[si].font.name);
    const Wp = (block.x1 ?? block.bbox.x1) - (block.x0 ?? block.bbox.x0), Wwrap = block.availW && Wp > 0 ? Math.max(W, block.availW * W / Wp) : W;
    let lines = this.layoutStyled(chars, styles, block.align === 'justify' ? W : Wwrap, block.align, W), squeeze = 1;
    // optionally keep the original number of lines by condensing slightly (used by Replace everywhere)
    if (pref.keepLines && lines.length > block.lines.length && block.lines.length > 1) {
      for (const sq of (pref.keepLines === 'soft' ? [0.98, 0.96, 0.94] : [0.97, 0.94, 0.91, 0.88, 0.85])) { styles.forEach(st => st._Th = st._Th ?? st.Th); styles.forEach(st => st.Th = st._Th * sq); const l2 = this.layoutStyled(chars, styles, block.align === 'justify' ? W : Wwrap, block.align, W); if (l2.length <= block.lines.length) { lines = l2; squeeze = sq; break; } }
      if (squeeze === 1) styles.forEach(st => { if (st._Th) st.Th = st._Th; });
    }
    let out = 'q BT 0 Tw\n'; let curS = -1;
    lines.forEach((ln, k) => {
      const u = block.align === 'right' ? U0 + W - ln.w : block.align === 'center' ? U0 + (W - ln.w) / 2 : U0;
      out += `${mul([1, 0, 0, 1, u, V0 - k * lead], R).map(fmt).join(' ')} Tm`;
      for (const sg of ln.segs) {
        const st = styles[sg.s];
        if (sg.s !== curS) { curS = sg.s; out += ` /${st.font.key} ${fmt(st.fs)} Tf ${fillOps(st.fill)} ${fmt(st.Tc)} Tc ${fmt(st.Th * 100)} Tz ${fmt(st.Ts)} Ts ${st.Tr} Tr`; }
        out += ' ' + this.segShow(st.font, sg.text, ln.extra ? -ln.extra / (st.fs * st.Th) * 1000 : 0);
      }
      out += '\n';
    });
    out += 'ET Q';
    this.append(model, dom.sid, out);
    const kinds = new Set([...used].map(si => styles[si].font.kind));
    return { lines: lines.length, grew: Math.max(0, lines.length - block.lines.length), leadPage: lead * Math.hypot(R[2], R[3]) * Math.hypot(model.streams[dom.sid].toPage[2], model.streams[dom.sid].toPage[3]), fallback: kinds.has('std'), otherFont: fonts.length > 0, fontName: fonts[0] || famKey(dom.f), fonts: [...new Set(fonts)], kinds: [...kinds], squeeze };
  }
  layoutStyled(chars, styles, W, align, Wj = W) {
    const segW = (s, txt) => { const st = styles[s]; return st.font.width(txt, st.fs, st.Tc, st.Th); };
    const tokW = tok => { let w = 0, i = 0; while (i < tok.length) { let j = i; while (j < tok.length && tok[j].s === tok[i].s) j++; w += segW(tok[i].s, tok.slice(i, j).map(c => c.ch).join('')); i = j; } return w; };
    const out = []; let para = [];
    const paras = []; for (const c of chars) { if (c.ch === '\n') { paras.push(para); para = []; } else para.push(c); } paras.push(para);
    for (const pc of paras) {
      const toks = []; let cur = []; for (const c of pc) { if ((c.ch === ' ') !== (cur[0]?.ch === ' ') && cur.length) { toks.push(cur); cur = []; } cur.push(c); } if (cur.length) toks.push(cur);
      let line = [], lw = 0;
      const push = last => { while (line.length && line[line.length - 1][0].ch === ' ') { lw -= tokW(line.pop()); } const flat = line.flat(); const spaces = flat.filter(c => c.ch === ' ').length; const extra = align === 'justify' && !last && spaces ? (Wj - lw) / spaces : 0; out.push(this.segsOf(flat, lw + extra * spaces, extra)); line = []; lw = 0; };
      for (const tk of toks) {
        const w = tokW(tk);
        if (tk[0].ch === ' ') { if (line.length) { line.push(tk); lw += w; } continue; }
        if (line.length && lw + w > W * 1.002) push(false);
        line.push(tk); lw += w;
      }
      push(true);
    }
    return out;
  }
  segsOf(flat, w, extra) { const segs = []; for (const c of flat) { const l = segs[segs.length - 1]; if (l && l.s === c.s) l.text += c.ch; else segs.push({ s: c.s, text: c.ch }); } return { segs, w, extra }; }
  segShow(font, text, kern) {
    if (!text) return '';
    if (!kern) { const it = font.items(text); return it.length === 1 && typeof it[0] === 'string' ? `${it[0]} Tj` : `[${it.map(x => typeof x === 'number' ? fmt(x) : x).join(' ')}] TJ`; }
    const items = []; text.split(' ').forEach((w, i) => { if (i) { items.push(...font.items(' '), kern); } if (w) items.push(...font.items(w)); });
    return `[${items.map(x => typeof x === 'number' ? fmt(x) : x).join(' ')}] TJ`;
  }
  layout(font, text, W, fs, Tc, Th, align) {
    const out = [];
    for (const para of text.split('\n')) {
      const words = para.split(/ +/); let cur = '';
      const push = (s, last) => out.push({ s, w: font.width(s, fs, Tc, Th), justify: align === 'justify' && !last && /\s/.test(s), W });
      if (!para) { out.push({ s: '', w: 0, W }); continue; }
      for (const w of words) { const cand = cur ? cur + ' ' + w : w; if (cur && font.width(cand, fs, Tc, Th) > W * 1.002) { push(cur, false); cur = w; } else cur = cand; }
      push(cur, true);
    }
    return out;
  }
  tj(font, ln, fs, Th) {
    if (!ln.s) return '';
    if (!ln.justify) { const it = font.items(ln.s); return it.length === 1 && typeof it[0] === 'string' ? `${it[0]} Tj` : `[${it.map(x => typeof x === 'number' ? fmt(x) : x).join(' ')}] TJ`; }
    const words = ln.s.split(' '); const extra = (ln.W - ln.w) / Math.max(1, words.length - 1); const k = -extra / (fs * Th) * 1000;
    const items = []; words.forEach((w, i) => { if (i) { items.push(...font.items(' ')); items.push(k); } items.push(...font.items(w)); });
    return `[${items.map(x => typeof x === 'number' ? fmt(x) : x).join(' ')}] TJ`;
  }
  // ---- new paragraph (x, y = top-left in page space; w = wrap width)
  async addParagraph(model, { x, y, w = 300, text, size = 12, color = '#000000', family = 'Helvetica', bold = false, italic = false, align = 'left', custom = false }) {
    const sid = 0; const pref = custom && this.customFont ? { mode: 'custom' } : { mode: 'std', family, bold, italic };
    const font = await this.outFont(model, sid, null, null, text, pref);
    const lines = this.layout(font, text, w, size, 0, 1, align); const lead = size * 1.2;
    let out = `q BT /${font.key} ${fmt(size)} Tf ${fillOps(hexToFill(color))}\n`;
    lines.forEach((ln, k) => { const u = align === 'right' ? x + w - ln.w : align === 'center' ? x + (w - ln.w) / 2 : x; out += `1 0 0 1 ${fmt(u)} ${fmt(y - size * 0.85 - k * lead)} Tm ${this.tj(font, ln, size, 1)}\n`; });
    out += 'ET Q'; this.append(model, sid, out);
    return { font, lines: lines.length };
  }
  // ---- find & replace in content streams
  async replaceAll(find, repl, { matchCase = false, wholeWord = false, pages = null, pref = {} } = {}) {
    if (!find) return { count: 0, fallback: 0, skipped: 0, pages: [], reflowed: 0 };
    const esc = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
    const re = new RegExp(wholeWord ? `(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])` : esc, 'gu' + (matchCase ? '' : 'i'));
    let count = 0, fallback = 0, skipped = 0, reflowed = 0; const hitPages = [];
    const n = this.doc.getPageCount();
    for (let pi = 0; pi < n; pi++) {
      if (pages && !pages.includes(pi)) continue;
      const model = this.page(pi); let here = 0; const rewrite = new Set(); const inplace = [];
      for (const line of model.lines) {
        const s = line.chars.map(c => c.ch).join('');
        for (const m of s.matchAll(re)) {
          const cs = line.chars.slice(m.index, m.index + m[0].length).filter(c => c.run >= 0 && c.g >= 0);
          if (!cs.length) continue;
          const runs = [...new Set(cs.map(c => c.run))].map(id => model.runs[id]);
          if (runs.some(r => r.f.type3 || r.f.vertical || r.Tr === 3 || !r.f.decodable)) { skipped++; continue; }
          const r0 = runs[0];
          // simple case: inside one run, same font has the glyphs, and nothing after it on the line gets overlapped
          if (runs.length === 1 && repl) {
            const sf = await this.outFont(model, r0.sid, r0.f, r0.fk, repl, pref).catch(() => null);
            const gs = [...new Set(cs.map(c => c.g))]; const oldW = gs.reduce((w, g) => w + r0.glyphs[g].w, 0);
            const newW = sf ? sf.width(repl, r0.fs, r0.Tc, r0.Th) : 1e9;
            const after = line.runs.some(r => r !== r0 && r.fx0 > r0.fx0 && r.text.trim());
            if (sf && sf.kind === 'same' && (!after || newW <= oldW * 1.02)) { inplace.push({ r0, gs, items: sf.items(repl), line }); continue; }
          }
          if (!repl && runs.length === 1) { inplace.push({ r0, gs: [...new Set(cs.map(c => c.g))], items: null, line }); continue; }
          if (line.block) rewrite.add(line.block); else skipped++;
        }
      }
      for (const ip of inplace) {
        if (ip.line.block && rewrite.has(ip.line.block)) continue;
        const ed = this.editRun(model, ip.r0);
        for (const g of ip.gs) ed.g.set(g, ip.items ? { del: true, nokern: true } : { del: true });
        if (ip.items) ed.g.set(ip.gs[0], { codes: ip.items, squeeze: 1 });
        count++; here++;
      }
      for (const b of rewrite) {
        const k = (b.text.match(re) || []).length; if (!k) { skipped++; continue; }
        try { const r = await this.writeBlock(model, b, b.text.replace(re, repl), { ...pref, keepLines: true }); if (r.fallback) fallback += k; }
        catch (e) { if (e.code === 'NEED_FONT') throw e; skipped += k; continue; }
        count += k; here += k; reflowed++;
      }
      if (here) hitPages.push(pi);
    }
    return { count, fallback, skipped, pages: hitPages, reflowed };
  }
  // ---- turn glyph edits into new operator text
  runText(run, edits) {
    const f = run.f, scale = -1000 / ((run.fs * run.Th) || 1);
    const segs = []; let items = [];
    // consecutive kerns are merged, so the widths of removed letters cannot be read back from the file
    const kern = n => { const l = items[items.length - 1]; if (typeof l === 'number') items[items.length - 1] = l + n; else items.push(n); };
    const flush = () => { const it = items.filter(x => typeof x !== 'number' || Math.abs(x) >= 0.0005).map(x => typeof x === 'number' ? fmt(x) : x); if (it.length) segs.push(`[${it.join(' ')}] TJ`); items = []; };
    let gi = 0;
    for (const p of run.parts) {
      if (p.n != null) { kern(p.n); continue; }
      let cur = []; const out = () => { if (cur.length) items.push(strOf(cur, f, p.hex)); cur = []; };
      for (let ci = 0; ci < p.codes.length; ci++, gi++) {
        const e = edits.get(gi); const g = run.glyphs[gi];
        if (!e) { cur.push(g.code); continue; }
        out();
        if (e.codes) {
          const its = e.codes.map(x => typeof x === 'number' ? fmt(x) : x);
          if (e.squeeze !== 1) { flush(); segs.push(`${fmt(run.Th * 100 * e.squeeze)} Tz`); items.push(...its); flush(); segs.push(`${fmt(run.Th * 100)} Tz`); }
          else items.push(...its);
          continue;
        }
        if (e.del && !e.nokern) kern(g.w * scale);
      }
      out();
    }
    flush();
    const body = segs.join(' ') || '[] TJ';
    return (run.prefix ? run.prefix + ' ' : '') + body;
  }
  // ---- write all modified streams back into the document
  commit() {
    const L = PL(); const ctx = this.doc.context;
    const byStream = new Map();
    for (const [, e] of this.runEdits) { const k = this.streamKey(e.model, e.run.sid); if (!byStream.has(k)) byStream.set(k, { model: e.model, sid: e.run.sid, reps: [] }); byStream.get(k).reps.push({ s: e.run.s, e: e.run.e, t: this.runText(e.run, e.g) }); }
    for (const [k, a] of this.appends) if (!byStream.has(k)) byStream.set(k, { model: a.model, sid: a.sid, reps: [] });
    // content refs used by each page (to detect shared streams)
    const pageRefs = new Map(); this.doc.getPages().forEach((p, i) => { const c = ctx.lookup(p.node.get(L.PDFName.of('Contents'))); const refs = c instanceof L.PDFArray ? c.asArray() : [p.node.get(L.PDFName.of('Contents'))]; pageRefs.set(i, refs.filter(Boolean).map(r => r.toString())); });
    for (const [k, s] of byStream) {
      const st = s.model.streams[s.sid];
      let text = st.text; s.reps.sort((a, b) => b.s - a.s);
      for (const r of s.reps) text = text.slice(0, r.s) + r.t + text.slice(r.e);
      const ap = this.appends.get(k);
      if (ap) {
        let depth = 0; for (const o of st.ops) { if (o.op === 'q') depth++; else if (o.op === 'Q' && depth > 0) depth--; }
        let inBT = false; for (const o of st.ops) { if (o.op === 'BT') inBT = true; else if (o.op === 'ET') inBT = false; }
        text = 'q\n' + text + (inBT ? '\nET' : '') + '\n' + 'Q'.repeat(depth + 1).split('').join('\n') + '\n' + ap.parts.join('\n') + '\n';
      }
      const bytes = binToU8(text);
      if (st.kind === 'page') {
        const node = s.model.page.node; const refs = st.refs;
        const others = new Set([...pageRefs].filter(([i]) => i !== s.model.pageIndex).flatMap(([, r]) => r));
        const ns = ctx.flateStream(bytes);
        if (refs.length && !others.has(refs[0].toString())) { ctx.assign(refs[0], ns); node.set(L.PDFName.of('Contents'), refs[0]); }
        else node.set(L.PDFName.of('Contents'), ctx.register(ns));
        for (const r of refs.slice(1)) if (!others.has(r.toString())) ctx.delete(r);
      } else {
        const ns = ctx.flateStream(bytes);
        for (const [kk, v] of st.xs.dict.entries()) { const nm = kk.asString(); if (!['/Filter', '/DecodeParms', '/Length', '/DL'].includes(nm)) ns.dict.set(kk, v); }
        ctx.assign(st.ref, ns);
      }
    }
    return byStream.size;
  }
}
