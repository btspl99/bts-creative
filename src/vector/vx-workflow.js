// BTS Vector — workflow: Font browser panel, contextual task bar, autosave & crash recovery, snapping options.
(() => {
const { P, O, DOC } = VX; const { h, toast, modal, form, clamp } = UI;
const sel = () => VX.sel;
const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } } };

// ================================================================ font browser
const FKEY = 'bts.vector.fontFavs', RKEY = 'bts.vector.fontRecent', PKEY = 'bts.vector.fontPreview';
const CATS = [['all', 'All'], ['fav', '★ Favourites'], ['recent', 'Recent'], ['sans', 'Sans serif'], ['serif', 'Serif'], ['mono', 'Monospace'], ['display', 'Display'], ['hand', 'Handwriting']];
VX.fontCategory = name => { const n = String(name).toLowerCase();
  if (/mono|code|consol|courier|menlo|fixed|terminal|typewriter|inconsolata|lucida console|ocr/.test(n)) return 'mono';
  if (/script|hand|brush|marker|comic|cursive|callig|signature|pacifico|caveat|dancing|chalk|kalam|satisfy|print|mistral|vladimir|kristen|bradley|freestyle|gabriola|lobster|ink free|felt|sketch|quill/.test(n)) return 'hand';
  if (/display|black|poster|impact|stencil|headline|bebas|anton|ultra|decor|fat face|shadow|outline|banner|showcard|jokerman|chiller|algerian|broadway|cooper|bauhaus|playbill|ravie|haettenschweiler|abril|bungee|oswald|wide latin|stencil|bangers|righteous/.test(n)) return 'display';
  if (/sans/.test(n)) return 'sans';
  if (/serif|times|georgia|garamond|cambria|book ?antiqua|roman|baskerville|bodoni|palatino|didot|caslon|minion|merriweather|playfair|lora|century|constantia|sylfaen|rockwell|slab|charter|cochin|perpetua|bell mt|footlight|elephant|high tower|centaur|goudy|nimbus rom|tinos|crimson|pt serif|noto serif|dejavu serif|liberation serif|source serif|spectral|cormorant/.test(n)) return 'serif';
  return 'sans'; };
