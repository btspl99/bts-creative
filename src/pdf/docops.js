// Document-level operations for BTS PDF Pro: save-time hooks (background, links, bookmarks, page labels,
// language, metadata, tab order, comment replies), protect/unprotect, convert (images→PDF, PDF→Word),
// enhance scan, watermark, header/footer/Bates, background, crop/resize/replace/reverse pages,
// optimize, flatten, remove metadata and an accessibility check.
import { X, today, loadScript, localUrl, progress } from './ctx.js';
import { appendStream } from './ocr.js';
import { applyA11y } from './a11y.js';

const L = () => window.PDFLib;
const { h } = UI;
const PAGE_SIZES = { A4: [595.28, 841.89], Letter: [612, 792], Legal: [612, 1008], A3: [841.89, 1190.55], A5: [419.53, 595.28] };
const mm = v => v * 72 / 25.4;
const baseName = () => (X.S.fileName || 'document.pdf').replace(/\.pdf$/i, '');
function pagesFrom(which, range) {
  const S = X.S;
  if (which === 'cur') return [X.currentPageIdx()];
  if (which === 'range') return X.parseRange(range || '', S.pages.length);
  if (which === 'odd') return S.pages.map((_, i) => i).filter(i => i % 2 === 0);
  if (which === 'even') return S.pages.map((_, i) => i).filter(i => i % 2 === 1);
  return S.pages.map((_, i) => i);
}
const pageChoice = (val = 'all') => ({ key: 'which', label: 'Pages', type: 'select', value: val, options: [{ value: 'all', label: 'All pages' }, { value: 'cur', label: 'Current page' }, { value: 'odd', label: 'Odd pages' }, { value: 'even', label: 'Even pages' }, { value: 'range', label: 'Page range…' }] });
const rangeField = () => ({ key: 'range', label: 'Range (e.g. 1-3, 5) — used when "Page range" is chosen', value: `1-${X.S.pages.length}` });

// =====================================================================================  save-time hooks
export async function postBuild(out, finalPages, { flatten, form }) {
  const S = X.S; const { PDFName, PDFString, PDFHexString, PDFNumber, PDFArray, PDFDict, PDFNull, PDFRef } = L(); const ctx = out.context;
  const pageRefs = finalPages.map(([p]) => p.ref);
  if (flatten) {
    for (const [p, pg] of finalPages) {
      for (const a of pg.annots) {
        if (a.type === 'bg') await drawBackground(out, p, a);
        else if (a.type === 'link') addLink(out, p, a, pageRefs);
      }
      await writeReplies(out, p, pg);
    }
  }
  // tab order of existing (and new) widgets
  if (S.tabOrder) for (const [p, pg] of finalPages) { const order = S.tabOrder[pg.id]; if (order?.length) reorderWidgets(out, p, order); }
  if (S.flattenForms) { try { form.flatten(); } catch (e) { console.warn('flatten', e); } }
  if (S.outline !== undefined) writeOutline(out, finalPages, S.outline || []);
  if (S.pageLabels !== undefined) writePageLabels(out, S.pageLabels);
  if (S.lang) out.catalog.set(PDFName.of('Lang'), PDFString.of(S.lang));
  if (S.meta?.title) { try { out.setTitle(S.meta.title, { showInWindowTitleBar: true }); } catch { } }
  if (S.stripMeta) {
    try { const info = out.getInfoDict(); for (const k of info.keys()) info.delete(k); } catch (e) { console.warn(e); }
    out.catalog.delete(PDFName.of('Metadata')); out.catalog.delete(PDFName.of('PieceInfo'));
    for (const [p] of finalPages) { p.node.delete(PDFName.of('PieceInfo')); p.node.delete(PDFName.of('Metadata')); }
  }
  if (S.a11y) applyA11y(out, finalPages, S.a11y);
  pruneDangling(out);
}
// pdf-lib's form.flatten() (and page removal) can leave references to deleted widget objects in
// /Annots and /AcroForm /Fields; strict readers (poppler, Acrobat) report "Invalid XRef entry".
export function pruneDangling(out) {
  const { PDFName, PDFArray, PDFRef, PDFDict } = L(); const ctx = out.context;
  const alive = r => !(r instanceof PDFRef) || ctx.lookup(r) !== undefined;
  for (const p of out.getPages()) {
    const A = p.node.lookup(PDFName.of('Annots'));
    if (A instanceof PDFArray) { const keep = A.asArray().filter(alive); if (keep.length !== A.size()) { if (keep.length) p.node.set(PDFName.of('Annots'), ctx.obj(keep)); else p.node.delete(PDFName.of('Annots')); } }
  }
  const af = out.catalog.lookup(PDFName.of('AcroForm'));
  if (af instanceof PDFDict) {
    const prune = arr => arr.filter(r => {
      if (!alive(r)) return false; const d = ctx.lookup(r); if (!(d instanceof PDFDict)) return true;
      const K = d.lookup(PDFName.of('Kids'));
      if (K instanceof PDFArray) { const kk = prune(K.asArray()); if (!kk.length && !d.get(PDFName.of('Rect'))) { if (r instanceof PDFRef) ctx.delete(r); return false; } d.set(PDFName.of('Kids'), ctx.obj(kk)); }
      return true;
    });
    const F = af.lookup(PDFName.of('Fields'));
    if (F instanceof PDFArray) { const kept = prune(F.asArray()); af.set(PDFName.of('Fields'), ctx.obj(kept)); if (!kept.length) out.catalog.delete(PDFName.of('AcroForm')); }
  }
}
function prependStream(doc, page, ops) {
  const { PDFName, PDFArray } = L(); const ctx = doc.context; const node = page.node; const C = node.get(PDFName.of('Contents'));
  const old = !C ? [] : C instanceof PDFArray ? C.asArray() : [C];
  const mine = ctx.register(ctx.flateStream(ops.map(o => o.toString()).join('\n')));
  node.set(PDFName.of('Contents'), ctx.obj([mine, ...old]));
}
async function drawBackground(doc, page, a) {
  const { pushGraphicsState, popGraphicsState, setFillingRgbColor, rectangle, fill, setGraphicsState, concatTransformationMatrix, drawObject, clip, endPath, PDFName } = L();
  const ops = [pushGraphicsState()]; const ctx = doc.context; const op = a.opacity ?? 1;
  if (op < 1) { const gs = page.node.newExtGState('BtsBgGS', ctx.obj({ Type: 'ExtGState', ca: op, CA: op })); ops.push(setGraphicsState(gs)); }
  ops.push(rectangle(a.x, a.y, a.w, a.h), clip(), endPath());
  if (a.color) { const [r, g, b] = X.hexArr(a.color); ops.push(setFillingRgbColor(r, g, b), rectangle(a.x, a.y, a.w, a.h), fill()); }
  if (a.src) {
    const bytes = await X.dataUrlBytes(a.src); const img = a.src.startsWith('data:image/jp') ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
    const name = page.node.newXObject('BtsBgImg', img.ref);
    let w = a.w, hh = a.h, x = a.x, y = a.y;
    if (a.fit !== 'stretch') { const s = (a.fit === 'contain' ? Math.min : Math.max)(a.w / img.width, a.h / img.height); w = img.width * s; hh = img.height * s; x = a.x + (a.w - w) / 2; y = a.y + (a.h - hh) / 2; }
    ops.push(pushGraphicsState(), concatTransformationMatrix(w, 0, 0, hh, x, y), drawObject(name), popGraphicsState());
  }
  ops.push(popGraphicsState());
  prependStream(doc, page, ops);
}
function addLink(doc, page, a, pageRefs) {
  const { PDFString, PDFName } = L(); const ctx = doc.context;
  const d = { Type: 'Annot', Subtype: 'Link', Rect: [a.x, a.y, a.x + a.w, a.y + a.h], Border: [0, 0, 0], F: 4 };
  if (a.page) { const r = pageRefs[a.page - 1]; if (!r) return; d.Dest = [r, PDFName.of('Fit')]; }
  else if (a.url) d.A = ctx.obj({ Type: 'Action', S: 'URI', URI: PDFString.of(normUrl(a.url)) });
  else return;
  page.node.addAnnot(ctx.register(ctx.obj(d)));
}
export const normUrl = u => /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : /^[^\s@]+@[^\s@]+$/.test(u) ? 'mailto:' + u : 'https://' + u;
async function writeReplies(doc, page, pg) {
  const { PDFHexString, PDFString, PDFName } = L(); const ctx = doc.context;
  for (const a of pg.annots) {
    if (!(a.replies?.length || a.status === 'resolved' || (a.comment && a.type !== 'note'))) continue;
    let parent = X.noteRefs?.get(a);
    const b = X.bbox(a);
    if (!parent) {
      parent = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [b.x, b.y + b.h - 18, b.x + 18, b.y + b.h], Contents: PDFHexString.fromText(a.comment || a.text || ''), T: PDFHexString.fromText(a.author || X.S.author), Name: 'Comment', Open: false, F: 4 + 2, C: X.hexArr(a.color && a.color.startsWith('#') ? a.color : '#ffd400') }));
      page.node.addAnnot(parent);
    }
    for (const r of a.replies || []) {
      page.node.addAnnot(ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [b.x, b.y + b.h - 18, b.x + 18, b.y + b.h], Contents: PDFHexString.fromText(r.text), T: PDFHexString.fromText(r.author || ''), IRT: parent, RT: 'R', F: 4 + 2, Open: false, M: PDFString.of(X.pdfDate(new Date(r.date || Date.now()))) })));
    }
    if (a.status === 'resolved') page.node.addAnnot(ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: [b.x, b.y + b.h - 18, b.x + 18, b.y + b.h], Contents: PDFHexString.fromText('Completed'), T: PDFHexString.fromText(a.resolvedBy || X.S.author), IRT: parent, State: PDFString.of('Completed'), StateModel: PDFString.of('Review'), F: 4 + 2 + 32 })));
  }
}
function reorderWidgets(doc, page, order) {
  const { PDFName, PDFArray, PDFDict, PDFString, PDFHexString } = L(); const ctx = doc.context;
  const arr = page.node.Annots(); if (!arr) return;
  const items = arr.asArray().map(ref => { const d = ctx.lookup(ref); let name = null; if (d instanceof PDFDict && d.get(PDFName.of('Subtype'))?.toString() === '/Widget') { let n = d; while (n && !name) { const t = n.get(PDFName.of('T')); if (t) name = (t.decodeText ? t.decodeText() : t.toString()); const par = n.get(PDFName.of('Parent')); n = par ? ctx.lookup(par) : null; } } return { ref, name }; });
  const pos = n => { const i = order.indexOf(n); return i < 0 ? 1e6 : i; };
  const widgets = items.filter(i => i.name != null).sort((a, b) => pos(a.name) - pos(b.name)); const others = items.filter(i => i.name == null);
  page.node.set(PDFName.of('Annots'), ctx.obj([...widgets.map(w => w.ref), ...others.map(o => o.ref)]));
  page.node.delete(PDFName.of('Tabs')); // no /Tabs → viewers follow the Annots order
}
function writeOutline(out, finalPages, items) {
  const { PDFName, PDFHexString, PDFNumber, PDFNull } = L(); const ctx = out.context;
  out.catalog.delete(PDFName.of('Outlines'));
  if (!items.length) return;
  const idToRef = new Map(finalPages.map(([p, pg]) => [pg.id, p.ref]));
  const rootRef = ctx.nextRef();
  const build = (list, parentRef) => {
    const refs = list.map(() => ctx.nextRef()); let count = 0;
    list.forEach((it, i) => {
      const d = ctx.obj({ Title: PDFHexString.fromText(it.title || 'Untitled'), Parent: parentRef });
      if (i > 0) d.set(PDFName.of('Prev'), refs[i - 1]); if (i < list.length - 1) d.set(PDFName.of('Next'), refs[i + 1]);
      const pref = idToRef.get(it.pageId);
      if (pref) d.set(PDFName.of('Dest'), ctx.obj([pref, PDFName.of('XYZ'), PDFNull, it.top != null ? PDFNumber.of(it.top) : PDFNull, PDFNull]));
      count++;
      if (it.items?.length) { const sub = build(it.items, refs[i]); d.set(PDFName.of('First'), sub.first); d.set(PDFName.of('Last'), sub.last); d.set(PDFName.of('Count'), PDFNumber.of(it.open === false ? -sub.count : sub.count)); if (it.open !== false) count += sub.count; }
      ctx.assign(refs[i], d);
    });
    return { first: refs[0], last: refs[refs.length - 1], count };
  };
  const top = build(items, rootRef);
  ctx.assign(rootRef, ctx.obj({ Type: 'Outlines', First: top.first, Last: top.last, Count: top.count }));
  out.catalog.set(PDFName.of('Outlines'), rootRef);
}
function writePageLabels(out, labels) {
  const { PDFName, PDFString, PDFHexString, PDFNumber } = L(); const ctx = out.context;
  out.catalog.delete(PDFName.of('PageLabels'));
  if (!labels?.length) return;
  const nums = [];
  [...labels].sort((a, b) => a.start - b.start).forEach(l => {
    const d = {}; if (l.style) d.S = l.style; if (l.prefix) d.P = PDFHexString.fromText(l.prefix); if ((l.first || 1) !== 1) d.St = l.first;
    nums.push(PDFNumber.of(l.start - 1), ctx.obj(d));
  });
  out.catalog.set(PDFName.of('PageLabels'), ctx.obj({ Nums: nums }));
}

