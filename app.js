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
  pvFree: document.getElementById('pv-free'),
  pvLocked: document.getElementById('pv-locked'),
  pvAmount: document.getElementById('pv-amount'),
  pvAdd: document.getElementById('pv-add'),
  pvWithdraw: document.getElementById('pv-withdraw'),
  pvHistory: document.querySelector('#pv-history tbody'),
  pvEmpty: document.getElementById('pv-empty'),
  pvFee: document.getElementById('pv-fee'),
};

let state = { nasabah: [] };
const origin = (location.origin || '').replace(/\/$/,'');
const ONE_MONTH_MS = 30 * 24 * 3600 * 1000;

// ====== formatter & parser ======
const fmt = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n)||0);
const fmtNum = n => new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(Number(n)||0);
const parseNum = s => Number((s||'').toString().replace(/[^\d]/g,'')) || 0;

// ribuan bertitik saat ketik
function maskThousands(el){ el.addEventListener('input', ()=>{ el.value = fmtNum(parseNum(el.value)); }); }
['saldoBaru','saldoEdit','pv-amount'].forEach(id=>{ const el=document.getElementById(id); if(el) maskThousands(el); });

// ====== helpers ======
const genId = (exist=[])=>{
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa 0/O/1/I
  let s=''; do{
    s=[...Array(6)].map(()=>chars[Math.floor(Math.random()*chars.length)]).join('');
  } while(exist.includes(s));
  return s;
};

// FIFO lots
function ensureLots(nas){
  nas.history = Array.isArray(nas.history)?nas.history:[];
  nas.lots = Array.isArray(nas.lots)?nas.lots:[];
  if (nas.lots.length === 0) {
    // bangun dari history (ascending)
    let lots=[];
    const sorted=[...nas.history].sort((a,b)=>(a.ts||0)-(b.ts||0));
    for (const h of sorted){
      const amt = Number(h.amount||0);
      if (h.type==='tambah' && amt>0){
        lots.push({ ts:h.ts||Date.now(), amount:amt, remaining:amt });
      }else if (h.type==='tarik' && amt>0){
        let need=amt;
        for (const lot of lots){
          if (need<=0) break;
          const take=Math.min(lot.remaining, need);
          lot.remaining-=take; need-=take;
        }
      }else if (h.type==='koreksi'){
        if (amt>0){ lots.push({ ts:h.ts||Date.now(), amount:amt, remaining:amt }); }
        else if (amt<0){
          let need=-amt;
          for (const lot of lots){
            if (need<=0) break;
            const take=Math.min(lot.remaining, need);
            lot.remaining-=take; need-=take;
          }
        }
      }
    }
    // bersihkan 0
    nas.lots = lots.filter(l=>l.remaining>0);
    // fallback jika tetap kosong tapi saldo > 0
    if (nas.lots.length===0 && Number(nas.saldo||0)>0){
      nas.lots=[{ ts: Date.now(), amount: Number(nas.saldo||0), remaining: Number(nas.saldo||0) }];
    }
  }
  return nas;
}

function lotsConsume(lots, amount){
  let need=amount;
  for (const lot of lots){
    if (need<=0) break;
    const take=Math.min(lot.remaining, need);
    lot.remaining-=take; need-=take;
  }
  return lots.filter(l=>l.remaining>0);
}

function lotsAdd(lots, amount, ts){ lots.push({ ts, amount, remaining: amount }); return lots; }

function freeAmount(nas, now=Date.now()){
  ensureLots(nas);
  return nas.lots.reduce((sum,l)=> sum + (now - (l.ts||0) >= ONE_MONTH_MS ? Number(l.remaining||0) : 0), 0);
}
function lockedAmount(nas, now=Date.now()){
  ensureLots(nas);
  return nas.lots.reduce((sum,l)=> sum + (now - (l.ts||0) < ONE_MONTH_MS ? Number(l.remaining||0) : 0), 0);
}

