// Real digital signatures for BTS PDF Pro (PAdES-compatible CMS, SubFilter adbe.pkcs7.detached).
// - personal certificate: self-signed X.509, RSA 2048 (WebCrypto key generation, node-forge for X.509/PKCS#12)
// - signing: signature field + widget appended as an INCREMENTAL UPDATE (earlier signatures stay valid),
//   /ByteRange + /Contents placeholder, SHA-256 digest, CMS SignedData with contentType, messageDigest and
//   signingTime attributes; optional certification (DocMDP)
// - validation: recompute the digest over the ByteRange, verify the CMS signature and report the signer.
// Pure module (no DOM): runs under Node for the automated tests. Needs globalThis.forge and globalThis.PDFLib.
const F = () => globalThis.forge;
const PL = () => globalThis.PDFLib;
const enc = new TextEncoder();
const bin = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return s; };
const u8 = s => { const o = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) o[i] = s.charCodeAt(i) & 255; return o; };
const concat = arr => { const n = arr.reduce((s, a) => s + a.length, 0); const o = new Uint8Array(n); let k = 0; for (const a of arr) { o.set(a, k); k += a.length; } return o; };
const subtle = () => globalThis.crypto?.subtle;

// ------------------------------------------------------------------ keys & certificates
export async function generateKey() {
  const forge = F();
  if (subtle()) {
    try {
      const kp = await subtle().generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
      const pk8 = new Uint8Array(await subtle().exportKey('pkcs8', kp.privateKey));
      const asn = forge.asn1.fromDer(bin(pk8));
      const privateKey = forge.pki.privateKeyFromAsn1(forge.pki.privateKeyInfoToAsn1 ? asn : asn);
      return { privateKey, publicKey: forge.pki.setRsaPublicKey(privateKey.n, privateKey.e) };
    } catch (e) { /* fall back to forge */ }
  }
  return new Promise((res, rej) => forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001, workers: -1 }, (err, kp) => err ? rej(err) : res(kp)));
}
export async function createIdentity({ name, email = '', org = '', years = 3, unit = '' }) {
  const forge = F(); const { privateKey, publicKey } = await generateKey();
  const cert = forge.pki.createCertificate();
  cert.publicKey = publicKey;
  const sn = forge.util.bytesToHex(forge.random.getBytesSync(15)); cert.serialNumber = (parseInt(sn[0], 16) & 7).toString(16) + sn.slice(1); // positive
  const now = new Date(); cert.validity.notBefore = new Date(now.getTime() - 5 * 60000); cert.validity.notAfter = new Date(now.getTime()); cert.validity.notAfter.setFullYear(now.getFullYear() + Math.max(1, Math.min(30, +years || 3)));
  const attrs = [{ name: 'commonName', value: name }];
  if (org) attrs.push({ name: 'organizationName', value: org }); if (unit) attrs.push({ shortName: 'OU', value: unit }); if (email) attrs.push({ name: 'emailAddress', value: email });
  cert.setSubject(attrs); cert.setIssuer(attrs);
  const ext = [{ name: 'basicConstraints', cA: false }, { name: 'keyUsage', digitalSignature: true, nonRepudiation: true }, { name: 'extKeyUsage', emailProtection: true }, { name: 'subjectKeyIdentifier' }];
  if (email) ext.push({ name: 'subjectAltName', altNames: [{ type: 1, value: email }] });
  cert.setExtensions(ext);
  cert.sign(privateKey, forge.md.sha256.create());
  return { key: privateKey, cert, chain: [cert] };
}
export function toP12(id, password, friendlyName) {
  const forge = F();
  const asn = forge.pkcs12.toPkcs12Asn1(id.key, id.chain?.length ? id.chain : [id.cert], password, { algorithm: '3des', friendlyName: friendlyName || certInfo(id.cert).cn, generateLocalKeyId: true });
  return u8(forge.asn1.toDer(asn).getBytes());
}
export function fromP12(bytes, password) {
  const forge = F(); let p12;
  try { p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bin(bytes)), false, password); }
  catch (e) { const err = new Error(/mac|password|Invalid/i.test(e.message) ? 'BAD_PASSWORD' : e.message); err.code = /mac|password|Invalid/i.test(e.message) ? 'BAD_PASSWORD' : 'BAD_FILE'; throw err; }
  const keys = [...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []), ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || [])];
  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []).map(b => b.cert).filter(Boolean);
  const key = keys.find(k => k.key)?.key; if (!key) { const e = new Error('NO_KEY'); e.code = 'NO_KEY'; throw e; }
  if (!key.n) { const e = new Error('Only RSA keys are supported'); e.code = 'UNSUPPORTED_KEY'; throw e; }
  const cert = certs.find(c => c.publicKey?.n && c.publicKey.n.equals(key.n)) || certs[0]; if (!cert) { const e = new Error('NO_CERT'); e.code = 'NO_CERT'; throw e; }
  return { key, cert, chain: [cert, ...certs.filter(c => c !== cert)] };
}
const attr = (rdn, n) => rdn.getField(n)?.value || '';
export function certInfo(cert) {
  const forge = F();
  const selfSigned = (() => { try { return cert.isIssuer(cert) && cert.verify(cert); } catch { return false; } })();
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const md = forge.md.sha256.create(); md.update(der);
  return { cn: attr(cert.subject, 'CN'), email: attr(cert.subject, 'E') || attr(cert.subject, 'emailAddress'), o: attr(cert.subject, 'O'), issuerCn: attr(cert.issuer, 'CN'), issuerO: attr(cert.issuer, 'O'), selfSigned, notBefore: cert.validity.notBefore, notAfter: cert.validity.notAfter, serial: cert.serialNumber, fingerprint: md.digest().toHex().toUpperCase().match(/.{2}/g).join(':') };
}

