'use strict';

/* ================================================================
   HEPI TABUNGAN — app.js
   ================================================================ */

/* ── Formatters ─────────────────────────────────────────────── */
const fmtRp  = n => 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n) || 0));
const fmtNum = n => new Intl.NumberFormat('id-ID').format(Math.round(Number(n) || 0));
const parseN = s => Number((s || '').toString().replace(/[^\d]/g, '')) || 0;

function maskInput(el) {
  if (!el) return;
  el.addEventListener('input', () => {
    const v = parseN(el.value);
    el.value = v ? fmtNum(v) : '';
  });
}

/* ── Tabel Biaya Penarikan ──────────────────────────────────── */
const FEE_TABLE = [
  [0,        700000,   5000],
  [800000,   2000000,  10000],
  [2100000,  3000000,  15000],
  [3100000,  5000000,  20000],
  [5000000,  7000000,  25000],
  [7100000,  10000000, 30000],
];

function getWithdrawFee(amount) {
  for (const [min, max, fee] of FEE_TABLE) {
    if (amount >= min && amount <= max) return fee;
  }
  if (amount > 10000000) return 30000;
  return 0;
}

/* ── Free Withdraw: saldo >= 30 hari ────────────────────────── */
const ONE_MONTH = 30 * 24 * 3600 * 1000;

function ensureLots(n) {
  n.lots    = Array.isArray(n.lots)    ? n.lots    : [];
  n.history = Array.isArray(n.history) ? n.history : [];
  if (!n.lots.length && Number(n.saldo || 0) > 0) {
    // rebuild lots dari history
    const sorted = [...n.history].sort((a, b) => (a.ts || 0) - (b.ts || 0));
    let lots = [];
    for (const h of sorted) {
      const amt = Number(h.amount || 0);
      const type = (h.type || '').toLowerCase();
      if ((type === 'tambah') && amt > 0)
        lots.push({ ts: h.ts || Date.now(), amount: amt, remaining: amt });
      else if (type === 'tarik' && amt > 0) {
        let need = amt;
        for (const l of lots) { if (!need) break; const t = Math.min(l.remaining, need); l.remaining -= t; need -= t; }
      } else if (type === 'koreksi') {
        if (amt > 0) lots.push({ ts: h.ts || Date.now(), amount: amt, remaining: amt });
      }
    }
    n.lots = lots.filter(l => l.remaining > 0);
    if (!n.lots.length)
      n.lots = [{ ts: Date.now(), amount: Number(n.saldo), remaining: Number(n.saldo) }];
  }
  return n;
}

function freeAmount(n, now = Date.now()) {
  ensureLots(n);
  return n.lots.reduce((s, l) => s + (now - (l.ts || 0) >= ONE_MONTH ? Number(l.remaining || 0) : 0), 0);
}

/* ── ID Generator ───────────────────────────────────────────── */
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genId(taken = []) {
  let s;
  do { s = [...Array(6)].map(() => CHARS[Math.floor(Math.random() * CHARS.length)]).join(''); }
  while (taken.includes(s));
  return s;
}

/* ── Allocate Proportional ──────────────────────────────────── */
function allocProp(total, list) {
  const sum = list.reduce((s, n) => s + Number(n.saldo || 0), 0);
  if (!sum) return list.map(() => 0);
  const raw    = list.map(n => (total * Number(n.saldo || 0)) / sum);
  const floors = raw.map(x => Math.floor(x));
  let rem      = Math.round(total - floors.reduce((a, b) => a + b, 0));
  raw.map((x, i) => ({ i, f: x - Math.floor(x) }))
     .sort((a, b) => b.f - a.f)
     .slice(0, rem)
     .forEach(o => floors[o.i]++);
  return floors;
}

/* ── Build timestamp from date+time inputs ──────────────────── */
function buildTs(d, t) {
  if (!d && !t) return Date.now();
  const [Y, M, D] = (d || '').split('-').map(v => parseInt(v, 10));
  const [h, m]    = (t || '').split(':').map(v => parseInt(v, 10));
  const now = new Date();
  return new Date(
    isFinite(Y) ? Y : now.getFullYear(),
    isFinite(M) ? M - 1 : now.getMonth(),
    isFinite(D) ? D : now.getDate(),
    isFinite(h) ? h : 9, isFinite(m) ? m : 0, 0, 0
  ).getTime();
}

