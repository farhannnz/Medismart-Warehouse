/* Medismart core: data store, persistence, stock + accounting engine */
(function () {
'use strict';
var PD = window.PD = window.PD || {};
PD.views = {};
var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* ---------- small utils ---------- */
PD.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
PD.r2 = function (n) { n = +n || 0; return Math.round(n * 100 + (n < 0 ? -1e-8 : 1e-8)) / 100; };
PD.num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : 0; };
PD.money = function (n) { return '₹' + (+n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
PD.n2 = function (n) { return (+n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
PD.qty = function (n) { return (+n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }); };
PD.today = function () { var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
PD.addDays = function (iso, n) { var d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
PD.fmtDate = function (iso) { if (!iso) return ''; var p = iso.split('-'); return +p[2] + ' ' + MON[+p[1] - 1] + ' ' + p[0]; };
PD.fmtExp = function (e) { if (!e) return '—'; var p = e.split('-'); return MON[+p[1] - 1] + ' ' + p[0]; };
PD.expEnd = function (e) { var p = e.split('-'); return new Date(+p[0], +p[1], 0, 23, 59, 59); };
PD.daysToExp = function (e) { if (!e) return 9999; return Math.floor((PD.expEnd(e) - new Date()) / 864e5); };
PD.uid = function (p) { return (p || 'x') + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); };
PD.nowTime = function () { var d = new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); };
PD.hash = function (s) { var h = 5381, i; s = 'pd|' + s; for (i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h >>> 0); };

/* ---------- persistence (IndexedDB, localStorage fallback) ---------- */
PD.DB = null;
var saveTimer = null;
var DBN = window.PD_DBNAME || 'pharmadesk';
function lsLoad() { try { return JSON.parse(localStorage.getItem(DBN + '_db') || 'null'); } catch (e) { return null; } }
function lsSave() { try { localStorage.setItem(DBN + '_db', JSON.stringify(PD.DB)); } catch (e) {} }
PD.load = function () {
  return new Promise(function (res) {
    try {
      var rq = indexedDB.open(DBN, 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('kv'); };
      rq.onsuccess = function () {
        var g = rq.result.transaction('kv').objectStore('kv').get('db');
        g.onsuccess = function () { res(g.result || lsLoad()); };
        g.onerror = function () { res(lsLoad()); };
      };
      rq.onerror = function () { res(lsLoad()); };
    } catch (e) { res(lsLoad()); }
  });
};
PD.flush = function () {
  try {
    var rq = indexedDB.open(DBN, 1);
    rq.onupgradeneeded = function () { rq.result.createObjectStore('kv'); };
    rq.onsuccess = function () {
      var tx = rq.result.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(PD.DB, 'db');
      tx.oncomplete = function () { rq.result.close(); };
      tx.onerror = lsSave;
    };
    rq.onerror = lsSave;
  } catch (e) { lsSave(); }
};
PD.save = function () { clearTimeout(saveTimer); saveTimer = setTimeout(PD.flush, 300); };
addEventListener('beforeunload', function () { if (PD.DB) PD.flush(); });

/* ---------- blank database ---------- */
PD.RIGHTS = [['dashboard', 'Dashboard'], ['billing', 'Sales billing'], ['salesret', 'Sales returns'], ['purchase', 'Purchase invoices'], ['orders', 'Purchase orders & delivery notes'], ['stock', 'Stock, opening stock & batch edit'], ['expiry', 'Expiry, damage & claims'], ['explore', 'Product explorer'], ['reports', 'Reports'], ['accounts', 'Accounts'], ['masters', 'Masters'], ['settings', 'Settings & backup'], ['users', 'Users & activity log'], ['requests', 'Stock requests & receiving from warehouse'], ['attendance', 'Attendance register (see everyone)']];
PD.CATS = ['Allopathy', 'Ayurvedic', 'Homoeopathy', 'Veterinary', 'Other'];
PD.SCHEDULES = ['', 'G', 'H', 'H1', 'X', 'OTC'];
PD.blank = function () {
  var now = new Date(), sy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  var rights = {}; PD.RIGHTS.forEach(function (r) { rights[r[0]] = true; });
  return {
    v: 1,
    shop: { name: 'My Pharmacy', address: '', phone: '', gstin: '', dl: '', footer: 'Get well soon. Thank you for visiting!' },
    settings: {
      multiSeries: true, showProfit: false, rounding: true, expiryDays: 90, theme: 'light', accent: '#0e9f8e', density: 'cozy',
      defaultTax: 12, series: { Allopathy: 'A', Ayurvedic: 'AY', Homoeopathy: 'H', Veterinary: 'V', Other: 'O' },
      catColors: { Allopathy: '#0f766e', Ayurvedic: '#b45309', Homoeopathy: '#7c3aed', Veterinary: '#be123c', Other: '#475569' },
      scheduleColors: true, colsPref: {}, printWidth: '80mm', allowDirect: false, autoPunch: true, whName: 'Main Warehouse', shiftStart: '09:00', graceMin: 15
    },
    items: [], mfrs: [], suppliers: [], customers: [], doctors: [], batches: [], moves: [], purchases: [], preturns: [], pos: [], dnotes: [],
    sales: [], sreturns: [], holds: [], damage: [], whBatches: [], requests: [], dispatches: [], attendance: [], offers: [], openings: [], accounts: [
      { id: 'cash', name: 'Cash in Hand', group: 'Cash', nat: 'A', sys: 1 }, { id: 'bank', name: 'Bank / UPI / Card', group: 'Bank', nat: 'A', sys: 1 },
      { id: 'sales', name: 'Sales', group: 'Sales', nat: 'I', sys: 1 }, { id: 'purchase', name: 'Purchase', group: 'Purchase', nat: 'E', sys: 1 },
      { id: 'salesret', name: 'Sales Return', group: 'Sales', nat: 'E', sys: 1 }, { id: 'purret', name: 'Purchase Return', group: 'Purchase', nat: 'I', sys: 1 },
      { id: 'intax', name: 'Input GST', group: 'Duties & Taxes', nat: 'A', sys: 1 }, { id: 'outtax', name: 'Output GST', group: 'Duties & Taxes', nat: 'L', sys: 1 },
      { id: 'roundoff', name: 'Round Off', group: 'Indirect Expense', nat: 'E', sys: 1 }, { id: 'openstock', name: 'Opening Stock', group: 'Stock', nat: 'E', sys: 1 },
      { id: 'capital', name: 'Capital Account', group: 'Capital', nat: 'C', sys: 1 }, { id: 'expense', name: 'General Expenses', group: 'Indirect Expense', nat: 'E', sys: 1 },
      { id: 'income', name: 'Other Income', group: 'Indirect Income', nat: 'I', sys: 1 }
    ],
    vouchers: [], users: [{ id: 'u1', name: 'Administrator', username: 'admin', pass: PD.hash('admin'), role: 'Admin', rights: rights, active: true }],
    log: [], years: [{ id: 'y' + sy, label: sy + '-' + String(sy + 1).slice(2), start: sy + '-04-01', end: (sy + 1) + '-03-31', closed: false }],
    openBal: {}, counters: {}
  };
};

/* ---------- audit log ---------- */
PD.log = function (action, ref) {
  var D = PD.DB; if (!D) return;
  D.log.push({ t: new Date().toISOString(), user: PD.user ? PD.user.username : 'system', action: action, ref: ref || '' });
  if (D.log.length > 4000) D.log.splice(0, 500);
};

var svc = PD.svc = {};
function D() { return PD.DB; }

/* ---------- lookups ---------- */
svc.item = function (id) { return D().items.find(function (x) { return x.id === id; }); };
svc.mfr = function (id) { return D().mfrs.find(function (x) { return x.id === id; }); };
svc.supplier = function (id) { return D().suppliers.find(function (x) { return x.id === id; }); };
svc.customer = function (id) { return D().customers.find(function (x) { return x.id === id; }); };
svc.batch = function (id) { return D().batches.find(function (x) { return x.id === id; }); };
svc.mfrName = function (id) { var m = svc.mfr(id); return m ? m.name : ''; };
svc.supName = function (id) { var m = svc.supplier(id); return m ? m.name : ''; };
svc.cusName = function (id) { var m = svc.customer(id); return m ? m.name : 'Walk-in'; };
svc.itemName = function (id) { var m = svc.item(id); return m ? m.name : '(deleted item)'; };
svc.acc = function (id) { return D().accounts.find(function (x) { return x.id === id; }); };
svc.accName = function (id) { var a = svc.acc(id); return a ? a.name : id; };
svc.nextNo = function (key) { var c = D().counters; c[key] = (c[key] || 0) + 1; return c[key]; };
svc.docNo = function (prefix, key) { return prefix + ('000000' + svc.nextNo(key || prefix)).slice(-6); };
svc.catColor = function (cat) { return (D().settings.catColors || {})[cat] || '#475569'; };

/* ---------- financial years ---------- */
svc.yearOf = function (date) {
  var y = D().years.find(function (x) { return date >= x.start && date <= x.end; });
  if (!y) {
    var d = new Date(date + 'T12:00:00'), sy = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
    y = { id: 'y' + sy, label: sy + '-' + String(sy + 1).slice(2), start: sy + '-04-01', end: (sy + 1) + '-03-31', closed: false };
    D().years.push(y); D().years.sort(function (a, b) { return a.start.localeCompare(b.start); });
  }
  return y;
};
svc.currentYear = function () { return svc.yearOf(PD.today()); };

/* ---------- party accounts ---------- */
svc.partyAcc = function (kind, id) {
  var accId = (kind === 'sup' ? 'sup_' : 'cus_') + id, a = svc.acc(accId);
  if (!a) {
    var rec = kind === 'sup' ? svc.supplier(id) : svc.customer(id);
    a = { id: accId, name: rec ? rec.name : accId, group: kind === 'sup' ? 'Sundry Creditors' : 'Sundry Debtors', nat: kind === 'sup' ? 'L' : 'A', party: kind, partyId: id };
    D().accounts.push(a);
  }
  return accId;
};

/* ---------- vouchers (double entry) ---------- */
svc.voucher = function (date, type, narr, lines, src) {
  lines = lines.filter(function (l) { return (+l.dr || 0) || (+l.cr || 0); }).map(function (l) { return { acc: l.acc, dr: PD.r2(l.dr || 0), cr: PD.r2(l.cr || 0) }; });
  var dr = 0, cr = 0; lines.forEach(function (l) { dr += l.dr; cr += l.cr; });
  var diff = PD.r2(dr - cr);
  if (Math.abs(diff) > 0.5) throw new Error('Voucher is not balanced (' + dr + ' vs ' + cr + ')');
  if (diff !== 0) lines.push(diff > 0 ? { acc: 'roundoff', dr: 0, cr: diff } : { acc: 'roundoff', dr: -diff, cr: 0 });
  var yr = svc.yearOf(date);
  if (yr.closed) throw new Error('Financial year ' + yr.label + ' is closed. Re-open it or change the date.');
  var v = { id: PD.uid('v'), no: svc.nextNo('VCH'), date: date, type: type, narr: narr || '', lines: lines, src: src || null, year: yr.id, user: PD.user ? PD.user.username : '' };
  D().vouchers.push(v);
  return v;
};

/* ---------- stock ---------- */
svc.batchesOf = function (itemId, sellable) {
  return D().batches.filter(function (b) {
    return b.itemId === itemId && b.qty > 0 && (!sellable || !b.expiry || PD.daysToExp(b.expiry) >= 0);
  }).sort(function (a, b) { return (a.expiry || '9999').localeCompare(b.expiry || '9999'); });
};
svc.stockOf = function (itemId) { var s = 0; D().batches.forEach(function (b) { if (b.itemId === itemId) s += b.qty; }); return PD.r2(s); };
svc.stockMap = function () { var m = {}; D().batches.forEach(function (b) { m[b.itemId] = (m[b.itemId] || 0) + b.qty; }); return m; };
svc.stockValue = function () { var v = 0; D().batches.forEach(function (b) { v += b.qty * (b.rate || 0); }); return PD.r2(v); };
svc.move = function (m) { m.id = PD.uid('m'); D().moves.push(m); return m; };
svc.lastPurchase = function (itemId, supplierId) {
  var P = D().purchases, i, j, l;
  for (i = P.length - 1; i >= 0; i--) {
    if (supplierId && P[i].supplierId !== supplierId) continue;
    for (j = 0; j < P[i].lines.length; j++) { l = P[i].lines[j]; if (l.itemId === itemId) return { inv: P[i], line: l }; }
  }
  return null;
};
function addBatch(l, extra) {
  var ex = D().batches.find(function (b) { return b.itemId === l.itemId && b.batchNo === l.batchNo && b.expiry === l.expiry && b.mrp === l.mrp; });
  if (ex) {
    var tot = ex.qty + l.qty;
    ex.rate = tot > 0 ? PD.r2((ex.rate * ex.qty + l.rate * l.qty) / tot) : l.rate;
    ex.qty = PD.r2(tot); if (extra) for (var k in extra) ex[k] = extra[k];
    return ex;
  }
  var b = { id: PD.uid('b'), itemId: l.itemId, batchNo: l.batchNo || 'NA', expiry: l.expiry || '', mrp: l.mrp, rate: l.rate, qty: PD.r2(l.qty), supplierId: l.supplierId || '', purId: l.purId || '', added: PD.today() };
  if (extra) for (var k2 in extra) b[k2] = extra[k2];
  D().batches.push(b);
  return b;
}

/* ---------- purchase ---------- */
svc.calcPurchaseLine = function (l) {
  var it = svc.item(l.itemId), conv = (l.unit === 'purchase' && it && it.conv > 0) ? it.conv : 1;
  var gross = PD.num(l.qty) * PD.num(l.rate), dsc = gross * PD.num(l.disc) / 100, taxable = gross - dsc, tax = taxable * PD.num(l.tax) / 100;
  var units = PD.num(l.qty) * conv + PD.num(l.free) * conv;
  return { conv: conv, qtyS: PD.num(l.qty) * conv, freeS: PD.num(l.free) * conv, units: units, taxable: PD.r2(taxable), taxAmt: PD.r2(tax), amount: PD.r2(taxable + tax), costPerUnit: units > 0 ? taxable / units : 0 };
};
svc.postPurchase = function (inv) {
  if (!inv.supplierId) throw new Error('Select a supplier');
  if (!inv.lines || !inv.lines.length) throw new Error('Add at least one item');
  var date = inv.date || PD.today(), id = PD.uid('pi'), no = svc.docNo('PI-', 'PI'), taxable = 0, tax = 0;
  var lines = inv.lines.map(function (l) {
    if (!l.itemId) throw new Error('Select an item on every line');
    if (!(PD.num(l.qty) > 0)) throw new Error('Quantity must be greater than zero (' + svc.itemName(l.itemId) + ')');
    var it = svc.item(l.itemId), c = svc.calcPurchaseLine(l);
    taxable += c.taxable; tax += c.taxAmt;
    var line = { itemId: l.itemId, batchNo: (it.batch === false ? 'NA' : (l.batchNo || 'NA')), expiry: it.batch === false ? '' : (l.expiry || ''), qty: PD.num(l.qty), unit: l.unit || 'sale', free: PD.num(l.free), rate: PD.num(l.rate), mrp: PD.num(l.mrp), disc: PD.num(l.disc), tax: PD.num(l.tax), conv: c.conv, qtyS: c.qtyS, freeS: c.freeS, taxable: c.taxable, taxAmt: c.taxAmt, amount: c.amount, cost: PD.r2(c.costPerUnit) };
    var b = addBatch({ itemId: l.itemId, batchNo: line.batchNo, expiry: line.expiry, mrp: line.mrp, rate: line.cost, qty: c.units, supplierId: inv.supplierId, purId: id });
    line.batchId = b.id;
    svc.move({ date: date, itemId: l.itemId, batchId: b.id, type: 'PUR', qty: c.units, rate: line.cost, ref: no, refId: id });
    return line;
  });
  taxable = PD.r2(taxable); tax = PD.r2(tax);
  var total = PD.r2(taxable + tax), cash = inv.payMode === 'cash';
  var v = svc.voucher(date, 'Purchase', 'Purchase ' + no + (inv.invNo ? ' / Inv ' + inv.invNo : '') + ' from ' + svc.supName(inv.supplierId), [
    { acc: 'purchase', dr: taxable }, { acc: 'intax', dr: tax }, cash ? { acc: 'cash', cr: total } : { acc: svc.partyAcc('sup', inv.supplierId), cr: total }
  ], { kind: 'purchase', id: id });
  var rec = { id: id, no: no, invNo: inv.invNo || '', date: date, dueDate: inv.dueDate || '', supplierId: inv.supplierId, payMode: cash ? 'cash' : 'credit', lines: lines, taxable: taxable, tax: tax, total: total, poId: inv.poId || '', dnId: inv.dnId || '', voucherId: v.id, narr: inv.narr || '', user: PD.user ? PD.user.username : '' };
  D().purchases.push(rec);
  if (inv.poId) { var po = D().pos.find(function (p) { return p.id === inv.poId; }); if (po) { po.status = 'Received'; po.invId = id; } }
  if (inv.dnId) { var dn = D().dnotes.find(function (p) { return p.id === inv.dnId; }); if (dn) { dn.status = 'Invoiced'; dn.invId = id; } }
  PD.log('Purchase invoice ' + no, svc.supName(inv.supplierId) + ' ' + total);
  PD.save();
  return rec;
};
svc.postPurchaseReturn = function (r) {
  var date = r.date || PD.today(), id = PD.uid('pr'), no = svc.docNo('PR-', 'PR'), taxable = 0, tax = 0;
  var lines = r.lines.filter(function (l) { return PD.num(l.qty) > 0; }).map(function (l) {
    var b = svc.batch(l.batchId); if (!b) throw new Error('Batch not found');
    if (b.qty < l.qty) throw new Error('Return qty exceeds stock for ' + svc.itemName(b.itemId) + ' batch ' + b.batchNo);
    var it = svc.item(b.itemId), t = (it && it.tax) || 0, amt = PD.r2(l.qty * b.rate), tx = PD.r2(amt * t / 100);
    taxable += amt; tax += tx; b.qty = PD.r2(b.qty - l.qty);
    svc.move({ date: date, itemId: b.itemId, batchId: b.id, type: 'PRET', qty: -l.qty, rate: b.rate, ref: no, refId: id });
    return { itemId: b.itemId, batchId: b.id, batchNo: b.batchNo, expiry: b.expiry, qty: PD.num(l.qty), rate: b.rate, tax: t, taxable: amt, taxAmt: tx };
  });
  if (!lines.length) throw new Error('Enter a return quantity');
  taxable = PD.r2(taxable); tax = PD.r2(tax);
  var v = svc.voucher(date, 'Purchase Return', 'Purchase return ' + no + ' to ' + svc.supName(r.supplierId), [
    { acc: svc.partyAcc('sup', r.supplierId), dr: taxable + tax }, { acc: 'purret', cr: taxable }, { acc: 'intax', cr: tax }
  ], { kind: 'preturn', id: id });
  var rec = { id: id, no: no, date: date, supplierId: r.supplierId, lines: lines, taxable: taxable, tax: tax, total: PD.r2(taxable + tax), voucherId: v.id, reason: r.reason || '' };
  D().preturns.push(rec); PD.log('Purchase return ' + no, svc.supName(r.supplierId)); PD.save();
  return rec;
};

/* ---------- opening stock ---------- */
svc.addOpening = function (lines, date) {
  date = date || PD.today();
  var total = 0, id = PD.uid('os');
  lines.forEach(function (l) {
    if (!l.itemId || !(PD.num(l.qty) > 0)) return;
    var it = svc.item(l.itemId), rate = PD.num(l.rate) || PD.num(l.mrp) * 0.8;
    var b = addBatch({ itemId: l.itemId, batchNo: it.batch === false ? 'NA' : (l.batchNo || 'NA'), expiry: it.batch === false ? '' : l.expiry, mrp: PD.num(l.mrp), rate: rate, qty: PD.num(l.qty) });
    svc.move({ date: date, itemId: l.itemId, batchId: b.id, type: 'OPEN', qty: PD.num(l.qty), rate: rate, ref: 'Opening stock', refId: id });
    total += PD.num(l.qty) * rate;
  });
  total = PD.r2(total);
  if (total > 0) svc.voucher(date, 'Opening Stock', 'Opening stock entry', [{ acc: 'openstock', dr: total }, { acc: 'capital', cr: total }], { kind: 'opening', id: id });
  D().openings.push({ id: id, date: date, lines: lines.length, total: total });
  PD.log('Opening stock added', String(total)); PD.save();
  return total;
};

/* ---------- sales ---------- */
svc.seriesOf = function (item) {
  var S = D().settings;
  if (!S.multiSeries) return 'S';
  return (S.series && S.series[item ? item.cat : 'Other']) || 'S';
};
svc.calcBill = function (lines, discPct, discAmt) {
  var sum = 0; lines.forEach(function (l) { l._net = PD.num(l.qty) * PD.num(l.rate) * (1 - PD.num(l.disc) / 100); sum += l._net; });
  var bd = PD.num(discPct) > 0 ? sum * PD.num(discPct) / 100 : Math.min(PD.num(discAmt), sum);
  var tax = 0, taxable = 0, total = 0;
  lines.forEach(function (l) {
    var share = sum > 0 ? l._net / sum : 0, net = l._net - bd * share, t = l.tax || 0, tx = net * t / (100 + t);
    l._fin = PD.r2(net); l._tax = PD.r2(tx); l._taxable = PD.r2(net - tx);
    tax += tx; taxable += net - tx; total += net;
  });
  return {
    gross: PD.r2(sum), disc: PD.r2(bd), tax: PD.r2(tax), taxable: PD.r2(taxable), total: PD.r2(total),
    _lines: lines.map(function (l) { return { fin: l._fin, tax: l._tax, taxable: l._taxable }; })
  };
};
svc.postSale = function (bill) {
  if (!bill.lines || !bill.lines.length) throw new Error('Bill is empty');
  var S = D().settings, date = bill.date || PD.today(), groups = {}, order = [];
  bill.lines.forEach(function (l) {
    var it = svc.item(l.itemId), b = svc.batch(l.batchId);
    if (!it || !b) throw new Error('Item or batch missing on a line');
    if (PD.num(l.qty) <= 0) throw new Error('Quantity must be greater than zero (' + it.name + ')');
    var key = svc.seriesOf(it); if (!groups[key]) { groups[key] = []; order.push(key); }
    groups[key].push(l);
  });
  /* stock check across the whole bill first */
  var need = {}; bill.lines.forEach(function (l) { need[l.batchId] = (need[l.batchId] || 0) + PD.num(l.qty); });
  for (var bid in need) { var bb = svc.batch(bid); if (bb.qty + 1e-9 < need[bid]) throw new Error('Only ' + PD.qty(bb.qty) + ' in stock for ' + svc.itemName(bb.itemId) + ' (batch ' + bb.batchNo + ')'); }
  var totalGross = 0; bill.lines.forEach(function (l) { totalGross += PD.num(l.qty) * PD.num(l.rate) * (1 - PD.num(l.disc) / 100); });
  var out = [];
  order.forEach(function (series) {
    var ls = groups[series], g = 0; ls.forEach(function (l) { g += PD.num(l.qty) * PD.num(l.rate) * (1 - PD.num(l.disc) / 100); });
    var share = totalGross > 0 ? g / totalGross : 1;
    var calc = svc.calcBill(ls.map(function (l) { var it = svc.item(l.itemId); return { qty: l.qty, rate: l.rate, disc: l.disc, tax: it.tax || 0, src: l }; }), bill.discPct, PD.num(bill.discAmt) * share);
    var exact = calc.total, grand = S.rounding ? Math.round(exact) : exact, ro = PD.r2(grand - exact);
    var mode = bill.payMode || 'cash', credit = mode === 'credit';
    if (credit && !bill.customerId) throw new Error('Select a customer for credit billing');
    var paid = credit ? Math.min(PD.num(bill.received), grand) : grand, due = PD.r2(grand - paid);
    var id = PD.uid('s'), no = series + '-' + ('000000' + svc.nextNo('S-' + series)).slice(-6), cost = 0;
    var lines = ls.map(function (l, i) {
      var it = svc.item(l.itemId), b = svc.batch(l.batchId), c = calcLine(calc, ls, i);
      b.qty = PD.r2(b.qty - PD.num(l.qty)); cost += PD.num(l.qty) * (b.rate || 0);
      svc.move({ date: date, itemId: l.itemId, batchId: b.id, type: 'SALE', qty: -PD.num(l.qty), rate: l.rate, ref: no, refId: id });
      return { itemId: l.itemId, name: it.name, generic: it.generic, schedule: it.schedule || '', batchId: b.id, batchNo: b.batchNo, expiry: b.expiry, qty: PD.num(l.qty), rate: PD.num(l.rate), disc: PD.num(l.disc), tax: it.tax || 0, amount: c.fin, taxAmt: c.tax, taxable: c.taxable, cost: PD.r2(b.rate || 0) };
    });
    var payAcc = mode === 'cash' ? 'cash' : 'bank';
    var vl = [{ acc: payAcc, dr: paid }, { acc: 'sales', cr: calc.taxable }, { acc: 'outtax', cr: calc.tax }];
    if (due > 0) vl.push({ acc: svc.partyAcc('cus', bill.customerId), dr: due });
    if (ro !== 0) vl.push(ro > 0 ? { acc: 'roundoff', cr: ro } : { acc: 'roundoff', dr: -ro });
    var v = svc.voucher(date, 'Sales', 'Sale ' + no, vl, { kind: 'sale', id: id });
    var rec = { id: id, series: series, no: no, date: date, time: PD.nowTime(), customerId: bill.customerId || '', doctor: bill.doctor || '', payMode: mode, lines: lines, gross: calc.gross, disc: calc.disc, taxable: calc.taxable, tax: calc.tax, roundoff: ro, total: grand, paid: paid, due: due, profit: PD.r2(calc.taxable - cost), voucherId: v.id, user: PD.user ? PD.user.username : '' };
    D().sales.push(rec); out.push(rec);
  });
  if (bill.doctor && bill.doctor.trim()) svc.rememberDoctor(bill.doctor.trim());
  PD.log('Sale ' + out.map(function (b) { return b.no; }).join(', '), String(out.reduce(function (a, b) { return a + b.total; }, 0)));
  PD.save();
  return out;
};
function calcLine(calc, ls, i) { return calc._lines[i]; }
svc.rememberDoctor = function (name) {
  if (!D().doctors.some(function (d) { return d.name.toLowerCase() === name.toLowerCase(); })) D().doctors.push({ id: PD.uid('d'), name: name, regNo: '', phone: '' });
};
svc.postSaleReturn = function (r) {
  var bill = D().sales.find(function (s) { return s.id === r.billId; });
  if (!bill) throw new Error('Bill not found');
  var date = r.date || PD.today(), id = PD.uid('sr'), no = svc.docNo('SR-', 'SR'), taxable = 0, tax = 0, lines = [];
  var sumFin = 0; bill.lines.forEach(function (l) { sumFin += l.amount; });
  var factor = sumFin > 0 ? (bill.total - bill.roundoff) / sumFin : 1;
  (r.lines || []).forEach(function (rl) {
    var l = bill.lines[rl.idx], q = PD.num(rl.qty); if (!l || q <= 0) return;
    var prev = 0; D().sreturns.forEach(function (x) { if (x.billId === bill.id) x.lines.forEach(function (y) { if (y.idx === rl.idx) prev += y.qty; }); });
    if (q + prev > l.qty + 1e-9) throw new Error('Cannot return more than sold for ' + l.name);
    var unit = l.amount / l.qty * factor, amt = PD.r2(unit * q), tx = PD.r2(amt * l.tax / (100 + l.tax));
    taxable += amt - tx; tax += tx;
    var b = svc.batch(l.batchId);
    if (b) b.qty = PD.r2(b.qty + q);
    svc.move({ date: date, itemId: l.itemId, batchId: l.batchId, type: 'SRET', qty: q, rate: l.rate, ref: no, refId: id });
    lines.push({ idx: rl.idx, itemId: l.itemId, name: l.name, batchNo: l.batchNo, qty: q, amount: amt });
  });
  if (!lines.length) throw new Error('Enter a return quantity');
  taxable = PD.r2(taxable); tax = PD.r2(tax);
  var total = PD.r2(taxable + tax), toCustomer = bill.due > 0 && bill.customerId && r.mode !== 'cash';
  var v = svc.voucher(date, 'Sales Return', 'Sales return ' + no + ' against ' + bill.no, [
    { acc: 'salesret', dr: taxable }, { acc: 'outtax', dr: tax }, toCustomer ? { acc: svc.partyAcc('cus', bill.customerId), cr: total } : { acc: bill.payMode === 'cash' || bill.payMode === 'credit' ? 'cash' : 'bank', cr: total }
  ], { kind: 'sreturn', id: id });
  var rec = { id: id, no: no, date: date, billId: bill.id, billNo: bill.no, customerId: bill.customerId, lines: lines, taxable: taxable, tax: tax, total: total, voucherId: v.id, reason: r.reason || '' };
  D().sreturns.push(rec); PD.log('Sales return ' + no, bill.no); PD.save();
  return rec;
};

/* ---------- damage / expiry / claims ---------- */
svc.moveToDamage = function (o) {
  var b = svc.batch(o.batchId), q = PD.num(o.qty); if (!b) throw new Error('Batch not found');
  if (q <= 0 || q > b.qty + 1e-9) throw new Error('Invalid quantity for batch ' + b.batchNo);
  var it = svc.item(b.itemId), date = o.date || PD.today();
  b.qty = PD.r2(b.qty - q);
  var rec = { id: PD.uid('dm'), date: date, itemId: b.itemId, batchId: b.id, batchNo: b.batchNo, expiry: b.expiry, qty: q, rate: b.rate, mrp: b.mrp, supplierId: o.supplierId || b.supplierId || '', purId: b.purId || '', mfrId: it ? it.mfrId : '', reason: o.reason || 'Expired', status: 'Pending', note: o.note || '', amount: PD.r2(q * b.rate) };
  D().damage.push(rec);
  svc.move({ date: date, itemId: b.itemId, batchId: b.id, type: 'DMG', qty: -q, rate: b.rate, ref: rec.reason, refId: rec.id });
  PD.log('Moved to ' + rec.reason + ' stock', svc.itemName(b.itemId) + ' x' + q); PD.save();
  return rec;
};
svc.settleClaim = function (id, outcome, o) {
  var d = D().damage.find(function (x) { return x.id === id; }); if (!d) throw new Error('Claim not found');
  o = o || {}; var date = o.date || PD.today();
  if (outcome === 'credit') {
    var amt = PD.r2(o.amount || d.amount);
    if (!d.supplierId) throw new Error('This entry has no supplier');
    svc.voucher(date, 'Credit Note', 'Claim credit note for ' + svc.itemName(d.itemId), [{ acc: svc.partyAcc('sup', d.supplierId), dr: amt }, { acc: 'purret', cr: amt }], { kind: 'claim', id: d.id });
    d.status = 'Credited'; d.creditAmt = amt;
  } else if (outcome === 'replace') {
    var q = PD.num(o.qty) || d.qty;
    var b = addBatch({ itemId: d.itemId, batchNo: o.batchNo || d.batchNo + '-R', expiry: o.expiry || '', mrp: d.mrp, rate: d.rate, qty: q, supplierId: d.supplierId });
    svc.move({ date: date, itemId: d.itemId, batchId: b.id, type: 'CLAIM', qty: q, rate: d.rate, ref: 'Replacement', refId: d.id });
    d.status = 'Replaced'; d.replacedQty = q;
  } else if (outcome === 'reject') { d.status = 'Rejected'; }
  else if (outcome === 'claimed') { d.status = 'Claimed'; }
  d.settled = date; PD.log('Claim ' + d.status, svc.itemName(d.itemId)); PD.save();
  return d;
};
svc.adjustBatch = function (id, patch, reason) {
  var b = svc.batch(id); if (!b) throw new Error('Batch not found');
  var q = patch.qty != null ? PD.num(patch.qty) : b.qty, diff = PD.r2(q - b.qty);
  ['batchNo', 'expiry'].forEach(function (k) { if (patch[k] != null) b[k] = patch[k]; });
  ['mrp', 'rate'].forEach(function (k) { if (patch[k] != null) b[k] = PD.num(patch[k]); });
  if (diff !== 0) { b.qty = q; svc.move({ date: PD.today(), itemId: b.itemId, batchId: b.id, type: 'ADJ', qty: diff, rate: b.rate, ref: reason || 'Batch edit', refId: b.id }); }
  PD.log('Batch edited', svc.itemName(b.itemId) + ' ' + b.batchNo); PD.save();
};

/* ---------- reports helpers ---------- */
svc.salesQty = function (from, to) {
  var m = {}; D().moves.forEach(function (x) { if (x.type === 'SALE' && x.date >= from && x.date <= to) m[x.itemId] = (m[x.itemId] || 0) - x.qty; });
  return m;
};
svc.suggestPO = function (o) {
  o = o || {}; var mode = o.mode || 'reorder', days = o.days || 30, cover = o.cover || 15, to = PD.today(), from = PD.addDays(to, -days);
  var sold = svc.salesQty(from, to), stock = svc.stockMap(), out = [];
  D().items.forEach(function (it) {
    if (it.active === false) return;
    var st = stock[it.id] || 0, need = 0, s = sold[it.id] || 0;
    if (mode === 'reorder') { if (it.reorder > 0 && st <= it.reorder) need = Math.max(it.reorder * 2 - st, it.reorder); }
    else { need = Math.ceil(s / days * cover) - st; }
    if (need > 0) {
      var lp = svc.lastPurchase(it.id), off = svc.activeOffers(it);
      out.push({ itemId: it.id, stock: st, sold: s, need: need, supplierId: lp ? lp.inv.supplierId : '', lastRate: lp ? lp.line.rate : 0, lastMrp: lp ? lp.line.mrp : it.mrp, offer: off.map(function (x) { return 'Buy ' + x.buyQty + ' get ' + x.freeQty + ' free'; }).join('; ') });
    }
  });
  return out;
};
svc.activeOffers = function (it) {
  var t = PD.today();
  return D().offers.filter(function (o) { return o.from <= t && o.to >= t && ((o.itemId && o.itemId === it.id) || (!o.itemId && o.mfrId && o.mfrId === it.mfrId)); });
};
svc.offerStatus = function () {
  return D().offers.map(function (o) {
    var bought = 0, got = 0;
    D().purchases.forEach(function (p) {
      if (p.date < o.from || p.date > o.to) return;
      p.lines.forEach(function (l) { var it = svc.item(l.itemId); if (!it) return; if ((o.itemId && o.itemId === it.id) || (!o.itemId && o.mfrId === it.mfrId)) { bought += l.qtyS; got += l.freeS; } });
    });
    var entitled = o.buyQty > 0 ? Math.floor(bought / o.buyQty) * o.freeQty : 0;
    return { offer: o, bought: bought, entitled: entitled, received: got, pending: Math.max(0, entitled - got) };
  });
};
svc.itemFlow = function (itemId, from, to) {
  return D().moves.filter(function (m) { return m.itemId === itemId && (!from || m.date >= from) && (!to || m.date <= to); }).sort(function (a, b) { return a.date.localeCompare(b.date); });
};

/* ---------- accounting ---------- */
svc.balances = function (yearId) {
  var out = {}, ob = (D().openBal[yearId] || {});
  D().accounts.forEach(function (a) { out[a.id] = { dr: 0, cr: 0, od: 0, oc: 0 }; });
  for (var k in ob) { if (!out[k]) out[k] = { dr: 0, cr: 0, od: 0, oc: 0 }; if (ob[k] > 0) out[k].od = ob[k]; else out[k].oc = -ob[k]; }
  D().vouchers.forEach(function (v) {
    if (v.year !== yearId) return;
    v.lines.forEach(function (l) { if (!out[l.acc]) out[l.acc] = { dr: 0, cr: 0, od: 0, oc: 0 }; out[l.acc].dr += l.dr; out[l.acc].cr += l.cr; });
  });
  return out;
};
svc.accNet = function (b) { return PD.r2(b.od + b.dr - b.oc - b.cr); };
svc.pnl = function (yearId) {
  var B = svc.balances(yearId), yr = D().years.find(function (y) { return y.id === yearId; });
  function net(id) { return B[id] ? svc.accNet(B[id]) : 0; }
  var sales = -net('sales'), sret = net('salesret'), pur = net('purchase'), pret = -net('purret'), open = net('openstock');
  var closing = yr && yr.closed && yr.closingStock != null ? yr.closingStock : svc.stockValue();
  var gp = PD.r2((sales - sret) + closing - (open + pur - pret));
  var exp = 0, inc = 0, expRows = [], incRows = [];
  D().accounts.forEach(function (a) {
    if (a.group === 'Indirect Expense' || a.group === 'Direct Expense') { var n = net(a.id); if (n) { exp += n; expRows.push([a.name, n]); } }
    if (a.group === 'Indirect Income') { var m = -net(a.id); if (m) { inc += m; incRows.push([a.name, m]); } }
  });
  return { sales: sales, sret: sret, pur: pur, pret: pret, open: open, closing: closing, gp: gp, exp: PD.r2(exp), inc: PD.r2(inc), expRows: expRows, incRows: incRows, net: PD.r2(gp - exp + inc), B: B };
};
svc.balanceSheet = function (yearId) {
  var P = svc.pnl(yearId), B = P.B; function net(id) { return B[id] ? svc.accNet(B[id]) : 0; }
  var assets = [], liabs = [], A = 0, L = 0;
  [['cash', 'Cash in Hand'], ['bank', 'Bank / UPI / Card']].forEach(function (x) { var n = net(x[0]); assets.push([x[1], n]); A += n; });
  var deb = 0, cred = 0;
  D().accounts.forEach(function (a) { if (a.group === 'Sundry Debtors') deb += net(a.id); if (a.group === 'Sundry Creditors') cred += -net(a.id); });
  assets.push(['Sundry Debtors (Receivables)', PD.r2(deb)]); A += deb;
  assets.push(['Input GST', net('intax')]); A += net('intax');
  assets.push(['Closing Stock', P.closing]); A += P.closing;
  liabs.push(['Sundry Creditors (Payables)', PD.r2(cred)]); L += cred;
  liabs.push(['Output GST', -net('outtax')]); L += -net('outtax');
  liabs.push(['Capital Account', -net('capital')]); L += -net('capital');
  liabs.push(['Net Profit for the year', P.net]); L += P.net;
  return { assets: assets, liabs: liabs, A: PD.r2(A), L: PD.r2(L), P: P };
};
svc.closeYear = function (yearId) {
  var yr = D().years.find(function (y) { return y.id === yearId; }); if (!yr) throw new Error('Year not found');
  if (yr.closed) throw new Error('Year is already closed');
  var bs = svc.balanceSheet(yearId), B = bs.P.B, nextStart = PD.addDays(yr.end, 1), ny = svc.yearOf(nextStart), ob = {};
  D().accounts.forEach(function (a) {
    if (a.nat === 'A' || a.nat === 'L') { var n = svc.accNet(B[a.id] || { od: 0, oc: 0, dr: 0, cr: 0 }); if (n) ob[a.id] = n; }
  });
  var cap = svc.accNet(B.capital || { od: 0, oc: 0, dr: 0, cr: 0 }) - bs.P.net; ob.capital = PD.r2(cap);
  ob.openstock = bs.P.closing;
  D().openBal[ny.id] = ob; yr.closed = true; yr.closingStock = bs.P.closing; yr.closedOn = PD.today();
  PD.log('Year closed', yr.label); PD.save();
  return ny;
};
svc.reopenYear = function (yearId) { var yr = D().years.find(function (y) { return y.id === yearId; }); if (yr) { yr.closed = false; PD.log('Year re-opened', yr.label); PD.save(); } };
svc.manualVoucher = function (date, type, narr, lines) { var v = svc.voucher(date, type, narr, lines, { kind: 'manual' }); PD.log('Voucher ' + v.no, type); PD.save(); return v; };

/* ---------- master CRUD helpers ---------- */
svc.saveMaster = function (coll, rec) {
  var arr = D()[coll]; if (!rec.id) { rec.id = PD.uid(coll[0]); arr.push(rec); } else { var i = arr.findIndex(function (x) { return x.id === rec.id; }); if (i >= 0) arr[i] = rec; else arr.push(rec); }
  if (coll === 'suppliers') { var a = svc.acc('sup_' + rec.id); if (a) a.name = rec.name; else svc.partyAcc('sup', rec.id); }
  if (coll === 'customers') { var c = svc.acc('cus_' + rec.id); if (c) c.name = rec.name; else svc.partyAcc('cus', rec.id); }
  PD.log('Saved ' + coll, rec.name || rec.id); PD.save(); return rec;
};
svc.removeMaster = function (coll, id) {
  var used = false, D_ = D();
  if (coll === 'items') used = D_.batches.some(function (b) { return b.itemId === id; }) || D_.moves.some(function (m) { return m.itemId === id; });
  if (coll === 'suppliers') used = D_.purchases.some(function (p) { return p.supplierId === id; });
  if (coll === 'customers') used = D_.sales.some(function (p) { return p.customerId === id; });
  if (coll === 'mfrs') used = D_.items.some(function (p) { return p.mfrId === id; });
  if (coll === 'accounts') {
    var ac = D_.accounts.find(function (x) { return x.id === id; });
    if (ac && (ac.sys || ac.party)) return 'kept (system / party account)';
    used = D_.vouchers.some(function (v) { return v.lines.some(function (l) { return l.acc === id; }); });
  }
  if (used) { var rec = D_[coll].find(function (x) { return x.id === id; }); if (rec) { rec.active = false; PD.save(); } return 'deactivated'; }
  D_[coll] = D_[coll].filter(function (x) { return x.id !== id; }); PD.log('Deleted ' + coll, id); PD.save(); return 'deleted';
};

/* party outstanding */
svc.partyBalance = function (kind, id) {
  var acc = (kind === 'sup' ? 'sup_' : 'cus_') + id, dr = 0, cr = 0;
  D().vouchers.forEach(function (v) { v.lines.forEach(function (l) { if (l.acc === acc) { dr += l.dr; cr += l.cr; } }); });
  /* only the first year's opening balance: later years' openings are carried forward from vouchers already counted above */
  var y0 = D().years.slice().sort(function (a, b) { return a.start.localeCompare(b.start); })[0], n = y0 && D().openBal[y0.id] ? D().openBal[y0.id][acc] : 0;
  if (n) { if (n > 0) dr += n; else cr += -n; }
  return PD.r2(kind === 'sup' ? cr - dr : dr - cr);
};
})();
