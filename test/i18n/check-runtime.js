// Harness script (BTS_SCRIPT): switch to Hindi or Marathi (BTS_LANG via location hash fallback 'hi'),
// walk every menu/submenu, click tabs and tools, and report visible English text that was not translated.
const lang = window.__lang || 'hi';
UI.setSettings({ lang }); await UI.sleep(200);
const miss = new Set(), seenEl = new Set();
const ok = s => !s || !/[A-Za-z]{2}/.test(s) || I18N.has(s, lang);
const walk = (items, d) => { let list; try { list = typeof items === 'function' ? items() : items || []; } catch (e) { return; } list.forEach(it => { if (!it || it === '-' || it.sep) return; if (!it.noT && !ok(String(it.label).replace(/\s+/g, ' ').trim())) miss.add('MENU: ' + it.label); if (it.sub && d < 6) walk(it.sub, d + 1); }); };
UI._menus().forEach(m => { if (!ok(m.label)) miss.add('MENU: ' + m.label); walk(m.items, 0); });
const SKIP = 'canvas,svg,script,style,textarea,[contenteditable="true"],[data-no-i18n],.cmd .list,.textLayer,.dt-n,.ol-item > .grow,.cm-body,.reply,#docTitle,.doc-title,.recent .path,.lname,.li .t,.fontlist,.fb-name,.mi .nm,.cl,.cap-txt,kbd,.kbd';
const scan = () => {
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; while ((n = w.nextNode())) {
    const p = n.parentElement; if (!p || p.closest(SKIP)) continue;
    if (!p.offsetParent && getComputedStyle(p).position !== 'fixed') continue;
    const t = n.nodeValue.replace(/\s+/g, ' ').trim();
    if (/[A-Za-z]{3}/.test(t) && !/[ऀ-ॿ]/.test(t)) { const src = I18N.source(n).replace(/\s+/g, ' ').trim(); if (!ok(src)) miss.add(src.slice(0, 160)); else if (/[\u0900-\u097F]/.test(I18N.translateText(src))) miss.add('NOT APPLIED: ' + src.slice(0, 140)); }
  }
  document.querySelectorAll('[title],[placeholder],[data-tip]').forEach(el => { if (el.closest(SKIP)) return; ['title', 'placeholder', 'data-tip'].forEach(a => { const v = el.getAttribute(a); if (v && /[A-Za-z]{3}/.test(v) && !/[ऀ-ॿ]/.test(v) && !/^[\w.\/\\:-]+$/.test(v) && !/^#[0-9a-f]{3,8}$/i.test(v)) miss.add('@' + a + ': ' + v.slice(0, 120)); }); });
};
scan();
const tabSel = '.tabs .tab, [data-tab], .tab, .rt-tab, .ltab, .side .nav, .seg button, .mode-btn';
for (let r = 0; r < 2; r++) for (const t of [...document.querySelectorAll(tabSel)].filter(t => !seenEl.has(t) && t.offsetParent)) { seenEl.add(t); try { t.click(); } catch { } await UI.sleep(100); scan(); }
for (const b of [...document.querySelectorAll('.toolbar .icon-btn, .toolbar button')]) { try { b.click(); } catch { } await UI.sleep(30); scan(); }
return JSON.stringify({ lang, n: miss.size, miss: [...miss].sort() });
