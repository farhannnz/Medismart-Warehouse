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
var ROLES = [['', '— ignore —'], ['name', 'Medicine name'], ['qty', 'Qty'], ['free', 'Free'], ['batch', 'Batch'], ['exp', 'Expiry'], ['hsn', 'HSN'], ['mrp', 'MRP'], ['rate', 'Rate / strip'], ['disc', 'Disc %'], ['tax', 'GST %'], ['mfr', 'Manufacturer'], ['rack', 'Shelf']];
var LABEL = { name: 'Product Name', qty: 'Qty', free: 'Free', batch: 'Batch', exp: 'Exp', hsn: 'HSN', mrp: 'MRP', rate: 'Rate', disc: 'Disc', tax: 'GST', mfr: 'Mfr', rack: 'Shelf' };
function pickRows(sheets, note, done) {
  var cur = 0, data, width, role, hi, on, MAX = 600, defShelf = '';
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
      '<button class="btn sm" id="sa">Tick all</button><button class="btn sm" id="sn">Untick all</button><label class="hint">Heading is row <input class="in sm" id="hr" type="number" min="0" value="' + (hi + 1) + '" style="width:60px"> (0 = no heading)</label><label class="hint">Shelf for rows with none <input class="in sm" id="dsh" value="' + esc(defShelf) + '" placeholder="e.g. A1" style="width:80px"></label><span class="sp"></span><span class="hint" id="cnt"></span></div>';
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
  PD.on(m.el, 'input', '#dsh', function (e, t) { defShelf = t.value; });
  PD.on(m.el, 'click', '#sa', function () { data.forEach(function (r, i) { on[i] = i > hi; }); draw(); });
  PD.on(m.el, 'click', '#sn', function () { on = on.map(function () { return false; }); draw(); });
  PD.on(m.el, 'change', '#hr', function (e, t) { hi = Math.max(-1, Math.min(data.length - 1, (+t.value || 0) - 1)); on = on.map(function (v, i) { return i > hi ? v : false; }); draw(); });
  function go() {
    var nameC = role.indexOf('name'), qtyC = role.indexOf('qty');
    if (nameC < 0 || qtyC < 0) { bigErr(new Error('Say which column is the Medicine name and which is Qty (the drop-downs above the columns).')); return false; }
    var rows = [role.map(function (r) { return r ? LABEL[r] : ''; })];
    data.forEach(function (r, i) { if (on[i]) { var o = []; for (var c = 0; c < width; c++) o.push(r[c] == null ? '' : r[c]); rows.push(o); } });
    if (rows.length < 2) { bigErr(new Error('Tick at least one row.')); return false; }
    try { var res = svc.wParseBill(rows); if (defShelf.trim()) res.lines.forEach(function (l) { if (!l.rack) l.rack = defShelf.trim(); }); done(res); } catch (e) { bigErr(e); return false; }
  }
  load(0);
}

/* ---------- free AI reader (Google Gemini, free key from aistudio.google.com) ---------- */
var KEYN = 'wh_gemini_key', MODEL = 'gemini-2.5-flash';
var HEAD = ['Product Name', 'Qty', 'Free', 'Batch', 'Exp', 'HSN', 'MRP', 'Rate', 'Disc', 'GST', 'Mfr', 'Shelf'];
var PROMPT = 'This is a medicine purchase bill / invoice from a supplier in India (it may be a photo, a PDF, or spreadsheet text, in any layout, possibly rotated). Extract EVERY medicine line item. Return ONLY a JSON array. Each element: {"name":string,"qty":number,"free":number,"batch":string,"exp":string,"hsn":string,"mrp":number,"rate":number,"disc":number,"gst":number,"amount":number,"mfr":string,"shelf":string}. ' +
  'ROW ALIGNMENT IS CRITICAL: read each printed line completely, left to right, and keep every value of that line together. Never mix the name, batch, qty, rate or amount of one line with another line. Count the printed lines first and return exactly that many elements, in the same order, even if two lines have the same name. amount = the line amount printed on the bill for that line (0 if none). A line is right only if amount is about qty x rate (the discount and GST may change it a little). ' +
  'qty = number of strips/packs billed (not the free ones). free = free / bonus quantity. exp = expiry as MM/YYYY. rate = purchase rate per strip before discount and GST (PTR/PTS). mrp = MRP per strip. disc = discount %. gst = GST % (if CGST and SGST are separate, add them). mfr = manufacturer/company if printed. shelf = rack/shelf only if printed, else "". ' +
  'Use "" for text and 0 for numbers that are not on the bill. Keep medicine names exactly as printed. Do NOT include totals, headers, tax summary or address rows.';
