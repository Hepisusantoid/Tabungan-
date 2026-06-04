export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { JSONBIN_BASE, JSONBIN_BIN_ID, JSONBIN_MASTER_KEY } = process.env;
  if (!JSONBIN_BASE || !JSONBIN_BIN_ID || !JSONBIN_MASTER_KEY)
    return res.status(500).json({ error: 'ENV_MISSING' });
  try {
    const r = await fetch(`${JSONBIN_BASE}/b/${JSONBIN_BIN_ID}/latest`, {
      headers: { 'X-Master-Key': JSONBIN_MASTER_KEY, Accept: 'application/json' }
    });
    const t = await r.text(); let j;
    try { j = JSON.parse(t); } catch { j = { raw: t }; }
    if (!r.ok) return res.status(r.status).json({ error: 'JSONBIN_ERROR', detail: j });
    const data = j?.record;
    if (!data || typeof data !== 'object') return res.status(200).json({ nasabah: [] });
    if (!Array.isArray(data.nasabah)) data.nasabah = [];
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'FETCH_ERROR', message: e?.message || String(e) });
  }
}
