/* MediSmart-style windows: Delivery Note, Batch Edit, Expiry Claim, Item master dialog, Account Details dialog */
(function () {
'use strict';
var PD = window.PD, esc = PD.esc, svc = PD.svc, $ = PD.$;

function band() { return '<div class="msband"><span class="mslogo">' + PD.icon('pill') + '</span><b>Medismart</b></div>'; }
function supSelect(id) { return '<select class="in" id="' + id + '"><option value="">— select supplier —</option>' + PD.DB.suppliers.filter(function (s) { return s.active !== false; }).map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join('') + '</select>'; }
function field(label, inner, cls) { return '<div class="pf ' + (cls || '') + '"><label>' + label + '</label>' + inner + '</div>'; }

/* ---------- Delivery Note ---------- */
PD.views.dnote = { render: function (host) {
  var D = PD.DB, grid;
  host.innerHTML = '<div class="msw pw">' + band() + '<div class="subtab"><span>Delivery Note</span></div>' +
    '<div class="phead"><fieldset><legend>Delivery Note Details</legend>' + field('Sl.No :', '<input class="in" readonly value="' + ((D.counters.DN || 0) + 1) + '">') + field('Date :', '<input class="in" type="date" id="dd" value="' + PD.today() + '">') + field('D.Note No :', '<input class="in" id="dno">') + field('D.N.Date :', '<input class="in" type="date" id="dnd" value="' + PD.today() + '">') + '</fieldset>' +
    '<fieldset class="sd"><legend>Supplier Details</legend>' + field('Name :', supSelect('dsup'), 'wide') + field('Remarks :', '<input class="in" id="drem">', 'wide') + '</fieldset></div>' +
    '<div class="pgrid" id="gr"></div>' +
    '<div class="msbot"><div class="mspanel"><div class="subtabs"><span class="on">&nbsp;&nbsp;.&nbsp;&nbsp;</span></div><div class="mspb"><div class="r3"><label>Item count :</label><b id="ic">0</b></div><div class="r3"><span class="hint">Record goods when they arrive, then use Purchase → Purchase Invoice → Import to convert.</span></div></div></div><div class="mstot"><div class="net"><span>Lines :</span><b id="nl">0</b></div></div></div>' +
    '<div class="msbtns"><button class="mb" id="del">✕ Delete</button><button class="mb" id="lst">List</button><span class="sp"></span><button class="mb" id="nw">New</button><button class="mb" id="sv">💾 Save</button></div></div>';
  grid = PD.grid($('#gr', host), { id: 'dn-grid2', newLine: function () { return { itemId: '', batchNo: '', expiry: '', unit: 'purchase', qty: '', free: '', mrp: '' }; },
    cols: [{ k: 'item', label: 'Item Name', type: 'item', always: true }, { k: 'batchNo', label: 'Batch', w: 90 }, { k: 'expiry', label: 'Exp', type: 'month', w: 120 }, { k: 'unit', label: 'Unit', type: 'select', options: function (l) { var it = l.itemId && svc.item(l.itemId); return it ? [['purchase', it.punit], ['sale', it.unit]] : [['purchase', 'Box'], ['sale', 'Strip']]; } }, { k: 'qty', label: 'Qty', type: 'number', align: 'r', w: 64 }, { k: 'free', label: 'Free', type: 'number', align: 'r', w: 56 }, { k: 'mrp', label: 'MRP', type: 'number', align: 'r', w: 70 }, { k: 'del', type: 'del', always: true }],
    onItem: function (l, it) { l.mrp = it.mrp; },
    onChange: function (ls) { var n = ls.filter(function (l) { return l.itemId; }).length; var a = $('#ic', host), b = $('#nl', host); if (a) a.textContent = n; if (b) b.textContent = n; } });
  grid.addLine(false);
  $('#nw', host).onclick = $('#del', host).onclick = function () { PD.views.dnote.render(host); };
  $('#lst', host).onclick = function () { PD.go('orders', { tab: 'dn' }); };
  $('#sv', host).onclick = function () {
    try {
      var sid = $('#dsup', host).value; if (!sid) throw new Error('Choose a supplier');
      var ls = grid.lines().filter(function (l) { return l.itemId && PD.num(l.qty) > 0; }); if (!ls.length) throw new Error('Add received items');
      ls.forEach(function (l) { var it = svc.item(l.itemId); if (it.batch !== false && (!l.batchNo || !l.expiry)) throw new Error('Batch and expiry required for ' + it.name); });
      var dn = { id: PD.uid('dn'), no: svc.docNo('DN-', 'DN'), dnNo: $('#dno', host).value, date: $('#dd', host).value, dnDate: $('#dnd', host).value, remarks: $('#drem', host).value, supplierId: sid, status: 'Pending', lines: ls.map(function (l) { return { itemId: l.itemId, batchNo: l.batchNo, expiry: l.expiry, unit: l.unit, qty: PD.num(l.qty), free: PD.num(l.free), mrp: PD.num(l.mrp) }; }) };
      D.dnotes.push(dn); PD.log('Delivery note ' + dn.no, svc.supName(sid)); PD.save(); PD.toast('Saved ' + dn.no, 'ok'); PD.views.dnote.render(host);
    } catch (e) { PD.err(e); }
  };
} };

/* ---------- Batch Edit ---------- */
PD.views.batchedit = { render: function (host, arg) {
  var D = PD.DB, itemId = (arg && arg.itemId) || '', rows = [], sel = 0;
  host.innerHTML = '<div class="msw bew">' + band() + '<div class="beh"><div class="betitle">Batch Edit</div><div class="besub">Update Batch Details</div>' +
    '<div class="pf"><label>ID :</label><input class="in" id="bid" readonly style="width:200px"></div><div class="pf wide"><label>Name :</label><input class="in" id="bnm" placeholder="Type item name to find (F3)" autocomplete="off"></div></div>' +
    '<div class="msgrid" id="bg" style="min-height:220px"></div>' +
    '<div class="bef"><div class="befl"><span>Rate</span><span>MRP</span><span>P %</span><span>D % 1</span><span>D % 2</span><span>D % 3</span><span>D SRate 1</span><span>D SRate 2</span><span>D SRate 3</span><span>P % MRP</span></div>' +
    '<div class="befi"><input class="in" id="fr" type="number" step="any"><input class="in" id="fm" type="number" step="any"><input class="in" id="fp" readonly><input class="in" readonly><input class="in" readonly><input class="in" readonly><input class="in" readonly><input class="in" readonly><input class="in" readonly><input class="in" id="fpm" readonly></div></div>' +
    '<div class="msbtns"><span class="sp"></span><button class="mb" id="bc">Cancel</button><button class="mb" id="bu">⟲ Update</button></div></div>';
  var nm = $('#bnm', host);
  PD.combo(nm, { source: PD.itemSource({}), onPick: function (x) { itemId = x.id; load(); } });
  function load() {
    var it = itemId && svc.item(itemId); $('#bid', host).value = it ? PD.itemNo(it.id) : ''; nm.value = it ? it.name : '';
    rows = it ? D.batches.filter(function (b) { return b.itemId === itemId; }).map(function (b) { return { id: b.id, batchNo: b.batchNo, expiry: b.expiry, qty: b.qty, rate: b.rate, mrp: b.mrp, del: false }; }) : []; sel = 0; draw();
  }
  function draw() {
    var it = itemId && svc.item(itemId), conv = it ? it.conv || 1 : 1;
    $('#bg', host).innerHTML = '<table class="t"><thead><tr><th>Batch</th><th>ExpDate</th><th class="r">Qty</th><th class="r">P-S Ratio</th><th class="r">Cost</th><th class="r">S.Rate</th><th class="r">D%1</th><th class="r">D%2</th><th class="r">D%3</th><th class="r">Delete</th></tr></thead><tbody>' +
      rows.map(function (r, i) { return '<tr class="cartrow ' + (i === sel ? 'sel' : '') + '" data-r="' + i + '"><td><input class="in sm" style="text-align:left" data-f="batchNo" data-i="' + i + '" value="' + esc(r.batchNo) + '"></td><td><input class="in sm" style="text-align:left" type="month" data-f="expiry" data-i="' + i + '" value="' + esc(r.expiry) + '"></td><td class="r"><input class="in sm" type="number" step="any" data-f="qty" data-i="' + i + '" value="' + r.qty + '"></td><td class="r">' + conv + '</td><td class="r">' + PD.n2(r.rate * conv) + '</td><td class="r">' + (r.rate).toFixed(4) + '</td><td class="r">0</td><td class="r">0</td><td class="r">0</td><td class="r"><input type="checkbox" data-f="del" data-i="' + i + '"' + (r.del ? ' checked' : '') + '></td></tr>'; }).join('') + '</tbody></table>';
    var r = rows[sel]; $('#fr', host).value = r ? r.rate : ''; $('#fm', host).value = r ? r.mrp : ''; calc();
  }
  function calc() { var r = rows[sel]; if (!r) { $('#fp', host).value = ''; $('#fpm', host).value = ''; return; } $('#fp', host).value = r.rate > 0 ? (((r.mrp - r.rate) / r.rate) * 100).toFixed(2) : ''; $('#fpm', host).value = r.mrp > 0 ? (((r.mrp - r.rate) / r.mrp) * 100).toFixed(2) : ''; }
  PD.on($('#bg', host), 'click', '[data-r]', function (e, t) { sel = +t.dataset.r; PD.$$('#bg tr.cartrow', host).forEach(function (x) { x.classList.toggle('sel', x === t); }); var r = rows[sel]; $('#fr', host).value = r.rate; $('#fm', host).value = r.mrp; calc(); });
  PD.on($('#bg', host), 'input', '[data-f]', function (e, t) { var r = rows[+t.dataset.i]; if (t.type === 'checkbox') r.del = t.checked; else r[t.dataset.f] = t.dataset.f === 'qty' ? PD.num(t.value) : t.value; });
  $('#fr', host).oninput = function () { if (rows[sel]) { rows[sel].rate = PD.num(this.value); calc(); } };
  $('#fm', host).oninput = function () { if (rows[sel]) { rows[sel].mrp = PD.num(this.value); calc(); } };
  $('#bc', host).onclick = function () { itemId = ''; load(); };
  $('#bu', host).onclick = function () {
    try {
      if (!rows.length) throw new Error('Find an item first');
      rows.forEach(function (r) { svc.adjustBatch(r.id, { batchNo: r.batchNo, expiry: r.expiry, qty: r.del ? 0 : r.qty, rate: r.rate, mrp: r.mrp }, r.del ? 'Batch deleted (qty zeroed)' : 'Batch edit'); });
      PD.toast('Batch details updated', 'ok'); load();
    } catch (e) { PD.err(e); }
  };
  PD.hotkeys = {}; PD.hotkeys.F3 = { el: host, fn: function () { nm.focus(); nm.select(); } };
  load(); if (!itemId) nm.focus();
} };

/* ---------- Expiry Claim ---------- */
PD.views.expclaim = { render: function (host, arg) {
  var D = PD.DB, tab = (arg && arg.tab) || 'claim', left = [], right = [], total = 0;
  host.innerHTML = '<div class="msw ecw">' + band() + '<div class="subtabs bigtabs"><span data-t="claim" class="' + (tab === 'claim' ? 'on' : '') + '">Claim</span><span data-t="uncl" class="' + (tab === 'uncl' ? 'on' : '') + '">Unclaimed</span></div><div id="ecb"></div></div>';
  PD.on(host, 'click', '[data-t]', function (e, t) { PD.views.expclaim.render(host, { tab: t.dataset.t }); });
  var b = $('#ecb', host);
  if (tab === 'uncl') {
    var rs = D.damage.filter(function (d) { return d.status === 'Pending'; }).slice().reverse();
    b.innerHTML = '<div class="msgrid" style="margin:8px 10px;max-height:60vh"><table class="t"><thead><tr><th>Date</th><th>Supplier</th><th>Item</th><th>Batch</th><th>Exp</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th><th>Reason</th></tr></thead><tbody>' + (rs.map(function (d) { return '<tr><td>' + PD.fmtDate(d.date) + '</td><td>' + esc(svc.supName(d.supplierId)) + '</td><td>' + esc(svc.itemName(d.itemId)) + '</td><td>' + esc(d.batchNo) + '</td><td>' + PD.fmtExp(d.expiry) + '</td><td class="r">' + PD.qty(d.qty) + '</td><td class="r">' + PD.n2(d.rate) + '</td><td class="r">' + PD.n2(d.amount) + '</td><td>' + esc(d.reason) + '</td></tr>'; }).join('') || '<tr><td colspan="9"><div class="empty">No unclaimed items.</div></td></tr>') + '</tbody></table></div>';
    return;
  }
  b.innerHTML = '<div class="echd"><div class="pf"><label>Serial No :</label><input class="in" readonly value="' + ((D.damage.length ? new Set(D.damage.map(function (d) { return d.claimNo || ''; })).size : 0) + 1) + '" style="width:90px"></div><div class="pf"><label>Date :</label><input class="in" type="date" id="cd" value="' + PD.today() + '"></div>' +
    '<div class="pf wide"><label>Supplier Name :</label>' + supSelect('csup') + '</div><div class="pf"><label>Pricing :</label><select class="in" id="cpr"><option>By MRP</option><option>By Cost</option></select></div>' +
    '<div class="pf"><label>Selection Type :</label><select class="in" id="cst"><option value="p">Purchased items only</option><option value="a">All items</option></select><select class="in" id="cwin"><option value="0">Expired</option><option value="30">Expiring in 30 days</option><option value="60">Expiring in 60 days</option><option value="90">Expiring in 90 days</option></select></div>' +
    '<div class="pf wide"><label>Manufacturer :</label><select class="in" id="cmf"><option value="">All</option>' + D.mfrs.map(function (m) { return '<option value="' + m.id + '">' + esc(m.name) + '</option>'; }).join('') + '</select><button class="mb bx" id="cdisp">Display</button></div></div>' +
    '<div class="ecg"><div class="msgrid" id="lg"></div><div class="msgrid" id="rg"></div></div>' +
    '<div class="msbtns ecf"><label>Remarks :</label><input class="in" id="crm" style="flex:1"><label>Total Amount :</label><input class="in" id="ctot" readonly value="0.0000" style="width:110px;text-align:right"><button class="mb" id="cpr2">🖶 Print</button><button class="mb" id="cdl">✕ Delete</button><button class="mb" id="cup">💾 Update</button></div>';
  function drawL() {
    $('#lg', host).innerHTML = '<table class="t"><thead><tr><th>ID</th><th>Name</th><th>Exp</th><th class="r">ExpQty</th><th class="r">PQty</th><th class="r">PFQty</th><th>Unit</th><th class="r">MRP</th></tr></thead><tbody>' + (left.map(function (r, i) { var it = svc.item(r.itemId), pq = D.purchases.reduce(function (a, p) { return a + (p.id === r.purId ? p.lines.filter(function (l) { return l.itemId === r.itemId && l.batchNo === r.batchNo; }).reduce(function (x, l) { return x + PD.num(l.qty); }, 0) : 0); }, 0); return '<tr class="cartrow" data-l="' + i + '"><td>' + PD.itemNo(r.itemId) + '</td><td>' + esc(it.name) + '</td><td>' + PD.fmtExp(r.expiry) + '</td><td class="r">' + PD.qty(r.qty) + '</td><td class="r">' + PD.qty(pq) + '</td><td class="r">0</td><td>' + esc(it.unit) + '</td><td class="r">' + PD.n2(r.mrp) + '</td></tr>'; }).join('') || '<tr><td colspan="8"><div class="empty">Choose supplier and press Display.</div></td></tr>') + '</tbody></table>';
  }
  function drawR() {
    total = 0; right.forEach(function (r) { total += r.qty * (($('#cpr', host).value === 'By Cost') ? r.rate : r.mrp); });
    $('#rg', host).innerHTML = '<table class="t"><thead><tr><th>ID</th><th>Name</th><th>Manu..</th><th>batch</th><th>Exp</th><th class="r">Qty</th><th>Unit</th><th class="r">MRP</th><th>Expiry</th></tr></thead><tbody>' + right.map(function (r, i) { var it = svc.item(r.itemId); return '<tr class="cartrow" data-x="' + i + '"><td>' + PD.itemNo(r.itemId) + '</td><td>' + esc(it.name) + '</td><td>' + esc(svc.mfrName(it.mfrId)) + '</td><td>' + esc(r.batchNo) + '</td><td>' + PD.fmtExp(r.expiry) + '</td><td class="r">' + PD.qty(r.qty) + '</td><td>' + esc(it.unit) + '</td><td class="r">' + PD.n2(r.mrp) + '</td><td><input type="checkbox" checked disabled></td></tr>'; }).join('') + '</tbody></table>';
    $('#ctot', host).value = total.toFixed(4);
  }
  $('#cdisp', host).onclick = function () {
    var sid = $('#csup', host).value, w = +$('#cwin', host).value, mf = $('#cmf', host).value, onlyP = $('#cst', host).value === 'p';
    if (!sid) { PD.toast('Choose a supplier first', 'err'); return; }
    left = D.batches.filter(function (x) { if (!(x.qty > 0) || !x.expiry) return false; var d = PD.daysToExp(x.expiry); if (w === 0 ? d >= 0 : d > w) return false; var it = svc.item(x.itemId); return (!onlyP || x.supplierId === sid) && (!mf || (it && it.mfrId === mf)) && !right.some(function (r) { return r.id === x.id; }); }).sort(function (a, c) { return a.expiry.localeCompare(c.expiry); });
    drawL();
  };
  PD.on($('#lg', host), 'dblclick', '[data-l]', function (e, t) { var r = left.splice(+t.dataset.l, 1)[0]; right.push(r); drawL(); drawR(); });
  PD.on($('#lg', host), 'click', '[data-l]', function (e, t) { PD.$$('#lg tr.cartrow', host).forEach(function (x) { x.classList.toggle('sel', x === t); }); });
  PD.on($('#rg', host), 'dblclick', '[data-x]', function (e, t) { var r = right.splice(+t.dataset.x, 1)[0]; left.push(r); drawL(); drawR(); });
  $('#cpr', host).onchange = drawR;
  $('#cdl', host).onclick = function () { left = []; right = []; drawL(); drawR(); };
  $('#cup', host).onclick = function () {
    try {
      var sid = $('#csup', host).value; if (!sid) throw new Error('Choose a supplier'); if (!right.length) throw new Error('Double-click rows on the left to add them to the claim');
      var cn = 'CL-' + Date.now().toString(36).toUpperCase();
      right.forEach(function (r) { var d = svc.moveToDamage({ batchId: r.id, qty: svc.batch(r.id).qty, reason: PD.daysToExp(r.expiry) < 0 ? 'Expired' : 'Near expiry (return)', note: $('#crm', host).value, supplierId: sid }); d.claimNo = cn; d.status = 'Claimed'; });
      PD.save(); PD.toast('Claim details updated', 'ok');
      PD.confirm('Print details?', 'Yes').then(function (ok) { var rows = right.slice(); if (ok) PD.printHTML('<h2>' + esc(D.shop.name) + '</h2><h3>Expiry claim</h3><div>To: <b>' + esc(svc.supName(sid)) + '</b> • ' + PD.fmtDate(PD.today()) + '</div><br><table><thead><tr><th>Item</th><th>Batch</th><th>Exp</th><th class="r">Qty</th><th class="r">Rate</th></tr></thead><tbody>' + rows.map(function (r) { return '<tr><td>' + esc(svc.itemName(r.itemId)) + '</td><td>' + esc(r.batchNo) + '</td><td>' + PD.fmtExp(r.expiry) + '</td><td class="r">' + PD.qty(r.qty) + '</td><td class="r">' + PD.n2(r.mrp) + '</td></tr>'; }).join('') + '</tbody></table>'); });
      left = []; right = []; drawL(); drawR();
    } catch (e) { PD.err(e); }
  };
  $('#cpr2', host).onclick = function () { if (!right.length) { PD.toast('Nothing to print', 'err'); return; } PD.printHTML('<h2>' + esc(D.shop.name) + '</h2><h3>Expiry claim (draft)</h3><table><tbody>' + right.map(function (r) { return '<tr><td>' + esc(svc.itemName(r.itemId)) + '</td><td>' + esc(r.batchNo) + '</td><td class="r">' + PD.qty(r.qty) + '</td></tr>'; }).join('') + '</tbody></table>'); };
  drawL(); drawR();
} };

/* ---------- Item master dialog ---------- */
function bluePage(title, sub, icon, inner) { return '<div class="bluepg"><div class="bluelogo">' + PD.icon('pill') + 'Medi<em>smart</em></div><div class="dlg"><div class="dlgh"><span class="dico">' + PD.icon(icon) + '</span><div><b>' + title + '</b><br><small>' + sub + '</small></div></div>' + inner + '</div></div>'; }
PD.views.itemdlg = { render: function (host, arg) {
  var D = PD.DB, cur = null;
  var F = [['name', 'Name :', 'text', 1], ['generic', 'Generic Name :', 'text', 1], ['pack', 'Pack :', 'text'], ['tax', 'GST % :', 'number'], ['hsn', 'HSN code :', 'text'], ['per', 'Tablets per strip :', 'number'], ['sunit', 'Shop sells as (Tab / Cap / ml) :', 'text'], ['cat', 'Type :', 'sel:cat'], ['schedule', 'Schedule :', 'sel:sch'], ['mfrId', 'Manufacturer :', 'sel:mfr'], ['division', 'Division :', 'text'], ['reorder', 'Reorder level (strips) :', 'number'], ['margin', 'Margin % :', 'number'], ['rack', 'Shelf * :', 'shelf'], ['mrp', 'MRP per strip :', 'number'], ['remarks', 'Remarks :', 'text', 1]];
  function ctl(f, v) {
    var k = f[0], t = f[2], a = ' data-k="' + k + '"';
    if (t === 'shelf') return '<input class="in"' + a + ' list="shelfs" value="' + esc(v == null ? '' : v) + '" placeholder="e.g. A1" style="border-color:#2f6fb3"><datalist id="shelfs">' + svc.shelfList().map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>';
    if (t.indexOf('sel:') === 0) { var o = t === 'sel:cat' ? PD.CATS.map(function (c) { return [c, c]; }) : t === 'sel:sch' ? [['', 'None'], ['G', 'G'], ['H', 'H'], ['H1', 'H1'], ['X', 'X'], ['OTC', 'OTC']] : [['', '—']].concat(D.mfrs.map(function (m) { return [m.id, m.name]; })); return '<select class="in"' + a + '>' + o.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (String(x[0]) === String(v == null ? '' : v) ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select>'; }
    return '<input class="in"' + a + ' type="' + (t === 'number' ? 'number' : 'text') + '"' + (t === 'number' ? ' step="any"' : '') + ' value="' + esc(v == null ? '' : v) + '">';
  }
  function draw() {
    var r = cur || { cat: PD.CATS[0], tax: D.settings.defaultTax, vat: 0, unit: 'Strip', punit: 'Strip', conv: 1, per: 10, sunit: 'Tab', margin: 20, reorder: 10, batch: true };
    if (cur && cur.per == null) r = Object.assign({}, cur, { per: 10, sunit: cur.sunit || 'Tab' });
    host.innerHTML = bluePage('ITEM', 'Create medicines. Shops get their list from here', 'pill', '<div class="dlgb"><div class="dlgr"><label>ID :</label><input class="in" id="iid" readonly value="' + (cur ? PD.itemNo(cur.id) : '') + '" style="width:110px"><button class="mb" id="ifind" title="Find">🔍</button><input class="in" id="ifq" placeholder="type name to find" autocomplete="off" style="flex:1"></div>' +
      '<div class="dlgg">' + F.map(function (f) { return '<div class="dlgr ' + (f[3] ? 'full' : '') + '"><label>' + f[1] + '</label>' + ctl(f, r[f[0]]) + '</div>'; }).join('') + '</div></div>' +
      '<div class="dlgf"><button class="mb" id="idl">✕ Delete</button><button class="mb" id="iup">⟲ Update</button><button class="mb" id="isv">💾 Save</button></div>');
    PD.combo($('#ifq', host), { source: PD.itemSource({}), onPick: function (x) { cur = svc.item(x.id); draw(); } });
    function read() { var v = {}; F.forEach(function (f) { var el = $('[data-k="' + f[0] + '"]', host), x = el.value; v[f[0]] = f[2] === 'number' ? (x === '' ? 0 : PD.num(x)) : x.trim(); }); if (!v.name) throw new Error('Enter the item name'); if (!v.rack) throw new Error('Give the item a shelf. This is where the strips will be kept in the warehouse.'); if (!(v.mrp > 0)) throw new Error('Enter the MRP per strip'); if (!(v.per >= 1)) throw new Error('Enter how many tablets are in one strip (1 for syrup, tube, injection)'); v.per = Math.round(v.per); v.sunit = v.sunit || 'Tab'; v.unit = 'Strip'; v.punit = 'Strip'; v.conv = 1; return v; }
    function store(isNew) {
      try {
        var v = read(), rec = isNew ? Object.assign({ batch: true, active: true }, v) : Object.assign({}, cur, v);
        if (isNew) { delete rec.id; }
        var saved = svc.saveMaster('items', rec); cur = saved; PD.toast((isNew ? 'Saved ' : 'Updated ') + saved.name, 'ok'); draw();
      } catch (e) { PD.err(e); }
    }
    $('#isv', host).onclick = function () { store(true); };
    $('#iup', host).onclick = function () { if (!cur) { PD.toast('Find an item first to update it', 'err'); return; } store(false); };
    $('#idl', host).onclick = function () { if (!cur) return; PD.confirm('Delete <b>' + esc(cur.name) + '</b>?', 'Delete', true).then(function (ok) { if (!ok) return; var m = svc.removeMaster('items', cur.id); PD.toast(typeof m === 'string' ? m : 'Deleted'); cur = null; draw(); }); };
    $('#ifind', host).onclick = function () { $('#ifq', host).focus(); };
  }
  if (arg && arg.itemId) cur = svc.item(arg.itemId);
  draw();
} };

/* ---------- Account Details dialog ---------- */
PD.views.acctdlg = { render: function (host) {
  var D = PD.DB, cur = null, GROUPS = ['Indirect Expense', 'Direct Expense', 'Indirect Income', 'Cash', 'Bank', 'Capital', 'Duties & Taxes', 'Sundry Debtors', 'Sundry Creditors'], NAT = { 'Indirect Expense': 'E', 'Direct Expense': 'E', 'Indirect Income': 'I', Cash: 'A', Bank: 'A', Capital: 'C', 'Duties & Taxes': 'L', 'Sundry Debtors': 'A', 'Sundry Creditors': 'L' };
  function draw() {
    var r = cur || { group: GROUPS[0], limitType: 'Cr', obType: 'Cr' }, y = svc.currentYear();
    host.innerHTML = bluePage('Account Details', 'Create, Find, Update, Delete Account Details', 'users', '<div class="dlgb"><div class="dlgg one">' +
      '<div class="dlgr"><label>Account Name :</label><input class="in" data-k="name" value="' + esc(r.name || '') + '" ' + (cur && cur.sys ? 'readonly' : '') + ' style="flex:1"><button class="mb" id="afind">🔍</button></div>' +
      '<div class="dlgr"><label>Alias Name :</label><input class="in" data-k="alias" value="' + esc(r.alias || '') + '"></div>' +
      '<div class="dlgr"><label>Group :</label><select class="in" data-k="group">' + GROUPS.map(function (g) { return '<option' + (g === r.group ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join('') + '</select></div>' +
      '<div class="dlgr"><label>Sub Group :</label><input class="in" data-k="sub" value="' + esc(r.sub || '') + '"></div>' +
      '<div class="dlgr"><label>Balance Limit :</label><input class="in" data-k="limit" type="number" step="any" value="' + esc(r.limit || '') + '" style="width:110px"><select class="in" data-k="limitType" style="width:56px"><option>Cr</option><option' + (r.limitType === 'Dr' ? ' selected' : '') + '>Dr</option></select></div>' +
      '<div class="dlgr"><label>Remarks :</label><textarea class="in" data-k="remarks" rows="3">' + esc(r.remarks || '') + '</textarea></div>' +
      (cur ? '' : '<div class="dlgr"><label>Opening Balance<br>Amount :</label><input class="in" data-k="ob" type="number" step="any" value="0" style="width:110px"><select class="in" data-k="obType" style="width:56px"><option>Cr</option><option>Dr</option></select><span class="hint">as on ' + PD.fmtDate(y.start) + '</span></div>') +
      '</div></div><div class="dlgf"><button class="mb" id="asl" title="Mark inactive">Sleep</button><button class="mb" id="adl">✕ Delete</button><button class="mb" id="aup">⟲ Update</button><button class="mb" id="asv">💾 Save</button></div>');
    PD.combo($('[data-k=name]', host), { source: function (q) { q = (q || '').toLowerCase(); return D.accounts.filter(function (a) { return !q || a.name.toLowerCase().indexOf(q) >= 0; }).slice(0, 40).map(function (a) { return { id: a.id, label: '<b>' + esc(a.name) + '</b>', sub: esc(a.group || ''), right: '' }; }); }, onPick: function (x) { cur = svc.acc(x.id); draw(); } });
    function rd(k) { var e = $('[data-k="' + k + '"]', host); return e ? e.value.trim() : ''; }
    $('#asv', host).onclick = function () {
      try {
        var nm = rd('name'); if (!nm) throw new Error('Enter the account name'); if (D.accounts.some(function (a) { return a.name.toLowerCase() === nm.toLowerCase(); })) throw new Error('An account with this name already exists');
        var g = rd('group'), a = { id: PD.uid('ac'), name: nm, alias: rd('alias'), group: g, sub: rd('sub'), nat: NAT[g] || 'E', limit: PD.num(rd('limit')), limitType: rd('limitType'), remarks: rd('remarks') };
        D.accounts.push(a); var ob = PD.num(rd('ob'));
        if (ob > 0) { var dr = rd('obType') === 'Dr'; svc.voucher(svc.currentYear().start > PD.today() ? PD.today() : svc.currentYear().start, 'Journal', 'Opening balance ' + nm, dr ? [{ acc: a.id, dr: ob }, { acc: 'capital', cr: ob }] : [{ acc: 'capital', dr: ob }, { acc: a.id, cr: ob }]); }
        PD.log('Account created', nm); PD.save(); PD.toast('Saved ' + nm, 'ok'); cur = null; draw();
      } catch (e) { PD.err(e); }
    };
    $('#aup', host).onclick = function () { if (!cur) { PD.toast('Find an account first', 'err'); return; } try { if (!cur.sys) { var nm = rd('name'); if (!nm) throw new Error('Enter the account name'); cur.name = nm; cur.group = rd('group'); cur.nat = NAT[cur.group] || cur.nat; } cur.alias = rd('alias'); cur.sub = rd('sub'); cur.limit = PD.num(rd('limit')); cur.limitType = rd('limitType'); cur.remarks = rd('remarks'); PD.save(); PD.toast('Updated ' + cur.name, 'ok'); draw(); } catch (e) { PD.err(e); } };
    $('#adl', host).onclick = function () { if (!cur) return; var m = svc.removeMaster('accounts', cur.id); PD.toast(typeof m === 'string' ? m : 'Deleted'); cur = null; draw(); };
    $('#asl', host).onclick = function () { if (!cur) return; cur.sleep = !cur.sleep; PD.save(); PD.toast(cur.name + (cur.sleep ? ' set to sleep' : ' re-activated')); };
    $('#afind', host).onclick = function () { $('[data-k=name]', host).focus(); };
  }
  draw();
} };
})();
