'use strict';
/* ================================================================
   HEPI TABUNGAN — app.js v4
   Routing: /?id=KODEID  atau  /?n=NamaNasabah  (sama seperti aslinya)
   ================================================================ */

/* ── Helpers ── */
const g  = id => document.getElementById(id);
const originURL = (location.origin || '').replace(/\/$/, '');
const qs    = new URLSearchParams(location.search);
const qId   = qs.get('id');
const qName = qs.get('n') || qs.get('name');

let state = { nasabah: [] };

/* ── Format ── */
const nfRp   = new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', maximumFractionDigits:0 });
const nfNum  = new Intl.NumberFormat('id-ID', { maximumFractionDigits:0 });
const fmt    = n => nfRp.format(Number(n) || 0);
const fmtNum = n => nfNum.format(Number(n) || 0);
const num    = v => Number((v || '').toString().replace(/[^\d]/g, '')) || 0;
const maskN  = id => { const x = g(id); if (!x) return; x.addEventListener('input', () => { x.value = fmtNum(num(x.value)); }); };

/* ── Auth ── */
function isLogged() { try { return localStorage.getItem('tabungan_logged') === '1'; } catch { return false; } }
function setLogged(v) { try { v ? localStorage.setItem('tabungan_logged','1') : localStorage.removeItem('tabungan_logged'); } catch {} }

/* ── API ── */
async function apiGet() {
  const r = await fetch('/api/get'); const t = await r.text(); let j;
  try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(j.error || j.message || 'GET ' + r.status);
  return j;
}
async function apiPut(p) {
  const r = await fetch('/api/put', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(p) });
  const t = await r.text(); let j;
  try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(j.error || j.message || 'PUT ' + r.status);
  return j;
}
async function apiPublicById(id) {
  const r = await fetch('/api/public?id=' + encodeURIComponent(id));
  const j = await r.json();
  if (!r.ok || !j.found) throw new Error(j.message || 'Nasabah tidak ditemukan');
  return j.nasabah;
}
async function apiPublicByName(n) {
  const r = await fetch('/api/public?name=' + encodeURIComponent(n));
  const j = await r.json();
  if (!r.ok || !j.found) throw new Error(j.message || 'Nasabah tidak ditemukan');
  return j.nasabah;
}

/* ── Lots & Free ── */
const ONE_MONTH = 30 * 24 * 3600 * 1000;
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const genId = (taken = []) => { let s = ''; do { s = [...Array(6)].map(() => CHARS[Math.floor(Math.random() * CHARS.length)]).join(''); } while (taken.includes(s)); return s; };

function ensureLots(n) {
  n.history = Array.isArray(n.history) ? n.history : [];
  n.lots    = Array.isArray(n.lots)    ? n.lots    : [];
  if (typeof n.dividen !== 'number') n.dividen = 0;
  if (n.lots.length === 0 && Number(n.saldo || 0) > 0) {
    let lots = [];
    const sorted = [...n.history].sort((a, b) => (a.ts || 0) - (b.ts || 0));
    for (const h of sorted) {
      const amt = Number(h.amount || 0);
      if (h.type === 'tambah' && amt > 0) { lots.push({ ts: h.ts || Date.now(), amount: amt, remaining: amt }); }
      else if (h.type === 'tarik' && amt > 0) { let need = amt; for (const l of lots) { if (!need) break; const t = Math.min(l.remaining, need); l.remaining -= t; need -= t; } }
      else if (h.type === 'koreksi') {
        if (amt > 0) lots.push({ ts: h.ts || Date.now(), amount: amt, remaining: amt });
        else { let need = -amt; for (const l of lots) { if (!need) break; const t = Math.min(l.remaining, need); l.remaining -= t; need -= t; } }
      }
    }
    n.lots = lots.filter(l => l.remaining > 0);
    if (!n.lots.length) n.lots = [{ ts: Date.now(), amount: Number(n.saldo || 0), remaining: Number(n.saldo || 0) }];
  }
  return n;
}
const lotsAdd     = (lots, amount, ts) => [...lots, { ts, amount, remaining: amount }];
const lotsConsume = (lots, amount) => { let need = amount; for (const l of lots) { if (!need) break; const t = Math.min(l.remaining, need); l.remaining -= t; need -= t; } return lots.filter(l => l.remaining > 0); };
const freeAmount  = (n, now = Date.now()) => ensureLots(n).lots.reduce((s, l) => s + (now - (l.ts || 0) >= ONE_MONTH ? Number(l.remaining || 0) : 0), 0);

