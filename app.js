// ===== LOGIN =====
const btnLogin = document.getElementById('btnLogin');
const loginMsg = document.getElementById('loginMsg');

btnLogin?.addEventListener('click', async () => {
  const u = document.getElementById('user').value.trim();
  const p = document.getElementById('pass').value.trim();
  loginMsg.textContent = 'Memproses…';

  try {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });

    const text = await r.text();
    let j; try { j = JSON.parse(text); } catch { j = { ok: false, message: text }; }

    if (!r.ok || !j.ok) {
      loginMsg.textContent = j.message || `Login gagal (${r.status})`;
      return;
    }

    localStorage.setItem('tabungan_logged', '1');
    loginMsg.textContent = 'Berhasil. Membuka dashboard…';
    renderGate(); // <- fungsi yang menyembunyikan login & menampilkan dashboard
  } catch (e) {
    loginMsg.textContent = 'Error login: ' + (e?.message || e);
  }
});