// biaya admin untuk nominal x (yang belum 30 hari)
function adminFee(x){
  const n = Number(x||0);
  if (n <= 0) return 0;
  if (n < 350_000) return 3_000;
  if (n < 600_000) return 5_000;
  if (n < 800_000) return 7_000;
  if (n < 2_000_000) return 10_000;
  if (n < 5_500_000) return 20_000;
  if (n < 6_500_000) return 25_000;
  if (n < 15_000_000) return 30_000;
  const extra = n - 15_000_000;
  const blocks = Math.ceil(extra / 1_000_000);
  return 30_000 + blocks * 2_000;
}

// ====== API util ======
async function callGet(){ const r=await fetch('/api/get'); const t=await r.text(); let j; try{ j=JSON.parse(t);}catch{j={raw:t}}; if(!r.ok) throw new Error(`GET ${r.status}: ${j.error||j.message||JSON.stringify(j)}`); return j; }
async function callPut(payload){ const r=await fetch('/api/put',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); const t=await r.text(); let j; try{ j=JSON.parse(t);}catch{j={raw:t}}; if(!r.ok) throw new Error(`PUT ${r.status}: ${j.error||j.message||JSON.stringify(j)}`); return j; }
async function callPublicById(id){ const r=await fetch('/api/public?id='+encodeURIComponent(id)); const j=await r.json(); if(!r.ok||!j.found) throw new Error(j.message||'Nasabah tidak ditemukan'); return j.nasabah; }
async function callPublicByName(name){ const r=await fetch('/api/public?name='+encodeURIComponent(name)); const j=await r.json(); if(!r.ok||!j.found) throw new Error(j.message||'Nasabah tidak ditemukan'); return j.nasabah; }

// ====== auth gate ======
function isLogged(){ return localStorage.getItem('tabungan_logged') === '1'; }
function setLogged(v){ v ? localStorage.setItem('tabungan_logged','1') : localStorage.removeItem('tabungan_logged'); renderGate(); }
function renderGate(){ const ok=isLogged(); els.login.style.display=ok?'none':'block'; els.dash.style.display=ok?'block':'none'; if(ok) loadData(); }

// ====== public vs admin ======
const params = new URLSearchParams(location.search);
const qId = params.get('id'); const qName=params.get('n')||params.get('name');
if (qId || qName) {
  if (els.topbar) els.topbar.style.display='none';
  document.querySelectorAll('.tab').forEach(el=>el.style.display='none');
  els.pv.style.display='block';
  (qId ? loadPublicById(qId) : loadPublicByName(qName));
} else {
  renderGate();
}

// ====== ADMIN ======
function findById(id){ return (state.nasabah||[]).find(x=> (x.id||'')===id); }
function indexById(id){ return (state.nasabah||[]).findIndex(x=> (x.id||'')===id); }

function refreshNameLists(){
  const rows = (state.nasabah||[]).map(x=>({label:`${x.nama} — ${x.id}`, value:x.id})).sort((a,b)=>a.label.localeCompare(b.label,'id'));
  const fill = (sel)=>{ sel.innerHTML = rows.map(r=>`<option value="${r.value}">${r.label}</option>`).join(''); };
  fill(els.namaEditSel); fill(els.riwNama); 
  // oldNameSel pakai ID juga tapi label nama
  els.oldNameSel.innerHTML = rows.map(r=>`<option value="${r.value}">${r.label}</option>`).join('');
}

