/* Keyboard-first navigation for the whole app (same file in Medismart and Medismart Warehouse)
   Enter / Shift+Enter ........ next / previous field (last field of a dialog presses its main button)
   Arrow Down / Up ............ same column in the next / previous row of a table, else next / previous field
   Arrow Down / Up (no field) . move a highlight through clickable table rows, Enter opens it
   Ctrl+Left / Right .......... switch window tabs (already in the app)
   Esc ........................ close dialog (already in the app)
   Anything a field handles itself (item search, drop-downs, grids) is left alone. */
(function () {
'use strict';
var st = document.createElement('style');
st.textContent = 'tr.kb-row > td { background:#cfe3fb !important; box-shadow: inset 0 1px 0 #1e7fe0, inset 0 -1px 0 #1e7fe0; }';
document.head.appendChild(st);

var SKIP_TYPES = /^(hidden|file|button|submit|reset|image|checkbox|radio|range|color)$/;
function usable(el) {
  if (!el || el.disabled || el.readOnly || el.tabIndex === -1) return false;
  if (el.tagName === 'INPUT' && SKIP_TYPES.test(el.type)) return false;
  if (el.closest('.sres, datalist, [data-nokey]')) return false;
  return el.getClientRects().length > 0;
}
function scopeOf(el) {
  return el.closest('.ov') || el.closest('form') || el.closest('#view') || el.closest('main') || document.body;
}
function fields(scope) { return Array.prototype.filter.call(scope.querySelectorAll('input,select'), usable); }
function focusEl(el) { el.focus(); if (el.select && el.tagName === 'INPUT' && /^(text|number|search|tel|email|url|password)?$/.test(el.type)) { try { el.select(); } catch (e) {} } }
function isField(t) { return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT') && !SKIP_TYPES.test(t.type || '') ; }

function move(t, dir) {
  var sc = scopeOf(t), list = fields(sc), i = list.indexOf(t);
  if (i < 0) return false;
  var n = list[i + dir];
  if (n) { focusEl(n); return true; }
  return false;
}
function lastFieldAction(t, e) {
  var ov = t.closest('.ov'); if (!ov) return false;
  var b = ov.querySelector('.mf .btn.p'); if (!b) return false;
  e.preventDefault(); b.click(); return true;
}
function vertical(t, dir) {
  var td = t.closest('td'); if (!td || !td.parentElement) return false;
  var tr = td.parentElement, idx = td.cellIndex;
  for (var r = dir > 0 ? tr.nextElementSibling : tr.previousElementSibling; r; r = dir > 0 ? r.nextElementSibling : r.previousElementSibling) {
    var c = r.cells && r.cells[idx]; if (!c) continue;
    var f = Array.prototype.filter.call(c.querySelectorAll('input,select'), usable)[0];
    if (f) { focusEl(f); return true; }
  }
  return false;
}

/* highlighted row cursor for tables that open something when a row is clicked */
function rowsIn(sc) { return Array.prototype.filter.call(sc.querySelectorAll('tbody tr.click, tbody tr[data-bn], tbody tr[data-open]'), function (r) { return r.getClientRects().length > 0; }); }
function rowCursor(e) {
  var sc = document.querySelector('.ov:last-of-type') || document.querySelector('#view') || document.body, rows = rowsIn(sc);
  if (!rows.length) return false;
  var cur = rows.findIndex(function (r) { return r.classList.contains('kb-row'); });
  if (e.key === 'Enter') { if (cur < 0) return false; e.preventDefault(); rows[cur].click(); return true; }
  var n = e.key === 'ArrowDown' ? Math.min(rows.length - 1, cur + 1) : Math.max(0, cur < 0 ? 0 : cur - 1);
  rows.forEach(function (r) { r.classList.remove('kb-row'); }); rows[n].classList.add('kb-row'); rows[n].scrollIntoView({ block: 'nearest' }); e.preventDefault(); return true;
}

document.addEventListener('keydown', function (e) {
  if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  var t = e.target, k = e.key;
  if (k !== 'Enter' && k !== 'ArrowDown' && k !== 'ArrowUp') return;
  if (!isField(t)) {
    if (t === document.body || (t && t.closest && (t.closest('table') || t.closest('#view')) && t.tagName !== 'BUTTON' && t.tagName !== 'A' && t.tagName !== 'TEXTAREA')) { if (!(t.isContentEditable)) rowCursor(e); }
    return;
  }
  if (t.closest('[data-nokey]')) return;
  if (k === 'Enter') {
    if (move(t, e.shiftKey ? -1 : 1)) { e.preventDefault(); return; }
    if (!e.shiftKey) lastFieldAction(t, e);
    return;
  }
  /* arrows */
  if (t.tagName === 'SELECT' || t.getAttribute('list')) return;
  if (vertical(t, k === 'ArrowDown' ? 1 : -1)) { e.preventDefault(); return; }
  if (t.closest('td')) return;                       /* in a table but nothing above / below: leave it */
  if (move(t, k === 'ArrowDown' ? 1 : -1)) e.preventDefault();
});
})();
