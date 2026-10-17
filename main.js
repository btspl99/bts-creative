// BTS Creative — main process
// Free & open-source creative suite for students. https://creative.btspl.tech
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

let autoUpdater = null;
try { autoUpdater = require('electron-updater').autoUpdater; } catch (e) { /* dev without updater */ }

const APPS = {
  home:   { file: 'src/home/index.html',   title: 'BTS Creative',     w: 1180, h: 760 },
  pdf:    { file: 'src/pdf/index.html',    title: 'BTS PDF Pro',    w: 1400, h: 900 },
  photo:  { file: 'src/photo/index.html',  title: 'BTS Photo',      w: 1440, h: 920 },
  vector: { file: 'src/vector/index.html', title: 'BTS Vector',     w: 1440, h: 920 },
  video:  { file: 'src/video/index.html',  title: 'BTS Video',      w: 1480, h: 940 },
};

const windows = new Set();
let homeWin = null;

function createWindow(appId = 'home', openFile = null) {
  const cfg = APPS[appId] || APPS.home;
  const win = new BrowserWindow({
    width: cfg.w, height: cfg.h, minWidth: 960, minHeight: 600,
    title: cfg.title,
    backgroundColor: '#15161a',
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(path.join(__dirname, cfg.file), { query: openFile ? { file: openFile } : {} });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => windows.delete(win));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  windows.add(win);
  if (appId === 'home') homeWin = win;
  return win;
}

// Pick an app from a file extension (file associations / drag onto launcher)
function appForFile(f) {
  const ext = path.extname(f).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.btsp'].includes(ext)) return 'photo';
  if (['.svg', '.btsv'].includes(ext)) return 'vector';
  if (['.mp4', '.webm', '.mov', '.mkv', '.btsvid'].includes(ext)) return 'video';
  return null;
}

function fileFromArgv(argv) {
  return argv.slice(app.isPackaged ? 1 : 2).find(a => !a.startsWith('-') && fs.existsSync(a) && appForFile(a));
}

// ---------- single instance ----------
if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', (_e, argv) => {
  const f = fileFromArgv(argv);
  if (f) createWindow(appForFile(f), f);
  else if (homeWin) { if (homeWin.isMinimized()) homeWin.restore(); homeWin.focus(); }
  else createWindow('home');
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  nativeTheme.themeSource = 'dark';
  const f = fileFromArgv(process.argv);
  if (f) createWindow(appForFile(f), f); else createWindow('home');
  setupUpdater();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow('home'); });

// ---------- IPC: windows ----------
ipcMain.handle('app:open', (_e, appId, file) => { createWindow(appId, file || null); return true; });
// Send between apps: open a new window of another app and hand it a payload
// ({ name, mime, data: Uint8Array, kind?, meta? }). The new window pulls it with handoff:take.
const pendingHandoff = new Map();
ipcMain.handle('handoff:send', (_e, appId, payload) => {
  if (!APPS[appId] || !payload) return false;
  const win = createWindow(appId); const id = win.webContents.id;
  pendingHandoff.set(id, payload);
  win.on('closed', () => pendingHandoff.delete(id));
  return true;
});
ipcMain.handle('handoff:take', e => { const p = pendingHandoff.get(e.sender.id) || null; pendingHandoff.delete(e.sender.id); return p; });
ipcMain.handle('app:openFileAuto', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [
    { name: 'All supported', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'svg', 'mp4', 'webm', 'mov', 'mkv', 'btsp', 'btsv', 'btsvid'] }] });
  if (r.canceled || !r.filePaths[0]) return false;
  const f = r.filePaths[0]; createWindow(appForFile(f) || 'home', f); return true;
});
ipcMain.on('win:min', e => BrowserWindow.fromWebContents(e.sender)?.minimize());
ipcMain.on('win:max', e => { const w = BrowserWindow.fromWebContents(e.sender); if (!w) return; w.isMaximized() ? w.unmaximize() : w.maximize(); });
ipcMain.on('win:close', e => BrowserWindow.fromWebContents(e.sender)?.close());
ipcMain.on('win:title', (e, t) => BrowserWindow.fromWebContents(e.sender)?.setTitle(t));
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('shell:external', (_e, url) => shell.openExternal(url));