// =====================================================================================  protect / unprotect
let Cantoo = null;
async function cantoo() { if (!Cantoo) Cantoo = await import('../vendor/pdf-cantoo/pdf-lib.esm.min.js'); return Cantoo; }
export async function encryptBytes(bytes, p) {
  const C = await cantoo(); const d = await C.PDFDocument.load(bytes, { updateMetadata: false });
  const perms = { printing: p.printing === 'none' ? false : p.printing || 'highResolution', copying: !!p.copying, modifying: !!p.modifying, annotating: !!p.annotating, fillingForms: !!p.fillingForms, contentAccessibility: !!p.contentAccessibility, documentAssembly: !!p.documentAssembly };
  d.encrypt({ userPassword: p.userPassword || '', ownerPassword: p.ownerPassword || p.userPassword || cryptoRandom(), permissions: perms, ...(p.algorithm === 'AES-128' ? { algorithm: 'AES-128' } : {}) });
  return d.save();
}
const cryptoRandom = () => [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
export async function protectDialog() {
  const S = X.S; if (!S.pages.length) return;
  const cur = S.protect || {};
  const v = await UI.form({ title: 'Protect with password', width: 500, ok: 'Protect & save as…', fields: [
    { key: 'userPassword', label: 'Password to open the document (leave empty for permissions only)', type: 'password', value: cur.userPassword || '' },
    { key: 'confirm', label: 'Confirm open password', type: 'password', value: cur.userPassword || '' },
    { key: 'ownerPassword', label: 'Permissions (owner) password — needed to change restrictions', type: 'password', value: cur.ownerPassword || '' },
    { key: 'printing', label: 'Printing allowed', type: 'select', value: cur.printing || 'highResolution', options: [{ value: 'highResolution', label: 'High resolution' }, { value: 'lowResolution', label: 'Low resolution only' }, { value: 'none', label: 'Not allowed' }] },
    { key: 'copying', label: 'Allow copying text and images', type: 'checkbox', value: cur.copying ?? true },
    { key: 'contentAccessibility', label: 'Allow screen readers (accessibility)', type: 'checkbox', value: cur.contentAccessibility ?? true },
    { key: 'annotating', label: 'Allow comments', type: 'checkbox', value: cur.annotating ?? true },
    { key: 'fillingForms', label: 'Allow filling in forms and signing', type: 'checkbox', value: cur.fillingForms ?? true },
    { key: 'modifying', label: 'Allow editing content', type: 'checkbox', value: cur.modifying ?? false },
    { key: 'documentAssembly', label: 'Allow inserting, deleting and rotating pages', type: 'checkbox', value: cur.documentAssembly ?? false },
    { key: 'algorithm', label: 'Encryption', type: 'select', value: cur.algorithm || 'AES-256', options: [{ value: 'AES-256', label: 'AES-256 (recommended, Acrobat X and later)' }, { value: 'AES-128', label: 'AES-128 (older readers)' }] },
  ] });
  if (!v) return;
  if (v.userPassword !== v.confirm) return UI.toast('The open passwords do not match', 'err');
  if (!v.userPassword && !v.ownerPassword) return UI.toast('Enter an open password or a permissions password', 'err');
  delete v.confirm; S.protect = v; X.markDirty();
  await X.save(true);
}
export async function removeProtection() {
  const S = X.S;
  if (S.protect) { S.protect = null; X.markDirty(); return UI.toast('Password protection will be removed when you save', 'ok'); }
  if (S.wasEncrypted) { X.markDirty(); return UI.toast('This document was opened with its password. Save to write a copy without a password.', 'ok', 5000); }
  if (await UI.confirm('Remove password', 'The current document is not password protected. Open a protected PDF to remove its password?', 'Open…')) {
    const fs = await X.IO.open({ filters: [{ name: 'PDF', extensions: ['pdf'] }] }); if (fs) await X.openFiles(fs);
  }
}
export async function decryptBytes(bytes, password) {
  const C = await cantoo(); const d = await C.PDFDocument.load(bytes, { password, updateMetadata: false }); return d.save();
}
export async function openEncrypted(bytes, name, path, pw) {
  for (let tries = 0; tries < 5; tries++) {
    const password = pw ?? await UI.prompt('Password required', `"${name}" is protected. Enter the password to open it.`, '', 'password');
    if (password == null) return false;
    // verify with pdf.js first
    let js = null;
    try { js = await X.pdfjsLib.getDocument({ data: bytes.slice(), password, isEvalSupported: false }).promise; }
    catch (e) { if (pw != null) return false; UI.toast('Incorrect password — try again', 'err'); continue; }
    let plain;
    try { plain = await decryptBytes(bytes, password); }
    catch (e) { console.warn('cantoo decrypt failed, rasterising', e); plain = await rasterFromJs(js); }
    js.destroy();
    await X.openDoc(new Uint8Array(plain), name, path, { force: true, wasEncrypted: true });
    UI.toast('Opened. The password is removed when you save — use Tools › Protect to add one again.', 'ok', 6000);
    return true;
  }
  return false;
}
async function rasterFromJs(js) {
  const d = await L().PDFDocument.create();
  for (let i = 1; i <= js.numPages; i++) {
    const pg = await js.getPage(i); const vp = pg.getViewport({ scale: 2 }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); await pg.render({ canvasContext: cx, viewport: vp }).promise;
    const img = await d.embedJpg(await UI.blobToU8(await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9))));
    const p = d.addPage([vp.width / 2, vp.height / 2]); p.drawImage(img, { x: 0, y: 0, width: vp.width / 2, height: vp.height / 2 });
  }
  return d.save();
}

