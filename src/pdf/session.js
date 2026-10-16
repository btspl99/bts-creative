// Multi-document session for BTS PDF Pro: document tabs in one window, recent documents,
// open in a new window, and autosave / crash recovery of unsaved work (IndexedDB, local only).
import { X } from './ctx.js';
import * as OCR from './ocr.js';

const { h } = UI;
// every per-document field of the app state; swapped in and out when switching tabs
const DOC_KEYS = ['sources', 'pages', 'formFields', 'formValues', 'filePath', 'fileName', 'dirty', 'textCache', 'outline', 'pageLabels', 'lang', 'meta', 'stripMeta', 'tabOrder', 'protect', 'wasEncrypted', 'flattenForms', 'a11y', 'zoom', 'zoomMode', 'organizer'];
export const T = { tabs: [], cur: -1 };
const uid = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const WIN = 'w' + Math.random().toString(36).slice(2, 10);

function capture() {
  const S = X.S; const st = {}; DOC_KEYS.forEach(k => st[k] = S[k]);
  st.hist = { stack: X.hist.stack, idx: X.hist.idx }; st.ocr = OCR.getResults(); st.pageIdx = X.currentPageIdx(); st.scroll = document.getElementById('stage').scrollTop;
  return st;
}
function blankState() { return { sources: [], pages: [], formFields: [], formValues: {}, filePath: null, fileName: null, dirty: false, textCache: {}, outline: undefined, pageLabels: undefined, lang: undefined, meta: null, stripMeta: false, tabOrder: {}, protect: null, wasEncrypted: false, flattenForms: false, a11y: null, zoom: X.S.zoom, zoomMode: X.S.zoomMode || 'fit-width', organizer: false, hist: { stack: [], idx: -1 }, ocr: {} }; }
function applyState(st) {
  const S = X.S; DOC_KEYS.forEach(k => S[k] = st[k]); S.sel = null; S.ogSel?.clear?.();
  X.hist.stack = st.hist.stack; X.hist.idx = st.hist.idx; X.hist.emit(); OCR.setResults(st.ocr || {});
}
const curTab = () => T.tabs[T.cur];
// called by openDoc before it replaces the current document; returns the tab the new document goes into
export function beforeOpen({ replace } = {}) {
  if (!T.tabs.length) { T.tabs.push({ id: uid(), state: null }); T.cur = 0; return; }
  if (replace || !X.S.pages.length) return; // reuse the current (empty) tab
  curTab().state = capture(); T.tabs.splice(T.cur + 1, 0, { id: uid(), state: null }); T.cur++;
}
export function afterOpen() { render(); }
export async function switchTo(i) {
  if (i === T.cur || !T.tabs[i]) return;
  curTab().state = capture(); T.cur = i; const st = T.tabs[i].state; T.tabs[i].state = null;
  await show(st);
}
async function show(st) {
  applyState(st); X.closeAssistant?.(); X.onDocChanged?.();
  document.getElementById('organizer').classList.toggle('hidden', !X.S.organizer); document.getElementById('pages').classList.toggle('hidden', !!X.S.organizer);
  document.querySelector('.welcome')?.remove();
  await X.buildPages();
  if (!X.S.pages.length) X.welcome?.();
  if (X.S.pages.length) { X.setZoom(st.zoomMode || st.zoom || 'fit-width'); X.relayout(); }
  X.showLeft(X.S.leftTab); X.renderOptions(); X.renderProps();
  UI.setDocTitle(X.S.pages.length ? (X.S.fileName || 'Untitled.pdf') + (X.S.dirty ? ' •' : '') : '', 'BTS PDF Pro');
  if (st.scroll != null) setTimeout(() => { document.getElementById('stage').scrollTop = st.scroll; }, 60);
  render();
}
export async function closeTab(i = T.cur) {
  const t = T.tabs[i]; if (!t) return;
  if (i !== T.cur) await switchTo(i);
  if (X.S.dirty) {
    const r = await UI.modal({ title: 'Save changes?', body: `Save changes to ${X.S.fileName || 'this document'} before closing it?`, buttons: [{ label: 'Cancel', value: null }, { label: "Don't save", value: 'no' }, { label: 'Save', primary: true, value: 'yes' }] });
    if (r === null) return false; if (r === 'yes') { await X.save(); if (X.S.dirty) return false; }
  }
  await dropRecord(t.id);
  T.tabs.splice(T.cur, 1);
  if (!T.tabs.length) { T.cur = -1; T.tabs = []; await show(blankState()); T.tabs = []; T.cur = -1; render(); return true; }
  T.cur = Math.min(T.cur, T.tabs.length - 1); const st = T.tabs[T.cur].state; T.tabs[T.cur].state = null; await show(st);
  return true;
}
export const dirtyTabs = () => T.tabs.filter((t, i) => i === T.cur ? X.S.dirty : t.state?.dirty);
export async function confirmCloseAll() {
  for (let i = T.tabs.length - 1; i >= 0; i--) { if (!(i === T.cur ? X.S.dirty : T.tabs[i].state?.dirty)) continue; if (!(await closeTab(i))) return false; }
  return true;
}
export const tabId = () => curTab()?.id;
export function render() {
  const bar = document.getElementById('docTabs'); if (!bar) return; bar.innerHTML = '';
  const any = T.tabs.length && (T.tabs.length > 1 || X.S.pages.length);
  bar.classList.toggle('hidden', !any); document.getElementById('ws').classList.toggle('has-tabs', !!any);
  if (!any) return;
  T.tabs.forEach((t, i) => {
    const name = i === T.cur ? (X.S.fileName || 'Untitled.pdf') : (t.state?.fileName || 'Untitled.pdf'); const dirty = i === T.cur ? X.S.dirty : t.state?.dirty;
    const el = h('div', { class: 'dtab' + (i === T.cur ? ' on' : '') + (dirty ? ' dirty' : ''), title: (i === T.cur ? X.S.filePath : t.state?.filePath) || name, onclick: () => switchTo(i), onauxclick: e => { if (e.button === 1) closeTab(i); } },
      h('span', { class: 'dt-n' }, name), h('span', { class: 'dt-x', title: 'Close (Ctrl+F4)', onclick: e => { e.stopPropagation(); closeTab(i); } }, dirty ? '●' : '✕'));
    el.oncontextmenu = e => UI.contextMenu(e, [{ label: 'Close tab', action: () => closeTab(i) }, { label: 'Close other tabs', action: async () => { for (let k = T.tabs.length - 1; k >= 0; k--) if (T.tabs[k] !== t) { if (!(await closeTab(k))) return; } } }, '-', { label: 'Move to new window', action: async () => { await switchTo(i); moveToWindow(); } }]);
    bar.append(el);
  });
  bar.append(h('button', { class: 'icon-btn dt-add', 'data-tip': 'Open another PDF in a new tab (Ctrl+O)', html: UI.icon('plus'), onclick: () => X.openDialog() }));
}
export function nextTab(d = 1) { if (T.tabs.length > 1) switchTo((T.cur + d + T.tabs.length) % T.tabs.length); }

