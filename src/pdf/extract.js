// Extraction & export for BTS PDF Pro (offline):
// • Table extraction from text positions (aligned columns) → CSV / Excel .xlsx (tiny built-in ZIP writer)
// • PDF → PowerPoint .pptx (one picture per slide, page text in the speaker notes) via PptxGenJS (MIT)
// • PDF → HTML (self-contained file: page pictures and/or reflowable text)
import { X, zipStore, xmlEsc, toCsv, baseName, loadScript, localUrl, renderPageCanvas, progress, copyText } from './ctx.js';
import { pageLines } from './assist.js';

const { h } = UI;

// =====================================================================================  tables
// split text items into cells: items far apart (gap > ~1 em) or separated by 2+ spaces are different cells
async function pageCells(pg) {
  const { items } = await X.pageText(pg); const cells = [];
  const meas = document.createElement('canvas').getContext('2d'); meas.font = '100px Helvetica, Arial, sans-serif';
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const [A, B] = it.transform; if (Math.abs(B) > Math.abs(A) * 0.2) continue; // skip rotated text
    const sz = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10; const x0 = it.transform[4], y = it.transform[5], w = it.width || it.str.length * sz * 0.5;
    const total = meas.measureText(it.str).width || 1; const re = /\S+(?: \S+)*/g; let m;
    while ((m = re.exec(it.str))) { const a = meas.measureText(it.str.slice(0, m.index)).width / total, b = meas.measureText(it.str.slice(0, m.index + m[0].length)).width / total; cells.push({ x0: x0 + w * a, x1: x0 + w * b, y, sz, t: m[0] }); }
  }
  // lines
  const lines = [];
  for (const c of cells.sort((a, b) => b.y - a.y || a.x0 - b.x0)) { let ln = lines.find(l => Math.abs(l.y - c.y) < c.sz * 0.5); if (!ln) { ln = { y: c.y, sz: c.sz, cells: [] }; lines.push(ln); } ln.cells.push(c); }
  lines.sort((a, b) => b.y - a.y);
  for (const l of lines) { l.cells.sort((a, b) => a.x0 - b.x0); const merged = []; for (const c of l.cells) { const p = merged[merged.length - 1]; if (p && c.x0 - p.x1 < c.sz * 0.9) { p.t += (c.x0 - p.x1 > c.sz * 0.12 ? ' ' : '') + c.t; p.x1 = c.x1; } else merged.push({ ...c }); } l.cells = merged; }
  return lines;
}
export async function detectTables(pg) {
  const lines = await pageCells(pg); const tables = [];
  let block = [];
  const close = () => { if (block.length >= 2) { const t = buildTable(block); if (t) tables.push(t); } block = []; };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], prev = block[block.length - 1];
    const multi = l.cells.length >= 2;
    if (multi && (!prev || prev.y - l.y < Math.max(prev.sz, l.sz) * 2.6)) block.push(l);
    else { close(); if (multi) block.push(l); }
  }
  close();
  return tables;
}
function buildTable(rows) {
  // column spans from the row with the most cells, grown by overlapping cells of the other rows
  let cols = [];
  const ranked = rows.slice().sort((a, b) => b.cells.length - a.cells.length);
  for (const r of ranked) for (const c of r.cells) {
    const tol = c.sz * 0.6; let col = cols.find(k => c.x0 < k.x1 + tol && c.x1 > k.x0 - tol);
    if (col) { col.x0 = Math.min(col.x0, c.x0); col.x1 = Math.max(col.x1, c.x1); col.n++; } else cols.push({ x0: c.x0, x1: c.x1, n: 1 });
  }
  cols.sort((a, b) => a.x0 - b.x0);
  for (let i = 1; i < cols.length; i++) if (cols[i].x0 < cols[i - 1].x1) { cols[i - 1].x1 = Math.max(cols[i - 1].x1, cols[i].x1); cols[i - 1].n += cols[i].n; cols.splice(i--, 1); }
  cols = cols.filter(c => c.n >= Math.max(2, rows.length * 0.34));
  if (cols.length < 2) return null;
  const grid = rows.map(r => { const out = cols.map(() => ''); for (const c of r.cells) { let best = -1, bo = -1e9; cols.forEach((k, i) => { const o = Math.min(c.x1, k.x1) - Math.max(c.x0, k.x0); const d = o > 0 ? o : -Math.min(Math.abs(c.x0 - k.x0), Math.abs(c.x1 - k.x1)); if (d > bo) { bo = d; best = i; } }); out[best] = out[best] ? out[best] + ' ' + c.t : c.t; } return out; });
  const filled = grid.flat().filter(Boolean).length / (grid.length * cols.length);
  // drop prose: a table needs mostly-filled rows and short cells
  const avgLen = grid.flat().filter(Boolean).reduce((n, s) => n + s.length, 0) / Math.max(1, grid.flat().filter(Boolean).length);
  if (filled < 0.55 || avgLen > 60) return null;
  const allSz = rows.flatMap(r => r.cells.map(c => c.sz)); const sz = Math.max(...allSz);
  return { rows: grid, cols: cols.length, box: { x: Math.min(...cols.map(c => c.x0)) - 3, y: rows[rows.length - 1].y - sz * 0.35, w: Math.max(...cols.map(c => c.x1)) - Math.min(...cols.map(c => c.x0)) + 6, h: rows[0].y - rows[rows.length - 1].y + sz * 1.35 } };
}
export async function detectAll(idx) {
  const S = X.S; idx = idx || S.pages.map((_, i) => i); const out = [];
  for (const i of idx) (await detectTables(S.pages[i])).forEach((t, k) => out.push({ ...t, page: i, n: k + 1 }));
  return out;
}
const colName = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = (i - m - 1) / 26; } return s; };
const isNum = s => /^[-+]?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/.test(s.trim()) && !/^0\d/.test(s.trim());
export function xlsxBytes(tables) {
  const sheets = tables.map((t, i) => ({ name: (`Page ${t.page + 1}` + (tables.filter(x => x.page === t.page).length > 1 ? ` (${t.n})` : '')).slice(0, 31), rows: t.rows }));
  const sheetXml = rows => {
    const widths = []; rows.forEach(r => r.forEach((c, i) => widths[i] = Math.max(widths[i] || 6, Math.min(60, String(c).length + 2))));
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>` +
      rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((c, ci) => { const ref = colName(ci) + (ri + 1); const st = ri === 0 ? ' s="1"' : ''; if (c === '' || c == null) return ''; if (ri > 0 && isNum(c) && !c.endsWith('%')) return `<c r="${ref}"${st}><v>${c.replace(/,/g, '')}</v></c>`; return `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${xmlEsc(c)}</t></is></c>`; }).join('') + '</row>').join('') + '</sheetData></worksheet>';
  };
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEsc(baseName())} tables</dc:title><dc:creator>BTS PDF Pro</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>` },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name.replace(/[\\/?*[\]:]/g, ' '))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s.rows) })),
  ];
  return zipStore(files);
}
export const tablesCsv = tables => toCsv(tables.flatMap((t, i) => [...(tables.length > 1 ? [[`Table ${i + 1} — page ${t.page + 1}`]] : []), ...t.rows, ...(i < tables.length - 1 ? [[]] : [])]));
let overlayPages = [];
function showBoxes(tables) {
  clearBoxes();
  for (const t of tables) {
    const pg = X.S.pages[t.page]; if (!pg?._el) continue; const [x1, y1, x2, y2] = pg._vp.convertToViewportRectangle([t.box.x, t.box.y, t.box.x + t.box.w, t.box.y + t.box.h]);
    pg._el.append(h('div', { class: 'tbl-box', style: { left: Math.min(x1, x2) + 'px', top: Math.min(y1, y2) + 'px', width: Math.abs(x2 - x1) + 'px', height: Math.abs(y2 - y1) + 'px' } }, h('span', {}, `Table ${t.n}`))); overlayPages.push(pg);
  }
}
function clearBoxes() { document.querySelectorAll('.tbl-box').forEach(e => e.remove()); overlayPages = []; }
export async function tablesDialog(opts) {
  const S = X.S; if (!S.pages.length) return;
  const v = opts || await UI.form({ title: 'Extract tables', width: 440, ok: 'Find tables', fields: [
    { key: 'which', label: 'Look on', type: 'select', value: 'cur', options: [{ value: 'cur', label: `Current page (${X.currentPageIdx() + 1})` }, { value: 'all', label: `All pages (${S.pages.length})` }, { value: 'range', label: 'Page range…' }] },
    { key: 'range', label: 'Range (e.g. 2-4)', value: `1-${S.pages.length}` }] });
  if (!v) return;
  const idx = v.which === 'cur' ? [X.currentPageIdx()] : v.which === 'range' ? X.parseRange(v.range, S.pages.length) : S.pages.map((_, i) => i);
  const tables = await detectAll(idx);
  if (!tables.length) { UI.toast('No tables found. Tables need text in aligned columns (scans need OCR first).', '', 5000); return { tables }; }
  showBoxes(tables);
  if (v.auto) return { tables };
  const sel = tables.map(() => true);
  const prev = h('div', { class: 'tbl-prev' }, ...tables.map((t, i) => { const cb = h('input', { type: 'checkbox', checked: true }); cb.onchange = () => sel[i] = cb.checked;
    return h('div', { class: 'tbl-card' }, h('label', { class: 'row' }, cb, h('b', {}, `Page ${t.page + 1} · table ${t.n}`), h('span', { class: 'muted' }, `${t.rows.length} rows × ${t.cols} columns`)),
      h('div', { class: 'tbl-scroll' }, h('table', {}, ...t.rows.slice(0, 12).map((r, ri) => h('tr', {}, ...r.map(c => h(ri ? 'td' : 'th', {}, c))))))); }));
  const r = await UI.modal({ title: `Extract tables — ${tables.length} found`, width: 640, body: prev, buttons: [{ label: 'Close', value: null }, { label: 'Copy', value: 'copy' }, { label: 'Save CSV…', value: 'csv' }, { label: 'Save Excel (.xlsx)…', primary: true, value: 'xlsx' }] });
  clearBoxes();
  const chosen = tables.filter((_, i) => sel[i]); if (!r || !chosen.length) return { tables };
  if (r === 'copy') { await copyText(chosen.map(t => t.rows.map(row => row.join('\t')).join('\n')).join('\n\n')); UI.toast('Table copied — paste into Sheets or Excel', 'ok'); return { tables }; }
  const path = await exportTables(chosen, r); return { tables, path };
}
export async function exportTables(tables, fmt) {
  const xl = fmt === 'xlsx';
  const p = await X.IO.saveAs({ data: xl ? xlsxBytes(tables) : new TextEncoder().encode(tablesCsv(tables)), defaultPath: baseName() + '-tables.' + (xl ? 'xlsx' : 'csv'), filters: [xl ? { name: 'Excel workbook', extensions: ['xlsx'] } : { name: 'CSV', extensions: ['csv'] }] });
  if (p) UI.toast(`${tables.length} table(s) saved`, 'ok'); return p;
}

