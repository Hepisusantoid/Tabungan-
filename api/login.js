// /api/login.js
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  // Baca beberapa kemungkinan nama ENV agar tidak nyangkut di penamaan
  const ADMIN_USER =
    process.env.ADMIN_USER || process.env.ADMIN_USERNAME || process.env.ADMIN_NAME;

  const ADMIN_PASS =
    process.env.ADMIN_PASS || process.env.ADMIN_PASSWORD || process.env.ADMIN_PWD;

  // Cek cepat dari browser: GET /api/login
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: false,
      message: 'Use POST to login',
      env: { ADMIN_USER: !!ADMIN_USER, ADMIN_PASS: !!ADMIN_PASS }
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  // Body bisa string/obj tergantung runtime
  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); }
  catch { body = {}; }

  if (!ADMIN_USER || !ADMIN_PASS) {
    return res.status(500).json({
      ok: false,
      message: 'ENV ADMIN_USER / ADMIN_PASS belum terbaca di Production.'
    });
  }

  const user = (body.username ?? body.user ?? '').toString().trim();
  const pass = (body.password ?? body.pass ?? '').toString();

  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    return res.status(200).json({ ok: true });
  }
  return res.status(401).json({ ok: false, message: 'Username atau password salah' });
}
