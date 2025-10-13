const els = {
  topbar: document.getElementById('topbar'),
  // login & admin
  login: document.getElementById('login-section'),
  dash: document.getElementById('dashboard'),
  btnLogout: document.getElementById('btnLogout'),

  // numbers
  statNasabah: document.getElementById('statNasabah'),
  statSaldo: document.getElementById('statSaldo'),
  statRata: document.getElementById('statRata'),

  // tables
  tBody: document.querySelector('#tNasabah tbody'),

  // admin forms
  namaBaru: document.getElementById('namaBaru'),
  saldoBaru: document.getElementById('saldoBaru'),
  btnTambah: document.getElementById('btnTambah'),

  namaEditSel: document.getElementById('namaEditSel'),
  saldoEdit: document.getElementById('saldoEdit'),
  aksiEdit: document.getElementById('aksiEdit'),
  tglEdit: document.getElementById('tglEdit'),
  jamEdit: document.getElementById('jamEdit'),
  catatanEdit: document.getElementById('catatanEdit'),
  btnEdit: document.getElementById('btnEdit'),

  // history admin
  riwNama: document.getElementById('riwNama'),
  riwRefresh: document.getElementById('riwRefresh'),
  riwTableBody: document.querySelector('#riwTable tbody'),
  riwEmpty: document.getElementById('riwEmpty'),

  // rename
  oldNameSel: document.getElementById('oldNameSel'),
  newName: document.getElementById('newName'),
  btnRename: document.getElementById('btnRename'),

  btnLogin: document.getElementById('btnLogin'),
  loginMsg: document.getElementById('loginMsg'),
  msg: document.getElementById('msg'),

  // public view
  pv: document.getElementById('public-view'),
  pvTitle: document.getElementById('pv-title'),
  pvSaldo: document.getElementById('pv-saldo'),
  pvAmount: document.getElementById('pv-amount'),
  pvAdd: document.getElementById('pv-add'),
  pvWithdraw: document.getElementById('pv-withdraw'),
  pvHistory: document.querySelector('#pv-history tbody'),
  pvEmpty: document.getElementById('pv-empty'),
};

let state = { nasabah: [] };
const origin = (location.origin || '').replace(/\/$/,'');

// ====== formatter & parser ======
const fmt = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n)||0);
const fmtNum = n => new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(Number(n)||0);
const parseNum = s => Number((s||'').toString().replace(/[^\d]/g,'')) || 0;

// ribuan bertitik saat ketik
function maskThousands(el){
  el.addEventListener('input', ()=>{
    el.value = fmtNum(parseNum(el.value));
  });
}
['saldoBaru','saldoEdit','pv-amount'].forEach(id=>{
  const el = document.getElementById(id);
  if (el) maskThousands(el);
});

// ====== public vs admin ======
const params = new URLSearchParams(location.search);
const publicName = params.get('n');

if (publicName) {
  if (els.topbar) els.topbar.style.display = 'none';   // hilangkan nav di publik
  document.querySelectorAll('.tab').forEach(el => el.style.display = 'none');
  els.pv.style.display = 'block';
  loadPublic(publicName);
} else {
  renderGate();
}

