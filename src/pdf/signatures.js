// Digital signatures UI for BTS PDF Pro: personal certificate (create / import .p12 / .pfx), sign or certify
// with a visible or invisible signature, and the Signatures panel that validates signatures in opened PDFs.
import { X, loadScript } from './ctx.js';
import * as SC from './sigcore.js';
const { h } = UI;
const KEY = 'bts.pdf.cert';
let ident = null; // { key, cert, chain, path, name } kept for this session only (never the password)
let forgeP = null;
export async function ready() { if (!forgeP) forgeP = loadScript('../vendor/pdf-forge/forge.min.js').then(() => window.forge); return forgeP; }
const remembered = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
const remember = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { } };
const fmtDate = d => d ? new Date(d).toLocaleString() : '—';

// ---------------------------------------------------------------- certificates
export async function createCertificateDialog(preset = {}) {
  await ready();
  const v = preset.name ? preset : await UI.form({ title: 'Create personal certificate', width: 460, fields: [
    { key: 'name', label: 'Your name', value: X.S.author || '' }, { key: 'email', label: 'Email', value: '' }, { key: 'org', label: 'Organisation (school, college or company)', value: '' },
    { key: 'years', label: 'Valid for', type: 'select', value: '3', options: [{ value: '1', label: '1 year' }, { value: '2', label: '2 years' }, { value: '3', label: '3 years' }, { value: '5', label: '5 years' }, { value: '10', label: '10 years' }] },
    { key: 'pw', label: 'Password to protect the certificate file', type: 'password', value: '' }, { key: 'pw2', label: 'Repeat the password', type: 'password', value: '' }], ok: 'Create' });
  if (!v) return null;
  if (!v.name?.trim()) { UI.toast('Enter your name', 'err'); return null; }
  if (!v.pw || v.pw.length < 4) { UI.toast('Choose a password of at least 4 characters', 'err'); return null; }
  if (v.pw !== v.pw2) { UI.toast('The passwords do not match', 'err'); return null; }
  UI.toast('Creating your certificate (RSA 2048)…');
  const id = await SC.createIdentity({ name: v.name.trim(), email: (v.email || '').trim(), org: (v.org || '').trim(), years: +v.years || 3 });
  const p12 = SC.toP12(id, v.pw);
  const path = preset.path || await X.IO.saveAs({ data: p12, defaultPath: v.name.trim().replace(/[^\w.-]+/g, '_') + '.p12', filters: [{ name: 'Certificate (PKCS#12)', extensions: ['p12', 'pfx'] }] });
  if (preset.path) await X.IO.write({ path, data: p12 });
  if (!path) { UI.toast('The certificate was not saved'); return null; }
  ident = { ...id, path, name: v.name.trim() }; remember({ path, name: v.name.trim() });
  UI.toast('Certificate saved. Keep the file and its password safe: it is your signing identity.', 'ok', 6000);
  renderPanel();
  return ident;
}
export async function importCertificateDialog(preset = {}) {
  await ready();
  let file = preset.file;
  if (!file) { const fs = await X.IO.open({ filters: [{ name: 'Certificate (PKCS#12)', extensions: ['p12', 'pfx'] }] }); if (!fs) return null; file = fs[0]; }
  return unlock(new Uint8Array(file.data), file.path || null, file.name, preset.password);
}
async function unlock(bytes, path, name, pw) {
  for (let tries = 0; tries < 3; tries++) {
    const p = pw ?? await UI.prompt('Certificate password', `Password for ${name || 'the certificate'}`, '', 'password');
    if (p == null) return null;
    try {
      const id = SC.fromP12(bytes, p); const info = SC.certInfo(id.cert);
      ident = { ...id, path, name: info.cn }; if (path) remember({ path, name: info.cn });
      UI.toast(`Using the certificate of ${info.cn}`, 'ok'); renderPanel(); return ident;
    } catch (e) {
      if (e.code === 'BAD_PASSWORD') { UI.toast('Wrong password', 'err'); if (pw != null) return null; continue; }
      UI.toast(e.code === 'NO_KEY' ? 'This file has no private key, so it cannot be used for signing.' : e.code === 'UNSUPPORTED_KEY' ? 'Only RSA certificates are supported.' : 'This certificate file cannot be read: ' + e.message, 'err', 6000); return null;
    }
  }
  return null;
}
export async function identity() {
  await ready();
  if (ident) return ident;
  const r = remembered();
  if (r?.path) { try { const f = await X.IO.read(r.path); const id = await unlock(new Uint8Array(f.data), r.path, r.name); if (id) return id; } catch { UI.toast('The saved certificate file was not found: ' + r.path, 'err'); } }
  const c = await UI.modal({ title: 'Digital signature', width: 460, body: 'To sign digitally you need a personal certificate (a .p12 or .pfx file). Create one now, or use one you already have.', buttons: [{ label: 'Cancel', value: null }, { label: 'Import .p12 / .pfx…', value: 'imp' }, { label: 'Create certificate…', primary: true, value: 'new' }] });
  if (c === 'new') return createCertificateDialog(); if (c === 'imp') return importCertificateDialog(); return null;
}
export function forget() { ident = null; remember(null); UI.toast('The certificate will no longer be used automatically'); renderPanel(); }

