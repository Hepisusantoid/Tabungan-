// /api/login.js
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); }
  catch { body = {}; }

  const user = (body.username ?? body.user ?? '').toString();
  const pass = (body.password ?? body.pass ?? '').toString();

  const { ADMIN_USER, ADMIN_PASS } = process.env;
  if (!ADMIN_USER || !ADMIN_PASS) {
    return res.status(500).json({
      ok: false,
      message: 'ENV ADMIN_USER / ADMIN_PASS belum diset di Vercel (Production).'
    });
  }
  if (user === ADMIN_USER && pass === ADMIN_PASS) return res.status(200).json({ ok: true });
  return res.status(401).json({ ok: false, message: 'Username atau password salah' });
}
