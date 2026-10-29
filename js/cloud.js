/* Medismart cloud: personal logins (Firebase Auth), Firestore storage, many shops, and the live shop <-> warehouse link.
   Same file in both apps. window.MS_APP = 'shop' | 'warehouse' (set in index.html).

   Storage:  apps/{app}                 meta { rev, session, at, keys: { key: chunkCount } }
             apps/{app}/parts/{key}~{i} { d: '<json chunk>' }   (one top-level DB key, split so no doc passes 1 MB)
   Link:     exchange/{id}              { type, from, to, status, shop, no, payload, at }
             exchange/catalog           medicine list published by the warehouse
   The whole DB stays in memory as PD.DB (as before); PD.save() pushes only the keys that changed. */
(function () {
'use strict';
var PD = window.PD, APP = window.MS_APP || 'shop';
var CHUNK = 240000;                       /* characters per part doc (well under Firestore's 1 MB) */
var SESSION = Math.random().toString(36).slice(2) + Date.now().toString(36);
var C = PD.cloud = { app: APP, state: 'idle', rev: 0, dirty: false, last: {}, late: {} };
var db, auth, metaRef, pushTimer = null, pushing = false, retryMs = 2000, started = false, pushSeq = 0;

function fire() {
  if (db) return;
  if (!window.firebase || !window.MS_FIREBASE) throw new Error('Firebase did not load. Check the internet connection and refresh.');
  firebase.initializeApp(window.MS_FIREBASE);
  auth = firebase.auth(); db = firebase.firestore();
  db.settings({ ignoreUndefinedProperties: true, merge: true });   /* records carry blank (undefined) fields */
}

/* ---------- status shown in the status bar ---------- */
function setState(s, msg) {
  C.state = s; C.msg = msg || '';
  var el = document.getElementById('sync'); if (!el) return;
  var t = { ok: '☁ Saved online', saving: '☁ Saving…', offline: '⚠ Offline – saved on this computer, will upload', error: '⚠ Not saved online', idle: '☁' }[s] || s;
  el.textContent = t; el.title = msg || t; el.className = 'sync ' + s;
}
C.paint = function () { setState(C.state, C.msg); };

/* ---------- local copy (IndexedDB) so nothing is lost if the internet drops ---------- */
var CACHE = 'medismart-cloud-' + APP;
function idb(mode, fn) {
  return new Promise(function (res) {
    try {
      var rq = indexedDB.open(CACHE, 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('kv'); };
      rq.onsuccess = function () { var tx = rq.result.transaction('kv', mode), st = tx.objectStore('kv'), out = fn(st); tx.oncomplete = function () { rq.result.close(); res(out && out.result !== undefined ? out.result : out); }; tx.onerror = function () { res(null); }; };
      rq.onerror = function () { res(null); };
    } catch (e) { res(null); }
  });
}
function cacheGet() { return idb('readonly', function (st) { return st.get('c'); }); }
function cachePut() { var snap = { db: PD.DB, rev: C.rev, dirty: C.dirty, at: Date.now() }; return idb('readwrite', function (st) { st.put(snap, 'c'); }); }

/* ---------- read / write the DB ---------- */
function split(s) { var a = []; for (var i = 0; i < s.length; i += CHUNK) a.push(s.slice(i, i + CHUNK)); return a.length ? a : ['']; }
function readCloud() {
  return metaRef.get({ source: 'server' }).then(function (m) {
    if (!m.exists || !m.data().keys) return null;
    var meta = m.data();
    return metaRef.collection('parts').get({ source: 'server' }).then(function (qs) {
      var parts = {}; qs.forEach(function (d) { parts[d.id] = d.data().d; });
      var out = {}, last = {};
      Object.keys(meta.keys).forEach(function (k) {
        var s = ''; for (var i = 0; i < meta.keys[k]; i++) s += parts[k + '~' + i] || '';
        last[k] = s; out[k] = s ? JSON.parse(s) : null;
      });
      return { db: out, rev: meta.rev || 0, last: last, keys: meta.keys, pushId: meta.pushId || '' };
    });
  });
}
function push() {
  if (!PD.DB || pushing) return;
  clearTimeout(pushTimer); pushing = true; setState('saving');
  var changed = {}, keys = {}, any = false;
  Object.keys(PD.DB).forEach(function (k) {
    var s = JSON.stringify(PD.DB[k] === undefined ? null : PD.DB[k]);
    keys[k] = split(s).length;
    if (C.last[k] !== s) { changed[k] = s; any = true; }
  });
  if (!any && C.rev) { pushing = false; C.dirty = false; setState('ok'); return; }
  var base = C.rev, token = ++pushSeq, pushId = SESSION + '-' + token, settled = false;
  /* no answer in 15 s (internet down): show offline and retry later. If this save still lands later, it is recognised by its pushId. */
  var guard = setTimeout(function () {
    if (settled || token !== pushSeq) return;
    pushSeq++; pushing = false; C.dirty = true; C.late[pushId] = { base: base, changed: changed }; cachePut();
    setState('offline'); pushTimer = setTimeout(push, retryMs); retryMs = Math.min(retryMs * 2, 30000);
  }, 15000);
  db.runTransaction(function (tx) {
    return tx.get(metaRef).then(function (m) {
      var cur = m.exists ? (m.data().rev || 0) : 0, old = m.exists ? (m.data().keys || {}) : {};
      if (cur !== base) { var e = new Error('conflict'); e.conflict = true; throw e; }
      var parts = metaRef.collection('parts'), writes = 0;
      Object.keys(changed).forEach(function (k) {
        var ch = split(changed[k]);
        ch.forEach(function (c, i) { tx.set(parts.doc(k + '~' + i), { d: c }); writes++; });
        for (var j = ch.length; j < (old[k] || 0); j++) tx.delete(parts.doc(k + '~' + j));
      });
      if (writes > 480) throw new Error('Too much changed at once to save in one go');
      tx.set(metaRef, { rev: base + 1, session: SESSION, pushId: pushId, at: firebase.firestore.FieldValue.serverTimestamp(), keys: keys });
    });
  }).then(function () {
    settled = true; clearTimeout(guard);
    if (token !== pushSeq) { lateLanded(pushId); return; }
    Object.keys(changed).forEach(function (k) { C.last[k] = changed[k]; });
    C.rev = base + 1; pushing = false; retryMs = 2000; cachePut(); publishDays();
    if (C.dirtyAgain || !sameAsLast()) { C.dirtyAgain = false; schedule(); } else { C.dirty = false; setState('ok'); }
  }).catch(function (e) {
    settled = true; clearTimeout(guard);
    if (token !== pushSeq) return;                    /* an old timed-out save failed: nothing to do */
    pushing = false;
    if (e && e.conflict) { conflict(); return; }
    C.dirty = true; cachePut();
    var off = !navigator.onLine || /offline|unavailable|network/i.test(String(e && (e.code || e.message)));
    setState(off ? 'offline' : 'error', e && e.message);
    console.warn('cloud save', e);
    pushTimer = setTimeout(push, retryMs); retryMs = Math.min(retryMs * 2, 60000);
  });
}
function sameAsLast() { return Object.keys(PD.DB).every(function (k) { return C.last[k] === JSON.stringify(PD.DB[k] === undefined ? null : PD.DB[k]); }); }
/* a save we had given up on (timeout) reached the server after all: adopt it instead of merging it twice */
function lateLanded(pushId) {
  var L = C.late[pushId]; delete C.late[pushId]; if (!L || C.rev !== L.base) return;
  Object.keys(L.changed).forEach(function (k) { C.last[k] = L.changed[k]; });
  C.rev = L.base + 1; if (!pushing) schedule();
}
function schedule() { C.dirty = true; if (pushing) { C.dirtyAgain = true; return; } clearTimeout(pushTimer); pushTimer = setTimeout(push, 400); }
/* save right now and wait (used before a page reload). Resolves true when saved online. */
C.saveNow = function () {
  return new Promise(function (res) {
    var t0 = Date.now();
    (function tick() {
      if (!pushing && !C.dirty && C.rev) return res(true);
      if (Date.now() - t0 > 20000) return res(false);
      if (!pushing) push();
      setTimeout(tick, 300);
    })();
  });
};
/* replace the whole DB (restore / wipe) and save it */
C.replaceAll = function (nd) { PD.DB = nd; C.dirty = true; return cachePut().then(C.saveNow); };

/* ---------- 3-way merge: another computer saved first, so combine its changes with ours ----------
   base = what we last loaded/saved, mine = our current data, theirs = what is online now.
   Records with an id are merged one by one, numbers that both sides changed add up
   (two sales of the same batch both reduce its stock), append-only lists keep both sides' new rows. */
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function idArr(a) { return Array.isArray(a) && a.length && a.every(function (x) { return isObj(x) && x.id != null; }); }
function merge(base, mine, theirs) {
  if (same(mine, base)) return theirs;
  if (same(theirs, base)) return mine;
  /* both sides moved the same number (e.g. each sold a strip): apply both changes */
  if (typeof base === 'number' && typeof mine === 'number' && typeof theirs === 'number') return Math.round((theirs + mine - base) * 1e6) / 1e6;
  if (!(Array.isArray(mine) && Array.isArray(theirs)) && !(isObj(mine) && isObj(theirs))) return mine;
  if (Array.isArray(mine) && Array.isArray(theirs)) {
    var b = Array.isArray(base) ? base : [];
    if ((idArr(mine) || !mine.length) && (idArr(theirs) || !theirs.length) && (idArr(b) || !b.length)) {
      var B = {}, M = {}; b.forEach(function (x) { B[x.id] = x; }); mine.forEach(function (x) { M[x.id] = x; });
      var out = [], seen = {};
      theirs.forEach(function (t) {
        seen[t.id] = 1; var m = M[t.id], o = B[t.id];
        if (m) out.push(merge(o, m, t));
        else if (!o || !same(t, o)) out.push(t);          /* we deleted it but they changed it: keep theirs */
      });
      mine.forEach(function (m) { if (!seen[m.id] && (!B[m.id] || !same(m, B[m.id]))) out.push(m); });   /* ours, new (or they deleted but we changed) */
      return out;
    }
    /* plain list (e.g. activity log): keep their list plus rows we added */
    var extra = mine.filter(function (x) { return !b.some(function (y) { return same(x, y); }); });
    return theirs.concat(extra.filter(function (x) { return !theirs.some(function (y) { return same(x, y); }); }));
  }
  if (isObj(mine) && isObj(theirs)) {
    var bo = isObj(base) ? base : {}, res = {}, keys = {};
    [mine, theirs, bo].forEach(function (o) { Object.keys(o).forEach(function (k) { keys[k] = 1; }); });
    Object.keys(keys).forEach(function (k) {
      var v = (k in mine) ? ((k in theirs) ? merge(bo[k], mine[k], theirs[k]) : (k in bo && same(mine[k], bo[k]) ? undefined : mine[k])) : ((k in bo && same(theirs[k], bo[k])) ? undefined : theirs[k]);
      if (v !== undefined) res[k] = v;
    });
    return res;
  }
  return mine;
}
C._merge = merge;
/* two counters billed at the same moment: give our new bills the next free numbers in their series */
function fixBillNumbers(theirsSales, baseSales) {
  var D = PD.DB; if (!Array.isArray(D.sales) || !Array.isArray(theirsSales)) return;
  var T = {}, B = {}, used = {}; theirsSales.forEach(function (s) { T[s.id] = 1; used[s.no] = 1; }); (baseSales || []).forEach(function (s) { B[s.id] = 1; });
  var top = {}; theirsSales.forEach(function (s) { var n = +String(s.no).split('-').pop() || 0; top[s.series] = Math.max(top[s.series] || 0, n); });
  D.sales.forEach(function (s) {
    if (T[s.id] || B[s.id] || !used[s.no]) { used[s.no] = 1; return; }
    var n = (top[s.series] || 0) + 1, no = s.series + '-' + ('000000' + n).slice(-6);
    while (used[no]) { n++; no = s.series + '-' + ('000000' + n).slice(-6); }
    top[s.series] = n; used[no] = 1;
    var old = s.no; s.no = no;
    (D.moves || []).forEach(function (m) { if (m.refId === s.id) m.ref = no; });
    (D.vouchers || []).forEach(function (v) { if (v.src && v.src.id === s.id) v.narr = String(v.narr).replace(old, no); });
    D.counters['S-' + s.series] = Math.max(D.counters['S-' + s.series] || 0, n);
    console.info('cloud: bill ' + old + ' renumbered to ' + no);
  });
}
function conflict() {
  readCloud().then(function (r) {
    if (!r) return;
    if (r.pushId && C.late[r.pushId] && r.rev === C.late[r.pushId].base + 1) { lateLanded(r.pushId); return; }   /* it was our own delayed save */
    var keys = {}; Object.keys(PD.DB).concat(Object.keys(r.db)).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      var base = C.last[k] ? JSON.parse(C.last[k]) : undefined, mine = PD.DB[k], theirs = r.db[k];
      PD.DB[k] = mine === undefined ? theirs : theirs === undefined ? mine : merge(base, mine, theirs);
    });
    if (APP === 'shop') try { fixBillNumbers(r.db.sales, C.last.sales ? JSON.parse(C.last.sales) : []); } catch (e) { console.warn('renumber', e); }
    C.last = r.last; C.rev = r.rev; C.dirty = true; C.merges = (C.merges || 0) + 1;
    console.info('cloud: merged with changes from another computer (rev ' + r.rev + ')');
    if (PD.onRemote) try { PD.onRemote(); } catch (e) { console.error(e); }
    schedule();
  }).catch(function (e) { console.warn('merge', e); C.dirty = true; pushTimer = setTimeout(push, retryMs); });
}
function applyRemote(r) {
  Object.keys(r.db).forEach(function (k) { PD.DB[k] = r.db[k]; });
  C.last = r.last; C.rev = r.rev; C.dirty = false; setState('ok'); cachePut();
  if (PD.onRemote) try { PD.onRemote(); } catch (e) { console.error(e); }
}

