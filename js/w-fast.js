/* Fast-moving medicines: (1) shop-wise, from what each shop actually sold, (2) the warehouse's own dispatches / sales.
   Both have a 7 / 15 / 30 day selector. */
(function () {
'use strict';
var PD = window.PD, esc = PD.esc, svc = PD.svc, $ = PD.$;
function D() { return PD.DB; }
var bold = function (v) { return '<b>' + esc(v) + '</b>'; };
var DAYS = [7, 15, 30], TOP = 10;

function picker(cur, hint) {
  return '<div class="card"><div class="bd row" style="gap:10px;align-items:flex-end;flex-wrap:wrap"><div class="fld" style="min-width:170px"><label>Last</label><select class="in sm" id="fdays">' +
    DAYS.map(function (n) { return '<option value="' + n + '"' + (n === cur ? ' selected' : '') + '>' + n + ' days</option>'; }).join('') + '</select></div><span class="hint">' + hint + '</span></div></div><div id="fres" style="margin-top:10px"></div>';
}
function fromDate(n) { return PD.addDays(PD.today(), -(n - 1)); }

/* ---------- shop-wise: what each shop sold (summaries the shops send while online) ---------- */
PD.views.wfastshop = { render: function (host, arg) {
  var n = (arg && +arg.days) || 7, from = fromDate(n), to = PD.today();
  host.innerHTML = picker(n, 'Top ' + TOP + ' medicines sold by each shop in the last ' + n + ' days (' + PD.fmtDate(from) + ' to ' + PD.fmtDate(to) + '). A shop\'s item-wise sales appear here once that shop has opened the updated app online.');
  $('#fdays', host).onchange = function () { PD.views.wfastshop.render(host, { days: +this.value }); };
  var out = $('#fres', host); out.innerHTML = '<div class="card"><div class="bd mut">Loading…</div></div>';
  PD.cloud.listShops().then(function (shops) {
    return Promise.all(shops.map(function (s) { return PD.cloud.readDays(s.id, from, to).catch(function () { return []; }); })).then(function (all) {
      var rows = [], noData = [];
      shops.forEach(function (s, i) {
        var m = {};
        all[i].forEach(function (d) { Object.keys(d.items || {}).forEach(function (id) { var x = d.items[id]; var r = m[id] || (m[id] = { item: x.n || svc.itemName(id), qty: 0 }); r.qty += x.q || 0; }); });
        var top = Object.keys(m).map(function (k) { return m[k]; }).filter(function (r) { return r.qty > 0; }).sort(function (a, b) { return b.qty - a.qty; }).slice(0, TOP);
        if (!top.length) { noData.push(s.name); return; }
        top.forEach(function (r, j) { rows.push({ shop: s.name, rank: j + 1, item: r.item, qty: PD.r2(r.qty) }); });
      });
      PD.report(out, { id: 'wfastshop', title: 'Shop-wise fast moving medicines (last ' + n + ' days)', load: function () { return { cols: [
        { k: 'shop', label: 'Shop', fmt: bold }, { k: 'rank', label: '#', align: 'r' }, { k: 'item', label: 'Medicine' }, { k: 'qty', label: 'Qty sold', align: 'r', sum: true, fmt: PD.qty }],
        rows: rows, note: noData.length ? 'No item-wise sales yet for: ' + noData.join(', ') + '.' : '' }; } });
    });
  }).catch(function (e) { PD.err(e); out.innerHTML = '<div class="card"><div class="bd">Could not load: ' + esc(e.message || e) + '</div></div>'; });
} };

/* ---------- warehouse: what went out of the warehouse (to shops + sale bills to other parties) ---------- */
PD.views.wfastwh = { render: function (host, arg) {
  var n = (arg && +arg.days) || 7, from = fromDate(n), to = PD.today();
  host.innerHTML = picker(n, 'Medicines that left the warehouse in the last ' + n + ' days (' + PD.fmtDate(from) + ' to ' + PD.fmtDate(to) + '), strips sent to shops plus sale bills to other parties.');
  $('#fdays', host).onchange = function () { PD.views.wfastwh.render(host, { days: +this.value }); };
  var m = {};
  function row(id) { return m[id] || (m[id] = { item: svc.itemName(id), shops: 0, other: 0, val: 0 }); }
  D().wdisp.forEach(function (d) { if (d.date >= from && d.date <= to) d.lines.forEach(function (l) { var r = row(l.itemId); r.shops += l.qty; r.val += l.qty * l.rate; }); });
  (D().wsales || []).forEach(function (s) { if (s.date >= from && s.date <= to) s.lines.forEach(function (l) { var r = row(l.itemId); r.other += l.qty; r.val += l.net || 0; }); });
  var sm = svc.wStockMap ? svc.wStockMap() : {};
  var rows = Object.keys(m).map(function (id) { var r = m[id]; return { item: r.item, shops: r.shops, other: r.other, total: r.shops + r.other, val: PD.r2(r.val), left: sm[id] || 0 }; })
    .sort(function (a, b) { return b.total - a.total; }).map(function (r, i) { r.rank = i + 1; return r; });
  PD.report($('#fres', host), { id: 'wfastwh', title: 'Warehouse fast moving medicines (last ' + n + ' days)', load: function () { return { cols: [
    { k: 'rank', label: '#', align: 'r' }, { k: 'item', label: 'Medicine', fmt: bold }, { k: 'shops', label: 'Strips to shops', align: 'r', sum: true }, { k: 'other', label: 'Strips to other parties', align: 'r', sum: true },
    { k: 'total', label: 'Total strips out', align: 'r', sum: true, fmt: bold }, { k: 'val', label: 'Value', align: 'r', sum: true, fmt: PD.n2 }, { k: 'left', label: 'In stock now', align: 'r' }], rows: rows }; } });
} };
})();
