/***** ===== HEPI TABUNGAN — app.js v3 ===== *****/
'use strict';

/* ── Helpers ── */
const el = id => document.getElementById(id);
const originURL = (location.origin || '').replace(/\/$/, '');
const qs    = new URLSearchParams(location.search);
const qId   = qs.get('id');
const qName = qs.get('n') || qs.get('name');

let state = { nasabah: [] };

/* ── Format ── */
const nfRp   = new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', maximumFractionDigits:0 });
const nfPlain= new Intl.NumberFormat('id-ID', { maximumFractionDigits:0 });
const fmt    = n => nfRp.format(Number(n)||0);
const fmtNum = n => nfPlain.format(Number(n)||0);
const num    = v => Number((v||'').toString().replace(/[^\d]/g,''))||0;

/* ── Auth ── */
function isLogged(){ try{ return localStorage.getItem('tabungan_logged')==='1'; }catch{ return false; } }
function setLogged(v){ try{ v ? localStorage.setItem('tabungan_logged','1') : localStorage.removeItem('tabungan_logged'); }catch{} }

function renderGate(){
  const ok = isLogged();
  if(el('login-section')) el('login-section').style.display = ok ? 'none' : 'block';
  if(el('dashboard'))     el('dashboard').style.display     = ok ? 'block': 'none';
  if(ok) loadData();
}
window.renderGate = renderGate;

/* ── API ── */
async function apiGet(){
  const r=await fetch('/api/get'); const t=await r.text(); let j;
  try{j=JSON.parse(t);}catch{j={raw:t};}
  if(!r.ok) throw new Error(j.error||j.message||'GET '+r.status);
  return j;
}
async function apiPut(p){
  const r=await fetch('/api/put',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});
  const t=await r.text(); let j;
  try{j=JSON.parse(t);}catch{j={raw:t};}
  if(!r.ok) throw new Error(j.error||j.message||'PUT '+r.status);
  return j;
}
async function apiPublicById(id){
  const r=await fetch('/api/public?id='+encodeURIComponent(id));
  const j=await r.json();
  if(!r.ok||!j.found) throw new Error(j.message||'Nasabah tidak ditemukan');
  return j.nasabah;
}
async function apiPublicByName(n){
  const r=await fetch('/api/public?name='+encodeURIComponent(n));
  const j=await r.json();
  if(!r.ok||!j.found) throw new Error(j.message||'Nasabah tidak ditemukan');
  return j.nasabah;
}

/* ── Lots & Fee ── */
const ONE_MONTH_MS = 30*24*3600*1000;
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const genId = (taken=[]) => { let s=''; do{ s=[...Array(6)].map(()=>CHARS[Math.floor(Math.random()*CHARS.length)]).join(''); }while(taken.includes(s)); return s; };

function ensureLots(n){
  n.history = Array.isArray(n.history) ? n.history : [];
  n.lots    = Array.isArray(n.lots)    ? n.lots    : [];
  if(typeof n.dividen !== 'number') n.dividen = 0;
  if(n.lots.length===0 && Number(n.saldo||0)>0){
    let lots=[];
    const sorted=[...n.history].sort((a,b)=>(a.ts||0)-(b.ts||0));
    for(const h of sorted){
      const amt=Number(h.amount||0);
      if(h.type==='tambah' && amt>0){ lots.push({ts:h.ts||Date.now(),amount:amt,remaining:amt}); }
      else if(h.type==='tarik' && amt>0){ let need=amt; for(const l of lots){if(need<=0) break; const t=Math.min(l.remaining,need); l.remaining-=t; need-=t;} }
      else if(h.type==='koreksi'){
        if(amt>0) lots.push({ts:h.ts||Date.now(),amount:amt,remaining:amt});
        else { let need=-amt; for(const l of lots){if(need<=0) break; const t=Math.min(l.remaining,need); l.remaining-=t; need-=t;} }
      }
    }
    n.lots = lots.filter(l=>l.remaining>0);
    if(!n.lots.length) n.lots=[{ts:Date.now(),amount:Number(n.saldo||0),remaining:Number(n.saldo||0)}];
  }
  return n;
}
const lotsAdd     = (lots,amount,ts)  => [...lots,{ts,amount,remaining:amount}];
const lotsConsume = (lots,amount)     => { let need=amount; for(const l of lots){if(need<=0) break; const t=Math.min(l.remaining,need); l.remaining-=t; need-=t;} return lots.filter(l=>l.remaining>0); };
const freeAmount  = (n,now=Date.now())=> ensureLots(n).lots.reduce((s,l)=>s+(now-(l.ts||0)>=ONE_MONTH_MS?Number(l.remaining||0):0),0);

/* Tabel biaya penarikan sesuai ketentuan admin */
function adminFee(amount){
  const n = Number(amount||0);
  if(n<=0)        return 0;
  if(n<=700000)   return 5000;
  if(n<=2000000)  return 10000;
  if(n<=3000000)  return 15000;
  if(n<=5000000)  return 20000;
  if(n<=7000000)  return 25000;
  return 30000; // > 7 jt s/d 10 jt+
}

