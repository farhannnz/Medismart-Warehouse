/* Direct sale bills: the warehouse also sells to hospitals, doctors, retailers and walk-in buyers (not only to shops).
   Strips are picked by scanning or by choosing the batch; the bill posts a sale (with output GST if charged) to the party's account,
   plus a receipt if money is taken now. Returns put the strips back and post a sales return. Party = any customer that is not a shop. */
(function () {
'use strict';
var PD = window.PD, esc = PD.esc, svc = PD.svc, $ = PD.$;
function D() { return PD.DB; }
function sales() { return D().wsales || (D().wsales = []); }
function partyName(id) { var c = svc.customer(id); return c ? c.name : 'Cash sale'; }
function ensureCash() { if (!svc.customer('cashsale')) D().customers.push({ id: 'cashsale', name: 'Cash Sale (walk-in)', phone: '', active: true }); svc.partyAcc('cus', 'cashsale'); }
function yearOpen(date) { var y = svc.yearOf(date); if (y.closed) throw new Error('Financial year ' + y.label + ' is closed. Re-open it under Accounts first.'); }
function freeSerials(lot, qty, taken) { var out = []; for (var i = 1; i <= lot.n && out.length < qty; i++) { if (lot.gone[i]) continue; var sr = svc.wSerial(lot, i); if (taken && taken[sr]) continue; out.push(sr); } return out; }
function payAcc(m) { return m === 'cash' ? 'cash' : 'bank'; }

/* o = { partyId, date, gst, pay: credit|cash|bank, received, note, lines: [{ lotId, serials, rate, disc }] } */
svc.wSale = function (o) {
  var date = o.date || PD.today(); yearOpen(date);
  var pid = o.partyId || 'cashsale'; if (pid === 'cashsale') ensureCash(); var party = svc.customer(pid); if (!party) throw new Error('Choose the party');
  if (!(o.lines || []).length) throw new Error('Add at least one medicine');
  var no = svc.docNo('WS-', 'WSALE'), seen = {}, lines = [], taxable = 0, tax = 0;
  o.lines.forEach(function (l) {
    var lot = D().lots.find(function (x) { return x.id === l.lotId; }), it = lot && svc.item(lot.itemId); if (!lot || !it) throw new Error('A batch is missing');
    if (!l.serials.length) return;
    if (lot.block) throw new Error(it.name + ' batch ' + lot.batchNo + ' is on ' + lot.block + (lot.blockWhy ? ' (' + lot.blockWhy + ')' : '') + ' and cannot be sold');
    l.serials.forEach(function (sr) { var p = svc.wParse(sr); if (!p || p.lot !== lot || p.bad) throw new Error('Wrong strip ' + sr); if (lot.gone[p.idx]) throw new Error(sr + ' is no longer in stock'); if (seen[sr]) throw new Error(sr + ' is on the bill twice'); seen[sr] = 1; });
    var rate = PD.num(l.rate), disc = PD.num(l.disc); if (!(rate >= 0)) throw new Error('Enter the rate for ' + it.name); if (disc < 0 || disc > 100) throw new Error('Discount must be 0 to 100');
    var qty = l.serials.length, net = PD.r2(qty * rate * (1 - disc / 100)), t = o.gst ? PD.num(it.tax) : 0, tx = PD.r2(net * t / 100);
    taxable += net; tax += tx;
    lines.push({ itemId: it.id, lotId: lot.id, batchNo: lot.batchNo, expiry: lot.expiry, mrp: lot.mrp, hsn: it.hsn || lot.hsn || '', rate: rate, cost: lot.cost, listCost: lot.listCost != null ? lot.listCost : lot.cost, disc: disc, tax: t, qty: qty, net: net, taxAmt: tx, serials: l.serials.slice(), ret: [] });
  });
  if (!lines.length) throw new Error('Add at least one strip');
  taxable = PD.r2(taxable); tax = PD.r2(tax); var total = PD.r2(taxable + tax), got = PD.num(o.received);
  if (o.pay === 'credit') got = 0; if (got < 0 || got > total + 0.005) throw new Error('Received amount cannot be more than the bill total');
  var s = { id: PD.uid('ws'), no: no, date: date, partyId: pid, lines: lines, taxable: taxable, tax: tax, total: total, gst: !!o.gst, pay: o.pay || 'credit', received: PD.r2(got), note: o.note || '', by: PD.user ? PD.user.name : '', returns: [], vch: '', rvch: '' };
  lines.forEach(function (l) { var lot = D().lots.find(function (x) { return x.id === l.lotId; }); l.serials.forEach(function (sr) { lot.gone[svc.wParse(sr).idx] = { s: 'out', ref: no, shop: party.name, d: date }; }); });
  var pa = svc.partyAcc('cus', pid);
  s.vch = svc.voucher(date, 'Sales', 'Bill ' + no + ' to ' + party.name, [{ acc: pa, dr: total }, { acc: 'sales', cr: s.gst ? taxable : total }, { acc: 'outtax', cr: s.gst ? tax : 0 }], { kind: 'wsale', id: s.id, no: no }).id;
  if (s.received > 0) s.rvch = svc.voucher(date, 'Receipt', 'Received on bill ' + no + ' (' + (s.pay === 'cash' ? 'cash' : 'bank / UPI') + ')', [{ acc: payAcc(s.pay), dr: s.received }, { acc: pa, cr: s.received }], { kind: 'wsalepay', id: s.id, no: no }).id;
  sales().push(s); PD.log('Sale bill ' + no, party.name + ' ' + PD.n2(total)); PD.save(); return s;
};
/* take back strips: qtys = { lineIndex: n } */
svc.wSaleReturn = function (id, qtys, date) {
  var s = sales().find(function (x) { return x.id === id; }); if (!s) throw new Error('Bill not found'); date = date || PD.today(); yearOpen(date);
  var tt = 0, tx = 0, rl = [];
  s.lines.forEach(function (l, i) {
    var n = Math.floor(PD.num(qtys[i])); if (!(n > 0)) return; var left = l.serials.filter(function (sr) { return l.ret.indexOf(sr) < 0; });
    if (n > left.length) throw new Error('Only ' + left.length + ' strips of ' + svc.itemName(l.itemId) + ' can still be returned');
    var back = left.slice(-n), lot = D().lots.find(function (x) { return x.id === l.lotId; });
    back.forEach(function (sr) { var p = svc.wParse(sr); if (lot && lot.gone[p.idx] && lot.gone[p.idx].ref === s.no) delete lot.gone[p.idx]; l.ret.push(sr); });
    var ta = PD.r2(l.net * n / l.qty), xa = PD.r2(l.taxAmt * n / l.qty); tt += ta; tx += xa; rl.push({ i: i, qty: n, taxable: ta, tax: xa, cost: l.cost });
  });
  if (!rl.length) throw new Error('Enter how many strips come back');
  tt = PD.r2(tt); tx = PD.r2(tx); var no = svc.docNo('WSR-', 'WSRET');
  var v = svc.voucher(date, 'Sales Return', 'Return ' + no + ' on bill ' + s.no + ' from ' + partyName(s.partyId), [{ acc: 'salesret', dr: tt }, { acc: 'outtax', dr: tx }, { acc: svc.partyAcc('cus', s.partyId), cr: PD.r2(tt + tx) }], { kind: 'wsaleret', id: s.id, no: no });
  s.returns.push({ no: no, date: date, lines: rl, taxable: tt, tax: tx, total: PD.r2(tt + tx), vch: v.id }); PD.log('Sale return ' + no, s.no); PD.save(); return PD.r2(tt + tx);
};
/* margin reports (P&L, Books) include these bills */
var oM = svc.wMargin;
svc.wMargin = function (from, to) {
  var r = oM(from, to);
  sales().forEach(function (s) {
    if (s.date >= from && s.date <= to) { r.bills++; s.lines.forEach(function (l) { r.sales += l.net; r.cost += l.qty * (l.cost || 0); r.listCost += l.qty * (l.listCost != null ? l.listCost : (l.cost || 0)); }); }
    (s.returns || []).forEach(function (x) { if (x.date < from || x.date > to) return; r.returns += x.taxable; x.lines.forEach(function (l) { r.retCost += l.qty * (l.cost || 0); r.retList += l.qty * (l.listCost != null ? l.listCost : (l.cost || 0)); }); });
  });
  Object.keys(r).forEach(function (k) { r[k] = PD.r2(r[k]); }); r.gross = PD.r2(r.sales - r.returns - (r.cost - r.retCost)); r.grossList = PD.r2(r.sales - r.returns - (r.listCost - r.retList)); r.schemeGain = PD.r2(r.gross - r.grossList); return r;
};

function saleHTML(s) {
  var c = svc.customer(s.partyId) || {}, W = D().shop, half = PD.r2(s.tax / 2);
  return '<h2>' + esc(W.name) + '</h2><div>' + esc(W.address || '') + (W.phone ? ' • ' + esc(W.phone) : '') + (W.gstin ? ' • GSTIN ' + esc(W.gstin) : '') + (W.dl ? ' • DL ' + esc(W.dl) : '') + '</div><h3>' + (s.gst ? 'Tax invoice ' : 'Bill ') + esc(s.no) + '</h3><div>' + PD.fmtDate(s.date) + ' • To: <b>' + esc(c.name || 'Cash sale') + '</b>' + (c.gstin ? ' • GSTIN ' + esc(c.gstin) : '') + (c.address ? '<br>' + esc(c.address) : '') + '</div><br>' +
    '<table><thead><tr><th>#</th><th>Medicine</th><th>HSN</th><th>Batch</th><th>Exp</th><th class="r">Qty</th><th class="r">MRP</th><th class="r">Rate</th><th class="r">Disc%</th>' + (s.gst ? '<th class="r">GST%</th>' : '') + '<th class="r">Amount</th></tr></thead><tbody>' +
    s.lines.map(function (l, i) { return '<tr><td>' + (i + 1) + '</td><td>' + esc(svc.itemName(l.itemId)) + '</td><td>' + esc(l.hsn) + '</td><td>' + esc(l.batchNo) + '</td><td>' + PD.fmtExp(l.expiry) + '</td><td class="r">' + l.qty + '</td><td class="r">' + PD.n2(l.mrp) + '</td><td class="r">' + PD.n2(l.rate) + '</td><td class="r">' + (l.disc || '') + '</td>' + (s.gst ? '<td class="r">' + l.tax + '</td>' : '') + '<td class="r">' + PD.n2(l.net) + '</td></tr>'; }).join('') + '</tbody><tfoot>' +
    '<tr><td colspan="' + (s.gst ? 10 : 9) + '" class="r">Taxable value</td><td class="r">' + PD.n2(s.taxable) + '</td></tr>' + (s.gst ? '<tr><td colspan="10" class="r">CGST</td><td class="r">' + PD.n2(half) + '</td></tr><tr><td colspan="10" class="r">SGST</td><td class="r">' + PD.n2(PD.r2(s.tax - half)) + '</td></tr>' : '') +
    '<tr><td colspan="' + (s.gst ? 10 : 9) + '" class="r"><b>Total</b></td><td class="r b">' + PD.n2(s.total) + '</td></tr>' + (s.received ? '<tr><td colspan="' + (s.gst ? 10 : 9) + '" class="r">Received (' + (s.pay === 'cash' ? 'cash' : 'bank / UPI') + ')</td><td class="r">' + PD.n2(s.received) + '</td></tr>' : '') + '<tr><td colspan="' + (s.gst ? 10 : 9) + '" class="r"><b>Balance due on this bill</b></td><td class="r b">' + PD.n2(PD.r2(s.total - s.received)) + '</td></tr></tfoot></table>' +
    (s.note ? '<p>Note: ' + esc(s.note) + '</p>' : '') + '<p class="mut">Goods once sold are taken back only as per our return policy. Check expiry and batch at delivery.</p><br><div style="display:flex;justify-content:space-between"><span>Received by</span><span>For ' + esc(W.name) + '</span></div>';
}

function partyModal(done) {
  var f = [{ k: 'name', label: 'Party name', req: true, full: true }, { k: 'phone', label: 'Phone' }, { k: 'gstin', label: 'GSTIN' }, { k: 'dl', label: 'Drug licence no.' }, { k: 'address', label: 'Address', full: true }, { k: 'creditLimit', label: 'Credit limit (0 = none)', type: 'number' }, { k: 'creditDays', label: 'Credit days', type: 'number' }];
  PD.modal({ title: 'New party (hospital, doctor, retailer...)', size: 'md', body: PD.formHTML(f, { creditDays: 30 }), foot: [{ label: 'Cancel' }, { label: 'Save', cls: 'p', fn: function (api) {
    try { var v = PD.readForm(api.body, f); v.gstin = String(v.gstin || '').toUpperCase(); v.active = true; var r = svc.saveMaster('customers', v); PD.toast('Party added', 'ok'); done(r.id); } catch (e) { PD.err(e); return false; }
  } }] });
}
function returnModal(s, done) {
  var rows = s.lines.map(function (l, i) { var left = l.qty - l.ret.length; return '<tr><td>' + esc(svc.itemName(l.itemId)) + '</td><td>' + esc(l.batchNo) + '</td><td class="r">' + l.qty + '</td><td class="r">' + l.ret.length + '</td><td class="r"><input type="number" min="0" max="' + left + '" class="in sm" style="width:70px" data-rq="' + i + '"' + (left ? '' : ' disabled') + '></td></tr>'; }).join('');
  PD.modal({ title: 'Return on bill ' + s.no, size: 'md', body: '<table class="t"><thead><tr><th>Medicine</th><th>Batch</th><th class="r">Sold</th><th class="r">Returned</th><th class="r">Return now</th></tr></thead><tbody>' + rows + '</tbody></table><p class="hint">Strips go back on the shelf and the party\'s account is credited (with GST if it was charged). Damaged or expired strips: take them back here, then write them off from Strip Lookup.</p>', foot: [{ label: 'Cancel' }, { label: 'Take back', cls: 'p', fn: function (api) {
    try { var q = {}; PD.$$('[data-rq]', api.body).forEach(function (i) { q[i.dataset.rq] = i.value; }); var t = svc.wSaleReturn(s.id, q); PD.toast('Credited ' + PD.n2(t) + ' to ' + partyName(s.partyId), 'ok'); done(); } catch (e) { PD.err(e); return false; }
  } }] });
}
function showSale(s, done) {
  var ret = (s.returns || []).reduce(function (a, x) { return a + x.total; }, 0);
  PD.modal({ title: 'Bill ' + s.no + ' • ' + partyName(s.partyId), size: 'lg', body: '<div class="tw">' + saleHTML(s).replace(/<h2>.*?<\/h2>/, '') + '</div>' + (ret ? '<p class="hint">Returned so far: ' + PD.n2(ret) + '</p>' : ''), foot: [{ label: 'Close' }, { label: 'Party ledger', fn: function () { PD.go('accounts', { tab: 'ledger', acc: 'cus_' + s.partyId }); } }, { label: 'Return', fn: function () { returnModal(s, done); } }, { label: 'Print', cls: 'p', icon: 'print', fn: function () { PD.printHTML(saleHTML(s), 'Bill ' + s.no); return false; } }] });
}

PD.views.wsale = { render: function (host, arg) {
  var tab = (arg && arg.tab) || 'new';
  host.innerHTML = '<div class="tabs" id="st" style="margin-bottom:14px"><button data-t="new" class="' + (tab === 'new' ? 'on' : '') + '">New sale bill</button><button data-t="list" class="' + (tab === 'list' ? 'on' : '') + '">Sale register</button></div><div id="sc"></div>';
  var sc = $('#sc', host);
  PD.on($('#st', host), 'click', 'button', function (e, b) { tab = b.dataset.t; PD.$$('#st button', host).forEach(function (x) { x.classList.toggle('on', x === b); }); open(); });
  function open() { sc.innerHTML = ''; var pane = document.createElement('div'); sc.appendChild(pane); (tab === 'new' ? newBill : list)(pane); }

  function list(el) {
    el.innerHTML = '';
    PD.report(el, { id: 'wsales', title: 'Sale bills to other parties', filters: [{ k: 'from', label: 'From', type: 'date', val: function () { return PD.addDays(PD.today(), -30); } }, { k: 'to', label: 'To', type: 'date', val: PD.today }],
      load: function (f) {
        return { cols: [{ k: 'date', label: 'Date', fmt: PD.fmtDate }, { k: 'no', label: 'Bill', fmt: function (v) { return '<b>' + esc(v) + '</b>'; } }, { k: 'party', label: 'Party' }, { k: 'qty', label: 'Strips', align: 'r' }, { k: 'taxable', label: 'Taxable', align: 'r', sum: true, fmt: PD.n2 }, { k: 'tax', label: 'GST', align: 'r', sum: true, fmt: PD.n2 }, { k: 'total', label: 'Total', align: 'r', sum: true, fmt: PD.n2 }, { k: 'ret', label: 'Returned', align: 'r', sum: true, fmt: function (v) { return v ? PD.n2(v) : ''; } }, { k: 'received', label: 'Received', align: 'r', sum: true, fmt: PD.n2 }],
          rows: sales().filter(function (s) { return s.date >= f.from && s.date <= f.to; }).sort(function (a, b) { return b.date.localeCompare(a.date) || b.no.localeCompare(a.no); }).map(function (s) { return { id: s.id, date: s.date, no: s.no, party: partyName(s.partyId), qty: s.lines.reduce(function (a, l) { return a + l.qty; }, 0), taxable: s.taxable, tax: s.tax, total: s.total, ret: (s.returns || []).reduce(function (a, x) { return a + x.total; }, 0), received: s.received }; }), note: 'Click a bill to print it, take a return, or open the party ledger. Money still due is under Books & Finance → Outstanding & ageing.' };
      }, drill: function (r, run) { var s = sales().find(function (x) { return x.id === r.id; }); if (s) showSale(s, run); } });
  }


  /* ---------- new sale bill: same screen as the shop's Sales Bill. Pick a medicine and the batch that expires FIRST is chosen by itself
     (and the next-nearest batch is used when the first one runs out). Party can be cash, any party, or one of OUR OWN SHOPS (goes straight to that
     shop's Receive Stock and its account, no request needed). ---------- */
  var HAY = null;
  function hayList() {
    var items = D().items;
    if (HAY && HAY.db === PD.DB && HAY.n === items.length) return HAY.list;
    var list = []; items.forEach(function (it) { if (it.active === false) return; list.push({ it: it, hay: (it.name + ' ' + (it.generic || '')).toLowerCase() }); });
    HAY = { db: PD.DB, n: items.length, list: list }; return list;
  }
  function dispAsSale(d) {
    var g = !!d.gst;
    return { no: d.no, date: d.date, partyId: d.shopId, gst: g, pay: 'credit', received: 0, note: d.note, taxable: d.taxable, tax: d.tax, total: d.total,
      lines: d.lines.map(function (l) { return { itemId: l.itemId, hsn: (svc.item(l.itemId) || {}).hsn || '', batchNo: l.batchNo, expiry: l.expiry, mrp: l.mrp, rate: l.rate, disc: 0, tax: g ? l.tax : 0, qty: l.qty, net: PD.r2(l.qty * l.rate) }; }) };
  }
  function expc(e) { if (!e) return ''; var dd = PD.daysToExp(e); return dd < 0 ? 'expd' : dd <= (D().settings.expiryDays || 90) ? 'expw' : ''; }

  function newBill(el) {
    ensureCash();
    var cart = [], sel = -1, results = [], idx = 0, msg = '', fyA = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    var meta = { party: 'cashsale', date: PD.today(), gst: true, pay: 'cash', received: '', note: '' };
    function isShop() { return /^shop:/.test(meta.party); }
    function shopId() { return meta.party.slice(5); }
    function gstOn() { return isShop() ? !!D().settings.gstOnBills : !!meta.gst; }
    function taken() { var t = {}; cart.forEach(function (l) { l.serials.forEach(function (s) { t[s] = 1; }); }); return t; }
    function lotOf(l) { return D().lots.find(function (x) { return x.id === l.lotId; }); }
    function sellable(lot) { return !lot.block && (!lot.expiry || PD.daysToExp(lot.expiry) >= 0); }
    function used(lotId, skip) { var n = 0; cart.forEach(function (l, i) { if (l.lotId === lotId && i !== skip) n += l.serials.length; }); return n; }
    function free(lot, skip) { return svc.wLeft(lot) - used(lot.id, skip); }
    function fefo(itemId) { return svc.wLotsOf(itemId).filter(sellable); }   /* earliest expiry first, expired / held batches left out */
    function defRate(lot) { return PD.num(lot.sell) > 0 ? lot.sell : lot.cost; }
    function addToLot(lot, n) {
      if (n <= 0) return 0; var s = freeSerials(lot, n, taken()); if (!s.length) return 0;
      var row = cart.find(function (x) { return x.lotId === lot.id; });
      if (!row) { row = { lotId: lot.id, serials: [], rate: defRate(lot), disc: 0 }; var at = -1; cart.forEach(function (x, i) { if (lotOf(x).itemId === lot.itemId) at = i; }); if (at >= 0) cart.splice(at + 1, 0, row); else cart.push(row); }
      row.serials = row.serials.concat(s); return s.length;
    }
    function addItem(itemId, n) { var left = n; fefo(itemId).forEach(function (lot) { if (left > 0) left -= addToLot(lot, Math.min(left, free(lot))); }); return n - left; }
    function setQty(i, n) {
      var row = cart[i]; n = Math.floor(PD.num(n)); if (!row) return;
      if (n <= 0) { cart.splice(i, 1); sel = Math.min(sel, cart.length - 1); return; }
      var cur = row.serials.length, lot = lotOf(row), need;
      if (n < cur) { row.serials = row.serials.slice(0, n); return; }
      need = n - cur; if (sellable(lot)) need -= addToLot(lot, Math.min(need, free(lot)));
      if (need > 0) need -= addItem(lot.itemId, need);
      if (need > 0) PD.toast('Only ' + (n - need) + ' strips of ' + svc.itemName(lot.itemId) + ' are in stock: quantity set to ' + (n - need), 'err');
    }
    function changeBatch(i, lotId) {
      var row = cart[i], nl = D().lots.find(function (x) { return x.id === lotId; }); if (!row || !nl || nl.id === row.lotId) return;
      var cnt = row.serials.length, take = Math.min(cnt, free(nl)); if (take <= 0) { PD.toast('That batch has no free strips', 'err'); return; }
      var other = cart.find(function (x) { return x.lotId === nl.id; }), it = nl.itemId;
      cart.splice(i, 1); addToLot(nl, take);
      if (!other) { var nr = cart.find(function (x) { return x.lotId === nl.id; }); if (nr) { nr.rate = defRate(nl); } }
      if (take < cnt) { var back = addItem(it, cnt - take); if (back < cnt - take) PD.toast('Only ' + (take + back) + ' strips available', 'err'); }
    }
    function calc() {
      var tx = 0, tt = 0, g = gstOn(), q = 0, gross = 0;
      cart.forEach(function (l) { var it = svc.item(lotOf(l).itemId), n = l.serials.length, base = n * PD.num(l.rate), net = base * (1 - PD.num(l.disc) / 100); q += n; gross += base; tt += net; if (g) tx += net * PD.num(it.tax) / 100; });
      return { gross: PD.r2(gross), taxable: PD.r2(tt), tax: PD.r2(tx), total: PD.r2(tt + tx), qty: q };
    }
    function recvAmt(c) { return meta.pay === 'credit' ? 0 : (meta.received === '' ? c.total : PD.num(meta.received)); }

    var shopN = (D().shop && D().shop.name) || 'Warehouse';
    function build() {
      var parties = D().customers.filter(function (c) { return !c.isShop && c.active !== false && c.id !== 'cashsale'; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
      var shops = D().shops.filter(function (s) { return s.active !== false; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
      el.innerHTML = '<div class="msw ssw">' +
        '<div class="sband"><b class="sb1">&#10010; Arogya Bharti</b><span class="sb2">' + esc(shopN) + '</span><span class="sb3">01/04/' + fyA + ' &nbsp;TO&nbsp; 31/03/' + (fyA + 1) + '</span><span class="sb4">Login &nbsp; ' + esc(PD.user ? PD.user.name : '') + '</span></div>' +
        '<div class="stitle"><span>SALE</span><span>WS</span><span id="sgt">Gst</span></div>' +
        '<div class="shead"><label>VrNo:</label><input class="in" id="bno" readonly style="width:110px"><label>Date</label><input type="date" class="in" id="sd" value="' + meta.date + '" style="width:140px"><label>Party</label>' +
          '<select class="in" id="sp" style="min-width:240px"><option value="cashsale">Cash sale (walk-in)</option>' +
          (shops.length ? '<optgroup label="Our shops (goes to the shop\'s Receive Stock, no request needed)">' + shops.map(function (s) { return '<option value="shop:' + s.id + '">' + esc(s.name) + ' (shop)</option>'; }).join('') + '</optgroup>' : '') +
          (parties.length ? '<optgroup label="Other parties">' + parties.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('') + '</optgroup>' : '') + '</select>' +
          '<button class="mb" id="np">&#10133; New party</button><label class="chk" style="color:#fff"><input type="checkbox" id="sg"> Charge GST</label><span class="sp"></span></div>' +
        '<div class="skeys">F3 Item Search, Enter Add item (nearest-expiry batch is picked by itself) &nbsp; Del Item Ctrl+D &nbsp; Scan a strip in the box on the right &nbsp; Ctrl+Enter Save &nbsp; F10 Print save</div>' +
        '<div class="msgrid"><table class="t" id="cart"></table></div>' +
        '<div class="msentry"><div class="ehead"><span style="flex:1">Item Name (type name / generic) &mdash; nearest expiry batch comes automatically</span><span style="width:260px">Scan strip</span></div>' +
        '<div class="erow"><div style="flex:1;position:relative"><input class="in" id="q" placeholder="*  (type name / generic, F3)" autocomplete="off" style="text-align:left"><div class="sres" id="res"></div></div><input class="in" id="ssc" autocomplete="off" placeholder="scan a strip barcode" style="width:260px;text-align:left"></div><div class="hint" id="smsg" style="min-height:16px"></div></div>' +
        '<div class="sbot">' +
          '<div class="srec"><div class="skeys">Recent bills, click one to open it</div><input class="in sm" id="bsq" placeholder="search bill no / party" autocomplete="off"><div class="srecw"><table class="t" id="rec"></table></div></div>' +
          '<div class="smid">' +
            '<div class="sf"><label>Pay</label><select class="in" id="spm"><option value="cash">Cash</option><option value="bank">UPI / bank</option><option value="credit">On credit (udhaar)</option></select></div>' +
            '<div class="sf"><label>PaidAmt</label><input class="in" id="srv" type="number" step="any" style="max-width:130px"></div>' +
            '<div class="sf"><label>Balance</label><input class="in" id="bal" readonly style="max-width:130px"></div>' +
            '<div class="sf"><label>Narration</label><input class="in" id="snt"></div>' +
            '<div class="hint" id="pnote"></div>' +
          '</div>' +
          '<div class="sright"><div id="tot"></div><div class="snet"><label>Net Amt</label><b id="netv">0</b></div><div class="sti"><label>Total Items</label><b id="ni">0</b><label style="margin-left:8px">Qty</label><b id="nq">0</b></div><div id="thint"></div></div>' +
        '</div>' +
        '<div class="sbtns"><button class="sbtn" id="ssv"><i>&#128190;</i>Save</button><button class="sbtn" id="ssp"><i>&#128438;</i>Print save</button><button class="sbtn" id="sdel"><i>&#128465;</i>Delete row</button><button class="sbtn" id="sclr"><i>&#10006;</i>Clear</button></div></div>';
      $('#sp', el).value = meta.party; $('#sg', el).checked = meta.gst; $('#snt', el).value = meta.note;
      drawCart(); drawRec(); $('#q', el).focus();
    }
    function drawCart() {
      var t = $('#cart', el); if (!t) return;
      t.innerHTML = '<thead><tr><th style="width:40px">SN</th><th>ItemName</th><th style="width:56px">Pack</th><th style="width:54px">Shelf</th><th style="width:130px">BatchNo</th><th style="width:76px">Expiry</th><th class="r" style="width:70px">Mrp</th><th class="r" style="width:64px">Qty</th><th class="r" style="width:84px">Rate</th><th class="r" style="width:60px">Disc%</th><th class="r" style="width:50px">GST%</th><th class="r" style="width:90px">Amount</th></tr></thead><tbody>' +
        (cart.length ? cart.map(function (l, i) {
          var lot = lotOf(l), it = svc.item(lot.itemId), net = l.serials.length * PD.num(l.rate) * (1 - PD.num(l.disc) / 100);
          var opts = fefo(lot.itemId); if (!opts.some(function (x) { return x.id === lot.id; })) opts = [lot].concat(opts);
          return '<tr class="cartrow ' + (i === sel ? 'sel' : '') + '" data-r="' + i + '"><td>' + (i + 1) + '</td><td>' + esc(it.name) + ' ' + PD.schedBadge(it.schedule) + '</td><td>' + esc(it.pack || '') + '</td><td>' + esc(it.rack || '') + '</td>' +
            '<td><select class="in sm" data-b="' + i + '">' + opts.map(function (b) { return '<option value="' + b.id + '"' + (b.id === lot.id ? ' selected' : '') + '>' + esc(b.batchNo) + ' (' + (svc.wLeft(b) - used(b.id, i)) + ')</option>'; }).join('') + '</select></td>' +
            '<td class="' + expc(lot.expiry) + '">' + PD.fmtExp(lot.expiry) + '</td><td class="r">' + PD.n2(lot.mrp) + '</td>' +
            '<td class="r"><input class="in sm qn" data-q="' + i + '" type="number" min="0" step="1" value="' + l.serials.length + '"></td>' +
            '<td class="r"><input class="in sm" data-rt="' + i + '" type="number" step="any" value="' + l.rate + '"></td>' +
            '<td class="r"><input class="in sm" data-d="' + i + '" type="number" min="0" max="100" step="any" value="' + (l.disc || '') + '"></td>' +
            '<td class="r">' + (gstOn() ? PD.num(it.tax) : 0) + '</td><td class="r"><b>' + PD.n2(net) + '</b></td></tr>';
        }).join('') : '<tr><td colspan="12" class="mut" style="padding:16px">Search a medicine (F3) or scan a strip to start the bill.</td></tr>') + '</tbody>';
      totals();
    }
    function totals() {
      var c = calc(), rec = recvAmt(c), sh = isShop();
      $('#sgt', el).textContent = gstOn() ? 'Gst' : 'No Gst'; $('#sg', el).checked = gstOn(); $('#sg', el).disabled = sh;
      var pm = $('#spm', el); pm.value = meta.pay; pm.disabled = sh;
      var rc = $('#srv', el); rc.disabled = meta.pay === 'credit'; if (document.activeElement !== rc) rc.value = meta.pay === 'credit' ? 0 : (meta.received === '' ? c.total : meta.received);
      $('#bal', el).value = PD.n2(Math.max(0, PD.r2(c.total - rec)));
      $('#tot', el).innerHTML = '<div class="sf gr"><label>Gross</label><input class="in" readonly value="' + PD.n2(c.gross) + '"></div><div class="sf fd"><label>Discount</label><input class="in" readonly value="' + PD.n2(PD.r2(c.gross - c.taxable)) + '"></div>';
      $('#netv', el).textContent = PD.n2(c.total); $('#ni', el).textContent = cart.length; $('#nq', el).textContent = c.qty;
      $('#thint', el).innerHTML = '<div class="hint">Taxable ' + PD.n2(c.taxable) + ' + GST ' + PD.n2(c.tax) + '</div>';
      $('#pnote', el).innerHTML = sh ? 'Our own shop: the bill goes on its account (see Shop Accounts) and the stock appears in the shop\'s <b>Receive Stock</b> at once. ' + (D().settings.gstOnBills ? 'GST follows Settings.' : 'No GST on shop bills (Settings).') : (meta.party === 'cashsale' ? 'Walk-in buyers must pay in full.' : '');
      $('#bno', el).value = 'WS-' + String(((D().counters && (D().counters.WSALE || 0)) || 0) + 1);
      var sv = $('#ssv', el); if (sv) { sv.disabled = !cart.length; $('#ssp', el).disabled = !cart.length; }
    }
    function drawRec() {
      var qv = ($('#bsq', el).value || '').toLowerCase(), a = [];
      sales().forEach(function (s) { a.push({ k: 's', id: s.id, no: s.no, date: s.date, party: partyName(s.partyId), total: s.total, t: s.pay === 'cash' ? 'C' : s.pay === 'bank' ? 'U' : 'R' }); });
      D().wdisp.forEach(function (d) { if (d.direct) a.push({ k: 'd', id: d.id, no: d.no, date: d.date, party: svc.wShopName(d.shopId) + ' (shop)', total: d.total, t: 'S' }); });
      a = a.filter(function (r) { return !qv || (r.no + ' ' + r.party).toLowerCase().indexOf(qv) >= 0; }).sort(function (x, y) { return y.date.localeCompare(x.date) || y.no.localeCompare(x.no); }).slice(0, 20);
      $('#rec', el).innerHTML = '<thead><tr><th>BillNo</th><th>BillDate</th><th>T</th><th>Party</th><th class="r">Amount</th></tr></thead><tbody>' + a.map(function (r) { return '<tr data-bn="' + r.k + r.id + '"><td>' + esc(r.no) + '</td><td>' + PD.fmtDate(r.date) + '</td><td>' + r.t + '</td><td>' + esc(r.party) + '</td><td class="r">' + PD.n2(r.total) + '</td></tr>'; }).join('') + '</tbody>';
    }
    function say(ok, t) { var m = $('#smsg', el); if (m) m.innerHTML = '<span style="color:' + (ok ? '#2e8b57' : '#c62828') + '">' + (ok ? '&#10004; ' : '&#10006; ') + esc(t) + '</span>'; }

    /* item search */
    function search() {
      var q = $('#q', el), words = (q.value === '*' ? '' : q.value).trim().toLowerCase().split(/\s+/).filter(Boolean), sm = svc.wStockMap(), a = [], b = [], list = hayList();
      for (var i = 0; i < list.length && a.length < 40; i++) { var e = list[i]; if (words.length && !words.every(function (w) { return e.hay.indexOf(w) >= 0; })) continue; if ((sm[e.it.id] || 0) > 0) a.push(e.it); else if (b.length < 40) b.push(e.it); }
      results = a.concat(b).slice(0, 40).map(function (it) { return { it: it, st: sm[it.id] || 0 }; }); if (idx >= results.length) idx = 0;
      var res = $('#res', el);
      res.innerHTML = results.map(function (r, i) { var it = r.it; return '<div class="it ' + (i === idx ? 'on' : '') + '" data-i="' + i + '"><span class="nm"><b>' + (r.st > 0 ? '' : '# ') + esc(it.name) + '</b> ' + PD.schedBadge(it.schedule) + '<small> ' + esc(it.generic || '') + ' • ' + esc(svc.mfrName(it.mfrId)) + (it.rack ? ' • Shelf ' + esc(it.rack) : '') + '</small></span><span class="pr">' + PD.n2(it.mrp) + '<small>' + (r.st > 0 ? r.st : 'out') + '</small></span></div>'; }).join('') || '<div class="empty">No medicines match.</div>';
      res.style.display = document.activeElement === q ? 'block' : 'none';
      var on = $('.on', res); if (on) on.scrollIntoView({ block: 'nearest' });
    }
    function pick(itemId, focusQty) {
      var it = svc.item(itemId), got = addItem(itemId, 1);
      if (!got) { PD.toast(it.name + ' has no sellable stock left (out of stock, expired or on hold)', 'err'); return; }
      var at = -1; cart.forEach(function (x, i) { if (lotOf(x).itemId === itemId) at = i; }); sel = at >= 0 ? at : cart.length - 1; drawCart();
      var lot = lotOf(cart[sel]); say(true, it.name + ' • batch ' + lot.batchNo + ' (expires ' + PD.fmtExp(lot.expiry) + ') added');
      if (focusQty) { var f = $('[data-q="' + sel + '"]', el); if (f) { f.focus(); f.select(); } }
    }
    PD.on(el, 'input', '#q', function () { idx = 0; search(); });
    PD.on(el, 'focusin', '#q', function (e, t) { if (t.value === '*') t.select(); search(); });
    PD.on(el, 'focusout', '#q', function () { setTimeout(function () { var r = $('#res', el); if (r) r.style.display = 'none'; }, 160); });
    PD.on(el, 'keydown', '#q', function (e, q) {
      if (e.key === 'ArrowDown') { idx = Math.min(idx + 1, results.length - 1); search(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { idx = Math.max(idx - 1, 0); search(); e.preventDefault(); }
      else if (e.key === 'Enter' && results[idx]) { e.preventDefault(); pick(results[idx].it.id, true); q.value = ''; idx = 0; $('#res', el).style.display = 'none'; }
      else if (e.key === 'Escape') $('#res', el).style.display = 'none';
    });
    PD.on(el, 'mousedown', '#res [data-i]', function (e, t) { e.preventDefault(); pick(results[+t.dataset.i].it.id, false); $('#q', el).value = ''; });
    /* strip scan */
    PD.on(el, 'keydown', '#ssc', function (e, scn) {
      if (e.key !== 'Enter') return; e.preventDefault(); var v = scn.value; scn.value = ''; if (!v.trim()) return;
      var p = svc.wParse(v);
      if (!p) say(false, 'Not an Arogya Bharti strip code');
      else if (!p.lot || p.bad) say(false, 'Unknown strip ' + p.serial);
      else if (p.lot.gone[p.idx]) say(false, p.serial + ' is not in stock');
      else if (p.lot.block) say(false, 'Batch is on ' + p.lot.block + ': cannot be sold');
      else if (taken()[p.serial]) say(false, p.serial + ' is already on the bill');
      else {
        var row = cart.find(function (x) { return x.lotId === p.lot.id; });
        if (!row) { row = { lotId: p.lot.id, serials: [], rate: defRate(p.lot), disc: 0 }; var at = -1; cart.forEach(function (x, i) { if (lotOf(x).itemId === p.lot.itemId) at = i; }); if (at >= 0) cart.splice(at + 1, 0, row); else cart.push(row); }
        row.serials.push(p.serial); sel = cart.indexOf(row); drawCart(); say(true, svc.itemName(p.lot.itemId) + ' • ' + p.serial);
      }
      $('#ssc', el).focus();
    });

    /* grid edits */
    PD.on(el, 'change', '[data-q]', function (e, t) { sel = +t.dataset.q; setQty(sel, t.value); drawCart(); });
    PD.on(el, 'change', '[data-rt]', function (e, t) { cart[+t.dataset.rt].rate = PD.num(t.value); drawCart(); });
    PD.on(el, 'change', '[data-d]', function (e, t) { var d = PD.num(t.value); if (d < 0 || d > 100) { PD.toast('Discount must be 0 to 100', 'err'); d = 0; } cart[+t.dataset.d].disc = d; drawCart(); });
    PD.on(el, 'change', '[data-b]', function (e, t) { sel = +t.dataset.b; changeBatch(sel, t.value); drawCart(); });
    PD.on(el, 'keydown', '[data-q],[data-rt],[data-d]', function (e) { if (e.key === 'Enter' && !e.ctrlKey) { e.preventDefault(); var q = $('#q', el); q.focus(); q.select(); } });
    PD.on(el, 'click', '#cart tr.cartrow', function (e, t) { if (e.target.closest('input,select')) return; sel = +t.dataset.r; PD.$$('#cart tr.cartrow', el).forEach(function (r) { r.classList.toggle('sel', r === t); }); });
    function delRow() { if (sel < 0 || !cart[sel]) { PD.toast('Select a row in the grid, then press Delete'); return; } cart.splice(sel, 1); sel = Math.min(sel, cart.length - 1); drawCart(); }
    PD.on(el, 'click', '#sdel', delRow);
    PD.on(el, 'click', '#sclr', function () { if (!cart.length) return; PD.confirm('Clear all items from this bill?', 'Clear', true).then(function (ok) { if (ok) { cart = []; sel = -1; meta.received = ''; drawCart(); } }); });

    /* bill header and payment */
    PD.on(el, 'change', '#sp', function (e, t) { meta.party = t.value; meta.received = ''; if (isShop()) meta.pay = 'credit'; else if (meta.pay === 'credit' && meta.party === 'cashsale') meta.pay = 'cash'; cart.forEach(function (l) { l.rate = defRate(lotOf(l)); }); drawCart(); });
    PD.on(el, 'change', '#sd', function (e, t) { meta.date = t.value || PD.today(); });
    PD.on(el, 'change', '#sg', function (e, t) { meta.gst = t.checked; drawCart(); });
    PD.on(el, 'change', '#spm', function (e, t) { meta.pay = t.value; meta.received = ''; totals(); });
    PD.on(el, 'input', '#srv', function (e, t) { meta.received = t.value; totals(); });
    PD.on(el, 'input', '#snt', function (e, t) { meta.note = t.value; });
    PD.on(el, 'input', '#bsq', drawRec);
    PD.on(el, 'click', '#np', function () { partyModal(function (id) { meta.party = id; build(); }); });
    PD.on(el, 'click', '[data-bn]', function (e, t) {
      var k = t.dataset.bn.charAt(0), id = t.dataset.bn.slice(1);
      if (k === 's') { var s = sales().find(function (x) { return x.id === id; }); if (s) showSale(s, function () { drawRec(); }); }
      else { var d = D().wdisp.find(function (x) { return x.id === id; }); if (d) PD.printHTML(saleHTML(dispAsSale(d)), 'Bill ' + d.no); }
    });

    function save(print) {
      try {
        if (!cart.length) throw new Error('Add at least one medicine');
        var c = calc(), got = recvAmt(c), s;
        if (isShop()) {
          s = svc.wDirectDispatch(shopId(), cart.map(function (l) { return { lotId: l.lotId, serials: l.serials, rate: l.rate, disc: l.disc }; }), { date: meta.date, note: meta.note });
          PD.toast('Sent to ' + svc.wShopName(s.shopId) + ' • bill ' + s.no + ' • ' + PD.money(s.total), 'ok'); if (print) PD.printHTML(saleHTML(dispAsSale(s)), 'Bill ' + s.no);
        } else {
          if (meta.party === 'cashsale' && PD.r2(c.total - got) > 0.005) throw new Error('A walk-in sale must be paid in full. Choose a party to keep a balance.');
          s = svc.wSale({ partyId: meta.party, date: meta.date, gst: meta.gst, pay: meta.pay, received: got, note: meta.note, lines: cart.map(function (l) { return { lotId: l.lotId, serials: l.serials, rate: l.rate, disc: l.disc }; }) });
          PD.toast('Bill ' + s.no + ' saved • ' + PD.money(s.total), 'ok'); if (print) PD.printHTML(saleHTML(s), 'Bill ' + s.no);
        }
        cart = []; sel = -1; meta.received = ''; drawCart(); drawRec(); say(true, 'Bill ' + s.no + ' saved'); $('#q', el).focus();
      } catch (e) { PD.err(e); }
    }
    PD.on(el, 'click', '#ssv', function () { save(false); });
    PD.on(el, 'click', '#ssp', function () { save(true); });
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(false); } else if (e.key === 'd' && e.ctrlKey) { e.preventDefault(); delRow(); } });
    PD.hotkeys = PD.hotkeys || {}; PD.hotkeys.F3 = { el: el, fn: function () { var q = $('#q', el); q.focus(); q.select(); } }; PD.hotkeys.F10 = { el: el, fn: function () { save(true); } };
    build();
  }
  open();
} };
})();
