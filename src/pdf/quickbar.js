// Quick action bar: a small floating toolbar shown when text is selected on a page
// (Highlight, Underline, Strikethrough, Copy, Read aloud, Redact, Add note). View › Quick action bar toggles it.
import { X, copyText } from './ctx.js';
import * as RD from './reading.js';

const { h } = UI;
const KEY = 'bts.pdf.qab';
export const enabled = () => localStorage.getItem(KEY) !== '0';
export function toggle(on = !enabled()) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { } if (!on) hide(); UI.toast(on ? 'Quick action bar on — select text to see it' : 'Quick action bar off'); }
let bar = null, saved = null;
const P = {
  hl: 'M4 20h16M7 16l9-9 3 3-9 9H7z', ul: 'M7 4v7a5 5 0 0 0 10 0V4M5 20h14', st: 'M5 12h14M16 6.5C15 5 13.6 4.5 12 4.5c-2.5 0-4 1.3-4 3.2 0 4.3 8 3 8 7.5 0 2-1.8 3.3-4.3 3.3-2 0-3.5-.8-4.2-2.2',
  cp: 'M9 9h10v11H9zM5 15V4h10', sp: 'M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14', rd: 'M3 7h18v10H3zM7 11h6', nt: 'M4 4h16v12H9l-5 4z',
};
const ic = k => `<svg viewBox="0 0 24 24"><path d="${P[k]}"/></svg>`;
export const ACTIONS = [['highlight', 'hl', 'Highlight'], ['underline', 'ul', 'Underline'], ['strike', 'st', 'Strikethrough'], ['copy', 'cp', 'Copy'], ['read', 'sp', 'Read aloud'], ['redact', 'rd', 'Redact'], ['note', 'nt', 'Add note']];
export function hide() { bar?.remove(); bar = null; }
export function maybeShow() {
  if (!enabled() || X.S.tool !== 'select' || X.S.pending) return hide();
  const sel = getSelection(); if (!sel || sel.isCollapsed || !sel.rangeCount) return hide();
  const anc = sel.anchorNode?.parentElement; if (!anc?.closest('.textLayer') || !sel.toString().trim()) return hide();
  const rects = [...sel.getRangeAt(sel.rangeCount - 1).getClientRects()].filter(r => r.width > 0.5); if (!rects.length) return hide();
  const last = rects[rects.length - 1], first = rects[0];
  saved = { text: sel.toString(), rects: X.selectionRects() };
  hide();
  bar = h('div', { class: 'qab', onmousedown: e => e.preventDefault() }, ...ACTIONS.map(([id, k, tip]) => h('button', { class: 'icon-btn', 'data-tip': tip, 'data-qa': id, html: ic(k), onclick: () => run(id) })));
  document.body.append(bar);
  const bw = bar.offsetWidth, bh = bar.offsetHeight; let x = Math.min(innerWidth - bw - 8, Math.max(8, last.right - bw / 2)), y = last.bottom + 8;
  if (y + bh > innerHeight - 30) y = first.top - bh - 8;
  bar.style.left = x + 'px'; bar.style.top = Math.max(40, y) + 'px';
}
export async function run(id, sel = saved) {
  if (!sel) return; const S = X.S; hide();
  const map = sel.rects; let n = 0;
  if (['highlight', 'underline', 'strike'].includes(id)) {
    for (const [pg, rects] of map) { pg.annots.push({ id: X.nid(), type: 'hl', kind: id, rects: X.mergeRects(rects), color: id === 'highlight' ? S.style.hl : id === 'strike' ? '#e5484d' : '#1d6fe0', opacity: 1, author: S.author, date: new Date().toISOString() }); X.drawAnnots(pg); n++; }
    if (n) X.commit(id[0].toUpperCase() + id.slice(1));
  } else if (id === 'copy') { await copyText(sel.text); UI.toast('Copied', 'ok'); }
  else if (id === 'read') { RD.readAloud('selection', sel.text); }
  else if (id === 'redact') {
    for (const [pg, rects] of map) { for (const r of X.mergeRects(rects)) { pg.annots.push({ id: X.nid(), type: 'redact', x: r.x - 0.5, y: r.y - 0.5, w: r.w + 1, h: r.h + 1, author: S.author, date: new Date().toISOString(), text: sel.text.slice(0, 200) }); n++; } X.drawAnnots(pg); }
    if (n) { X.commit('Redact selection'); UI.toast('Marked for redaction — the text is removed permanently when you save', 'ok', 4500); }
  } else if (id === 'note') {
    const [pg, rects] = [...map][0] || []; if (!pg) return;
    pg.annots.push({ id: X.nid(), type: 'hl', kind: 'highlight', rects: X.mergeRects(rects), color: '#ffd400', opacity: 1, author: S.author, date: new Date().toISOString() });
    const top = rects.reduce((a, r) => r.y + r.h > a.y + a.h ? r : a, rects[0]); const right = Math.max(...rects.map(r => r.x + r.w));
    const a = { id: X.nid(), type: 'note', x: Math.min(right + 4, (pg.w || 595) - 20), y: top.y + top.h - 18, color: '#ffd400', text: '', quote: sel.text.slice(0, 300), author: S.author, date: new Date().toISOString() };
    pg.annots.push(a); X.drawAnnots(pg); X.commit('Add note'); X.setTool('select'); X.select(pg.id, a.id); setTimeout(() => document.querySelector('#props textarea')?.focus(), 40);
  }
  getSelection().removeAllRanges();
  return n;
}
document.addEventListener('mouseup', e => { if (e.target.closest?.('.qab')) return; setTimeout(maybeShow, 10); });
document.addEventListener('mousedown', e => { if (bar && !e.target.closest('.qab')) hide(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
document.getElementById('stage')?.addEventListener('scroll', hide, { passive: true });
