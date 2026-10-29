/* Medismart UI helpers */
(function () {
'use strict';
var PD = window.PD, esc = PD.esc, svc = PD.svc;

PD.$ = function (s, r) { return (r || document).querySelector(s); };
PD.$$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
PD.el = function (html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };
PD.on = function (root, ev, sel, fn) {
  root.addEventListener(ev, function (e) { var t = e.target.closest(sel); if (t && root.contains(t)) fn(e, t); });
};

/* ---------- icons (stroke) ---------- */
var IC = {
  dash: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  bill: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  ret: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 11.5a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 7H6"/>',
  order: '<path d="M9 5h10M9 12h10M9 19h10"/><path d="m4 5 1 1 2-2M4 12l1 1 2-2M4 19l1 1 2-2"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  explore: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/><path d="M8 11h6M11 8v6"/>',
  report: '<path d="M4 20V4M4 20h16"/><path d="M8 16V10M12 16V6M16 16v-4"/>',
  book: '<path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 0 2 2h13"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/>', print: '<path d="M7 9V3h10v6"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  download: '<path d="M12 4v11m0 0 4-4m-4 4-4-4M5 20h14"/>', moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>', check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.5v.1"/>',
  pill: '<rect x="2.5" y="8" width="19" height="8" rx="4" transform="rotate(-35 12 12)"/><path d="m9 15 6-6"/>', menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>', rupee: '<path d="M7 5h10M7 9h10M7 5c5 0 7 2 7 4s-2 4-7 4l7 6"/>',
  truck: '<path d="M2 6h11v10H2zM13 10h4l4 3v3h-8"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>', file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17v.1"/>', lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  up: '<path d="m6 15 6-6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>', filter: '<path d="M3 5h18l-7 8v6l-4-2v-4z"/>', logout: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>', cols: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>'
};
PD.icon = function (n, cls) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"' + (cls ? ' class="' + cls + '"' : '') + '>' + (IC[n] || '') + '</svg>'; };

/* ---------- toast / modal ---------- */
PD.toast = function (msg, kind) {
  var box = PD.$('.toasts'); if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
  var t = PD.el('<div class="toast ' + (kind || '') + '">' + esc(msg) + '</div>'); box.appendChild(t);
  setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(function () { t.remove(); }, 300); }, kind === 'err' ? 5200 : 2600);
};
PD.err = function (e) { PD.toast(e && e.message ? e.message : String(e), 'err'); };
PD.modal = function (o) {
  var ov = PD.el('<div class="ov"><div class="md ' + (o.size || '') + '" role="dialog" aria-modal="true"><div class="mh"><h3>' + esc(o.title || '') + '</h3><button class="ibtn" data-x aria-label="Close">' + PD.icon('x') + '</button></div><div class="mb"></div><div class="mf"></div></div></div>');
  var mb = PD.$('.mb', ov), mf = PD.$('.mf', ov);
  if (typeof o.body === 'string') mb.innerHTML = o.body; else if (o.body) mb.appendChild(o.body);
  var api = { el: ov, body: mb, close: function () { ov.remove(); document.removeEventListener('keydown', esck); if (o.onClose) o.onClose(); } };
  (o.foot || []).forEach(function (b) {
    var btn = PD.el('<button class="btn ' + (b.cls || '') + '">' + (b.icon ? PD.icon(b.icon) : '') + esc(b.label) + '</button>');
    btn.onclick = function () { if (b.fn) { var r = b.fn(api, btn); if (r !== false && b.close !== false && !b.keep) api.close(); } else api.close(); };
    mf.appendChild(btn);
  });
  if (!(o.foot || []).length) mf.remove();
  ov.addEventListener('mousedown', function (e) { if (e.target === ov && !o.sticky) api.close(); });
  PD.$('[data-x]', ov).onclick = api.close;
  function esck(e) { if (e.key === 'Escape' && !o.sticky) { var all = PD.$$('.ov'); if (all[all.length - 1] === ov) api.close(); } }
  document.addEventListener('keydown', esck);
  document.body.appendChild(ov);
  var f = PD.$('input:not([type=hidden]),select,textarea', mb); if (f && !o.noFocus) setTimeout(function () { f.focus(); }, 30);
  return api;
};
PD.confirm = function (msg, okLabel, danger) {
  return new Promise(function (res) {
    var done = false;
    PD.modal({ title: 'Please confirm', size: 'sm', body: '<p>' + msg + '</p>', onClose: function () { if (!done) res(false); }, foot: [
      { label: 'Cancel', fn: function () { done = true; res(false); } },
      { label: okLabel || 'Yes, continue', cls: danger ? 'd' : 'p', fn: function () { done = true; res(true); } }
    ] });
  });
};
PD.prompt = function (title, label, val) {
  return new Promise(function (res) {
    var done = false, m = PD.modal({ title: title, size: 'sm', body: '<div class="fld"><label>' + esc(label) + '</label><input class="in" id="pd-pr" value="' + esc(val || '') + '"></div>', onClose: function () { if (!done) res(null); }, foot: [
      { label: 'Cancel', fn: function () { done = true; res(null); } },
      { label: 'OK', cls: 'p', fn: function (api) { done = true; res(PD.$('#pd-pr', api.el).value); } }
    ] });
    PD.$('#pd-pr', m.el).addEventListener('keydown', function (e) { if (e.key === 'Enter') { done = true; res(this.value); m.close(); } });
  });
};