/* replaces the browser-only store from core.js */
PD.save = function () { if (!PD.DB) return; schedule(); };
PD.flush = function () { if (!PD.DB) return; cachePut(); if (db) push(); };
addEventListener('beforeunload', function (e) { if (C.dirty || pushing) { cachePut(); e.preventDefault(); e.returnValue = 'Saving online…'; } });
addEventListener('online', function () { if (C.dirty) push(); });

/* ---------- logins: every person has their own username + password (Firebase Authentication) ----------
   users/{uid}   { username, name, app: 'shop'|'warehouse', role: 'Admin'|'Staff', shopId, rights, active }
   shops/{id}    { name, code, doc, active }   doc = the apps/{doc} that holds that shop's data
   config/owner  { uid }                       the first warehouse admin (made once, on the setup screen) */
var DOMAIN = 'u.medismart.app';
C.emailOf = function (u) { return String(u || '').trim().toLowerCase() + '@' + DOMAIN; };
C.me = null; C.shop = null; C.shopId = ''; C.doc = APP; C.dir = [];
function nameOk(u) { return /^[a-z0-9][a-z0-9._-]{2,29}$/.test(u); }
function niceAuth(e) {
  var c = e && e.code || '';
  return c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found' || c === 'auth/invalid-email' || c === 'auth/invalid-login-credentials' ? 'Wrong username or password.' :
    c === 'auth/email-already-in-use' ? 'That username is already taken. Choose another.' :
    c === 'auth/weak-password' ? 'Use at least 6 characters for the password.' :
    c === 'auth/too-many-requests' ? 'Too many tries. Wait a minute and try again.' :
    c === 'auth/user-disabled' ? 'This login is switched off.' :
    c === 'auth/operation-not-allowed' || c === 'auth/configuration-not-found' ? 'Email/Password sign-in is not switched on in Firebase (Authentication → Sign-in method).' :
    c === 'auth/network-request-failed' ? 'No internet connection.' :
    c === 'permission-denied' ? 'Not allowed. Check that the new Firestore rules are published (see SETUP.md).' : (e && e.message) || 'Something went wrong';
}
function ls(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
function offlineErr(e) { return !navigator.onLine || /offline|unavailable|network/i.test(String(e && (e.code || e.message))); }
function box(inner) { document.body.className = ''; document.body.innerHTML = '<div class="login"><div class="card box"><div class="brand" style="padding:0;color:var(--ink)"><span class="lg">' + PD.icon('pill') + '</span><b>' + (APP === 'shop' ? 'Medismart' : 'Medismart Warehouse') + '</b></div>' + inner + '</div></div>'; }
var q$ = function (s) { return document.querySelector(s); };

function loginScreen(msg) {
  return new Promise(function (res) {
    box('<h1>Sign in</h1><p class="mut">Use your own username and password. Works on any computer or phone.</p><br>' +
      '<div class="fld"><label>Username</label><input class="in" id="lu" autocomplete="username" autocapitalize="none" autofocus></div><div class="fld" style="margin-top:12px"><label>Password</label><input class="in" id="lp" type="password" autocomplete="current-password"></div>' +
      '<p id="le" style="color:var(--bad);min-height:20px;margin:8px 0 0">' + PD.esc(msg || '') + '</p><button class="btn p lg" id="lb" style="width:100%;margin-top:6px">Sign in</button>' +
      '<p class="hint" style="margin-top:14px">' + (APP === 'shop' ? 'No login yet? The warehouse admin creates the shop admin; the shop admin creates staff logins.' : 'No login yet? Ask the warehouse admin.') + '<span id="su"></span></p>');
    function go() {
      var u = q$('#lu').value.trim().toLowerCase(), p = q$('#lp').value;
      if (!u || !p) { q$('#le').textContent = 'Enter username and password'; return; }
      q$('#lb').disabled = true; q$('#le').textContent = '';
      auth.signInWithEmailAndPassword(C.emailOf(u), p).then(function (r) { res(r.user); }).catch(function (e) { q$('#lb').disabled = false; q$('#le').textContent = niceAuth(e); });
    }
    q$('#lb').onclick = go; q$('#lp').addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); }); q$('#lu').addEventListener('keydown', function (e) { if (e.key === 'Enter') q$('#lp').focus(); });
    /* warehouse: the very first admin is made here, once */
    if (APP === 'warehouse') db.collection('config').doc('owner').get().then(function (s) {
      if (s.exists) return;
      q$('#su').innerHTML = ' <br><b>First time?</b> <a href="#" id="sl">Set up the warehouse admin</a>';
      q$('#sl').onclick = function (e) { e.preventDefault(); setupScreen().then(res); };
    }).catch(function () {});
  });
}
function setupScreen() {
  return new Promise(function (res) {
    box('<h1>Set up the warehouse</h1><p class="mut">This makes the main admin login. Only done once.</p><br>' +
      '<div class="fld"><label>Warehouse name</label><input class="in" id="fn" autofocus></div>' +
      '<div class="fld" style="margin-top:12px"><label>Your name</label><input class="in" id="fm"></div>' +
      '<div class="fld" style="margin-top:12px"><label>Admin username</label><input class="in" id="fu" value="admin" autocapitalize="none"></div>' +
      '<div class="fld" style="margin-top:12px"><label>Password (6+ characters)</label><input class="in" id="fp" type="password"></div>' +
      '<div class="fld" style="margin-top:12px"><label>Repeat password</label><input class="in" id="fp2" type="password"></div>' +
      '<p id="fe" style="color:var(--bad);min-height:20px;margin:8px 0 0"></p><button class="btn p lg" id="fb" style="width:100%;margin-top:6px">Create admin</button>');
    q$('#fb').onclick = function () {
      var n = q$('#fn').value.trim(), m = q$('#fm').value.trim() || 'Administrator', u = q$('#fu').value.trim().toLowerCase(), p = q$('#fp').value;
      if (!n) { q$('#fe').textContent = 'Enter the warehouse name'; return; }
      if (!nameOk(u)) { q$('#fe').textContent = 'Username: 3-30 small letters / numbers (no spaces)'; return; }
      if (p.length < 6) { q$('#fe').textContent = 'Password must be at least 6 characters'; return; }
      if (p !== q$('#fp2').value) { q$('#fe').textContent = 'Passwords do not match'; return; }
      q$('#fb').disabled = true;
      auth.createUserWithEmailAndPassword(C.emailOf(u), p).then(function (r) {
        var uid = r.user.uid, b = db.batch();
        b.set(db.collection('config').doc('owner'), { uid: uid, at: stamp() });
        b.set(db.collection('users').doc(uid), { username: u, name: m, app: 'warehouse', role: 'Admin', shopId: '', rights: {}, active: true, at: stamp(), by: 'setup' });
        return b.commit().then(function () { C.setupName = n; res(r.user); });
      }).catch(function (e) { q$('#fb').disabled = false; q$('#fe').textContent = niceAuth(e); });
    };
  });
}
function waitAuth() {
  return new Promise(function (res) { var off = auth.onAuthStateChanged(function (u) { off(); res(u); }); });
}
function blocked(title, text) { box('<h1>' + title + '</h1><p class="mut">' + text + '</p><br><button class="btn p lg" id="so" style="width:100%">Sign in with another login</button>'); q$('#so').onclick = function () { C.signOut(); }; return new Promise(function () {}); }
function msgScreen(title, text, retry) {
  box('<h1>' + title + '</h1><p class="mut">' + text + '</p><br><button class="btn p lg" id="rt" style="width:100%">Try again</button>');
  document.getElementById('rt').onclick = retry || function () { location.reload(); };
}
C.signOut = function () { try { localStorage.removeItem('ms_dir_' + APP); } catch (e) {} return auth.signOut().then(function () { location.reload(); }); };