// ---------- IPC: files ----------
ipcMain.handle('fs:open', async (e, opts = {}) => {
  const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), {
    properties: opts.multi ? ['openFile', 'multiSelections'] : ['openFile'], filters: opts.filters || [] });
  if (r.canceled) return null;
  return r.filePaths.map(p => ({ path: p, name: path.basename(p), data: fs.readFileSync(p) }));
});
ipcMain.handle('fs:read', (_e, p) => ({ path: p, name: path.basename(p), data: fs.readFileSync(p) }));
ipcMain.handle('fs:saveAs', async (e, { data, defaultPath, filters }) => {
  const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { defaultPath, filters: filters || [] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, Buffer.from(data));
  addRecent(r.filePath);
  return r.filePath;
});
ipcMain.handle('fs:write', (_e, { path: p, data, noRecent }) => { fs.writeFileSync(p, Buffer.from(data)); if (!noRecent) addRecent(p); return p; });
ipcMain.handle('fs:pickFolder', async e => { const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ['openDirectory', 'createDirectory'] }); return r.canceled ? null : r.filePaths[0]; });
ipcMain.handle('fs:listDir', (_e, dir) => fs.readdirSync(dir, { withFileTypes: true }).map(d => ({ name: d.name, path: path.join(dir, d.name), dir: d.isDirectory() })));
ipcMain.handle('fs:pickSavePath', async (e, { defaultPath, filters }) => {
  const r = await dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), { defaultPath, filters: filters || [] });
  return r.canceled ? null : r.filePath;
});

// Recent files
const recentPath = () => path.join(app.getPath('userData'), 'recent.json');
function getRecent() { try { return JSON.parse(fs.readFileSync(recentPath(), 'utf8')).filter(f => fs.existsSync(f.path)); } catch { return []; } }
function addRecent(p) {
  const list = getRecent().filter(r => r.path !== p);
  list.unshift({ path: p, name: path.basename(p), app: appForFile(p), at: Date.now() });
  try { fs.writeFileSync(recentPath(), JSON.stringify(list.slice(0, 20))); } catch {}
}
ipcMain.handle('recent:get', () => getRecent());
ipcMain.handle('recent:add', (_e, p) => addRecent(p));