// ---------------------------------------------------------------- signing
// drag a rectangle on a page; resolves { pg, rect: [x1,y1,x2,y2] } or null
export function pickRect(msg) {
  return new Promise(res => {
    const st = document.getElementById('stage'); st.classList.add('sig-place'); UI.toast(msg, '', 5000);
    let box = null, start = null, pg = null;
    const done = v => { st.classList.remove('sig-place'); st.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key, true); box?.remove(); res(v); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); UI.toast('Signing cancelled'); done(null); } };
    const down = e => {
      const el = e.target.closest('.page'); if (!el || e.button) return; e.preventDefault(); e.stopPropagation();
      pg = X.pageById(el.dataset.id); const r = el.getBoundingClientRect(); start = [e.clientX - r.left, e.clientY - r.top];
      box = h('div', { class: 'sig-rect' }); el.append(box);
      const mv = ev => { const x = ev.clientX - r.left, y = ev.clientY - r.top; Object.assign(box.style, { left: Math.min(x, start[0]) + 'px', top: Math.min(y, start[1]) + 'px', width: Math.abs(x - start[0]) + 'px', height: Math.abs(y - start[1]) + 'px' }); };
      const up = ev => {
        window.removeEventListener('pointermove', mv, true); window.removeEventListener('pointerup', up, true);
        let x = ev.clientX - r.left, y = ev.clientY - r.top;
        if (Math.abs(x - start[0]) < 8 || Math.abs(y - start[1]) < 8) { const s = pg._vp.scale; x = start[0] + 200 * s; y = start[1] + 60 * s; } // a click: default size
        const a = pg._vp.convertToPdfPoint(start[0], start[1]), b = pg._vp.convertToPdfPoint(x, y);
        done({ pg, rect: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])] });
      };
      window.addEventListener('pointermove', mv, true); window.addEventListener('pointerup', up, true);
    };
    st.addEventListener('pointerdown', down, true); window.addEventListener('keydown', key, true);
  });
}
const cleanDoc = () => { const S = X.S; return !S.dirty && S.sources.length === 1 && !(S.sources[0].ver > 0) && S.pages.length === S.sources[0].js.numPages && S.pages.every((p, i) => p.src === 0 && p.index === i && !p.rot && !p.crop && !p.annots.length); };
export async function signDialog({ certify = false, preset = null } = {}) {
  const S = X.S; if (!S.pages.length) return UI.toast('Open a PDF first');
  if (S.protect) return UI.toast('Remove password protection before signing (Tools › Remove password protection).', 'err', 6000);
  const id = preset?.identity || await identity(); if (!id) return null;
  const info = SC.certInfo(id.cert);
  const base0 = S.sources[0].bytes; const existing = SC.countSignatures(base0); const mdp = SC.docMdpLevel(base0);
  if (existing && mdp === 1) return UI.toast('This document is certified with "no changes allowed", so it cannot be signed again.', 'err', 7000);
  if (certify && existing) return UI.toast('A document can only be certified before anyone signs it.', 'err', 6000);
  let saved = []; try { saved = JSON.parse(localStorage.getItem('bts.signatures') || '[]'); } catch { }
  const v = preset || await UI.form({ title: certify ? 'Certify document' : 'Sign with certificate', width: 480, fields: [
    { key: 'look', label: 'Appearance', type: 'select', value: 'visible', options: [{ value: 'visible', label: 'Visible: drag a box on the page' }, { value: 'invisible', label: 'Invisible (shown only in the Signatures panel)' }] },
    { key: 'img', label: 'Signature image', type: 'select', value: saved.length ? '0' : 'none', options: [{ value: 'none', label: 'None (name and date only)' }, ...saved.map((_, i) => ({ value: String(i), label: `Saved signature ${i + 1}` }))] },
    { key: 'name', label: 'Name shown', value: info.cn }, { key: 'reason', label: 'Reason', value: certify ? 'I am the author of this document' : 'I approve this document' }, { key: 'location', label: 'Location', value: '' },
    ...(certify ? [{ key: 'level', label: 'Changes allowed after certifying', type: 'select', value: '2', options: [{ value: '1', label: 'No changes' }, { value: '2', label: 'Form filling and signing' }, { value: '3', label: 'Form filling, signing and comments' }] }] : [])], ok: certify ? 'Certify' : 'Sign' });
  if (!v) return null;
  // the bytes to sign: the original file (incremental, keeps earlier signatures) or the current edits
  let base, rewrite = false;
  if (cleanDoc()) base = base0;
  else {
    if (existing && !(await UI.confirm('Save changes first', `Your changes must be written into the document before it is signed. This rewrites the file, so the ${existing} existing signature(s) will no longer be valid. Continue?`, 'Continue'))) return null;
    base = await X.buildPdf(); rewrite = true;
  }
  let place = null;
  if (v.look === 'visible') { place = v.page != null ? { pg: S.pages[v.page], rect: v.rect } : await pickRect('Drag a box where the signature should appear (Esc to cancel)'); if (!place) return null; }
  const img = v.img && v.img !== 'none' && saved[+v.img] ? await X.dataUrlBytes(saved[+v.img]) : null;
  UI.toast(certify ? 'Certifying…' : 'Signing…');
  let signed;
  try {
    signed = await SC.signPdf(base, id, { page: place ? S.pages.indexOf(place.pg) : 0, rect: place?.rect || null, image: img && isPng(img) ? img : img ? await X.toPngBytes(img) : null, name: v.name, reason: v.reason, location: v.location, certify: certify ? +v.level || 2 : 0,
      labelSigned: 'Digitally signed by', labelDate: 'Date', labelReason: 'Reason', labelLocation: 'Location' });
  } catch (e) { console.error(e); UI.toast('Signing failed: ' + (e.code === 'ENCRYPTED' ? 'the document is encrypted' : e.message), 'err', 6000); return null; }
  const def = (S.fileName || 'document.pdf').replace(/(-signed)?\.pdf$/i, '') + '-signed.pdf';
  const path = v.savePath ? (await X.IO.write({ path: v.savePath, data: signed }), v.savePath) : await X.IO.saveAs({ data: signed, defaultPath: def, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (!path) { UI.toast('The signed document was not saved'); return null; }
  await X.openDoc(signed, path.split(/[\\/]/).pop(), path, { replace: true, force: true });
  UI.toast(certify ? 'Document certified and saved' : `Signed and saved as ${path.split(/[\\/]/).pop()}`, 'ok', 5000);
  X.showLeft('sigs');
  return { path, bytes: signed };
}
const isPng = b => b[0] === 0x89 && b[1] === 0x50;

// warn before a normal save rewrites a signed document
export async function guardSave() {
  const S = X.S; const n = SC.countSignatures(S.sources[0]?.bytes || new Uint8Array());
  if (!n) return 'rewrite';
  if (!S.dirty) return 'keep';
  return (await UI.confirm('Signed document', `This document has ${n} digital signature(s). Saving your changes rewrites the file and the signatures will show as invalid. Save anyway?`, 'Save anyway')) ? 'rewrite' : 'cancel';
}

// ---------------------------------------------------------------- validation panel
const cache = new WeakMap();
export async function validate(bytes) { await ready(); if (!cache.has(bytes)) cache.set(bytes, SC.verifyPdf(bytes)); return cache.get(bytes); }
export async function onOpened() {
  const b = X.S.sources[0]?.bytes; if (!b || !SC.countSignatures(b)) { renderPanel(); return; }
  const res = await validate(b);
  const bad = res.filter(r => !r.ok).length;
  UI.toast(bad ? 'This document has a signature that is not valid. See the Signatures panel.' : `This document is digitally signed (${res.length} signature(s)). See the Signatures panel.`, bad ? 'err' : 'ok', 6000);
  X.showLeft('sigs');
}
function statusOf(r) {
  if (r.error) return { cls: 'bad', head: 'Could not be checked', text: `This signature could not be checked: ${r.error}` };
  if (!r.digestOk) return { cls: 'bad', head: 'INVALID', text: 'The document has been altered or corrupted since it was signed.' };
  if (!r.sigOk) return { cls: 'bad', head: 'INVALID', text: "The signature does not match the signer's certificate." };
  if (r.coversWhole) return { cls: 'ok', head: 'Valid', text: 'The document has not been modified since this signature was applied.' };
  return { cls: 'ok', head: 'Valid', text: 'The signed version is intact. The document was changed after this signature was applied.' };
}
export async function renderPanel() {
  const S = X.S; if (S.leftTab !== 'sigs') return;
  const b = document.getElementById('lpBody'); b.innerHTML = '';
  const head = h('div', { class: 'sg-actions' },
    h('button', { class: 'btn sm primary', onclick: () => signDialog() }, 'Sign…'),
    h('button', { class: 'btn sm', onclick: () => signDialog({ certify: true }) }, 'Certify…'),
    h('button', { class: 'btn sm', onclick: () => certMenu() }, 'Certificate…'));
  b.append(head);
  const r0 = remembered();
  b.append(h('div', { class: 'muted sg-who' }, ident ? `Signing as ${ident.name}` : r0?.name ? `Certificate: ${r0.name}` : 'No certificate chosen yet'));
  const bytes = S.sources[0]?.bytes;
  if (!bytes || !S.pages.length) { b.append(h('div', { class: 'muted', style: { padding: '14px' } }, 'Open a PDF to see its signatures')); return; }
  if (!SC.countSignatures(bytes)) { b.append(h('div', { class: 'muted', style: { padding: '14px' } }, 'This document has no digital signatures.')); return; }
  const wait = h('div', { class: 'muted', style: { padding: '14px' } }, 'Checking signatures…'); b.append(wait);
  const res = await validate(bytes); wait.remove();
  if (S.leftTab !== 'sigs' || S.sources[0]?.bytes !== bytes) return;
  const bad = res.filter(r => !r.ok).length;
  b.append(h('div', { class: 'sg-sum ' + (bad ? 'bad' : 'ok') }, bad ? `${bad} of ${res.length} signature(s) are NOT valid.` : `All ${res.length} signature(s) are valid.`, h('div', { class: 'muted' }, "Signer identities are not verified: BTS PDF Pro has no list of trusted certificate authorities.")));
  if (S.dirty) b.append(h('div', { class: 'sg-sum warn' }, 'You have unsaved changes. Saving them rewrites the file and the signatures will become invalid.'));
  for (const r of res) {
    const st = statusOf(r);
    const later = !r.coversWhole && r.laterRevisions ? h('div', { class: 'sg-l' }, `Later changes: ${r.laterRevisions} revision(s) added after signing, including ${r.laterSignatures} later signature(s).`) : null;
    const trust = r.error ? null : r.selfSigned ? h('div', { class: 'sg-l warn' }, 'Identity not verified: the certificate is self-signed, so anyone could create one with this name. Confirm the fingerprint with the signer.')
      : h('div', { class: 'sg-l warn' }, `Identity not verified: the certificate was issued by ${r.issuer || 'an unknown authority'}, which is not in a trusted list.`);
    const card = h('div', { class: 'sg-card ' + st.cls },
      h('div', { class: 'sg-t' }, h('span', { class: 'sg-ico' }, st.cls === 'ok' ? '✓' : '✗'), h('b', {}, r.field), h('span', { class: 'sg-st' }, st.head)),
      h('div', { class: 'sg-l' }, r.signer ? `Signed by ${r.signer}` : ''), h('div', { class: 'sg-l' }, st.text), later, trust,
      r.signingTime ? h('div', { class: 'sg-l muted' }, `Signing time: ${fmtDate(r.signingTime)}`) : null,
      r.reason ? h('div', { class: 'sg-l muted' }, `Reason: ${r.reason}`) : null, r.location ? h('div', { class: 'sg-l muted' }, `Location: ${r.location}`) : null,
      r.docMdp ? h('div', { class: 'sg-l muted' }, ['', 'Certified: no changes allowed', 'Certified: form filling and signing allowed', 'Certified: form filling, signing and comments allowed'][r.docMdp]) : null,
      r.error ? null : h('button', { class: 'btn sm ghost', onclick: () => details(r) }, 'Certificate details…'));
    b.append(card);
  }
}
function details(r) {
  const row = (k, v) => `<tr><td style="color:var(--tx-2);padding:3px 10px 3px 0;vertical-align:top">${k}</td><td style="color:var(--tx-0);word-break:break-all">${X.esc(String(v ?? '—'))}</td></tr>`;
  UI.modal({ title: 'Signature details', width: 520, body: '<table style="width:100%;border-collapse:collapse;font-size:12.5px">' +
    row('Field', r.field) + row('Signer', r.signer) + row('Email', r.email) + row('Organisation', r.org) + row('Issued by', r.selfSigned ? 'Self-signed' : r.issuer) +
    row('Certificate valid from', fmtDate(r.notBefore)) + row('Certificate valid until', fmtDate(r.notAfter)) + row('Valid at signing time', r.certValidAtSigning ? 'Yes' : 'No') +
    row('Serial number', r.serial) + row('SHA-256 fingerprint', r.fingerprint) + row('Signature format', r.subFilter) + row('Digest algorithm', r.digestAlg) +
    row('Document digest matches', r.digestOk ? 'Yes' : 'No') + row('Signature matches certificate', r.sigOk ? 'Yes' : 'No') + row('Covers the whole file', r.coversWhole ? 'Yes' : 'No') + row('Byte range', r.byteRange.join(' ')) + '</table>' });
}
async function certMenu() {
  const r = await UI.modal({ title: 'Signing certificate', width: 460, body: ident ? `Current certificate: ${ident.name}${ident.path ? '<br><span class="muted">' + X.esc(ident.path) + '</span>' : ''}` : 'No certificate is in use.', buttons: [{ label: 'Close', value: null }, { label: 'Forget', value: 'forget' }, { label: 'Import…', value: 'imp' }, { label: 'Create…', primary: true, value: 'new' }] });
  if (r === 'new') createCertificateDialog(); else if (r === 'imp') importCertificateDialog(); else if (r === 'forget') forget();
}