/* who is signed in: their profile, their shop (shop app) and which data doc to open. Cached for offline starts. */
function loadProfile(u) {
  var key = 'ms_prof_' + u.uid;
  return db.collection('users').doc(u.uid).get().then(function (s) {
    if (!s.exists) return null;
    var p = s.data(); p.id = u.uid;
    if (p.active === false || p.app !== APP || p.app !== 'shop' || !p.shopId) return p;
    return db.collection('shops').doc(p.shopId).get().then(function (sh) { p.shop = sh.exists ? Object.assign({ id: sh.id }, sh.data()) : null; return p; });
  }).then(function (p) { if (p) ls(key, p); return p; }).catch(function (e) { var c = ls(key); if (c && offlineErr(e)) return c; throw e; });
}
function checkProfile(p) {
  if (!p) return blocked('No access', 'This login has no Medismart profile. Ask the warehouse admin to create your login.');
  if (p.active === false) return blocked('Login switched off', 'Your login has been switched off by the admin.');
  if (p.app !== APP) return blocked('Wrong app', 'This is a ' + (p.app === 'shop' ? 'shop' : 'warehouse') + ' login. Open the ' + (p.app === 'shop' ? 'shop (Medismart)' : 'Medismart Warehouse') + ' app to use it.');
  if (APP === 'shop') {
    if (!p.shop) return blocked('Shop not found', 'Your shop is not set up yet. Ask the warehouse admin.');
    if (p.shop.active === false) return blocked('Shop closed', 'This shop has been switched off by the warehouse admin.');
    C.shop = p.shop; C.shopId = p.shop.id; C.doc = p.shop.doc || ('shop_' + p.shop.id);
  } else C.doc = 'warehouse';
  C.me = p; metaRef = db.collection('apps').doc(C.doc); CACHE = 'medismart-cloud-' + C.doc;
  return Promise.resolve(p);
}
/* the people of this shop / of the warehouse (PD.DB.users mirrors it; no passwords are kept in the data) */
function readDir() {
  var q = APP === 'shop' ? db.collection('users').where('shopId', '==', C.shopId) : db.collection('users').where('app', '==', 'warehouse');
  return q.get().then(function (qs) { var a = []; qs.forEach(function (d) { a.push(Object.assign({ id: d.id }, d.data())); }); C.dir = a; ls('ms_dir_' + APP, a); return a; })
    .catch(function (e) { console.warn('users', e); C.dir = ls('ms_dir_' + APP) || [C.me]; return C.dir; });
}
function asUser(p) { return { id: p.id, name: p.name || p.username, username: p.username, role: p.role === 'Admin' ? 'Admin' : 'Staff', rights: p.rights || {}, active: p.active !== false, online: true }; }
C.syncUsers = function () {
  var D = PD.DB; if (!D) return;
  var old = (D.users || []).filter(function (u) { return !u.online && !C.dir.some(function (p) { return p.id === u.id; }); }).map(function (u) { return Object.assign({}, u, { active: false, pass: undefined, old: true }); });
  if (!C.dir.some(function (p) { return p.id === C.me.id; })) C.dir.push(C.me);
  D.users = C.dir.map(asUser).concat(old);
};
C.refreshUsers = function () { return readDir().then(function () { C.syncUsers(); PD.save(); }); };
/* first start of a brand-new data doc */
C.initDB = function (D) {
  if (APP === 'shop' && C.shop) { D.shop.name = C.shop.name; }
  if (APP === 'warehouse' && C.setupName) { D.shop.name = C.setupName; D.settings.whName = C.setupName; }
  D.setupDone = PD.today();
};
PD.firstRun = function (done) { C.initDB(PD.DB); PD.save(); done(); };

