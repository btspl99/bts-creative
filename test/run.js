// Test harness: boots the real main process, opens an app window, runs a script, screenshots.
const path = require('path'); const fs = require('fs');
const { app, BrowserWindow } = require('electron');
const appId = process.env.BTS_APP || 'pdf'; const file = process.env.BTS_FILE || null; const script = process.env.BTS_SCRIPT ? fs.readFileSync(process.env.BTS_SCRIPT, 'utf8') : '';
const out = process.env.BTS_OUT || '/tmp/shot';
require(path.join(__dirname, '..', 'main.js'));
app.setVersion(require('../package.json').version);
app.whenReady().then(async () => {
  await new Promise(r => setTimeout(r, 800));
  BrowserWindow.getAllWindows().forEach(w => w.close());
  const { ipcMain } = require('electron');
  const win = new BrowserWindow({ width: 1440, height: 900, show: true, webPreferences: { preload: path.join(__dirname, '..', 'preload.js'), contextIsolation: true, sandbox: false } });
  const logs = [];
  win.webContents.on('console-message', (_e, level, msg, line, src) => logs.push(`[${level}] ${msg} (${(src||'').split('/').pop()}:${line})`));
  const cfg = { home: 'src/home/index.html', pdf: 'src/pdf/index.html', photo: 'src/photo/index.html', vector: 'src/vector/index.html', video: 'src/video/index.html' }[appId];
  await win.loadFile(path.join(__dirname, '..', cfg), { query: file ? { file } : {} });
  await new Promise(r => setTimeout(r, 2500));
  let result = null;
  if (script) { try { result = await win.webContents.executeJavaScript(`(async()=>{ ${script} })()`); } catch (e) { result = 'SCRIPT ERROR: ' + e.message; } }
  await new Promise(r => setTimeout(r, 1200));
  const img = await win.webContents.capturePage(); fs.writeFileSync(out + '.png', img.toPNG());
  console.log('RESULT:', typeof result === 'string' ? result : JSON.stringify(result));
  console.log(logs.filter(l => !l.includes('Electron Security Warning')).slice(-40).join('\n'));
  app.exit(0);
});