/* key typed in the box (this browser only). Empty = use the server (/api/bill-ai, key in Vercel env GEMINI_API_KEY) */
function getKey() { try { return localStorage.getItem(KEYN) || ''; } catch (e) { return ''; } }
function setKey(k) { try { if (k) localStorage.setItem(KEYN, k); else localStorage.removeItem(KEYN); } catch (e) {} }
/* returns the key, '' = use the old reader, null = cancelled */
function askKey() {
  return new Promise(function (ok) {
    var settled = false; function fin(v) { settled = true; ok(v); }
    var m = PD.modal({ title: 'Free AI bill reader (one-time set-up)', size: 'md', sticky: true,
      body: '<p>Any photo, PDF, Excel or CSV bill can be read properly by a free AI (Google Gemini). One-time set-up, about 1 minute:</p><ol style="margin:6px 0 10px 18px"><li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener"><b>aistudio.google.com/apikey</b></a> and sign in with Google.</li><li>Press <b>Create API key</b>, copy it.</li><li>Paste it below. It is kept only in this browser.</li></ol><div class="fld"><label>Gemini API key</label><input class="in" id="gk" placeholder="AIza..." autocomplete="off"></div><p class="hint">The bill picture/text is sent to Google for reading. Free plan has a daily limit. No key? Use the old reader (works only for one fixed bill layout).</p>',
      onClose: function () { if (!settled) fin(null); },
      foot: [{ label: 'Cancel' }, { label: 'Use old reader', fn: function () { fin(''); m.close(); return false; } },
        { label: 'Save & continue', cls: 'p', fn: function () { var v = PD.$('#gk', m.el).value.trim(); if (v.length < 20) { PD.toast('Paste the full key', 'err'); return false; } setKey(v); fin(v); m.close(); return false; } }] });
  });
}
function b64(blob) { return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(',')[1]); }; r.onerror = function () { no(new Error('Could not read the file')); }; r.readAsDataURL(blob); }); }
function aiCall(key, parts) {
  return fetch(key ? 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent?key=' + encodeURIComponent(key) : '/api/bill-ai', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } }) })
    .catch(function () { throw new Error('No internet. The AI reader needs internet.'); })
    .then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          if (!key && (r.status === 404 || r.status === 501 || r.status === 405)) { var ns = new Error('The AI reader is not set up on the server (/api/bill-ai answered ' + r.status + '). Add GEMINI_API_KEY in Vercel and redeploy.'); ns.noserver = true; throw ns; }
          var msg = (j && j.error && j.error.message) || ('Error ' + r.status);
          if (!key && r.status === 403) throw new Error('The server AI key is not valid. Check GEMINI_API_KEY in Vercel.');
          if (r.status === 400 && /api key/i.test(msg) || r.status === 403) { setKey(''); throw new Error('The AI key is not valid. It was removed, upload again to enter a new key.'); }
          if (r.status === 429) throw new Error('Free AI limit reached for now. Wait a minute (or try tomorrow).');
          throw new Error('AI reader: ' + msg);
        }
        var c = j.candidates && j.candidates[0], t = c && c.content && c.content.parts ? c.content.parts.map(function (p) { return p.text || ''; }).join('') : '';
        if (!t) throw new Error('The AI sent nothing back. Try a clearer picture.');
        return parseAI(t);
      });
    });
}
function parseAI(txt) {
  txt = String(txt || '').replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  var a; try { a = JSON.parse(txt); } catch (e) { throw new Error('The AI answer could not be understood. Try again.'); }
  if (!Array.isArray(a)) { var k = Object.keys(a || {}).filter(function (x) { return Array.isArray(a[x]); })[0]; a = k ? a[k] : []; }
  var rows = [HEAD.slice()], bad = [];
  a.forEach(function (o) {
    if (!(o && String(o.name || '').trim())) return;
    rows.push([o.name, o.qty, o.free, o.batch, o.exp, o.hsn, o.mrp, o.rate, o.disc, o.gst, o.mfr, o.shelf].map(function (v) { return v == null ? '' : v; }));
    /* self-check: the printed line amount must be about qty x rate (with or without discount / GST) */
    var q = +o.qty || 0, r = +o.rate || 0, am = +o.amount || 0, d = +o.disc || 0, g = +o.gst || 0;
    if (am > 0 && q > 0 && r > 0) {
      var cands = [q * r, q * r * (1 - d / 100), q * r * (1 + g / 100), q * r * (1 - d / 100) * (1 + g / 100)];
      if (!cands.some(function (c) { return Math.abs(c - am) <= Math.max(1.5, am * 0.01); })) bad.push(String(o.name).trim() + ' (qty ' + q + ' x rate ' + r + ' is not ' + am + ')');
    }
  });
  if (rows.length < 2) throw new Error('The AI could not find any medicine lines in this file.');
  rows.bad = bad;
  return rows;
}
/* reads the bill; if some lines fail the qty x rate = amount check, asks the AI once more with those lines named */
function aiCheck(key, parts) {
  return aiCall(key, parts).then(function (rows) {
    if (!rows.bad.length) return rows;
    var fix = { text: 'Your previous answer mixed up values between lines. These lines failed the check amount = qty x rate: ' + rows.bad.join('; ') + '. Read the bill again line by line, keep each line\'s name, batch, qty, rate and amount together, and return the full corrected JSON array.' };
    return aiCall(key, parts.concat([fix])).then(function (r2) { return r2.bad.length <= rows.bad.length ? r2 : rows; }, function () { return rows; });
  });
}
function aiFile(key, f, kind) {
  var prep = kind === 'pdf' ? Promise.resolve({ blob: f, mime: 'application/pdf' })
    : fileToCanvas(f).then(function (c) { return new Promise(function (ok) { c.toBlob(function (b) { ok({ blob: b, mime: 'image/jpeg' }); }, 'image/jpeg', 0.8); }); })
      .catch(function () { var mt = f.type || (/\.hei[cf]$/i.test(f.name) ? 'image/heic' : ''); if (!mt) throw new Error('Could not open this picture.'); return { blob: f, mime: mt }; });
  return prep.then(function (p) {
    var lim = key ? 18 : 3;   /* MB: Vercel functions accept about 4.5 MB per request */
    if (p.blob.size > lim * 1024 * 1024) throw new Error('This file is too big for the AI reader (limit ' + lim + ' MB). Send fewer pages or a smaller photo.');
    return b64(p.blob).then(function (d) { return aiCheck(key, [{ text: PROMPT }, { inline_data: { mime_type: p.mime, data: d } }]); });
  });
}
function aiSheet(key, sheets) {
  var txt = sheets.map(function (s) { return '[Sheet ' + s.name + ']\n' + s.rows.slice(0, 500).map(function (r) { return (r || []).join('\t'); }).join('\n'); }).join('\n\n').slice(0, 60000);
  return aiCheck(key, [{ text: PROMPT }, { text: 'Bill data:\n' + txt }]);
}