/* ── Util ── */
function buildTs(d,t){
  if(!d&&!t) return Date.now();
  const [Y,M,D]=(d||'').split('-').map(v=>parseInt(v,10));
  const [h,m]=(t||'').split(':').map(v=>parseInt(v,10));
  const now=new Date();
  return new Date(isFinite(Y)?Y:now.getFullYear(),isFinite(M)?M-1:now.getMonth(),isFinite(D)?D:now.getDate(),isFinite(h)?h:9,isFinite(m)?m:0,0,0).getTime();
}
function maskInput(id){ const x=el(id); if(!x) return; x.addEventListener('input',()=>{ x.value=fmtNum(num(x.value)); }); }

/* ── Pie chart ── */
const PALETTE    = ['#46d07d','#25b767','#1a8f4e','#5be39b','#2ab57a','#3dd28f','#1fa35a','#6ee8aa','#297c55'];
const PALETTE_PV = ['#33d17a','#2b3e33'];
let lastAdminParts=null, lastPvParts=null;

function drawDonut(canvas,parts,colors){
  if(!canvas) return;
  const rect=canvas.getBoundingClientRect();
  let w=Math.floor(rect.width||canvas.offsetWidth||200);
  let h=Math.floor(rect.height||canvas.offsetHeight||0);
  if(canvas.dataset.square==='1'){ const s=Math.max(120,Math.min(w||140,h||160)); w=s; h=s; }
  else { if(!h) h=Math.max(220,Math.floor(w*0.625)); }
  const dpr=Math.max(1,window.devicePixelRatio||1);
  canvas.width=w*dpr; canvas.height=h*dpr;
  const ctx=canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
  const cx=w/2,cy=h/2,r=Math.min(w,h)/2-14,inner=r*0.58;
  const total=parts.reduce((s,p)=>s+p.value,0)||1; let ang=-Math.PI/2;
  parts.forEach((p,i)=>{ const a=(p.value/total)*Math.PI*2; const c=colors[i%colors.length];
    ctx.beginPath(); ctx.arc(cx,cy,r,ang,ang+a); ctx.arc(cx,cy,inner,ang+a,ang,true); ctx.closePath();
    const g=ctx.createLinearGradient(0,0,w,h); g.addColorStop(0,c); g.addColorStop(1,c+'aa'); ctx.fillStyle=g; ctx.fill(); ang+=a;
  });
}
function renderLegend(container,parts,colors){
  if(!container) return;
  const total=parts.reduce((s,p)=>s+p.value,0)||1;
  container.innerHTML=parts.map((p,i)=>{
    const pct=Math.round((p.value/total)*100);
    return `<div class="item"><span class="dot" style="background:${colors[i%colors.length]}"></span><span>${p.label} — ${pct}%</span></div>`;
  }).join('');
}
window.addEventListener('resize',()=>{
  if(el('adminPie')&&lastAdminParts) drawDonut(el('adminPie'),lastAdminParts,PALETTE);
  if(el('pvPie')&&lastPvParts) drawDonut(el('pvPie'),lastPvParts,PALETTE_PV);
});

/* ── Alokasi proporsional ── */
function allocateProportional(totalAmount,list){
  const totalSaldo=list.reduce((s,n)=>s+Number(n.saldo||0),0);
  if(totalSaldo<=0) return list.map(()=>0);
  const raw=list.map(n=>(totalAmount*Number(n.saldo||0))/totalSaldo);
  const floors=raw.map(x=>Math.floor(x));
  let rem=Math.round(totalAmount-floors.reduce((s,v)=>s+v,0));
  raw.map((x,i)=>({i,frac:x-Math.floor(x)})).sort((a,b)=>b.frac-a.frac)
     .forEach((o,k)=>{ if(k<rem) floors[o.i]+=1; });
  return floors;
}

/* ── Admin helpers ── */
const indexById = id => (state.nasabah||[]).findIndex(x=>x.id===id);
const findById  = id => (state.nasabah||[]).find(x=>x.id===id);

function refreshNameLists(){
  const list=(state.nasabah||[]).map(x=>({label:`${x.nama} — ${x.id}`,value:x.id})).sort((a,b)=>a.label.localeCompare(b.label,'id'));
  const opts=list.map(r=>`<option value="${r.value}">${r.label}</option>`).join('');
  ['namaEditSel','divNamaSel','riwNama'].forEach(id=>{ const s=el(id); if(s) s.innerHTML=opts; });
}
function wireAdminInputs(){
  ['saldoBaru','saldoEdit','divJumlah','revAmount'].forEach(maskInput);
}

