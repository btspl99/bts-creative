// BTS PDF Pro — view, annotate, edit, sign, fill forms, organize, combine, compress, export
import * as pdfjsLib from '../vendor/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = '../vendor/pdf.worker.min.mjs';
const { PDFDocument, StandardFonts, rgb, degrees, PDFName, PDFString, PDFHexString, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } = window.PDFLib;
const ftype = f => f instanceof PDFTextField ? 'PDFTextField' : f instanceof PDFCheckBox ? 'PDFCheckBox' : f instanceof PDFDropdown ? 'PDFDropdown' : f instanceof PDFRadioGroup ? 'PDFRadioGroup' : 'other';
const { $, h, toast, modal, form, prompt, confirm, History, contextMenu, clamp } = UI;
import { X } from './ctx.js';
import * as ANN from './annots.js';
import * as OCR from './ocr.js';
import * as RD from './reading.js';
import * as DO from './docops.js';
import * as RV from './review.js';
import * as AS from './assist.js';
import * as EX from './extract.js';
import * as AY from './a11y.js';
import * as SE from './session.js';
import * as QB from './quickbar.js';
// file I/O goes through X.io so automated tests can intercept dialogs
const IO = X.io = { open: o => bts.fs.open(o), read: p => bts.fs.read(p), saveAs: o => bts.fs.saveAs(o), write: o => bts.fs.write(o), pickSavePath: o => bts.fs.pickSavePath(o) };
// extra icons (24px stroke) not in the shared kit
const P2 = {
  callout: 'M4 4h16v10H10l-4 4v-4H4z', measure: 'M3 17L17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  tick: 'M4 12l5 5L20 6', speak: 'M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14', compare: 'M3 3h7v18H3zM14 3h7v18h-7zM6 8h1M6 12h1M17 8h1M17 16h1',
  shield: 'M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6z', book: 'M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v15h-6a2 2 0 0 0-2 2 2 2 0 0 0-2-2H4z',
  docx: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13l1.5 5 1.5-4 1.5 4 1.5-5', ruler: 'M3 8h18v8H3zM7 8v3M11 8v4M15 8v3M19 8v4',
  a11y: 'M12 4a2 2 0 1 0 0-.01M4 8l8 2 8-2M12 10v5l-3 6M12 15l3 6', bookmark: 'M6 3h12v18l-6-4-6 4z', present: 'M3 4h18v12H3zM12 16v4M8 20h8',
  close: 'M6 6l12 12M18 6L6 18', bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z', cards: 'M4 6h12v13H4zM8 3h12v13', table: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v14M15 5v14', slides: 'M3 4h18v12H3zM8 20l4-4 4 4M7 8h6M7 11h10', html: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
};
const icon = (n, s) => P2[n] ? `<svg viewBox="0 0 24 24"${s ? ` style="width:${s}px;height:${s}px"` : ''}><path d="${P2[n]}"/></svg>` : UI.icon(n, s);

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
X.noteRefs = new WeakMap();
let uid = 1; const nid = () => 'a' + (uid++) + Math.random().toString(36).slice(2, 6);
const pageById = id => S.pages.find(p => p.id === id);
const PX = 4 / 3; // CSS px per PDF point at 100%