/* make a login for someone else. A second Firebase app is used so the admin stays signed in. */
C.createUser = function (o) {
  var u = String(o.username || '').trim().toLowerCase();
  if (!nameOk(u)) return Promise.reject(new Error('Username: 3-30 small letters / numbers, no spaces (e.g. ravi or ravi.k)'));
  if (String(o.password || '').length < 6) return Promise.reject(new Error('Password must be at least 6 characters'));
  var app2 = firebase.initializeApp(window.MS_FIREBASE, 'mk' + Date.now()), a2 = app2.auth();
  return a2.setPersistence(firebase.auth.Auth.Persistence.NONE).then(function () { return a2.createUserWithEmailAndPassword(C.emailOf(u), o.password); }).then(function (r) {
    var uid = r.user.uid;
    var prof = { username: u, name: o.name || u, app: o.app || APP, role: o.role === 'Admin' ? 'Admin' : 'Staff', shopId: o.shopId || '', rights: o.rights || {}, active: true, at: stamp(), by: C.me ? C.me.username : '' };
    return a2.signOut().then(function () { return db.collection('users').doc(uid).set(prof); }).then(function () { prof.id = uid; return prof; });
  }).then(function (p) { app2.delete().catch(function () {}); return p; }, function (e) { app2.delete().catch(function () {}); throw new Error(niceAuth(e)); });
};
C.updateUser = function (uid, patch) { return db.collection('users').doc(uid).update(patch).catch(function (e) { throw new Error(niceAuth(e)); }); };
C.changePassword = function (oldP, newP) {
  if (String(newP).length < 6) return Promise.reject(new Error('Use at least 6 characters'));
  var u = auth.currentUser, cred = firebase.auth.EmailAuthProvider.credential(u.email, oldP);
  return u.reauthenticateWithCredential(cred).then(function () { return u.updatePassword(newP); }).catch(function (e) { throw new Error(niceAuth(e)); });
};
/* warehouse admin: shops and every login */
C.listShops = function () { return db.collection('shops').get().then(function (qs) { var a = []; qs.forEach(function (d) { a.push(Object.assign({ id: d.id }, d.data())); }); a.sort(function (x, y) { return String(x.code).localeCompare(String(y.code), undefined, { numeric: true }); }); C.shops = a; return a; }); };
C.listAllUsers = function () { return db.collection('users').get().then(function (qs) { var a = []; qs.forEach(function (d) { a.push(Object.assign({ id: d.id }, d.data())); }); return a; }); };
C.createShop = function (o) {
  var name = String(o.name || '').trim(); if (!name) return Promise.reject(new Error('Enter the shop name'));
  return C.listShops().then(function (list) {
    if (list.some(function (s) { return s.name.toLowerCase() === name.toLowerCase(); })) throw new Error('A shop with this name already exists');
    if (o.existing && list.some(function (s) { return s.doc === 'shop'; })) throw new Error('The existing shop data is already linked to another shop');
    var id = 'sh' + Math.random().toString(36).slice(2, 8), rec = { name: name, code: o.code || ('S' + (list.length + 1)), doc: o.existing ? 'shop' : 'shop_' + id, active: true, address: o.address || '', at: stamp(), by: C.me.username };
    /* the shop that was already running: remember the name it used, so its old requests / returns are matched */
    var old = o.existing ? db.collection('apps').doc('shop').collection('parts').doc('shop~0').get().then(function (d) { try { rec.oldName = JSON.parse(d.data().d).name || ''; } catch (e) {} }).catch(function () {}) : Promise.resolve();
    return old.then(function () { return C.createUser({ username: o.username, password: o.password, name: o.adminName, app: 'shop', role: 'Admin', shopId: id, rights: {} }).then(function (adm) {
      return db.collection('shops').doc(id).set(rec).then(function () { rec.id = id; return { shop: rec, admin: adm }; });
    }); });
  }).catch(function (e) { throw e instanceof Error ? e : new Error(niceAuth(e)); });
};
C.updateShop = function (id, patch) { return db.collection('shops').doc(id).update(patch).catch(function (e) { throw new Error(niceAuth(e)); }); };