// ---------- IPC: video export via FFmpeg ----------
function ffmpegPath() {
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const bundled = app.isPackaged
    ? path.join(process.resourcesPath, 'ffmpeg', exe)
    : path.join(__dirname, 'vendor', 'ffmpeg', exe);
  return fs.existsSync(bundled) ? bundled : 'ffmpeg';
}
ipcMain.handle('ffmpeg:available', () => new Promise(res => {
  const p = spawn(ffmpegPath(), ['-version']); p.on('error', () => res(false)); p.on('close', c => res(c === 0));
}));
ipcMain.handle('ffmpeg:run', (e, args) => new Promise((resolve) => {
  const p = spawn(ffmpegPath(), ['-y', ...args]);
  let log = '';
  p.stderr.on('data', d => { const s = d.toString(); log += s; e.sender.send('ffmpeg:progress', s); });
  p.on('error', err => resolve({ ok: false, log: String(err) }));
  p.on('close', code => resolve({ ok: code === 0, log: log.slice(-4000) }));
}));
// probe a media file (duration, streams)
ipcMain.handle('ffmpeg:probe', (_e, file) => new Promise(res => {
  const p = spawn(ffmpegPath(), ['-hide_banner', '-i', file]); let err = '';
  p.stderr.on('data', d => err += d.toString()); p.on('error', () => res(null)); p.on('close', () => res(err));
}));
// streaming encode: renderer pushes frames into ffmpeg stdin
const encoders = new Map(); let encN = 0;
ipcMain.handle('ffmpeg:start', (e, args) => {
  const id = ++encN; const p = spawn(ffmpegPath(), ['-y', ...args]);
  const st = { p, log: '', done: null };
  st.done = new Promise(r => { p.on('close', code => r({ ok: code === 0, code, log: st.log.slice(-6000) })); p.on('error', err => r({ ok: false, log: String(err) })); });
  p.stderr.on('data', d => { st.log += d.toString(); if (st.log.length > 200000) st.log = st.log.slice(-50000); });
  p.stdin.on('error', () => {});
  encoders.set(id, st); return id;
});
ipcMain.handle('ffmpeg:write', (_e, id, data) => new Promise(res => {
  const st = encoders.get(id); if (!st || st.p.stdin.destroyed) return res(false);
  if (st.p.stdin.write(Buffer.from(data))) res(true); else st.p.stdin.once('drain', () => res(true));
}));
ipcMain.handle('ffmpeg:end', async (_e, id) => { const st = encoders.get(id); if (!st) return { ok: false }; st.p.stdin.end(); const r = await st.done; encoders.delete(id); return r; });
ipcMain.handle('ffmpeg:kill', (_e, id) => { const st = encoders.get(id); if (st) { try { st.p.kill(); } catch {} encoders.delete(id); } return true; });
// frame server: decode a clip sequentially to MJPEG frames (fast, exact export)
const readers = new Map(); let rdN = 0;
ipcMain.handle('frames:open', (_e, { file, start, fps, w, h, speed }) => {
  const id = ++rdN;
  const vf = [`setpts=(PTS-STARTPTS)/${speed || 1}`, `fps=${fps}`, `scale=w=${w}:h=${h}:force_original_aspect_ratio=decrease`].join(',');
  const p = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-ss', String(Math.max(0, start)), '-i', file, '-an', '-vf', vf, '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '2', 'pipe:1']);
  const r = { p, buf: Buffer.alloc(0), frames: [], waiters: [], ended: false };
  const flush = () => { while (r.waiters.length && (r.frames.length || r.ended)) r.waiters.shift()(r.frames.shift() || null); };
  p.stdout.on('data', d => {
    r.buf = r.buf.length ? Buffer.concat([r.buf, d]) : d;
    const SOI = Buffer.from([0xFF, 0xD8]), EOI = Buffer.from([0xFF, 0xD9]);
    while (true) {
      const st = r.buf.indexOf(SOI); if (st < 0) { r.buf = Buffer.alloc(0); break; }
      const en = r.buf.indexOf(EOI, st + 2); if (en < 0) { if (st > 0) r.buf = r.buf.subarray(st); break; }
      r.frames.push(Buffer.from(r.buf.subarray(st, en + 2))); r.buf = r.buf.subarray(en + 2);
    }
    if (r.frames.length > 90) p.stdout.pause();
    flush();
  });
  p.on('close', () => { r.ended = true; flush(); }); p.on('error', () => { r.ended = true; flush(); });
  readers.set(id, r); return id;
});
ipcMain.handle('frames:next', (_e, id) => new Promise(res => {
  const r = readers.get(id); if (!r) return res(null);
  if (r.frames.length) { const f = r.frames.shift(); if (r.frames.length < 30) r.p.stdout.resume(); return res(f); }
  if (r.ended) return res(null);
  r.waiters.push(f => { if (r.frames.length < 30) r.p.stdout.resume(); res(f); }); r.p.stdout.resume();
}));
ipcMain.handle('frames:close', (_e, id) => { const r = readers.get(id); if (r) { try { r.p.kill(); } catch {} readers.delete(id); } return true; });
// BTS Video: raw frame server (exact w×h, RGBA keeps alpha, GRAY for motion tracking). Frames are read with frames:next / frames:close.
ipcMain.handle('frames:openRaw', (_e, { file, start, fps, w, h, speed, pix, decoder, dur }) => {
  const id = ++rdN; const bpp = pix === 'gray' ? 1 : 4; const size = w * h * bpp;
  const vf = [`setpts=(PTS-STARTPTS)/${speed || 1}`, `fps=${fps}`, `scale=${w}:${h}:flags=bilinear`].join(',');
  const args = ['-hide_banner', '-loglevel', 'error', ...(decoder ? ['-c:v', decoder] : []), '-ss', String(Math.max(0, start || 0)), ...(dur ? ['-t', String(dur)] : []), '-i', file, '-an', '-vf', vf, '-f', 'rawvideo', '-pix_fmt', pix === 'gray' ? 'gray' : 'rgba', 'pipe:1'];
  const p = spawn(ffmpegPath(), args);
  const r = { p, buf: Buffer.alloc(0), frames: [], waiters: [], ended: false };
  const flush = () => { while (r.waiters.length && (r.frames.length || r.ended)) r.waiters.shift()(r.frames.shift() || null); };
  p.stdout.on('data', d => {
    r.buf = r.buf.length ? Buffer.concat([r.buf, d]) : d;
    while (r.buf.length >= size) { r.frames.push(Buffer.from(r.buf.subarray(0, size))); r.buf = r.buf.subarray(size); }
    if (r.frames.length > 60) p.stdout.pause();
    flush();
  });
  p.stderr.on('data', () => {});
  p.on('close', () => { r.ended = true; flush(); }); p.on('error', () => { r.ended = true; flush(); });
  readers.set(id, r); return id;
});
ipcMain.handle('tmp:dir', () => { const d = path.join(os.tmpdir(), 'bts-video'); fs.mkdirSync(d, { recursive: true }); return d; });
ipcMain.handle('tmp:write', (_e, { name, data }) => {
  const dir = path.join(os.tmpdir(), 'bts-video'); fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, name); fs.writeFileSync(p, Buffer.from(data)); return p;
});

