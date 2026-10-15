// BTS PDF Pro — view, annotate, edit, sign, fill forms, organize, combine, compress, export
import * as pdfjsLib from '../vendor/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = '../vendor/pdf.worker.min.mjs';
const { PDFDocument, StandardFonts, rgb, degrees, PDFName, PDFString, PDFHexString, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } = window.PDFLib;
const ftype = f => f instanceof PDFTextField ? 'PDFTextField' : f instanceof PDFCheckBox ? 'PDFCheckBox' : f instanceof PDFDropdown ? 'PDFDropdown' : f instanceof PDFRadioGroup ? 'PDFRadioGroup' : 'other';
const { $, h, icon, toast, modal, form, prompt, confirm, History, contextMenu, clamp } = UI;

// ------------------------------------------------------------------ state
const S = {
  sources: [],          // { bytes, js, name }
  pages: [],            // { id, src, index, rot, baseRot, w, h, annots: [] }
  formFields: [],       // existing AcroForm fields on source 0
  formValues: {},
  filePath: null, fileName: null, dirty: false,
  zoom: 1, zoomMode: 'fit-width',
  tool: 'select', sel: null,  // sel = { pageId, annId }
  style: { color: '#ff5a5f', fill: 'none', sw: 2, opacity: 1, hl: '#ffd400', fontSize: 14, font: 'Helvetica', bold: false, textColor: '#111111' },
  stamp: 'APPROVED', fieldType: 'text', areaHighlight: false,
  pending: null,        // { type:'image', src, w, h } awaiting placement
  textCache: {},        // pageKey -> {items, str}
  author: localStorage.getItem('bts.author') || 'Student',
  leftTab: 'thumbs', organizer: false, ogSel: new Set(),
  search: { q: '', hits: [], cur: -1 },
};
const hist = new History(80);
let uid = 1; const nid = () => 'a' + (uid++) + Math.random().toString(36).slice(2, 6);
const pageById = id => S.pages.find(p => p.id === id);
const PX = 4 / 3; // CSS px per PDF point at 100%

// ------------------------------------------------------------------ UI scaffold
UI.titlebar({ logo: 'Pdf', menus: [
  { label: 'File', items: () => [
    { label: 'Open…', kbd: 'Ctrl+O', action: openDialog },
    { label: 'Create PDF from images…', action: createFromImages },
    { label: 'Combine files…', action: combineFiles },
    '-',
    { label: 'Save', kbd: 'Ctrl+S', action: save, disabled: !S.pages.length },
    { label: 'Save as…', kbd: 'Ctrl+Shift+S', action: () => save(true), disabled: !S.pages.length },
    { label: 'Export', sub: [
      { label: 'Pages as PNG images…', action: exportImages },
      { label: 'Pages as JPEG images…', action: () => exportImages('jpeg') },
      { label: 'Plain text (.txt)…', action: exportText },
    ], disabled: !S.pages.length },
    { label: 'Compress PDF…', action: compressDialog, disabled: !S.pages.length },
    '-',
    { label: 'Document properties…', kbd: 'Ctrl+D', action: propertiesDialog, disabled: !S.pages.length },
    { label: 'Print…', kbd: 'Ctrl+P', action: printDoc, disabled: !S.pages.length },
    '-',
    { label: 'BTS Creative home', action: () => bts.openApp('home') },
    { label: 'Close window', kbd: 'Ctrl+W', action: closeWindow },
  ] },
  { label: 'Edit', items: () => [
    { label: 'Undo', kbd: 'Ctrl+Z', action: undo, disabled: !hist.canUndo },
    { label: 'Redo', kbd: 'Ctrl+Y', action: redo, disabled: !hist.canRedo },
    '-',
    { label: 'Copy selected text', kbd: 'Ctrl+C', action: () => document.execCommand('copy') },
    { label: 'Delete annotation', kbd: 'Del', action: deleteSelected, disabled: !S.sel },
    { label: 'Duplicate annotation', kbd: 'Ctrl+J', action: duplicateSelected, disabled: !S.sel },
    '-',
    { label: 'Find…', kbd: 'Ctrl+F', action: () => showLeft('search', true) },
    { label: 'Set author name…', action: async () => { const v = await prompt('Author name', 'Name used on comments', S.author); if (v) { S.author = v; localStorage.setItem('bts.author', v); } } },
  ] },
  { label: 'View', items: () => [
    { label: 'Zoom in', kbd: 'Ctrl++', action: () => setZoom(S.zoom * 1.2) },
    { label: 'Zoom out', kbd: 'Ctrl+-', action: () => setZoom(S.zoom / 1.2) },
    { label: 'Actual size', kbd: 'Ctrl+0', action: () => setZoom(1) },
    { label: 'Fit width', kbd: 'Ctrl+2', action: () => setZoom('fit-width') },
    { label: 'Fit page', kbd: 'Ctrl+1', action: () => setZoom('fit-page') },
    '-',
    { label: 'Rotate view clockwise', kbd: 'Ctrl+Shift+R', action: () => rotatePages(S.pages.map(p => p.id), 90) },
    { label: 'Go to page…', kbd: 'Ctrl+G', action: gotoPageDialog },
    { label: 'Show side panel', checked: () => !$('.mid').classList.contains('no-left'), action: () => $('.mid').classList.toggle('no-left') },
    { label: 'Organize pages', checked: () => S.organizer, kbd: 'Ctrl+Shift+O', action: () => toggleOrganizer() },
  ] },
  { label: 'Comment', items: () => [
    { label: 'Highlight text', kbd: 'H', action: () => setTool('highlight') },
    { label: 'Underline text', action: () => setTool('underline') },
    { label: 'Strikethrough text', action: () => setTool('strike') },
    { label: 'Sticky note', kbd: 'N', action: () => setTool('note') },
    { label: 'Add text box', kbd: 'T', action: () => setTool('text') },
    '-',
    { label: 'Draw (pen)', kbd: 'P', action: () => setTool('ink') },
    { label: 'Rectangle', kbd: 'R', action: () => setTool('rect') },
    { label: 'Ellipse', kbd: 'O', action: () => setTool('ellipse') },
    { label: 'Line', kbd: 'L', action: () => setTool('line') },
    { label: 'Arrow', kbd: 'A', action: () => setTool('arrow') },
    { label: 'Stamp', action: () => setTool('stamp') },
  ] },
  { label: 'Tools', items: () => [
    { label: 'Edit text', kbd: 'E', action: () => setTool('edit') },
    { label: 'Add image…', action: addImage },
    { label: 'Fill & Sign…', action: signDialog },
    { label: 'Prepare form (add fields)', action: () => setTool('field') },
    { label: 'Redact', action: () => setTool('redact') },
    '-',
    { label: 'Organize pages', action: () => toggleOrganizer(true) },
    { label: 'Insert blank page', action: () => insertBlank(currentPageIdx() + 1) },
    { label: 'Insert pages from file…', action: () => insertFromFile(currentPageIdx() + 1) },
    { label: 'Extract pages…', action: extractDialog },
    { label: 'Split document…', action: splitDialog },
    '-',
    { label: 'Add watermark…', action: watermarkDialog },
    { label: 'Header & footer / page numbers…', action: pageNumbersDialog },
    { label: 'Remove all annotations…', action: clearAnnots },
  ] },
  { label: 'Help', items: [
    { label: 'Keyboard shortcuts', action: shortcutsHelp },
    { label: 'Check for updates', action: () => bts.update.check().then(r => toast(r.state === 'store' ? 'Updates are delivered by the Microsoft Store.' : r.state === 'dev' ? 'Updates run in the installed version.' : 'Checking for updates…')) },
    { label: 'About BTS PDF Pro', action: () => modal({ title: 'BTS PDF Pro', body: 'Part of BTS Creative — free and open source for students.<br>Not affiliated with Adobe Inc.' }) },
  ] },
]});
window.addEventListener('bts:close', closeWindow);
window.addEventListener('beforeunload', () => {});

// ------------------------------------------------------------------ tools
const TOOLS = [
  ['select', 'select', 'Select', 'V'], ['hand', 'hand', 'Hand', 'Space'], ['zoom', 'zoom', 'Zoom', 'Z'], '-',
  ['highlight', 'highlight', 'Highlight', 'H'], ['underline', 'underline', 'Underline', 'U'], ['strike', 'strike', 'Strikethrough', 'K'],
  ['note', 'note', 'Sticky note', 'N'], ['text', 'text', 'Add text', 'T'], '-',
  ['ink', 'pencil', 'Draw', 'P'], ['rect', 'rect', 'Rectangle', 'R'], ['ellipse', 'ellipse', 'Ellipse', 'O'], ['line', 'line', 'Line', 'L'], ['arrow', 'arrow', 'Arrow', 'A'], '-',
  ['edit', 'pen', 'Edit text', 'E'], ['image', 'image', 'Add image', 'I'], ['sign', 'sign', 'Fill & Sign', 'S'], ['stamp', 'stamp', 'Stamp', 'M'],
  ['field', 'form', 'Form field', 'F'], ['redact', 'redact', 'Redact', 'X'],
];
const tb = $('#toolbar');
TOOLS.forEach(t => {
  if (t === '-') { tb.append(h('div', { class: 'tsep' })); return; }
  const [id, ic, tip, key] = t;
  tb.append(h('button', { class: 'icon-btn', 'data-tool': id, 'data-tip': tip, 'data-key': key, html: icon(ic), onclick: () => {
    if (id === 'image') return addImage(); if (id === 'sign') return signDialog(); setTool(id);
  } }));
});
const keyTools = { v: 'select', z: 'zoom', h: 'highlight', u: 'underline', k: 'strike', n: 'note', t: 'text', p: 'ink', r: 'rect', o: 'ellipse', l: 'line', a: 'arrow', e: 'edit', m: 'stamp', f: 'field', x: 'redact' };
Object.entries(keyTools).forEach(([k, t]) => UI.shortcut(k, () => setTool(t)));
UI.shortcut('i', addImage); UI.shortcut('s', signDialog);

function setTool(t) {
  S.tool = t; S.pending = null;
  tb.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  const st = $('#stage');
  st.className = 'stage ' + ({ hand: 'tool-hand', text: 'tool-text', edit: 'tool-edit', note: 'tool-draw', ink: 'tool-draw', rect: 'tool-draw', ellipse: 'tool-draw', line: 'tool-draw', arrow: 'tool-draw', redact: 'tool-draw', field: 'tool-draw', stamp: 'tool-draw', zoom: 'tool-draw' }[t] || '');
  updateInteract();
  renderOptions();
  if (t !== 'select') select(null);
  $('#stTool').textContent = (TOOLS.find(x => x[0] === t) || [])[2] || '';
}
const TEXT_TOOLS = ['select', 'highlight', 'underline', 'strike', 'edit'];
function updateInteract() {
  const passthru = TEXT_TOOLS.includes(S.tool) && !(S.areaHighlight && ['highlight'].includes(S.tool)) && !S.pending;
  document.querySelectorAll('.interact').forEach(el => el.classList.toggle('passthru', passthru || S.tool === 'hand'));
  document.querySelectorAll('.textLayer').forEach(el => el.style.pointerEvents = S.tool === 'hand' ? 'none' : '');
}

// ------------------------------------------------------------------ options bar
const COLORS = ['#ff5a5f', '#ff9a00', '#ffd400', '#3ccf8e', '#31a8ff', '#9a7bff', '#111111', '#ffffff'];
function swatchRow(val, onPick, list = COLORS) {
  const w = h('div', { class: 'swatches' });
  list.forEach(c => w.append(h('span', { class: c === val ? 'on' : '', style: { background: c }, onclick: () => onPick(c) })));
  const ci = h('input', { type: 'color', value: val && val !== 'none' ? val : '#000000', style: { width: '22px', height: '22px' } });
  ci.oninput = () => onPick(ci.value); w.append(ci); return w;
}
function renderOptions() {
  const ob = $('#optbar'); ob.innerHTML = '';
  const grp = (...k) => h('div', { class: 'grp' }, ...k), vsep = () => h('div', { class: 'vsep' });
  const btn = (ic, tip, fn, txt) => h('button', { class: 'btn ghost sm', 'data-tip': tip, html: icon(ic) + (txt ? `<span>${txt}</span>` : ''), onclick: fn });
  ob.append(btn('open', 'Open', openDialog, 'Open'), btn('save', 'Save', () => save(), 'Save'), btn('print', 'Print', printDoc), vsep(),
    btn('undo', 'Undo (Ctrl+Z)', undo), btn('redo', 'Redo (Ctrl+Y)', redo), vsep());
  const t = S.tool;
  const restyle = () => { renderOptions(); applyStyleToSelected(); };
  if (['highlight', 'underline', 'strike'].includes(t)) {
    ob.append(grp('Color', swatchRow(S.style.hl, c => { S.style.hl = c; restyle(); })));
    if (t === 'highlight') { const cb = h('input', { type: 'checkbox', checked: S.areaHighlight }); cb.onchange = () => { S.areaHighlight = cb.checked; updateInteract(); }; ob.append(vsep(), h('label', { class: 'grp' }, cb, 'Area highlight')); }
    ob.append(vsep(), h('span', { class: 'muted' }, 'Select text on the page to mark it up'));
  } else if (['ink', 'rect', 'ellipse', 'line', 'arrow'].includes(t) || (S.sel && ['ink', 'rect', 'ellipse', 'line', 'arrow'].includes(selAnn()?.type))) {
    ob.append(grp('Stroke', swatchRow(S.style.color, c => { S.style.color = c; restyle(); })));
    if (['rect', 'ellipse'].includes(t) || ['rect', 'ellipse'].includes(selAnn()?.type)) ob.append(vsep(), grp('Fill', swatchRow(S.style.fill, c => { S.style.fill = c; restyle(); }, ['none', ...COLORS])));
    const w = h('input', { type: 'range', min: 0.5, max: 20, step: 0.5, value: S.style.sw, style: { width: '90px' } }); w.oninput = () => { S.style.sw = +w.value; applyStyleToSelected(); };
    const o = h('input', { type: 'range', min: 0.1, max: 1, step: 0.05, value: S.style.opacity, style: { width: '80px' } }); o.oninput = () => { S.style.opacity = +o.value; applyStyleToSelected(); };
    ob.append(vsep(), grp('Width', w), grp('Opacity', o));
  } else if (t === 'text' || t === 'edit' || selAnn()?.type === 'text') {
    const f = h('select', { style: { width: '120px' } }, ...['Helvetica', 'Times', 'Courier'].map(x => h('option', { selected: x === S.style.font }, x)));
    f.onchange = () => { S.style.font = f.value; applyStyleToSelected(); };
    const s = h('input', { type: 'number', min: 4, max: 144, value: S.style.fontSize, style: { width: '56px' } }); s.oninput = () => { S.style.fontSize = +s.value; applyStyleToSelected(); };
    const b = h('button', { class: 'btn sm' + (S.style.bold ? ' primary' : ''), onclick: () => { S.style.bold = !S.style.bold; restyle(); } }, 'B');
    ob.append(grp('Font', f), grp('Size', s), b, vsep(), grp('Color', swatchRow(S.style.textColor, c => { S.style.textColor = c; restyle(); })));
    if (t === 'edit') ob.append(vsep(), h('span', { class: 'muted' }, 'Click any text on the page to edit it'));
  } else if (t === 'stamp') {
    const sel = h('select', {}, ...['APPROVED', 'REVIEWED', 'CONFIDENTIAL', 'DRAFT', 'FINAL', 'NOT APPROVED', 'COMPLETED', 'VOID', 'FOR COMMENT'].map(x => h('option', { selected: x === S.stamp }, x)));
    sel.onchange = () => S.stamp = sel.value;
    ob.append(grp('Stamp', sel), grp('Color', swatchRow(S.style.color, c => { S.style.color = c; renderOptions(); })), vsep(), h('span', { class: 'muted' }, 'Click on the page to place the stamp'));
  } else if (t === 'field') {
    const sel = h('select', {}, h('option', { value: 'text', selected: S.fieldType === 'text' }, 'Text field'), h('option', { value: 'checkbox', selected: S.fieldType === 'checkbox' }, 'Checkbox'));
    sel.onchange = () => S.fieldType = sel.value;
    ob.append(grp('Field type', sel), vsep(), h('span', { class: 'muted' }, 'Drag on the page to add a fillable field'));
  } else if (t === 'redact') {
    ob.append(h('span', { class: 'muted' }, 'Drag over content to redact. Redacted pages are flattened on save so hidden text cannot be recovered.'));
  } else if (t === 'zoom') {
    ob.append(h('span', { class: 'muted' }, 'Click to zoom in, Alt+click to zoom out'));
  } else if (t === 'note') {
    ob.append(grp('Color', swatchRow(S.style.hl, c => { S.style.hl = c; restyle(); })), vsep(), h('span', { class: 'muted' }, 'Click on the page to add a comment'));
  } else {
    ob.append(btn('rotateL', 'Rotate left', () => rotatePages([curPage()?.id].filter(Boolean), -90)), btn('rotate', 'Rotate right', () => rotatePages([curPage()?.id].filter(Boolean), 90)), vsep(),
      btn('pages', 'Organize pages', () => toggleOrganizer(), 'Organize'), btn('merge', 'Combine files', combineFiles, 'Combine'), btn('compress', 'Compress', compressDialog, 'Compress'));
  }
}