// ------------------------------------------------------------------ UI scaffold
const noDoc = () => !S.pages.length;
const MENUS = [
  { label: 'File', items: () => [
    { label: 'Open…', kbd: 'Ctrl+O', action: openDialog },
    { label: 'Open in new window…', action: () => SE.openInNewWindow() },
    { label: 'Recent documents', sub: SE.recentItems() },
    { label: 'New blank PDF', kbd: 'Ctrl+N', action: newBlankDoc },
    { label: 'Create PDF from images…', action: () => DO.imagesToPdfDialog() },
    { label: 'Combine files…', action: combineFiles },
    '-',
    { label: 'Save', kbd: 'Ctrl+S', action: save, disabled: noDoc() },
    { label: 'Save as…', kbd: 'Ctrl+Shift+S', action: () => save(true), disabled: noDoc() },
    { label: 'Export', sub: [
      { label: 'Pages as PNG images…', action: () => exportImages('png') },
      { label: 'Pages as JPEG images…', action: () => exportImages('jpeg') },
      { label: 'Plain text (.txt)…', action: exportText },
      { label: 'Word document (.docx)…', action: () => DO.exportDocx() },
      { label: 'PowerPoint (.pptx)…', action: () => EX.exportPptx() },
      { label: 'Web page (.html)…', action: () => EX.exportHtml() },
      { label: 'Tables to Excel / CSV…', action: () => EX.tablesDialog() },
      { label: 'Summary (.txt)…', action: () => AS.exportSummary('txt') },
      { label: 'Study sheet (flashcards & quiz PDF)…', action: () => AS.exportStudy('pdf') },
      { label: 'Comments summary…', action: () => RV.exportComments() },
      { label: 'Form data (JSON)…', action: () => RV.exportFormData() },
    ], disabled: noDoc() },
    { label: 'Optimize / compress PDF…', action: () => DO.optimizeDialog(), disabled: noDoc() },
    '-',
    { label: 'Document properties…', kbd: 'Ctrl+D', action: propertiesDialog, disabled: noDoc() },
    { label: 'Print…', kbd: 'Ctrl+P', action: printDoc, disabled: noDoc() },
    '-',
    { label: 'Recover unsaved work…', action: () => SE.checkRecovery({ includeLive: false }) },
    { label: 'Autosave unsaved work', sub: [0, 1, 2, 5].map(m => ({ label: m ? `Every ${m === 1 ? 'minute' : m + ' minutes'}` : 'Off', checked: () => SE.autosaveMinutes() === m, action: () => SE.setAutosave(m) })) },
    '-',
    { label: 'Close tab', kbd: 'Ctrl+F4', action: () => SE.closeTab(), disabled: !SE.T.tabs.length },
    { label: 'Move tab to new window', action: () => SE.moveToWindow(), disabled: noDoc() },
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
    { label: 'Edit existing text', kbd: 'E', action: () => setTool('edit') },
    { label: 'Add text box', kbd: 'T', action: () => setTool('text') },
    { label: 'Add image…', kbd: 'I', action: addImage },
    { label: 'Add link', action: () => setTool('link') },
    { label: 'Bookmarks', sub: [
      { label: 'Show bookmarks panel', action: () => showLeft('outline') },
      { label: 'Add bookmark for current page…', kbd: 'Ctrl+B', action: () => DO.addBookmark() },
    ] },
    '-',
    { label: 'Find…', kbd: 'Ctrl+F', action: () => showLeft('search', true) },
    { label: 'Find & redact…', action: () => showLeft('search', true) },
    { label: 'Redact patterns (email, phone, Aadhaar, PAN)…', action: () => RV.redactPatternsDialog(), disabled: noDoc() },
    { label: 'Set author name…', action: async () => { const v = await prompt('Author name', 'Name used on comments', S.author); if (v) { S.author = v; localStorage.setItem('bts.author', v); } } },
  ] },
  { label: 'View', items: () => [
    { label: 'Zoom in', kbd: 'Ctrl++', action: () => setZoom(S.zoom * 1.2) },
    { label: 'Zoom out', kbd: 'Ctrl+-', action: () => setZoom(S.zoom / 1.2) },
    { label: 'Zoom', sub: [
      { label: 'Actual size (100%)', kbd: 'Ctrl+0', action: () => setZoom(1) },
      { label: 'Fit width', kbd: 'Ctrl+2', action: () => setZoom('fit-width') },
      { label: 'Fit page', kbd: 'Ctrl+1', action: () => setZoom('fit-page') },
      ...[0.5, 0.75, 1.5, 2, 3, 4].map(z => ({ label: z * 100 + '%', action: () => setZoom(z) })),
    ] },
    '-',
    { label: 'Page display', sub: [
      { label: 'Continuous scrolling', checked: () => !RD.V.single, action: () => RD.setSingle(false) },
      { label: 'Single page', checked: () => RD.V.single, action: () => RD.setSingle(true) },
      '-',
      { label: 'Two-page spread', checked: () => RD.V.spread, action: () => RD.setSpread(!RD.V.spread) },
      { label: 'Show cover page in spread', checked: () => RD.V.cover, action: () => RD.setCover(!RD.V.cover) },
    ] },
    { label: 'Reading mode', sub: [
      { label: 'Normal', checked: () => RD.V.mode === 'normal', action: () => RD.setMode('normal') },
      { label: 'Dark (inverted pages)', checked: () => RD.V.mode === 'dark', action: () => RD.setMode('dark') },
      { label: 'Sepia', checked: () => RD.V.mode === 'sepia', action: () => RD.setMode('sepia') },
      { label: 'Night (low blue light)', checked: () => RD.V.mode === 'night', action: () => RD.setMode('night') },
    ] },
    { label: 'Reading ruler / line focus', kbd: 'Ctrl+Shift+L', checked: () => RD.V.ruler, action: () => RD.toggleRuler() },
    { label: 'Quick action bar on text selection', checked: () => QB.enabled(), action: () => QB.toggle() },
    { label: 'Full screen', kbd: 'F11', action: () => RD.fullScreen() },
    { label: 'Presentation mode', kbd: 'Ctrl+L', action: () => RD.present(), disabled: noDoc() },
    { label: 'Read aloud', sub: [
      { label: 'Read this page', kbd: 'Ctrl+Shift+Y', action: () => RD.readAloud('page') },
      { label: 'Read from selection', action: () => RD.readAloud('selection') },
      { label: 'Read to end of document', action: () => RD.readAloud('doc') },
      { label: 'Pause / resume', action: () => RD.pauseResume() },
      { label: 'Stop reading', action: () => RD.stopReading() },
      { label: 'Voice & speed…', action: () => RD.voiceDialog() },
    ], disabled: noDoc() },
    '-',
    { label: 'Rotate view clockwise', kbd: 'Ctrl+Shift+R', action: () => rotatePages(S.pages.map(p => p.id), 90) },
    { label: 'Go to page…', kbd: 'Ctrl+G', action: gotoPageDialog },
    { label: 'Show side panel', checked: () => !$('.mid').classList.contains('no-left'), action: () => $('.mid').classList.toggle('no-left') },
    { label: 'Organize pages', checked: () => S.organizer, kbd: 'Ctrl+Shift+O', action: () => toggleOrganizer() },
    { label: 'Next document tab', kbd: 'Ctrl+Tab', action: () => SE.nextTab(1), disabled: SE.T.tabs.length < 2 },
    { label: 'Previous document tab', kbd: 'Ctrl+Shift+Tab', action: () => SE.nextTab(-1), disabled: SE.T.tabs.length < 2 },
    '-',
    { label: 'Appearance…', action: UI.appearanceDialog },
    { label: 'Skin', sub: UI.SKINS.map(k => ({ label: k.name, checked: () => (UI.getSettings().skin || 'dark') === k.id, action: () => UI.setSettings({ skin: k.id }) })) },
  ] },
  { label: 'Comment', items: () => [
    { label: 'Sticky note', kbd: 'N', action: () => setTool('note') },
    { label: 'Highlight text', kbd: 'H', action: () => setTool('highlight') },
    { label: 'Underline text', kbd: 'U', action: () => setTool('underline') },
    { label: 'Strikethrough text', kbd: 'K', action: () => setTool('strike') },
    { label: 'Text comment (text box)', kbd: 'T', action: () => setTool('text') },
    { label: 'Callout', kbd: 'C', action: () => setTool('callout') },
    '-',
    { label: 'Draw (pen, smoothed)', kbd: 'P', action: () => setTool('ink') },
    { label: 'Rectangle', kbd: 'R', action: () => setTool('rect') },
    { label: 'Ellipse', kbd: 'O', action: () => setTool('ellipse') },
    { label: 'Line', kbd: 'L', action: () => setTool('line') },
    { label: 'Arrow', kbd: 'A', action: () => setTool('arrow') },
    '-',
    { label: 'Stamp', kbd: 'M', action: () => setTool('stamp') },
    { label: 'Stamps library', sub: RV.STAMPS.map(st => ({ label: st.label, action: () => { S.stamp = st.id; setTool('stamp'); } })).concat(['-', { label: 'Custom image stamp…', action: () => RV.addImageStamp() }, { label: 'Custom text stamp…', action: () => RV.customTextStamp() }]) },
    { label: 'Measure', sub: [
      { label: 'Distance', action: () => { S.measureMode = 'distance'; setTool('measure'); } },
      { label: 'Perimeter', action: () => { S.measureMode = 'perimeter'; setTool('measure'); } },
      { label: 'Area', action: () => { S.measureMode = 'area'; setTool('measure'); } },
      { label: 'Set scale…', action: () => RV.scaleDialog() },
    ] },
    '-',
    { label: 'Comments list', action: () => showLeft('comments') },
    { label: 'Export comments summary…', action: () => RV.exportComments(), disabled: noDoc() },
    { label: 'Remove all annotations…', action: clearAnnots, disabled: noDoc() },
  ] },
  { label: 'Fill & Sign', items: () => [
    { label: 'Add signature…', kbd: 'S', action: () => signDialog() },
    { label: 'Add initials…', action: () => signDialog('initials') },
    { label: 'Add date', action: () => RV.placeDate() },
    { label: 'Add text', action: () => setTool('text') },
    { label: 'Tick mark ✓', action: () => { S.markKind = 'tick'; setTool('mark'); } },
    { label: 'Cross mark ✗', action: () => { S.markKind = 'cross'; setTool('mark'); } },
    { label: 'Dot ●', action: () => { S.markKind = 'dot'; setTool('mark'); } },
    '-',
    { label: 'Request signature: "Sign here" tag', action: () => { S.stamp = 'SIGNHERE'; setTool('stamp'); } },
    { label: 'Digital-signature-look stamp (visual only)…', action: () => RV.dsigDialog() },
    { label: 'Manage saved signatures…', action: () => RV.manageSignatures() },
  ] },
  { label: 'Forms', items: () => [
    { label: 'Add form field', kbd: 'F', action: () => setTool('field') },
    { label: 'Auto-detect form fields…', action: () => RV.autoDetectFields(), disabled: noDoc() },
    { label: 'Tab order…', action: () => RV.tabOrderDialog(), disabled: noDoc() },
    '-',
    { label: 'Clear form', action: () => RV.clearForm(), disabled: noDoc() },
    { label: 'Import form data (JSON)…', action: () => RV.importFormData(), disabled: noDoc() },
    { label: 'Export form data (JSON)…', action: () => RV.exportFormData(), disabled: noDoc() },
    { label: 'Flatten form fields & annotations', action: () => DO.flattenAll(), disabled: noDoc() },
  ] },
  { label: 'Pages', items: () => [
    { label: 'Organize pages', action: () => toggleOrganizer(true) },
    { label: 'Insert blank page', action: () => insertBlank(currentPageIdx() + 1) },
    { label: 'Insert pages from file…', action: () => insertFromFile(currentPageIdx() + 1) },
    { label: 'Replace current page…', action: () => DO.replacePageDialog(), disabled: noDoc() },
    { label: 'Extract pages…', action: extractDialog, disabled: noDoc() },
    { label: 'Split document…', action: splitDialog, disabled: noDoc() },
    '-',
    { label: 'Rotate current page right', action: () => rotatePages([curPage()?.id].filter(Boolean), 90) },
    { label: 'Rotate current page left', action: () => rotatePages([curPage()?.id].filter(Boolean), -90) },
    { label: 'Duplicate current page', action: () => duplicatePages([curPage()?.id].filter(Boolean)) },
    { label: 'Delete current page', action: () => deletePages([curPage()?.id].filter(Boolean)) },
    { label: 'Reverse page order', action: () => DO.reversePages() },
    '-',
    { label: 'Crop pages (draw box)', action: () => setTool('crop') },
    { label: 'Crop margins…', action: () => DO.cropDialog(), disabled: noDoc() },
    { label: 'Resize pages (A4 / Letter…)…', action: () => DO.resizeDialog(), disabled: noDoc() },
    { label: 'Page labels…', action: () => DO.pageLabelsDialog(), disabled: noDoc() },
    '-',
    { label: 'Watermark…', action: () => DO.watermarkDialog(), disabled: noDoc() },
    { label: 'Header & footer / page numbers / Bates…', action: () => DO.headerFooterDialog(), disabled: noDoc() },
    { label: 'Background…', action: () => DO.backgroundDialog(), disabled: noDoc() },
    { label: 'Remove watermark / header & footer / background…', action: () => DO.removeDecorDialog(), disabled: noDoc() },
  ] },
  { label: 'Tools', items: () => [
    { label: 'Recognize text (OCR)…', kbd: 'Ctrl+Shift+T', action: () => OCR.ocrDialog() },
    { label: 'OCR: copy recognised text', action: () => OCR.copyText(), disabled: !OCR.hasResults() },
    { label: 'OCR: export recognised text…', action: () => OCR.exportText(), disabled: !OCR.hasResults() },
    { label: 'Enhance scan (grayscale, contrast, deskew)…', action: () => DO.enhanceScanDialog(), disabled: noDoc() },
    '-',
    { label: 'Document assistant (offline)', sub: [
      { label: 'Summarise document…', kbd: 'Ctrl+Shift+A', action: () => AS.openAssistant('summary') },
      { label: 'Key points & keywords', action: () => AS.openAssistant('points') },
      { label: 'Ask the document (keyword search)…', action: () => AS.openAssistant('ask') },
      { label: 'Study material: flashcards & quiz', action: () => AS.openAssistant('study') },
      '-',
      { label: 'Export summary as text…', action: () => AS.exportSummary('txt') },
      { label: 'Insert summary as a new page…', action: () => AS.exportSummary('page') },
      { label: 'Export flashcards (CSV)…', action: () => AS.exportStudy('cards-csv') },
      { label: 'Export quiz (CSV)…', action: () => AS.exportStudy('quiz-csv') },
      { label: 'Export study sheet (PDF)…', action: () => AS.exportStudy('pdf') },
      { label: 'Close assistant', action: () => AS.closeAssistant() },
    ], disabled: noDoc() },
    { label: 'Extract tables (CSV / Excel)…', action: () => EX.tablesDialog(), disabled: noDoc() },
    '-',
    { label: 'Compare files…', action: () => RD.compareDialog(), disabled: noDoc() },
    { label: 'Compare files — visual overlay / pixel diff…', action: () => RD.compareDialog(null, 'pixel'), disabled: noDoc() },
    { label: 'Protect with password…', action: () => DO.protectDialog(), disabled: noDoc() },
    { label: 'Remove password protection', action: () => DO.removeProtection(), disabled: noDoc() },
    '-',
    { label: 'Optimize / compress…', action: () => DO.optimizeDialog(), disabled: noDoc() },
    { label: 'Remove hidden metadata', action: () => DO.removeMetadata(), disabled: noDoc() },
    { label: 'Accessibility', sub: [
      { label: 'Make accessible (title, language, image alt text)…', action: () => AY.makeAccessibleDialog() },
      { label: 'Reading order check…', action: () => AY.readingOrderReport() },
      { label: 'Show reading order on this page', action: () => AY.showOrder(curPage()) },
      { label: 'Accessibility check…', action: () => DO.accessibilityCheck() },
    ], disabled: noDoc() },
    { label: 'Convert', sub: [
      { label: 'PDF to Word (.docx)…', action: () => DO.exportDocx() },
      { label: 'PDF to PowerPoint (.pptx)…', action: () => EX.exportPptx() },
      { label: 'PDF to HTML…', action: () => EX.exportHtml() },
      { label: 'PDF tables to Excel (.xlsx) / CSV…', action: () => EX.tablesDialog() },
      { label: 'PDF to images…', action: () => exportImages('png') },
      { label: 'PDF to text…', action: exportText },
      { label: 'Images to PDF…', action: () => DO.imagesToPdfDialog() },
    ], disabled: noDoc() },
  ] },
  { label: 'Help', items: [
    { label: 'Keyboard shortcuts', kbd: 'Ctrl+/', action: UI.shortcutSheet },
    { label: 'Tool keys', action: shortcutsHelp },
    { label: 'Check for updates', action: () => bts.update.check().then(r => toast(r.state === 'store' ? 'Updates are delivered by the Microsoft Store.' : r.state === 'dev' ? 'Updates run in the installed version.' : 'Checking for updates…')) },
    { label: 'About BTS PDF Pro', action: () => modal({ title: 'BTS PDF Pro', body: 'Part of BTS Creative — free and open source for students.<br>OCR by Tesseract (Apache-2.0), encryption by @cantoo/pdf-lib (MIT), Word export by docx (MIT), PowerPoint export by PptxGenJS (MIT).<br>The document assistant works offline with classic text-ranking and search methods — no AI model and no internet.<br>Not affiliated with Adobe Inc.' }) },
  ] },
];
UI.titlebar({ logo: 'Pdf', menus: MENUS });
X.menus = MENUS;
window.addEventListener('bts:close', closeWindow);
window.addEventListener('beforeunload', () => {});