// =====================================================================================  convert
export async function imagesToPdfDialog(filesArg) {
  const fs = filesArg || await X.IO.open({ multi: true, filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }] }); if (!fs || !fs.length) return;
  const hasDoc = X.S.pages.length > 0;
  const v = await UI.form({ title: `Images to PDF — ${fs.length} image(s)`, width: 460, ok: 'Create PDF', fields: [
    { key: 'size', label: 'Page size', type: 'select', value: 'A4', options: [{ value: 'fit', label: 'Same as image' }, ...Object.keys(PAGE_SIZES)] },
    { key: 'orient', label: 'Orientation', type: 'select', value: 'auto', options: [{ value: 'auto', label: 'Automatic (match each image)' }, { value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }] },
    { key: 'margin', label: 'Margin (mm)', type: 'number', value: 10, min: 0, max: 50 },
    { key: 'fit', label: 'Image placement', type: 'select', value: 'contain', options: [{ value: 'contain', label: 'Fit inside margins' }, { value: 'cover', label: 'Fill page (crop edges)' }, { value: 'actual', label: 'Actual size (96 dpi)' }] },
    { key: 'jpeg', label: 'Convert PNG/other images to JPEG (smaller file)', type: 'checkbox', value: false },
    ...(hasDoc ? [{ key: 'append', label: 'Add to the end of the current document', type: 'checkbox', value: false }] : []),
  ] });
  if (!v) return;
  const bytes = await buildImagesPdf(fs, v);
  if (v.append && hasDoc) { await X.appendPdf(new Uint8Array(bytes), 'Images'); X.commit('Add images'); await X.refreshAfterPageOp(); UI.toast(`Added ${fs.length} page(s)`, 'ok'); }
  else { await X.openDoc(new Uint8Array(bytes), 'Images.pdf', null); X.markDirty(); }
  return bytes;
}
export async function buildImagesPdf(files, o = {}) {
  const d = await L().PDFDocument.create(); const margin = mm(+o.margin || 0);
  for (const f of files) {
    const u8 = new Uint8Array(f.data); let img;
    const isJpg = /\.jpe?g$/i.test(f.name), isPng = /\.png$/i.test(f.name);
    if (isJpg) img = await d.embedJpg(u8);
    else if (isPng && !o.jpeg) img = await d.embedPng(u8);
    else { const bmp = await createImageBitmap(new Blob([u8])); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const cx = c.getContext('2d'); if (o.jpeg) { cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); } cx.drawImage(bmp, 0, 0); const b = await new Promise(r => c.toBlob(r, o.jpeg ? 'image/jpeg' : 'image/png', 0.88)); const by = await UI.blobToU8(b); img = o.jpeg ? await d.embedJpg(by) : await d.embedPng(by); }
    let W, H;
    if (!o.size || o.size === 'fit') { W = img.width * 0.75 + 2 * margin; H = img.height * 0.75 + 2 * margin; }
    else {
      [W, H] = PAGE_SIZES[o.size] || PAGE_SIZES.A4;
      const land = o.orient === 'landscape' || (o.orient !== 'portrait' && img.width > img.height);
      if (land) [W, H] = [H, W];
    }
    const p = d.addPage([W, H]); const aw = W - 2 * margin, ah = H - 2 * margin;
    let s = o.fit === 'actual' ? 0.75 : o.fit === 'cover' ? Math.max(aw / img.width, ah / img.height) : Math.min(aw / img.width, ah / img.height);
    if (o.fit === 'actual' && (img.width * s > aw || img.height * s > ah)) s = Math.min(aw / img.width, ah / img.height);
    const w = img.width * s, hh = img.height * s;
    if (o.fit === 'cover') { const { pushGraphicsState, popGraphicsState, rectangle, clip, endPath } = L(); p.pushOperators(pushGraphicsState(), rectangle(margin, margin, aw, ah), clip(), endPath()); p.drawImage(img, { x: margin + (aw - w) / 2, y: margin + (ah - hh) / 2, width: w, height: hh }); p.pushOperators(popGraphicsState()); }
    else p.drawImage(img, { x: margin + (aw - w) / 2, y: margin + (ah - hh) / 2, width: w, height: hh });
  }
  d.setProducer('BTS PDF Pro (BTS Creative)'); d.setCreator('BTS PDF Pro');
  return d.save();
}

// PDF → Word (.docx): paragraphs per page, headings from larger text, page breaks between pages
export async function buildDocx() {
  await loadScript(localUrl('../vendor/pdf-docx/docx.iife.js')); const D = window.docx; const S = X.S;
  const children = []; let bodySize = 11;
  // estimate body font size from the most common item height
  const hist = {}; for (const pg of S.pages) for (const it of (await X.pageText(pg)).items) if (it.str?.trim()) { const s = Math.round(Math.hypot(it.transform[2], it.transform[3]) || it.height); hist[s] = (hist[s] || 0) + it.str.length; }
  const top = Object.entries(hist).sort((a, b) => b[1] - a[1])[0]; if (top) bodySize = +top[0];
  for (let pi = 0; pi < S.pages.length; pi++) {
    const items = (await X.pageText(S.pages[pi])).items.filter(i => i.str && i.str.trim() || i.hasEOL);
    // body size for this page = size covering most characters (falls back to the document-wide value)
    const ph = {}; items.forEach(it => { if (it.str?.trim()) { const s = Math.round(Math.hypot(it.transform[2], it.transform[3]) || it.height); ph[s] = (ph[s] || 0) + it.str.length; } });
    const pt = Object.entries(ph).sort((a, b) => b[1] - a[1])[0]; const body = pt ? +pt[0] : bodySize;
    // group into lines by baseline
    const lines = [];
    for (const it of items) {
      if (!it.str) continue; const y = it.transform[5], x = it.transform[4], sz = Math.hypot(it.transform[2], it.transform[3]) || it.height || bodySize;
      let ln = lines.find(l => Math.abs(l.y - y) < sz * 0.45); if (!ln) { ln = { y, sz, parts: [] }; lines.push(ln); }
      ln.parts.push({ x, str: it.str, w: it.width, sz }); ln.sz = Math.max(ln.sz, sz);
    }
    lines.sort((a, b) => b.y - a.y); lines.forEach(l => l.parts.sort((a, b) => a.x - b.x));
    const lineText = l => { let s = '', end = null; for (const p of l.parts) { if (end != null && p.x - end > p.sz * 0.15 && !/\s$/.test(s) && !/^\s/.test(p.str)) s += ' '; s += p.str; end = p.x + (p.w || 0); } return s.replace(/\s+/g, ' ').trim(); };
    // lines → paragraphs
    const paras = []; let cur = null;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]; const t = lineText(l); if (!t) continue;
      const gap = cur ? cur.lastY - l.y : 0; const heading = l.sz > body * 1.25 && t.length < 120;
      if (!cur || gap > Math.max(cur.sz, l.sz) * 1.65 || heading !== cur.heading || Math.abs(l.sz - cur.sz) > 1.5) { cur = { text: t, sz: l.sz, lastY: l.y, heading }; paras.push(cur); }
      else { cur.text += (cur.text.endsWith('-') ? '' : ' ') + t; if (cur.text.endsWith('- ')) cur.text = cur.text.slice(0, -2); cur.lastY = l.y; }
    }
    paras.forEach((p, k) => {
      const opts = { children: [new D.TextRun({ text: p.text, size: Math.round(Math.min(72, Math.max(8, p.sz)) * 2), bold: p.heading })], spacing: { after: 120 } };
      if (p.heading) opts.heading = p.sz > body * 1.7 ? D.HeadingLevel.HEADING_1 : D.HeadingLevel.HEADING_2;
      if (k === 0 && pi > 0) opts.pageBreakBefore = true;
      children.push(new D.Paragraph(opts));
    });
    if (!paras.length) children.push(new D.Paragraph({ children: [new D.TextRun({ text: pi === 0 ? '' : '', size: 22 })], pageBreakBefore: pi > 0 }));
  }
  const pg0 = S.pages[0]; const tw = pt => Math.round(pt * 20);
  const doc = new D.Document({ creator: 'BTS PDF Pro', title: S.meta?.title || baseName(), sections: [{ properties: { page: { size: { width: tw(pg0.w || 595), height: tw(pg0.h || 842) }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children }] });
  return new Uint8Array(await (await D.Packer.toBlob(doc)).arrayBuffer());
}
export async function exportDocx() {
  if (!X.S.pages.length) return;
  const empty = (await Promise.all(X.S.pages.map(p => X.pageText(p)))).every(t => !t.str.trim());
  if (empty && !(await UI.confirm('No text found', 'This PDF has no text layer (it may be a scan). Run OCR first (Tools › Recognize text) for a useful Word file. Export anyway?', 'Export anyway'))) return;
  UI.toast('Converting to Word…');
  const bytes = await buildDocx();
  const p = await X.IO.saveAs({ data: bytes, defaultPath: baseName() + '.docx', filters: [{ name: 'Word document', extensions: ['docx'] }] });
  if (p) UI.toast('Saved ' + p.split(/[\\/]/).pop(), 'ok');
  return p;
}

// =====================================================================================  enhance scan
export async function enhanceScanDialog() {
  const S = X.S; if (!S.pages.length) return;
  const v = await UI.form({ title: 'Enhance scan', width: 460, ok: 'Enhance', fields: [
    pageChoice('all'), rangeField(),
    { key: 'gray', label: 'Convert to grayscale', type: 'checkbox', value: true },
    { key: 'contrast', label: 'Auto contrast (clean white background)', type: 'checkbox', value: true },
    { key: 'deskew', label: 'Straighten tilted pages (deskew)', type: 'checkbox', value: true },
    { key: 'bw', label: 'Black & white (sharpest text, smallest file)', type: 'checkbox', value: false },
    { key: 'dpi', label: 'Resolution', type: 'select', value: '200', options: ['150', '200', '300'] }] });
  if (!v) return;
  const idx = pagesFrom(v.which, v.range); if (!idx.length) return UI.toast('No valid pages', 'err');
  if (!(await UI.confirm('Enhance scan', `The selected ${idx.length} page(s) will be replaced by cleaned-up images. Existing text on these pages is replaced too — run OCR afterwards to make them searchable. Continue?`, 'Enhance'))) return;
  return enhancePages(idx, v);
}
export async function enhancePages(idx, o) {
  const prog = progress('Enhancing scan'); let angles = [];
  await X.rebase(async doc => {
    const bytes = await doc.save(); const js = await X.pdfjsLib.getDocument({ data: bytes, isEvalSupported: false }).promise;
    const scale = (+o.dpi || 200) / 72; let n = 0;
    for (const i of idx) {
      if (prog.cancelled) break;
      prog.set(`Page ${i + 1}…`, n / idx.length);
      const pg = await js.getPage(i + 1); const vp = pg.getViewport({ scale });
      let c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); await pg.render({ canvasContext: cx, viewport: vp }).promise;
      const r = enhanceCanvas(c, o); c = r.canvas; angles.push(r.angle);
      const blob = await new Promise(res => c.toBlob(res, o.bw ? 'image/png' : 'image/jpeg', 0.85));
      const u8 = await UI.blobToU8(blob); const img = o.bw ? await doc.embedPng(u8) : await doc.embedJpg(u8);
      const W = vp.width / scale, H = vp.height / scale;
      const np = doc.insertPage(i, [W, H]); np.drawImage(img, { x: 0, y: 0, width: W, height: H }); doc.removePage(i + 1);
      n++;
    }
    js.destroy();
  }, { flatten: true, label: 'Enhance scan' });
  prog.close();
  UI.toast(`Enhanced ${angles.length} page(s)` + (angles.some(a => Math.abs(a) > 0.1) ? ` · straightened by ${angles.map(a => a.toFixed(1) + '°').join(', ')}` : ''), 'ok', 5000);
  return angles;
}
export function enhanceCanvas(c, o) {
  const W = c.width, H = c.height; const cx = c.getContext('2d', { willReadFrequently: true });
  let id = cx.getImageData(0, 0, W, H); const d = id.data;
  // luminance histogram
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) { const l = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0; hist[l]++; }
  let lo = 0, hi = 255; const tot = W * H;
  if (o.contrast) { let acc = 0; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > tot * 0.01) { lo = i; break; } } let pk = 128; for (let i = 128; i < 256; i++) if (hist[i] > hist[pk]) pk = i; hi = pk; while (hi > lo + 40 && hist[hi] > hist[pk] * 0.04) hi--; if (hi - lo < 40) { lo = 0; hi = 255; } }
  // Otsu threshold for B&W
  let thr = 128;
  if (o.bw) { let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i]; let sB = 0, wB = 0, best = 0; for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = tot - wB; if (!wF) break; sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF; const v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; thr = i; } } thr = lo + (thr - lo) * 255 / Math.max(1, hi - lo); }
  const k = 255 / Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    if (o.gray || o.bw) { const l = (r * 299 + g * 587 + b * 114) / 1000; r = g = b = l; }
    if (o.contrast) { r = (r - lo) * k; g = (g - lo) * k; b = (b - lo) * k; }
    if (o.bw) { const v = r > thr ? 255 : 0; r = g = b = v; }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  cx.putImageData(id, 0, 0);
  let angle = 0;
  if (o.deskew) {
    angle = detectSkew(c);
    if (Math.abs(angle) > 0.15) {
      const o2 = document.createElement('canvas'); o2.width = W; o2.height = H; const x2 = o2.getContext('2d');
      x2.fillStyle = '#fff'; x2.fillRect(0, 0, W, H); x2.translate(W / 2, H / 2); x2.rotate(-angle * Math.PI / 180); x2.drawImage(c, -W / 2, -H / 2);
      c = o2;
    }
  }
  return { canvas: c, angle };
}
// projection-profile skew detection on a downscaled binarised copy; returns degrees (positive = text rises to the right)
export function detectSkew(c) {
  const s = Math.min(1, 900 / c.width); const w = Math.round(c.width * s), hgt = Math.round(c.height * s);
  const t = document.createElement('canvas'); t.width = w; t.height = hgt; const tx = t.getContext('2d', { willReadFrequently: true }); tx.drawImage(c, 0, 0, w, hgt);
  const d = tx.getImageData(0, 0, w, hgt).data; const xs = [], ys = [];
  for (let y = 0; y < hgt; y += 1) for (let x = 0; x < w; x += 2) { const i = (y * w + x) * 4; if (d[i] < 110) { xs.push(x - w / 2); ys.push(y - hgt / 2); } }
  if (xs.length < 200) return 0;
  const score = a => { const r = a * Math.PI / 180, sn = Math.sin(r), cs = Math.cos(r); const bins = new Float64Array(hgt * 2 + 4); for (let i = 0; i < xs.length; i++) { const yy = Math.round(xs[i] * sn + ys[i] * cs + hgt); if (yy >= 0 && yy < bins.length) bins[yy]++; } let sc = 0; for (let i = 0; i < bins.length; i++) sc += bins[i] * bins[i]; return sc; };
  let best = 0, bs = -1; for (let a = -8; a <= 8; a += 0.5) { const v = score(a); if (v > bs) { bs = v; best = a; } }
  let fine = best; for (let a = best - 0.5; a <= best + 0.5; a += 0.1) { const v = score(a); if (v > bs) { bs = v; fine = a; } }
  // rotating by -fine levels the text; return the measured tilt
  return -Math.round(fine * 10) / 10;
}