// ------------------------------------------------------------------ helpers
const pdfDate = d => { const p = n => String(n).padStart(2, '0'); const off = -d.getTimezoneOffset(), s = off >= 0 ? '+' : '-', a = Math.abs(off); return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${s}${p(Math.floor(a / 60))}'${p(a % 60)}'`; };
const hexText = s => PL().PDFHexString.fromText(String(s)).toString();
async function sha(alg, parts) {
  const name = { sha1: 'SHA-1', sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' }[alg];
  if (subtle() && name) return new Uint8Array(await subtle().digest(name, concat(parts)));
  const md = F().md[alg].create(); for (const p of parts) md.update(bin(p)); return u8(md.digest().getBytes());
}
function lastStartXref(bytes) {
  const tail = bin(bytes.subarray(Math.max(0, bytes.length - 2048)));
  const m = [...tail.matchAll(/startxref\s+(\d+)/g)].pop(); if (!m) throw new Error('No startxref');
  return +m[1];
}
export function countSignatures(bytes) { return [...bin(bytes).matchAll(/\/ByteRange\s*\[\s*\d+\s+\d+\s+\d+\s+\d+\s*\]/g)].length; }
export function docMdpLevel(bytes) {
  const s = bin(bytes); const m = /\/TransformMethod\s*\/DocMDP[\s\S]{0,200}?\/P\s+(\d)/.exec(s); return m ? +m[1] : 0;
}

// ------------------------------------------------------------------ signing
// opts: { page: index, rect: [x1,y1,x2,y2] | null (invisible), image: PNG bytes, name, reason, location, contact,
//         showText: true, date: Date, certify: 0|1|2|3, fieldName, reserve: bytes for the signature (default 8192) }
export async function signPdf(bytes, id, opts = {}) {
  const L = PL(), forge = F(); const N = k => L.PDFName.of(k);
  if (/\/Encrypt\s/.test(bin(bytes.subarray(Math.max(0, bytes.length - 4096))))) { const e = new Error('ENCRYPTED'); e.code = 'ENCRYPTED'; throw e; }
  const doc = await L.PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true });
  if (doc.context.trailerInfo.Encrypt) { const e = new Error('ENCRYPTED'); e.code = 'ENCRYPTED'; throw e; }
  const ctx = doc.context;
  // object numbers used by the original file (incl. object streams / xref streams pdf-lib does not keep)
  const sizes = [...bin(bytes).matchAll(/\/Size\s+(\d+)/g)].map(m => +m[1]);
  ctx.largestObjectNumber = Math.max(ctx.largestObjectNumber, ...sizes.map(n => n - 1));
  const maxOld = ctx.largestObjectNumber;
  const modified = new Set();
  const date = opts.date || new Date(); const info = certInfo(id.cert);
  const page = doc.getPage(Math.max(0, Math.min(doc.getPageCount() - 1, opts.page || 0)));
  // field name
  const existing = countSignatures(bytes); const fieldName = opts.fieldName || `Signature${existing + 1}`;
  // appearance
  let apRef = null; const rect = opts.rect ? opts.rect.map(Number) : [0, 0, 0, 0];
  const w = Math.abs(rect[2] - rect[0]), hh = Math.abs(rect[3] - rect[1]);
  if (w > 1 && hh > 1) {
    const res = {}; let content = '';
    let textX = 4;
    if (opts.image) {
      const img = await doc.embedPng(opts.image); res.XObject = { Img: img.ref };
      const areaW = opts.showText === false ? w : w * 0.42, sc = Math.min((areaW - 4) / img.width, (hh - 4) / img.height);
      const iw = img.width * sc, ih = img.height * sc, ix = 2 + (areaW - 4 - iw) / 2, iy = (hh - ih) / 2;
      content += `q ${iw.toFixed(3)} 0 0 ${ih.toFixed(3)} ${ix.toFixed(3)} ${iy.toFixed(3)} cm /Img Do Q\n`; textX = areaW + 2;
    }
    if (opts.showText !== false) {
      const font = await doc.embedFont(L.StandardFonts.Helvetica), bold = await doc.embedFont(L.StandardFonts.HelveticaBold);
      res.Font = { F1: font.ref, F2: bold.ref };
      const safe = (f, s) => [...String(s)].map(ch => { try { f.encodeText(ch); return ch; } catch { return '?'; } }).join('');
      const lines = [['F1', opts.labelSigned || 'Digitally signed by'], ['F2', opts.name || info.cn], ['F1', `${opts.labelDate || 'Date'}: ${pdfDate(date).slice(2, 10).replace(/(\d{4})(\d\d)(\d\d)/, '$1.$2.$3')} ${date.toTimeString().slice(0, 8)}`]];
      if (opts.reason) lines.push(['F1', `${opts.labelReason || 'Reason'}: ${opts.reason}`]);
      if (opts.location) lines.push(['F1', `${opts.labelLocation || 'Location'}: ${opts.location}`]);
      const avail = w - textX - 3; let size = Math.min(12, (hh - 4) / (lines.length * 1.2));
      for (const [f, t] of lines) { const pf = f === 'F2' ? bold : font; const tw = pf.widthOfTextAtSize(safe(pf, t), size); if (tw > avail) size = Math.max(3, size * avail / tw); }
      const top = hh / 2 + lines.length * size * 1.2 / 2 - size;
      content += 'BT 0 g\n';
      lines.forEach(([f, t], i) => { const pf = f === 'F2' ? bold : font; content += `/${f} ${size.toFixed(2)} Tf 1 0 0 1 ${textX.toFixed(2)} ${(top - i * size * 1.2).toFixed(2)} Tm ${pf.encodeText(safe(pf, t)).toString()} Tj\n`; });
      content += 'ET\n';
    }
    const ap = ctx.stream(content, { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, w, hh], Resources: res });
    apRef = ctx.register(ap);
  }
  await doc.flush(); // embed fonts / images as new objects
  // signature value (written by hand below so the placeholders have fixed positions)
  const sigRef = ctx.nextRef();
  const widget = { Type: 'Annot', Subtype: 'Widget', FT: 'Sig', Rect: [Math.min(rect[0], rect[2]), Math.min(rect[1], rect[3]), Math.max(rect[0], rect[2]), Math.max(rect[1], rect[3])], V: sigRef, T: L.PDFHexString.fromText(fieldName), F: 132, P: page.ref };
  if (apRef) widget.AP = { N: apRef };
  const wRef = ctx.register(ctx.obj(widget));
  // page /Annots
  const rawAnnots = page.node.get(N('Annots'));
  if (rawAnnots instanceof L.PDFRef) { ctx.lookup(rawAnnots).push(wRef); modified.add(rawAnnots); }
  else { if (rawAnnots instanceof L.PDFArray) rawAnnots.push(wRef); else page.node.set(N('Annots'), ctx.obj([wRef])); modified.add(page.ref); }
  // AcroForm
  const rootRef = ctx.trailerInfo.Root; const catalog = ctx.lookup(rootRef);
  let acroRaw = catalog.get(N('AcroForm')), acro;
  if (acroRaw instanceof L.PDFRef) { acro = ctx.lookup(acroRaw); modified.add(acroRaw); }
  else if (acroRaw instanceof L.PDFDict) { acro = acroRaw; modified.add(rootRef); }
  else { acro = ctx.obj({}); catalog.set(N('AcroForm'), acro); modified.add(rootRef); }
  const fRaw = acro.get(N('Fields'));
  if (fRaw instanceof L.PDFRef) { ctx.lookup(fRaw).push(wRef); modified.add(fRaw); }
  else if (fRaw instanceof L.PDFArray) fRaw.push(wRef);
  else acro.set(N('Fields'), ctx.obj([wRef]));
  acro.set(N('SigFlags'), L.PDFNumber.of(3));
  let ref = '';
  if (opts.certify && !existing) {
    ref = ` /Reference [<< /Type /SigRef /TransformMethod /DocMDP /TransformParams << /Type /TransformParams /P ${opts.certify} /V /1.2 >> >>]`;
    catalog.set(N('Perms'), ctx.obj({ DocMDP: sigRef })); modified.add(rootRef);
  }
  const reserve = opts.reserve || 8192;
  const BR = '/ByteRange [0 9999999999 9999999999 9999999999]';
  const sigText = `<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /adbe.pkcs7.detached ${BR} /Contents <${'0'.repeat(reserve * 2)}> /M (${pdfDate(date)}) /Name ${hexText(opts.name || info.cn)}${opts.reason ? ' /Reason ' + hexText(opts.reason) : ''}${opts.location ? ' /Location ' + hexText(opts.location) : ''}${opts.contact || info.email ? ' /ContactInfo ' + hexText(opts.contact || info.email) : ''}${ref} /Prop_Build << /App << /Name /BTS#20PDF#20Pro >> /Filter << /Name /Adobe.PPKLite >> >> >>`;
  // ---- incremental update
  const objs = [];
  for (const [r, o] of ctx.enumerateIndirectObjects()) if (r.objectNumber > maxOld || modified.has(r)) objs.push([r, o]);
  if (!objs.some(([r]) => r === sigRef)) objs.push([sigRef, null]);
  objs.sort((a, b) => a[0].objectNumber - b[0].objectNumber);
  const chunks = []; let off = bytes.length;
  if (bytes[bytes.length - 1] !== 10 && bytes[bytes.length - 1] !== 13) { chunks.push(u8('\n')); off++; }
  const xr = []; let sigPos = -1;
  for (const [r, o] of objs) {
    const head = u8(`${r.objectNumber} ${r.generationNumber} obj\n`);
    let body;
    if (r === sigRef) { body = u8(sigText); sigPos = off + head.length; }
    else { body = new Uint8Array(o.sizeInBytes()); o.copyBytesInto(body, 0); }
    xr.push({ n: r.objectNumber, g: r.generationNumber, off });
    const tail = u8('\nendobj\n'); chunks.push(head, body, tail); off += head.length + body.length + tail.length;
  }
  const prev = lastStartXref(bytes);
  const prevIsStream = !/^\s*xref/.test(bin(bytes.subarray(prev, prev + 10)));
  const size = Math.max(ctx.largestObjectNumber, sigRef.objectNumber) + 1;
  const trailerExtra = `/Root ${rootRef}${ctx.trailerInfo.Info ? ' /Info ' + ctx.trailerInfo.Info : ''}${ctx.trailerInfo.ID ? ' /ID ' + ctx.trailerInfo.ID : ''} /Prev ${prev}`;
  const xrefOff = off;
  if (!prevIsStream) {
    let t = 'xref\n'; let i = 0;
    while (i < xr.length) { let j = i; while (j + 1 < xr.length && xr[j + 1].n === xr[j].n + 1) j++; t += `${xr[i].n} ${j - i + 1}\n`; for (let k = i; k <= j; k++) t += `${String(xr[k].off).padStart(10, '0')} ${String(xr[k].g).padStart(5, '0')} n\r\n`; i = j + 1; }
    t += `trailer\n<< /Size ${size} ${trailerExtra} >>\nstartxref\n${xrefOff}\n%%EOF\n`;
    chunks.push(u8(t));
  } else { // the original uses a cross-reference stream: continue with one
    const xn = size; const all = [...xr, { n: xn, g: 0, off: xrefOff }];
    const rows = []; const index = []; let i = 0;
    while (i < all.length) { let j = i; while (j + 1 < all.length && all[j + 1].n === all[j].n + 1) j++; index.push(all[i].n, j - i + 1); for (let k = i; k <= j; k++) rows.push(all[k]); i = j + 1; }
    const data = new Uint8Array(rows.length * 7);
    rows.forEach((r, k) => { data[k * 7] = 1; data[k * 7 + 1] = (r.off >>> 24) & 255; data[k * 7 + 2] = (r.off >>> 16) & 255; data[k * 7 + 3] = (r.off >>> 8) & 255; data[k * 7 + 4] = r.off & 255; data[k * 7 + 5] = (r.g >> 8) & 255; data[k * 7 + 6] = r.g & 255; });
    chunks.push(u8(`${xn} 0 obj\n<< /Type /XRef /Size ${xn + 1} ${trailerExtra} /W [1 4 2] /Index [${index.join(' ')}] /Length ${data.length} >>\nstream\n`), data, u8(`\nendstream\nendobj\nstartxref\n${xrefOff}\n%%EOF\n`));
  }
  const out = concat([bytes, ...chunks]);
  // ---- byte range and signature
  const s0 = bin(out.subarray(sigPos, sigPos + sigText.length));
  const brAt = sigPos + s0.indexOf(BR), cAt = sigPos + s0.indexOf('/Contents <') + 10;
  const cEnd = cAt + reserve * 2 + 2;
  const br = [0, cAt, cEnd, out.length - cEnd];
  const brTxt = `/ByteRange [${br.join(' ')}]`; if (brTxt.length > BR.length) throw new Error('ByteRange too long');
  out.set(u8(brTxt.padEnd(BR.length, ' ')), brAt);
  const signed = [out.subarray(0, cAt), out.subarray(cEnd)];
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(bin(signed[0]) + bin(signed[1]));
  for (const c of (id.chain?.length ? id.chain : [id.cert])) p7.addCertificate(c);
  p7.addSigner({ key: id.key, certificate: id.cert, digestAlgorithm: forge.pki.oids.sha256, authenticatedAttributes: [{ type: forge.pki.oids.contentType, value: forge.pki.oids.data }, { type: forge.pki.oids.messageDigest }, { type: forge.pki.oids.signingTime, value: date }] });
  p7.sign({ detached: true });
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  if (der.length > reserve) { if (!opts._retry) return signPdf(bytes, id, { ...opts, reserve: der.length + 4096, _retry: true }); throw new Error('Signature too large'); }
  out.set(u8(forge.util.bytesToHex(der).toUpperCase()), cAt + 1);
  return out;
}

