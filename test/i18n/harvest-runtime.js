const out = new Set();
const add = s => { if (s == null) return; s = String(s).replace(/\s+/g, ' ').trim(); if (s && /[A-Za-z]{2}/.test(s)) out.add(s); };
const walk = (items, depth) => { let list; try { list = typeof items === 'function' ? items() : items || []; } catch (e) { add('ERR ' + e.message); return; } list.forEach(it => { if (!it || it === '-' || it.sep) return; if (!it.noT) add(it.label); if (it.sub && depth < 6) walk(it.sub, depth + 1); }); };
UI._menus().forEach(m => { add(m.label); walk(m.items, 0); });
const grab = () => I18N.harvest(document.body).forEach(s => out.add(s));
grab();
const sleep = ms => new Promise(r => setTimeout(r, ms));
// click every tab-like element to reveal panels
const tabSel = '.tabs .tab, [data-tab], .tab, .rt-tab, .ltab, .lt, .side .nav, .seg button, .mode-btn';
const seen = new Set();
for (let round = 0; round < 3; round++) {
  const tabs = [...document.querySelectorAll(tabSel)].filter(t => !seen.has(t) && t.offsetParent);
  for (const t of tabs) { seen.add(t); try { t.click(); } catch { } await sleep(120); grab(); }
}
// tools: click each tool button so its options bar renders
for (const b of [...document.querySelectorAll('.toolbar .icon-btn, .toolbar button')]) { try { b.click(); } catch { } await sleep(40); grab(); }
document.querySelectorAll('.dropdown').forEach(d => d.remove());
return JSON.stringify([...out]);