// ---------- IPC: offline speech-to-text (BTS Video › Captions › Auto-transcribe) ----------
// Vosk (Apache-2.0) runs natively through koffi in an Electron utilityProcess (stt-worker.js), never in a renderer.
function voskPaths() {
  const sub = process.platform === 'win32' ? 'win' : process.platform === 'linux' ? 'linux' : null;
  const lib = process.platform === 'win32' ? 'libvosk.dll' : 'libvosk.so';
  const roots = [
    app.isPackaged ? path.join(process.resourcesPath, 'vosk') : null,
    path.join(__dirname, 'vendor', 'vosk'),
    path.join(path.dirname(__dirname), 'vosk'), // resources/vosk next to resources/app.asar
  ].filter(Boolean);
  for (const r of roots) {
    if (sub && fs.existsSync(path.join(r, sub, lib)) && fs.existsSync(path.join(r, 'model-en-us', 'am', 'final.mdl')))
      return { libDir: path.join(r, sub), modelDir: path.join(r, 'model-en-us') };
  }
  return null;
}
function sttCheck() {
  if (process.arch !== 'x64') return { ok: false, reason: 'Auto-transcribe needs a 64-bit (x64) system.' };
  const p = voskPaths(); if (!p) return { ok: false, reason: 'The speech engine is not installed with this copy of BTS Creative.' };
  try { require.resolve('koffi'); } catch { return { ok: false, reason: 'The speech engine bridge (koffi) is missing.' }; }
  return { ok: true, ...p };
}
ipcMain.handle('stt:available', () => sttCheck().ok);
// Optional extra speech models shipped next to model-en-us (resources/vosk/model-<id>). The renderer passes only the
// language id (never a path); main resolves it to a model folder that exists.
const STT_MODELS = [{ id: 'en', label: 'English', dir: 'model-en-us' }, { id: 'hi', label: 'हिन्दी (Hindi)', dir: 'model-hi' }];
function sttModelDir(chk, id) {
  const m = STT_MODELS.find(x => x.id === id); if (!m || !chk || !chk.modelDir) return chk && chk.modelDir;
  const d = path.join(path.dirname(chk.modelDir), m.dir); return fs.existsSync(path.join(d, 'am', 'final.mdl')) ? d : null;
}
ipcMain.handle('stt:models', () => { const chk = sttCheck(); if (!chk.ok) return []; return STT_MODELS.filter(m => sttModelDir(chk, m.id)).map(({ id, label }) => ({ id, label })); });
const sttJobs = new Map(); // webContents id -> { proc, cancelled }
function sttKill(id) { const j = sttJobs.get(id); if (!j) return false; j.cancelled = true; try { j.proc.postMessage({ cmd: 'cancel' }); } catch {} setTimeout(() => { try { j.proc.kill(); } catch {} }, 400); return true; }
ipcMain.handle('stt:cancel', e => sttKill(e.sender.id));
// opts: { ffArgs: [...FFmpeg input args, optional -filter_complex / -map / -t], duration: seconds of audio }
//   or  { file, start, duration }  — main adds the 16 kHz mono s16le output and returns words in seconds from the audio start.
ipcMain.handle('stt:transcribe', (e, opts = {}) => new Promise(resolve => {
  const chk = sttCheck(); if (!chk.ok) return resolve({ ok: false, unavailable: true, error: chk.reason });
  const id = e.sender.id; if (sttJobs.has(id)) sttKill(id);
  const ffArgs = Array.isArray(opts.ffArgs) ? opts.ffArgs.map(String)
    : opts.file ? ['-ss', String(Math.max(0, +opts.start || 0)), ...(opts.duration ? ['-t', String(+opts.duration)] : []), '-i', String(opts.file)] : null;
  if (!ffArgs) return resolve({ ok: false, error: 'Nothing to transcribe' });
  const modelDir = opts.model ? sttModelDir(chk, String(opts.model)) : chk.modelDir; // optional: { model: 'hi' }
  if (!modelDir) return resolve({ ok: false, unavailable: true, error: 'That speech language is not installed with this copy of BTS Creative.' });
  const { utilityProcess } = require('electron');
  const env = { ...process.env };
  if (process.platform === 'win32') env.PATH = chk.libDir + path.delimiter + (env.PATH || '');
  const proc = utilityProcess.fork(path.join(__dirname, 'stt-worker.js'), [], { serviceName: 'BTS Speech-to-text', stdio: 'ignore', env });
  const job = { proc, cancelled: false }; sttJobs.set(id, job);
  const onGone = () => sttKill(id); e.sender.once('destroyed', onGone);
  let done = false; const finish = r => { if (done) return; done = true; if (sttJobs.get(id) === job) sttJobs.delete(id); try { proc.kill(); } catch {} if (!e.sender.isDestroyed()) e.sender.removeListener('destroyed', onGone); resolve(r); };
  proc.on('message', m => {
    if (!m) return;
    if (m.type === 'progress') { if (!e.sender.isDestroyed()) e.sender.send('stt:progress', m); }
    else if (m.type === 'done') finish(job.cancelled ? { ok: false, cancelled: true } : m.result);
  });
  proc.on('exit', code => finish(job.cancelled ? { ok: false, cancelled: true } : { ok: false, error: `The speech engine stopped unexpectedly (code ${code})` }));
  proc.on('spawn', () => proc.postMessage({ cmd: 'run', job: { libDir: chk.libDir, modelDir, ffmpeg: ffmpegPath(), ffArgs, duration: +opts.duration || 0 } }));
}));

