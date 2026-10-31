/* Medismart Warehouse - screens */
(function () {
'use strict';
var PD = window.PD, esc = PD.esc, svc = PD.svc, $ = PD.$;
function D() { return PD.DB; }
function band(t) { return '<div class="msband"><span class="mslogo">' + PD.icon('pill') + '</span><b>' + esc(t) + '</b></div>'; }
function field(label, inner, cls) { return '<div class="pf ' + (cls || '') + '"><label>' + label + '</label>' + inner + '</div>'; }
function badge(s) { var c = { Pending: 'warn', Dispatched: 'ok', Sent: 'info', 'Partly dispatched': 'info', Rejected: 'bad', Accepted: 'ok' }[s] || ''; return '<span class="badge ' + c + '">' + esc(s) + '</span>'; }
function download(name, obj) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
function pickFile(cb) { var i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json'; i.onchange = function () { var f = i.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { var j; try { j = JSON.parse(rd.result); } catch (e) { PD.err(new Error('This is not a valid file')); return; } try { cb(j); } catch (e) { PD.err(e); } }; rd.readAsText(f); }; i.click(); }
var AC; function beep(ok) { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); var o = AC.createOscillator(), g = AC.createGain(); o.frequency.value = ok ? 880 : 220; g.gain.value = .08; o.connect(g); g.connect(AC.destination); o.start(); setTimeout(function () { o.stop(); }, ok ? 90 : 320); } catch (e) {} }
var orm = svc.removeMaster; svc.removeMaster = function (c, id) { if (c === 'items' && D().lots.some(function (l) { return l.itemId === id; })) return 'kept (this medicine has stock history)'; return orm(c, id); };

/* ================= ADD STOCK ================= */
PD.views.wadd = { render: function (host) {
  var d = D(), grid;
  host.innerHTML = '<div class="msw pw">' + band('Add Stock - goods received in the warehouse') + '<div class="subtab"><span>Goods Received</span></div>' +
    '<div class="phead"><fieldset><legend>Receipt Details</legend>' + field('Date :', '<input class="in" readonly value="' + PD.fmtDate(PD.today()) + '">') + field('Supplier :', '<input class="in" id="sup" list="suplist" placeholder="who sent the goods" autocomplete="off"><datalist id="suplist">' + d.suppliers.filter(function (s) { return s.active !== false; }).map(function (s) { return '<option value="' + esc(s.name) + '">'; }).join('') + '</datalist>') + field('Bill no :', '<input class="in" id="bill">') + field('Payment :', '<select class="in" id="pay"><option value="credit">On credit (pay the supplier later)</option><option value="cash">Paid in cash</option><option value="bank">Paid by bank / UPI</option></select>') + '</fieldset>' +
    '<fieldset class="sd"><legend>How this works</legend><div class="pf wide"><span class="hint">1. Search the medicine, or press <b>Upload bill</b> to read an Excel / CSV bill (medicines not in Items are created automatically). 2. Check HSN, batch, expiry, qty, free, rate, discount and GST. 3. Save: every strip gets its own barcode label. Print the labels and stick one on each strip. The shelf is shown so the stock goes to the right place.</span></div></fieldset></div>' +
    '<div class="scanbox" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 10px"><label><b>Scan barcode:</b></label><input class="in" id="bscan" autocomplete="off" placeholder="click here, then scan the barcode / QR on the medicine box or strip" style="font-size:15px;flex:1;min-width:240px"><span id="bfb" class="fb hint">Each scan adds 1 strip. Batch and expiry fill in by themselves when the code has them (2D / QR codes).</span></div>' +
    '<div class="pgrid" id="gr"></div>' +
    '<div class="msbot"><div class="mspanel"><div class="subtabs"><span class="on">&nbsp;&nbsp;.&nbsp;&nbsp;</span></div><div class="mspb"><div class="r3"><label>Lines :</label><b id="ic">0</b><label>Strips :</label><b id="is">0</b></div></div></div><div class="mstot"><div class="tl"><label>Total :</label><input class="in" id="t1" readonly value="0.00"></div><div class="tl"><label>GST :</label><input class="in" id="t2" readonly value="0.00"></div><div class="tl"><label>Margin :</label><input class="in" id="t4" readonly value="0.00"></div><div class="net"><span>Net Total :</span><b id="t3">0.00</b></div></div></div>' +
    '<div class="msbtns"><button class="mb" id="nw">New</button><button class="mb" id="up">📄 Upload bill (Excel / CSV)</button><span class="sp"></span><button class="mb" id="sv">💾 Save &amp; Print Labels</button></div></div>';
  /* prices: same as the last lot of this medicine, else a guess from the MRP */
  function prices(l, it) { var last = d.lots.filter(function (x) { return x.itemId === it.id; }).pop(); l.mrp = last ? last.mrp : it.mrp; l.cost = last ? last.cost : PD.r2(it.mrp * 0.62); l.sell = last ? last.sell : PD.r2(it.mrp * 0.72); }
  function newLine() { return { itemId: '', hsn: '', batchNo: '', expiry: '', strips: '', free: '', cost: '', disc: 0, tax: d.settings.defaultTax || 0, sell: '', mrp: '' }; }
  /* keep "this strip costs / sells at" in step with the purchase price entered on the bill */
  function onItem(l, it) { prices(l, it); l.newName = ''; l.hsn = it.hsn || ''; l.tax = it.tax || 0; l.disc = 0; }
  grid = PD.grid($('#gr', host), { id: 'wadd-grid', newLine: newLine,
    cols: [{ k: 'item', label: 'Medicine', type: 'item', always: true }, { k: 'hsn', label: 'HSN', w: 70 }, { k: 'batchNo', label: 'Batch no.', w: 90 }, { k: 'expiry', label: 'Expiry', type: 'month', w: 120 }, { k: 'strips', label: 'Qty (strips)', type: 'number', align: 'r', w: 70 }, { k: 'free', label: 'Free', type: 'number', align: 'r', w: 55 },
      { k: 'cost', label: 'Rate / strip', type: 'number', align: 'r', w: 85 }, { k: 'disc', label: 'Disc %', type: 'number', align: 'r', w: 55 }, { k: 'tax', label: 'GST %', type: 'number', align: 'r', w: 55 }, { k: 'sell', label: 'Selling price to shop / strip', type: 'number', align: 'r', w: 100 }, { k: 'mrp', label: 'MRP / strip', type: 'number', align: 'r', w: 78 },
      { k: 'amt', label: 'Amount (incl. GST)', type: 'calc', align: 'r', calc: function (l) { return PD.n2(svc.wCalcLine(l).amount); } },
      { k: 'shelf', label: 'Shelf', type: 'calc', calc: function (l) { return l.itemId ? (svc.item(l.itemId).rack || '—') : ''; } }, { k: 'del', type: 'del', always: true }],
    onItem: onItem,
    hint: function (l) { if (!l.itemId) return l.newName ? '<span class="badge warn">NEW medicine</span> <b>' + esc(l.newName) + '</b> is not in Items yet. It will be created when you save (shelf "NEW" until you set one).' : ''; var it = svc.item(l.itemId); return '<b>' + esc(it.name) + '</b> • shelf <b>' + esc(it.rack || 'NOT SET') + '</b> • in warehouse now <b>' + svc.wStock(it.id) + '</b> strips • reorder level ' + it.reorder; },
    itemFilter: null,
    onChange: function (ls) { var n = 0, s = 0, t = 0, x = 0, p = 0; ls.forEach(function (l) { if (l.itemId || l.newName) { var c = svc.wCalcLine(l); n++; s += c.n; t += c.taxable; x += c.taxAmt; p += c.n * PD.num(l.sell); } }); var a = $('#ic', host); if (!a) return; a.textContent = n; $('#is', host).textContent = s; $('#t1', host).value = PD.n2(t); $('#t2', host).value = PD.n2(x); $('#t3', host).textContent = PD.n2(t + x); $('#t4', host).value = PD.n2(p - t); } });
  grid.addLine(false);
  var bscan = $('#bscan', host), bfb = $('#bfb', host);
  function say(ok, msg) { beep(ok); bfb.innerHTML = '<span style="color:' + (ok ? '#2e8b57' : '#c62828') + '">' + (ok ? '✔ ' : '✖ ') + msg + '</span>'; bscan.focus(); }
  function put(it, c) {
    var ls = grid.lines().filter(function (l) { return l.itemId; }), same = null;
    for (var i = ls.length - 1; i >= 0 && !same; i--) { var l = ls[i]; if (l.itemId === it.id && (!c.batch || String(l.batchNo || '').toUpperCase() === c.batch.toUpperCase() || !l.batchNo) && (!c.expiry || !l.expiry || l.expiry === c.expiry)) same = l; }
    if (same) { same.strips = PD.num(same.strips) + 1; if (c.batch && !same.batchNo) same.batchNo = c.batch; if (c.expiry && !same.expiry) same.expiry = c.expiry; }
    else { same = newLine(); same.itemId = it.id; prices(same, it); same.batchNo = c.batch || ''; same.expiry = c.expiry || ''; same.strips = 1; ls.push(same); }
    grid.setLines(ls);
    say(true, '<b>' + esc(it.name) + '</b> • strips <b>' + same.strips + '</b>' + (same.batchNo ? ' • batch ' + esc(same.batchNo) : '') + (same.expiry ? ' • exp ' + PD.fmtExp(same.expiry) : '') + ' • shelf <b>' + esc(it.rack || '—') + '</b>' + (!same.batchNo || !same.expiry ? ' <span style="color:#c77d00">(type the batch / expiry)</span>' : ''));
  }
  function askLink(c) {
    beep(false);
    var m = PD.modal({ title: 'New barcode: which medicine is this?', size: 'md', body: '<p>Code <b>' + esc(c.code) + '</b> is not linked to any medicine yet. Pick the medicine once; from now on this code will find it straight away.</p><div class="fld"><label>Medicine</label><input class="in" id="lk" placeholder="type the name..." autocomplete="off"></div><p class="hint">Not in the list? Create it first under Items → New / Edit Item.</p>', foot: [{ label: 'Cancel' }], onClose: function () { setTimeout(function () { bscan.focus(); }, 30); } });
    PD.combo($('#lk', m.el), { source: PD.itemSource({ stock: false }), onPick: function (x) { try { var it = svc.wLinkCode(x.id, c.code); m.close(); put(it, c); } catch (e) { PD.err(e); } } });
  }
  bscan.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return; e.preventDefault(); var v = bscan.value; bscan.value = ''; if (!v.trim()) return;
    if (svc.wParse(v)) return say(false, 'This is our own strip label. Scan the company barcode on the box / strip.');
    var c = svc.wReadCode(v); if (!c || !c.code) return say(false, 'Could not read this code');
    var it = svc.wItemByCode(c.code); if (it) put(it, c); else askLink(c);
  });
  setTimeout(function () { bscan.focus(); }, 50);
  $('#nw', host).onclick = function () { PD.views.wadd.render(host); };
  $('#up', host).onclick = function () {
    var i = document.createElement('input'); i.type = 'file'; i.accept = '.csv,.xls,.xlsx,.xlsm,.ods,.txt';
    i.onchange = function () {
      var f = i.files[0]; if (!f) return;
      if (!window.XLSX) { PD.err(new Error('The Excel reader did not load. Check the internet connection and refresh the page.')); return; }
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var wb = XLSX.read(rd.result, { type: 'array', cellDates: false }), ws = wb.Sheets[wb.SheetNames[0]];
          var res = svc.wParseBill(XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }));
          var keep = grid.lines().filter(function (l) { return l.itemId || l.newName; });
          grid.setLines(keep.concat(res.lines));
          PD.toast(res.lines.length + ' lines read from ' + f.name + (res.fresh ? ' • ' + res.fresh + ' new medicine(s) will be created' : '') + (res.skipped ? ' • ' + res.skipped + ' rows skipped' : '') + '. Check them, then Save.', 'ok');
        } catch (e) { PD.err(e); }
      };
      rd.readAsArrayBuffer(f);
    };
    i.click();
  };
  $('#sv', host).onclick = function () {
    try {
      var lots = svc.wAddStock(grid.lines(), { supplier: $('#sup', host).value, bill: $('#bill', host).value, pay: $('#pay', host).value });
      var tot = lots.reduce(function (a, l) { return a + l.n; }, 0);
      var m = PD.modal({ title: 'Stock added: ' + lots.length + ' lot(s), ' + tot + ' strips', size: 'lg', body: '<p class="hint" style="margin-bottom:8px">Print the labels, stick one on every strip, then keep the strips on the shelf shown.</p><div class="tw"><table class="t"><thead><tr><th>Medicine</th><th>Lot</th><th>Batch</th><th>Expiry</th><th class="r">Strips</th><th>Keep on shelf</th></tr></thead><tbody>' + lots.map(function (l) { return '<tr><td><b>' + esc(svc.itemName(l.itemId)) + '</b></td><td>L' + l.no + '</td><td>' + esc(l.batchNo) + '</td><td>' + PD.fmtExp(l.expiry) + '</td><td class="r">' + l.n + '</td><td><b style="font-size:15px">' + esc(svc.item(l.itemId).rack) + '</b></td></tr>'; }).join('') + '</tbody></table></div>', foot: [{ label: 'Close' }, { label: 'Print labels', cls: 'p', icon: 'print', fn: function () { svc.wPrintLabels(lots); return false; } }] });
      PD.views.wadd.render(host);
    } catch (e) { PD.err(e); }
  };
} };

