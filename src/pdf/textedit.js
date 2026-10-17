// True text editing in BTS PDF Pro (UI side): click text with the Edit text tool to edit a paragraph or line in
// place; the content stream is rewritten (cstream.js) so the old words are really gone from the file.
// Also: add a new paragraph, delete text, Replace text everywhere, and font choice (original / standard /
// installed system font / font file). Text that cannot be parsed (e.g. Type 3 fonts) falls back to the old
// cover-and-replace overlay, and the user is told.
import { X, loadScript } from './ctx.js';
import * as CS from './cstream.js';
const { h } = UI;

export const ST = { mode: 'para', font: { mode: 'auto', family: 'Helvetica', bold: false, italic: false }, custom: null, matchLocal: true, color: null };
try { const v = JSON.parse(localStorage.getItem('bts.pdf.textedit') || '{}'); if (v.mode) ST.mode = v.mode; if (v.matchLocal === false) ST.matchLocal = false; } catch { }
const persist = () => { try { localStorage.setItem('bts.pdf.textedit', JSON.stringify({ mode: ST.mode, matchLocal: ST.matchLocal })); } catch { } };

// ---------------------------------------------------------------- helpers
let fkP = null;
async function fontkit() { if (!fkP) fkP = loadScript('../vendor/pdf-fontkit/regenerator-runtime.js').then(() => loadScript('../vendor/pdf-fontkit/fontkit.umd.min.js')).then(() => window.fontkit).catch(() => null); return fkP; }
let localList = null;
async function localFonts() {
  if (localList) return localList;
  if (typeof window.queryLocalFonts !== 'function') return (localList = []);
  try { localList = await window.queryLocalFonts(); } catch { localList = []; }
  return localList;
}
// bytes of an installed font whose PostScript / full name matches the PDF font name (e.g. LiberationSerif-Italic)
async function resolveFont(fam) {
  if (!ST.matchLocal) return null;
  const want = fam.toLowerCase().replace(/[\s_-]/g, '').replace(/(mt|ps|psmt)$/, '');
  const list = await localFonts(); if (!list.length) return null;
  const key = f => [f.postscriptName, f.fullName].map(s => (s || '').toLowerCase().replace(/[\s_-]/g, '').replace(/(mt|ps|psmt)$/, ''));
  let hit = list.find(f => key(f).includes(want));
  if (!hit && !/bold|italic|oblique/i.test(fam)) hit = list.find(f => key(f).some(k => k === want + 'regular'));
  if (!hit) return null;
  try { const b = new Uint8Array(await (await hit.blob()).arrayBuffer()); return /^ttcf/.test(String.fromCharCode(...b.slice(0, 4))) ? null : b; } catch { return null; }
}
const fresh = async src => window.PDFLib.PDFDocument.load(src.bytes, { ignoreEncryption: true, updateMetadata: false });
async function modelFor(pg) {
  const src = X.S.sources[pg.src];
  if (!src._models || src._modelsVer !== (src.ver || 0)) { src._models = new Map(); src._modelsVer = src.ver || 0; src._lib = null; }
  if (!src._models.has(pg.index)) { if (!src._lib) src._lib = await fresh(src); src._models.set(pg.index, CS.analyzePage(src._lib, pg.index)); }
  return src._models.get(pg.index);
}
const cssFamily = f => { const st = CS.stdFallback(f); const nm = (f.baseName || '').replace(/^[A-Z]{6}\+/, '').replace(/[-,](Bold|Italic|Oblique|Regular|BoldItalic|BoldOblique|Roman|MT|PSMT).*$/i, '').replace(/([a-z])([A-Z])/g, '$1 $2'); const fb = st.family === 'Times' ? '"Times New Roman", Times, serif' : st.family === 'Courier' ? '"Courier New", monospace' : 'Helvetica, Arial, sans-serif'; return { css: `"${nm}", ${fb}`, bold: st.bold, italic: st.italic }; };

