// Accessibility tools for BTS PDF Pro:
// • "Make accessible": title, language, show title in the window bar, and alternative text for images.
//   Alt text is stored the standard way pdf-lib allows: each image drawing operation is wrapped in a
//   /Figure marked-content sequence (MCID) and a structure tree (StructTreeRoot › Document › Figure /Alt)
//   is written, so screen readers and pdf.js can read it. Existing tagged PDFs keep their tree; only
//   the /Alt of their Figure elements is updated.
// • Reading-order check: compares the order text is stored in the file with the visual order.
import { X, baseName } from './ctx.js';

const { h } = UI;
const L = () => window.PDFLib;
const nameRe = n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- list image XObjects per page (names are stable because annotations are not flattened)
export async function listImages() {
  const { PDFDocument, PDFName, PDFDict, PDFRawStream, decodePDFRawStream } = L();
  const S = X.S; const bytes = await X.buildPdf({ flatten: false });
  const doc = await PDFDocument.load(bytes, { updateMetadata: false, ignoreEncryption: true }); const ctx = doc.context; const out = [];
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]; const res = p.node.Resources(); const xo = res?.lookup(PDFName.of('XObject'));
    if (!(xo instanceof PDFDict)) continue;
    const used = contentString(doc, p);
    for (const [k, ref] of xo.entries()) {
      const obj = ctx.lookup(ref); const d = obj?.dict; if (!d || d.get(PDFName.of('Subtype'))?.toString() !== '/Image') continue;
      const name = k.asString().replace(/^\//, ''); if (!new RegExp('/' + nameRe(name) + '\\s*Do\\b').test(used)) continue;
      const W = d.get(PDFName.of('Width'))?.asNumber?.(), H = d.get(PDFName.of('Height'))?.asNumber?.();
      let thumb = null;
      try {
        const f = d.get(PDFName.of('Filter'))?.toString();
        if (f === '/DCTDecode' && obj instanceof PDFRawStream) thumb = URL.createObjectURL(new Blob([obj.contents], { type: 'image/jpeg' }));
        else if (obj instanceof PDFRawStream && W * H < 8e6) {
          const raw = decodePDFRawStream(obj).decode(); const cs = d.get(PDFName.of('ColorSpace'))?.toString(); const ch = raw.length >= W * H * 3 ? 3 : 1;
          if ((cs === '/DeviceRGB' || cs === '/DeviceGray' || !cs || cs.startsWith('[')) && raw.length >= W * H * ch && d.get(PDFName.of('BitsPerComponent'))?.asNumber?.() === 8) {
            const c = document.createElement('canvas'); c.width = W; c.height = H; const id = c.getContext('2d').createImageData(W, H);
            for (let q = 0, j = 0; q < W * H; q++, j += ch) { id.data[q * 4] = raw[j]; id.data[q * 4 + 1] = raw[j + (ch === 3 ? 1 : 0)]; id.data[q * 4 + 2] = raw[j + (ch === 3 ? 2 : 0)]; id.data[q * 4 + 3] = 255; }
            c.getContext('2d').putImageData(id, 0, 0); thumb = c.toDataURL('image/png');
          }
        }
      } catch { }
      out.push({ page: i, pageId: S.pages[i]?.id, name, w: W, h: H, thumb });
    }
  }
  return out;
}
const bin2str = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return s; };
const str2bin = s => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
function contentString(doc, page) {
  const { PDFName, PDFArray, PDFRawStream, decodePDFRawStream } = L(); const ctx = doc.context;
  const C = page.node.get(PDFName.of('Contents')); const list = !C ? [] : C instanceof PDFArray ? C.asArray() : [C];
  return list.map(r => { const s = ctx.lookup(r); try { if (s instanceof PDFRawStream) return bin2str(decodePDFRawStream(s).decode()); if (s?.getUnencodedContents) return bin2str(s.getUnencodedContents()); if (s?.getContents) return bin2str(s.getContents()); } catch { } return ''; }).join('\n');
}
// existing alt text per page from the structure tree (pdf.js)
async function existingAlts() {
  const S = X.S; const out = {};
  for (const pg of S.pages) {
    try { await X.ensureJs(pg); const tree = await pg._js.getStructTree(); const figs = []; const walk = n => { if (!n) return; if (n.role === 'Figure') figs.push(n.alt || ''); (n.children || []).forEach(walk); }; walk(tree); out[pg.id] = figs; } catch { out[pg.id] = []; }
  }
  return out;
}