// =====================================================================================  watermark / header-footer / background
const POSITIONS = [['c', 'Centre'], ['tl', 'Top left'], ['t', 'Top centre'], ['tr', 'Top right'], ['l', 'Middle left'], ['r', 'Middle right'], ['bl', 'Bottom left'], ['b', 'Bottom centre'], ['br', 'Bottom right'], ['tile', 'Tiled (repeat)']];
function measureText(txt, size, bold = true) { const c = measureText.c || (measureText.c = document.createElement('canvas').getContext('2d')); c.font = `${bold ? 700 : 400} ${size}px Helvetica, Arial`; return c.measureText(txt).width; }
// centres for a watermark; for 'tile' the grid is laid out along the rotation so long text repeats diagonally
function placeCentres(b, pos, bw, bh, margin = 36, tile) {
  if (pos === 'tile') {
    const out = []; const { w, h: th, ang } = tile; const dx = w + Math.max(40, th * 1.5), dy = th * 3.2 + 30;
    const cx0 = b.x + b.w / 2, cy0 = b.y + b.h / 2, R = Math.hypot(b.w, b.h) / 2 + Math.max(w, th), c = Math.cos(ang), s = Math.sin(ang);
    for (let v = -R, row = 0; v <= R; v += dy, row++) for (let u = -R + (row % 2) * dx / 2; u <= R; u += dx) {
      const x = cx0 + u * c - v * s, y = cy0 + u * s + v * c;
      if (x > b.x - w * 0.3 && x < b.x + b.w + w * 0.3 && y > b.y - th && y < b.y + b.h + th) out.push([x, y]);
    }
    return out;
  }
  const cx = pos.includes('l') ? b.x + margin + bw / 2 : pos.includes('r') ? b.x + b.w - margin - bw / 2 : b.x + b.w / 2;
  const cy = pos.startsWith('t') ? b.y + b.h - margin - bh / 2 : pos.startsWith('b') ? b.y + margin + bh / 2 : b.y + b.h / 2;
  return [[cx, cy]];
}
export async function watermarkDialog() {
  const S = X.S; if (!S.pages.length) return;
  let img = null; const preview = [];
  const clearPreview = () => { preview.forEach(([pg, a]) => { pg.annots = pg.annots.filter(x => x !== a); X.drawAnnots(pg); }); preview.length = 0; };
  const build = (v, pages, tag) => {
    const out = [];
    for (const i of pages) {
      const pg = S.pages[i]; if (!pg?._js) continue; const b = X.pageBox(pg); const ang = +v.angle * Math.PI / 180;
      if (v.kind === 'image' && img) {
        const w = b.w * (+v.scale / 100), hh = w * img.h / img.w; const bw = Math.abs(w * Math.cos(ang)) + Math.abs(hh * Math.sin(ang)), bh = Math.abs(w * Math.sin(ang)) + Math.abs(hh * Math.cos(ang));
        for (const [cx, cy] of placeCentres(b, v.pos, bw, bh, 36, { w, h: hh, ang })) out.push([pg, { id: X.nid(), type: 'wmimg', src: img.src, x: cx - w / 2, y: cy - hh / 2, w, h: hh, opacity: +v.opacity / 100, angle: +v.angle, wm: true, _tag: tag }]);
      } else if (v.text) {
        const tw = measureText(v.text, +v.size), th = +v.size; const bw = Math.abs(tw * Math.cos(ang)) + Math.abs(th * Math.sin(ang)), bh = Math.abs(tw * Math.sin(ang)) + Math.abs(th * Math.cos(ang));
        for (const [cx, cy] of placeCentres(b, v.pos, bw, bh, 36, { w: tw, h: th, ang })) out.push([pg, { id: X.nid(), type: 'watermark', text: v.text, size: +v.size, opacity: +v.opacity / 100, angle: +v.angle, color: v.color, cx, cy, wm: true }]);
      }
    }
    return out;
  };
  const show = v => { clearPreview(); const i = X.currentPageIdx(); build(v, [i]).forEach(([pg, a]) => { (v.layer === 'behind' ? pg.annots.unshift(a) : pg.annots.push(a)); preview.push([pg, a]); X.drawAnnots(pg); }); };
  const fields = [
    { key: 'kind', label: 'Type', type: 'select', value: 'text', options: [{ value: 'text', label: 'Text' }, { value: 'image', label: 'Image (choose after Apply, or press Choose image…)' }] },
    { key: 'text', label: 'Text', value: 'CONFIDENTIAL' }, { key: 'size', label: 'Font size', type: 'range', min: 12, max: 160, value: 64 },
    { key: 'color', label: 'Colour', type: 'color', value: '#ff0000' }, { key: 'scale', label: 'Image width (% of page)', type: 'range', min: 5, max: 100, value: 50 },
    { key: 'opacity', label: 'Opacity %', type: 'range', min: 5, max: 100, value: 20 }, { key: 'angle', label: 'Rotation°', type: 'range', min: -90, max: 90, value: 45 },
    { key: 'pos', label: 'Position', type: 'select', value: 'c', options: POSITIONS.map(([value, label]) => ({ value, label })) },
    { key: 'layer', label: 'Layer', type: 'select', value: 'behind', options: [{ value: 'behind', label: 'Behind other annotations' }, { value: 'front', label: 'In front' }] },
    pageChoice('all'), rangeField()];
  let vals = Object.fromEntries(fields.map(f => [f.key, f.value]));
  const formP = UI.form({ title: 'Watermark', width: 500, ok: 'Apply', fields, onChange: v => { vals = v; show(v); } });
  // add a "Choose image…" button into the open dialog
  setTimeout(() => {
    // keep the page visible for the live preview: dock the dialog on the right with a light backdrop
    const back = [...document.querySelectorAll('.modal-back')].pop(); if (back) { back.style.justifyItems = 'end'; back.style.paddingRight = '20px'; back.style.background = 'rgba(0,0,0,.18)'; }
    const f = back?.querySelector('.m-f'); if (!f) return; const b = h('button', { class: 'btn', style: { marginRight: 'auto' }, onclick: async () => { const r = await pickImage(); if (r) { img = r; const sel = document.querySelector('.modal .m-b select'); if (sel) { sel.value = 'image'; sel.dispatchEvent(new Event('change')); } } } }, 'Choose image…'); f.prepend(b); show(vals); }, 30);
  const v = await formP; clearPreview();
  if (!v) return;
  if (v.kind === 'image' && !img) { img = await pickImage(); if (!img) return; }
  const idx = pagesFrom(v.which, v.range); if (!idx.length) return UI.toast('No valid pages', 'err');
  const list = build(v, idx);
  list.forEach(([pg, a]) => { v.layer === 'behind' ? pg.annots.unshift(a) : pg.annots.push(a); });
  new Set(list.map(l => l[0])).forEach(pg => X.drawAnnots(pg));
  X.commit('Watermark'); UI.toast(`Watermark added to ${idx.length} page(s). Pages › Remove watermark… removes it.`, 'ok');
  return list.length;
}
async function pickImage() {
  const fs = await X.IO.open({ filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }] }); if (!fs) return null;
  return imageFromBytes(new Uint8Array(fs[0].data), fs[0].name);
}
export async function imageFromBytes(u8, name = '') {
  const jpg = /\.jpe?g$/i.test(name) || (u8[0] === 0xff && u8[1] === 0xd8);
  const src = jpg ? await X.u8ToDataUrl(u8, 'image/jpeg') : await X.u8ToDataUrl(await X.toPngBytes(u8), 'image/png');
  const im = await X.loadImg(src); return { src, w: im.width, h: im.height };
}
export async function headerFooterDialog() {
  const S = X.S; if (!S.pages.length) return;
  const prev = JSON.parse(localStorage.getItem('bts.pdf.hf') || 'null') || {};
  const v = await UI.form({ title: 'Header & footer · page numbers · Bates', width: 560, ok: 'Apply', fields: [
    { key: 'hl', label: 'Header left', value: prev.hl ?? '' }, { key: 'hc', label: 'Header centre', value: prev.hc ?? '' }, { key: 'hr', label: 'Header right', value: prev.hr ?? '{date}' },
    { key: 'fl', label: 'Footer left', value: prev.fl ?? '{file}' }, { key: 'fc', label: 'Footer centre', value: prev.fc ?? 'Page {page} of {total}' }, { key: 'fr', label: 'Footer right', value: prev.fr ?? '' },
    { key: 'size', label: 'Font size', type: 'number', value: prev.size ?? 9, min: 5, max: 36 }, { key: 'color', label: 'Colour', type: 'color', value: prev.color ?? '#333333' },
    { key: 'font', label: 'Font', type: 'select', value: prev.font ?? 'Helvetica', options: ['Helvetica', 'Times', 'Courier'] },
    { key: 'margin', label: 'Distance from edge (mm)', type: 'number', value: prev.margin ?? 10, min: 2, max: 50 },
    { key: 'start', label: 'Start page numbering at', type: 'number', value: prev.start ?? 1 },
    { key: 'dateFmt', label: 'Date format', type: 'select', value: prev.dateFmt ?? 'dd/mm/yyyy', options: ['dd/mm/yyyy', 'mm/dd/yyyy', 'yyyy-mm-dd', 'dd Mon yyyy'] },
    { key: 'batesPrefix', label: 'Bates prefix ({bates})', value: prev.batesPrefix ?? 'BTS' }, { key: 'batesDigits', label: 'Bates digits', type: 'number', value: prev.batesDigits ?? 6, min: 1, max: 12 },
    { key: 'batesStart', label: 'Bates start number', type: 'number', value: prev.batesStart ?? 1 }, { key: 'batesSuffix', label: 'Bates suffix', value: prev.batesSuffix ?? '' },
    pageChoice('all'), rangeField(),
    { key: 'replace', label: 'Replace existing header & footer added here', type: 'checkbox', value: true },
  ] });
  if (!v) return;
  try { localStorage.setItem('bts.pdf.hf', JSON.stringify(v)); } catch { }
  return applyHeaderFooter(v);
}
export function hfText(fmt, o) {
  return fmt.replace(/\{page\}|\{n\}/g, o.page).replace(/\{total\}/g, o.total).replace(/\{date\}/g, o.date).replace(/\{file\}/g, o.file).replace(/\{bates\}/g, o.bates);
}
export function applyHeaderFooter(v) {
  const S = X.S; const idx = pagesFrom(v.which, v.range); if (!idx.length) return UI.toast('No valid pages', 'err');
  if (v.replace !== false) S.pages.forEach(pg => { const n = pg.annots.length; pg.annots = pg.annots.filter(a => !a.hf); if (n !== pg.annots.length) X.drawAnnots(pg); });
  const total = S.pages.length + (+v.start || 1) - 1, date = today(v.dateFmt || 'dd/mm/yyyy'), file = S.fileName || 'Untitled.pdf';
  const sz = +v.size || 9, m = mm(+v.margin || 10); let count = 0;
  idx.forEach((i, k) => {
    const pg = S.pages[i]; const b = X.pageBox(pg);
    const bates = (v.batesPrefix || '') + String((+v.batesStart || 1) + k).padStart(+v.batesDigits || 6, '0') + (v.batesSuffix || '');
    const o = { page: i + (+v.start || 1), total, date, file, bates };
    for (const slot of ['hl', 'hc', 'hr', 'fl', 'fc', 'fr']) {
      const fmt = v[slot]; if (!fmt || !fmt.trim()) continue;
      const txt = hfText(fmt, o); const w = measureText(txt, sz, false) * 1.08 + 6, hh = sz * 1.4;
      const x = slot[1] === 'c' ? b.x + b.w / 2 - w / 2 : slot[1] === 'r' ? b.x + b.w - m - w : b.x + m;
      const y = slot[0] === 'f' ? b.y + m * 0.7 : b.y + b.h - m * 0.7 - hh;
      pg.annots.push({ id: X.nid(), type: 'text', x, y, w, h: hh, text: txt, size: sz, color: v.color || '#333333', font: v.font || 'Helvetica', bold: false, hf: true });
      count++;
    }
    X.drawAnnots(pg);
  });
  X.commit('Header & footer'); UI.toast(`Header & footer added to ${idx.length} page(s)`, 'ok');
  return count;
}
export async function backgroundDialog() {
  const S = X.S; if (!S.pages.length) return;
  let img = null;
  const v = await UI.form({ title: 'Background', width: 460, ok: 'Apply', fields: [
    { key: 'kind', label: 'Fill with', type: 'select', value: 'color', options: [{ value: 'color', label: 'Colour' }, { value: 'image', label: 'Image (you will choose it next)' }] },
    { key: 'color', label: 'Colour', type: 'color', value: '#fff6d5' },
    { key: 'fit', label: 'Image fit', type: 'select', value: 'cover', options: [{ value: 'cover', label: 'Fill page' }, { value: 'contain', label: 'Fit inside page' }, { value: 'stretch', label: 'Stretch' }] },
    { key: 'opacity', label: 'Opacity %', type: 'range', min: 5, max: 100, value: 100 }, pageChoice('all'), rangeField()] });
  if (!v) return;
  if (v.kind === 'image') { img = await pickImage(); if (!img) return; }
  return applyBackground({ ...v, src: img?.src });
}
export function applyBackground(v) {
  const S = X.S; const idx = pagesFrom(v.which, v.range); if (!idx.length) return UI.toast('No valid pages', 'err');
  for (const i of idx) {
    const pg = S.pages[i]; const b = X.pageBox(pg); pg.annots = pg.annots.filter(a => a.type !== 'bg');
    pg.annots.unshift({ id: X.nid(), type: 'bg', x: b.x, y: b.y, w: b.w, h: b.h, color: v.kind === 'image' ? null : v.color, src: v.kind === 'image' ? v.src : null, fit: v.fit, opacity: (+v.opacity || 100) / 100 });
    X.drawAnnots(pg);
  }
  X.commit('Background'); UI.toast(`Background applied to ${idx.length} page(s)`, 'ok');
  return idx.length;
}
export async function removeDecorDialog() {
  const S = X.S;
  const v = await UI.form({ title: 'Remove page decorations', ok: 'Remove', fields: [
    { key: 'wm', label: 'Watermarks', type: 'checkbox', value: true }, { key: 'hf', label: 'Headers & footers / page numbers / Bates', type: 'checkbox', value: true }, { key: 'bg', label: 'Backgrounds', type: 'checkbox', value: true }] });
  if (!v) return; let n = 0;
  S.pages.forEach(pg => { const before = pg.annots.length; pg.annots = pg.annots.filter(a => !((v.wm && (a.type === 'watermark' || a.type === 'wmimg')) || (v.hf && a.hf) || (v.bg && a.type === 'bg'))); if (pg.annots.length !== before) { n += before - pg.annots.length; X.drawAnnots(pg); } });
  if (n) X.commit('Remove decorations'); UI.toast(n ? `Removed ${n} item(s)` : 'Nothing to remove (only items added in BTS PDF Pro before saving can be removed)', n ? 'ok' : '');
}