/* ── Admin shell HTML ── */
function adminShell(){
  return `
  <div class="cards">
    <div class="card sm"><div class="label">Total Nasabah</div><div id="statNasabah" class="value">0</div></div>
    <div class="card sm"><div class="label">Total Saldo</div><div id="statSaldo" class="value">Rp 0</div></div>
    <div class="card sm"><div class="label">Saldo Rata-rata</div><div id="statRata" class="value">Rp 0</div></div>
  </div>

  <div class="card">
    <h3>Daftar Nasabah</h3>
    <div class="table-wrap">
      <table id="tNasabah" class="table">
        <thead><tr><th>Nama</th><th>Link (?n=nama)</th><th>Saldo</th><th>Dividen</th><th>Aksi</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <h3>Tambah Nasabah</h3>
      <div class="row">
        <input id="namaBaru" placeholder="Nama nasabah" style="flex:1">
        <input id="saldoBaru" placeholder="Saldo awal (contoh 100.000)" style="flex:1">
        <button id="btnTambah" class="primary">Tambah</button>
      </div>
    </div>

    <div class="card">
      <h3>Edit Saldo</h3>
      <div class="row">
        <select id="namaEditSel" style="flex:1"></select>
        <input id="saldoEdit" placeholder="Nominal" style="flex:1">
        <select id="aksiEdit" style="flex:1">
          <option value="tambah">Tambah Saldo</option>
          <option value="kurangi">Tarik Saldo</option>
          <option value="koreksi">Koreksi</option>
        </select>
      </div>
      <div class="row" style="margin-top:8px">
        <input id="tglEdit" type="date" style="flex:1">
        <input id="jamEdit" type="time" style="flex:1">
        <input id="catatanEdit" placeholder="Catatan (opsional)" style="flex:1">
        <button id="btnEdit" class="primary">Simpan</button>
      </div>
      <div id="saldo-preview" class="card sm" style="display:none;margin-top:8px;padding:10px 14px;background:rgba(51,209,122,.08);border-color:rgba(93,255,169,.25)">
        <span id="prev-label" style="color:var(--muted)"></span>
        <span style="margin:0 8px;color:var(--brand)">→</span>
        <strong id="prev-after"></strong>
      </div>
      <p class="muted" style="margin-top:6px">Tarik tidak boleh melebihi saldo. Koreksi menyesuaikan saldo akhir.</p>
    </div>

    <div class="card">
      <h3>Edit Dividen Nasabah</h3>
      <div class="row">
        <select id="divNamaSel" style="flex:1"></select>
        <input id="divJumlah" placeholder="Nominal" style="flex:1">
        <select id="divAksi" style="flex:1">
          <option value="tambah">Tambah</option>
          <option value="kurangi">Kurangi / Tarik</option>
        </select>
      </div>
      <div class="row" style="margin-top:8px">
        <input id="divTgl" type="date" style="flex:1">
        <input id="divJam" type="time" style="flex:1">
        <input id="divCatatan" placeholder="Catatan (opsional)" style="flex:1">
        <button id="divBtn" class="primary">Simpan</button>
      </div>
      <p class="muted" style="margin-top:6px">Dividen tidak mengubah saldo pokok.</p>
    </div>

    <div class="card">
      <h3>Bagikan Penghasilan → Dividen</h3>
      <div class="row">
        <input id="revAmount" placeholder="Nominal penghasilan (contoh 1.000.000)" style="flex:1">
        <button id="revDistribute" class="primary">Bagi ke Semua</button>
      </div>
      <p class="muted" style="margin-top:6px">Dibagi proporsional terhadap saldo pokok, masuk ke Saldo Dividen masing-masing nasabah.</p>
    </div>
  </div>

  <div class="card">
    <h3>Persentase Kepemilikan (Top 8 + Lainnya)</h3>
    <canvas id="adminPie" style="width:100%;height:280px"></canvas>
    <div id="adminLegend" class="legend"></div>
  </div>

  <div class="card">
    <h3>Riwayat Transaksi</h3>
    <div class="row" style="margin-bottom:10px">
      <select id="riwNama" style="flex:1"></select>
      <button id="riwRefresh">Lihat Riwayat</button>
    </div>
    <div class="table-wrap">
      <table id="riwTable" class="table">
        <thead><tr><th>#</th><th>Tanggal</th><th>Jenis</th><th>Nominal</th><th>Catatan</th><th>Aksi</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <p id="riwEmpty" class="muted" style="display:none">Belum ada riwayat.</p>
    <p class="muted" style="margin-top:6px">⚠ Hapus riwayat tidak mengubah saldo.</p>
  </div>`;
}