// ====== API util ======
async function callGet(){
  const r = await fetch('/api/get');
  const t = await r.text(); let j; try{ j=JSON.parse(t); } catch{ j={raw:t}; }
  if(!r.ok) throw new Error(`GET ${r.status}: ${j.error||j.message||JSON.stringify(j)}`);
  return j;
}
async function callPut(payload){
  const r = await fetch('/api/put',{ method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  const t = await r.text(); let j; try{ j=JSON.parse(t); } catch{ j={raw:t}; }
  if(!r.ok) throw new Error(`PUT ${r.status}: ${j.error||j.message||JSON.stringify(j)}`);
  return j;
}
async function callPublic(name){
  const r = await fetch('/api/public?name=' + encodeURIComponent(name));
  const j = await r.json();
  if(!r.ok || !j.found) throw new Error(j.message || 'Nasabah tidak ditemukan');
  return j.nasabah;
}

// ====== auth gate ======
function isLogged(){ return localStorage.getItem('tabungan_logged') === '1'; }
function setLogged(v){ v ? localStorage.setItem('tabungan_logged','1') : localStorage.removeItem('tabungan_logged'); renderGate(); }
function renderGate(){
  const ok = isLogged();
  els.login.style.display = ok ? 'none' : 'block';
  els.dash.style.display  = ok ? 'block' : 'none';
  if (ok) loadData();
}

// ====== helpers ======
function refreshNameLists(){
  const names = (state.nasabah||[]).map(x=>x.nama).sort((a,b)=>a.localeCompare(b,'id'));
  const makeOptions = (sel) => { sel.innerHTML = names.map(n=>`<option value="${n}">${n}</option>`).join(''); };
  if (els.namaEditSel) makeOptions(els.namaEditSel);
  if (els.riwNama) makeOptions(els.riwNama);
  if (els.oldNameSel) makeOptions(els.oldNameSel);
}

function findNasabahIndexByName(name){
  return (state.nasabah||[]).findIndex(x => (x.nama||'').toLowerCase() === (name||'').toLowerCase());
}

// ====== render admin ======
function renderAdmin(){
  refreshNameLists();

  const list = state.nasabah || [];
  let total = 0; list.forEach(x=> total += Number(x.saldo||0));
  els.statNasabah.textContent = list.length;
  els.statSaldo.textContent   = fmt(total);
  els.statRata.textContent    = fmt(list.length ? Math.round(total/list.length) : 0);

  els.tBody.innerHTML = '';
  list.forEach(item=>{
    const tr = document.createElement('tr');
    const link = `${origin}/?n=${encodeURIComponent(item.nama)}`;
    tr.innerHTML = `
      <td>${item.nama}</td>
      <td>${fmt(item.saldo||0)}</td>
      <td>
        <button class="danger small" data-del="${item.nama}">Hapus</button>
      </td>
      <td>
        <a class="small chip" href="${link}" target="_blank" rel="noopener">Buka</a>
        <button class="small" data-copy="${link}">Salin</button>
      </td>
    `;
    els.tBody.appendChild(tr);
  });

  // actions
  els.tBody.querySelectorAll('button[data-del]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const nama = btn.getAttribute('data-del');
      if(!confirm(`Hapus nasabah "${nama}"?`)) return;
      state.nasabah = (state.nasabah||[]).filter(x=>x.nama !== nama);
      try{ await callPut(state); renderAdmin(); }
      catch(e){ alert(e.message); }
    });
  });
  els.tBody.querySelectorAll('button[data-copy]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const url = btn.getAttribute('data-copy');
      try{ await navigator.clipboard.writeText(url); btn.textContent='Disalin!'; setTimeout(()=>btn.textContent='Salin',1500); }
      catch{ prompt('Salin link ini:', url); }
    });
  });
}

async function loadData(){
  try{
    const data = await callGet();
    if (!Array.isArray(data.nasabah)) data.nasabah = [];
    data.nasabah = data.nasabah.map(x => ({ ...x, history: Array.isArray(x.history) ? x.history : [] }));
    state = data;
    renderAdmin();
    els.msg.textContent = '';
  }catch(e){
    els.msg.textContent = 'GET error → ' + e.message;
  }
}

// ====== public view ======
function renderPublicHistory(list){
  els.pvHistory.innerHTML = '';
  if (!Array.isArray(list) || list.length === 0){
    els.pvEmpty.style.display = 'block';
    return;
  }
  els.pvEmpty.style.display = 'none';
  const sorted = [...list].sort((a,b)=> (b.ts||0) - (a.ts||0));
  sorted.forEach(it=>{
    const tr = document.createElement('tr');
    const d = new Date(it.ts || Date.now());
    const tgl = d.toLocaleString('id-ID', { dateStyle:'medium', timeStyle:'short' });
    const jenis = (it.type || 'koreksi').toLowerCase();
    const cls = jenis === 'tambah' ? 'add' : jenis === 'tarik' ? 'withdraw' : 'koreksi';
    tr.innerHTML = `<td>${tgl}</td><td><span class="badge ${cls}">${jenis[0].toUpperCase()+jenis.slice(1)}</span></td><td>${fmt(it.amount||0)}</td><td>${it.note||'-'}</td>`;
    els.pvHistory.appendChild(tr);
  });
}
async function loadPublic(name){
  try{
    const nas = await callPublic(name);
    els.pvTitle.textContent = `Halo, ${nas.nama}`;
    els.pvSaldo.textContent = fmt(nas.saldo || 0);
    renderPublicHistory(nas.history || []);

    const wa = (type, amount) => {
      const nominal = parseNum(amount);
      const action = type === 'add' ? 'Tambah Tabungan' : 'Tarik Tabungan';
      const msg = `Halo Mas Hepi, saya *${nas.nama}* ingin *${action}* sebesar *${fmt(nominal)}*. (Link: ${origin}/?n=${encodeURIComponent(nas.nama)})`;
      return `https://wa.me/6285346861655?text=${encodeURIComponent(msg)}`;
    };

    els.pvAdd.addEventListener('click', ()=>{
      const n = parseNum(els.pvAmount.value);
      if(!n){ alert('Isi nominal dulu'); return; }
      location.href = wa('add', n);
    });
    els.pvWithdraw.addEventListener('click', ()=>{
      const n = parseNum(els.pvAmount.value);
      if(!n){ alert('Isi nominal dulu'); return; }
      if (n > Number(nas.saldo||0)) { // validasi publik
        alert('Nominal penarikan melebihi saldo Anda. Silakan kurangi nominal.');
        return;
      }
      location.href = wa('withdraw', n);
    });
  }catch(e){
    els.pv.style.display = 'block';
    els.pv.innerHTML = `<h2>Tautan tidak valid</h2><p class="muted">${e.message || 'Error'}</p>`;
  }
}

