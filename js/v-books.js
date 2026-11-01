/* Books & Finance (MargBooks-style extras on top of Accounts): dashboard, cash/bank book, group summary, outstanding ageing with
   credit limit / days, vouchers register with debit / credit notes and contra, cheque (PDC) register, bank reconciliation,
   receipts & payments, monthly P&L with expense analysis, GST reports (HSN, rate, GSTR-3B style), opening balances.
   Everything reads the same vouchers as the Accounts window; nothing here changes how bills, returns or stock are posted. */
(function () {
'use strict';
var PD = window.PD, esc = PD.esc, svc = PD.svc, $ = PD.$;
var MON = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
var BUCKETS = [[0, 30, '0-30'], [31, 60, '31-60'], [61, 90, '61-90'], [91, 120, '91-120'], [121, 99999, '120+']];
function D() { return PD.DB; }
function amt(k, l) { return { k: k, label: l, align: 'r', sum: true, fmt: function (v) { return v ? PD.n2(v) : ''; } }; }
function bold(v) { return '<b>' + esc(v) + '</b>'; }
function accOptions(filter) { return D().accounts.filter(filter || function () { return true; }).sort(function (a, b) { return a.group.localeCompare(b.group) || a.name.localeCompare(b.name); }).map(function (a) { return [a.id, a.group + ' — ' + a.name]; }); }
function partyOptions() { return [['', '— select —']].concat(accOptions(function (a) { return a.group === 'Sundry Debtors' || a.group === 'Sundry Creditors'; })); }
function firstYear() { return D().years.slice().sort(function (a, b) { return a.start.localeCompare(b.start); })[0]; }
function firstOb(acc) { var y = firstYear(); return y && D().openBal[y.id] ? D().openBal[y.id][acc] || 0 : 0; }
function days(d, asOf) { return Math.floor((new Date(asOf + 'T12:00:00') - new Date(d + 'T12:00:00')) / 864e5); }
function netOf(B, id) { return B[id] ? svc.accNet(B[id]) : 0; }
function yearOpts() { return D().years.map(function (y) { return [y.id, y.label + (y.closed ? ' (closed)' : '')]; }); }

/* balance of an account on a date, counting everything since the books began */
function bookBal(acc, to) {
  var b = firstOb(acc);
  D().vouchers.forEach(function (v) { if (to && v.date > to) return; v.lines.forEach(function (l) { if (l.acc === acc) b += l.dr - l.cr; }); });
  return PD.r2(b);
}
/* unpaid bills of a party: invoices (debits of a shop, credits of a supplier) settled oldest-first by payments */
function openBills(acc, kind, asOf) {
  var ent = [], ob = firstOb(acc), fy = firstYear();
  if (ob && fy) ent.push({ d: fy.start, dr: ob > 0 ? ob : 0, cr: ob < 0 ? -ob : 0 });
  D().vouchers.forEach(function (v) { if (asOf && v.date > asOf) return; v.lines.forEach(function (l) { if (l.acc === acc) ent.push({ d: v.date, dr: l.dr, cr: l.cr }); }); });
  ent.sort(function (a, b) { return a.d.localeCompare(b.d); });
  var inv = [], pay = 0;
  ent.forEach(function (e) { var i = kind === 'cus' ? e.dr : e.cr, p = kind === 'cus' ? e.cr : e.dr; if (i > 0) inv.push({ d: e.d, amt: i, left: i }); pay += p; });
  inv.forEach(function (b) { var t = Math.min(b.left, pay); b.left = PD.r2(b.left - t); pay = PD.r2(pay - t); });
  return { open: inv.filter(function (b) { return b.left > 0; }), advance: PD.r2(pay) };
}
function ageRows(kind, asOf) {
  var list = kind === 'sup' ? D().suppliers : D().customers;
  return list.map(function (p) {
    var acc = (kind === 'sup' ? 'sup_' : 'cus_') + p.id, ob = openBills(acc, kind, asOf), r = { id: p.id, acc: acc, name: p.name, kind: kind, days: p.creditDays === '' || p.creditDays == null ? 30 : PD.num(p.creditDays), limit: PD.num(p.creditLimit), advance: ob.advance, bills: ob.open, over: 0, b0: 0, b1: 0, b2: 0, b3: 0, b4: 0, total: 0 };
    ob.open.forEach(function (b) {
      var a = Math.max(0, days(b.d, asOf)); r.total += b.left;
      BUCKETS.forEach(function (k, i) { if (a >= k[0] && a <= k[1]) r['b' + i] += b.left; });
      if (a > r.days) r.over += b.left;
    });
    r.net = PD.r2(r.total - r.advance); r.total = PD.r2(r.total); r.over = PD.r2(r.over);
    for (var i = 0; i < 5; i++) r['b' + i] = PD.r2(r['b' + i]);
    r.flag = kind === 'cus' && r.limit > 0 && r.net > r.limit ? 'Over limit' : (r.over > 0 ? 'Overdue' : '');
    return r;
  }).filter(function (r) { return r.total || r.advance; });
}
function sumLines(from, to, fn) { var t = 0; D().vouchers.forEach(function (v) { if (v.date >= from && v.date <= to) v.lines.forEach(function (l) { t += fn(l, v) || 0; }); }); return PD.r2(t); }
PD.books = { bookBal: bookBal, openBills: openBills, ageRows: ageRows, days: days };

/* outward supplies: one row per bill (or credit note) and GST rate. Bills without GST show rate 0. */
function outward(from, to) {
  var rows = [];
  function add(type, d, no, shopId, g) {
    var c = svc.customer(shopId) || {}, nm = svc.wShop(shopId) ? svc.wShopName(shopId) : svc.cusName(shopId);
    Object.keys(g).forEach(function (r) { var sg = type === 'Credit note' ? -1 : 1, o = g[r]; rows.push({ type: type, date: d, no: no, shop: nm, gstin: c.gstin || '', cls: c.gstin ? 'B2B' : 'Unregistered', gst: o.gst, rate: +r, taxable: PD.r2(sg * o.taxable), tax: PD.r2(sg * o.tax) }); });
  }
  D().wdisp.forEach(function (d) {
    if (!d.bill || d.date < from || d.date > to) return; var g = {};
    d.lines.forEach(function (l) { var r = d.gst ? PD.num(l.tax) : 0, o = g[r] = g[r] || { taxable: 0, tax: 0, gst: !!d.gst }; o.taxable += l.qty * l.rate; o.tax += d.gst ? l.qty * l.rate * r / 100 : 0; });
    add('Invoice', d.date, d.no, d.shopId, g);
  });
  (D().wsales || []).forEach(function (s) {
    var g = {};
    if (s.date >= from && s.date <= to) { s.lines.forEach(function (l) { var r = s.gst ? PD.num(l.tax) : 0, o = g[r] = g[r] || { taxable: 0, tax: 0, gst: !!s.gst }; o.taxable += l.net; o.tax += l.taxAmt || 0; }); add('Invoice', s.date, s.no, s.partyId, g); }
    (s.returns || []).forEach(function (x) { if (x.date < from || x.date > to) return; var h = {}; x.lines.forEach(function (rl) { var l = s.lines[rl.i], r = s.gst ? PD.num(l.tax) : 0, o = h[r] = h[r] || { taxable: 0, tax: 0, gst: !!s.gst }; o.taxable += rl.taxable; o.tax += rl.tax; }); add('Credit note', x.date, x.no, s.partyId, h); });
  });
  D().wret.forEach(function (r) {
    var dt = r.doneOn || r.date; if (r.status !== 'Accepted' || dt < from || dt > to) return; var g = {};
    r.lines.forEach(function (l) { if (!l.credit) return; var rt = l.gst ? PD.num(l.tax) : 0, o = g[rt] = g[rt] || { taxable: 0, tax: 0, gst: !!l.gst }; o.taxable += l.qty * l.rate; o.tax += l.gst ? l.qty * l.rate * rt / 100 : 0; });
    add('Credit note', dt, r.no, r.shopId, g);
  });
  rows.forEach(function (x) { x.cgst = PD.r2(x.tax / 2); x.sgst = PD.r2(x.tax / 2); x.total = PD.r2(x.taxable + x.tax); });
  return rows.sort(function (a, b) { return a.date.localeCompare(b.date); });
}

function showVoucher(v, done) {
  var tot = 0; v.lines.forEach(function (l) { tot += l.dr; });
  var manual = !v.src || v.src.kind === 'manual';
  var rows = v.lines.map(function (l) { return '<tr><td>' + esc(svc.accName(l.acc)) + '</td><td class="r">' + (l.dr ? PD.n2(l.dr) : '') + '</td><td class="r">' + (l.cr ? PD.n2(l.cr) : '') + '</td></tr>'; }).join('');
  var html = '<div class="mut">' + PD.fmtDate(v.date) + ' • ' + esc(v.narr) + '</div><table class="t" style="margin-top:10px"><thead><tr><th>Account</th><th class="r">Debit</th><th class="r">Credit</th></tr></thead><tbody>' + rows + '</tbody></table><div class="hint">' + (manual ? 'Entered by hand: can be deleted.' : 'Posted automatically from a bill, return, payment or stock entry: change it from there.') + '</div>';
  var foot = [{ label: 'Close' }, { label: 'Print', icon: 'print', fn: function () { PD.printHTML('<h2>' + esc(D().shop.name) + '</h2><h3>' + esc(v.type) + ' voucher #' + v.no + '</h3><div>' + PD.fmtDate(v.date) + ' &nbsp; ' + esc(v.narr) + '</div><br><table><thead><tr><th>Account</th><th class="r">Debit</th><th class="r">Credit</th></tr></thead><tbody>' + rows + '</tbody></table>', 'Voucher ' + v.no); return false; } }];
  if (manual) foot.push({ label: 'Delete voucher', cls: 'danger', fn: function () {
    var y = D().years.find(function (x) { return x.id === v.year; });
    if (y && y.closed) { PD.toast('That year is closed', 'err'); return false; }
    PD.confirm('Delete voucher #' + v.no + ' (' + PD.n2(tot) + ')?', 'Delete', true).then(function (ok) {
      if (!ok) return; D().vouchers = D().vouchers.filter(function (x) { return x !== v; });
      (D().cheques || []).forEach(function (c) { if (c.vch === v.id) { c.vch = ''; c.status = 'pending'; } });
      PD.log('Voucher deleted #' + v.no, v.type); PD.save(); PD.toast('Voucher deleted'); if (done) done();
    });
  } });
  PD.modal({ title: 'Voucher ' + v.no + ' • ' + v.type, size: 'md', body: html, foot: foot });
}

/* debit / credit note, contra, cheque forms */
function noteModal(kind, done) {
  var debit = kind === 'debit', f = [{ k: 'party', label: 'Party (shop / supplier)', type: 'select', options: partyOptions, req: true, full: true },
    { k: 'off', label: debit ? 'Credit this account (income / purchase return)' : 'Debit this account (sales return / expense)', type: 'select', options: function () { return accOptions(function (a) { return a.group !== 'Sundry Debtors' && a.group !== 'Sundry Creditors'; }); }, req: true, full: true },
    { k: 'amount', label: 'Amount', type: 'number', req: true }, { k: 'date', label: 'Date', type: 'date', req: true }, { k: 'narr', label: 'Reason / narration', full: true }];
  PD.modal({ title: debit ? 'Debit note (party owes more)' : 'Credit note (party owes less)', size: 'md', body: PD.formHTML(f, { date: PD.today(), off: debit ? 'income' : 'salesret' }) + '<p class="hint">Debit note: party is debited. Credit note: party is credited, e.g. rate difference, discount, short supply, goods returned.</p>',
    foot: [{ label: 'Cancel' }, { label: 'Save', cls: 'p', fn: function (api) {
      try {
        var v = PD.readForm(api.body, f), a = PD.num(v.amount); if (a <= 0) throw new Error('Enter a positive amount');
        var lines = debit ? [{ acc: v.party, dr: a }, { acc: v.off, cr: a }] : [{ acc: v.off, dr: a }, { acc: v.party, cr: a }];
        var vch = svc.manualVoucher(v.date, debit ? 'Debit Note' : 'Credit Note', (v.narr || (debit ? 'Debit note' : 'Credit note')) + ' — ' + svc.accName(v.party), lines);
        PD.toast((debit ? 'Debit' : 'Credit') + ' note #' + vch.no + ' saved', 'ok'); if (done) done();
      } catch (e) { PD.err(e); return false; }
    } }] });
}
function contraModal(done) {
  var bk = function () { return accOptions(function (a) { return a.group === 'Cash' || a.group === 'Bank'; }); };
  var f = [{ k: 'from', label: 'Money goes out of', type: 'select', options: bk, req: true }, { k: 'to', label: 'Money goes into', type: 'select', options: bk, req: true }, { k: 'amount', label: 'Amount', type: 'number', req: true }, { k: 'date', label: 'Date', type: 'date', req: true }, { k: 'narr', label: 'Narration', full: true }];
  PD.modal({ title: 'Contra (cash deposit / withdrawal / transfer)', size: 'md', body: PD.formHTML(f, { date: PD.today(), from: 'cash', to: 'bank' }), foot: [{ label: 'Cancel' }, { label: 'Save', cls: 'p', fn: function (api) {
    try { var v = PD.readForm(api.body, f), a = PD.num(v.amount); if (a <= 0) throw new Error('Enter a positive amount'); if (v.from === v.to) throw new Error('Choose two different accounts');
      var vch = svc.manualVoucher(v.date, 'Contra', v.narr || (svc.accName(v.from) + ' to ' + svc.accName(v.to)), [{ acc: v.to, dr: a }, { acc: v.from, cr: a }]); PD.toast('Contra #' + vch.no + ' saved', 'ok'); if (done) done();
    } catch (e) { PD.err(e); return false; }
  } }] });
}
function chequeModal(done) {
  var f = [{ k: 'dir', label: 'Cheque', type: 'select', options: [['in', 'Received from a shop / party (to deposit)'], ['out', 'Issued to a supplier / party']], full: true }, { k: 'party', label: 'Party', type: 'select', options: partyOptions, req: true, full: true },
    { k: 'no', label: 'Cheque no.', req: true }, { k: 'bank', label: 'Bank' }, { k: 'date', label: 'Cheque date', type: 'date', req: true }, { k: 'amount', label: 'Amount', type: 'number', req: true }, { k: 'note', label: 'Note', full: true }];
  PD.modal({ title: 'Add cheque (post-dated or current)', size: 'md', body: PD.formHTML(f, { dir: 'in', date: PD.today() }), foot: [{ label: 'Cancel' }, { label: 'Save', cls: 'p', fn: function (api) {
    try { var v = PD.readForm(api.body, f); if (v.amount <= 0) throw new Error('Enter a positive amount');
      D().cheques = D().cheques || []; v.id = PD.uid('cq'); v.status = 'pending'; v.on = PD.today(); D().cheques.push(v); PD.log('Cheque added', v.no); PD.save(); PD.toast('Cheque saved', 'ok'); if (done) done();
    } catch (e) { PD.err(e); return false; }
  } }] });
}
function chequeActions(c, done) {
  var sk = c.dir === 'in' ? 'Received' : 'Issued';
  var info = '<table class="t"><tbody><tr><td>Type</td><td>' + sk + '</td></tr><tr><td>Party</td><td>' + esc(svc.accName(c.party)) + '</td></tr><tr><td>Cheque no.</td><td>' + esc(c.no) + ' ' + esc(c.bank || '') + '</td></tr><tr><td>Cheque date</td><td>' + PD.fmtDate(c.date) + '</td></tr><tr><td>Amount</td><td><b>' + PD.n2(c.amount) + '</b></td></tr><tr><td>Status</td><td>' + esc(c.status) + (c.clearedOn ? ' on ' + PD.fmtDate(c.clearedOn) : '') + '</td></tr></tbody></table>';
  var foot = [{ label: 'Close' }];
  if (c.status !== 'cleared') {
    foot.push({ label: 'Delete', cls: 'danger', fn: function () { D().cheques = D().cheques.filter(function (x) { return x !== c; }); PD.save(); PD.toast('Cheque removed'); done(); } });
    if (c.status === 'pending') foot.push({ label: 'Bounced', fn: function () { c.status = 'bounced'; PD.log('Cheque bounced', c.no); PD.save(); PD.toast('Marked bounced', 'err'); done(); } });
    foot.push({ label: 'Mark cleared', cls: 'p', fn: function () {
      PD.modal({ title: 'Cheque cleared in bank', size: 'sm', body: PD.formHTML([{ k: 'date', label: 'Cleared on', type: 'date', req: true }], { date: PD.today() }), foot: [{ label: 'Cancel' }, { label: 'Post', cls: 'p', fn: function (api) {
        try { var d = PD.readForm(api.body, [{ k: 'date', label: 'Cleared on', req: true }]).date;
          var lines = c.dir === 'in' ? [{ acc: 'bank', dr: c.amount }, { acc: c.party, cr: c.amount }] : [{ acc: c.party, dr: c.amount }, { acc: 'bank', cr: c.amount }];
          var v = svc.voucher(d, c.dir === 'in' ? 'Receipt' : 'Payment', 'Cheque ' + c.no + (c.bank ? ' (' + c.bank + ')' : '') + (c.dir === 'in' ? ' from ' : ' to ') + svc.accName(c.party), lines, { kind: 'cheque', id: c.id, no: c.no });
          c.status = 'cleared'; c.clearedOn = d; c.vch = v.id; PD.log('Cheque cleared', c.no); PD.save(); PD.toast('Cheque posted to the bank book', 'ok'); done();
        } catch (e) { PD.err(e); return false; }
      } }] });
    } });
  }
  PD.modal({ title: 'Cheque ' + c.no, size: 'sm', body: info, foot: foot });
}

PD.views.books = { render: function (host, arg) {
  var tab = (arg && arg.tab) || 'dash';
  D().cheques = D().cheques || []; D().bankRec = D().bankRec || {};
  var TABS = [['dash', 'Dashboard'], ['cashbank', 'Cash / Bank book'], ['groupsum', 'Group summary'], ['ageing', 'Outstanding & ageing'], ['vouchers', 'Vouchers & notes'], ['cheques', 'Cheques (PDC)'], ['bankrec', 'Bank reconciliation'], ['cashflow', 'Receipts & payments'], ['monthly', 'Monthly P&L'], ['gst', 'GST reports'], ['analysis', 'Sales / purchase / profit'], ['dayclose', 'Cash day close'], ['audit', 'Audit checks'], ['opening', 'Opening balances']];
  host.innerHTML = '<div class="tabs" id="bt" style="margin-bottom:14px;flex-wrap:wrap">' + TABS.map(function (t) { return '<button data-t="' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div><div id="bc"></div>';
  var bc = $('#bc', host);
  function show(t) { tab = t; PD.$$('#bt button', host).forEach(function (b) { b.classList.toggle('on', b.dataset.t === t); }); bc.innerHTML = ''; var pane = document.createElement('div'); bc.appendChild(pane); ({ dash: dash, cashbank: cashbank, groupsum: groupsum, ageing: ageing, vouchers: vouchers, cheques: cheques, bankrec: bankrec, cashflow: cashflow, monthly: monthly, gst: gst, analysis: analysis, dayclose: dayclose, audit: audit, opening: opening })[t](pane); }
  PD.on($('#bt', host), 'click', 'button', function (e, b) { show(b.dataset.t); });
  function again() { show(tab); }
  function bar(el, html) { el.insertAdjacentHTML('beforeend', '<div class="row" style="margin-bottom:12px;gap:8px;flex-wrap:wrap">' + html + '</div>'); }

  /* ---------- dashboard ---------- */
  function dash(el) {
    var yr = svc.currentYear(), B = svc.balances(yr.id), today = PD.today(), m0 = today.slice(0, 8) + '01';
    var cash = bookBal('cash'), bank = bookBal('bank'), rec = ageRows('cus', today), pay = ageRows('sup', today), P = svc.pnl(yr.id);
    var recT = 0, over = 0, nOver = 0, payT = 0; rec.forEach(function (r) { recT += r.net; over += r.over; if (r.flag) nOver++; }); pay.forEach(function (r) { payT += r.net; });
    var mSales = sumLines(m0, today, function (l) { return l.acc === 'sales' ? l.cr - l.dr : l.acc === 'salesret' ? l.cr - l.dr : 0; });
    var mPur = sumLines(m0, today, function (l) { return l.acc === 'purchase' ? l.dr - l.cr : l.acc === 'purret' ? l.dr - l.cr : 0; });
    var mMargin = svc.wMargin(m0, today).gross, chq = D().cheques.filter(function (c) { return c.status === 'pending' && c.date <= PD.addDays(today, 7); });
    function k(l, v, s, c) { return '<div class="card kpi ' + (c || '') + '"><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="s">' + (s || '') + '</div></div>'; }
    var months = []; for (var i = 5; i >= 0; i--) { var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); months.push(d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2)); }
    var ms = months.map(function (mk) { return Math.max(0, sumLines(mk + '-01', mk + '-31', function (l) { return l.acc === 'sales' || l.acc === 'salesret' ? l.cr - l.dr : 0; })); }), mx = Math.max.apply(null, ms.concat([1]));
    var top = rec.slice().sort(function (a, b) { return b.net - a.net; }).slice(0, 6);
    el.innerHTML = '<div class="grid g4" style="margin-bottom:12px">' + k('Cash in hand', PD.money(cash)) + k('Bank', PD.money(bank)) + k('Receivable from shops', PD.money(recT), nOver + ' shop(s) overdue / over limit', nOver ? 'warn' : '') + k('Payable to suppliers', PD.money(payT)) + '</div>' +
      '<div class="grid g4" style="margin-bottom:12px">' + k('Stock value', PD.money(svc.stockValue()), 'at purchase price') + k('Sales this month', PD.money(mSales), 'Purchases ' + PD.money(mPur)) + k('Margin this month', PD.money(mMargin), 'on shop bills') + k('Net profit FY ' + yr.label, PD.money(P.net), 'overdue ' + PD.money(over), P.net < 0 ? 'bad' : '') + '</div>' +
      '<div class="grid g2"><div class="card"><div class="hd"><h3 style="padding:0;border:0">Sales, last 6 months</h3></div><div class="bd"><div style="display:flex;align-items:flex-end;gap:10px;height:150px">' + ms.map(function (v, i) { return '<div style="flex:1;text-align:center"><div class="mut" style="font-size:11px">' + (v ? PD.n2(v).replace(/\.00$/, '') : '') + '</div><div style="height:' + Math.round(v / mx * 110) + 'px;background:var(--brand);border-radius:5px 5px 0 0;min-height:2px"></div><div class="mut" style="font-size:11px;margin-top:4px">' + MON[(+months[i].slice(5) + 8) % 12] + '</div></div>'; }).join('') + '</div></div></div>' +
      '<div class="card"><div class="hd"><h3 style="padding:0;border:0">Top outstanding shops</h3></div><div class="tw"><table class="t"><tbody>' + (top.length ? top.map(function (r) { return '<tr><td>' + bold(r.name) + (r.flag ? ' <span class="badge ' + (r.flag === 'Over limit' ? 'bad' : 'warn') + '">' + r.flag + '</span>' : '') + '</td><td class="r">' + PD.n2(r.net) + '</td></tr>'; }).join('') : '<tr><td class="mut">No outstanding.</td></tr>') + '</tbody></table></div></div></div>' +
      '<div class="card" style="margin-top:12px"><div class="hd"><h3 style="padding:0;border:0">Cheques due within 7 days</h3></div><div class="tw"><table class="t"><tbody>' + (chq.length ? chq.map(function (c) { return '<tr><td>' + PD.fmtDate(c.date) + '</td><td>' + (c.dir === 'in' ? 'Received' : 'Issued') + '</td><td>' + esc(svc.accName(c.party)) + '</td><td>' + esc(c.no) + '</td><td class="r">' + PD.n2(c.amount) + '</td></tr>'; }).join('') : '<tr><td class="mut">None.</td></tr>') + '</tbody></table></div></div>';
  }

  /* ---------- cash / bank book ---------- */
  function cashbank(el) {
    PD.report(el, { id: 'bkbook', title: 'Cash / Bank book', filters: [{ k: 'acc', label: 'Book', type: 'select', options: function () { return accOptions(function (a) { return a.group === 'Cash' || a.group === 'Bank'; }); }, val: 'cash', w: 220 }, { k: 'from', label: 'From', type: 'date', val: function () { return svc.currentYear().start; } }, { k: 'to', label: 'To', type: 'date', val: PD.today }],
      load: function (f) {
        var bal = bookBal(f.acc, PD.addDays(f.from, -1)), rows = [{ date: f.from, no: '', type: 'Opening', narr: 'Opening balance', pt: '', dr: bal > 0 ? bal : 0, cr: bal < 0 ? -bal : 0, bal: bal }];
        D().vouchers.filter(function (v) { return v.date >= f.from && v.date <= f.to; }).sort(function (a, b) { return a.date.localeCompare(b.date) || a.no - b.no; }).forEach(function (v) {
          v.lines.forEach(function (l) { if (l.acc !== f.acc) return; bal = PD.r2(bal + l.dr - l.cr); rows.push({ id: v.id, date: v.date, no: v.no, type: v.type, narr: v.narr, pt: v.lines.filter(function (x) { return x.acc !== f.acc; }).map(function (x) { return svc.accName(x.acc); }).join(', '), dr: l.dr, cr: l.cr, bal: bal }); });
        });
        return { cols: [{ k: 'date', label: 'Date', fmt: PD.fmtDate }, { k: 'no', label: 'Vch', fmt: function (v) { return v ? '#' + v : ''; } }, { k: 'type', label: 'Type', fmt: function (v) { return '<span class="badge">' + esc(v) + '</span>'; } }, { k: 'pt', label: 'Particulars' }, { k: 'narr', label: 'Narration' }, amt('dr', 'Receipts (in)'), amt('cr', 'Payments (out)'), { k: 'bal', label: 'Balance', align: 'r', fmt: function (v) { return '<b>' + PD.n2(v) + '</b>'; } }], rows: rows, note: 'Closing balance: ' + PD.n2(bal) + '. Click a line for the voucher.' };
      }, drill: function (r, run) { var v = r.id && D().vouchers.find(function (x) { return x.id === r.id; }); if (v) showVoucher(v, run); } });
  }

  /* ---------- group summary ---------- */
  function groupsum(el) {
    PD.report(el, { id: 'grpsum', title: 'Group summary', filters: [{ k: 'year', label: 'Year', type: 'select', options: yearOpts, val: function () { return svc.currentYear().id; } }],
      load: function (f) {
        var B = svc.balances(f.year), g = {};
        D().accounts.forEach(function (a) { var b = B[a.id]; if (!b) return; var o = g[a.group] = g[a.group] || { group: a.group, od: 0, dr: 0, cr: 0, n: 0 }; o.od += b.od - b.oc; o.dr += b.dr; o.cr += b.cr; o.n++; });
        var rows = Object.keys(g).map(function (k) { var o = g[k]; o.od = PD.r2(o.od); o.dr = PD.r2(o.dr); o.cr = PD.r2(o.cr); o.close = PD.r2(o.od + o.dr - o.cr); return o; }).filter(function (o) { return o.od || o.dr || o.cr; }).sort(function (a, b) { return a.group.localeCompare(b.group); });
        return { cols: [{ k: 'group', label: 'Group', fmt: bold }, { k: 'n', label: 'Accounts', align: 'r' }, { k: 'od', label: 'Opening (Dr+ / Cr−)', align: 'r', fmt: PD.n2 }, amt('dr', 'Debit'), amt('cr', 'Credit'), { k: 'close', label: 'Closing (Dr+ / Cr−)', align: 'r', fmt: function (v) { return '<b>' + PD.n2(v) + '</b>'; } }], rows: rows, note: 'Click a group to see its accounts.', B: B };
      }, drill: function (r) {
        var B = svc.balances(el.querySelector('[data-f="year"]').value), list = D().accounts.filter(function (a) { return a.group === r.group && B[a.id]; }).map(function (a) { var b = B[a.id]; return { n: a.name, v: svc.accNet(b) }; }).filter(function (x) { return x.v; }).sort(function (a, b) { return Math.abs(b.v) - Math.abs(a.v); });
        PD.modal({ title: r.group, size: 'md', body: '<table class="t"><tbody>' + list.map(function (x) { return '<tr><td>' + esc(x.n) + '</td><td class="r">' + PD.n2(Math.abs(x.v)) + (x.v > 0 ? ' Dr' : ' Cr') + '</td></tr>'; }).join('') + '</tbody></table>', foot: [{ label: 'Close' }] });
      } });
  }

  /* ---------- outstanding & ageing ---------- */
  function ageing(el) {
    PD.report(el, { id: 'ageing', title: 'Outstanding & ageing (bill-wise, oldest payments first)', filters: [{ k: 'kind', label: 'Show', type: 'select', options: [['cus', 'Receivable (shops)'], ['sup', 'Payable (suppliers)']], val: 'cus', w: 190 }, { k: 'asof', label: 'As on', type: 'date', val: PD.today }],
      load: function (f) {
        var rows = ageRows(f.kind, f.asof);
        return { cols: [{ k: 'name', label: f.kind === 'cus' ? 'Shop' : 'Supplier', fmt: bold }, { k: 'flag', label: 'Status', fmt: function (v) { return v ? '<span class="badge ' + (v === 'Over limit' ? 'bad' : 'warn') + '">' + v + '</span>' : ''; } }, { k: 'limit', label: 'Credit limit', align: 'r', fmt: function (v) { return v ? PD.n2(v) : ''; } }, { k: 'days', label: 'Credit days', align: 'r' }]
          .concat(BUCKETS.map(function (b, i) { return amt('b' + i, b[2] + ' days'); })).concat([amt('advance', 'Advance / on account'), { k: 'net', label: 'Net outstanding', align: 'r', sum: true, fmt: function (v) { return '<b>' + PD.n2(v) + '</b>'; } }, amt('over', 'Overdue')]), rows: rows, note: 'Overdue = bills older than the credit days. Click a party for its open bills and to set credit limit and days.' };
      },
      drill: function (r, run) {
        var asof = el.querySelector('[data-f="asof"]').value, f = [{ k: 'creditLimit', label: 'Credit limit (0 = none)', type: 'number' }, { k: 'creditDays', label: 'Credit days', type: 'number' }, { k: 'phone', label: 'Phone / WhatsApp' }, { k: 'gstin', label: 'GSTIN (for GSTR-1)' }, { k: 'dl', label: 'Drug licence no.' }], rec = r.kind === 'cus' ? svc.customer(r.id) : svc.supplier(r.id);
        var bl = '<table class="t"><thead><tr><th>Bill date</th><th class="r">Age (days)</th><th class="r">Pending</th></tr></thead><tbody>' + r.bills.map(function (b) { return '<tr><td>' + PD.fmtDate(b.d) + '</td><td class="r">' + days(b.d, asof) + '</td><td class="r">' + PD.n2(b.left) + '</td></tr>'; }).join('') + '</tbody></table>';
        var foot = [{ label: 'Close' }, { label: 'Save limit & days', fn: function (api) { var v = PD.readForm(api.body, f); rec.creditLimit = v.creditLimit; rec.creditDays = v.creditDays; rec.phone = v.phone; rec.gstin = String(v.gstin || '').toUpperCase(); rec.dl = v.dl; PD.save(); PD.toast('Saved'); run(); } }];
        if (r.kind === 'cus') foot.push({ label: 'WhatsApp reminder', fn: function (api) {
          var ph = String(PD.readForm(api.body, f).phone || '').replace(/\D/g, ''); if (ph.length === 10) ph = '91' + ph; if (ph.length < 11) { PD.toast('Enter the shop phone number first', 'err'); return false; }
          window.open('https://wa.me/' + ph + '?text=' + encodeURIComponent('Namaste ' + r.name + ', ' + D().shop.name + ' ka aapke paas Rs ' + PD.n2(r.net) + ' baaki hai' + (r.over > 0 ? ' (Rs ' + PD.n2(r.over) + ' due ho chuka hai)' : '') + '. Kripya payment kar dein. Dhanyavaad.'), '_blank'); return false;
        } });
        if (PD.voucherModal) foot.push({ label: r.kind === 'cus' ? 'Receive payment' : 'Pay', cls: 'p', fn: function () { PD.voucherModal(r.kind === 'cus' ? 'receipt' : 'payment', { party: r.id, amount: Math.max(0, r.net) }, run); } });
        PD.modal({ title: r.name, size: 'md', body: '<h4 style="margin:0 0 6px">Open bills</h4>' + (r.bills.length ? bl : '<p class="mut">No pending bills.</p>') + (r.advance ? '<p class="hint">Advance / unadjusted: ' + PD.n2(r.advance) + '</p>' : '') + '<h4 style="margin:14px 0 6px">Credit terms</h4>' + PD.formHTML(f, rec || {}), foot: foot });
      } });
  }

  /* ---------- vouchers & notes ---------- */
  function vouchers(el) {
    bar(el, '<button class="btn p sm" data-n="receipt">Receipt</button><button class="btn p sm" data-n="payment">Payment</button><button class="btn sm" data-n="debit">Debit note</button><button class="btn sm" data-n="credit">Credit note</button><button class="btn sm" data-n="contra">Contra</button><button class="btn sm" data-n="journal">Journal</button>');
    var rh = document.createElement('div'); el.appendChild(rh);
    PD.on(el, 'click', '[data-n]', function (e, t) { var n = t.dataset.n; if (n === 'debit' || n === 'credit') noteModal(n, again); else if (n === 'contra') contraModal(again); else PD.voucherModal(n, null, again); });
    PD.report(rh, { id: 'vchreg', title: 'Voucher register (receipt, payment, notes, contra, journal and all postings)', filters: [{ k: 'from', label: 'From', type: 'date', val: function () { return PD.addDays(PD.today(), -30); } }, { k: 'to', label: 'To', type: 'date', val: PD.today }, { k: 'type', label: 'Type', type: 'select', options: function () { var t = {}; D().vouchers.forEach(function (v) { t[v.type] = 1; }); return [['', 'All types']].concat(Object.keys(t).sort()); } }],
      load: function (f) { return { cols: [{ k: 'date', label: 'Date', fmt: PD.fmtDate }, { k: 'no', label: 'Vch', fmt: function (v) { return '#' + v; } }, { k: 'type', label: 'Type', fmt: function (v) { return '<span class="badge brand">' + esc(v) + '</span>'; } }, { k: 'narr', label: 'Narration' }, { k: 'accs', label: 'Accounts' }, amt('amount', 'Amount')],
        rows: D().vouchers.filter(function (v) { return v.date >= f.from && v.date <= f.to && (!f.type || v.type === f.type); }).sort(function (a, b) { return b.date.localeCompare(a.date) || b.no - a.no; }).map(function (v) { var t = 0; v.lines.forEach(function (l) { t += l.dr; }); return { id: v.id, date: v.date, no: v.no, type: v.type, narr: v.narr, accs: v.lines.map(function (l) { return svc.accName(l.acc); }).join(' / '), amount: PD.r2(t) }; }) }; },
      drill: function (r, run) { var v = D().vouchers.find(function (x) { return x.id === r.id; }); if (v) showVoucher(v, run); } });
  }

  /* ---------- cheques ---------- */
  function cheques(el) {
    bar(el, '<button class="btn p sm" id="nc">Add cheque</button>'); $('#nc', el).onclick = function () { chequeModal(again); };
    var rh = document.createElement('div'); el.appendChild(rh);
    PD.report(rh, { id: 'cheques', title: 'Cheque register (post-dated cheques)', filters: [{ k: 'status', label: 'Status', type: 'select', options: [['pending', 'Pending'], ['cleared', 'Cleared'], ['bounced', 'Bounced'], ['', 'All']], val: 'pending' }, { k: 'dir', label: 'Type', type: 'select', options: [['', 'All'], ['in', 'Received'], ['out', 'Issued']] }],
      load: function (f) { var t = PD.today(); return { cols: [{ k: 'date', label: 'Cheque date', fmt: PD.fmtDate }, { k: 'dir', label: 'Type', fmt: function (v) { return v === 'in' ? '<span class="badge ok">Received</span>' : '<span class="badge info">Issued</span>'; } }, { k: 'pn', label: 'Party', fmt: bold }, { k: 'no', label: 'Cheque no.' }, { k: 'bank', label: 'Bank' }, amt('amount', 'Amount'), { k: 'status', label: 'Status', fmt: function (v, r) { return v === 'pending' && r.date <= t ? '<span class="badge warn">due</span>' : '<span class="badge ' + (v === 'cleared' ? 'ok' : v === 'bounced' ? 'bad' : '') + '">' + esc(v) + '</span>'; } }],
        rows: D().cheques.filter(function (c) { return (!f.status || c.status === f.status) && (!f.dir || c.dir === f.dir); }).sort(function (a, b) { return a.date.localeCompare(b.date); }).map(function (c) { return Object.assign({ pn: svc.accName(c.party) }, c); }), note: 'Click a cheque to mark it cleared (posts to the bank book), bounced or delete it.' }; },
      drill: function (r, run) { chequeActions(D().cheques.find(function (c) { return c.id === r.id; }), function () { run(); }); } });
  }

  /* ---------- bank reconciliation ---------- */
  function bankrec(el) {
    var st = { acc: 'bank', to: PD.today(), only: 'unc' }, rec = D().bankRec;
    function draw() {
      var lines = [], bal = bookBal(st.acc, st.to), ud = 0, uc = 0;
      D().vouchers.slice().sort(function (a, b) { return a.date.localeCompare(b.date) || a.no - b.no; }).forEach(function (v) {
        if (v.date > st.to) return;
        v.lines.forEach(function (l, i) { if (l.acc !== st.acc) return; var key = v.id + ':' + i, cd = rec[key] || '', clear = cd && cd <= st.to; if (!clear) { ud += l.dr; uc += l.cr; } lines.push({ key: key, v: v, l: l, cd: cd, clear: clear }); });
      });
      var show = lines.filter(function (x) { return st.only === 'all' || !x.clear; });
      el.innerHTML = '<div class="card"><div class="hd"><h3 style="padding:0;border:0">Bank reconciliation</h3></div><div class="bd row" style="gap:12px;flex-wrap:wrap"><div class="fld"><label>Bank account</label><select class="in sm" id="ba">' + accOptions(function (a) { return a.group === 'Bank'; }).map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === st.acc ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></div><div class="fld"><label>As on</label><input type="date" class="in sm" id="bt2" value="' + st.to + '"></div><div class="fld"><label>Show</label><select class="in sm" id="bo"><option value="unc"' + (st.only === 'unc' ? ' selected' : '') + '>Uncleared only</option><option value="all"' + (st.only === 'all' ? ' selected' : '') + '>All entries</option></select></div></div>' +
        '<div class="grid g4" style="padding:0 18px 12px"><div class="kpi card"><div class="l">Balance as per books</div><div class="v">' + PD.n2(bal) + '</div></div><div class="kpi card"><div class="l">Deposits not yet in bank</div><div class="v">' + PD.n2(ud) + '</div></div><div class="kpi card"><div class="l">Payments not yet cleared</div><div class="v">' + PD.n2(uc) + '</div></div><div class="kpi card info"><div class="l">Balance as per bank</div><div class="v">' + PD.n2(PD.r2(bal - ud + uc)) + '</div><div class="s">should match the bank statement</div></div></div>' +
        '<div class="tw"><table class="t"><thead><tr><th>Date</th><th>Vch</th><th>Type</th><th>Narration</th><th class="r">Deposit</th><th class="r">Withdrawal</th><th>Bank date</th><th></th></tr></thead><tbody>' + (show.length ? show.map(function (x) { return '<tr><td>' + PD.fmtDate(x.v.date) + '</td><td>#' + x.v.no + '</td><td>' + esc(x.v.type) + '</td><td>' + esc(x.v.narr) + '</td><td class="r">' + (x.l.dr ? PD.n2(x.l.dr) : '') + '</td><td class="r">' + (x.l.cr ? PD.n2(x.l.cr) : '') + '</td><td><input type="date" class="in sm" data-k2="' + x.key + '" value="' + x.cd + '"></td><td>' + (x.cd ? '<button class="btn sm" data-u="' + x.key + '">Undo</button>' : '<button class="btn sm p" data-c="' + x.key + '|' + x.v.date + '">Cleared</button>') + '</td></tr>'; }).join('') : '<tr><td colspan="8" class="mut" style="padding:14px">Nothing to show.</td></tr>') + '</tbody></table></div><div class="hint" style="padding:8px 18px">Enter the date the bank passed each entry (or press Cleared for the voucher date). The opening balance is taken as already cleared.</div></div>';
      $('#ba', el).onchange = function () { st.acc = this.value; draw(); }; $('#bt2', el).onchange = function () { st.to = this.value || PD.today(); draw(); }; $('#bo', el).onchange = function () { st.only = this.value; draw(); };
    }
    PD.on(el, 'change', '[data-k2]', function (e, t) { if (t.value) rec[t.dataset.k2] = t.value; else delete rec[t.dataset.k2]; PD.save(); draw(); });
    PD.on(el, 'click', '[data-c]', function (e, t) { var p = t.dataset.c.split('|'); rec[p[0]] = p[1]; PD.save(); draw(); });
    PD.on(el, 'click', '[data-u]', function (e, t) { delete rec[t.dataset.u]; PD.save(); draw(); });
    draw();
  }

  /* ---------- receipts & payments ---------- */
  function cashflow(el) {
    PD.report(el, { id: 'rcpay', title: 'Receipts & payments (cash and bank)', filters: [{ k: 'mode', label: 'Accounts', type: 'select', options: [['both', 'Cash + bank'], ['cash', 'Cash only'], ['bank', 'Bank only']], val: 'both' }, { k: 'from', label: 'From', type: 'date', val: function () { return svc.currentYear().start; } }, { k: 'to', label: 'To', type: 'date', val: PD.today }],
      load: function (f) {
        var set = f.mode === 'both' ? ['cash', 'bank'] : [f.mode], op = 0, rcv = {}, pay = {}, cl;
        set.forEach(function (a) { op += bookBal(a, PD.addDays(f.from, -1)); });
        D().vouchers.forEach(function (v) {
          if (v.date < f.from || v.date > f.to) return;
          var inSet = v.lines.filter(function (l) { return set.indexOf(l.acc) >= 0; }); if (!inSet.length) return;
          var net = 0; inSet.forEach(function (l) { net += l.dr - l.cr; }); if (!net) return;
          v.lines.forEach(function (l) { if (set.indexOf(l.acc) >= 0) return; var d = l.cr - l.dr; if (!d) return; var nm = svc.accName(l.acc); if (d > 0) rcv[nm] = (rcv[nm] || 0) + d; else pay[nm] = (pay[nm] || 0) - d; });
        });
        var rows = [{ s: 'Opening balance', name: 'Cash / bank brought forward', rc: op, py: 0, o: 0 }], tr = 0, tp = 0;
        Object.keys(rcv).sort().forEach(function (k) { rows.push({ s: 'Receipts', name: k, rc: PD.r2(rcv[k]), py: 0, o: 1 }); tr += rcv[k]; });
        Object.keys(pay).sort().forEach(function (k) { rows.push({ s: 'Payments', name: k, rc: 0, py: PD.r2(pay[k]), o: 2 }); tp += pay[k]; });
        cl = PD.r2(op + tr - tp); rows.push({ s: 'Closing balance', name: 'Cash / bank carried forward', rc: 0, py: cl, o: 3 });
        return { cols: [{ k: 's', label: 'Section', fmt: function (v) { return '<span class="badge">' + v + '</span>'; } }, { k: 'name', label: 'Account', fmt: bold }, amt('rc', 'Receipts'), amt('py', 'Payments')], rows: rows, note: 'Receipts side = opening + receipts. Payments side = payments + closing. Both totals match.' };
      } });
  }

  /* ---------- monthly P&L & expense heads ---------- */
  function monthly(el) {
    var rh = document.createElement('div'), rh2 = document.createElement('div'); rh2.style.marginTop = '14px'; el.appendChild(rh); el.appendChild(rh2);
    function months(yid) { var y = D().years.find(function (x) { return x.id === yid; }), sy = +y.start.slice(0, 4); return MON.map(function (m, i) { var d = new Date(sy, 3 + i, 1), k = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); return { label: m + ' ' + k.slice(2, 4), key: k }; }); }
    function accMap() { var m = {}; D().accounts.forEach(function (a) { m[a.id] = a; }); return m; }
    PD.report(rh, { id: 'mpnl', title: 'Month-wise sales, purchases and expenses', filters: [{ k: 'year', label: 'Year', type: 'select', options: yearOpts, val: function () { return svc.currentYear().id; } }],
      load: function (f) {
        var am = accMap(), ms = months(f.year), rows = ms.map(function (m) { return { label: m.label, key: m.key, sales: 0, sret: 0, pur: 0, pret: 0, exp: 0, inc: 0 }; }), ix = {}; rows.forEach(function (r, i) { ix[r.key] = i; });
        D().vouchers.forEach(function (v) { if (v.year !== f.year) return; var r = rows[ix[v.date.slice(0, 7)]]; if (!r) return; v.lines.forEach(function (l) { var a = am[l.acc]; if (!a) return;
          if (l.acc === 'sales') r.sales += l.cr - l.dr; else if (l.acc === 'salesret') r.sret += l.dr - l.cr; else if (l.acc === 'purchase') r.pur += l.dr - l.cr; else if (l.acc === 'purret') r.pret += l.cr - l.dr;
          else if (a.group === 'Indirect Expense' || a.group === 'Direct Expense') r.exp += l.dr - l.cr; else if (a.group === 'Indirect Income') r.inc += l.cr - l.dr; }); });
        rows.forEach(function (r) { var d0 = r.key + '-01'; r.margin = svc.wMargin(d0, r.key + '-31').gross; ['sales', 'sret', 'pur', 'pret', 'exp', 'inc'].forEach(function (k) { r[k] = PD.r2(r[k]); }); r.net = PD.r2(r.sales - r.sret - r.pur + r.pret - r.exp + r.inc); });
        return { cols: [{ k: 'label', label: 'Month', fmt: bold }, amt('sales', 'Sales'), amt('sret', 'Sales returns'), amt('pur', 'Purchases'), amt('pret', 'Purchase returns'), amt('margin', 'Margin on shop bills'), amt('exp', 'Expenses'), amt('inc', 'Other income'), amt('net', 'Result before stock change')], rows: rows, note: 'Result before stock change = sales − returns − purchases + purchase returns − expenses + income. The Accounts window shows profit after closing stock.' };
      } });
    PD.report(rh2, { id: 'mexp', title: 'Expense analysis (head × month)', filters: [{ k: 'year', label: 'Year', type: 'select', options: yearOpts, val: function () { return svc.currentYear().id; } }],
      load: function (f) {
        var ms = months(f.year), ix = {}; ms.forEach(function (m, i) { ix[m.key] = i; }); var rows = {};
        D().vouchers.forEach(function (v) { if (v.year !== f.year) return; var i = ix[v.date.slice(0, 7)]; v.lines.forEach(function (l) { var a = svc.acc(l.acc); if (!a || (a.group !== 'Indirect Expense' && a.group !== 'Direct Expense')) return; var r = rows[a.id] = rows[a.id] || { name: a.name, total: 0 }; r['m' + i] = (r['m' + i] || 0) + l.dr - l.cr; r.total += l.dr - l.cr; }); });
        return { cols: [{ k: 'name', label: 'Expense head', fmt: bold }].concat(ms.map(function (m, i) { return amt('m' + i, m.label); })).concat([amt('total', 'Total')]), rows: Object.keys(rows).map(function (k) { return rows[k]; }).sort(function (a, b) { return b.total - a.total; }) };
      } });
  }

  /* ---------- GST reports (from supplier bills entered in Add Stock) ---------- */
  function gst(el) {
    PD.report(el, { id: 'gstrep', title: 'GST reports', filters: [{ k: 'kind', label: 'Report', type: 'select', w: 230, options: [['3b', 'GSTR-3B style summary'], ['gstr1', 'GSTR-1 style: outward invoices & credit notes'], ['hsnout', 'HSN-wise outward summary'], ['rate', 'Rate-wise summary (purchases)'], ['hsn', 'HSN-wise summary'], ['month', 'Month-wise tax'], ['reg', 'Purchase register (GSTR-2 style)']], val: '3b' }, { k: 'from', label: 'From', type: 'date', val: function () { return svc.currentYear().start; } }, { k: 'to', label: 'To', type: 'date', val: PD.today }],
      load: function (f) {
        var lots = D().lots.filter(function (l) { return l.date >= f.from && l.date <= f.to; }), half = function (v) { return PD.r2((v || 0) / 2); };
        function grp(keyFn, labelFn) { var g = {}; lots.forEach(function (l) { var k = keyFn(l), o = g[k] = g[k] || { k: k, name: labelFn(l), qty: 0, taxable: 0, tax: 0 }; o.qty += l.n || 0; o.taxable += l.taxable || 0; o.tax += l.taxAmt || 0; }); return Object.keys(g).sort().map(function (k) { var o = g[k]; o.taxable = PD.r2(o.taxable); o.tax = PD.r2(o.tax); o.cgst = half(o.tax); o.sgst = half(o.tax); o.total = PD.r2(o.taxable + o.tax); return o; }); }
        var tcols = [amt('qty', 'Strips'), amt('taxable', 'Taxable value'), amt('cgst', 'CGST'), amt('sgst', 'SGST'), amt('tax', 'Total tax'), amt('total', 'Invoice value')], rows;
        var OC = [amt('taxable', 'Taxable value'), amt('cgst', 'CGST'), amt('sgst', 'SGST'), amt('total', 'Invoice value')];
        if (f.kind === 'gstr1') return { cols: [{ k: 'type', label: 'Type', fmt: function (v) { return '<span class="badge ' + (v === 'Invoice' ? 'brand' : 'warn') + '">' + v + '</span>'; } }, { k: 'date', label: 'Date', fmt: PD.fmtDate }, { k: 'no', label: 'No.' }, { k: 'shop', label: 'Shop', fmt: bold }, { k: 'gstin', label: 'GSTIN' }, { k: 'cls', label: 'Class' }, { k: 'rate', label: 'Rate %', align: 'r' }].concat(OC), rows: outward(f.from, f.to), note: 'Credit notes are the accepted returns of billed stock (shown negative). Set each shop\'s GSTIN under Outstanding & ageing → click the shop.' };
        if (f.kind === 'hsnout') {
          var hg = {}; D().wdisp.forEach(function (d) { if (!d.bill || d.date < f.from || d.date > f.to) return; d.lines.forEach(function (l) { var it = svc.item(l.itemId) || {}, rt = d.gst ? PD.num(l.tax) : 0, k = (it.hsn || '') + '|' + rt, o = hg[k] = hg[k] || { name: (it.hsn || 'No HSN') + ' @ ' + rt + '%', qty: 0, taxable: 0, tax: 0 }; o.qty += l.qty; o.taxable += l.qty * l.rate; o.tax += d.gst ? l.qty * l.rate * rt / 100 : 0; }); });
          (D().wsales || []).forEach(function (s) { if (s.date < f.from || s.date > f.to) return; s.lines.forEach(function (l) { var rt = s.gst ? PD.num(l.tax) : 0, k = (l.hsn || '') + '|' + rt, o = hg[k] = hg[k] || { name: (l.hsn || 'No HSN') + ' @ ' + rt + '%', qty: 0, taxable: 0, tax: 0 }; o.qty += l.qty; o.taxable += l.net; o.tax += l.taxAmt || 0; }); });
          return { cols: [{ k: 'name', label: 'HSN / rate', fmt: bold }, amt('qty', 'Strips')].concat(OC), rows: Object.keys(hg).sort().map(function (k) { var o = hg[k]; o.taxable = PD.r2(o.taxable); o.cgst = PD.r2(o.tax / 2); o.sgst = PD.r2(o.tax / 2); o.total = PD.r2(o.taxable + o.tax); return o; }) };
        }
        if (f.kind === 'rate') return { cols: [{ k: 'name', label: 'GST rate', fmt: bold }].concat(tcols), rows: grp(function (l) { return l.tax || 0; }, function (l) { return (l.tax || 0) + '%'; }), note: 'Intra-state supplies assumed: tax split half CGST, half SGST.' };
        if (f.kind === 'hsn') return { cols: [{ k: 'name', label: 'HSN / rate', fmt: bold }].concat(tcols), rows: grp(function (l) { return (l.hsn || '—') + '|' + (l.tax || 0); }, function (l) { return (l.hsn || 'No HSN') + ' @ ' + (l.tax || 0) + '%'; }) };
        if (f.kind === 'month') return { cols: [{ k: 'name', label: 'Month', fmt: bold }].concat(tcols), rows: grp(function (l) { return l.date.slice(0, 7); }, function (l) { return l.date.slice(0, 7); }) };
        if (f.kind === 'reg') {
          rows = lots.map(function (l) { return { date: l.date, sup: l.supplier || (l.supplierId ? svc.supName(l.supplierId) : ''), bill: l.bill || '', item: svc.itemName(l.itemId), hsn: l.hsn || '', rate: l.tax || 0, taxable: l.taxable || 0, cgst: half(l.taxAmt), sgst: half(l.taxAmt), total: PD.r2((l.taxable || 0) + (l.taxAmt || 0)) }; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
          return { cols: [{ k: 'date', label: 'Date', fmt: PD.fmtDate }, { k: 'sup', label: 'Supplier' }, { k: 'bill', label: 'Bill no.' }, { k: 'item', label: 'Medicine' }, { k: 'hsn', label: 'HSN' }, { k: 'rate', label: 'Rate %', align: 'r' }, amt('taxable', 'Taxable'), amt('cgst', 'CGST'), amt('sgst', 'SGST'), amt('total', 'Value')], rows: rows };
        }
        var t = grp(function () { return 'all'; }, function () { return ''; })[0] || { taxable: 0, tax: 0, cgst: 0, sgst: 0 };
        var ow = outward(f.from, f.to), oa = { taxable: 0, tax: 0 }, onil = 0; ow.forEach(function (x) { if (x.gst) { oa.taxable += x.taxable; oa.tax += x.tax; } else onil += x.taxable; });
        var outLed = sumLines(f.from, f.to, function (l) { return l.acc === 'outtax' ? l.cr - l.dr : 0; }), led = sumLines(f.from, f.to, function (l) { return l.acc === 'intax' ? l.dr - l.cr : 0; });
        rows = [{ sec: '3.1(a)', d: 'Outward taxable supplies (shop bills with GST, net of credit notes)', taxable: PD.r2(oa.taxable), cgst: PD.r2(oa.tax / 2), sgst: PD.r2(oa.tax / 2), igst: 0 }, { sec: '3.1(c)', d: 'Other outward supplies, nil rated / exempt (shop bills without GST, net of returns)', taxable: PD.r2(onil), cgst: 0, sgst: 0, igst: 0 }, { sec: '4(A)(5)', d: 'ITC available: all other ITC (inward supplies from suppliers)', taxable: t.taxable, cgst: t.cgst, sgst: t.sgst, igst: 0 }, { sec: '4(B)', d: 'ITC reversed', taxable: 0, cgst: 0, sgst: 0, igst: 0 }, { sec: '4(C)', d: 'Net ITC available', taxable: t.taxable, cgst: t.cgst, sgst: t.sgst, igst: 0 }, { sec: '', d: 'Output GST in the books for the period (check)', taxable: 0, cgst: half(outLed), sgst: half(outLed), igst: 0 }, { sec: '', d: 'Input GST in the books for the period (check)', taxable: 0, cgst: half(led), sgst: half(led), igst: 0 }];
        return { cols: [{ k: 'sec', label: 'Table' }, { k: 'd', label: 'Description', fmt: bold }, amt('taxable', 'Taxable value'), amt('igst', 'IGST'), amt('cgst', 'CGST'), amt('sgst', 'SGST')], rows: rows, note: 'Helper for filing. Outward = shop bills (GST only on bills made after Settings → Charge GST on bills was turned on). Inward = Add Stock bills. All supplies treated as within the state (CGST + SGST).' };
      } });
  }

  /* ---------- opening balances ---------- */
  function opening(el) {
    var fy = firstYear(), ob = D().openBal[fy.id] = D().openBal[fy.id] || {};
    if (fy.closed) { el.innerHTML = '<div class="card"><div class="bd">The first financial year (' + fy.label + ') is closed, so opening balances are fixed. Re-open it under Accounts → Year closing to change them.</div></div>'; return; }
    var list = D().accounts.filter(function (a) { return a.id !== 'capital' && a.id !== 'openstock' && a.id !== 'roundoff' && (a.nat === 'A' || a.nat === 'L' || a.party); }).sort(function (a, b) { return a.group.localeCompare(b.group) || a.name.localeCompare(b.name); });
    el.innerHTML = '<div class="card"><div class="hd"><h3 style="padding:0;border:0">Opening balances — FY ' + fy.label + '</h3><span class="sp"></span><button class="btn p sm" id="obs">Save balances</button></div><div class="bd"><input class="in sm" id="obq" placeholder="search account..." style="max-width:260px"><div class="hint">Enter what each shop owes you (debit) and what you owe suppliers (credit), plus cash and bank. Capital is adjusted by itself so the trial balance stays equal. Stock is already booked as opening stock.</div></div><div class="tw"><table class="t"><thead><tr><th>Account</th><th>Group</th><th class="r">Debit</th><th class="r">Credit</th></tr></thead><tbody id="obb">' +
      list.map(function (a) { var v = ob[a.id] || 0; return '<tr data-nm="' + esc(a.name.toLowerCase()) + '"><td>' + bold(a.name) + '</td><td>' + esc(a.group) + '</td><td class="r"><input type="number" step="any" class="in sm" style="width:130px;text-align:right" data-a="' + a.id + '" data-s="dr" value="' + (v > 0 ? v : '') + '"></td><td class="r"><input type="number" step="any" class="in sm" style="width:130px;text-align:right" data-a="' + a.id + '" data-s="cr" value="' + (v < 0 ? -v : '') + '"></td></tr>'; }).join('') + '</tbody></table></div></div>';
    $('#obq', el).oninput = function () { var q = this.value.toLowerCase(); PD.$$('#obb tr', el).forEach(function (r) { r.style.display = r.dataset.nm.indexOf(q) >= 0 ? '' : 'none'; }); };
    $('#obs', el).onclick = function () {
      var vals = {}; PD.$$('input[data-a]', el).forEach(function (i) { var a = i.dataset.a; vals[a] = vals[a] || { dr: 0, cr: 0 }; vals[a][i.dataset.s] = PD.num(i.value); });
      Object.keys(vals).forEach(function (a) { var n = PD.r2(vals[a].dr - vals[a].cr); if (n) ob[a] = n; else delete ob[a]; });
      var s = 0; Object.keys(ob).forEach(function (a) { if (a !== 'capital') s += ob[a]; }); s = PD.r2(-s); if (s) ob.capital = s; else delete ob.capital;
      PD.log('Opening balances saved', fy.label); PD.save(); PD.toast('Opening balances saved. Capital set to ' + PD.n2(Math.abs(s)) + (s < 0 ? ' Dr' : ' Cr'), 'ok');
    };
  }

  /* ---------- shop-wise sales, supplier-wise purchases, item-wise gross profit ---------- */
  function avgCost(itemId) { var q = 0, c = 0; D().wdisp.forEach(function (d) { if (!d.bill) return; d.lines.forEach(function (l) { if (l.itemId === itemId) { q += l.qty; c += l.qty * (l.cost || 0); } }); }); return q ? c / q : 0; }
  function retCost(l) {
    if (l.outcome !== 'stock') return 0; var c = 0, n = 0;
    (l.serials || []).forEach(function (sr) { var p = svc.wParse(sr); if (p && p.lot) { c += p.lot.cost || 0; n++; } });
    return PD.r2(c + Math.max(0, l.qty - n) * avgCost(l.itemId));
  }
  function analysis(el) {
    PD.report(el, { id: 'anal', title: 'Sales, purchase and profit analysis', filters: [{ k: 'kind', label: 'Report', type: 'select', w: 250, options: [['shop', 'Shop / party-wise sales & margin'], ['item', 'Medicine-wise sales & gross profit'], ['sup', 'Supplier-wise purchases']], val: 'shop' }, { k: 'from', label: 'From', type: 'date', val: function () { return svc.currentYear().start; } }, { k: 'to', label: 'To', type: 'date', val: PD.today }],
      load: function (f) {
        var g = {}, rows;
        function row(k, name) { return g[k] = g[k] || { name: name, qty: 0, sales: 0, ret: 0, cost: 0, retCost: 0, bills: 0 }; }
        if (f.kind === 'sup') {
          D().lots.forEach(function (l) { if (l.date < f.from || l.date > f.to) return; var nm = l.supplier || (l.supplierId ? svc.supName(l.supplierId) : '(direct / cash)'), o = g[nm] = g[nm] || { name: nm, lots: 0, qty: 0, val: 0 }; o.lots++; o.qty += l.n || 0; o.val += l.taxable != null ? (l.taxable || 0) + (l.taxAmt || 0) : (l.cost || 0) * (l.n || 0); });
          rows = Object.keys(g).map(function (k) { g[k].val = PD.r2(g[k].val); return g[k]; }).sort(function (a, b) { return b.val - a.val; });
          return { cols: [{ k: 'name', label: 'Supplier', fmt: bold }, { k: 'lots', label: 'Lots', align: 'r' }, { k: 'qty', label: 'Strips', align: 'r' }, amt('val', 'Purchase value (incl. GST)')], rows: rows };
        }
        D().wdisp.forEach(function (d) { if (!d.bill || d.date < f.from || d.date > f.to) return; d.lines.forEach(function (l) { var k = f.kind === 'shop' ? d.shopId : l.itemId, o = row(k, f.kind === 'shop' ? svc.wShopName(d.shopId) : svc.itemName(l.itemId)); o.qty += l.qty; o.sales += l.qty * l.rate; o.cost += l.qty * (l.cost || 0); }); if (f.kind === 'shop') row(d.shopId, svc.wShopName(d.shopId)).bills++; });
        (D().wsales || []).forEach(function (s) { if (s.date < f.from || s.date > f.to) return; if (f.kind === 'shop') row('p' + s.partyId, svc.cusName(s.partyId)).bills++; s.lines.forEach(function (l) { var k = f.kind === 'shop' ? 'p' + s.partyId : l.itemId, o = row(k, f.kind === 'shop' ? svc.cusName(s.partyId) : svc.itemName(l.itemId)); o.qty += l.qty; o.sales += l.net; o.cost += l.qty * (l.cost || 0); }); (s.returns || []).forEach(function (x) { if (x.date < f.from || x.date > f.to) return; x.lines.forEach(function (rl) { var l = s.lines[rl.i], k = f.kind === 'shop' ? 'p' + s.partyId : l.itemId, o = row(k, f.kind === 'shop' ? svc.cusName(s.partyId) : svc.itemName(l.itemId)); o.ret += rl.taxable; o.retCost += rl.qty * (l.cost || 0); }); }); });
        D().wret.forEach(function (r) { var dt = r.doneOn || r.date; if (r.status !== 'Accepted' || dt < f.from || dt > f.to) return; r.lines.forEach(function (l) { if (!l.credit) return; var k = f.kind === 'shop' ? r.shopId : l.itemId, o = row(k, f.kind === 'shop' ? svc.wShopName(r.shopId) : svc.itemName(l.itemId)); o.ret += l.qty * l.rate; o.retCost += retCost(l); }); });
        rows = Object.keys(g).map(function (k) { var o = g[k]; o.sales = PD.r2(o.sales); o.ret = PD.r2(o.ret); o.cost = PD.r2(o.cost); o.retCost = PD.r2(o.retCost); o.net = PD.r2(o.sales - o.ret); o.margin = PD.r2(o.sales - o.ret - (o.cost - o.retCost)); o.pct = o.net ? PD.r2(o.margin * 100 / o.net) : 0; return o; }).sort(function (a, b) { return b.net - a.net; });
        return { cols: [{ k: 'name', label: f.kind === 'shop' ? 'Shop / party' : 'Medicine', fmt: bold }].concat(f.kind === 'shop' ? [{ k: 'bills', label: 'Bills', align: 'r' }] : []).concat([{ k: 'qty', label: 'Strips sent', align: 'r' }, amt('sales', 'Sales'), amt('ret', 'Returns'), amt('net', 'Net sales'), amt('margin', 'Gross profit'), { k: 'pct', label: 'Margin %', align: 'r', fmt: function (v) { return v ? v + '%' : ''; } }]), rows: rows, note: 'Gross profit = net sales minus the purchase cost of the strips sent (stock that came back is not counted as cost).' };
      } });
  }

  /* ---------- cash day close: count the drawer, post the difference ---------- */
  function dayclose(el) {
    D().dayClose = D().dayClose || []; var NOTES = [500, 200, 100, 50, 20, 10, 5, 2, 1];
    el.innerHTML = '<div class="grid g2"><div class="card"><div class="hd"><h3 style="padding:0;border:0">Close the day</h3></div><div class="bd"><div class="form"><div class="fld"><label>Date</label><input type="date" class="in" id="dcd" value="' + PD.today() + '"></div><div class="fld"><label>Cash as per books</label><input class="in" id="dcb" readonly></div></div>' +
      '<table class="t" style="margin-top:10px"><thead><tr><th>Note / coin</th><th class="r">Count</th><th class="r">Amount</th></tr></thead><tbody>' + NOTES.map(function (n) { return '<tr><td>₹ ' + n + '</td><td class="r"><input type="number" min="0" class="in sm" style="width:90px;text-align:right" data-dn="' + n + '"></td><td class="r" data-da="' + n + '">0.00</td></tr>'; }).join('') + '</tbody></table>' +
      '<div class="form" style="margin-top:10px"><div class="fld"><label>Cash counted</label><input class="in" id="dcc" readonly></div><div class="fld"><label>Difference (counted − books)</label><input class="in" id="dcx" readonly></div><div class="fld full"><label>Note</label><input class="in" id="dcn"></div><div class="fld full"><label class="chk"><input type="checkbox" id="dcp" checked> Post the difference (shortage as expense, excess as other income)</label></div></div></div><div class="hd" style="border-top:1px solid var(--line)"><span class="sp"></span><button class="btn p" id="dcs">Save day close</button></div></div><div id="dch"></div></div>';
    function calc() { var t = 0; NOTES.forEach(function (n) { var c = PD.num($('[data-dn="' + n + '"]', el).value); t += c * n; $('[data-da="' + n + '"]', el).textContent = PD.n2(c * n); }); var b = bookBal('cash', $('#dcd', el).value); $('#dcb', el).value = PD.n2(b); $('#dcc', el).value = PD.n2(t); $('#dcx', el).value = PD.n2(t - b); return { t: PD.r2(t), b: b }; }
    el.addEventListener('input', calc); calc();
    $('#dcs', el).onclick = function () {
      try {
        var d = $('#dcd', el).value, c = calc(), diff = PD.r2(c.t - c.b);
        if (D().dayClose.some(function (x) { return x.date === d; })) throw new Error('This day is already closed. Delete its entry in the list to redo it.');
        var rec = { id: PD.uid('dc'), date: d, book: c.b, counted: c.t, diff: diff, note: $('#dcn', el).value, by: PD.user ? PD.user.username : '', vch: '' };
        if (diff && $('#dcp', el).checked) rec.vch = svc.voucher(d, 'Journal', 'Cash day close ' + (diff < 0 ? 'shortage' : 'excess'), diff < 0 ? [{ acc: 'expense', dr: -diff }, { acc: 'cash', cr: -diff }] : [{ acc: 'cash', dr: diff }, { acc: 'income', cr: diff }], { kind: 'manual' }).id;
        D().dayClose.push(rec); PD.log('Day closed', d); PD.save(); PD.toast('Day closed' + (diff ? ' • difference ' + PD.n2(diff) : ' • cash matches'), 'ok'); hist(); calc();
      } catch (e) { PD.err(e); }
    };
    function hist() {
      PD.report($('#dch', el), { id: 'dayclose', title: 'Day close history', load: function () { return { cols: [{ k: 'date', label: 'Date', fmt: PD.fmtDate }, amt('book', 'Books'), amt('counted', 'Counted'), { k: 'diff', label: 'Difference', align: 'r', fmt: function (v) { return v ? '<b>' + PD.n2(v) + '</b>' : '<span class="badge ok">matched</span>'; } }, { k: 'by', label: 'By' }, { k: 'note', label: 'Note' }], rows: D().dayClose.slice().sort(function (a, b) { return b.date.localeCompare(a.date); }), note: 'Click an entry to delete it (its posted difference voucher is removed too).' }; },
        drill: function (r, run) { PD.confirm('Delete the day close of ' + PD.fmtDate(r.date) + '?', 'Delete', true).then(function (ok) { if (!ok) return; try { if (r.vch) { var v = D().vouchers.find(function (x) { return x.id === r.vch; }); if (v) { var y = D().years.find(function (x) { return x.id === v.year; }); if (y && y.closed) throw new Error('That year is closed'); D().vouchers = D().vouchers.filter(function (x) { return x !== v; }); } } D().dayClose = D().dayClose.filter(function (x) { return x.id !== r.id; }); PD.save(); run(); calc(); } catch (e) { PD.err(e); } }); } });
    }
    hist();
  }

  /* ---------- audit / internal checks ---------- */
  function audit(el) {
    PD.report(el, { id: 'audit', title: 'Audit checks (internal check)', load: function () {
      var today = PD.today(), out = [];
      function add(name, list, hint) { out.push({ name: name, n: list.length, res: list.length ? 'bad' : 'ok', list: list, hint: hint }); }
      var nos = D().vouchers.map(function (v) { return v.no; }).sort(function (a, b) { return a - b; }), gap = [], i;
      for (i = 1; i < nos.length; i++) for (var m = nos[i - 1] + 1; m < nos[i] && gap.length < 50; m++) gap.push('Voucher #' + m + ' missing');
      add('Missing voucher numbers (deleted or lost entries)', gap, 'Numbers skipped between the first and last voucher.');
      [['WD-', 'wdisp', 'Dispatch bills'], ['WS-', 'wsales', 'Sale bills']].forEach(function (q) { var ns = (D()[q[1]] || []).map(function (x) { return parseInt(String(x.no).replace(/\D/g, ''), 10); }).filter(function (n) { return n > 0; }).sort(function (a, b) { return a - b; }), gp = []; for (var k = 1; k < ns.length; k++) for (var m2 = ns[k - 1] + 1; m2 < ns[k] && gp.length < 50; m2++) gp.push(q[0] + ('000000' + m2).slice(-6) + ' missing'); add('Missing bill numbers: ' + q[2], gp, 'A bill number was skipped: deleted or never saved.'); });
      add('Vouchers dated in the future', D().vouchers.filter(function (v) { return v.date > today; }).map(function (v) { return '#' + v.no + ' ' + v.type + ' ' + PD.fmtDate(v.date); }), 'Check the date typed.');
      var unb = []; D().vouchers.forEach(function (v) { var d = 0, c = 0; v.lines.forEach(function (l) { d += l.dr; c += l.cr; }); if (Math.abs(d - c) > 0.01) unb.push('#' + v.no + ' Dr ' + PD.n2(d) + ' vs Cr ' + PD.n2(c)); });
      add('Vouchers where debit and credit differ', unb, 'Should always be empty.');
      ['cash', 'bank'].forEach(function (a) { var ev = []; D().vouchers.forEach(function (v) { v.lines.forEach(function (l) { if (l.acc === a) ev.push({ d: v.date, x: l.dr - l.cr }); }); }); ev.sort(function (p, q) { return p.d.localeCompare(q.d); }); var b = firstOb(a), neg = {}; ev.forEach(function (e) { b += e.x; if (b < -0.5) neg[e.d] = PD.r2(b); }); add(svc.accName(a) + ' went negative', Object.keys(neg).slice(0, 50).map(function (d) { return PD.fmtDate(d) + ': ' + PD.n2(neg[d]); }), 'Money paid out before it was recorded as received.'); });
      var ar = ageRows('cus', today);
      add('Shops over their credit limit', ar.filter(function (r) { return r.flag === 'Over limit'; }).map(function (r) { return r.name + ': ' + PD.n2(r.net) + ' (limit ' + PD.n2(r.limit) + ')'; }), 'Set under Outstanding & ageing.');
      add('Shops with advance / credit balance', ar.filter(function (r) { return r.advance > 0.5; }).map(function (r) { return r.name + ': advance ' + PD.n2(r.advance); }), 'Payment received but not yet matched with bills.');
      add('Stock lots sold below purchase cost', D().lots.filter(function (l) { return l.sell > 0 && l.cost > 0 && l.sell < l.cost && svc.wLeft(l) > 0; }).slice(0, 60).map(function (l) { return svc.itemName(l.itemId) + ' batch ' + l.batchNo + ': cost ' + PD.n2(l.cost) + ', shop price ' + PD.n2(l.sell); }), 'Shop price lower than what you paid.');
      add('Stock lots priced above MRP', D().lots.filter(function (l) { return l.mrp > 0 && (l.sell > l.mrp || l.cost > l.mrp) && svc.wLeft(l) > 0; }).slice(0, 60).map(function (l) { return svc.itemName(l.itemId) + ' batch ' + l.batchNo + ': MRP ' + PD.n2(l.mrp) + ', cost ' + PD.n2(l.cost) + ', shop price ' + PD.n2(l.sell); }), 'Likely a typing mistake in Add Stock.');
      add('Medicines in stock with no shelf', D().items.filter(function (it) { return !it.rack && svc.wStock(it.id) > 0; }).slice(0, 60).map(function (it) { return it.name; }), 'Give them a shelf under Items.');
      add('Pending cheques past their date', D().cheques.filter(function (c) { return c.status === 'pending' && c.date < today; }).map(function (c) { return (c.dir === 'in' ? 'Received ' : 'Issued ') + c.no + ' ' + svc.accName(c.party) + ' ' + PD.n2(c.amount) + ' dated ' + PD.fmtDate(c.date); }), 'Deposit or mark them.');
      var B = svc.balances(svc.currentYear().id), td = 0, tc = 0; D().accounts.forEach(function (a) { var b = B[a.id]; if (!b) return; var n = svc.accNet(b); if (n > 0) td += n; else tc -= n; });
      add('Trial balance difference (this year)', Math.abs(td - tc) > 1 ? ['Debit ' + PD.n2(td) + ' vs Credit ' + PD.n2(tc)] : [], 'Opening balances not set through the Opening balances tab can cause this.');
      return { cols: [{ k: 'res', label: 'Result', fmt: function (v, r) { return v === 'ok' ? '<span class="badge ok">OK</span>' : '<span class="badge bad">' + r.n + ' found</span>'; } }, { k: 'name', label: 'Check', fmt: bold }, { k: 'hint', label: 'What it means' }], rows: out, note: 'Click a check to see the entries.' };
    }, drill: function (r) { PD.modal({ title: r.name, size: 'md', body: r.list.length ? '<table class="t"><tbody>' + r.list.map(function (x) { return '<tr><td>' + esc(x) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p class="mut">Nothing to fix.</p>', foot: [{ label: 'Close' }] }); } });
  }
  show(tab);
} };
})();
