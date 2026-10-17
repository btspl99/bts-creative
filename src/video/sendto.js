// BTS Video — File › Send to: the current program frame to BTS Photo (PNG), a contact-sheet PDF of the markers
// (or evenly spaced frames) to PDF Pro, and receiving images / SVG sent from the other apps (added to the Project
// panel and placed on the timeline at the playhead).
'use strict';
async function frameCanvas(t, w = PJ.seq.w, hh = PJ.seq.h) {
  ST.t = t; await prepareStill(t); // ST.t = t so no preview refresh re-seeks the media to the old playhead meanwhile const c = document.createElement('canvas'); c.width = PJ.seq.w; c.height = PJ.seq.h; renderAt(c.getContext('2d'), t, 1);
  if (w === PJ.seq.w && hh === PJ.seq.h) return c; const s = document.createElement('canvas'); s.width = w; s.height = hh; s.getContext('2d').drawImage(c, 0, 0, w, hh); return s;
}
const canvasBytes = async (c, type = 'image/png', q) => UI.blobToU8(await new Promise(r => c.toBlob(r, type, q)));
const baseName = () => PJ.name.replace(/\.btsvid$/, '').replace(/[\\/:*?"<>|]+/g, '_') || 'BTS Video';
async function sendFrameToPhoto() {
  if (!PJ.clips.length) return toast('The timeline is empty', 'err');
  setStatus('Rendering frame…'); const c = await frameCanvas(ST.t); drawFrame(); const data = await canvasBytes(c);
  const payload = { kind: 'image', name: `${baseName()} ${tc(ST.t).replace(/:/g, '-')}.png`, mime: 'image/png', data, meta: { from: 'video', time: ST.t, width: c.width, height: c.height } };
  await bts.handoff.send('photo', payload); setStatus('Ready'); toast('Frame sent to BTS Photo', 'ok'); return payload;
}
let jspdfP = null;
function loadJsPDF() { if (window.jspdf) return Promise.resolve(window.jspdf); return jspdfP || (jspdfP = new Promise((res, rej) => { const s = document.createElement('script'); s.src = '../vendor/jspdf.umd.min.js'; s.onload = () => res(window.jspdf); s.onerror = () => { jspdfP = null; rej(new Error('jsPDF could not be loaded')); }; document.head.append(s); })); }
// times for the contact sheet: the markers, or 12 frames spread evenly over the sequence
function contactSheetTimes(n = 12) {
  const D = seqDuration(); if (PJ.markers.length) return PJ.markers.filter(mk => mk.t < D).map(mk => ({ t: mk.t, label: mk.label || '' }));
  return Array.from({ length: n }, (_, i) => ({ t: Math.min(D - 1 / PJ.seq.fps, (i + 0.5) * D / n), label: '' }));
}
async function sendContactSheetToPdf() {
  if (!PJ.clips.length) return toast('The timeline is empty', 'err');
  const { jsPDF } = await loadJsPDF(); const items = contactSheetTimes(); if (!items.length) return toast('Nothing to put on the contact sheet', 'err');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }); const PW = 297, PH = 210, M = 12, cols = 3, gap = 6;
  const cw = (PW - 2 * M - (cols - 1) * gap) / cols, ch = cw * PJ.seq.h / PJ.seq.w; const rowH = ch + 11; const rows = Math.max(1, Math.floor((PH - 2 * M - 12) / rowH)); const per = cols * rows;
  const tw = 640, th = Math.max(2, Math.round(tw * PJ.seq.h / PJ.seq.w)); const pm = progressModal('Contact sheet'); const keepT = ST.t; pause();
  try {
    for (let i = 0; i < items.length; i++) {
      if (EXP.cancel) break; pm.set(i / items.length, `Rendering frame ${i + 1} of ${items.length}`);
      if (i % per === 0) { if (i) pdf.addPage(); pdf.setFontSize(13); pdf.setTextColor(20); pdf.text(baseName(), M, M + 2); pdf.setFontSize(8.5); pdf.setTextColor(110); pdf.text(`${PJ.seq.w}×${PJ.seq.h} · ${PJ.seq.fps} fps · ${tc(seqDuration())} · BTS Video`, PW - M, M + 2, { align: 'right' }); }
      const k = i % per, x = M + (k % cols) * (cw + gap), y = M + 8 + Math.floor(k / cols) * rowH;
      const c = await frameCanvas(items[i].t, tw, th); pdf.addImage(c.toDataURL('image/jpeg', 0.85), 'JPEG', x, y, cw, ch); pdf.setDrawColor(180); pdf.rect(x, y, cw, ch);
      pdf.setFontSize(8.5); pdf.setTextColor(30); pdf.text(tc(items[i].t), x, y + ch + 4.5); if (items[i].label) { pdf.setTextColor(90); pdf.text(String(items[i].label).slice(0, 60), x + 26, y + ch + 4.5); }
    }
  } finally { pm.close(); EXP.cancel = false; seek(keepT); }
  const data = new Uint8Array(pdf.output('arraybuffer'));
  const payload = { kind: 'pdf', name: `${baseName()} contact sheet.pdf`, mime: 'application/pdf', data, meta: { from: 'video', frames: items.length, markers: PJ.markers.length > 0 } };
  await bts.handoff.send('pdf', payload); toast('Contact sheet sent to PDF Pro', 'ok'); return payload;
}
// ---------------------------------------------------------------------  receiving
async function rasteriseSvg(bytes, W, H) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/svg+xml' }));
  try { const im = new Image(); im.src = url; await im.decode(); const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const iw = im.naturalWidth || W, ih = im.naturalHeight || H; const k = Math.min(W / iw, H / ih); x.drawImage(im, (W - iw * k) / 2, (H - ih * k) / 2, iw * k, ih * k); return c; }
  finally { URL.revokeObjectURL(url); }
}
async function receiveHandoff(p) {
  if (!p || !p.data) return null; let bytes = p.data instanceof Uint8Array ? p.data : new Uint8Array(p.data); let name = String(p.name || 'received').replace(/[\\/:*?"<>|]+/g, '_');
  const isSvg = p.kind === 'svg' || /svg/i.test(p.mime || '') || /\.svg$/i.test(name);
  if (isSvg) { const c = await rasteriseSvg(bytes, PJ.seq.w, PJ.seq.h); bytes = await canvasBytes(c); name = name.replace(/\.svg$/i, '') + '.png'; }
  else if (p.kind !== 'image' && !/^image\//.test(p.mime || '')) { toast('BTS Video can receive images and SVG drawings', 'err'); return null; }
  if (!/\.(png|jpe?g|webp|gif|bmp)$/i.test(name)) name += /jpe?g/.test(p.mime || '') ? '.jpg' : '.png';
  const path = await bts.ffmpeg.tmpWrite(`recv-${Date.now().toString(36)}-${name}`, bytes);
  const m = await importPath(path, name); if (!m || m.missing) return null; m.gen = 'handoff';
  const at = ST.t; const c = clipFromMedia(m, freeTrack('video', at, PREFS.imgDur, PJ.clips.length ? 'V2' : 'V1'), at); placeClip(c, 'overwrite');
  select([c.id]); commit('Receive ' + (isSvg ? 'drawing' : 'image')); renderBin(); drawFrame(); toast(`Added ${name} at the playhead`, 'ok'); return c;
}
async function takeHandoff() { try { const p = await bts.handoff.take(); if (p) return await receiveHandoff(p); } catch (e) { console.error(e); toast('Could not receive the item: ' + e.message, 'err'); } return null; }