function renderAdmin(){
  refreshNameLists();

  const list = state.nasabah || [];
  let total = 0; list.forEach(x=> total += Number(x.saldo||0));
  els.statNasabah.textContent = list.length;
  els.statSaldo.textContent   = fmt(total);
  els.statRata.textContent    = fmt(list.length ? Math.round(total/list.length) : 0);

  els.tBody.innerHTML='';
  list.forEach(n=>{
    const link = `${origin}/?id=${encodeURIComponent(n.id)}`;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${n.nama}</td>
      <td>${n.id}</td>
      <td>${fmt(n.saldo||0)}</td>
      <td>
        <a class="small chip" href="${link}" target="_blank" rel="noopener">Buka</a>
        <button class="small" data-copy="${link}">Salin</button>
        <button class="danger small" data-del="${n.id}">Hapus</button>
      </td>`;
    els.tBody.appendChild(tr);
  });

  // actions
  els.tBody.querySelectorAll('button[data-copy]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const url = btn.getAttribute('data-copy');
      try{ await navigator.clipboard.writeText(url); btn.textContent='Disalin!'; setTimeout(()=>btn.textContent='Salin',1200);}catch{ prompt('Salin link ini:', url); }
    });
  });
  els.tBody.querySelectorAll('button[data-del]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.getAttribute('data-del');
      const n = findById(id); if(!n) return;
      if(!confirm(`Hapus nasabah "${n.nama}" (${n.id})?`)) return;
      state.nasabah = (state.nasabah||[]).filter(x=>x.id!==id);
      try{ await callPut(state); renderAdmin(); }catch(e){ alert(e.message); }
    });
  });
}

async function loadData(){
  try{
    const data = await callGet();
    if (!Array.isArray(data.nasabah)) data.nasabah = [];
    let changed=false;

    // migrasi: tambahkan id & lots jika belum ada
    const ids = new Set();
    data.nasabah = data.nasabah.map(x=>{
      let n = {...x};
      if (!n.id) { n.id = genId([...ids]); changed=true; }
      ids.add(n.id);
      ensureLots(n);
      return n;
    });

    state = data;
    renderAdmin();

    if (changed) { try{ await callPut(state); }catch(e){ console.warn('Auto-fix save failed', e); } }
    els.msg.textContent = '';
  }catch(e){
    els.msg.textContent = 'GET error → ' + e.message;
  }
}

// add nasabah
els.btnTambah?.addEventListener('click', async ()=>{
  const nama=(els.namaBaru.value||'').trim();
  const saldo=parseNum(els.saldoBaru.value);
  if(!nama){alert('Nama wajib');return;}
  const existName=(state.nasabah||[]).some(x=> (x.nama||'').toLowerCase()===nama.toLowerCase());
  if(existName){ alert('Nama sudah ada'); return; }
  const id=genId((state.nasabah||[]).map(x=>x.id));
  const now=Date.now();
  const history = saldo>0 ? [{ts:now,type:'tambah',amount:saldo,note:'Setoran awal'}] : [];
  const lots = saldo>0 ? [{ts:now,amount:saldo,remaining:saldo}] : [];
  state.nasabah=[...(state.nasabah||[]), {id,nama,saldo,history,lots}];
  try{ await callPut(state); els.namaBaru.value=''; els.saldoBaru.value=''; renderAdmin(); }catch(e){ alert(e.message); }
});

// edit saldo (dengan lots & validasi)
function buildTs(dateStr,timeStr){
  if(!dateStr && !timeStr) return Date.now();
  const [Y,M,D]=(dateStr||'').split('-').map(n=>parseInt(n,10));
  const [h,m]=(timeStr||'').split(':').map(n=>parseInt(n,10));
  return new Date(isFinite(Y)?Y:new Date().getFullYear(), isFinite(M)?M-1:new Date().getMonth(), isFinite(D)?D:new Date().getDate(), isFinite(h)?h:9, isFinite(m)?m:0, 0,0).getTime();
}
els.btnEdit?.addEventListener('click', async ()=>{
  const id = els.namaEditSel.value;
  const jumlah = parseNum(els.saldoEdit.value);
  const mode = els.aksiEdit.value;
  const note = (els.catatanEdit.value||'').trim();
  const ts   = buildTs(els.tglEdit.value, els.jamEdit.value);
  if(!id || !jumlah){ alert('Pilih nasabah & isi jumlah'); return; }

  const idx = indexById(id); if(idx<0){ alert('Nasabah tidak ditemukan'); return; }
  const n = {...state.nasabah[idx]}; ensureLots(n);

  let delta = jumlah;
  if(mode==='kurangi'){
    if (jumlah > Number(n.saldo||0)) { alert(`Penarikan (${fmt(jumlah)}) melebihi saldo (${fmt(n.saldo||0)}).`); return; }
    delta = -Math.abs(jumlah);
    n.lots = lotsConsume(n.lots, Math.abs(delta));
  }else if(mode==='tambah'){
    n.lots = lotsAdd(n.lots, delta, ts);
  }else if(mode==='koreksi'){
    delta = jumlah - Number(n.saldo||0);
    if (delta>=0) { n.lots = lotsAdd(n.lots, delta, ts); }
    else { n.lots = lotsConsume(n.lots, Math.abs(delta)); }
  }

  n.saldo = Math.max(0, Number(n.saldo||0) + delta);
  n.history = [...(n.history||[]), { ts, type: mode==='koreksi'?'koreksi': (delta>=0?'tambah':'tarik'), amount: Math.abs(delta), note: note || (mode==='koreksi'?'Penyesuaian saldo': (delta>=0?'Setoran':'Penarikan')) }];

  state.nasabah[idx]=n;

  try{
    await callPut(state);
    els.saldoEdit.value=''; els.catatanEdit.value=''; els.tglEdit.value=''; els.jamEdit.value='';
    renderAdmin(); if (els.riwNama.value===id) renderHistoryAdmin(id);
  }catch(e){ alert(e.message); }
});

// history admin render & delete
function renderHistoryAdmin(id){
  const n = findById(id); els.riwTableBody.innerHTML=''; if(!n){ els.riwEmpty.style.display='block'; return; }
  const list = Array.isArray(n.history)?n.history:[];
  if(list.length===0){ els.riwEmpty.style.display='block'; return; }
  els.riwEmpty.style.display='none';
  const sorted = list.map((x,i)=>({...x,_i:i})).sort((a,b)=>(b.ts||0)-(a.ts||0));
  sorted.forEach((it,row)=>{
    const d = new Date(it.ts || Date.now());
    const tgl = d.toLocaleString('id-ID',{ dateStyle:'medium', timeStyle:'short' });
    const jenis = (it.type||'koreksi').toLowerCase();
    const cls = jenis==='tambah'?'add':jenis==='tarik'?'withdraw':'koreksi';
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${row+1}</td><td>${tgl}</td><td><span class="badge ${cls}">${jenis[0].toUpperCase()+jenis.slice(1)}</span></td><td>${fmt(it.amount||0)}</td><td>${it.note||'-'}</td><td><button class="danger small" data-del="${it._i}" data-id="${n.id}">Hapus</button></td>`;
    els.riwTableBody.appendChild(tr);
  });
  els.riwTableBody.querySelectorAll('button[data-del]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const i=parseInt(btn.getAttribute('data-del'),10); const id=btn.getAttribute('data-id');
      if(!confirm('Hapus catatan ini? (Saldo & lots tidak berubah)')) return;
      const idx=indexById(id); if(idx<0) return;
      const copy={...state.nasabah[idx]}; copy.history=(copy.history||[]).filter((_,k)=>k!==i);
      state.nasabah[idx]=copy;
      try{ await callPut(state); renderHistoryAdmin(id); }catch(e){ alert(e.message); }
    });
  });
}
els.riwRefresh?.addEventListener('click', ()=> renderHistoryAdmin(els.riwNama.value));
els.riwNama?.addEventListener('change', ()=> renderHistoryAdmin(els.riwNama.value));

