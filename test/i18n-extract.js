// Static harvest of user-visible English strings from src/**/*.js and *.html (excluding src/vendor).
// Usage: node test/i18n-extract.js [out.json]   -> writes { strings: [...], where: {str: "file:line"} }
// Template literals become placeholder keys:  `Page ${i} of ${n}`  ->  "Page {i} of {n}"
'use strict';
const fs = require('fs'), path = require('path');
const ts = require('typescript');
const ROOT = path.join(__dirname, '..', 'src');
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (f === 'vendor' || f === 'i18n' || f === 'luts') continue; const s = fs.statSync(p); if (s.isDirectory()) walk(p); else if (/\.(js|html)$/.test(f) && f !== 'i18n.js') files.push(p); } })(ROOT);

const out = new Map();
const UI_PROPS = new Set(['label', 'title', 'text', 'placeholder', 'desc', 'tip', 'hint', 'name', 'help', 'ok', 'msg', 'message', 'like', 'caption', 'heading', 'note', 'info', 'empty', 'group', 'cat', 'sub', 'subtitle', 'body', 'description', 'html', 'status', 'detail', 'unit', 'what', 'why', 'fix', 'err', 'error', 'warn', 'summary', 'tooltip', 'data-tip', 'aria-label', 'cancel', 'confirm', 'prefix', 'suffix', 'value']);
const UI_CALLS = new Set(['toast', 'confirm', 'prompt', 'modal', 'form', 'setStatus', 'T', 'status', 'alert', 'setDocTitle', 'log', 'fail', 'say', 'info', 'warn', 'note', 'hint', 'progress', 'busy', 'askChoice', 'choose', 'msg']);

