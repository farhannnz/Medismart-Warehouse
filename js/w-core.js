/* Medismart Warehouse - services.
   Goods come in as LOTS (item + batch + expiry + prices). Every strip in a lot gets its own serial (L<lot>-<n>) and a barcode label.
   Shops send REQUESTS (file); the warehouse picks by SCANNING strips and sends a DISPATCH (file).
   Shops send RETURNS (file); the warehouse reviews them and takes the stock back (or writes it off). */
(function () {
'use strict';
var PD = window.PD, svc = PD.svc;
function D() { return PD.DB; }

PD.RIGHTS = [['items', 'Create & edit items'], ['addstock', 'Add stock (goods received)'], ['stock', 'Stock, shelves & strip lookup'], ['requests', 'Shop requests, scan & dispatch'], ['returns', 'Returns from shops'], ['reports', 'Reports'], ['users', 'Staff, options & backup'], ['attendance', 'Attendance register (see everyone)']];

var ob = PD.blank;
PD.blank = function () {
  var b = ob();
  b.lots = []; b.shops = []; b.wreq = []; b.wdisp = []; b.wret = []; b.attendance = b.attendance || [];
  b.settings.whName = 'Main Warehouse'; b.settings.expiryDays = 120; b.settings.autoPunch = true; b.settings.shiftStart = '09:00'; b.settings.graceMin = 15;
  return b;
};

/* ---------- helpers ---------- */
PD.itemNo = function (id) { var i = D().items.findIndex(function (x) { return x.id === id; }); return i < 0 ? '' : i + 1; };
svc.wLeft = function (lot) { return lot.n - Object.keys(lot.gone).length; };
svc.wStock = function (itemId) { var s = 0; D().lots.forEach(function (l) { if (l.itemId === itemId) s += svc.wLeft(l); }); return s; };
svc.wStockMap = function () { var m = {}; D().lots.forEach(function (l) { m[l.itemId] = (m[l.itemId] || 0) + svc.wLeft(l); }); return m; };
svc.wLotsOf = function (itemId) { return D().lots.filter(function (l) { return l.itemId === itemId && svc.wLeft(l) > 0; }).sort(function (a, b) { return (a.expiry || '9999').localeCompare(b.expiry || '9999'); }); };
svc.wSerial = function (lot, idx) { return 'L' + lot.no + '-' + ('000' + idx).slice(-3); };
svc.wParse = function (text) {
  text = String(text || '').trim(); if (!text) return null;
  var p = text.split('|'); if (p[0] === 'MS1' && p.length >= 2) text = p[1];
  var m = /^L(\d+)-(\d+)$/i.exec(text.trim()); if (!m) return null;
  var lot = D().lots.find(function (l) { return l.no === +m[1]; }); if (!lot) return { serial: text.toUpperCase(), lot: null };
  var idx = +m[2]; if (idx < 1 || idx > lot.n) return { serial: text.toUpperCase(), lot: lot, idx: idx, bad: true };
  return { serial: svc.wSerial(lot, idx), lot: lot, idx: idx };
};
svc.wQR = function (lot, idx) { return svc.wSerial(lot, idx); };   /* the barcode on each strip is just its unique code */
function ensureShop(name) {
  name = String(name || '').trim() || 'Shop';
  var s = D().shops.find(function (x) { return x.name.toLowerCase() === name.toLowerCase(); });
  if (!s) { s = { id: PD.uid('sh'), name: name, code: 'S' + (D().shops.length + 1), active: true }; D().shops.push(s); }
  return s;
}
svc.wShop = function (id) { return D().shops.find(function (s) { return s.id === id; }); };
svc.wShopName = function (id) { var s = svc.wShop(id); return s ? s.name : '—'; };

/* ---------- add stock ---------- */
svc.wAddStock = function (lines, meta) {
  meta = meta || {}; var made = [];
  lines.forEach(function (l) {
    if (!l.itemId || !(PD.num(l.strips) > 0)) return;
    var it = svc.item(l.itemId); if (!it) throw new Error('Choose the medicine on every line');
    if (!it.rack) throw new Error(it.name + ' has no shelf. Open the item (Items - New / Edit Item) and give it a shelf first.');
    if (!l.batchNo || !String(l.batchNo).trim()) throw new Error('Batch number is required for ' + it.name);
    if (!l.expiry) throw new Error('Expiry is required for ' + it.name);
    if (PD.num(l.cost) <= 0) throw new Error('Enter the purchase price for ' + it.name);
    if (PD.num(l.sell) <= 0) throw new Error('Enter the selling price (to the shop) for ' + it.name);
    if (!(PD.num(l.mrp) > 0)) throw new Error('Enter the MRP for ' + it.name);
    if (PD.num(l.strips) !== Math.floor(PD.num(l.strips))) throw new Error('Number of strips must be a whole number (' + it.name + ')');
    var no = svc.nextNo('LOT');
    var lot = { id: PD.uid('lt'), no: no, itemId: l.itemId, batchNo: String(l.batchNo).trim(), expiry: l.expiry, mrp: PD.num(l.mrp), cost: PD.num(l.cost), sell: PD.num(l.sell), n: PD.num(l.strips), gone: {}, date: meta.date || PD.today(), supplier: meta.supplier || '', bill: meta.bill || '', by: PD.user ? PD.user.name : '' };
    D().lots.push(lot); made.push(lot);
  });
  if (!made.length) throw new Error('Add at least one medicine with number of strips');
  PD.log('Stock added', made.length + ' lots, ' + made.reduce(function (a, l) { return a + l.n; }, 0) + ' strips'); PD.save(); return made;
};
function barSvg(text) {
  var n = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(n, text, { format: 'CODE128', width: 1.7, height: 40, displayValue: false, margin: 0 });
  n.removeAttribute('width'); n.removeAttribute('height'); n.setAttribute('preserveAspectRatio', 'none'); return n.outerHTML;
}
svc.wLabelsHTML = function (lots, from, to) {
  var cells = [];
  lots.forEach(function (lot) {
    var it = svc.item(lot.itemId), a = from || 1, b = to || lot.n;
    for (var i = a; i <= b; i++) {
      var code = svc.wSerial(lot, i);
      cells.push('<div class="lb"><b>' + PD.esc(it.name) + '</b><div class="m">Exp ' + PD.esc(PD.fmtExp(lot.expiry)) + ' &bull; Batch ' + PD.esc(lot.batchNo) + ' &bull; MRP ' + PD.n2(lot.mrp) + '</div><div class="bc">' + barSvg(code) + '</div><div class="sr">' + code + '</div></div>');
    }
  });
  return '<style>body{margin:0}.sheet{display:grid;grid-template-columns:repeat(4,48mm);gap:0}.lb{width:48mm;height:26mm;box-sizing:border-box;border:.2mm dashed #bbb;padding:1.6mm 2mm;page-break-inside:avoid;overflow:hidden;font-family:Arial,sans-serif;color:#000}.lb b{display:block;font-size:7.6pt;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lb .m{font-size:6pt;line-height:1.3;white-space:nowrap;overflow:hidden}.bc{height:11mm;margin-top:1mm}.bc svg{width:100%;height:100%;display:block}.sr{font:6.5pt monospace;text-align:center;letter-spacing:.3mm}@page{margin:5mm}</style><div class="sheet">' + cells.join('') + '</div>';
};
svc.wPrintLabels = function (lots, from, to) { PD.printHTML(svc.wLabelsHTML(lots, from, to), 'Strip labels'); };

/* ---------- write-off ---------- */
svc.wWriteOff = function (lotId, reason) {
  var lot = D().lots.find(function (l) { return l.id === lotId; }); if (!lot) throw new Error('Lot not found');
  var n = 0; for (var i = 1; i <= lot.n; i++) if (!lot.gone[i]) { lot.gone[i] = { s: 'bad', ref: 'Write-off', note: reason || 'Expired', d: PD.today() }; n++; }
  PD.log('Write-off', svc.itemName(lot.itemId) + ' lot ' + lot.no + ' ' + n + ' strips (' + (reason || 'Expired') + ')'); PD.save(); return n;
};

/* ---------- requests from shops ---------- */
svc.wResolveLines = function (r) { r.lines.forEach(function (l) { if (!l.itemId) { var it = D().items.find(function (i) { return i.name.toLowerCase() === String(l.name || '').toLowerCase(); }); if (it) l.itemId = it.id; } }); };
svc.wImportRequest = function (f) {
  if (!f || f.type !== 'request' || !Array.isArray(f.lines)) throw new Error('This is not a request file from a shop');
  var shop = ensureShop(f.shop);
  if (D().wreq.some(function (r) { return r.shopId === shop.id && r.extNo === f.no; })) throw new Error('Request ' + f.no + ' from ' + shop.name + ' is already imported');
  var lines = f.lines.map(function (l) {
    var it = D().items.find(function (i) { return i.name.toLowerCase() === String(l.name || '').toLowerCase(); });
    var conv = l.unit === 'purchase' ? ((it && it.conv) || 1) : 1;
    return { name: l.name, itemId: it ? it.id : '', qty: PD.num(l.qty), unit: l.unit === 'purchase' ? 'purchase' : 'sale', qtyS: PD.r2(PD.num(l.qty) * conv) };
  });
  var r = { id: PD.uid('wr'), no: svc.docNo('REQ-', 'WREQ'), extNo: f.no, shopId: shop.id, date: f.date || PD.today(), note: f.note || '', lines: lines, status: 'Pending', picked: [], dispIds: [], got: PD.today() };
  D().wreq.push(r); PD.log('Request imported ' + r.no, shop.name + ' ' + f.no); PD.save(); return r;
};
svc.wRejectRequest = function (id, reason) {
  var r = D().wreq.find(function (x) { return x.id === id; }); if (!r) throw new Error('Request not found');
  if (r.status !== 'Pending' && r.status !== 'Partly dispatched') throw new Error('This request is already ' + r.status.toLowerCase());
  if (!reason || !String(reason).trim()) throw new Error('Give a reason');
  r.status = 'Rejected'; r.note2 = reason; r.picked = []; PD.log('Request rejected', r.no); PD.save();
};
svc.wPickedCount = function (r, itemId) { var c = 0; r.picked.forEach(function (s) { var p = svc.wParse(s); if (p && p.lot && p.lot.itemId === itemId) c++; }); return c; };
svc.wDoneCount = function (r, itemId) { var c = 0; r.dispIds.forEach(function (id) { var d = D().wdisp.find(function (x) { return x.id === id; }); if (d) d.serials.forEach(function (s) { var p = svc.wParse(s); if (p && p.lot && p.lot.itemId === itemId) c++; }); }); return c; };
/* one scan. returns { ok, msg, warn } */
svc.wPickScan = function (reqId, text) {
  var r = D().wreq.find(function (x) { return x.id === reqId; }); if (!r) return { ok: false, msg: 'Open a request first' };
  if (r.status !== 'Pending' && r.status !== 'Partly dispatched') return { ok: false, msg: 'This request is ' + r.status };
  svc.wResolveLines(r);
  var p = svc.wParse(text); if (!p) return { ok: false, msg: 'Not a Medismart strip code: ' + String(text).slice(0, 40) };
  if (!p.lot || p.bad) return { ok: false, msg: 'Unknown strip ' + p.serial + ' (not in this warehouse)' };
  var g = p.lot.gone[p.idx]; if (g) return { ok: false, msg: p.serial + ' is not in stock (' + (g.s === 'out' ? 'already sent to ' + (g.shop || 'a shop') + ' on ' + g.ref : g.s === 'bad' ? 'written off' : g.s) + ')' };
  if (r.picked.indexOf(p.serial) >= 0) return { ok: false, msg: p.serial + ' is already scanned for this request' };
  var line = r.lines.filter(function (l) { return l.itemId === p.lot.itemId; });
  if (!line.length) return { ok: false, msg: svc.itemName(p.lot.itemId) + ' was not asked for in this request' };
  var want = line.reduce(function (a, l) { return a + l.qtyS; }, 0), have = svc.wPickedCount(r, p.lot.itemId) + svc.wDoneCount(r, p.lot.itemId);
  if (have >= want) return { ok: false, msg: 'Already have all ' + want + ' strips of ' + svc.itemName(p.lot.itemId) + ' for this request' };
  r.picked.push(p.serial);
  var warn = ''; var earlier = svc.wLotsOf(p.lot.itemId).filter(function (l) { return (l.expiry || '9999') < (p.lot.expiry || '9999'); });
  if (earlier.length) warn = 'Note: lot ' + earlier[0].no + ' of ' + svc.itemName(p.lot.itemId) + ' expires earlier (' + PD.fmtExp(earlier[0].expiry) + '). Send that first if you can.';
  PD.save(); return { ok: true, msg: svc.itemName(p.lot.itemId) + ' • ' + p.serial + ' • exp ' + PD.fmtExp(p.lot.expiry) + ' (' + (have + 1) + '/' + want + ')', warn: warn };
};
svc.wPickRemove = function (reqId, serial) { var r = D().wreq.find(function (x) { return x.id === reqId; }); if (!r) return; r.picked = r.picked.filter(function (s) { return s !== serial; }); PD.save(); };
svc.wDispatch = function (reqId, note) {
  var r = D().wreq.find(function (x) { return x.id === reqId; }); if (!r) throw new Error('Request not found');
  if (!r.picked.length) throw new Error('Scan at least one strip first');
  var shop = svc.wShop(r.shopId), by = {}, order = [];
  r.picked.forEach(function (s) { var p = svc.wParse(s); var k = p.lot.id; if (!by[k]) { by[k] = { lot: p.lot, serials: [], idx: [] }; order.push(k); } by[k].serials.push(p.serial); by[k].idx.push(p.idx); });
  var no = svc.docNo('WD-', 'WDISP'), taxable = 0, tax = 0, lines = [];
  order.forEach(function (k) {
    var g = by[k], lot = g.lot, it = svc.item(lot.itemId), amt = PD.r2(g.serials.length * lot.sell);
    taxable += amt; tax += amt * (it.tax || 0) / 100;
    lines.push({ itemId: it.id, lotId: lot.id, batchNo: lot.batchNo, expiry: lot.expiry, mrp: lot.mrp, rate: lot.sell, qty: g.serials.length, tax: it.tax || 0, serials: g.serials });
    g.idx.forEach(function (i) { lot.gone[i] = { s: 'out', ref: no, shop: shop.name, d: PD.today() }; });
  });
  var d = { id: PD.uid('wd'), no: no, reqId: r.id, reqNo: r.no, extNo: r.extNo, shopId: r.shopId, date: PD.today(), by: PD.user ? PD.user.name : '', note: note || '', lines: lines, serials: r.picked.slice(), taxable: PD.r2(taxable), tax: PD.r2(tax), total: PD.r2(taxable + tax), status: 'Sent' };
  D().wdisp.push(d); r.dispIds.push(d.id); r.picked = [];
  svc.wResolveLines(r); var full = r.lines.every(function (l) { return !l.itemId || svc.wDoneCount(r, l.itemId) >= r.lines.filter(function (x) { return x.itemId === l.itemId; }).reduce(function (a, x) { return a + x.qtyS; }, 0); });
  r.status = full ? 'Dispatched' : 'Partly dispatched';
  PD.log('Dispatched ' + no, shop.name + ' ' + PD.n2(d.total)); PD.save(); return d;
};
svc.wDispatchFile = function (d) {
  return { type: 'dispatch', v: 2, warehouse: D().settings.whName, no: d.no, date: d.date, requestNo: d.extNo, by: d.by, note: d.note,
    lines: d.lines.map(function (l, i) { var it = svc.item(l.itemId); return { name: it.name, generic: it.generic, cat: it.cat, schedule: it.schedule, mfr: svc.mfrName(it.mfrId), unit: it.unit, punit: it.punit, conv: it.conv, hsn: it.hsn, tax: l.tax, reqIdx: i, batchNo: l.batchNo, expiry: l.expiry, mrp: l.mrp, rate: l.rate, qty: l.qty, serials: l.serials }; }) };
};
svc.wItemsFile = function () {
  return { type: 'items', warehouse: D().settings.whName, items: D().items.filter(function (i) { return i.active !== false; }).map(function (i) { return { name: i.name, generic: i.generic, cat: i.cat, schedule: i.schedule, mfr: svc.mfrName(i.mfrId), tax: i.tax, mrp: i.mrp, unit: i.unit, punit: i.punit, conv: i.conv, reorder: i.reorder, hsn: i.hsn, division: i.division }; }) };
};

/* ---------- returns from shops ---------- */
svc.wImportReturn = function (f) {
  if (!f || f.type !== 'return' || !Array.isArray(f.lines)) throw new Error('This is not a return file from a shop');
  var shop = ensureShop(f.shop);
  if (D().wret.some(function (r) { return r.shopId === shop.id && r.extNo === f.no; })) throw new Error('Return ' + f.no + ' from ' + shop.name + ' is already imported');
  var lines = f.lines.map(function (l) {
    var it = D().items.find(function (i) { return i.name.toLowerCase() === String(l.name || '').toLowerCase(); });
    return { name: l.name, itemId: it ? it.id : '', batchNo: l.batchNo, expiry: l.expiry, mrp: PD.num(l.mrp), rate: PD.num(l.rate), qty: PD.num(l.qty), reason: l.reason || '', note: l.note || '', serials: l.serials || [], outcome: /expired|damag/i.test(l.reason || '') ? 'bad' : 'stock' };
  });
  var rec = { id: PD.uid('wt'), no: svc.docNo('RET-', 'WRET'), extNo: f.no, shopId: shop.id, date: f.date || PD.today(), note: f.note || '', lines: lines, status: 'Pending', value: PD.r2(lines.reduce(function (a, l) { return a + l.qty * l.rate; }, 0)) };
  D().wret.push(rec); PD.log('Return imported ' + rec.no, shop.name); PD.save(); return rec;
};
svc.wAcceptReturn = function (id, outcomes) {
  var r = D().wret.find(function (x) { return x.id === id; }); if (!r) throw new Error('Return not found');
  if (r.status !== 'Pending') throw new Error('This return is already ' + r.status.toLowerCase());
  var restored = 0, bad = 0;
  r.lines.forEach(function (l, i) {
    var out = (outcomes && outcomes[i]) || l.outcome; l.outcome = out; var left = l.qty;
    var targets = [];
    (l.serials || []).forEach(function (s) { var p = svc.wParse(s); if (p && p.lot && p.lot.gone[p.idx]) targets.push(p); });
    if (!targets.length && l.itemId) {
      D().lots.filter(function (lt) { return lt.itemId === l.itemId && lt.batchNo === l.batchNo && (!l.expiry || lt.expiry === l.expiry); }).forEach(function (lt) { for (var k = 1; k <= lt.n && targets.length < l.qty; k++) if (lt.gone[k] && lt.gone[k].s === 'out' && lt.gone[k].shop === svc.wShopName(r.shopId)) targets.push({ lot: lt, idx: k }); });
    }
    targets.slice(0, l.qty).forEach(function (p) { if (out === 'stock') { delete p.lot.gone[p.idx]; restored++; } else { p.lot.gone[p.idx] = { s: 'bad', ref: r.no, shop: svc.wShopName(r.shopId), note: l.reason || 'Returned', d: PD.today() }; bad++; } });
    if (!targets.length) l.unmatched = true;
  });
  r.status = 'Accepted'; r.doneOn = PD.today(); r.by = PD.user ? PD.user.name : ''; r.restored = restored; r.bad = bad;
  PD.log('Return accepted ' + r.no, restored + ' back to stock, ' + bad + ' written off'); PD.save(); return r;
};
svc.wRejectReturn = function (id, reason) { var r = D().wret.find(function (x) { return x.id === id; }); if (!r) throw new Error('Return not found'); if (r.status !== 'Pending') throw new Error('Already ' + r.status.toLowerCase()); if (!reason || !String(reason).trim()) throw new Error('Give a reason'); r.status = 'Rejected'; r.note2 = reason; PD.log('Return rejected', r.no); PD.save(); };

/* ---------- shelves ---------- */
svc.shelfList = function () { var m = {}; D().items.forEach(function (i) { if (i.rack) m[i.rack] = 1; }); return Object.keys(m).sort(); };
svc.setShelf = function (itemId, shelf) { var it = svc.item(itemId); if (!it) throw new Error('Item not found'); shelf = String(shelf || '').trim(); if (!shelf) throw new Error('Shelf cannot be empty'); it.rack = shelf; PD.log('Shelf set', it.name + ' → ' + shelf); PD.save(); };

/* ---------- attendance (same rules as the shop software) ---------- */
function mins(t) { var p = (t || '0:0').split(':'); return (+p[0]) * 60 + (+p[1]); }
svc.attOf = function (userId, date) { return D().attendance.find(function (a) { return a.userId === userId && a.date === date; }); };
svc.punchIn = function (user) {
  var date = PD.today(), a = svc.attOf(user.id, date); if (a && a.in) return a;
  var t = PD.nowTime(), late = mins(t) > mins(D().settings.shiftStart || '09:00') + (D().settings.graceMin || 0);
  if (!a) { a = { id: PD.uid('at'), userId: user.id, date: date, status: 'P', in: t, out: '', late: late, note: '', by: user.username }; D().attendance.push(a); } else { a.in = t; a.status = 'P'; a.late = late; }
  PD.log('Punch in', user.username + ' ' + t); PD.save(); return a;
};
svc.punchOut = function (user) { var a = svc.attOf(user.id, PD.today()); if (!a || !a.in || a.out) return a; a.out = PD.nowTime(); PD.log('Punch out', user.username + ' ' + a.out); PD.save(); return a; };
svc.attHours = function (a) { if (!a || !a.in || !a.out) return 0; var h = (mins(a.out) - mins(a.in)) / 60; return h > 0 ? PD.r2(h) : 0; };

/* ---------- remove the shop-only demo data that the shared seed creates, add warehouse demo ---------- */
svc.wPrune = function () {
  var d = D();
  ['batches', 'moves', 'sales', 'sreturns', 'purchases', 'preturns', 'pos', 'dnotes', 'holds', 'damage', 'offers', 'openings', 'customers', 'doctors', 'suppliers', 'vouchers', 'requests', 'dispatches', 'whBatches'].forEach(function (k) { if (d[k]) d[k] = []; });
  d.counters = {}; d.demo = true;
  d.shop = { name: 'Main Warehouse (demo)', address: 'Industrial Area, Your City', phone: '', gstin: '', dl: '', footer: '' };
  d.settings.whName = 'Main Warehouse (demo)';
  d.users = d.users.filter(function (u) { return u.username === 'admin'; });
};
svc.wSeed = function () {
  var d = D(); if (d.wSeeded) return; d.wSeeded = true;
  if (!d.demo || !d.items.length) { PD.save(); return; }
  if (!d.users.some(function (u) { return u.username === 'keeper'; })) d.users.push({ id: 'u_k', name: 'Warehouse Keeper', username: 'keeper', pass: PD.hash('keeper'), role: 'Staff', rights: { items: true, addstock: true, stock: true, requests: true, returns: true, reports: true }, active: true });
  var u0 = PD.user; PD.user = { name: 'Admin', username: 'admin' };
  function expIn(m) { var x = new Date(); x.setMonth(x.getMonth() + m); return x.getFullYear() + '-' + ('0' + (x.getMonth() + 1)).slice(-2); }
  var lines = [];
  d.items.forEach(function (it, i) {
    var strips = 40 + (i * 13) % 120, cost = PD.r2(it.mrp * 0.62), sell = PD.r2(it.mrp * 0.72);
    lines.push({ itemId: it.id, batchNo: 'W' + (4100 + i), expiry: expIn(14 + (i % 9)), strips: strips, cost: cost, sell: sell, mrp: it.mrp });
    if (i % 4 === 0) lines.push({ itemId: it.id, batchNo: 'W' + (3100 + i), expiry: expIn(3 + (i % 3)), strips: 12 + i % 10, cost: cost, sell: sell, mrp: it.mrp });
  });
  var exp = { itemId: d.items[5].id, batchNo: 'OLD77', expiry: expIn(-2), strips: 9, cost: PD.r2(d.items[5].mrp * .6), sell: PD.r2(d.items[5].mrp * .7), mrp: d.items[5].mrp };
  lines.push(exp);
  svc.wAddStock(lines, { supplier: 'Demo Pharma Distributors', bill: 'INV-DEMO-1' });
  svc.wImportRequest({ type: 'request', shop: 'Sunrise Pharmacy (demo)', no: 'RQ-000001', date: PD.today(), note: 'Weekly refill', lines: [{ name: d.items[0].name, qty: 2, unit: 'purchase' }, { name: d.items[1].name, qty: 1, unit: 'purchase' }, { name: d.items[2].name, qty: 15, unit: 'sale' }] });
  svc.wImportRequest({ type: 'request', shop: 'City Medico (demo)', no: 'RQ-000007', date: PD.today(), note: 'Urgent', lines: [{ name: d.items[3].name, qty: 1, unit: 'purchase' }, { name: d.items[8].name, qty: 20, unit: 'sale' }] });
  PD.user = u0; PD.save();
};
})();
