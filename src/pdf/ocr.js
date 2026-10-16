// OCR for BTS PDF Pro — Tesseract (tesseract.js 7, Apache-2.0) bundled locally, works fully offline.
// Recognised words are written into the PDF as an invisible text layer (render mode 3) using a
// glyph-less Type0 font with a ToUnicode map, so Hindi/Marathi (Devanagari) text is searchable too.
import { X, localUrl, progress, copyText as clip } from './ctx.js';

export const LANGS = [['eng', 'English'], ['hin', 'Hindi (हिन्दी)'], ['mar', 'Marathi (मराठी)']];
let results = {}; // page number (1-based, after OCR) -> { text, words, langs }
export function reset() { results = {}; }
export function hasResults() { return Object.keys(results).length > 0; }
export function getResults() { return results; }
export function setResults(r) { results = r || {}; }

let Tess = null;
const SIMD_TEST = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
export async function createWorker(langs, logger) {
  if (!Tess) { const m = await import('../vendor/pdf-tesseract/tesseract.esm.min.js'); Tess = m.default || m; }
  const base = localUrl('../vendor/pdf-tesseract/');
  let simd = false; try { simd = WebAssembly.validate(SIMD_TEST); } catch { }
  return Tess.createWorker(langs.join('+'), 1 /* LSTM */, {
    workerPath: base + 'worker.min.js', corePath: base + (simd ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js'),
    langPath: base + 'lang', workerBlobURL: false, cacheMethod: 'none', gzip: true, logger: logger || (() => { }),
  });
}

export async function ocrDialog() {
  const { S, form, toast } = { S: X.S, form: UI.form, toast: UI.toast };
  if (!S.pages.length) {
    // no document: let the user pick scans/images, then OCR them
    const fs = await X.IO.open({ multi: true, filters: [{ name: 'Scanned PDF or images', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }] });
    if (!fs) return; await X.openFiles(fs); if (!S.pages.length) return;
  }
  const cur = X.currentPageIdx() + 1;
  const v = await form({ title: 'Recognize text (OCR)', width: 460, ok: 'Recognize', fields: [
    ...LANGS.map(([k, l], i) => ({ key: 'lang_' + k, label: l, type: 'checkbox', value: i === 0 || (localStorage.getItem('bts.ocr.' + k) === '1') })),
    { key: 'pages', label: 'Pages', type: 'select', value: 'all', options: [{ value: 'all', label: `All pages (${S.pages.length})` }, { value: 'cur', label: `Current page (${cur})` }, { value: 'range', label: 'Page range…' }] },
    { key: 'range', label: 'Range (e.g. 1-3, 6)', value: `1-${S.pages.length}` },
    { key: 'dpi', label: 'Quality', type: 'select', value: '300', options: [{ value: '200', label: 'Standard (200 dpi, faster)' }, { value: '300', label: 'High (300 dpi, more accurate)' }] },
    { key: 'skip', label: 'Skip pages that already contain text', type: 'checkbox', value: true },
  ] });
  if (!v) return;
  const langs = LANGS.map(([k]) => k).filter(k => v['lang_' + k]);
  LANGS.forEach(([k]) => { try { localStorage.setItem('bts.ocr.' + k, v['lang_' + k] ? '1' : '0'); } catch { } });
  if (!langs.length) return toast('Choose at least one language', 'err');
  const idx = v.pages === 'cur' ? [cur - 1] : v.pages === 'range' ? X.parseRange(v.range, S.pages.length) : S.pages.map((_, i) => i);
  if (!idx.length) return toast('No valid pages', 'err');
  return runOcr({ langs, pages: idx, dpi: +v.dpi, skipText: v.skip });
}

// Recognise pages; returns { pages: n, words: n } and rebuilds the document with an invisible text layer
export async function runOcr({ langs = ['eng'], pages, dpi = 300, skipText = true, apply = true, quiet = false } = {}) {
  const S = X.S; pages = pages || S.pages.map((_, i) => i);
  const prog = quiet ? { set() { }, close() { }, cancelled: false } : progress('Recognizing text (OCR)');
  let worker = null; const found = {}; let nWords = 0, done = 0, skipped = 0;
  try {
    prog.set('Loading OCR engine (' + langs.join(' + ') + ')…', 0.02);
    worker = await createWorker(langs, m => { if (m.status === 'recognizing text') prog.set(null, (done + m.progress) / pages.length); });
    for (const i of pages) {
      if (prog.cancelled) break;
      const pg = S.pages[i];
      if (skipText && (await X.pageText(pg)).str.replace(/\s/g, '').length > 25) { skipped++; done++; continue; }
      prog.set(`Page ${i + 1} — rendering…`, done / pages.length);
      await X.ensureJs(pg);
      let scale = dpi / 72; const vp0 = X.viewportOf(pg, 1); const maxSide = 5000;
      if (Math.max(vp0.width, vp0.height) * scale > maxSide) scale = maxSide / Math.max(vp0.width, vp0.height);
      const vp = X.viewportOf(pg, scale);
      const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
      await pg._js.render({ canvasContext: cx, viewport: vp }).promise;
      prog.set(`Page ${i + 1} — recognizing text…`);
      const r = await worker.recognize(c, {}, { blocks: true, text: true });
      const words = extractWords(r.data, vp);
      found[i] = { text: (r.data.text || '').trim(), words, langs };
      nWords += words.length; done++;
      prog.set(`Page ${i + 1} — ${words.length} words`, done / pages.length);
    }
  } catch (e) {
    console.error(e); prog.close(); if (worker) worker.terminate().catch(() => { });
    UI.toast('OCR failed: ' + (e.message || e), 'err', 7000); return { error: String(e.message || e) };
  }
  await worker.terminate().catch(() => { });
  const cancelled = prog.cancelled; prog.close();
  const keys = Object.keys(found);
  if (!keys.length) { if (!quiet) UI.toast(skipped ? 'All selected pages already contain text — nothing to recognise.' : 'No text was recognised.', '', 5000); return { pages: 0, words: 0, skipped }; }
  if (apply) {
    await X.rebase(doc => addTextLayer(doc, found), { label: 'OCR' });
  }
  for (const k of keys) results[+k + 1] = found[k];
  S.textCache = {};
  if (!quiet) UI.toast(`Recognised ${nWords} words on ${keys.length} page(s)${cancelled ? ' (cancelled early)' : ''}. Text is now searchable and selectable — save to keep it.`, 'ok', 6000);
  return { pages: keys.length, words: nWords, skipped };
}

// tesseract result → words in PDF user space: { t, ox, oy (baseline start), ux, uy (direction), w, fs }
function extractWords(data, vp) {
  const out = [];
  const P = (x, y) => vp.convertToPdfPoint(x, y);
  for (const b of data.blocks || []) for (const par of b.paragraphs || []) for (const ln of par.lines || []) {
    const bl = ln.baseline; const lb = ln.bbox;
    for (const w of ln.words || []) {
      const t = (w.text || '').trim(); if (!t || w.confidence < 5) continue;
      const { x0, y0, x1, y1 } = w.bbox; const cxp = (x0 + x1) / 2;
      let by = y1;
      if (bl && bl.x1 !== bl.x0) { const yb = bl.y0 + (bl.y1 - bl.y0) * (cxp - bl.x0) / (bl.x1 - bl.x0); if (yb > y0 && yb <= y1 + 2) by = yb; }
      const top = Math.min(y0, lb ? lb.y0 : y0);
      const a = P(x0, by), b = P(x1, by), tp = P(x0, top);
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      const hgt = Math.hypot(tp[0] - a[0], tp[1] - a[1]);
      out.push({ t, ox: a[0], oy: a[1], ux: dx / len, uy: dy / len, w: len, fs: Math.max(2, hgt * 1.05) });
    }
  }
  return out;
}

// ---------- invisible text layer (pdf-lib)
function hex4(n) { return n.toString(16).padStart(4, '0').toUpperCase(); }
function utf16hex(str) { let s = ''; for (const ch of str) { const cp = ch.codePointAt(0); if (cp > 0xffff) { const v = cp - 0x10000; s += hex4(0xd800 + (v >> 10)) + hex4(0xdc00 + (v & 0x3ff)); } else s += hex4(cp); } return s; }
export function glyphlessFont(doc, chars) {
  const { PDFName, PDFString } = window.PDFLib; const ctx = doc.context;
  const cids = new Map(); [...chars].forEach(ch => { if (!cids.has(ch)) cids.set(ch, cids.size + 1); });
  const entries = [...cids].map(([ch, cid]) => `<${hex4(cid)}> <${utf16hex(ch)}>`);
  let cm = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
  for (let i = 0; i < entries.length; i += 100) { const ch = entries.slice(i, i + 100); cm += `${ch.length} beginbfchar\n${ch.join('\n')}\nendbfchar\n`; }
  cm += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n';
  const toUni = ctx.register(ctx.flateStream(cm));
  const fd = ctx.register(ctx.obj({ Type: 'FontDescriptor', FontName: 'GlyphLessFont', Flags: 5, FontBBox: [0, 0, 500, 1000], ItalicAngle: 0, Ascent: 1000, Descent: 0, CapHeight: 1000, StemV: 80 }));
  const desc = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'CIDFontType2', BaseFont: 'GlyphLessFont', CIDSystemInfo: ctx.obj({ Registry: PDFString.of('Adobe'), Ordering: PDFString.of('Identity'), Supplement: 0 }), FontDescriptor: fd, DW: 500, CIDToGIDMap: 'Identity' }));
  const font = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'Type0', BaseFont: 'GlyphLessFont', Encoding: 'Identity-H', DescendantFonts: [desc], ToUnicode: toUni }));
  return { ref: font, cids };
}
// append a content stream (wrapping the existing content in q/Q so its graphics state cannot leak)
export function appendStream(doc, page, ops) {
  const { PDFName, PDFArray, PDFRef, pushGraphicsState, popGraphicsState } = window.PDFLib; const ctx = doc.context;
  const node = page.node; const C = node.get(PDFName.of('Contents'));
  const old = !C ? [] : C instanceof PDFArray ? C.asArray() : [C];
  const q = ctx.register(ctx.contentStream([pushGraphicsState()])), Q = ctx.register(ctx.contentStream([popGraphicsState()]));
  const mine = ctx.register(ctx.flateStream(ops.map(o => o.toString()).join('\n')));
  node.set(PDFName.of('Contents'), ctx.obj([q, ...old, Q, mine]));
}
export function addTextLayer(doc, found) {
  const { PDFName, PDFHexString, beginText, endText, setFontAndSize, setTextMatrix, showText, setTextRenderingMode, TextRenderingMode, setCharacterSqueeze, pushGraphicsState, popGraphicsState } = window.PDFLib;
  let chars = ''; Object.values(found).forEach(f => f.words.forEach(w => chars += w.t));
  if (!chars) return;
  const font = glyphlessFont(doc, chars); const pages = doc.getPages();
  for (const [i, f] of Object.entries(found)) {
    const page = pages[+i]; if (!page || !f.words.length) continue;
    const key = page.node.newFontDictionary('OCRGL', font.ref);
    const ops = [pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible)];
    for (const w of f.words) {
      const n = [...w.t].length; const natural = n * 0.5 * w.fs; const tz = Math.max(1, Math.min(1000, 100 * w.w / natural));
      const hex = [...w.t].map(ch => hex4(font.cids.get(ch))).join('');
      ops.push(setFontAndSize(key, w.fs), setCharacterSqueeze(tz), setTextMatrix(w.ux, w.uy, -w.uy, w.ux, w.ox, w.oy), showText(PDFHexString.of(hex)));
    }
    ops.push(endText(), popGraphicsState());
    appendStream(doc, page, ops);
  }
}

export function allText() {
  return Object.keys(results).sort((a, b) => a - b).map(k => `--- Page ${k} ---\n${results[k].text}`).join('\n\n');
}
export async function copyText() {
  if (!hasResults()) return UI.toast('Run OCR first (Tools › Recognize text)');
  await clip(allText()); UI.toast('Recognised text copied to the clipboard', 'ok');
}
export async function exportText() {
  if (!hasResults()) return UI.toast('Run OCR first (Tools › Recognize text)');
  const base = (X.S.fileName || 'document.pdf').replace(/\.pdf$/i, '');
  const p = await X.IO.saveAs({ data: new TextEncoder().encode(allText()), defaultPath: base + '-ocr.txt', filters: [{ name: 'Text', extensions: ['txt'] }] });
  if (p) UI.toast('Recognised text saved', 'ok');
  return p;
}