// =====================================================================================  bookmarks panel
let olSel = null;
async function importOutline() {
  const S = X.S; S.outline = [];
  const js = S.sources[0]?.js; if (!js) return;
  let ol = null; try { ol = await js.getOutline(); } catch { }
  const conv = async items => {
    const out = [];
    for (const it of items || []) {
      let pageId = null, top = null;
      try {
        let dest = it.dest; if (typeof dest === 'string') dest = await js.getDestination(dest);
        if (dest) { const idx = typeof dest[0] === 'number' ? dest[0] : await js.getPageIndex(dest[0]); const pg = S.pages.find(p => p.src === 0 && p.index === idx); pageId = pg?.id || null; if (dest[1]?.name === 'XYZ') top = dest[3]; }
      } catch { }
      out.push({ id: X.nid(), title: it.title, pageId, top, url: it.url || null, open: true, items: await conv(it.items) });
    }
    return out;
  };
  S.outline = await conv(ol);
}
function findItem(list, id, parent = null) { for (let i = 0; i < list.length; i++) { if (list[i].id === id) return { list, i, item: list[i], parent }; const r = findItem(list[i].items || [], id, list[i]); if (r) return r; } return null; }
export async function renderOutline() {
  const S = X.S; const b = document.getElementById('lpBody'); if (S.leftTab !== 'outline') return;
  if (S.pages.length && S.outline === undefined) { b.innerHTML = '<div class="muted" style="padding:16px">Loading…</div>'; await importOutline(); if (S.leftTab !== 'outline') return; }
  b.innerHTML = '';
  const btn = (ic, tip, fn, dis) => h('button', { class: 'icon-btn', 'data-tip': tip, html: X.icon(ic), onclick: fn, disabled: dis || !S.pages.length });
  const sel = olSel && S.outline && findItem(S.outline, olSel);
  b.append(h('div', { class: 'ol-tools' },
    btn('plus', 'Add bookmark for current page (Ctrl+B)', () => addBookmark()), btn('pen', 'Rename', () => sel && renameBookmark(sel.item), !sel), btn('trash', 'Delete', () => sel && deleteBookmark(sel.item.id), !sel),
    btn('chevU', 'Move up', () => moveBookmark(-1), !sel), btn('chevD', 'Move down', () => moveBookmark(1), !sel), btn('chevR', 'Make child of previous', () => indentBookmark(1), !sel), btn('chevL', 'Move out one level', () => indentBookmark(-1), !sel)));
  if (!S.pages.length) return b.append(h('div', { class: 'muted', style: { padding: '16px' } }, 'Open a PDF to see bookmarks.'));
  if (!S.outline?.length) return b.append(h('div', { class: 'muted', style: { padding: '12px 6px' } }, 'No bookmarks yet. Go to a page and press + (or Ctrl+B) to add one. Bookmarks are saved into the PDF outline.'));
  const walk = (items, depth) => items.forEach(it => {
    const pi = S.pages.findIndex(p => p.id === it.pageId);
    const row = h('div', { class: 'ol-item' + (olSel === it.id ? ' sel' : ''), style: { paddingLeft: 8 + depth * 14 + 'px' }, draggable: 'true' },
      it.items?.length ? h('span', { class: 'ol-tw', onclick: e => { e.stopPropagation(); it.open = it.open === false; renderOutline(); } }, it.open === false ? '▸' : '▾') : h('span', { class: 'ol-tw' }),
      h('span', { class: 'grow' }, it.title), h('span', { class: 'muted ol-pg' }, pi >= 0 ? String(pi + 1) : ''));
    row.onclick = () => { olSel = it.id; if (pi >= 0) X.scrollToPage(pi, it.top); renderOutline(); };
    row.ondblclick = () => renameBookmark(it);
    row.oncontextmenu = e => { olSel = it.id; UI.contextMenu(e, [{ label: 'Rename', action: () => renameBookmark(it) }, { label: 'Set to current page', action: () => { it.pageId = X.curPage()?.id; it.top = null; changed('Bookmark'); } }, { label: 'Add child bookmark', action: () => addBookmark(it) }, '-', { label: 'Delete', action: () => deleteBookmark(it.id) }]); };
    row.ondragstart = e => { e.dataTransfer.setData('text/bts-ol', it.id); };
    row.ondragover = e => { e.preventDefault(); row.classList.add('drag-over'); }; row.ondragleave = () => row.classList.remove('drag-over');
    row.ondrop = e => { e.preventDefault(); row.classList.remove('drag-over'); const id = e.dataTransfer.getData('text/bts-ol'); if (!id || id === it.id) return; const src = findItem(S.outline, id); if (!src || findItem(src.item.items || [], it.id)) return; src.list.splice(src.i, 1); const dst = findItem(S.outline, it.id); dst.list.splice(dst.i, 0, src.item); changed('Move bookmark'); };
    b.append(row);
    if (it.items?.length && it.open !== false) walk(it.items, depth + 1);
  });
  walk(S.outline, 0);
}
function changed(label) { X.commit(label); renderOutline(); }
export async function addBookmark(parent) {
  const S = X.S; if (!S.pages.length) return;
  if (S.outline === undefined) await importOutline();
  const pg = X.curPage(); const i = X.currentPageIdx();
  let def = `Page ${i + 1}`; try { const t = (await X.pageText(pg)).items.find(it => it.str.trim().length > 3); if (t) def = t.str.trim().slice(0, 60); } catch { }
  const title = await UI.prompt('Add bookmark', `Bookmark title (goes to page ${i + 1})`, def); if (!title) return;
  const it = { id: X.nid(), title, pageId: pg.id, top: null, open: true, items: [] };
  if (parent) (parent.items = parent.items || []).push(it); else S.outline.push(it);
  olSel = it.id; X.showLeft('outline'); changed('Add bookmark'); return it;
}
async function renameBookmark(it) { const t = await UI.prompt('Rename bookmark', 'Title', it.title); if (t) { it.title = t; changed('Rename bookmark'); } }
function deleteBookmark(id) { const r = findItem(X.S.outline, id); if (!r) return; r.list.splice(r.i, 1); olSel = null; changed('Delete bookmark'); }
function moveBookmark(d) { const r = findItem(X.S.outline, olSel); if (!r) return; const j = r.i + d; if (j < 0 || j >= r.list.length) return; [r.list[r.i], r.list[j]] = [r.list[j], r.list[r.i]]; changed('Move bookmark'); }
function indentBookmark(d) {
  const S = X.S; const r = findItem(S.outline, olSel); if (!r) return;
  if (d > 0) { if (r.i === 0) return; const prev = r.list[r.i - 1]; r.list.splice(r.i, 1); (prev.items = prev.items || []).push(r.item); prev.open = true; }
  else { if (!r.parent) return; const pr = findItem(S.outline, r.parent.id); r.list.splice(r.i, 1); pr.list.splice(pr.i + 1, 0, r.item); }
  changed('Bookmark level');
}

