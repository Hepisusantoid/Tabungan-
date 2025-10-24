/***** ====== APP.JS — Versi Lengkap (login OK + public link + dividen + donut chart + hero) ====== *****/

/* ================== ELEMENTS ================== */
const els = {
  // Bars / sections
  topbar: document.getElementById('topbar'),
  login: document.getElementById('login-section'),
  dash: document.getElementById('dashboard'),
  pv: document.getElementById('public-view'),

  // Login/out
  btnLogin: document.getElementById('btnLogin'),
  loginMsg: document.getElementById('loginMsg'),
  btnLogout: document.getElementById('btnLogout'),

  // Stats (admin)
  statNasabah: document.getElementById('statNasabah'),
  statSaldo: document.getElementById('statSaldo'),
  statRata: document.getElementById('statRata'),

  // Tabel daftar nasabah
  tBody: document.querySelector('#tNasabah tbody'),

  // Tambah nasabah
  namaBaru: document.getElementById('namaBaru'),
  saldoBaru: document.getElementById('saldoBaru'),
  btnTambah: document.getElementById('btnTambah'),

  // Edit saldo + tanggal
  namaEditSel: document.getElementById('namaEditSel'),
  saldoEdit: document.getElementById('saldoEdit'),
  aksiEdit: document.getElementById('aksiEdit'),
  tglEdit: document.getElementById('tglEdit'),
  jamEdit: document.getElementById('jamEdit'),
  catatanEdit: document.getElementById('catatanEdit'),
  btnEdit: document.getElementById('btnEdit'),

  // Edit dividen
  divNamaSel: document.getElementById('divNamaSel'),
  divJumlah: document.getElementById('divJumlah'),
  divAksi: document.getElementById('divAksi'),
  divTgl: document.getElementById('divTgl'),
  divJam: document.getElementById('divJam'),
  divCatatan: document.getElementById('divCatatan'),
  divBtn: document.getElementById('divBtn'),

  // Riwayat admin
  riwNama: document.getElementById('riwNama'),
  riwRefresh: document.getElementById('riwRefresh'),
  riwTableBody: document.querySelector('#riwTable tbody'),
  riwEmpty: document.getElementById('riwEmpty'),

  // Edit nama nasabah
  oldNameSel: document.getElementById('oldNameSel'),
  newName: document.getElementById('newName'),
  btnRename: document.getElementById('btnRename'),

  // Revenue share → dividen
  revAmount: document.getElementById('revAmount'),
  revDistribute: document.getElementById('revDistribute'),

  // Admin pie
  adminPie: document.getElementById('adminPie'),
  adminLegend: document.getElementById('adminLegend'),

  /* ===== PUBLIC VIEW ===== */
  pvTitle: document.getElementById('pv-title'),
  pvSaldo: document.getElementById('pv-saldo'),
  pvDividen: document.getElementById('pv-dividen'),
  pvFree: document.getElementById('pv-free'),
  pvAmount: document.getElementById('pv-amount'),
  pvAdd: document.getElementById('pv-add'),
  pvWithdraw: document.getElementById('pv-withdraw'),
  pvFee: document.getElementById('pv-fee'),
  pvHistory: document.querySelector('#pv-history tbody'),
  pvEmpty: document.getElementById('pv-empty'),
  pvPie: document.getElementById('pvPie'),
  pvLegend: document.getElementById('pvLegend'),
  pvShareText: document.getElementById('pvShareText'),
  pvHero: document.getElementById('pv-hero'), // hero image di halaman nasabah
};

/* ================== STATE & CONST ================== */
let state = { nasabah: [] };
const ONE_MONTH_MS = 30 * 24 * 3600 * 1000;
const originURL = (location.origin || '').replace(/\/$/, '');
const search = new URLSearchParams(location.search);
const qId = search.get('id');
const qName = search.get('n') || search.get('name');