// ---------- save-time writer (called from docops.postBuild)
export function applyA11y(out, finalPages, A) {
  const { PDFName, PDFDict, PDFArray, PDFHexString, PDFNumber, PDFString, PDFRef } = L(); const ctx = out.context;
  if (A.displayTitle != null) { const vp = out.catalog.lookup(PDFName.of('ViewerPreferences')); const d = vp instanceof PDFDict ? vp : ctx.obj({}); d.set(PDFName.of('DisplayDocTitle'), ctx.obj(!!A.displayTitle)); out.catalog.set(PDFName.of('ViewerPreferences'), d); }
  if (!A.alts) return;
  const root0 = out.catalog.lookup(PDFName.of('StructTreeRoot'));
  const ours = root0 instanceof PDFDict && root0.get(PDFName.of('BTSMinimal'));
  if (root0 instanceof PDFDict && !ours) {
    // tagged document: update /Alt on existing Figure elements, page by page in tree order
    const figsByPage = new Map(); const pageRefs = finalPages.map(([p]) => p.ref.toString());
    const walk = (node, pgRef) => {
      const el = node instanceof PDFRef ? ctx.lookup(node) : node; if (!(el instanceof PDFDict)) return;
      const pg = el.get(PDFName.of('Pg'))?.toString() || pgRef;
      if (el.get(PDFName.of('S'))?.toString() === '/Figure') { if (!figsByPage.has(pg)) figsByPage.set(pg, []); figsByPage.get(pg).push(el); }
      const K = el.lookup(PDFName.of('K')); if (K instanceof PDFArray) K.asArray().forEach(k => walk(k, pg)); else if (K instanceof PDFDict || K instanceof PDFRef) walk(el.get(PDFName.of('K')), pg);
    };
    walk(root0);
    finalPages.forEach(([p, pg], i) => { const alts = A.alts[pg.id]; const figs = figsByPage.get(pageRefs[i]) || []; if (!alts) return; Object.values(alts).forEach((alt, k) => { if (figs[k] && alt != null) { if (alt.trim()) figs[k].set(PDFName.of('Alt'), PDFHexString.fromText(alt.trim())); else figs[k].delete(PDFName.of('Alt')); } }); });
    return;
  }
  // untagged (or previously tagged by us): rebuild a minimal tree of Figure elements
  const rootRef = ctx.nextRef(), docRef = ctx.nextRef(); const docKids = []; const nums = []; let key = 0;
  finalPages.forEach(([p, pg]) => {
    let content = contentString(out, p);
    if (ours) content = content.replace(/\/Figure <<\/MCID \d+>> BDC (\/\S+ Do) EMC/g, '$1'); // undo our previous wrapping
    const alts = A.alts[pg.id] || {}; let mcid = 0; const figs = [];
    for (const [name, alt] of Object.entries(alts)) {
      if (!alt || !alt.trim()) continue;
      const re = new RegExp('(/' + nameRe(name) + ')(\\s*)Do\\b', 'g');
      content = content.replace(re, (m, nm) => { const fig = ctx.register(ctx.obj({ Type: 'StructElem', S: 'Figure', P: docRef, Pg: p.ref, K: mcid, Alt: PDFHexString.fromText(alt.trim()) })); figs.push(fig); docKids.push(fig); return `/Figure <</MCID ${mcid++}>> BDC ${nm} Do EMC`; });
    }
    if (ours || figs.length) { const s = ctx.register(ctx.flateStream(str2bin(content))); p.node.set(PDFName.of('Contents'), ctx.obj([s])); }
    p.node.delete(PDFName.of('StructParents'));
    if (figs.length) { p.node.set(PDFName.of('StructParents'), PDFNumber.of(key)); nums.push(PDFNumber.of(key), ctx.obj(figs)); key++; }
  });
  if (!docKids.length) { if (ours) { out.catalog.delete(PDFName.of('StructTreeRoot')); out.catalog.delete(PDFName.of('MarkInfo')); } return; }
  ctx.assign(docRef, ctx.obj({ Type: 'StructElem', S: 'Document', P: rootRef, K: docKids }));
  ctx.assign(rootRef, ctx.obj({ Type: 'StructTreeRoot', K: docRef, ParentTree: ctx.obj({ Nums: nums }), ParentTreeNextKey: key, BTSMinimal: true }));
  out.catalog.set(PDFName.of('StructTreeRoot'), rootRef); out.catalog.set(PDFName.of('MarkInfo'), ctx.obj({ Marked: true }));
}

