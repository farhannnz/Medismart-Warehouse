/* Purchase: reusable entry grid, purchase invoice, tracking, returns; orders & delivery notes */
(function () {
'use strict';
var PD = window.PD, esc = PD.esc, svc = PD.svc, $ = PD.$;

/* ---------- quick-entry grid with movable columns ---------- */
PD.grid = function (host, cfg) {
  var S = PD.DB.settings, pref = (S.colsPref[cfg.id] = S.colsPref[cfg.id] || {}), lines = [], api = {};
  function cols() {
    var all = cfg.cols.slice(), order = pref.order || [], hid = pref.hidden || [];
    all.sort(function (a, b) { var ia = order.indexOf(a.k), ib = order.indexOf(b.k); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || cfg.cols.indexOf(a) - cfg.cols.indexOf(b); });
    return all.filter(function (c) { return c.always || hid.indexOf(c.k) < 0; });
  }
  function cell(c, l, i) {
    if (c.type === 'item') return '<input class="in sm" data-item="' + i + '" value="' + esc(l.itemId ? svc.itemName(l.itemId) : (l.newName || '')) + '" placeholder="Search item (name / generic)..." style="min-width:230px" autocomplete="off">';
    if (c.type === 'calc') return '<b data-calc="' + c.k + '" data-r="' + i + '">' + c.calc(l, i) + '</b>';
    if (c.type === 'del') return '<button class="btn sm g" data-del="' + i + '">' + PD.icon('x') + '</button>';
    if (c.type === 'select') { var o = (typeof c.options === 'function' ? c.options(l) : c.options); return '<select class="in sm" data-k="' + c.k + '" data-r="' + i + '" style="min-width:' + (c.w || 90) + 'px">' + o.map(function (x) { x = Array.isArray(x) ? x : [x, x]; return '<option value="' + esc(x[0]) + '"' + (String(x[0]) === String(l[c.k]) ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>'; }
    return '<input class="in sm' + (c.align === 'r' ? ' r' : '') + '" data-k="' + c.k + '" data-r="' + i + '" type="' + (c.type || 'text') + '"' + (c.type === 'number' ? ' step="any" min="0"' : '') + ' value="' + esc(l[c.k] == null ? '' : l[c.k]) + '" style="min-width:' + (c.w || 70) + 'px;width:' + (c.w || 80) + 'px"' + (c.ph ? ' placeholder="' + esc(c.ph) + '"' : '') + '>';
  }
  function draw() {
    var cs = cols();
    host.innerHTML = '<div class="tw"><table class="t"><thead><tr><th>#</th>' + cs.map(function (c) { return '<th class="' + (c.align === 'r' ? 'r' : '') + '">' + esc(c.label || '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (lines.length ? lines.map(function (l, i) {
        var h = cfg.hint ? cfg.hint(l) : '';
        return '<tr data-r="' + i + '"><td>' + (i + 1) + '</td>' + cs.map(function (c) { return '<td class="' + (c.align === 'r' ? 'r' : '') + '">' + cell(c, l, i) + '</td>'; }).join('') + '</tr>' + (h ? '<tr class="hr"><td></td><td colspan="' + cs.length + '"><div class="hint">' + h + '</div></td></tr>' : '');
      }).join('') : '<tr><td colspan="' + (cs.length + 1) + '"><div class="empty">No lines yet. Add a line and search the item.</div></td></tr>') + '</tbody></table></div>' +
      '<div class="row no-print" style="margin-top:10px"><button class="btn sm" data-add>' + PD.icon('plus') + 'Add line</button><button class="btn sm g" data-cols>' + PD.icon('cols') + 'Arrange columns</button>' + (cfg.extra ? cfg.extra : '') + '<span class="hint">Tip: Enter jumps to the next field and adds a new line at the end.</span></div>';
    PD.$$('[data-item]', host).forEach(function (inp) {
      var i = +inp.dataset.item;
      PD.combo(inp, { emptyMsg: cfg.itemFilter ? 'No matching item for this supplier. Untick "Only items linked to supplier" to search everything.' : 'No matching item.', source: PD.itemSource({ filter: cfg.itemFilter ? function (it) { return cfg.itemFilter(it); } : null }), onPick: function (x) { lines[i].itemId = x.id; if (cfg.onItem) cfg.onItem(lines[i], x.item); draw(); var nx = PD.$('[data-r="' + i + '"] [data-k]', host); if (nx) { nx.focus(); nx.select && nx.select(); } if (cfg.onChange) cfg.onChange(lines); } });
    });
    if (cfg.onChange) cfg.onChange(lines);
  }
  function refresh() { PD.$$('[data-calc]', host).forEach(function (b) { var c = cfg.cols.find(function (x) { return x.k === b.dataset.calc; }); b.textContent = c.calc(lines[+b.dataset.r], +b.dataset.r); }); if (cfg.onChange) cfg.onChange(lines); }
  PD.on(host, 'input', '[data-k]', function (e, t) { var l = lines[+t.dataset.r], c = cfg.cols.find(function (x) { return x.k === t.dataset.k; }); l[t.dataset.k] = c.type === 'number' ? (t.value === '' ? '' : PD.num(t.value)) : t.value; if (cfg.onInput) cfg.onInput(l, t.dataset.k, +t.dataset.r); refresh(); });
  PD.on(host, 'change', 'select[data-k]', function (e, t) { var l = lines[+t.dataset.r]; l[t.dataset.k] = t.value; if (cfg.onInput) cfg.onInput(l, t.dataset.k, +t.dataset.r); draw(); });
  PD.on(host, 'click', '[data-del]', function (e, t) { lines.splice(+t.dataset.del, 1); draw(); });
  PD.on(host, 'click', '[data-add]', function () { api.addLine(true); });
  PD.on(host, 'keydown', 'input[data-k]', function (e, t) {
    if (e.key !== 'Enter') return; e.preventDefault();
    var row = t.closest('tr'), ins = PD.$$('input[data-k],select[data-k]', row), i = ins.indexOf(t);
    if (i < ins.length - 1) { ins[i + 1].focus(); ins[i + 1].select && ins[i + 1].select(); } else if (+row.dataset.r === lines.length - 1 && lines[lines.length - 1].itemId) api.addLine(true);
    else { var nx = row.nextElementSibling; while (nx && !nx.dataset.r) nx = nx.nextElementSibling; var f = nx && PD.$('input', nx); if (f) f.focus(); }
  });
  PD.on(host, 'click', '[data-cols]', function () {
    var all = cfg.cols.filter(function (c) { return !c.always; }), order = (pref.order && pref.order.length ? pref.order.slice() : cfg.cols.map(function (c) { return c.k; })), hid = (pref.hidden || []).slice();
    cfg.cols.forEach(function (c) { if (order.indexOf(c.k) < 0) order.push(c.k); });
    function body() { return order.map(function (k, i) { var c = cfg.cols.find(function (x) { return x.k === k; }); if (!c || c.type === 'del') return ''; return '<div class="row sp" style="padding:6px 0;border-bottom:1px solid var(--line)"><label class="chk"><input type="checkbox" data-h="' + k + '"' + (hid.indexOf(k) < 0 ? ' checked' : '') + (c.always ? ' disabled' : '') + '> ' + esc(c.label || k) + '</label><span><button class="btn sm" data-m="' + i + '" data-d="-1">' + PD.icon('up') + '</button> <button class="btn sm" data-m="' + i + '" data-d="1">' + PD.icon('down') + '</button></span></div>'; }).join(''); }
    var m = PD.modal({ title: 'Arrange entry columns', size: 'sm', body: '<div id="cl">' + body() + '</div>', foot: [{ label: 'Reset', fn: function () { pref.order = []; pref.hidden = []; PD.save(); draw(); } }, { label: 'Apply', cls: 'p', fn: function () { pref.order = order; pref.hidden = hid; PD.save(); draw(); } }] });
    PD.on(m.el, 'click', '[data-m]', function (e2, b) { var i = +b.dataset.m, j = i + +b.dataset.d; if (j < 0 || j >= order.length) return; var tmp = order[i]; order[i] = order[j]; order[j] = tmp; PD.$('#cl', m.el).innerHTML = body(); });
    PD.on(m.el, 'change', '[data-h]', function (e2, c) { var k = c.dataset.h, i = hid.indexOf(k); if (c.checked && i >= 0) hid.splice(i, 1); if (!c.checked && i < 0) hid.push(k); });
    all.length;
  });
  api.lines = function () { return lines; };
  api.setLines = function (a) { lines = a; draw(); };
  api.addLine = function (focus) { lines.push(cfg.newLine()); draw(); if (focus) { var inp = PD.$('[data-r="' + (lines.length - 1) + '"] [data-item]', host); if (inp) inp.focus(); } };
  api.draw = draw; api.refresh = refresh;
  draw();
  return api;
};

function supOpts() { return [['', '— select supplier —']].concat(PD.DB.suppliers.filter(function (s) { return s.active !== false; }).map(function (s) { return [s.id, s.name]; })); }
function monthVal(e) { return e || ''; }
function invoiceView(b) {
  var s = svc.supplier(b.supplierId);
  return '<div class="row sp"><div><b>' + esc(b.no) + '</b> • Supplier inv ' + esc(b.invNo || '-') + '<br><span class="mut">' + esc(s ? s.name : '') + ' • ' + PD.fmtDate(b.date) + ' • ' + esc(b.payMode) + '</span></div><div class="r"><b style="font-size:20px">' + PD.money(b.total) + '</b></div></div><div class="tw" style="margin-top:12px"><table class="t"><thead><tr><th>Item</th><th>Batch</th><th>Expiry</th><th class="r">Qty</th><th class="r">Free</th><th class="r">Rate</th><th class="r">MRP</th><th class="r">Disc</th><th class="r">GST</th><th class="r">Amount</th></tr></thead><tbody>' +
    b.lines.map(function (l) { return '<tr><td><b>' + esc(svc.itemName(l.itemId)) + '</b></td><td>' + esc(l.batchNo) + '</td><td>' + PD.expBadge(l.expiry) + '</td><td class="r">' + PD.qty(l.qty) + ' ' + (l.unit === 'purchase' ? 'box' : '') + '</td><td class="r">' + PD.qty(l.free) + '</td><td class="r">' + PD.n2(l.rate) + '</td><td class="r">' + PD.n2(l.mrp) + '</td><td class="r">' + l.disc + '%</td><td class="r">' + l.tax + '%</td><td class="r">' + PD.n2(l.amount) + '</td></tr>'; }).join('') +
    '</tbody><tfoot><tr><td colspan="9" class="r">Taxable ' + PD.n2(b.taxable) + ' + GST ' + PD.n2(b.tax) + '</td><td class="r">' + PD.n2(b.total) + '</td></tr></tfoot></table></div>';
}
PD.showPurchase = function (b) { PD.modal({ title: 'Purchase invoice', size: 'xl', body: invoiceView(b), foot: [{ label: 'Close' }, { label: 'Print', icon: 'print', fn: function () { PD.printHTML('<h2>' + esc(PD.DB.shop.name) + '</h2>' + invoiceView(b)); return false; } }] }); };

/* ---------- purchase view ---------- */
PD.views.purchase = { render: function (host, arg) {
  var D = PD.DB, tab = (arg && arg.tab) || 'new';
  host.innerHTML = '<div class="tabs" id="pt" style="margin-bottom:16px">' + [['new', 'New purchase invoice'], ['list', 'Invoices & tracking'], ['ret', 'Purchase returns']].map(function (t) { return '<button data-t="' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div><div id="pc"></div>';
  var pc = $('#pc', host);
  function show(t, a) { PD.$$('#pt button', host).forEach(function (b) { b.classList.toggle('on', b.dataset.t === t); }); pc.innerHTML = ''; ({ 'new': newInvoice, list: list, ret: returns })[t](pc, a); }
  PD.on($('#pt', host), 'click', 'button', function (e, b) { show(b.dataset.t); });

  function newInvoice(el, a) {
    var pre = (arg && arg.prefill) || {}, grid, supplier = pre.supplierId || '', linkedOnly = true;
    el.innerHTML = '<div class="msw pw"><div class="msband"><span class="mslogo">' + PD.icon('pill') + '</span><b>Medismart</b></div><div class="subtab"><span>Purchase Invoice</span></div>' +
      '<div class="phead"><fieldset><legend>Invoice Details</legend><div class="pf"><label>Sl.No :</label><input class="in" readonly value="' + ((D.counters.PI || 0) + 1) + '"></div>' +
      '<div class="pf"><label>Date :</label>' + PD.field({ k: 'date', label: '', type: 'date' }, PD.today()) + '</div><div class="pf"><label>Invoice No :</label>' + PD.field({ k: 'invNo', label: '' }, pre.invNo || '') + '</div><div class="pf"><label>Due Date :</label>' + PD.field({ k: 'dueDate', label: '', type: 'date' }, PD.addDays(PD.today(), 30)) + '</div></fieldset>' +
      '<fieldset class="sd"><legend>Supplier Details</legend><div class="pf wide"><label>Name :</label>' + PD.field({ k: 'supplierId', label: '', type: 'select', options: supOpts, req: true }, supplier) + '</div>' +
      '<div class="pf wide"><label>Order :</label><select class="in" id="po"></select><label>Delivery Note :</label><select class="in" id="dn"></select></div>' +
      '<div class="pf wide"><label>&nbsp;</label><label class="chk"><input type="checkbox" id="lo" checked> Only items linked to supplier</label><label class="chk"><input type="checkbox" id="cashp"> Cash purchase</label></div></fieldset></div>' +
      '<div class="pgrid" id="gr"></div><div id="cmp"></div>' +
      '<div class="msbot"><div class="mspanel"><div class="subtabs"><span class="on">&nbsp;&nbsp;.&nbsp;&nbsp;</span><span>Allocation</span></div><div class="mspb"><div class="r3"><label>Item count :</label><b id="ic">0</b></div><div class="r3"><span class="hint">Quantity can be entered in purchase unit (box) or sales unit (strip). Enter jumps to the next field.</span></div></div></div>' +
      '<div class="mstot"><div class="tl"><label>Total :</label><input class="in" id="t1" readonly value="0.00"></div><div class="tl"><label>Tax :</label><input class="in" id="t2" readonly value="0.00"></div><div class="tl"><label>Cess :</label><input class="in" readonly value="0.00"></div><div class="net"><span>Net Total :</span><b id="t3">0.00</b></div></div></div>' +
      '<div class="msbtns"><button class="mb" id="clr">✕ Delete</button><button class="mb" id="imp">Import</button><button class="mb" id="pv">◀ Previous</button><button class="mb" id="nx">Next ▶</button><span class="sp"></span><button class="mb" id="nw">New</button><button class="mb" id="sv">💾 Save</button></div></div>';
    var sup = $('[data-k=supplierId]', el);
    var poSel = $('#po', el), dnSel = $('#dn', el);
    function newLine() { return { itemId: '', batchNo: '', expiry: '', unit: 'purchase', qty: '', free: '', rate: '', mrp: '', disc: 0, tax: D.settings.defaultTax }; }
    function unitOpts(l) { var it = l.itemId ? svc.item(l.itemId) : null; return it ? [['purchase', it.punit || 'Box'], ['sale', it.unit || 'Strip']] : [['purchase', 'Box'], ['sale', 'Strip']]; }
    grid = PD.grid($('#gr', el), {
      id: 'pi-grid', newLine: newLine,
      itemFilter: function (it) { if (!linkedOnly || !sup.value) return true; var s = svc.supplier(sup.value), L = s && s.links; if (!L || (!L.mfrs.length && !L.items.length)) return true; return L.mfrs.indexOf(it.mfrId) >= 0 || L.items.indexOf(it.id) >= 0; },
      cols: [
        { k: 'item', label: 'Item', type: 'item', always: true },
        { k: 'batchNo', label: 'Batch no.', w: 90 }, { k: 'expiry', label: 'Expiry', type: 'month', w: 130 },
        { k: 'unit', label: 'Unit', type: 'select', options: unitOpts, w: 80 }, { k: 'qty', label: 'Qty', type: 'number', align: 'r', w: 70 }, { k: 'free', label: 'Free', type: 'number', align: 'r', w: 60 },
        { k: 'rate', label: 'Rate / unit', type: 'number', align: 'r', w: 90 }, { k: 'mrp', label: 'MRP (per ' + 'strip)', type: 'number', align: 'r', w: 80 }, { k: 'disc', label: 'Disc %', type: 'number', align: 'r', w: 60 }, { k: 'tax', label: 'GST %', type: 'number', align: 'r', w: 60 },
        { k: 'amt', label: 'Amount', type: 'calc', align: 'r', calc: function (l) { return PD.n2(svc.calcPurchaseLine(l).amount); } }, { k: 'del', label: '', type: 'del', always: true }
      ],
      onItem: function (l, it) {
        l.tax = it.tax; l.mrp = it.mrp; l.unit = 'purchase';
        var lp = svc.lastPurchase(it.id, sup.value) || svc.lastPurchase(it.id);
        l.rate = lp ? (lp.line.unit === 'purchase' ? lp.line.rate : PD.r2(lp.line.rate * it.conv)) : PD.r2(it.mrp * 0.7 * (it.conv || 1));
        if (lp) l.mrp = lp.line.mrp || it.mrp;
      },
      onInput: function (l, k) { var it = l.itemId && svc.item(l.itemId); if (k === 'unit' && it) { l.rate = l.unit === 'purchase' ? PD.r2(PD.num(l.rate) * it.conv) : PD.r2(PD.num(l.rate) / it.conv); } },
      hint: function (l) {
        if (!l.itemId) return ''; var it = svc.item(l.itemId), lp = svc.lastPurchase(l.itemId, sup.value), lpa = svc.lastPurchase(l.itemId), off = svc.activeOffers(it), bits = [];
        bits.push('Stock <b>' + PD.qty(svc.stockOf(l.itemId)) + '</b> ' + esc(it.unit));
        if (lp) bits.push('Last from this supplier: rate <b>' + PD.n2(lp.line.rate) + '</b> / ' + (lp.line.unit === 'purchase' ? esc(it.punit) : esc(it.unit)) + ', MRP ' + PD.n2(lp.line.mrp) + ', free ' + PD.qty(lp.line.free) + ' (' + PD.fmtDate(lp.inv.date) + ')');
        else if (lpa) bits.push('Last purchase (other supplier): rate ' + PD.n2(lpa.line.rate) + ', MRP ' + PD.n2(lpa.line.mrp));
        off.forEach(function (o) { bits.push('<span class="badge brand">Offer: ' + esc(o.desc) + ' (buy ' + o.buyQty + ' get ' + o.freeQty + ' free)</span>'); });
        return bits.join(' • ');
      },
      onChange: function (ls) { totals(ls); compare(); }
    });
    function totals(ls) { var t = 0, x = 0; (ls || grid.lines()).forEach(function (l) { if (l.itemId) { var c = svc.calcPurchaseLine(l); t += c.taxable; x += c.taxAmt; } }); $('#t1', el).value = PD.n2(t); $('#t2', el).value = PD.n2(x); $('#t3', el).textContent = PD.n2(t + x); $('#ic', el).textContent = (ls || grid.lines()).filter(function (l) { return l.itemId; }).length; }
    function fillLinks() {
      poSel.innerHTML = '<option value="">— none —</option>' + D.pos.filter(function (p) { return p.status === 'Open' && (!sup.value || p.supplierId === sup.value); }).map(function (p) { return '<option value="' + p.id + '"' + (pre.poId === p.id ? ' selected' : '') + '>' + esc(p.no) + ' • ' + PD.fmtDate(p.date) + ' • ' + esc(svc.supName(p.supplierId)) + '</option>'; }).join('');
      dnSel.innerHTML = '<option value="">— none —</option>' + D.dnotes.filter(function (p) { return p.status === 'Pending' && (!sup.value || p.supplierId === sup.value); }).map(function (p) { return '<option value="' + p.id + '"' + (pre.dnId === p.id ? ' selected' : '') + '>' + esc(p.no) + ' • ' + PD.fmtDate(p.date) + ' • ' + esc(svc.supName(p.supplierId)) + '</option>'; }).join('');
    }
    function compare() {
      var po = poSel.value && D.pos.find(function (p) { return p.id === poSel.value; }), c = $('#cmp', el); if (!po) { c.innerHTML = ''; return; }
      var got = {}; grid.lines().forEach(function (l) { if (l.itemId) { var cv = svc.calcPurchaseLine(l); got[l.itemId] = (got[l.itemId] || 0) + cv.qtyS + cv.freeS; } });
      var ord = {}; po.lines.forEach(function (l) { var it = svc.item(l.itemId); ord[l.itemId] = (ord[l.itemId] || 0) + l.qty * (l.unit === 'purchase' ? it.conv : 1); });
      var ids = Object.keys(ord).concat(Object.keys(got).filter(function (k) { return !ord[k]; }));
      c.innerHTML = '<div class="card" style="margin-top:14px"><div class="hd"><h3 style="padding:0;border:0">Invoice vs purchase order ' + esc(po.no) + '</h3></div><div class="tw"><table class="t"><thead><tr><th>Item</th><th class="r">Ordered</th><th class="r">Invoiced (incl. free)</th><th>Result</th></tr></thead><tbody>' + ids.map(function (id) { var o = ord[id] || 0, g = got[id] || 0, d = g - o; return '<tr><td>' + esc(svc.itemName(id)) + '</td><td class="r">' + PD.qty(o) + '</td><td class="r">' + PD.qty(g) + '</td><td>' + (d === 0 ? '<span class="badge ok">Matches</span>' : d < 0 ? '<span class="badge bad">Short by ' + PD.qty(-d) + '</span>' : '<span class="badge warn">Extra ' + PD.qty(d) + '</span>') + '</td></tr>'; }).join('') + '</tbody></table></div></div>';
    }
    fillLinks();
    poSel.onchange = function () { var po = D.pos.find(function (p) { return p.id === poSel.value; }); if (po) { sup.value = po.supplierId; fillLinks(); poSel.value = po.id; grid.setLines(po.lines.map(function (l) { var it = svc.item(l.itemId); return { itemId: l.itemId, batchNo: '', expiry: '', unit: l.unit || 'purchase', qty: l.qty, free: '', rate: l.rate || '', mrp: it.mrp, disc: 0, tax: it.tax }; })); } compare(); };
    dnSel.onchange = function () { var dn = D.dnotes.find(function (p) { return p.id === dnSel.value; }); if (dn) { sup.value = dn.supplierId; fillLinks(); dnSel.value = dn.id; grid.setLines(dn.lines.map(function (l) { var it = svc.item(l.itemId), lp = svc.lastPurchase(l.itemId, dn.supplierId); return { itemId: l.itemId, batchNo: l.batchNo, expiry: l.expiry, unit: l.unit || 'purchase', qty: l.qty, free: l.free, rate: lp ? (lp.line.unit === (l.unit || 'purchase') ? lp.line.rate : '') : '', mrp: l.mrp || it.mrp, disc: 0, tax: it.tax }; })); PD.toast('Delivery note loaded. Enter the rates from the invoice.'); } };
    sup.onchange = function () { fillLinks(); };
    $('#lo', el).onchange = function () { linkedOnly = this.checked; };
    if (pre.lines) grid.setLines(pre.lines); else grid.addLine(false);
    if (pre.poId) { poSel.value = pre.poId; } if (pre.dnId) { dnSel.value = pre.dnId; }
    $('#nw', el).onclick = $('#clr', el).onclick = function () { arg = null; show('new'); };
    $('#imp', el).onclick = function () { if (!dnSel.value) { PD.toast('Pick a delivery note in the Delivery Note box first'); dnSel.focus(); } else dnSel.onchange(); };
    var bi = -1; function brow(d) { var all = D.purchases.slice().sort(function (a, b) { return (a.date + a.no).localeCompare(b.date + b.no); }); if (!all.length) { PD.toast('No saved invoices yet'); return; } bi = bi < 0 ? all.length - 1 : Math.max(0, Math.min(all.length - 1, bi + d)); PD.showPurchase(all[bi]); }
    $('#pv', el).onclick = function () { brow(0 === bi + 1 ? 0 : -1); }; $('#nx', el).onclick = function () { brow(1); };
    $('#sv', el).onclick = function () {
      try {
        var f = PD.readForm(el, [{ k: 'supplierId', label: 'Supplier', req: true }, { k: 'invNo', label: 'Invoice no.' }, { k: 'date', label: 'Date', type: 'date', req: true }, { k: 'dueDate', label: 'Due', type: 'date' }]); f.payMode = $('#cashp', el).checked ? 'cash' : 'credit';
        var lines = grid.lines().filter(function (l) { return l.itemId; });
        lines.forEach(function (l) { var it = svc.item(l.itemId); if (it.batch !== false && (!l.batchNo || !l.expiry)) throw new Error('Batch number and expiry are required for ' + it.name); if (!(PD.num(l.rate) > 0)) throw new Error('Enter the rate for ' + it.name); if (!(PD.num(l.mrp) > 0)) throw new Error('Enter the MRP for ' + it.name); });
        var inv = svc.postPurchase({ supplierId: f.supplierId, invNo: f.invNo, date: f.date, dueDate: f.dueDate, payMode: f.payMode, lines: lines, poId: poSel.value, dnId: dnSel.value });
        PD.toast('Saved ' + inv.no + ' • ' + PD.money(inv.total), 'ok'); arg = null; show('list');
      } catch (e) { PD.err(e); }
    };
  }

  function list(el) {
    el.innerHTML = '<div id="pl"></div>';
    PD.report($('#pl', el), { id: 'pur-list', title: 'Purchase invoices (search by supplier or item)',
      filters: [{ k: 'from', label: 'From', type: 'date', val: function () { return PD.addDays(PD.today(), -90); } }, { k: 'to', label: 'To', type: 'date', val: PD.today() }, { k: 'sup', label: 'Supplier', type: 'select', options: function () { return [['', 'All suppliers']].concat(D.suppliers.map(function (s) { return [s.id, s.name]; })); } }, { k: 'item', label: 'Contains item', w: 170 }],
      load: function (f) {
        var ql = (f.item || '').toLowerCase(), rows = D.purchases.filter(function (p) { return p.date >= f.from && p.date <= f.to && (!f.sup || p.supplierId === f.sup) && (!ql || p.lines.some(function (l) { return svc.itemName(l.itemId).toLowerCase().indexOf(ql) >= 0; })); }).slice().reverse();
        return { cols: [{ k: 'no', label: 'Entry no.' }, { k: 'date', label: 'Date', fmt: PD.fmtDate }, { k: 'invNo', label: 'Supplier inv.' }, { k: 'sup', label: 'Supplier' }, { k: 'n', label: 'Items', align: 'r' }, { k: 'taxable', label: 'Taxable', align: 'r', sum: true, fmt: PD.n2 }, { k: 'tax', label: 'GST', align: 'r', sum: true, fmt: PD.n2 }, { k: 'total', label: 'Total', align: 'r', sum: true, fmt: PD.n2 }, { k: 'mode', label: 'Payment', fmt: function (v) { return '<span class="badge ' + (v === 'cash' ? 'ok' : 'warn') + '">' + v + '</span>'; } }],
          rows: rows.map(function (p) { return { id: p.id, no: p.no, date: p.date, invNo: p.invNo, sup: svc.supName(p.supplierId), n: p.lines.length, taxable: p.taxable, tax: p.tax, total: p.total, mode: p.payMode }; }) };
      },
      drill: function (r) { PD.showPurchase(D.purchases.find(function (p) { return p.id === r.id; })); } });
  }

  function returns(el) {
    el.innerHTML = '<div class="card"><div class="bd"><div class="form" style="grid-template-columns:2fr 1fr 1fr">' + PD.field({ k: 'sup', label: 'Return goods to supplier', type: 'select', options: supOpts }, '') + PD.field({ k: 'date', label: 'Date', type: 'date' }, PD.today()) + PD.field({ k: 'why', label: 'Reason' }, '') + '</div></div><div id="rt"></div><div class="bd row" style="justify-content:flex-end"><button class="btn p" id="rsv">' + PD.icon('ret') + 'Save purchase return</button></div></div><div id="rlst" style="margin-top:16px"></div>';
    function loadSup() {
      var sid = $('[data-k=sup]', el).value, bs = D.batches.filter(function (b) { return b.qty > 0 && (!sid || b.supplierId === sid); });
      $('#rt', el).innerHTML = bs.length ? '<div class="tw" style="max-height:46vh"><table class="t"><thead><tr><th>Item</th><th>Batch</th><th>Expiry</th><th class="r">In stock</th><th class="r">Cost</th><th class="r">Return qty</th></tr></thead><tbody>' + bs.map(function (b) { return '<tr><td><b>' + esc(svc.itemName(b.itemId)) + '</b></td><td>' + esc(b.batchNo) + '</td><td>' + PD.expBadge(b.expiry) + '</td><td class="r">' + PD.qty(b.qty) + '</td><td class="r">' + PD.n2(b.rate) + '</td><td class="r"><input class="in sm" data-rb="' + b.id + '" type="number" min="0" max="' + b.qty + '" step="any" style="width:80px"></td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="empty">' + (sid ? 'No stock from this supplier.' : 'Choose a supplier to list their batches.') + '</div>';
    }
    $('[data-k=sup]', el).onchange = loadSup; loadSup();
    $('#rsv', el).onclick = function () {
      try { var sid = $('[data-k=sup]', el).value; if (!sid) throw new Error('Choose a supplier');
        var lines = PD.$$('[data-rb]', el).map(function (i) { return { batchId: i.dataset.rb, qty: PD.num(i.value) }; }).filter(function (l) { return l.qty > 0; });
        var r = svc.postPurchaseReturn({ supplierId: sid, date: $('[data-k=date]', el).value, reason: $('[data-k=why]', el).value, lines: lines }); PD.toast('Return ' + r.no + ' saved • ' + PD.money(r.total), 'ok'); show('ret');
      } catch (e) { PD.err(e); }
    };
    PD.report($('#rlst', el), { id: 'pur-ret', title: 'Purchase returns', load: function () { return { cols: [{ k: 'no', label: 'No.' }, { k: 'date', label: 'Date', fmt: PD.fmtDate }, { k: 'sup', label: 'Supplier' }, { k: 'n', label: 'Lines', align: 'r' }, { k: 'total', label: 'Value', align: 'r', sum: true, fmt: PD.n2 }, { k: 'reason', label: 'Reason' }], rows: D.preturns.slice().reverse().map(function (r) { return { no: r.no, date: r.date, sup: svc.supName(r.supplierId), n: r.lines.length, total: r.total, reason: r.reason }; }) }; } });
  }
  show(tab);
} };

/* ---------- orders & delivery notes ---------- */
PD.views.orders = { render: function (host, arg) {
  var D = PD.DB, tab = (arg && arg.tab) || 'po';
  host.innerHTML = '<div class="tabs" id="ot" style="margin-bottom:16px">' + [['po', 'Purchase orders'], ['auto', 'Auto-create orders'], ['dn', 'Delivery notes']].map(function (t) { return '<button data-t="' + t[0] + '" class="' + (t[0] === tab ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div><div id="oc"></div>';
  var oc = $('#oc', host);
  function show(t) { PD.$$('#ot button', host).forEach(function (b) { b.classList.toggle('on', b.dataset.t === t); }); oc.innerHTML = ''; ({ po: poList, auto: auto, dn: dnotes })[t](oc); }
  PD.on($('#ot', host), 'click', 'button', function (e, b) { show(b.dataset.t); });

  function poHTML(p) { return '<h3>Purchase order ' + esc(p.no) + '</h3><div>' + esc(svc.supName(p.supplierId)) + ' • ' + PD.fmtDate(p.date) + '</div><br><table><thead><tr><th>#</th><th>Item</th><th class="r">Qty</th><th>Unit</th><th>Note</th></tr></thead><tbody>' + p.lines.map(function (l, i) { var it = svc.item(l.itemId); return '<tr><td>' + (i + 1) + '</td><td>' + esc(svc.itemName(l.itemId)) + '</td><td class="r">' + PD.qty(l.qty) + '</td><td>' + esc(l.unit === 'purchase' ? it.punit : it.unit) + '</td><td>' + esc(l.note || '') + '</td></tr>'; }).join('') + '</tbody></table>'; }
  function savePO(supplierId, lines, notes) {
    var p = { id: PD.uid('po'), no: svc.docNo('PO-', 'PO'), date: PD.today(), supplierId: supplierId, lines: lines, status: 'Open', notes: notes || '' };
    D.pos.push(p); PD.log('Purchase order ' + p.no, svc.supName(supplierId)); PD.save(); return p;
  }
  function poList(el) {
    el.innerHTML = '<div class="row" style="margin-bottom:12px"><button class="btn p" id="npo">' + PD.icon('plus') + 'New purchase order</button></div><div id="pl"></div>';
    PD.report($('#pl', el), { id: 'po-list', title: 'Purchase orders', load: function () { return { cols: [{ k: 'no', label: 'PO no.' }, { k: 'date', label: 'Date', fmt: PD.fmtDate }, { k: 'sup', label: 'Supplier' }, { k: 'n', label: 'Items', align: 'r' }, { k: 'status', label: 'Status', fmt: function (v) { return '<span class="badge ' + (v === 'Open' ? 'warn' : 'ok') + '">' + v + '</span>'; } }], rows: D.pos.slice().reverse().map(function (p) { return { id: p.id, no: p.no, date: p.date, sup: svc.supName(p.supplierId), n: p.lines.length, status: p.status }; }) }; },
      drill: function (r) { var p = D.pos.find(function (x) { return x.id === r.id; }); PD.modal({ title: 'Purchase order ' + p.no, size: 'lg', body: poHTML(p).replace(/<h3>.*?<\/h3>/, '').replace(/<table>/, '<table class="t">'), foot: [{ label: 'Close' }, { label: 'Print', icon: 'print', fn: function () { PD.printHTML('<h2>' + esc(D.shop.name) + '</h2>' + poHTML(p)); return false; } }].concat(p.status === 'Open' ? [{ label: 'Receive against this PO', cls: 'p', fn: function () { PD.go('purchase', { tab: 'new', prefill: { supplierId: p.supplierId, poId: p.id, lines: p.lines.map(function (l) { var it = svc.item(l.itemId); return { itemId: l.itemId, batchNo: '', expiry: '', unit: l.unit || 'purchase', qty: l.qty, free: '', rate: l.rate || '', mrp: it.mrp, disc: 0, tax: it.tax }; }) } }); } }, { label: 'Cancel PO', cls: 'd', fn: function () { p.status = 'Cancelled'; PD.save(); show('po'); } }] : []) }); } });
    $('#npo', el).onclick = function () {
      var grid, m = PD.modal({ title: 'New purchase order', size: 'xl', body: '<div class="form" style="grid-template-columns:1fr 2fr">' + PD.field({ k: 'sup', label: 'Supplier', type: 'select', options: supOpts, req: true }, '') + PD.field({ k: 'notes', label: 'Notes' }, '') + '</div><div id="pg" style="margin-top:12px"></div>', foot: [{ label: 'Cancel' }, { label: 'Create order', cls: 'p', fn: function (api) { try { var sid = PD.$('[data-k=sup]', api.body).value; if (!sid) throw new Error('Choose a supplier'); var ls = grid.lines().filter(function (l) { return l.itemId && PD.num(l.qty) > 0; }).map(function (l) { return { itemId: l.itemId, qty: PD.num(l.qty), unit: l.unit, rate: PD.num(l.rate), note: l.note }; }); if (!ls.length) throw new Error('Add items with quantity'); var p = savePO(sid, ls, PD.$('[data-k=notes]', api.body).value); PD.toast('Created ' + p.no, 'ok'); show('po'); } catch (e) { PD.err(e); return false; } } }] });
      grid = PD.grid(PD.$('#pg', m.el), { id: 'po-grid', newLine: function () { return { itemId: '', unit: 'purchase', qty: '', rate: '', note: '' }; },
        cols: [{ k: 'item', label: 'Item', type: 'item', always: true }, { k: 'unit', label: 'Unit', type: 'select', options: function (l) { var it = l.itemId && svc.item(l.itemId); return it ? [['purchase', it.punit], ['sale', it.unit]] : [['purchase', 'Box'], ['sale', 'Strip']]; } }, { k: 'qty', label: 'Qty', type: 'number', align: 'r' }, { k: 'rate', label: 'Expected rate', type: 'number', align: 'r' }, { k: 'note', label: 'Note', w: 150 }, { k: 'del', type: 'del', always: true }],
        onItem: function (l, it) { var lp = svc.lastPurchase(it.id); l.rate = lp ? lp.line.rate : ''; l.unit = lp ? lp.line.unit : 'purchase'; l.qty = 1; },
        hint: function (l) { if (!l.itemId) return ''; var it = svc.item(l.itemId), sold = svc.salesQty(PD.addDays(PD.today(), -30), PD.today())[it.id] || 0, off = svc.activeOffers(it); return 'Stock <b>' + PD.qty(svc.stockOf(it.id)) + '</b> • sold last 30 days <b>' + PD.qty(sold) + '</b> • reorder level ' + it.reorder + off.map(function (o) { return ' • <span class="badge brand">' + esc(o.desc) + '</span>'; }).join(''); } });
      grid.addLine(false);
    };
  }

  function auto(el) {
    el.innerHTML = '<div class="card"><div class="bd"><div class="form" style="grid-template-columns:repeat(4,1fr)">' + PD.field({ k: 'mode', label: 'Order basis', type: 'select', options: [['reorder', 'Items at or below reorder quantity'], ['ratio', 'Sales ratio vs current stock']] }, 'reorder') + PD.field({ k: 'days', label: 'Look at sales of last (days)', type: 'number' }, 30) + PD.field({ k: 'cover', label: 'Stock to cover (days)', type: 'number' }, 15) + '<div class="fld"><label>&nbsp;</label><button class="btn p" id="gen">' + PD.icon('order') + 'Generate suggestions</button></div></div></div></div><div id="sg" style="margin-top:14px"></div>';
    var rows = [];
    function gen() {
      var mode = $('[data-k=mode]', el).value, days = PD.num($('[data-k=days]', el).value) || 30, cover = PD.num($('[data-k=cover]', el).value) || 15;
      rows = svc.suggestPO({ mode: mode, days: days, cover: cover }).map(function (s) { var it = svc.item(s.itemId); s.qty = Math.max(1, Math.ceil(s.need / (it.conv || 1))); s.on = true; return s; });
      draw();
    }
    function draw() {
      if (!rows.length) { $('#sg', el).innerHTML = '<div class="card"><div class="empty">Nothing needs ordering right now \u{1F389}</div></div>'; return; }
      $('#sg', el).innerHTML = '<div class="card"><div class="hd"><h3 style="padding:0;border:0">Suggested order lines (' + rows.length + ')</h3><span class="sp"></span><button class="btn p" id="mk">' + PD.icon('check') + 'Create purchase orders</button></div><div class="tw"><table class="t"><thead><tr><th></th><th>Item</th><th class="r">Stock</th><th class="r">Sold</th><th class="r">Suggested</th><th>Supplier</th><th class="r">Last rate</th><th>Offer hint</th><th class="r">Order qty (box)</th></tr></thead><tbody>' + rows.map(function (s, i) { var it = svc.item(s.itemId); return '<tr><td><input type="checkbox" data-on="' + i + '"' + (s.on ? ' checked' : '') + '></td><td><b>' + esc(it.name) + '</b><br><small class="mut">' + esc(it.generic) + '</small></td><td class="r">' + PD.qty(s.stock) + '</td><td class="r">' + PD.qty(s.sold) + '</td><td class="r">' + PD.qty(s.need) + ' ' + esc(it.unit) + '</td><td><select class="in sm" data-s="' + i + '">' + supOpts().map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === s.supplierId ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></td><td class="r">' + (s.lastRate ? PD.n2(s.lastRate) : '-') + '</td><td>' + (s.offer ? '<span class="badge brand">' + esc(s.offer) + '</span>' : '') + '</td><td class="r"><input class="in sm" data-q="' + i + '" type="number" min="1" value="' + s.qty + '" style="width:70px"></td></tr>'; }).join('') + '</tbody></table></div></div>';
      PD.on($('#sg', el), 'change', '[data-on]', function (e, t) { rows[+t.dataset.on].on = t.checked; }); PD.on($('#sg', el), 'change', '[data-s]', function (e, t) { rows[+t.dataset.s].supplierId = t.value; }); PD.on($('#sg', el), 'input', '[data-q]', function (e, t) { rows[+t.dataset.q].qty = PD.num(t.value); });
      $('#mk', el).onclick = function () {
        var by = {}; rows.filter(function (r) { return r.on && r.qty > 0; }).forEach(function (r) { if (!r.supplierId) return; (by[r.supplierId] = by[r.supplierId] || []).push({ itemId: r.itemId, qty: r.qty, unit: 'purchase', rate: r.lastRate || 0 }); });
        var miss = rows.filter(function (r) { return r.on && !r.supplierId; }).length; var ids = Object.keys(by); if (!ids.length) { PD.toast('Choose a supplier for the selected lines', 'err'); return; }
        var made = ids.map(function (sid) { return savePO(sid, by[sid], 'Auto-created'); }); PD.toast('Created ' + made.map(function (p) { return p.no; }).join(', ') + (miss ? ' (' + miss + ' lines skipped: no supplier)' : ''), 'ok'); show('po');
      };
    }
    $('#gen', el).onclick = gen; gen();
  }

  function dnotes(el) {
    el.innerHTML = '<div class="row" style="margin-bottom:12px"><button class="btn p" id="ndn">' + PD.icon('plus') + 'New delivery note</button><span class="hint">Record goods when they arrive, verify them, and convert to an invoice later.</span></div><div id="dl"></div>';
    PD.report($('#dl', el), { id: 'dn-list', title: 'Delivery notes', load: function () { return { cols: [{ k: 'no', label: 'Entry no.' }, { k: 'dnNo', label: 'Supplier DN no.' }, { k: 'date', label: 'Date', fmt: PD.fmtDate }, { k: 'sup', label: 'Supplier' }, { k: 'n', label: 'Lines', align: 'r' }, { k: 'status', label: 'Status', fmt: function (v) { return '<span class="badge ' + (v === 'Pending' ? 'warn' : 'ok') + '">' + (v === 'Pending' ? 'Pending invoice' : v) + '</span>'; } }], rows: D.dnotes.slice().reverse().map(function (p) { return { id: p.id, no: p.no, dnNo: p.dnNo, date: p.date, sup: svc.supName(p.supplierId), n: p.lines.length, status: p.status }; }) }; },
      drill: function (r) { var p = D.dnotes.find(function (x) { return x.id === r.id; }); PD.modal({ title: 'Delivery note ' + p.no, size: 'lg', body: '<table class="t"><thead><tr><th>Item</th><th>Batch</th><th>Expiry</th><th class="r">Qty</th><th class="r">Free</th></tr></thead><tbody>' + p.lines.map(function (l) { return '<tr><td>' + esc(svc.itemName(l.itemId)) + '</td><td>' + esc(l.batchNo) + '</td><td>' + PD.fmtExp(l.expiry) + '</td><td class="r">' + PD.qty(l.qty) + '</td><td class="r">' + PD.qty(l.free) + '</td></tr>'; }).join('') + '</tbody></table>', foot: [{ label: 'Close' }].concat(p.status === 'Pending' ? [{ label: 'Convert to purchase invoice', cls: 'p', fn: function () { PD.go('purchase', { tab: 'new', prefill: { supplierId: p.supplierId, dnId: p.id, lines: p.lines.map(function (l) { var it = svc.item(l.itemId); return { itemId: l.itemId, batchNo: l.batchNo, expiry: l.expiry, unit: l.unit || 'purchase', qty: l.qty, free: l.free, rate: '', mrp: l.mrp || it.mrp, disc: 0, tax: it.tax }; }) } }); } }] : []) }); } });
    $('#ndn', el).onclick = function () {
      var grid, m = PD.modal({ title: 'New delivery note', size: 'xl', body: '<div class="form" style="grid-template-columns:2fr 1fr 1fr">' + PD.field({ k: 'sup', label: 'Supplier', type: 'select', options: supOpts, req: true }, '') + PD.field({ k: 'dnNo', label: 'Supplier DN / challan no.' }, '') + PD.field({ k: 'date', label: 'Date', type: 'date' }, PD.today()) + '</div><div id="dg" style="margin-top:12px"></div>', foot: [{ label: 'Cancel' }, { label: 'Save delivery note', cls: 'p', fn: function (api) { try {
        var sid = PD.$('[data-k=sup]', api.body).value; if (!sid) throw new Error('Choose a supplier');
        var ls = grid.lines().filter(function (l) { return l.itemId && PD.num(l.qty) > 0; }); if (!ls.length) throw new Error('Add received items');
        ls.forEach(function (l) { var it = svc.item(l.itemId); if (it.batch !== false && (!l.batchNo || !l.expiry)) throw new Error('Batch and expiry required for ' + it.name); });
        var dn = { id: PD.uid('dn'), no: svc.docNo('DN-', 'DN'), dnNo: PD.$('[data-k=dnNo]', api.body).value, date: PD.$('[data-k=date]', api.body).value, supplierId: sid, status: 'Pending', lines: ls.map(function (l) { return { itemId: l.itemId, batchNo: l.batchNo, expiry: l.expiry, unit: l.unit, qty: PD.num(l.qty), free: PD.num(l.free), mrp: PD.num(l.mrp) }; }) };
        D.dnotes.push(dn); PD.log('Delivery note ' + dn.no, svc.supName(sid)); PD.save(); PD.toast('Saved ' + dn.no, 'ok'); show('dn'); } catch (e) { PD.err(e); return false; } } }] });
      grid = PD.grid(PD.$('#dg', m.el), { id: 'dn-grid', newLine: function () { return { itemId: '', batchNo: '', expiry: '', unit: 'purchase', qty: '', free: '', mrp: '' }; },
        cols: [{ k: 'item', label: 'Item', type: 'item', always: true }, { k: 'batchNo', label: 'Batch', w: 90 }, { k: 'expiry', label: 'Expiry', type: 'month', w: 130 }, { k: 'unit', label: 'Unit', type: 'select', options: function (l) { var it = l.itemId && svc.item(l.itemId); return it ? [['purchase', it.punit], ['sale', it.unit]] : [['purchase', 'Box'], ['sale', 'Strip']]; } }, { k: 'qty', label: 'Qty', type: 'number', align: 'r' }, { k: 'free', label: 'Free', type: 'number', align: 'r' }, { k: 'mrp', label: 'MRP', type: 'number', align: 'r' }, { k: 'del', type: 'del', always: true }],
        onItem: function (l, it) { l.mrp = it.mrp; } });
      grid.addLine(false);
    };
  }
  show(tab);
} };
})();