/* ================== AUTH + GATE ================== */
function isLogged() { try { return localStorage.getItem('tabungan_logged') === '1'; } catch { return false; } }
function setLogged(v) { try { v ? localStorage.setItem('tabungan_logged','1') : localStorage.removeItem('tabungan_logged'); } catch {} }
function renderGate() {
  const ok = isLogged();
  if (els.login) els.login.style.display = ok ? 'none' : 'block';
  if (els.dash)  els.dash.style.display  = ok ? 'block' : 'none';
  if (ok && typeof loadData === 'function') { try { loadData(); } catch {} }
}
window.renderGate = renderGate;

/* ================== FORMAT & INPUT ================== */
const nfRupiah = new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', maximumFractionDigits:0 });
const nfPlain  = new Intl.NumberFormat('id-ID', { maximumFractionDigits:0 });
const fmt = n => nfRupiah.format(Number(n)||0);
const fmtNum = n => nfPlain.format(Number(n)||0);
const parseNum = s => Number((s||'').toString().replace(/[^\d]/g,'')) || 0;

['saldoBaru','saldoEdit','pv-amount','revAmount','divJumlah'].forEach(id=>{
  const el = document.getElementById(id); if(!el) return;
  el.addEventListener('input', ()=> el.value = fmtNum(parseNum(el.value)));
});

/* ================== API WRAPPERS ================== */
async function callGet(){ const r=await fetch('/api/get'); const t=await r.text(); let j; try{ j=JSON.parse(t);}catch{ j={raw:t} } if(!r.ok) throw new Error(j.error||j.message||`GET ${r.status}`); return j; }
async function callPut(p){ const r=await fetch('/api/put',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)}); const t=await r.text(); let j; try{ j=JSON.parse(t);}catch{ j={raw:t} } if(!r.ok) throw new Error(j.error||j.message||`PUT ${r.status}`); return j; }
async function callPublicById(id){ const r=await fetch('/api/public?id='+encodeURIComponent(id)); const j=await r.json(); if(!r.ok||!j.found) throw new Error(j.message||'Nasabah tidak ditemukan'); return j.nasabah; }
async function callPublicByName(name){ const r=await fetch('/api/public?name='+encodeURIComponent(name)); const j=await r.json(); if(!r.ok||!j.found) throw new Error(j.message||'Nasabah tidak ditemukan'); return j.nasabah; }

