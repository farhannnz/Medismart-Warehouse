/* Accounts (warehouse copy of the shop's v-accounts.js): ledger, day book, trial balance, P&L, balance sheet, vouchers, heads, year closing.
   Shops are the customers here. */
(function () {
'use strict';
var PD = window.PD, esc = PD.esc, svc = PD.svc, $ = PD.$;

function accOptions(filter) { return PD.DB.accounts.filter(filter || function () { return true; }).sort(function (a, b) { return a.group.localeCompare(b.group) || a.name.localeCompare(b.name); }).map(function (a) { return [a.id, a.group + ' — ' + a.name]; }); }
function showVoucher(v) {
  var tot = 0; v.lines.forEach(function (l) { tot += l.dr; });
  PD.modal({ title: 'Voucher ' + v.no + ' • ' + v.type, size: 'md', body: '<div class="mut">' + PD.fmtDate(v.date) + ' • ' + esc(v.narr) + '</div><table class="t" style="margin-top:10px"><thead><tr><th>Account</th><th class="r">Debit</th><th class="r">Credit</th></tr></thead><tbody>' + v.lines.map(function (l) { return '<tr><td>' + esc(svc.accName(l.acc)) + '</td><td class="r">' + (l.dr ? PD.n2(l.dr) : '') + '</td><td class="r">' + (l.cr ? PD.n2(l.cr) : '') + '</td></tr>'; }).join('') + '</tbody><tfoot><tr><td>Total</td><td class="r">' + PD.n2(tot) + '</td><td class="r">' + PD.n2(tot) + '</td></tr></tfoot></table>', foot: [{ label: 'Close' }] });
}
PD.showVoucher = showVoucher;
function voucherModal(kind, pre, done) {
  var D = PD.DB, pay = [['cash', 'Cash in hand'], ['bank', 'Bank / UPI']], f;
  var cfg = {
    receipt: { t: 'Receive payment from a shop', fields: [{ k: 'party', label: 'Shop', type: 'select', options: function () { return [['', '— select —']].concat(D.customers.map(function (c) { return [c.id, c.name + ' (due ' + PD.n2(svc.partyBalance('cus', c.id)) + ')']; })); }, req: true }, { k: 'mode', label: 'Received in', type: 'select', options: pay }, { k: 'amount', label: 'Amount', type: 'number', req: true }, { k: 'date', label: 'Date', type: 'date' }, { k: 'narr', label: 'Narration', full: true }] },
    payment: { t: 'Make payment to supplier', fields: [{ k: 'party', label: 'Supplier', type: 'select', options: function () { return [['', '— select —']].concat(D.suppliers.map(function (c) { return [c.id, c.name + ' (payable ' + PD.n2(svc.partyBalance('sup', c.id)) + ')']; })); }, req: true }, { k: 'mode', label: 'Paid from', type: 'select', options: pay }, { k: 'amount', label: 'Amount', type: 'number', req: true }, { k: 'date', label: 'Date', type: 'date' }, { k: 'narr', label: 'Narration', full: true }] },
    expense: { t: 'Record an expense', fields: [{ k: 'acc', label: 'Expense head', type: 'select', options: function () { return accOptions(function (a) { return a.nat === 'E' && a.group !== 'Purchase' && a.group !== 'Stock' && a.id !== 'roundoff'; }); }, req: true }, { k: 'mode', label: 'Paid from', type: 'select', options: pay }, { k: 'amount', label: 'Amount', type: 'number', req: true }, { k: 'date', label: 'Date', type: 'date' }, { k: 'narr', label: 'Narration', full: true }] },
    income: { t: 'Record other income', fields: [{ k: 'acc', label: 'Income head', type: 'select', options: function () { return accOptions(function (a) { return a.group === 'Indirect Income'; }); }, req: true }, { k: 'mode', label: 'Received in', type: 'select', options: pay }, { k: 'amount', label: 'Amount', type: 'number', req: true }, { k: 'date', label: 'Date', type: 'date' }, { k: 'narr', label: 'Narration', full: true }] },
    journal: { t: 'Journal voucher', fields: [{ k: 'dr', label: 'Debit account', type: 'select', options: function () { return accOptions(); }, req: true }, { k: 'cr', label: 'Credit account', type: 'select', options: function () { return accOptions(); }, req: true }, { k: 'amount', label: 'Amount', type: 'number', req: true }, { k: 'date', label: 'Date', type: 'date' }, { k: 'narr', label: 'Narration', full: true }] }
  }[kind];
  f = cfg.fields;
  PD.modal({ title: cfg.t, size: 'md', body: PD.formHTML(f, Object.assign({ date: PD.today(), mode: 'cash' }, pre || {})), foot: [{ label: 'Cancel' }, { label: 'Save voucher', cls: 'p', fn: function (api) {
    try {
      var v = PD.readForm(api.body, f), a = PD.num(v.amount); if (a <= 0) throw new Error('Enter a positive amount');
      var m = v.mode === 'bank' ? 'bank' : 'cash', lines, type, narr = v.narr;
      if (kind === 'receipt') { lines = [{ acc: m, dr: a }, { acc: svc.partyAcc('cus', v.party), cr: a }]; type = 'Receipt'; narr = narr || 'Received from ' + svc.cusName(v.party); }
      else if (kind === 'payment') { lines = [{ acc: svc.partyAcc('sup', v.party), dr: a }, { acc: m, cr: a }]; type = 'Payment'; narr = narr || 'Paid to ' + svc.supName(v.party); }
      else if (kind === 'expense') { lines = [{ acc: v.acc, dr: a }, { acc: m, cr: a }]; type = 'Expense'; }
      else if (kind === 'income') { lines = [{ acc: m, dr: a }, { acc: v.acc, cr: a }]; type = 'Income'; }
      else { if (v.dr === v.cr) throw new Error('Debit and credit accounts must differ'); lines = [{ acc: v.dr, dr: a }, { acc: v.cr, cr: a }]; type = 'Journal'; }
      var vch = svc.manualVoucher(v.date, type, narr, lines); PD.toast('Voucher ' + vch.no + ' saved', 'ok'); if (done) done();
    } catch (e) { PD.err(e); return false; }
  } }] });
}
PD.voucherModal = voucherModal;

PD.views.accounts = { render: function (host, arg) {
  var D = PD.DB, yearId = svc.currentYear().id, tab = (arg && arg.tab) || 'ledger', accSel = (arg && arg.acc) || 'cash';
  function yr() { return D.years.find(function (y) { return y.id === yearId; }); }
  host.innerHTML = '<div class="row sp" style="margin-bottom:14px"><div class="tabs" id="at">' + [['ledger', 'Ledger'], ['daybook', 'Day book'], ['tb', 'Trial balance'], ['pnl', 'Profit & loss / Balance sheet'], ['dues', 'Receivables & payables'], ['heads', 'Account heads'], ['year', 'Year closing']].map(function (t) { return '<button data-t="' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div><div class="row"><div class="fld" style="flex-direction:row;align-items:center;gap:8px"><label>Financial year</label><select class="in sm" id="yr" style="width:auto">' + D.years.map(function (y) { return '<option value="' + y.id + '"' + (y.id === yearId ? ' selected' : '') + '>' + y.label + (y.closed ? ' (closed)' : '') + '</option>'; }).join('') + '</select></div><button class="btn sm p" data-v="receipt">Receive</button><button class="btn sm" data-v="payment">Pay</button><button class="btn sm" data-v="expense">Expense</button><button class="btn sm" data-v="income">Income</button><button class="btn sm" data-v="journal">Journal</button></div></div><div id="ac"></div>';
  var ac = $('#ac', host);
  function show(t) { tab = t; PD.$$('#at button', host).forEach(function (b) { b.classList.toggle('on', b.dataset.t === t); }); ac.innerHTML = ''; ({ ledger: ledger, daybook: daybook, tb: tb, pnl: pnl, dues: dues, heads: heads, year: year })[t](ac); }
  PD.on($('#at', host), 'click', 'button', function (e, b) { show(b.dataset.t); });
  $('#yr', host).onchange = function () { yearId = this.value; show(tab); };
  PD.on(host, 'click', '[data-v]', function (e, t) { voucherModal(t.dataset.v, null, function () { show(tab); }); });

  function ledger(el) {
    var y = yr();
    PD.report(el, { id: 'ledger', title: 'Account ledger', filters: [{ k: 'acc', label: 'Account', type: 'select', options: function () { return accOptions(); }, val: accSel, w: 280 }, { k: 'from', label: 'From', type: 'date', val: function () { return yr().start; } }, { k: 'to', label: 'To', type: 'date', val: function () { return yr().end; } }],
      load: function (f) {
        var a = svc.acc(f.acc), ob = (D.openBal[yearId] || {})[f.acc] || 0, bal = ob, rows = [];
        var pre = 0; D.vouchers.forEach(function (v) { if (v.year === yearId && v.date < f.from) v.lines.forEach(function (l) { if (l.acc === f.acc) pre += l.dr - l.cr; }); }); bal += pre;
        rows.push({ date: f.from, no: '', type: 'Opening', narr: 'Balance brought forward', dr: bal > 0 ? bal : 0, cr: bal < 0 ? -bal : 0, bal: bal });
        D.vouchers.filter(function (v) { return v.year === yearId && v.date >= f.from && v.date <= f.to; }).sort(function (a, b) { return a.date.localeCompare(b.date) || a.no - b.no; }).forEach(function (v) { v.lines.forEach(function (l) { if (l.acc !== f.acc) return; bal += l.dr - l.cr; rows.push({ id: v.id, date: v.date, no: v.no, type: v.type, narr: v.narr, dr: l.dr, cr: l.cr, bal: PD.r2(bal) }); }); });
        return { cols: [{ k: 'date', label: 'Date', fmt: PD.fmtDate }, { k: 'no', label: 'Vch', fmt: function (v) { return v ? '#' + v : ''; } }, { k: 'type', label: 'Type', fmt: function (v) { return '<span class="badge">' + esc(v) + '</span>'; } }, { k: 'narr', label: 'Narration' }, amt('dr', 'Debit'), amt('cr', 'Credit'), { k: 'bal', label: 'Balance', align: 'r', fmt: function (v) { return '<b>' + PD.n2(Math.abs(v)) + '</b> ' + (v >= 0 ? 'Dr' : 'Cr'); }, raw: function (r) { return r.bal; } }], rows: rows, note: a ? a.name + ' • ' + a.group : '' };
      }, drill: function (r) { var v = r.id && D.vouchers.find(function (x) { return x.id === r.id; }); if (v) showVoucher(v); } });
  }
  function amt(k, l) { return { k: k, label: l, align: 'r', sum: true, fmt: function (v) { return v ? PD.n2(v) : ''; } }; }
  function daybook(el) {
    PD.report(el, { id: 'daybook', title: 'Day book', filters: [{ k: 'from', label: 'From', type: 'date', val: PD.today }, { k: 'to', label: 'To', type: 'date', val: PD.today }, { k: 'type', label: 'Type', type: 'select', options: function () { var t = {}; D.vouchers.forEach(function (v) { t[v.type] = 1; }); return [['', 'All types']].concat(Object.keys(t).sort()); } }],
      load: function (f) { return { cols: [{ k: 'date', label: 'Date', fmt: PD.fmtDate }, { k: 'no', label: 'Vch', fmt: function (v) { return '#' + v; } }, { k: 'type', label: 'Type', fmt: function (v) { return '<span class="badge brand">' + esc(v) + '</span>'; } }, { k: 'narr', label: 'Narration' }, { k: 'accs', label: 'Accounts' }, { k: 'amount', label: 'Amount', align: 'r', sum: true, fmt: PD.n2 }],
        rows: D.vouchers.filter(function (v) { return v.date >= f.from && v.date <= f.to && (!f.type || v.type === f.type); }).sort(function (a, b) { return b.date.localeCompare(a.date) || b.no - a.no; }).map(function (v) { var t = 0; v.lines.forEach(function (l) { t += l.dr; }); return { id: v.id, date: v.date, no: v.no, type: v.type, narr: v.narr, accs: v.lines.map(function (l) { return svc.accName(l.acc); }).join(', '), amount: t }; }) }; },
      drill: function (r) { showVoucher(D.vouchers.find(function (x) { return x.id === r.id; })); } });
  }
  function tb(el) {
    var B = svc.balances(yearId);
    PD.report(el, { id: 'tb', title: 'Trial balance', load: function () { var rows = []; D.accounts.forEach(function (a) { var b = B[a.id]; if (!b) return; var n = svc.accNet(b); if (!n && !b.dr && !b.cr) return; rows.push({ id: a.id, name: a.name, group: a.group, od: b.od, oc: b.oc, dr: b.dr, cr: b.cr, cdr: n > 0 ? n : 0, ccr: n < 0 ? -n : 0 }); });
      return { cols: [{ k: 'name', label: 'Account', fmt: function (v) { return '<b>' + esc(v) + '</b>'; } }, { k: 'group', label: 'Group' }, amt('od', 'Opening Dr'), amt('oc', 'Opening Cr'), amt('dr', 'Debit'), amt('cr', 'Credit'), amt('cdr', 'Closing Dr'), amt('ccr', 'Closing Cr')], rows: rows, note: 'Closing Dr and Cr totals must match. Click an account for its ledger.' }; },
      drill: function (r) { accSel = r.id; show('ledger'); } });
  }
  function pnl(el) {
    var bs = svc.balanceSheet(yearId), P = bs.P, y = yr();
    function ln(a, b, cls) { return '<div class="ln ' + (cls || '') + '"><span>' + esc(a) + '</span><b>' + PD.n2(b) + '</b></div>'; }
    el.innerHTML = '<div class="pnl"><div class="card"><div class="hd"><h3 style="padding:0;border:0">Trading &amp; profit and loss</h3><span class="sp"></span><span class="badge brand">FY ' + y.label + '</span></div>' + ln('Sales', P.sales) + ln('Less: sales returns', -P.sret) + ln('Closing stock' + (y.closed ? '' : ' (current valuation)'), P.closing) + ln('Opening stock', -P.open) + ln('Purchases', -P.pur) + ln('Add: purchase returns', P.pret) + ln('Gross profit', P.gp, 't') +
      P.incRows.map(function (r) { return ln('+ ' + r[0], r[1]); }).join('') + P.expRows.map(function (r) { return ln((r[1] < 0 ? '+ ' : '− ') + r[0], -r[1]); }).join('') + ln('Net profit', P.net, 't') + '</div>' +
      '<div class="card"><div class="hd"><h3 style="padding:0;border:0">Balance sheet</h3></div><div class="bd" style="padding-bottom:4px"><b>Liabilities &amp; capital</b></div>' + bs.liabs.map(function (r) { return ln(r[0], r[1]); }).join('') + ln('Total liabilities', bs.L, 't') + '<div class="bd" style="padding-bottom:4px"><b>Assets</b></div>' + bs.assets.map(function (r) { return ln(r[0], r[1]); }).join('') + ln('Total assets', bs.A, 't') + (Math.abs(bs.A - bs.L) > 1 ? '<div class="bd"><span class="badge bad">Difference ' + PD.n2(bs.A - bs.L) + ' — check opening balances / vouchers</span></div>' : '<div class="bd"><span class="badge ok">Balance sheet is balanced</span></div>') + '</div></div>';
  }
  function dues(el) {
    el.innerHTML = '<div class="grid g2"><div id="d1"></div><div id="d2"></div></div>';
    PD.report($('#d1', el), { id: 'dues-c', title: 'Receivables (shops)', load: function () { return { cols: [{ k: 'name', label: 'Shop', fmt: function (v) { return '<b>' + esc(v) + '</b>'; } }, amt('bal', 'Outstanding'), { k: '_a', label: '', raw: function () { return ''; }, fmt: function (v, r) { return '<button class="btn sm p" data-rc="' + r.id + '">Receive</button>'; } }], rows: D.customers.map(function (c) { return { id: c.id, name: c.name, bal: svc.partyBalance('cus', c.id) }; }).filter(function (r) { return r.bal !== 0; }) }; }, drill: function (r) { accSel = 'cus_' + r.id; show('ledger'); } });
    PD.report($('#d2', el), { id: 'dues-s', title: 'Payables (suppliers)', load: function () { return { cols: [{ k: 'name', label: 'Supplier', fmt: function (v) { return '<b>' + esc(v) + '</b>'; } }, amt('bal', 'Payable'), { k: '_a', label: '', raw: function () { return ''; }, fmt: function (v, r) { return '<button class="btn sm p" data-py="' + r.id + '">Pay</button>'; } }], rows: D.suppliers.map(function (c) { return { id: c.id, name: c.name, bal: svc.partyBalance('sup', c.id) }; }).filter(function (r) { return r.bal !== 0; }) }; }, drill: function (r) { accSel = 'sup_' + r.id; show('ledger'); } });
    PD.on(el, 'click', '[data-rc]', function (e, t) { e.stopPropagation(); voucherModal('receipt', { party: t.dataset.rc, amount: Math.max(0, svc.partyBalance('cus', t.dataset.rc)) }, function () { show('dues'); }); });
    PD.on(el, 'click', '[data-py]', function (e, t) { e.stopPropagation(); voucherModal('payment', { party: t.dataset.py, amount: Math.max(0, svc.partyBalance('sup', t.dataset.py)) }, function () { show('dues'); }); });
  }
  function heads(el) {
    PD.master(el, { coll: 'accounts', title: 'Account heads', single: 'account head', size: 'md', note: 'System accounts (cash, sales, purchase, GST...) and party accounts are managed automatically. Add your own expense/income heads here.',
      defaults: function () { return { group: 'Indirect Expense', nat: 'E' }; },
      fields: [{ k: 'name', label: 'Account name', req: true, full: true }, { k: 'group', label: 'Group', type: 'select', options: ['Indirect Expense', 'Direct Expense', 'Indirect Income', 'Cash', 'Bank', 'Capital', 'Duties & Taxes', 'Sundry Debtors', 'Sundry Creditors'] }, { k: 'nat', label: 'Nature', type: 'select', options: [['E', 'Expense'], ['I', 'Income'], ['A', 'Asset'], ['L', 'Liability'], ['C', 'Capital']] }],
      cols: [{ k: 'name', label: 'Account', fmt: function (v, r) { return '<b>' + esc(v) + '</b>' + (r.sys ? ' <span class="badge">system</span>' : r.party ? ' <span class="badge info">party</span>' : ''); } }, { k: 'group', label: 'Group' }, { k: 'nat', label: 'Nature', fmt: function (v) { return { E: 'Expense', I: 'Income', A: 'Asset', L: 'Liability', C: 'Capital' }[v]; } }] });
  }
  function year(el) {
    el.innerHTML = '<div class="card"><div class="hd"><h3 style="padding:0;border:0">Financial years</h3></div><div class="tw"><table class="t"><thead><tr><th>Year</th><th>Period</th><th>Status</th><th class="r">Closing stock</th><th></th></tr></thead><tbody>' + D.years.map(function (y) { return '<tr><td><b>' + y.label + '</b></td><td>' + PD.fmtDate(y.start) + ' – ' + PD.fmtDate(y.end) + '</td><td>' + (y.closed ? '<span class="badge bad">Closed ' + PD.fmtDate(y.closedOn) + '</span>' : '<span class="badge ok">Open</span>') + '</td><td class="r">' + (y.closed ? PD.n2(y.closingStock) : '—') + '</td><td class="r">' + (y.closed ? '<button class="btn sm" data-ro="' + y.id + '">Re-open</button>' : '<button class="btn sm d" data-cl="' + y.id + '">Close year &amp; carry forward</button>') + '</td></tr>'; }).join('') + '</tbody></table></div><div class="bd hint">Closing a year locks its vouchers, moves the closing stock and all balances (cash, bank, debtors, creditors, GST, capital + profit) into the next year as opening balances, and starts a fresh year. Take a backup first (Settings).</div></div>';
    PD.on(el, 'click', '[data-cl]', function (e, t) { PD.confirm('Close financial year <b>' + D.years.find(function (y) { return y.id === t.dataset.cl; }).label + '</b>? Transactions in that year will be locked.', 'Close year', true).then(function (ok) { if (!ok) return; try { var ny = svc.closeYear(t.dataset.cl); yearId = ny.id; PD.toast('Year closed. New year ' + ny.label + ' started.', 'ok'); render2(); } catch (er) { PD.err(er); } }); });
    PD.on(el, 'click', '[data-ro]', function (e, t) { svc.reopenYear(t.dataset.ro); PD.toast('Year re-opened'); show('year'); });
  }
  function render2() { PD.views.accounts.render(host, { tab: 'year' }); }
  show(tab);
} };
})();