// =====================================================================================  PDF → PowerPoint
export async function pptxBytes({ dpi = 150, notes = true, idx } = {}, prog) {
  await loadScript(localUrl('../vendor/pdf-pptx/pptxgen.bundle.js'));
  const S = X.S; idx = idx || S.pages.map((_, i) => i);
  const pptx = new window.PptxGenJS(); const first = X.viewportOf(S.pages[idx[0]], 1);
  const W = first.width / 72, H = first.height / 72; pptx.defineLayout({ name: 'BTSPDF', width: +W.toFixed(3), height: +H.toFixed(3) }); pptx.layout = 'BTSPDF';
  pptx.author = S.author || 'BTS PDF Pro'; pptx.company = 'BTS Creative'; pptx.title = S.meta?.title || baseName();
  for (let k = 0; k < idx.length; k++) {
    if (prog?.cancelled) break; prog?.set(`Slide ${k + 1} of ${idx.length}…`, k / idx.length);
    const pg = S.pages[idx[k]]; const c = await renderPageCanvas(pg, dpi / 72);
    const vp = X.viewportOf(pg, 1); const pw = vp.width / 72, ph = vp.height / 72; const s = Math.min(W / pw, H / ph);
    const slide = pptx.addSlide(); slide.background = { color: 'FFFFFF' };
    slide.addImage({ data: c.toDataURL('image/jpeg', 0.9), x: (W - pw * s) / 2, y: (H - ph * s) / 2, w: pw * s, h: ph * s, altText: `Page ${idx[k] + 1}` });
    if (notes) { const t = (await X.pageText(pg)).str.replace(/\s+\n/g, '\n').trim(); if (t) slide.addNotes(t.slice(0, 20000)); }
  }
  return new Uint8Array(await pptx.write({ outputType: 'arraybuffer' }));
}
export async function exportPptx(opts) {
  const S = X.S; if (!S.pages.length) return;
  const v = opts || await UI.form({ title: 'Export to PowerPoint (.pptx)', width: 440, ok: 'Export…', fields: [
    { key: 'dpi', label: 'Picture quality', type: 'select', value: '150', options: [{ value: '110', label: 'Smaller file (110 dpi)' }, { value: '150', label: 'Standard (150 dpi)' }, { value: '220', label: 'Sharp (220 dpi)' }] },
    { key: 'notes', label: 'Put each page\'s text into the speaker notes', type: 'checkbox', value: true }] });
  if (!v) return;
  const prog = progress('Creating PowerPoint'); let bytes;
  try { bytes = await pptxBytes({ dpi: +v.dpi, notes: v.notes }, prog); } catch (e) { prog.close(); console.error(e); UI.toast('Export failed: ' + e.message, 'err'); return; }
  prog.close();
  const p = await X.IO.saveAs({ data: bytes, defaultPath: baseName() + '.pptx', filters: [{ name: 'PowerPoint', extensions: ['pptx'] }] });
  if (p) UI.toast(`Saved ${S.pages.length} slide(s)`, 'ok'); return p;
}

