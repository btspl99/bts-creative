// Builds test/i18n/strings.json: every user-visible English string = static harvest (test/i18n-extract.js)
// ∪ runtime harvest (test/i18n/runtime-<app>.json, produced by test/i18n/harvest-runtime.js in the harness).
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const dir = path.join(__dirname, 'i18n');
const staticOut = path.join(dir, 'strings.static.json');
cp.execFileSync(process.execPath, [path.join(__dirname, 'i18n-extract.js'), staticOut], { stdio: 'inherit' });
const st = JSON.parse(fs.readFileSync(staticOut, 'utf8'));
const where = { ...st.where }; const all = new Set(st.strings);
// Runtime strings that are user content / data rather than UI text
const junk = s => /^#[0-9a-f]{3,8}$/i.test(s) || /^[\/~]|[\\/][\w.-]+\.\w{2,5}$/.test(s) || /^[\w .-]+\.(pdf|png|jpe?g|mp4|webm|svg|btsp|btsv|btsvid|wav|mp3)( @ \d+%)?$/i.test(s)
  || /^(Noto|Latin Modern|DejaVu|Liberation|GFS|IPA|Free(Sans|Serif|Mono)|Lohit|Kalimati|Gargi|Sarai|Samanata)/.test(s) || /^\d{1,2}:\d{2}( [AP]M)?$/.test(s) || /^Untitled-\d+$/.test(s) || /^ERR /.test(s);
for (const f of fs.readdirSync(dir).filter(f => /^runtime-.*\.json$/.test(f))) {
  const app = f.replace(/^runtime-|\.json$/g, '');
  for (const s of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) if (!junk(s) && !all.has(s)) { all.add(s); where[s] = 'runtime:' + app; }
}
const strings = [...all].sort();
fs.writeFileSync(path.join(dir, 'strings.json'), JSON.stringify({ generated: new Date().toISOString(), count: strings.length, strings, where }, null, 1));
console.log('harvested strings:', strings.length, '(static', st.strings.length + ', runtime-only', strings.length - st.strings.length + ')');
