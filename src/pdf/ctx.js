// Shared context between BTS PDF Pro modules. app.js fills this in at start-up;
// feature modules (ocr.js, reading.js, docops.js, review.js, annots.js) read from it
// lazily (inside functions), so import order does not matter.
export const X = {};

// Small helpers shared by several modules
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const today = (fmt = 'dd/mm/yyyy', d = new Date()) => {
  const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0'), yyyy = String(d.getFullYear());
  const mon = d.toLocaleString('en', { month: 'short' });
  return fmt.replace('dd', dd).replace('mm', mm).replace('yyyy', yyyy).replace('Mon', mon);
};
export function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return res();
    const s = document.createElement('script'); s.src = src; s.dataset.src = src;
    s.onload = () => res(); s.onerror = () => rej(new Error('Could not load ' + src)); document.head.append(s);
  });
}
// absolute filesystem path of a file shipped next to this module (works in dev and inside app.asar)
export function localPath(rel) {
  const u = new URL(rel, import.meta.url);
  let p = decodeURIComponent(u.pathname);
  if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1); // Windows drive letter
  return p;
}
export const localUrl = rel => new URL(rel, import.meta.url).href;
export async function copyText(txt) {
  try { await navigator.clipboard.writeText(txt); return true; } catch { }
  const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.append(ta); ta.select();
  const ok = document.execCommand('copy'); ta.remove(); return ok;
}
// progress modal with cancel; returns { set(text, frac), close(), cancelled }
export function progress(title) {
  const { h } = UI;
  const bar = h('div', { class: 'pp-bar' }, h('div', { class: 'pp-fill' }));
  const txt = h('div', { class: 'muted', style: { marginBottom: '8px', minHeight: '18px' } }, 'Starting…');
  const st = { cancelled: false };
  const back = h('div', { class: 'modal-back' });
  const m = h('div', { class: 'modal', style: { width: '440px' } }, h('div', { class: 'm-h' }, title), h('div', { class: 'm-b' }, txt, bar),
    h('div', { class: 'm-f' }, h('button', { class: 'btn', onclick: () => { st.cancelled = true; txt.textContent = 'Cancelling…'; } }, 'Cancel')));
  back.append(m); document.body.append(back);
  st.set = (t, f) => { if (t != null) txt.textContent = t; if (f != null) bar.firstChild.style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + '%'; };
  st.close = () => back.remove();
  return st;
}
// fraction of a text item's width covered by its first i characters (proportional-font estimate)
let _mctx = null;
export function textFrac(str, i) {
  if (!str || i <= 0) return 0; if (i >= str.length) return 1;
  if (!_mctx) { _mctx = document.createElement('canvas').getContext('2d'); _mctx.font = '100px Helvetica, Arial, sans-serif'; }
  const all = _mctx.measureText(str).width; if (!all) return i / str.length;
  return _mctx.measureText(str.slice(0, i)).width / all;
}