/* ── Render Admin ── */
function renderAdmin(){
  const root=el('admin-root'); if(!root) return;
  root.innerHTML=adminShell();
  wireAdminInputs();

  const body=el('tNasabah').querySelector('tbody');
  const list=state.nasabah||[];
  let total=0; list.forEach(n=>total+=Number(n.saldo||0));
  el('statNasabah').textContent=list.length;
  el('statSaldo').textContent=fmt(total);
  el('statRata').textContent=fmt(list.length?Math.round(total/list.length):0);

  /* Tabel nasabah */
  body.innerHTML='';
  list.forEach(n=>{
    const linkN = `${originURL}/?n=${encodeURIComponent(n.nama)}`;
    const linkId= `${originURL}/?id=${encodeURIComponent(n.id)}`;
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td><strong>${n.nama}</strong></td>
      <td><code style="font-size:11px;color:var(--muted)">?n=${n.nama}</code></td>
      <td>${fmt(n.saldo||0)}</td>
      <td>${fmt(n.dividen||0)}</td>
      <td>
        <div class="btn-wrap">
          <a class="small" href="${linkN}" target="_blank" rel="noopener">Buka</a>
          <button class="btn-copy-green" data-nama="${n.nama}" data-saldo="${n.saldo||0}" data-link="${linkN}">📋 Salin</button>
          <button class="danger small" data-del="${n.id}">Hapus</button>
        </div>
      </td>`;
    body.appendChild(tr);
  });

  /* Salin: nama + saldo + link */
  body.querySelectorAll('button.btn-copy-green').forEach(b=>{
    b.addEventListener('click', async ()=>{
      const nama  = b.getAttribute('data-nama');
      const saldo = fmt(Number(b.getAttribute('data-saldo')||0));
      const link  = b.getAttribute('data-link');
      const text  = `Nama: ${nama}\nSaldo: ${saldo}\nLink: ${link}`;
      try{
        await navigator.clipboard.writeText(text);
        const orig=b.textContent; b.textContent='✓ Disalin!';
        setTimeout(()=>b.textContent=orig,1500);
      }catch{ prompt('Salin info ini:',text); }
    });
  });

  /* Hapus nasabah */
  body.querySelectorAll('button[data-del]').forEach(b=>{
    b.addEventListener('click', async ()=>{
      const id=b.getAttribute('data-del');
      const n=findById(id); if(!n) return;
      if(!confirm(`Hapus nasabah "${n.nama}"? Tidak bisa dibatalkan.`)) return;
      state.nasabah=(state.nasabah||[]).filter(x=>x.id!==id);
      try{ await apiPut(state); renderAdmin(); }catch(e){ alert(e.message); }
    });
  });

  refreshNameLists();

  /* Preview saldo live */
  ['namaEditSel','saldoEdit','aksiEdit'].forEach(id=>{
    const x=el(id); if(!x) return;
    x.addEventListener('input',updateSaldoPreview);
    x.addEventListener('change',updateSaldoPreview);
  });

  /* Pie chart */
  const sorted=[...list].sort((a,b)=>Number(b.saldo||0)-Number(a.saldo||0));
  const top=sorted.slice(0,8);
  const others=sorted.slice(8).reduce((s,n)=>s+Number(n.saldo||0),0);
  const parts=top.map(n=>({label:n.nama.split(' ')[0],value:Number(n.saldo||0)}));
  if(others>0) parts.push({label:'Lainnya',value:others});
  lastAdminParts=parts.length?parts:[{label:'Kosong',value:1}];
  drawDonut(el('adminPie'),lastAdminParts,PALETTE);
  renderLegend(el('adminLegend'),lastAdminParts,PALETTE);

  /* Tambah nasabah */
  el('btnTambah').addEventListener('click', async ()=>{
    const nama=(el('namaBaru').value||'').trim();
    const saldo=num(el('saldoBaru').value);
    if(!nama){ alert('Nama wajib diisi'); return; }
    const exist=(state.nasabah||[]).some(x=>(x.nama||'').toLowerCase()===nama.toLowerCase());
    if(exist){ alert('Nama sudah ada'); return; }
    const id=genId((state.nasabah||[]).map(x=>x.id));
    const now=Date.now();
    const hist=saldo>0?[{ts:now,type:'tambah',amount:saldo,note:'Setoran awal'}]:[];
    const lots=saldo>0?[{ts:now,amount:saldo,remaining:saldo}]:[];
    state.nasabah=[...(state.nasabah||[]),{id,nama,saldo,dividen:0,history:hist,lots}];
    try{ await apiPut(state); el('namaBaru').value=''; el('saldoBaru').value=''; renderAdmin(); }catch(e){ alert(e.message); }
  });

  /* Edit saldo */
  el('btnEdit').addEventListener('click', async ()=>{
    const id=el('namaEditSel').value;
    const jumlah=num(el('saldoEdit').value);
    const mode=el('aksiEdit').value;
    const note=(el('catatanEdit').value||'').trim();
    const ts=buildTs(el('tglEdit').value,el('jamEdit').value);
    if(!id||!jumlah){ alert('Pilih nasabah & isi nominal'); return; }
    const idx=indexById(id); if(idx<0){ alert('Nasabah tidak ditemukan'); return; }
    const n={...state.nasabah[idx]}; ensureLots(n);
    let delta=jumlah, type='tambah';
    if(mode==='kurangi'){
      if(jumlah>Number(n.saldo||0)){ alert(`Tarik (${fmt(jumlah)}) melebihi saldo (${fmt(n.saldo)})`); return; }
      delta=-Math.abs(jumlah); type='tarik';
      n.lots=lotsConsume(n.lots,Math.abs(delta));
    }else if(mode==='tambah'){
      n.lots=lotsAdd(n.lots,delta,ts);
    }else if(mode==='koreksi'){
      delta=jumlah-Number(n.saldo||0); type='koreksi';
      if(delta>=0) n.lots=lotsAdd(n.lots,delta,ts);
      else         n.lots=lotsConsume(n.lots,Math.abs(delta));
    }
    n.saldo=Math.max(0,Number(n.saldo||0)+delta);
    n.history=[...(n.history||[]),{ts,type,amount:Math.abs(delta),note:note||'-'}];
    state.nasabah[idx]=n;
    try{
      await apiPut(state);
      ['saldoEdit','catatanEdit','tglEdit','jamEdit'].forEach(i=>{ if(el(i)) el(i).value=''; });
      if(el('saldo-preview')) el('saldo-preview').style.display='none';
      renderAdmin();
      if(el('riwNama')&&el('riwNama').value===id) renderHistory(id);
    }catch(e){ alert(e.message); }
  });

  /* Edit dividen */
  el('divBtn').addEventListener('click', async ()=>{
    const id=el('divNamaSel').value;
    const jumlah=num(el('divJumlah').value);
    const mode=el('divAksi').value;
    const ts=buildTs(el('divTgl').value,el('divJam').value);
    const note=(el('divCatatan').value||'').trim()||(mode==='tambah'?'Penambahan dividen':'Penarikan dividen');
    if(!id||!jumlah){ alert('Pilih nasabah & isi nominal'); return; }
    const idx=indexById(id); if(idx<0){ alert('Nasabah tidak ditemukan'); return; }
    const n={...state.nasabah[idx]};
    const delta=mode==='tambah'?jumlah:-jumlah;
    if(mode==='kurangi'&&jumlah>Number(n.dividen||0)){ alert(`Melebihi dividen (${fmt(n.dividen)})`); return; }
    n.dividen=Math.max(0,Number(n.dividen||0)+delta);
    n.history=[...(n.history||[]),{ts,type:'dividen',amount:Math.abs(jumlah),note}];
    state.nasabah[idx]=n;
    try{
      await apiPut(state);
      ['divJumlah','divCatatan','divTgl','divJam'].forEach(i=>{ if(el(i)) el(i).value=''; });
      renderAdmin();
      if(el('riwNama')&&el('riwNama').value===id) renderHistory(id);
    }catch(e){ alert(e.message); }
  });

  /* Bagi penghasilan → dividen */
  el('revDistribute').addEventListener('click', async ()=>{
    const val=num(el('revAmount').value);
    if(!val){ alert('Masukkan nominal penghasilan.'); return; }
    const list=state.nasabah||[];
    const totalSaldo=list.reduce((s,n)=>s+Number(n.saldo||0),0);
    if(totalSaldo<=0){ alert('Total saldo 0 — tidak bisa membagi.'); return; }
    if(!confirm(`Bagi ${fmt(val)} ke ${list.length} nasabah secara proporsional?`)) return;
    const bags=allocateProportional(val,list);
    const ts=Date.now();
    state.nasabah=list.map((n,i)=>{
      if(!bags[i]) return n;
      return {...n, dividen:Number(n.dividen||0)+bags[i], history:[...(n.history||[]),{ts,type:'dividen',amount:bags[i],note:'Pembagian penghasilan'}]};
    });
    try{ await apiPut(state); el('revAmount').value=''; renderAdmin(); alert('Penghasilan berhasil dibagi ke dividen nasabah.'); }catch(e){ alert(e.message); }
  });

  /* Riwayat */
  el('riwRefresh').addEventListener('click',()=>renderHistory(el('riwNama').value));
  el('riwNama').addEventListener('change',e=>renderHistory(e.target.value));
}

/* ── Saldo Preview ── */
function updateSaldoPreview(){
  const id=el('namaEditSel')?.value;
  const jumlah=num(el('saldoEdit')?.value);
  const mode=el('aksiEdit')?.value;
  const prev=el('saldo-preview');
  if(!prev||!id||!jumlah){ if(prev) prev.style.display='none'; return; }
  const n=findById(id); if(!n){ prev.style.display='none'; return; }
  const cur=Number(n.saldo||0);
  let after;
  if(mode==='tambah')   after=cur+jumlah;
  else if(mode==='kurangi') after=Math.max(0,cur-jumlah);
  else after=jumlah;
  prev.style.display='flex';
  prev.style.alignItems='center';
  el('prev-label').textContent=`Saldo saat ini: ${fmt(cur)}`;
  el('prev-after').textContent=fmt(after);
}

/* ── Riwayat Admin ── */
function renderHistory(id){
  const tableBody=el('riwTable').querySelector('tbody');
  tableBody.innerHTML='';
  const n=findById(id);
  if(!n){ el('riwEmpty').style.display='block'; return; }
  const list=Array.isArray(n.history)?n.history:[];
  if(!list.length){ el('riwEmpty').style.display='block'; return; }
  el('riwEmpty').style.display='none';
  const data=list.map((x,i)=>({...x,_i:i})).sort((a,b)=>(b.ts||0)-(a.ts||0));
  data.forEach((it,row)=>{
    const d=new Date(it.ts||Date.now());
    const tgl=d.toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'});
    const jenis=(it.type||'koreksi').toLowerCase();
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${row+1}</td><td>${tgl}</td><td>${jenis[0].toUpperCase()+jenis.slice(1)}</td><td>${fmt(it.amount||0)}</td><td>${it.note||'-'}</td><td><button class="danger small" data-del="${it._i}" data-id="${n.id}">Hapus</button></td>`;
    tableBody.appendChild(tr);
  });
  tableBody.querySelectorAll('button[data-del]').forEach(b=>{
    b.addEventListener('click', async ()=>{
      const i=parseInt(b.getAttribute('data-del'),10);
      const nid=b.getAttribute('data-id');
      if(!confirm('Hapus catatan ini? (Tidak mengubah saldo)')) return;
      const idx=indexById(nid); if(idx<0) return;
      const copy={...state.nasabah[idx]};
      copy.history=(copy.history||[]).filter((_,k)=>k!==i);
      state.nasabah[idx]=copy;
      try{ await apiPut(state); renderHistory(nid); }catch(e){ alert(e.message); }
    });
  });
}