// ---------- Auto update (from creative.btspl.tech) ----------
function broadcast(ch, payload) { for (const w of windows) if (!w.isDestroyed()) w.webContents.send(ch, payload); }
function setupUpdater() {
  if (!autoUpdater || !app.isPackaged || process.windowsStore) return; // Microsoft Store installs update through the Store
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('checking-for-update', () => broadcast('update:status', { state: 'checking' }));
  autoUpdater.on('update-available', i => broadcast('update:status', { state: 'available', version: i.version }));
  autoUpdater.on('update-not-available', () => broadcast('update:status', { state: 'none' }));
  autoUpdater.on('download-progress', p => broadcast('update:status', { state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', i => broadcast('update:status', { state: 'ready', version: i.version }));
  autoUpdater.on('error', err => broadcast('update:status', { state: 'error', message: String(err && err.message || err) }));
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 4000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
}
ipcMain.handle('update:check', async () => {
  if (process.windowsStore) return { state: 'store' };
  if (!autoUpdater || !app.isPackaged) return { state: 'dev' };
  try { await autoUpdater.checkForUpdates(); return { state: 'checking' }; } catch (e) { return { state: 'error', message: String(e.message || e) }; }
});
ipcMain.handle('update:install', () => { if (autoUpdater) autoUpdater.quitAndInstall(false, true); });