// =====================================================================================  PDF → HTML
const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export async function htmlString({ images = true, text = true, dpi = 110 } = {}, prog) {
  const S = X.S; const title = S.meta?.title || baseName(); let body = '';
  const sizes = {}; const all = [];
  for (const pg of S.pages) { const ls = await pageLines(pg); all.push(ls); ls.forEach(l => sizes[Math.round(l.sz)] = (sizes[Math.round(l.sz)] || 0) + l.text.length); }
  const bodySz = +(Object.entries(sizes).sort((a, b) => b[1] - a[1])[0]?.[0] || 11);
  for (let i = 0; i < S.pages.length; i++) {
    if (prog?.cancelled) break; prog?.set(`Page ${i + 1} of ${S.pages.length}…`, i / S.pages.length);
    body += `<section class="pg" id="page-${i + 1}"><div class="pn">Page ${i + 1}</div>`;
    if (images) { const c = await renderPageCanvas(S.pages[i], dpi / 72); body += `<img src="${c.toDataURL('image/jpeg', 0.85)}" alt="Page ${i + 1}" width="${c.width}" height="${c.height}" loading="lazy">`; }
    if (text) {
      let para = null; const out = []; const lines = all[i];
      for (let k = 0; k < lines.length; k++) { const l = lines[k]; const hd = l.sz >= bodySz * 1.18 && l.text.length < 110; const gap = k ? lines[k - 1].y - l.y : 0;
        if (hd) { if (para) out.push(`<p>${escH(para)}</p>`); para = null; out.push(`<h${l.sz > bodySz * 1.6 ? 2 : 3}>${escH(l.text)}</h${l.sz > bodySz * 1.6 ? 2 : 3}>`); continue; }
        if (para == null || gap > l.sz * 1.7) { if (para) out.push(`<p>${escH(para)}</p>`); para = l.text; } else para = para.endsWith('-') ? para.slice(0, -1) + l.text : para + ' ' + l.text; }
      if (para) out.push(`<p>${escH(para)}</p>`);
      body += `<div class="tx">${out.join('\n') || '<p class="empty">(no text on this page — run OCR for scans)</p>'}</div>`;
    }
    body += '</section>\n';
  }
  const nav = S.pages.length > 1 ? `<nav>${S.pages.map((_, i) => `<a href="#page-${i + 1}">${i + 1}</a>`).join('')}</nav>` : '';
  return `<!doctype html>\n<html lang="${escH(S.lang || 'en')}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="generator" content="BTS PDF Pro"><title>${escH(title)}</title>
<style>:root{color-scheme:light dark}body{margin:0;font:16px/1.6 system-ui,'Segoe UI',Roboto,'Noto Sans Devanagari',sans-serif;background:#eef0f3;color:#16171b}main{max-width:900px;margin:0 auto;padding:16px}h1{font-size:22px}nav{position:sticky;top:0;background:#eef0f3;padding:6px 0;display:flex;flex-wrap:wrap;gap:4px;z-index:2}nav a{padding:2px 8px;border-radius:6px;background:#fff;color:#333;text-decoration:none;font-size:13px}.pg{background:#fff;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,.08);margin:18px 0;padding:16px}.pg img{display:block;max-width:100%;height:auto;margin:0 auto 10px;border:1px solid #ddd}.pn{font-size:12px;color:#888;margin-bottom:6px}.tx p{margin:.5em 0}.empty{color:#999}@media (prefers-color-scheme:dark){body,nav{background:#15161a;color:#e8e9ec}.pg{background:#1f2026}nav a{background:#2a2b31;color:#ddd}}</style></head>
<body><main><h1>${escH(title)}</h1>${nav}\n${body}</main></body></html>\n`;
}
export async function exportHtml(opts) {
  const S = X.S; if (!S.pages.length) return;
  const v = opts || await UI.form({ title: 'Export to HTML', width: 440, ok: 'Export…', fields: [
    { key: 'images', label: 'Include page pictures (exact look)', type: 'checkbox', value: true },
    { key: 'text', label: 'Include reflowable text (headings & paragraphs)', type: 'checkbox', value: true },
    { key: 'dpi', label: 'Picture quality', type: 'select', value: '110', options: [{ value: '80', label: 'Small' }, { value: '110', label: 'Standard' }, { value: '160', label: 'Sharp' }] }] });
  if (!v) return; if (!v.images && !v.text) return UI.toast('Choose pictures, text or both', 'err');
  const prog = progress('Creating HTML'); const html = await htmlString({ images: v.images, text: v.text, dpi: +v.dpi || 110 }, prog); prog.close();
  const p = await X.IO.saveAs({ data: new TextEncoder().encode(html), defaultPath: baseName() + '.html', filters: [{ name: 'Web page', extensions: ['html'] }] });
  if (p) UI.toast('Saved ' + p.split(/[\\/]/).pop(), 'ok'); return p;
}