// ------------------------------------------------------------------ tools
const TOOLS = [
  ['select', 'select', 'Select', 'V'], ['hand', 'hand', 'Hand', 'Space'], ['zoom', 'zoom', 'Zoom', 'Z'], '-',
  ['highlight', 'highlight', 'Highlight', 'H'], ['underline', 'underline', 'Underline', 'U'], ['strike', 'strike', 'Strikethrough', 'K'],
  ['note', 'note', 'Sticky note', 'N'], ['text', 'text', 'Add text', 'T'], ['callout', 'callout', 'Callout', 'C'], '-',
  ['ink', 'pencil', 'Draw', 'P'], ['rect', 'rect', 'Rectangle', 'R'], ['ellipse', 'ellipse', 'Ellipse', 'O'], ['line', 'line', 'Line', 'L'], ['arrow', 'arrow', 'Arrow', 'A'], ['measure', 'measure', 'Measure', 'G'], '-',
  ['edit', 'pen', 'Edit text', 'E'], ['image', 'image', 'Add image', 'I'], ['link', 'link', 'Add link', 'W'], ['sign', 'sign', 'Fill & Sign', 'S'], ['mark', 'tick', 'Tick / cross mark', 'Y'], ['stamp', 'stamp', 'Stamp', 'M'],
  ['field', 'form', 'Form field', 'F'], ['redact', 'redact', 'Redact', 'X'], ['crop', 'crop', 'Crop pages', 'J'],
];
const tb = $('#toolbar');
TOOLS.forEach(t => {
  if (t === '-') { tb.append(h('div', { class: 'tsep' })); return; }
  const [id, ic, tip, key] = t;
  tb.append(h('button', { class: 'icon-btn', 'data-tool': id, 'data-tip': tip, 'data-key': key, html: icon(ic), onclick: () => {
    if (id === 'image') return addImage(); if (id === 'sign') return signDialog(); setTool(id);
  } }));
});
const keyTools = { v: 'select', z: 'zoom', h: 'highlight', u: 'underline', k: 'strike', n: 'note', t: 'text', p: 'ink', r: 'rect', o: 'ellipse', l: 'line', a: 'arrow', e: 'edit', m: 'stamp', f: 'field', x: 'redact', c: 'callout', g: 'measure', w: 'link', y: 'mark', j: 'crop' };
Object.entries(keyTools).forEach(([k, t]) => UI.shortcut(k, () => setTool(t)));
UI.shortcut('i', addImage); UI.shortcut('s', () => signDialog());
UI.shortcut('ctrl+n', newBlankDoc); UI.shortcut('ctrl+b', () => DO.addBookmark()); UI.shortcut('ctrl+l', () => RD.present()); UI.shortcut('ctrl+shift+l', () => RD.toggleRuler());
UI.shortcut('ctrl+shift+a', () => AS.openAssistant()); UI.shortcut('ctrl+tab', () => SE.nextTab(1), { global: true }); UI.shortcut('ctrl+shift+tab', () => SE.nextTab(-1), { global: true }); UI.shortcut('ctrl+f4', () => SE.closeTab());
UI.shortcut('f11', () => RD.fullScreen()); UI.shortcut('ctrl+shift+y', () => RD.readAloud('page')); UI.shortcut('ctrl+shift+t', () => OCR.ocrDialog());

