// Shared context between BTS PDF Pro modules. app.js fills this in at start-up;
// feature modules (ocr.js, reading.js, docops.js, review.js, annots.js) read from it
// lazily (inside functions), so import order does not matter.
export const X = {};

// Small helpers shared by several modules
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const today = (fmt = 'dd/mm/yyyy', d = new Date()) => {
  const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0'), yyyy = String(d.getFullYear());
  const mon = d.toLocaleString('en', { month: 'short' });
  return fmt.replace('dd', dd).replace('mm', mm).replace('yyyy', yyyy).replace('Mon', mon);
};
export function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return res();
    const s = document.createElement('script'); s.src = src; s.dataset.src = src;
    s.onload = () => res(); s.onerror = () => rej(new Error('Could not load ' + src)); document.head.append(s);
  });
}
// absolute filesystem path of a file shipped next to this module (works in dev and inside app.asar)
export function localPath(rel) {
  const u = new URL(rel, import.meta.url);
  let p = decodeURIComponent(u.pathname);
  if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1); // Windows drive letter
  return p;
}
export const localUrl = rel => new URL(rel, import.meta.url).href;
export async function copyText(txt) {
  try { await navigator.clipboard.writeText(txt); return true; } catch { }
  const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.append(ta); ta.select();
  const ok = document.execCommand('copy'); ta.remove(); return ok;
}
// progress modal with cancel; returns { set(text, frac), close(), cancelled }
export function progress(title) {
  const { h } = UI;
  const bar = h('div', { class: 'pp-bar' }, h('div', { class: 'pp-fill' }));
  const txt = h('div', { class: 'muted', style: { marginBottom: '8px', minHeight: '18px' } }, 'Starting…');
  const st = { cancelled: false };
  const back = h('div', { class: 'modal-back' });
  const m = h('div', { class: 'modal', style: { width: '440px' } }, h('div', { class: 'm-h' }, title), h('div', { class: 'm-b' }, txt, bar),
    h('div', { class: 'm-f' }, h('button', { class: 'btn', onclick: () => { st.cancelled = true; txt.textContent = 'Cancelling…'; } }, 'Cancel')));
  back.append(m); document.body.append(back);
  st.set = (t, f) => { if (t != null) txt.textContent = t; if (f != null) bar.firstChild.style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + '%'; };
  st.close = () => back.remove();
  return st;
}
// fraction of a text item's width covered by its first i characters (proportional-font estimate)
let _mctx = null;
export function textFrac(str, i) {
  if (!str || i <= 0) return 0; if (i >= str.length) return 1;
  if (!_mctx) { _mctx = document.createElement('canvas').getContext('2d'); _mctx.font = '100px Helvetica, Arial, sans-serif'; }
  const all = _mctx.measureText(str).width; if (!all) return i / str.length;
  return _mctx.measureText(str.slice(0, i)).width / all;
}

// ---------- tiny ZIP writer (store / no compression) used for .xlsx — enough for Office & LibreOffice
let _crcT = null;
function crc32(u8) {
  if (!_crcT) { _crcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; _crcT[n] = c >>> 0; } }
  let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = _crcT[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;
}
// files: [{ name, data: string | Uint8Array }] -> Uint8Array
export function zipStore(files) {
  const enc = new TextEncoder(); const parts = []; const central = []; let off = 0;
  const d = new Date(); const dt = ((d.getFullYear() - 1980) << 9 | (d.getMonth() + 1) << 5 | d.getDate()) & 0xffff, tm = (d.getHours() << 11 | d.getMinutes() << 5 | (d.getSeconds() >> 1)) & 0xffff;
  for (const f of files) {
    const name = enc.encode(f.name); const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data; const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true); lh.setUint16(10, tm, true); lh.setUint16(12, dt, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true); ch.setUint16(12, tm, true); ch.setUint16(14, dt, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    parts.push(new Uint8Array(lh.buffer), name, data); central.push(new Uint8Array(ch.buffer), name);
    off += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)]; const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}
export const xmlEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
export const csvCell = s => { s = String(s ?? ''); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export const toCsv = rows => '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
export const baseName = () => ((X.S && X.S.fileName) || 'document.pdf').replace(/\.pdf$/i, '');
// render one app page (with its rotation / crop) to a canvas at the given scale
export async function renderPageCanvas(pg, scale) {
  await X.ensureJs(pg); const vp = X.viewportOf(pg, scale);
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.floor(vp.width)); c.height = Math.max(1, Math.floor(vp.height));
  const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
  await pg._js.render({ canvasContext: cx, viewport: vp, annotationMode: X.pdfjsLib.AnnotationMode.ENABLE }).promise;
  return c;
}
// lay out text blocks as new PDF pages (Helvetica; lines Helvetica cannot encode, e.g. Devanagari, are drawn as images)
export async function textPdf(blocks, { size = [595.28, 841.89], margin = 56 } = {}) {
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib; const d = await PDFDocument.create();
  const F = { r: await d.embedFont(StandardFonts.Helvetica), b: await d.embedFont(StandardFonts.HelveticaBold) };
  const [W, H] = size; const maxW = W - 2 * margin; let p = null, y = 0;
  const newPage = () => { p = d.addPage([W, H]); y = H - margin; };
  const canEnc = (f, t) => { try { f.encodeText(t); return true; } catch { return false; } };
  const measure = document.createElement('canvas').getContext('2d');
  const wrap = (txt, sz, font, ok) => { const out = []; for (const para of String(txt).split('\n')) { let line = ''; for (const w of para.split(/\s+/)) { const t = line ? line + ' ' + w : w; let tw; if (ok) tw = font.widthOfTextAtSize(t, sz); else { measure.font = `${sz}px Helvetica, Arial, sans-serif`; tw = measure.measureText(t).width; } if (tw > maxW && line) { out.push(line); line = w; } else line = t; } out.push(line); } return out; };
  newPage();
  for (const b of blocks) {
    const sz = b.size || 11, font = b.bold ? F.b : F.r, lh = sz * 1.35; const col = b.color ? rgb(...b.color) : rgb(0.08, 0.08, 0.1);
    if (b.pageBreak && y < H - margin - 1) newPage();
    y -= b.before || 0;
    const ok = canEnc(font, b.text);
    for (const ln of wrap(b.text, sz, font, ok)) {
      if (y - lh < margin) newPage();
      const x = margin + (b.indent || 0);
      if (ok) p.drawText(ln, { x, y: y - sz, size: sz, font, color: col });
      else if (ln.trim()) {
        const sc = 4, c = document.createElement('canvas'); measure.font = `${b.bold ? 700 : 400} ${sz}px Helvetica, Arial, sans-serif`; const tw = Math.min(maxW, measure.measureText(ln).width + 4);
        c.width = Math.ceil(tw * sc); c.height = Math.ceil(lh * sc); const x2 = c.getContext('2d'); x2.scale(sc, sc); x2.fillStyle = '#16161a'; x2.font = measure.font; x2.textBaseline = 'alphabetic'; x2.fillText(ln, 0, sz);
        const png = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer()); const img = await d.embedPng(png);
        p.drawImage(img, { x, y: y - lh + sz * 0.1, width: tw, height: lh });
      }
      y -= lh;
    }
    y -= b.after ?? sz * 0.5;
  }
  d.setProducer('BTS PDF Pro (BTS Creative)');
  return d.save();
}
