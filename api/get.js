// /api/get.js
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { JSONBIN_BASE, JSONBIN_BIN_ID, JSONBIN_MASTER_KEY } = process.env;
    if (!JSONBIN_BASE || !JSONBIN_BIN_ID || !JSONBIN_MASTER_KEY) {
      return res.status(500).json({ error: 'ENV_MISSING' });
    }

    const url = `${JSONBIN_BASE}/b/${JSONBIN_BIN_ID}/latest`;
    const r = await fetch(url, {
      headers: { 'X-Master-Key': JSONBIN_MASTER_KEY, 'Accept': 'application/json' }
    });
    const text = await r.text(); let j; try { j = JSON.parse(text); } catch { j = { raw: text }; }
    if (!r.ok) return res.status(r.status).json({ error: 'JSONBIN_GET_NON_200', detail: j });

    const record = j?.record || j;
    return res.status(200).json({ nasabah: Array.isArray(record?.nasabah) ? record.nasabah : [] });
  } catch (e) {
    return res.status(500).json({ error: 'FETCH_THROWN', message: e?.message || String(e) });
  }
}
