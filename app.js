/***** ========= APP.JS — FIX LOGIN + ROUTER PUBLIC ========= *****/

/* ===== Elemen penting ===== */
const els = {
  topbar: document.getElementById('topbar'),
  login: document.getElementById('login-section'),
  dash: document.getElementById('dashboard'),
  pv: document.getElementById('public-view'),

  btnLogin: document.getElementById('btnLogin'),
  loginMsg: document.getElementById('loginMsg'),
  btnLogout: document.getElementById('btnLogout'),
};

/* ===== Util kecil ===== */
function $(id){ return document.getElementById(id); }
const originURL = (location.origin || '').replace(/\/$/, '');
const params = new URLSearchParams(location.search);
const qId = params.get('id');           // ?id=ABC123 (tautan nasabah by ID)
const qName = params.get('n') || params.get('name'); // ?n=Nama (opsional)

/* ===== Auth Gate (global) ===== */
function isLogged(){ try { return localStorage.getItem('tabungan_logged') === '1'; } catch { return false; } }
function setLogged(v){ try { v ? localStorage.setItem('tabungan_logged','1') : localStorage.removeItem('tabungan_logged'); } catch {} }
function renderGate(){
  const ok = isLogged();
  if (els.login) els.login.style.display = ok ? 'none' : 'block';
  if (els.dash)  els.dash.style.display  = ok ? 'block' : 'none';

  // Kalau project kamu punya fungsi loadData() di file ini, otomatis dipanggil setelah login
  if (ok && typeof loadData === 'function') {
    try { loadData(); } catch {}
  }
}
window.renderGate = renderGate;  // <- penting supaya tidak "is not defined"

/* ===== Handler Login / Logout ===== */
els.btnLogin?.addEventListener('click', async () => {
  const u = ($('user')?.value || '').trim();
  const p = ($('pass')?.value || '').trim();

  if (!u || !p) { if (els.loginMsg) els.loginMsg.textContent = 'Isi username & password.'; return; }
  if (els.loginMsg) els.loginMsg.textContent = 'Memproses…';

  try {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });
    const text = await r.text();
    let j; try { j = JSON.parse(text); } catch { j = { ok:false, message:text }; }

    if (!r.ok || !j.ok) {
      if (els.loginMsg) els.loginMsg.textContent = j.message || `Login gagal (${r.status})`;
      return;
    }

    setLogged(true);
    if (els.loginMsg) els.loginMsg.textContent = 'Berhasil. Membuka dashboard…';
    renderGate();
  } catch (e) {
    if (els.loginMsg) els.loginMsg.textContent = 'Error login: ' + (e?.message || e);
  }
});

els.btnLogout?.addEventListener('click', () => { setLogged(false); renderGate(); });

/* ===== Router untuk tautan nasabah =====
   Jika URL punya ?id=... atau ?n=..., maka sembunyikan dashboard/login,
   tampilkan section public-view. Konten detil halaman publik tetap kamu
   render sendiri di #public-root (fungsi loadPublicById/Name opsional). */
function enterPublicMode(){
  if (els.topbar) els.topbar.style.display = 'none';
  if (els.login)  els.login.style.display  = 'none';
  if (els.dash)   els.dash.style.display   = 'none';
  if (els.pv)     els.pv.style.display     = 'block';

  if (typeof loadPublicById === 'function' && qId) {
    try { loadPublicById(qId); return; } catch {}
  }
  if (typeof loadPublicByName === 'function' && qName) {
    try { loadPublicByName(qName); return; } catch {}
  }
  // fallback teks sederhana
  const root = document.getElementById('public-root');
  if (root) root.innerHTML = '<p class="muted">Halaman publik siap. Tambahkan fungsi loadPublicById/Name di app.js jika diperlukan.</p>';
}

/* ===== Boot ===== */
if (qId || qName) {
  // mode tautan nasabah
  enterPublicMode();
} else {
  // mode admin
  renderGate();
}

/* ====== Catatan:
1) Kalau kamu punya kode fitur lain (dashboard nasabah, chart, dividen, dsb.)
   letakkan di bawah file ini atau di file lain — tidak bentrok dengan gate login.
2) Setiap deploy, ganti versi query di index.html:
   <script src="/app.js?v=YYYYMMDDxx"> agar tidak ke-cache.
====== */
