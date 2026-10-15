// BTS Video — multi-track timeline video editor
(() => {
const { $, h, icon, toast, modal, form, prompt, confirm, contextMenu, clamp, fmtTime } = UI;

// =====================================================================  project model
let uidN = 1; const uid = p => p + (uidN++) + Math.random().toString(36).slice(2, 5);
const PJ = {
  name: 'Untitled project', path: null, dirty: false,
  seq: { w: 1920, h: 1080, fps: 30, bg: '#000000' },
  media: [],   // {id,name,path,url,kind,dur,w,h,hasAudio,thumb,strip,peaks,missing}
  tracks: [{ id: 'V3', kind: 'video' }, { id: 'V2', kind: 'video' }, { id: 'V1', kind: 'video' }, { id: 'A1', kind: 'audio' }, { id: 'A2', kind: 'audio' }, { id: 'A3', kind: 'audio' }].map(t => ({ ...t, muted: false, hidden: false, locked: false })),
  clips: [],   // {id,type,mediaId,track,start,in,out,name,props}
};
const ST = { t: 0, playing: false, pps: 60, tool: 'select', snap: true, sel: new Set(), ffmpeg: false, safe: false };
const mediaById = id => PJ.media.find(m => m.id === id);
const clipById = id => PJ.clips.find(c => c.id === id);
const trackById = id => PJ.tracks.find(t => t.id === id);
const spd = c => (c.props && c.props.speed) || 1;
const dur = c => (c.out - c.in) / spd(c);
const end = c => c.start + dur(c);
const seqDuration = () => PJ.clips.reduce((m, c) => Math.max(m, end(c)), 0);
const fileUrl = p => (p.startsWith('/') ? 'file://' : 'file:///') + encodeURI(p.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F');
const defaultProps = type => ({ x: 0, y: 0, scale: 100, rotation: 0, opacity: 100, volume: 100, fadeIn: 0, fadeOut: 0, trIn: 'none', trDur: 1, trOut: 'none', trOutDur: 1, brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, grayscale: 0, sepia: 0, fit: 'fit', speed: 1,
  ...(type === 'title' ? { text: 'Your title', font: 'Segoe UI', size: 96, color: '#ffffff', weight: 700, italic: false, align: 'center', box: false, boxColor: '#000000', boxOpacity: 60, shadow: true, anim: 'fade', ty: 0, outline: 0, outlineColor: '#000000' } : {}),
  ...(type === 'color' ? { color: '#1d4ed8' } : {}) });

// =====================================================================  menus
UI.titlebar({ logo: 'Vd', menus: [
  { label: 'File', items: () => [
    { label: 'New project', kbd: 'Ctrl+Alt+N', action: newProject }, { label: 'Open project…', kbd: 'Ctrl+O', action: openProject }, '-',
    { label: 'Import media…', kbd: 'Ctrl+I', action: importDialog }, '-',
    { label: 'Save project', kbd: 'Ctrl+S', action: () => saveProject(false) }, { label: 'Save project as…', kbd: 'Ctrl+Shift+S', action: () => saveProject(true) }, '-',
    { label: 'Export video…', kbd: 'Ctrl+M', action: exportDialog }, { label: 'Export current frame (PNG)…', kbd: 'Ctrl+Shift+E', action: exportFrame }, '-',
    { label: 'Sequence settings…', action: seqSettings }, { label: 'BTS Office home', action: () => bts.openApp('home') }, { label: 'Close window', kbd: 'Ctrl+W', action: closeWindow } ] },
  { label: 'Edit', items: () => [
    { label: 'Undo', kbd: 'Ctrl+Z', action: undo, disabled: hi <= 0 }, { label: 'Redo', kbd: 'Ctrl+Shift+Z', action: redo, disabled: hi >= hist.length - 1 }, '-',
    { label: 'Cut', kbd: 'Ctrl+X', action: cutClips }, { label: 'Copy', kbd: 'Ctrl+C', action: copyClips }, { label: 'Paste at playhead', kbd: 'Ctrl+V', action: pasteClips },
    { label: 'Duplicate', kbd: 'Ctrl+Shift+D', action: duplicateClips }, { label: 'Delete', kbd: 'Del', action: () => deleteClips(false) }, { label: 'Ripple delete', kbd: 'Shift+Del', action: () => deleteClips(true) }, '-',
    { label: 'Select all', kbd: 'Ctrl+A', action: () => { PJ.clips.forEach(c => ST.sel.add(c.id)); renderTimeline(); renderFx(); } }, { label: 'Deselect all', kbd: 'Ctrl+Shift+A', action: () => select([]) } ] },
  { label: 'Clip', items: () => [
    { label: 'Split at playhead', kbd: 'Ctrl+K', action: splitAtPlayhead }, { label: 'Apply default transition (fade)', kbd: 'Ctrl+D', action: () => applyTransition('fade') },
    { label: 'Fade in / out (0.5s)', action: quickFades }, { label: 'Speed / duration…', kbd: 'Ctrl+R', action: speedDialog },
    '-', { label: 'Fit to frame', action: () => setProp('fit', 'fit') }, { label: 'Fill frame', action: () => setProp('fit', 'fill') }, { label: 'Reset effects', action: resetEffects },
    '-', { label: 'Add title', kbd: 'Ctrl+T', action: () => addTitle('Big title') }, { label: 'Add color matte', action: addColor } ] },
  { label: 'Sequence', items: () => [
    { label: 'Settings…', action: seqSettings }, { label: 'Add video track', action: () => addTrack('video') }, { label: 'Add audio track', action: () => addTrack('audio') }, '-',
    { label: 'Snapping', kbd: 'S', checked: () => ST.snap, action: () => { ST.snap = !ST.snap; renderHead(); } }, { label: 'Close gaps', action: closeGaps } ] },
  { label: 'View', items: () => [
    { label: 'Zoom timeline in', kbd: '=', action: () => zoomTl(1.4) }, { label: 'Zoom timeline out', kbd: '-', action: () => zoomTl(1 / 1.4) }, { label: 'Fit timeline', kbd: '\\', action: fitTl }, '-',
    { label: 'Safe margins', checked: () => ST.safe, action: () => { ST.safe = !ST.safe; layoutMonitor(); } } ] },
  { label: 'Help', items: [{ label: 'Keyboard shortcuts', action: shortcutsHelp }, { label: 'Check for updates', action: () => bts.update.check().then(r => toast(r.state === 'dev' ? 'Updates run in the installed version.' : 'Checking for updates…')) }, { label: 'About BTS Video', action: () => modal({ title: 'BTS Video', body: 'Part of BTS Office — free and open source for students.<br>Video export uses FFmpeg (bundled, GPL).<br>Not affiliated with Adobe Inc.' }) }] },
]});
window.addEventListener('bts:close', closeWindow);

// =====================================================================  options bar & transport
function renderOptions() {
  const ob = $('#optbar'); ob.innerHTML = '';
  const btn = (ic, label, fn, tip) => h('button', { class: 'btn ghost sm', 'data-tip': tip || label, html: icon(ic) + (label ? `<span>${label}</span>` : ''), onclick: fn });
  ob.append(btn('folder', 'Import', importDialog), btn('save', 'Save', () => saveProject(false)), h('div', { class: 'vsep' }), btn('undo', '', undo, 'Undo'), btn('redo', '', redo, 'Redo'), h('div', { class: 'vsep' }),
    btn('text', 'Title', () => addTitle('Big title')), btn('scissors', 'Split', splitAtPlayhead, 'Split at playhead (Ctrl+K)'), btn('transition', 'Fade', () => applyTransition('fade'), 'Apply fade transition'), btn('sliders', 'Sequence', seqSettings),
    h('div', { style: { flex: 1 } }), h('button', { class: 'btn primary sm', html: icon('export') + 'Export', onclick: exportDialog }));
}
['bStart:skipB', 'bPrev:chevL', 'bPlay:play', 'bNext:chevR', 'bEnd:skipF'].forEach(s => { const [id, ic] = s.split(':'); $('#' + id).innerHTML = icon(ic); });
$('#bStart').onclick = () => seek(0); $('#bEnd').onclick = () => seek(seqDuration()); $('#bPrev').onclick = () => seek(ST.t - 1 / PJ.seq.fps); $('#bNext').onclick = () => seek(ST.t + 1 / PJ.seq.fps); $('#bPlay').onclick = togglePlay;
const tc = s => { const f = PJ.seq.fps; s = Math.max(0, s); const fr = Math.floor(s * f + 1e-6); const hh = Math.floor(fr / (3600 * f)), mm = Math.floor(fr / (60 * f)) % 60, ss = Math.floor(fr / f) % 60, ff = fr % f; return [hh, mm, ss, ff].map(v => String(v).padStart(2, '0')).join(':'); };

// =====================================================================  media import
async function importDialog() { const fs = await bts.fs.open({ multi: true, filters: [{ name: 'Media', extensions: ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'] }] }); if (!fs) return; for (const f of fs) await importPath(f.path, f.name); }
UI.shortcut('ctrl+i', importDialog);
const kindOf = n => /\.(mp3|wav|m4a|aac|ogg|flac|opus)$/i.test(n) ? 'audio' : /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(n) ? 'image' : 'video';
async function importPath(path, name, existingId) {
  name = name || path.split(/[\\/]/).pop();
  const m = existingId ? mediaById(existingId) : { id: uid('m'), name, path, kind: kindOf(name), dur: 5, w: 0, h: 0, hasAudio: false };
  m.path = path; m.url = fileUrl(path); m.missing = false;
  if (!existingId) PJ.media.push(m);
  status(`Importing ${name}…`);
  try {
    if (m.kind === 'image') { const im = new Image(); im.src = m.url; await im.decode(); m.w = im.naturalWidth; m.h = im.naturalHeight; m.dur = 5; m.el = im; m.thumb = thumbOf(im, im.naturalWidth, im.naturalHeight); }
    else {
      if (ST.ffmpeg) { const info = await bts.ffmpeg.probe(path); if (info) { const d = info.match(/Duration: (\d+):(\d+):([\d.]+)/); if (d) m.dur = +d[1] * 3600 + +d[2] * 60 + +d[3]; m.hasAudio = /Stream #.*Audio:/.test(info); const v = info.match(/Stream #.*Video:.*?(\d{2,5})x(\d{2,5})/); if (v) { m.w = +v[1]; m.h = +v[2]; } } }
      const el = document.createElement(m.kind === 'audio' ? 'audio' : 'video'); el.preload = 'auto'; el.src = m.url; el.muted = true;
      const ok = await new Promise(res => { el.onloadeddata = () => res(true); el.onerror = () => res(false); setTimeout(() => res(el.readyState >= 1), 15000); });
      if (!ok) {
        if (ST.ffmpeg && m.kind === 'video') { await makeProxy(m); }
        else throw new Error('This format cannot be played. Convert it to MP4 (H.264) or WebM.');
      } else {
        if (isFinite(el.duration) && el.duration > 0) m.dur = el.duration;
        if (m.kind === 'video') { m.w = el.videoWidth || m.w; m.h = el.videoHeight || m.h; if (!ST.ffmpeg) m.hasAudio = true; await makeStrip(m, el); }
      }
      if (m.kind === 'audio' || m.hasAudio) makePeaks(m);
    }
    m.ready = true;
  } catch (e) { console.error(e); m.missing = true; toast(`Could not import ${name}: ${e.message}`, 'err', 6000); }
  status('Ready'); renderBin(); renderTimeline(); markDirty(); return m;
}
async function makeProxy(m) {
  status(`Creating playable proxy for ${m.name}…`);
  const dir = await bts.ffmpeg.tmpDir(); const out = `${dir}/${m.id}-proxy.mp4`.replace(/\\/g, '/');
  const id = await bts.ffmpeg.start(['-i', m.path, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', out]);
  const r = await bts.ffmpeg.end(id); if (!r.ok) throw new Error('Unsupported media format');
  m.proxy = out; m.url = fileUrl(out);
  const el = document.createElement('video'); el.src = m.url; el.muted = true; await new Promise(res => { el.onloadeddata = res; el.onerror = res; });
  if (isFinite(el.duration)) m.dur = el.duration; m.w = el.videoWidth; m.h = el.videoHeight; await makeStrip(m, el);
}
function thumbOf(src, w, hh, tw = 160) { const c = document.createElement('canvas'); c.width = tw; c.height = Math.round(tw * hh / w) || 90; c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.7); }
async function makeStrip(m, el) {
  const seekTo = t => new Promise(r => { const done = () => { el.removeEventListener('seeked', done); r(); }; el.addEventListener('seeked', done); el.currentTime = t; setTimeout(done, 3000); });
  const n = Math.min(8, Math.max(1, Math.ceil(m.dur / 4))); const tw = 96, th = Math.round(tw * (el.videoHeight || 9) / (el.videoWidth || 16));
  const strip = document.createElement('canvas'); strip.width = tw * n; strip.height = th; const sx = strip.getContext('2d');
  for (let i = 0; i < n; i++) { await seekTo(Math.min(m.dur - 0.05, (i + 0.5) * m.dur / n)); sx.drawImage(el, i * tw, 0, tw, th); if (i === 0) m.thumb = thumbOf(el, el.videoWidth, el.videoHeight); }
  m.strip = strip.toDataURL('image/jpeg', 0.6); m.stripN = n;
}
async function makePeaks(m) {
  try { const buf = await (await fetch(m.url)).arrayBuffer(); if (buf.byteLength > 300e6) return; const ac = new OfflineAudioContext(1, 44100, 44100); const ab = await ac.decodeAudioData(buf); const d = ab.getChannelData(0); const N = Math.min(4000, Math.ceil(ab.duration * 50)); const step = Math.floor(d.length / N); const peaks = new Float32Array(N); for (let i = 0; i < N; i++) { let mx = 0; for (let j = i * step; j < (i + 1) * step; j += 4) { const v = Math.abs(d[j]); if (v > mx) mx = v; } peaks[i] = mx; } m.peaks = peaks; m.hasAudio = true; renderTimeline(); } catch (e) { if (m.kind === 'video' && !ST.ffmpeg) m.hasAudio = false; }
}
function status(s) { $('#stInfo').textContent = s; }

// =====================================================================  left pane: bin / effects / titles
let ltab = 'media';
$('#ltabs').addEventListener('click', e => { const t = e.target.closest('.tab'); if (!t) return; ltab = t.dataset.t; document.querySelectorAll('#ltabs .tab').forEach(x => x.classList.toggle('active', x === t)); renderLeft(); });
function renderLeft() { ltab === 'media' ? renderBin() : ltab === 'effects' ? renderEffects() : renderTitles(); }
function renderBin() {
  if (ltab !== 'media') return; const b = $('#lbody'); b.innerHTML = '';
  b.append(h('div', { class: 'bin-tools' }, h('button', { class: 'btn sm primary', html: icon('plus') + 'Import', onclick: importDialog }), h('button', { class: 'btn sm', onclick: addColor }, 'Color matte'), h('span', { class: 'muted', style: { marginLeft: 'auto', alignSelf: 'center', fontSize: '11px' } }, `${PJ.media.length} item${PJ.media.length === 1 ? '' : 's'}`)));
  if (!PJ.media.length) { b.append(h('div', { class: 'empty-bin' }, 'Import videos, music and images, then drag them onto the timeline.', h('br'), h('br'), 'Supported: MP4, WebM, MOV, MP3, WAV, PNG, JPG')); return; }
  const g = h('div', { class: 'bin' });
  PJ.media.forEach(m => {
    const th = h('div', { class: 'th', style: m.thumb ? { backgroundImage: `url(${m.thumb})` } : {} }, m.kind === 'audio' ? h('span', { html: icon('music', 28) }) : '', h('span', { class: 'kind' }, m.kind), m.kind !== 'image' ? h('span', { class: 'dur' }, fmtTime(m.dur).slice(0, 8)) : '');
    const it = h('div', { class: 'mi', draggable: 'true', title: m.path }, th, h('div', { class: 'nm' }, (m.missing ? '⚠ ' : '') + m.name));
    it.ondragstart = e => { e.dataTransfer.setData('text/bts-media', m.id); e.dataTransfer.effectAllowed = 'copy'; dragMedia = m; };
    it.ondragend = () => { dragMedia = null; document.querySelectorAll('.row-t.drop').forEach(r => r.classList.remove('drop')); };
    it.ondblclick = () => appendMedia(m);
    it.oncontextmenu = e => contextMenu(e, [{ label: 'Insert at playhead', action: () => appendMedia(m, ST.t) }, { label: 'Append to end', action: () => appendMedia(m) }, { label: 'Relink…', action: () => relink(m) }, '-', { label: 'Remove from project', action: () => removeMedia(m) }]);
    g.append(it);
  });
  b.append(g);
}
async function relink(m) { const f = await bts.fs.open({}); if (!f) return; await importPath(f[0].path, m.name, m.id); clipEls.clear(); renderTimeline(); }
function removeMedia(m) { if (PJ.clips.some(c => c.mediaId === m.id) && !window.confirm('This media is used in the timeline. Remove it and its clips?')) return; PJ.clips = PJ.clips.filter(c => c.mediaId !== m.id); PJ.media = PJ.media.filter(x => x !== m); commit('Remove media'); renderBin(); renderTimeline(); }
const TRANSITIONS = [['fade', 'Fade / dissolve', 'linear-gradient(90deg,#000,#888)'], ['wipe', 'Wipe', 'linear-gradient(90deg,#9a7bff 50%,#333 50%)'], ['slide', 'Slide', 'linear-gradient(90deg,#333 30%,#9a7bff 30%)'], ['zoom', 'Zoom', 'radial-gradient(#9a7bff 30%,#333 31%)'], ['blur', 'Blur dissolve', 'linear-gradient(90deg,#333,#9a7bff)'], ['iris', 'Iris', 'radial-gradient(circle,#9a7bff 40%,#222 41%)']];
const LOOKS = [['None', {}], ['Black & white', { grayscale: 100, contrast: 110 }], ['Sepia', { sepia: 80 }], ['Vivid', { saturation: 145, contrast: 110 }], ['Warm', { sepia: 25, saturation: 115 }], ['Cool', { hue: -15, saturation: 90, brightness: 102 }], ['Vintage', { sepia: 45, contrast: 85, brightness: 105, saturation: 80 }], ['Dramatic', { contrast: 135, saturation: 75, brightness: 92 }], ['Dreamy', { blur: 1.2, brightness: 110, saturation: 115 }], ['Night', { brightness: 70, hue: 200, saturation: 60 }]];
function renderEffects() {
  const b = $('#lbody'); b.innerHTML = ''; const w = h('div', { class: 'fx-list' });
  w.append(h('h5', {}, 'Video transitions (apply to selected clip start)'));
  TRANSITIONS.forEach(([k, l, bg]) => { const it = h('div', { class: 'fx-it', draggable: 'true', onclick: () => applyTransition(k) }, h('span', { class: 'sw', style: { background: bg } }), l); it.ondragstart = e => e.dataTransfer.setData('text/bts-tr', k); w.append(it); });
  w.append(h('h5', {}, 'Looks / color presets'));
  LOOKS.forEach(([l, p]) => { const it = h('div', { class: 'fx-it', draggable: 'true', onclick: () => applyLook(p, l) }, h('span', { class: 'sw', style: { background: 'linear-gradient(135deg,#f59e0b,#3b82f6)', filter: lookCss(p) } }), l); it.ondragstart = e => e.dataTransfer.setData('text/bts-look', JSON.stringify(p)); w.append(it); });
  w.append(h('h5', {}, 'Audio'), h('div', { class: 'fx-it', onclick: quickFades }, h('span', { class: 'sw', style: { background: 'linear-gradient(90deg,#2f8a63,#111,#2f8a63)' } }), 'Fade in / out (0.5 s)'), h('div', { class: 'fx-it', onclick: () => setProp('volume', 0) }, h('span', { class: 'sw', style: { background: '#333' } }), 'Mute clip'));
  b.append(w);
}
const lookCss = p => `brightness(${(p.brightness ?? 100) / 100}) contrast(${(p.contrast ?? 100) / 100}) saturate(${(p.saturation ?? 100) / 100}) hue-rotate(${p.hue ?? 0}deg) grayscale(${(p.grayscale ?? 0) / 100}) sepia(${(p.sepia ?? 0) / 100})`;
const TITLE_TPL = {
  'Big title': { text: 'Your title', size: 120, weight: 800, anim: 'pop', ty: 0 },
  'Lower third': { text: 'Name Surname\nRole · Organisation', size: 46, weight: 600, align: 'left', box: true, boxColor: '#111827', boxOpacity: 75, anim: 'slide', ty: 330, x: -560 },
  'Subtitle': { text: 'Subtitle text goes here', size: 48, weight: 500, box: true, boxOpacity: 55, anim: 'fade', ty: 420 },
  'Chapter': { text: 'CHAPTER 1', size: 72, weight: 300, anim: 'type', ty: 0, outline: 0 },
  'Credits': { text: 'Directed by\nYour Name\n\nMusic\nArtist Name\n\nMade with BTS Video', size: 54, weight: 500, anim: 'roll', ty: 0 },
  'Outline': { text: 'BOLD STATEMENT', size: 110, weight: 900, color: '#ffffff', outline: 6, outlineColor: '#9a7bff', anim: 'pop' },
};
function renderTitles() {
  const b = $('#lbody'); b.innerHTML = ''; const w = h('div', { class: 'fx-list' });
  w.append(h('h5', {}, 'Title templates — click to add at playhead'));
  Object.keys(TITLE_TPL).forEach(k => { const it = h('div', { class: 'fx-it', draggable: 'true', onclick: () => addTitle(k) }, h('span', { class: 'sw', style: { background: '#b06a2b', display: 'grid', placeItems: 'center', fontSize: '11px', fontWeight: 700 } }, 'T'), k); it.ondragstart = e => e.dataTransfer.setData('text/bts-title', k); w.append(it); });
  b.append(w);
}

// =====================================================================  clip creation & editing
let dragMedia = null;
function freeTrack(kind, start, d, prefer) {
  const ts = PJ.tracks.filter(t => t.kind === kind && !t.locked); const order = kind === 'video' ? [...ts].reverse() : ts;
  if (prefer && order.some(t => t.id === prefer)) order.unshift(order.splice(order.findIndex(t => t.id === prefer), 1)[0]);
  return (order.find(t => !PJ.clips.some(c => c.track === t.id && c.start < start + d - 1e-6 && end(c) > start + 1e-6)) || order[0]).id;
}
function clipFromMedia(m, track, start) {
  const type = m.kind === 'audio' ? 'audio' : m.kind === 'image' ? 'image' : 'video';
  return { id: uid('c'), type, mediaId: m.id, track, start, in: 0, out: m.dur, name: m.name, props: defaultProps(type) };
}
function appendMedia(m, at) {
  if (m.missing) return toast('Media is offline — relink it first', 'err');
  const kind = m.kind === 'audio' ? 'audio' : 'video';
  const start = at ?? PJ.clips.filter(c => trackById(c.track).kind === kind && (kind === 'audio' || c.track === 'V1')).reduce((mx, c) => Math.max(mx, end(c)), 0);
  const track = at != null ? freeTrack(kind, start, m.dur, kind === 'video' ? 'V1' : 'A1') : (kind === 'video' ? 'V1' : 'A1');
  const c = clipFromMedia(m, track, start); placeClip(c); select([c.id]); commit('Add clip'); renderTimeline();
}
function placeClip(c) { overwrite(c); PJ.clips.push(c); }
function overwrite(c) {
  // overwrite edit: remove/trim anything under c on its track
  const s = c.start, e = end(c), add = [];
  PJ.clips = PJ.clips.filter(o => {
    if (o === c || o.track !== c.track) return true; const os = o.start, oe = end(o);
    if (oe <= s + 1e-6 || os >= e - 1e-6) return true;
    if (os >= s && oe <= e) return false;
    if (os < s && oe > e) { const right = JSON.parse(JSON.stringify(o)); right.id = uid('c'); const cut = e - os; right.in = o.in + cut * spd(o); right.start = e; add.push(right); o.out = o.in + (s - os) * spd(o); return true; }
    if (os < s) { o.out = o.in + (s - os) * spd(o); return true; }
    const cut = e - os; o.in += cut * spd(o); o.start = e; return true;
  });
  PJ.clips.push(...add);
}
function addTitle(tpl) {
  const p = { ...defaultProps('title'), ...(TITLE_TPL[tpl] || {}) };
  const track = freeTrack('video', ST.t, 4, 'V2');
  const c = { id: uid('c'), type: 'title', mediaId: null, track, start: ST.t, in: 0, out: tpl === 'Credits' ? 8 : 4, name: p.text.split('\n')[0], props: p };
  placeClip(c); select([c.id]); commit('Add title'); renderTimeline(); drawFrame();
}
UI.shortcut('ctrl+t', () => addTitle('Big title'));
function addColor() { const c = { id: uid('c'), type: 'color', mediaId: null, track: freeTrack('video', ST.t, 5, 'V1'), start: ST.t, in: 0, out: 5, name: 'Color matte', props: defaultProps('color') }; placeClip(c); select([c.id]); commit('Color matte'); renderTimeline(); drawFrame(); }
function addTrack(kind) { const n = PJ.tracks.filter(t => t.kind === kind).length + 1; const t = { id: (kind === 'video' ? 'V' : 'A') + n, kind, muted: false, hidden: false, locked: false }; if (kind === 'video') PJ.tracks.unshift(t); else PJ.tracks.push(t); commit('Add track'); renderTimeline(); }
function selected() { return PJ.clips.filter(c => ST.sel.has(c.id)); }
function select(ids) { ST.sel = new Set(ids); renderTimeline(); renderFx(); }
function splitAtPlayhead() {
  const t = ST.t; let targets = selected().filter(c => c.start < t && end(c) > t); if (!targets.length) targets = PJ.clips.filter(c => c.start < t - 1e-3 && end(c) > t + 1e-3 && !trackById(c.track).locked);
  if (!targets.length) return toast('Nothing under the playhead to split');
  targets.forEach(c => splitClip(c, t)); commit('Split'); renderTimeline(); renderFx();
}
function splitClip(c, t) {
  if (t <= c.start + 1e-3 || t >= end(c) - 1e-3) return null;
  const right = JSON.parse(JSON.stringify(c)); right.id = uid('c'); const off = (t - c.start) * spd(c);
  c.out = c.in + off; right.in = c.in + off; right.start = t; right.props.trIn = 'none'; c.props.trOut = 'none'; c.props.fadeOut = 0; right.props.fadeIn = 0;
  PJ.clips.push(right); return right;
}
UI.shortcut('ctrl+k', splitAtPlayhead);
function deleteClips(ripple) {
  const sel = selected(); if (!sel.length) return;
  PJ.clips = PJ.clips.filter(c => !ST.sel.has(c.id));
  if (ripple) sel.forEach(s => { const d = dur(s); PJ.clips.forEach(c => { if (c.track === s.track && c.start >= end(s) - 1e-6) c.start -= d; }); });
  ST.sel.clear(); commit(ripple ? 'Ripple delete' : 'Delete'); renderTimeline(); renderFx(); drawFrame();
}
UI.shortcut('delete', () => deleteClips(false)); UI.shortcut('backspace', () => deleteClips(false)); UI.shortcut('shift+delete', () => deleteClips(true));
let clipBoard = null;
function copyClips() { const s = selected(); if (!s.length) return; const t0 = Math.min(...s.map(c => c.start)); clipBoard = s.map(c => ({ ...JSON.parse(JSON.stringify(c)), start: c.start - t0 })); toast(`Copied ${s.length} clip(s)`); }
function cutClips() { copyClips(); deleteClips(false); }
function pasteClips() { if (!clipBoard) return; const ids = []; clipBoard.forEach(c => { const n = JSON.parse(JSON.stringify(c)); n.id = uid('c'); n.start += ST.t; placeClip(n); ids.push(n.id); }); select(ids); commit('Paste'); }
function duplicateClips() { const s = selected(); if (!s.length) return; const ids = []; s.forEach(c => { const n = JSON.parse(JSON.stringify(c)); n.id = uid('c'); n.start = end(c); placeClip(n); ids.push(n.id); }); select(ids); commit('Duplicate'); }
UI.shortcut('ctrl+c', copyClips); UI.shortcut('ctrl+x', cutClips); UI.shortcut('ctrl+v', pasteClips); UI.shortcut('ctrl+shift+d', duplicateClips);
UI.shortcut('ctrl+a', () => { PJ.clips.forEach(c => ST.sel.add(c.id)); renderTimeline(); renderFx(); }); UI.shortcut('ctrl+shift+a', () => select([]));
function applyTransition(kind, clip) {
  const cs = clip ? [clip] : selected().filter(c => c.type !== 'audio'); if (!cs.length) return toast('Select a video, image or title clip first');
  cs.forEach(c => { c.props.trIn = kind; c.props.trDur = Math.min(c.props.trDur || 1, dur(c) / 2); }); commit('Transition'); renderTimeline(); renderFx(); drawFrame();
}
function applyLook(p, name, clip) { const cs = clip ? [clip] : selected().filter(c => c.type !== 'audio'); if (!cs.length) return toast('Select a clip first'); cs.forEach(c => Object.assign(c.props, { brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, grayscale: 0, sepia: 0, ...p })); commit('Look: ' + name); renderFx(); drawFrame(); }
function quickFades() { const cs = selected(); if (!cs.length) return toast('Select a clip first'); cs.forEach(c => { c.props.fadeIn = Math.min(0.5, dur(c) / 3); c.props.fadeOut = Math.min(0.5, dur(c) / 3); }); commit('Fades'); renderTimeline(); renderFx(); }
function setProp(k, v) { const cs = selected(); if (!cs.length) return; cs.forEach(c => c.props[k] = v); commit('Change ' + k); renderFx(); drawFrame(); renderTimeline(); }
function resetEffects() { selected().forEach(c => { const keep = c.type === 'title' ? { text: c.props.text } : {}; c.props = { ...defaultProps(c.type), ...(c.type === 'title' ? c.props : {}), ...keep, brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, grayscale: 0, sepia: 0, x: 0, y: 0, scale: 100, rotation: 0, opacity: 100 }; }); commit('Reset effects'); renderFx(); drawFrame(); }
async function speedDialog() {
  const c = selected()[0]; if (!c || !['video', 'audio'].includes(c.type)) return toast('Select a video or audio clip');
  const v = await form({ title: 'Clip speed', fields: [{ key: 's', label: 'Speed %', type: 'number', value: Math.round((c.props.speed || 1) * 100), min: 10, max: 1000 }] }); if (!v) return;
  const sp = clamp(+v.s, 10, 1000) / 100; const srcLen = (c.out - c.in) * 1; c.props.speed = sp; toast('Speed changes apply to preview and export (audio pitch follows speed).'); commit('Speed'); renderTimeline(); drawFrame();
}
UI.shortcut('ctrl+r', speedDialog);
function closeGaps() { PJ.tracks.forEach(t => { let pos = 0; PJ.clips.filter(c => c.track === t.id).sort((a, b) => a.start - b.start).forEach(c => { c.start = pos; pos = end(c); }); }); commit('Close gaps'); renderTimeline(); drawFrame(); }
// clip duration on timeline accounts for speed
const tlDur = c => (c.out - c.in) / (c.props.speed || 1);
// override end()/dur() helpers with speed-aware versions
function cEnd(c) { return c.start + tlDur(c); }

// =====================================================================  timeline UI
const ROWH = { video: 58, audio: 46 };
function renderHead() {
  const hd = $('#tlHead'); hd.innerHTML = '';
  const tool = (id, ic, tip) => h('button', { class: 'icon-btn' + (ST.tool === id ? ' active' : ''), 'data-tip': tip, html: icon(ic), onclick: () => { ST.tool = id; $('#tlScroll').classList.toggle('razor', id === 'razor'); renderHead(); } });
  const z = h('input', { type: 'range', min: 5, max: 400, value: ST.pps, style: { width: '120px' } }); z.oninput = () => { setPps(+z.value); };
  hd.append(h('span', { class: 'tc', id: 'tcTl' }, tc(ST.t)), tool('select', 'select', 'Selection (V)'), tool('razor', 'scissors', 'Razor (C)'),
    h('button', { class: 'icon-btn' + (ST.snap ? ' active' : ''), 'data-tip': 'Snapping (S)', html: icon('magnet'), onclick: () => { ST.snap = !ST.snap; renderHead(); } }),
    h('div', { class: 'vsep' }), h('button', { class: 'btn sm ghost', html: icon('plus') + 'Video track', onclick: () => addTrack('video') }), h('button', { class: 'btn sm ghost', html: icon('plus') + 'Audio track', onclick: () => addTrack('audio') }),
    h('div', { style: { flex: 1 } }), h('span', { class: 'muted' }, 'Zoom'), h('button', { class: 'btn sm ghost', onclick: () => zoomTl(1 / 1.4) }, '−'), z, h('button', { class: 'btn sm ghost', onclick: () => zoomTl(1.4) }, '+'), h('button', { class: 'btn sm ghost', onclick: fitTl }, 'Fit'));
}
function setPps(v) { const sc = $('#tlScroll'); const center = (sc.scrollLeft + sc.clientWidth / 2) / ST.pps; ST.pps = clamp(v, 2, 600); renderTimeline(); sc.scrollLeft = center * ST.pps - sc.clientWidth / 2; }
function zoomTl(f) { setPps(ST.pps * f); renderHead(); }
function fitTl() { const w = $('#tlScroll').clientWidth - 40; ST.pps = clamp(w / Math.max(10, seqDuration()), 2, 600); renderTimeline(); renderHead(); }
UI.shortcut('=', () => zoomTl(1.4)); UI.shortcut('-', () => zoomTl(1 / 1.4)); UI.shortcut('\\', fitTl);
UI.shortcut('v', () => { ST.tool = 'select'; $('#tlScroll').classList.remove('razor'); renderHead(); }); UI.shortcut('c', () => { ST.tool = 'razor'; $('#tlScroll').classList.add('razor'); renderHead(); }); UI.shortcut('s', () => { ST.snap = !ST.snap; renderHead(); });
const clipEls = new Map();
function renderTimeline() {
  const rows = $('#tlRows'), hdr = $('#tlTracksH'); rows.innerHTML = ''; hdr.innerHTML = '';
  const total = Math.max(seqDuration() + 30, ($('#tlScroll').clientWidth || 1000) / ST.pps); const W = Math.ceil(total * ST.pps);
  $('#tlInner').style.width = W + 'px';
  hdr.append(h('div', { class: 'th-pad' }));
  const grid = ST.pps >= 40 ? ST.pps : ST.pps >= 10 ? ST.pps * 5 : ST.pps * 30; rows.style.setProperty('--grid', grid + 'px');
  PJ.tracks.forEach(t => {
    const H = ROWH[t.kind];
    const tbtn = (on, label, fn, tip) => h('button', { class: 'tb' + (on ? ' on' : ''), 'data-tip': tip, html: label, onclick: fn });
    hdr.append(h('div', { class: 'track-h', style: { height: H + 'px' } }, h('span', { class: 'tn' }, t.id),
      t.kind === 'video' ? tbtn(t.hidden, icon('eyeOff'), () => { t.hidden = !t.hidden; renderTimeline(); drawFrame(); }, 'Hide track') : tbtn(t.muted, 'M', () => { t.muted = !t.muted; renderTimeline(); }, 'Mute track'),
      t.kind === 'video' ? tbtn(t.muted, 'M', () => { t.muted = !t.muted; renderTimeline(); }, 'Mute audio') : '',
      tbtn(t.locked, icon('lock'), () => { t.locked = !t.locked; renderTimeline(); }, 'Lock track')));
    const row = h('div', { class: 'row-t ' + t.kind, style: { height: H + 'px' }, 'data-track': t.id });
    row.ondragover = e => { const ty = e.dataTransfer.types; if (ty.includes('text/bts-media') || ty.includes('text/bts-title')) { const okKind = ty.includes('text/bts-title') ? 'video' : (dragMedia?.kind === 'audio' ? 'audio' : 'video'); if (okKind === t.kind && !t.locked) { e.preventDefault(); row.classList.add('drop'); } } };
    row.ondragleave = () => row.classList.remove('drop');
    row.ondrop = e => { e.preventDefault(); row.classList.remove('drop'); const r = row.getBoundingClientRect(); let at = Math.max(0, (e.clientX - r.left) / ST.pps); at = snapTime(at, null).t;
      const mid = e.dataTransfer.getData('text/bts-media'); const tt = e.dataTransfer.getData('text/bts-title');
      if (mid) { const m = mediaById(mid); if (!m || m.missing) return; const c = clipFromMedia(m, t.id, at); placeClip(c); select([c.id]); commit('Add clip'); }
      else if (tt) { const save = ST.t; ST.t = at; addTitle(tt); ST.t = save; const c = selected()[0]; if (c && c.track !== t.id) { c.track = t.id; overwrite(c); } renderTimeline(); }
      drawFrame(); };
    PJ.clips.filter(c => c.track === t.id).forEach(c => row.append(clipEl(c, t)));
    rows.append(row);
  });
  drawRuler(); placePlayhead();
  $('#tcDur').textContent = tc(seqDuration());
  const s = selected(); $('#stSel').textContent = s.length ? `${s.length} clip${s.length > 1 ? 's' : ''} selected` : `${PJ.clips.length} clips · ${tc(seqDuration())}`;
}
function clipEl(c, t) {
  const m = c.mediaId ? mediaById(c.mediaId) : null; const W = Math.max(4, tlDur(c) * ST.pps);
  const el = h('div', { class: `clip ${c.type}${ST.sel.has(c.id) ? ' sel' : ''}${m?.missing ? ' missing' : ''}`, style: { left: c.start * ST.pps + 'px', width: W + 'px' }, 'data-id': c.id });
  el.append(h('div', { class: 'cl' }, (c.props.speed && c.props.speed !== 1 ? `${Math.round(c.props.speed * 100)}% · ` : '') + (c.type === 'title' ? 'T  ' + (c.props.text || '').split('\n')[0] : c.name)));
  if (c.type === 'video' && m?.strip) { const stripPx = (h0 => h0)(ROWH.video - 24); el.append(h('div', { class: 'strip', style: { backgroundImage: `url(${m.strip})`, backgroundSize: `${stripPx * 16 / 9 * (m.stripN || 1)}px 100%` } })); }
  if (c.type === 'image' && m?.thumb) el.append(h('div', { class: 'strip', style: { backgroundImage: `url(${m.thumb})`, backgroundSize: 'auto 100%' } }));
  if (c.type === 'color') el.style.background = c.props.color;
  if ((c.type === 'audio' || (c.type === 'video' && t.kind === 'audio')) && m?.peaks) { const cv = h('canvas', { class: 'wave', width: Math.min(4000, Math.ceil(W)), height: 40 }); drawWave(cv, m, c); el.append(cv); }
  if (c.type === 'video' && m?.peaks && m.hasAudio) { const cv = h('canvas', { class: 'wave', width: Math.min(4000, Math.ceil(W)), height: 30, style: { height: '35%', opacity: .5 } }); drawWave(cv, m, c); el.append(cv); }
  if (c.props.trIn && c.props.trIn !== 'none') el.append(h('div', { class: 'tr', style: { width: c.props.trDur * ST.pps + 'px' }, title: 'Transition: ' + c.props.trIn }));
  if (c.props.fadeIn) el.append(h('div', { class: 'tr', style: { width: c.props.fadeIn * ST.pps + 'px', opacity: .6 } }));
  if (c.props.fadeOut) el.append(h('div', { class: 'tro', style: { width: c.props.fadeOut * ST.pps + 'px' } }));
  el.append(h('div', { class: 'edge l' }), h('div', { class: 'edge r' }));
  el.addEventListener('pointerdown', e => clipPointerDown(e, c, el));
  el.addEventListener('dblclick', () => { select([c.id]); seek(c.start); });
  el.addEventListener('contextmenu', e => { if (!ST.sel.has(c.id)) select([c.id]); contextMenu(e, [{ label: 'Split at playhead', action: splitAtPlayhead }, { label: 'Duplicate', action: duplicateClips }, { label: 'Copy', action: copyClips }, '-', { label: 'Transition', sub: TRANSITIONS.map(([k, l]) => ({ label: l, action: () => applyTransition(k) })).concat([{ label: 'None', action: () => setProp('trIn', 'none') }]) }, { label: 'Fade in / out', action: quickFades }, { label: 'Speed…', action: speedDialog, disabled: !['video', 'audio'].includes(c.type) }, '-', { label: 'Delete', action: () => deleteClips(false) }, { label: 'Ripple delete', action: () => deleteClips(true) }]); });
  el.ondragover = e => { if (e.dataTransfer.types.includes('text/bts-tr') || e.dataTransfer.types.includes('text/bts-look')) e.preventDefault(); };
  el.ondrop = e => { const tr = e.dataTransfer.getData('text/bts-tr'), lk = e.dataTransfer.getData('text/bts-look'); if (tr) { e.preventDefault(); e.stopPropagation(); applyTransition(tr, c); } else if (lk) { e.preventDefault(); e.stopPropagation(); applyLook(JSON.parse(lk), 'preset', c); } };
  return el;
}
function drawWave(cv, m, c) {
  const x = cv.getContext('2d'), W = cv.width, H = cv.height, n = m.peaks.length, per = m.dur / n; x.fillStyle = 'rgba(255,255,255,.75)';
  for (let i = 0; i < W; i++) { const st = c.in + (i / W) * (c.out - c.in); const k = Math.floor(st / per); const v = m.peaks[clamp(k, 0, n - 1)] * (c.props.volume / 100); const hh = Math.max(1, v * H); x.fillRect(i, (H - hh) / 2, 1, hh); }
}
function drawRuler() {
  const cv = $('#ruler'); const W = $('#tlInner').clientWidth || parseInt($('#tlInner').style.width); const dpr = devicePixelRatio;
  const sc = $('#tlScroll'); cv.width = sc.clientWidth * dpr; cv.height = 30 * dpr; cv.style.width = sc.clientWidth + 'px'; cv.style.marginLeft = sc.scrollLeft + 'px'; cv.style.position = 'sticky'; cv.style.left = '0';
  const x = cv.getContext('2d'); x.scale(dpr, dpr); x.fillStyle = '#1c1d22'; x.fillRect(0, 0, sc.clientWidth, 30);
  const steps = [1 / PJ.seq.fps, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]; const major = steps.find(s => s * ST.pps >= 80) || 600; const minor = major / (major >= 1 ? 5 : 2);
  const t0 = sc.scrollLeft / ST.pps, t1 = (sc.scrollLeft + sc.clientWidth) / ST.pps;
  x.strokeStyle = '#3b3d45'; x.fillStyle = '#8b8e99'; x.font = '10.5px Segoe UI, sans-serif'; x.beginPath();
  for (let t = Math.floor(t0 / minor) * minor; t <= t1; t += minor) { const px = t * ST.pps - sc.scrollLeft; const isMaj = Math.abs(t / major - Math.round(t / major)) < 1e-6; x.moveTo(px + 0.5, isMaj ? 14 : 22); x.lineTo(px + 0.5, 30); if (isMaj) x.fillText(major < 1 ? tc(t).slice(3) : tc(t).slice(0, 8), px + 4, 12); }
  x.stroke();
}
function placePlayhead() { const ph = $('#playhead'); ph.style.left = ST.t * ST.pps + 'px'; const tt = $('#tcTl'); if (tt) tt.textContent = tc(ST.t); $('#tcCur').textContent = tc(ST.t); }
$('#tlScroll').addEventListener('scroll', () => { drawRuler(); $('#tlTracksH').scrollTop = $('#tlScroll').scrollTop; });
// scrub on ruler
$('#ruler').addEventListener('pointerdown', e => { const sc = $('#tlScroll'); const r = sc.getBoundingClientRect(); const go = ev => seek(Math.max(0, (ev.clientX - r.left + sc.scrollLeft) / ST.pps)); go(e); const mv = ev => go(ev); window.addEventListener('pointermove', mv); window.addEventListener('pointerup', () => window.removeEventListener('pointermove', mv), { once: true }); });
$('#tlRows').addEventListener('pointerdown', e => { if (e.target.closest('.clip')) return; if (!e.shiftKey) select([]); const sc = $('#tlScroll'); const r = sc.getBoundingClientRect(); seek(Math.max(0, (e.clientX - r.left + sc.scrollLeft) / ST.pps)); });
$('#tlScroll').addEventListener('wheel', e => { if (e.ctrlKey || e.altKey) { e.preventDefault(); zoomTl(e.deltaY < 0 ? 1.2 : 1 / 1.2); } }, { passive: false });
function snapTime(t, exclude, excludeIds) {
  if (!ST.snap) return { t, snapped: false };
  const cands = [0, ST.t]; PJ.clips.forEach(c => { if (exclude && c.id === exclude) return; if (excludeIds && excludeIds.has(c.id)) return; cands.push(c.start, cEnd(c)); });
  const tol = 8 / ST.pps; let best = null; cands.forEach(v => { if (Math.abs(v - t) < tol && (best == null || Math.abs(v - t) < Math.abs(best - t))) best = v; });
  return best != null ? { t: best, snapped: true } : { t, snapped: false };
}
function showSnap(t) { const s = $('#snapline'); if (t == null) s.classList.add('hidden'); else { s.classList.remove('hidden'); s.style.left = t * ST.pps + 'px'; } }
function clipPointerDown(e, c, el) {
  if (e.button !== 0) return; e.stopPropagation(); const t = trackById(c.track); if (t.locked) return;
  const sc = $('#tlScroll'), r = sc.getBoundingClientRect(); const tAt = ev => (ev.clientX - r.left + sc.scrollLeft) / ST.pps;
  if (ST.tool === 'razor') { const at = snapTime(tAt(e), c.id).t; if (splitClip(c, at)) { commit('Razor'); renderTimeline(); drawFrame(); } return; }
  if (e.shiftKey || e.ctrlKey) { ST.sel.has(c.id) ? ST.sel.delete(c.id) : ST.sel.add(c.id); renderTimeline(); renderFx(); return; }
  if (!ST.sel.has(c.id)) select([c.id]);
  const edge = e.target.classList.contains('edge') ? (e.target.classList.contains('l') ? 'l' : 'r') : null;
  const m = c.mediaId ? mediaById(c.mediaId) : null; const maxSrc = m && m.kind !== 'image' ? m.dur : Infinity; const sp = c.props.speed || 1;
  const t0 = tAt(e), y0 = e.clientY, orig = selected().map(x => ({ c: x, start: x.start, in: x.in, out: x.out, track: x.track }));
  let moved = false;
  const move = ev => {
    const dt = tAt(ev) - t0; moved = true;
    if (edge === 'l') { let ns = snapTime(c.start + dt * 0 + (orig[0].start + dt - c.start) + c.start - c.start, c.id).t; ns = orig.find(o => o.c === c).start + dt; const sn = snapTime(ns, c.id); ns = sn.t; showSnap(sn.snapped ? ns : null); const o = orig.find(o => o.c === c); let d = ns - o.start; d = Math.max(d, -o.in / sp); d = Math.min(d, (o.out - o.in) / sp - 1 / PJ.seq.fps); c.start = o.start + d; c.in = o.in + d * sp; }
    else if (edge === 'r') { const o = orig.find(o => o.c === c); let ne = o.start + (o.out - o.in) / sp + dt; const sn = snapTime(ne, c.id); ne = sn.t; showSnap(sn.snapped ? ne : null); c.out = clamp(o.in + (ne - o.start) * sp, o.in + 1 / PJ.seq.fps, maxSrc); }
    else {
      const dy = ev.clientY - y0; const rowsEls = [...document.querySelectorAll('.row-t')]; const hover = rowsEls.find(rr => { const b = rr.getBoundingClientRect(); return ev.clientY >= b.top && ev.clientY < b.bottom; });
      let d = dt; const o0 = orig.find(o => o.c === c); const sn1 = snapTime(o0.start + d, null, ST.sel), sn2 = snapTime(o0.start + tlDur(c) + d, null, ST.sel);
      if (sn1.snapped) { d = sn1.t - o0.start; showSnap(sn1.t); } else if (sn2.snapped) { d = sn2.t - o0.start - tlDur(c); showSnap(sn2.t); } else showSnap(null);
      d = Math.max(d, -Math.min(...orig.map(o => o.start)));
      orig.forEach(o => { o.c.start = o.start + d; });
      if (hover && orig.length === 1 && Math.abs(dy) > 12) { const nt = trackById(hover.dataset.track); const kindOk = (c.type === 'audio') === (nt.kind === 'audio'); if (kindOk && !nt.locked) c.track = nt.id; }
    }
    renderTimelineFast(); drawFrameSoon();
  };
  const up = () => { window.removeEventListener('pointermove', move); showSnap(null); if (moved) { if (!edge) selected().forEach(x => overwrite(x)); commit(edge ? 'Trim' : 'Move'); renderTimeline(); renderFx(); drawFrame(); } };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true });
}
function renderTimelineFast() { PJ.clips.forEach(c => { const el = document.querySelector(`.clip[data-id="${c.id}"]`); if (!el) return; if (el.parentElement.dataset.track !== c.track) { const row = document.querySelector(`.row-t[data-track="${c.track}"]`); row && row.append(el); } el.style.left = c.start * ST.pps + 'px'; el.style.width = Math.max(4, tlDur(c) * ST.pps) + 'px'; }); }

// =====================================================================  effect controls
function renderFx() {
  const b = $('#fx'); b.innerHTML = ''; const s = selected();
  if (s.length !== 1) { b.append(h('div', { class: 'ec' }, h('div', { class: 'none' }, s.length ? `${s.length} clips selected` : 'Select a clip in the timeline to edit its motion, opacity, color, audio and transitions.'))); return; }
  const c = s[0], p = c.props; const w = h('div', { class: 'ec' });
  const live = () => { drawFrameSoon(); }; const done = l => commitDebounced(l);
  const slider = (label, key, min, max, step = 1, unit = '') => { const r = h('input', { type: 'range', min, max, step, value: p[key] }); const n = h('input', { type: 'number', min, max, step, value: p[key] }); r.oninput = () => { p[key] = +r.value; n.value = r.value; live(); done(label); if (['fadeIn', 'fadeOut', 'trDur', 'volume'].includes(key)) renderTimelineSoon(); }; n.oninput = () => { p[key] = +n.value; r.value = n.value; live(); done(label); }; return h('div', { class: 'p' }, h('span', {}, label), r, n); };
  const sel = (label, key, opts) => { const s2 = h('select', {}, ...opts.map(([v, l]) => h('option', { value: v, selected: p[key] == v }, l))); s2.onchange = () => { p[key] = isNaN(+s2.value) || s2.value === '' ? s2.value : +s2.value; live(); commit(label); renderTimeline(); renderFx(); }; return h('div', { class: 'p2' }, h('span', {}, label), s2); };
  const grp = (title, ...kids) => h('div', { class: 'grp' }, h('h5', {}, title), ...kids);
  w.append(h('div', { class: 'grp' }, h('div', { style: { fontWeight: 600, color: 'var(--tx-0)' } }, c.type === 'title' ? 'Title' : c.name), h('div', { class: 'muted', style: { fontSize: '11px', marginTop: '3px' } }, `${c.track} · ${tc(c.start)} → ${tc(cEnd(c))} · ${tlDur(c).toFixed(2)}s`)));
  if (c.type === 'title') {
    const ta = h('textarea', { rows: 3 }, p.text); ta.oninput = () => { p.text = ta.value; c.name = ta.value.split('\n')[0]; live(); done('Title text'); };
    const font = h('select', {}, ...['Segoe UI', 'Arial', 'Arial Black', 'Impact', 'Georgia', 'Times New Roman', 'Verdana', 'Trebuchet MS', 'Courier New', 'Comic Sans MS', 'Segoe Script', 'Nirmala UI'].map(f => h('option', { selected: f === p.font }, f))); font.onchange = () => { p.font = font.value; live(); commit('Font'); };
    const col = h('input', { type: 'color', value: p.color }); col.oninput = () => { p.color = col.value; live(); done('Text color'); };
    const box = h('input', { type: 'checkbox', checked: p.box }); box.onchange = () => { p.box = box.checked; live(); commit('Text box'); };
    const boxC = h('input', { type: 'color', value: p.boxColor }); boxC.oninput = () => { p.boxColor = boxC.value; live(); done('Box color'); };
    const sh = h('input', { type: 'checkbox', checked: p.shadow }); sh.onchange = () => { p.shadow = sh.checked; live(); commit('Shadow'); };
    const oc = h('input', { type: 'color', value: p.outlineColor }); oc.oninput = () => { p.outlineColor = oc.value; live(); done('Outline'); };
    w.append(grp('Text', ta, h('div', { class: 'p2', style: { marginTop: '8px' } }, h('span', {}, 'Font'), font), slider('Size', 'size', 8, 400), sel('Weight', 'weight', [[300, 'Light'], [400, 'Regular'], [600, 'Semibold'], [700, 'Bold'], [900, 'Black']]), sel('Align', 'align', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']]),
      h('div', { class: 'p2' }, h('span', {}, 'Color'), col), h('label', { class: 'p2' }, h('span', {}, 'Shadow'), sh), slider('Outline', 'outline', 0, 20), h('div', { class: 'p2' }, h('span', {}, 'Outline color'), oc),
      h('label', { class: 'p2' }, h('span', {}, 'Background'), h('div', { class: 'row' }, box, boxC)), slider('Box opacity', 'boxOpacity', 0, 100),
      sel('Animation', 'anim', [['none', 'None'], ['fade', 'Fade'], ['pop', 'Pop'], ['slide', 'Slide in'], ['rise', 'Rise'], ['type', 'Typewriter'], ['roll', 'Credits roll']])));
  }
  if (c.type === 'color') { const col = h('input', { type: 'color', value: p.color }); col.oninput = () => { p.color = col.value; live(); done('Color'); renderTimelineSoon(); }; w.append(grp('Color matte', h('div', { class: 'p2' }, h('span', {}, 'Color'), col))); }
  if (c.type !== 'audio') {
    w.append(grp('Motion', slider('Position X', 'x', -PJ.seq.w, PJ.seq.w), slider('Position Y', c.type === 'title' ? 'ty' : 'y', -PJ.seq.h, PJ.seq.h), slider('Scale %', 'scale', 1, 500), slider('Rotation°', 'rotation', -180, 180), c.type !== 'title' && c.type !== 'color' ? sel('Frame fit', 'fit', [['fit', 'Fit (letterbox)'], ['fill', 'Fill (crop)'], ['stretch', 'Stretch']]) : ''),
      grp('Opacity', slider('Opacity %', 'opacity', 0, 100), slider('Fade in (s)', 'fadeIn', 0, Math.min(10, tlDur(c)), 0.05), slider('Fade out (s)', 'fadeOut', 0, Math.min(10, tlDur(c)), 0.05)),
      grp('Transition', sel('In', 'trIn', [['none', 'None'], ...TRANSITIONS.map(([k, l]) => [k, l])]), slider('In duration', 'trDur', 0.1, Math.min(5, tlDur(c)), 0.05), sel('Out', 'trOut', [['none', 'None'], ...TRANSITIONS.map(([k, l]) => [k, l])]), slider('Out duration', 'trOutDur', 0.1, Math.min(5, tlDur(c)), 0.05)));
    if (c.type !== 'title') w.append(grp('Color', slider('Brightness', 'brightness', 0, 200), slider('Contrast', 'contrast', 0, 200), slider('Saturation', 'saturation', 0, 300), slider('Hue°', 'hue', -180, 180), slider('Blur px', 'blur', 0, 30, 0.1), slider('Grayscale', 'grayscale', 0, 100), slider('Sepia', 'sepia', 0, 100)));
  }
  if (c.type === 'audio' || (c.type === 'video' && mediaById(c.mediaId)?.hasAudio)) w.append(grp('Audio', slider('Volume %', 'volume', 0, 200), c.type === 'audio' ? slider('Fade in (s)', 'fadeIn', 0, Math.min(10, tlDur(c)), 0.05) : '', c.type === 'audio' ? slider('Fade out (s)', 'fadeOut', 0, Math.min(10, tlDur(c)), 0.05) : ''));
  if (c.type === 'video' || c.type === 'audio') w.append(grp('Speed', slider('Speed ×', 'speed', 0.1, 8, 0.05)));
  w.append(h('div', { class: 'grp' }, h('button', { class: 'btn sm', onclick: resetEffects }, 'Reset effects')));
  b.append(w);
}
let rtT = null; function renderTimelineSoon() { clearTimeout(rtT); rtT = setTimeout(renderTimeline, 120); }

// =====================================================================  rendering engine
const prog = $('#program'); const pctx = prog.getContext('2d');
function layoutMonitor() { prog.width = PJ.seq.w; prog.height = PJ.seq.h; const v = $('#monView').getBoundingClientRect(); const k = Math.min((v.width - 20) / PJ.seq.w, (v.height - 20) / PJ.seq.h); prog.style.width = PJ.seq.w * k + 'px'; prog.style.height = PJ.seq.h * k + 'px'; const sf = $('#safe'); sf.classList.toggle('hidden', !ST.safe); Object.assign(sf.style, { width: PJ.seq.w * k * 0.9 + 'px', height: PJ.seq.h * k * 0.9 + 'px' }); $('#seqInfo').textContent = `${PJ.seq.w}×${PJ.seq.h} · ${PJ.seq.fps} fps`; drawFrame(); }
new ResizeObserver(layoutMonitor).observe($('#monView'));
const els = new Map(); // clip id -> media element
let audioCtx = null, masterGain = null, recDest = null;
function ensureAudio() { if (audioCtx) return; audioCtx = new AudioContext(); masterGain = audioCtx.createGain(); masterGain.connect(audioCtx.destination); recDest = audioCtx.createMediaStreamDestination(); masterGain.connect(recDest); }
function elFor(c) {
  let e = els.get(c.id); const m = mediaById(c.mediaId); if (!m || m.missing) return null;
  if (e && e._url === m.url) return e;
  if (m.kind === 'image') return m.el || null;
  e = document.createElement(m.kind === 'audio' ? 'audio' : 'video'); e.src = m.url; e.preload = 'auto'; e.playsInline = true; e._url = m.url; e.crossOrigin = 'anonymous';
  e.addEventListener('seeked', () => { if (!ST.playing && !EXP.on) drawFrame(); });
  e.addEventListener('loadeddata', () => { if (!ST.playing) drawFrame(); });
  try { ensureAudio(); const src = audioCtx.createMediaElementSource(e); const g = audioCtx.createGain(); src.connect(g); g.connect(masterGain); e._gain = g; } catch (err) { /* already connected */ }
  els.set(c.id, e); return e;
}
function activeClips(t) { return PJ.clips.filter(c => c.start <= t + 1e-6 && cEnd(c) > t + 1e-6 && !(trackById(c.track)?.hidden && c.type !== 'audio')); }
const easeOut = x => 1 - Math.pow(1 - x, 3);
function clipAlpha(c, lt, D) { const p = c.props; let a = p.opacity / 100; if (p.fadeIn && lt < p.fadeIn) a *= lt / p.fadeIn; if (p.fadeOut && lt > D - p.fadeOut) a *= Math.max(0, (D - lt) / p.fadeOut); return a; }
function transitionState(c, lt, D) {
  const p = c.props; const st = { alpha: 1, dx: 0, scale: 1, clip: null, blur: 0 };
  const apply = (kind, k, dir) => { // k: 0 → hidden, 1 → fully shown
    if (kind === 'fade') st.alpha *= k; else if (kind === 'slide') st.dx += (1 - easeOut(k)) * PJ.seq.w * dir; else if (kind === 'zoom') { st.scale *= 0.6 + 0.4 * easeOut(k); st.alpha *= k; } else if (kind === 'wipe') st.clip = { type: 'wipe', k, dir }; else if (kind === 'iris') st.clip = { type: 'iris', k }; else if (kind === 'blur') { st.blur += (1 - k) * 30; st.alpha *= k; } };
  if (p.trIn && p.trIn !== 'none' && lt < p.trDur) apply(p.trIn, clamp(lt / p.trDur, 0, 1), 1);
  if (p.trOut && p.trOut !== 'none' && lt > D - p.trOutDur) apply(p.trOut, clamp((D - lt) / p.trOutDur, 0, 1), -1);
  return st;
}
function drawClip(ctx, c, t) {
  const W = PJ.seq.w, H = PJ.seq.h, p = c.props, lt = t - c.start, D = tlDur(c);
  const tr = transitionState(c, lt, D); const alpha = clipAlpha(c, lt, D) * tr.alpha; if (alpha <= 0.001) return;
  ctx.save(); ctx.globalAlpha = alpha;
  const filters = []; if (c.type !== 'title') { if (p.brightness !== 100) filters.push(`brightness(${p.brightness / 100})`); if (p.contrast !== 100) filters.push(`contrast(${p.contrast / 100})`); if (p.saturation !== 100) filters.push(`saturate(${p.saturation / 100})`); if (p.hue) filters.push(`hue-rotate(${p.hue}deg)`); if (p.grayscale) filters.push(`grayscale(${p.grayscale / 100})`); if (p.sepia) filters.push(`sepia(${p.sepia / 100})`); if (p.blur) filters.push(`blur(${p.blur}px)`); }
  if (tr.blur) filters.push(`blur(${tr.blur}px)`); ctx.filter = filters.join(' ') || 'none';
  if (tr.clip) { ctx.beginPath(); if (tr.clip.type === 'wipe') { const w = W * tr.clip.k; tr.clip.dir > 0 ? ctx.rect(0, 0, w, H) : ctx.rect(W - w, 0, w, H); } else { ctx.arc(W / 2, H / 2, Math.hypot(W, H) / 2 * tr.clip.k, 0, Math.PI * 2); } ctx.clip(); }
  ctx.translate(W / 2 + p.x + tr.dx, H / 2 + (c.type === 'title' ? 0 : p.y)); ctx.rotate(p.rotation * Math.PI / 180); const sc = p.scale / 100 * tr.scale; ctx.scale(sc, sc);
  if (c.type === 'color') { ctx.fillStyle = p.color; ctx.fillRect(-W / 2 - 2, -H / 2 - 2, W + 4, H + 4); }
  else if (c.type === 'title') drawTitle(ctx, c, lt, D);
  else { const e = c.type === 'image' ? mediaById(c.mediaId)?.el : (EXP.frames?.get(c.id) || els.get(c.id)); if (e) { const sw = e.videoWidth || e.naturalWidth || e.width, sh = e.videoHeight || e.naturalHeight || e.height; if (sw && sh && (c.type === 'image' || e instanceof ImageBitmap || e.readyState >= 2)) { let dw, dh; const k1 = Math.min(W / sw, H / sh), k2 = Math.max(W / sw, H / sh); if (p.fit === 'stretch') { dw = W; dh = H; } else { const k = p.fit === 'fill' ? k2 : k1; dw = sw * k; dh = sh * k; } ctx.drawImage(e, -dw / 2, -dh / 2, dw, dh); } } }
  ctx.restore();
}
function drawTitle(ctx, c, lt, D) {
  const p = c.props; const lines = p.text.split('\n'); const lh = p.size * 1.2; let a = 1, dy = 0, sc = 1, chars = Infinity;
  const ai = Math.min(1, lt / 0.6), ao = Math.min(1, (D - lt) / 0.6);
  if (p.anim === 'fade') a = Math.min(ai, ao); else if (p.anim === 'pop') { sc = 0.7 + 0.3 * easeOut(Math.min(1, lt / 0.35)) + (lt < 0.35 ? Math.sin(lt / 0.35 * Math.PI) * 0.06 : 0); a = Math.min(Math.min(1, lt / 0.2), ao); }
  else if (p.anim === 'slide') { ctx.translate(-(1 - easeOut(ai)) * 300, 0); a = Math.min(ai, ao); } else if (p.anim === 'rise') { dy = (1 - easeOut(ai)) * 80; a = Math.min(ai, ao); }
  else if (p.anim === 'type') { chars = Math.floor(lt * 18); a = ao; } else if (p.anim === 'roll') { const total = lines.length * lh + PJ.seq.h; dy = PJ.seq.h / 2 + lines.length * lh / 2 - (lt / D) * total; }
  ctx.globalAlpha *= clamp(a, 0, 1); ctx.translate(0, p.ty + dy); ctx.scale(sc, sc);
  ctx.font = `${p.italic ? 'italic ' : ''}${p.weight} ${p.size}px "${p.font}"`; ctx.textBaseline = 'middle'; ctx.textAlign = p.align;
  const widths = lines.map(l => ctx.measureText(l).width); const maxW = Math.max(...widths, 1); const totalH = lines.length * lh;
  const ax = p.align === 'left' ? -maxW / 2 : p.align === 'right' ? maxW / 2 : 0;
  if (p.box) { ctx.save(); ctx.globalAlpha *= p.boxOpacity / 100; ctx.fillStyle = p.boxColor; const pad = p.size * 0.35; ctx.beginPath(); ctx.roundRect(-maxW / 2 - pad, -totalH / 2 - pad * 0.6, maxW + pad * 2, totalH + pad * 1.2, p.size * 0.15); ctx.fill(); ctx.restore(); }
  let shown = 0;
  lines.forEach((ln, i) => { let txt = ln; if (chars !== Infinity) { txt = ln.slice(0, Math.max(0, chars - shown)); shown += ln.length; } const y = -totalH / 2 + lh * (i + 0.5);
    if (p.shadow) { ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = p.size * 0.15; ctx.shadowOffsetY = p.size * 0.04; }
    if (p.outline) { ctx.lineWidth = p.outline * 2; ctx.strokeStyle = p.outlineColor; ctx.lineJoin = 'round'; ctx.strokeText(txt, ax, y); ctx.shadowColor = 'transparent'; }
    ctx.fillStyle = p.color; ctx.fillText(txt, ax, y); ctx.shadowColor = 'transparent'; });
}
function renderAt(ctx, t) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.fillStyle = PJ.seq.bg; ctx.fillRect(0, 0, PJ.seq.w, PJ.seq.h); ctx.restore();
  const vids = PJ.tracks.filter(t2 => t2.kind === 'video').reverse(); // V1 first (bottom)
  const act = activeClips(t);
  vids.forEach(tr => act.filter(c => c.track === tr.id && c.type !== 'audio').forEach(c => drawClip(ctx, c, t)));
}
function drawFrame() { if (!EXP.on) renderAt(pctx, ST.t); }
let dfT = null; function drawFrameSoon() { if (dfT) return; dfT = requestAnimationFrame(() => { dfT = null; syncMedia(false); drawFrame(); }); }
function srcTime(c, t) { return c.in + (t - c.start) * (c.props.speed || 1); }
function syncMedia(playing) {
  const t = ST.t; const act = new Set(activeClips(t).filter(c => c.type === 'video' || c.type === 'audio').map(c => c.id));
  PJ.clips.forEach(c => { if (c.type !== 'video' && c.type !== 'audio') return; const e = act.has(c.id) ? elFor(c) : els.get(c.id); if (!e) return;
    if (!act.has(c.id)) { if (!e.paused) e.pause(); return; }
    const target = srcTime(c, t); const tr = trackById(c.track); const lt = t - c.start, D = tlDur(c); let vol = (c.props.volume / 100) * (tr.muted ? 0 : 1); if (c.type === 'audio') vol *= clipAlpha({ props: { ...c.props, opacity: 100 } }, lt, D);
    e.muted = false; if (e._gain) { e._gain.gain.value = vol; e.volume = 1; } else e.volume = clamp(vol, 0, 1);
    e.playbackRate = c.props.speed || 1;
    if (playing) { if (Math.abs(e.currentTime - target) > 0.3) e.currentTime = target; if (e.paused) e.play().catch(() => {}); }
    else { if (!e.paused) e.pause(); if (Math.abs(e.currentTime - target) > 0.02) e.currentTime = target; }
  });
}
function seek(t) { ST.t = clamp(t, 0, Math.max(seqDuration(), 0)); if (ST.playing) { playBase = { wall: performance.now(), t: ST.t }; } placePlayhead(); syncMedia(ST.playing); drawFrame(); autoscroll(); }
function autoscroll() { const sc = $('#tlScroll'); const x = ST.t * ST.pps; if (x < sc.scrollLeft + 20 || x > sc.scrollLeft + sc.clientWidth - 40) sc.scrollLeft = x - sc.clientWidth * 0.3; }
let playBase = null;
function togglePlay() { ST.playing ? pause() : play(); }
function play() { if (!PJ.clips.length) return; ensureAudio(); audioCtx.resume(); if (ST.t >= seqDuration() - 0.01) ST.t = 0; ST.playing = true; playBase = { wall: performance.now(), t: ST.t }; $('#bPlay').innerHTML = icon('pause'); syncMedia(true); requestAnimationFrame(loop); }
function pause() { ST.playing = false; $('#bPlay').innerHTML = icon('play'); syncMedia(false); drawFrame(); }
function loop() { if (!ST.playing) return; ST.t = playBase.t + (performance.now() - playBase.wall) / 1000; if (ST.t >= seqDuration()) { ST.t = seqDuration(); pause(); placePlayhead(); return; } syncMedia(true); renderAt(pctx, ST.t); placePlayhead(); autoscroll(); requestAnimationFrame(loop); }
UI.shortcut(' ', togglePlay); UI.shortcut('k', pause); UI.shortcut('l', play); UI.shortcut('j', () => seek(ST.t - 5));
UI.shortcut('arrowleft', () => seek(ST.t - 1 / PJ.seq.fps)); UI.shortcut('arrowright', () => seek(ST.t + 1 / PJ.seq.fps)); UI.shortcut('shift+arrowleft', () => seek(ST.t - 1)); UI.shortcut('shift+arrowright', () => seek(ST.t + 1));
UI.shortcut('home', () => seek(0)); UI.shortcut('end', () => seek(seqDuration()));
UI.shortcut('arrowup', () => { const edges = [0, ...PJ.clips.flatMap(c => [c.start, cEnd(c)])].filter(v => v < ST.t - 1e-3).sort((a, b) => b - a); if (edges.length) seek(edges[0]); });
UI.shortcut('arrowdown', () => { const edges = PJ.clips.flatMap(c => [c.start, cEnd(c)]).filter(v => v > ST.t + 1e-3).sort((a, b) => a - b); if (edges.length) seek(edges[0]); });

// =====================================================================  history
let hist = [], hi = -1;
const snapshot = () => JSON.stringify({ seq: PJ.seq, tracks: PJ.tracks, clips: PJ.clips });
function commit(label) { hist = hist.slice(0, hi + 1); hist.push({ label, s: snapshot() }); if (hist.length > 150) hist.shift(); hi = hist.length - 1; if (hist.length > 1) markDirty(); }
let cdT = null; function commitDebounced(l) { clearTimeout(cdT); cdT = setTimeout(() => commit(l), 450); }
function markDirty() { PJ.dirty = true; UI.setDocTitle(PJ.name + ' •', 'BTS Video'); }
function restore(s) { const d = JSON.parse(s); PJ.seq = d.seq; PJ.tracks = d.tracks; PJ.clips = d.clips; [...ST.sel].forEach(id => { if (!clipById(id)) ST.sel.delete(id); }); layoutMonitor(); renderTimeline(); renderFx(); syncMedia(false); drawFrame(); }
function undo() { if (hi > 0) { hi--; restore(hist[hi].s); } }
function redo() { if (hi < hist.length - 1) { hi++; restore(hist[hi].s); } }
UI.shortcut('ctrl+z', undo); UI.shortcut('ctrl+shift+z', redo); UI.shortcut('ctrl+y', redo);

// =====================================================================  sequence / project files
async function seqSettings() {
  const v = await form({ title: 'Sequence settings', fields: [{ key: 'preset', label: 'Frame size', type: 'select', value: `${PJ.seq.w}x${PJ.seq.h}`, options: [{ value: '1920x1080', label: '1080p HD (16:9)' }, { value: '1280x720', label: '720p HD (16:9)' }, { value: '3840x2160', label: '4K UHD (16:9)' }, { value: '1080x1920', label: 'Vertical 1080×1920 (Reels/Shorts)' }, { value: '1080x1080', label: 'Square 1080×1080' }, { value: '1080x1350', label: 'Portrait 4:5' }, { value: '854x480', label: '480p SD' }] },
    { key: 'fps', label: 'Frame rate', type: 'select', value: String(PJ.seq.fps), options: ['24', '25', '30', '50', '60'] }, { key: 'bg', label: 'Background color', type: 'color', value: PJ.seq.bg }] });
  if (!v) return; const [w, hh] = v.preset.split('x').map(Number); PJ.seq = { w, h: hh, fps: +v.fps, bg: v.bg }; commit('Sequence settings'); layoutMonitor(); renderTimeline();
}
async function newProject() { if (PJ.dirty && !(await confirm('Discard changes?', 'The current project has unsaved changes.', 'Discard'))) return; pause(); els.forEach(e => { e.pause(); e.src = ''; }); els.clear(); PJ.name = 'Untitled project'; PJ.path = null; PJ.media = []; PJ.clips = []; ST.sel.clear(); ST.t = 0; hist = []; hi = -1; commit('New'); PJ.dirty = false; UI.setDocTitle(PJ.name, 'BTS Video'); renderAll(); }
UI.shortcut('ctrl+alt+n', newProject);
async function saveProject(as) {
  const data = new TextEncoder().encode(JSON.stringify({ app: 'BTS Video', v: 1, seq: PJ.seq, tracks: PJ.tracks, clips: PJ.clips, media: PJ.media.map(m => ({ id: m.id, name: m.name, path: m.path, kind: m.kind, dur: m.dur, w: m.w, h: m.h, hasAudio: m.hasAudio })) }, null, 1));
  let p = !as && PJ.path; if (p) await bts.fs.write({ path: p, data }); else { p = await bts.fs.saveAs({ data, defaultPath: PJ.name.replace(/\.btsvid$/, '') + '.btsvid', filters: [{ name: 'BTS Video project', extensions: ['btsvid'] }] }); if (!p) return; }
  PJ.path = p; PJ.name = p.split(/[\\/]/).pop(); PJ.dirty = false; UI.setDocTitle(PJ.name, 'BTS Video'); toast('Saved ' + PJ.name, 'ok');
}
UI.shortcut('ctrl+s', () => saveProject(false)); UI.shortcut('ctrl+shift+s', () => saveProject(true));
async function openProject() { const f = await bts.fs.open({ filters: [{ name: 'BTS Video project', extensions: ['btsvid'] }] }); if (f) loadProject(f[0]); }
UI.shortcut('ctrl+o', openProject);
async function loadProject(f) {
  try {
    const j = JSON.parse(new TextDecoder().decode(new Uint8Array(f.data))); pause(); els.clear();
    PJ.seq = j.seq; PJ.tracks = j.tracks; PJ.clips = j.clips; PJ.media = j.media.map(m => ({ ...m, url: fileUrl(m.path) })); PJ.path = f.path; PJ.name = f.name; ST.sel.clear(); ST.t = 0;
    renderAll(); for (const m of PJ.media) await importPath(m.path, m.name, m.id);
    hist = []; hi = -1; commit('Open'); PJ.dirty = false; UI.setDocTitle(PJ.name, 'BTS Video'); if (f.path) bts.recent.add(f.path);
    const miss = PJ.media.filter(m => m.missing); if (miss.length) toast(`${miss.length} media file(s) are offline. Right-click them in the Project panel to relink.`, 'err', 7000);
  } catch (e) { toast('Could not open project: ' + e.message, 'err'); }
}

// =====================================================================  export
const EXP = { on: false, cancel: false };
async function exportFrame() { const c = document.createElement('canvas'); c.width = PJ.seq.w; c.height = PJ.seq.h; renderAt(c.getContext('2d'), ST.t); const blob = await new Promise(r => c.toBlob(r, 'image/png')); const p = await bts.fs.saveAs({ data: await UI.blobToU8(blob), defaultPath: `frame-${tc(ST.t).replace(/:/g, '-')}.png`, filters: [{ name: 'PNG', extensions: ['png'] }] }); if (p) toast('Frame exported', 'ok'); }
UI.shortcut('ctrl+shift+e', exportFrame);
async function exportDialog() {
  if (!PJ.clips.length) return toast('The timeline is empty');
  pause();
  const fields = [
    { key: 'fmt', label: 'Format', type: 'select', value: ST.ffmpeg ? 'mp4' : 'webm', options: [...(ST.ffmpeg ? [{ value: 'mp4', label: 'MP4 — H.264 + AAC (recommended)' }, { value: 'mov', label: 'MOV — H.264 + AAC' }, { value: 'gif', label: 'Animated GIF (no audio)' }, { value: 'mp3', label: 'Audio only — MP3' }] : []), { value: 'webm', label: 'WebM — VP9 + Opus (real-time, built-in)' }] },
    { key: 'res', label: 'Resolution', type: 'select', value: '1', options: [{ value: '1', label: `Sequence (${PJ.seq.w}×${PJ.seq.h})` }, { value: '0.6667', label: '2/3 size' }, { value: '0.5', label: 'Half size' }] },
    { key: 'q', label: 'Quality', type: 'select', value: 'high', options: [{ value: 'high', label: 'High (larger file)' }, { value: 'med', label: 'Medium' }, { value: 'low', label: 'Small file' }] },
    { key: 'range', label: 'Range', type: 'select', value: 'all', options: [{ value: 'all', label: 'Entire sequence' }, { value: 'sel', label: 'Selected clips only (time range)' }] }];
  const v = await form({ title: 'Export video', fields, ok: 'Export…', width: 440 }); if (!v) return;
  const ext = v.fmt; const out = await bts.fs.pickSavePath({ defaultPath: PJ.name.replace(/\.btsvid$/, '') + '.' + ext, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] }); if (!out) return;
  let t0 = 0, t1 = seqDuration(); if (v.range === 'sel' && selected().length) { t0 = Math.min(...selected().map(c => c.start)); t1 = Math.max(...selected().map(cEnd)); }
  try { if (ext === 'webm') await exportWebM(out, t0, t1, +v.res, v.q); else await exportFFmpeg(out, ext, t0, t1, +v.res, v.q); }
  catch (e) { console.error(e); toast('Export failed: ' + e.message, 'err', 8000); }
  finally { EXP.on = false; document.querySelector('.modal-back.exp')?.remove(); drawFrame(); }
}
UI.shortcut('ctrl+m', exportDialog);
function progressModal(title) {
  const bar = h('div'), txt = h('div', { class: 'muted', style: { marginTop: '8px', fontSize: '12px' } }, 'Preparing…');
  const back = h('div', { class: 'modal-back exp' }, h('div', { class: 'modal', style: { width: '440px' } }, h('div', { class: 'm-h' }, title), h('div', { class: 'm-b' }, h('div', { class: 'progress' }, bar), txt), h('div', { class: 'm-f' }, h('button', { class: 'btn', onclick: () => { EXP.cancel = true; txt.textContent = 'Cancelling…'; } }, 'Cancel'))));
  document.body.append(back); return { set: (k, s) => { bar.style.width = Math.round(k * 100) + '%'; txt.textContent = s; } };
}
async function seekForExport(t) {
  const act = activeClips(t).filter(c => c.type === 'video');
  await Promise.all(act.map(c => new Promise(res => { const e = elFor(c); if (!e) return res(); e.pause(); const target = Math.min(srcTime(c, t), (e.duration || 1e9) - 0.001); const go = () => { if (Math.abs(e.currentTime - target) < 0.5 / PJ.seq.fps && e.readyState >= 2) return res(); const done = () => { e.removeEventListener('seeked', done); res(); }; e.addEventListener('seeked', done); e.currentTime = target; setTimeout(done, 4000); }; if (e.readyState >= 1) go(); else e.addEventListener('loadedmetadata', go, { once: true }); })));
  PJ.clips.forEach(c => { if (c.type === 'audio' || c.type === 'video') { const e = els.get(c.id); if (e && !e.paused) e.pause(); } });
}
// frame server — sequential decode of each video clip by FFmpeg
const readers = new Map(); // clip id -> {id, idx, bmp}
async function framesFor(t, fps, W, H) {
  const act = new Set(activeClips(t).filter(c => c.type === 'video').map(c => c.id));
  for (const [cid, r] of readers) if (!act.has(cid)) { bts.ffmpeg.framesClose(r.id); r.bmp?.close?.(); readers.delete(cid); EXP.frames.delete(cid); }
  for (const cid of act) {
    const c = clipById(cid); const m = mediaById(c.mediaId); if (!m || m.missing) continue;
    let r = readers.get(cid); const want = Math.round((t - c.start) * fps);
    if (!r) { const id = await bts.ffmpeg.framesOpen({ file: m.proxy || m.path, start: srcTime(c, t), fps, w: W, h: H, speed: spd(c) }); r = { id, idx: want - 1, bmp: null }; readers.set(cid, r); }
    while (r.idx < want) { const buf = await bts.ffmpeg.framesNext(r.id); r.idx++; if (!buf) break; if (r.idx === want) { const nb = await createImageBitmap(new Blob([buf], { type: 'image/jpeg' })); r.bmp?.close?.(); r.bmp = nb; } }
    if (r.bmp) EXP.frames.set(cid, r.bmp);
  }
}
function closeReaders() { for (const [, r] of readers) { bts.ffmpeg.framesClose(r.id); r.bmp?.close?.(); } readers.clear(); EXP.frames = null; }
async function exportFFmpeg(out, ext, t0, t1, scale, q) {
  EXP.on = true; EXP.cancel = false; const fps = ext === 'gif' ? Math.min(15, PJ.seq.fps) : PJ.seq.fps; const W = Math.round(PJ.seq.w * scale / 2) * 2, H = Math.round(PJ.seq.h * scale / 2) * 2; const total = t1 - t0; const N = Math.max(1, Math.round(total * fps));
  const pm = progressModal('Exporting ' + ext.toUpperCase());
  // audio graph from source files
  const inputs = [], filt = [], labels = [];
  const aud = PJ.clips.filter(c => (c.type === 'audio' || (c.type === 'video' && mediaById(c.mediaId)?.hasAudio)) && !trackById(c.track).muted && c.props.volume > 0 && cEnd(c) > t0 && c.start < t1);
  aud.forEach((c, i) => { const m = mediaById(c.mediaId); if (!m || m.missing) return; const k = inputs.length / 2 + 1; inputs.push('-i', m.proxy || m.path); const sp = c.props.speed || 1; const visStart = Math.max(c.start, t0), visEnd = Math.min(cEnd(c), t1); const sIn = srcTime(c, visStart), sOut = srcTime(c, visEnd); const delay = Math.round((visStart - t0) * 1000); let f = `[${k}:a]atrim=start=${sIn.toFixed(3)}:end=${sOut.toFixed(3)},asetpts=PTS-STARTPTS`; if (sp !== 1) { let s = sp; const parts = []; while (s > 2) { parts.push('atempo=2'); s /= 2; } while (s < 0.5) { parts.push('atempo=0.5'); s /= 0.5; } parts.push(`atempo=${s.toFixed(4)}`); f += ',' + parts.join(','); } f += `,volume=${(c.props.volume / 100).toFixed(3)}`; const D = visEnd - visStart; if (c.props.fadeIn && visStart === c.start) f += `,afade=t=in:st=0:d=${c.props.fadeIn}`; if (c.props.fadeOut && visEnd === cEnd(c)) f += `,afade=t=out:st=${Math.max(0, D - c.props.fadeOut).toFixed(3)}:d=${c.props.fadeOut}`; f += `,adelay=${delay}|${delay}[a${i}]`; filt.push(f); labels.push(`[a${i}]`); });
  const hasAudio = labels.length > 0 && ext !== 'gif';
  let args = ['-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', 'pipe:0', ...(hasAudio || ext === 'mp3' ? inputs : [])];
  const fc = hasAudio || (ext === 'mp3' && labels.length) ? [...filt, `${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,apad[aout]`].join(';') : null;
  if (ext === 'mp3') { if (!labels.length) throw new Error('There is no audio in the timeline'); args = [...inputs.slice(0), '-filter_complex', fc.replace(/\[(\d+):a\]/g, (m0, k) => `[${k - 1}:a]`), '-map', '[aout]', '-t', total.toFixed(3), '-b:a', q === 'low' ? '128k' : '256k', out]; pm.set(0.3, 'Mixing audio…'); const id = await bts.ffmpeg.start(args); const r = await bts.ffmpeg.end(id); if (!r.ok) throw new Error(r.log.split('\n').slice(-4).join(' ')); toast('Exported ' + out.split(/[\\/]/).pop(), 'ok', 6000); return; }
  if (fc) args.push('-filter_complex', fc);
  args.push('-map', '0:v'); if (fc) args.push('-map', '[aout]');
  if (ext === 'gif') args.push('-vf', `fps=${fps},scale=${W}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=192[p];[s1][p]paletteuse=dither=bayer`, '-loop', '0');
  else { const crf = { high: 18, med: 23, low: 28 }[q]; args.push('-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-r', String(fps)); if (fc) args.push('-c:a', 'aac', '-b:a', q === 'low' ? '128k' : '192k'); if (ext === 'mp4') args.push('-movflags', '+faststart'); }
  args.push('-t', total.toFixed(3), out);
  const startWall = performance.now(); const id = await bts.ffmpeg.start(args); EXP.frames = new Map();
  try {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const cx = c.getContext('2d'); const full = document.createElement('canvas'); full.width = PJ.seq.w; full.height = PJ.seq.h; const fx = full.getContext('2d');
  for (let f = 0; f < N; f++) {
    if (EXP.cancel) { await bts.ffmpeg.kill(id); closeReaders(); toast('Export cancelled'); return; }
    const t = t0 + f / fps; await framesFor(t, fps, PJ.seq.w, PJ.seq.h); renderAt(fx, t); cx.drawImage(full, 0, 0, W, H);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q === 'low' ? 0.85 : 0.95));
    const ok = await bts.ffmpeg.write(id, await UI.blobToU8(blob)); if (!ok) break;
    if (f % 5 === 0) { const el = (performance.now() - startWall) / 1000; const eta = el / (f + 1) * (N - f - 1); pm.set((f + 1) / N, `Rendering frame ${f + 1} of ${N} · ${Math.round(eta)}s remaining`); if (f % 30 === 0) renderAt(pctx, t); }
  }
  } finally { closeReaders(); }
  pm.set(1, 'Finishing…'); const r = await bts.ffmpeg.end(id);
  if (!r.ok) throw new Error('FFmpeg: ' + r.log.split('\n').filter(Boolean).slice(-3).join(' '));
  toast(`Exported ${out.split(/[\\/]/).pop()} in ${Math.round((performance.now() - startWall) / 1000)}s`, 'ok', 7000);
}
async function exportWebM(out, t0, t1, scale, q) {
  EXP.on = true; EXP.cancel = false; ensureAudio(); await audioCtx.resume();
  const pm = progressModal('Exporting WebM (real-time)');
  const W = Math.round(PJ.seq.w * scale / 2) * 2, H = Math.round(PJ.seq.h * scale / 2) * 2; const c = document.createElement('canvas'); c.width = W; c.height = H; const cx = c.getContext('2d'); const full = document.createElement('canvas'); full.width = PJ.seq.w; full.height = PJ.seq.h; const fx = full.getContext('2d');
  const stream = c.captureStream(PJ.seq.fps); recDest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm', videoBitsPerSecond: { high: 12e6, med: 6e6, low: 2.5e6 }[q] });
  const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const stopped = new Promise(r => rec.onstop = r);
  masterGain.disconnect(audioCtx.destination); // silence speakers during export
  ST.t = t0; ST.playing = true; playBase = { wall: performance.now(), t: t0 }; syncMedia(true); await UI.sleep(300); playBase = { wall: performance.now(), t: t0 }; rec.start(250);
  await new Promise(res => { const step = () => { if (EXP.cancel) return res(); ST.t = playBase.t + (performance.now() - playBase.wall) / 1000; if (ST.t >= t1) return res(); syncMedia(true); renderAt(fx, ST.t); cx.drawImage(full, 0, 0, W, H); pm.set((ST.t - t0) / (t1 - t0), `Recording ${tc(ST.t - t0)} of ${tc(t1 - t0)}`); requestAnimationFrame(step); }; step(); });
  rec.stop(); await stopped; ST.playing = false; syncMedia(false); masterGain.connect(audioCtx.destination);
  if (EXP.cancel) return toast('Export cancelled');
  const blob = new Blob(chunks, { type: 'video/webm' }); await bts.fs.write({ path: out, data: await UI.blobToU8(blob) }); toast('Exported ' + out.split(/[\\/]/).pop(), 'ok', 6000);
}

// =====================================================================  misc
async function closeWindow() { if (PJ.dirty) { const r = await modal({ title: 'Save changes?', body: `Save changes to “${PJ.name}” before closing?`, buttons: [{ label: 'Cancel', value: null }, { label: "Don't save", value: 'no' }, { label: 'Save', primary: true, value: 'yes' }] }); if (r === null) return; if (r === 'yes') { await saveProject(false); if (PJ.dirty) return; } } bts.win.close(); }
UI.shortcut('ctrl+w', closeWindow);
function shortcutsHelp() { const rows = [['Space / K / L / J', 'Play-pause / stop / play / back 5s'], ['← →', 'Previous / next frame'], ['Shift + ← →', 'Back / forward 1 s'], ['↑ ↓', 'Previous / next edit point'], ['Home / End', 'Start / end'], ['V / C', 'Selection / razor tool'], ['Ctrl+K', 'Split at playhead'], ['Del / Shift+Del', 'Delete / ripple delete'], ['Ctrl+D', 'Apply fade transition'], ['Ctrl+T', 'Add title'], ['Ctrl+R', 'Speed'], ['= / - / \\', 'Zoom timeline in / out / fit'], ['S', 'Toggle snapping'], ['Ctrl+I', 'Import'], ['Ctrl+M', 'Export'], ['Ctrl+Z / Shift+Z', 'Undo / redo']]; modal({ title: 'Keyboard shortcuts', width: 480, body: '<table style="width:100%">' + rows.map(r => `<tr><td style="padding:3px 10px 3px 0;color:var(--tx-0);white-space:nowrap">${r[0]}</td><td style="color:var(--tx-2)">${r[1]}</td></tr>`).join('') + '</table>' }); }
function renderAll() { renderOptions(); renderHead(); renderLeft(); renderTimeline(); renderFx(); layoutMonitor(); }
UI.fileDrop(async files => { for (const f of files) { const p = bts.fs.pathOf(f); if (!p) continue; if (/\.btsvid$/i.test(p)) { const r = await bts.fs.read(p); await loadProject({ ...r, data: new Uint8Array(r.data) }); } else { const m = await importPath(p, f.name); if (m && !m.missing && PJ.clips.length === 0) appendMedia(m); } } }, 'Drop media to import');
(async () => {
  ST.ffmpeg = await bts.ffmpeg.available();
  renderAll(); commit('New'); PJ.dirty = false; UI.setDocTitle(PJ.name, 'BTS Video');
  if (!ST.ffmpeg) status('FFmpeg not found — exporting uses built-in WebM');
  const qf = UI.queryFile(); if (qf) { if (/\.btsvid$/i.test(qf)) { const r = await bts.fs.read(qf); loadProject({ ...r, data: new Uint8Array(r.data) }); } else { const m = await importPath(qf); if (m && !m.missing) appendMedia(m); } }
})();
window.__bts = { PJ, ST, importPath, appendMedia, addTitle, seek, renderAt, splitAtPlayhead, applyTransition, exportFFmpeg, select, renderTimeline, drawFrame, applyLook, commit, get EXP() { return EXP; } };
})();
