/***** APP.JS (dengan hero image di public view) *****/

// ... (bagian atas tetap sama seperti versi terakhir)
const els = {
  topbar: document.getElementById('topbar'),

  login: document.getElementById('login-section'),
  dash: document.getElementById('dashboard'),
  btnLogout: document.getElementById('btnLogout'),

  statNasabah: document.getElementById('statNasabah'),
  statSaldo: document.getElementById('statSaldo'),
  statRata: document.getElementById('statRata'),

  tBody: document.querySelector('#tNasabah tbody'),

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

  // edit dividen
  divNamaSel: document.getElementById('divNamaSel'),
  divJumlah: document.getElementById('divJumlah'),
  divAksi: document.getElementById('divAksi'),
  divTgl: document.getElementById('divTgl'),
  divJam: document.getElementById('divJam'),
  divCatatan: document.getElementById('divCatatan'),
  divBtn: document.getElementById('divBtn'),

  riwNama: document.getElementById('riwNama'),
  riwRefresh: document.getElementById('riwRefresh'),
  riwTableBody: document.querySelector('#riwTable tbody'),
  riwEmpty: document.getElementById('riwEmpty'),

  oldNameSel: document.getElementById('oldNameSel'),
  newName: document.getElementById('newName'),
  btnRename: document.getElementById('btnRename'),

  revAmount: document.getElementById('revAmount'),
  revDistribute: document.getElementById('revDistribute'),

  btnLogin: document.getElementById('btnLogin'),
  loginMsg: document.getElementById('loginMsg'),
  msg: document.getElementById('msg'),

  // Public view
  pv: document.getElementById('public-view'),
  pvTitle: document.getElementById('pv-title'),
  pvSaldo: document.getElementById('pv-saldo'),
  pvDividen: document.getElementById('pv-dividen'),
  pvFree: document.getElementById('pv-free'),
  pvAmount: document.getElementById('pv-amount'),
  pvAdd: document.getElementById('pv-add'),
  pvWithdraw: document.getElementById('pv-withdraw'),
  pvHistory: document.querySelector('#pv-history tbody'),
  pvEmpty: document.getElementById('pv-empty'),
  pvFee: document.getElementById('pv-fee'),
  pvPie: document.getElementById('pvPie'),
  pvLegend: document.getElementById('pvLegend'),
  pvShareText: document.getElementById('pvShareText'),
  pvHero: document.getElementById('pv-hero'),        // ⬅️ hero image
};

// ………… (semua helper/formatting/lot/admin fee/auth/chart/legend sama seperti versi terakhir yang sudah jalan) …………

// di awal, kalau gambar error → sembunyikan container hero
if (els.pvHero) {
  els.pvHero.onerror = () => {
    const wrap = els.pvHero.closest('.hero');
    if (wrap) wrap.style.display = 'none';
  };
}

// ………… (fungsi admin: renderAdmin, loadData, tambah/edit saldo, edit dividen, history, revenue share — tetap sama) …………

// ===== PUBLIC VIEW =====
async function loadPublicById(id){
  try{
    const nas = await callPublicById(id); ensureLots(nas);
    if (typeof nas.dividen!=='number') nas.dividen=0;
    if (typeof nas.bonus==='number' && nas.bonus>0){ nas.dividen+=nas.bonus; nas.bonus=0; }

    const all = await callGet();
    const totalAll = (all.nasabah||[]).reduce((s,n)=>s+Number(n.saldo||0),0);

    // set alt hero pakai nama
    if (els.pvHero) els.pvHero.alt = `Tabungan ${nas.nama}`;

    els.pvTitle.textContent = `Halo, ${nas.nama}`;
    renderPublicHistory(nas.history||[]);
    updatePublicStats(nas, totalAll);

    const wa = (type, amount)=>{
      const nominal = parseNum(amount);
      const free = freeAmount(nas);
      const over = Math.max(0, nominal - free);
      const fee  = over>0 ? adminFee(over) : 0;
      const action = type==='add' ? 'Tambah Tabungan' : 'Tarik Tabungan';
      const msg = `Halo Mas Hepi, saya *${nas.nama}* (ID: ${nas.id}) ingin *${action}* sebesar *${fmt(nominal)}*.` +
        (type==='withdraw' && fee>0 ? ` Perkiraan biaya admin: *${fmt(fee)}*.` : '') +
        ` (Link: ${location.origin}/?id=${encodeURIComponent(nas.id)})`;
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

// ………… (router/login gate tetap sama) …………