/* ── Load Data ── */
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
      if(typeof n.dividen!=='number'){ n.dividen=0; changed=true; }
      return n;
    });
    if(changed){ try{ await apiPut(state); }catch{} }
    renderAdmin();
  }catch(e){
    const root=el('admin-root');
    if(root) root.innerHTML=`<p class="muted">Gagal memuat data: ${e.message||e}</p>`;
  }
}

/* ================================================================
   PUBLIC VIEW
   ================================================================ */
function publicShell(){
  return `
  <div class="pub-hero">
    <div class="pub-hero-label">Tabungan kamu di Hepi masih tersedia</div>
    <div class="pub-hero-name" id="pv-title">—</div>
    <div class="pub-hero-amount" id="pv-saldo">Rp 0</div>
    <div class="pub-hero-since" id="pv-since"></div>
  </div>

  <div id="pv-bonus-bar" class="pub-bonus-bar" style="display:none">
    <div class="pub-bonus-icon">🎁</div>
    <div class="pub-bonus-text" id="pv-bonus-text">Kamu dapat bonus dari Hepi</div>
    <button class="btn-tarik-bonus" id="pv-btn-tarik-bonus">Tarik</button>
  </div>

  <div class="card pub-input-card">
    <div class="fee-toggle" id="fee-toggle">
      <span>ℹ Info Biaya Penarikan</span>
      <span id="fee-icon">▾</span>
    </div>
    <div id="fee-detail" style="display:none">
      <div class="fee-grid">
        <span>Rp 0 – 700.000</span><span class="fee-grid-val">Rp 5.000</span>
        <span>Rp 800.000 – 2.000.000</span><span class="fee-grid-val">Rp 10.000</span>
        <span>Rp 2.100.000 – 3.000.000</span><span class="fee-grid-val">Rp 15.000</span>
        <span>Rp 3.100.000 – 5.000.000</span><span class="fee-grid-val">Rp 20.000</span>
        <span>Rp 5.000.000 – 7.000.000</span><span class="fee-grid-val">Rp 25.000</span>
        <span>Rp 7.100.000 – 10.000.000</span><span class="fee-grid-val">Rp 30.000</span>
      </div>
      <div class="fee-free-note" id="fee-free-note"></div>
    </div>

    <div class="pub-saldo-grid" style="margin-top:10px">
      <div class="pub-saldo-item">
        <div class="label">Bisa Tarik Gratis (≥30 hari)</div>
        <div class="value" id="pv-free" style="font-size:18px">Rp 0</div>
      </div>
      <div class="pub-saldo-item">
        <div class="label">Saldo Dividen</div>
        <div class="value" id="pv-dividen" style="font-size:18px">Rp 0</div>
      </div>
    </div>

    <div class="pub-input-label" style="margin-top:12px">Nominal penarikan / setoran</div>
    <div class="pub-input-row">
      <span class="pub-input-prefix">Rp</span>
      <input id="pv-amount" placeholder="0" inputmode="numeric" />
    </div>
    <div class="pub-fee-note" id="pv-fee-note"></div>

    <div class="pub-btn-grid">
      <button id="pv-add" class="primary">+ Tambah Tabungan</button>
      <button id="pv-withdraw">↓ Tarik Tabungan</button>
    </div>
  </div>

  <div class="card">
    <div class="riw-header">
      <h3 style="margin:0">Riwayat Transaksi</h3>
      <span class="riw-count" id="pv-riw-count">0 transaksi</span>
    </div>
    <div id="pv-history-list">
      <p id="pv-empty" class="muted">Belum ada riwayat.</p>
    </div>
  </div>

  <div class="card">
    <h3>Persentase Kepemilikan</h3>
    <div class="pv-share">
      <div class="chart"><canvas id="pvPie" data-square="1" style="width:100%;height:140px"></canvas></div>
      <div class="info">
        <div id="pvLegend" class="legend"></div>
        <p id="pvShareText" class="muted"></p>
      </div>
    </div>
  </div>

  <div class="pub-footer">
    Dikelola oleh <strong>Hepi Susanto</strong> ·
    <a href="https://wa.me/6285346861655" target="_blank" rel="noopener">Hubungi via WhatsApp</a>
  </div>`;
}