// ====== AUTH ======
document.getElementById('btnLogin')?.addEventListener('click', async ()=>{
  const username = document.getElementById('user').value.trim();
  const password = document.getElementById('pass').value.trim();
  try{
    const r = await fetch('/api/login',{ method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({username,password})});
    const j = await r.json();
    if(!r.ok || !j.ok){ els.loginMsg.textContent = j.message || 'Login gagal'; return; }
    setLogged(true);
  }catch(e){ els.loginMsg.textContent = 'Error login'; }
});
els.btnLogout?.addEventListener('click', ()=> setLogged(false));

// ====== ADMIN: tambah nasabah ======
els.btnTambah?.addEventListener('click', async ()=>{
  const nama  = (els.namaBaru.value||'').trim();
  const saldo = parseNum(els.saldoBaru.value);
  if(!nama){ alert('Nama wajib'); return; }
  const exists = (state.nasabah||[]).some(x => x.nama.toLowerCase() === nama.toLowerCase());
  if(exists){ alert('Nama sudah ada'); return; }
  const now = Date.now();
  const history = saldo > 0 ? [{ ts: now, type: 'tambah', amount: saldo, note: 'Setoran awal' }] : [];
  state.nasabah = [...(state.nasabah||[]), { nama, saldo, history }];
  try{ await callPut(state); els.namaBaru.value=''; els.saldoBaru.value=''; renderAdmin(); }
  catch(e){ alert(e.message); }
});

// ====== ADMIN: edit saldo ======
function buildCustomTs(dateStr, timeStr){
  if(!dateStr && !timeStr) return Date.now();
  const [Y,M,D] = (dateStr||'').split('-').map(x=>parseInt(x,10));
  const [h,m]   = (timeStr||'').split(':').map(x=>parseInt(x,10));
  const dt = new Date(
    isFinite(Y)?Y:new Date().getFullYear(),
    isFinite(M)?(M-1):new Date().getMonth(),
    isFinite(D)?D:new Date().getDate(),
    isFinite(h)?h:9, isFinite(m)?m:0, 0, 0
  );
  return dt.getTime();
}