function setTool(t) {
  S.tool = t; S.pending = null;
  tb.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
  const st = $('#stage');
  st.className = 'stage ' + ({ hand: 'tool-hand', text: 'tool-text', edit: 'tool-edit', note: 'tool-draw', ink: 'tool-draw', rect: 'tool-draw', ellipse: 'tool-draw', line: 'tool-draw', arrow: 'tool-draw', redact: 'tool-draw', field: 'tool-draw', stamp: 'tool-draw', zoom: 'tool-draw', callout: 'tool-draw', measure: 'tool-draw', link: 'tool-draw', mark: 'tool-draw', crop: 'tool-draw' }[t] || '');
  RV.cancelMeasure?.();
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
const FONTS = ['Helvetica', 'Times', 'Courier'];
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
  } else if (t === 'measure' || selAnn()?.type === 'measure') {
    RV.measureOptions(ob, grp, vsep, swatchRow, restyle);
  } else if (t === 'mark' || selAnn()?.type === 'mark') {
    const ks = h('div', { class: 'seg' }, ...[['tick', '✓ Tick'], ['cross', '✗ Cross'], ['dot', '● Dot']].map(([k, l]) => h('button', { class: 'btn sm' + ((S.markKind || 'tick') === k ? ' primary' : ''), onclick: () => { S.markKind = k; const a = selAnn(); if (a?.type === 'mark') { a.kind = k; drawAnnots(pageById(S.sel.pageId)); commit('Mark'); } renderOptions(); } }, l)));
    ob.append(grp('Mark', ks), vsep(), grp('Color', swatchRow(S.style.markColor || '#1d3fbb', c => { S.style.markColor = c; const a = selAnn(); if (a?.type === 'mark') { a.color = c; drawAnnots(pageById(S.sel.pageId)); commitDebounced('Mark colour'); } renderOptions(); })), vsep(), h('span', { class: 'muted' }, 'Click to place; drag to size'));
  } else if (t === 'link') {
    ob.append(h('span', { class: 'muted' }, 'Drag a box over the area that should open a web address or jump to a page'));
  } else if (t === 'crop') {
    ob.append(h('span', { class: 'muted' }, 'Drag a box on a page to keep only that area'), vsep(), h('button', { class: 'btn sm', onclick: () => DO.cropDialog() }, 'Crop margins…'), h('button', { class: 'btn sm', onclick: () => DO.clearCrop() }, 'Remove crop'));
  } else if (t === 'text' || t === 'edit' || t === 'callout' || ['text', 'callout'].includes(selAnn()?.type)) {
    const f = h('select', { style: { width: '150px' } }, ...FONTS.map(x => h('option', { selected: x === S.style.font }, x)));
    f.onchange = () => { S.style.font = f.value; applyStyleToSelected(); };
    const s = h('input', { type: 'number', min: 4, max: 144, value: S.style.fontSize, style: { width: '56px' } }); s.oninput = () => { S.style.fontSize = +s.value; applyStyleToSelected(); };
    const b = h('button', { class: 'btn sm' + (S.style.bold ? ' primary' : ''), onclick: () => { S.style.bold = !S.style.bold; restyle(); } }, 'B');
    const it = h('button', { class: 'btn sm' + (S.style.italic ? ' primary' : ''), style: { fontStyle: 'italic' }, onclick: () => { S.style.italic = !S.style.italic; restyle(); } }, 'I');
    ob.append(grp('Font', f), grp('Size', s), b, it, vsep(), grp('Color', swatchRow(S.style.textColor, c => { S.style.textColor = c; restyle(); })));
    if (t === 'callout' || selAnn()?.type === 'callout') ob.append(vsep(), grp('Border', swatchRow(S.style.color, c => { S.style.color = c; restyle(); })), h('span', { class: 'muted' }, t === 'callout' ? 'Drag from the point you want to call out' : ''));
    if (t === 'edit') ob.append(vsep(), h('span', { class: 'muted' }, 'Click any text on the page to edit it'));
  } else if (t === 'stamp') {
    RV.stampOptions(ob, grp, vsep, swatchRow);
  } else if (t === 'field') {
    const sel = h('select', {}, ...RV.FIELD_TYPES.map(([v, l]) => h('option', { value: v, selected: S.fieldType === v }, l)));
    sel.onchange = () => S.fieldType = sel.value;
    ob.append(grp('Field type', sel), vsep(), h('span', { class: 'muted' }, 'Drag on the page to add a fillable field'), vsep(), h('button', { class: 'btn sm', onclick: () => RV.autoDetectFields() }, 'Auto-detect fields…'), h('button', { class: 'btn sm', onclick: () => RV.tabOrderDialog() }, 'Tab order…'));
  } else if (t === 'redact') {
    ob.append(h('span', { class: 'muted' }, 'Drag over content to redact. Redacted pages are flattened on save so hidden text cannot be recovered.'), vsep(), h('button', { class: 'btn sm', onclick: () => showLeft('search', true) }, 'Find & redact…'), h('button', { class: 'btn sm', onclick: () => RV.redactPatternsDialog() }, 'Redact patterns…'));
  } else if (t === 'zoom') {
    ob.append(h('span', { class: 'muted' }, 'Click to zoom in, Alt+click to zoom out'));
  } else if (t === 'note') {
    ob.append(grp('Color', swatchRow(S.style.hl, c => { S.style.hl = c; restyle(); })), vsep(), h('span', { class: 'muted' }, 'Click on the page to add a comment'));
  } else {
    ob.append(btn('rotateL', 'Rotate left', () => rotatePages([curPage()?.id].filter(Boolean), -90)), btn('rotate', 'Rotate right', () => rotatePages([curPage()?.id].filter(Boolean), 90)), vsep(),
      btn('pages', 'Organize pages', () => toggleOrganizer(), 'Organize'), btn('merge', 'Combine files', combineFiles, 'Combine'), btn('compress', 'Optimize / compress', () => DO.optimizeDialog(), 'Compress'), vsep(),
      btn('ocr', 'Recognize text (OCR)', () => OCR.ocrDialog(), 'OCR'), btn('bulb', 'Document assistant — summary, key points, ask, study (Ctrl+Shift+A)', () => AS.openAssistant(), 'Assistant'), btn('speak', 'Read aloud', () => RD.readAloud('page')), btn('book', 'Reading mode', e => RD.modeMenu(e)), btn('present', 'Presentation mode (Ctrl+L)', () => RD.present()));
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
    row('Type', h('span', { style: { color: 'var(--tx-0)' } }, RV.typeLabel(a)));
    row('Page', h('span', {}, String(S.pages.indexOf(pg) + 1)));
    if (a.type === 'note' || a.type === 'text' || a.type === 'callout') {
      const ta = h('textarea', { rows: 5, style: { width: '100%' } }, a.text || '');
      ta.oninput = () => { a.text = ta.value; drawAnnots(pg); markDirty(); };
      ta.onchange = () => commit('Edit text');
      body.append(h('label', { class: 'field', style: { marginBottom: '10px' } }, a.type === 'note' ? 'Comment' : 'Text', ta));
      if (a.type === 'note') row('Author', h('span', {}, a.author || ''));
    }
    if (a.type === 'field') RV.fieldProps(body, row, pg, a);
    RV.extraProps(body, row, pg, a);
    if ('opacity' in a) { const o = h('input', { type: 'range', min: 0.1, max: 1, step: 0.05, value: a.opacity }); o.oninput = () => { a.opacity = +o.value; drawAnnots(pg); }; o.onchange = () => commit('Opacity'); row('Opacity', o); }
    body.append(h('div', { class: 'row', style: { marginTop: '12px' } },
      h('button', { class: 'btn sm', onclick: duplicateSelected, html: icon('copy') + 'Duplicate' }),
      h('button', { class: 'btn sm', onclick: deleteSelected, html: icon('trash') + 'Delete' })));
    p.append(h('div', { class: 'panel' }, h('div', { class: 'panel-h' }, 'Properties'), body));
  }
  const tools = [
    ['ocr', 'Recognize text (OCR)', () => OCR.ocrDialog()], ['note', 'Comment', () => setTool('note')], ['pen', 'Edit PDF text', () => setTool('edit')],
    ['pages', 'Organize pages', () => toggleOrganizer(true)], ['merge', 'Combine files', combineFiles], ['sign', 'Fill & Sign', () => signDialog()],
    ['form', 'Prepare form', () => setTool('field')], ['search', 'Auto-detect form fields', () => RV.autoDetectFields()],
    ['redact', 'Redact', () => setTool('redact')], ['redact', 'Redact patterns', () => RV.redactPatternsDialog()],
    ['shield', 'Protect (password)', () => DO.protectDialog()], ['compress', 'Optimize / compress', () => DO.optimizeDialog()],
    ['bulb', 'Document assistant', () => AS.openAssistant('summary')], ['cards', 'Flashcards & quiz', () => AS.openAssistant('study')], ['search', 'Ask the document', () => AS.openAssistant('ask')],
    ['table', 'Extract tables', () => EX.tablesDialog()], ['slides', 'PDF to PowerPoint', () => EX.exportPptx()], ['html', 'PDF to HTML', () => EX.exportHtml()],
    ['compare', 'Compare files', () => RD.compareDialog()], ['speak', 'Read aloud', () => RD.readAloud('page')],
    ['docx', 'PDF to Word', () => DO.exportDocx()], ['export', 'PDF to images', () => exportImages('png')], ['text', 'PDF to text', exportText],
    ['image', 'Images to PDF', () => DO.imagesToPdfDialog()], ['adjust', 'Enhance scan', () => DO.enhanceScanDialog()],
    ['stamp', 'Watermark', () => DO.watermarkDialog()], ['grid', 'Header, footer & Bates', () => DO.headerFooterDialog()], ['layers', 'Background', () => DO.backgroundDialog()],
    ['bookmark', 'Bookmarks', () => showLeft('outline')], ['link', 'Add link', () => setTool('link')], ['crop', 'Crop pages', () => setTool('crop')],
    ['fit', 'Resize pages', () => DO.resizeDialog()], ['split', 'Split PDF', splitDialog], ['measure', 'Measure', () => setTool('measure')],
    ['stamp', 'Stamps', () => setTool('stamp')], ['tick', 'Tick / cross marks', () => setTool('mark')], ['a11y', 'Make accessible', () => AY.makeAccessibleDialog()], ['a11y', 'Reading order check', () => AY.readingOrderReport()], ['a11y', 'Accessibility check', () => DO.accessibilityCheck()],
    ['info', 'Remove metadata', () => DO.removeMetadata()], ['print', 'Print', printDoc],
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
async function openDoc(bytes, name, path, opts = {}) {
  if (opts.replace && !opts.force && S.pages.length && S.dirty && !(await confirm('Unsaved changes', 'Discard changes to the current document?', 'Discard'))) return;
  try {
    const src = await loadPdfBytes(bytes, name);
    SE.beforeOpen(opts); RD.stopReading?.(); QB.hide();
    S.sources = [src]; S.pages = []; S.formValues = {}; S.textCache = {}; S.sel = null;
    S.outline = undefined; S.pageLabels = undefined; S.lang = undefined; S.meta = null; S.stripMeta = false; S.tabOrder = {};
    S.protect = null; S.wasEncrypted = !!opts.wasEncrypted; S.a11y = null; S.organizer = false; S.ogSel.clear(); OCR.reset(); AS.onDocChanged();
    $('#organizer').classList.add('hidden'); $('#pages').classList.remove('hidden');
    await addSourcePages(0);
    S.filePath = path; S.fileName = name; S.dirty = false;
    await loadFormFields(bytes);
    await buildPages(); hist.reset(snapshot());
    setZoom(S.zoomMode || 'fit-width');
    UI.setDocTitle(name, 'BTS PDF Pro');
    if (path) bts.recent.add(path).then(() => SE.refreshRecent());
    showLeft(S.leftTab); renderOptions(); renderProps();
    $('.welcome')?.remove(); SE.afterOpen();
  } catch (e) {
    if (/password/i.test(e.name + e.message)) return DO.openEncrypted(bytes, name, path);
    console.error(e); toast('Could not open PDF: ' + e.message, 'err', 6000);
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
  const rotation = (pg.baseRot + pg.rot) % 360;
  if (pg.crop) { const VP = pg._js.getViewport({ scale: 1 }).constructor; return new VP({ viewBox: pg.crop, scale, rotation, offsetX: 0, offsetY: 0 }); }
  return pg._js.getViewport({ scale, rotation });
}
async function ensureJs(pg) { if (!pg._js || pg._jsSrc !== pg.src + ':' + pg.index) { pg._js = await S.sources[pg.src].js.getPage(pg.index + 1); pg._jsSrc = pg.src + ':' + pg.index; } return pg._js; }
async function buildPages() {
  const wrap = $('#pages'); wrap.innerHTML = ''; io.disconnect();
  for (const pg of S.pages) {
    await ensureJs(pg);
    const vp = viewportOf(pg, S.zoom * PX);
    const el = h('div', { class: 'page', 'data-id': pg.id, style: { width: vp.width + 'px', height: vp.height + 'px' } },
      h('canvas', { class: 'pc' }), svgEl('svg', { class: 'bgl' }), h('div', { class: 'textLayer' }),
      svgEl('svg', { class: 'ann' }), h('div', { class: 'forms' }), h('div', { class: 'interact' }),
      h('div', { class: 'pageno' }, `${S.pages.indexOf(pg) + 1}`));
    pg._el = el; pg._vp = vp; pg._rendered = null;
    wrap.append(el); io.observe(el);
    wireInteract(pg);
    drawAnnots(pg); drawForms(pg);
  }
  updateInteract(); renderThumbs(); updateStatus();
  if (RD.V.single) RD.showSingle(Math.min(RD.V.cur, S.pages.length - 1), true);
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
  const key = S.zoom + ':' + pg.rot + ':' + pg.src + ':' + pg.index + ':' + (pg.crop || '');
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
  // page backgrounds go into their own layer that multiplies with the page canvas
  const bgl = pg._el.querySelector('svg.bgl'); bgl.innerHTML = ''; bgl.setAttribute('viewBox', `0 0 ${vp.width} ${vp.height}`);
  const gb = svgEl('g', { transform: `matrix(${vp.transform.join(' ')})` }); bgl.append(gb);
  for (const a of pg.annots) {
    if (a.type === 'bg') { const el = annotSvg(a); if (el) gb.append(el); continue; }
    const el = annotSvg(a); if (!el) continue;
    el.classList.add('a'); if (a.type === 'note') el.classList.add('note'); el.dataset.ann = a.id;
    el.addEventListener('pointerdown', e => annotPointerDown(e, pg, a));
    el.addEventListener('dblclick', () => { if (a.type === 'text' || a.type === 'callout') editTextAnnot(pg, a); if (a.type === 'link') RV.editLink(pg, a); });
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
const RESIZABLE = ['rect', 'ellipse', 'text', 'image', 'stamp', 'redact', 'field', 'hlarea', 'callout', 'mark', 'wmimg', 'link', 'signhere', 'dsig'];
function flipText(x, y) { return `matrix(1 0 0 -1 ${x} ${y})`; }
function annotSvg(a) {
  const op = a.opacity ?? 1;
  const ext = ANN.svg(a); if (ext !== undefined) return ext;
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
      const t = svgEl('text', { transform: flipText(a.x + 2, a.y + a.h), fill: a.color, 'font-size': a.size, 'font-family': cssFont(a.font), 'font-weight': a.bold ? 700 : 400, 'font-style': a.italic ? 'italic' : 'normal' });
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
      const t = svgEl('text', { transform: flipText(a.x + 3, a.y + a.h / 2), fill: '#1d4ed8', 'font-size': Math.min(10, a.h * 0.6), 'dominant-baseline': 'central', 'font-family': 'Helvetica' }); t.textContent = a.ftype === 'checkbox' ? (a.checked ? '☑' : '☐') : a.ftype === 'radio' ? (a.checked ? '◉' : '○') : a.ftype === 'dropdown' ? a.name + ' ▾' : (a.value || a.name) + (a.required ? ' *' : '');
      g.append(t); return g;
    }
    case 'watermark': {
      const t = svgEl('text', { transform: `translate(${a.cx} ${a.cy}) rotate(${a.angle}) scale(1 -1)`, fill: a.color, 'fill-opacity': a.opacity, 'font-size': a.size, 'font-family': 'Helvetica, Arial', 'font-weight': 700, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
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
  const eb = ANN.bbox(a); if (eb) return eb;
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
  if (ANN.move(a, dx, dy)) return;
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
    if (t === 'stamp') { RV.placeStamp(pg, px, py); return; }
    if (t === 'mark') { const sz = 14, a = { id: nid(), type: 'mark', kind: S.markKind || 'tick', x: px - sz / 2, y: py - sz / 2, w: sz, h: sz, color: S.style.markColor || '#1d3fbb', author: S.author, date: new Date().toISOString() }; pg.annots.push(a); drawAnnots(pg); commit('Mark'); return; }
    if (t === 'measure') { RV.measurePointerDown(pg, e, px, py, layer); return; }
    if (t === 'callout') {
      layer.setPointerCapture(e.pointerId); const s = S.style; const bh = s.fontSize * 1.4 + 4;
      const a = { id: nid(), type: 'callout', ax: px, ay: py, x: px + 30, y: py + 20, w: 160, h: bh, text: '', size: s.fontSize, font: s.font, bold: s.bold, italic: !!s.italic, color: s.textColor, stroke: s.color, fill: '#ffffff', sw: 1.2, author: S.author, date: new Date().toISOString() };
      pg.annots.push(a); drawAnnots(pg);
      const mv = ev => { const [qx, qy] = toPdf(pg, ev); a.x = qx; a.y = qy - a.h / 2; if (qx < a.ax) a.x = qx - a.w; drawAnnots(pg); };
      const upc = () => { layer.removeEventListener('pointermove', mv); layer.removeEventListener('pointerup', upc); editTextAnnot(pg, a, true); };
      layer.addEventListener('pointermove', mv); layer.addEventListener('pointerup', upc); return;
    }
    // drag-to-create tools
    if (!['ink', 'rect', 'ellipse', 'line', 'arrow', 'redact', 'field', 'highlight', 'link', 'crop'].includes(t)) return;
    layer.setPointerCapture(e.pointerId);
    const s = S.style; let a;
    if (t === 'ink') a = { id: nid(), type: 'ink', pts: [[px, py]], color: s.color, sw: s.sw, opacity: s.opacity };
    else if (t === 'line' || t === 'arrow') a = { id: nid(), type: t, x1: px, y1: py, x2: px, y2: py, color: s.color, sw: s.sw, opacity: s.opacity };
    else if (t === 'highlight') a = { id: nid(), type: 'hlarea', x: px, y: py, w: 0, h: 0, color: s.hl };
    else if (t === 'field') a = { id: nid(), type: 'field', ftype: S.fieldType, name: RV.fieldBaseName(S.fieldType) + (countFields() + 1), x: px, y: py, w: 0, h: 0, ...RV.fieldDefaults(S.fieldType) };
    else if (t === 'link') a = { id: nid(), type: 'link', x: px, y: py, w: 0, h: 0, url: '' };
    else if (t === 'crop') a = { id: nid(), type: 'cropsel', x: px, y: py, w: 0, h: 0 };
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
        if (a.type === 'field') { const sq = ['checkbox', 'radio'].includes(a.ftype); a.w = sq ? 14 : 150; a.h = sq ? 14 : a.ftype === 'multiline' ? 60 : 20; a.y -= a.h; }
        else { pg.annots = pg.annots.filter(x => x !== a); drawAnnots(pg); return; }
      }
      if (a.type === 'cropsel') { pg.annots = pg.annots.filter(x => x !== a); drawAnnots(pg); DO.applyCropRect(pg, a); return; }
      if (a.type === 'ink') a.pts = smoothInk(simplify(a.pts, 0.4));
      if (a.type === 'link') { drawAnnots(pg); RV.editLink(pg, a, true); return; }
      commit('Add ' + a.type); if (t !== 'ink') select(pg.id, a.id);
    };
    layer.addEventListener('pointermove', move); layer.addEventListener('pointerup', up);
  });
}
const countFields = () => S.pages.reduce((n, p) => n + p.annots.filter(a => a.type === 'field').length, 0) + S.formFields.length;
function snap45(a) { const dx = a.x2 - a.x1, dy = a.y2 - a.y1, ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4, len = Math.hypot(dx, dy); a.x2 = a.x1 + Math.cos(ang) * len; a.y2 = a.y1 + Math.sin(ang) * len; }
// Chaikin corner-cutting: smooths freehand strokes while keeping the end points
function smoothInk(pts, it = 2) {
  if (pts.length < 3) return pts;
  for (let k = 0; k < it; k++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; out.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1], [0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]); }
    out.push(pts[pts.length - 1]); pts = out;
  }
  return pts.map(p => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]);
}
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
  const a = { id: nid(), type: 'text', x: px, y: py - s.fontSize * 1.4, w: 200, h: s.fontSize * 1.4, text: '', size: s.fontSize, color: s.textColor, font: s.font, bold: s.bold, italic: !!s.italic, author: S.author, date: new Date().toISOString() };
  pg.annots.push(a); drawAnnots(pg); editTextAnnot(pg, a, true);
}
function editTextAnnot(pg, a, isNew) {
  const vp = pg._vp; const [x1, y1, x2, y2] = vp.convertToViewportRectangle([a.x, a.y, a.x + a.w, a.y + a.h]);
  const sc = S.zoom * PX;
  const box = h('div', { class: 'editor-box', contenteditable: 'true', style: { left: Math.min(x1, x2) + 'px', top: Math.min(y1, y2) + 'px', minWidth: Math.abs(x2 - x1) + 'px', minHeight: Math.abs(y2 - y1) + 'px', fontSize: a.size * sc + 'px', fontFamily: cssFont(a.font), fontWeight: a.bold ? 700 : 400, fontStyle: a.italic ? 'italic' : 'normal', color: a.color, background: a.bg || 'rgba(255,255,255,.92)' } });
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
// current text selection as PDF-space rectangles per page: Map(page -> [{x,y,w,h}])
function selectionRects() {
  const sel = getSelection(); const byPage = new Map(); if (!sel.rangeCount || sel.isCollapsed) return byPage;
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
  return byPage;
}
document.addEventListener('mouseup', () => {
  if (!['highlight', 'underline', 'strike'].includes(S.tool) || S.areaHighlight && S.tool === 'highlight') return;
  const sel = getSelection(); if (!sel.rangeCount || sel.isCollapsed) return;
  const byPage = selectionRects();
  if (!byPage.size) return;
  for (const [pg, rects] of byPage) { pg.annots.push({ id: nid(), type: 'hl', kind: S.tool, rects: mergeRects(rects), color: S.style.hl, opacity: 1, author: S.author, date: new Date().toISOString() }); drawAnnots(pg); }
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
  if (a.color && !['text', 'hl', 'note', 'callout', 'mark'].includes(a.type)) S.style.color = a.color;
  if (a.fill) S.style.fill = a.fill; if (a.sw) S.style.sw = a.sw; if (a.opacity) S.style.opacity = a.opacity;
  if (a.type === 'text' || a.type === 'callout') { S.style.fontSize = a.size; S.style.font = a.font; S.style.bold = a.bold; S.style.italic = !!a.italic; S.style.textColor = a.color; }
  if (a.type === 'callout' && a.stroke) S.style.color = a.stroke;
}
function applyStyleToSelected() {
  const a = selAnn(); if (!a) return; const s = S.style;
  if (['rect', 'ellipse', 'line', 'arrow', 'ink'].includes(a.type)) { a.color = s.color; a.sw = s.sw; a.opacity = s.opacity; if ('fill' in a) a.fill = s.fill; }
  if (a.type === 'text' || a.type === 'callout') { a.size = s.fontSize; a.font = s.font; a.bold = s.bold; a.italic = !!s.italic; a.color = s.textColor; }
  if (a.type === 'callout') a.stroke = s.color;
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
function snapshot() { return JSON.stringify({ pages: S.pages.map(({ id, src, index, rot, baseRot, w, h, annots, crop }) => ({ id, src, index, rot, baseRot, w, h, annots, crop })), formValues: S.formValues, outline: S.outline }); }
async function restore(snap) {
  const d = JSON.parse(snap); const old = new Map(S.pages.map(p => [p.id, p]));
  const structural = d.pages.length !== S.pages.length || d.pages.some((p, i) => { const o = S.pages[i]; return !o || o.id !== p.id || o.rot !== p.rot || String(o.crop || '') !== String(p.crop || ''); });
  S.formValues = d.formValues || {}; S.outline = d.outline; if (S.leftTab === 'outline') DO.renderOutline();
  if (structural) { S.pages = d.pages; S.sel = null; await buildPages(); relayout(); }
  else { d.pages.forEach((p, i) => { S.pages[i].annots = p.annots; drawAnnots(S.pages[i]); drawForms(S.pages[i]); }); }
  S.sel = null; renderProps(); renderThumbs(); markDirty();
}
function commit(label) { hist.push(snapshot(), label); markDirty(); renderComments(); }
let cdT = null; function commitDebounced(l) { clearTimeout(cdT); cdT = setTimeout(() => commit(l), 400); }
async function undo() { const s = hist.undo(); if (s) await restore(s); }
async function redo() { const s = hist.redo(); if (s) await restore(s); }
UI.shortcut('ctrl+z', undo); UI.shortcut('ctrl+y', redo); UI.shortcut('ctrl+shift+z', redo);
function markDirty() { const was = S.dirty; S.dirty = true; UI.setDocTitle((S.fileName || 'Untitled.pdf') + ' •', 'BTS PDF Pro'); if (!was) SE.render(); }

// ------------------------------------------------------------------ zoom & navigation
function setZoom(z, ev) {
  if (!S.pages.length) { if (typeof z === 'string') S.zoomMode = z; return; }
  const st = $('#stage');
  const before = { sl: st.scrollLeft, stp: st.scrollTop, z: S.zoom };
  if (z === 'fit-width' || z === 'fit-page') {
    S.zoomMode = z; const pg = curPage() || S.pages[0]; const vp = viewportOf(pg, PX);
    const cols = RD.V.spread && !RD.V.presenting ? 2 : 1, padW = RD.V.presenting ? 8 : 60, padH = RD.V.presenting ? 8 : 48;
    const zw = (st.clientWidth - padW - (cols - 1) * 18) / (vp.width * cols), zh = (st.clientHeight - padH) / vp.height;
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
  if (RD.V.single) return clamp(RD.V.cur, 0, Math.max(0, S.pages.length - 1));
  const st = $('#stage'); const mid = st.getBoundingClientRect().top + st.clientHeight / 3;
  let best = 0; S.pages.forEach((p, i) => { if (p._el && p._el.getBoundingClientRect().top <= mid) best = i; }); return best;
}
function curPage() { return S.pages[currentPageIdx()]; }
function scrollToPage(i, yPdf) {
  if (RD.V.single) RD.showSingle(i);
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
function renderOutline() { return DO.renderOutline(); }
async function gotoDest(dest) {
  try {
    const js = S.sources[0].js; if (typeof dest === 'string') dest = await js.getDestination(dest); if (!dest) return;
    const idx = await js.getPageIndex(dest[0]); const mi = S.pages.findIndex(p => p.src === 0 && p.index === idx);
    if (mi >= 0) scrollToPage(mi, dest[1]?.name === 'XYZ' ? dest[3] : null);
  } catch (e) { console.warn(e); }
}
function renderComments() { if (S.leftTab === 'comments') RV.renderComments(); }
function renderSearch(focus) { RV.renderSearch(focus); }
async function pageText(pg) {
  const k = pg.src + ':' + pg.index; if (S.textCache[k]) return S.textCache[k];
  await ensureJs(pg); const tc = await pg._js.getTextContent(); const str = tc.items.map(i => i.str + (i.hasEOL ? '\n' : '')).join('');
  return (S.textCache[k] = { items: tc.items, str });
}
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function applySearchHits(pg) { RV.applySearchHits(pg); }

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
  const fs = await IO.open({ multi: true, filters: [{ name: 'PDF & images', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }] }); if (!fs) return;
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
  const fs = await IO.open({ multi: true, filters: [{ name: 'PDF & images', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }] }); if (!fs) return;
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
function createFromImages() { return DO.imagesToPdfDialog(); }
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
  const p = await IO.saveAs({ data: bytes, defaultPath: `${base}-extracted.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] }); if (p) toast('Pages extracted to ' + p, 'ok');
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
  const first = await IO.pickSavePath({ defaultPath: `${base}-part1.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] }); if (!first) return;
  const stem = first.replace(/(-part)?\d*\.pdf$/i, '');
  for (let i = 0; i < groups.length; i++) await IO.write({ path: `${stem}-part${i + 1}.pdf`, data: await buildPdf({ pages: groups[i] }) });
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
  const fs = await IO.open({ filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }] }); if (!fs) return;
  const png = await toPngBytes(new Uint8Array(fs[0].data)); const url = await u8ToDataUrl(png, 'image/png');
  const im = await loadImg(url); const w = Math.min(240, im.width * 0.75);
  startPlacement({ type: 'image', src: url, w, h: w * im.height / im.width }, 'Click on a page to place the image');
}
function startPlacement(p, msg) { S.pending = p; S.tool = 'select'; tb.querySelectorAll('[data-tool]').forEach(b => b.classList.remove('active')); $('#stage').className = 'stage tool-draw'; updateInteract(); toast(msg); }
function placePending(pg, px, py) {
  const p = S.pending; S.pending = null;
  const a = p.ann ? { ...JSON.parse(JSON.stringify(p.ann)), id: nid(), x: px - p.w / 2, y: py - p.h / 2, author: S.author, date: new Date().toISOString() }
    : { id: nid(), type: 'image', src: p.src, x: px - p.w / 2, y: py - p.h / 2, w: p.w, h: p.h, author: S.author, date: new Date().toISOString(), ...(p.label === 'Sign' || p.label === 'Initials' ? { sig: p.label } : {}) };
  pg.annots.push(a); commit(p.label || 'Add image'); setTool('select'); select(pg.id, a.id);
}
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
async function u8ToDataUrl(u8, mime) { return new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(new Blob([u8], { type: mime })); }); }