// ---------- recent documents & windows
let recent = [];
export async function refreshRecent() { try { recent = ((await bts.recent.get()) || []).filter(r => /\.pdf$/i.test(r.path)).slice(0, 12); } catch { recent = []; } return recent; }
export function recentItems() {
  if (!recent.length) return [{ label: 'No recent PDFs', disabled: true }];
  return recent.map(r => ({ label: r.name, action: () => openPath(r.path) })).concat(['-', { label: 'Open recent in new window…', sub: recent.slice(0, 8).map(r => ({ label: r.name, action: () => bts.openApp('pdf', r.path) })) }]);
}
export async function openPath(p) {
  const open = T.tabs.findIndex((t, i) => (i === T.cur ? X.S.filePath : t.state?.filePath) === p);
  if (open >= 0) return switchTo(open);
  try { const f = await X.IO.read(p); await X.openFiles([{ ...f, data: new Uint8Array(f.data) }]); } catch (e) { UI.toast('Could not open ' + p + ': ' + e.message, 'err'); }
}
export async function openInNewWindow() {
  const fs = await X.IO.open({ multi: true, filters: [{ name: 'PDF', extensions: ['pdf'] }] }); if (!fs) return;
  for (const f of fs) if (f.path) await bts.openApp('pdf', f.path);
  return fs.length;
}
export async function moveToWindow() {
  if (!X.S.pages.length) return;
  if (X.S.dirty || !X.S.filePath) { if (!(await UI.confirm('Move to new window', 'The document must be saved first. Save it now?', 'Save'))) return; await X.save(!X.S.filePath); if (X.S.dirty || !X.S.filePath) return; }
  const p = X.S.filePath; await bts.openApp('pdf', p); await closeTab(); return p;
}

