// Review features for BTS PDF Pro: comments panel (reply / resolve / filter / export), stamps library,
// measure tool, Fill & Sign extras, form tools (field types & properties, auto-detect, tab order,
// clear / import / export) and search with match-case / whole-word, find & redact, redact patterns.
import { X, today, textFrac } from './ctx.js';
import { itemRect } from './reading.js';
import { measureValue } from './annots.js';
import { normUrl } from './docops.js';

const { h } = UI;
const S_ = () => X.S;
const LBL = { hl: null, hlarea: 'Area highlight', note: 'Comment', text: 'Text', ink: 'Drawing', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow', image: 'Image', stamp: 'Stamp', redact: 'Redaction', field: 'Form field', watermark: 'Watermark', callout: 'Callout', measure: 'Measurement', mark: 'Mark', wmimg: 'Image watermark', bg: 'Background', link: 'Link', signhere: 'Sign here', dsig: 'Signature stamp' };
export function typeLabel(a) {
  if (a.type === 'pdf') return a.label;
  if (a.type === 'hl') return a.kind === 'highlight' ? 'Highlight' : a.kind === 'underline' ? 'Underline' : 'Strikethrough';
  if (a.type === 'image' && a.sig) return a.sig === 'Initials' ? 'Initials' : 'Signature';
  if (a.type === 'text' && a.hf) return 'Header / footer';
  return LBL[a.type] || (a.type[0].toUpperCase() + a.type.slice(1));
}
const fmtDate = d => { try { return I18N.date(d, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

// =====================================================================================  comments panel
const CF = { type: 'all', status: 'all', author: 'all', q: '' };
const CAT = a => ['note', 'text', 'callout'].includes(a.type) ? 'comments' : ['hl', 'hlarea'].includes(a.type) ? 'markup' : ['ink', 'rect', 'ellipse', 'line', 'arrow', 'measure'].includes(a.type) ? 'drawing' : ['stamp', 'image', 'signhere', 'dsig', 'mark'].includes(a.type) ? 'stamps' : 'other';
export function commentList() {
  return S_().pages.flatMap((pg, i) => pg.annots.filter(a => !['watermark', 'wmimg', 'bg'].includes(a.type) && !a.hf).map(a => ({ pg, i, a })));
}
// comments already stored in the PDF (from earlier saves or other apps) — read with pdf.js
const PDF_SUB = { Text: 'Note', FreeText: 'Text box', Highlight: 'Highlight', Underline: 'Underline', StrikeOut: 'Strikethrough', Squiggly: 'Squiggly', Ink: 'Drawing', Square: 'Rectangle', Circle: 'Ellipse', Line: 'Line', Polygon: 'Polygon', PolyLine: 'Polyline', Stamp: 'Stamp', Caret: 'Caret', FileAttachment: 'Attachment' };
export async function docComments() {
  const S = S_(); const out = [];
  for (let i = 0; i < S.pages.length; i++) {
    const pg = S.pages[i]; let list = [];
    try { await X.ensureJs(pg); list = await pg._js.getAnnotations({ intent: 'any' }); } catch { }
    const byId = new Map(); const items = [];
    for (const an of list) {
      if (!PDF_SUB[an.subtype]) continue;
      const it = { id: an.id, sub: an.subtype, label: PDF_SUB[an.subtype], text: an.contentsObj?.str || '', author: an.titleObj?.str || '', date: an.modificationDate || '', rect: an.rect, replies: [], status: null, irt: an.inReplyTo };
      byId.set(an.id, it); items.push(it);
    }
    for (const it of items) {
      if (it.irt && byId.has(it.irt)) { const par = byId.get(it.irt); if (/^(Completed|Accepted)$/i.test(it.text)) par.status = 'resolved'; else par.replies.push({ author: it.author, text: it.text, date: it.date }); it.child = true; }
    }
    items.filter(it => !it.child && (it.text || it.sub !== 'Text')).forEach(a => out.push({ pg, i, a }));
  }
  return out;
}
const pdfDateStr = d => { const m = /D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?/.exec(d || ''); return m ? fmtDate(`${m[1]}-${m[2]}-${m[3]}T${m[4] || '00'}:${m[5] || '00'}:00`) : (d ? fmtDate(d) : ''); };
export function renderComments() {
  const S = S_(); const b = document.getElementById('lpBody'); b.innerHTML = '';
  const all = commentList();
  const authors = [...new Set(all.map(x => x.a.author).filter(Boolean))];
  const sel = (key, opts) => { const s = h('select', {}, ...opts.map(([v, l]) => h('option', { value: v, selected: CF[key] === v }, l))); s.onchange = () => { CF[key] = s.value; renderComments(); }; return s; };
  const q = h('input', { type: 'text', placeholder: 'Filter comments…', value: CF.q }); let qt; q.oninput = () => { clearTimeout(qt); qt = setTimeout(() => { CF.q = q.value; renderComments(); setTimeout(() => { const n = document.querySelector('.cm-filters input'); n?.focus(); n?.setSelectionRange(n.value.length, n.value.length); }, 0); }, 250); };
  b.append(h('div', { class: 'cm-filters' }, q,
    h('div', { class: 'row' }, sel('type', [['all', 'All types'], ['comments', 'Comments & text'], ['markup', 'Highlights'], ['drawing', 'Drawings & shapes'], ['stamps', 'Stamps & signatures'], ['other', 'Other']]),
      sel('status', [['all', 'Any status'], ['open', 'Open'], ['resolved', 'Resolved']])),
    h('div', { class: 'row' }, sel('author', [['all', 'All authors'], ...authors.map(a => [a, a])]),
      h('button', { class: 'btn sm', 'data-tip': 'Export a summary of all comments', onclick: () => exportComments(), html: X.icon('export') + 'Export' }))));
  const list = all.filter(({ a }) => (CF.type === 'all' || CAT(a) === CF.type) && (CF.status === 'all' || (CF.status === 'resolved') === (a.status === 'resolved')) && (CF.author === 'all' || a.author === CF.author)
    && (!CF.q || [a.text, a.comment, a.label, a.name, ...(a.replies || []).map(r => r.text)].join(' ').toLowerCase().includes(CF.q.toLowerCase())));
  b.append(h('div', { class: 'muted cm-count' }, all.length ? `Added in this session — ${list.length} of ${all.length} item(s)` : 'No new comments in this session. Use the Comment menu or the tools on the left to add some.'));
  const docBox = h('div'); b.append(docBox);
  docComments().then(dl => {
    if (S_().leftTab !== 'comments' || !dl.length) return;
    const f = dl.filter(({ a }) => (CF.type === 'all' || CF.type === 'comments') && (CF.status === 'all' || (CF.status === 'resolved') === (a.status === 'resolved')) && (CF.author === 'all' || a.author === CF.author) && (!CF.q || [a.text, ...a.replies.map(r => r.text)].join(' ').toLowerCase().includes(CF.q.toLowerCase())));
    docBox.append(h('div', { class: 'muted cm-count' }, `Saved in the document (${f.length})`));
    for (const { i, a } of f) {
      const card = h('div', { class: 'cmt pdfc' + (a.status === 'resolved' ? ' resolved' : '') }, h('div', { class: 'meta' }, `${a.label} · Page ${i + 1}${a.author ? ' · ' + a.author : ''}${a.date ? ' · ' + pdfDateStr(a.date) : ''}`));
      if (a.text) card.append(h('div', { class: 'cm-body' }, a.text));
      a.replies.forEach(r => card.append(h('div', { class: 'reply' }, h('div', { class: 'meta' }, `${r.author} · ${pdfDateStr(r.date)}`), r.text)));
      if (a.status === 'resolved') card.append(h('div', { class: 'cm-status' }, '✓ Resolved'));
      card.onclick = () => X.scrollToPage(i, a.rect ? a.rect[3] + 20 : null);
      docBox.append(card);
    }
  });
  for (const { pg, i, a } of list) {
    const card = h('div', { class: 'cmt' + (a.status === 'resolved' ? ' resolved' : '') + (S.sel?.annId === a.id ? ' sel' : ''), style: { '--c': a.color && a.color.startsWith('#') ? a.color : '#888' } });
    card.append(h('div', { class: 'meta' }, `${typeLabel(a)} · Page ${i + 1}${a.author ? ' · ' + a.author : ''}${a.date ? ' · ' + fmtDate(a.date) : ''}`));
    const body = a.text || a.comment || a.label || a.name || (a.type === 'measure' ? measureValue(a) : a.type === 'link' ? (a.url || (a.page ? 'Go to page ' + a.page : '')) : '');
    if (body) card.append(h('div', { class: 'cm-body' }, body));
    (a.replies || []).forEach((r, k) => card.append(h('div', { class: 'reply' }, h('div', { class: 'meta' }, `${r.author || ''} · ${fmtDate(r.date)}`, h('span', { class: 'x', title: 'Delete reply', onclick: e => { e.stopPropagation(); a.replies.splice(k, 1); X.commit('Delete reply'); } }, '✕')), r.text)));
    if (a.status === 'resolved') card.append(h('div', { class: 'cm-status' }, '✓ Resolved' + (a.resolvedBy ? ' by ' + a.resolvedBy : '')));
    const acts = h('div', { class: 'cm-acts' },
      h('button', { class: 'btn sm ghost', onclick: e => { e.stopPropagation(); replyBox(card, a); } }, 'Reply'),
      h('button', { class: 'btn sm ghost', onclick: e => { e.stopPropagation(); toggleResolve(a); } }, a.status === 'resolved' ? 'Reopen' : 'Resolve'),
      h('button', { class: 'btn sm ghost', onclick: e => { e.stopPropagation(); X.select(pg.id, a.id); X.S.sel = { pageId: pg.id, annId: a.id }; const del = pg.annots.indexOf(a); if (del >= 0) { pg.annots.splice(del, 1); X.S.sel = null; X.drawAnnots(pg); X.commit('Delete'); X.renderProps(); } } }, 'Delete'));
    card.append(acts);
    card.onclick = () => { const bb = X.bbox(a); X.scrollToPage(i, bb.y + bb.h); X.setTool('select'); X.select(pg.id, a.id); };
    b.append(card);
  }
}
export function addReply(a, text, author = S_().author) { (a.replies = a.replies || []).push({ author, text, date: new Date().toISOString() }); X.commit('Reply'); }
export function toggleResolve(a) { if (a.status === 'resolved') { a.status = 'open'; delete a.resolvedBy; } else { a.status = 'resolved'; a.resolvedBy = S_().author; } X.commit(a.status === 'resolved' ? 'Resolve' : 'Reopen'); }
function replyBox(card, a) {
  if (card.querySelector('.reply-box')) return;
  const ta = h('textarea', { rows: 2, placeholder: 'Write a reply…' });
  const box = h('div', { class: 'reply-box', onclick: e => e.stopPropagation() }, ta, h('div', { class: 'row' }, h('span', { class: 'grow' }), h('button', { class: 'btn sm', onclick: () => box.remove() }, 'Cancel'), h('button', { class: 'btn sm primary', onclick: () => { if (ta.value.trim()) addReply(a, ta.value.trim()); } }, 'Reply')));
  ta.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter' && e.ctrlKey && ta.value.trim()) addReply(a, ta.value.trim()); };
  card.insertBefore(box, card.querySelector('.cm-acts')); ta.focus();
}
export function commentsSummary(fmt = 'txt', saved = []) {
  const S = S_(); const list = commentList().concat(saved.map(({ pg, i, a }) => ({ pg, i, a: { type: 'pdf', label: a.label, text: a.text, author: a.author, date: a.date, status: a.status, replies: a.replies, saved: true } })));
  list.sort((x, y) => x.i - y.i);
  if (fmt === 'csv') {
    const q = s => '"' + String(s ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
    const rows = [['Page', 'Type', 'Author', 'Date', 'Status', 'Text', 'Replies'].map(q).join(',')];
    list.forEach(({ i, a }) => rows.push([i + 1, typeLabel(a), a.author || '', a.saved ? pdfDateStr(a.date) : a.date || '', a.status || 'open', a.text || a.comment || a.label || (a.type === 'measure' ? measureValue(a) : a.type === 'mark' ? a.kind : a.type === 'link' ? (a.url || (a.page ? 'Go to page ' + a.page : '')) : ''), (a.replies || []).map(r => `${r.author}: ${r.text}`).join(' | ')].map(q).join(',')));
    return rows.join('\r\n');
  }
  let out = `Comments summary — ${S.fileName || 'Untitled.pdf'}\nExported ${new Date().toLocaleString()} · ${list.length} item(s)\n`;
  let lastPage = -1;
  for (const { i, a } of list) {
    if (i !== lastPage) { out += `\n=== Page ${i + 1} ===\n`; lastPage = i; }
    out += `\n• ${typeLabel(a)}${a.author ? ' — ' + a.author : ''}${a.date ? ' (' + (a.saved ? pdfDateStr(a.date) : fmtDate(a.date)) + ')' : ''}${a.status === 'resolved' ? ' [Resolved]' : ''}\n`;
    const t = a.text || a.comment || a.label || (a.type === 'measure' ? measureValue(a) : ''); if (t) out += '  ' + t.replace(/\n/g, '\n  ') + '\n';
    (a.replies || []).forEach(r => out += `    ↳ ${r.author || ''}: ${r.text}\n`);
  }
  return out;
}
export async function exportComments() {
  if (!S_().pages.length) return;
  const v = await UI.form({ title: 'Export comments summary', fields: [{ key: 'fmt', label: 'Format', type: 'select', value: 'txt', options: [{ value: 'txt', label: 'Text summary (.txt)' }, { value: 'csv', label: 'Spreadsheet (.csv)' }] }], ok: 'Export…' });
  if (!v) return;
  const base = (S_().fileName || 'document.pdf').replace(/\.pdf$/i, '');
  const p = await X.IO.saveAs({ data: new TextEncoder().encode((v.fmt === 'csv' ? '﻿' : '') + commentsSummary(v.fmt, await docComments())), defaultPath: `${base}-comments.${v.fmt}`, filters: [{ name: v.fmt.toUpperCase(), extensions: [v.fmt] }] });
  if (p) UI.toast('Comments exported', 'ok');
}

// =====================================================================================  properties panel extras
export function extraProps(body, row, pg, a) {
  const commit = l => { X.drawAnnots(pg); X.commit(l); };
  if (a.type === 'measure') {
    row('Value', h('b', { style: { color: 'var(--tx-0)' } }, measureValue(a)));
    row('Scale', h('span', {}, a.scale?.label || '1 in = 1 in'));
  }
  if (a.type === 'link') {
    const u = h('input', { type: 'text', value: a.url || '', placeholder: 'https://…' }); u.onchange = () => { a.url = u.value.trim(); if (a.url) a.page = null; commit('Link'); };
    const pgi = h('input', { type: 'number', min: 1, max: S_().pages.length, value: a.page || '' }); pgi.onchange = () => { a.page = +pgi.value || null; if (a.page) a.url = ''; commit('Link'); };
    row('Web address', u); row('or page', pgi);
  }
  if (a.type === 'stamp') { const l = h('input', { type: 'text', value: a.label }); l.onchange = () => { a.label = l.value; a.w = Math.max(a.w, l.value.length * 11); commit('Stamp text'); }; row('Text', l); }
  if (a.type === 'wmimg' || a.type === 'watermark') { const r = h('input', { type: 'range', min: -90, max: 90, value: a.angle || 0 }); r.oninput = () => { a.angle = +r.value; X.drawAnnots(pg); }; r.onchange = () => X.commit('Rotate'); row('Rotation', r); }
  if (a.type === 'dsig') { const n = h('input', { type: 'text', value: a.name }); n.onchange = () => { a.name = n.value; commit('Signature stamp'); }; row('Name', n); const r = h('input', { type: 'text', value: a.reason || '' }); r.onchange = () => { a.reason = r.value; commit('Signature stamp'); }; row('Reason', r); }
  if (a.type === 'signhere') { const l = h('input', { type: 'text', value: a.label || 'Sign here' }); l.onchange = () => { a.label = l.value; commit('Sign here'); }; row('Label', l); }
  // replies & status for anything comment-like
  if (!['bg', 'watermark', 'wmimg', 'field', 'redact'].includes(a.type)) {
    const rep = h('div', { class: 'prop-replies' });
    (a.replies || []).forEach(r => rep.append(h('div', { class: 'reply' }, h('div', { class: 'meta' }, `${r.author} · ${fmtDate(r.date)}`), r.text)));
    const ta = h('textarea', { rows: 2, placeholder: 'Reply…', style: { width: '100%' } }); ta.onkeydown = e => e.stopPropagation();
    rep.append(ta, h('div', { class: 'row', style: { marginTop: '6px' } }, h('button', { class: 'btn sm', onclick: () => { if (ta.value.trim()) { addReply(a, ta.value.trim()); X.renderProps(); } } }, 'Add reply'),
      h('button', { class: 'btn sm', onclick: () => { toggleResolve(a); X.renderProps(); } }, a.status === 'resolved' ? 'Reopen' : 'Resolve')));
    body.append(h('div', { class: 'muted', style: { margin: '10px 0 6px' } }, a.status === 'resolved' ? 'Replies · ✓ resolved' : 'Replies'), rep);
  }
}
export async function editLink(pg, a, isNew) {
  const v = await UI.form({ title: isNew ? 'Add link' : 'Edit link', fields: [
    { key: 'kind', label: 'Link to', type: 'select', value: a.page ? 'page' : 'url', options: [{ value: 'url', label: 'Web address or email' }, { value: 'page', label: 'A page in this document' }] },
    { key: 'url', label: 'Web address', value: a.url || 'https://' }, { key: 'page', label: 'Page number', type: 'number', value: a.page || 1, min: 1, max: S_().pages.length }], ok: isNew ? 'Add link' : 'Save' });
  if (!v || (v.kind === 'url' && !v.url.replace(/^https?:\/\/$/, '').trim())) { if (isNew) { pg.annots = pg.annots.filter(x => x !== a); X.drawAnnots(pg); } return; }
  if (v.kind === 'url') { a.url = normUrl(v.url.trim()); a.page = null; } else { a.page = Math.max(1, Math.min(S_().pages.length, +v.page)); a.url = ''; }
  X.drawAnnots(pg); X.commit(isNew ? 'Add link' : 'Edit link'); X.select(pg.id, a.id);
}

// =====================================================================================  stamps
export const STAMPS = [
  { id: 'APPROVED', label: 'Approved', color: '#2e7d32' }, { id: 'REVIEWED', label: 'Reviewed', color: '#1d4ed8' }, { id: 'DRAFT', label: 'Draft', color: '#6b7280' },
  { id: 'CONFIDENTIAL', label: 'Confidential', color: '#c62828' }, { id: 'FINAL', label: 'Final', color: '#2e7d32' }, { id: 'NOT APPROVED', label: 'Not approved', color: '#c62828' },
  { id: 'COMPLETED', label: 'Completed', color: '#2e7d32' }, { id: 'VOID', label: 'Void', color: '#c62828' }, { id: 'FOR COMMENT', label: 'For comment', color: '#e67e00' },
  { id: 'RECEIVED', label: 'Received (with date)', color: '#1d4ed8', date: true }, { id: 'DATE', label: 'Date stamp', color: '#1d4ed8', dateOnly: true },
  { id: 'SIGNHERE', label: 'Sign here (tag)', color: '#b58900', tag: true },
];
const customStamps = () => { try { return JSON.parse(localStorage.getItem('bts.stamps') || '[]'); } catch { return []; } };
const saveCustom = l => { try { localStorage.setItem('bts.stamps', JSON.stringify(l.slice(0, 30))); } catch { UI.toast('Could not save stamp (storage full)', 'err'); } };
export function stampOptions(ob, grp, vsep, swatchRow) {
  const S = S_(); const cs = customStamps();
  const sel = h('select', { style: { maxWidth: '200px' } }, h('optgroup', { label: 'Standard' }, ...STAMPS.map(s => h('option', { value: s.id, selected: s.id === S.stamp }, s.label))),
    cs.length ? h('optgroup', { label: 'My stamps' }, ...cs.map((c, i) => h('option', { value: 'custom:' + i, selected: S.stamp === 'custom:' + i }, c.kind === 'image' ? `Image stamp ${i + 1}` : c.label))) : null);
  sel.onchange = () => { S.stamp = sel.value; S.stampColor = null; X.renderOptions(); };
  const st = STAMPS.find(s => s.id === S.stamp);
  const sub = h('input', { type: 'checkbox', checked: !!S.stampSub }); sub.onchange = () => S.stampSub = sub.checked;
  ob.append(grp('Stamp', sel));
  if (!S.stamp.startsWith('custom:') || customStamps()[+S.stamp.slice(7)]?.kind !== 'image') ob.append(grp('Color', swatchRow(S.stampColor || st?.color || '#c62828', c => { S.stampColor = c; X.renderOptions(); })));
  ob.append(vsep(), h('label', { class: 'grp' }, sub, 'Add name & date'), vsep(),
    h('button', { class: 'btn sm', onclick: customTextStamp }, 'Custom text…'), h('button', { class: 'btn sm', onclick: addImageStamp }, 'Image stamp…'), vsep(), h('span', { class: 'muted' }, 'Click on the page to place'));
}
export function placeStamp(pg, px, py) {
  const S = S_(); const id = S.stamp || 'APPROVED'; let a;
  const dateStr = today('dd Mon yyyy');
  if (id.startsWith('custom:')) {
    const c = customStamps()[+id.slice(7)]; if (!c) return;
    if (c.kind === 'image') { const w = c.w || 120, hh = c.h || 60; a = { id: X.nid(), type: 'image', src: c.src, x: px - w / 2, y: py - hh / 2, w, h: hh, author: S.author, date: new Date().toISOString(), stampName: 'Custom' }; }
    else { const label = c.label.toUpperCase(); const w = Math.max(90, label.length * 11 + 20), hh = S.stampSub ? 44 : 36; a = { id: X.nid(), type: 'stamp', x: px - w / 2, y: py - hh / 2, w, h: hh, label, color: S.stampColor || c.color || '#c62828', sub: S.stampSub ? `${S.author} · ${dateStr}` : null }; }
  } else {
    const st = STAMPS.find(s => s.id === id) || STAMPS[0];
    if (st.tag) { a = { id: X.nid(), type: 'signhere', x: px - 45, y: py - 12, w: 92, h: 24, label: 'Sign here' }; }
    else {
      const label = st.dateOnly ? dateStr.toUpperCase() : st.id; const subTxt = st.date ? dateStr + (S.stampSub ? ' · ' + S.author : '') : S.stampSub ? `${S.author} · ${dateStr}` : null;
      const w = Math.max(90, label.length * 11 + 20, subTxt ? subTxt.length * 6 + 16 : 0), hh = subTxt ? 46 : 36;
      a = { id: X.nid(), type: 'stamp', x: px - w / 2, y: py - hh / 2, w, h: hh, label, color: S.stampColor || st.color, sub: subTxt };
    }
  }
  a.author = a.author || S.author; a.date = a.date || new Date().toISOString();
  pg.annots.push(a); X.drawAnnots(pg); X.commit('Stamp'); return a;
}
export async function customTextStamp() {
  const v = await UI.form({ title: 'Custom text stamp', fields: [{ key: 'label', label: 'Stamp text', value: 'CHECKED' }, { key: 'color', label: 'Colour', type: 'color', value: '#7c3aed' }], ok: 'Save stamp' });
  if (!v || !v.label.trim()) return;
  const l = customStamps(); l.push({ kind: 'text', label: v.label.trim(), color: v.color }); saveCustom(l);
  S_().stamp = 'custom:' + (l.length - 1); X.setTool('stamp');
}
export async function addImageStamp(fileArg) {
  const fs = fileArg ? [fileArg] : await X.IO.open({ filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }] }); if (!fs) return;
  const png = await X.toPngBytes(new Uint8Array(fs[0].data)); const src = await X.u8ToDataUrl(png, 'image/png'); const im = await X.loadImg(src);
  const w = Math.min(140, im.width * 0.75), hh = w * im.height / im.width;
  const l = customStamps(); l.push({ kind: 'image', src, w, h: hh }); saveCustom(l);
  S_().stamp = 'custom:' + (l.length - 1); X.setTool('stamp'); UI.toast('Image stamp saved — click on the page to place it');
}

// =====================================================================================  measure
const SCALE_KEY = 'bts.pdf.scale';
export function getScale() { try { return JSON.parse(localStorage.getItem(SCALE_KEY)) || { ratio: 2.54, unit: 'cm', label: '1 cm = 1 cm' }; } catch { return { ratio: 2.54, unit: 'cm', label: '1 cm = 1 cm' }; } }
export function measureOptions(ob, grp, vsep, swatchRow, restyle) {
  const S = S_(); S.measureMode = S.measureMode || 'distance';
  const seg = h('div', { class: 'seg' }, ...[['distance', 'Distance'], ['perimeter', 'Perimeter'], ['area', 'Area']].map(([k, l]) => h('button', { class: 'btn sm' + (S.measureMode === k ? ' primary' : ''), onclick: () => { S.measureMode = k; cancelMeasure(); X.renderOptions(); } }, l)));
  ob.append(grp('Measure', seg), vsep(), grp('Scale', h('button', { class: 'btn sm', onclick: scaleDialog }, getScale().label)), vsep(), grp('Color', swatchRow(S.style.color, c => { S.style.color = c; restyle(); })), vsep(),
    h('span', { class: 'muted' }, S.measureMode === 'distance' ? 'Drag to measure' : 'Click points; double-click or Enter to finish'));
}
export async function scaleDialog() {
  const cur = getScale();
  const v = await UI.form({ title: 'Measurement scale', fields: [
    { key: 'pv', label: 'On the page', type: 'number', value: cur.pv || 1, step: 'any' }, { key: 'pu', label: 'Page unit', type: 'select', value: cur.pu || 'cm', options: ['mm', 'cm', 'in'] },
    { key: 'rv', label: 'equals in real life', type: 'number', value: cur.rv || 1, step: 'any' }, { key: 'ru', label: 'Real unit', type: 'select', value: cur.ru || 'cm', options: ['mm', 'cm', 'm', 'km', 'in', 'ft', 'yd', 'mi'] }], ok: 'Set scale' });
  if (!v || !(+v.pv > 0) || !(+v.rv > 0)) return;
  const inches = +v.pv / ({ mm: 25.4, cm: 2.54, in: 1 }[v.pu]);
  const sc = { ratio: +v.rv / inches, unit: v.ru, label: `${v.pv} ${v.pu} = ${v.rv} ${v.ru}`, pv: +v.pv, pu: v.pu, rv: +v.rv, ru: v.ru };
  try { localStorage.setItem(SCALE_KEY, JSON.stringify(sc)); } catch { }
  const a = X.selAnn(); if (a?.type === 'measure') { a.scale = sc; X.drawAnnots(X.pageById(S_().sel.pageId)); X.commit('Scale'); }
  X.renderOptions(); X.renderProps(); return sc;
}
let M = null; // active polyline measurement
export function cancelMeasure() { if (!M) return; const { pg, a } = M; M.layer.removeEventListener('pointermove', M.mv); M = null; pg.annots = pg.annots.filter(x => x !== a); X.drawAnnots(pg); }
function finishMeasure() {
  if (!M) return; const { pg, a, layer, mv } = M; layer.removeEventListener('pointermove', mv); M = null;
  a.pts.pop(); // drop the rubber-band point
  const min = a.mode === 'area' ? 3 : 2;
  if (a.pts.length < min) { pg.annots = pg.annots.filter(x => x !== a); X.drawAnnots(pg); return; }
  X.drawAnnots(pg); X.commit('Measure'); X.select(pg.id, a.id);
}
export function measurePointerDown(pg, e, px, py, layer) {
  const S = S_(); const mode = S.measureMode || 'distance';
  if (mode === 'distance') {
    layer.setPointerCapture(e.pointerId);
    const a = { id: X.nid(), type: 'measure', mode, pts: [[px, py], [px, py]], color: S.style.color, sw: 1.2, scale: getScale(), author: S.author, date: new Date().toISOString() };
    pg.annots.push(a);
    const mv = ev => { const [qx, qy] = X.toPdf(pg, ev); a.pts[1] = [qx, qy]; if (ev.shiftKey) { const dx = qx - px, dy = qy - py; if (Math.abs(dx) > Math.abs(dy)) a.pts[1][1] = py; else a.pts[1][0] = px; } X.drawAnnots(pg); };
    const up = () => { layer.removeEventListener('pointermove', mv); layer.removeEventListener('pointerup', up); const [p0, p1] = a.pts; if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 3) { pg.annots = pg.annots.filter(x => x !== a); X.drawAnnots(pg); return; } X.commit('Measure'); X.select(pg.id, a.id); };
    layer.addEventListener('pointermove', mv); layer.addEventListener('pointerup', up); return;
  }
  if (M && M.pg !== pg) cancelMeasure();
  if (!M) {
    const a = { id: X.nid(), type: 'measure', mode, closed: mode === 'perimeter' ? false : undefined, pts: [[px, py], [px, py]], color: S.style.color, sw: 1.2, scale: getScale(), author: S.author, date: new Date().toISOString() };
    pg.annots.push(a);
    const mv = ev => { const q = X.toPdf(pg, ev); a.pts[a.pts.length - 1] = [q[0], q[1]]; X.drawAnnots(pg); };
    layer.addEventListener('pointermove', mv);
    M = { pg, a, layer, mv, lastClick: Date.now() };
    X.drawAnnots(pg); return;
  }
  const a = M.a; const now = Date.now(); const dbl = now - M.lastClick < 320; M.lastClick = now;
  const first = a.pts[0]; const pxr = 6 / (S.zoom * X.PX);
  if (dbl) { finishMeasure(); return; }
  if (a.pts.length > 3 && Math.hypot(px - first[0], py - first[1]) < pxr) { if (a.mode === 'perimeter') a.closed = true; a.pts[a.pts.length - 1] = [px, py]; a.pts.push([px, py]); a.pts.pop(); finishMeasure(); return; }
  a.pts[a.pts.length - 1] = [px, py]; a.pts.push([px, py]); X.drawAnnots(pg);
}
window.addEventListener('keydown', e => { if (!M) return; if (e.key === 'Enter') { e.preventDefault(); finishMeasure(); } else if (e.key === 'Escape') { cancelMeasure(); } }, true);

// =====================================================================================  Fill & Sign extras
export async function placeDate() {
  if (!S_().pages.length) return;
  const v = await UI.form({ title: 'Add date', fields: [{ key: 'fmt', label: 'Format', type: 'select', value: localStorage.getItem('bts.datefmt') || 'dd/mm/yyyy', options: ['dd/mm/yyyy', 'mm/dd/yyyy', 'yyyy-mm-dd', 'dd Mon yyyy'] }, { key: 'size', label: 'Font size', type: 'number', value: 12 }], ok: 'Place' });
  if (!v) return; try { localStorage.setItem('bts.datefmt', v.fmt); } catch { }
  const txt = today(v.fmt); const sz = +v.size || 12; const w = txt.length * sz * 0.56 + 6, hh = sz * 1.4;
  X.startPlacement({ ann: { type: 'text', text: txt, size: sz, w, h: hh, color: '#111111', font: 'Helvetica', bold: false }, w, h: hh, label: 'Add date' }, 'Click where the date should go');
}
export async function dsigDialog() {
  const S = S_(); if (!S.pages.length) return;
  const v = await UI.form({ title: 'Signature stamp (visual only)', width: 460, fields: [
    { key: 'name', label: 'Signer name', value: S.author }, { key: 'reason', label: 'Reason', value: 'I approve this document' }, { key: 'location', label: 'Location', value: '' },
    { key: 'color', label: 'Colour', type: 'color', value: '#1d3fbb' }], ok: 'Place' });
  if (!v) return;
  UI.toast('Note: this is a visual stamp only, not a cryptographic digital signature.', '', 5000);
  const d = new Date(); const date = d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  X.startPlacement({ ann: { type: 'dsig', w: 210, h: 52, name: v.name, reason: v.reason, location: v.location, date, color: v.color }, w: 210, h: 52, label: 'Signature stamp' }, 'Click where the signature stamp should go');
}
export async function manageSignatures() {
  const render = () => {
    const wrap = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '440px' } });
    for (const [key, title] of [['bts.signatures', 'Signatures'], ['bts.initials', 'Initials']]) {
      let list = []; try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch { }
      const g = h('div', { class: 'sig-grid' });
      list.forEach((s, i) => g.append(h('div', { class: 'sig-tile' }, h('img', { src: s }), h('button', { class: 'btn sm', onclick: () => { list.splice(i, 1); localStorage.setItem(key, JSON.stringify(list)); body.replaceChildren(render()); } }, '✕'))));
      if (!list.length) g.append(h('div', { class: 'muted' }, 'None saved'));
      wrap.append(h('div', { class: 'muted' }, title), g);
    }
    return wrap;
  };
  const body = h('div', {}, render());
  const r = await UI.modal({ title: 'Saved signatures', body, buttons: [{ label: 'New initials…', value: 'ini' }, { label: 'New signature…', value: 'sig' }, { label: 'Done', primary: true }] });
  if (r === 'sig') X.signDialog(); else if (r === 'ini') X.signDialog('initials');
}