function renderPublicHistory(list){
  const wrap=el('pv-history-list');
  const empty=el('pv-empty');
  const count=el('pv-riw-count');
  if(!Array.isArray(list)||!list.length){
    if(empty) empty.style.display='block';
    if(count) count.textContent='0 transaksi';
    return;
  }
  if(empty) empty.style.display='none';
  if(count) count.textContent=list.length+' transaksi';
  const sorted=[...list].sort((a,b)=>(b.ts||0)-(a.ts||0));
  wrap.innerHTML=sorted.map(it=>{
    const d=new Date(it.ts||Date.now());
    const tgl=d.toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'});
    const type=(it.type||'koreksi').toLowerCase();
    const dotCls=type==='tambah'?'riw-dot-add':type==='tarik'?'riw-dot-tarik':type==='dividen'?'riw-dot-div':'riw-dot-kor';
    const amtCls=type==='tambah'?'riw-amount-add':type==='tarik'?'riw-amount-tarik':type==='dividen'?'riw-amount-div':'riw-amount-kor';
    const label=type==='tambah'?'Setoran':type==='tarik'?'Penarikan':type==='dividen'?'Dividen':'Koreksi';
    const sign=type==='tambah'?'+':type==='tarik'?'-':type==='dividen'?'🎁':'~';
    return `<div class="riw-item">
      <div class="riw-dot ${dotCls}"></div>
      <div class="riw-info">
        <div class="riw-type">${label}${it.note&&it.note!=='-'?` — <span class="riw-note">${it.note}</span>`:''}</div>
        <div class="riw-date">${tgl}</div>
      </div>
      <div class="riw-amount ${amtCls}">${sign} ${fmt(it.amount||0)}</div>
    </div>`;
  }).join('');
}

