/* Stock control & compliance (MargBooks-style): item ledger, schedule H / H1 / X register, re-order planner, hold / ban batches,
   physical stock verification, return to supplier (purchase return with debit note), extra alerts. */
(function () {
'use strict';
var PD = window.PD, esc = PD.esc, svc = PD.svc, $ = PD.$;
function D() { return PD.DB; }
function bold(v) { return '<b>' + esc(v) + '</b>'; }
function amt(k, l) { return { k: k, label: l, align: 'r', sum: true, fmt: function (v) { return v ? PD.n2(v) : ''; } }; }
function yearOpen(date) { var y = svc.yearOf(date); if (y.closed) throw new Error('Financial year ' + y.label + ' is closed. Re-open it under Accounts first.'); }
function activeItems() { return D().items.filter(function (i) { return i.active !== false; }).sort(function (a, b) { return a.name.localeCompare(b.name); }); }
function partyName(id) { var c = svc.customer(id); return c ? c.name : (svc.wShop(id) ? svc.wShopName(id) : 'Cash sale'); }

/* ---------- services ---------- */
/* every event that changed an item's stock: lots received, strips sent / sold / written off / returned to supplier */
svc.wItemEvents = function (itemId) {
  var ev = [];
  D().lots.forEach(function (l) {
    if (l.itemId !== itemId) return;
    ev.push({ d: l.date, t: 'Received', ref: 'Lot ' + l.no + (l.bill ? ' / bill ' + l.bill : ''), p: l.supplier || '', inq: l.n, outq: 0, o: 0 });
    var g = {}; Object.keys(l.gone).forEach(function (i) { var x = l.gone[i], k = (x.ref || '') + '|' + (x.d || l.date) + '|' + x.s; (g[k] = g[k] || { x: x, q: 0 }).q++; });
    Object.keys(g).forEach(function (k) {
      var x = g[k].x, t = x.s === 'out' ? (/^WS-/.test(x.ref || '') ? 'Sold' : 'Sent to shop') : x.s === 'sup' ? 'Returned to supplier' : 'Written off / bad';
      ev.push({ d: x.d || l.date, t: t, ref: x.ref || '', p: x.shop || x.note || '', inq: 0, outq: g[k].q, o: 1 });
    });
  });
  return ev.sort(function (a, b) { return a.d.localeCompare(b.d) || a.o - b.o; });
};
/* return strips to a supplier: o = { supplierId, date, reason, gst, lines: [{ lotId, qty, rate }] } */
svc.wSupReturn = function (o) {
  var date = o.date || PD.today(); yearOpen(date);
  var sup = svc.supplier(o.supplierId); if (!sup) throw new Error('Choose the supplier');
  var no = svc.docNo('PR-', 'WPRET'), lines = [], taxable = 0, tax = 0;
  (o.lines || []).forEach(function (l) {
    var q = Math.floor(PD.num(l.qty)); if (!(q > 0)) return;
    var lot = D().lots.find(function (x) { return x.id === l.lotId; }); if (!lot) throw new Error('A batch is missing');
    var free = []; for (var i = 1; i <= lot.n && free.length < q; i++) if (!lot.gone[i]) free.push(i);
    if (free.length < q) throw new Error('Batch ' + lot.batchNo + ' of ' + svc.itemName(lot.itemId) + ' has only ' + free.length + ' strips');
    var rate = PD.num(l.rate) > 0 ? PD.num(l.rate) : lot.cost, ta = PD.r2(q * rate), tx = o.gst ? PD.r2(ta * PD.num(lot.tax) / 100) : 0;
    free.forEach(function (i) { lot.gone[i] = { s: 'sup', ref: no, shop: sup.name, note: o.reason || 'Returned to supplier', d: date }; });
    taxable += ta; tax += tx; lines.push({ itemId: lot.itemId, lotId: lot.id, batchNo: lot.batchNo, expiry: lot.expiry, qty: q, rate: rate, tax: o.gst ? PD.num(lot.tax) : 0, taxable: ta, taxAmt: tx });
  });
  if (!lines.length) throw new Error('Enter how many strips to return');
  taxable = PD.r2(taxable); tax = PD.r2(tax); var total = PD.r2(taxable + tax);
  var v = svc.voucher(date, 'Purchase Return', 'Return ' + no + ' to ' + sup.name + (o.reason ? ' (' + o.reason + ')' : ''), [{ acc: svc.partyAcc('sup', sup.id), dr: total }, { acc: 'purret', cr: taxable }, { acc: 'intax', cr: tax }], { kind: 'wpret', id: no, no: no });
  var rec = { id: PD.uid('pr'), no: no, date: date, supplierId: sup.id, reason: o.reason || '', lines: lines, taxable: taxable, tax: tax, total: total, vch: v.id, by: PD.user ? PD.user.name : '' };
  (D().wpret = D().wpret || []).push(rec); PD.log('Return to supplier ' + no, sup.name + ' ' + PD.n2(total)); PD.save(); return rec;
};
/* counted strips per medicine; shortages are written off from the earliest-expiry lots */
svc.wPhysical = function (rows, writeOff, note) {
  var date = PD.today(), no = svc.docNo('PHY-', 'PHYS'), short = 0, surplus = 0, val = 0, out = [];
  rows.forEach(function (r) {
    var sys = svc.wStock(r.itemId), diff = r.counted - sys; out.push({ itemId: r.itemId, sys: sys, counted: r.counted, diff: diff });
    if (diff > 0) surplus += diff;
    if (diff < 0) {
      short += -diff;
      if (writeOff) { var need = -diff; svc.wLotsOf(r.itemId).forEach(function (lot) { for (var i = 1; i <= lot.n && need > 0; i++) if (!lot.gone[i]) { lot.gone[i] = { s: 'bad', ref: no, note: 'Physical stock shortage', d: date }; need--; val += lot.cost; } }); }
    }
  });
  var rec = { id: PD.uid('ph'), no: no, date: date, by: PD.user ? PD.user.name : '', note: note || '', rows: out, short: short, surplus: surplus, adjusted: !!writeOff, lost: PD.r2(val) };
  (D().physCounts = D().physCounts || []).push(rec); PD.log('Physical stock ' + no, short + ' short, ' + surplus + ' extra'); PD.save(); return rec;
};
function blocked(lot) { return lot.block ? lot.block + (lot.blockWhy ? ' (' + lot.blockWhy + ')' : '') : ''; }

/* ---------- alerts: over credit limit, cheques due, held / banned batches ---------- */
var oAlerts = PD.alerts;
PD.alerts = function () {
  var out = oAlerts ? oAlerts() : [], can = PD.can || function () { return true; };
  try {
    if (can('accounts') && PD.books) {
      var over = PD.books.ageRows('cus', PD.today()).filter(function (r) { return r.flag === 'Over limit'; });
      if (over.length) out.push({ lvl: 'warn', text: over.length + ' shop(s) / party(s) are over their credit limit', go: ['books', { tab: 'ageing' }], icon: 'rupee' });
      var chq = (D().cheques || []).filter(function (c) { return c.status === 'pending' && c.date <= PD.today(); });
      if (chq.length) out.push({ lvl: 'warn', text: chq.length + ' cheque(s) are due to be deposited / cleared', go: ['books', { tab: 'cheques' }], icon: 'book' });
    }
    if (can('stock')) {
      var bl = D().lots.filter(function (l) { return l.block && svc.wLeft(l) > 0; });
      if (bl.length) out.push({ lvl: 'info', text: bl.length + ' batch(es) in stock are on Hold / Ban and cannot be sent or sold', go: ['wmore', { tab: 'block' }], icon: 'alert' });
    }
  } catch (e) { console.warn('alerts', e); }
  return out;
};

/* ---------- the window ---------- */
function supReturnHTML(r) {
  var s = svc.supplier(r.supplierId) || {};
  return '<h2>' + esc(D().shop.name) + '</h2><h3>Debit note / return ' + esc(r.no) + '</h3><div>' + PD.fmtDate(r.date) + ' • To: <b>' + esc(s.name || '') + '</b>' + (r.reason ? ' • Reason: ' + esc(r.reason) : '') + '</div><br><table><thead><tr><th>#</th><th>Medicine</th><th>Batch</th><th>Exp</th><th class="r">Strips</th><th class="r">Rate</th><th class="r">GST%</th><th class="r">Amount</th></tr></thead><tbody>' +
    r.lines.map(function (l, i) { return '<tr><td>' + (i + 1) + '</td><td>' + esc(svc.itemName(l.itemId)) + '</td><td>' + esc(l.batchNo) + '</td><td>' + PD.fmtExp(l.expiry) + '</td><td class="r">' + l.qty + '</td><td class="r">' + PD.n2(l.rate) + '</td><td class="r">' + l.tax + '</td><td class="r">' + PD.n2(l.taxable) + '</td></tr>'; }).join('') +
    '</tbody><tfoot><tr><td colspan="7" class="r">Taxable ' + PD.n2(r.taxable) + ' + GST ' + PD.n2(r.tax) + ' = <b>Total</b></td><td class="r b">' + PD.n2(r.total) + '</td></tr></tfoot></table>';
}

PD.views.wmore = { render: function (host, arg) {
  var tab = (arg && arg.tab) || 'ledger';
  var TABS = [['ledger', 'Item ledger'], ['sched', 'Schedule H / H1 / X register'], ['reorder', 'Re-order planner'], ['block', 'Hold / Ban batches'], ['physical', 'Physical stock'], ['supret', 'Return to supplier']];
  host.innerHTML = '<div class="tabs" id="mt" style="margin-bottom:14px;flex-wrap:wrap">' + TABS.map(function (t) { return '<button data-t="' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div><div id="mc"></div>';
  var mc = $('#mc', host);
  function show(t) { tab = t; PD.$$('#mt button', host).forEach(function (b) { b.classList.toggle('on', b.dataset.t === t); }); mc.innerHTML = ''; var pane = document.createElement('div'); mc.appendChild(pane); ({ ledger: ledger, sched: sched, reorder: reorder, block: block, physical: physical, supret: supret })[t](pane); }
  PD.on($('#mt', host), 'click', 'button', function (e, b) { show(b.dataset.t); });

  /* ----- item ledger ----- */
  function ledger(el) {
    PD.report(el, { id: 'itemledger', title: 'Item ledger (stock card)', filters: [{ k: 'item', label: 'Medicine', type: 'select', w: 280, options: function () { return [['', '— select a medicine —']].concat(activeItems().map(function (i) { return [i.id, i.name]; })); }, val: (arg && arg.item) || '' }, { k: 'from', label: 'From', type: 'date', val: function () { return svc.currentYear().start; } }, { k: 'to', label: 'To', type: 'date', val: PD.today }],
      load: function (f) {
        if (!f.item) return { cols: [{ k: 'x', label: 'Pick a medicine above' }], rows: [] };
        var bal = 0, rows = [], pre = 0;
        svc.wItemEvents(f.item).forEach(function (e) { if (e.d < f.from) pre += e.inq - e.outq; });
        bal = pre; rows.push({ date: f.from, t: 'Opening', ref: '', p: '', inq: pre > 0 ? pre : 0, outq: 0, bal: pre });
        svc.wItemEvents(f.item).forEach(function (e) { if (e.d < f.from || e.d > f.to) return; bal += e.inq - e.outq; rows.push({ date: e.d, t: e.t, ref: e.ref, p: e.p, inq: e.inq, outq: e.outq, bal: bal }); });
        return { cols: [{ k: 'date', label: 'Date', fmt: PD.fmtDate }, { k: 't', label: 'Type', fmt: function (v) { return '<span class="badge ' + (v === 'Received' ? 'ok' : v === 'Opening' ? '' : 'info') + '">' + esc(v) + '</span>'; } }, { k: 'ref', label: 'Reference' }, { k: 'p', label: 'Party / note' }, { k: 'inq', label: 'In (strips)', align: 'r', sum: true, fmt: function (v) { return v || ''; } }, { k: 'outq', label: 'Out (strips)', align: 'r', sum: true, fmt: function (v) { return v || ''; } }, { k: 'bal', label: 'Balance', align: 'r', fmt: function (v) { return '<b>' + v + '</b>'; } }], rows: rows, note: 'Closing ' + bal + ' strips. In the warehouse now: ' + svc.wStock(f.item) + '. Strips taken back from a shop or party show as never sent.' };
      } });
  }

  /* ----- schedule register ----- */
  function sched(el) {
    PD.report(el, { id: 'schedreg', title: 'Schedule drug register (sales to shops and parties)', filters: [{ k: 'sch', label: 'Schedule', type: 'select', options: [['HX', 'H, H1, X'], ['H1', 'H1 only'], ['X', 'X only'], ['H', 'H only'], ['G', 'G only'], ['ALL', 'All medicines']], val: 'HX' }, { k: 'from', label: 'From', type: 'date', val: function () { return PD.addDays(PD.today(), -30); } }, { k: 'to', label: 'To', type: 'date', val: PD.today }],
      load: function (f) {
        var rows = [];
        function ok(it) { var s = String(it.schedule || '').toUpperCase(); return f.sch === 'ALL' ? true : f.sch === 'HX' ? (s === 'H' || s === 'H1' || s === 'X') : s === f.sch; }
        function add(d, no, party, dl, gstin, l) { var it = svc.item(l.itemId); if (!it || !ok(it)) return; rows.push({ date: d, no: no, party: party, dl: dl || '', gstin: gstin || '', item: it.name, sch: it.schedule || '', mfr: svc.mfrName(it.mfrId), batch: l.batchNo, exp: l.expiry, qty: l.qty }); }
        D().wdisp.forEach(function (d) { if (d.date < f.from || d.date > f.to) return; var c = svc.customer(d.shopId) || {}, s = svc.wShop(d.shopId) || {}; d.lines.forEach(function (l) { add(d.date, d.no, svc.wShopName(d.shopId), c.dl || s.dl, c.gstin, l); }); });
        (D().wsales || []).forEach(function (s) { if (s.date < f.from || s.date > f.to) return; var c = svc.customer(s.partyId) || {}; s.lines.forEach(function (l) { add(s.date, s.no, c.name || 'Cash sale', c.dl, c.gstin, l); }); });
        rows.sort(function (a, b) { return a.date.localeCompare(b.date); });
        return { cols: [{ k: 'date', label: 'Date', fmt: PD.fmtDate }, { k: 'no', label: 'Bill' }, { k: 'party', label: 'Sold to', fmt: bold }, { k: 'dl', label: 'Drug licence no.' }, { k: 'item', label: 'Medicine' }, { k: 'sch', label: 'Sch.', fmt: function (v) { return v ? '<span class="badge warn">' + esc(v) + '</span>' : ''; } }, { k: 'mfr', label: 'Manufacturer' }, { k: 'batch', label: 'Batch' }, { k: 'exp', label: 'Expiry', fmt: PD.fmtExp }, { k: 'qty', label: 'Strips', align: 'r', sum: true }], rows: rows, note: 'Enter each party\'s drug licence number under Books & Finance → Outstanding & ageing → click the party.' };
      } });
  }

  /* ----- re-order planner ----- */
  function reorder(el) {
    PD.report(el, { id: 'reorderplan', title: 'Re-order planner (what to buy, from whom)', filters: [{ k: 'days', label: 'Look back (days)', type: 'number', val: 30, w: 110 }, { k: 'cover', label: 'Keep stock for (days)', type: 'number', val: 30, w: 130 }, { k: 'show', label: 'Show', type: 'select', options: [['need', 'Need to buy'], ['all', 'All medicines']], val: 'need' }],
      load: function (f) {
        var days = Math.max(1, PD.num(f.days) || 30), cover = Math.max(1, PD.num(f.cover) || 30), from = PD.addDays(PD.today(), -days), sold = {}, last = {};
        D().lots.forEach(function (l) { Object.keys(l.gone).forEach(function (i) { var x = l.gone[i]; if (x.s === 'out' && x.d >= from) sold[l.itemId] = (sold[l.itemId] || 0) + 1; }); if (!last[l.itemId] || l.no > last[l.itemId].no) last[l.itemId] = l; });
        var sm = svc.wStockMap(), rows = [];
        activeItems().forEach(function (it) {
          var st = sm[it.id] || 0, q = sold[it.id] || 0, avg = q / days, sug = Math.max(0, Math.ceil(avg * cover - st)), lo = it.reorder > 0 && st <= it.reorder;
          if (lo) sug = Math.max(sug, it.reorder * 2 - st); if (f.show === 'need' && !sug) return; if (f.show === 'all' && !st && !q) return;
          var l = last[it.id]; rows.push({ item: it.name, shelf: it.rack || '', sup: l ? (l.supplier || (l.supplierId ? svc.supName(l.supplierId) : '')) : '', cost: l ? l.cost : 0, stock: st, sold: q, avg: PD.r2(avg), left: avg > 0 ? Math.floor(st / avg) : '', lvl: it.reorder || '', sug: sug, val: PD.r2(sug * (l ? l.cost : 0)) });
        });
        rows.sort(function (a, b) { return String(a.sup).localeCompare(String(b.sup)) || a.item.localeCompare(b.item); });
        return { cols: [{ k: 'sup', label: 'Last supplier' }, { k: 'item', label: 'Medicine', fmt: bold }, { k: 'shelf', label: 'Shelf' }, { k: 'stock', label: 'In stock', align: 'r' }, { k: 'sold', label: 'Sent / sold', align: 'r' }, { k: 'avg', label: 'Per day', align: 'r' }, { k: 'left', label: 'Days left', align: 'r' }, { k: 'lvl', label: 'Reorder level', align: 'r' }, { k: 'cost', label: 'Last cost', align: 'r', fmt: PD.n2 }, { k: 'sug', label: 'Suggested buy', align: 'r', sum: true, fmt: function (v) { return v ? '<b>' + v + '</b>' : ''; } }, amt('val', 'Value at cost')], rows: rows, note: 'Suggested buy = strips needed to last the chosen days at the recent selling speed, and never below twice the reorder level. Sort by supplier, then Print / PDF to hand over as the order list.' };
      } });
  }

  /* ----- hold / ban ----- */
  function block(el) {
    PD.report(el, { id: 'blocklots', title: 'Hold / Ban batches (cannot be sent or sold while blocked)', filters: [{ k: 'st', label: 'Show', type: 'select', options: [['', 'All batches in stock'], ['blocked', 'Only Hold / Ban']], val: '' }],
      load: function (f) {
        var rows = D().lots.filter(function (l) { return svc.wLeft(l) > 0 && (f.st !== 'blocked' || l.block); }).sort(function (a, b) { return (b.block ? 1 : 0) - (a.block ? 1 : 0) || (a.expiry || '').localeCompare(b.expiry || ''); }).map(function (l) { return { id: l.id, item: svc.itemName(l.itemId), batch: l.batchNo, exp: l.expiry, left: svc.wLeft(l), st: l.block || '', why: l.blockWhy || '' }; });
        return { cols: [{ k: 'item', label: 'Medicine', fmt: bold }, { k: 'batch', label: 'Batch' }, { k: 'exp', label: 'Expiry', fmt: PD.fmtExp }, { k: 'left', label: 'Strips', align: 'r' }, { k: 'st', label: 'Status', fmt: function (v) { return v ? '<span class="badge ' + (v === 'Ban' ? 'bad' : 'warn') + '">' + esc(v) + '</span>' : '<span class="badge ok">OK</span>'; } }, { k: 'why', label: 'Reason' }], rows: rows, note: 'Click a batch to Hold (temporary, e.g. under QC) or Ban (recalled / not to be sold).' };
      },
      drill: function (r, run) {
        var lot = D().lots.find(function (x) { return x.id === r.id; }), f = [{ k: 'block', label: 'Status', type: 'select', options: [['', 'OK (release)'], ['Hold', 'Hold'], ['Ban', 'Ban']] }, { k: 'blockWhy', label: 'Reason', full: true }];
        PD.modal({ title: r.item + ' • batch ' + r.batch, size: 'sm', body: PD.formHTML(f, lot), foot: [{ label: 'Cancel' }, { label: 'Save', cls: 'p', fn: function (api) { var v = PD.readForm(api.body, f); lot.block = v.block; lot.blockWhy = v.block ? v.blockWhy : ''; if (!v.block) { delete lot.block; delete lot.blockWhy; } PD.log('Batch status', r.item + ' ' + r.batch + ' ' + (v.block || 'OK')); PD.save(); PD.toast('Saved'); run(); } }] });
      } });
  }

  /* ----- physical stock ----- */
  function physical(el) {
    var st = { shelf: '', q: '' };
    function draw() {
      var shelves = svc.shelfList(), sm = svc.wStockMap(), words = st.q.toLowerCase().split(/\s+/).filter(Boolean);
      var list = activeItems().filter(function (i) { return (sm[i.id] || 0) > 0 && (!st.shelf || i.rack === st.shelf) && (!words.length || words.every(function (w) { return (i.name + ' ' + (i.generic || '')).toLowerCase().indexOf(w) >= 0; })); }), shown = list.slice(0, 150);
      el.innerHTML = '<div class="card"><div class="hd"><h3 style="padding:0;border:0">Physical stock verification</h3></div><div class="bd row" style="gap:12px;flex-wrap:wrap;align-items:flex-end"><div class="fld"><label>Shelf</label><select class="in sm" id="phs"><option value="">All shelves</option>' + shelves.map(function (s) { return '<option' + (s === st.shelf ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select></div><div class="fld"><label>Search</label><input class="in sm" id="phq" value="' + esc(st.q) + '" placeholder="medicine..."></div><button class="btn p" id="phv">Compare &amp; save count</button></div>' +
        '<div class="hint" style="padding:0 18px 8px">Count the strips on the shelf and type them. Leave the box empty for medicines you did not count. ' + (list.length > shown.length ? 'Showing the first 150 of ' + list.length + '; pick a shelf to narrow.' : '') + '</div><div class="tw"><table class="t"><thead><tr><th>Shelf</th><th>Medicine</th><th class="r">System strips</th><th class="r">Counted</th></tr></thead><tbody>' +
        shown.map(function (i) { return '<tr><td>' + esc(i.rack || '') + '</td><td>' + bold(i.name) + '</td><td class="r">' + sm[i.id] + '</td><td class="r"><input type="number" min="0" class="in sm" style="width:90px;text-align:right" data-c="' + i.id + '" value="' + (counts[i.id] != null ? counts[i.id] : '') + '"></td></tr>'; }).join('') + '</tbody></table></div></div><div id="phh" style="margin-top:12px"></div>';
      $('#phs', el).onchange = function () { st.shelf = this.value; draw(); }; var q = $('#phq', el); q.oninput = function () { st.q = this.value; clearTimeout(q._t); q._t = setTimeout(function () { var p = q.selectionStart; draw(); var n = $('#phq', el); n.focus(); n.setSelectionRange(p, p); }, 300); };
      PD.$$('[data-c]', el).forEach(function (inp) { inp.onchange = function () { if (inp.value === '') delete counts[inp.dataset.c]; else counts[inp.dataset.c] = Math.max(0, Math.floor(PD.num(inp.value))); }; });
      $('#phv', el).onclick = verify; hist();
    }
    var counts = {};
    function verify() {
      var rows = Object.keys(counts).map(function (id) { return { itemId: id, counted: counts[id] }; });
      if (!rows.length) { PD.toast('Type the counted strips first', 'err'); return; }
      var diffs = rows.map(function (r) { return { r: r, sys: svc.wStock(r.itemId), diff: r.counted - svc.wStock(r.itemId) }; }), bad = diffs.filter(function (d) { return d.diff; });
      PD.modal({ title: 'Count result', size: 'lg', body: '<p>' + rows.length + ' medicines counted, <b>' + bad.length + '</b> differ.</p>' + (bad.length ? '<table class="t"><thead><tr><th>Medicine</th><th class="r">System</th><th class="r">Counted</th><th class="r">Difference</th></tr></thead><tbody>' + bad.map(function (d) { return '<tr><td>' + esc(svc.itemName(d.r.itemId)) + '</td><td class="r">' + d.sys + '</td><td class="r">' + d.r.counted + '</td><td class="r"><b style="color:var(--' + (d.diff < 0 ? 'bad' : 'ok') + ')">' + (d.diff > 0 ? '+' : '') + d.diff + '</b></td></tr>'; }).join('') + '</tbody></table><p class="hint">Shortages can be written off now (earliest-expiry strips are removed and the loss shows in the books). Extra strips are only reported: add them through Purchase so they get barcodes.</p>' : '<p>Everything matches.</p>'),
        foot: [{ label: 'Cancel' }, { label: 'Save count only', fn: function () { svc.wPhysical(rows, false); counts = {}; PD.toast('Count saved', 'ok'); setTimeout(draw, 0); } }].concat(bad.some(function (d) { return d.diff < 0; }) ? [{ label: 'Save & write off shortage', cls: 'p', fn: function () { try { svc.wPhysical(rows, true); counts = {}; PD.toast('Count saved, shortage written off', 'ok'); setTimeout(draw, 0); } catch (e) { PD.err(e); return false; } } }] : []) });
    }
    function hist() {
      PD.report($('#phh', el), { id: 'physhist', title: 'Earlier counts', load: function () { return { cols: [{ k: 'date', label: 'Date', fmt: PD.fmtDate }, { k: 'no', label: 'Count', fmt: bold }, { k: 'n', label: 'Medicines', align: 'r' }, { k: 'short', label: 'Short strips', align: 'r', sum: true }, { k: 'surplus', label: 'Extra strips', align: 'r', sum: true }, { k: 'lost', label: 'Written off at cost', align: 'r', sum: true, fmt: PD.n2 }, { k: 'adj', label: 'Written off?', fmt: function (v) { return v ? '<span class="badge warn">yes</span>' : 'no'; } }, { k: 'by', label: 'By' }], rows: (D().physCounts || []).slice().reverse().map(function (c) { return { date: c.date, no: c.no, n: c.rows.length, short: c.short, surplus: c.surplus, lost: c.lost, adj: c.adjusted, by: c.by }; }) }; } });
    }
    draw();
  }

  /* ----- return to supplier ----- */
  function supret(el) {
    var st = { sup: '', date: PD.today(), reason: 'Expired', gst: true, only: 'exp', q: '' };
    function draw() {
      var days = D().settings.expiryDays || 120, words = st.q.toLowerCase().split(/\s+/).filter(Boolean);
      var lots = D().lots.filter(function (l) { return svc.wLeft(l) > 0 && (st.only !== 'exp' || (l.expiry && PD.daysToExp(l.expiry) <= days)) && (!words.length || words.every(function (w) { return (svc.itemName(l.itemId) + ' ' + l.batchNo).toLowerCase().indexOf(w) >= 0; })); }).sort(function (a, b) { return (a.expiry || '').localeCompare(b.expiry || ''); }).slice(0, 150);
      el.innerHTML = '<div class="card"><div class="hd"><h3 style="padding:0;border:0">Return strips to a supplier (expiry / damage claim, debit note)</h3></div><div class="bd row" style="gap:12px;flex-wrap:wrap;align-items:flex-end"><div class="fld" style="min-width:220px"><label>Supplier</label><select class="in sm" id="rs"><option value="">— select —</option>' + D().suppliers.filter(function (s) { return s.active !== false; }).map(function (s) { return '<option value="' + s.id + '"' + (s.id === st.sup ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') + '</select></div><div class="fld"><label>Date</label><input type="date" class="in sm" id="rd" value="' + st.date + '"></div><div class="fld"><label>Reason</label><select class="in sm" id="rr">' + ['Expired', 'Near expiry', 'Damaged', 'Excess', 'Wrong supply', 'Other'].map(function (x) { return '<option' + (x === st.reason ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div><div class="fld"><label>Batches</label><select class="in sm" id="ro"><option value="exp"' + (st.only === 'exp' ? ' selected' : '') + '>Expired / near expiry</option><option value="all"' + (st.only === 'all' ? ' selected' : '') + '>All in stock</option></select></div><div class="fld"><label>Search</label><input class="in sm" id="rq" value="' + esc(st.q) + '"></div><label class="chk" style="margin-bottom:8px"><input type="checkbox" id="rg"' + (st.gst ? ' checked' : '') + '> Include GST</label><button class="btn p" id="rv">Return &amp; make debit note</button></div>' +
        '<div class="tw"><table class="t"><thead><tr><th>Medicine</th><th>Batch</th><th>Expiry</th><th class="r">Strips</th><th class="r">Cost</th><th class="r">GST %</th><th class="r">Return</th><th class="r">Credit rate</th></tr></thead><tbody>' + (lots.length ? lots.map(function (l) { var ex = l.expiry && PD.daysToExp(l.expiry) < 0; return '<tr><td>' + bold(svc.itemName(l.itemId)) + (blocked(l) ? ' <span class="badge warn">' + esc(l.block) + '</span>' : '') + '</td><td>' + esc(l.batchNo) + '</td><td' + (ex ? ' style="color:#c62828"' : '') + '>' + PD.fmtExp(l.expiry) + '</td><td class="r">' + svc.wLeft(l) + '</td><td class="r">' + PD.n2(l.cost) + '</td><td class="r">' + (l.tax || 0) + '</td><td class="r"><input type="number" min="0" max="' + svc.wLeft(l) + '" class="in sm" style="width:70px;text-align:right" data-q="' + l.id + '"></td><td class="r"><input type="number" step="any" class="in sm" style="width:80px;text-align:right" data-r="' + l.id + '" value="' + l.cost + '"></td></tr>'; }).join('') : '<tr><td colspan="8" class="mut" style="padding:14px">No batches match.</td></tr>') + '</tbody></table></div></div><div id="rh" style="margin-top:12px"></div>';
      $('#rs', el).onchange = function () { st.sup = this.value; }; $('#rd', el).onchange = function () { st.date = this.value || PD.today(); }; $('#rr', el).onchange = function () { st.reason = this.value; }; $('#rg', el).onchange = function () { st.gst = this.checked; };
      $('#ro', el).onchange = function () { st.only = this.value; draw(); }; var q = $('#rq', el); q.onchange = function () { st.q = this.value; draw(); };
      $('#rv', el).onclick = function () {
        try {
          var lines = []; PD.$$('[data-q]', el).forEach(function (i) { var n = Math.floor(PD.num(i.value)); if (n > 0) lines.push({ lotId: i.dataset.q, qty: n, rate: PD.num($('[data-r="' + i.dataset.q + '"]', el).value) }); });
          var r = svc.wSupReturn({ supplierId: st.sup, date: st.date, reason: st.reason, gst: st.gst, lines: lines }); PD.toast('Debit note ' + r.no + ' • ' + PD.money(r.total) + ' credited from ' + svc.supName(r.supplierId), 'ok'); PD.printHTML(supReturnHTML(r), 'Debit note ' + r.no); draw();
        } catch (e) { PD.err(e); }
      };
      hist();
    }
    function hist() {
      PD.report($('#rh', el), { id: 'wpret', title: 'Returns to suppliers', load: function () { return { cols: [{ k: 'date', label: 'Date', fmt: PD.fmtDate }, { k: 'no', label: 'Debit note', fmt: bold }, { k: 'sup', label: 'Supplier' }, { k: 'reason', label: 'Reason' }, { k: 'qty', label: 'Strips', align: 'r' }, amt('taxable', 'Taxable'), amt('tax', 'GST'), amt('total', 'Total')], rows: (D().wpret || []).slice().reverse().map(function (r) { return { id: r.id, date: r.date, no: r.no, sup: svc.supName(r.supplierId), reason: r.reason, qty: r.lines.reduce(function (a, l) { return a + l.qty; }, 0), taxable: r.taxable, tax: r.tax, total: r.total }; }), note: 'Click a row to print the debit note again.' }; },
        drill: function (r) { var x = (D().wpret || []).find(function (y) { return y.id === r.id; }); if (x) PD.printHTML(supReturnHTML(x), 'Debit note ' + x.no); } });
    }
    draw();
  }
  show(tab);
} };
})();