els.btnEdit?.addEventListener('click', async ()=>{
  const nama = els.namaEditSel.value;
  let jumlah = parseNum(els.saldoEdit.value);
  const mode = els.aksiEdit.value;
  const note = (els.catatanEdit.value||'').trim();
  const ts   = buildCustomTs(els.tglEdit.value, els.jamEdit.value);

  if(!nama || !jumlah){ alert('Pilih nama & isi jumlah'); return; }
  const idx = findNasabahIndexByName(nama);
  if(idx<0){ alert('Nasabah tidak ditemukan'); return; }

  const list = [...state.nasabah];
  const curr = { ...list[idx] };
  curr.history = Array.isArray(curr.history) ? curr.history : [];

  let delta = jumlah;

  if(mode === 'kurangi'){
    // VALIDASI ADMIN: tidak boleh tarik > saldo
    if (jumlah > Number(curr.saldo||0)) {
      alert(`Penarikan (${fmt(jumlah)}) melebihi saldo (${fmt(curr.saldo||0)}). Tidak disetujui.`);
      return;
    }
    delta = -Math.abs(jumlah);
  }
  if(mode === 'koreksi'){
    delta = jumlah - Number(curr.saldo||0);
  }

  const newSaldo = Math.max(0, Number(curr.saldo||0) + delta);
  const entry = {
    ts,
    type: mode === 'koreksi' ? 'koreksi' : (delta >= 0 ? 'tambah' : 'tarik'),
    amount: Math.abs(delta),
    note: note || (mode==='koreksi' ? 'Penyesuaian saldo' : (delta>=0?'Setoran':'Penarikan'))
  };

  curr.saldo = newSaldo;
  curr.history = [...curr.history, entry];
  list[idx] = curr;
  state.nasabah = list;

  try{
    await callPut(state);
    els.saldoEdit.value=''; els.catatanEdit.value=''; els.tglEdit.value=''; els.jamEdit.value='';
    renderAdmin();
    renderHistoryAdmin(els.riwNama.value); // sinkron jika panel riwayat terbuka
  }catch(e){ alert(e.message); }
});

// ====== ADMIN: kelola riwayat ======
function renderHistoryAdmin(name){
  const idx = findNasabahIndexByName(name);
  els.riwTableBody.innerHTML = '';
  if (idx < 0){ els.riwEmpty.style.display='block'; return; }

  const nas = state.nasabah[idx];
  const list = Array.isArray(nas.history) ? nas.history : [];
  if (list.length === 0){ els.riwEmpty.style.display='block'; return; }

  els.riwEmpty.style.display='none';
  const sorted = list.map((x,i)=>({ ...x, _i:i })).sort((a,b)=>(b.ts||0)-(a.ts||0));
  sorted.forEach((it,row)=>{
    const d = new Date(it.ts||Date.now());
    const tgl = d.toLocaleString('id-ID',{ dateStyle:'medium', timeStyle:'short' });
    const jenis = (it.type||'koreksi').toLowerCase();
    const cls = jenis==='tambah'?'add':jenis==='tarik'?'withdraw':'koreksi';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row+1}</td>
      <td>${tgl}</td>
      <td><span class="badge ${cls}">${jenis[0].toUpperCase()+jenis.slice(1)}</span></td>
      <td>${fmt(it.amount||0)}</td>
      <td>${it.note||'-'}</td>
      <td><button class="danger small" data-del-idx="${it._i}" data-name="${nas.nama}">Hapus</button></td>
    `;
    els.riwTableBody.appendChild(tr);
  });

  // aksi hapus
  els.riwTableBody.querySelectorAll('button[data-del-idx]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const i = parseInt(btn.getAttribute('data-del-idx'),10);
      const nama = btn.getAttribute('data-name');
      const nidx = findNasabahIndexByName(nama);
      if (nidx<0) return;
      if (!confirm('Hapus catatan ini? (Saldo tidak berubah)')) return;
      const copy = {...state.nasabah[nidx]};
      copy.history = (copy.history||[]).filter((_,k)=>k!==i);
      state.nasabah[nidx] = copy;
      try{ await callPut(state); renderHistoryAdmin(nama); }
      catch(e){ alert(e.message); }
    });
  });
}

els.riwRefresh?.addEventListener('click', ()=> renderHistoryAdmin(els.riwNama.value));
els.riwNama?.addEventListener('change', ()=> renderHistoryAdmin(els.riwNama.value));

// ====== ADMIN: rename nasabah ======
els.btnRename?.addEventListener('click', async ()=>{
  const oldN = els.oldNameSel.value;
  const newN = (els.newName.value||'').trim();
  if (!oldN || !newN){ alert('Pilih nama lama dan isi nama baru'); return; }
  if (findNasabahIndexByName(newN) >= 0){ alert('Nama baru sudah dipakai'); return; }
  const idx = findNasabahIndexByName(oldN);
  if (idx < 0){ alert('Nasabah tidak ditemukan'); return; }
  state.nasabah[idx] = { ...state.nasabah[idx], nama: newN };
  try{
    await callPut(state);
    els.newName.value='';
    renderAdmin();
    renderHistoryAdmin(els.riwNama.value);
    alert('Nama berhasil diubah');
  }catch(e){ alert(e.message); }
});

// ====== END PUBLIC/ADMIN ======