// ------------------------------------------------------------------ validation
const OID = { data: '1.2.840.113549.1.7.1', signedData: '1.2.840.113549.1.7.2', contentType: '1.2.840.113549.1.9.3', messageDigest: '1.2.840.113549.1.9.4', signingTime: '1.2.840.113549.1.9.5', sha1: '1.3.14.3.2.26', sha256: '2.16.840.1.101.3.4.2.1', sha384: '2.16.840.1.101.3.4.2.2', sha512: '2.16.840.1.101.3.4.2.3', rsa: '1.2.840.113549.1.1.1' };
const ALG = { [OID.sha1]: 'sha1', [OID.sha256]: 'sha256', [OID.sha384]: 'sha384', [OID.sha512]: 'sha512', '1.2.840.113549.1.1.5': 'sha1', '1.2.840.113549.1.1.11': 'sha256', '1.2.840.113549.1.1.12': 'sha384', '1.2.840.113549.1.1.13': 'sha512' };
function pdfStr(s, key) {
  const m = new RegExp('/' + key + '\\s*(\\((?:\\\\.|[^\\\\)])*\\)|<[0-9A-Fa-f\\s]*>)').exec(s); if (!m) return '';
  let v = m[1];
  if (v[0] === '<') { const hx = v.slice(1, -1).replace(/\s/g, ''); const b = hx.match(/.{1,2}/g)?.map(x => parseInt(x.padEnd(2, '0'), 16)) || []; if (b[0] === 0xfe && b[1] === 0xff) { let o = ''; for (let i = 2; i + 1 < b.length; i += 2) o += String.fromCharCode(b[i] * 256 + b[i + 1]); return o; } return String.fromCharCode(...b); }
  v = v.slice(1, -1).replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (_, e) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[e] ?? String.fromCharCode(parseInt(e, 8))));
  if (v.charCodeAt(0) === 0xfe && v.charCodeAt(1) === 0xff) { let o = ''; for (let i = 2; i + 1 < v.length; i += 2) o += String.fromCharCode(v.charCodeAt(i) * 256 + v.charCodeAt(i + 1)); return o; }
  return v;
}
const parseDate = s => { const m = /D:(\d{4})(\d\d)?(\d\d)?(\d\d)?(\d\d)?(\d\d)?([+\-Z])?(\d\d)?'?(\d\d)?/.exec(s || ''); if (!m) return null; const [, y, mo = '01', d = '01', hh = '00', mi = '00', ss = '00', z, oh = '00', om = '00'] = m; const t = Date.UTC(+y, +mo - 1, +d, +hh, +mi, +ss); const off = z === '+' ? (+oh * 60 + +om) : z === '-' ? -(+oh * 60 + +om) : 0; return new Date(t - off * 60000); };
export async function verifyPdf(bytes) {
  const forge = F(); const s = bin(bytes); const out = [];
  const re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g; let m;
  const all = [...s.matchAll(re)];
  for (let k = 0; k < all.length; k++) {
    m = all[k]; const br = m.slice(1, 5).map(Number);
    const r = { index: k + 1, byteRange: br, ok: false, problems: [] };
    // the signature dictionary around this ByteRange
    const win0 = Math.max(0, m.index - 80000); const heads = [...s.slice(win0, m.index).matchAll(/(\d+)\s+(\d+)\s+obj\b/g)]; const lastHead = heads[heads.length - 1];
    const dStart = lastHead ? win0 + lastHead.index : Math.max(0, m.index - 200), dEnd = s.indexOf('endobj', m.index); const objNum = lastHead ? lastHead[1] : null;
    const dict = s.slice(dStart, dEnd > 0 ? dEnd : m.index + 2000).replace(/\/Contents\s*<[0-9A-Fa-f]*>/, '');
    r.subFilter = (/\/SubFilter\s*\/([^\s\/<>\[\]]+)/.exec(dict) || [])[1] || '';
    r.reason = pdfStr(dict, 'Reason'); r.location = pdfStr(dict, 'Location'); r.nameInDict = pdfStr(dict, 'Name'); r.contact = pdfStr(dict, 'ContactInfo');
    r.mTime = parseDate(pdfStr(dict, 'M'));
    r.docMdp = /\/TransformMethod\s*\/DocMDP/.test(dict) ? +(/\/P\s+(\d)/.exec(dict.slice(dict.indexOf('/TransformParams'))) || [0, 2])[1] : 0;
    const fm = objNum ? new RegExp('/V\\s+' + objNum + '\\s+0\\s+R').exec(s) : null;
    const wd = fm ? s.slice(s.lastIndexOf('obj', fm.index), s.indexOf('endobj', fm.index)) : '';
    r.field = (wd && pdfStr(wd, 'T')) || `Signature${k + 1}`;
    try {
      if (br[0] !== 0 || br[1] + 0 > bytes.length || br[2] + br[3] > bytes.length || br[1] >= br[2]) throw Object.assign(new Error('The byte range is damaged.'), { msg: 'range' });
      const hex = s.slice(br[1], br[2]).replace(/[<>\s]/g, '');
      r.coversWhole = br[2] + br[3] === bytes.length;
      const der = forge.util.hexToBytes(hex.replace(/(00)+$/, '') + (hex.replace(/(00)+$/, '').length % 2 ? '0' : ''));
      const asn = forge.asn1.fromDer(der, { strict: false, parseAllBytes: false });
      // ContentInfo -> SignedData
      const sd = asn.value[1].value[0]; const parts = sd.value;
      let certs = [], signerInfos = null;
      for (const p of parts) { if (p.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && p.type === 0) certs = p.value.map(c => { try { return forge.pki.certificateFromAsn1(c); } catch { return null; } }).filter(Boolean); if (p.tagClass === forge.asn1.Class.UNIVERSAL && p.type === forge.asn1.Type.SET) signerInfos = p; }
      const si = signerInfos.value[signerInfos.value.length - 1].value;
      let idx = 1; const sid = si[idx++];
      const digOid = forge.asn1.derToOid(si[idx++].value[0].value);
      let signedAttrs = null; if (si[idx].tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && si[idx].type === 0) signedAttrs = si[idx++];
      const sigAlgOid = forge.asn1.derToOid(si[idx++].value[0].value); const sigBytes = si[idx++].value;
      const alg = ALG[digOid]; if (!alg) throw Object.assign(new Error('Unsupported digest algorithm'), { msg: 'alg' });
      // signer certificate (issuer + serial)
      let cert = certs[0];
      try { if (sid.type === forge.asn1.Type.SEQUENCE) { const serial = forge.util.createBuffer(sid.value[1].value).toHex(); cert = certs.find(c => c.serialNumber.replace(/^0+/, '') === serial.replace(/^0+/, '')) || cert; } } catch { }
      if (!cert) throw Object.assign(new Error('No signer certificate'), { msg: 'cert' });
      const ci = certInfo(cert); Object.assign(r, { signer: ci.cn, email: ci.email, org: ci.o, issuer: ci.issuerCn || ci.issuerO, selfSigned: ci.selfSigned, notBefore: ci.notBefore, notAfter: ci.notAfter, fingerprint: ci.fingerprint, serial: ci.serial });
      r.chainLen = certs.length;
      // digest of the signed bytes
      const dig = await sha(alg, [bytes.subarray(br[0], br[0] + br[1]), bytes.subarray(br[2], br[2] + br[3])]);
      let md = null, signingTime = null;
      if (signedAttrs) {
        for (const a of signedAttrs.value) { const oid = forge.asn1.derToOid(a.value[0].value); const v = a.value[1].value[0]; if (oid === OID.messageDigest) md = v.value; if (oid === OID.signingTime) { try { signingTime = v.type === forge.asn1.Type.UTCTIME ? forge.asn1.utcTimeToDate(v.value) : forge.asn1.generalizedTimeToDate(v.value); } catch { } } }
        r.digestOk = md === bin(dig);
        const setDer = forge.asn1.toDer(forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, signedAttrs.value)).getBytes();
        const h = forge.md[alg].create(); h.update(setDer);
        try { r.sigOk = cert.publicKey.verify(h.digest().getBytes(), sigBytes); } catch (e) { r.sigOk = false; if (!cert.publicKey.n) r.problems.push('alg'); }
      } else {
        try { r.sigOk = cert.publicKey.verify(bin(dig), sigBytes); r.digestOk = r.sigOk; } catch { r.sigOk = false; }
      }
      r.signingTime = signingTime || r.mTime;
      r.certValidAtSigning = !r.signingTime || (r.signingTime >= ci.notBefore && r.signingTime <= ci.notAfter);
      r.sigAlg = sigAlgOid; r.digestAlg = alg;
      r.ok = !!(r.digestOk && r.sigOk);
    } catch (e) { r.error = e.message; r.problems.push(e.msg || 'parse'); }
    out.push(r);
  }
  // later revisions after each signature
  for (const r of out) {
    if (r.coversWhole) { r.laterRevisions = 0; r.laterSignatures = 0; continue; }
    const end = r.byteRange[2] + r.byteRange[3];
    r.laterRevisions = (bin(bytes.subarray(end)).match(/%%EOF/g) || []).length;
    r.laterSignatures = out.filter(o => o !== r && o.byteRange[2] + o.byteRange[3] > end).length;
  }
  return out;
}
