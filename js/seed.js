/* Demo data so the app is not empty on first run (can be wiped from Settings) */
(function () {
'use strict';
var PD = window.PD, svc = PD.svc;
function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

PD.seed = function () {
  var rand = rng(20261023), D = PD.DB;
  function pick(a) { return a[Math.floor(rand() * a.length)]; }
  function ri(a, b) { return a + Math.floor(rand() * (b - a + 1)); }
  var today = PD.today();
  function day(n) { return PD.addDays(today, n); }
  function expIn(months) { var d = new Date(); d.setMonth(d.getMonth() + months); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }

  D.shop = { name: 'Sunrise Pharmacy (demo)', address: '12, Main Market, Your City - 400001', phone: '+91 98765 43210', gstin: '27ABCDE1234F1Z5', dl: 'DL-20B/21B-12345', footer: 'Get well soon. Thank you for visiting!' };

  var M = {};
  ['Corvia Pharma', 'Nexora Labs', 'Medilink Healthcare', 'Sanvi Remedies', 'Ayura Herbals', 'Homeo Sanjeevani', 'VetCare Animal Health', 'Lifeline Surgicals', 'Zenith Drugs', 'Pharmacore Industries'].forEach(function (n) {
    var r = svc.saveMaster('mfrs', { name: n, city: '', active: true }); M[n] = r.id;
  });
  var raw = [
    ['Pyrocet 650', 'Paracetamol 650 mg', 'Allopathy', 'G', 'Corvia Pharma', 'Analgesic', 'A1', 5, 60, 30, 'Strip', 'Box', 10],
    ['Amoxiclav 625', 'Amoxicillin + Clavulanic acid', 'Allopathy', 'H', 'Nexora Labs', 'Antibiotic', 'A2', 12, 30, 224, 'Strip', 'Box', 10],
    ['Azithra 500', 'Azithromycin 500 mg', 'Allopathy', 'H', 'Nexora Labs', 'Antibiotic', 'A2', 12, 30, 119, 'Strip', 'Box', 10],
    ['Cetrizin 10', 'Cetirizine 10 mg', 'Allopathy', 'OTC', 'Corvia Pharma', 'Anti-allergic', 'A3', 12, 40, 28, 'Strip', 'Box', 10],
    ['Pantocid 40', 'Pantoprazole 40 mg', 'Allopathy', 'H', 'Medilink Healthcare', 'Gastro', 'B1', 12, 50, 155, 'Strip', 'Box', 10],
    ['Metformin 500 SR', 'Metformin 500 mg', 'Allopathy', 'H', 'Zenith Drugs', 'Anti-diabetic', 'B2', 12, 60, 42, 'Strip', 'Box', 10],
    ['Atorva 10', 'Atorvastatin 10 mg', 'Allopathy', 'H', 'Zenith Drugs', 'Cardio', 'B3', 12, 40, 118, 'Strip', 'Box', 10],
    ['Amlokind 5', 'Amlodipine 5 mg', 'Allopathy', 'H', 'Medilink Healthcare', 'Cardio', 'B3', 12, 50, 62, 'Strip', 'Box', 10],
    ['Losar 50', 'Losartan 50 mg', 'Allopathy', 'H', 'Zenith Drugs', 'Cardio', 'B3', 12, 40, 88, 'Strip', 'Box', 10],
    ['Omez 20', 'Omeprazole 20 mg', 'Allopathy', 'H', 'Pharmacore Industries', 'Gastro', 'B1', 12, 50, 60, 'Strip', 'Box', 10],
    ['Ibugesic Plus', 'Ibuprofen + Paracetamol', 'Allopathy', 'H', 'Corvia Pharma', 'Analgesic', 'A1', 12, 50, 75, 'Strip', 'Box', 10],
    ['Cough-Ex Syrup 100 ml', 'Dextromethorphan', 'Allopathy', 'OTC', 'Sanvi Remedies', 'Cough & Cold', 'C1', 12, 20, 98, 'Bottle', 'Box', 12],
    ['ORS Plus Sachet', 'Oral rehydration salts', 'Allopathy', 'OTC', 'Sanvi Remedies', 'Hydration', 'C1', 12, 60, 21, 'Sachet', 'Box', 50],
    ['Vitamin D3 60K', 'Cholecalciferol 60000 IU', 'Allopathy', 'OTC', 'Pharmacore Industries', 'Supplement', 'C2', 12, 30, 145, 'Strip', 'Box', 4],
    ['Zincovit Plus', 'Multivitamin + minerals', 'Allopathy', 'OTC', 'Medilink Healthcare', 'Supplement', 'C2', 12, 40, 105, 'Strip', 'Box', 15],
    ['Alprazol 0.25', 'Alprazolam 0.25 mg', 'Allopathy', 'H1', 'Zenith Drugs', 'Psychiatry', 'D1', 12, 20, 36, 'Strip', 'Box', 10],
    ['Glarge Pen', 'Insulin glargine 100 IU/ml', 'Allopathy', 'H', 'Nexora Labs', 'Anti-diabetic', 'D2', 5, 10, 780, 'Pen', 'Box', 5],
    ['Povidex Ointment 15 g', 'Povidone iodine 5%', 'Allopathy', 'OTC', 'Sanvi Remedies', 'Antiseptic', 'C3', 12, 30, 85, 'Tube', 'Box', 10],
    ['Ashwagandha Tabs 60', 'Withania somnifera', 'Ayurvedic', 'OTC', 'Ayura Herbals', 'Immunity', 'E1', 12, 20, 210, 'Bottle', 'Box', 6],
    ['Triphala Churna 100 g', 'Triphala powder', 'Ayurvedic', 'OTC', 'Ayura Herbals', 'Digestive', 'E1', 12, 20, 95, 'Pack', 'Box', 12],
    ['Giloy Juice 500 ml', 'Tinospora cordifolia', 'Ayurvedic', 'OTC', 'Ayura Herbals', 'Immunity', 'E2', 12, 20, 180, 'Bottle', 'Box', 6],
    ['Chyavan Gold 500 g', 'Chyawanprash', 'Ayurvedic', 'OTC', 'Ayura Herbals', 'Immunity', 'E2', 12, 15, 245, 'Jar', 'Box', 6],
    ['Arnica Montana 30', 'Arnica montana 30 CH', 'Homoeopathy', 'OTC', 'Homeo Sanjeevani', 'Dilution', 'F1', 12, 20, 95, 'Bottle', 'Box', 10],
    ['Neem Mother Tincture 30 ml', 'Azadirachta indica Q', 'Homoeopathy', 'OTC', 'Homeo Sanjeevani', 'Tincture', 'F1', 12, 20, 130, 'Bottle', 'Box', 10],
    ['Vet Dewormer Tabs', 'Albendazole 300 mg (vet)', 'Veterinary', 'G', 'VetCare Animal Health', 'Dewormer', 'G1', 12, 15, 110, 'Strip', 'Box', 10],
    ['Vet Calcium Syrup 200 ml', 'Calcium + vitamin D3 (vet)', 'Veterinary', 'G', 'VetCare Animal Health', 'Supplement', 'G1', 12, 15, 180, 'Bottle', 'Box', 6],
    ['Digital Thermometer', 'Clinical thermometer', 'Other', '', 'Lifeline Surgicals', 'Device', 'H1', 18, 8, 210, 'Piece', 'Box', 10],
    ['Surgical Mask (pack of 50)', 'Disposable 3-ply mask', 'Other', '', 'Lifeline Surgicals', 'Consumable', 'H2', 5, 10, 150, 'Pack', 'Box', 10]
  ];
  var items = raw.map(function (r) {
    return svc.saveMaster('items', { name: r[0], generic: r[1], cat: r[2], schedule: r[3], mfrId: M[r[4]], division: r[5], rack: r[6], tax: r[7], reorder: r[8], mrp: r[9], unit: r[10], punit: r[11], conv: r[12], margin: 22, batch: true, hsn: '3004', active: true });
  });

  var S = {};
  [['Shree Ganesh Distributors', ['Corvia Pharma', 'Nexora Labs', 'Sanvi Remedies']], ['Balaji Pharma Agencies', ['Medilink Healthcare', 'Zenith Drugs', 'Pharmacore Industries']],
   ['City Medical Traders', ['Corvia Pharma', 'Zenith Drugs', 'Nexora Labs']], ['Nirmal Ayurved Supply', ['Ayura Herbals', 'Homeo Sanjeevani']], ['Vet & Surgical Hub', ['VetCare Animal Health', 'Lifeline Surgicals']]].forEach(function (s) {
    var r = svc.saveMaster('suppliers', { name: s[0], phone: '9' + ri(100000000, 999999999), gstin: '', dl: '', city: '', terms: 'Credit 30 days', links: { mfrs: s[1].map(function (n) { return M[n]; }), items: [] }, active: true }); S[s[0]] = r;
  });
  var customers = ['Rakesh Sharma', 'Sunita Verma', 'Anil Kumar', 'Meena Devi', 'Harpreet Singh', 'Pooja Gupta'].map(function (n, i) { return svc.saveMaster('customers', { name: n, phone: '98' + ri(10000000, 99999999), type: i < 2 ? 'Special' : 'Regular', address: '', limit: 5000, active: true }); });
  ['Dr. A. Mehta', 'Dr. S. Kaur', 'Dr. R. Bansal'].forEach(function (n, i) { svc.saveMaster('doctors', { name: n, regNo: 'MC-' + (4500 + i * 37), phone: '' }); });

  var sup = Object.keys(S).map(function (k) { return S[k]; });
  function supplierFor(it) { return sup.find(function (s) { return s.links.mfrs.indexOf(it.mfrId) >= 0; }) || sup[0]; }

  /* opening stock 60 days back */
  var open = items.map(function (it, i) {
    var near = i % 9 === 4;
    return { itemId: it.id, batchNo: 'OP' + (100 + i), expiry: i === 15 ? expIn(-1) : (near ? expIn(ri(1, 3)) : expIn(ri(6, 26))), qty: ri(40, 140), mrp: it.mrp, rate: PD.r2(it.mrp * 0.68) };
  });
  svc.addOpening(open, day(-60));

  /* purchases */
  for (var p = 0; p < 7; p++) {
    var sp = pick(sup), pool = items.filter(function (it) { return supplierFor(it) === sp || rand() < 0.15; });
    if (pool.length < 3) pool = items.slice(0, 8);
    var lines = []; var used = {};
    for (var k = 0; k < ri(5, 9); k++) {
      var it = pick(pool); if (used[it.id]) continue; used[it.id] = 1;
      var q = ri(2, 8), free = rand() < 0.3 ? ri(1, 2) : 0;
      lines.push({ itemId: it.id, batchNo: 'B' + ri(1000, 9999), expiry: expIn(ri(8, 30)), qty: q, unit: 'purchase', free: free, rate: PD.r2(it.mrp * 0.68 * it.conv), mrp: it.mrp, disc: pick([0, 0, 5, 10]), tax: it.tax });
    }
    svc.postPurchase({ supplierId: sp.id, invNo: 'INV-' + ri(2000, 9000), date: day(-ri(4, 42)), payMode: rand() < 0.3 ? 'cash' : 'credit', lines: lines });
  }

  /* sales over the last 30 days */
  var payModes = ['cash', 'cash', 'cash', 'upi', 'upi', 'card'];
  for (var d = -30; d <= 0; d++) {
    var n = ri(3, 8);
    for (var b = 0; b < n; b++) {
      var ls = [], seen = {};
      for (var j = 0; j < ri(1, 4); j++) {
        var item = pick(items); if (seen[item.id]) continue;
        var bt = svc.batchesOf(item.id, true)[0]; if (!bt) continue; seen[item.id] = 1;
        ls.push({ itemId: item.id, batchId: bt.id, qty: Math.min(ri(1, 4), Math.floor(bt.qty)), rate: bt.mrp, disc: rand() < 0.2 ? 5 : 0 });
      }
      ls = ls.filter(function (l) { return l.qty > 0; });
      if (!ls.length) continue;
      var credit = rand() < 0.12, cus = credit || rand() < 0.3 ? pick(customers) : null;
      try {
        svc.postSale({ date: day(d), customerId: cus ? cus.id : '', doctor: rand() < 0.25 ? 'Dr. A. Mehta' : '', payMode: credit ? 'credit' : pick(payModes), received: credit ? ri(0, 1) * 100 : 0, lines: ls });
      } catch (e) { /* skip lines that cannot be billed */ }
    }
  }

  /* expiry / damage / claims */
  var exp = D.batches.filter(function (b) { return b.qty > 0 && b.expiry && PD.daysToExp(b.expiry) < 0; }).slice(0, 2);
  exp.forEach(function (b) { svc.moveToDamage({ batchId: b.id, qty: Math.min(b.qty, 12), reason: 'Expired', supplierId: supplierFor(svc.item(b.itemId)).id, date: day(-3) }); });
  var near = D.batches.filter(function (b) { return b.qty > 5; })[3];
  if (near) svc.moveToDamage({ batchId: near.id, qty: 3, reason: 'Damaged', supplierId: supplierFor(svc.item(near.itemId)).id, date: day(-2), note: 'Broken strips' });

  /* manufacturer offers */
  var t0 = day(-20), t1 = day(25);
  svc.saveMaster('offers', { mfrId: M['Corvia Pharma'], itemId: '', desc: 'Buy 10 get 1 free on all Corvia products', buyQty: 100, freeQty: 10, from: t0, to: t1 });
  svc.saveMaster('offers', { mfrId: M['Zenith Drugs'], itemId: items[5].id, desc: 'Metformin scheme', buyQty: 50, freeQty: 5, from: t0, to: t1 });

  D.demo = true;
  PD.save();
};
})();