// =====================================================================================  page operations
export async function replacePageDialog(fileArg, pageNo) {
  const S = X.S; if (!S.pages.length) return;
  const fs = fileArg ? [fileArg] : await X.IO.open({ filters: [{ name: 'PDF & images', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }] }); if (!fs) return;
  const f = fs[0]; const at = X.currentPageIdx();
  let bytes = /\.pdf$/i.test(f.name) ? new Uint8Array(f.data) : new Uint8Array(await X.imagesToPdf([f]));
  const tmp = await X.pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise; const n = tmp.numPages; tmp.destroy();
  let pick = pageNo || 1;
  if (!pageNo && n > 1) { const v = await UI.prompt('Replace page', `Which page of "${f.name}" should replace page ${at + 1}? (1–${n})`, '1', 'number'); if (!v) return; pick = Math.max(1, Math.min(n, +v)); }
  if (n > 1) { const d = await L().PDFDocument.load(bytes); const nd = await L().PDFDocument.create(); const [cp] = await nd.copyPages(d, [pick - 1]); nd.addPage(cp); bytes = new Uint8Array(await nd.save()); }
  const old = S.pages[at];
  await X.appendPdf(bytes, f.name, at + 1);
  S.pages = S.pages.filter(p => p !== old);
  X.commit('Replace page'); await X.refreshAfterPageOp(); X.scrollToPage(at); UI.toast(`Page ${at + 1} replaced`, 'ok');
}
export async function reversePages() {
  const S = X.S; if (S.pages.length < 2) return;
  const sel = S.organizer && S.ogSel.size > 1 ? S.pages.filter(p => S.ogSel.has(p.id)) : null;
  if (sel) { const pos = sel.map(p => S.pages.indexOf(p)); const rev = sel.slice().reverse(); pos.forEach((k, j) => S.pages[k] = rev[j]); }
  else S.pages.reverse();
  X.commit('Reverse pages'); await X.refreshAfterPageOp(); UI.toast(sel ? `Reversed ${sel.length} selected pages` : 'Page order reversed', 'ok');
}
export async function cropDialog() {
  const S = X.S; if (!S.pages.length) return;
  const v = await UI.form({ title: 'Crop pages', ok: 'Crop', fields: [
    { key: 'top', label: 'Top (mm)', type: 'number', value: 10, min: 0 }, { key: 'bottom', label: 'Bottom (mm)', type: 'number', value: 10, min: 0 },
    { key: 'left', label: 'Left (mm)', type: 'number', value: 10, min: 0 }, { key: 'right', label: 'Right (mm)', type: 'number', value: 10, min: 0 },
    pageChoice('all'), rangeField(), { key: 'remove', label: 'Remove crop instead (restore full page)', type: 'checkbox', value: false }] });
  if (!v) return;
  return applyCropMargins(v);
}
export async function applyCropMargins(v) {
  const S = X.S; const idx = pagesFrom(v.which, v.range); if (!idx.length) return UI.toast('No valid pages', 'err');
  for (const i of idx) {
    const pg = S.pages[i]; await X.ensureJs(pg);
    if (v.remove) { delete pg.crop; continue; }
    const [x1, y1, x2, y2] = pg._js.view; // full page (user space)
    // margins are given as seen on screen; map them through the page rotation
    const r = (pg.baseRot + pg.rot) % 360; let [t, rr, bb, l] = [mm(+v.top || 0), mm(+v.right || 0), mm(+v.bottom || 0), mm(+v.left || 0)];
    if (r === 90) [t, rr, bb, l] = [l, t, rr, bb]; else if (r === 180) [t, rr, bb, l] = [bb, l, t, rr]; else if (r === 270) [t, rr, bb, l] = [rr, bb, l, t];
    const c = [x1 + l, y1 + bb, x2 - rr, y2 - t]; if (c[2] - c[0] < 20 || c[3] - c[1] < 20) continue;
    pg.crop = c;
  }
  X.commit(v.remove ? 'Remove crop' : 'Crop pages'); await X.refreshAfterPageOp(); if (X.S.zoomMode) X.setZoom(X.S.zoomMode);
  UI.toast(v.remove ? 'Crop removed' : `Cropped ${idx.length} page(s) — the hidden area is kept and can be restored`, 'ok');
}
export async function applyCropRect(pg, a) {
  const S = X.S; const r = [a.x, a.y, a.x + a.w, a.y + a.h]; if (a.w < 10 || a.h < 10) return;
  const res = await UI.modal({ title: 'Crop pages', body: `Keep the selected ${Math.round(a.w / 72 * 25.4)} × ${Math.round(a.h / 72 * 25.4)} mm area on:`, buttons: [{ label: 'Cancel', value: null }, { label: 'All pages', value: 'all' }, { label: 'This page', primary: true, value: 'one' }] });
  if (!res) return;
  const list = res === 'all' ? S.pages : [pg];
  for (const p of list) { await X.ensureJs(p); const v = p.crop || p._js.view; const c = [Math.max(v[0], r[0]), Math.max(v[1], r[1]), Math.min(v[2], r[2]), Math.min(v[3], r[3])]; if (c[2] - c[0] > 10 && c[3] - c[1] > 10) p.crop = c; }
  X.commit('Crop'); await X.refreshAfterPageOp(); X.setTool('select'); if (S.zoomMode) X.setZoom(S.zoomMode);
}
export async function clearCrop() { for (const p of X.S.pages) delete p.crop; X.commit('Remove crop'); await X.refreshAfterPageOp(); }
export async function resizeDialog() {
  const S = X.S; if (!S.pages.length) return;
  const v = await UI.form({ title: 'Resize pages', ok: 'Resize', fields: [
    { key: 'size', label: 'New page size', type: 'select', value: 'A4', options: Object.keys(PAGE_SIZES) },
    { key: 'orient', label: 'Orientation', type: 'select', value: 'auto', options: [{ value: 'auto', label: 'Keep each page\'s orientation' }, { value: 'portrait', label: 'Portrait' }, { value: 'landscape', label: 'Landscape' }] },
    pageChoice('all'), rangeField()] });
  if (!v) return;
  if (S.pages.some(p => p.annots.length) && !(await UI.confirm('Resize pages', 'Comments and other additions on the page are merged into the page content before resizing. Continue?', 'Resize'))) return;
  return resizePages(pagesFrom(v.which, v.range), v.size, v.orient);
}
export async function resizePages(idx, size, orient = 'auto') {
  const [W0, H0] = PAGE_SIZES[size] || PAGE_SIZES.A4; let n = 0;
  await X.rebase(doc => {
    const { PDFName, PDFArray, PDFNumber, concatTransformationMatrix, pushGraphicsState, popGraphicsState } = L(); const ctx = doc.context; const pages = doc.getPages();
    for (const i of idx) {
      const p = pages[i]; if (!p) continue; const box = p.getCropBox(); const rot = p.getRotation().angle % 360;
      let vw = box.width, vh = box.height; if (rot === 90 || rot === 270) [vw, vh] = [vh, vw];
      let W = W0, H = H0; const land = orient === 'landscape' || (orient === 'auto' && vw > vh); if (land) [W, H] = [H0, W0];
      if (rot === 90 || rot === 270) [W, H] = [H, W]; // back to unrotated user space
      const s = Math.min(W / box.width, H / box.height); const tx = (W - box.width * s) / 2 - box.x * s, ty = (H - box.height * s) / 2 - box.y * s;
      const C = p.node.get(PDFName.of('Contents')); const old = !C ? [] : C instanceof PDFArray ? C.asArray() : [C];
      const pre = ctx.register(ctx.contentStream([pushGraphicsState(), concatTransformationMatrix(s, 0, 0, s, tx, ty)])), post = ctx.register(ctx.contentStream([popGraphicsState()]));
      p.node.set(PDFName.of('Contents'), ctx.obj([pre, ...old, post]));
      ['CropBox', 'BleedBox', 'TrimBox', 'ArtBox'].forEach(k => p.node.delete(PDFName.of(k)));
      p.setMediaBox(0, 0, W, H);
      const annots = p.node.Annots(); if (annots) annots.asArray().forEach(ref => { const d = ctx.lookup(ref); const R = d?.get?.(PDFName.of('Rect')); if (R instanceof PDFArray) { const a = R.asArray().map(n => n.asNumber()); d.set(PDFName.of('Rect'), ctx.obj([a[0] * s + tx, a[1] * s + ty, a[2] * s + tx, a[3] * s + ty])); } });
      n++;
    }
  }, { flatten: true, label: 'Resize pages' });
  UI.toast(`Resized ${n} page(s) to ${size}`, 'ok'); return n;
}
export async function pageLabelsDialog() {
  const S = X.S; if (!S.pages.length) return;
  let cur = S.pageLabels; if (cur === undefined) { cur = []; try { const l = await S.sources[0].js.getPageLabels(); if (l) cur = null; } catch { } }
  const v = await UI.form({ title: 'Page labels', width: 460, ok: 'Apply', fields: [
    { key: 'from', label: 'Apply to pages starting at page', type: 'number', value: X.currentPageIdx() + 1, min: 1, max: S.pages.length },
    { key: 'style', label: 'Style', type: 'select', value: 'D', options: [{ value: 'D', label: '1, 2, 3' }, { value: 'r', label: 'i, ii, iii' }, { value: 'R', label: 'I, II, III' }, { value: 'a', label: 'a, b, c' }, { value: 'A', label: 'A, B, C' }, { value: '', label: 'None (prefix only)' }] },
    { key: 'prefix', label: 'Prefix (e.g. "A-")', value: '' }, { key: 'first', label: 'Start at number', type: 'number', value: 1, min: 1 },
    { key: 'reset', label: 'Remove all page labels instead', type: 'checkbox', value: false }] });
  if (!v) return;
  if (v.reset) S.pageLabels = [];
  else { const list = (S.pageLabels || []).filter(l => l.start !== +v.from); if (!list.some(l => l.start === 1) && +v.from !== 1) list.push({ start: 1, style: 'D', prefix: '', first: 1 }); list.push({ start: +v.from, style: v.style, prefix: v.prefix, first: +v.first || 1 }); S.pageLabels = list; }
  X.markDirty(); UI.toast('Page labels will be written when you save', 'ok');
}
export function labelFor(i) {
  const L2 = X.S.pageLabels; if (!L2?.length) return null;
  const r = [...L2].sort((a, b) => a.start - b.start).filter(l => l.start - 1 <= i).pop(); if (!r) return null;
  const n = i - (r.start - 1) + (r.first || 1);
  const roman = k => { const t = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]; let s = ''; for (const [v, c] of t) while (k >= v) { s += c; k -= v; } return s; };
  const alpha = k => { const c = String.fromCharCode(97 + (k - 1) % 26); return c.repeat(Math.ceil(k / 26)); };
  const num = r.style === 'D' ? String(n) : r.style === 'r' ? roman(n) : r.style === 'R' ? roman(n).toUpperCase() : r.style === 'a' ? alpha(n) : r.style === 'A' ? alpha(n).toUpperCase() : '';
  return (r.prefix || '') + num;
}

