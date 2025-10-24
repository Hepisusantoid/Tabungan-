/***** ========= APP.JS — DASHBOARD ADMIN + PUBLIC LINK ========= *****/

/* ================== ELEMENTS PLACEHOLDER ================== */
const el = id => document.getElementById(id);
const originURL = (location.origin || '').replace(/\/$/, '');
const qs = new URLSearchParams(location.search);
const qId = qs.get('id');                  // ?id=ID_MEMBER
const qName = qs.get('n') || qs.get('name'); // ?n=Nama (fallback)

/* ================== STATE ================== */
let state = { nasabah: [] };

/* ================== AUTH GATE ================== */
function isLogged(){ try { return localStorage.getItem('tabungan_logged')==='1'; } catch { return false; } }
function setLogged(v){ try { v ? localStorage.setItem('tabungan_logged','1') : localStorage.removeItem('tabungan_logged'); } catch {} }
function renderGate(){
  const ok=isLogged();
  if (el('login-section')) el('login-section').style.display = ok?'none':'block';
  if (el('dashboard'))     el('dashboard').style.display     = ok?'block':'none';
  if (ok) loadData();
}
window.renderGate = renderGate;

/* ================== API HELPERS ================== */
async function apiGet(){ const r=await fetch('/api/get'); const t=await r.text(); let j; try{j=JSON.parse(t);}catch{j={raw:t}}; if(!r.ok) throw new Error(j.error||j.message||('GET '+r.status)); return j; }
async function apiPut(p){ const r=await fetch('/api/put',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)}); const t=await r.text(); let j; try{j=JSON.parse(t);}catch{j={raw:t}}; if(!r.ok) throw new Error(j.error||j.message||('PUT '+r.status)); return j; }
async function apiPublicById(id){ const r=await fetch('/api/public?id='+encodeURIComponent(id)); const j=await r.json(); if(!r.ok||!j.found) throw new Error(j.message||'Nasabah tidak ditemukan'); return j.nasabah; }
async function apiPublicByName(n){ const r=await fetch('/api/public?name='+encodeURIComponent(n)); const j=await r.json(); if(!r.ok||!j.found) throw new Error(j.message||'Nasabah tidak ditemukan'); return j.nasabah; }

/* ================== FORMAT ================== */
const nfRupiah = new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0});
const nfPlain  = new Intl.NumberFormat('id-ID',{maximumFractionDigits:0});
const fmt = n => nfRupiah.format(Number(n)||0);
const fmtNum = n => nfPlain.format(Number(n)||0);
const num = v => Number((v||'').toString().replace(/[^\d]/g,''))||0;

