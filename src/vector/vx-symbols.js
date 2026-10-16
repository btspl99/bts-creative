// BTS Vector — Symbols: built-in icon & shape library (drag to canvas), document symbols (linked instances),
// shapes library (polygon, star, spiral, flare), symbol sprayer source.
(() => {
const { P, O, DOC, G } = VX; const { h, toast, clamp } = UI;
const sel = () => VX.sel;
// generated glyphs
const poly = pts => 'M' + pts.map(p => p.map(v => +v.toFixed(2)).join(' ')).join('L') + 'Z';
const starPts = (n, r1, r2, cx = 12, cy = 12, rot = -90) => Array.from({ length: n * 2 }, (_, i) => { const r = i % 2 ? r2 : r1; const a = (rot + i * 180 / n) * Math.PI / 180; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
const circ = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const gear = (() => { const pts = []; const n = 8; for (let i = 0; i < n * 4; i++) { const a = (i / (n * 4)) * Math.PI * 2; const r = (i % 4 < 2) ? 10.5 : 7.8; pts.push([12 + Math.cos(a) * r, 12 + Math.sin(a) * r]); } return poly(pts) + circ(12, 12, 3.4); })();
const sun = circ(12, 12, 4.6) + Array.from({ length: 8 }, (_, i) => { const a = i * 45 * Math.PI / 180, n = (i * 45 + 90) * Math.PI / 180; const t = [12 + Math.cos(a) * 11, 12 + Math.sin(a) * 11]; const b1 = [12 + Math.cos(a) * 6.8 + Math.cos(n) * 1.6, 12 + Math.sin(a) * 6.8 + Math.sin(n) * 1.6], b2 = [12 + Math.cos(a) * 6.8 - Math.cos(n) * 1.6, 12 + Math.sin(a) * 6.8 - Math.sin(n) * 1.6]; return poly([t, b1, b2]); }).join('');
const flower = Array.from({ length: 6 }, (_, i) => { const a = i * 60 * Math.PI / 180; return circ(12 + Math.cos(a) * 5.5, 12 + Math.sin(a) * 5.5, 4.6); }).join('') + circ(12, 12, 4);
// [id, name, category, pathData, evenodd]
const ICONS = VX.SYMBOL_LIBRARY = [
  ['arrowR', 'Arrow right', 'Arrows', 'M2 10h13V5l7 7-7 7v-5H2z'], ['arrowL', 'Arrow left', 'Arrows', 'M22 10H9V5l-7 7 7 7v-5h13z'], ['arrowU', 'Arrow up', 'Arrows', 'M10 22V9H5l7-7 7 7h-5v13z'], ['arrowD', 'Arrow down', 'Arrows', 'M10 2v13H5l7 7 7-7h-5V2z'],
  ['chevron', 'Chevron', 'Arrows', 'M8 3l9 9-9 9-3-3 6-6-6-6z'], ['arrowLR', 'Double arrow', 'Arrows', 'M1 12l6-6v4h10V6l6 6-6 6v-4H7v4z'], ['arrowCurve', 'Curved arrow', 'Arrows', 'M4 14A8 8 0 0 1 17 7.8V5h3v8h-8v-3h3.2A5 5 0 0 0 7 14z'], ['arrowCircle', 'Arrow in circle', 'Arrows', circ(12, 12, 10) + 'M11 7l5 5-5 5v-3.5H7v-3h4z', true],
  ['heart', 'Heart', 'Shapes', 'M12 21l-1.5-1.3C5 15 2 12 2 8.3 2 5.4 4.3 3 7.2 3c1.7 0 3.4.8 4.8 2.1C13.4 3.8 15.1 3 16.8 3 19.7 3 22 5.4 22 8.3c0 3.7-3 6.7-8.5 11.4z'],
  ['star', 'Star', 'Shapes', 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z'], ['sparkle', 'Sparkle', 'Shapes', 'M12 1c.8 5.5 5.5 10.2 11 11-5.5.8-10.2 5.5-11 11-.8-5.5-5.5-10.2-11-11 5.5-.8 10.2-5.5 11-11z'],
  ['circle', 'Circle', 'Shapes', circ(12, 12, 10)], ['triangle', 'Triangle', 'Shapes', 'M12 3l10 18H2z'], ['diamond', 'Diamond', 'Shapes', 'M12 2l10 10-10 10L2 12z'], ['hexagon', 'Hexagon', 'Shapes', 'M12 2l8.7 5v10L12 22l-8.7-5V7z'], ['pentagon', 'Pentagon', 'Shapes', 'M12 2l10 7.3-3.8 11.7H5.8L2 9.3z'], ['octagon', 'Octagon', 'Shapes', 'M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9z'], ['squircle', 'Rounded square', 'Shapes', 'M6 2h12a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z'], ['flower', 'Flower', 'Shapes', flower],
  ['plus', 'Plus', 'Signs', 'M9 2h6v7h7v6h-7v7H9v-7H2V9h7z'], ['cross', 'Cross', 'Signs', 'M5.6 2.8L12 9.2l6.4-6.4 2.8 2.8-6.4 6.4 6.4 6.4-2.8 2.8-6.4-6.4-6.4 6.4-2.8-2.8 6.4-6.4-6.4-6.4z'], ['check', 'Check', 'Signs', 'M9 16.2l-4.2-4.2L2 14.8l7 7 13-13-2.8-2.8z'],
  ['checkCircle', 'Check circle', 'Signs', circ(12, 12, 10) + 'M10.5 16.5l-4.2-4.2 1.4-1.4 2.8 2.8 6-6 1.4 1.4z', true], ['xCircle', 'Cross circle', 'Signs', circ(12, 12, 10) + 'M8.5 7.1L12 10.6l3.5-3.5 1.4 1.4-3.5 3.5 3.5 3.5-1.4 1.4-3.5-3.5-3.5 3.5-1.4-1.4 3.5-3.5-3.5-3.5z', true],
  ['info', 'Info', 'Signs', circ(12, 12, 10) + 'M11 10h2v7h-2zM11 6.5h2v2h-2z', true], ['warning', 'Warning', 'Signs', 'M12 2L1 21h22zM11 9h2v6h-2zM11 16.5h2v2h-2z', true], ['question', 'Question', 'Signs', circ(12, 12, 10) + 'M11 16h2v2h-2zM12 6a3.5 3.5 0 0 0-3.5 3.5h2A1.5 1.5 0 1 1 12 11c-.6 0-1 .4-1 1v2h2v-1.2A3.5 3.5 0 0 0 12 6z', true], ['stop', 'Stop', 'Signs', 'M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9zM6 11h12v2H6z', true],
  ['bubble', 'Speech bubble', 'Bubbles', 'M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6.1L4 21l4.6-2.4c1.1.3 2.2.4 3.4.4 5.5 0 10-3.6 10-8s-4.5-8-10-8z'], ['bubbleRect', 'Message box', 'Bubbles', 'M3 3h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-5 4v-4H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z'], ['thought', 'Thought bubble', 'Bubbles', 'M12 3c4.4 0 8 2.7 8 6s-3.6 6-8 6-8-2.7-8-6 3.6-6 8-6z' + circ(6, 18, 2) + circ(3, 21.5, 1.2)], ['chat', 'Chat', 'Bubbles', 'M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6.1L4 21l4.6-2.4c1.1.3 2.2.4 3.4.4 5.5 0 10-3.6 10-8s-4.5-8-10-8z' + circ(7, 11, 1.5) + circ(12, 11, 1.5) + circ(17, 11, 1.5), true],
  ['seal', 'Seal badge', 'Badges', poly(starPts(16, 11, 9.2))], ['burst', 'Starburst', 'Badges', poly(starPts(12, 11.5, 6.5))], ['ribbon', 'Ribbon badge', 'Badges', circ(12, 9, 7) + 'M7.6 14.2L5 23l4-2 3 3 1.2-8.1zM16.4 14.2L19 23l-4-2-3 3-1.2-8.1z'], ['shield', 'Shield', 'Badges', 'M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z'], ['crown', 'Crown', 'Badges', 'M2 7l5 4 5-7 5 7 5-4-2 11H4zM4 19h16v3H4z'], ['trophy', 'Trophy', 'Badges', 'M6 2h12v2h3v3a5 5 0 0 1-5 5h-.3A5 5 0 0 1 13 14.9V18h4v4H7v-4h4v-3.1A5 5 0 0 1 8.3 12H8a5 5 0 0 1-5-5V4h3zM5 6v1a3 3 0 0 0 3 3V6zM16 6v4a3 3 0 0 0 3-3V6z', true],
  ['bolt', 'Lightning', 'Nature', 'M13 2L4 14h7l-1 8 9-12h-7z'], ['sun', 'Sun', 'Nature', sun], ['moon', 'Moon', 'Nature', 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'], ['cloud', 'Cloud', 'Nature', 'M6.5 19a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 17.6 8.6 5.2 5.2 0 0 1 18 19z'], ['drop', 'Drop', 'Nature', 'M12 2c3.3 4 7 8.3 7 12a7 7 0 0 1-14 0c0-3.7 3.7-8 7-12z'], ['leaf', 'Leaf', 'Nature', 'M20 3C9 3 4 8 4 15c0 2 .5 3.6 1.2 5L3 22l1.4 1.4 2.4-2.4c1.3.6 2.8 1 4.2 1C18 22 21 13 20 3z'], ['flame', 'Flame', 'Nature', 'M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 1.5-5 3-6 0 2 1 3.5 2.5 4C11 9 10 6 12 2z'],
  ['home', 'Home', 'Interface', 'M12 3l10 9h-3v9h-5v-6h-4v6H5v-9H2z'], ['user', 'Person', 'Interface', circ(12, 7, 5) + 'M3 22c0-5 4-8 9-8s9 3 9 8z'], ['mail', 'Envelope', 'Interface', 'M2 5h20v14H2zM4 7v.5l8 5.5 8-5.5V7l-8 5.5z', true], ['pin', 'Location pin', 'Interface', 'M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zM12 6.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z', true], ['bell', 'Bell', 'Interface', 'M12 2a1.5 1.5 0 0 1 1.5 1.5v.7A6 6 0 0 1 18 10v5l2 3H4l2-3v-5a6 6 0 0 1 4.5-5.8v-.7A1.5 1.5 0 0 1 12 2zM10 19h4a2 2 0 0 1-4 0z'],
  ['lock', 'Lock', 'Interface', 'M7 10V7a5 5 0 0 1 10 0v3h2v12H5V10zM9 10h6V7a3 3 0 0 0-6 0z', true], ['search', 'Search', 'Interface', 'M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2zM10 4.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z', true], ['gear', 'Gear', 'Interface', gear, true], ['calendar', 'Calendar', 'Interface', 'M3 5h18v17H3zM5 10v10h14V10zM7 2h2v3H7zM15 2h2v3h-2z', true], ['clock', 'Clock', 'Interface', circ(12, 12, 10) + 'M11 6h2v5.6l3.5 3.5-1.4 1.4L11 12.4z', true], ['eye', 'Eye', 'Interface', 'M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zM12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z', true], ['cart', 'Cart', 'Interface', 'M1 2h4.2l.7 3H22l-3 10H8.2l.5 2H19v2H7L3.6 4H1z' + circ(9, 21, 1.6) + circ(17, 21, 1.6)],
  ['camera', 'Camera', 'Social', 'M2 7h5l2-3h6l2 3h5v13H2zM12 9a4.5 4.5 0 1 0 0 9 4.5 4.5 0 1 0 0-9z', true], ['play', 'Play', 'Social', 'M6 3l15 9-15 9z'], ['pause', 'Pause', 'Social', 'M5 3h5v18H5zM14 3h5v18h-5z'], ['music', 'Music note', 'Social', 'M9 3v11.3A3.5 3.5 0 1 0 11 17.5V8h8V3z'], ['share', 'Share', 'Social', circ(18, 5, 3) + circ(6, 12, 3) + circ(18, 19, 3) + 'M8.6 10.7l6.8-4 .8 1.4-6.8 4zM8.6 13.3l.8-1.4 6.8 4-.8 1.4z'], ['bookmark', 'Bookmark', 'Social', 'M5 2h14v20l-7-5-7 5z'], ['flag', 'Flag', 'Social', 'M4 2h2v20H4zM7 3h13l-3 5 3 5H7z'], ['tag', 'Tag', 'Social', 'M2 2h9l11 11-9 9L2 11zM7 5a2 2 0 1 0 0 4 2 2 0 1 0 0-4z', true],
];
VX.SYMBOL_LIBRARY_COUNT = ICONS.length;
O.symSize = 96;
const iconSVG = ic => `<svg viewBox="0 0 24 24"><path fill-rule="${ic[4] ? 'evenodd' : 'nonzero'}" d="${ic[3]}"/></svg>`;
function libItem(id, size = O.symSize) {
  const ic = ICONS.find(x => x[0] === id); if (!ic) return null;
  const cp = new P.CompoundPath({ pathData: ic[3], insert: false }); cp.fillRule = ic[4] ? 'evenodd' : 'nonzero';
  cp.fillColor = O.fill && O.fill !== '#ffffff' ? O.fill : '#1d1f24'; cp.strokeColor = null;
  cp.scale(size / 24, new P.Point(0, 0)); cp.name = ic[1]; cp.data.libSymbol = id; return cp;
}
// document symbols: instance = Group{ data.symbolId, data.symbolName } holding a copy of the master
function docInstance(sym, size) { const g = new P.Group({ insert: false }); const m = new P.Group({ insert: false }); m.importJSON(sym.json); g.addChildren(m.removeChildren()); g.data.symbolId = sym.id; g.data.symbolName = sym.name; g.name = sym.name; if (size) { const b = g.bounds; g.scale(size / Math.max(1, b.width, b.height)); } return g; }
VX.f.symbolInstance = (key, at, size) => { let it = null; if (String(key).startsWith('doc:')) { const s = DOC.symbols.find(x => x.id === key.slice(4)); if (s) it = docInstance(s, size); } else it = libItem(String(key).replace(/^lib:/, ''), size); if (!it) return null; (VX.iso || VX.project.activeLayer).addChild(it); it.position = at; return it; };
VX.f.symbolChoices = () => [...DOC.symbols.map(s => ({ value: 'doc:' + s.id, label: '◆ ' + s.name })), ...ICONS.map(i => ({ value: 'lib:' + i[0], label: i[1] }))];
VX.f.placeSymbol = (key, at) => { const it = VX.f.symbolInstance(key, at || VX.abRect().center, O.symSize); if (!it) return null; VX.setSel([it]); VX.commit('Place symbol'); return it; };
VX.f.newSymbol = async name => {
  if (!sel().length) return toast('Select artwork to save as a symbol');
  name = name || await UI.prompt('New symbol', 'Symbol name', 'Symbol ' + (DOC.symbols.length + 1)); if (!name) return;
  const g = new P.Group({ insert: false }); sel().forEach(i => g.addChild(i.clone({ insert: false }))); const c = g.bounds.center; g.translate(c.multiply(-1));
  const sym = { id: 's' + Date.now().toString(36), name, json: g.exportJSON({ asString: false }) }; DOC.symbols.push(sym);
  const items = [...sel()].sort((a, b) => a.index - b.index); const inst = docInstance(sym); inst.position = c; inst.insertAbove(items[items.length - 1]); items.forEach(i => i.remove());
  VX.setSel([inst]); VX.commit('New symbol'); VX.showTab('symbols'); return sym;
};
UI.shortcut('f8', () => VX.f.newSymbol());
VX.f.redefineSymbol = async () => {
  const it = sel()[0]; if (!it) return toast('Select an edited symbol instance (or artwork) to redefine a symbol');
  let sym = it.data?.symbolId && DOC.symbols.find(s => s.id === it.data.symbolId);
  if (!sym) { if (!DOC.symbols.length) return toast('No document symbols yet'); const v = await UI.form({ title: 'Redefine symbol', fields: [{ key: 's', label: 'Replace the artwork of', type: 'select', value: DOC.symbols[0].id, options: DOC.symbols.map(s => ({ value: s.id, label: s.name })) }] }); if (!v) return; sym = DOC.symbols.find(s => s.id === v.s); }
  const old = new P.Group({ insert: false }); old.importJSON(sym.json); const oldW = Math.max(1, old.bounds.width);
  const g = new P.Group({ insert: false }); (it.data?.symbolId ? it.children : sel()).forEach(i => g.addChild(i.clone({ insert: false }))); const scale = it.data?.symbolId ? oldW / Math.max(1, it.bounds.width) : 1; g.scale(scale); g.translate(g.bounds.center.multiply(-1)); sym.json = g.exportJSON({ asString: false });
  const insts = []; VX.allLayers().forEach(L => L.getItems({ recursive: true, match: x => x.data?.symbolId === sym.id }).forEach(x => insts.push(x)));
  insts.forEach(x => { const k = x.bounds.width / oldW; const c = x.bounds.center; x.removeChildren(); const m = new P.Group({ insert: false }); m.importJSON(sym.json); x.addChildren(m.removeChildren()); x.scale(k); x.position = c; });
  if (!it.data?.symbolId) { const inst = docInstance(sym); inst.position = it.bounds.center; inst.insertAbove(it); sel().forEach(i => i.remove()); VX.setSel([inst]); }
  VX.commit('Redefine symbol'); toast(`Updated ${insts.length} instance(s) of “${sym.name}”`);
};
VX.f.breakSymbol = () => { const its = sel().filter(i => i.data?.symbolId); if (!its.length) return toast('Select symbol instances'); its.forEach(i => { delete i.data.symbolId; delete i.data.symbolName; i.name = ''; }); VX.commit('Break link to symbol'); VX.renderRight(); };
VX.propSections.push(items => { const i = items.length === 1 && items[0].data?.symbolId ? items[0] : null; if (!i) return null; return VX.sec('Symbol instance', h('div', { class: 'muted', style: { fontSize: '11.5px', marginBottom: '6px' } }, '◆ ' + i.data.symbolName), h('div', { class: 'row', style: { gap: '4px', flexWrap: 'wrap' } }, h('button', { class: 'btn sm', onclick: () => VX.enterIsolation(i) }, 'Edit (isolate)'), h('button', { class: 'btn sm', onclick: VX.f.redefineSymbol }, 'Redefine from this'), h('button', { class: 'btn sm', onclick: VX.f.breakSymbol }, 'Break link'))); });

// drop symbols from the panel onto the canvas
const cv = document.getElementById('cv');
cv.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('application/x-vx-symbol')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
cv.addEventListener('drop', e => { const key = e.dataTransfer.getData('application/x-vx-symbol'); if (!key) return; e.preventDefault(); const r = cv.getBoundingClientRect(); const p = P.view.viewToProject(new P.Point(e.clientX - r.left, e.clientY - r.top)); VX.f.placeSymbol(key, p); });

// ---------------------------------------------------------------- Symbols tab
let symQuery = '';
VX.tabs.symbols = rp => {
  const sec = VX.sec;
  const size = h('input', { type: 'number', value: O.symSize, min: 4, max: 4000, style: { width: '64px' } }); size.onchange = () => { O.symSize = clamp(+size.value, 4, 4000); };
  const q = h('input', { type: 'text', placeholder: `Search ${ICONS.length} symbols…`, value: symQuery, style: { flex: 1 } });
  const tile = (key, svgHTML, name) => { const t = h('div', { class: 'sym', draggable: 'true', 'data-tip': name + ' — click or drag onto the canvas', html: svgHTML, onclick: () => VX.f.placeSymbol(key) }); t.ondragstart = e => { e.dataTransfer.setData('application/x-vx-symbol', key); e.dataTransfer.effectAllowed = 'copy'; }; return t; };
  const docGrid = h('div', { class: 'symgrid' }, ...DOC.symbols.map(s => { const g = new P.Group({ insert: false }); g.importJSON(s.json); let svg = ''; try { const b = g.bounds; const node = g.exportSVG({ asString: true }); svg = `<svg viewBox="${b.x} ${b.y} ${Math.max(1, b.width)} ${Math.max(1, b.height)}" style="fill:initial">${node}</svg>`; } catch { } return tile('doc:' + s.id, svg, s.name); }));
  rp.append(sec('Document symbols', DOC.symbols.length ? docGrid : h('div', { class: 'muted', style: { fontSize: '11.5px' } }, 'None yet — select artwork and press F8.'), h('div', { class: 'row', style: { gap: '4px', marginTop: '8px', flexWrap: 'wrap' } }, h('button', { class: 'btn sm', onclick: () => VX.f.newSymbol() }, 'New from selection (F8)'), h('button', { class: 'btn sm', onclick: VX.f.redefineSymbol }, 'Redefine'), h('button', { class: 'btn sm', onclick: () => VX.setTool('sprayer') }, 'Sprayer tool'))));
  rp.append(sec('Shapes library', h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '4px' } }, ...[['polygon', 'Polygon'], ['star', 'Star'], ['spiral', 'Spiral'], ['flare', 'Flare'], ['rrect', 'Rounded rect']].map(([k, l]) => h('button', { class: 'btn sm', onclick: () => VX.f.shape(k) }, l)))));
  const lib = h('div', {}); const fill = () => { lib.innerHTML = ''; const s = symQuery.toLowerCase(); const cats = [...new Set(ICONS.map(i => i[2]))]; cats.forEach(cat => { const its = ICONS.filter(i => i[2] === cat && (!s || i[1].toLowerCase().includes(s) || cat.toLowerCase().includes(s))); if (!its.length) return; lib.append(h('div', { class: 'muted', style: { fontSize: '10.5px', letterSpacing: '.6px', textTransform: 'uppercase', margin: '8px 0 5px' } }, cat), h('div', { class: 'symgrid' }, ...its.map(i => tile('lib:' + i[0], iconSVG(i), i[1])))); }); };
  q.oninput = () => { symQuery = q.value; fill(); }; fill();
  rp.append(sec('Icon & symbol library', h('div', { class: 'row', style: { gap: '6px' } }, q, h('span', { class: 'muted' }, 'Size'), size), lib));
};
})();