let fb = { q: '', cat: 'all', size: 22, limit: 120 };
const favs = () => ls.get(FKEY, []), recents = () => ls.get(RKEY, []);
VX.f.useFont = f => { VX.f.applyChar ? VX.f.applyChar({ font: f }) : (O.font = f); const r = [f, ...recents().filter(x => x !== f)].slice(0, 16); ls.set(RKEY, r); };
VX.f.toggleFavFont = f => { const s = favs(); ls.set(FKEY, s.includes(f) ? s.filter(x => x !== f) : [...s, f]); };
VX.f.fontBrowserList = (q = fb.q, cat = fb.cat) => { const all = VX.f.fontFamilies(); const F = favs(), R = recents(); let list = cat === 'fav' ? all.filter(f => F.includes(f)).concat(F.filter(f => !all.includes(f))) : cat === 'recent' ? R.slice() : cat === 'all' ? all : all.filter(f => VX.fontCategory(f) === cat); const s = q.trim().toLowerCase(); if (s) list = list.filter(f => f.toLowerCase().includes(s)); return list; };
VX.tabs.fonts = rp => {
  VX.f.loadFonts?.(); const sec = VX.sec; const preview = ls.get(PKEY, 'The quick brown fox jumps over 123');
  const t0 = sel().find(i => i instanceof P.PointText) || sel().find(i => i.data?.live?.kind === 'top'); const curFont = t0 ? (t0.fontFamily || t0.data.live.font) : O.font;
  const q = h('input', { type: 'text', placeholder: `Search ${VX.f.fontFamilies().length} fonts…`, value: fb.q, style: { flex: 1 } });
  const pv = h('input', { type: 'text', value: preview, placeholder: 'Preview text', style: { flex: 1 } });
  const size = h('input', { type: 'range', min: 10, max: 60, value: fb.size, style: { width: '90px' } });
  const chips = h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px', marginTop: '8px' } });
  const list = h('div', { class: 'fontbrowse' }); const count = h('div', { class: 'muted', style: { fontSize: '11px', margin: '6px 0' } });
  const fill = () => {
    chips.innerHTML = ''; CATS.forEach(([k, l]) => chips.append(h('button', { class: 'btn sm' + (fb.cat === k ? ' primary' : ''), onclick: () => { fb.cat = k; fb.limit = 120; fill(); } }, l)));
    const fams = VX.f.fontBrowserList(); list.innerHTML = ''; const F = favs(); count.textContent = `${fams.length} font${fams.length === 1 ? '' : 's'}` + (fb.cat !== 'all' ? ' · ' + CATS.find(c => c[0] === fb.cat)[1] : '') + (fams.length === 0 && fb.cat === 'fav' ? ' — click ☆ on a font to add it' : '');
    fams.slice(0, fb.limit).forEach(f => { const on = f === curFont; list.append(h('div', { class: 'fb-row' + (on ? ' on' : ''), 'data-font': f, onclick: () => { VX.f.useFont(f); VX.renderRight(); } },
      h('div', { class: 'fb-head' }, h('span', { class: 'fb-name' }, f), h('span', { class: 'muted', style: { fontSize: '10.5px' } }, CATS.find(c => c[0] === VX.fontCategory(f))[1]), h('span', { class: 'fb-star' + (F.includes(f) ? ' on' : ''), 'data-tip': 'Favourite', onclick: e => { e.stopPropagation(); VX.f.toggleFavFont(f); fill(); } }, F.includes(f) ? '★' : '☆')),
      h('div', { class: 'fb-prev', style: { fontFamily: `"${f}", sans-serif`, fontSize: fb.size + 'px' } }, pv.value || f))); });
    if (fams.length > fb.limit) list.append(h('button', { class: 'btn sm', style: { margin: '8px' }, onclick: () => { fb.limit += 200; fill(); } }, `Show more (${fams.length - fb.limit})`));
  };
  q.oninput = () => { fb.q = q.value; fb.limit = 120; fill(); }; pv.oninput = () => { ls.set(PKEY, pv.value); list.querySelectorAll('.fb-prev').forEach(d => d.textContent = pv.value || d.parentNode.dataset.font); }; size.oninput = () => { fb.size = +size.value; list.querySelectorAll('.fb-prev').forEach(d => d.style.fontSize = fb.size + 'px'); };
  fill();
  rp.append(sec('Font browser', h('div', { class: 'muted', style: { fontSize: '11.5px', marginBottom: '6px' } }, (t0 ? 'Applies to the selected type · current: ' : 'Sets the font for new type · current: ') + curFont), h('div', { class: 'row', style: { gap: '6px' } }, q), h('div', { class: 'row', style: { gap: '6px', marginTop: '6px' } }, pv, size), chips, count, list));
};

// ================================================================ contextual task bar (floating, near the selection)
const vp = document.getElementById('viewport');
const bar = h('div', { class: 'vx-taskbar' }); vp.append(bar);
let barDown = false; document.getElementById('cv').addEventListener('mousedown', () => { barDown = true; bar.classList.add('hide'); }); window.addEventListener('mouseup', () => { if (barDown) { barDown = false; setTimeout(placeBar, 0); } });
const tbtn = (ic, label, fn, tip) => h('button', { class: 'tb-btn', 'data-tip': tip || label, onclick: e => { e.stopPropagation(); fn(e); } }, ic ? h('span', { class: 'tb-ic', html: VX.icon(ic, 14) }) : '', label);
const menuAt = (e, items) => UI.contextMenu(e, items);
let barKey = '';
function buildBar() {
  const hasText = VX.G.hasText(sel()) || sel().some(i => i.data?.live?.kind === 'top'); const shapes = sel().filter(VX.isShape).length;
  const key = [sel().length, hasText, shapes].join(); if (key === barKey && bar.childNodes.length) return; barKey = key; bar.innerHTML = '';
  bar.append(
    tbtn('recolor', 'Recolor', () => VX.f.recolor(), 'Recolor artwork'),
    tbtn('repeat', 'Repeat ▾', e => menuAt(e, [{ label: 'Radial…', action: () => VX.f.repeat('radial') }, { label: 'Grid…', action: () => VX.f.repeat('grid') }, { label: 'Mirror…', action: () => VX.f.repeat('mirror') }]), 'Repeat (radial / grid / mirror)'),
    tbtn('shapeBuilder', 'Unite', () => { if (shapes < 2) return toast('Select two or more shapes to unite'); VX.pathfinder('unite'); }, 'Pathfinder › Unite'),
    tbtn('alignC', 'Align ▾', e => menuAt(e, [['alignL', 'Left'], ['alignC', 'Horizontal centre'], ['alignR', 'Right'], ['alignT', 'Top'], ['alignM', 'Vertical centre'], ['alignB', 'Bottom']].map(([k, l]) => ({ label: 'Align ' + l, action: () => VX.align(k) })).concat(['-', { label: 'Distribute horizontally', action: () => VX.distribute('h') }, { label: 'Distribute vertically', action: () => VX.distribute('v') }])), 'Align & distribute'),
    tbtn('copy', 'Duplicate', () => VX.duplicate()), tbtn('lock', 'Lock', () => VX.lockSel(), 'Lock selection (Ctrl+2)'),
    hasText ? tbtn('text', 'Outlines', () => VX.f.createOutlines(), 'Type › Create outlines') : '',
    h('button', { class: 'tb-btn tb-x', 'data-tip': 'Hide the task bar (View › Contextual task bar)', onclick: e => { e.stopPropagation(); O.taskbar = false; placeBar(); toast('Task bar hidden — turn it back on in View › Contextual task bar'); } }, '✕'));
}
function placeBar() {
  const show = O.taskbar && sel().length && O.tool !== 'direct' && !VX.tools[O.tool]?.hideSelection && !barDown && !document.querySelector('.modal-back');
  bar.classList.toggle('hide', !show); if (!show) return; buildBar();
  const b = VX.selBounds(); const v = P.view; const bl = v.projectToView(b.bottomCenter), tl = v.projectToView(b.topCenter);
  const W = vp.clientWidth, H = vp.clientHeight; const bw = bar.offsetWidth || 420, bh = bar.offsetHeight || 32;
  let x = bl.x - bw / 2, y = bl.y + 18; if (y + bh > H - 8) y = tl.y - bh - 18; if (y < 24) y = Math.min(H - bh - 8, Math.max(24, bl.y - bh - 18));
  x = clamp(x, 26, Math.max(26, W - bw - 8)); bar.style.left = x + 'px'; bar.style.top = y + 'px';
}
VX.afterGuides.push(placeBar); VX.placeTaskbar = placeBar; VX.taskbarEl = bar;