const SAVED_SIG = 'bts.signatures';
async function signDialog(kind = 'signature') {
  if (!S.pages.length) return toast('Open a PDF first');
  const initials = kind === 'initials', SKEY = initials ? 'bts.initials' : SAVED_SIG;
  let saved = []; try { saved = JSON.parse(localStorage.getItem(SKEY) || '[]'); } catch { }
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
      typed = h('input', { type: 'text', value: initials ? S.author.split(/\s+/).map(w => w[0] || '').join('').toUpperCase() : S.author, style: { width: '100%', fontSize: '16px', height: '36px' } });
      fontSel = h('select', {}, ...['Segoe Script', 'Brush Script MT', 'Lucida Handwriting', 'Ink Free', 'cursive'].map(f => h('option', { value: f }, f)));
      const prev = h('div', { style: { background: '#fff', color: '#111', borderRadius: '8px', height: '110px', display: 'grid', placeItems: 'center', fontSize: '44px', marginTop: '10px' } });
      const up = () => { prev.textContent = typed.value; prev.style.fontFamily = `"${fontSel.value}", cursive`; prev.style.color = colorSel.value; };
      typed.oninput = up; fontSel.onchange = up; colorSel.onchange = up; up();
      area.append(typed, h('div', { class: 'row', style: { marginTop: '8px' } }, fontSel, colorSel), prev);
    } else if (mode === 'upload') {
      const pv = h('div', { style: { background: '#fff', borderRadius: '8px', height: '160px', display: 'grid', placeItems: 'center', color: '#666' } }, 'No image chosen');
      area.append(h('button', { class: 'btn', onclick: async () => { const f = await IO.open({ filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }] }); if (!f) return; upl = await u8ToDataUrl(await toPngBytes(new Uint8Array(f[0].data)), 'image/png'); pv.innerHTML = ''; pv.append(h('img', { src: upl, style: { maxHeight: '150px', maxWidth: '100%' } })); } }, 'Choose image…'), h('div', { style: { height: '8px' } }), pv);
    } else {
      if (!saved.length) area.append(h('div', { class: 'muted' }, 'No saved signatures yet.'));
      const g = h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } });
      saved.forEach((s, i) => g.append(h('div', { style: { background: '#fff', borderRadius: '8px', padding: '8px', cursor: 'pointer', position: 'relative' }, onclick: () => { close(s); } }, h('img', { src: s, style: { width: '100%', height: '70px', objectFit: 'contain' } }),
        h('button', { class: 'btn sm', style: { position: 'absolute', top: '4px', right: '4px' }, onclick: e => { e.stopPropagation(); saved.splice(i, 1); localStorage.setItem(SKEY, JSON.stringify(saved)); draw(); } }, '✕'))));
      area.append(g);
    }
  };
  [['draw', 'Draw'], ['type', 'Type'], ['upload', 'Image'], ['saved', 'Saved']].forEach(([m, l]) => tabs.append(h('div', { class: 'tab', 'data-m': m, onclick: () => { mode = m; draw(); } }, l)));
  const saveCb = h('input', { type: 'checkbox', checked: true });
  body.append(tabs, area, h('label', { class: 'row', style: { marginTop: '12px', color: 'var(--tx-2)' } }, saveCb, initials ? 'Save initials for later' : 'Save signature for later'));
  let close = () => {};
  const resultP = new Promise(res => close = res);
  draw();
  if (saved.length) { mode = 'saved'; draw(); }
  const btnRes = modal({ title: initials ? 'Fill & Sign — initials' : 'Fill & Sign — create signature', body, buttons: [{ label: 'Cancel', value: null }, { label: initials ? 'Place initials' : 'Place signature', primary: true, value: 'ok' }] });
  const r = await Promise.race([btnRes, resultP]);
  document.querySelector('.modal-back')?.remove();
  let url = null;
  if (typeof r === 'string' && r.startsWith('data:')) url = r;
  else if (r === 'ok') {
    if (mode === 'draw') { if (!drawn) return toast('Draw a signature first', 'err'); url = trimCanvas(pad); }
    else if (mode === 'type') { const c = document.createElement('canvas'); c.width = 1200; c.height = 300; const x = c.getContext('2d'); x.font = `120px "${fontSel.value}", cursive`; x.fillStyle = colorSel.value; x.textBaseline = 'middle'; x.fillText(typed.value || ' ', 20, 150); url = trimCanvas(c); }
    else if (mode === 'upload') url = upl;
    if (url && saveCb.checked && mode !== 'saved') { saved.unshift(url); try { localStorage.setItem(SKEY, JSON.stringify(saved.slice(0, 6))); } catch { } }
  }
  if (!url) return;
  const im = await loadImg(url); const w = initials ? 60 : 150;
  startPlacement({ type: 'image', src: url, w, h: w * im.height / im.width, label: initials ? 'Initials' : 'Sign' }, initials ? 'Click where you want your initials' : 'Click where you want to sign');
}
function trimCanvas(c) {
  const x = c.getContext('2d'); const d = x.getImageData(0, 0, c.width, c.height).data; let t = c.height, l = c.width, r = 0, b = 0;
  for (let y = 0; y < c.height; y++) for (let xx = 0; xx < c.width; xx++) if (d[(y * c.width + xx) * 4 + 3] > 10) { if (y < t) t = y; if (y > b) b = y; if (xx < l) l = xx; if (xx > r) r = xx; }
  if (r <= l) return c.toDataURL();
  const o = document.createElement('canvas'); o.width = r - l + 20; o.height = b - t + 20; o.getContext('2d').drawImage(c, l - 10, t - 10, o.width, o.height, 0, 0, o.width, o.height); return o.toDataURL('image/png');
}

