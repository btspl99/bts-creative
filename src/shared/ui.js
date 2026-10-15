// BTS Creative — shared UI kit: title bar, menus, shortcuts, modals, toasts, icons, history
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) sk.startsWith('--') ? el.style.setProperty(sk, sv) : (el.style[sk] = sv); }
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  };

  // ---------- Icons (24px stroke) ----------
  const P = {
    move: 'M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20',
    select: 'M4 3l7 17 2.5-7.5L21 10z',
    direct: 'M4 3l7 17 2.5-7.5L21 10z M14 14l6 6',
    hand: 'M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8l-1.5-1.5a2 2 0 0 0-3 2.6L6 20a6 6 0 0 0 5 2h2a7 7 0 0 0 7-7v-4a2 2 0 0 0-4 0',
    zoom: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5M8 11h6M11 8v6',
    marquee: 'M3 3h4M10 3h4M17 3h4v4M21 10v4M21 17v4h-4M14 21h-4M7 21H3v-4M3 14v-4M3 7V3',
    ellipseSel: 'M12 4c5 0 9 3.6 9 8s-4 8-9 8-9-3.6-9-8 4-8 9-8z',
    lasso: 'M7 22c0-3 4-4 4-4M12 18c-5 0-9-3-9-7s4-7 9-7 9 3 9 7-4 7-9 7z',
    wand: 'M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8l1.4 1.4M17.8 6.2l1.4-1.4M12.2 6.2L10.8 4.8M3 21l9-9',
    crop: 'M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2',
    eyedrop: 'M2 22l1-1h3l9-9M3 21v-3l9-9M15 6l3-3a2.1 2.1 0 0 1 3 3l-3 3 1 1-2 2-6-6 2-2z',
    heal: 'M10 2h4v8h8v4h-8v8h-4v-8H2v-4h8z',
    brush: 'M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z',
    pencil: 'M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z',
    clone: 'M9 2h6v4H9zM5 6h14v16H5zM9 12h6M12 9v6',
    eraser: 'M7 21h10M20.6 14.6l-9-9a2 2 0 0 0-2.8 0L3.4 11a2 2 0 0 0 0 2.8l6.8 6.8a2 2 0 0 0 1.4.6H16l4.6-4.6a2 2 0 0 0 0-2z',
    bucket: 'M19 11l-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2a2 2 0 0 0 2.8 0zM5 2l5 5M2 13h15M22 20a2 2 0 1 1-4 0c0-1.6 2-4 2-4s2 2.4 2 4z',
    gradient: 'M3 3h18v18H3zM3 3l18 18',
    blur: 'M12 2.7c3.2 3.6 6 7 6 10.3a6 6 0 0 1-12 0c0-3.3 2.8-6.7 6-10.3z',
    dodge: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3v18',
    pen: 'M12 19l7-7 3 3-7 7zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18zM2 2l7.6 7.6M11 11a2 2 0 1 0 0 0',
    text: 'M4 7V4h16v3M9 20h6M12 4v16',
    rect: 'M3 5h18v14H3z',
    ellipse: 'M12 5c5 0 9 3.1 9 7s-4 7-9 7-9-3.1-9-7 4-7 9-7z',
    line: 'M4 20L20 4',
    arrow: 'M5 19L19 5M9 5h10v10',
    polygon: 'M12 2l9 7-3.5 11h-11L3 9z',
    star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z',
    highlight: 'M9 11l-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4',
    underline: 'M6 4v6a6 6 0 0 0 12 0V4M4 21h16',
    strike: 'M16 4H9a3 3 0 0 0-2.8 4M14 12a4 4 0 0 1 0 8H6M4 12h16',
    note: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    sign: 'M20 19.5v.5a2 2 0 0 1-2 2H4M3 17c3-1 4-5 6-5s1 4 3 4 3-3 5-3M14.5 4.5l5 5L9 20H4v-5z',
    stamp: 'M5 22h14M5 18h14v-3a2 2 0 0 0-2-2h-3l1-6a3 3 0 1 0-6 0l1 6H7a2 2 0 0 0-2 2z',
    redact: 'M3 6h18v4H3zM3 14h12v4H3z',
    image: 'M3 3h18v18H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
    form: 'M4 4h16v16H4zM8 9h8M8 13h5M8 17h3',
    open: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    save: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8',
    export: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
    print: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
    undo: 'M3 7v6h6M21 17a9 9 0 0 0-15-6.7L3 13',
    redo: 'M21 7v6h-6M3 17a9 9 0 0 1 15-6.7L21 13',
    plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
    trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
    eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    eyeOff: 'M17.9 17.9A10.1 10.1 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.1-5.9M9.9 4.2A9 9 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2M1 1l22 22',
    lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4', unlock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.9-1',
    copy: 'M9 9h13v13H9zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1',
    layers: 'M12 2l10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5',
    folder: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
    rotate: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
    rotateL: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
    merge: 'M8 6L12 2l4 4M12 2v10l-6 6M12 12l6 6',
    split: 'M16 3h5v5M8 3H3v5M12 22v-8.3a4 4 0 0 0-1.2-2.9L3 3M21 3l-7.8 7.8',
    pages: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
    fit: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
    chevL: 'M15 18l-6-6 6-6', chevR: 'M9 18l6-6-6-6', chevD: 'M6 9l6 6 6-6', chevU: 'M18 15l-6-6-6 6',
    play: 'M6 3l14 9-14 9z', pause: 'M6 4h4v16H6zM14 4h4v16h-4z', stop: 'M5 5h14v14H5z',
    skipB: 'M19 20L9 12l10-8zM5 19V5', skipF: 'M5 4l10 8-10 8zM19 5v14',
    scissors: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12',
    film: 'M2 2h20v20H2zM7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5',
    music: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
    volume: 'M11 5L6 9H2v6h4l5 4zM19 5a10 10 0 0 1 0 14M15.5 8.5a5 5 0 0 1 0 7',
    magnet: 'M6 15a6 6 0 0 0 12 0V3h-4v12a2 2 0 0 1-4 0V3H6zM6 7h4M14 7h4',
    sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
    adjust: 'M12 2a10 10 0 1 0 0 20zM12 2a10 10 0 0 1 0 20',
    fx: 'M5 20c3 0 3-16 6-16M3 10h7M14 8l6 8M20 8l-6 8',
    flipH: 'M12 3v18M16 7l4 5-4 5M8 7l-4 5 4 5', flipV: 'M3 12h18M7 8l5-4 5 4M7 16l5 4 5-4',
    alignL: 'M4 3v18M8 7h12v4H8zM8 14h7v4H8z', alignC: 'M12 3v18M6 7h12v4H6zM8.5 14h7v4h-7z', alignR: 'M20 3v18M4 7h12v4H4zM9 14h7v4H9z',
    alignT: 'M3 4h18M7 8v12h4V8zM14 8v7h4V8z', alignM: 'M3 12h18M7 6v12h4V6zM14 8.5v7h4v-7z', alignB: 'M3 20h18M7 4v12h4V4zM14 9v7h4V9z',
    group: 'M3 3h7v7H3zM14 14h7v7h-7zM10 6.5h4v11h-4', ungroup: 'M3 3h7v7H3zM14 14h7v7h-7z',
    front: 'M8 8h13v13H8zM3 3h13v13H3z', back: 'M3 3h13v13H3zM8 8h13v13H8z',
    bool: 'M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM15 21a6 6 0 1 0 0-12 6 6 0 0 0 0 12z',
    info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
    update: 'M21 12a9 9 0 0 1-9 9 9 9 0 0 1-6.4-2.6M3 12a9 9 0 0 1 15.4-6.4M21 3v6h-6M3 21v-6h6',
    grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
    compress: 'M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7',
    ocr: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 8h10M7 12h10M7 16h6',
    swap: 'M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
    mask: 'M3 3h18v18H3zM12 7a5 5 0 1 0 0 10',
    smudge: 'M18 2l4 4-12 12H6v-4zM3 21c2-2 2-4 4-4',
    sponge: 'M4 8h16v12H4zM8 12h.01M12 15h.01M16 12h.01',
    hexagon: 'M21 16V8l-9-5-9 5v8l9 5z',
    anchor: 'M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 8v14M5 12H2a10 10 0 0 0 20 0h-3',
    shape: 'M8 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM13 13h8v8h-8z',
    transition: 'M3 3h8v18H3zM13 3h8v18h-8zM11 12h2',
  };
  function icon(name, size) {
    const d = P[name] || P.info;
    const s = size ? ` style="width:${size}px;height:${size}px"` : '';
    return `<svg viewBox="0 0 24 24"${s}><path d="${d}"/></svg>`;
  }

  // ---------- Title bar with menus ----------
  function titlebar({ logo = 'B', menus = [], actions = null }) {
    const bar = h('div', { class: 'titlebar' });
    bar.append(h('div', { class: 'logo' }, logo));
    const mwrap = h('div', { class: 'menus' });
    let openMenu = null;
    const closeAll = () => { document.querySelectorAll('.dropdown').forEach(d => d.remove()); mwrap.querySelectorAll('.open').forEach(b => b.classList.remove('open')); openMenu = null; };
    menus.forEach(m => {
      const b = h('button', { class: 'menu-btn' }, m.label);
      const show = () => {
        closeAll(); b.classList.add('open'); openMenu = b;
        const r = b.getBoundingClientRect();
        showDropdown(typeof m.items === 'function' ? m.items() : m.items, r.left, r.bottom + 2, closeAll);
      };
      b.addEventListener('mousedown', e => { e.stopPropagation(); openMenu === b ? closeAll() : show(); });
      b.addEventListener('mouseenter', () => { if (openMenu && openMenu !== b) show(); });
      mwrap.append(b);
    });
    document.addEventListener('mousedown', e => { if (!e.target.closest('.dropdown')) closeAll(); });
    bar.append(mwrap, h('div', { class: 'doc-title', id: 'docTitle' }), h('div', { class: 'spacer' }));
    const acts = h('div', { class: 'tb-actions' });
    const pill = h('div', { class: 'update-pill', id: 'updatePill', html: icon('update', 14) + '<span>Update</span>' });
    acts.append(pill); if (actions) acts.append(actions);
    bar.append(acts);
    const ctl = h('div', { class: 'win-ctl' },
      h('button', { onclick: () => bts.win.min(), html: '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor"/></svg>' }),
      h('button', { onclick: () => bts.win.max(), html: '<svg width="10" height="10" viewBox="0 0 10 10"><rect x=".5" y=".5" width="9" height="9" fill="none" stroke="currentColor"/></svg>' }),
      h('button', { class: 'close', onclick: () => window.dispatchEvent(new CustomEvent('bts:close')), html: '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor"/></svg>' }));
    bar.append(ctl);
    document.body.prepend(bar);
    wireUpdate(pill);
    return bar;
  }

  function showDropdown(items, x, y, onClose) {
    const dd = h('div', { class: 'dropdown' });
    items.forEach(it => {
      if (it === '-' || it.sep) { dd.append(h('div', { class: 'sep' })); return; }
      const dis = typeof it.disabled === 'function' ? it.disabled() : it.disabled;
      const chk = typeof it.checked === 'function' ? it.checked() : it.checked;
      const row = h('div', { class: 'item' + (dis ? ' disabled' : '') },
        h('span', { class: 'check' }, chk ? '✓' : ''), h('span', {}, it.label),
        it.sub ? h('span', { class: 'sub-arrow' }, '›') : h('span', { class: 'kbd' }, it.kbd || ''));
      if (it.sub) {
        let subEl = null;
        row.addEventListener('mouseenter', () => {
          dd.querySelectorAll(':scope > .sub-dd').forEach(s => s.remove());
          const r = row.getBoundingClientRect();
          subEl = showDropdown(it.sub, r.right + 2, r.top - 5, onClose); subEl.classList.add('sub-dd');
        });
      } else {
        row.addEventListener('mouseenter', () => document.querySelectorAll('.sub-dd').forEach(s => { if (!s.contains(row)) s.remove(); }));
        row.addEventListener('mouseup', () => { onClose && onClose(); it.action && it.action(); });
      }
      dd.append(row);
    });
    document.body.append(dd);
    const r = dd.getBoundingClientRect();
    dd.style.left = Math.min(x, innerWidth - r.width - 6) + 'px';
    dd.style.top = Math.min(y, innerHeight - r.height - 6) + 'px';
    return dd;
  }
  function contextMenu(e, items) {
    e.preventDefault();
    document.querySelectorAll('.dropdown').forEach(d => d.remove());
    const close = () => document.querySelectorAll('.dropdown').forEach(d => d.remove());
    showDropdown(items, e.clientX, e.clientY, close);
  }

  function setDocTitle(t, appName) {
    const el = $('#docTitle'); if (el) el.textContent = t;
    bts.win.title(t ? `${t} — ${appName}` : appName);
  }

  // ---------- Update UI ----------
  function wireUpdate(pill) {
    if (!window.bts || !bts.update) return;
    bts.update.onStatus(s => {
      const label = pill.querySelector('span');
      if (s.state === 'downloading') { pill.classList.add('show'); label.textContent = `Downloading update ${s.percent}%`; pill.onclick = null; }
      else if (s.state === 'ready') { pill.classList.add('show'); label.textContent = `Restart to update (v${s.version})`; pill.onclick = () => bts.update.install(); toast(`Update v${s.version} ready. Click the pill in the title bar to restart.`, 'ok'); }
      else if (s.state === 'available') { pill.classList.add('show'); label.textContent = `Update v${s.version} found`; }
      else if (s.state !== 'checking') pill.classList.remove('show');
    });
  }

  // ---------- Shortcuts ----------
  const shortcuts = [];
  function shortcut(combo, fn, opts = {}) { shortcuts.push({ combo: combo.toLowerCase(), fn, ...opts }); }
  function comboOf(e) {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
    return [(e.ctrlKey || e.metaKey) && 'ctrl', e.shiftKey && 'shift', e.altKey && 'alt', k].filter(Boolean).join('+');
  }
  window.addEventListener('keydown', e => {
    const typing = e.target.closest('input,textarea,select,[contenteditable="true"]');
    const c = comboOf(e);
    for (const s of shortcuts) {
      if (s.combo === c && (!typing || s.global)) { e.preventDefault(); s.fn(e); return; }
    }
  });

  // ---------- Tooltips ----------
  let tipEl = null, tipTimer = null;
  document.addEventListener('mouseover', e => {
    const t = e.target.closest('[data-tip]'); clearTimeout(tipTimer);
    if (tipEl) { tipEl.remove(); tipEl = null; }
    if (!t) return;
    tipTimer = setTimeout(() => {
      tipEl = h('div', { class: 'tip-pop', html: t.dataset.tip + (t.dataset.key ? `<span class="k">${t.dataset.key}</span>` : '') });
      document.body.append(tipEl);
      const r = t.getBoundingClientRect(), tr = tipEl.getBoundingClientRect();
      let x = r.right + 8, y = r.top + r.height / 2 - tr.height / 2;
      if (x + tr.width > innerWidth) { x = r.left + r.width / 2 - tr.width / 2; y = r.bottom + 6; }
      tipEl.style.left = Math.max(4, x) + 'px'; tipEl.style.top = Math.max(4, y) + 'px';
    }, 450);
  });
  document.addEventListener('mousedown', () => { clearTimeout(tipTimer); if (tipEl) { tipEl.remove(); tipEl = null; } });

  // ---------- Modals & toasts ----------
  function modal({ title, body, buttons = [{ label: 'OK', primary: true }], width, onOpen }) {
    return new Promise(resolve => {
      const back = h('div', { class: 'modal-back' });
      const m = h('div', { class: 'modal', style: width ? { width: width + 'px' } : {} });
      const b = h('div', { class: 'm-b' }); if (typeof body === 'string') b.innerHTML = body; else if (body) b.append(body);
      const f = h('div', { class: 'm-f' });
      const close = v => { back.remove(); resolve(v); };
      buttons.forEach(bt => f.append(h('button', { class: 'btn' + (bt.primary ? ' primary' : ''), onclick: () => close(bt.value !== undefined ? bt.value : bt.label) }, bt.label)));
      m.append(h('div', { class: 'm-h' }, title), b, f); back.append(m); document.body.append(back);
      back.addEventListener('mousedown', e => { if (e.target === back) close(null); });
      m.addEventListener('keydown', e => { if (e.key === 'Escape') close(null); if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { const p = buttons.find(x => x.primary); if (p) close(p.value !== undefined ? p.value : p.label); } });
      onOpen && onOpen(b);
      const first = b.querySelector('input,select,textarea'); (first || f.querySelector('.primary'))?.focus();
    });
  }
  async function prompt(title, label, value = '', type = 'text') {
    const inp = h('input', { type, value });
    const r = await modal({ title, body: h('label', { class: 'field' }, label, inp), buttons: [{ label: 'Cancel', value: null }, { label: 'OK', primary: true, value: 'ok' }] });
    return r === 'ok' ? inp.value : null;
  }
  async function confirm(title, msg, ok = 'OK', danger) {
    return (await modal({ title, body: msg, buttons: [{ label: 'Cancel', value: false }, { label: ok, primary: true, value: true }] })) === true;
  }
  // form({title, fields:[{key,label,type,value,min,max,step,options}]}) -> values or null
  async function form({ title, fields, ok = 'OK', width, onChange }) {
    const vals = {}; const wrap = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } });
    fields.forEach(fd => {
      vals[fd.key] = fd.value;
      let inp;
      if (fd.type === 'select') { inp = h('select', {}, ...fd.options.map(o => h('option', { value: o.value ?? o, selected: (o.value ?? o) == fd.value }, o.label ?? o))); }
      else if (fd.type === 'range') {
        const num = h('input', { type: 'number', value: fd.value, min: fd.min, max: fd.max, step: fd.step || 1, style: { width: '64px' } });
        const rng = h('input', { type: 'range', value: fd.value, min: fd.min, max: fd.max, step: fd.step || 1 });
        rng.oninput = () => { num.value = rng.value; vals[fd.key] = +rng.value; onChange && onChange(vals); };
        num.oninput = () => { rng.value = num.value; vals[fd.key] = +num.value; onChange && onChange(vals); };
        wrap.append(h('label', { class: 'field' }, fd.label, h('div', { class: 'row' }, rng, num))); return;
      }
      else if (fd.type === 'checkbox') { inp = h('input', { type: 'checkbox', checked: !!fd.value }); inp.onchange = () => { vals[fd.key] = inp.checked; onChange && onChange(vals); }; wrap.append(h('label', { class: 'row', style: { color: 'var(--tx-1)' } }, inp, fd.label)); return; }
      else if (fd.type === 'textarea') inp = h('textarea', { rows: fd.rows || 4 }, fd.value || '');
      else inp = h('input', { type: fd.type || 'text', value: fd.value ?? '', min: fd.min, max: fd.max, step: fd.step });
      const upd = () => { vals[fd.key] = (fd.type === 'number') ? +inp.value : inp.value; onChange && onChange(vals); };
      inp.oninput = upd; inp.onchange = upd;
      wrap.append(h('label', { class: 'field' }, fd.label, inp));
    });
    const r = await modal({ title, body: wrap, width, buttons: [{ label: 'Cancel', value: null }, { label: ok, primary: true, value: 'ok' }] });
    return r === 'ok' ? vals : null;
  }
  let toastWrap = null;
  function toast(msg, kind = '', ms = 3200) {
    if (!toastWrap) { toastWrap = h('div', { class: 'toasts' }); document.body.append(toastWrap); }
    const t = h('div', { class: 'toast ' + kind }, msg); toastWrap.append(t);
    setTimeout(() => t.remove(), ms);
  }

  // ---------- Undo / redo history ----------
  class History {
    constructor(limit = 60) { this.stack = []; this.idx = -1; this.limit = limit; this.listeners = []; }
    push(state, label = '') {
      this.stack = this.stack.slice(0, this.idx + 1); this.stack.push({ state, label, at: Date.now() });
      if (this.stack.length > this.limit) this.stack.shift(); this.idx = this.stack.length - 1; this.emit();
    }
    undo() { if (this.idx > 0) { this.idx--; this.emit(); return this.stack[this.idx].state; } return null; }
    redo() { if (this.idx < this.stack.length - 1) { this.idx++; this.emit(); return this.stack[this.idx].state; } return null; }
    jump(i) { if (i >= 0 && i < this.stack.length) { this.idx = i; this.emit(); return this.stack[i].state; } return null; }
    get canUndo() { return this.idx > 0; } get canRedo() { return this.idx < this.stack.length - 1; }
    onChange(fn) { this.listeners.push(fn); } emit() { this.listeners.forEach(f => f(this)); }
    reset(state, label = 'Open') { this.stack = []; this.idx = -1; this.push(state, label); }
  }

  // ---------- File drop helper ----------
  function fileDrop(onFiles, label = 'Drop files to open') {
    const ov = h('div', { class: 'drop-overlay' }, label); document.body.append(ov);
    let n = 0;
    window.addEventListener('dragenter', e => { if (e.dataTransfer.types.includes('Files')) { n++; ov.classList.add('show'); } });
    window.addEventListener('dragleave', () => { if (--n <= 0) { n = 0; ov.classList.remove('show'); } });
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => { e.preventDefault(); n = 0; ov.classList.remove('show'); const fs = [...e.dataTransfer.files]; if (fs.length) onFiles(fs); });
  }

  function queryFile() { return new URLSearchParams(location.search).get('file'); }
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const download = (blob, name) => { const a = h('a', { href: URL.createObjectURL(blob), download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
  const fmtTime = s => { s = Math.max(0, s); const m = Math.floor(s / 60), ss = Math.floor(s % 60), f = Math.floor((s % 1) * 30); return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}:${String(f).padStart(2, '0')}`; };
  async function blobToU8(b) { return new Uint8Array(await b.arrayBuffer()); }

  window.UI = { $, h, icon, titlebar, showDropdown, contextMenu, setDocTitle, shortcut, modal, prompt, confirm, form, toast, History, fileDrop, queryFile, sleep, clamp, download, fmtTime, blobToU8 };
})();