/* ================== LOGIC — ID, LOTS, FEE ================== */
const ONE_MONTH_MS = 30*24*3600*1000;
const genId = (taken=[]) => { const cs='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; do{ s=[...Array(6)].map(()=>cs[Math.floor(Math.random()*cs.length)]).join(''); } while(taken.includes(s)); return s; };

function ensureLots(n){
  n.history = Array.isArray(n.history)?n.history:[];
  n.lots    = Array.isArray(n.lots)?n.lots:[];
  if(typeof n.dividen!=='number') n.dividen=0;

  if(n.lots.length===0){
    // Build from history
    let lots=[];
    const sorted=[...n.history].sort((a,b)=>(a.ts||0)-(b.ts||0));
    for(const h of sorted){
      const amt=Number(h.amount||0);
      if(h.type==='tambah' && amt>0){
        lots.push({ts:h.ts||Date.now(), amount:amt, remaining:amt});
      }else if(h.type==='tarik' && amt>0){
        let need=amt; for(const l of lots){ if(need<=0) break; const take=Math.min(l.remaining,need); l.remaining-=take; need-=take; }
      }else if(h.type==='koreksi'){
        if(amt>0) lots.push({ts:h.ts||Date.now(), amount:amt, remaining:amt});
        if(amt<0){ let need=-amt; for(const l of lots){ if(need<=0) break; const take=Math.min(l.remaining,need); l.remaining-=take; need-=take; } }
      }
    }
    n.lots = lots.filter(l=>l.remaining>0);
    if(n.lots.length===0 && Number(n.saldo||0)>0){
      n.lots=[{ts:Date.now(),amount:Number(n.saldo||0),remaining:Number(n.saldo||0)}];
    }
  }
  return n;
}
function lotsAdd(lots,amount,ts){ lots.push({ts,amount,remaining:amount}); return lots; }
function lotsConsume(lots,amount){ let need=amount; for(const l of lots){ if(need<=0) break; const take=Math.min(l.remaining,need); l.remaining-=take; need-=take; } return lots.filter(l=>l.remaining>0); }
const freeAmount = (n,now=Date.now()) => ensureLots(n).lots.reduce((s,l)=>s+(now-(l.ts||0)>=ONE_MONTH_MS?Number(l.remaining||0):0),0);

function adminFee(x){
  const n=Number(x||0);
  if(n<=0) return 0;
  if(n<350000) return 3000;
  if(n<600000) return 5000;
  if(n<800000) return 7000;
  if(n<2000000) return 10000;
  if(n<5500000) return 20000;
  if(n<6500000) return 25000;
  if(n<15000000) return 30000;
  const extra=n-15000000; const blocks=Math.ceil(extra/1000000);
  return 30000 + blocks*2000;
}

/* ================== CHART (Donut) TANPA LIBRARY ================== */
const PALETTE = ['#46d07d','#25b767','#1a8f4e','#5be39b','#2ab57a','#3dd28f','#1fa35a','#6ee8aa','#297c55'];
const PALETTE_PV = ['#46d07d','#2b3e33'];
let lastAdminParts=null, lastPvParts=null;

function drawDonut(canvas, parts, colors){
  if(!canvas) return;
  const rect=canvas.getBoundingClientRect();
  const w=Math.floor(rect.width||canvas.offsetWidth||320);
  if(!w){ setTimeout(()=>drawDonut(canvas,parts,colors),120); return; }
  const dpr=Math.max(1,window.devicePixelRatio||1);
  const h=Math.max(220,Math.floor(w*0.625));
  canvas.width=w*dpr; canvas.height=h*dpr;
  const ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
  const cx=w/2, cy=h/2; const r=Math.min(w,h)/2-14; const inner=r*0.58;
  const total=parts.reduce((s,p)=>s+p.value,0)||1;
  let ang=-Math.PI/2;
  parts.forEach((p,i)=>{
    const a=(p.value/total)*Math.PI*2; const c=colors[i%colors.length];
    ctx.beginPath(); ctx.arc(cx,cy,r,ang,ang+a); ctx.arc(cx,cy,inner,ang+a,ang,true); ctx.closePath();
    const g=ctx.createLinearGradient(0,0,w,h); g.addColorStop(0,c); g.addColorStop(1,c+'aa'); ctx.fillStyle=g; ctx.fill();
    ang+=a;
  });
}
function renderLegend(container,parts,colors){
  if(!container) return;
  const total=parts.reduce((s,p)=>s+p.value,0)||1;
  container.innerHTML = parts.map((p,i)=>{
    const pct=Math.round((p.value/total)*100);
    return `<div class="item"><span class="dot" style="background:${colors[i%colors.length]}"></span><span>${p.label} — ${pct}%</span></div>`;
  }).join('');
}
window.addEventListener('resize', ()=>{
  if (el('adminPie') && lastAdminParts) drawDonut(el('adminPie'),lastAdminParts,PALETTE);
  if (el('pvPie') && lastPvParts)       drawDonut(el('pvPie'),lastPvParts,PALETTE_PV);
});

/* ================== ADMIN UI (dibangun dinamis) ================== */
function adminShell(){
  return `
  <div class="cards">
    <div class="card sm"><div class="label">Total Nasabah</div><div id="statNasabah" class="value">0</div></div>
    <div class="card sm"><div class="label">Total Saldo</div><div id="statSaldo" class="value">Rp 0</div></div>
    <div class="card sm"><div class="label">Saldo Rata-rata</div><div id="statRata" class="value">Rp 0</div></div>
  </div>

  <div class="card">
    <h3>Daftar Nasabah</h3>
    <table id="tNasabah" class="table">
      <thead><tr><th>Nama</th><th>ID</th><th>Saldo</th><th>Dividen</th><th>Aksi</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>

  <div class="grid">
    <div class="card">
      <h3>Tambah Nasabah</h3>
      <div class="row">
        <input id="namaBaru" placeholder="Nama nasabah">
        <input id="saldoBaru" placeholder="Saldo awal (contoh 100.000)">
        <button id="btnTambah" class="primary">Tambah</button>
      </div>
    </div>

    <div class="card">
      <h3>Edit Saldo</h3>
      <div class="row">
        <select id="namaEditSel"></select>
        <input id="saldoEdit" placeholder="Nominal">
        <select id="aksiEdit">
          <option value="tambah">Tambah Saldo</option>
          <option value="kurangi">Tarik Saldo</option>
          <option value="koreksi">Koreksi</option>
        </select>
      </div>
      <div class="row">
        <input id="tglEdit" type="date">
        <input id="jamEdit" type="time">
        <input id="catatanEdit" placeholder="Catatan (opsional)">
        <button id="btnEdit" class="primary">Simpan</button>
      </div>
      <p class="muted">Tarik tidak boleh melebihi saldo. Koreksi menyesuaikan saldo akhir.</p>
    </div>

    <div class="card">
      <h3>Edit Saldo Dividen</h3>
      <div class="row">
        <select id="divNamaSel"></select>
        <input id="divJumlah" placeholder="Nominal">
        <select id="divAksi">
          <option value="tambah">Tambah</option>
          <option value="kurangi">Kurangi (Tarik Dividen)</option>
        </select>
      </div>
      <div class="row">
        <input id="divTgl" type="date">
        <input id="divJam" type="time">
        <input id="divCatatan" placeholder="Catatan (opsional)">
        <button id="divBtn" class="primary">Simpan</button>
      </div>
      <p class="muted">Dividen tidak mengubah saldo pokok/lots.</p>
    </div>
  </div>

  <div class="card">
    <h3>Persentase Kepemilikan (Top 8 + Lainnya)</h3>
    <canvas id="adminPie" style="width:100%;height:280px"></canvas>
    <div id="adminLegend" class="legend"></div>
  </div>

  <div class="card">
    <h3>Pembagian Penghasilan → Dividen</h3>
    <div class="row">
      <input id="revAmount" placeholder="Nominal penghasilan (contoh 1.000.000)">
      <button id="revDistribute" class="primary">Bagi ke Semua</button>
    </div>
    <p class="muted">Penghasilan dibagi proporsional terhadap <b>saldo pokok</b>, masuk ke <b>Saldo Dividen</b>, serta tercatat di riwayat (type: <i>dividen</i>).</p>
  </div>

  <div class="card">
    <h3>Riwayat Transaksi</h3>
    <div class="row">
      <select id="riwNama"></select>
      <button id="riwRefresh">Lihat</button>
    </div>
    <table id="riwTable" class="table">
      <thead><tr><th>#</th><th>Tanggal</th><th>Jenis</th><th>Nominal</th><th>Catatan</th><th>Aksi</th></tr></thead>
      <tbody></tbody>
    </table>
    <p id="riwEmpty" class="muted" style="display:none">Belum ada riwayat.</p>
  </div>
  `;
}
function wireAdminInputs(){
  // format ribuan saat ketik
  ['saldoBaru','saldoEdit','divJumlah','revAmount'].forEach(id=>{
    const x=el(id); if(!x) return;
    x.addEventListener('input', ()=> x.value = fmtNum(num(x.value)));
  });
}
function refreshNameLists(){
  const list=(state.nasabah||[]).map(x=>({label:`${x.nama} — ${x.id}`, value:x.id})).sort((a,b)=>a.label.localeCompare(b.label,'id'));
  const fill = (sid)=>{ const s=el(sid); if(!s) return; s.innerHTML=list.map(r=>`<option value="${r.value}">${r.label}</option>`).join(''); };
  ['namaEditSel','divNamaSel','riwNama'].forEach(fill);
}
function indexById(id){ return (state.nasabah||[]).findIndex(x=>x.id===id); }
function findById(id){ return (state.nasabah||[]).find(x=>x.id===id); }

function renderAdmin(){
  const root = el('admin-root');
  if (!root) return;

  // build shell sekali setiap render admin
  root.innerHTML = adminShell();
  wireAdminInputs();

  // Statistik + Tabel
  const body = root.querySelector('#tNasabah tbody');
  const list = state.nasabah||[];
  let total=0; list.forEach(n=> total += Number(n.saldo||0));
  el('statNasabah').textContent = list.length;
  el('statSaldo').textContent   = fmt(total);
  el('statRata').textContent    = fmt(list.length?Math.round(total/list.length):0);

  body.innerHTML='';
  list.forEach(n=>{
    const link=`${originURL}/?id=${encodeURIComponent(n.id)}`;
    const tr=document.createElement('tr');
    tr.innerHTML = `
      <td>${n.nama}</td>
      <td>${n.id}</td>
      <td>${fmt(n.saldo||0)}</td>
      <td>${fmt(n.dividen||0)}</td>
      <td>
        <a class="small" href="${link}" target="_blank" rel="noopener">Buka</a>
        <button class="small" data-copy="${link}">Salin</button>
        <button class="danger small" data-del="${n.id}">Hapus</button>
      </td>`;
    body.appendChild(tr);
  });
  body.querySelectorAll('button[data-copy]').forEach(b=>{
    b.addEventListener('click', async ()=>{
      const url=b.getAttribute('data-copy');
      try{ await navigator.clipboard.writeText(url); b.textContent='Disalin'; setTimeout(()=>b.textContent='Salin',1000);} catch{ prompt('Salin link ini:', url); }
    });
  });
  body.querySelectorAll('button[data-del]').forEach(b=>{
    b.addEventListener('click', async ()=>{
      const id=b.getAttribute('data-del');
      const n=findById(id); if(!n) return;
      if(!confirm(`Hapus nasabah "${n.nama}"?`)) return;
      state.nasabah=(state.nasabah||[]).filter(x=>x.id!==id);
      try{ await apiPut(state); renderAdmin(); }catch(e){ alert(e.message); }
    });
  });

  // Nama list untuk form-form
  refreshNameLists();

  // Admin Pie
  const sorted=[...list].sort((a,b)=>Number(b.saldo||0)-Number(a.saldo||0));
  const top=sorted.slice(0,8);
  const others=sorted.slice(8).reduce((s,n)=>s+Number(n.saldo||0),0);
  const parts=top.map(n=>({label:n.nama.split(' ')[0], value:Number(n.saldo||0)}));
  if(others>0) parts.push({label:'Lainnya', value:others});
  lastAdminParts = parts.length?parts:[{label:'Kosong', value:1}];
  drawDonut(el('adminPie'), lastAdminParts, PALETTE);
  renderLegend(el('adminLegend'), lastAdminParts, PALETTE);

  /* ====== Actions ====== */

  // Tambah nasabah
  el('btnTambah').addEventListener('click', async ()=>{
    const nama=(el('namaBaru').value||'').trim();
    const saldo=num(el('saldoBaru').value);
    if(!nama){ alert('Nama wajib'); return; }
    const exist=(state.nasabah||[]).some(x=>(x.nama||'').toLowerCase()===nama.toLowerCase());
    if(exist){ alert('Nama sudah ada'); return; }
    const id=genId((state.nasabah||[]).map(x=>x.id));
    const now=Date.now();
    const hist = saldo>0 ? [{ ts:now, type:'tambah', amount:saldo, note:'Setoran awal' }] : [];
    const lots = saldo>0 ? [{ ts:now, amount:saldo, remaining:saldo }] : [];
    state.nasabah=[...(state.nasabah||[]), { id, nama, saldo, dividen:0, history:hist, lots }];
    try{ await apiPut(state); el('namaBaru').value=''; el('saldoBaru').value=''; renderAdmin(); }catch(e){ alert(e.message); }
  });

  // Edit saldo
  el('btnEdit').addEventListener('click', async ()=>{
    const id=el('namaEditSel').value;
    const jumlah=num(el('saldoEdit').value);
    const mode=el('aksiEdit').value;
    const note=(el('catatanEdit').value||'').trim();
    const ts = buildTs(el('tglEdit').value, el('jamEdit').value);
    if(!id || !jumlah){ alert('Pilih nasabah & isi nominal'); return; }
    const idx=indexById(id); if(idx<0){ alert('Nasabah tidak ditemukan'); return; }
    const n={...state.nasabah[idx]}; ensureLots(n);

    let delta=jumlah;
    if(mode==='kurangi'){
      if(jumlah>Number(n.saldo||0)){ alert('Tarik melebihi saldo'); return; }
      delta=-Math.abs(jumlah);
      n.lots = lotsConsume(n.lots, Math.abs(delta));
    }else if(mode==='tambah'){
      n.lots = lotsAdd(n.lots, delta, ts);
    }else if(mode==='koreksi'){
      delta = jumlah - Number(n.saldo||0);
      if(delta>=0) n.lots = lotsAdd(n.lots, delta, ts);
      else         n.lots = lotsConsume(n.lots, Math.abs(delta));
    }

    n.saldo = Math.max(0, Number(n.saldo||0)+delta);
    n.history = [...(n.history||[]), { ts, type:(mode==='koreksi'?'koreksi':(delta>=0?'tambah':'tarik')), amount:Math.abs(delta), note:note||'-' }];

    state.nasabah[idx]=n;
    try{ await apiPut(state); ['saldoEdit','catatanEdit','tglEdit','jamEdit'].forEach(i=>el(i).value=''); renderAdmin(); if(el('riwNama').value===id) renderHistory(id); }catch(e){ alert(e.message); }
  });

  // Edit dividen
  el('divBtn').addEventListener('click', async ()=>{
    const id=el('divNamaSel').value;
    const jumlah=num(el('divJumlah').value);
    const mode=el('divAksi').value;
    const ts = buildTs(el('divTgl').value, el('divJam').value);
    const note=(el('divCatatan').value||'').trim() || (mode==='tambah'?'Penambahan dividen':'Penarikan dividen');
    if(!id||!jumlah){ alert('Pilih nasabah & isi nominal'); return; }
    const idx=indexById(id); if(idx<0){ alert('Nasabah tidak ditemukan'); return; }
    const n={...state.nasabah[idx]};
    const delta = (mode==='tambah')? jumlah : -jumlah;
    if (mode==='kurangi' && jumlah>Number(n.dividen||0)){ alert('Lebih besar dari dividen saat ini'); return; }
    n.dividen = Math.max(0, Number(n.dividen||0)+delta);
    n.history = [...(n.history||[]), { ts, type:'dividen', amount:Math.abs(jumlah), note }];
    state.nasabah[idx]=n;
    try{ await apiPut(state); ['divJumlah','divCatatan','divTgl','divJam'].forEach(i=>el(i).value=''); renderAdmin(); if(el('riwNama').value===id) renderHistory(id); }catch(e){ alert(e.message); }
  });

  // Riwayat
  el('riwRefresh').addEventListener('click', ()=> renderHistory(el('riwNama').value));
}

function buildTs(d,t){
  if(!d && !t) return Date.now();
  const [Y,M,D]=(d||'').split('-').map(v=>parseInt(v,10));
  const [h,m]=(t||'').split(':').map(v=>parseInt(v,10));
  return new Date(isFinite(Y)?Y:new Date().getFullYear(), isFinite(M)?M-1:new Date().getMonth(), isFinite(D)?D:new Date().getDate(), isFinite(h)?h:9, isFinite(m)?m:0,0,0).getTime();
}

function renderHistory(id){
  const tableBody = el('riwTable').querySelector('tbody');
  tableBody.innerHTML='';
  const n=findById(id);
  if(!n){ el('riwEmpty').style.display='block'; return; }
  const list=Array.isArray(n.history)?n.history:[];
  if(list.length===0){ el('riwEmpty').style.display='block'; return; }
  el('riwEmpty').style.display='none';

  const data=list.map((x,i)=>({...x,_i:i})).sort((a,b)=>(b.ts||0)-(a.ts||0));
  data.forEach((it,row)=>{
    const d=new Date(it.ts||Date.now());
    const tgl=d.toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'});
    const jenis=(it.type||'koreksi').toLowerCase();
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${row+1}</td><td>${tgl}</td><td>${jenis[0].toUpperCase()+jenis.slice(1)}</td><td>${fmt(it.amount||0)}</td><td>${it.note||'-'}</td><td><button class="danger small" data-del="${it._i}" data-id="${n.id}">Hapus</button></td>`;
    tableBody.appendChild(tr);
  });

  tableBody.querySelectorAll('button[data-del]').forEach(b=>{
    b.addEventListener('click', async ()=>{
      const i=parseInt(b.getAttribute('data-del'),10);
      const id=b.getAttribute('data-id');
      if(!confirm('Hapus catatan ini? (Tidak mengubah saldo/lots/dividen)')) return;
      const idx=indexById(id); if(idx<0) return;
      const copy={...state.nasabah[idx]};
      copy.history=(copy.history||[]).filter((_,k)=>k!==i);
      state.nasabah[idx]=copy;
      try{ await apiPut(state); renderHistory(id); }catch(e){ alert(e.message); }
    });
  });
}

/* ================== LOAD DATA (MIGRASI ID/LOTS) ================== */
async function loadData(){
  try{
    const data=await apiGet();
    if(!Array.isArray(data.nasabah)) data.nasabah=[];
    let changed=false; const taken=[];
    state.nasabah=data.nasabah.map(x=>{
      const n={...x};
      if(!n.id){ n.id=genId(taken); changed=true; }
      taken.push(n.id);
      ensureLots(n);
      if(typeof n.dividen!=='number') { n.dividen=0; changed=true; }
      return n;
    });
    if(changed){ try{ await apiPut(state); }catch{} }
    renderAdmin();
  }catch(e){
    const root=el('admin-root'); if(root) root.innerHTML = `<p class="muted">Gagal memuat data: ${e.message||e}</p>`;
  }
}

/* ================== PUBLIC VIEW ================== */
function publicShell(){
  return `
  <div class="hero" style="margin-top:-8px">
    <img id="pv-hero" src="/img/gambar1.png" alt="Hero" style="width:100%;height:auto;border-radius:16px;display:block;"/>
  </div>

  <div class="card glass success" style="margin-top:16px">
    <b>Tabunganmu aman 100%</b> — bisa ditarik kapan saja di <b>Hepi Susanto</b>. Tanpa biaya admin untuk simpan ≥ 1 bulan.
  </div>

  <div class="card">
    <h2 id="pv-title">Halo</h2>
    <div class="cards">
      <div class="card sm"><div class="label">Saldo Anda</div><div id="pv-saldo" class="value">Rp 0</div></div>
      <div class="card sm"><div class="label">Saldo Gratis (≥30 hari)</div><div id="pv-free" class="value">Rp 0</div></div>
      <div class="card sm"><div class="label">Saldo Dividen</div><div id="pv-dividen" class="value">Rp 0</div></div>
    </div>

    <input id="pv-amount" placeholder="Nominal (contoh 100.000)" />
    <div class="row">
      <button id="pv-add" class="primary">Tambah Tabungan</button>
      <button id="pv-withdraw">Tarik Tabungan</button>
    </div>
    <p id="pv-fee" class="muted"></p>
  </div>

  <div class="card">
    <h3>Persentase Kepemilikan</h3>
    <canvas id="pvPie" style="width:100%;height:260px"></canvas>
    <div id="pvLegend" class="legend"></div>
    <p id="pvShareText" class="muted"></p>
  </div>

  <div class="card">
    <h3>Riwayat Transaksi</h3>
    <table class="table">
      <thead><tr><th>Tanggal</th><th>Jenis</th><th>Nominal</th><th>Catatan</th></tr></thead>
      <tbody id="pv-history"></tbody>
    </table>
    <p id="pv-empty" class="muted" style="display:none">Belum ada riwayat.</p>
  </div>`;
}
function renderPublicHistory(list){
  const body=el('pv-history'); body.innerHTML='';
  if(!Array.isArray(list)||list.length===0){ el('pv-empty').style.display='block'; return; }
  el('pv-empty').style.display='none';
  const data=[...list].sort((a,b)=>(b.ts||0)-(a.ts||0));
  data.forEach(it=>{
    const d=new Date(it.ts||Date.now());
    const tgl=d.toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'});
    const jenis=(it.type||'koreksi').toLowerCase();
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${tgl}</td><td>${jenis[0].toUpperCase()+jenis.slice(1)}</td><td>${fmt(it.amount||0)}</td><td>${it.note||'-'}</td>`;
    body.appendChild(tr);
  });
}
function drawPublicPie(nama, share){
  const you=Math.round(share); const other=Math.max(0,100-you);
  lastPvParts=[{label:nama.split(' ')[0], value:you},{label:'Lainnya', value:other}];
  drawDonut(el('pvPie'),lastPvParts,PALETTE_PV);
  renderLegend(el('pvLegend'),lastPvParts,PALETTE_PV);
  el('pvShareText').textContent = `${nama} ${you}% vs Lainnya ${other}%`;
}
function updatePublicStats(nas,totalAll){
  const free=freeAmount(nas);
  el('pv-saldo').textContent   = fmt(nas.saldo||0);
  el('pv-dividen').textContent = fmt(nas.dividen||0);
  el('pv-free').textContent    = fmt(free);

  const share = totalAll>0 ? (Number(nas.saldo||0)/totalAll)*100 : 0;
  drawPublicPie(nas.nama, share);

  const val=num(el('pv-amount').value);
  if(!val){ el('pv-fee').textContent=''; return; }
  const over=Math.max(0, Math.min(val, Number(nas.saldo||0)) - free);
  const fee = over>0 ? adminFee(over) : 0;
  el('pv-fee').textContent = (over<=0)
    ? 'Tarik nominal ini: GRATIS (semua telah ≥ 30 hari).'
    : `Perkiraan biaya admin: ${fmt(fee)} untuk bagian dana yang baru (< 30 hari).`;
}
async function loadPublicById(id){
  const root=el('public-root'); root.innerHTML = publicShell();
  try{
    const nas = await apiPublicById(id); ensureLots(nas);
    if(typeof nas.dividen!=='number') nas.dividen=0;
    if(el('pv-hero')) el('pv-hero').onerror = ()=>{ const h=el('pv-hero'); if(h) h.style.display='none'; };
    el('pv-title').textContent = `Halo, ${nas.nama}`;

    // total all saldo
    const all=await apiGet();
    const totalAll=(all.nasabah||[]).reduce((s,n)=>s+Number(n.saldo||0),0);

    renderPublicHistory(nas.history||[]);
    updatePublicStats(nas,totalAll);

    // Format input angka
    el('pv-amount').addEventListener('input', ()=>{ el('pv-amount').value=fmtNum(num(el('pv-amount').value)); updatePublicStats(nas,totalAll); });

    // WA links
    const wa = (type, amount)=>{
      const nominal=num(amount);
      const free=freeAmount(nas);
      const over=Math.max(0, nominal - free);
      const fee=over>0?adminFee(over):0;
      const action = type==='add'?'Tambah Tabungan':'Tarik Tabungan';
      const msg = `Halo Mas Hepi, saya *${nas.nama}* (ID: ${nas.id}) ingin *${action}* sebesar *${fmt(nominal)}*.` +
        (type==='withdraw' && fee>0 ? ` Perkiraan biaya admin: *${fmt(fee)}*.` : '') +
        ` (Link: ${originURL}/?id=${encodeURIComponent(nas.id)})`;
      return `https://wa.me/6285346861655?text=${encodeURIComponent(msg)}`;
    };
    el('pv-add').addEventListener('click', ()=>{
      const n=num(el('pv-amount').value); if(!n){ alert('Isi nominal dulu'); return; }
      location.href = wa('add', n);
    });
    el('pv-withdraw').addEventListener('click', ()=>{
      const n=num(el('pv-amount').value); if(!n){ alert('Isi nominal dulu'); return; }
      if(n>Number(nas.saldo||0)){ alert('Nominal melebihi saldo pokok.'); return; }
      location.href = wa('withdraw', n);
    });
  }catch(e){
    root.innerHTML = `<p class="muted">Tautan tidak valid: ${e.message||e}</p>`;
  }
}
async function loadPublicByName(name){ const nas=await apiPublicByName(name); location.replace(`/?id=${encodeURIComponent(nas.id)}`); }

/* ================== LOGIN FORM ================== */
el('btnLogin')?.addEventListener('click', async ()=>{
  const u=(el('user')?.value||'').trim();
  const p=(el('pass')?.value||'').trim();
  const msg=el('loginMsg');
  if(!u||!p){ if(msg) msg.textContent='Isi username & password.'; return; }
  if(msg) msg.textContent='Memproses…';
  try{
    const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
    const t=await r.text(); let j; try{ j=JSON.parse(t);}catch{ j={ok:false,message:t}; }
    if(!r.ok||!j.ok){ if(msg) msg.textContent = j.message || `Login gagal (${r.status})`; return; }
    setLogged(true); if(msg) msg.textContent='Berhasil. Membuka dashboard…'; renderGate();
  }catch(e){ if(msg) msg.textContent='Error login: '+(e?.message||e); }
});
el('btnLogout')?.addEventListener('click', ()=>{ setLogged(false); renderGate(); });

/* ================== ROUTER ================== */
(function boot(){
  if (qId || qName) {
    // mode public link
    if (el('topbar')) el('topbar').style.display='none';
    if (el('login-section')) el('login-section').style.display='none';
    if (el('dashboard')) el('dashboard').style.display='none';
    if (el('public-view')) el('public-view').style.display='block';
    if (qId) loadPublicById(qId); else loadPublicByName(qName);
  } else {
    renderGate();
  }
})();