/* ---------- forms ---------- */
function opts(f) { var o = typeof f.options === 'function' ? f.options() : (f.options || []); return o.map(function (x) { return Array.isArray(x) ? x : [x, x]; }); }
PD.field = function (f, v) {
  var id = 'f_' + f.k, val = v == null ? (f.def != null ? f.def : '') : v, a = ' data-k="' + f.k + '"' + (f.req ? ' required' : '') + (f.readonly ? ' readonly' : '') + (f.ph ? ' placeholder="' + esc(f.ph) + '"' : '');
  var h;
  if (f.type === 'select') h = '<select class="in" id="' + id + '"' + a + '>' + opts(f).map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>';
  else if (f.type === 'textarea') h = '<textarea class="in" rows="' + (f.rows || 3) + '" id="' + id + '"' + a + '>' + esc(val) + '</textarea>';
  else if (f.type === 'checkbox') return '<div class="fld ' + (f.full ? 'full' : '') + '"><label class="chk"><input type="checkbox" id="' + id + '"' + a + (val ? ' checked' : '') + '> ' + esc(f.label) + '</label></div>';
  else h = '<input class="in" id="' + id + '" type="' + (f.type === 'month' ? 'month' : (f.type || 'text')) + '"' + a + (f.step ? ' step="' + f.step + '"' : (f.type === 'number' ? ' step="any"' : '')) + (f.min != null ? ' min="' + f.min + '"' : '') + ' value="' + esc(val) + '">';
  return '<div class="fld ' + (f.full ? 'full' : '') + '"><label for="' + id + '">' + esc(f.label) + (f.req ? ' <span class="req">*</span>' : '') + '</label>' + h + (f.hint ? '<div class="hint">' + esc(f.hint) + '</div>' : '') + '</div>';
};
PD.formHTML = function (fields, vals, cls) { vals = vals || {}; return '<div class="form ' + (cls || '') + '">' + fields.map(function (f) { return PD.field(f, vals[f.k]); }).join('') + '</div>'; };
PD.readForm = function (root, fields) {
  var out = {}, bad = [];
  fields.forEach(function (f) {
    var el = PD.$('[data-k="' + f.k + '"]', root); if (!el) return;
    var v = f.type === 'checkbox' ? el.checked : el.value;
    if (f.type === 'number') v = v === '' ? '' : PD.num(v);
    if (typeof v === 'string' && f.type !== 'textarea') v = v.trim();
    if (f.req && (v === '' || v == null)) { bad.push(f.label); el.classList.add('bad'); } else el.classList.remove('bad');
    out[f.k] = v;
  });
  if (bad.length) throw new Error('Please fill: ' + bad.join(', '));
  return out;
};