// replace a source's bytes with an edited version (kept as a version so undo / redo can switch back)
export async function swapSource(si, bytes, label) {
  const S = X.S, src = S.sources[si];
  if (!src.vers) { src.vers = [src.bytes]; src.jsv = [src.js]; src.ver = 0; }
  const js = (await X.loadPdfBytes(bytes, src.name)).js;
  src.vers.push(bytes); src.jsv.push(js); src.ver = src.vers.length - 1; src.bytes = bytes; src.js = js;
  refreshSource(si);
  if (label) X.commit(label);
}
export function refreshSource(si) {
  const S = X.S; for (const k of Object.keys(S.textCache)) if (k.startsWith(si + ':')) delete S.textCache[k];
  for (const pg of S.pages) if (pg.src === si) { pg._js = null; pg._jsSrc = null; pg._rendered = null; if (pg._el) X.renderPage(pg.id); }
  X.renderThumbs(); X.onDocChanged?.();
}
// called by restore(): switch sources to the versions recorded in an undo snapshot
export async function restoreVersions(sv) {
  if (!sv) return false; let changed = false;
  for (let i = 0; i < X.S.sources.length; i++) {
    const src = X.S.sources[i], v = sv[i] ?? 0;
    if (!src.vers || (src.ver || 0) === v || !src.vers[v]) continue;
    src.ver = v; src.bytes = src.vers[v]; src.js = src.jsv[v]; refreshSource(i); changed = true;
  }
  return changed;
}

// run an edit on a fresh copy of the page's source document, then swap the edited bytes in
let busy = Promise.resolve();
function applyEdit(pg, fn, label) { const p = busy.then(() => applyEdit0(pg, fn, label)); busy = p.catch(() => { }); return p; }
async function applyEdit0(pg, fn, label) {
  const src = X.S.sources[pg.src];
  const doc = await fresh(src);
  const fk = await fontkit();
  const ed = new CS.TextEditor(doc, { fontkit: fk, customFont: ST.custom, resolveFont: fk ? resolveFont : null });
  const model = ed.page(pg.index);
  let res;
  try { res = await fn(ed, model); }
  catch (e) {
    if (e.code === 'NEED_FONT') { UI.toast(`The standard fonts cannot write these characters: ${e.chars}. Choose a system font or a font file in the options bar, then try again.`, 'err', 8000); return null; }
    throw e;
  }
  if (!ed.commit()) return res;
  const bytes = new Uint8Array(await doc.save({ useObjectStreams: true }));
  await swapSource(pg.src, bytes, label);
  return res;
}
const prefNow = () => ST.font.mode === 'auto' ? { mode: 'auto', color: ST.color } : ST.font.mode === 'custom' ? { mode: 'custom', color: ST.color } : { mode: 'std', family: ST.font.family, bold: ST.font.bold, italic: ST.font.italic, color: ST.color };
function tellFallback(res) {
  if (!res || res.deleted) return;
  if (res.fallback) UI.toast(`The original font does not contain all the letters you typed, so a similar standard font (${res.fonts.join(', ')}) was used for them.`, '', 6000);
  else if (res.otherFont) UI.toast(`Letters missing from the embedded font were written with ${res.fonts.join(', ')}.`, '', 5000);
}

// ---------------------------------------------------------------- clicking text with the Edit tool
export async function onStageClick(e) {
  const S = X.S; const ov = PENDING; PENDING = null; if (S.tool !== 'edit' || e.button) return;
  if (e.target.closest('.te-box, .editor-box')) return;
  const pgEl = e.target.closest('.page'); if (!pgEl) return;
  const pg = X.pageById(pgEl.dataset.id); if (!pg) return;
  const span = e.target.closest('.textLayer span');
  if (!span || !span.textContent.trim()) { const [px, py] = X.toPdf(pg, e); await new Promise(r => setTimeout(r, 0)); await busy; return newParagraph(pg, px, py); }
  const pr = pgEl.getBoundingClientRect(), sr = span.getBoundingClientRect();
  const a = pg._vp.convertToPdfPoint(sr.left - pr.left, sr.top - pr.top), b = pg._vp.convertToPdfPoint(sr.right - pr.left, sr.bottom - pr.top);
  const rect = { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) };
  await new Promise(r => setTimeout(r, 0)); await busy; // let a pending edit (e.g. the editor that just lost focus) finish first
  let model = null; try { model = await modelFor(pg); } catch (err) { console.warn('content parse failed', err); }
  const hit = model && CS.hitTest(model, rect);
  const norm = s => s.replace(/\s+/g, '').toLowerCase();
  const usable = hit && !hit.run.f.type3 && !hit.run.f.vertical && hit.run.f.decodable && hit.run.Tr !== 3 && norm(hit.line.text).includes(norm(span.textContent).slice(0, 12));
  if (!usable) return coverEdit(pg, span, hit && hit.run.f.type3 ? 'type3' : hit && hit.run.Tr === 3 ? 'ocr' : 'parse', rect);
  const block = (ov?.mode || ST.mode) === 'line' || e.shiftKey ? lineBlock(hit.line) : hit.block;
  if (ov?.del) return commitBlock(pg, model, block, '');
  openEditor(pg, model, block);
}
const lineBlock = line => ({ lines: [line], runs: line.runs, chars: blockChars(line), text: blockChars(line).map(c => c.ch).join(''), bbox: line.bbox, align: line.block?.lines.length === 1 ? line.block.align : 'left', ang: line.ang, sid: line.sid, x0: line.x0, x1: line.x1, availW: line.block?.lines.length === 1 ? line.block.availW : line.x1 - line.x0, isLine: true });
function blockChars(line) { let lc = line.chars.filter(c => c.run >= 0 || c.ch === ' '); while (lc.length && lc[0].ch === ' ') lc.shift(); while (lc.length && lc[lc.length - 1].ch === ' ') lc.pop(); const out = []; for (const c of lc) out.push({ ch: c.ch, run: c.run >= 0 ? c.run : out[out.length - 1]?.run }); return out.filter(c => c.run != null); }

