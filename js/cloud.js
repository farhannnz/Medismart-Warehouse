/* Medismart cloud: Firebase login, Firestore storage and the live shop <-> warehouse link.
   Same file in both apps. window.MS_APP = 'shop' | 'warehouse' (set in index.html).

   Storage:  apps/{app}                 meta { rev, session, at, keys: { key: chunkCount } }
             apps/{app}/parts/{key}~{i} { d: '<json chunk>' }   (one top-level DB key, split so no doc passes 1 MB)
   Link:     exchange/{id}              { type, from, to, status, shop, no, payload, at }
             exchange/catalog           medicine list published by the warehouse
   The whole DB stays in memory as PD.DB (as before); PD.save() pushes only the keys that changed. */
(function () {
'use strict';
var PD = window.PD, APP = window.MS_APP || 'shop';
var EMAIL = { shop: 'shop@medismart.app', warehouse: 'warehouse@medismart.app' }[APP];
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
  metaRef = db.collection('apps').doc(APP);
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
    C.rev = base + 1; pushing = false; retryMs = 2000; cachePut();
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

/* ---------- login to Firebase (once per computer) ---------- */
function connectScreen() {
  return new Promise(function (res) {
    var name = APP === 'shop' ? 'Medismart' : 'Medismart Warehouse';
    document.body.className = '';
    document.body.innerHTML = '<div class="login"><div class="card box"><div class="brand" style="padding:0;color:var(--ink)"><span class="lg">' + PD.icon('pill') + '</span><b>' + name + '</b></div><h1>Connect this computer</h1><p class="mut">Enter the ' + (APP === 'shop' ? 'shop' : 'warehouse') + ' online password. You only do this once on each computer.</p><br>' +
      '<div class="fld"><label>Account</label><input class="in" value="' + EMAIL + '" readonly></div><div class="fld" style="margin-top:12px"><label>Online password</label><input class="in" id="cp" type="password" autocomplete="current-password" autofocus></div>' +
      '<p id="ce" style="color:var(--bad);min-height:20px;margin:8px 0 0"></p><button class="btn p lg" id="cb" style="width:100%;margin-top:6px">Connect</button>' +
      '<p class="hint" style="margin-top:14px">First time ever? Type a new password (6+ characters) and click <a href="#" id="cn">Create online account</a>.</p></div></div>';
    var $ = function (s) { return document.querySelector(s); };
    function err(e) {
      var c = e && e.code || '';
      $('#ce').textContent = c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found' ? 'Wrong password (or the online account is not created yet).' :
        c === 'auth/email-already-in-use' ? 'The online account already exists. Enter its password and click Connect.' :
        c === 'auth/weak-password' ? 'Use at least 6 characters.' :
        c === 'auth/operation-not-allowed' || c === 'auth/configuration-not-found' ? 'Email/Password sign-in is not switched on in Firebase (Authentication → Sign-in method).' :
        c === 'auth/network-request-failed' ? 'No internet connection.' : (e && e.message) || 'Could not connect';
    }
    function go(create) {
      var p = $('#cp').value; if (!p) { $('#ce').textContent = 'Enter the password'; return; }
      $('#cb').disabled = true; $('#ce').textContent = '';
      (create ? auth.createUserWithEmailAndPassword(EMAIL, p) : auth.signInWithEmailAndPassword(EMAIL, p)).then(function (u) { res(u.user); }).catch(function (e) { $('#cb').disabled = false; err(e); });
    }
    $('#cb').onclick = function () { go(false); };
    $('#cp').addEventListener('keydown', function (e) { if (e.key === 'Enter') go(false); });
    $('#cn').onclick = function (e) { e.preventDefault(); go(true); };
  });
}
function waitAuth() {
  return new Promise(function (res) { var off = auth.onAuthStateChanged(function (u) { off(); res(u); }); });
}
function msgScreen(title, text, retry) {
  document.body.className = '';
  document.body.innerHTML = '<div class="login"><div class="card box"><h1>' + title + '</h1><p class="mut">' + text + '</p><br><button class="btn p lg" id="rt" style="width:100%">Try again</button></div></div>';
  document.getElementById('rt').onclick = retry || function () { location.reload(); };
}
C.signOut = function () { return auth.signOut().then(function () { location.reload(); }); };

/* PD.load: sign in, then read the DB from Firestore (falls back to the local copy when offline) */
PD.load = function () {
  try { fire(); } catch (e) { msgScreen('Cannot start', PD.esc(e.message)); return new Promise(function () {}); }
  return waitAuth().then(function (u) { return u || connectScreen(); }).then(function () {
    document.body.innerHTML = '<div class="login"><div class="card box"><p class="mut">Loading your data…</p></div></div>';
    return Promise.all([readCloud(), cacheGet()]);
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
    if (e && e.code === 'permission-denied') { msgScreen('No access', 'This online account is not allowed to open the ' + APP + ' data. Check the Firestore rules (see SETUP.md).', function () { C.signOut(); }); return new Promise(function () {}); }
    return cacheGet().then(function (cache) {
      if (cache && cache.db) { C.rev = cache.rev || 0; C.dirty = !!cache.dirty; setTimeout(function () { setState('offline'); }, 50); return cache.db; }
      msgScreen('No internet', 'Medismart needs the internet the first time it opens on this computer. Connect and try again.');
      return new Promise(function () {});
    });
  });
};

/* first ever start: name + admin password (replaces the old demo data) */
PD.firstRun = function (done) {
  var D = PD.DB, shop = APP === 'shop';
  document.body.className = '';
  document.body.innerHTML = '<div class="login"><div class="card box"><div class="brand" style="padding:0;color:var(--ink)"><span class="lg">' + PD.icon('pill') + '</span><b>' + (shop ? 'Medismart' : 'Medismart Warehouse') + '</b></div><h1>Set up</h1><p class="mut">One-time setup. You can change these later in Settings.</p><br>' +
    '<div class="fld"><label>' + (shop ? 'Shop name' : 'Warehouse name') + '</label><input class="in" id="fn" autofocus></div>' +
    '<div class="fld" style="margin-top:12px"><label>Admin username</label><input class="in" value="admin" readonly></div>' +
    '<div class="fld" style="margin-top:12px"><label>Admin password</label><input class="in" id="fp" type="password"></div>' +
    '<div class="fld" style="margin-top:12px"><label>Repeat password</label><input class="in" id="fp2" type="password"></div>' +
    '<p id="fe" style="color:var(--bad);min-height:20px;margin:8px 0 0"></p><button class="btn p lg" id="fb" style="width:100%;margin-top:6px">Start</button></div></div>';
  var $ = function (s) { return document.querySelector(s); };
  $('#fb').onclick = function () {
    var n = $('#fn').value.trim(), p = $('#fp').value;
    if (!n) { $('#fe').textContent = 'Enter the name'; return; }
    if (p.length < 4) { $('#fe').textContent = 'Password must be at least 4 characters'; return; }
    if (p !== $('#fp2').value) { $('#fe').textContent = 'Passwords do not match'; return; }
    D.shop.name = n; if (!shop) D.settings.whName = n;
    var a = D.users.find(function (u) { return u.username === 'admin'; }); if (a) { a.pass = PD.hash(p); a.name = 'Administrator'; }
    D.setupDone = PD.today(); PD.save(); done();
  };
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
  var doc =Object.assign({ type: type, from: APP, to: to, status: 'new', no: no, shop: payload.shop || '', payload: payload, at: stamp(), by: PD.user ? PD.user.name : '' }, extra || {});
  return xref().add(doc).catch(function (e) { console.warn('send', e); PD.toast && PD.toast('Could not reach the ' + to + ' (' + (e.message || e) + '). It will be sent when you are online.', 'err'); outbox(doc); });
};
/* items that could not be sent are kept in the DB and retried */
function outbox(doc) { var D = PD.DB; D.outbox = D.outbox || []; doc.at = null; D.outbox.push(doc); PD.save(); }
function flushOutbox() {
  var D = PD.DB; if (!D || !D.outbox || !D.outbox.length) return;
  var list = D.outbox.slice(); D.outbox = []; PD.save();
  list.forEach(function (doc) { doc.at = stamp(); xref().add(doc).catch(function () { outbox(doc); }); });
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
    C.send('request', 'warehouse', r.no, { type: 'request', shop: D.shop.name, no: r.no, date: r.date, note: r.note, by: r.by, lines: r.lines.map(function (l) {
      var it = svc.item(l.itemId), per = it && it.punit === 'Strip' && it.conv > 1 ? it.conv : 1;
      return l.unit === 'sale' && per > 1 ? { name: it.name, qty: Math.ceil(l.qty / per), unit: 'purchase', tabs: l.qty } : { name: svc.itemName(l.itemId), qty: l.qty, unit: 'purchase' };
    }) });
    return r;
  };
  var cr = svc.cancelRequest; svc.cancelRequest = function (id) {
    var r = PD.DB.requests.find(function (x) { return x.id === id; }); cr.apply(this, arguments);
    xref().where('type', '==', 'request').where('from', '==', 'shop').where('no', '==', r.no).get().then(function (qs) { qs.forEach(function (d) { if (d.data().shop === PD.DB.shop.name) d.ref.update({ cancelled: true, status: d.data().status === 'new' ? 'cancelled' : d.data().status }); }); });
  };
  var sr = svc.sendReturn; svc.sendReturn = function (o) {
    var rec = sr.apply(this, arguments);
    C.send('return', 'warehouse', rec.no, svc.returnFile(rec));
    return rec;
  };
  /* incoming: dispatches for this shop */
  listen(xref().where('to', '==', 'shop').where('type', '==', 'dispatch').where('status', '==', 'new'), function (d) {
    var x = d.data(); if (x.shop && x.shop.toLowerCase() !== String(PD.DB.shop.name).toLowerCase()) return;
    take(d, function (x) { var nd = svc.importDispatch(x.payload); PD.toast && PD.toast('📦 Stock sent by the warehouse: ' + nd.no + '. Open Receive Stock (F4).', 'ok'); refresh(); return nd.no; });
  });
  /* warehouse rejected one of our requests */
  listen(xref().where('from', '==', 'shop').where('type', '==', 'request').where('status', '==', 'rejected'), function (d) {
    var x = d.data(), D = PD.DB; if (x.shop && x.shop.toLowerCase() !== String(D.shop.name).toLowerCase()) return;
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
    C.send('dispatch', 'shop', d.no, svc.wDispatchFile(d), { shop: svc.wShopName(d.shopId) });
    return d;
  };
  var rj = svc.wRejectRequest; svc.wRejectRequest = function (id, reason) {
    var r = PD.DB.wreq.find(function (x) { return x.id === id; }); rj.apply(this, arguments);
    if (r && r.xid) xref().doc(r.xid).update({ status: 'rejected', reason: reason, doneAt: stamp() }).catch(function (e) { console.warn(e); });
  };
  /* incoming: requests and returns from shops */
  listen(xref().where('to', '==', 'warehouse').where('type', '==', 'request').where('status', '==', 'new'), function (d) {
    take(d, function (x) { var nr = svc.wImportRequest(x.payload); nr.xid = d.id; PD.save(); PD.toast && PD.toast('📨 New request ' + nr.extNo + ' from ' + svc.wShopName(nr.shopId), 'ok'); refresh(); return nr.no; });
  });
  listen(xref().where('to', '==', 'warehouse').where('type', '==', 'return').where('status', '==', 'new'), function (d) {
    take(d, function (x) { var nr = svc.wImportReturn(x.payload); PD.toast && PD.toast('↩ Return ' + nr.extNo + ' from ' + svc.wShopName(nr.shopId), 'ok'); refresh(); return nr.no; });
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
}

/* called by the app once PD.DB is ready */
C.start = function () {
  if (started) return; started = true;
  watchMeta(); flushOutbox();
  if (APP === 'shop') shopLink(); else warehouseLink();
  if (!C.rev) push(); else if (!C.dirty) setState('ok');
};
})();