/* ---------- autocomplete ---------- */
PD.combo = function (inp, o) {
  var dd = null, idx = 0, list = [];
  function close() { if (dd) { dd.remove(); dd = null; } }
  function render() {
    list = o.source(inp.value).slice(0, o.max || 40);
    if (!list.length) {
      if (o.emptyMsg && inp.value.trim()) {
        if (!dd) { dd = document.createElement('div'); dd.className = 'dd'; dd.style.position = 'fixed'; document.body.appendChild(dd); }
        var r0 = inp.getBoundingClientRect(); dd.style.left = r0.left + 'px'; dd.style.top = (r0.bottom + 4) + 'px';
        dd.innerHTML = '<div style="cursor:default;color:var(--mut)">' + o.emptyMsg + '</div>';
      } else close();
      return;
    }
    if (!dd) { dd = document.createElement('div'); dd.className = 'dd'; dd.style.position = 'fixed'; document.body.appendChild(dd); }
    var r = inp.getBoundingClientRect(); dd.style.left = r.left + 'px'; dd.style.top = (r.bottom + 4) + 'px'; dd.style.minWidth = Math.max(r.width, 300) + 'px';
    dd.innerHTML = list.map(function (x, i) { return '<div data-i="' + i + '" class="' + (i === idx ? 'on' : '') + '"><span>' + x.label + (x.sub ? '<br><small>' + x.sub + '</small>' : '') + '</span><small>' + (x.right || '') + '</small></div>'; }).join('');
    var on = PD.$('.on', dd); if (on) on.scrollIntoView({ block: 'nearest' });
  }
  function pick(x) { close(); o.onPick(x); }
  inp.addEventListener('input', function () { idx = 0; render(); });
  inp.addEventListener('focus', function () { if (o.openOnFocus !== false) { idx = 0; render(); } });
  inp.addEventListener('keydown', function (e) {
    if (!dd) { if (e.key === 'ArrowDown') { render(); e.preventDefault(); } return; }
    if (e.key === 'ArrowDown') { idx = Math.min(idx + 1, list.length - 1); render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { idx = Math.max(idx - 1, 0); render(); e.preventDefault(); }
    else if (e.key === 'Enter') { if (list[idx]) { e.preventDefault(); e.stopPropagation(); pick(list[idx]); } }
    else if (e.key === 'Escape') { close(); e.stopPropagation(); }
  });
  function md(e) {
    if (!document.body.contains(inp)) { close(); document.removeEventListener('mousedown', md); return; }
    if (dd && e.target.closest('.dd') === dd) { var d = e.target.closest('[data-i]'); if (d) { e.preventDefault(); pick(list[+d.dataset.i]); } }
    else if (e.target !== inp) close();
  }
  document.addEventListener('mousedown', md);
  return { close: close, refresh: render };
};

/* ---------- print / export ---------- */
PD.printHTML = function (html, title, width) {
  var f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.appendChild(f);
  var d = f.contentWindow.document; d.open();
  d.write('<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title || 'Print') + '</title><style>body{font:12px/1.4 Arial,sans-serif;margin:' + (width ? '4mm' : '14mm') + ';color:#000;' + (width ? 'width:' + width + ';' : '') + '}h1,h2,h3{margin:0 0 4px}table{width:100%;border-collapse:collapse}th,td{padding:4px 6px;border-bottom:1px solid #ccc;text-align:left}th{background:#f2f2f2}.r{text-align:right}.c{text-align:center}hr{border:0;border-top:1px dashed #000;margin:6px 0}.b{font-weight:700}@page{margin:6mm}</style></head><body>' + html + '</body></html>');
  d.close();
  setTimeout(function () { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(function () { f.remove(); }, 2000); }, 250);
};
PD.csv = function (cols, rows, name) {
  var q = function (v) { v = v == null ? '' : String(v).replace(/<[^>]+>/g, ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  var out = [cols.map(function (c) { return q(c.label); }).join(',')].concat(rows.map(function (r) { return cols.map(function (c) { return q(c.raw ? c.raw(r) : r[c.k]); }).join(','); })).join('\n');
  var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + out], { type: 'text/csv' })); a.download = (name || 'report') + '.csv'; document.body.appendChild(a); a.click(); a.remove();
};
PD.download = function (name, text, type) {
  var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
};

/* ---------- interactive report table ---------- */
PD.report = function (host, spec) {
  var S = PD.DB.settings, pref = (S.colsPref[spec.id] = S.colsPref[spec.id] || {}), state = { f: {}, q: '', cf: {}, sort: null, dir: 1, showCF: false, data: null };
  (spec.filters || []).forEach(function (f) { state.f[f.k] = typeof f.val === 'function' ? f.val() : (f.val == null ? '' : f.val); });
  host.innerHTML = '<div class="card"><div class="hd no-print"><h3 style="padding:0;border:0">' + esc(spec.title) + '</h3><span class="sp"></span><div class="row" id="r-act"></div></div>' +
    '<div class="bd no-print row" id="r-flt"></div><div class="tw"><table class="t"><thead></thead><tbody></tbody><tfoot></tfoot></table></div><div class="hint" id="r-note" style="padding:8px 18px"></div></div>';
  var flt = PD.$('#r-flt', host), act = PD.$('#r-act', host);
  flt.innerHTML = (spec.filters || []).map(function (f) {
    return '<div class="fld" style="min-width:' + (f.w || 130) + 'px"><label>' + esc(f.label) + '</label>' + (f.type === 'select' ? '<select class="in sm" data-f="' + f.k + '">' + opts(f).map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(state.f[f.k]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>' : '<input class="in sm" data-f="' + f.k + '" type="' + (f.type || 'text') + '" value="' + esc(state.f[f.k]) + '">') + '</div>';
  }).join('') + '<div class="fld" style="min-width:200px;flex:1"><label>Search anywhere</label><input class="in sm" id="r-q" placeholder="type to filter rows..."></div>';
  act.innerHTML = '<button class="btn sm" data-a="cf">' + PD.icon('filter') + 'Column filters</button><button class="btn sm" data-a="cols">' + PD.icon('cols') + 'Columns</button><button class="btn sm" data-a="csv">' + PD.icon('download') + 'CSV</button><button class="btn sm" data-a="print">' + PD.icon('print') + 'Print / PDF</button>';

  function visibleCols() {
    var all = state.data.cols.slice(), order = pref.order || [], hid = pref.hidden || [];
    all.sort(function (a, b) { var ia = order.indexOf(a.k), ib = order.indexOf(b.k); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || state.data.cols.indexOf(a) - state.data.cols.indexOf(b); });
    return all.filter(function (c) { return hid.indexOf(c.k) < 0; });
  }
  function cell(c, r) { var v = c.fmt ? c.fmt(r[c.k], r) : r[c.k]; return v == null ? '' : v; }
  function plain(c, r) { var v = c.raw ? c.raw(r) : (c.fmt ? c.fmt(r[c.k], r) : r[c.k]); return String(v == null ? '' : v).replace(/<[^>]+>/g, ''); }
  function match(txt, q) {
    q = q.trim(); if (!q) return true; var m = /^([<>]=?)\s*(-?[\d.]+)$/.exec(q);
    if (m) { var n = parseFloat(String(txt).replace(/[^\d.\-]/g, '')); if (!isFinite(n)) return false; var x = parseFloat(m[2]); return m[1] === '>' ? n > x : m[1] === '<' ? n < x : m[1] === '>=' ? n >= x : n <= x; }
    return String(txt).toLowerCase().indexOf(q.toLowerCase()) >= 0;
  }
  function draw() {
    var d = state.data, cols = visibleCols(), rows = d.rows.filter(function (r) {
      if (state.q) { var all = cols.map(function (c) { return plain(c, r); }).join(' | '); if (!state.q.split(/\s+/).every(function (w) { return match(all, w); })) return false; }
      return cols.every(function (c) { return !state.cf[c.k] || match(plain(c, r), state.cf[c.k]); });
    });
    if (state.sort) { var sc = cols.find(function (c) { return c.k === state.sort; }); if (sc) rows.sort(function (a, b) { var x = sc.raw ? sc.raw(a) : a[sc.k], y = sc.raw ? sc.raw(b) : b[sc.k]; if (typeof x === 'number' && typeof y === 'number') return (x - y) * state.dir; return String(x == null ? '' : x).localeCompare(String(y == null ? '' : y), undefined, { numeric: true }) * state.dir; }); }
    PD.$('thead', host).innerHTML = '<tr>' + cols.map(function (c) { return '<th class="sort ' + (c.align === 'r' ? 'r' : '') + '" data-s="' + c.k + '">' + esc(c.label) + (state.sort === c.k ? (state.dir > 0 ? ' ▲' : ' ▼') : '') + '</th>'; }).join('') + '</tr>' +
      (state.showCF ? '<tr>' + cols.map(function (c) { return '<th><input class="in sm" data-cf="' + c.k + '" value="' + esc(state.cf[c.k] || '') + '" placeholder="filter" style="min-width:60px"></th>'; }).join('') + '</tr>' : '');
    PD.$('tbody', host).innerHTML = rows.length ? rows.map(function (r, i) {
      return '<tr class="' + (spec.drill ? 'click ' : '') + (spec.rowClass ? spec.rowClass(r) : '') + '" data-i="' + d.rows.indexOf(r) + '"' + (spec.rowStyle ? ' style="' + spec.rowStyle(r) + '"' : '') + '>' + cols.map(function (c) { return '<td class="' + (c.align === 'r' ? 'r' : c.align === 'c' ? 'c' : '') + '">' + cell(c, r) + '</td>'; }).join('') + '</tr>';
    }).join('') : '<tr><td colspan="' + cols.length + '"><div class="empty">No records found for these filters.</div></td></tr>';
    var sums = cols.some(function (c) { return c.sum; });
    PD.$('tfoot', host).innerHTML = sums && rows.length ? '<tr>' + cols.map(function (c, i) { if (!c.sum) return '<td>' + (i === 0 ? 'Total (' + rows.length + ')' : '') + '</td>'; var t = 0; rows.forEach(function (r) { t += PD.num(c.raw ? c.raw(r) : r[c.k]); }); return '<td class="r">' + (c.fmtSum ? c.fmtSum(t) : PD.n2(t)) + '</td>'; }).join('') + '</tr>' : '';
    PD.$('#r-note', host).textContent = (d.note || '') + (rows.length !== d.rows.length ? '  Showing ' + rows.length + ' of ' + d.rows.length + ' rows.' : '');
    state.shown = rows; state.cols = cols;
  }
  function run() { try { state.data = spec.load(state.f); } catch (e) { PD.err(e); state.data = { cols: [], rows: [] }; } draw(); }
  PD.on(flt, 'input', '[data-f]', function (e, t) { state.f[t.dataset.f] = t.value; run(); });
  PD.on(flt, 'change', '[data-f]', function (e, t) { state.f[t.dataset.f] = t.value; run(); });
  PD.$('#r-q', host).addEventListener('input', function () { state.q = this.value; draw(); });
  PD.on(host, 'click', 'th[data-s]', function (e, t) { var k = t.dataset.s; if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = 1; } draw(); });
  PD.on(host, 'input', '[data-cf]', function (e, t) { state.cf[t.dataset.cf] = t.value; var pos = t.selectionStart, k = t.dataset.cf; draw(); var n = PD.$('[data-cf="' + k + '"]', host); if (n) { n.focus(); n.setSelectionRange(pos, pos); } });
  PD.on(host, 'click', 'tbody tr[data-i]', function (e, t) { if (spec.drill && !e.target.closest('a,button,input')) spec.drill(state.data.rows[+t.dataset.i], run); });
  PD.on(host, 'click', '[data-a]', function (e, t) {
    var a = t.dataset.a;
    if (a === 'cf') { state.showCF = !state.showCF; draw(); }
    else if (a === 'csv') PD.csv(state.cols, state.shown, spec.id);
    else if (a === 'print') {
      var h = '<h2>' + esc(PD.DB.shop.name) + '</h2><h3>' + esc(spec.title) + '</h3><div>' + esc(Object.keys(state.f).map(function (k) { return k + ': ' + state.f[k]; }).join('   ')) + '</div><br><table><thead><tr>' + state.cols.map(function (c) { return '<th class="' + (c.align === 'r' ? 'r' : '') + '">' + esc(c.label) + '</th>'; }).join('') + '</tr></thead><tbody>' + state.shown.map(function (r) { return '<tr>' + state.cols.map(function (c) { return '<td class="' + (c.align === 'r' ? 'r' : '') + '">' + cell(c, r) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody><tfoot>' + PD.$('tfoot', host).innerHTML + '</tfoot></table>';
      PD.printHTML(h, spec.title);
    } else if (a === 'cols') {
      var all = state.data.cols.slice(), order = pref.order && pref.order.length ? pref.order.slice() : all.map(function (c) { return c.k; });
      all.forEach(function (c) { if (order.indexOf(c.k) < 0) order.push(c.k); });
      var hid = (pref.hidden || []).slice();
      function body() { return order.map(function (k, i) { var c = all.find(function (x) { return x.k === k; }); if (!c) return ''; return '<div class="row sp" style="padding:6px 0;border-bottom:1px solid var(--line)"><label class="chk"><input type="checkbox" data-h="' + k + '"' + (hid.indexOf(k) < 0 ? ' checked' : '') + '> ' + esc(c.label) + '</label><span><button class="btn sm" data-m="' + i + '" data-d="-1">' + PD.icon('up') + '</button> <button class="btn sm" data-m="' + i + '" data-d="1">' + PD.icon('down') + '</button></span></div>'; }).join(''); }
      var m = PD.modal({ title: 'Choose and arrange columns', size: 'sm', body: '<div id="cl">' + body() + '</div>', foot: [{ label: 'Reset', fn: function () { pref.order = []; pref.hidden = []; PD.save(); draw(); } }, { label: 'Apply', cls: 'p', fn: function () { pref.order = order; pref.hidden = hid; PD.save(); draw(); } }] });
      PD.on(m.el, 'click', '[data-m]', function (e2, b) { var i = +b.dataset.m, j = i + +b.dataset.d; if (j < 0 || j >= order.length) return; var tmp = order[i]; order[i] = order[j]; order[j] = tmp; PD.$('#cl', m.el).innerHTML = body(); });
      PD.on(m.el, 'change', '[data-h]', function (e2, c) { var k = c.dataset.h, i = hid.indexOf(k); if (c.checked && i >= 0) hid.splice(i, 1); if (!c.checked && i < 0) hid.push(k); });
    }
  });
  run();
  return { reload: run, state: state };
};

/* ---------- generic master CRUD ---------- */
PD.master = function (host, spec) {
  var coll = spec.coll;
  function rows() { return PD.DB[coll].filter(function (r) { return spec.showInactive || r.active !== false; }); }
  var rep = PD.report(host, {
    id: 'm-' + coll, title: spec.title,
    load: function () { return { cols: spec.cols.concat([{ k: '_a', label: '', raw: function () { return ''; }, fmt: function (v, r) { return '<span class="nw"><button class="btn sm g" data-e="' + r.id + '" title="Edit">' + PD.icon('edit') + '</button><button class="btn sm g" data-del="' + r.id + '" title="Delete">' + PD.icon('trash') + '</button></span>'; } }]), rows: rows(), note: spec.note || '' }; },
    drill: function (r) { edit(r); }
  });
  var act = PD.$('#r-act', host); act.insertAdjacentHTML('afterbegin', '<button class="btn p sm" data-new>' + PD.icon('plus') + 'Add new</button>');
  function edit(rec) {
    var isNew = !rec, vals = rec ? JSON.parse(JSON.stringify(rec)) : (spec.defaults ? spec.defaults() : {});
    var m = PD.modal({ title: (isNew ? 'Add ' : 'Edit ') + (spec.single || spec.title), size: spec.size || 'lg', body: PD.formHTML(spec.fields, vals, spec.formCls) + (spec.extraHTML ? spec.extraHTML(vals) : ''), foot: [
      { label: 'Cancel' },
      { label: 'Save', cls: 'p', icon: 'check', fn: function (api) {
        try {
          var v = PD.readForm(api.body, spec.fields), r = Object.assign({}, rec || {}, v);
          if (spec.extraRead) spec.extraRead(api.body, r);
          if (spec.validate) spec.validate(r, isNew);
          if (isNew) r.active = true;
          svc.saveMaster(coll, r); PD.toast('Saved', 'ok'); rep.reload(); if (spec.after) spec.after(r);
        } catch (e) { PD.err(e); return false; }
      } }
    ] });
    if (spec.onOpen) spec.onOpen(m, vals);
  }
  PD.on(host, 'click', '[data-new]', function () { edit(null); });
  PD.on(host, 'click', '[data-e]', function (e, t) { e.stopPropagation(); edit(PD.DB[coll].find(function (x) { return x.id === t.dataset.e; })); });
  PD.on(host, 'click', '[data-del]', function (e, t) {
    e.stopPropagation();
    var r = PD.DB[coll].find(function (x) { return x.id === t.dataset.del; });
    PD.confirm('Delete <b>' + esc(r.name || r.id) + '</b>? If it is already used in transactions it will only be deactivated.', 'Delete', true).then(function (ok) { if (ok) { var res = svc.removeMaster(coll, r.id); PD.toast('Item ' + res, 'ok'); rep.reload(); } });
  });
  return rep;
};

/* ---------- misc ---------- */
PD.schedBadge = function (s) { return s ? '<span class="sched ' + s + '">' + esc(s) + '</span>' : ''; };
PD.catDot = function (cat) { return '<span class="dotc" style="background:' + svc.catColor(cat) + '"></span>'; };
PD.expBadge = function (e) {
  if (!e) return '<span class="badge">NA</span>'; var d = PD.daysToExp(e);
  return d < 0 ? '<span class="badge bad">' + PD.fmtExp(e) + ' • expired</span>' : d <= 30 ? '<span class="badge bad">' + PD.fmtExp(e) + '</span>' : d <= PD.DB.settings.expiryDays ? '<span class="badge warn">' + PD.fmtExp(e) + '</span>' : '<span class="badge ok">' + PD.fmtExp(e) + '</span>';
};
PD.monthStart = function () { return PD.today().slice(0, 8) + '01'; };
PD.itemOptions = function () { return [['', '— select —']].concat(PD.DB.items.filter(function (i) { return i.active !== false; }).map(function (i) { return [i.id, i.name]; })); };
PD.itemSource = function (opts) {
  opts = opts || {};
  return function (q) {
    q = q.trim().toLowerCase(); var stock = svc.stockMap(), out = [];
    PD.DB.items.forEach(function (it) {
      if (it.active === false) return; if (opts.filter && !opts.filter(it)) return;
      var hay = (it.name + ' ' + it.generic + ' ' + it.schedule + ' ' + it.cat + ' ' + svc.mfrName(it.mfrId) + ' ' + it.division).toLowerCase();
      if (q && !q.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; })) return;
      var st = stock[it.id] || 0;
      out.push({ id: it.id, item: it, label: '<b>' + esc(it.name) + '</b> ' + PD.schedBadge(it.schedule), sub: esc(it.generic) + ' • ' + esc(svc.mfrName(it.mfrId)) + (it.rack ? ' • Rack ' + esc(it.rack) : ''), right: (opts.stock === false ? '' : 'Stock ' + PD.qty(st) + '<br>' + PD.money(it.mrp)), st: st });
    });
    out.sort(function (a, b) { return (b.st > 0) - (a.st > 0) || a.item.name.localeCompare(b.item.name); });
    return out;
  };
};
})();