/* PD.load: sign in, then read the DB from Firestore (falls back to the local copy when offline) */
PD.load = function () {
  try { fire(); } catch (e) { msgScreen('Cannot start', PD.esc(e.message)); return new Promise(function () {}); }
  return waitAuth().then(function (u) { return u || loginScreen(); }).then(function (u) {
    box('<p class="mut">Loading…</p>');
    return loadProfile(u).catch(function (e) { if (e && e.code === 'permission-denied') return null; throw e; });
  }).then(checkProfile).then(function () {
    return Promise.all([readCloud(), cacheGet(), readDir()]);
  }).then(function (x) {
    var r = x[0], cache = x[1];
    if (r) {
      C.last = r.last; C.rev = r.rev;
      if (cache && cache.dirty && cache.rev === r.rev && cache.db) { C.dirty = true; setTimeout(push, 500); return cache.db; }   /* unsent work from last time */
      return r.db;
    }
    C.rev = 0; C.last = {}; return null;            /* brand new: the app builds a blank DB and the first save uploads it */
  }).catch(function (e) {
    console.warn('cloud load', e);
    if (e && e.code === 'permission-denied') return blocked('No access', 'This login is not allowed to open the data. Check the Firestore rules (see SETUP.md).');
    if (!C.me) { msgScreen('No internet', 'Medismart needs the internet to sign in. Connect and try again.'); return new Promise(function () {}); }
    return cacheGet().then(function (cache) {
      C.dir = ls('ms_dir_' + APP) || [C.me];
      if (cache && cache.db) { C.rev = cache.rev || 0; C.dirty = !!cache.dirty; setTimeout(function () { setState('offline'); }, 50); return cache.db; }
      msgScreen('No internet', 'Medismart needs the internet the first time it opens on this computer. Connect and try again.');
      return new Promise(function () {});
    });
  });
};

