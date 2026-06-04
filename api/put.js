export default async function handler(req, res) {
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
  const { JSONBIN_BASE, JSONBIN_BIN_ID, JSONBIN_MASTER_KEY } = process.env;
  if (!JSONBIN_BASE || !JSONBIN_BIN_ID || !JSONBIN_MASTER_KEY)
    return res.status(500).json({ error: 'ENV_MISSING' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (!Array.isArray(body.nasabah)) body.nasabah = [];
    const r = await fetch(`${JSONBIN_BASE}/b/${JSONBIN_BIN_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Key': JSONBIN_MASTER_KEY,
        'X-Bin-Versioning': 'false'
      },
      body: JSON.stringify(body)
    });
    const t = await r.text(); let j;
    try { j = JSON.parse(t); } catch { j = { raw: t }; }
    if (!r.ok) return res.status(r.status).json({ error: 'JSONBIN_PUT_FAILED', detail: j });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'FETCH_ERROR', message: e?.message || String(e) });
  }
}
