/* Medismart Warehouse - services.
   Goods come in as LOTS (item + batch + expiry + prices). Every strip in a lot gets its own serial (L<lot>-<n>) and a barcode label.
   Shops send REQUESTS (file); the warehouse picks by SCANNING strips and sends a DISPATCH (file).
   Shops send RETURNS (file); the warehouse reviews them and takes the stock back (or writes it off). */
(function () {
'use strict';
var PD = window.PD, svc = PD.svc;
function D() { return PD.DB; }

PD.RIGHTS = [['items', 'Create & edit items'], ['addstock', 'Add stock (goods received)'], ['stock', 'Stock, shelves & strip lookup'], ['requests', 'Shop requests, scan & dispatch'], ['returns', 'Returns from shops'], ['reports', 'Reports'], ['accounts', 'Accounts (vouchers, ledger, P&L, balance sheet)'], ['users', 'Staff, options & backup'], ['attendance', 'Attendance register (see everyone)']];

var ob = PD.blank;
PD.blank = function () {
  var b = ob();
  b.lots = []; b.shops = []; b.wreq = []; b.wdisp = []; b.wret = []; b.wpay = []; b.attendance = b.attendance || [];
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
/* regId = the shop's id on the Shops page (online). Older records are matched by name once and then keep the id. */
function ensureShop(name, regId) {
  name = String(name || '').trim() || 'Shop';
  var s = regId ? D().shops.find(function (x) { return x.regId === regId; }) : null;
  if (!s) s = D().shops.find(function (x) { return (!regId || !x.regId) && x.name.toLowerCase() === name.toLowerCase(); });
  if (!s) { s = { id: PD.uid('sh'), name: name, code: 'S' + (D().shops.length + 1), active: true }; D().shops.push(s); }
  if (regId && !s.regId) s.regId = regId;
  return s;
}
svc.wLinkShops = function (list) {
  var ch = false;
  list.forEach(function (r) {
    var s = D().shops.find(function (x) { return x.regId === r.id; }) || D().shops.find(function (x) { return !x.regId && (x.name.toLowerCase() === String(r.name).toLowerCase() || x.name.toLowerCase() === String(r.oldName || '').toLowerCase()); });
    if (!s) { s = { id: PD.uid('sh'), name: r.name, code: r.code, active: true }; D().shops.push(s); ch = true; }
    if (s.regId !== r.id || s.name !== r.name || s.code !== r.code || s.active !== (r.active !== false)) { s.regId = r.id; s.name = r.name; s.code = r.code; s.active = r.active !== false; ch = true; }
  });
  if (ch) PD.save();
};
svc.wStockValue = function () { var v = 0; D().lots.forEach(function (l) { v += svc.wLeft(l) * (l.cost || 0); }); return PD.r2(v); };
svc.wShop = function (id) { return D().shops.find(function (s) { return s.id === id; }); };
svc.wShopName = function (id) { var s = svc.wShop(id); return s ? s.name : '—'; };

/* ---------- shop accounts: each dispatch is a BILL to the shop at the warehouse's price (no GST).
   Accepted returns (of billed stock) and payments received reduce what the shop owes. ---------- */
svc.wPays = function () { if (!D().wpay) D().wpay = []; return D().wpay; };
svc.wDue = function (shopId) { var l = svc.wLedger(shopId); return l.length ? l[l.length - 1].bal : 0; };
svc.wReceivePay = function (o) {
  var s = svc.wShop(o.shopId); if (!s) throw new Error('Choose the shop');
  var amt = PD.r2(PD.num(o.amount)); if (!(amt > 0)) throw new Error('Enter the amount received');
  var p = { id: PD.uid('wp'), no: svc.docNo('RCPT-', 'WPAY'), shopId: s.id, date: o.date || PD.today(), amount: amt, mode: o.mode || 'Cash', note: String(o.note || '').trim(), by: PD.user ? PD.user.name : '' };
  svc.wPays().push(p); PD.log('Payment received ' + p.no, s.name + ' ' + PD.n2(amt) + ' ' + p.mode); PD.save(); return p;
};
/* the warehouse's own margin on bills to shops, for the Profit & Loss page */
function lotOfLine(l) {
  var p = (l.serials || []).map(svc.wParse).find(function (x) { return x && x.lot; });
  return p ? p.lot : D().lots.find(function (lt) { return lt.itemId === l.itemId && lt.batchNo === l.batchNo; });
}
svc.wMargin = function (from, to) {
  var r = { bills: 0, sales: 0, cost: 0, returns: 0, retCost: 0 };
  D().wdisp.forEach(function (x) { if (!x.bill || x.date < from || x.date > to) return; r.bills++; x.lines.forEach(function (l) { r.sales += l.qty * l.rate; r.cost += l.qty * (l.cost || 0); }); });
  D().wret.forEach(function (x) {
    var d = x.doneOn || x.date; if (x.status !== 'Accepted' || d < from || d > to) return;
    x.lines.forEach(function (l) { if (!l.credit) return; r.returns += l.qty * l.rate; if (l.outcome === 'stock') { var lot = lotOfLine(l); r.retCost += l.qty * (lot ? lot.cost : l.rate); } });
  });
  Object.keys(r).forEach(function (k) { r[k] = PD.r2(r[k]); });
  r.gross = PD.r2(r.sales - r.returns - (r.cost - r.retCost)); return r;
};

/* ---------- company barcodes on the medicine box / strip ----------
   A plain EAN / UPC number identifies the medicine. A GS1 code (2D QR / DataMatrix, or GS1-128) also carries
   the batch (AI 10) and expiry (AI 17), so those fill in by themselves. Each item keeps its codes in item.barcode (comma separated). */
function ymExp(s) { return /^\d{6}$/.test(s) ? '20' + s.slice(0, 2) + '-' + s.slice(2, 4) : ''; }
svc.wCodeKey = function (c) { c = String(c || '').trim(); return /^\d+$/.test(c) ? c.replace(/^0+/, '') : c.toUpperCase(); };
svc.wReadCode = function (text) {
  var raw = String(text || '').replace(/^\][A-Za-z]\d/, '').trim(); if (!raw) return null;
  var out = { raw: raw, code: '', batch: '', expiry: '' }, GS = '\x1d';
  var dl = /\/01\/(\d{14})(?:\/10\/([^/?#]+))?/.exec(raw);   /* GS1 web link: https://.../01/<gtin>/10/<batch>?17=<yymmdd> */
  if (dl) { out.code = dl[1]; out.batch = dl[2] ? decodeURIComponent(dl[2]) : ''; var ex = /[?&]17=(\d{6})/.exec(raw); if (ex) out.expiry = ymExp(ex[1]); return out; }
  var s = raw.replace(/\((\d{2,4})\)/g, GS + '$1').replace(/^\x1d/, '');   /* "(01)...(17)...(10)..." -> GS separated */
  if (/^01\d{14}/.test(s)) {
    var i = 0;
    while (i < s.length) {
      if (s[i] === GS || s[i] === ' ') { i++; continue; }
      var ai = s.substr(i, 2);
      if (ai === '01' || ai === '02') { if (!out.code) out.code = s.substr(i + 2, 14); i += 16; }
      else if (ai === '11' || ai === '13' || ai === '15' || ai === '17') { if (ai === '17') out.expiry = ymExp(s.substr(i + 2, 6)); i += 8; }
      else { var j = s.indexOf(GS, i + 2); if (j < 0) j = s.length; if (ai === '10') out.batch = s.slice(i + 2, j).trim(); i = j; }
    }
    return out;
  }
  out.code = raw; return out;
};
svc.wItemByCode = function (code) {
  var k = svc.wCodeKey(code); if (!k) return null;
  return D().items.find(function (it) { return it.active !== false && String(it.barcode || '').split(/[,\s]+/).some(function (x) { return x && svc.wCodeKey(x) === k; }); }) || null;
};
svc.wLinkCode = function (itemId, code) {
  var it = svc.item(itemId); if (!it) throw new Error('Item not found');
  var other = svc.wItemByCode(code); if (other && other.id !== it.id) throw new Error('This barcode is already linked to ' + other.name);
  if (other) return it;
  it.barcode = (it.barcode ? it.barcode + ', ' : '') + String(code).trim(); PD.log('Barcode linked', it.name + ' ← ' + code); PD.save(); return it;
};


/* ---------- bulk import (item list + opening lots from a prepared file) ---------- */
svc.wImportStock = function (rows) {
  var mf = {}, made = 0, strips = 0;
  D().mfrs.forEach(function (m) { mf[m.name.toLowerCase()] = m; });
  var byName = {}; D().items.forEach(function (i) { byName[i.name.toLowerCase()] = i; });
  rows.forEach(function (r) {
    var name = String(r.name || '').trim(); if (!name) return;
    var m = null, mn = String(r.mfr || '').trim();
    if (mn) { m = mf[mn.toLowerCase()]; if (!m) { m = { id: PD.uid('mf'), name: mn, active: true }; D().mfrs.push(m); mf[mn.toLowerCase()] = m; } }
    var it = byName[name.toLowerCase()];
    if (!it) {
      it = { id: PD.uid('it'), name: name, generic: '', cat: 'Allopathy', schedule: '', mfrId: m ? m.id : '', division: '', rack: r.rack || '', hsn: '', tax: 0, mrp: PD.num(r.mrp), margin: 20, reorder: 10, unit: r.unit || 'Strip', punit: 'Box', conv: PD.num(r.conv) > 0 ? PD.num(r.conv) : 1, batch: true, active: true };
      D().items.push(it); byName[name.toLowerCase()] = it;
    } else if (!it.rack && r.rack) it.rack = r.rack;
    if (PD.num(r.strips) > 0) {
      D().lots.push({ id: PD.uid('lt'), no: svc.nextNo('LOT'), itemId: it.id, batchNo: r.batchNo || 'OPEN', expiry: r.expiry || '2027-12', mrp: PD.num(r.mrp), cost: PD.num(r.cost), sell: PD.num(r.sell) > 0 ? PD.num(r.sell) : PD.num(r.cost), n: Math.floor(PD.num(r.strips)), gone: {}, date: PD.today(), supplier: '', bill: 'IMPORT', by: PD.user ? PD.user.name : '' });
      strips += Math.floor(PD.num(r.strips));
    }
    made++;
  });
  PD.log('Stock imported', made + ' items, ' + strips + ' strips'); PD.save(); return { items: made, strips: strips };
};

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
    if (!(PD.num(l.mrp) > 0)) throw new Error('Enter the MRP for ' + it.name);
    if (PD.num(l.strips) !== Math.floor(PD.num(l.strips))) throw new Error('Number of strips must be a whole number (' + it.name + ')');
    var no = svc.nextNo('LOT');
    var lot = { id: PD.uid('lt'), no: no, itemId: l.itemId, batchNo: String(l.batchNo).trim(), expiry: l.expiry, mrp: PD.num(l.mrp), cost: PD.num(l.cost), sell: PD.num(l.sell) > 0 ? PD.num(l.sell) : PD.num(l.cost), n: PD.num(l.strips), gone: {}, date: meta.date || PD.today(), supplier: meta.supplier || '', bill: meta.bill || '', by: PD.user ? PD.user.name : '' };
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
  var shop = ensureShop(f.shop, f.shopId);
  if (D().wreq.some(function (r) { return r.shopId === shop.id && r.extNo === f.no; })) throw new Error('Request ' + f.no + ' from ' + shop.name + ' is already imported');
  var lines = f.lines.map(function (l) {
    var it = D().items.find(function (i) { return i.name.toLowerCase() === String(l.name || '').toLowerCase(); });
    var per = (it && it.per) || 1, strips = l.unit === 'sale' && l.tabs ? Math.ceil(PD.num(l.qty) / per) : PD.num(l.qty);
    return { name: l.name, itemId: it ? it.id : '', qty: strips, unit: 'purchase', qtyS: strips };
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
/* pick strips without scanning: take the next free strips of a chosen lot */
svc.wPickLot = function (reqId, lotId, qty) {
  var r = D().wreq.find(function (x) { return x.id === reqId; }); if (!r) throw new Error('Open a request first');
  if (r.status !== 'Pending' && r.status !== 'Partly dispatched') throw new Error('This request is ' + r.status);
  var lot = D().lots.find(function (l) { return l.id === lotId; }); if (!lot) throw new Error('Batch not found');
  svc.wResolveLines(r);
  var want = r.lines.filter(function (l) { return l.itemId === lot.itemId; }).reduce(function (a, l) { return a + l.qtyS; }, 0);
  if (!want) throw new Error(svc.itemName(lot.itemId) + ' was not asked for in this request');
  var need = want - svc.wPickedCount(r, lot.itemId) - svc.wDoneCount(r, lot.itemId); qty = Math.floor(PD.num(qty));
  if (!(qty > 0)) throw new Error('Enter how many strips'); if (qty > need) throw new Error('Only ' + need + ' more strips of ' + svc.itemName(lot.itemId) + ' are needed');
  var n = 0;
  for (var i = 1; i <= lot.n && n < qty; i++) { if (lot.gone[i]) continue; var sr = svc.wSerial(lot, i); if (r.picked.indexOf(sr) >= 0) continue; r.picked.push(sr); n++; }
  if (n < qty) throw new Error('Batch ' + lot.batchNo + ' has only ' + n + ' free strips');
  PD.save(); return n;
};
svc.wPickRemove = function (reqId, serial) { var r = D().wreq.find(function (x) { return x.id === reqId; }); if (!r) return; r.picked = r.picked.filter(function (s) { return s !== serial; }); PD.save(); };
svc.wDispatch = function (reqId, note) {
  var r = D().wreq.find(function (x) { return x.id === reqId; }); if (!r) throw new Error('Request not found');
  if (!r.picked.length) throw new Error('Scan at least one strip first');
  var shop = svc.wShop(r.shopId), by = {}, order = [];
  r.picked.forEach(function (s) { var p = svc.wParse(s); var k = p.lot.id; if (!by[k]) { by[k] = { lot: p.lot, serials: [], idx: [] }; order.push(k); } by[k].serials.push(p.serial); by[k].idx.push(p.idx); });
  var no = svc.docNo('WD-', 'WDISP'), taxable = 0, tax = 0, lines = [];
  order.forEach(function (k) {
    var g = by[k], lot = g.lot, it = svc.item(lot.itemId), rate = PD.num(lot.sell) > 0 ? PD.num(lot.sell) : PD.num(lot.cost), amt = PD.r2(g.serials.length * rate);   /* billed to the shop at the warehouse's price to shops, no GST */
    taxable += amt;
    lines.push({ itemId: it.id, lotId: lot.id, batchNo: lot.batchNo, expiry: lot.expiry, mrp: lot.mrp, rate: rate, cost: lot.cost, qty: g.serials.length, tax: it.tax || 0, serials: g.serials });   /* tax = the medicine's GST for the shop's own sales; nothing is charged on this bill */
    g.idx.forEach(function (i) { lot.gone[i] = { s: 'out', ref: no, shop: shop.name, d: PD.today() }; });
  });
  var d = { id: PD.uid('wd'), no: no, reqId: r.id, reqNo: r.no, extNo: r.extNo, shopId: r.shopId, date: PD.today(), by: PD.user ? PD.user.name : '', note: note || '', lines: lines, serials: r.picked.slice(), taxable: PD.r2(taxable), tax: PD.r2(tax), total: PD.r2(taxable + tax), status: 'Sent', bill: true };
  D().wdisp.push(d); r.dispIds.push(d.id); r.picked = [];
  svc.wResolveLines(r); var full = r.lines.every(function (l) { return !l.itemId || svc.wDoneCount(r, l.itemId) >= r.lines.filter(function (x) { return x.itemId === l.itemId; }).reduce(function (a, x) { return a + x.qtyS; }, 0); });
  r.status = full ? 'Dispatched' : 'Partly dispatched';
  PD.log('Dispatched ' + no, shop.name + ' ' + PD.n2(d.total)); PD.save(); return d;
};
svc.wDispatchFile = function (d) {
  return { type: 'dispatch', v: 3, bill: !!d.bill, warehouse: D().settings.whName, no: d.no, date: d.date, requestNo: d.extNo, by: d.by, note: d.note,
    lines: d.lines.map(function (l, i) { var it = svc.item(l.itemId); return { name: it.name, generic: it.generic, cat: it.cat, schedule: it.schedule, mfr: svc.mfrName(it.mfrId), unit: it.unit, punit: it.punit, conv: it.conv, per: it.per || 1, sunit: it.sunit || 'Tab', hsn: it.hsn, tax: l.tax, reqIdx: i, batchNo: l.batchNo, expiry: l.expiry, mrp: l.mrp, rate: l.rate, qty: l.qty, serials: l.serials }; }) };
};
svc.wItemsFile = function () {
  return { type: 'items', warehouse: D().settings.whName, items: D().items.filter(function (i) { return i.active !== false; }).map(function (i) { return { name: i.name, generic: i.generic, cat: i.cat, schedule: i.schedule, mfr: svc.mfrName(i.mfrId), tax: i.tax, mrp: i.mrp, unit: i.unit, punit: i.punit, conv: i.conv, per: i.per || 1, sunit: i.sunit || 'Tab', reorder: i.reorder, hsn: i.hsn, division: i.division }; }) };
};

/* ---------- returns from shops ---------- */
svc.wImportReturn = function (f) {
  if (!f || f.type !== 'return' || !Array.isArray(f.lines)) throw new Error('This is not a return file from a shop');
  var shop = ensureShop(f.shop, f.shopId);
  if (D().wret.some(function (r) { return r.shopId === shop.id && r.extNo === f.no; })) throw new Error('Return ' + f.no + ' from ' + shop.name + ' is already imported');
  var lines = f.lines.map(function (l) {
    var it = D().items.find(function (i) { return i.name.toLowerCase() === String(l.name || '').toLowerCase(); });
    return { name: l.name, itemId: it ? it.id : '', batchNo: l.batchNo, expiry: l.expiry, mrp: PD.num(l.mrp), rate: PD.num(l.rate), qty: PD.num(l.qty), reason: l.reason || '', note: l.note || '', serials: l.serials || [], credit: !!l.credit, outcome: /expired|damag/i.test(l.reason || '') ? 'bad' : 'stock' };
  });
  var rec = { id: PD.uid('wt'), no: svc.docNo('RET-', 'WRET'), extNo: f.no, shopId: shop.id, date: f.date || PD.today(), note: f.note || '', lines: lines, status: 'Pending', value: PD.r2(lines.reduce(function (a, l) { return a + l.qty * l.rate; }, 0)),
    credit: PD.r2(lines.reduce(function (a, l) { return a + (l.credit ? l.qty * l.rate : 0); }, 0)) };   /* billed stock coming back: reduces what the shop owes once accepted */
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
  svc.wAddStock(lines, { supplier: 'Demo Pharma Distributors', bill: 'INV-DEMO-1', pay: 'credit' });
  svc.wImportRequest({ type: 'request', shop: 'Sunrise Pharmacy (demo)', no: 'RQ-000001', date: PD.today(), note: 'Weekly refill', lines: [{ name: d.items[0].name, qty: 2, unit: 'purchase' }, { name: d.items[1].name, qty: 1, unit: 'purchase' }, { name: d.items[2].name, qty: 15, unit: 'sale' }] });
  svc.wImportRequest({ type: 'request', shop: 'City Medico (demo)', no: 'RQ-000007', date: PD.today(), note: 'Urgent', lines: [{ name: d.items[3].name, qty: 1, unit: 'purchase' }, { name: d.items[8].name, qty: 20, unit: 'sale' }] });
  PD.user = u0; PD.save();
};

/* ---------- accounts: every warehouse entry also posts a voucher (double entry) ----------
   Add Stock = purchase (supplier on credit, or paid cash / bank). Bill to a shop = sale (each shop is a customer / debtor).
   Accepted return of billed stock = sales return. Payment from a shop = receipt. Closing stock = strips left x purchase price.
   Written-off strips simply leave the stock, so their cost shows up as a lower closing stock (a loss). */
svc.stockValue = function () { return svc.wStockValue(); };
svc.wShopCus = function (shopId) {
  var s = svc.wShop(shopId), c = svc.customer(shopId), nm = s ? s.name : shopId;
  if (!c) { c = { id: shopId, name: nm, phone: '', active: true, isShop: true }; D().customers.push(c); } else if (c.name !== nm) c.name = nm;
  var acc = svc.partyAcc('cus', shopId), a = svc.acc(acc); if (a.name !== nm) a.name = nm;
  return acc;
};
svc.wSupplierId = function (name) {
  name = String(name || '').trim(); if (!name) return '';
  var s = D().suppliers.find(function (x) { return x.name.toLowerCase() === name.toLowerCase(); });
  if (!s) { s = { id: PD.uid('s'), name: name, phone: '', active: true, links: { mfrs: [], items: [] } }; D().suppliers.push(s); }
  svc.partyAcc('sup', s.id); return s.id;
};
function payAcc(mode) { return /cash/i.test(mode || '') ? 'cash' : 'bank'; }
function openYear(date) { var y = svc.yearOf(date || PD.today()); if (y.closed) throw new Error('Financial year ' + y.label + ' is closed. Re-open it under Accounts first.'); }
function postBill(d) { if (d.vch || !d.bill || !(d.total > 0)) return; d.vch = svc.voucher(d.date, 'Sales', 'Bill ' + d.no + ' to ' + svc.wShopName(d.shopId), [{ acc: svc.wShopCus(d.shopId), dr: d.total }, { acc: 'sales', cr: d.total }], { kind: 'wbill', id: d.id, no: d.no }).id; }
function postReturn(r) { if (r.vch || r.status !== 'Accepted' || !(r.credit > 0)) return; r.vch = svc.voucher(r.doneOn || r.date, 'Sales Return', 'Return ' + r.no + (r.extNo ? ' / ' + r.extNo : '') + ' from ' + svc.wShopName(r.shopId), [{ acc: 'salesret', dr: r.credit }, { acc: svc.wShopCus(r.shopId), cr: r.credit }], { kind: 'wret', id: r.id, no: r.no }).id; }
function postPay(p) { if (p.vch) return; p.vch = svc.voucher(p.date, 'Receipt', 'Received from ' + svc.wShopName(p.shopId) + ' (' + p.mode + ')' + (p.note ? ' ' + p.note : ''), [{ acc: payAcc(p.mode), dr: p.amount }, { acc: svc.wShopCus(p.shopId), cr: p.amount }], { kind: 'wpay', id: p.id, no: p.no }).id; }

var oAdd = svc.wAddStock;
svc.wAddStock = function (lines, meta) {
  meta = meta || {}; var pay = meta.pay || 'credit', sid = meta.supplierId || svc.wSupplierId(meta.supplier);
  if (pay === 'credit' && !sid) throw new Error('Enter the supplier (or choose "Paid in cash" / "Paid by bank")');
  openYear(meta.date);
  var lots = oAdd(lines, meta), total = 0;
  lots.forEach(function (l) { total += l.n * (l.cost || 0); }); total = PD.r2(total);
  if (total > 0) {
    var nm = sid ? svc.supName(sid) : '', v = svc.voucher(meta.date || PD.today(), 'Purchase', 'Stock in ' + lots.map(function (l) { return 'L' + l.no; }).join(', ') + (meta.bill ? ' / Bill ' + meta.bill : '') + (nm ? ' from ' + nm : '') + (pay === 'credit' ? '' : ' (paid ' + (pay === 'cash' ? 'cash' : 'bank') + ')'),
      [{ acc: 'purchase', dr: total }, { acc: pay === 'credit' ? svc.partyAcc('sup', sid) : payAcc(pay), cr: total }], { kind: 'wpur', id: lots[0].id, no: 'L' + lots[0].no });
    lots.forEach(function (l) { l.vch = v.id; l.supplierId = sid; l.pay = pay; });
  }
  PD.save(); return lots;
};
var oDisp = svc.wDispatch;
svc.wDispatch = function (reqId, note) { openYear(); var d = oDisp(reqId, note); postBill(d); PD.save(); return d; };
var oAcc = svc.wAcceptReturn;
svc.wAcceptReturn = function (id, outcomes) { openYear(); var r = oAcc(id, outcomes); postReturn(r); PD.save(); return r; };
var oPay = svc.wReceivePay;
svc.wReceivePay = function (o) { openYear(o && o.date); var p = oPay(o); postPay(p); PD.save(); return p; };
svc.wDeletePay = function (id) {
  var a = svc.wPays(), p = a.find(function (x) { return x.id === id; }); if (!p) return;
  var v = p.vch && D().vouchers.find(function (x) { return x.id === p.vch; });
  if (v) { var y = D().years.find(function (x) { return x.id === v.year; }); if (y && y.closed) throw new Error('This payment is in a closed year and cannot be deleted'); D().vouchers = D().vouchers.filter(function (x) { return x !== v; }); }
  a.splice(a.indexOf(p), 1); PD.log('Payment deleted ' + p.no, svc.wShopName(p.shopId) + ' ' + PD.n2(p.amount)); PD.save();
};
/* a shop's statement = every voucher on its account (bills, returns, payments, and anything entered under Accounts) */
svc.wLedger = function (shopId) {
  var acc = 'cus_' + shopId, d = D(), e = [], pays = {};
  svc.wPays().forEach(function (p) { pays[p.id] = p; });
  var first = d.years.slice().sort(function (a, b) { return a.start.localeCompare(b.start); })[0], ob = first && d.openBal[first.id] ? d.openBal[first.id][acc] || 0 : 0;
  if (ob) e.push({ date: first.start, kind: 'Opening balance', no: '', dr: ob > 0 ? ob : 0, cr: ob < 0 ? -ob : 0, id: '' });
  d.vouchers.filter(function (v) { return v.lines.some(function (l) { return l.acc === acc; }); }).sort(function (a, b) { return a.date.localeCompare(b.date) || a.no - b.no; }).forEach(function (v) {
    var s = v.src || {}, dr = 0, cr = 0, p = s.kind === 'wpay' ? pays[s.id] : null;
    v.lines.forEach(function (l) { if (l.acc === acc) { dr += l.dr; cr += l.cr; } });
    e.push({ date: v.date, kind: s.kind === 'wbill' ? 'Bill' : s.kind === 'wret' ? 'Return' : s.kind === 'wpay' ? 'Payment' : v.type, mode: p ? p.mode : '', note: p ? p.note : (s.kind ? '' : v.narr), no: s.no || ('Vch #' + v.no), dr: PD.r2(dr), cr: PD.r2(cr), id: s.id || v.id });
  });
  var bal = 0; e.forEach(function (x) { bal = PD.r2(bal + x.dr - x.cr); x.bal = bal; });
  return e;
};
svc.wDues = function () {
  return D().shops.map(function (s) {
    var l = svc.wLedger(s.id), r = { id: s.id, code: s.code, name: s.name, billed: 0, returns: 0, paid: 0, due: 0, last: '' };
    l.forEach(function (x) { r.billed += x.dr; if (x.kind === 'Return') r.returns += x.cr; else { r.paid += x.cr; if (x.cr) r.last = x.date; } });
    r.billed = PD.r2(r.billed); r.returns = PD.r2(r.returns); r.paid = PD.r2(r.paid); r.due = l.length ? l[l.length - 1].bal : 0;
    return r;
  });
};
/* first start with accounts: what is on the shelves now becomes opening stock; then post anything not yet posted */
svc.wAcctInit = function () {
  var d = D(); d.wpay = d.wpay || [];
  try {
    d.shops.forEach(function (s) { svc.wShopCus(s.id); });
    if (!d.acctStart) {
      d.acctStart = PD.today(); var v = svc.wStockValue();
      if (v > 0) svc.voucher(PD.today(), 'Journal', 'Opening stock when accounts started (strips in the warehouse at purchase price)', [{ acc: 'openstock', dr: v }, { acc: 'capital', cr: v }], { kind: 'wopen' });
    }
    d.wdisp.forEach(postBill); d.wret.forEach(postReturn); d.wpay.forEach(postPay);
  } catch (e) { console.warn('accounts start', e); }
};
})();
