/* Krishna Jewellers — Customer & Stock Book
   Browser-only. All data stays on the phone (localStorage). */
'use strict';

const SHOP_NAME = 'Krishna Jewellers';
const SHOP_ADDR = 'Waghobanagar, Kalwa East, Thane — Near Parsik Tunnel';
const PK = 'jw2_products', RK = 'jw2_records', SK = 'jw2_settings';
const DEFAULT_PASSWORD = 'jewellery';
const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => { const x = parseFloat(v); return isNaN(x) ? 0 : x; };
const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const money = n => '₹' + Number(n || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const money0 = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const fmtDate = iso => new Date(iso).toLocaleString('en-IN', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'});
const fmtShort = iso => new Date(iso).toLocaleDateString('en-IN', {day:'2-digit', month:'short'});
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const digits = s => String(s || '').replace(/\D/g, '');

/* ---------- storage ---------- */
function load(k, d){ try { const v = JSON.parse(localStorage.getItem(k)); return v === null || v === undefined ? d : v; } catch(e){ return d; } }
function save(k, v){ localStorage.setItem(k, JSON.stringify(v)); }

/* records from the first version (single product, no stock) are converted */
function normalizeRecord(r){
  if (r && Array.isArray(r.items)) {
    r.phone = r.phone || '';
    r.payments = r.payments || (r.paid > 0 ? [{date: r.date, amount: r.paid}] : []);
    return r;
  }
  const amt = num(r.amount);
  return {
    id: r.id || uid(), receiptNo: r.receiptNo || 0, date: r.date, name: r.name, phone: '',
    items: [{pid: null, name: r.product || 'Item', qty: 1, weight: num(r.weight), rate: num(r.rate), amount: amt}],
    total: amt, paid: amt, payments: [{date: r.date, amount: amt}]
  };
}

let products = load(PK, []);
let records = load(RK, null);
let settings = Object.assign({password: DEFAULT_PASSWORD, phone: '', nextReceipt: 1, lastBackup: null}, load(SK, {}));
if (records === null) {
  const old = load('jw_records_v1', []);
  const oldSet = load('jw_settings_v1', {});
  records = old.map(normalizeRecord);
  if (oldSet.password) settings.password = oldSet.password;
  if (oldSet.nextReceipt) settings.nextReceipt = oldSet.nextReceipt;
  save(RK, records); save(SK, settings);
}
records = records.map(normalizeRecord);
const saveAll = () => { save(PK, products); save(RK, records); save(SK, settings); };

let currentId = null, receiptReturn = 'home', bookFilter = 'all', lines = [];

/* ---------- small UI helpers ---------- */
function toast(msg, ms){
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms || 2600);
}
function sparkle(x, y){
  if (reduced) return;
  for (let i = 0; i < 18; i++){
    const s = document.createElement('i'); s.className = 'spark';
    const a = Math.random() * 6.283, d = 40 + Math.random() * 70;
    s.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px`;
    document.body.appendChild(s); setTimeout(() => s.remove(), 900);
  }
}
function countUp(el, to, fmt){
  const from = Number(el.dataset.v || 0); el.dataset.v = to;
  if (reduced || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), dur = 700;
  (function step(t){
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}
function initial(n){ return (String(n).trim()[0] || '?').toUpperCase(); }
const balanceOf = r => r2(r.total - r.paid);
const status = p => p.stock <= 0 ? 'out' : (p.stock <= p.lowAt ? 'low' : 'ok');
const statusText = p => ({out: 'Out of stock', low: 'Low stock', ok: 'In stock'})[status(p)];

/* ---------- modal ---------- */
let modalOk = null;
function openModal(title, body, okLabel, onOk){
  $('#mTitle').textContent = title; $('#mBody').innerHTML = body;
  $('#mOk').textContent = okLabel || 'Save'; modalOk = onOk;
  $('#modal').hidden = false;
  const f = $('#mBody input'); if (f) setTimeout(() => f.focus(), 60);
}
function closeModal(){ $('#modal').hidden = true; modalOk = null; }

/* ---------- navigation ---------- */
function show(name){
  $$('main .screen').forEach(s => s.hidden = s.id !== name);
  const scr = $('#' + name); scr.classList.remove('enter'); void scr.offsetWidth; scr.classList.add('enter');
  const tabOf = {detail: 'book', receipt: receiptReturn === 'home' ? 'home' : 'book'}[name] || name;
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.go === tabOf));
  window.scrollTo(0, 0);
  renderWarn();
  if (name === 'home') renderHome();
  if (name === 'book') renderBook();
  if (name === 'stock') renderStock();
  if (name === 'add') renderSale();
  if (name === 'admin') renderAdmin();
}

/* ---------- login ---------- */
function login(){
  if ($('#pw').value === settings.password){
    sessionStorage.setItem('jw_in', '1'); $('#pw').value = ''; $('#loginErr').textContent = '';
    enter();
  } else $('#loginErr').textContent = 'Wrong password. Try again.';
}
function enter(){ $('#login').hidden = true; $('#app').hidden = false; show('home'); }
function logout(){ sessionStorage.removeItem('jw_in'); $('#app').hidden = true; $('#login').hidden = false; }

/* ---------- stock warning bar ---------- */
function renderWarn(){
  const bad = products.filter(p => status(p) !== 'ok').sort((a, b) => (status(a) === 'out' ? 0 : 1) - (status(b) === 'out' ? 0 : 1));
  const bar = $('#warnBar');
  $('#tabDot').hidden = !bad.length;
  if (!bad.length){ bar.hidden = true; return; }
  const out = bad.filter(p => p.stock <= 0).length;
  const names = bad.slice(0, 3).map(p => `${p.name} (${p.stock <= 0 ? 'khatam' : p.stock + ' left'})`).join(', ');
  const more = bad.length > 3 ? ` +${bad.length - 3} more` : '';
  bar.className = 'warnbar' + (out ? ' out' : '');
  bar.innerHTML = `${out ? 'Stock khatam' : 'Stock kam hai'}: <span>${esc(names)}${more}</span>`;
  bar.hidden = false;
}

/* ---------- home ---------- */
function itemHTML(r){
  const more = r.items.length > 1 ? ` +${r.items.length - 1} more` : '';
  const bal = balanceOf(r);
  return `<button class="item" data-id="${esc(r.id)}">
    <span class="avatar">${esc(initial(r.name))}</span>
    <span class="l"><b>${esc(r.name)}</b><small>${esc(r.items[0].name)}${more} · ${esc(fmtShort(r.date))}</small></span>
    <span class="r">${money0(r.total)}<em class="badge ${bal > 0 ? 'due' : 'paid'}">${bal > 0 ? 'Due ' + money0(bal) : 'Paid'}</em></span></button>`;
}
function bindItems(box){ box.querySelectorAll('.item').forEach(b => b.onclick = () => openDetail(b.dataset.id)); }

function renderHome(){
  $('#heroDate').textContent = new Date().toLocaleDateString('en-IN', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
  const today = new Date().toDateString();
  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
  countUp($('#stToday'), sum(records.filter(r => new Date(r.date).toDateString() === today), r => r.total), money0);
  countUp($('#stTotal'), sum(records, r => r.total), money0);
  countUp($('#stDue'), sum(records, r => balanceOf(r)), money0);
  countUp($('#stCount'), records.length, v => Math.round(v));
  countUp($('#stStock'), sum(products, p => p.stock), v => Math.round(v));

  const lastOk = settings.lastBackup && (Date.now() - new Date(settings.lastBackup)) < 7 * 864e5;
  $('#backupNudge').hidden = !(records.length && !lastOk);

  const bad = products.filter(p => status(p) !== 'ok');
  $('#homeLowWrap').hidden = !bad.length;
  $('#homeLow').innerHTML = bad.map(p => `<button class="item" data-pid="${esc(p.id)}">
    <span class="avatar">${esc(initial(p.name))}</span>
    <span class="l"><b>${esc(p.name)}</b><small>${p.stock <= 0 ? 'Stock khatam' : 'Only ' + p.stock + ' left'}</small></span>
    <span class="r"><em class="badge ${status(p)}">${statusText(p)}</em></span></button>`).join('');
  $$('#homeLow .item').forEach(b => b.onclick = () => show('stock'));

  const recent = records.slice().reverse().slice(0, 5);
  const box = $('#recent');
  box.innerHTML = recent.length ? recent.map(itemHTML).join('') : '<p class="empty">Abhi koi customer nahi. “New Sale” se shuru karo.</p>';
  bindItems(box);
}

/* ---------- stock ---------- */
function renderStock(){
  const q = $('#stockSearch').value.trim().toLowerCase();
  const rank = p => ({out: 0, low: 1, ok: 2})[status(p)];
  const list = products.filter(p => !q || p.name.toLowerCase().includes(q))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  const box = $('#stockList');
  if (!list.length){ box.innerHTML = `<p class="empty">${products.length ? 'No product found.' : 'Stock khali hai. “+ Add Product” dabao.'}</p>`; return; }
  box.innerHTML = list.map(p => {
    const st = status(p), pct = Math.max(p.stock > 0 ? 4 : 0, Math.min(100, p.stock / Math.max(p.lowAt * 4, 8) * 100));
    const extra = [p.weight ? p.weight + ' g/pc' : '', p.rate ? '₹' + p.rate + '/g' : ''].filter(Boolean).join(' · ');
    return `<div class="pcard card shine ${st}" data-id="${esc(p.id)}">
      <div class="ptop"><div><b>${esc(p.name)}</b><small>Alert when ≤ ${p.lowAt}${extra ? ' · ' + esc(extra) : ''}</small></div><span class="badge ${st}">${statusText(p)}</span></div>
      <div class="gauge"><i style="width:${pct}%"></i></div>
      <div class="pbot"><span class="pcount"><b>${p.stock}</b> pcs</span>
        <span><button class="btn" data-act="restock">+ Restock</button><button class="btn" data-act="edit">Edit</button><button class="btn danger" data-act="del">Delete</button></span></div>
    </div>`;
  }).join('');
}
function productForm(p){
  p = p || {};
  return `<label>Product name<input id="pName" value="${esc(p.name || '')}" placeholder="e.g. Gold chain 22K"></label>
    <div class="row">
      <label>Quantity (pcs)<input id="pStock" type="number" min="0" step="1" inputmode="numeric" value="${p.stock ?? ''}"></label>
      <label>Warn when ≤<input id="pLow" type="number" min="0" step="1" inputmode="numeric" value="${p.lowAt ?? 2}"></label>
    </div>
    <div class="row">
      <label>Weight / piece (g)<input id="pWeight" type="number" min="0" step="0.001" inputmode="decimal" value="${p.weight || ''}" placeholder="optional"></label>
      <label>Rate / gram (₹)<input id="pRate" type="number" min="0" step="0.01" inputmode="decimal" value="${p.rate || ''}" placeholder="optional"></label>
    </div>`;
}
function readProductForm(existing){
  const name = $('#pName').value.trim();
  const stock = Math.floor(num($('#pStock').value)), lowAt = Math.floor(num($('#pLow').value));
  if (!name){ toast('Product name likho'); return null; }
  if ($('#pStock').value === '' || stock < 0){ toast('Quantity likho'); return null; }
  if (products.some(p => p.name.toLowerCase() === name.toLowerCase() && (!existing || p.id !== existing.id))){
    toast('Ye product pehle se hai. Restock use karo.'); return null;
  }
  return {name, stock, lowAt: Math.max(0, lowAt), weight: num($('#pWeight').value) || 0, rate: num($('#pRate').value) || 0};
}
function addProduct(){
  openModal('Add product', productForm(), 'Add to stock', () => {
    const d = readProductForm(null); if (!d) return false;
    products.push(Object.assign({id: uid(), created: new Date().toISOString()}, d));
    saveAll(); toast(`${d.name} stock mein add ho gaya`);
    refreshCurrent(); return true;
  });
}
function editProduct(id){
  const p = products.find(x => x.id === id); if (!p) return;
  openModal('Edit product', productForm(p), 'Save', () => {
    const d = readProductForm(p); if (!d) return false;
    Object.assign(p, d); saveAll(); toast('Product updated'); refreshCurrent(); return true;
  });
}
function restock(id){
  const p = products.find(x => x.id === id); if (!p) return;
  openModal('Restock · ' + p.name, `<p class="muted">Abhi stock: <b>${p.stock}</b> pcs</p>
    <label>Kitne pieces aaye?<input id="rQty" type="number" min="1" step="1" inputmode="numeric" placeholder="e.g. 5"></label>`, 'Add stock', () => {
    const q = Math.floor(num($('#rQty').value));
    if (q < 1){ toast('Quantity likho'); return false; }
    p.stock += q; saveAll(); toast(`${p.name}: ${p.stock} pcs ho gaye`); refreshCurrent(); return true;
  });
}
function delProduct(id){
  const p = products.find(x => x.id === id); if (!p) return;
  if (!confirm(`Delete "${p.name}" from stock? Purane receipts par koi asar nahi padega.`)) return;
  products = products.filter(x => x.id !== id); saveAll(); toast('Product deleted'); refreshCurrent();
}
function refreshCurrent(){
  const cur = ['home', 'add', 'stock', 'admin'].find(n => !$('#' + n).hidden);
  if (cur) show(cur); else renderWarn();
}

/* ---------- new sale ---------- */
const newLine = () => ({key: uid(), pid: '', qty: 1, weight: '', rate: '', amount: '', wTouched: false, aTouched: false});
const productOf = l => products.find(p => p.id === l.pid);
function usedOf(pid, exceptKey){ return lines.filter(l => l.pid === pid && l.key !== exceptKey).reduce((a, l) => a + (Math.floor(num(l.qty)) || 0), 0); }

function lineHTML(l, i){
  const opts = ['<option value="">Select product…</option>'].concat(products.map(p =>
    `<option value="${esc(p.id)}" ${p.id === l.pid ? 'selected' : ''} ${p.stock <= 0 ? 'disabled' : ''}>${esc(p.name)} — ${p.stock <= 0 ? 'out of stock' : p.stock + ' in stock'}</option>`)).join('');
  return `<div class="line card" data-key="${l.key}">
    <div class="line-head"><b>Item ${i + 1}</b>${lines.length > 1 ? '<button type="button" class="x" data-act="rm" aria-label="Remove item">×</button>' : ''}</div>
    <label>Product<select data-f="pid">${opts}</select></label>
    <div class="hint" data-hint></div>
    <div class="fld"><span>Number of pieces</span>
      <div class="stepper"><button type="button" data-act="dec" aria-label="Decrease">−</button>
        <input data-f="qty" type="number" min="1" step="1" inputmode="numeric" value="${l.qty}" aria-label="Quantity">
        <button type="button" data-act="inc" aria-label="Increase">+</button></div></div>
    <div class="row">
      <label>Weight (g)<input data-f="weight" type="number" min="0" step="0.001" inputmode="decimal" value="${esc(l.weight)}" placeholder="0.000"></label>
      <label>Rate (₹/g)<input data-f="rate" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(l.rate)}" placeholder="0"></label>
    </div>
    <label>Amount (₹)<input data-f="amount" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(l.amount)}" placeholder="Weight × Rate"></label>
  </div>`;
}
function renderSale(){
  lines.forEach(l => { if (l.pid && !productOf(l)) l.pid = ''; });
  if (!lines.length) lines = [newLine()];
  $('#noProd').hidden = products.length > 0;
  $('#lines').innerHTML = lines.map(lineHTML).join('');
  lines.forEach(refreshLine);
  updateTotals();
}
function lineEl(l){ return $(`.line[data-key="${l.key}"]`); }
function setVal(el, v){ if (el && document.activeElement !== el) el.value = v; }
function refreshLine(l){
  const el = lineEl(l); if (!el) return;
  setVal(el.querySelector('[data-f="qty"]'), l.qty);
  setVal(el.querySelector('[data-f="weight"]'), l.weight);
  setVal(el.querySelector('[data-f="rate"]'), l.rate);
  setVal(el.querySelector('[data-f="amount"]'), l.amount);
  const h = el.querySelector('[data-hint]'), p = productOf(l);
  h.className = 'hint';
  if (!p){ h.textContent = ''; return; }
  const q = Math.floor(num(l.qty)) || 0, left = p.stock - usedOf(p.id, l.key) - q;
  if (left < 0){ h.className = 'hint bad'; h.textContent = `Only ${p.stock - usedOf(p.id, l.key)} pcs available`; }
  else {
    h.textContent = `In stock: ${p.stock - usedOf(p.id, l.key)} → after this sale: ${left}`;
    if (left <= p.lowAt){ h.className = 'hint warn'; h.textContent += left <= 0 ? ' (stock khatam ho jayega)' : ' (kam stock)'; }
  }
}
function autoCalc(l){
  const p = productOf(l), q = Math.floor(num(l.qty)) || 0;
  if (!l.wTouched && p && p.weight) l.weight = q ? String(r2(p.weight * q * 1000) / 1000) : '';
  if (!l.aTouched){ const w = num(l.weight), r = num(l.rate); l.amount = (w > 0 && r > 0) ? (w * r).toFixed(2) : ''; }
}
function updateTotals(){
  const total = r2(lines.reduce((a, l) => a + num(l.amount), 0));
  const paid = num($('#fPaid').value), bal = r2(total - paid);
  $('#sumTotal').textContent = money(total);
  const box = $('#balBox');
  box.classList.toggle('clear', total > 0 && bal <= 0);
  box.classList.toggle('zero', total <= 0);
  $('#balLabel').textContent = total <= 0 ? 'Balance' : bal < 0 ? 'Paid more than total' : bal === 0 ? 'Fully paid' : 'Balance due';
  $('#sumBal').textContent = money(Math.max(bal, 0));
}
function onLineInput(e){
  const f = e.target.dataset.f, card = e.target.closest('.line'); if (!f || !card) return;
  const l = lines.find(x => x.key === card.dataset.key); if (!l) return;
  if (f === 'pid'){
    l.pid = e.target.value; const p = productOf(l);
    l.qty = 1; l.wTouched = false; l.aTouched = false;
    l.weight = ''; l.rate = p && p.rate ? String(p.rate) : '';
    autoCalc(l); renderSale(); return;
  }
  if (f === 'qty'){ l.qty = e.target.value; autoCalc(l); }
  if (f === 'weight'){ l.weight = e.target.value; l.wTouched = e.target.value !== ''; autoCalc(l); }
  if (f === 'rate'){ l.rate = e.target.value; autoCalc(l); }
  if (f === 'amount'){ l.amount = e.target.value; l.aTouched = e.target.value !== ''; }
  lines.forEach(refreshLine); updateTotals();
}
function onLineClick(e){
  const b = e.target.closest('[data-act]'); if (!b) return;
  const card = b.closest('.line'); const l = lines.find(x => x.key === card.dataset.key); if (!l) return;
  const act = b.dataset.act;
  if (act === 'rm'){ lines = lines.filter(x => x !== l); renderSale(); return; }
  const p = productOf(l);
  let q = Math.floor(num(l.qty)) || 0;
  if (act === 'inc'){
    if (p && q >= p.stock - usedOf(p.id, l.key)){ toast(`Sirf ${p.stock - usedOf(p.id, l.key)} pcs stock mein hain`); return; }
    q += 1;
  }
  if (act === 'dec') q = Math.max(1, q - 1);
  l.qty = q; autoCalc(l); lines.forEach(refreshLine); updateTotals();
}
function resetSale(){
  lines = [newLine()]; $('#fName').value = ''; $('#fPhone').value = ''; $('#fPaid').value = '';
}
function saveSale(ev){
  const name = $('#fName').value.trim(), phone = digits($('#fPhone').value);
  if (!name) return toast('Customer ka naam likho');
  if (phone && phone.length < 10) return toast('Phone number 10 digit ka hona chahiye');
  if (!products.length) return toast('Pehle stock mein product add karo');
  const need = {};
  for (let i = 0; i < lines.length; i++){
    const l = lines[i], p = productOf(l), q = Math.floor(num(l.qty));
    if (!p) return toast(`Item ${i + 1}: product select karo`);
    if (q < 1) return toast(`Item ${i + 1}: quantity likho`);
    if (!(num(l.weight) > 0)) return toast(`Item ${i + 1}: weight likho`);
    if (l.amount === '' || num(l.amount) < 0) return toast(`Item ${i + 1}: amount likho`);
    need[p.id] = (need[p.id] || 0) + q;
    if (need[p.id] > p.stock) return toast(`${p.name}: sirf ${p.stock} pcs stock mein hain`);
  }
  const total = r2(lines.reduce((a, l) => a + num(l.amount), 0));
  const paid = r2(num($('#fPaid').value));
  if (paid < 0) return toast('Paid amount galat hai');
  if (paid > total) return toast('Paid amount total se zyada hai');
  const date = new Date().toISOString();
  const rec = {
    id: uid(), receiptNo: settings.nextReceipt++, date, name, phone,
    items: lines.map(l => ({pid: l.pid, name: productOf(l).name, qty: Math.floor(num(l.qty)), weight: num(l.weight), rate: num(l.rate), amount: r2(num(l.amount))})),
    total, paid, payments: paid > 0 ? [{date, amount: paid}] : []
  };
  const alerts = [];
  Object.keys(need).forEach(pid => {
    const p = products.find(x => x.id === pid); p.stock -= need[pid];
    if (p.stock <= 0) alerts.push(`${p.name}: stock khatam!`);
    else if (p.stock <= p.lowAt) alerts.push(`${p.name}: sirf ${p.stock} bacha`);
  });
  records.push(rec); saveAll(); resetSale();
  if (ev && ev.clientX !== undefined) sparkle(ev.clientX, ev.clientY);
  toast(alerts.length ? 'Saved ✓\n⚠ ' + alerts.join('\n⚠ ') : 'Saved ✓', alerts.length ? 4500 : 2200);
  openReceipt(rec.id, 'home');
}

/* ---------- record book / detail ---------- */
function renderBook(){
  const q = $('#search').value.trim().toLowerCase();
  const list = records.slice().reverse().filter(r =>
    (bookFilter === 'all' || balanceOf(r) > 0) &&
    (!q || r.name.toLowerCase().includes(q) || (r.phone || '').includes(q) || r.items.some(i => i.name.toLowerCase().includes(q))));
  const box = $('#bookList');
  box.innerHTML = list.length ? list.map(itemHTML).join('') : '<p class="empty">No records found.</p>';
  bindItems(box);
}
function openDetail(id){
  const r = records.find(x => x.id === id); if (!r) return;
  currentId = id; renderDetail(); show('detail'); renderDetail();
}
function renderDetail(){
  const r = records.find(x => x.id === currentId); if (!r) return;
  const bal = balanceOf(r);
  $('#detailBody').innerHTML = `<h3>${esc(r.name)}</h3>
    <dl class="dl"><dt>Date and time</dt><dd>${esc(fmtDate(r.date))}</dd>
    <dt>Receipt no.</dt><dd>#${String(r.receiptNo).padStart(4, '0')}</dd>
    <dt>Phone</dt><dd>${r.phone ? esc(r.phone) : '—'}</dd></dl>
    <table class="mini"><thead><tr><th>Item</th><th class="n">Qty</th><th class="n">Weight</th><th class="n">Amount</th></tr></thead><tbody>
    ${r.items.map(i => `<tr><td>${esc(i.name)}</td><td class="n">${i.qty}</td><td class="n">${Number(i.weight).toFixed(3)} g</td><td class="n">${money(i.amount)}</td></tr>`).join('')}
    </tbody></table>
    <dl class="dl"><dt>Total</dt><dd>${money(r.total)}</dd><dt>Paid</dt><dd>${money(r.paid)}</dd>
    <dt>Balance</dt><dd style="color:var(--${bal > 0 ? 'red' : 'green'})">${bal > 0 ? money(bal) : 'Nil — fully paid'}</dd></dl>
    ${r.payments.length > 1 ? `<p class="muted">Payments: ${r.payments.map(p => esc(fmtShort(p.date)) + ' ' + money0(p.amount)).join(' · ')}</p>` : ''}`;
  $('#detailPay').hidden = bal <= 0;
}
function receivePayment(){
  const r = records.find(x => x.id === currentId); if (!r) return;
  const bal = balanceOf(r);
  openModal('Receive payment', `<p class="muted">Balance due: <b>${money(bal)}</b></p>
    <label>Amount received (₹)<input id="payAmt" type="number" min="0" step="0.01" inputmode="decimal" value="${bal}"></label>`, 'Save payment', () => {
    const a = r2(num($('#payAmt').value));
    if (a <= 0){ toast('Amount likho'); return false; }
    if (a > bal){ toast('Amount balance se zyada hai'); return false; }
    r.paid = r2(r.paid + a); r.payments.push({date: new Date().toISOString(), amount: a});
    saveAll(); renderDetail(); toast(r.total - r.paid <= 0 ? 'Poora payment mil gaya ✓' : 'Payment saved'); return true;
  });
}
function deleteCurrent(){
  const r = records.find(x => x.id === currentId); if (!r) return;
  if (!confirm('Delete this record? Items wapas stock mein add ho jayenge.')) return;
  r.items.forEach(i => { const p = products.find(x => x.id === i.pid); if (p) p.stock += i.qty; });
  records = records.filter(x => x.id !== currentId); saveAll(); currentId = null;
  toast('Record deleted, stock wapas add'); show('book');
}

/* ---------- receipt ---------- */
const RECEIPT_CSS = `
:root{--maroon:#6d1420;--gold:#c9a227}
.rc{position:relative;font-family:Georgia,'Times New Roman',serif;color:#2b1a14;background:#fffdf6;padding:22px 22px 18px;border:2px solid #c9a227;outline:1px solid #6d1420;outline-offset:-8px;max-width:520px;margin:0 auto;box-shadow:0 8px 24px rgba(60,20,10,.18)}
.rc-badge{width:48px;height:48px;border-radius:50%;background:#6d1420;color:#f3d77a;border:2px solid #c9a227;display:flex;align-items:center;justify-content:center;font-weight:700;letter-spacing:1px;margin:0 auto 6px;font-size:17px}
.rc-name{text-align:center;font-size:27px;color:#6d1420;font-weight:700;letter-spacing:.5px}
.rc-addr,.rc-phone{text-align:center;font-size:12.5px;color:#5a4a3c;margin-top:2px}
.rc-orn{display:block;margin:8px auto;width:70%;height:12px;fill:none;stroke:#c9a227}
.rc-title{text-align:center;font-size:12px;letter-spacing:5px;color:#fff;background:#6d1420;padding:5px 0;margin:4px 0 12px}
.rc-meta{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:#5a4a3c;margin-bottom:8px}
.rc-meta b{display:block;font-size:14px;color:#2b1a14}
.rc-cust{border:1px dashed #c9a227;padding:8px 10px;margin-bottom:10px;font-size:12px;color:#5a4a3c;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
.rc-cust b{display:block;font-size:15px;color:#2b1a14}
.rc-items{width:100%;border-collapse:collapse;font-size:12.5px}
.rc-items th{background:#f6ecc9;color:#6d1420;text-align:left;padding:6px 4px;border-bottom:1.5px solid #c9a227}
.rc-items td{padding:7px 4px;border-bottom:1px dotted #c8b98a;vertical-align:top}
.rc-items .n{text-align:right;white-space:nowrap}
.rc-bottom{display:flex;gap:10px;align-items:flex-start;margin-top:10px}
.rc-stampwrap{flex:1;padding-top:14px;text-align:center}
.rc-stamp{display:inline-block;transform:rotate(-10deg);border:3px double;padding:4px 12px;font-size:18px;font-weight:700;letter-spacing:2px;opacity:.8}
.rc-stamp.paid{color:#1f7a3d}.rc-stamp.due{color:#b3261e}
.rc-totals{width:60%;min-width:190px;font-size:14px}
.rc-totals div{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dotted #c8b98a}
.rc-totals .bal{background:#6d1420;color:#f3d77a;padding:8px;margin-top:6px;font-size:16px;font-weight:700;border:0}
.rc-totals .bal.zero{background:#1f6b3a;color:#fff}
.rc-pay{font-size:11.5px;color:#5a4a3c;margin-top:10px}
.rc-sign{display:flex;justify-content:space-between;margin-top:34px;font-size:11.5px;color:#5a4a3c}
.rc-sign span{border-top:1px solid #6d1420;padding-top:4px;min-width:110px;text-align:center}
.rc-foot{text-align:center;margin-top:14px;font-size:12.5px;color:#6d1420;font-style:italic}
`;
function receiptInner(r){
  const bal = balanceOf(r), shopPhone = settings.phone.trim();
  const rows = r.items.map(i => `<tr><td>${esc(i.name)}</td><td class="n">${i.qty}</td><td class="n">${Number(i.weight).toFixed(3)}</td><td class="n">${money0(i.rate)}</td><td class="n">${money(i.amount)}</td></tr>`).join('');
  const pays = r.payments.length > 1 ? `<div class="rc-pay">Payments: ${r.payments.map(p => esc(fmtShort(p.date)) + ' ' + money0(p.amount)).join(' · ')}</div>` : '';
  return `<div class="rc">
    <div class="rc-badge">KJ</div>
    <div class="rc-name">${SHOP_NAME}</div>
    <div class="rc-addr">${esc(SHOP_ADDR)}</div>
    ${shopPhone ? `<div class="rc-phone">Phone: ${esc(shopPhone)}</div>` : ''}
    <svg class="rc-orn" viewBox="0 0 200 12"><path d="M0 6h82M118 6h82" stroke-width="1"/><path d="M100 1l5 5-5 5-5-5z" fill="#c9a227" stroke="none"/><circle cx="88" cy="6" r="2"/><circle cx="112" cy="6" r="2"/></svg>
    <div class="rc-title">RECEIPT</div>
    <div class="rc-meta"><div>Receipt No.<b>#${String(r.receiptNo).padStart(4, '0')}</b></div><div style="text-align:right">Date &amp; time<b>${esc(fmtDate(r.date))}</b></div></div>
    <div class="rc-cust"><div>Customer<b>${esc(r.name)}</b></div>${r.phone ? `<div style="text-align:right">Phone<b>${esc(r.phone)}</b></div>` : ''}</div>
    <table class="rc-items"><thead><tr><th>Item</th><th class="n">Qty</th><th class="n">Wt (g)</th><th class="n">Rate/g</th><th class="n">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="rc-bottom">
      <div class="rc-stampwrap"><span class="rc-stamp ${bal > 0 ? 'due' : 'paid'}">${bal > 0 ? 'BALANCE DUE' : 'PAID'}</span></div>
      <div class="rc-totals">
        <div><span>Total</span><b>${money(r.total)}</b></div>
        <div><span>Paid</span><b>${money(r.paid)}</b></div>
        <div class="bal ${bal > 0 ? '' : 'zero'}"><span>Balance</span><b>${money(bal)}</b></div>
      </div>
    </div>
    ${pays}
    <div class="rc-sign"><span>Customer</span><span>Authorised signature</span></div>
    <div class="rc-foot">Thank you! Visit again.</div>
  </div>`;
}
function openReceipt(id, back){
  const r = records.find(x => x.id === id); if (!r) return;
  currentId = id; receiptReturn = back || 'detail';
  $('#receiptPaper').innerHTML = receiptInner(r);
  show('receipt');
}
function downloadFile(name, text, type){
  const blob = new Blob([text], {type});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function downloadReceipt(){
  const r = records.find(x => x.id === currentId); if (!r) return;
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Receipt ${r.receiptNo}</title><style>body{margin:14px;background:#fff}${RECEIPT_CSS}</style></head><body>${receiptInner(r)}</body></html>`;
  downloadFile(`receipt-${r.receiptNo}-${r.name.replace(/[^\w]+/g, '_')}.html`, html, 'text/html');
}
function whatsappReceipt(){
  const r = records.find(x => x.id === currentId); if (!r) return;
  const bal = balanceOf(r);
  const lns = r.items.map(i => `• ${i.name} × ${i.qty} (${Number(i.weight).toFixed(3)} g) — ${money(i.amount)}`).join('\n');
  const text = `*${SHOP_NAME}*\n${SHOP_ADDR}${settings.phone ? '\nPh: ' + settings.phone : ''}\n\nReceipt #${String(r.receiptNo).padStart(4, '0')} · ${fmtDate(r.date)}\nCustomer: ${r.name}\n\n${lns}\n\nTotal: ${money(r.total)}\nPaid: ${money(r.paid)}\n*Balance: ${money(bal)}*\n\nThank you! Visit again.`;
  let to = digits(r.phone); if (to.length === 10) to = '91' + to;
  window.open(`https://wa.me/${to}?text=${encodeURIComponent(text)}`, '_blank');
}

/* ---------- admin ---------- */
function renderAdmin(){
  $('#sPhone').value = settings.phone;
  $('#lastBackup').textContent = settings.lastBackup ? 'Last backup: ' + fmtDate(settings.lastBackup) : 'Abhi tak backup nahi liya.';
}
function savePhone(){ settings.phone = $('#sPhone').value.trim(); saveAll(); toast('Phone number saved'); }
function backup(){
  settings.lastBackup = new Date().toISOString(); saveAll();
  const data = {app: 'krishna-jewellers', version: 2, exported: settings.lastBackup, settings: {phone: settings.phone, nextReceipt: settings.nextReceipt}, products, records};
  downloadFile(`krishna-jewellers-backup-${settings.lastBackup.slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
  renderAdmin(); toast('Backup downloaded');
}
function restore(file){
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const d = JSON.parse(reader.result);
      if (!d || !Array.isArray(d.records)) throw new Error('bad');
      const recs = d.records.map(normalizeRecord), prods = Array.isArray(d.products) ? d.products : [];
      if (!confirm(`Restore ${recs.length} records and ${prods.length} products? Current data replace ho jayega.`)) return;
      records = recs; products = prods;
      if (d.settings){
        if (d.settings.phone !== undefined) settings.phone = d.settings.phone;
        settings.nextReceipt = Math.max(num(d.settings.nextReceipt) || 1, settings.nextReceipt, ...recs.map(r => num(r.receiptNo) + 1));
      }
      saveAll(); renderAdmin(); renderWarn(); toast('Backup restored');
    } catch(e){ toast('Ye valid backup file nahi hai'); }
    $('#restoreFile').value = '';
  };
  reader.readAsText(file);
}
function changePassword(){
  const o = $('#pwOld').value, n = $('#pwNew').value;
  if (o !== settings.password) return toast('Current password galat hai');
  if (n.length < 4) return toast('New password kam se kam 4 character ka ho');
  settings.password = n; saveAll(); $('#pwOld').value = ''; $('#pwNew').value = ''; toast('Password changed');
}
function wipeRecords(){
  if (!confirm('Saare customer records delete karne hain? Pehle backup le lo.') || !confirm('Pakka delete karna hai?')) return;
  records = []; saveAll(); toast('All records deleted');
}
function wipeAll(){
  if (!confirm('Records AUR stock sab delete karna hai? Pehle backup le lo.') || !confirm('Pakka sab delete karna hai?')) return;
  records = []; products = []; saveAll(); renderWarn(); toast('Everything deleted');
}

/* ---------- wire up ---------- */
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]'); if (g) { show(g.dataset.go); return; }
  const a = e.target.closest('[data-act="addProduct"]'); if (a) { addProduct(); return; }
  const pc = e.target.closest('.pcard');
  const act = e.target.closest('.pcard [data-act]');
  if (pc && act){
    if (act.dataset.act === 'restock') restock(pc.dataset.id);
    if (act.dataset.act === 'edit') editProduct(pc.dataset.id);
    if (act.dataset.act === 'del') delProduct(pc.dataset.id);
  }
});
/* ripple */
document.addEventListener('pointerdown', e => {
  const t = e.target.closest('.btn, .item, .tile'); if (!t || reduced) return;
  const rect = t.getBoundingClientRect(), size = Math.max(rect.width, rect.height) * 2;
  const s = document.createElement('span'); s.className = 'ripple';
  s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px`;
  t.appendChild(s); setTimeout(() => s.remove(), 650);
});
/* light that follows the finger/mouse on cards */
document.addEventListener('pointermove', e => {
  const c = e.target.closest('.shine'); if (!c) return;
  const r = c.getBoundingClientRect();
  c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px');
});

$('#loginBtn').onclick = login;
$('#pw').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
$('#lockBtn').onclick = logout;
$('#warnBar').onclick = () => show('stock');
$('#lines').addEventListener('input', onLineInput);
$('#lines').addEventListener('change', e => { if (e.target.dataset.f === 'pid') onLineInput(e); });
$('#lines').addEventListener('click', onLineClick);
$('#addLine').onclick = () => { lines.push(newLine()); renderSale(); };
$('#fPaid').addEventListener('input', updateTotals);
$$('[data-paid]').forEach(b => b.onclick = () => {
  const total = r2(lines.reduce((a, l) => a + num(l.amount), 0));
  $('#fPaid').value = b.dataset.paid === 'full' ? total : b.dataset.paid === 'half' ? r2(total / 2) : '';
  updateTotals();
});
$('#saveBtn').onclick = saveSale;
$('#search').addEventListener('input', renderBook);
$('#stockSearch').addEventListener('input', renderStock);
$$('#bookChips .chip').forEach(c => c.onclick = () => {
  bookFilter = c.dataset.filter; $$('#bookChips .chip').forEach(x => x.classList.toggle('on', x === c)); renderBook();
});
$('#detailPay').onclick = receivePayment;
$('#detailReceipt').onclick = () => openReceipt(currentId, 'detail');
$('#detailDelete').onclick = deleteCurrent;
$('#rcBack').onclick = () => show(receiptReturn);
$('#rcPrint').onclick = () => window.print();
$('#rcDownload').onclick = downloadReceipt;
$('#rcWhats').onclick = whatsappReceipt;
$('#savePhone').onclick = savePhone;
$('#backupBtn').onclick = backup;
$('#restoreFile').onchange = e => e.target.files[0] && restore(e.target.files[0]);
$('#pwSave').onclick = changePassword;
$('#wipeRecords').onclick = wipeRecords;
$('#wipeAll').onclick = wipeAll;
$('#logoutBtn').onclick = logout;
$('#mCancel').onclick = closeModal;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
$('#mOk').onclick = () => { if (modalOk && modalOk() !== false) closeModal(); };

const rcStyle = document.createElement('style'); rcStyle.textContent = RECEIPT_CSS; document.head.appendChild(rcStyle);
lines = [newLine()];
if (sessionStorage.getItem('jw_in') === '1') enter();

/* offline support (works when served over https, e.g. GitHub Pages or inside the APK) */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