/* ── Toast ──────────────────────────────────────────────────── */
let _toastTimer = null;
function toast(msg, type = 'ok') {
  const el = document.getElementById('toast-admin');
  if (!el) return;
  el.textContent = msg;
  el.className   = 'toast ' + type;
  el.style.display = 'block';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.style.display = 'none'; }, 3000);
}

/* ── API ────────────────────────────────────────────────────── */
async function apiGet() {
  const r = await fetch('/api/get');
  const t = await r.text(); let j;
  try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(j.error || j.message || 'GET ' + r.status);
  return j;
}
async function apiPut(payload) {
  const r = await fetch('/api/put', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const t = await r.text(); let j;
  try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(j.error || j.message || 'PUT ' + r.status);
  return j;
}
async function apiPublic(id) {
  const r = await fetch('/api/public?id=' + encodeURIComponent(id));
  const j = await r.json();
  if (!r.ok || !j.found) throw new Error(j.message || 'Nasabah tidak ditemukan');
  return j.nasabah;
}

/* ── State ──────────────────────────────────────────────────── */
let state = { nasabah: [] };
const origin = (location.origin || '').replace(/\/$/, '');
const qs     = new URLSearchParams(location.search);
const qId    = qs.get('id');

/* ================================================================
   ROUTING
   ================================================================ */
(function boot() {
  if (qId) {
    show('page-public');
    initPublic(qId);
  } else {
    if (isLogged()) { show('page-admin'); initAdmin(); }
    else            { show('page-login'); initLogin(); }
  }
})();

function show(id) {
  ['page-login', 'page-admin', 'page-public', 'page-notfound']
    .forEach(p => { const el = g(p); if (el) el.style.display = 'none'; });
  const el = g(id);
  if (el) el.style.display = 'block';
}
const g = id => document.getElementById(id);

/* ================================================================
   AUTH
   ================================================================ */
function isLogged() { try { return localStorage.getItem('hepi_logged') === '1'; } catch { return false; } }
function setLogged(v) { try { v ? localStorage.setItem('hepi_logged', '1') : localStorage.removeItem('hepi_logged'); } catch {} }

function initLogin() {
  g('btn-login').addEventListener('click', doLogin);
  g('l-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}

async function doLogin() {
  const u = (g('l-user').value || '').trim();
  const p = (g('l-pass').value || '').trim();
  const errEl = g('login-err');
  errEl.textContent = '';
  if (!u || !p) { errEl.textContent = 'Isi username dan password.'; return; }
  try {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
    const j = await r.json();
    if (!r.ok || !j.ok) { errEl.textContent = j.message || 'Username atau password salah.'; return; }
    setLogged(true);
    show('page-admin');
    initAdmin();
  } catch (e) { errEl.textContent = 'Error: ' + e.message; }
}

function doLogout() { setLogged(false); location.reload(); }

/* ================================================================
   ADMIN
   ================================================================ */
function initAdmin() {
  g('btn-logout').addEventListener('click', doLogout);

  // Tabs
  document.querySelectorAll('.tab[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Mask numeric inputs
  ['new-saldo', 'inp-nominal', 'inp-rev', 'inp-div-nominal'].forEach(id => maskInput(g(id)));

  // Events
  g('btn-tambah-nasabah').addEventListener('click', doTambahNasabah);
  g('btn-rename').addEventListener('click', doRename);
  g('btn-simpan-saldo').addEventListener('click', doSimpanSaldo);
  g('btn-preview-div').addEventListener('click', doPreviewDiv);
  g('btn-bagikan-div').addEventListener('click', doBagikanDiv);
  g('btn-simpan-div').addEventListener('click', doSimpanDivEdit);
  g('btn-muat-riw').addEventListener('click', () => renderRiwayat(g('sel-riw').value));
  g('sel-riw').addEventListener('change', e => renderRiwayat(e.target.value));
  g('sel-div-edit').addEventListener('change', updateDivCurrent);

  // Search
  g('search-box').addEventListener('input', e => renderTblRingkasan(e.target.value));

  // Saldo preview live
  ['sel-edit', 'inp-nominal', 'sel-aksi'].forEach(id => {
    const el = g(id);
    if (el) { el.addEventListener('input', updateSaldoPreview); el.addEventListener('change', updateSaldoPreview); }
  });

  loadData();
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  if (name === 'dividen') renderTblDividen();
}

/* ── Load & Save ─────────────────────────────────────────────── */
async function loadData() {
  try {
    const data = await apiGet();
    if (!Array.isArray(data.nasabah)) data.nasabah = [];
    let changed = false;
    const taken = [];
    state.nasabah = data.nasabah.map(x => {
      const n = { ...x };
      if (!n.id) { n.id = genId(taken); changed = true; }
      taken.push(n.id);
      if (typeof n.dividen !== 'number') { n.dividen = 0; changed = true; }
      n.history = Array.isArray(n.history) ? n.history : [];
      n.lots    = Array.isArray(n.lots)    ? n.lots    : [];
      ensureLots(n);
      return n;
    });
    if (changed) { try { await apiPut(state); } catch {} }
    renderAll();
  } catch (e) {
    toast('Gagal memuat data: ' + e.message, 'err');
  }
}

async function saveState(msg = 'Tersimpan') {
  try {
    await apiPut(state);
    toast(msg);
    renderAll();
  } catch (e) { toast('Gagal menyimpan: ' + e.message, 'err'); }
}

/* ── Render All ──────────────────────────────────────────────── */
function renderAll() {
  renderStats();
  renderTblRingkasan(g('search-box').value);
  renderTblNasabah();
  renderSelects();
  updateSaldoPreview();
  updateDivCurrent();
  renderTblDividen();
}

function getNasabah() { return state.nasabah || []; }
function findIdx(id)  { return getNasabah().findIndex(x => x.id === id); }
function findN(id)    { return getNasabah().find(x => x.id === id); }

/* ── Stats ───────────────────────────────────────────────────── */
function renderStats() {
  const list  = getNasabah();
  const total = list.reduce((s, x) => s + Number(x.saldo || 0), 0);
  const divTot= list.reduce((s, x) => s + Number(x.dividen || 0), 0);
  g('st-nasabah').textContent = list.length;
  g('st-total').textContent   = fmtRp(total);
  g('st-dividen').textContent = fmtRp(divTot);
  g('st-rata').textContent    = fmtRp(list.length ? Math.round(total / list.length) : 0);
}

/* ── Tabel Ringkasan ─────────────────────────────────────────── */
function renderTblRingkasan(q = '') {
  const tbody = g('tbl-ringkasan')?.querySelector('tbody');
  if (!tbody) return;
  const list = getNasabah().filter(x => !q || (x.nama || '').toLowerCase().includes(q.toLowerCase()));
  tbody.innerHTML = list.map(x => {
    const link = `${origin}/?id=${encodeURIComponent(x.id)}`;
    return `<tr>
      <td><strong>${x.nama}</strong></td>
      <td>${fmtRp(x.saldo || 0)}</td>
      <td>${Number(x.dividen) > 0 ? `<span class="tbl-badge-div tbl-badge">${fmtRp(x.dividen)}</span>` : '—'}</td>
      <td>
        <div class="tbl-btn-wrap">
          <a class="tbl-btn tbl-btn-open" href="${link}" target="_blank" rel="noopener">Buka</a>
          <button class="tbl-btn tbl-btn-copy" data-id="${x.id}">📋 Salin</button>
        </div>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="4" class="empty-state">Tidak ada nasabah</td></tr>';

  tbody.querySelectorAll('button.tbl-btn-copy').forEach(btn => {
    btn.addEventListener('click', () => copyNasabahInfo(btn.dataset.id, btn));
  });
}

/* ── Tabel Nasabah ───────────────────────────────────────────── */
function renderTblNasabah() {
  const tbody = g('tbl-nasabah')?.querySelector('tbody');
  if (!tbody) return;
  const list = getNasabah();
  tbody.innerHTML = list.map(x => {
    const link = `${origin}/?id=${encodeURIComponent(x.id)}`;
    return `<tr>
      <td><strong>${x.nama}</strong></td>
      <td><code style="font-size:11px;color:var(--text-muted)">${x.id}</code></td>
      <td>${fmtRp(x.saldo || 0)}</td>
      <td>${Number(x.dividen) > 0 ? fmtRp(x.dividen) : '—'}</td>
      <td>
        <div class="tbl-btn-wrap">
          <a class="tbl-btn tbl-btn-open" href="${link}" target="_blank" rel="noopener">Buka</a>
          <button class="tbl-btn tbl-btn-copy" data-id="${x.id}">📋 Salin</button>
        </div>
      </td>
      <td><button class="btn-danger-sm" data-del="${x.id}">Hapus</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="empty-state">Belum ada nasabah</td></tr>';

  tbody.querySelectorAll('button.tbl-btn-copy').forEach(btn => {
    btn.addEventListener('click', () => copyNasabahInfo(btn.dataset.id, btn));
  });
  tbody.querySelectorAll('button[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const n = findN(btn.dataset.del);
      if (!n) return;
      if (!confirm(`Hapus nasabah "${n.nama}"? Tindakan tidak bisa dibatalkan.`)) return;
      state.nasabah = state.nasabah.filter(x => x.id !== n.id);
      await saveState(`Nasabah "${n.nama}" dihapus`);
    });
  });
}

/* ── Copy Nasabah Info ───────────────────────────────────────── */
async function copyNasabahInfo(id, btn) {
  const n = findN(id);
  if (!n) return;
  const link = `${origin}/?id=${encodeURIComponent(n.id)}`;
  const text = `Nama: ${n.nama}\nSaldo: ${fmtRp(n.saldo || 0)}\nLink: ${link}`;
  try {
    await navigator.clipboard.writeText(text);
    const orig = btn.textContent;
    btn.textContent = '✓ Disalin!';
    btn.style.background = '#dcfce7';
    setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 1500);
  } catch { prompt('Salin info ini:', text); }
}

/* ── Selects ─────────────────────────────────────────────────── */
function renderSelects() {
  const list = getNasabah().map(x => ({ id: x.id, label: x.nama })).sort((a, b) => a.label.localeCompare(b.label, 'id'));
  const opts = list.map(x => `<option value="${x.id}">${x.label}</option>`).join('');
  ['sel-edit', 'sel-div-edit', 'sel-riw', 'sel-rename-lama'].forEach(id => {
    const el = g(id); if (el) el.innerHTML = opts;
  });
}

/* ── Tambah Nasabah ──────────────────────────────────────────── */
async function doTambahNasabah() {
  const nama  = (g('new-nama').value || '').trim();
  const saldo = parseN(g('new-saldo').value);
  if (!nama) { toast('Nama wajib diisi', 'err'); return; }
  if (getNasabah().some(x => x.nama.toLowerCase() === nama.toLowerCase())) { toast('Nama sudah terdaftar', 'err'); return; }
  const id  = genId(getNasabah().map(x => x.id));
  const now = Date.now();
  const hist = saldo > 0 ? [{ ts: now, type: 'tambah', amount: saldo, note: 'Setoran awal' }] : [];
  const lots = saldo > 0 ? [{ ts: now, amount: saldo, remaining: saldo }] : [];
  state.nasabah = [...state.nasabah, { id, nama, saldo, dividen: 0, history: hist, lots }];
  g('new-nama').value = '';
  g('new-saldo').value = '';
  await saveState(`Nasabah "${nama}" berhasil ditambahkan`);
}

/* ── Rename ──────────────────────────────────────────────────── */
async function doRename() {
  const id   = g('sel-rename-lama').value;
  const baru = (g('inp-rename-baru').value || '').trim();
  if (!id || !baru) { toast('Pilih nasabah dan isi nama baru', 'err'); return; }
  if (getNasabah().some(x => x.id !== id && x.nama.toLowerCase() === baru.toLowerCase())) { toast('Nama sudah dipakai', 'err'); return; }
  const idx = findIdx(id);
  if (idx < 0) return;
  const lama = state.nasabah[idx].nama;
  state.nasabah[idx] = { ...state.nasabah[idx], nama: baru };
  g('inp-rename-baru').value = '';
  await saveState(`"${lama}" diubah menjadi "${baru}"`);
}

/* ── Edit Saldo Preview ──────────────────────────────────────── */
function updateSaldoPreview() {
  const id     = g('sel-edit')?.value;
  const jumlah = parseN(g('inp-nominal')?.value);
  const aksi   = g('sel-aksi')?.value;
  const prev   = g('saldo-preview');
  if (!prev) return;
  if (!id || !jumlah) { prev.style.display = 'none'; return; }
  const n = findN(id);
  if (!n) { prev.style.display = 'none'; return; }
  const cur = Number(n.saldo || 0);
  let after;
  if (aksi === 'tambah')   after = cur + jumlah;
  else if (aksi === 'kurangi') after = Math.max(0, cur - jumlah);
  else after = jumlah;
  prev.style.display = 'flex';
  g('prev-before').textContent = `Saldo saat ini: ${fmtRp(cur)}`;
  g('prev-after').textContent  = fmtRp(after);
}

/* ── Simpan Saldo ────────────────────────────────────────────── */
async function doSimpanSaldo() {
  const id      = g('sel-edit').value;
  const jumlah  = parseN(g('inp-nominal').value);
  const aksi    = g('sel-aksi').value;
  const catatan = (g('inp-catatan').value || '').trim();
  const ts      = buildTs(g('inp-tgl').value, g('inp-jam').value);
  if (!id || !jumlah) { toast('Pilih nasabah dan isi nominal', 'err'); return; }
  const idx = findIdx(id);
  if (idx < 0) { toast('Nasabah tidak ditemukan', 'err'); return; }
  const n = { ...state.nasabah[idx], history: [...(state.nasabah[idx].history || [])], lots: [...(state.nasabah[idx].lots || [])] };
  ensureLots(n);
  const cur = Number(n.saldo || 0);
  let delta, type;
  if (aksi === 'tambah') {
    delta = jumlah; type = 'tambah';
    n.lots = [...n.lots, { ts, amount: jumlah, remaining: jumlah }];
  } else if (aksi === 'kurangi') {
    if (jumlah > cur) { toast(`Penarikan ${fmtRp(jumlah)} melebihi saldo ${fmtRp(cur)}`, 'err'); return; }
    delta = -jumlah; type = 'tarik';
    let need = jumlah;
    for (const l of n.lots) { if (!need) break; const t = Math.min(l.remaining, need); l.remaining -= t; need -= t; }
    n.lots = n.lots.filter(l => l.remaining > 0);
  } else {
    delta = jumlah - cur; type = 'koreksi';
    if (delta >= 0) n.lots = [...n.lots, { ts, amount: delta, remaining: delta }];
    else { let need = -delta; for (const l of n.lots) { if (!need) break; const t = Math.min(l.remaining, need); l.remaining -= t; need -= t; } n.lots = n.lots.filter(l => l.remaining > 0); }
  }
  n.saldo = Math.max(0, cur + delta);
  n.history = [...n.history, { ts, type, amount: Math.abs(delta), note: catatan || (type === 'tambah' ? 'Setoran' : type === 'tarik' ? 'Penarikan' : 'Koreksi saldo') }];
  state.nasabah[idx] = n;
  ['inp-nominal', 'inp-catatan', 'inp-tgl', 'inp-jam'].forEach(id => { if (g(id)) g(id).value = ''; });
  g('saldo-preview').style.display = 'none';
  await saveState(`Saldo ${n.nama} diperbarui`);
  if (g('sel-riw').value === id) renderRiwayat(id);
}

/* ── Dividen: Preview ────────────────────────────────────────── */
function doPreviewDiv() {
  const total = parseN(g('inp-rev').value);
  if (!total) { toast('Isi nominal dulu', 'err'); return; }
  const list  = getNasabah();
  const sumS  = list.reduce((s, x) => s + Number(x.saldo || 0), 0);
  if (!sumS) { toast('Total saldo 0, tidak bisa dibagi', 'err'); return; }
  const bags  = allocProp(total, list);
  const wrap  = g('div-preview'); const ul = g('div-preview-list');
  wrap.style.display = 'block';
  ul.innerHTML = list.map((x, i) => {
    const pct = sumS ? ((Number(x.saldo || 0) / sumS) * 100).toFixed(1) : '0';
    return `<div class="div-preview-item"><span class="div-preview-name">${x.nama} <span style="color:var(--text-muted)">(${pct}%)</span></span><span class="div-preview-val">${fmtRp(bags[i])}</span></div>`;
  }).join('');
}

/* ── Dividen: Bagikan ────────────────────────────────────────── */
async function doBagikanDiv() {
  const total   = parseN(g('inp-rev').value);
  const catatan = (g('inp-rev-catatan').value || '').trim();
  if (!total) { toast('Isi nominal dulu', 'err'); return; }
  const list = getNasabah();
  const sumS = list.reduce((s, x) => s + Number(x.saldo || 0), 0);
  if (!sumS) { toast('Total saldo 0', 'err'); return; }
  if (!confirm(`Bagikan dividen ${fmtRp(total)} ke ${list.length} nasabah secara proporsional?`)) return;
  const bags = allocProp(total, list);
  const ts   = Date.now();
  state.nasabah = list.map((x, i) => {
    if (!bags[i]) return x;
    return { ...x, dividen: Number(x.dividen || 0) + bags[i], history: [...(x.history || []), { ts, type: 'dividen', amount: bags[i], note: catatan || 'Pembagian dividen' }] };
  });
  g('inp-rev').value = ''; g('inp-rev-catatan').value = '';
  g('div-preview').style.display = 'none';
  await saveState(`Dividen ${fmtRp(total)} berhasil dibagikan`);
  renderTblDividen();
}

/* ── Dividen: Edit per nasabah ───────────────────────────────── */
function updateDivCurrent() {
  const id = g('sel-div-edit')?.value;
  const el = g('div-current-val');
  if (!el) return;
  const n = findN(id);
  el.textContent = n ? fmtRp(n.dividen || 0) : 'Rp 0';
}

async function doSimpanDivEdit() {
  const id      = g('sel-div-edit').value;
  const jumlah  = parseN(g('inp-div-nominal').value);
  const aksi    = g('sel-div-aksi').value;
  const catatan = (g('inp-div-catatan').value || '').trim();
  if (!id || !jumlah) { toast('Pilih nasabah dan isi nominal', 'err'); return; }
  const idx = findIdx(id);
  if (idx < 0) { toast('Nasabah tidak ditemukan', 'err'); return; }
  const n = { ...state.nasabah[idx] };
  const curDiv = Number(n.dividen || 0);
  if (aksi === 'kurangi' && jumlah > curDiv) { toast(`Melebihi dividen saat ini (${fmtRp(curDiv)})`, 'err'); return; }
  const delta = aksi === 'tambah' ? jumlah : -jumlah;
  const ts = Date.now();
  n.dividen = Math.max(0, curDiv + delta);
  n.history = [...(n.history || []), { ts, type: 'dividen', amount: jumlah, note: catatan || (aksi === 'tambah' ? 'Penambahan dividen' : 'Penarikan dividen') }];
  state.nasabah[idx] = n;
  ['inp-div-nominal', 'inp-div-catatan'].forEach(id => { if (g(id)) g(id).value = ''; });
  await saveState(`Dividen ${n.nama} diperbarui`);
  updateDivCurrent();
  renderTblDividen();
  if (g('sel-riw').value === id) renderRiwayat(id);
}

/* ── Tabel Dividen ───────────────────────────────────────────── */
function renderTblDividen() {
  const tbody = g('tbl-dividen')?.querySelector('tbody');
  if (!tbody) return;
  const list = getNasabah();
  const sumS = list.reduce((s, x) => s + Number(x.saldo || 0), 0);
  tbody.innerHTML = list.map(x => {
    const pct = sumS ? ((Number(x.saldo || 0) / sumS) * 100).toFixed(1) : '0.0';
    return `<tr>
      <td><strong>${x.nama}</strong></td>
      <td>${fmtRp(x.saldo || 0)}</td>
      <td>${Number(x.dividen) > 0 ? `<span class="tbl-badge-div tbl-badge">${fmtRp(x.dividen)}</span>` : '—'}</td>
      <td>${pct}%</td>
    </tr>`;
  }).join('') || '<tr><td colspan="4" class="empty-state">Belum ada nasabah</td></tr>';
}

/* ── Riwayat ─────────────────────────────────────────────────── */
function renderRiwayat(id) {
  const tbody = g('tbl-riw')?.querySelector('tbody');
  const empty = g('riw-empty');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (empty) empty.style.display = 'none';
  const n = findN(id);
  if (!n) { if (empty) empty.style.display = 'block'; return; }
  const list = Array.isArray(n.history) ? n.history : [];
  if (!list.length) { if (empty) empty.style.display = 'block'; return; }
  const sorted = list.map((x, i) => ({ ...x, _i: i })).sort((a, b) => (b.ts || 0) - (a.ts || 0));
  tbody.innerHTML = sorted.map((it, row) => {
    const d = new Date(it.ts || Date.now());
    const tgl = d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    const type = (it.type || 'koreksi').toLowerCase();
    const badgeClass = type === 'tambah' ? 'tbl-badge-add' : type === 'tarik' ? 'tbl-badge-tarik' : type === 'dividen' ? 'tbl-badge-div' : 'tbl-badge-kor';
    const label = type === 'tambah' ? 'Setoran' : type === 'tarik' ? 'Penarikan' : type === 'dividen' ? 'Dividen' : 'Koreksi';
    return `<tr>
      <td style="color:var(--text-muted)">${row + 1}</td>
      <td style="white-space:nowrap">${tgl}</td>
      <td><span class="tbl-badge ${badgeClass}">${label}</span></td>
      <td>${fmtRp(it.amount || 0)}</td>
      <td>${it.note || '—'}</td>
      <td><button class="btn-danger-sm" data-del="${it._i}" data-id="${n.id}">Hapus</button></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('button[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Hapus catatan ini? (Saldo tidak berubah)')) return;
      const i = parseInt(btn.dataset.del, 10);
      const nid = btn.dataset.id;
      const nidx = findIdx(nid);
      if (nidx < 0) return;
      const copy = { ...state.nasabah[nidx] };
      copy.history = (copy.history || []).filter((_, k) => k !== i);
      state.nasabah[nidx] = copy;
      await saveState('Riwayat dihapus');
      renderRiwayat(nid);
    });
  });
}

/* ================================================================
   PUBLIC VIEW
   ================================================================ */
async function initPublic(id) {
  // Setup fee toggle
  const feeToggle = g('fee-toggle');
  const feeDetail = g('fee-detail');
  const feeIcon   = g('fee-icon');
  if (feeToggle) {
    feeToggle.addEventListener('click', () => {
      const open = feeDetail.style.display !== 'none';
      feeDetail.style.display = open ? 'none' : 'block';
      feeIcon.textContent = open ? '▾' : '▴';
    });
  }

  maskInput(g('pub-amount'));

  try {
    const nas = await apiPublic(id);
    nas.history = Array.isArray(nas.history) ? nas.history : [];
    nas.lots    = Array.isArray(nas.lots)    ? nas.lots    : [];
    nas.dividen = Number(nas.dividen || 0);
    ensureLots(nas);
    renderPublic(nas);
  } catch (e) {
    show('page-notfound');
  }
}

function renderPublic(nas) {
  const saldo   = Number(nas.saldo  || 0);
  const dividen = Number(nas.dividen || 0);
  const hist    = nas.history;
  const free    = freeAmount(nas);

  // Hero
  g('pub-name').textContent  = nas.nama;
  g('pub-saldo').textContent = fmtRp(saldo);

  // Tanggal bergabung — oldest history
  if (hist.length > 0) {
    const oldest = Math.min(...hist.map(h => h.ts || Date.now()));
    g('pub-since').textContent = 'Bergabung sejak ' + new Date(oldest).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // Bonus/dividen bar
  if (dividen > 0) {
    g('pub-bonus-bar').style.display = 'flex';
    g('pub-bonus-label').textContent = `Kamu dapat bonus ${fmtRp(dividen)} dari Hepi yang belum kamu tarik`;
    g('btn-tarik-bonus').addEventListener('click', () => {
      const msg = `Halo Mas Hepi, saya *${nas.nama}* (ID: ${nas.id}) ingin *Tarik Bonus/Dividen* sebesar *${fmtRp(dividen)}*.\n(Link: ${origin}/?id=${encodeURIComponent(nas.id)})`;
      location.href = `https://wa.me/6285346861655?text=${encodeURIComponent(msg)}`;
    });
  }

  // Free note
  const freeNote = g('fee-free-note');
  if (freeNote) {
    if (free >= saldo && saldo > 0) {
      freeNote.textContent = '✅ Semua saldo sudah ≥30 hari — penarikan GRATIS!';
    } else if (free > 0) {
      freeNote.textContent = `✅ ${fmtRp(free)} sudah ≥30 hari (bisa tarik gratis sebagian)`;
    } else if (hist.length > 0) {
      const oldest   = Math.min(...hist.map(h => h.ts || Date.now()));
      const diffDays = Math.floor((Date.now() - oldest) / (1000 * 60 * 60 * 24));
      const sisa     = 30 - diffDays;
      if (sisa > 0) freeNote.textContent = `⏳ Gratis tarik dalam ${sisa} hari lagi`;
    }
  }

  // Fee calc on input
  const amtInput = g('pub-amount');
  const calcNote = g('fee-calc');
  amtInput.addEventListener('input', () => {
    const amt = parseN(amtInput.value);
    if (!amt) { calcNote.textContent = ''; return; }
    const effectiveSaldo = saldo === 0 ? dividen : saldo;
    const freeAmt = saldo === 0 ? dividen : free;
    const atasNonFree = Math.max(0, amt - freeAmt);
    const isFree = atasNonFree === 0;
    if (isFree) {
      calcNote.style.color = '#16a34a';
      calcNote.textContent = '✅ Gratis biaya penarikan';
    } else {
      const fee = getWithdrawFee(atasNonFree);
      calcNote.style.color = 'var(--blue)';
      calcNote.textContent = `Biaya: ${fmtRp(fee)} · Diterima: ${fmtRp(amt - fee)}`;
    }
  });

  // Tombol Tambah
  g('pub-btn-tambah').addEventListener('click', () => {
    const amt = parseN(amtInput.value);
    if (!amt) { alert('Isi nominal dulu'); return; }
    const msg = `Halo Mas Hepi, saya *${nas.nama}* (ID: ${nas.id}) ingin *Tambah Tabungan* sebesar *${fmtRp(amt)}*.\n(Link: ${origin}/?id=${encodeURIComponent(nas.id)})`;
    location.href = `https://wa.me/6285346861655?text=${encodeURIComponent(msg)}`;
  });

  // Tombol Tarik
  g('pub-btn-tarik').addEventListener('click', () => {
    const amt = parseN(amtInput.value);
    if (!amt) { alert('Isi nominal dulu'); return; }
    const effectiveSaldo = saldo === 0 ? dividen : saldo;
    if (amt > effectiveSaldo) { alert(`Nominal melebihi saldo yang tersedia (${fmtRp(effectiveSaldo)})`); return; }
    const freeAmt = saldo === 0 ? dividen : free;
    const atasNonFree = Math.max(0, amt - freeAmt);
    const fee = atasNonFree > 0 ? getWithdrawFee(atasNonFree) : 0;
    const feeInfo = fee > 0 ? `, biaya ${fmtRp(fee)}, diterima ${fmtRp(amt - fee)}` : ', GRATIS biaya';
    const msg = `Halo Mas Hepi, saya *${nas.nama}* (ID: ${nas.id}) ingin *Tarik Tabungan* sebesar *${fmtRp(amt)}*${feeInfo}.\n(Link: ${origin}/?id=${encodeURIComponent(nas.id)})`;
    location.href = `https://wa.me/6285346861655?text=${encodeURIComponent(msg)}`;
  });

  // Riwayat
  renderPublicHist(hist);
}

function renderPublicHist(hist) {
  const wrap  = g('pub-riw-list');
  const empty = g('pub-riw-empty');
  const count = g('pub-riw-count');
  if (!hist || !hist.length) {
    if (empty) empty.style.display = 'block';
    if (count) count.textContent = '0 transaksi';
    return;
  }
  if (empty) empty.style.display = 'none';
  if (count) count.textContent = hist.length + ' transaksi';
  const sorted = [...hist].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  wrap.innerHTML = sorted.map(it => {
    const d    = new Date(it.ts || Date.now());
    const tgl  = d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    const type = (it.type || 'koreksi').toLowerCase();
    const dotClass = type === 'tambah' ? 'riw-dot-add' : type === 'tarik' ? 'riw-dot-tarik' : type === 'dividen' ? 'riw-dot-div' : 'riw-dot-kor';
    const amtClass = type === 'tambah' ? 'riw-amount-add' : type === 'tarik' ? 'riw-amount-tarik' : type === 'dividen' ? 'riw-amount-div' : 'riw-amount-kor';
    const label    = type === 'tambah' ? 'Setoran' : type === 'tarik' ? 'Penarikan' : type === 'dividen' ? 'Dividen' : 'Koreksi';
    const sign     = type === 'tambah' ? '+' : type === 'tarik' ? '-' : type === 'dividen' ? '🎁' : '~';
    return `<div class="riw-item">
      <div class="riw-dot ${dotClass}"></div>
      <div class="riw-info">
        <div class="riw-type">${label}${it.note && it.note !== '-' ? ` — <span class="riw-note">${it.note}</span>` : ''}</div>
        <div class="riw-date">${tgl}</div>
      </div>
      <div class="riw-amount ${amtClass}">${sign} ${fmtRp(it.amount || 0)}</div>
    </div>`;
  }).join('');
}