/* ---------- loader + errors that stay on screen until closed ---------- */
var spinCss = false;
function busyModal(msg) {
  if (!spinCss) { spinCss = true; var s = document.createElement('style'); s.textContent = '@keyframes whspin{to{transform:rotate(360deg)}}'; document.head.appendChild(s); }
  var m = PD.modal({ title: 'Please wait', size: 'sm', sticky: true, noFocus: true, body: '<div style="display:flex;align-items:center;gap:14px;padding:6px 0"><div style="width:34px;height:34px;border:4px solid #d8e6e2;border-top-color:#19b394;border-radius:50%;animation:whspin .8s linear infinite;flex:none"></div><div id="bmsg" style="font-size:15px">' + esc(msg) + '</div></div>' });
  return { set: function (t) { var e = PD.$('#bmsg', m.el); if (e) e.textContent = t; }, close: function () { if (m.el.parentNode) m.close(); } };
}
/* shows the problem in a box that stays; resolves true if the user pressed the extra button */
function showErrModal(msg, extraLabel) {
  return new Promise(function (ok) {
    var done = false; function fin(v) { if (!done) { done = true; ok(v); } }
    PD.modal({ title: 'Problem', size: 'sm', sticky: true, noFocus: true, body: '<p style="color:#c62828;font-size:15px;white-space:pre-wrap">' + esc(msg) + '</p>', onClose: function () { fin(false); },
      foot: extraLabel ? [{ label: 'Cancel' }, { label: extraLabel, cls: 'p', fn: function () { fin(true); } }] : [{ label: 'OK', cls: 'p' }] });
  });
}
/* the upload box (hub) stays open: loader, errors and retry all happen inside it */
var hub = null;
function hubSt(html) { var e = hub && PD.$('#hst', hub.el); if (e) e.innerHTML = html; }
function closeHub() { if (hub) { var h = hub; hub = null; h.close(); } }
function openRows(a, b, c) { closeHub(); pickRows(a, b, c); }
function busy(msg) {
  if (!hub) return busyModal(msg);
  if (!spinCss) { spinCss = true; var s = document.createElement('style'); s.textContent = '@keyframes whspin{to{transform:rotate(360deg)}}'; document.head.appendChild(s); }
  hubSt('<div style="display:flex;align-items:center;gap:14px;padding:8px 2px"><div style="width:34px;height:34px;border:4px solid #d8e6e2;border-top-color:#19b394;border-radius:50%;animation:whspin .8s linear infinite;flex:none"></div><div id="bmsg" style="font-size:15px">' + esc(msg) + '</div></div>');
  return { set: function (t) { var e = hub && PD.$('#bmsg', hub.el); if (e) e.textContent = t; }, close: function () { hubSt(''); } };
}
function showErr(msg, extraLabel) {
  if (!hub) return showErrModal(msg, extraLabel);
  return new Promise(function (ok) {
    hubSt('<div style="border:1px solid #e0a0a0;background:#fdecec;border-radius:8px;padding:10px 12px"><div style="color:#c62828;white-space:pre-wrap;font-size:14px">' + esc(msg) + '</div><div style="margin-top:10px;display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="e0">' + (extraLabel ? 'Cancel' : 'OK') + '</button>' + (extraLabel ? '<button class="btn p" id="e1">' + esc(extraLabel) + '</button>' : '') + '</div></div>');
    var b0 = PD.$('#e0', hub.el), b1 = PD.$('#e1', hub.el);
    b0.onclick = function () { hubSt(''); ok(false); }; if (b1) b1.onclick = function () { hubSt(''); ok(true); };
  });
}
function bigErr(e) { return showErr(e && e.message ? e.message : String(e)); }