// ------------------------------------------------------------------ right panel
function renderProps() {
  const p = $('#props'); p.innerHTML = '';
  const a = selAnn();
  if (a) {
    const pg = pageById(S.sel.pageId);
    const body = h('div', { class: 'panel-b' });
    const row = (lab, el) => body.append(h('div', { class: 'prop-row' }, h('span', {}, lab), el));
    row('Type', h('span', { style: { color: 'var(--tx-0)' } }, ({ hl: 'Highlight' })[a.type] || a.type[0].toUpperCase() + a.type.slice(1)));
    row('Page', h('span', {}, String(S.pages.indexOf(pg) + 1)));
    if (a.type === 'note' || a.type === 'text') {
      const ta = h('textarea', { rows: 5, style: { width: '100%' } }, a.text || '');
      ta.oninput = () => { a.text = ta.value; drawAnnots(pg); markDirty(); };
      ta.onchange = () => commit('Edit text');
      body.append(h('label', { class: 'field', style: { marginBottom: '10px' } }, a.type === 'note' ? 'Comment' : 'Text', ta));
      if (a.type === 'note') row('Author', h('span', {}, a.author || ''));
    }
    if (a.type === 'field') {
      const n = h('input', { type: 'text', value: a.name }); n.onchange = () => { a.name = n.value || a.name; commit('Rename field'); };
      row('Field name', n);
    }
    if ('opacity' in a) { const o = h('input', { type: 'range', min: 0.1, max: 1, step: 0.05, value: a.opacity }); o.oninput = () => { a.opacity = +o.value; drawAnnots(pg); }; o.onchange = () => commit('Opacity'); row('Opacity', o); }
    body.append(h('div', { class: 'row', style: { marginTop: '12px' } },
      h('button', { class: 'btn sm', onclick: duplicateSelected, html: icon('copy') + 'Duplicate' }),
      h('button', { class: 'btn sm', onclick: deleteSelected, html: icon('trash') + 'Delete' })));
    p.append(h('div', { class: 'panel' }, h('div', { class: 'panel-h' }, 'Properties'), body));
  }
  const tools = [
    ['note', 'Comment', () => setTool('note')], ['pen', 'Edit PDF text', () => setTool('edit')], ['pages', 'Organize pages', () => toggleOrganizer(true)],
    ['merge', 'Combine files', combineFiles], ['sign', 'Fill & Sign', signDialog], ['form', 'Prepare form', () => setTool('field')],
    ['redact', 'Redact', () => setTool('redact')], ['compress', 'Compress PDF', compressDialog], ['export', 'Export PDF', exportImages],
    ['stamp', 'Watermark', watermarkDialog], ['grid', 'Page numbers', pageNumbersDialog], ['split', 'Split PDF', splitDialog],
    ['image', 'Images to PDF', createFromImages], ['print', 'Print', printDoc],
  ];
  p.append(h('div', { class: 'panel fill' }, h('div', { class: 'panel-h' }, 'All tools'),
    h('div', { class: 'panel-b tool-list' }, ...tools.map(([ic, l, fn]) => h('div', { class: 'tl', onclick: fn, html: icon(ic) + l })))));
}

// ------------------------------------------------------------------ loading
async function loadPdfBytes(bytes, name) {
  const js = await pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  return { bytes, js, name };
}
async function openFiles(files) {
  // files: [{path?, name, data(Uint8Array|Buffer)}]
  const pdfs = files.filter(f => /\.pdf$/i.test(f.name)), imgs = files.filter(f => /\.(png|jpe?g|webp|bmp|gif)$/i.test(f.name));
  if (!pdfs.length && imgs.length) { const bytes = await imagesToPdf(imgs); return openDoc(new Uint8Array(bytes), 'Images.pdf', null); }
  if (!pdfs.length) return toast('Unsupported file type', 'err');
  if (S.pages.length && S.dirty === false && false) {}
  await openDoc(new Uint8Array(pdfs[0].data), pdfs[0].name, pdfs[0].path || null);
  for (const f of pdfs.slice(1)) await appendPdf(new Uint8Array(f.data), f.name);
}
async function openDoc(bytes, name, path) {
  if (S.pages.length && S.dirty && !(await confirm('Unsaved changes', 'Discard changes to the current document?', 'Discard'))) return;
  try {
    const src = await loadPdfBytes(bytes, name);
    S.sources = [src]; S.pages = []; S.formValues = {}; S.textCache = {}; S.sel = null;
    await addSourcePages(0);
    S.filePath = path; S.fileName = name; S.dirty = false;
    await loadFormFields(bytes);
    await buildPages(); hist.reset(snapshot());
    setZoom(S.zoomMode || 'fit-width');
    UI.setDocTitle(name, 'BTS PDF Pro');
    if (path) bts.recent.add(path);
    showLeft(S.leftTab); renderOptions(); renderProps();
    $('.welcome')?.remove();
  } catch (e) {
    console.error(e);
    if (/password/i.test(e.name + e.message)) toast('This PDF is password protected and cannot be opened in this version.', 'err', 6000);
    else toast('Could not open PDF: ' + e.message, 'err', 6000);
  }
}
async function addSourcePages(srcIdx, at = S.pages.length) {
  const src = S.sources[srcIdx]; const list = [];
  for (let i = 0; i < src.js.numPages; i++) {
    const pg = await src.js.getPage(i + 1);
    const vp = pg.getViewport({ scale: 1, rotation: 0 });
    list.push({ id: nid(), src: srcIdx, index: i, rot: 0, baseRot: pg.rotate || 0, w: vp.width, h: vp.height, annots: [] });
  }
  S.pages.splice(at, 0, ...list); return list;
}
async function appendPdf(bytes, name, at) {
  const src = await loadPdfBytes(bytes, name); S.sources.push(src);
  const added = await addSourcePages(S.sources.length - 1, at ?? S.pages.length);
  return added;
}
async function loadFormFields(bytes) {
  S.formFields = [];
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = doc.getForm(); const pages = doc.getPages();
    const refIdx = new Map(pages.map((p, i) => [p.ref.toString(), i]));
    for (const f of form.getFields()) {
      const type = ftype(f); const name = f.getName();
      let value = '', options = null;
      try {
        if (type === 'PDFTextField') value = f.getText() || '';
        else if (type === 'PDFCheckBox') value = f.isChecked();
        else if (type === 'PDFDropdown') { options = f.getOptions(); value = (f.getSelected() || [])[0] || ''; }
        else if (type === 'PDFRadioGroup') { options = f.getOptions(); value = f.getSelected() || ''; }
        else continue;
      } catch { continue; }
      const widgets = f.acroField.getWidgets();
      widgets.forEach((w, wi) => {
        const r = w.getRectangle(); const pRef = w.P(); let pi = pRef ? refIdx.get(pRef.toString()) : undefined;
        if (pi === undefined) pi = pages.findIndex(p => (p.node.Annots()?.asArray() || []).some(a => a.toString() === (doc.context.getObjectRef?.(w.dict)?.toString())));
        if (pi === undefined || pi < 0) pi = 0;
        let opt = null;
        if (type === 'PDFRadioGroup' && options) opt = options[wi];
        S.formFields.push({ name, type, page: pi, rect: r, options, opt, multiline: type === 'PDFTextField' && f.isMultiline?.() });
      });
      S.formValues[name] = value;
    }
  } catch (e) { console.warn('form scan failed', e); }
}

// ------------------------------------------------------------------ rendering
const io = new IntersectionObserver(ents => ents.forEach(e => { if (e.isIntersecting) renderPage(e.target.dataset.id); }), { root: $('#stage'), rootMargin: '600px 0px' });
function viewportOf(pg, scale) {
  // returns pdf.js viewport (cached js page needed) — computed lazily
  return pg._js.getViewport({ scale, rotation: (pg.baseRot + pg.rot) % 360 });
}
async function ensureJs(pg) { if (!pg._js || pg._jsSrc !== pg.src + ':' + pg.index) { pg._js = await S.sources[pg.src].js.getPage(pg.index + 1); pg._jsSrc = pg.src + ':' + pg.index; } return pg._js; }
async function buildPages() {
  const wrap = $('#pages'); wrap.innerHTML = ''; io.disconnect();
  for (const pg of S.pages) {
    await ensureJs(pg);
    const vp = viewportOf(pg, S.zoom * PX);
    const el = h('div', { class: 'page', 'data-id': pg.id, style: { width: vp.width + 'px', height: vp.height + 'px' } },
      h('canvas', { class: 'pc' }), h('div', { class: 'textLayer' }),
      svgEl('svg', { class: 'ann' }), h('div', { class: 'forms' }), h('div', { class: 'interact' }),
      h('div', { class: 'pageno' }, `${S.pages.indexOf(pg) + 1}`));
    pg._el = el; pg._vp = vp; pg._rendered = null;
    wrap.append(el); io.observe(el);
    wireInteract(pg);
    drawAnnots(pg); drawForms(pg);
  }
  updateInteract(); renderThumbs(); updateStatus();
}
function relayout() {
  for (const pg of S.pages) {
    if (!pg._js) continue;
    const vp = viewportOf(pg, S.zoom * PX); pg._vp = vp;
    Object.assign(pg._el.style, { width: vp.width + 'px', height: vp.height + 'px' });
    pg._rendered = null; drawAnnots(pg); drawForms(pg);
  }
  // re-render visible pages
  const st = $('#stage').getBoundingClientRect();
  for (const pg of S.pages) { const r = pg._el.getBoundingClientRect(); if (r.bottom > st.top - 600 && r.top < st.bottom + 600) renderPage(pg.id); }
}
async function renderPage(id) {
  const pg = pageById(id); if (!pg) return;
  const key = S.zoom + ':' + pg.rot + ':' + pg.src + ':' + pg.index;
  if (pg._rendered === key) return; pg._rendered = key;
  await ensureJs(pg);
  const vp = pg._vp; const dpr = window.devicePixelRatio || 1;
  const cv = pg._el.querySelector('canvas.pc');
  const rvp = viewportOf(pg, S.zoom * PX * dpr);
  if (pg._task) { try { pg._task.cancel(); } catch {} }
  const off = document.createElement('canvas'); off.width = Math.floor(rvp.width); off.height = Math.floor(rvp.height);
  pg._task = pg._js.render({ canvasContext: off.getContext('2d'), viewport: rvp, annotationMode: pdfjsLib.AnnotationMode.ENABLE });
  try { await pg._task.promise; } catch (e) { if (e?.name !== 'RenderingCancelledException') console.warn(e); return; }
  if (pg._rendered !== key) return;
  cv.width = off.width; cv.height = off.height; cv.getContext('2d').drawImage(off, 0, 0);
  // text layer
  const tl = pg._el.querySelector('.textLayer'); tl.innerHTML = ''; tl.style.setProperty('--scale-factor', vp.scale);
  try {
    const layer = new pdfjsLib.TextLayer({ textContentSource: pg._js.streamTextContent(), container: tl, viewport: vp });
    await layer.render();
    applySearchHits(pg);
  } catch (e) { console.warn('text layer', e); }
}