export function contextMenu(e) {
  if (X.S.tool !== 'edit') return false;
  const span = e.target.closest('.textLayer span'); if (!span) return false;
  e.preventDefault();
  const fire = (mode, del) => { PENDING = { mode, del }; span.dispatchEvent(new MouseEvent('click', { clientX: e.clientX, clientY: e.clientY, bubbles: true })); };
  UI.contextMenu(e, [
    { label: 'Edit paragraph', action: () => fire('para', false) },
    { label: 'Edit this line only', action: () => fire('line', false) },
    '-',
    { label: 'Delete paragraph', action: () => fire('para', true) },
    { label: 'Delete this line', action: () => fire('line', true) },
  ]);
  return true;
}
let PENDING = null;

function openEditor(pg, model, block) {
  document.querySelector('.te-box')?.remove();
  const vp = pg._vp, sc = vp.scale;
  const dom = block.runs.slice().sort((a, b) => b.glyphs.length - a.glyphs.length)[0];
  const ff = cssFamily(dom.f);
  const [x1, y1, x2, y2] = vp.convertToViewportRectangle([block.bbox.x0, block.bbox.y0, block.bbox.x1, block.bbox.y1]);
  const lead = block.lines.length > 1 ? (block.lines[0].y - block.lines[block.lines.length - 1].y) / (block.lines.length - 1) / dom.size : 1.2;
  const box = h('div', { class: 'te-box', contenteditable: 'plaintext-only', spellcheck: 'true', style: {
    left: Math.min(x1, x2) - 2 + 'px', top: Math.min(y1, y2) - 2 + 'px', width: Math.abs(x2 - x1) + 6 + 'px', minHeight: Math.abs(y2 - y1) + 4 + 'px',
    fontFamily: ff.css, fontWeight: ff.bold ? 700 : 400, fontStyle: ff.italic ? 'italic' : 'normal', fontSize: dom.size * sc + 'px', lineHeight: Math.max(1, lead).toFixed(3),
    color: CS.fillToCss(dom.fill), textAlign: block.align === 'justify' ? 'justify' : block.align } });
  box.textContent = block.text;
  const tip = h('div', { class: 'te-tip' }, 'Enter = new paragraph · Ctrl+Enter = done · Esc = cancel · empty = delete');
  pg._el.append(box, tip);
  Object.assign(tip.style, { left: Math.max(0, Math.min(Math.min(x1, x2), pg._el.clientWidth - tip.offsetWidth - 4)) + 'px', top: Math.max(0, Math.min(y1, y2) - 26) + 'px' });
  setTimeout(() => { box.focus(); const r = document.createRange(); r.selectNodeContents(box); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); }, 10);
  let done = false;
  const finish = async cancel => {
    if (done) return; done = true; const txt = box.innerText.replace(/ /g, ' ').replace(/\n+$/, ''); box.remove(); tip.remove();
    if (cancel || txt === block.text) return;
    await commitBlock(pg, model, block, txt);
  };
  box.addEventListener('blur', () => finish(false));
  box.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Escape') finish(true); else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); box.blur(); } });
  X.te = { box, finish };
}
// find the same block in a fresh analysis of the page (the editor works on a fresh copy of the document)
function sameBlock(model, block) {
  const ids = new Set(block.runs.map(r => r.s + ':' + r.sid));
  if (block.isLine) { const l = model.lines.find(l => l.runs.length === block.runs.length && l.runs.every(r => ids.has(r.s + ':' + r.sid))); return l ? lineBlock(l) : null; }
  return model.blocks.find(b => b.runs.length === block.runs.length && b.runs.every(r => ids.has(r.s + ':' + r.sid))) || null;
}
export async function commitBlock(pg, model, block, txt) {
  try {
    const res = await applyEdit(pg, async (ed, m) => { const b = sameBlock(m, block); if (!b) throw new Error('The text changed; click it again.'); return ed.writeBlock(m, b, txt, { ...prefNow(), keepLines: 'soft' }); }, txt.trim() ? 'Edit text' : 'Delete text');
    if (res?.deleted) UI.toast('Text deleted from the page content', 'ok'); else tellFallback(res);
    if (res?.grew) { // warn when the longer text runs into what is below it
      const low = block.bbox.y0 - res.grew * res.leadPage;
      const hit = model.blocks.some(b => b !== block && b.ang === block.ang && b.bbox.y1 < block.bbox.y0 + 1 && b.bbox.y1 > low && b.bbox.x0 < block.bbox.x1 && b.bbox.x1 > block.bbox.x0);
      if (hit) UI.toast('The text now needs more lines and overlaps the text below it. Shorten it, or undo with Ctrl+Z.', 'err', 7000);
    }
    return res;
  } catch (e) { console.error(e); UI.toast('Could not edit this text: ' + e.message, 'err', 6000); return null; }
}

