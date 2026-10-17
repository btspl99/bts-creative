// BTS Creative — i18n engine (English / हिन्दी / मराठी). Works fully offline.
//  • T('Save')                     -> translated string (falls back to English)
//  • T('Page {n} of {m}', {n, m})  -> templated string
//  • Automatic DOM translation: text nodes and title / placeholder / aria-label / data-tip / button value
//    attributes whose trimmed text exactly matches a dictionary key (or a {placeholder} pattern key) are
//    translated after render and via a MutationObserver. The original English is kept in a WeakMap, so
//    switching back to English restores everything exactly.
//  • User content is never touched: canvas, svg, inputs, textarea, contenteditable, [data-no-i18n] and each
//    app's skip-list (I18N.skip('.layer-name, …')).
// Dictionaries live in src/shared/i18n/<lang>.js and call I18N.register(lang, {english: translation}).
(function () {
  'use strict';
  const LANGS = [
    { id: 'en', name: 'English', native: 'English', locale: 'en-IN' },
    { id: 'hi', name: 'Hindi', native: 'हिन्दी', locale: 'hi-IN' },
    { id: 'mr', name: 'Marathi', native: 'मराठी', locale: 'mr-IN' },
  ];
  const DICTS = { hi: Object.create(null), mr: Object.create(null) };
  const PATTERNS = { hi: null, mr: null };         // compiled {placeholder} keys, built lazily per language
  const HTMLKEYS = { hi: Object.create(null), mr: Object.create(null) };
  let lang = 'en';
  try { const st = JSON.parse(localStorage.getItem('bts.settings') || '{}'); if (st.lang && st.lang !== 'en') lang = st.lang; } catch { }

  const PH = /\{([A-Za-z_][\w]*)\}/g;
  const norm = s => String(s).replace(/\s+/g, ' ').trim();
  const isHtmlKey = k => /<\/?(b|i|em|strong|kbd|code|br|u|small|sup|sub)\b[^>]*>/i.test(k);

  function register(id, dict) {
    if (!DICTS[id]) { DICTS[id] = Object.create(null); HTMLKEYS[id] = Object.create(null); }
    for (const k in dict) { const v = dict[k]; if (typeof v !== 'string' || !v) continue; const nk = norm(k); DICTS[id][nk] = v; if (isHtmlKey(nk)) HTMLKEYS[id][nk.replace(/\s*<br\s*\/?>\s*/gi, '<br>')] = v; }
    PATTERNS[id] = null; cache.clear();
  }

  // ---------- lookup ----------
  // Numeric placeholder names match digits only; everything else matches any text.
  const NUMERIC = /^(n|i|k|m|count|num|total|done|length|pct|percent|p\d+|sec|ms|w|h|x|y|size|nWords|words|frames|captions|entities|cur|every|npick|existing|laterRevisions|laterSignatures|skipped|music|regions|N|f|passed|version)$/;
  function compile(id) {
    const list = [];
    for (const k in DICTS[id]) {
      if (k.indexOf('{') < 0) continue;
      const names = []; let lit = 0;
      const src = k.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{([A-Za-z_]\w*)\\?\}|\{([A-Za-z_]\w*)\}/g, (m, a, b) => { const nm = a || b; names.push(nm); return nm === 'version' ? '(v?[\\d.]+)' : NUMERIC.test(nm) && !/^p\d+$/.test(nm) ? '(-?[\\d][\\d.,]*)' : '(.+?)'; });
      if (!names.length) continue;
      lit = k.replace(PH, '').replace(/[^A-Za-z]/g, '').length;
      if (lit < 3) continue;                          // too generic to match safely
      let re; try { re = new RegExp('^' + src + '$'); } catch { continue; }
      const head = k.split('{')[0];
      list.push({ k, re, names, head: head.length >= 2 ? head.slice(0, 2) : '', lit });
    }
    list.sort((a, b) => b.lit - a.lit);               // most specific first
    const byHead = new Map(), any = [];
    list.forEach(p => { if (p.head) { if (!byHead.has(p.head)) byHead.set(p.head, []); byHead.get(p.head).push(p); } else any.push(p); });
    return (PATTERNS[id] = { byHead, any });
  }
  const USERPH = /^(name|fileName|path|p|file|src|url|title|cn|signer|logPath|font|fontFamily|lastQ|author|track|id)$/;
  function fill(s, params) { return params ? s.replace(PH, (m, k) => (params[k] !== undefined && params[k] !== null ? String(params[k]) : m)) : s; }

  // Exact lookup with light normalisation: trailing “…”, “:”, a shortcut hint “(Ctrl+X)”, leading bullets.
  function exact(d, t) {
    let v = d[t]; if (v !== undefined) return v;
    let m;
    if ((m = /^(.*?)(\s*(?:…|\.\.\.|:|\s›|\s»))$/.exec(t)) && m[1] && (v = d[m[1]]) !== undefined) return v + m[2];
    if ((m = /^(.*?)\s*\(((?:Ctrl|Shift|Alt|F\d+|Esc|Del|Space|Tab|Enter|Home|End|[A-Z0-9,.;'\/\[\]=\-+])[^()]{0,24})\)$/.exec(t)) && m[1]) { const b = exact(d, m[1]); if (b !== undefined) return b + ' (' + m[2] + ')'; }
    if ((m = /^([✓✗●•○◉▶■□★☆⚠✔✖+\-–—›»·*#]+\s*)(.+)$/.exec(t)) && (v = exact(d, m[2])) !== undefined) return m[1] + v;
    if ((m = /^(.+?)(\s*(?:[✓✗●•▾▸›»]|\p{Extended_Pictographic})+)$/u.exec(t)) && (v = exact(d, m[1])) !== undefined) return v + m[2];
    return undefined;
  }
  function viaPattern(id, t) {
    const P = PATTERNS[id] || compile(id); const d = DICTS[id];
    const bucket = P.byHead.get(t.slice(0, 2));
    for (const list of [bucket, P.any]) {
      if (!list) continue;
      for (const p of list) {
        const m = p.re.exec(t); if (!m) continue;
        const params = {};
        // Captured values are translated when they are UI words (“Undo Brush”), but never user content such as
        // layer, file or document names ({name}, {fileName}, {path}…).
        p.names.forEach((nm, i) => { const val = m[i + 1]; const tv = !USERPH.test(nm) && /[A-Za-z]{2}/.test(val) && val.length < 80 ? exact(d, val) : undefined; params[nm] = tv !== undefined && !/\{/.test(tv) ? tv : val; });
        return fill(d[p.k], params);
      }
    }
    return undefined;
  }
  // “Stylize › Glow”, “Artboard 1 · 1200 × 800 px”, “Levels — adds an editable adjustment layer”, “Brush (right-click for more)”:
  // translate each part separately when the whole string is not a key.
  const SEP = /(\s+[›·—–|]\s+|\s+→\s+)/;
  function part(id, p) { const d = DICTS[id]; let v = exact(d, p); if (v === undefined && /[A-Za-z]{2}/.test(p)) v = viaPattern(id, p); return v; }
  function composite(id, t) {
    if (SEP.test(t)) {
      const bits = t.split(SEP); let hit = false;
      const out = bits.map((b, i) => { if (i % 2) return b; const tb = b.trim(); if (!tb || !/[A-Za-z]{2}/.test(tb)) return b; const v = part(id, tb) ?? paren(id, tb); if (v !== undefined) { hit = true; return b.replace(tb, v); } return b; });
      if (hit) return out.join('');
    }
    return paren(id, t);
  }
  function paren(id, t) {
    const m = /^(.+?)\s*\(([^()]+)\)([.…:]?)$/.exec(t); if (!m) return undefined;
    const a = part(id, m[1].trim()); if (a === undefined) return undefined;
    const b = /[A-Za-z]{2}/.test(m[2]) ? part(id, m[2].trim()) : undefined;
    return a + ' (' + (b !== undefined ? b : m[2]) + ')' + m[3];
  }
  const cache = new Map();
  function lookup(t, id = lang) {
    if (id === 'en' || !DICTS[id]) return undefined;
    const ck = id + '\u0000' + t; if (cache.has(ck)) return cache.get(ck);
    let v = exact(DICTS[id], t);
    if (v === undefined) v = viaPattern(id, t);
    if (v === undefined) v = composite(id, t);
    if (v === undefined) { const m = /^(.*?)(\s*(?:…|\.\.\.|:))$/.exec(t); if (m && m[1]) { const b = viaPattern(id, m[1]); if (b !== undefined) v = b + m[2]; } }
    if (cache.size > 30000) cache.clear();
    cache.set(ck, v); return v;
  }
  // Public: T(english, params?)
  function T(key, params) {
    if (key == null) return '';
    const s = String(key);
    if (lang === 'en') return fill(s, params);
    const t = norm(s);
    const v = exact(DICTS[lang], t);
    if (v !== undefined) return fill(v, params);
    if (!params) { const p = lookup(t); if (p !== undefined) return p; }
    return fill(s, params);
  }
  // Translate a text value preserving its surrounding whitespace; returns the input when nothing matches.
  function translateText(s) {
    if (lang === 'en' || !s || !/[A-Za-z]{2}/.test(s)) return s;
    const t = s.trim(); if (t.length > 700) return s;
    const tn = t.indexOf('\n') >= 0 || /\s{2}/.test(t) ? norm(t) : t;
    const v = lookup(tn); if (v === undefined) return s;
    const i = s.indexOf(t);
    return s.slice(0, i) + v + s.slice(i + t.length);
  }

  // ---------- DOM translation ----------
  const textRec = new WeakMap();   // Text -> {src, out}
  const attrRec = new WeakMap();   // Element -> {attr: {src, out}}
  const htmlRec = new WeakMap();   // Element -> {src, out}  (inline-markup sentences)
  const ATTRS = ['title', 'placeholder', 'aria-label', 'data-tip', 'value', 'alt', 'data-label'];
  // User content that must never be translated (file, layer, clip, bookmark and font names; comments; PDF text layer).
  let SKIP = 'canvas,svg,script,style,select[data-no-i18n],[contenteditable=""],[contenteditable="true"],[contenteditable="plaintext-only"],[data-no-i18n],.no-i18n,.cmd .list,'
    + '.textLayer,.dt-n,.ol-item > .grow,.cm-body,.reply,.recent .path,'   // PDF Pro + shared
    + '.lname,'                                                                                  // Photo layer names
    + '.li .t,.fontlist,.fb-name,'                                                               // Vector layer/object names, font lists
    + '.mi .nm,.cl,.cap-txt';                                                                    // Video media names, clip labels, caption text
  function skip(sel) { if (sel) { SKIP += ',' + sel; } }
  const INLINE = new Set(['B', 'I', 'EM', 'STRONG', 'KBD', 'CODE', 'BR', 'U', 'SMALL', 'SUP', 'SUB']);

  function inSkip(el) { try { return !!(el && el.closest && (el.tagName === 'TEXTAREA' || el.closest(SKIP))); } catch { return false; } }

  function doText(node) {
    const cur = node.nodeValue; const rec = textRec.get(node);
    const src = rec && cur === rec.out ? rec.src : cur;
    if (lang === 'en') { if (rec) { if (cur === rec.out) node.nodeValue = rec.src; textRec.delete(node); } return; }
    if (!/[A-Za-z]{2}/.test(src)) { if (rec) textRec.delete(node); return; }
    const out = translateText(src);
    if (out !== src) { if (cur !== out) node.nodeValue = out; textRec.set(node, { src, out }); }
    else if (rec) { if (cur !== src) node.nodeValue = src; textRec.delete(node); }
  }
  function doAttr(el, a) {
    if (a === 'value' && !(el.tagName === 'BUTTON' || (el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type)))) return;
    const cur = el.getAttribute(a); let recs = attrRec.get(el); const rec = recs && recs[a];
    if (cur == null) { if (rec) delete recs[a]; return; }
    const src = rec && cur === rec.out ? rec.src : cur;
    if (lang === 'en') { if (rec) { if (cur === rec.out) el.setAttribute(a, rec.src); delete recs[a]; } return; }
    if (!/[A-Za-z]{2}/.test(src)) return;
    const out = a === 'data-tip' && /</.test(src) ? translateTipHtml(src) : translateText(src);
    if (out !== src) { if (!recs) attrRec.set(el, recs = {}); recs[a] = { src, out }; if (cur !== out) el.setAttribute(a, out); }
    else if (rec) { delete recs[a]; if (cur !== src) el.setAttribute(a, src); }
  }
  function translateTipHtml(s) { const k = norm(s); const v = lookup(k); if (v !== undefined) return v; return s.replace(/>([^<]+)</g, (m, t) => '>' + translateText(t) + '<').replace(/^([^<]+)/, (m, t) => translateText(t)); }
  // Elements whose content is a sentence with inline markup (“Press <kbd>Ctrl+K</kbd> to search”).
  function mixedKey(el) {
    let hasEl = false, hasTxt = false;
    for (let c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) { if (/[A-Za-z]{2}/.test(c.nodeValue)) hasTxt = true; }
      else if (c.nodeType === 1) { if (!INLINE.has(c.tagName) || c.id || c.attributes.length > 1 || c.querySelector('*:not(br):not(b):not(i):not(kbd)')) return null; hasEl = true; }
      else return null;
    }
    return hasEl && hasTxt ? norm(el.innerHTML).replace(/\s*<br\s*\/?>\s*/gi, '<br>') : null;
  }
  function doHtml(el) {
    const rec = htmlRec.get(el);
    if (rec && el.innerHTML !== rec.out) { htmlRec.delete(el); return doHtml(el); }
    if (lang === 'en') { if (rec) { htmlRec.delete(el); el.innerHTML = rec.src; } return !!rec; }
    const src = rec ? rec.src : null;
    const key = src ? norm(src).replace(/\s*<br\s*\/?>\s*/gi, '<br>') : mixedKey(el);
    if (!key) return false;
    const v = HTMLKEYS[lang] && HTMLKEYS[lang][key];
    if (v === undefined) { if (rec) { htmlRec.delete(el); el.innerHTML = rec.src; } return false; }
    const orig = src || el.innerHTML;
    el.innerHTML = v; htmlRec.set(el, { src: orig, out: el.innerHTML });
    return true;
  }
  function doElement(el) {
    for (let i = 0; i < ATTRS.length; i++) if (el.hasAttribute(ATTRS[i]) || (attrRec.get(el) || {})[ATTRS[i]]) doAttr(el, ATTRS[i]);
    if (el.tagName === 'OPTION' && !el.hasAttribute('value')) el.setAttribute('value', (textRec.get(el.firstChild) || {}).src || el.textContent);
  }
  const FILTER = {
    acceptNode(n) {
      if (n.nodeType === 3) return n.parentNode && n.parentNode.tagName === 'TEXTAREA' ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      try { if (n.matches(SKIP)) return NodeFilter.FILTER_REJECT; } catch { }
      return NodeFilter.FILTER_ACCEPT;
    },
  };
  let busy = false;
  function translateTree(root) {
    if (!root) return;
    busy = true;
    try {
      if (root.nodeType === 3) { doText(root); return; }
      if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
      if (root.nodeType === 1) { if (inSkip(root)) return; doElement(root); if ((lang !== 'en' && root.childElementCount) || htmlRec.has(root)) { if (doHtml(root)) return; } }
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, FILTER);
      let n = w.nextNode();
      while (n) {
        if (n.nodeType === 3) doText(n);
        else { doElement(n); if ((lang !== 'en' && n.childElementCount) || htmlRec.has(n)) { if (doHtml(n)) { n = nextSkippingChildren(w, n); continue; } } }
        n = w.nextNode();
      }
    } finally { busy = false; }
  }
  function nextSkippingChildren(w, n) { w.currentNode = n; let s = w.nextSibling(); while (!s) { const p = w.parentNode(); if (!p) return null; s = w.nextSibling(); } return s; }

  // MutationObserver, batched per microtask. Canvas/svg/skip subtrees are ignored; text without Latin letters
  // (timecodes, numbers) is rejected before any DOM query, so playback and painting stay cheap.
  const stats = { batches: 0, records: 0, ms: 0 };
  let pending = [], scheduled = false, enabled = true;
  function flush() {
    scheduled = false; const recs = pending; pending = [];
    const t0 = performance.now();
    busy = true;
    try {
      const seen = new Set();
      for (const r of recs) {
        if (r.type === 'characterData') {
          const n = r.target; if (seen.has(n)) continue; seen.add(n);
          if (!textRec.has(n) && !/[A-Za-z]{2}/.test(n.nodeValue || '')) continue;
          if (!n.parentNode || inSkip(n.parentNode)) continue;
          const p = n.parentNode; if (p.nodeType === 1 && htmlRec.has(p)) continue;
          doText(n);
        } else if (r.type === 'attributes') {
          const el = r.target; if (!el.isConnected || inSkip(el)) continue; doAttr(el, r.attributeName);
        } else {
          for (const n of r.addedNodes) {
            if (seen.has(n) || !n.isConnected) continue; seen.add(n);
            if (n.nodeType === 3) { if (!textRec.has(n) && !/[A-Za-z]{2}/.test(n.nodeValue)) continue; const p = n.parentNode; if (!p || inSkip(p)) continue; if (p.nodeType === 1 && lang !== 'en' && mixedKey(p) && doHtml(p)) continue; doText(n); }
            else if (n.nodeType === 1) { const p = n.parentNode; if (p && p.nodeType === 1 && INLINE.has(n.tagName) && lang !== 'en' && !htmlRec.has(p) && mixedKey(p)) { if (!inSkip(p) && doHtml(p)) continue; } translateTree(n); busy = true; }
          }
        }
      }
    } finally { busy = false; }
    stats.batches++; stats.records += recs.length; stats.ms += performance.now() - t0;
    if (obs) obs.takeRecords();   // drop records caused by our own writes
  }
  let obs = null;
  function observe() {
    if (obs || !window.MutationObserver) return;
    obs = new MutationObserver(list => { if (!enabled) return; for (const r of list) pending.push(r); if (!scheduled) { scheduled = true; flush(); } });
    const root = document.documentElement;
    obs.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  // ---------- language switching ----------
  const listeners = [];
  function applyDocLang() {
    const r = document.documentElement; r.lang = lang; r.dataset.lang = lang;
  }
  function setLang(id, { silent } = {}) {
    if (!LANGS.some(l => l.id === id)) id = 'en';
    const changed = id !== lang; lang = id; cache.clear(); applyDocLang();
    if (document.body) translateTree(document.body);
    if (document.title !== undefined) { }
    if (changed && !silent) { listeners.forEach(f => { try { f(lang); } catch (e) { console.error(e); } }); window.dispatchEvent(new CustomEvent('bts:lang', { detail: lang })); }
    return lang;
  }
  function onChange(fn) { listeners.push(fn); }

  // English source text of an element (even when it is shown translated) — for code that looks up UI by label.
  function source(el) {
    if (!el) return '';
    if (el.nodeType === 3) { const r = textRec.get(el); return r && el.nodeValue === r.out ? r.src : el.nodeValue; }
    const hr = htmlRec.get(el); if (hr) { const d = document.createElement('div'); d.innerHTML = hr.src; return d.textContent; }
    let s = ''; for (let c = el.firstChild; c; c = c.nextSibling) s += c.nodeType === 3 || c.nodeType === 1 ? source(c) : ''; return s;
  }
  // Create a text node that is already translated but remembers its English source (used by the UI kit).
  function text(key, params) {
    const src = params ? fill(String(key), params) : String(key);
    const n = document.createTextNode(src);
    if (lang !== 'en') { const out = params ? T(key, params) : translateText(src); if (out !== src) { n.nodeValue = out; textRec.set(n, { src, out }); } }
    return n;
  }

  // ---------- dates & numbers (Western digits, as most Indian software uses) ----------
  const loc = () => (LANGS.find(l => l.id === lang) || LANGS[0]).locale + '-u-nu-latn';
  function date(d, opts) { try { return new Intl.DateTimeFormat(lang === 'en' ? undefined : loc(), opts || { dateStyle: 'medium', timeStyle: 'short' }).format(d instanceof Date ? d : new Date(d)); } catch { return new Date(d).toLocaleString(); } }
  function number(n, opts) { try { return new Intl.NumberFormat(lang === 'en' ? undefined : loc(), opts).format(n); } catch { return String(n); } }

  // ---------- coverage / harvesting helpers (used by test/i18n-coverage.js) ----------
  function has(key, id = lang) { return id === 'en' || lookup(norm(key), id) !== undefined; }
  function harvest(root = document.body) {
    const out = new Set(); const add = s => { s = norm(s); if (s && /[A-Za-z]{2}/.test(s)) out.add(s); };
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, FILTER);
    let n;
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) add(source(n));
      else { ATTRS.forEach(a => { if (n.hasAttribute(a) && (a !== 'value' || /^(BUTTON)$/.test(n.tagName))) { const r = (attrRec.get(n) || {})[a]; add(r && n.getAttribute(a) === r.out ? r.src : n.getAttribute(a)); } }); const mk = mixedKey(n) || (htmlRec.get(n) && norm(htmlRec.get(n).src)); if (mk) out.add('HTML:' + mk); }
    }
    return [...out];
  }

  applyDocLang();
  observe();
  if (lang !== 'en') {
    if (document.body) translateTree(document.body);
    document.addEventListener('DOMContentLoaded', () => translateTree(document.body));
  }

  window.I18N = {
    LANGS, register, T, t: T, text, translateText, translateTree, setLang, onChange, skip, source, date, number, has, harvest, stats,
    get lang() { return lang; }, get dicts() { return DICTS; }, get enabled() { return enabled; }, set enabled(v) { const was = enabled; enabled = !!v; if (enabled && !was && document.body) translateTree(document.body); },
    locale: loc, isBusy: () => busy,
  };
  window.T = T;
})();