// ------------------------------------------------------------------ SVG annotations
const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}, ...kids) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v); kids.forEach(k => k && e.append(k)); return e; }
function drawAnnots(pg) {
  if (!pg._el) return;
  const svg = pg._el.querySelector('svg.ann'); svg.innerHTML = '';
  const vp = pg._vp; svg.setAttribute('viewBox', `0 0 ${vp.width} ${vp.height}`);
  const g = svgEl('g', { transform: `matrix(${vp.transform.join(' ')})` }); svg.append(g);
  for (const a of pg.annots) {
    const el = annotSvg(a); if (!el) continue;
    el.classList.add('a'); if (a.type === 'note') el.classList.add('note'); el.dataset.ann = a.id;
    el.addEventListener('pointerdown', e => annotPointerDown(e, pg, a));
    el.addEventListener('dblclick', () => { if (a.type === 'text') editTextAnnot(pg, a); });
    el.addEventListener('contextmenu', e => { select(pg.id, a.id); contextMenu(e, [{ label: 'Duplicate', action: duplicateSelected }, { label: 'Delete', action: deleteSelected }, '-', { label: 'Bring to front', action: () => reorderAnn(1) }, { label: 'Send to back', action: () => reorderAnn(-1) }]); });
    g.append(el);
  }
  // selection
  if (S.sel && S.sel.pageId === pg.id) {
    const a = pg.annots.find(x => x.id === S.sel.annId);
    if (a) {
      const b = bbox(a), pad = 3 / (S.zoom * PX);
      g.append(svgEl('rect', { class: 'selbox', x: b.x - pad, y: b.y - pad, width: b.w + 2 * pad, height: b.h + 2 * pad }));
      if (RESIZABLE.includes(a.type)) {
        const hs = 8 / (S.zoom * PX);
        const hd = svgEl('rect', { class: 'handle', x: b.x + b.w - hs / 2, y: b.y - hs / 2, width: hs, height: hs });
        hd.addEventListener('pointerdown', e => resizePointerDown(e, pg, a));
        g.append(hd);
      }
    }
  }
}
const RESIZABLE = ['rect', 'ellipse', 'text', 'image', 'stamp', 'redact', 'field', 'hlarea'];
function flipText(x, y) { return `matrix(1 0 0 -1 ${x} ${y})`; }
function annotSvg(a) {
  const op = a.opacity ?? 1;
  switch (a.type) {
    case 'hl': {
      const g = svgEl('g', { opacity: a.kind === 'highlight' ? 1 : op });
      for (const r of a.rects) {
        if (a.kind === 'highlight') g.append(svgEl('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: a.color, 'fill-opacity': 0.4, style: 'mix-blend-mode:multiply' }));
        else { const yy = a.kind === 'underline' ? r.y + r.h * 0.08 : r.y + r.h * 0.45; g.append(svgEl('line', { x1: r.x, y1: yy, x2: r.x + r.w, y2: yy, stroke: a.color, 'stroke-width': Math.max(0.8, r.h * 0.08) })); g.append(svgEl('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: 'transparent' })); }
      }
      return g;
    }
    case 'hlarea': return svgEl('rect', { x: a.x, y: a.y, width: a.w, height: a.h, fill: a.color, 'fill-opacity': 0.4, style: 'mix-blend-mode:multiply' });
    case 'rect': return svgEl('rect', { x: a.x, y: a.y, width: a.w, height: a.h, fill: a.fill === 'none' ? 'transparent' : a.fill, stroke: a.color, 'stroke-width': a.sw, opacity: op });
    case 'ellipse': return svgEl('ellipse', { cx: a.x + a.w / 2, cy: a.y + a.h / 2, rx: a.w / 2, ry: a.h / 2, fill: a.fill === 'none' ? 'transparent' : a.fill, stroke: a.color, 'stroke-width': a.sw, opacity: op });
    case 'line': case 'arrow': {
      const g = svgEl('g', { opacity: op, stroke: a.color, 'stroke-width': a.sw, 'stroke-linecap': 'round', fill: 'none' });
      g.append(svgEl('line', { x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2 }));
      g.append(svgEl('line', { x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2, stroke: 'transparent', 'stroke-width': Math.max(8, a.sw * 3) }));
      if (a.type === 'arrow') arrowHead(a).forEach(([x1, y1, x2, y2]) => g.append(svgEl('line', { x1, y1, x2, y2 })));
      return g;
    }
    case 'ink': {
      const d = a.pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('');
      const g = svgEl('g', { opacity: op });
      g.append(svgEl('path', { d, fill: 'none', stroke: a.color, 'stroke-width': a.sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      g.append(svgEl('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': Math.max(8, a.sw * 3) }));
      return g;
    }
    case 'text': {
      const g = svgEl('g', {});
      if (a.bg) g.append(svgEl('rect', { x: a.x, y: a.y, width: a.w, height: a.h, fill: a.bg }));
      g.append(svgEl('rect', { x: a.x, y: a.y, width: a.w, height: a.h, fill: 'transparent' }));
      const t = svgEl('text', { transform: flipText(a.x + 2, a.y + a.h), fill: a.color, 'font-size': a.size, 'font-family': cssFont(a.font), 'font-weight': a.bold ? 700 : 400 });
      (a.text || '').split('\n').forEach((ln, i) => { const ts = svgEl('tspan', { x: 0, y: a.size * (0.85 + i * 1.2) }); ts.textContent = ln || ' '; t.append(ts); });
      g.append(t); return g;
    }
    case 'note': {
      const s = 18; const g = svgEl('g', {});
      g.append(svgEl('rect', { x: a.x, y: a.y, width: s, height: s, rx: 3, fill: a.color, stroke: '#00000055', 'stroke-width': 0.6 }));
      g.append(svgEl('path', { d: `M${a.x + 4} ${a.y + s - 6}h${s - 8}M${a.x + 4} ${a.y + s - 10}h${s - 8}M${a.x + 4} ${a.y + s - 14}h${s - 11}`, stroke: '#00000088', 'stroke-width': 1.2 }));
      return g;
    }
    case 'image': { const im = svgEl('image', { href: a.src, x: 0, y: 0, width: a.w, height: a.h, preserveAspectRatio: 'none', transform: flipText(a.x, a.y + a.h) }); return im; }
    case 'stamp': {
      const g = svgEl('g', { opacity: 0.9 });
      g.append(svgEl('rect', { x: a.x, y: a.y, width: a.w, height: a.h, rx: 6, fill: 'transparent', stroke: a.color, 'stroke-width': 2.5 }));
      const t = svgEl('text', { transform: flipText(a.x + a.w / 2, a.y + a.h / 2), fill: a.color, 'font-size': a.h * 0.45, 'font-family': 'Helvetica, Arial', 'font-weight': 700, 'text-anchor': 'middle', 'dominant-baseline': 'central' }); t.textContent = a.label;
      g.append(t); return g;
    }
    case 'redact': return svgEl('rect', { x: a.x, y: a.y, width: a.w, height: a.h, fill: '#000' });
    case 'field': {
      const g = svgEl('g', {});
      g.append(svgEl('rect', { x: a.x, y: a.y, width: a.w, height: a.h, fill: 'rgba(79,140,255,.15)', stroke: '#4f8cff', 'stroke-width': 1 }));
      const t = svgEl('text', { transform: flipText(a.x + 3, a.y + a.h / 2), fill: '#1d4ed8', 'font-size': Math.min(10, a.h * 0.6), 'dominant-baseline': 'central', 'font-family': 'Helvetica' }); t.textContent = a.ftype === 'checkbox' ? '☐' : a.name;
      g.append(t); return g;
    }
    case 'watermark': {
      const t = svgEl('text', { transform: `translate(${a.cx} ${a.cy}) rotate(${-a.angle}) scale(1 -1)`, fill: a.color, 'fill-opacity': a.opacity, 'font-size': a.size, 'font-family': 'Helvetica, Arial', 'font-weight': 700, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
      t.textContent = a.text; return t;
    }
  }
  return null;
}
function arrowHead(a) {
  const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1), L = Math.max(8, a.sw * 4), sp = 0.45;
  return [[a.x2, a.y2, a.x2 - L * Math.cos(ang - sp), a.y2 - L * Math.sin(ang - sp)], [a.x2, a.y2, a.x2 - L * Math.cos(ang + sp), a.y2 - L * Math.sin(ang + sp)]];
}
const cssFont = f => f === 'Times' ? 'Times New Roman, Times, serif' : f === 'Courier' ? 'Courier New, Courier, monospace' : 'Helvetica, Arial, sans-serif';
function bbox(a) {
  switch (a.type) {
    case 'hl': { const xs = a.rects.flatMap(r => [r.x, r.x + r.w]), ys = a.rects.flatMap(r => [r.y, r.y + r.h]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; }
    case 'line': case 'arrow': return { x: Math.min(a.x1, a.x2), y: Math.min(a.y1, a.y2), w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) };
    case 'ink': { const xs = a.pts.map(p => p[0]), ys = a.pts.map(p => p[1]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; }
    case 'note': return { x: a.x, y: a.y, w: 18, h: 18 };
    case 'watermark': return { x: a.cx - a.size * a.text.length * 0.3, y: a.cy - a.size * 0.6, w: a.size * a.text.length * 0.6, h: a.size * 1.2 };
    default: return { x: a.x, y: a.y, w: a.w, h: a.h };
  }
}
function moveAnn(a, dx, dy) {
  switch (a.type) {
    case 'hl': a.rects.forEach(r => { r.x += dx; r.y += dy; }); break;
    case 'line': case 'arrow': a.x1 += dx; a.x2 += dx; a.y1 += dy; a.y2 += dy; break;
    case 'ink': a.pts.forEach(p => { p[0] += dx; p[1] += dy; }); break;
    case 'watermark': a.cx += dx; a.cy += dy; break;
    default: a.x += dx; a.y += dy;
  }
}

// ------------------------------------------------------------------ forms overlay
function drawForms(pg) {
  if (!pg._el) return;
  const box = pg._el.querySelector('.forms'); box.innerHTML = '';
  if (pg.src !== 0) return;
  const vp = pg._vp;
  for (const f of S.formFields.filter(f => f.page === pg.index)) {
    const r = f.rect; const [x1, y1, x2, y2] = vp.convertToViewportRectangle([r.x, r.y, r.x + r.width, r.y + r.height]);
    const st = { left: Math.min(x1, x2) + 'px', top: Math.min(y1, y2) + 'px', width: Math.abs(x2 - x1) + 'px', height: Math.abs(y2 - y1) + 'px', fontSize: Math.max(8, Math.min(14, Math.abs(y2 - y1) * 0.65)) + 'px' };
    let el;
    if (f.type === 'PDFTextField') {
      el = f.multiline ? h('textarea', { style: st }) : h('input', { type: 'text', style: st }); el.value = S.formValues[f.name] || '';
      el.oninput = () => { S.formValues[f.name] = el.value; syncField(f.name, el); markDirty(); };
    } else if (f.type === 'PDFCheckBox') {
      el = h('input', { type: 'checkbox', style: { ...st, margin: 0 } }); el.checked = !!S.formValues[f.name];
      el.onchange = () => { S.formValues[f.name] = el.checked; syncField(f.name, el); markDirty(); };
    } else if (f.type === 'PDFDropdown') {
      el = h('select', { style: st }, h('option', { value: '' }, ''), ...f.options.map(o => h('option', { value: o, selected: o === S.formValues[f.name] }, o)));
      el.onchange = () => { S.formValues[f.name] = el.value; markDirty(); };
    } else if (f.type === 'PDFRadioGroup') {
      el = h('input', { type: 'radio', name: 'rg_' + f.name, style: { ...st, margin: 0 } }); el.checked = S.formValues[f.name] === f.opt;
      el.onchange = () => { if (el.checked) { S.formValues[f.name] = f.opt; markDirty(); } };
    }
    if (el) { el.dataset.field = f.name; el.title = f.name; box.append(el); }
  }
}
function syncField(name, src) {
  document.querySelectorAll(`.forms [data-field="${CSS.escape(name)}"]`).forEach(el => { if (el === src) return; if (el.type === 'checkbox') el.checked = src.checked; else el.value = src.value; });
}

// ------------------------------------------------------------------ interaction
function toPdf(pg, e) { const r = pg._el.getBoundingClientRect(); return pg._vp.convertToPdfPoint(e.clientX - r.left, e.clientY - r.top); }
function wireInteract(pg) {
  const layer = pg._el.querySelector('.interact');
  layer.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const t = S.tool; const [px, py] = toPdf(pg, e);
    if (S.pending) { placePending(pg, px, py); return; }
    if (t === 'zoom') { setZoom(e.altKey ? S.zoom / 1.25 : S.zoom * 1.25, e); return; }
    if (t === 'note') { const a = { id: nid(), type: 'note', x: px - 9, y: py - 9, color: S.style.hl, text: '', author: S.author, date: new Date().toISOString() }; pg.annots.push(a); commit('Add comment'); select(pg.id, a.id); setTool('select'); select(pg.id, a.id); setTimeout(() => $('#props textarea')?.focus(), 30); return; }
    if (t === 'text') { createTextAt(pg, px, py); return; }
    if (t === 'stamp') { const w = Math.max(90, S.stamp.length * 11), hh = 36; pg.annots.push({ id: nid(), type: 'stamp', x: px - w / 2, y: py - hh / 2, w, h: hh, label: S.stamp, color: S.style.color }); commit('Stamp'); return; }
    // drag-to-create tools
    if (!['ink', 'rect', 'ellipse', 'line', 'arrow', 'redact', 'field', 'highlight'].includes(t)) return;
    layer.setPointerCapture(e.pointerId);
    const s = S.style; let a;
    if (t === 'ink') a = { id: nid(), type: 'ink', pts: [[px, py]], color: s.color, sw: s.sw, opacity: s.opacity };
    else if (t === 'line' || t === 'arrow') a = { id: nid(), type: t, x1: px, y1: py, x2: px, y2: py, color: s.color, sw: s.sw, opacity: s.opacity };
    else if (t === 'highlight') a = { id: nid(), type: 'hlarea', x: px, y: py, w: 0, h: 0, color: s.hl };
    else if (t === 'field') a = { id: nid(), type: 'field', ftype: S.fieldType, name: (S.fieldType === 'checkbox' ? 'Check' : 'Text') + (countFields() + 1), x: px, y: py, w: 0, h: 0 };
    else a = { id: nid(), type: t, x: px, y: py, w: 0, h: 0, color: s.color, fill: s.fill, sw: s.sw, opacity: s.opacity };
    pg.annots.push(a);
    const ox = px, oy = py;
    const move = ev => {
      const [qx, qy] = toPdf(pg, ev);
      if (a.type === 'ink') a.pts.push([qx, qy]);
      else if (a.type === 'line' || a.type === 'arrow') { a.x2 = qx; a.y2 = qy; if (ev.shiftKey) snap45(a); }
      else { let w = qx - ox, hh = qy - oy; if (ev.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(hh)); w = Math.sign(w || 1) * m; hh = Math.sign(hh || 1) * m; } a.x = Math.min(ox, ox + w); a.y = Math.min(oy, oy + hh); a.w = Math.abs(w); a.h = Math.abs(hh); }
      drawAnnots(pg);
    };
    const up = () => {
      layer.removeEventListener('pointermove', move); layer.removeEventListener('pointerup', up);
      const b = bbox(a);
      if ((a.type === 'ink' && a.pts.length < 2) || (a.type !== 'ink' && b.w < 3 && b.h < 3)) {
        if (a.type === 'field') { a.w = a.ftype === 'checkbox' ? 14 : 150; a.h = a.ftype === 'checkbox' ? 14 : 20; a.y -= a.h; }
        else { pg.annots = pg.annots.filter(x => x !== a); drawAnnots(pg); return; }
      }
      if (a.type === 'ink') a.pts = simplify(a.pts, 0.4);
      commit('Add ' + a.type); if (t !== 'ink') select(pg.id, a.id);
    };
    layer.addEventListener('pointermove', move); layer.addEventListener('pointerup', up);
  });
}
const countFields = () => S.pages.reduce((n, p) => n + p.annots.filter(a => a.type === 'field').length, 0) + S.formFields.length;
function snap45(a) { const dx = a.x2 - a.x1, dy = a.y2 - a.y1, ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4, len = Math.hypot(dx, dy); a.x2 = a.x1 + Math.cos(ang) * len; a.y2 = a.y1 + Math.sin(ang) * len; }
function simplify(pts, tol) { if (pts.length < 3) return pts; const out = [pts[0]]; for (let i = 1; i < pts.length - 1; i++) { const l = out[out.length - 1]; if (Math.hypot(pts[i][0] - l[0], pts[i][1] - l[1]) > tol) out.push(pts[i]); } out.push(pts[pts.length - 1]); return out; }

function annotPointerDown(e, pg, a) {
  if (e.button !== 0) return;
  if (S.tool !== 'select' && !TEXT_TOOLS.includes(S.tool)) return;
  e.stopPropagation(); e.preventDefault();
  if (S.tool !== 'select') setTool('select');
  select(pg.id, a.id);
  const start = toPdf(pg, e); let last = start, moved = false;
  const target = e.currentTarget; target.setPointerCapture(e.pointerId);
  const move = ev => { const p = toPdf(pg, ev); moveAnn(a, p[0] - last[0], p[1] - last[1]); last = p; moved = true; drawAnnots(pg); };
  const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); if (moved) commit('Move'); };
  target.addEventListener('pointermove', move); target.addEventListener('pointerup', up);
}
function resizePointerDown(e, pg, a) {
  e.stopPropagation(); e.preventDefault();
  const top = a.y + a.h, left = a.x, ratio = a.w / (a.h || 1);
  const target = e.currentTarget; target.setPointerCapture(e.pointerId);
  const move = ev => {
    const [px, py] = toPdf(pg, ev);
    a.w = Math.max(6, px - left); a.h = Math.max(6, top - py);
    if (a.type === 'image' || ev.shiftKey) a.h = a.w / ratio;
    a.y = top - a.h; drawAnnots(pg);
  };
  const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); commit('Resize'); };
  target.addEventListener('pointermove', move); target.addEventListener('pointerup', up);
}

// text box creation & editing
function createTextAt(pg, px, py) {
  const s = S.style;
  const a = { id: nid(), type: 'text', x: px, y: py - s.fontSize * 1.4, w: 200, h: s.fontSize * 1.4, text: '', size: s.fontSize, color: s.textColor, font: s.font, bold: s.bold };
  pg.annots.push(a); drawAnnots(pg); editTextAnnot(pg, a, true);
}
function editTextAnnot(pg, a, isNew) {
  const vp = pg._vp; const [x1, y1, x2, y2] = vp.convertToViewportRectangle([a.x, a.y, a.x + a.w, a.y + a.h]);
  const sc = S.zoom * PX;
  const box = h('div', { class: 'editor-box', contenteditable: 'true', style: { left: Math.min(x1, x2) + 'px', top: Math.min(y1, y2) + 'px', minWidth: Math.abs(x2 - x1) + 'px', minHeight: Math.abs(y2 - y1) + 'px', fontSize: a.size * sc + 'px', fontFamily: cssFont(a.font), fontWeight: a.bold ? 700 : 400, color: a.color, background: a.bg || 'rgba(255,255,255,.92)' } });
  box.innerText = a.text || '';
  pg._el.append(box);
  const hidden = { ...a }; a._editing = true; const prevText = a.text; a.text = ''; drawAnnots(pg);
  setTimeout(() => { box.focus(); const r = document.createRange(); r.selectNodeContents(box); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); }, 10);
  const finish = (cancel) => {
    box.removeEventListener('blur', onBlur);
    const txt = cancel ? prevText : box.innerText.replace(/\n$/, '');
    const bw = box.offsetWidth / sc, bh = box.offsetHeight / sc; box.remove(); delete a._editing;
    if (!txt.trim() && isNew) { pg.annots = pg.annots.filter(x => x !== a); drawAnnots(pg); return; }
    a.text = txt; a.size = hidden.size;
    if (!a.bg) { a.w = Math.max(a.w, bw); }
    const lines = txt.split('\n').length; const needH = a.size * (lines * 1.2 + 0.25);
    if (needH > a.h) { a.y -= needH - a.h; a.h = needH; }
    drawAnnots(pg); if (txt !== prevText || isNew) commit(isNew ? 'Add text' : 'Edit text'); select(pg.id, a.id);
  };
  const onBlur = () => finish(false);
  box.addEventListener('blur', onBlur);
  box.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { box.removeEventListener('blur', onBlur); finish(true); } });
}