/* ---------- entry point ---------- */
PD.billUpload = function (cb) {
  if (hub) return;
  hub = PD.modal({ title: 'Upload supplier bill', size: 'md', sticky: true, noFocus: true, onClose: function () { hub = null; },
    body: '<div id="drop" style="border:2px dashed #19b394;border-radius:10px;padding:28px 14px;text-align:center;cursor:pointer"><div style="font-size:16px"><b>Choose the bill</b> or drop it here</div><div class="hint" style="margin-top:4px">Photo, PDF, Excel or CSV, any format</div><input type="file" id="hf" hidden accept=".csv,.tsv,.txt,.xls,.xlsx,.xlsm,.ods,.pdf,image/*,.heic,.heif"></div><div id="hst" style="margin-top:12px"></div>',
    foot: [{ label: 'Close' }] });
  var inp = PD.$('#hf', hub.el), drop = PD.$('#drop', hub.el);
  drop.onclick = function () { inp.click(); };
  inp.onclick = function (e) { e.stopPropagation(); };
  drop.ondragover = function (e) { e.preventDefault(); };
  drop.ondrop = function (e) { e.preventDefault(); if (e.dataTransfer.files[0]) run(e.dataTransfer.files[0]); };
  inp.onchange = function () { var f = inp.files[0]; inp.value = ''; if (f) run(f); };
  function run(f) {
    function finish(photo) { return function (res) { cb(res, photo ? { name: f.name, photo: true } : { name: f.name }); }; }
    function oldPhotoReader(kind) {
      PD.toast(kind === 'pdf' ? 'Opening the PDF...' : 'Opening the photo...');
      return (kind === 'pdf' ? pdfToCanvas(f) : fileToCanvas(f)).then(editImage).then(function (blob) {
        var ld = busy('Reading the bill... this takes about a minute');
        return svc.wReadBillPhoto(blob, function (m) { ld.set(m); }).then(function (r) { ld.close(); return r; }, function (e) { ld.close(); throw e; });
      }).then(function (rows) {
        openRows([{ name: 'Bill', rows: rows }], rows.rawText ? 'The bill text was read, but not in a fixed layout, so match the columns yourself.' : 'Read from the picture. A photo can misread numbers, so check every cell against the bill.', finish(true));
      });
    }
    sniff(f).then(function (kind) {
      if (kind === 'sheet' || kind === 'text') {
        if (!window.XLSX) throw new Error('The Excel reader did not load. Check the internet connection and refresh the page.');
        return (kind === 'text' ? f.text().then(function (t) { return XLSX.read(t, { type: 'string', raw: true }); }) : f.arrayBuffer().then(function (ab) { return XLSX.read(ab, { type: 'array', cellDates: false }); })).then(function (wb) {
          var sheets = wb.SheetNames.map(function (n) { return { name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) }; }).filter(function (s) { return s.rows.length; });
          if (!sheets.length) throw new Error('This file is empty.');
          var g = svc.wGuessCols(sheets[0].rows), clear = g.map.name != null && g.map.qty != null;
          if (!clear) {   /* messy / unusual sheet: let the AI arrange it */
            var ld = busy('Sheet layout is unusual, the AI is arranging it...');
            return aiSheet(getKey(), sheets).then(function (rows) { ld.close(); openRows([{ name: 'AI', rows: rows }], 'Arranged by the AI reader. Check every cell against the bill.', finish(false)); })
              .catch(function (e) { ld.close(); var p = e.noserver ? Promise.resolve() : showErr('AI reader failed:\n' + e.message + '\n\nThe sheet will open as it is, set the columns yourself.'); return p.then(function () { openRows(sheets, 'File: ' + f.name + '.', finish(false)); }); });
          }
          openRows(sheets, 'File: ' + f.name + '.', finish(false));
        });
      }
      function tryAI(k) {
        var ld = busy('The AI is reading the bill... about 20 seconds');
        return aiFile(k, f, kind).then(function (rows) {
          ld.close();
          var warn = rows.bad && rows.bad.length ? ' WARNING: ' + rows.bad.length + ' line(s) do not add up (qty x rate is not the printed amount), so names/qty/rate may be mixed between lines: ' + rows.bad.join('; ') + '. Compare with the bill before filling.' : '';
          openRows([{ name: 'Bill', rows: rows }], 'Read by the AI reader. It can still misread a number, so check every cell against the bill.' + warn, finish(true));
        }, function (e) {
          ld.close();
          if (e && (e.noserver || e.message === 'cancelled')) throw e;
          return showErr('AI reader failed:\n' + e.message, 'Use old reader').then(function (go) { if (!go) throw new Error('cancelled'); return oldPhotoReader(kind); });
        });
      }
      /* key from Vercel env (server) first; only if the server is not set up, ask for a personal key */
      return tryAI(getKey()).catch(function (e) {
        if (!(e && e.noserver)) throw e;
        return showErr(e.message + '\n\nYou can paste a personal key now, or use the old reader.', 'Continue').then(function (go) { if (!go) throw new Error('cancelled'); return askKey(); }).then(function (k) { if (k === null) throw new Error('cancelled'); return k ? tryAI(k) : oldPhotoReader(kind); });
      });
    }).catch(function (e) { if (e && e.message === 'cancelled') return; bigErr(e); });
  };
};
})();
