/* Alerts (notifications), customer history, attendance */
(function () {
'use strict';
var PD = window.PD, esc = PD.esc, svc = PD.svc, $ = PD.$;

/* ---------- alerts / notifications ---------- */
PD.alerts = function () {
  var D = PD.DB, out = [], days = D.settings.expiryDays || 90, can = PD.can || function () { return true; };
  var exp = 0, expV = 0, soon = 0, soonV = 0;
  D.batches.forEach(function (b) { if (!(b.qty > 0) || !b.expiry) return; var d = PD.daysToExp(b.expiry); if (d < 0) { exp++; expV += b.qty * b.rate; } else if (d <= days) { soon++; soonV += b.qty * b.rate; } });
  if (can('expiry')) {
    if (exp) out.push({ lvl: 'bad', text: exp + ' batch' + (exp > 1 ? 'es are' : ' is') + ' EXPIRED and still in stock (₹' + PD.n2(expV) + ')', go: ['expiry', { tab: 'watch' }], icon: 'alert' });
    if (soon) out.push({ lvl: 'warn', text: soon + ' batch' + (soon > 1 ? 'es' : '') + ' expire within ' + days + ' days (₹' + PD.n2(soonV) + ')', go: ['expclaim'], icon: 'clock' });
    var pend = D.damage.filter(function (d) { return d.status === 'Pending'; }).length; if (pend) out.push({ lvl: 'info', text: pend + ' expired/damaged item(s) not yet claimed from the warehouse', go: ['expclaim', { tab: 'uncl' }], icon: 'order' });
  }
  if (can('stock') || can('requests')) {
    var st = svc.stockMap(), low = D.items.filter(function (i) { return i.active !== false && i.reorder > 0 && (st[i.id] || 0) <= i.reorder; });
    var nil = low.filter(function (i) { return !(st[i.id] > 0); }).length;
    if (low.length) out.push({ lvl: nil ? 'bad' : 'warn', text: low.length + ' item(s) at or below reorder level' + (nil ? ' (' + nil + ' out of stock)' : ''), go: can('requests') ? ['request', { auto: 1 }] : ['reports', { report: 'reorder' }], icon: 'box' });
  }
  if (can('requests')) {
    var tr = D.dispatches.filter(function (d) { return d.status === 'In transit'; }).length; if (tr) out.push({ lvl: 'info', text: tr + ' dispatch(es) from the warehouse waiting to be received', go: ['receive'], icon: 'cart' });
    var rj = D.requests.filter(function (r) { return r.status === 'Rejected' && r.date >= PD.addDays(PD.today(), -3); }).length; if (rj) out.push({ lvl: 'warn', text: rj + ' stock request(s) rejected by the warehouse recently', go: ['reqlist'], icon: 'alert' });
    var pr = D.requests.filter(function (r) { return r.status === 'Pending'; }).length; if (pr) out.push({ lvl: 'info', text: pr + ' request(s) still waiting for warehouse approval', go: ['reqlist'], icon: 'order' });
  }
  if (can('accounts')) {
    var rec = 0; D.customers.forEach(function (c) { var b = svc.partyBalance('cus', c.id); if (b > 0) rec += b; });
    if (rec > 0) out.push({ lvl: 'info', text: 'Customers owe ₹' + PD.n2(rec) + ' (credit sales)', go: ['reports', { report: 'recv' }], icon: 'report' });
    var pay = svc.partyBalance('sup', 'wh'); if (pay > 0) out.push({ lvl: 'info', text: 'Payable to warehouse: ₹' + PD.n2(pay), go: ['accounts', { tab: 'ledger', acc: 'sup_wh' }], icon: 'book' });
  }
  if (PD.user && !svc.attOf(PD.user.id, PD.today())) out.push({ lvl: 'warn', text: 'You have not marked attendance today', go: ['attendance'], icon: 'users' });
  return out;
};

/* ---------- customer history ---------- */
PD.views.custhist = { render: function (host, arg) {
  var D = PD.DB, cid = (arg && arg.customerId) || '';
  host.innerHTML = '<div class="msw whw">' + '<div class="msband"><span class="mslogo">' + PD.icon('pill') + '</span><b>Customer History</b></div><div style="padding:8px 10px"><div class="pf wide"><label>Customer :</label><input class="in" id="chq" placeholder="Type name or phone" autocomplete="off" style="max-width:380px"></div><div id="chb"></div></div></div>';
  var q = $('#chq', host);
  PD.combo(q, { source: function (qv) { qv = (qv || '').toLowerCase(); return D.customers.filter(function (c) { return !qv || (c.name + ' ' + (c.phone || '')).toLowerCase().indexOf(qv) >= 0; }).slice(0, 40).map(function (c) { return { id: c.id, label: '<b>' + esc(c.name) + '</b>', sub: esc(c.phone || ''), right: esc(c.type) }; }); }, onPick: function (x) { cid = x.id; draw(); } });
  function draw() {
    var c = cid && svc.customer(cid), b = $('#chb', host); if (!c) { b.innerHTML = '<div class="empty">Choose a customer to see every bill, what they usually buy and what they owe.</div>'; return; }
    q.value = c.name;
    var bills = D.sales.filter(function (s) { return s.customerId === cid; }).slice().sort(function (a, b2) { return (b2.date + (b2.time || '')).localeCompare(a.date + (a.time || '')); });
    var spent = bills.reduce(function (a, s) { return a + s.total; }, 0), items = {};
    bills.forEach(function (s) { s.lines.forEach(function (l) { var k = l.itemId, e = items[k] = items[k] || { name: l.name, qty: 0, amt: 0, last: '', n: 0, sch: l.schedule }; e.qty += l.qty; e.amt += l.amount; e.n++; if (s.date > e.last) e.last = s.date; }); });
    var docs = {}; bills.forEach(function (s) { if (s.doctor) docs[s.doctor] = (docs[s.doctor] || 0) + 1; });
    var top = Object.keys(items).map(function (k) { return items[k]; }).sort(function (a, b2) { return b2.n - a.n || b2.amt - a.amt; });
    b.innerHTML = '<div class="grid g4" style="margin:8px 0"><div class="card kpi"><div class="l">Visits (bills)</div><div class="v">' + bills.length + '</div><div class="s">Last: ' + (bills[0] ? PD.fmtDate(bills[0].date) : '—') + '</div></div><div class="card kpi"><div class="l">Total purchases</div><div class="v">' + PD.money(spent) + '</div><div class="s">' + esc(c.type) + ' customer</div></div><div class="card kpi"><div class="l">Outstanding</div><div class="v" style="color:' + (svc.partyBalance('cus', cid) > 0 ? 'var(--bad)' : 'inherit') + '">' + PD.money(svc.partyBalance('cus', cid)) + '</div><div class="s">Credit limit ' + PD.n2(c.limit || 0) + '</div></div><div class="card kpi"><div class="l">Phone / doctors</div><div class="v" style="font-size:15px">' + esc(c.phone || '—') + '</div><div class="s">' + (Object.keys(docs).map(esc).join(', ') || 'No doctor noted') + '</div></div></div>' +
      '<div class="grid" style="grid-template-columns:1fr 1fr;align-items:start"><div class="card"><div class="hd"><h3 style="padding:0;border:0">Medicines bought (most frequent first)</h3></div><div class="tw" style="max-height:46vh"><table class="t"><thead><tr><th>Medicine</th><th class="r">Times</th><th class="r">Qty</th><th class="r">Amount</th><th>Last</th></tr></thead><tbody>' + (top.map(function (e) { return '<tr><td><span class="' + (e.sch === 'H1' || e.sch === 'X' ? 'rx2' : e.sch === 'H' ? 'rx' : '') + '">' + esc(e.name) + '</span> ' + PD.schedBadge(e.sch) + '</td><td class="r">' + e.n + '</td><td class="r">' + PD.qty(e.qty) + '</td><td class="r">' + PD.n2(e.amt) + '</td><td>' + PD.fmtDate(e.last) + '</td></tr>'; }).join('') || '<tr><td colspan="5"><div class="empty">No purchases yet.</div></td></tr>') + '</tbody></table></div></div>' +
      '<div class="card"><div class="hd"><h3 style="padding:0;border:0">Bills</h3></div><div class="tw" style="max-height:46vh"><table class="t"><thead><tr><th>Date</th><th>Bill</th><th>Doctor</th><th class="r">Total</th><th class="r">Due</th></tr></thead><tbody>' + (bills.map(function (s) { return '<tr class="click" data-b="' + s.id + '"><td>' + PD.fmtDate(s.date) + '</td><td>' + esc(s.no) + '</td><td>' + esc(s.doctor || '') + '</td><td class="r">' + PD.n2(s.total) + '</td><td class="r">' + (s.due ? '<b style="color:var(--bad)">' + PD.n2(s.due) + '</b>' : '') + '</td></tr>'; }).join('') || '<tr><td colspan="5"><div class="empty">No bills.</div></td></tr>') + '</tbody></table></div></div></div>' +
      '<div class="row" style="margin-top:8px"><button class="btn sm" id="chl">Open ledger</button></div>';
    PD.on(b, 'click', '[data-b]', function (e, t) { PD.showBill(D.sales.find(function (s) { return s.id === t.dataset.b; })); });
    $('#chl', b).onclick = function () { PD.go('accounts', { tab: 'ledger', acc: 'cus_' + cid }); };
  }
  draw();
} };

/* ---------- attendance ---------- */
var ST = { P: ['Present', '#2e8b57'], A: ['Absent', '#c62828'], L: ['Leave', '#c77d00'], H: ['Half day', '#7b5ea7'] };
function ym(d) { return d.slice(0, 7); }
function dim(y, m) { return new Date(y, m, 0).getDate(); }
PD.views.attendance = { render: function (host, arg) {
  var D = PD.DB, me = PD.user, mon = (arg && arg.month) || ym(PD.today()), admin = me.role === 'Admin' || (me.rights && me.rights.attendance);
  var y = +mon.slice(0, 4), m = +mon.slice(5, 7), n = dim(y, m), today = PD.today();
  var users = admin ? D.users.filter(function (u) { return u.active !== false; }) : [me], mine = svc.attOf(me.id, today);
  host.innerHTML = '<div class="msw whw"><div class="msband"><span class="mslogo">' + PD.icon('pill') + '</span><b>Attendance</b></div><div style="padding:8px 10px">' +
    '<div class="atp"><div><div class="atl">Today — ' + PD.fmtDate(today) + '</div><div class="atn">' + esc(me.name) + '</div><div class="ats">' + (mine && mine.in ? 'Punched in at <b>' + mine.in + '</b>' + (mine.late ? ' <span class="badge warn">late</span>' : '') + (mine.out ? ' • out at <b>' + mine.out + '</b> • ' + svc.attHours(mine) + ' h' : ' • still working') : 'Not marked yet') + '</div></div><div class="row"><button class="btn p lg" id="pi"' + (mine && mine.in ? ' disabled' : '') + '>Punch In</button><button class="btn lg" id="po"' + (!mine || !mine.in || mine.out ? ' disabled' : '') + '>Punch Out</button></div></div>' +
    '<div class="row" style="margin:10px 0"><b>' + (admin ? 'Staff register' : 'My attendance') + '</b><input class="in sm" type="month" id="am" value="' + mon + '" style="width:150px"><span class="sp"></span><span class="hint">P present • A absent • L leave • H half day • <span style="color:#c77d00">orange = late</span>' + (admin ? ' • click a cell to edit' : '') + '</span>' + (admin ? '<button class="btn sm" id="acsv">CSV</button>' : '') + '</div>' +
    '<div class="msgrid" style="margin:0;background:#fff;overflow:auto"><table class="t atg"><thead><tr><th>Staff</th>' + Array.apply(null, Array(n)).map(function (_, i) { return '<th class="c">' + (i + 1) + '</th>'; }).join('') + '<th class="r">P</th><th class="r">A</th><th class="r">L</th><th class="r">Hours</th></tr></thead><tbody id="ab"></tbody></table></div></div></div>';
  function row(u) {
    var cnt = { P: 0, A: 0, L: 0, H: 0 }, hrs = 0, cells = '';
    for (var d = 1; d <= n; d++) {
      var ds = mon + '-' + ('0' + d).slice(-2), a = svc.attOf(u.id, ds), fut = ds > today, s = a ? a.status : '', t = '';
      if (s) { cnt[s]++; hrs += svc.attHours(a); t = esc(u.name) + ' ' + ds + (a.in ? ' in ' + a.in : '') + (a.out ? ' out ' + a.out : '') + (a.note ? ' — ' + a.note : ''); }
      cells += '<td class="c ac ' + (a && a.late ? 'late' : '') + '" ' + (admin && !fut ? 'data-u="' + u.id + '" data-d="' + ds + '"' : '') + ' title="' + t + '" style="' + (s ? 'color:' + ST[s][1] + ';font-weight:700' : '') + '">' + (s || (fut ? '' : '·')) + '</td>';
    }
    return '<tr><td><b>' + esc(u.name) + '</b><br><small class="mut">' + esc(u.role) + '</small></td>' + cells + '<td class="r">' + (cnt.P + cnt.H * 0.5) + '</td><td class="r">' + cnt.A + '</td><td class="r">' + cnt.L + '</td><td class="r">' + PD.r2(hrs) + '</td></tr>';
  }
  $('#ab', host).innerHTML = users.map(row).join('');
  $('#pi', host).onclick = function () { svc.punchIn(me); PD.toast('Punched in at ' + PD.nowTime(), 'ok'); PD.views.attendance.render(host, { month: mon }); if (PD.refreshAlerts) PD.refreshAlerts(); };
  $('#po', host).onclick = function () { svc.punchOut(me); PD.toast('Punched out', 'ok'); PD.views.attendance.render(host, { month: mon }); };
  $('#am', host).onchange = function () { if (this.value) PD.views.attendance.render(host, { month: this.value }); };
  if (admin) {
    PD.on(host, 'click', '[data-u]', function (e, t) {
      var u = D.users.find(function (x) { return x.id === t.dataset.u; }), ds = t.dataset.d, a = svc.attOf(u.id, ds) || {};
      var f = [{ k: 'status', label: 'Status', type: 'select', options: [['P', 'Present'], ['A', 'Absent'], ['L', 'Leave'], ['H', 'Half day'], ['', '— clear —']] }, { k: 'in', label: 'In time', type: 'time' }, { k: 'out', label: 'Out time', type: 'time' }, { k: 'note', label: 'Note', full: true }];
      PD.modal({ title: u.name + ' • ' + PD.fmtDate(ds), size: 'sm', body: PD.formHTML(f, { status: a.status || 'P', in: a.in || '', out: a.out || '', note: a.note || '' }), foot: [{ label: 'Cancel' }, { label: 'Save', cls: 'p', fn: function (api) {
        var v = PD.readForm(api.body, f); D.attendance = D.attendance.filter(function (x) { return !(x.userId === u.id && x.date === ds); });
        if (v.status) D.attendance.push({ id: PD.uid('at'), userId: u.id, date: ds, status: v.status, in: v.in, out: v.out, late: !!v.in && v.in > (function (s, g) { var p = s.split(':'); var t = (+p[0]) * 60 + (+p[1]) + g; return ('0' + Math.floor(t / 60)).slice(-2) + ':' + ('0' + (t % 60)).slice(-2); })(D.settings.shiftStart || '09:00', D.settings.graceMin || 0), note: v.note, by: me.username });
        PD.log('Attendance edited', u.username + ' ' + ds); PD.save(); PD.views.attendance.render(host, { month: mon });
      } }] });
    });
    $('#acsv', host).onclick = function () {
      var rows = [['Staff', 'Date', 'Status', 'In', 'Out', 'Hours', 'Late', 'Note']]; D.attendance.filter(function (a) { return ym(a.date) === mon; }).sort(function (a, b) { return a.date.localeCompare(b.date); }).forEach(function (a) { var u = D.users.find(function (x) { return x.id === a.userId; }); rows.push([u ? u.name : a.userId, a.date, ST[a.status][0], a.in, a.out, svc.attHours(a), a.late ? 'Yes' : '', a.note]); });
      var csv = rows.map(function (r) { return r.map(function (c) { return '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'; }).join(','); }).join('\n'), el = document.createElement('a'); el.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); el.download = 'attendance-' + mon + '.csv'; document.body.appendChild(el); el.click(); setTimeout(function () { el.remove(); }, 400);
    };
  }
} };
})();