// edit existing PDF text: click a text span → whiteout + editable replacement
$('#stage').addEventListener('click', e => {
  if (S.tool !== 'edit') return;
  const span = e.target.closest('.textLayer span'); if (!span || !span.textContent.trim()) return;
  const pgEl = span.closest('.page'); const pg = pageById(pgEl.dataset.id);
  const pr = pgEl.getBoundingClientRect(), sr = span.getBoundingClientRect();
  const p1 = pg._vp.convertToPdfPoint(sr.left - pr.left, sr.top - pr.top), p2 = pg._vp.convertToPdfPoint(sr.right - pr.left, sr.bottom - pr.top);
  const x = Math.min(p1[0], p2[0]) - 1, y = Math.min(p1[1], p2[1]) - 1, w = Math.abs(p2[0] - p1[0]) + 2, hh = Math.abs(p2[1] - p1[1]) + 2;
  const size = Math.max(4, Math.round(hh * 0.82 * 10) / 10);
  const ff = (getComputedStyle(span).fontFamily || '').toLowerCase();
  const font = /serif|times|roman/.test(ff) && !/sans/.test(ff) ? 'Times' : /mono|courier/.test(ff) ? 'Courier' : 'Helvetica';
  const a = { id: nid(), type: 'text', x, y, w, h: hh, text: span.textContent, size, color: S.style.textColor, font, bold: false, bg: '#ffffff' };
  pg.annots.push(a); drawAnnots(pg); editTextAnnot(pg, a, false);
});

// text markup from selection
document.addEventListener('mouseup', () => {
  if (!['highlight', 'underline', 'strike'].includes(S.tool) || S.areaHighlight && S.tool === 'highlight') return;
  const sel = getSelection(); if (!sel.rangeCount || sel.isCollapsed) return;
  const byPage = new Map();
  for (let i = 0; i < sel.rangeCount; i++) {
    for (const cr of sel.getRangeAt(i).getClientRects()) {
      if (cr.width < 1 || cr.height < 1) continue;
      const el = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2)?.closest('.page') || [...document.querySelectorAll('.page')].find(p => { const r = p.getBoundingClientRect(); return cr.top >= r.top && cr.bottom <= r.bottom + 2 && cr.left >= r.left - 2; });
      if (!el) continue;
      const pg = pageById(el.dataset.id); const pr = el.getBoundingClientRect();
      const a = pg._vp.convertToPdfPoint(cr.left - pr.left, cr.top - pr.top), b = pg._vp.convertToPdfPoint(cr.right - pr.left, cr.bottom - pr.top);
      const r = { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
      if (!byPage.has(pg)) byPage.set(pg, []);
      byPage.get(pg).push(r);
    }
  }
  if (!byPage.size) return;
  for (const [pg, rects] of byPage) { pg.annots.push({ id: nid(), type: 'hl', kind: S.tool, rects: mergeRects(rects), color: S.style.hl, opacity: 1 }); drawAnnots(pg); }
  sel.removeAllRanges(); commit(S.tool[0].toUpperCase() + S.tool.slice(1));
});
function mergeRects(rs) {
  rs.sort((a, b) => b.y - a.y || a.x - b.x); const out = [];
  for (const r of rs) { const l = out[out.length - 1]; if (l && Math.abs(l.y - r.y) < r.h * 0.5 && r.x <= l.x + l.w + 2) { const nx = Math.min(l.x, r.x), nr = Math.max(l.x + l.w, r.x + r.w); l.x = nx; l.w = nr - nx; l.h = Math.max(l.h, r.h); } else out.push({ ...r }); }
  return out;
}

// hand / pan & wheel zoom
(function () {
  const st = $('#stage'); let pan = null, spaceDown = false, prevTool = null;
  st.addEventListener('pointerdown', e => { if (S.tool !== 'hand' && !(e.button === 1)) return; pan = { x: e.clientX, y: e.clientY, l: st.scrollLeft, t: st.scrollTop }; st.classList.add('panning'); e.preventDefault(); });
  window.addEventListener('pointermove', e => { if (!pan) return; st.scrollLeft = pan.l - (e.clientX - pan.x); st.scrollTop = pan.t - (e.clientY - pan.y); });
  window.addEventListener('pointerup', () => { pan = null; st.classList.remove('panning'); });
  st.addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); setZoom(S.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e); }, { passive: false });
  st.addEventListener('scroll', () => { updateStatus(); });
  window.addEventListener('keydown', e => { if (e.code === 'Space' && !spaceDown && !e.target.closest('input,textarea,[contenteditable="true"]')) { spaceDown = true; prevTool = S.tool; if (S.tool !== 'hand') setTool('hand'); e.preventDefault(); } });
  window.addEventListener('keyup', e => { if (e.code === 'Space' && spaceDown) { spaceDown = false; if (prevTool && prevTool !== 'hand') setTool(prevTool); } });
  st.addEventListener('pointerdown', e => { if (S.tool === 'select' && !e.target.closest('.a,.handle,.textLayer span,.forms *')) select(null); }, true);
})();

// ------------------------------------------------------------------ selection / editing helpers
function selAnn() { if (!S.sel) return null; const pg = pageById(S.sel.pageId); return pg?.annots.find(a => a.id === S.sel.annId) || null; }
function select(pageId, annId) {
  const prev = S.sel; S.sel = pageId ? { pageId, annId } : null;
  if (prev && prev.pageId !== pageId) { const pp = pageById(prev.pageId); pp && drawAnnots(pp); }
  if (pageId) { const a = selAnn(); if (a) syncStyleFrom(a); drawAnnots(pageById(pageId)); }
  renderProps(); renderOptions();
}
function syncStyleFrom(a) {
  if (a.color && a.type !== 'text' && a.type !== 'hl' && a.type !== 'note') S.style.color = a.color;
  if (a.fill) S.style.fill = a.fill; if (a.sw) S.style.sw = a.sw; if (a.opacity) S.style.opacity = a.opacity;
  if (a.type === 'text') { S.style.fontSize = a.size; S.style.font = a.font; S.style.bold = a.bold; S.style.textColor = a.color; }
}
function applyStyleToSelected() {
  const a = selAnn(); if (!a) return; const s = S.style;
  if (['rect', 'ellipse', 'line', 'arrow', 'ink'].includes(a.type)) { a.color = s.color; a.sw = s.sw; a.opacity = s.opacity; if ('fill' in a) a.fill = s.fill; }
  if (a.type === 'text') { a.size = s.fontSize; a.font = s.font; a.bold = s.bold; a.color = s.textColor; }
  if (a.type === 'hl' || a.type === 'hlarea' || a.type === 'note') a.color = s.hl;
  if (a.type === 'stamp') a.color = s.color;
  drawAnnots(pageById(S.sel.pageId)); commitDebounced('Style');
}
function deleteSelected() { const a = selAnn(); if (!a) return; const pg = pageById(S.sel.pageId); pg.annots = pg.annots.filter(x => x !== a); S.sel = null; drawAnnots(pg); commit('Delete'); renderProps(); }
function duplicateSelected() { const a = selAnn(); if (!a) return; const pg = pageById(S.sel.pageId); const c = JSON.parse(JSON.stringify(a)); c.id = nid(); moveAnn(c, 12, -12); pg.annots.push(c); commit('Duplicate'); select(pg.id, c.id); }
function reorderAnn(dir) { const a = selAnn(); if (!a) return; const pg = pageById(S.sel.pageId); pg.annots = pg.annots.filter(x => x !== a); dir > 0 ? pg.annots.push(a) : pg.annots.unshift(a); drawAnnots(pg); commit('Reorder'); }
UI.shortcut('delete', deleteSelected); UI.shortcut('backspace', deleteSelected); UI.shortcut('ctrl+j', duplicateSelected);
UI.shortcut('escape', () => { if (S.pending) { S.pending = null; updateInteract(); toast('Placement cancelled'); } select(null); setTool('select'); });
['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].forEach(k => {
  const fn = big => { const a = selAnn(); if (!a) return; const d = big ? 10 : 1; moveAnn(a, k === 'arrowleft' ? -d : k === 'arrowright' ? d : 0, k === 'arrowup' ? d : k === 'arrowdown' ? -d : 0); drawAnnots(pageById(S.sel.pageId)); commitDebounced('Nudge'); };
  UI.shortcut(k, () => fn(false)); UI.shortcut('shift+' + k, () => fn(true));
});

// ------------------------------------------------------------------ history
function snapshot() { return JSON.stringify({ pages: S.pages.map(({ id, src, index, rot, baseRot, w, h, annots }) => ({ id, src, index, rot, baseRot, w, h, annots })), formValues: S.formValues }); }
async function restore(snap) {
  const d = JSON.parse(snap); const old = new Map(S.pages.map(p => [p.id, p]));
  const structural = d.pages.length !== S.pages.length || d.pages.some((p, i) => { const o = S.pages[i]; return !o || o.id !== p.id || o.rot !== p.rot; });
  S.formValues = d.formValues || {};
  if (structural) { S.pages = d.pages; S.sel = null; await buildPages(); relayout(); }
  else { d.pages.forEach((p, i) => { S.pages[i].annots = p.annots; drawAnnots(S.pages[i]); drawForms(S.pages[i]); }); }
  S.sel = null; renderProps(); renderThumbs(); markDirty();
}
function commit(label) { hist.push(snapshot(), label); markDirty(); renderComments(); }
let cdT = null; function commitDebounced(l) { clearTimeout(cdT); cdT = setTimeout(() => commit(l), 400); }
async function undo() { const s = hist.undo(); if (s) await restore(s); }
async function redo() { const s = hist.redo(); if (s) await restore(s); }
UI.shortcut('ctrl+z', undo); UI.shortcut('ctrl+y', redo); UI.shortcut('ctrl+shift+z', redo);
function markDirty() { S.dirty = true; UI.setDocTitle((S.fileName || 'Untitled.pdf') + ' •', 'BTS PDF Pro'); }