// =====================================================================================  forms
export const FIELD_TYPES = [['text', 'Text field'], ['multiline', 'Multi-line text'], ['checkbox', 'Checkbox'], ['radio', 'Radio button'], ['dropdown', 'Dropdown list'], ['date', 'Date'], ['number', 'Number']];
export const fieldBaseName = t => ({ text: 'Text', multiline: 'Notes', checkbox: 'Check', radio: 'Radio', dropdown: 'Choice', date: 'Date', number: 'Number' }[t] || 'Field');
export const fieldDefaults = t => t === 'dropdown' ? { options: ['Option 1', 'Option 2', 'Option 3'] } : t === 'radio' ? { group: 'Group1', value: 'Choice' + (1 + S_().pages.reduce((n, p) => n + p.annots.filter(a => a.ftype === 'radio').length, 0)) } : t === 'date' ? { tip: 'Date (dd/mm/yyyy)' } : {};
export function fieldProps(body, row, pg, a) {
  const ch = l => { X.drawAnnots(pg); X.commit(l); };
  const n = h('input', { type: 'text', value: a.name }); n.onchange = () => { a.name = n.value.trim() || a.name; ch('Rename field'); }; row('Field name', n);
  const t = h('select', {}, ...FIELD_TYPES.map(([v, l]) => h('option', { value: v, selected: (a.ftype || 'text') === v }, l))); t.onchange = () => { a.ftype = t.value; Object.assign(a, { ...fieldDefaults(a.ftype), ...a }); if (a.ftype === 'dropdown' && !a.options) a.options = ['Option 1', 'Option 2']; ch('Field type'); X.renderProps(); }; row('Type', t);
  const tip = h('input', { type: 'text', value: a.tip || '', placeholder: 'Shown to screen readers' }); tip.onchange = () => { a.tip = tip.value; ch('Tooltip'); }; row('Tooltip', tip);
  const req = h('input', { type: 'checkbox', checked: !!a.required }); req.onchange = () => { a.required = req.checked; ch('Required'); }; row('Required', req);
  if (!['checkbox', 'radio'].includes(a.ftype)) { const fs = h('input', { type: 'number', min: 0, max: 72, value: a.fontSize || 0, title: '0 = auto' }); fs.onchange = () => { a.fontSize = +fs.value; ch('Font size'); }; row('Font size', fs); }
  if (['text', 'multiline', 'date', 'number'].includes(a.ftype || 'text')) {
    const dv = h('input', { type: 'text', value: a.value || '' }); dv.onchange = () => { a.value = dv.value; ch('Default value'); }; row('Default value', dv);
    const ml = h('input', { type: 'number', min: 0, value: a.maxLen || 0, title: '0 = unlimited' }); ml.onchange = () => { a.maxLen = +ml.value; ch('Max length'); }; row('Max characters', ml);
  }
  if (a.ftype === 'checkbox') { const c = h('input', { type: 'checkbox', checked: !!a.checked }); c.onchange = () => { a.checked = c.checked; ch('Default'); }; row('Checked by default', c); }
  if (a.ftype === 'dropdown') { const o = h('textarea', { rows: 3 }, (a.options || []).join('\n')); o.onkeydown = e => e.stopPropagation(); o.onchange = () => { a.options = o.value.split('\n').map(s => s.trim()).filter(Boolean); ch('Options'); }; row('Options (one per line)', o); }
  if (a.ftype === 'radio') { const g = h('input', { type: 'text', value: a.group || 'Group1' }); g.onchange = () => { a.group = g.value.trim() || 'Group1'; ch('Radio group'); }; row('Group', g); const v = h('input', { type: 'text', value: a.value || '' }); v.onchange = () => { a.value = v.value.trim() || 'Choice'; ch('Radio value'); }; row('Value', v); }
  row('Tab order', h('button', { class: 'btn sm', onclick: () => tabOrderDialog() }, a.tab != null ? `#${a.tab + 1} — change…` : 'Set tab order…'));
}
// create a new AcroForm field on save
export async function createField(doc, p, a, form) {
  const { rgb, PDFName, PDFHexString } = window.PDFLib;
  const font = await X.getFont(doc, 'Helvetica', false);
  const rect = { x: a.x, y: a.y, width: a.w, height: a.h, borderColor: rgb(0.3, 0.3, 0.3), borderWidth: 1 };
  const uniq = base => { let name = base, k = 2; while (true) { try { form.getField(name); name = base + '_' + k++; } catch { return name; } } };
  let f;
  const t = a.ftype || 'text';
  if (t === 'checkbox') { f = form.createCheckBox(uniq(a.name)); f.addToPage(p, rect); if (a.checked) f.check(); }
  else if (t === 'radio') {
    const gname = a.group || 'Group1'; let rg; try { rg = form.getRadioGroup(gname); } catch { rg = form.createRadioGroup(gname); }
    rg.addOptionToPage(a.value || 'Choice', p, rect); f = rg;
  } else if (t === 'dropdown') {
    f = form.createDropdown(uniq(a.name)); f.addOptions(a.options?.length ? a.options : ['Option 1']); f.addToPage(p, { ...rect, font }); if (a.value && a.options?.includes(a.value)) f.select(a.value);
    if (a.fontSize) f.setFontSize(a.fontSize);
  } else {
    f = form.createTextField(uniq(a.name)); if (t === 'multiline') f.enableMultiline(); if (a.maxLen) f.setMaxLength(a.maxLen);
    f.addToPage(p, { ...rect, font }); if (a.value) f.setText(a.value); if (a.fontSize) f.setFontSize(a.fontSize);
  }
  if (a.required) try { f.enableRequired(); } catch { }
  const tip = a.tip || (t === 'date' ? 'Date' : t === 'number' ? 'Number' : '');
  if (tip) f.acroField.dict.set(PDFName.of('TU'), PDFHexString.fromText(tip));
  return f;
}
// fields on a page in tab order: [{ name, kind: 'existing'|'new', ann?, rect }]
function pageFields(pg) {
  const S = S_(); const out = [];
  if (pg.src === 0) S.formFields.filter(f => f.page === pg.index).forEach(f => { if (!out.some(o => o.name === f.name)) out.push({ name: f.name, kind: 'existing', x: f.rect.x, y: f.rect.y + f.rect.height }); });
  pg.annots.filter(a => a.type === 'field').forEach(a => out.push({ name: a.ftype === 'radio' ? (a.group || 'Group1') : a.name, kind: 'new', ann: a, x: a.x, y: a.y + a.h }));
  const order = S.tabOrder?.[pg.id];
  const byPos = (a, b) => (Math.abs(a.y - b.y) > 6 ? b.y - a.y : a.x - b.x);
  out.sort((a, b) => { if (order) { const ia = order.indexOf(a.name), ib = order.indexOf(b.name); if (ia >= 0 || ib >= 0) return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib); } if (a.ann?.tab != null && b.ann?.tab != null) return a.ann.tab - b.ann.tab; return byPos(a, b); });
  return out;
}
export async function tabOrderDialog() {
  const S = S_(); if (!S.pages.length) return; const pg = X.curPage(); let list = pageFields(pg);
  // de-duplicate radio groups
  list = list.filter((f, i) => list.findIndex(g => g.name === f.name) === i);
  if (!list.length) return UI.toast('No form fields on this page');
  const ul = h('div', { class: 'tab-list' });
  const draw = () => { ul.innerHTML = ''; list.forEach((f, i) => ul.append(h('div', { class: 'tab-row' }, h('span', { class: 'n' }, String(i + 1)), h('span', { class: 'grow' }, f.name), h('span', { class: 'muted' }, f.kind === 'new' ? 'new' : ''),
    h('button', { class: 'btn sm ghost', onclick: () => { if (i) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; draw(); } } }, '↑'), h('button', { class: 'btn sm ghost', onclick: () => { if (i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; draw(); } } }, '↓')))); };
  draw();
  const body = h('div', { style: { minWidth: '380px' } }, h('div', { class: 'row', style: { marginBottom: '8px' } }, h('span', { class: 'muted grow' }, `Page ${X.currentPageIdx() + 1} — order used by the Tab key`),
    h('button', { class: 'btn sm', onclick: () => { list.sort((a, b) => Math.abs(a.y - b.y) > 6 ? b.y - a.y : a.x - b.x); draw(); } }, 'By rows'), h('button', { class: 'btn sm', onclick: () => { list.sort((a, b) => Math.abs(a.x - b.x) > 6 ? a.x - b.x : b.y - a.y); draw(); } }, 'By columns')), ul);
  const r = await UI.modal({ title: 'Tab order', body, buttons: [{ label: 'Cancel', value: null }, { label: 'Apply', primary: true, value: 'ok' }] });
  if (r !== 'ok') return;
  return applyTabOrder(pg, list.map(f => f.name));
}
export function applyTabOrder(pg, names) {
  const S = S_(); S.tabOrder = S.tabOrder || {}; S.tabOrder[pg.id] = names;
  pg.annots.filter(a => a.type === 'field').forEach(a => { const n = a.ftype === 'radio' ? (a.group || 'Group1') : a.name; a.tab = names.indexOf(n); });
  X.commit('Tab order'); UI.toast('Tab order set — written when you save', 'ok');
}
export function clearForm() {
  const S = S_();
  for (const f of S.formFields) S.formValues[f.name] = f.type === 'PDFCheckBox' ? false : '';
  S.pages.forEach(pg => pg.annots.filter(a => a.type === 'field').forEach(a => { delete a.value; a.checked = false; }));
  S.pages.forEach(pg => X.drawForms(pg)); X.commit('Clear form'); UI.toast('Form cleared', 'ok');
}
export function formData() {
  const S = S_(); const out = {};
  for (const f of S.formFields) out[f.name] = S.formValues[f.name] ?? (f.type === 'PDFCheckBox' ? false : '');
  S.pages.forEach(pg => pg.annots.filter(a => a.type === 'field').forEach(a => { if (a.ftype === 'radio') { if (a.checked) out[a.group || 'Group1'] = a.value; } else out[a.name] = a.ftype === 'checkbox' ? !!a.checked : (a.value || ''); }));
  return out;
}
export async function exportFormData() {
  const S = S_(); if (!S.pages.length) return;
  const data = formData(); if (!Object.keys(data).length) return UI.toast('This document has no form fields');
  const base = (S.fileName || 'document.pdf').replace(/\.pdf$/i, '');
  const p = await X.IO.saveAs({ data: new TextEncoder().encode(JSON.stringify({ file: S.fileName, exported: new Date().toISOString(), fields: data }, null, 2)), defaultPath: base + '-form.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (p) UI.toast('Form data exported', 'ok'); return p;
}
export async function importFormData(fileArg) {
  const S = S_(); if (!S.pages.length) return;
  const fs = fileArg ? [fileArg] : await X.IO.open({ filters: [{ name: 'JSON', extensions: ['json'] }] }); if (!fs) return;
  let obj; try { obj = JSON.parse(new TextDecoder().decode(new Uint8Array(fs[0].data))); } catch { return UI.toast('Not a valid JSON file', 'err'); }
  const data = obj.fields || obj; let n = 0;
  for (const [k, v] of Object.entries(data)) {
    const f = S.formFields.find(x => x.name === k);
    if (f) { S.formValues[k] = f.type === 'PDFCheckBox' ? !!v && v !== 'Off' && v !== 'false' : String(v ?? ''); n++; continue; }
    S.pages.forEach(pg => pg.annots.filter(a => a.type === 'field').forEach(a => { if (a.ftype === 'radio' && (a.group || 'Group1') === k) { a.checked = a.value === v; n++; } else if (a.name === k) { if (a.ftype === 'checkbox') a.checked = !!v; else a.value = String(v ?? ''); n++; } }));
  }
  S.pages.forEach(pg => { X.drawForms(pg); X.drawAnnots(pg); }); X.commit('Import form data'); UI.toast(`Filled ${n} field(s)`, 'ok'); return n;
}
// ---- auto-detect fields
function itemBox(it, a = 0, b = it.str.length) {
  const [A, B, C, D, E, F] = it.transform; const len = Math.max(1, it.str.length);
  const ul = Math.hypot(A, B) || 1, vl = Math.hypot(C, D) || it.height || 10; const w = it.width || len * vl * 0.5;
  const ux = A / ul, uy = B / ul; const vx = -uy, vy = ux;
  const f0 = textFrac(it.str, a), f1 = textFrac(it.str, b);
  const pts = [[f0, -0.22], [f1, -0.22], [f0, 0.92], [f1, 0.92]].map(([fx, fy]) => [E + ux * w * fx + vx * vl * fy, F + uy * w * fx + vy * vl * fy]);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), size: vl };
}
export async function detectFields(pg) {
  const S = S_(); const { items } = await X.pageText(pg); const out = [];
  const clean = t => (t || '').replace(/[_.:…\s]+$/g, '').trim().split(/\s{2,}|:/).pop().trim().slice(0, 30);
  const boxLabel = r => { const c = items.filter(it => it.str.trim() && it.transform[5] >= r.y - 3 && it.transform[5] <= r.y + r.h + 4 && it.transform[4] < r.x - 1).sort((a, b) => b.transform[4] - a.transform[4] || b.transform[5] - a.transform[5]); return clean(c[0]?.str); };
  const rightLabel = r => { const c = items.filter(it => it.str.trim() && Math.abs(it.transform[5] - r.y) < 8 && it.transform[4] > r.x + r.w - 1).sort((a, b) => a.transform[4] - b.transform[4]); return clean(c[0]?.str); };
  const lineLabel = (y, x) => { const cand = items.filter(it => it.str.trim() && Math.abs(it.transform[5] - y) < 6 && it.transform[4] < x - 1).sort((a, b) => b.transform[4] - a.transform[4]); const t = (cand[0]?.str || '').replace(/[_.:…\s]+$/g, '').trim(); return t.split(/\s{2,}|:/).pop().trim().slice(0, 30); };
  // 1) runs of underscores / dots in text
  items.forEach(it => {
    const re = /_{4,}|\.{6,}|…{3,}/g; let m;
    while ((m = re.exec(it.str))) {
      const r = itemBox(it, m.index, m.index + m[0].length); if (r.w < 20) continue;
      const before = it.str.slice(0, m.index).replace(/[:\s]+$/, '').trim();
      const label = before.split(/\s{2,}|:/).pop().trim().slice(0, 30) || lineLabel(it.transform[5], r.x);
      out.push({ kind: 'text', x: r.x, y: r.y + r.size * 0.05, w: r.w, h: Math.max(12, r.size * 1.25), label, src: 'underline' });
    }
    const re2 = /[☐□❑▢]|\[\s?\]/g;
    while ((m = re2.exec(it.str))) { const r = itemBox(it, m.index, m.index + m[0].length); const s = Math.max(8, Math.min(16, r.size * 0.85)); const after = it.str.slice(m.index + m[0].length).trim().slice(0, 30); out.push({ kind: 'checkbox', x: r.x + (r.w - s) / 2, y: r.y + (r.h - s) / 2, w: s, h: s, label: after || 'Check', src: 'box-char' }); }
  });
  // 2) drawn boxes and lines in the page graphics
  try {
    const OPS = X.pdfjsLib.OPS; const ol = await pg._js.getOperatorList({ annotationMode: X.pdfjsLib.AnnotationMode.DISABLE }); let ctm = [1, 0, 0, 1, 0, 0]; const stack = [];
    const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
    const tp = (x, y) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
    let pending = [];
    for (let k = 0; k < ol.fnArray.length; k++) {
      const fn = ol.fnArray[k], args = ol.argsArray[k];
      if (fn === OPS.save) stack.push(ctm.slice()); else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = mul(ctm, args);
      else if (fn === OPS.constructPath) {
        const ops = args[0], co = args[1]; let ci = 0; pending = []; let sub = [], curved = false;
        // a sub-path of 4 axis-aligned straight edges is a rectangle; otherwise keep long horizontal segments as "lines"
        const flush = () => {
          if (sub.length >= 2 && !curved) {
            const pts = sub.slice(); if (pts.length === 5 && Math.hypot(pts[4][0] - pts[0][0], pts[4][1] - pts[0][1]) < 0.8) pts.pop();
            const axis = pts.every((p, i) => { const q = pts[(i + 1) % pts.length]; return Math.abs(p[0] - q[0]) < 0.8 || Math.abs(p[1] - q[1]) < 0.8; });
            if (pts.length === 4 && axis) { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); pending.push({ t: 'rect', x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }); }
            else for (let i = 1; i < sub.length; i++) { const p = sub[i], q = sub[i - 1]; if (Math.abs(p[1] - q[1]) < 0.8 && Math.abs(p[0] - q[0]) >= 50) pending.push({ t: 'line', x: Math.min(p[0], q[0]), y: p[1], w: Math.abs(p[0] - q[0]) }); }
          }
          sub = []; curved = false;
        };
        for (const op of ops) {
          if (op === OPS.rectangle) { flush(); const [x, y, w, hh] = co.slice(ci, ci + 4); ci += 4; const p1 = tp(x, y), p2 = tp(x + w, y + hh); pending.push({ t: 'rect', x: Math.min(p1[0], p2[0]), y: Math.min(p1[1], p2[1]), w: Math.abs(p2[0] - p1[0]), h: Math.abs(p2[1] - p1[1]) }); }
          else if (op === OPS.moveTo) { flush(); sub.push(tp(co[ci], co[ci + 1])); ci += 2; }
          else if (op === OPS.lineTo) { sub.push(tp(co[ci], co[ci + 1])); ci += 2; }
          else if (op === OPS.curveTo) { ci += 6; curved = true; } else if (op === OPS.curveTo2 || op === OPS.curveTo3) { ci += 4; curved = true; }
          else if (op === OPS.closePath) { if (sub.length) sub.push(sub[0]); }
        }
        flush();
      } else if ([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke, OPS.fill, OPS.eoFill].includes(fn)) {
        const stroked = ![OPS.fill, OPS.eoFill].includes(fn);
        for (const r of pending) {
          if (r.t === 'line' && stroked) out.push({ kind: 'text', x: r.x, y: r.y + 1, w: r.w, h: 16, label: lineLabel(r.y + 2, r.x), src: 'line' });
          else if (r.t === 'rect') {
            if (r.w >= 5.5 && r.w <= 20 && Math.abs(r.w - r.h) < 2.5 && stroked) out.push({ kind: 'checkbox', x: r.x, y: r.y, w: r.w, h: r.h, label: rightLabel(r) || 'Check', src: 'square' });
            else if (r.h >= 11 && r.h <= 45 && r.w >= 40 && r.w < (pg.w || 600) * 0.95) out.push({ kind: r.h > 30 ? 'multiline' : 'text', x: r.x, y: r.y, w: r.w, h: r.h, label: boxLabel(r) || lineLabel(r.y + r.h * 0.3, r.x), src: 'box' });
          }
        }
        pending = [];
      } else if (fn === OPS.endPath) pending = [];
    }
  } catch (e) { console.warn('graphic field scan', e); }
  // drop boxes containing text (table cells etc.), overlaps with existing fields and duplicates
  const existing = (pg.src === 0 ? S.formFields.filter(f => f.page === pg.index).map(f => ({ x: f.rect.x, y: f.rect.y, w: f.rect.width, h: f.rect.height })) : []).concat(pg.annots.filter(a => a.type === 'field'));
  const ov = (a, b) => !(a.x + a.w < b.x + 1 || b.x + b.w < a.x + 1 || a.y + a.h < b.y + 1 || b.y + b.h < a.y + 1);
  const textIn = r => items.some(it => { if (!it.str.trim() || /^[_.\s…☐□❑▢\[\]]+$/.test(it.str)) return false; const b = itemBox(it); const cx = b.x + b.w / 2, cy = b.y + b.h / 2; return cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h; });
  const res = [];
  for (const f of out) {
    if (f.src === 'box' && textIn(f)) continue;
    if (existing.some(e => ov(e, f))) continue;
    if (res.some(r => ov(r, f))) continue;
    res.push(f);
  }
  return res;
}
export async function autoDetectFields(apply) {
  const S = S_(); if (!S.pages.length) return;
  UI.toast('Looking for blanks, boxes and lines…');
  const found = [];
  for (let i = 0; i < S.pages.length; i++) { const pg = S.pages[i]; await X.ensureJs(pg); (await detectFields(pg)).forEach(f => found.push({ ...f, pageIdx: i, on: true })); }
  if (!found.length) { UI.toast('No likely form fields found. Use the Form field tool (F) to add them by hand.'); return 0; }
  const names = new Set();
  found.forEach((f, k) => { let base = (f.label || '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '_') || (f.kind === 'checkbox' ? 'Check' : 'Field'); let n = base, j = 2; while (names.has(n)) n = base + '_' + j++; names.add(n); f.name = n; });
  if (!apply) {
    const list = h('div', { class: 'detect-list' });
    found.forEach(f => { const cb = h('input', { type: 'checkbox', checked: true }); cb.onchange = () => f.on = cb.checked; const nm = h('input', { type: 'text', value: f.name }); nm.oninput = () => f.name = nm.value; nm.onkeydown = e => e.stopPropagation();
      const tp = h('select', {}, ...FIELD_TYPES.map(([v, l]) => h('option', { value: v, selected: v === f.kind }, l))); tp.onchange = () => f.kind = tp.value;
      list.append(h('div', { class: 'detect-row' }, cb, h('span', { class: 'muted pg' }, 'p.' + (f.pageIdx + 1)), nm, tp)); });
    const r = await UI.modal({ title: `Auto-detect form fields — ${found.length} found`, width: 560, body: h('div', {}, h('div', { class: 'muted', style: { marginBottom: '8px' } }, 'Found from blank lines (____), boxes and checkbox symbols. Untick anything that should not become a field.'), list), buttons: [{ label: 'Cancel', value: null }, { label: 'Add fields', primary: true, value: 'ok' }] });
    if (r !== 'ok') return 0;
  }
  let n = 0;
  for (const f of found.filter(f => f.on)) {
    const pg = S.pages[f.pageIdx]; pg.annots.push({ id: X.nid(), type: 'field', ftype: f.kind, name: f.name || 'Field', x: f.x, y: f.y, w: f.w, h: f.h, ...fieldDefaults(f.kind), tip: f.label || '' }); n++;
  }
  S.pages.forEach(pg => X.drawAnnots(pg)); X.commit('Auto-detect fields'); X.setTool('select');
  UI.toast(`Added ${n} field(s). Select one to edit its properties; save to make them fillable.`, 'ok', 5000);
  return n;
}

// =====================================================================================  search & redact
const SO = { matchCase: false, whole: false, all: true };
let hits = []; let cur = -1; let lastQ = '';
function buildRe(q, o = SO) {
  const body = o.regex ? q : X.escRe(q);
  return new RegExp(o.whole ? `(?<![\\p{L}\\p{N}_])(?:${body})(?![\\p{L}\\p{N}_])` : body, 'gu' + (o.matchCase ? '' : 'i'));
}
// page text with item offsets (same joining as X.pageText)
async function pageIndex(pg) { const t = await X.pageText(pg); if (!t._off) { let o = 0; t._off = t.items.map(it => { const s = o; o += it.str.length + (it.hasEOL ? 1 : 0); return s; }); } return t; }
function rectsFor(t, start, end) {
  const out = [];
  t.items.forEach((it, k) => { const s = t._off[k], e = s + it.str.length; if (e <= start || s >= end || !it.str) return; const a = Math.max(0, start - s), b = Math.min(it.str.length, end - s); if (b > a) out.push({ k, a, b, box: itemBox(it, a, b) }); });
  return out;
}
export async function findAll(q, o = SO) {
  const S = S_(); const res = []; if (!q) return res; let re; try { re = buildRe(q, o); } catch { return res; }
  for (let i = 0; i < S.pages.length; i++) {
    const t = await pageIndex(S.pages[i]); re.lastIndex = 0; let m;
    while ((m = re.exec(t.str))) { if (!m[0].length) { re.lastIndex++; continue; } res.push({ i, start: m.index, end: m.index + m[0].length, text: m[0], snip: t.str.slice(Math.max(0, m.index - 30), m.index + m[0].length + 40).replace(/\s+/g, ' '), parts: rectsFor(t, m.index, m.index + m[0].length) }); if (res.length > 5000) return res; }
  }
  return res;
}
export function renderSearch(focus) {
  const S = S_(); const b = document.getElementById('lpBody'); b.innerHTML = '';
  const inp = h('input', { type: 'text', placeholder: 'Find in document…', value: lastQ, style: { width: '100%' } });
  const opt = (k, l) => { const c = h('input', { type: 'checkbox', checked: SO[k] }); c.onchange = () => { SO[k] = c.checked; run(); }; return h('label', { class: 'row so' }, c, l); };
  const info = h('div', { class: 'muted', style: { fontSize: '11.5px', margin: '6px 2px' } }); const res = h('div', { class: 'sr-list' });
  b.append(inp, h('div', { class: 'so-row' }, opt('matchCase', 'Match case'), opt('whole', 'Whole words'), opt('all', 'Highlight all')),
    h('div', { class: 'row', style: { margin: '6px 0' } }, h('button', { class: 'btn sm', onclick: () => stepHit(-1) }, '‹ Prev'), h('button', { class: 'btn sm', onclick: () => stepHit(1) }, 'Next ›'), h('span', { class: 'grow' }),
      h('button', { class: 'btn sm', 'data-tip': 'Mark every match for permanent redaction', onclick: () => redactHits() }, 'Redact all')),
    h('button', { class: 'btn sm', style: { width: '100%', marginBottom: '6px' }, onclick: () => redactPatternsDialog() }, 'Redact sensitive data (email, phone, ID)…'), info, res);
  const run = async () => {
    lastQ = inp.value; S.search.q = lastQ; hits = await findAll(lastQ); cur = hits.length ? 0 : -1; S.search.hits = hits;
    info.textContent = lastQ ? (hits.length ? `${hits.length} result${hits.length > 1 ? 's' : ''} on ${new Set(hits.map(x => x.i)).size} page(s)` : 'No results') : '';
    res.innerHTML = '';
    hits.slice(0, 500).forEach((hh, k) => { const el = h('div', { class: 'sr' }); const sn = X.esc(hh.snip); const re = buildRe(lastQ); el.innerHTML = `<div class="muted" style="font-size:10.5px">Page ${hh.i + 1}</div>` + sn.replace(re, m => `<b>${m}</b>`); el.onclick = () => { cur = k; focusHit(); }; res.append(el); });
    S.pages.forEach(applySearchHits);
  };
  let t = null; inp.oninput = () => { clearTimeout(t); t = setTimeout(run, 250); };
  inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); stepHit(e.shiftKey ? -1 : 1); } };
  if (lastQ) run();
  if (focus) setTimeout(() => { inp.focus(); inp.select(); }, 20);
}
export function applySearchHits(pg) {
  if (!pg?._el) return; pg._el.querySelectorAll('.shl').forEach(e => e.remove());
  const pi = S_().pages.indexOf(pg); if (!lastQ) return;
  hits.forEach((hh, k) => {
    if (hh.i !== pi || (!SO.all && k !== cur)) return;
    for (const p of hh.parts) { const r = itemRect(pg, (S_().textCache[pg.src + ':' + pg.index] || { items: [] }).items[p.k] || { str: '', transform: [1, 0, 0, 1, 0, 0] }, p.a, p.b); if (!r) continue; pg._el.append(h('div', { class: 'shl' + (k === cur ? ' cur' : ''), style: { left: r.l + 'px', top: r.t + 'px', width: r.w + 'px', height: r.h + 'px' } })); }
  });
}
function stepHit(d) { if (!hits.length) return; cur = (cur + d + hits.length) % hits.length; focusHit(); }
function focusHit() {
  const hh = hits[cur]; if (!hh) return; const pg = S_().pages[hh.i]; const bx = hh.parts[0]?.box;
  X.scrollToPage(hh.i, bx ? bx.y + bx.h + 40 : null);
  S_().pages.forEach(applySearchHits);
  document.querySelectorAll('#lpBody .sr').forEach((el, k) => el.classList.toggle('on', k === cur));
}
export function redactRects(list, label = 'Redact') {
  const S = S_(); const touched = new Set(); let n = 0;
  for (const hh of list) { const pg = S.pages[hh.i]; for (const p of hh.parts) { const b = p.box; pg.annots.push({ id: X.nid(), type: 'redact', x: b.x - 1, y: b.y - 0.5, w: b.w + 2, h: b.h + 1, author: S.author, date: new Date().toISOString(), text: hh.text }); n++; } touched.add(pg); }
  touched.forEach(pg => X.drawAnnots(pg)); if (n) X.commit(label);
  return n;
}
async function redactHits() {
  if (!hits.length) return UI.toast('Search for something first');
  if (!(await UI.confirm('Redact all matches', `Mark all ${hits.length} match(es) of "${lastQ}" for redaction? Text under the black boxes is removed permanently when you save.`, 'Redact'))) return;
  const n = redactRects(hits, 'Redact matches'); UI.toast(`${n} area(s) marked — they become permanent when you save`, 'ok', 5000);
}
export const PATTERNS = {
  email: { label: 'Email addresses', re: '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}' },
  phone: { label: 'Phone numbers', re: '(?<![\\d])(?:(?:\\+91|0091)[\\s-]?)?[6-9]\\d{4}[\\s-]?\\d{5}(?![\\d])|(?<![\\d])0\\d{2,4}[\\s-]\\d{6,8}(?![\\d])|\\+\\d{1,3}[\\s-]?\\(?\\d{2,4}\\)?[\\s-]?\\d{3,4}[\\s-]?\\d{3,4}(?![\\d])' },
  aadhaar: { label: 'Aadhaar-like numbers (12 digits)', re: '(?<![\\d])[2-9]\\d{3}[\\s-]?\\d{4}[\\s-]?\\d{4}(?![\\d])' },
  pan: { label: 'PAN-like codes (ABCDE1234F)', re: '(?<![A-Za-z0-9])[A-Z]{5}[0-9]{4}[A-Z](?![A-Za-z0-9])' },
};
export async function findPatterns(keys, custom) {
  const res = {};
  for (const k of keys) res[k] = await findAll(PATTERNS[k].re, { regex: true, matchCase: true });
  if (custom) { try { new RegExp(custom); res.custom = await findAll(custom, { regex: true, matchCase: true }); } catch { UI.toast('Custom pattern is not a valid regular expression', 'err'); } }
  return res;
}
export async function redactPatternsDialog(auto) {
  const S = S_(); if (!S.pages.length) return;
  const v = auto || await UI.form({ title: 'Redact sensitive information', width: 480, ok: 'Find', fields: [
    ...Object.entries(PATTERNS).map(([k, p]) => ({ key: k, label: p.label, type: 'checkbox', value: true })),
    { key: 'custom', label: 'Custom pattern (regular expression, optional)', value: '' }] });
  if (!v) return;
  const keys = Object.keys(PATTERNS).filter(k => v[k]);
  const res = await findPatterns(keys, v.custom?.trim());
  const total = Object.values(res).reduce((n, l) => n + l.length, 0);
  if (!total) { UI.toast('No matching information found'); return { total: 0, res }; }
  if (!auto) {
    const lines = Object.entries(res).filter(([, l]) => l.length).map(([k, l]) => h('div', { class: 'row' }, h('span', { class: 'grow' }, k === 'custom' ? 'Custom pattern' : PATTERNS[k].label), h('b', {}, String(l.length))));
    const ex = Object.values(res).flat().slice(0, 6).map(m => h('div', { class: 'muted', style: { fontSize: '11.5px' } }, `p.${m.i + 1}: ${m.text}`));
    const ok = await UI.modal({ title: `Found ${total} item(s)`, width: 440, body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, ...lines, h('div', { style: { height: '6px' } }), ...ex, h('div', { class: 'muted', style: { marginTop: '8px' } }, 'They will be covered with black boxes. The text underneath is removed permanently when you save.')), buttons: [{ label: 'Cancel', value: false }, { label: 'Redact all', primary: true, value: true }] });
    if (!ok) return;
  }
  const n = redactRects(Object.values(res).flat(), 'Redact patterns');
  UI.toast(`${n} area(s) marked for redaction — applied when you save`, 'ok', 5000);
  return { total, n, res };
}
