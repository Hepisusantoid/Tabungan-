export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { username, password } = body;
    const validUser = process.env.ADMIN_USER;
    const validPass = process.env.ADMIN_PASS;
    if (!validUser || !validPass)
      return res.status(500).json({ ok: false, message: 'Konfigurasi server tidak lengkap.' });
    if (username === validUser && password === validPass)
      return res.status(200).json({ ok: true });
    return res.status(401).json({ ok: false, message: 'Username atau password salah.' });
  } catch (e) {
    return res.status(500).json({ ok: false, message: e?.message || String(e) });
  }
}
