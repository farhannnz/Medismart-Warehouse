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
    l.serials.forEach(function (sr) { var p = svc.wParse(sr); if (!p || p.lot !== lot || p.bad) throw new Error('Wrong strip ' + sr); if (lot.gone[p.idx]) throw new Error(sr + ' is no longer in stock'); if (seen[sr]) throw new Error(sr + ' is on the bill twice'); seen[sr] = 1; });
    var rate = PD.num(l.rate), disc = PD.num(l.disc); if (!(rate >= 0)) throw new Error('Enter the rate for ' + it.name); if (disc < 0 || disc > 100) throw new Error('Discount must be 0 to 100');
    var qty = l.serials.length, net = PD.r2(qty * rate * (1 - disc / 100)), t = o.gst ? PD.num(it.tax) : 0, tx = PD.r2(net * t / 100);
    taxable += net; tax += tx;
    lines.push({ itemId: it.id, lotId: lot.id, batchNo: lot.batchNo, expiry: lot.expiry, mrp: lot.mrp, hsn: it.hsn || lot.hsn || '', rate: rate, cost: lot.cost, disc: disc, tax: t, qty: qty, net: net, taxAmt: tx, serials: l.serials.slice(), ret: [] });
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
    if (s.date >= from && s.date <= to) { r.bills++; s.lines.forEach(function (l) { r.sales += l.net; r.cost += l.qty * (l.cost || 0); }); }
    (s.returns || []).forEach(function (x) { if (x.date < from || x.date > to) return; r.returns += x.taxable; x.lines.forEach(function (l) { r.retCost += l.qty * (l.cost || 0); }); });
  });
  Object.keys(r).forEach(function (k) { r[k] = PD.r2(r[k]); }); r.gross = PD.r2(r.sales - r.returns - (r.cost - r.retCost)); return r;
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
  var f = [{ k: 'name', label: 'Party name', req: true, full: true }, { k: 'phone', label: 'Phone' }, { k: 'gstin', label: 'GSTIN' }, { k: 'address', label: 'Address', full: true }, { k: 'creditLimit', label: 'Credit limit (0 = none)', type: 'number' }, { k: 'creditDays', label: 'Credit days', type: 'number' }];
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

  function newBill(el) {
    ensureCash();
    var cart = [], meta = { partyId: 'cashsale', date: PD.today(), gst: true, pay: 'cash', received: '', note: '' }, msg = '', hits = [];
    function taken() { var t = {}; cart.forEach(function (l) { l.serials.forEach(function (s) { t[s] = 1; }); }); return t; }
    function lotOf(l) { return D().lots.find(function (x) { return x.id === l.lotId; }); }
    function addLot(lot, serials) { var l = cart.find(function (x) { return x.lotId === lot.id; }); if (!l) { l = { lotId: lot.id, serials: [], rate: PD.num(lot.sell) > 0 ? lot.sell : lot.cost, disc: 0 }; cart.push(l); } l.serials = l.serials.concat(serials); }
    function calc() {
      var tx = 0, tt = 0; cart.forEach(function (l) { var it = svc.item(lotOf(l).itemId), net = l.serials.length * PD.num(l.rate) * (1 - PD.num(l.disc) / 100); tt += net; if (meta.gst) tx += net * PD.num(it.tax) / 100; });
      return { taxable: PD.r2(tt), tax: PD.r2(tx), total: PD.r2(tt + tx) };
    }
    function draw() {
      var parties = D().customers.filter(function (c) { return !c.isShop && c.active !== false && c.id !== 'cashsale'; }).sort(function (a, b) { return a.name.localeCompare(b.name); }), c = calc(), rec = meta.pay === 'credit' ? 0 : (meta.received === '' ? c.total : PD.num(meta.received));
      el.innerHTML = '<div class="card"><div class="bd"><div class="row" style="gap:12px;flex-wrap:wrap;align-items:flex-end"><div class="fld" style="min-width:240px"><label>Party</label><select class="in" id="sp"><option value="cashsale">Cash sale (walk-in)</option>' + parties.map(function (p) { return '<option value="' + p.id + '"' + (p.id === meta.partyId ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select></div><button class="btn sm" id="np">+ New party</button><div class="fld"><label>Date</label><input type="date" class="in" id="sd" value="' + meta.date + '"></div><label class="chk" style="margin-bottom:8px"><input type="checkbox" id="sg"' + (meta.gst ? ' checked' : '') + '> Charge GST</label></div>' +
        '<div class="scanbox" style="margin-top:10px"><label>Scan strip:</label><input class="in" id="ssc" autocomplete="off" placeholder="scan a strip, or search a medicine below" style="font-size:16px"><span class="fb">' + msg + '</span></div>' +
        '<div class="row" style="margin-top:6px"><input class="in" id="smq" placeholder="search medicine to add by batch..." style="flex:1" autocomplete="off"></div><div id="shits"></div></div></div>' +
        '<div class="card" style="margin-top:12px"><div class="tw"><table class="t"><thead><tr><th>Medicine</th><th>Batch</th><th>Exp</th><th class="r">Strips</th><th class="r">MRP</th><th class="r">Rate</th><th class="r">Disc %</th><th class="r">GST %</th><th class="r">Amount</th><th></th></tr></thead><tbody>' +
        (cart.length ? cart.map(function (l, i) { var lot = lotOf(l), it = svc.item(lot.itemId), net = l.serials.length * PD.num(l.rate) * (1 - PD.num(l.disc) / 100); return '<tr><td><b>' + esc(it.name) + '</b></td><td>' + esc(lot.batchNo) + '</td><td>' + PD.fmtExp(lot.expiry) + '</td><td class="r">' + l.serials.length + '</td><td class="r">' + PD.n2(lot.mrp) + '</td><td class="r"><input type="number" step="any" class="in sm" style="width:90px;text-align:right" data-r="' + i + '" value="' + l.rate + '"></td><td class="r"><input type="number" step="any" class="in sm" style="width:64px;text-align:right" data-d="' + i + '" value="' + (l.disc || '') + '"></td><td class="r">' + (meta.gst ? PD.num(it.tax) : 0) + '</td><td class="r">' + PD.n2(net) + '</td><td class="r"><button class="btn sm" data-x="' + i + '">remove</button></td></tr>'; }).join('') : '<tr><td colspan="10" class="mut" style="padding:16px">Scan strips or search a medicine to start the bill.</td></tr>') + '</tbody></table></div>' +
        '<div class="bd row" style="gap:14px;flex-wrap:wrap;align-items:flex-end"><div class="fld"><label>Payment</label><select class="in" id="spm"><option value="cash"' + (meta.pay === 'cash' ? ' selected' : '') + '>Cash</option><option value="bank"' + (meta.pay === 'bank' ? ' selected' : '') + '>UPI / bank</option><option value="credit"' + (meta.pay === 'credit' ? ' selected' : '') + '>On credit (udhaar)</option></select></div><div class="fld"><label>Received now</label><input type="number" step="any" class="in" id="srv" value="' + (meta.pay === 'credit' ? 0 : (meta.received === '' ? c.total : meta.received)) + '"' + (meta.pay === 'credit' ? ' disabled' : '') + '></div><div class="fld" style="flex:1;min-width:160px"><label>Note</label><input class="in" id="snt" value="' + esc(meta.note) + '"></div>' +
        '<div style="text-align:right"><div class="mut">Taxable ' + PD.n2(c.taxable) + ' + GST ' + PD.n2(c.tax) + '</div><div style="font-size:22px;font-weight:800">' + PD.money(c.total) + '</div><div class="mut">Due on this bill ' + PD.n2(PD.r2(c.total - rec)) + '</div></div><button class="btn p" id="ssv"' + (cart.length ? '' : ' disabled') + '>Save &amp; print bill</button></div></div>';
      if (meta.partyId === 'cashsale' && meta.pay === 'credit') $('#spm', el).title = 'Walk-in buyers should pay now';
      var scn = $('#ssc', el); scn.focus(); wire(scn); hitsDraw();
    }
    function hitsDraw() {
      var h = $('#shits', el); if (!h) return;
      h.innerHTML = hits.length ? '<div class="msgrid" style="max-height:30vh;margin-top:6px;background:#fff"><table class="t"><tbody>' + hits.map(function (it) { return '<tr class="click" data-it="' + it.id + '"><td><b>' + esc(it.name) + '</b> <small class="mut">' + esc(it.generic || '') + '</small></td><td>' + esc(it.rack || '') + '</td><td class="r">stock ' + svc.wStock(it.id) + '</td><td class="r">MRP ' + PD.n2(it.mrp) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '';
    }
    function wire(scn) {
      scn.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return; e.preventDefault(); var v = scn.value; scn.value = ''; if (!v.trim()) return;
        var p = svc.wParse(v);
        if (!p) msg = '<span style="color:#c62828">✖ Not a Medismart strip code</span>';
        else if (!p.lot || p.bad) msg = '<span style="color:#c62828">✖ Unknown strip ' + esc(p.serial) + '</span>';
        else if (p.lot.gone[p.idx]) msg = '<span style="color:#c62828">✖ ' + esc(p.serial) + ' is not in stock</span>';
        else if (taken()[p.serial]) msg = '<span style="color:#c62828">✖ ' + esc(p.serial) + ' is already on the bill</span>';
        else { addLot(p.lot, [p.serial]); msg = '<span style="color:#2e8b57">✔ ' + esc(svc.itemName(p.lot.itemId)) + ' • ' + esc(p.serial) + '</span>'; }
        draw();
      });
      $('#smq', el).addEventListener('input', function () {
        var words = this.value.trim().toLowerCase().split(/\s+/).filter(Boolean); hits = [];
        if (words.length) for (var i = 0; i < D().items.length && hits.length < 30; i++) { var it = D().items[i]; if (it.active === false) continue; var hay = (it.name + ' ' + (it.generic || '')).toLowerCase(); if (words.every(function (w) { return hay.indexOf(w) >= 0; }) && svc.wStock(it.id) > 0) hits.push(it); }
        hitsDraw();
      });
    }
    /* the received box follows the bill total until the user types an amount in it */
    function read(typedReceived) { meta.partyId = $('#sp', el).value; meta.date = $('#sd', el).value || PD.today(); meta.gst = $('#sg', el).checked; meta.pay = $('#spm', el).value; meta.note = $('#snt', el).value; var r = $('#srv', el); if (typedReceived) meta.received = r.disabled ? '' : r.value; }
    PD.on(el, 'change', '#sp,#sd,#sg,#spm,#srv,#snt', function (e, t) { read(t.id === 'srv'); if (t.id === 'spm') meta.received = ''; draw(); });
    PD.on(el, 'change', '[data-r]', function (e, t) { cart[+t.dataset.r].rate = PD.num(t.value); read(); draw(); });
    PD.on(el, 'change', '[data-d]', function (e, t) { cart[+t.dataset.d].disc = PD.num(t.value); read(); draw(); });
    PD.on(el, 'click', '[data-x]', function (e, t) { cart.splice(+t.dataset.x, 1); read(); draw(); });
    PD.on(el, 'click', '#np', function () { read(); partyModal(function (id) { meta.partyId = id; draw(); }); });
    PD.on(el, 'click', '[data-it]', function (e, t) {
      var it = svc.item(t.dataset.it), lots = svc.wLotsOf(it.id);
      var body = '<div class="tw"><table class="t"><thead><tr><th>Batch</th><th>Expiry</th><th class="r">MRP</th><th class="r">Shop price</th><th class="r">In stock</th><th class="r">Sell</th></tr></thead><tbody>' + lots.map(function (l) { var free = svc.wLeft(l) - cart.filter(function (c) { return c.lotId === l.id; }).reduce(function (a, c) { return a + c.serials.length; }, 0); return '<tr><td><b>' + esc(l.batchNo) + '</b></td><td>' + PD.fmtExp(l.expiry) + '</td><td class="r">' + PD.n2(l.mrp) + '</td><td class="r">' + PD.n2(l.sell || l.cost) + '</td><td class="r">' + free + '</td><td class="r"><input type="number" min="0" max="' + free + '" class="in sm" style="width:70px" data-q="' + l.id + '"' + (free > 0 ? '' : ' disabled') + '></td></tr>'; }).join('') + '</tbody></table></div><p class="hint">Earliest expiry is listed first.</p>';
      PD.modal({ title: it.name + ' — choose batch', size: 'lg', body: body, foot: [{ label: 'Cancel' }, { label: 'Add', cls: 'p', fn: function (api) {
        try { var tot = 0, tk2 = taken(); PD.$$('[data-q]', api.body).forEach(function (inp) { var q = Math.floor(PD.num(inp.value)); if (q <= 0) return; var lot = D().lots.find(function (x) { return x.id === inp.dataset.q; }), s = freeSerials(lot, q, tk2); if (s.length < q) throw new Error('Batch ' + lot.batchNo + ' has only ' + s.length + ' free strips'); s.forEach(function (x) { tk2[x] = 1; }); addLot(lot, s); tot += q; });
          if (!tot) throw new Error('Type a quantity against a batch'); hits = []; msg = '<span style="color:#2e8b57">✔ Added ' + tot + ' strips of ' + esc(it.name) + '</span>'; setTimeout(draw, 0);
        } catch (er) { PD.err(er); return false; }
      } }] });
    });
    PD.on(el, 'click', '#ssv', function () {
      try {
        read(); var c = calc(), got = meta.pay === 'credit' ? 0 : (meta.received === '' ? c.total : PD.num(meta.received));
        if (meta.partyId === 'cashsale' && PD.r2(c.total - got) > 0.005) throw new Error('A walk-in sale must be paid in full. Choose a party to keep a balance.');
        var s = svc.wSale({ partyId: meta.partyId, date: meta.date, gst: meta.gst, pay: meta.pay, received: got, note: meta.note, lines: cart.map(function (l) { return { lotId: l.lotId, serials: l.serials, rate: l.rate, disc: l.disc }; }) });
        PD.toast('Bill ' + s.no + ' saved • ' + PD.money(s.total), 'ok'); PD.printHTML(saleHTML(s), 'Bill ' + s.no); cart = []; hits = []; msg = '<span style="color:#2e8b57">✔ Bill ' + esc(s.no) + ' saved</span>'; draw();
      } catch (e) { PD.err(e); }
    });
    draw();
  }
  open();
} };
})();
