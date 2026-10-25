/* Masters: products, manufacturers, suppliers (with linking), customers, doctors, offers */
(function () {
'use strict';
var PD = window.PD, esc = PD.esc, svc = PD.svc;

function mfrOpts() { return [['', '— none —']].concat(PD.DB.mfrs.filter(function (m) { return m.active !== false; }).map(function (m) { return [m.id, m.name]; })); }

var TABS = [['mfrs', 'Manufacturers']];
var render = {
  items: function (host) {
    var stock = svc.stockMap();
    PD.master(host, {
      coll: 'items', title: 'Products', single: 'product', size: 'lg', formCls: 'c3', note: 'Name colour follows the category colour set in Settings. Click a row to edit.',
      defaults: function () { return { cat: 'Allopathy', tax: PD.DB.settings.defaultTax, unit: 'Strip', punit: 'Box', conv: 10, batch: true, margin: 20, reorder: 10 }; },
      fields: [
        { k: 'name', label: 'Brand / item name', req: true, full: true }, { k: 'generic', label: 'Generic name', full: true },
        { k: 'cat', label: 'Category', type: 'select', options: PD.CATS }, { k: 'schedule', label: 'Schedule', type: 'select', options: [['', 'None'], 'G', 'H', 'H1', 'X', 'OTC'] }, { k: 'mfrId', label: 'Manufacturer', type: 'select', options: mfrOpts },
        { k: 'division', label: 'Division / group' }, { k: 'rack', label: 'Rack / shelf' }, { k: 'hsn', label: 'HSN code' },
        { k: 'tax', label: 'GST %', type: 'number' }, { k: 'mrp', label: 'Default MRP', type: 'number' }, { k: 'margin', label: 'Profit margin %', type: 'number' },
        { k: 'reorder', label: 'Reorder quantity', type: 'number' }, { k: 'unit', label: 'Sale unit (e.g. Strip)' }, { k: 'punit', label: 'Purchase unit (e.g. Box)' },
        { k: 'conv', label: 'Sale units per purchase unit', type: 'number', hint: 'Box of 10 strips = 10' }, { k: 'batch', label: 'Track batch number & expiry', type: 'checkbox' }
      ],
      validate: function (r) { if (r.conv <= 0) throw new Error('Units per purchase unit must be at least 1'); },
      cols: [
        { k: 'name', label: 'Product', fmt: function (v, r) { return '<span class="dotc" style="background:' + svc.catColor(r.cat) + '"></span><b style="color:' + (PD.DB.settings.scheduleColors && (r.schedule === 'H1' || r.schedule === 'X') ? 'var(--bad)' : 'inherit') + '">' + esc(v) + '</b> ' + PD.schedBadge(r.schedule) + '<br><small class="mut">' + esc(r.generic) + '</small>'; }, raw: function (r) { return r.name + ' ' + r.generic; } },
        { k: 'cat', label: 'Category' }, { k: 'mfrId', label: 'Manufacturer', fmt: function (v) { return esc(svc.mfrName(v)); }, raw: function (r) { return svc.mfrName(r.mfrId); } }, { k: 'division', label: 'Division' }, { k: 'rack', label: 'Rack' },
        { k: 'tax', label: 'GST', align: 'r', fmt: function (v) { return v + '%'; } }, { k: 'mrp', label: 'MRP', align: 'r', fmt: function (v) { return PD.n2(v); } },
        { k: 'reorder', label: 'Reorder', align: 'r' }, { k: '_st', label: 'Stock', align: 'r', raw: function (r) { return stock[r.id] || 0; }, fmt: function (v, r) { var s = stock[r.id] || 0; return '<span class="badge ' + (s <= 0 ? 'bad' : s <= r.reorder ? 'warn' : 'ok') + '">' + PD.qty(s) + ' ' + esc(r.unit || '') + '</span>'; } }
      ]
    });
  },
  mfrs: function (host) {
    PD.master(host, { coll: 'mfrs', title: 'Manufacturers', single: 'manufacturer', size: 'md', fields: [{ k: 'name', label: 'Name', req: true, full: true }, { k: 'city', label: 'City' }, { k: 'phone', label: 'Phone' }],
      cols: [{ k: 'name', label: 'Manufacturer', fmt: function (v) { return '<b>' + esc(v) + '</b>'; } }, { k: 'city', label: 'City' }, { k: '_n', label: 'Products', align: 'r', raw: function (r) { return PD.DB.items.filter(function (i) { return i.mfrId === r.id; }).length; } }] });
  },
  suppliers: function (host) {
    PD.master(host, {
      coll: 'suppliers', title: 'Suppliers', single: 'supplier', size: 'lg', note: 'Linking a supplier to manufacturers/items filters the purchase entry list and helps order creation and claim statements.',
      defaults: function () { return { terms: 'Credit 30 days', links: { mfrs: [], items: [], divisions: '' } }; },
      fields: [{ k: 'name', label: 'Supplier name', req: true, full: true }, { k: 'phone', label: 'Phone' }, { k: 'gstin', label: 'GSTIN' }, { k: 'dl', label: 'Drug licence no.' }, { k: 'city', label: 'City' }, { k: 'terms', label: 'Payment terms', full: true }],
      extraHTML: function (v) {
        var L = v.links || { mfrs: [], items: [], divisions: '' };
        return '<h4 style="margin:16px 0 8px">Supplier linking</h4><div class="form"><div class="fld"><label>Manufacturers dealt in</label><select class="in" id="lk-m" multiple size="7">' + PD.DB.mfrs.map(function (m) { return '<option value="' + m.id + '"' + (L.mfrs.indexOf(m.id) >= 0 ? ' selected' : '') + '>' + esc(m.name) + '</option>'; }).join('') + '</select></div>' +
          '<div class="fld"><label>Specific products</label><select class="in" id="lk-i" multiple size="7">' + PD.DB.items.map(function (m) { return '<option value="' + m.id + '"' + (L.items.indexOf(m.id) >= 0 ? ' selected' : '') + '>' + esc(m.name) + '</option>'; }).join('') + '</select></div>' +
          '<div class="fld full"><label>Divisions (comma separated)</label><input class="in" id="lk-d" value="' + esc(L.divisions || '') + '" placeholder="e.g. Antibiotic, Cardio"></div></div><p class="hint">Hold Ctrl (or Cmd) to select several.</p>';
      },
      extraRead: function (root, r) { r.links = { mfrs: PD.$$('#lk-m option:checked', root).map(function (o) { return o.value; }), items: PD.$$('#lk-i option:checked', root).map(function (o) { return o.value; }), divisions: PD.$('#lk-d', root).value }; },
      cols: [{ k: 'name', label: 'Supplier', fmt: function (v) { return '<b>' + esc(v) + '</b>'; } }, { k: 'phone', label: 'Phone' }, { k: 'gstin', label: 'GSTIN' }, { k: 'terms', label: 'Terms' },
        { k: '_l', label: 'Linked to', raw: function (r) { return ((r.links && r.links.mfrs) || []).map(svc.mfrName).join(', '); }, fmt: function (v) { return '<small class="mut">' + esc(v) + '</small>'; } },
        { k: '_b', label: 'Payable', align: 'r', raw: function (r) { return svc.partyBalance('sup', r.id); }, fmt: function (v) { return v > 0 ? '<b style="color:var(--bad)">' + PD.n2(v) + '</b>' : PD.n2(v); } }]
    });
  },
  customers: function (host) {
    PD.master(host, { coll: 'customers', title: 'Customers', single: 'customer', size: 'md', defaults: function () { return { type: 'Regular', limit: 5000 }; },
      fields: [{ k: 'name', label: 'Name', req: true, full: true }, { k: 'phone', label: 'Phone' }, { k: 'type', label: 'Type', type: 'select', options: ['Regular', 'Special'] }, { k: 'limit', label: 'Credit limit', type: 'number' }, { k: 'address', label: 'Address', full: true }],
      cols: [{ k: 'name', label: 'Customer', fmt: function (v) { return '<b>' + esc(v) + '</b>'; } }, { k: 'phone', label: 'Phone' }, { k: 'type', label: 'Type', fmt: function (v) { return '<span class="badge ' + (v === 'Special' ? 'brand' : '') + '">' + esc(v) + '</span>'; } }, { k: 'limit', label: 'Limit', align: 'r', fmt: PD.n2 },
        { k: '_b', label: 'Outstanding', align: 'r', raw: function (r) { return svc.partyBalance('cus', r.id); }, fmt: function (v) { return v > 0 ? '<b style="color:var(--bad)">' + PD.n2(v) + '</b>' : PD.n2(v); } }] });
  },
  doctors: function (host) {
    PD.master(host, { coll: 'doctors', title: 'Doctors', single: 'doctor', size: 'md', showInactive: true, fields: [{ k: 'name', label: 'Doctor name', req: true, full: true }, { k: 'regNo', label: 'Registration no.' }, { k: 'phone', label: 'Phone' }],
      cols: [{ k: 'name', label: 'Doctor', fmt: function (v) { return '<b>' + esc(v) + '</b>'; } }, { k: 'regNo', label: 'Reg. no.' }, { k: 'phone', label: 'Phone' }] });
  },
  offers: function (host) {
    host.innerHTML = '<div id="oo"></div><div id="os" style="margin-top:16px"></div>';
    PD.master(PD.$('#oo', host), {
      coll: 'offers', title: 'Manufacturer offers & free quantities', single: 'offer', size: 'md', note: 'Offers show up as hints while creating purchase orders. Received free quantities are tracked below.',
      defaults: function () { return { from: PD.today(), to: PD.addDays(PD.today(), 30), buyQty: 10, freeQty: 1 }; },
      fields: [{ k: 'mfrId', label: 'Manufacturer', type: 'select', options: mfrOpts }, { k: 'itemId', label: 'Product (optional)', type: 'select', options: PD.itemOptions }, { k: 'desc', label: 'Offer description', req: true, full: true }, { k: 'buyQty', label: 'Buy (sale units)', type: 'number' }, { k: 'freeQty', label: 'Get free (sale units)', type: 'number' }, { k: 'from', label: 'Valid from', type: 'date' }, { k: 'to', label: 'Valid to', type: 'date' }],
      validate: function (r) { if (!r.mfrId && !r.itemId) throw new Error('Pick a manufacturer or a product'); },
      cols: [{ k: 'desc', label: 'Offer', fmt: function (v) { return '<b>' + esc(v) + '</b>'; } }, { k: 'mfrId', label: 'Manufacturer', fmt: function (v) { return esc(svc.mfrName(v)); }, raw: function (r) { return svc.mfrName(r.mfrId); } }, { k: 'itemId', label: 'Product', fmt: function (v) { return v ? esc(svc.itemName(v)) : 'All'; }, raw: function (r) { return r.itemId ? svc.itemName(r.itemId) : 'All'; } },
        { k: 'scheme', label: 'Scheme', raw: function (r) { return 'Buy ' + r.buyQty + ' + ' + r.freeQty + ' free'; } }, { k: 'from', label: 'From', fmt: PD.fmtDate }, { k: 'to', label: 'To', fmt: PD.fmtDate },
        { k: '_a', label: 'Status', raw: function (r) { var t = PD.today(); return r.to < t ? 'Expired' : r.from > t ? 'Upcoming' : 'Active'; }, fmt: function (v) { return '<span class="badge ' + (v === 'Active' ? 'ok' : v === 'Upcoming' ? 'info' : '') + '">' + v + '</span>'; } }]
    });
    PD.report(PD.$('#os', host), { id: 'offer-track', title: 'Free quantity tracking (received vs entitled)', load: function () {
      return { cols: [{ k: 'desc', label: 'Offer' }, { k: 'mfr', label: 'Manufacturer' }, { k: 'bought', label: 'Purchased', align: 'r', sum: true }, { k: 'entitled', label: 'Free entitled', align: 'r', sum: true }, { k: 'received', label: 'Free received', align: 'r', sum: true },
        { k: 'pending', label: 'Pending free', align: 'r', sum: true, fmt: function (v) { return v > 0 ? '<span class="badge warn">' + PD.qty(v) + ' pending</span>' : '<span class="badge ok">all received</span>'; } }],
        rows: svc.offerStatus().map(function (s) { return { desc: s.offer.desc, mfr: svc.mfrName(s.offer.mfrId), bought: s.bought, entitled: s.entitled, received: s.received, pending: s.pending }; }) };
    } });
  }
};

PD.views.masters = { render: function (host, arg) {
  var cur = 'mfrs';
  host.innerHTML = '<div class="tabs" id="mt" style="margin-bottom:16px">' + TABS.map(function (t) { return '<button data-t="' + t[0] + '" class="' + (t[0] === cur ? 'on' : '') + '">' + t[1] + '</button>'; }).join('') + '</div><div id="mc"></div>';
  function show(t) { PD.$$('#mt button', host).forEach(function (b) { b.classList.toggle('on', b.dataset.t === t); }); var c = PD.$('#mc', host); c.innerHTML = ''; render[t](c); }
  PD.on(PD.$('#mt', host), 'click', 'button', function (e, b) { show(b.dataset.t); });
  show(cur);
} };
})();