// ---------- "Make accessible" dialog
const LANGS = [['en-IN', 'English (India)'], ['en-US', 'English (US)'], ['en-GB', 'English (UK)'], ['hi-IN', 'Hindi'], ['mr-IN', 'Marathi'], ['gu-IN', 'Gujarati'], ['ta-IN', 'Tamil'], ['te-IN', 'Telugu'], ['bn-IN', 'Bengali'], ['kn-IN', 'Kannada'], ['ur-IN', 'Urdu']];
export async function makeAccessibleDialog(auto) {
  const S = X.S; if (!S.pages.length) return;
  let info = {}; try { info = (await S.sources[0].js.getMetadata()).info || {}; } catch { }
  let title = S.meta?.title ?? info.Title ?? '';
  if (!title) { try { const l = (await X.pageText(S.pages[0])).items.find(it => it.str.trim().length > 3); title = l ? l.str.trim().slice(0, 80) : baseName(); } catch { title = baseName(); } }
  const lang = S.lang ?? info.Language ?? 'en-IN';
  UI.toast('Looking for images…');
  const imgs = await listImages(); const prev = await existingAlts();
  const perPage = {}; imgs.forEach(im => { (perPage[im.pageId] = perPage[im.pageId] || []).push(im); });
  imgs.forEach(im => { const k = perPage[im.pageId].indexOf(im); im.alt = S.a11y?.alts?.[im.pageId]?.[im.name] ?? prev[im.pageId]?.[k] ?? ''; im.decorative = false; });
  if (auto) return applyAccessible({ title: auto.title ?? title, lang: auto.lang ?? lang, displayTitle: auto.displayTitle ?? true, imgs: imgs.map(im => ({ ...im, alt: auto.alts?.[im.page]?.[im.name] ?? auto.alt?.(im) ?? im.alt })) });
  const tIn = h('input', { type: 'text', value: title, style: { width: '100%' } });
  const lSel = h('select', {}, ...LANGS.map(([v, l]) => h('option', { value: v, selected: v === lang }, `${l} (${v})`)), LANGS.some(l => l[0] === lang) ? null : h('option', { value: lang, selected: true }, lang));
  const dCb = h('input', { type: 'checkbox', checked: true });
  const list = h('div', { class: 'alt-list' });
  if (!imgs.length) list.append(h('div', { class: 'muted' }, 'No images found on the pages. (Images you added in this session are listed after you save.)'));
  imgs.forEach(im => {
    const ta = h('textarea', { rows: 2, placeholder: 'Describe the image for people who cannot see it…' }, im.alt); ta.oninput = () => im.alt = ta.value; ta.onkeydown = e => e.stopPropagation();
    const dec = h('input', { type: 'checkbox' }); dec.onchange = () => { im.decorative = dec.checked; ta.disabled = dec.checked; };
    list.append(h('div', { class: 'alt-row' }, h('div', { class: 'alt-th' }, im.thumb ? h('img', { src: im.thumb }) : h('span', { class: 'muted' }, 'image')),
      h('div', { class: 'grow' }, h('div', { class: 'muted alt-meta' }, `Page ${im.page + 1} · ${im.name} · ${im.w}×${im.h}px`), ta, h('label', { class: 'row muted alt-dec' }, dec, 'Decorative (no description needed)'))));
  });
  const body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    h('label', { class: 'field' }, 'Document title', tIn), h('label', { class: 'field' }, 'Document language', lSel),
    h('label', { class: 'row', style: { color: 'var(--tx-1)' } }, dCb, 'Show the title (not the file name) in the window title bar'),
    h('div', { class: 'muted' }, `Alternative text for images (${imgs.length})`), list,
    h('div', { class: 'muted', style: { fontSize: '11.5px' } }, 'Alt text is written as tagged Figure elements in the saved PDF. This does not make a full PDF/UA document.'));
  const r = await UI.modal({ title: 'Make accessible', width: 600, body, buttons: [{ label: 'Cancel', value: null }, { label: 'Apply', primary: true, value: 'ok' }] });
  if (r !== 'ok') return;
  return applyAccessible({ title: tIn.value.trim(), lang: lSel.value, displayTitle: dCb.checked, imgs });
}
function applyAccessible({ title, lang, displayTitle, imgs }) {
  const S = X.S; const alts = {};
  for (const pg of S.pages) alts[pg.id] = {};
  imgs.forEach(im => { if (im.pageId) alts[im.pageId][im.name] = im.decorative ? '' : (im.alt || ''); });
  S.meta = { ...(S.meta || {}), title }; S.lang = lang; S.stripMeta = false;
  S.a11y = { displayTitle, alts };
  X.markDirty();
  const n = imgs.filter(i => !i.decorative && i.alt?.trim()).length;
  UI.toast(`Title, language${imgs.length ? ` and ${n} of ${imgs.length} image description(s)` : ''} will be written when you save`, 'ok', 5000);
  return { title, lang, images: imgs.length, described: n };
}

