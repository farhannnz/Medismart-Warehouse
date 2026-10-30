/* People & shops (same file in the shop and the warehouse app).
   - Users & rights: everyone has their own online login. Shop admin makes staff; warehouse admin makes shops + shop admins.
   - Warehouse: Shops page (wshops) and Profit & Loss of all shops (wpnl). */
(function () {
'use strict';
var PD = window.PD, esc = PD.esc, $ = PD.$, C = PD.cloud;
var APP = C.app;
function busy(btn, on) { if (btn) { btn.disabled = on; btn.style.opacity = on ? .6 : ''; } }
function allRights() { var r = {}; PD.RIGHTS.forEach(function (x) { r[x[0]] = true; }); return r; }

/* ---------- my password ---------- */
PD.changeMyPassword = function () {
  var f = [{ k: 'old', label: 'Current password', type: 'password' }, { k: 'n1', label: 'New password (6+ characters)', type: 'password' }, { k: 'n2', label: 'Repeat new password', type: 'password' }];
  PD.modal({ title: 'Change my password', size: 'sm', body: PD.formHTML(f, {}, ''), foot: [{ label: 'Cancel' }, { label: 'Change', cls: 'p', keep: true, fn: function (api, btn) {
    try { var v = PD.readForm(api.body, f); if (v.n1 !== v.n2) throw new Error('New passwords do not match'); busy(btn, true);
      C.changePassword(v.old, v.n1).then(function () { PD.log('Password changed'); PD.save(); PD.toast('Password changed', 'ok'); api.close(); }, function (e) { busy(btn, false); PD.err(e); });
    } catch (e) { PD.err(e); }
    return false;
  } }] });
};

/* ---------- users & rights (Settings tab) ---------- */
PD.peopleView = function (el) {
  var me = PD.user, admin = me.role === 'Admin';
  el.innerHTML = '<div class="card"><div class="bd mut">Loading logins…</div></div>';
  C.refreshUsers().then(draw, function (e) { PD.err(e); draw(); });
  function draw() {
    var D = PD.DB, rows = D.users.filter(function (u) { return !u.old; });
    var rep = PD.report(el, { id: 'users2', title: APP === 'shop' ? 'Logins of this shop' : 'Warehouse logins', load: function () { return { cols: [
      { k: 'name', label: 'Name', fmt: function (v) { return '<b>' + esc(v) + '</b>'; } }, { k: 'username', label: 'Username' },
      { k: 'role', label: 'Role', fmt: function (v) { return '<span class="badge ' + (v === 'Admin' ? 'brand' : '') + '">' + v + '</span>'; } },
      { k: 'rights', label: 'Access', raw: function (r) { return r.role === 'Admin' ? 'Everything' : PD.RIGHTS.filter(function (x) { return r.rights && r.rights[x[0]]; }).map(function (x) { return x[1]; }).join(', '); }, fmt: function (v, r) { return '<small class="mut">' + esc(r.role === 'Admin' ? 'Everything' : PD.RIGHTS.filter(function (x) { return r.rights && r.rights[x[0]]; }).map(function (x) { return x[1]; }).join(', ')) + '</small>'; } },
      { k: 'active', label: 'Status', fmt: function (v) { return v === false ? '<span class="badge bad">switched off</span>' : '<span class="badge ok">active</span>'; } }],
      rows: rows, note: 'Each person signs in with their own username + password on any computer or phone. Forgot a password? Switch that login off and make a new one (or they change it themselves from File → Change My Password).' }; },
      drill: admin ? function (r) { edit(r); } : null });
    PD.$('#r-act', el).insertAdjacentHTML('afterbegin', (admin ? '<button class="btn p sm" id="nu">' + PD.icon('plus') + 'Add staff login</button>' : '') + '<button class="btn sm" id="cp">' + PD.icon('lock') + 'Change my password</button>');
    if ($('#nu', el)) $('#nu', el).onclick = function () { edit(null); };
    $('#cp', el).onclick = PD.changeMyPassword;
    function rightsBox(cur) { return '<h4 style="margin:16px 0 8px">What can this person open?</h4><div class="form c3" id="rg">' + PD.RIGHTS.map(function (r) { return '<label class="chk"><input type="checkbox" data-rt="' + r[0] + '"' + (cur.rights && cur.rights[r[0]] ? ' checked' : '') + '> ' + esc(r[1]) + '</label>'; }).join('') + '</div>'; }
    function edit(u) {
      var isNew = !u, isAdm = u && u.role === 'Admin';
      var f = [{ k: 'name', label: 'Full name', req: true }].concat(isNew ? [{ k: 'username', label: 'Username (small letters, no spaces)', req: true }, { k: 'pass', label: 'Password (6+ characters)', type: 'password', req: true }] : [{ k: 'username', label: 'Username', readonly: true }]).concat(isAdm ? [] : [{ k: 'active', label: 'Login switched on', type: 'checkbox' }]);
      var cur = u || { role: 'Staff', active: true, rights: { dashboard: true, billing: true, salesret: true, explore: true } };
      PD.modal({ title: isNew ? 'Add staff login' : 'Edit ' + u.name, size: 'lg', body: PD.formHTML(f, Object.assign({}, cur, { pass: '' })) + (isAdm ? '<p class="hint">Admins can open everything. Only the warehouse admin can change an admin login.</p>' : rightsBox(cur)), foot: [{ label: 'Cancel' }, { label: isNew ? 'Create login' : 'Save', cls: 'p', keep: true, fn: function (api, btn) {
        try {
          var v = PD.readForm(api.body, f), rights = {}; PD.$$('[data-rt]', api.body).forEach(function (c) { rights[c.dataset.rt] = c.checked; });
          if (u && u.id === me.id && v.active === false) throw new Error('You cannot switch off your own login');
          busy(btn, true);
          var job = isNew ? C.createUser({ username: v.username, password: v.pass, name: v.name, app: APP, role: 'Staff', shopId: C.shopId, rights: rights })
            : C.updateUser(u.id, isAdm ? { name: v.name } : { name: v.name, rights: rights, active: v.active !== false });
          job.then(function () { PD.log(isNew ? 'Login created' : 'Login changed', isNew ? v.username : u.username); PD.toast(isNew ? 'Login created: ' + String(v.username).toLowerCase() : 'Saved', 'ok'); api.close(); PD.peopleView(el); }, function (e) { busy(btn, false); PD.err(e); });
        } catch (e) { PD.err(e); }
        return false;
      } }] });
    }
  }
};

if (APP !== 'warehouse') return;

/* ---------- warehouse: shops and their logins ---------- */
PD.views.wshops = { render: function (host) {
  if (PD.user.role !== 'Admin') { host.innerHTML = '<div class="card"><div class="bd">Only the warehouse admin can manage shops.</div></div>'; return; }
  host.innerHTML = '<div class="card"><div class="bd mut">Loading shops…</div></div>';
  Promise.all([C.listShops(), C.listAllUsers()]).then(function (x) { draw(x[0], x[1]); if (C.syncShops) C.syncShops(); }, function (e) { PD.err(e); host.innerHTML = '<div class="card"><div class="bd">Could not load shops: ' + esc(e.message || e) + '</div></div>'; });
  function draw(shops, users) {
    var hasOld = shops.some(function (s) { return s.doc === 'shop'; });
    PD.report(host, { id: 'wshops', title: 'Shops (' + shops.length + ')', load: function () { return { cols: [
      { k: 'code', label: 'Code' }, { k: 'name', label: 'Shop', fmt: function (v) { return '<b>' + esc(v) + '</b>'; } },
      { k: 'admins', label: 'Shop admin login(s)', raw: function (r) { return users.filter(function (u) { return u.shopId === r.id && u.role === 'Admin'; }).map(function (u) { return u.username; }).join(', '); }, fmt: function (v, r) { return esc(users.filter(function (u) { return u.shopId === r.id && u.role === 'Admin'; }).map(function (u) { return u.username + (u.active === false ? ' (off)' : ''); }).join(', ')); } },
      { k: 'staff', label: 'Staff', align: 'r', raw: function (r) { return users.filter(function (u) { return u.shopId === r.id && u.role !== 'Admin'; }).length; }, fmt: function (v, r) { return users.filter(function (u) { return u.shopId === r.id && u.role !== 'Admin'; }).length; } },
      { k: 'doc', label: 'Data', fmt: function (v) { return v === 'shop' ? '<span class="badge">existing shop data</span>' : '<small class="mut">own</small>'; } },
      { k: 'active', label: 'Status', fmt: function (v) { return v === false ? '<span class="badge bad">switched off</span>' : '<span class="badge ok">active</span>'; } }],
      rows: shops, note: 'Click a shop to rename it, switch it off, or manage its logins. A shop admin signs in to the shop app and creates their own staff.' }; },
      drill: function (r) { open(r); } });
    PD.$('#r-act', host).insertAdjacentHTML('afterbegin', '<button class="btn p sm" id="ns">' + PD.icon('plus') + 'New shop</button>');
    $('#ns', host).onclick = function () {
      var f = [{ k: 'name', label: 'Shop name', req: true, full: true }, { k: 'code', label: 'Code (short)' }, { k: 'address', label: 'Address / area' }]
        .concat(hasOld ? [] : [{ k: 'existing', label: 'This is the shop that was already running (use its existing bills, stock and accounts)', type: 'checkbox', full: true }])
        .concat([{ k: 'adminName', label: 'Shop admin: full name', req: true }, { k: 'username', label: 'Shop admin: username (small letters, no spaces)', req: true }, { k: 'pass', label: 'Shop admin: password (6+ characters)', type: 'password', req: true }]);
      PD.modal({ title: 'New shop', size: 'lg', body: PD.formHTML(f, { code: 'S' + (shops.length + 1), existing: !hasOld && !shops.length }) + '<p class="hint">The shop admin signs in to the shop app with this username and password, then adds their own staff.</p>', foot: [{ label: 'Cancel' }, { label: 'Create shop', cls: 'p', keep: true, fn: function (api, btn) {
        try { var v = PD.readForm(api.body, f); busy(btn, true);
          C.createShop({ name: v.name, code: v.code, address: v.address, existing: !!v.existing, adminName: v.adminName, username: v.username, password: v.pass }).then(function (r) {
            PD.log('Shop created', r.shop.name + ' / admin ' + r.admin.username); PD.toast('Shop "' + r.shop.name + '" created. Admin login: ' + r.admin.username, 'ok'); api.close(); PD.views.wshops.render(host);
          }, function (e) { busy(btn, false); PD.err(e); });
        } catch (e) { PD.err(e); }
        return false;
      } }] });
    };
    function open(s) {
      var mine = users.filter(function (u) { return u.shopId === s.id; });
      var f = [{ k: 'name', label: 'Shop name', req: true }, { k: 'code', label: 'Code' }, { k: 'address', label: 'Address / area' }, { k: 'active', label: 'Shop switched on (off = nobody of this shop can sign in)', type: 'checkbox', full: true }];
      var m = PD.modal({ title: s.name, size: 'lg', body: PD.formHTML(f, s) + '<h4 style="margin:16px 0 8px">Logins of this shop</h4><table class="t"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>' +
        (mine.map(function (u) { return '<tr><td>' + esc(u.name) + '</td><td>' + esc(u.username) + '</td><td>' + esc(u.role) + '</td><td>' + (u.active === false ? '<span class="badge bad">off</span>' : '<span class="badge ok">on</span>') + '</td><td class="r"><button class="btn sm" data-tg="' + u.id + '">' + (u.active === false ? 'Switch on' : 'Switch off') + '</button></td></tr>'; }).join('') || '<tr><td colspan="5" class="mut">No logins</td></tr>') +
        '</tbody></table><div class="row" style="margin-top:8px"><button class="btn sm" id="na">' + PD.icon('plus') + 'Add another admin login</button></div><p class="hint">Forgot password? Switch that login off and add a new one.</p>',
        foot: [{ label: 'Close' }, { label: 'Save shop', cls: 'p', keep: true, fn: function (api, btn) {
          try { var v = PD.readForm(api.body, f); busy(btn, true);
            C.updateShop(s.id, { name: v.name, code: v.code, address: v.address, active: !!v.active }).then(function () { PD.log('Shop changed', v.name); PD.toast('Saved', 'ok'); api.close(); PD.views.wshops.render(host); }, function (e) { busy(btn, false); PD.err(e); });
          } catch (e) { PD.err(e); }
          return false;
        } }] });
      PD.on(m.body, 'click', '[data-tg]', function (e, t) {
        var u = mine.find(function (x) { return x.id === t.dataset.tg; }); busy(t, true);
        C.updateUser(u.id, { active: u.active === false }).then(function () { u.active = u.active === false; PD.log('Login ' + (u.active ? 'switched on' : 'switched off'), u.username); m.close(); open(s); }, function (er) { busy(t, false); PD.err(er); });
      });
      $('#na', m.body).onclick = function () {
        var g = [{ k: 'name', label: 'Full name', req: true }, { k: 'username', label: 'Username', req: true }, { k: 'pass', label: 'Password (6+ characters)', type: 'password', req: true }];
        PD.modal({ title: 'New admin login for ' + s.name, size: 'md', body: PD.formHTML(g, {}), foot: [{ label: 'Cancel' }, { label: 'Create', cls: 'p', keep: true, fn: function (api, btn) {
          try { var v = PD.readForm(api.body, g); busy(btn, true);
            C.createUser({ username: v.username, password: v.pass, name: v.name, app: 'shop', role: 'Admin', shopId: s.id, rights: {} }).then(function (p) { users.push(p); PD.log('Shop admin created', s.name + ' / ' + p.username); PD.toast('Login created: ' + p.username, 'ok'); api.close(); m.close(); open(s); }, function (e) { busy(btn, false); PD.err(e); });
          } catch (e) { PD.err(e); }
          return false;
        } }] });
      };
    }
  }
} };

/* ---------- warehouse: profit & loss of every shop + the whole business ---------- */
PD.views.wpnl = { render: function (host, arg) {
  var from = (arg && arg.from) || PD.today().slice(0, 8) + '01', to = (arg && arg.to) || PD.today();
  host.innerHTML = '<div class="card"><div class="bd row" style="gap:10px;align-items:flex-end;flex-wrap:wrap"><div class="fld" style="min-width:150px"><label>From</label><input class="in sm" type="date" id="plf" value="' + from + '"></div><div class="fld" style="min-width:150px"><label>To</label><input class="in sm" type="date" id="plt" value="' + to + '"></div>' +
    '<button class="btn p sm" id="plg">Show</button><span class="hint">Shop cost = the price on the warehouse bill to the shop. The warehouse row is the warehouse margin on those bills. Sales are without GST.</span></div></div><div id="plr" style="margin-top:10px"></div>';
  $('#plg', host).onclick = function () { PD.views.wpnl.render(host, { from: $('#plf', host).value, to: $('#plt', host).value }); };
  var out = $('#plr', host); out.innerHTML = '<div class="card"><div class="bd mut">Loading…</div></div>';
  C.listShops().then(function (shops) {
    return Promise.all(shops.map(function (s) { return C.readDays(s.id, from, to).catch(function () { return []; }); })).then(function (all) {
      var rows = shops.map(function (s, i) {
        var r = { id: s.id, code: s.code, name: s.name, days: all[i], bills: 0, total: 0, sales: 0, cost: 0, returns: 0, retCost: 0, expense: 0, profit: 0 };
        all[i].forEach(function (d) { ['bills', 'total', 'sales', 'cost', 'returns', 'retCost', 'expense', 'profit'].forEach(function (k) { r[k] += d[k] || 0; }); });
        r.netCost = PD.r2(r.cost - r.retCost); r.gross = PD.r2(r.sales - r.returns - r.netCost); r.margin = (r.sales - r.returns) > 0 ? PD.r2(r.gross / (r.sales - r.returns) * 100) : 0;
        ['total', 'sales', 'cost', 'returns', 'retCost', 'expense', 'profit'].forEach(function (k) { r[k] = PD.r2(r[k]); });
        return r;
      });
      if (PD.svc.wMargin) { var w = PD.svc.wMargin(from, to); rows.push({ id: 'wh', code: 'WH', name: (PD.DB.settings.whName || 'Warehouse') + ' (bills to shops)', days: [], bills: w.bills, total: w.sales, sales: w.sales, cost: w.cost, returns: w.returns, retCost: w.retCost, expense: 0, netCost: PD.r2(w.cost - w.retCost), gross: w.gross, margin: (w.sales - w.returns) > 0 ? PD.r2(w.gross / (w.sales - w.returns) * 100) : 0, profit: w.gross }); }
      var stock = PD.svc.wStockValue ? PD.svc.wStockValue() : null;
      PD.report(out, { id: 'wpnl', title: 'Profit & Loss: ' + PD.fmtDate(from) + ' to ' + PD.fmtDate(to), load: function () { return { cols: [
        { k: 'code', label: 'Code' }, { k: 'name', label: 'Shop', fmt: function (v) { return '<b>' + esc(v) + '</b>'; } }, { k: 'bills', label: 'Bills', align: 'r', sum: true, fmtSum: function (t) { return String(Math.round(t)); } },
        { k: 'total', label: 'Collected (with GST)', align: 'r', sum: true, fmt: PD.n2 }, { k: 'sales', label: 'Sales (ex GST)', align: 'r', sum: true, fmt: PD.n2 }, { k: 'returns', label: 'Returns', align: 'r', sum: true, fmt: PD.n2 },
        { k: 'netCost', label: 'Cost of medicines', align: 'r', sum: true, fmt: PD.n2 }, { k: 'gross', label: 'Gross profit', align: 'r', sum: true, fmt: PD.n2 },
        { k: 'margin', label: 'Margin %', align: 'r', fmt: function (v) { return PD.n2(v) + '%'; } }, { k: 'expense', label: 'Expenses', align: 'r', sum: true, fmt: PD.n2 },
        { k: 'profit', label: 'Net profit', align: 'r', sum: true, fmt: function (v) { return '<b style="color:' + (v < 0 ? '#c62828' : '#2e7d32') + '">' + PD.n2(v) + '</b>'; }, raw: function (r) { return r.profit; } }],
        rows: rows, note: 'Net profit total = the whole business (the warehouse row shows its margin on bills to your own shops). Each shop sends its figures automatically while it is open and online.' + (stock != null ? ' Stock in the warehouse now (at cost): ₹' + PD.n2(stock) + '.' : '') + ' Click a shop for day-wise figures.' }; },
        drill: function (r) {
          var ds = r.days.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
          PD.modal({ title: r.name + ': day-wise', size: 'lg', body: '<table class="t"><thead><tr><th>Date</th><th class="r">Bills</th><th class="r">Sales</th><th class="r">Returns</th><th class="r">Cost</th><th class="r">Expenses</th><th class="r">Net profit</th></tr></thead><tbody>' +
            (ds.map(function (d) { return '<tr><td>' + PD.fmtDate(d.date) + '</td><td class="r">' + d.bills + '</td><td class="r">' + PD.n2(d.sales) + '</td><td class="r">' + PD.n2(d.returns) + '</td><td class="r">' + PD.n2(d.cost - d.retCost) + '</td><td class="r">' + PD.n2(d.expense) + '</td><td class="r"><b>' + PD.n2(d.profit) + '</b></td></tr>'; }).join('') || '<tr><td colspan="7" class="mut">No sales in these dates</td></tr>') + '</tbody></table>', foot: [{ label: 'Close' }] });
        } });
    });
  }).catch(function (e) { PD.err(e); out.innerHTML = '<div class="card"><div class="bd">Could not load: ' + esc(e.message || e) + '</div></div>'; });
} };
})();