// rename
els.btnRename?.addEventListener('click', async ()=>{
  const id = els.oldNameSel.value;
  const newN = (els.newName.value||'').trim();
  if(!id || !newN){ alert('Pilih nama & isi nama baru'); return; }
  const idx=indexById(id); if(idx<0){ alert('Nasabah tidak ditemukan'); return; }
  state.nasabah[idx] = { ...state.nasabah[idx], nama: newN };
  try{ await callPut(state); els.newName.value=''; renderAdmin(); if(els.riwNama.value===id) renderHistoryAdmin(id); alert('Nama diubah'); }catch(e){ alert(e.message); }
});

// ====== PUBLIC ======
function renderPublicHistory(list){
  els.pvHistory.innerHTML='';
  if(!Array.isArray(list)||list.length===0){ els.pvEmpty.style.display='block'; return; }
  els.pvEmpty.style.display='none';
  const sorted=[...list].sort((a,b)=>(b.ts||0)-(a.ts||0));
  sorted.forEach(it=>{
    const d = new Date(it.ts||Date.now());
    const tgl = d.toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'});
    const jenis=(it.type||'koreksi').toLowerCase();
    const cls=jenis==='tambah'?'add':jenis==='tarik'?'withdraw':'koreksi';
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${tgl}</td><td><span class="badge ${cls}">${jenis[0].toUpperCase()+jenis.slice(1)}</span></td><td>${fmt(it.amount||0)}</td><td>${it.note||'-'}</td>`;
    els.pvHistory.appendChild(tr);
  });
}

function updatePublicStats(nas){
  const free = freeAmount(nas);
  const locked = lockedAmount(nas);
  els.pvSaldo.textContent = fmt(nas.saldo||0);
  els.pvFree.textContent  = fmt(free);
  els.pvLocked.textContent= fmt(locked);

  // hint fee untuk input
  const val = parseNum(els.pvAmount.value);
  if (!val) { els.pvFee.textContent = ''; return; }
  const needFeeBase = Math.max(0, Math.min(val, Number(nas.saldo||0)) - free);
  if (needFeeBase <= 0) { els.pvFee.textContent = 'Tarik nominal ini: GRATIS (semua telah ≥ 30 hari).'; return; }
  const fee = adminFee(needFeeBase);
  els.pvFee.textContent = `Perkiraan biaya admin untuk nominal ini: ${fmt(fee)} (karena Rp ${fmtNum(needFeeBase)} masih < 30 hari).`;
}

async function loadPublicById(id){
  try{
    const nas = await callPublicById(id);
    ensureLots(nas);
    els.pvTitle.textContent = `Halo, ${nas.nama}`;
    updatePublicStats(nas);
    renderPublicHistory(nas.history||[]);

    const wa = (type, amount) => {
      const nominal = parseNum(amount);
      const free = freeAmount(nas);
      const over = Math.max(0, nominal - free);
      const fee = over>0 ? adminFee(over) : 0;
      const action = type==='add'?'Tambah Tabungan':'Tarik Tabungan';
      const msg = `Halo Mas Hepi, saya *${nas.nama}* (ID: ${nas.id}) ingin *${action}* sebesar *${fmt(nominal)}*.` + (type==='withdraw' && fee>0 ? ` Perkiraan biaya admin: *${fmt(fee)}*.` : '') + ` (Link: ${origin}/?id=${encodeURIComponent(nas.id)})`;
      return `https://wa.me/6285346861655?text=${encodeURIComponent(msg)}`;
    };

    els.pvAmount.addEventListener('input', ()=> updatePublicStats(nas));
    els.pvAdd.addEventListener('click', ()=>{
      const n = parseNum(els.pvAmount.value); if(!n){ alert('Isi nominal dulu'); return; }
      location.href = wa('add', n);
    });
    els.pvWithdraw.addEventListener('click', ()=>{
      const n = parseNum(els.pvAmount.value); if(!n){ alert('Isi nominal dulu'); return; }
      if (n > Number(nas.saldo||0)) { alert('Nominal melebihi saldo.'); return; }
      location.href = wa('withdraw', n);
    });
  }catch(e){
    els.pv.style.display='block';
    els.pv.innerHTML = `<h2>Tautan tidak valid</h2><p class="muted">${e.message||'Error'}</p>`;
  }
}
async function loadPublicByName(name){
  const nas = await callPublicByName(name);
  // Redirect lembut ke URL berbasis ID biar konsisten
  location.replace(`/?id=${encodeURIComponent(nas.id)}`);
}

// ====== AUTH ======
document.getElementById('btnLogin')?.addEventListener('click', async ()=>{
  const u=document.getElementById('user').value.trim(); const p=document.getElementById('pass').value.trim();
  try{ const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})}); const j=await r.json(); if(!r.ok||!j.ok){ els.loginMsg.textContent=j.message||'Login gagal'; return;} setLogged(true);}catch(e){ els.loginMsg.textContent='Error login'; }
});
els.btnLogout?.addEventListener('click', ()=> setLogged(false));