async function loadPublicView(nas, allNasabah){
  const root=el('public-root');
  root.innerHTML=publicShell();
  ensureLots(nas);
  if(typeof nas.dividen!=='number') nas.dividen=0;

  const saldo  = Number(nas.saldo||0);
  const dividen= Number(nas.dividen||0);
  const free   = freeAmount(nas);
  const totalAll=(allNasabah||[]).reduce((s,n)=>s+Number(n.saldo||0),0);

  /* Hero */
  el('pv-title').textContent  = nas.nama;
  el('pv-saldo').textContent  = fmt(saldo);
  el('pv-free').textContent   = fmt(free);
  el('pv-dividen').textContent= fmt(dividen);

  /* Tanggal bergabung */
  const hist=nas.history||[];
  if(hist.length){
    const oldest=Math.min(...hist.map(h=>h.ts||Date.now()));
    el('pv-since').textContent='Bergabung sejak '+new Date(oldest).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
  }

  /* Bonus bar */
  if(dividen>0){
    el('pv-bonus-bar').style.display='flex';
    el('pv-bonus-text').innerHTML=`Kamu dapat bonus <strong>${fmt(dividen)}</strong> dari Hepi yang belum kamu tarik`;
    el('pv-btn-tarik-bonus').addEventListener('click',()=>{
      const msg=`Halo Mas Hepi, saya *${nas.nama}* ingin *Tarik Bonus/Dividen* sebesar *${fmt(dividen)}*.\n(Link: ${originURL}/?n=${encodeURIComponent(nas.nama)})`;
      location.href=`https://wa.me/6285346861655?text=${encodeURIComponent(msg)}`;
    });
  }

  /* Fee toggle */
  el('fee-toggle').addEventListener('click',()=>{
    const open=el('fee-detail').style.display!=='none';
    el('fee-detail').style.display=open?'none':'block';
    el('fee-icon').textContent=open?'▾':'▴';
  });

  /* Free note */
  const freeNote=el('fee-free-note');
  if(freeNote){
    if(free>=saldo&&saldo>0){
      freeNote.textContent='✅ Semua saldo sudah ≥30 hari — penarikan GRATIS!';
    }else if(free>0){
      freeNote.textContent=`✅ ${fmt(free)} sudah ≥30 hari, bisa tarik gratis sebagian`;
    }else if(hist.length){
      const oldest=Math.min(...hist.map(h=>h.ts||Date.now()));
      const sisa=30-Math.floor((Date.now()-oldest)/(1000*60*60*24));
      if(sisa>0) freeNote.textContent=`⏳ Gratis tarik dalam ${sisa} hari lagi`;
    }
  }

  /* Input nominal + fee calc */
  const amtInput=el('pv-amount');
  amtInput.addEventListener('input',()=>{
    amtInput.value=fmtNum(num(amtInput.value));
    const amt=num(amtInput.value);
    const feeNote=el('pv-fee-note');
    if(!amt){ feeNote.textContent=''; return; }
    const effectiveSaldo=saldo===0?dividen:saldo;
    const over=Math.max(0,Math.min(amt,effectiveSaldo)-free);
    const fee=over>0?adminFee(over):0;
    if(fee===0){
      feeNote.style.color='#33d17a';
      feeNote.textContent='✅ Gratis biaya penarikan';
    }else{
      feeNote.style.color='var(--muted)';
      feeNote.textContent=`Biaya: ${fmt(fee)} · Diterima: ${fmt(amt-fee)}`;
    }
  });

  /* Tombol Tambah */
  el('pv-add').addEventListener('click',()=>{
    const amt=num(amtInput.value); if(!amt){ alert('Isi nominal dulu'); return; }
    const msg=`Halo Mas Hepi, saya *${nas.nama}* ingin *Tambah Tabungan* sebesar *${fmt(amt)}*.\n(Link: ${originURL}/?n=${encodeURIComponent(nas.nama)})`;
    location.href=`https://wa.me/6285346861655?text=${encodeURIComponent(msg)}`;
  });

  /* Tombol Tarik */
  el('pv-withdraw').addEventListener('click',()=>{
    const amt=num(amtInput.value); if(!amt){ alert('Isi nominal dulu'); return; }
    const effectiveSaldo=saldo===0?dividen:saldo;
    if(amt>effectiveSaldo){ alert(`Nominal melebihi saldo (${fmt(effectiveSaldo)})`); return; }
    const over=Math.max(0,Math.min(amt,effectiveSaldo)-free);
    const fee=over>0?adminFee(over):0;
    const feeInfo=fee>0?`, biaya ${fmt(fee)}, diterima ${fmt(amt-fee)}`:', GRATIS biaya';
    const msg=`Halo Mas Hepi, saya *${nas.nama}* ingin *Tarik Tabungan* sebesar *${fmt(amt)}*${feeInfo}.\n(Link: ${originURL}/?n=${encodeURIComponent(nas.nama)})`;
    location.href=`https://wa.me/6285346861655?text=${encodeURIComponent(msg)}`;
  });

  /* Riwayat */
  renderPublicHistory(hist);

  /* Pie */
  const share=totalAll>0?(saldo/totalAll)*100:0;
  const you=Math.round(share), other=Math.max(0,100-you);
  lastPvParts=[{label:nas.nama.split(' ')[0],value:you},{label:'Lainnya',value:other}];
  drawDonut(el('pvPie'),lastPvParts,PALETTE_PV);
  renderLegend(el('pvLegend'),lastPvParts,PALETTE_PV);
  el('pvShareText').textContent=`${nas.nama} ${you}% vs Lainnya ${other}%`;
}

