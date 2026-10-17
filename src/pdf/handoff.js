// Send between BTS Creative apps (File › Send to) and receiving a payload on start-up.
import { X } from './ctx.js';

const base = () => (X.S.fileName || 'document.pdf').replace(/\.pdf$/i, '');
async function pageBytes(pg) { return new Uint8Array(await X.buildPdf({ pages: [pg] })); }
export async function renderPng(pdfBytes, dpi = 200) {
  const js = await X.pdfjsLib.getDocument({ data: pdfBytes.slice(), isEvalSupported: false }).promise;
  const pg = await js.getPage(1); const vp = pg.getViewport({ scale: dpi / 72 });
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
  await pg.render({ canvasContext: cx, viewport: vp }).promise; js.destroy();
  return { data: await UI.blobToU8(await new Promise(r => c.toBlob(r, 'image/png'))), width: c.width, height: c.height };
}
export async function sendToPhoto() {
  const pg = X.curPage(); if (!pg) return UI.toast('Open a PDF first');
  const n = X.S.pages.indexOf(pg) + 1; UI.toast('Sending the page to Photo…');
  const png = await renderPng(await pageBytes(pg), 200);
  const payload = { kind: 'image', name: `${base()}-page${n}.png`, mime: 'image/png', data: png.data, meta: { dpi: 200, width: png.width, height: png.height, from: 'pdf', page: n } };
  await bts.handoff.send('photo', payload); return payload;
}
export async function sendToVector() {
  const pg = X.curPage(); if (!pg) return UI.toast('Open a PDF first');
  const n = X.S.pages.indexOf(pg) + 1; UI.toast('Sending the page to Vector…');
  const payload = { kind: 'pdf', name: `${base()}-page${n}.pdf`, mime: 'application/pdf', data: await pageBytes(pg), meta: { from: 'pdf', page: n } };
  await bts.handoff.send('vector', payload); return payload;
}
// an SVG rasterised at 2x, on a page the size of the drawing
async function svgToPdf(svgBytes) {
  const txt = new TextDecoder().decode(svgBytes);
  const url = URL.createObjectURL(new Blob([txt], { type: 'image/svg+xml' }));
  try {
    const img = await X.loadImg(url);
    let w = img.naturalWidth || img.width, hh = img.naturalHeight || img.height;
    if (!w || !hh) { const m = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(txt); w = m ? +m[1] : 800; hh = m ? +m[2] : 600; }
    const c = document.createElement('canvas'); c.width = Math.round(w * 2); c.height = Math.round(hh * 2);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const png = await UI.blobToU8(await new Promise(r => c.toBlob(r, 'image/png')));
    const { PDFDocument } = window.PDFLib; const d = await PDFDocument.create(); const im = await d.embedPng(png);
    const pw = w * 0.75, ph = hh * 0.75; d.addPage([pw, ph]).drawImage(im, { x: 0, y: 0, width: pw, height: ph });
    return new Uint8Array(await d.save());
  } finally { URL.revokeObjectURL(url); }
}
export async function receive(p) {
  if (!p) return false;
  const data = p.data instanceof Uint8Array ? p.data : new Uint8Array(p.data?.buffer ? p.data.buffer : p.data || []);
  const stem = (p.name || 'Received').replace(/\.[a-z0-9]+$/i, '');
  try {
    if (p.kind === 'pdf') await X.openDoc(data, /\.pdf$/i.test(p.name || '') ? p.name : stem + '.pdf', null);
    else if (p.kind === 'image') { const ext = /png/.test(p.mime || '') ? 'png' : /jpe?g/.test(p.mime || '') ? 'jpg' : /webp/.test(p.mime || '') ? 'webp' : (p.name || '').split('.').pop() || 'png'; await X.openDoc(new Uint8Array(await X.imagesToPdf([{ name: `${stem}.${ext}`, data }])), stem + '.pdf', null); }
    else if (p.kind === 'svg') await X.openDoc(await svgToPdf(data), stem + '.pdf', null);
    else { UI.toast('Unsupported item received', 'err'); return false; }
    X.markDirty(); UI.toast(`Received ${p.name || 'item'}`, 'ok');
    return true;
  } catch (e) { console.error(e); UI.toast('Could not open the received item: ' + e.message, 'err', 6000); return false; }
}
export async function takeOnStartup() {
  if (!window.bts?.handoff?.take) return false;
  try { const p = await bts.handoff.take(); if (p) return receive(p); } catch (e) { console.warn('handoff', e); }
  return false;
}