/* ---------- shop: a small summary per day for the warehouse P&L (shops/{id}/days/{date}) ---------- */
C.daySummaries = function (D) {
  var out = {}, accs = {}; (D.accounts || []).forEach(function (a) { accs[a.id] = a; });
  function day(d) { return out[d] || (out[d] = { date: d, bills: 0, sales: 0, gst: 0, total: 0, cost: 0, returns: 0, retCost: 0, expense: 0, cashSales: 0 }); }
  (D.sales || []).forEach(function (s) { var x = day(s.date); x.bills++; x.sales += s.taxable || 0; x.gst += s.tax || 0; x.total += s.total || 0; if (s.payMode === 'cash') x.cashSales += s.total || 0; (s.lines || []).forEach(function (l) { x.cost += (l.qty || 0) * (l.cost || 0); }); });
  var byId = {}; (D.sales || []).forEach(function (s) { byId[s.id] = s; });
  (D.sreturns || []).forEach(function (r) { var x = day(r.date), b = byId[r.billId]; x.returns += r.taxable || 0; (r.lines || []).forEach(function (l) { var c = l.cost != null ? l.cost : (b && b.lines[l.idx] ? b.lines[l.idx].cost || 0 : 0); x.retCost += (l.qty || 0) * c; }); });
  (D.vouchers || []).forEach(function (v) { (v.lines || []).forEach(function (l) { var a = accs[l.acc]; if (a && l.acc !== 'roundoff' && (a.group === 'Indirect Expense' || a.group === 'Direct Expense')) day(v.date).expense += (l.dr || 0) - (l.cr || 0); }); });
  Object.keys(out).forEach(function (d) { var x = out[d]; ['sales', 'gst', 'total', 'cost', 'returns', 'retCost', 'expense', 'cashSales'].forEach(function (k) { x[k] = Math.round(x[k] * 100) / 100; }); x.profit = Math.round((x.sales - x.cost - (x.returns - x.retCost) - x.expense) * 100) / 100; });
  return out;
};
var daySent = null, dayTimer = null;
function publishDays() {
  if (APP !== 'shop' || !C.shopId || !PD.DB) return;
  clearTimeout(dayTimer); dayTimer = setTimeout(function () {
    var col = db.collection('shops').doc(C.shopId).collection('days');
    (daySent ? Promise.resolve() : col.get().then(function (qs) { daySent = {}; qs.forEach(function (d) { var x = d.data(); delete x.at; daySent[d.id] = JSON.stringify(x); }); })).then(function () {
      var all = C.daySummaries(PD.DB), b = db.batch(), n = 0, sent = {};
      Object.keys(all).forEach(function (d) { var s = JSON.stringify(all[d]); if (daySent[d] !== s && n < 400) { b.set(col.doc(d), Object.assign({ at: stamp() }, all[d])); sent[d] = s; n++; } });
      if (!n) return;
      return b.commit().then(function () { Object.keys(sent).forEach(function (d) { daySent[d] = sent[d]; }); if (n >= 400) publishDays(); });
    }).catch(function (e) { console.warn('day summary', e); });
  }, 3000);
}
C.publishDays = publishDays;
/* warehouse: read the shops' day summaries */
C.readDays = function (shopId, from, to) {
  return db.collection('shops').doc(shopId).collection('days').where('date', '>=', from).where('date', '<=', to).get().then(function (qs) { var a = []; qs.forEach(function (d) { a.push(d.data()); }); return a; });
};