/* ================================================================
   LOGIN
   ================================================================ */
el('btnLogin')?.addEventListener('click', async ()=>{
  const u=(el('user')?.value||'').trim();
  const p=(el('pass')?.value||'').trim();
  const msg=el('loginMsg');
  if(!u||!p){ if(msg) msg.textContent='Isi username & password.'; return; }
  if(msg) msg.textContent='Memproses…';
  try{
    const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
    const t=await r.text(); let j; try{j=JSON.parse(t);}catch{j={ok:false,message:t};}
    if(!r.ok||!j.ok){ if(msg) msg.textContent=j.message||`Login gagal (${r.status})`; return; }
    setLogged(true); if(msg) msg.textContent=''; renderGate();
  }catch(e){ if(msg) msg.textContent='Error: '+(e?.message||e); }
});
el('btnLogout')?.addEventListener('click',()=>{ setLogged(false); renderGate(); });
el('pass')?.addEventListener('keydown',e=>{ if(e.key==='Enter') el('btnLogin')?.click(); });

/* ================================================================
   ROUTER
   ================================================================ */
(async function boot(){
  if(qId || qName){
    /* Sembunyikan topbar admin & login, tampilkan public */
    if(el('topbar'))       el('topbar').style.display='none';
    if(el('login-section'))el('login-section').style.display='none';
    if(el('dashboard'))    el('dashboard').style.display='none';
    if(el('public-view'))  el('public-view').style.display='block';

    try{
      let nas;
      if(qId)   nas=await apiPublicById(qId);
      else      nas=await apiPublicByName(qName);

      /* Ambil semua data untuk pie */
      let allNasabah=[];
      try{ const all=await apiGet(); allNasabah=all.nasabah||[]; }catch{}

      await loadPublicView(nas, allNasabah);
    }catch(e){
      el('public-root').innerHTML=`
        <div class="notfound">
          <div class="logo-h">H</div>
          <h2>Tautan Tidak Valid</h2>
          <p>${e.message||'Nasabah tidak ditemukan.'}</p>
          <a href="https://wa.me/6285346861655" class="primary" style="display:inline-block;padding:10px 20px;border-radius:12px;text-decoration:none;background:var(--brand);color:#062915;font-weight:700">Hubungi Admin</a>
        </div>`;
    }
  }else{
    renderGate();
  }
})();