// ================================================================ autosave & crash recovery (IndexedDB, per window session with heartbeat)
O.autosave = ls.get('bts.vector.autosave', { on: true, sec: 60 });
const SID = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const db = () => new Promise((res, rej) => { const r = indexedDB.open('bts-vector-recovery', 1); r.onupgradeneeded = () => r.result.createObjectStore('docs', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('docs', mode); const st = t.objectStore('docs'); const out = fn(st); t.oncomplete = () => { res(out?.result ?? out); d.close(); }; t.onerror = () => { rej(t.error); d.close(); }; }); };
VX.f.recoveryList = async () => { try { return await tx('readonly', st => st.getAll()); } catch (e) { console.warn(e); return []; } };
let lastSavedHist = -1;
VX.f.autosaveNow = async (force) => {
  if (!force && (!DOC.dirty || VX.hist.length === lastSavedHist)) { await VX.f.heartbeat(); return false; }
  const rec = { id: SID, ts: Date.now(), beat: Date.now(), name: DOC.name, path: DOC.path || null, json: VX.docJSON(), boards: DOC.boards.length };
  await tx('readwrite', st => st.put(rec)); lastSavedHist = VX.hist.length; VX._lastAutosave = rec.ts; return true;
};
VX.f.heartbeat = async () => { try { await tx('readwrite', st => { const g = st.get(SID); g.onsuccess = () => { if (g.result) { g.result.beat = Date.now(); st.put(g.result); } }; return g; }); } catch { } };
VX.f.autosaveClear = async (id = SID) => { try { await tx('readwrite', st => st.delete(id)); lastSavedHist = -1; } catch (e) { console.warn(e); } };
let asTimer = null, beatTimer = null;
const schedule = () => { clearInterval(asTimer); clearInterval(beatTimer); if (O.autosave.on) asTimer = setInterval(() => VX.f.autosaveNow().catch(e => console.warn(e)), Math.max(10, O.autosave.sec) * 1000); beatTimer = setInterval(() => VX.f.heartbeat(), 15000); };
VX.f.autosaveDialog = async () => { const v = await form({ title: 'Autosave & recovery', fields: [{ key: 'on', label: 'Autosave recovery data while you work', type: 'checkbox', value: O.autosave.on }, { key: 'sec', label: 'Every (seconds)', type: 'number', value: O.autosave.sec, min: 10, max: 3600 }] }); if (!v) return null; O.autosave = { on: v.on, sec: clamp(+v.sec || 60, 10, 3600) }; ls.set('bts.vector.autosave', O.autosave); schedule(); toast(O.autosave.on ? `Autosaving recovery data every ${O.autosave.sec} s` : 'Autosave off'); return O.autosave; };
const fmtAgo = ts => { const s = Math.round((Date.now() - ts) / 1000); return s < 60 ? s + ' s ago' : s < 3600 ? Math.round(s / 60) + ' min ago' : new Date(ts).toLocaleString(); };
VX.f.recoverRecord = async rec => { await VX.openFile({ name: (rec.name || 'Recovered').replace(/\.\w+$/, '') + '.btsv', data: new TextEncoder().encode(rec.json) }); DOC.path = rec.path; DOC.name = (rec.name || 'Recovered').replace(/\.\w+$/, '') + ' (recovered).btsv'; DOC.dirty = true; UI.setDocTitle(DOC.name + ' •', 'BTS Vector'); await VX.f.autosaveClear(rec.id); await VX.f.autosaveNow(true); toast('Recovered “' + (rec.name || 'document') + '” — save it to keep it', 'ok', 5000); return true; };
VX.f.recoverDialog = async (onlyCrashed = false) => {
  const all = (await VX.f.recoveryList()).filter(r => r.id !== SID && (!onlyCrashed || Date.now() - (r.beat || r.ts) > 45000)).sort((a, b) => b.ts - a.ts);
  if (!all.length) { if (!onlyCrashed) toast('No autosaved documents to recover'); return null; }
  let pick = null; const list = h('div', { class: 'layers-list', style: { maxHeight: '260px', overflow: 'auto' } });
  const draw = () => { list.innerHTML = ''; all.forEach(r => list.append(h('div', { class: 'li' + (pick === r ? ' sel' : ''), onclick: () => { pick = r; draw(); } }, h('span', { class: 't' }, r.name || 'Untitled'), h('span', { class: 'muted' }, `${r.boards || 1} artboard(s) · ${fmtAgo(r.ts)}`), h('span', { class: 'ib', 'data-tip': 'Delete this recovery file', html: UI.icon('trash'), onclick: async e => { e.stopPropagation(); await VX.f.autosaveClear(r.id); all.splice(all.indexOf(r), 1); if (pick === r) pick = null; draw(); } })))); };
  pick = all[0]; draw();
  const res = await modal({ title: onlyCrashed ? 'Recover unsaved work?' : 'Recover autosaved document', width: 480, body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, h('div', { class: 'muted' }, onlyCrashed ? 'BTS Vector closed unexpectedly. These documents have autosaved recovery data:' : 'Autosaved recovery data from other or earlier sessions:'), list), buttons: [{ label: onlyCrashed ? 'Not now' : 'Cancel', value: null }, { label: 'Discard all', value: 'discard' }, { label: 'Recover', primary: true, value: 'ok' }] });
  if (res === 'discard') { for (const r of all) await VX.f.autosaveClear(r.id); toast('Recovery data discarded'); return 'discarded'; }
  if (res !== 'ok' || !pick) return null; return VX.f.recoverRecord(pick);
};
setTimeout(() => { schedule(); VX.f.recoverDialog(true).catch(e => console.warn(e)); }, 1500);
window.addEventListener('beforeunload', () => { if (!DOC.dirty) VX.f.autosaveClear(); });

// ================================================================ snapping options
VX.f.snapOptions = async () => {
  const keys = [['snapPoint', 'Snap to anchor points & centres'], ['snap', 'Snap to grid'], ['snapPixel', 'Snap to pixel'], ['snapGuides', 'Snap to guides'], ['smart', 'Smart guides (align to edges & centres)'], ['snapTangent', 'Tangent snapping — line / pen end touches curves tangentially'], ['snapPerp', 'Perpendicular snapping — line / pen end meets curves at 90°'], ['snapColor', 'Colour snapping — new fills use the nearest swatch']];
  const v = await form({ title: 'Snapping options', width: 460, fields: [...keys.map(([k, l]) => ({ key: k, label: l, type: 'checkbox', value: !!O[k] })), { key: 'snapTol', label: 'Snap distance (screen px)', type: 'range', value: O.snapTol || 6, min: 2, max: 24 }, { key: 'gridSize', label: 'Grid size (px)', type: 'number', value: O.gridSize }] });
  if (!v) return null; keys.forEach(([k]) => O[k] = !!v[k]); O.snapTol = clamp(+v.snapTol, 2, 24); O.gridSize = Math.max(2, +v.gridSize || 20); VX.drawArtboard(); toast('Snapping options updated'); return v;
};
})();