// ---------------------------------------------------------------- new paragraph
function newParagraph(pg, px, py) {
  document.querySelector('.te-box')?.remove();
  const vp = pg._vp, sc = vp.scale, s = X.S.style;
  const w = Math.min(320, Math.max(80, (pg._js.view[2] - px) - 36));
  const [vx, vy] = vp.convertToViewportPoint(px, py);
  const fam = ST.font.mode === 'std' ? ST.font.family : (s.font || 'Helvetica'), bold = ST.font.mode === 'std' ? ST.font.bold : !!s.bold, italic = ST.font.mode === 'std' ? ST.font.italic : !!s.italic;
  const box = h('div', { class: 'te-box new', contenteditable: 'plaintext-only', style: { left: vx + 'px', top: vy + 'px', width: w * sc + 'px', minHeight: s.fontSize * 1.3 * sc + 'px', fontFamily: X.cssFont(fam), fontWeight: bold ? 700 : 400, fontStyle: italic ? 'italic' : 'normal', fontSize: s.fontSize * sc + 'px', lineHeight: 1.2, color: ST.color || s.textColor } });
  pg._el.append(box); setTimeout(() => box.focus(), 10);
  let done = false;
  const finish = async cancel => {
    if (done) return; done = true; const txt = box.innerText.replace(/ /g, ' ').replace(/\n+$/, ''); box.remove();
    if (cancel || !txt.trim()) return;
    await addParagraph(pg, { x: px, y: py, w, text: txt, size: s.fontSize, color: ST.color || s.textColor, family: fam, bold, italic });
  };
  box.addEventListener('blur', () => finish(false));
  box.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Escape') finish(true); else if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); box.blur(); } });
  X.te = { box, finish };
}
export async function addParagraph(pg, o) {
  try { return await applyEdit(pg, (ed, m) => ed.addParagraph(m, { ...o, custom: ST.font.mode === 'custom' }), 'Add paragraph'); }
  catch (e) { console.error(e); UI.toast('Could not add the paragraph: ' + e.message, 'err', 6000); }
}

