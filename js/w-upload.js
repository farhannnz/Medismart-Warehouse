/* Medismart Warehouse - Purchase: upload a supplier bill in ANY format.
   Photo / PDF -> image editor (rotate, straighten, crop) -> read -> rows dialog
   Excel / CSV / text -> rows dialog
   Rows dialog: tick the rows to use, say which column is what, fix any cell, then fill the Purchase grid. */
(function () {
'use strict';
var PD = window.PD, esc = PD.esc, svc = PD.svc;

/* ---------- identify the file, whatever its name / type says ---------- */
function sniff(f) {
  return f.slice(0, 12).arrayBuffer().then(function (ab) {
    var b = new Uint8Array(ab), h = Array.prototype.map.call(b, function (x) { return String.fromCharCode(x); }).join(''), n = (f.name || '').toLowerCase();
    if (h.indexOf('%PDF') === 0) return 'pdf';
    if (b[0] === 0xFF && b[1] === 0xD8) return 'image';
    if (b[0] === 0x89 && h.indexOf('PNG') === 1) return 'image';
    if (h.indexOf('GIF8') === 0 || h.indexOf('BM') === 0 || (h.indexOf('RIFF') === 0 && h.indexOf('WEBP') === 8)) return 'image';
    if (b[0] === 0x50 && b[1] === 0x4B) return 'sheet';                         /* xlsx / xlsm / ods (zip) */
    if (b[0] === 0xD0 && b[1] === 0xCF) return 'sheet';                         /* old .xls */
    if (/^image\//.test(f.type) || /\.(jpe?g|png|webp|bmp|gif|heic|heif)$/.test(n)) return 'image';
    if (/\.pdf$/.test(n)) return 'pdf';
    return 'text';                                                              /* csv / tsv / txt */
  });
}
function loadScript(src, test) {
  if (test()) return Promise.resolve();
  return new Promise(function (ok, no) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = function () { no(new Error('Could not load a reader. Check the internet connection.')); }; document.head.appendChild(s); });
}
function pdfToCanvas(file) {
  var base = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  return loadScript(base + 'pdf.min.js', function () { return window.pdfjsLib; }).then(function () {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';
    return file.arrayBuffer();
  }).then(function (ab) { return window.pdfjsLib.getDocument({ data: ab }).promise; }).then(function (pdf) {
    var pages = [], seq = Promise.resolve(), n = Math.min(pdf.numPages, 4);
    for (var i = 1; i <= n; i++) (function (i) { seq = seq.then(function () { return pdf.getPage(i); }).then(function (pg) { var vp = pg.getViewport({ scale: 2 }), c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; return pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.then(function () { pages.push(c); }); }); })(i);
    return seq.then(function () {
      var w = Math.max.apply(null, pages.map(function (c) { return c.width; })), h = pages.reduce(function (a, c) { return a + c.height; }, 0), out = document.createElement('canvas'), x = out.getContext('2d'), y = 0;
      out.width = w; out.height = h; x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); pages.forEach(function (c) { x.drawImage(c, 0, y); y += c.height; });
      return out;
    });
  });
}
function fileToCanvas(file) {
  return new Promise(function (ok, no) {
    var img = new Image(), u = URL.createObjectURL(file);
    img.onload = function () {
      var sc = Math.min(1, 2600 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); ok(c);
    };
    img.onerror = function () { no(new Error('Could not open this picture. (iPhone HEIC photos: set the camera to "Most Compatible" or share it as JPG.)')); };
    img.src = u;
  });
}

/* ---------- image editor: rotate, straighten, crop ---------- */
function editImage(srcCanvas) {
  return new Promise(function (ok, no) {
    var base = srcCanvas, angle = 0, crop = null, drag = null, enhance = false, done = false;
    var m = PD.modal({ title: 'Fix the bill photo: rotate, straighten, crop', size: 'xl', sticky: true, body:
      '<div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:8px"><button class="btn sm" data-r="-1">⟲ Rotate left</button><button class="btn sm" data-r="1">⟳ Rotate right</button>' +
      '<label class="hint" style="display:flex;align-items:center;gap:6px">Straighten <input type="range" id="ang" min="-15" max="15" step="0.5" value="0" style="width:170px"> <b id="angv">0°</b></label>' +
      '<label class="hint" style="display:flex;align-items:center;gap:4px"><input type="checkbox" id="enh"> Sharpen text (black &amp; white)</label><button class="btn sm" id="rc">Clear crop</button><span class="sp"></span><span class="hint">Drag on the picture to select only the bill table.</span></div>' +
      '<div style="text-align:center;background:#222;padding:6px;border-radius:6px"><canvas id="cv" style="max-width:100%;touch-action:none;cursor:crosshair"></canvas></div>',
      onClose: function () { if (!done) no(new Error('cancelled')); },
      foot: [{ label: 'Cancel' }, { label: 'Use this picture', cls: 'p', fn: function () { done = true; output().toBlob(function (b) { m.close(); ok(b); }, 'image/jpeg', 0.92); return false; } }] });
    var cv = PD.$('#cv', m.el), cx = cv.getContext('2d'), dsc = 1;
    function rotated() { var c = document.createElement('canvas'); c.width = base.width; c.height = base.height; var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.translate(c.width / 2, c.height / 2); x.rotate(angle * Math.PI / 180); x.drawImage(base, -base.width / 2, -base.height / 2); return c; }
    function output() {
      var r = rotated(), c = r;
      if (crop && crop.w > 4 && crop.h > 4) { c = document.createElement('canvas'); c.width = Math.round(crop.w / dsc); c.height = Math.round(crop.h / dsc); c.getContext('2d').drawImage(r, crop.x / dsc, crop.y / dsc, crop.w / dsc, crop.h / dsc, 0, 0, c.width, c.height); }
      if (enhance) { var o = document.createElement('canvas'); o.width = c.width; o.height = c.height; var x = o.getContext('2d'); x.filter = 'grayscale(1) contrast(1.6) brightness(1.1)'; x.drawImage(c, 0, 0); c = o; }
      return c;
    }
    function draw() {
      var maxW = Math.min(1100, window.innerWidth - 90), maxH = Math.max(260, window.innerHeight - 260);
      dsc = Math.min(maxW / base.width, maxH / base.height, 1);
      cv.width = Math.round(base.width * dsc); cv.height = Math.round(base.height * dsc);
      cx.drawImage(rotated(), 0, 0, cv.width, cv.height);
      if (crop) { cx.fillStyle = 'rgba(0,0,0,.5)'; cx.fillRect(0, 0, cv.width, crop.y); cx.fillRect(0, crop.y + crop.h, cv.width, cv.height - crop.y - crop.h); cx.fillRect(0, crop.y, crop.x, crop.h); cx.fillRect(crop.x + crop.w, crop.y, cv.width - crop.x - crop.w, crop.h); cx.strokeStyle = '#19b394'; cx.lineWidth = 2; cx.strokeRect(crop.x, crop.y, crop.w, crop.h); }
    }
    function pt(e) { var r = cv.getBoundingClientRect(); return { x: Math.max(0, Math.min(cv.width, (e.clientX - r.left) * cv.width / r.width)), y: Math.max(0, Math.min(cv.height, (e.clientY - r.top) * cv.height / r.height)) }; }
    cv.addEventListener('pointerdown', function (e) { drag = pt(e); crop = null; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', function (e) { if (!drag) return; var p = pt(e); crop = { x: Math.min(drag.x, p.x), y: Math.min(drag.y, p.y), w: Math.abs(p.x - drag.x), h: Math.abs(p.y - drag.y) }; draw(); });
    cv.addEventListener('pointerup', function () { drag = null; if (crop && (crop.w < 8 || crop.h < 8)) { crop = null; draw(); } });
    PD.on(m.el, 'click', '[data-r]', function (e, t) {
      var d = +t.dataset.r, c = document.createElement('canvas'); c.width = base.height; c.height = base.width; var x = c.getContext('2d'); x.translate(c.width / 2, c.height / 2); x.rotate(d * Math.PI / 2); x.drawImage(base, -base.width / 2, -base.height / 2); base = c; crop = null; draw();
    });
    PD.$('#ang', m.el).oninput = function () { angle = +this.value; PD.$('#angv', m.el).textContent = angle + '°'; crop = null; draw(); };
    PD.$('#enh', m.el).onchange = function () { enhance = this.checked; };
    PD.$('#rc', m.el).onclick = function () { crop = null; draw(); };
    draw();
  });
}

/* ---------- rows dialog: pick rows, say what each column is ---------- */
var ROLES = [['', '— ignore —'], ['name', 'Medicine name'], ['qty', 'Qty'], ['free', 'Free'], ['batch', 'Batch'], ['exp', 'Expiry'], ['hsn', 'HSN'], ['mrp', 'MRP'], ['rate', 'Rate / strip'], ['disc', 'Disc %'], ['tax', 'GST %'], ['mfr', 'Manufacturer']];
var LABEL = { name: 'Product Name', qty: 'Qty', free: 'Free', batch: 'Batch', exp: 'Exp', hsn: 'HSN', mrp: 'MRP', rate: 'Rate', disc: 'Disc', tax: 'GST', mfr: 'Mfr' };
function pickRows(sheets, note, done) {
  var cur = 0, data, width, role, hi, on, MAX = 600;
  var m = PD.modal({ title: 'Choose rows and columns', size: 'xl', sticky: true, body: '<div id="rb"></div>', foot: [{ label: 'Cancel' }, { label: 'Fill Purchase', cls: 'p', fn: go }] });
  var rb = PD.$('#rb', m.el);
  function load(i) {
    cur = i; data = sheets[i].rows.map(function (r) { return (r || []).slice(); }); width = Math.max.apply(null, [1].concat(data.map(function (r) { return r.length; })));
    var g = svc.wGuessCols(data); hi = g.n > 0 ? g.hi : -1; role = []; for (var c = 0; c < width; c++) role[c] = '';
    Object.keys(g.map).forEach(function (k) { role[g.map[k]] = k; });
    on = data.map(function (r, ri) { return ri > hi && r.some(function (v) { return String(v == null ? '' : v).trim() !== ''; }); });
    draw();
  }
  function draw() {
    var h = '<p class="hint" style="margin-bottom:6px">' + esc(note || '') + ' <b>1)</b> Tick the rows you want. <b>2)</b> Under each column heading say what it is (Medicine name and Qty are a must). <b>3)</b> Fix any wrong cell by typing in it. Then press <b>Fill Purchase</b>.</p>';
    h += '<div class="row" style="gap:8px;margin-bottom:6px;flex-wrap:wrap">' + (sheets.length > 1 ? '<select class="in sm" id="sh" style="width:auto">' + sheets.map(function (s, i) { return '<option value="' + i + '"' + (i === cur ? ' selected' : '') + '>Sheet: ' + esc(s.name) + '</option>'; }).join('') + '</select>' : '') +
      '<button class="btn sm" id="sa">Tick all</button><button class="btn sm" id="sn">Untick all</button><label class="hint">Heading is row <input class="in sm" id="hr" type="number" min="0" value="' + (hi + 1) + '" style="width:60px"> (0 = no heading)</label><span class="sp"></span><span class="hint" id="cnt"></span></div>';
    h += '<div class="tw" style="max-height:56vh;overflow:auto"><table class="t"><thead><tr><th></th><th>#</th>';
    for (var c = 0; c < width; c++) h += '<th><select class="in sm" data-role="' + c + '">' + ROLES.map(function (r) { return '<option value="' + r[0] + '"' + (role[c] === r[0] ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('') + '</select></th>';
    h += '</tr></thead><tbody>';
    data.slice(0, MAX).forEach(function (r, ri) {
      h += '<tr' + (ri <= hi ? ' style="opacity:.55;background:#f2f2f2"' : '') + '><td><input type="checkbox" data-on="' + ri + '"' + (on[ri] ? ' checked' : '') + '></td><td>' + (ri + 1) + '</td>';
      for (var c = 0; c < width; c++) h += '<td><input class="in sm" data-c="' + ri + ',' + c + '" value="' + esc(r[c] == null ? '' : String(r[c])) + '" style="min-width:' + (role[c] === 'name' ? 190 : 70) + 'px"></td>';
      h += '</tr>';
    });
    h += '</tbody></table></div>' + (data.length > MAX ? '<p class="hint">Showing the first ' + MAX + ' rows only.</p>' : '');
    rb.innerHTML = h; count();
  }
  function count() { var n = 0; on.forEach(function (v, i) { if (v && i < MAX) n++; }); var e = PD.$('#cnt', rb); if (e) e.textContent = n + ' row(s) ticked'; }
  PD.on(m.el, 'change', '[data-role]', function (e, t) { role[+t.dataset.role] = t.value; });
  PD.on(m.el, 'change', '[data-on]', function (e, t) { on[+t.dataset.on] = t.checked; count(); });
  PD.on(m.el, 'input', '[data-c]', function (e, t) { var p = t.dataset.c.split(','); data[+p[0]][+p[1]] = t.value; });
  PD.on(m.el, 'change', '#sh', function (e, t) { load(+t.value); });
  PD.on(m.el, 'click', '#sa', function () { data.forEach(function (r, i) { on[i] = i > hi; }); draw(); });
  PD.on(m.el, 'click', '#sn', function () { on = on.map(function () { return false; }); draw(); });
  PD.on(m.el, 'change', '#hr', function (e, t) { hi = Math.max(-1, Math.min(data.length - 1, (+t.value || 0) - 1)); on = on.map(function (v, i) { return i > hi ? v : false; }); draw(); });
  function go() {
    var nameC = role.indexOf('name'), qtyC = role.indexOf('qty');
    if (nameC < 0 || qtyC < 0) { PD.err(new Error('Say which column is the Medicine name and which is Qty (the drop-downs above the columns).')); return false; }
    var rows = [role.map(function (r) { return r ? LABEL[r] : ''; })];
    data.forEach(function (r, i) { if (on[i]) { var o = []; for (var c = 0; c < width; c++) o.push(r[c] == null ? '' : r[c]); rows.push(o); } });
    if (rows.length < 2) { PD.err(new Error('Tick at least one row.')); return false; }
    try { done(svc.wParseBill(rows)); } catch (e) { PD.err(e); return false; }
  }
  load(0);
}

/* ---------- entry point ---------- */
PD.billUpload = function (cb) {
  var i = document.createElement('input'); i.type = 'file'; i.accept = '.csv,.tsv,.txt,.xls,.xlsx,.xlsm,.ods,.pdf,image/*';
  i.onchange = function () {
    var f = i.files[0]; if (!f) return;
    sniff(f).then(function (kind) {
      if (kind === 'sheet' || kind === 'text') {
        if (!window.XLSX) throw new Error('The Excel reader did not load. Check the internet connection and refresh the page.');
        return (kind === 'text' ? f.text().then(function (t) { return XLSX.read(t, { type: 'string', raw: true }); }) : f.arrayBuffer().then(function (ab) { return XLSX.read(ab, { type: 'array', cellDates: false }); })).then(function (wb) {
          var sheets = wb.SheetNames.map(function (n) { return { name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) }; }).filter(function (s) { return s.rows.length; });
          if (!sheets.length) throw new Error('This file is empty.');
          pickRows(sheets, 'File: ' + f.name + '.', function (res) { cb(res, { name: f.name }); });
        });
      }
      PD.toast(kind === 'pdf' ? 'Opening the PDF...' : 'Opening the photo...');
      return (kind === 'pdf' ? pdfToCanvas(f) : fileToCanvas(f)).then(editImage).then(function (blob) {
        PD.toast('Reading the bill... this takes about a minute');
        return svc.wReadBillPhoto(blob, function (m) { PD.toast(m); });
      }).then(function (rows) {
        pickRows([{ name: 'Bill', rows: rows }], rows.rawText ? 'The bill text was read, but not in a fixed layout, so match the columns yourself.' : 'Read from the picture. A photo can misread numbers, so check every cell against the bill.', function (res) { cb(res, { name: f.name, photo: true }); });
      });
    }).catch(function (e) { if (e && e.message === 'cancelled') return; PD.err(e); });
  };
  i.click();
};
})();