// ---------- autosave & recovery (IndexedDB: survives crashes and power cuts, never leaves the computer)
const DB = 'bts-pdf-recovery'; let dbP = null;
function db() { if (!dbP) dbP = new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('docs', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); return dbP; }
const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('docs', mode); const st = t.objectStore('docs'); let out; Promise.resolve(fn(st)).then(v => out = v); t.oncomplete = () => res(out); t.onerror = () => rej(t.error); }); };
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
export const records = () => tx('readonly', st => req(st.getAll()));
export const dropRecord = id => id ? tx('readwrite', st => req(st.delete(id))).catch(() => { }) : null;
const AKEY = 'bts.pdf.autosave';
export const autosaveMinutes = () => { const v = localStorage.getItem(AKEY); return v == null ? 1 : +v; };
export function setAutosave(m) { try { localStorage.setItem(AKEY, String(m)); } catch { } UI.toast(m ? `Unsaved work is backed up every ${m === 1 ? 'minute' : m + ' minutes'}` : 'Autosave turned off'); }
let lastAuto = 0, lastSnap = '';
export async function autosaveNow(force) {
  const S = X.S; const t = curTab(); if (!t || !S.pages.length) return false;
  if (!S.dirty) { await dropRecord(t.id); return false; }
  const snap = X.snapshot(); if (!force && snap === lastSnap) return false;
  const rec = { id: t.id, win: WIN, at: Date.now(), fileName: S.fileName || 'Untitled.pdf', filePath: S.filePath || null, snap, pages: S.pages.length,
    sources: S.sources.map(s => ({ name: s.name, bytes: s.bytes })), meta: S.meta || null, lang: S.lang || null };
  try { await tx('readwrite', st => req(st.put(rec))); lastSnap = snap; lastAuto = Date.now(); return true; } catch (e) { console.warn('autosave failed', e); return false; }
}
function heartbeat() { try { localStorage.setItem('bts.pdf.hb.' + WIN, String(Date.now())); } catch { } }
const alive = w => { const v = +localStorage.getItem('bts.pdf.hb.' + w) || 0; return Date.now() - v < 30000; };
export async function checkRecovery({ includeLive = false, auto } = {}) {
  let list = []; try { list = await records(); } catch { return []; }
  list = list.filter(r => r.win !== WIN || includeLive).filter(r => includeLive || !alive(r.win)).sort((a, b) => b.at - a.at);
  if (!list.length) { if (auto == null && includeLive) UI.toast('There is no unsaved work to recover'); return []; }
  let chosen = list;
  if (!auto) {
    const sel = list.map(() => true);
    const body = h('div', { class: 'rec-list' }, h('div', { class: 'muted', style: { marginBottom: '8px' } }, 'BTS PDF Pro closed before these documents were saved. Recover the unsaved changes?'),
      ...list.map((r, i) => { const cb = h('input', { type: 'checkbox', checked: true }); cb.onchange = () => sel[i] = cb.checked; return h('label', { class: 'row rec-row' }, cb, h('b', {}, r.fileName), h('span', { class: 'muted' }, `${r.pages} page(s) · ${new Date(r.at).toLocaleString()}`)); }));
    const res = await UI.modal({ title: 'Recover unsaved work', width: 520, body, buttons: [{ label: 'Not now', value: null }, { label: 'Discard', value: 'discard' }, { label: 'Recover', primary: true, value: 'ok' }] });
    if (!res) return [];
    if (res === 'discard') { for (const r of list) await dropRecord(r.id); UI.toast('Recovery data discarded'); return []; }
    chosen = list.filter((_, i) => sel[i]);
  }
  const done = [];
  for (const r of chosen) { try { await recover(r); done.push(r.fileName); } catch (e) { console.error(e); UI.toast('Could not recover ' + r.fileName + ': ' + e.message, 'err', 6000); } }
  if (done.length) UI.toast(`Recovered ${done.join(', ')} — save to keep the changes`, 'ok', 6000);
  return done;
}
async function recover(r) {
  const srcs = r.sources || []; if (!srcs.length) throw new Error('no document data');
  await X.openDoc(new Uint8Array(srcs[0].bytes), r.fileName, r.filePath, { force: true });
  for (const s of srcs.slice(1)) { const js = await X.pdfjsLib.getDocument({ data: new Uint8Array(s.bytes).slice(), isEvalSupported: false }).promise; X.S.sources.push({ bytes: new Uint8Array(s.bytes), js, name: s.name }); }
  if (r.meta) X.S.meta = r.meta; if (r.lang) X.S.lang = r.lang;
  await X.restore(r.snap); X.hist.reset(X.snapshot(), 'Recovered'); X.markDirty();
  await dropRecord(r.id); await autosaveNow(true);
}
export function startAutosave() {
  heartbeat(); setInterval(heartbeat, 10000);
  setInterval(() => { const m = autosaveMinutes(); if (m && X.S.dirty && Date.now() - lastAuto > m * 60000) autosaveNow(); }, 15000);
  window.addEventListener('beforeunload', () => { try { localStorage.removeItem('bts.pdf.hb.' + WIN); } catch { } });
  setTimeout(() => checkRecovery().catch(() => { }), 2500);
}
export const _win = WIN;
