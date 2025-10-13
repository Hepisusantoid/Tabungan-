export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { username, password } = body || {};
  const ok = username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS;
  if (!ok) return res.status(401).json({ ok: false, message: 'Login gagal' });
  res.status(200).json({ ok: true });
}
