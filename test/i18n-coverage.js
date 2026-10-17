// i18n coverage report: what share of harvested UI strings (test/i18n/strings.json) the Hindi and Marathi
// dictionaries translate, using the real engine (src/shared/i18n.js: exact keys, “…”/“:” and shortcut-hint
// normalisation, {placeholder} patterns, “A › B” composites).
// Usage: node test/i18n-coverage.js [--harvest] [--missing hi|mr] [--json]
//   --harvest   re-run the static harvest first (node test/i18n-strings.js)
//   --missing   print every missing key for that language
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
const args = process.argv.slice(2);
if (args.includes('--harvest')) cp.execFileSync(process.execPath, [path.join(__dirname, 'i18n-strings.js')], { stdio: 'inherit' });
const root = path.join(__dirname, '..', 'src', 'shared');
// Minimal browser stubs — the engine only needs these to load and to look strings up.
const ctx = {
  console, performance: { now: () => 0 }, localStorage: { getItem: () => null }, NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1, FILTER_ACCEPT: 1, FILTER_REJECT: 2 },
  document: { documentElement: { dataset: {} }, body: null, addEventListener() { }, createTextNode: s => ({ nodeValue: s }) },
  CustomEvent: function () { }, addEventListener() { }, dispatchEvent() { },
};
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['i18n.js', 'i18n/hi.js', 'i18n/mr.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
const I = ctx.I18N;
const H = JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n', 'strings.json'), 'utf8'));
let ignore = []; try { ignore = JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n', 'ignore.json'), 'utf8')); } catch { }
const ign = new Set(ignore);
const strings = H.strings.filter(s => !ign.has(s) && !ign.has(s.replace(/^HTML:/, '')));
const report = {};
for (const lang of ['hi', 'mr']) {
  const d = I.dicts[lang];
  const missing = strings.filter(s => {
    if (s.startsWith('HTML:')) { const k = s.slice(5); return d[k] === undefined; }
    return !I.has(s, lang);
  });
  // translations that are identical to English (allowed for brand names / formats, listed for review)
  const same = Object.keys(d).filter(k => d[k] === k).length;
  report[lang] = { total: strings.length, translated: strings.length - missing.length, pct: +(100 * (strings.length - missing.length) / strings.length).toFixed(2), entries: Object.keys(d).length, keptEnglish: same, missing };
}
if (args.includes('--json')) { console.log(JSON.stringify(report, null, 1)); process.exit(0); }
console.log(`Harvested UI strings: ${H.count} (${ignore.length} marked not-UI)  — checked: ${strings.length}`);
for (const lang of ['hi', 'mr']) { const r = report[lang]; console.log(`${lang}: ${r.translated}/${r.total} = ${r.pct}%  · dictionary entries ${r.entries} (kept in English: ${r.keptEnglish}) · missing ${r.missing.length}`); }
const ml = args[args.indexOf('--missing') + 1];
if (args.includes('--missing') && report[ml]) console.log('\nMissing (' + ml + '):\n' + report[ml].missing.map(s => s + '\t@' + (H.where[s] || '')).join('\n'));
else for (const lang of ['hi', 'mr']) if (report[lang].missing.length) console.log(`\nfirst missing (${lang}):\n  ` + report[lang].missing.slice(0, 25).join('\n  '));
const fail = ['hi', 'mr'].some(l => report[l].pct < 98);
if (fail) { console.log('\nFAIL: coverage below 98%'); process.exitCode = 1; } else console.log('\nOK: coverage ≥ 98% in both languages');