// ---------------------------------------------------------------- fallback: cover and replace (old behaviour)
function coverEdit(pg, span, why, rect) {
  const x = rect.x0 - 1, y = rect.y0 - 1, w = rect.x1 - rect.x0 + 2, hh = rect.y1 - rect.y0 + 2;
  const size = Math.max(4, Math.round(hh * 0.82 * 10) / 10);
  const ff = (getComputedStyle(span).fontFamily || '').toLowerCase();
  const font = /serif|times|roman/.test(ff) && !/sans/.test(ff) ? 'Times' : /mono|courier/.test(ff) ? 'Courier' : 'Helvetica';
  const a = { id: X.nid(), type: 'text', x, y, w, h: hh, text: span.textContent, size, color: X.S.style.textColor, font, bold: false, bg: '#ffffff', cover: true };
  pg.annots.push(a); X.drawAnnots(pg); X.editTextAnnot(pg, a, false);
  UI.toast(why === 'ocr' ? 'This is recognised (OCR) text over a scanned image. It will be covered with a white box and new text instead.' : why === 'type3' ? 'This text uses a Type 3 (drawn) font that cannot be edited directly. It will be covered with a white box and new text instead; the old text stays in the file underneath.'
    : 'This text could not be matched in the page content, so it will be covered with a white box and new text instead. The old text stays in the file underneath.', '', 8000);
}

// ---------------------------------------------------------------- Replace text everywhere
export async function replaceDialog(preset = {}) {
  const S = X.S; if (!S.pages.length) return UI.toast('Open a PDF first');
  const v = await UI.form({ title: 'Replace text everywhere', width: 460, fields: [
    { key: 'find', label: 'Find', value: preset.find || '' }, { key: 'repl', label: 'Replace with', value: preset.repl || '' },
    { key: 'matchCase', label: 'Match case', type: 'checkbox', value: !!preset.matchCase }, { key: 'wholeWord', label: 'Whole words only', type: 'checkbox', value: !!preset.wholeWord }], ok: 'Replace all' });
  if (!v || !v.find) return null;
  return replaceAll(v.find, v.repl || '', { matchCase: !!v.matchCase, wholeWord: !!v.wholeWord });
}
export async function replaceAll(find, repl, opts = {}) {
  const S = X.S; let tot = { count: 0, fallback: 0, skipped: 0 }; const fk = await fontkit();
  const bySrc = new Map(); S.pages.forEach(p => { if (!bySrc.has(p.src)) bySrc.set(p.src, new Set()); bySrc.get(p.src).add(p.index); });
  const changed = [];
  try {
    for (const [si, idx] of bySrc) {
      const doc = await fresh(S.sources[si]);
      const ed = new CS.TextEditor(doc, { fontkit: fk, customFont: ST.custom, resolveFont: fk ? resolveFont : null });
      const r = await ed.replaceAll(find, repl, { ...opts, pages: [...idx], pref: prefNow() });
      tot.count += r.count; tot.fallback += r.fallback; tot.skipped += r.skipped; tot.notes = ed.notes;
      if (r.count && ed.commit()) changed.push([si, new Uint8Array(await doc.save({ useObjectStreams: true }))]);
    }
  } catch (e) {
    if (e.code === 'NEED_FONT') { UI.toast(`The standard fonts cannot write these characters: ${e.chars}. Choose a system font or a font file in the options bar, then try again.`, 'err', 8000); return null; }
    console.error(e); UI.toast('Replace failed: ' + e.message, 'err', 6000); return null;
  }
  for (let i = 0; i < changed.length; i++) await swapSource(changed[i][0], changed[i][1], i === changed.length - 1 ? 'Replace text' : null);
  if (!tot.count) UI.toast(tot.skipped ? `No text was replaced. ${tot.skipped} match(es) use fonts that cannot be edited.` : 'No matches found');
  else UI.toast(`Replaced ${tot.count} occurrence(s) in the page content.` + (tot.fallback ? ` ${tot.fallback} needed a similar standard font.` : '') + (tot.skipped ? ` ${tot.skipped} could not be changed (unsupported font).` : ''), 'ok', 6000);
  return tot;
}

