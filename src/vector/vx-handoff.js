// BTS Vector — File › Send to (Photo / Video / PDF Pro) and receiving payloads from the other BTS Creative apps.
(() => {
const { P, DOC } = VX; const { toast, form, confirm } = UI;
const safe = s => String(s || 'artwork').replace(/\.\w+$/, '').replace(/[\\/:*?"<>|]+/g, '_') || 'artwork';
const pngBytes = async c => UI.blobToU8(await new Promise(r => c.toBlob(r, 'image/png')));

// what to send: the selection when there is one, otherwise the current artboard
function source() {
  if (VX.sel.length) { const rect = VX.selBounds(); return { rect, opts: { rect, only: [...VX.sel], bg: false }, what: 'selection' }; }
  const rect = VX.abRect(); return { rect, opts: { board: DOC.ab }, what: 'artboard' };
}
async function payloadFor(app, extra = {}) {
  const base = safe(DOC.name);
  if (app === 'photo') {
    const s = source(); const c = await VX.svgToCanvas(VX.svgString(false, s.opts), s.rect.width, s.rect.height, 2, null);
    return { kind: 'image', name: base + '.png', mime: 'image/png', data: await pngBytes(c), meta: { from: 'vector', scale: 2, width: c.width, height: c.height, source: s.what } };
  }
  if (app === 'video') {
    const s = source(); const scale = extra.size === 'artboard' ? 1 : 1920 / Math.max(1, s.rect.width);
    const c = await VX.svgToCanvas(VX.svgString(false, { ...s.opts, bg: false }), s.rect.width, s.rect.height, scale, null);
    return { kind: 'image', name: base + '.png', mime: 'image/png', data: await pngBytes(c), meta: { from: 'vector', transparent: true, width: c.width, height: c.height, source: s.what } };
  }
  if (app === 'pdf') {
    const data = await VX.exportTo({ fmt: 'pdf', scope: extra.scope || (DOC.boards.length > 1 ? 'all' : 'board'), outlineText: extra.outlineText !== false, path: 'bytes' });
    if (!data || !data.length) throw new Error('Could not build the PDF');
    return { kind: 'pdf', name: base + '.pdf', mime: 'application/pdf', data, meta: { from: 'vector', pages: extra.scope === 'board' ? 1 : DOC.boards.length } };
  }
  throw new Error('Unknown app ' + app);
}
VX.f.handoffPayload = payloadFor;
VX.f.sendTo = async (app, extra) => {
  try {
    VX.flushCommit(); VX.finishText?.(true);
    if (app === 'video' && !extra) { const v = await form({ title: 'Send to Video', ok: 'Send', fields: [{ key: 'size', label: 'Size', type: 'select', value: '1920', options: [{ value: '1920', label: 'Transparent PNG, 1920 px wide' }, { value: 'artboard', label: 'Transparent PNG at artboard size' }] }] }); if (!v) return; extra = v; }
    if (app === 'pdf' && !extra && DOC.boards.length > 1) { const v = await form({ title: 'Send to PDF Pro', ok: 'Send', fields: [{ key: 'scope', label: 'Pages', type: 'select', value: 'all', options: [{ value: 'all', label: 'All artboards' }, { value: 'board', label: 'Current artboard only' }] }] }); if (!v) return; extra = v; }
    const p = await payloadFor(app, extra || {});
    await VX.handoffSend(app, p);
    toast(app === 'photo' ? 'Sent to BTS Photo' : app === 'video' ? 'Sent to BTS Video' : 'Sent to BTS PDF Pro', 'ok');
    return p;
  } catch (e) { console.error(e); toast('Could not send: ' + e.message, 'err', 6000); }
};

// indirections so tests can stub the IPC (the preload's bts object is read-only)
VX.handoffSend = (app, p) => bts.handoff.send(app, p);
VX.handoffTake = () => (window.bts?.handoff?.take ? bts.handoff.take() : Promise.resolve(null));
VX.f.bootHandoff = async () => { try { const p = await VX.handoffTake(); if (p) return await VX.f.receiveHandoff(p); } catch (e) { console.warn('handoff', e); } return null; };
// receive a payload from another app (called at start-up with bts.handoff.take())
VX.f.receiveHandoff = async p => {
  if (!p || !p.data) return null;
  const data = p.data instanceof Uint8Array ? p.data : new Uint8Array(p.data);
  try {
    if (p.kind === 'svg' || /svg/.test(p.mime || '')) return await VX.openFile({ name: /\.svg$/i.test(p.name || '') ? p.name : 'received.svg', data });
    if (p.kind === 'pdf' || /pdf/.test(p.mime || '')) return await VX.f.importVector({ name: p.name || 'received.pdf', data }, { mode: 'open', ask: !(p.meta && p.meta.noAsk) });
    if (p.kind === 'image' || /^image\//.test(p.mime || '')) {
      const name = p.name || 'image.png'; const url = await VX.toDataUrl(data, /\.(png|jpe?g|webp|svg)$/i.test(name) ? name : 'image.png');
      const im = new Image(); im.src = url; await im.decode();
      const fresh = VX.hist.length <= 1 && !VX.selectableItems().length;
      if (fresh) { DOC.boards[DOC.ab].w = im.naturalWidth; DOC.boards[DOC.ab].h = im.naturalHeight; DOC.name = name.replace(/\.\w+$/, '.btsv'); VX.drawArtboard(); VX.fitArt(); }
      const ab = VX.abRect(); const r = await VX.placeRaster(url, ab.center); r.name = VX.safeItemName(name);
      if (fresh) { r.scale(ab.width / r.bounds.width); r.position = ab.center; VX.resetHistory('Open'); UI.setDocTitle(DOC.name, 'BTS Vector'); }
      VX.setSel([r]);
      if (p.meta && p.meta.trace) { if (await confirm('Image Trace now?', 'Convert the received image to vector paths with Image Trace.', 'Trace')) { VX.setSel([r]); await VX.f.trace?.(); } }
      return r;
    }
    toast('Received an unsupported item', 'err');
  } catch (e) { console.error(e); toast('Could not open the received item: ' + e.message, 'err', 7000); }
  return null;
};
})();