/* Tabel biaya penarikan */
function adminFee(amount) {
  const n = Number(amount || 0);
  if (n <= 0)        return 0;
  if (n <= 700000)   return 5000;
  if (n <= 2000000)  return 10000;
  if (n <= 3000000)  return 15000;
  if (n <= 5000000)  return 20000;
  if (n <= 7000000)  return 25000;
  return 30000;
}

/* ── Util ── */
function buildTs(d, t) {
  if (!d && !t) return Date.now();
  const [Y, M, D] = (d || '').split('-').map(v => parseInt(v, 10));
  const [h, m]    = (t || '').split(':').map(v => parseInt(v, 10));
  const now = new Date();
  return new Date(isFinite(Y)?Y:now.getFullYear(), isFinite(M)?M-1:now.getMonth(), isFinite(D)?D:now.getDate(), isFinite(h)?h:9, isFinite(m)?m:0, 0, 0).getTime();
}

/* ── Toast ── */
let _tt = null;
function toast(msg, type = 'ok') {
  const el = g('toast'); if (!el) return;
  el.textContent = msg; el.className = 'toast ' + type; el.style.display = 'block';
  clearTimeout(_tt); _tt = setTimeout(() => el.style.display = 'none', 3000);
}

/* ── Proportional allocation ── */
function allocProp(total, list) {
  const sum = list.reduce((s, n) => s + Number(n.saldo || 0), 0);
  if (!sum) return list.map(() => 0);
  const raw = list.map(n => (total * Number(n.saldo || 0)) / sum);
  const floors = raw.map(x => Math.floor(x));
  let rem = Math.round(total - floors.reduce((a, b) => a + b, 0));
  raw.map((x, i) => ({ i, f: x - Math.floor(x) })).sort((a, b) => b.f - a.f)
     .forEach((o, k) => { if (k < rem) floors[o.i]++; });
  return floors;
}

/* ================================================================
   ROUTING
   ================================================================ */
(async function boot() {
  if (qId || qName) {
    /* PUBLIC VIEW */
    showPage('page-public');
    try {
      let nas;
      if (qId)   nas = await apiPublicById(qId);
      else       nas = await apiPublicByName(qName);
      let allNasabah = [];
      try { const all = await apiGet(); allNasabah = all.nasabah || []; } catch {}
      initPublic(nas, allNasabah);
    } catch (e) {
      showPage('page-notfound');
    }
  } else {
    /* ADMIN */
    if (isLogged()) { showPage('page-admin'); initAdmin(); }
    else            { showPage('page-login'); initLogin(); }
  }
})();

function showPage(id) {
  ['page-login', 'page-admin', 'page-public', 'page-notfound'].forEach(p => {
    const el = g(p); if (el) el.style.display = 'none';
  });
  const el = g(id); if (el) el.style.display = 'block';
}

/* ================================================================
   LOGIN
   ================================================================ */
function initLogin() {
  g('btn-login')?.addEventListener('click', doLogin);
  g('l-pass')?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}
async function doLogin() {
  const u = (g('l-user')?.value || '').trim();
  const p = (g('l-pass')?.value || '').trim();
  const err = g('login-err');
  if (!u || !p) { if (err) err.textContent = 'Isi username & password.'; return; }
  if (err) err.textContent = '';
  try {
    const r = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ username:u, password:p }) });
    const j = await r.json();
    if (!r.ok || !j.ok) { if (err) err.textContent = j.message || 'Login gagal.'; return; }
    setLogged(true); showPage('page-admin'); initAdmin();
  } catch (e) { if (err) err.textContent = 'Error: ' + e.message; }
}

/* ================================================================
   ADMIN
   ================================================================ */