// =====================================================================================  optimize / flatten / metadata / accessibility
export async function optimizeBytes(bytes, preset) {
  const P = { high: { q: 0.85, max: 2400 }, medium: { q: 0.7, max: 1600 }, low: { q: 0.5, max: 1000 } }[preset] || { q: 0.7, max: 1600 };
  const { PDFDocument, PDFName, PDFRawStream, PDFNumber, PDFArray, PDFDict, decodePDFRawStream } = L();
  const doc = await PDFDocument.load(bytes, { updateMetadata: false }); const ctx = doc.context; let images = 0, shrunk = 0;
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue; const d = obj.dict;
    if (d.get(PDFName.of('Subtype'))?.toString() !== '/Image') continue; images++;
    if (obj.contents.length < 12000) continue;
    if (d.get(PDFName.of('ImageMask'))?.toString() === 'true' || d.get(PDFName.of('Decode'))) continue;
    const bpc = d.get(PDFName.of('BitsPerComponent'))?.asNumber?.(); if (bpc !== 8) continue;
    let filter = d.get(PDFName.of('Filter')); if (filter instanceof PDFArray) { if (filter.size() !== 1) continue; filter = filter.get(0); }
    const fname = filter?.toString(); let cs = d.get(PDFName.of('ColorSpace')); cs = cs && ctx.lookup(cs); let csName = cs?.toString() || '';
    if (cs instanceof PDFArray && cs.get(0)?.toString() === '/ICCBased') { const icc = ctx.lookup(cs.get(1)); const n = icc?.dict?.get(PDFName.of('N'))?.asNumber?.(); csName = n === 3 ? '/DeviceRGB' : n === 1 ? '/DeviceGray' : '?'; }
    if (!['/DeviceRGB', '/DeviceGray'].includes(csName)) continue;
    const W = d.get(PDFName.of('Width'))?.asNumber?.(), H = d.get(PDFName.of('Height'))?.asNumber?.(); if (!W || !H) continue;
    let bmp = null;
    try {
      if (fname === '/DCTDecode') bmp = await createImageBitmap(new Blob([obj.contents], { type: 'image/jpeg' }));
      else if (fname === '/FlateDecode' && !d.get(PDFName.of('DecodeParms'))) {
        const raw = decodePDFRawStream(obj).decode(); const ch = csName === '/DeviceRGB' ? 3 : 1; if (raw.length < W * H * ch) continue;
        const id = new ImageData(W, H); for (let i = 0, j = 0; i < W * H; i++, j += ch) { const o = i * 4; id.data[o] = raw[j]; id.data[o + 1] = raw[j + (ch === 3 ? 1 : 0)]; id.data[o + 2] = raw[j + (ch === 3 ? 2 : 0)]; id.data[o + 3] = 255; }
        bmp = await createImageBitmap(id);
      } else continue;
    } catch { continue; }
    const s = Math.min(1, P.max / Math.max(W, H)); const w = Math.max(1, Math.round(W * s)), hh = Math.max(1, Math.round(H * s));
    const c = document.createElement('canvas'); c.width = w; c.height = hh; const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, hh); cx.drawImage(bmp, 0, 0, w, hh);
    const jpg = await UI.blobToU8(await new Promise(r => c.toBlob(r, 'image/jpeg', P.q)));
    if (jpg.length >= obj.contents.length * 0.92) continue;
    const nd = { Type: 'XObject', Subtype: 'Image', Width: w, Height: hh, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'DCTDecode' };
    const sm = d.get(PDFName.of('SMask')); const ns = ctx.stream(jpg, nd); if (sm) ns.dict.set(PDFName.of('SMask'), sm);
    const intent = d.get(PDFName.of('Intent')); if (intent) ns.dict.set(PDFName.of('Intent'), intent);
    ctx.assign(ref, ns); shrunk++;
  }
  const out = await doc.save({ useObjectStreams: true });
  return { bytes: out, images, shrunk };
}
export async function optimizeDialog() {
  const S = X.S; if (!S.pages.length) return;
  const v = await UI.form({ title: 'Optimize / compress PDF', width: 500, ok: 'Optimize', fields: [
    { key: 'preset', label: 'Quality preset', type: 'select', value: 'medium', options: [
      { value: 'high', label: 'High quality — images up to 2400 px, JPEG 85% (keeps text)' },
      { value: 'medium', label: 'Medium — images up to 1600 px, JPEG 70% (keeps text)' },
      { value: 'low', label: 'Low / smallest — images up to 1000 px, JPEG 50% (keeps text)' },
      { value: 'raster', label: 'Maximum — rasterize pages at 100 dpi (scans only; text becomes image)' }] },
    { key: 'meta', label: 'Also remove hidden metadata', type: 'checkbox', value: false }] });
  if (!v) return;
  return runOptimize(v.preset, v.meta);
}
export async function runOptimize(preset, meta, { report = true } = {}) {
  const S = X.S; const prog = progress('Optimizing'); prog.set('Building document…', 0.1);
  const before = S.sources.reduce((n, s) => n + s.bytes.length, 0);
  const prevStrip = S.stripMeta; if (meta) S.stripMeta = true;
  let built = await X.buildPdf(); S.stripMeta = prevStrip;
  let res;
  if (preset === 'raster') { prog.set('Rasterizing pages…', 0.4); res = { bytes: await X.rasterizePages(built, S.pages.map((_, i) => i), 100 / 72, 'jpeg', 0.6), images: S.pages.length, shrunk: S.pages.length }; }
  else { prog.set('Recompressing images…', 0.4); res = await optimizeBytes(built, preset); }
  prog.close();
  const after = res.bytes.length; const pct = Math.round((1 - after / before) * 100);
  const r = { before, built: built.length, after, pct, images: res.images, shrunk: res.shrunk, bytes: res.bytes };
  if (!report) return r;
  const tbl = h('table', { class: 'kb-table rep' },
    h('tr', {}, h('td', {}, 'Original file'), h('td', {}, X.fmtSize(before))),
    h('tr', {}, h('td', {}, 'Optimized'), h('td', {}, h('b', {}, X.fmtSize(after)))),
    h('tr', {}, h('td', {}, 'Saving'), h('td', {}, pct > 0 ? `${pct}% smaller` : 'No reduction (already optimized)')),
    h('tr', {}, h('td', {}, 'Images'), h('td', {}, `${res.images} found · ${res.shrunk} recompressed`)));
  const choice = await UI.modal({ title: 'Optimization report', width: 440, body: h('div', {}, h('div', { class: 'size-bars' }, h('div', { style: { width: '100%' } }, 'Before'), h('div', { style: { width: Math.max(4, Math.min(100, after / before * 100)) + '%' } }, 'After')), tbl),
    buttons: [{ label: 'Close', value: null }, { label: 'Use in this document', value: 'apply' }, { label: 'Save as…', primary: true, value: 'save' }] });
  if (choice === 'save') { const p = await X.IO.saveAs({ data: res.bytes, defaultPath: baseName() + '-optimized.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] }); if (p) UI.toast('Saved ' + X.fmtSize(after), 'ok'); }
  else if (choice === 'apply') { await X.reloadFromBytes(new Uint8Array(res.bytes)); X.markDirty(); UI.toast('Optimized document loaded — save to keep it', 'ok'); }
  return r;
}
export async function flattenAll() {
  const S = X.S; if (!S.pages.length) return;
  if (!(await UI.confirm('Flatten', 'Merge all form fields, comments, drawings and stamps into the page content? They can no longer be edited after this.', 'Flatten'))) return;
  S.flattenForms = true; try { await X.rebase(null, { flatten: true, label: 'Flatten' }); } finally { S.flattenForms = false; }
  UI.toast('Flattened — save to keep the result', 'ok');
}
export function removeMetadata() {
  const S = X.S; if (!S.pages.length) return;
  S.stripMeta = true; S.meta = null; X.markDirty();
  UI.toast('Title, author, keywords, creator, producer and XMP metadata will be removed when you save', 'ok', 5000);
}
export async function accessibilityChecks() {
  const S = X.S; const js = S.sources[0].js; const out = [];
  let info = {}; try { info = (await js.getMetadata()).info || {}; } catch { }
  let noText = []; for (let i = 0; i < S.pages.length; i++) if (!(await X.pageText(S.pages[i])).str.trim()) noText.push(i + 1);
  out.push({ id: 'text', ok: !noText.length, label: 'Document has real text (not just scanned images)', detail: noText.length ? `${noText.length} of ${S.pages.length} page(s) have no text: ${noText.slice(0, 12).join(', ')}${noText.length > 12 ? '…' : ''}` : 'All pages contain text', fix: noText.length ? ['Run OCR', () => import('./ocr.js').then(m => m.ocrDialog())] : null });
  const title = S.meta?.title ?? info.Title ?? '';
  out.push({ id: 'title', ok: !!String(title).trim(), label: 'Document title is set', detail: title ? `"${title}"` : 'No title in document properties', fix: ['Set title', () => import('./a11y.js').then(m => m.makeAccessibleDialog())] });
  const lang = S.lang ?? info.Language ?? '';
  out.push({ id: 'lang', ok: !!lang, label: 'Document language is set', detail: lang || 'No language — screen readers may mispronounce text', fix: ['Set language', () => import('./a11y.js').then(m => m.makeAccessibleDialog())] });
  let marked = false, struct = false, minimal = false; try { marked = !!(await js.getMarkInfo())?.Marked; } catch { }
  try { const d = await L().PDFDocument.load(S.sources[0].bytes, { ignoreEncryption: true, updateMetadata: false }); const root = d.catalog.lookup(L().PDFName.of('StructTreeRoot')); struct = !!root; minimal = !!root?.get?.(L().PDFName.of('BTSMinimal')); } catch { }
  const makeAcc = ['Make accessible', () => import('./a11y.js').then(m => m.makeAccessibleDialog())];
  out.push({ id: 'tagged', ok: marked && struct && !minimal, warn: true, label: 'Tagged PDF (structure for screen readers)', detail: minimal ? 'Only images are tagged (alt text added with Make accessible). For full tagging, export a tagged PDF from the original Word/Docs file.' : marked && struct ? 'Document is tagged' : 'Not tagged. Re-export from the original Word/Docs file with "tagged PDF" turned on for best accessibility.' });
  // images: alternative text
  let nImg = 0, nAlt = 0;
  if (S.pages.length <= 80) { try { const { listImages } = await import('./a11y.js'); const imgs = await listImages(); nImg = imgs.length; const pending = S.a11y?.alts; if (pending) nAlt = imgs.filter(im => pending[im.pageId]?.[im.name]?.trim()).length; else for (const pg of S.pages) { await X.ensureJs(pg); const t = await pg._js.getStructTree().catch(() => null); const walk = n => { if (!n) return; if (n.role === 'Figure' && n.alt) nAlt++; (n.children || []).forEach(walk); }; walk(t); } } catch (e) { console.warn(e); } }
  out.push({ id: 'alt', ok: !nImg || nAlt >= nImg, warn: true, label: 'Images have alternative text', detail: nImg ? `${Math.min(nAlt, nImg)} of ${nImg} image(s) described${S.a11y?.alts ? ' (written when you save)' : ''}` : 'No images found', fix: makeAcc });
  const nOl = S.outline !== undefined ? (S.outline || []).length : ((await js.getOutline().catch(() => null)) || []).length;
  out.push({ id: 'bookmarks', ok: S.pages.length <= 20 || nOl > 0, warn: true, label: 'Bookmarks for navigation (documents over 20 pages)', detail: nOl ? `${nOl} top-level bookmark(s)` : S.pages.length <= 20 ? 'Short document — not required' : 'No bookmarks', fix: ['Add bookmarks', () => X.showLeft('outline')] });
  const fields = S.formFields.length; let tips = 0;
  try { const d = await L().PDFDocument.load(S.sources[0].bytes, { ignoreEncryption: true, updateMetadata: false }); for (const f of d.getForm().getFields()) if (f.acroField.dict.get(L().PDFName.of('TU'))) tips++; } catch { }
  const nf = new Set(S.formFields.map(f => f.name)).size;
  out.push({ id: 'forms', ok: !nf || tips >= nf, warn: true, label: 'Form fields have descriptions (tooltips)', detail: nf ? `${tips} of ${nf} field(s) have a tooltip` : 'No form fields' });
  out.push({ id: 'protect', ok: !S.protect || S.protect.contentAccessibility !== false, label: 'Security allows screen readers', detail: S.protect ? (S.protect.contentAccessibility === false ? 'Protection blocks assistive technology' : 'Allowed') : 'Not protected' });
  return out;
}
export async function accessibilityCheck() {
  const S = X.S; if (!S.pages.length) return;
  const checks = await accessibilityChecks(); const passed = checks.filter(c => c.ok).length;
  const list = h('div', { class: 'a11y-list' }, ...checks.map(c => h('div', { class: 'a11y ' + (c.ok ? 'ok' : c.warn ? 'warn' : 'bad') },
    h('span', { class: 'a11y-ic' }, c.ok ? '✓' : c.warn ? '!' : '✕'), h('div', { class: 'grow' }, h('div', {}, c.label), h('div', { class: 'muted', style: { fontSize: '11.5px' } }, c.detail)),
    !c.ok && c.fix ? h('button', { class: 'btn sm', onclick: () => { document.querySelector('.modal-back')?.remove(); c.fix[1](); } }, c.fix[0]) : null)));
  await UI.modal({ title: `Accessibility check — ${passed} of ${checks.length} passed`, width: 560, body: h('div', {}, list, h('div', { class: 'muted', style: { marginTop: '10px', fontSize: '11.5px' } }, 'This is a quick check, not a full PDF/UA audit.')) });
  return checks;
}