// ------------------------------------------------------------------ zoom & navigation
function setZoom(z, ev) {
  if (!S.pages.length) { if (typeof z === 'string') S.zoomMode = z; return; }
  const st = $('#stage');
  const before = { sl: st.scrollLeft, stp: st.scrollTop, z: S.zoom };
  if (z === 'fit-width' || z === 'fit-page') {
    S.zoomMode = z; const pg = curPage() || S.pages[0]; const vp = viewportOf(pg, PX);
    const zw = (st.clientWidth - 60) / vp.width, zh = (st.clientHeight - 48) / vp.height;
    z = z === 'fit-width' ? zw : Math.min(zw, zh);
  } else S.zoomMode = null;
  S.zoom = clamp(z, 0.1, 8);
  const ratio = S.zoom / before.z;
  relayout();
  const r = st.getBoundingClientRect(); const ax = ev ? ev.clientX - r.left : st.clientWidth / 2, ay = ev ? ev.clientY - r.top : st.clientHeight / 2;
  st.scrollLeft = (before.sl + ax) * ratio - ax; st.scrollTop = (before.stp + ay) * ratio - ay;
  const zs = $('#zoomSel'); const opt = [...zs.options].find(o => o.value === (S.zoomMode || String(Math.round(S.zoom * 100) / 100)));
  if (opt) zs.value = opt.value; else { let o = zs.querySelector('option[data-custom]'); if (!o) { o = h('option', { 'data-custom': 1 }); zs.prepend(o); } o.value = S.zoom; o.textContent = Math.round(S.zoom * 100) + '%'; zs.value = o.value; }
  updateStatus();
}
$('#zoomSel').onchange = e => { const v = e.target.value; setZoom(v.startsWith('fit') ? v : +v); };
$('#zIn').onclick = () => setZoom(S.zoom * 1.2); $('#zOut').onclick = () => setZoom(S.zoom / 1.2);
UI.shortcut('ctrl+=', () => setZoom(S.zoom * 1.2)); UI.shortcut('ctrl++', () => setZoom(S.zoom * 1.2)); UI.shortcut('ctrl+shift++', () => setZoom(S.zoom * 1.2));
UI.shortcut('ctrl+-', () => setZoom(S.zoom / 1.2)); UI.shortcut('ctrl+0', () => setZoom(1)); UI.shortcut('ctrl+1', () => setZoom('fit-page')); UI.shortcut('ctrl+2', () => setZoom('fit-width'));
window.addEventListener('resize', () => { if (S.zoomMode) setZoom(S.zoomMode); });
function currentPageIdx() {
  const st = $('#stage'); const mid = st.getBoundingClientRect().top + st.clientHeight / 3;
  let best = 0; S.pages.forEach((p, i) => { if (p._el && p._el.getBoundingClientRect().top <= mid) best = i; }); return best;
}
const curPage = () => S.pages[currentPageIdx()];
function scrollToPage(i, yPdf) {
  const pg = S.pages[i]; if (!pg?._el) return;
  const st = $('#stage'); let off = pg._el.offsetTop - 16;
  if (yPdf != null) { const [, vy] = pg._vp.convertToViewportPoint(0, yPdf); off = pg._el.offsetTop + vy - 60; }
  st.scrollTo({ top: off, behavior: 'smooth' });
}
async function gotoPageDialog() { const v = await prompt('Go to page', `Page number (1–${S.pages.length})`, String(currentPageIdx() + 1), 'number'); if (v) scrollToPage(clamp(+v, 1, S.pages.length) - 1); }
UI.shortcut('ctrl+g', gotoPageDialog);
let lastStatusIdx = -1;
function updateStatus() {
  if (!S.pages.length) { $('#stPage').textContent = 'No document'; return; }
  const i = currentPageIdx(); $('#stPage').textContent = `Page ${i + 1} of ${S.pages.length}`;
  if (i !== lastStatusIdx) { lastStatusIdx = i; document.querySelectorAll('.thumb').forEach((t, k) => t.classList.toggle('active', k === i)); document.querySelectorAll('.thumb')[i]?.scrollIntoView({ block: 'nearest' }); }
}

// ------------------------------------------------------------------ left pane
$('#leftTabs').addEventListener('click', e => { const t = e.target.closest('.tab'); if (t) showLeft(t.dataset.t); });
function showLeft(tab, focus) {
  S.leftTab = tab; $('.mid').classList.remove('no-left');
  document.querySelectorAll('#leftTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.t === tab));
  const b = $('#lpBody'); b.innerHTML = '';
  if (tab === 'thumbs') renderThumbs();
  else if (tab === 'outline') renderOutline();
  else if (tab === 'comments') renderComments();
  else if (tab === 'search') renderSearch(focus);
}
UI.shortcut('ctrl+f', () => showLeft('search', true), { global: true });
const thumbIo = new IntersectionObserver(ents => ents.forEach(async e => { if (!e.isIntersecting) return; thumbIo.unobserve(e.target); const pg = pageById(e.target.dataset.id); if (pg) await drawThumb(pg, e.target.querySelector('canvas'), 140); }), { root: null });
async function drawThumb(pg, cv, maxW) {
  await ensureJs(pg); const vp1 = viewportOf(pg, 1); const sc = maxW / vp1.width; const vp = viewportOf(pg, sc * 2);
  cv.width = vp.width; cv.height = vp.height; cv.style.width = vp.width / 2 + 'px';
  try { await pg._js.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise; } catch {}
}
let dragThumb = null;
function renderThumbs() {
  if (S.leftTab !== 'thumbs') return;
  const b = $('#lpBody'); b.innerHTML = ''; thumbIo.disconnect();
  if (!S.pages.length) { b.append(h('div', { class: 'muted', style: { padding: '20px', textAlign: 'center' } }, 'Open a PDF to see pages')); return; }
  S.pages.forEach((pg, i) => {
    const t = h('div', { class: 'thumb', 'data-id': pg.id, draggable: 'true' }, h('div', { class: 'tc' }, h('canvas')), h('div', { class: 'n' }, String(i + 1)));
    t.onclick = () => scrollToPage(i);
    t.oncontextmenu = e => contextMenu(e, pageMenu([pg.id]));
    t.ondragstart = () => dragThumb = i; t.ondragover = e => { e.preventDefault(); t.classList.add('drag-over'); }; t.ondragleave = () => t.classList.remove('drag-over');
    t.ondrop = e => { e.preventDefault(); t.classList.remove('drag-over'); if (dragThumb != null && dragThumb !== i) movePages([S.pages[dragThumb].id], i); dragThumb = null; };
    b.append(t); thumbIo.observe(t);
  });
  lastStatusIdx = -1; updateStatus();
}
function pageMenu(ids) {
  const idx = S.pages.findIndex(p => p.id === ids[0]);
  return [
    { label: 'Rotate clockwise', action: () => rotatePages(ids, 90) }, { label: 'Rotate counter-clockwise', action: () => rotatePages(ids, -90) },
    '-', { label: 'Insert blank page after', action: () => insertBlank(idx + 1) }, { label: 'Insert pages from file after…', action: () => insertFromFile(idx + 1) },
    { label: 'Duplicate page', action: () => duplicatePages(ids) }, { label: 'Extract page…', action: () => extractPages(ids) },
    { label: 'Export page as PNG…', action: () => exportImages('png', ids) },
    '-', { label: ids.length > 1 ? `Delete ${ids.length} pages` : 'Delete page', action: () => deletePages(ids) },
  ];
}
async function renderOutline() {
  const b = $('#lpBody'); b.innerHTML = '';
  if (!S.sources[0]) return;
  const ol = await S.sources[0].js.getOutline();
  if (!ol?.length) { b.append(h('div', { class: 'muted', style: { padding: '16px' } }, 'This document has no bookmarks.')); return; }
  const walk = (items, depth) => items.forEach(it => {
    b.append(h('div', { class: 'ol-item', style: { paddingLeft: 8 + depth * 14 + 'px' }, onclick: () => gotoDest(it.dest) }, it.title));
    if (it.items?.length) walk(it.items, depth + 1);
  });
  walk(ol, 0);
}
async function gotoDest(dest) {
  try {
    const js = S.sources[0].js; if (typeof dest === 'string') dest = await js.getDestination(dest); if (!dest) return;
    const idx = await js.getPageIndex(dest[0]); const mi = S.pages.findIndex(p => p.src === 0 && p.index === idx);
    if (mi >= 0) scrollToPage(mi, dest[1]?.name === 'XYZ' ? dest[3] : null);
  } catch (e) { console.warn(e); }
}
function renderComments() {
  if (S.leftTab !== 'comments') return;
  const b = $('#lpBody'); b.innerHTML = '';
  const list = S.pages.flatMap((pg, i) => pg.annots.filter(a => !['watermark'].includes(a.type)).map(a => ({ pg, i, a })));
  if (!list.length) { b.append(h('div', { class: 'muted', style: { padding: '16px' } }, 'No comments or markups yet.')); return; }
  const label = a => ({ hl: a.kind === 'highlight' ? 'Highlight' : a.kind === 'underline' ? 'Underline' : 'Strikethrough', hlarea: 'Area highlight', note: 'Comment', text: 'Text', ink: 'Drawing', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow', image: 'Image', stamp: 'Stamp', redact: 'Redaction', field: 'Form field' }[a.type] || a.type);
  list.forEach(({ pg, i, a }) => b.append(h('div', { class: 'cmt', style: { '--c': a.color || '#888' }, onclick: () => { scrollToPage(i, bbox(a).y + bbox(a).h); setTool('select'); select(pg.id, a.id); } },
    h('div', { class: 'meta' }, `${label(a)} · Page ${i + 1}${a.author ? ' · ' + a.author : ''}`),
    h('div', {}, a.text || a.label || a.name || ''))));
}
function renderSearch(focus) {
  const b = $('#lpBody'); b.innerHTML = '';
  const inp = h('input', { type: 'text', placeholder: 'Find in document…', value: S.search.q, style: { width: '100%', marginBottom: '8px' } });
  const info = h('div', { class: 'muted', style: { fontSize: '11.5px', margin: '0 2px 8px' } });
  const res = h('div');
  const nav = h('div', { class: 'row', style: { marginBottom: '8px' } }, h('button', { class: 'btn sm', onclick: () => stepHit(-1) }, '‹ Prev'), h('button', { class: 'btn sm', onclick: () => stepHit(1) }, 'Next ›'));
  b.append(inp, nav, info, res);
  let t = null; inp.oninput = () => { clearTimeout(t); t = setTimeout(() => runSearch(inp.value, info, res), 250); };
  inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); stepHit(e.shiftKey ? -1 : 1); } };
  if (S.search.q) runSearch(S.search.q, info, res);
  if (focus) setTimeout(() => { inp.focus(); inp.select(); }, 20);
}
async function pageText(pg) {
  const k = pg.src + ':' + pg.index; if (S.textCache[k]) return S.textCache[k];
  await ensureJs(pg); const tc = await pg._js.getTextContent(); const str = tc.items.map(i => i.str + (i.hasEOL ? '\n' : '')).join('');
  return (S.textCache[k] = { items: tc.items, str });
}
async function runSearch(q, info, res) {
  S.search = { q, hits: [], cur: -1 }; res.innerHTML = ''; document.querySelectorAll('.textLayer .hit').forEach(s => s.classList.remove('hit', 'cur'));
  if (!q.trim()) { info.textContent = ''; return; }
  const ql = q.toLowerCase();
  for (let i = 0; i < S.pages.length; i++) {
    const { str } = await pageText(S.pages[i]); const sl = str.toLowerCase(); let pos = sl.indexOf(ql);
    while (pos >= 0) {
      S.search.hits.push({ i, pos });
      const snip = str.slice(Math.max(0, pos - 30), pos + q.length + 40).replace(/\s+/g, ' ');
      const k = S.search.hits.length - 1;
      const el = h('div', { class: 'sr', onclick: () => { S.search.cur = k; focusHit(); } }); el.innerHTML = `<div class="muted" style="font-size:10.5px">Page ${i + 1}</div>` + esc(snip).replace(new RegExp(escRe(esc(q)), 'ig'), m => `<b>${m}</b>`);
      res.append(el); pos = sl.indexOf(ql, pos + ql.length);
      if (S.search.hits.length > 2000) break;
    }
  }
  info.textContent = S.search.hits.length ? `${S.search.hits.length} result${S.search.hits.length > 1 ? 's' : ''}` : 'No results';
  S.pages.forEach(applySearchHits);
}
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function applySearchHits(pg) {
  if (!pg._el) return; const q = S.search.q.toLowerCase();
  pg._el.querySelectorAll('.textLayer span').forEach(s => s.classList.toggle('hit', !!q && s.textContent.toLowerCase().includes(q)));
}
function stepHit(d) { if (!S.search.hits.length) return; S.search.cur = (S.search.cur + d + S.search.hits.length) % S.search.hits.length; focusHit(); }
function focusHit() {
  const hit = S.search.hits[S.search.cur]; if (!hit) return; scrollToPage(hit.i);
  setTimeout(() => { const pg = S.pages[hit.i]; const spans = [...(pg._el?.querySelectorAll('.textLayer span.hit') || [])]; document.querySelectorAll('.hit.cur').forEach(x => x.classList.remove('cur')); const s = spans[0]; if (s) { s.classList.add('cur'); s.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }, 450);
  document.querySelectorAll('#lpBody .sr').forEach((el, k) => el.style.background = k === S.search.cur ? 'var(--bg-4)' : '');
}

// ------------------------------------------------------------------ page operations
async function rotatePages(ids, d) { if (!ids.length) return; ids.forEach(id => { const p = pageById(id); p.rot = ((p.rot + d) % 360 + 360) % 360; }); commit('Rotate'); await refreshAfterPageOp(); }
async function deletePages(ids) {
  if (ids.length >= S.pages.length) return toast('A document must keep at least one page.', 'err');
  S.pages = S.pages.filter(p => !ids.includes(p.id)); S.ogSel.clear(); commit('Delete pages'); await refreshAfterPageOp();
}
async function movePages(ids, to) {
  const moving = S.pages.filter(p => ids.includes(p.id)); const rest = S.pages.filter(p => !ids.includes(p.id));
  const target = S.pages[to]; let at = target ? rest.indexOf(target) : rest.length; if (at < 0) at = rest.length;
  const fromIdx = S.pages.indexOf(moving[0]); if (fromIdx < to) at++;
  rest.splice(Math.min(at, rest.length), 0, ...moving); S.pages = rest; commit('Move pages'); await refreshAfterPageOp();
}
async function duplicatePages(ids) {
  ids.slice().reverse().forEach(id => { const p = pageById(id); const c = { ...p, id: nid(), annots: JSON.parse(JSON.stringify(p.annots)).map(a => ({ ...a, id: nid() })), _el: null, _js: null }; S.pages.splice(S.pages.indexOf(p) + 1, 0, c); });
  commit('Duplicate pages'); await refreshAfterPageOp();
}
async function insertBlank(at) {
  if (!S.pages.length) return newBlankDoc();
  const ref = S.pages[Math.max(0, at - 1)] || S.pages[0];
  const d = await PDFDocument.create(); d.addPage([ref.w || 595.28, ref.h || 841.89]);
  await appendPdf(new Uint8Array(await d.save()), 'Blank', at); commit('Insert blank page'); await refreshAfterPageOp(); scrollToPage(at);
}
async function newBlankDoc() { const d = await PDFDocument.create(); d.addPage([595.28, 841.89]); await openDoc(new Uint8Array(await d.save()), 'Untitled.pdf', null); }
async function insertFromFile(at) {
  const fs = await bts.fs.open({ multi: true, filters: [{ name: 'PDF & images', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }] }); if (!fs) return;
  if (!S.pages.length) return openFiles(fs);
  let pos = at;
  for (const f of fs) {
    const bytes = /\.pdf$/i.test(f.name) ? new Uint8Array(f.data) : new Uint8Array(await imagesToPdf([f]));
    const added = await appendPdf(bytes, f.name, pos); pos += added.length;
  }
  commit('Insert pages'); await refreshAfterPageOp(); toast(`Inserted ${pos - at} page(s)`, 'ok');
}
async function refreshAfterPageOp() { await buildPages(); relayout(); if (S.organizer) renderOrganizer(); }

async function combineFiles() {
  const fs = await bts.fs.open({ multi: true, filters: [{ name: 'PDF & images', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }] }); if (!fs) return;
  // let user order them
  const list = fs.slice(); const ul = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '420px' } });
  const draw = () => { ul.innerHTML = ''; list.forEach((f, i) => ul.append(h('div', { class: 'row', style: { background: 'var(--bg-3)', padding: '6px 10px', borderRadius: '6px' } }, h('span', { class: 'grow' }, `${i + 1}. ${f.name}`),
    h('button', { class: 'btn sm ghost', onclick: () => { if (i) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; draw(); } } }, '↑'),
    h('button', { class: 'btn sm ghost', onclick: () => { if (i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; draw(); } } }, '↓'),
    h('button', { class: 'btn sm ghost', onclick: () => { list.splice(i, 1); draw(); } }, '✕')))); };
  draw();
  const ok = await modal({ title: 'Combine files', body: h('div', {}, h('p', { style: { margin: '0 0 10px' } }, S.pages.length ? 'These files will be appended to the current document in this order:' : 'Files will be combined in this order:'), ul), buttons: [{ label: 'Cancel', value: false }, { label: 'Combine', primary: true, value: true }] });
  if (!ok || !list.length) return;
  if (!S.pages.length) { await openFiles(list.filter(f => /\.pdf$/i.test(f.name)).length ? list : list); if (list.length > 1 && /\.pdf$/i.test(list[0].name)) {} return; }
  for (const f of list) { const bytes = /\.pdf$/i.test(f.name) ? new Uint8Array(f.data) : new Uint8Array(await imagesToPdf([f])); await appendPdf(bytes, f.name); }
  commit('Combine files'); await refreshAfterPageOp(); toast('Files combined', 'ok');
}
async function createFromImages() {
  const fs = await bts.fs.open({ multi: true, filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }] }); if (!fs) return;
  const bytes = await imagesToPdf(fs); await openDoc(new Uint8Array(bytes), 'Images.pdf', null); markDirty();
}
async function imagesToPdf(files) {
  const d = await PDFDocument.create();
  for (const f of files) {
    const u8 = new Uint8Array(f.data); let img;
    if (/\.jpe?g$/i.test(f.name)) img = await d.embedJpg(u8);
    else if (/\.png$/i.test(f.name)) img = await d.embedPng(u8);
    else { const png = await toPngBytes(u8, f.name); img = await d.embedPng(png); }
    const p = d.addPage([img.width * 0.75, img.height * 0.75]); p.drawImage(img, { x: 0, y: 0, width: img.width * 0.75, height: img.height * 0.75 });
  }
  return d.save();
}
async function toPngBytes(u8, name) {
  const blob = new Blob([u8]); const bmp = await createImageBitmap(blob); const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0);
  return UI.blobToU8(await new Promise(r => c.toBlob(r, 'image/png')));
}