function initAdmin() {
  g('btn-logout')?.addEventListener('click', () => { setLogged(false); location.reload(); });

  /* Tabs */
  document.querySelectorAll('.tab[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  /* Mask inputs */
  ['n-saldo', 'inp-edit-nominal', 'inp-rev', 'inp-div-nominal'].forEach(maskN);

  /* Events */
  g('btn-tambah-nas')?.addEventListener('click', doTambahNasabah);
  g('btn-rename')?.addEventListener('click', doRename);
  g('btn-simpan-saldo')?.addEventListener('click', doSimpanSaldo);
  g('btn-preview-div')?.addEventListener('click', doPreviewDiv);
  g('btn-bagikan-div')?.addEventListener('click', doBagikanDiv);
  g('btn-simpan-div')?.addEventListener('click', doSimpanDivEdit);
  g('btn-muat-riw')?.addEventListener('click', () => renderRiwayat(g('sel-riw')?.value));
  g('sel-riw')?.addEventListener('change', e => renderRiwayat(e.target.value));
  g('sel-div-edit')?.addEventListener('change', updateDivCurrent);
  g('search-input')?.addEventListener('input', e => renderTblRingkasan(e.target.value));

  /* Saldo preview live */
  ['sel-edit-nas', 'inp-edit-nominal', 'sel-edit-aksi'].forEach(id => {
    const el = g(id); if (!el) return;
    el.addEventListener('input', updateSaldoPreview);
    el.addEventListener('change', updateSaldoPreview);
  });

  loadData();
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
  if (name === 'dividen') renderTblDividen();
}

/* ── Data ── */
async function loadData() {
  try {
    const data = await apiGet();
    if (!Array.isArray(data.nasabah)) data.nasabah = [];
    let changed = false; const taken = [];
    state.nasabah = data.nasabah.map(x => {
      const n = { ...x };
      if (!n.id) { n.id = genId(taken); changed = true; }
      taken.push(n.id);
      ensureLots(n);
      if (typeof n.dividen !== 'number') { n.dividen = 0; changed = true; }
      return n;
    });
    if (changed) { try { await apiPut(state); } catch {} }
    renderAll();
  } catch (e) {
    toast('Gagal memuat: ' + e.message, 'err');
  }
}
async function saveState(msg = 'Tersimpan') {
  try { await apiPut(state); toast(msg); renderAll(); }
  catch (e) { toast('Gagal: ' + e.message, 'err'); }
}

function renderAll() {
  renderStats(); renderTblRingkasan(g('search-input')?.value || '');
  renderTblNasabah(); renderSelects(); updateSaldoPreview(); updateDivCurrent(); renderTblDividen();
}
const getNas   = () => state.nasabah || [];
const findIdx  = id => getNas().findIndex(x => x.id === id);
const findN    = id => getNas().find(x => x.id === id);

/* ── Stats ── */
function renderStats() {
  const list   = getNas();
  const total  = list.reduce((s, x) => s + Number(x.saldo   || 0), 0);
  const divTot = list.reduce((s, x) => s + Number(x.dividen || 0), 0);
  g('st-nasabah').textContent = list.length;
  g('st-total').textContent   = fmt(total);
  g('st-dividen').textContent = fmt(divTot);
  g('st-rata').textContent    = fmt(list.length ? Math.round(total / list.length) : 0);
}

/* ── Tabel Ringkasan ── */
function renderTblRingkasan(q = '') {
  const tbody = g('tbody-ringkasan'); if (!tbody) return;
  const list = getNas().filter(x => !q || (x.nama || '').toLowerCase().includes(q.toLowerCase()));
  tbody.innerHTML = list.map(x => {
    const link = `${originURL}/?id=${encodeURIComponent(x.id)}`;
    return `<tr>
      <td><strong>${x.nama}</strong></td>
      <td>${fmt(x.saldo || 0)}</td>
      <td>${Number(x.dividen) > 0 ? `<span class="badge badge-div">${fmt(x.dividen)}</span>` : '—'}</td>
      <td>
        <div class="tbl-btn-wrap">
          <a class="tbl-btn tbl-btn-open" href="${link}" target="_blank" rel="noopener">Buka</a>
          <button class="tbl-btn tbl-btn-copy" data-id="${x.id}">📋 Salin</button>
        </div>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="4" class="empty-txt">Tidak ada nasabah</td></tr>';
  tbody.querySelectorAll('.tbl-btn-copy').forEach(b => b.addEventListener('click', () => copyInfo(b.dataset.id, b)));
}

/* ── Tabel Nasabah ── */
function renderTblNasabah() {
  const tbody = g('tbody-nasabah'); if (!tbody) return;
  tbody.innerHTML = getNas().map(x => {
    const link = `${originURL}/?id=${encodeURIComponent(x.id)}`;
    return `<tr>
      <td><strong>${x.nama}</strong></td>
      <td><code style="font-size:11px;color:var(--text-muted)">${x.id}</code></td>
      <td>${fmt(x.saldo || 0)}</td>
      <td>${Number(x.dividen) > 0 ? fmt(x.dividen) : '—'}</td>
      <td>
        <div class="tbl-btn-wrap">
          <a class="tbl-btn tbl-btn-open" href="${link}" target="_blank" rel="noopener">Buka</a>
          <button class="tbl-btn tbl-btn-copy" data-id="${x.id}">📋 Salin</button>
        </div>
      </td>
      <td><button class="btn-danger-sm" data-del="${x.id}">Hapus</button></td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="empty-txt">Belum ada nasabah</td></tr>';

  tbody.querySelectorAll('.tbl-btn-copy').forEach(b => b.addEventListener('click', () => copyInfo(b.dataset.id, b)));
  tbody.querySelectorAll('button[data-del]').forEach(b => {
    b.addEventListener('click', async () => {
      const n = findN(b.dataset.del); if (!n) return;
      if (!confirm(`Hapus nasabah "${n.nama}"? Tidak bisa dibatalkan.`)) return;
      state.nasabah = state.nasabah.filter(x => x.id !== n.id);
      await saveState(`"${n.nama}" dihapus`);
    });
  });
}

/* ── Copy Info ── */
async function copyInfo(id, btn) {
  const n = findN(id); if (!n) return;
  const link = `${originURL}/?id=${encodeURIComponent(n.id)}`;
  const text = `Nama: ${n.nama}\nSaldo: ${fmt(n.saldo || 0)}\nLink: ${link}`;
  try {
    await navigator.clipboard.writeText(text);
    const orig = btn.textContent; btn.textContent = '✓ Disalin!';
    setTimeout(() => btn.textContent = orig, 1500);
  } catch { prompt('Salin info ini:', text); }
}

/* ── Selects ── */
function renderSelects() {
  const opts = getNas().map(x => x.nama).sort((a, b) => a.localeCompare(b, 'id'))
    .map(nama => {
      const n = getNas().find(x => x.nama === nama);
      return `<option value="${n.id}">${n.nama}</option>`;
    }).join('');
  ['sel-edit-nas', 'sel-div-edit', 'sel-riw', 'sel-rename-lama'].forEach(id => {
    const el = g(id); if (el) el.innerHTML = opts;
  });
}

/* ── Tambah Nasabah ── */
async function doTambahNasabah() {
  const nama  = (g('n-nama')?.value || '').trim();
  const saldo = num(g('n-saldo')?.value);
  if (!nama) { toast('Nama wajib diisi', 'err'); return; }
  if (getNas().some(x => x.nama.toLowerCase() === nama.toLowerCase())) { toast('Nama sudah ada', 'err'); return; }
  const id  = genId(getNas().map(x => x.id));
  const now = Date.now();
  const hist = saldo > 0 ? [{ ts:now, type:'tambah', amount:saldo, note:'Setoran awal' }] : [];
  const lots = saldo > 0 ? [{ ts:now, amount:saldo, remaining:saldo }] : [];
  state.nasabah = [...state.nasabah, { id, nama, saldo, dividen:0, history:hist, lots }];
  g('n-nama').value = ''; g('n-saldo').value = '';
  await saveState(`"${nama}" berhasil ditambahkan`);
}

/* ── Rename ── */
async function doRename() {
  const id   = g('sel-rename-lama')?.value;
  const baru = (g('inp-rename-baru')?.value || '').trim();
  if (!id || !baru) { toast('Pilih nasabah & isi nama baru', 'err'); return; }
  if (getNas().some(x => x.id !== id && x.nama.toLowerCase() === baru.toLowerCase())) { toast('Nama sudah dipakai', 'err'); return; }
  const idx = findIdx(id); if (idx < 0) return;
  const lama = state.nasabah[idx].nama;
  state.nasabah[idx] = { ...state.nasabah[idx], nama: baru };
  g('inp-rename-baru').value = '';
  await saveState(`"${lama}" → "${baru}"`);
}

/* ── Saldo Preview ── */
function updateSaldoPreview() {
  const id = g('sel-edit-nas')?.value, jumlah = num(g('inp-edit-nominal')?.value), mode = g('sel-edit-aksi')?.value;
  const prev = g('saldo-preview'); if (!prev) return;
  if (!id || !jumlah) { prev.style.display = 'none'; return; }
  const n = findN(id); if (!n) { prev.style.display = 'none'; return; }
  const cur = Number(n.saldo || 0);
  const after = mode === 'tambah' ? cur + jumlah : mode === 'kurangi' ? Math.max(0, cur - jumlah) : jumlah;
  prev.style.display = 'flex'; prev.style.alignItems = 'center';
  g('prev-before').textContent = `Saldo saat ini: ${fmt(cur)}`;
  g('prev-after').textContent  = fmt(after);
}

/* ── Simpan Saldo ── */
async function doSimpanSaldo() {
  const id = g('sel-edit-nas')?.value, jumlah = num(g('inp-edit-nominal')?.value);
  const mode = g('sel-edit-aksi')?.value, note = (g('inp-edit-catatan')?.value || '').trim();
  const ts = buildTs(g('inp-edit-tgl')?.value, g('inp-edit-jam')?.value);
  if (!id || !jumlah) { toast('Pilih nasabah & isi nominal', 'err'); return; }
  const idx = findIdx(id); if (idx < 0) { toast('Nasabah tidak ditemukan', 'err'); return; }
  const n = { ...state.nasabah[idx], history:[...(state.nasabah[idx].history||[])], lots:[...(state.nasabah[idx].lots||[])] };
  ensureLots(n);
  const cur = Number(n.saldo || 0); let delta, type;
  if (mode === 'tambah')   { delta = jumlah;  type = 'tambah';  n.lots = lotsAdd(n.lots, jumlah, ts); }
  else if (mode === 'kurangi') {
    if (jumlah > cur) { toast(`Tarik (${fmt(jumlah)}) melebihi saldo (${fmt(cur)})`, 'err'); return; }
    delta = -jumlah; type = 'tarik'; n.lots = lotsConsume(n.lots, jumlah);
  } else {
    delta = jumlah - cur; type = 'koreksi';
    if (delta >= 0) n.lots = lotsAdd(n.lots, delta, ts);
    else            n.lots = lotsConsume(n.lots, -delta);
  }
  n.saldo   = Math.max(0, cur + delta);
  n.history = [...n.history, { ts, type, amount:Math.abs(delta), note: note || (type==='tambah'?'Setoran':type==='tarik'?'Penarikan':'Koreksi') }];
  state.nasabah[idx] = n;
  ['inp-edit-nominal','inp-edit-catatan','inp-edit-tgl','inp-edit-jam'].forEach(id => { if (g(id)) g(id).value = ''; });
  if (g('saldo-preview')) g('saldo-preview').style.display = 'none';
  await saveState(`Saldo ${n.nama} diperbarui`);
  if (g('sel-riw')?.value === id) renderRiwayat(id);
}

/* ── Dividen Preview ── */
function doPreviewDiv() {
  const total = num(g('inp-rev')?.value); if (!total) { toast('Isi nominal dulu', 'err'); return; }
  const list  = getNas(), sumS = list.reduce((s, x) => s + Number(x.saldo || 0), 0);
  if (!sumS) { toast('Total saldo 0', 'err'); return; }
  const bags  = allocProp(total, list);
  g('div-preview').style.display = 'block';
  g('div-preview-list').innerHTML = list.map((x, i) => {
    const pct = sumS ? ((Number(x.saldo||0)/sumS)*100).toFixed(1) : '0';
    return `<div class="div-preview-item"><span class="div-preview-name">${x.nama} <span style="color:var(--text-muted)">(${pct}%)</span></span><span class="div-preview-val">${fmt(bags[i])}</span></div>`;
  }).join('');
}

/* ── Bagikan Dividen ── */
async function doBagikanDiv() {
  const total = num(g('inp-rev')?.value), cat = (g('inp-rev-cat')?.value||'').trim();
  if (!total) { toast('Isi nominal dulu', 'err'); return; }
  const list = getNas(), sumS = list.reduce((s, x) => s + Number(x.saldo||0), 0);
  if (!sumS) { toast('Total saldo 0', 'err'); return; }
  if (!confirm(`Bagikan dividen ${fmt(total)} ke ${list.length} nasabah?`)) return;
  const bags = allocProp(total, list); const ts = Date.now();
  state.nasabah = list.map((x, i) => {
    if (!bags[i]) return x;
    return { ...x, dividen: Number(x.dividen||0)+bags[i], history:[...(x.history||[]),{ts,type:'dividen',amount:bags[i],note:cat||'Pembagian dividen'}] };
  });
  g('inp-rev').value=''; g('inp-rev-cat').value=''; g('div-preview').style.display='none';
  await saveState(`Dividen ${fmt(total)} dibagikan`);
  renderTblDividen();
}

/* ── Dividen Edit ── */
function updateDivCurrent() {
  const n = findN(g('sel-div-edit')?.value);
  const el = g('div-current-val'); if (el) el.textContent = n ? fmt(n.dividen||0) : 'Rp 0';
}
async function doSimpanDivEdit() {
  const id = g('sel-div-edit')?.value, jumlah = num(g('inp-div-nominal')?.value);
  const mode = g('sel-div-aksi')?.value, cat = (g('inp-div-cat')?.value||'').trim();
  if (!id || !jumlah) { toast('Pilih nasabah & isi nominal', 'err'); return; }
  const idx = findIdx(id); if (idx < 0) return;
  const n = { ...state.nasabah[idx] };
  const cur = Number(n.dividen||0);
  if (mode === 'kurangi' && jumlah > cur) { toast(`Melebihi dividen (${fmt(cur)})`, 'err'); return; }
  n.dividen = Math.max(0, cur + (mode==='tambah'?jumlah:-jumlah));
  n.history  = [...(n.history||[]), { ts:Date.now(), type:'dividen', amount:jumlah, note:cat||(mode==='tambah'?'Tambah dividen':'Tarik dividen') }];
  state.nasabah[idx] = n;
  g('inp-div-nominal').value=''; g('inp-div-cat').value='';
  await saveState(`Dividen ${n.nama} diperbarui`); updateDivCurrent(); renderTblDividen();
}

/* ── Tabel Dividen ── */
function renderTblDividen() {
  const tbody = g('tbody-dividen'); if (!tbody) return;
  const list = getNas(), sumS = list.reduce((s, x) => s+Number(x.saldo||0), 0);
  tbody.innerHTML = list.map(x => {
    const pct = sumS ? ((Number(x.saldo||0)/sumS)*100).toFixed(1) : '0.0';
    return `<tr><td><strong>${x.nama}</strong></td><td>${fmt(x.saldo||0)}</td><td>${Number(x.dividen)>0?`<span class="badge badge-div">${fmt(x.dividen)}</span>`:'—'}</td><td>${pct}%</td></tr>`;
  }).join('') || '<tr><td colspan="4" class="empty-txt">Belum ada nasabah</td></tr>';
}

/* ── Riwayat Admin ── */
function renderRiwayat(id) {
  const tbody = g('tbody-riw'), empty = g('riw-empty'); if (!tbody) return;
  tbody.innerHTML=''; if (empty) empty.style.display='none';
  const n = findN(id); if (!n) { if(empty) empty.style.display='block'; return; }
  const list = Array.isArray(n.history) ? n.history : [];
  if (!list.length) { if(empty) empty.style.display='block'; return; }
  const sorted = list.map((x,i)=>({...x,_i:i})).sort((a,b)=>(b.ts||0)-(a.ts||0));
  tbody.innerHTML = sorted.map((it,row)=>{
    const d=new Date(it.ts||Date.now());
    const tgl=d.toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'});
    const type=(it.type||'koreksi').toLowerCase();
    const badge=type==='tambah'?'badge-add':type==='tarik'?'badge-tarik':type==='dividen'?'badge-div':'badge-kor';
    const label=type==='tambah'?'Setoran':type==='tarik'?'Penarikan':type==='dividen'?'Dividen':'Koreksi';
    return `<tr><td style="color:var(--text-muted)">${row+1}</td><td style="white-space:nowrap">${tgl}</td><td><span class="badge ${badge}">${label}</span></td><td>${fmt(it.amount||0)}</td><td>${it.note||'—'}</td><td><button class="btn-danger-sm" data-del="${it._i}" data-id="${n.id}">Hapus</button></td></tr>`;
  }).join('');
  tbody.querySelectorAll('button[data-del]').forEach(b=>{
    b.addEventListener('click', async ()=>{
      if(!confirm('Hapus catatan? (Saldo tidak berubah)')) return;
      const i=parseInt(b.dataset.del,10), nid=b.dataset.id;
      const nidx=findIdx(nid); if(nidx<0) return;
      const copy={...state.nasabah[nidx]};
      copy.history=(copy.history||[]).filter((_,k)=>k!==i);
      state.nasabah[nidx]=copy;
      try { await apiPut(state); toast('Riwayat dihapus'); renderRiwayat(nid); } catch(e){ toast(e.message,'err'); }
    });
  });
}

/* ================================================================
   PUBLIC VIEW
   ================================================================ */
function initPublic(nas, allNasabah) {
  ensureLots(nas);
  const saldo  = Number(nas.saldo   || 0);
  const dividen= Number(nas.dividen || 0);
  const hist   = nas.history || [];
  const free   = freeAmount(nas);

  /* Hero */
  g('pub-nama').textContent  = nas.nama;
  g('pub-saldo').textContent = fmt(saldo);
  g('pub-free').textContent  = fmt(free);
  g('pub-dividen').textContent = fmt(dividen);

  /* Bergabung sejak */
  if (hist.length) {
    const oldest = Math.min(...hist.map(h => h.ts || Date.now()));
    g('pub-since').textContent = 'Bergabung sejak ' + new Date(oldest).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
  }

  /* Bonus bar */
  if (dividen > 0) {
    g('pub-bonus-bar').style.display = 'flex';
    g('pub-bonus-text').innerHTML = `Kamu dapat bonus <strong>${fmt(dividen)}</strong> dari Hepi yang belum kamu tarik`;
    g('btn-tarik-bonus')?.addEventListener('click', () => {
      const msg = `Halo Mas Hepi, saya *${nas.nama}* ingin *Tarik Bonus/Dividen* sebesar *${fmt(dividen)}*.\n(Link: ${originURL}/?id=${encodeURIComponent(nas.id)})`;
      location.href = `https://wa.me/6285346861655?text=${encodeURIComponent(msg)}`;
    });
  }

  /* Fee toggle */
  g('fee-toggle')?.addEventListener('click', () => {
    const open = g('fee-detail').style.display !== 'none';
    g('fee-detail').style.display = open ? 'none' : 'block';
    g('fee-icon').textContent = open ? '▾' : '▴';
  });

  /* Free note */
  const fn = g('fee-free-note');
  if (fn) {
    if (free >= saldo && saldo > 0) fn.textContent = '✅ Semua saldo ≥30 hari — penarikan GRATIS!';
    else if (free > 0) fn.textContent = `✅ ${fmt(free)} sudah ≥30 hari, bisa tarik gratis sebagian`;
    else if (hist.length) {
      const oldest = Math.min(...hist.map(h => h.ts || Date.now()));
      const sisa   = 30 - Math.floor((Date.now()-oldest)/(1000*60*60*24));
      if (sisa > 0) fn.textContent = `⏳ Gratis tarik dalam ${sisa} hari lagi`;
    }
  }

  /* Input & fee calc */
  const amtEl = g('pub-amount');
  const calcEl= g('fee-calc-note');
  amtEl?.addEventListener('input', () => {
    amtEl.value = fmtNum(num(amtEl.value));
    const amt = num(amtEl.value); if (!calcEl) return;
    if (!amt) { calcEl.textContent=''; return; }
    const effectiveSaldo = saldo === 0 ? dividen : saldo;
    const over = Math.max(0, Math.min(amt, effectiveSaldo) - free);
    const fee  = over > 0 ? adminFee(over) : 0;
    if (fee === 0) { calcEl.style.color='var(--green)'; calcEl.textContent='✅ Gratis biaya penarikan'; }
    else           { calcEl.style.color='var(--text-muted)'; calcEl.textContent=`Biaya: ${fmt(fee)} · Diterima: ${fmt(amt-fee)}`; }
  });

  /* Tombol Tambah */
  g('pub-btn-tambah')?.addEventListener('click', () => {
    const amt = num(amtEl?.value); if (!amt) { alert('Isi nominal dulu'); return; }
    const msg = `Halo Mas Hepi, saya *${nas.nama}* ingin *Tambah Tabungan* sebesar *${fmt(amt)}*.\n(Link: ${originURL}/?id=${encodeURIComponent(nas.id)})`;
    location.href = `https://wa.me/6285346861655?text=${encodeURIComponent(msg)}`;
  });

  /* Tombol Tarik */
  g('pub-btn-tarik')?.addEventListener('click', () => {
    const amt = num(amtEl?.value); if (!amt) { alert('Isi nominal dulu'); return; }
    const effectiveSaldo = saldo === 0 ? dividen : saldo;
    if (amt > effectiveSaldo) { alert(`Nominal melebihi saldo (${fmt(effectiveSaldo)})`); return; }
    const over = Math.max(0, Math.min(amt, effectiveSaldo) - free);
    const fee  = over > 0 ? adminFee(over) : 0;
    const info = fee > 0 ? `, biaya ${fmt(fee)}, diterima ${fmt(amt-fee)}` : ', GRATIS biaya';
    const msg  = `Halo Mas Hepi, saya *${nas.nama}* ingin *Tarik Tabungan* sebesar *${fmt(amt)}*${info}.\n(Link: ${originURL}/?id=${encodeURIComponent(nas.id)})`;
    location.href = `https://wa.me/6285346861655?text=${encodeURIComponent(msg)}`;
  });

  /* Riwayat */
  renderPublicRiw(hist);
}

function renderPublicRiw(hist) {
  const wrap  = g('pub-riw-list'), empty = g('pub-riw-empty'), count = g('pub-riw-count');
  if (!hist || !hist.length) { if(empty) empty.style.display='block'; if(count) count.textContent='0 transaksi'; return; }
  if (empty) empty.style.display='none';
  if (count) count.textContent = hist.length + ' transaksi';
  const sorted = [...hist].sort((a,b)=>(b.ts||0)-(a.ts||0));
  wrap.innerHTML = sorted.map(it => {
    const d   = new Date(it.ts || Date.now());
    const tgl = d.toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'});
    const type= (it.type || 'koreksi').toLowerCase();
    const dotCls= type==='tambah'?'riw-dot-add':type==='tarik'?'riw-dot-tarik':type==='dividen'?'riw-dot-div':'riw-dot-kor';
    const amtCls= type==='tambah'?'riw-amount-add':type==='tarik'?'riw-amount-tarik':type==='dividen'?'riw-amount-div':'riw-amount-kor';
    const label = type==='tambah'?'Setoran':type==='tarik'?'Penarikan':type==='dividen'?'Dividen':'Koreksi';
    const sign  = type==='tambah'?'+':type==='tarik'?'-':type==='dividen'?'🎁':'~';
    return `<div class="riw-item">
      <div class="riw-dot ${dotCls}"></div>
      <div class="riw-info">
        <div class="riw-type">${label}${it.note&&it.note!=='-'?` — <span class="riw-note-txt">${it.note}</span>`:''}</div>
        <div class="riw-date">${tgl}</div>
      </div>
      <div class="riw-amount ${amtCls}">${sign} ${fmt(it.amount||0)}</div>
    </div>`;
  }).join('');
                                                                                      }