/* ---------- live updates from other computers (same app) ---------- */
function watchMeta() {
  metaRef.onSnapshot(function (m) {
    if (!m.exists || m.metadata.hasPendingWrites) return;
    var d = m.data(); if (d.session === SESSION || (d.rev || 0) <= C.rev) return;
    if (pushing || C.dirty) return;              /* our own push will hit the conflict check */
    readCloud().then(function (r) { if (r && r.rev > C.rev && !C.dirty && !pushing) applyRemote(r); });
  }, function (e) { console.warn('meta watch', e); });
}

/* ---------- shop <-> warehouse link ---------- */
var X;
function xref() { return X || (X = db.collection('exchange')); }
function stamp() { return firebase.firestore.FieldValue.serverTimestamp(); }
function clean(x) { return JSON.parse(JSON.stringify(x)); }
C.send = function (type, to, no, payload, extra) {
  payload = clean(payload);
  var doc = Object.assign({ type: type, from: APP, to: to, status: 'new', no: no, shop: payload.shop || '', shopId: APP === 'shop' ? C.shopId : '', payload: payload, at: stamp(), by: PD.user ? PD.user.name : '' }, extra || {});
  return xref().add(doc).catch(function (e) { console.warn('send', e); PD.toast && PD.toast('Could not reach the ' + to + ' (' + (e.message || e) + '). It will be sent when you are online.', 'err'); outbox(doc); });
};
/* items that could not be sent are kept in the DB and retried */
function outbox(doc) { var D = PD.DB; D.outbox = D.outbox || []; doc.at = null; D.outbox.push(doc); PD.save(); }
function flushOutbox() {
  var D = PD.DB; if (!D || !D.outbox || !D.outbox.length) return;
  var list = D.outbox.slice(); D.outbox = []; PD.save();
  list.forEach(function (doc) { doc.at = stamp(); if (APP === 'shop' && !doc.shopId) doc.shopId = C.shopId; xref().add(doc).catch(function () { outbox(doc); }); });
}
/* take one incoming doc: claim it in a transaction so two computers never import it twice */
function take(snap, fn) {
  var ref = snap.ref;
  db.runTransaction(function (tx) { return tx.get(ref).then(function (d) { if (!d.exists || d.data().status !== 'new') throw new Error('taken'); tx.update(ref, { status: 'taking', takenBy: SESSION }); }); })
    .then(function () {
      var msg = '';
      try { msg = fn(snap.data()) || ''; return ref.update({ status: 'done', doneAt: stamp(), result: msg }); }
      catch (e) { console.warn('import', e); return ref.update({ status: 'error', error: String(e.message || e), doneAt: stamp() }); }
    }).catch(function (e) { if (String(e.message) !== 'taken') console.warn('take', e); });
}
function listen(q, fn) { q.onSnapshot(function (qs) { qs.docChanges().forEach(function (ch) { if (ch.type !== 'removed') fn(ch.doc); }); }, function (e) { console.warn('listen', e); }); }
function refresh() { if (PD.onRemote) try { PD.onRemote(); } catch (e) { console.error(e); } }