async function extractDialog() {
  const v = await prompt('Extract pages', `Pages to extract (e.g. 1-3, 5) — 1 to ${S.pages.length}`, String(currentPageIdx() + 1)); if (!v) return;
  const idx = parseRange(v, S.pages.length); if (!idx.length) return toast('No valid pages', 'err');
  extractPages(idx.map(i => S.pages[i].id));
}
function parseRange(s, n) { const out = []; s.split(/[,\s]+/).forEach(part => { const m = part.match(/^(\d+)(?:-(\d+))?$/); if (!m) return; let a = +m[1], b = m[2] ? +m[2] : a; if (a > b) [a, b] = [b, a]; for (let i = a; i <= b; i++) if (i >= 1 && i <= n && !out.includes(i - 1)) out.push(i - 1); }); return out; }
async function extractPages(ids) {
  const pages = ids.map(pageById); const bytes = await buildPdf({ pages });
  const base = (S.fileName || 'document.pdf').replace(/\.pdf$/i, '');
  const p = await bts.fs.saveAs({ data: bytes, defaultPath: `${base}-extracted.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] }); if (p) toast('Pages extracted to ' + p, 'ok');
}
async function splitDialog() {
  const v = await form({ title: 'Split document', fields: [
    { key: 'mode', label: 'Split by', type: 'select', value: 'every', options: [{ value: 'every', label: 'Number of pages per file' }, { value: 'ranges', label: 'Custom page ranges' }] },
    { key: 'n', label: 'Pages per file', type: 'number', value: 1, min: 1 },
    { key: 'ranges', label: 'Ranges, separated by ; (e.g. 1-3; 4-6; 7)', type: 'text', value: '' }], ok: 'Split' });
  if (!v) return;
  let groups = [];
  if (v.mode === 'every') { const n = Math.max(1, +v.n || 1); for (let i = 0; i < S.pages.length; i += n) groups.push(S.pages.slice(i, i + n)); }
  else groups = v.ranges.split(';').map(r => parseRange(r, S.pages.length).map(i => S.pages[i])).filter(g => g.length);
  if (!groups.length) return toast('Nothing to split', 'err');
  const base = (S.fileName || 'document.pdf').replace(/\.pdf$/i, '');
  const first = await bts.fs.pickSavePath({ defaultPath: `${base}-part1.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] }); if (!first) return;
  const stem = first.replace(/(-part)?\d*\.pdf$/i, '');
  for (let i = 0; i < groups.length; i++) await bts.fs.write({ path: `${stem}-part${i + 1}.pdf`, data: await buildPdf({ pages: groups[i] }) });
  toast(`Created ${groups.length} files`, 'ok');
}

// organizer view
function toggleOrganizer(on) {
  S.organizer = on ?? !S.organizer;
  $('#organizer').classList.toggle('hidden', !S.organizer); $('#pages').classList.toggle('hidden', S.organizer);
  if (S.organizer) renderOrganizer();
}
UI.shortcut('ctrl+shift+o', () => toggleOrganizer());
let ogDrag = null;
function renderOrganizer() {
  const o = $('#organizer'); o.innerHTML = '';
  const sel = () => [...S.ogSel].filter(id => pageById(id));
  const btn = (ic, l, fn) => h('button', { class: 'btn sm', html: icon(ic) + l, onclick: fn });
  o.append(h('div', { class: 'og-head' },
    h('h3', { style: { margin: '0 14px 0 0', fontWeight: 600 } }, 'Organize pages'),
    btn('rotateL', 'Rotate left', () => rotatePages(sel(), -90)), btn('rotate', 'Rotate right', () => rotatePages(sel(), 90)),
    btn('trash', 'Delete', () => deletePages(sel())), btn('copy', 'Duplicate', () => duplicatePages(sel())), btn('export', 'Extract', () => sel().length && extractPages(sel())),
    btn('plus', 'Blank page', () => insertBlank(S.pages.length)), btn('folder', 'Insert from file', () => insertFromFile(S.pages.length)), btn('split', 'Split', splitDialog),
    h('span', { class: 'grow' }), h('span', { class: 'muted' }, `${S.ogSel.size} selected`),
    h('button', { class: 'btn sm primary', onclick: () => toggleOrganizer(false) }, 'Close')));
  const grid = h('div', { class: 'og-grid' }); o.append(grid);
  S.pages.forEach((pg, i) => {
    const cv = h('canvas');
    const it = h('div', { class: 'og-item' + (S.ogSel.has(pg.id) ? ' sel' : ''), draggable: 'true' }, h('div', { class: 'tc' }, cv), h('div', { class: 'n' }, String(i + 1)),
      h('div', { class: 'tools' },
        h('button', { class: 'icon-btn', html: icon('rotateL'), onclick: e => { e.stopPropagation(); rotatePages([pg.id], -90); } }),
        h('button', { class: 'icon-btn', html: icon('rotate'), onclick: e => { e.stopPropagation(); rotatePages([pg.id], 90); } }),
        h('button', { class: 'icon-btn', html: icon('trash'), onclick: e => { e.stopPropagation(); deletePages([pg.id]); } })));
    it.onclick = e => {
      if (e.shiftKey && S.ogSel.size) { const last = S.pages.findIndex(p => p.id === [...S.ogSel].pop()); const [a, b] = [Math.min(last, i), Math.max(last, i)]; for (let k = a; k <= b; k++) S.ogSel.add(S.pages[k].id); }
      else if (e.ctrlKey) S.ogSel.has(pg.id) ? S.ogSel.delete(pg.id) : S.ogSel.add(pg.id);
      else { S.ogSel.clear(); S.ogSel.add(pg.id); }
      renderOrganizer();
    };
    it.ondblclick = () => { toggleOrganizer(false); scrollToPage(i); };
    it.oncontextmenu = e => { if (!S.ogSel.has(pg.id)) { S.ogSel.clear(); S.ogSel.add(pg.id); } contextMenu(e, pageMenu(sel())); };
    it.ondragstart = () => { ogDrag = S.ogSel.has(pg.id) ? sel() : [pg.id]; };
    it.ondragover = e => { e.preventDefault(); it.classList.add('drag-over'); }; it.ondragleave = () => it.classList.remove('drag-over');
    it.ondrop = e => { e.preventDefault(); it.classList.remove('drag-over'); if (ogDrag && !ogDrag.includes(pg.id)) movePages(ogDrag, i); ogDrag = null; };
    grid.append(it);
    drawThumb(pg, cv, 150);
  });
}
UI.shortcut('ctrl+a', () => { if (S.organizer) { S.pages.forEach(p => S.ogSel.add(p.id)); renderOrganizer(); } });

// ------------------------------------------------------------------ insert image / signature
async function addImage() {
  if (!S.pages.length) return toast('Open a PDF first');
  const fs = await bts.fs.open({ filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }] }); if (!fs) return;
  const png = await toPngBytes(new Uint8Array(fs[0].data)); const url = await u8ToDataUrl(png, 'image/png');
  const im = await loadImg(url); const w = Math.min(240, im.width * 0.75);
  startPlacement({ type: 'image', src: url, w, h: w * im.height / im.width }, 'Click on a page to place the image');
}
function startPlacement(p, msg) { S.pending = p; S.tool = 'select'; tb.querySelectorAll('[data-tool]').forEach(b => b.classList.remove('active')); $('#stage').className = 'stage tool-draw'; updateInteract(); toast(msg); }
function placePending(pg, px, py) { const p = S.pending; S.pending = null; const a = { id: nid(), type: 'image', src: p.src, x: px - p.w / 2, y: py - p.h / 2, w: p.w, h: p.h }; pg.annots.push(a); commit(p.label || 'Add image'); setTool('select'); select(pg.id, a.id); }
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
async function u8ToDataUrl(u8, mime) { return new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(new Blob([u8], { type: mime })); }); }