/* ================= STOCK ================= */
function lotRows(it) {
  return D().lots.filter(function (l) { return l.itemId === it.id; }).sort(function (a, b) { return (a.expiry || '').localeCompare(b.expiry || ''); });
}
PD.views.wstock = { render: function (host) {
  var d = D(); host.innerHTML = '<div id="sl"></div>';
  PD.report($('#sl', host), { id: 'w-stock', title: 'Warehouse stock (strips)', filters: [{ k: 'only', label: 'Show', type: 'select', options: [['', 'All medicines'], ['in', 'In stock'], ['out', 'Out of stock'], ['low', 'Low stock']] }],
    load: function (f) {
      var sm = svc.wStockMap(), cost = {}, sell = {}, near = {};
      d.lots.forEach(function (l) { var n = svc.wLeft(l); if (n > 0) { cost[l.itemId] = (cost[l.itemId] || 0) + n * l.cost; sell[l.itemId] = (sell[l.itemId] || 0) + n * l.sell; if (!near[l.itemId] || l.expiry < near[l.itemId]) near[l.itemId] = l.expiry; } });
      return { cols: [{ k: 'name', label: 'Medicine', fmt: function (v, r) { return '<b>' + esc(v) + '</b> ' + PD.schedBadge(r.sched) + '<br><small class="mut">' + esc(r.generic) + '</small>'; }, raw: function (r) { return r.name + ' ' + r.generic; } }, { k: 'mfr', label: 'Manufacturer' }, { k: 'shelf', label: 'Shelf', fmt: function (v) { return '<b>' + esc(v || '—') + '</b>'; } },
        { k: 'strips', label: 'Strips', align: 'r', sum: true, fmt: function (v, r) { return '<span class="badge ' + (v <= 0 ? 'bad' : v <= r.reorder ? 'warn' : 'ok') + '">' + v + '</span>'; }, raw: function (r) { return r.strips; } }, { k: 'near', label: 'Nearest expiry', fmt: function (v) { return v ? PD.expBadge(v) : ''; }, raw: function (r) { return r.near || ''; } },
        { k: 'cost', label: 'Value at cost', align: 'r', sum: true, fmt: PD.n2 }, { k: 'sell', label: 'Value at shop price', align: 'r', sum: true, fmt: PD.n2 }],
        rows: d.items.filter(function (i) { return i.active !== false; }).map(function (i) { return { id: i.id, name: i.name, generic: i.generic, sched: i.schedule, mfr: svc.mfrName(i.mfrId), shelf: i.rack, strips: sm[i.id] || 0, reorder: i.reorder, near: near[i.id], cost: PD.r2(cost[i.id] || 0), sell: PD.r2(sell[i.id] || 0) }; })
          .filter(function (r) { return !f.only || (f.only === 'in' ? r.strips > 0 : f.only === 'out' ? r.strips <= 0 : r.strips <= r.reorder); }), note: 'Click a medicine to see its lots, reprint labels or write off expired stock.' };
    },
    drill: function (row) {
      var it = svc.item(row.id);
      function body() { return '<div class="tw"><table class="t"><thead><tr><th>Lot</th><th>Batch</th><th>Expiry</th><th class="r">Strips left / total</th><th class="r">Cost</th><th class="r">Shop price</th><th class="r">MRP</th><th>Supplier / bill</th><th></th></tr></thead><tbody>' + lotRows(it).map(function (l) { var n = svc.wLeft(l); return '<tr><td>L' + l.no + '</td><td>' + esc(l.batchNo) + '</td><td>' + PD.expBadge(l.expiry) + '</td><td class="r"><b>' + n + '</b> / ' + l.n + '</td><td class="r">' + PD.n2(l.cost) + '</td><td class="r">' + PD.n2(l.sell) + '</td><td class="r">' + PD.n2(l.mrp) + '</td><td><small>' + esc(l.supplier) + ' ' + esc(l.bill) + '<br>' + PD.fmtDate(l.date) + '</small></td><td class="r nw"><button class="btn sm" data-lb="' + l.id + '">Labels</button>' + (n > 0 ? ' <button class="btn sm d" data-wo="' + l.id + '">Write off</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>'; }
      var m = PD.modal({ title: it.name + ' - shelf ' + (it.rack || '—'), size: 'xl', body: body(), foot: [{ label: 'Close' }] });
      PD.on(m.el, 'click', '[data-lb]', function (e, t) { var lot = D().lots.find(function (x) { return x.id === t.dataset.lb; }); svc.wPrintLabels([lot]); });
      PD.on(m.el, 'click', '[data-wo]', function (e, t) { var lot = D().lots.find(function (x) { return x.id === t.dataset.wo; }); PD.prompt('Write off lot L' + lot.no, 'Reason (Expired / Damaged / Other)', PD.daysToExp(lot.expiry) < 0 ? 'Expired' : 'Damaged').then(function (v) { if (v == null) return; try { var n = svc.wWriteOff(lot.id, v); PD.toast(n + ' strips written off', 'ok'); PD.$('.mb', m.el); m.close(); PD.views.wstock.render(host); } catch (er) { PD.err(er); } }); });
    } });
} };

/* ================= SHELVES ================= */
PD.views.wshelves = { render: function (host, arg) {
  var d = D(), f = (arg && arg.f) || 'all', q = (arg && arg.q) || '', shelves = svc.shelfList();
  host.innerHTML = '<div class="msw whw">' + band('Shelves') + '<div style="padding:8px 12px"><p class="hint" style="margin-bottom:8px">Each medicine has one shelf (given when the item is created). Move a medicine here if you re-arrange the warehouse.</p><div class="row" style="margin-bottom:8px"><select class="in sm" id="sf" style="width:auto"><option value="all">All shelves</option>' + shelves.map(function (x) { return '<option value="' + esc(x) + '">Shelf ' + esc(x) + '</option>'; }).join('') + '</select><input class="in sm" id="sq" placeholder="Search medicine" value="' + esc(q) + '" style="max-width:240px"><span class="sp"></span><span class="hint" id="sc"></span></div><datalist id="shelfs">' + shelves.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist><div class="msgrid" style="margin:0;background:#fff;max-height:62vh"><table class="t"><thead><tr><th>Shelf</th><th>Medicine</th><th class="r">Strips</th><th>Nearest expiry</th><th></th></tr></thead><tbody id="sb"></tbody></table></div></div></div>';
  $('#sf', host).value = f;
  function rows() {
    var sm = svc.wStockMap(), ql = $('#sq', host).value.toLowerCase(), fv = $('#sf', host).value;
    var list = d.items.filter(function (i) { return i.active !== false && (!ql || (i.name + ' ' + i.generic).toLowerCase().indexOf(ql) >= 0) && (fv === 'all' || i.rack === fv); }).sort(function (a, b) { return (a.rack || '~').localeCompare(b.rack || '~') || a.name.localeCompare(b.name); });
    $('#sc', host).textContent = list.length + ' medicines' + (list.length > 300 ? ' (showing first 300, search to narrow)' : ''); if (list.length > 300) list = list.slice(0, 300);
    $('#sb', host).innerHTML = list.map(function (i) { var ls = svc.wLotsOf(i.id); return '<tr><td><input class="in sm" data-i="' + i.id + '" list="shelfs" value="' + esc(i.rack || '') + '" style="width:110px"></td><td><b>' + esc(i.name) + '</b><br><small class="mut">' + esc(i.generic) + '</small></td><td class="r">' + (sm[i.id] || 0) + '</td><td>' + (ls[0] ? PD.expBadge(ls[0].expiry) : '') + '</td><td class="r"><button class="btn sm" data-sv="' + i.id + '">Save shelf</button></td></tr>'; }).join('') || '<tr><td colspan="5"><div class="empty">Nothing to show.</div></td></tr>';
  }
  rows(); $('#sf', host).onchange = rows; $('#sq', host).oninput = rows;
  PD.on($('#sb', host), 'click', '[data-sv]', function (e, t) { try { svc.setShelf(t.dataset.sv, $('[data-i="' + t.dataset.sv + '"]', host).value); PD.toast('Shelf saved', 'ok'); PD.views.wshelves.render(host, { f: $('#sf', host).value, q: $('#sq', host).value }); } catch (er) { PD.err(er); } });
} };

/* ================= STRIP LOOKUP ================= */
PD.views.wscan = { render: function (host) {
  host.innerHTML = '<div class="msw whw">' + band('Strip Lookup - scan any strip') + '<div style="padding:12px 16px"><p class="hint">Click the box and scan a strip barcode with the scanner (or type the code, like L12-045). You see everything about that strip.</p><div class="pf wide" style="margin:10px 0"><label>Scan :</label><input class="in" id="sc" autofocus autocomplete="off" placeholder="scan strip QR here" style="max-width:460px;font-size:16px"></div><div id="res"></div></div></div>';
  var sc = $('#sc', host); sc.focus();
  sc.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return; e.preventDefault(); var p = svc.wParse(sc.value); sc.value = ''; var res = $('#res', host);
    if (!p) { beep(false); res.innerHTML = '<div class="card"><div class="bd" style="color:#c62828"><b>Not a Medismart strip barcode.</b></div></div>'; return; }
    if (!p.lot || p.bad) { beep(false); res.innerHTML = '<div class="card"><div class="bd" style="color:#c62828"><b>' + esc(p.serial) + '</b> is not in this warehouse.</div></div>'; return; }
    beep(true); var l = p.lot, it = svc.item(l.itemId), g = l.gone[p.idx];
    var st = g ? (g.s === 'out' ? '<span class="badge info">Sent to ' + esc(g.shop || 'a shop') + '</span> on ' + PD.fmtDate(g.d) + ' (' + esc(g.ref) + ')' : '<span class="badge bad">Written off</span> ' + esc(g.note || '') + ' (' + esc(g.ref) + ')') : '<span class="badge ok">In warehouse</span> on shelf <b>' + esc(it.rack || '—') + '</b>';
    res.innerHTML = '<div class="card"><div class="bd"><div style="font-size:17px"><b>' + esc(it.name) + '</b> ' + PD.schedBadge(it.schedule) + '</div><div class="mut">' + esc(it.generic) + '</div><table class="t" style="margin-top:10px;max-width:560px"><tbody><tr><td>Strip code</td><td><b>' + p.serial + '</b></td></tr><tr><td>Status</td><td>' + st + '</td></tr><tr><td>Batch</td><td>' + esc(l.batchNo) + ' (lot L' + l.no + ')</td></tr><tr><td>Expiry</td><td>' + PD.expBadge(l.expiry) + '</td></tr><tr><td>MRP</td><td>' + PD.n2(l.mrp) + '</td></tr><tr><td>Selling price to shop</td><td>' + PD.n2(l.sell) + '</td></tr><tr><td>Purchase price</td><td>' + PD.n2(l.cost) + '</td></tr><tr><td>Received</td><td>' + PD.fmtDate(l.date) + ' • ' + esc(l.supplier) + ' ' + esc(l.bill) + '</td></tr></tbody></table></div></div>';
  });
} };

/* ================= SHOP REQUESTS + SCAN & DISPATCH ================= */
function challanHTML(d) {
  if (d.bill) {
    var led = svc.wLedger(d.shopId), me = led.find(function (x) { return x.id === d.id; }), after = me ? me.bal : d.total, before = PD.r2(after - d.total);
    return '<h2>' + esc(D().shop.name) + '</h2><h3>Bill ' + esc(d.no) + '</h3><div>' + PD.fmtDate(d.date) + ' • Request ' + esc(d.extNo) + ' • To: <b>' + esc(svc.wShopName(d.shopId)) + '</b></div><br><table><thead><tr><th>#</th><th>Medicine</th><th>Batch</th><th>Exp</th><th class="r">Strips</th><th class="r">MRP</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead><tbody>' +
      d.lines.map(function (l, i) { return '<tr><td>' + (i + 1) + '</td><td>' + esc(svc.itemName(l.itemId)) + '</td><td>' + esc(l.batchNo) + '</td><td>' + PD.fmtExp(l.expiry) + '</td><td class="r">' + l.qty + '</td><td class="r">' + PD.n2(l.mrp) + '</td><td class="r">' + PD.n2(l.rate) + '</td><td class="r">' + PD.n2(l.qty * l.rate) + '</td></tr>'; }).join('') +
      '</tbody><tfoot><tr><td colspan="7" class="r"><b>Bill total</b> (no GST)</td><td class="r b">' + PD.n2(d.total) + '</td></tr><tr><td colspan="7" class="r">Earlier balance</td><td class="r">' + PD.n2(before) + '</td></tr><tr><td colspan="7" class="r"><b>Total due from the shop</b></td><td class="r b">' + PD.n2(after) + '</td></tr></tfoot></table>' +
      '<p style="margin-top:10px">Strips: ' + d.serials.length + (d.note ? ' • Note: ' + esc(d.note) : '') + ' • Packed by ' + esc(d.by || '') + '</p><br><br><div style="display:flex;justify-content:space-between"><span>Received by (shop)</span><span>For ' + esc(D().shop.name) + '</span></div>';
  }
  return '<h2>' + esc(D().shop.name) + '</h2><h3>Delivery challan ' + esc(d.no) + '</h3><div>' + PD.fmtDate(d.date) + ' • Request ' + esc(d.extNo) + ' • To: <b>' + esc(svc.wShopName(d.shopId)) + '</b></div><br><table><thead><tr><th>#</th><th>Medicine</th><th>Batch</th><th>Exp</th><th class="r">Strips</th><th class="r">Rate</th><th class="r">GST%</th><th class="r">Amount</th></tr></thead><tbody>' + d.lines.map(function (l, i) { return '<tr><td>' + (i + 1) + '</td><td>' + esc(svc.itemName(l.itemId)) + '</td><td>' + esc(l.batchNo) + '</td><td>' + PD.fmtExp(l.expiry) + '</td><td class="r">' + l.qty + '</td><td class="r">' + PD.n2(l.rate) + '</td><td class="r">' + l.tax + '</td><td class="r">' + PD.n2(l.qty * l.rate) + '</td></tr>'; }).join('') + '</tbody><tfoot><tr><td colspan="7" class="r">Taxable ' + PD.n2(d.taxable) + ' + GST ' + PD.n2(d.tax) + '</td><td class="r b">' + PD.n2(d.total) + '</td></tr></tfoot></table>';
}
PD.views.wreq = { render: function (host, arg) {
  var d = D(), tab = (arg && arg.tab) || 'req', sel = (arg && arg.reqId) || '';
  host.innerHTML = '<div class="msw whw">' + band('Shop Requests') + '<div class="subtabs bigtabs"><span data-t="req" class="' + (tab === 'req' ? 'on' : '') + '">Requests - pick &amp; dispatch</span><span data-t="hist" class="' + (tab === 'hist' ? 'on' : '') + '">Dispatch history</span></div><div id="wb" style="padding:8px 10px"></div></div>';
  PD.on(host, 'click', '[data-t]', function (e, t) { PD.views.wreq.render(host, { tab: t.dataset.t }); });
  var b = $('#wb', host);
  if (tab === 'hist') {
    b.innerHTML = '<div class="msgrid" style="margin:0;max-height:62vh;background:#fff"><table class="t"><thead><tr><th>Dispatch</th><th>Date</th><th>Shop</th><th>Request</th><th class="r">Strips</th><th class="r">Value</th><th></th></tr></thead><tbody>' + (d.wdisp.slice().reverse().map(function (x) { return '<tr><td><b>' + esc(x.no) + '</b></td><td>' + PD.fmtDate(x.date) + '</td><td>' + esc(svc.wShopName(x.shopId)) + '</td><td>' + esc(x.extNo) + '</td><td class="r">' + x.serials.length + '</td><td class="r">' + PD.n2(x.total) + '</td><td class="r nw"><button class="btn sm" data-pr="' + x.id + '">' + (x.bill ? 'Print bill' : 'Print challan') + '</button></td></tr>'; }).join('') || '<tr><td colspan="7"><div class="empty">Nothing dispatched yet.</div></td></tr>') + '</tbody></table></div>';
    PD.on(b, 'click', '[data-pr]', function (e, t) { PD.printHTML(challanHTML(d.wdisp.find(function (x) { return x.id === t.dataset.pr; }))); });
    return;
  }
  var open = d.wreq.filter(function (r) { return r.status === 'Pending' || r.status === 'Partly dispatched'; });
  if (!sel && open.length) sel = open[0].id;
  var r = sel && d.wreq.find(function (x) { return x.id === sel; });
  b.innerHTML = '<div class="whg"><div class="whl"><div class="row sp" style="margin-bottom:6px"><b>Open (' + open.length + ')</b></div>' + (open.map(function (x) { return '<div class="whi ' + (x.id === sel ? 'on' : '') + '" data-q="' + x.id + '"><b>' + esc(svc.wShopName(x.shopId)) + '</b><br><small>' + esc(x.extNo) + ' • ' + PD.fmtDate(x.date) + ' • ' + x.lines.length + ' items' + (x.note ? ' • ' + esc(x.note) : '') + '</small></div>'; }).join('') || '<div class="empty">No open requests.</div>') + '</div><div class="whd" id="det"></div></div>';
  PD.on(b, 'click', '[data-q]', function (e, t) { PD.views.wreq.render(host, { reqId: t.dataset.q }); });
  var det = $('#det', b);
  if (!r) { det.innerHTML = '<div class="empty">No request selected. Requests from shops appear here automatically.</div>'; return; }
  function draw(msg) {
    svc.wResolveLines(r);
    var lines = r.lines.map(function (l, i) { var it = l.itemId && svc.item(l.itemId), done = l.itemId ? svc.wDoneCount(r, l.itemId) : 0, pk = l.itemId ? svc.wPickedCount(r, l.itemId) : 0, av = l.itemId ? svc.wStock(l.itemId) : 0; return { l: l, it: it, done: done, pk: pk, av: av }; });
    var picked = r.picked.map(function (s) { var p = svc.wParse(s); return { s: s, p: p }; }).reverse();
    det.innerHTML = '<div class="row sp"><b style="font-size:15px">' + esc(svc.wShopName(r.shopId)) + ' — ' + esc(r.extNo) + '</b>' + badge(r.status) + '</div><p class="hint">' + esc(r.note || '') + '</p>' +
      '<div class="msgrid" style="margin:4px 0;background:#fff"><table class="t"><thead><tr><th>Medicine</th><th>Shelf</th><th class="r">Asked</th><th class="r">Sent before</th><th class="r">Scanned now</th><th class="r">In warehouse</th><th>Status</th></tr></thead><tbody>' + lines.map(function (x) { var want = x.l.qtyS, got = x.done + x.pk; return '<tr><td>' + (x.it ? '<b>' + esc(x.it.name) + '</b>' : '<b style="color:#c62828">' + esc(x.l.name) + '</b> <small>(not in item list)</small>') + '</td><td>' + (x.it ? '<b>' + esc(x.it.rack || '—') + '</b>' : '') + '</td><td class="r">' + want + '</td><td class="r">' + x.done + '</td><td class="r"><b>' + x.pk + '</b></td><td class="r">' + x.av + '</td><td>' + (got >= want ? '<span class="badge ok">complete</span>' : x.av < want - got ? '<span class="badge bad">short by ' + (want - got - x.av) + '</span>' : '<span class="badge warn">' + (want - got) + ' to scan</span>') + (x.it && got < want ? ' <button class="btn sm" data-pk="' + x.it.id + '">Choose batch</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="scanbox"><label>Scan strip:</label><input class="in" id="scn" autocomplete="off" placeholder="scan a strip (optional) or use Choose batch" style="font-size:16px"><span id="fb" class="fb">' + (msg || 'Take the medicine to the table and scan the strips one by one.') + '</span></div>' +
      '<div class="row" style="margin:6px 0"><input class="in" id="dn" placeholder="Note for the shop (optional)" style="flex:1"><button class="btn p" id="ap"' + (r.picked.length ? '' : ' disabled') + '>✔ Dispatch ' + r.picked.length + ' strips</button><button class="btn d" id="rj">Reject request</button></div>' +
      (picked.length ? '<div class="msgrid" style="margin:4px 0;background:#fff;max-height:24vh"><table class="t"><thead><tr><th>Strip</th><th>Medicine</th><th>Batch</th><th>Exp</th><th></th></tr></thead><tbody>' + picked.map(function (x) { return '<tr><td>' + x.s + '</td><td>' + esc(svc.itemName(x.p.lot.itemId)) + '</td><td>' + esc(x.p.lot.batchNo) + '</td><td>' + PD.fmtExp(x.p.lot.expiry) + '</td><td class="r"><button class="btn sm" data-rm="' + x.s + '">remove</button></td></tr>'; }).join('') + '</tbody></table></div>' : '');
    var scn = $('#scn', det); scn.focus();
    scn.addEventListener('keydown', function (e) { if (e.key !== 'Enter') return; e.preventDefault(); var v = scn.value; scn.value = ''; if (!v.trim()) return; var res = svc.wPickScan(r.id, v); beep(res.ok); draw((res.ok ? '<span style="color:#2e8b57">✔ ' : '<span style="color:#c62828">✖ ') + esc(res.msg) + '</span>' + (res.warn ? '<br><span style="color:#c77d00">' + esc(res.warn) + '</span>' : '')); });
    if (!det._pk) PD.on(det, 'click', '[data-pk]', function (e, t) {
      var itemId = t.dataset.pk, lots = svc.wLotsOf(itemId), it = svc.item(itemId), need = r.lines.filter(function (l) { return l.itemId === itemId; }).reduce(function (a, l) { return a + l.qtyS; }, 0) - svc.wPickedCount(r, itemId) - svc.wDoneCount(r, itemId);
      var rows = lots.map(function (l) { var free = svc.wLeft(l) - r.picked.filter(function (s) { var p = svc.wParse(s); return p && p.lot === l; }).length; return '<tr><td><b>' + esc(l.batchNo) + '</b></td><td>' + PD.fmtExp(l.expiry) + '</td><td class="r">' + PD.n2(l.mrp) + '</td><td class="r">' + PD.n2(l.sell || l.cost) + '</td><td class="r">' + free + '</td><td class="r"><input class="in sm" type="number" min="0" max="' + free + '" data-q="' + l.id + '" style="width:70px"></td></tr>'; }).join('');
      var m = PD.modal({ title: it.name + ' — choose batch (need ' + need + ' strips)', size: 'lg', body: '<div class="tw"><table class="t"><thead><tr><th>Batch</th><th>Expiry</th><th class="r">MRP</th><th class="r">Rate</th><th class="r">In stock</th><th class="r">Send</th></tr></thead><tbody>' + (rows || '<tr><td colspan="6" class="mut">No stock.</td></tr>') + '</tbody></table></div><p class="hint">Earliest expiry is listed first. Type how many strips to send from each batch.</p>', foot: [{ label: 'Cancel' }, { label: 'Add', cls: 'p', fn: function (api) {
        try { var tot = 0; PD.$$('[data-q]', api.el).forEach(function (inp) { var q = Math.floor(PD.num(inp.value)); if (q > 0) tot += svc.wPickLot(r.id, inp.dataset.q, q); }); if (!tot) throw new Error('Type a quantity against a batch'); setTimeout(function () { draw('<span style="color:#2e8b57">✔ Added ' + tot + ' strips of ' + esc(it.name) + '</span>'); }, 0); } catch (er) { PD.err(er); return false; }
      } }] });
    });
    det._pk = 1;
    PD.on(det, 'click', '[data-rm]', function (e, t) { svc.wPickRemove(r.id, t.dataset.rm); draw(); });
    $('#ap', det).onclick = function () {
      try { var nd = svc.wDispatch(r.id, $('#dn', det).value); PD.toast('Dispatched ' + nd.no + ' • sent to the shop', 'ok'); PD.confirm('Bill ' + nd.no + ' for ₹' + PD.n2(nd.total) + ' is added to ' + esc(svc.wShopName(nd.shopId)) + "'s account. Print the bill?", 'Print bill').then(function (ok) { if (ok) PD.printHTML(challanHTML(nd)); }); PD.views.wreq.render(host, { reqId: r.id }); } catch (e) { PD.err(e); }
    };
    $('#rj', det).onclick = function () { PD.prompt('Reject request ' + r.extNo, 'Reason (shown to the shop)').then(function (v) { if (v == null) return; try { svc.wRejectRequest(r.id, v); PD.toast('Request rejected'); PD.views.wreq.render(host); } catch (er) { PD.err(er); } }); };
  }
  draw();
} };

/* ================= SHOP ACCOUNTS (bills, payments, balance due) ================= */
PD.views.wacc = { render: function (host) {
  host.innerHTML = '<div class="msw whw">' + band('Shop Accounts - bills, payments and balance due') + '<div class="row" style="padding:8px 10px;gap:10px;flex-wrap:wrap"><button class="btn p" id="rp">+ Receive payment</button><span class="hint">Every dispatch is a bill to the shop at your selling price (no GST). Accepted returns and payments reduce the balance. Click a shop to see its statement.</span></div><div id="ar" style="padding:0 10px 10px"></div></div>';
  var rep = PD.report($('#ar', host), { id: 'wacc', title: 'Balance due from shops', load: function () { return { cols: [
    { k: 'code', label: 'Code' }, { k: 'name', label: 'Shop', fmt: function (v) { return '<b>' + esc(v) + '</b>'; } },
    { k: 'billed', label: 'Bills', align: 'r', sum: true, fmt: PD.n2 }, { k: 'returns', label: 'Returns', align: 'r', sum: true, fmt: PD.n2 }, { k: 'paid', label: 'Received', align: 'r', sum: true, fmt: PD.n2 },
    { k: 'due', label: 'Balance due', align: 'r', sum: true, fmt: function (v) { return '<b style="color:' + (v > 0 ? '#c62828' : '#2e7d32') + '">' + PD.n2(v) + '</b>'; }, raw: function (r) { return r.due; } },
    { k: 'last', label: 'Last payment', fmt: function (v) { return v ? PD.fmtDate(v) : '—'; } },
    { k: '_a', label: '', raw: function () { return ''; }, fmt: function (v, r) { return '<button class="btn sm" data-pay="' + r.id + '">Receive</button>'; } }],
    rows: svc.wDues(), note: 'Same figures as the shop\'s account under Accounts. Older dispatches (sent at cost, before billing started) are not counted.' }; },
    drill: function (r) { statement(r.id); } });
  function again() { PD.views.wacc.render(host); }
  PD.on(host, 'click', '[data-pay]', function (e, t) { receive(t.dataset.pay); });
  $('#rp', host).onclick = function () { receive(''); };
  function receive(shopId) {
    var f = [{ k: 'shopId', label: 'Shop', type: 'select', req: true, options: function () { return [['', '— select shop —']].concat(D().shops.map(function (s) { return [s.id, s.name + ' (due ' + PD.n2(svc.wDue(s.id)) + ')']; })); } },
      { k: 'amount', label: 'Amount received (₹)', type: 'number', req: true }, { k: 'mode', label: 'Mode', type: 'select', options: ['Cash', 'UPI', 'Bank transfer', 'Cheque'] },
      { k: 'date', label: 'Date', type: 'date' }, { k: 'note', label: 'Note (UPI ref / cheque no.)', full: true }];
    PD.modal({ title: 'Receive payment from a shop', size: 'md', body: PD.formHTML(f, { shopId: shopId, date: PD.today(), mode: 'Cash' }), foot: [{ label: 'Cancel' }, { label: 'Save', cls: 'p', fn: function (api) {
      try { var v = PD.readForm(api.el, f), p = svc.wReceivePay(v); PD.toast('Received ₹' + PD.n2(p.amount) + ' from ' + svc.wShopName(p.shopId) + ' • balance now ₹' + PD.n2(svc.wDue(p.shopId)), 'ok'); again(); } catch (e) { PD.err(e); return false; }
    } }] });
  }
  function statement(shopId) {
    var l = svc.wLedger(shopId), name = svc.wShopName(shopId);
    function html() { return '<table class="t"><thead><tr><th>Date</th><th>Entry</th><th>No.</th><th class="r">Bill</th><th class="r">Paid / returned</th><th class="r">Balance</th><th></th></tr></thead><tbody>' + (l.map(function (x) { return '<tr><td>' + PD.fmtDate(x.date) + '</td><td>' + esc(x.kind + (x.mode ? ' (' + x.mode + ')' : '')) + (x.note ? '<br><small class="mut">' + esc(x.note) + '</small>' : '') + '</td><td>' + esc(x.no) + '</td><td class="r">' + (x.dr ? PD.n2(x.dr) : '') + '</td><td class="r">' + (x.cr ? PD.n2(x.cr) : '') + '</td><td class="r"><b>' + PD.n2(x.bal) + '</b></td><td class="r no-print">' + (x.kind === 'Payment' ? '<button class="btn sm g" data-dp="' + x.id + '">delete</button>' : '') + '</td></tr>'; }).join('') || '<tr><td colspan="7" class="mut">No bills yet.</td></tr>') + '</tbody></table>'; }
    var m = PD.modal({ title: name + ': statement', size: 'lg', body: html(), foot: [{ label: 'Close' }, { label: 'Print', icon: 'print', fn: function () { PD.printHTML('<h2>' + esc(D().shop.name) + '</h2><h3>Statement: ' + esc(name) + '</h3><div>' + PD.fmtDate(PD.today()) + ' • Balance due ₹' + PD.n2(svc.wDue(shopId)) + '</div><br>' + html()); return false; } }, { label: 'Receive payment', cls: 'p', fn: function () { receive(shopId); } }] });
    PD.on(m.el, 'click', '[data-dp]', function (e, t) { PD.confirm('Delete this payment entry?', 'Delete', true).then(function (ok) { if (!ok) return; svc.wDeletePay(t.dataset.dp); m.close(); again(); statement(shopId); }); });
  }
} };

/* ================= RETURNS FROM SHOPS ================= */
PD.views.wret = { render: function (host, arg) {
  var d = D(), sel = (arg && arg.id) || '';
  var pend = d.wret.filter(function (r) { return r.status === 'Pending'; });
  if (!sel && pend.length) sel = pend[0].id;
  var r = sel && d.wret.find(function (x) { return x.id === sel; });
  host.innerHTML = '<div class="msw whw">' + band('Returns from Shops') + '<div style="padding:8px 10px"><div class="whg"><div class="whl"><div class="row sp" style="margin-bottom:6px"><b>Pending (' + pend.length + ')</b></div>' + (pend.map(function (x) { return '<div class="whi ' + (x.id === sel ? 'on' : '') + '" data-q="' + x.id + '"><b>' + esc(svc.wShopName(x.shopId)) + '</b><br><small>' + esc(x.extNo) + ' • ' + PD.fmtDate(x.date) + ' • ' + x.lines.length + ' lines • ' + PD.n2(x.value) + '</small></div>'; }).join('') || '<div class="empty">No pending returns.</div>') + '<div class="hint" style="margin-top:8px">Earlier: ' + d.wret.filter(function (x) { return x.status !== 'Pending'; }).length + ' done (see Reports).</div></div><div class="whd" id="det"></div></div></div></div>';
  PD.on(host, 'click', '[data-q]', function (e, t) { PD.views.wret.render(host, { id: t.dataset.q }); });
  var det = $('#det', host); if (!r) { det.innerHTML = '<div class="empty">No return selected. Returns from shops appear here automatically.</div>'; return; }
  var rows = r.lines.map(function (l, i) { return '<tr><td><b>' + esc(l.name) + '</b>' + (l.itemId ? '' : ' <small style="color:#c62828">(not in item list)</small>') + '</td><td>' + esc(l.batchNo) + '</td><td>' + PD.fmtExp(l.expiry) + '</td><td class="r">' + l.qty + '</td><td class="r">' + PD.n2(l.rate) + '</td><td>' + esc(l.reason) + (l.note ? '<br><small class="mut">' + esc(l.note) + '</small>' : '') + '</td><td><select class="in sm" data-o="' + i + '"><option value="stock"' + (l.outcome === 'stock' ? ' selected' : '') + '>Back to stock</option><option value="bad"' + (l.outcome === 'bad' ? ' selected' : '') + '>Write off</option></select></td></tr>'; }).join('');
  det.innerHTML = '<div class="row sp"><b style="font-size:15px">' + esc(svc.wShopName(r.shopId)) + ' — ' + esc(r.extNo) + '</b>' + badge(r.status) + '</div><p class="hint">' + esc(r.note || '') + ' Credit to the shop: <b>' + PD.n2(r.value) + '</b></p><div class="msgrid" style="margin:4px 0;background:#fff"><table class="t"><thead><tr><th>Medicine</th><th>Batch</th><th>Exp</th><th class="r">Strips</th><th class="r">Rate</th><th>Reason given</th><th>What to do</th></tr></thead><tbody>' + rows + '</tbody></table></div><div class="row" style="margin-top:6px"><button class="btn p" id="ac">✔ Accept return</button><button class="btn d" id="rj">Reject</button></div><p class="hint">Expired / damaged strips are suggested as "Write off", others go back to sellable stock. Change it per line if needed.</p>';
  $('#ac', det).onclick = function () { try { var o = {}; PD.$$('[data-o]', det).forEach(function (s) { o[+s.dataset.o] = s.value; }); var x = svc.wAcceptReturn(r.id, o); PD.toast(x.restored + ' strips back in stock, ' + x.bad + ' written off', 'ok'); PD.views.wret.render(host); } catch (e) { PD.err(e); } };
  $('#rj', det).onclick = function () { PD.prompt('Reject return ' + r.extNo, 'Reason').then(function (v) { if (v == null) return; try { svc.wRejectReturn(r.id, v); PD.toast('Return rejected'); PD.views.wret.render(host); } catch (e) { PD.err(e); } }); };
} };

/* ================= EXPORT ITEM LIST ================= */
PD.views.itemsexport = { render: function (host) {
  host.innerHTML = '<div class="msw whw">' + band('Item list for shops') + '<div style="padding:14px 16px"><p>Shops do not create medicines. Give them this file and they import it (Warehouse - Import Item List). New medicines also reach a shop automatically inside every dispatch.</p><div class="row" style="margin:14px 0"><button class="btn p lg" id="ex">Download item list file (' + D().items.length + ' medicines)</button></div></div></div>';
  $('#ex', host).onclick = function () { download('medismart-items.json', svc.wItemsFile()); PD.toast('Item list saved to Downloads', 'ok'); };
} };

/* ================= REPORTS ================= */
var R = [];
function rep(g, id, title, spec) { R.push({ g: g, id: id, title: title, spec: spec }); }
var bold = function (v) { return '<b>' + esc(v) + '</b>'; };
rep('Stock', 'lots', 'Lot-wise stock (batch, expiry, prices)', function () { return { filters: [{ k: 'z', label: 'Show', type: 'select', options: [['', 'In stock only'], ['all', 'Include finished lots']] }], load: function (f) { return { cols: [{ k: 'lot', label: 'Lot' }, { k: 'item', label: 'Medicine', fmt: bold }, { k: 'shelf', label: 'Shelf' }, { k: 'batch', label: 'Batch' }, { k: 'expiry', label: 'Expiry', fmt: PD.expBadge, raw: function (r) { return r.expiry; } }, { k: 'left', label: 'Strips left', align: 'r', sum: true }, { k: 'n', label: 'Received', align: 'r' }, { k: 'cost', label: 'Cost', align: 'r', fmt: PD.n2 }, { k: 'sell', label: 'Shop price', align: 'r', fmt: PD.n2 }, { k: 'mrp', label: 'MRP', align: 'r', fmt: PD.n2 }, { k: 'val', label: 'Value at cost', align: 'r', sum: true, fmt: PD.n2 }], rows: D().lots.filter(function (l) { return f.z === 'all' || svc.wLeft(l) > 0; }).map(function (l) { var left = svc.wLeft(l); return { lot: 'L' + l.no, item: svc.itemName(l.itemId), shelf: svc.item(l.itemId).rack, batch: l.batchNo, expiry: l.expiry, left: left, n: l.n, cost: l.cost, sell: l.sell, mrp: l.mrp, val: PD.r2(left * l.cost) }; }) }; } }; });
rep('Stock', 'expiry', 'Expiry report', function () { return { filters: [{ k: 'win', label: 'Show', type: 'select', options: [['0', 'Already expired'], ['30', 'Within 30 days'], ['60', 'Within 60 days'], ['90', 'Within 90 days'], ['180', 'Within 180 days']], val: '90' }], load: function (f) { var w = +f.win; return { cols: [{ k: 'item', label: 'Medicine', fmt: bold }, { k: 'lot', label: 'Lot' }, { k: 'batch', label: 'Batch' }, { k: 'expiry', label: 'Expiry', fmt: PD.expBadge, raw: function (r) { return r.expiry; } }, { k: 'days', label: 'Days left', align: 'r' }, { k: 'left', label: 'Strips', align: 'r', sum: true }, { k: 'val', label: 'Cost value', align: 'r', sum: true, fmt: PD.n2 }, { k: 'shelf', label: 'Shelf' }], rows: D().lots.filter(function (l) { var n = svc.wLeft(l); if (n <= 0 || !l.expiry) return false; var dd = PD.daysToExp(l.expiry); return w === 0 ? dd < 0 : dd >= 0 && dd <= w; }).sort(function (a, b) { return a.expiry.localeCompare(b.expiry); }).map(function (l) { return { item: svc.itemName(l.itemId), lot: 'L' + l.no, batch: l.batchNo, expiry: l.expiry, days: PD.daysToExp(l.expiry), left: svc.wLeft(l), val: PD.r2(svc.wLeft(l) * l.cost), shelf: svc.item(l.itemId).rack }; }) }; } }; });
rep('Stock', 'low', 'Low stock (at or below reorder level)', function () { return { load: function () { var sm = svc.wStockMap(); return { cols: [{ k: 'item', label: 'Medicine', fmt: bold }, { k: 'shelf', label: 'Shelf' }, { k: 'have', label: 'Strips', align: 'r' }, { k: 'reorder', label: 'Reorder level', align: 'r' }], rows: D().items.filter(function (i) { return i.active !== false && i.reorder > 0 && (sm[i.id] || 0) <= i.reorder; }).map(function (i) { return { item: i.name, shelf: i.rack, have: sm[i.id] || 0, reorder: i.reorder }; }) }; } }; });
rep('Stock', 'val', 'Stock valuation (cost vs shop price vs MRP)', function () { return { load: function () { var rows = D().items.map(function (i) { var c = 0, s = 0, m = 0, n = 0; D().lots.forEach(function (l) { if (l.itemId === i.id) { var k = svc.wLeft(l); n += k; c += k * l.cost; s += k * l.sell; m += k * l.mrp; } }); return { item: i.name, n: n, c: PD.r2(c), s: PD.r2(s), m: PD.r2(m), g: PD.r2(s - c) }; }).filter(function (r) { return r.n > 0; }); return { cols: [{ k: 'item', label: 'Medicine', fmt: bold }, { k: 'n', label: 'Strips', align: 'r', sum: true }, { k: 'c', label: 'At cost', align: 'r', sum: true, fmt: PD.n2 }, { k: 's', label: 'At shop price', align: 'r', sum: true, fmt: PD.n2 }, { k: 'm', label: 'At MRP', align: 'r', sum: true, fmt: PD.n2 }, { k: 'g', label: 'Margin (shop price - cost)', align: 'r', sum: true, fmt: PD.n2 }], rows: rows }; } }; });
rep('Stock', 'bad', 'Written-off / returned-bad strips', function () { return { load: function () { var rows = []; D().lots.forEach(function (l) { var by = {}; Object.keys(l.gone).forEach(function (k) { var g = l.gone[k]; if (g.s === 'bad') { var key = g.ref + '|' + (g.note || ''); by[key] = by[key] || { date: g.d, item: svc.itemName(l.itemId), lot: 'L' + l.no, batch: l.batchNo, ref: g.ref, why: g.note || '', shop: g.shop || '', n: 0, val: 0 }; by[key].n++; by[key].val += l.cost; } }); Object.keys(by).forEach(function (k) { by[k].val = PD.r2(by[k].val); rows.push(by[k]); }); }); return { cols: [{ k: 'date', label: 'Date', fmt: PD.fmtDate }, { k: 'item', label: 'Medicine', fmt: bold }, { k: 'lot', label: 'Lot' }, { k: 'batch', label: 'Batch' }, { k: 'n', label: 'Strips', align: 'r', sum: true }, { k: 'val', label: 'Cost value', align: 'r', sum: true, fmt: PD.n2 }, { k: 'why', label: 'Reason' }, { k: 'shop', label: 'From shop' }, { k: 'ref', label: 'Ref' }], rows: rows.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }) }; } }; });
rep('Inward', 'inward', 'Goods received register', function () { return { filters: [{ k: 'from', label: 'From', type: 'date', val: function () { return PD.addDays(PD.today(), -90); } }, { k: 'to', label: 'To', type: 'date', val: PD.today }], load: function (f) { return { cols: [{ k: 'date', label: 'Date', fmt: PD.fmtDate }, { k: 'lot', label: 'Lot' }, { k: 'item', label: 'Medicine', fmt: bold }, { k: 'batch', label: 'Batch' }, { k: 'expiry', label: 'Expiry', fmt: PD.fmtExp, raw: function (r) { return r.expiry; } }, { k: 'n', label: 'Strips', align: 'r', sum: true }, { k: 'cost', label: 'Purchase price', align: 'r', fmt: PD.n2 }, { k: 'tot', label: 'Total cost', align: 'r', sum: true, fmt: PD.n2 }, { k: 'sell', label: 'Shop price', align: 'r', fmt: PD.n2 }, { k: 'sup', label: 'Supplier' }, { k: 'bill', label: 'Bill' }, { k: 'by', label: 'Entered by' }], rows: D().lots.filter(function (l) { return l.date >= f.from && l.date <= f.to; }).slice().reverse().map(function (l) { return { date: l.date, lot: 'L' + l.no, item: svc.itemName(l.itemId), batch: l.batchNo, expiry: l.expiry, n: l.n, cost: l.cost, tot: PD.r2(l.n * l.cost), sell: l.sell, sup: l.supplier, bill: l.bill, by: l.by }; }) }; } }; });
rep('Shops', 'disp', 'Dispatch register', function () { return { filters: [{ k: 'from', label: 'From', type: 'date', val: function () { return PD.addDays(PD.today(), -30); } }, { k: 'to', label: 'To', type: 'date', val: PD.today }], load: function (f) { return { cols: [{ k: 'date', label: 'Date', fmt: PD.fmtDate }, { k: 'no', label: 'Dispatch', fmt: bold }, { k: 'shop', label: 'Shop' }, { k: 'req', label: 'Request' }, { k: 'n', label: 'Strips', align: 'r', sum: true }, { k: 'total', label: 'Value (incl. GST)', align: 'r', sum: true, fmt: PD.n2 }, { k: 'by', label: 'Sent by' }], rows: D().wdisp.filter(function (x) { return x.date >= f.from && x.date <= f.to; }).slice().reverse().map(function (x) { return { date: x.date, no: x.no, shop: svc.wShopName(x.shopId), req: x.extNo, n: x.serials.length, total: x.total, by: x.by }; }) }; } }; });
rep('Shops', 'shopsum', 'Shop-wise summary (sent, returned, net)', function () { return { load: function () { return { cols: [{ k: 'shop', label: 'Shop', fmt: bold }, { k: 'dn', label: 'Dispatches', align: 'r' }, { k: 'sent', label: 'Sent value', align: 'r', sum: true, fmt: PD.n2 }, { k: 'rn', label: 'Returns', align: 'r' }, { k: 'ret', label: 'Returned value', align: 'r', sum: true, fmt: PD.n2 }, { k: 'net', label: 'Net', align: 'r', sum: true, fmt: PD.n2 }], rows: D().shops.map(function (s) { var ds = D().wdisp.filter(function (x) { return x.shopId === s.id; }), rs = D().wret.filter(function (x) { return x.shopId === s.id && x.status === 'Accepted'; }); var sent = ds.reduce(function (a, x) { return a + x.total; }, 0), ret = rs.reduce(function (a, x) { return a + x.value; }, 0); return { shop: s.name, dn: ds.length, sent: PD.r2(sent), rn: rs.length, ret: PD.r2(ret), net: PD.r2(sent - ret) }; }) }; } }; });
rep('Shops', 'reqs', 'Requests register', function () { return { load: function () { return { cols: [{ k: 'date', label: 'Date', fmt: PD.fmtDate }, { k: 'no', label: 'Request' }, { k: 'shop', label: 'Shop', fmt: bold }, { k: 'n', label: 'Items', align: 'r' }, { k: 'status', label: 'Status', fmt: badge }, { k: 'note', label: 'Remarks' }], rows: D().wreq.slice().reverse().map(function (r) { return { date: r.date, no: r.extNo, shop: svc.wShopName(r.shopId), n: r.lines.length, status: r.status, note: r.note2 || r.note }; }) }; } }; });
rep('Shops', 'rets', 'Returns register', function () { return { load: function () { return { cols: [{ k: 'date', label: 'Date', fmt: PD.fmtDate }, { k: 'no', label: 'Return' }, { k: 'shop', label: 'Shop', fmt: bold }, { k: 'n', label: 'Lines', align: 'r' }, { k: 'value', label: 'Value', align: 'r', sum: true, fmt: PD.n2 }, { k: 'status', label: 'Status', fmt: badge }, { k: 'res', label: 'Result' }], rows: D().wret.slice().reverse().map(function (r) { return { date: r.date, no: r.extNo, shop: svc.wShopName(r.shopId), n: r.lines.length, value: r.value, status: r.status, res: r.status === 'Accepted' ? r.restored + ' back to stock, ' + r.bad + ' written off' : (r.note2 || '') }; }) }; } }; });
rep('Shops', 'itemsent', 'Medicine-wise dispatch', function () { return { filters: [{ k: 'from', label: 'From', type: 'date', val: function () { return PD.addDays(PD.today(), -30); } }, { k: 'to', label: 'To', type: 'date', val: PD.today }], load: function (f) { var m = {}; D().wdisp.forEach(function (x) { if (x.date >= f.from && x.date <= f.to) x.lines.forEach(function (l) { var k = l.itemId; m[k] = m[k] || { item: svc.itemName(k), n: 0, val: 0 }; m[k].n += l.qty; m[k].val += l.qty * l.rate; }); }); return { cols: [{ k: 'item', label: 'Medicine', fmt: bold }, { k: 'n', label: 'Strips sent', align: 'r', sum: true }, { k: 'val', label: 'Value', align: 'r', sum: true, fmt: PD.n2 }], rows: Object.keys(m).map(function (k) { m[k].val = PD.r2(m[k].val); return m[k]; }).sort(function (a, b) { return b.n - a.n; }) }; } }; });
rep('Staff', 'att', 'Attendance (day-wise)', function () { return { filters: [{ k: 'from', label: 'From', type: 'date', val: function () { return PD.addDays(PD.today(), -14); } }, { k: 'to', label: 'To', type: 'date', val: PD.today }], load: function (f) { return { cols: [{ k: 'date', label: 'Date', fmt: PD.fmtDate }, { k: 'name', label: 'Staff', fmt: bold }, { k: 'st', label: 'Status' }, { k: 'in', label: 'In' }, { k: 'out', label: 'Out' }, { k: 'h', label: 'Hours', align: 'r', sum: true }, { k: 'late', label: 'Late' }], rows: D().attendance.filter(function (a) { return a.date >= f.from && a.date <= f.to; }).sort(function (a, b) { return b.date.localeCompare(a.date); }).map(function (a) { var u = D().users.find(function (x) { return x.id === a.userId; }); return { date: a.date, name: u ? u.name : a.userId, st: { P: 'Present', A: 'Absent', L: 'Leave', H: 'Half day' }[a.status] || a.status, 'in': a.in, out: a.out, h: svc.attHours(a), late: a.late ? 'Late' : '' }; }) }; } }; });
PD.views.wrep = { render: function (host, arg) {
  var cur = (arg && arg.report) || 'lots', groups = {}; R.forEach(function (r) { (groups[r.g] = groups[r.g] || []).push(r); });
  host.innerHTML = '<div class="split" style="grid-template-columns:240px 1fr"><div class="card"><div style="padding:8px;max-height:78vh;overflow:auto">' + Object.keys(groups).map(function (g) { return '<h4 style="margin:10px 6px 4px;color:var(--mut);font-size:11px;letter-spacing:.1em;text-transform:uppercase">' + g + '</h4>' + groups[g].map(function (r) { return '<a class="rl" data-r="' + r.id + '" style="display:block;padding:5px 8px;cursor:pointer;border-radius:3px' + (r.id === cur ? ';background:#1e7fe0;color:#fff' : '') + '">' + esc(r.title) + '</a>'; }).join(''); }).join('') + '</div></div><div id="rp"></div></div>';
  var rp = $('#rp', host);
  function show(id) { var r = R.find(function (x) { return x.id === id; }) || R[0]; PD.$$('.rl', host).forEach(function (a) { a.style.cssText = 'display:block;padding:5px 8px;cursor:pointer;border-radius:3px' + (a.dataset.r === r.id ? ';background:#1e7fe0;color:#fff' : ''); }); var sp = r.spec(); sp.id = 'wrep-' + r.id; sp.title = r.title; PD.report(rp, sp); }
  PD.on(host, 'click', '[data-r]', function (e, t) { show(t.dataset.r); }); show(cur);
} };

/* ================= ALERTS ================= */
PD.alerts = function () {
  var d = D(), out = [], days = d.settings.expiryDays || 120, can = PD.can || function () { return true; };
  var exp = 0, expV = 0, soon = 0, soonV = 0;
  d.lots.forEach(function (l) { var n = svc.wLeft(l); if (n <= 0 || !l.expiry) return; var dd = PD.daysToExp(l.expiry); if (dd < 0) { exp += n; expV += n * l.cost; } else if (dd <= days) { soon += n; soonV += n * l.cost; } });
  if (can('stock')) {
    if (exp) out.push({ lvl: 'bad', text: exp + ' strips are EXPIRED and still on the shelves (₹' + PD.n2(expV) + '). Write them off.', go: ['wrep', { report: 'expiry' }], icon: 'alert' });
    if (soon) out.push({ lvl: 'warn', text: soon + ' strips expire within ' + days + ' days (₹' + PD.n2(soonV) + ')', go: ['wrep', { report: 'expiry' }], icon: 'clock' });
    var sm = svc.wStockMap(), low = d.items.filter(function (i) { return i.active !== false && i.reorder > 0 && (sm[i.id] || 0) <= i.reorder; });
    if (low.length) out.push({ lvl: low.some(function (i) { return !(sm[i.id] > 0); }) ? 'bad' : 'warn', text: low.length + ' medicine(s) at or below reorder level', go: ['wrep', { report: 'low' }], icon: 'box' });
  }
  if (can('requests')) { var pr = d.wreq.filter(function (r) { return r.status === 'Pending' || r.status === 'Partly dispatched'; }).length; if (pr) out.push({ lvl: 'warn', text: pr + ' shop request(s) waiting to be packed', go: ['wreq'], icon: 'order' }); }
  if (can('returns')) { var rt = d.wret.filter(function (r) { return r.status === 'Pending'; }).length; if (rt) out.push({ lvl: 'info', text: rt + ' return(s) from shops waiting for your check', go: ['wret'], icon: 'ret' }); }
  if (PD.user && !svc.attOf(PD.user.id, PD.today())) out.push({ lvl: 'warn', text: 'You have not marked attendance today', go: ['attendance'], icon: 'users' });
  return out;
};
})();