function shopLink() {
  var svc = PD.svc;
  /* outgoing: request + return */
  var nr = svc.newRequest; svc.newRequest = function (o) {
    var r = nr.apply(this, arguments), D = PD.DB;
    C.send('request', 'warehouse', r.no, { type: 'request', shop: D.shop.name, shopId: C.shopId, no: r.no, date: r.date, note: r.note, by: r.by, lines: r.lines.map(function (l) {
      var it = svc.item(l.itemId), per = it && it.punit === 'Strip' && it.conv > 1 ? it.conv : 1;
      return l.unit === 'sale' && per > 1 ? { name: it.name, qty: Math.ceil(l.qty / per), unit: 'purchase', tabs: l.qty } : { name: svc.itemName(l.itemId), qty: l.qty, unit: 'purchase' };
    }) });
    return r;
  };
  var cr = svc.cancelRequest; svc.cancelRequest = function (id) {
    var r = PD.DB.requests.find(function (x) { return x.id === id; }); cr.apply(this, arguments);
    xref().where('shopId', '==', C.shopId).where('type', '==', 'request').where('no', '==', r.no).get().then(function (qs) { qs.forEach(function (d) { if (d.data().from === 'shop') d.ref.update({ cancelled: true, status: d.data().status === 'new' ? 'cancelled' : d.data().status }); }); });
  };
  var sr = svc.sendReturn; svc.sendReturn = function (o) {
    var rec = sr.apply(this, arguments);
    C.send('return', 'warehouse', rec.no, Object.assign(svc.returnFile(rec), { shopId: C.shopId }));
    return rec;
  };
  /* incoming: dispatches for this shop */
  listen(xref().where('shopId', '==', C.shopId).where('to', '==', 'shop').where('type', '==', 'dispatch').where('status', '==', 'new'), function (d) {
    take(d, function (x) { var nd = svc.importDispatch(x.payload); PD.toast && PD.toast('📦 Stock sent by the warehouse: ' + nd.no + '. Open Receive Stock (F4).', 'ok'); refresh(); return nd.no; });
  });
  /* warehouse rejected one of our requests */
  listen(xref().where('shopId', '==', C.shopId).where('from', '==', 'shop').where('type', '==', 'request').where('status', '==', 'rejected'), function (d) {
    var x = d.data(), D = PD.DB;
    var r = D.requests.find(function (q) { return q.no === x.no; }); if (!r || r.status !== 'Pending') return;
    r.status = 'Rejected'; r.decision = { by: 'Warehouse', date: PD.today(), note: x.reason || '' }; PD.save();
    PD.toast && PD.toast('Warehouse rejected request ' + r.no + (x.reason ? ': ' + x.reason : ''), 'err'); refresh();
  });
  /* medicine list published by the warehouse */
  xref().doc('catalog').onSnapshot(function (s) {
    if (!s.exists || !PD.DB) return; var c = s.data();
    if ((PD.DB.catalogRev || 0) >= (c.rev || 0)) return;
    try { svc.importItems(c.payload); PD.DB.catalogRev = c.rev; PD.save(); refresh(); } catch (e) { console.warn('catalog', e); }
  }, function (e) { console.warn('catalog watch', e); });
}

function warehouseLink() {
  var svc = PD.svc;
  var wd = svc.wDispatch; svc.wDispatch = function (reqId) {
    var d = wd.apply(this, arguments);
    var ws = svc.wShop(d.shopId) || {};
    C.send('dispatch', 'shop', d.no, svc.wDispatchFile(d), { shop: svc.wShopName(d.shopId), shopId: ws.regId || '' });
    return d;
  };
  var rj = svc.wRejectRequest; svc.wRejectRequest = function (id, reason) {
    var r = PD.DB.wreq.find(function (x) { return x.id === id; }); rj.apply(this, arguments);
    if (r && r.xid) xref().doc(r.xid).update({ status: 'rejected', reason: reason, doneAt: stamp() }).catch(function (e) { console.warn(e); });
  };
  /* incoming: requests and returns from shops */
  listen(xref().where('to', '==', 'warehouse').where('type', '==', 'request').where('status', '==', 'new'), function (d) {
    take(d, function (x) { var nr = svc.wImportRequest(Object.assign({}, x.payload, { shopId: x.shopId || x.payload.shopId || '' })); nr.xid = d.id; PD.save(); PD.toast && PD.toast('📨 New request ' + nr.extNo + ' from ' + svc.wShopName(nr.shopId), 'ok'); refresh(); return nr.no; });
  });
  listen(xref().where('to', '==', 'warehouse').where('type', '==', 'return').where('status', '==', 'new'), function (d) {
    take(d, function (x) { var nr = svc.wImportReturn(Object.assign({}, x.payload, { shopId: x.shopId || x.payload.shopId || '' })); PD.toast && PD.toast('↩ Return ' + nr.extNo + ' from ' + svc.wShopName(nr.shopId), 'ok'); refresh(); return nr.no; });
  });
  /* a shop cancelled a pending request */
  listen(xref().where('to', '==', 'warehouse').where('type', '==', 'request').where('cancelled', '==', true), function (d) {
    var x = d.data(), r = PD.DB.wreq.find(function (q) { return q.xid === d.id; });
    if (r && (r.status === 'Pending') && !r.picked.length) { r.status = 'Cancelled'; PD.save(); refresh(); }
  });
  /* publish the medicine list whenever items change */
  var lastCat = '';
  C.publishCatalog = function () {
    var f = clean(svc.wItemsFile()), s = JSON.stringify(f.items); if (s === lastCat) return; lastCat = s;
    try { xref().doc('catalog').set({ type: 'items', from: 'warehouse', to: 'shop', rev: Date.now(), payload: f, at: stamp() }).catch(function (e) { console.warn('catalog', e); lastCat = ''; }); }
    catch (e) { console.warn('catalog', e); lastCat = ''; }
  };
  var sm = svc.saveMaster; svc.saveMaster = function (coll) { var r = sm.apply(this, arguments); if (coll === 'items') setTimeout(C.publishCatalog, 300); return r; };
  setTimeout(C.publishCatalog, 1500);
  /* shops made on the Shops page -> the warehouse's own shop list; old link docs (sent before shop ids) get their shop id */
  C.syncShops = function () {
    return C.listShops().then(function (list) {
      if (svc.wLinkShops) svc.wLinkShops(list);
      return xref().where('to', '==', 'shop').where('status', '==', 'new').get().then(function (qs) {
        qs.forEach(function (d) { var x = d.data(); if (x.shopId) return; var s = list.find(function (y) { var n = String(x.shop || '').toLowerCase(); return String(y.name).toLowerCase() === n || String(y.oldName || '').toLowerCase() === n; }); if (s) d.ref.update({ shopId: s.id }).catch(function () {}); });
      });
    }).catch(function (e) { console.warn('shops', e); });
  };
  setTimeout(C.syncShops, 800);
}

/* called by the app once PD.DB is ready */
C.start = function () {
  if (started) return; started = true;
  watchMeta(); flushOutbox(); publishDays();
  if (APP === 'shop') shopLink(); else warehouseLink();
  if (!C.rev) push(); else if (!C.dirty) setState('ok');
};
})();