const SAVED_SIG = 'bts.signatures';
async function signDialog() {
  if (!S.pages.length) return toast('Open a PDF first');
  const saved = JSON.parse(localStorage.getItem(SAVED_SIG) || '[]');
  let mode = 'draw'; const body = h('div', { style: { width: '520px' } });
  const tabs = h('div', { class: 'tabs', style: { padding: 0, marginBottom: '12px' } });
  const area = h('div');
  const colorSel = h('select', {}, h('option', { value: '#111111' }, 'Black'), h('option', { value: '#1d3fbb' }, 'Blue'), h('option', { value: '#b91c1c' }, 'Red'));
  let pad, ctx, typed, fontSel, upl = null, drawn = false;
  const draw = () => {
    area.innerHTML = '';
    tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.m === mode));
    if (mode === 'draw') {
      pad = h('canvas', { class: 'sig-pad', width: 1040, height: 360, style: { width: '520px', height: '180px' } }); ctx = pad.getContext('2d'); drawn = false;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 5;
      let last = null;
      pad.onpointerdown = e => { pad.setPointerCapture(e.pointerId); last = [e.offsetX * 2, e.offsetY * 2]; };
      pad.onpointermove = e => { if (!last) return; ctx.strokeStyle = colorSel.value; const p = [e.offsetX * 2, e.offsetY * 2]; ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...p); ctx.stroke(); last = p; drawn = true; };
      pad.onpointerup = () => last = null;
      area.append(pad, h('div', { class: 'row', style: { marginTop: '8px' } }, h('span', { class: 'muted grow' }, 'Draw your signature above'), colorSel, h('button', { class: 'btn sm', onclick: () => { ctx.clearRect(0, 0, pad.width, pad.height); drawn = false; } }, 'Clear')));
    } else if (mode === 'type') {
      typed = h('input', { type: 'text', value: S.author, style: { width: '100%', fontSize: '16px', height: '36px' } });
      fontSel = h('select', {}, ...['Segoe Script', 'Brush Script MT', 'Lucida Handwriting', 'Ink Free', 'cursive'].map(f => h('option', { value: f }, f)));
      const prev = h('div', { style: { background: '#fff', color: '#111', borderRadius: '8px', height: '110px', display: 'grid', placeItems: 'center', fontSize: '44px', marginTop: '10px' } });
      const up = () => { prev.textContent = typed.value; prev.style.fontFamily = `"${fontSel.value}", cursive`; prev.style.color = colorSel.value; };
      typed.oninput = up; fontSel.onchange = up; colorSel.onchange = up; up();
      area.append(typed, h('div', { class: 'row', style: { marginTop: '8px' } }, fontSel, colorSel), prev);
    } else if (mode === 'upload') {
      const pv = h('div', { style: { background: '#fff', borderRadius: '8px', height: '160px', display: 'grid', placeItems: 'center', color: '#666' } }, 'No image chosen');
      area.append(h('button', { class: 'btn', onclick: async () => { const f = await bts.fs.open({ filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }] }); if (!f) return; upl = await u8ToDataUrl(await toPngBytes(new Uint8Array(f[0].data)), 'image/png'); pv.innerHTML = ''; pv.append(h('img', { src: upl, style: { maxHeight: '150px', maxWidth: '100%' } })); } }, 'Choose image…'), h('div', { style: { height: '8px' } }), pv);
    } else {
      if (!saved.length) area.append(h('div', { class: 'muted' }, 'No saved signatures yet.'));
      const g = h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } });
      saved.forEach((s, i) => g.append(h('div', { style: { background: '#fff', borderRadius: '8px', padding: '8px', cursor: 'pointer', position: 'relative' }, onclick: () => { close(s); } }, h('img', { src: s, style: { width: '100%', height: '70px', objectFit: 'contain' } }),
        h('button', { class: 'btn sm', style: { position: 'absolute', top: '4px', right: '4px' }, onclick: e => { e.stopPropagation(); saved.splice(i, 1); localStorage.setItem(SAVED_SIG, JSON.stringify(saved)); draw(); } }, '✕'))));
      area.append(g);
    }
  };
  [['draw', 'Draw'], ['type', 'Type'], ['upload', 'Image'], ['saved', 'Saved']].forEach(([m, l]) => tabs.append(h('div', { class: 'tab', 'data-m': m, onclick: () => { mode = m; draw(); } }, l)));
  const saveCb = h('input', { type: 'checkbox', checked: true });
  body.append(tabs, area, h('label', { class: 'row', style: { marginTop: '12px', color: 'var(--tx-2)' } }, saveCb, 'Save signature for later'));
  let close = () => {};
  const resultP = new Promise(res => close = res);
  draw();
  const btnRes = modal({ title: 'Fill & Sign — create signature', body, buttons: [{ label: 'Cancel', value: null }, { label: 'Place signature', primary: true, value: 'ok' }] });
  const r = await Promise.race([btnRes, resultP]);
  document.querySelector('.modal-back')?.remove();
  let url = null;
  if (typeof r === 'string' && r.startsWith('data:')) url = r;
  else if (r === 'ok') {
    if (mode === 'draw') { if (!drawn) return toast('Draw a signature first', 'err'); url = trimCanvas(pad); }
    else if (mode === 'type') { const c = document.createElement('canvas'); c.width = 1200; c.height = 300; const x = c.getContext('2d'); x.font = `120px "${fontSel.value}", cursive`; x.fillStyle = colorSel.value; x.textBaseline = 'middle'; x.fillText(typed.value || ' ', 20, 150); url = trimCanvas(c); }
    else if (mode === 'upload') url = upl;
    if (url && saveCb.checked && mode !== 'saved') { saved.unshift(url); localStorage.setItem(SAVED_SIG, JSON.stringify(saved.slice(0, 6))); }
  }
  if (!url) return;
  const im = await loadImg(url); const w = 150;
  startPlacement({ type: 'image', src: url, w, h: w * im.height / im.width, label: 'Sign' }, 'Click where you want to sign');
}
function trimCanvas(c) {
  const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, c.height).data; let t = c.height, l = c.width, r = 0, b = 0;
  for (let y = 0; y < c.height; y++) for (let xx = 0; xx < c.width; xx++) if (d[(y * c.width + xx) * 4 + 3] > 10) { if (y < t) t = y; if (y > b) b = y; if (xx < l) l = xx; if (xx > r) r = xx; }
  if (r <= l) return c.toDataURL();
  const o = document.createElement('canvas'); o.width = r - l + 20; o.height = b - t + 20; o.getContext('2d').drawImage(c, l - 10, t - 10, o.width, o.height, 0, 0, o.width, o.height); return o.toDataURL('image/png');
}

// ------------------------------------------------------------------ watermark / page numbers / clear
async function watermarkDialog() {
  if (!S.pages.length) return;
  const v = await form({ title: 'Add watermark', fields: [
    { key: 'text', label: 'Text', value: 'CONFIDENTIAL' }, { key: 'size', label: 'Font size', type: 'range', min: 12, max: 160, value: 64 },
    { key: 'opacity', label: 'Opacity %', type: 'range', min: 5, max: 100, value: 18 }, { key: 'angle', label: 'Rotation°', type: 'range', min: -90, max: 90, value: 45 },
    { key: 'color', label: 'Color', type: 'color', value: '#ff0000' },
    { key: 'pages', label: 'Pages', type: 'select', value: 'all', options: [{ value: 'all', label: 'All pages' }, { value: 'cur', label: 'Current page' }] }], ok: 'Apply' });
  if (!v || !v.text) return;
  const pages = v.pages === 'all' ? S.pages : [curPage()];
  pages.forEach(pg => { const b = pageBox(pg); pg.annots.unshift({ id: nid(), type: 'watermark', text: v.text, size: +v.size, opacity: +v.opacity / 100, angle: +v.angle, color: v.color, cx: b.x + b.w / 2, cy: b.y + b.h / 2 }); drawAnnots(pg); });
  commit('Watermark'); toast('Watermark added — select it to move or delete.', 'ok');
}
function pageBox(pg) { const v = pg._js.view; return { x: v[0], y: v[1], w: v[2] - v[0], h: v[3] - v[1] }; }
async function pageNumbersDialog() {
  if (!S.pages.length) return;
  const v = await form({ title: 'Header & footer', fields: [
    { key: 'fmt', label: 'Text ({n} = page, {total} = total pages)', value: 'Page {n} of {total}' },
    { key: 'pos', label: 'Position', type: 'select', value: 'bc', options: [{ value: 'bc', label: 'Bottom center' }, { value: 'br', label: 'Bottom right' }, { value: 'bl', label: 'Bottom left' }, { value: 'tc', label: 'Top center' }, { value: 'tr', label: 'Top right' }, { value: 'tl', label: 'Top left' }] },
    { key: 'size', label: 'Font size', type: 'number', value: 10 }, { key: 'start', label: 'Start numbering at', type: 'number', value: 1 }], ok: 'Apply' });
  if (!v) return;
  const total = S.pages.length + (+v.start - 1);
  S.pages.forEach((pg, i) => {
    const b = pageBox(pg); const txt = v.fmt.replace('{n}', i + (+v.start)).replace('{total}', total); const sz = +v.size || 10;
    const w = Math.max(40, txt.length * sz * 0.55), hh = sz * 1.5, m = 24;
    const x = v.pos[1] === 'c' ? b.x + b.w / 2 - w / 2 : v.pos[1] === 'r' ? b.x + b.w - m - w : b.x + m;
    const y = v.pos[0] === 'b' ? b.y + m * 0.6 : b.y + b.h - m * 0.6 - hh;
    pg.annots.push({ id: nid(), type: 'text', x, y, w, h: hh, text: txt, size: sz, color: '#333333', font: 'Helvetica', bold: false }); drawAnnots(pg);
  });
  commit('Page numbers'); toast('Page numbers added', 'ok');
}
async function clearAnnots() { if (!(await confirm('Remove annotations', 'Remove all annotations added in this session from every page?', 'Remove'))) return; S.pages.forEach(p => { p.annots = []; drawAnnots(p); }); commit('Clear annotations'); }

// ------------------------------------------------------------------ build / save
const fontCache = new Map();
function hex2rgb(hx) { const n = parseInt((hx || '#000').slice(1), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); }
function stdFont(f, bold) { if (f === 'Times') return bold ? StandardFonts.TimesRomanBold : StandardFonts.TimesRoman; if (f === 'Courier') return bold ? StandardFonts.CourierBold : StandardFonts.Courier; return bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica; }
async function getFont(doc, f, bold) { const k = f + bold; if (!fontCache.has(doc)) fontCache.set(doc, {}); const c = fontCache.get(doc); if (!c[k]) c[k] = await doc.embedFont(stdFont(f, bold)); return c[k]; }
function canEncode(font, txt) { try { font.encodeText(txt); return true; } catch { return false; } }
async function textToPng(a, scale = 4) {
  const lines = (a.text || '').split('\n'); const c = document.createElement('canvas'); c.width = Math.ceil(a.w * scale); c.height = Math.ceil(a.h * scale);
  const x = c.getContext('2d'); x.scale(scale, scale); if (a.bg) { x.fillStyle = a.bg; x.fillRect(0, 0, a.w, a.h); }
  x.fillStyle = a.color; x.font = `${a.bold ? 700 : 400} ${a.size}px ${cssFont(a.font)}`; x.textBaseline = 'alphabetic';
  lines.forEach((ln, i) => x.fillText(ln, 2, a.size * (0.85 + i * 1.2)));
  return UI.blobToU8(await new Promise(r => c.toBlob(r, 'image/png')));
}
async function dataUrlBytes(u) { return new Uint8Array(await (await fetch(u)).arrayBuffer()); }

async function buildPdf({ pages = S.pages, flatten = true } = {}) {
  const libCache = {};
  const getLib = async i => libCache[i] || (libCache[i] = await PDFDocument.load(S.sources[i].bytes, { ignoreEncryption: true, updateMetadata: false }));
  const out = await getLib(0);
  const outPages = out.getPages(); const used = new Set();
  const finalPages = [];
  for (const pg of pages) {
    let p;
    if (pg.src === 0 && !used.has(pg.index)) { p = outPages[pg.index]; used.add(pg.index); }
    else { const lib = await getLib(pg.src); [p] = await out.copyPages(lib, [pg.index]); }
    finalPages.push([p, pg]);
  }
  // fill existing form values (before page removal, while fields resolve)
  try {
    const f = out.getForm();
    for (const [name, val] of Object.entries(S.formValues)) {
      try { const fld = f.getField(name); const t = ftype(fld);
        if (t === 'PDFTextField') fld.setText(String(val ?? '')); else if (t === 'PDFCheckBox') val ? fld.check() : fld.uncheck();
        else if (t === 'PDFDropdown') { if (val) fld.select(val); else fld.clear(); } else if (t === 'PDFRadioGroup') { if (val) fld.select(val); }
      } catch {}
    }
  } catch {}
  for (let i = out.getPageCount() - 1; i >= 0; i--) out.removePage(i);
  for (const [p] of finalPages) out.addPage(p);
  const form = out.getForm();
  for (const [p, pg] of finalPages) {
    p.setRotation(degrees((pg.baseRot + pg.rot) % 360));
    if (!flatten) continue;
    for (const a of pg.annots) await drawAnnotPdf(out, p, a, form);
  }
  try { form.updateFieldAppearances(await getFont(out, 'Helvetica', false)); } catch {}
  if (S.meta) { const m = S.meta; m.title != null && out.setTitle(m.title); m.author != null && out.setAuthor(m.author); m.subject != null && out.setSubject(m.subject); m.keywords != null && out.setKeywords(m.keywords.split(',').map(s => s.trim()).filter(Boolean)); }
  out.setProducer('BTS PDF Pro (BTS Creative)'); out.setModificationDate(new Date());
  let bytes = await out.save({ useObjectStreams: true });
  fontCache.delete(out);
  // true redaction: rasterize pages containing redactions
  const redIdx = pages.map((pg, i) => pg.annots.some(a => a.type === 'redact') ? i : -1).filter(i => i >= 0);
  if (redIdx.length) bytes = await rasterizePages(bytes, redIdx, 2.5, 'png');
  return bytes;
}
async function drawAnnotPdf(doc, p, a, form) {
  const op = a.opacity ?? 1;
  switch (a.type) {
    case 'hl': for (const r of a.rects) {
      if (a.kind === 'highlight') p.drawRectangle({ x: r.x, y: r.y, width: r.w, height: r.h, color: hex2rgb(a.color), opacity: 0.4, blendMode: 'Multiply' });
      else { const yy = a.kind === 'underline' ? r.y + r.h * 0.08 : r.y + r.h * 0.45; p.drawLine({ start: { x: r.x, y: yy }, end: { x: r.x + r.w, y: yy }, thickness: Math.max(0.8, r.h * 0.08), color: hex2rgb(a.color) }); }
    } break;
    case 'hlarea': p.drawRectangle({ x: a.x, y: a.y, width: a.w, height: a.h, color: hex2rgb(a.color), opacity: 0.4, blendMode: 'Multiply' }); break;
    case 'rect': p.drawRectangle({ x: a.x, y: a.y, width: a.w, height: a.h, borderColor: hex2rgb(a.color), borderWidth: a.sw, color: a.fill !== 'none' ? hex2rgb(a.fill) : undefined, opacity: op, borderOpacity: op }); break;
    case 'ellipse': p.drawEllipse({ x: a.x + a.w / 2, y: a.y + a.h / 2, xScale: a.w / 2, yScale: a.h / 2, borderColor: hex2rgb(a.color), borderWidth: a.sw, color: a.fill !== 'none' ? hex2rgb(a.fill) : undefined, opacity: op, borderOpacity: op }); break;
    case 'line': case 'arrow': {
      const o = { thickness: a.sw, color: hex2rgb(a.color), opacity: op, lineCap: 1 };
      p.drawLine({ start: { x: a.x1, y: a.y1 }, end: { x: a.x2, y: a.y2 }, ...o });
      if (a.type === 'arrow') arrowHead(a).forEach(([x1, y1, x2, y2]) => p.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, ...o }));
      break;
    }
    case 'ink': { const d = a.pts.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(2) + ' ' + (-q[1]).toFixed(2)).join(' '); p.drawSvgPath(d, { x: 0, y: 0, borderColor: hex2rgb(a.color), borderWidth: a.sw, borderOpacity: op, borderLineCap: 1 }); break; }
    case 'text': {
      const font = await getFont(doc, a.font, a.bold);
      if (!canEncode(font, a.text || '')) { const img = await doc.embedPng(await textToPng(a)); p.drawImage(img, { x: a.x, y: a.y, width: a.w, height: a.h }); break; }
      if (a.bg) p.drawRectangle({ x: a.x, y: a.y, width: a.w, height: a.h, color: hex2rgb(a.bg) });
      (a.text || '').split('\n').forEach((ln, i) => { if (ln) p.drawText(ln, { x: a.x + 2, y: a.y + a.h - a.size * (0.85 + i * 1.2), size: a.size, font, color: hex2rgb(a.color) }); });
      break;
    }
    case 'note': {
      p.drawRectangle({ x: a.x, y: a.y, width: 18, height: 18, color: hex2rgb(a.color) });
      try {
        const ref = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [a.x, a.y, a.x + 18, a.y + 18], Contents: PDFHexString.fromText(a.text || ''), T: PDFHexString.fromText(a.author || ''), Name: 'Comment', C: [...hexArr(a.color)], Open: false, F: 4, M: PDFString.of(pdfDate(new Date(a.date || Date.now()))) }));
        p.node.addAnnot(ref);
      } catch (e) { console.warn('note annot', e); }
      break;
    }
    case 'image': { const b = await dataUrlBytes(a.src); const img = a.src.startsWith('data:image/jp') ? await doc.embedJpg(b) : await doc.embedPng(b); p.drawImage(img, { x: a.x, y: a.y, width: a.w, height: a.h }); break; }
    case 'stamp': {
      const font = await getFont(doc, 'Helvetica', true); const sz = a.h * 0.45; const tw = font.widthOfTextAtSize(a.label, sz);
      p.drawRectangle({ x: a.x, y: a.y, width: a.w, height: a.h, borderColor: hex2rgb(a.color), borderWidth: 2.5, opacity: 0.9, borderOpacity: 0.9 });
      p.drawText(a.label, { x: a.x + (a.w - tw) / 2, y: a.y + a.h / 2 - sz * 0.35, size: sz, font, color: hex2rgb(a.color), opacity: 0.9 });
      break;
    }
    case 'redact': p.drawRectangle({ x: a.x, y: a.y, width: a.w, height: a.h, color: rgb(0, 0, 0) }); break;
    case 'field': {
      let name = a.name, k = 2; while (true) { try { form.getField(name); name = a.name + '_' + k++; } catch { break; } }
      if (a.ftype === 'checkbox') { const cb = form.createCheckBox(name); cb.addToPage(p, { x: a.x, y: a.y, width: a.w, height: a.h, borderColor: rgb(0.3, 0.3, 0.3), borderWidth: 1 }); }
      else { const tf = form.createTextField(name); tf.addToPage(p, { x: a.x, y: a.y, width: a.w, height: a.h, borderColor: rgb(0.3, 0.3, 0.3), borderWidth: 1, font: await getFont(doc, 'Helvetica', false) }); }
      break;
    }
    case 'watermark': {
      const font = await getFont(doc, 'Helvetica', true);
      if (!canEncode(font, a.text)) break;
      const tw = font.widthOfTextAtSize(a.text, a.size); const ang = a.angle * Math.PI / 180;
      const x = a.cx - Math.cos(ang) * tw / 2 + Math.sin(ang) * a.size * 0.35, y = a.cy - Math.sin(ang) * tw / 2 - Math.cos(ang) * a.size * 0.35;
      p.drawText(a.text, { x, y, size: a.size, font, color: hex2rgb(a.color), opacity: a.opacity, rotate: degrees(a.angle) });
      break;
    }
  }
}
const hexArr = hx => { const n = parseInt(hx.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const pdfDate = d => 'D:' + d.toISOString().replace(/[-:T]/g, '').slice(0, 14) + 'Z';

async function rasterizePages(bytes, indices, scale = 2, fmt = 'png', quality = 0.8) {
  const js = await pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  for (const i of indices) {
    const pg = await js.getPage(i + 1); const vp = pg.getViewport({ scale });
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: cx, viewport: vp }).promise;
    const blob = await new Promise(r => c.toBlob(r, fmt === 'jpeg' ? 'image/jpeg' : 'image/png', quality));
    const u8 = await UI.blobToU8(blob); const img = fmt === 'jpeg' ? await doc.embedJpg(u8) : await doc.embedPng(u8);
    const w = vp.width / scale, hgt = vp.height / scale;
    const np = doc.insertPage(i, [w, hgt]); np.drawImage(img, { x: 0, y: 0, width: w, height: hgt });
    doc.removePage(i + 1);
  }
  await js.destroy();
  return doc.save({ useObjectStreams: true });
}

