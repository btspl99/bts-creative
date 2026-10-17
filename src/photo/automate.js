// BTS Photo — Actions (record / replay), Batch and Image Processor.
// Steps are recorded by hooks in app.js (REC(op, params)) and replayed through app.js OPS (runStep).
(() => {
const P = () => window.__photo;
const { h, toast, modal, form, confirm, clamp } = UI;
const KEY = 'bts.photo.actions.v1';
const uid = () => Math.random().toString(36).slice(2, 10);
const clone = o => JSON.parse(JSON.stringify(o));

// =====================================================================  built-in actions
const step = (op, params = {}, extra = {}) => ({ id: uid(), op, params, on: true, dialog: false, ...extra });
function defaultSet() {
  return { id: 'default', name: 'Default actions', builtin: true, actions: [
    { id: uid(), name: 'Web 1080px JPEG', steps: [step('fit', { w: 1080, h: 1080, enlarge: false }), step('export', { fmt: 'jpeg', q: 82, scale: 1, matte: '#ffffff' })] },
    { id: uid(), name: 'Instagram 1080×1350 crop', steps: [step('crop', { ratio: '0.8', r: 0.8, scale: 1, cx: 0.5, cy: 0.5 }), step('imageSize', { w: 1080, h: 1350, q: 'sharper', lock: false })] },
    { id: uid(), name: 'Black & white', steps: [step('adjust', { id: 'bw', vals: {} }), step('adjust', { id: 'bc', vals: { b: 0, c: 12 } })] },
    { id: uid(), name: 'Vintage', steps: [step('look', { id: 'vintage', amt: 85 }), step('flatten'), step('filter', { id: 'noise', vals: { a: 10, mono: true, film: true, size: 1.2, dist: 'gauss', seed: 7 } }), step('filter', { id: 'vignette', vals: { a: 45, s: 45, f: 60, round: 0, c: '#1a1208' } })] },
    { id: uid(), name: 'Auto enhance', steps: [step('auto', { id: 'autotone' }), step('auto', { id: 'autocolor' }), step('adjust', { id: 'vibrance', vals: { v: 22, s: 0 } }), step('adjust', { id: 'clarity', vals: { a: 18 } }), step('filter', { id: 'unsharp', vals: { amt: 60, r: 1, t: 2 } })] },
    { id: uid(), name: 'Remove background PNG', steps: [step('removeBg', { mode: 'ai' }), step('export', { fmt: 'png', q: 100, scale: 1, matte: 'none' })] },
    { id: uid(), name: 'Passport photo 35×45 mm @300dpi', steps: [step('crop', { ratio: 'custom', r: 35 / 45, scale: 1, cx: 0.5, cy: 0.45 }), step('imageSize', { w: 413, h: 531, q: 'sharper', lock: false }), step('export', { fmt: 'jpeg', q: 95, scale: 1, matte: '#ffffff' })] },
    { id: uid(), name: 'Watermark (text bottom-right)', steps: [step('text', { str: '© Your name', pos: 'br', sizeRel: 0.045, margin: 0.03, font: 'Segoe UI', bold: true, color: '#ffffff', opacity: 0.75, align: 'left' }, { dialog: true })] },
  ] };
}
// =====================================================================  storage
let store = null;
function load() { if (store) return store; try { store = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { store = null; } if (!store || !Array.isArray(store.sets)) store = { sets: [defaultSet()] }; return store; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { toast('Could not save the actions: ' + e.message, 'err'); } }
const sets = () => load().sets;
let sel = { set: null, action: null, step: null }; // ids
const findSet = id => sets().find(s => s.id === id), findAction = id => { for (const s of sets()) { const a = s.actions.find(x => x.id === id); if (a) return { set: s, action: a }; } return null; };
const curAction = () => findAction(sel.action)?.action || null;
function ensureSel() { if (!findSet(sel.set)) sel.set = sets()[0]?.id || null; if (!findAction(sel.action)) { sel.action = findSet(sel.set)?.actions[0]?.id || null; sel.step = null; } }
const expanded = new Set();

// =====================================================================  recording & playback
let recording = null; // action id
let playing = 0, cancelPlay = false;
function record(op, params) {
  if (!recording || playing) return; const f = findAction(recording); if (!f) { recording = null; return; }
  const st = step(op, params); f.action.steps.push(st); sel.step = st.id; save(); refresh();
}
function startRecording() {
  ensureSel(); let a = curAction(); if (!a) return newAction(true);
  recording = a.id; expanded.add(a.id); toast('Recording “' + a.name + '” — use the app as usual, then press Stop', 'ok', 4200); refresh();
}
function stopRecording() { if (!recording) return; const a = findAction(recording)?.action; recording = null; save(); refresh(); if (a) toast('Stopped recording — ' + a.steps.length + ' steps', 'ok'); }
// play the steps of an action on the current document (or from the selected step)
async function play(action = curAction(), { fromStep = null, batch = false, suppressDialogs = false } = {}) {
  if (!action) return toast('Select an action first', 'err');
  if (!P().D) { toast('Open an image first', 'err'); return false; }
  if (recording && !batch) stopRecording();
  let steps = action.steps.filter(s => s.on); if (fromStep) { const i = action.steps.findIndex(s => s.id === fromStep); if (i > 0) steps = action.steps.slice(i).filter(s => s.on); }
  playing++; cancelPlay = false;
  try {
    for (const st of steps) {
      if (cancelPlay) break; if (!batch) { sel.step = st.id; refresh(); }
      try { await P().runStep(st, { dialog: st.dialog && !suppressDialogs, batch }); }
      catch (e) { if (batch) throw new Error((P().OPS[st.op]?.name || st.op) + ': ' + e.message); console.warn(e); toast((P().OPS[st.op]?.name || st.op) + ': ' + e.message, 'err', 6000); return false; }
    }
  } finally { playing--; if (!batch) refresh(); }
  if (!batch) toast('Played “' + action.name + '”', 'ok');
  return true;
}

// =====================================================================  set / action management
async function newAction(thenRecord = true) {
  ensureSel(); if (!findSet(sel.set)) newSetSilently('Set 1');
  const name = await UI.prompt('New action', 'Name', 'Action ' + (findSet(sel.set).actions.length + 1)); if (!name) return;
  const a = { id: uid(), name, steps: [] }; findSet(sel.set).actions.push(a); sel.action = a.id; sel.step = null; expanded.add(a.id); save();
  if (thenRecord) { recording = a.id; toast('Recording “' + a.name + '” — use the app as usual, then press Stop', 'ok', 4200); }
  refresh(); return a;
}
function newSetSilently(name) { const s = { id: uid(), name, actions: [] }; sets().push(s); sel.set = s.id; save(); return s; }
async function newSet() { const name = await UI.prompt('New set', 'Name', 'Set ' + sets().length); if (!name) return; newSetSilently(name); sel.action = null; refresh(); }
async function renameSel() {
  ensureSel(); const st = selStep(); const a = curAction(), s = findSet(sel.set);
  if (st) { const v = await UI.prompt('Rename step', 'Name', st.name || P().OPS[st.op]?.name || st.op); if (v) { st.name = v; save(); refresh(); } return; }
  if (a) { const v = await UI.prompt('Rename action', 'Name', a.name); if (v) { a.name = v; save(); refresh(); } return; }
  if (s) { const v = await UI.prompt('Rename set', 'Name', s.name); if (v) { s.name = v; save(); refresh(); } }
}
const selStep = () => curAction()?.steps.find(s => s.id === sel.step) || null;
async function deleteSel() {
  ensureSel(); const a = curAction(), st = selStep(), s = findSet(sel.set);
  if (st) { a.steps = a.steps.filter(x => x !== st); sel.step = null; save(); refresh(); return; }
  if (a) { if (!(await confirm('Delete action', 'Delete the action “' + a.name + '”?', 'Delete'))) return; const f = findAction(a.id); f.set.actions = f.set.actions.filter(x => x !== a); if (recording === a.id) recording = null; sel.action = null; save(); refresh(); return; }
  if (s) { if (!(await confirm('Delete set', 'Delete the set “' + s.name + '” and all its actions?', 'Delete'))) return; store.sets = sets().filter(x => x !== s); if (!store.sets.length) store.sets = [defaultSet()]; sel = { set: null, action: null, step: null }; save(); refresh(); }
}
function moveStep(st, d) { const a = curAction(); const i = a.steps.indexOf(st), j = clamp(i + d, 0, a.steps.length - 1); if (i === j) return; a.steps.splice(i, 1); a.steps.splice(j, 0, st); save(); refresh(); }
function duplicateAction() { const f = findAction(sel.action); if (!f) return; const a = clone(f.action); a.id = uid(); a.name = a.name + ' copy'; a.steps.forEach(s => s.id = uid()); f.set.actions.splice(f.set.actions.indexOf(f.action) + 1, 0, a); sel.action = a.id; save(); refresh(); }
async function resetDefaults() {
  if (!(await confirm('Reset default actions', 'Restore the built-in “Default actions” set? Your own sets are kept.', 'Reset'))) return;
  store.sets = sets().filter(s => s.id !== 'default'); store.sets.unshift(defaultSet()); sel = { set: 'default', action: null, step: null }; save(); refresh(); toast('Default actions restored', 'ok');
}
async function exportActions(all = false) {
  ensureSel(); const s = findSet(sel.set); const data = { format: 'bts-photo-actions', version: 1, sets: all ? clone(sets()) : [clone(s)] };
  const p = await bts.fs.saveAs({ data: new TextEncoder().encode(JSON.stringify(data, null, 2)), defaultPath: (all ? 'BTS Photo actions' : s.name).replace(/[\\/:*?"<>|]+/g, '_') + '.btsactions', filters: [{ name: 'BTS Photo actions', extensions: ['btsactions'] }] });
  if (p) toast('Actions exported', 'ok');
}
function importActionsData(j) {
  if (!j || j.format !== 'bts-photo-actions' || !Array.isArray(j.sets)) throw new Error('This is not a BTS Photo actions file');
  let n = 0; for (const s of j.sets) { const ns = { id: uid(), name: String(s.name || 'Imported'), actions: (s.actions || []).map(a => ({ id: uid(), name: String(a.name || 'Action'), steps: (a.steps || []).filter(st => st && P().OPS[st.op]).map(st => ({ id: uid(), op: st.op, params: st.params || {}, on: st.on !== false, dialog: !!st.dialog, ...(st.name ? { name: String(st.name) } : {}) })) })) }; n += ns.actions.length; sets().push(ns); sel.set = ns.id; }
  save(); refresh(); return n;
}
async function importActions() {
  const fs = await bts.fs.open({ filters: [{ name: 'BTS Photo actions', extensions: ['btsactions', 'json'] }] }); if (!fs) return;
  try { const n = importActionsData(JSON.parse(new TextDecoder().decode(new Uint8Array(fs[0].data)))); toast('Imported ' + n + ' actions', 'ok'); } catch (e) { toast('Could not import: ' + e.message, 'err', 6000); }
}

// =====================================================================  panel
let panelEl = null;
function refresh() { if (panelEl && panelEl.isConnected && P().rtab === 'actions') renderPanel(panelEl); }
const stepTitle = st => st.name || P().OPS[st.op]?.name || st.op;
const stepDetail = st => { try { return P().OPS[st.op]?.detail?.(st.params || {}) || ''; } catch { return ''; } };
function renderPanel(el) {
  panelEl = el; ensureSel(); const icon = P().icon; el.innerHTML = '';
  const tree = h('div', { class: 'act-tree' });
  sets().forEach(s => {
    const sOpen = !expanded.has('c:' + s.id);
    tree.append(h('div', { class: 'act-row set' + (sel.set === s.id && !sel.action ? ' sel' : ''), onclick: () => { sel = { set: s.id, action: null, step: null }; refresh(); } },
      h('span', { class: 'act-tw', onclick: e => { e.stopPropagation(); expanded.has('c:' + s.id) ? expanded.delete('c:' + s.id) : expanded.add('c:' + s.id); refresh(); } }, sOpen ? '▾' : '▸'),
      h('span', { class: 'act-ic', html: icon('folder', 13) }), h('span', { class: 'act-n' }, s.name)));
    if (!sOpen) return;
    s.actions.forEach(a => {
      const aOpen = expanded.has(a.id), isSel = sel.action === a.id, rec = recording === a.id;
      tree.append(h('div', { class: 'act-row action' + (isSel && !sel.step ? ' sel' : '') + (rec ? ' rec' : ''), onclick: () => { sel = { set: s.id, action: a.id, step: null }; refresh(); }, ondblclick: () => { sel = { set: s.id, action: a.id, step: null }; play(a); } },
        h('span', { class: 'act-tw', onclick: e => { e.stopPropagation(); aOpen ? expanded.delete(a.id) : expanded.add(a.id); refresh(); } }, aOpen ? '▾' : '▸'),
        h('span', { class: 'act-n' }, a.name), rec ? h('span', { class: 'act-recdot', 'data-tip': 'Recording' }) : h('span', { class: 'muted act-cnt' }, String(a.steps.length))));
      if (!aOpen) return;
      if (!a.steps.length) tree.append(h('div', { class: 'act-row step muted' }, rec ? 'Recording — use the app as usual' : 'No steps yet'));
      a.steps.forEach(st => {
        const hasDlg = !!(P().OPS[st.op]?.dialog || P().OPS[st.op]?.fields?.(st.params || {}));
        tree.append(h('div', { class: 'act-row step' + (sel.step === st.id ? ' sel' : '') + (st.on ? '' : ' off'), onclick: () => { sel = { set: s.id, action: a.id, step: st.id }; refresh(); }, ondblclick: () => editStep(st) },
          h('input', { type: 'checkbox', checked: st.on, 'data-tip': 'Include this step', onclick: e => e.stopPropagation(), onchange: e => { st.on = e.target.checked; save(); refresh(); } }),
          h('button', { class: 'icon-btn act-dlg' + (st.dialog ? ' on' : ''), disabled: !hasDlg, 'data-tip': hasDlg ? 'Show the dialog when this step plays' : 'This step has no dialog', html: icon('sliders', 12), onclick: e => { e.stopPropagation(); if (!hasDlg) return; st.dialog = !st.dialog; save(); refresh(); } }),
          h('span', { class: 'act-n' }, stepTitle(st)), h('span', { class: 'muted act-d' }, stepDetail(st)),
          h('span', { class: 'act-mv' }, h('button', { class: 'icon-btn', 'data-tip': 'Move up', onclick: e => { e.stopPropagation(); moveStep(st, -1); } }, '↑'), h('button', { class: 'icon-btn', 'data-tip': 'Move down', onclick: e => { e.stopPropagation(); moveStep(st, 1); } }, '↓'))));
      });
    });
  });
  const b = (ic, tip, fn, cls = '') => h('button', { class: 'icon-btn ' + cls, 'data-tip': tip, html: icon(ic, 15), onclick: fn });
  const bar = h('div', { class: 'act-bar' },
    recording ? b('stop', 'Stop recording', stopRecording, 'act-stop') : b('record', 'Start recording', startRecording, 'act-record'),
    b('play', 'Play the selected action (from the selected step)', () => play(curAction(), { fromStep: sel.step })),
    h('span', { class: 'act-sp' }),
    b('plus', 'New action', () => newAction(true)), b('folder', 'New set', newSet), b('pencil', 'Rename', renameSel), b('copy', 'Duplicate action', duplicateAction), b('trash', 'Delete', deleteSel),
    b('more', 'More', e => UI.contextMenu(e, moreItems())));
  el.append(h('div', { class: 'act-wrap' }, recording ? h('div', { class: 'act-status' }, h('span', { class: 'act-recdot' }), 'Recording “' + (findAction(recording)?.action.name || '') + '”') : '', tree, bar));
}
function moreItems() { return [{ label: 'Edit step settings…', action: () => selStep() && editStep(selStep()), disabled: !selStep() }, { label: 'Play from selected step', action: () => play(curAction(), { fromStep: sel.step }), disabled: !sel.step }, '-', { label: 'Batch…', action: batchDialog }, { label: 'Image Processor…', action: imageProcessorDialog }, '-', { label: 'Import actions…', action: importActions }, { label: 'Export selected set…', action: () => exportActions(false) }, { label: 'Export all sets…', action: () => exportActions(true) }, { label: 'Reset default actions', action: resetDefaults }]; }
async function editStep(st) {
  const op = P().OPS[st.op]; const f = op?.fields?.(clone(st.params || {}));
  if (!f) return toast('This step has no editable settings — toggle “show dialog” to adjust it while playing');
  const v = await form({ title: op.name, fields: f }); if (!v) return; st.params = op.fromFields ? op.fromFields(clone(st.params || {}), v) : { ...st.params, ...v }; save(); refresh();
}
function menuItems() {
  return [{ label: 'Batch…', action: batchDialog }, { label: 'Image Processor…', action: imageProcessorDialog }, '-',
    { label: 'Actions panel', action: () => P().showTab('actions') },
    { label: 'Start recording', action: () => { P().showTab('actions'); startRecording(); }, disabled: !!recording }, { label: 'Stop recording', action: stopRecording, disabled: !recording },
    { label: 'Play selected action', action: () => play(), disabled: !P().D }, { label: 'New action…', action: () => { P().showTab('actions'); newAction(true); } },
    '-', { label: 'Import actions…', action: importActions }, { label: 'Export actions…', action: () => exportActions(true) }, { label: 'Reset default actions', action: resetDefaults }];
}

// =====================================================================  batch engine
const dirOf = p => p.replace(/[\\/][^\\/]*$/, ''), sepOf = p => (p.includes('\\') && !p.includes('/')) ? '\\' : '/';
const baseName = n => n.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function outName(pattern, name, n, total) { const pad = String(total).length; return (pattern || '{name}').replace(/\{name\}/g, baseName(name)).replace(/\{nnn\}/g, String(n).padStart(Math.max(3, pad), '0')).replace(/\{n\}/g, String(n)).replace(/\{date\}/g, today()).replace(/[\\/:*?"<>|]+/g, '_') || baseName(name); }
// progress overlay with Cancel
function progressUI(title) {
  let cancelled = false; const bar = h('div', { class: 'bp-fill' }), label = h('div', { class: 'bp-label' }, ''), count = h('div', { class: 'muted bp-count' }, '');
  const btn = h('button', { class: 'btn', onclick: () => { cancelled = true; btn.disabled = true; btn.textContent = 'Cancelling…'; } }, 'Cancel');
  const el = h('div', { class: 'modal-back bp-back' }, h('div', { class: 'modal bp' }, h('div', { class: 'm-h' }, title), h('div', { class: 'm-b' }, label, h('div', { class: 'bp-bar' }, bar), count), h('div', { class: 'm-f' }, btn)));
  document.body.append(el);
  return { set(i, total, name) { bar.style.width = (total ? i / total * 100 : 0) + '%'; label.textContent = name || ''; count.textContent = `${i} / ${total}`; }, get cancelled() { return cancelled; }, close() { el.remove(); } };
}
async function pickFiles(title) {
  const fs = await bts.fs.open({ multi: true, filters: [{ name: title || 'Images', extensions: P().IMAGE_EXT }, { name: 'All files', extensions: ['*'] }] });
  return fs ? fs.map(f => ({ name: f.name, path: f.path, data: f.data })) : null;
}
async function listFolder(dir) {
  // optional IPC (bts.fs.listDir) — see the release notes; falls back to multi-select when missing
  if (!bts.fs.listDir) return null; const list = await bts.fs.listDir(dir); const ext = new Set(P().IMAGE_EXT);
  return (list || []).filter(e => !e.dir && ext.has(P().extOf(e.name))).map(e => ({ name: e.name, path: e.path, data: null }));
}
async function pickDestFolder() {
  if (bts.fs.pickFolder) return bts.fs.pickFolder();
  const p = await bts.fs.pickSavePath({ defaultPath: 'Choose this folder.txt', filters: [{ name: 'Folder', extensions: ['txt'] }] });
  return p ? dirOf(p) : null;
}
// files: [{name, path, data?}], job: { steps|action, outputs: [{fmt,q,fit:{w,h}|null, sub?}], dest: folder|null (null = beside source), pattern }
async function runBatch(files, job, title = 'Batch') {
  const A = P(); const ui = progressUI(title), log = [], written = []; let done = 0;
  const total = files.length; const t0 = Date.now();
  try {
    for (let i = 0; i < files.length; i++) {
      if (ui.cancelled) { log.push(`Cancelled by the user before ${files[i].name}`); break; }
      const f = files[i]; ui.set(i, total, f.name); await A.sleep(15);
      try {
        const u8 = f.data ? new Uint8Array(f.data) : new Uint8Array((await bts.fs.read(f.path)).data);
        const canvas = await A.decodeToCanvas(u8, f.name, { raw: job.rawSettings || null });
        const doc = A.docFromCanvas(canvas, f.name); doc.path = f.path || null;
        await A.withHiddenDoc(doc, async () => {
          if (job.action) await play(job.action, { batch: true, suppressDialogs: true });
          for (const out of job.outputs) {
            const exp = out.fmt === 'action' ? lastExportStep(job.action) : out;
            if (out.fit && (out.fit.w || out.fit.h)) { await A.runStep({ op: 'fit', params: { w: out.fit.w || 1e9, h: out.fit.h || 1e9, enlarge: false } }, { batch: true }); }
            const r = await A.encodeExport(exp);
            const folder = (job.dest || (f.path ? dirOf(f.path) : null)); if (!folder) throw new Error('No destination folder');
            const sep = sepOf(folder); let name = outName(job.pattern, f.name, i + 1, total) + '.' + r.ext; if (out.sub) name = out.sub + '-' + name;
            let target = folder + sep + name; if (f.path && target === f.path) target = folder + sep + outName(job.pattern, f.name, i + 1, total) + '-1.' + r.ext;
            await bts.fs.write({ path: target, data: r.data, noRecent: true }); written.push(target);
          }
        });
        done++;
      } catch (e) { console.warn('batch', f.name, e); log.push(`${f.name}: ${e.message || e}`); }
    }
    ui.set(Math.min(total, done + log.filter(l => !l.startsWith('Cancelled')).length), total, '');
  } finally { ui.close(); }
  let logPath = null; const folder = job.dest || (files[0]?.path ? dirOf(files[0].path) : null);
  if (log.length && folder) { const d = new Date(); logPath = folder + sepOf(folder) + `batch-errors-${today()}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}.txt`; const txt = `BTS Photo — ${title}\r\n${new Date().toString()}\r\nProcessed: ${done} of ${total}\r\nOutput files: ${written.length}\r\n\r\n` + log.join('\r\n') + '\r\n'; try { await bts.fs.write({ path: logPath, data: new TextEncoder().encode(txt), noRecent: true }); } catch (e) { logPath = null; console.warn(e); } }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const body = h('div', { class: 'ph-fields' }, h('div', {}, `${done} of ${total} files processed · ${written.length} files written · ${secs} s`), log.length ? h('div', { class: 'muted' }, logPath ? 'Error log saved to ' + logPath : 'Errors') : '', log.length ? h('pre', { class: 'bp-log' }, log.join('\n')) : '');
  modal({ title, body, width: 560 });
  return { done, total, written, log, logPath };
}
function lastExportStep(action) { const s = (action?.steps || []).filter(x => x.on && x.op === 'export').pop(); return s ? s.params : { fmt: 'jpeg', q: 90, scale: 1, matte: '#ffffff' }; }
function fmtOptions(withAction) { const o = [{ value: 'jpeg', label: 'JPEG' }, { value: 'png', label: 'PNG' }, { value: 'webp', label: 'WebP' }, { value: 'avif', label: 'AVIF' }]; if (withAction) o.unshift({ value: 'action', label: 'As in the action’s Export step' }); return o; }

// =====================================================================  Batch dialog
let lastBatch = { pattern: '{name}-edited', fmt: 'jpeg', q: 90, destMode: 'folder', srcMode: 'files' };
async function batchDialog() {
  ensureSel(); const allActions = sets().flatMap(s => s.actions.map(a => ({ s, a })));
  if (!allActions.length) return toast('Create an action first', 'err');
  let files = [], dest = lastBatch.dest || null; const v = { ...lastBatch, action: sel.action && findAction(sel.action) ? sel.action : allActions[0].a.id };
  const srcInfo = h('div', { class: 'muted' }, 'No files chosen'), destInfo = h('div', { class: 'muted bp-path' }, dest || 'No folder chosen');
  const updSrc = () => { srcInfo.textContent = files.length ? `${files.length} files · ${files.slice(0, 3).map(f => f.name).join(', ')}${files.length > 3 ? '…' : ''}` : 'No files chosen'; };
  const chooseFiles = async () => { const r = await pickFiles(); if (r) { files = r; updSrc(); } };
  const chooseFolder = async () => { const d = bts.fs.pickFolder ? await bts.fs.pickFolder() : null; if (!d) return; const r = await listFolder(d); if (r) { files = r; updSrc(); } };
  const chooseDest = async () => { const d = await pickDestFolder(); if (d) { dest = d; destInfo.textContent = d; } };
  const fl = h('div', { class: 'ph-fields' });
  P().buildFields(fl, [{ key: 'action', label: 'Action', type: 'select', options: allActions.map(({ s, a }) => ({ value: a.id, label: s.name + ' › ' + a.name })) }], v, () => { });
  const src = h('div', { class: 'field' }, h('span', {}, 'Source'), h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: chooseFiles }, 'Choose files…'), bts.fs.listDir && bts.fs.pickFolder ? h('button', { class: 'btn sm', onclick: chooseFolder }, 'Choose folder…') : ''), srcInfo);
  const dmSel = h('select', {}, h('option', { value: 'folder', selected: v.destMode === 'folder' }, 'Folder'), h('option', { value: 'same', selected: v.destMode === 'same' }, 'Same folder as each source file'));
  dmSel.onchange = () => { v.destMode = dmSel.value; destRow.style.display = v.destMode === 'folder' ? '' : 'none'; };
  const destRow = h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: chooseDest }, 'Choose folder…'), destInfo); destRow.style.display = v.destMode === 'folder' ? '' : 'none';
  const outF = h('div', { class: 'ph-fields' });
  P().buildFields(outF, [{ key: 'pattern', label: 'File name ({name}, {n}, {nnn}, {date})', type: 'text' }, { key: 'fmt', label: 'Format', type: 'select', options: fmtOptions(true) }, { key: 'q', label: 'Quality % (JPEG, WebP, AVIF)', type: 'range', min: 1, max: 100 }], v, () => { preview.textContent = 'Example: ' + outName(v.pattern, files[0]?.name || 'IMG_0001.jpg', 1, Math.max(1, files.length)) + '.' + (v.fmt === 'action' ? lastExportStep(findAction(v.action)?.action).fmt : v.fmt).replace('jpeg', 'jpg'); });
  const preview = h('div', { class: 'muted' }, 'Example: ' + outName(v.pattern, 'IMG_0001.jpg', 1, 1) + '.jpg');
  const note = h('div', { class: 'muted', style: { fontSize: '11px' } }, 'Each file is opened in a hidden document, the action is played (its Export steps are replaced by these output settings) and the result is saved. Errors are written to a log file in the destination folder.');
  const body = h('div', { class: 'ph-fields batch-dlg' }, fl, src, h('label', { class: 'field' }, 'Destination', dmSel), destRow, outF, preview, note);
  const r = await modal({ title: 'Batch', width: 560, body, buttons: [{ label: 'Cancel', value: null }, { label: 'Run', primary: true, value: 'ok' }] });
  if (r !== 'ok') return;
  if (!files.length) { files = (await pickFiles()) || []; if (!files.length) return; }
  if (v.destMode === 'folder' && !dest) { dest = await pickDestFolder(); if (!dest) return; }
  lastBatch = { pattern: v.pattern, fmt: v.fmt, q: v.q, destMode: v.destMode, dest };
  const action = findAction(v.action)?.action; if (!action) return;
  return runBatch(files, { action, dest: v.destMode === 'folder' ? dest : null, pattern: v.pattern, outputs: [v.fmt === 'action' ? { fmt: 'action' } : { fmt: v.fmt, q: v.q, scale: 1, matte: v.fmt === 'jpeg' ? '#ffffff' : 'none' }] }, 'Batch');
}
// =====================================================================  Image Processor
let lastIP = { jpeg: true, jq: 85, png: false, webp: false, wq: 82, resize: true, w: 1920, h: 1920, destMode: 'folder', pattern: '{name}', runAction: false };
async function imageProcessorDialog() {
  ensureSel(); let files = [], dest = lastIP.dest || null; const v = { ...lastIP, action: sel.action || '' };
  const srcInfo = h('div', { class: 'muted' }, 'No files chosen'), destInfo = h('div', { class: 'muted bp-path' }, dest || 'No folder chosen');
  const chooseFiles = async () => { const r = await pickFiles(); if (r) { files = r; srcInfo.textContent = `${files.length} files · ${files.slice(0, 3).map(f => f.name).join(', ')}${files.length > 3 ? '…' : ''}`; } };
  const chooseDest = async () => { const d = await pickDestFolder(); if (d) { dest = d; destInfo.textContent = d; } };
  const dmSel = h('select', {}, h('option', { value: 'folder', selected: v.destMode === 'folder' }, 'Folder'), h('option', { value: 'same', selected: v.destMode === 'same' }, 'Same folder as each source file'));
  const destRow = h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: chooseDest }, 'Choose folder…'), destInfo); dmSel.onchange = () => { v.destMode = dmSel.value; destRow.style.display = v.destMode === 'folder' ? '' : 'none'; }; destRow.style.display = v.destMode === 'folder' ? '' : 'none';
  const fl = h('div', { class: 'ph-fields' });
  const allActions = sets().flatMap(s => s.actions.map(a => ({ value: a.id, label: s.name + ' › ' + a.name })));
  P().buildFields(fl, [
    { key: 'n1', type: 'note', label: 'File types' },
    { key: 'jpeg', label: 'Save as JPEG', type: 'checkbox' }, { key: 'jq', label: 'JPEG quality %', type: 'range', min: 1, max: 100 },
    { key: 'png', label: 'Save as PNG', type: 'checkbox' },
    { key: 'webp', label: 'Save as WebP', type: 'checkbox' }, { key: 'wq', label: 'WebP quality %', type: 'range', min: 1, max: 100 },
    { key: 'n2', type: 'note', label: 'Size' },
    { key: 'resize', label: 'Resize to fit (never enlarges)', type: 'checkbox' }, { key: 'w', label: 'Max width (px)', type: 'number' }, { key: 'h', label: 'Max height (px)', type: 'number' },
    { key: 'n3', type: 'note', label: 'Options' },
    { key: 'pattern', label: 'File name ({name}, {n}, {nnn}, {date})', type: 'text' },
    { key: 'runAction', label: 'Run an action first', type: 'checkbox' }, ...(allActions.length ? [{ key: 'action', label: 'Action', type: 'select', options: allActions }] : []),
  ], v, () => { });
  const body = h('div', { class: 'ph-fields batch-dlg' }, h('div', { class: 'field' }, h('span', {}, 'Source'), h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: chooseFiles }, 'Choose files…')), srcInfo), h('label', { class: 'field' }, 'Destination', dmSel), destRow, fl,
    h('div', { class: 'muted', style: { fontSize: '11px' } }, 'When more than one file type is chosen, each output name starts with the format (for example jpeg-photo.jpg).'));
  const r = await modal({ title: 'Image Processor', width: 520, body, buttons: [{ label: 'Cancel', value: null }, { label: 'Run', primary: true, value: 'ok' }] });
  if (r !== 'ok') return;
  const outs = []; const fit = v.resize ? { w: Math.max(1, +v.w || 0), h: Math.max(1, +v.h || 0) } : null;
  if (v.jpeg) outs.push({ fmt: 'jpeg', q: v.jq, scale: 1, matte: '#ffffff', fit }); if (v.png) outs.push({ fmt: 'png', q: 100, scale: 1, matte: 'none', fit }); if (v.webp) outs.push({ fmt: 'webp', q: v.wq, scale: 1, matte: 'none', fit });
  if (!outs.length) return toast('Choose at least one file type', 'err');
  if (outs.length > 1) outs.forEach(o => o.sub = o.fmt);
  if (!files.length) { files = (await pickFiles()) || []; if (!files.length) return; }
  if (v.destMode === 'folder' && !dest) { dest = await pickDestFolder(); if (!dest) return; }
  lastIP = { ...v, dest }; delete lastIP.action;
  const action = v.runAction ? findAction(v.action)?.action : null;
  return runBatch(files, { action, dest: v.destMode === 'folder' ? dest : null, pattern: v.pattern, outputs: outs }, 'Image Processor');
}

window.PhotoActions = { record, renderPanel, menuItems, play, startRecording, stopRecording, newAction, batchDialog, imageProcessorDialog, runBatch, importActionsData, exportActions, importActions, resetDefaults, outName,
  get recording() { return recording; }, get playing() { return playing > 0; }, get sets() { return sets(); }, select(actionId, stepId = null) { const f = findAction(actionId); if (f) sel = { set: f.set.id, action: actionId, step: stepId }; refresh(); }, findAction, save, defaultSet, editStep };
})();