// ------------------------------------------------------------------ watermark / page numbers / clear
function pageBox(pg) { const v = pg.crop || pg._js.view; return { x: v[0], y: v[1], w: v[2] - v[0], h: v[3] - v[1] }; }
async function clearAnnots() { if (!(await confirm('Remove annotations', 'Remove all annotations added in this session from every page?', 'Remove'))) return; S.pages.forEach(p => { p.annots = []; drawAnnots(p); }); commit('Clear annotations'); }

// ------------------------------------------------------------------ build / save
const fontCache = new Map();
function hex2rgb(hx) { const n = parseInt((hx || '#000').slice(1), 16); return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); }
function stdFont(f, bold, it) {
  const SF = StandardFonts;
  if (f === 'Times') return it ? (bold ? SF.TimesRomanBoldItalic : SF.TimesRomanItalic) : (bold ? SF.TimesRomanBold : SF.TimesRoman);
  if (f === 'Courier') return it ? (bold ? SF.CourierBoldOblique : SF.CourierOblique) : (bold ? SF.CourierBold : SF.Courier);
  return it ? (bold ? SF.HelveticaBoldOblique : SF.HelveticaOblique) : (bold ? SF.HelveticaBold : SF.Helvetica);
}
async function getFont(doc, f, bold, it) { const k = f + bold + !!it; if (!fontCache.has(doc)) fontCache.set(doc, {}); const c = fontCache.get(doc); if (!c[k]) c[k] = await doc.embedFont(stdFont(f, bold, it)); return c[k]; }
function canEncode(font, txt) { try { font.encodeText(txt); return true; } catch { return false; } }
async function textToPng(a, scale = 4) {
  const lines = (a.text || '').split('\n'); const c = document.createElement('canvas'); c.width = Math.ceil(a.w * scale); c.height = Math.ceil(a.h * scale);
  const x = c.getContext('2d'); x.scale(scale, scale); if (a.bg) { x.fillStyle = a.bg; x.fillRect(0, 0, a.w, a.h); }
  x.fillStyle = a.color; x.font = `${a.italic ? 'italic ' : ''}${a.bold ? 700 : 400} ${a.size}px ${cssFont(a.font)}`; x.textBaseline = 'alphabetic';
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
    if (pg.crop) { const [x1, y1, x2, y2] = pg.crop; p.setCropBox(x1, y1, x2 - x1, y2 - y1); }
    if (!flatten) continue;
    const ordered = pg.annots.filter(a => a.type === 'field').sort((a, b) => (a.tab ?? 1e9) - (b.tab ?? 1e9));
    for (const a of pg.annots) if (a.type !== 'field') await drawAnnotPdf(out, p, a, form);
    for (const a of ordered) await drawAnnotPdf(out, p, a, form);
  }
  try { form.updateFieldAppearances(await getFont(out, 'Helvetica', false)); } catch {}
  if (S.meta) { const m = S.meta; m.title != null && out.setTitle(m.title, { showInWindowTitleBar: !!m.title }); m.author != null && out.setAuthor(m.author); m.subject != null && out.setSubject(m.subject); m.keywords != null && out.setKeywords(m.keywords.split(',').map(s => s.trim()).filter(Boolean)); }
  out.setProducer('BTS PDF Pro (BTS Creative)'); out.setModificationDate(new Date());
  await DO.postBuild(out, finalPages, { flatten, form });
  let bytes = await out.save({ useObjectStreams: true });
  fontCache.delete(out);
  // true redaction: rasterize pages containing redactions
  const redIdx = flatten ? pages.map((pg, i) => pg.annots.some(a => a.type === 'redact') ? i : -1).filter(i => i >= 0) : [];
  if (redIdx.length) bytes = await rasterizePages(bytes, redIdx, 2.5, 'png');
  return bytes;
}
async function drawAnnotPdf(doc, p, a, form) {
  const op = a.opacity ?? 1;
  if (await ANN.pdf(doc, p, a)) return;
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
      const font = await getFont(doc, a.font, a.bold, a.italic);
      if (!canEncode(font, a.text || '')) { const img = await doc.embedPng(await textToPng(a)); p.drawImage(img, { x: a.x, y: a.y, width: a.w, height: a.h }); break; }
      if (a.bg) p.drawRectangle({ x: a.x, y: a.y, width: a.w, height: a.h, color: hex2rgb(a.bg) });
      (a.text || '').split('\n').forEach((ln, i) => { if (ln) p.drawText(ln, { x: a.x + 2, y: a.y + a.h - a.size * (0.85 + i * 1.2), size: a.size, font, color: hex2rgb(a.color) }); });
      break;
    }
    case 'note': {
      p.drawRectangle({ x: a.x, y: a.y, width: 18, height: 18, color: hex2rgb(a.color) });
      try {
        const ref = doc.context.register(doc.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [a.x, a.y, a.x + 18, a.y + 18], Contents: PDFHexString.fromText(a.text || ''), T: PDFHexString.fromText(a.author || ''), Name: 'Comment', C: [...hexArr(a.color)], Open: false, F: 4, M: PDFString.of(pdfDate(new Date(a.date || Date.now()))) }));
        p.node.addAnnot(ref); X.noteRefs.set(a, ref);
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
    case 'field': await RV.createField(doc, p, a, form); break;
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
    const outBytes = S.protect ? await DO.encryptBytes(bytes, S.protect) : bytes;
    let path = S.filePath;
    if (as || !path) { path = await IO.saveAs({ data: outBytes, defaultPath: S.fileName || 'document.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] }); if (!path) return; }
    else await IO.write({ path, data: outBytes });
    // reload saved output as the new base so annotations become part of the document
    S.filePath = path; S.fileName = path.split(/[\\/]/).pop();
    const keepPage = currentPageIdx();
    S.dirty = false; await reloadFromBytes(new Uint8Array(bytes));
    UI.setDocTitle(S.fileName, 'BTS PDF Pro'); toast('Saved ' + S.fileName + (S.protect ? ' (password protected)' : ''), 'ok'); scrollToPage(keepPage);
    SE.dropRecord(SE.tabId()); SE.render(); SE.refreshRecent();
  } catch (e) { console.error(e); toast('Save failed: ' + e.message, 'err', 6000); }
}
async function reloadFromBytes(bytes, keep) {
  const src = await loadPdfBytes(bytes, S.fileName); S.sources = [src]; S.pages = []; S.textCache = {}; S.sel = null;
  S.outline = undefined; S.pageLabels = undefined; S.tabOrder = {}; S.flattenForms = false; S.a11y = null; AS.onDocChanged();
  await addSourcePages(0);
  if (keep) S.pages.forEach((p, i) => { if (keep[i]) p.annots = keep[i]; });
  S.formValues = {}; await loadFormFields(bytes); await buildPages(); relayout(); hist.reset(snapshot(), keep ? 'Apply' : 'Save'); renderProps(); showLeft(S.leftTab);
}
// apply a document-level transform: build the current pages (annotations kept as editable objects
// unless flatten=true), run fn(pdfDoc) and reload the result as the new base document.
async function rebase(fn, { flatten = false, label = 'Apply', keepAnnots = true } = {}) {
  const keep = S.pages.map(p => flatten || !keepAnnots ? [] : p.annots);
  const keepIdx = currentPageIdx();
  let bytes = await buildPdf({ flatten });
  if (fn) { const doc = await PDFDocument.load(bytes, { updateMetadata: false }); const r = await fn(doc); bytes = r instanceof Uint8Array ? r : await doc.save({ useObjectStreams: true }); }
  await reloadFromBytes(new Uint8Array(bytes), keep); markDirty(); scrollToPage(keepIdx);
  return bytes;
}
UI.shortcut('ctrl+s', () => save()); UI.shortcut('ctrl+shift+s', () => save(true));

const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(2) + ' MB' : Math.round(n / 1024) + ' KB';

async function exportImages(fmt = 'png', ids) {
  if (!S.pages.length) return;
  const v = await form({ title: 'Export pages as images', fields: [{ key: 'dpi', label: 'Resolution (DPI)', type: 'select', value: '150', options: ['72', '96', '150', '200', '300'] },
    { key: 'fmt', label: 'Format', type: 'select', value: fmt, options: [{ value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPEG' }] }], ok: 'Export' });
  if (!v) return;
  const pages = ids ? ids.map(pageById) : S.pages; const ext = v.fmt === 'png' ? 'png' : 'jpg';
  const base = (S.fileName || 'document.pdf').replace(/\.pdf$/i, '');
  const first = await IO.pickSavePath({ defaultPath: `${base}-page${S.pages.indexOf(pages[0]) + 1}.${ext}`, filters: [{ name: v.fmt.toUpperCase(), extensions: [ext] }] }); if (!first) return;
  const stem = first.replace(/(-page)?\d*\.(png|jpe?g)$/i, '');
  toast('Exporting…');
  const bytes = await buildPdf({ pages }); const js = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  for (let i = 0; i < pages.length; i++) {
    const pg = await js.getPage(i + 1); const vp = pg.getViewport({ scale: +v.dpi / 72 }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); await pg.render({ canvasContext: cx, viewport: vp }).promise;
    const blob = await new Promise(r => c.toBlob(r, v.fmt === 'png' ? 'image/png' : 'image/jpeg', 0.92));
    const path = pages.length === 1 ? first : `${stem}-page${S.pages.indexOf(pages[i]) + 1}.${ext}`;
    await IO.write({ path, data: await UI.blobToU8(blob) });
  }
  js.destroy(); toast(`Exported ${pages.length} image(s)`, 'ok');
}
async function exportText() {
  let out = ''; for (let i = 0; i < S.pages.length; i++) out += `--- Page ${i + 1} ---\n` + (await pageText(S.pages[i])).str + '\n\n';
  const p = await IO.saveAs({ data: new TextEncoder().encode(out), defaultPath: (S.fileName || 'document').replace(/\.pdf$/i, '') + '.txt', filters: [{ name: 'Text', extensions: ['txt'] }] });
  if (p) toast('Text exported', 'ok');
}
async function propertiesDialog() {
  if (!S.pages.length) return;
  let cur = { title: '', author: '', subject: '', keywords: '', creator: '', producer: '' };
  try { const d = await S.sources[0].js.getMetadata(); cur = { title: d.info.Title || '', author: d.info.Author || '', subject: d.info.Subject || '', keywords: d.info.Keywords || '', creator: d.info.Creator || '', producer: d.info.Producer || '' }; } catch {}
  if (S.meta) Object.assign(cur, S.meta);
  const pg = S.pages[0];
  let lang = S.lang; if (lang == null) { try { lang = (await S.sources[0].js.getMetadata()).info.Language || ''; } catch { lang = ''; } }
  const v = await form({ title: 'Document properties', width: 480, fields: [
    { key: 'title', label: 'Title', value: cur.title }, { key: 'author', label: 'Author', value: cur.author },
    { key: 'subject', label: 'Subject', value: cur.subject }, { key: 'keywords', label: 'Keywords (comma separated)', value: cur.keywords },
    { key: 'lang', label: 'Language (e.g. en-IN, hi-IN, mr-IN)', value: lang }], ok: 'Apply' });
  if (v) { S.lang = v.lang; delete v.lang; S.meta = v; S.stripMeta = false; markDirty(); toast(`Properties will be written on save · ${S.pages.length} pages · ${(pg.w / 72 * 25.4).toFixed(0)}×${(pg.h / 72 * 25.4).toFixed(0)} mm`); }
}
UI.shortcut('ctrl+d', propertiesDialog);
async function printDoc(opts) {
  if (!S.pages.length) return;
  const v = opts || await form({ title: 'Print', fields: [
    { key: 'which', label: 'Pages', type: 'select', value: 'all', options: [{ value: 'all', label: `All pages (${S.pages.length})` }, { value: 'cur', label: `Current page (${currentPageIdx() + 1})` }, { value: 'range', label: 'Page range…' }] },
    { key: 'range', label: 'Range (e.g. 1-3, 5, 8-10)', value: `1-${S.pages.length}` },
    { key: 'annots', label: 'Print comments, markups and stamps', type: 'checkbox', value: true }], ok: 'Print' });
  if (!v) return;
  const idx = v.which === 'cur' ? [currentPageIdx()] : v.which === 'range' ? parseRange(v.range || '', S.pages.length) : S.pages.map((_, i) => i);
  if (!idx.length) return toast('No valid pages in range', 'err');
  toast('Preparing pages for printing…');
  const bytes = await buildPdf({ pages: idx.map(i => S.pages[i]), flatten: v.annots !== false }); const js = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const area = $('#printArea'); area.innerHTML = '';
  for (let i = 1; i <= js.numPages; i++) {
    const pg = await js.getPage(i); const vp = pg.getViewport({ scale: 2 }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    area.append(h('img', { src: c.toDataURL('image/jpeg', 0.92) }));
  }
  js.destroy(); await UI.sleep(200); if (!opts?.noDialog) window.print(); if (!opts?.keep) area.innerHTML = '';
  return idx.length;
}
UI.shortcut('ctrl+p', printDoc);

// ------------------------------------------------------------------ misc
async function openDialog() { const fs = await IO.open({ multi: true, filters: [{ name: 'PDF & images', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }] }); if (fs) openFiles(fs); }
UI.shortcut('ctrl+o', openDialog);
async function closeWindow() {
  if (!(await SE.confirmCloseAll())) return;
  for (const t of SE.T.tabs) await SE.dropRecord(t.id);
  bts.win.close();
}
UI.shortcut('ctrl+w', closeWindow);
function shortcutsHelp() {
  const rows = [['V', 'Select'], ['Space (hold)', 'Hand / pan'], ['Z', 'Zoom tool'], ['H / U / K', 'Highlight / underline / strike'], ['N', 'Sticky note'], ['T', 'Add text'], ['E', 'Edit existing text'], ['P', 'Draw'], ['R / O / L / A', 'Rect / ellipse / line / arrow'], ['S', 'Fill & Sign'], ['I', 'Add image'], ['F', 'Form field'], ['X', 'Redact'], ['C', 'Callout'], ['G', 'Measure'], ['W', 'Link'], ['Y', 'Tick / cross mark'], ['J', 'Crop'], ['M', 'Stamp'],
    ['Ctrl+Shift+T', 'Recognize text (OCR)'], ['Ctrl+Shift+A', 'Document assistant'], ['Ctrl+Tab / Ctrl+Shift+Tab', 'Next / previous document tab'], ['Ctrl+F4', 'Close tab'], ['Ctrl+Shift+Y', 'Read page aloud'], ['Ctrl+L', 'Presentation mode'], ['Ctrl+Shift+L', 'Reading ruler'], ['Ctrl+B', 'Add bookmark'], ['Ctrl+N', 'New blank PDF'],
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

setTool('select'); renderProps(); showLeft('thumbs'); welcome(); SE.refreshRecent(); SE.startAutosave();
UI.setDocTitle('', 'BTS PDF Pro');
const qf = UI.queryFile(); if (qf) IO.read(qf).then(f => openFiles([{ ...f, data: new Uint8Array(f.data) }]));
Object.assign(X, { S, hist, IO, PX, pdfjsLib, buildPdf, openFiles, openDoc, loadPdfBytes, reloadFromBytes, rebase, drawAnnots, drawForms, commit, commitDebounced, setTool, select, selAnn, save, rotatePages, toggleOrganizer, signDialog,
  pageText, ensureJs, viewportOf, renderProps, renderOptions, renderThumbs, scrollToPage, currentPageIdx, curPage, pageById, nid, parseRange, pageBox, buildPages, relayout, refreshAfterPageOp, appendPdf,
  addSourcePages, loadFormFields, rasterizePages, imagesToPdf, toPngBytes, u8ToDataUrl, loadImg, dataUrlBytes, hex2rgb, hexArr, pdfDate, getFont, canEncode, textToPng, startPlacement, showLeft, markDirty, fmtSize, svgEl, cssFont,
  undo, redo, bbox, moveAnn, esc, escRe, trimCanvas, editTextAnnot, insertBlank, newBlankDoc, setZoom, exportImages, exportText, printDoc, gotoDest, deletePages, movePages, duplicatePages, icon, toPdf, propertiesDialog, mergeRects,
  snapshot, restore, welcome, selectionRects, openDialog, closeAssistant: AS.closeAssistant, onDocChanged: AS.onDocChanged, markDirty });
window.__bts = X; // for automated tests