// ---------------------------------------------------------------- fonts
export async function pickSystemFont() {
  const list = await localFonts();
  if (!list.length) { UI.toast('Installed fonts are not available here. Choose a font file instead.', 'err', 5000); return pickFontFile(); }
  const fams = [...new Map(list.map(f => [f.fullName, f])).values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
  const q = h('input', { type: 'text', placeholder: 'Search fonts', style: { width: '100%', marginBottom: '8px' } });
  const sel = h('select', { size: 12, style: { width: '100%', height: '260px' } });
  const fill = () => { sel.innerHTML = ''; fams.filter(f => f.fullName.toLowerCase().includes(q.value.toLowerCase())).slice(0, 400).forEach(f => sel.append(h('option', { value: f.postscriptName }, f.fullName))); };
  q.oninput = fill; fill();
  const ok = await UI.modal({ title: 'Choose an installed font', width: 420, body: h('div', {}, q, sel, h('div', { class: 'muted', style: { marginTop: '8px' } }, 'The font is embedded (only the letters used) into the PDF for edited text.')), buttons: [{ label: 'Cancel', value: false }, { label: 'Use font', primary: true, value: true }] });
  if (!ok || !sel.value) return null;
  const f = fams.find(x => x.postscriptName === sel.value);
  const bytes = new Uint8Array(await (await f.blob()).arrayBuffer());
  return useFontBytes(bytes, f.fullName);
}
export async function pickFontFile() {
  const fs = await X.IO.open({ filters: [{ name: 'Fonts', extensions: ['ttf', 'otf'] }] }); if (!fs) return null;
  return useFontBytes(new Uint8Array(fs[0].data), fs[0].name.replace(/\.(ttf|otf)$/i, ''));
}
export async function useFontBytes(bytes, name) {
  const fk = await fontkit();
  try { if (!fk) throw new Error('font engine missing'); fk.create(bytes); } catch (e) { UI.toast('This font file cannot be used: ' + e.message, 'err'); return null; }
  ST.custom = { bytes, name }; ST.font.mode = 'custom'; X.renderOptions(); UI.toast(`${name} will be used for edited text`, 'ok');
  return ST.custom;
}

// ---------------------------------------------------------------- options bar for the Edit text tool
export function options(ob, grp, vsep, swatchRow) {
  const seg = h('div', { class: 'seg' }, ...[['para', 'Paragraph'], ['line', 'Line']].map(([k, l]) => h('button', { class: 'btn sm' + (ST.mode === k ? ' primary' : ''), onclick: () => { ST.mode = k; persist(); X.renderOptions(); } }, l)));
  const f = h('select', { style: { width: '170px' } },
    h('option', { value: 'auto', selected: ST.font.mode === 'auto' }, 'Original font (auto)'),
    ...['Helvetica', 'Times', 'Courier'].map(x => h('option', { value: 'std:' + x, selected: ST.font.mode === 'std' && ST.font.family === x }, x)),
    ...(ST.custom ? [h('option', { value: 'custom', selected: ST.font.mode === 'custom' }, ST.custom.name)] : []));
  f.onchange = () => { const v = f.value; if (v === 'auto' || v === 'custom') ST.font.mode = v; else { ST.font.mode = 'std'; ST.font.family = v.slice(4); } X.renderOptions(); };
  const b = h('button', { class: 'btn sm' + (ST.font.bold ? ' primary' : ''), disabled: ST.font.mode !== 'std', onclick: () => { ST.font.bold = !ST.font.bold; X.renderOptions(); } }, 'B');
  const it = h('button', { class: 'btn sm' + (ST.font.italic ? ' primary' : ''), disabled: ST.font.mode !== 'std', style: { fontStyle: 'italic' }, onclick: () => { ST.font.italic = !ST.font.italic; X.renderOptions(); } }, 'I');
  const ml = h('input', { type: 'checkbox', checked: ST.matchLocal }); ml.onchange = () => { ST.matchLocal = ml.checked; persist(); };
  const col = h('input', { type: 'color', value: ST.color || '#111111', 'data-tip': 'Colour for edited text', style: { width: '26px', height: '22px', opacity: ST.color ? 1 : 0.45 } }); col.oninput = () => { ST.color = col.value; };
  col.onchange = () => X.renderOptions();
  const orig = h('input', { type: 'checkbox', checked: !ST.color }); orig.onchange = () => { ST.color = orig.checked ? null : col.value; X.renderOptions(); };
  ob.append(grp('Edit', seg), vsep(), grp('Font', f), b, it,
    h('button', { class: 'btn sm', onclick: () => pickSystemFont() }, 'System font…'), h('button', { class: 'btn sm', onclick: () => pickFontFile() }, 'Font file…'), vsep(),
    h('label', { class: 'grp', 'data-tip': 'When the original font lacks a letter, use the same font installed on this computer' }, ml, 'Match installed fonts'), vsep(),
    grp('Colour', col), h('label', { class: 'grp' }, orig, 'Original'), vsep(),
    h('button', { class: 'btn sm', 'data-tip': 'Click text to edit it, or click empty space to add a paragraph', onclick: () => replaceDialog() }, 'Replace everywhere…'));
}