// ---------- reading order check
function blocksInStreamOrder(items) {
  const blocks = []; let cur = null;
  for (const it of items) {
    if (!it.str || !it.str.trim()) { if (it.hasEOL && cur) cur.eol = true; continue; }
    const sz = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10; const x = it.transform[4], y = it.transform[5], w = it.width || 0;
    if (cur && Math.abs(cur.ly - y) < sz * 0.5 && x >= cur.lx - sz && x - cur.rx < sz * 3) { cur.text += ' ' + it.str; cur.rx = Math.max(cur.rx, x + w); }
    else if (cur && cur.ly - y > 0 && cur.ly - y < sz * 2.2 && Math.abs(x - cur.x0) < sz * 4) { cur.text += ' ' + it.str; cur.ly = y; cur.lx = x; cur.rx = Math.max(cur.rx, x + w); cur.y1 = y; cur.x0 = Math.min(cur.x0, x); }
    else { cur = { text: it.str, x0: x, y0: y, y1: y, lx: x, ly: y, rx: x + w, sz }; blocks.push(cur); }
  }
  return blocks;
}
export async function readingOrder(pg) {
  const { items } = await X.pageText(pg); const B = blocksInStreamOrder(items); const n = B.length;
  if (n < 2) return { blocks: B, pct: 100, columns: 1, jumps: 0 };
  // columns: cluster block left edges; two columns if there is a vertical gutter separating sizeable groups
  const W = pg.w || 600; const mid = B.filter(b => b.rx - b.x0 < W * 0.55);
  let columns = 1, split = null;
  if (mid.length >= 2) {
    const xs = mid.map(b => b.x0).sort((a, b) => a - b); let best = 0;
    for (let i = 1; i < xs.length; i++) { const gap = xs[i] - xs[i - 1]; if (gap > best && xs[i] > W * 0.3 && xs[i] < W * 0.75) { best = gap; split = xs[i] - 1; } }
    const left = mid.filter(b => b.x0 < split), right = mid.filter(b => b.x0 >= split);
    const span = g => [Math.min(...g.map(b => b.y1)), Math.max(...g.map(b => b.y0))];
    const [la, lb] = left.length ? span(left) : [0, 0], [ra, rb] = right.length ? span(right) : [0, 0];
    const vOverlap = Math.min(lb, rb) - Math.max(la, ra), minH = Math.min(lb - la, rb - ra);
    if (best > W * 0.15 && left.length && right.length && left.every(b => b.rx < split + 6) && vOverlap > 0 && vOverlap >= minH * 0.3) columns = 2; else split = null;
  }
  const col = b => (split != null && b.x0 >= split && b.rx - b.x0 < W * 0.55) ? 1 : 0;
  const full = b => split != null && b.rx - b.x0 >= W * 0.55;
  const visual = B.map((b, i) => i).sort((i, j) => { const a = B[i], b = B[j];
    if (split != null && !full(a) && !full(b) && col(a) !== col(b)) { if (Math.abs(a.y0 - b.y0) > 0 && (full(a) || full(b))) return b.y0 - a.y0; return col(a) - col(b); }
    return Math.abs(a.y0 - b.y0) > a.sz * 0.5 ? b.y0 - a.y0 : a.x0 - b.x0; });
  const rank = new Array(n); visual.forEach((bi, r) => rank[bi] = r);
  let jumps = 0; const bad = [];
  for (let i = 1; i < n; i++) if (rank[i] < rank[i - 1]) { jumps++; if (bad.length < 5) bad.push([i - 1, i]); }
  const pct = Math.round((1 - jumps / (n - 1)) * 100);
  return { blocks: B, visual, pct, columns, jumps, bad };
}
export async function readingOrderReport(auto) {
  const S = X.S; if (!S.pages.length) return;
  let tagged = false; try { tagged = !!(await S.sources[0].js.getMarkInfo())?.Marked; } catch { }
  const rows = [];
  for (let i = 0; i < S.pages.length; i++) { const r = await readingOrder(S.pages[i]); rows.push({ page: i, n: r.blocks.length, columns: r.columns, pct: r.pct, jumps: r.jumps, sample: r.bad.map(([a, b]) => `"${r.blocks[a].text.slice(0, 40)}" → "${r.blocks[b].text.slice(0, 40)}"`) }); }
  const problems = rows.filter(r => r.n > 1 && r.pct < 90);
  const text = `Reading order report — ${S.fileName || 'document'}\n${tagged ? 'The document is tagged: screen readers follow the tag tree.\n' : 'The document is not tagged: screen readers read text in the order it is stored in the file.\n'}\n` +
    rows.map(r => `Page ${r.page + 1}: ${r.n} text block(s), ${r.columns} column(s), ${r.n < 2 ? 'n/a' : r.pct + '% in natural order'}${r.jumps ? `, ${r.jumps} backward jump(s)` : ''}${r.sample.length ? '\n   e.g. ' + r.sample.join('\n        ') : ''}`).join('\n') +
    `\n\nSummary: ${problems.length ? problems.length + ' page(s) may be read in a confusing order: ' + problems.map(p => p.page + 1).join(', ') : 'text order matches the visual layout on every page.'}\n`;
  if (auto) return { rows, problems: problems.map(p => p.page), tagged, text };
  const tbl = h('table', { class: 'kb-table rep ro-table' }, h('tr', {}, h('th', {}, 'Page'), h('th', {}, 'Blocks'), h('th', {}, 'Columns'), h('th', {}, 'In order'), h('th', {}, '')),
    ...rows.map(r => h('tr', { class: r.n > 1 && r.pct < 90 ? 'ro-bad' : '' }, h('td', {}, String(r.page + 1)), h('td', {}, String(r.n)), h('td', {}, String(r.columns)), h('td', {}, r.n < 2 ? '—' : r.pct + '%'),
      h('td', {}, h('button', { class: 'btn sm ghost', onclick: () => { document.querySelector('.modal-back')?.remove(); X.scrollToPage(r.page); setTimeout(() => showOrder(S.pages[r.page]), 350); } }, 'Show')))));
  const res = await UI.modal({ title: `Reading order — ${problems.length ? problems.length + ' page(s) to check' : 'looks good'}`, width: 520, body: h('div', {},
    h('div', { class: 'muted', style: { marginBottom: '8px' } }, tagged ? 'This PDF is tagged, so screen readers use its tag order. The table shows the stored text order.' : 'This PDF is not tagged, so screen readers read text in the stored order shown below.'),
    h('div', { style: { maxHeight: '50vh', overflow: 'auto' } }, tbl)), buttons: [{ label: 'Close', value: null }, { label: 'Save report…', value: 'save' }, { label: 'Show order on this page', primary: true, value: 'show' }] });
  if (res === 'show') showOrder(X.curPage());
  if (res === 'save') { const p = await X.IO.saveAs({ data: new TextEncoder().encode(text), defaultPath: baseName() + '-reading-order.txt', filters: [{ name: 'Text', extensions: ['txt'] }] }); if (p) UI.toast('Report saved', 'ok'); }
  return { rows, problems: problems.map(p => p.page), tagged, text };
}
export async function showOrder(pg) {
  if (!pg?._el) return; clearOrder();
  const r = await readingOrder(pg); const vp = pg._vp;
  r.blocks.forEach((b, i) => { const [x, y] = vp.convertToViewportPoint(b.x0, b.y0 + b.sz); const bad = r.bad?.some(([, j]) => j === i);
    pg._el.append(h('div', { class: 'ro-badge' + (bad ? ' bad' : ''), style: { left: x - 10 + 'px', top: y - 6 + 'px' }, title: b.text.slice(0, 80) }, String(i + 1))); });
  UI.toast(`Numbers show the stored reading order (${r.pct}% natural). Click any number to hide them.`, '', 4000);
  pg._el.querySelectorAll('.ro-badge').forEach(e => e.onclick = clearOrder);
}
export const clearOrder = () => document.querySelectorAll('.ro-badge').forEach(e => e.remove());