function codeLike(s) {
  const t = s.trim();
  if (!/[A-Za-z]{2}/.test(t)) return true;
  if (/^(https?:|data:|blob:|file:|mailto:|\.\.?\/|\/|#[0-9a-f]{3,8}\b|--|\.[a-z])/i.test(t)) return true;
  if (/^[a-z][a-zA-Z0-9]*$/.test(t)) return true;                    // identifiers / event names
  if (/^[a-z0-9]+([-_.:\/][a-z0-9]+)+$/i.test(t) && !/\s/.test(t)) return true; // kebab, mime, dotted, paths
  if (/^[A-Z0-9_]+$/.test(t) && t.length > 1 && !/^[A-Z]{2,5}$/.test(t)) return true; // CONSTANTS (keep PDF, OCR…)
  if (/[{};]\s*$|:\s*[^ ]+;|=>|\$\{|\bfunction\b|\breturn\b|===|!==|&&|\|\|/.test(t)) return true;
  if (/\d+(px|em|rem|vh|vw|deg|ms)\b/.test(t) && !/\s[a-z]{3,}\s/.test(t)) return true; // CSS
  if (/^[\[\(.:#>~*+@\\^$]/.test(t)) return true;
  if (/^(rgba?|hsla?|url|var|calc|linear-gradient|radial-gradient|conic-gradient|translate|rotate|scale|matrix)\(/.test(t)) return true;
  if (/^\w+\[[^\]]*\]/.test(t)) return true;                            // selectors
  if (/^(bold|italic|normal|\d+)\s+\d/.test(t)) return true;            // canvas fonts
  if (/^[a-z]+(\s[a-z]+)*$/.test(t) && /^(source|destination|ease|no|pre|sans|serif|monospace|top|left|right|bottom|center|middle|auto|none|inherit|nowrap|block|flex|grid|absolute|relative|pointer|default|hidden|visible|transparent|evenodd|nonzero|round|butt|square|miter|bevel|lighter|copy|xor|multiply|screen|overlay|darken|lighten|difference|exclusion|hue|saturation|color|luminosity)\b/.test(t) && t.split(' ').length <= 3) return true;
  if (/\.(js|css|html|json|wasm|mjs|png|jpg|svg|pdf|mp4|webm|wav|btsp|btsv|btsvid|cube|traineddata)$/i.test(t) && !/\s/.test(t)) return true;
  if (/^\s*<\/?[a-z]/i.test(t) && !/>[^<]*[A-Za-z]{2}/.test(t)) return true;
  if (/^(Ctrl|Shift|Alt|Cmd)\+/.test(t)) return true;                  // shortcuts
  if (/\b(sans-serif|serif|cursive|monospace)\b/.test(t) && /,/.test(t)) return true;  // font stacks
  if (/^q (BT|\{)|\b(Tf|Tw|Td|Tj|cm \/)\b/.test(t)) return true;               // PDF content streams
  if (/^M\{|^M\d/.test(t)) return true;                                    // SVG paths
  if (/^[a-z][\w-]*(\s[a-z][\w-]*)*$/.test(t) && /-/.test(t)) return true; // class lists
  return false;
}
function prose(s, ctx) {
  const t = s.trim();
  if (!t || t.length > 600 || codeLike(t)) return false;
  if (ctx) return true;
  if (/^[A-Z0-9(“"'¿…]/.test(t) && /[a-z]/.test(t)) return true;  // Capitalised words / sentences
  if (/…$/.test(t)) return true;
  return false;
}
const add = (s, where) => {
  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return;
  if (!out.has(s)) out.set(s, where);
};
// pull text out of HTML snippets
function fromHtml(html, where) {
  html = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  html.replace(/\s(?:title|placeholder|aria-label|data-tip|alt)\s*=\s*"([^"]*)"/gi, (_, v) => { if (prose(decode(v), true)) add(decode(v), where); });
  html.replace(/<input[^>]*type="(?:button|submit)"[^>]*value="([^"]*)"/gi, (_, v) => add(decode(v), where));
  const txt = html.replace(/<[^>]*>/g, '\u0001');
  txt.split('\u0001').forEach(seg => { const d = decode(seg); if (d.trim() && prose(d, true) && !codeLike(d)) add(d, where); });
}
const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&times;/g, '×').replace(/&rarr;/g, '→').replace(/&middot;/g, '·').replace(/&hellip;/g, '…');

function placeholderName(expr, i, used) {
  let n = null;
  if (ts.isIdentifier(expr)) n = expr.text;
  else if (ts.isPropertyAccessExpression(expr)) n = expr.name.text;
  if (!n || !/^[A-Za-z_]\w{0,15}$/.test(n) || used.has(n)) n = 'p' + i;
  used.add(n); return n;
}
function ctxOf(node) {
  const p = node.parent; if (!p) return false;
  if (ts.isPropertyAssignment(p) && p.initializer === node && /^['"]?(class|className|style|id|type|key|kind|mode|fmt|ext|mime|cls|role|font|family|accept|filter|op|blend|cursor|event)['"]?$/.test(p.name.getText())) return 'no';
  if (ts.isPropertyAssignment(p) && p.initializer === node) { const k = p.name.text || (p.name.getText && p.name.getText()); return UI_PROPS.has(String(k).replace(/['"]/g, '')); }
  if (ts.isConditionalExpression(p) || ts.isBinaryExpression(p) || ts.isParenthesizedExpression(p)) return ctxOf(p);
  if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
    const c = p.expression; const nm = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : '';
    if (UI_CALLS.has(nm)) return true;
    if (nm === 'h' && p.arguments.indexOf(node) >= 2) return true;          // h(tag, attrs, ...kids)
    if (nm === 'append' || nm === 'prepend' || nm === 'createTextNode') return true;
  }
  if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken) { const l = p.left.getText(); if (/(textContent|innerText|title|placeholder|innerHTML|label)$/.test(l)) return true; }
  if (ts.isArrayLiteralExpression(p)) { const g = p.parent; if (g && ts.isArrayLiteralExpression(g)) return true; }  // [['id','Label'], …] tables
  return false;
}
function scanJs(code, file, lineBase = 0) {
  const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const where = n => path.relative(ROOT, file) + ':' + (lineBase + sf.getLineAndCharacterOfPosition(n.getStart()).line + 1);
  (function visit(n) {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const s = n.text; const ctx = ctxOf(n); if (ctx === 'no') { ts.forEachChild(n, visit); return; }
      if (/<[a-z][^>]*>/i.test(s)) fromHtml(s, where(n));
      else if (prose(s, ctx)) add(s, where(n));
    } else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken && !(ts.isBinaryExpression(n.parent) && n.parent.operatorToken.kind === ts.SyntaxKind.PlusToken) && !(ts.isParenthesizedExpression(n.parent) && ts.isBinaryExpression(n.parent.parent))) {
      // 'Could not open ' + name + ': ' + e.message  ->  "Could not open {name}: {message}"
      const parts = []; (function flat(x) { if (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.PlusToken) { flat(x.left); flat(x.right); } else parts.push(x); })(n);
      if (parts.some(x => ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) && parts.some(x => !(ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)))) {
        const used = new Set(); let k = '', i = 0;
        parts.forEach(x => { if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) k += x.text; else if (ts.isTemplateExpression(x)) { k += x.head.text; x.templateSpans.forEach(sp => { k += '{' + placeholderName(sp.expression, i++, used) + '}' + sp.literal.text; }); } else k += '{' + placeholderName(ts.isCallExpression(x) && ts.isPropertyAccessExpression(x.expression) ? x.expression.expression : x, i++, used) + '}'; });
        const lit = k.replace(/\{[A-Za-z_]\w*\}/g, '');
        if (!/<[a-z][^>]*>/i.test(k) && /[A-Za-z]{3}/.test(lit) && !codeLike(lit) && prose(k.replace(/\{[A-Za-z_]\w*\}/g, 'X'), ctxOf(n) === true) && !/^\{[A-Za-z_]\w*\}\s*$/.test(k.trim())) add(k, where(n));
      }
    } else if (ts.isTemplateExpression(n)) {
      const used = new Set(); let s = n.head.text, ok = true;
      n.templateSpans.forEach((sp, i) => { s += '{' + placeholderName(sp.expression, i, used) + '}' + sp.literal.text; });
      if (/<[a-z][^>]*>/i.test(s)) { fromHtml(s.replace(/\{[A-Za-z_]\w*\}/g, m => m), where(n)); }
      else { const lit = s.replace(/\{[A-Za-z_]\w*\}/g, ''); if (ok && /[A-Za-z]{2}/.test(lit) && prose(s.replace(/\{([A-Za-z_]\w*)\}/g, 'X'), ctxOf(n)) && !codeLike(lit)) add(s, where(n)); }
    }
    ts.forEachChild(n, visit);
  })(sf);
}
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  if (f.endsWith('.html')) {
    fromHtml(src.replace(/<head>[\s\S]*?<\/head>/i, m => m.replace(/<title>[\s\S]*?<\/title>/, '')), path.relative(ROOT, f));
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi; let m;
    while ((m = re.exec(src))) scanJs(m[1], f, src.slice(0, m.index).split('\n').length - 1);
  } else scanJs(src, f);
}
// drop obvious junk
const strings = [...out.keys()].filter(s => !/^\{[A-Za-z_]\w*\}$/.test(s) && s.length > 1 && !/^[-–—•·|/\\:,.…]+$/.test(s));
const res = { generated: new Date().toISOString(), count: strings.length, strings: strings.sort(), where: Object.fromEntries(strings.map(s => [s, out.get(s)])) };
const dest = process.argv[2] || path.join(__dirname, 'i18n', 'strings.static.json');
fs.writeFileSync(dest, JSON.stringify(res, null, 1));
console.log('static strings:', strings.length, '->', dest);