/* ================== ID & LOTS (≥30 hari) ================== */
const genId = (exists=[]) => { const cs='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; do{ s=[...Array(6)].map(()=>cs[Math.floor(Math.random()*cs.length)]).join(''); } while(exists.includes(s)); return s; };

function ensureLots(n){
  n.history = Array.isArray(n.history) ? n.history : [];
  n.lots    = Array.isArray(n.lots)    ? n.lots    : [];
  if (n.lots.length === 0) {
    // rebuild dari history
    let lots = [];
    const sorted = [...n.history].sort((a,b)=>(a.ts||0)-(b.ts||0));
    for (const h of sorted) {
      const amt = Number(h.amount||0);
      if (h.type === 'tambah' && amt > 0) {
        lots.push({ ts:h.ts||Date.now(), amount:amt, remaining:amt });
      } else if (h.type === 'tarik' && amt > 0) {
        let need = amt;
        for (const l of lots) {
          if (need <= 0) break;
          const take = Math.min(l.remaining, need);
          l.remaining -= take;
          need -= take;
        }
      } else if (h.type === 'koreksi') {
        if (amt > 0) lots.push({ ts:h.ts||Date.now(), amount:amt, remaining:amt });
        if (amt < 0) {
          let need = -amt;
          for (const l of lots) {
            if (need <= 0) break;
            const take = Math.min(l.remaining, need);
            l.remaining -= take;
            need -= take;
          }
        }
      }
    }
    n.lots = lots.filter(l=>l.remaining>0);
    if (n.lots.length===0 && Number(n.saldo||0)>0) {
      n.lots=[{ ts:Date.now(), amount:Number(n.saldo||0), remaining:Number(n.saldo||0) }];
    }
  }
  if (typeof n.dividen!=='number') n.dividen=0;
  return n;
}
function lotsConsume(lots,amount){ let need=amount; for(const l of lots){ if(need<=0) break; const take=Math.min(l.remaining,need); l.remaining-=take; need-=take; } return lots.filter(l=>l.remaining>0); }
function lotsAdd(lots,amount,ts){ lots.push({ts,amount,remaining:amount}); return lots; }
const freeAmount = (n,now=Date.now()) => ensureLots(n).lots.reduce((s,l)=>s+(now-(l.ts||0)>=ONE_MONTH_MS?Number(l.remaining||0):0),0);

/* ================== ADMIN FEE (<30 hari) ================== */
function adminFee(x){
  const n=Number(x||0); if(n<=0) return 0;
  if(n<350000) return 3000;
  if(n<600000) return 5000;
  if(n<800000) return 7000;
  if(n<2000000) return 10000;
  if(n<5500000) return 20000;
  if(n<6500000) return 25000;
  if(n<15000000) return 30000;
  const extra=n-15000000;
  const blocks=Math.ceil(extra/1000000);
  return 30000 + blocks*2000;
}

/* ================== DONUT CHART (tanpa library) ================== */
const PALETTE = ['#46d07d','#25b767','#1a8f4e','#5be39b','#2ab57a','#3dd28f','#1fa35a','#6ee8aa','#297c55'];
const PALETTE_PV = ['#46d07d','#2b3e33'];
let lastAdminParts=null, lastPvParts=null;

function drawDonut(canvas, parts, colors){
  if(!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const baseW = Math.floor(rect.width || canvas.offsetWidth || 320);
  if (baseW === 0) { setTimeout(()=>drawDonut(canvas,parts,colors), 120); return; }
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const baseH = Math.max(220, Math.floor(baseW*0.625));
  canvas.width = baseW*dpr; canvas.height = baseH*dpr;
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0);
  const W=baseW, H=baseH; ctx.clearRect(0,0,W,H);

  const cx=W/2, cy=H/2;
  const r=Math.min(W,H)/2-14;
  const inner=r*0.58;

  const total=parts.reduce((s,p)=>s+p.value,0)||1;
  let start=-Math.PI/2;
  parts.forEach((p,i)=>{
    const ang=(p.value/total)*Math.PI*2;
    const c=colors[i%colors.length];
    ctx.beginPath();
    ctx.arc(cx,cy,r,start,start+ang);
    ctx.arc(cx,cy,inner,start+ang,start,true);
    ctx.closePath();
    const g=ctx.createLinearGradient(0,0,W,H);
    g.addColorStop(0,c); g.addColorStop(1,c+'aa');
    ctx.fillStyle=g;
    ctx.fill();
    start+=ang;
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
  if(els.adminPie && lastAdminParts) drawDonut(els.adminPie,lastAdminParts,PALETTE);
  if(els.pvPie && lastPvParts)       drawDonut(els.pvPie,lastPvParts,PALETTE_PV);
});

/* ================== ADMIN HELPERS ================== */
function refreshNameLists(){
  const rows=(state.nasabah||[]).map(x=>({label:`${x.nama} — ${x.id}`, value:x.id})).sort((a,b)=>a.label.localeCompare(b.label,'id'));
  const fill = sel => { if(!sel) return; sel.innerHTML = rows.map(r=>`<option value="${r.value}">${r.label}</option>`).join(''); };
  fill(els.namaEditSel); fill(els.riwNama); fill(els.oldNameSel); fill(els.divNamaSel);
}
const indexById = id => (state.nasabah||[]).findIndex(x=>x.id===id);
const findById  = id => (state.nasabah||[]).find(x=>x.id===id);

/* ================== RENDER ADMIN ================== */
function renderAdmin(){
  refreshNameLists();

  const list=state.nasabah||[];
  let total=0; list.forEach(x=> total += Number(x.saldo||0));
  els.statNasabah.textContent = list.length;
  els.statSaldo.textContent   = fmt(total);
  els.statRata.textContent    = fmt(list.length ? Math.round(total/list.length) : 0);

  // Tabel nasabah
  els.tBody.innerHTML='';
  list.forEach(n=>{
    const link=`${originURL}/?id=${encodeURIComponent(n.id)}`;
    const tr=document.createElement('tr');
    tr.innerHTML = `
      <td>${n.nama}</td>
      <td>${n.id}</td>
      <td>${fmt(n.saldo||0)}</td>
      <td>${fmt(n.dividen||0)}</td>
      <td>
        <a class="small chip" href="${link}" target="_blank" rel="noopener">Buka</a>
        <button class="small" data-copy="${link}">Salin</button>
        <button class="danger small" data-del="${n.id}">Hapus</button>
      </td>`;
    els.tBody.appendChild(tr);
  });

  // aksi salin / hapus
  els.tBody.querySelectorAll('button[data-copy]').forEach(b=>{
    b.addEventListener('click', async ()=>{
      const url=b.getAttribute('data-copy');
      try{ await navigator.clipboard.writeText(url); b.textContent='Disalin!'; setTimeout(()=>b.textContent='Salin',1200);}catch{ prompt('Salin link ini:', url); }
    });
  });
  els.tBody.querySelectorAll('button[data-del]').forEach(b=>{
    b.addEventListener('click', async ()=>{
      const id=b.getAttribute('data-del'); const n=findById(id); if(!n) return;
      if(!confirm(`Hapus nasabah "${n.nama}" (${n.id})?`)) return;
      state.nasabah=(state.nasabah||[]).filter(x=>x.id!==id);
      try{ await callPut(state); renderAdmin(); } catch(e){ alert(e.message); }
    });
  });

  // Pie Admin (top 8 + Lainnya)
  if (els.adminPie) {
    const sorted=[...list].sort((a,b)=>Number(b.saldo||0)-Number(a.saldo||0));
    const top=sorted.slice(0,8);
    const others=sorted.slice(8).reduce((s,n)=>s+Number(n.saldo||0),0);
    const parts=top.map(n=>({label:n.nama.split(' ')[0], value:Number(n.saldo||0)}));
    if(others>0) parts.push({label:'Lainnya', value:others});
    lastAdminParts = parts.length?parts:[{label:'Kosong', value:1}];
    drawDonut(els.adminPie,lastAdminParts,PALETTE);
    renderLegend(els.adminLegend,lastAdminParts,PALETTE);
  }
}

/* ================== LOAD (migrasi ID/dividen/lot) ================== */
async function loadData(){
  try{
    const data=await callGet();
    if(!Array.isArray(data.nasabah)) data.nasabah=[];
    let changed=false;
    const ids=new Set();

    state.nasabah = data.nasabah.map(x=>{
      const n={...x};
      if(!n.id){ n.id=genId([...ids]); changed=true; }
      ids.add(n.id);
      if (typeof n.dividen!=='number') n.dividen=0;
      if (typeof n.bonus==='number' && n.bonus>0){ n.dividen+=n.bonus; n.bonus=0; changed=true; }
      ensureLots(n);
      return n;
    });

    if (changed) { try{ await callPut(state); }catch{} }
    els.msg && (els.msg.textContent='');
    renderAdmin();
  }catch(e){
    els.msg && (els.msg.textContent='GET error → '+(e.message||e));
  }
}

/* ================== TAMBAH NASABAH ================== */
els.btnTambah?.addEventListener('click', async ()=>{
  const nama=(els.namaBaru.value||'').trim();
  const saldo=parseNum(els.saldoBaru.value);
  if(!nama){ alert('Nama wajib'); return; }
  const exist=(state.nasabah||[]).some(x=>(x.nama||'').toLowerCase()===nama.toLowerCase());
  if(exist){ alert('Nama sudah ada'); return; }
  const id=genId((state.nasabah||[]).map(x=>x.id));
  const now=Date.now();
  const history = saldo>0 ? [{ ts:now, type:'tambah', amount:saldo, note:'Setoran awal' }] : [];
  const lots    = saldo>0 ? [{ ts:now, amount:saldo, remaining:saldo }] : [];
  state.nasabah=[...(state.nasabah||[]), { id, nama, saldo, dividen:0, history, lots }];
  try{
    await callPut(state);
    els.namaBaru.value=''; els.saldoBaru.value='';
    renderAdmin();
  }catch(e){ alert(e.message); }
});

/* ================== UTIL WAKTU ================== */
function buildTs(d,t){
  if(!d && !t) return Date.now();
  const [Y,M,D] = (d||'').split('-').map(v=>parseInt(v,10));
  const [h,m]   = (t||'').split(':').map(v=>parseInt(v,10));
  return new Date(
    isFinite(Y)?Y:new Date().getFullYear(),
    isFinite(M)?M-1:new Date().getMonth(),
    isFinite(D)?D:new Date().getDate(),
    isFinite(h)?h:9, isFinite(m)?m:0, 0, 0
  ).getTime();
}

/* ================== EDIT SALDO ================== */
els.btnEdit?.addEventListener('click', async ()=>{
  const id=els.namaEditSel.value;
  const jumlah=parseNum(els.saldoEdit.value);
  const mode=els.aksiEdit.value;
  const note=(els.catatanEdit.value||'').trim();
  const ts = buildTs(els.tglEdit.value, els.jamEdit.value);

  if(!id || !jumlah){ alert('Pilih nasabah & isi jumlah'); return; }
  const idx=indexById(id); if(idx<0){ alert('Nasabah tidak ditemukan'); return; }
  const n={...state.nasabah[idx]}; ensureLots(n);

  let delta=jumlah;
  if (mode==='kurangi'){
    if (jumlah>Number(n.saldo||0)) { alert(`Penarikan (${fmt(jumlah)}) melebihi saldo (${fmt(n.saldo||0)}).`); return; }
    delta=-Math.abs(jumlah);
    n.lots = lotsConsume(n.lots, Math.abs(delta));
  } else if (mode==='tambah'){
    n.lots = lotsAdd(n.lots, delta, ts);
  } else if (mode==='koreksi'){
    delta = jumlah - Number(n.saldo||0);
    if (delta>=0) n.lots = lotsAdd(n.lots, delta, ts);
    else          n.lots = lotsConsume(n.lots, Math.abs(delta));
  }

  n.saldo = Math.max(0, Number(n.saldo||0)+delta);
  n.history = [...(n.history||[]), {
    ts,
    type: (mode==='koreksi' ? 'koreksi' : (delta>=0 ? 'tambah' : 'tarik')),
    amount: Math.abs(delta),
    note: note || (mode==='koreksi' ? 'Penyesuaian saldo' : (delta>=0 ? 'Setoran' : 'Penarikan'))
  }];

  state.nasabah[idx]=n;
  try{
    await callPut(state);
    els.saldoEdit.value=''; els.catatanEdit.value=''; els.tglEdit.value=''; els.jamEdit.value='';
    renderAdmin(); if(els.riwNama.value===id) renderHistoryAdmin(id);
  }catch(e){ alert(e.message); }
});

/* ================== EDIT DIVIDEN ================== */
els.divBtn?.addEventListener('click', async ()=>{
  const id=els.divNamaSel.value;
  const jumlah=parseNum(els.divJumlah.value);
  const mode=els.divAksi.value;
  const ts = buildTs(els.divTgl.value, els.divJam.value);
  const note=(els.divCatatan.value||'').trim() || (mode==='tambah'?'Penambahan dividen':'Penarikan dividen');

  if(!id||!jumlah){ alert('Pilih nasabah & isi jumlah'); return; }
  const idx=indexById(id); if(idx<0){ alert('Nasabah tidak ditemukan'); return; }

  const n={...state.nasabah[idx]};
  let delta = mode==='tambah' ? jumlah : -jumlah;
  if (mode==='kurangi' && jumlah>Number(n.dividen||0)) { alert('Lebih besar dari dividen saat ini.'); return; }

  n.dividen = Math.max(0, Number(n.dividen||0) + delta);
  n.history = [...(n.history||[]), { ts, type:'dividen', amount:Math.abs(jumlah), note }];

  state.nasabah[idx]=n;
  try{
    await callPut(state);
    els.divJumlah.value=''; els.divCatatan.value=''; els.divTgl.value=''; els.divJam.value='';
    renderAdmin(); if(els.riwNama.value===id) renderHistoryAdmin(id);
  }catch(e){ alert(e.message); }
});

/* ================== HISTORY (ADMIN) ================== */
function renderHistoryAdmin(id){
  const n=findById(id);
  els.riwTableBody.innerHTML='';
  if(!n){ els.riwEmpty.style.display='block'; return; }
  const list=Array.isArray(n.history)?n.history:[];
  if(list.length===0){ els.riwEmpty.style.display='block'; return; }

  els.riwEmpty.style.display='none';
  const data=list.map((x,i)=>({...x,_i:i})).sort((a,b)=>(b.ts||0)-(a.ts||0));
  data.forEach((it,row)=>{
    const d=new Date(it.ts||Date.now());
    const tgl=d.toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'});
    let jenis=(it.type||'koreksi').toLowerCase();
    if (jenis==='bonus') jenis='dividen';
    const cls = jenis==='tambah'?'add' : jenis==='tarik'?'withdraw' : jenis==='dividen'?'add' : 'koreksi';
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${row+1}</td><td>${tgl}</td><td><span class="badge ${cls}">${jenis[0].toUpperCase()+jenis.slice(1)}</span></td><td>${fmt(it.amount||0)}</td><td>${it.note||'-'}</td><td><button class="danger small" data-del="${it._i}" data-id="${n.id}">Hapus</button></td>`;
    els.riwTableBody.appendChild(tr);
  });

  // hapus entry (tidak rekalkulasi saldo; hanya catatan)
  els.riwTableBody.querySelectorAll('button[data-del]').forEach(b=>{
    b.addEventListener('click', async ()=>{
      const i=parseInt(b.getAttribute('data-del'),10);
      const id=b.getAttribute('data-id');
      if(!confirm('Hapus catatan ini? (Tidak mengubah saldo/lots/dividen)')) return;
      const idx=indexById(id); if(idx<0) return;
      const copy={...state.nasabah[idx]};
      copy.history=(copy.history||[]).filter((_,k)=>k!==i);
      state.nasabah[idx]=copy;
      try{ await callPut(state); renderHistoryAdmin(id); }catch(e){ alert(e.message); }
    });
  });
}
els.riwRefresh?.addEventListener('click', ()=> renderHistoryAdmin(els.riwNama.value));
els.riwNama?.addEventListener('change', ()=> renderHistoryAdmin(els.riwNama.value));

/* ================== REVENUE SHARE → DIVIDEN ================== */
els.revDistribute?.addEventListener('click', async ()=>{
  const totalIncome=parseNum(els.revAmount.value);
  if(!totalIncome){ alert('Isi nominal penghasilan'); return; }

  const baseTotal=(state.nasabah||[]).reduce((s,n)=>s+Number(n.saldo||0),0);
  if(baseTotal<=0){ alert('Total saldo 0. Tidak bisa membagi.'); return; }

  const updated=(state.nasabah||[]).map(n=>{
    const p = Number(n.saldo||0)/baseTotal;
    const share = Math.floor(totalIncome * p);
    const nn = { ...n, dividen: Number(n.dividen||0) + share };
    nn.history = [...(nn.history||[]), { ts: Date.now(), type:'dividen', amount:share, note:'Pembagian penghasilan (dividen)' }];
    return nn;
  });
  state.nasabah = updated;

  try{
    await callPut(state);
    els.revAmount.value='';
    renderAdmin();
    alert('Dividen berhasil dibagi ke seluruh nasabah.');
  }catch(e){ alert(e.message); }
});

/* ================== EDIT NAMA ================== */
els.btnRename?.addEventListener('click', async ()=>{
  const id=els.oldNameSel.value;
  const baru=(els.newName.value||'').trim();
  if(!id||!baru){ alert('Pilih nasabah & isi nama baru'); return; }
  const idx=indexById(id); if(idx<0){ alert('Nasabah tidak ditemukan'); return; }
  state.nasabah[idx]={ ...state.nasabah[idx], nama:baru };
  try{ await callPut(state); els.newName.value=''; renderAdmin(); }catch(e){ alert(e.message); }
});

/* ================== PUBLIC VIEW (NASABAH) ================== */
function renderPublicHistory(list){
  els.pvHistory.innerHTML='';
  if(!Array.isArray(list)||list.length===0){ els.pvEmpty.style.display='block'; return; }
  els.pvEmpty.style.display='none';
  const data=[...list].sort((a,b)=>(b.ts||0)-(a.ts||0));
  data.forEach(it=>{
    const d=new Date(it.ts||Date.now());
    const tgl=d.toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'});
    let jenis=(it.type||'koreksi').toLowerCase();
    if (jenis==='bonus') jenis='dividen';
    const cls= jenis==='tambah'?'add' : jenis==='tarik'?'withdraw' : jenis==='dividen'?'add':'koreksi';
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${tgl}</td><td><span class="badge ${cls}">${jenis[0].toUpperCase()+jenis.slice(1)}</span></td><td>${fmt(it.amount||0)}</td><td>${it.note||'-'}</td>`;
    els.pvHistory.appendChild(tr);
  });
}
function drawPublicPie(nama, share){
  const you=Math.round(share);
  const other=Math.max(0,100-you);
  lastPvParts=[{label:nama.split(' ')[0], value:you},{label:'Lainnya', value:other}];
  drawDonut(els.pvPie,lastPvParts,PALETTE_PV);
  renderLegend(els.pvLegend,lastPvParts,PALETTE_PV);
  els.pvShareText.textContent = `${nama} ${you}% vs Lainnya ${other}%`;
}
function updatePublicStats(nas, totalAll){
  const free = freeAmount(nas);
  els.pvSaldo.textContent   = fmt(nas.saldo||0);
  els.pvDividen.textContent = fmt(nas.dividen||0);
  els.pvFree.textContent    = fmt(free);

  const share = totalAll>0 ? (Number(nas.saldo||0)/totalAll)*100 : 0;
  drawPublicPie(nas.nama, share);

  const val=parseNum(els.pvAmount.value);
  if(!val){ els.pvFee.textContent=''; return; }
  const needFeeBase=Math.max(0, Math.min(val, Number(nas.saldo||0)) - free);
  if(needFeeBase<=0){ els.pvFee.textContent='Tarik nominal ini: GRATIS (semua telah ≥ 30 hari).'; return; }
  const fee=adminFee(needFeeBase);
  els.pvFee.textContent=`Perkiraan biaya admin untuk nominal ini: ${fmt(fee)} (karena Rp ${fmtNum(needFeeBase)} masih < 30 hari).`;
}
async function loadPublicById(id){
  try{
    const nas = await callPublicById(id); ensureLots(nas);
    if (typeof nas.dividen!=='number') nas.dividen=0;
    if (typeof nas.bonus==='number' && nas.bonus>0){ nas.dividen+=nas.bonus; nas.bonus=0; }

    const all=await callGet();
    const totalAll=(all.nasabah||[]).reduce((s,n)=>s+Number(n.saldo||0),0);

    // Hero image alt + fallback hide
    if(els.pvHero){ els.pvHero.alt=`Tabungan ${nas.nama}`; els.pvHero.onerror=()=>{ const w=els.pvHero.closest('.hero'); if(w) w.style.display='none'; }; }

    els.pvTitle.textContent = `Halo, ${nas.nama}`;
    renderPublicHistory(nas.history||[]);
    updatePublicStats(nas, totalAll);

    // WhatsApp links (tidak mengubah data)
    const wa = (type, amount)=>{
      const nominal=parseNum(amount);
      const free=freeAmount(nas);
      const over=Math.max(0, nominal - free);
      const fee = over>0 ? adminFee(over) : 0;
      const action = type==='add' ? 'Tambah Tabungan' : 'Tarik Tabungan';
      const msg = `Halo Mas Hepi, saya *${nas.nama}* (ID: ${nas.id}) ingin *${action}* sebesar *${fmt(nominal)}*.` +
        (type==='withdraw' && fee>0 ? ` Perkiraan biaya admin: *${fmt(fee)}*.` : '') +
        ` (Link: ${originURL}/?id=${encodeURIComponent(nas.id)})`;
      return `https://wa.me/6285346861655?text=${encodeURIComponent(msg)}`;
    };

    els.pvAmount.addEventListener('input', ()=> updatePublicStats(nas, totalAll));
    els.pvAdd.addEventListener('click', ()=>{
      const n=parseNum(els.pvAmount.value); if(!n){ alert('Isi nominal dulu'); return; }
      location.href = wa('add', n);
    });
    els.pvWithdraw.addEventListener('click', ()=>{
      const n=parseNum(els.pvAmount.value); if(!n){ alert('Isi nominal dulu'); return; }
      if (n > Number(nas.saldo||0)) { alert('Nominal melebihi saldo pokok.'); return; }
      location.href = wa('withdraw', n);
    });
  }catch(e){
    els.pv.style.display='block';
    els.pv.innerHTML = `<h2>Tautan tidak valid</h2><p class="muted">${e.message||'Error'}</p>`;
  }
}
async function loadPublicByName(name){ const nas=await callPublicByName(name); location.replace(`/?id=${encodeURIComponent(nas.id)}`); }

/* ================== LOGIN / LOGOUT ================== */
els.btnLogin?.addEventListener('click', async ()=>{
  const u=(document.getElementById('user')?.value||'').trim();
  const p=(document.getElementById('pass')?.value||'').trim();
  if (!u || !p) { if(els.loginMsg) els.loginMsg.textContent='Isi username & password.'; return; }
  if (els.loginMsg) els.loginMsg.textContent='Memproses…';
  try{
    const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
    const text=await r.text(); let j; try{ j=JSON.parse(text); }catch{ j={ok:false,message:text}; }
    if(!r.ok || !j.ok){ if(els.loginMsg) els.loginMsg.textContent=j.message||`Login gagal (${r.status})`; return; }
    setLogged(true);
    if (els.loginMsg) els.loginMsg.textContent='Berhasil. Membuka dashboard…';
    renderGate();
  }catch(e){ if(els.loginMsg) els.loginMsg.textContent='Error login: '+(e?.message||e); }
});
els.btnLogout?.addEventListener('click', ()=>{ setLogged(false); renderGate(); });

/* ================== ROUTER ================== */
if (qId || qName) {
  // Mode public link
  if (els.topbar) els.topbar.style.display='none';
  document.querySelectorAll('.tab').forEach(el=> el.style.display='none');
  els.pv && (els.pv.style.display='block');
  (qId ? loadPublicById(qId) : loadPublicByName(qName));
} else {
  // Mode admin
  renderGate();
}
```0