async function save(as = false) {
  if (!S.pages.length) return;
  try {
    toast('Saving…');
    const bytes = await buildPdf();
    let path = S.filePath;
    if (as || !path) { path = await bts.fs.saveAs({ data: bytes, defaultPath: S.fileName || 'document.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] }); if (!path) return; }
    else await bts.fs.write({ path, data: bytes });
    // reload saved output as the new base so annotations become part of the document
    S.filePath = path; S.fileName = path.split(/[\\/]/).pop();
    const keepPage = currentPageIdx();
    S.dirty = false; await reloadFromBytes(new Uint8Array(bytes));
    UI.setDocTitle(S.fileName, 'BTS PDF Pro'); toast('Saved ' + S.fileName, 'ok'); scrollToPage(keepPage);
  } catch (e) { console.error(e); toast('Save failed: ' + e.message, 'err', 6000); }
}
async function reloadFromBytes(bytes) {
  const src = await loadPdfBytes(bytes, S.fileName); S.sources = [src]; S.pages = []; S.textCache = {}; S.sel = null;
  await addSourcePages(0); await loadFormFields(bytes); await buildPages(); relayout(); hist.reset(snapshot()); renderProps(); showLeft(S.leftTab);
}
UI.shortcut('ctrl+s', () => save()); UI.shortcut('ctrl+shift+s', () => save(true));

async function compressDialog() {
  if (!S.pages.length) return;
  const v = await form({ title: 'Compress PDF', fields: [{ key: 'level', label: 'Compression', type: 'select', value: 'std', options: [
    { value: 'std', label: 'Standard — optimize structure, keep text selectable' },
    { value: 'med', label: 'Medium — rasterize pages at 150 dpi (best for scans)' },
    { value: 'high', label: 'High — rasterize pages at 100 dpi (smallest file)' }] }], ok: 'Compress & save as…' });
  if (!v) return;
  toast('Compressing…');
  const orig = S.sources.reduce((n, s) => n + s.bytes.length, 0);
  let bytes = await buildPdf();
  if (v.level !== 'std') bytes = await rasterizePages(bytes, S.pages.map((_, i) => i), v.level === 'med' ? 150 / 72 : 100 / 72, 'jpeg', v.level === 'med' ? 0.72 : 0.6);
  const base = (S.fileName || 'document.pdf').replace(/\.pdf$/i, '');
  const p = await bts.fs.saveAs({ data: bytes, defaultPath: `${base}-compressed.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (p) toast(`Saved ${fmtSize(bytes.length)} (was ${fmtSize(orig)}, ${Math.round((1 - bytes.length / orig) * 100)}% smaller)`, 'ok', 6000);
}
const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(2) + ' MB' : Math.round(n / 1024) + ' KB';

async function exportImages(fmt = 'png', ids) {
  if (!S.pages.length) return;
  const v = await form({ title: 'Export pages as images', fields: [{ key: 'dpi', label: 'Resolution (DPI)', type: 'select', value: '150', options: ['72', '96', '150', '200', '300'] },
    { key: 'fmt', label: 'Format', type: 'select', value: fmt, options: [{ value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPEG' }] }], ok: 'Export' });
  if (!v) return;
  const pages = ids ? ids.map(pageById) : S.pages; const ext = v.fmt === 'png' ? 'png' : 'jpg';
  const base = (S.fileName || 'document.pdf').replace(/\.pdf$/i, '');
  const first = await bts.fs.pickSavePath({ defaultPath: `${base}-page${S.pages.indexOf(pages[0]) + 1}.${ext}`, filters: [{ name: v.fmt.toUpperCase(), extensions: [ext] }] }); if (!first) return;
  const stem = first.replace(/(-page)?\d*\.(png|jpe?g)$/i, '');
  toast('Exporting…');
  const bytes = await buildPdf({ pages }); const js = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  for (let i = 0; i < pages.length; i++) {
    const pg = await js.getPage(i + 1); const vp = pg.getViewport({ scale: +v.dpi / 72 }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); await pg.render({ canvasContext: cx, viewport: vp }).promise;
    const blob = await new Promise(r => c.toBlob(r, v.fmt === 'png' ? 'image/png' : 'image/jpeg', 0.92));
    const path = pages.length === 1 ? first : `${stem}-page${S.pages.indexOf(pages[i]) + 1}.${ext}`;
    await bts.fs.write({ path, data: await UI.blobToU8(blob) });
  }
  js.destroy(); toast(`Exported ${pages.length} image(s)`, 'ok');
}
async function exportText() {
  let out = ''; for (let i = 0; i < S.pages.length; i++) out += `--- Page ${i + 1} ---\n` + (await pageText(S.pages[i])).str + '\n\n';
  const p = await bts.fs.saveAs({ data: new TextEncoder().encode(out), defaultPath: (S.fileName || 'document').replace(/\.pdf$/i, '') + '.txt', filters: [{ name: 'Text', extensions: ['txt'] }] });
  if (p) toast('Text exported', 'ok');
}
async function propertiesDialog() {
  if (!S.pages.length) return;
  let cur = { title: '', author: '', subject: '', keywords: '', creator: '', producer: '' };
  try { const d = await S.sources[0].js.getMetadata(); cur = { title: d.info.Title || '', author: d.info.Author || '', subject: d.info.Subject || '', keywords: d.info.Keywords || '', creator: d.info.Creator || '', producer: d.info.Producer || '' }; } catch {}
  if (S.meta) Object.assign(cur, S.meta);
  const pg = S.pages[0];
  const v = await form({ title: 'Document properties', width: 480, fields: [
    { key: 'title', label: 'Title', value: cur.title }, { key: 'author', label: 'Author', value: cur.author },
    { key: 'subject', label: 'Subject', value: cur.subject }, { key: 'keywords', label: 'Keywords (comma separated)', value: cur.keywords }], ok: 'Apply' });
  if (v) { S.meta = v; markDirty(); toast(`Properties will be written on save · ${S.pages.length} pages · ${(pg.w / 72 * 25.4).toFixed(0)}×${(pg.h / 72 * 25.4).toFixed(0)} mm`); }
}
UI.shortcut('ctrl+d', propertiesDialog);
async function printDoc() {
  if (!S.pages.length) return;
  toast('Preparing pages for printing…');
  const bytes = await buildPdf(); const js = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const area = $('#printArea'); area.innerHTML = '';
  for (let i = 1; i <= js.numPages; i++) {
    const pg = await js.getPage(i); const vp = pg.getViewport({ scale: 2 }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    area.append(h('img', { src: c.toDataURL('image/jpeg', 0.92) }));
  }
  js.destroy(); await UI.sleep(200); window.print(); area.innerHTML = '';
}
UI.shortcut('ctrl+p', printDoc);

// ------------------------------------------------------------------ misc
async function openDialog() { const fs = await bts.fs.open({ multi: true, filters: [{ name: 'PDF & images', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }] }); if (fs) openFiles(fs); }
UI.shortcut('ctrl+o', openDialog);
async function closeWindow() {
  if (S.dirty) { const r = await modal({ title: 'Save changes?', body: `Do you want to save changes to ${S.fileName || 'this document'} before closing?`, buttons: [{ label: 'Cancel', value: null }, { label: "Don't save", value: 'no' }, { label: 'Save', primary: true, value: 'yes' }] });
    if (r === null) return; if (r === 'yes') { await save(); if (S.dirty) return; } }
  bts.win.close();
}
UI.shortcut('ctrl+w', closeWindow);
function shortcutsHelp() {
  const rows = [['V', 'Select'], ['Space (hold)', 'Hand / pan'], ['Z', 'Zoom tool'], ['H / U / K', 'Highlight / underline / strike'], ['N', 'Sticky note'], ['T', 'Add text'], ['E', 'Edit existing text'], ['P', 'Draw'], ['R / O / L / A', 'Rect / ellipse / line / arrow'], ['S', 'Fill & Sign'], ['I', 'Add image'], ['F', 'Form field'], ['X', 'Redact'],
    ['Ctrl+O / S / Shift+S', 'Open / save / save as'], ['Ctrl+Z / Y', 'Undo / redo'], ['Ctrl+F', 'Find'], ['Ctrl+G', 'Go to page'], ['Ctrl + wheel', 'Zoom'], ['Ctrl+1 / 2 / 0', 'Fit page / width / 100%'], ['Ctrl+Shift+O', 'Organize pages'], ['Del', 'Delete annotation'], ['Arrows', 'Nudge annotation']];
  modal({ title: 'Keyboard shortcuts', width: 460, body: '<table style="width:100%;border-collapse:collapse">' + rows.map(r => `<tr><td style="padding:4px 0;color:var(--tx-0)">${r[0]}</td><td style="color:var(--tx-2)">${r[1]}</td></tr>`).join('') + '</table>' });
}

// welcome screen
function welcome() {
  $('#stage').append(h('div', { class: 'welcome' }, h('div', { class: 'card' },
    h('div', { class: 'big-ico' }, 'Pdf'), h('h2', {}, 'BTS PDF Pro'), h('p', {}, 'Open a PDF to view, comment, sign, fill forms and organize pages. You can also drop files here.'),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', html: icon('open') + 'Open PDF', onclick: openDialog }), h('button', { class: 'btn', html: icon('merge') + 'Combine files', onclick: combineFiles }), h('button', { class: 'btn', html: icon('image') + 'Images to PDF', onclick: createFromImages })))));
}
UI.fileDrop(async files => {
  const list = await Promise.all(files.map(async f => ({ name: f.name, path: bts.fs.pathOf(f), data: new Uint8Array(await f.arrayBuffer()) })));
  if (S.pages.length && list.every(f => /\.pdf$/i.test(f.name)) && await confirm('Add files', 'Append the dropped PDF(s) to this document? Choose Cancel to open the first one instead.', 'Append')) {
    for (const f of list) await appendPdf(f.data, f.name); commit('Append'); await refreshAfterPageOp();
  } else openFiles(list);
}, 'Drop PDF or images to open');

setTool('select'); renderProps(); showLeft('thumbs'); welcome();
UI.setDocTitle('', 'BTS PDF Pro');
const qf = UI.queryFile(); if (qf) bts.fs.read(qf).then(f => openFiles([{ ...f, data: new Uint8Array(f.data) }]));
window.__bts = { S, buildPdf, openFiles, drawAnnots, drawForms, commit, setTool, select, save, rotatePages, toggleOrganizer, signDialog, pdfjsLib }; // for automated tests
